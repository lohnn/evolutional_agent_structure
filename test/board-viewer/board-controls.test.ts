/**
 * Tests for WI-084 — collapsible columns + the search/filter bar.
 *
 * Server-render side (render.ts): the corpus JSON island, the shell-side
 * controls markup, the per-column collapse toggle, and the untagged corpus.
 *
 * Client side (filter.ts, driven against a real happy-dom DOM): filtering by
 * free text / tag chips / the untagged pseudo-filter, the never-silent empty
 * state (W-019/I-289/SNG-018), column collapse, and — the binding constraint —
 * survival of control state across the 15s poll morph.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import * as path from "node:path"
import type { BoardState } from "../../src/board-viewer/data/state"
import { loadWorkItems } from "../../src/board-viewer/data/workitems"
import {
  _resetBoardControlsForTest,
  refreshBoardControls,
  setupBoardControls,
} from "../../src/board-viewer/web/filter"
import { morph } from "../../src/board-viewer/web/morph"
import { renderBoardBody, renderPage } from "../../src/board-viewer/web/render"
import { makeState } from "./render.test"

const FIXTURES = path.join(import.meta.dir, "..", "..", "fixtures", "board")

beforeAll(() => GlobalRegistrator.register())
afterAll(() => GlobalRegistrator.unregister())

// filter.ts is a module singleton by design (one page, one control state).
// Tests mount several fresh DOM trees in one process, so each must start from
// a clean slate: unbind the old listeners, re-read (empty) storage, and wipe
// the localStorage a prior test persisted into.
afterEach(() => {
  try {
    window.localStorage.clear()
  } catch {
    /* ignore */
  }
  _resetBoardControlsForTest()
  document.body.innerHTML = ""
})

// ── Server-render assertions (no DOM needed beyond parsing) ─────────────────

describe("WI-084 server render", () => {
  const items = loadWorkItems(FIXTURES)
  const html = renderPage(makeState(items))

  test("filter corpus island is embedded inside the board body", () => {
    expect(html).toContain('id="filter-corpus"')
    expect(html).toContain('data-key="filter:corpus"')
    // Every fixture item id appears in the corpus JSON.
    for (const i of items) expect(html).toContain(`\\"id\\":\\"${i.id}\\"`.replaceAll("\\", ""))
  })

  test("corpus haystack is pre-lowered and covers id/title/tags/body", () => {
    const m = html.match(/<script id="filter-corpus"[^>]*>([\s\S]*?)<\/script>/)
    expect(m).toBeTruthy()
    const corpus = JSON.parse(m![1]!) as Array<{ id: string; hay: string; tags: string[] }>
    const wi1 = corpus.find((c) => c.id === "WI-001")!
    expect(wi1.hay).toContain("wi-001") // id, lowered
    expect(wi1.hay).toBe(wi1.hay.toLowerCase())
    // fixture tags are present in the corpus
    expect(corpus.some((c) => c.tags.includes("hive-board"))).toBe(true)
  })

  test("the tag facet is built from the ACTUAL corpus, including an untagged pseudo-chip with the real count", () => {
    // All 9 fixtures are tagged in this fixture set, so untagged count is 0 —
    // but the chip must still render (it's a structural affordance, W-019).
    expect(html).toContain('data-tag="__untagged__"')
    // Real tags from the fixtures render as chips (not a hardcoded list).
    expect(html).toContain('data-tag="hive-board"')
    // A tag absent from the corpus renders NO chip — the facet is data-driven.
    expect(html).not.toContain('data-tag="android-launcher"')
  })

  test("untagged count reflects items with NO tags", () => {
    const withUntagged = renderPage(
      makeState([
        ...items,
        // a bare untagged item (minimal shape)
        { ...items[0]!, id: "WI-999", tags: [], status: "backlog" },
      ]),
    )
    expect(withUntagged).toContain('data-tag="__untagged__"')
    expect(withUntagged).toMatch(/untagged 1</)
  })

  test("every column header is a collapse toggle (name + count preserved)", () => {
    for (const col of ["Backlog", "Todo", "In Progress", "Done"]) {
      expect(html).toContain(`data-col-toggle="${col}"`)
      expect(html).toContain(`data-col="${col}"`)
    }
    // The collapse strip (shell-side) carries the same data-col-toggle hooks.
    expect(html).toContain('id="collapse-strip"')
  })

  test("the search input lives in the shell OUTSIDE #board-root", () => {
    const rootStart = html.indexOf('<main id="board-root">')
    const inputIdx = html.indexOf('id="filter-q"')
    expect(inputIdx).toBeGreaterThan(-1)
    expect(inputIdx).toBeLessThan(rootStart) // before the morphed subtree
  })

  test("heading count span exists for the client to stamp", () => {
    expect(html).toContain('id="filter-count"')
  })

  test("the always-visible controls row carries toggle + search + summary; the panel wraps the rest", () => {
    expect(html).toContain('id="controls-row"')
    expect(html).toContain('id="controls-toggle"')
    expect(html).toContain('aria-controls="controls-panel"')
    expect(html).toContain('id="controls-summary"')
    // Search input lives in the always-visible row.
    const rowStart = html.indexOf('id="controls-row"')
    const panelStart = html.indexOf('id="controls-panel"')
    const inputIdx = html.indexOf('id="filter-q"')
    const tagsIdx = html.indexOf('id="filter-tags"')
    const stripIdx = html.indexOf('id="collapse-strip"')
    expect(rowStart).toBeGreaterThan(-1)
    expect(panelStart).toBeGreaterThan(rowStart)
    expect(inputIdx).toBeGreaterThan(rowStart)
    expect(inputIdx).toBeLessThan(panelStart) // in the row, before the panel
    expect(tagsIdx).toBeGreaterThan(panelStart) // tag wall inside the panel
    expect(stripIdx).toBeGreaterThan(panelStart) // collapse strip inside the panel
  })
})

