// dsh-side fixture runner: the SAME dream cycle through the ported plugins,
// with FIXED timestamps so byte-output can be diffed against the OpenCode run.
import { Context } from "@deepseek-ai/cordis"
import DreamArchive from "@hive/dsh-dream-archive"
import HiveDreamTools from "@hive/dsh-tools"
import fs from "fs"
import path from "path"

const dir = process.argv[2]
if (!dir) { console.error("usage: node dsh-fixture-run.mjs <workspace>"); process.exit(1) }

for (const sub of ["insights", "warnings", "songlines", "shadows"]) {
  fs.mkdirSync(path.join(dir, ".opencode/dreams/artifacts", sub), { recursive: true })
}
fs.mkdirSync(path.join(dir, ".opencode/dreams/active"), { recursive: true })
fs.mkdirSync(path.join(dir, ".opencode/dreams/history"), { recursive: true })
fs.mkdirSync(path.join(dir, ".opencode/dreams/raw"), { recursive: true })

const ctx = new Context()
const { createRequire } = await import("node:module")
const require = createRequire("/root/.dsh/profiles/web/package.json")
const ToolsMod = require("@deepseek-ai/dsh-tools")
const Tools = ToolsMod.default ?? ToolsMod.Tools
const SPMod = require("@deepseek-ai/dsh-system-prompt")
const SP = SPMod.default ?? SPMod.SystemPrompt
new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
ctx.plugin(DreamArchive, { directory: dir })
ctx.plugin(HiveDreamTools)
await new Promise((r) => setTimeout(r, 80))

const visible = ctx.tools.view(undefined).visible
const execStub = { signal: AbortSignal.timeout(10000), agent: { id: "gate-cap", session: { id: "ses_p2b" } } }
const run = (name, args) => visible.get(name).execute(args, execStub)

await run("hive_dream_residue", { content: "dsh tools gate: residue works", kind: "note" })
await run("hive_dream_harvest", {})
await run("hive_dream_begin", {
  intention: "phase-2b gate dream", intention_type: "CONSOLIDATION", depth: "2",
  project_context: "dsh-hive gate",
})
await run("hive_dream_artifact_create", {
  type: "insight", source_dream: "DRM-001", confidence: 0.9, domain_tags: "gate,dsh",
  content: "gate insight", actionable: true, previously_invisible_because: "gate",
})
await run("hive_dream_artifact_create", {
  type: "warning", source_dream: "DRM-001", confidence: 0.85, justifiable: "FULLY",
  content: "gate warning", trigger_conditions: "when gating\nwhen porting",
})
await run("hive_dream_artifact_create", {
  type: "songline", source_dream: "DRM-001", domain_tags: "gate", transfer_rating: 0.7,
  narrative: "A gate stood open.\nThe archive walked through.", encoded_principles: "verify on disk\ntrust the bytes",
})
await run("hive_dream_artifact_create", {
  type: "shadow", source_dream: "DRM-001", weight: "LOW", content: "gate shadow",
  location: "gate", nature: "gate", severity: "gate", trigger_conditions: "never", resolution_hint: "gate",
})
await run("hive_dream_supersede", { id: "I-001", superseded_by: "W-001", reason: "gate" })
await run("hive_dream_mark_stale", { id: "SNG-001" })
await run("hive_dream_complete", { artifact_ids: "I-001 W-001 SNG-001 SHADOW-001 I-404" })

console.log("dsh fixture run complete")
