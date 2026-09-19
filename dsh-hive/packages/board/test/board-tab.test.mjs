// WI-062 slice 2 — the board tab seam, direct API tests:
//   1. tabIndex() payload shape/order over a real-store COPY (read-only).
//   2. The webServer WAIT registers /api/hive-board/index on a provided fake
//      webServer, and the handler serves the JSON payload (this is the throw
//      surface W-090 describes: cross-package reads only surface in direct
//      tests).
// HARD RULE: the live store at /workspace/.opencode/board is NEVER written —
// every read here goes against a tmp COPY (same rule as service-harness.mjs).
import { Context } from "@deepseek-ai/cordis"
import Board from "@hive/dsh-board"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import test from "node:test"

// ── boot via the real cordis class-plugin path (loader shape) ─────────────────
const { createRequire } = await import("node:module")
const require = createRequire("/root/.dsh/profiles/web/package.json")
const SPMod = require("@deepseek-ai/dsh-system-prompt")
const SP = SPMod.default ?? SPMod.SystemPrompt
const ToolsMod = require("@deepseek-ai/dsh-tools")
const Tools = ToolsMod.default ?? ToolsMod.Tools

const mkCtx = () => {
  const c = new Context()
  new SP(c, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
  new Tools(c, {})
  return c
}

// Real-store copy: READ-ONLY over a copy of the live board.
const realCopy = fs.mkdtempSync(path.join(os.tmpdir(), "board-tab-real-"))
fs.cpSync("/workspace/.opencode/board", path.join(realCopy, ".opencode/board"), { recursive: true })

const ctx = mkCtx()
ctx.plugin(Board, { directory: realCopy })
await new Promise((r) => setTimeout(r, 50))
const board = ctx.board

// ── 1. tabIndex payload ────────────────────────────────────────────────────────
test("tabIndex(live) — shape, ok flag, counts", () => {
  const payload = board.tabIndex()
  assert.equal(payload.ok, true)
  assert.equal(payload.status, "live")
  assert.equal(typeof payload.generated, "string")
  const all = board.items()
  const doneCount = all.filter((it) => it.status === "done").length
  assert.equal(payload.counts.total, all.length)
  assert.equal(payload.counts.done, doneCount)
  const liveRows = payload.columns.queued.length + payload.columns.in_progress.length
  assert.equal(liveRows, all.length - doneCount, "live payload carries every non-done item across the two live columns")
})

test("tabIndex(live) — done items never leak into the live columns", () => {
  const payload = board.tabIndex()
  for (const col of ["queued", "in_progress"]) {
    for (const row of payload.columns[col]) {
      assert.notEqual(row.status, "done", `${col} column must not contain done items`)
      assert.ok(row.status === "backlog" || row.status === "todo" || row.status === "in_progress")
    }
  }
  for (const row of payload.columns.done) {
    assert.equal(row.status, "done")
  }
  // col membership matches status
  for (const row of payload.columns.in_progress) assert.equal(row.status, "in_progress")
  for (const row of payload.columns.queued) assert.ok(["backlog", "todo"].includes(row.status))
})

test("tabIndex — row shape is exactly the contract surface (read-only fields)", () => {
  const payload = board.tabIndex("all")
  const sample = payload.columns.queued[0] ?? payload.columns.in_progress[0] ?? payload.columns.done[0]
  assert.ok(sample, "real board has at least one item")
  const expected = [
    "id", "title", "status", "priority", "owner", "paused", "tags", "body_bytes",
    "subtasks", "subtasks_done", "todo_mirror", "created", "updated", "recency", "problems",
  ].sort()
  assert.deepEqual(Object.keys(sample).sort(), expected)
  assert.equal(typeof sample.body_bytes, "number")
  assert.ok(Array.isArray(sample.problems), "problems is a string[] from computeProblems")
  for (const col of ["queued", "in_progress", "done"]) {
    for (const row of payload.columns[col]) assert.deepEqual(Object.keys(row).sort(), expected)
  }
})

test("tabIndex — presentation sort policy (priority first in queued; recency newest-first elsewhere)", () => {
  const rank = { high: 3, medium: 2, low: 1 }
  const payload = board.tabIndex("all")
  const queued = payload.columns.queued
  for (let i = 1; i < queued.length; i++) {
    const p = (rank[queued[i - 1].priority] ?? 0) - (rank[queued[i].priority] ?? 0)
    assert.ok(p >= 0, `queued priority order inverted between "${queued[i - 1].id}" and "${queued[i].id}"`)
    if (p === 0) {
      assert.ok(queued[i - 1].recency >= queued[i].recency, `queued recency tiebreak inverted within priority tier at ${queued[i].id}`)
    }
  }
  for (const col of ["in_progress", "done"]) {
    const rows = payload.columns[col]
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].recency >= rows[i].recency, `${col} recency order inverted at ${rows[i].id}`)
    }
  }
})

