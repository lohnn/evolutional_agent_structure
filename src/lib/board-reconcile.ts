/**
 * hive-board one-time back-fill reconciler (Phase 5 opener).
 *
 * Retroactively populates .opencode/board/ with the workspace's REAL session
 * history, using a PROVABLE session↔DRM link recovered from opencode's stored
 * transcript (the `part` table of opencode.db). Every card carries a real
 * provable basis (W-030/W-077): a session becomes Done only when its
 * hive_dream_complete tool call is in the transcript AND the DRM file is
 * status COMPLETE — belt and braces. begin-without-complete → In Progress,
 * never Done.
 *
 * Ground truth (verified live 2026-07-20, re-verify per W-077 before trusting):
 *   - part(id, message_id, session_id, time_created, time_updated, data), data is JSON.
 *   - A real dream call has data.type=='tool' AND data.tool in
 *     {hive_dream_begin, hive_dream_complete}. FILTER ON data.tool — never
 *     text-match "DRM-"/"hive_dream" (subagent task calls discuss the dream
 *     system and produce 154 false positives vs 60 real calls).
 *   - The DRM id lives in data.state.output:
 *       begin:    "Dream DRM-NNN opened (status: DREAMING)..."
 *       complete: "Dream DRM-NNN completed.\n  Status: COMPLETE..."
 *
 * The pure extraction/mapping logic here is DB-agnostic (takes rows); the SQLite
 * open + query live in board-reconcile-db.ts so this module stays hermetically
 * testable with synthetic rows.
 */

import { readDreamState, historyDreamPath } from "./dream-state.js"
import {
  listItems,
  today,
  nowIso,
  type WorkItem,
  type Transition,
} from "./board-store.js"
import { createItemUnlocked, withBoardLock } from "./board-store.js"

// ── Transcript extraction (pure) ──────────────────────────────────────────────

/** A raw part row as read from opencode.db (only the fields we use). */
export interface PartRow {
  session_id: string
  time_created: number
  /** JSON string from the `data` column */
  data: string
}

export type DreamTool = "hive_dream_begin" | "hive_dream_complete"

export interface DreamCall {
  sessionID: string
  tool: DreamTool
  drm: string
  at: number
}

/** Parse "DRM-NNN" out of a tool's state.output string. */
export function parseDrmFromOutput(output: string): string | null {
  const m = output.match(/\bDRM-(\d+)\b/)
  return m ? `DRM-${m[1]}` : null
}

/**
 * Extract genuine dream tool calls from raw part rows. Filters STRICTLY on
 * data.type=='tool' && data.tool in {begin,complete} (the false-positive fix),
 * then parses the DRM id from data.state.output specifically.
 */
export function extractDreamCalls(rows: PartRow[]): DreamCall[] {
  const calls: DreamCall[] = []
  for (const row of rows) {
    let data: unknown
    try {
      data = JSON.parse(row.data)
    } catch {
      continue
    }
    if (typeof data !== "object" || data === null) continue
    const d = data as { type?: unknown; tool?: unknown; state?: { output?: unknown } }
    if (d.type !== "tool") continue
    if (d.tool !== "hive_dream_begin" && d.tool !== "hive_dream_complete") continue
    const output = typeof d.state?.output === "string" ? d.state.output : ""
    const drm = parseDrmFromOutput(output)
    if (!drm) continue
    calls.push({ sessionID: row.session_id, tool: d.tool, drm, at: row.time_created })
  }
  return calls
}

// ── Session → DRM map ─────────────────────────────────────────────────────────

export interface SessionDream {
  drm: string
  /** a hive_dream_complete call for this DRM exists in the transcript */
  completed: boolean
  /** time of the defining call (complete if present, else begin) — for ordering */
  at: number
}

/**
 * Fold dream calls into { sessionID -> SessionDream[] }. A DRM is `completed`
 * iff a hive_dream_complete call named it (transcript evidence). A session may
 * have several DRMs (multi-dream sessions are real). Sorted by `at` ascending
 * so the LAST completed DRM is the Done-defining one.
 */
