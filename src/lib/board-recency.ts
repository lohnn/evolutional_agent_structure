/**
 * Recency key — the single definition of "how new is this work item".
 *
 * ⚠️ BROWSER-REACHABLE. THIS FILE IS COMPILED INTO THE BROWSER BUNDLE.
 * ────────────────────────────────────────────────────────────────────────────
 * It is (as of WI-068) the FIRST and ONLY module under `src/lib/` whose
 * compiled code ships to the browser: board-viewer's render layer imports it,
 * and the client bundle is built from that graph. Every one of its neighbours
 * here is server-side and treats node/bun surface as normal — board-store
 * reaches for the filesystem and crypto, board-reconcile-db opens a sqlite
 * handle — so the constraint on THIS file is invisible from its neighbourhood.
 * Hence this banner, at the only place that can prevent the mistake:
 *
 *   - TYPE-POSITION IMPORTS ONLY. It may import `WorkItem` as a type (erased at
 *     compile time) and nothing else. No `node:*`, no `bun:*`, no transitive
 *     import that reaches them. Ever.
 *   - Keep it a LEAF. The hazard is not what you write in this file, it is what
 *     you import into it: one convenience import of a store helper drags the
 *     filesystem into the browser graph.
 *
 * This is enforced, not merely requested — `test/entrypoint-isolation.test.ts`
 * (describe: "browser-bundle purity") asserts against the EMITTED bundle and
 * will fail the build. The check is real, but it lives two directories away
 * under a name mentioning the render layer, so someone editing this file has no
 * reason to find it. If you meet that failure, this banner is the explanation.
 *
 * ── Why this exists as one module ───────────────────────────────────────────
 * This logic previously existed as THREE copies: the viewer's data/board.ts
 * (In Progress / Done), data/workitems.ts (Backlog / Todo) and an inline arrow
 * inside web/render.ts#kanbanSection (the In-Progress interleave). The
 * duplication was justified in a comment claiming the browser boundary (I-192)
 * forced it. That was false: two of the three copies are server-side, so the
 * boundary never bound them at all — and for the copy that IS browser-bundled,
 * lineage.ts had already demonstrated that a type-only leaf module crosses that
 * boundary safely. I-192's actual guidance is to check whether a module touches
 * the filesystem before ruling extraction out. A recency key does not.
 *
 * The duplication was not merely unjustified, it was already harmful: the
 * copies had drifted, and the I-191 bug fixed on 2026-08-03 WAS that drift —
 * the full-precision sort landed on the owned columns and never reached
 * Backlog/Todo, so same-day items there degraded to readdir order for weeks
 * (W-042: a fix applied to one sibling but not its parallel sibling is a latent
 * landmine). One definition means the next fix cannot land in only two thirds
 * of the board.
 *
 * ── Why it lives in lib/ rather than in the viewer (WI-068) ─────────────────
 * The plugin's own board read tools need this key, and
 * `test/entrypoint-isolation.test.ts` invariant 1 forbids `src/index.ts` from
 * reaching `src/board-viewer/` at all. A plugin-side copy would have recreated
 * exactly the three-way drift described above, so the definition moved to the
 * one place both sides may import; `src/board-viewer/data/recency.ts` is now a
 * re-export and no viewer call site changed.
 *
 * Note what did NOT move with it: the viewer's `sortForColumn`. A recency key
 * is a FACT about an item — two implementations disagreeing is a bug by
 * definition. Column ordering is a POLICY about a surface — two surfaces
 * ordering differently is a legitimate choice. That test ("bug or choice?") is
 * what decides whether the next helper belongs here.
 */
import type { WorkItem } from "./board-store.js"

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
