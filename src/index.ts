/**
 * OpenCode HIVE Plugin (TypeScript)
 *
 * Evolutional agent structure — collective intelligence that spawns, merges,
 * splits, mutates, and dissolves capabilities as needed.
 *
 * Provides:
 * - Config hook: register agents, commands, rules
 * - Energy tick system (auto-applied on session.created and compaction)
 * - Context compaction hooks (preserves HIVE state across compaction)
 * - Hot-reload on agent file changes
 * - HIVEmind nervous system: real-time messaging between capabilities
 * - hive_signal / hive_listen custom tools
 * - Active capabilities roster injection via system.transform
 */

import path from "path"
import fs from "fs"
import type { Plugin, Hooks, PluginInput } from "@opencode-ai/plugin"
import { readMdDir } from "./lib/frontmatter.js"
import { snapshotAgentsMtime } from "./lib/reload.js"
import { tickEnergy } from "./lib/energy.js"
import { executeReconcile, formatReconcileReport } from "./lib/board-reconcile.js"
import { buildLivePlan, defaultDbPath, backfillTitlesFromDb } from "./lib/board-reconcile-db.js"
import { NervousSystem } from "./lib/nervous-system.js"
import { loadModelCatalog, resolveAgentModel } from "./lib/model-resolve.js"
import { createHiveTools } from "./tools.js"
import {
  createEventHook,
  createSystemTransformHook,
  createChatMessageHook,
  createCompactionHook,
  createToolDefinitionHook,
  createToolExecuteAfterHook,
  type HooksContext,
} from "./hooks.js"

const PLUGIN_ROOT = path.dirname(new URL(import.meta.url).pathname)
const PACKAGE_ROOT = path.resolve(PLUGIN_ROOT, "..")
const AGENTS_DIR = path.join(PACKAGE_ROOT, "agents")
const COMMANDS_DIR = path.join(PACKAGE_ROOT, "commands")
const TEMPLATES_DIR = path.join(PACKAGE_ROOT, "templates")
const RULES_DIR = path.join(PACKAGE_ROOT, "rules")

