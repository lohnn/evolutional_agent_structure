import { describe, test, expect } from "bun:test"
import {
  parseDrmFromOutput,
  extractDreamCalls,
  buildSessionDreamMap,
  planReconcile,
  formatReconcileReport,
  planTitleBackfill,
  backfillTitles,
  type PartRow,
  type SessionInfo,
} from "../src/lib/board-reconcile.ts"
import type { WorkItem } from "../src/lib/board-store.ts"

// ── fixtures ──────────────────────────────────────────────────────────────────

function toolPart(sessionID: string, tool: string, output: string, at = 0): PartRow {
  return {
    session_id: sessionID,
    time_created: at,
    data: JSON.stringify({ type: "tool", tool, state: { status: "completed", output } }),
  }
}

/** The false-positive trap: a subagent `task` call whose PROMPT discusses dreams. */
function taskFalsePositive(sessionID: string): PartRow {
  return {
    session_id: sessionID,
    time_created: 5,
    data: JSON.stringify({
      type: "tool",
      tool: "task",
      state: {
        status: "completed",
        output: "Please call hive_dream_begin and hive_dream_complete for DRM-999 to consolidate.",
      },
    }),
  }
}

const BEGIN = "Dream DRM-015 opened (status: DREAMING). File: /workspace/.opencode/dreams/active/DRM-015.yaml"
const COMPLETE = "Dream DRM-015 completed.\n  Status: COMPLETE\n  History: .../DRM-015.yaml\n  Artifacts linked: 8"

describe("parseDrmFromOutput", () => {
  test("extracts DRM id from begin and complete outputs", () => {
    expect(parseDrmFromOutput(BEGIN)).toBe("DRM-015")
    expect(parseDrmFromOutput(COMPLETE)).toBe("DRM-015")
    expect(parseDrmFromOutput("no dream here")).toBeNull()
    expect(parseDrmFromOutput("Dream DRM-044 completed.")).toBe("DRM-044")
  })
})

describe("extractDreamCalls — tool-field filter (the false-positive fix)", () => {
  test("keeps genuine begin/complete, REJECTS task calls that merely mention DRM/hive_dream", () => {
    const rows: PartRow[] = [
      toolPart("ses_a", "hive_dream_begin", BEGIN, 1),
      toolPart("ses_a", "hive_dream_complete", COMPLETE, 2),
      taskFalsePositive("ses_a"), // must NOT produce a DRM-999 link
      // a non-tool part with dream text
      { session_id: "ses_a", time_created: 3, data: JSON.stringify({ type: "text", text: "DRM-123 discussed" }) },
      { session_id: "ses_a", time_created: 4, data: "not json at all {" },
    ]
    const calls = extractDreamCalls(rows)
    expect(calls.length).toBe(2)
    expect(calls.every((c) => c.drm === "DRM-015")).toBe(true)
    expect(calls.some((c) => c.drm === "DRM-999")).toBe(false)
  })

  test("skips tool calls whose output has no DRM id", () => {
    expect(extractDreamCalls([toolPart("s", "hive_dream_begin", "opened but no id")])).toEqual([])
  })
})

describe("buildSessionDreamMap", () => {
  test("pairs begin+complete for a DRM → completed:true", () => {
    const calls = extractDreamCalls([
      toolPart("ses_a", "hive_dream_begin", BEGIN, 1),
      toolPart("ses_a", "hive_dream_complete", COMPLETE, 2),
    ])
    const map = buildSessionDreamMap(calls)
    expect(map.get("ses_a")).toEqual([{ drm: "DRM-015", completed: true, at: 2 }])
  })

  test("begin without complete → completed:false (In-Progress evidence)", () => {
    const map = buildSessionDreamMap(extractDreamCalls([toolPart("ses_a", "hive_dream_begin", BEGIN, 1)]))
    expect(map.get("ses_a")).toEqual([{ drm: "DRM-015", completed: false, at: 1 }])
  })

  test("multi-dream session: several DRMs, sorted ascending, last completed is definer", () => {
    const b = (n: string) => `Dream ${n} opened (status: DREAMING).`
    const c = (n: string) => `Dream ${n} completed.\n  Status: COMPLETE`
    const map = buildSessionDreamMap(
      extractDreamCalls([
        toolPart("ses_m", "hive_dream_begin", b("DRM-026"), 10),
        toolPart("ses_m", "hive_dream_complete", c("DRM-026"), 11),
        toolPart("ses_m", "hive_dream_begin", b("DRM-028"), 20),
        toolPart("ses_m", "hive_dream_complete", c("DRM-028"), 21),
        toolPart("ses_m", "hive_dream_begin", b("DRM-029"), 30),
        toolPart("ses_m", "hive_dream_complete", c("DRM-029"), 31),
      ])
    )
    const dreams = map.get("ses_m")!
    expect(dreams.map((d) => d.drm)).toEqual(["DRM-026", "DRM-028", "DRM-029"])
    expect(dreams.every((d) => d.completed)).toBe(true)
    expect(dreams[dreams.length - 1]!.drm).toBe("DRM-029") // definer = latest
  })
})

