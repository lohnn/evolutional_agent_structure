// Port of the OpenCode plugin's test/board-authoring.test.ts (bun:test →
// node:test), semantics preserved 1:1. WI-064 authoring: create / respec /
// retitle / tags — every refusal below is proven by a LIVE CALL with the
// forbidden value, asserting the observed result and the observed file,
// never a type or description (I-246).
import test from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

import {
  readItem,
  itemPath,
  specHash,
  listRevisions,
  readRevision,
  revisionDir,
  applyEditToContent,
  parseWorkItem,
  listItems,
} from "@hive/dsh-board/lib/board-store"
import {
  createIdea,
  respecItem,
  retitleItem,
  editItemTags,
  bindSession,
  demoteItem,
  reattachInfo,
} from "@hive/dsh-board/lib/board-transitions"

const tmpDirs = []
function withDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-authoring-"))
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

async function mkIdea(d, init) {
  const r = await createIdea(d, init)
  if (!r.ok) throw new Error(`fixture createIdea refused: ${r.reason} — ${r.detail}`)
  return r
}

// ── create ───────────────────────────────────────────────────────────────────

test("create: allocates an id and sets birth defaults without the caller knowing the schema", async () => {
  await withDir(async (dir) => {
    const r = await mkIdea(dir, { title: "First", body: "spec text" })
    const it = r.item
    assert.match(it.id, /^WI-\d{3}$/)
    assert.equal(it.status, "backlog")
    assert.equal(it.owner_session, null)
    assert.equal(it.group_id, null)
    assert.equal(it.origin, "idea-first")
    assert.equal(it.spec_hash, null)
    assert.equal(it.priority, "medium")
    assert.equal(it.transitions.length, 1)
    assert.equal(it.transitions[0].from, null)
    assert.equal(it.transitions[0].to, "backlog")
  })
})

test("create: creation-time subtasks land; todo_mirror stays empty (Class A vs B stay separate)", async () => {
  await withDir(async (dir) => {
    const r = await mkIdea(dir, {
      title: "Planned",
      subtasks: [
        { content: "Phase 1", status: "pending" },
        { content: "Phase 2", status: "pending" },
      ],
    })
    assert.deepEqual(
      r.item.subtasks.map((s) => s.content),
      ["Phase 1", "Phase 2"]
    )
    assert.deepEqual(r.item.todo_mirror, [])
    // survives a re-read from disk (serialization round-trip)
    assert.equal(readItem(dir, r.item.id).subtasks.length, 2)
  })
})

// ── THE WI-065 REGRESSION CLASS (refusals proven by live calls) ───────────────

test("create with status:'in_progress' is REFUSED and writes NOTHING (the WI-065 case)", async () => {
  await withDir(async (dir) => {
    const before = listItems(dir).length
    // Deliberately defeat type narrowing — exactly what the model can emit at
    // runtime and what TypeScript wrongly promises cannot happen.
    const r = await createIdea(dir, { title: "should not exist", status: "in_progress" })
    assert.ok(!r.ok && r.reason === "INVALID_STATUS")
    assert.equal(listItems(dir).length, before) // nothing on disk
  })
})

test("create with status:'done' is REFUSED", async () => {
  await withDir(async (dir) => {
    const r = await createIdea(dir, { title: "x", status: "done" })
    assert.ok(!r.ok && r.reason === "INVALID_STATUS")
    assert.equal(listItems(dir).length, 0)
  })
})

test("no created item can ever be in_progress without an owner (the invariant itself)", async () => {
  await withDir(async (dir) => {
    for (const s of ["in_progress", "done", "archived", "", "BACKLOG"]) {
      await createIdea(dir, { title: `probe ${s}`, status: s })
    }
    const illegal = listItems(dir).filter((i) => i.status === "in_progress" && i.owner_session === null)
    assert.deepEqual(illegal, [])
    assert.equal(listItems(dir).length, 0)
  })
})

test("create with a bogus priority is REFUSED", async () => {
  await withDir(async (dir) => {
    const r = await createIdea(dir, { title: "x", priority: "urgent" })
    assert.ok(!r.ok && r.reason === "INVALID_PRIORITY")
    assert.equal(listItems(dir).length, 0)
  })
})

