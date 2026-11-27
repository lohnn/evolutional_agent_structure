// P2 dual-name alias cycle (helm-rebrand-design.md §2.5/§3): the 4 hive_*
// comms tools also register their canonical helm_comms_* twins on the SAME
// definitions. Real Hivemind service over a synthetic workspace:
//   1. presence — all 4 helm_comms_* aliases resolve; old names untouched,
//   2. schema-identity — alias.parameters deep-equals the twin's, the alias
//      reuses the SAME execute/output.render function objects (no behavior
//      fork), alias.description === legacy + the dual-name note,
//   3. behavior — a helm_comms_signal alias call lands the same durable
//      message file the old name writes (durability FIRST, unchanged).
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
  ["hive_signal", "helm_comms_signal"],
  ["hive_listen", "helm_comms_listen"],
  ["hive_sent", "helm_comms_sent"],
  ["hive_retire", "helm_comms_retire"],
]

const WS = fs.mkdtempSync(path.join(os.tmpdir(), "p2-alias-comms-"))
fs.mkdirSync(path.join(WS, ".helm/agents"), { recursive: true })

const ctx = new Context()
new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
const Hivemind = (await import("@hive/dsh-hivemind")).default
ctx.plugin(Hivemind, { directory: WS })
await new Promise((r) => setTimeout(r, 80))

test("alias presence: all 4 helm_comms_* twins resolve alongside their hive_* names", () => {
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

test("alias behavior spot check: helm_comms_signal writes the same durable message file", async () => {
  const alias = ctx.tools.get("helm_comms_signal")
  const execStub = {
    signal: AbortSignal.timeout(5000),
    agent: { id: "caller-cap", session: { id: "ses_alias_comms" } },
  }
  const out = await alias.execute({ recipient: "some-capability", type: "info", content: "alias-cycle probe" }, execStub)
  assert.match(String(out), /Message sent to `some-capability`/)
  assert.match(String(out), /File: .+\.json/)
  const files = fs.readdirSync(path.join(WS, ".helm/hivemind/inbox/some-capability"))
  assert.equal(files.length, 1, "exactly one durable file for the alias call")
  const legacySent = ctx.tools.get("hive_sent")
  const sentView = await legacySent.execute({}, { signal: AbortSignal.timeout(5000), agent: { id: "caller-cap", session: { id: "ses_alias_comms" } } })
  assert.ok(String(sentView).includes("some-capability"), "the legacy sent view reads what the alias sent (same mailbox)")
})

// NB: no trailing rmSync — module top level runs before node:test executes the
// registered tests; the mkdtemp dir is throwaway either way.
