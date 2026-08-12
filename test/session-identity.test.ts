/**
 * WI-070 — session identity + targeting.
 *
 * The crossed-wake symptom ("coordinator A is woken with hive-infra's queue
 * while hive-infra's coordinator gets board-viewer's") was previously only
 * reproducible by running two coordinators side by side and waiting. These
 * tests reproduce it as data: a registry with two coordinators, same-named
 * capabilities under each, and assertions that nothing crosses.
 *
 * Everything under test is pure, so the scenarios run at the REAL registry
 * scale (the live workspace registry held 431 entries) rather than at the
 * two-or-three-entry scale where first-match-in-insertion-order happens to
 * look correct (W-140: a bounded thing exercised below its bound tests the
 * best case and hides the defect).
 */
import { describe, expect, test } from "bun:test"
import {
  classifyRole,
  isCapabilityActiveInGroup,
  isValidSessionID,
  participationRole,
  pruneAwake,
  resolveGroupByChain,
  retainOnLoad,
  selectBroadcastTargets,
  selectDeliveryTarget,
  selectGroupCoordinator,
  selectIdleInGroup,
  selectWakeTarget,
  shortName,
  type SessionRecord,
} from "../src/lib/session-identity.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

let seq = 0
function rec(over: Partial<SessionRecord> & { id: string; agent: string }): SessionRecord {
  return {
    active: false,
    lastSeen: ++seq,
    verified: true,
    role: classifyRole({ agent: over.agent, parentID: over.parentID }),
    ...over,
  } as SessionRecord
}

const COORD_A = "ses_coordAAAAAAAAAAAAAAAAAAAA"
const COORD_B = "ses_coordBBBBBBBBBBBBBBBBBBBB"

/**
 * The WI-070 world: two coordinators, each with its own board-viewer and
 * hive-infra session. This is the shape that produced the mirror-image wakes.
 */
function crossedWorld(): Map<string, SessionRecord> {
  const records = [
    rec({ id: COORD_A, agent: "build", parentID: null, groupID: COORD_A, active: true }),
    rec({ id: COORD_B, agent: "build", parentID: null, groupID: COORD_B, active: true }),
    rec({ id: "ses_capViewerA0000000000000", agent: "capabilities/board-viewer", parentID: COORD_A, groupID: COORD_A, active: true }),
    rec({ id: "ses_capViewerB0000000000000", agent: "capabilities/board-viewer", parentID: COORD_B, groupID: COORD_B, active: true }),
    rec({ id: "ses_capInfraA00000000000000", agent: "capabilities/hive-infra", parentID: COORD_A, groupID: COORD_A }),
    rec({ id: "ses_capInfraB00000000000000", agent: "capabilities/hive-infra", parentID: COORD_B, groupID: COORD_B }),
  ]
  return new Map(records.map((r) => [r.id, r]))
}

/** Pad a registry out to `n` entries with plausible historical sediment. */
function atScale(base: Map<string, SessionRecord>, n: number): Map<string, SessionRecord> {
  const out = new Map(base)
  const agents = ["dreamcatcher", "explore", "general", "build", "capabilities/hive-infra", "capabilities/board-viewer"]
  let i = 0
  while (out.size < n) {
    const agent = agents[i % agents.length]!
    const id = `ses_pad${String(i).padStart(20, "0")}`
    const isTop = agent === "build"
    out.set(
      id,
      rec({
        id,
        agent,
        parentID: isTop ? null : `ses_ghost${String(i).padStart(18, "0")}`,
        // Historical sediment: a group whose coordinator is long gone.
        groupID: isTop ? id : `ses_ghost${String(i).padStart(18, "0")}`,
      })
    )
    i++
  }
  return out
}

// ── Primitives ────────────────────────────────────────────────────────────────

