// Port of the OpenCode plugin's test/board-store.test.ts (bun:test →
// node:test). Semantics preserved 1:1 — the serialization dialect and the
// lock/surgery behavior are the byte-compatibility contract with the live
// .opencode/board store, so every assertion of the original suite matters.
// Only the runner and import targets changed (dist via the ./lib exports
// map; subtests carry their own tmpdir).
import test from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

import {
  parseWorkItem,
  serializeWorkItem,
  applyEditToContent,
  createItem,
  mutateItem,
  readItem,
  listItems,
  listItemsInDir,
  nextItemId,
  findItemByOwner,
  findItemReleasing,
  specHash,
  boardDir,
  nowIso,
  isPlaceholderTitle,
  refreshOwnerTitle,
  PLACEHOLDER_TITLE_RE,
} from "@hive/dsh-board/lib/board-store"

const tmpDirs = []
function withDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-store-test-"))
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

function fullItem() {
  return {
    id: "WI-007",
    title: 'Add push-notification "opt-out" to settings',
    status: "in_progress",
    owner_session: "ses_10a2114b3ffe",
    group_id: "ses_0e3066e56ffe",
    origin: "session-first",
    paused: false,
    spec_hash: "a3f9c1d20b44",
    released_sessions: ["ses_dead01", "ses_dead02"],
    dream_id: "DRM-041",
    artifacts: ["I-142", "W-061"],
    created: "2026-07-06",
    updated: "2026-07-07",
    priority: "medium",
    tags: ["frontend", "push"],
    done_without_dream: false,
    subtasks: [
      { content: "Read current settings widget", status: "completed" },
      { content: 'Add opt-out toggle, with "comma, inside"', status: "in_progress" },
    ],
    todo_mirror: [
      { content: "Investigate push API", status: "completed" },
      { content: 'Wire opt-out, with "comma, inside"', status: "in_progress" },
    ],
    todo_mirror_updated: "2026-07-07T14:32:11.482Z",
    transitions: [
      { at: "2026-07-06T09:00:00Z", from: null, to: "todo", by: "board:create" },
      { at: "2026-07-06T10:00:00Z", from: "todo", to: "in_progress", by: "hive_board_bind", session: "ses_10a2114b3ffe" },
    ],
    body: "## Spec / notes\n\nFree-form markdown body with `code` and --- dashes.",
  }
}

// ── serialize + parse round-trip ─────────────────────────────────────────────

test("serialize + parse: full item survives", () => {
  const item = fullItem()
  const parsed = parseWorkItem(serializeWorkItem(item))
  assert.deepEqual(parsed, item)
})

test("serialize: canonical shapes match SCHEMA §2", () => {
  const s = serializeWorkItem(fullItem())
  assert.ok(s.includes('title: "Add push-notification \\"opt-out\\" to settings"'))
  assert.ok(s.includes("tags: [frontend, push]"))
  assert.ok(s.includes("artifacts: [I-142, W-061]"))
  assert.ok(s.includes("released_sessions: [ses_dead01, ses_dead02]"))
  assert.ok(s.includes('  - { content: "Read current settings widget", status: completed }'))
  assert.ok(s.includes("todo_mirror_updated: 2026-07-07T14:32:11.482Z"))
  assert.ok(s.includes('  - { content: "Investigate push API", status: completed }'))
  assert.ok(s.includes("  - { at: 2026-07-06T09:00:00Z, from: null, to: todo, by: board:create }"))
  assert.ok(
    s.includes("  - { at: 2026-07-06T10:00:00Z, from: todo, to: in_progress, by: hive_board_bind, session: ses_10a2114b3ffe }")
  )
  // transitions is the LAST frontmatter field
  const fm = s.split("\n---\n")[0]
  const lastField = fm.split("\n").filter((l) => /^[a-z_]+:/.test(l)).pop()
  assert.equal(lastField, "transitions:")
})

test("serialize: empty lists serialize as empty flow form", () => {
  const item = { ...fullItem(), subtasks: [], todo_mirror: [], todo_mirror_updated: null, transitions: [], released_sessions: [], tags: [], artifacts: [] }
  const s = serializeWorkItem(item)
  assert.ok(s.includes("subtasks: []"))
  assert.ok(s.includes("todo_mirror: []"))
  assert.ok(s.includes("todo_mirror_updated: null"))
  assert.ok(s.includes("transitions: []"))
  assert.ok(s.includes("released_sessions: []"))
  const parsed = parseWorkItem(s)
  assert.deepEqual(parsed.subtasks, [])
  assert.deepEqual(parsed.todo_mirror, [])
  assert.equal(parsed.todo_mirror_updated, null)
  assert.deepEqual(parsed.transitions, [])
})