// ── planReconcile ─────────────────────────────────────────────────────────────

function session(id: string, over: Partial<SessionInfo> = {}): SessionInfo {
  return { id, title: `Title ${id}`, parentID: null, groupID: id, ...over }
}
const allComplete = () => true
const noArtifacts = () => []

describe("planReconcile", () => {
  test("done ONLY when transcript-complete AND DRM file COMPLETE (belt & braces)", () => {
    const dreamMap = buildSessionDreamMap(
      extractDreamCalls([
        toolPart("ses_done", "hive_dream_begin", BEGIN, 1),
        toolPart("ses_done", "hive_dream_complete", COMPLETE, 2),
      ])
    )
    // transcript says complete, but the DRM file is NOT complete → In Progress
    const planNoFile = planReconcile([session("ses_done")], dreamMap, [], () => false, noArtifacts)
    expect(planNoFile.cards[0]!.status).toBe("in_progress")
    expect(planNoFile.cards[0]!.dreamID).toBeNull()

    // both agree → Done
    const planDone = planReconcile([session("ses_done")], dreamMap, [], allComplete, () => ["I-1", "W-1"])
    expect(planDone.cards[0]!.status).toBe("done")
    expect(planDone.cards[0]!.dreamID).toBe("DRM-015")
    expect(planDone.cards[0]!.artifacts).toEqual(["I-1", "W-1"])
  })

  test("begin without complete → In Progress, never Done (W-077)", () => {
    const dreamMap = buildSessionDreamMap(extractDreamCalls([toolPart("ses_x", "hive_dream_begin", BEGIN, 1)]))
    const plan = planReconcile([session("ses_x")], dreamMap, [], allComplete, noArtifacts)
    expect(plan.cards[0]!.status).toBe("in_progress")
    expect(plan.cards[0]!.incompleteDreams).toEqual(["DRM-015"])
  })

  test("no dreams at all → In Progress (live/paused)", () => {
    const plan = planReconcile([session("ses_live")], new Map(), [], allComplete, noArtifacts)
    expect(plan.cards[0]!.status).toBe("in_progress")
    expect(plan.cards[0]!.incompleteDreams).toEqual([])
  })

  test("idempotent: skips a session that already owns an item", () => {
    const existing = [{ owner_session: "ses_owned", released_sessions: [] } as unknown as WorkItem]
    const plan = planReconcile([session("ses_owned")], new Map(), existing, allComplete, noArtifacts)
    expect(plan.cards.length).toBe(0)
    expect(plan.skipped[0]).toMatchObject({ sessionID: "ses_owned", reason: "already-owned" })
  })

  test("tombstone-aware: skips a session in released_sessions[]", () => {
    const existing = [{ owner_session: null, released_sessions: ["ses_ghost"] } as unknown as WorkItem]
    const plan = planReconcile([session("ses_ghost")], new Map(), existing, allComplete, noArtifacts)
    expect(plan.cards.length).toBe(0)
    expect(plan.skipped[0]).toMatchObject({ sessionID: "ses_ghost", reason: "tombstoned" })
  })

  test("never cards a child session (parentID present)", () => {
    const plan = planReconcile([session("ses_child", { parentID: "ses_parent" })], new Map(), [], allComplete, noArtifacts)
    expect(plan.cards.length).toBe(0)
    expect(plan.skipped.length).toBe(0) // silently ignored, not even "skipped"
  })

  test("multi-COMPLETE-dream session: latest is dream_id, earlier ones preserved as lineage", () => {
    const c = (n: string) => `Dream ${n} completed.\n  Status: COMPLETE`
    const b = (n: string) => `Dream ${n} opened.`
    const dreamMap = buildSessionDreamMap(
      extractDreamCalls([
        toolPart("ses_m", "hive_dream_begin", b("DRM-026"), 10),
        toolPart("ses_m", "hive_dream_complete", c("DRM-026"), 11),
        toolPart("ses_m", "hive_dream_begin", b("DRM-029"), 30),
        toolPart("ses_m", "hive_dream_complete", c("DRM-029"), 31),
      ])
    )
    const plan = planReconcile([session("ses_m")], dreamMap, [], allComplete, () => ["I-9"])
    const card = plan.cards[0]!
    expect(card.status).toBe("done")
    expect(card.dreamID).toBe("DRM-029")
    expect(card.completedDreams).toEqual(["DRM-026", "DRM-029"]) // lineage kept
    expect(card.artifacts).toEqual(["I-9"]) // from the definer
  })
})

