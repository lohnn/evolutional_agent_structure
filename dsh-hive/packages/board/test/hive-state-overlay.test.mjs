// WI-083 (v1.1) — the HIVE-state overlay: unit tests for the client view
// projection (src/lib/hive-state-view.ts, compiled to dist) plus byte-level
// guards on the EMITTED bundle (the I-192/A7 pattern: string literals that
// must survive minification, and absence of anything that would break the
// dock contract or leak ambient rows back in).
import { readFileSync } from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import test from "node:test"
import {
  buildTimeline,
  childrenInFlight,
  childrenKnown,
  currentStage,
  isSelfRunning,
  durationSince,
  fmtTime,
  relTime,
  HIVE_STATE_URL,
} from "@hive/dsh-board/lib/hive-state-view"

const PKG = path.dirname(new URL(import.meta.url).pathname.replace("/test", ""))
const CLIENT = readFileSync(path.join(PKG, "client.js"), "utf8")

// ── pure projection ──────────────────────────────────────────────────────────

const PAYLOAD = {
  ok: true,
  generated: "2026-10-08T18:00:00.000Z",
  id: "session-abc",
  idBare: "abc",
  workspace: "studio",
  hive: { isCoordinator: true, agent: "standard", awakenedAt: "2026-10-08T16:00:00.000Z", lastAwakenInput: "run it" },
  goal: { objective: "ship the overlay", status: "active", roundsStarted: 3, paused: false, disabled: false, createdAt: "2026-10-08T16:30:00.000Z", updatedAt: "2026-10-08T17:00:00.000Z" },
  usageMarks: [{ capability: "dsh-hive-plugins", timestamp: "2026-10-08T16:55:41.199Z" }],
  dreamEvents: [{ ts: "2026-10-08T16:56:00.000Z", tool: "rank" }],
  children: [
    { id: "session-c1", mode: "continuable", label: "wi-083-state-overlay", createdAtMs: 1791460000000, capability: "dsh-hive-plugins" },
  ],
  childrenTotal: 1,
  live: true,
  agents: [{ id: "session-abc", status: "running" }],
  runningAgents: 1,
}

test("buildTimeline: every session-scoped record becomes exactly one real event", () => {
  const events = buildTimeline(PAYLOAD)
  const kinds = events.map((e) => e.kind)
  assert.deepEqual([...kinds].sort(), ["awaken", "dispatched", "dream", "goal", "registered"])
  const awaken = events.find((e) => e.kind === "awaken")
  assert.match(awaken.text, /awakened as standard/)
  assert.match(awaken.text, /"run it"/)
  const goal = events.find((e) => e.kind === "goal")
  assert.match(goal.text, /round 3/)
  const dispatched = events.find((e) => e.kind === "dispatched")
  assert.match(dispatched.text, /wi-083-state-overlay/)
  assert.match(dispatched.text, /dsh-hive-plugins/)
  assert.match(dispatched.text, /\(continuable\)/)
  assert.equal(new Date(dispatched.ts).toISOString(), new Date(1791460000000).toISOString())
})

test("buildTimeline: events sort descending by ts", () => {
  const events = buildTimeline(PAYLOAD)
  const times = events.map((e) => new Date(e.ts ?? 0).getTime())
  const sorted = [...times].sort((a, b) => b - a)
  assert.deepEqual(times, sorted)
})

test("buildTimeline: NO workspace-ambient rows ever (v1.1 scope)", () => {
  const events = buildTimeline({
    ...PAYLOAD,
    // legacy v1 fields may still arrive from a not-yet-bounced route — ignored
    lastTick: "2026-10-08T08:13:25.983Z",
  })
  for (const e of events) {
    assert.ok(!e.text.includes("(workspace)"), `no ambient text: ${e.text}`)
    assert.ok(e.kind !== "tick", "no energy-tick rows")
  }
  assert.equal(buildTimeline(undefined).length, 0)
  // absent coordinator fields render nothing fabricated
  assert.equal(buildTimeline({ ok: true }).find((e) => e.kind === "awaken"), undefined)
})

test("childrenInFlight / childrenKnown: partition by running, parents only", () => {
  const list = {
    byId: {
      me: { id: "me", running: true },
      kid1: { id: "kid1", parentId: "me", running: true, displayTitle: "kiwi" },
      kid2: { id: "kid2", parentId: "me", running: false },
      kid3: { id: "kid3", parentId: "other", running: true },
    },
  }
  assert.deepEqual(childrenInFlight(list, "me").map((k) => k.id), ["kid1"])
  assert.deepEqual(childrenKnown(list, "me").map((k) => k.id), ["kid1", "kid2"])
  assert.deepEqual(childrenInFlight(undefined, "me"), [])
  assert.deepEqual(childrenKnown(undefined, "me"), [])
})

