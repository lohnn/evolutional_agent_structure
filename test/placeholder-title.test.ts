/**
 * BOUNDED placeholder-title fallback (data/placeholder-title.ts + itemCard).
 *
 * Proves the narrow stopgap: a WI card whose FROZEN frontmatter title is still
 * opencode's auto-placeholder renders the owner session's REAL title from the
 * mirror — while a normal frontmatter title is NEVER overridden, and a
 * placeholder with no usable live title falls back gracefully (no crash).
 *
 * Pattern matched (empirically confirmed against the live opencode.db,
 * 2026-07-21): `New session - <ISO 8601, T sep, Z or offset, millis optional>`
 * plus empty/blank. ⚠ pending hive-infra contract confirmation (question sent).
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { buildBoard } from "../src/data/board"
import {
  displayTitle,
  isPlaceholderTitle,
  isRealSessionTitle,
} from "../src/data/placeholder-title"
import type { SessionMirror } from "../src/data/sessions"
import type { BoardState } from "../src/data/state"
import { parseWorkItem, type WorkItem } from "../src/data/workitems"
import { renderBoardBody } from "../src/web/render"

beforeAll(() => GlobalRegistrator.register())
afterAll(() => GlobalRegistrator.unregister())

const OWNER = "ses_0b54b8cf4ffe9RoaO0Ga9OuBBF"
const REAL_TITLE = "hive-board reload flicker and state reset"
const PLACEHOLDER = "New session - 2026-07-20T22:18:00.584Z"

/** Build one in_progress WI with the given title + owner via the real parser. */
function item(title: string, owner: string | null = OWNER): WorkItem {
  return parseWorkItem(
    [
      "---",
      "id: WI-035",
      `title: ${JSON.stringify(title)}`,
      "status: in_progress",
      `owner_session: ${owner ?? "null"}`,
      `group_id: ${owner ?? "null"}`,
      "origin: session-first",
      "---",
      "",
      "Spec.",
    ].join("\n"),
  )
}

function mirror(sessionTitles?: Record<string, string>): SessionMirror {
  return {
    available: true,
    computedAt: "2026-07-21T00:00:00Z",
    totalPersisted: 1,
    awakeIds: 1,
    awakeDeleted: 0,
    cards: [],
    persistedIds: [OWNER],
    sessionTitles,
  }
}

function makeState(items: WorkItem[], m: SessionMirror): BoardState {
  return {
    generatedAt: "2026-07-21T00:00:00Z",
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
    items,
    board: buildBoard(items, m),
    writesEnabled: true,
    sessionBackend: "unconfigured",
    promoteDecisions: {},
    todoSubStates: {},
    sessions: m,
  }
}

/** Render one card's visible title (the .cap-name inside the WI card). */
function cardTitle(it: WorkItem, m: SessionMirror): string {
  document.body.innerHTML = `<main>${renderBoardBody(makeState([it], m))}</main>`
  const card = document.querySelector('[data-key="wi:WI-035"]')!
  return card.querySelector(".cap-name")!.textContent!.trim()
}

// ── Pure helper unit coverage ─────────────────────────────────────────────────

describe("isPlaceholderTitle", () => {
  test("matches opencode's default placeholder (millis)", () =>
    expect(isPlaceholderTitle(PLACEHOLDER)).toBe(true))
  test("matches placeholder without millis and with offset tz", () => {
    expect(isPlaceholderTitle("New session - 2026-07-20T22:18:00Z")).toBe(true)
    expect(isPlaceholderTitle("New session - 2026-07-20T22:18:00+02:00")).toBe(true)
  })
  test("treats empty / whitespace as placeholder", () => {
    expect(isPlaceholderTitle("")).toBe(true)
    expect(isPlaceholderTitle("   ")).toBe(true)
    expect(isPlaceholderTitle(null)).toBe(true)
    expect(isPlaceholderTitle(undefined)).toBe(true)
  })
  test("does NOT match real titles or near-misses", () => {
    expect(isPlaceholderTitle(REAL_TITLE)).toBe(false)
    expect(isPlaceholderTitle("New session about placeholders")).toBe(false)
    expect(isPlaceholderTitle("Newer session - 2026-07-20T22:18:00.584Z")).toBe(false)
    expect(isPlaceholderTitle("New session - notadate")).toBe(false)
  })
})

describe("isRealSessionTitle (W-063/W-077 guard)", () => {
  test("a placeholder or blank live title is NOT usable", () => {
    expect(isRealSessionTitle(PLACEHOLDER)).toBe(false)
    expect(isRealSessionTitle("")).toBe(false)
    expect(isRealSessionTitle(null)).toBe(false)
  })
  test("a normal live title is usable", () => expect(isRealSessionTitle(REAL_TITLE)).toBe(true))
})

describe("displayTitle", () => {
  test("placeholder frontmatter + real live title → live title", () =>
    expect(displayTitle(PLACEHOLDER, OWNER, { [OWNER]: REAL_TITLE })).toBe(REAL_TITLE))
  test("normal frontmatter title is never overridden", () =>
    expect(displayTitle("My real title", OWNER, { [OWNER]: REAL_TITLE })).toBe("My real title"))
  test("placeholder + no usable live title → frontmatter unchanged", () => {
    expect(displayTitle(PLACEHOLDER, OWNER, { [OWNER]: PLACEHOLDER })).toBe(PLACEHOLDER)
    expect(displayTitle(PLACEHOLDER, OWNER, {})).toBe(PLACEHOLDER)
    expect(displayTitle(PLACEHOLDER, null, { [OWNER]: REAL_TITLE })).toBe(PLACEHOLDER)
    expect(displayTitle(PLACEHOLDER, OWNER, undefined)).toBe(PLACEHOLDER)
  })
})

// ── End-to-end: the rendered card ─────────────────────────────────────────────

describe("itemCard placeholder-title fallback (rendered)", () => {
  test("placeholder frontmatter title renders the real session title", () => {
    const title = cardTitle(item(PLACEHOLDER), mirror({ [OWNER]: REAL_TITLE }))
    expect(title).toBe(REAL_TITLE)
    expect(title).not.toContain("New session -")
  })

  test("normal frontmatter title renders unchanged (no override)", () => {
    // Even though the mirror has a different live title, a real frontmatter
    // title stays authoritative (I-144).
    const title = cardTitle(item("Deliberately named card"), mirror({ [OWNER]: REAL_TITLE }))
    expect(title).toBe("Deliberately named card")
  })

  test("placeholder title with no live title falls back gracefully", () => {
    // Mirror unavailable / no sessionTitles map at all → render placeholder,
    // no crash (unknown ≠ wrong, SNG-046).
    const title = cardTitle(item(PLACEHOLDER), mirror(undefined))
    expect(title).toBe(PLACEHOLDER)
  })

  test("placeholder title whose live title is ALSO a placeholder is not swapped", () => {
    const title = cardTitle(item(PLACEHOLDER), mirror({ [OWNER]: "New session - 2026-01-01T00:00:00Z" }))
    expect(title).toBe(PLACEHOLDER)
  })
})
