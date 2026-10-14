// WI-093 — the board COMMAND transitions (board-commands.ts): /board-close,
// /board-release, /board-reopen's locked-store write paths. Same harness shape
// as board-transitions.test.mjs (node:test over the built dist through the
// ./lib exports map, tmp workspaces, everything through the store's own API —
// no file hand-edits anywhere; hand-written text below is a PARSE fixture
// only). The WI-083 arc (acceptance 1) lives at the bottom: a dream-promoted
// done item still owned by its finished session gets released, and a successor
// bind — blocked until then by SESSION_OWNS_OTHER — succeeds.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

import { itemPath, specHash, parseWorkItem, applyEditToContent, nowIso } from "@hive/dsh-board/lib/board-store"
import { computeProblems } from "@hive/dsh-board/lib/board-invariants"
import { createIdea, bindSession, autoRegister, markItemDoneFromDream, demoteItem } from "@hive/dsh-board/lib/board-transitions"
import { closeItem, releaseItem, reopenItem } from "@hive/dsh-board/lib/board-commands"

const tmpDirs = []
function withDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-commands-test-"))
  tmpDirs.push(dir)
  return fn(dir)
}
process.on("exit", () => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {}
  }
})

/** Ownership-legitimate fixture: an awakened-coordinator arc (bind stamps the 1:1 pair). */
async function bindFixture(dir, title, sessionID, init = {}) {
  const created = await createIdea(dir, { title, ...init })
  assert.ok(created.ok, `fixture create failed: ${JSON.stringify(created)}`)
  const bound = await bindSession(dir, created.item.id, sessionID, sessionID)
  assert.ok(bound.ok, `fixture bind failed: ${JSON.stringify(bound)}`)
  return bound.item
}

/** A dream-complete close that RETAINS ownership — the exact WI-083 shape. */
async function dreamDone(dir, id, sessionID, drm = "DRM-901") {
  const done = await markItemDoneFromDream(dir, sessionID, drm, {
    drmIsComplete: () => true,
    drmArtifacts: () => ["I-001"],
    drmIsPreCompaction: () => false,
  })
  assert.ok(done.ok, JSON.stringify(done))
  return done
}

const last = (item) => item.transitions[item.transitions.length - 1]

// ── Transition.note format (WI-093's reason line) ────────────────────────────

test("note: entries without note stay byte-identical and parse with the key absent", async () => {
  await withDir(async (dir) => {
    const item = await bindFixture(dir, "byte-stability", "ses_bs", { status: "todo" })
    const before = fs.readFileSync(itemPath(dir, item.id), "utf8")
    const shared = { at: nowIso(), from: "todo", to: "todo", by: "board:test" }
    // The note-less append produces EXACTLY the pre-note format — the same
    // guarantee the `absorbed` pin carries for that key.
    const noNote = applyEditToContent(before, { appendTransition: shared })
    assert.ok(noNote.includes("{ at: "), "entry appended")
    assert.ok(!noNote.includes("note:"), "no note key emitted for note-less entries")
    assert.equal(parseWorkItem(noNote).transitions.at(-1).note, undefined)
    // A noted entry round-trips verbatim through the flow-map parser.
    const reason = 'shipped: tests green, "corridor" clean — done'
    const noted = parseWorkItem(
      applyEditToContent(before, { appendTransition: { ...shared, note: reason } })
    ).transitions.at(-1)
    assert.equal(noted.note, reason)
  })
})

// ── closeItem ─────────────────────────────────────────────────────────────────

