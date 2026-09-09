/**
 * @hive/dsh-hivemind — the HIVEmind mailbox as a dsh Service + 4 tools.
 *
 * `ctx.hivemind` exposes the mailbox IO (`lib/hivemind.ts` — a VERBATIM port
 * of the OpenCode plugin's `src/lib/hivemind.ts`) with the delivery
 * transport swapped:
 *
 *  - MAILBOX IO stays file-based and byte-identical (durability + the
 *    cross-session queue). Every send writes the message file first.
 *  - LIVE DELIVERY is replaced: instead of OpenCode's NervousSystem injecting
 *    a `noReply` prompt over the SDK, the dsh port emits
 *    `ctx.emit("hivemind/message", …)` in-process. A resident recipient
 *    (a continuable capability session with a registered listener) receives
 *    the message live; the file write already happened, so a non-resident
 *    recipient picks the same message up from its inbox on next session
 *    start. NervousSystem.ts collapses into this service's event wiring.
 *  - `hive_retire`'s justified-retirement audit trail stays file-based
 *    (audit log, not transport).
 *
 * The 4 tools (`hive_signal` / `hive_listen` / `hive_sent` / `hive_retire`)
 * are registered via defineTool() (auto arg validation — the direct analogue
 * of OpenCode's `tool()`).
 */

import { Service } from "@deepseek-ai/cordis"
import z from "@deepseek-ai/schemastery"
import { defineTool } from "@deepseek-ai/dsh-tools"
import type { ContentBlock } from "@deepseek-ai/dsh-llm"

import {
  getInbox,
  sendMessage,
  markAllRead,
  markDelivered,
  recordBroadcastDelivery,
  listPendingInboxes,
  formatInboxForPrompt,
  sweepInboxes,
  sentBy,
  evaluateStaleness,
  staleSignals,
  isSpecialRecipient,
  retireMessage,
  readRetirementLog,
  STALE_AGE_DAYS,
  type HiveMessage,
  type InboxEntry,
  type SweepEntry,
  type SentEntry,
  type RetirementRecord,
  type Staleness,
} from "./lib/hivemind.js"

declare module "@deepseek-ai/cordis" {
  interface Context {
    hivemind: Hivemind
    tools: import("@deepseek-ai/dsh-tools").ToolRuntime
  }
  interface Events {
    /**
     * A HIVEmind message was sent and is available for LIVE delivery to a
     * resident recipient. The durable file write has ALREADY happened (this
     * event is the live path, not the record). A resident capability session
     * (a continuable child whose setup registered a listener) receives this
     * in-process; everyone else reads the file from their inbox on next
     * session start.
     * @mode emit
     */
    "hivemind/message"(msg: HiveMessage, filename: string): void
  }
}

const TEXT_OUT = {
  schema: { type: "string" },
  render: (_args: unknown, value: string): ContentBlock[] => [{ type: "text", text: value }],
} as const

/** Resolve the caller identity from a tool execution context. */
function resolveCaller(exec: { agent?: unknown }): { worker: string; sessionID: string } {
  const agent = exec.agent as { session?: { id?: string }; id?: string } | undefined
  const sessionID = agent?.session?.id ?? agent?.id ?? "unknown-session"
  // The sender NAME is the agent/preset id when there is one. A bare headless
  // session has no preset id (agent.id is a session UUID), and stamping that
  // as the sender produces an unreadable From line — fall back to the
  // coordinator address, the same way OpenCode treated non-capability senders.
  const rawId = agent?.id
  const worker = rawId && !rawId.startsWith("session-") ? rawId : "_coordinator"
  return { worker, sessionID }
}

/** One-line content excerpt for dashboard rendering (~90 chars). */
function excerpt(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim()
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat
}

export class Hivemind extends Service {
  static inject = ["tools"]
  static Config = z.object({
    // Workspace root (the dir containing `.opencode/`). Default: process cwd.
    directory: z.string().default(process.cwd()),
  })

  readonly directory: string

