/**
 * WI-071 — the shared SCHEMA §3 invariant check.
 *
 * These rules previously lived inside board-viewer's `data/workitems.ts` and
 * were only asserted THROUGH it (test/board-viewer/workitems.test.ts, via
 * `parseWorkItem`). Now that both the plugin's read tools and the viewer depend
 * on one definition, the definition gets its own direct test: a consumer-side
 * test can go green while the shared contract has quietly changed underneath
 * the other consumer.
 *
 * Two classes of assertion here, and the second is the unusual one:
 *   1. Each checked invariant fires, and fires ALONE, on a minimal record.
 *   2. The UNCHECKED invariants stay unchecked. That is the module docstring's
 *      coverage-gap claim made executable. WI-071 deliberately declined to
 *      widen coverage — widening changes which items get flagged, which is a
 *      detection-behaviour change and not something a refactor should carry
 *      along. If someone later expands the rules, these tests fail and force
 *      them to read the gap note first rather than discovering the new flags
 *      on a live board.
 */
import { describe, test, expect } from "bun:test"
import type { WorkItem, WorkItemStatus } from "../src/lib/board-store.ts"
import { computeProblems } from "../src/lib/board-invariants.ts"

function item(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "WI-900",
    title: "fixture",
    status: "backlog" as WorkItemStatus,
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

describe("the three CHECKED invariants", () => {
  test("invariant 1 — in_progress without owner_session", () => {
    const p = computeProblems(item({ status: "in_progress", owner_session: null }))
    expect(p).toEqual(["in_progress without owner_session (invariant 1)"])
  })

  test("invariant 2 — done with neither dream_id nor the escape hatch", () => {
    const p = computeProblems(item({ status: "done" }))
    expect(p).toEqual(["done without dream_id or done_without_dream (invariant 2)"])
  })

  test("invariant 2 — satisfied by EITHER a dream_id or done_without_dream", () => {
    expect(computeProblems(item({ status: "done", dream_id: "DRM-015" }))).toEqual([])
    expect(computeProblems(item({ status: "done", done_without_dream: true }))).toEqual([])
  })

  test("invariant 3 — owner_session without group_id", () => {
    const p = computeProblems(
      item({ status: "in_progress", owner_session: "ses_x", group_id: null })
    )
    expect(p).toEqual(["owner_session without group_id (invariant 3)"])
  })

  test("invariant 3 fires on a NON-in_progress item too (it is about the pair, not the status)", () => {
    // An owner on a backlog item is itself odd, but the rule this function
    // encodes is "owner and group are stamped together" — narrowing it to
    // in_progress would silently stop flagging a real orphan.
    const p = computeProblems(item({ status: "backlog", owner_session: "ses_x" }))
    expect(p).toEqual(["owner_session without group_id (invariant 3)"])
  })

  test("violations accumulate rather than short-circuiting on the first", () => {
    const p = computeProblems(item({ status: "done", owner_session: "ses_x", group_id: null }))
    expect(p).toHaveLength(2)
    expect(p[0]).toContain("invariant 2")
    expect(p[1]).toContain("invariant 3")
  })

  test("a fully legal item reports nothing", () => {
    expect(
      computeProblems(
        item({ status: "in_progress", owner_session: "ses_x", group_id: "ses_x" })
      )
    ).toEqual([])
    expect(computeProblems(item({ status: "backlog" }))).toEqual([])
  })

  test("every message names its invariant number (SCHEMA.md is findable from the output)", () => {
    const p = computeProblems(
      item({ status: "done", owner_session: "ses_x", group_id: null })
    )
    for (const msg of p) expect(msg).toMatch(/\(invariant [1-6]\)$/)
  })
})

describe("coverage is deliberately PARTIAL — three of six, two of them weakened", () => {
  test("invariant 1 is WEAKENED: an owner that is not an awakened coordinator is NOT flagged", () => {
    // SCHEMA §3.1 also requires the owner be an awakened, top-level HIVE
    // coordinator session. Verifying that needs the live session map, which
    // would cost this function its purity. A nonsense owner id passes.
    expect(
      computeProblems(
        item({ status: "in_progress", owner_session: "not-a-session", group_id: "not-a-session" })
      )
    ).toEqual([])
  })

  test("invariant 2 is WEAKENED: dream_id PRESENCE is checked, DRM completeness is not", () => {
    // A dream_id pointing at a non-existent or non-COMPLETE DRM satisfies this
    // check. Confirming it would mean a second file read.
    expect(computeProblems(item({ status: "done", dream_id: "DRM-999" }))).toEqual([])
  })

  test("invariant 5 (session ⟷ item is 1:1) is UNCHECKED and cannot be checked here", () => {
    // It is a cross-item property; this signature only ever sees one item, so
    // two items owned by the same session both report clean.
    const a = item({ id: "WI-901", status: "in_progress", owner_session: "ses_d", group_id: "ses_d" })
    const b = item({ id: "WI-902", status: "in_progress", owner_session: "ses_d", group_id: "ses_d" })
    expect(computeProblems(a)).toEqual([])
    expect(computeProblems(b)).toEqual([])
  })

  test("an empty result means 'passes the three checked rules', NOT 'schema-clean'", () => {
    // The summarising assertion for this whole block, kept as one line a
    // reader cannot miss: nothing above proves legality.
    expect(computeProblems(item({ status: "done", dream_id: "DRM-does-not-exist" }))).toEqual([])
  })
})

describe("purity — the property that lets both the plugin and the browser call it", () => {
  test("the input is not mutated", () => {
    const it = item({ status: "in_progress", owner_session: null })
    const before = JSON.stringify(it)
    computeProblems(it)
    expect(JSON.stringify(it)).toBe(before)
  })

  test("repeated calls agree (no hidden state, no clock, no I/O)", () => {
    const it = item({ status: "done" })
    expect(computeProblems(it)).toEqual(computeProblems(it))
  })

  test("a fresh array each call — a caller may keep or mutate its own copy", () => {
    const it = item({ status: "done" })
    const a = computeProblems(it)
    a.push("caller scribble")
    expect(computeProblems(it)).toHaveLength(1)
  })
})
