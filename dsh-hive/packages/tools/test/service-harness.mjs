// Phase-2b gate: drive the FULL dream cycle through the 9 hive_dream_* tools
// via the dsh tools registry, on a synthetic workspace. Asserts every tool
// registers, validates (defineTool), executes, and produces the expected
// handrolled-YAML bytes on disk.
import { Context } from "@deepseek-ai/cordis"
import DreamArchive from "@hive/dsh-dream-archive"
import HiveDreamTools from "@hive/dsh-tools"
import fs from "fs"
import os from "os"
import path from "path"

const results = []
const check = (id, ok, detail) => {
  results.push({ ok })
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`)
}

const synth = fs.mkdtempSync(path.join(os.tmpdir(), "p2b-synth-"))
for (const sub of ["insights", "warnings", "songlines", "shadows"]) {
  fs.mkdirSync(path.join(synth, ".opencode/dreams/artifacts", sub), { recursive: true })
}
fs.mkdirSync(path.join(synth, ".opencode/dreams/active"), { recursive: true })
fs.mkdirSync(path.join(synth, ".opencode/dreams/history"), { recursive: true })
fs.mkdirSync(path.join(synth, ".opencode/dreams/raw"), { recursive: true })

const ctx = new Context()
const { createRequire } = await import("node:module")
const require = createRequire("/root/.dsh/profiles/web/package.json")
const ToolsMod = require("@deepseek-ai/dsh-tools")
const Tools = ToolsMod.default ?? ToolsMod.Tools
const SPMod = require("@deepseek-ai/dsh-system-prompt")
const SP = SPMod.default ?? SPMod.SystemPrompt
new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
ctx.plugin(DreamArchive, { directory: synth })
ctx.plugin(HiveDreamTools)
await new Promise((r) => setTimeout(r, 80))

const visible = ctx.tools.view(undefined).visible
const expected = [
  "hive_dream_residue", "hive_dream_harvest", "hive_dream_artifact_create",
  "hive_dream_query", "hive_dream_rank", "hive_dream_begin",
  "hive_dream_complete", "hive_dream_list", "hive_dream_supersede",
  "hive_dream_mark_stale", "hive_dream_detect_duplicates",
]
const missing = expected.filter((n) => !visible.has(n))
check("tools.registered", missing.length === 0, `${expected.length - missing.length}/${expected.length} hive_dream_* tools visible${missing.length ? " — missing: " + missing.join(",") : ""}`)

const execStub = {
  signal: AbortSignal.timeout(10000),
  agent: { id: "gate-cap", session: { id: "ses_p2b" } },
}
const run = (name, args) => visible.get(name).execute(args, execStub)

// ── residue → harvest ───────────────────────────────────────────────────────
let out = await run("hive_dream_residue", { content: "dsh tools gate: residue works", kind: "note" })
check("cycle.residue", out.includes("Residue appended to journal for `gate-cap`"), "residue appended")

out = await run("hive_dream_harvest", {})
check("cycle.harvest", out.includes("gate-cap") && out.includes("residue works"), "harvest collected the journal")
out = await run("hive_dream_harvest", { peek: true })
check("cycle.harvest-empty", out.includes("No dream residue found"), "post-harvest journal dir clean")

// ── begin ───────────────────────────────────────────────────────────────────
out = await run("hive_dream_begin", {
  intention: "phase-2b gate dream", intention_type: "CONSOLIDATION", depth: "2",
  project_context: "dsh-hive gate",
})
check("cycle.begin", out.includes("Dream DRM-001 opened"), "begin opened DRM-001")

// single-active invariant
out = await run("hive_dream_begin", {
  intention: "second", intention_type: "CONSOLIDATION", depth: "1", project_context: "x",
})
check("cycle.begin-single-active", out.includes("already active"), "second begin refused (single-active)")

// defineTool validation: bad enum must throw
let rejected = false
try { await run("hive_dream_begin", { intention: "x", intention_type: "BOGUS", depth: "2", project_context: "y" }) }
catch (e) { rejected = /intention_type|enum|ToolArgsError/i.test(String(e)) }
check("cycle.begin-validation", rejected, "bad enum rejected by defineTool")

// ── artifact create (one of each type) ──────────────────────────────────────
out = await run("hive_dream_artifact_create", {
  type: "insight", source_dream: "DRM-001", confidence: 0.9, domain_tags: "gate,dsh",
  content: "gate insight", actionable: true, previously_invisible_because: "gate",
})
check("cycle.create-insight", out.includes("Created I-001"), out.trim())

out = await run("hive_dream_artifact_create", {
  type: "warning", source_dream: "DRM-001", confidence: 0.85, justifiable: "FULLY",
  content: "gate warning", trigger_conditions: "when gating\nwhen porting",
})
check("cycle.create-warning", out.includes("Created W-001"), out.trim())

out = await run("hive_dream_artifact_create", {
  type: "songline", source_dream: "DRM-001", domain_tags: "gate", transfer_rating: 0.7,
  narrative: "A gate stood open.\nThe archive walked through.", encoded_principles: "verify on disk\ntrust the bytes",
})
check("cycle.create-songline", out.includes("Created SNG-001"), out.trim())

out = await run("hive_dream_artifact_create", {
  type: "shadow", source_dream: "DRM-001", weight: "LOW", content: "gate shadow",
  location: "gate", nature: "gate", severity: "gate", trigger_conditions: "never", resolution_hint: "gate",
})
check("cycle.create-shadow", out.includes("Created SHADOW-001"), out.trim())

// missing per-type required fields → error string (not throw)
out = await run("hive_dream_artifact_create", { type: "insight", source_dream: "DRM-001", confidence: 0.5 })
check("cycle.create-missing-fields", out.startsWith("Error: insight requires"), "per-type field validation in execute")

// ── query / rank / list ─────────────────────────────────────────────────────
out = await run("hive_dream_query", { ids: "I-001,W-001" })
check("cycle.query-ids", out.includes("--- I-001 [insight] ---") && out.includes("gate warning"), "ids exact-fetch full content")

out = await run("hive_dream_query", { domain_tags: "gate" })
check("cycle.query-tags", out.includes("I-001") && out.includes("SNG-001"), "tag query hits insight+songline")

// tagless-type + tag filter → loud refusal
out = await run("hive_dream_query", { types: "warning", domain_tags: "gate" })
check("cycle.query-tagless-guard", out.startsWith("Invalid query: domain_tags was set"), "tagless+tags guard fires")

out = await run("hive_dream_rank", { query: "gate insight dsh" })
check("cycle.rank", out.includes("top") && out.includes("I-001"), "rank returns shortlist")

out = await run("hive_dream_list", {})
check("cycle.list", out.includes("4 artifact(s)"), "list index covers the 4 artifacts")

out = await run("hive_dream_list", { type: "shadow" })
check("cycle.list-filter", out.includes("SHADOW-001") && !out.includes("I-001"), "list type filter")

// ── supersede / mark_stale ──────────────────────────────────────────────────
out = await run("hive_dream_supersede", { id: "I-001", superseded_by: "W-001", reason: "gate" })
check("cycle.supersede", out.includes("I-001 marked superseded_by: W-001"), "supersede appended")
const i1 = fs.readFileSync(path.join(synth, ".opencode/dreams/artifacts/insights/I-001.yaml"), "utf8")
check("cycle.supersede-bytes", i1.includes('superseded_by: "W-001"') && i1.includes("gate insight"), "supersede preserved original bytes")

out = await run("hive_dream_mark_stale", { id: "SNG-001" })
check("cycle.mark-stale", out.includes("SNG-001 marked stale: true"), "mark_stale appended")

out = await run("hive_dream_supersede", { id: "I-404", superseded_by: "W-001" })
check("cycle.supersede-missing", out.startsWith("Error: artifact I-404 not found"), "missing target refused")

// ── detect duplicates ───────────────────────────────────────────────────────
out = await run("hive_dream_detect_duplicates", { threshold: 0.3 })
check("cycle.detect-dupes", out.includes("Similarity scan") || out.includes("No candidate pairs"), "detect_duplicates runs")
out = await run("hive_dream_detect_duplicates", { threshold: 0.8, max_threshold: 0.2 })
check("cycle.detect-dupes-band-guard", out.startsWith("Invalid band"), "inverted band refused")

// ── complete ────────────────────────────────────────────────────────────────
out = await run("hive_dream_complete", { artifact_ids: "I-001 W-001 SNG-001 SHADOW-001 I-404" })
check("cycle.complete", out.includes("Dream DRM-001 completed") && out.includes("insights:1") && out.includes("Missing artifact files"), "complete linked 4 + warned on I-404")

const hist = fs.readFileSync(path.join(synth, ".opencode/dreams/history/DRM-001.yaml"), "utf8")
check("cycle.complete-shape",
  hist.includes("status: COMPLETE") &&
  hist.includes("insights: [I-001]") &&
  hist.includes("warnings: [W-001]") &&
  hist.includes("songlines: [SNG-001]") &&
  hist.includes("shadows: [SHADOW-001]") &&
  hist.includes("exit_time: 20"),
  "DRM history file: scalars rewritten + artifact flow-arrays appended")

out = await run("hive_dream_complete", {})
check("cycle.complete-no-active", out.startsWith("Error: no active dream found"), "second complete refused")

// telemetry written as a side channel
check("cycle.telemetry", fs.existsSync(path.join(synth, ".opencode/dreams/index/telemetry/ses_p2b.jsonl")), "telemetry jsonl written for rank/query events")

fs.rmSync(synth, { recursive: true, force: true })
const failed = results.filter((r) => !r.ok)
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`)
process.exit(failed.length ? 1 : 0)
