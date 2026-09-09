/**
 * @hive/dsh-evolution — the HIVE evolution lifecycle as a dsh Service.
 *
 * Exposes `ctx.evolution`:
 *  - Energy state (`lib/energy.ts` — a VERBATIM port of the OpenCode plugin's
 *    `src/lib/energy.ts`) and the tick, fired on dsh's `agent/session-start`
 *    event (the analogue of OpenCode's `session.created` hook).
 *  - Roster state + injection via `ctx.systemPrompt.section` at order 50
 *    (spike 0.2: ordering is numeric + total, registration-order independent;
 *    dynamic `text` is evaluated per assembly, so the roster is always fresh).
 *  - Capability presets: dsh agent presets under `capabilitiesPath`
 *    (default `<directory>/.opencode/agents/capabilities` — the OLD location,
 *    kept byte-compatible for dual-run). A dsh `PresetRoot` is registered so
 *    `capability/<name>` presets are discoverable by dsh's preset roster AND
 *    spawnable via `ctx.subagents.startContinuable`. Capabilities are
 *    resident, continuable children (spike 0.3) — not one-shot subagents.
 *  - `/spawn` `/evolve` `/dissolve` `/tick` as dsh commands.
 *
 * Session identity (the least-mechanical part of the port): dsh sessions are
 * first-class and continuable children persist + cold-resume natively, so the
 * OpenCode `session-identity.ts` registry + group-scoped targeting layer is
 * REPLACED by dsh's own session store. What survives is the naming contract
 * (`capabilities/<name>` → preset id) and the usage log that feeds the
 * energy tick. Per-child composition rides the rc.1 start REQUEST
 * (`SubagentStartRequest.persona` / `.toolFilter`): snapshotted into the
 * child's durable descriptor and installed by the continuation manager via
 * `applyChildComposition` — on first creation AND on cold resume.
 *
 * `model-resolve.ts` shrinks to nothing: dsh has first-class per-agent model
 * routing (`agent.options`); a capability preset inherits the session model
 * unless its composition pins one.
 */

import { Service } from "@deepseek-ai/cordis"
import z from "@deepseek-ai/schemastery"
import fs from "fs"
import path from "path"
import { createMessage, type ContentBlock } from "@deepseek-ai/dsh-llm"
import { defineTool } from "@deepseek-ai/dsh-tools"
import type { Agent } from "@deepseek-ai/dsh-agent"

/** String-output tool contract (the spike 0.1 pattern used across the port). */
const TEXT_OUT = {
  schema: { type: "string" },
  render: (_args: unknown, value: string): ContentBlock[] => [{ type: "text", text: value }],
} as const

import {
  readHiveState,
  writeHiveState,
  markCapabilityUsed,
  tickEnergy,
  getCapabilitiesSummary,
  type HiveState,
  type TickResult,
} from "./lib/energy.js"

declare module "@deepseek-ai/cordis" {
  interface Context {
    evolution: Evolution
    tools: import("@deepseek-ai/dsh-tools").ToolRuntime
    systemPrompt: import("@deepseek-ai/dsh-system-prompt").SystemPrompt
    commands: import("@deepseek-ai/dsh-commands").CommandRuntime
    subagents: import("@deepseek-ai/dsh-subagent").SubagentRuntime
  }
  interface Events {
    /**
     * A HIVE capability was marked used (energy bookkeeping). Emitted after
     * every `markUsed` so observers (roster, dashboards) can re-render.
     * @mode emit
     */
    "hive/capability-used"(name: string, sessionId: string): void
    /**
     * The energy tick ran (on `agent/session-start` or `/tick`).
     * @mode emit
     */
    "hive/tick"(results: TickResult[]): void
  }
}

export interface CapabilityInfo {
  name: string
  energy: number | null
  description: string | null
}

/**
 * Parse the `energy:` and `description:` frontmatter lines of a capability
 * markdown file. Mirrors the regexes the OpenCode plugin used (energy tick
 * reads/writes `energy:` in place; the roster reads both).
 */
function readCapabilityFrontmatter(filePath: string): { energy: number | null; description: string | null } {
  let content: string
  try {
    content = fs.readFileSync(filePath, "utf8")
  } catch {
    return { energy: null, description: null }
  }
  const energyMatch = content.match(/^energy:\s*(\d+)/m)
  const descMatch = content.match(/^description:\s*(.+)/m)
  return {
    energy: energyMatch ? parseInt(energyMatch[1]!, 10) : null,
    description: descMatch ? descMatch[1]!.trim() : null,
  }
}