test("tabIndex(exact status) filters, 'all' totals, byte-compatible with board.items()", () => {
  const all = board.items()
  const done = board.tabIndex("done")
  assert.equal(done.counts.done, done.columns.done.length)
  const allPayload = board.tabIndex("all")
  const payloadRows = allPayload.columns.queued.length + allPayload.columns.in_progress.length + allPayload.columns.done.length
  assert.equal(payloadRows, all.length, "status=all carries every parsed item exactly once")
})

// ── 2. the webServer WAIT + route handler ─────────────────────────────────────
test("the webServer wait registers /api/hive-board/index and serves the JSON payload", async () => {
  const routes = []
  const fake = {
    register: (route) => {
      routes.push(route)
      return () => {}
    },
  }
  const routeCtx = mkCtx()
  // Provide the fake webServer BEFORE booting board — the wait fires as soon
  // as the service appears (this is exactly the order the real web makes).
  const provide = typeof routeCtx.provide === "function"
    ? routeCtx.provide.bind(routeCtx)
    : (routeCtx.reflect && typeof routeCtx.reflect.provide === "function" ? routeCtx.reflect.provide.bind(routeCtx.reflect) : null)
  assert.ok(provide, "a real cordis Context must expose provide")
  provide("webServer", fake)
  routeCtx.plugin(Board, { directory: realCopy })
  await new Promise((r) => setTimeout(r, 100))

  const route = routes.find((r) => r.path === "/api/hive-board/index")
  assert.ok(route, "the wait must register the exact index route when webServer exists")
  assert.equal(route.kind, "exact")

  // Fire the handler with a minimal response recorder.
  const written = { head: null, bodyChunks: [] }
  const res = {
    writeHead(code, headers) {
      written.head = { code, headers }
    },
    end(chunk) {
      written.bodyChunks.push(chunk)
    },
  }
  await route.handler({}, res)
  const body = JSON.parse(written.bodyChunks.join(""))
  assert.equal(written.head.code, 200)
  assert.equal(written.head.headers["content-type"], "application/json; charset=utf-8")
  assert.equal(written.head.headers["cache-control"], "no-store")
  assert.equal(body.ok, true)
  const all = board.items()
  const rows = body.columns.queued.length + body.columns.in_progress.length + body.columns.done.length
  assert.equal(rows, all.length, "handler serves the full board (live default excludes done from live columns; done column rides along)")
})

