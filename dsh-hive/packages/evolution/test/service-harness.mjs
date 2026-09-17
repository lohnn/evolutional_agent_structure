// Phase-3 service-harness gate: boot the Evolution service against a
// synthetic workspace and drive the roster injection, the energy tick (via a
// simulated agent/session-start), the commands, and spawn/dissolve through
// the real dsh services.
import { Context } from "@deepseek-ai/cordis"
import Evolution from "@hive/dsh-evolution"
// The shared composer, imported through the package's ./lib exports map — the
// status-dossier REUSE check compares the summoned tool's output against this
// exact function's output (a reimplementation would drift from the dossier).
import { composeEcosystemSnapshot } from "@hive/dsh-evolution/lib/snapshot"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

const results = []
const check = (id, ok, detail) => {
  results.push({ ok })
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`)
}

const synth = fs.mkdtempSync(path.join(os.tmpdir(), "p3-evo-"))
fs.mkdirSync(path.join(synth, ".opencode/agents/capabilities"), { recursive: true })

const ctx = new Context()
const { createRequire } = await import("node:module")
const require = createRequire("/root/.dsh/profiles/web/package.json")

// Mount the real dsh services the evolution plugin injects, mirroring the
// profile's load order (systemPrompt + tools before our plugins).
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

new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
new Commands(ctx, {})
new Subagents(ctx, {})
await new Promise((r) => setTimeout(r, 50))

ctx.plugin(Evolution, { directory: synth })
await new Promise((r) => setTimeout(r, 50))

check("boot.service", ctx.evolution?.directory === synth, "ctx.evolution registered")

// ── Roster injection ────────────────────────────────────────────────────────
// Seed one capability (legacy md form) and confirm the roster section renders.
fs.writeFileSync(
  path.join(synth, ".opencode/agents/capabilities/alpha.md"),
  "---\nname: alpha\ndescription: the alpha capability\nenergy: 50\n---\n\n# alpha\n"
)
const roster = ctx.evolution.buildRoster()
check("roster.renders", roster.includes("alpha") && roster.includes("energy: 50"), "buildRoster lists the capability")

// The section is registered under hive:roster at order 50 — verify it lands
// in an assembly between persona(0) and the tool sections.
const assembly = await ctx.systemPrompt.assemble?.({}).catch?.(() => undefined)
if (assembly?.sections) {
  const names = assembly.sections.map((s) => s.name)
  check("roster.section", names.includes("hive:roster"), `hive:roster in assembly (${names.join(",")})`)
  const rosterSection = assembly.sections.find((s) => s.name === "hive:roster")
  check("roster.section-text", rosterSection?.text?.includes("alpha") === true, "assembly roster text is live")
} else {
  // Older systemPrompt surface: assert the section renders via buildRoster
  check("roster.section", roster.includes("alpha"), "roster renders (assembly surface not exposed in harness)")
}

// ── Spawn → preset materialized ─────────────────────────────────────────────
const dir = ctx.evolution.spawn("beta", "the beta capability")
check("spawn.preset", fs.existsSync(path.join(dir, "preset.yml")) && fs.existsSync(path.join(dir, "agent.cordis.yml")), "spawn writes preset.yml + agent.cordis.yml")
check("spawn.ledger", fs.readFileSync(path.join(synth, ".opencode/agents/capabilities/beta.md"), "utf8").includes("energy: 50"), "spawn seeds energy ledger at 50")
check("spawn.roster", ctx.evolution.buildRoster().includes("beta"), "roster includes the spawned capability")

// Duplicate spawn refused.
let refused = false
try { ctx.evolution.spawn("beta", "again") } catch { refused = true }
check("spawn.duplicate-refused", refused, "duplicate spawn refused")

// Invalid name refused.
let badRefused = false
try { ctx.evolution.spawn("Bad Name!", "x") } catch { badRefused = true }
check("spawn.name-validated", badRefused, "invalid name refused")

// ── Energy tick via the service + simulated session starts ──────────────────
// Use alpha in a "session" (markUsed), then tick — alpha boosted, beta decayed.
ctx.evolution.markUsed("alpha", "ses_harness_1")
const t1 = ctx.evolution.tick()
check("tick.ran", t1.skipped === false, "first tick ran")
const alphaTick = t1.results.find((r) => r.name === "alpha")
const betaTick = t1.results.find((r) => r.name === "beta")
check("tick.boost", alphaTick?.newEnergy === 60, `alpha boosted 50→60 (used), got ${alphaTick?.newEnergy}`)
check("tick.decay", betaTick?.newEnergy === 40, `beta decayed 50→40 (unused), got ${betaTick?.newEnergy}`)

// A second same-day tick (a second "session start") must skip — the tick is
// idempotent within a day, which is what makes per-session-start firing safe.
const t2 = ctx.evolution.tick()
check("tick.idempotent", t2.skipped === true, "second same-day tick skipped")

// The tick also fired on the service's agent/created listener when the
// event fires — emit it and confirm no throw + the skip path is taken.
// (The event NAME is asserted real by test/event-catalog-guard.test.mjs; if
// the harness renames it, that guard fails first and points here.)
let listenerOk = true
try { ctx.emit("agent/created", { agent: { id: "a", session: { id: "ses_x" } }, source: "startup" }) } catch { listenerOk = false }
check("tick.event-wired", listenerOk, "agent/created listener fired without error")

// ── markUsed emits the bookkeeping event ────────────────────────────────────
let usedEvent = null
const dispose = ctx.on("hive/capability-used", (name, sessionId) => { usedEvent = { name, sessionId } })
ctx.evolution.markUsed("beta", "ses_harness_2")
dispose()
check("markUsed.event", usedEvent?.name === "beta" && usedEvent?.sessionId === "ses_harness_2", "hive/capability-used emitted")

// ── Commands registered ─────────────────────────────────────────────────────
// /awaken joined the lifecycle four (T2/D1); /status joins them last (T6/D8-2).
// All of these gate on an AWAKENED coordinator except /awaken itself, which
// opens the gate.
const cmdNames = ["tick", "spawn", "evolve", "dissolve", "awaken", "status"]
const registered = cmdNames.filter((n) => ctx.commands.find(undefined, n) !== undefined)
check("commands.registered", registered.length === 6, `commands visible: ${registered.join(", ") || "(none)"}`)

// ── Command-summoned lifecycle tools (WI-037) ───────────────────────────────
// Commands refuse without a live receiving agent (they never mutate directly).
const tickCmd = ctx.commands.find(undefined, "tick")
if (tickCmd) {
  const out = await tickCmd.handler({ rawInput: "", agent: undefined, commandId: "c1", attachments: [], signal: AbortSignal.timeout(1000) })
  check("summon.no-agent", out.kind === "error" && /live receiving agent/.test(out.text ?? ""), "command without agent is refused (no direct mutation)")
}

// With a fake agent on a scoped context: the handler registers a SCOPED tool
// on the agent's ctx and wakes the model. The tool exists only on the agent
// scope, fires once, and retracts itself. The GLOBAL layer never sees it.
const followups = []
const fakeAgent = { id: "agent_fake", followup: (msg) => { followups.push(msg) } }
// Mint a REAL registration scope with the agent object as its key — the exact
// shape dsh gives a live Agent (`agent.ctx` scoped, key = the Agent).
const fakeScope = createScope(ctx, fakeAgent, {})
const fakeCtx = fakeScope.ctx
fakeAgent.ctx = fakeCtx
// The fake coordinator is AWAKENED for the summon tests: T2's D2 gate refuses
// lifecycle commands for dormant sessions, so the harness records it in the
// awaken ledger first (the /awaken flow itself gets its own test below).
fs.mkdirSync(path.join(synth, ".opencode/agents"), { recursive: true })
fs.writeFileSync(
  path.join(synth, ".opencode/agents/hive-sessions.json"),
  JSON.stringify({ v: 1, coordinators: { agent_fake: { agent: "gate", awakenedAt: new Date().toISOString(), lastAwakenInput: "" } } }, null, 2)
)
const spawnCmd = ctx.commands.find(undefined, "spawn")
if (spawnCmd) {
  const out = await spawnCmd.handler({
    rawInput: "gamma — the gamma capability",
    agent: fakeAgent,
    commandId: "c2",
    attachments: [],
    signal: AbortSignal.timeout(1000),
  })
  check("summon.ok", out.kind === "success" && /summoned/.test(out.text ?? ""), "/spawn handler summons the scoped tool")
  check("summon.woke-model", followups.length === 1 && followups[0].content[0].text.includes("hive_spawn"), "model woken with a turn message naming the summoned tool")
  check("summon.not-global", ctx.tools.get("hive_spawn") === undefined, "hive_spawn absent from the global tool layer")
  const scoped = ctx.tools.get("hive_spawn", fakeAgent)
  check("summon.scoped-visible", scoped !== undefined, "hive_spawn visible on the agent scope")
  if (scoped) {
    const result = await scoped.execute({}, { agent: fakeAgent, signal: AbortSignal.timeout(1000) })
    check("summon.fired", String(result).includes("gamma"), "the summoned hive_spawn executed (string result)")
    check("summon.mutated", fs.existsSync(path.join(synth, ".opencode/agents/capabilities/gamma/preset.yml")), "the summoned tool (not the handler) materialized the capability")
    check("summon.retracted", ctx.tools.get("hive_spawn", fakeAgent) === undefined, "hive_spawn retracted after firing (turn-scoped)")
  } else {
    check("summon.fired", false, "scoped tool not resolvable — cannot execute")
  }
}

// /evolve with a fake agent: summons hive_evolve, which returns the roster.
const evolveCmd2 = ctx.commands.find(undefined, "evolve")
if (evolveCmd2) {
  const before = followups.length
  const out = await evolveCmd2.handler({ rawInput: "", agent: fakeAgent, commandId: "c3", attachments: [], signal: AbortSignal.timeout(1000) })
  check("evolve.summons", out.kind === "success" && followups.length === before + 1, "/evolve summons hive_evolve + wakes the model")
  const tool = ctx.tools.get("hive_evolve", fakeAgent)
  check("evolve.scoped", tool !== undefined, "hive_evolve scoped on the agent")
  if (tool) {
    const roster = await tool.execute({}, { agent: fakeAgent, signal: AbortSignal.timeout(1000) })
    check("evolve.roster", String(roster).includes("gamma"), "hive_evolve returns the live roster (incl. summoned gamma)")
  }
}

// ── Dissolve → archived, removed from roster ────────────────────────────────
ctx.evolution.dissolve("beta")
check("dissolve.moved", fs.existsSync(path.join(synth, ".opencode/agents/dissolved/beta.md")) && !fs.existsSync(path.join(synth, ".opencode/agents/capabilities/beta.md")), "dissolve archives the ledger")
check("dissolve.dir-moved", fs.existsSync(path.join(synth, ".opencode/agents/dissolved/beta/preset.yml")) && !fs.existsSync(path.join(synth, ".opencode/agents/capabilities/beta")), "dissolve archives the preset dir")
check("dissolve.roster", !ctx.evolution.buildRoster().includes("beta"), "roster no longer lists the dissolved capability")

// ── T2: dormant lifecycle commands refuse with the awaken hint (D2) ──────────
{
  const dormantAgent = { id: "ses_dormant_cmds", followup: () => {} }
  const dormantScope = createScope(ctx, dormantAgent, {})
  dormantAgent.ctx = dormantScope.ctx
  const spawnCmdDormant = ctx.commands.find(undefined, "spawn")
  const out = await spawnCmdDormant.handler({ rawInput: "nope — refused capability", agent: dormantAgent, commandId: "c_gate", attachments: [], signal: AbortSignal.timeout(1000) })
  check("gate.command-refused", out.kind === "error" && /\/awaken/.test(out.text ?? ""), "/spawn in a dormant session refuses with the awaken hint")
  check("gate.command-no-mutation", !fs.existsSync(path.join(synth, ".opencode/agents/capabilities/nope")), "refused command materialized nothing")
  const tickOut = await ctx.commands.find(undefined, "tick").handler({ rawInput: "", agent: dormantAgent, commandId: "c_gate2", attachments: [], signal: AbortSignal.timeout(1000) })
  check("gate.tick-refused", tickOut.kind === "error" && /\/awaken/.test(tickOut.text ?? ""), "/tick refuses the same way")
}

// ── T2: awaken gate on agent/created — deny / skip / lift ────────────────────
// Fakes mirror the real runtime face the gate reads: `session.id` resolves the
// session, `session.header.delegationDepth` discriminates lineage (verified
// against dsh-agent 0.1.6-alpha.1: Agent exposes session; Session.header is
// always present; depth is persisted = parent+1 for children).
{
  const gateAgent = { id: "ses_gate_a", session: { id: "ses_gate_a", header: {} }, followup: () => {} }
  const gateScope = createScope(ctx, gateAgent, {})
  gateAgent.ctx = gateScope.ctx
  ctx.emit("agent/created", { agent: gateAgent, source: "startup" })
  check("gate.deny-hive-absent", ctx.tools.get("hive_dispatch", gateAgent) === undefined && ctx.tools.get("hive_signal", gateAgent) === undefined, "dormant top-level agent: hive tools read as ABSENT (scoped restrict)")
  check("gate.deny-global-intact", ctx.tools.get("hive_dispatch") !== undefined, "the restriction is scoped — global layer untouched")

  const childAgent = { id: "ses_gate_child", session: { id: "ses_gate_child", header: { delegationDepth: 1 } }, followup: () => {} }
  const childScope = createScope(ctx, childAgent, {})
  childAgent.ctx = childScope.ctx
  ctx.emit("agent/created", { agent: childAgent, source: "startup" })
  check("gate.skip-child", ctx.tools.get("hive_dispatch", childAgent) !== undefined, "depth>0 child (dispatch worker / one-shot dreamcatcher): exempt, hive tools present")

  // /awaken lifts the deny on the SAME session id (the handler holds the
  // receiving agent; the disposers were keyed by session for exactly this).
  const awakenCmd = ctx.commands.find(undefined, "awaken")
  check("awaken.registered", awakenCmd !== undefined, "/awaken command registered")
  const awakenFollowups = []
  const awakenAgent = { id: "ses_awaken_1", session: { id: "ses_awaken_1", header: {} }, followup: (m) => { awakenFollowups.push(m) } }
  const awakenScope = createScope(ctx, awakenAgent, {})
  awakenAgent.ctx = awakenScope.ctx
  ctx.emit("agent/created", { agent: awakenAgent, source: "startup" })
  check("gate.awaken-starts-denied", ctx.tools.get("hive_dispatch", awakenAgent) === undefined, "/awaken flow precondition: session starts dormant")

  const out = await awakenCmd.handler({ rawInput: "port the awaken flow to dsh", agent: awakenAgent, commandId: "c_awaken", attachments: [], signal: AbortSignal.timeout(1000) })
  check("awaken.success", out.kind === "success", `/awaken handler succeeded (${out.text?.slice(0, 60)})`)
  const ledger = JSON.parse(fs.readFileSync(path.join(synth, ".opencode/agents/hive-sessions.json"), "utf8"))
  check("awaken.registry", ledger.coordinators.ses_awaken_1?.agent === "awaken" || (ledger.coordinators.ses_awaken_1 && ledger.coordinators.ses_awaken_1.lastAwakenInput === "port the awaken flow to dsh"), "registry records the flip with the raw input")
  check("awaken.lifted", ctx.tools.get("hive_dispatch", awakenAgent) !== undefined, "the held restriction was lifted — hive tools present after the flip")
  check("awaken.brief", awakenFollowups.length === 1 && awakenFollowups[0].content[0].text.includes("hive_awaken_spawn") && awakenFollowups[0].content[0].text.includes("dreamcatcher") && awakenFollowups[0].content[0].text.includes("HIVE Ecosystem Dossier") && awakenFollowups[0].content[0].text.includes("port the awaken flow to dsh"), "brief carries summon name + mandatory dreamcatcher recall + dossier + raw input")

  // The summoned batch tool: structured persona manifests, invalid entries
  // refused line-by-line, tool retracts after firing.
  const batch = ctx.tools.get("hive_awaken_spawn", awakenAgent)
  check("awaken.batch-scoped", batch !== undefined, "hive_awaken_spawn scoped to the awakening agent")
  if (batch) {
    const result = await batch.execute(
      {
        capabilities: [
          {
            name: "delta",
            description: "the delta capability",
            persona: { enables: "enables delta work", triggers: "when delta work appears", boundaries: "never touches alpha" },
          },
          { name: "Bad Name!", description: "invalid" },
          { name: "zeta", description: "the zeta capability", persona: { enables: "" } },
        ],
      },
      { agent: awakenAgent, signal: AbortSignal.timeout(1000) }
    )
    const text = String(result)
    check("awaken.batch-manifest", text.includes("Spawning delta") && text.includes("✓ manifested"), "batch tool manifests the valid entry")
    check("awaken.batch-refuses", text.includes("✗ refused"), "batch tool reports invalid entries line-by-line")
    check("awaken.batch-retracted", ctx.tools.get("hive_awaken_spawn", awakenAgent) === undefined, "batch tool retracts after the single call")
    const yml = fs.readFileSync(path.join(synth, ".opencode/agents/capabilities/delta/agent.cordis.yml"), "utf8")
    check("awaken.persona-sections", yml.includes("## What This Enables") && yml.includes("## Activation Triggers") && yml.includes("## Boundaries"), "persona renders as structured template sections")
    check("awaken.ledger-seeded", fs.readFileSync(path.join(synth, ".opencode/agents/capabilities/delta.md"), "utf8").includes("energy: 50"), "persona spawn still seeds the energy ledger at 50")
  }

  // Re-awaken variant: same session again → no registry flip, evolution brief.
  const awakenBefore = JSON.parse(fs.readFileSync(path.join(synth, ".opencode/agents/hive-sessions.json"), "utf8")).coordinators.ses_awaken_1.awakenedAt
  const followupsBefore = awakenFollowups.length
  const out2 = await awakenCmd.handler({ rawInput: "analyze gaps again", agent: awakenAgent, commandId: "c_awaken2", attachments: [], signal: AbortSignal.timeout(1000) })
  const ledgerAfter = JSON.parse(fs.readFileSync(path.join(synth, ".opencode/agents/hive-sessions.json"), "utf8"))
  check("awaken.reawaken-no-flip", out2.kind === "success" && ledgerAfter.coordinators.ses_awaken_1.awakenedAt === awakenBefore, "re-awaken leaves the registry untouched")
  check("awaken.reawaken-evolve", awakenFollowups.length === followupsBefore + 1 && awakenFollowups.at(-1).content[0].text.includes("hive_evolve"), "re-awaken summons the evolution analysis instead")
}

// ── T2: spawn without persona — pinned byte-identical output ──────────────────
// The no-persona path must keep typing the pre-T2 yml byte for byte (the
// minimal two-line spawn stays valid, D7); persona sections ride ABOVE it.
{
  const epsDir = ctx.evolution.spawn("epsilon", "epsilon capability")
  const yml = fs.readFileSync(path.join(epsDir, "agent.cordis.yml"), "utf8")
  const expected = [
    "# The `epsilon` capability preset — spawned by /spawn.",
    "# Persona + mounted tools are edited here; energy lives in the sibling",
    "# `epsilon.md` ledger that the tick manages.",
    "- id: persona",
    "  name: '@deepseek-ai/dsh-persona'",
    "  config:",
    "    text: |-",
    "      You are the epsilon capability: epsilon capability",
    "",
  ].join("\n")
  check("spawn.nopersona-byte-identity", yml === expected, "no-persona agent.cordis.yml is byte-identical to the pre-T2 output")
}

// T4: /spawn's summoned tool takes the persona — the model authors the method.
{
  const spawnCmdT4 = ctx.commands.find(undefined, "spawn")
  const followupsBeforeT4 = followups.length
  const outT4 = await spawnCmdT4.handler({ rawInput: "theta — the theta capability", agent: fakeAgent, commandId: "c_t4", attachments: [], signal: AbortSignal.timeout(1000) })
  check("t4.summon-ok", outT4.kind === "success" && followups.length === followupsBeforeT4 + 1, "/spawn with persona authoring summons hive_spawn")
  check("t4.wake-teaches-persona", followups.at(-1).content[0].text.includes("Author its persona"), "wake brief tells the model to author the method sections")
  const toolT4 = ctx.tools.get("hive_spawn", fakeAgent)
  if (toolT4) {
    await toolT4.execute(
      { persona: { enables: "enables theta work", triggers: "when theta work appears", protocol: "do theta things carefully" } },
      { agent: fakeAgent, signal: AbortSignal.timeout(1000) }
    )
    const ymlT4 = fs.readFileSync(path.join(synth, ".opencode/agents/capabilities/theta/agent.cordis.yml"), "utf8")
    check("t4.persona-rendered", ymlT4.includes("## What This Enables") && ymlT4.includes("## Operating Protocol"), "/spawn persona renders as template sections in the preset")
    check("t4.identityline-first", ymlT4.includes("You are the theta capability: the theta capability"), "identity line still leads the persona block")
  } else {
    check("t4.persona-rendered", false, "hive_spawn not resolvable — cannot execute")
  }
}

// /awaken with no receiving agent: same refusal contract as the other commands.
{
  const noAgentOut = await ctx.commands.find(undefined, "awaken").handler({ rawInput: "", agent: undefined, commandId: "c_awaken3", attachments: [], signal: AbortSignal.timeout(1000) })
  check("awaken.no-agent", noAgentOut.kind === "error" && /live receiving agent/.test(noAgentOut.text ?? ""), "/awaken without an agent refuses (no registry write)")
}

// ── T6: /status — the shared-composer view command (D8 item 2) ────────────────
// /status is the coordinator's read-only view: requireAwake gate first (D2 —
// status is a coordinator view, a dormant session gets the awaken hint), then
// the summon pattern (turn-scoped hive_status whose run() returns the EXACT
// composeEcosystemSnapshot output /awaken's dossier and the re-awaken analysis
// use — reuse, never a reimplementation).
{
  const statusCmd = ctx.commands.find(undefined, "status")
  const dormantStatusAgent = { id: "ses_dormant_status", followup: () => {} }
  const dormantStatusScope = createScope(ctx, dormantStatusAgent, {})
  dormantStatusAgent.ctx = dormantStatusScope.ctx
  const dormantOut = await statusCmd.handler({ rawInput: "", agent: dormantStatusAgent, commandId: "c_t6_status", attachments: [], signal: AbortSignal.timeout(1000) })
  check("status.dormant-refused", dormantOut.kind === "error" && /\/awaken/.test(dormantOut.text ?? ""), "/status in a dormant session refuses with the awaken hint (D2)")
  check("status.dormant-no-summon", ctx.tools.get("hive_status", dormantStatusAgent) === undefined, "refused /status summons nothing (gate first)")

  const beforeStatus = followups.length
  const out = await statusCmd.handler({ rawInput: "", agent: fakeAgent, commandId: "c_t6_status2", attachments: [], signal: AbortSignal.timeout(1000) })
  check("status.summons", out.kind === "success" && followups.length === beforeStatus + 1, "/status summons hive_status and wakes the model")
  check("status.wake-brief", followups.at(-1).content[0].text.includes("hive_status") && followups.at(-1).content[0].text.includes("relay the roster, the void, and the last tick"), "wake brief names the summoned tool + the relay instruction (no invented data)")
  const statusTool = ctx.tools.get("hive_status", fakeAgent)
  check("status.scoped", statusTool !== undefined, "hive_status scoped on the agent, invisible to the global layer")
  check("status.not-global", ctx.tools.get("hive_status") === undefined, "hive_status never touches the global tool layer")
  if (statusTool) {
    const dossier = String(await statusTool.execute({}, { agent: fakeAgent, signal: AbortSignal.timeout(1000) }))
    check(
      "status.dossier",
      dossier.includes("HIVE Ecosystem Dossier") &&
        dossier.includes("### Roster (active capabilities)") &&
        /gamma — energy: \d+/.test(dossier) &&
        dossier.includes("The Void (dissolved capabilities)"),
      "hive_status returns the dossier: header + roster line + the void (dissolved beta lists there)"
    )
    // The reuse contract, byte-exact: the summoned tool's output IS the shared
    // composer's output (a status view drifting from /awaken's dossier would
    // be the bug this check exists to catch).
    check("status.dossier-reuse", dossier === composeEcosystemSnapshot(ctx.evolution.snapshotSource()), "tool output === composeEcosystemSnapshot(snapshotSource()) byte-for-byte")
    check("status.retracts", ctx.tools.get("hive_status", fakeAgent) === undefined, "hive_status retracts after firing (turn-scoped, like every summon)")
  }
}

// ── T6: the compaction seam — agent/created with source:"compact" ─────────────
// dsh has no standalone compaction event: a summarized session RE-PUBLISHES
// with source "compact" (SessionStartSource, live 0.1.6-alpha.1). On an
// awakened top-level coordinator (gate decision "doctrine") that registers a
// one-shot scoped hive:post-compaction re-anchor; on deny (dormant) or any
// non-compact source it registers NOTHING extra. The dreamArchive service is
// OPTIONAL (ctx.get, never static inject), so both availability paths are
// asserted here via a mounted fake — the with-pointers path, then the
// dropped-archive fallback a standalone-evolution install would take.
{
  // Six dreams, most recent first — the service caps at 5 (POST_COMPACTION_DREAM_LIMIT).
  const fakeDreams = [
    { dreamId: "DRM-019", intention: "consolidate the /awaken port — gate, doctrine, briefs", artifacts: ["I-048", "W-019"] },
    { dreamId: "DRM-018", intention: "energy tick repair lessons", artifacts: ["I-050"] },
    { dreamId: "DRM-017", intention: "dispatch material transport", artifacts: ["SNG-018"] },
    { dreamId: "DRM-016", intention: "board stitching notes", artifacts: [] },
    { dreamId: "DRM-015", intention: "dual-run findings", artifacts: ["I-041"] },
    { dreamId: "DRM-014", intention: "oldest — beyond the cap, must be dropped", artifacts: ["I-040"] },
  ]
  const dropArchive = ctx.provide("dreamArchive", {
    directory: synth,
    recentPreCompactionDreams: (limit = 5) => fakeDreams.slice(0, limit),
  })
  const ledgerPath = path.join(synth, ".opencode/agents/hive-sessions.json")
  const mergeLedger = (sessionId) => {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"))
    ledger.coordinators[sessionId] = { agent: "status", awakenedAt: new Date().toISOString(), lastAwakenInput: "" }
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2))
  }
  const makeAwakenedAgent = (sessionId) => {
    const a = { id: sessionId, session: { id: sessionId, header: {} }, followup: () => {} }
    const scope = createScope(ctx, a, {})
    a.ctx = scope.ctx
    mergeLedger(sessionId)
    return a
  }

  // 1) awakened + compact → doctrine AND the re-anchor, ordered 55 < 56.
  const compactAgent = makeAwakenedAgent("ses_compact_1")
  ctx.emit("agent/created", { agent: compactAgent, source: "compact" })
  const asmC = await ctx.systemPrompt.assemble({ scope: compactAgent })
  const namesC = asmC.sections.map((s) => s.name)
  const doctrineIdx = namesC.indexOf("hive:doctrine")
  const compactIdx = namesC.indexOf("hive:post-compaction")
  check("compact.section-registered", compactIdx >= 0, `source:"compact" + doctrine decision registers the scoped re-anchor (sections: ${namesC.join(",")})`)
  check("compact.section-after-doctrine", doctrineIdx >= 0 && doctrineIdx < compactIdx, "re-anchor renders after doctrine (55 < 56)")
  const sectionC = asmC.sections.find((s) => s.name === "hive:post-compaction")
  const textC = String(sectionC?.text ?? "")
  check("compact.section-header", textC.includes("== [HIVE] context restored after compaction"), "block opens with the re-anchor header")
  check("compact.section-summary", textC.includes("Active capabilities:") && textC.includes("- alpha (energy:"), "block carries the getCapabilitiesSummary energy summary")
  check(
    "compact.section-pointers",
    textC.includes("DRM-019 (pre-compaction, artifacts: I-048, W-019) — consolidate the /awaken port") &&
      textC.includes("(pre-compaction, artifacts: none)"),
    "pointer lines keep the dreamPointerLine shape (artifact list and the 'none' form)"
  )
  check("compact.section-cap", (textC.match(/\(pre-compaction, artifacts:/g) ?? []).length === 5 && textC.includes("DRM-015") && !textC.includes("DRM-014"), `capped at 5 most recent dreams (6 offered)`)
  check("compact.section-reminder", textC.includes('hive_dream_query(ids:"<artifact ids>")') && textC.includes("hive_dream_rank"), "block carries the post-compaction retrieval reminder")
  dropArchive()

  // 2) awakened + compact + archive DROPPED → the honest fallback line, no
  //    pointers (the optional-service degradation the service ships with).
  const compactAgent2 = makeAwakenedAgent("ses_compact_2")
  ctx.emit("agent/created", { agent: compactAgent2, source: "compact" })
  const s2Text = String((await ctx.systemPrompt.assemble({ scope: compactAgent2 })).sections.find((s) => s.name === "hive:post-compaction")?.text ?? "")
  check(
    "compact.fallback-no-archive",
    s2Text.includes("== [HIVE] context restored after compaction") &&
      s2Text.includes("dream archive is not mounted") &&
      !s2Text.includes("(pre-compaction, artifacts:"),
    "absent dreamArchive degrades the section to the fallback line, zero pointers"
  )

  // 3) dormant + compact → deny branch → re-anchor (and doctrine) absent; the
  //    dormant explainer is still what renders.
  const dormantCompact = { id: "ses_compact_dormant", session: { id: "ses_compact_dormant", header: {} }, followup: () => {} }
  const dormantCompactScope = createScope(ctx, dormantCompact, {})
  dormantCompact.ctx = dormantCompactScope.ctx
  ctx.emit("agent/created", { agent: dormantCompact, source: "compact" })
  const namesDC = (await ctx.systemPrompt.assemble({ scope: dormantCompact })).sections.map((s) => s.name)
  check("compact.deny-branch-quiet", !namesDC.includes("hive:post-compaction") && !namesDC.includes("hive:doctrine") && namesDC.includes("hive:dormant"), `dormant + compact: no re-anchor, dormant explainer instead (${namesDC.join(",")})`)

  // 4) awakened + resume → the re-anchor is one-shot: it rides ONLY the
  //    compact republication (the next resume publishes "resume"), while
  //    doctrine re-applies from the persisted registry.
  const resumeAgent = makeAwakenedAgent("ses_resume_1")
  ctx.emit("agent/created", { agent: resumeAgent, source: "resume" })
  const namesR = (await ctx.systemPrompt.assemble({ scope: resumeAgent })).sections.map((s) => s.name)
  check("compact.resume-one-shot", namesR.includes("hive:doctrine") && !namesR.includes("hive:post-compaction"), `resume re-applies doctrine but never the compaction re-anchor (${namesR.join(",")})`)
}

fs.rmSync(synth, { recursive: true, force: true })
const failed = results.filter((r) => !r.ok)
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`)
process.exit(failed.length ? 1 : 0)