test("create with malformed tags is REFUSED before any write", async () => {
  await withDir(async (dir) => {
    const r = await createIdea(dir, { title: "x", tags: ["ok", "not ok"] })
    assert.ok(!r.ok && r.reason === "INVALID_TAG")
    assert.equal(listItems(dir).length, 0)
  })
})

test("create with an empty/whitespace title is REFUSED", async () => {
  await withDir(async (dir) => {
    const r = await createIdea(dir, { title: "   " })
    assert.ok(!r.ok && r.reason === "EMPTY_TITLE")
    assert.equal(listItems(dir).length, 0)
  })
})

test("valid statuses still pass — the guard rejects, it does not just block everything", async () => {
  await withDir(async (dir) => {
    const a = await createIdea(dir, { title: "a", status: "backlog" })
    const b = await createIdea(dir, { title: "b", status: "todo" })
    assert.ok(a.ok && a.item.status === "backlog")
    assert.ok(b.ok && b.item.status === "todo")
  })
})

// ── ARRAY ARGS: malformed containers REFUSE, they do not throw ────────────────
// Reported live 2026-08-05: array args threw raw TypeErrors when the value
// arrived as a string ("...filter is not a function"); the caller saw an
// unfriendly internal error. Container + element checks now refuse with
// reason codes and the exact correction.

const MALFORMED = [
  ["bare string", "hive-board"],
  ["JSON-encoded string", '["a","b"]'],
  ["number", 42],
  ["object", { 0: "a" }],
]

for (const [label, value] of MALFORMED) {
  test(`create tags: ${label} is refused NOT_AN_ARRAY and writes nothing`, async () => {
    await withDir(async (dir) => {
      const r = await createIdea(dir, { title: "x", tags: value })
      assert.ok(!r.ok && r.reason === "NOT_AN_ARRAY")
      assert.ok(!r.ok && r.detail.includes("tags must be an ARRAY"))
      assert.equal(listItems(dir).length, 0)
    })
  })
}

test("create tags: the refusal names the arg and the required shape, not an internal expression", async () => {
  await withDir(async (dir) => {
    const r = await createIdea(dir, { title: "x", tags: "hive-board" })
    assert.ok(!r.ok)
    assert.ok(r.detail.includes('["hive-board"]')) // the exact correction to make
    assert.ok(r.detail.includes('tags: ["one", "two"]'))
    // The old failure mode leaked module internals to a tool caller.
    assert.ok(!r.detail.includes("is not a function"))
    assert.ok(!r.detail.includes("init.tags"))
  })
})

test("create tags: a JSON-encoded array is refused rather than parsed — and says so", async () => {
  await withDir(async (dir) => {
    const r = await createIdea(dir, { title: "x", tags: '["a","b"]' })
    assert.ok(!r.ok)
    assert.ok(r.detail.includes("JSON-ENCODED"))
    // It must NOT offer the wrap-it correction here: wrapping would produce
    // one absurd tag whose text is the JSON source.
    assert.ok(!r.detail.includes("If you meant a single entry"))
  })
})

test("create tags: a non-string ELEMENT is refused too, and is located by index", async () => {
  await withDir(async (dir) => {
    const r = await createIdea(dir, { title: "x", tags: ["ok", 7] })
    assert.ok(!r.ok && r.reason === "BAD_ARRAY_ELEMENT")
    assert.ok(!r.ok && r.detail.includes("tags[1]"))
    assert.equal(listItems(dir).length, 0)
  })
})

test("create tags: well-formed tags still pass — the guard rejects, it does not block everything", async () => {
  await withDir(async (dir) => {
    const r = await mkIdea(dir, { title: "x", tags: ["hive-board", "tooling"] })
    assert.deepEqual(r.item.tags, ["hive-board", "tooling"])
  })
})

test("create subtasks: a string container is refused at the module", async () => {
  await withDir(async (dir) => {
    const r = await createIdea(dir, { title: "x", subtasks: "step one" })
    assert.ok(!r.ok && r.reason === "NOT_AN_ARRAY")
    assert.equal(listItems(dir).length, 0)
  })
})

