// TOKEN-ECONOMY D1/D2 — tier-based model routing:
// 1. splitRoute ⇔ parseModelSpec equivalence (the first-slash contract is
//    ONE contract; model-tiers.ts keeps its own copy only to stay importable
//    without the service module — a drift between the two must fail the suite).
// 2. capabilityEnvName / tierEnvName naming (non-alphanumerics → _, upper).
// 3. resolveModelRoute ladder: call-arg > capability-env > preset-pin >
//    tier-env > tier-route > inherit (undefined). Empty env values are
//    ignored, not routed. Bare ids carry no provider; model ids keep slashes.
// 4. readPresetModelSpec: tier parsed from preset.yml, unknown tier degrades
//    to undefined (a hand-edited preset must not break dispatch), pin read,
//    missing file → {}.
// 5. D2: the dreamcatcher built-in declares per-shape tiers (one-shot =
//    mechanical, resident = standard) and never a provider/route.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import {
  capabilityEnvName,
  tierEnvName,
  splitRoute,
  resolveModelRoute,
  readPresetModelSpec,
  MODEL_TIERS,
  BUILTIN_AGENTS,
  parseModelSpec,
} from "@hive/dsh-evolution"

// ── 1. splitRoute ⇔ parseModelSpec ───────────────────────────────────────────

test("splitRoute mirrors parseModelSpec exactly (first-slash contract)", () => {
  const cases = [
    "berget/zai-org/GLM-5.3-Flash",
    "berget/Qwen/Qwen3.8-27B-FP8",
    "GLM-5.3-Flash",
    "  berget/zai-org/GLM-5.3-Flash  ",
    "a/b/c/d",
  ]
  for (const c of cases) assert.deepEqual(splitRoute(c), parseModelSpec(c))
})

// ── 2. env naming ────────────────────────────────────────────────────────────

test("env names: non-alphanumerics become underscores, uppercase", () => {
  assert.equal(capabilityEnvName("dreamcatcher"), "HIVE_MODEL_DREAMCATCHER")
  assert.equal(capabilityEnvName("room-service-dev"), "HIVE_MODEL_ROOM_SERVICE_DEV")
  assert.equal(capabilityEnvName("email_brain.ml"), "HIVE_MODEL_EMAIL_BRAIN_ML")
})

test("tier env names are uppercase with the TIER infix", () => {
  for (const t of MODEL_TIERS) assert.equal(tierEnvName(t), `HIVE_MODEL_TIER_${t.toUpperCase()}`)
})

// ── 3. the resolution ladder ─────────────────────────────────────────────────

const ENV = (vars) => ({ ...vars, PATH: "irrelevant" })
const TABLE = { mechanical: "berget/Qwen/Qwen3.8-27B-FP8", deep: "berget/zai-org/GLM-5.3-Flash" }

test("layer 1: the call arg wins over everything", () => {
  const r = resolveModelRoute({
    capabilityId: "cap",
    callModel: "openrouter/expensive/model",
    tier: "mechanical",
    presetPin: "bare-pin/model",
    table: TABLE,
    env: ENV({ HIVE_MODEL_CAP: "x/y", HIVE_MODEL_TIER_MECHANICAL: "z/w" }),
  })
  assert.deepEqual(r, { provider: "openrouter", model: "expensive/model", source: "call-arg" })
})

test("layer 2: HIVE_MODEL_<CAP> beats pin and tier layers", () => {
  const r = resolveModelRoute({
    capabilityId: "my-cap",
    tier: "mechanical",
    presetPin: "pin/one",
    table: TABLE,
    env: ENV({ HIVE_MODEL_MY_CAP: "copilot/gpt-5.1" }),
  })
  assert.deepEqual(r, { provider: "copilot", model: "gpt-5.1", source: "capability-env" })
})

test("layer 2: a bare env value rides the session's provider (no provider part)", () => {
  const r = resolveModelRoute({ capabilityId: "cap", tier: "deep", table: TABLE, env: ENV({ HIVE_MODEL_CAP: "just-a-model" }) })
  assert.deepEqual(r, { model: "just-a-model", source: "capability-env" })
})

test("layer 3: preset pin beats tier layers", () => {
  const r = resolveModelRoute({ capabilityId: "cap", tier: "mechanical", presetPin: "provider/pinned", table: TABLE, env: ENV({}) })
  assert.deepEqual(r, { provider: "provider", model: "pinned", source: "preset-pin" })
})

test("layer 4: HIVE_MODEL_TIER_<TIER> beats the route table", () => {
  const r = resolveModelRoute({ capabilityId: "cap", tier: "mechanical", table: TABLE, env: ENV({ HIVE_MODEL_TIER_MECHANICAL: "work/cheap-model" }) })
  assert.deepEqual(r, { provider: "work", model: "cheap-model", source: "tier-env" })
})

test("layer 5: the tier route table applies when env is unset", () => {
  const r = resolveModelRoute({ capabilityId: "cap", tier: "mechanical", table: TABLE, env: ENV({}) })
  assert.deepEqual(r, { provider: "berget", model: "Qwen/Qwen3.8-27B-FP8", source: "tier-route" })
})

test("the personal-machine case: same call, different table → the personal provider", () => {
  const one = resolveModelRoute({ capabilityId: "cap", tier: "mechanical", table: TABLE, env: ENV({}) })
  const other = resolveModelRoute({
    capabilityId: "cap",
    tier: "mechanical",
    table: { ...TABLE, mechanical: "personal-provider/personal-cheap" },
    env: ENV({}),
  })
  assert.equal(one.provider, "berget")
  assert.equal(other.provider, "personal-provider")
  assert.equal(other.model, "personal-cheap")
})

