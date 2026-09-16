// hive_dispatch self-containment + addressing + shape contract:
// 1. parseModelSpec: "<provider>/<model-id>" string contract (first "/" splits;
//    model ids may carry slashes themselves).
// 2. parseDispatchTarget: 'capability/<name>' / 'builtin/<id>' / bare-name
//    compat; bare names of built-ins refuse with the canonical form so the
//    address type is always explicit at the call site.
// 3. BUILTIN_AGENTS: the plugin-owned built-ins — full persona, caller-side
//    filter, and the shape policy ("when which shape") is table-owned.
// 4. composeDispatchPersona: capability children get the identity line only —
//    never the roster (dsh injects it process-wide; the in-persona copy was a
//    live-observed duplicate in the child's system prompt).
// 5. Drift guard: canonical persona file ⇔ preset yml text ⇔ dispatch export.
// 6. Reserved-name guard: /spawn never manifests a built-in's name.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import {
  parseModelSpec,
  parseDispatchTarget,
  composeDispatchPersona,
  composeDispatchLabel,
  DREAMCATCHER_DISPATCH_PERSONA,
  DREAMCATCHER_READ_ONLY_TOOL_FILTER,
  assertCapabilityNameUsable,
  RESERVED_CAPABILITY_NAMES,
  BUILTIN_AGENTS,
} from "@hive/dsh-evolution"

const AGENTS_PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../agents")
const EVOLUTION_PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// ── parseModelSpec ────────────────────────────────────────────────────────────

test("parseModelSpec splits at the FIRST slash (model id may contain slashes)", () => {
  assert.deepEqual(parseModelSpec("berget/zai-org/GLM-5.3-Flash"), {
    provider: "berget",
    model: "zai-org/GLM-5.3-Flash",
  })
  assert.deepEqual(parseModelSpec("berget/Qwen/Qwen3.8-27B-FP8"), {
    provider: "berget",
    model: "Qwen/Qwen3.8-27B-FP8",
  })
})

test("parseModelSpec: a bare value (no slash) is a model id on the parent's provider", () => {
  assert.deepEqual(parseModelSpec("GLM-5.3-Flash"), { model: "GLM-5.3-Flash" })
})

test("parseModelSpec trims and fails loud on empty", () => {
  assert.deepEqual(parseModelSpec("  berget/zai-org/GLM-5.3-Flash "), {
    provider: "berget",
    model: "zai-org/GLM-5.3-Flash",
  })
  assert.throws(() => parseModelSpec(""), /empty model override/)
  assert.throws(() => parseModelSpec("   "), /empty model override/)
})

// ── parseDispatchTarget ──────────────────────────────────────────────────────

test("dispatch addresses: explicit prefixes and bare-name compat", () => {
  assert.deepEqual(parseDispatchTarget("builtin/dreamcatcher"), { kind: "builtin", id: "dreamcatcher" })
  assert.deepEqual(parseDispatchTarget("capability/fitd26-admin-ui"), { kind: "capability", id: "fitd26-admin-ui" })
  assert.deepEqual(parseDispatchTarget("fitd26-admin-ui"), { kind: "capability", id: "fitd26-admin-ui" })
  assert.deepEqual(parseDispatchTarget("  room-service-dev  "), { kind: "capability", id: "room-service-dev" })
})

test("dispatch addresses fail loud, teaching the canonical form", () => {
  // A bare built-in name gets refused WITH the canonical form.
  assert.throws(() => parseDispatchTarget("dreamcatcher"), /dispatch it as "builtin\/dreamcatcher"/)
  assert.throws(() => parseDispatchTarget("builtin/nope"), /unknown built-in "nope"/)
  assert.throws(() => parseDispatchTarget(""), /empty address/)
  assert.throws(() => parseDispatchTarget("Bad_Name"), /invalid capability id/)
})

// ── builtins table — the shape policy lives HERE ─────────────────────────────

test("dreamcatcher builtin: full persona, read-only filter, both shapes, resident default", () => {
  const def = BUILTIN_AGENTS.dreamcatcher
  assert.equal(def.id, "dreamcatcher")
  // Method substance rides the plugin-side persona:
  for (const marker of [
    "## Mode: Recall",
    "## Mode: Audit",
    "hive_dream_rank",
    "hive_dream_detect_duplicates",
    "DREAM RECALL",
    "DREAM AUDIT",
    "shadow-first bias",
    "coverage stage",
    "Confidence calibration",
    "You do not write, create, or modify anything",
  ]) {
    assert.ok(def.persona.includes(marker), `persona must contain ${JSON.stringify(marker)}`)
  }
  assert.equal(def.persona, DREAMCATCHER_DISPATCH_PERSONA)
  assert.deepEqual([...def.toolFilter.deny].sort(), [...DREAMCATCHER_READ_ONLY_TOOL_FILTER.deny].sort())
  assert.equal(def.shapes.length, 2)
  assert.equal(def.shapes[0], "resident", "resident is the default shape (first entry)")
  assert.ok(def.shapes.includes("one-shot"), "Recall consults may run as one-shot consults")
  // The "when which shape" rule is stated, in the table, not left to judgment:
  assert.match(def.shapeGuidance, /resident/)
  assert.match(def.shapeGuidance, /one-shot/)
  assert.match(def.shapeGuidance, /Recall/)
  assert.match(def.shapeGuidance, /Audit/)
})

