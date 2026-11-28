/**
 * @hive/dsh-helm — pure role-policy tests (design §6.1 subset, phase 1).
 *
 * Invariants of src/roles.ts: role ids, allowed tool sets, caller→target
 * policy, legacy alias normalization, §5.1 resolution precedence, route class.
 * Plus the W-044 gate for the new pure module: the built dist/roles.js must
 * contain no `@deepseek-ai/` import specifiers (type-erased structural
 * discipline; phase-3 role gate + evolution import this module under link:).
 */

import { test } from "node:test"
import assert from "node:assert"
import { readFileSync } from "node:fs"

import {
  HELMSMAN,
  BOSUN,
  HANDS,
  ROLE_PRESET_IDS,
  isRolePreset,
  HELM_TOOLS,
  CHART_READ_TOOLS,
  COMMS_TOOLS,
  WORK_TOOLS,
  ROLE_ALLOWED_TOOLS,
  LEGACY_PRESET_ALIASES,
  normalizePresetAlias,
  dispatchTargetProblem,
  defaultTargetFor,
  resolveDispatchTarget,
  defaultRouteClassFor,
  computeRoleDenySet,
  roleDenialReason,
  illegalHandsReason,
} from "../dist/roles.js"

const HELM = new Set(HELM_TOOLS)
const CHART = new Set(CHART_READ_TOOLS)
const COMMS = new Set(COMMS_TOOLS)
const WORK = new Set(WORK_TOOLS)

// ── Role ids ────────────────────────────────────────────────────────────────

test("role ids are helmsman/bosun/hands with bosun the ratified spelling", () => {
  assert.deepStrictEqual(ROLE_PRESET_IDS, ["helmsman", "bosun", "hands"])
  assert.ok(LEGACY_PRESET_ALIASES["helm-coordinator"] === BOSUN, "retired helm-coordinator staging id aliases to bosun")
})

test("isRolePreset classifies role ids only", () => {
  assert.ok(isRolePreset("helmsman") && isRolePreset("bosun") && isRolePreset("hands"))
  assert.ok(!isRolePreset("standard") && !isRolePreset("helm-coordinator") && !isRolePreset(undefined))
})

// ── Allowed tool sets (design §1 policy table) ──────────────────────────────

test("helmsman allowed set = six helm tools + chart reads + comms, no work tools, no chart mutation", () => {
  const allowed = ROLE_ALLOWED_TOOLS[HELMSMAN]
  assert.deepStrictEqual([...allowed].sort(), [...HELM, ...CHART, ...COMMS].sort())
  for (const w of WORK) assert.ok(!allowed.includes(w), `Helmsman must not carry work tool ${w}`)
  // chart mutation stays out of the word "reads" (§1: not smuggled into reads)
  for (const mutation of ["hive_board_create", "hive_board_respec", "hive_board_retitle", "hive_board_tag", "hive_board_bind"]) {
    assert.ok(!allowed.includes(mutation), `Helmsman must not carry chart mutation ${mutation}`)
  }
})

test("bosun allowed set = work set W + all six helm tools; no chart/comms cargo", () => {
  const allowed = ROLE_ALLOWED_TOOLS[BOSUN]
  for (const w of WORK) assert.ok(allowed.includes(w), `Bosun must carry work tool ${w}`)
  for (const h of HELM) assert.ok(allowed.includes(h), `Bosun must carry ${h}`)
  for (const c of CHART) assert.ok(!allowed.includes(c), `Bosun must not carry chart tool ${c}`)
  for (const c of COMMS) assert.ok(!allowed.includes(c), `Bosun must not carry comms tool ${c}`)
  assert.strictEqual(allowed.length, WORK.size + HELM.size)
})

test("hands allowed set = work set W only; dispatch/control families intersect at the empty set", () => {
  const allowed = new Set(ROLE_ALLOWED_TOOLS[HANDS])
  assert.deepStrictEqual([...allowed].sort(), [...WORK].sort())
  const dispatchFamilies = [...HELM, "hive_dispatch", "hive_send", "hive_children", "subagent", "subagent_fork",
    "send_message", "list_agents", "wait_agent", "interrupt_agent", "workflow", "todo_write_not_control"]
  for (const t of dispatchFamilies) {
    if (t === "todo_write_not_control") continue
    assert.ok(!allowed.has(t), `Hands must not carry dispatch/control tool ${t}`)
  }
  for (const c of [...CHART, ...COMMS]) assert.ok(!allowed.has(c), `Hands must not carry chart/comms tool ${c}`)
})