test("create subtasks: an array of BARE STRINGS is refused — a container check alone would have let this through", async () => {
  await withDir(async (dir) => {
    const r = await createIdea(dir, { title: "x", subtasks: ["step one"] })
    assert.ok(!r.ok && r.reason === "BAD_ARRAY_ELEMENT")
    assert.ok(!r.ok && r.detail.includes("subtasks[0]"))
    // and it tells a module caller the converted shape to send
    assert.ok(!r.ok && r.detail.includes('content: "step one"'))
    assert.equal(listItems(dir).length, 0)
  })
})

test("create subtasks: well-formed subtask records still pass", async () => {
  await withDir(async (dir) => {
    const r = await mkIdea(dir, { title: "x", subtasks: [{ content: "step one", status: "pending" }] })
    assert.equal(r.item.subtasks.length, 1)
  })
})

for (const field of ["add", "remove"]) {
  test(`editItemTags: ${field} as a bare string is refused NOT_AN_ARRAY`, async () => {
    await withDir(async (dir) => {
      const { item } = await mkIdea(dir, { title: "target", tags: ["keep"] })
      const r = await editItemTags(dir, item.id, { [field]: "hive-board" })
      assert.ok(!r.ok && r.reason === "NOT_AN_ARRAY")
      assert.ok(!r.ok && r.detail.includes(`${field} must be an ARRAY`))
      // the item is untouched
      assert.deepEqual(readItem(dir, item.id).tags, ["keep"])
    })
  })
}

test("editItemTags: a malformed arg outranks a MISSING item — the caller learns both problems in one call", async () => {
  await withDir(async (dir) => {
    // Before the fix this returned NOT_FOUND (readItem short-circuited inside
    // the lock) and the TypeError came later; the shape check now precedes
    // the lock.
    const r = await editItemTags(dir, "WI-999", { add: "x" })
    assert.ok(!r.ok && r.reason === "NOT_AN_ARRAY")
  })
})

test("editItemTags: well-formed deltas still pass", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "target", tags: ["keep"] })
    const r = await editItemTags(dir, item.id, { add: ["added"], remove: ["keep"] })
    assert.ok(r.ok && r.item.tags.join() === "added")
  })
})

// ── respec — retention is structural ─────────────────────────────────────────

test("respec: prior body is archived content-addressed and is byte-recoverable", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "ORIGINAL SPEC" })
    const originalHash = specHash("ORIGINAL SPEC")

    const r = await respecItem(dir, item.id, "REVISED SPEC")
    assert.ok(r.ok && r.action === "respecced")

    assert.deepEqual(listRevisions(dir, item.id), [originalHash])
    assert.equal(readRevision(dir, item.id, originalHash), "ORIGINAL SPEC")
    assert.equal(readItem(dir, item.id).body, "REVISED SPEC")
  })
})

test("respec DESTRUCTIVE-EDIT REGRESSION: two revisions, BOTH prior bodies recoverable", async () => {
  await withDir(async (dir) => {
    // The WI-055 loss is the worked example this test exists for.
    const { item } = await mkIdea(dir, { title: "T", body: "v1 body" })
    await respecItem(dir, item.id, "v2 body")
    await respecItem(dir, item.id, "v3 body")

    const h1 = specHash("v1 body")
    const h2 = specHash("v2 body")
    assert.deepEqual(listRevisions(dir, item.id).sort(), [h1, h2].sort())
    assert.equal(readRevision(dir, item.id, h1), "v1 body")
    assert.equal(readRevision(dir, item.id, h2), "v2 body")
    assert.equal(readItem(dir, item.id).body, "v3 body")
  })
})

test("respec tombstone: the transition log is readable without opening the payload (W-103)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "old" })
    await respecItem(dir, item.id, "new", { by: "hive_board_respec:tester", session: null })
    const t = readItem(dir, item.id).transitions
    const rev = t[t.length - 1]
    assert.equal(rev.superseded, specHash("old"))
    assert.equal(rev.by, "hive_board_respec:tester")
    assert.match(rev.at, /^\d{4}-\d{2}-\d{2}T/)
    // a revision is not a column move
    assert.equal(rev.from, "backlog")
    assert.equal(rev.to, "backlog")
  })
})