test("serialize: null fields emit literal null and parse back to null", () => {
  const item = { ...fullItem(), owner_session: null, group_id: null, spec_hash: null, dream_id: null }
  const s = serializeWorkItem(item)
  assert.ok(s.includes("owner_session: null"))
  const parsed = parseWorkItem(s)
  assert.equal(parsed.owner_session, null)
  assert.equal(parsed.group_id, null)
  assert.equal(parsed.spec_hash, null)
  assert.equal(parsed.dream_id, null)
})

test("parse: empty block-HEADER form parses to [] (hand-written / SCHEMA example shape)", () => {
  const content = [
    "---",
    "id: WI-050",
    'title: "Hand-written"',
    "status: todo",
    "subtasks:",
    "transitions:",
    "---",
    "",
    "body",
  ].join("\n")
  const parsed = parseWorkItem(content)
  assert.deepEqual(parsed.subtasks, [])
  assert.deepEqual(parsed.transitions, [])
  assert.equal(parsed.status, "todo")

  // and header form with entries following still collects them
  const withEntries = content.replace(
    "transitions:",
    "transitions:\n  - { at: 2026-07-10T00:00:00Z, from: null, to: todo, by: hand }"
  )
  assert.equal(parseWorkItem(withEntries).transitions.length, 1)
})

test("applyEditToContent: appendTransition works on the empty block-header form", () => {
  const content = ["---", "id: WI-051", "status: todo", "transitions:", "---", "", "body"].join("\n")
  const next = applyEditToContent(content, {
    appendTransition: { at: "2026-07-10T00:00:00Z", from: "todo", to: "in_progress", by: "t", session: "ses_z" },
  })
  const parsed = parseWorkItem(next)
  assert.equal(parsed.transitions.length, 1)
  assert.equal(parsed.transitions[0].session, "ses_z")
  assert.ok(next.includes("transitions:\n  - { at: 2026-07-10T00:00:00Z, from: todo, to: in_progress, by: t, session: ses_z }"))
})

test("applyEditToContent: appendReleasedSession on a file missing the field inserts it", () => {
  const content = ["---", "id: WI-052", "status: todo", "transitions:", "---", "", "body"].join("\n")
  const next = applyEditToContent(content, { appendReleasedSession: "ses_r" })
  assert.deepEqual(parseWorkItem(next).released_sessions, ["ses_r"])
})

test("parse: permissive parse — minimal hand-written file gets defaults", () => {
  const parsed = parseWorkItem(`---\nid: WI-099\ntitle: bare title\n---\nbody here\n`)
  assert.equal(parsed.id, "WI-099")
  assert.equal(parsed.status, "backlog")
  assert.equal(parsed.paused, false)
  assert.equal(parsed.priority, "medium")
  assert.deepEqual(parsed.tags, [])
  assert.deepEqual(parsed.transitions, [])
  assert.equal(parsed.owner_session, null)
  assert.equal(parsed.body, "body here")
})

// ── ids and file ops ─────────────────────────────────────────────────────────

test("nextItemId: empty board → WI-001, then max+1", async () => {
  await withDir(async (dir) => {
    assert.equal(nextItemId(dir), "WI-001")
    await createItem(dir, { ...fullItem(), transitions: [], subtasks: [] })
    assert.equal(nextItemId(dir), "WI-002")
    fs.writeFileSync(path.join(boardDir(dir), "WI-041.md"), serializeWorkItem({ ...fullItem(), id: "WI-041" }))
    assert.equal(nextItemId(dir), "WI-042")
  })
})

test("createItem assigns id and writes; readItem/listItems round-trip", async () => {
  await withDir(async (dir) => {
    const created = await createItem(dir, { ...fullItem() })
    assert.equal(created.id, "WI-001")
    const read = readItem(dir, "WI-001")
    assert.equal(read.title, fullItem().title)
    assert.equal(listItems(dir).length, 1)
  })
})

