// Port of the OpenCode plugin's test/board-read.test.ts (bun:test →
// node:test), semantics 1:1. WI-068 — the board READ surface (list / search /
// read + the create advisory). The module is pure over an in-memory
// WorkItem[]; assertions are on OBSERVED output, never on what a type or a
// description claims (I-246).
import test from "node:test"
import assert from "node:assert/strict"

import {
  listBoard,
  searchBoard,
  readItems,
  nearestItems,
  formatNearest,
  scoreItem,
  normaliseItemId,
  MAX_K,
  MAX_MAX_BYTES,
} from "@hive/dsh-board/lib/board-read"

// ── Fixtures ─────────────────────────────────────────────────────────────────

function item(id, over = {}) {
  return {
    id,
    title: `Item ${id}`,
    status: "backlog",
    owner_session: null,
    group_id: null,
    origin: "idea-first",
    paused: false,
    spec_hash: null,
    released_sessions: [],
    dream_id: null,
    artifacts: [],
    created: "2026-08-01",
    updated: "2026-08-01",
    priority: "medium",
    tags: [],
    done_without_dream: false,
    subtasks: [],
    todo_mirror: [],
    todo_mirror_updated: null,
    transitions: [],
    body: "",
    ...over,
  }
}

/** A small board with one of everything the filters can discriminate on. */
function board() {
  return [
    item("WI-001", {
      title: "Add push opt-out toggle",
      status: "backlog",
      priority: "high",
      tags: ["proposal", "push"],
      body: "Users need a way to disable push notifications from the settings screen.",
      updated: "2026-08-01",
    }),
    item("WI-002", {
      title: "Reverse-engineer the proposal JSON endpoint",
      status: "todo",
      priority: "low",
      body: "The source site exposes GetProposals; confirm the shape.",
      updated: "2026-08-02",
    }),
    item("WI-003", {
      title: "The board has six write tools and no read tool",
      status: "in_progress",
      owner_session: "ses_0341636700",
      group_id: "ses_0341636700",
      priority: "medium",
      tags: ["board", "tooling"],
      body: "Every board tool is a write or a transition. There is no sanctioned way to READ the board.",
      transitions: [
        { at: "2026-08-04T07:52:22Z", from: null, to: "todo", by: "hive_board_create:build" },
        { at: "2026-08-04T08:35:24Z", from: "todo", to: "in_progress", by: "board:start", session: "ses_0341636700" },
      ],
      subtasks: [{ content: "measure the corpus", status: "completed" }],
      todo_mirror: [{ content: "write board-read.ts", status: "in_progress" }],
      todo_mirror_updated: "2026-08-04T12:31:22.098Z",
      updated: "2026-08-04",
    }),
    item("WI-004", {
      title: "Ship the dream artifact ranking backend",
      status: "done",
      owner_session: "ses_abcdef0123",
      group_id: "ses_abcdef0123",
      dream_id: "DRM-015",
      priority: "high",
      body: "Token-v1 ranking with type floors and trigger bypass.",
      updated: "2026-07-20",
    }),
    item("WI-005", {
      title: "Empty placeholder from a live session",
      status: "in_progress",
      origin: "session-first",
      owner_session: "ses_999888777a",
      group_id: "ses_999888777a",
      priority: "low",
      body: "",
      updated: "2026-08-03",
    }),
  ]
}

// ── list — defaults and filtering ─────────────────────────────────────────────

test("list defaults to live: done items are excluded and the exclusion is stated", () => {
  const r = listBoard(board())
  assert.ok(r.ok, r.error)
  assert.ok(!r.matched.map((i) => i.id).includes("WI-004"))
  assert.equal(r.matched.length, 4)
  assert.ok(r.text.includes('status="all"'))
})

test('list status="all" is an explicit opt-in that brings done back', () => {
  const r = listBoard(board(), { status: "all" })
  assert.ok(r.ok, r.error)
  assert.ok(r.matched.map((i) => i.id).includes("WI-004"))
  assert.equal(r.matched.length, 5)
})

