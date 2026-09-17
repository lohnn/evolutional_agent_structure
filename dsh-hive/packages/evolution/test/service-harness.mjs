// Phase-3 service-harness gate: boot the Evolution service against a
// synthetic workspace and drive the roster injection, the energy tick (via a
// simulated agent/session-start), the commands, and spawn/dissolve through
// the real dsh services.
import { Context } from "@deepseek-ai/cordis"
import Evolution from "@hive/dsh-evolution"
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
const cmdNames = ["tick", "spawn", "evolve", "dissolve"]
const registered = cmdNames.filter((n) => ctx.commands.find(undefined, n) !== undefined)
check("commands.registered", registered.length === 4, `commands visible: ${registered.join(", ") || "(none)"}`)

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

fs.rmSync(synth, { recursive: true, force: true })
const failed = results.filter((r) => !r.ok)
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`)
process.exit(failed.length ? 1 : 0)
