import { describe, expect, test } from "bun:test"
import * as path from "node:path"
import { buildBoard } from "../../src/board-viewer/data/board"
import type { SessionMirror } from "../../src/board-viewer/data/sessions"
import { loadWorkItems, parseWorkItem, type WorkItem } from "../../src/board-viewer/data/workitems"

const FIXTURES = path.join(import.meta.dir, "..", "..", "fixtures", "board")

function mirror(cards: { id: string; title: string }[]): SessionMirror {
  return {
    available: true,
    computedAt: "2026-07-10T12:00:00Z",
    totalPersisted: cards.length,
    awakeIds: cards.length,
    awakeDeleted: 0,
    cards: cards.map((c) => ({
      id: c.id,
      title: c.title,
      created: "2026-07-10T00:00:00Z",
      updated: "2026-07-10T00:00:00Z",
      openUrl: `http://gui/?session=${c.id}`,
    })),
    persistedIds: cards.map((c) => c.id),
  }
}

describe("buildBoard — column mapping (SCHEMA §3)", () => {
  const items = loadWorkItems(FIXTURES)
  const board = buildBoard(items, mirror([]))

  test("columns", () => {
    expect(board.backlog.map((i) => i.id)).toEqual(["WI-001"])
    expect(board.todo.map((i) => i.id)).toEqual(["WI-002", "WI-007"]) // high before medium
    expect(board.inProgress.map((i) => i.id).sort()).toEqual(["WI-003", "WI-004"])
    expect(board.done.map((i) => i.id).sort()).toEqual(["WI-005", "WI-006"])
  })
})

describe("buildBoard — session-mirror merge (keyed on owner_session)", () => {
  const items = loadWorkItems(FIXTURES)

  test("mirror card claimed by an item's owner_session is suppressed", () => {
    const m = mirror([
      { id: "ses_0b54b8cf4ffe9RoaO0Ga9OuBBF", title: "Implementing HIVE-board" }, // WI-003 owner
      { id: "ses_unclaimed_000000000000000", title: "Some fresh session" },
    ])
    const board = buildBoard(items, m)
    expect(board.sessionOnly.map((c) => c.id)).toEqual(["ses_unclaimed_000000000000000"])
  })

  test("released (tombstoned) session does not resurrect as a card (§5.5)", () => {
    const m = mirror([{ id: "ses_fixture_released_owner00", title: "Old detached session" }])
    const board = buildBoard(items, m)
    expect(board.sessionOnly).toEqual([])
  })

  test("done item's owner is suppressed too — finished work, not unregistered", () => {
    const m = mirror([{ id: "ses_fixture_done_owner0000000", title: "Done owner" }])
    expect(buildBoard(items, m).sessionOnly).toEqual([])
  })

  test("empty board: every mirror card is session-only", () => {
    const m = mirror([{ id: "ses_a", title: "A" }, { id: "ses_b", title: "B" }])
    const board = buildBoard([], m)
    expect(board.sessionOnly).toHaveLength(2)
    expect(board.backlog).toEqual([])
    expect(board.inProgress).toEqual([])
  })
})

describe("buildBoard — In Progress / Done sort newest-first by transitions[].at", () => {
  // Build an in_progress item whose latest transition and `updated` can diverge.
  function ip(id: string, updated: string, transitionAts: string[]): WorkItem {
    const lines = transitionAts.map(
      (at) => `  - { at: ${at}, from: todo, to: in_progress, by: t, session: s_${id} }`,
    )
    return parseWorkItem(
      [
        "---",
        `id: ${id}`,
        `title: "${id}"`,
        "status: in_progress",
        `owner_session: s_${id}`,
        `group_id: s_${id}`,
        "origin: session-first",
        "paused: false",
        "spec_hash: null",
        "released_sessions: []",
        "dream_id: null",
        "artifacts: []",
        "created: 2026-07-21",
        `updated: ${updated}`,
        "priority: medium",
        "tags: []",
        "done_without_dream: false",
        "subtasks: []",
        "transitions:",
        ...lines,
        "---",
        "",
      ].join("\n"),
    )
  }

  test("same calendar day: newest transition wins over ascending id order (the bug)", () => {
    // All three share updated=2026-07-21 (date-only collision). By id-insertion
    // order the middle one would sink to the middle; by transition time WI-030
    // (14:00) must top, WI-010 (13:00) middle, WI-020 (09:00) last.
    const a = ip("WI-010", "2026-07-21", ["2026-07-21T13:00:00Z"])
    const b = ip("WI-020", "2026-07-21", ["2026-07-21T09:00:00Z"])
    const c = ip("WI-030", "2026-07-21", ["2026-07-21T14:00:00Z"])
    const board = buildBoard([a, b, c], mirror([]))
    expect(board.inProgress.map((i) => i.id)).toEqual(["WI-030", "WI-010", "WI-020"])
  })

  test("log is not assumed pre-sorted — max at is taken", () => {
    const a = ip("WI-010", "2026-07-21", ["2026-07-21T20:00:00Z", "2026-07-21T08:00:00Z"])
    const b = ip("WI-020", "2026-07-21", ["2026-07-21T09:00:00Z"])
    const board = buildBoard([a, b], mirror([]))
    expect(board.inProgress.map((i) => i.id)).toEqual(["WI-010", "WI-020"])
  })

  test("empty transitions[] falls back to date-only updated, then id — no crash/vanish", () => {
    const a = ip("WI-010", "2026-07-21", []) // no transitions
    const b = ip("WI-020", "2026-07-22", []) // newer updated
    const c = ip("WI-030", "2026-07-21", []) // same-day as a → id tiebreak (newest id first)
    const board = buildBoard([a, b, c], mirror([]))
    expect(board.inProgress.map((i) => i.id)).toEqual(["WI-020", "WI-030", "WI-010"])
    expect(board.inProgress).toHaveLength(3)
  })
})