  constructor(ctx: import("@deepseek-ai/cordis").Context, config: { directory: string }) {
    super(ctx, "hivemind")
    this.directory = config.directory

    ctx.effect(() => {
      const d1 = ctx.tools.register(defineTool({
        name: "hive_signal",
        description:
          "Send a message to another capability in the HIVE ecosystem. Use this when you need information from, or want to share information with, another capability. " +
          "Messages are delivered in real-time if the recipient is active, otherwise queued for their next session. " +
          "Check the Active Capabilities list in your system prompt to see valid recipients.",
        parameters: {
          recipient: {
            type: "string", required: true,
            description: "Target capability name, '_broadcast' for all, or '_coordinator' to escalate",
          },
          type: {
            type: "string", required: true,
            enum: ["question", "info", "result", "request"],
            description: "Message type: question (need answer), info (FYI), result (answering prior question), request (ask coordinator to act)",
          },
          content: {
            type: "string", required: true,
            description: "Message content",
          },
        },
        output: TEXT_OUT,
        execute: async (args, exec) => {
          const { worker } = resolveCaller(exec)
          const { filename, delivered } = this.send(worker, args.recipient, args.type as HiveMessage["type"], args.content)
          const status = delivered
            ? "delivered in real-time"
            : "queued (recipient not currently active — will be delivered on their next session)"
          return `Message sent to \`${args.recipient}\` (${args.type}) — ${status}. File: ${filename}`
        },
      }))

      const d2 = ctx.tools.register(defineTool({
        name: "hive_listen",
        description:
          "Read pending messages from other capabilities addressed to you. Messages are also injected into your system prompt automatically, but use this tool to explicitly check for and acknowledge messages.",
        parameters: {
          mark_read: {
            type: "boolean",
            description: "If true, mark all messages as read after retrieving them",
          },
        },
        output: TEXT_OUT,
        execute: async (args, exec) => {
          const { worker } = resolveCaller(exec)
          const messages = this.read(worker)
          if (messages.length === 0) return "No pending messages."
          const formatted = formatInboxForPrompt(messages) ?? "No pending messages."
          let suffix = ""
          if (args.mark_read) {
            const n = this.acknowledge(worker)
            suffix = `\n\n(${n} message(s) marked as read.)`
          }
          return formatted + suffix
        },
      }))

      const d3 = ctx.tools.register(defineTool({
        name: "hive_sent",
        description:
          "Sender-side queue dashboard: every message YOU sent that was never read, with per-message staleness so live is told from sediment. " +
          "Broadcasts report their aggregate receipt (delivered to N sessions live). Status is read from the message FILE on disk: " +
          "'delivered, unread' means injected live but never acknowledged; 'pending' means never reached. " +
          "Stale (sediment) messages are excluded from delivery but NOT deleted — retire them explicitly with hive_retire.",
        parameters: {},
        output: TEXT_OUT,
        execute: async (_args, exec) => {
          const { worker } = resolveCaller(exec)
          return this.buildSentView(worker)
        },
      }))

      const d4 = ctx.tools.register(defineTool({
        name: "hive_retire",
        description:
          "Retire stale HIVEmind messages: MOVE them out of the active inbox into retired/<recipient>/, with an INDIVIDUAL justification per message and an append-only audit trail. " +
          "This is NOT deletion and NOT bulk-mark-read — a retired message is preserved, inspectable, and the audit entry records WHY (which staleness signal fired, who retired it, when). " +
          "Call with NO message argument to DRY-RUN: lists every stale message the sweep finds with its signal(s), changing nothing. " +
          "Then retire a named subset by passing their filenames. A reason is REQUIRED to retire. " +
          "Staleness signals: dissolved-sender (sender capability no longer on disk — STRONG), age (pending > 30 days — WEAK, surfaced but never sufficient alone for auto-exclusion).",
        parameters: {
          messages: {
            type: "array",
            items: { type: "string" },
            description: "Filenames to retire, e.g. [\"hive-infra/msg_20260710_abc.json\"] (recipient/file). Omit to dry-run: list all stale candidates without touching anything.",
          },
          reason: {
            type: "string",
            description: "REQUIRED when retiring. The justification recorded in the audit trail for every message in this batch, e.g. 'sender dissolved, question moot'. Retiring without a reason is refused.",
          },
          include_age_only: {
            type: "boolean",
            description: "Include messages whose ONLY signal is age (weak). Default false: the dry-run and retirement act only on STRONG-signal (dissolved-sender) messages unless you opt in. Age alone is sediment, not proof of mootness.",
          },
        },
        output: TEXT_OUT,
        execute: async (args, exec) => {
          const { worker } = resolveCaller(exec)
          return this.retire(worker, args.messages as string[] | undefined, args.reason, args.include_age_only === true)
        },
      }))

      return () => { d1(); d2(); d3(); d4() }
    })
  }

