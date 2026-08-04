/**
 * SPEC REVISIONS — the consumer side of WI-064 (SCHEMA §4d).
 *
 * WI-064 added a new KIND of entry to a shared append-only log. That silently
 * changed the meaning of every existing reader of that log, and one of them —
 * `lineageSessions()` — began asserting something false: that whoever revised
 * a spec had previously ATTEMPTED the work and failed.
 *
 * These tests pin both halves of the obligation:
 *   1. a revision must not be read as a work attempt, and
 *   2. a revision must not be silently invisible either (W-103 — a tombstone,
 *      not an absence).
 *
 * DOM assertions parse with happy-dom and read specific nodes. `renderPage()
 * inlines its CSS, so `toContain` against rendered HTML false-matches class
 * names and prose inside CSS comments (W-095).
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import { specHash } from "../../src/lib/board-store"
import { buildBoard } from "../../src/board-viewer/data/board"
import { lineageSessions, specRevisions } from "../../src/board-viewer/data/lineage"
import type { SessionMirror } from "../../src/board-viewer/data/sessions"
import type { BoardState } from "../../src/board-viewer/data/state"
import { loadWorkItems, parseWorkItem } from "../../src/board-viewer/data/workitems"
import { renderBoardBody } from "../../src/board-viewer/web/render"

const FIXTURES = path.join(import.meta.dir, "..", "..", "fixtures", "board")
const items = loadWorkItems(FIXTURES)
const byId = new Map(items.map((i) => [i.id, i]))

const ATTEMPT = "ses_fixture_attempt_owner01"
const EDITOR = "ses_fixture_editor_000001"

describe("lineageSessions — a spec editor is not a failed attempt (SCHEMA §4d)", () => {
  test("the genuine prior attempt IS lineage", () => {
    expect(lineageSessions(byId.get("WI-008")!)).toContain(ATTEMPT)
  })

  test("the revising session is NOT lineage, though it is stamped on the log", () => {
    const item = byId.get("WI-008")!
    // Guard against a vacuous pass: the id really is present in transitions[],
    // so exclusion is the filter working, not the fixture lacking the case.
    expect(item.transitions.some((t) => t.session === EDITOR)).toBe(true)
    expect(lineageSessions(item)).not.toContain(EDITOR)
  })

  test("exactly the attempt, and nothing else", () => {
    expect(lineageSessions(byId.get("WI-008")!)).toEqual([ATTEMPT])
  })

  test("an item whose ONLY session-bearing entry is a revision has empty lineage", () => {
    const item = byId.get("WI-009")!
    expect(item.transitions.some((t) => t.session === EDITOR)).toBe(true)
    expect(lineageSessions(item)).toEqual([])
  })

  test("the discriminator is `superseded`, NOT the status self-loop", () => {
    // A same-status entry with a real session and NO `superseded` is still an
    // attempt. Keying on `from === to` would wrongly swallow it.
    const item = parseWorkItem(
      [
        "---",
        "id: WI-900",
        "title: x",
        "status: in_progress",
        "owner_session: ses_owner_current_0000000",
        "group_id: g",
        "transitions:",
        "  - { at: 2026-08-04T10:00:00Z, from: in_progress, to: in_progress, by: hive_board_pause, session: ses_other_worker_000000 }",
        "---",
        "",
      ].join("\n"),
    )
    expect(lineageSessions(item)).toEqual(["ses_other_worker_000000"])
  })

  test("the current owner is still excluded (pre-existing rule, unchanged)", () => {
    const item = parseWorkItem(
      [
        "---",
        "id: WI-901",
        "title: x",
        "status: in_progress",
        "owner_session: ses_owner_current_0000000",
        "group_id: g",
        "transitions:",
        "  - { at: 2026-08-04T10:00:00Z, from: todo, to: in_progress, by: hive_board_start, session: ses_owner_current_0000000 }",
        "---",
        "",
      ].join("\n"),
    )
    expect(lineageSessions(item)).toEqual([])
  })
})

describe("specRevisions — the tombstone (W-103)", () => {
  test("both revisions are reported, in log order", () => {
    const revs = specRevisions(byId.get("WI-008")!)
    expect(revs.map((r) => r.supersededHash)).toEqual(["6112ab181958", "e3b0c44298fc"])
    expect(revs[0]!.by).toBe("hive_board_respec:hive-infra")
    expect(revs[0]!.session).toBe(EDITOR)
  })

  test("a board-side revision with no session is still a revision", () => {
    const revs = specRevisions(byId.get("WI-008")!)
    expect(revs[1]!.session).toBeUndefined()
    expect(revs[1]!.by).toBe("board:respec")
  })

  test("a DANGLING pointer still counts — history is not tidied to render nicely", () => {
    // e3b0c44298fc is sha256("") with no payload behind it. Suppressing it
    // would hide a revision that genuinely happened (I-049 append-only).
    const revs = specRevisions(byId.get("WI-008")!)
    expect(revs).toHaveLength(2)
    expect(fs.existsSync(path.join(FIXTURES, "WI-008", "e3b0c44298fc.md"))).toBe(false)
  })

  test("never-revised items report nothing", () => {
    for (const id of ["WI-001", "WI-002", "WI-005"]) {
      expect(specRevisions(byId.get(id)!)).toEqual([])
    }
  })

  test("the archived payload is self-verifying — it re-hashes to its filename", () => {
    const p = path.join(FIXTURES, "WI-008", "6112ab181958.md")
    const body = fs.readFileSync(p, "utf8").replace(/^\n+/, "").replace(/\s+$/, "")
    expect(specHash(body)).toBe("6112ab181958")
  })
})

describe("rendering — visible as a revision, never as an attempt", () => {
  beforeAll(() => GlobalRegistrator.register())
  afterAll(() => GlobalRegistrator.unregister())

  const mirror: SessionMirror = {
    available: true,
    computedAt: "2026-08-04T12:00:00Z",
    totalPersisted: 2,
    awakeIds: 0,
    awakeDeleted: 0,
    cards: [],
    persistedIds: [ATTEMPT, EDITOR],
    sessionTitles: {},
  }

  function board(): Document {
    const state: BoardState = {
      workspaceRoot: "/workspace",
      generatedAt: "2026-08-04T12:00:00Z",
      buildSha: "testsha",
      guiBaseUrl: "http://gui",
      writesEnabled: false,
      sessionBackend: "unconfigured",
      items,
      board: buildBoard(items, mirror),
      capabilities: [],
      dreams: {
        artifactCounts: { insight: 0, warning: 0, songline: 0, shadow: 0, total: 0 },
        active: [],
        history: [],
        recentArtifacts: [],
      },
      messages: [],
      sessions: mirror,
      promoteDecisions: {},
      todoSubStates: {},
      actionRequired: {},
      sessionStatus: {},
    }
    const doc = document.implementation.createHTMLDocument("t")
    doc.body.innerHTML = renderBoardBody(state)
    return doc
  }

  const card = (doc: Document, id: string) => doc.querySelector(`[data-key="wi:${id}"]`)!

  test("the revised card shows a revision tombstone", () => {
    const summary = card(board(), "WI-008").querySelector(".revisions > summary")!
    expect(summary.textContent).toContain("spec revised 2×")
  })

  test("the tombstone names when, by whom, and what was superseded", () => {
    const rows = [...card(board(), "WI-008").querySelectorAll(".revisions li")].map((li) => li.textContent!)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain("hive_board_respec:hive-infra")
    expect(rows[0]).toContain("6112ab181958")
    expect(rows[1]).toContain("e3b0c44298fc")
  })

  test("the payload is REACHABLE without a fetch route — its path is in the tooltip", () => {
    const hash = card(board(), "WI-008").querySelector(".revisions li [title]")!
    // Relative to the board dir: the renderer is browser-side and cannot know
    // the configured board directory, and in fixture mode it is not `.opencode/`.
    expect(hash.getAttribute("title")).toContain("board/WI-008/6112ab181958.md")
    expect(hash.getAttribute("title")).not.toContain(".opencode/")
  })

  test("the lineage line names the attempt and NOT the editor", () => {
    const lineage = card(board(), "WI-008").querySelector(".lineage")!
    expect(lineage.textContent).toContain("previously attempted in")
    expect(lineage.textContent).toContain(ATTEMPT)
    expect(lineage.textContent).not.toContain(EDITOR)
  })

  test("an item revised but never attempted renders NO attempt lineage at all", () => {
    expect(card(board(), "WI-009").querySelector(".lineage")).toBeNull()
  })

  test("a BODY-LESS item still renders its revision history", () => {
    // specRevisionHtml sits outside the `item.body` conditional on purpose; a
    // body-less item has no .spec block, and must not lose its history with it.
    const c = card(board(), "WI-009")
    expect(byId.get("WI-009")!.body.trim()).toBe("")
    expect(c.querySelector(".spec")).toBeNull()
    expect(c.querySelector(".revisions > summary")!.textContent).toContain("spec revised once")
  })

  test("never-revised cards render no revision block", () => {
    expect(card(board(), "WI-001").querySelector(".revisions")).toBeNull()
  })
})
