import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import {
  type WorkItem,
  parseWorkItem,
  serializeWorkItem,
  applyEditToContent,
  createItem,
  mutateItem,
  readItem,
  listItems,
  nextItemId,
  findItemByOwner,
  findItemReleasing,
  specHash,
  boardDir,
  nowIso,
  isPlaceholderTitle,
  refreshOwnerTitle,
  PLACEHOLDER_TITLE_RE,
} from "../src/lib/board-store.ts"

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-store-test-"))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function fullItem(): WorkItem {
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
      { content: "Add opt-out toggle, with \"comma, inside\"", status: "in_progress" },
    ],
    transitions: [
      { at: "2026-07-06T09:00:00Z", from: null, to: "todo", by: "board:create" },
      { at: "2026-07-06T10:00:00Z", from: "todo", to: "in_progress", by: "hive_board_bind", session: "ses_10a2114b3ffe" },
    ],
    body: "## Spec / notes\n\nFree-form markdown body with `code` and --- dashes.",
  }
}

describe("serialize + parse round-trip", () => {
  test("full item survives", () => {
    const item = fullItem()
    const parsed = parseWorkItem(serializeWorkItem(item))
    expect(parsed).toEqual({ ...item, body: item.body })
  })

  test("canonical shapes match SCHEMA §2", () => {
    const s = serializeWorkItem(fullItem())
    expect(s).toContain('title: "Add push-notification \\"opt-out\\" to settings"')
    expect(s).toContain("tags: [frontend, push]")
    expect(s).toContain("artifacts: [I-142, W-061]")
    expect(s).toContain("released_sessions: [ses_dead01, ses_dead02]")
    expect(s).toContain('  - { content: "Read current settings widget", status: completed }')
    expect(s).toContain("  - { at: 2026-07-06T09:00:00Z, from: null, to: todo, by: board:create }")
    expect(s).toContain(
      "  - { at: 2026-07-06T10:00:00Z, from: todo, to: in_progress, by: hive_board_bind, session: ses_10a2114b3ffe }"
    )
    // transitions is the LAST frontmatter field
    const fm = s.split("\n---\n")[0]!
    const lastField = fm.split("\n").filter((l) => /^[a-z_]+:/.test(l)).pop()
    expect(lastField).toBe("transitions:")
  })

  test("empty lists serialize as empty flow form", () => {
    const item = { ...fullItem(), subtasks: [], transitions: [], released_sessions: [], tags: [], artifacts: [] }
    const s = serializeWorkItem(item)
    expect(s).toContain("subtasks: []")
    expect(s).toContain("transitions: []")
    expect(s).toContain("released_sessions: []")
    const parsed = parseWorkItem(s)
    expect(parsed.subtasks).toEqual([])
    expect(parsed.transitions).toEqual([])
  })

  test("null fields emit literal null and parse back to null", () => {
    const item = { ...fullItem(), owner_session: null, group_id: null, spec_hash: null, dream_id: null }
    const s = serializeWorkItem(item)
    expect(s).toContain("owner_session: null")
    const parsed = parseWorkItem(s)
    expect(parsed.owner_session).toBeNull()
    expect(parsed.group_id).toBeNull()
    expect(parsed.spec_hash).toBeNull()
    expect(parsed.dream_id).toBeNull()
  })

  test("empty block-HEADER form parses to [] (hand-written / SCHEMA example shape)", () => {
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
    expect(parsed.subtasks).toEqual([])
    expect(parsed.transitions).toEqual([])
    expect(parsed.status).toBe("todo")

    // and header form with entries following still collects them
    const withEntries = content.replace(
      "transitions:",
      "transitions:\n  - { at: 2026-07-10T00:00:00Z, from: null, to: todo, by: hand }"
    )
    expect(parseWorkItem(withEntries).transitions.length).toBe(1)
  })

  test("appendTransition works on the empty block-header form", () => {
    const content = ["---", "id: WI-051", "status: todo", "transitions:", "---", "", "body"].join("\n")
    const next = applyEditToContent(content, {
      appendTransition: { at: "2026-07-10T00:00:00Z", from: "todo", to: "in_progress", by: "t", session: "ses_z" },
    })
    const parsed = parseWorkItem(next)
    expect(parsed.transitions.length).toBe(1)
    expect(parsed.transitions[0]!.session).toBe("ses_z")
    expect(next).toContain("transitions:\n  - { at: 2026-07-10T00:00:00Z, from: todo, to: in_progress, by: t, session: ses_z }")
  })

  test("appendReleasedSession on a file missing the field inserts it", () => {
    const content = ["---", "id: WI-052", "status: todo", "transitions:", "---", "", "body"].join("\n")
    const next = applyEditToContent(content, { appendReleasedSession: "ses_r" })
    expect(parseWorkItem(next).released_sessions).toEqual(["ses_r"])
  })

  test("permissive parse: minimal hand-written file gets defaults", () => {
    const parsed = parseWorkItem(`---\nid: WI-099\ntitle: bare title\n---\nbody here\n`)
    expect(parsed.id).toBe("WI-099")
    expect(parsed.status).toBe("backlog")
    expect(parsed.paused).toBe(false)
    expect(parsed.priority).toBe("medium")
    expect(parsed.tags).toEqual([])
    expect(parsed.transitions).toEqual([])
    expect(parsed.owner_session).toBeNull()
    expect(parsed.body).toBe("body here")
  })
})