test("respec: revision hashes survive a full serialize/parse round-trip", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "old" })
    await respecItem(dir, item.id, "new")
    const raw = fs.readFileSync(itemPath(dir, item.id), "utf8")
    assert.ok(raw.includes("superseded:"))
    assert.equal(parseWorkItem(raw).transitions.at(-1).superseded, specHash("old"))
  })
})

test("NO DANGLING POINTER: respec on a body-less item stamps no `superseded`", async () => {
  await withDir(async (dir) => {
    // Found by disposing of WI-065 (created with no body). Stamping the
    // empty-string hash would leave a pointer resolving to null — an entry
    // claiming text was superseded when none ever existed.
    const { item } = await mkIdea(dir, { title: "no body yet" })
    const r = await respecItem(dir, item.id, "the first spec")
    assert.ok(r.ok)

    const rev = readItem(dir, item.id).transitions.at(-1)
    assert.equal(rev.superseded, undefined)
    assert.deepEqual(listRevisions(dir, item.id), [])
  })
})

test("EVERY `superseded` pointer in a log resolves to a real payload", async () => {
  await withDir(async (dir) => {
    // The invariant the dangling-pointer bug violated, asserted directly.
    const { item } = await mkIdea(dir, { title: "T" }) // starts body-less
    await respecItem(dir, item.id, "first")
    await respecItem(dir, item.id, "second")
    await respecItem(dir, item.id, "third")

    const pointers = readItem(dir, item.id)
      .transitions.map((t) => t.superseded)
      .filter((h) => h !== undefined)
    assert.equal(pointers.length, 2) // first→second, second→third; not the body-less one
    for (const h of pointers) {
      assert.notEqual(readRevision(dir, item.id, h), null)
    }
  })
})

test("respec: identical body is an idempotent no-op — no revision, no transition (I-212)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "same" })
    const before = readItem(dir, item.id).transitions.length
    const r = await respecItem(dir, item.id, "same")
    assert.ok(r.ok && r.action === "respec-noop")
    assert.deepEqual(listRevisions(dir, item.id), [])
    assert.equal(readItem(dir, item.id).transitions.length, before)
  })
})

test("respec: empty body is REFUSED — that discards a spec, not revises it", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "real spec" })
    const r = await respecItem(dir, item.id, "   \n  ")
    assert.ok(!r.ok && r.reason === "EMPTY_BODY")
    assert.equal(readItem(dir, item.id).body, "real spec")
  })
})

// ── respec — ownership gate (SCHEMA §2), proven by live calls ─────────────────

test("ownership: un-owned item — an identity-free caller MAY revise", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "a" })
    const r = await respecItem(dir, item.id, "b", { session: null })
    assert.ok(r.ok)
  })
})

test("ownership: owned item + WRONG session — REFUSED, and the body on disk is unchanged", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "owned spec" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")

    const r = await respecItem(dir, item.id, "hostile rewrite", { session: "ses_intruder" })

    assert.ok(!r.ok && r.reason === "ITEM_OWNED")
    assert.equal(readItem(dir, item.id).body, "owned spec")
    assert.deepEqual(listRevisions(dir, item.id), []) // nothing archived on a refusal
  })
})

test("ownership: owned item + the OWNING session — allowed", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "owned spec" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")
    const r = await respecItem(dir, item.id, "owner's revision", { session: "ses_owner" })
    assert.ok(r.ok)
    assert.equal(readItem(dir, item.id).body, "owner's revision")
  })
})

test("ownership: an identity-free caller may NOT revise an owned item", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "owned spec" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")
    const r = await respecItem(dir, item.id, "attacker spec", { session: null })
    assert.ok(!r.ok && r.reason === "ITEM_OWNED")
  })
})

