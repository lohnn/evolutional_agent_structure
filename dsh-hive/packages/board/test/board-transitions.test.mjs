// Port of the OpenCode plugin's test/board-transitions.test.ts (bun:test →
// node:test), semantics preserved 1:1 — bind/autoRegister/absorption/demote/
// dream-done/startItem/promoteItem/reattach matrices are the ownership and
// Done-safety contract of the ported module. Runner + import targets changed
// only (dist via the ./lib exports map). startItem/promoteItem are
// COMPILED-BUT-UNCALLED on dsh (decisions D9/H1) and their tests run against
// the injected fake session client — the module-level contract, not a dsh
// session promise.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

import { readItem, specHash, itemPath, mutateItem, listItems } from "@hive/dsh-board/lib/board-store"
import {
  createIdea,
  bindSession,
  autoRegister,
  pauseItem,
  unpauseItem,
  demoteItem,
  markDoneWithoutDream,
  markItemDoneFromDream,
  dreamCompleteBy,
  startItem,
  promoteItem,
  reattachInfo,
} from "@hive/dsh-board/lib/board-transitions"
import { makeDrmCompleteCheck, makeDrmArtifacts } from "@hive/dsh-board/lib/drm-read"

const tmpDirs = []
function withDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-trans-test-"))
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

/** Recording fake for the session seam. */
function fakeSessions(overrides = {}) {
  const calls = []
  let counter = 0
  return {
    calls,
    async createSession(title) {
      calls.push({ op: "create", args: [title] })
      return overrides.createSession ? overrides.createSession(title) : `ses_fresh_${++counter}`
    },
    async command(sessionID, command, argsText) {
      calls.push({ op: "command", args: [sessionID, command, argsText] })
      if (overrides.command) return overrides.command(sessionID, command, argsText)
    },
  }
}

/** Unwrap createIdea loudly — a silently-refused fixture would make a later assertion lie. */
async function mkIdea(d, init) {
  const r = await createIdea(d, init)
  if (!r.ok) throw new Error(`fixture createIdea refused: ${r.reason} — ${r.detail}`)
  return r
}

// ── createIdea ───────────────────────────────────────────────────────────────

test("createIdea: creates a backlog item with a birth transition (from: null)", async () => {
  await withDir(async (dir) => {
    const r = await mkIdea(dir, { title: "An idea", body: "## Spec\n\ndetails", tags: ["x"] })
    assert.equal(r.item.id, "WI-001")
    assert.equal(r.item.status, "backlog")
    assert.equal(r.item.origin, "idea-first")
    assert.equal(r.item.owner_session, null)
    assert.equal(r.item.spec_hash, null) // stamped at bind, not at idea creation
    assert.equal(r.item.transitions.length, 1)
    assert.equal(r.item.transitions[0].from, null)
    assert.equal(r.item.transitions[0].to, "backlog")
  })
})

test("createIdea: status todo supported", async () => {
  await withDir(async (dir) => {
    const r = await mkIdea(dir, { title: "Ready", status: "todo" })
    assert.equal(r.item.status, "todo")
  })
})

// ── bindSession ──────────────────────────────────────────────────────────────

test("bindSession: owner+group stamped together, in_progress, spec_hash from body, transition appended", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea", body: "spec body", status: "todo" })
    const r = await bindSession(dir, item.id, "ses_owner", "ses_group")
    assert.equal(r.action, "bound")
    assert.equal(r.item.owner_session, "ses_owner")
    assert.equal(r.item.group_id, "ses_group")
    assert.equal(r.item.status, "in_progress")
    assert.equal(r.item.origin, "idea-first") // origin stays as-born
    assert.equal(r.item.spec_hash, specHash("spec body"))
    const last = r.item.transitions[r.item.transitions.length - 1]
    assert.equal(last.from, "todo")
    assert.equal(last.to, "in_progress")
    assert.equal(last.session, "ses_owner")
  })
})

test("bindSession: idempotent when already bound to the same session", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")
    const r = await bindSession(dir, item.id, "ses_owner", "ses_owner")
    assert.ok(r.ok && r.action === "already-bound")
  })
})

test("bindSession: refuses NOT_FOUND / ITEM_OWNED / SESSION_OWNS_OTHER / SESSION_RELEASED", async () => {
  await withDir(async (dir) => {
    const nf = await bindSession(dir, "WI-999", "ses_a", null)
    assert.ok(!nf.ok && nf.reason === "NOT_FOUND")

    const { item: a } = await mkIdea(dir, { title: "A" })
    const { item: b } = await mkIdea(dir, { title: "B" })
    await bindSession(dir, a.id, "ses_a", "ses_a")

    const owned = await bindSession(dir, a.id, "ses_b", "ses_b")
    assert.ok(!owned.ok && owned.reason === "ITEM_OWNED")

    const other = await bindSession(dir, b.id, "ses_a", "ses_a")
    assert.ok(!other.ok && other.reason === "SESSION_OWNS_OTHER")

    // release ses_a from A via true-demote, then try to re-bind the tombstoned session
    await demoteItem(dir, a.id, "todo")
    const released = await bindSession(dir, a.id, "ses_a", "ses_a")
    assert.ok(!released.ok && released.reason === "SESSION_RELEASED")
  })
})

// ── autoRegister (awaken create-or-bind) ─────────────────────────────────────

