import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { readItem, specHash, itemPath, mutateItem, listItems } from "../src/lib/board-store.ts"
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
  type BoardSessionClient,
} from "../src/lib/board-transitions.ts"

/** Recording fake for the session seam. */
function fakeSessions(overrides: Partial<BoardSessionClient> = {}) {
  const calls: { op: string; args: unknown[]; ownerAtCall?: string | null }[] = []
  let counter = 0
  const client: BoardSessionClient & { calls: typeof calls } = {
    calls,
    async createSession(title: string) {
      calls.push({ op: "create", args: [title] })
      return overrides.createSession ? overrides.createSession(title) : `ses_fresh_${++counter}`
    },
    async command(sessionID: string, command: string, argsText: string) {
      calls.push({ op: "command", args: [sessionID, command, argsText] })
      if (overrides.command) return overrides.command(sessionID, command, argsText)
    },
  }
  return client
}

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-transitions-test-"))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe("createIdea", () => {
  test("creates a backlog item with a birth transition (from: null)", async () => {
    const r = await createIdea(dir, { title: "An idea", body: "## Spec\n\ndetails", tags: ["x"] })
    expect(r.ok).toBe(true)
    expect(r.item.id).toBe("WI-001")
    expect(r.item.status).toBe("backlog")
    expect(r.item.origin).toBe("idea-first")
    expect(r.item.owner_session).toBeNull()
    expect(r.item.spec_hash).toBeNull() // stamped at bind, not at idea creation
    expect(r.item.transitions.length).toBe(1)
    expect(r.item.transitions[0]!.from).toBeNull()
    expect(r.item.transitions[0]!.to).toBe("backlog")
  })

  test("status todo supported", async () => {
    const r = await createIdea(dir, { title: "Ready", status: "todo" })
    expect(r.item.status).toBe("todo")
  })
})

describe("bindSession", () => {
  test("binds: owner+group stamped together, in_progress, spec_hash from body, transition appended", async () => {
    const { item } = await createIdea(dir, { title: "Idea", body: "spec body", status: "todo" })
    const r = await bindSession(dir, item.id, "ses_owner", "ses_group")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.action).toBe("bound")
    expect(r.item.owner_session).toBe("ses_owner")
    expect(r.item.group_id).toBe("ses_group")
    expect(r.item.status).toBe("in_progress")
    expect(r.item.origin).toBe("idea-first") // origin stays as-born
    expect(r.item.spec_hash).toBe(specHash("spec body"))
    const last = r.item.transitions[r.item.transitions.length - 1]!
    expect(last.from).toBe("todo")
    expect(last.to).toBe("in_progress")
    expect(last.session).toBe("ses_owner")
  })

  test("idempotent when already bound to the same session", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")
    const r = await bindSession(dir, item.id, "ses_owner", "ses_owner")
    expect(r.ok && r.action === "already-bound").toBe(true)
  })

  test("refuses NOT_FOUND / ITEM_OWNED / SESSION_OWNS_OTHER / SESSION_RELEASED", async () => {
    const nf = await bindSession(dir, "WI-999", "ses_a", null)
    expect(!nf.ok && nf.reason === "NOT_FOUND").toBe(true)

    const { item: a } = await createIdea(dir, { title: "A" })
    const { item: b } = await createIdea(dir, { title: "B" })
    await bindSession(dir, a.id, "ses_a", "ses_a")

    const owned = await bindSession(dir, a.id, "ses_b", "ses_b")
    expect(!owned.ok && owned.reason === "ITEM_OWNED").toBe(true)

    const other = await bindSession(dir, b.id, "ses_a", "ses_a")
    expect(!other.ok && other.reason === "SESSION_OWNS_OTHER").toBe(true)

    // release ses_a from A via true-demote, then try to re-bind the tombstoned session
    await demoteItem(dir, a.id, "todo")
    const released = await bindSession(dir, a.id, "ses_a", "ses_a")
    expect(!released.ok && released.reason === "SESSION_RELEASED").toBe(true)
  })
})

describe("autoRegister (awaken create-or-bind)", () => {
  test("creates a session-first in_progress item", async () => {
    const r = await autoRegister(dir, "ses_new", "ses_new", "My chat title")
    expect(r.action).toBe("registered")
    expect(r.item.origin).toBe("session-first")
    expect(r.item.status).toBe("in_progress")
    expect(r.item.owner_session).toBe("ses_new")
    expect(r.item.group_id).toBe("ses_new")
    expect(r.item.title).toBe("My chat title")
    expect(r.item.spec_hash).toBe(specHash("")) // creation IS the bind
    expect(r.item.transitions[0]!.from).toBeNull()
    expect(r.item.transitions[0]!.to).toBe("in_progress")
    expect(r.item.transitions[0]!.by).toBe("hive_awaken")
  })

  test("no-ops when the session already owns an item (Phase 3 start idempotency)", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    const r = await autoRegister(dir, "ses_x", "ses_x", "whatever")
    expect(r.action).toBe("noop-owned")
    expect(r.item.id).toBe(item.id)
  })

  test("skips tombstoned sessions entirely (§5.5)", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    await demoteItem(dir, item.id, "backlog")
    const r = await autoRegister(dir, "ses_x", "ses_x", "whatever")
    expect(r.action).toBe("skipped-released")
    expect(r.item.id).toBe(item.id)
  })
})

