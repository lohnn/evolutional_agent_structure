/**
 * hive-state-view.ts — WI-083 (v1.1) client view logic for the HIVE-state
 * overlay (dock pill + expandable LIFECYCLE timeline), shared by the bundled
 * websrc module and the node --test suite.
 *
 * NODE-FREE ON PURPOSE (I-192 class): this file compiles BOTH to dist (the
 * unit-testable lib face) and INTO the board client bundle (bun bundles the
 * relative import graph), so it must never import fs/path or a framework
 * package — string/number/array logic only. The DOM and fetch live in
 * websrc/hive-state.ts; the HOST-side snapshot lives in
 * @hive/dsh-evolution/lib/hive-state — this module is the CLIENT-side
 * projection of that payload.
 *
 * v1.1 (user decisions):
 *   - SESSION-ONLY scope: the workspace-level ambient rows v1 carried
 *     (dream DRM runs, energy ticks) are GONE from the timeline — no ambient
 *     section, no tagged compromise. Only this session's own records render.
 *   - LIFECYCLE story: rows are stage transitions (registered → awakened
 *     (tier) → working ⇄ idle → … → done) plus the milestones the session
 *     actually produced (goal rounds, children dispatched, its own
 *     dream-archive consults). Entering timestamp per row; duration-so-far
 *     on the stage currently active; the current stage stays in the header.
 *   - LIVE truth: the route carries the durable children catalog (with REAL
 *     dispatch timestamps) and a host-truth `live`/agents projection so the
 *     stage tone flips on server facts even when the page store is stale.
 *
 * Everything shown is REAL state from the read-only route
 * `/api/hive-state/session` (@hive/dsh-evolution) plus page-local live
 * facts from the `useSessions` standard provision (running state, title,
 * children rows) and page-observed flips, labeled `(observed)`.
 */

export const HIVE_STATE_URL = "/api/hive-state/session"

/** Route payload projection (only the fields the overlay reads). */
export interface HiveStatePayload {
  ok?: boolean
  generated?: string
  id?: string
  idBare?: string
  workspace?: string
  hive?: { isCoordinator?: boolean; agent?: string; awakenedAt?: string; lastAwakenInput?: string }
  goal?: {
    objective?: string
    status?: string
    roundsStarted?: number
    paused?: boolean
    disabled?: boolean
    createdAt?: string | null
    updatedAt?: string | null
    blockedReason?: string
  } | null
  goalReason?: string
  usageMarks?: Array<{ capability: string; timestamp: string }>
  dreamEvents?: Array<{ ts: string; tool: string }>
  /**
   * WI-085 — OWNER-ATTRIBUTED dreams for this session (begin-time
   * owner_session; SHADOW-027 fix). `active` non-empty ⟺ the dreaming
   * stage is REAL for this session. Pre-fix dreams carry no owner and
   * never appear here (never attributed, never backfilled).
   */
  dreams?: {
    active?: Array<{ dreamId: string; entryTime: string }>
    history?: Array<{ dreamId: string; entryTime: string; exitTime: string | null }>
  }
  children?: ChildEntryView[]
  childrenTotal?: number
  runningAgents?: number
  agents?: Array<{ id: string; status: string }>
  /** Host truth: is the SELECTED session live on this host right now? */
  live?: boolean
}

export interface ChildEntryView {
  id: string
  mode: string
  label?: string
  /** Catalog creation time = the real dispatch timestamp (ms epoch). */
  createdAtMs: number
  /** The capability the child was dispatched as, when a mark exists. */
  capability?: string
}

export interface SessionRowLike {
  id: string
  displayTitle?: string
  title?: string
  running?: boolean
  parentId?: string
  updatedAt?: number
}

/** The /api/hive-board/session-item payload projection (v1.2/v1.3). */
export interface SessionItemPairing {
  ok?: boolean
  item?: { id: string; title: string; status: string; priority: string } | null
  matchedBy?: string
  /** The resolved item's OWN transition history (latest first, capped). */
  history?: OwnedItemTransitionView[]
  historyTotal?: number
}

export interface OwnedItemTransitionView {
  at: string
  from: string | null
  to: string
  by: string
  session?: string
}

export interface SessionListLike {
  ids?: string[]
  byId?: Record<string, SessionRowLike>
}

export interface TimelineEvent {
  ts: string | null
  kind: string
  text: string
  /** Page-local observation — honest window labeling, never a durable claim. */
  observed?: boolean
}

/** Rows whose parent is the selected session and which are RUNNING right now. */
export function childrenInFlight(list: SessionListLike | undefined, sessionId: string): SessionRowLike[] {
  const out: SessionRowLike[] = []
  for (const row of Object.values(list?.byId ?? {})) {
    if (row && row.parentId === sessionId && row.running === true) out.push(row)
  }
  return out
}

/** Rows whose parent is the selected session (children the panel knows of). */
export function childrenKnown(list: SessionListLike | undefined, sessionId: string): SessionRowLike[] {
  const out: SessionRowLike[] = []
  for (const row of Object.values(list?.byId ?? {})) {
    if (row && row.parentId === sessionId) out.push(row)
  }
  return out
}

/**
 * The session-scoped REAL events of one payload: awaken transition, its
 * dispatch/registration marks, its own dream-archive consults, and its
 * children dispatches (durable catalog ✕ mark join — REAL timestamps).
 */
