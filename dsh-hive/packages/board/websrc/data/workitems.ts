/**
 * WEB PORT PROVENANCE (WI-062 slice 3, 2026-09-19)
 * copied-from: src/board-viewer/data/workitems.ts @ 06a5c44-clean
 * deltas: TRIMMED COPY — the node faces are excluded (listItemsInDir/parseWorkItem +
 *   normalize read lib/board-store through node I/O and never ship in the client bundle;
 *   the DSH route constructs viewer WorkItem rows itself). Kept byte-true: the
 *   WorkItem view-type alias, safeTodoMirror re-asserts (kept as reference? dropped —
 *   they belonged to the excluded normalize), PRIORITY_ORDER + sortForColumn
 *   (Backlog/Todo column ordering policy) and the doc comments that carry their WHY.
 *   Type re-exports re-pointed to this package's byte-identical store lib.
 *   sortForColumn stays SERVER-policy-equal: identical comparator, no edits.
 * drift test: test/board-tab-port.test.mjs (function-body byte-identity vs upstream)
 */

/**
 * The viewer's WorkItem is the store's parsed item PLUS the read-time invariant
 * overlay (`problems[]`). Under dsh the route (src/index.ts#tabIndex) attaches
 * `problems` per item — one boundary, same as the old loadWorkItems (I-136).
 */
import type {
  Subtask,
  TodoMirrorEntry,
  Transition,
  WorkItem as StoreWorkItem,
  WorkItemPriority,
  WorkItemStatus,
} from "../../src/lib/board-store.js"
import { recencyKey } from "./recency.js"

export type { Subtask, TodoMirrorEntry, Transition, WorkItemStatus, WorkItemPriority }

export type WorkItem = StoreWorkItem & { problems: string[] }

const PRIORITY_ORDER: Record<WorkItemPriority, number> = { high: 0, medium: 1, low: 2 }

/**
 * Column ordering for the not-yet-owned columns (Backlog / Todo): priority
 * first, then recency, then a deterministic id tiebreak so a genuine tie can
 * never fall through to readdir order (I-191/W-081 — four such tie-groups were
 * live on the real board on 2026-08-03).
 *
 * The recency key lives in data/recency.ts — ONE definition shared by
 * every column and the render layer's In-Progress interleave. Sorting is the one
 * place where a second, subtly-different copy of that rule is most expensive:
 * it produces no error, just a quietly wrong order.
 */
export function sortForColumn(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority]
    const pb = PRIORITY_ORDER[b.priority]
    if (pa !== pb) return pa - pb
    const ka = recencyKey(a)
    const kb = recencyKey(b)
    if (ka !== kb) return kb.localeCompare(ka)
    // Deterministic tiebreak (newest id first) — never insertion order.
    return b.id.localeCompare(a.id)
  })
}
