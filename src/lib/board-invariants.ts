/**
 * SCHEMA §3 invariant check — "is this work item in a LEGAL state?"
 *
 * One definition of what counts as a violation, shared by the plugin's board
 * read tools and by board-viewer's render layer. Extracted from board-viewer's
 * `data/workitems.ts#computeProblems` (WI-071), rules unchanged.
 *
 * ── Why it is shared, and why `sortForColumn` is not ────────────────────────
 * The test that decided this (WI-068/I-283): would two implementations
 * disagreeing be a BUG or a CHOICE? An invariant violation is a FACT about an
 * item — if the viewer flags WI-065 as illegal and the read tools do not, one
 * of them is simply wrong. So it belongs here, next to `board-recency.ts`
 * (also a fact). Column ordering is a POLICY about a surface — two surfaces
 * ordering differently is a legitimate choice — so it stayed in the viewer.
 *
 * The placement is additionally forced, not merely tasteful:
 * `test/entrypoint-isolation.test.ts` invariant 1 forbids `src/index.ts` from
 * reaching `src/board-viewer/` at all, so anything BOTH the plugin runtime and
 * the viewer must agree on can only live under `src/lib/`.
 *
 * ── This module is NOT browser-reachable, and NOT guarded (measured) ────────
 * Do not copy `board-recency.ts`'s "⚠ BROWSER-REACHABLE … this is enforced"
 * banner onto this file. Both of its claims would be false here, and a banner
 * asserting a constraint that does not hold teaches the next reader to
 * disbelieve banners — including the true one next door.
 *
 * What was actually measured (2026-08-05, in a throwaway worktree):
 *   - NOT IN THE BUNDLE. The browser bundle is built from `web/client.ts` →
 *     `web/render.ts`. render.ts imports `data/workitems` in TYPE POSITION
 *     ONLY (erased at compile time) and consumes the `problems` FIELD off an
 *     already-normalized item — never this function. So this runs server-side
 *     and only its RESULT crosses to the browser. Confirmed against the
 *     emitted bundle, the only honest oracle: performing this whole extraction
 *     INCLUDING the viewer-side rewrite left the bundle byte-identical —
 *     sha256 644723b5…, 27924 CHARACTERS / 28061 UTF-8 bytes. Those are two
 *     different quantities and both reproduce; `bundle.js.length` is the
 *     character count, the hash is over the UTF-8 bytes, and the bundle
 *     contains multi-byte characters (the ⚠ chip markup among them). The hash
 *     also only reproduces with buildSha="guard-test", since the SHA is
 *     `define`-baked into the bundle — "dev" yields a different one. State the
 *     build SHA whenever quoting a bundle hash as evidence.
 *   - THEREFORE UNGUARDED. `test/entrypoint-isolation.test.ts` ("browser-bundle
 *     purity") asserts against the EMITTED bundle, so it can only protect what
 *     actually ships. This file does not ship, so the guard is silent on it.
 *     Proven rather than predicted, by injecting the same violation twice:
 *     `import * as fs from "node:fs"` plus a live `fs.existsSync()` call FAILS
 *     the guard in `board-recency.ts` ("fs calls"), and passes 8/0 here with
 *     the bundle unchanged. Being a type-only leaf under `src/lib/` earns a
 *     file NO enforcement; only being in the bundle does.
 *
 * That is a statement of fact, not a licence. Keep this module a pure,
 * type-only leaf anyway: the cheapest way for it to become browser-reachable
 * is for the render layer to one day compute problems client-side, and the
 * constraint should already hold when that happens rather than be discovered
 * by a bundle failure. Just do not expect a test to tell you if you break it.
 *
 * ── COVERAGE GAP: three of six invariants, two of them weakened ────────────
 * `docs/board-viewer/SCHEMA.md` §3 "Invariants" declares SIX. This function
 * checks THREE, and two of those only partially. Read that as a deliberate
 * floor, not a complete audit:
 *
 *   1. PARTIAL — checks `in_progress ⟹ owner_session` set. Does NOT verify the
 *      other half of the schema's clause, that the owner is an awakened,
 *      top-level HIVE coordinator session: that needs the live session map,
 *      which would make this function neither pure nor answerable from a
 *      parsed item alone.
 *   2. PARTIAL — checks `done ⟹ dream_id present or done_without_dream`. Does
 *      NOT verify that the DRM at `dream_id` is actually COMPLETE (a second
 *      file read, same purity problem).
 *   3. FULL — `owner_session` and `group_id` are set together (I-043).
 *   4. UNCHECKED — Done → In Progress must re-attach the existing session. A
 *      property of the history, not of the current record.
 *   5. UNCHECKED — session ⟷ item is 1:1. Cross-item: it needs the whole
 *      board, so it cannot be expressed in this signature at all.
 *   6. UNCHECKED — bind-time absorption rules (Q15).
 *
 * An empty `problems[]` therefore means "violates none of the three cheap,
 * per-item, purely-local rules" — NOT "this item is schema-clean". Widening
 * coverage would change which items get flagged, so it belongs in its own pass
 * with its own decision about what to do with what it finds (WI-071 explicitly
 * declined to, to keep a refactor from carrying a detection change along).
 *
 * ── Detection only ─────────────────────────────────────────────────────────
 * A schema invariant constrains what is LEGAL, never what is STORED (I-289).
 * Illegal states genuinely reach disk — WI-065 did. Nothing here normalizes,
 * repairs or hides a violation; it is surfaced visibly (W-030) and left alone.
 * A caller who silently "fixes" what this reports has destroyed the evidence
 * of how it got there.
 */
import type { WorkItem } from "./board-store.js"

/**
 * SCHEMA §3 invariants — surfaced visibly, never silently normalized.
 *
 * Returns one human-readable sentence per violation, each naming its invariant
 * number so a reader can find it in SCHEMA.md. An empty array means the item
 * violates none of the three CHECKED rules — see the coverage gap in the module
 * header, which is not the same claim as "legal".
 */
export function computeProblems(item: WorkItem): string[] {
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
