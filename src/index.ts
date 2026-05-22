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
import { tool } from "@opencode-ai/plugin"
import type { Plugin, Hooks, PluginInput } from "@opencode-ai/plugin"
import { readMdDir, readMdFile } from "./lib/frontmatter.js"
import { snapshotAgentsMtime, snapshotChanged } from "./lib/reload.js"
import { tickEnergy, markCapabilityUsed, getCapabilitiesSummary } from "./lib/energy.js"
import { getInbox, formatInboxForPrompt, sendMessage, markAllRead } from "./lib/hivemind.js"

const PLUGIN_ROOT = path.dirname(new URL(import.meta.url).pathname)
// Navigate up from src/ to plugin root
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

// ── Session tracking ──────────────────────────────────────────────────────────

interface SessionInfo {
  agent: string
  active: boolean
}

/** Strip "capabilities/" prefix to get the short name used for inbox dirs and roster lookups */
function shortAgentName(agent: string): string {
  return agent.replace(/^capabilities\//, "")
}

const sessionMap = new Map<string, SessionInfo>()
const knownCapabilityFiles = new Set<string>()

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

  // Initialize known capability files set
  try {
    for (const f of fs.readdirSync(capDir)) {
      if (f.endsWith(".md") && !f.startsWith("_")) {
        knownCapabilityFiles.add(f)
      }
    }
  } catch {
    // ignore
  }
}

// ── Roster builder ────────────────────────────────────────────────────────────

function buildCapabilityRoster(capabilitiesPath: string): string {
  const lines: string[] = ["## Active Capabilities"]
  try {
    const files = fs.readdirSync(capabilitiesPath)
    for (const file of files) {
      if (!file.endsWith(".md") || file.startsWith("_")) continue
      const name = file.replace(".md", "")
      const filePath = path.join(capabilitiesPath, file)
      const { frontmatter } = readMdFile(filePath)
      const desc = (frontmatter.description as string) || "(no description)"
      lines.push(`  ${name} — ${desc}`)
    }
  } catch {
    // no capabilities dir
  }
  if (lines.length === 1) {
    lines.push("  (none)")
  }
  return lines.join("\n")
}

// ── Plugin entry ──────────────────────────────────────────────────────────────