describe("isValidSessionID", () => {
  test("accepts real opencode ids", () => {
    expect(isValidSessionID("ses_00d5ed560ffed5mG01NVw3pGAT")).toBe(true)
    expect(isValidSessionID("ses_02f515684ffeGSu6CB7xzjZpRA")).toBe(true)
  })

  test("rejects the hand-written placeholders found in the live registry", () => {
    // Both of these were sitting in .nervous-system-state.json and were being
    // loaded into every scan.
    expect(isValidSessionID("ses_COORD_ACTIVE")).toBe(false)
    expect(isValidSessionID("ses_CAP_NEW")).toBe(false)
  })

  test("rejects anything that is not ses_-prefixed", () => {
    expect(isValidSessionID("")).toBe(false)
    expect(isValidSessionID("msg_123")).toBe(false)
    expect(isValidSessionID("ses_")).toBe(false)
  })
})

describe("classifyRole", () => {
  test("parentID presence is the coordinator discriminator (I-141)", () => {
    expect(classifyRole({ agent: "build", parentID: null })).toBe("coordinator")
    expect(classifyRole({ agent: "build", parentID: "ses_parent0000000000000000" })).toBe("subagent")
  })

  test("a capability is a capability whatever its parent", () => {
    expect(classifyRole({ agent: "capabilities/x", parentID: "ses_p000000000000000000000" })).toBe("capability")
    expect(classifyRole({ agent: "capabilities/x", parentID: null })).toBe("capability")
  })

  test("unknown parent falls back to the agent-name heuristic", () => {
    expect(classifyRole({ agent: "dreamcatcher" })).toBe("subagent")
    expect(classifyRole({ agent: "explore" })).toBe("subagent")
    expect(classifyRole({ agent: "build" })).toBe("coordinator")
    expect(classifyRole({ agent: "capabilities/x" })).toBe("capability")
  })

  test("the heuristic mislabels unlisted subagents — which is why parentID wins", () => {
    // This is the failure mode of the old hardcoded subagentTypes list: an
    // agent type nobody enumerated is silently promoted to coordinator, and a
    // coordinator label is what authorizes a wake.
    expect(classifyRole({ agent: "some-new-subagent" })).toBe("coordinator")
    expect(classifyRole({ agent: "some-new-subagent", parentID: "ses_p000000000000000000000" })).toBe("subagent")
  })

  test("shortName strips only the capabilities/ prefix", () => {
    expect(shortName("capabilities/hive-infra")).toBe("hive-infra")
    expect(shortName("dissolved/ui-ux")).toBe("dissolved/ui-ux")
    expect(shortName("build")).toBe("build")
  })
})

// ── Retention ─────────────────────────────────────────────────────────────────

