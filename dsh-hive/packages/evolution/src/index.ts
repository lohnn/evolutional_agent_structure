/**
 * @hive/dsh-evolution — the HIVE evolution lifecycle as a dsh Service.
 *
 * Exposes `ctx.evolution`:
 *  - Energy state (`lib/energy.ts` — a VERBATIM port of the OpenCode plugin's
 *    `src/lib/energy.ts`) and the tick, fired on dsh's `agent/created` event
 *    (payload `{ agent, source: SessionStartSource, signal }` — the serial
 *    analogue of OpenCode's `session.created` hook; it fires once per agent
 *    publication: startup, resume, clear, compact). Originally wired to the
 *    invented `agent/session-start`, which no dsh runtime publishes — a live
 *    regression (the once-per-day tick sat dead for days) that the tests
 *    never caught because they emitted the phantom event themselves. Guarded
 *    now by `test/event-catalog-guard.test.mjs`.
 *  - Roster state + injection via `ctx.systemPrompt.section` at order 50
 *    (spike 0.2: ordering is numeric + total, registration-order independent;
 *    dynamic `text` is evaluated per assembly, so the roster is always fresh).
 *  - Capability presets: dsh agent presets under `capabilitiesPath`
 *    (default `<directory>/.opencode/agents/capabilities` — the OLD location,
 *    kept byte-compatible for dual-run). A dsh `PresetRoot` is registered so
 *    `capability/<name>` presets are discoverable by dsh's preset roster AND
 *    spawnable via `ctx.subagents.startContinuable`. Capabilities are
 *    resident, continuable children (spike 0.3) — not one-shot subagents.
 *  - `/spawn` `/evolve` `/dissolve` `/tick` `/status` `/awaken` as dsh commands.
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
import { defineTool, type ParameterSchemaSpec } from "@deepseek-ai/dsh-tools"
import type { Agent } from "@deepseek-ai/dsh-agent"
import { COORDINATOR_DOCTRINE, DORMANT_NOTICE, AWAKEN_BRIEF, REAWAKEN_BRIEF, CAPABILITY_STANDING } from "./assets.js"
import { recordAwakened, isAwakened, decideGate } from "./lib/sessions.js"
import { autoRegister } from "@hive/dsh-board/lib/board-transitions"
import { parseCapabilityPersona, renderAgentCordisYml, type CapabilityPersona } from "./lib/persona.js"
import { resolveCapabilityMaterial } from "./lib/material.js"
import {
  composeEcosystemSnapshot,
  composePostCompactionContext,
  POST_COMPACTION_DREAM_LIMIT,
  type EcosystemSnapshotSource,
  type PreCompactionDreamPointer,
} from "./lib/snapshot.js"

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
// The full plugin-side Recall/Audit persona. Canon lives in
// @hive/dsh-agents (presets/dreamcatcher/persona.md — the dsh preset's
// mounted text); THIS package ships a drift-guarded copy of the same file
// (`presets/dreamcatcher/persona.md`) and reads it at module load, so a
// dispatched dreamcatcher is self-contained even when the cohort is
// installed as isolated git-path packages — a cross-package import here
// could not survive that pathway's nested `tsc` prepare (live failure on
// 2026-09-15: TS2307 during `dsh plugin update`). The dispatch contract
// test asserts byte-identity between all three copies.
export const DREAMCATCHER_DISPATCH_PERSONA = fs
  .readFileSync(new URL("../presets/dreamcatcher/persona.md", import.meta.url), "utf8")
  .trimEnd()

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
     * The energy tick ran (on `agent/created` or `/tick`).
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

/**
 * Every HIVE-family tool the monorepo registers globally, by package:
 * - @hive/dsh-tools: the 11 hive_dream_* tools (dream archive lifecycle + read/triage),
 * - @hive/dsh-hivemind: hive_signal / hive_listen / hive_sent / hive_retire,
 * - @hive/dsh-painpoints: hive_note_painpoint / hive_painpoints_list /
 *   hive_painpoints_harvest,
 * - @hive/dsh-board: hive_board_list / hive_board_search / hive_board_read /
 *   hive_board_bind / hive_board_create / hive_board_respec /
 *   hive_board_retitle / hive_board_tag (B4; D9/H1: hive_board_start does
 *   NOT exist on dsh and is deliberately absent from this census),
 * - this package: hive_dispatch.
 *
 * This is the awaken gate's deny mask (T2/D2): a dormant top-level agent has
 * these tools REMOVED from visibility AND execution while the session is
 * un-awakened — the tools read as absent, not denied. KEEP IN SYNC with the
 * defineTool registrations across the monorepo: a new hive_* tool MUST be
 * added here in the same commit it ships, or it leaks past the gate.
 * Guarded by `test/tool-gate-sync.test.mjs`, which re-derives the set from
 * every package's src and asserts equality — a forgotten entry fails the
 * suite, not a user's security model.
 *
 * NOTE (T2 count check, updated B4): the migration brief expected 18 names;
 * the source census was 19 after the dream package registered 11 hive_dream_*
 * tools (not the 9 the brief assumed), and is 27 now that @hive/dsh-board's
 * 8 tools joined. Derived-from-source wins; the guard test keeps the census
 * honest from here on.
 */
export const HIVE_TOOL_NAMES = [
  // ── @hive/dsh-tools (dream archive) ──────────────────────────────────────
  "hive_dream_artifact_create",
  "hive_dream_begin",
  "hive_dream_complete",
  "hive_dream_detect_duplicates",
  "hive_dream_harvest",
  "hive_dream_list",
  "hive_dream_mark_stale",
  "hive_dream_query",
  "hive_dream_rank",
  "hive_dream_residue",
  "hive_dream_supersede",
  // ── @hive/dsh-hivemind ───────────────────────────────────────────────────
  "hive_signal",
  "hive_listen",
  "hive_sent",
  "hive_retire",
  // ── @hive/dsh-painpoints ─────────────────────────────────────────────────
  "hive_note_painpoint",
  "hive_painpoints_list",
  "hive_painpoints_harvest",
  // ── @hive/dsh-board (B4) ─────────────────────────────────────────────────
  "hive_board_list",
  "hive_board_search",
  "hive_board_read",
  "hive_board_bind",
  "hive_board_create",
  "hive_board_respec",
  "hive_board_retitle",
  "hive_board_tag",
  // ── this package ─────────────────────────────────────────────────────────
  "hive_dispatch",
] as const

/**
 * Parameter schema for the turn-scoped `hive_awaken_spawn` batch tool. The
 * optional `persona` object is verified by `parseCapabilityPersona` at execute
 * time (whose error text is model-actionable); the schema keeps the shape
 * visible to the model without hard-coding the enables+triggers rule twice.
 */
