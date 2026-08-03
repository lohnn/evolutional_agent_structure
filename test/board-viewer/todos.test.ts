/**
 * WI-038 — todo sub-state: pure summary logic + rendered lane on In-Progress
 * cards. The live-read / mirror-write path (data/todos.ts) does network + fs
 * I/O and is exercised via the reconcile-shape assertions here at the type/pure
 * boundary; the HTTP read itself is a thin fetch wrapper we don't mock a server
 * for in unit tests (it degrades to null → mirror fallback, covered below).
 */
import { describe, expect, test } from "bun:test"
import * as path from "node:path"
import { renderPage } from "../../src/board-viewer/web/render"
import { summarizeTodos, type TodoItem, type TodoSubState } from "../../src/board-viewer/data/todo-types"
import { loadWorkItems } from "../../src/board-viewer/data/workitems"
import { makeState } from "./render.test"

const FIXTURES = path.join(import.meta.dir, "..", "..", "fixtures", "board")
// WI-003 is the fixture's in_progress card (owner ses_0b54b8cf4ffe9RoaO0Ga9OuBBF).
const IN_PROGRESS_ID = "WI-003"

const todos: TodoItem[] = [
  { content: "Read DESIGN.md", status: "completed" },
  { content: "Scaffold project", status: "completed" },
  { content: "Render the kanban columns now", status: "in_progress" },
  { content: "Wire transition buttons", status: "pending" },
  { content: "Abandoned approach", status: "cancelled" },
]

describe("summarizeTodos — pure counts + current activity", () => {
  test("counts each status and denominator excludes cancelled", () => {
    const s = summarizeTodos(todos)
    expect(s.total).toBe(5)
    expect(s.completed).toBe(2)
    expect(s.inProgress).toBe(1)
    expect(s.pending).toBe(1)
    expect(s.cancelled).toBe(1)
  })
  test("current is the FIRST in-progress todo's text", () => {
    expect(summarizeTodos(todos).current).toBe("Render the kanban columns now")
  })
  test("no in-progress todo ⇒ current is null", () => {
    const s = summarizeTodos([
      { content: "a", status: "completed" },
      { content: "b", status: "pending" },
    ])
    expect(s.current).toBeNull()
  })
  test("empty list ⇒ all zero, current null", () => {
    const s = summarizeTodos([])
    expect(s.total).toBe(0)
    expect(s.current).toBeNull()
  })
})

describe("todo sub-state lane rendering (In-Progress card)", () => {
  const items = loadWorkItems(FIXTURES)
  const sub: Record<string, TodoSubState> = {
    [IN_PROGRESS_ID]: { todos, updatedAt: "2026-07-21T21:30:00.123Z", source: "live" },
  }
  const html = renderPage(makeState(items, undefined, sub))

  test("renders the activity lane with completed/denominator count (2/4, cancelled excluded)", () => {
    expect(html).toContain('class="todos"')
    expect(html).toContain('class="todo-count mono">2/4</span>')
  })
  test("shows the current in-progress todo text", () => {
    expect(html).toContain("Render the kanban columns now")
  })
  test("progress bar fill reflects 2/4 = 50%", () => {
    expect(html).toContain("width:50%")
  })
  test("live source does NOT show the cached hint", () => {
    expect(html).not.toContain('class="todo-cached"')
  })
})

describe("todo sub-state degrades gracefully", () => {
  const items = loadWorkItems(FIXTURES)

  test("source 'none' renders no lane at all", () => {
    const html = renderPage(
      makeState(items, undefined, {
        [IN_PROGRESS_ID]: { todos: [], updatedAt: null, source: "none" },
      }),
    )
    expect(html).not.toContain('class="todos"')
  })

  test("no sub-state for the item ⇒ no lane (card still renders)", () => {
    const html = renderPage(makeState(items, undefined, {}))
    expect(html).not.toContain('class="todos"')
    expect(html).toContain("Implementing HIVE-board") // card itself intact
  })

  test("mirror source shows the 'cached' freshness hint", () => {
    const html = renderPage(
      makeState(items, undefined, {
        [IN_PROGRESS_ID]: {
          todos: [{ content: "mirrored task", status: "in_progress" }],
          updatedAt: "2026-07-21T20:00:00.000Z",
          source: "mirror",
        },
      }),
    )
    expect(html).toContain('class="todo-cached"')
    expect(html).toContain("mirrored task")
  })
})
