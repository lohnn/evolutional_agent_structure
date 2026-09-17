// Composer unit tests (T6): the pure text layers the service feeds.
// 1. composeEcosystemSnapshot — the shared ecosystem dossier (one shape, three
//    consumers: /status's summoned hive_status, /awaken's dossier, the
//    re-awaken analysis). Drift here desyncs all three at once, which is the
//    point of the shared composer.
// 2. composePostCompactionContext — the compaction seam's re-anchor block
//    (agent/created with source:"compact" + doctrine decision): capability
//    summary + pre-compaction dream pointers + the retrieval reminder, with
//    the honest fallback line when the dream archive is not mounted.
// Pure-function tests on filesystem inputs set up per test below; the
// service-side wiring (optional ctx.get of dreamArchive, the gate's decision
// matrix) is covered in service-harness.mjs's T6 sections.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { composeEcosystemSnapshot, composePostCompactionContext, POST_COMPACTION_DREAM_LIMIT } from "@hive/dsh-evolution/lib/snapshot"

function scratchWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evo-snapshot-"))
  return dir
}

test("composeEcosystemSnapshot renders roster, energy, and the void from its source", () => {
  const dir = scratchWorkspace()
  const dissolved = path.join(dir, ".opencode/agents/dissolved")
  fs.mkdirSync(dissolved, { recursive: true })
  fs.writeFileSync(path.join(dissolved, "beta.md"), "---\nname: beta\n---\n", "utf8")
  fs.writeFileSync(path.join(dissolved, "beta"), "preset dir", "utf8")
  const text = composeEcosystemSnapshot({
    directory: dir,
    listCapabilities: () => [
      { name: "alpha", energy: 60, description: "the alpha capability" },
      { name: "zeta", energy: null, description: null },
    ],
  })
  assert.ok(text.includes("## HIVE Ecosystem Dossier"), "opens with the dossier header")
  assert.ok(text.includes("### Roster (active capabilities)"), "names the roster section")
  assert.ok(text.includes("alpha — energy: 60 — the alpha capability"), "renders a roster line with energy and description")
  assert.ok(text.includes("zeta — energy: ? — (no description)"), "renders unknown energy/description as placeholders")
  assert.ok(text.includes("### Energy") && text.includes("last tick: never (no tick has run yet)"), "renders the tick line (absent state file → never)")
  assert.ok(text.includes("### The Void (dissolved capabilities)"), "names the void section")
  assert.ok(text.includes("beta"), "lists the dissolved capability ONCE (dir + .md dedup)")
  assert.ok(!/\bbeta\b.*\bbeta\b/.test(text), "no duplicate void line for the dir+ledger pair")
})

test("composeEcosystemSnapshot renders the empty-roster and empty-void forms", () => {
  const dir = scratchWorkspace() // no state file, no dissolved dir
  const text = composeEcosystemSnapshot({ directory: dir, listCapabilities: () => [] })
  assert.ok(text.includes("(none — the roster is empty)"), "empty roster is said out loud")
  assert.ok(text.includes("(the void holds nothing)"), "empty void is said out loud")
})

test("POST_COMPACTION_DREAM_LIMIT stays the OpenCode hook's cap of 5", () => {
  assert.equal(POST_COMPACTION_DREAM_LIMIT, 5)
})