test("the handler stays ok-shaped when the payload builder throws", async () => {
  const routes = []
  const fake = { register: (route) => { routes.push(route); return () => {} } }
  const routeCtx = mkCtx()
  const provide = typeof routeCtx.provide === "function"
    ? routeCtx.provide.bind(routeCtx)
    : (routeCtx.reflect && typeof routeCtx.reflect.provide === "function" ? routeCtx.reflect.provide.bind(routeCtx.reflect) : null)
  provide("webServer", fake)
  // A missing directory makes items() fall back to [] (store tolerates) — so
  // to force a throw through the handler we point the service at an UNREADABLE
  // path: a regular FILE, not a directory.
  const blocker = path.join(realCopy, ".opencode/board-file-not-dir")
  fs.writeFileSync(blocker, "not a directory")
  routeCtx.plugin(Board, { directory: path.join(realCopy, ".opencode", "board-file-not-dir") })
  await new Promise((r) => setTimeout(r, 100))
  const route = routes.find((r) => r.path === "/api/hive-board/index")
  assert.ok(route, "route registers even against a broken store path")
  const chunks = []
  await route.handler({}, { writeHead: () => {}, end: (c) => chunks.push(c) })
  const body = JSON.parse(chunks.join(""))
  // items() tolerates missing dirs; a FILE at the board root makes readdir
  // throw ENOTDIR — either way the handler must answer JSON, ok:true or
  // ok:false, never crash the route.
  assert.ok(body.ok === true || body.ok === false)
  if (body.ok === false) assert.equal(typeof body.error, "string")
})

// ── slice-3 (WI-062): the viewer-parity extension of the same payload ─────────
// The parity engine consumes FULL records (the old /api/state shipped the same
// whole tokens); `columns` summaries above are UNTOUCHED for compatibility.

test("tabIndex — slice-3: items[] carries full store records with problems overlay", () => {
  const payload = board.tabIndex("all")
  assert.ok(Array.isArray(payload.items), "items is an array")
  assert.equal(payload.items.length, payload.counts.total, "items carries the whole board")
  const first = payload.items[0]
  assert.ok(first, "board non-empty")
  for (const key of [
    "id", "title", "status", "priority", "owner_session", "group_id", "origin",
    "paused", "spec_hash", "released_sessions", "dream_id", "artifacts",
    "created", "updated", "tags", "done_without_dream", "subtasks",
    "todo_mirror", "todo_mirror_updated", "transitions", "body", "problems",
  ]) {
    assert.ok(key in first, `items row missing "${key}"`)
  }
  assert.ok(Array.isArray(first.problems), "problems attached per item")
  assert.ok(Array.isArray(first.transitions) && first.transitions.every((t) => typeof t.at === "string" && typeof t.to === "string"), "transitions carry at/to (recency ordering + future item reader)")
  // every summary row resolved by a full record (single source of truth)
  for (const col of ["queued", "in_progress", "done"]) {
    for (const row of payload.columns[col]) {
      assert.ok(payload.items.some((it) => it.id === row.id), `full record present for column row ${row.id}`)
    }
  }
})

test("tabIndex — slice-3: boardBuild stamp + workspaceRoot present, never empty", () => {
  const payload = board.tabIndex()
  assert.equal(typeof payload.boardBuild, "string")
  assert.ok(payload.boardBuild.length > 0)
  assert.ok(payload.boardBuild === "unknown" || /^[0-9a-f]+(?:-dirty)?$/.test(payload.boardBuild), `build stamp shape: ${payload.boardBuild}`)
  assert.equal(typeof payload.workspaceRoot, "string")
  assert.ok(payload.workspaceRoot.length > 0)
  // when the stamp file exists it must agree with the payload verbatim
  try {
    const stamp = JSON.parse(fs.readFileSync(new URL("../dist/board-build.json", import.meta.url), "utf8"))
    assert.equal(payload.boardBuild, stamp.boardBuild)
  } catch {
    assert.equal(payload.boardBuild, "unknown", "no stamp file ⇒ payload says unknown, never a guess (I-152)")
  }
})

// ── slice 3b (WI-062): the item depth route — read-only, budgeted, raw title ──

