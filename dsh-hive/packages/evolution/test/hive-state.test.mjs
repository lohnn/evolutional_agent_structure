// WI-083 (v1.1) — the HIVE-state snapshot builder + route payload shaping.
//
// Everything here reads LEDGER COPIES in a tmpdir (the real ledgers under
// /workspace/.opencode are never touched). The goal/agent/subagent live
// facts are stubbed with structural doubles (the route reads them through
// minimal faces), so the payload contract is testable without a host boot.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import {
  bareId,
  buildSessionHiveSnapshot,
  assembleChildren,
} from "@hive/dsh-evolution/lib/hive-state"
import {
  readLiveFacts,
  isLiveId,
  parseSessionId,
  fetchChildren,
} from "@hive/dsh-evolution/lib/hive-state-route"

function mkWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "evo-hivestate-"))
}

function writeLedgers(dir, { coordinators = {}, marks = [], tick = null } = {}) {
  const agentsDir = path.join(dir, ".opencode/agents")
  fs.mkdirSync(agentsDir, { recursive: true })
  fs.writeFileSync(path.join(agentsDir, "hive-sessions.json"), JSON.stringify({ v: 1, coordinators }, null, 2))
  fs.writeFileSync(path.join(agentsDir, "hive-state.json"), JSON.stringify({ lastTick: tick, usageLog: marks }, null, 2))
}

function writeTelemetry(dir, idBare, rows) {
  const tel = path.join(dir, ".opencode/dreams/index/telemetry")
  fs.mkdirSync(tel, { recursive: true })
  fs.writeFileSync(path.join(tel, `${idBare}.jsonl`), rows.map((r) => JSON.stringify(r)).join("\n") + "\n")
}

test("bareId normalizes both ledger id shapes", () => {
  assert.equal(bareId("session-0d6bec1"), "0d6bec1")
  assert.equal(bareId("0d6bec1"), "0d6bec1")
  assert.equal(bareId("session-session-x"), "session-x")
})

test("coordinator session replays the awaken record verbatim", () => {
  const dir = mkWorkspace()
  writeLedgers(dir, {
    coordinators: {
      "session-abc123": { agent: "hive-infra", awakenedAt: "2026-10-08T10:00:00.000Z", lastAwakenInput: "build the thing" },
    },
  })
  const snap = buildSessionHiveSnapshot(dir, "session-abc123")
  assert.equal(snap.hive.isCoordinator, true)
  assert.equal(snap.hive.agent, "hive-infra")
  assert.equal(snap.hive.awakenedAt, "2026-10-08T10:00:00.000Z")
  assert.equal(snap.hive.lastAwakenInput, "build the thing")
  assert.equal(snap.usageMarks.length, 0)
})

test("dormant session is honestly absent (D1) — no fabricated rows", () => {
  const dir = mkWorkspace()
  writeLedgers(dir, { coordinators: { "session-other": { agent: "x", awakenedAt: "2026-10-08T10:00:00.000Z", lastAwakenInput: "" } } })
  const snap = buildSessionHiveSnapshot(dir, "session-abc123")
  assert.equal(snap.hive.isCoordinator, false)
  assert.equal(snap.hive.agent, undefined)
  assert.deepEqual(snap.usageMarks, [])
})

test("usage marks join on BOTH id shapes and stay capped", () => {
  const dir = mkWorkspace()
  const marks = Array.from({ length: 60 }, (_, i) => ({
    capability: "cap",
    sessionId: i < 55 ? "abc123" : "session-abc123",
    timestamp: new Date(2026, 9, 8, 12, 0, i).toISOString(),
  }))
  writeLedgers(dir, { marks })
  const snap = buildSessionHiveSnapshot(dir, "session-abc123")
  assert.equal(snap.usageTotal, 60)
  assert.equal(snap.usageMarks.length, 50) // listCap drops oldest, count stays honest
})

test("dream telemetry rides the bare id and parses rows tolerantly", () => {
  const dir = mkWorkspace()
  writeLedgers(dir)
  writeTelemetry(dir, "abc123", [
    { ts: "2026-10-08T08:00:00.000Z", tool: "rank" },
    { ts: "2026-10-08T08:01:00.000Z", tool: "query" },
  ])
  fs.appendFileSync(path.join(dir, ".opencode/dreams/index/telemetry/abc123.jsonl"), "{broken\n")
  const snap = buildSessionHiveSnapshot(dir, "session-abc123")
  assert.equal(snap.dreamEventTotal, 2)
  assert.equal(snap.dreamEvents.length, 2)
  assert.deepEqual(snap.dreamEvents[0], { ts: "2026-10-08T08:00:00.000Z", tool: "rank" })
})

test("events of OTHER sessions never appear (telemetry keyed by id)", () => {
  const dir = mkWorkspace()
  writeLedgers(dir)
  writeTelemetry(dir, "zzz-other", [{ ts: "2026-10-08T08:00:00.000Z", tool: "rank" }])
  const snap = buildSessionHiveSnapshot(dir, "session-abc123")
  assert.equal(snap.dreamEventTotal, 0)
})

