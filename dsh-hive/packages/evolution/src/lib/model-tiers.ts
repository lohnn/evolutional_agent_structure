/**
 * Tier-based model routing (TOKEN-ECONOMY D1) — provider-PORTABLE model
 * pins for capability dispatch.
 *
 * The problem: a preset must never name a provider. Which providers a
 * machine has auth for (and which are appropriate — the user's other
 * machine carries one work-only and one personal provider) is a property
 * of THAT machine, so a preset that pinned `<provider>/<model>` would break
 * or leak across deployments. This is the same lesson the OpenCode plugin's
 * model-resolve encoded as "frontmatter names the MODEL, never the
 * provider" — generalized here from single models to TIERS, because the
 * coordinator's real question is not "which model" but "how much model does
 * this task need".
 *
 * The contract:
 * - Capabilities and built-ins declare a TIER: `mechanical` (well-specified,
 *   mechanical work — the cheapest model that can still be correct),
 *   `standard` (implementation), `deep` (design, coordination, review).
 * - The DEPLOYMENT maps tiers to routes: the Evolution service config's
 *   `modelRoutes` table (`mechanical` / `standard` / `deep` →
 *   `<provider>/<model>` or a bare model id on the session's provider). The
 *   work machine points tiers at the work provider, the personal machine at
 *   the personal one — same presets, portable pins, local routes.
 * - Env escape hatches are VERBATIM and unvalidated (the OpenCode rule —
 *   they do not second-guess you): `HIVE_MODEL_<CAPABILITY>` pins one
 *   capability/built-in exactly (non-alphanumerics become `_`:
 *   `room-service-dev` → `HIVE_MODEL_ROOM_SERVICE_DEV`);
 *   `HIVE_MODEL_TIER_<TIER>` replaces a tier's route table entry.
 * - Resolution order at dispatch (first hit wins):
 *     1. the hive_dispatch `model:` call arg (the coordinator's override),
 *     2. `HIVE_MODEL_<CAPABILITY>`,
 *     3. the preset's exact model pin (`model:` in preset.yml — rare,
 *        for capabilities that genuinely need one specific model),
 *     4. `HIVE_MODEL_TIER_<TIER>`,
 *     5. the config route table's entry for the declared tier,
 *     6. INHERIT — every failure degrades to the session's model, never to
 *        a guessed provider. A capability with no tier and no pin inherits.
 *
 * Every resolution is logged at info as `[model] <capability>: <outcome>`
 * (the OpenCode diagnostic convention) — that line is the first thing to
 * read when a dispatch misbehaves on a new machine.
 */

import fs from "fs"
import path from "path"

export type ModelTier = "mechanical" | "standard" | "deep"

export const MODEL_TIERS: readonly ModelTier[] = ["mechanical", "standard", "deep"]

/** The deployment's tier→route table (Evolution config `modelRoutes`). */
export interface ModelRouteTable {
  mechanical?: string
  standard?: string
  deep?: string
}

/** Where a resolved route came from — surfaced in the `[model]` log line. */
export type ModelRouteSource =
  | "call-arg"
  | "capability-env"
  | "preset-pin"
  | "tier-env"
  | "tier-route"

export interface ResolvedModelRoute {
  provider?: string
  model: string
  source: ModelRouteSource
}

/** `dreamcatcher` → `HIVE_MODEL_DREAMCATCHER`; `room-service-dev` → `HIVE_MODEL_ROOM_SERVICE_DEV`. */
export function capabilityEnvName(capabilityId: string): string {
  return `HIVE_MODEL_${capabilityId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`
}

/** `mechanical` → `HIVE_MODEL_TIER_MECHANICAL`. */
export function tierEnvName(tier: ModelTier): string {
  return `HIVE_MODEL_TIER_${tier.toUpperCase()}`
}

/**
 * Split a route string into dsh's composite route parts — the SAME contract
 * as the hive_dispatch `model:` arg (`parseModelSpec` in index.ts): the
 * first "/" separates provider from model id, and model ids may themselves
 * contain slashes. Kept as its own copy so this module stays importable
 * without the service module (tests, future consumers); the two are pinned
 * equivalent by test.
 */
export function splitRoute(spec: string): { provider?: string; model: string } {
  const trimmed = spec.trim()
  const slash = trimmed.indexOf("/")
  if (slash === -1) return { model: trimmed }
  return { provider: trimmed.slice(0, slash), model: trimmed.slice(slash + 1) }
}

/**
 * Resolve the model route for one dispatch. Returns `undefined` when no
 * layer contributes a route — the caller then omits agentOptions and the
 * child inherits the session's model (the degrade-to-inherit rule; dsh
 * merges a partial route over the parent's, so a provider-less bare model
 * id is still a complete instruction).
 *
 * `env` is injectable for tests; production passes process.env. Env values
 * are used VERBATIM (only trimmed + empty-checked) — an escape hatch does
 * not second-guess you. A tier is REQUIRED for the tier layers to apply: a
 * capability with no declared tier resolves through layers 1–3 only.
 */
export function resolveModelRoute(opts: {
  capabilityId: string
  /** The hive_dispatch `model:` arg, already validated non-empty by the caller. */
  callModel?: string
  /** The preset/built-in's declared tier (preset.yml `model_tier:` or BuiltinAgentDef). */
  tier?: ModelTier
  /** The preset's exact model pin (preset.yml `model:` — rare). */
  presetPin?: string
  /** The deployment's tier→route table (Evolution config `modelRoutes`). */
  table?: ModelRouteTable
  env?: NodeJS.ProcessEnv
}): ResolvedModelRoute | undefined {
  const env = opts.env ?? process.env

  if (opts.callModel && opts.callModel.trim() !== "") {
    return { ...splitRoute(opts.callModel), source: "call-arg" }
  }

  const capEnv = env[capabilityEnvName(opts.capabilityId)]
  if (capEnv && capEnv.trim() !== "") {
    return { ...splitRoute(capEnv), source: "capability-env" }
  }

  if (opts.presetPin && opts.presetPin.trim() !== "") {
    return { ...splitRoute(opts.presetPin), source: "preset-pin" }
  }

  if (opts.tier) {
    const tierEnv = env[tierEnvName(opts.tier)]
    if (tierEnv && tierEnv.trim() !== "") {
      return { ...splitRoute(tierEnv), source: "tier-env" }
    }
    const tableRoute = opts.table?.[opts.tier]
    if (tableRoute && tableRoute.trim() !== "") {
      return { ...splitRoute(tableRoute), source: "tier-route" }
    }
  }

  return undefined
}

/**
 * Read a preset's declared tier/pin from its `preset.yml` (the small
 * metadata file — persona text lives in agent.cordis.yml and is NOT read
 * here). Regex line parsing mirrors `readCapabilityFrontmatter` for the
 * energy ledger: the preset files are plugin-written and simple; a YAML
 * dependency for two scalar lines is not warranted. Unknown tier values
 * degrade to `undefined` (inherit) rather than throwing — a hand-edited
 * preset must not break dispatch.
 */
export function readPresetModelSpec(presetDir: string): { tier?: ModelTier; pin?: string } {
  let content: string
  try {
    content = fs.readFileSync(path.join(presetDir, "preset.yml"), "utf8")
  } catch {
    return {}
  }
  const tierMatch = content.match(/^model_tier:\s*(\S+)\s*$/m)
  const pinMatch = content.match(/^model:\s*(\S+)\s*$/m)
  const tier = tierMatch?.[1]
  return {
    tier: tier && (MODEL_TIERS as readonly string[]).includes(tier) ? (tier as ModelTier) : undefined,
    pin: pinMatch?.[1],
  }
}