test("autoRegister: creates a session-first in_progress item", async () => {
  await withDir(async (dir) => {
    const r = await autoRegister(dir, "ses_new", "ses_new", "My chat title")
    assert.equal(r.action, "registered")
    assert.equal(r.item.origin, "session-first")
    assert.equal(r.item.status, "in_progress")
    assert.equal(r.item.owner_session, "ses_new")
    assert.equal(r.item.group_id, "ses_new")
    assert.equal(r.item.title, "My chat title")
    assert.equal(r.item.spec_hash, specHash("")) // creation IS the bind
    assert.equal(r.item.transitions[0].from, null)
    assert.equal(r.item.transitions[0].to, "in_progress")
    assert.equal(r.item.transitions[0].by, "hive_awaken")
  })
})

test("autoRegister: no-ops when the session already owns an item (Phase 3 start idempotency)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    const r = await autoRegister(dir, "ses_x", "ses_x", "whatever")
    assert.equal(r.action, "noop-owned")
    assert.equal(r.item.id, item.id)
  })
})

test("autoRegister: skips tombstoned sessions entirely (§5.5)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    await demoteItem(dir, item.id, "backlog")
    const r = await autoRegister(dir, "ses_x", "ses_x", "whatever")
    assert.equal(r.action, "skipped-released")
    assert.equal(r.item.id, item.id)
  })
})

// ── pause / unpause ──────────────────────────────────────────────────────────

test("pause: sets the flag, appends in_progress→in_progress transition with the owner session", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    const r = await pauseItem(dir, item.id)
    assert.ok(r.ok && r.action === "paused")
    assert.equal(r.item.paused, true)
    assert.equal(r.item.status, "in_progress") // paused is a sub-state, not a column
    const last = r.item.transitions[r.item.transitions.length - 1]
    assert.equal(last.from, "in_progress")
    assert.equal(last.to, "in_progress")
    assert.equal(last.session, "ses_x")

    const again = await pauseItem(dir, item.id)
    assert.ok(again.ok && again.action === "already-paused")

    const up = await unpauseItem(dir, item.id)
    assert.ok(up.ok && up.action === "unpaused")
    assert.equal(up.item.paused, false)
  })
})

test("pause: refuses on non-in_progress items", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    const r = await pauseItem(dir, item.id)
    assert.ok(!r.ok && r.reason === "NOT_IN_PROGRESS")
  })
})

// ── demoteItem (true demote) ─────────────────────────────────────────────────

test("demote: tombstones the session, clears ownership, re-stamps spec_hash, moves back", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea", body: "original spec" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    const r = await demoteItem(dir, item.id, "todo")
    assert.ok(r.ok && r.action === "demoted")
    assert.equal(r.item.status, "todo")
    assert.equal(r.item.owner_session, null)
    assert.equal(r.item.group_id, null)
    assert.equal(r.item.paused, false)
    assert.deepEqual(r.item.released_sessions, ["ses_x"])
    assert.equal(r.item.spec_hash, specHash("original spec")) // demote-time baseline (Q13)
    const last = r.item.transitions[r.item.transitions.length - 1]
    assert.equal(last.session, "ses_x") // history, not forgotten
  })
})

test("demote: second demote of a re-bound item appends a second tombstone", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_1", "ses_1")
    await demoteItem(dir, item.id)
    await bindSession(dir, item.id, "ses_2", "ses_2")
    const r = await demoteItem(dir, item.id)
    assert.ok(r.ok)
    assert.deepEqual(r.item.released_sessions, ["ses_1", "ses_2"])
  })
})

test("demote: refuses on non-in_progress items", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    const r = await demoteItem(dir, item.id)
    assert.ok(!r.ok && r.reason === "NOT_IN_PROGRESS")
  })
})

// ── markDoneWithoutDream ─────────────────────────────────────────────────────

test("markDoneWithoutDream: badges and freezes", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Small chore" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    const r = await markDoneWithoutDream(dir, item.id)
    assert.ok(r.ok && r.action === "done")
    assert.equal(r.item.status, "done")
    assert.equal(r.item.done_without_dream, true)
    assert.equal(r.item.owner_session, "ses_x") // owner stays (frozen), enables re-attach

    const again = await markDoneWithoutDream(dir, item.id)
    assert.ok(!again.ok && again.reason === "ALREADY_DONE")
  })
})

// ── bind-time absorption (Q15 / SCHEMA §3 invariant 6) ───────────────────────

test("absorption happy path: pristine placeholder dissolved, lineage recorded, 1:1 holds", async () => {
  await withDir(async (dir) => {
    const { item: idea } = await mkIdea(dir, { title: "Real idea", body: "the spec" })
    const auto = await autoRegister(dir, "ses_x", "ses_x", "Chat title")
    const placeholder = auto.item

    const r = await bindSession(dir, idea.id, "ses_x", "ses_x")
    assert.ok(r.ok)
    assert.equal(r.action, "bound-absorbed")
    assert.equal(r.absorbed, placeholder.id)

    // placeholder file is gone (the one sanctioned deletion)
    assert.equal(readItem(dir, placeholder.id), null)
    assert.equal(fs.existsSync(itemPath(dir, placeholder.id)), false)

    // survivor is bound, with lineage on the bind transition
    assert.equal(r.item.owner_session, "ses_x")
    assert.equal(r.item.status, "in_progress")
    const last = r.item.transitions[r.item.transitions.length - 1]
    assert.equal(last.absorbed, placeholder.id)
    assert.equal(last.session, "ses_x")

    // exactly one item owned by the session — 1:1 exact at all times
    const owned = listItems(dir).filter((i) => i.owner_session === "ses_x")
    assert.equal(owned.length, 1)
    assert.equal(owned[0].id, idea.id)
  })
})

