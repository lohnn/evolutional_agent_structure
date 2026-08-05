/**
 * Agent model resolution — turn an agent file's `model:` frontmatter into a
 * model id that resolves ON THIS MACHINE.
 *
 * ── The bug this exists for ─────────────────────────────────────────────────
 * `agents/dreamcatcher.md` pinned `model: anthropic/claude-sonnet-5` and the
 * config hook passed that string straight through. On a machine with no
 * Anthropic auth — GitHub Copilot only — the id does not resolve and the agent
 * is simply broken. The plugin is distributed; the provider a user has auth for
 * is a property of their machine, not of the agent.
 *
 * The decisive observation is that this is a PREFIX problem, not a model-
 * mapping problem: in the models.dev catalog, `anthropic` and `github-copilot`
 * both expose a model literally named `claude-sonnet-5`. The model NAME is
 * portable; only the provider prefix is machine-specific. So an agent file
 * names the MODEL, and the plugin supplies the PROVIDER at config time from the
 * provider prefix of the user's own default model.
 *
 * ── Resolution order ────────────────────────────────────────────────────────
 *   1. `HIVE_MODEL_<AGENT>` env var  → verbatim, unvalidated (escape hatch)
 *   2. no frontmatter `model:`       → no model (inherit the session's)
 *   3. spec contains "/"             → explicit pin, passed through untouched
 *   4. bare name + default model     → `<provider-of-default>/<name>`
 *   5. best-effort catalog check     → drop to inherit only on a POSITIVE
 *                                      "that provider does not have it"
 *
 * ── Two principles the branches encode ──────────────────────────────────────
 * DEGRADE TO INHERIT, NEVER TO A GUESS. Every failure path returns "no model",
 * which makes the agent run on the session's model — always a working model,
 * because the session is already running on it. There is no path here that
 * invents a provider.
 *
 * A MISSING CACHE FILE MUST NEVER BREAK RESOLUTION. The catalog is an
 * optimisation for catching typos, not an authority. Absent catalog, absent
 * provider entry, unreadable JSON — all resolve optimistically to the composed
 * id and let opencode be the judge. Only a catalog that positively lists the
 * provider AND positively lacks the model is treated as evidence. Anything
 * stricter would make a stale or missing cache silently unpin every agent.
 *
 * `resolveAgentModel` is PURE — the catalog and the environment are injected —
 * so every branch is testable without touching the filesystem. The loader below
 * it is the only part that does I/O, and it is separate for exactly that reason.
 */

import fs from "fs"
import os from "os"
import path from "path"

// ── Types ─────────────────────────────────────────────────────────────────────

/** One provider entry of the models.dev catalog (only the field we read). */
export interface ModelCatalogProvider {
  models?: Record<string, unknown>
}

/** `{ [providerId]: { models: { [modelId]: {...} } } }` */
export type ModelCatalog = Record<string, ModelCatalogProvider>

export interface ResolveModelInput {
  /** Agent name, as registered in config.agent (e.g. "dreamcatcher"). */
  agentName: string
  /** The frontmatter `model:` value, if any. */
  spec: string | undefined
  /** The machine's default model, e.g. "anthropic/claude-opus-5" (config.model). */
  defaultModel: string | undefined
  /** Injected catalog; null/undefined means "unavailable", which is not an error. */
  catalog?: ModelCatalog | null
  /** Injected environment (defaults to process.env) — injectable for tests. */
  env?: Record<string, string | undefined>
}

export interface ResolvedModel {
  /** Absent = inherit the session's model. Never a partially-qualified id. */
  model?: string
  /** Human-readable account of WHY, written to be read in a log. */
  reason: string
}

// ── Env override ──────────────────────────────────────────────────────────────

/**
 * `dreamcatcher` → `HIVE_MODEL_DREAMCATCHER`; `board-viewer` →
 * `HIVE_MODEL_BOARD_VIEWER`. Anything that is not a letter or digit becomes an
 * underscore, because that is the only character class an env var name can hold.
 */
export function envVarNameFor(agentName: string): string {
  const slug = agentName
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
  return `HIVE_MODEL_${slug}`
}

// ── Resolution (pure) ─────────────────────────────────────────────────────────

