import path from "path"
import fs from "fs"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import {
  getInbox,
  sendMessage,
  markAllRead,
  listPendingInboxes,
  formatInboxForPrompt,
  markDelivered,
  recordBroadcastDelivery,
  sweepInboxes,
  sentBy,
  evaluateStaleness,
  staleSignals,
  type SweepEntry,
  type SentEntry,
} from "./hivemind.js"
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

    let groupID: string | undefined
    if (agent.startsWith("capabilities/")) {
      // Capability session: inherit groupID from disk-loaded entry if present,
      // otherwise auto-assign to the currently-active coordinator so that
      // isSessionAwake() can resolve awake-state via the coordinator's awakeSessions
      // entry. Without this, capability sessions have groupID=undefined and the
      // isSessionAwake inheritance path silently fails, blocking system.transform
      // injection for resumed sessions (SHADOW-003 follow-up).
      groupID = existing?.groupID ?? this.findCoordinatorSession()
      this.capabilitySessionMap.set(shortName(agent), sessionID)
    } else {
      // Non-capability (coordinator): its own sessionID is its groupID
      groupID = existing?.groupID ?? sessionID
    }

    this.sessionMap.set(sessionID, { agent, active: true, groupID })
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

  /** Returns session ID if the capability has a known session AND it is currently idle.
   *  capabilityName is normalized via shortName(), so "capabilities/X" and "X" both match.
   *  All session IDs are disk-persisted (.nervous-system-state.json) and loaded as
   *  active:false on construction, so this survives plugin restarts. */
  findIdleSession(capabilityName: string): string | undefined {
    const name = shortName(capabilityName)
    const sessionID = this.capabilitySessionMap.get(name)
    if (!sessionID) return undefined
    const info = this.sessionMap.get(sessionID)
    if (info && !info.active) return sessionID
    return undefined
  }

  /**
   * Returns the session ID for an idle capability session that belongs to the given
   * dispatch group (coordinator session). Falls back to the plain idle lookup when no
   * groupID is supplied. Used for group-scoped resumption (I-032): a capability launched
   * by coordinator A should be resumed by coordinator A.
   *
   * Scans the full sessionMap (not just capabilitySessionMap, which only keeps the most
   * recent session per capability) so a group's own idle session is found even when the
   * latest session for that capability belongs to a different group.
   */
  findIdleSessionInGroup(capabilityName: string, groupID?: string): string | undefined {
    const name = shortName(capabilityName)
    if (!groupID) return this.findIdleSession(capabilityName)
    for (const [sessionID, info] of this.sessionMap.entries()) {
      if (info.active) continue
      if (shortName(info.agent) !== name) continue
      if (info.groupID === groupID) return sessionID
    }
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
    const senderGroupID = senderSessionID ? this.getGroupID(senderSessionID) : undefined
    const filename = sendMessage(this.directory, { sender, recipient, type, content, groupId: senderGroupID })

    let delivered = false

    if (recipient === "_broadcast") {
      for (const [sessionID, info] of this.sessionMap.entries()) {
        if (info.active && shortName(info.agent) !== sender) {
          // Only broadcast within the same group if sender has a group
          if (senderGroupID && info.groupID && info.groupID !== senderGroupID) continue
          this.injectIntoSession(sessionID, `[HIVEmind broadcast from ${sender}] (${type}): ${content}`)
            .then(() => {
              // Aggregate receipt (WI-051 decision 3): one append per session
              // reached. No per-recipient structures — a count/list is enough.
              recordBroadcastDelivery(this.directory, filename, sessionID)
            })
            .catch(() => {})
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
          // W-119: the file must show it was delivered, not sit pending forever.
          markDelivered(this.directory, recipient, filename)
        } catch {
          // queued fallback
        }
      }
    } else {
      // Named capability: try real-time delivery within the same group; if not active, wake coordinator
      delivered = await this.deliverToRecipient(recipient, sender, type, content, senderGroupID)
      if (delivered) {
        // W-119: flip the FILE's status pending → delivered after the attempt
        // returned success. This changes only the status field — never which
        // session the message targeted (that is WI-070's surface).
        markDelivered(this.directory, recipient, filename)
      } else {
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

  /**
   * Public seam over injectIntoSession for plugin-internal notices that are
   * NOT HIVEmind messages (WI-081: the post-compaction dream-pointer digest).
   * Same noReply prompt path; callers handle their own guard logic and
   * error policy.
   */
  async injectNotice(sessionID: string, text: string): Promise<void> {
    return this.injectIntoSession(sessionID, text)
  }

  // ── Reading messages ──────────────────────────────────────────────────────

  readMessages(capabilityName: string, groupID?: string): ReturnType<typeof getInbox> {
    return getInbox(this.directory, capabilityName, groupID)
  }

  acknowledgeMessages(capabilityName: string, groupID?: string): number {
    return markAllRead(this.directory, capabilityName, groupID)
  }

  formatMessages(capabilityName: string, groupID?: string): string | null {
    const pending = getInbox(this.directory, capabilityName, groupID)
    return formatInboxForPrompt(pending)
  }

  // ── Coordinator awareness ─────────────────────────────────────────────────

  /**
   * Build a status summary of all pending messages for the coordinator's system
   * prompt. Shows which capabilities are waiting, active, or nonexistent — and
   * splits each count LIVE vs STALE (WI-051 D): a bare "N message(s)" becomes
   * "N live, M stale" so the coordinator can tell routable work from sediment
   * (dissolved senders, ancient pending) at a glance. Stale messages are
   * excluded from delivery but NOT deleted (SNG-020).
   *
   * The per-recipient line shape is shared with the two routing-needed blocks
   * in hooks.ts via formatRoutingNeeded() — those blocks had already drifted
   * slightly, so the shape now lives in ONE place (formatRecipientLines).
   *
   * @param groupID - When provided, only counts messages from this session group.
   *   The coordinator should pass its own groupID so it only sees routing work it owns.
   */
  buildQueueStatus(groupID?: string): string | null {
    const sweep = sweepInboxes(this.directory, groupID)
    if (sweep.length === 0) return null

    const lines = this.formatRecipientLines(sweep, { coordinatorView: true })
    if (lines.length === 0) return null
    return (
      `## HIVEmind — Message Queue Status\n\n${lines.join("\n")}\n\n` +
      `Capabilities marked ⏳ have unread messages that will be delivered when you next delegate to them. ` +
      `Capabilities marked ⚠ need to be spawned. ` +
      `Stale (sediment) messages are excluded from delivery but never auto-deleted — retire them explicitly with hive_retire.`
    )
  }

  /**
   * The shared per-recipient line renderer behind buildQueueStatus and the two
   * routing-needed hooks. Buckets each recipient's sweep entries into live vs
   * stale and renders one line per recipient. `coordinatorView` selects the
   * dashboard phrasing; the routing-needed hook lines carry their own
   * bracketed status instead.
   */
  private formatRecipientLines(
    sweep: SweepEntry[],
    opts: { coordinatorView: boolean }
  ): string[] {
    // Bucket by recipient, preserving first-seen order.
    const byRecipient = new Map<string, { live: number; stale: number }>()
    for (const entry of sweep) {
      const bucket = byRecipient.get(entry.recipient) ?? { live: 0, stale: 0 }
      if (entry.staleness.stale) bucket.stale++
      else bucket.live++
      byRecipient.set(entry.recipient, bucket)
    }

    const lines: string[] = []
    for (const [recipient, { live, stale }] of byRecipient) {
      const countStr = stale > 0 ? `${live} live, ${stale} stale` : `${live} message(s)`

      if (recipient === "_coordinator") {
        lines.push(`- **_coordinator** — ${countStr} — [FOR YOU]`)
        continue
      }

      const capFile = path.join(this.capabilitiesPath, `${recipient}.md`)
      const exists = fs.existsSync(capFile)

      let active = false
      for (const [, info] of this.sessionMap.entries()) {
        if (shortName(info.agent) === recipient && info.active) {
          active = true
          break
        }
      }

      if (opts.coordinatorView) {
        if (!exists) {
          lines.push(`- **${recipient}** — ${countStr} — ⚠ CAPABILITY DOES NOT EXIST (spawn signal)`)
        } else if (active) {
          lines.push(`- **${recipient}** — ${countStr} — session active (will receive automatically)`)
        } else {
          lines.push(`- **${recipient}** — ${countStr} — ⏳ waiting (needs delegation to receive)`)
        }
      } else {
        const status = exists ? "CAPABILITY EXISTS, INACTIVE" : "CAPABILITY DOES NOT EXIST (spawn signal)"
        lines.push(`- ${recipient}: ${countStr} [${status}]`)
      }
    }
    return lines
  }

  /**
   * The routing-needed block rendered by the two hooks.ts sites (session.idle
   * and tool.execute.after). ONE renderer so the two sites cannot drift again
   * (they had: the idle site wrapped lines in a "Capability X completed."
   * preamble while the task-output site appended a bare block). Returns null
   * when there is nothing to route.
   */
  formatRoutingNeeded(groupID?: string): string | null {
    const sweep = sweepInboxes(this.directory, groupID)
    const needsRouting = sweep.filter((e) => e.recipient !== "_broadcast")
    if (needsRouting.length === 0) return null
    const lines = this.formatRecipientLines(needsRouting, { coordinatorView: false })
    return lines.join("\n")
  }

  /**
   * Sender-side unread dashboard (WI-051 C): messages `sender` has sent that
   * were never read, collapsed across BOTH coordinator inboxes (a coordinator
   * reading via hive_listen reads inbox/<name>/ AND inbox/_coordinator/, so a
   * view that scanned only one bucket would split the truth). Per-message
   * staleness attached; broadcasts carry their deliveredTo aggregate
   * ("delivered to N sessions live").
   */
  buildSentView(sender: string): string {
    const entries = sentBy(this.directory, sender, { unreadOnly: true })
    if (entries.length === 0) {
      return `No unread messages sent by ${sender}.`
    }

    const live = entries.filter((e) => !e.staleness.stale)
    const stale = entries.filter((e) => e.staleness.stale)

    const render = (e: SentEntry): string => {
      const m = e.msg
      const sigs = staleSignals(e.staleness)
      const sigStr = sigs.length > 0 ? ` [stale: ${sigs.join(", ")}]` : ""
      const ageDays = Math.floor((Date.now() - new Date(m.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      const broadcastNote =
        m.recipient === "_broadcast"
          ? ` — delivered to ${(m.deliveredTo ?? []).length} session(s) live`
          : ""
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
    if (live.length > 0) {
      lines.push(`### Live`, ...live.map(render), ``)
    }
    if (stale.length > 0) {
      lines.push(
        `### Stale (excluded from delivery, NOT deleted — retire with hive_retire)`,
        ...stale.map(render)
      )
    }
    return lines.join("\n")
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

  /**
   * Build the capability roster for injection into coordinator/capability prompts.
   *
   * When `groupID` is provided (the requesting coordinator's session), idle capabilities
   * that own a resumable session within that group are annotated with a [resumable: ...]
   * hint instructing the coordinator how to continue that session via the task tool's
   * task_id argument. Busy capabilities and capabilities with no known group session are
   * never annotated.
   *
   * NOTE (SHADOW-003): task_id is treated as the subagent sessionID — confirmed by the
   * shared `ses_...` id format and our existing capabilitySessionMap tracking. The exact
   * resumption semantic (full context+message restoration vs. lineage only) is not
   * verifiable from the SDK types alone; the annotation is phrased as a capability the
   * coordinator MAY use, and the empirical behaviour is pending verification.
   */
  buildRoster(groupID?: string): string {
    const lines: string[] = ["## Active Capabilities"]
    try {
      const files = fs.readdirSync(this.capabilitiesPath)
      for (const file of files) {
        if (!file.endsWith(".md") || file.startsWith("_")) continue
        const name = file.replace(".md", "")
        const { frontmatter } = readMdFile(path.join(this.capabilitiesPath, file))
        const desc = (frontmatter.description as string) || "(no description)"

        const resumableSession = this.findIdleSessionInGroup(name, groupID)
        const suffix = resumableSession
          ? ` [resumable: pass task_id="${resumableSession}" to continue this session and preserve its context + messages]`
          : ""
        lines.push(`  ${name} — ${desc}${suffix}`)
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

/** One-line content excerpt for dashboard rendering (~90 chars). */
function excerpt(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim()
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat
}
