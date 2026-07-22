import { describe, expect, test } from "bun:test"
import * as path from "node:path"
import { buildBoard } from "../src/data/board"
import type { SessionMirror } from "../src/data/sessions"
import type { BoardState } from "../src/data/state"
import { loadWorkItems } from "../src/data/workitems"
import { renderPage } from "../src/web/render"

const FIXTURES = path.join(import.meta.dir, "..", "fixtures", "board")
const GUI = "http://studio:3000"

function makeState(
  items = loadWorkItems(FIXTURES),
  mirror?: Partial<SessionMirror>,
  todoSubStates: BoardState["todoSubStates"] = {},
): BoardState {
  const sessions: SessionMirror = {
    available: true,
    computedAt: "2026-07-10T12:00:00Z",
    totalPersisted: 1,
    awakeIds: 1,
    awakeDeleted: 0,
    cards: [],
    persistedIds: ["ses_0b54b8cf4ffe9RoaO0Ga9OuBBF"], // WI-003's owner exists
    ...mirror,
  }
  return {
    generatedAt: "2026-07-10T12:00:00Z",
    workspaceRoot: "/workspace",
    buildSha: "f4ff50b",
    guiBaseUrl: GUI,
    capabilities: [],
    dreams: {
      artifactCounts: { insight: 0, warning: 0, songline: 0, shadow: 0, total: 0 },
      active: [],
      history: [],
      recentArtifacts: [],
    },
    messages: [],
    items,
    board: buildBoard(items, sessions),
    writesEnabled: true,
    sessionBackend: "unconfigured",
    promoteDecisions: {},
    todoSubStates,
    sessions,
  }
}

export { makeState }

describe("kanban rendering — fixture states", () => {
  const html = renderPage(makeState())

  test("four columns render", () => {
    for (const col of ["Backlog", "Todo", "In Progress", "Done"]) expect(html).toContain(col)
  })
  test("paused card is dimmed", () => expect(html).toContain('class="card wi paused"'))
  test("no-dream badge on WI-006", () => expect(html).toContain("no-dream"))
  test("subtask lane with progress count", () => expect(html).toContain('<span class="lane-count">2/4</span>'))
  test("artifacts chips on Done card", () => {
    expect(html).toContain("I-141")
    expect(html).toContain("DRM-036")
  })
  test("enabled Open link for resolvable owner (WI-003)", () =>
    expect(html).toContain(`href="${GUI}/?session=ses_0b54b8cf4ffe9RoaO0Ga9OuBBF"`))
  // Bug fix (I-187/SNG-045): a stamped owner_session is itself proof the
  // session exists — the frozen, directory-scoped mirror is NOT the gate. So an
  // owner ABSENT from persistedIds (freshly started, or cross-project) must
  // STILL render a tappable <a href>, never a dead span.
  test("enabled Open link for stamped owner absent from mirror (WI-004)", () => {
    expect(html).toContain(`href="${GUI}/?session=ses_fixture_paused_owner00000"`)
    // no owner-link disabled span leaks for a stamped owner
    expect(html).not.toContain('class="open-link disabled"')
  })
  // The genuine no-owner case (owner_session: null, e.g. WI-001/002/007) still
  // renders NO Open link at all.
  test("no Open link for a work item without owner_session (WI-001)", () =>
    expect(html).not.toContain(`href="${GUI}/?session=null"`))
  test("lineage line from transitions[] (WI-007)", () => {
    expect(html).toContain("previously attempted in")
    expect(html).toContain("ses_fixture_released_owner00")
  })
  test("no invariant badges on valid fixtures", () => expect(html).not.toContain("⚠ invariant"))
})

describe("kanban rendering — degraded modes", () => {
  test("empty board (real .opencode/board absent) renders empty columns", () => {
    const html = renderPage(makeState([]))
    expect(html).toContain("Backlog")
    expect(html).toContain('class="empty">—</div>')
  })
  test("mirror unavailable: cards render from cache, owner links still trusted from the WI record", () => {
    const html = renderPage(
      makeState(undefined, { available: false, persistedIds: [], error: "db gone" }),
    )
    expect(html).toContain("Implementing HIVE-board") // item content still renders (§1a)
    // Owner Open link comes from the WI's own stamped owner_session, so it stays
    // tappable even when the session mirror is entirely unavailable (I-143/I-144).
    expect(html).toContain(`href="${GUI}/?session=ses_0b54b8cf4ffe9RoaO0Ga9OuBBF"`)
    // The diagnostics banner still reports the unavailable enumeration.
    expect(html).toContain("session mirror unavailable")
  })
})