describe("ids and file ops", () => {
  test("nextItemId: empty board → WI-001, then max+1", async () => {
    expect(nextItemId(dir)).toBe("WI-001")
    await createItem(dir, { ...fullItem(), transitions: [], subtasks: [] })
    expect(nextItemId(dir)).toBe("WI-002")
    fs.writeFileSync(path.join(boardDir(dir), "WI-041.md"), serializeWorkItem({ ...fullItem(), id: "WI-041" }))
    expect(nextItemId(dir)).toBe("WI-042")
  })

  test("createItem assigns id and writes; readItem/listItems round-trip", async () => {
    const created = await createItem(dir, { ...fullItem() })
    expect(created.id).toBe("WI-001")
    const read = readItem(dir, "WI-001")
    expect(read?.title).toBe(fullItem().title)
    expect(listItems(dir).length).toBe(1)
  })

  test("findItemByOwner and findItemReleasing", async () => {
    await createItem(dir, { ...fullItem() })
    expect(findItemByOwner(dir, "ses_10a2114b3ffe")?.id).toBe("WI-001")
    expect(findItemByOwner(dir, "ses_nope")).toBeNull()
    expect(findItemReleasing(dir, "ses_dead01")?.id).toBe("WI-001")
    expect(findItemReleasing(dir, "ses_alive")).toBeNull()
  })
})

describe("applyEditToContent — text surgery (I-049)", () => {
  const original = serializeWorkItem(fullItem())

  test("scalar patch touches only that line", () => {
    const next = applyEditToContent(original, { set: { status: "done" } })
    const a = original.split("\n")
    const b = next.split("\n")
    expect(b.length).toBe(a.length)
    const diffs = a.map((l, i) => (l !== b[i] ? i : -1)).filter((i) => i >= 0)
    expect(diffs.length).toBe(1)
    expect(b[diffs[0]!]).toBe("status: done")
  })

  test("appendTransition inserts after the last entry, prior bytes untouched", () => {
    const t = { at: "2026-07-08T12:00:00Z", from: "in_progress" as const, to: "done" as const, by: "test" }
    const next = applyEditToContent(original, { appendTransition: t })
    expect(next).toContain("  - { at: 2026-07-08T12:00:00Z, from: in_progress, to: done, by: test }")
    // every original line still present, in order
    const bLines = next.split("\n")
    let cursor = 0
    for (const line of original.split("\n")) {
      const idx = bLines.indexOf(line, cursor)
      expect(idx).toBeGreaterThanOrEqual(0)
      cursor = idx + 1
    }
    const parsed = parseWorkItem(next)
    expect(parsed.transitions.length).toBe(3)
    expect(parsed.transitions[2]!.by).toBe("test")
  })

  test("appendTransition converts `transitions: []` to block form", () => {
    const empty = serializeWorkItem({ ...fullItem(), transitions: [] })
    const next = applyEditToContent(empty, {
      appendTransition: { at: nowIso(), from: null, to: "backlog", by: "x" },
    })
    const parsed = parseWorkItem(next)
    expect(parsed.transitions.length).toBe(1)
    expect(parsed.transitions[0]!.from).toBeNull()
  })

  test("appendReleasedSession on empty and non-empty arrays", () => {
    const empty = serializeWorkItem({ ...fullItem(), released_sessions: [] })
    const one = applyEditToContent(empty, { appendReleasedSession: "ses_a" })
    expect(one).toContain("released_sessions: [ses_a]")
    const two = applyEditToContent(one, { appendReleasedSession: "ses_b" })
    expect(two).toContain("released_sessions: [ses_a, ses_b]")
    expect(parseWorkItem(two).released_sessions).toEqual(["ses_a", "ses_b"])
  })

  test("body and unknown hand-added fields survive edits byte-for-byte", () => {
    const withUnknown = original.replace("priority: medium", "priority: medium\nx_custom_field: kept")
    const next = applyEditToContent(withUnknown, {
      set: { paused: true },
      appendTransition: { at: nowIso(), from: "in_progress", to: "in_progress", by: "pause" },
    })
    expect(next).toContain("x_custom_field: kept")
    expect(next).toContain("Free-form markdown body with `code` and --- dashes.")
    expect(next).toContain("paused: true")
  })
})