test("closeItem: any live state → done, badged, note recorded, signed by", async () => {
  await withDir(async (dir) => {
    const item = await bindFixture(dir, "zombie close", "ses_close", { status: "todo" })
    const r = await closeItem(dir, item.id, {
      actingSession: "ses_close",
      by: "command:board-close:ses_close",
      note: "obsolete for two weeks",
    })
    assert.ok(r.ok, JSON.stringify(r))
    assert.equal(r.action, "done")
    assert.equal(r.item.status, "done")
    assert.equal(r.item.done_without_dream, true)
    assert.equal(r.item.owner_session, "ses_close", "close does not release ownership")
    const t = last(r.item)
    assert.equal(t.to, "done")
    assert.equal(t.by, "command:board-close:ses_close")
    assert.equal(t.session, "ses_close")
    assert.equal(t.note, "obsolete for two weeks")
    assert.deepEqual(computeProblems(r.item), [], "done ⟹ badge — invariants clean")
  })
})

test("closeItem: un-owned items close identity-free; wrong owner refused naming the owner; ALREADY_DONE; NOT_FOUND", async () => {
  await withDir(async (dir) => {
    const made = await createIdea(dir, { title: "un-owned idea" })
    assert.ok(made.ok)
    const r = await closeItem(dir, made.item.id, { actingSession: null })
    assert.ok(r.ok, JSON.stringify(r))
    assert.equal(r.item.done_without_dream, true)
    assert.equal(r.item.owner_session, null)
    assert.equal(last(r.item).by, "command:board-close", "default by label")
    assert.equal(last(r.item).session, undefined, "identity-free close leaves no session stamp")
  })
  await withDir(async (dir) => {
    const item = await bindFixture(dir, "other's", "ses_owner", { status: "todo" })
    const refused = await closeItem(dir, item.id, { actingSession: "ses_intruder" })
    assert.equal(refused.ok, false)
    assert.equal(refused.reason, "ITEM_OWNED")
    assert.match(refused.detail, /ses_owner/)
    assert.match(refused.detail, /board-release|that session/)
    const asOwner = await closeItem(dir, item.id, { actingSession: "ses_owner" })
    assert.ok(asOwner.ok, JSON.stringify(asOwner))
    const again = await closeItem(dir, item.id, { actingSession: "ses_owner" })
    assert.equal(again.reason, "ALREADY_DONE")
    const ghost = await closeItem(dir, "WI-999", { actingSession: "ses_x" })
    assert.equal(ghost.reason, "NOT_FOUND")
  })
})

// ── releaseItem ───────────────────────────────────────────────────────────────

test("releaseItem: in_progress flavor is the full true-demote (§5.5)", async () => {
  await withDir(async (dir) => {
    const item = await bindFixture(dir, "park it", "ses_ip")
    assert.equal(item.status, "in_progress")
    const before = specHash(item.body)
    const r = await releaseItem(dir, item.id, { by: "command:board-release:ses_op", note: "owner went dark" })
    assert.ok(r.ok, JSON.stringify(r))
    assert.equal(r.action, "demoted")
    assert.equal(r.item.status, "todo", "to defaults todo")
    assert.equal(r.item.owner_session, null)
    assert.equal(r.item.group_id, null)
    assert.equal(r.item.paused, false)
    assert.deepEqual(r.item.released_sessions, ["ses_ip"])
    assert.equal(r.item.spec_hash, before, "re-stamped from the unchanged body — same value")
    const t = last(r.item)
    assert.equal(t.from, "in_progress")
    assert.equal(t.to, "todo")
    assert.equal(t.by, "command:board-release:ses_op")
    assert.equal(t.session, "ses_ip")
    assert.equal(t.note, "owner went dark")
    assert.deepEqual(computeProblems(r.item), [])
  })
})

test("releaseItem: to:'backlog' honored on the in_progress flavor", async () => {
  await withDir(async (dir) => {
    const item = await bindFixture(dir, "to backlog", "ses_bl")
    const r = await releaseItem(dir, item.id, { to: "backlog" })
    assert.ok(r.ok, JSON.stringify(r))
    assert.equal(r.item.status, "backlog")
    assert.equal(last(r.item).to, "backlog")
  })
})

