import path from "path"
import fs from "fs"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { getInbox, sendMessage, markAllRead, listPendingInboxes, formatInboxForPrompt } from "./hivemind.js"
import { readMdFile } from "./frontmatter.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionInfo {
  agent: string
  active: boolean
  /** The coordinator session that owns this session's dispatch group */
  groupID?: string
}

type Client = ReturnType<typeof createOpencodeClient>

// ── Nervous System ────────────────────────────────────────────────────────────

/**
 * HIVEmind Nervous System — manages session tracking, message routing,
 * real-time delivery, and coordinator awareness.
 */
export class NervousSystem {
  private sessionMap = new Map<string, SessionInfo>()
  private capabilitySessionMap = new Map<string, string>()
  private knownCapabilityFiles = new Set<string>()
  private awakeSessions = new Set<string>()
  private client: Client
  private directory: string
  private capabilitiesPath: string
  private stateFilePath: string

  constructor(client: Client, directory: string) {
    this.client = client
    this.directory = directory
    this.capabilitiesPath = path.join(directory, ".opencode/agents/capabilities")
    this.stateFilePath = path.join(directory, ".opencode/hivemind/.nervous-system-state.json")
    this.initKnownCapabilities()
    this.loadPersistedState()
  }

  private loadPersistedState(): void {
    try {
      const raw = fs.readFileSync(this.stateFilePath, "utf8")
      const state = JSON.parse(raw)
      if (state.sessions) {
        for (const entry of state.sessions) {
          this.sessionMap.set(entry.id, { agent: entry.agent, active: false, groupID: entry.groupID })
          if (entry.agent.startsWith("capabilities/")) {
            this.capabilitySessionMap.set(shortName(entry.agent), entry.id)
          }
        }
      }
      if (state.awakeSessions) {
        for (const id of state.awakeSessions) {
          this.awakeSessions.add(id)
        }
      }
    } catch {
      // no state file yet, fine
    }
  }

