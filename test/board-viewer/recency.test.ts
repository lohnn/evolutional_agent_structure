/**
 * RECENCY KEY — consolidation characterisation suite (W-113).
 *
 * `recencyKey` replaced THREE copies of the same "newest transitions[].at,
 * falling back to date-only `updated`" logic: data/board.ts#latestTransitionAt
 * (In Progress / Done), data/workitems.ts#latestTransitionAt (Backlog / Todo)
 * and an inline `latestAt` arrow inside web/render.ts#kanbanSection (the
 * In-Progress interleave).
 *
 * These tests were written BEFORE the extraction and passed against all three
 * originals, so they are a genuine behavioural diff and not a description of
 * the new code (W-113: diff the new rule against the old on the OLD rule's
 * hardest inputs before switching anything over). The hardest inputs are the
 * empty/degenerate logs, because that is exactly where the three copies looked
 * like they diverged.
 */
import { describe, expect, test } from "bun:test"
import { buildBoard } from "../../src/board-viewer/data/board"
import { recencyKey } from "../../src/board-viewer/data/recency"
import { parseWorkItem, sortForColumn } from "../../src/board-viewer/data/workitems"
import type { SessionMirror } from "../../src/board-viewer/data/sessions"

function item(
  id: string,
  opts: {
    status?: string
    priority?: string
    updated?: string
    at?: string[]
    owner?: string
  } = {},
) {
  const at = opts.at ?? []
  return parseWorkItem(
    [
      "---",
      `id: ${id}`,
      "title: x",
      `status: ${opts.status ?? "backlog"}`,
      `priority: ${opts.priority ?? "medium"}`,
      `updated: ${opts.updated ?? "2026-08-03"}`,
      ...(opts.owner ? [`owner_session: ${opts.owner}`, "group_id: g"] : []),
      at.length === 0
        ? "transitions: []"
        : ["transitions:", ...at.map((a) => `  - { at: ${a}, to: backlog, by: t }`)].join("\n"),
      "---",
      "",
    ].join("\n"),
  )
}

const NO_MIRROR: SessionMirror = {
  available: false,
  computedAt: "2026-08-03T00:00:00.000Z",
  totalPersisted: 0,
  awakeIds: 0,
  awakeDeleted: 0,
  cards: [],
  persistedIds: [],
}

describe("recencyKey — the contract the three copies shared", () => {
  test("returns the MAX transitions[].at, not the last one (log is not assumed sorted)", () => {
    expect(recencyKey(item("WI-001", { at: ["2026-08-03T20:00:00Z", "2026-08-03T09:00:00Z"] }))).toBe(
      "2026-08-03T20:00:00Z",
    )
  })

  test("HARDEST INPUT: empty transitions[] falls back to date-only `updated`", () => {
    // This is where the three copies APPEARED to disagree. board.ts's helper
    // returned "" and applied `|| updated` in its comparator; the other two
    // applied it inside the helper. Same observable key, different seam — the
    // consolidated helper is TOTAL, so the seam can no longer be forgotten.
    expect(recencyKey(item("WI-002", { updated: "2026-07-01", at: [] }))).toBe("2026-07-01")
  })

  test("HARDEST INPUT: transitions present but every `at` is empty ⇒ still `updated`", () => {
    // Constructed directly — the parser cannot produce a blank `at`.
    expect(
      recencyKey({
        updated: "2026-07-02",
        transitions: [{ at: "", from: null, to: "backlog", by: "t" }],
      }),
    ).toBe("2026-07-02")
  })

  test("HARDEST INPUT: no log AND no updated ⇒ empty key, never a throw", () => {
    expect(recencyKey({ updated: "", transitions: [] })).toBe("")
  })

  test("is a pure read — never mutates the item or its log", () => {
    const i = item("WI-005", { at: ["2026-08-03T10:00:00Z", "2026-08-01T10:00:00Z"] })
    const before = JSON.stringify(i)
    recencyKey(i)
    expect(JSON.stringify(i)).toBe(before)
  })
})

