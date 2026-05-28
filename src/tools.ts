/**
 * HIVE custom tools: hive_signal, hive_listen
 */

import { tool } from "@opencode-ai/plugin"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { formatInboxForPrompt } from "./lib/hivemind.js"
import type { NervousSystem } from "./lib/nervous-system.js"

type Client = ReturnType<typeof createOpencodeClient>
type LogFn = (level: "info" | "debug" | "error" | "warn", message: string, extra?: Record<string, unknown>) => void

export function createHiveTools(
  ns: NervousSystem,
  _client: Client,
  _log: LogFn
) {
  return {
    hive_signal: tool({
      description: "Send a message to another capability in the HIVE ecosystem. Use this when you need information from, or want to share information with, another capability. Messages are delivered in real-time if the recipient is active, otherwise queued for their next session. Check the Active Capabilities list in your system prompt to see valid recipients.",
      args: {
        recipient: tool.schema.string().describe("Target capability name, '_broadcast' for all, or '_coordinator' to escalate"),
        type: tool.schema.enum(["question", "info", "result", "request"]).describe("Message type: question (need answer), info (FYI), result (answering prior question), request (ask coordinator to act)"),
        content: tool.schema.string().describe("Message content"),
      },
      async execute(args, context) {
        const sender = ns.resolveAgent(context.sessionID, context.agent)
        const { filename, delivered } = await ns.send(sender, args.recipient, args.type, args.content, context.sessionID)

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
        const agent = ns.resolveAgent(context.sessionID, context.agent)
        const isCoordinator = !ns.isCapabilitySession(context.sessionID)
        
        // Coordinator reads from both its agent inbox and _coordinator inbox
        let pending = ns.readMessages(agent)
        if (isCoordinator) {
          pending = [...pending, ...ns.readMessages("_coordinator")]
        }

        if (pending.length === 0) return "No pending messages."

        const formatted = formatInboxForPrompt(pending)
        if (args.mark_read) {
          ns.acknowledgeMessages(agent)
          if (isCoordinator) ns.acknowledgeMessages("_coordinator")
        }

        return formatted || "No pending messages."
      },
    }),
  }
}
