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
  isSpecialRecipient,
  type SweepEntry,
  type SentEntry,
} from "./hivemind.js"
import { readMdFile } from "./frontmatter.js"
import {
  classifyRole,
  isCapabilityActiveInGroup,
  isValidSessionID,
  participationRole,
  pruneAwake,
  resolveGroupByChain,
  retainOnLoad,
  selectBroadcastTargets,
  selectDeliveryTarget,
  selectGroupCoordinator,
  selectIdleInGroup,
  selectWakeTarget,
  shortName,
  type SessionRecord,
  type SessionRole,
} from "./session-identity.js"

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Back-compat alias. The registry record now carries role/parentID/lastSeen/
 * verified as well (see lib/session-identity.ts) — identity is resolved from
 * the server's parent chain rather than guessed from Map order.
 */
export type SessionInfo = SessionRecord

export { shortName, type SessionRecord, type SessionRole }

type Client = ReturnType<typeof createOpencodeClient>

/**
 * Registry audit trail (WI-070). One JSON object per line, at the hivemind
 * ROOT — never inside a location that itself gets pruned (I-312/W-124: a
 * record placed at the location being retired is not durable).
 *
 * The entry shape is FROZEN at v:1 (W-126: adding an entry type to a shared
 * append-only log silently redefines every existing reader). There is exactly
 * one shape, and `event` distinguishes the two things that can remove a
 * registry entry:
 *
 *   { v:1, at:ISO, event:"load-drop"|"evict-404", id, agent, reason, awakeDropped? }
 *
 * This exists so criterion 3 ("after a plugin restart, dead/test/dissolved
 * sessions do not participate") is CHECKABLE after the fact rather than
 * asserted. W-061: prove the delete path, or assume entries live forever.
 */
const REGISTRY_LOG_VERSION = 1

// ── Nervous System ────────────────────────────────────────────────────────────

/**
 * HIVEmind Nervous System — manages session tracking, message routing,
 * real-time delivery, and coordinator awareness.
 */
export class NervousSystem {
  private sessionMap = new Map<string, SessionRecord>()
  private knownCapabilityFiles = new Set<string>()
  private awakeSessions = new Set<string>()
  private client: Client
  private directory: string
  private capabilitiesPath: string
  private stateFilePath: string
  private registryLogPath: string
  /** Sessions whose identity resolution is in flight — dedupes concurrent hooks. */
  private resolving = new Map<string, Promise<SessionRecord | undefined>>()

  constructor(client: Client, directory: string) {
    this.client = client
    this.directory = directory
    this.capabilitiesPath = path.join(directory, ".opencode/agents/capabilities")
    this.stateFilePath = path.join(directory, ".opencode/hivemind/.nervous-system-state.json")
    this.registryLogPath = path.join(directory, ".opencode/hivemind/registry-log.jsonl")
    this.initKnownCapabilities()
    this.loadPersistedState()
  }

  /**
   * Append to the registry audit trail. Best-effort and never throws: losing a
   * log line must not break message delivery, but the line is the only proof
   * the delete path ran.
   */
  private logRegistry(entry: Record<string, unknown>): void {
    try {
      fs.mkdirSync(path.dirname(this.registryLogPath), { recursive: true })
      fs.appendFileSync(
        this.registryLogPath,
        JSON.stringify({ v: REGISTRY_LOG_VERSION, at: new Date().toISOString(), ...entry }) + "\n",
        "utf8"
      )
    } catch {
      // ignore
    }
  }