test("releaseItem: DONE flavor — status stays done, owner cleared, tombstone, spec re-stamp (the WI-083 case)", async () => {
  await withDir(async (dir) => {
    const item = await bindFixture(dir, "dream-promoted", "ses_dead")
    const done = await dreamDone(dir, item.id, "ses_dead")
    assert.equal(done.item.status, "done")
    assert.equal(done.item.owner_session, "ses_dead")
    const r = await releaseItem(dir, item.id, { by: "command:board-release:ses_successor" })
    assert.ok(r.ok, JSON.stringify(r))
    assert.equal(r.action, "released-from-done")
    assert.equal(r.item.status, "done", "a release never redefines how work finished")
    assert.equal(r.item.owner_session, null)
    assert.equal(r.item.group_id, null)
    assert.equal(r.item.done_without_dream, false, "the dream badge is history — untouched by release")
    assert.deepEqual(r.item.released_sessions, ["ses_dead"])
    assert.equal(last(r.item).to, "done", "the honest self-loop records a release-from-done")
    assert.equal(last(r.item).by, "command:board-release:ses_successor", "identity is the caller's — the successor signed it")
    assert.deepEqual(computeProblems(r.item), [])
  })
})

test("releaseItem: 'to' on a done item is refused INVALID_TARGET; un-owned is NOT_OWNED; NOT_FOUND", async () => {
  await withDir(async (dir) => {
    const item = await bindFixture(dir, "done owned", "ses_d")
    await dreamDone(dir, item.id, "ses_d", "DRM-902")
    const refused = await releaseItem(dir, item.id, { to: "todo" })
    assert.equal(refused.ok, false)
    assert.equal(refused.reason, "INVALID_TARGET")
    assert.match(refused.detail, /reopen/i)
    const clean = await releaseItem(dir, item.id)
    assert.equal(clean.action, "released-from-done")

    const queued = await createIdea(dir, { title: "queued un-owned" })
    const notOwned = await releaseItem(dir, queued.item.id)
    assert.equal(notOwned.ok, false)
    assert.equal(notOwned.reason, "NOT_OWNED")
    const missing = await releaseItem(dir, "WI-999")
    assert.equal(missing.reason, "NOT_FOUND")
  })
})

// ── reopenItem ────────────────────────────────────────────────────────────────

test("reopenItem: the actor's own done item reopens in place, badge cleared, spec_hash untouched", async () => {
  await withDir(async (dir) => {
    const item = await bindFixture(dir, "continuation", "ses_own", { body: "spec v1" })
    const expectedHash = specHash(item.body)
    const r0 = await closeItem(dir, item.id, { actingSession: "ses_own" })
    assert.ok(r0.ok)
    const r = await reopenItem(dir, item.id, "ses_own", { by: "command:board-reopen:ses_own", note: "the arc continues" })
    assert.ok(r.ok, JSON.stringify(r))
    assert.equal(r.action, "reopened")
    assert.equal(r.item.status, "in_progress")
    assert.equal(r.item.owner_session, "ses_own", "owner stays")
    assert.equal(r.item.group_id, "ses_own")
    assert.equal(r.item.done_without_dream, false, "audited badge clear")
    assert.equal(r.item.spec_hash, expectedHash, "reopen never rewrites provenance")
    const t = last(r.item)
    assert.equal(t.by, "command:board-reopen:ses_own")
    assert.equal(t.session, "ses_own")
    assert.equal(t.note, "the arc continues")
    assert.deepEqual(computeProblems(r.item), [])
  })
})

test("reopenItem: un-owned done item is ADOPTED by a free session (owner+group stamped together)", async () => {
  await withDir(async (dir) => {
    const item = await bindFixture(dir, "orphaned done", "ses_gone", { status: "todo" })
    await closeItem(dir, item.id, { actingSession: "ses_gone" })
    await releaseItem(dir, item.id)
    const r = await reopenItem(dir, item.id, "ses_adopter")
    assert.ok(r.ok, JSON.stringify(r))
    assert.equal(r.action, "adopted")
    assert.equal(r.item.status, "in_progress")
    assert.equal(r.item.owner_session, "ses_adopter")
    assert.equal(r.item.group_id, "ses_adopter", "I-043: stamped together")
    assert.deepEqual(computeProblems(r.item), [])
  })
})