export function buildSessionDreamMap(calls: DreamCall[]): Map<string, SessionDream[]> {
  // sessionID -> drm -> { begin?, complete? }
  const nested = new Map<string, Map<string, { beginAt?: number; completeAt?: number }>>()
  for (const c of calls) {
    let byDrm = nested.get(c.sessionID)
    if (!byDrm) {
      byDrm = new Map()
      nested.set(c.sessionID, byDrm)
    }
    let e = byDrm.get(c.drm)
    if (!e) {
      e = {}
      byDrm.set(c.drm, e)
    }
    if (c.tool === "hive_dream_begin") e.beginAt = Math.min(e.beginAt ?? c.at, c.at)
    else e.completeAt = Math.max(e.completeAt ?? c.at, c.at)
  }
  const out = new Map<string, SessionDream[]>()
  for (const [sid, byDrm] of nested) {
    const dreams: SessionDream[] = []
    for (const [drm, e] of byDrm) {
      const completed = e.completeAt !== undefined
      dreams.push({ drm, completed, at: completed ? e.completeAt! : (e.beginAt ?? 0) })
    }
    dreams.sort((a, b) => a.at - b.at)
    out.set(sid, dreams)
  }
  return out
}

// ── Session universe ──────────────────────────────────────────────────────────

/** A candidate session for reconciliation (top-level, awakened). */
export interface SessionInfo {
  id: string
  title: string
  /** null / absent for top-level sessions */
  parentID: string | null
  groupID?: string | null
}

// ── Reconciliation plan (pure decision, no writes) ───────────────────────────

export interface PlannedCard {
  sessionID: string
  title: string
  groupID: string | null
  status: "in_progress" | "done"
  /** the Done-defining DRM (latest COMPLETE), or null for In Progress */
  dreamID: string | null
  /** all COMPLETE DRMs (lineage preserved even when >1) */
  completedDreams: string[]
  /** DRMs begun-but-not-completed in the transcript (evidence for In Progress) */
  incompleteDreams: string[]
  /** artifact ids copied from the Done-defining DRM (portability §4.a) */
  artifacts: string[]
  /** why this basis is provable — recorded for the report/provenance */
  basis: string
}

export type SkipReason = "already-owned" | "tombstoned" | "no-drm-file" | "not-awake"

export interface SkippedSession {
  sessionID: string
  reason: SkipReason
  detail: string
}

export interface ReconcilePlan {
  cards: PlannedCard[]
  skipped: SkippedSession[]
}

/**
 * Decide what cards to create — PURE, no writes. Cross-checks the transcript
 * (completed flag) against the DRM file state via `drmIsComplete`, so a Done is
 * only planned when BOTH agree.
 */
export function planReconcile(
  sessions: SessionInfo[],
  dreamMap: Map<string, SessionDream[]>,
  existing: WorkItem[],
  drmIsComplete: (drm: string) => boolean,
  drmArtifacts: (drm: string) => string[]
): ReconcilePlan {
  const ownedSessions = new Set(existing.map((i) => i.owner_session).filter((s): s is string => s !== null))
  const tombstoned = new Set(existing.flatMap((i) => i.released_sessions))

  const cards: PlannedCard[] = []
  const skipped: SkippedSession[] = []

  for (const s of sessions) {
    if (s.parentID) continue // never card a child session
    if (ownedSessions.has(s.id)) {
      skipped.push({ sessionID: s.id, reason: "already-owned", detail: "session already owns a work item" })
      continue
    }
    if (tombstoned.has(s.id)) {
      skipped.push({ sessionID: s.id, reason: "tombstoned", detail: "session tombstoned in released_sessions[]" })
      continue
    }

    const dreams = dreamMap.get(s.id) ?? []
    // Done-eligible DRMs: transcript says complete AND the DRM file confirms COMPLETE
    const completedDreams = dreams.filter((d) => d.completed && drmIsComplete(d.drm))
    const incompleteDreams = dreams
      .filter((d) => !(d.completed && drmIsComplete(d.drm)))
      .map((d) => d.drm)

    if (completedDreams.length > 0) {
      // latest COMPLETE is the Done-defining dream_id; earlier ones are lineage
      const defining = completedDreams[completedDreams.length - 1]!.drm
      const artifacts = drmArtifacts(defining)
      cards.push({
        sessionID: s.id,
        title: s.title,
        groupID: s.groupID ?? s.id,
        status: "done",
        dreamID: defining,
        completedDreams: completedDreams.map((d) => d.drm),
        incompleteDreams,
        artifacts,
        basis: `transcript hive_dream_complete + DRM file COMPLETE for ${completedDreams.map((d) => d.drm).join(", ")}`,
      })
    } else {
      cards.push({
        sessionID: s.id,
        title: s.title,
        groupID: s.groupID ?? s.id,
        status: "in_progress",
        dreamID: null,
        completedDreams: [],
        incompleteDreams,
        artifacts: [],
        basis:
          incompleteDreams.length > 0
            ? `awakened session with begun-but-uncompleted dream(s) ${incompleteDreams.join(", ")} — live/paused, not Done`
            : "awakened top-level session, no completed dream — live/paused",
      })
    }
  }

  return { cards, skipped }
}

