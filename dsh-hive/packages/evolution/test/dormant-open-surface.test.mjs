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
ctx.plugin(Board, { directory: FIX })
ctx.plugin(Evolution, { directory: FIX })
await new Promise((r) => setTimeout(r, 80))

const agentScope = (id, header = {}) => {
  const a = { id, session: { id, header }, followup: () => {} }
  const scope = createScope(ctx, a, {})
  a.ctx = scope.ctx
  return a
}

// this composition's registered hive surface — everything else (dream /
// hivemind / painpoints plugins) is deliberately not mounted here, so absence
// for those names proves plugin absence, NOT the gate. Only registered+masked
// names are gate evidence.
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
