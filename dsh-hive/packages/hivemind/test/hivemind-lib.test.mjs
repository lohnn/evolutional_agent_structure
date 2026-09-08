// Hivemind mailbox lib — verbatim port semantics. Covers the paths the
// Phase-4 gate exercises: file durability, the group-scoped read, staleness,
// special-recipient refusal, and the retirement audit trail.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import {
  getInbox,
  sendMessage,
  markAllRead,
  markDelivered,
  listPendingInboxes,
  evaluateStaleness,
  isSpecialRecipient,
  retireMessage,
  readRetirementLog,
  sweepInboxes,
  sentBy,
} from "@hive/dsh-hivemind"

function mk() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hivemind-lib-"))
  fs.mkdirSync(path.join(dir, ".opencode/agents/capabilities"), { recursive: true })
  return dir
}

test("sendMessage writes a durable pending envelope; getInbox reads it back", () => {
  const dir = mk()
  const file = sendMessage(dir, { sender: "a", recipient: "b", type: "question", content: "hello", groupId: "g1" })
  const inbox = getInbox(dir, "b", "g1")
  assert.equal(inbox.length, 1)
  assert.equal(inbox[0].file, file)
  assert.equal(inbox[0].msg.status, "pending")
  assert.equal(inbox[0].msg.content, "hello")
  assert.equal(inbox[0].msg.groupId, "g1")
  fs.rmSync(dir, { recursive: true, force: true })
})

test("group-scoped read excludes other groups and ungrouped legacy mail", () => {
  const dir = mk()
  sendMessage(dir, { sender: "a", recipient: "b", type: "info", content: "g1 msg", groupId: "g1" })
  sendMessage(dir, { sender: "a", recipient: "b", type: "info", content: "g2 msg", groupId: "g2" })
  sendMessage(dir, { sender: "a", recipient: "b", type: "info", content: "legacy msg" }) // no groupId
  const g1 = getInbox(dir, "b", "g1")
  assert.equal(g1.length, 1)
  assert.equal(g1[0].msg.content, "g1 msg")
  fs.rmSync(dir, { recursive: true, force: true })
})

test("a reader sees its own bucket plus _broadcast; a special address reads only itself", () => {
  const dir = mk()
  sendMessage(dir, { sender: "a", recipient: "b", type: "info", content: "direct", groupId: "g" })
  sendMessage(dir, { sender: "a", recipient: "_broadcast", type: "info", content: "to all", groupId: "g" })
  const b = getInbox(dir, "b", "g")
  assert.equal(b.length, 2)
  const coord = getInbox(dir, "_coordinator", "g")
  assert.equal(coord.length, 0) // _coordinator does NOT see _broadcast
  fs.rmSync(dir, { recursive: true, force: true })
})

test("unknown _-prefixed recipient is refused (I-033)", () => {
  const dir = mk()
  assert.throws(() => sendMessage(dir, { sender: "a", recipient: "_typo", type: "info", content: "x" }), /unknown special recipient/)
  assert.ok(isSpecialRecipient("_coordinator"))
  assert.ok(isSpecialRecipient("_broadcast"))
  assert.ok(!isSpecialRecipient("_typo"))
  fs.rmSync(dir, { recursive: true, force: true })
})

test("markDelivered flips pending → delivered; markAllRead sweeps only shown", () => {
  const dir = mk()
  const f1 = sendMessage(dir, { sender: "a", recipient: "b", type: "info", content: "one", groupId: "g1" })
  sendMessage(dir, { sender: "a", recipient: "b", type: "info", content: "two", groupId: "g2" })
  assert.equal(markDelivered(dir, "b", f1), true)
  const read = markAllRead(dir, "b", "g1")
  assert.equal(read, 1) // only the g1 message swept
  assert.equal(getInbox(dir, "b", "g1").length, 0)
  assert.equal(getInbox(dir, "b", "g2").length, 1) // g2 untouched
  fs.rmSync(dir, { recursive: true, force: true })
})

test("staleness: dissolved-sender is STRONG; age alone is WEAK and never excludes", () => {
  const dir = mk()
  // An active capability file exists for "live-sender".
  fs.writeFileSync(path.join(dir, ".opencode/agents/capabilities/live-sender.md"), "---\nname: live-sender\n---\n")
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() // 40d
  const f1 = sendMessage(dir, { sender: "live-sender", recipient: "b", type: "info", content: "old but live sender", groupId: "g" })
  const f2 = sendMessage(dir, { sender: "dissolved/ghost", recipient: "b", type: "info", content: "from the void", groupId: "g" })
  // Backdate timestamps by rewriting the envelopes.
  for (const f of [f1, f2]) {
    const p = path.join(dir, ".opencode/hivemind/inbox", f1 === f ? "b" : "b", f)
    const m = JSON.parse(fs.readFileSync(p, "utf8"))
    m.timestamp = old
    fs.writeFileSync(p, JSON.stringify(m, null, 2))
  }
  const inbox = getInbox(dir, "b", "g")
  const byFile = new Map(inbox.map((e) => [e.file, e.msg]))
  const s1 = evaluateStaleness(dir, byFile.get(f1))
  const s2 = evaluateStaleness(dir, byFile.get(f2))
  assert.equal(s1.stale, false) // age alone (weak) never excludes
  assert.deepEqual(s1.weak, ["age"])
  assert.equal(s2.stale, true) // dissolved-sender (strong) excludes
  assert.deepEqual(s2.strong, ["dissolved-sender"])
  fs.rmSync(dir, { recursive: true, force: true })
})

test("retireMessage moves the file + appends a v:1 audit entry; never deletes", () => {
  const dir = mk()
  const f = sendMessage(dir, { sender: "dissolved/ghost", recipient: "b", type: "info", content: "moot", groupId: "g" })
  const rec = retireMessage(dir, "b", f, { signals: ["dissolved-sender"], retiredBy: "test", reason: "sender dissolved" })
  assert.equal(rec.ok, true)
  assert.ok(fs.existsSync(path.join(dir, ".opencode/hivemind/retired/b", f)))
  assert.ok(!fs.existsSync(path.join(dir, ".opencode/hivemind/inbox/b", f)))
  const log = readRetirementLog(dir)
  assert.equal(log.length, 1)
  assert.equal(log[0].v, 1)
  assert.equal(log[0].file, f)
  assert.deepEqual(log[0].signals, ["dissolved-sender"])
  assert.equal(log[0].reason, "sender dissolved")
  fs.rmSync(dir, { recursive: true, force: true })
})

test("sweepInboxes + sentBy attach staleness and respect group scope", () => {
  const dir = mk()
  sendMessage(dir, { sender: "a", recipient: "b", type: "info", content: "g1", groupId: "g1" })
  sendMessage(dir, { sender: "a", recipient: "b", type: "info", content: "g2", groupId: "g2" })
  assert.equal(sweepInboxes(dir, "g1").length, 1)
  assert.equal(sentBy(dir, "a").length, 2)
  assert.equal(listPendingInboxes(dir, "g1").length, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})