export class Evolution extends Service {
  static inject = ["tools", "systemPrompt", "commands", "subagents"]
  static Config = z.object({
    /**
     * Workspace root — the directory that CONTAINS `.opencode/`.
     * Phase-1/2 follow-up resolved: HIVE state is FIXED-ROOT (this config),
     * NOT per-session. A dsh profile is pinned to one workspace; per-session
     * roots would fragment hive-state.json, the capability presets dir, and
     * the energy ledger across sessions of the same workspace. Sessions
     * JOIN the profile's HIVE; they do not each grow one.
     */
    directory: z.string().default(process.cwd()),
    /**
     * Directory holding one subdirectory per capability preset (each with
     * `preset.yml` + `agent.cordis.yml`). Default: the OpenCode HIVE
     * capabilities dir — dsh presets are materialized there so the dual-run
     * keeps one roster for both worlds.
     */
    // (schemastery has no .optional() — an absent key is expressed as a
    // defaulted field; undefined preserves the default.)
    capabilitiesPath: z.string().default(""),
    /**
     * Trust recorded on presets discovered under the capabilities root.
     * `user` (locally authored, spawn-writable) is the correct default for
     * HIVE capabilities; `system` would mark the whole roster read-only to
     * dsh's authoring API.
     */
    capabilitiesTrust: z.string().default("user"),
  })

  readonly directory: string
  readonly capabilitiesPath: string