// ── Legacy alias normalization ──────────────────────────────────────────────

test("normalizePresetAlias maps helm-coordinator→bosun, trims, passes custom ids through", () => {
  assert.strictEqual(normalizePresetAlias("helm-coordinator"), "bosun")
  assert.strictEqual(normalizePresetAlias("  helm-coordinator  "), "bosun")
  assert.strictEqual(normalizePresetAlias("bosun"), "bosun")
  assert.strictEqual(normalizePresetAlias(" my-custom-preset "), "my-custom-preset")
  assert.strictEqual(normalizePresetAlias("  "), undefined)
  assert.strictEqual(normalizePresetAlias(undefined), undefined)
  assert.strictEqual(normalizePresetAlias(null), undefined)
  assert.strictEqual(normalizePresetAlias(42), undefined)
})

// ── Caller→target policy (§5.1 table) ───────────────────────────────────────

test("caller defaults: helmsman→bosun, bosun→hands, legacy/other→bosun", () => {
  assert.strictEqual(defaultTargetFor(HELMSMAN), BOSUN)
  assert.strictEqual(defaultTargetFor(BOSUN), HANDS)
  assert.strictEqual(defaultTargetFor(undefined), BOSUN)
  assert.strictEqual(defaultTargetFor("some-custom-preset"), BOSUN)
})

test("dispatchTargetProblem: helmsman targets only bosun", () => {
  assert.strictEqual(dispatchTargetProblem(HELMSMAN, BOSUN), undefined)
  assert.match(dispatchTargetProblem(HELMSMAN, HANDS) ?? "", /only "bosun"/)
  assert.match(dispatchTargetProblem(HELMSMAN, "custom") ?? "", /only "bosun"/)
})

test("dispatchTargetProblem: bosun targets only hands", () => {
  assert.strictEqual(dispatchTargetProblem(BOSUN, HANDS), undefined)
  assert.match(dispatchTargetProblem(BOSUN, BOSUN) ?? "", /only "hands"/)
  assert.match(dispatchTargetProblem(BOSUN, "custom") ?? "", /only "hands"/)
})

test("dispatchTargetProblem: hands has no dispatch surface at all", () => {
  for (const target of [BOSUN, HANDS, HELMSMAN, "custom"]) {
    assert.match(dispatchTargetProblem(HANDS, target) ?? "", /no dispatch surface/, `hands→${target} must refuse`)
  }
})

