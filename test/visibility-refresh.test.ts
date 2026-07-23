/**
 * Refresh-on-reopen tests — the tab-refocus / bfcache-restore trigger.
 *
 * A backgrounded tab has its setInterval throttled by the browser, so returning
 * to the board must NOT wait for the next (throttled) interval tick. client.ts
 * wires three lifecycle signals (visibilitychange + pageshow + focus), each of
 * which fires an immediate poll() when the page is visible. poll() is exported
 * for tests; here we execute the REAL bundle in happy-dom, stub /api/state, and
 * assert the fetch actually fires on the "became visible" transition.
 *
 * W-093 caution baked into the assertions: we prove the trigger genuinely
 * REACHES the fetch (a silent early-return would leave fetch count at 0), and
 * that the hidden-guard genuinely short-circuits (hidden page → no fetch).
 * SHADOW-006: idempotence is the design — a redundant re-poll must be harmless,
 * so we also assert multiple signals in a row simply re-fetch without error.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { buildBoard } from "../src/data/board"
import type { SessionMirror } from "../src/data/sessions"
import type { BoardState } from "../src/data/state"
import { loadWorkItems } from "../src/data/workitems"
import { buildClientBundle } from "../src/web/client-bundle"
import { renderPage } from "../src/web/render"

const FIXTURES = path.join(import.meta.dir, "..", "fixtures", "board")

beforeAll(() => GlobalRegistrator.register())
afterAll(() => GlobalRegistrator.unregister())

function makeState(buildSha: string): BoardState {
  const items = loadWorkItems(FIXTURES)
  const sessions: SessionMirror = {
    available: true,
    computedAt: "2026-07-10T12:00:00Z",
    totalPersisted: 1,
    awakeIds: 1,
    awakeDeleted: 0,
    cards: [],
    persistedIds: [],
  }
  return {
    generatedAt: "2026-07-10T12:00:00Z",
    workspaceRoot: "/workspace",
    buildSha,
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
    todoSubStates: {},
    actionRequired: {},
    sessionStatus: {},
    sessions,
  }
}

/** Build the client bundle with a fixed baked-in SHA, write it, dynamic-import. */
async function loadClientBundle(clientSha: string): Promise<string> {
  const bundle = await buildClientBundle(clientSha)
  expect(bundle.ok).toBe(true)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-board-vis-"))
  const file = path.join(dir, `client-${clientSha}.mjs`)
  fs.writeFileSync(file, bundle.js)
  return file
}

/** Mount the page body (island + #board-root) into happy-dom, sans <script>. */
function mountPage(state: BoardState): void {
  const page = renderPage(state)
  const body = page
    .slice(page.indexOf("<body>") + "<body>".length, page.indexOf("</body>"))
    .replace(/<script type="module" src="\/client\.js"><\/script>/, "")
  document.body.innerHTML = body
}

let originalFetch: typeof globalThis.fetch
let fetchCount = 0

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch
  // Reset the visibility override so tests don't leak the hidden state.
  setVisibility(false)
})

/** Stub /api/state and count how many times the client fetched it. */
function stubStateFetch(serverSha: string): void {
  originalFetch = globalThis.fetch
  fetchCount = 0
  globalThis.fetch = (async () => {
    fetchCount++
    return new Response(JSON.stringify(makeState(serverSha)), {
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof globalThis.fetch
}

/** Force document.hidden (happy-dom exposes it as a plain, overridable prop). */
function setVisibility(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  })
}

describe("refresh on reopen — visibility/pageshow/focus triggers (real bundle)", () => {
  test("visibilitychange while visible fires an immediate poll()", async () => {
    // Load the bundle (its top-level code registers the listeners). Stub fetch
    // AFTER import so the count reflects only the events we dispatch, not any
    // load-time poll (there is none — first paint comes from the island).
    mountPage(makeState("v1"))
    setVisibility(false) // visible
    await loadClientBundle("v1").then((f) => import(f))

    stubStateFetch("v1")
    document.dispatchEvent(new Event("visibilitychange"))
    // poll() is async; let the microtask/fetch settle.
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchCount).toBeGreaterThanOrEqual(1)
  })

  test("visibilitychange while HIDDEN does NOT poll (guard short-circuits)", async () => {
    // The became-visible pattern must ignore the visible→hidden edge. If the
    // guard leaked, this would fetch — proving W-093 in reverse.
    stubStateFetch("v1")
    setVisibility(true) // hidden
    document.dispatchEvent(new Event("visibilitychange"))
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchCount).toBe(0)
  })

  test("pageshow (bfcache restore) fires a poll when visible", async () => {
    stubStateFetch("v1")
    setVisibility(false) // visible
    window.dispatchEvent(new Event("pageshow"))
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchCount).toBeGreaterThanOrEqual(1)
  })

  test("focus fires a poll when visible", async () => {
    stubStateFetch("v1")
    setVisibility(false) // visible
    window.dispatchEvent(new Event("focus"))
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchCount).toBeGreaterThanOrEqual(1)
  })

  test("redundant signals are harmless (idempotent resume — SHADOW-006)", async () => {
    stubStateFetch("v1")
    setVisibility(false) // visible
    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("pageshow"))
    window.dispatchEvent(new Event("focus"))
    await Promise.resolve()
    await Promise.resolve()

    // Each visible signal re-polls; the point is it doesn't throw and each call
    // reaches the fetch. One poll per signal.
    expect(fetchCount).toBe(3)
  })
})