  // ── mailbox IO (verbatim lib) ─────────────────────────────────────────────

  read = (capabilityName: string, groupId?: string): InboxEntry[] =>
    getInbox(this.directory, capabilityName, groupId)
  acknowledge = (capabilityName: string, groupId?: string): number =>
    markAllRead(this.directory, capabilityName, groupId)
  pending = (groupId?: string) => listPendingInboxes(this.directory, groupId)
  sweep = (groupId?: string, now?: Date): SweepEntry[] => sweepInboxes(this.directory, groupId, now)
  sentBy = (sender: string, opts?: { unreadOnly?: boolean; now?: Date }): SentEntry[] =>
    sentBy(this.directory, sender, opts)
  retirementLog = (): Record<string, unknown>[] => readRetirementLog(this.directory)
  evaluateStaleness = (msg: HiveMessage, now?: Date): Staleness =>
    evaluateStaleness(this.directory, msg, now)

  // ── send + live delivery ──────────────────────────────────────────────────

  /**
   * Send a message: write the durable file FIRST (the cross-session queue),
   * then emit `hivemind/message` for any RESIDENT recipient. The event is the
   * live path — a resident continuable capability session with a registered
   * listener receives it in-process; a non-resident recipient picks the same
   * message up from its inbox file on next session start.
   *
   * Returns { filename, delivered } — `delivered` is true when the file was
   * written (durability is the guarantee); live delivery is a best-effort
   * side effect, reported via listeners flipping the file to `delivered`.
   */
  send = (
    sender: string,
    recipient: string,
    type: HiveMessage["type"],
    content: string,
    groupId?: string
  ): { filename: string; delivered: boolean } => {
    if (recipient.startsWith("_") && !isSpecialRecipient(recipient)) {
      throw new Error(
        `Refused: unknown special recipient "${recipient}". Only _coordinator and _broadcast are legal special addresses (I-033).`
      )
    }
    // 1. Durability FIRST: the file write is the cross-session queue. It
    //    always happens, before any live attempt.
    const filename = sendMessage(this.directory, { sender, recipient, type, content, groupId })
    // Read the envelope back so the event carries the exact persisted message.
    const entries = getInbox(this.directory, recipient)
    const msg = entries.find((e) => e.file === filename)?.msg

    // 2. Live delivery: emit `hivemind/message`. A RESIDENT recipient (a
    //    continuable capability session whose setup registered a listener
    //    that calls markDelivered) flips the file to `delivered`
    //    synchronously inside the emit. If nothing is resident, the file
    //    stays `pending` and `delivered` is false — the tool then honestly
    //    reports "queued", never "delivered in real-time" (W-119: a queued
    //    message must not masquerade as a live hit).
    let delivered = false
    if (msg) {
      this.ctx.emit("hivemind/message", msg, filename)
      const after = getInbox(this.directory, recipient).find((e) => e.file === filename)?.msg
      delivered = after?.status === "delivered"
    }
    return { filename, delivered }
  }

  /** Flip a live-delivered file's status (called by resident listeners). */
  markDelivered = (recipient: string, file: string): boolean =>
    markDelivered(this.directory, recipient, file)
  recordBroadcastDelivery = (file: string, sessionID: string): boolean =>
    recordBroadcastDelivery(this.directory, file, sessionID)

  // ── dashboards ────────────────────────────────────────────────────────────