describe("retainOnLoad", () => {
  test("drops placeholder ids and non-participating roles, keeps the rest", () => {
    const input = [
      rec({ id: "ses_COORD_ACTIVE", agent: "build", parentID: null }),
      rec({ id: "ses_CAP_NEW", agent: "capabilities/x", parentID: "ses_p000000000000000000000" }),
      rec({ id: "ses_dream0000000000000000000", agent: "dreamcatcher", parentID: "ses_p000000000000000000000" }),
      rec({ id: COORD_A, agent: "build", parentID: null }),
      rec({ id: "ses_cap00000000000000000000", agent: "capabilities/hive-infra", parentID: COORD_A }),
    ]
    const { keep, dropped } = retainOnLoad(input)
    expect(keep.map((r) => r.id).sort()).toEqual([COORD_A, "ses_cap00000000000000000000"].sort())
    expect(dropped.map((d) => d.reason).sort()).toEqual([
      "invalid-id",
      "invalid-id",
      "non-participating-role",
    ])
  })

  test("keeps `unknown` role — unknown is not absent (W-079)", () => {
    const unknown = rec({ id: "ses_unknown00000000000000000", agent: "?", role: "unknown" })
    expect(retainOnLoad([unknown]).keep).toHaveLength(1)
  })

  test("keeps a very old coordinator: there is no age rule (W-117)", () => {
    const ancient = rec({ id: COORD_A, agent: "build", parentID: null, lastSeen: 0 })
    expect(retainOnLoad([ancient]).keep).toHaveLength(1)
  })

  test("keeps a dissolved-agent session: resurrection makes disk state a liar (W-142)", () => {
    // narrative-world and ui-ux were dissolved, then resurrected into
    // capabilities/ for a new project. A retention rule that consulted the
    // current directory listing would have been wrong in both directions.
    const dissolved = rec({ id: "ses_dis00000000000000000000", agent: "dissolved/ui-ux", parentID: COORD_A, groupID: COORD_A })
    expect(retainOnLoad([dissolved]).keep).toHaveLength(1)
  })

  test("SYMMETRY (W-141): nothing dropped is reachable by any selector", () => {
    // The load-time filter must be exactly the complement of participation.
    // If a future selector can return a role, retention has to widen with it,
    // or we silently destroy entries the read path would have shown.
    const all = [
      rec({ id: "ses_COORD_ACTIVE", agent: "build", parentID: null, groupID: "ses_COORD_ACTIVE", active: true }),
      rec({ id: "ses_dream0000000000000000000", agent: "dreamcatcher", parentID: COORD_A, groupID: COORD_A, active: true }),
      rec({ id: COORD_A, agent: "build", parentID: null, groupID: COORD_A, active: true }),
      rec({ id: "ses_capA000000000000000000", agent: "capabilities/hive-infra", parentID: COORD_A, groupID: COORD_A, active: true }),
    ]
    const { keep, dropped } = retainOnLoad(all)
    const droppedIds = new Set(dropped.map((d) => d.id))
    expect(droppedIds.size).toBe(2)

    const broadcast = selectBroadcastTargets(all, { senderName: "build", senderGroupID: COORD_A })
    for (const id of broadcast) expect(droppedIds.has(id)).toBe(false)

    const delivery = selectDeliveryTarget(all, { recipient: "hive-infra", senderGroupID: COORD_A })
    expect(delivery.ok).toBe(true)
    if (delivery.ok) expect(droppedIds.has(delivery.value.sessionID)).toBe(false)

    // ...and everything retained is still reachable in principle.
    expect(keep.every((r) => participationRole(r.role) || r.role === "unknown")).toBe(true)
  })
})

describe("pruneAwake", () => {
  test("drops awake ids with no retained record, keeps the rest", () => {
    const retained = [rec({ id: COORD_A, agent: "build", parentID: null })]
    const { keep, dropped } = pruneAwake([COORD_A, "ses_gone0000000000000000000"], retained)
    expect(keep).toEqual([COORD_A])
    expect(dropped).toEqual(["ses_gone0000000000000000000"])
  })

  test("awakeness never decays on its own", () => {
    const retained = [rec({ id: COORD_A, agent: "build", parentID: null, lastSeen: 0 })]
    expect(pruneAwake([COORD_A], retained).dropped).toEqual([])
  })
})

// ── Delivery targeting ────────────────────────────────────────────────────────

