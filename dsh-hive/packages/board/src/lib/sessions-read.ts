/**
 * sessions-read.ts — the board's MINIMAL read-only view of the awaken ledger
 * (B4/D5). The `.opencode/agents/hive-sessions.json` ledger is OWNED AND
 * WRITTEN by @hive/dsh-evolution (its lib/sessions.ts is the only writer);
 * this module deliberately RE-READS the file instead: the board ships in
 * profiles where evolution's internals are not its dependency, and a writer
 * dependency would invert the layering (the gate needs a two-line boolean,
 * not the spawn/energy machinery).
 *
 * The shape contract is evolution's `{ v: 1, coordinators: Record<sessionId,
 * { agent, awakenedAt, lastAwakenInput }> }`, read IDENTICALLY tolerantly:
 * missing/corrupt/drifted file falls back to the EMPTY ledger so a broken
 * ledger reads as "nobody is awakened" (bind then refuses with the /awaken
 * hint — fail-closed, never fail-open, the same default as considering the
 * deny-mask in evolution's gate). `test/board-tools.test.mjs` pins the shape
 * against a ledger written in evolution's exact writer shape plus drifted
 * inputs, so a format change on the writer side fails HERE first.
 *
 * D1 reminder (why absence is the whole design): dormant sessions leave NO
 * ledger state — absence from `coordinators` IS the dormant state.
 */

import fs from "fs"
import path from "path"

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

export function sessionsPath(directory: string): string {
  return path.join(directory, ".opencode/agents/hive-sessions.json")
}

function readAll(directory: string): HiveSessions {
  try {
    const raw = JSON.parse(fs.readFileSync(sessionsPath(directory), "utf8"))
    if (raw && typeof raw === "object" && typeof raw.coordinators === "object" && raw.coordinators !== null) {
      return { v: 1, coordinators: raw.coordinators as HiveSessions["coordinators"] }
    }
    return EMPTY_SESSIONS
  } catch {
    return EMPTY_SESSIONS
  }
}

/**
 * All awakened coordinators, keyed by session id (read-only projection —
 * board is a READER; @hive/dsh-evolution/lib/sessions.ts owns the writes).
 */
export function readCoordinators(directory: string): Record<string, CoordinatorRecord> {
  return readAll(directory).coordinators
}

/** Whether a session has been /awakened (appears in the ledger at all, D1). */
export function isSessionAwakened(directory: string, sessionId: string): boolean {
  return readAll(directory).coordinators[sessionId] !== undefined
}