test("list: a single status filters to exactly it", () => {
  const r = listBoard(board(), { status: "todo" })
  assert.ok(r.ok, r.error)
  assert.deepEqual(r.matched.map((i) => i.id), ["WI-002"])
})

test("list: owner=none and owner=owned partition the board", () => {
  const none = listBoard(board(), { status: "all", owner: "none" })
  const owned = listBoard(board(), { status: "all", owner: "owned" })
  assert.ok(none.ok)
  assert.ok(owned.ok)
  assert.deepEqual(none.matched.map((i) => i.id).sort(), ["WI-001", "WI-002"])
  assert.deepEqual(owned.matched.map((i) => i.id).sort(), ["WI-003", "WI-004", "WI-005"])
})

test("list: priority filter", () => {
  const r = listBoard(board(), { status: "all", priority: "high" })
  assert.ok(r.ok, r.error)
  assert.deepEqual(r.matched.map((i) => i.id).sort(), ["WI-001", "WI-004"])
})

test("list ordering: in_progress first, then todo, backlog, done; priority then recency inside", () => {
  const r = listBoard(board(), { status: "all" })
  assert.ok(r.ok, r.error)
  assert.deepEqual(r.matched.map((i) => i.id), [
    "WI-003", // in_progress, medium
    "WI-005", // in_progress, low
    "WI-002", // todo
    "WI-001", // backlog
    "WI-004", // done
  ])
})

test("list recency uses the full-precision transition stamp, not date-only `updated`", () => {
  // Two same-day items: the one with the later transition stamp sorts first.
  const items = [
    item("WI-010", { status: "backlog", updated: "2026-08-04" }),
    item("WI-011", {
      status: "backlog",
      updated: "2026-08-04",
      transitions: [{ at: "2026-08-04T23:00:00Z", from: null, to: "backlog", by: "t" }],
    }),
  ]
  const r = listBoard(items)
  assert.ok(r.ok, r.error)
  assert.deepEqual(r.matched.map((i) => i.id), ["WI-011", "WI-010"])
})

// ── list — the cheapness promise ──────────────────────────────────────────────

test("list NEVER renders a body, only its size", () => {
  const items = board()
  const r = listBoard(items, { status: "all" })
  assert.ok(r.ok, r.error)
  for (const it of items) {
    if (it.body !== "") assert.ok(!r.text.includes(it.body))
  }
  // WI-003's body is 90 bytes → shown as a size, not as text
  assert.match(r.text, /WI-003.*\b90\b/)
})

test("list: the whole index of a 69-item board stays small", () => {
  const many = Array.from({ length: 69 }, (_, i) =>
    item(`WI-${String(i + 1).padStart(3, "0")}`, {
      title: "A reasonably descriptive work item title of typical length",
      body: "x".repeat(4000),
      tags: ["project", "component"],
    })
  )
  const r = listBoard(many, { status: "all" })
  assert.ok(r.ok, r.error)
  // ~2.3k tokens was the measured budget; assert the byte analogue holds.
  assert.ok(r.text.length < 12_000)
})

test("list limit truncates and SAYS SO by count", () => {
  const r = listBoard(board(), { status: "all", limit: 2 })
  assert.ok(r.ok, r.error)
  assert.equal(r.shown, 2)
  assert.equal(r.matched.length, 5)
  assert.ok(r.text.includes("3 more matched"))
})

test("list: a legitimately empty result says the filters were valid", () => {
  const r = listBoard(board(), { status: "backlog", priority: "low" })
  assert.ok(r.ok, r.error)
  assert.equal(r.matched.length, 0)
  assert.ok(r.text.includes("the filters are valid"))
})

// ── list — runtime guards (the schema enforces NOTHING, W-125) ────────────────

test("list: an undeclared status value is refused, with the accepted set named", () => {
  const r = listBoard(board(), { status: "in-progress" })
  assert.ok(!r.ok)
  assert.ok(r.error.includes("BAD_ENUM"))
  assert.ok(r.error.includes("live, all, backlog, todo, in_progress, done"))
})