describe("mutateItem + locking", () => {
  test("mutateItem stamps updated and persists", async () => {
    await createItem(dir, { ...fullItem(), updated: "2020-01-01" })
    const item = await mutateItem(dir, "WI-001", { set: { status: "todo" } })
    expect(item.status).toBe("todo")
    expect(item.updated).not.toBe("2020-01-01")
  })

  test("concurrent appends all land (advisory lock serializes writers)", async () => {
    await createItem(dir, { ...fullItem(), transitions: [] })
    const N = 12
    await Promise.all(
      Array.from({ length: N }, (_, k) =>
        mutateItem(dir, "WI-001", {
          appendTransition: { at: nowIso(), from: "todo", to: "in_progress", by: `writer-${k}` },
        })
      )
    )
    const item = readItem(dir, "WI-001")!
    expect(item.transitions.length).toBe(N)
    const bys = new Set(item.transitions.map((t) => t.by))
    expect(bys.size).toBe(N)
  })
})

describe("absorbed lineage key (Q15)", () => {
  test("transition with absorbed round-trips; emit places it last", () => {
    const item = {
      ...fullItem(),
      transitions: [
        { at: "2026-07-10T10:00:00Z", from: "todo" as const, to: "in_progress" as const, by: "hive_board_bind", session: "ses_x", absorbed: "WI-009" },
      ],
    }
    const s = serializeWorkItem(item)
    expect(s).toContain(
      "  - { at: 2026-07-10T10:00:00Z, from: todo, to: in_progress, by: hive_board_bind, session: ses_x, absorbed: WI-009 }"
    )
    const parsed = parseWorkItem(s)
    expect(parsed.transitions[0]!.absorbed).toBe("WI-009")
  })

  test("entries without absorbed stay byte-identical and parse with the key absent", () => {
    const s = serializeWorkItem(fullItem()) // no absorbed anywhere
    expect(s).not.toContain("absorbed")
    const parsed = parseWorkItem(s)
    for (const t of parsed.transitions) expect("absorbed" in t).toBe(false)
    // appending an absorbed-carrying entry leaves prior entries untouched
    const next = applyEditToContent(s, {
      appendTransition: { at: nowIso(), from: "todo", to: "in_progress", by: "b", session: "s", absorbed: "WI-003" },
    })
    for (const line of s.split("\n")) expect(next).toContain(line)
    const p2 = parseWorkItem(next)
    expect(p2.transitions[p2.transitions.length - 1]!.absorbed).toBe("WI-003")
  })
})

describe("listItemsInDir", () => {
  test("reads an arbitrary dir with the same filename filter", async () => {
    await createItem(dir, { ...fullItem() })
    fs.writeFileSync(path.join(boardDir(dir), "notes.md"), "not an item")
    const { listItemsInDir } = await import("../src/lib/board-store.ts")
    const items = listItemsInDir(boardDir(dir))
    expect(items.length).toBe(1)
    expect(items[0]!.id).toBe("WI-001")
    expect(listItemsInDir(path.join(dir, "missing"))).toEqual([])
  })
})

