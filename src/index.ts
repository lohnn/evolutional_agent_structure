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
import { NervousSystem } from "./lib/nervous-system.js"
import { createHiveTools } from "./tools.js"
import {
  createEventHook,
  createSystemTransformHook,
  createChatMessageHook,
  createCompactionHook,
  createToolDefinitionHook,
  createToolExecuteBeforeHook,
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

  // Bootstrap dreams directory structure
  const dreamsBase = path.join(directory, ".opencode/dreams")
  for (const sub of ["active", "history", "artifacts/insights", "artifacts/warnings", "artifacts/songlines", "artifacts/shadows"]) {
    fs.mkdirSync(path.join(dreamsBase, sub), { recursive: true })
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
    log,
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

        const agents = readMdDir(AGENTS_DIR)
        for (const agent of agents) {
          const fm = agent.frontmatter
          config.agent[agent.name] = {
            description: (fm.description as string) || "",
            prompt: agent.body.trim(),
            mode: ((fm.mode as string) || "subagent") as "subagent" | "primary" | "all",
            ...((fm.model as string) && { model: fm.model as string }),
            ...((fm.permission as Record<string, string>) && { permission: fm.permission as Record<string, string> }),
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
        const delegationRule = path.join(RULES_DIR, "delegation.md")
        if (!config.instructions.includes(delegationRule)) {
          config.instructions.push(delegationRule)
        }

        const hivemindRule = path.join(RULES_DIR, "hivemind-capabilities.md")
        if (!config.instructions.includes(hivemindRule)) {
          config.instructions.push(hivemindRule)
        }

        log("info", `HIVE config registered`, {
          agents: agents.map((a) => a.name),
          commands: commands.map((c) => c.name),
          rules: [delegationRule, hivemindRule],
        })
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.stack || err.message : String(err)
        fs.writeFileSync("/tmp/evolutional-agent-structure-error.txt", errMsg)
      }
    },

    // ── Commands: hive-setup, tick, reload ──
    "command.execute.before": async (input, _output) => {
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
    },

    // ── Track capability usage when delegated to via Task tool ──
    "tool.execute.after": createToolExecuteAfterHook(hooksContext),

    // ── Enrich task tool description with HIVE capability roster ──
    "tool.definition": createToolDefinitionHook(hooksContext),

    // ── Enrich task tool prompt when targeting a capability ──
    "tool.execute.before": createToolExecuteBeforeHook(hooksContext),

    // ── Event: session tracking, energy tick, hot-reload, file watcher ──
    event: createEventHook(hooksContext),

    // ── System transform: inject roster + pending messages ──
    "experimental.chat.system.transform": createSystemTransformHook(hooksContext),

    // ── Chat message: track session → agent mapping ──
    "chat.message": createChatMessageHook(hooksContext),

    // ── Compaction: auto-tick + preserve HIVE state ──
    "experimental.session.compacting": createCompactionHook(hooksContext),

    // ── Custom tools: hive_signal, hive_listen ──
    tool: createHiveTools(ns, client, log),
  }

  return hooks
}

export default HivePlugin