test("absorption non-pristine: body edited since creation → strict refusal", async () => {
  await withDir(async (dir) => {
    const { item: idea } = await mkIdea(dir, { title: "Idea" })
    const auto = await autoRegister(dir, "ses_x", "ses_x", "t")
    const p = itemPath(dir, auto.item.id)
    fs.writeFileSync(p, fs.readFileSync(p, "utf8") + "\naccrued session notes\n")

    const r = await bindSession(dir, idea.id, "ses_x", "ses_x")
    assert.ok(!r.ok && r.reason === "SESSION_OWNS_OTHER")
    assert.notEqual(readItem(dir, auto.item.id), null) // never destroyed
  })
})

test("absorption non-pristine: dream_id set → strict refusal", async () => {
  await withDir(async (dir) => {
    const { item: idea } = await mkIdea(dir, { title: "Idea" })
    const auto = await autoRegister(dir, "ses_x", "ses_x", "t")
    await mutateItem(dir, auto.item.id, { set: { dream_id: "DRM-009" } })

    const r = await bindSession(dir, idea.id, "ses_x", "ses_x")
    assert.ok(!r.ok && r.reason === "SESSION_OWNS_OTHER")
    assert.notEqual(readItem(dir, auto.item.id), null)
  })
})

test("absorption non-pristine: subtask mirror present → strict refusal", async () => {
  await withDir(async (dir) => {
    const { item: idea } = await mkIdea(dir, { title: "Idea" })
    const auto = await autoRegister(dir, "ses_x", "ses_x", "t")
    const p = itemPath(dir, auto.item.id)
    fs.writeFileSync(
      p,
      fs.readFileSync(p, "utf8").replace("subtasks: []", 'subtasks:\n  - { content: "planned step", status: pending }')
    )

    const r = await bindSession(dir, idea.id, "ses_x", "ses_x")
    assert.ok(!r.ok && r.reason === "SESSION_OWNS_OTHER")
    assert.notEqual(readItem(dir, auto.item.id), null)
  })
})

test("reclassification: idea-first SURVIVOR keeps author-written subtasks through absorption", async () => {
  await withDir(async (dir) => {
    const { item: idea } = await mkIdea(dir, { title: "Authored plan" })
    const p = itemPath(dir, idea.id)
    fs.writeFileSync(
      p,
      fs
        .readFileSync(p, "utf8")
        .replace(
          "subtasks: []",
          'subtasks:\n  - { content: "Phase 1 — do the thing", status: pending }\n  - { content: "Phase 2 — do the other", status: pending }'
        )
    )
    const auto = await autoRegister(dir, "ses_x", "ses_x", "placeholder")

    const r = await bindSession(dir, idea.id, "ses_x", "ses_x")

    assert.ok(r.ok && r.action === "bound-absorbed")
    const survivor = readItem(dir, idea.id)
    assert.deepEqual(
      survivor.subtasks.map((s) => s.content),
      ["Phase 1 — do the thing", "Phase 2 — do the other"]
    )
    assert.equal(survivor.owner_session, "ses_x")
    assert.equal(readItem(dir, auto.item.id), null)
  })
})

test("reclassification: the gate reads the ABSORBED item's subtasks, never the survivor's", async () => {
  await withDir(async (dir) => {
    const { item: idea } = await mkIdea(dir, { title: "Authored plan" })
    const ip = itemPath(dir, idea.id)
    fs.writeFileSync(
      ip,
      fs.readFileSync(ip, "utf8").replace("subtasks: []", 'subtasks:\n  - { content: "authored", status: pending }')
    )
    const auto = await autoRegister(dir, "ses_x", "ses_x", "placeholder")
    const ap = itemPath(dir, auto.item.id)
    fs.writeFileSync(
      ap,
      fs.readFileSync(ap, "utf8").replace("subtasks: []", 'subtasks:\n  - { content: "accrued on placeholder", status: pending }')
    )

    const r = await bindSession(dir, idea.id, "ses_x", "ses_x")

    assert.ok(!r.ok && r.reason === "SESSION_OWNS_OTHER")
    assert.notEqual(readItem(dir, auto.item.id), null)
    assert.equal(readItem(dir, idea.id).subtasks.length, 1)
  })
})

test("absorption: idea-first owned item is never absorbed (origin guard)", async () => {
  await withDir(async (dir) => {
    const { item: a } = await mkIdea(dir, { title: "A" })
    const { item: b } = await mkIdea(dir, { title: "B" })
    await bindSession(dir, a.id, "ses_x", "ses_x") // owns an idea-first item, pristine-looking otherwise
    const r = await bindSession(dir, b.id, "ses_x", "ses_x")
    assert.ok(!r.ok && r.reason === "SESSION_OWNS_OTHER")
    assert.notEqual(readItem(dir, a.id), null)
  })
})

test("absorption under the lock: concurrent binds resolve to exactly one owner, one deletion", async () => {
  await withDir(async (dir) => {
    const { item: i1 } = await mkIdea(dir, { title: "I1" })
    const { item: i2 } = await mkIdea(dir, { title: "I2" })
    const auto = await autoRegister(dir, "ses_x", "ses_x", "t")

    const [r1, r2] = await Promise.all([
      bindSession(dir, i1.id, "ses_x", "ses_x"),
      bindSession(dir, i2.id, "ses_x", "ses_x"),
    ])
    const oks = [r1, r2].filter((r) => r.ok)
    const fails = [r1, r2].filter((r) => !r.ok)
    assert.equal(oks.length, 1)
    assert.ok(oks[0].ok && oks[0].action === "bound-absorbed")
    assert.ok(!fails[0].ok && fails[0].reason === "SESSION_OWNS_OTHER")
    assert.equal(readItem(dir, auto.item.id), null)
    assert.equal(listItems(dir).filter((i) => i.owner_session === "ses_x").length, 1)
  })
})

