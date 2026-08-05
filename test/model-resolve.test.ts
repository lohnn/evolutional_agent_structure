/**
 * Agent model resolution — every branch, with an INJECTED catalog and an
 * INJECTED environment, so no test here touches the filesystem or the real
 * process env.
 *
 * The bug being defended against: `agents/dreamcatcher.md` pinned
 * `anthropic/claude-sonnet-5`, which resolves on a machine with Anthropic auth
 * and is simply broken on one with only GitHub Copilot. The fix rests on one
 * verified fact about the models.dev catalog — the model NAME `claude-sonnet-5`
 * is identical across providers, and only the prefix is machine-specific — so
 * the tests below are written around portability of the name, not around a
 * mapping table.
 *
 * Two invariants matter more than any individual case, and each has its own
 * describe block: every failure path DEGRADES TO INHERIT rather than to a
 * guessed provider, and a missing/broken catalog NEVER makes resolution worse
 * than having no catalog at all.
 */
import { describe, test, expect, afterEach } from "bun:test"
import {
  resolveAgentModel,
  envVarNameFor,
  modelCatalogPaths,
  loadModelCatalog,
  resetModelCatalogCache,
  type ModelCatalog,
} from "../src/lib/model-resolve.ts"

/** A fake catalog shaped like the real models.json, small enough to read. */
const CATALOG: ModelCatalog = {
  anthropic: {
    models: {
      "claude-sonnet-5": { id: "claude-sonnet-5" },
      "claude-opus-5": { id: "claude-opus-5" },
    },
  },
  "github-copilot": {
    models: {
      "claude-sonnet-5": { id: "claude-sonnet-5" },
      "gpt-5.1": { id: "gpt-5.1" },
    },
  },
  openai: {
    models: {
      "gpt-5.1": { id: "gpt-5.1" },
    },
  },
}

/** No env vars at all — the default for tests that are not about the override. */
const NO_ENV: Record<string, string | undefined> = {}

describe("env override — the escape hatch", () => {
  test("wins over everything, verbatim and unvalidated", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "anthropic/claude-opus-5",
      catalog: CATALOG,
      env: { HIVE_MODEL_DREAMCATCHER: "some-provider/some-model-the-catalog-never-heard-of" },
    })
    expect(r.model).toBe("some-provider/some-model-the-catalog-never-heard-of")
    expect(r.reason).toContain("HIVE_MODEL_DREAMCATCHER")
  })

  test("overrides even a fully-qualified frontmatter pin", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "anthropic/claude-sonnet-5",
      defaultModel: "anthropic/claude-opus-5",
      catalog: CATALOG,
      env: { HIVE_MODEL_DREAMCATCHER: "github-copilot/gpt-5.1" },
    })
    expect(r.model).toBe("github-copilot/gpt-5.1")
  })

  test("applies even when there is no frontmatter model at all", () => {
    const r = resolveAgentModel({
      agentName: "hive",
      spec: undefined,
      defaultModel: undefined,
      catalog: null,
      env: { HIVE_MODEL_HIVE: "github-copilot/claude-sonnet-5" },
    })
    expect(r.model).toBe("github-copilot/claude-sonnet-5")
  })

  test("is trimmed, and blank/whitespace is treated as unset", () => {
    const base = {
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "anthropic/claude-opus-5",
      catalog: CATALOG,
    }
    expect(resolveAgentModel({ ...base, env: { HIVE_MODEL_DREAMCATCHER: "  x/y  " } }).model).toBe("x/y")
    expect(resolveAgentModel({ ...base, env: { HIVE_MODEL_DREAMCATCHER: "" } }).model).toBe(
      "anthropic/claude-sonnet-5"
    )
    expect(resolveAgentModel({ ...base, env: { HIVE_MODEL_DREAMCATCHER: "   " } }).model).toBe(
      "anthropic/claude-sonnet-5"
    )
  })

  test("only THIS agent's variable applies", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "anthropic/claude-opus-5",
      catalog: CATALOG,
      env: { HIVE_MODEL_HIVE: "openai/gpt-5.1" },
    })
    expect(r.model).toBe("anthropic/claude-sonnet-5")
  })

  test("variable naming: non-alphanumerics become underscores", () => {
    expect(envVarNameFor("dreamcatcher")).toBe("HIVE_MODEL_DREAMCATCHER")
    expect(envVarNameFor("board-viewer")).toBe("HIVE_MODEL_BOARD_VIEWER")
    expect(envVarNameFor("some.weird agent")).toBe("HIVE_MODEL_SOME_WEIRD_AGENT")
    expect(envVarNameFor("-leading-and-trailing-")).toBe("HIVE_MODEL_LEADING_AND_TRAILING")
  })
})

