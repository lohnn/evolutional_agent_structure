// HELM role presets phase 3 — evolution §2.4 reconciliation against a REAL
// composition (same harness family as dormant-open-surface.test.mjs: real
// cordis Context, real dsh tools scopes, real command runtime, and the real
// @hive/dsh-helm role-gate plugin booted beside Evolution).
//
// The harness census intentionally mirrors the live profile's GLOBAL layer:
// board tools (✕8), the legacy global helm row (✕6 the six helm_* tools),
// hivemind comms (hive_signal/listen/sent/retire), and evolution's
// orchestration cargo (hive_dispatch/send/children/doctrine). The W work set
// (dsh-tool-bash etc.) is NOT mounted here — its injectors (shell,
// shellEnv, workingDirectory) are bundle services outside this unit harness;
// W-census exactness belongs to the helm suite's role-gate tests and the
// staged live bench (see the phase-3 impl log). Every assertion below is a
// §4 discriminator provable with THIS census — never absence-by-not-installed.
//
// Proves:
//   1. a HELM role-composed agent (helmsman, blank depth-0) is EXEMPT from
//      the dormant gate: comms/board reads stay visible while the role gate
//      itself subtracts orchestration cargo — no mask fights the census,
//   2. a blank Standard→helmsman SELECTION lifts the dormant holds and
//      composes the role surface; leaving re-enters the ordinary decideGate
//      path (deny re-applies) — both directions,
//   3. /awaken REFUSES on a role composition instead of installing doctrine
//      that fights the gate,
//   4. the dispatch-filter listener cannot overlay a stale builtin ledger
//      row onto a role child.
//
// HARD RULE (family recipe): the live store is NEVER written — fixtures in
// tmp; both plugins read a FAKE agentPresets service (real cordis Service
// registered under the canonical name) standing in for the registry.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import url from "node:url"
import { Context, Service } from "@deepseek-ai/cordis"

const HERE = path.dirname(url.fileURLToPath(import.meta.url))

class FakeAgentPresets extends Service {
  constructor(ctx) {
    super(ctx, "agentPresets")
    this.current = undefined
  }
  composedPreset(_agentCtx) {
    return this.current ?? undefined
  }
  async resolve(id) {
    return { id }
  }
}

const FIX = fs.mkdtempSync(path.join(os.tmpdir(), "helm-role-reconcile-"))
fs.mkdirSync(path.join(FIX, ".opencode/agents/capabilities"), { recursive: true })

const ctx = new Context()
const { createRequire } = await import("node:module")
// Resolve every dsh service from the PINNED web-profile store (0.2.2-rc.2):
// the profile's top-level hoist can carry a STALE dsh-tools (0.1.6-alpha.1)
// whose ToolsService lacks definitions() — the store path is corridor truth.
const WEBAPP_ROOT = "/root/.local/share/pnpm/store/v11/links/@deepseek-ai/dsh-web-app/0.2.2-rc.2/8ea328560c227e75055bbfc9ecb3cd63f8ba08c6f4a4d79ad5a4c45191ff119b/node_modules/@deepseek-ai/dsh-web-app"
const reqWeb = createRequire(path.join(WEBAPP_ROOT, "package.json"))
const SPMod = reqWeb("@deepseek-ai/dsh-system-prompt")
const SP = SPMod.default ?? SPMod.SystemPrompt
const ToolsMod = reqWeb("@deepseek-ai/dsh-tools")
const Tools = ToolsMod.default ?? ToolsMod.Tools
const CmdMod = reqWeb("@deepseek-ai/dsh-commands")
const Commands = CmdMod.default ?? CmdMod.CommandRuntime
const SubMod = reqWeb("@deepseek-ai/dsh-subagent")
const Subagents = SubMod.default ?? SubMod.SubagentRuntime

new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
new Commands(ctx, {})
new Subagents(ctx, {})
new FakeAgentPresets(ctx)
await new Promise((r) => setTimeout(r, 50))