test("findItemByOwner and findItemReleasing", async () => {
  await withDir(async (dir) => {
    await createItem(dir, { ...fullItem() })
    assert.equal(findItemByOwner(dir, "ses_10a2114b3ffe")?.id, "WI-001")
    assert.equal(findItemByOwner(dir, "ses_nope"), null)
    assert.equal(findItemReleasing(dir, "ses_dead01")?.id, "WI-001")
    assert.equal(findItemReleasing(dir, "ses_alive"), null)
  })
})

// ── applyEditToContent — text surgery (I-049) ────────────────────────────────

test("surgery: scalar patch touches only that line", () => {
  const original = serializeWorkItem(fullItem())
  const next = applyEditToContent(original, { set: { status: "done" } })
  const a = original.split("\n")
  const b = next.split("\n")
  assert.equal(b.length, a.length)
  const diffs = a.map((l, i) => (l !== b[i] ? i : -1)).filter((i) => i >= 0)
  assert.equal(diffs.length, 1)
  assert.equal(b[diffs[0]], "status: done")
})

test("surgery: appendTransition inserts after the last entry, prior bytes untouched", () => {
  const original = serializeWorkItem(fullItem())
  const t = { at: "2026-07-08T12:00:00Z", from: "in_progress", to: "done", by: "test" }
  const next = applyEditToContent(original, { appendTransition: t })
  assert.ok(next.includes("  - { at: 2026-07-08T12:00:00Z, from: in_progress, to: done, by: test }"))
  // every original line still present, in order
  const bLines = next.split("\n")
  let cursor = 0
  for (const line of original.split("\n")) {
    const idx = bLines.indexOf(line, cursor)
    assert.ok(idx >= 0)
    cursor = idx + 1
  }
  const parsed = parseWorkItem(next)
  assert.equal(parsed.transitions.length, 3)
  assert.equal(parsed.transitions[2].by, "test")
})

test("surgery: appendTransition converts `transitions: []` to block form", () => {
  const empty = serializeWorkItem({ ...fullItem(), transitions: [] })
  const next = applyEditToContent(empty, {
    appendTransition: { at: nowIso(), from: null, to: "backlog", by: "x" },
  })
  const parsed = parseWorkItem(next)
  assert.equal(parsed.transitions.length, 1)
  assert.equal(parsed.transitions[0].from, null)
})

test("surgery: appendReleasedSession on empty and non-empty arrays", () => {
  const empty = serializeWorkItem({ ...fullItem(), released_sessions: [] })
  const one = applyEditToContent(empty, { appendReleasedSession: "ses_a" })
  assert.ok(one.includes("released_sessions: [ses_a]"))
  const two = applyEditToContent(one, { appendReleasedSession: "ses_b" })
  assert.ok(two.includes("released_sessions: [ses_a, ses_b]"))
  assert.deepEqual(parseWorkItem(two).released_sessions, ["ses_a", "ses_b"])
})

test("surgery: setArtifacts replaces the whole flow array (cache mirror, I-144)", () => {
  const empty = serializeWorkItem({ ...fullItem(), artifacts: [] })
  const one = applyEditToContent(empty, { setArtifacts: ["I-187", "I-188"] })
  assert.ok(one.includes("artifacts: [I-187, I-188]"))
  assert.deepEqual(parseWorkItem(one).artifacts, ["I-187", "I-188"])
  // whole-replace, not append: a second setArtifacts overwrites
  const two = applyEditToContent(one, { setArtifacts: ["W-001"] })
  assert.ok(two.includes("artifacts: [W-001]"))
  assert.deepEqual(parseWorkItem(two).artifacts, ["W-001"])
  // empty clears
  assert.deepEqual(parseWorkItem(applyEditToContent(one, { setArtifacts: [] })).artifacts, [])
})