test("list: a value of the wrong TYPE is refused rather than coerced", () => {
  const r = listBoard(board(), { status: 3 })
  assert.ok(!r.ok)
  assert.ok(r.error.includes("BAD_ENUM"))
})

test("list: owner and priority are guarded the same way", () => {
  const o = listBoard(board(), { owner: "ses_123" })
  const p = listBoard(board(), { priority: "urgent" })
  assert.ok(!o.ok)
  assert.ok(!p.ok)
  assert.ok(o.error.includes("any, owned, none"))
  assert.ok(p.error.includes("any, low, medium, high"))
})

test("list: limit rejects non-integer, negative and absurd values", () => {
  for (const bad of [0, -5, 2.5, 10_000, "8"]) {
    const r = listBoard(board(), { limit: bad })
    assert.ok(!r.ok)
  }
  const okr = listBoard(board(), { limit: 3 })
  assert.ok(okr.ok)
})

test("list: undefined/omitted options fall back to the documented defaults", () => {
  const a = listBoard(board(), {})
  const b = listBoard(board(), { status: undefined, owner: undefined, priority: undefined })
  assert.ok(a.ok)
  assert.ok(b.ok)
  assert.equal(a.text, b.text)
})

// ── list — impossible combinations hard-error (I-050) ─────────────────────────

test("list: in_progress + owner=none refuses instead of returning []", () => {
  const r = listBoard(board(), { status: "in_progress", owner: "none" })
  assert.ok(!r.ok)
  assert.ok(r.error.includes("IMPOSSIBLE_FILTER"))
  assert.ok(r.error.includes("invariant 1"))
})

test("list refusal still tells a violation-hunter how to hunt (illegal states DO reach disk)", () => {
  // The refusal must never read as "no such state exists". WI-071 changed
  // WHERE it sends them — from a manual workaround (read the owner column)
  // to the real surface (the ⚠ marker) — but not THAT it must send them
  // somewhere. Both halves are asserted: the admission and the route.
  const r = listBoard(board(), { status: "in_progress", owner: "none" })
  assert.ok(!r.ok)
  assert.ok(r.error.includes("WI-065"))
  assert.ok(r.error.includes("LEGAL, never what is STORED"))
  assert.ok(r.error.includes("⚠"))
  assert.ok(r.error.includes("hive_board_list"))
})

test("list refusal no longer routes anyone at the pre-WI-071 manual workaround", () => {
  // Guards the actual regression risk: someone restoring the old wording
  // (or the old wording surviving a merge) would re-create a paragraph that
  // is now strictly worse than the surface it was standing in for.
  const r = listBoard(board(), { status: "in_progress", owner: "none" })
  assert.ok(!r.ok)
  assert.ok(!r.error.includes("owner column"))
})

test("list: backlog/todo + owner=owned refuses in the other direction", () => {
  for (const status of ["backlog", "todo"]) {
    const r = listBoard(board(), { status, owner: "owned" })
    assert.ok(!r.ok)
    assert.ok(r.error.includes("IMPOSSIBLE_FILTER"))
  }
})

test("list: the combinations that ARE possible are not refused", () => {
  for (const opts of [
    { status: "in_progress", owner: "owned" },
    { status: "done", owner: "none" },
    { status: "all", owner: "none" },
    { status: "live", owner: "owned" },
  ]) {
    assert.ok(listBoard(board(), opts).ok)
  }
})

// ── invariant violations are surfaced board-wide (WI-071) ─────────────────────
// The base board() fixture is deliberately all-legal. Violations are opted
// into HERE, one item per checked invariant — exactly what the schema forbids
// and what WI-065 proved reaches disk anyway.

function illegalBoard() {
  return [
    ...board(),
    item("WI-101", { status: "in_progress", owner_session: null }), // invariant 1
    item("WI-102", { status: "done", dream_id: null, done_without_dream: false }), // invariant 2
    item("WI-103", {
      status: "in_progress",
      owner_session: "ses_orphan0001",
      group_id: null, // invariant 3 (and 1 is satisfied: owner is set)
    }),
  ]
}

