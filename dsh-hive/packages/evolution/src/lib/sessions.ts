import path from "path"
import fs from "fs"

/**
 * The awaken ledger (T2/D1): which sessions are HIVE coordinators.
 *
 * D1 — activation is opt-in behind /awaken, and DORMANT SESSIONS LEAVE NO
 * STATE: only `/awaken` writes here, and only awakened sessions appear. There
 * is deliberately no "dormant registry" — absence from `coordinators` IS the
 * dormant state, so a reader can never mistake tool usage or passive listening
 * for activation (the false-positive concern that killed the model-called
 * `hive_awaken` chokepoint).
 *
 * The file rides in `<directory>/.opencode/agents/hive-sessions.json` next to
 * the other HIVE ledgers (hive-state.json, capabilities/). IO conventions
 * mirror `lib/energy.ts` EXACTLY: a path helper, a tolerant try/catch read
 * that falls back to the empty state, and a write that mkdir -p's the
 * directory and emits plain pretty-printed JSON. Cold resume re-reads this
 * file — agent/created refires on resume, and the gate re-applies doctrine or
 * the dormant restriction from what the ledger says (the plugin owns ALL
 * post-flip plumbing; the scoped world is rebuilt fresh per creation).
 */

export interface CoordinatorRecord {
  /** The agent preset the coordinator session runs under, or "unknown". */
  agent: string
  /** ISO timestamp of the /awaken flip. */
  awakenedAt: string
  /** The raw /awaken arguments the user supplied ("" when none). */
  lastAwakenInput: string
}

export interface HiveSessions {
  v: 1
  coordinators: Record<string, CoordinatorRecord>
}

const EMPTY_SESSIONS: HiveSessions = { v: 1, coordinators: {} }

function getSessionsPath(directory: string): string {
  return path.join(directory, ".opencode/agents/hive-sessions.json")
}

function readAll(directory: string): HiveSessions {
  try {
    const raw = JSON.parse(fs.readFileSync(getSessionsPath(directory), "utf8"))
    if (raw && typeof raw === "object" && typeof raw.coordinators === "object" && raw.coordinators !== null) {
      return { v: 1, coordinators: raw.coordinators as HiveSessions["coordinators"] }
    }
    return EMPTY_SESSIONS
  } catch {
    return EMPTY_SESSIONS
  }
}

/** All awakened coordinators, keyed by session id. Dormant sessions are absent (D1). */
export function readCoordinators(directory: string): Record<string, CoordinatorRecord> {
  return readAll(directory).coordinators
}

/** Record a /awaken flip. This is the ONLY mutation this module exposes. */
export function recordAwakened(directory: string, sessionId: string, agent: string, input: string): void {
  const state = readAll(directory)
  state.coordinators[sessionId] = {
    agent: agent || "unknown",
    awakenedAt: new Date().toISOString(),
    lastAwakenInput: input ?? "",
  }
  const sessionsPath = getSessionsPath(directory)
  fs.mkdirSync(path.dirname(sessionsPath), { recursive: true })
  fs.writeFileSync(sessionsPath, JSON.stringify(state, null, 2), "utf8")
}

/** Whether a session has been awakened (i.e. appears in the ledger at all, D1). */
export function isAwakened(directory: string, sessionId: string): boolean {
  return readAll(directory).coordinators[sessionId] !== undefined
}

/**
 * The gate decision matrix (pure, exported for testability):
 *
 * | delegationDepth   | awakened | decision  |
 * |-------------------|----------|-----------|
 * | > 0               | any      | "skip"    |
 * | absent / 0        | true     | "doctrine"|
 * | absent / 0        | false    | "deny"    |
 *
 * `skip` = exempt children: any agent with `delegationDepth > 0` is somebody's
 * child (a HIVE dispatch worker, a one-shot dreamcatcher consult that
 * REQUIRES the hive_dream_* tools, or a harness-native subagent) — participants
 * by lineage, never gated. The deny intentionally fires at depth 0 for native
 * subagents of a dormant session too: a top-level agent is indistinguishable
 * from a user session and gets the same absent-not-denied treatment. Depth
 * access: `agent.session.header.delegationDepth` (persisted on the session
 * header — a resumed child keeps its depth; a runtime-only check would reset
 * it to top-level on resume).
 */
export function decideGate(
  delegationDepth: number | undefined,
  awakened: boolean
): "doctrine" | "deny" | "skip" {
  if (delegationDepth !== undefined && delegationDepth > 0) return "skip"
  return awakened ? "doctrine" : "deny"
}