// ── Client behaviour against a live DOM ─────────────────────────────────────

/** Mount the shell controls + board body the way renderPage lays them out. */
function mount(state: BoardState): { root: HTMLElement; q: HTMLInputElement } {
  // renderPage gives the full document; extract the controls + board-root so
  // the test DOM mirrors the real shell/morphed-subtree split.
  document.body.innerHTML = ""
  const full = renderPage(state)
  // naive but sufficient: pull the two subtrees by id from the parsed page.
  const doc = new DOMParser().parseFromString(full, "text/html")
  const controls = doc.getElementById("board-controls")!
  const root = doc.getElementById("board-root")!
  document.body.appendChild(document.importNode(controls, true))
  document.body.appendChild(document.importNode(root, true))
  const liveRoot = document.getElementById("board-root") as HTMLElement
  const q = document.getElementById("filter-q") as HTMLInputElement
  return { root: liveRoot, q }
}

function pollWith(root: HTMLElement, state: BoardState): void {
  const next = document.createElement("main")
  next.id = "board-root"
  next.innerHTML = renderBoardBody(state)
  morph(root, next)
}

function chip(doc: Document, tag: string): HTMLElement | null {
  return doc.querySelector(`#filter-tags .tag-chip[data-tag="${tag}"]`)
}

function visibleWiCards(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".card.wi"))
    .filter((c) => !c.classList.contains("filter-hidden"))
    .map((c) => c.getAttribute("data-key") ?? "")
}