describe("no spec — inheriting is the correct outcome, not a fallback", () => {
  test("undefined spec registers no model", () => {
    const r = resolveAgentModel({
      agentName: "hive",
      spec: undefined,
      defaultModel: "anthropic/claude-opus-5",
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.model).toBeUndefined()
    expect(r.reason).toContain("inherits")
  })

  test("empty and whitespace-only specs behave the same", () => {
    for (const spec of ["", "   "]) {
      const r = resolveAgentModel({
        agentName: "hive",
        spec,
        defaultModel: "anthropic/claude-opus-5",
        catalog: CATALOG,
        env: NO_ENV,
      })
      expect(r.model).toBeUndefined()
    }
  })
})

describe("qualified spec — an explicit pin is honoured untouched", () => {
  test("a spec containing / passes through unchanged", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "anthropic/claude-sonnet-5",
      defaultModel: "github-copilot/gpt-5.1",
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.model).toBe("anthropic/claude-sonnet-5")
    expect(r.reason).toContain("unchanged")
  })

  test("NOT re-prefixed even when the default model is a different provider", () => {
    const r = resolveAgentModel({
      agentName: "x",
      spec: "openai/gpt-5.1",
      defaultModel: "anthropic/claude-opus-5",
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.model).toBe("openai/gpt-5.1")
  })

  test("and NOT validated against the catalog — a deliberate pin is the author's call", () => {
    const r = resolveAgentModel({
      agentName: "x",
      spec: "openai/claude-sonnet-5", // openai does not list this in CATALOG
      defaultModel: "anthropic/claude-opus-5",
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.model).toBe("openai/claude-sonnet-5")
  })
})

describe("bare name — the provider follows the machine (the actual fix)", () => {
  test("anthropic machine: claude-sonnet-5 → anthropic/claude-sonnet-5", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "anthropic/claude-opus-5",
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.model).toBe("anthropic/claude-sonnet-5")
  })

  test("copilot machine: THE SAME agent file → github-copilot/claude-sonnet-5", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "github-copilot/gpt-5.1",
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.model).toBe("github-copilot/claude-sonnet-5")
  })

  test("the model NAME is what travels — one file, two machines, no branching", () => {
    // The whole design in one assertion: identical input spec, different host.
    const spec = "claude-sonnet-5"
    const onAnthropic = resolveAgentModel({
      agentName: "dreamcatcher", spec, defaultModel: "anthropic/claude-opus-5", catalog: CATALOG, env: NO_ENV,
    })
    const onCopilot = resolveAgentModel({
      agentName: "dreamcatcher", spec, defaultModel: "github-copilot/gpt-5.1", catalog: CATALOG, env: NO_ENV,
    })
    expect(onAnthropic.model).toBe("anthropic/claude-sonnet-5")
    expect(onCopilot.model).toBe("github-copilot/claude-sonnet-5")
  })

  test("a default model carrying a variant/suffix still yields only the provider", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "github-copilot/some/deeply/nested-id",
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.model).toBe("github-copilot/claude-sonnet-5")
  })
})

describe("DEGRADE TO INHERIT, never to a guessed provider", () => {
  test("missing defaultModel → inherit", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: undefined,
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.model).toBeUndefined()
    expect(r.reason).toContain("inherits")
  })

  test("defaultModel with no provider prefix → inherit (never assume a provider)", () => {
    for (const bad of ["claude-opus-5", "", "   "]) {
      const r = resolveAgentModel({
        agentName: "dreamcatcher",
        spec: "claude-sonnet-5",
        defaultModel: bad,
        catalog: CATALOG,
        env: NO_ENV,
      })
      expect(r.model).toBeUndefined()
    }
  })

  test("the inherit reason tells the user both ways out", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: undefined,
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.reason).toContain("opencode.json")
    expect(r.reason).toContain("HIVE_MODEL_DREAMCATCHER")
  })

  test("catalog says the provider lacks the model → inherit, not a broken id", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "openai/gpt-5.1", // openai has gpt-5.1 only
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.model).toBeUndefined()
    expect(r.reason).toContain("does not offer")
  })

  test("…and names near-miss alternatives when it can", () => {
    const r = resolveAgentModel({
      agentName: "x",
      spec: "gpt-5",
      defaultModel: "openai/gpt-5.1",
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.model).toBeUndefined()
    expect(r.reason).toContain("gpt-5.1")
  })
})