export function resolveAgentModel(input: ResolveModelInput): ResolvedModel {
  const { agentName, spec, defaultModel, catalog = null, env = process.env } = input

  // 1. Env override — deliberately verbatim and UNVALIDATED. This is the escape
  //    hatch for the case none of the logic below can serve: a machine whose
  //    provider naming does not match the convention, a model the catalog does
  //    not know about yet, or a user who simply wants this agent on something
  //    else today. An escape hatch that second-guesses the person using it is
  //    not an escape hatch.
  const varName = envVarNameFor(agentName)
  const override = env[varName]
  if (typeof override === "string" && override.trim() !== "") {
    return {
      model: override.trim(),
      reason: `${varName} is set — used verbatim, no validation (env override wins over everything)`,
    }
  }

  // 2. No spec — the common case for most agents. Inheriting the session model
  //    is the CORRECT outcome, not a fallback.
  const wanted = typeof spec === "string" ? spec.trim() : ""
  if (wanted === "") {
    return { reason: "no model: in frontmatter — inherits the session's model" }
  }

  // 3. A "/" means the author is pinning a provider ON PURPOSE. Honour it
  //    untouched: this keeps every third-party and pre-existing agent file
  //    working unchanged, and leaves a deliberate hard-pin possible.
  if (wanted.includes("/")) {
    return {
      model: wanted,
      reason: `frontmatter pins the fully-qualified id "${wanted}" (contains "/") — passed through unchanged`,
    }
  }

  // 4. Bare name: take the provider from the machine's own default model.
  const provider = typeof defaultModel === "string" ? (defaultModel.split("/")[0] ?? "") : ""
  if (provider === "" || typeof defaultModel !== "string" || !defaultModel.includes("/")) {
    return {
      reason:
        `frontmatter names the bare model "${wanted}", but the machine's default model ` +
        `(${defaultModel === undefined || defaultModel === "" ? "unset" : `"${defaultModel}"`}) ` +
        `carries no "provider/model" prefix to borrow — inherits rather than guessing a provider. ` +
        `Set "model" in opencode.json, or set ${varName} to pin this agent directly.`,
    }
  }
  const composed = `${provider}/${wanted}`

  // 5. Catalog check — best effort, and deliberately asymmetric. Only a
  //    POSITIVE absence (provider is in the catalog, model is not in it) counts
  //    as evidence. Every other shape is "cannot tell", and cannot-tell must
  //    resolve optimistically: a missing or stale cache file silently unpinning
  //    every agent would be a far worse failure than one bad id that opencode
  //    reports honestly.
  if (!catalog) {
    return {
      model: composed,
      reason: `composed "${composed}" from default provider "${provider}" + frontmatter name "${wanted}"; catalog unavailable — accepted optimistically`,
    }
  }
  const entry = catalog[provider]
  if (!entry || typeof entry.models !== "object" || entry.models === null) {
    return {
      model: composed,
      reason: `composed "${composed}"; provider "${provider}" is absent from the catalog (or lists no models) — accepted optimistically, opencode is the judge`,
    }
  }
  if (!Object.prototype.hasOwnProperty.call(entry.models, wanted)) {
    const alternatives = Object.keys(entry.models)
      .filter((m) => m.includes(wanted) || wanted.includes(m))
      .slice(0, 3)
    return {
      reason:
        `provider "${provider}" is in the catalog but does not offer "${wanted}" — ` +
        `inherits the session's model instead of registering an id that cannot resolve.` +
        (alternatives.length > 0 ? ` Closest names it does offer: ${alternatives.join(", ")}.` : "") +
        ` Override with ${varName} if the catalog is stale.`,
    }
  }
  return {
    model: composed,
    reason: `composed "${composed}" from default provider "${provider}" + frontmatter name "${wanted}" — confirmed in catalog`,
  }
}

// ── Catalog loader (the only I/O in this module) ──────────────────────────────

/**
 * Candidate locations of opencode's models.dev cache, most specific first.
 * Exported so a diagnostic can report where we looked.
 */
export function modelCatalogPaths(
  env: Record<string, string | undefined> = process.env,
  home: string = os.homedir()
): string[] {
  const paths: string[] = []
  const xdg = env.XDG_CACHE_HOME
  if (typeof xdg === "string" && xdg.trim() !== "") {
    paths.push(path.join(xdg, "opencode", "models.json"))
  }
  paths.push(path.join(home, ".cache", "opencode", "models.json"))
  paths.push(path.join(home, "Library", "Caches", "opencode", "models.json")) // macOS
  return paths
}

/**
 * Memoized at module scope: `null` is cached too. The config hook runs once per
 * session, but it loops over every agent, and a "not found" is exactly as worth
 * remembering as a hit — re-stat'ing three absent paths per agent would be the
 * silly failure mode here.
 */
let catalogCache: { value: ModelCatalog | null } | null = null

/**
 * Read the models.dev catalog, or null. NEVER throws: unreadable, malformed and
 * absent all collapse to null, which the resolver treats as "cannot tell" and
 * proceeds optimistically. This function existing must not be able to make
 * model resolution worse than it would have been without it.
 */
export function loadModelCatalog(
  env: Record<string, string | undefined> = process.env,
  home: string = os.homedir()
): ModelCatalog | null {
  if (catalogCache) return catalogCache.value
  let value: ModelCatalog | null = null
  try {
    for (const p of modelCatalogPaths(env, home)) {
      if (!fs.existsSync(p)) continue
      const parsed: unknown = JSON.parse(fs.readFileSync(p, "utf8"))
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        value = parsed as ModelCatalog
        break
      }
    }
  } catch {
    value = null // unreadable or malformed — indistinguishable from absent, on purpose
  }
  catalogCache = { value }
  return value
}

/** Drop the memoized catalog (tests, and any future hot-reload path). */
export function resetModelCatalogCache(): void {
  catalogCache = null
}