test("respec never touches transition-module-owned state (Q13: spec_hash NOT re-stamped)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, {
      title: "T",
      body: "before",
      subtasks: [{ content: "authored step", status: "pending" }],
    })
    await bindSession(dir, item.id, "ses_owner", "grp_1")
    const pre = readItem(dir, item.id)

    await respecItem(dir, item.id, "after", { session: "ses_owner" })
    const post = readItem(dir, item.id)

    assert.equal(post.owner_session, pre.owner_session)
    assert.equal(post.group_id, pre.group_id)
    assert.equal(post.status, pre.status)
    assert.equal(post.spec_hash, pre.spec_hash) // NOT re-stamped — Q13
    assert.deepEqual(post.todo_mirror, pre.todo_mirror)
    assert.deepEqual(post.subtasks, pre.subtasks)
    assert.deepEqual(post.released_sessions, pre.released_sessions)
    assert.equal(post.transitions.length, pre.transitions.length + 1)
  })
})

test("Q13 INTEGRITY: respec on a demoted item still yields a FRESH session decision", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "original" })
    await bindSession(dir, item.id, "ses_a", "ses_a")
    await demoteItem(dir, item.id, "todo")
    // demote re-stamps spec_hash → unchanged spec would re-attach
    assert.equal(reattachInfo(dir, item.id).kind, "reattach")
    assert.equal(reattachInfo(dir, item.id).reason, "spec-unchanged")

    await respecItem(dir, item.id, "materially different spec")

    // the edit IS the decision: a revised spec must NOT re-attach
    assert.equal(reattachInfo(dir, item.id).kind, "fresh")
    assert.equal(reattachInfo(dir, item.id).reason, "spec-changed")
  })
})

// ── body surgery preserves everything else byte-for-byte (I-049) ──────────────

test("body surgery: unknown frontmatter fields, comments and hand edits survive a body replace", () => {
  const raw = [
    "---",
    "id: WI-900",
    'title: "Probe"',
    "status: backlog",
    "# a hand-written comment",
    "some_unknown_future_field: keep-me",
    "tags: [alpha]",
    "transitions:",
    "  - { at: 2026-08-03T10:00:00Z, from: null, to: backlog, by: board:create }",
    "---",
    "",
    "OLD BODY",
    "",
  ].join("\n")

  const out = applyEditToContent(raw, { setBody: { body: "NEW BODY" } })

  assert.ok(out.includes("some_unknown_future_field: keep-me"))
  assert.ok(out.includes("# a hand-written comment"))
  assert.equal(out.split("\n---\n")[0], raw.split("\n---\n")[0]) // frontmatter identical
  assert.equal(parseWorkItem(out).body, "NEW BODY")
})

test("body surgery: a body containing '---' and '  - ' list lines round-trips", () => {
  const body = ["Intro para.", "", "---", "", "Steps:", "  - alpha", "  - beta", "", "Done."].join("\n")
  const raw = ["---", "id: WI-901", 'title: "P"', "status: backlog", "transitions: []", "---", "", "x", ""].join("\n")
  const out = applyEditToContent(raw, { setBody: { body } })
  const parsed = parseWorkItem(out)
  assert.equal(parsed.body, body)
  assert.equal(parsed.id, "WI-901") // frontmatter still parses despite --- in the body
  assert.equal(parsed.status, "backlog")
})

// ── retitle refusals, proven by live calls ───────────────────────────────────

test("retitle: an item owned by ANOTHER session is REFUSED; title on disk unchanged", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "original title" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")
    const r = await retitleItem(dir, item.id, "hostile retitle", { session: "ses_intruder" })
    assert.ok(!r.ok && r.reason === "ITEM_OWNED")
    assert.equal(readItem(dir, item.id).title, "original title")
  })
})

test("retitle: the owning session MAY retitle", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "original title" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")
    const r = await retitleItem(dir, item.id, "owner retitle", { session: "ses_owner" })
    assert.ok(r.ok)
    assert.equal(readItem(dir, item.id).title, "owner retitle")
  })
})

test("retitle: empty title is REFUSED", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "keep me" })
    const r = await retitleItem(dir, item.id, "   ")
    assert.ok(!r.ok && r.reason === "EMPTY_TITLE")
    assert.equal(readItem(dir, item.id).title, "keep me")
  })
})

test("retitle: a MISSING item is refused, not silently created", async () => {
  await withDir(async (dir) => {
    const r = await retitleItem(dir, "WI-404", "ghost")
    assert.ok(!r.ok && r.reason === "NOT_FOUND")
    assert.equal(listItems(dir).length, 0)
  })
})

