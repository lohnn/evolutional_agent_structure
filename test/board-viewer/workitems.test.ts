import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import {
  lineageSessions,
  loadWorkItems,
  parseWorkItem,
  sortForColumn,
} from "../../src/board-viewer/data/workitems"

const FIXTURES = path.join(import.meta.dir, "..", "..", "fixtures", "board")

describe("fixture coverage — every SCHEMA state (via owner's board-store parser)", () => {
  const items = loadWorkItems(FIXTURES)
  const byId = new Map(items.map((i) => [i.id, i]))

  // WI-008/WI-009 added with WI-064 (spec revisions). WI-008 also ships a
  // revision-archive DIRECTORY, so this doubles as the SCHEMA §1 claim that
  // enumeration ignores it: the /^WI-\d+\.md$/ filter never matches a bare
  // directory name, so `board/WI-008/` must not appear as a tenth item.
  test("all nine fixtures load, and the revision directory is not one of them", () => {
    expect(items).toHaveLength(9)
    expect(items.map((i) => i.id).sort()).toEqual([
      "WI-001", "WI-002", "WI-003", "WI-004", "WI-005", "WI-006", "WI-007", "WI-008", "WI-009",
    ])
  })

  test("WI-001 backlog", () => {
    const i = byId.get("WI-001")!
    expect(i.status).toBe("backlog")
    expect(i.owner_session).toBeNull() // literal null scalar
    expect(i.tags).toEqual(["fleet-view", "ui"])
    expect(i.priority).toBe("low")
    expect(i.problems).toEqual([])
    expect(i.body).toContain("Grafana-style")
  })

  test("WI-002 todo, empty flow-form subtasks, birth transition (from: null, no session)", () => {
    const i = byId.get("WI-002")!
    expect(i.status).toBe("todo")
    expect(i.subtasks).toEqual([])
    expect(i.transitions).toHaveLength(2)
    expect(i.transitions[0]).toEqual({
      at: "2026-07-09T08:00:00Z",
      from: null, // birth entry — transition into existence
      to: "backlog",
      by: "hive_board_create",
      // session key omitted entirely (board-side op)
    })
    expect(i.transitions[0]!.session).toBeUndefined()
    expect(i.problems).toEqual([])
  })

  test("WI-003 in_progress with subtasks + owner", () => {
    const i = byId.get("WI-003")!
    expect(i.status).toBe("in_progress")
    expect(i.paused).toBe(false)
    expect(i.owner_session).toBe("ses_0b54b8cf4ffe9RoaO0Ga9OuBBF")
    expect(i.subtasks).toHaveLength(4)
    expect(i.subtasks[2]!.content).toBe("Render kanban columns, with commas, quoted")
    expect(i.subtasks[2]!.status).toBe("in_progress")
    expect(i.problems).toEqual([])
    // owner appears in transitions but is NOT lineage
    expect(lineageSessions(i)).toEqual([])
  })

  test("WI-004 in_progress + paused sub-state", () => {
    const i = byId.get("WI-004")!
    expect(i.status).toBe("in_progress")
    expect(i.paused).toBe(true)
    expect(i.problems).toEqual([])
  })

  test("WI-005 done via DRM with cached artifacts", () => {
    const i = byId.get("WI-005")!
    expect(i.status).toBe("done")
    expect(i.dream_id).toBe("DRM-036")
    expect(i.artifacts).toEqual(["I-141", "I-142", "W-061", "SNG-038"])
    expect(i.done_without_dream).toBe(false)
    expect(i.problems).toEqual([])
  })

  test("WI-006 done_without_dream escape hatch", () => {
    const i = byId.get("WI-006")!
    expect(i.status).toBe("done")
    expect(i.dream_id).toBeNull()
    expect(i.done_without_dream).toBe(true)
    expect(i.problems).toEqual([])
  })

  test("WI-007 demoted: tombstone + lineage from transitions[]", () => {
    const i = byId.get("WI-007")!
    expect(i.status).toBe("todo")
    expect(i.released_sessions).toEqual(["ses_fixture_released_owner00"])
    expect(i.owner_session).toBeNull()
    expect(lineageSessions(i)).toEqual(["ses_fixture_released_owner00"])
    expect(i.spec_hash).toBe("b6d411")
  })
})

