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
