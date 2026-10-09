// WI-083 (v1.2) — the session ⟷ board pairing surface:
//   1. resolveSessionItem() pure unit tests (owner 1:1 bind first, group
//      fallback, id-shape variants, honest nulls).
//   2. the /api/hive-board/session-item route over the REAL store COPY (the
//      same throw-surface pattern as board-tab.test.mjs — fake webServer wait,
//      live store never written).
import { Context } from "@deepseek-ai/cordis"
import Board from "@hive/dsh-board"
import { resolveSessionItem } from "@hive/dsh-board/lib/session-item"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import test from "node:test"

// ── pure resolver ────────────────────────────────────────────────────────────

const ITEM_A = {
  id: "WI-083",
  title: "HIVE-state overlay",
  status: "in_progress",
  priority: "high",
  owner_session: "session-ac945505-3567-4aac-b683-9da796726d3a",
  group_id: "session-ac945505-3567-4aac-b683-9da796726d3a",
}
const ITEM_B = {
  id: "WI-042",
  title: "DSH live cutover",
  status: "in_progress",
  priority: "high",
  owner_session: "session-other-owner-000",
  group_id: "session-other-owner-000",
}
const ITEM_DONE = { id: "WI-001", title: "old work", status: "done", priority: "low", owner_session: "session-ac945505-3567-4aac-b683-9da796726d3a", group_id: null }

test("resolveSessionItem: owner match wins across id shapes (full, bare, prefixed-query)", () => {
  for (const asked of [
    "session-ac945505-3567-4aac-b683-9da796726d3a",
    "ac945505-3567-4aac-b683-9da796726d3a",
  ]) {
    const { item, matchedBy } = resolveSessionItem([ITEM_DONE, ITEM_B, ITEM_A], asked)
    assert.equal(matchedBy, "owner")
    assert.equal(item?.id, "WI-083")
    assert.equal(item?.status, "in_progress")
    assert.equal(item?.priority, "high")
  }
})

test("resolveSessionItem: group fallback covers dispatch-group children", () => {
  const childAsked = "session-ac945505-3567-4aac-b683-9da796726d3a"
  const grouped = { ...ITEM_A, owner_session: null, group_id: childAsked }
  const { item, matchedBy } = resolveSessionItem([grouped], childAsked)
  assert.equal(matchedBy, "group")
  assert.equal(item?.id, "WI-083")
})

test("resolveSessionItem (v1.3): a DONE owned item stays connected via its ownership", () => {
  const doneOwned = {
    ...ITEM_DONE,
    updated: "2026-10-09T07:00:00Z",
    transitions: [
      { at: "2026-10-08T16:53:00Z", from: null, to: "in_progress", by: "hive_board_bind", session: "session-ac945505-3567-4aac-b683-9da796726d3a" },
      { at: "2026-10-09T07:00:00Z", from: "in_progress", to: "done", by: "hive_board_complete", session: "session-ac945505-3567-4aac-b683-9da796726d3a" },
    ],
  }
  const { item, matchedBy, history, historyTotal } = resolveSessionItem([doneOwned], "session-ac945505-3567-4aac-b683-9da796726d3a")
  assert.equal(matchedBy, "owner")
  assert.equal(item.id, "WI-001")
  assert.equal(item.status, "done", "the card carries the CURRENT durable status")
  assert.equal(historyTotal, 2)
  assert.equal(history[0].to, "done", "latest transition first")
  assert.ok(history.some((t) => t.to === "in_progress" && t.by === "hive_board_bind"))
})

test("resolveSessionItem (v1.3): newest ownership evidence wins over older owned items", () => {
  const older = {
    ...ITEM_DONE,
    id: "WI-OLD",
    owner_session: "session-ac945505-3567-4aac-b683-9da796726d3a",
    updated: "2026-10-01T00:00:00Z",
  }
  const newer = { ...doneOwnedFixture(), updated: "2026-10-09T07:00:00Z" }
  const { item } = resolveSessionItem([older, newer], "session-ac945505-3567-4aac-b683-9da796726d3a")
  assert.equal(item.id, "WI-001")
})

function doneOwnedFixture() {
  return {
    id: "WI-001",
    title: "old work",
    status: "done",
    priority: "low",
    owner_session: "session-ac945505-3567-4aac-b683-9da796726d3a",
    group_id: null,
    updated: "2026-10-09T07:00:00Z",
    transitions: [
      { at: "2026-10-09T07:00:00Z", from: "in_progress", to: "done", by: "hive_board_complete", session: "session-ac945505-3567-4aac-b683-9da796726d3a" },
    ],
  }
}

