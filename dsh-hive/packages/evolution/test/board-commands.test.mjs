// WI-093 — /board-close, /board-release, /board-reopen end-to-end on the REAL
// command seam: boot the Evolution service against the live dsh services (the
// service-harness mount), invoke the command handlers, execute the SUMMONED
// turn-scoped tools, and assert the store outcomes + WI-074 consumption
// semantics (armed correctables / consumed no-ops / the terminal tombstone).
// Store level detail lives in @hive/dsh-board's own suite; this file pins the
// SEAM: gating, summoning, default-target resolution, verdict classification,
// and retraction timing.
import { Context } from "@deepseek-ai/cordis"
import Evolution from "@hive/dsh-evolution"
import { createIdea, bindSession, markItemDoneFromDream } from "@hive/dsh-board/lib/board-transitions"
import { readItem } from "@hive/dsh-board/lib/board-store"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

const synth = fs.mkdtempSync(path.join(os.tmpdir(), "wi093-evo-"))
fs.mkdirSync(path.join(synth, ".opencode/agents/capabilities"), { recursive: true })

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

ctx.plugin(Evolution, { directory: synth })
await new Promise((r) => setTimeout(r, 50))

// Mark sessions awakened in the ledger the requireAwake gate reads
// (evolution OWNS the writes; the harness seeds it the normal way).
const awaken = (sid) => {
  const p = path.join(synth, ".opencode/agents/hive-sessions.json")
  const ledger = fs.existsSync(p)
    ? JSON.parse(fs.readFileSync(p, "utf8"))
    : { v: 1, coordinators: {} }
  ledger.coordinators[sid] = { agent: "gate", awakenedAt: new Date().toISOString(), lastAwakenInput: "wi-093" }
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(ledger, null, 2))
}

const makeAgent = (sid, opts = {}) => {
  const a = { id: sid, session: { id: sid, ...(opts.depth ? { header: { delegationDepth: opts.depth } } : { header: {} }) }, followup: (m) => followups.push({ sid, m }) }
  const scope = createScope(ctx, a, {})
  a.ctx = scope.ctx
  return a
}
const mkScopeFox = undefined
void mkScopeFox