test("surgery: setTodoMirror replaces the whole block + stamps full-precision updated (WI-038, I-190)", () => {
  const empty = serializeWorkItem({ ...fullItem(), todo_mirror: [], todo_mirror_updated: null })
  const one = applyEditToContent(empty, {
    setTodoMirror: {
      todos: [
        { content: "step one", status: "completed" },
        { content: "step, two", status: "in_progress" },
      ],
      at: "2026-07-21T21:30:00.123Z",
    },
  })
  assert.ok(one.includes("todo_mirror_updated: 2026-07-21T21:30:00.123Z"))
  assert.ok(one.includes('  - { content: "step one", status: completed }'))
  assert.ok(one.includes('  - { content: "step, two", status: in_progress }'))
  const parsedOne = parseWorkItem(one)
  assert.deepEqual(parsedOne.todo_mirror, [
    { content: "step one", status: "completed" },
    { content: "step, two", status: "in_progress" },
  ])
  assert.equal(parsedOne.todo_mirror_updated, "2026-07-21T21:30:00.123Z")

  // whole-replace, not append: a second setTodoMirror overwrites entirely
  const two = applyEditToContent(one, {
    setTodoMirror: { todos: [{ content: "only", status: "pending" }], at: "2026-07-21T22:00:00.000Z" },
  })
  const parsedTwo = parseWorkItem(two)
  assert.deepEqual(parsedTwo.todo_mirror, [{ content: "only", status: "pending" }])
  assert.equal(parsedTwo.todo_mirror_updated, "2026-07-21T22:00:00.000Z")
  // no stale entries lingering from the first mirror
  assert.ok(!two.includes("step one"))

  // empty todos clears the mirror to [] while still stamping
  const cleared = applyEditToContent(two, { setTodoMirror: { todos: [], at: "2026-07-21T23:00:00.000Z" } })
  assert.ok(cleared.includes("todo_mirror: []"))
  const parsedCleared = parseWorkItem(cleared)
  assert.deepEqual(parsedCleared.todo_mirror, [])
  assert.equal(parsedCleared.todo_mirror_updated, "2026-07-21T23:00:00.000Z")
})

test("surgery: setTodoMirror on an item that already has a populated mirror replaces cleanly", () => {
  // fullItem() carries a 2-entry mirror + stamp
  const populated = serializeWorkItem(fullItem())
  const next = applyEditToContent(populated, {
    setTodoMirror: { todos: [{ content: "fresh", status: "in_progress" }], at: "2026-07-22T00:00:00.000Z" },
  })
  const parsed = parseWorkItem(next)
  assert.deepEqual(parsed.todo_mirror, [{ content: "fresh", status: "in_progress" }])
  assert.equal(parsed.todo_mirror_updated, "2026-07-22T00:00:00.000Z")
  // transitions block downstream is untouched (still last, entries intact)
  assert.equal(parsed.transitions.length, fullItem().transitions.length)
  // todo_mirror remains before transitions in the frontmatter
  const fm = next.split("\n---\n")[0]
  assert.ok(fm.indexOf("todo_mirror") < fm.indexOf("transitions:"))
})

test("surgery: setTodoMirror on a hand-written file missing the field inserts it before transitions", () => {
  const handWritten = [
    "---",
    "id: WI-099",
    'title: "Hand"',
    "status: in_progress",
    "subtasks: []",
    "transitions: []",
    "---",
    "",
    "body",
  ].join("\n")
  const next = applyEditToContent(handWritten, {
    setTodoMirror: { todos: [{ content: "x", status: "pending" }], at: "2026-07-22T01:00:00.000Z" },
  })
  const parsed = parseWorkItem(next)
  assert.deepEqual(parsed.todo_mirror, [{ content: "x", status: "pending" }])
  assert.equal(parsed.todo_mirror_updated, "2026-07-22T01:00:00.000Z")
  const fm = next.split("\n---\n")[0]
  assert.ok(fm.indexOf("todo_mirror") < fm.indexOf("transitions:"))
})

test("surgery: Done-stamp combo — status + dream_id + setArtifacts + done transition in one edit", () => {
  const inProgress = serializeWorkItem({
    ...fullItem(),
    status: "in_progress",
    dream_id: null,
    artifacts: [],
  })
  const done = applyEditToContent(inProgress, {
    set: { status: "done", dream_id: "DRM-046" },
    setArtifacts: ["I-187", "I-188"],
    appendTransition: { at: nowIso(), from: "in_progress", to: "done", by: "board:dream-complete:DRM-046", session: "ses_x" },
  })
  const parsed = parseWorkItem(done)
  assert.equal(parsed.status, "done")
  assert.equal(parsed.dream_id, "DRM-046")
  assert.deepEqual(parsed.artifacts, ["I-187", "I-188"])
  assert.equal(parsed.transitions[parsed.transitions.length - 1].to, "done")
})

