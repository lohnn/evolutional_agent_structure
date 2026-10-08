// WI-066 runtime leg: the dormant OPEN surface, proven against a real
// (harness) composition — SP + Tools + Commands + Subagents + Board +
// Evolution booted from the pinned live-profile dsh modules, the gate
// listener firing on a real `agent/created` emission, and a real /awaken
// lift. Proves END-STATE, not gate-code claims (W-047):
//
//   1. a dormant depth-0 agent SEES the 7 open board tools (scoped
//      resolution — what the model would be served),
//   2. the SAME agent does NOT see the masked remainder of what THIS
//      composition registers (hive_board_bind + hive_dispatch) — schema-level
//      absence, the strongest negative (I-106 style),
//   3. the restriction is SCOPED: the global layer keeps everything,
//   4. the dormant explainer renders and NAMES the open tools (W-049:
//      assert actionability, not vague availability),
//   5. /awaken lifts the restriction: bind becomes resolvable on the same
//      session's scope and the explainer is replaced by doctrine,
//   6. a depth>0 child still takes the skip branch (sees bind too) and the
//      D5 module refusal stays the runtime boundary for it — the child can
//      CALL bind, the module refuses ownership (present-and-refusing, today's
//      behavior, unchanged).
//
// The negative sweep is TABLE-DRIVEN: census minus open surface parsed from
// evolution's source (the same source-truth the tool-gate-sync guard pins),
// intersected with what THIS composition actually registered. HARD RULE
// (family recipe): the live store is NEVER written — fixtures live in tmp.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import url from "node:url"
import { Context } from "@deepseek-ai/cordis"
import Board from "@hive/dsh-board"
import Evolution from "@hive/dsh-evolution"

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
const PKG = path.join(HERE, "..") // packages/evolution
const MONOREPO = path.join(PKG, "..", "..") // dsh-hive/

// ── source-truth lists (same parsers as tool-gate-sync.test.mjs) ────────────
const indexSrc = fs.readFileSync(path.join(PKG, "src", "index.ts"), "utf8")
const sliceConst = (name) => {
  const start = indexSrc.indexOf(`export const ${name}`)
  assert.ok(start >= 0, `${name} must exist in evolution src`)
  return indexSrc.slice(start, indexSrc.indexOf("]", start))
}
const census = new Set([...sliceConst("HIVE_TOOL_NAMES").matchAll(/"(hive_[a-z0-9_]+)"/g)].map((m) => m[1]))
const open = new Set([...sliceConst("HIVE_DORMANT_OPEN_TOOLS").matchAll(/"(hive_[a-z0-9_]+)"/g)].map((m) => m[1]))
const masked = new Set([...census].filter((n) => !open.has(n)))

// ── harness boot (mirror of service-harness.mjs / board-tools.test.mjs) ─────
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), "wi066-gate-"))
fs.mkdirSync(path.join(FIX, ".opencode/agents/capabilities"), { recursive: true })

const ctx = new Context()
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

new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
new Commands(ctx, {})
new Subagents(ctx, {})
await new Promise((r) => setTimeout(r, 50))

// Board BEFORE the gate emissions: its 8 globals must be registered so the
// deny filter can see them (W-088) and so "masked" vs "not installed" is
// distinguishable. Both plugins share the SAME tmp workspace (the gate's
// ledger and the board's store co-locate by directory, as in production).
// TOKEN-ECONOMY D4 leg: the dream + painpoints cohort is mounted too, so the
// standing dream-surface mask and the /dream toggle are provable against
// registrations that really exist (absence-by-restriction, not absence-by-
// not-installed).
ctx.plugin(Board, { directory: FIX })
const DreamArchive = (await import("@hive/dsh-dream-archive")).default
const HiveDreamTools = (await import("@hive/dsh-tools")).default
const Painpoints = (await import("@hive/dsh-painpoints")).default
ctx.plugin(DreamArchive, { directory: FIX })
ctx.plugin(HiveDreamTools)
ctx.plugin(Painpoints, { directory: FIX })
ctx.plugin(Evolution, { directory: FIX })
await new Promise((r) => setTimeout(r, 80))

const agentScope = (id, header = {}) => {
  const a = { id, session: { id, header }, followup: () => {} }
  const scope = createScope(ctx, a, {})
  a.ctx = scope.ctx
  return a
}

