/**
 * @hive/dsh-helm — tests (mocked ctx.subagents + mocked agentPresets)
 *
 * Design §6.1 subset for the phase-1 (additive) leg: tool registration +
 * schemas, role→preset resolution, alias passthrough, caller-target policy,
 * registry preflight (fail-closed, all-before-start), agentPreset on every
 * start spec, and owner authorization. Real session deltas and preset
 * composition censuses need a live host (P2-R2; see design §6.2).
 */

import { test } from "node:test"
import assert from "node:assert"

import applyDefault from "../dist/index.js"

const HELM_SESSION = "sess-helmsman"

const mockActivation = (name) => ({
  childId: `child-${name}`,
  name,
  result: Promise.resolve({ output: [{ type: "text", text: "done" }], stopReason: "completed" }),
  dispose: async () => {},
})

/** Mock subagents: deterministic coord1/coord2… names, capture every start spec. */
const makeSubagents = (captured) => {
  let n = 0
  return {
    startActivation: async (spec) => {
      captured.push(spec)
      return mockActivation(`coord${++n}`)
    },
    sendMessage: async () => "msg-1",
  }
}

/** Mock registry service: caller preset via composedPreset; optional resolve failures. */
const makePresets = ({ callerPreset, broken = {} } = {}) => ({
  composedPreset: (_ctx) => callerPreset,
  resolve: async (id) => {
    if (broken[id]) throw new Error(broken[id])
    return { id }
  },
})

const baseCtx = (overrides = {}) => {
  const ctx = {
    tools: { register: () => () => {} },
    subagents: makeSubagents([]),
    agentPresets: makePresets(),
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    ...overrides,
  }
  // Cordis service lookup the way the tool reads it (§5.2 step 3).
  ctx.get = (name) => (name === "agentPresets" ? ctx.agentPresets : undefined)
  return ctx
}

/** Apply the plugin and return every registered tool keyed by name. */
const collectTools = (ctx) => {
  const byName = {}
  ctx.tools = { register: (def) => { byName[def.name] = def; return () => {} } }
  const dispose = applyDefault(ctx)
  return { byName, dispose }
}

const exec = (id) => ({
  agent: { id, ctx: {} },
  signal: new AbortController().signal,
})

// ── Registration & schema (existing contract, extended for role presets) ────

test("all six helm tools register and dispose cleanly", () => {
  const { byName, dispose } = collectTools(baseCtx())
  assert.deepStrictEqual(
    Object.keys(byName).filter((n) => n.startsWith("helm_")).sort(),
    ["helm_cancel", "helm_collect", "helm_dispatch", "helm_prompt", "helm_resume", "helm_status"],
  )
  dispose()
})

test("helm_dispatch schema exposes intent + coordinators string + defaultPreset + workerDefault", () => {
  const { byName, dispose } = collectTools(baseCtx())
  const dispatch = byName.helm_dispatch
  const props = dispatch.parameters.properties
  assert.ok(props.intent, "intent param present")
  assert.strictEqual(props.coordinators.type, "string", "coordinators is a JSON string param")
  assert.ok(props.defaultPreset, "defaultPreset param present (design §5.1)")
  assert.strictEqual(props.defaultPreset.type, "string")
  assert.ok(props.coordinators.description.includes("role"), "coordinators documents the per-entry role")
  dispose()
})

// ── Start specs: role passthrough & route defaults ──────────────────────────

test("helm_dispatch starts one default coordinator — legacy caller → bosun, coordinator route, agentPreset carried", async () => {
  const captured = []
  const { byName, dispose } = collectTools(baseCtx({ subagents: makeSubagents(captured) }))
  const out = await byName.helm_dispatch.execute({ intent: "probe the seam" }, exec(HELM_SESSION))
  dispose()
  assert.match(out, /childId child-coord1/)
  assert.match(out, /preset bosun/)
  assert.strictEqual(captured.length, 1)
  assert.strictEqual(captured[0].agentPreset, "bosun", "legacy caller default target is bosun (design §5.1)")
  assert.strictEqual(captured[0].agentOptions.reasoningEffort, "medium", "coordinator route by default")
})