test("dispatchTargetProblem: helmsman is never a dispatch target; legacy reaches bosun/hands/custom only", () => {
  assert.match(dispatchTargetProblem(HELMSMAN, HELMSMAN) ?? "", /helmsman" is not a permitted dispatch target/)
  assert.match(dispatchTargetProblem(BOSUN, HELMSMAN) ?? "", /helmsman" is not a permitted dispatch target/)
  assert.match(dispatchTargetProblem(undefined, HELMSMAN) ?? "", /helmsman" is not a permitted dispatch target/)
  assert.match(dispatchTargetProblem("custom-caller", HELMSMAN) ?? "", /helmsman" is not a permitted dispatch target/)
  assert.strictEqual(dispatchTargetProblem(undefined, BOSUN), undefined)
  assert.strictEqual(dispatchTargetProblem(undefined, HANDS), undefined)
  assert.strictEqual(dispatchTargetProblem("custom-caller", "its-custom-preset"), undefined)
})

// ── §5.1 resolution precedence ──────────────────────────────────────────────

test("precedence: entry.role beats defaultPreset beats workerDefault beats caller default", () => {
  const legacy = { callerPreset: undefined }
  assert.deepStrictEqual(
    resolveDispatchTarget({ ...legacy, entryRole: HANDS, defaultPreset: BOSUN, workerDefault: true }),
    { ok: true, target: HANDS, source: "entry-role" },
  )
  assert.deepStrictEqual(
    resolveDispatchTarget({ ...legacy, defaultPreset: BOSUN, workerDefault: true }),
    { ok: true, target: BOSUN, source: "default-preset" },
  )
  assert.deepStrictEqual(resolveDispatchTarget({ ...legacy, workerDefault: true }), { ok: true, target: HANDS, source: "worker-default" })
  assert.deepStrictEqual(resolveDispatchTarget({ ...legacy, workerDefault: false }), { ok: true, target: BOSUN, source: "caller-default" })
  assert.deepStrictEqual(resolveDispatchTarget({ callerPreset: BOSUN }), { ok: true, target: HANDS, source: "caller-default" })
  assert.deepStrictEqual(resolveDispatchTarget({ callerPreset: HELMSMAN }), { ok: true, target: BOSUN, source: "caller-default" })
})

test("alias normalizes inside entry.role and defaultPreset before policy", () => {
  assert.deepStrictEqual(
    resolveDispatchTarget({ callerPreset: undefined, entryRole: "helm-coordinator" }),
    { ok: true, target: BOSUN, source: "entry-role" },
  )
  assert.deepStrictEqual(
    resolveDispatchTarget({ callerPreset: undefined, defaultPreset: "helm-coordinator" }),
    { ok: true, target: BOSUN, source: "default-preset" },
  )
  // a Bosun may not re-dispatch a Bosun — even under the legacy alias
  assert.ok(!resolveDispatchTarget({ callerPreset: BOSUN, entryRole: "helm-coordinator" }).ok)
})

test("workerDefault narrowings: helmsman refuses hands, bosun and legacy dispatch Hands", () => {
  assert.ok(!resolveDispatchTarget({ callerPreset: HELMSMAN, workerDefault: true }).ok, "Helmsman cannot directly dispatch Hands")
  assert.deepStrictEqual(resolveDispatchTarget({ callerPreset: BOSUN, workerDefault: true }), { ok: true, target: HANDS, source: "worker-default" })
  assert.deepStrictEqual(resolveDispatchTarget({ workerDefault: true }), { ok: true, target: HANDS, source: "worker-default" })
})

// ── Route class (§5.1) ──────────────────────────────────────────────────────

test("hands defaults to the worker route; every other target to the coordinator route", () => {
  assert.strictEqual(defaultRouteClassFor(HANDS), "worker")
  assert.strictEqual(defaultRouteClassFor(BOSUN), "coordinator")
  assert.strictEqual(defaultRouteClassFor("custom"), "coordinator")
})

// ── W-044 gate for the pure module ──────────────────────────────────────────

const W044 = /(?:^|[;\s}])(?:import\s|import\(|require\()[^;'")]*["'][^"']*@deepseek-ai\//

test("built dist/roles.js carries no @deepseek-ai import specifiers (W-044)", () => {
  // Import-specifier gate per design §6.1.1 (comment prose mentioning the
  // namespace is not an import). Static, dynamic, and require forms all count.
  const built = readFileSync(new URL("../dist/roles.js", import.meta.url), "utf8")
  assert.ok(!W044.test(built), "the pure roles module must stay free of runtime @deepseek-ai imports")
})

// ── Phase 3: pure role-gate math (§2.3 lives in role-gate.test.mjs) ─────────

test("computeRoleDenySet subtracts the allowed table and the reserved transport, nothing else", () => {
  const census = ["bash", "read", "subagent", "run_code", "helm_dispatch", "hive_signal"]
  assert.deepEqual(
    computeRoleDenySet(HANDS, census).sort(),
    ["helm_dispatch", "hive_signal", "subagent"],
  )
  assert.deepEqual(
    computeRoleDenySet(HELMSMAN, census).sort(),
    ["bash", "read", "subagent"],
  )
})

test("reserved transport deny-with-explanation: roleDenialReason names the role, the tool, and the policy channel", () => {
  for (const [role, hint] of [
    [HANDS, /Bosun/],
    [BOSUN, /helm_/],
    [HELMSMAN, /hive_board_/],
  ]) {
    const reason = roleDenialReason(role, "decoy_hands_must_not_see")
    assert.match(reason, new RegExp(`"${role}"`))
    assert.match(reason, /decoy_hands_must_not_see/)
    assert.match(reason, hint)
  }
})

test("illegalHandsReason explains the subagent-origin rule", () => {
  assert.match(illegalHandsReason(undefined), /origin must be "subagent", got \(none\)/)
  assert.match(illegalHandsReason("web"), /got "web"/)
})

test("built dist/role-gate.js carries no @deepseek-ai import specifiers (W-044)", () => {
  // The gate uses import type only (Agent face + registry Context
  // augmentation); the built file must show zero runtime specifiers.
  const built = readFileSync(new URL("../dist/role-gate.js", import.meta.url), "utf8")
  assert.ok(!W044.test(built), "the role gate must stay free of runtime @deepseek-ai imports")
})