const Board = (await import("@hive/dsh-board")).default
const DreamArchive = (await import("@hive/dsh-dream-archive")).default
const HiveDreamTools = (await import("@hive/dsh-tools")).default
const Painpoints = (await import("@hive/dsh-painpoints")).default
const Evolution = (await import("@hive/dsh-evolution")).default
const RoleGate = (await import("@hive/dsh-helm/role-gate")).default
const HelmPlugin = (await import("@hive/dsh-helm")).default
const HivemindClass = (await import("@hive/dsh-hivemind")).default

ctx.plugin(Board, { directory: FIX })
ctx.plugin(DreamArchive, { directory: FIX })
ctx.plugin(HiveDreamTools)
ctx.plugin(Painpoints, { directory: FIX })
ctx.plugin(RoleGate)
ctx.plugin(HelmPlugin, {})
new HivemindClass(ctx, { directory: FIX })
ctx.plugin(Evolution, { directory: FIX })
await new Promise((r) => setTimeout(r, 120))

// Precondition snapshot: what this composition really registered globally.
const GLOBAL = new Set(ctx.tools.definitions().map((d) => d.name))
const CHART = ["hive_board_list", "hive_board_search", "hive_board_read"]
const COMMS = ["hive_signal", "hive_listen", "hive_sent", "hive_retire"]
const HELM_TOOLS = ["helm_dispatch", "helm_status", "helm_prompt", "helm_collect", "helm_resume", "helm_cancel"]
const CARGO = ["hive_dispatch", "hive_send", "hive_children"]

const agentScope = (id, header = {}) => {
  const a = { id, session: { id, header }, followup: () => {} }
  a.ctx = reqWeb("@deepseek-ai/dsh-scope").createScope(ctx, a, {}).ctx
  return a
}

test("precondition: the harness census carries chart+comms+helm+cargo (not absence-by-not-installed)", () => {
  for (const n of [...CHART, ...COMMS, ...HELM_TOOLS, ...CARGO]) {
    assert.ok(GLOBAL.has(n), `${n} must be registered globally in this harness`)
  }
})

const HELM_SESSION = "ses_helm_helmsman"

// ── 1. helmsman composition is role-gated, dormant-exempt ───────────────────
const helmsman = agentScope(HELM_SESSION, {})
ctx.agentPresets.current = "helmsman"
ctx.emit("agent/created", { agent: helmsman, source: "startup" })

test("role exemption: comms + chart reads survive (the dormant mask NEVER hides them)", () => {
  for (const n of [...CHART, ...COMMS, ...HELM_TOOLS]) {
    assert.ok(ctx.tools.get(n, helmsman) !== undefined,
      `${n} must be visible on the helmsman composition (§2.4 dormant exemption + role allow table)`)
  }
})

test("role gate subtracts cargo and chart mutation even though the dormant gate never ran", () => {
  for (const n of [...CARGO, "hive_board_bind", "hive_board_create"]) {
    assert.ok(ctx.tools.get(n, helmsman) === undefined, `${n} must be denied on helmsman`)
  }
  for (const n of [...CARGO, "hive_board_bind"]) {
    assert.ok(ctx.tools.get(n) !== undefined, `${n} stays global (scoped enforcement)`)
  }
})

// ── 2. selection transitions on a blank Standard session ────────────────────
const TRANSITION = "ses_helm_transition"
const transition = agentScope(TRANSITION, {})
ctx.agentPresets.current = undefined
ctx.emit("agent/created", { agent: transition, source: "startup" })
// NOTE: each transition + its assertions live INSIDE one test body — the
// emissions mutate shared state, so the assertion that pins a step must run
// after THAT emit exactly (node:test bodies run after the whole module load).

test("blank standard: dormant deny applies (comms+cargo hidden; chart reads are the OPEN surface)", () => {
  for (const n of [...COMMS, ...CARGO, "hive_board_bind"]) {
    assert.ok(ctx.tools.get(n, transition) === undefined, `${n} dormant-masked on blank standard`)
  }
  for (const n of [...CHART, ...HELM_TOOLS]) {
    assert.ok(ctx.tools.get(n, transition) !== undefined, `${n} open on blank standard`)
  }
})

