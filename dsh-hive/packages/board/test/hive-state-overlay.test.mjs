// WI-083 — the HIVE-state overlay: unit tests for the client view projection
// (src/lib/hive-state-view.ts, compiled to dist) plus byte-level guards on the
// EMITTED bundle (the I-192/A7 pattern: string literals that must survive
// minification, and absence of anything that would break the dock contract).
import { readFileSync } from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import test from "node:test"
import {
  buildTimeline,
  childrenInFlight,
  pillState,
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
  hive: { isCoordinator: true, agent: "dsh-hive-plugins", awakenedAt: "2026-10-08T16:00:00.000Z", lastAwakenInput: "run it" },
  goal: { objective: "ship the overlay", status: "active", roundsStarted: 3, paused: false, disabled: false, createdAt: "2026-10-08T16:30:00.000Z", updatedAt: "2026-10-08T17:00:00.000Z" },
  usageMarks: [{ capability: "dsh-hive-plugins", timestamp: "2026-10-08T16:55:41.199Z" }],
  dreamEvents: [{ ts: "2026-10-08T16:56:00.000Z", tool: "rank" }],
  dreamAmbient: {
    activeCount: 1,
    active: [{ dreamId: "DRM-090", entryTime: "2026-10-08T15:00:00.000Z" }],
    recent: [{ dreamId: "DRM-057", entryTime: "2026-10-08T10:19:27.971Z", exitTime: "2026-10-08T10:19:40.112Z", status: "COMPLETE" }],
  },
  lastTick: "2026-10-08T08:13:25.983Z",
}

test("buildTimeline: every payload record becomes exactly one real event", () => {
  const events = buildTimeline(PAYLOAD)
  const kinds = events.map((e) => e.kind)
  assert.deepEqual([...kinds].sort(), ["awaken", "dream", "dream", "dream", "goal", "tick", "used"])
  const awaken = events.find((e) => e.kind === "awaken")
  assert.match(awaken.text, /awakened as dsh-hive-plugins/)
  assert.match(awaken.text, /"run it"/)
  const goal = events.find((e) => e.kind === "goal")
  assert.match(goal.text, /round 3/)
})

test("buildTimeline: events sort descending by ts", () => {
  const events = buildTimeline(PAYLOAD)
  const times = events.map((e) => new Date(e.ts ?? 0).getTime())
  const sorted = [...times].sort((a, b) => b - a)
  assert.deepEqual(times, sorted)
})

test("buildTimeline: workspace-level facts are flagged ambient, session rows are not", () => {
  const events = buildTimeline(PAYLOAD)
  // ambient = workspace-level (DRM files, energy tick) — never attributed
  for (const e of events.filter((x) => x.ambient === true)) {
    assert.ok(["dream", "tick"].includes(e.kind), `ambient row has a workspace kind: ${e.kind}`)
    assert.ok(e.text.includes("(workspace)"), `ambient row says so: ${e.text}`)
  }
  // the session's OWN dream-telemetry rows stay session-attributed (not ambient)
  const own = events.find((e) => e.kind === "dream" && e.ambient === undefined)
  assert.ok(own, "the session's dream-telemetry row is present and NOT ambient")
  assert.match(own.text, /dream archive rank/)
  assert.equal(events.find((e) => e.kind === "tick").text.includes("(workspace)"), true)
})

test("buildTimeline: absent coordinator fields render nothing fabricated", () => {
  const events = buildTimeline({ ok: true, hive: { isCoordinator: false } })
  assert.equal(events.find((e) => e.kind === "awaken"), undefined)
  assert.equal(events.length, 0)
  assert.deepEqual(buildTimeline(undefined), [])
})

test("childrenInFlight: only running rows parented to the selected session", () => {
  const list = {
    byId: {
      me: { id: "me", running: true },
      kid1: { id: "kid1", parentId: "me", running: true },
      kid2: { id: "kid2", parentId: "me", running: false },
      kid3: { id: "kid3", parentId: "other", running: true },
    },
  }
  const kids = childrenInFlight(list, "me")
  assert.deepEqual(kids.map((k) => k.id), ["kid1"])
  assert.deepEqual(childrenInFlight(undefined, "me"), [])
})

test("pillState: dormant→awakened→working in that precedence, honest unknown", () => {
  assert.deepEqual(pillState(undefined, undefined), { word: "…", tone: "unknown" })
  assert.deepEqual(pillState({ ok: true }, undefined), { word: "ambient", tone: "ambient" })
  assert.deepEqual(pillState({ ok: true, hive: { isCoordinator: true } }, undefined), { word: "awakened", tone: "hive" })
  assert.deepEqual(pillState({ ok: true, hive: { isCoordinator: true } }, true), { word: "working", tone: "hive" })
  assert.deepEqual(pillState({ ok: true, hive: { isCoordinator: false } }, true), { word: "working", tone: "ambient" })
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
  // the W-099 discipline: the page must APPLY state — the poll cadence marker
  assert.ok(CLIENT.includes("observed live"), "observed-run marker present (timeline moves, not a frozen soak)")
})

test("emitted client.js: overlay styling is token-only (no hex colors)", () => {
  const cssStart = CLIENT.indexOf("hvs-pill{")
  assert.ok(cssStart > 0, "overlay CSS block present in the bundle")
  const cssEnd = CLIENT.indexOf("hvs-flag", cssStart)
  const css = CLIENT.slice(cssStart, cssEnd)
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, "no hex color literals in overlay CSS — theme tokens only")
})