let PLUGIN_VERSION = "unknown"
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"))
  PLUGIN_VERSION = pkg.version || "unknown"
} catch {
  // ignore
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function bootstrapProject(directory: string): void {
  const capDir = path.join(directory, ".opencode/agents/capabilities")
  const disDir = path.join(directory, ".opencode/agents/dissolved")

  fs.mkdirSync(capDir, { recursive: true })
  fs.mkdirSync(disDir, { recursive: true })

  const templateDest = path.join(capDir, "_template.md")
  if (!fs.existsSync(templateDest)) {
    const templateSrc = path.join(TEMPLATES_DIR, "_template.md")
    if (fs.existsSync(templateSrc)) {
      fs.copyFileSync(templateSrc, templateDest)
    }
  }

  // Bootstrap the canonical workspace-root taxonomy shell (see
  // docs/WORKSPACE-STRUCTURE.md). These live OUTSIDE .opencode/ — they are the
  // folder contract around the plugin, materialised so the taxonomy exists (and
  // workspace_map can enumerate it) on any machine, gift or builder. All are
  // git-ignored (/reference/, /scratch/) so empty dirs add zero tracked clutter,
  // and mkdirSync(recursive) is a no-op when they already exist (idempotent).
  for (const sub of ["reference/repos", "reference/material", "scratch"]) {
    fs.mkdirSync(path.join(directory, sub), { recursive: true })
  }

  // Bootstrap dreams directory structure
  const dreamsBase = path.join(directory, ".opencode/dreams")
  for (const sub of ["active", "history", "artifacts/insights", "artifacts/warnings", "artifacts/songlines", "artifacts/shadows", "raw", "raw/.harvested", "index/telemetry"]) {
    fs.mkdirSync(path.join(dreamsBase, sub), { recursive: true })
  }

  // Bootstrap pain-point directory structure (harness/workflow friction logs)
  const painpointsBase = path.join(directory, ".opencode/painpoints")
  for (const sub of ["raw", "raw/.harvested"]) {
    fs.mkdirSync(path.join(painpointsBase, sub), { recursive: true })
  }

  // Bootstrap HIVEmind directory structure
  const hivemindBase = path.join(directory, ".opencode/hivemind")
  for (const sub of ["inbox/_broadcast", "processed"]) {
    fs.mkdirSync(path.join(hivemindBase, sub), { recursive: true })
  }

  // Symlink plugin skills into .opencode/skills/ for discovery
  const projectSkillsDir = path.join(directory, ".opencode/skills")
  fs.mkdirSync(projectSkillsDir, { recursive: true })
  const pluginSkillsDir = path.join(PACKAGE_ROOT, "skills")
  if (fs.existsSync(pluginSkillsDir)) {
    for (const entry of fs.readdirSync(pluginSkillsDir)) {
      const src = path.join(pluginSkillsDir, entry)
      const dest = path.join(projectSkillsDir, entry)
      if (fs.statSync(src).isDirectory()) {
        try {
          const existing = fs.lstatSync(dest)
          if (existing.isSymbolicLink() && fs.readlinkSync(dest) === src) continue
          fs.rmSync(dest, { recursive: true })
        } catch {
          // dest doesn't exist, fine
        }
        fs.symlinkSync(src, dest)
      }
    }
  }
}

// ── Plugin entry ──────────────────────────────────────────────────────────────

export const HivePlugin: Plugin = async function (ctx: PluginInput) {
  const { directory, client } = ctx
  const projectAgentsPath = path.join(directory, ".opencode/agents")
  const capabilitiesPath = path.join(projectAgentsPath, "capabilities")

  bootstrapProject(directory)

  const ns = new NervousSystem(client, directory)

  const log = (level: "info" | "debug" | "error" | "warn", message: string, extra?: Record<string, unknown>) => {
    client?.app?.log?.({
      body: { service: "evolutional-agent-structure", level, message, ...(extra && { extra }) },
    }).catch(() => {})
  }

  // High-frequency diagnostic logs gated behind HIVE_DEBUG=1.
  // Set this env var to re-enable verbose [HIVE] info output for debugging.
  // Error/warn logs are always emitted via log() directly.
  const debugLog = (message: string, extra?: Record<string, unknown>) => {
    if (process.env.HIVE_DEBUG === "1") log("info", message, extra)
  }

  log("info", `HIVE plugin v${PLUGIN_VERSION} loaded from ${PACKAGE_ROOT}`)

  // Mutable state for hooks
  let lastSnapshot = await snapshotAgentsMtime(projectAgentsPath)
  let activeSessionId = "unknown"

  const hooksContext: HooksContext = {
    ns,
    client,
    directory,
    projectAgentsPath,
    capabilitiesPath,
    rulesDir: RULES_DIR,
    log,
    debugLog,
    getLastSnapshot: () => lastSnapshot,
    setLastSnapshot: (s) => { lastSnapshot = s },
    getActiveSessionId: () => activeSessionId,
    setActiveSessionId: (id) => { activeSessionId = id },
  }

  const hooks: Hooks = {
    // ── Config: register agents, commands, and rules ──
    config: async (config) => {
      try {
        config.agent = config.agent || {}
        config.command = config.command || {}

        // Model resolution (see lib/model-resolve.ts). Agent frontmatter names
        // the MODEL; the provider prefix comes from this machine's own default
        // model, because which provider a user has auth for is a property of
        // their machine, not of the agent. Catalog loaded ONCE, outside the
        // loop — it is memoized, but the intent should be visible here too.
        const catalog = loadModelCatalog()
        const modelDecisions: Record<string, string> = {}

        const agents = readMdDir(AGENTS_DIR)
        for (const agent of agents) {
          const fm = agent.frontmatter
          const spec = typeof fm.model === "string" ? fm.model : undefined
          const resolved = resolveAgentModel({
            agentName: agent.name,
            spec,
            defaultModel: typeof config.model === "string" ? config.model : undefined,
            catalog,
          })
          config.agent[agent.name] = {
            description: (fm.description as string) || "",
            prompt: agent.body.trim(),
            mode: ((fm.mode as string) || "subagent") as "subagent" | "primary" | "all",
            ...(resolved.model && { model: resolved.model }),
            ...((fm.permission as Record<string, string>) && { permission: fm.permission as Record<string, string> }),
          }
          modelDecisions[agent.name] = resolved.model ?? "(inherited)"
          // Log ONLY where a decision was actually made. An agent with no
          // model: inherits by design and says nothing; the agents that asked
          // for something are the ones whose outcome is worth reading — this
          // line is the diagnostic a user reads when an agent misbehaves on a
          // machine with different providers, so it carries the spec, the
          // outcome and the reason together.
          if (spec !== undefined || resolved.model !== undefined) {
            log("info", `[model] ${agent.name}: ${resolved.model ?? "inherited (no model registered)"}`, {
              agent: agent.name,
              frontmatter: spec ?? "(none)",
              resolved: resolved.model ?? "(inherited)",
              defaultModel: config.model ?? "(unset)",
              catalog: catalog ? "loaded" : "unavailable",
              reason: resolved.reason,
            })
          }
        }

        const commands = readMdDir(COMMANDS_DIR)
        for (const cmd of commands) {
          const fm = cmd.frontmatter
          config.command[cmd.name] = {
            description: (fm.description as string) || "",
            template: cmd.body.trim(),
            ...((fm.agent as string) && { agent: fm.agent as string }),
          }
        }

        config.instructions = config.instructions || []
        // Note: delegation.md and hivemind-capabilities.md are injected conditionally
        // via system.transform (coordinator-only / capability-only, gated by /awaken).
        // They are NOT added to config.instructions (which is static and global).

        log("info", `HIVE config registered`, {
          agents: agents.map((a) => a.name),
          models: modelDecisions,
          commands: commands.map((c) => c.name),
          rules: ["delegation.md (via system.transform)", "hivemind-capabilities.md (via system.transform)"],
        })
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.stack || err.message : String(err)
        fs.writeFileSync("/tmp/evolutional-agent-structure-error.txt", errMsg)
      }
    },

    // ── Commands: hive-setup, tick, reload ──
    "command.execute.before": async (input, output) => {
      if (input.command === "hive-setup") {
        const agentsMdDest = path.join(directory, "AGENTS.md")
        const rulesSource = path.join(RULES_DIR, "delegation.md")
        if (fs.existsSync(rulesSource)) {
          const content = fs.readFileSync(rulesSource, "utf8")
          fs.writeFileSync(agentsMdDest, content, "utf8")
          log("info", `AGENTS.md written to ${agentsMdDest}`)
        }
        bootstrapProject(directory)
      }

      if (input.command === "tick") {
        const { results, warnings, skipped } = tickEnergy(directory)
        log("info", skipped ? "Energy tick skipped" : "Energy tick applied", { results, warnings })
      }

      if (input.command === "reload") {
        lastSnapshot = await snapshotAgentsMtime(projectAgentsPath)
      }

      // /reconcile — one-off human-initiated board back-fill. Dry-run by
      // default; `--write` actually creates the cards. The heavy lifting is the
      // tested lib/board-reconcile(-db) modules; here we build the live plan,
      // optionally execute it, and inject the human-readable report so the
      // command's model turn relays real data (not a hallucinated table).
      if (input.command === "reconcile") {
        // NOTE: executeReconcile's 3rd arg is a POSITIONAL boolean dryRun —
        // pass `false` to write. (A prior {dryRun:false} object was truthy and
        // silently dry-ran; this call site passes the boolean directly.)
        const write = /(^|\s)--write(\s|$)/.test(input.arguments || "")
        let report: string
        try {
          const dbPath = defaultDbPath()
          const plan = buildLivePlan(directory, dbPath)
          const result = await executeReconcile(directory, plan, /* dryRun */ !write)
          // Also retro-correct already-frozen placeholder titles from the DB
          // (repairs items created before the session.updated title hook). Same
          // dry-run/write gate; same locked title-write path.
          const titles = await backfillTitlesFromDb(directory, dbPath, /* dryRun */ !write)
          report = formatReconcileReport(plan, result)
          if (titles.fixes.length > 0) {
            const verb = write ? "Corrected" : "Would correct"
            report +=
              `\n\nTITLE BACK-FILL — ${verb} ${titles.fixes.length} frozen placeholder title(s):\n` +
              titles.fixes.map((f) => `  ${f.itemID}: "${f.from}" → "${f.to}"`).join("\n")
          }
          log("info", write ? "Board reconcile executed" : "Board reconcile dry-run", {
            planned: plan.cards.length,
            created: result.created.length,
            skipped: result.skipped.length,
            titleFixes: titles.fixes.length,
            write,
          })
        } catch (err) {
          report = `RECONCILE FAILED to read the transcript DB or write the board: ${String(err)}`
          log("warn", "[board] reconcile failed", { error: String(err) })
        }
        // Inject the computed report as a synthetic text part so the command's
        // model turn relays real data. ids/sessionID/messageID are assigned by
        // opencode when the part is materialized; we supply the content shape.
        const reportPart = { type: "text", text: `RECONCILE RESULT (relay verbatim):\n\n${report}` }
        output.parts.unshift(reportPart as unknown as (typeof output.parts)[number])
      }
    },

    // ── Track capability usage when delegated to via Task tool ──
    "tool.execute.after": createToolExecuteAfterHook(hooksContext),

    // ── Enrich task tool description with HIVE capability roster ──
    "tool.definition": createToolDefinitionHook(hooksContext),

    // ── Event: session tracking, energy tick, hot-reload, file watcher ──
    event: createEventHook(hooksContext),

    // ── System transform: inject roster + pending messages ──
    "experimental.chat.system.transform": createSystemTransformHook(hooksContext),

    // ── Chat message: track session → agent mapping ──
    "chat.message": createChatMessageHook(hooksContext),

    // ── Compaction: auto-tick + preserve HIVE state ──
    "experimental.session.compacting": createCompactionHook(hooksContext),

    // ── Custom tools: hive_signal, hive_listen, hive_dream_residue, hive_dream_harvest ──
    tool: createHiveTools(ns, client, log, directory),
  }

  return hooks
}

export default HivePlugin
