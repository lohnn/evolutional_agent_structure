// WI-087 — the connected-session affordance model:
//   1. isDshSessionId() — the two-harness discriminator (dsh `session-…`
//      ids afford; opencode-era `ses_…` ids never do).
//   2. resolveItemSessions() — owner → group → released → history priority,
//      dedupe, and the no-dead-affordance gate ([] for old-harness items).
//   3. sessionRowModel() — honest title presentation against the live
//      client catalog (real displayTitle when the host projected one,
//      short-id + honest note when absent; never an invented title).
import assert from "node:assert/strict"
import test from "node:test"

import {
  isDshSessionId,
  resolveItemSessions,
  sessionRowModel,
  shortSessionId,
} from "@hive/dsh-board/lib/session-open"

const DSH_ID = "session-779e789c-18fe-4d22-813d-2ab3c226dd68"
const DSH_OWNER = "session-1028f640-c458-4cb4-8f5b-acee5d91fb07"
const OC_ID = "ses_fd04a546dffeGc2u3jJLQPH4Z0"

// ── 1. the discriminator ─────────────────────────────────────────────────────

test("isDshSessionId accepts dsh-minted shapes (uuid and counter)", () => {
  assert.equal(isDshSessionId(DSH_ID), true)
  assert.equal(isDshSessionId(DSH_OWNER), true)
  assert.equal(isDshSessionId("session-42"), true) // the store's mint fallback
})

test("isDshSessionId refuses old-harness ids, bare uuids and junk", () => {
  assert.equal(isDshSessionId(OC_ID), false)
  assert.equal(isDshSessionId("779e789c-18fe-4d22-813d-2ab3c226dd68"), false)
  assert.equal(isDshSessionId("session-"), false)
  assert.equal(isDshSessionId("session-ab"), false) // below the 4-char floor
  assert.equal(isDshSessionId(""), false)
  assert.equal(isDshSessionId(undefined), false)
  assert.equal(isDshSessionId(null), false)
  assert.equal(isDshSessionId(42), false)
  assert.equal(isDshSessionId(`session-${"a".repeat(80)}`), false) // length gate
})

// ── 2. the resolver ──────────────────────────────────────────────────────────

test("resolveItemSessions orders owner → group → released → history and dedupes", () => {
  const links = resolveItemSessions({
    owner_session: DSH_OWNER,
    group_id: DSH_OWNER, // same id, different field — one row
    released_sessions: [DSH_ID],
    transitions: [{ session: DSH_ID }, { session: "session-99" }, { notSession: 1 }],
  })
  assert.deepEqual(
    links.map((l) => [l.id, l.role]),
    [
      [DSH_OWNER, "owner"],
      [DSH_ID, "released"],
      ["session-99", "history"],
    ],
  )
})

test("resolveItemSessions falls back through the fields when owner is absent", () => {
  const links = resolveItemSessions({ group_id: DSH_ID, released_sessions: null })
  assert.deepEqual(links.map((l) => l.role), ["group"])
  // tombstoned item: released carry the affordance
  assert.deepEqual(resolveItemSessions({ released_sessions: [DSH_ID, DSH_OWNER] }).map((l) => l.id), [
    DSH_ID,
    DSH_OWNER,
  ])
})

test("resolveItemSessions never affords old-harness or junk ids (the no-dead-affordance gate)", () => {
  assert.deepEqual(resolveItemSessions({ owner_session: OC_ID, group_id: OC_ID }), [])
  assert.deepEqual(resolveItemSessions({ owner_session: "session-", group_id: "x" }), [])
  assert.deepEqual(resolveItemSessions({ owner_session: null, group_id: null, released_sessions: [] }), [])
  assert.deepEqual(resolveItemSessions(null), [])
  assert.deepEqual(resolveItemSessions({}), [])
  // mixed: only the dsh half survives
  assert.deepEqual(resolveItemSessions({ owner_session: OC_ID, group_id: DSH_ID }).map((l) => l.id), [DSH_ID])
})

// ── 3. the honest display model ──────────────────────────────────────────────

test("sessionRowModel prefers the real human title (displayTitle, then title)", () => {
  const known = sessionRowModel(DSH_ID, { phase: "ready", byId: { [DSH_ID]: { id: DSH_ID, displayTitle: "WI-087 board session open" } } })
  assert.equal(known.known, true)
  assert.equal(known.title, "WI-087 board session open")
  assert.equal(known.note, "")
  const titled = sessionRowModel(DSH_ID, { phase: "ready", byId: { [DSH_ID]: { id: DSH_ID, title: "raw log title" } } })
  assert.equal(titled.title, "raw log title")
})

test("sessionRowModel falls back to the short id without inventing a title", () => {
  const none = sessionRowModel(DSH_ID, { phase: "ready", byId: { [DSH_ID]: { id: DSH_ID } } })
  assert.equal(none.known, true)
  assert.equal(none.title, shortSessionId(DSH_ID))
})

test("sessionRowModel is honest about absence vs still-loading catalog", () => {
  const loading = sessionRowModel(DSH_ID, { phase: "pending", byId: {} })
  assert.equal(loading.known, false)
  assert.match(loading.note, /still loading/)
  const absent = sessionRowModel(DSH_ID, { phase: "ready", byId: {} })
  assert.equal(absent.known, false)
  assert.match(absent.note, /not in the live session list/)
  const noCatalog = sessionRowModel(DSH_ID, undefined)
  assert.equal(noCatalog.known, false)
  assert.match(noCatalog.note, /not in the live session list/)
})

test("sessionRowModel exposes the catalog running flag for the live dot", () => {
  const running = sessionRowModel(DSH_ID, { phase: "ready", byId: { [DSH_ID]: { id: DSH_ID, displayTitle: "t", running: true } } })
  assert.equal(running.running, true)
})

test("shortSessionId truncates but never loses the session- prefix", () => {
  assert.equal(shortSessionId(DSH_ID), "session-779e789c…")
})