  /** Sender-side unread dashboard (verbatim OpenCode shape). */
  buildSentView = (sender: string, groupID?: string): string => {
    const entries = sentBy(this.directory, sender, { unreadOnly: true }).filter(
      (e) => groupID === undefined || e.msg.groupId === groupID
    )
    if (entries.length === 0) {
      return `No unread messages sent by ${sender}${groupID ? " in this session group" : ""}.`
    }
    const live = entries.filter((e) => !e.staleness.stale)
    const stale = entries.filter((e) => e.staleness.stale)
    const render = (e: SentEntry): string => {
      const m = e.msg
      const sigs = staleSignals(e.staleness)
      const sigStr = sigs.length > 0 ? ` [stale: ${sigs.join(", ")}]` : ""
      const ageDays = Math.floor((Date.now() - new Date(m.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      const broadcastNote =
        m.recipient === "_broadcast" ? ` — delivered to ${(m.deliveredTo ?? []).length} session(s) live` : ""
      const statusNote = m.status === "delivered" ? "delivered, unread" : "pending"
      return (
        `- → \`${m.recipient}\` (${m.type}, ${m.timestamp.slice(0, 10)}, ${ageDays}d ago): ` +
        `${statusNote}${broadcastNote}${sigStr}\n  ${excerpt(m.content)}`
      )
    }
    const lines = [
      `## HIVEmind — Unread messages sent by ${sender}`,
      ``,
      `${live.length} live, ${stale.length} stale (sediment). Status read from disk; "delivered, unread" = injected live but never acknowledged.`,
      ``,
    ]
    if (live.length > 0) lines.push(`### Live`, ...live.map(render), ``)
    if (stale.length > 0) {
      lines.push(`### Stale (excluded from delivery, NOT deleted — retire with hive_retire)`, ...stale.map(render))
    }
    return lines.join("\n")
  }

  /**
   * Retire stale messages (dry-run with no `messages`), or move a named batch
   * into retired/<recipient>/ with an individual audit entry per file.
   * Mirrors the OpenCode tool's contract exactly.
   */
  retire = (
    retiredBy: string,
    messages: string[] | undefined,
    reason: string | undefined,
    includeAgeOnly: boolean
  ): string => {
    const sweep = this.sweep().filter((e) => {
      if (e.staleness.stale) return true // STRONG signal (dissolved-sender)
      if (includeAgeOnly && e.staleness.weak.includes("age")) return true
      return false
    })

    // Dry-run: no messages named.
    if (!messages || messages.length === 0) {
      if (sweep.length === 0) return "No stale messages found."
      const lines = [`Stale message candidates (${sweep.length}):`, ``]
      for (const e of sweep) {
        const sigs = staleSignals(e.staleness).join(", ")
        lines.push(`- \`${e.recipient}/${e.file}\` — from \`${e.msg.sender}\` (${e.msg.type}, ${e.msg.timestamp.slice(0, 10)}) [${sigs}]`)
        lines.push(`  ${excerpt(e.msg.content)}`)
      }
      lines.push(``, `Retire a subset by passing their \`recipient/file\` paths in \`messages\` with a required \`reason\`.`)
      return lines.join("\n")
    }

    // Retiring requires a justification.
    if (!reason || reason.trim() === "") {
      return "Refused: a `reason` is REQUIRED to retire messages — the audit trail must justify each retirement individually."
    }

    const byKey = new Map(sweep.map((e) => [`${e.recipient}/${e.file}`, e]))
    const results: string[] = []
    for (const key of messages) {
      const entry = byKey.get(key)
      if (!entry) {
        results.push(`- ✗ \`${key}\` — not a stale candidate (or already retired)`)
        continue
      }
      const rec: RetirementRecord = retireMessage(this.directory, entry.recipient, entry.file, {
        signals: staleSignals(entry.staleness),
        retiredBy,
        reason,
      })
      results.push(rec.ok ? `- ✓ \`${key}\` — ${rec.detail}` : `- ✗ \`${key}\` — ${rec.detail}`)
    }
    return [`Retirement complete (reason: "${reason}"):`, ``, ...results].join("\n")
  }
}

export default Hivemind

// dsh loader contract: the loader applies the DEFAULT export only (W-045) —
// inject rides on the class as `static inject` above.
export {
  getInbox,
  sendMessage,
  markAllRead,
  markDelivered,
  recordBroadcastDelivery,
  listPendingInboxes,
  formatInboxForPrompt,
  sweepInboxes,
  sentBy,
  evaluateStaleness,
  staleSignals,
  isSpecialRecipient,
  retireMessage,
  readRetirementLog,
  STALE_AGE_DAYS,
}
export type { HiveMessage, InboxEntry, SweepEntry, SentEntry, RetirementRecord, Staleness }