const followups = []
const results = []
const check = (id, ok, detail) => {
  results.push({ ok })
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`)
}

const command = async (name, agent, rawInput) =>
  ctx.commands.find(undefined, name).handler({ rawInput, agent, commandId: "c", attachments: [], signal: AbortSignal.timeout(4000) })

const lastTransition = (dir, id) => {
  const item = readItem(dir, id)
  return item.transitions[item.transitions.length - 1]
}

// Register all three commands + census sanity.
for (const n of ["board-close", "board-release", "board-reopen"]) {
  check(`registered.${n}`, ctx.commands.find(undefined, n) !== undefined, `/${n} visible on the command runtime`)
}

// ── Gate: dormant + child refusals (requireAwake precedes ANY mutation) ──────
{
  const dormant = makeAgent("ses_dormant_wi093")
  const out = await command("board-close", dormant, "")
  check("gate.dormant", out.kind === "error" && /\/awaken/.test(out.text ?? ""), "dormant session refused with the awaken hint")
  check("gate.dormant-no-summon", followups.length === 0, "refused command summoned nothing (no model wake)")

  const child = makeAgent("ses_child_wi093", { depth: 1 })
  awaken("ses_child_wi093")
  const childOut = await command("board-close", child, "")
  check("gate.child", childOut.kind === "error" && /top-level sessions/.test(childOut.text ?? ""), "depth>0 child refused as lineage participant")
}

// ── /board-close happy path: rawInput id + reason land on the transition ─────
{
  awaken("ses_cmd_a")
  const agent = makeAgent("ses_cmd_a")
  const made = await createIdea(synth, { title: "close me" })
  const id = made.item.id
  const out = await command("board-close", agent, `${id} shipped clean, corridor green`)
  check("close.summons", out.kind === "success", "/board-close summons the turn-scoped tool")
  check("close.woke-model", followups.some((f) => f.sid === "ses_cmd_a" && f.m.content[0].text.includes("hive_board_close")), "followup names hive_board_close")
  check("close.advisory", followups.at(-1).m.content[0].text.includes(".opencode/board/"), "the advisory names the BOARD surface, not agents/")
  const scoped = ctx.tools.get("hive_board_close", agent)
  check("close.scoped", scoped !== undefined, "hive_board_close visible on the agent scope only")
  check("close.not-global", ctx.tools.get("hive_board_close") === undefined, "hive_board_close absent from the global layer")
  const verdict = await scoped.execute({}, { agent, signal: AbortSignal.timeout(4000) })
  const text = String(verdict)
  check("close.consumed", text.includes("✓ closed") && text.includes("done_without_dream"), "tool reports the close receipt")
  const after = readItem(synth, id)
  check("close.store", after.status === "done" && after.done_without_dream === true, "store: done + badge")
  const t = after.transitions.at(-1)
  check("close.signed", t.by === `command:board-close:ses_cmd_a` && t.note === "shipped clean, corridor green", `signed transition + reason line (by=${t.by})`)
  check("close.retracted", ctx.tools.get("hive_board_close", agent) === undefined, "consumed → retracted after success")
}

// ── WI-074 semantics: armed refusals survive; no-op and terminal consume ─────
{
  awaken("ses_cmd_b")
  const agent = makeAgent("ses_cmd_b")
  await command("board-close", agent, "")
  let scoped = ctx.tools.get("hive_board_close", agent)
  check("armed.mounted", scoped !== undefined, "summon mounted for the empty-input session")
  const noId = await scoped.execute({}, { agent, signal: AbortSignal.timeout(4000) })
  check("armed.no-id", String(noId).includes("✗ refused") && String(noId).includes("owns no board item"), "no id + no own item → armed refusal")
  check("armed.stays", ctx.tools.get("hive_board_close", agent) !== undefined, "correctable refusal did NOT consume the summon")
  const badId = await scoped.execute({ id: "nope" }, { agent, signal: AbortSignal.timeout(4000) })
  check("armed.bad-id", String(badId).includes("not a work-item id"), "non-id-shaped arg → armed refusal with the correction")
  const ghost = await scoped.execute({ id: "WI-777" }, { agent, signal: AbortSignal.timeout(4000) })
  check("armed.ghost", String(ghost).includes("no work item WI-777"), "unknown id → armed refusal (typo fix)")
  const second = ctx.tools.get("hive_board_close", agent)
  check("armed.second", second === scoped, "the SAME summon stayed mounted through three correctables")

  // The no-op consume: closing an ALREADY-done item spends the summon with a
  // plain report (nothing to correct — a corrected re-call cannot un-close).
  const done = await createIdea(synth, { title: "already closed" })
  const closeR = await (await import("@hive/dsh-board/lib/board-commands")).closeItem(synth, done.item.id, { actingSession: null })
  assert.ok(closeR.ok)
  const noOp = await scoped.execute({ id: done.item.id }, { agent, signal: AbortSignal.timeout(4000) })
  check("noop.already-done", String(noOp).includes("already done"), "ALREADY_DONE consumes as a no-op report")
  check("noop.retracted", ctx.tools.get("hive_board_close", agent) === undefined, "no-op consumed → retracted")

  // Wrong-owner close: ARMED (release it, or pass another id).
  const theirsOwner = makeAgent("ses_other_wi093")
  const theirs = await createIdea(synth, { title: "theirs" })
  await bindSession(synth, theirs.item.id, "ses_other_wi093", "ses_other_wi093")
  void theirsOwner
  const agentAgain = makeAgent("ses_cmd_b2")
  awaken("ses_cmd_b2")
  await command("board-close", agentAgain, "")
  const armedTool = ctx.tools.get("hive_board_close", agentAgain)
  const refused = await armedTool.execute({ id: theirs.item.id }, { agent: agentAgain, signal: AbortSignal.timeout(4000) })
  check("close.wrong-owner-armed", String(refused).includes("✗ refused") && String(refused).includes("ses_other_wi093"), "another session's item refused, owner named")
  check("close.wrong-owner-stays", ctx.tools.get("hive_board_close", agentAgain) !== undefined, "ITEM_OWNED kept the summon armed")
}

// ── /board-release: in_progress default-own flavor ───────────────────────────
{
  awaken("ses_cmd_c")
  const agent = makeAgent("ses_cmd_c")
  const item = await (async () => {
    const made = await createIdea(synth, { title: "release in progress" })
    await bindSession(synth, made.item.id, "ses_cmd_c", "ses_cmd_c")
    return made.item.id
  })()
  const out = await command("board-release", agent, "")
  check("release.summons", out.kind === "success", "/board-release summons")
  const tool = ctx.tools.get("hive_board_release", agent)
  const verdict = await tool.execute({}, { agent, signal: AbortSignal.timeout(4000) })
  check("release.demoted", String(verdict).includes("✓ released") && String(verdict).includes("todo"), "default own item released → todo")
  const after = readItem(synth, item)
  check("release.store", after.status === "todo" && after.owner_session === null && after.group_id === null, "un-owned demote")
  check("release.tombstone", after.released_sessions.includes("ses_cmd_c"), "released session tombstoned")
  const t = lastTransition(synth, item)
  check("release.signed", t.by === "command:board-release:ses_cmd_c" && t.session === "ses_cmd_c", "signed transition")
}

// ── acceptance 1 at the seam: done-but-owned (WI-083) release → successor bind
{
  awaken("ses_cmd_d")
  const agent = makeAgent("ses_cmd_d")
  const made = await createIdea(synth, { title: "wi-083 work" })
  const id = made.item.id
  await bindSession(synth, id, "ses_cmd_d", "ses_cmd_d")
  const done = await markItemDoneFromDream(synth, "ses_cmd_d", "DRM-833", {
    drmIsComplete: () => true,
    drmArtifacts: () => ["I-001"],
    drmIsPreCompaction: () => false,
  })
  assert.equal(done.action, "done")
  const blocked = await (async () => {
    const fresh = await createIdea(synth, { title: "successor work" })
    return { bind: await bindSession(synth, fresh.item.id, "ses_cmd_d", "ses_cmd_d"), id: fresh.item.id }
  })()
  check("wi083.blocked", blocked.bind.ok === false && blocked.bind.reason === "SESSION_OWNS_OTHER", "dream-promoted done item blocks the successor bind (1:1)")
  const out = await command("board-release", agent, id)
  const tool = ctx.tools.get("hive_board_release", agent)
  const verdict = await tool.execute({}, { agent, signal: AbortSignal.timeout(4000) })
  check("wi083.receipt", String(verdict).includes("STAYS done") && String(verdict).includes("ses_cmd_d"), "done-release receipt: status untouched, owner named")
  const after = readItem(synth, id)
  check("wi083.store", after.status === "done" && after.owner_session === null, "released from done: status kept, owner cleared")
  const rebound = await bindSession(synth, blocked.id, "ses_cmd_d", "ses_cmd_d")
  check("wi083.successor-binds", rebound.ok === true && rebound.action === "bound", "the successor bind now SUCCEEDS")

  // The same session is now tombstoned on THAT item — /board-reopen there is
  // TERMINAL (consumes the summon; no argument corrects a tombstone).
  const rOut = await command("board-reopen", agent, id)
  check("reopen.summons", rOut.kind === "success", "/board-reopen summons")
  const rTool = ctx.tools.get("hive_board_reopen", agent)
  const tVerdict = await rTool.execute({ id }, { agent, signal: AbortSignal.timeout(4000) })
  check("reopen.tombstone-terminal", String(tVerdict).includes("terminal") && String(tVerdict).includes("released_sessions"), "tombstone refusal is terminal")
  check("reopen.tombstone-consumed", ctx.tools.get("hive_board_reopen", agent) === undefined, "terminal refusal CONSUMED the summon")
}

// ── /board-reopen: own done item reopens in place; adoption; wrong-owner armed
{
  awaken("ses_cmd_e")
  const agent = makeAgent("ses_cmd_e")
  const made = await createIdea(synth, { title: "reopen own work" })
  const id = made.item.id
  await bindSession(synth, id, "ses_cmd_e", "ses_cmd_e")
  await (await import("@hive/dsh-board/lib/board-commands")).closeItem(synth, id, { actingSession: "ses_cmd_e" })

  const out = await command("board-reopen", agent, "")
  const tool = ctx.tools.get("hive_board_reopen", agent)
  const verdict = await tool.execute({}, { agent, signal: AbortSignal.timeout(4000) })
  check("reopen.own", String(verdict).includes("✓ reopened") && String(verdict).includes("ownership stays"), "own done item reopens in place (default target)")
  const after = readItem(synth, id)
  check("reopen.store", after.status === "in_progress" && after.owner_session === "ses_cmd_e" && after.done_without_dream === false, "store: reopened, badge cleared, owner kept")
  check("reopen.retracted", ctx.tools.get("hive_board_reopen", agent) === undefined, "consumed → retracted")

  // ALREADY in progress: the no-op consume.
  await command("board-reopen", agent, id)
  const noopTool = ctx.tools.get("hive_board_reopen", agent)
  const noop = await noopTool.execute({ id }, { agent, signal: AbortSignal.timeout(4000) })
  check("reopen.already", String(noop).includes("already in progress"), "ALREADY_IN_PROGRESS consumes as a no-op")

  // ADOPTION: fresh free session + released done item.
  awaken("ses_cmd_f")
  const adopter = makeAgent("ses_cmd_f")
  const orphan = await createIdea(synth, { title: "orphaned done" })
  await closeHoldRelease(synth, orphan.item.id, "ses_gone_wi093")
  const aOut = await command("board-reopen", adopter, orphan.item.id)
  const aTool = ctx.tools.get("hive_board_reopen", adopter)
  const aVerdict = await aTool.execute({}, { agent: adopter, signal: AbortSignal.timeout(4000) })
  check("reopen.adopt", String(aVerdict).includes("ADOPTED"), "un-owned done item adopted by the free session")
  const adopted = readItem(synth, orphan.item.id)
  check("reopen.adopt-store", adopted.owner_session === "ses_cmd_f" && adopted.group_id === "ses_cmd_f" && adopted.status === "in_progress", "owner+group stamped together (I-043)")
  void aOut

  // SESSION_OWNS_OTHER: the adopter now OWNS something; adopting again refuses
  // ARMED, naming its live item.
  const orphan2 = await createIdea(synth, { title: "orphaned done 2" })
  await closeHoldRelease(synth, orphan2.item.id, "ses_gone_wi093")
  await command("board-reopen", adopter, "")
  const oTool = ctx.tools.get("hive_board_reopen", adopter)
  const oVerdict = await oTool.execute({ id: orphan2.item.id }, { agent: adopter, signal: AbortSignal.timeout(4000) })
  check("reopen.owns-other-armed", String(oVerdict).includes("✗ refused") && String(oVerdict).includes("strictly 1:1"), "owns-another refusal arms the summon")
  check("reopen.owns-other-stays", ctx.tools.get("hive_board_reopen", adopter) !== undefined, "summon stayed armed for the corrected retry")

  // NOT_DONE on a queued item: the no-op consume.
  const queued = await createIdea(synth, { title: "queued never done" })
  const nVerdict = await oTool.execute({ id: queued.item.id }, { agent: adopter, signal: AbortSignal.timeout(4000) })
  check("reopen.not-done", String(nVerdict).includes("never closed") && /hive_board_bind|bind it/.test(String(nVerdict)), "NOT_DONE consumes, routing to bind")
  check("reopen.not-done-consumed", ctx.tools.get("hive_board_reopen", adopter) === undefined, "NOT_DONE consumed → retracted")

  // Wrong-owner TERMINAL-adjacent: another session's done item → ARMED (naming
  // the blocking owner), that is the corrected-retry shape /board-release frees.
  const blocker = makeAgent("ses_blocker_wi093")
  void blocker
  const held = await createIdea(synth, { title: "blocker's done work" })
  const heldBind = await bindSession(synth, held.item.id, "ses_blocker_wi093", "ses_blocker_wi093")
  assert.ok(heldBind.ok)
  await (await import("@hive/dsh-board/lib/board-commands")).closeItem(synth, held.item.id, { actingSession: "ses_blocker_wi093" })
  awaken("ses_cmd_g")
  const gAgent = makeAgent("ses_cmd_g")
  await command("board-reopen", gAgent, "")
  const gTool = ctx.tools.get("hive_board_reopen", gAgent)
  const gVerdict = await gTool.execute({ id: held.item.id }, { agent: gAgent, signal: AbortSignal.timeout(4000) })
  check("reopen.blocking-owner-armed", String(gVerdict).includes("blocking owner") && String(gVerdict).includes("ses_blocker_wi093"), "blocking owner named")
  check("reopen.blocking-owner-stays", ctx.tools.get("hive_board_reopen", gAgent) !== undefined, "wrong-owner reopen kept the summon armed")
}

/** bind → close → release helper: leaves the item done and un-owned, origin session tombstoned. */
async function closeHoldRelease(dir, id, owner) {
  const cmds = await import("@hive/dsh-board/lib/board-commands")
  const bound = await bindSession(dir, id, owner, owner)
  assert.ok(bound.ok, JSON.stringify(bound))
  await cmds.closeItem(dir, id, { actingSession: owner })
  const r = await cmds.releaseItem(dir, id, { by: `harness:${owner}` })
  assert.ok(r.ok, JSON.stringify(r))
}

const pass = results.filter((r) => r.ok).length
console.log(`\n${pass}/${results.length} checks passed`)
process.exit(pass === results.length ? 0 : 1)