test("currentStage: page truth OR host truth flips working; done when not live", () => {
  // working by page
  assert.equal(currentStage({ payload: PAYLOAD, routeReachable: true, pageRunning: true }).stage, "working")
  assert.equal(currentStage({ payload: PAYLOAD, routeReachable: true, pageRunning: true }).tone, "live")
  // working by HOST truth while the page store is stale (the v1 defect)
  assert.equal(currentStage({ payload: PAYLOAD, routeReachable: true, pageRunning: false }).stage, "working")
  assert.equal(isSelfRunning(PAYLOAD), true)
  // DURABLE facts win over liveness: a restarted host disposes agents without
  // ending sessions — live:false alone must NEVER read done (v1.1 defect fix)
  assert.equal(currentStage({ payload: { ...PAYLOAD, live: false, agents: [] }, routeReachable: true, pageRunning: false }).stage, "awakened")
  // no route (pending bounce) + page idle → honest page-side stage
  assert.equal(currentStage({ payload: undefined, routeReachable: false, pageRunning: false }).stage, "dormant")
  assert.equal(currentStage({ payload: undefined, routeReachable: false, pageRunning: true }).stage, "working")
  // awakened coordinator, idle
  assert.equal(currentStage({ payload: { ...PAYLOAD, live: true, agents: [{ id: "session-abc", status: "idle" }] }, routeReachable: true, pageRunning: false }).stage, "awakened")
  // plain registered child (mark, not coordinator; its agent is still
  // registered on the host — continuable residents stay live between turns)
  const child = {
    ok: true,
    hive: { isCoordinator: false },
    usageMarks: [{ capability: "c", timestamp: "2026-10-08T16:55:41.199Z" }],
    live: true,
    agents: [{ id: "session-c1", status: "idle" }],
  }
  assert.equal(currentStage({ payload: child, routeReachable: true, pageRunning: false }).stage, "registered")
})

test("durationSince: honest relative strings, blank when unobserved", () => {
  const now = Date.now()
  assert.equal(durationSince(new Date(now - 60_000).toISOString(), now), "1m")
  assert.equal(durationSince(new Date(now - 7_200_000).toISOString(), now), "2h")
  assert.equal(durationSince(undefined, now), "")
  assert.equal(durationSince("not-a-date", now), "")
  assert.equal(durationSince(new Date(now + 60_000).toISOString(), now), "") // future = unknown
})

test("time stamps: fmt falls back to the raw value for junk input", () => {
  assert.equal(fmtTime("2026-10-08T16:55:41.199Z").startsWith("2026-10-08 16:55"), true)
  assert.equal(fmtTime(null), "—")
  assert.equal(fmtTime("junk-but-not-a-date"), "junk-but-not-a-date")
  assert.equal(relTime(null), "")
})

test("route url stays on the pinned read-only path", () => {
  assert.equal(HIVE_STATE_URL, "/api/hive-state/session")
})

// ── emitted bundle guards (string literals that must survive minification) ───

test("emitted client.js: WI-083 overlay rides the board bundle", () => {
  assert.ok(CLIENT.includes("conversation.composer.dock"), "dock slot registration present")
  assert.ok(CLIENT.includes("hive-state-timeline"), "dock occupant id present")
  assert.ok(CLIENT.includes("makeHiveStateDock"), "dock factory exported through the engine global")
  assert.ok(CLIENT.includes("/api/hive-state/session"), "read-only route URL present")
  assert.ok(CLIENT.includes("hvs-pill"), "pill markup class present")
  assert.ok(CLIENT.includes("hvs-timeline-panel"), "panel mount id present")
  assert.ok(CLIENT.includes("data-slot-hive-state"), "selected-session binding marker present")
  assert.ok(CLIENT.includes("useSessions"), "the global standard-seat hook is consumed")
  // v1.1 lifecycle-story markers (the W-099 discipline: the page must APPLY state)
  assert.ok(CLIENT.includes("(observed)"), "observed-lifecycle marker present")
  assert.ok(CLIENT.includes("now: "), "current-stage header line present")
  assert.ok(CLIENT.includes("latest signal "), "latest-signal header line present")
  assert.ok(CLIENT.includes("child returned — "), "child-return milestone present")
  assert.ok(CLIENT.includes("in progress — enter time not observed"), "honest unobserved-enter fallback present")
})

