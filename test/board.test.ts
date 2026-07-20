import { describe, expect, test } from "bun:test"
import * as path from "node:path"
import { buildBoard } from "../src/data/board"
import type { SessionMirror } from "../src/data/sessions"
import { loadWorkItems } from "../src/data/workitems"

const FIXTURES = path.join(import.meta.dir, "..", "fixtures", "board")

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
