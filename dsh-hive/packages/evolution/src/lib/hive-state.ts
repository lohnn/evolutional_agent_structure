import path from "path"
import fs from "fs"
import { readCoordinators, type CoordinatorRecord } from "./sessions.js"
import { readHiveState } from "./energy.js"

/**
 * WI-083 (v1.1) — HIVE-state overlay host half: the SESSION-SCOPEd snapshot
 * builder for `GET /api/hive-state/session`.
 *
 * Every field is a REAL dsh-hive-side record; nothing is synthesized:
 *   - awaken state ....... `.opencode/agents/hive-sessions.json` (lib/sessions.ts;
 *     absence from `coordinators` IS the dormant state — D1)
 *   - usage marks ........ `.opencode/agents/hive-state.json` usageLog
 *     (lib/energy.ts — one entry per markUsed; a child's mark is its dispatch
 *     registration, so the route joins children × marks for milestones)
 *   - dream consults ..... `.opencode/dreams/index/telemetry/<bare id>.jsonl`
 *     (the dream tools' per-session telemetry stream, one row per tool call)
 *
 * v1.1 scope note (user decision): the panel is THIS-SESSION-ONLY. The
 * workspace-level ambient rows v1 carried (dream DRM runs + energy ticks)
 * are GONE — they belong to other observability surfaces (WI-067/WI-080),
 * not to a session's lifecycle story. Live host facts (goal rounds, the
 * agents-registry projection, the direct-children catalog) are mixed in by
 * the route handler (lib/hive-state-route.ts) for live sessions.
 *
 * IO conventions mirror lib/sessions.ts and lib/energy.ts exactly: tolerant
 * try/catch reads that fall back to empty absences; reads never throw.
 * Session-id normalization: the ledgers stamp ids in TWO shapes
 * (coordinators full "session-<uuid>", usageLog/telemetry bare "<uuid>"), so
 * every comparison goes through bareId().
 */

/** Strip the "session-" prefix from either id shape (idempotent). */
export function bareId(sessionId: string): string {
  return sessionId.startsWith("session-") ? sessionId.slice("session-".length) : sessionId
}

export interface SessionHiveSnapshot {
  /** The id as the client asked it. */
  id: string
  /** The normalized (prefix-stripped) id the ledgers join on. */
  idBare: string
  /** WORKSPACE NAME — for the UI header (no directory path leakage). */
  workspace: string
  /** The replay of the awaken ledger — real timestamps, real preset name. */
  hive: {
    isCoordinator: boolean
    agent?: string
    awakenedAt?: string
    lastAwakenInput?: string
  }
  /** markUsed entries for THIS session, ascending. */
  usageMarks: Array<{ capability: string; timestamp: string }>
  usageTotal: number
  /** Dream-archive tool calls recorded for THIS session, ascending. */
  dreamEvents: Array<{ ts: string; tool: string }>
  dreamEventTotal: number
  generated: string
}

export interface SnapshotLimits {
  /** Max rows per append-sequence list (oldest dropped when exceeded). */
  listCap?: number
}

const MINIMAL_LIMITS: Required<SnapshotLimits> = { listCap: 50 }

function readDreamTelemetry(directory: string, idBare: string): Array<{ ts: string; tool: string }> {
  const file = path.join(directory, ".opencode", "dreams", "index", "telemetry", `${idBare}.jsonl`)
  try {
    const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean)
    const out: Array<{ ts: string; tool: string }> = []
    for (const line of lines) {
      try {
        const row = JSON.parse(line) as { ts?: unknown; tool?: unknown }
        if (typeof row.ts === "string" && typeof row.tool === "string") out.push({ ts: row.ts, tool: row.tool })
      } catch {
        // an unparsable telemetry line skips, never throws
      }
    }
    return out
  } catch {
    return []
  }
}