describe("selectDeliveryTarget", () => {
  test("CRITERION 1: reaches only the session running X in the sender's group", () => {
    const world = crossedWorld()
    const a = selectDeliveryTarget(world.values(), { recipient: "board-viewer", senderGroupID: COORD_A })
    const b = selectDeliveryTarget(world.values(), { recipient: "board-viewer", senderGroupID: COORD_B })
    expect(a.ok && a.value.sessionID).toBe("ses_capViewerA0000000000000")
    expect(b.ok && b.value.sessionID).toBe("ses_capViewerB0000000000000")
    expect(a.ok && a.value.candidates).toHaveLength(1)
  })

  test("holds at real registry scale (431 entries)", () => {
    const world = atScale(crossedWorld(), 431)
    expect(world.size).toBe(431)
    const a = selectDeliveryTarget(world.values(), { recipient: "board-viewer", senderGroupID: COORD_A })
    expect(a.ok && a.value.sessionID).toBe("ses_capViewerA0000000000000")
    expect(a.ok && a.value.candidates).toEqual(["ses_capViewerA0000000000000"])
  })

  test("an unknown sender group SUPPRESSES rather than picking anyone (I-227)", () => {
    const world = crossedWorld()
    const r = selectDeliveryTarget(world.values(), { recipient: "board-viewer", senderGroupID: undefined })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe("sender-group-unknown")
  })

  test("undefined groupID on a candidate is NOT a wildcard (weak point 2)", () => {
    // 12 sessions in the live registry had no groupID. The old filter skipped
    // the group check whenever either side was undefined, making each of them
    // a valid recipient for every coordinator.
    const world = new Map([
      ["ses_orphan000000000000000000", rec({ id: "ses_orphan000000000000000000", agent: "capabilities/board-viewer", parentID: COORD_A, groupID: undefined, active: true })],
    ])
    const r = selectDeliveryTarget(world.values(), { recipient: "board-viewer", senderGroupID: COORD_A })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe("no-active-recipient-in-group")
  })

  test("idle sessions are not live-delivery targets", () => {
    const world = crossedWorld()
    const r = selectDeliveryTarget(world.values(), { recipient: "hive-infra", senderGroupID: COORD_A })
    expect(r.ok).toBe(false)
  })

  test("ties break deterministically on recency, not insertion order", () => {
    const older = rec({ id: "ses_zzz00000000000000000000", agent: "capabilities/x", parentID: COORD_A, groupID: COORD_A, active: true, lastSeen: 100 })
    const newer = rec({ id: "ses_aaa00000000000000000000", agent: "capabilities/x", parentID: COORD_A, groupID: COORD_A, active: true, lastSeen: 200 })
    const forward = selectDeliveryTarget([older, newer], { recipient: "x", senderGroupID: COORD_A })
    const reverse = selectDeliveryTarget([newer, older], { recipient: "x", senderGroupID: COORD_A })
    expect(forward.ok && forward.value.sessionID).toBe(newer.id)
    expect(reverse.ok && reverse.value.sessionID).toBe(newer.id)
    // Both are offered, so a 404 on the freshest can fall through to the next.
    expect(forward.ok && forward.value.candidates).toEqual([newer.id, older.id])
  })
})

// ── Broadcast ─────────────────────────────────────────────────────────────────

describe("selectBroadcastTargets", () => {
  test("CRITERION 4: a broadcast does not escape its group", () => {
    const world = atScale(crossedWorld(), 431)
    const targets = selectBroadcastTargets(world.values(), { senderName: "build", senderGroupID: COORD_A, senderSessionID: COORD_A })
    expect(targets).toEqual(["ses_capViewerA0000000000000"])
  })

  test("no sender group means no live injections at all", () => {
    const world = crossedWorld()
    expect(selectBroadcastTargets(world.values(), { senderName: "build" })).toEqual([])
  })

  test("the sender never receives its own broadcast", () => {
    const world = crossedWorld()
    const targets = selectBroadcastTargets(world.values(), {
      senderName: "board-viewer",
      senderGroupID: COORD_A,
      senderSessionID: "ses_capViewerA0000000000000",
    })
    expect(targets).toEqual([COORD_A])
  })

  test("subagents are excluded", () => {
    const world = new Map(crossedWorld())
    const sub = rec({ id: "ses_dream0000000000000000000", agent: "dreamcatcher", parentID: COORD_A, groupID: COORD_A, active: true })
    world.set(sub.id, sub)
    expect(selectBroadcastTargets(world.values(), { senderName: "build", senderGroupID: COORD_A, senderSessionID: COORD_A })).not.toContain(sub.id)
  })
})

// ── Wake targeting: the WI-070 mechanism ──────────────────────────────────────