test("list: a clean board shows no marker and no count at all", () => {
  const r = listBoard(board(), { status: "all" })
  assert.ok(r.ok, r.error)
  assert.ok(!r.text.includes("⚠"))
  assert.ok(!r.text.includes("ILLEGAL"))
})

test("list: each of the three checked invariants is detected and named", () => {
  const r = listBoard(illegalBoard(), { status: "all" })
  assert.ok(r.ok, r.error)
  assert.ok(r.text.includes("invariant 1"))
  assert.ok(r.text.includes("invariant 2"))
  assert.ok(r.text.includes("invariant 3"))
})

test("list: the header counts violations and names the offending ids", () => {
  const r = listBoard(illegalBoard(), { status: "all" })
  assert.ok(r.ok, r.error)
  const header = r.text.split("\n").find((l) => l.includes("ILLEGAL state"))
  assert.ok(header)
  assert.ok(header.includes("3 of 8"))
  for (const id of ["WI-101", "WI-102", "WI-103"]) assert.ok(header.includes(id))
})

test("list: the count spans everything MATCHED, not just what limit rendered", () => {
  // The whole reason this moved out of the viewer: a per-card check cannot
  // answer a board-wide question. A count that quietly followed the rendered
  // page would re-create exactly that failure under a new name.
  const r = listBoard(illegalBoard(), { status: "all", limit: 1 })
  assert.ok(r.ok, r.error)
  assert.equal(r.shown, 1)
  const header = r.text.split("\n").find((l) => l.includes("ILLEGAL state"))
  assert.ok(header.includes("3 of 8"))
  assert.ok(header.includes("WI-101"))
})

test("list: only the violating rows are marked", () => {
  const r = listBoard(illegalBoard(), { status: "all" })
  assert.ok(r.ok, r.error)
  const rows = r.text.split("\n").filter((l) => /^\s{2}WI-\d{3}\s/.test(l))
  const marked = rows.filter((l) => l.includes("⚠ ILLEGAL:")).map((l) => l.trim().slice(0, 6))
  assert.deepEqual(marked.sort(), ["WI-101", "WI-102", "WI-103"])
})

test("list: the marker states WHICH invariant broke, not just that one did", () => {
  const r = listBoard(illegalBoard(), { status: "all" })
  assert.ok(r.ok, r.error)
  const row = r.text.split("\n").find((l) => l.trim().startsWith("WI-101"))
  assert.ok(row.includes("in_progress without owner_session (invariant 1)"))
})

test("read surfaces the violation on a named item, under its status line", () => {
  const r = readItems(illegalBoard(), "WI-103")
  assert.ok(r.ok, r.error)
  assert.ok(r.text.includes("⚠ ILLEGAL  owner_session without group_id (invariant 3)"))
  const lines = r.text.split("\n")
  const statusAt = lines.findIndex((l) => l.startsWith("  status "))
  const illegalAt = lines.findIndex((l) => l.startsWith("  ⚠ ILLEGAL"))
  assert.equal(illegalAt, statusAt + 1)
})

test("read says the record is real, not a parse error, and must not be repaired", () => {
  const r = readItems(illegalBoard(), "WI-101")
  assert.ok(r.ok, r.error)
  assert.ok(r.text.includes("LEGAL, never what is"))
  assert.ok(r.text.includes("not a parse error"))
})

test("read of a legal item says nothing about invariants", () => {
  const r = readItems(illegalBoard(), "WI-003")
  assert.ok(r.ok, r.error)
  assert.ok(!r.text.includes("ILLEGAL"))
})

// ── search — ranking, not thresholding ────────────────────────────────────────

test("search puts the right item at rank 1 for a phrasing that shares no full title", () => {
  const r = searchBoard(board(), "no way to read work items from the board")
  assert.ok(r.ok, r.error)
  assert.equal(r.hits[0].id, "WI-003")
})

test("search spans ALL statuses — done work stays findable", () => {
  const r = searchBoard(board(), "dream artifact ranking")
  assert.ok(r.ok, r.error)
  assert.ok(r.hits.map((h) => h.id).includes("WI-004"))
})