describe("invariant surfacing (W-030 — view-side, on top of owner's parse)", () => {
  test("in_progress without owner_session", () => {
    const i = parseWorkItem("---\nid: WI-099\ntitle: x\nstatus: in_progress\n---\n")
    expect(i.problems.some((p) => p.includes("invariant 1"))).toBe(true)
  })
  test("done without dream or escape hatch", () => {
    const i = parseWorkItem("---\nid: WI-098\ntitle: x\nstatus: done\n---\n")
    expect(i.problems.some((p) => p.includes("invariant 2"))).toBe(true)
  })
  test("owner without group_id", () => {
    const i = parseWorkItem(
      "---\nid: WI-096\ntitle: x\nstatus: in_progress\nowner_session: ses_x\n---\n",
    )
    expect(i.problems.some((p) => p.includes("invariant 3"))).toBe(true)
  })
  test("unknown status is normalized to backlog by the OWNER's parser (its canon)", () => {
    const i = parseWorkItem("---\nid: WI-097\ntitle: x\nstatus: doing\n---\n")
    expect(i.status).toBe("backlog")
  })
})

describe("sortForColumn — full-precision recency (I-191/W-081)", () => {
  /**
   * Build an unowned Backlog/Todo item. `updated` is DATE-ONLY on purpose —
   * that is exactly the field whose coarseness caused the bug.
   */
  function item(
    id: string,
    priority: "high" | "medium" | "low",
    updated: string,
    transitionsAt: string[],
  ) {
    return parseWorkItem(
      [
        "---",
        `id: ${id}`,
        "title: x",
        "status: backlog",
        `priority: ${priority}`,
        `updated: ${updated}`,
        transitionsAt.length === 0
          ? "transitions: []"
          : ["transitions:", ...transitionsAt.map((at) => `  - { at: ${at}, to: backlog, by: t }`)].join(
              "\n",
            ),
        "---",
        "",
      ].join("\n"),
    )
  }

  const ids = (items: ReturnType<typeof item>[]) => sortForColumn(items).map((i) => i.id)

  test("priority still dominates recency", () => {
    const older = item("WI-001", "high", "2026-01-01", ["2026-01-01T00:00:00Z"])
    const newer = item("WI-002", "low", "2026-08-03", ["2026-08-03T12:00:00Z"])
    expect(ids([newer, older])).toEqual(["WI-001", "WI-002"])
  })

  test("same-day items order by transitions[].at, not by insertion order", () => {
    // THE BUG: both `updated: 2026-08-03`. Before the fix these compared equal
    // and JS sort fell back to the order readdir happened to return.
    const early = item("WI-051", "high", "2026-08-03", ["2026-08-03T08:00:00Z"])
    const late = item("WI-052", "high", "2026-08-03", ["2026-08-03T19:30:00Z"])
    // Newest first, in BOTH input orders — the property insertion order breaks.
    expect(ids([early, late])).toEqual(["WI-052", "WI-051"])
    expect(ids([late, early])).toEqual(["WI-052", "WI-051"])
  })

  test("the log is not assumed sorted — the MAX at wins", () => {
    const a = item("WI-010", "medium", "2026-08-03", [
      "2026-08-03T20:00:00Z",
      "2026-08-03T09:00:00Z", // out of order on purpose
    ])
    const b = item("WI-011", "medium", "2026-08-03", ["2026-08-03T12:00:00Z"])
    expect(ids([b, a])).toEqual(["WI-010", "WI-011"])
  })

  test("empty transitions[] falls back to date-only `updated`, never crashes", () => {
    const noLog = item("WI-020", "medium", "2026-08-02", [])
    const withLog = item("WI-021", "medium", "2026-08-01", ["2026-08-01T23:59:59Z"])
    expect(ids([withLog, noLog])).toEqual(["WI-020", "WI-021"])
  })

  test("a genuine tie breaks deterministically on id, never on input order", () => {
    const a = item("WI-030", "medium", "2026-08-03", ["2026-08-03T10:00:00Z"])
    const b = item("WI-031", "medium", "2026-08-03", ["2026-08-03T10:00:00Z"])
    expect(ids([a, b])).toEqual(["WI-031", "WI-030"])
    expect(ids([b, a])).toEqual(["WI-031", "WI-030"])
  })

  test("sortForColumn does not mutate its input", () => {
    const input = [
      item("WI-040", "low", "2026-08-01", ["2026-08-01T01:00:00Z"]),
      item("WI-041", "high", "2026-08-01", ["2026-08-01T02:00:00Z"]),
    ]
    const before = input.map((i) => i.id)
    sortForColumn(input)
    expect(input.map((i) => i.id)).toEqual(before)
  })
})

describe("loadWorkItems directory semantics", () => {
  test("missing board directory renders as empty board, not an error", () =>
    expect(loadWorkItems("/nonexistent/board")).toEqual([]))

  test("non-WI files (README, .locks-style strays) are ignored", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-board-test-"))
    try {
      fs.writeFileSync(path.join(dir, "README.md"), "# not an item")
      fs.writeFileSync(path.join(dir, "WI-010.md"), "---\nid: WI-010\ntitle: x\nstatus: backlog\n---\n")
      fs.mkdirSync(path.join(dir, ".locks"))
      const items = loadWorkItems(dir)
      expect(items.map((i) => i.id)).toEqual(["WI-010"])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