export function buildTimeline(p: HiveStatePayload | undefined): TimelineEvent[] {
  if (!p) return []
  const events: TimelineEvent[] = []
  const hive = p.hive
  if (hive?.isCoordinator) {
    const input = hive.lastAwakenInput ? ` — "${hive.lastAwakenInput}"` : ""
    events.push({ ts: hive.awakenedAt ?? null, kind: "awaken", text: `awakened as ${hive.agent ?? "unknown"}${input}` })
  }
  for (const m of p.usageMarks ?? []) {
    events.push({ ts: m.timestamp, kind: "registered", text: `registered — dispatched as ${m.capability}` })
  }
  for (const d of p.dreamEvents ?? []) events.push({ ts: d.ts, kind: "dream", text: `dream archive ${d.tool}` })
  for (const d of p.dreams?.history ?? []) {
    events.push({
      ts: d.entryTime,
      kind: "dream",
      text: `dreaming · ${d.dreamId} started${d.exitTime ? " · completed" : ""}`,
    })
  }
  for (const d of p.dreams?.active ?? []) {
    events.push({ ts: d.entryTime, kind: "dreaming", text: `dreaming · ${d.dreamId} (active)` })
  }
  for (const c of p.children ?? []) {
    const asWhom = c.capability ? ` as ${c.capability}` : ""
    const label = c.label ? ` — "${c.label}"` : ""
    events.push({
      ts: c.createdAtMs ? new Date(c.createdAtMs).toISOString() : null,
      kind: "dispatched",
      text: `child dispatched${asWhom}${label} (${c.mode})`,
    })
  }
  if (p.goal?.createdAt) {
    const rounds = typeof p.goal.roundsStarted === "number" ? `, round ${p.goal.roundsStarted}` : ""
    events.push({ ts: p.goal.createdAt, kind: "goal", text: `goal set · ${String(p.goal.status ?? "")}${rounds}` })
  }
  return events.sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime())
}

/** The honest current stage of the selected session. */
export type Stage = "working" | "dreaming" | "idle" | "awakened" | "registered" | "dormant" | "done"

export function currentStage(params: {
  payload: HiveStatePayload | undefined
  routeReachable: boolean
  pageRunning: boolean | undefined
}): { stage: Stage; tone: "live" | "dream" | "hive" | "ambient" | "unknown" } {
  const { payload, routeReachable, pageRunning } = params
  const hive = payload?.hive?.isCoordinator === true
  // Working = page truth OR host truth (either flip must move the tone).
  const running = pageRunning === true || (routeReachable && isSelfRunning(payload))
  if (running) return { stage: "working", tone: "live" }
  // DURABLE hive facts win over process liveness: a host restart disposes
  // every agent object without ending a single session, so `live:false`
  // alone can never mean "done" (observed live 2026-10-08 — the panel of a
  // pre-restart coordinator read done right after its host rebooted).
  // `done` is an OBSERVED milestone only (row removal / explicit end).
  if (payload === undefined) return { stage: "dormant", tone: "unknown" }
  // WI-085 — an ACTIVE owner-attributed dream IS the dreaming stage (real,
  // session-scoped; the completion's in-place rewrite keeps the owner).
  if ((payload.dreams?.active?.length ?? 0) > 0) return { stage: "dreaming", tone: "dream" }
  if (hive) return { stage: "awakened", tone: "hive" }
  if ((payload.usageMarks?.length ?? 0) > 0) return { stage: "registered", tone: "ambient" }
  if (payload.live === true) return { stage: "idle", tone: "ambient" }
  return { stage: "dormant", tone: "ambient" }
}

/** Host-registry truth for THIS session's running state. */
export function isSelfRunning(p: HiveStatePayload | undefined): boolean {
  if (!p) return false
  const bare = p.idBare
  for (const row of p.agents ?? []) {
    if (row.id === p.id || bareIdOf(row.id) === bare) return row.status === "running"
  }
  return false
}

function bareIdOf(id: string): string {
  return id.startsWith("session-") ? id.slice("session-".length) : id
}

/** "Working for 12m" style duration-so-far for the active stage. */
export function durationSince(ts: string | null | undefined, nowMs: number): string {
  if (!ts) return ""
  const ms = nowMs - new Date(ts).getTime()
  if (!isFinite(ms) || ms < 0) return ""
  if (ms < 45_000) return "seconds"
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`
  return `${Math.round(ms / 86_400_000)}d`
}

/**
 * WI-085 v1.3 — the resolved board item's OWN transitions as session-
 * attributed milestone rows. Durable BOARD facts (the item's history read
 * through the locked store's primitives); the session's STAGE never
 * derives from them (W-109 line: liveness ≠ done).
 */
export function buildItemTimeline(pairing: SessionItemPairing | undefined): TimelineEvent[] {
  if (!pairing || !Array.isArray(pairing.history)) return []
  return pairing.history.map((tr) => ({
    ts: tr.at,
    kind: "transition",
    text: `${tr.from === null || tr.from === undefined ? "∅" : tr.from} → ${tr.to} (by ${tr.by}${tr.session ? `, ${tr.session.slice(0, 12)}` : ""})`,
  }))
}

/** "2026-10-08 16:55" style stamp (UTC, tabular). */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toISOString().slice(0, 16).replace("T", " ")
}

/** Compact relative age for the same timestamp. */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const ms = Date.now() - new Date(iso).getTime()
  if (!isFinite(ms)) return ""
  if (ms < 45_000) return "now"
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}