describe("formatReconcileReport (shared command/CLI formatter)", () => {
  const dreamMap = buildSessionDreamMap(
    extractDreamCalls([
      toolPart("ses_done", "hive_dream_begin", BEGIN, 1),
      toolPart("ses_done", "hive_dream_complete", COMPLETE, 2),
    ])
  )
  const plan = planReconcile(
    [session("ses_done"), session("ses_live")],
    dreamMap,
    [{ owner_session: null, released_sessions: ["ses_ghost"] } as unknown as WorkItem],
    allComplete,
    () => ["I-1"]
  )

  test("dry-run report: no-writes banner, sections, and re-run hint", () => {
    const r = formatReconcileReport(plan)
    expect(r).toContain("DRY RUN — no writes.")
    expect(r).toContain("1 Done, 1 In Progress")
    expect(r).toContain("ses_done → done  DRM-015")
    expect(r).toContain("ses_live → in_progress")
    expect(r).toContain("/reconcile --write")
    expect(r).not.toContain("Created")
  })

  test("executed report: written banner + created id range, no re-run-to-write hint", () => {
    const r = formatReconcileReport(plan, {
      created: [
        { sessionID: "ses_done", itemID: "WI-009", status: "done", dreamID: "DRM-015" },
        { sessionID: "ses_live", itemID: "WI-010", status: "in_progress", dreamID: null },
      ],
      skipped: plan.skipped,
      dryRun: false,
    })
    expect(r).toContain("RECONCILE EXECUTED — cards written.")
    expect(r).toContain("Created 2 item(s): WI-009..WI-010")
    expect(r).toContain("safe no-op")
    expect(r).not.toContain("--write` to create")
  })
})

// ── executeReconcile against a real temp board dir ───────────────────────────

import { executeReconcile } from "../src/lib/board-reconcile.ts"
import { listItems, readItem } from "../src/lib/board-store.ts"
import fs from "fs"
import os from "os"
import path from "path"

