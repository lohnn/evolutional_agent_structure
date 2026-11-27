// P2 dual-name alias cycle (helm-rebrand-design.md §2.5/§3): every
// model-callable hive_* tool across the cohort also registers its canonical
// helm_* twin on the SAME definition. This file proves the EVOLUTION half —
// the four permanent tools (dispatch/send/children/doctrine) at the global
// layer, the census rule (crew/chart/bare-verb domains; the helm_status
// deviation), and the summoned lifecycle pair semantics through a REAL
// /status summon cycle — over a real cordis composition with the whole cohort
// booted (board + dream archive + dream tools + painpoints + hivemind +
// evolution), which is also the canvas proving the census table
// HELM_TOOL_ALIASES describes all 30 global pairs. Old names stay untouched.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Context } from "@deepseek-ai/cordis"
import Board from "@hive/dsh-board"
import Evolution from "@hive/dsh-evolution"

const { helmAliasOf } = await import("@hive/dsh-evolution")

const { createRequire } = await import("node:module")
const require = createRequire("/root/.dsh/profiles/web/package.json")
const SPMod = require("@deepseek-ai/dsh-system-prompt")
const SP = SPMod.default ?? SPMod.SystemPrompt
const ToolsMod = require("@deepseek-ai/dsh-tools")
const Tools = ToolsMod.default ?? ToolsMod.Tools
const CmdMod = require("@deepseek-ai/dsh-commands")
const Commands = CmdMod.default ?? CmdMod.CommandRuntime
const SubMod = require("@deepseek-ai/dsh-subagent")
const Subagents = SubMod.default ?? SubMod.SubagentRuntime
const ScopeMod = require("@deepseek-ai/dsh-scope")
const createScope = ScopeMod.createScope

const WS = fs.mkdtempSync(path.join(os.tmpdir(), "p2-alias-evolution-"))
fs.mkdirSync(path.join(WS, ".helm/agents/capabilities"), { recursive: true })
fs.mkdirSync(path.join(WS, ".helm/board"), { recursive: true })
fs.mkdirSync(path.join(WS, ".helm/dreams/raw"), { recursive: true })
fs.mkdirSync(path.join(WS, ".helm/painpoints/raw"), { recursive: true })

const ctx = new Context()
new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
new Commands(ctx, {})
new Subagents(ctx, {})
await new Promise((r) => setTimeout(r, 50))

// The FULL cohort (same shape as the live profile, board before dream tools).
const DreamArchive = (await import("@hive/dsh-dream-archive")).default
const HiveDreamTools = (await import("@hive/dsh-tools")).default
const Painpoints = (await import("@hive/dsh-painpoints")).default
const Hivemind = (await import("@hive/dsh-hivemind")).default
ctx.plugin(DreamArchive, { directory: WS })
ctx.plugin(Board, { directory: WS })
ctx.plugin(HiveDreamTools)
ctx.plugin(Painpoints, { directory: WS })
ctx.plugin(Hivemind, { directory: WS })
ctx.plugin(Evolution, { directory: WS })
await new Promise((r) => setTimeout(r, 80))

const agentScope = (id, header = {}) => {
  const a = { id, session: { id, header }, followup: () => {} }
  const scope = createScope(ctx, a, {})
  a.ctx = scope.ctx
  return a
}

// The 30 GLOBAL pairs (the summoned 10 join the mechanics legs below — they
// never resolve at the global layer).
const GLOBAL_PAIRS = [
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
  ["hive_board_list", "helm_chart_list"],
  ["hive_board_search", "helm_chart_search"],
  ["hive_board_read", "helm_chart_read"],
  ["hive_board_bind", "helm_chart_bind"],
  ["hive_board_create", "helm_chart_create"],
  ["hive_board_respec", "helm_chart_respec"],
  ["hive_board_retitle", "helm_chart_retitle"],
  ["hive_board_tag", "helm_chart_tag"],
  ["hive_signal", "helm_comms_signal"],
  ["hive_listen", "helm_comms_listen"],
  ["hive_sent", "helm_comms_sent"],
  ["hive_retire", "helm_comms_retire"],
  ["hive_note_painpoint", "helm_note_painpoint"],
  ["hive_painpoints_list", "helm_painpoints_list"],
  ["hive_painpoints_harvest", "helm_painpoints_harvest"],
  ["hive_dispatch", "helm_crew_dispatch"],
  ["hive_send", "helm_crew_send"],
  ["hive_children", "helm_crew_children"],
  ["hive_doctrine", "helm_doctrine"],
]

test("alias presence: all 30 global helm_* twins resolve alongside their hive_* names", () => {
  for (const [legacy, alias] of GLOBAL_PAIRS) {
    assert.ok(ctx.tools.get(legacy), `${legacy} still registered (old names untouched)`)
    assert.ok(ctx.tools.get(alias), `${alias} registered`)
  }
})

