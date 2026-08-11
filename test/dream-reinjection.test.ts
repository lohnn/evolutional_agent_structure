import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { createCompactionHook, createEventHook, type HooksContext } from "../src/hooks.ts"
import { beginDream, completeDream } from "../src/lib/dream-state.ts"

/**
 * Hook-level tests for WI-081 (post-compaction dream re-injection).
 * NervousSystem is stubbed exactly like the WI-080 hook verification script;
 * dreams are REAL files written through the plugin's own begin/complete
 * lifecycle (no hand-forged YAML) so the scan exercises the true parser.
 */

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-reinject-test-"))
  for (const sub of [
    ".opencode/dreams/active",
    ".opencode/dreams/history",
    ".opencode/dreams/artifacts/insights",
    ".opencode/dreams/artifacts/warnings",
    ".opencode/dreams/artifacts/songlines",
    ".opencode/dreams/artifacts/shadows",
    ".opencode/agents/capabilities",
  ]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true })
  }
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function dreamBase(over: Record<string, unknown> = {}) {
  return {
    depth: 1,
    intention: "consolidate the frobnicate learnings before compaction eats them",
    intention_type: "CONSOLIDATION" as const,
    entry_time: "2026-08-11T00:00:00Z",
    project_context: "test",
    context_signals: { contradictions: 0, repetitions_detected: false, coherence: "HIGH" as const, threads_active: 1 },
    retain_high: [],
    retain_low: [],
    ...over,
  }
}

/** Begin+complete one dream through the real lifecycle; returns its id. */
function runDream(preCompaction: boolean, intention?: string): string {
  const { dreamId } = beginDream(dir, dreamBase({ pre_compaction: preCompaction, ...(intention ? { intention } : {}) }))
  completeDream(dir, "2026-08-11T01:00:00Z", [])
  return dreamId
}

interface NsCall { op: string; sessionID: string; text?: string }

function fakeNs(overrides: Record<string, unknown> = {}) {
  const calls: NsCall[] = []
  const ns = {
    calls,
    hasCapabilities: () => true,
    isSessionAwake: () => true,
    isCapabilitySession: () => false,
    isCoordinatorSession: () => true,
    getGroupID: () => "g",
    buildRoster: () => "ROSTER",
    formatMessages: () => null,
    buildQueueStatus: () => null,
    markActive: () => {},
    markIdle: () => {},
    injectNotice: async (sessionID: string, text: string) => {
      calls.push({ op: "injectNotice", sessionID, text })
    },
    handleFileChange: async () => null,
    ...overrides,
  }
  return ns
}

function ctxFor(ns: unknown, clientOverrides: Record<string, unknown> = {}): HooksContext {
  const client = {
    session: {
      get: async () => ({ data: { parentID: undefined } }), // default: top-level
      ...clientOverrides,
    },
  }
  return {
    ns: ns as HooksContext["ns"],
    client: client as unknown as HooksContext["client"],
    directory: dir,
    projectAgentsPath: path.join(dir, ".opencode/agents"),
    capabilitiesPath: path.join(dir, ".opencode/agents/capabilities"),
    rulesDir: "/nonexistent",
    log: () => {},
    debugLog: () => {},
    getLastSnapshot: () => ({}),
    setLastSnapshot: () => {},
    getActiveSessionId: () => "unknown",
    setActiveSessionId: () => {},
  }
}

// ── Layer A: compacting hook adds the pointer block ─────────────────────────

describe("createCompactionHook — dream pointer block (WI-081 A)", () => {
  test("pre-compaction dreams appear in the summarizer context; unflagged do not", async () => {
    const flagged = runDream(true)
    const unflagged = runDream(false)
    const hook = createCompactionHook(ctxFor(fakeNs()))
    const output = { context: [] as string[] }
    await hook({ sessionID: "ses_x" }, output)

    const block = output.context.find((c) => c.includes("HIVE dream pointers"))
    expect(block).toBeDefined()
    expect(block!).toContain(flagged)
    expect(block!).toContain("pre-compaction")
    expect(block!).toContain("hive_dream_query")
    expect(block!).not.toContain(unflagged)
  })

  test("intention is excerpted to one line (~80 chars)", async () => {
    runDream(true, "a ".repeat(100).trim())
    const hook = createCompactionHook(ctxFor(fakeNs()))
    const output = { context: [] as string[] }
    await hook({ sessionID: "ses_x" }, output)
    const block = output.context.find((c) => c.includes("HIVE dream pointers"))!
    const pointerLines = block.split("\n").filter((l) => l.startsWith("- DRM-"))
    expect(pointerLines.length).toBe(1)
    expect(pointerLines[0]!.length).toBeLessThan(160)
    expect(pointerLines[0]).toContain("…")
  })

  test("no pre-compaction dreams → no pointer block (capabilities summary still present)", async () => {
    runDream(false)
    const hook = createCompactionHook(ctxFor(fakeNs()))
    const output = { context: [] as string[] }
    await hook({ sessionID: "ses_x" }, output)
    expect(output.context.some((c) => c.includes("HIVE dream pointers"))).toBe(false)
  })

  test("caps at 5 dreams, most recent first", async () => {
    const ids: string[] = []
    for (let i = 0; i < 7; i++) ids.push(runDream(true, `dream ${i}`))
    const hook = createCompactionHook(ctxFor(fakeNs()))
    const output = { context: [] as string[] }
    await hook({ sessionID: "ses_x" }, output)
    const block = output.context.find((c) => c.includes("HIVE dream pointers"))!
    const mentioned = ids.filter((id) => block.includes(id))
    expect(mentioned.length).toBe(5)
    // newest 5 (the last five begun) survive; the oldest two are dropped
    expect(mentioned).toEqual(ids.slice(2))
    // most recent first
    expect(block.indexOf(ids[6]!)).toBeLessThan(block.indexOf(ids[2]!))
  })

  test("a corrupt history file never blocks compaction", async () => {
    runDream(true)
    fs.writeFileSync(path.join(dir, ".opencode/dreams/history/DRM-999.yaml"), "{{{{not yaml at all: [", "utf8")
    const hook = createCompactionHook(ctxFor(fakeNs()))
    const output = { context: [] as string[] }
    await hook({ sessionID: "ses_x" }, output) // must not throw
    expect(output.context.some((c) => c.includes("HIVE dream pointers"))).toBe(true)
  })
})