test("idempotency interplay: later awaken auto-register no-ops on the bound session", async () => {
  await withDir(async (dir) => {
    const { item: idea } = await mkIdea(dir, { title: "Idea" })
    await autoRegister(dir, "ses_x", "ses_x", "t")
    await bindSession(dir, idea.id, "ses_x", "ses_x")

    const again = await autoRegister(dir, "ses_x", "ses_x", "t")
    assert.equal(again.action, "noop-owned")
    assert.equal(again.item.id, idea.id) // no placeholder resurrection
    assert.equal(listItems(dir).length, 1)
  })
})

// ── startItem (compiled-but-uncalled on dsh; module contract via fake client) ─

test("startItem happy path: creates, binds, THEN awakens — seeded with the spec", async () => {
  await withDir(async (dir) => {
    const { item: idea } = await mkIdea(dir, { title: "Build the thing", body: "## Spec\ndo it well", status: "todo" })

    // capture the on-disk owner at the moment the awaken command fires (ordering proof)
    let ownerWhenAwakenFired
    const sessions = fakeSessions({
      command: async () => {
        ownerWhenAwakenFired = readItem(dir, idea.id).owner_session
      },
    })

    const r = await startItem(dir, idea.id, sessions, { waitForAwaken: true })
    assert.ok(r.ok)
    assert.equal(r.action, "started")
    assert.equal(r.sessionID, "ses_fresh_1")
    assert.equal(r.item.owner_session, "ses_fresh_1")
    assert.equal(r.item.group_id, "ses_fresh_1") // stamped together (I-043)
    assert.equal(r.item.status, "in_progress")
    assert.equal(r.item.spec_hash, specHash("## Spec\ndo it well"))

    // ordering: owner was already on disk when /awaken fired (DESIGN §5.3c)
    assert.equal(ownerWhenAwakenFired, "ses_fresh_1")

    // call sequence + seeding
    assert.deepEqual(sessions.calls.map((c) => c.op), ["create", "command"])
    const [sid, cmd, seed] = sessions.calls[1].args
    assert.equal(sid, "ses_fresh_1")
    assert.equal(cmd, "awaken")
    assert.ok(seed.includes(idea.id))
    assert.ok(seed.includes("Build the thing"))
    assert.ok(seed.includes("do it well"))
  })
})

test("startItem composition: awaken auto-register no-ops on the started session (no duplicate item)", async () => {
  await withDir(async (dir) => {
    const { item: idea } = await mkIdea(dir, { title: "Idea" })
    const sessions = fakeSessions()
    await startItem(dir, idea.id, sessions, { waitForAwaken: true })

    const auto = await autoRegister(dir, "ses_fresh_1", "ses_fresh_1", "whatever")
    assert.equal(auto.action, "noop-owned")
    assert.equal(auto.item.id, idea.id)
    assert.equal(listItems(dir).length, 1)
  })
})

test("startItem refusals happen BEFORE session creation (no orphan sessions)", async () => {
  await withDir(async (dir) => {
    const sessions = fakeSessions()

    const nf = await startItem(dir, "WI-999", sessions)
    assert.ok(!nf.ok && nf.reason === "NOT_FOUND")

    const { item: owned } = await mkIdea(dir, { title: "Owned" })
    await bindSession(dir, owned.id, "ses_x", "ses_x")
    const ro = await startItem(dir, owned.id, sessions)
    assert.ok(!ro.ok && ro.reason === "ITEM_OWNED")

    const { item: doneItem } = await mkIdea(dir, { title: "Done thing" })
    await markDoneWithoutDream(dir, doneItem.id)
    const rd = await startItem(dir, doneItem.id, sessions)
    assert.ok(!rd.ok && rd.reason === "ALREADY_DONE")

    assert.equal(sessions.calls.length, 0) // never created a session
  })
})

test("startItem fire-and-forget default: awaken failure does not fail the start; onAwakenError fires", async () => {
  await withDir(async (dir) => {
    const { item: idea } = await mkIdea(dir, { title: "Idea" })
    const errors = []
    const sessions = fakeSessions({
      command: async () => {
        throw new Error("server hiccup")
      },
    })
    const r = await startItem(dir, idea.id, sessions, { onAwakenError: (e) => errors.push(e) })
    assert.ok(r.ok)
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(errors.length, 1)
    assert.equal(readItem(dir, idea.id).owner_session, "ses_fresh_1") // ownership survived
  })
})

// ── reattachInfo + promoteItem (§5.5 spec-edit signal, invariant 4) ───────────

test("reattach: never-owned idea → fresh", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    assert.deepEqual(reattachInfo(dir, item.id), { kind: "fresh", reason: "never-owned" })

    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions, { waitForAwaken: true })
    assert.ok(r.ok && r.action === "started")
    assert.deepEqual(sessions.calls.map((c) => c.op), ["create", "command"])
  })
})

test("reattach: demoted, spec UNCHANGED → re-attach the released session, NO awaken, no new session", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea", body: "stable spec" })
    await bindSession(dir, item.id, "ses_orig", "ses_orig")
    await demoteItem(dir, item.id, "todo")

    assert.deepEqual(reattachInfo(dir, item.id), { kind: "reattach", sessionID: "ses_orig", reAwaken: false, reason: "spec-unchanged" })

    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions)
    assert.ok(r.ok)
    assert.equal(r.action, "reattached")
    assert.equal(r.sessionID, "ses_orig")
    assert.equal(r.item.owner_session, "ses_orig")
    assert.equal(r.item.status, "in_progress")
    assert.equal(sessions.calls.length, 0) // no create, no /awaken — ever
    const last = r.item.transitions[r.item.transitions.length - 1]
    assert.equal(last.session, "ses_orig")
  })
})