test("alias schema-identity (30 global pairs): same parameters, SAME execute/output.render references, same output schema", () => {
  for (const [legacy, alias] of GLOBAL_PAIRS) {
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
  for (const [legacy, alias] of GLOBAL_PAIRS) {
    const a = ctx.tools.get(legacy)
    const b = ctx.tools.get(alias)
    assert.ok(b.description.startsWith(a.description), `${alias}: description extends the legacy text`)
    assert.ok(b.description.includes(legacy), `${alias}: note names the legacy twin`)
    assert.match(b.description, /dual-name cycle/, `${alias}: note names the cycle`)
    assert.ok(!a.description.includes("dual-name cycle"), `${legacy}: old description untouched (no note injected)`)
  }
})

test("census rule: crew/chart/bare-verb domains; hive_status NEVER aliases onto the taken helm_status", () => {
  assert.equal(helmAliasOf("hive_dispatch"), "helm_crew_dispatch", "crew domain — never bare helm_dispatch (different layers)")
  assert.equal(helmAliasOf("hive_status"), "helm_crew_status", "DEVIATION (flagged): helm_status is TAKEN by the bosun seam")
  assert.equal(helmAliasOf("hive_board_list"), "helm_chart_list", "chart domain")
  assert.equal(helmAliasOf("hive_doctrine"), "helm_doctrine", "bare-verb pattern")
  assert.equal(helmAliasOf("helm_dispatch"), undefined, "the six helm_* orchestration tools are NOT re-aliased")
  assert.equal(helmAliasOf("hive_status"), "helm_crew_status")
})

// ── the SUMMONED pair semantics — a real /status summon ──────────────────────
const awakenCmd = ctx.commands.find(undefined, "awaken")
const statusCmd = ctx.commands.find(undefined, "status")
let lead
const wakeFollowups = []

test("summon setup: /awaken flips a top-level agent (real full flip)", async () => {
  assert.ok(awakenCmd && statusCmd)
  lead = agentScope("ses_alias_lead")
  ctx.emit("agent/created", { agent: lead, source: "startup" })
  lead.followup = (m) => wakeFollowups.push(m)
  const out = await awakenCmd.handler({
    rawInput: "p2 alias probe",
    agent: lead,
    commandId: "c_alias_awaken",
    attachments: [],
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(out.kind, "success", `/awaken succeeded (${String(out.text).slice(0, 80)})`)
})

test("summon alias pair: /status scopes BOTH hive_status and its helm_crew_status twin, global sees neither", async () => {
  const followups = []
  lead.followup = (m) => followups.push(m)
  const out = await statusCmd.handler({
    rawInput: "",
    agent: lead,
    commandId: "c_alias_status",
    attachments: [],
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(out.kind, "success")
  const scopedOld = ctx.tools.get("hive_status", lead)
  const scopedNew = ctx.tools.get("helm_crew_status", lead)
  assert.ok(scopedOld && scopedNew, "both summon spellings scoped")
  assert.equal(scopedNew.execute, scopedOld.execute, "the SAME execute closure on the summoned pair")
  assert.deepEqual(scopedNew.parameters, scopedOld.parameters, "same parameter schema on the summoned pair")
  assert.ok(scopedNew.description.startsWith(scopedOld.description), "alias description extends the legacy text")
  assert.ok(scopedNew.description.includes("hive_status"), "alias note names the legacy twin")
  assert.equal(ctx.tools.get("hive_status"), undefined, "summoned tool never global (old)")
  assert.equal(ctx.tools.get("helm_crew_status"), undefined, "summoned tool never global (alias)")
})

test("summon alias pair: ONE call through either spelling retracts BOTH (WI-037 over the pair)", async () => {
  const alias = ctx.tools.get("helm_crew_status", lead)
  const out = await alias.execute({}, { signal: AbortSignal.timeout(5000), agent: lead })
  assert.match(String(out), /HELM Ecosystem Dossier/, "the alias executes the real dossier composer")
  assert.equal(ctx.tools.get("hive_status", lead), undefined, "the legacy twin retracted with it")
  assert.equal(ctx.tools.get("helm_crew_status", lead), undefined, "the alias retracted too")
})

test("armed line names the INVOKED spelling (exec.name), not the registration's literal", async () => {
  // A gated summon registered directly: the body refuses (consumed:false) so
  // the WI-074 armed line rides the result. Called through the helm_* alias —
  // the armed line must re-teach the spelling the model actually used.
  ctx.evolution.registerLifecycleTool(
    lead.ctx,
    "hive_evolve_apply",
    "armed-line probe (test registration)",
    () => ({ consumed: false, text: "✗ refused (probe)" }),
    {},
    { consumeOnVerdict: true }
  )
  const alias = ctx.tools.get("helm_evolve_apply", lead)
  assert.ok(alias, "the gated summon's alias scoped")
  const out = await alias.execute({}, { signal: AbortSignal.timeout(5000), agent: lead, name: "helm_evolve_apply" })
  assert.match(String(out), /✗ refused \(probe\)/)
  assert.match(String(out), /re-call `helm_evolve_apply`/, "armed line names the invoked spelling")
  // WI-074: a correctable refusal is NOT consumption — the pair stays ARMED,
  // in both spellings (the summon is spent only by a consuming call).
  assert.ok(ctx.tools.get("hive_evolve_apply", lead), "legacy twin still armed")
  assert.ok(ctx.tools.get("helm_evolve_apply", lead), "alias twin still armed")
})

// NB: no trailing rmSync — module top level runs before node:test executes the
// registered tests; the mkdtemp dir is throwaway either way.
