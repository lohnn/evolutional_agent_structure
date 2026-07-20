/**
 * SQLite + filesystem access for the board reconciler (Phase 5). Kept separate
 * from board-reconcile.ts so the pure extraction/planning logic stays testable
 * with synthetic rows and no DB dependency.
 *
 * Read-only against the live WAL-mode opencode.db (bun:sqlite {readonly:true} —
 * safe concurrent reads, the Q14 pattern). The DRM cross-check and artifact
 * copy go through the published dream-state parser (never a second YAML impl,
 * SHADOW-005).
 */

import { Database } from "bun:sqlite"
import fs from "fs"
import os from "os"
import path from "path"
import {
  extractDreamCalls,
  buildSessionDreamMap,
  planReconcile,
  makeDrmCompleteCheck,
  makeDrmArtifacts,
  type PartRow,
  type SessionInfo,
  type SessionDream,
  type ReconcilePlan,
} from "./board-reconcile.js"
import { listItems } from "./board-store.js"

/** Default location of opencode's SQLite store. Overridable for tests/config. */
export function defaultDbPath(): string {
  return path.join(os.homedir(), ".local/share/opencode/opencode.db")
}

/**
 * Read genuine dream tool-call parts and fold into the session→DRM map. Filters
 * on json_extract(data,'$.tool') in SQL (the false-positive-safe filter), then
 * re-validates in extractDreamCalls (data.type=='tool').
 */
export function readSessionDreamMap(dbPath: string): Map<string, SessionDream[]> {
  const db = new Database(dbPath, { readonly: true })
  try {
    const rows = db
      .query(
        "SELECT session_id, time_created, data FROM part " +
          "WHERE json_extract(data, '$.tool') IN ('hive_dream_begin', 'hive_dream_complete')"
      )
      .all() as { session_id: string; time_created: number; data: string }[]
    const partRows: PartRow[] = rows.map((r) => ({
      session_id: r.session_id,
      time_created: r.time_created,
      data: r.data,
    }))
    return buildSessionDreamMap(extractDreamCalls(partRows))
  } finally {
    db.close()
  }
}

/**
 * Enumerate awakened TOP-LEVEL sessions: SQLite session set ∩ awakeSessions,
 * parent_id absent. Titles come from the session row (already on disk — no
 * per-id session.get needed for the back-fill). groupID from the state file's
 * session map when present. Provably complete because it reads the persistence
 * store directly (Q14).
 */
export function enumerateAwakeTopLevel(dbPath: string, directory: string): SessionInfo[] {
  const { awake, groupOf } = readNervousState(directory)
  if (awake.size === 0) return []

  const db = new Database(dbPath, { readonly: true })
  try {
    const rows = db.query("SELECT id, parent_id, title FROM session").all() as {
      id: string
      parent_id: string | null
      title: string | null
    }[]
    const out: SessionInfo[] = []
    for (const r of rows) {
      if (!awake.has(r.id)) continue
      if (r.parent_id) continue // top-level only
      out.push({
        id: r.id,
        title: r.title && r.title.trim() !== "" ? r.title : `Session ${r.id}`,
        parentID: r.parent_id,
        groupID: groupOf.get(r.id) ?? r.id,
      })
    }
    return out
  } finally {
    db.close()
  }
}

/** Read awakeSessions + the session→groupID map from .nervous-system-state.json. */
export function readNervousState(directory: string): { awake: Set<string>; groupOf: Map<string, string> } {
  const p = path.join(directory, ".opencode/hivemind/.nervous-system-state.json")
  const awake = new Set<string>()
  const groupOf = new Map<string, string>()
  try {
    const state = JSON.parse(fs.readFileSync(p, "utf8")) as {
      awakeSessions?: string[]
      sessions?: { id: string; groupID?: string }[]
    }
    for (const id of state.awakeSessions ?? []) awake.add(id)
    for (const s of state.sessions ?? []) if (s.groupID) groupOf.set(s.id, s.groupID)
  } catch {
    // no state file → nothing awake → empty plan (safe)
  }
  return { awake, groupOf }
}

/** Build the full reconcile plan from live DB + files (no writes). */
export function buildLivePlan(directory: string, dbPath: string): ReconcilePlan {
  const sessions = enumerateAwakeTopLevel(dbPath, directory)
  const dreamMap = readSessionDreamMap(dbPath)
  const existing = listItems(directory)
  return planReconcile(
    sessions,
    dreamMap,
    existing,
    makeDrmCompleteCheck(directory),
    makeDrmArtifacts(directory)
  )
}