test("search matches on body text, not just titles", () => {
  const r = searchBoard(board(), "GetProposals endpoint shape")
  assert.ok(r.ok, r.error)
  assert.equal(r.hits[0].id, "WI-002")
})

test("search: a title hit outranks the same word buried in a body", () => {
  const items = [
    item("WI-020", { title: "Nothing relevant here", body: "a".repeat(50) + " telemetry " + "b".repeat(50) }),
    item("WI-021", { title: "Telemetry pipeline", body: "unrelated prose about other matters entirely" }),
  ]
  const r = searchBoard(items, "telemetry")
  assert.ok(r.ok, r.error)
  assert.equal(r.hits[0].id, "WI-021")
})

test("search: k bounds the shortlist and defaults to 8", () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    item(`WI-${String(i + 1).padStart(3, "0")}`, { title: "shared vocabulary board tooling" })
  )
  const def = searchBoard(many, "board tooling")
  const three = searchBoard(many, "board tooling", { k: 3 })
  assert.ok(def.ok)
  assert.ok(three.ok)
  assert.equal(def.hits.length, 8)
  assert.equal(three.hits.length, 3)
  assert.equal(three.scored, 40)
  assert.ok(three.text.includes("3 of 40"))
})

test("search: scores are reported so the caller can judge, and are never a verdict", () => {
  const r = searchBoard(board(), "push opt-out toggle")
  assert.ok(r.ok, r.error)
  assert.ok(r.hits[0].score > 0)
  assert.ok(r.text.includes("not a duplicate verdict"))
})

test("search: excerpt windows on the match rather than always showing the head", () => {
  const long = item("WI-030", {
    title: "Long spec",
    body: "PREFACE. " + "filler ".repeat(60) + " the SENTINEL clause lives here " + "tail ".repeat(60),
  })
  const r = searchBoard([long], "sentinel")
  assert.ok(r.ok, r.error)
  assert.ok(r.hits[0].excerpt.includes("SENTINEL"))
  assert.ok(r.hits[0].excerpt.startsWith("…"))
})

test("search: an empty-bodied item is labelled rather than shown as blank", () => {
  const r = searchBoard(board(), "empty placeholder live session")
  assert.ok(r.ok, r.error)
  assert.ok(r.hits[0].excerpt.includes("placeholder item"))
})

// ── search — guards and honest emptiness ──────────────────────────────────────

test("search: a missing or blank query is refused with the alternative named", () => {
  for (const q of [undefined, "", "   ", 42]) {
    const r = searchBoard(board(), q)
    assert.ok(!r.ok)
    assert.ok(r.error.includes("hive_board_list"))
  }
})

test("search: a query with no 3+ character token is refused, not silently scored as zero", () => {
  const r = searchBoard(board(), "a is of")
  assert.ok(!r.ok)
  assert.ok(r.error.includes("NO_USABLE_TOKENS"))
  assert.ok(r.error.includes("db, id, ui, os")) // the known limitation, stated
})

test("search: k is bounded imperatively", () => {
  for (const bad of [0, -1, 1.5, MAX_K + 1, "8"]) {
    assert.ok(!searchBoard(board(), "board", { k: bad }).ok)
  }
})

test("search: zero hits is explained as a REAL empty, with the tokens that were used", () => {
  const r = searchBoard(board(), "quantum chromodynamics")
  assert.ok(r.ok, r.error)
  assert.equal(r.hits.length, 0)
  assert.ok(r.text.includes("quantum"))
  assert.ok(r.text.includes("real empty result"))
})

// ── read — named ids, full specs ──────────────────────────────────────────────

test("read renders the body in full", () => {
  const r = readItems(board(), ["WI-003"])
  assert.ok(r.ok, r.error)
  assert.ok(r.text.includes("There is no sanctioned way to READ the board."))
  assert.deepEqual(r.found, ["WI-003"])
})