// ── DRM cross-check helpers (bound to the real dream parsers) ────────────────

/** True iff dreams/history/DRM-NNN.yaml exists and is status COMPLETE. */
export function makeDrmCompleteCheck(directory: string): (drm: string) => boolean {
  const cache = new Map<string, boolean>()
  return (drm: string): boolean => {
    const hit = cache.get(drm)
    if (hit !== undefined) return hit
    let complete = false
    try {
      complete = readDreamState(historyDreamPath(directory, drm)).status === "COMPLETE"
    } catch {
      complete = false // no history file → not Done-eligible (belt and braces)
    }
    cache.set(drm, complete)
    return complete
  }
}

/** Artifact ids linked on a COMPLETE DRM (read via the published dream parser). */
export function makeDrmArtifacts(directory: string): (drm: string) => string[] {
  return (drm: string): string[] => {
    try {
      const d = readDreamState(historyDreamPath(directory, drm))
      return [...d.insights, ...d.warnings, ...d.songlines, ...d.shadows]
    } catch {
      return []
    }
  }
}

// ── Human-readable report (shared by the /reconcile command + any caller) ────

/**
 * Format a plan (+optional execution result) as a human-readable table. Single
 * owner of the report shape so the slash command and any future caller render
 * identically. `result` present ⇒ post-execution summary; absent ⇒ dry-run.
 */
export function formatReconcileReport(plan: ReconcilePlan, result?: ReconcileResult): string {
  const done = plan.cards.filter((c) => c.status === "done")
  const inProgress = plan.cards.filter((c) => c.status === "in_progress")
  const wrote = result !== undefined && result.dryRun === false
  const lines: string[] = []

  lines.push(
    `${wrote ? "RECONCILE EXECUTED — cards written." : "DRY RUN — no writes."} ` +
      `${plan.cards.length} card(s) ${wrote ? "created" : "planned"} ` +
      `(${done.length} Done, ${inProgress.length} In Progress); ${plan.skipped.length} skipped (already-owned / tombstoned — safe to re-run).`
  )

  if (done.length > 0) {
    lines.push("")
    lines.push("DONE (provable: transcript hive_dream_complete + DRM file COMPLETE)")
    for (const c of done) {
      const lineage = c.completedDreams.length > 1 ? ` [+lineage ${c.completedDreams.slice(0, -1).join(", ")}]` : ""
      lines.push(`  ${c.sessionID} → done  ${c.dreamID}${lineage}  arts:${c.artifacts.length}  "${c.title.slice(0, 44)}"`)
    }
  }
  if (inProgress.length > 0) {
    lines.push("")
    lines.push("IN PROGRESS (live/paused — no completed dream)")
    for (const c of inProgress) {
      const inc = c.incompleteDreams.length ? ` (dream begun, not completed: ${c.incompleteDreams.join(", ")})` : ""
      lines.push(`  ${c.sessionID} → in_progress${inc}  "${c.title.slice(0, 44)}"`)
    }
  }
  if (plan.skipped.length > 0) {
    lines.push("")
    lines.push("SKIPPED")
    for (const s of plan.skipped) lines.push(`  ${s.sessionID}  ${s.reason}: ${s.detail}`)
  }

  lines.push("")
  if (wrote && result) {
    const ids = result.created.map((r) => r.itemID).sort()
    const range = ids.length > 0 ? `${ids[0]}..${ids[ids.length - 1]}` : "none"
    lines.push(`Created ${result.created.length} item(s): ${range}. Idempotent — re-invoking /reconcile is a safe no-op for these.`)
  } else {
    lines.push(`This was a preview. Re-run \`/reconcile --write\` to create these ${plan.cards.length} item(s). Idempotent — safe to re-run.`)
  }
  return lines.join("\n")
}