  constructor(ctx: import("@deepseek-ai/cordis").Context, config: { directory: string; capabilitiesPath?: string; capabilitiesTrust: string }) {
    super(ctx, "evolution")
    this.directory = config.directory
    this.capabilitiesPath =
      (config.capabilitiesPath ?? "") !== ""
        ? (config.capabilitiesPath as string)
        : path.join(config.directory, ".opencode/agents/capabilities")

    // ── Roster injection (spike 0.2) ────────────────────────────────────────
    // Order 50: after harness identity (-100) and deployment persona (0),
    // before tool guidance (100+). `text` is a provider evaluated per
    // assembly, so the roster always reflects the live capability set —
    // registration-order independent by construction.
    ctx.effect(() =>
      ctx.systemPrompt.section({
        name: "hive:roster",
        order: 50,
        text: () => this.buildRoster(),
      })
    )

    // ── Capability presets root ─────────────────────────────────────────────
    // The capabilities dir IS the preset root (spawn materializes a dsh
    // preset there). dsh's preset roster discovers it when the profile's
    // `agent-presets.roots` config names it (unmemoized re-scan, so a preset
    // written by /spawn is visible immediately — no reload needed); the
    // roster + spawn/dissolve here read the directory directly and work
    // whether or not a profile also mounts the root.

    // ── Continuable-child capability composition (rc.1) ─────────────────────
    // alpha.3's `registerContinuableSetup` contribution point is GONE at rc.1:
    // per-child composition is DATA on the start request (`persona` /
    // `toolFilter` on `SubagentStartRequest`), snapshotted into the child's
    // durable descriptor and applied by the continuation manager via
    // `applyChildComposition` — on creation and, from the descriptor, on cold
    // resume. The capability-facing roster therefore travels as the dispatch
    // request's `persona` (a scoped shadow of the deployment persona) — see
    // `hive_dispatch` below. There is nothing to register at service boot.

    // ── Energy tick on session-start ────────────────────────────────────────
    // `agent/session-start` is the dsh analogue of OpenCode's
    // `session.created` hook: it fires exactly once per agent publication
    // (startup, resume, clear, compact). The tick is idempotent within a day
    // (energy.ts guards on lastTick) and skips cleanly when no capability was
    // used since the last tick, so firing it per session-start is cheap.
    ctx.on("agent/session-start", () => {
      const { results, skipped } = this.tick()
      if (!skipped) {
        ctx.emit("hive/tick", results)
        ctx.logger.debug?.("[evolution] energy tick applied on agent/session-start", {
          results: results.length,
        })
      }
    })

    // ── Commands (command-summoned lifecycle tools — the WI-037 pattern) ─────
    // dsh commands are MODEL-INVISIBLE by architecture (W-048): a handler runs
    // against the receiving agent without the command ever reaching the model.
    // The HIVE lifecycle stays human-driven (the user invokes /spawn /evolve
    // /dissolve /tick), but the AGENT carries out the lifecycle through proper
    // tools — it must never hand-edit capability/energy files (the WI-036
    // failure mode the user ruled out), and it must not carry redundant
    // lifecycle tools every turn.
    //
    // The seam: a command handler installs a SCOPED tool on the receiving
    // agent's own context (`agentCtx.tools.register` — per-agent, invisible to
    // every other agent and to all other turns of this one) and then wakes the
    // model with a user message naming the summoned tool. The tool's body
    // performs the mutation AND disposes its own registration, so the tool
    // exists for exactly one turn. The handler never mutates HIVE state
    // itself; it only summons.
    ctx.effect(() => {
      const summon = (
        agent: Agent | undefined,
        command: string,
        registerTool: (agentCtx: import("@deepseek-ai/cordis").Context) => () => void,
        brief: string
      ): { kind: "success"; text: string } | { kind: "error"; text: string } => {
        if (!agent) {
          return {
            kind: "error" as const,
            text: `/${command} needs a live receiving agent (invoke it from a session composer, not a bare CLI).`,
          }
        }
        let disposer: () => void
        try {
          disposer = registerTool(agent.ctx)
        } catch (err) {
          return { kind: "error" as const, text: `/${command}: failed to summon the lifecycle tool: ${String(err)}` }
        }
        // Track the disposer so the tool body can retract itself after firing;
        // if the turn never calls it (model went another way), the tool stays
        // scoped to this one agent — it never leaks into other agents — and is
        // retracted when the agent is disposed (scoped effects unwind with it).
        this.lifecycleSummons.set(agent, [...(this.lifecycleSummons.get(agent) ?? []), disposer])
        agent.followup(
          createMessage({
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `[HIVE /${command}] ${brief}\n\n` +
                  `The scoped lifecycle tool \`hive_${command}\` for this command has been summoned into your toolset ` +
                  `FOR THIS TURN ONLY. Call \`hive_${command}\` now to carry out the command. ` +
                  `Do NOT hand-edit files under .opencode/agents/ — the tool performs the mutation.`,
              },
            ],
            source: { kind: "user" },
          })
        )
        return {
          kind: "success" as const,
          text: `/${command}: summoned the scoped lifecycle tool into the agent for this turn; the model has been asked to call it.`,
        }
      }

      const d1 = ctx.commands.register({
        name: "tick",
        description: "Run the HIVE energy tick now (decay unused, boost used capabilities) via a turn-scoped hive_tick tool.",
        handler: (inv) =>
          summon(
            inv.agent,
            "tick",
            (agentCtx) =>
              this.registerLifecycleTool(agentCtx, "hive_tick", "Run the HIVE energy tick now.", () => {
                const { results, warnings, skipped } = this.tick()
                if (skipped) return "Energy tick skipped (already ran today, or no capability usage recorded)."
                const lines = results.map(
                  (r) => `${r.wasUsed ? "▲" : "▼"} ${r.name}: ${r.oldEnergy} → ${r.newEnergy}`
                )
                if (warnings.length > 0) {
                  lines.push("", `⚠ below dissolve threshold: ${warnings.map((w) => w.name).join(", ")}`)
                }
                this.ctx.emit("hive/tick", results)
                return lines.join("\n")
              }),
            "Run the energy tick: decay capabilities unused since the last tick, boost the used ones, and report the result."
          ),
      })

      const d2 = ctx.commands.register({
        name: "spawn",
        description: "Manifest a new HIVE capability preset via a turn-scoped hive_spawn tool.",
        input: { hint: "<name> — <description>" },
        handler: (inv) => {
          const raw = inv.rawInput.trim()
          const m = raw.match(/^([a-z0-9][a-z0-9-]*)\s*[—-]\s*(.+)$/i)
          if (!m) {
            return { kind: "error" as const, text: "Usage: /spawn <name> — <description>  (lowercase, digits, dashes)" }
          }
          const [, name, description] = m as [string, string, string]
          return summon(
            inv.agent,
            "spawn",
            (agentCtx) =>
              this.registerLifecycleTool(
                agentCtx,
                "hive_spawn",
                "Manifest the requested HIVE capability preset (preset dir + energy ledger at 50).",
                () => {
                  const dir = this.spawn(name, description)
                  return `Capability \`${name}\` manifested at ${dir} (energy 50). Dispatch it with hive_dispatch (capability "${name}").`
                }
              ),
            `Manifest a new capability: name \`${name}\`, description "${description}".`
          )
        },
      })

      const d3 = ctx.commands.register({
        name: "dissolve",
        description: "Return a HIVE capability to the void (archive its preset) via a turn-scoped hive_dissolve tool.",
        input: { hint: "<name>" },
        handler: (inv) => {
          const name = inv.rawInput.trim()
          if (!name) return { kind: "error" as const, text: "Usage: /dissolve <name>" }
          return summon(
            inv.agent,
            "dissolve",
            (agentCtx) =>
              this.registerLifecycleTool(
                agentCtx,
                "hive_dissolve",
                "Dissolve the named HIVE capability (archive preset + ledger under agents/dissolved/).",
                () => {
                  this.dissolve(name)
                  return `Capability \`${name}\` dissolved → archived under agents/dissolved/. The void remembers.`
                }
              ),
            `Dissolve the capability \`${name}\`: return it to the void.`
          )
        },
      })

      const d4 = ctx.commands.register({
        name: "evolve",
        description: "Show the HIVE roster + energy and let the agent run the evolution analysis via a turn-scoped hive_evolve tool.",
        handler: (inv) =>
          summon(
            inv.agent,
            "evolve",
            (agentCtx) =>
              this.registerLifecycleTool(agentCtx, "hive_evolve", "Return the current HIVE capability roster and energy state.", () =>
                this.buildRoster()
              ),
            "Run the evolution analysis: call the summoned tool for the live roster, then report state, gaps, and any spawn/mutate/dissolve proposals."
          ),
      })

      return () => { d1(); d2(); d3(); d4() }
    })

    // ── Capability dispatch (the Phase-5 seam) ────────────────────────────────
    // The coordinator-facing dispatch tool: starts a capability as a RESIDENT,
    // continuable child of the calling agent. Dreamcatcher dispatches pass the
    // canonical read-only toolFilter (I-070: enforcement is caller-side — the
    // preset cannot self-declare it). Capability usage feeds the energy tick.
    ctx.effect(() =>
      ctx.tools.register(
        defineTool({
          name: "hive_dispatch",
          description:
            "Dispatch a HIVE capability (or the dreamcatcher) as a resident, continuable child agent. " +
            "The child runs in the background; follow up on it via the session it reports from. " +
            "Dreamcatcher dispatches are read-only by construction (mutation tools are denied at spawn).",
          parameters: {
            capability: {
              type: "string",
              required: true,
              description:
                "Capability name from the Active Capabilities roster, or 'dreamcatcher' for the dream-archive agent.",
            },
            prompt: {
              type: "string",
              required: true,
              description: "The complete task brief for the child: full scope, constraints, and acceptance criteria.",
            },
            label: {
              type: "string",
              description: "Short display label for the child session (defaults to the capability name).",
            },
          },
          execute: async (args, exec) => {
            const parent = exec.agent as Agent | undefined
            if (!parent) {
              throw new Error("hive_dispatch must be called from within an agent turn (no calling agent in scope)")
            }
            const isDreamcatcher = args.capability === "dreamcatcher"
            // rc.1 per-child composition: the capability-facing roster rides
            // the start request's `persona` field — a scoped shadow of the
            // deployment persona installed by the continuation manager via
            // `applyChildComposition`, and re-installed from the child's
            // durable descriptor on cold resume. The first line names the
            // child's own capability so its roster row is the highlighted one
            // (the SHADOW-009 resolution: the live-verifiable replacement for
            // the scoped `hive:roster` shadow `registerContinuableSetup` used
            // to inject). The text carries no `{{…}}` sequences, so the
            // persona template's strict interpolation passes it through.
            const persona = [
              isDreamcatcher
                ? "You are the dreamcatcher — the HIVE dream-archive recall agent, dispatched READ-ONLY (dream mutation tools are denied at spawn)."
                : `You are the \`${args.capability}\` HIVE capability, dispatched as a resident continuable child of the coordinator.`,
              ``,
              this.buildRoster(),
            ].join("\n")
            const start = await this.ctx.subagents.startContinuable({
              provider: "spawn",
              label: args.label ?? args.capability,
              request: {
                parent,
                prompt: [{ type: "text", text: args.prompt }] as ContentBlock[],
                persona,
                // I-070: read-only enforcement stays caller-side — passed in
                // as the request's `toolFilter`, applied as a scoped
                // tools.restrict() in the child's creation window.
                ...(isDreamcatcher
                  ? { toolFilter: { deny: [...DREAMCATCHER_READ_ONLY_TOOL_FILTER.deny] } }
                  : {}),
              },
              signal: exec.signal,
            })
            this.markUsed(args.capability, String(start.childId))
            return `Dispatched ${args.capability} as a resident continuable child (session ${String(start.childId)}).` +
              (isDreamcatcher
                ? " Read-only filter applied via the start request's toolFilter field: dream mutation tools denied."
                : "")
          },
          output: TEXT_OUT,
        })
      )
    )
  }

  /**
   * Register one command-summoned lifecycle tool on an agent's scoped context
   * and return the registration disposer. The tool retracts itself after its
   * first execution (it exists for exactly one call); it is also retracted
   * when the owning agent is disposed, so a never-called summon cannot leak
   * past the agent's lifetime.
   */
  private lifecycleSummons = new WeakMap<Agent, (() => void)[]>()

  private registerLifecycleTool(
    agentCtx: import("@deepseek-ai/cordis").Context,
    name: string,
    description: string,
    run: () => string
  ): () => void {
    let disposer: (() => void) | undefined
    disposer = agentCtx.tools.register(
      defineTool({
        name,
        description,
        parameters: {},
        execute: async () => {
          try {
            return run()
          } finally {
            // Turn-scoped: retract after the first call, success or failure.
            disposer?.()
          }
        },
        output: TEXT_OUT,
      })
    )
    return () => disposer?.()
  }

  // ── energy state ──────────────────────────────────────────────────────────

  readState = (): HiveState => readHiveState(this.directory)
  writeState = (state: HiveState): void => writeHiveState(this.directory, state)

  /** Mark a capability used (energy bookkeeping). Idempotent per (name, session). */
  markUsed = (capabilityName: string, sessionId: string): void => {
    markCapabilityUsed(this.directory, capabilityName, sessionId)
    this.ctx.emit("hive/capability-used", capabilityName, sessionId)
  }

  /** Run the energy tick. Guarded: skips if already ran today or no usage. */
  tick = (): { results: TickResult[]; warnings: TickResult[]; skipped: boolean } =>
    tickEnergy(this.directory)

  // ── capability presets ────────────────────────────────────────────────────

  /** List active capabilities (non-`_`-prefixed subdirectories with a preset). */
  listCapabilities = (): CapabilityInfo[] => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(this.capabilitiesPath, { withFileTypes: true })
    } catch {
      return []
    }
    const out: CapabilityInfo[] = []
    for (const e of entries) {
      if (e.name.startsWith("_")) continue
      // Support BOTH layouts: a dsh preset DIRECTORY (<name>/preset.yml) and
      // a legacy OpenCode capability markdown FILE (<name>.md). The markdown
      // form is what the OpenCode plugin's energy.ts manages in place; the
      // preset-directory form is what dsh spawns as a continuable child.
      if (e.isDirectory()) {
        const presetFile = path.join(this.capabilitiesPath, e.name, "preset.yml")
        if (!fs.existsSync(presetFile)) continue
        const agentFile = path.join(this.capabilitiesPath, e.name, "agent.cordis.yml")
        const { description } = readCapabilityFrontmatter(presetFile)
        // Energy lives in the capability's own file for the directory form
        // too (energy.ts manages `<name>.md` files; for preset dirs we read
        // the sibling energy from the legacy md when present, else from
        // preset.yml's own `energy:` line).
        const legacyMd = path.join(this.capabilitiesPath, `${e.name}.md`)
        const energy = fs.existsSync(legacyMd)
          ? readCapabilityFrontmatter(legacyMd).energy
          : readCapabilityFrontmatter(agentFile).energy
        out.push({ name: e.name, energy, description })
      } else if (e.isFile() && e.name.endsWith(".md")) {
        const name = e.name.replace(/\.md$/, "")
        const { energy, description } = readCapabilityFrontmatter(path.join(this.capabilitiesPath, e.name))
        out.push({ name, energy, description })
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Build the capability roster text (systemPrompt section + /evolve). */
  buildRoster = (): string => {
    const caps = this.listCapabilities()
    const lines: string[] = ["## Active Capabilities"]
    if (caps.length === 0) {
      lines.push("  (none)")
      return lines.join("\n")
    }
    for (const c of caps) {
      const energy = c.energy === null ? "?" : String(c.energy)
      lines.push(`  ${c.name} — energy: ${energy} — ${c.description ?? "(no description)"}`)
    }
    return lines.join("\n")
  }

  /**
   * Spawn a new capability preset: materialize `<capabilitiesPath>/<name>/`
   * with `preset.yml` + `agent.cordis.yml` (a dsh preset), and seed its
   * energy at 50 via the legacy `<name>.md` ledger the tick manages. The
   * preset is discoverable immediately (dsh preset discovery is unmemoized).
   */
  spawn = (name: string, description: string): string => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      throw new Error(`invalid capability name "${name}" (lowercase letters, digits, dashes only)`)
    }
    const dir = path.join(this.capabilitiesPath, name)
    if (fs.existsSync(dir) || fs.existsSync(path.join(this.capabilitiesPath, `${name}.md`))) {
      throw new Error(`capability "${name}" already exists`)
    }
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, "preset.yml"),
      [
        `name: ${name}`,
        `description: ${description}`,
        `order: 10`,
        ``,
      ].join("\n"),
      "utf8"
    )
    fs.writeFileSync(
      path.join(dir, "agent.cordis.yml"),
      [
        `# The \`${name}\` capability preset — spawned by /spawn.`,
        `# Persona + mounted tools are edited here; energy lives in the sibling`,
        `# \`${name}.md\` ledger that the tick manages.`,
        `- id: persona`,
        `  name: '@deepseek-ai/dsh-persona'`,
        `  config:`,
        `    text: |-`,
        `      You are the ${name} capability: ${description}`,
        ``,
      ].join("\n"),
      "utf8"
    )
    // Seed the energy ledger (the file energy.ts reads/writes in place).
    fs.writeFileSync(
      path.join(this.capabilitiesPath, `${name}.md`),
      [
        `---`,
        `name: ${name}`,
        `description: ${description}`,
        `energy: 50`,
        `---`,
        ``,
        `# ${name}`,
        ``,
        `${description}`,
        ``,
      ].join("\n"),
      "utf8"
    )
    return dir
  }

  /**
   * Dissolve a capability: move its preset dir + energy ledger from
   * `capabilities/` to `dissolved/` (the void). Never deletes — the void
   * remembers, and resurrection is a move back.
   */
  dissolve = (name: string): void => {
    const dir = path.join(this.capabilitiesPath, name)
    const ledger = path.join(this.capabilitiesPath, `${name}.md`)
    if (!fs.existsSync(dir) && !fs.existsSync(ledger)) {
      throw new Error(`no such capability "${name}"`)
    }
    const dissolvedDir = path.join(this.directory, ".opencode/agents/dissolved")
    fs.mkdirSync(dissolvedDir, { recursive: true })
    if (fs.existsSync(dir)) {
      fs.renameSync(dir, path.join(dissolvedDir, name))
    }
    if (fs.existsSync(ledger)) {
      fs.renameSync(ledger, path.join(dissolvedDir, `${name}.md`))
    }
  }

  /** The compaction/roster summary (verbatim energy.ts helper). */
  capabilitiesSummary = (): string | null => getCapabilitiesSummary(this.capabilitiesPath)
}