test("layer 6: no tier, no pin, no call arg → undefined (inherit, never a guessed provider)", () => {
  assert.equal(resolveModelRoute({ capabilityId: "cap", table: TABLE, env: ENV({}) }), undefined)
})

test("a tier with no table entry and no env inherits", () => {
  assert.equal(resolveModelRoute({ capabilityId: "cap", tier: "standard", table: TABLE, env: ENV({}) }), undefined)
})

test("empty-string env values and table entries are ignored, not routed", () => {
  assert.equal(
    resolveModelRoute({ capabilityId: "cap", tier: "mechanical", table: { mechanical: "  " }, env: ENV({ HIVE_MODEL_TIER_MECHANICAL: "" }) }),
    undefined
  )
  assert.equal(resolveModelRoute({ capabilityId: "cap", env: ENV({ HIVE_MODEL_CAP: "  " }) }), undefined)
})

test("an empty call-arg is treated as absent (the loud refusal lives at the call site)", () => {
  assert.equal(resolveModelRoute({ capabilityId: "cap", tier: "deep", table: TABLE, callModel: "  ", env: ENV({}) })?.source, "tier-route")
})

test("model ids with slashes survive (Qwen-style org paths)", () => {
  const r = resolveModelRoute({ capabilityId: "cap", tier: "mechanical", table: TABLE, env: ENV({}) })
  assert.equal(r.model, "Qwen/Qwen3.8-27B-FP8")
  assert.equal(r.provider, "berget")
})

// ── 4. preset reading ────────────────────────────────────────────────────────

test("readPresetModelSpec reads the tier and pin from preset.yml", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-spec-"))
  fs.writeFileSync(path.join(dir, "preset.yml"), "name: cap\ndescription: d\norder: 10\nmodel_tier: mechanical\n", "utf8")
  assert.deepEqual(readPresetModelSpec(dir), { tier: "mechanical", pin: undefined })
  fs.writeFileSync(path.join(dir, "preset.yml"), "name: cap\ndescription: d\nmodel: bare-pin-model\norder: 10\n", "utf8")
  assert.deepEqual(readPresetModelSpec(dir), { tier: undefined, pin: "bare-pin-model" })
})

test("readPresetModelSpec: an unknown tier value degrades to undefined (hand-edited preset must not break dispatch)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-spec-"))
  fs.writeFileSync(path.join(dir, "preset.yml"), "name: cap\nmodel_tier: turbo-ultra\n", "utf8")
  assert.deepEqual(readPresetModelSpec(dir), { tier: undefined, pin: undefined })
})

test("readPresetModelSpec: a missing preset.yml is {} (inherit semantics)", () => {
  assert.deepEqual(readPresetModelSpec(path.join(os.tmpdir(), "tier-spec-does-not-exist")), {})
})

test("readPresetModelSpec feeds the resolver end-to-end", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-spec-"))
  fs.writeFileSync(path.join(dir, "preset.yml"), "name: cap\nmodel_tier: deep\n", "utf8")
  const spec = readPresetModelSpec(dir)
  const r = resolveModelRoute({ capabilityId: "cap", tier: spec.tier, table: TABLE, env: ENV({}) })
  assert.equal(r.source, "tier-route")
  assert.equal(r.model, "zai-org/GLM-5.3-Flash")
})

// ── 5. D2: dreamcatcher tier pins ────────────────────────────────────────────

test("the dreamcatcher built-in pins per-shape tiers (mechanical one-shot, standard resident)", () => {
  const def = BUILTIN_AGENTS.dreamcatcher
  assert.equal(def.modelTier["one-shot"], "mechanical")
  assert.equal(def.modelTier.resident, "standard")
  // Tier values only — no provider/route may leak into the built-in table
  // (routes belong to the deployment's modelRoutes table, never the code).
  for (const shape of Object.keys(def.modelTier)) {
    assert.ok(MODEL_TIERS.includes(def.modelTier[shape]))
  }
})

test("dreamcatcher Recall (one-shot) routes through the mechanical tier entry of a deployment table", () => {
  const def = BUILTIN_AGENTS.dreamcatcher
  const r = resolveModelRoute({ capabilityId: def.id, tier: def.modelTier["one-shot"], table: TABLE, env: ENV({}) })
  assert.equal(r.source, "tier-route")
  assert.equal(r.model, "Qwen/Qwen3.8-27B-FP8")
})

test("no route table configured → dreamcatcher inherits (no crash, no guess)", () => {
  const def = BUILTIN_AGENTS.dreamcatcher
  assert.equal(resolveModelRoute({ capabilityId: def.id, tier: def.modelTier["one-shot"], table: {}, env: ENV({}) }), undefined)
})

test("HIVE_MODEL_DREAMCATCHER overrides the tier pin verbatim", () => {
  const def = BUILTIN_AGENTS.dreamcatcher
  const r = resolveModelRoute({ capabilityId: def.id, tier: def.modelTier["one-shot"], table: TABLE, env: ENV({ HIVE_MODEL_DREAMCATCHER: "github-copilot/gpt-5.1" }) })
  assert.deepEqual(r, { provider: "github-copilot", model: "gpt-5.1", source: "capability-env" })
})