test("reopenItem: adoption refused SESSION_OWNS_OTHER when the actor owns another item (naming it)", async () => {
  await withDir(async (dir) => {
    const mine = await bindFixture(dir, "my live item", "ses_busy")
    const orphan = await bindFixture(dir, "orphaned done", "ses_gone", { status: "todo" })
    await closeItem(dir, orphan.id, { actingSession: "ses_gone" })
    await releaseItem(dir, orphan.id)
    const r = await reopenItem(dir, orphan.id, "ses_busy")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "SESSION_OWNS_OTHER")
    assert.match(r.detail, new RegExp(mine.id))
    assert.match(r.detail, /1:1/)
    assert.match(r.detail, /board-release/)
  })
})

test("reopenItem: another session's done item refused ITEM_OWNED naming the blocking owner", async () => {
  await withDir(async (dir) => {
    const item = await bindFixture(dir, "theirs", "ses_holder", { status: "todo" })
    await closeItem(dir, item.id, { actingSession: "ses_holder" })
    const r = await reopenItem(dir, item.id, "ses_other")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "ITEM_OWNED")
    assert.match(r.detail, /ses_holder/)
    assert.match(r.detail, /board-release|owning session/)
  })
})

test("reopenItem: the released session cannot re-own — SESSION_RELEASED (tombstone respected, §5.5)", async () => {
  await withDir(async (dir) => {
    const item = await bindFixture(dir, "tombed", "ses_released", { status: "todo" })
    await closeItem(dir, item.id, { actingSession: "ses_released" })
    await releaseItem(dir, item.id)
    const r = await reopenItem(dir, item.id, "ses_released")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "SESSION_RELEASED")
  })
})

test("reopenItem: ALREADY_IN_PROGRESS and NOT_DONE are exact; NOT_FOUND", async () => {
  await withDir(async (dir) => {
    const live = await bindFixture(dir, "already open", "ses_a")
    const ip = await reopenItem(dir, live.id, "ses_a")
    assert.equal(ip.reason, "ALREADY_IN_PROGRESS")

    const queued = await createIdea(dir, { title: "never closed" })
    const nd = await reopenItem(dir, queued.item.id, "ses_a")
    assert.equal(nd.reason, "NOT_DONE", "item-level facts outrank actor-level ones — the status gate fires first")

    const missing = await reopenItem(dir, "WI-999", "ses_a")
    assert.equal(missing.reason, "NOT_FOUND")
  })
})

test("reopenItem: the tombstone check fires before status — even on a live item", async () => {
  await withDir(async (dir) => {
    const first = await bindFixture(dir, "first hold", "ses_ret")
    await releaseItem(dir, first.id) // ses_ret tombstoned on THIS item only; item → todo
    const second = await bindFixture(dir, "second hold", "ses_ret")
    assert.equal(second.status, "in_progress", "the tombstone is per-item: ses_ret still binds other work")
    const r = await reopenItem(dir, first.id, "ses_ret")
    assert.equal(r.reason, "SESSION_RELEASED", "in_progress or not — the tombstone is terminal for re-owning")
  })
})

// ── demoteItem parity guard: the command in_progress flavor must not drift ───