// ── tags — set deltas, not whole-replace ──────────────────────────────────────

test("tags: add and remove merge into the existing set", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", tags: ["alpha", "beta"] })
    await editItemTags(dir, item.id, { add: ["gamma"], remove: ["alpha"] })
    assert.deepEqual(readItem(dir, item.id).tags, ["beta", "gamma"])
  })
})

test("tags: idempotent — re-adding a present tag does not duplicate or bump the file", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", tags: ["alpha"] })
    const r = await editItemTags(dir, item.id, { add: ["alpha"] })
    assert.ok(r.ok && r.action === "tags-noop")
    assert.deepEqual(readItem(dir, item.id).tags, ["alpha"])
  })
})

test("tags: a tag in BOTH add and remove is refused, not guessed", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", tags: ["alpha"] })
    const r = await editItemTags(dir, item.id, { add: ["x"], remove: ["x"] })
    assert.ok(!r.ok && r.reason === "CONTRADICTORY_TAGS")
    assert.deepEqual(readItem(dir, item.id).tags, ["alpha"])
  })
})

test("tags: malformed tags are refused before any write", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", tags: ["alpha"] })
    const r = await editItemTags(dir, item.id, { add: ["has space", "ok"] })
    assert.ok(!r.ok && r.reason === "INVALID_TAG")
    assert.deepEqual(readItem(dir, item.id).tags, ["alpha"])
  })
})

test("tags edits append NO transition (metadata, like priority)", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T" })
    const before = readItem(dir, item.id).transitions.length
    await editItemTags(dir, item.id, { add: ["x"] })
    assert.equal(readItem(dir, item.id).transitions.length, before)
  })
})

// ── CONCURRENCY (the lock is the guarantee, W-024) ────────────────────────────

test("parallel creates allocate DISTINCT ids", async () => {
  await withDir(async (dir) => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => mkIdea(dir, { title: `Parallel ${i}` })))
    const ids = results.map((r) => r.item.id)
    assert.equal(new Set(ids).size, 8)
    assert.equal(listItems(dir).length, 8)
  })
})

test("TAGS: two concurrent editors — neither change is lost", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", tags: ["base"] })
    await Promise.all([
      editItemTags(dir, item.id, { add: ["from-editor-a"] }),
      editItemTags(dir, item.id, { add: ["from-editor-b"] }),
    ])
    const tags = readItem(dir, item.id).tags
    assert.ok(tags.includes("base"))
    assert.ok(tags.includes("from-editor-a"))
    assert.ok(tags.includes("from-editor-b"))
  })
})

test("RESPEC: concurrent revisions lose no body — every superseded text is archived", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "start" })
    await Promise.all([respecItem(dir, item.id, "revision-one"), respecItem(dir, item.id, "revision-two")])
    const final = readItem(dir, item.id).body
    const archived = listRevisions(dir, item.id).map((h) => readRevision(dir, item.id, h))
    // whichever won, the other two texts are both recoverable
    const all = [...archived, final]
    assert.ok(all.includes("start"))
    assert.ok(all.includes("revision-one"))
    assert.ok(all.includes("revision-two"))
  })
})

// ── revision archive hygiene ──────────────────────────────────────────────────

test("revision dirs are invisible to item enumeration", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "a" })
    await respecItem(dir, item.id, "b")
    assert.equal(fs.existsSync(revisionDir(dir, item.id)), true)
    assert.deepEqual(listItems(dir).map((i) => i.id), [item.id]) // the dir is not parsed as an item
  })
})

test("readRevision verifies the content still hashes to its filename", async () => {
  await withDir(async (dir) => {
    const { item } = await mkIdea(dir, { title: "T", body: "authentic" })
    await respecItem(dir, item.id, "next")
    const h = specHash("authentic")
    assert.equal(readRevision(dir, item.id, h), "authentic")
    // tamper with the archived file — the pointer must stop trusting it
    fs.writeFileSync(path.join(revisionDir(dir, item.id), `${h}.md`), "tampered\n", "utf8")
    assert.equal(readRevision(dir, item.id, h), null)
  })
})
