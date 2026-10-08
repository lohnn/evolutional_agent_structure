/**
 * hive-state-view.ts — WI-083 client view logic for the HIVE-state overlay
 * (dock pill + expandable timeline), shared by the BUNDLED websrc module and
 * the node --test suite.
 *
 * NODE-FREE ON PURPOSE (I-192 class): this file compiles BOTH to dist (the
 * unit-testable lib face) and INTO the board client bundle (bun bundles the
 * relative import graph), so it must never import fs/path or a framework
 * package — string/number/array logic only. The DOM and fetch live in
 * websrc/hive-state.ts; the HOST-side snapshot lives in
 * @hive/dsh-evolution/lib/hive-state — this module is the CLIENT-side
 * projection of that payload.
 *
 * Everything the timeline shows is REAL state from the read-only route
 * `/api/hive-state/session` (@hive/dsh-evolution): the awaken ledger,
 * markUsed activity marks, per-session dream telemetry, ambient DRM files,
 * the live goal, and the agents registry projection — plus the page-local
 * `useSessions` standard-provision facts (running state, title, children)
 * and observed running flips, labeled `(observed live)`.
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
  dreamAmbient?: {
    activeCount?: number
    active?: Array<{ dreamId: string; entryTime: string }>
    recent?: Array<{ dreamId: string; entryTime: string; exitTime: string | null; status: string }>
  }
  lastTick?: string | null
  runningAgents?: number
  agents?: Array<{ id: string; status: string }>
  usageTotal?: number
  dreamEventTotal?: number
}

export interface SessionRowLike {
  id: string
  displayTitle?: string
  title?: string
  running?: boolean
  parentId?: string
  updatedAt?: number
}

export interface SessionListLike {
  ids?: string[]
  byId?: Record<string, SessionRowLike>
}

export interface TimelineEvent {
  ts: string | null
  kind: string
  text: string
  /** Workspace-level fact (dreams, ticks) — never attributed to the session. */
  ambient?: boolean
  /** Page-local observation (W-099 discipline: the timeline MUST MOVE). */
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

/** Merge every REAL record the payload carries into one descend-sorted timeline. */
export function buildTimeline(p: HiveStatePayload | undefined): TimelineEvent[] {
  if (!p) return []
  const events: TimelineEvent[] = []
  const hive = p.hive
  if (hive?.isCoordinator) {
    const input = hive.lastAwakenInput ? ` — "${hive.lastAwakenInput}"` : ""
    events.push({ ts: hive.awakenedAt ?? null, kind: "awaken", text: `awakened as ${hive.agent ?? "unknown"}${input}` })
  }
  if (p.goal?.createdAt) {
    const rounds = typeof p.goal.roundsStarted === "number" ? `, round ${p.goal.roundsStarted}` : ""
    events.push({ ts: p.goal.createdAt, kind: "goal", text: `goal set · ${String(p.goal.status ?? "")}${rounds}` })
  }
  for (const m of p.usageMarks ?? []) events.push({ ts: m.timestamp, kind: "used", text: `activity marked: ${m.capability}` })
  for (const d of p.dreamEvents ?? []) events.push({ ts: d.ts, kind: "dream", text: `dream archive ${d.tool}` })
  for (const a of p.dreamAmbient?.active ?? [])
    events.push({ ts: a.entryTime, kind: "dream", text: `dream ${a.dreamId} became active (workspace)`, ambient: true })
  for (const r of p.dreamAmbient?.recent ?? []) {
    const done = r.exitTime ? "" : " — completed"
    events.push({
      ts: r.entryTime,
      kind: "dream",
      text: `dream ${r.dreamId} started · ${String(r.status ?? "").toLowerCase()}${done} (workspace)`,
      ambient: true,
    })
  }
  if (p.lastTick) events.push({ ts: p.lastTick, kind: "tick", text: "energy tick (workspace)", ambient: true })
  return events.sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime())
}

/** Pill headline state: the honest one-word verdict for the selected session. */
export function pillState(
  p: HiveStatePayload | undefined,
  running: boolean | undefined,
): { word: string; tone: "hive" | "ambient" | "unknown" } {
  if (p === undefined) return { word: "…", tone: "unknown" }
  if (running === true) return { word: "working", tone: p.hive?.isCoordinator === true ? "hive" : "ambient" }
  if (p.hive?.isCoordinator === true) return { word: "awakened", tone: "hive" }
  return { word: "ambient", tone: "ambient" }
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