test("surgery: body and unknown hand-added fields survive edits byte-for-byte", () => {
  const original = serializeWorkItem(fullItem())
  const withUnknown = original.replace("priority: medium", "priority: medium\nx_custom_field: kept")
  const next = applyEditToContent(withUnknown, {
    set: { paused: true },
    appendTransition: { at: nowIso(), from: "in_progress", to: "in_progress", by: "pause" },
  })
  assert.ok(next.includes("x_custom_field: kept"))
  assert.ok(next.includes("Free-form markdown body with `code` and --- dashes."))
  assert.ok(next.includes("paused: true"))
})

// ── mutateItem + locking ─────────────────────────────────────────────────────

test("mutateItem stamps updated and persists", async () => {
  await withDir(async (dir) => {
    await createItem(dir, { ...fullItem(), updated: "2020-01-01" })
    const item = await mutateItem(dir, "WI-001", { set: { status: "todo" } })
    assert.equal(item.status, "todo")
    assert.notEqual(item.updated, "2020-01-01")
  })
})

test("concurrent appends all land (advisory lock serializes writers)", async () => {
  await withDir(async (dir) => {
    await createItem(dir, { ...fullItem(), transitions: [] })
    const N = 12
    await Promise.all(
      Array.from({ length: N }, (_, k) =>
        mutateItem(dir, "WI-001", {
          appendTransition: { at: nowIso(), from: "todo", to: "in_progress", by: `writer-${k}` },
        })
      )
    )
    const item = readItem(dir, "WI-001")
    assert.equal(item.transitions.length, N)
    const bys = new Set(item.transitions.map((t) => t.by))
    assert.equal(bys.size, N)
  })
})

// ── absorbed lineage key (Q15) ───────────────────────────────────────────────

test("absorbed: transition with absorbed round-trips; emit places it last", () => {
  const item = {
    ...fullItem(),
    transitions: [
      { at: "2026-07-10T10:00:00Z", from: "todo", to: "in_progress", by: "hive_board_bind", session: "ses_x", absorbed: "WI-009" },
    ],
  }
  const s = serializeWorkItem(item)
  assert.ok(
    s.includes("  - { at: 2026-07-10T10:00:00Z, from: todo, to: in_progress, by: hive_board_bind, session: ses_x, absorbed: WI-009 }")
  )
  const parsed = parseWorkItem(s)
  assert.equal(parsed.transitions[0].absorbed, "WI-009")
})

test("absorbed: entries without absorbed stay byte-identical and parse with the key absent", () => {
  const s = serializeWorkItem(fullItem()) // no absorbed anywhere
  assert.ok(!s.includes("absorbed"))
  const parsed = parseWorkItem(s)
  for (const t of parsed.transitions) assert.ok(!("absorbed" in t))
  // appending an absorbed-carrying entry leaves prior entries untouched
  const next = applyEditToContent(s, {
    appendTransition: { at: nowIso(), from: "todo", to: "in_progress", by: "b", session: "s", absorbed: "WI-003" },
  })
  for (const line of s.split("\n")) assert.ok(next.includes(line))
  const p2 = parseWorkItem(next)
  assert.equal(p2.transitions[p2.transitions.length - 1].absorbed, "WI-003")
})

// ── listItemsInDir ───────────────────────────────────────────────────────────

test("listItemsInDir: reads an arbitrary dir with the same filename filter", async () => {
  await withDir(async (dir) => {
    await createItem(dir, { ...fullItem() })
    fs.writeFileSync(path.join(boardDir(dir), "notes.md"), "not an item")
    const items = listItemsInDir(boardDir(dir))
    assert.equal(items.length, 1)
    assert.equal(items[0].id, "WI-001")
    assert.deepEqual(listItemsInDir(path.join(dir, "missing")), [])
  })
})

test("listItemsInDir: the enumeration gate keeps non-contract dirs out (live-store co-tenants)", async () => {
  await withDir(async (dir) => {
    await createItem(dir, { ...fullItem() })
    // The real .opencode/board/ carries .locks/ (the advisory lockfile) and
    // attachments/ (session-staged images) — NEITHER may parse as an item.
    fs.mkdirSync(path.join(boardDir(dir), ".locks"), { recursive: true })
    fs.writeFileSync(path.join(boardDir(dir), ".locks", "board.lock"), String(process.pid))
    fs.mkdirSync(path.join(boardDir(dir), "attachments"), { recursive: true })
    fs.writeFileSync(path.join(boardDir(dir), "attachments", "ember-drift.png"), "png")
    const items = listItemsInDir(boardDir(dir))
    assert.equal(items.length, 1)
    assert.equal(items[0].id, "WI-001")
  })
})