test("missing ledgers degrade to empty absences (tolerant reads)", () => {
  const dir = mkWorkspace() // no .opencode at all
  const snap = buildSessionHiveSnapshot(dir, "session-abc123")
  assert.equal(snap.hive.isCoordinator, false)
  assert.equal(snap.usageTotal, 0)
  assert.equal(snap.dreamEventTotal, 0)
})

test("assembleChildren joins the catalog with child marks (capability flavor)", () => {
  const catalog = [
    { id: "session-c1", createdAt: 1791470002000, mode: "continuable", label: "wi-083-state-overlay" },
    { id: "session-c2", createdAt: 1791470001000, mode: "one-shot" },
    { id: "", createdAt: 0 }, // malformed row skips, never crashes
  ]
  const marks = [
    { capability: "dsh-hive-plugins", sessionId: "c1", timestamp: "2026-10-08T16:55:41.199Z" },
    { capability: "self", sessionId: "session-parent", timestamp: "2026-10-08T16:00:00.000Z" }, // the parent's own mark — never a child
  ]
  const { children, total } = assembleChildren(catalog, marks, "session-parent")
  assert.equal(total, 2)
  // oldest dispatch first
  assert.equal(children[0].id, "session-c2")
  assert.equal(children[0].capability, undefined) // no mark for c2
  assert.equal(children[1].id, "session-c1")
  assert.equal(children[1].capability, "dsh-hive-plugins")
  assert.equal(children[1].label, "wi-083-state-overlay")
  assert.equal(children[1].createdAtMs, 1791470002000)
})

test("assembleChildren caps and keeps the honest total", () => {
  const catalog = Array.from({ length: 60 }, (_, i) => ({
    id: `session-c${i}`,
    createdAt: 1000 + i,
    mode: "one-shot",
  }))
  const { children, total } = assembleChildren(catalog, [], "session-parent", { listCap: 50 })
  assert.equal(total, 60)
  assert.equal(children.length, 50)
  assert.equal(children[children.length - 1].id, "session-c59") // newest kept
})

test("readLiveFacts: goal only for a LIVE agent, honest no-live-agent reason", () => {
  const agentsLive = { get: (id) => ({ id }), list: () => [{ id: "s1", status: "running" }, { id: "s2", status: "idle" }] }
  const goals = { get: (agent) => agent && { objective: "WI-083 overlay", status: "active", roundsStarted: 3, paused: false, createdAt: 1728000000000, updatedAt: 1728000000100 } }

  const none = readLiveFacts(undefined, undefined, "s1")
  assert.equal(none.goalReason, "no-live-agent")
  assert.equal(none.goal, null)
  assert.equal(none.live, false)

  const withGoal = readLiveFacts(agentsLive, goals, "s1")
  assert.equal(withGoal.goalReason, undefined)
  assert.equal(withGoal.goal.roundsStarted, 3)
  assert.equal(withGoal.live, true)
  assert.deepEqual(withGoal.agents, [
    { id: "s1", status: "running" },
    { id: "s2", status: "idle" },
  ])
  assert.equal(withGoal.runningAgents, 1)

  const noGoalYet = readLiveFacts(agentsLive, { get: () => undefined }, "s1")
  assert.equal(noGoalYet.goalReason, undefined)
  assert.equal(noGoalYet.goal, null) // live agent, simply no goal

  const throwing = readLiveFacts({ get: () => { throw new Error("boom") }, list: () => [] }, goals, "s1")
  // a get() that throws means the agent is NOT resolvable — honest degradation
  assert.equal(throwing.goalReason, "no-live-agent")
  assert.equal(throwing.goal, null)
  assert.equal(throwing.live, false)
})

test("readLiveFacts tolerates lists that throw (agents count stays zero)", () => {
  const live = readLiveFacts({ get: () => ({ id: "s" }), list: () => { throw new Error("boom") } }, undefined, "s")
  assert.deepEqual(live.agents, [])
  assert.equal(live.runningAgents, 0)
})

test("isLiveId matches either id shape among registry rows", () => {
  const rows = [{ id: "session-acb", status: "running" }]
  assert.equal(isLiveId(rows, "session-acb"), true)
  assert.equal(isLiveId(rows, "acb"), true)
  assert.equal(isLiveId(rows, "session-other"), false)
  assert.equal(isLiveId([], "acb"), false)
})

test("parseSessionId tolerates junk URLs and keeps well-formed ids", () => {
  assert.equal(parseSessionId("/api/hive-state/session?id=session-abc"), "session-abc")
  assert.equal(parseSessionId("/api/hive-state/session"), "")
  assert.equal(parseSessionId("/api/hive-state/session?id="), "")
})

test("fetchChildren degrades on missing, throwing, sync and async services", async () => {
  assert.deepEqual(await fetchChildren(undefined, "session-x"), [])
  assert.deepEqual(await fetchChildren({}, "session-x"), [])
  assert.deepEqual(
    await fetchChildren({ listChildren: () => { throw new Error("boom") } }, "session-x"),
    [],
  )
  const rows = [{ id: "session-c", createdAt: 1, mode: "one-shot" }]
  assert.deepEqual(await fetchChildren({ listChildren: () => rows }, "session-x"), rows)
  // async services are awaitable too
  assert.deepEqual(
    await fetchChildren({ listChildren: () => Promise.resolve(rows) }, "session-x"),
    rows,
  )
})