test("emitted client.js: overlay styling is token-only (no hex colors)", () => {
  const cssStart = CLIENT.indexOf("hvs-pill{")
  assert.ok(cssStart > 0, "overlay CSS block present in the bundle")
  const cssEnd = CLIENT.indexOf("hvs-flag", cssStart)
  const css = CLIENT.slice(cssStart, cssEnd)
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, "no hex color literals in overlay CSS — theme tokens only")
})

test("emitted client.js: ambient rows can never come back (v1.1 scope pin)", () => {
  assert.ok(!CLIENT.includes("dreamAmbient"), "legacy ambient payload reads gone from the bundle")
  assert.ok(!CLIENT.includes("energy tick"), "no energy-tick row text in the bundle")
  assert.ok(!CLIENT.includes("(workspace)"), "no ambient labeling in the bundle")
})

test("emitted client.js: v1.2 item card + in-UI deep-link markers", () => {
  assert.ok(CLIENT.includes("/api/hive-board/session-item"), "board-pairing route URL present")
  assert.ok(CLIENT.includes("hvs-card"), "item card markup present")
  assert.ok(CLIENT.includes("selectPanel"), "in-UI tab deep-link present (ctx.layout.selectPanel)")
  assert.ok(CLIENT.includes("'hive-board'") || CLIENT.includes('"hive-board"'), "the board tab main key is addressed")
  assert.ok(CLIENT.includes("openDrawer"), "the SAME tab inspector opens the item (no duplicated spec/history)")
  assert.doesNotMatch(CLIENT, /["'`]https?:\/\/[^"']*:4400/, "no :4400 viewer URL hand-off anywhere (comments may mention history)")
})

test("view lib v1.3: dreaming is an attributed, session-scoped stage", async () => {
  const view = await import("@hive/dsh-board/lib/hive-state-view")
  const payload = {
    ...PAYLOAD,
    live: true,
    // the host agents projection must NOT report this session running —
    // the dreaming check is about the DREAM, not another turn
    agents: [{ id: "session-abc", status: "idle" }],
    dreams: {
      active: [{ dreamId: "DRM-060", entryTime: "2026-10-09T08:00:00.000Z" }],
      history: [{ dreamId: "DRM-059", entryTime: "2026-10-09T07:00:00.000Z", exitTime: "2026-10-09T07:30:00.000Z" }],
    },
  }
  // dreaming stage flips on an ACTIVE attributed dream; page running still wins
  assert.equal(view.currentStage({ payload, routeReachable: true, pageRunning: false }).stage, "dreaming")
  assert.equal(view.currentStage({ payload, routeReachable: true, pageRunning: false }).tone, "dream")
  assert.equal(view.currentStage({ payload, routeReachable: true, pageRunning: true }).stage, "working")
  // timeline rows: started/complete attributed rows rendered; dreamEvents still present
  const events = view.buildTimeline(payload)
  const dreamingRows = events.filter((e) => e.kind === "dreaming" || e.kind === "dream")
  assert.ok(dreamingRows.some((e) => e.text.includes("DRM-060") && e.text.includes("(active)")))
  assert.ok(dreamingRows.some((e) => e.text.includes("DRM-059") && e.text.includes("completed")))
  // UNATTRIBUTED (pre-fix) dreams never arrive — the payload shape omits them
  const legacy = view.buildTimeline({ ...PAYLOAD, dreams: undefined })
  assert.equal(legacy.filter((e) => e.kind === "dreaming").length, 0)
})

test("view lib v1.3: item history renders as durable transition milestones", async () => {
  const view = await import("@hive/dsh-board/lib/hive-state-view")
  const pairing = {
    item: { id: "WI-083", title: "t", status: "done", priority: "medium" },
    matchedBy: "owner",
    history: [
      { at: "2026-10-09T07:00:00.000Z", from: "in_progress", to: "done", by: "hive_board_complete", session: "session-ac945505-3567-4aac-b683-9da796726d3a" },
      { at: "2026-10-08T16:53:00.000Z", from: null, to: "in_progress", by: "hive_board_bind", session: "session-ac945505-3567-4aac-b683-9da796726d3a" },
    ],
    historyTotal: 2,
  }
  const rows = view.buildItemTimeline(pairing)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].kind, "transition")
  assert.match(rows[0].text, /in_progress → done/)
  assert.match(rows[1].text, /∅ → in_progress/)
  assert.equal(view.buildItemTimeline(undefined).length, 0)
})