test("tabItem route — registers /api/hive-board/item (exact) and serves a full record", async () => {
  const routes = []
  const fake = { register: (route) => { routes.push(route); return () => {} } }
  const routeCtx = mkCtx()
  const provide = typeof routeCtx.provide === "function"
    ? routeCtx.provide.bind(routeCtx)
    : (routeCtx.reflect && typeof routeCtx.reflect.provide === "function" ? routeCtx.reflect.provide.bind(routeCtx.reflect) : null)
  provide("webServer", fake)
  routeCtx.plugin(Board, { directory: realCopy })
  await new Promise((r) => setTimeout(r, 100))
  const route = routes.find((r) => r.path === "/api/hive-board/item")
  assert.ok(route, "item route registers beside the index route")
  assert.equal(route.kind, "exact")

  const all = board.items()
  const itemId = all.find((it) => it.id && all.length)?.id ?? all[0]?.id
  assert.ok(itemId, "board copy non-empty")
  const chunks = []
  await route.handler({ url: `/api/hive-board/item?id=${encodeURIComponent(itemId)}` }, {
    writeHead: () => {},
    end: (c) => chunks.push(c),
  })
  const body = JSON.parse(chunks.join(""))
  assert.equal(body.ok, true)
  assert.equal(body.id, itemId)
  const item = body.item
  assert.ok(item, "item record present")
  assert.equal(item.title, all.find((it) => it.id === itemId).title, "title rides RAW — the server never massages titles (SHADOW-019: presentation is the client's decision)")
  assert.equal(typeof item.body, "string")
  assert.ok(Array.isArray(item.problems), "problems overlay attached")
  assert.ok(Array.isArray(item.transitions) && item.transitions.length > 0, "history (transitions) carried")
  assert.ok(typeof item.recency === "string" && item.recency.length > 0, "recency present (strings — the shared recency key)")
  assert.equal(typeof body.bodyBytes, "number", "full byte count reported even when un-truncated")
  assert.equal(body.truncated, false, "small item is NOT flagged truncated")
  assert.ok("boardBuild" in body, "build stamp rides the item payload too")
})

test("tabItem route — unknown id answers ok:false with the id named, never a crash", async () => {
  const routes = []
  const fake = { register: (route) => { routes.push(route); return () => {} } }
  const routeCtx = mkCtx()
  const provide = typeof routeCtx.provide === "function"
    ? routeCtx.provide.bind(routeCtx)
    : (routeCtx.reflect && typeof routeCtx.reflect.provide === "function" ? routeCtx.reflect.provide.bind(routeCtx.reflect) : null)
  provide("webServer", fake)
  routeCtx.plugin(Board, { directory: realCopy })
  await new Promise((r) => setTimeout(r, 100))
  const route = routes.find((r) => r.path === "/api/hive-board/item")
  const chunks = []
  await route.handler({ url: "/api/hive-board/item?id=WI-99999" }, {
    writeHead: () => {},
    end: (c) => chunks.push(c),
  })
  const body = JSON.parse(chunks.join(""))
  assert.equal(body.ok, false)
  assert.deepEqual(body.missing, ["WI-99999"], "unknown ids are ALWAYS reported by name (readItems discipline)")
})

test("tabItem route — malformed ids refused at the handler, upstream-safe", async () => {
  const routes = []
  const fake = { register: (route) => { routes.push(route); return () => {} } }
  const routeCtx = mkCtx()
  const provide = typeof routeCtx.provide === "function"
    ? routeCtx.provide.bind(routeCtx)
    : (routeCtx.reflect && typeof routeCtx.reflect.provide === "function" ? routeCtx.reflect.provide.bind(routeCtx.reflect) : null)
  provide("webServer", fake)
  routeCtx.plugin(Board, { directory: realCopy })
  await new Promise((r) => setTimeout(r, 100))
  const route = routes.find((r) => r.path === "/api/hive-board/item")
  for (const raw of ["/api/hive-board/item", "/api/hive-board/item?id=", "/api/hive-board/item?id=../escape", "/api/hive-board/item?id=WI-9999%20extra"]) {
    const chunks = []
    await route.handler({ url: raw }, { writeHead: () => {}, end: (c) => chunks.push(c) })
    const body = JSON.parse(chunks.join(""))
    assert.equal(body.ok, false, `malformed id refused: ${raw}`)
    assert.equal(typeof body.error, "string")
  }
})

