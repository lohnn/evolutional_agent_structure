/**
 * Recency key — re-export shim.
 *
 * The definition MOVED to `src/lib/board-recency.ts` (WI-068) because the
 * plugin's board read tools need the same key and the entrypoint-isolation
 * guard forbids `src/index.ts` from reaching anything under `src/board-viewer/`.
 * The alternative was a second copy on the plugin side — i.e. re-creating the
 * exact drift (I-191/W-081) that collapsing the original three copies into this
 * module fixed.
 *
 * This file stays so every viewer call site keeps working unchanged, and it
 * remains a type-only leaf: `lib/board-recency.ts` imports `WorkItem` in type
 * position and nothing else, so the render layer still bundles it safely for
 * the browser (I-192). Verified: the emitted client bundle is byte-identical
 * across the move, so the shim does not defeat tree-shaking.
 *
 * Read the constraint banner in `lib/board-recency.ts` before editing it — it
 * is the one file under `src/lib/` that ships to the browser.
 */
export { recencyKey } from "../../lib/board-recency"
