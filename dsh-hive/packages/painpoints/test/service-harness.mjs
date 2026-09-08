// Phase-2a gate: boot the Painpoints service against a synthetic workspace and
// drive all three tools through the dsh tools registry (defineTool path),
// including an arg-validation rejection (missing required field).
import { Context } from "@deepseek-ai/cordis"
import Painpoints from "@hive/dsh-painpoints"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

const results = []
const check = (id, ok, detail) => {
  results.push({ ok })
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`)
}

const synth = fs.mkdtempSync(path.join(os.tmpdir(), "p2a-synth-"))
fs.mkdirSync(path.join(synth, ".opencode/painpoints/raw"), { recursive: true })

const ctx = new Context()

// Mount the tools + systemPrompt services FIRST: the painpoints plugin's
// constructor registers tools via ctx.effect, and a plugin whose constructor
// throws transitions to FiberState.FAILED (the error surfaces only as a log
// line). The loader mounts dsh-tools before our plugins in the real profile,
// so this mirrors production wiring.
const { createRequire } = await import("node:module")
const require = createRequire("/root/.dsh/profiles/web/package.json")
const ToolsMod = require("@deepseek-ai/dsh-tools")
const Tools = ToolsMod.default ?? ToolsMod.Tools
const SPMod = require("@deepseek-ai/dsh-system-prompt")
const SP = SPMod.default ?? SPMod.SystemPrompt
new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
await new Promise((r) => setTimeout(r, 50))

ctx.plugin(Painpoints, { directory: synth })
await new Promise((r) => setTimeout(r, 50))

check("boot.service", ctx.painpoints?.directory === synth, "ctx.painpoints registered")

const visible = ctx.tools.view(undefined).visible
const names = [...visible.keys()].filter((n) => n.includes("painpoint"))
check("tools.registered", names.length === 3, `painpoint tools visible: ${names.join(", ") || "(none)"}`)

if (names.length === 3) {
  const execStub = {
    signal: AbortSignal.timeout(5000),
    agent: { id: "gate-worker", session: { id: "ses_gate" } },
  }

  // note → list → harvest cycle
  const note = await visible.get("hive_note_painpoint").execute(
    { problem: "gate friction", context: "phase-2a gate context" }, execStub)
  check("tool.note", note.includes("Pain point captured"), "hive_note_painpoint wrote")

  const listed = await visible.get("hive_painpoints_list").execute({}, execStub)
  check("tool.list", listed.includes("gate friction") && listed.includes("ses_gate"), "hive_painpoints_list shows the entry")

  // validation: missing required 'context' must throw (defineTool validation)
  let rejected = false
  try {
    await visible.get("hive_note_painpoint").execute({ problem: "only problem" }, execStub)
  } catch (e) {
    rejected = /context|required|ToolArgsError/i.test(String(e))
  }
  check("tool.arg-validation", rejected, "missing required arg rejected by defineTool")

  const harvested = await visible.get("hive_painpoints_harvest").execute({}, execStub)
  check("tool.harvest", harvested.includes("HARNESS-FIX CANDIDATES") && harvested.includes("gate friction"), "hive_painpoints_harvest archived")
  check("tool.harvest-cleared", fs.readdirSync(path.join(synth, ".opencode/painpoints/raw")).filter((f) => f.endsWith(".md")).length === 0, "raw log archived away")

  const peeked = await visible.get("hive_painpoints_harvest").execute({ peek: true }, execStub)
  check("tool.harvest-empty", peeked.includes("No pain points harvested"), "post-harvest is empty")
}

fs.rmSync(synth, { recursive: true, force: true })
const failed = results.filter((r) => !r.ok)
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`)
process.exit(failed.length ? 1 : 0)
