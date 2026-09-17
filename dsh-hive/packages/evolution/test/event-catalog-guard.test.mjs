// Event-catalog guard — every event this plugin LISTENS on must be a real
// published event in the dsh runtime's catalog for the pinned harness
// version. This is the regression guard for the `agent/session-start`
// incident: the energy tick was bound to an event name the dsh runtime does
// not publish, the tick sat dead live for days, and the suite stayed green
// because the tests emitted the phantom event name themselves.
//
// Technique: these sources are TypeScript and this repo's tests are plain
// `.mjs` that must NOT import TS — so the test reads the SOURCE TEXT as
// strings and extracts every `ctx.on("<name>"` / `this.ctx.on("<name"`
// binding with a regex. That is deliberately crude: it catches any listener
// binding regardless of the surrounding code shape.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "node:url"

const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url))

// Events the plugin may LISTEN on. Allowlist discipline:
//
// (a) every name here must exist as a PUBLISHED event in the dsh runtime
//     catalog for the pinned harness version (0.1.6-alpha.1; see the
//     peerDependencies pin in package.json for the corridor). `agent/created`
//     (serial: payload `{ agent, source, signal }`, fires once per agent
//     publication — startup, resume, clear, compact) is real there;
//     `agent/session-start` is NOT — binding to that invented name cost us a
//     silent live failure (hive-state.json's lastTick frozen for 5+ days
//     while usage was recorded).
// (b) `ctx.emit(...)` names are CUSTOM hive events (hive/capability-used,
//     hive/tick) — this plugin declares and emits them itself. They are not
//     runtime events and must NEVER be added to this allowlist.
// (c) when the harness pin bumps, re-derive the real event names from the
//     harness event catalog for the NEW pinned version (the dsh runtime's
//     Event.listEvents inspect catalog, or the Events interfaces in the
//     @deepseek-ai/dsh-* shipped .d.ts) — never trust this list across a
//     version boundary.
const LISTENED_EVENTS_ALLOWLIST = ["agent/created"]

// The lookbehind excludes longer identifiers ending in `ctx` (e.g.
// `agentCtx.on(...)`); the group accepts both `ctx.on(...)` and the service
// methods' `this.ctx.on(...)`.
const LISTENER_RE = /(?<![\w.$])(?:this\.)?ctx\.on\(\s*(["'])([^"']+)\1/g

function collectListenedEvents() {
  const relFiles = [
    "index.ts",
    ...fs
      .readdirSync(path.join(SRC_DIR, "lib"))
      .filter((f) => f.endsWith(".ts"))
      .sort()
      .map((f) => path.join("lib", f)),
  ]
  const names = new Set()
  for (const rel of relFiles) {
    const text = fs.readFileSync(path.join(SRC_DIR, rel), "utf8")
    for (const m of text.matchAll(LISTENER_RE)) names.add(m[2])
  }
  return { relFiles, names: [...names].sort() }
}

test("every ctx.on listener name is an allowlisted dsh runtime event", () => {
  const { relFiles, names } = collectListenedEvents()
  // Guard the guard: the extraction must have found at least one listener.
  // A regex that silently matched nothing (layout change, typo in the
  // pattern) would otherwise make this assertion vacuously green — the
  // exact failure mode this file exists to prevent.
  assert.ok(relFiles.includes("index.ts"), `src/index.ts must be scanned (scanned: ${relFiles.join(", ")})`)
  assert.ok(
    names.length >= 1,
    `no ctx.on listeners extracted from ${relFiles.join(", ")} — the extraction regex or source layout changed; fix the guard, do not delete it`
  )
  const unexpected = names.filter((n) => !LISTENED_EVENTS_ALLOWLIST.includes(n))
  assert.deepEqual(
    unexpected,
    [],
    `listener(s) bound to non-allowlisted event name(s): ${unexpected.join(", ") || "(none)"}. ` +
      `Allowlist entries must exist as published events in the dsh runtime catalog for the pinned version; ` +
      `custom ctx.emit() hive/* names never belong there (see the allowlist comment).`
  )
})

test("the allowlist itself carries only runtime events, never custom hive/* emissions", () => {
  for (const name of LISTENED_EVENTS_ALLOWLIST) {
    assert.ok(
      !name.startsWith("hive/"),
      `allowlist entry "${name}" is a custom hive event emitted via ctx.emit(), not a dsh runtime event — remove it`
    )
  }
})