const AWAKEN_SPAWN_PARAMETERS: ParameterSchemaSpec = {
  capabilities: {
    type: "array",
    required: true,
    description: "The capability manifests to create, in spawn order.",
    items: {
      type: "object",
      additionalProperties: false,
      description: "One capability manifest.",
      properties: {
        name: {
          type: "string",
          description: "Capability name — lowercase letters, digits, dashes (e.g. 'email-brain-ml').",
        },
        description: {
          type: "string",
          description: "One-line description of what the capability owns and when it activates.",
        },
        persona: {
          type: "object",
          additionalProperties: false,
          description:
            "The capability's structured method body (the capability template). Recommended; " +
            "enables and triggers are REQUIRED when a persona is given; empty sections are dropped.",
          properties: {
            enables: { type: "string", description: "What This Enables — the use-vs-spawn discriminator." },
            triggers: { type: "string", description: "Activation Triggers — when to reach for this capability." },
            protocol: { type: "string", description: "Operating Protocol — how the capability works, step by step." },
            selfModification: { type: "string", description: "Self-Modification Protocol — how it may evolve itself." },
            boundaries: { type: "string", description: "Boundaries — what it must NOT do." },
            history: { type: "string", description: "Evolution History — spawn provenance and remembered dreams." },
          },
        },
      },
    },
  },
}

/**
 * /spawn's summoned-tool parameters (T4): the command input already carries
 * name + description, so the model authors the METHOD as the optional
 * persona object (same section contract as the /awaken batch tool — one
 * shape, one validator: parseCapabilityPersona).
 */
const SPAWN_PARAMETERS: ParameterSchemaSpec = {
  persona: {
    type: "object",
    additionalProperties: false,
    description:
      "The capability's structured method body (the capability template). Recommended; " +
      "enables and triggers are REQUIRED when a persona is given; empty sections are dropped.",
    properties: {
      enables: { type: "string", description: "What This Enables — the use-vs-spawn discriminator." },
      triggers: { type: "string", description: "Activation Triggers — when to reach for this capability." },
      protocol: { type: "string", description: "Operating Protocol — how the capability works, step by step." },
      selfModification: { type: "string", description: "Self-Modification Protocol — how it may evolve itself." },
      boundaries: { type: "string", description: "Boundaries — what it must NOT do." },
      history: { type: "string", description: "Evolution History — spawn provenance and remembered dreams." },
    },
  },
}

/**
 * Fill the awaken/re-awaken briefs' template placeholders. Exactly two names
 * are legal in the shipped assets (drift-guarded); anything else surfacing as
 * a literal `{{ ... }}` in a followup means an asset/handler placeholder
 * mismatch and the brief drift test fails first.
 */
