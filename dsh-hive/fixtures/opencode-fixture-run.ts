// OpenCode-side fixture runner: executes the dream cycle through the ORIGINAL
// plugin code (src/tools.ts + src/lib/*) with a stubbed NervousSystem/log, on
// a synthetic workspace. Byte-output is then diffed against the dsh run.
//
// Run under the plugin's own toolchain: bun (the libs are runtime-agnostic TS).
import { createHiveTools } from "/workspace/projects/evolutional_agent_structure/src/tools.ts"
import fs from "fs"
import path from "path"

const dir = process.argv[2]
if (!dir) { console.error("usage: bun opencode-fixture-run.ts <workspace>"); process.exit(1) }

for (const sub of ["insights", "warnings", "songlines", "shadows"]) {
  fs.mkdirSync(path.join(dir, ".opencode/dreams/artifacts", sub), { recursive: true })
}
fs.mkdirSync(path.join(dir, ".opencode/dreams/active"), { recursive: true })
fs.mkdirSync(path.join(dir, ".opencode/dreams/history"), { recursive: true })
fs.mkdirSync(path.join(dir, ".opencode/dreams/raw"), { recursive: true })

// Minimal NervousSystem stub: only resolveAgent is exercised by the dream tools.
const ns = {
  resolveAgent: (_sessionID, _agent) => "gate-cap",
}
const client = {}
const log = () => {}

const tools = createHiveTools(ns, client, log, dir)
const context = { sessionID: "ses_p2b", agent: "gate-cap" }
const run = (name, args) => tools[name].execute(args, context)

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

console.log("opencode fixture run complete")
