// Port of the OpenCode plugin's test/board-invariants.test.ts (bun:test →
// node:test), semantics preserved 1:1. The fixtures and every assertion
// match the original; only the runner and import targets changed (dist via
// the ./lib exports map, exactly how the cohort's other suites resolve).
import test from "node:test"
import assert from "node:assert/strict"

import { computeProblems } from "@hive/dsh-board/lib/board-invariants"

function item(over = {}) {
  return {
    id: "WI-900",
    title: "fixture",
    status: "backlog",
    owner_session: null,
    group_id: null,
    origin: "idea-first",
    paused: false,
    spec_hash: null,
    released_sessions: [],
    dream_id: null,
    artifacts: [],
    created: "2026-08-01",
    updated: "2026-08-01",
    priority: "medium",
    tags: [],
    done_without_dream: false,
    subtasks: [],
    todo_mirror: [],
    todo_mirror_updated: null,
    transitions: [],
    body: "",
    ...over,
  }
}

test("invariant 1 — in_progress without owner_session", () => {
  assert.deepEqual(computeProblems(item({ status: "in_progress" })), [
    "in_progress without owner_session (invariant 1)",
  ])
})

test("invariant 2 — done with neither dream_id nor the escape hatch", () => {
  assert.deepEqual(computeProblems(item({ status: "done" })), [
    "done without dream_id or done_without_dream (invariant 2)",
  ])
})

test("invariant 2 — satisfied by EITHER a dream_id or done_without_dream", () => {
  assert.deepEqual(computeProblems(item({ status: "done", dream_id: "DRM-041" })), [])
  assert.deepEqual(computeProblems(item({ status: "done", done_without_dream: true })), [])
})

test("invariant 3 — owner_session without group_id", () => {
  assert.deepEqual(computeProblems(item({ owner_session: "ses_x" })), [
    "owner_session without group_id (invariant 3)",
  ])
})

test("invariant 3 fires on a NON-in_progress item too (it is about the pair, not the status)", () => {
  assert.deepEqual(computeProblems(item({ status: "backlog", owner_session: "ses_x" })), [
    "owner_session without group_id (invariant 3)",
  ])
})

test("violations accumulate rather than short-circuiting on the first", () => {
  const p = computeProblems(item({ status: "done", owner_session: "ses_x", group_id: null }))
  assert.equal(p.length, 2)
  assert.ok(p[0].includes("invariant 2"))
  assert.ok(p[1].includes("invariant 3"))
})

test("a fully legal item reports nothing", () => {
  assert.deepEqual(computeProblems(item({ status: "in_progress", owner_session: "ses_x", group_id: "ses_x" })), [])
  assert.deepEqual(computeProblems(item({ status: "backlog" })), [])
})

test("every message names its invariant number (SCHEMA.md is findable from the output)", () => {
  const p = computeProblems(item({ status: "done", owner_session: "ses_x", group_id: null }))
  for (const msg of p) assert.match(msg, /\(invariant [1-6]\)$/)
})

// ── coverage is deliberately PARTIAL — three of six, two of them weakened ────

test("invariant 1 is WEAKENED: an owner that is not an awakened coordinator is NOT flagged", () => {
  // SCHEMA §3.1 also requires the owner be an awakened, top-level HIVE
  // coordinator session. Verifying that needs the live session map, which
  // would cost this function its purity. A nonsense owner id passes.
  assert.deepEqual(
    computeProblems(item({ status: "in_progress", owner_session: "not-a-session", group_id: "not-a-session" })),
    []
  )
})

test("invariant 2 is WEAKENED: dream_id PRESENCE is checked, DRM completeness is not", () => {
  // A dream_id pointing at a non-existent or non-COMPLETE DRM satisfies this
  // check. Confirming it would mean a second file read.
  assert.deepEqual(computeProblems(item({ status: "done", dream_id: "DRM-999" })), [])
})

test("invariant 5 (session ⟷ item is 1:1) is UNCHECKED and cannot be checked here", () => {
  // Cross-item property; this signature only ever sees one item, so two items
  // owned by the same session both report clean.
  const a = item({ id: "WI-901", status: "in_progress", owner_session: "ses_d", group_id: "ses_d" })
  const b = item({ id: "WI-902", status: "in_progress", owner_session: "ses_d", group_id: "ses_d" })
  assert.deepEqual(computeProblems(a), [])
  assert.deepEqual(computeProblems(b), [])
})

test("an empty result means 'passes the three checked rules', NOT 'schema-clean'", () => {
  // The summarising assertion for this whole block, kept as one line a
  // reader cannot miss: nothing above proves legality.
  assert.deepEqual(computeProblems(item({ status: "done", dream_id: "DRM-does-not-exist" })), [])
})

// ── purity — the property that lets both the plugin and the viewer call it ───

test("the input is not mutated", () => {
  const it = item({ status: "in_progress", owner_session: null })
  const before = JSON.stringify(it)
  computeProblems(it)
  assert.equal(JSON.stringify(it), before)
})

test("repeated calls agree (no hidden state, no clock, no I/O)", () => {
  const it = item({ status: "done" })
  assert.deepEqual(computeProblems(it), computeProblems(it))
})

test("a fresh array each call — a caller may keep or mutate its own copy", () => {
  const it = item({ status: "done" })
  const a = computeProblems(it)
  a.push("caller scribble")
  assert.equal(computeProblems(it).length, 1)
})