  /**
   * Load the persisted registry, applying the retention rule (weak point 5).
   *
   * Before WI-070 this reloaded the ENTIRE historical registry into every
   * scan — 431 entries here, including hand-written placeholders and 177
   * subagent sessions that no code path could ever legitimately select. They
   * were not inert: they were candidates in the "first non-capability session
   * in Map order" fallback that produced the crossed wakes.
   *
   * Retention is structural (`retainOnLoad`): entries whose id cannot be a
   * session id, and entries whose ROLE can never be selected. No age rule
   * (W-117), no filesystem existence rule (W-142).
   *
   * Records written before WI-070 carry no role/parentID/lastSeen. They are
   * loaded with a name-classified role and `verified:false`, which is honest:
   * their group came from the old auto-assignment guess. `verified` is what
   * `selectWakeTarget` consults before it will authorize a wake, and a live
   * session re-verifies itself on its next chat.message.
   */
  private loadPersistedState(): void {
    let state: { sessions?: unknown[]; awakeSessions?: unknown[] }
    try {
      state = JSON.parse(fs.readFileSync(this.stateFilePath, "utf8"))
    } catch {
      return // no state file yet, fine
    }

    const parsed: SessionRecord[] = []
    for (const raw of state.sessions ?? []) {
      const e = raw as Partial<SessionRecord> & { id?: string; agent?: string }
      if (typeof e?.id !== "string" || typeof e?.agent !== "string") continue
      const parentID = e.parentID === undefined ? undefined : e.parentID
      parsed.push({
        id: e.id,
        agent: e.agent,
        // Liveness is never restored from disk: a session is active only while
        // THIS process observes it (W-119 — a stored flag is not liveness).
        active: false,
        groupID: e.groupID,
        parentID,
        role: e.role ?? classifyRole({ agent: e.agent, parentID }),
        lastSeen: typeof e.lastSeen === "number" ? e.lastSeen : 0,
        verified: e.verified === true,
      })
    }

    const { keep, dropped } = retainOnLoad(parsed)
    for (const r of keep) this.sessionMap.set(r.id, r)

    const awakeIn = (state.awakeSessions ?? []).filter((x): x is string => typeof x === "string")
    const { keep: awakeKeep, dropped: awakeDropped } = pruneAwake(awakeIn, keep)
    for (const id of awakeKeep) this.awakeSessions.add(id)

    if (dropped.length > 0 || awakeDropped.length > 0) {
      for (const d of dropped) {
        this.logRegistry({ event: "load-drop", id: d.id, agent: d.agent, reason: d.reason })
      }
      for (const id of awakeDropped) {
        this.logRegistry({ event: "load-drop", id, agent: "(awake-only)", reason: "awake-orphan" })
      }
      // The prune is only real once it reaches disk (W-061: prove the delete
      // path). Without this write the graveyard returns on the next load.
      this.persistState()
    }
  }

  private persistState(): void {
    const sessions = Array.from(this.sessionMap.values()).map((r) => ({
      id: r.id,
      agent: r.agent,
      groupID: r.groupID,
      parentID: r.parentID,
      role: r.role,
      lastSeen: r.lastSeen,
      verified: r.verified,
    }))
    const awakeSessions = Array.from(this.awakeSessions)
    try {
      fs.writeFileSync(this.stateFilePath, JSON.stringify({ sessions, awakeSessions }, null, 2), "utf8")
    } catch {
      // ignore write failures
    }
  }

