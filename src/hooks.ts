/**
 * HIVE event hooks: session tracking, energy tick, hot-reload, system transform, compaction
 */

import path from "path"
import fs from "fs"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { snapshotAgentsMtime, snapshotChanged } from "./lib/reload.js"
import { tickEnergy, getCapabilitiesSummary } from "./lib/energy.js"
import { listPendingInboxes } from "./lib/hivemind.js"
import type { NervousSystem } from "./lib/nervous-system.js"

type Client = ReturnType<typeof createOpencodeClient>
type LogFn = (level: "info" | "debug" | "error" | "warn", message: string, extra?: Record<string, unknown>) => void

export interface HooksContext {
  ns: NervousSystem
  client: Client
  directory: string
  projectAgentsPath: string
  capabilitiesPath: string
  rulesDir: string
  log: LogFn
  getLastSnapshot: () => Record<string, number>
  setLastSnapshot: (snapshot: Record<string, number>) => void
  getActiveSessionId: () => string
  setActiveSessionId: (id: string) => void
}

export function createEventHook(ctx: HooksContext) {
  return async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const { ns, directory, projectAgentsPath, log, getLastSnapshot, setLastSnapshot, setActiveSessionId } = ctx

    if (event.type === "session.created") {
      const { results, skipped } = tickEnergy(directory)
      if (!skipped) {
        log("info", "Energy tick applied on session.created", { results })
      }

      const currentSnapshot = await snapshotAgentsMtime(projectAgentsPath)
      if (snapshotChanged(getLastSnapshot(), currentSnapshot)) {
        setLastSnapshot(currentSnapshot)
      }
    }

    if (event.type === "session.status") {
      const props = event.properties as { sessionID: string; status: { type: string } }
      if (props.status.type === "busy") {
        setActiveSessionId(props.sessionID)
        ns.markActive(props.sessionID)
      }
    }

    if (event.type === "session.idle") {
      const props = event.properties as { sessionID: string }
      ns.markIdle(props.sessionID)

      // If this was a capability session, check for pending unrouted messages
      // and wake the coordinator so it can route them
      if (ns.isCapabilitySession(props.sessionID)) {
        const capName = ns.resolveAgent(props.sessionID)
        const pendingInboxes = listPendingInboxes(directory)
        // Find messages that need coordinator attention: _coordinator inbox or
        // capabilities that are not currently active
        const needsRouting = pendingInboxes.filter(({ recipient }) => {
          if (recipient === "_coordinator") return true
          if (recipient === "_broadcast") return false
          // Check if that capability has an active session in this group
          return true
        })

        if (needsRouting.length > 0) {
          const lines = needsRouting.map(({ recipient, count }) => {
            if (recipient === "_coordinator") {
              return `- _coordinator: ${count} message(s) [FOR YOU]`
            }
            const capPath = path.join(directory, ".opencode/agents/capabilities", `${recipient}.md`)
            const exists = fs.existsSync(capPath)
            const status = exists ? "CAPABILITY EXISTS, INACTIVE" : "CAPABILITY DOES NOT EXIST (spawn signal)"
            return `- ${recipient}: ${count} message(s) [${status}]`
          })
          const reason = `Capability ${capName} completed. Pending routing needed:\n${lines.join("\n")}`
          ns.wakeCoordinator(reason, props.sessionID).catch((err) => {
            log("error", `[HIVE] wakeCoordinator failed: ${String(err)}`)
          })
        }
      }
    }

    if (event.type === "file.watcher.updated") {
      const props = event.properties as unknown as { path: string }
      await ns.handleFileChange(props.path)
    }
  }
}

export function createSystemTransformHook(ctx: HooksContext) {
  // Cache rule file contents (they don't change during a session)
  let delegationContent: string | null = null
  let hivemindCapContent: string | null = null

  return async (input: { sessionID?: string }, output: { system: string[] }) => {
    const { ns, log, rulesDir } = ctx

    if (!input.sessionID) return

    // Check if HIVE is awake for this session
    const isAwake = ns.hasCapabilities() && ns.isSessionAwake(input.sessionID)
    if (!isAwake) return

    const isCap = ns.isCapabilitySession(input.sessionID)
    const isCoordinator = ns.isCoordinatorSession(input.sessionID)
    log("info", `[HIVE] system.transform fired — sessionID: ${input.sessionID}, isCapability: ${isCap}, isCoordinator: ${isCoordinator}`)

    // Only inject HIVE context for coordinator and capability sessions
    if (!isCap && !isCoordinator) return

    output.system.push(ns.buildRoster())

    if (isCap) {
      // Capability: inject hivemind messaging rules + pending messages
      if (hivemindCapContent === null) {
        try {
          hivemindCapContent = fs.readFileSync(path.join(rulesDir, "hivemind-capabilities.md"), "utf8")
        } catch {
          hivemindCapContent = ""
        }
      }
      if (hivemindCapContent) output.system.push(hivemindCapContent)

      const capName = ns.resolveAgent(input.sessionID)
      const formatted = ns.formatMessages(capName)
      if (formatted) {
        output.system.push(formatted)
        log("info", `[HIVE] system.transform injected messages for ${capName}`)
      }
    } else if (isCoordinator) {
      // Coordinator: inject delegation rules + _coordinator messages + queue status
      if (delegationContent === null) {
        try {
          delegationContent = fs.readFileSync(path.join(rulesDir, "delegation.md"), "utf8")
        } catch {
          delegationContent = ""
        }
      }
      if (delegationContent) output.system.push(delegationContent)

      const coordMessages = ns.formatMessages("_coordinator")
      if (coordMessages) output.system.push(coordMessages)

      const queueStatus = ns.buildQueueStatus()
      if (queueStatus) output.system.push(queueStatus)
    }
    // else: non-HIVE subagent (general, explore, dreamcatcher) — nothing injected
  }
}