// The D5-B composition's agent factory (same shape, ctx2)
const agentScope2 = (c, id, header = {}) => {
  const a = { id, session: { id, header }, followup: () => {} }
  const scope = createScope(c, a, {})
  a.ctx = scope.ctx
  return a
}

// this composition now mounts board + dream + tools + painpoints + hivemind
// (D4/D5 legs), so "registered+masked" names are gate evidence for BOTH the
// dormant mask and the standing partitions that follow.
const registeredHive = census.size > 0
  ? [...census].filter((n) => ctx.tools.get(n) !== undefined)
  : []

// ── the dormant depth-0 session ──────────────────────────────────────────────
const dormant = agentScope("ses_wi066_dormant", {})
ctx.emit("agent/created", { agent: dormant, source: "startup" })

const OPEN_NAMES = [...open].sort()
const MASKED_REGISTERED = registeredHive.filter((n) => masked.has(n))

test("wi066: the dormant open surface is VISIBLE to an un-awakened depth-0 agent", () => {
  for (const name of OPEN_NAMES) {
    const def = ctx.tools.get(name, dormant)
    assert.ok(def, `${name} must resolve on the dormant agent's scope (the gate must not mask it)`)
  }
})

test("wi066: the masked remainder of the REGISTERED surface is ABSENT (schema-level)", () => {
  // Gate-meaningful only for names this composition registered: here that is
  // exactly the board cohort + hive_dispatch. Every one of them that the mask
  // covers must vanish from the dormant agent's scope.
  assert.ok(MASKED_REGISTERED.includes("hive_board_bind"), "precondition: this composition registers hive_board_bind")
  assert.ok(MASKED_REGISTERED.includes("hive_dispatch"), "precondition: this composition registers hive_dispatch")
  for (const name of MASKED_REGISTERED) {
    assert.equal(ctx.tools.get(name, dormant), undefined, `${name} must be ABSENT from the dormant agent's scope (schema-level, not runtime-refusal)`)
  }
})

test("wi066: the restriction is scoped — the global layer keeps every registration", () => {
  for (const name of [...OPEN_NAMES, ...MASKED_REGISTERED]) {
    assert.notEqual(ctx.tools.get(name), undefined, `${name} must stay registered at the global layer`)
  }
  // and the census minus open minus registered = absent-by-not-installed;
  // none of them may leak onto the dormant scope either way
  for (const name of [...masked].filter((n) => !registeredHive.includes(n))) {
    assert.equal(ctx.tools.get(name, dormant), undefined, `${name} not installed here; must not ghost onto the scope`)
  }
})

test("wi066: the dormant explainer renders and NAMES the open tools (W-049 actionability)", async () => {
  const assembly = await ctx.systemPrompt.assemble({ scope: dormant })
  const names = assembly.sections.map((s) => s.name)
  assert.ok(names.includes("hive:dormant"), `dormant section present (${names.join(",")})`)
  assert.ok(!names.includes("hive:doctrine"), "no doctrine for a dormant session")
  const text = String(assembly.sections.find((s) => s.name === "hive:dormant")?.text ?? "")
  assert.ok(!text.includes("{{"), "no unresolved placeholders")
  for (const name of OPEN_NAMES) {
    assert.ok(text.includes(name), `dormant explainer must NAME ${name} (a tool that exists is actable on; W-049)`)
  }
  assert.ok(text.includes("hive_board_bind"), "dormant explainer names the border too (bind stays awakened-only)")
})

// ── W-047: an ACTUAL authoring call from the dormant agent's context ─────────
// Visibility (earlier test) proves the toolset; this proves the un-awakened
// session can genuinely USE it — create lands on the board (un-owned) and its
// own tool lists it back. Runs BEFORE the /awaken test below (still dormant).
test("wi066: an ACTUAL create+list from the dormant agent's context hits the real board", async () => {
  const create = ctx.tools.get("hive_board_create", dormant)
  const out = await create.execute(
    { title: "WI-066 dormant authoring probe", body: "filed by an un-awakened session" },
    { agent: dormant, signal: AbortSignal.timeout(5000) }
  )
  assert.ok(String(out).includes("Created WI-"), `create succeeded from a dormant session (${String(out).slice(0, 60)})`)
  assert.ok(String(out).includes("un-owned"), "the receipt marks the item un-owned — no ownership flowed from a dormant filing")
  const list = ctx.tools.get("hive_board_list", dormant)
  const listed = await list.execute({}, { agent: dormant, signal: AbortSignal.timeout(5000) })
  assert.ok(String(listed).includes("WI-066 dormant authoring probe"), "the dormant session lists what it filed")
  const { listItems } = await import("@hive/dsh-board/lib/board-store")
  const filed = listItems(FIX).find((i) => i.title === "WI-066 dormant authoring probe")
  assert.ok(filed, "the filed item is on disk")
  assert.ok(filed.owner_session === null && filed.status !== "in_progress", "on disk: un-owned, not in_progress")
})

