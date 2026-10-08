import type { Context } from "@deepseek-ai/cordis"
import { buildSessionHiveSnapshot, type SessionHiveSnapshot } from "./hive-state.js"

/**
 * WI-083 — the read-only HIVE-state route: `GET /api/hive-state/session?id=`.
 *
 * Registration form follows the in-cohort precedent EXACTLY (board tab route,
 * provider-usage form — the W-090 wait, never a hard inject): the plugin
 * mounts BEFORE webServer finishes booting, so `ctx.get('webServer')` at
 * apply time silently loads no routes; `ctx.registry.inject(["webServer"],…)`
 * defers until it exists, and on web-less profiles the callback never runs
 * while the rest of the service still boots.
 *
 * The agents/goals delegates ride the SAME wait pattern (board slice 3D):
 * registered on their own so the ledger/tab half of the payload works on
 * webless compositions too, degrading to `goalReason: "no-live-agent"`.
 *
 * Auth posture: mirrors the user-ratified read-only route precedent
 * (board-tab contract §5a, 2026-09-18) — no token check, like the twin
 * snapshot routes. Read-only: no HIVE ledgers are ever written here.
 */

/** Minimal structural faces of the host services the handler may read. */
interface AgentsServiceLike {
  list?: () => Array<{ id?: unknown; status?: unknown }> | undefined
  get?: (id: unknown) => unknown | undefined
}
interface GoalsServiceLike {
  get?: (agent: unknown) => GoalViewLike | undefined
}
interface GoalViewLike {
  objective?: string
  status?: string
  roundsStarted?: number
  paused?: boolean
  disabled?: boolean
  createdAt?: number
  updatedAt?: number
  blockedReason?: string
}
interface WebServerLike {
  register?: (route: { kind: string; path: string; handler: (req: unknown, res: unknown) => void }) => unknown
}

export interface LiveHiveFacts {
  goal: {
    objective: string
    status: string
    roundsStarted: number
    paused: boolean
    disabled: boolean
    createdAt: string | null
    updatedAt: string | null
    blockedReason?: string
  } | null
  /** When true the session has no LIVE agent — goal state is not observable. */
  goalReason?: "no-live-agent"
  /** Live agents registry rows projected to {id,status} for child liveness. */
  agents: Array<{ id: string; status: string }>
  runningAgents: number
}

/** The full route payload: ledger snapshot + live host facts. */
export type HiveSessionPayload = SessionHiveSnapshot & LiveHiveFacts & { ok: true }

const ID_SHAPE = /^[A-Za-z0-9._-]+$/

/**
 * Read the live goal + agent facts for one session id. Both reads are
 * best-effort and PURE (nothing here mutates the registries).
 */
export function readLiveFacts(
  agentsSvc: AgentsServiceLike | undefined,
  goalsSvc: GoalsServiceLike | undefined,
  sessionId: string,
): LiveHiveFacts {
  let agent: unknown
  try {
    agent = agentsSvc?.get?.(sessionId) ?? agentsSvc?.get?.(`session-${sessionId}`.replace(/^session-session-/, "session-"))
  } catch {
    agent = undefined
  }
  // Agents list → {id,status} projection (running count included).
  const agents: Array<{ id: string; status: string }> = []
  let runningAgents = 0
  try {
    for (const row of agentsSvc?.list?.() ?? []) {
      const id = String((row as { id?: unknown }).id ?? "")
      const status = String((row as { status?: unknown }).status ?? "unknown")
      agents.push({ id, status })
      if (status === "running") runningAgents += 1
    }
  } catch {
    // an agents list failure degrades to an empty projection, honestly sampled
  }

  let goal: LiveHiveFacts["goal"] = null
  let goalReason: LiveHiveFacts["goalReason"] | undefined
  if (agent === undefined || agent === null) {
    goalReason = "no-live-agent"
  } else {
    try {
      const view = goalsSvc?.get?.(agent)
      if (view) {
        goal = {
          objective: String(view.objective ?? ""),
          status: String(view.status ?? "unknown"),
          roundsStarted: typeof view.roundsStarted === "number" ? view.roundsStarted : 0,
          paused: view.paused === true,
          disabled: view.disabled === true,
          createdAt: typeof view.createdAt === "number" ? new Date(view.createdAt).toISOString() : null,
          updatedAt: typeof view.updatedAt === "number" ? new Date(view.updatedAt).toISOString() : null,
          ...(typeof view.blockedReason === "string" && view.blockedReason ? { blockedReason: view.blockedReason } : {}),
        }
      }
    } catch {
      // a goals read failure degrades to goal:null (still honest: no goal)
    }
  }
  return { goal, goalReason, agents, runningAgents }
}