test("tabItem — spec body budget: truncated flag + full byte count, boards file untouched", async () => {
  // fixture board: one real WI copied shape, body padded far past the budget
  const fixtureBoard = fs.mkdtempSync(path.join(os.tmpdir(), "board-tab-item-"))
  const dir = path.join(fixtureBoard, ".opencode", "board")
  fs.mkdirSync(dir, { recursive: true })
  const longBody = "## Long spec\n\n" + ("lorem ipsum dolor sit amet. ".repeat(900)) // ~27k chars
  fs.writeFileSync(
    path.join(dir, "WI-9001.md"),
    `---\nid: WI-9001\ntitle: "budget fixture item"\nstatus: todo\nowner_session: null\ngroup_id: null\norigin: session-first\npaused: false\nspec_hash: null\nreleased_sessions: []\ndream_id: null\nartifacts: []\ncreated: 2026-09-19\nupdated: 2026-09-19\npriority: low\ntags: []\ndone_without_dream: false\nsubtasks: []\ntodo_mirror_updated: null\ntodo_mirror: []\ntransitions:\n  - { at: 2026-09-19T00:00:00Z, from: null, to: todo, by: fixture }\n---\n${longBody}\n`,
  )
  const ctx2 = mkCtx()
  // NOTE: the service's `directory` option is the WORKSPACE ROOT — it reads
  // <root>/.opencode/board (the realCopy tests pass the tmp root the same way).
  ctx2.plugin(Board, { directory: fixtureBoard })
  await new Promise((r) => setTimeout(r, 100))
  const payload = ctx2.board.tabItem("WI-9001")
  assert.equal(payload.ok, true)
  const full = ctx2.board.items().find((i) => i.id === "WI-9001")
  assert.ok(full, "fixture parsed by the store")
  assert.equal(payload.truncated, true, "oversized body IS flagged")
  assert.equal(payload.bodyBytes, full.body.length, "full byte count matches the store's own view")
  assert.equal(payload.item.body.length, 10_000, "body rides the display cap (10k)")
  assert.equal(payload.item.body, full.body.slice(0, 10_000), "capped body is a clean prefix of the real spec")
  assert.ok(fs.readFileSync(path.join(dir, "WI-9001.md"), "utf8").includes(longBody), "the board file was never written or trimmed")
})

// ── slice 3D/3E (WI-062): the live-activity feed + the HIVE/ambient split ─────
// Ground truth: agents.list() rows with status "running" (AgentStatus =
// 'idle' | 'running', @deepseek-ai/dsh-agent); the registry is LIVE-only, so
// dissolved sessions cannot staleness the signal by construction. 3E splits
// running rows by membership in HIVE's own ledger
// (<root>/.opencode/agents/hive-sessions.json — id-keyed member maps, the
// registry the awaken/bind tools stamp).

const bootBoardWithAgents = async (rows, { ledgerIds, ledgerAbsent } = {}) => {
  // own tmp root per boot so ledger writes can never leak between tests (the
  // realCopy root stays shared and read-only for the pre-3D assertions)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "board-tab-act-"))
  fs.cpSync("/workspace/.opencode/board", path.join(root, ".opencode/board"), { recursive: true })
  if (ledgerIds) {
    const agentsDir = path.join(root, ".opencode", "agents")
    fs.mkdirSync(agentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(agentsDir, "hive-sessions.json"),
      JSON.stringify({ v: 1, coordinators: Object.fromEntries(ledgerIds.map((id) => [id, { agent: "standard" }])) }, null, 2),
    )
  }
  const routeCtx = mkCtx()
  const agentList = (() => rows)
  const provide = typeof routeCtx.provide === "function"
    ? routeCtx.provide.bind(routeCtx)
    : (routeCtx.reflect && typeof routeCtx.reflect.provide === "function" ? routeCtx.reflect.provide.bind(routeCtx.reflect) : null)
  assert.ok(provide, "a real cordis Context must expose provide")
  provide("agents", { list: agentList })
  void ledgerAbsent
  routeCtx.plugin(Board, { directory: root })
  await new Promise((r) => setTimeout(r, 100))
  return routeCtx.board
}