test("resolution precedence end-to-end: entry.role beats defaultPreset beats workerDefault", async () => {
  const captured = []
  const { byName, dispose } = collectTools(baseCtx({ subagents: makeSubagents(captured) }))
  await byName.helm_dispatch.execute(
    { intent: "x", coordinators: JSON.stringify([{ taskBrief: "a", role: "hands" }]), defaultPreset: "bosun", workerDefault: true },
    exec(HELM_SESSION),
  )
  assert.strictEqual(captured[0].agentPreset, "hands")
  assert.strictEqual(captured[0].agentOptions.reasoningEffort, "low", "hands rides the worker route even via explicit role")

  await byName.helm_dispatch.execute(
    { intent: "y", defaultPreset: "bosun", workerDefault: true },
    exec(HELM_SESSION),
  )
  assert.strictEqual(captured[1].agentPreset, "bosun")
  assert.strictEqual(captured[1].agentOptions.reasoningEffort, "medium", "explicit defaultPreset keeps the coordinator route")
  dispose()
})

test("caller defaults: helmsman→bosun, bosun→hands; agentPreset set on every start", async () => {
  const captured = []
  const a = collectTools(baseCtx({
    subagents: makeSubagents(captured),
    agentPresets: makePresets({ callerPreset: "helmsman" }),
  }))
  await a.byName.helm_dispatch.execute({ intent: "helm dispatches a bosun" }, exec(HELM_SESSION))
  assert.strictEqual(captured[0].agentPreset, "bosun")

  const captured2 = []
  const b = collectTools(baseCtx({
    subagents: makeSubagents(captured2),
    agentPresets: makePresets({ callerPreset: "bosun" }),
  }))
  await b.byName.helm_dispatch.execute({ intent: "bosun dispatches hands" }, exec("sess-bosun"))
  assert.strictEqual(captured2[0].agentPreset, "hands")
  assert.strictEqual(captured2[0].agentOptions.reasoningEffort, "low", "hands target defaults to the worker route (§5.1)")
  a.dispose(); b.dispose()
})

test("alias passthrough: defaultPreset 'helm-coordinator' normalizes to bosun", async () => {
  const captured = []
  const { byName, dispose } = collectTools(baseCtx({ subagents: makeSubagents(captured) }))
  await byName.helm_dispatch.execute({ intent: "legacy alias", defaultPreset: "helm-coordinator" }, exec(HELM_SESSION))
  assert.strictEqual(captured[0].agentPreset, "bosun")
  dispose()
})

test("explicit per-child model overrides the role-derived route; reasoningEffort merges", async () => {
  const captured = []
  const { byName, dispose } = collectTools(baseCtx({ subagents: makeSubagents(captured) }))
  await byName.helm_dispatch.execute(
    { intent: "routed", coordinators: JSON.stringify([
      { taskBrief: "a", role: "hands", model: "xorg/custom-model" },
      { taskBrief: "b", role: "bosun", reasoningEffort: "high" },
    ]) },
    exec(HELM_SESSION),
  )
  assert.strictEqual(captured[0].agentPreset, "hands")
  assert.strictEqual(captured[0].agentOptions.provider, "xorg")
  assert.strictEqual(captured[0].agentOptions.model, "custom-model")
  assert.strictEqual(captured[1].agentPreset, "bosun")
  assert.strictEqual(captured[1].agentOptions.reasoningEffort, "high", "explicit effort overrides the role route default")
  dispose()
})

// ── Caller-target policy denials (zero starts) ──────────────────────────────