  private persistState(): void {
    const sessions: { id: string; agent: string; groupID?: string }[] = []
    for (const [id, info] of this.sessionMap.entries()) {
      sessions.push({ id, agent: info.agent, groupID: info.groupID })
    }
    const awakeSessions = Array.from(this.awakeSessions)
    try {
      fs.writeFileSync(this.stateFilePath, JSON.stringify({ sessions, awakeSessions }, null, 2), "utf8")
    } catch {
      // ignore write failures
    }
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

  /** Returns true if any non-template capability files exist (HIVE is awake) */
  hasCapabilities(): boolean {
    return this.knownCapabilityFiles.size > 0
  }

  /** Returns true if any session is currently HIVE-awake */
  isHiveActive(): boolean {
    return this.awakeSessions.size > 0
  }

  /** Mark a session as HIVE-awake (persists across restarts) */
  awakenSession(sessionID: string): void {
    this.awakeSessions.add(sessionID)
    this.persistState()
  }

  /** Check if a session (or its group coordinator) is HIVE-awake */
  isSessionAwake(sessionID: string): boolean {
    if (this.awakeSessions.has(sessionID)) return true
    // Inherit from group coordinator
    const info = this.sessionMap.get(sessionID)
    if (info?.groupID && info.groupID !== sessionID) {
      return this.awakeSessions.has(info.groupID)
    }
    return false
  }

  /** Prune awake sessions older than maxAge (default 7 days) */
  pruneAwakeSessions(keepSessionIDs: Set<string>): void {
    for (const id of this.awakeSessions) {
      if (!keepSessionIDs.has(id)) {
        this.awakeSessions.delete(id)
      }
    }
    this.persistState()
  }

  // ── Session tracking ──────────────────────────────────────────────────────

  registerSession(sessionID: string, agent: string): void {
    const existing = this.sessionMap.get(sessionID)
    const groupID = existing?.groupID || (agent.startsWith("capabilities/") ? undefined : sessionID)
    this.sessionMap.set(sessionID, { agent, active: true, groupID })
    if (agent.startsWith("capabilities/")) {
      this.capabilitySessionMap.set(shortName(agent), sessionID)
    }
    this.persistState()
  }

  /** Assign a capability session to a coordinator's dispatch group */
  setParent(childSessionID: string, coordinatorSessionID: string): void {
    const info = this.sessionMap.get(childSessionID)
    if (info) {
      info.groupID = coordinatorSessionID
    }
    // Also ensure the coordinator itself is in its own group
    const coordInfo = this.sessionMap.get(coordinatorSessionID)
    if (coordInfo && !coordInfo.groupID) {
      coordInfo.groupID = coordinatorSessionID
    }
    this.persistState()
  }

  /** Get the group (coordinator session ID) for a given session */
  getGroupID(sessionID: string): string | undefined {
    return this.sessionMap.get(sessionID)?.groupID
  }

  /** Returns session ID if the capability has a known session AND it is currently idle */
  findIdleSession(capabilityName: string): string | undefined {
    const sessionID = this.capabilitySessionMap.get(capabilityName)
    if (!sessionID) return undefined
    const info = this.sessionMap.get(sessionID)
    if (info && !info.active) return sessionID
    return undefined
  }

  /** Returns session ID for any active non-capability session (coordinator) */
  findCoordinatorSession(): string | undefined {
    for (const [sessionID, info] of this.sessionMap.entries()) {
      if (!info.agent.startsWith("capabilities/") && info.active) return sessionID
    }
    return undefined
  }

  /** Returns the coordinator session that should be woken for a given child session.
   *  Uses groupID if available, otherwise falls back to any known coordinator. */
  getCoordinatorSessionFor(childSessionID?: string): string | undefined {
    // If we know the group, the groupID IS the coordinator session
    if (childSessionID) {
      const info = this.sessionMap.get(childSessionID)
      if (info?.groupID && this.sessionMap.has(info.groupID)) return info.groupID
    }
    // Fallback: any non-capability session
    for (const [sessionID, info] of this.sessionMap.entries()) {
      if (!info.agent.startsWith("capabilities/")) return sessionID
    }
    return undefined
  }

  /** @deprecated Use getCoordinatorSessionFor() instead */
  getCoordinatorSession(): string | undefined {
    return this.getCoordinatorSessionFor()
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

  /** Returns true if this session is a coordinator (primary agent, not a subagent or capability) */
  isCoordinatorSession(sessionID: string): boolean {
    const info = this.sessionMap.get(sessionID)
    if (!info) return false
    // Capabilities are not coordinators
    if (info.agent.startsWith("capabilities/")) return false
    // Known subagent types are not coordinators
    const subagentTypes = ["general", "explore", "dreamcatcher", "scout"]
    if (subagentTypes.includes(info.agent)) return false
    // Everything else (build, hive, etc.) is a coordinator
    return true
  }

  // ── Message sending + delivery ────────────────────────────────────────────

  async send(sender: string, recipient: string, type: "question" | "info" | "result" | "request", content: string, senderSessionID?: string): Promise<{ filename: string; delivered: boolean }> {
    const filename = sendMessage(this.directory, { sender, recipient, type, content })
    const senderGroupID = senderSessionID ? this.getGroupID(senderSessionID) : undefined

    let delivered = false

    if (recipient === "_broadcast") {
      for (const [sessionID, info] of this.sessionMap.entries()) {
        if (info.active && shortName(info.agent) !== sender) {
          // Only broadcast within the same group if sender has a group
          if (senderGroupID && info.groupID && info.groupID !== senderGroupID) continue
          this.injectIntoSession(sessionID, `[HIVEmind broadcast from ${sender}] (${type}): ${content}`).catch(() => {})
        }
      }
      delivered = true
    } else if (recipient === "_coordinator") {
      // Deliver to this sender's coordinator (via group)
      const coordSessionID = senderGroupID || this.findCoordinatorSession()
      if (coordSessionID) {
        try {
          await this.injectIntoSession(coordSessionID, `[HIVEmind] Message from ${sender} (${type}): ${content}`)
          delivered = true
        } catch {
          // queued fallback
        }
      }
    } else {
      // Named capability: try real-time delivery within the same group; if not active, wake coordinator
      delivered = await this.deliverToRecipient(recipient, sender, type, content, senderGroupID)
      if (!delivered) {
        this.wakeCoordinator(`Capability ${recipient} received a queued message from ${sender} (${type}) but has no active session. Routing needed.`, senderSessionID).catch(() => {})
      }
    }

    return { filename, delivered }
  }

  /** Wake the coordinator with a routing notification. Uses promptAsync which queues safely even if the session is busy. */
  async wakeCoordinator(reason: string, childSessionID?: string): Promise<string> {
    const coordSessionID = this.getCoordinatorSessionFor(childSessionID)
    if (!coordSessionID) {
      return `NO_COORDINATOR_SESSION (sessionMap size=${this.sessionMap.size})`
    }
    try {
      await this.client.session.promptAsync({
        path: { id: coordSessionID },
        body: { parts: [{ type: "text", text: `[HIVEmind] ${reason}` }] },
      })
      return `SENT_TO_${coordSessionID}`
    } catch (err) {
      return `FAILED: ${String(err)}`
    }
  }

  private async deliverToRecipient(recipient: string, sender: string, type: string, content: string, senderGroupID?: string): Promise<boolean> {
    for (const [sessionID, info] of this.sessionMap.entries()) {
      if (shortName(info.agent) === recipient && info.active) {
        // If sender has a group, only deliver to sessions in the same group
        if (senderGroupID && info.groupID && info.groupID !== senderGroupID) continue
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
