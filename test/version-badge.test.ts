/**
 * Version-badge / stale-tab detection tests.
 *
 * Two layers of proof:
 *  1. SERVER RENDER — renderBoardBody stamps the server's build SHA into the
 *     top meta line as #build-badge (with data-server-sha), and shows "build
 *     unknown" when git was unavailable.
 *  2. CLIENT DETECTION — the REAL bundled client (built via client-bundle.ts
 *     with a known baked-in SHA) is executed in happy-dom against a mocked
 *     /api/state whose buildSha differs, and we assert the badge deterministically
 *     flips to the stale state (W-061: staleness is caught by an explicit
 *     per-poll comparison, not assumed to self-heal). Match / unknown do NOT
 *     flip it (I-152: three deterministic verdicts).
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
import { renderBoardBody, renderPage } from "../src/web/render"

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
    sessions,
  }
}

describe("build badge — server render", () => {
  test("renders the server SHA in the top meta line", () => {
    const html = renderBoardBody(makeState("f4ff50b"))
    expect(html).toContain('id="build-badge"')
    expect(html).toContain('data-server-sha="f4ff50b"')
    expect(html).toContain("build f4ff50b")
  })

  test("shows 'build unknown' when git is unavailable", () => {
    const html = renderBoardBody(makeState("unknown"))
    expect(html).toContain('data-server-sha="unknown"')
    expect(html).toContain("build unknown")
  })

  test("dirty flag is carried through verbatim", () => {
    const html = renderBoardBody(makeState("f4ff50b-dirty"))
    expect(html).toContain("build f4ff50b-dirty")
  })
})

// ── Client stale-tab detection: execute the REAL bundle in happy-dom ──────────

/** Build the client bundle with a fixed baked-in SHA, write it, dynamic-import. */
async function loadClientBundle(clientSha: string): Promise<string> {
  const bundle = await buildClientBundle(clientSha)
  expect(bundle.ok).toBe(true)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-board-client-"))
  const file = path.join(dir, `client-${clientSha}.mjs`)
  fs.writeFileSync(file, bundle.js)
  return file
}

/**
 * Mount the page body (island + #board-root) into happy-dom. We strip the real
 * `<script src="/client.js">` — happy-dom can't fetch it and we import the
 * bundle explicitly below — while keeping the JSON island the client reads.
 */
function mountPage(state: BoardState): void {
  const page = renderPage(state)
  const body = page
    .slice(page.indexOf("<body>") + "<body>".length, page.indexOf("</body>"))
    .replace(/<script type="module" src="\/client\.js"><\/script>/, "")
  document.body.innerHTML = body
}

let originalFetch: typeof globalThis.fetch

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch
})

/** Drive one poll by stubbing fetch to return a state with the given serverSha. */
function stubStateFetch(serverSha: string): void {
  originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(makeState(serverSha)), {
      headers: { "content-type": "application/json" },
    })) as unknown as typeof globalThis.fetch
}

describe("build badge — client stale-tab detection (real bundle)", () => {
  test("mismatch (old client vs newer server) flips the badge to stale", async () => {
    // Server rendered with the NEW sha; client bundle baked with the OLD sha.
    mountPage(makeState("newsha1"))
    const file = await loadClientBundle("oldsha0")

    // Importing the bundle runs its top-level code, which stamps freshness from
    // the JSON island (server sha "newsha1" ≠ client "oldsha0" → stale).
    await import(file)

    const badge = document.getElementById("build-badge")!
    expect(badge.classList.contains("stale")).toBe(true)
    expect(badge.textContent).toContain("stale tab")
    expect(badge.textContent).toContain("oldsha0")
    expect(badge.textContent).toContain("newsha1")
  })

  test("match (same sha) leaves the badge fresh", async () => {
    mountPage(makeState("samesha"))
    const file = await loadClientBundle("samesha")
    await import(file)

    const badge = document.getElementById("build-badge")!
    expect(badge.classList.contains("stale")).toBe(false)
    expect(badge.textContent).toContain("build samesha")
  })

  test("unknown server sha cannot assert staleness (no false red)", async () => {
    mountPage(makeState("unknown"))
    const file = await loadClientBundle("realsha")
    await import(file)

    const badge = document.getElementById("build-badge")!
    expect(badge.classList.contains("stale")).toBe(false)
  })

  test("a later poll flips a fresh tab to stale when the server SHA changes", async () => {
    // Tab loaded fresh (island sha == client sha), THEN server restarts on a new
    // build — the next poll must catch it explicitly (W-061, not self-healing).
    mountPage(makeState("v1"))
    stubStateFetch("v2") // the poll will see a newer server
    const file = await loadClientBundle("v1")
    const mod = (await import(file)) as { poll?: () => Promise<void> }

    const badge = document.getElementById("build-badge")!
    expect(badge.classList.contains("stale")).toBe(false) // island matched at load

    // Trigger a poll deterministically (the module exports poll for testing).
    expect(typeof mod.poll).toBe("function")
    await mod.poll!()

    expect(badge.classList.contains("stale")).toBe(true)
    expect(badge.textContent).toContain("stale tab")
  })
})