describe("pause / unpause", () => {
  test("pause sets the flag, appends an in_progress→in_progress transition with the owner session", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    const r = await pauseItem(dir, item.id)
    expect(r.ok && r.action === "paused").toBe(true)
    if (!r.ok) return
    expect(r.item.paused).toBe(true)
    expect(r.item.status).toBe("in_progress") // paused is a sub-state, not a column
    const last = r.item.transitions[r.item.transitions.length - 1]!
    expect(last.from).toBe("in_progress")
    expect(last.to).toBe("in_progress")
    expect(last.session).toBe("ses_x")

    const again = await pauseItem(dir, item.id)
    expect(again.ok && again.action === "already-paused").toBe(true)

    const up = await unpauseItem(dir, item.id)
    expect(up.ok && up.action === "unpaused").toBe(true)
    if (up.ok) expect(up.item.paused).toBe(false)
  })

  test("refuses on non-in_progress items", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    const r = await pauseItem(dir, item.id)
    expect(!r.ok && r.reason === "NOT_IN_PROGRESS").toBe(true)
  })
})

describe("demoteItem (true demote)", () => {
  test("tombstones the session, clears ownership, re-stamps spec_hash, moves back", async () => {
    const { item } = await createIdea(dir, { title: "Idea", body: "original spec" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    const r = await demoteItem(dir, item.id, "todo")
    expect(r.ok && r.action === "demoted").toBe(true)
    if (!r.ok) return
    expect(r.item.status).toBe("todo")
    expect(r.item.owner_session).toBeNull()
    expect(r.item.group_id).toBeNull()
    expect(r.item.paused).toBe(false)
    expect(r.item.released_sessions).toEqual(["ses_x"])
    expect(r.item.spec_hash).toBe(specHash("original spec")) // demote-time baseline (Q13)
    const last = r.item.transitions[r.item.transitions.length - 1]!
    expect(last.session).toBe("ses_x") // history, not forgotten
  })

  test("second demote of a re-bound item appends a second tombstone", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_1", "ses_1")
    await demoteItem(dir, item.id)
    await bindSession(dir, item.id, "ses_2", "ses_2")
    const r = await demoteItem(dir, item.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.item.released_sessions).toEqual(["ses_1", "ses_2"])
  })

  test("refuses on non-in_progress items", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    const r = await demoteItem(dir, item.id)
    expect(!r.ok && r.reason === "NOT_IN_PROGRESS").toBe(true)
  })
})