// ── /awaken lifts the gate for the same session id ───────────────────────────
const awakenCmd = ctx.commands.find(undefined, "awaken")
test("wi066: /awaken flips the session and bind resolves on its scope again", async () => {
  assert.ok(awakenCmd, "/awaken registered")
  const followups = []
  dormant.followup = (m) => followups.push(m)
  const out = await awakenCmd.handler({
    rawInput: "wi-066 open-surface probe",
    agent: dormant,
    commandId: "c_wi066",
    attachments: [],
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(out.kind, "success", `/awaken succeeded (${String(out.text).slice(0, 80)})`)
  const ledger = JSON.parse(fs.readFileSync(path.join(FIX, ".opencode/agents/hive-sessions.json"), "utf8"))
  assert.ok(ledger.coordinators.ses_wi066_dormant, "ledger records the flip")
  assert.notEqual(ctx.tools.get("hive_board_bind", dormant), undefined, "bind lifted — resolvable on the now-awakened scope")
  assert.notEqual(ctx.tools.get("hive_dispatch", dormant), undefined, "dispatch lifted with the rest of the census")
  const names2 = (await ctx.systemPrompt.assemble({ scope: dormant })).sections.map((s) => s.name)
  assert.ok(names2.includes("hive:doctrine") && !names2.includes("hive:dormant"), `doctrine replaced the explainer (${names2.join(",")})`)
  assert.ok(followups.length === 1 && followups[0].content[0].text.includes("hive_awaken_spawn"), "awaken brief woken with the summon named")
})

// ── children: skip branch untouched; bind present-but-refusing (D5 intact) ──
const dreamCmd = ctx.commands.find(undefined, "dream")
const dreamCmdFollowups = []
const PARTITION = [
  "hive_dream_begin",
  "hive_dream_complete",
  "hive_dream_artifact_create",
  "hive_dream_harvest",
  "hive_dream_supersede",
  "hive_dream_mark_stale",
  "hive_dream_detect_duplicates",
  "hive_painpoints_harvest",
]
const STANDING_DREAM = ["hive_dream_rank", "hive_dream_query", "hive_dream_list", "hive_dream_residue", "hive_note_painpoint", "hive_painpoints_list"]

test("d4: the awakened standing surface holds the mid-session dream tools but NOT the dreamtime partition", () => {
  for (const name of STANDING_DREAM) {
    assert.notEqual(ctx.tools.get(name, dormant), undefined, `${name} stays standing after /awaken (rank-first recall + bite-time capture)`)
  }
  for (const name of PARTITION) {
    assert.equal(ctx.tools.get(name, dormant), undefined, `${name} restricted from the awakened standing surface (D4)`)
  }
})

test("d4: /dream opens the surface — the partition resolves on the same scope, doctrine told to run dreamtime", async () => {
  assert.ok(dreamCmd, "/dream registered")
  dreamCmdFollowups.length = 0
  dormant.followup = (m) => dreamCmdFollowups.push(m) // the /awaken test rebound it; rebind for this leg
  const out = await dreamCmd.handler({
    rawInput: "",
    agent: dormant,
    commandId: "c_wi066_dream_open",
    attachments: [],
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(out.kind, "success", `/dream open succeeded (${String(out.text).slice(0, 80)})`)
  assert.match(String(out.text), /OPEN/)
  for (const name of PARTITION) {
    assert.notEqual(ctx.tools.get(name, dormant), undefined, `${name} live after /dream (surface open)`)
  }
  assert.strictEqual(dreamCmdFollowups.length, 1, "exactly one wake followup")
  assert.match(dreamCmdFollowups[0].content[0].text, /dreamtime/)
  assert.match(dreamCmdFollowups[0].content[0].text, /hive_dream_complete closes this surface automatically/)
  // the standing mid-session tools never flicker
  for (const name of STANDING_DREAM) {
    assert.notEqual(ctx.tools.get(name, dormant), undefined, `${name} unaffected by the toggle`)
  }
})

test("d4: /dream closes the surface again — the partition re-restricts, rank keeps standing", async () => {
  const out = await dreamCmd.handler({
    rawInput: "",
    agent: dormant,
    commandId: "c_wi066_dream_close",
    attachments: [],
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(out.kind, "success")
  assert.match(String(out.text), /CLOSED/)
  for (const name of PARTITION) {
    assert.equal(ctx.tools.get(name, dormant), undefined, `${name} restricted again after /dream closes the surface`)
  }
  for (const name of STANDING_DREAM) {
    assert.notEqual(ctx.tools.get(name, dormant), undefined, `${name} still standing`)
  }
})

test("d4b: hive_dream_complete auto-closes the surface — no second /dream keystroke", async () => {
  // The d4 close test re-masked the surface; reopen it — /dream stores the
  // session's agent for the auto-close seam when it lifts the restriction.
  const out = await dreamCmd.handler({
    rawInput: "",
    agent: dormant,
    commandId: "c_wi066_dream_reopen",
    attachments: [],
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(out.kind, "success", `reopen succeeded (${String(out.text).slice(0, 80)})`)
  for (const name of PARTITION) {
    assert.notEqual(ctx.tools.get(name, dormant), undefined, `${name} live again after reopen`)
  }
  // A REAL active dream via the dream-archive writer (the single-active
  // invariant: exactly one), through the package's compiled lib surface.
  fs.mkdirSync(path.join(FIX, ".opencode/dreams/active"), { recursive: true })
  fs.mkdirSync(path.join(FIX, ".opencode/dreams/history"), { recursive: true })
  const { beginDream } = await import("../../dream-archive/dist/lib/dream-state.js")
  const { dreamId } = beginDream(FIX, {
    depth: 2,
    intention: "d4b auto-close fixture",
    intention_type: "CONSOLIDATION",
    entry_time: "2026-10-08T08:00:00.000Z",
    project_context: "dormant-open-surface fixture",
    context_signals: { contradictions: 0, repetitions_detected: false, coherence: "HIGH", threads_active: 1 },
    retain_high: [],
    retain_low: [],
  })
  const complete = ctx.tools.get("hive_dream_complete", dormant)
  assert.ok(complete, "hive_dream_complete resolvable while the surface is open")
  const res = String(
    await complete.execute({ artifact_ids: "" }, { agent: dormant, signal: AbortSignal.timeout(5000) }),
  )
  assert.match(res, new RegExp(`Dream ${dreamId} completed`))
  assert.match(res, /automatically/, "the completion receipt carries the auto-close surface line")
  // THE CONTRACT: the tools shed WITHOUT a second /dream.
  for (const name of PARTITION) {
    assert.equal(ctx.tools.get(name, dormant), undefined, `${name} auto-shed after hive_dream_complete`)
  }
  // The standing surface never flickers — rescue/queries stay put.
  for (const name of STANDING_DREAM) {
    assert.notEqual(ctx.tools.get(name, dormant), undefined, `${name} still standing after auto-close`)
  }
  // Completion semantics unchanged by the seam: archived to history.
  assert.ok(
    fs.existsSync(path.join(FIX, ".opencode/dreams/history", `${dreamId}.yaml`)),
    "completed dream archived to history",
  )
})

test("d4: /dream is awakened-only and top-level only (gate + depth guard)", async () => {
  const dormantProbe = agentScope("ses_wi066_dream_dormant", {})
  ctx.emit("agent/created", { agent: dormantProbe, source: "startup" })
  const outDormant = await dreamCmd.handler({
    rawInput: "",
    agent: dormantProbe,
    commandId: "c_wi066_dream_dormant",
    attachments: [],
    signal: AbortSignal.timeout(5000),
  })
  // requireAwake refuses a dormant session with the scripted /awaken move
  assert.ok(String(outDormant.text).includes("dormant") || String(outDormant.text).includes("/awaken"), "dormant /dream refused with the /awaken pointer")
  const child = agentScope("ses_wi066_dream_child", { delegationDepth: 1 })
  const childLedger = JSON.parse(fs.readFileSync(path.join(FIX, ".opencode/agents/hive-sessions.json"), "utf8"))
  // a depth>0 child is exempt from the gate by lineage (skip branch) — /dream's
  // OWN depth guard is the border for it (an awakened-ledger child is the edge
  // the doctrinal refusal covers)
  assert.ok(childLedger && typeof childLedger === "object")
  const childOut = await dreamCmd.handler({
    rawInput: "",
    agent: child,
    commandId: "c_wi066_dream_child",
    attachments: [],
    signal: AbortSignal.timeout(5000),
  })
  // the child is neither in the awakened registry nor a coordinator: requireAwake
  // refuses on dormancy (the depth guard is the belt-and-braces layer above it)
  assert.ok(String(childOut.text).includes("dormant") || String(childOut.text).includes("dispatched child"),
    "child /dream refused (by requireAwake or the depth guard)")
})

// ── D5-B: hivemind:false strips the mailbox from the TOP-LEVEL surface ──────
// A separate composition (default keeps the tools — no-behavior-change).
const FIX2 = fs.mkdtempSync(path.join(os.tmpdir(), "d5b-hivemind-"))
fs.mkdirSync(path.join(FIX2, ".opencode/agents/capabilities"), { recursive: true })
const ctx2 = new Context()
new SP(ctx2, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx2, {})
new Commands(ctx2, {})
new Subagents(ctx2, {})
const Hivemind = (await import("@hive/dsh-hivemind")).default
ctx2.plugin(Board, { directory: FIX2 })
ctx2.plugin(Hivemind, { directory: FIX2 })
ctx2.plugin(Evolution, { directory: FIX2, hivemind: false })
await new Promise((r) => setTimeout(r, 80))

test("d5b: with hivemind:false the awakened top-level surface masks the 4 mailbox tools but keeps dispatch + steering", async () => {
  const awake2 = agentScope2(ctx2, "ses_d5b_lead")
  const awaken2 = ctx2.commands.find(undefined, "awaken")
  const out2 = await awaken2.handler({ rawInput: "hivemind off probe", agent: awake2, commandId: "c_d5b", attachments: [], signal: AbortSignal.timeout(5000) })
  assert.equal(out2.kind, "success")
  for (const name of ["hive_signal", "hive_listen", "hive_sent", "hive_retire"]) {
    assert.equal(ctx2.tools.get(name, awake2), undefined, `${name} masked on the standing surface (hivemind:false)`)
  }
  // Only registrations that exist in THIS composition count as standing
  // evidence (no dream tools plugins mounted here — their absence is
  // plugin-absence, proven in the main composition's d4 legs instead).
  for (const name of ["hive_dispatch", "hive_send", "hive_children", "hive_board_list", "hive_board_search"]) {
    assert.notEqual(ctx2.tools.get(name, awake2), undefined, `${name} stays standing`)
  }
})

test("d5b: with hivemind:false the mailbox stays usable for a lineage child (skip branch)", () => {
  const child2 = agentScope2(ctx2, "ses_d5b_child", { delegationDepth: 1 })
  ctx2.emit("agent/created", { agent: child2, source: "startup" })
  assert.notEqual(ctx2.tools.get("hive_signal", child2), undefined, "depth>0 child keeps the mailbox (lineage exemption)")
})
test("wi066: a depth>0 child still takes the skip branch — sees open AND bind — and the D5 refusal remains the runtime border", async () => {
  const child = agentScope("ses_wi066_child", { delegationDepth: 1 })
  ctx.emit("agent/created", { agent: child, source: "startup" })
  for (const name of [...OPEN_NAMES, "hive_board_bind", "hive_dispatch"]) {
    assert.notEqual(ctx.tools.get(name, child), undefined, `${name} present for the lineage-exempt child`)
  }
  const bind = ctx.tools.get("hive_board_bind", child)
  const out = await bind.execute({ id: "WI-001" }, { agent: child, signal: AbortSignal.timeout(2000) })
  assert.ok(String(out).startsWith("Refused: delegated sessions"), `child bind refused by the module (got: ${String(out).slice(0, 60)})`)
})

fs.rmSync(FIX, { recursive: true, force: true })
