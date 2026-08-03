/**
 * Recency key — the single definition of "how new is this work item".
 *
 * Pure functions over an already-parsed WorkItem's own fields. Split out for
 * the same reason (and in the same shape) as lineage.ts: this module imports
 * `WorkItem` in TYPE POSITION ONLY, so it carries no node/bun surface and the
 * render layer can call it from the browser bundle. It is a leaf — it imports
 * nothing but a type, and nothing may ever be added to it that does otherwise.
 *
 * ── Why this exists as one module ───────────────────────────────────────────
 * This logic previously existed as THREE copies: data/board.ts (In Progress /
 * Done), data/workitems.ts (Backlog / Todo) and an inline arrow inside
 * web/render.ts#kanbanSection (the In-Progress interleave). The duplication was
 * justified in a comment claiming the browser boundary (I-192) forced it. That
 * was false: two of the three copies are server-side, so the boundary never
 * bound them at all — and for the copy that IS browser-bundled, lineage.ts had
 * already demonstrated that a type-only leaf module crosses that boundary
 * safely. I-192's actual guidance is to check whether a module touches
 * `node:fs` before ruling extraction out. A recency key does not.
 *
 * The duplication was not merely unjustified, it was already harmful: the
 * copies had drifted, and the I-191 bug fixed on 2026-08-03 WAS that drift —
 * the full-precision sort landed on the owned columns and never reached
 * Backlog/Todo, so same-day items there degraded to readdir order for weeks
 * (W-042: a fix applied to one sibling but not its parallel sibling is a latent
 * landmine). One definition means the next fix cannot land in only two thirds
 * of the board.
 */
import type { WorkItem } from "../../lib/board-store"

/**
 * The newest-first sort key for a work item. **Total**: always returns a
 * usable key, never an empty string that a caller must remember to coalesce.
 *
 * Prefers the newest `transitions[].at` — a full-ISO, second-precision stamp
 * written uniformly on every transition (I-189) and read from the item's own
 * append-only log (I-190), so it satisfies the portability invariant (I-144):
 * an in-record key needing no session or external call. Falls back to the
 * DATE-ONLY `updated` when the log is empty or carries no usable stamp, which
 * is the whole reason the coarse-key bug (I-191/W-081) existed in the first
 * place — a fallback, never the primary key.
 *
 * The log is deliberately NOT assumed sorted; we take the max defensively.
 *
 * ── On totality (the one behavioural decision this consolidation made) ──────
 * The three predecessors agreed on the observable key but disagreed on WHERE
 * the fallback lived: board.ts's helper returned `""` and its comparator
 * applied `|| item.updated`, while the other two applied it inside the helper.
 * Consolidating on the TOTAL shape is deliberate and is the safer of the two:
 * a helper that can return `""` requires every present and future call site to
 * re-apply the coalesce, and a caller who forgets silently sorts every
 * logless item to the bottom. Making the function total removes that seam
 * rather than documenting it. Verified behaviour-preserving at both surviving
 * call sites by test/board-viewer/recency.test.ts, which was written against
 * the originals before the extraction (W-113).
 */
export function recencyKey(item: Pick<WorkItem, "transitions" | "updated">): string {
  let max = ""
  for (const t of item.transitions) {
    if (t.at && t.at > max) max = t.at
  }
  return max || item.updated
}