describe("markDoneWithoutDream", () => {
  test("badges and freezes", async () => {
    const { item } = await createIdea(dir, { title: "Small chore" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    const r = await markDoneWithoutDream(dir, item.id)
    expect(r.ok && r.action === "done").toBe(true)
    if (!r.ok) return
    expect(r.item.status).toBe("done")
    expect(r.item.done_without_dream).toBe(true)
    expect(r.item.owner_session).toBe("ses_x") // owner stays (frozen), enables re-attach

    const again = await markDoneWithoutDream(dir, item.id)
    expect(!again.ok && again.reason === "ALREADY_DONE").toBe(true)
  })
})

describe("bind-time absorption (Q15 / SCHEMA §3 invariant 6)", () => {
  test("happy path: pristine placeholder dissolved, lineage recorded, 1:1 holds", async () => {
    const { item: idea } = await createIdea(dir, { title: "Real idea", body: "the spec" })
    const auto = await autoRegister(dir, "ses_x", "ses_x", "Chat title")
    const placeholder = auto.item

    const r = await bindSession(dir, idea.id, "ses_x", "ses_x")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.action).toBe("bound-absorbed")
    expect(r.absorbed).toBe(placeholder.id)

    // placeholder file is gone (the one sanctioned deletion)
    expect(readItem(dir, placeholder.id)).toBeNull()
    expect(fs.existsSync(itemPath(dir, placeholder.id))).toBe(false)

    // survivor is bound, with lineage on the bind transition
    expect(r.item.owner_session).toBe("ses_x")
    expect(r.item.status).toBe("in_progress")
    const last = r.item.transitions[r.item.transitions.length - 1]!
    expect(last.absorbed).toBe(placeholder.id)
    expect(last.session).toBe("ses_x")

    // exactly one item owned by the session — 1:1 exact at all times
    const owned = listItems(dir).filter((i) => i.owner_session === "ses_x")
    expect(owned.length).toBe(1)
    expect(owned[0]!.id).toBe(idea.id)
  })

  test("non-pristine: body edited since creation → strict refusal", async () => {
    const { item: idea } = await createIdea(dir, { title: "Idea" })
    const auto = await autoRegister(dir, "ses_x", "ses_x", "t")
    const p = itemPath(dir, auto.item.id)
    fs.writeFileSync(p, fs.readFileSync(p, "utf8") + "\naccrued session notes\n")

    const r = await bindSession(dir, idea.id, "ses_x", "ses_x")
    expect(!r.ok && r.reason === "SESSION_OWNS_OTHER").toBe(true)
    expect(readItem(dir, auto.item.id)).not.toBeNull() // never destroyed
  })

  test("non-pristine: dream_id set → strict refusal", async () => {
    const { item: idea } = await createIdea(dir, { title: "Idea" })
    const auto = await autoRegister(dir, "ses_x", "ses_x", "t")
    await mutateItem(dir, auto.item.id, { set: { dream_id: "DRM-009" } })

    const r = await bindSession(dir, idea.id, "ses_x", "ses_x")
    expect(!r.ok && r.reason === "SESSION_OWNS_OTHER").toBe(true)
    expect(readItem(dir, auto.item.id)).not.toBeNull()
  })

  test("non-pristine: subtask mirror present → strict refusal", async () => {
    const { item: idea } = await createIdea(dir, { title: "Idea" })
    const auto = await autoRegister(dir, "ses_x", "ses_x", "t")
    const p = itemPath(dir, auto.item.id)
    fs.writeFileSync(
      p,
      fs.readFileSync(p, "utf8").replace("subtasks: []", 'subtasks:\n  - { content: "planned step", status: pending }')
    )

    const r = await bindSession(dir, idea.id, "ses_x", "ses_x")
    expect(!r.ok && r.reason === "SESSION_OWNS_OTHER").toBe(true)
    expect(readItem(dir, auto.item.id)).not.toBeNull()
  })

  // ── The gate under the 2026-08-03 `subtasks` reclassification ──────────────
  // `subtasks` is now ratified as an AUTHOR-WRITTEN plan on an unowned item,
  // not a TodoWrite mirror (SCHEMA §4/§4b). isPristinePlaceholder's
  // `subtasks.length === 0` check therefore had to be re-verified on its
  // hardest input before the reclassification could be ratified (W-113), since
  // a reclassified field can silently change what an old gate means.
  //
  // It survives — and lands on a BETTER rationale than the one it was written
  // with. The check reads the item being DISSOLVED, never the survivor, so
  // "no subtask mirror recorded" simply becomes "no authored content
  // accrued" — which is exactly the stated purpose of the gate ("anything
  // else refuses so accrued content is never destroyed"). These two tests pin
  // that, so a future edit cannot quietly point the check at the wrong item.
  test("reclassification: idea-first SURVIVOR keeps author-written subtasks through absorption", async () => {
    const { item: idea } = await createIdea(dir, { title: "Authored plan" })
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

    expect(r.ok && r.action).toBe("bound-absorbed")
    const survivor = readItem(dir, idea.id)!
    expect(survivor.subtasks.map((s) => s.content)).toEqual([
      "Phase 1 — do the thing",
      "Phase 2 — do the other",
    ])
    expect(survivor.owner_session).toBe("ses_x")
    expect(readItem(dir, auto.item.id)).toBeNull()
  })

  test("reclassification: the gate reads the ABSORBED item's subtasks, never the survivor's", async () => {
    const { item: idea } = await createIdea(dir, { title: "Authored plan" })
    const ip = itemPath(dir, idea.id)
    fs.writeFileSync(
      ip,
      fs.readFileSync(ip, "utf8").replace("subtasks: []", 'subtasks:\n  - { content: "authored", status: pending }')
    )
    const auto = await autoRegister(dir, "ses_x", "ses_x", "placeholder")
    const ap = itemPath(dir, auto.item.id)
    fs.writeFileSync(
      ap,
      fs
        .readFileSync(ap, "utf8")
        .replace("subtasks: []", 'subtasks:\n  - { content: "accrued on placeholder", status: pending }')
    )

    const r = await bindSession(dir, idea.id, "ses_x", "ses_x")

    expect(!r.ok && r.reason).toBe("SESSION_OWNS_OTHER")
    expect(readItem(dir, auto.item.id)).not.toBeNull()
    expect(readItem(dir, idea.id)!.subtasks).toHaveLength(1)
  })

  test("idea-first owned item is never absorbed (origin guard)", async () => {
    const { item: a } = await createIdea(dir, { title: "A" })
    const { item: b } = await createIdea(dir, { title: "B" })
    await bindSession(dir, a.id, "ses_x", "ses_x") // owns an idea-first item, pristine-looking otherwise
    const r = await bindSession(dir, b.id, "ses_x", "ses_x")
    expect(!r.ok && r.reason === "SESSION_OWNS_OTHER").toBe(true)
    expect(readItem(dir, a.id)).not.toBeNull()
  })

  test("absorption under the lock: concurrent binds resolve to exactly one owner, one deletion", async () => {
    const { item: i1 } = await createIdea(dir, { title: "I1" })
    const { item: i2 } = await createIdea(dir, { title: "I2" })
    const auto = await autoRegister(dir, "ses_x", "ses_x", "t")

    const [r1, r2] = await Promise.all([
      bindSession(dir, i1.id, "ses_x", "ses_x"),
      bindSession(dir, i2.id, "ses_x", "ses_x"),
    ])
    const oks = [r1, r2].filter((r) => r.ok)
    const fails = [r1, r2].filter((r) => !r.ok)
    expect(oks.length).toBe(1)
    expect(oks[0]!.ok && oks[0]!.action === "bound-absorbed").toBe(true)
    expect(!fails[0]!.ok && (fails[0]! as { reason: string }).reason === "SESSION_OWNS_OTHER").toBe(true)
    expect(readItem(dir, auto.item.id)).toBeNull()
    expect(listItems(dir).filter((i) => i.owner_session === "ses_x").length).toBe(1)
  })

  test("idempotency interplay: later awaken auto-register no-ops on the bound session", async () => {
    const { item: idea } = await createIdea(dir, { title: "Idea" })
    await autoRegister(dir, "ses_x", "ses_x", "t")
    await bindSession(dir, idea.id, "ses_x", "ses_x")

    const again = await autoRegister(dir, "ses_x", "ses_x", "t")
    expect(again.action).toBe("noop-owned")
    expect(again.item.id).toBe(idea.id) // no placeholder resurrection
    expect(listItems(dir).length).toBe(1)
  })
})

describe("startItem (Phase 3: fresh session + bind + awaken-on-create)", () => {
  test("happy path: creates, binds, THEN awakens — seeded with the spec", async () => {
    const { item: idea } = await createIdea(dir, { title: "Build the thing", body: "## Spec\ndo it well", status: "todo" })

    // capture the on-disk owner at the moment the awaken command fires (ordering proof)
    let ownerWhenAwakenFired: string | null | undefined
    const sessions = fakeSessions({
      command: async () => {
        ownerWhenAwakenFired = readItem(dir, idea.id)!.owner_session
      },
    })

    const r = await startItem(dir, idea.id, sessions, { waitForAwaken: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.action).toBe("started")
    expect(r.sessionID).toBe("ses_fresh_1")
    expect(r.item.owner_session).toBe("ses_fresh_1")
    expect(r.item.group_id).toBe("ses_fresh_1") // stamped together (I-043)
    expect(r.item.status).toBe("in_progress")
    expect(r.item.spec_hash).toBe(specHash("## Spec\ndo it well"))

    // ordering: owner was already on disk when /awaken fired (DESIGN §5.3c)
    expect(ownerWhenAwakenFired).toBe("ses_fresh_1")

    // call sequence + seeding
    expect(sessions.calls.map((c) => c.op)).toEqual(["create", "command"])
    const [sid, cmd, seed] = sessions.calls[1]!.args as [string, string, string]
    expect(sid).toBe("ses_fresh_1")
    expect(cmd).toBe("awaken")
    expect(seed).toContain(idea.id)
    expect(seed).toContain("Build the thing")
    expect(seed).toContain("do it well")
  })

  test("composition: hive_awaken auto-register no-ops on the started session (no duplicate item)", async () => {
    const { item: idea } = await createIdea(dir, { title: "Idea" })
    const sessions = fakeSessions()
    const r = await startItem(dir, idea.id, sessions, { waitForAwaken: true })
    expect(r.ok).toBe(true)

    const auto = await autoRegister(dir, "ses_fresh_1", "ses_fresh_1", "whatever")
    expect(auto.action).toBe("noop-owned")
    expect(auto.item.id).toBe(idea.id)
    expect(listItems(dir).length).toBe(1)
  })

  test("refusals happen BEFORE session creation (no orphan sessions)", async () => {
    const sessions = fakeSessions()

    const nf = await startItem(dir, "WI-999", sessions)
    expect(!nf.ok && nf.reason === "NOT_FOUND").toBe(true)

    const { item: owned } = await createIdea(dir, { title: "Owned" })
    await bindSession(dir, owned.id, "ses_x", "ses_x")
    const ro = await startItem(dir, owned.id, sessions)
    expect(!ro.ok && ro.reason === "ITEM_OWNED").toBe(true)

    const { item: doneItem } = await createIdea(dir, { title: "Done thing" })
    await markDoneWithoutDream(dir, doneItem.id)
    const rd = await startItem(dir, doneItem.id, sessions)
    expect(!rd.ok && rd.reason === "ALREADY_DONE").toBe(true)

    expect(sessions.calls.length).toBe(0) // never created a session
  })

  test("fire-and-forget default: awaken failure does not fail the start; onAwakenError fires", async () => {
    const { item: idea } = await createIdea(dir, { title: "Idea" })
    const errors: unknown[] = []
    const sessions = fakeSessions({
      command: async () => {
        throw new Error("server hiccup")
      },
    })
    const r = await startItem(dir, idea.id, sessions, { onAwakenError: (e) => errors.push(e) })
    expect(r.ok).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(errors.length).toBe(1)
    expect(readItem(dir, idea.id)!.owner_session).toBe("ses_fresh_1") // ownership survived
  })
})

describe("reattachInfo + promoteItem (§5.5 spec-edit signal, invariant 4)", () => {
  test("never-owned idea → fresh", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    const d = reattachInfo(dir, item.id)
    expect(d).toEqual({ kind: "fresh", reason: "never-owned" })

    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions, { waitForAwaken: true })
    expect(r.ok && r.action === "started").toBe(true)
    expect(sessions.calls.map((c) => c.op)).toEqual(["create", "command"])
  })

  test("demoted, spec UNCHANGED → re-attach the released session, NO awaken, no new session", async () => {
    const { item } = await createIdea(dir, { title: "Idea", body: "stable spec" })
    await bindSession(dir, item.id, "ses_orig", "ses_orig")
    await demoteItem(dir, item.id, "todo")

    const d = reattachInfo(dir, item.id)
    expect(d).toEqual({ kind: "reattach", sessionID: "ses_orig", reAwaken: false, reason: "spec-unchanged" })

    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.action).toBe("reattached")
    expect(r.sessionID).toBe("ses_orig")
    expect(r.item.owner_session).toBe("ses_orig")
    expect(r.item.status).toBe("in_progress")
    expect(sessions.calls.length).toBe(0) // no create, no /awaken — ever
    const last = r.item.transitions[r.item.transitions.length - 1]!
    expect(last.session).toBe("ses_orig")
  })

  test("demoted, spec CHANGED → fresh session (the edit IS the decision)", async () => {
    const { item } = await createIdea(dir, { title: "Idea", body: "original spec" })
    await bindSession(dir, item.id, "ses_orig", "ses_orig")
    await demoteItem(dir, item.id, "backlog")
    const p = itemPath(dir, item.id)
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("original spec", "rethought spec"))

    const d = reattachInfo(dir, item.id)
    expect(d).toEqual({ kind: "fresh", reason: "spec-changed" })

    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions, { waitForAwaken: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.action).toBe("started")
    expect(r.item.owner_session).toBe("ses_fresh_1")
    // old session stays tombstoned; history preserved
    expect(r.item.released_sessions).toEqual(["ses_orig"])
  })

  test("done item → always re-attach the frozen owner (invariant 4), badge cleared", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_orig", "ses_orig")
    await markDoneWithoutDream(dir, item.id)

    const d = reattachInfo(dir, item.id)
    expect(d).toEqual({ kind: "reattach", sessionID: "ses_orig", reAwaken: false, reason: "done-reopen" })

    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.action).toBe("reattached")
    expect(r.sessionID).toBe("ses_orig")
    expect(r.item.status).toBe("in_progress")
    expect(r.item.done_without_dream).toBe(false) // reopen clears the escape-hatch badge
    expect(sessions.calls.length).toBe(0) // never a fresh session, never re-awaken
  })

  test("done item never owned → distinct done-never-owned reason (Q16)", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    await markDoneWithoutDream(dir, item.id)
    const d = reattachInfo(dir, item.id)
    expect(d).toEqual({ kind: "fresh", reason: "done-never-owned" })
  })

  test("Q16 reopen-as-fresh: promote un-does the item and runs the normal start", async () => {
    const { item } = await createIdea(dir, { title: "Obsolete-but-back", body: "the spec" })
    await markDoneWithoutDream(dir, item.id)
    expect(readItem(dir, item.id)!.done_without_dream).toBe(true)

    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions, { waitForAwaken: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.action).toBe("started")
    expect(r.sessionID).toBe("ses_fresh_1")

    const final = readItem(dir, item.id)!
    expect(final.status).toBe("in_progress")
    expect(final.owner_session).toBe("ses_fresh_1")
    expect(final.done_without_dream).toBe(false) // badge gone
    expect(sessions.calls.map((c) => c.op)).toEqual(["create", "command"]) // awaken-on-create ran

    // audit trail: … → done → todo (reopen) → in_progress (bind)
    const kinds = final.transitions.map((t) => `${t.from ?? "null"}>${t.to}`)
    expect(kinds).toContain("done>todo")
    const reopenIdx = kinds.lastIndexOf("done>todo")
    expect(kinds[reopenIdx + 1]).toBe("todo>in_progress")
    expect(final.transitions[reopenIdx]!.by).toBe("board:promote")
  })

  test("Q16 shortcut lives in promote ONLY: direct startItem still refuses done items", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    await markDoneWithoutDream(dir, item.id)
    const sessions = fakeSessions()
    const r = await startItem(dir, item.id, sessions)
    expect(!r.ok && r.reason === "ALREADY_DONE").toBe(true)
    expect(sessions.calls.length).toBe(0)
    expect(readItem(dir, item.id)!.status).toBe("done") // untouched
  })

  test("Q16 does not disturb done+OWNED: still the reattach path, badge cleared, no client calls", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_orig", "ses_orig")
    await markDoneWithoutDream(dir, item.id)

    expect(reattachInfo(dir, item.id)).toEqual({ kind: "reattach", sessionID: "ses_orig", reAwaken: false, reason: "done-reopen" })
    const sessions = fakeSessions()
    const r = await promoteItem(dir, item.id, sessions)
    expect(r.ok && r.action === "reattached" && r.sessionID === "ses_orig").toBe(true)
    expect(sessions.calls.length).toBe(0)
  })

  test("refuses in_progress items", async () => {
    const { item } = await createIdea(dir, { title: "Idea" })
    await bindSession(dir, item.id, "ses_x", "ses_x")
    const d = reattachInfo(dir, item.id)
    expect(d.kind).toBe("refuse")
    const r = await promoteItem(dir, item.id, fakeSessions())
    expect(!r.ok && r.reason === "ALREADY_IN_PROGRESS").toBe(true)
  })

  test("re-attached session composes with autoRegister (noop-owned despite tombstone)", async () => {
    const { item } = await createIdea(dir, { title: "Idea", body: "spec" })
    await bindSession(dir, item.id, "ses_orig", "ses_orig")
    await demoteItem(dir, item.id)
    await promoteItem(dir, item.id, fakeSessions()) // re-attach (unchanged spec)

    const auto = await autoRegister(dir, "ses_orig", "ses_orig", "t")
    expect(auto.action).toBe("noop-owned") // owned-check wins over the released tombstone
    expect(auto.item.id).toBe(item.id)
  })
})

