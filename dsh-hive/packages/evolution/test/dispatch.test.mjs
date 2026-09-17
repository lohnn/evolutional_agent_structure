// hive_dispatch self-containment + addressing + shape contract:
// 1. parseModelSpec: "<provider>/<model-id>" string contract (first "/" splits;
//    model ids may carry slashes themselves).
// 2. parseDispatchTarget: 'capability/<name>' / 'builtin/<id>' / bare-name
//    compat; bare names of built-ins refuse with the canonical form so the
//    address type is always explicit at the call site.
// 3. BUILTIN_AGENTS: the plugin-owned built-ins — full persona, caller-side
//    filter, and the shape policy ("when which shape") is table-owned.
// 4. composeDispatchPersona: identity line + the capability's OWN material
//    (T5/D7 persona-carried transport, resolved by resolveCapabilityMaterial
//    from the preset persona text or the legacy ledger body) + the capability
//    standing context, always; a material miss is non-fatal (standing-only).
//    Never the roster (dsh injects it process-wide; the in-persona copy was a
//    live-observed duplicate in the child's system prompt). This return value
//    is passed VERBATIM as SubagentStartRequest.persona — the request persona
//    captured here is the one the dispatched child mounts.
// 5. Drift guard: canonical persona file ⇔ preset yml text ⇔ dispatch export.
// 6. Reserved-name guard: /spawn never manifests a built-in's name.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import {
  parseModelSpec,
  parseDispatchTarget,
  composeDispatchPersona,
  composeDispatchLabel,
  resolveCapabilityMaterial,
  renderAgentCordisYml,
  CAPABILITY_STANDING,
  DREAMCATCHER_DISPATCH_PERSONA,
  DREAMCATCHER_READ_ONLY_TOOL_FILTER,
  assertCapabilityNameUsable,
  RESERVED_CAPABILITY_NAMES,
  BUILTIN_AGENTS,
} from "@hive/dsh-evolution"

const AGENTS_PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../agents")
const EVOLUTION_PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const IDENTITY_LINE = (capability) =>
  `You are the \`${capability}\` HIVE capability, dispatched as a resident continuable child of the coordinator.`

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

// ── T5: capability material transport on dispatch ────────────────────────────
// resolveCapabilityMaterial feeds composeDispatchPersona, whose return value
// hive_dispatch passes VERBATIM as SubagentStartRequest.persona — the request
// persona the resident child mounts. These capture that persona through the
// same expression the tool executes.

// Fixture workspace: preset dirs are rendered by the plugin's OWN writer
// (renderAgentCordisYml — the same file /spawn and the awaken batch tool
// materialize), so the extraction is tested against the shipped format, not
// a copy of it.
function makeMaterialWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t5-material-"))
  const caps = path.join(root, ".opencode/agents/capabilities")
  fs.mkdirSync(path.join(caps, "gamma"), { recursive: true })
  fs.writeFileSync(
    path.join(caps, "gamma", "agent.cordis.yml"),
    renderAgentCordisYml("gamma", "the gamma capability", {
      enables: "enables gamma work",
      triggers: "when gamma work appears",
      protocol: "do gamma things carefully",
      boundaries: "never crosses into alpha's seams",
    })
  )
  fs.writeFileSync(
    path.join(caps, "gamma.md"),
    [
      "---",
      "name: gamma",
      "description: the gamma capability",
      "energy: 50",
      "---",
      "",
      "# gamma",
      "",
      "Legacy gamma body: the home of the old method text.",
      "",
    ].join("\n")
  )
  return { root, caps }
}