  /** Read-only snapshot of the registry (tests, diagnostics). */
  registrySnapshot(): SessionRecord[] {
    return Array.from(this.sessionMap.values())
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

  /**
   * Mark a session as HIVE-awake (persists across restarts).
   *
   * Also ensures the session has a registry record. `hive_awaken` can be the
   * FIRST thing a session does in a process (I-308: in headless runs the
   * system-transform hook fires before chat.message has registered anything),
   * and an awake id with no record is exactly the orphan the referential
   * prune would drop on the next load.
   */
  awakenSession(sessionID: string, agentHint?: string): void {
    this.awakeSessions.add(sessionID)
    if (!this.sessionMap.has(sessionID) && isValidSessionID(sessionID)) {
      this.sessionMap.set(sessionID, {
        id: sessionID,
        agent: agentHint ?? "unknown",
        active: true,
        parentID: undefined,
        role: agentHint ? classifyRole({ agent: agentHint }) : "unknown",
        lastSeen: Date.now(),
        verified: false,
      })
      // Fire-and-forget: replace the placeholder with server truth.
      void this.ensureIdentity(sessionID, agentHint)
    }
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

  /**
   * Drop a session from the registry. The ONLY delete path at runtime, and it
   * fires on POSITIVE evidence only: a 404 from the server for that exact id.
   *
   * Never on absence from an enumeration. `session.list()` is provably
   * incomplete here (100-row default cap, and project-id scoping that no
   * parameter lifts — verified 2026-07-10 by the board viewer's own
   * enumeration work; a live list call returns 6 rows against 431 registry
   * entries). Intersecting with it would evict almost everything (W-079:
   * never infer deletion from absence).
   */
  private evictSession(sessionID: string, reason: string): void {
    const rec = this.sessionMap.get(sessionID)
    this.sessionMap.delete(sessionID)
    const wasAwake = this.awakeSessions.delete(sessionID)
    this.logRegistry({
      event: "evict-404",
      id: sessionID,
      agent: rec?.agent ?? "(unknown)",
      reason,
      ...(wasAwake && { awakeDropped: true }),
    })
    this.persistState()
  }

  /**
   * Ask the server whether a session still exists.
   *
   * Three-valued ON PURPOSE. "gone" is a 404 for that id — positive evidence,
   * safe to act on. "unknown" is any other failure (network, auth, a
   * directory-scoping quirk) and must NOT be laundered into deletion: unknown
   * is not absent. Callers suppress on "unknown" but evict only on "gone".
   */
  private async probeSession(sessionID: string): Promise<"alive" | "gone" | "unknown"> {
    try {
      const res = await this.client.session.get({ path: { id: sessionID } })
      if (res?.data) return "alive"
      const err = res?.error as { name?: string } | undefined
      const status = (res as { response?: { status?: number } })?.response?.status
      if (status === 404 || err?.name === "NotFoundError") return "gone"
      return "unknown"
    } catch {
      return "unknown"
    }
  }

  /**
   * Resolve a session's TRUE identity from the server and write it into the
   * registry: agent, parentID, role, and the group (the root of the parent
   * chain).
   *
   * This is the heart of the fix (I-043: assign the group AT REGISTRATION,
   * not lazily; I-141: parentID presence is the verified-reliable top-level
   * discriminator). What it replaces was `findCoordinatorSession()` — "the
   * first active non-capability session in Map insertion order" — which is a
   * guess that is wrong the instant two coordinators are running, and whose
   * wrongness then poisons every group-scoped read downstream (weak points 7
   * and 13).
   *
   * Memoized per id: the fields it reads are immutable for a session's life,
   * so this is one HTTP call per session per process, deduped across
   * concurrent hooks.
   *
   * I-309 boundary: the parent chain informs ROUTING and prompt scoping only.
   * It never feeds a board ownership write — that path does its own top-level
   * check in hive_awaken and is untouched here.
   */
  async ensureIdentity(sessionID: string, agentHint?: string): Promise<SessionRecord | undefined> {
    if (!isValidSessionID(sessionID)) return undefined
    const existing = this.sessionMap.get(sessionID)
    // Once verified, the server's answer is definitive and a caller's agent
    // hint is irrelevant — deliberately: `context.agent` can report the
    // PARENT's agent on a resumed session (W-009), so re-resolving whenever a
    // hint disagreed would refetch forever on exactly the sessions where the
    // hint is wrong.
    if (existing?.verified) return existing

    const inflight = this.resolving.get(sessionID)
    if (inflight) return inflight

    const task = (async (): Promise<SessionRecord | undefined> => {
      let agent = agentHint ?? existing?.agent ?? "unknown"
      let parentID: string | null | undefined
      let verified = false

      try {
        const res = await this.client.session.get({ path: { id: sessionID } })
        const sess = res?.data as { agent?: string; parentID?: string } | undefined
        if (sess) {
          // The server's own `agent` field beats context.agent, which can
          // report the PARENT's agent on resumed sessions (W-009).
          if (typeof sess.agent === "string" && sess.agent.length > 0) agent = sess.agent
          parentID = sess.parentID ?? null
          verified = true
        } else {
          const status = (res as { response?: { status?: number } })?.response?.status
          const err = res?.error as { name?: string } | undefined
          if (status === 404 || err?.name === "NotFoundError") {
            this.evictSession(sessionID, "session.get returned 404 during identity resolution")
            return undefined
          }
        }
      } catch {
        // Unknown, not absent. Fall through with whatever we had.
      }

      let groupID = existing?.groupID
      if (verified) {
        const chain = await resolveGroupByChain(sessionID, parentID, async (id) => {
          const cached = this.sessionMap.get(id)
          if (cached?.verified && cached.parentID !== undefined) return { parentID: cached.parentID }
          const r = await this.client.session.get({ path: { id } }).catch(() => undefined)
          const s = r?.data as { parentID?: string } | undefined
          return s ? { parentID: s.parentID ?? null } : undefined
        })
        if (chain.ok) {
          groupID = chain.value
        } else {
          // Suppress, do not substitute (I-227): an unresolvable chain leaves
          // the group as it was and stays unverified, so wakes refuse rather
          // than picking a stand-in coordinator.
          verified = false
        }
      }

      const record: SessionRecord = {
        id: sessionID,
        agent,
        active: existing?.active ?? true,
        groupID,
        parentID,
        role: classifyRole({ agent, parentID }),
        lastSeen: Date.now(),
        verified,
      }
      this.sessionMap.set(sessionID, record)
      this.persistState()
      return record
    })()

    this.resolving.set(sessionID, task)
    try {
      return await task
    } finally {
      this.resolving.delete(sessionID)
    }
  }

  // ── Session tracking ──────────────────────────────────────────────────────

  /**
   * Register a session seen on `chat.message`, then resolve its true identity.
   *
   * The synchronous half writes an immediately-usable record so the sync
   * readers (isCapabilitySession, getGroupID, ...) are never empty; the
   * awaited half replaces the guessed group with the server-verified one.
   *
   * What is gone: the old auto-assignment `groupID = findCoordinatorSession()`
   * — "whichever coordinator this process saw first". With two coordinators
   * live, that hands a capability to a stranger's group, and every downstream
   * group-scoped read then inherits the mistake permanently (weak points 7 and
   * 13). A guess is not a cheaper truth; here it was the bug.
   */
  async registerSession(sessionID: string, agent: string): Promise<void> {
    if (!isValidSessionID(sessionID)) return
    const existing = this.sessionMap.get(sessionID)

    // Already verified: the server has told us what this session IS, and the
    // hook's `agent` argument is the weaker source (W-009 — it can carry the
    // PARENT's agent on a resumed session). Refresh liveness only; overwriting
    // agent/role here would stick, because ensureIdentity short-circuits on a
    // verified record.
    if (existing?.verified) {
      existing.active = true
      existing.lastSeen = Date.now()
      this.persistState()
      return
    }

    const role = classifyRole({ agent, parentID: existing?.parentID })
    this.sessionMap.set(sessionID, {
      id: sessionID,
      agent,
      active: true,
      // A coordinator is its own group. A capability's group stays UNKNOWN
      // until the parent chain says otherwise — unknown suppresses, and that
      // is the correct default (I-227).
      groupID: existing?.groupID ?? (role === "coordinator" ? sessionID : undefined),
      parentID: existing?.parentID,
      role,
      lastSeen: Date.now(),
      verified: existing?.verified ?? false,
    })
    this.persistState()
    await this.ensureIdentity(sessionID, agent)
  }

  /** Get the group (coordinator session ID) for a given session */
  getGroupID(sessionID: string): string | undefined {
    return this.sessionMap.get(sessionID)?.groupID
  }

  /**
   * The idle capability session belonging to `groupID` (I-032: a capability
   * launched by coordinator A is resumed by coordinator A).
   *
   * No group, no answer. The old signature fell back to a name-keyed lookup
   * that held ONE session per capability name across the whole workspace, so
   * an ungrouped caller was handed whichever coordinator's session happened to
   * be newest (weak point 4 / SNG-020: key by (name, lineage), never name
   * alone).
   */
  findIdleSessionInGroup(capabilityName: string, groupID?: string): string | undefined {
    return selectIdleInGroup(this.sessionMap.values(), capabilityName, groupID)
  }

  markActive(sessionID: string): void {
    const info = this.sessionMap.get(sessionID)
    if (info) {
      info.active = true
      info.lastSeen = Date.now()
    }
  }

  markIdle(sessionID: string): void {
    const info = this.sessionMap.get(sessionID)
    if (info) {
      info.active = false
      info.lastSeen = Date.now()
    }
  }

  /** Resolve the short agent name for a session (prefers session map over raw context.agent) */
  resolveAgent(sessionID: string, fallbackAgent?: string): string {
    const info = this.sessionMap.get(sessionID)
    const raw = info?.agent || fallbackAgent || "unknown"
    return shortName(raw)
  }

  isCapabilitySession(sessionID: string): boolean {
    return this.sessionMap.get(sessionID)?.role === "capability"
  }

  /**
   * The inbox buckets a session is allowed to read, derived from its WI-070
   * role (WI-083).
   *
   * Durable identity, not agent name: `role` was resolved from the server's
   * parent chain at registration, so a coordinator whose agent name happens to
   * collide with a capability name does NOT inherit that capability's mailbox.
   *   - capability → [its own short name]
   *   - everything else → ["_coordinator"]
   *     Coordinator mail lives there (W-012). Subagent/unknown roles have no
   *     named mailbox of their own; reading one derived from a name string is
   *     exactly the W-012 defect, so they get the system bucket — normally
   *     empty for them — rather than a name-collision gamble.
   *
   * "_broadcast" is NOT listed: `getInbox` unions it into every read already,
   * and `markAllRead` does the same on the acknowledge side.
   *
   * A session with no registry record (pre-registration first turn) cannot
   * have its role resolved yet, so it REFUSES with [] rather than guessing
   * from the agent-name hint (I-227: suppress, don't substitute — the hint is
   * the mutable name this function exists to stop trusting). Callers that
   * need identity first `await ensureIdentity`, which registers the record.
   */
  mailboxBuckets(sessionID: string): string[] {
    const rec = this.sessionMap.get(sessionID)
    if (!rec) return []
    return rec.role === "capability" ? [shortName(rec.agent)] : ["_coordinator"]
  }

  /**
   * True if this session is a coordinator: a TOP-LEVEL session (no parent).
   *
   * The discriminator is parentID presence, verified against the server
   * (I-141), not the old hardcoded list of subagent agent-names — that list
   * silently mislabels every subagent type it does not enumerate as a
   * coordinator, and a coordinator label is what authorizes a wake.
   */
  isCoordinatorSession(sessionID: string): boolean {
    return this.sessionMap.get(sessionID)?.role === "coordinator"
  }

  // ── Message sending + delivery ────────────────────────────────────────────

  async send(sender: string, recipient: string, type: "question" | "info" | "result" | "request", content: string, senderSessionID?: string): Promise<{ filename: string; delivered: boolean }> {
    // I-033: `_`-prefixed recipients are special addresses, not capability
    // names — they bypass the capability-file existence semantics entirely.
    // Only the two known specials are legal; any other `_foo` is refused by
    // sendMessage itself rather than minting a silently-orphaned bucket.
    if (recipient.startsWith("_") && !isSpecialRecipient(recipient)) {
      throw new Error(`Refused: unknown special recipient "${recipient}". Only _coordinator and _broadcast are legal special addresses (I-033).`)
    }
    // Resolve the sender's own identity first. Everything below is scoped by
    // the sender's group, so an unresolved sender means a message that can
    // only be delivered by suppressing and queueing — better to spend one
    // cached lookup than to guess (I-308: on a first turn in a headless run,
    // chat.message may not have registered this session yet).
    if (senderSessionID) await this.ensureIdentity(senderSessionID)
    const senderGroupID = senderSessionID ? this.getGroupID(senderSessionID) : undefined
    const filename = sendMessage(this.directory, { sender, recipient, type, content, groupId: senderGroupID })

    let delivered = false

    if (recipient === "_broadcast") {
      // Group-local by construction (weak point 12). No sender group means no
      // live injections at all — the file is still written, so the broadcast
      // reaches its group's sessions the next time they read their inbox.
      const targets = selectBroadcastTargets(this.sessionMap.values(), {
        senderName: sender,
        senderGroupID,
        senderSessionID,
      })
      for (const sessionID of targets) {
        this.injectIntoSession(sessionID, `[HIVEmind broadcast from ${sender}] (${type}): ${content}`)
          .then(() => {
            // Aggregate receipt (WI-051 decision 3): one append per session
            // reached. No per-recipient structures - a count/list is enough.
            recordBroadcastDelivery(this.directory, filename, sessionID)
          })
          .catch(() => {})
      }
      delivered = targets.length > 0
    } else if (recipient === "_coordinator") {
      // The sender's OWN group coordinator, or nobody. The previous fallback
      // (`|| findCoordinatorSession()`) escalated to a stranger's coordinator
      // whenever the group link was missing - the mirror image of the wake
      // crossing, on the send side.
      const target = selectGroupCoordinator(this.sessionMap, senderGroupID)
      if (target.ok && (await this.probeBeforePrompt(target.value.coordinatorSessionID))) {
        try {
          await this.injectIntoSession(target.value.coordinatorSessionID, `[HIVEmind] Message from ${sender} (${type}): ${content}`)
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
        // W-119: flip the FILE's status pending -> delivered after the attempt
        // returned success. This changes only the status field - never which
        // session the message targeted (that is WI-070's surface).
        markDelivered(this.directory, recipient, filename)
      } else {
        this.wakeGroupCoordinator(
          senderGroupID,
          `Capability ${recipient} received a queued message from ${sender} (${type}) but has no active session. Routing needed.`
        ).catch(() => {})
      }
    }

    return { filename, delivered }
  }

  /**
   * Existence check immediately before a live injection (weak point 3).
   *
   * `info.active` is plugin-local hearsay: it is set from `session.status`
   * events this process happened to see and is never re-validated, so after a
   * restart or a crashed session it can claim a dead session is running. This
   * does not try to answer "is it busy right now" - the server exposes no such
   * field, and W-119 is explicit that a delivery flag is not liveness. It
   * answers the question that IS answerable: does this session still exist. A
   * 404 evicts it; anything else fails closed without deleting.
   */
  private async probeBeforePrompt(sessionID: string): Promise<boolean> {
    const state = await this.probeSession(sessionID)
    if (state === "gone") {
      this.evictSession(sessionID, "404 on pre-delivery existence probe")
      return false
    }
    return state === "alive"
  }

  /**
   * Wake the coordinator that owns `groupID`. Uses promptAsync, which queues
   * safely even if the session is busy.
   *
   * Returns a diagnostic string rather than throwing; SUPPRESSED_* is a
   * deliberate outcome, not an error (I-227). The message being routed is
   * already durable on disk - declining to wake a coordinator we cannot prove
   * owns this group loses nothing except the wrong coordinator's attention.
   */
  async wakeGroupCoordinator(groupID: string | undefined, reason: string): Promise<string> {
    const target = selectGroupCoordinator(this.sessionMap, groupID)
    if (!target.ok) return `SUPPRESSED_${target.reason}`
    return this.promptCoordinator(target.value.coordinatorSessionID, reason)
  }

  /**
   * Wake the coordinator that owns a CHILD session's group, about that same
   * group (weak point 11).
   *
   * Content and target come from ONE resolution here, and the caller is handed
   * the groupID to build its content from. Previously the two were resolved
   * independently - the content from the idle capability's group, the target
   * from a separate lookup that ended in "any non-capability session" - which
   * is how a coordinator working board-viewer received a wake describing
   * hive-infra's queue while hive-infra's coordinator received the mirror
   * image.
   *
   * `buildReason` is only invoked once a target is resolved, so a suppressed
   * wake also does no work.
   */
  async wakeForChild(
    childSessionID: string | undefined,
    buildReason: (groupID: string) => string | null
  ): Promise<string> {
    const target = selectWakeTarget(this.sessionMap, childSessionID)
    if (!target.ok) return `SUPPRESSED_${target.reason}`
    const reason = buildReason(target.value.groupID)
    if (!reason) return "SUPPRESSED_nothing-to-report"
    return this.promptCoordinator(target.value.coordinatorSessionID, reason)
  }

  private async promptCoordinator(coordSessionID: string, reason: string): Promise<string> {
    const state = await this.probeSession(coordSessionID)
    if (state === "gone") {
      this.evictSession(coordSessionID, "404 on pre-wake existence probe")
      return "SUPPRESSED_coordinator-gone"
    }
    if (state === "unknown") return "SUPPRESSED_coordinator-unverifiable"
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

  /**
   * Deliver a named message live, inside the sender's group only.
   *
   * Candidates are ordered deterministically (freshest first) instead of by
   * Map insertion order, and each is existence-probed before the prompt. A
   * candidate that 404s is evicted and the next one tried - that is the only
   * place a "retry" happens, and it is bounded by the candidate list.
   */
  private async deliverToRecipient(recipient: string, sender: string, type: string, content: string, senderGroupID?: string): Promise<boolean> {
    const selection = selectDeliveryTarget(this.sessionMap.values(), { recipient, senderGroupID })
    if (!selection.ok) return false

    for (const sessionID of selection.value.candidates) {
      if (!(await this.probeBeforePrompt(sessionID))) continue
      try {
        await this.injectIntoSession(sessionID, `[HIVEmind] Message from ${sender} (${type}): ${content}`)
        return true
      } catch {
        // fall through to the next candidate, then to queued
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

  /**
   * Group-scoped inbox read.
   *
   * An UNRESOLVED group returns nothing. This looks harsh and is the whole
   * point: `getInbox(dir, name, undefined)` reads every group's messages for
   * that recipient name, so a session whose identity could not be established
   * would see - and, via acknowledge, silently retire - another coordinator's
   * mail. Before WI-070 every capability had a group because one was GUESSED
   * for it at registration; now an unknown group stays unknown, so the read
   * path has to say no rather than fall open (I-227).
   *
   * Read and acknowledge share this guard deliberately. W-141: when a mutating
   * path filters more loosely than the read that displayed the items, the
   * hazard inverts from "you see stale messages" to "you retire messages you
   * were never shown".
   */
  readMessages(capabilityName: string, groupID?: string): ReturnType<typeof getInbox> {
    if (!groupID) return []
    return getInbox(this.directory, capabilityName, groupID)
  }

  acknowledgeMessages(capabilityName: string, groupID?: string): number {
    if (!groupID) return 0
    return markAllRead(this.directory, capabilityName, groupID)
  }

  formatMessages(capabilityName: string, groupID?: string): string | null {
    return formatInboxForPrompt(this.readMessages(capabilityName, groupID))
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
    // Same guard as readMessages: no group, no dashboard. An unscoped sweep
    // here would show a coordinator every OTHER coordinator's queue - which is
    // the reported WI-070 symptom in its display form.
    if (!groupID) return null
    const sweep = sweepInboxes(this.directory, groupID)
    if (sweep.length === 0) return null

    const lines = this.formatRecipientLines(sweep, { coordinatorView: true, groupID })
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
    opts: { coordinatorView: boolean; groupID?: string }
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

      // "Active" must mean active IN THIS GROUP. A same-named capability
      // running under a different coordinator is not this coordinator's to
      // route to, and reporting it as active tells the reader the message will
      // be picked up automatically when it will not (W-099).
      const active = isCapabilityActiveInGroup(this.sessionMap.values(), recipient, opts.groupID)

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
    // No group, nothing to route. A caller that cannot name its group would
    // otherwise get an UNFILTERED sweep of every coordinator's queue - which
    // is what "needsRouting returns true for all recipients" (weak point 10)
    // amounted to before WI-051 group-scoped the sweep.
    if (!groupID) return null

    const sweep = sweepInboxes(this.directory, groupID)
    const needsRouting = sweep.filter((e) => {
      if (e.recipient === "_broadcast") return false
      // Already injected live: the recipient has it, nobody needs to route it
      // (W-119 - `delivered` is a real status now that WI-051 writes it).
      if (e.msg.status !== "pending") return false
      // Sediment is excluded from delivery, so it is not routing work either
      // (SNG-020: excluded from delivery is not the same as deleted).
      if (e.staleness.stale) return false
      return true
    })
    if (needsRouting.length === 0) return null
    const lines = this.formatRecipientLines(needsRouting, { coordinatorView: false, groupID })
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
  buildSentView(sender: string, groupID?: string): string {
    // Group-scoped for the same reason delivery is (WI-070 weak point 4):
    // `sentBy` matches on the sender NAME alone, and capability names are
    // reused across coordinators, so an unscoped view shows a capability the
    // messages its same-named twin sent in someone else's dispatch group.
    if (!groupID) {
      return `Cannot build a sender-side view: this session's dispatch group is unresolved, and an ungrouped view would mix in other coordinators' messages.`
    }
    const entries = sentBy(this.directory, sender, { unreadOnly: true }).filter(
      (e) => e.msg.groupId === groupID
    )
    if (entries.length === 0) {
      return `No unread messages sent by ${sender} in this session group.`
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

    // A new capability FILE is workspace-global, not group-scoped, so this
    // notice legitimately goes to every active HIVE session. Subagents are
    // excluded (they get no roster and cannot dispatch), which keeps the set
    // of sessions any code path can reach identical to the set retained by
    // `retainOnLoad` - the symmetry W-141 is about.
    const notification = `[HIVEmind] New capability available: ${capName} — ${desc}`
    for (const info of this.sessionMap.values()) {
      if (info.active && participationRole(info.role)) {
        this.injectIntoSession(info.id, notification).catch(() => {})
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
   * shared `ses_...` id format and our own session-registry tracking. The exact
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

/** One-line content excerpt for dashboard rendering (~90 chars). */
function excerpt(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim()
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat
}