describe("WI-084 filter client", () => {
  test("free text filters by id/title/tags/body and the empty state names the reason", () => {
    const items = loadWorkItems(FIXTURES)
    const { root, q } = mount(makeState(items))
    setupBoardControls()

    // Baseline: no filter → all WI cards visible, count states totals.
    const total = items.length
    expect(visibleWiCards(root).length).toBe(total)
    expect(document.getElementById("filter-count")!.textContent).toContain(`${total} items`)

    // Type a query that matches exactly one item (WI-001 by id).
    q.value = "WI-001"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    expect(visibleWiCards(root)).toEqual(["wi:WI-001"])
    expect(document.getElementById("filter-count")!.textContent).toContain("showing 1/")

    // A query matching nothing → explicit "no items match — N hidden", never silent.
    q.value = "zzz-no-such-thing-zzz"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    expect(visibleWiCards(root).length).toBe(0)
    expect(document.getElementById("filter-count")!.textContent).toContain("no items match")
    expect(document.getElementById("filter-count")!.textContent).toContain(`${total} hidden`)
  })

  test("tag chip filters, and the untagged pseudo-filter lists only untagged items", () => {
    const items = loadWorkItems(FIXTURES)
    const untaggedItem = { ...items[0]!, id: "WI-900", tags: [], status: "todo" as const }
    const state = makeState([...items, untaggedItem])
    const { root } = mount(state)
    setupBoardControls()

    // Click the hive-board tag chip → only hive-board-tagged cards remain.
    chip(document, "hive-board")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    const hiveBoardIds = visibleWiCards(root)
    expect(hiveBoardIds.length).toBeGreaterThan(0)
    expect(hiveBoardIds).not.toContain("wi:WI-900")
    expect(hiveBoardIds.every((k) => {
      const id = k.slice(3)
      const it = [...items, untaggedItem].find((x) => x.id === id)!
      return it.tags.includes("hive-board")
    })).toBe(true)

    // Clear, then the untagged pseudo-filter → ONLY the untagged item.
    document.getElementById("filter-clear")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(visibleWiCards(root).length).toBe(items.length + 1) // all back
    chip(document, "__untagged__")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(visibleWiCards(root)).toEqual(["wi:WI-900"])
  })

  test("untagged + a real tag is a provably-empty set and SAYS so (SNG-018)", () => {
    const items = loadWorkItems(FIXTURES)
    const { root } = mount(makeState(items))
    setupBoardControls()
    chip(document, "__untagged__")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    chip(document, "hive-board")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(visibleWiCards(root).length).toBe(0)
    // The impossible combination is named explicitly (not a bare "no match").
    expect(document.getElementById("filter-count")!.textContent).toContain("nothing can match")
  })

  test("session-only cards dim (never silently vanish) under an active filter", () => {
    const items = loadWorkItems(FIXTURES)
    const state = makeState(items)
    // inject a session-only card into the mirror
    state.board.sessionOnly = [
      {
        id: "ses_solo",
        title: "solo",
        created: "2026-08-12T00:00:00Z",
        updated: "2026-08-12T00:00:00Z",
        openUrl: "http://x",
      },
    ]
    const { root, q } = mount(state)
    setupBoardControls()
    q.value = "WI-001"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    const solo = root.querySelector(".card.session-only") as HTMLElement
    expect(solo.classList.contains("filter-dim")).toBe(true)
    expect(solo.classList.contains("filter-hidden")).toBe(false) // never removed
  })

  test("typed filter text + chip selection SURVIVE a poll morph (constraint 1/6)", () => {
    const items = loadWorkItems(FIXTURES)
    const { root, q } = mount(makeState(items))
    setupBoardControls()

    // User types + picks a tag.
    q.value = "hive"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    chip(document, "ui")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    const before = visibleWiCards(root)

    // A poll lands (morph rebuilds #board-root from a fresh state).
    pollWith(root, makeState(loadWorkItems(FIXTURES)))
    refreshBoardControls()

    // The input (shell-side, outside the morph) kept its text; the filter is
    // still applied to the fresh board; verdicts re-derived, not reset.
    expect((document.getElementById("filter-q") as HTMLInputElement).value).toBe("hive")
    expect(chip(document, "ui")!.classList.contains("active")).toBe(true)
    expect(visibleWiCards(root)).toEqual(before)
  })
})