test("read: subtasks and todo_mirror are SEPARATE and each labelled with its write class", () => {
  const r = readItems(board(), ["WI-003"])
  assert.ok(r.ok, r.error)
  assert.ok(r.text.includes("measure the corpus"))
  assert.ok(r.text.includes("write board-read.ts"))
  assert.match(r.text, /subtasks — author-written plan, canonical/)
  assert.match(r.text, /todo_mirror — the OWNING SESSION's live TodoWrite, a rebuildable cache/)
  assert.ok(r.text.includes("2026-08-04T12:31:22.098Z")) // the mirror's own stamp
})

test("read: history is summarised from the item's own append-only log", () => {
  const r = readItems(board(), ["WI-003"])
  assert.ok(r.ok, r.error)
  assert.ok(r.text.includes("2 entries"))
  assert.ok(r.text.includes("todo → in_progress"))
})

test("read: an empty body is explained, not rendered as blank", () => {
  const r = readItems(board(), ["WI-005"])
  assert.ok(r.ok, r.error)
  assert.ok(r.text.includes("spec body: EMPTY"))
  assert.ok(r.text.includes("session-first"))
})

test("read accepts a comma/space string as well as an array, and de-duplicates", () => {
  const a = readItems(board(), "WI-001, WI-002")
  const b = readItems(board(), ["WI-001", "WI-002", "WI-001"])
  assert.ok(a.ok)
  assert.ok(b.ok)
  assert.deepEqual(a.found, ["WI-001", "WI-002"])
  assert.deepEqual(b.found, ["WI-001", "WI-002"])
})

test("read id normalization: zero-padding and case are forgiven", () => {
  assert.equal(normaliseItemId("wi-3"), "WI-003")
  assert.equal(normaliseItemId(" WI-0003 "), "WI-003")
  assert.equal(normaliseItemId("WI-1234"), "WI-1234")
  assert.equal(normaliseItemId("WI-abc"), null)
  const r = readItems(board(), ["wi-3"])
  assert.ok(r.ok, r.error)
  assert.deepEqual(r.found, ["WI-003"])
})

// ── read — nothing disappears silently ────────────────────────────────────────

test("read: an unknown id is reported BY NAME", () => {
  const r = readItems(board(), ["WI-003", "WI-999"])
  assert.ok(r.ok, r.error)
  assert.deepEqual(r.missing, ["WI-999"])
  assert.ok(r.text.includes("Not found on the board: WI-999"))
  assert.deepEqual(r.found, ["WI-003"])
})

test("read: all-unknown is a lookup failure, not an empty board", () => {
  const r = readItems(board(), ["WI-998", "WI-999"])
  assert.ok(r.ok, r.error)
  assert.deepEqual(r.found, [])
  assert.ok(r.text.includes("lookup failure"))
})

test("read: a malformed id is refused (not guessed at) with the shape named", () => {
  const r = readItems(board(), ["WI-003", "the read tool one"])
  assert.ok(!r.ok)
  assert.ok(r.error.includes("BAD_ID"))
  assert.ok(r.error.includes("WI-NNN"))
})

test("read: no ids at all is refused with the discovery tools named", () => {
  for (const ids of [undefined, [], "", "  ,  "]) {
    const r = readItems(board(), ids)
    assert.ok(!r.ok)
    assert.ok(r.error.includes("hive_board_search"))
  }
})

// ── read — the byte budget ────────────────────────────────────────────────────

const fat = (id) => item(id, { title: `Fat ${id}`, body: "x".repeat(9000) })

test("read: items past the budget are DEFERRED BY NAME, never dropped", () => {
  const items = [fat("WI-101"), fat("WI-102"), fat("WI-103")]
  const r = readItems(items, ["WI-101", "WI-102", "WI-103"], { max_bytes: 12_000 })
  assert.ok(r.ok, r.error)
  assert.deepEqual(r.found, ["WI-101"])
  assert.deepEqual(r.deferred, ["WI-102", "WI-103"])
  assert.ok(r.text.includes("NOT included: WI-102, WI-103"))
  assert.ok(!r.text.includes("Fat WI-102"))
})

test("read: the budget is actually respected", () => {
  const items = Array.from({ length: 10 }, (_, i) => fat(`WI-${200 + i}`))
  const r = readItems(items, items.map((i) => i.id), { max_bytes: 20_000 })
  assert.ok(r.ok, r.error)
  assert.ok(r.bytes < 21_500) // payload + the head block
  assert.equal(r.found.length + r.deferred.length, 10)
})

test("read: a single oversized item is emitted TRUNCATED and says so, rather than vanishing", () => {
  const r = readItems([fat("WI-300")], ["WI-300"], { max_bytes: 1000 })
  assert.ok(r.ok, r.error)
  assert.deepEqual(r.found, ["WI-300"])
  assert.ok(r.text.includes("TRUNCATED"))
  assert.ok(r.text.includes("larger max_bytes"))
})

test("read: max_bytes is bounded imperatively", () => {
  for (const bad of [0, -1, 100, 1.5, MAX_MAX_BYTES + 1, "24000"]) {
    assert.ok(!readItems(board(), ["WI-001"], { max_bytes: bad }).ok)
  }
})

test("read: the no-snapshot limitation is stated in the payload, not hidden (I-277)", () => {
  const r = readItems(board(), ["WI-001"])
  assert.ok(r.ok, r.error)
  assert.ok(r.text.includes("Not a snapshot"))
})

// ── nearest-items advisory (replaces the threshold check) ─────────────────────

test("nearest surfaces a re-file the OLD threshold check would have stayed silent about", () => {
  // The removed check was: title-token Jaccard ≥ 0.5 ⇒ warn. Reproduced here
  // verbatim, so this is a measured comparison rather than a claim about a
  // deleted function. A genuine re-file of WI-003 in different words scores
  // 0.25 under it — silence — while the rank-based advisory puts the real
  // item at position 1.
  const oldCheck = (a, b) => {
    const w = (t) => new Set(t.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    const [x, y] = [w(a), w(b)]
    let shared = 0
    for (const t of x) if (y.has(t)) shared++
    return shared / (x.size + y.size - shared)
  }
  const refile = "board read tool is missing"
  assert.ok(oldCheck(refile, board()[2].title) < 0.5) // would have warned about NOTHING

  const near = nearestItems(board(), refile, 3)
  assert.ok(near.length > 0)
  assert.equal(near[0].id, "WI-003")
})

test("nearest caps at n and orders by score", () => {
  const near = nearestItems(board(), "the proposal push board tool", 3)
  assert.ok(near.length <= 3)
  for (let i = 1; i < near.length; i++) {
    assert.ok(near[i - 1].score >= near[i].score)
  }
})

test("nearest returns nothing when the title shares no vocabulary at all", () => {
  assert.deepEqual(nearestItems(board(), "chromodynamics"), [])
  assert.equal(formatNearest([]), "")
})

test("nearest: the rendering is advisory in its wording, not a warning", () => {
  const text = formatNearest(nearestItems(board(), "board read tool is missing", 3))
  assert.ok(text.includes("NOT a duplicate verdict"))
  assert.ok(!text.includes("⚠"))
  assert.ok(text.includes("hive_board_read"))
})

test("scoring is deterministic and bounded", () => {
  const s = scoreItem(board()[2], new Set(["board", "read", "tool"]))
  assert.ok(s > 0)
  assert.ok(s <= 1.25)
})

// ── the no-verdict / no-threshold CLAIM travels to the B4 descriptions ────────
// The coordinator's B3 brief: assert the tool text SAYS no verdict/no
// threshold, so the claim cannot quietly drop between module and tools.
test("rank/verbatim claims present in every user-facing string the module emits", () => {
  const search = searchBoard(board(), "push opt-out toggle")
  assert.ok(search.ok)
  assert.ok(search.text.includes("not a duplicate verdict")) // search says it

  const near = formatNearest(nearestItems(board(), "board read tool is missing", 3))
  assert.ok(near.includes("NOT a duplicate verdict")) // the advisory says it

  const list = listBoard(board(), { status: "in_progress", owner: "none" })
  assert.ok(!list.ok)
  assert.ok(list.error.includes("LEGAL, never what is STORED")) // the refusal says it
})
