/**
 * Icon identity tests — the two additive channels, the marks, and the live swap.
 *
 * Deliberately NOT string-matching renderPage() output (W-095): render.ts
 * inlines the whole stylesheet, so `expect(html).toContain(".hb-mark")` passes
 * whether or not the element was ever rendered, and every UI string appears in
 * comments too. Everything here either exercises the pure derivation directly,
 * or parses the HTML into a real DOM and asserts on queried nodes.
 *
 * Four layers:
 *   1. deriveIconState — the state→channel mapping, including the two rules
 *      most likely to regress: red beats amber, and absence is never idle.
 *   2. The marks themselves — that the favicon data: URI actually decodes to a
 *      parseable SVG, and that the reduced mark is a DIFFERENT drawing.
 *   3. Server render — the <head> tags and the header mark, via DOMParser.
 *   4. The REAL bundled client — that a poll swaps title + favicon href, and
 *      that the icon link sits outside the morphed subtree.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { BoardState } from "../../src/board-viewer/data/state"
import type { SessionMirror } from "../../src/board-viewer/data/sessions"
import { buildClientBundle } from "../../src/board-viewer/web/client-bundle"
import {
  BASE_TITLE,
  boardTitle,
  deriveIconState,
  faviconHref,
  fullMarkSvg,
  reducedMarkSvg,
  THEME_COLOR,
  type IconSource,
} from "../../src/board-viewer/web/icon"
import { renderPage } from "../../src/board-viewer/web/render"

beforeAll(() => GlobalRegistrator.register())
afterAll(() => GlobalRegistrator.unregister())

// ── Fixtures ────────────────────────────────────────────────────────────────

type Sess = { status?: "busy" | "idle" | "retry"; blocked?: "question" | "permission" }

/**
 * Build the slice of BoardState the icon reads. Each entry becomes a work item
 * whose owner_session is on the board; `offBoard` entries get status/action
 * flags but NO card, which is how we prove the scoping rule.
 */
function source(
  onBoard: Sess[],
  opts: { dreaming?: boolean; offBoard?: Sess[]; sessionOnly?: Sess[] } = {},
): IconSource {
  const actionRequired: Record<string, unknown> = {}
  const sessionStatus: Record<string, string> = {}
  const mark = (id: string, s: Sess) => {
    if (s.status) sessionStatus[id] = s.status
    if (s.blocked) {
      actionRequired[id] = {
        awaitingQuestion: s.blocked === "question",
        awaitingPermission: s.blocked === "permission",
        permissionCount: s.blocked === "permission" ? 1 : 0,
        questionCount: s.blocked === "question" ? 1 : 0,
        questionHeader: "",
      }
    }
  }
  const items = onBoard.map((s, n) => {
    mark(`ses_on_${n}`, s)
    return { id: `WI-${n}`, owner_session: `ses_on_${n}` }
  })
  ;(opts.offBoard ?? []).forEach((s, n) => mark(`ses_off_${n}`, s))
  const sessionOnly = (opts.sessionOnly ?? []).map((s, n) => {
    mark(`ses_only_${n}`, s)
    return { id: `ses_only_${n}` }
  })
  return {
    items,
    board: { backlog: [], todo: [], inProgress: [], done: [], sessionOnly },
    actionRequired,
    sessionStatus,
    dreams: { active: opts.dreaming ? [{ id: "DRM-099", status: "DREAMING" }] : [] },
  } as unknown as IconSource
}

// ── 1. The derivation ───────────────────────────────────────────────────────

describe("deriveIconState — top channel", () => {
  test("nothing reported is quiet, with no count", () => {
    expect(deriveIconState(source([{}, {}]))).toEqual({
      session: "quiet",
      dreaming: false,
      count: 0,
    })
  })

  test("a busy session is active; the count is the number of them", () => {
    expect(deriveIconState(source([{ status: "busy" }])).session).toBe("active")
    expect(deriveIconState(source([{ status: "busy" }])).count).toBe(1)
    const three = deriveIconState(source([{ status: "busy" }, { status: "busy" }, { status: "busy" }]))
    expect(three).toEqual({ session: "active", dreaming: false, count: 3 })
  })

  test("retry is work in flight, so it reads as active (amber), not intervention", () => {
    expect(deriveIconState(source([{ status: "retry" }])).session).toBe("active")
  })

  test("a pending question or permission is intervention", () => {
    expect(deriveIconState(source([{ blocked: "question" }])).session).toBe("intervene")
    expect(deriveIconState(source([{ blocked: "permission" }])).session).toBe("intervene")
  })

  test("RED BEATS AMBER: any blocked session outranks every busy one", () => {
    const icon = deriveIconState(
      source([{ blocked: "permission" }, { status: "busy" }, { status: "busy" }]),
    )
    expect(icon.session).toBe("intervene")
    // …and the count switches subject with the channel: it counts what the dot
    // is showing (1 intervention), not the 2 merely-busy sessions.
    expect(icon.count).toBe(1)
  })

  test("a blocked session is counted once, never also as 'active'", () => {
    const icon = deriveIconState(source([{ status: "busy", blocked: "question" }]))
    expect(icon).toEqual({ session: "intervene", dreaming: false, count: 1 })
  })
})

