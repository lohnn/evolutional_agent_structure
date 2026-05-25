import path from "path"
import fs from "fs"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { getInbox, sendMessage, markAllRead, listPendingInboxes, formatInboxForPrompt } from "./hivemind.js"
import { readMdFile } from "./frontmatter.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionInfo {
  agent: string
  active: boolean
}

type Client = ReturnType<typeof createOpencodeClient>

// ── Nervous System ────────────────────────────────────────────────────────────

/**
 * HIVEmind Nervous System — manages session tracking, message routing,
 * real-time delivery, and coordinator awareness.
 */
export class NervousSystem {
  private sessionMap = new Map<string, SessionInfo>()
  private knownCapabilityFiles = new Set<string>()
  private client: Client
  private directory: string
  private capabilitiesPath: string

  constructor(client: Client, directory: string) {
    this.client = client
    this.directory = directory
    this.capabilitiesPath = path.join(directory, ".opencode/agents/capabilities")
    this.initKnownCapabilities()
  }

  private initKnownCapabilities(): void {
    try {
      for (const f of fs.readdirSync(this.capabilitiesPath)) {
        if (f.endsWith(".md") && !f.startsWith("_")) {
          this.knownCapabilityFiles.add(f)
        }
      }
    } catch {
      // ignore
    }
  }

  // ── Session tracking ──────────────────────────────────────────────────────

  registerSession(sessionID: string, agent: string): void {
    this.sessionMap.set(sessionID, { agent, active: true })
  }

  markActive(sessionID: string): void {
    const info = this.sessionMap.get(sessionID)
    if (info) info.active = true
  }

  markIdle(sessionID: string): void {
    const info = this.sessionMap.get(sessionID)
    if (info) info.active = false
  }

  /** Resolve the short agent name for a session (prefers session map over raw context.agent) */
  resolveAgent(sessionID: string, fallbackAgent?: string): string {
    const info = this.sessionMap.get(sessionID)
    const raw = info?.agent || fallbackAgent || "unknown"
    return shortName(raw)
  }

  isCapabilitySession(sessionID: string): boolean {
    const info = this.sessionMap.get(sessionID)
    return info?.agent?.startsWith("capabilities/") ?? false
  }

  // ── Message sending + delivery ────────────────────────────────────────────

  async send(sender: string, recipient: string, type: "question" | "info" | "result" | "request", content: string): Promise<{ filename: string; delivered: boolean }> {
    const filename = sendMessage(this.directory, { sender, recipient, type, content })

    let delivered = false

    if (recipient === "_broadcast") {
      for (const [sessionID, info] of this.sessionMap.entries()) {
        if (info.active && shortName(info.agent) !== sender) {
          this.injectIntoSession(sessionID, `[HIVEmind broadcast from ${sender}] (${type}): ${content}`).catch(() => {})
        }
      }
      delivered = true
    } else if (recipient !== "_coordinator") {
      delivered = await this.deliverToRecipient(recipient, sender, type, content)
    }

    return { filename, delivered }
  }

  private async deliverToRecipient(recipient: string, sender: string, type: string, content: string): Promise<boolean> {
    for (const [sessionID, info] of this.sessionMap.entries()) {
      if (shortName(info.agent) === recipient && info.active) {
        try {
          await this.injectIntoSession(sessionID, `[HIVEmind] Message from ${sender} (${type}): ${content}`)
          return true
        } catch {
          // fall through to queued
        }
      }
    }
    return false
  }

  private async injectIntoSession(sessionID: string, text: string): Promise<void> {
    await this.client.session.prompt({
      path: { id: sessionID },
      body: { noReply: true, parts: [{ type: "text", text }] },
    })
  }

  // ── Reading messages ──────────────────────────────────────────────────────

  readMessages(capabilityName: string): ReturnType<typeof getInbox> {
    return getInbox(this.directory, capabilityName)
  }

  acknowledgeMessages(capabilityName: string): void {
    markAllRead(this.directory, capabilityName)
  }

  formatMessages(capabilityName: string): string | null {
    const pending = getInbox(this.directory, capabilityName)
    return formatInboxForPrompt(pending)
  }

  // ── Coordinator awareness ─────────────────────────────────────────────────

  /**
   * Build a status summary of all pending messages for the coordinator's system prompt.
   * Shows which capabilities are waiting, active, or nonexistent.
   */
  buildQueueStatus(): string | null {
    const pendingInboxes = listPendingInboxes(this.directory)
    if (pendingInboxes.length === 0) return null

    const lines: string[] = []
    for (const { recipient, count } of pendingInboxes) {
      const capFile = path.join(this.capabilitiesPath, `${recipient}.md`)
      const exists = fs.existsSync(capFile)

      let active = false
      for (const [, info] of this.sessionMap.entries()) {
        if (shortName(info.agent) === recipient && info.active) {
          active = true
          break
        }
      }

      if (!exists) {
        lines.push(`- **${recipient}** — ${count} message(s) — \u26A0 CAPABILITY DOES NOT EXIST (spawn signal)`)
      } else if (active) {
        lines.push(`- **${recipient}** — ${count} message(s) — session active (will receive automatically)`)
      } else {
        lines.push(`- **${recipient}** — ${count} message(s) — \u23F3 waiting (needs delegation to receive)`)
      }
    }

    if (lines.length === 0) return null
    return `## HIVEmind — Message Queue Status\n\n${lines.join("\n")}\n\nCapabilities marked \u23F3 have unread messages that will be delivered when you next delegate to them. Capabilities marked \u26A0 need to be spawned.`
  }

  // ── New capability detection ──────────────────────────────────────────────

  /**
   * Check if a file watcher path represents a new capability.
   * If so, notify all active sessions and return the capability name.
   */
  async handleFileChange(filePath: string): Promise<string | null> {
    if (!filePath.includes(".opencode/agents/capabilities/") || !filePath.endsWith(".md")) {
      return null
    }

    const filename = path.basename(filePath)
    if (filename.startsWith("_") || this.knownCapabilityFiles.has(filename)) {
      return null
    }

    this.knownCapabilityFiles.add(filename)
    const capName = filename.replace(".md", "")

    let desc = "(no description)"
    try {
      const { frontmatter } = readMdFile(filePath)
      desc = (frontmatter.description as string) || desc
    } catch {
      // ignore
    }

    const notification = `[HIVEmind] New capability available: ${capName} — ${desc}`
    for (const [sessionID, info] of this.sessionMap.entries()) {
      if (info.active) {
        this.injectIntoSession(sessionID, notification).catch(() => {})
      }
    }

    return capName
  }

  // ── Roster ────────────────────────────────────────────────────────────────

  buildRoster(): string {
    const lines: string[] = ["## Active Capabilities"]
    try {
      const files = fs.readdirSync(this.capabilitiesPath)
      for (const file of files) {
        if (!file.endsWith(".md") || file.startsWith("_")) continue
        const name = file.replace(".md", "")
        const { frontmatter } = readMdFile(path.join(this.capabilitiesPath, file))
        const desc = (frontmatter.description as string) || "(no description)"
        lines.push(`  ${name} — ${desc}`)
      }
    } catch {
      // no capabilities dir
    }
    if (lines.length === 1) lines.push("  (none)")
    return lines.join("\n")
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Strip "capabilities/" prefix */
export function shortName(agent: string): string {
  return agent.replace(/^capabilities\//, "")
}