test("reattach: demoted, spec CHANGED → fresh session (the edit IS the decision)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea", body: "original spec" })
    await bindSession(dir, item.id, "ses_orig", "ses_orig")
    await demoteItem(dir, item.id, "backlog")
    const p = itemPath(dir, item.id)
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("original spec", "rethought spec"))

    assert.deepEqual(reattachInfo(dir, item.id), { kind: "fresh", reason: "spec-changed" })

    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions, { waitForAwaken: true })
    assert.ok(r.ok)
    assert.equal(r.action, "started")
    assert.equal(r.item.owner_session, "ses_fresh_1")
    // old session stays tombstoned; history preserved
    assert.deepEqual(r.item.released_sessions, ["ses_orig"])
  })
})

test("reattach: done item → always re-attach the frozen owner (invariant 4), badge cleared", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_orig", "ses_orig")
    await markDoneWithoutDream(dir, item.id)

    assert.deepEqual(reattachInfo(dir, item.id), { kind: "reattach", sessionID: "ses_orig", reAwaken: false, reason: "done-reopen" })

    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions)
    assert.ok(r.ok)
    assert.equal(r.action, "reattached")
    assert.equal(r.sessionID, "ses_orig")
    assert.equal(r.item.status, "in_progress")
    assert.equal(r.item.done_without_dream, false) // reopen clears the escape-hatch badge
    assert.equal(sessions.calls.length, 0) // never a fresh session, never re-awaken
  })
})

test("reattach: done item never owned → distinct done-never-owned reason (Q16)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    await markDoneWithoutDream(dir, item.id)
    assert.deepEqual(reattachInfo(dir, item.id), { kind: "fresh", reason: "done-never-owned" })
  })
})

test("Q16 reopen-as-fresh: promote un-does the item and runs the normal start", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Obsolete-but-back", body: "the spec" })
    await markDoneWithoutDream(dir, item.id)
    assert.equal(readItem(dir, item.id).done_without_dream, true)

    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions, { waitForAwaken: true })
    assert.ok(r.ok)
    assert.equal(r.action, "started")
    assert.equal(r.sessionID, "ses_fresh_1")

    const final = readItem(dir, item.id)
    assert.equal(final.status, "in_progress")
    assert.equal(final.owner_session, "ses_fresh_1")
    assert.equal(final.done_without_dream, false) // badge gone
    assert.deepEqual(sessions.calls.map((c) => c.op), ["create", "command"]) // awaken-on-create ran

    // audit trail: … → done → todo (reopen) → in_progress (bind)
    const kinds = final.transitions.map((t) => `${t.from ?? "null"}>${t.to}`)
    assert.ok(kinds.includes("done>todo"))
    const reopenIdx = kinds.lastIndexOf("done>todo")
    assert.equal(kinds[reopenIdx + 1], "todo>in_progress")
    assert.equal(final.transitions[reopenIdx].by, "board:promote")
  })
})

test("Q16 shortcut lives in promote ONLY: direct startItem still refuses done items", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    await markDoneWithoutDream(dir, item.id)
    const sessions = fakeSessions()
    const r = await startItem(dir, item.id, sessions)
    assert.ok(!r.ok && r.reason === "ALREADY_DONE")
    assert.equal(sessions.calls.length, 0)
    assert.equal(readItem(dir, item.id).status, "done") // untouched
  })
})

test("Q16 does not disturb done+OWNED: still the reattach path, badge cleared, no client calls", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_orig", "ses_orig")
    await markDoneWithoutDream(dir, item.id)

    assert.deepEqual(reattachInfo(dir, item.id), { kind: "reattach", sessionID: "ses_orig", reAwaken: false, reason: "done-reopen" })
    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions)
    assert.ok(r.ok && r.action === "reattached" && r.sessionID === "ses_orig")
    assert.equal(sessions.calls.length, 0)
  })
})

test("reattach: refuses in_progress items", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    assert.equal(reattachInfo(dir, item.id).kind, "refuse")
    const r = await promoteItem(dir, item.id, fakeSessions())
    assert.ok(!r.ok && r.reason === "ALREADY_IN_PROGRESS")
  })
})

test("re-attached session composes with autoRegister (noop-owned despite tombstone)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea", body: "spec" })
    await bindSession(dir, item.id, "ses_orig", "ses_orig")
    await demoteItem(dir, item.id)
    await promoteItem(dir, item.id, fakeSessions()) // re-attach (unchanged spec)

    const auto = await autoRegister(dir, "ses_orig", "ses_orig", "t")
    assert.equal(auto.action, "noop-owned") // owned-check wins over the released tombstone
    assert.equal(auto.item.id, item.id)
  })
})

// ── composition: the demote→rebind lifecycle ─────────────────────────────────