describe("a missing catalog must never make resolution WORSE", () => {
  test("catalog null → optimistic compose", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "github-copilot/gpt-5.1",
      catalog: null,
      env: NO_ENV,
    })
    expect(r.model).toBe("github-copilot/claude-sonnet-5")
    expect(r.reason).toContain("optimistically")
  })

  test("catalog omitted entirely → optimistic compose", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "github-copilot/gpt-5.1",
      env: NO_ENV,
    })
    expect(r.model).toBe("github-copilot/claude-sonnet-5")
  })

  test("provider absent from the catalog → optimistic compose (stale cache, new provider)", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "some-new-provider/whatever",
      catalog: CATALOG,
      env: NO_ENV,
    })
    expect(r.model).toBe("some-new-provider/claude-sonnet-5")
    expect(r.reason).toContain("optimistically")
  })

  test("provider present but with no models map → optimistic compose", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "weird/thing",
      catalog: { weird: {} },
      env: NO_ENV,
    })
    expect(r.model).toBe("weird/claude-sonnet-5")
  })

  test("an empty catalog object is 'cannot tell', not 'nothing exists'", () => {
    const r = resolveAgentModel({
      agentName: "dreamcatcher",
      spec: "claude-sonnet-5",
      defaultModel: "anthropic/claude-opus-5",
      catalog: {},
      env: NO_ENV,
    })
    expect(r.model).toBe("anthropic/claude-sonnet-5")
  })
})

describe("catalog loader", () => {
  afterEach(() => resetModelCatalogCache())

  test("looks in XDG first, then ~/.cache, then macOS Caches", () => {
    const paths = modelCatalogPaths({ XDG_CACHE_HOME: "/xdg" }, "/home/u")
    expect(paths).toEqual([
      "/xdg/opencode/models.json",
      "/home/u/.cache/opencode/models.json",
      "/home/u/Library/Caches/opencode/models.json",
    ])
  })

  test("skips XDG when unset or blank", () => {
    expect(modelCatalogPaths({}, "/home/u")).toEqual([
      "/home/u/.cache/opencode/models.json",
      "/home/u/Library/Caches/opencode/models.json",
    ])
    expect(modelCatalogPaths({ XDG_CACHE_HOME: "  " }, "/home/u")[0]).toBe(
      "/home/u/.cache/opencode/models.json"
    )
  })

  test("returns null — never throws — when nothing is there", () => {
    expect(loadModelCatalog({}, "/nonexistent-home-for-tests")).toBeNull()
  })

  test("memoizes, including the null result", () => {
    expect(loadModelCatalog({}, "/nonexistent-home-for-tests")).toBeNull()
    // A hit would now be ignored: the null is cached until explicitly reset.
    expect(loadModelCatalog({ XDG_CACHE_HOME: "/xdg" }, "/other")).toBeNull()
    resetModelCatalogCache()
    expect(loadModelCatalog({}, "/nonexistent-home-for-tests")).toBeNull()
  })

  test("reads the REAL catalog on this machine and finds the portable model name", () => {
    // Not a mock: this is the fact the whole design rests on. If it ever stops
    // holding, this test is the place that says so. Skipped rather than failed
    // when the cache is absent — a machine without it is legitimate.
    resetModelCatalogCache()
    const real = loadModelCatalog()
    if (!real) return
    const anthropic = real.anthropic?.models
    const copilot = real["github-copilot"]?.models
    if (!anthropic || !copilot) return
    expect(Object.keys(anthropic).length).toBeGreaterThan(0)
    // The claim: the same model NAME exists under both providers.
    const shared = Object.keys(anthropic).filter((m) => m in copilot)
    expect(shared.length).toBeGreaterThan(0)
  })
})