describe("WI-084 column collapse", () => {
  test("header toggle collapses/expands a column, keeping name + count visible", () => {
    const items = loadWorkItems(FIXTURES)
    const { root } = mount(makeState(items))
    setupBoardControls()

    const col = root.querySelector('.col[data-col="Backlog"]') as HTMLElement
    expect(col.classList.contains("collapsed")).toBe(false)

    // Click the column's own header toggle.
    col
      .querySelector('[data-col-toggle="Backlog"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(col.classList.contains("collapsed")).toBe(true)
    // Name + count still present in the (visible) header.
    expect(col.querySelector(".col-head")!.textContent).toContain("Backlog")
    expect(col.querySelector(".col-head")!.textContent).toMatch(/\(\d+\)/)

    // Toggle back via the collapse strip (shell-side).
    document
      .querySelector('#collapse-strip [data-col-toggle="Backlog"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(root.querySelector('.col[data-col="Backlog"]')!.classList.contains("collapsed")).toBe(false)
  })

  test("collapse state SURVIVES a poll morph (the re-morphed column is re-collapsed)", () => {
    const items = loadWorkItems(FIXTURES)
    const { root } = mount(makeState(items))
    setupBoardControls()

    root
      .querySelector('[data-col-toggle="Done"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(root.querySelector('.col[data-col="Done"]')!.classList.contains("collapsed")).toBe(true)

    // Poll: the morph rebuilds the Done column from scratch (collapsed class
    // is client-only, not in the server render) — refreshBoardControls must
    // re-apply it.
    pollWith(root, makeState(loadWorkItems(FIXTURES)))
    refreshBoardControls()
    expect(root.querySelector('.col[data-col="Done"]')!.classList.contains("collapsed")).toBe(true)
    // Other columns untouched.
    expect(root.querySelector('.col[data-col="Todo"]')!.classList.contains("collapsed")).toBe(false)
  })
})

describe("WI-084 whole-controls collapse (filter-bar fold)", () => {
  test("an explicit persisted choice overrides the form-factor default", () => {
    // The module singleton reads hb.controls.collapsed at import time, but
    // _resetBoardControlsForTest() (in afterEach and callable here) re-reads
    // storage — so plant the choice, reset, and the next setup must honour it
    // even on happy-dom's wide (non-mobile) viewport.
    window.localStorage.setItem("hb.controls.collapsed", "collapsed")
    _resetBoardControlsForTest()
    const items = loadWorkItems(FIXTURES)
    mount(makeState(items))
    setupBoardControls() // happy-dom viewport is wide — the choice must still win
    expect(document.getElementById("board-controls")!.classList.contains("controls-collapsed")).toBe(true)
  })

  test("no explicit choice → form-factor default (happy-dom: not ≤640px → expanded)", () => {
    const items = loadWorkItems(FIXTURES)
    mount(makeState(items))
    setupBoardControls()
    const controls = document.getElementById("board-controls")!
    expect(controls.classList.contains("controls-collapsed")).toBe(false)
    const btn = document.getElementById("controls-toggle")!
    expect(btn.getAttribute("aria-expanded")).toBe("true")
    // Summary carries the inactive placeholder while expanded.
    expect(document.getElementById("controls-summary")!.textContent).toContain("no filter active")
  })

  test("toggle collapses/expands the panel and persists the explicit choice", () => {
    const items = loadWorkItems(FIXTURES)
    mount(makeState(items))
    setupBoardControls()
    const controls = document.getElementById("board-controls")!
    const btn = document.getElementById("controls-toggle")!

    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(controls.classList.contains("controls-collapsed")).toBe(true)
    expect(btn.getAttribute("aria-expanded")).toBe("false")
    expect(window.localStorage.getItem("hb.controls.collapsed")).toBe("collapsed")

    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(controls.classList.contains("controls-collapsed")).toBe(false)
    expect(btn.getAttribute("aria-expanded")).toBe("true")
    expect(window.localStorage.getItem("hb.controls.collapsed")).toBe("expanded")
  })

  test("the collapsed row names the active filter: query, tag chips, and match count", () => {
    const items = loadWorkItems(FIXTURES)
    const { q } = mount(makeState(items))
    setupBoardControls()

    // Activate text + tag filters, then collapse the panel.
    q.value = "hive"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    chip(document, "ui")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    document.getElementById("controls-toggle")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    const summary = document.getElementById("controls-summary")!
    expect(summary.classList.contains("has-filter")).toBe(true)
    expect(summary.textContent).toContain("hive") // query text visible
    expect(summary.textContent).toContain("ui") // active tag visible
    // The match count renders in its own non-truncating span, N/M.
    const n = summary.querySelector("span.summary-n")!
    expect(n.textContent).toMatch(/^\d+\/\d+$/)
    // The query fragment lives in a truncatable span (ellipsis on overflow).
    expect(summary.querySelector("span.summary-q")!.textContent).toContain("hive")
    // The active tag renders as an INERT chip (a span, not a button) — tapping
    // the row expands; it does not toggle filters.
    const chips = summary.querySelectorAll("span.tag-chip.active")
    expect(chips.length).toBe(1)
    expect(chips[0]!.textContent).toBe("ui")
    // Board verdicts match the summary.
    const visible = Array.from(document.querySelectorAll<HTMLElement>(".card.wi")).filter(
      (c) => !c.classList.contains("filter-hidden"),
    ).length
    expect(n.textContent).toBe(`${visible}/${items.length}`)
  })

  test("panel state AND an active filter both survive a poll morph", () => {
    const items = loadWorkItems(FIXTURES)
    const { root, q } = mount(makeState(items))
    setupBoardControls()

    // Collapse the panel AND set a filter.
    document.getElementById("controls-toggle")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    q.value = "WI-001"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    expect(document.getElementById("board-controls")!.classList.contains("controls-collapsed")).toBe(true)

    // Poll lands (the morph rebuilds #board-root; the shell is untouched).
    pollWith(root, makeState(loadWorkItems(FIXTURES)))
    refreshBoardControls()

    // Panel still collapsed, filter still active, summary re-derived from the
    // fresh corpus (never reset, never drifted).
    expect(document.getElementById("board-controls")!.classList.contains("controls-collapsed")).toBe(true)
    expect((document.getElementById("filter-q") as HTMLInputElement).value).toBe("WI-001")
    expect(document.getElementById("controls-summary")!.textContent).toContain("WI-001")
    expect(visibleWiCards(root)).toEqual(["wi:WI-001"])
  })
})

describe("WI-084 collapsed-row chip fold (mobile overflow feedback)", () => {
  // The fold is MEASURED (stamp all, then fold the last chip into "+N more"
  // until scrollWidth ≤ clientWidth). happy-dom does no layout, so
  // scrollWidth === clientWidth and nothing folds — the DOM-level contract we
  // CAN assert here is the shape: every active tag renders as a chip, the
  // verdict span is present and last, and the fold loop terminates cleanly.
  // The visual "no clipping at 375px" half is verified live via devtools.
  test("all active tags render as inert chips, verdict span is present and last", () => {
    const items = loadWorkItems(FIXTURES)
    mount(makeState(items))
    setupBoardControls()
    for (const t of ["hive-board", "ui", "viewer"]) {
      chip(document, t)!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    }
    document.getElementById("controls-toggle")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    const summary = document.getElementById("controls-summary")!
    const chips = Array.from(summary.querySelectorAll("span.tag-chip.active")).map((c) => c.textContent)
    // happy-dom has no layout (nothing overflows) → all three chips shown.
    expect(chips).toEqual(["hive-board", "ui", "viewer"])
    const n = summary.querySelector("span.summary-n")!
    expect(n.textContent).toMatch(/^\d+\/\d+$/)
    expect(summary.lastElementChild).toBe(n)
    // The full tag list remains readable via the row tooltip.
    expect(summary.title).toContain("hive-board")
    expect(summary.title).toContain("viewer")
  })

  test("the fold indicator (when it appears) names the folded tags in its tooltip", () => {
    const items = loadWorkItems(FIXTURES)
    mount(makeState(items))
    setupBoardControls()
    for (const t of ["hive-board", "ui"]) chip(document, t)!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    chip(document, "__untagged__")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    const summary = document.getElementById("controls-summary")!
    // No layout in happy-dom → no fold → the untagged chip renders as a chip.
    const chips = Array.from(summary.querySelectorAll("span.tag-chip.active")).map((c) => c.textContent)
    expect(chips).toContain("untagged")
    expect(summary.querySelector("span.summary-n")!.textContent).toMatch(/^\d+\/\d+$/)
  })
})

describe("WI-084 empty-combo diagnosis (W-019/SNG-018 follow-up)", () => {
  test("AND-combo empty but each tag individually non-empty → named with per-tag counts", () => {
    const items = loadWorkItems(FIXTURES)
    // Craft two tags that never co-occur: give WI-001 tag "aaa" only, WI-002 "bbb" only.
    const a = { ...items.find((i) => i.id === "WI-001")!, tags: ["aaa"] }
    const b = { ...items.find((i) => i.id === "WI-002")!, tags: ["bbb"] }
    const rest = items.filter((i) => i.id !== "WI-001" && i.id !== "WI-002")
    const { root } = mount(makeState([a, b, ...rest]))
    setupBoardControls()

    chip(document, "aaa")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    chip(document, "bbb")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(visibleWiCards(root).length).toBe(0) // the combination is genuinely empty
    const count = document.getElementById("filter-count")!.textContent!
    expect(count).toContain("no items have all of:")
    expect(count).toContain("aaa (1)")
    expect(count).toContain("bbb (1)")
    expect(count).toContain("each has matches individually")
    expect(count).toContain("hidden") // the N-hidden tail survives
  })

  test("AND-combo empty where one tag ALSO matches nothing alone → plain 'no items match' (not an intersection story)", () => {
    const items = loadWorkItems(FIXTURES)
    const a = { ...items.find((i) => i.id === "WI-001")!, tags: ["solo-x"] }
    const rest = items.filter((i) => i.id !== "WI-001")
    const { root } = mount(makeState([a, ...rest]))
    setupBoardControls()
    // solo-x exists on one item; "hive-board" exists on several, but no item
    // carries both → empty AND. Each individually matches → diagnosis fires.
    chip(document, "solo-x")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    chip(document, "hive-board")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(document.getElementById("filter-count")!.textContent).toContain("no items have all of:")
    // Now add a query that kills solo-x's only item → the tag no longer
    // matches individually → fall back to the plain message.
    const q = document.getElementById("filter-q") as HTMLInputElement
    q.value = "WI-002"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    expect(visibleWiCards(root).length).toBe(0)
    const count = document.getElementById("filter-count")!.textContent!
    expect(count).toContain("no items match")
    expect(count).not.toContain("have all of")
  })

  test("untagged + a real tag names the impossible combination explicitly (SNG-018)", () => {
    const items = loadWorkItems(FIXTURES)
    mount(makeState(items))
    setupBoardControls()
    chip(document, "__untagged__")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    chip(document, "hive-board")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    const count = document.getElementById("filter-count")!.textContent!
    expect(count).toContain("nothing can match")
    expect(count).toContain("untagged + a tag is empty by definition")
    expect(count).not.toContain("have all of")
  })

  test("all-hidden boards stamp .filter-empty on the morph root (and clear it when results return)", () => {
    const items = loadWorkItems(FIXTURES)
    const { root, q } = mount(makeState(items))
    setupBoardControls()
    expect(root.classList.contains("filter-empty")).toBe(false)

    q.value = "zzz-no-such-thing-zzz"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    expect(visibleWiCards(root).length).toBe(0)
    expect(root.classList.contains("filter-empty")).toBe(true)

    q.value = ""
    q.dispatchEvent(new Event("input", { bubbles: true }))
    expect(root.classList.contains("filter-empty")).toBe(false)
  })

  test("filter-empty is re-derived after a poll morph (fresh root keeps the verdict)", () => {
    const items = loadWorkItems(FIXTURES)
    const { root, q } = mount(makeState(items))
    setupBoardControls()
    q.value = "zzz-no-such-thing-zzz"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    expect(root.classList.contains("filter-empty")).toBe(true)

    // Poll: the morph rebuilds #board-root from scratch (the class is
    // client-only, never in the server render) — refreshBoardControls must
    // re-stamp it on the fresh root.
    pollWith(root, makeState(loadWorkItems(FIXTURES)))
    refreshBoardControls()
    expect(root.classList.contains("filter-empty")).toBe(true)
  })
})