test("composePostCompactionContext renders summary + pointer lines + retrieval reminder", () => {
  const text = composePostCompactionContext({
    capabilitySummary: "Active capabilities:\n- alpha (energy: 60) — the alpha capability",
    dreamPointers: [
      { dreamId: "DRM-019", intention: "consolidate the /awaken port — gate, doctrine, briefs", artifacts: ["I-048", "W-019"] },
      { dreamId: "DRM-018", intention: "dispatch material transport", artifacts: [] },
    ],
  })
  assert.ok(text.startsWith("== [HIVE] context restored after compaction"), "opens with the re-anchor header")
  assert.ok(text.includes("Active capabilities:"), "carries the capability summary verbatim (with its own list header)")
  assert.ok(text.includes("- alpha (energy: 60) — the alpha capability"), "summary body untouched")
  assert.ok(text.includes("DRM-019 (pre-compaction, artifacts: I-048, W-019) — consolidate the /awaken port"), "pointer line keeps the dreamPointerLine shape with the artifact list")
  assert.ok(text.includes("DRM-018 (pre-compaction, artifacts: none) — dispatch material transport"), "empty artifact list renders as 'none'")
  assert.ok(text.includes('hive_dream_query(ids:"<artifact ids>")') && text.includes("hive_dream_rank"), "carries the retrieval reminder (pointers only; full content stays in the archive)")
})

test("composePostCompactionContext truncates long intentions to the ~80-char excerpt", () => {
  const long = "this intention runs far beyond the digest shape and must be cut at eighty characters exactly like the OpenCode hook did"
  const text = composePostCompactionContext({
    capabilitySummary: "Active capabilities:\n- alpha (energy: 50) — x",
    dreamPointers: [{ dreamId: "DRM-099", intention: long, artifacts: [] }],
  })
  const line = text.split("\n").find((l) => l.startsWith("- DRM-099"))
  assert.ok(line, "pointer line present")
  assert.ok(line.endsWith("…"), "excerpt ends with the ellipsis")
  // excerpt + the "…": the flat prefix is exactly 80 chars.
  const excerpt = line.split("— ").pop().slice(0, -1)
  assert.equal(excerpt.replace(/\s+/g, " ").trim(), excerpt, "excerpt whitespace flattened")
  assert.ok(excerpt.length <= 80, `excerpt capped at 80 chars (got ${excerpt.length})`)
  assert.ok(!line.includes(long), "the full intention is NOT carried (that would smuggle the whole dream into the system prompt)")
})

test("composePostCompactionContext degrades honestly when the archive cannot be reached", () => {
  const text = composePostCompactionContext({
    capabilitySummary: "Active capabilities:\n- alpha (energy: 50) — x",
    dreamPointers: undefined,
  })
  assert.ok(text.includes("== [HIVE] context restored after compaction"), "the body of the re-anchor still renders")
  assert.ok(text.includes("- alpha (energy: 50) — x"), "capability summary still renders")
  assert.ok(text.includes("dream archive is not mounted"), "the fallback line says the archive is unreachable (not pretend there were no dreams)")
  assert.ok(!text.includes("(pre-compaction, artifacts:"), "zero pointer lines in the degraded block")
  assert.ok(!text.includes("hive_dream_query"), "no retrieval reminder without pointers")
})

test("composePostCompactionContext distinguishes an empty pointer list from an absent archive", () => {
  const empty = composePostCompactionContext({ capabilitySummary: "Active capabilities:\n- alpha (energy: 50) — x", dreamPointers: [] })
  assert.ok(empty.includes("(no pre-compaction dreams recorded)"), "archive reachable + zero pre-compaction dreams is its own line")
  assert.ok(!empty.includes("dream archive is not mounted"), "an empty list must not read as an unmounted archive")
  const absent = composePostCompactionContext({ capabilitySummary: "Active capabilities:\n- alpha (energy: 50) — x", dreamPointers: undefined })
  assert.ok(absent.includes("dream archive is not mounted") && !absent.includes("(no pre-compaction dreams recorded)"), "and an unmounted archive must not read as an empty list")
})

test("composePostCompactionContext renders an empty roster loudly instead of skipping the block", () => {
  const text = composePostCompactionContext({ capabilitySummary: null, dreamPointers: [] })
  assert.ok(text.startsWith("== [HIVE] context restored after compaction"), "the re-anchor survives a null summary")
  assert.ok(text.includes("(none — the roster is empty)"), "empty roster said out loud — 'the roster is empty' IS awareness")
})