test("tabIndex — slice 3D/3E: RUNNING-only count splits HIVE vs ambient via the ledger", async () => {
  const board2 = await bootBoardWithAgents(
    [
      { id: "session-aaa", status: "running" },
      { id: "session-bbb", status: "idle" },
      { id: "session-ccc", status: "running" },
      { id: "session-ddd" }, // undefined status — unknown is NEVER asserted busy
      { id: null, status: "running" }, // id-less row — running, never invented HIVE
    ],
    { ledgerIds: ["session-aaa", "session-ccc"] },
  )
  const payload = board2.tabIndex()
  assert.ok(payload.activity, "index payload grew the activity field")
  assert.equal(payload.activity.runningAgents, 3, "only status === 'running' rows count (2 + the id-less one)")
  assert.equal(payload.activity.hiveRunningAgents, 2, "ledger membership splits the HIVE tier")
  assert.equal(payload.activity.ledgerAvailable, true, "the join was sighted, not blind")
  assert.equal(payload.activity.feedAvailable, true)
  assert.equal(typeof payload.activity.sampledAt, "string")
  // the payload still carries everything the parity engine needs
  assert.ok(Array.isArray(payload.items) && payload.items.length === board2.items().length)
})

test("tabIndex — slice 3E: running but NOT in the ledger ⇒ ambient tier numbers, honestly flagged", async () => {
  const board2 = await bootBoardWithAgents(
    [{ id: "session-xxx", status: "running" }, { id: "session-yyy", status: "running" }, { id: "session-hive1", status: "running" }],
    { ledgerIds: ["session-hive1"] },
  )
  const payload = board2.tabIndex()
  assert.equal(payload.activity.runningAgents, 3)
  assert.equal(payload.activity.hiveRunningAgents, 1, "only the ledger member is HIVE")
  assert.equal(payload.activity.ledgerAvailable, true)
})

test("tabIndex — slice 3E: blind ledger (no file) ⇒ join stays blind, never guessing", async () => {
  const board2 = await bootBoardWithAgents([{ id: "session-aaa", status: "running" }])
  const payload = board2.tabIndex()
  assert.equal(payload.activity.runningAgents, 1)
  assert.equal(payload.activity.hiveRunningAgents, 0, "no ledger ⇒ nobody is called HIVE")
  assert.equal(payload.activity.ledgerAvailable, false, "blindness is VISIBLE in the payload")
})

test("tabIndex — slice 3D: zero running ⇒ quiet, honestly sampled", async () => {
  const board2 = await bootBoardWithAgents([{ id: "a", status: "idle" }, { id: "b", status: "idle" }])
  const payload = board2.tabIndex()
  assert.equal(payload.activity.runningAgents, 0)
  assert.equal(payload.activity.hiveRunningAgents, 0)
  assert.equal(payload.activity.feedAvailable, true)
})

test("tabIndex — slice 3D: no agents service ⇒ zeros + feedAvailable:false (shape-stable)", () => {
  // every other test in this file boots WITHOUT providing agents — the WAIT
  // never fires, and the payload must still be well-shaped and honest.
  const payload = board.tabIndex()
  assert.ok(payload.activity, "activity present even without the feed")
  assert.equal(payload.activity.runningAgents, 0)
  assert.equal(payload.activity.hiveRunningAgents, 0)
  assert.equal(payload.activity.feedAvailable, false)
})