test("a released session can bind a DIFFERENT item; awaken keeps skipping it", async () => {
  await withDir(async (dir) => {
    const { item: a } = await mkIdea(dir, { title: "A" })
    const { item: b } = await mkIdea(dir, { title: "B" })
    await bindSession(dir, a.id, "ses_x", "ses_x")
    await demoteItem(dir, a.id)

    // tombstone blocks re-adopting A and blocks autoRegister…
    const auto = await autoRegister(dir, "ses_x", "ses_x", "t")
    assert.equal(auto.action, "skipped-released")

    // …but binding a different item is a deliberate act and allowed
    const r = await bindSession(dir, b.id, "ses_x", "ses_x")
    assert.ok(r.ok && r.action === "bound")

    // and after owning B, autoRegister no-ops on B (owned wins over released)
    const auto2 = await autoRegister(dir, "ses_x", "ses_x", "t")
    assert.equal(auto2.action, "noop-owned")
    assert.equal(auto2.item.id, b.id)

    // file state sane
    assert.deepEqual(readItem(dir, a.id).released_sessions, ["ses_x"])
    assert.equal(readItem(dir, b.id).owner_session, "ses_x")
  })
})

// ── markItemDoneFromDream (event-driven Done on dream complete) ───────────────
// Injected cross-check fakes keep these hermetic (no DRM files needed),
// exactly as in the original suite.
const complete = (drm) => ({ drmIsComplete: (d) => d === drm })
const withArts = (drm, arts) => ({ drmIsComplete: (d) => d === drm, drmArtifacts: () => arts })
const preCompaction = (drm) => ({ drmIsComplete: (d) => d === drm, drmIsPreCompaction: (d) => d === drm })

test("dream-done happy path: in_progress owned → done, dream_id + artifacts stamped, audited transition", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Coordinator work", body: "spec" })
    await bindSession(dir, item.id, "ses_c", "ses_c")

    const withArts = { drmIsComplete: (d) => d === "DRM-046", drmArtifacts: () => ["I-179", "W-064", "SHADOW-004"] }
    const r = await markItemDoneFromDream(dir, "ses_c", "DRM-046", withArts)
    assert.ok(r.ok && r.action === "done")
    assert.equal(r.item.status, "done")
    assert.equal(r.item.dream_id, "DRM-046")
    assert.deepEqual(r.item.artifacts, ["I-179", "W-064", "SHADOW-004"])
    assert.equal(r.item.owner_session, "ses_c") // owner stays (frozen), enables re-attach
    assert.equal(r.item.done_without_dream, false)

    const last = r.item.transitions[r.item.transitions.length - 1]
    assert.equal(last.from, "in_progress")
    assert.equal(last.to, "done")
    assert.equal(last.by, dreamCompleteBy("DRM-046"))
    assert.equal(last.session, "ses_c")

    // persisted to disk (not just the returned copy)
    assert.equal(readItem(dir, item.id).dream_id, "DRM-046")
  })
})

test("dream-done clears a paused sub-state on the way to done", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Parked", body: "spec" })
    await bindSession(dir, item.id, "ses_p", "ses_p")
    await pauseItem(dir, item.id)
    assert.equal(readItem(dir, item.id).paused, true)

    const r = await markItemDoneFromDream(dir, "ses_p", "DRM-050", complete("DRM-050"))
    assert.ok(r.ok && r.action === "done")
    assert.equal(r.item.paused, false)
  })
})

test("dream-done: no owning item → clean no-op (the common case: session owns nothing)", async () => {
  await withDir(async (dir) => {
    await mkIdea(dir, { title: "Unrelated" })
    const r = await markItemDoneFromDream(dir, "ses_nobody", "DRM-001", complete("DRM-001"))
    assert.ok(r.ok && r.action === "noop-no-owner")
  })
})

test("dream-done: no board at all → clean no-op, does not throw", async () => {
  await withDir(async (dir) => {
    const r = await markItemDoneFromDream(dir, "ses_x", "DRM-001", complete("DRM-001"))
    assert.ok(r.ok && r.action === "noop-no-owner")
  })
})

test("dream-done idempotent: re-firing the SAME DRM no-ops (no double transition)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Once", body: "spec" })
    await bindSession(dir, item.id, "ses_1", "ses_1")

    const first = await markItemDoneFromDream(dir, "ses_1", "DRM-060", complete("DRM-060"))
    assert.ok(first.ok && first.action === "done")
    const countAfterFirst = readItem(dir, item.id).transitions.length

    const again = await markItemDoneFromDream(dir, "ses_1", "DRM-060", complete("DRM-060"))
    assert.ok(again.ok && again.action === "already-done")
    // no extra transition appended
    assert.equal(readItem(dir, item.id).transitions.length, countAfterFirst)
    assert.equal(readItem(dir, item.id).dream_id, "DRM-060")
  })
})

test("dream-done multi-dream: a LATER completed dream re-stamps the definer, preserves lineage", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Two dreams", body: "spec" })
    await bindSession(dir, item.id, "ses_m", "ses_m")

    await markItemDoneFromDream(dir, "ses_m", "DRM-070", withArts("DRM-070", ["I-100"]))
    const afterFirst = readItem(dir, item.id)
    const countAfterFirst = afterFirst.transitions.length
    assert.equal(afterFirst.dream_id, "DRM-070")

    // A second dream in the same session completes later.
    const r = await markItemDoneFromDream(dir, "ses_m", "DRM-071", withArts("DRM-071", ["I-101", "W-200"]))
    assert.ok(r.ok && r.action === "redefined")
    // latest COMPLETE is the definer; artifacts mirror the newest DRM
    assert.equal(r.item.dream_id, "DRM-071")
    assert.deepEqual(r.item.artifacts, ["I-101", "W-200"])

    // earlier done transition preserved as lineage; a new one appended
    const item2 = readItem(dir, item.id)
    assert.equal(item2.transitions.length, countAfterFirst + 1)
    const doneTs = item2.transitions.filter((t) => t.to === "done")
    assert.deepEqual(
      doneTs.map((t) => t.by),
      [dreamCompleteBy("DRM-070"), dreamCompleteBy("DRM-071")]
    )
    // the lineage entry (first) records the earlier DRM
    assert.equal(doneTs[doneTs.length - 1].from, "done")
  })
})