describe("selectWakeTarget", () => {
  test("CRITERION 2: each idle capability wakes ITS OWN coordinator", () => {
    const world = atScale(crossedWorld(), 431)
    const a = selectWakeTarget(world, "ses_capInfraA00000000000000")
    const b = selectWakeTarget(world, "ses_capInfraB00000000000000")
    expect(a.ok && a.value).toEqual({ groupID: COORD_A, coordinatorSessionID: COORD_A })
    expect(b.ok && b.value).toEqual({ groupID: COORD_B, coordinatorSessionID: COORD_B })
  })

  test("content group and target session are the SAME resolution (weak point 11)", () => {
    const world = crossedWorld()
    const t = selectWakeTarget(world, "ses_capViewerB0000000000000")
    expect(t.ok).toBe(true)
    if (t.ok) {
      // There is no second lookup that could disagree.
      expect(t.value.groupID).toBe(t.value.coordinatorSessionID)
      expect(t.value.groupID).toBe(COORD_B)
    }
  })

  test("weak point 9: a coordinator that never emitted chat.message is still a valid target", () => {
    // The old gate required sessionMap.has(groupID) and fell through to "any
    // non-capability session" when it failed — the direct crossing mechanism.
    // A verified parent chain names a real session whether or not this process
    // ever saw it register (I-308: headless first turns genuinely have not).
    const child = rec({ id: "ses_capOrphan0000000000000", agent: "capabilities/x", parentID: COORD_A, groupID: COORD_A, verified: true })
    const world = new Map([[child.id, child]])
    const t = selectWakeTarget(world, child.id)
    expect(t.ok && t.value.coordinatorSessionID).toBe(COORD_A)
  })

  test("THE CROSSING: an unregistered group owner must not degrade to a registered stranger", () => {
    // This is the reported bug, minimally. The child's coordinator has not
    // emitted chat.message in this process, so the old `sessionMap.has(groupID)`
    // gate failed (weak point 9) and control fell to "the first non-capability
    // session in Map order" (weak point 8) — a coordinator working on something
    // else entirely, which then received a wake describing this group's queue.
    //
    // In the live registry that fallback pool was 291 of 431 entries: 103 build
    // sessions, 177 subagents, and 11 dissolved-capability sessions, because the
    // role test was the string check !agent.startsWith("capabilities/").
    const world = atScale(crossedWorld(), 431)
    const strangerCoordinators = [...world.values()].filter((r) => r.role === "coordinator")
    expect(strangerCoordinators.length).toBeGreaterThan(1)

    const absentOwner = "ses_neverRegistered000000000"
    const child = rec({
      id: "ses_capHeadless0000000000",
      agent: "capabilities/hive-infra",
      parentID: absentOwner,
      groupID: absentOwner,
      verified: true,
    })
    world.set(child.id, child)
    expect(world.has(absentOwner)).toBe(false)

    const t = selectWakeTarget(world, child.id)
    expect(t.ok).toBe(true)
    if (t.ok) {
      expect(t.value.coordinatorSessionID).toBe(absentOwner)
      // Not any of the coordinators that DO happen to be registered.
      expect(strangerCoordinators.map((r) => r.id)).not.toContain(t.value.coordinatorSessionID)
    }
  })

  test("an UNVERIFIED group link to an unknown session is refused, not honoured", () => {
    // This is the pre-WI-070 auto-assignment: groupID guessed as "the first
    // active non-capability session in Map order".
    const child = rec({ id: "ses_capGuess00000000000000", agent: "capabilities/x", parentID: undefined, groupID: COORD_A, verified: false })
    const world = new Map([[child.id, child]])
    const t = selectWakeTarget(world, child.id)
    expect(t.ok).toBe(false)
    expect(!t.ok && t.reason).toBe("unverified-group-owner-unknown")
  })

  test("never wakes a session that is not a coordinator", () => {
    const cap = rec({ id: "ses_capX00000000000000000", agent: "capabilities/x", parentID: COORD_A, groupID: COORD_A })
    const child = rec({ id: "ses_capY00000000000000000", agent: "capabilities/y", parentID: cap.id, groupID: cap.id })
    const world = new Map([[cap.id, cap], [child.id, child]])
    const t = selectWakeTarget(world, child.id)
    expect(t.ok).toBe(false)
    expect(!t.ok && t.reason).toBe("group-owner-not-a-coordinator")
  })

  test("no group link, no wake — there is no fallback coordinator (weak point 8)", () => {
    const world = atScale(crossedWorld(), 431)
    const orphan = rec({ id: "ses_capNoGroup000000000000", agent: "capabilities/x", parentID: undefined, groupID: undefined })
    world.set(orphan.id, orphan)
    const t = selectWakeTarget(world, orphan.id)
    expect(t.ok).toBe(false)
    expect(!t.ok && t.reason).toBe("child-has-no-group")
  })

  test("an unregistered child refuses", () => {
    expect(selectWakeTarget(crossedWorld(), "ses_nobody000000000000000").ok).toBe(false)
    expect(selectWakeTarget(crossedWorld(), undefined).ok).toBe(false)
  })
})