export function buildSessionHiveSnapshot(
  directory: string,
  sessionId: string,
  limits: SnapshotLimits = {},
): SessionHiveSnapshot {
  const { listCap } = { ...MINIMAL_LIMITS, ...limits }
  const idBare = bareId(sessionId)

  // ── awaken ledger — join ANY id shape (full, bare, re-prefixed) ─────────────
  const coordinators = readCoordinators(directory) as Record<string, CoordinatorRecord>
  const idVariants = [...new Set([sessionId, idBare, `session-${idBare}`])]
  let record: CoordinatorRecord | undefined
  for (const variant of idVariants) {
    if (coordinators[variant] !== undefined) {
      record = coordinators[variant]
      break
    }
  }
  const hive = record
    ? { isCoordinator: true, agent: record.agent, awakenedAt: record.awakenedAt, lastAwakenInput: record.lastAwakenInput }
    : { isCoordinator: false }

  // ── usage marks (join on ANY id shape — both shapes exist in the wild) ──────
  const state = readHiveState(directory)
  const usageAll = state.usageLog ?? []
  const usageMarks = usageAll
    .filter((e) => idVariants.includes(e.sessionId))
    .map((e) => ({ capability: e.capability, timestamp: e.timestamp }))

  // ── dream consults (telemetry rides the bare id) ───────────────────────────
  const dreamEventsAll = readDreamTelemetry(directory, idBare)

  return {
    id: sessionId,
    idBare,
    workspace: path.basename(directory),
    hive,
    usageMarks: usageMarks.slice(-listCap),
    usageTotal: usageMarks.length,
    dreamEvents: dreamEventsAll.slice(-listCap),
    dreamEventTotal: dreamEventsAll.length,
    generated: new Date().toISOString(),
  }
}

/**
 * v1.1 — direct-children assembly: join the subagents catalog (durable
 * {id, createdAt, mode, label}) with this session's usageLog to flavor each
 * child with the capability it was dispatched as. Marks attribute to the
 * CHILD's id (markUsed(target, start.childId)), so the join is the only way
 * a parent's story shows its own dispatches.
 */
export interface ChildEntry {
  id: string
  mode: string
  label?: string
  /** Catalog creation time = the real dispatch timestamp (ms epoch). */
  createdAtMs: number
  /** The capability the child was dispatched as, when a mark exists. */
  capability?: string
}

export function assembleChildren(
  entries: Array<Record<string, unknown>>,
  usageAll: Array<{ capability: string; sessionId: string; timestamp: string }>,
  parentSessionId: string,
  limits: SnapshotLimits = {},
): { children: ChildEntry[]; total: number } {
  const { listCap } = { ...MINIMAL_LIMITS, ...limits }
  const bare = bareId(parentSessionId)
  const parentVariants = new Set([parentSessionId, bare, `session-${bare}`])
  const capabilityByChild = new Map<string, { capability: string; timestamp: string }>()
  for (const m of usageAll) {
    if (parentVariants.has(m.sessionId)) continue // the parent's own mark is its registration, not a dispatch
    capabilityByChild.set(bareId(m.sessionId), { capability: m.capability, timestamp: m.timestamp })
  }
  const children: ChildEntry[] = []
  for (const entry of entries ?? []) {
    const id = typeof entry.id === "string" ? String(entry.id) : ""
    if (!id) continue
    const flavor = capabilityByChild.get(bareId(id)) ?? capabilityByChild.get(id)
    children.push({
      id,
      mode: typeof entry.mode === "string" ? entry.mode : "unknown",
      ...(typeof entry.label === "string" && entry.label ? { label: entry.label } : {}),
      createdAtMs: typeof entry.createdAt === "number" ? entry.createdAt : 0,
      ...(flavor ? { capability: flavor.capability } : {}),
    })
  }
  // Catalog order is parent-owned and stable; oldest dispatch first.
  children.sort((a, b) => a.createdAtMs - b.createdAtMs)
  return { children: children.slice(-listCap), total: children.length }
}