export function createChatMessageHook(ctx: HooksContext) {
  return async (input: { sessionID?: string; agent?: string }, _output: unknown) => {
    const { ns } = ctx
    if (input.sessionID && input.agent) {
      ns.registerSession(input.sessionID, input.agent)
    }
  }
}

export function createCompactionHook(ctx: HooksContext) {
  return async (_input: unknown, output: { context: string[] }) => {
    const { directory, capabilitiesPath, log } = ctx

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
  }
}

export function createToolDefinitionHook(ctx: HooksContext) {
  return async (input: { toolID: string }, output: { description: string; parameters: any }) => {
    if (input.toolID !== "task") return

    const { ns, log } = ctx
    if (!ns.hasCapabilities() || !ns.isHiveActive()) return
    log("info", `[HIVE] tool.definition hook fired for: ${input.toolID}`)
    const roster = ns.buildRoster()

    output.description += `\n\n## HIVE Capability Dispatch\n\nWhen dispatching to a capability (subagent_type starting with "capabilities/"), use \`background: true\` for non-blocking async execution. The capability will run independently and you will be notified when it completes.\n\n${roster}\n\nThe prompt you provide will be automatically enriched with the capability roster, pending HIVEmind messages, and relevant context. You do NOT need to manually inject these — just provide the task-specific instructions.`
  }
}

export function createToolExecuteBeforeHook(ctx: HooksContext) {
  return async (input: { tool: string; sessionID: string; callID: string }, output: { args: any }) => {
    if (input.tool !== "task") return

    const { log } = ctx
    const args = output.args
    const agentType = args?.subagent_type || ""

    if (!agentType.startsWith("capabilities/")) return

    const capName = agentType.replace("capabilities/", "")
    log("info", `[HIVE] tool.execute.before fired for capability: ${capName}, sessionID: ${input.sessionID}`)

    // Note: input.sessionID is the CALLER's session (coordinator), not the subagent's.
    // Do NOT register it as a capability session — that corrupts the session map.
    // The subagent's session will be registered via chat.message hook when it starts.
    //
    // Roster and pending messages are injected by system.transform (which fires
    // for the subagent's session after chat.message registers it). No prompt
    // enrichment needed here.
    log("info", `[HIVE] No prompt enrichment — system.transform handles roster + messages for ${capName}`)
  }
}

export function createToolExecuteAfterHook(ctx: HooksContext) {
  return async (input: { tool: string; sessionID: string; callID: string; args?: any }, output: { title: string; output: string; metadata: any }) => {
    const { ns, directory, log, getActiveSessionId } = ctx

    if (input.tool !== "task") return

    const agentType = input?.args?.subagent_type || ""
    if (!agentType.startsWith("capabilities/")) return

    const capName = agentType.replace("capabilities/", "")
    const { markCapabilityUsed } = await import("./lib/energy.js")
    markCapabilityUsed(directory, capName, getActiveSessionId())
    log("info", `[HIVE] Capability task completed: ${capName}`)

    // Check for pending messages that need routing
    const pendingInboxes = listPendingInboxes(directory)
    const needsRouting = pendingInboxes.filter(({ recipient }) => {
      if (recipient === "_coordinator") return true
      if (recipient === "_broadcast") return false
      return true
    })

    if (needsRouting.length > 0) {
      const lines = needsRouting.map(({ recipient, count }) => {
        if (recipient === "_coordinator") return `- _coordinator: ${count} message(s) [FOR YOU]`
        const capPath = path.join(directory, ".opencode/agents/capabilities", `${recipient}.md`)
        const exists = fs.existsSync(capPath)
        const status = exists ? "CAPABILITY EXISTS, INACTIVE" : "CAPABILITY DOES NOT EXIST (spawn signal)"
        return `- ${recipient}: ${count} message(s) [${status}]`
      })

      // Append routing info to the task output so the coordinator sees it
      output.output += `\n\n## HIVEmind — Routing Needed\n\n${lines.join("\n")}`
    }
  }
}