describe("deriveIconState — absence is never a positive claim (W-097)", () => {
  test("a session missing from sessionStatus contributes nothing", () => {
    // /session/status omits idle sessions entirely, so absence is UNKNOWN.
    expect(deriveIconState(source([{}, {}, {}])).session).toBe("quiet")
  })

  test("a literal 'idle' entry is not upgraded into any signal either", () => {
    const icon = deriveIconState(source([{ status: "idle" }, { status: "idle" }]))
    expect(icon).toEqual({ session: "quiet", dreaming: false, count: 0 })
  })

  test("an unreachable backend (empty maps) degrades to quiet, never throws", () => {
    const empty = {
      items: [{ id: "WI-1", owner_session: "ses_x" }],
      board: { backlog: [], todo: [], inProgress: [], done: [], sessionOnly: [] },
      actionRequired: {},
      sessionStatus: {},
      dreams: { active: [] },
    } as unknown as IconSource
    expect(deriveIconState(empty)).toEqual({ session: "quiet", dreaming: false, count: 0 })
  })
})

describe("deriveIconState — scoping to the board", () => {
  test("a busy session with no card on the board does not light the icon", () => {
    const icon = deriveIconState(source([], { offBoard: [{ status: "busy" }] }))
    expect(icon.session).toBe("quiet")
  })

  test("an off-board session awaiting permission does not turn the tab red", () => {
    // The workspace-global /permission feed sees every chat, not just HIVE
    // sessions. Only what the board can render a badge for may light the icon.
    const icon = deriveIconState(source([], { offBoard: [{ blocked: "permission" }] }))
    expect(icon.session).toBe("quiet")
  })

  test("unclaimed session-only cards DO count — they are on the board", () => {
    const icon = deriveIconState(source([], { sessionOnly: [{ status: "busy" }] }))
    expect(icon).toEqual({ session: "active", dreaming: false, count: 1 })
  })

  test("a session owning several cards is counted once, not per card", () => {
    const shared = {
      items: [
        { id: "WI-1", owner_session: "ses_dup" },
        { id: "WI-2", owner_session: "ses_dup" },
      ],
      board: { backlog: [], todo: [], inProgress: [], done: [], sessionOnly: [] },
      actionRequired: {},
      sessionStatus: { ses_dup: "busy" },
      dreams: { active: [] },
    } as unknown as IconSource
    expect(deriveIconState(shared).count).toBe(1)
  })
})

describe("deriveIconState — bottom channel is independent and additive", () => {
  test("an active dream lights the bottom channel on its own", () => {
    expect(deriveIconState(source([], { dreaming: true }))).toEqual({
      session: "quiet",
      dreaming: true,
      count: 0,
    })
  })

  test("the two channels combine freely (intervene while dreaming)", () => {
    const icon = deriveIconState(source([{ blocked: "question" }], { dreaming: true }))
    expect(icon).toEqual({ session: "intervene", dreaming: true, count: 1 })
  })

  test("dreaming alone adds no count prefix to the title", () => {
    expect(boardTitle(deriveIconState(source([], { dreaming: true })))).toBe(BASE_TITLE)
  })
})

describe("boardTitle — the count channel lives here, not in the icon", () => {
  test("no count when quiet", () => {
    expect(boardTitle({ session: "quiet", dreaming: false, count: 0 })).toBe(BASE_TITLE)
  })

  test("count is prefixed so it survives tab-strip truncation", () => {
    expect(boardTitle({ session: "active", dreaming: false, count: 2 })).toBe(`(2) ${BASE_TITLE}`)
    expect(boardTitle({ session: "intervene", dreaming: true, count: 7 })).toBe(`(7) ${BASE_TITLE}`)
  })
})

// ── 2. The marks ────────────────────────────────────────────────────────────

/** Decode a data: URI back to its SVG source. */
function decode(href: string): string {
  expect(href.startsWith("data:image/svg+xml,")).toBe(true)
  return decodeURIComponent(href.slice("data:image/svg+xml,".length))
}