describe("specHash", () => {
  test("stable, trimmed, 12 hex chars", () => {
    expect(specHash("body")).toBe(specHash("  body \n"))
    expect(specHash("body")).toMatch(/^[0-9a-f]{12}$/)
    expect(specHash("a")).not.toBe(specHash("b"))
  })
})

describe("isPlaceholderTitle / PLACEHOLDER_TITLE_RE (the title contract)", () => {
  test("matches opencode's exact placeholder format", () => {
    expect(isPlaceholderTitle("New session - 2026-07-20T22:18:00.584Z")).toBe(true)
    expect(PLACEHOLDER_TITLE_RE.test("New session - 2026-07-20T22:18:00.584Z")).toBe(true)
    // millis-less variant tolerated (belt-and-braces)
    expect(isPlaceholderTitle("New session - 2026-07-20T22:18:00Z")).toBe(true)
  })
  test("empty / whitespace / null / undefined count as unsettled", () => {
    expect(isPlaceholderTitle("")).toBe(true)
    expect(isPlaceholderTitle("   ")).toBe(true)
    expect(isPlaceholderTitle(null)).toBe(true)
    expect(isPlaceholderTitle(undefined)).toBe(true)
  })
  test("real titles are NOT placeholders", () => {
    expect(isPlaceholderTitle("hive-board reload flicker and state reset")).toBe(false)
    // near-misses must not match
    expect(isPlaceholderTitle("New session about the migration")).toBe(false)
    expect(isPlaceholderTitle("Old session - 2026-07-20T22:18:00.584Z")).toBe(false)
  })
})

describe("refreshOwnerTitle (locked title tracking)", () => {
  test("patches a placeholder title to the real one for the owning session", async () => {
    await createItem(dir, {
      ...fullItem(),
      owner_session: "ses_own",
      title: "New session - 2026-07-20T22:18:00.584Z",
    })
    const patched = await refreshOwnerTitle(dir, "ses_own", "hive-board reload flicker fix")
    expect(patched).toBe("WI-001") // createItem assigns the next id, ignoring the passed one
    expect(findItemByOwner(dir, "ses_own")!.title).toBe("hive-board reload flicker fix")
  })

  test("no-op when the stored title is already settled (never clobbers)", async () => {
    await createItem(dir, { ...fullItem(), owner_session: "ses_own", title: "Real settled title" })
    const patched = await refreshOwnerTitle(dir, "ses_own", "some other title")
    expect(patched).toBeNull()
    expect(findItemByOwner(dir, "ses_own")!.title).toBe("Real settled title")
  })

  test("no-op when the incoming title is itself a placeholder", async () => {
    await createItem(dir, {
      ...fullItem(),
      owner_session: "ses_own",
      title: "New session - 2026-07-20T22:18:00.584Z",
    })
    const patched = await refreshOwnerTitle(dir, "ses_own", "New session - 2026-07-20T22:19:00.000Z")
    expect(patched).toBeNull()
    expect(isPlaceholderTitle(findItemByOwner(dir, "ses_own")!.title)).toBe(true)
  })

  test("no-op when no item owns the session", async () => {
    await createItem(dir, { ...fullItem(), owner_session: "ses_other", title: "New session - 2026-07-20T22:18:00.584Z" })
    expect(await refreshOwnerTitle(dir, "ses_nobody", "real title")).toBeNull()
  })

  test("only patches the frontmatter title field (surgical, other fields untouched)", async () => {
    await createItem(dir, {
      ...fullItem(),
      owner_session: "ses_own",
      title: "New session - 2026-07-20T22:18:00.584Z",
      status: "in_progress",
      dream_id: "DRM-041",
    })
    await refreshOwnerTitle(dir, "ses_own", "settled title")
    const item = findItemByOwner(dir, "ses_own")!
    expect(item.title).toBe("settled title")
    expect(item.status).toBe("in_progress")
    expect(item.dream_id).toBe("DRM-041")
  })
})