test("no child persona carries the capability roster (dsh injects it process-wide)", () => {
  for (const capability of ["fitd26-admin-ui", "room-service-dev"]) {
    assert.ok(
      !composeDispatchPersona(capability).includes("## Active Capabilities"),
      `persona for ${capability} must not duplicate the roster`
    )
    assert.ok(composeDispatchPersona(capability).startsWith(`You are the \`${capability}\` HIVE capability`))
  }
  assert.ok(!BUILTIN_AGENTS.dreamcatcher.persona.includes("## Active Capabilities"))
})

// ── persona ↔ preset drift guard ─────────────────────────────────────────────

test("canonical persona.md, preset agent.cordis.yml text, and BOTH shipped copies are identical", () => {
  const personaMd = fs.readFileSync(path.join(AGENTS_PKG, "presets/dreamcatcher/persona.md"), "utf8")
  const shippedCopy = fs.readFileSync(path.join(EVOLUTION_PKG, "presets/dreamcatcher/persona.md"), "utf8")
  const yml = fs.readFileSync(path.join(AGENTS_PKG, "presets/dreamcatcher/agent.cordis.yml"), "utf8")

  // Extract the block-scalar text: lines after `    text: |-` that are blank or
  // indented 6 spaces, dedented; first fully-unindented non-blank line ends it.
  const lines = yml.split("\n")
  const start = lines.indexOf("    text: |-")
  assert.notEqual(start, -1, "agent.cordis.yml must contain the persona text block")
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (line === "" || line.startsWith("      ")) {
      body.push(line.startsWith("      ") ? line.slice(6) : "")
    } else {
      break
    }
  }
  const presetText = body.join("\n").trimEnd()

  assert.equal(DREAMCATCHER_DISPATCH_PERSONA, personaMd.trimEnd(), "export must equal persona.md")
  assert.equal(presetText, personaMd.trimEnd(), "preset yml persona must equal persona.md (keep in sync)")
  assert.equal(shippedCopy.trimEnd(), personaMd.trimEnd(), "evolution's shipped copy must equal persona.md")
})

// ── durable-label composition (list_agents identity carrier) ─────────────────

test("child labels carry the dispatch address as a prefix, composed after custom labels", () => {
  // Default: the plain address.
  assert.equal(composeDispatchLabel("capability/fitd26-admin-ui"), "capability/fitd26-admin-ui")
  assert.equal(composeDispatchLabel("builtin/dreamcatcher"), "builtin/dreamcatcher")
  // A custom label is a SUFFIX, never a replacement — list_agents has no other
  // capability-identity field, so the address must survive every label.
  assert.equal(
    composeDispatchLabel("capability/fitd26-admin-ui", "show-fix"),
    "capability/fitd26-admin-ui · show-fix"
  )
  // Non-resident shapes get a shape suffix (a one-shot is not a steerable child).
  assert.equal(
    composeDispatchLabel("builtin/dreamcatcher", "checks", "one-shot"),
    "builtin/dreamcatcher (one-shot) · checks"
  )
  assert.equal(composeDispatchLabel("builtin/dreamcatcher", undefined, "one-shot"), "builtin/dreamcatcher (one-shot)")
  // Already-prefixed labels don't double up; resident adds no shape suffix.
  assert.equal(composeDispatchLabel("capability/fitd26-admin-ui", "capability/fitd26-admin-ui"), "capability/fitd26-admin-ui")
  const composed = composeDispatchLabel("capability/fitd26-admin-ui", "already prefixed", "resident")
  assert.equal(composed, "capability/fitd26-admin-ui · already prefixed")
})

// ── reserved names & read-only filter (regression pins) ──────────────────────

test("spawn-time: a reserved built-in name can never be manifested", () => {
  assert.ok(RESERVED_CAPABILITY_NAMES.includes("dreamcatcher"))
  assert.throws(() => assertCapabilityNameUsable("dreamcatcher"), /reserved.*builtin\/dreamcatcher/)
  assert.doesNotThrow(() => assertCapabilityNameUsable("fitd26-admin-ui"))
})

test("dreamcatcher read-only toolFilter deny list is intact", () => {
  assert.deepEqual([...DREAMCATCHER_READ_ONLY_TOOL_FILTER.deny].sort(), [
    "hive_dream_artifact_create",
    "hive_dream_begin",
    "hive_dream_complete",
    "hive_dream_harvest",
    "hive_dream_mark_stale",
    "hive_dream_residue",
    "hive_dream_supersede",
  ])
})