test("denials: helmsman→hands / bosun→bosun / hands→anything all refuse with zero starts", async () => {
  const capturedHelmsman = []
  const capturedBosun = []
  const capturedHands = []

  const helmsman = collectTools(baseCtx({
    subagents: makeSubagents(capturedHelmsman),
    agentPresets: makePresets({ callerPreset: "helmsman" }),
  }))
  let out = await helmsman.byName.helm_dispatch.execute(
    { intent: "no", coordinators: JSON.stringify([{ taskBrief: "cannot" }]), defaultPreset: "hands" },
    exec(HELM_SESSION),
  )
  assert.match(out, /dispatch target refused/)
  assert.match(out, /nothing was started/)

  out = await helmsman.byName.helm_dispatch.execute({ intent: "no", workerDefault: true }, exec(HELM_SESSION))
  assert.match(out, /dispatch target refused/, "workerDefault→hands is rejected for a Helmsman (intentional narrowing)")

  const bosun = collectTools(baseCtx({
    subagents: makeSubagents(capturedBosun),
    agentPresets: makePresets({ callerPreset: "bosun" }),
  }))
  out = await bosun.byName.helm_dispatch.execute(
    { intent: "no", coordinators: JSON.stringify([{ taskBrief: "cannot", role: "bosun" }]) },
    exec("sess-bosun"),
  )
  assert.match(out, /may dispatch only "hands"/)

  const hands = collectTools(baseCtx({
    subagents: makeSubagents(capturedHands),
    agentPresets: makePresets({ callerPreset: "hands" }),
  }))
  out = await hands.byName.helm_dispatch.execute({ intent: "no" }, exec("sess-hands"))
  assert.match(out, /no dispatch surface/)

  assert.strictEqual(capturedHelmsman.length, 0, "no denial may start a child")
  assert.strictEqual(capturedBosun.length, 0)
  assert.strictEqual(capturedHands.length, 0)
  helmsman.dispose(); bosun.dispose(); hands.dispose()
})

test("invalid role strings reject at parse time", async () => {
  const { byName, dispose } = collectTools(baseCtx())
  assert.match(
    await byName.helm_dispatch.execute({ intent: "x", coordinators: JSON.stringify([{ taskBrief: "a", role: "" }]) }, exec(HELM_SESSION)),
    /invalid "role"/,
  )
  assert.match(
    await byName.helm_dispatch.execute({ intent: "x", coordinators: JSON.stringify([{ taskBrief: "a", role: 7 }]) }, exec(HELM_SESSION)),
    /invalid "role"/,
  )
  dispose()
})

// ── Preflight: fail-closed, all-before-start (§5.2) ─────────────────────────

test("composition without the agent-preset registry fails closed before any child starts", async () => {
  const captured = []
  const { byName, dispose } = collectTools(baseCtx({
    subagents: makeSubagents(captured),
    agentPresets: undefined,
  }))
  const out = await byName.helm_dispatch.execute({ intent: "headless dispatch" }, exec(HELM_SESSION))
  assert.match(out, /agent-presets service unavailable/) // design §4.5 wording
  assert.match(out, /role dispatch unsupported/)
  assert.strictEqual(captured.length, 0)
  dispose()
})

test("unknown/broken preset aborts the whole batch before the first start", async () => {
  const captured = []
  const { byName, dispose } = collectTools(baseCtx({
    subagents: makeSubagents(captured),
    agentPresets: makePresets({ broken: { "ghost-preset": "Unknown agent preset: ghost-preset" } }),
  }))
  const out = await byName.helm_dispatch.execute(
    { intent: "mixed", coordinators: JSON.stringify([{ taskBrief: "ok one", role: "bosun" }, { taskBrief: "bad one", role: "ghost-preset" }]) },
    exec(HELM_SESSION),
  )
  assert.match(out, /registry preflight/)
  assert.match(out, /ghost-preset/)
  assert.match(out, /aborted before any child started/)
  assert.strictEqual(captured.length, 0, "no partial fan-out from a later invalid role")
  dispose()
})

test("legacy callers may target custom registered preset ids (preflight still applies)", async () => {
  const captured = []
  const { byName, dispose } = collectTools(baseCtx({ subagents: makeSubagents(captured) }))
  await byName.helm_dispatch.execute(
    { intent: "custom composition", coordinators: JSON.stringify([{ taskBrief: "go", role: "my-reviewer-preset" }]) },
    exec(HELM_SESSION),
  )
  assert.strictEqual(captured[0].agentPreset, "my-reviewer-preset")
  dispose()
})