test("entering a role lifts the dormant holds and composes the role surface", () => {
  ctx.agentPresets.current = "helmsman"
  // BEFORE: the dormant holds hide comms (a real prior state, §2.4's bug case)
  assert.ok(ctx.tools.get("hive_signal", transition) === undefined, "precondition: comms dormant-masked before the selection")
  ctx.emit("agent-preset/selected", TRANSITION, "helmsman")
  for (const n of [...CHART, ...COMMS]) {
    assert.ok(ctx.tools.get(n, transition) !== undefined, `${n} visible after committed selection`)
  }
  for (const n of [...CARGO, "hive_board_bind", "hive_board_create"]) {
    assert.ok(ctx.tools.get(n, transition) === undefined, `${n} denied by the role gate after selection`)
  }
})

test("leaving the role re-enters the ordinary decideGate path (dormant deny re-applies)", () => {
  ctx.agentPresets.current = undefined
  ctx.emit("agent-preset/selected", TRANSITION, "standard")
  for (const n of [...COMMS, ...CARGO, "hive_board_bind"]) {
    assert.ok(ctx.tools.get(n, transition) === undefined, `${n} dormant-masked again on the way out`)
  }
  for (const n of [...CHART, ...HELM_TOOLS]) {
    assert.ok(ctx.tools.get(n, transition) !== undefined, `${n} open again on standard`)
  }
})

// ── 3. /awaken refuses on a role composition ────────────────────────────────
const awakenCmd = ctx.commands.find(undefined, "awaken")
test("/awaken refuses a HELM role composition instead of flipping it", async () => {
  assert.ok(awakenCmd)
  // The fake registry's composedPreset read IS the composition — restore the
  // helmsman composition for the probe (the earlier transition test left the
  // global current on standard).
  ctx.agentPresets.current = "helmsman"
  const out = await awakenCmd.handler({
    rawInput: "role guard probe",
    agent: helmsman,
    commandId: "c_helm_role_awaken",
    attachments: [],
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(out.kind, "error", "/awaken must refuse on a role session")
  assert.match(String(out.text), /HELM role/, `refusal names the role gate: ${String(out.text)}`)
  const ledgerPath = path.join(FIX, ".opencode/agents/hive-sessions.json")
  if (fs.existsSync(ledgerPath)) {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"))
    assert.ok(!ledger.coordinators?.[HELM_SESSION], "no awaken ledger entry for the role session")
  }
})

// ── 4. the dispatch-filter listener cannot overlay a stale builtin row ──────
const BOSUN_SESSION = "ses_helm_bosun_child"
fs.mkdirSync(path.join(FIX, ".opencode"), { recursive: true })
fs.writeFileSync(path.join(FIX, ".opencode", "hive-usage.jsonl"), `${JSON.stringify({
  kind: "dispatch-activated",
  childId: BOSUN_SESSION,
  address: "builtin/dreamcatcher",
  shape: "one-shot",
  at: new Date().toISOString(),
})}\n`)
const bosunChild = agentScope(BOSUN_SESSION, { delegationDepth: 1, origin: "subagent" })
ctx.agentPresets.current = "bosun"
ctx.emit("agent/created", { agent: bosunChild, source: "startup" })

test("a stale builtin ledger row cannot overlay the bosun role census", () => {
  for (const n of HELM_TOOLS) {
    assert.ok(ctx.tools.get(n, bosunChild) !== undefined, `bosun keeps ${n} despite the stale dreamcatcher row`)
  }
  for (const n of [...COMMS, ...CHART.filter((n) => n !== "hive_board_read"), ...CARGO]) {
    assert.ok(ctx.tools.get(n, bosunChild) === undefined, `bosun still denies ${n} (role census governs)`)
  }
})

// ── cleanup ─────────────────────────────────────────────────────────────────
test("fixture cleanup", () => {
  fs.rmSync(FIX, { recursive: true, force: true })
  assert.ok(true)
})