/** The JSON body for one bad request — never a crash, always shaped. */
function badRequest(id: string, why: string): { ok: false; error: string; missing: string[] } {
  return { ok: false, error: why, missing: id ? [id] : [] }
}

/**
 * Register the route on a live host context. Call from the service
 * constructor; every failure degrades to logged warnings, never throws.
 */
export function registerHiveStateRoute(ctx: Context, directory: string): void {
  const response = (res: unknown, payload: unknown): void => {
    const r = res as { writeHead?: (code: number, headers: object) => void; end?: (body: string) => void }
    r.writeHead?.(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
    r.end?.(JSON.stringify(payload))
  }

  // Agents + goals ride their own TOP-LEVEL waits (the board precedent is
  // explicit: registered on their own, NOT nested inside the webServer wait —
  // a nested registry wait inside another wait's callback never fires its
  // route, observed live 2026-10-08). On profiles without them the callback
  // never runs and live facts degrade, honestly.
  let agentsSvc: AgentsServiceLike | undefined
  let goalsSvc: GoalsServiceLike | undefined
  ctx.registry.inject(["agents"], (agentsCtx: Context) => {
    const svc = agentsCtx.get("agents") as AgentsServiceLike | undefined
    if (svc) agentsSvc = svc
  })
  ctx.registry.inject(["goals"], (goalsCtx: Context) => {
    const svc = goalsCtx.get("goals") as GoalsServiceLike | undefined
    if (svc) goalsSvc = svc
  })

  ctx.registry.inject(["webServer"], (serverCtx: Context) => {
    const webServer = serverCtx.get("webServer") as WebServerLike | undefined
    if (!webServer || typeof webServer.register !== "function") {
      ctx.logger?.warn?.("[hive-state] webServer arrived without register — session route skipped")
      return
    }

    // Bind through an arrow wrapper — extracting `webServer.register` into a
    // local const DETACHES `this` and the real webServer.register reads
    // `this.exact`/`this.prefixes` (observed live as "Cannot read properties
    // of undefined (reading 'exact')" — 2026-10-08). Call as a method; the
    // non-null assertions are proven by the guard above.
    const server = webServer
    const registerRoute = (route: { kind: string; path: string; handler: (req: unknown, res: unknown) => void | Promise<void> }) =>
      server.register!(route)
    serverCtx.effect(
      () => {
        const registration = registerRoute({
          kind: "exact",
          path: "/api/hive-state/session",
          handler: async (req: unknown, res: unknown) => {
            let id = ""
            try {
              const raw = typeof (req as { url?: unknown })?.url === "string" ? (req as { url: string }).url : ""
              const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : ""
              id = decodeURIComponent(new URLSearchParams(query).get("id")?.trim() ?? "")
            } catch {
              id = ""
            }
            if (!id || !ID_SHAPE.test(id)) {
              response(res, badRequest(id, "missing or malformed id query parameter"))
              return
            }
            let payload: unknown
            try {
              const snapshot = buildSessionHiveSnapshot(directory, id)
              const live = readLiveFacts(agentsSvc, goalsSvc, id)
              payload = { ...snapshot, ...live, ok: true }
            } catch (e) {
              payload = { ok: false, error: String((e as Error)?.message ?? e) }
            }
            response(res, payload)
          },
        })
        return registration as () => void
      },
      "hive-state session route",
    )
    ctx.logger?.info?.("[hive-state] session route registered at /api/hive-state/session")
  })
}
