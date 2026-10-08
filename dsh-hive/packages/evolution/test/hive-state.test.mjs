// WI-083 — the HIVE-state snapshot builder + route payload shaping.
//
// Everything here reads LEDGER COPIES in a tmpdir (the real ledgers under
// /workspace/.opencode are never touched). The goal/agent live facts are
// stubbed with structural doubles (the route reads them through minimal
// faces), so the payload contract is testable without a host boot.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { bareId, buildSessionHiveSnapshot } from "@hive/dsh-evolution/lib/hive-state"
import { readLiveFacts } from "@hive/dsh-evolution/lib/hive-state-route"

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

function writeDream(dir, sub, dreamId, fields = {}) {
  const d = path.join(dir, ".opencode/dreams", sub)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(
    path.join(d, `${dreamId}.yaml`),
    [
      `dream_id: ${dreamId}`,
      'intention: "test dream"',
      `entry_time: ${fields.entryTime ?? "2026-10-08T08:00:00.000Z"}`,
      `exit_time: ${fields.entryTime ? fields.exitTime ?? "2026-10-08T08:10:00.000Z" : "null"}`,
      `status: ${fields.status ?? "COMPLETE"}`,
      "",
    ].join("\n"),
  )
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
  fs.writeFileSync(path.join(dir, ".opencode/dreams/index/telemetry/abc123.jsonl"), "{broken\n", { flag: "a" })
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

test("ambient dreams: active + recent history, 4-shape minimal parse", () => {
  const dir = mkWorkspace()
  writeLedgers(dir)
  writeDream(dir, "active", "DRM-090", { status: "DREAMING", entryTime: "2026-10-08T09:00:00.000Z" })
  writeDream(dir, "active", "DRM-091", { status: "DREAMING", entryTime: "2026-10-08T09:05:00.000Z" })
  writeDream(dir, "history", "DRM-057", { status: "COMPLETE", entryTime: "2026-10-08T10:19:27.971Z", exitTime: "2026-10-08T10:19:40.112Z" })
  // junk file must not crash
  fs.mkdirSync(path.join(dir, ".opencode/dreams/history"), { recursive: true })
  fs.writeFileSync(path.join(dir, ".opencode/dreams/history/not-a-drm.txt"), "ignore me")
  const snap = buildSessionHiveSnapshot(dir, "session-abc123")
  assert.equal(snap.dreamAmbient.activeCount, 2)
  assert.deepEqual(snap.dreamAmbient.active, [
    { dreamId: "DRM-091", entryTime: "2026-10-08T09:05:00.000Z" },
    { dreamId: "DRM-090", entryTime: "2026-10-08T09:00:00.000Z" },
  ])
  assert.equal(snap.dreamAmbient.recent.length, 1)
  assert.equal(snap.dreamAmbient.recent[0].dreamId, "DRM-057")
  assert.equal(snap.dreamAmbient.recent[0].status, "COMPLETE")
})

test("missing ledgers degrade to empty absences (tolerant reads)", () => {
  const dir = mkWorkspace() // no .opencode at all
  const snap = buildSessionHiveSnapshot(dir, "session-abc123")
  assert.equal(snap.hive.isCoordinator, false)
  assert.equal(snap.usageTotal, 0)
  assert.equal(snap.dreamEventTotal, 0)
  assert.equal(snap.dreamAmbient.activeCount, 0)
  assert.equal(snap.lastTick, null)
})

test("readLiveFacts: goal only for a LIVE agent, honest no-live-agent reason", () => {
  const agentsLive = { get: (id) => ({ id }), list: () => [{ id: "s1", status: "running" }, { id: "s2", status: "idle" }] }
  const goals = { get: (agent) => agent && { objective: "WI-083 overlay", status: "active", roundsStarted: 3, paused: false, createdAt: 1728000000000, updatedAt: 1728000000100 } }

  const live = readLiveFacts(undefined, undefined, "s1")
  assert.equal(live.goalReason, "no-live-agent")
  assert.equal(live.goal, null)

  const withGoal = readLiveFacts(agentsLive, goals, "s1")
  assert.equal(withGoal.goalReason, undefined)
  assert.equal(withGoal.goal.roundsStarted, 3)
  assert.equal(withGoal.goal.status, "active")
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
})

test("readLiveFacts tolerates lists that throw (agents count stays zero)", () => {
  const live = readLiveFacts({ get: () => ({ id: "s" }), list: () => { throw new Error("boom") } }, undefined, "s")
  assert.deepEqual(live.agents, [])
  assert.equal(live.runningAgents, 0)
})
