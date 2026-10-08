import path from "path"
import fs from "fs"
import { readCoordinators, type CoordinatorRecord } from "./sessions.js"
import { readHiveState } from "./energy.js"

/**
 * WI-083 — HIVE-state overlay host half: the read-only snapshot builder for
 * `GET /api/hive-state/session`.
 *
 * Every field is a REAL dsh-hive-side record; nothing is synthesized:
 *   - awaken state ....... `.opencode/agents/hive-sessions.json` (lib/sessions.ts;
 *     absence from `coordinators` IS the dormant state — D1)
 *   - usage marks ........ `.opencode/agents/hive-state.json` usageLog
 *     (lib/energy.ts — one entry per markUsed, both surfaced ids)
 *   - dream consults ..... `.opencode/dreams/index/telemetry/<bare id>.jsonl`
 *     (the dream tools' per-session telemetry stream, one row per tool call)
 *   - dreams (ambient) ... `.opencode/dreams/active|history/DRM-NNN.yaml`
 *     (a minimal 4-field read: dream_id/entry_time/exit_time/status — dreams
 *     carry NO session identity on disk, so they are surfaced as WORKSPACE
 *     ambient facts, never attributed to the selected session)
 *   - lastTick ........... `.opencode/agents/hive-state.json` (the energy tick —
 *     also a workspace-level fact)
 *
 * What is deliberately NOT here: goal rounds and agent-run liveness — those
 * are LIVE process state (ctx.goals / ctx.agents), mixed in by the route
 * handler (lib/hive-state-route.ts) for live sessions only.
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
  /** Le replay of the awaken ledger — real timestamps, real preset name. */
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
  /** Workspace-level dream facts (NOT attributed to the session). */
  dreamAmbient: {
    activeCount: number
    active: Array<{ dreamId: string; entryTime: string }>
    recent: Array<{ dreamId: string; entryTime: string; exitTime: string | null; status: string }>
  }
  /** Last energy tick (workspace-level). */
  lastTick: string | null
  generated: string
}

export interface SnapshotLimits {
  /** Max rows per append-sequence list (oldest dropped when exceeded). */
  listCap?: number
  /** Max ambient dream history rows kept. */
  dreamHistoryCap?: number
}

const MINIMAL_LIMITS: Required<SnapshotLimits> = { listCap: 50, dreamHistoryCap: 4 }

const EMPTY_HIVE: SessionHiveSnapshot["hive"] = { isCoordinator: false }

/** The four scalar fields the ambient dream rows need, from a DRM yaml. */
function parseDreamHeader(raw: string): {
  dreamId: string
  entryTime: string
  exitTime: string | null
  status: string
} | null {
  const field = (name: string): string => {
    const m = raw.match(new RegExp(`^${name}:\\s*(.*?)\\s*$`, "m"))
    return m ? m[1].replace(/^"|"$/g, "") : ""
  }
  const dreamId = field("dream_id")
  if (!dreamId) return null
  const exit = field("exit_time")
  return {
    dreamId,
    entryTime: field("entry_time"),
    exitTime: exit === "null" || exit === "" ? null : exit,
    status: field("status") || "UNKNOWN",
  }
}

function listDreamYaml(dir: string, sub: string): NonNullable<ReturnType<typeof parseDreamHeader>>[] {
  try {
    const entries = fs.readdirSync(path.join(dir, ".opencode", "dreams", sub))
    const out: NonNullable<ReturnType<typeof parseDreamHeader>>[] = []
    for (const name of entries) {
      if (!/^DRM-\d+\.yaml$/.test(name)) continue
      try {
        const parsed = parseDreamHeader(fs.readFileSync(path.join(dir, ".opencode", "dreams", sub, name), "utf8"))
        if (parsed) out.push(parsed)
      } catch {
        // an unreadable DRM file skips, never throws
      }
    }
    return out
  } catch {
    return []
  }
}

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
  const { listCap, dreamHistoryCap } = { ...MINIMAL_LIMITS, ...limits }
  const idBare = bareId(sessionId)

  // ── awaken ledger (coordinators keyed BOTH by full id historically) ────────
  const coordinators = readCoordinators(directory) as Record<string, CoordinatorRecord>
  const record = coordinators[sessionId] ?? coordinators[idBare]
  const hive = record
    ? { isCoordinator: true, agent: record.agent, awakenedAt: record.awakenedAt, lastAwakenInput: record.lastAwakenInput }
    : { isCoordinator: false }

  // ── usage marks (join on EITHER id shape — both shapes exist in the wild) ──
  const state = readHiveState(directory)
  const usageAll = state.usageLog ?? []
  const usageMarks = usageAll
    .filter((e) => e.sessionId === sessionId || e.sessionId === idBare)
    .map((e) => ({ capability: e.capability, timestamp: e.timestamp }))

  // ── dream consults (telemetry rides the bare id) ───────────────────────────
  const dreamEventsAll = readDreamTelemetry(directory, idBare)

  // ── ambient dreams (workspace-level, never session-attributed) ─────────────
  const activeDreams = listDreamYaml(directory, "active").filter((d): d is NonNullable<typeof d> => d !== null)
  const historyDreams = listDreamYaml(directory, "history").filter((d): d is NonNullable<typeof d> => d !== null)
  const byEntryDesc = (a: { entryTime: string }, b: { entryTime: string }) =>
    new Date(b.entryTime || 0).getTime() - new Date(a.entryTime || 0).getTime()
  activeDreams.sort(byEntryDesc)
  historyDreams.sort(byEntryDesc)

  return {
    id: sessionId,
    idBare,
    workspace: path.basename(directory),
    hive,
    usageMarks: usageMarks.slice(-listCap),
    usageTotal: usageMarks.length,
    dreamEvents: dreamEventsAll.slice(-listCap),
    dreamEventTotal: dreamEventsAll.length,
    dreamAmbient: {
      activeCount: activeDreams.length,
      active: activeDreams.slice(0, dreamHistoryCap).map((d) => ({ dreamId: d.dreamId, entryTime: d.entryTime })),
      recent: historyDreams.slice(0, dreamHistoryCap).map((d) => ({
        dreamId: d.dreamId,
        entryTime: d.entryTime,
        exitTime: d.exitTime,
        status: d.status,
      })),
    },
    lastTick: state.lastTick ?? null,
    generated: new Date().toISOString(),
  }
}