// ── Layer B: session.compacted injects the digest ───────────────────────────

describe("createEventHook — session.compacted digest (WI-081 B)", () => {
  async function fire(ns: unknown, sessionID = "ses_coord", clientOverrides: Record<string, unknown> = {}) {
    const hook = createEventHook(ctxFor(ns, clientOverrides))
    await hook({ event: { type: "session.compacted", properties: { sessionID } } })
  }

  test("awakened coordinator with pre-compaction dreams gets ONE noReply digest", async () => {
    const d1 = runDream(true, "first mid-session dream")
    runDream(false) // unflagged — must not appear
    const ns = fakeNs()
    await fire(ns)

    const injections = ns.calls.filter((c) => c.op === "injectNotice")
    expect(injections.length).toBe(1)
    const text = injections[0]!.text!
    expect(text).toContain("Compaction just rewrote early history")
    expect(text).toContain(d1)
    expect(text).toContain("hive_dream_query")
    expect(text).toContain("A final unflagged dream still closes your board item.")
    expect(injections[0]!.sessionID).toBe("ses_coord")
  })

  test("no pre-compaction dreams → no injection", async () => {
    runDream(false)
    const ns = fakeNs()
    await fire(ns)
    expect(ns.calls.length).toBe(0)
  })

  test("unawakened session → no injection (I-041 guard)", async () => {
    runDream(true)
    const ns = fakeNs({ isSessionAwake: () => false })
    await fire(ns)
    expect(ns.calls.length).toBe(0)
  })

  test("capability session → no injection", async () => {
    runDream(true)
    const ns = fakeNs({ isCapabilitySession: () => true, isCoordinatorSession: () => false })
    await fire(ns)
    expect(ns.calls.length).toBe(0)
  })

  test("HIVE not active (no capabilities) → no injection", async () => {
    runDream(true)
    const ns = fakeNs({ hasCapabilities: () => false })
    await fire(ns)
    expect(ns.calls.length).toBe(0)
  })

  test("injection failure is caught and never throws out of the hook", async () => {
    runDream(true)
    const ns = fakeNs({
      injectNotice: async () => { throw new Error("session busy/dead") },
    })
    await fire(ns) // must resolve, not reject
  })

  test("missing sessionID in event properties is a silent no-op", async () => {
    runDream(true)
    const ns = fakeNs()
    const hook = createEventHook(ctxFor(ns))
    await hook({ event: { type: "session.compacted", properties: {} } })
    expect(ns.calls.length).toBe(0)
  })

  // ── Registration-gap fallback (empirically hit in second-process verify) ──
  // A session created via `opencode run`/attach can compact BEFORE chat.message
  // registers it in this process → isCoordinatorSession() false. The fallback
  // parentID lookup must still deliver the digest for a top-level session.

  test("unregistered-but-awake top-level session: parentID fallback delivers the digest", async () => {
    runDream(true)
    const ns = fakeNs({ isCoordinatorSession: () => false }) // unregistered in-process
    await fire(ns, "ses_coord", { get: async () => ({ data: { parentID: undefined } }) })
    expect(ns.calls.filter((c) => c.op === "injectNotice").length).toBe(1)
  })

  test("unregistered session with a parentID (subagent) is skipped", async () => {
    runDream(true)
    const ns = fakeNs({ isCoordinatorSession: () => false })
    await fire(ns, "ses_child", { get: async () => ({ data: { parentID: "ses_parent" } }) })
    expect(ns.calls.length).toBe(0)
  })

  test("unregistered session whose lookup fails is treated as top-level (fail-open)", async () => {
    runDream(true)
    const ns = fakeNs({ isCoordinatorSession: () => false })
    await fire(ns, "ses_coord", { get: async () => { throw new Error("no sdk") } })
    expect(ns.calls.filter((c) => c.op === "injectNotice").length).toBe(1)
  })
})