test("dream-done: un-owned item (idea, no owner) is untouched — only the OWNING session's item moves", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Idea only", status: "todo" })
    const r = await markItemDoneFromDream(dir, "ses_none", "DRM-080", complete("DRM-080"))
    assert.ok(r.ok && r.action === "noop-no-owner")
    // the idea is still todo, un-owned
    assert.equal(readItem(dir, item.id).status, "todo")
  })
})

test("dream-done: owned but not in_progress (parked back to todo) → refuses NOT_IN_PROGRESS", async () => {
  await withDir(async (dir) => {
    // Force a pathological state: owner set but status todo (never happens via
    // normal transitions, but the helper must refuse rather than clobber).
    const { item } = await mkIdea(dir, { title: "Weird", body: "spec" })
    await bindSession(dir, item.id, "ses_w", "ses_w")
    await mutateItem(dir, item.id, { set: { status: "todo" } })

    const r = await markItemDoneFromDream(dir, "ses_w", "DRM-090", complete("DRM-090"))
    assert.ok(!r.ok && r.reason === "NOT_IN_PROGRESS")
    assert.equal(readItem(dir, item.id).status, "todo") // untouched
  })
})

test("dream-done: refuses when the DRM is NOT COMPLETE (belt-and-braces), item untouched", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Incomplete dream", body: "spec" })
    await bindSession(dir, item.id, "ses_i", "ses_i")

    const r = await markItemDoneFromDream(dir, "ses_i", "DRM-999", { drmIsComplete: () => false })
    assert.ok(!r.ok && r.reason === "DRM_NOT_COMPLETE")
    // item stays in_progress, no dream stamped
    const after = readItem(dir, item.id)
    assert.equal(after.status, "in_progress")
    assert.equal(after.dream_id, null)
  })
})

test("dream-done escape-hatch item: a later real dream UPGRADES it (badge cleared, audited)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Manual then dreamt", body: "spec" })
    await bindSession(dir, item.id, "ses_d", "ses_d")
    await markDoneWithoutDream(dir, item.id)
    const badged = readItem(dir, item.id)
    assert.equal(badged.done_without_dream, true)
    assert.equal(badged.dream_id, null)
    const countBefore = badged.transitions.length

    // The session's dream later completes — upgrade the unbacked Done.
    const withArts = { drmIsComplete: (d) => d === "DRM-110", drmArtifacts: () => ["I-300"] }
    const r = await markItemDoneFromDream(dir, "ses_d", "DRM-110", withArts)
    assert.ok(r.ok && r.action === "redefined")
    assert.equal(r.item.done_without_dream, false) // badge cleared
    assert.equal(r.item.dream_id, "DRM-110")
    assert.deepEqual(r.item.artifacts, ["I-300"])

    // the upgrade is an audited transition, not a silent flag flip
    const after = readItem(dir, item.id)
    assert.equal(after.transitions.length, countBefore + 1)
    const last = after.transitions[after.transitions.length - 1]
    assert.equal(last.from, "done")
    assert.equal(last.to, "done")
    assert.equal(last.by, dreamCompleteBy("DRM-110"))
  })
})

function writeDrmHistory(dir, drm, lines) {
  const histDir = path.join(dir, ".opencode/dreams/history")
  fs.mkdirSync(histDir, { recursive: true })
  fs.writeFileSync(path.join(histDir, `${drm}.yaml`), lines.join("\n"), "utf8")
}

test("dream-done default cross-check reads REAL DRM history files (integration, no fakes)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Real DRM", body: "spec" })
    await bindSession(dir, item.id, "ses_real", "ses_real")

    writeDrmHistory(dir, "DRM-200", [
      "dream_id: DRM-200",
      "depth: 2",
      'intention: "test"',
      "intention_type: CONSOLIDATION",
      "entry_time: 2026-07-21T00:00:00Z",
      "exit_time: 2026-07-21T00:10:00Z",
      "status: COMPLETE",
      'project_context: "test"',
      "",
      "context_signals:",
      "  contradictions: 0",
      "  repetitions_detected: false",
      "  coherence: HIGH",
      "  threads_active: 1",
      "",
      "insights: [I-500, I-501]",
      "warnings: [W-500]",
      "songlines: []",
      "shadows: [SHADOW-050]",
      "",
    ])

    const r = await markItemDoneFromDream(dir, "ses_real", "DRM-200")
    assert.ok(r.ok && r.action === "done")
    assert.equal(r.item.dream_id, "DRM-200")
    // artifacts mirror all four buckets read from the REAL DRM file
    assert.deepEqual(r.item.artifacts, ["I-500", "I-501", "W-500", "SHADOW-050"])
  })
})

test("dream-done default cross-check refuses when the DRM history file is absent", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Missing DRM", body: "spec" })
    await bindSession(dir, item.id, "ses_miss", "ses_miss")

    const r = await markItemDoneFromDream(dir, "ses_miss", "DRM-404")
    assert.ok(!r.ok && r.reason === "DRM_NOT_COMPLETE")
    assert.equal(readItem(dir, item.id).status, "in_progress")
  })
})

// ── WI-080: pre-compaction dreams do not close work ──────────────────────────

