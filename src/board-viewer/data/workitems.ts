/**
 * Work items — `board/WI-*.md` per SCHEMA v1.0 (§1a/§2/§3).
 *
 * ── Parsing is 100% owner-published ─────────────────────────────────────────
 * All WI file decoding goes through hive-infra's `lib/board-store` export
 * (`parseWorkItem` — the same code path the locked storage module writes
 * with; announced 2026-07-10). The former `wi-fields.ts` stopgap is deleted
 * (I-046/I-148: one owner, one code path). We re-export the owner's types;
 * the only view-side addition is `problems[]` — SCHEMA §3 invariant
 * violations surfaced visibly (W-030), a rendering concern, not a parsing one.
 *
 * `loadWorkItems(boardDir)` delegates to the owner's `listItemsInDir()`
 * (Q15 delta) — the `/^WI-\d+\.md$/` filename filter has ONE owner again.
 *
 * Vanished WI files are NORMAL (Q15: a pristine session-first placeholder is
 * deleted when hive_board_bind absorbs it — the one sanctioned deletion).
 * This loader is stateless per request: re-list and move on, never an error.
 *
 * READ-ONLY: this module never writes. Writes go through the owner's
 * `lib/board-transitions` exclusively (wired in src/web/transitions.ts).
 */
import {
  listItemsInDir,
  parseWorkItem as storeParseWorkItem,
  type Subtask,
  type TodoMirrorEntry,
  type Transition,
  type WorkItem as StoreWorkItem,
  type WorkItemPriority,
  type WorkItemStatus,
} from "../../lib/board-store"

export type { Subtask, TodoMirrorEntry, Transition, WorkItemStatus, WorkItemPriority }

// Lineage helpers live in a browser-safe module (lineage.ts) so the render
// layer can call them without pulling this file's board-store (node/bun I/O).
// Re-exported here to keep the historical import site working.
export { absorbedLineage, lineageSessions } from "./lineage"

/**
 * The owner's WorkItem plus the view-computed `problems[]` overlay (SCHEMA §3
 * invariant violations surfaced visibly — W-030).
 *
 * `todo_mirror` / `todo_mirror_updated` are the owner's OWN fields again
 * (WI-038 contract restored on board-store, v0.4.38): `todo_mirror:
 * TodoMirrorEntry[]` (additive) + `todo_mirror_updated: string | null`. The
 * owner's parser is old-record-safe — items predating the field (WI-026..037)
 * deserialize to `todo_mirror: []` / `todo_mirror_updated: null` (I-136). We
 * still re-default them defensively in `normalize` below as belt-and-suspenders
 * (I-191): cheap, and it guards against any in-memory record that somehow
 * bypassed the owner's parser. The historical 500 (`item.todo_mirror.length` on
 * an absent field) is thus defended in depth — owner parser AND view boundary.
 */
export type WorkItem = StoreWorkItem & { problems: string[] }

/** SCHEMA §3 invariants — surfaced visibly, never silently normalized. */
function computeProblems(item: StoreWorkItem): string[] {
  const problems: string[] = []
  if (item.status === "in_progress" && !item.owner_session) {
    problems.push("in_progress without owner_session (invariant 1)")
  }
  if (item.status === "done" && !item.dream_id && !item.done_without_dream) {
    problems.push("done without dream_id or done_without_dream (invariant 2)")
  }
  if (item.owner_session && !item.group_id) {
    problems.push("owner_session without group_id (invariant 3)")
  }
  return problems
}

/**
 * Belt-and-suspenders default for the owner's `todo_mirror` field (I-191).
 * The owner's parser already guarantees `todo_mirror: []` for old records
 * (WI-026..037) that predate the field (I-136), so this is defensive-only: it
 * re-asserts array-ness before any downstream `.length`/iteration, guarding the
 * historical 500 (`item.todo_mirror.length` on an absent field) even for an
 * in-memory record that somehow bypassed the owner's parser. Entries are passed
 * through as the owner already typed them — we do NOT re-shape or re-stringify.
 */
function safeTodoMirror(item: StoreWorkItem): TodoMirrorEntry[] {
  return Array.isArray(item.todo_mirror) ? item.todo_mirror : []
}

function safeTodoMirrorUpdated(item: StoreWorkItem): string | null {
  return typeof item.todo_mirror_updated === "string" && item.todo_mirror_updated.length > 0
    ? item.todo_mirror_updated
    : null
}

/**
 * View-normalize an owner-parsed item: overlay invariant `problems[]` and
 * re-default `todo_mirror` / `todo_mirror_updated` defensively. Single boundary
 * (I-136) so every downstream consumer sees a stable shape regardless of the
 * record's age.
 */
function normalize(item: StoreWorkItem): WorkItem {
  return {
    ...item,
    problems: computeProblems(item),
    todo_mirror: safeTodoMirror(item),
    todo_mirror_updated: safeTodoMirrorUpdated(item),
  }
}

/** Owner's parse + view-side normalization (invariants + todo-mirror default). */
export function parseWorkItem(content: string): WorkItem {
  return normalize(storeParseWorkItem(content))
}

/** Owner's listing (filter, skip-unreadable) + view-side normalization overlay. */
export function loadWorkItems(boardDir: string): WorkItem[] {
  return listItemsInDir(boardDir).map(normalize)
}

const PRIORITY_ORDER: Record<WorkItemPriority, number> = { high: 0, medium: 1, low: 2 }

/** Column ordering: not-yet-owned by priority then recency; owned by recency. */
export function sortForColumn(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority]
    const pb = PRIORITY_ORDER[b.priority]
    if (pa !== pb) return pa - pb
    return b.updated.localeCompare(a.updated)
  })
}


