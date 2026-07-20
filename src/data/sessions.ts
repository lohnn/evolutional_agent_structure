/**
 * Phase 1.5 — the one-time session back-fill mirror (DESIGN §6.a / §9, Q10/Q11).
 *
 * Shows pre-existing HIVE coordinator sessions as read-only "In Progress"
 * cards: full session enumeration ∩ `awakeSessions`, top-level only
 * (parentID absent — child/subagent sessions are never cards).
 *
 * ── Why the enumeration reads opencode's SQLite DB, not session.list() ──────
 * The ⛔ gating verification (2026-07-10, recorded as dream residue) found the
 * API enumeration provably INCOMPLETE, two ways:
 *   1. the documented 100-row default cap (real; liftable via an UNTYPED
 *      `?limit=` query param on raw GET /session — verified working);
 *   2. project_id scoping that NO parameter lifts: this workspace's sessions
 *      are split across two project_ids (opencode changed project identity on
 *      2026-06-23), and GET /session?directory=/workspace&limit=100000
 *      returns only the current project's 114 of 284 rows — including only
 *      14 of the 26 top-level awakened sessions the board must show.
 * The SQLite `session` table IS the persistence store, so reading it
 * (READ-ONLY) is the only provably-complete enumeration. Per-id
 * `session.get(id)` DOES resolve cross-project and remains the sanctioned
 * navigation/existence call for later phases.
 *
 * ── Lifecycle (I-143: bootstrap-only, no polling loop) ──────────────────────
 * The mirror is computed ONCE at startup and held in memory (the spec's
 * "computed at startup / ephemeral cache" option). No steady-state
 * enumeration; steady-state discovery arrives with Phase 2's awaken hook.
 * NOTHING is written to disk — board/WI-*.md storage is Phase 2 and belongs
 * to hive-infra's locked storage module.
 *
 * ── Stale-id semantics (W-061) ──────────────────────────────────────────────
 * awakeSessions ids never auto-expire and persisted sessions never drop out
 * of the DB. An awake id ABSENT from the enumeration = genuinely deleted →
 * excluded silently (this also drops the `ses_COORD_ACTIVE` placeholder).
 * An enumeration FAILURE (unreadable DB) is NOT deletion → degrade to
 * `available: false` and render nothing session-derived (unknown ≠ wrong).
 */
import { Database } from "bun:sqlite"
import * as fs from "node:fs"
import * as path from "node:path"
import type { BoardConfig } from "../config"

export interface SessionCard {
  id: string
  title: string
  created: string // ISO
  updated: string // ISO
  /** `<guiBaseUrl>/?session=<id>` deep link (navigation only — I-144). */
  openUrl: string
}

export interface SessionMirror {
  /** false ⇒ enumeration failed (DB unreadable) — unknown, NOT empty. */
  available: boolean
  computedAt: string
  /** Diagnostics for the intersection (rendered + cross-checkable). */
  totalPersisted: number
  awakeIds: number
  awakeDeleted: number
  cards: SessionCard[]
  /**
   * ALL persisted session ids in this workspace (not just awakened) — the
   * existence oracle for "Open session" links (SCHEMA §1a: enabled iff the
   * session is present here; absent = unknown, never "deleted").
   */
  persistedIds: string[]
  error?: string
}

interface DbSessionRow {
  id: string
  parent_id: string | null
  title: string
  time_created: number
  time_updated: number
  directory: string
}

function readAwakeSessions(opencodeDir: string): string[] {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(opencodeDir, "hivemind", ".nervous-system-state.json"), "utf8"),
    )
    return Array.isArray(raw.awakeSessions) ? raw.awakeSessions.map(String) : []
  } catch {
    return []
  }
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

export function computeSessionMirror(config: BoardConfig): SessionMirror {
  const computedAt = new Date().toISOString()
  const awake = readAwakeSessions(config.opencodeDir)

  let db: Database
  let rows: DbSessionRow[]
  try {
    db = new Database(config.opencodeDbPath, { readonly: true })
    try {
      // Directory scoping is applied DELIBERATELY (DESIGN §6.a): this board
      // instance mirrors only sessions of its own workspace.
      rows = db
        .query<DbSessionRow, [string]>(
          "SELECT id, parent_id, title, time_created, time_updated, directory FROM session WHERE directory = ?",
        )
        .all(config.workspaceRoot)
    } finally {
      db.close()
    }
  } catch (err) {
    return {
      available: false,
      computedAt,
      totalPersisted: 0,
      awakeIds: awake.length,
      awakeDeleted: 0,
      cards: [],
      persistedIds: [],
      error: `session enumeration unavailable: ${String(err)}`,
    }
  }

  const byId = new Map(rows.map((r) => [r.id, r]))
  const cards: SessionCard[] = []
  let awakeDeleted = 0
  for (const id of awake) {
    const row = byId.get(id)
    if (!row) {
      awakeDeleted++ // genuinely deleted (or placeholder) — exclude silently (W-061)
      continue
    }
    if (row.parent_id !== null) continue // child/subagent — never a card
    cards.push({
      id: row.id,
      title: row.title || "(untitled session)",
      created: iso(row.time_created),
      updated: iso(row.time_updated),
      openUrl: `${config.guiBaseUrl}/?session=${row.id}`,
    })
  }
  cards.sort((a, b) => b.updated.localeCompare(a.updated))

  return {
    available: true,
    computedAt,
    totalPersisted: rows.length,
    awakeIds: awake.length,
    awakeDeleted,
    cards,
    persistedIds: rows.map((r) => r.id),
  }
}