function parseSvg(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  expect(doc.querySelector("parsererror")).toBeNull()
  return doc
}

describe("the favicon data: URI", () => {
  test("decodes to a parseable SVG (encoding is not merely plausible)", () => {
    const doc = parseSvg(decode(faviconHref({ session: "intervene", dreaming: true, count: 1 })))
    expect(doc.documentElement.tagName).toBe("svg")
    expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 64 64")
  })

  test("percent-encodes the characters that would otherwise break the URI", () => {
    const href = faviconHref({ session: "active", dreaming: false, count: 1 })
    // '#' would truncate the URI at the fragment; '<'/'>' are not URI-legal.
    expect(href).not.toContain("#")
    expect(href).not.toContain("<")
    expect(href).not.toContain(">")
  })
})

describe("the reduced mark is a different drawing, not the full mark scaled", () => {
  const icon = { session: "active", dreaming: false, count: 1 } as const

  test("the reduced mark has one dot and no mesh", () => {
    const doc = parseSvg(reducedMarkSvg(icon))
    expect(doc.querySelectorAll("circle").length).toBe(1)
    // One divider line only — no mesh edges.
    expect(doc.querySelectorAll("line").length).toBe(1)
  })

  test("the full mark has the 5-node / 6-edge mesh and 3 strata", () => {
    const doc = parseSvg(fullMarkSvg(icon))
    expect(doc.querySelectorAll("circle").length).toBe(5)
    expect(doc.querySelectorAll("line").length).toBe(1 + 6) // divider + edges
    expect(doc.querySelectorAll("g[clip-path] rect").length).toBe(3)
  })
})

describe("the marks paint the channels", () => {
  const dotOf = (s: "quiet" | "active" | "intervene") =>
    parseSvg(reducedMarkSvg({ session: s, dreaming: false, count: 1 }))
      .querySelector("circle")!
      .getAttribute("fill")

  test("top channel: dim → amber → red", () => {
    expect(dotOf("quiet")).toBe("#484f58")
    expect(dotOf("active")).toBe("#d29922")
    expect(dotOf("intervene")).toBe("#f85149")
  })

  test("bottom channel: the block goes amber AND taller while dreaming", () => {
    const block = (dreaming: boolean) =>
      parseSvg(reducedMarkSvg({ session: "quiet", dreaming, count: 0 })).querySelector(
        "g[clip-path] rect",
      )!
    expect(block(false).getAttribute("fill")).toBe("#30363d")
    expect(block(true).getAttribute("fill")).toBe("#d29922")
    // The extra height keeps the channel readable on a light tab strip, where
    // the amber/dim contrast is weakest.
    expect(Number(block(true).getAttribute("height"))).toBeGreaterThan(
      Number(block(false).getAttribute("height")),
    )
  })

  test("the two channels are drawn independently (red dot over amber strata)", () => {
    const doc = parseSvg(reducedMarkSvg({ session: "intervene", dreaming: true, count: 1 }))
    expect(doc.querySelector("circle")!.getAttribute("fill")).toBe("#f85149")
    expect(doc.querySelector("g[clip-path] rect")!.getAttribute("fill")).toBe("#d29922")
  })

  test("full mark lights one node per counted session, capped at the mesh size", () => {
    const lit = (count: number) =>
      Array.from(
        parseSvg(fullMarkSvg({ session: "active", dreaming: false, count })).querySelectorAll(
          "circle",
        ),
      ).filter((c) => c.getAttribute("fill") === "#d29922").length
    expect(lit(1)).toBe(1)
    expect(lit(3)).toBe(3)
    expect(lit(99)).toBe(5) // never more nodes than the mesh has
  })

  test("quiet lights nothing", () => {
    const doc = parseSvg(fullMarkSvg({ session: "quiet", dreaming: false, count: 0 }))
    const lit = Array.from(doc.querySelectorAll("circle")).filter(
      (c) => c.getAttribute("fill") !== "#484f58",
    )
    expect(lit.length).toBe(0)
  })

  test("the favicon carries no animation hooks (it can never animate)", () => {
    const svg = decode(faviconHref({ session: "active", dreaming: true, count: 2 }))
    expect(svg).not.toContain("animate")
    expect(svg).not.toContain("class=")
  })
})

// ── 3. Server render ────────────────────────────────────────────────────────