test("batch preflight resolves each distinct target once and starts every member only after validation", async () => {
  const captured = []
  let resolves = 0
  const { byName, dispose } = collectTools(baseCtx({
    subagents: makeSubagents(captured),
    agentPresets: {
      composedPreset: () => "bosun",
      resolve: async () => { resolves += 1; return { id: "hands" } },
    },
  }))
  const out = await byName.helm_dispatch.execute(
    { intent: "two same", coordinators: JSON.stringify([{ taskBrief: "a", role: "hands" }, { taskBrief: "b", role: "hands" }]) },
    exec("sess-bosun"),
  )
  assert.strictEqual(resolves, 1, "distinct targets resolve once")
  assert.strictEqual((out.match(/childId /g) ?? []).length, 2)
  assert.strictEqual(captured.length, 2)
  dispose()
})

// ── Ownership (§5.2) ────────────────────────────────────────────────────────

test("owner authorization: another session cannot prompt/collect/cancel/status a foreign child", async () => {
  const { byName, dispose } = collectTools(baseCtx())
  const out = await byName.helm_dispatch.execute({ intent: "owned child" }, exec("sess-owner"))
  const childId = (out.match(/childId (\S+)/) ?? [])[1]
  assert.ok(childId, "dispatch returned a childId")
  for (const [tool, args] of [
    ["helm_prompt", { childId, text: "hi" }],
    ["helm_resume", { childId, instructions: "go" }],
    ["helm_collect", { childId }],
    ["helm_cancel", { childId }],
    ["helm_status", { childId }],
  ]) {
    const foreign = await byName[tool].execute(args, exec("sess-intruder"))
    assert.match(foreign, /belongs to another caller's session/, `${tool} must refuse a foreign caller`)
  }
  // The owner passes.
  assert.match(await byName.helm_prompt.execute({ childId, text: "hi" }, exec("sess-owner")), /Delivered/)
  dispose()
})

test("helm_status lists only the caller's own children", async () => {
  const { byName, dispose } = collectTools(baseCtx())
  await byName.helm_dispatch.execute({ intent: "child one", coordinators: JSON.stringify([{ taskBrief: "one" }]) }, exec("sess-a"))
  await byName.helm_dispatch.execute({ intent: "child two", coordinators: JSON.stringify([{ taskBrief: "two" }]) }, exec("sess-b"))
  const forA = await byName.helm_status.execute({}, exec("sess-a"))
  const forB = await byName.helm_status.execute({}, exec("sess-b"))
  assert.match(forA, /1 tracked/)
  assert.match(forB, /1 tracked/)
  assert.ok(!forA.includes("child-coord2"), "A must not see B's entries")
  assert.ok(forA.includes("child-coord1") && forB.includes("child-coord2"))
  const forC = await byName.helm_status.execute({}, exec("sess-c"))
  assert.match(forC, /No coordinators tracked for this session\./)
  dispose()
})

// ── Original smoke behaviors (kept, adjusted for the registry mock) ─────────

test("helm_dispatch parses coordinators JSON and rejects bad briefs", async () => {
  const { byName, dispose } = collectTools(baseCtx())
  const bad = await byName.helm_dispatch.execute(
    { intent: "x", coordinators: JSON.stringify([{ title: "no brief" }]) },
    exec(HELM_SESSION),
  )
  assert.match(bad, /missing a non-empty string "taskBrief"/)
  const broken = await byName.helm_dispatch.execute({ intent: "x", coordinators: "{oops" }, exec(HELM_SESSION))
  assert.match(broken, /not valid JSON/)
  dispose()
})

test("helm_collect returns the child's settled output", async () => {
  const { byName, dispose } = collectTools(baseCtx())
  const dispatchOut = await byName.helm_dispatch.execute({ intent: "collect me" }, exec(HELM_SESSION))
  const childId = (dispatchOut.match(/childId (\S+)/) ?? [])[1]
  const result = await byName.helm_collect.execute({ childId }, exec(HELM_SESSION))
  assert.match(result, /stopReason: completed/)
  assert.match(result, /done/)
  dispose()
})
