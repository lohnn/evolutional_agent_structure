import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import {
  sendMessage,
  getInbox,
  markAllRead,
  markDelivered,
  recordBroadcastDelivery,
  evaluateStaleness,
  staleSignals,
  sweepInboxes,
  sentBy,
  retireMessage,
  readRetirementLog,
  isSpecialRecipient,
  STALE_AGE_DAYS,
  type HiveMessage,
} from "../src/lib/hivemind.ts"

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hivemind-test-"))
  fs.mkdirSync(path.join(dir, ".opencode/agents/capabilities"), { recursive: true })
  fs.mkdirSync(path.join(dir, ".opencode/agents/dissolved"), { recursive: true })
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function writeCap(name: string, where: "capabilities" | "dissolved" = "capabilities") {
  fs.writeFileSync(path.join(dir, `.opencode/agents/${where}/${name}.md`), `---\ndescription: test\n---\n`)
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

/** Write a message with an explicit timestamp/sender directly to an inbox. */
function plant(recipient: string, sender: string, over: Partial<HiveMessage> = {}): string {
  const inboxDir = path.join(dir, ".opencode/hivemind/inbox", recipient)
  fs.mkdirSync(inboxDir, { recursive: true })
  const msg: HiveMessage = {
    id: `msg_test_${Math.random().toString(36).slice(2, 8)}`,
    sender,
    recipient,
    type: "info",
    content: "planted",
    status: "pending",
    timestamp: daysAgo(1),
    groupId: "g1",
    ...over,
  }
  const file = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`
  fs.writeFileSync(path.join(inboxDir, file), JSON.stringify(msg, null, 2))
  return file
}

// ── I-033: special addresses bypass the capability-name check, explicitly ────

describe("special recipients (I-033)", () => {
  test("_coordinator and _broadcast are the only legal special addresses", () => {
    expect(isSpecialRecipient("_coordinator")).toBe(true)
    expect(isSpecialRecipient("_broadcast")).toBe(true)
    expect(isSpecialRecipient("hive-infra")).toBe(false)
    expect(isSpecialRecipient("_foo")).toBe(false)
  })

  test("both specials write WITHOUT any capability file existing (the bypass)", () => {
    // No writeCap() here — the whole point is these recipients have no file.
    expect(() => sendMessage(dir, { sender: "s", recipient: "_coordinator", type: "request", content: "x", groupId: "g1" })).not.toThrow()
    expect(() => sendMessage(dir, { sender: "s", recipient: "_broadcast", type: "info", content: "x", groupId: "g1" })).not.toThrow()
  })

  test("an unknown _-prefixed recipient is REFUSED rather than minting an orphaned bucket", () => {
    expect(() => sendMessage(dir, { sender: "s", recipient: "_coordiantor", type: "info", content: "typo", groupId: "g1" })).toThrow(/unknown special recipient/)
    // And it minted nothing on disk.
    expect(fs.existsSync(path.join(dir, ".opencode/hivemind/inbox/_coordiantor"))).toBe(false)
  })
})

// ── W-119: delivered status flip ─────────────────────────────────────────────

describe("markDelivered (W-119)", () => {
  test("flips pending → delivered on the FILE", () => {
    writeCap("sender-cap")
    const file = sendMessage(dir, { sender: "sender-cap", recipient: "rcpt", type: "info", content: "hi", groupId: "g1" })
    expect(markDelivered(dir, "rcpt", file)).toBe(true)
    const msg = JSON.parse(fs.readFileSync(path.join(dir, ".opencode/hivemind/inbox/rcpt", file), "utf8"))
    expect(msg.status).toBe("delivered")
  })

  test("readers still treat delivered as not-yet-read", () => {
    writeCap("sender-cap")
    const file = sendMessage(dir, { sender: "sender-cap", recipient: "rcpt", type: "info", content: "hi", groupId: "g1" })
    markDelivered(dir, "rcpt", file)
    const inbox = getInbox(dir, "rcpt", "g1")
    expect(inbox.length).toBe(1) // delivered still surfaces as unread
  })

  test("is a no-op on an already-read message and on a missing file", () => {
    writeCap("sender-cap")
    const file = sendMessage(dir, { sender: "sender-cap", recipient: "rcpt", type: "info", content: "hi", groupId: "g1" })
    markDelivered(dir, "rcpt", file)
    expect(markDelivered(dir, "rcpt", file)).toBe(false) // already delivered, not pending
    expect(markDelivered(dir, "rcpt", "msg_nonexistent.json")).toBe(false)
  })
})

describe("recordBroadcastDelivery (aggregate receipt)", () => {
  test("appends session IDs to deliveredTo and marks delivered", () => {
    writeCap("sender-cap")
    const file = sendMessage(dir, { sender: "sender-cap", recipient: "_broadcast", type: "info", content: "all", groupId: "g1" })
    recordBroadcastDelivery(dir, file, "ses_AAA")
    recordBroadcastDelivery(dir, file, "ses_BBB")
    const msg = JSON.parse(fs.readFileSync(path.join(dir, ".opencode/hivemind/inbox/_broadcast", file), "utf8"))
    expect(msg.deliveredTo).toEqual(["ses_AAA", "ses_BBB"])
    expect(msg.status).toBe("delivered")
  })
})

// ── mark-read scope: sweep-only-shown ────────────────────────────────────────

describe("markAllRead group scope (sweep-only-shown)", () => {
  test("marks ONLY the caller's group; other groups stay pending", () => {
    writeCap("sender-cap")
    const fileA = plant("rcpt", "sender-cap", { groupId: "groupA" })
    const fileB = plant("rcpt", "sender-cap", { groupId: "groupB" })

    const marked = markAllRead(dir, "rcpt", "groupA")
    expect(marked).toBe(1)

    const read = (f: string) =>
      JSON.parse(fs.readFileSync(path.join(dir, ".opencode/hivemind/inbox/rcpt", f), "utf8")).status
    expect(read(fileA)).toBe("read")
    expect(read(fileB)).toBe("pending") // group B untouched
  })

  test("undefined groupId marks everything (legacy behaviour)", () => {
    writeCap("sender-cap")
    plant("rcpt", "sender-cap", { groupId: "groupA" })
    plant("rcpt", "sender-cap", { groupId: "groupB" })
    expect(markAllRead(dir, "rcpt")).toBe(2)
  })
})

// ── Staleness signals ────────────────────────────────────────────────────────

describe("evaluateStaleness", () => {
  test("active sender, fresh message → not stale", () => {
    writeCap("sender-cap")
    const s = evaluateStaleness(dir, { sender: "sender-cap", status: "pending", timestamp: daysAgo(1) } as HiveMessage)
    expect(s.stale).toBe(false)
    expect(staleSignals(s)).toEqual([])
  })

  test("dissolved sender (in dissolved/, not capabilities/) → STRONG stale", () => {
    writeCap("gone-cap", "dissolved")
    const s = evaluateStaleness(dir, { sender: "gone-cap", status: "pending", timestamp: daysAgo(1) } as HiveMessage)
    expect(s.stale).toBe(true)
    expect(s.strong).toEqual(["dissolved-sender"])
  })

  test("explicit dissolved/ prefix in the sender field → STRONG stale, no disk check", () => {
    const s = evaluateStaleness(dir, { sender: "dissolved/old-cap", status: "pending", timestamp: daysAgo(1) } as HiveMessage)
    expect(s.stale).toBe(true)
    expect(s.strong).toEqual(["dissolved-sender"])
  })

  test("sender in NEITHER dir (coordinator name like 'build') → NOT stale by sender signal", () => {
    const s = evaluateStaleness(dir, { sender: "build", status: "pending", timestamp: daysAgo(1) } as HiveMessage)
    expect(s.stale).toBe(false)
    expect(s.strong).toEqual([])
  })

  test("age is a WEAK signal: old pending message from an ACTIVE sender → not excluded", () => {
    writeCap("sender-cap")
    const s = evaluateStaleness(dir, { sender: "sender-cap", status: "pending", timestamp: daysAgo(STALE_AGE_DAYS + 5) } as HiveMessage)
    expect(s.stale).toBe(false) // weak never excludes alone
    expect(s.weak).toEqual(["age"])
  })

  test("age does not fire on delivered/read messages", () => {
    writeCap("sender-cap")
    const s = evaluateStaleness(dir, { sender: "sender-cap", status: "delivered", timestamp: daysAgo(STALE_AGE_DAYS + 5) } as HiveMessage)
    expect(s.weak).toEqual([])
  })

  test("system senders are exempt from the sender-existence check", () => {
    for (const sys of ["_coordinator", "_broadcast"]) {
      const s = evaluateStaleness(dir, { sender: sys, status: "pending", timestamp: daysAgo(1) } as HiveMessage)
      expect(s.stale).toBe(false)
    }
  })

  test("staleness `now` is injectable", () => {
    writeCap("sender-cap")
    const future = new Date(Date.now() + (STALE_AGE_DAYS + 10) * 24 * 60 * 60 * 1000)
    const s = evaluateStaleness(dir, { sender: "sender-cap", status: "pending", timestamp: daysAgo(0) } as HiveMessage, future)
    expect(s.weak).toEqual(["age"])
  })
})

// ── Sweep + sent view ────────────────────────────────────────────────────────

describe("sweepInboxes", () => {
  test("enumerates pending/delivered with staleness; skips read", () => {
    writeCap("sender-cap")
    writeCap("gone-cap", "dissolved")
    plant("rcpt", "sender-cap", { groupId: "g1" })
    plant("rcpt", "gone-cap", { groupId: "g1" })
    plant("rcpt", "sender-cap", { groupId: "g1", status: "read" })

    const sweep = sweepInboxes(dir)
    expect(sweep.length).toBe(2)
    const stale = sweep.filter((e) => e.staleness.stale)
    expect(stale.length).toBe(1)
    expect(stale[0]!.msg.sender).toBe("gone-cap")
  })

  test("group filter scopes the sweep", () => {
    writeCap("sender-cap")
    plant("rcpt", "sender-cap", { groupId: "g1" })
    plant("rcpt", "sender-cap", { groupId: "g2" })
    expect(sweepInboxes(dir, "g1").length).toBe(1)
  })
})

describe("sentBy (sender-side unread view)", () => {
  test("finds sent-but-unread across recipient buckets, collapses coordinator duality", () => {
    writeCap("me")
    plant("some-cap", "me", { groupId: "g1" })
    plant("_coordinator", "me", { groupId: "g1" }) // coordinator's second bucket
    plant("other-cap", "someone-else", { groupId: "g1" }) // not mine
    plant("some-cap", "me", { groupId: "g1", status: "read" }) // already read

    const sent = sentBy(dir, "me")
    expect(sent.length).toBe(2)
    expect(sent.map((s) => s.recipient).sort()).toEqual(["_coordinator", "some-cap"])
  })

  test("unreadOnly:false includes read history", () => {
    writeCap("me")
    plant("some-cap", "me", { groupId: "g1", status: "read" })
    plant("some-cap", "me", { groupId: "g1" })
    expect(sentBy(dir, "me", { unreadOnly: false }).length).toBe(2)
    expect(sentBy(dir, "me", { unreadOnly: true }).length).toBe(1)
  })
})

// ── Retirement + audit trail ─────────────────────────────────────────────────

describe("retireMessage + audit trail", () => {
  test("moves the file to retired/ and appends a v:1 audit entry", () => {
    writeCap("gone-cap", "dissolved")
    const file = plant("rcpt", "gone-cap", { groupId: "g1", content: "old question" })

    const rec = retireMessage(dir, "rcpt", file, {
      signals: ["dissolved-sender"],
      retiredBy: "hive-infra",
      reason: "sender dissolved, question moot",
    })
    expect(rec.ok).toBe(true)

    // File moved, not deleted
    expect(fs.existsSync(path.join(dir, ".opencode/hivemind/inbox/rcpt", file))).toBe(false)
    expect(fs.existsSync(path.join(dir, ".opencode/hivemind/retired/rcpt", file))).toBe(true)

    // Audit entry shape — the frozen v:1 contract (W-126)
    const log = readRetirementLog(dir)
    expect(log.length).toBe(1)
    const e = log[0]!
    expect(e.v).toBe(1)
    expect(e.file).toBe(file)
    expect(e.from).toBe("rcpt")
    expect(e.to).toBe("retired/rcpt")
    expect(e.sender).toBe("gone-cap")
    expect(e.recipient).toBe("rcpt")
    expect(e.signals).toEqual(["dissolved-sender"])
    expect(e.retired_by).toBe("hive-infra")
    expect(e.reason).toBe("sender dissolved, question moot")
    expect(typeof e.at).toBe("string")
    expect(typeof e.timestamp).toBe("string")
  })

  test("audit trail lives at the hivemind ROOT, not in retired/ (W-124)", () => {
    writeCap("gone-cap", "dissolved")
    const file = plant("rcpt", "gone-cap", { groupId: "g1" })
    retireMessage(dir, "rcpt", file, { signals: ["dissolved-sender"], retiredBy: "test", reason: "x" })
    expect(fs.existsSync(path.join(dir, ".opencode/hivemind/retirement-log.jsonl"))).toBe(true)
  })

  test("force-retire (signals:[]) is recorded visibly, not silently", () => {
    writeCap("sender-cap")
    const file = plant("rcpt", "sender-cap", { groupId: "g1" })
    retireMessage(dir, "rcpt", file, { signals: [], retiredBy: "test", reason: "manual cleanup" })
    const log = readRetirementLog(dir)
    expect(log[0]!.signals).toEqual([]) // the greppable anomaly
  })

  test("refuses to lose a malformed file; never deletes on failure", () => {
    const inboxDir = path.join(dir, ".opencode/hivemind/inbox/rcpt")
    fs.mkdirSync(inboxDir, { recursive: true })
    fs.writeFileSync(path.join(inboxDir, "msg_bad.json"), "{not json")
    const rec = retireMessage(dir, "rcpt", "msg_bad.json", { signals: [], retiredBy: "test", reason: "x" })
    expect(rec.ok).toBe(false)
    expect(fs.existsSync(path.join(inboxDir, "msg_bad.json"))).toBe(true) // still there
  })

  test("retired messages no longer appear in the sweep or inbox", () => {
    writeCap("gone-cap", "dissolved")
    const file = plant("rcpt", "gone-cap", { groupId: "g1" })
    expect(sweepInboxes(dir).length).toBe(1)
    retireMessage(dir, "rcpt", file, { signals: ["dissolved-sender"], retiredBy: "test", reason: "x" })
    expect(sweepInboxes(dir).length).toBe(0)
    expect(getInbox(dir, "rcpt").length).toBe(0)
  })

  test("audit log survives across multiple retirements (append-only)", () => {
    writeCap("gone-cap", "dissolved")
    const f1 = plant("rcpt", "gone-cap", { groupId: "g1" })
    const f2 = plant("rcpt", "gone-cap", { groupId: "g1" })
    retireMessage(dir, "rcpt", f1, { signals: ["dissolved-sender"], retiredBy: "test", reason: "a" })
    retireMessage(dir, "rcpt", f2, { signals: ["dissolved-sender"], retiredBy: "test", reason: "b" })
    expect(readRetirementLog(dir).length).toBe(2)
  })
})