function makeState(over: Partial<BoardState> = {}): BoardState {
  const sessions: SessionMirror = {
    available: true,
    computedAt: "2026-07-10T12:00:00Z",
    totalPersisted: 0,
    awakeIds: 0,
    awakeDeleted: 0,
    cards: [],
    persistedIds: [],
  }
  return {
    generatedAt: "2026-07-10T12:00:00Z",
    workspaceRoot: "/workspace",
    buildSha: "testsha",
    guiBaseUrl: "http://studio:3000",
    capabilities: [],
    dreams: {
      artifactCounts: { insight: 0, warning: 0, songline: 0, shadow: 0, total: 0 },
      active: [],
      history: [],
      recentArtifacts: [],
    },
    messages: [],
    items: [],
    board: { backlog: [], todo: [], inProgress: [], done: [], sessionOnly: [] },
    writesEnabled: true,
    sessionBackend: "unconfigured",
    promoteDecisions: {},
    todoSubStates: {},
    actionRequired: {},
    sessionStatus: {},
    sessions,
    ...over,
  } as BoardState
}

/** Parse a full page into a real DOM so assertions query nodes, not strings. */
function parsePage(state: BoardState): Document {
  return new DOMParser().parseFromString(renderPage(state), "text/html")
}

const busyState = () =>
  makeState({
    items: [{ id: "WI-1", owner_session: "ses_a" }] as unknown as BoardState["items"],
    sessionStatus: { ses_a: "busy" },
  })

describe("server render — <head> identity", () => {
  test("emits an SVG favicon link", () => {
    const link = parsePage(makeState()).querySelector('link[rel="icon"]')
    expect(link).not.toBeNull()
    expect(link!.getAttribute("type")).toBe("image/svg+xml")
    expect(link!.getAttribute("href")!.startsWith("data:image/svg+xml,")).toBe(true)
  })

  test("emits theme-color matching the page field colour", () => {
    const meta = parsePage(makeState()).querySelector('meta[name="theme-color"]')
    expect(meta!.getAttribute("content")).toBe(THEME_COLOR)
    expect(THEME_COLOR).toBe("#0d1117")
  })

  test("the FIRST paint is already state-derived (no waiting a poll cycle)", () => {
    const doc = parsePage(busyState())
    expect(doc.querySelector("title")!.textContent).toBe(`(1) ${BASE_TITLE}`)
    const svg = decode(doc.querySelector('link[rel="icon"]')!.getAttribute("href")!)
    expect(parseSvg(svg).querySelector("circle")!.getAttribute("fill")).toBe("#d29922")
  })

  test("a quiet board gets the unprefixed title and the dim mark", () => {
    const doc = parsePage(makeState())
    expect(doc.querySelector("title")!.textContent).toBe(BASE_TITLE)
    const svg = decode(doc.querySelector('link[rel="icon"]')!.getAttribute("href")!)
    expect(parseSvg(svg).querySelector("circle")!.getAttribute("fill")).toBe("#484f58")
  })
})

describe("server render — the header mark", () => {
  test("the full mark renders next to the h1", () => {
    const h1 = parsePage(makeState()).querySelector("h1")!
    const svg = h1.querySelector(".hb-mark svg")
    expect(svg).not.toBeNull()
    expect(svg!.querySelectorAll("circle").length).toBe(5) // the mesh, not the dot
  })

  test("it carries an accessible name describing both channels", () => {
    const doc = parsePage(
      makeState({
        items: [{ id: "WI-1", owner_session: "ses_a" }] as unknown as BoardState["items"],
        actionRequired: {
          ses_a: {
            awaitingQuestion: true,
            awaitingPermission: false,
            permissionCount: 0,
            questionCount: 1,
            questionHeader: "",
          },
        },
        dreams: {
          artifactCounts: { insight: 0, warning: 0, songline: 0, shadow: 0, total: 0 },
          active: [{ id: "DRM-1", status: "DREAMING" }],
          history: [],
          recentArtifacts: [],
        } as unknown as BoardState["dreams"],
      }),
    )
    const title = doc.querySelector("h1 .hb-mark svg title")!.textContent!
    expect(title).toContain("intervention required")
    expect(title).toContain("dreaming")
    // Never claims idleness — absence is unknown, not idle (W-097).
    expect(title).not.toContain("idle")
  })

  test("the header mark sits INSIDE #board-root; the favicon link does NOT", () => {
    // The header mark rides the morph (redrawn free of charge each poll); the
    // <head> identity must stay out of the morphed subtree entirely.
    const doc = parsePage(makeState())
    const root = doc.getElementById("board-root")!
    expect(root.querySelector(".hb-mark")).not.toBeNull()
    expect(root.querySelector('link[rel="icon"]')).toBeNull()
    expect(doc.head.querySelector('link[rel="icon"]')).not.toBeNull()
  })
})

