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
  type Transition,
  type WorkItem as StoreWorkItem,
  type WorkItemPriority,
  type WorkItemStatus,
} from "evolutional-agent-structure/lib/board-store"

export type { Subtask, Transition, WorkItemStatus, WorkItemPriority }

// Lineage helpers live in a browser-safe module (lineage.ts) so the render
// layer can call them without pulling this file's board-store (node/bun I/O).
// Re-exported here to keep the historical import site working.
export { absorbedLineage, lineageSessions } from "./lineage"

/** The owner's WorkItem plus view-computed invariant problems (W-030). */
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

/** Owner's parse + view-side invariant check. */
export function parseWorkItem(content: string): WorkItem {
  const item = storeParseWorkItem(content)
  return { ...item, problems: computeProblems(item) }
}

/** Owner's listing (filter, skip-unreadable) + view-side invariant overlay. */
export function loadWorkItems(boardDir: string): WorkItem[] {
  return listItemsInDir(boardDir).map((item) => ({ ...item, problems: computeProblems(item) }))
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