export const HivePlugin: Plugin = async function (ctx: PluginInput) {
  const { directory, client } = ctx
  const projectAgentsPath = path.join(directory, ".opencode/agents")
  const capabilitiesPath = path.join(projectAgentsPath, "capabilities")

  bootstrapProject(directory)

  const log = (level: "info" | "debug" | "error" | "warn", message: string, extra?: Record<string, unknown>) => {
    client?.app?.log?.({
      body: { service: "evolutional-agent-structure", level, message, ...(extra && { extra }) },
    }).catch(() => {})
  }

  log("info", `HIVE plugin v${PLUGIN_VERSION} loaded from ${PACKAGE_ROOT}`)

  let lastSnapshot = await snapshotAgentsMtime(projectAgentsPath)

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
    "tool.execute.after": async (input) => {
      if (input.tool === "task") {
        const agentType = input?.args?.subagent_type || ""
        if (agentType.startsWith("capabilities/")) {
          const capName = agentType.replace("capabilities/", "")
          markCapabilityUsed(directory, capName)
          log("info", `Marked capability as used: ${capName}`)

          const pending = getInbox(directory, capName)
          if (pending.length > 0) {
            const formatted = formatInboxForPrompt(pending)
            log("info", `HIVEmind: ${pending.length} pending message(s) after ${capName} ran`, { formatted })
          }
        }
      }
    },

    // ── Event: session tracking, energy tick, hot-reload, file watcher ──
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const { results, skipped } = tickEnergy(directory)
        if (!skipped) {
          log("info", "Energy tick applied on session.created", { results })
        }

        const currentSnapshot = await snapshotAgentsMtime(projectAgentsPath)
        if (snapshotChanged(lastSnapshot, currentSnapshot)) {
          lastSnapshot = currentSnapshot
        }
      }

      // Track session → agent mapping
      if (event.type === "session.status") {
        const props = event.properties as { sessionID: string; status: { type: string } }
        if (props.status.type === "busy") {
          const info = sessionMap.get(props.sessionID)
          if (info) info.active = true
        }
      }

      if (event.type === "session.idle") {
        const props = event.properties as { sessionID: string }
        const info = sessionMap.get(props.sessionID)
        if (info) info.active = false
      }

      // File watcher: detect new capabilities
      if (event.type === "file.watcher.updated") {
        const props = event.properties as unknown as { path: string }
        const updatedPath = props.path
        if (updatedPath.includes(".opencode/agents/capabilities/") && updatedPath.endsWith(".md")) {
          const filename = path.basename(updatedPath)
          if (!filename.startsWith("_") && !knownCapabilityFiles.has(filename)) {
            knownCapabilityFiles.add(filename)
            // New capability detected — notify all active sessions
            const capName = filename.replace(".md", "")
            let desc = "(no description)"
            try {
              const { frontmatter } = readMdFile(updatedPath)
              desc = (frontmatter.description as string) || desc
            } catch {
              // ignore
            }

            const notification = `[HIVEmind] New capability available: ${capName} — ${desc}`
            for (const [sessionID, info] of sessionMap.entries()) {
              if (info.active) {
                client.session.prompt({
                  path: { id: sessionID },
                  body: { noReply: true, parts: [{ type: "text", text: notification }] },
                }).catch(() => {})
              }
            }
          }
        }
      }
    },

    // ── System transform: inject roster + pending messages ──
    "experimental.chat.system.transform": async (input, output) => {
      const roster = buildCapabilityRoster(capabilitiesPath)
      output.system.push(roster)

      // Inject pending messages for the calling agent
      if (input.sessionID) {
        const info = sessionMap.get(input.sessionID)
        if (info?.agent) {
          const pending = getInbox(directory, shortAgentName(info.agent))
          if (pending.length > 0) {
            const formatted = formatInboxForPrompt(pending)
            if (formatted) {
              output.system.push(formatted)
            }
          }
        }
      }
    },

    // ── Chat message: track session → agent mapping ──
    "chat.message": async (input, _output) => {
      if (input.sessionID && input.agent) {
        sessionMap.set(input.sessionID, { agent: input.agent, active: true })
      }
    },

    // ── Compaction: auto-tick + preserve HIVE state ──
    "experimental.session.compacting": async (_input, output) => {
      const { results, skipped } = tickEnergy(directory)
      if (!skipped) {
        log("info", "Energy tick applied on compaction", { results })
      }

      const summary = getCapabilitiesSummary(capabilitiesPath)
      if (summary) {
        output.context.push(
          `## HIVE State (preserved across compaction)\n\n${summary}\n\nUse /status to see full details. Capabilities with low energy may need attention.`
        )
      }
    },

    // ── Custom tools: hive_signal and hive_listen ──
    tool: {
      hive_signal: tool({
        description: "Send a message to another capability in the HIVE ecosystem. Use this when you need information from, or want to share information with, another capability. Messages are delivered in real-time if the recipient is active, otherwise queued for their next session. Check the Active Capabilities list in your system prompt to see valid recipients.",
        args: {
          recipient: tool.schema.string().describe("Target capability name, '_broadcast' for all, or '_coordinator' to escalate"),
          type: tool.schema.enum(["question", "info", "result", "request"]).describe("Message type: question (need answer), info (FYI), result (answering prior question), request (ask coordinator to act)"),
          content: tool.schema.string().describe("Message content"),
        },
        async execute(args, context) {
          const sender = shortAgentName(context.agent || "unknown")

          const filename = sendMessage(directory, {
            sender,
            recipient: args.recipient,
            type: args.type,
            content: args.content,
          })

          // Attempt real-time delivery
          let delivered = false
          if (args.recipient !== "_broadcast" && args.recipient !== "_coordinator") {
            for (const [sessionID, info] of sessionMap.entries()) {
              if (shortAgentName(info.agent) === args.recipient && info.active) {
                try {
                  await client.session.prompt({
                    path: { id: sessionID },
                    body: {
                      noReply: true,
                      parts: [{ type: "text", text: `[HIVEmind] Message from ${sender} (${args.type}): ${args.content}` }],
                    },
                  })
                  delivered = true
                } catch {
                  // queued instead
                }
              }
            }
          } else if (args.recipient === "_broadcast") {
            for (const [sessionID, info] of sessionMap.entries()) {
              if (info.active && shortAgentName(info.agent) !== shortAgentName(sender)) {
                client.session.prompt({
                  path: { id: sessionID },
                  body: {
                    noReply: true,
                    parts: [{ type: "text", text: `[HIVEmind broadcast from ${sender}] (${args.type}): ${args.content}` }],
                  },
                }).catch(() => {})
              }
            }
            delivered = true
          }

          return delivered
            ? `Message sent to ${args.recipient} and delivered in real-time. (file: ${filename})`
            : `Message queued for ${args.recipient}. They will receive it on their next session. (file: ${filename})`
        },
      }),

      hive_listen: tool({
        description: "Read pending messages from other capabilities addressed to you. Messages are also injected into your system prompt automatically, but use this tool to explicitly check for and acknowledge messages.",
        args: {
          mark_read: tool.schema.boolean().optional().describe("If true, mark all messages as read after retrieving them"),
        },
        async execute(args, context) {
          const agent = shortAgentName(context.agent || "unknown")
          const pending = getInbox(directory, agent)

          if (pending.length === 0) {
            return "No pending messages."
          }

          const formatted = formatInboxForPrompt(pending)

          if (args.mark_read) {
            markAllRead(directory, agent)
          }

          return formatted || "No pending messages."
        },
      }),
    },
  }

  return hooks
}

export default HivePlugin