test("pre-compaction dream: owned item stays in_progress, no transition, no stamps", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Mid-session dream", body: "spec" })
    await bindSession(dir, item.id, "ses_pc", "ses_pc")
    const countBefore = readItem(dir, item.id).transitions.length

    const r = await markItemDoneFromDream(dir, "ses_pc", "DRM-300", preCompaction("DRM-300"))
    assert.ok(r.ok && r.action === "skipped-pre-compaction")

    const after = readItem(dir, item.id)
    assert.equal(after.status, "in_progress")
    assert.equal(after.dream_id, null)
    assert.deepEqual(after.artifacts, [])
    assert.equal(after.transitions.length, countBefore) // NO transition entry appended (W-126)
  })
})

test("a LATER unflagged dream still closes the item (two dreams, one item)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Dream twice", body: "spec" })
    await bindSession(dir, item.id, "ses_2d", "ses_2d")

    // First: pre-compaction dream mid-work — no close.
    const mid = await markItemDoneFromDream(dir, "ses_2d", "DRM-310", preCompaction("DRM-310"))
    assert.ok(mid.ok && mid.action === "skipped-pre-compaction")

    // Then: the end-of-work dream closes normally.
    const fin = await markItemDoneFromDream(dir, "ses_2d", "DRM-311", withArts("DRM-311", ["I-900"]))
    assert.ok(fin.ok && fin.action === "done")
    const after = readItem(dir, item.id)
    assert.equal(after.status, "done")
    assert.equal(after.dream_id, "DRM-311")
    assert.deepEqual(after.artifacts, ["I-900"])
    // exactly one done transition, from the unflagged dream only
    const doneTs = after.transitions.filter((t) => t.to === "done")
    assert.equal(doneTs.length, 1)
    assert.equal(doneTs[0].by, dreamCompleteBy("DRM-311"))
  })
})

test("pre-compaction no-op precedes the done-redefinition path (an already-done item is untouched)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Done then mid-dream", body: "spec" })
    await bindSession(dir, item.id, "ses_rd", "ses_rd")
    await markItemDoneFromDream(dir, "ses_rd", "DRM-320", complete("DRM-320"))
    const countBefore = readItem(dir, item.id).transitions.length

    // A pre-compaction dream completing later must NOT re-stamp the definer.
    const r = await markItemDoneFromDream(dir, "ses_rd", "DRM-321", preCompaction("DRM-321"))
    assert.ok(r.ok && r.action === "skipped-pre-compaction")
    const after = readItem(dir, item.id)
    assert.equal(after.dream_id, "DRM-320")
    assert.equal(after.transitions.length, countBefore)
  })
})

test("default pre-compaction check reads the REAL DRM history file (integration)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Real flagged DRM", body: "spec" })
    await bindSession(dir, item.id, "ses_real_pc", "ses_real_pc")

    writeDrmHistory(dir, "DRM-330", [
      "dream_id: DRM-330",
      "depth: 1",
      'intention: "mid-session"',
      "intention_type: CONSOLIDATION",
      "entry_time: 2026-08-11T00:00:00Z",
      "exit_time: 2026-08-11T00:10:00Z",
      "status: COMPLETE",
      'project_context: "test"',
      "pre_compaction: true",
      "insights: []",
      "warnings: []",
      "songlines: []",
      "shadows: []",
    ])

    // No injected fakes — the real readers must find the marker.
    const r = await markItemDoneFromDream(dir, "ses_real_pc", "DRM-330")
    assert.ok(r.ok && r.action === "skipped-pre-compaction")
    assert.equal(readItem(dir, item.id).status, "in_progress")
  })
})

test("default pre-compaction check treats a missing marker as end-of-work (legacy DRM closes)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "Legacy unflagged DRM", body: "spec" })
    await bindSession(dir, item.id, "ses_legacy", "ses_legacy")

    writeDrmHistory(dir, "DRM-340", [
      "dream_id: DRM-340",
      "depth: 2",
      'intention: "final"',
      "intention_type: CONSOLIDATION",
      "entry_time: 2026-08-11T00:00:00Z",
      "exit_time: 2026-08-11T00:10:00Z",
      "status: COMPLETE",
      'project_context: "test"',
      "",
      "context_signals:",
      "  contradictions: 0",
      "  repetitions_detected: false",
      "  coherence: HIGH",
      "  threads_active: 1",
      "",
      "insights: []",
      "warnings: []",
      "songlines: []",
      "shadows: []",
      "",
    ])

    const r = await markItemDoneFromDream(dir, "ses_legacy", "DRM-340")
    assert.ok(r.ok && r.action === "done")
    assert.equal(readItem(dir, item.id).dream_id, "DRM-340")
  })
})

// ── B2 additions: the one-parser discipline is observable ─────────────────────

test("drm-read helpers share the dream archive parser (readDreamState from @hive/dsh-dream-archive)", async () => {
  await withDir(async (dir) => {
    // makeDrmCompleteCheck/portfolio are re-exported from drm-read via the
    // transitions module — the fake injected fakes only REPLACE them, so this
    // probe verifies the real helpers read real history files.
    writeDrmHistory(dir, "DRM-500", [
      "dream_id: DRM-500",
      "status: COMPLETE",
      "insights: [I-700]",
      "warnings: []",
      "songlines: [SNG-700]",
      "shadows: []",
    ])
    const check = makeDrmCompleteCheck(dir)
    assert.equal(check("DRM-500"), true) // COMPLETE
    assert.equal(check("DRM-501"), false) // absent file → false, cached fail-closed
    const arts = makeDrmArtifacts(dir)
    assert.deepEqual(arts("DRM-500"), ["I-700", "SNG-700"])
    assert.deepEqual(arts("DRM-501"), [])
  })
})