export function fillBrief(template: string, vars: { dossier: string; summonName: string }): string {
  return template
    .replaceAll("{{ dossier }}", vars.dossier)
    .replaceAll("{{ summon_name }}", vars.summonName)
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
    // `toolFilter` / `agentOptions` on `SubagentStartRequest`), snapshotted
    // into the child's durable descriptor and applied by the continuation
    // manager via `applyChildComposition` — on creation and on cold resume.
    // The child-identity line rides the request's `persona` (see
    // `composeDispatchPersona`); the capability roster itself travels ONLY
    // via the process-level `hive:roster` systemPrompt section above, which
    // dsh composes into every in-process agent (dispatched children
    // included) with live re-evaluation per assembly. There is nothing to
    // register at service boot.

    // ── Energy tick on agent/created ────────────────────────────────────────
    // `agent/created` is the dsh analogue of OpenCode's `session.created`
    // hook: a serial event with payload `{ agent, source, signal }` (source
    // is the SessionStartSource — startup, resume, clear, compact), fired
    // exactly once per agent publication. The tick is idempotent within a day
    // (energy.ts guards on lastTick) and skips cleanly when no capability was
    // used since the last tick, so firing it per publication is cheap.
    // Found as a LIVE REGRESSION: this was bound to `agent/session-start`,
    // an event the dsh runtime (0.1.6-alpha.1) does not publish — the
    // once-per-day tick sat dead (hive-state.json's lastTick frozen for 5+
    // days) and the tests never caught it because they emitted the phantom
    // event name themselves. Guarded by test/event-catalog-guard.test.mjs.
    ctx.on("agent/created", () => {
      const { results, skipped } = this.tick()
      if (!skipped) {
        ctx.emit("hive/tick", results)
        ctx.logger.debug?.("[evolution] energy tick applied on agent/created", {
          results: results.length,
        })
      }
    })

    // ── Awaken gate (T2 / D1–D2) ─────────────────────────────────────────────
    // SECOND `agent/created` listener (the tick above is the first; serial
    // listeners coexist in registration order, and this one never touches the
    // tick's data). Per D1 a session is aware-but-dormant until /awaken flips
    // it; per D2 the hive tools then read as ABSENT, not denied: a scoped
    // `tools.restrict` makes every hive_* tool vanish from that agent's prompt
    // AND refuse execution, while the dormant explainer keeps the model aware
    // that HIVE exists here and that asking the user to run /awaken is the one
    // scripted move.
    //
    // Child exemption (why `decideGate` skips depth > 0): a delegated child
    // may be a HIVE dispatch worker whose coordinator persona drives dispatch
    // and hive tools directly, or a one-shot `builtin/dreamcatcher` consult
    // that REQUIRES the hive_dream_* tools (its whole Recall/Audit method is
    // plugin-side). Children participate by lineage, never gated. This
    // intentionally still denies harness-native subagents whose
    // delegationDepth is 0 — a depth-0 agent is indistinguishable from a user
    // session, and denial is the honest default for the dormant world.
    //
    // Both maps are keyed by SESSION id (not the Agent object): /awaken's
    // command handler holds the receiving agent and needs to lift exactly the
    // restriction + explainer held for that session, across a resume where the
    // Agent object identity is new. The disposers are scoped registrations, so
    // a disposed agent unwinds them anyway; agent/disposed cleanup exists so
    // the Map itself never grows with dead sessions.
    ctx.on("agent/created", (payload) => {
      const agent = payload.agent
      // Access path verified against dsh 0.1.6-alpha.1 types: the Agent
      // runtime face exposes `session: Session` (dsh-agent runtime-types),
      // `Session.header: SessionHeader` is always present (dsh-session), and
      // `delegationDepth` is persisted on the header (absent/0 top-level,
      // parent+1 for children). The `?.` chains are stub-defensive only —
      // fakes in the service harness may omit pieces the real runtime face
      // always carries; production never hits undefined here.
      const sessionId = String(agent.session?.id ?? agent.id)
      const depth = agent.session?.header?.delegationDepth
      // The compaction seam reads `source` (the SessionStartSource —
      // 'startup' | 'resume' | 'clear' | 'compact'): present and typed in the
      // LIVE runtime (0.1.6-alpha.1 declares the payload
      // `{ agent, source, signal }`), ABSENT from this package's pinned type
      // corridor (0.1.2-rc.1 declares `{ agent }` only) — so the read stays a
      // structural access with `?`, not a typed field. Drop the cast when the
      // pin bumps to a corridor that declares it; until then undefined simply
      // means "not a compaction republication" and the seam stays quiet.
      const source = (payload as { source?: string }).source
      switch (decideGate(depth, isAwakened(this.directory, sessionId))) {
        case "skip":
          // Exempt child (depth > 0) — participants by lineage. No section, no
          // restriction, no state. (D1: dormant sessions leave no state.)
          return
        case "doctrine": {
          // Awakened coordinator: scoped standing section at 55 — after the
          // process-wide hive:roster (50), before tool guidance (100+).
          agent.ctx?.systemPrompt?.section({
            name: "hive:doctrine",
            order: 55,
            text: () => COORDINATOR_DOCTRINE,
          })
          // ── Compaction seam (T6) ────────────────────────────────────────────
          // dsh publishes no standalone compaction event; a session that was
          // just summarized RE-PUBLISHES through this same event with
          // `source: "compact"`. When that happens to an AWAKENED top-level
          // coordinator — gate decision "doctrine", the only session kind
          // that owns pre-compaction HIVE state (dreams, board work items) —
          // register a second scoped section with the re-anchor block above
          // doctrine-adjacent guidance (56). Register-and-forget, same scoped
          // lifecycle as the dormant section: it belongs to this agent
          // instance and unwinds with it. One-shot by construction — the next
          // resume publishes source "resume", never "compact", so the fresh
          // scoped world re-anchors exactly once; no Map, no lift: /awaken
          // has nothing to lift from an awakened session and a double
          // registration only names-collides if the runtime ever
          // double-publishes compact for one scope, which it does not.
          if (source === "compact") {
            agent.ctx?.systemPrompt?.section({
              name: "hive:post-compaction",
              order: 56,
              text: () => this.postCompactionContext(),
            })
          }
          return
        }
        case "deny": {
          // Dormant top-level agent: hive tools vanish (restrict returns the
          // exact disposer that lifts the restriction) + the dormant
          // explainer at 51, just below the roster. Held for /awaken to lift.
          // deny-mask filtering: tools.restrict() VALIDATES its names against
          // the process's registered globals and THROWS on unknowns — and a
          // throw inside this serial listener fails agent publication. The
          // deny mask is therefore filtered to what THIS process registered:
          // the full cohort (production) restricts all of it; a
          // standalone-evolution install (some other profile shape) degrades
          // to masking only the tools that exist. tool-gate-sync.test.mjs
          // pins the mask to the cohort surface so this filter is a safety
          // net, not a whitelist license.
          const deny = HIVE_TOOL_NAMES.filter((name) => {
            try {
              return ctx.tools.get(name) !== undefined
            } catch {
              return false
            }
          })
          if (deny.length > 0) {
            const lift = agent.ctx?.tools?.restrict({ deny })
            if (lift) this.gateRestrictions.set(sessionId, lift)
          }
          const dropDormant = agent.ctx?.systemPrompt?.section({
            name: "hive:dormant",
            order: 51,
            text: () => DORMANT_NOTICE,
          })
          if (dropDormant) this.dormantSections.set(sessionId, dropDormant)
          return
        }
      }
    })

    // Best-effort disposer cleanup: a disposed agent's scoped world already
    // unwound its registrations, so the only real job is dropping the held
    // references. Calling the lift either way is harmless (idempotent) per the
    // disposer contract, but nested under try/catch in case a future runtime
    // rejects a disposer on an already-unwound scope.
    ctx.on("agent/disposed", (payload) => {
      const sessionId = String(payload.agent?.session?.id ?? payload.agent?.id ?? "")
      if (!sessionId) return
      for (const map of [this.gateRestrictions, this.dormantSections]) {
        const disposer = map.get(sessionId)
        if (disposer === undefined) continue
        try {
          disposer()
        } catch {
          // already unwound with the agent's scoped world
        }
        map.delete(sessionId)
      }
    })

    // ── Commands (command-summoned lifecycle tools — the WI-037 pattern) ─────
    // dsh commands are MODEL-INVISIBLE by architecture (W-048): a handler runs
    // against the receiving agent without the command ever reaching the model.
    // The HIVE lifecycle stays human-driven (the user invokes /spawn /evolve
    // /dissolve /tick /status; /awaken is the opt-in there of), but the AGENT
    // carries out the lifecycle through proper tools — it must never
    // hand-edit capability/energy files (the WI-036 failure mode the user
    // ruled out), and it must not carry redundant lifecycle tools every turn.
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
        // Unfired summons need no ledger: the tool was registered on the
        // receiving agent's OWN ctx, so it never leaks to other agents and is
        // retracted with its scope when the agent is disposed. (The audit's
        // dead-WeakMap finding: tracking existed but nothing ever read it.)
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

      // ── Lifecycle-command gate (D2) ─────────────────────────────────────────
      // The four lifecycle commands are the working surface of an AWAKENED
      // coordinator. In a dormant session they would work half-gated: state
      // the session cannot see or route (spawned presets, roster edits) with
      // no coordinator doctrine behind it. /awaken is deliberately exempt —
      // it IS the gate opener. No live receiving agent falls through to
      // summon()'s own refusal, preserving the summon-contract error shape.
      // A dormant session gets the scripted move: the user runs /awaken.
      // Depth guard (adjudication from the plan-vs-code audit): a
      // delegationDepth>0 child is a LINEAGE PARTICIPANT (D2), never a
      // coordinator — refusing it as "dormant" would be a lie and letting
      // it through would mutate a roster it will never join (the gate skips
      // depth>0 by design, so a child-flipped registry entry is incoherent
      // state). /awaken carries the same guard: a child cannot self-awaken.
      const requireAwake = (
        inv: { agent?: { session?: { id?: unknown; header?: { delegationDepth?: unknown } } | unknown; id?: unknown } | undefined }
      ): { kind: "error"; text: string } | undefined => {
        const agent = inv.agent as { session?: { id?: unknown; header?: { delegationDepth?: unknown } }; id?: unknown } | undefined
        if (agent) {
          const depth = agent.session?.header?.delegationDepth
          if (typeof depth === "number" && depth > 0) {
            return {
              kind: "error" as const,
              text:
                `HIVE commands belong to top-level sessions — this is a dispatched child (lineage ` +
                `participant, D2): it works the task it was handed and routes coordination through its ` +
                `parent. Run this in a top-level session instead.`,
            }
          }
        }
        const sessionId = agent ? String(agent.session?.id ?? agent.id ?? "") : ""
        if (!sessionId) return undefined
        if (isAwakened(this.directory, sessionId)) return undefined
        return {
          kind: "error" as const,
          text:
            `HIVE is dormant in this session — the coordination surface needs /awaken first ` +
            `(the user runs it; the flip loads the coordinator doctrine and the full toolkit). ` +
            `This command was refused rather than left half-gated (D2).`,
        }
      }

      const d1 = ctx.commands.register({
        name: "tick",
        description: "Run the HIVE energy tick now (decay unused, boost used capabilities) via a turn-scoped hive_tick tool.",
        handler: (inv) => {
          const gate = requireAwake(inv)
          if (gate) return gate
          return summon(
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
          )
        },
      })

      const d2 = ctx.commands.register({
        name: "spawn",
        description: "Manifest a new HIVE capability preset via a turn-scoped hive_spawn tool.",
        input: { hint: "<name> — <description>" },
        handler: (inv) => {
          const gate = requireAwake(inv)
          if (gate) return gate
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
                "Manifest the requested HIVE capability preset (preset dir + energy ledger at 50). " +
                  "Pass a structured `persona` carrying the method the capability will live by — " +
                  "What This Enables / Activation Triggers / Operating Protocol / Self-Modification Protocol / " +
                  "Boundaries / Evolution History (the OpenCode capability template; enables + triggers are " +
                  "REQUIRED when a persona is given, empty sections are dropped). A quick spawn WITHOUT a " +
                  "persona stays valid, but it leaves the coordinator nothing to read for its use-vs-spawn " +
                  "decision — the method IS the capability.",
                (args) => {
                  const persona = parseCapabilityPersona(((args ?? {}) as { persona?: unknown }).persona)
                  const dir = this.spawn(name, description, persona)
                  return `Capability \`${name}\` manifested at ${dir} (energy 50). Dispatch it with hive_dispatch (capability "${name}").`
                },
                SPAWN_PARAMETERS
              ),
            `Manifest a new capability: name \`${name}\`, description "${description}". ` +
              `Author its persona first (the method sections above), then call the summoned tool ONCE with the persona ` +
              `object. Omitting the persona is allowed only for a deliberate quick spawn.`
          )
        },
      })

      const d3 = ctx.commands.register({
        name: "dissolve",
        description: "Return a HIVE capability to the void (archive its preset) via a turn-scoped hive_dissolve tool.",
        input: { hint: "<name>" },
        handler: (inv) => {
          const gate = requireAwake(inv)
          if (gate) return gate
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
        handler: (inv) => {
          const gate = requireAwake(inv)
          if (gate) return gate
          return summon(
            inv.agent,
            "evolve",
            (agentCtx) =>
              this.registerLifecycleTool(agentCtx, "hive_evolve", "Return the current HIVE capability roster and energy state.", () =>
                this.buildRoster()
              ),
            "Run the evolution analysis: call the summoned tool for the live roster, then report state, gaps, and any spawn/mutate/dissolve proposals."
          )
        },
      })

      // ── /awaken (T2 / D1) ─────────────────────────────────────────────────
      // The activation flip. dsh commands are user-invoked and MODEL-INVISIBLE
      // (W-048), so /awaken is the only allowed chokepoint: the handler owns
      // ALL post-flip plumbing (D1) — registry write, restriction + dormant-
      // explainer lift, scoped doctrine registration, board stub, dossier,
      // the turn-scoped batch summon, and the brief. It never touches
      // capability/energy files itself (WI-036/037: the summoned tool is the
      // only mutation path).
      //
      // Section-collision note (why a SECOND disposer Map exists): the dormant
      // explainer was registered in the agent's SCOPED world at created time
      // and stays until the agent disposes. Scoped sections shadow by name and
      // ours differ, so registering doctrine WITHOUT dropping `hive:dormant`
      // would render BOTH. The handler therefore lifts the dormant section and
      // the tool restriction together, then registers doctrine in the same
      // scoped world. On cold resume agent/created re-fires into a fresh
      // scoped world and the gate re-applies the correct single section from
      // the registry — no extra mechanism.
      const d5 = ctx.commands.register({
        name: "awaken",
        description: "Awaken this session as the HIVE coordinator (registry flip, doctrine, summon the turn-scoped hive_awaken_spawn tool).",
        input: { hint: "[context — what you are working on; a hint for the awakening dossier]" },
        // async: the B5 board seam awaits autoRegister; the command runtime
        // awaits the handler either way (B5 harness drives it with await).
        handler: async (inv) => {
          if (!inv.agent) {
            return {
              kind: "error" as const,
              text: `/awaken needs a live receiving agent (invoke it from a session composer, not a bare CLI).`,
            }
          }
          const agent = inv.agent
          const raw = inv.rawInput.trim()
          // Depth guard (see requireAwake's adjudication note): a dispatched
          // child cannot self-awaken — the gate would skip its registry entry
          // forever, leaving coherent-looking but dead state.
          {
            const depth = agent.session?.header?.delegationDepth
            if (typeof depth === "number" && depth > 0) {
              return {
                kind: "error" as const,
                text:
                  `/awaken belongs to top-level sessions — this is a dispatched child (lineage ` +
                  `participant, D2). It was awakened BY its dispatch, not by a command; route ` +
                  `coordination through the parent session.`,
              }
            }
          }
          // Same stub-defensive session read as the gate (runtime face always
          // carries `session.id`; fakes must provide it).
          const sessionId = String(agent.session?.id ?? agent.id)
          if (!sessionId) {
            return { kind: "error" as const, text: "/awaken: the receiving agent has no resolvable session id." }
          }

          // ── RE-AWAKEN branch (D1: one-time flip; re-running = analysis) ──
          if (isAwakened(this.directory, sessionId)) {
            const dossier = `${composeEcosystemSnapshot(this.snapshotSource())}\n\n### Awaken input\n\n  ${raw || "(none)"}`
            let disposer: () => void
            try {
              // The EXISTING per-turn roster tool, re-summoned for this turn.
              disposer = this.registerLifecycleTool(
                agent.ctx,
                "hive_evolve",
                "Return the current HIVE capability roster and energy state.",
                () => this.buildRoster()
              )
            } catch (err) {
              return { kind: "error" as const, text: `/awaken: failed to summon the analysis tool: ${String(err)}` }
            }
            const brief = fillBrief(REAWAKEN_BRIEF, { dossier, summonName: "hive_evolve" })
            agent.followup(
              createMessage({
                role: "user",
                content: [{ type: "text", text: brief }],
                source: { kind: "user" },
              })
            )
            return {
              kind: "success" as const,
              text: "/awaken: already awakened — no state change. The re-awakening analysis (evolution-style gap analysis) has been handed to the agent with a turn-scoped hive_evolve tool.",
            }
          }

          // ── FULL FLIP (order fixed by the migration plan) ─────────────────
          // (1) The registry write — the single durable fact of the flip.
          //     Everything scoped below re-applies from this on cold resume.
          const coordinatorName = String((agent.session as { header?: { agentPreset?: string } } | undefined)?.header?.agentPreset ?? "unknown")
          recordAwakened(this.directory, sessionId, coordinatorName, raw)
          // (2) Lift this session's held gate disposers: the tool restriction
          //     AND the dormant explainer section (see the collision note).
          for (const map of [this.gateRestrictions, this.dormantSections]) {
            const disposer = map.get(sessionId)
            if (disposer !== undefined) {
              try {
                disposer()
              } catch {
                // scoped world already unwound it
              }
              map.delete(sessionId)
            }
          }
          // (3) Doctrine NOW, in this agent's scoped world — the very next
          //     assembly carries it. Not re-registered per turn (the scoped
          //     section persists; a duplicate registration would throw).
          agent.ctx?.systemPrompt?.section({
            name: "hive:doctrine",
            order: 55,
            text: () => COORDINATOR_DOCTRINE,
          })
          // (4) Board auto-register — the EXACT junction where the OpenCode
          //     plugin called autoRegister() for the new coordinator
          //     (src/tools.ts hive_awaken handler, step 4 of the flip).
          //     D4: group_id := self (the session's id). Title = the raw
          //     /awaken input trimmed, else `Session <id>` — the original's
          //     "un-needed → Session <id>" fallback, unchanged. Belt-and-
          //     braces top-level guard mirrors the handler's own child refusal
          //     (the original gated on !parentID && !isCapabilitySession).
          //     The flip NEVER fails on board trouble: any throw is warn-
          //     logged and becomes a non-fatal note in BOTH outcome surfaces
          //     (the brief — the only model-visible channel, W-048 — and this
          //     command's returned text, the user GUI feedback that replaced
          //     the original tool-return boardNote).
          let boardNote = ""
          {
            const depthHere = (agent.session as { header?: { delegationDepth?: unknown } } | undefined)?.header?.delegationDepth
            if (typeof depthHere === "number" && depthHere > 0) {
              boardNote = "Board: skipped — delegated sessions cannot own work items (D5); ownership belongs to the top-level coordinator."
            } else {
              try {
                const title = raw.trim() ? raw.trim() : `Session ${sessionId}`
                const reg = await autoRegister(this.directory, sessionId, sessionId, title)
                if (reg.action === "registered") {
                  boardNote = `Board: registered work item ${reg.item.id} — "${reg.item.title}" (session-first; this session owns it; hive_board_list shows it).`
                } else {
                  // W-049: name the outcome so the model can act on it.
                  boardNote = `Board: no new work item — outcome ${reg.action}${reg.item?.id ? ` (existing item ${reg.item.id})` : ""}.`
                }
              } catch (err) {
                this.ctx.logger.warn?.("[board] awaken auto-register failed", { error: String(err), sessionId })
                boardNote =
                  "Board: auto-register could not run for this awaken (board subsystem reported an error; the flip itself is unaffected — " +
                  "check the board root, or file later with hive_board_create)."
              }
            }
          }
          // (5) The dossier: ecosystem snapshot + the raw /awaken input + the
          //     board outcome — the board note rides the dossier block so it
          //     reaches the model through the ONLY model-visible channel
          //     (W-048); fillBrief's own placeholders are untouched.
          const dossier = `${composeEcosystemSnapshot(this.snapshotSource())}\n\n### Awaken input\n\n  ${raw || "(none)"}\n\n### Board\n\n  ${boardNote || "(no board outcome)"}`
          // (6) Summon the turn-scoped batch tool (self-retracts after the
          //     first call, like every lifecycle summon).
          let spawnDisposer: () => void
          try {
            spawnDisposer = this.registerLifecycleTool(
              agent.ctx,
              "hive_awaken_spawn",
              "Manifest the approved HIVE capabilities from this awakening." +
                " Pass the full approved list in ONE call: each entry becomes a capability preset" +
                " (name, description, and — recommended — a structured persona: What This Enables /" +
                " Activation Triggers / Operating Protocol / Self-Modification Protocol / Boundaries /" +
                " Evolution History). `enables` and `triggers` are required when a persona is given." +
                " The tool reports one line per manifest and retracts itself after this single call.",
              (args) => this.spawnBatch(args),
              AWAKEN_SPAWN_PARAMETERS
            )
          } catch (err) {
            return { kind: "error" as const, text: `/awaken: failed to summon the batch spawn tool: ${String(err)}` }
          }
          // (7) The awaken brief — user-role followup with dossier + summon
          //     name filled in. The dream-recall mandate lives in the asset.
          const brief = fillBrief(AWAKEN_BRIEF, { dossier, summonName: "hive_awaken_spawn" })
          agent.followup(
            createMessage({
              role: "user",
              content: [{ type: "text", text: brief }],
              source: { kind: "user" },
            })
          )
          return {
            kind: "success" as const,
            text: `/awaken: HIVE awakened for session ${sessionId}. Registry recorded, hive tools lifted, coordinator doctrine registered, turn-scoped hive_awaken_spawn summoned — the awaken brief has been handed to the agent. ${boardNote}`,
          }
        },
      })

      // ── /status (T6 / D8 item 2) ─────────────────────────────────────────
      // The coordinator's VIEW command — the only textual energy view after
      // the D5 decision retired hand-drawn state displays in favor of future
      // panels. Read-only: it summons the same turn-scoped pattern as the
      // mutating lifecycle commands (WI-037), but its tool performs no
      // mutation at all — it returns composeEcosystemSnapshot output, the
      // EXACT composer /awaken's dossier and the re-awaken analysis read (one
      // snapshot shape, three consumers — a status view that drifted from the
      // dossier would promise a roster the flip then contradicts).
      const d6 = ctx.commands.register({
        name: "status",
        description: "View the HIVE ecosystem — roster with energies, the void (dissolved), and the last tick — via a turn-scoped read-only hive_status tool.",
        handler: (inv) => {
          const gate = requireAwake(inv)
          if (gate) return gate
          return summon(
            inv.agent,
            "status",
            (agentCtx) =>
              this.registerLifecycleTool(
                agentCtx,
                "hive_status",
                "Return the HIVE ecosystem dossier — the active roster with energies, the void (dissolved capabilities), and the last tick. Read-only: it changes nothing.",
                () => composeEcosystemSnapshot(this.snapshotSource())
              ),
            "Show the HIVE ecosystem state: call hive_status, then relay the roster, the void, and the last tick. Add one-line observations if any are obvious (decay watchdogs, empty roster) — no invented data."
          )
        },
      })

      return () => { d1(); d2(); d3(); d4(); d5(); d6() }
    })

    // ── Capability dispatch (the Phase-5 seam) ────────────────────────────────
    // The coordinator-facing dispatch tool: ONE tool, TWO address forms
    // (capability/<name> for workspace workers, builtin/<id> for plugin-owned
    // agents), TWO shapes (resident background child = the worker shape;
    // one-shot = synchronous consult returning the output inline), ONE
    // always-starts-new rule (continuation of an existing child goes through
    // send_message to its durable id — the echo text and the tool docs teach
    // this). Dreamcatcher dispatches are read-only by construction (I-070
    // caller-side toolFilter) and carry their full method plugin-side. For
    // capability dispatches the METHOD (T5/D7 persona-carried transport) and
    // the standing context travel in the child's persona, composed by
    // composeDispatchPersona from resolveCapabilityMaterial — the prompt is
    // the task brief only.
    // Optional `model` rides SubagentStartRequest.agentOptions (the spawn
    // provider advertises agentOptions: true; resolveChildAgentOptions merges
    // the override over the parent's route, dropping the parent's
    // reasoningEffort when the route changes and the caller didn't pin one).
    // Capability usage feeds the energy tick for both shapes.
    ctx.effect(() =>
      ctx.tools.register(
        defineTool({
          name: "hive_dispatch",
          description:
            "Dispatch a HIVE worker as a child agent. Address forms: 'capability/<name>' (workspace capability from the roster), 'builtin/<id>' (plugin-owned agent — currently only builtin/dreamcatcher), or bare '<name>' (= capability/<name>).\n" +
            "ALWAYS starts a NEW instance. To CONTINUE ongoing work on an existing child, do NOT re-dispatch: send_message its durable session id (from the dispatch result, or list_agents for live instances — every child label carries its dispatch address as a prefix). New parallel work on the same capability = dispatch again.\n" +
            "Default shape 'resident': background child — you receive its session id, its report arrives as a message, `send_message` can steer it, and it survives restarts. Shape 'one-shot': synchronous consult — the call blocks until the child finishes and its final output is returned directly as this tool's result (no resident session, nothing to steer). Rule: one-shot only for short, self-contained, result-shaped consults (dreamcatcher Recall); everything else stays resident.\n" +
            "The capability's own method (what-this-enables / triggers / protocol / boundaries) plus the HIVE standing context are composed into the child automatically — write the TASK brief only (intent over implementation); do not re-teach the capability its own job.\n" +
            "builtin/dreamcatcher is read-only by construction (mutation tools denied at spawn) and carries its full Recall/Audit method on the plugin side — the prompt need only state the job (its mode and scope), not the method.",
          parameters: {
            capability: {
              type: "string",
              required: true,
              description:
                "Dispatch address: 'capability/<name>' for a workspace capability (the roster), 'builtin/<id>' for a plugin-owned agent (currently only 'builtin/dreamcatcher'), or bare '<name>' as compat for 'capability/<name>'.",
            },
            prompt: {
              type: "string",
              required: true,
              description:
                "The task for the child. For builtin/dreamcatcher, state mode and scope (e.g. 'Mode: Recall — what the archive knows about X' or 'Mode: Audit') — " +
                "the recall/audit method itself comes with the child. For capabilities, the complete task brief: full scope, constraints, and acceptance criteria.",
            },
            shape: {
              type: "string",
              description:
                "'resident' (default) — background child; its report arrives as a message and send_message can steer it later. " +
                "'one-shot' — synchronous consult; the result returns inline as this tool's output. " +
                "Guidance: dreamcatcher Recall is the canonical one-shot; Audit (minutes over the whole archive) stays resident. " +
                "Capability dispatches are always resident (workers are steerable services, not calls).",
            },
            model: {
              type: "string",
              description:
                'Optional model override for the child, as "<provider>/<model-id>" — everything before the first "/" is the provider route name, and the model id may itself contain slashes (e.g. "berget/zai-org/GLM-5.3-Flash", "berget/Qwen/Qwen3.8-27B-FP8"). ' +
                'A value without "/" is a bare model id on this session\'s own provider. Leave unset to inherit the session\'s model.',
            },
            label: {
              type: "string",
              description:
                "Human-readable suffix for the child's durable label — the dispatch ADDRESS is always its prefix " +
                "(e.g. 'capability/fitd26-admin-ui · my-task', 'builtin/dreamcatcher (one-shot) · checks'), so " +
                "list_agents always identifies which capability a child belongs to. Omit for the plain address.",
            },
          },
          execute: async (args, exec) => {
            const parent = exec.agent as Agent | undefined
            if (!parent) {
              throw new Error("hive_dispatch must be called from within an agent turn (no calling agent in scope)")
            }
            const target = parseDispatchTarget(args.capability)
            const def = target.kind === "builtin" ? BUILTIN_AGENTS[target.id] : undefined
            const shape = (args.shape as DispatchShape | undefined) ?? (def ? def.shapes[0] : "resident")
            if (shape !== "resident" && shape !== "one-shot") {
              throw new Error(`invalid shape "${args.shape}" — use "resident" or "one-shot"`)
            }
            if (shape === "one-shot" && !def) {
              throw new Error(
                `shape "one-shot" is only available for built-ins; capability dispatches are always resident ` +
                  `(workers stay steerable and cold-resumable)`
              )
            }
            if (def && !def.shapes.includes(shape)) {
              throw new Error(
                `builtin/${target.id} does not support shape "${shape}" — allowed: ${def.shapes.join(", ")}. ${def.shapeGuidance}`
              )
            }
            let persona: string
            if (def) {
              // Built-ins: their full plugin-side method, passed through
              // untouched (byte-identical, drift-guarded; the standing
              // context is capability-worker doctrine, not theirs).
              persona = def.persona
            } else {
              // T5/D7: resolve the capability's OWN method from the roster
              // (preset persona text, else legacy ledger body) and compose
              // identity + material + standing into the request persona.
              // Resolution is non-fatal — a miss logs debug and the child
              // dispatches with identity + standing only.
              const material = resolveCapabilityMaterial(this.directory, this.capabilitiesPath, target.id)
              if (!material) {
                this.ctx.logger.debug?.("[evolution] no capability material for dispatch — composing standing-only persona", {
                  capability: target.id,
                  directory: this.directory,
                  capabilitiesPath: this.capabilitiesPath,
                })
              }
              persona = composeDispatchPersona(target.id, { material })
            }
            const agentOptions = args.model ? parseModelSpec(args.model) : undefined
            // The durable label always carries the dispatch address as its
            // prefix (see composeDispatchLabel) — list_agents has no other
            // capability-identity field, so a custom orchestrator label must
            // never erase which capability a child belongs to.
            const address = target.kind === "builtin" ? `builtin/${target.id}` : `capability/${target.id}`

            if (shape === "one-shot") {
              const def2 = def!
              const run = await this.ctx.subagents.start("spawn", {
                parent,
                label: composeDispatchLabel(address, args.label, "one-shot"),
                prompt: [{ type: "text", text: args.prompt }] as ContentBlock[],
                persona: def2.persona,
                toolFilter: { deny: [...def2.toolFilter.deny] },
                ...(agentOptions ? { agentOptions } : {}),
                signal: exec.signal,
              })
              this.markUsed(target.id, String(run.id))
              const result = await run.result
              try {
                await run.dispose()
              } catch {
                // disposal is best-effort after settlement
              }
              const text = (result.output ?? [])
                .map((b) => (b.type === "text" ? b.text : ""))
                .join("\n")
                .trim()
              if (result.stopReason !== "completed") {
                return `[one-shot ended: ${result.stopReason}${result.diagnostic ? ` — ${result.diagnostic}` : ""}]\n${text}`
              }
              return text || "(child produced no output)"
            }

            const start = await this.ctx.subagents.startContinuable({
              provider: "spawn",
              label: composeDispatchLabel(address, args.label),
              request: {
                parent,
                prompt: [{ type: "text", text: args.prompt }] as ContentBlock[],
                persona,
                // I-070: read-only enforcement stays caller-side — passed in
                // as the request's `toolFilter`, applied as a scoped
                // tools.restrict() in the child's creation window. Built-ins
                // carry the canonical filter from BUILTIN_AGENTS.
                ...(def ? { toolFilter: { deny: [...def.toolFilter.deny] } } : {}),
                // Orchestrator-chosen model route (AgentOptions: provider? +
                // model; dsh merges it over the parent's route child-side).
                ...(agentOptions ? { agentOptions } : {}),
              },
              signal: exec.signal,
            })
            this.markUsed(target.id, String(start.childId))
            return (
              `Dispatched ${target.kind === "builtin" ? `builtin/${target.id}` : `capability/${target.id}`} as a resident continuable child (session ${String(start.childId)}).` +
              (agentOptions ? ` Model override: ${args.model}.` : "") +
              (def ? " Read-only filter applied via the start request's toolFilter field." : "") +
              ` Continue THIS child with send_message(${String(start.childId)}) when it holds relevant context; list_agents lists your live instances; dispatch again only for fresh or parallel work.`
            )
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
   *
   * `parameters` defaults to `{}` (the no-argument lifecycle tools); the
   * awaken batch summon passes its `capabilities` schema. `run` always
   * receives the call's parsed args — the zero-arg tools simply ignore them.
   */
  private registerLifecycleTool(
    agentCtx: import("@deepseek-ai/cordis").Context,
    name: string,
    description: string,
    run: (args: unknown) => string,
    parameters: ParameterSchemaSpec = {}
  ): () => void {
    let disposer: (() => void) | undefined
    disposer = agentCtx.tools.register(
      defineTool({
        name,
        description,
        parameters,
        execute: async (args) => {
          try {
            return run(args)
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

  /**
   * The structural view of this service the dossier composer consumes
   * (composeEcosystemSnapshot takes primitives so T6 can reuse it without a
   * service handle).
   */
  snapshotSource = (): EcosystemSnapshotSource => ({
    directory: this.directory,
    listCapabilities: () => this.listCapabilities(),
  })

  /**
   * The compaction seam's block composer (T6): the two re-anchor ingredients
   * resolved and handed to the pure composer — the energy summary from
   * getCapabilitiesSummary (verbatim energy.ts helper) and the pre-compaction
   * dream pointers from the dream archive.
   *
   * dreamArchive is read via `ctx.get`, NOT static inject — the
   * optional-service pattern, deliberately. The cohort's hive profile always
   * mounts it, but a standalone-evolution process (including this package's
   * own test harness) does not, and a hard inject would hold the WHOLE
   * evolution service at boot for a dependency this seam can degrade without:
   * an anchor without dream pointers still restores roster/energy awareness,
   * while an unbooted evolution would take the tick, the roster, and the gate
   * down with it. The read is also failure-isolated — a throw inside this
   * serial listener fails agent PUBLICATION, so any archive misbehavior
   * (absent service, scan error, shape drift) collapses to "pointers
   * unavailable" instead.
   */
  postCompactionContext = (): string => {
    let pointers: PreCompactionDreamPointer[] | undefined
    try {
      const archive = this.ctx.get("dreamArchive") as
        | { recentPreCompactionDreams?: (limit?: number) => unknown }
        | undefined
      const recent = archive?.recentPreCompactionDreams?.(POST_COMPACTION_DREAM_LIMIT)
      if (Array.isArray(recent)) pointers = recent as PreCompactionDreamPointer[]
    } catch {
      pointers = undefined
    }
    return composePostCompactionContext({ capabilitySummary: this.capabilitiesSummary(), dreamPointers: pointers })
  }

  // ── the awaken gate's held disposers (T2) ─────────────────────────────────
  // Both keyed by session id; see the gate listener for why not the Agent.

  private gateRestrictions = new Map<string, () => void>()
  private dormantSections = new Map<string, () => void>()

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

  /** List active capabilities (non-`_`-prefixed subdirectories with a preset). */  listCapabilities = (): CapabilityInfo[] => {
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
   *
   * T2/D7: an optional validated `persona` materializes the capability's rich
   * method body INTO the preset's persona text block (identity line + the
   * rendered template sections) — the method travels with the preset, so
   * dispatched children and cold resumes all read one canonical source. The
   * NO-PERSONA path is byte-identical to the pre-T2 output (pinned by test):
   * a minimal two-line spawn stays valid.
   */
  spawn = (name: string, description: string, persona?: CapabilityPersona): string => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      throw new Error(`invalid capability name "${name}" (lowercase letters, digits, dashes only)`)
    }
    assertCapabilityNameUsable(name)
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
    fs.writeFileSync(path.join(dir, "agent.cordis.yml"), renderAgentCordisYml(name, description, persona), "utf8")
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
   * The awaken batch summon's body (T2): manifest a list of approved
   * capabilities in one call. Each entry is validated (name/description
   * syntax, persona via parseCapabilityPersona) and looped through the
   * EXISTING `spawn()` — this is the ONLY mutation path; the handler never
   * hand-writes capability files (WI-036/037). A refused entry (duplicate,
   * reserved name, invalid persona) reports a ✗ line and does not abort the
   * rest of the batch.
   */
  spawnBatch = (rawArgs: unknown): string => {
    const args = (rawArgs ?? {}) as { capabilities?: unknown }
    const list = args.capabilities
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("hive_awaken_spawn requires a non-empty `capabilities` array ({ name, description, persona? })")
    }
    const lines: string[] = []
    let manifested = 0
    for (const entry of list) {
      const rec = (entry ?? {}) as { name?: unknown; description?: unknown; persona?: unknown }
      const name = typeof rec.name === "string" ? rec.name : ""
      const description = typeof rec.description === "string" ? rec.description : ""
      lines.push(`Spawning ${name}…`)
      try {
        if (!name) throw new Error("entry is missing its `name`")
        if (!description) throw new Error("entry is missing its `description`")
        const persona = parseCapabilityPersona(rec.persona)
        const dir = this.spawn(String(name), String(description), persona)
        manifested++
        lines.push(`  ✓ manifested at ${dir} (energy 50)`)
      } catch (err) {
        lines.push(`  ✗ refused: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return (
      `HIVE awakening manifests: ${manifested}/${list.length} manifested.\n\n` + lines.join("\n")
    )
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
 * How a dispatched child runs (the dsh subagent matrix, restricted to the two
 * legs HIVE uses):
 * - "resident" — background continuable child: the dispatch returns the child's
 *   durable session id, the report arrives as a message, `send_message` can
 *   steer the child later, and it cold-resumes across process restarts. The
 *   ONLY shape for capability workers (they are services, not calls).
 * - "one-shot" — synchronous consult: blocks until the child settles and
 *   returns its final output as the tool result directly. For short,
 *   self-contained, result-shaped tasks only.
 */
export type DispatchShape = "resident" | "one-shot"

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

/** A plugin-owned built-in dispatchable through hive_dispatch's `builtin/` prefix. */
export interface BuiltinAgentDef {
  id: string
  description: string
  /** Full persona composed into the child — plugin-side material, no preset install needed. */
  persona: string
  /** Caller-side tool restriction (I-070: enforcement is caller-side, never preset-declared). */
  toolFilter: { deny: readonly string[] }
  /** Permitted shapes, FIRST entry = default. */
  shapes: readonly [DispatchShape, ...DispatchShape[]]
  /** When to pick which shape — surfaced in the dispatch contract. */
  shapeGuidance: string
}

/**
 * The plugin-owned built-ins. One table row is the whole cost of adding the
 * next one: persona material ships in the package, the shape policy carries
 * the "when which shape" rules, and dispatch stays a single tool.
 */
export const BUILTIN_AGENTS: Record<string, BuiltinAgentDef> = {
  dreamcatcher: {
    id: "dreamcatcher",
    description: "the dream-archive agent — Recall consults and Audit scans over the workspace's `.opencode/dreams/`",
    persona: DREAMCATCHER_DISPATCH_PERSONA,
    toolFilter: DREAMCATCHER_READ_ONLY_TOOL_FILTER,
    shapes: ["resident", "one-shot"],
    shapeGuidance:
      "resident (default) for Recall-integrated task work and Audit scans — audit runs minutes over the whole " +
      "archive and its findings arrive as a report message; one-shot for Recall consults — short, read-only, " +
      "and the dossier returns inline as this tool's result",
  },
}

/**
 * Parse a hive_dispatch address into its target. Three forms:
 * - `builtin/<id>`   — plugin-owned built-in (BUILTIN_AGENTS).
 * - `capability/<name>` — a workspace capability from the roster.
 * - `<name>` (bare)  — compat form, canonicalized to `capability/<name>`.
 * Bare names of built-ins are refused with the canonical form in the message,
 * so the address type is always explicit at the call site.
 */
export function parseDispatchTarget(spec: string): { kind: "builtin" | "capability"; id: string } {
  const trimmed = spec.trim()
  if (!trimmed) {
    throw new Error(`hive_dispatch: empty address — pass "capability/<name>", "builtin/<id>", or a bare "<name>"`)
  }
  if (trimmed.startsWith("builtin/")) {
    const id = trimmed.slice("builtin/".length)
    if (!BUILTIN_AGENTS[id]) {
      throw new Error(
        `unknown built-in "${id}" — known: ${Object.keys(BUILTIN_AGENTS).map((b) => `builtin/${b}`).join(", ")}`
      )
    }
    return { kind: "builtin", id }
  }
  const id = trimmed.startsWith("capability/") ? trimmed.slice("capability/".length) : trimmed
  if (BUILTIN_AGENTS[id]) {
    throw new Error(
      `"${id}" is a plugin-owned built-in — dispatch it as "builtin/${id}". ` +
        `Bare names address workspace capabilities only, so the two never collide.`
    )
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`invalid capability id "${id}" (lowercase letters, digits, dashes)`)
  }
  return { kind: "capability", id }
}

/**
 * Compose the child's DURABLE label. `list_agents` entries carry id / activity
 * / mode / label and nothing else — the label is the only identity carrier —
 * so the dispatch address is ALWAYS its prefix: an orchestrator label is
 * composed AFTER the address, never replacing it. A label that already starts
 * with the address is used as-is (no double prefix). Non-resident shapes get a
 * shape suffix so a one-shot consult is never confused with a steerable child.
 */
export function composeDispatchLabel(address: string, label?: string, shape?: DispatchShape): string {
  const shapeSuffix = shape && shape !== "resident" ? ` (${shape})` : ""
  if (!label) return `${address}${shapeSuffix}`
  if (label.startsWith(address)) return `${label}${shapeSuffix}`
  return `${address}${shapeSuffix} · ${label}`
}

/**
 * Capability names owned by the plugin itself. With dispatch addressing this
 * guard has ONE job left: `/spawn` never manifests a capability whose name
 * would read as the built-in to muscle memory and tooling written before the
 * `builtin/` prefix existed. Dispatching the built-in goes through
 * `builtin/<id>`, so no shadowing is possible by construction.
 */
export const RESERVED_CAPABILITY_NAMES = ["dreamcatcher"] as const

/** Refuse to manifest a reserved name. Creation-time only. */
export function assertCapabilityNameUsable(name: string): void {
  if (!RESERVED_CAPABILITY_NAMES.includes(name as (typeof RESERVED_CAPABILITY_NAMES)[number])) return
  throw new Error(
    `capability name "${name}" is reserved for the built-in dream-archive agent — dispatch it as ` +
      `"builtin/dreamcatcher" and pick another name for the capability`
  )
}

/**
 * Parse the dispatch `model` argument into dsh's composite route parts.
 *
 * The string form is `"<provider>/<model-id>"` — everything before the FIRST
 * "/" is the provider route name, everything after is the model id (model
 * ids may themselves contain slashes: `"berget/zai-org/GLM-5.3-Flash"` or
 * `"berget/Qwen/Qwen3.8-27B-FP8"`). A value WITHOUT "/" is a bare model id
 * on the dispatching agent's own provider. Empty/whitespace throws.
 */
export function parseModelSpec(modelSpec: string): { provider?: string; model: string } {
  const trimmed = modelSpec.trim()
  if (!trimmed) {
    throw new Error(`hive_dispatch: empty model override — pass "<provider>/<model-id>" or a bare "<model-id>"`)
  }
  const slash = trimmed.indexOf("/")
  if (slash === -1) return { model: trimmed }
  return { provider: trimmed.slice(0, slash), model: trimmed.slice(slash + 1) }
}

/**
 * Compose the per-child persona for a workspace CAPABILITY dispatch (T5/D7
 * persona-carried transport): identity line + the capability's OWN material
 * (its method, resolved by `resolveCapabilityMaterial` — preset persona text
 * or legacy ledger body) + the plugin's capability standing context
 * (CAPABILITY_STANDING — doctrine, capability-independent, appended even on
 * a material miss). Material failure is non-fatal: identity + standing only.
 *
 * This return value is passed VERBATIM as the start request's
 * `SubagentStartRequest.persona` — it is therefore the exact text the child's
 * system prompt mounts and the durable descriptor snapshots (cold-resume
 * safe). The dispatch task prompt (`args.prompt`) stays the task brief only:
 * the method travels here, not into the brief.
 *
 * Built-ins are NOT routed through this composer — `BUILTIN_AGENTS[...].persona`
 * is their full method and is passed through untouched (pinned byte-identical
 * by test); the standing context is capability-worker doctrine, not theirs.
 *
 * The capability roster is deliberately NOT included: dsh composes the
 * process-level `hive:roster` systemPrompt section into EVERY agent in the
 * process (including spawned children), so an in-persona roster arrived as a
 * literal duplicate in the child's system prompt (seen in live dispatch
 * transcripts). The persona keeps the child-identity line — the SHADOW-009
 * "the child's own capability names itself first" property — and the method
 * material, while the roster comes exactly once from the system-prompt
 * assembly.
 */
export function composeDispatchPersona(capabilityId: string, options?: { material?: string }): string {
  const parts = [`You are the \`${capabilityId}\` HIVE capability, dispatched as a resident continuable child of the coordinator.`]
  const material = options?.material?.trim()
  if (material) parts.push(material.trimEnd())
  parts.push(CAPABILITY_STANDING)
  return parts.join("\n\n")
}

export default Evolution

// dsh loader contract: the loader applies the DEFAULT export only (W-045) —
// inject rides on the class as `static inject` above. Named re-exports below
// are for consumers/tests, never read by the loader.
export { readHiveState, writeHiveState, markCapabilityUsed, tickEnergy, getCapabilitiesSummary }
export { CAPABILITY_STANDING }
export { resolveCapabilityMaterial } from "./lib/material.js"
// Re-exported for the tests (and consumers) so fixture presets render through
// the SAME writer the plugin ships — no copy-pasted yml shape to drift.
export { renderAgentCordisYml } from "./lib/persona.js"
export type { HiveState, TickResult }