/**
 * Read-only enforcement contract for capability presets that must not mutate
 * state (the Phase-1/2 follow-up). `toolFilter` is a field on the
 * continuable-spawn REQUEST (`SubagentStartRequest.toolFilter`), snapshotted
 * into the child's durable descriptor and installed by the continuation
 * manager via `applyChildComposition` as a scoped `tools.restrict()` in the
 * child's creation window — the named tools vanish from the child's prompt
 * AND refuse to execute, on cold resume too. The PRESET cannot self-declare
 * it; the CALLER passes it at spawn.
 *
 * This is the canonical filter for the dreamcatcher preset (which mounts all
 * 9 dream tools but is read-only by persona): the 5 mutation tools are denied,
 * leaving rank/query/list/detect_duplicates + the fs read tools. The Phase-5
 * capability-dispatch seam applies this when it spawns a dreamcatcher child.
 */
export const DREAMCATCHER_READ_ONLY_TOOL_FILTER = {
  deny: [
    "hive_dream_residue",
    "hive_dream_harvest",
    "hive_dream_artifact_create",
    "hive_dream_supersede",
    "hive_dream_mark_stale",
    "hive_dream_begin",
    "hive_dream_complete",
  ],
} as const

export default Evolution

// dsh loader contract: the loader applies the DEFAULT export only (W-045) —
// inject rides on the class as `static inject` above. Named re-exports below
// are for consumers/tests, never read by the loader.
export { readHiveState, writeHiveState, markCapabilityUsed, tickEnergy, getCapabilitiesSummary }
export type { HiveState, TickResult }