test("preset capability: the persona text block (identity dropped) rides into the request persona, standing appended (T5-a)", () => {
  const { root, caps } = makeMaterialWorkspace()
  try {
    const material = resolveCapabilityMaterial(root, caps, "gamma")
    // The identity line is re-composed fresh, never doubled:
    assert.ok(material, "preset material must resolve")
    assert.ok(!material.startsWith("You are the gamma capability"), "identity line must be dropped from the material")
    // The structured sections arrive in full:
    assert.ok(material.startsWith("## What This Enables"))
    assert.ok(material.includes("## Activation Triggers"))
    assert.ok(material.includes("do gamma things carefully"))
    assert.ok(material.includes("never crosses into alpha's seams"))
    // The preset is the CANONICAL source (D7 cutover): the sibling legacy
    // ledger body must NOT be read when the preset persona exists.
    assert.ok(!material.includes("Legacy gamma body"), "legacy .md body must not leak past the preset")
    assert.ok(!material.includes("energy: 50"))

    const persona = composeDispatchPersona("gamma", { material })
    // Exactly the composition contract: identity \n\n material \n\n standing:
    assert.ok(persona.startsWith(IDENTITY_LINE("gamma") + "\n\n"))
    assert.ok(persona.endsWith(CAPABILITY_STANDING), "capability standing always closes the persona")
    assert.ok(persona.includes(material), "the method rides verbatim")
    assert.ok(persona.includes("## What This Enables") && persona.includes("## Boundaries"))
    assert.ok(!persona.includes("## Active Capabilities"), "roster never rides the persona")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("legacy capability: the .md body (frontmatter stripped) rides, standing appended (T5-b)", () => {
  const { root, caps } = makeMaterialWorkspace()
  try {
    fs.writeFileSync(
      path.join(caps, "delta.md"),
      [
        "---",
        "name: delta",
        "description: the delta capability",
        "energy: 50",
        "---",
        "",
        "# delta",
        "",
        "Delta method: delta resolves schemas before delta writes rows.",
        "",
      ].join("\n")
    )
    const material = resolveCapabilityMaterial(root, caps, "delta")
    assert.equal(material, "# delta\n\nDelta method: delta resolves schemas before delta writes rows.")
    const persona = composeDispatchPersona("delta", { material })
    assert.ok(persona.startsWith(IDENTITY_LINE("delta") + "\n\n"))
    assert.ok(persona.includes("Delta method: delta resolves schemas"))
    assert.ok(!persona.includes("energy: 50") && !persona.includes("name: delta"), "frontmatter must not ride")
    assert.ok(persona.endsWith(CAPABILITY_STANDING))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("material miss is non-fatal: identity + standing only (T5-c)", () => {
  const { root, caps } = makeMaterialWorkspace()
  try {
    // Neither preset nor ledger, and a capabilities root that does not exist
    // at all — both resolve to undefined, never throw:
    assert.equal(resolveCapabilityMaterial(root, caps, "ghost"), undefined)
    assert.equal(resolveCapabilityMaterial(root, "/definitely/not/a/dir", "ghost"), undefined)
    const persona = composeDispatchPersona("ghost")
    assert.equal(persona, `${IDENTITY_LINE("ghost")}\n\n${CAPABILITY_STANDING}`)
    // The standing context carries the five survivor constraints:
    for (const section of ["## Scope Discipline", "## Reporting Back", "## Contracts in Parallel Work", "## Independent First", "## The Synapse"]) {
      assert.ok(persona.includes(section), `standing context must carry ${section}`)
    }
    // A no-persona spawn (identity-only text block) cascades to the ledger:
    fs.mkdirSync(path.join(caps, "epsilon"), { recursive: true })
    fs.writeFileSync(path.join(caps, "epsilon", "agent.cordis.yml"), renderAgentCordisYml("epsilon", "the epsilon capability"))
    assert.equal(resolveCapabilityMaterial(root, caps, "epsilon"), undefined, "identity-only block resolves to nothing")
    fs.writeFileSync(
      path.join(caps, "epsilon.md"),
      "---\nname: epsilon\ndescription: the epsilon capability\nenergy: 50\n---\n\n# epsilon\n\nthe epsilon capability\n"
    )
    assert.equal(resolveCapabilityMaterial(root, caps, "epsilon"), "# epsilon\n\nthe epsilon capability")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("the builtin (dreamcatcher) composition is untouched: no standing, byte-identical persona (T5-d)", () => {
  // The built-in persona is its own method, passed through verbatim — hive_dispatch
  // never routes builtins through composeDispatchPersona and the standing
  // context never appends to them.
  assert.ok(!BUILTIN_AGENTS.dreamcatcher.persona.includes(CAPABILITY_STANDING))
  assert.ok(!BUILTIN_AGENTS.dreamcatcher.persona.includes("## Scope Discipline"))
  assert.ok(!BUILTIN_AGENTS.dreamcatcher.persona.includes("<!-- hive:capability-standing v1 -->"))
  assert.equal(BUILTIN_AGENTS.dreamcatcher.persona, DREAMCATCHER_DISPATCH_PERSONA)
  // And the composer itself never claims a builtin: with no options the shape
  // is exactly identity + standing (pins the no-material baseline byte-for-byte).
  assert.equal(
    composeDispatchPersona("room-service-dev"),
    `${IDENTITY_LINE("room-service-dev")}\n\n${CAPABILITY_STANDING}`
  )
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