describe("selectGroupCoordinator", () => {
  test("resolves a known group and refuses an unknown one", () => {
    const world = crossedWorld()
    expect(selectGroupCoordinator(world, COORD_B).ok).toBe(true)
    const none = selectGroupCoordinator(world, undefined)
    expect(!none.ok && none.reason).toBe("no-group")
  })

  test("refuses when the named group is not a coordinator session", () => {
    const world = crossedWorld()
    const r = selectGroupCoordinator(world, "ses_capViewerA0000000000000")
    expect(!r.ok && r.reason).toBe("group-owner-not-a-coordinator")
  })
})

// ── Idle lookup / roster ──────────────────────────────────────────────────────

describe("selectIdleInGroup", () => {
  test("same capability name under two coordinators does not collide (SNG-020)", () => {
    const world = atScale(crossedWorld(), 431)
    expect(selectIdleInGroup(world.values(), "hive-infra", COORD_A)).toBe("ses_capInfraA00000000000000")
    expect(selectIdleInGroup(world.values(), "hive-infra", COORD_B)).toBe("ses_capInfraB00000000000000")
  })

  test("no group means no resumable session is offered", () => {
    const world = crossedWorld()
    expect(selectIdleInGroup(world.values(), "hive-infra", undefined)).toBeUndefined()
  })

  test("an active session is not resumable", () => {
    const world = crossedWorld()
    expect(selectIdleInGroup(world.values(), "board-viewer", COORD_A)).toBeUndefined()
  })

  test("prefers the most recent idle session in the group", () => {
    const old = rec({ id: "ses_old00000000000000000000", agent: "capabilities/x", parentID: COORD_A, groupID: COORD_A, lastSeen: 1 })
    const fresh = rec({ id: "ses_new00000000000000000000", agent: "capabilities/x", parentID: COORD_A, groupID: COORD_A, lastSeen: 2 })
    expect(selectIdleInGroup([old, fresh], "x", COORD_A)).toBe(fresh.id)
  })
})

describe("isCapabilityActiveInGroup", () => {
  test("a same-named capability in another group does not count as active", () => {
    const world = crossedWorld()
    expect(isCapabilityActiveInGroup(world.values(), "board-viewer", COORD_A)).toBe(true)
    expect(isCapabilityActiveInGroup(world.values(), "hive-infra", COORD_A)).toBe(false)
  })
})

// ── Parent-chain walk ─────────────────────────────────────────────────────────

describe("resolveGroupByChain", () => {
  const chain: Record<string, { parentID?: string | null }> = {
    ses_root: { parentID: null },
    ses_mid: { parentID: "ses_root" },
    ses_leaf: { parentID: "ses_mid" },
  }
  const lookup = async (id: string) => chain[id]

  test("a top-level session is its own group", async () => {
    const r = await resolveGroupByChain("ses_root", null, lookup)
    expect(r.ok && r.value).toBe("ses_root")
  })

  test("walks to the root through intermediate sessions", async () => {
    const r = await resolveGroupByChain("ses_leaf", "ses_mid", lookup)
    expect(r.ok && r.value).toBe("ses_root")
  })

  test("unknown start parent refuses (does not assume top-level)", async () => {
    const r = await resolveGroupByChain("ses_x", undefined, lookup)
    expect(!r.ok && r.reason).toBe("start-parent-unknown")
  })

  test("a broken link refuses rather than returning the last id seen", async () => {
    const r = await resolveGroupByChain("ses_leaf", "ses_missing", lookup)
    expect(!r.ok && r.reason).toBe("chain-link-missing")
  })

  test("a cycle refuses", async () => {
    const cyclic: Record<string, { parentID?: string | null }> = {
      a: { parentID: "b" },
      b: { parentID: "a" },
    }
    const r = await resolveGroupByChain("start", "a", async (id) => cyclic[id])
    expect(!r.ok && r.reason).toBe("cycle-in-parent-chain")
  })

  test("an over-deep chain refuses", async () => {
    const deep = async (id: string) => ({ parentID: `${id}x` })
    const r = await resolveGroupByChain("start", "a", deep)
    expect(!r.ok && r.reason).toBe("chain-too-deep")
  })
})
