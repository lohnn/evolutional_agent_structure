/**
 * HIVE event hooks: session tracking, energy tick, hot-reload, system transform, compaction
 */

import path from "path"
import fs from "fs"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { snapshotAgentsMtime, snapshotChanged } from "./lib/reload.js"
import { tickEnergy, getCapabilitiesSummary } from "./lib/energy.js"
import { getInbox, formatInboxForPrompt, listPendingInboxes } from "./lib/hivemind.js"
import type { NervousSystem } from "./lib/nervous-system.js"

type Client = ReturnType<typeof createOpencodeClient>
type LogFn = (level: "info" | "debug" | "error" | "warn", message: string, extra?: Record<string, unknown>) => void

export interface HooksContext {
  ns: NervousSystem
  client: Client
  directory: string
  projectAgentsPath: string
  capabilitiesPath: string
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
  return async (input: { sessionID?: string }, output: { system: string[] }) => {
    const { ns } = ctx

    output.system.push(ns.buildRoster())

    if (!input.sessionID) return

    if (ns.isCapabilitySession(input.sessionID)) {
      // Capability: inject its own pending messages
      const formatted = ns.formatMessages(ns.resolveAgent(input.sessionID))
      if (formatted) output.system.push(formatted)
    } else {
      // Coordinator: inject _coordinator messages + queue status dashboard
      const coordMessages = ns.formatMessages("_coordinator")
      if (coordMessages) output.system.push(coordMessages)

      const queueStatus = ns.buildQueueStatus()
      if (queueStatus) output.system.push(queueStatus)
    }
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

export function createToolExecuteAfterHook(ctx: HooksContext) {
  return async (input: { tool: string; args?: { subagent_type?: string } }) => {
    const { ns, directory, log, getActiveSessionId } = ctx

    if (input.tool === "task") {
      const agentType = input?.args?.subagent_type || ""
      if (agentType.startsWith("capabilities/")) {
        const capName = agentType.replace("capabilities/", "")
        const { markCapabilityUsed } = await import("./lib/energy.js")
        markCapabilityUsed(directory, capName, getActiveSessionId())
        log("info", `Marked capability as used: ${capName}`)

        const pending = getInbox(directory, capName)
        if (pending.length > 0) {
          const formatted = formatInboxForPrompt(pending)
          log("info", `HIVEmind: ${pending.length} pending message(s) after ${capName} ran`, { formatted })
        }
      }
    }
  }
}
