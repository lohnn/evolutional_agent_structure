/**
 * HIVE custom tools: hive_dispatch, hive_signal, hive_listen
 */

import { tool } from "@opencode-ai/plugin"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { formatInboxForPrompt } from "./lib/hivemind.js"
import type { NervousSystem } from "./lib/nervous-system.js"

type Client = ReturnType<typeof createOpencodeClient>
type LogFn = (level: "info" | "debug" | "error" | "warn", message: string, extra?: Record<string, unknown>) => void

export function createHiveTools(
  ns: NervousSystem,
  client: Client,
  log: LogFn
) {
  return {
    hive_dispatch: tool({
      description: "Launch or resume a capability session asynchronously. Returns immediately without blocking — the coordinator can continue working while the capability runs in the background. Use this instead of the Task tool when you want non-blocking parallel execution. The capability will receive the prompt and run independently; when it finishes with pending messages, the coordinator will be notified automatically.",
      args: {
        capability: tool.schema.string().describe("Short name of the capability to dispatch (e.g. 'kinder-scheduler')"),
        description: tool.schema.string().describe("Very short (3-8 words) description of the task being dispatched — used as the session title"),
        prompt: tool.schema.string().describe("Full enriched context and instructions for the capability"),
        resume: tool.schema.boolean().optional().describe("If true (default), attempt to find and resume an existing idle session for this capability"),
      },
      async execute(args, context) {
        if (ns.isCapabilitySession(context.sessionID)) {
          return "Error: hive_dispatch is only available to coordinator (non-capability) sessions."
        }

        const shouldResume = args.resume !== false
        let sessionID: string | undefined
        let resumed = false

        if (shouldResume) {
          sessionID = ns.findIdleSession(args.capability)
          if (sessionID) {
            // Validate session still exists on the server (may be stale after restart)
            try {
              await client.session.get({ path: { id: sessionID } })
              resumed = true
            } catch {
              sessionID = undefined // stale session, create new
            }
          }
        }

        const title = `[HIVE] ${args.capability}: ${args.description}`

        if (!sessionID) {
          const created = await client.session.create({
            body: { title },
          })
          sessionID = (created as { data?: { id?: string }; id?: string })?.data?.id
            || (created as { id?: string })?.id
          if (!sessionID) return `Error: failed to create session for ${args.capability}`
        }

        // Pre-register the session so the idle handler can identify it
        ns.registerSession(sessionID, `capabilities/${args.capability}`)
        ns.setParent(sessionID, context.sessionID)
        log("info", `hive_dispatch: launching ${args.capability} on session ${sessionID} (${resumed ? "resumed" : "new"}, parent=${context.sessionID})`)

        try {
          await client.session.promptAsync({
            path: { id: sessionID },
            body: {
              agent: `capabilities/${args.capability}`,
              parts: [{ type: "text", text: args.prompt }],
            },
          })
        } catch (err) {
          if (!resumed) throw err
          // Resumed session may be stale (server restarted). Fall back to new session.
          log("info", `hive_dispatch: resume failed for ${sessionID}, creating new session`)
          const created = await client.session.create({
            body: { title },
          })
          sessionID = (created as { data?: { id?: string }; id?: string })?.data?.id
            || (created as { id?: string })?.id
          if (!sessionID) return `Error: failed to create fallback session for ${args.capability}`
          resumed = false
          ns.registerSession(sessionID, `capabilities/${args.capability}`)
          ns.setParent(sessionID, context.sessionID)
          await client.session.promptAsync({
            path: { id: sessionID },
            body: {
              agent: `capabilities/${args.capability}`,
              parts: [{ type: "text", text: args.prompt }],
            },
          })
        }

        return `Dispatched ${args.capability} (session: ${sessionID}, ${resumed ? "resumed" : "new"}). Running asynchronously.`
      },
    }),

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
