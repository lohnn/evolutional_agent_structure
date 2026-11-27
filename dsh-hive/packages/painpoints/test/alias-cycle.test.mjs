// P2 dual-name alias cycle (helm-rebrand-design.md §2.5/§3): the 3 hive_*
// painpoint tools also register their canonical helm_* twins on the SAME
// definitions. Real Painpoints service over a synthetic workspace:
//   1. presence — the 3 helm_* aliases resolve; old names untouched,
//   2. schema-identity — alias.parameters deep-equals the twin's, the alias
//      reuses the SAME execute/output.render function objects (no behavior
//      fork), alias.description === legacy + the dual-name note,
//   3. behavior — a helm_note_painpoint alias call writes the same raw
//      journal file the old name writes, and the legacy list reads it back.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Context } from "@deepseek-ai/cordis"

const { createRequire } = await import("node:module")
const require = createRequire("/root/.dsh/profiles/web/package.json")
const SPMod = require("@deepseek-ai/dsh-system-prompt")
const SP = SPMod.default ?? SPMod.SystemPrompt
const ToolsMod = require("@deepseek-ai/dsh-tools")
const Tools = ToolsMod.default ?? ToolsMod.Tools

const PAIRS = [
  ["hive_note_painpoint", "helm_note_painpoint"],
  ["hive_painpoints_list", "helm_painpoints_list"],
  ["hive_painpoints_harvest", "helm_painpoints_harvest"],
]

const WS = fs.mkdtempSync(path.join(os.tmpdir(), "p2-alias-pain-"))
fs.mkdirSync(path.join(WS, ".helm/painpoints/raw"), { recursive: true })

const ctx = new Context()
new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
const Painpoints = (await import("@hive/dsh-painpoints")).default
ctx.plugin(Painpoints, { directory: WS })
await new Promise((r) => setTimeout(r, 80))

test("alias presence: all 3 helm_* twins resolve alongside their hive_* names", () => {
  for (const [legacy, alias] of PAIRS) {
    assert.ok(ctx.tools.get(legacy), `${legacy} still registered (old names untouched)`)
    assert.ok(ctx.tools.get(alias), `${alias} registered`)
  }
})

test("alias schema-identity: same parameters, same execute/output.render references, same output schema", () => {
  for (const [legacy, alias] of PAIRS) {
    const a = ctx.tools.get(legacy)
    const b = ctx.tools.get(alias)
    assert.ok(a && b, `${legacy}/${alias} both resolve`)
    assert.deepEqual(b.parameters, a.parameters, `${alias}: compiled parameter schema identical`)
    assert.equal(b.execute, a.execute, `${alias}: the SAME execute closure (no behavior fork)`)
    assert.equal(b.output.render, a.output.render, `${alias}: the SAME output renderer`)
    assert.deepEqual(b.output.schema, a.output.schema, `${alias}: output schema identical`)
  }
})

test("alias description = legacy description + the dual-name note (legacy description carries NO note)", () => {
  for (const [legacy, alias] of PAIRS) {
    const a = ctx.tools.get(legacy)
    const b = ctx.tools.get(alias)
    assert.ok(b.description.startsWith(a.description), `${alias}: description extends the legacy text`)
    assert.ok(b.description.includes(legacy), `${alias}: note names the legacy twin`)
    assert.match(b.description, /dual-name cycle/, `${alias}: note names the cycle`)
    assert.ok(!a.description.includes("dual-name cycle"), `${legacy}: old description untouched (no note injected)`)
  }
})

test("alias behavior spot check: helm_note_painpoint appends the same raw journal the legacy list reads", async () => {
  const alias = ctx.tools.get("helm_note_painpoint")
  const out = await alias.execute(
    { problem: "alias-cycle probe friction", context: "written through the helm_note_painpoint alias" },
    { signal: AbortSignal.timeout(5000), agent: { id: "gate-worker", session: { id: "ses_alias_pain" } } },
  )
  assert.match(String(out), /Pain point captured/)
  const raws = fs.readdirSync(path.join(WS, ".helm/painpoints/raw")).filter((f) => f.endsWith(".md"))
  assert.equal(raws.length, 1, "exactly one raw journal for the alias call")
  const legacyList = ctx.tools.get("hive_painpoints_list")
  const listed = await legacyList.execute({}, { signal: AbortSignal.timeout(5000), agent: { id: "gate-worker", session: { id: "ses_alias_pain" } } })
  assert.ok(String(listed).includes("alias-cycle probe friction"), "the legacy list reads what the alias wrote")
})

// NB: no trailing rmSync — module top level runs before node:test executes the
// registered tests; the mkdtemp dir is throwaway either way.
