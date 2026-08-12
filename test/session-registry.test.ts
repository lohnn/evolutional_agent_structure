/**
 * WI-070 — the NervousSystem registry as a whole: load-time retention, the
 * server-verified identity resolution that replaced the group GUESS, and the
 * eviction path.
 *
 * These use a fake client rather than a live server. What that buys is the one
 * thing a live two-coordinator scenario cannot give you on demand: a 404 at a
 * chosen moment, and a parent chain of a chosen shape. What it does NOT prove
 * is the SDK's real response shape — that was checked separately against the
 * running server (a missing id returns HTTP 404 with
 * {"name":"NotFoundError",...}; session.get returns `agent` and `parentID`).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { NervousSystem } from "../src/lib/nervous-system.js"

// ── Fake server ───────────────────────────────────────────────────────────────

interface FakeSession {
  agent: string
  parentID?: string
}

function makeClient(sessions: Record<string, FakeSession>) {
  const prompts: { id: string; text: string }[] = []
  const promptAsyncs: { id: string; text: string }[] = []
  let getCalls = 0
  const client = {
    session: {
      get: async ({ path: p }: { path: { id: string } }) => {
        getCalls++
        const s = sessions[p.id]
        if (!s) {
          return { error: { name: "NotFoundError", data: { message: "Session not found" } }, response: { status: 404 } }
        }
        return { data: { id: p.id, agent: s.agent, ...(s.parentID && { parentID: s.parentID }) } }
      },
      prompt: async ({ path: p, body }: any) => {
        if (!sessions[p.id]) throw new Error("no such session")
        prompts.push({ id: p.id, text: body.parts[0].text })
        return { data: {} }
      },
      promptAsync: async ({ path: p, body }: any) => {
        if (!sessions[p.id]) throw new Error("no such session")
        promptAsyncs.push({ id: p.id, text: body.parts[0].text })
        return { data: {} }
      },
    },
  }
  return { client: client as any, prompts, promptAsyncs, getCalls: () => getCalls }
}

// ── Workspace fixture ─────────────────────────────────────────────────────────

let dir: string
const statePath = () => path.join(dir, ".opencode/hivemind/.nervous-system-state.json")
const logPath = () => path.join(dir, ".opencode/hivemind/registry-log.jsonl")

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wi070-"))
  fs.mkdirSync(path.join(dir, ".opencode/hivemind/inbox"), { recursive: true })
  fs.mkdirSync(path.join(dir, ".opencode/agents/capabilities"), { recursive: true })
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function writeState(sessions: unknown[], awakeSessions: string[] = []): void {
  fs.writeFileSync(statePath(), JSON.stringify({ sessions, awakeSessions }, null, 2))
}
function readLog(): Record<string, unknown>[] {
  try {
    return fs
      .readFileSync(logPath(), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

const COORD = "ses_coord0000000000000000000"
const CAP = "ses_cap000000000000000000000"

// ── CRITERION 3: restart hygiene ──────────────────────────────────────────────

describe("load-time retention (criterion 3)", () => {
  test("placeholders and subagent sessions do not survive a restart", () => {
    writeState(
      [
        { id: "ses_COORD_ACTIVE", agent: "build" },
        { id: "ses_CAP_NEW", agent: "capabilities/x" },
        { id: "ses_dream00000000000000000", agent: "dreamcatcher" },
        { id: "ses_explore0000000000000000", agent: "explore" },
        { id: COORD, agent: "build", groupID: COORD },
        { id: CAP, agent: "capabilities/hive-infra", groupID: COORD },
      ],
      ["ses_COORD_ACTIVE", COORD]
    )
    const { client } = makeClient({})
    const ns = new NervousSystem(client, dir)

    expect(ns.registrySnapshot().map((r) => r.id).sort()).toEqual([CAP, COORD].sort())
    // The awake orphan goes with its record — referentially, not by inference.
    expect(ns.isSessionAwake("ses_COORD_ACTIVE")).toBe(false)
    expect(ns.isSessionAwake(COORD)).toBe(true)
  })

  test("the prune reaches DISK, or it is not a prune (W-061)", () => {
    writeState([
      { id: "ses_COORD_ACTIVE", agent: "build" },
      { id: COORD, agent: "build", groupID: COORD },
    ])
    const { client } = makeClient({})
    new NervousSystem(client, dir)

    const persisted = JSON.parse(fs.readFileSync(statePath(), "utf8"))
    expect(persisted.sessions.map((s: any) => s.id)).toEqual([COORD])

    // ...and a second load has nothing left to drop.
    const before = readLog().length
    new NervousSystem(client, dir)
    expect(readLog().length).toBe(before)
  })

  test("every drop is recorded in the audit trail at the hivemind root (I-312)", () => {
    writeState([
      { id: "ses_CAP_NEW", agent: "capabilities/x" },
      { id: "ses_dream00000000000000000", agent: "dreamcatcher" },
      { id: COORD, agent: "build", groupID: COORD },
    ])
    new NervousSystem(makeClient({}).client, dir)

    const log = readLog()
    expect(log).toHaveLength(2)
    expect(log.every((e) => e.v === 1 && e.event === "load-drop")).toBe(true)
    expect(log.map((e) => e.reason).sort()).toEqual(["invalid-id", "non-participating-role"])
    // At the subsystem root, not inside the thing being pruned.
    expect(fs.existsSync(logPath())).toBe(true)
  })

  test("liveness is never restored from disk", () => {
    writeState([{ id: COORD, agent: "build", groupID: COORD, role: "coordinator", verified: true }])
    const ns = new NervousSystem(makeClient({}).client, dir)
    expect(ns.registrySnapshot()[0]!.active).toBe(false)
  })
})

// ── Identity resolution ───────────────────────────────────────────────────────

describe("registerSession resolves identity from the server", () => {
  test("a capability's group is the ROOT of its parent chain, not a guess", async () => {
    const { client } = makeClient({
      [COORD]: { agent: "build" },
      [CAP]: { agent: "capabilities/hive-infra", parentID: COORD },
    })
    const ns = new NervousSystem(client, dir)

    // A DIFFERENT coordinator registers first and is active — this is exactly
    // what the old findCoordinatorSession() would have handed the capability.
    const other = "ses_other0000000000000000000"
    await ns.registerSession(other, "build")
    await ns.registerSession(CAP, "capabilities/hive-infra")

    expect(ns.getGroupID(CAP)).toBe(COORD)
    expect(ns.getGroupID(CAP)).not.toBe(other)
  })

  test("a top-level session is its own group and is classified coordinator", async () => {
    const { client } = makeClient({ [COORD]: { agent: "build" } })
    const ns = new NervousSystem(client, dir)
    await ns.registerSession(COORD, "build")
    expect(ns.getGroupID(COORD)).toBe(COORD)
    expect(ns.isCoordinatorSession(COORD)).toBe(true)
    expect(ns.isCapabilitySession(COORD)).toBe(false)
  })

  test("a subagent is neither coordinator nor capability, whatever its name", async () => {
    const sub = "ses_sub000000000000000000000"
    const { client } = makeClient({
      [COORD]: { agent: "build" },
      [sub]: { agent: "some-unlisted-subagent", parentID: COORD },
    })
    const ns = new NervousSystem(client, dir)
    await ns.registerSession(sub, "some-unlisted-subagent")
    expect(ns.isCoordinatorSession(sub)).toBe(false)
    expect(ns.getGroupID(sub)).toBe(COORD)
  })

  test("identity is memoized — one lookup per session, not one per hook", async () => {
    const { client, getCalls } = makeClient({
      [COORD]: { agent: "build" },
      [CAP]: { agent: "capabilities/hive-infra", parentID: COORD },
    })
    const ns = new NervousSystem(client, dir)
    await ns.registerSession(CAP, "capabilities/hive-infra")
    const after = getCalls()
    await ns.ensureIdentity(CAP)
    await ns.ensureIdentity(CAP)
    expect(getCalls()).toBe(after)
  })

  test("concurrent resolution is deduped", async () => {
    const { client, getCalls } = makeClient({
      [COORD]: { agent: "build" },
      [CAP]: { agent: "capabilities/hive-infra", parentID: COORD },
    })
    const ns = new NervousSystem(client, dir)
    await Promise.all([ns.ensureIdentity(CAP), ns.ensureIdentity(CAP), ns.ensureIdentity(CAP)])
    // 2 = the session itself + one chain hop to the root.
    expect(getCalls()).toBeLessThanOrEqual(2)
  })

  test("the server's agent field beats the caller's hint (W-009)", async () => {
    const { client } = makeClient({
      [COORD]: { agent: "build" },
      [CAP]: { agent: "capabilities/hive-infra", parentID: COORD },
    })
    const ns = new NervousSystem(client, dir)
    // context.agent can report the PARENT's agent on a resumed session.
    await ns.registerSession(CAP, "build")
    expect(ns.resolveAgent(CAP)).toBe("hive-infra")
    expect(ns.isCapabilitySession(CAP)).toBe(true)
  })

  test("a later wrong hint cannot overwrite a verified record", async () => {
    // W-009 again, on the re-registration path: chat.message fires on every
    // turn, so a resumed session that reports the parent's agent must not be
    // able to relabel an already-verified record. It would stick, because
    // ensureIdentity short-circuits on `verified`.
    const { client } = makeClient({
      [COORD]: { agent: "build" },
      [CAP]: { agent: "capabilities/hive-infra", parentID: COORD },
    })
    const ns = new NervousSystem(client, dir)
    await ns.registerSession(CAP, "capabilities/hive-infra")
    expect(ns.getGroupID(CAP)).toBe(COORD)

    await ns.registerSession(CAP, "build")
    expect(ns.resolveAgent(CAP)).toBe("hive-infra")
    expect(ns.isCapabilitySession(CAP)).toBe(true)
    expect(ns.isCoordinatorSession(CAP)).toBe(false)
    expect(ns.getGroupID(CAP)).toBe(COORD)
  })

  test("an unreachable server leaves the group UNKNOWN rather than guessing", async () => {
    const failing = { session: { get: async () => { throw new Error("network") } } } as any
    const ns = new NervousSystem(failing, dir)
    await ns.registerSession(COORD, "build")
    await ns.registerSession(CAP, "capabilities/hive-infra")
    // The coordinator is self-grouped by construction; the capability is not
    // handed to it just because it is the only one around.
    expect(ns.getGroupID(COORD)).toBe(COORD)
    expect(ns.getGroupID(CAP)).toBeUndefined()
  })
})

// ── Eviction ──────────────────────────────────────────────────────────────────

describe("eviction on positive evidence", () => {
  test("a 404 during identity resolution evicts and is audited", async () => {
    writeState([{ id: CAP, agent: "capabilities/x", groupID: COORD, role: "capability" }], [CAP])
    const { client } = makeClient({}) // server knows nothing
    const ns = new NervousSystem(client, dir)
    expect(ns.registrySnapshot()).toHaveLength(1)

    await ns.ensureIdentity(CAP)
    expect(ns.registrySnapshot()).toHaveLength(0)
    expect(ns.isSessionAwake(CAP)).toBe(false)

    const evictions = readLog().filter((e) => e.event === "evict-404")
    expect(evictions).toHaveLength(1)
    expect(evictions[0]!.id).toBe(CAP)
    expect(evictions[0]!.awakeDropped).toBe(true)
  })

  test("an unreachable server evicts NOTHING (unknown is not absent)", async () => {
    writeState([{ id: CAP, agent: "capabilities/x", groupID: COORD, role: "capability", verified: true }])
    const failing = { session: { get: async () => { throw new Error("network") } } } as any
    const ns = new NervousSystem(failing, dir)
    await ns.ensureIdentity(CAP)
    expect(ns.registrySnapshot()).toHaveLength(1)
    expect(readLog().filter((e) => e.event === "evict-404")).toHaveLength(0)
  })
})

// ── CRITERIA 1, 2, 4 end-to-end through the class ─────────────────────────────

describe("delivery, wake and broadcast through the class", () => {
  const COORD_A = "ses_coordA000000000000000000"
  const COORD_B = "ses_coordB000000000000000000"
  const CAP_A = "ses_capA00000000000000000000"
  const CAP_B = "ses_capB00000000000000000000"

  async function twoWorlds() {
    const fake = makeClient({
      [COORD_A]: { agent: "build" },
      [COORD_B]: { agent: "build" },
      [CAP_A]: { agent: "capabilities/hive-infra", parentID: COORD_A },
      [CAP_B]: { agent: "capabilities/hive-infra", parentID: COORD_B },
    })
    const ns = new NervousSystem(fake.client, dir)
    await ns.registerSession(COORD_A, "build")
    await ns.registerSession(COORD_B, "build")
    await ns.registerSession(CAP_A, "capabilities/hive-infra")
    await ns.registerSession(CAP_B, "capabilities/hive-infra")
    return { ns, ...fake }
  }

  test("CRITERION 1: a message reaches only the same-named session in the sender's group", async () => {
    const { ns, prompts } = await twoWorlds()
    const res = await ns.send("build", "hive-infra", "info", "hello", COORD_A)
    expect(res.delivered).toBe(true)
    expect(prompts.map((p) => p.id)).toEqual([CAP_A])
  })

  test("CRITERION 2: a routing wake lands on the coordinator owning the child's group", async () => {
    const { ns, promptAsyncs } = await twoWorlds()
    const outA = await ns.wakeForChild(CAP_A, (g) => `group=${g}`)
    const outB = await ns.wakeForChild(CAP_B, (g) => `group=${g}`)
    expect(outA).toBe(`SENT_TO_${COORD_A}`)
    expect(outB).toBe(`SENT_TO_${COORD_B}`)
    // Content and target agree — the crossing is not expressible.
    expect(promptAsyncs).toEqual([
      { id: COORD_A, text: `[HIVEmind] group=${COORD_A}` },
      { id: COORD_B, text: `[HIVEmind] group=${COORD_B}` },
    ])
  })

  test("a wake with no resolvable group is suppressed, not redirected (I-227)", async () => {
    const { ns, promptAsyncs } = await twoWorlds()
    const orphan = "ses_orphan000000000000000000"
    await ns.registerSession(orphan, "capabilities/hive-infra") // server 404s it
    const out = await ns.wakeForChild(orphan, () => "anything")
    expect(out.startsWith("SUPPRESSED_")).toBe(true)
    expect(promptAsyncs).toHaveLength(0)
  })

  test("CRITERION 4: a broadcast does not escape its group", async () => {
    const { ns, prompts } = await twoWorlds()
    await ns.send("build", "_broadcast", "info", "hi", COORD_A)
    await new Promise((r) => setTimeout(r, 10)) // injections are fire-and-forget
    expect(prompts.map((p) => p.id)).toEqual([CAP_A])
  })

  test("_coordinator escalates to the sender's OWN coordinator", async () => {
    const { ns, prompts } = await twoWorlds()
    const res = await ns.send("hive-infra", "_coordinator", "request", "route me", CAP_B)
    expect(res.delivered).toBe(true)
    expect(prompts.map((p) => p.id)).toEqual([COORD_B])
  })

  test("an ungrouped sender delivers to nobody, and the message stays on disk", async () => {
    const { ns, prompts, promptAsyncs } = await twoWorlds()
    const stray = "ses_stray0000000000000000000"
    const res = await ns.send("hive-infra", "hive-infra", "info", "x", stray)
    expect(res.delivered).toBe(false)
    expect(prompts).toHaveLength(0)
    expect(promptAsyncs).toHaveLength(0)
    expect(fs.existsSync(path.join(dir, ".opencode/hivemind/inbox/hive-infra", res.filename))).toBe(true)
  })

  test("a dead-but-active-looking session is evicted instead of being prompted", async () => {
    const { ns, prompts } = await twoWorlds()
    // Registry says CAP_A is active; the server disagrees. This is exactly the
    // hearsay case: `active` was set from an event and never re-validated.
    const fake2 = makeClient({
      [COORD_A]: { agent: "build" },
      [COORD_B]: { agent: "build" },
      [CAP_B]: { agent: "capabilities/hive-infra", parentID: COORD_B },
    })
    ;(ns as any).client = fake2.client

    const res = await ns.send("build", "hive-infra", "info", "hello", COORD_A)
    expect(res.delivered).toBe(false)
    expect(fake2.prompts).toHaveLength(0)
    expect(prompts).toHaveLength(0)
    expect(ns.registrySnapshot().find((r) => r.id === CAP_A)).toBeUndefined()
    expect(readLog().filter((e) => e.event === "evict-404").map((e) => e.id)).toContain(CAP_A)
  })

  test("group-scoped reads refuse rather than falling open (W-141 symmetry)", async () => {
    const { ns } = await twoWorlds()
    expect(ns.readMessages("hive-infra", undefined)).toEqual([])
    expect(ns.acknowledgeMessages("hive-infra", undefined)).toBe(0)
    expect(ns.formatMessages("hive-infra", undefined)).toBeNull()
    expect(ns.buildQueueStatus(undefined)).toBeNull()
    expect(ns.formatRoutingNeeded(undefined)).toBeNull()
  })

  test("the roster only offers resumable sessions from the caller's own group", async () => {
    fs.writeFileSync(
      path.join(dir, ".opencode/agents/capabilities/hive-infra.md"),
      "---\ndescription: infra\n---\nbody\n"
    )
    const { ns } = await twoWorlds()
    ns.markIdle(CAP_A)
    ns.markIdle(CAP_B)
    expect(ns.buildRoster(COORD_A)).toContain(CAP_A)
    expect(ns.buildRoster(COORD_A)).not.toContain(CAP_B)
    expect(ns.buildRoster(COORD_B)).toContain(CAP_B)
    // No group, no resumable annotation at all.
    expect(ns.buildRoster(undefined)).not.toContain("resumable")
  })
})