// ── specHash ────────────────────────────────────────────────────────────────

test("specHash: stable, trimmed, 12 hex chars", () => {
  assert.equal(specHash("body"), specHash("  body \n"))
  assert.match(specHash("body"), /^[0-9a-f]{12}$/)
  assert.notEqual(specHash("a"), specHash("b"))
})

// ── isPlaceholderTitle / PLACEHOLDER_TITLE_RE (the title contract) ──────────

test("placeholder title: matches opencode's exact placeholder format", () => {
  assert.equal(isPlaceholderTitle("New session - 2026-07-20T22:18:00.584Z"), true)
  assert.equal(PLACEHOLDER_TITLE_RE.test("New session - 2026-07-20T22:18:00.584Z"), true)
  // millis-less variant tolerated (belt-and-braces)
  assert.equal(isPlaceholderTitle("New session - 2026-07-20T22:18:00Z"), true)
})

test("placeholder title: empty / whitespace / null / undefined count as unsettled", () => {
  assert.equal(isPlaceholderTitle(""), true)
  assert.equal(isPlaceholderTitle("   "), true)
  assert.equal(isPlaceholderTitle(null), true)
  assert.equal(isPlaceholderTitle(undefined), true)
})

test("placeholder title: real titles are NOT placeholders", () => {
  assert.equal(isPlaceholderTitle("hive-board reload flicker and state reset"), false)
  // near-misses must not match
  assert.equal(isPlaceholderTitle("New session about the migration"), false)
  assert.equal(isPlaceholderTitle("Old session - 2026-07-20T22:18:00.584Z"), false)
})

// ── refreshOwnerTitle (locked title tracking) ────────────────────────────────

test("refreshOwnerTitle: patches a placeholder title to the real one for the owning session", async () => {
  await withDir(async (dir) => {
    await createItem(dir, {
      ...fullItem(),
      owner_session: "ses_own",
      title: "New session - 2026-07-20T22:18:00.584Z",
    })
    const patched = await refreshOwnerTitle(dir, "ses_own", "hive-board reload flicker fix")
    assert.equal(patched, "WI-001") // createItem assigns the next id, ignoring the passed one
    assert.equal(findItemByOwner(dir, "ses_own").title, "hive-board reload flicker fix")
  })
})

test("refreshOwnerTitle: no-op when the stored title is already settled (never clobbers)", async () => {
  await withDir(async (dir) => {
    await createItem(dir, { ...fullItem(), owner_session: "ses_own", title: "Real settled title" })
    const patched = await refreshOwnerTitle(dir, "ses_own", "some other title")
    assert.equal(patched, null)
    assert.equal(findItemByOwner(dir, "ses_own").title, "Real settled title")
  })
})

test("refreshOwnerTitle: no-op when the incoming title is itself a placeholder", async () => {
  await withDir(async (dir) => {
    await createItem(dir, {
      ...fullItem(),
      owner_session: "ses_own",
      title: "New session - 2026-07-20T22:18:00.584Z",
    })
    const patched = await refreshOwnerTitle(dir, "ses_own", "New session - 2026-07-20T22:19:00.000Z")
    assert.equal(patched, null)
    assert.equal(isPlaceholderTitle(findItemByOwner(dir, "ses_own").title), true)
  })
})

test("refreshOwnerTitle: no-op when no item owns the session", async () => {
  await withDir(async (dir) => {
    await createItem(dir, { ...fullItem(), owner_session: "ses_other", title: "New session - 2026-07-20T22:18:00.584Z" })
    assert.equal(await refreshOwnerTitle(dir, "ses_nobody", "real title"), null)
  })
})

test("refreshOwnerTitle: only patches the frontmatter title field (surgical, other fields untouched)", async () => {
  await withDir(async (dir) => {
    await createItem(dir, {
      ...fullItem(),
      owner_session: "ses_own",
      title: "New session - 2026-07-20T22:18:00.584Z",
      status: "in_progress",
      dream_id: "DRM-041",
    })
    await refreshOwnerTitle(dir, "ses_own", "settled title")
    const item = findItemByOwner(dir, "ses_own")
    assert.equal(item.title, "settled title")
    assert.equal(item.status, "in_progress")
    assert.equal(item.dream_id, "DRM-041")
  })
})
