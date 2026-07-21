/**
 * Regression tests for the diff-based live refresh (replaces the old
 * <meta http-equiv="refresh"> full-document rebuild).
 *
 * These lock in the two bugs that fix targeted:
 *   #1 flicker  — unchanged DOM must survive a poll by NODE IDENTITY (not be
 *                 torn down and recreated).
 *   #2 form     — an expanded "+ new item" <details> and anything typed into it
 *                 must survive a poll untouched.
 *
 * We drive a real DOM via happy-dom, render the SAME renderBoardBody() the
 * client uses, and morph a changed state into the live tree.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as path from "node:path"
import { buildBoard } from "../src/data/board"
import type { SessionMirror } from "../src/data/sessions"
import type { BoardState } from "../src/data/state"
import { loadWorkItems, type WorkItem } from "../src/data/workitems"
import { morph } from "../src/web/morph"
import { renderBoardBody } from "../src/web/render"

const FIXTURES = path.join(import.meta.dir, "..", "fixtures", "board")

beforeAll(() => GlobalRegistrator.register())
afterAll(() => GlobalRegistrator.unregister())

function makeState(items: WorkItem[]): BoardState {
  const sessions: SessionMirror = {
    available: true,
    computedAt: "2026-07-10T12:00:00Z",
    totalPersisted: 1,
    awakeIds: 1,
    awakeDeleted: 0,
    cards: [],
    persistedIds: ["ses_0b54b8cf4ffe9RoaO0Ga9OuBBF"],
  }
  return {
    generatedAt: "2026-07-10T12:00:00Z",
    workspaceRoot: "/workspace",
    guiBaseUrl: "http://studio:3000",
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
    sessions,
  }
}

/** Mount renderBoardBody into a #board-root, like renderPage does server-side. */
function mount(state: BoardState): HTMLElement {
  document.body.innerHTML = `<main id="board-root">${renderBoardBody(state)}</main>`
  return document.getElementById("board-root") as HTMLElement
}

/** One poll tick: render the new state offscreen and morph it in. */
function pollWith(root: HTMLElement, state: BoardState): void {
  const next = document.createElement("main")
  next.innerHTML = renderBoardBody(state)
  morph(root, next)
}

describe("live-refresh morph", () => {
  test("unchanged cards survive a poll by node identity (no flicker)", () => {
    const items = loadWorkItems(FIXTURES)
    const root = mount(makeState(items))

    const firstCard = root.querySelector('[data-key^="wi:"]') as HTMLElement
    expect(firstCard).toBeTruthy()
    // Tag it so we can prove the SAME element object survives the morph.
    ;(firstCard as unknown as { __probe?: number }).__probe = 42

    // Poll with an unchanged state (a no-op refresh — the common case).
    pollWith(root, makeState(loadWorkItems(FIXTURES)))

    const afterCard = root.querySelector('[data-key^="wi:"]') as HTMLElement
    expect(afterCard).toBe(firstCard) // same node, not a rebuild
    expect((afterCard as unknown as { __probe?: number }).__probe).toBe(42)
  })

  test("expanded + typed 'new item' form survives a poll (bug #2)", () => {
    const items = loadWorkItems(FIXTURES)
    const root = mount(makeState(items))

    const details = root.querySelector('details[data-key="create:backlog"]') as HTMLDetailsElement
    expect(details).toBeTruthy()

    // User expands the form and types a title.
    details.open = true
    const titleInput = details.querySelector('input[name="title"]') as HTMLInputElement
    titleInput.value = "half-typed idea"
    titleInput.focus()

    // A poll arrives (state changed elsewhere — a new card appears).
    const changed = loadWorkItems(FIXTURES)
    pollWith(root, makeState(changed))

    const detailsAfter = root.querySelector(
      'details[data-key="create:backlog"]',
    ) as HTMLDetailsElement
    expect(detailsAfter).toBe(details) // same element, not recreated
    expect(detailsAfter.open).toBe(true) // still expanded
    const inputAfter = detailsAfter.querySelector('input[name="title"]') as HTMLInputElement
    expect(inputAfter).toBe(titleInput)
    expect(inputAfter.value).toBe("half-typed idea") // typing survived
  })

  test("a changed <select> and focused <textarea> survive a poll", () => {
    const items = loadWorkItems(FIXTURES)
    const root = mount(makeState(items))
    const details = root.querySelector('details[data-key="create:backlog"]') as HTMLDetailsElement
    details.open = true

    const prio = details.querySelector('select[name="priority"]') as HTMLSelectElement
    prio.value = "high" // user picked a non-default option
    const bodyArea = details.querySelector('textarea[name="body"]') as HTMLTextAreaElement
    bodyArea.value = "spec in progress"
    bodyArea.focus()

    pollWith(root, makeState(items))

    const detailsAfter = root.querySelector(
      'details[data-key="create:backlog"]',
    ) as HTMLDetailsElement
    const prioAfter = detailsAfter.querySelector('select[name="priority"]') as HTMLSelectElement
    const bodyAfter = detailsAfter.querySelector('textarea[name="body"]') as HTMLTextAreaElement
    expect(prioAfter.value).toBe("high") // selection not reset to default
    expect(bodyAfter.value).toBe("spec in progress") // textarea content survived
    expect(document.activeElement).toBe(bodyAfter) // focus restored to same field
  })

  test("changed content IS applied (morph is not a no-op)", () => {
    const items = loadWorkItems(FIXTURES)
    const root = mount(makeState(items))

    // Drop all items → columns should reflect the new (empty) reality.
    pollWith(root, makeState([]))

    const cards = root.querySelectorAll('[data-key^="wi:"]')
    expect(cards.length).toBe(0)
    expect(root.textContent).toContain("Backlog")
  })

  test("a keyed card removed mid-list doesn't recreate its siblings", () => {
    const items = loadWorkItems(FIXTURES)
    const root = mount(makeState(items))

    // Identity-tag every card up front.
    const tagged = new Map<string, HTMLElement>()
    for (const el of root.querySelectorAll<HTMLElement>('[data-key^="wi:"]')) {
      const key = el.getAttribute("data-key")!
      tagged.set(key, el)
    }
    expect(tagged.size).toBeGreaterThan(1)

    // Remove one item and poll.
    const [dropKey] = [...tagged.keys()]
    const dropId = dropKey!.slice("wi:".length)
    pollWith(root, makeState(items.filter((i) => i.id !== dropId)))

    // The dropped card is gone; every surviving card is the SAME node object.
    expect(root.querySelector(`[data-key="${dropKey}"]`)).toBeNull()
    for (const [key, node] of tagged) {
      if (key === dropKey) continue
      expect(root.querySelector(`[data-key="${key}"]`)).toBe(node)
    }
  })
})