describe("consolidation preserved Backlog/Todo behaviour (was workitems.ts)", () => {
  const ids = (items: ReturnType<typeof item>[]) => sortForColumn(items).map((i) => i.id)

  test("priority still dominates recency", () => {
    const older = item("WI-001", { priority: "high", updated: "2026-01-01", at: ["2026-01-01T00:00:00Z"] })
    const newer = item("WI-002", { priority: "low", updated: "2026-08-03", at: ["2026-08-03T12:00:00Z"] })
    expect(ids([newer, older])).toEqual(["WI-001", "WI-002"])
  })

  test("an item with NO log sorts against one WITH a log by the fallback key", () => {
    // Mixed population — the case the fallback exists for. WI-010 has no log
    // so its key is "2026-08-02"; WI-011's key is its full-ISO at.
    const noLog = item("WI-010", { updated: "2026-08-02", at: [] })
    const withLog = item("WI-011", { updated: "2026-08-01", at: ["2026-08-01T23:59:59Z"] })
    expect(ids([withLog, noLog])).toEqual(["WI-010", "WI-011"])
    expect(ids([noLog, withLog])).toEqual(["WI-010", "WI-011"])
  })

  test("BOTH items missing a log still order deterministically by `updated` then id", () => {
    const a = item("WI-020", { updated: "2026-08-03", at: [] })
    const b = item("WI-021", { updated: "2026-08-03", at: [] })
    expect(ids([a, b])).toEqual(["WI-021", "WI-020"])
    expect(ids([b, a])).toEqual(["WI-021", "WI-020"])
  })
})

describe("consolidation preserved In Progress / Done behaviour (was board.ts)", () => {
  const inProgressIds = (items: ReturnType<typeof item>[]) =>
    buildBoard(items, NO_MIRROR).inProgress.map((i) => i.id)

  test("newest-first by max transitions[].at, in either input order", () => {
    const early = item("WI-050", {
      status: "in_progress",
      owner: "ses_a",
      updated: "2026-08-03",
      at: ["2026-08-03T08:00:00Z"],
    })
    const late = item("WI-051", {
      status: "in_progress",
      owner: "ses_b",
      updated: "2026-08-03",
      at: ["2026-08-03T19:30:00Z"],
    })
    expect(inProgressIds([early, late])).toEqual(["WI-051", "WI-050"])
    expect(inProgressIds([late, early])).toEqual(["WI-051", "WI-050"])
  })

  test("HARDEST INPUT: empty log in an owned column falls back to `updated` (board.ts's `|| a.updated` seam, now inside the helper)", () => {
    const noLog = item("WI-060", { status: "in_progress", owner: "ses_c", updated: "2026-08-05", at: [] })
    const withLog = item("WI-061", {
      status: "in_progress",
      owner: "ses_d",
      updated: "2026-08-01",
      at: ["2026-08-01T10:00:00Z"],
    })
    // "2026-08-05" > "2026-08-01T10:00:00Z" lexicographically, so the no-log
    // item leads. That is the PRE-EXISTING behaviour, preserved deliberately.
    expect(inProgressIds([withLog, noLog])).toEqual(["WI-060", "WI-061"])
    expect(inProgressIds([noLog, withLog])).toEqual(["WI-060", "WI-061"])
  })

  test("genuine tie breaks on id, never on input order", () => {
    const a = item("WI-070", {
      status: "in_progress",
      owner: "ses_e",
      updated: "2026-08-03",
      at: ["2026-08-03T10:00:00Z"],
    })
    const b = item("WI-071", {
      status: "in_progress",
      owner: "ses_f",
      updated: "2026-08-03",
      at: ["2026-08-03T10:00:00Z"],
    })
    expect(inProgressIds([a, b])).toEqual(["WI-071", "WI-070"])
    expect(inProgressIds([b, a])).toEqual(["WI-071", "WI-070"])
  })
})