describe("composition: the demote→rebind lifecycle", () => {
  test("a released session can bind a DIFFERENT item; awaken keeps skipping it", async () => {
    const { item: a } = await createIdea(dir, { title: "A" })
    const { item: b } = await createIdea(dir, { title: "B" })
    await bindSession(dir, a.id, "ses_x", "ses_x")
    await demoteItem(dir, a.id)

    // tombstone blocks re-adopting A and blocks autoRegister…
    const auto = await autoRegister(dir, "ses_x", "ses_x", "t")
    expect(auto.action).toBe("skipped-released")

    // …but binding a different item is a deliberate act and allowed
    const r = await bindSession(dir, b.id, "ses_x", "ses_x")
    expect(r.ok && r.action === "bound").toBe(true)

    // and after owning B, autoRegister no-ops on B (owned wins over released)
    const auto2 = await autoRegister(dir, "ses_x", "ses_x", "t")
    expect(auto2.action).toBe("noop-owned")
    expect(auto2.item.id).toBe(b.id)

    // file state sane
    expect(readItem(dir, a.id)!.released_sessions).toEqual(["ses_x"])
    expect(readItem(dir, b.id)!.owner_session).toBe("ses_x")
  })
})

describe("markItemDoneFromDream (event-driven Done on dream complete)", () => {
  // Injected cross-check fakes keep these hermetic (no DRM files needed).
  const complete = (drm: string) => ({ drmIsComplete: (d: string) => d === drm })
  const withArts = (drm: string, arts: string[]) => ({
    drmIsComplete: (d: string) => d === drm,
    drmArtifacts: () => arts,
  })

  test("happy path: in_progress owned → done, dream_id + artifacts stamped, audited transition", async () => {
    const { item } = await createIdea(dir, { title: "Coordinator work", body: "spec" })
    await bindSession(dir, item.id, "ses_c", "ses_c")

    const r = await markItemDoneFromDream(dir, "ses_c", "DRM-046", withArts("DRM-046", ["I-179", "W-064", "SHADOW-004"]))
    expect(r.ok && r.action === "done").toBe(true)
    if (!r.ok) return
    expect(r.item.status).toBe("done")
    expect(r.item.dream_id).toBe("DRM-046")
    expect(r.item.artifacts).toEqual(["I-179", "W-064", "SHADOW-004"])
    expect(r.item.owner_session).toBe("ses_c") // owner stays (frozen), enables re-attach
    expect(r.item.done_without_dream).toBe(false)

    const last = r.item.transitions[r.item.transitions.length - 1]!
    expect(last.from).toBe("in_progress")
    expect(last.to).toBe("done")
    expect(last.by).toBe(dreamCompleteBy("DRM-046"))
    expect(last.session).toBe("ses_c")

    // persisted to disk (not just the returned copy)
    expect(readItem(dir, item.id)!.dream_id).toBe("DRM-046")
  })

  test("clears a paused sub-state on the way to done", async () => {
    const { item } = await createIdea(dir, { title: "Parked", body: "spec" })
    await bindSession(dir, item.id, "ses_p", "ses_p")
    await pauseItem(dir, item.id)
    expect(readItem(dir, item.id)!.paused).toBe(true)

    const r = await markItemDoneFromDream(dir, "ses_p", "DRM-050", complete("DRM-050"))
    expect(r.ok && r.action === "done").toBe(true)
    if (!r.ok) return
    expect(r.item.paused).toBe(false)
  })

  test("no owning item → clean no-op (the common case: session owns nothing)", async () => {
    // A board exists but this session owns nothing.
    await createIdea(dir, { title: "Unrelated" })
    const r = await markItemDoneFromDream(dir, "ses_nobody", "DRM-001", complete("DRM-001"))
    expect(r.ok && r.action === "noop-no-owner").toBe(true)
  })

  test("no board at all → clean no-op, does not throw", async () => {
    const r = await markItemDoneFromDream(dir, "ses_x", "DRM-001", complete("DRM-001"))
    expect(r.ok && r.action === "noop-no-owner").toBe(true)
  })

  test("idempotent: re-firing the SAME DRM no-ops (no double transition)", async () => {
    const { item } = await createIdea(dir, { title: "Once", body: "spec" })
    await bindSession(dir, item.id, "ses_1", "ses_1")

    const first = await markItemDoneFromDream(dir, "ses_1", "DRM-060", complete("DRM-060"))
    expect(first.ok && first.action === "done").toBe(true)
    const countAfterFirst = readItem(dir, item.id)!.transitions.length

    const again = await markItemDoneFromDream(dir, "ses_1", "DRM-060", complete("DRM-060"))
    expect(again.ok && again.action === "already-done").toBe(true)
    // no extra transition appended
    expect(readItem(dir, item.id)!.transitions.length).toBe(countAfterFirst)
    expect(readItem(dir, item.id)!.dream_id).toBe("DRM-060")
  })

  test("multi-dream session: a LATER completed dream re-stamps the definer, preserves lineage", async () => {
    const { item } = await createIdea(dir, { title: "Two dreams", body: "spec" })
    await bindSession(dir, item.id, "ses_m", "ses_m")

    await markItemDoneFromDream(dir, "ses_m", "DRM-070", withArts("DRM-070", ["I-100"]))
    const afterFirst = readItem(dir, item.id)!
    const countAfterFirst = afterFirst.transitions.length
    expect(afterFirst.dream_id).toBe("DRM-070")

    // A second dream in the same session completes later.
    const r = await markItemDoneFromDream(dir, "ses_m", "DRM-071", withArts("DRM-071", ["I-101", "W-200"]))
    expect(r.ok && r.action === "redefined").toBe(true)
    if (!r.ok) return
    // latest COMPLETE is the definer; artifacts mirror the newest DRM
    expect(r.item.dream_id).toBe("DRM-071")
    expect(r.item.artifacts).toEqual(["I-101", "W-200"])

    // earlier done transition preserved as lineage; a new one appended
    const item2 = readItem(dir, item.id)!
    expect(item2.transitions.length).toBe(countAfterFirst + 1)
    const doneTs = item2.transitions.filter((t) => t.to === "done")
    expect(doneTs.map((t) => t.by)).toEqual([dreamCompleteBy("DRM-070"), dreamCompleteBy("DRM-071")])
    // the lineage entry (first) records the earlier DRM
    expect(doneTs[doneTs.length - 1]!.from).toBe("done")
  })

  test("un-owned item (idea, no owner) is untouched — only the OWNING session's item moves", async () => {
    const { item } = await createIdea(dir, { title: "Idea only", status: "todo" })
    const r = await markItemDoneFromDream(dir, "ses_none", "DRM-080", complete("DRM-080"))
    expect(r.ok && r.action === "noop-no-owner").toBe(true)
    // the idea is still todo, un-owned
    expect(readItem(dir, item.id)!.status).toBe("todo")
  })

  test("owned but not in_progress (parked back to todo) → refuses NOT_IN_PROGRESS", async () => {
    // Force a pathological state: owner set but status todo (never happens via
    // normal transitions, but the helper must refuse rather than clobber).
    const { item } = await createIdea(dir, { title: "Weird", body: "spec" })
    await bindSession(dir, item.id, "ses_w", "ses_w")
    await mutateItem(dir, item.id, { set: { status: "todo" } })

    const r = await markItemDoneFromDream(dir, "ses_w", "DRM-090", complete("DRM-090"))
    expect(!r.ok && r.reason === "NOT_IN_PROGRESS").toBe(true)
    expect(readItem(dir, item.id)!.status).toBe("todo") // untouched
  })

  test("refuses when the DRM is NOT COMPLETE (belt-and-braces), item untouched", async () => {
    const { item } = await createIdea(dir, { title: "Incomplete dream", body: "spec" })
    await bindSession(dir, item.id, "ses_i", "ses_i")

    const r = await markItemDoneFromDream(dir, "ses_i", "DRM-999", { drmIsComplete: () => false })
    expect(!r.ok && r.reason === "DRM_NOT_COMPLETE").toBe(true)
    // item stays in_progress, no dream stamped
    const after = readItem(dir, item.id)!
    expect(after.status).toBe("in_progress")
    expect(after.dream_id).toBeNull()
  })

  test("done_without_dream escape-hatch item: a later real dream UPGRADES it (badge cleared, audited)", async () => {
    const { item } = await createIdea(dir, { title: "Manual then dreamt", body: "spec" })
    await bindSession(dir, item.id, "ses_d", "ses_d")
    await markDoneWithoutDream(dir, item.id)
    const badged = readItem(dir, item.id)!
    expect(badged.done_without_dream).toBe(true)
    expect(badged.dream_id).toBeNull()
    const countBefore = badged.transitions.length

    // The session's dream later completes — upgrade the unbacked Done.
    const r = await markItemDoneFromDream(dir, "ses_d", "DRM-110", withArts("DRM-110", ["I-300"]))
    expect(r.ok && r.action === "redefined").toBe(true)
    if (!r.ok) return
    expect(r.item.done_without_dream).toBe(false) // badge cleared
    expect(r.item.dream_id).toBe("DRM-110")
    expect(r.item.artifacts).toEqual(["I-300"])

    // the upgrade is an audited transition, not a silent flag flip
    const after = readItem(dir, item.id)!
    expect(after.transitions.length).toBe(countBefore + 1)
    const last = after.transitions[after.transitions.length - 1]!
    expect(last.from).toBe("done")
    expect(last.to).toBe("done")
    expect(last.by).toBe(dreamCompleteBy("DRM-110"))
  })

  test("default cross-check reads real DRM history files (integration, no injected fakes)", async () => {
    const { item } = await createIdea(dir, { title: "Real DRM", body: "spec" })
    await bindSession(dir, item.id, "ses_real", "ses_real")

    // Write a genuine COMPLETE DRM history file the default helpers will read.
    const histDir = path.join(dir, ".opencode/dreams/history")
    fs.mkdirSync(histDir, { recursive: true })
    fs.writeFileSync(
      path.join(histDir, "DRM-200.yaml"),
      [
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
      ].join("\n"),
      "utf8"
    )

    const r = await markItemDoneFromDream(dir, "ses_real", "DRM-200")
    expect(r.ok && r.action === "done").toBe(true)
    if (!r.ok) return
    expect(r.item.dream_id).toBe("DRM-200")
    // artifacts mirror all four buckets read from the real DRM file
    expect(r.item.artifacts).toEqual(["I-500", "I-501", "W-500", "SHADOW-050"])
  })

  test("default cross-check refuses when the DRM history file is absent", async () => {
    const { item } = await createIdea(dir, { title: "Missing DRM", body: "spec" })
    await bindSession(dir, item.id, "ses_miss", "ses_miss")

    const r = await markItemDoneFromDream(dir, "ses_miss", "DRM-404")
    expect(!r.ok && r.reason === "DRM_NOT_COMPLETE").toBe(true)
    expect(readItem(dir, item.id)!.status).toBe("in_progress")
  })
})
