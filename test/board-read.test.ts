/**
 * WI-068 — the board READ surface (list / search / read + the create advisory).
 *
 * ── Why this file carries the whole verification burden ─────────────────────
 * Tool code and tool DESCRIPTIONS freeze at opencode process load, and the
 * restart that makes a change live kills the session that would verify it
 * (W-127). `src/lib/board-read.ts` is therefore a pure module over an in-memory
 * `WorkItem[]`: every filter, refusal, ranking and budget decision is decided
 * here and can be exercised with no restart, no board on disk, and no plugin
 * host. What CANNOT be verified this way is exactly one thing — whether a model
 * reads the finished descriptions correctly — and no amount of unit testing
 * would have told us that anyway.
 *
 * Assertions are on OBSERVED output, never on what a type or a description
 * claims (I-246): `tool.schema` rejects nothing at runtime, so a test that
 * trusts a declared enum is testing the advertisement, not the guard.
 */
import { describe, test, expect } from "bun:test"
import type { WorkItem, WorkItemStatus, WorkItemPriority } from "../src/lib/board-store.ts"
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
} from "../src/lib/board-read.ts"

// ── Fixtures ─────────────────────────────────────────────────────────────────

function item(id: string, over: Partial<WorkItem> = {}): WorkItem {
  return {
    id,
    title: `Item ${id}`,
    status: "backlog" as WorkItemStatus,
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
    priority: "medium" as WorkItemPriority,
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
function board(): WorkItem[] {
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
        {
          at: "2026-08-04T08:35:24Z",
          from: "todo",
          to: "in_progress",
          by: "board:start",
          session: "ses_0341636700",
        },
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

// ── list ─────────────────────────────────────────────────────────────────────

describe("list — defaults and filtering", () => {
  test("defaults to live: done items are excluded and the exclusion is stated", () => {
    const r = listBoard(board())
    if (!r.ok) throw new Error(r.error)
    expect(r.matched.map((i) => i.id)).not.toContain("WI-004")
    expect(r.matched).toHaveLength(4)
    expect(r.text).toContain('status="all"')
  })

  test('status="all" is an explicit opt-in that brings done back', () => {
    const r = listBoard(board(), { status: "all" })
    if (!r.ok) throw new Error(r.error)
    expect(r.matched.map((i) => i.id)).toContain("WI-004")
    expect(r.matched).toHaveLength(5)
  })

  test("a single status filters to exactly it", () => {
    const r = listBoard(board(), { status: "todo" })
    if (!r.ok) throw new Error(r.error)
    expect(r.matched.map((i) => i.id)).toEqual(["WI-002"])
  })

  test("owner=none and owner=owned partition the board", () => {
    const none = listBoard(board(), { status: "all", owner: "none" })
    const owned = listBoard(board(), { status: "all", owner: "owned" })
    if (!none.ok || !owned.ok) throw new Error("unexpected refusal")
    expect(none.matched.map((i) => i.id).sort()).toEqual(["WI-001", "WI-002"])
    expect(owned.matched.map((i) => i.id).sort()).toEqual(["WI-003", "WI-004", "WI-005"])
  })

  test("priority filter", () => {
    const r = listBoard(board(), { status: "all", priority: "high" })
    if (!r.ok) throw new Error(r.error)
    expect(r.matched.map((i) => i.id).sort()).toEqual(["WI-001", "WI-004"])
  })

  test("ordering: in_progress first, then todo, backlog, done; priority then recency inside", () => {
    const r = listBoard(board(), { status: "all" })
    if (!r.ok) throw new Error(r.error)
    expect(r.matched.map((i) => i.id)).toEqual([
      "WI-003", // in_progress, medium
      "WI-005", // in_progress, low
      "WI-002", // todo
      "WI-001", // backlog
      "WI-004", // done
    ])
  })

  test("recency uses the full-precision transition stamp, not date-only `updated`", () => {
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
    if (!r.ok) throw new Error(r.error)
    expect(r.matched.map((i) => i.id)).toEqual(["WI-011", "WI-010"])
  })
})

describe("list — the cheapness promise", () => {
  test("NEVER renders a body, only its size", () => {
    const items = board()
    const r = listBoard(items, { status: "all" })
    if (!r.ok) throw new Error(r.error)
    for (const it of items) {
      if (it.body !== "") expect(r.text).not.toContain(it.body)
    }
    // WI-003's body is 90 bytes → shown as a size, not as text
    expect(r.text).toMatch(/WI-003.*\b90\b/)
  })

  test("the whole index of a 69-item board stays small", () => {
    const many = Array.from({ length: 69 }, (_, i) =>
      item(`WI-${String(i + 1).padStart(3, "0")}`, {
        title: "A reasonably descriptive work item title of typical length",
        body: "x".repeat(4000),
        tags: ["project", "component"],
      })
    )
    const r = listBoard(many, { status: "all" })
    if (!r.ok) throw new Error(r.error)
    // ~2.3k tokens was the measured budget; assert the byte analogue holds.
    expect(r.text.length).toBeLessThan(12_000)
  })

  test("limit truncates and SAYS SO by count", () => {
    const r = listBoard(board(), { status: "all", limit: 2 })
    if (!r.ok) throw new Error(r.error)
    expect(r.shown).toBe(2)
    expect(r.matched).toHaveLength(5)
    expect(r.text).toContain("3 more matched")
  })

  test("a legitimately empty result says the filters were valid", () => {
    const r = listBoard(board(), { status: "backlog", priority: "low" })
    if (!r.ok) throw new Error(r.error)
    expect(r.matched).toHaveLength(0)
    expect(r.text).toContain("the filters are valid")
  })
})

describe("list — runtime guards (the schema enforces NOTHING, W-125)", () => {
  test("an undeclared status value is refused, with the accepted set named", () => {
    const r = listBoard(board(), { status: "in-progress" })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain("BAD_ENUM")
    expect(r.error).toContain("live, all, backlog, todo, in_progress, done")
  })

  test("a value of the wrong TYPE is refused rather than coerced", () => {
    const r = listBoard(board(), { status: 3 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("BAD_ENUM")
  })

  test("owner and priority are guarded the same way", () => {
    const o = listBoard(board(), { owner: "ses_123" })
    const p = listBoard(board(), { priority: "urgent" })
    expect(o.ok).toBe(false)
    expect(p.ok).toBe(false)
    if (!o.ok) expect(o.error).toContain("any, owned, none")
    if (!p.ok) expect(p.error).toContain("any, low, medium, high")
  })

  test("limit rejects non-integer, negative and absurd values", () => {
    for (const bad of [0, -5, 2.5, 10_000, "8"]) {
      const r = listBoard(board(), { limit: bad })
      expect(r.ok).toBe(false)
    }
    const okr = listBoard(board(), { limit: 3 })
    expect(okr.ok).toBe(true)
  })

  test("undefined/omitted options fall back to the documented defaults", () => {
    const a = listBoard(board(), {})
    const b = listBoard(board(), { status: undefined, owner: undefined, priority: undefined })
    if (!a.ok || !b.ok) throw new Error("unexpected refusal")
    expect(a.text).toBe(b.text)
  })
})

describe("list — impossible combinations hard-error (I-050)", () => {
  test("in_progress + owner=none refuses instead of returning []", () => {
    const r = listBoard(board(), { status: "in_progress", owner: "none" })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain("IMPOSSIBLE_FILTER")
    expect(r.error).toContain("invariant 1")
  })

  test("…and it still tells a violation-hunter how to hunt (illegal states DO reach disk)", () => {
    const r = listBoard(board(), { status: "in_progress", owner: "none" })
    if (r.ok) throw new Error("expected refusal")
    expect(r.error).toContain("WI-065")
    expect(r.error).toContain("owner column")
  })

  test("backlog/todo + owner=owned refuses in the other direction", () => {
    for (const status of ["backlog", "todo"]) {
      const r = listBoard(board(), { status, owner: "owned" })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain("IMPOSSIBLE_FILTER")
    }
  })

  test("the combinations that ARE possible are not refused", () => {
    for (const opts of [
      { status: "in_progress", owner: "owned" },
      { status: "done", owner: "none" },
      { status: "all", owner: "none" },
      { status: "live", owner: "owned" },
    ]) {
      expect(listBoard(board(), opts).ok).toBe(true)
    }
  })
})

// ── search ───────────────────────────────────────────────────────────────────

describe("search — ranking, not thresholding", () => {
  test("puts the right item at rank 1 for a phrasing that shares no full title", () => {
    const r = searchBoard(board(), "no way to read work items from the board")
    if (!r.ok) throw new Error(r.error)
    expect(r.hits[0]!.id).toBe("WI-003")
  })

  test("spans ALL statuses — done work stays findable", () => {
    const r = searchBoard(board(), "dream artifact ranking")
    if (!r.ok) throw new Error(r.error)
    expect(r.hits.map((h) => h.id)).toContain("WI-004")
  })

  test("matches on body text, not just titles", () => {
    const r = searchBoard(board(), "GetProposals endpoint shape")
    if (!r.ok) throw new Error(r.error)
    expect(r.hits[0]!.id).toBe("WI-002")
  })

  test("a title hit outranks the same word buried in a body", () => {
    const items = [
      item("WI-020", { title: "Nothing relevant here", body: "a".repeat(50) + " telemetry " + "b".repeat(50) }),
      item("WI-021", { title: "Telemetry pipeline", body: "unrelated prose about other matters entirely" }),
    ]
    const r = searchBoard(items, "telemetry")
    if (!r.ok) throw new Error(r.error)
    expect(r.hits[0]!.id).toBe("WI-021")
  })

  test("k bounds the shortlist and defaults to 8", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      item(`WI-${String(i + 1).padStart(3, "0")}`, { title: "shared vocabulary board tooling" })
    )
    const def = searchBoard(many, "board tooling")
    const three = searchBoard(many, "board tooling", { k: 3 })
    if (!def.ok || !three.ok) throw new Error("unexpected refusal")
    expect(def.hits).toHaveLength(8)
    expect(three.hits).toHaveLength(3)
    expect(three.scored).toBe(40)
    expect(three.text).toContain("3 of 40")
  })

  test("scores are reported so the caller can judge, and are never a verdict", () => {
    const r = searchBoard(board(), "push opt-out toggle")
    if (!r.ok) throw new Error(r.error)
    expect(r.hits[0]!.score).toBeGreaterThan(0)
    expect(r.text).toContain("not a duplicate verdict")
  })

  test("excerpt windows on the match rather than always showing the head", () => {
    const long = item("WI-030", {
      title: "Long spec",
      body: "PREFACE. " + "filler ".repeat(60) + " the SENTINEL clause lives here " + "tail ".repeat(60),
    })
    const r = searchBoard([long], "sentinel")
    if (!r.ok) throw new Error(r.error)
    expect(r.hits[0]!.excerpt).toContain("SENTINEL")
    expect(r.hits[0]!.excerpt.startsWith("…")).toBe(true)
  })

  test("an empty-bodied item is labelled rather than shown as blank", () => {
    const r = searchBoard(board(), "empty placeholder live session")
    if (!r.ok) throw new Error(r.error)
    expect(r.hits[0]!.excerpt).toContain("placeholder item")
  })
})

describe("search — guards and honest emptiness", () => {
  test("a missing or blank query is refused with the alternative named", () => {
    for (const q of [undefined, "", "   ", 42]) {
      const r = searchBoard(board(), q)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain("hive_board_list")
    }
  })

  test("a query with no 3+ character token is refused, not silently scored as zero", () => {
    const r = searchBoard(board(), "a is of")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("NO_USABLE_TOKENS")
      expect(r.error).toContain("db, id, ui, os") // the known limitation, stated
    }
  })

  test("k is bounded imperatively", () => {
    for (const bad of [0, -1, 1.5, MAX_K + 1, "8"]) {
      expect(searchBoard(board(), "board", { k: bad }).ok).toBe(false)
    }
  })

  test("zero hits is explained as a REAL empty, with the tokens that were used", () => {
    const r = searchBoard(board(), "quantum chromodynamics")
    if (!r.ok) throw new Error(r.error)
    expect(r.hits).toHaveLength(0)
    expect(r.text).toContain("quantum")
    expect(r.text).toContain("real empty result")
  })
})

// ── read ─────────────────────────────────────────────────────────────────────

describe("read — named ids, full specs", () => {
  test("renders the body in full", () => {
    const r = readItems(board(), ["WI-003"])
    if (!r.ok) throw new Error(r.error)
    expect(r.text).toContain("There is no sanctioned way to READ the board.")
    expect(r.found).toEqual(["WI-003"])
  })

  test("subtasks and todo_mirror are SEPARATE and each labelled with its write class", () => {
    const r = readItems(board(), ["WI-003"])
    if (!r.ok) throw new Error(r.error)
    expect(r.text).toContain("measure the corpus")
    expect(r.text).toContain("write board-read.ts")
    expect(r.text).toMatch(/subtasks — author-written plan, canonical/)
    expect(r.text).toMatch(/todo_mirror — the OWNING SESSION's live TodoWrite, a rebuildable cache/)
    expect(r.text).toContain("2026-08-04T12:31:22.098Z") // the mirror's own stamp
  })

  test("history is summarised from the item's own append-only log", () => {
    const r = readItems(board(), ["WI-003"])
    if (!r.ok) throw new Error(r.error)
    expect(r.text).toContain("2 entries")
    expect(r.text).toContain("todo → in_progress")
  })

  test("an empty body is explained, not rendered as blank", () => {
    const r = readItems(board(), ["WI-005"])
    if (!r.ok) throw new Error(r.error)
    expect(r.text).toContain("spec body: EMPTY")
    expect(r.text).toContain("session-first")
  })

  test("accepts a comma/space string as well as an array, and de-duplicates", () => {
    const a = readItems(board(), "WI-001, WI-002")
    const b = readItems(board(), ["WI-001", "WI-002", "WI-001"])
    if (!a.ok || !b.ok) throw new Error("unexpected refusal")
    expect(a.found).toEqual(["WI-001", "WI-002"])
    expect(b.found).toEqual(["WI-001", "WI-002"])
  })

  test("zero-padding and case are forgiven", () => {
    expect(normaliseItemId("wi-3")).toBe("WI-003")
    expect(normaliseItemId(" WI-0003 ")).toBe("WI-003")
    expect(normaliseItemId("WI-1234")).toBe("WI-1234")
    expect(normaliseItemId("WI-abc")).toBeNull()
    const r = readItems(board(), ["wi-3"])
    if (!r.ok) throw new Error(r.error)
    expect(r.found).toEqual(["WI-003"])
  })
})

describe("read — nothing disappears silently", () => {
  test("an unknown id is reported BY NAME", () => {
    const r = readItems(board(), ["WI-003", "WI-999"])
    if (!r.ok) throw new Error(r.error)
    expect(r.missing).toEqual(["WI-999"])
    expect(r.text).toContain("Not found on the board: WI-999")
    expect(r.found).toEqual(["WI-003"])
  })

  test("all-unknown is a lookup failure, not an empty board", () => {
    const r = readItems(board(), ["WI-998", "WI-999"])
    if (!r.ok) throw new Error(r.error)
    expect(r.found).toEqual([])
    expect(r.text).toContain("lookup failure")
  })

  test("a malformed id is refused (not guessed at) with the shape named", () => {
    const r = readItems(board(), ["WI-003", "the read tool one"])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("BAD_ID")
      expect(r.error).toContain("WI-NNN")
    }
  })

  test("no ids at all is refused with the discovery tools named", () => {
    for (const ids of [undefined, [], "", "  ,  "]) {
      const r = readItems(board(), ids)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain("hive_board_search")
    }
  })
})

describe("read — the byte budget", () => {
  const fat = (id: string) => item(id, { title: `Fat ${id}`, body: "x".repeat(9000) })

  test("items past the budget are DEFERRED BY NAME, never dropped", () => {
    const items = [fat("WI-101"), fat("WI-102"), fat("WI-103")]
    const r = readItems(items, ["WI-101", "WI-102", "WI-103"], { max_bytes: 12_000 })
    if (!r.ok) throw new Error(r.error)
    expect(r.found).toEqual(["WI-101"])
    expect(r.deferred).toEqual(["WI-102", "WI-103"])
    expect(r.text).toContain("NOT included: WI-102, WI-103")
    expect(r.text).not.toContain("Fat WI-102")
  })

  test("the budget is actually respected", () => {
    const items = Array.from({ length: 10 }, (_, i) => fat(`WI-${200 + i}`))
    const r = readItems(items, items.map((i) => i.id), { max_bytes: 20_000 })
    if (!r.ok) throw new Error(r.error)
    expect(r.bytes).toBeLessThan(21_500) // payload + the head block
    expect(r.found.length + r.deferred.length).toBe(10)
  })

  test("a single oversized item is emitted TRUNCATED and says so, rather than vanishing", () => {
    const r = readItems([fat("WI-300")], ["WI-300"], { max_bytes: 1000 })
    if (!r.ok) throw new Error(r.error)
    expect(r.found).toEqual(["WI-300"])
    expect(r.text).toContain("TRUNCATED")
    expect(r.text).toContain("larger max_bytes")
  })

  test("max_bytes is bounded imperatively", () => {
    for (const bad of [0, -1, 100, 1.5, MAX_MAX_BYTES + 1, "24000"]) {
      expect(readItems(board(), ["WI-001"], { max_bytes: bad }).ok).toBe(false)
    }
  })

  test("the no-snapshot limitation is stated in the payload, not hidden (I-277)", () => {
    const r = readItems(board(), ["WI-001"])
    if (!r.ok) throw new Error(r.error)
    expect(r.text).toContain("Not a snapshot")
  })
})

// ── create-time advisory ─────────────────────────────────────────────────────

describe("nearest-items advisory (replaces the threshold check)", () => {
  test("surfaces a re-file the OLD threshold check would have stayed silent about", () => {
    // The removed check was: title-token Jaccard ≥ 0.5 ⇒ warn. Reproduced here
    // verbatim, so this is a measured comparison rather than a claim about a
    // deleted function. A genuine re-file of WI-003 in different words scores
    // 0.25 under it — silence — while the rank-based advisory puts the real
    // item at position 1.
    const oldCheck = (a: string, b: string) => {
      const w = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]+/g) ?? [])
      const [x, y] = [w(a), w(b)]
      let shared = 0
      for (const t of x) if (y.has(t)) shared++
      return shared / (x.size + y.size - shared)
    }
    const refile = "board read tool is missing"
    expect(oldCheck(refile, board()[2]!.title)).toBeLessThan(0.5) // would have warned about NOTHING

    const near = nearestItems(board(), refile, 3)
    expect(near.length).toBeGreaterThan(0)
    expect(near[0]!.id).toBe("WI-003")
  })

  test("caps at n and orders by score", () => {
    const near = nearestItems(board(), "the proposal push board tool", 3)
    expect(near.length).toBeLessThanOrEqual(3)
    for (let i = 1; i < near.length; i++) {
      expect(near[i - 1]!.score).toBeGreaterThanOrEqual(near[i]!.score)
    }
  })

  test("returns nothing when the title shares no vocabulary at all", () => {
    expect(nearestItems(board(), "chromodynamics")).toEqual([])
    expect(formatNearest([])).toBe("")
  })

  test("the rendering is advisory in its wording, not a warning", () => {
    const text = formatNearest(nearestItems(board(), "board read tool is missing", 3))
    expect(text).toContain("NOT a duplicate verdict")
    expect(text).not.toContain("⚠")
    expect(text).toContain("hive_board_read")
  })

  test("scoring is deterministic and bounded", () => {
    const s = scoreItem(board()[2]!, new Set(["board", "read", "tool"]))
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThanOrEqual(1.25)
  })
})