test("resolveSessionItem: no ownership at all is honest null", () => {
  const stranger = { ...ITEM_A, owner_session: "session-someone-else", group_id: null, transitions: [], updated: "2026-10-09T00:00:00Z" }
  const { item, matchedBy, history, historyTotal } = resolveSessionItem([ITEM_A, ITEM_B, stranger], "session-nobody-000")
  assert.equal(item, null)
  assert.equal(matchedBy, null)
  assert.equal(history.length, 0)
  assert.equal(historyTotal, 0)
})

test("resolveSessionItem (v1.3): a LIVE in_progress bind outranks a settled done", () => {
  const settled = doneOwnedFixture()
  const live = { ...ITEM_A, updated: "2026-10-08T16:53:00Z" } // in_progress owner bind
  const { item, matchedBy } = resolveSessionItem([settled, live], "session-ac945505-3567-4aac-b683-9da796726d3a")
  assert.equal(matchedBy, "owner")
  assert.equal(item.status, "in_progress")
  assert.equal(item.id, "WI-083")
})

// ── route over the real store copy ───────────────────────────────────────────

const REAL_STORE = "/workspace/.opencode/board"
// find a REAL in_progress owned item to pair with (the verify uses the real
// store through a tmp COPY — never the live files).
function findRealOwnedPairing() {
  try {
    for (const name of fs.readdirSync(REAL_STORE)) {
      if (!name.endsWith(".md")) continue
      const raw = fs.readFileSync(path.join(REAL_STORE, name), "utf8")
      const status = raw.match(/^status:\s*(\S+)/m)?.[1]
      const owner = raw.match(/^owner_session:\s*(\S+)/m)?.[1]
      if (status === "in_progress" && owner) {
        return { sessionId: owner.replace(/^["']|["']$/g, ""), itemId: name.replace(/\.md$/, "") }
      }
    }
  } catch {}
  return null
}

test("the session-item route serves the real owned item over a store copy", async () => {
  const pairing = findRealOwnedPairing()
  if (!pairing) return // no owned pairing on this store — nothing to assert
  const routes = []
  const fake = { register: (route) => { routes.push(route); return () => {} } }
  const routeCtx = new Context()
  const SPMod = (await import("node:module")).createRequire("/root/.dsh/profiles/web/package.json")("@deepseek-ai/dsh-system-prompt")
  const SP = SPMod.default ?? SPMod.SystemPrompt
  const ToolsMod = (await import("node:module")).createRequire("/root/.dsh/profiles/web/package.json")("@deepseek-ai/dsh-tools")
  const Tools = ToolsMod.default ?? ToolsMod.Tools
  new SP(routeCtx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
  new Tools(routeCtx, {})

  const storeCopy = fs.mkdtempSync(path.join(os.tmpdir(), "hvs-pair-"))
  fs.cpSync(REAL_STORE, path.join(storeCopy, ".opencode/board"), { recursive: true })

  routeCtx.provide("webServer", fake)
  routeCtx.plugin(Board, { directory: storeCopy })
  await new Promise((r) => setTimeout(r, 120))

  const route = routes.find((r2) => r2.path === "/api/hive-board/session-item")
  assert.ok(route, "the wait must register the session-item route when webServer exists")

  // fire the handler through a minimal response recorder
  const call = (url) =>
    new Promise((resolve) => {
      let head = null
      const res = {
        writeHead: (code, headers) => (head = { code, ct: headers["content-type"] }),
        end: (body2) =>
          resolve({
            code: head?.code,
            ct: head?.ct,
            body: JSON.parse(body2),
            cacheControl: undefined,
          }),
      }
      route.handler({ url }, res)
    })

  const good = await call(`/api/hive-board/session-item?id=${encodeURIComponent(pairing.sessionId)}`)
  assert.equal(good.code, 200)
  assert.equal(good.body.ok, true)
  assert.equal(good.body.item?.id, pairing.itemId, "the real pairing resolves")
  assert.ok(good.body.matchedBy === "owner" || good.body.matchedBy === "group")
  // v1.3: the payload carries the resolved item's OWN transition history
  assert.ok(Array.isArray(good.body.history), "history array present")
  assert.equal(typeof good.body.historyTotal, "number")
  assert.ok(good.body.history.length <= 20, "history display-capped")
  const none2 = await call("/api/hive-board/session-item?id=session-not-a-real-owner-000")
  assert.equal(none2.body.history.length, 0)
  assert.equal(none2.body.historyTotal, 0)

  const none = await call("/api/hive-board/session-item?id=session-not-a-real-owner-000")
  assert.equal(none.body.ok, true)
  assert.equal(none.body.item, null, "an unowned session is an honest null, not an error")

  const bad = await call("/api/hive-board/session-item?id=../etc%20passwd")
  assert.equal(bad.body.ok, false)
  assert.equal(bad.body.error, "missing or malformed id query parameter")
})
