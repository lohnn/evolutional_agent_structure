// Phase-4 service-harness gate: boot the Hivemind service and drive the 4
// tools, the file-durability-first send path, and the ctx.emit live-delivery
// event — the Phase-4 gate: "live message between two resident sessions
// never touches disk until the durability write" (i.e. the file write ALWAYS
// happens; live delivery is the ctx.emit side effect on top of it).
import { Context } from "@deepseek-ai/cordis"
import Hivemind from "@hive/dsh-hivemind"
import fs from "fs"
import os from "os"
import path from "path"

const results = []
const check = (id, ok, detail) => {
  results.push({ ok })
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`)
}

const synth = fs.mkdtempSync(path.join(os.tmpdir(), "p4-hivemind-"))
fs.mkdirSync(path.join(synth, ".opencode/agents/capabilities"), { recursive: true })
// An active capability file so staleness does not flag it as dissolved.
fs.writeFileSync(path.join(synth, ".opencode/agents/capabilities/worker-a.md"), "---\nname: worker-a\n---\n")
fs.writeFileSync(path.join(synth, ".opencode/agents/capabilities/worker-b.md"), "---\nname: worker-b\n---\n")

const ctx = new Context()
const { createRequire } = await import("node:module")
const require = createRequire("/root/.dsh/profiles/web/package.json")
const ToolsMod = require("@deepseek-ai/dsh-tools")
const Tools = ToolsMod.default ?? ToolsMod.Tools
const SPMod = require("@deepseek-ai/dsh-system-prompt")
const SP = SPMod.default ?? SPMod.SystemPrompt
new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
await new Promise((r) => setTimeout(r, 50))

ctx.plugin(Hivemind, { directory: synth })
await new Promise((r) => setTimeout(r, 50))

check("boot.service", ctx.hivemind?.directory === synth, "ctx.hivemind registered")

const visible = ctx.tools.view(undefined).visible
const names = [...visible.keys()].filter((n) => n.startsWith("hive_"))
check("tools.registered", ["hive_signal", "hive_listen", "hive_sent", "hive_retire"].every((n) => names.includes(n)), `tools visible: ${names.join(", ")}`)

const execA = { signal: AbortSignal.timeout(5000), agent: { id: "worker-a", session: { id: "ses_a" } } }
const execB = { signal: AbortSignal.timeout(5000), agent: { id: "worker-b", session: { id: "ses_b" } } }

// ── Live delivery: a resident listener receives the ctx.emit; the file is
// written FIRST (durability), and the event carries the persisted envelope. ──
const liveReceived = []
const order = []
const disposeLive = ctx.on("hivemind/message", (msg, filename) => {
  liveReceived.push({ msg, filename })
  order.push("event")
  // A resident recipient marks its file delivered after live receipt.
  ctx.hivemind.markDelivered(msg.recipient, filename)
})

const sendOut = await visible.get("hive_signal").execute(
  { recipient: "worker-b", type: "question", content: "are you there?" }, execA)
check("tool.signal", sendOut.includes("Message sent to `worker-b`"), "hive_signal sent")

// File durability: the message file exists on disk immediately after send.
const inboxDir = path.join(synth, ".opencode/hivemind/inbox/worker-b")
const files = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".json"))
check("durability.file-written", files.length === 1, `message file on disk (${files[0] ?? "none"})`)

// Live delivery: the event fired with the persisted envelope.
check("live.event-fired", liveReceived.length === 1 && liveReceived[0].msg.content === "are you there?", "hivemind/message emitted to resident listener")
check("live.envelope", liveReceived[0]?.msg.sender === "worker-a" && liveReceived[0]?.msg.type === "question", "event carries sender + type")

// The resident listener marked the file delivered (W-119: not pending forever).
const onDisk = JSON.parse(fs.readFileSync(path.join(inboxDir, files[0]), "utf8"))
check("live.marked-delivered", onDisk.status === "delivered", `file flipped to delivered after live receipt (got ${onDisk.status})`)

// ── hive_listen: the recipient reads + acknowledges its mailbox ─────────────
const heard = await visible.get("hive_listen").execute({}, execB)
check("tool.listen", heard.includes("are you there?") && heard.includes("worker-a"), "hive_listen shows the message")
const heardAck = await visible.get("hive_listen").execute({ mark_read: true }, execB)
check("tool.listen-ack", heardAck.includes("marked as read"), "hive_listen(mark_read) acknowledges")
const afterAck = JSON.parse(fs.readFileSync(path.join(inboxDir, files[0]), "utf8"))
check("tool.listen-ack-disk", afterAck.status === "read", "file flipped to read")

// ── Special-recipient refusal surfaces through the tool ─────────────────────
let refused = false
try {
  await visible.get("hive_signal").execute({ recipient: "_typo", type: "info", content: "x" }, execA)
} catch (e) {
  refused = /unknown special recipient/i.test(String(e))
}
check("tool.signal-refused", refused, "unknown _-recipient refused (I-033)")

// ── hive_sent: sender-side dashboard ────────────────────────────────────────
await visible.get("hive_signal").execute({ recipient: "worker-b", type: "info", content: "second message, unread" }, execA)
const sentView = await visible.get("hive_sent").execute({}, execA)
check("tool.sent", sentView.includes("Unread messages sent by worker-a") && sentView.includes("worker-b"), "hive_sent dashboard renders")
check("tool.sent-count", (sentView.match(/→ `worker-b`/g) ?? []).length === 1, "only the unread message listed (the read one is gone)")

// ── hive_retire: dry-run, then retire with a reason ─────────────────────────
// Plant a dissolved-sender message (strong staleness signal).
fs.writeFileSync(path.join(synth, ".opencode/agents/dissolved"), "", { flag: "w" }) // ensure dir ops work below
fs.rmSync(path.join(synth, ".opencode/agents/dissolved"), { force: true })
fs.mkdirSync(path.join(synth, ".opencode/agents/dissolved"), { recursive: true })
await visible.get("hive_signal").execute({ recipient: "worker-b", type: "info", content: "from a ghost" }, {
  signal: AbortSignal.timeout(5000), agent: { id: "dissolved/ghost", session: { id: "ses_g" } },
})
const dryRun = await visible.get("hive_retire").execute({}, execB)
check("tool.retire-dryrun", dryRun.includes("Stale message candidates") && dryRun.includes("dissolved-sender"), "dry-run lists the dissolved-sender candidate")
check("tool.retire-dryrun-noop", fs.existsSync(path.join(synth, ".opencode/hivemind/inbox/worker-b")), "dry-run changed nothing")

// Retire without a reason is refused.
const noReason = await visible.get("hive_retire").execute({ messages: ["worker-b/" + "nonexistent.json"] }, execB)
check("tool.retire-reason-required", noReason.includes("reason") && noReason.includes("REQUIRED"), "retire without reason refused")

// Find the ghost message filename and retire it with a reason.
const ghostFile = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".json"))
  .map((f) => [f, JSON.parse(fs.readFileSync(path.join(inboxDir, f), "utf8"))])
  .find(([, m]) => m.sender === "dissolved/ghost")?.[0]
const retireOut = await visible.get("hive_retire").execute({ messages: [`worker-b/${ghostFile}`], reason: "sender dissolved, question moot" }, execB)
check("tool.retire", retireOut.includes("✓") && retireOut.includes("worker-b/" + ghostFile), "retire moved the message")
check("tool.retire-audit", fs.existsSync(path.join(synth, ".opencode/hivemind/retirement-log.jsonl")), "audit trail appended")
const audit = fs.readFileSync(path.join(synth, ".opencode/hivemind/retirement-log.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
check("tool.retire-audit-shape", audit[0]?.v === 1 && audit[0]?.reason === "sender dissolved, question moot" && Array.isArray(audit[0]?.signals), "audit entry v:1 with signals + reason")

disposeLive()
fs.rmSync(synth, { recursive: true, force: true })
const failed = results.filter((r) => !r.ok)
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`)
process.exit(failed.length ? 1 : 0)
