// P2 dual-name alias cycle (helm-rebrand-design.md §2.5/§3): the 8
// hive_board_* tools also register their canonical helm_chart_* twins on the
// SAME definitions. Proven against the real Board service + real tools
// runtime over an EMPTY synthetic board (the live store is never mounted):
//   1. presence — all 8 helm_chart_* aliases resolve; old names untouched,
//   2. schema-identity — alias.parameters deep-equals the twin's, the alias
//      reuses the SAME execute/output.render function objects (no behavior
//      fork), alias.description === legacy + the dual-name note,
//   3. behavior — a helm_chart_create alias call arrives on the real store
//      with the identical receipt the old name produces.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Context } from "@deepseek-ai/cordis"
import Board from "@hive/dsh-board"

const { createRequire } = await import("node:module")
const require = createRequire("/root/.dsh/profiles/web/package.json")
const SPMod = require("@deepseek-ai/dsh-system-prompt")
const SP = SPMod.default ?? SPMod.SystemPrompt
const ToolsMod = require("@deepseek-ai/dsh-tools")
const Tools = ToolsMod.default ?? ToolsMod.Tools

const PAIRS = [
  ["hive_board_list", "helm_chart_list"],
  ["hive_board_search", "helm_chart_search"],
  ["hive_board_read", "helm_chart_read"],
  ["hive_board_bind", "helm_chart_bind"],
  ["hive_board_create", "helm_chart_create"],
  ["hive_board_respec", "helm_chart_respec"],
  ["hive_board_retitle", "helm_chart_retitle"],
  ["hive_board_tag", "helm_chart_tag"],
]

const WS = fs.mkdtempSync(path.join(os.tmpdir(), "p2-alias-board-"))
fs.mkdirSync(path.join(WS, ".helm/board"), { recursive: true })
fs.mkdirSync(path.join(WS, ".helm/agents"), { recursive: true })

const ctx = new Context()
new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
ctx.plugin(Board, { directory: WS })
await new Promise((r) => setTimeout(r, 80))

test("alias presence: all 8 helm_chart_* twins resolve alongside their hive_board_* names", () => {
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

test("alias behavior spot check: helm_chart_create files on the real store; old list reads it back", async () => {
  const create = ctx.tools.get("helm_chart_create")
  const out = await create.execute(
    { title: "P2 alias board probe", body: "filed through the helm_chart_create alias" },
    { signal: AbortSignal.timeout(5000), agent: { id: "gate-cap", session: { id: "ses_alias_board" } } },
  )
  assert.match(String(out), /Created WI-\d+/)
  assert.match(String(out), /un-owned/)
  const list = ctx.tools.get("hive_board_list")
  const listed = await list.execute({}, { signal: AbortSignal.timeout(5000) })
  assert.ok(String(listed).includes("P2 alias board probe"), "the legacy list reads what the alias filed (same store)")
})

// NB: no trailing rmSync — module top level runs before node:test executes the
// registered tests; the mkdtemp dir is throwaway either way.