test("releaseItem in_progress flavor == demoteItem field-for-field on identical input", async () => {
  await withDir(async (dir) => {
    const a = await bindFixture(dir, "release twin", "ses_cmp", { body: "same body", status: "todo" })
    const b = await bindFixture(dir, "demote original", "ses_cmp2", { body: "same body", status: "todo" })
    const rCmd = await releaseItem(dir, a.id, { by: "command:board-release:ses_cmp", note: "via command" })
    const rUp = await demoteItem(dir, b.id, "todo", "board:demote")
    assert.ok(rCmd.ok && rUp.ok, JSON.stringify({ rCmd, rUp }))
    // Field SEMANTICS must be identical; the values differ only through the
    // released session's identity (different fixture owners) and the optional
    // note only the command layer adds.
    const shape = (t) => ({ from: t.from, to: t.to, hasSession: typeof t.session === "string" })
    assert.deepEqual(shape(last(rCmd.item)), shape(last(rUp.item)))
    assert.equal(last(rCmd.item).note, "via command")
    assert.equal(last(rUp.item).note, undefined)
    assert.equal(rCmd.item.status, rUp.item.status)
    assert.equal(rCmd.item.owner_session, rUp.item.owner_session)
    assert.equal(rCmd.item.released_sessions.length, rUp.item.released_sessions.length, "one tombstone apiece")
    assert.equal(JSON.stringify(rCmd.item.released_sessions), JSON.stringify(["ses_cmp"]))
    assert.equal(JSON.stringify(rUp.item.released_sessions), JSON.stringify(["ses_cmp2"]))
    assert.equal(rCmd.item.spec_hash, rUp.item.spec_hash, "same demote-time baseline rule")
    // by labels differ on purpose: the command signs command:board-release:*
    assert.notEqual(last(rCmd.item).by, last(rUp.item).by)
  })
})

// ── acceptance 1: the WI-083 successor arc, end to end ───────────────────────

test("WI-083 arc: dream-promoted done item still owned → release → successor bind succeeds", async () => {
  await withDir(async (dir) => {
    // 1. The coordinator awakens: autoRegister creates its 1:1 item.
    const reg = await autoRegister(dir, "ses_coordinator", "ses_coordinator", "the WI-083 work")
    assert.equal(reg.action, "registered")
    // 2. End-of-work dream completes: item → done, ownership RETAINED
    //    (markItemDoneFromDream never releases).
    const done = await dreamDone(dir, reg.item.id, "ses_coordinator", "DRM-083")
    assert.equal(done.action, "done")
    assert.equal(done.item.owner_session, "ses_coordinator")
    // 3. New work by the same session: bind is REFUSED — the 1:1 invariant
    //    still sees the finished item.
    const fresh = await createIdea(dir, { title: "the successor work" })
    const blocked = await bindSession(dir, fresh.item.id, "ses_coordinator", "ses_coordinator")
    assert.equal(blocked.ok, false)
    assert.equal(blocked.reason, "SESSION_OWNS_OTHER")
    // 4. /board-release (here: the store call the command drives) unblocks.
    const released = await releaseItem(dir, reg.item.id, { by: "command:board-release:ses_coordinator" })
    assert.ok(released.ok, JSON.stringify(released))
    assert.equal(released.action, "released-from-done")
    // 5. The successor bind now SUCCEEDS.
    const rebound = await bindSession(dir, fresh.item.id, "ses_coordinator", "ses_coordinator")
    assert.ok(rebound.ok, JSON.stringify(rebound))
    assert.equal(rebound.action, "bound")
    assert.equal(rebound.item.status, "in_progress")
    // 6. The tombstone does NOT lock the released session out of OTHER items…
    const third = await createIdea(dir, { title: "third work" })
    const held = await bindSession(dir, third.item.id, "ses_coordinator", "ses_coordinator")
    assert.equal(held.ok, false, "…but it is still strictly 1:1 — the new bind holds the session")
    assert.equal(held.reason, "SESSION_OWNS_OTHER")
    // …only out of THE item it was released from.
    const tomb = await bindSession(dir, reg.item.id, "ses_coordinator", "ses_coordinator")
    assert.equal(tomb.ok, false)
    assert.equal(tomb.reason, "SESSION_RELEASED")
  })
})