// ── Execution (locked writes through board-store) ────────────────────────────

export interface ReconcileResult {
  created: { sessionID: string; itemID: string; status: string; dreamID: string | null }[]
  skipped: SkippedSession[]
  dryRun: boolean
}

const RECONCILE_BY = "board:reconcile"

/** Build the birth + (optional) done transitions for a planned card. */
function transitionsFor(card: PlannedCard): Transition[] {
  const at = nowIso()
  const ts: Transition[] = [
    { at, from: null, to: "in_progress", by: RECONCILE_BY, session: card.sessionID },
  ]
  if (card.status === "done") {
    // Preserve every completed dream in lineage; the last is the definer.
    for (const drm of card.completedDreams) {
      ts.push({ at, from: "in_progress", to: "done", by: `${RECONCILE_BY}:${drm}`, session: card.sessionID })
    }
  }
  return ts
}

/**
 * Execute a plan: create one WI per planned card through the LOCKED board-store
 * (never hand-written). Idempotent: re-reads existing items inside the lock and
 * skips any session that gained an owner meanwhile. dryRun=true plans only.
 */
export async function executeReconcile(
  directory: string,
  plan: ReconcilePlan,
  dryRun: boolean
): Promise<ReconcileResult> {
  const created: ReconcileResult["created"] = []
  if (dryRun) {
    return {
      created: plan.cards.map((c) => ({ sessionID: c.sessionID, itemID: "(dry-run)", status: c.status, dreamID: c.dreamID })),
      skipped: plan.skipped,
      dryRun: true,
    }
  }

  const extraSkips: SkippedSession[] = []
  await withBoardLock(directory, () => {
    // Re-read inside the lock — authoritative idempotency (SCHEMA §4a.3).
    const existing = listItems(directory)
    const owned = new Set(existing.map((i) => i.owner_session).filter((s): s is string => s !== null))
    const tombstoned = new Set(existing.flatMap((i) => i.released_sessions))

    for (const card of plan.cards) {
      if (owned.has(card.sessionID)) {
        extraSkips.push({ sessionID: card.sessionID, reason: "already-owned", detail: "gained an owner before reconcile write" })
        continue
      }
      if (tombstoned.has(card.sessionID)) {
        extraSkips.push({ sessionID: card.sessionID, reason: "tombstoned", detail: "tombstoned before reconcile write" })
        continue
      }
      const item = createItemUnlocked(directory, {
        title: card.title,
        status: card.status,
        owner_session: card.sessionID,
        group_id: card.groupID,
        origin: "session-first",
        paused: false,
        spec_hash: null, // reconciled sessions have no board-authored spec
        released_sessions: [],
        dream_id: card.dreamID,
        artifacts: card.artifacts,
        priority: "medium",
        tags: [],
        done_without_dream: false,
        subtasks: [],
        transitions: transitionsFor(card),
        body: "",
        created: today(),
        updated: today(),
      })
      owned.add(card.sessionID) // guard within this batch
      created.push({ sessionID: card.sessionID, itemID: item.id, status: card.status, dreamID: card.dreamID })
    }
  })

  return { created, skipped: [...plan.skipped, ...extraSkips], dryRun: false }
}