// ── 4. The real bundled client swaps both on poll ───────────────────────────

async function loadClientBundle(sha: string): Promise<string> {
  const bundle = await buildClientBundle(sha)
  expect(bundle.ok).toBe(true)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-board-icon-"))
  const file = path.join(dir, `client-${sha}-${Math.random().toString(36).slice(2)}.mjs`)
  fs.writeFileSync(file, bundle.js)
  return file
}

/** Mount head + body from a real renderPage, minus the unfetchable script tag. */
function mountPage(state: BoardState): void {
  const page = renderPage(state)
  const head = page.slice(page.indexOf("<head>") + 6, page.indexOf("</head>"))
  const body = page
    .slice(page.indexOf("<body>") + 6, page.indexOf("</body>"))
    .replace(/<script type="module" src="\/client\.js"><\/script>/, "")
  document.head.innerHTML = head
  document.body.innerHTML = body
}

let originalFetch: typeof globalThis.fetch | undefined

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch
})

function stubStateFetch(state: BoardState): void {
  originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(state), {
      headers: { "content-type": "application/json" },
    })) as unknown as typeof globalThis.fetch
}

describe("client — identity is restamped on every poll", () => {
  test("a poll that finds an intervention turns the favicon red and counts the title", async () => {
    mountPage(makeState()) // loaded quiet
    const blocked = makeState({
      buildSha: "testsha",
      items: [{ id: "WI-1", owner_session: "ses_a" }] as unknown as BoardState["items"],
      actionRequired: {
        ses_a: {
          awaitingQuestion: true,
          awaitingPermission: false,
          permissionCount: 0,
          questionCount: 1,
          questionHeader: "",
        },
      },
    })
    stubStateFetch(blocked)
    const mod = (await import(await loadClientBundle("testsha"))) as { poll?: () => Promise<void> }

    expect(document.title).toBe(BASE_TITLE)

    await mod.poll!()

    expect(document.title).toBe(`(1) ${BASE_TITLE}`)
    const href = document.querySelector('link[rel="icon"]')!.getAttribute("href")!
    expect(parseSvg(decode(href)).querySelector("circle")!.getAttribute("fill")).toBe("#f85149")
  })

  test("the indicator CLEARS again when the prompt is answered", async () => {
    // The failure mode this guards: an icon derived from a frozen bootstrap
    // snapshot lights once and never goes out.
    mountPage(
      makeState({
        items: [{ id: "WI-1", owner_session: "ses_a" }] as unknown as BoardState["items"],
        actionRequired: {
          ses_a: {
            awaitingQuestion: true,
            awaitingPermission: false,
            permissionCount: 0,
            questionCount: 1,
            questionHeader: "",
          },
        },
      }),
    )
    expect(document.title).toBe(`(1) ${BASE_TITLE}`)

    stubStateFetch(makeState()) // prompt answered: nothing pending any more
    const mod = (await import(await loadClientBundle("testsha"))) as { poll?: () => Promise<void> }
    await mod.poll!()

    expect(document.title).toBe(BASE_TITLE)
    const href = document.querySelector('link[rel="icon"]')!.getAttribute("href")!
    expect(parseSvg(decode(href)).querySelector("circle")!.getAttribute("fill")).toBe("#484f58")
  })

  test("a poll that changes nothing does not rewrite the href (no re-rasterise churn)", async () => {
    const state = busyState()
    mountPage(state)
    const before = document.querySelector('link[rel="icon"]')!.getAttribute("href")!

    stubStateFetch(state)
    const mod = (await import(await loadClientBundle("testsha"))) as { poll?: () => Promise<void> }
    await mod.poll!()

    expect(document.querySelector('link[rel="icon"]')!.getAttribute("href")).toBe(before)
    expect(document.title).toBe(`(1) ${BASE_TITLE}`)
  })

  test("a failed poll holds the last-known-good identity (unknown ≠ quiet)", async () => {
    mountPage(busyState())
    expect(document.title).toBe(`(1) ${BASE_TITLE}`)

    originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error("network down")
    }) as unknown as typeof globalThis.fetch

    const mod = (await import(await loadClientBundle("testsha"))) as { poll?: () => Promise<void> }
    await mod.poll!()

    // Still amber/counted — a blip must not blank the indicator.
    expect(document.title).toBe(`(1) ${BASE_TITLE}`)
    const href = document.querySelector('link[rel="icon"]')!.getAttribute("href")!
    expect(parseSvg(decode(href)).querySelector("circle")!.getAttribute("fill")).toBe("#d29922")
  })
})
