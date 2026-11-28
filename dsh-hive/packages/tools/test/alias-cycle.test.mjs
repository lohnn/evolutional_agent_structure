// P2 dual-name alias cycle (helm-rebrand-design.md §2.5/§3): every
// hive_dream_* tool also registers its canonical helm_* name on the SAME
// definition. Proven END-STATE (W-047) against the real DreamArchive + Board
// services and the real apply():
//   1. presence — all 11 helm_dream_* aliases resolve where their hive_*
//      twins are registered,
//   2. schema-identity — alias.parameters deep-equals the twin's, the alias
//      reuses the SAME execute/output.render function objects (no behavior
//      fork), and alias.description === legacy description + the dual-name
//      note (old descriptions carry NO note),
//   3. behavior — one alias executes end-to-end through the real registry.
// The old names stay live and untouched; nothing here renames anything.
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
  ["hive_dream_residue", "helm_dream_residue"],
  ["hive_dream_harvest", "helm_dream_harvest"],
  ["hive_dream_artifact_create", "helm_dream_artifact_create"],
  ["hive_dream_query", "helm_dream_query"],
  ["hive_dream_rank", "helm_dream_rank"],
  ["hive_dream_begin", "helm_dream_begin"],
  ["hive_dream_complete", "helm_dream_complete"],
  ["hive_dream_list", "helm_dream_list"],
  ["hive_dream_supersede", "helm_dream_supersede"],
  ["hive_dream_mark_stale", "helm_dream_mark_stale"],
  ["hive_dream_detect_duplicates", "helm_dream_detect_duplicates"],
]

const WS = fs.mkdtempSync(path.join(os.tmpdir(), "p2-alias-tools-"))
fs.mkdirSync(path.join(WS, ".helm/dreams/raw"), { recursive: true })
for (const t of ["insights", "warnings", "songlines", "shadows"]) {
  fs.mkdirSync(path.join(WS, ".helm/dreams/artifacts", t), { recursive: true })
}
fs.mkdirSync(path.join(WS, ".helm/dreams/active"), { recursive: true })
fs.mkdirSync(path.join(WS, ".helm/dreams/history"), { recursive: true })
fs.mkdirSync(path.join(WS, ".helm/board"), { recursive: true })

const ctx = new Context()
new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
const DreamArchiveSrv = (await import("@hive/dsh-dream-archive")).default
const BoardSrv = (await import("@hive/dsh-board")).default
new DreamArchiveSrv(ctx, { directory: WS })
new BoardSrv(ctx, { directory: WS })
const toolsMod = await import("@hive/dsh-tools")
toolsMod.default(ctx)
await new Promise((r) => setTimeout(r, 80))

test("alias presence: all 11 helm_dream_* twins resolve alongside their hive_* names", () => {
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

test("alias behavior spot check: helm_dream_residue writes through the same journal path", async () => {
  const alias = ctx.tools.get("helm_dream_residue")
  const out = await alias.execute(
    { content: "alias-cycle probe: residue works", kind: "note" },
    { signal: AbortSignal.timeout(5000), agent: { id: "gate-cap", session: { id: "ses_alias_tools" } } },
  )
  assert.match(String(out), /Residue appended to journal for `gate-cap`/)
  const legacy = ctx.tools.get("hive_dream_harvest")
  const harvested = await legacy.execute({ peek: true }, { signal: AbortSignal.timeout(5000) })
  assert.ok(String(harvested).includes("alias-cycle probe"), "the legacy harvest reads what the alias wrote (same store)")
})

// NB: no trailing rmSync — module top level runs BEFORE node:test executes the
// registered tests, so a cleanup here would delete the fixture mid-run (the
// mkdtemp dir is throwaway either way, and the sibling harnesses don't clean).