describe("executeReconcile (locked writes through board-store)", () => {
  test("dry run writes nothing; real run creates truthful cards with reconcile provenance", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-exec-"))
    try {
      const dreamMap = buildSessionDreamMap(
        extractDreamCalls([
          toolPart("ses_done", "hive_dream_begin", BEGIN, 1),
          toolPart("ses_done", "hive_dream_complete", COMPLETE, 2),
        ])
      )
      const plan = planReconcile(
        [session("ses_done"), session("ses_live")],
        dreamMap,
        [],
        allComplete,
        () => ["I-1", "W-1"]
      )

      const dry = await executeReconcile(dir, plan, true)
      expect(dry.dryRun).toBe(true)
      expect(listItems(dir).length).toBe(0) // nothing written

      const real = await executeReconcile(dir, plan, false)
      expect(real.created.length).toBe(2)
      const items = listItems(dir)
      expect(items.length).toBe(2)

      const done = items.find((i) => i.owner_session === "ses_done")!
      expect(done.status).toBe("done")
      expect(done.dream_id).toBe("DRM-015")
      expect(done.artifacts).toEqual(["I-1", "W-1"])
      expect(done.origin).toBe("session-first")
      expect(done.transitions[0]!.by).toBe("board:reconcile")
      expect(done.transitions.some((t) => t.to === "done" && t.by.startsWith("board:reconcile"))).toBe(true)

      const live = items.find((i) => i.owner_session === "ses_live")!
      expect(live.status).toBe("in_progress")
      expect(live.dream_id).toBeNull()

      // idempotency: re-running skips both (they now own items)
      const again = await executeReconcile(dir, plan, false)
      expect(again.created.length).toBe(0)
      expect(listItems(dir).length).toBe(2)
      void readItem
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("planTitleBackfill (retro-fix frozen placeholder titles)", () => {
  const wi = (over: Partial<WorkItem>): WorkItem => ({ owner_session: null, title: "", ...over } as unknown as WorkItem)
  const PLACEHOLDER = "New session - 2026-07-20T22:18:00.584Z"

  test("fixes owned items with a placeholder title when a real one exists", () => {
    const items = [
      wi({ id: "WI-035", owner_session: "ses_a", title: PLACEHOLDER }),
      wi({ id: "WI-036", owner_session: "ses_b", title: "Already real" }), // settled — skip
      wi({ id: "WI-037", owner_session: null, title: PLACEHOLDER }), // no owner — skip
    ]
    const titles: Record<string, string> = { ses_a: "The real title", ses_b: "different" }
    const fixes = planTitleBackfill(items, (s) => titles[s] ?? null)
    expect(fixes).toEqual([{ itemID: "WI-035", sessionID: "ses_a", from: PLACEHOLDER, to: "The real title" }])
  })

  test("skips when the DB title is itself a placeholder or missing (no timestamp-for-timestamp)", () => {
    const items = [
      wi({ id: "WI-1", owner_session: "ses_a", title: PLACEHOLDER }),
      wi({ id: "WI-2", owner_session: "ses_b", title: PLACEHOLDER }),
    ]
    const titles: Record<string, string> = { ses_a: "New session - 2026-07-20T23:00:00.000Z" }
    expect(planTitleBackfill(items, (s) => titles[s] ?? null)).toEqual([]) // ses_a placeholder, ses_b missing
  })

  test("accepts the ±offset ISO variant board-viewer verified in the DB", () => {
    const offset = "New session - 2026-07-20T22:18:00+02:00"
    const items = [wi({ id: "WI-9", owner_session: "ses_a", title: offset })]
    const fixes = planTitleBackfill(items, () => "Real title")
    expect(fixes.length).toBe(1)
  })

  test("backfillTitles dry-run plans without writing; real run patches via the locked path", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "title-backfill-"))
    try {
      const { createItem, findItemByOwner } = await import("../src/lib/board-store.ts")
      await createItem(dir, {
        title: PLACEHOLDER,
        status: "in_progress",
        owner_session: "ses_a",
        group_id: "ses_a",
        origin: "session-first",
        paused: false,
        spec_hash: null,
        released_sessions: [],
        dream_id: null,
        artifacts: [],
        priority: "medium",
        tags: [],
        done_without_dream: false,
        subtasks: [],
        transitions: [],
        body: "",
      } as unknown as WorkItem)
      const lookup = () => "The settled title"

      const dry = await backfillTitles(dir, listItems(dir), lookup, true)
      expect(dry.fixes.length).toBe(1)
      expect(findItemByOwner(dir, "ses_a")!.title).toBe(PLACEHOLDER) // unchanged

      const real = await backfillTitles(dir, listItems(dir), lookup, false)
      expect(real.fixes.length).toBe(1)
      expect(findItemByOwner(dir, "ses_a")!.title).toBe("The settled title")

      // idempotent: second run finds nothing (title now settled)
      const again = await backfillTitles(dir, listItems(dir), lookup, false)
      expect(again.fixes.length).toBe(0)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
