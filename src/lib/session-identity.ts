/**
 * Session identity + targeting — the PURE layer (WI-070).
 *
 * Everything in this file is a total function over a plain registry snapshot.
 * No client, no fs, no clock (callers inject `now`). That is deliberate: the
 * defect class this module exists to kill ("messages sent to the wrong
 * sessions") was previously only observable by running two coordinators side
 * by side and watching them cross. Targeting decisions live here so they can
 * be asserted directly, at real registry scale, without a live session.
 *
 * ── The one defect, stated once ───────────────────────────────────────────
 * Session identity and group membership were resolved LOOSELY (first match in
 * Map insertion order), CACHED UNSAFELY (one slot per capability NAME, so the
 * newest session of a name overwrote every other coordinator's), NEVER
 * RE-VALIDATED against the server, and NEVER PRUNED. Every one of WI-070's 13
 * weak points is a face of that. The rules below are the fix:
 *
 *   1. GROUP IS AUTHORITATIVE, NOT GUESSED. A session's groupID is the root of
 *      its parentID chain, read from the server (I-043: assigned AT
 *      registration, not lazily inherited; I-141: parentID presence is the
 *      verified-reliable top-level discriminator).
 *   2. SUPPRESS, DON'T SUBSTITUTE (I-227). When the group link is missing or
 *      the true owner is gone, every selector here returns a REFUSAL with a
 *      reason. Not "the first coordinator we happen to know". A refusal is not
 *      data loss: the message is already durable on disk and reaches its
 *      recipient the next time that group runs it.
 *   3. STRICT GROUP EQUALITY. `undefined === undefined` is NOT a group match.
 *      An unknown group is unknown, never a wildcard (this was weak points 2
 *      and 12: the group filter was skipped whenever either side was
 *      undefined, so unstamped sessions matched EVERY group).
 *   4. DETERMINISTIC TIEBREAK. Where several candidates legitimately qualify,
 *      selection is ordered by (lastSeen desc, id asc) — never by Map
 *      insertion order, which is an artifact of process history.
 *
 * ── Retention symmetry (W-141) ────────────────────────────────────────────
 * `retainOnLoad` drops exactly the entries that NO selector in this file can
 * ever return, and nothing else. That symmetry is the point: W-141 showed that
 * when a mutating path filters differently from the read path that displayed
 * the items, the hazard inverts from "you see stale rows" to "you silently
 * destroy rows you never saw". So retention is defined as the complement of
 * participation, and `participationRole` is the single predicate both sides
 * consult. If you add a selector that can return a role, you MUST widen
 * retention to match — the test suite asserts the two stay in step.
 *
 * Note what retention deliberately does NOT do: it never consults the
 * filesystem to decide whether a capability still "exists" (W-142 — a
 * capability dissolved and later RESURRECTED makes a current directory
 * listing a liar about the past). Role is stamped at registration and read
 * back; the disk is not asked to remember.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * What a session IS, for targeting purposes.
 *
 * - `coordinator` — a top-level session (no parent). Owns a dispatch group;
 *   the ONLY legal target of a routing wake.
 * - `capability` — a HIVE capability session (`capabilities/<name>`). The only
 *   legal target of a named HIVEmind delivery.
 * - `subagent`   — a child session that is not a capability (general, explore,
 *   dreamcatcher, task subagents). Participates in nothing.
 * - `unknown`    — identity could not be established. Participates in nothing,
 *   but is NOT dropped: unknown is not the same as absent (W-079), and a
 *   transient lookup failure must never be laundered into a deletion.
 */
export type SessionRole = "coordinator" | "capability" | "subagent" | "unknown"

export interface SessionRecord {
  id: string
  /** Raw agent name as registered, e.g. "capabilities/hive-infra" or "build". */
  agent: string
  /** Plugin-local liveness hearsay. Advisory ONLY — see W-119. */
  active: boolean
  /** Root of the parentID chain = the coordinator session owning this group. */
  groupID?: string
  /** Direct parent session id. `null` = confirmed top-level. undefined = unknown. */
  parentID?: string | null
  role: SessionRole
  /** ms epoch of the last registration/activity we observed. Tiebreak key. */
  lastSeen: number
  /**
   * True when `groupID`/`parentID`/`role` were resolved from the SERVER's
   * parent chain rather than inferred from an agent-name string. Unverified
   * records are still usable (they are what a pre-WI-070 state file contains)
   * but are never allowed to authorize a wake — see `selectWakeTarget`.
   */
  verified: boolean
}

/** A selector either resolves, or refuses with a reason. Never "best effort". */
export type Selection<T> = { ok: true; value: T } | { ok: false; reason: string }

const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })
const resolve = <T>(value: T): { ok: true; value: T } => ({ ok: true, value })

// ── Name + id primitives ──────────────────────────────────────────────────────

/** Strip the "capabilities/" prefix. `dissolved/x` is intentionally left alone. */
export function shortName(agent: string): string {
  return agent.replace(/^capabilities\//, "")
}

/**
 * Structural validity of a session id.
 *
 * opencode session ids are `ses_` + a base62 blob — no underscores after the
 * prefix. Hand-written placeholders that leaked into the persisted registry
 * (`ses_COORD_ACTIVE`, `ses_CAP_NEW`) violate that and are rejected here.
 * This is a SHAPE check, not a liveness check: it says "this string cannot be
 * a session id", never "this session is gone".
 */
export function isValidSessionID(id: string): boolean {
  return /^ses_[A-Za-z0-9]+$/.test(id)
}

/** Agent names opencode uses for non-capability child sessions. */
const KNOWN_SUBAGENT_AGENTS = new Set(["general", "explore", "dreamcatcher", "scout", "task"])

/**
 * Classify a session.
 *
 * `parentID` is the discriminator when we have it (I-141): a session with a
 * parent is NOT a coordinator, whatever it calls itself; a session without one
 * is. `undefined` parentID means "we never looked" — then, and only then, do
 * we fall back to the agent-name heuristic that WI-070 exists to demote.
 */
export function classifyRole(input: { agent: string; parentID?: string | null }): SessionRole {
  const { agent, parentID } = input
  // `dissolved/<name>` counts as a capability session: it IS one, registered
  // while its definition lived in agents/dissolved/. Classifying by where the
  // file sits today would let a dissolution — or a later resurrection — rewrite
  // what a past session was (W-142). It can never be a delivery target anyway,
  // because shortName() deliberately does not strip that prefix.
  const isCapabilityName = agent.startsWith("capabilities/") || agent.startsWith("dissolved/")

  if (parentID !== undefined) {
    // Server-verified structure.
    if (isCapabilityName) return "capability"
    return parentID === null ? "coordinator" : "subagent"
  }

  // No parent information — heuristic fallback (pre-WI-070 state files).
  if (isCapabilityName) return "capability"
  if (KNOWN_SUBAGENT_AGENTS.has(agent)) return "subagent"
  return "coordinator"
}

/**
 * Can a record of this role ever be selected by ANY selector in this module?
 * The single predicate shared by retention and participation (W-141).
 */
export function participationRole(role: SessionRole): boolean {
  return role === "coordinator" || role === "capability"
}

// ── Retention (weak point 5) ──────────────────────────────────────────────────

export interface RetentionResult {
  keep: SessionRecord[]
  /** Dropped records with the rule that dropped them — for the audit log. */
  dropped: { id: string; agent: string; reason: "invalid-id" | "non-participating-role" }[]
}

/**
 * Decide which persisted registry entries are loaded back into memory.
 *
 * Exactly two rules, both structural, neither of them "this looks old":
 *   - `invalid-id`             — the id cannot be a session id at all.
 *   - `non-participating-role` — the role can never be selected by anything.
 *
 * There is deliberately no age rule (W-117: absence of recent activity cannot
 * distinguish a dead session from a just-started one) and no filesystem rule
 * (W-142: a dissolved capability may be resurrected, so today's directory
 * listing is not a statement about the past). A coordinator from months ago is
 * KEPT — it is harmless once fallback-to-any-coordinator is gone, and keeping
 * it costs a map entry.
 */
export function retainOnLoad(records: SessionRecord[]): RetentionResult {
  const keep: SessionRecord[] = []
  const dropped: RetentionResult["dropped"] = []
  for (const r of records) {
    if (!isValidSessionID(r.id)) {
      dropped.push({ id: r.id, agent: r.agent, reason: "invalid-id" })
      continue
    }
    if (!participationRole(r.role) && r.role !== "unknown") {
      dropped.push({ id: r.id, agent: r.agent, reason: "non-participating-role" })
      continue
    }
    keep.push(r)
  }
  return { keep, dropped }
}

/**
 * Referential prune of the awake set: an awake id that names no retained
 * record is dropped. This is the delete path W-061 demands be provable — it
 * runs off the SAME retention decision above, so an entry can only leave the
 * awake set as a consequence of its record leaving the registry, never on its
 * own inference. Ids that are still present stay awake forever; awakeness does
 * not decay with time (that would be W-117 all over again).
 */
export function pruneAwake(awake: Iterable<string>, retained: SessionRecord[]): {
  keep: string[]
  dropped: string[]
} {
  const known = new Set(retained.map((r) => r.id))
  const keep: string[] = []
  const dropped: string[] = []
  for (const id of awake) {
    if (known.has(id)) keep.push(id)
    else dropped.push(id)
  }
  return { keep, dropped }
}

// ── Ordering ──────────────────────────────────────────────────────────────────

/** Deterministic candidate order: freshest first, id as the stable tiebreak. */
function byRecency(a: SessionRecord, b: SessionRecord): number {
  if (b.lastSeen !== a.lastSeen) return b.lastSeen - a.lastSeen
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// ── Delivery targeting (weak points 1, 2, 3) ──────────────────────────────────

export interface DeliveryQuery {
  /** Short capability name, e.g. "hive-infra". */
  recipient: string
  /** The SENDER's group. Required — an unknown sender group suppresses. */
  senderGroupID?: string
}

/**
 * Choose the session that a named HIVEmind message should be injected into.
 *
 * Weak point 1 was "first match in Map insertion order wins when two active
 * sessions share a capability name" — with 431 registry entries and the same
 * capability names reused across coordinators, that is a coin flip between
 * coordinator worlds. Weak point 2 was that the group filter was SKIPPED when
 * either side was undefined, which made every unstamped session a wildcard
 * recipient for every group.
 *
 * Now: strict group equality, capability role required, and a deterministic
 * order over the survivors. If nothing qualifies we refuse — the message is
 * already on disk and will be read by the right session in the right group.
 */
export function selectDeliveryTarget(
  records: Iterable<SessionRecord>,
  q: DeliveryQuery
): Selection<{ sessionID: string; candidates: string[] }> {
  if (!q.senderGroupID) return refuse("sender-group-unknown")

  const candidates: SessionRecord[] = []
  for (const r of records) {
    if (r.role !== "capability") continue
    if (!r.active) continue
    if (shortName(r.agent) !== q.recipient) continue
    if (r.groupID !== q.senderGroupID) continue // strict: undefined never matches
    candidates.push(r)
  }
  if (candidates.length === 0) return refuse("no-active-recipient-in-group")

  candidates.sort(byRecency)
  return resolve({ sessionID: candidates[0]!.id, candidates: candidates.map((c) => c.id) })
}

// ── Broadcast targeting (weak point 12) ───────────────────────────────────────

export interface BroadcastQuery {
  /** Short name of the sending agent — excluded from its own broadcast. */
  senderName: string
  senderGroupID?: string
  /** Sending session id — excluded even if the name resolution differs. */
  senderSessionID?: string
}

/**
 * Sessions a `_broadcast` may be injected into live.
 *
 * A broadcast is group-local, full stop. Previously it walked every active
 * session and skipped the group check whenever `groupID` was undefined, so a
 * broadcast in one coordinator's world landed in another's. With no sender
 * group we return NOTHING: the message is still written to
 * `inbox/_broadcast/`, so nothing is lost — it simply is not shouted into
 * rooms we cannot prove are ours (W-099).
 *
 * Subagents are excluded: they receive no roster and no HIVEmind rules, so a
 * broadcast is noise to them. That exclusion is what makes it safe for
 * `retainOnLoad` to drop them.
 */
export function selectBroadcastTargets(
  records: Iterable<SessionRecord>,
  q: BroadcastQuery
): string[] {
  if (!q.senderGroupID) return []
  const out: SessionRecord[] = []
  for (const r of records) {
    if (!participationRole(r.role)) continue
    if (!r.active) continue
    if (r.groupID !== q.senderGroupID) continue
    if (r.id === q.senderSessionID) continue
    if (shortName(r.agent) === q.senderName) continue
    out.push(r)
  }
  out.sort(byRecency)
  return out.map((r) => r.id)
}

// ── Wake targeting (weak points 8, 9, 11) ─────────────────────────────────────

export interface WakeTarget {
  /** The group the wake is ABOUT — content must be built from this. */
  groupID: string
  /** The session to prompt. Equal to groupID by construction. */
  coordinatorSessionID: string
}

/**
 * Resolve the coordinator to wake about a child session, and the group the
 * wake is about — TOGETHER, in one call.
 *
 * This is the WI-070 mechanism itself. Previously the wake's CONTENT was
 * computed from the idle capability's group while the wake's TARGET was
 * resolved independently, and the target resolution ended in "otherwise, the
 * first non-capability session in Map order" — with no active, awake, or role
 * check at all. Two coordinators sharing one persisted registry therefore each
 * received the wake built from the other's queue: the exact crossed-wake
 * symptom.
 *
 * Returning both fields from one resolution makes crossing structurally
 * impossible: there is no second place to look up a group.
 *
 * Refusals (all of them deliberate — I-227):
 *   - the child is unknown, or has no group link;
 *   - the child's group link is a bare NAME-based guess (`verified:false`) —
 *     the pre-WI-070 auto-assignment pointed capability sessions at "whichever
 *     coordinator the plugin happened to see first", and honouring that guess
 *     is precisely how the wrong coordinator got woken;
 *   - the group names a session we DO know and it is not a coordinator.
 *
 * A group id we hold no record for is ACCEPTED when the child record is
 * verified: the root of a server-read parent chain is a real session, and
 * requiring it to also have emitted `chat.message` in this process is what
 * weak point 9 was (headless/`opencode run` sessions genuinely have not —
 * I-308).
 */
export function selectWakeTarget(
  records: Map<string, SessionRecord> | ReadonlyMap<string, SessionRecord>,
  childSessionID?: string
): Selection<WakeTarget> {
  if (!childSessionID) return refuse("no-child-session")
  const child = records.get(childSessionID)
  if (!child) return refuse("child-not-registered")
  const groupID = child.groupID
  if (!groupID) return refuse("child-has-no-group")

  const coord = records.get(groupID)
  if (coord && coord.role !== "coordinator") return refuse("group-owner-not-a-coordinator")
  if (!coord && !child.verified) return refuse("unverified-group-owner-unknown")

  return resolve({ groupID, coordinatorSessionID: groupID })
}

/**
 * The same resolution for a group we already hold (the send-side wake: the
 * SENDER's coordinator owns routing for a message whose recipient was idle).
 */
export function selectGroupCoordinator(
  records: Map<string, SessionRecord> | ReadonlyMap<string, SessionRecord>,
  groupID?: string
): Selection<WakeTarget> {
  if (!groupID) return refuse("no-group")
  const coord = records.get(groupID)
  if (coord && coord.role !== "coordinator") return refuse("group-owner-not-a-coordinator")
  return resolve({ groupID, coordinatorSessionID: groupID })
}

// ── Idle-session lookup (weak point 4) ────────────────────────────────────────

/**
 * The idle capability session belonging to `groupID` — the `[resumable:
 * task_id=...]` annotation behind the roster.
 *
 * The old `capabilitySessionMap` kept ONE slot per capability name, so the
 * newest session of that name (whoever dispatched it) was the answer handed to
 * every coordinator: a coordinator could be told to resume a session belonging
 * to someone else's dispatch group. SNG-020 states the rule this violated —
 * keying by recipient name alone collides across time; key by (recipient,
 * lineage). Here lineage is the group, and there is no name-keyed cache at all:
 * the scan is over the registry, which is small enough that a map was never
 * buying anything.
 *
 * No group ⇒ no answer. A caller that does not know its own group has no
 * business resuming anyone's session.
 */
export function selectIdleInGroup(
  records: Iterable<SessionRecord>,
  capabilityName: string,
  groupID?: string
): string | undefined {
  if (!groupID) return undefined
  const name = shortName(capabilityName)
  const candidates: SessionRecord[] = []
  for (const r of records) {
    if (r.role !== "capability") continue
    if (r.active) continue
    if (shortName(r.agent) !== name) continue
    if (r.groupID !== groupID) continue
    candidates.push(r)
  }
  if (candidates.length === 0) return undefined
  candidates.sort(byRecency)
  return candidates[0]!.id
}

/** Is any session of this capability name currently active in this group? */
export function isCapabilityActiveInGroup(
  records: Iterable<SessionRecord>,
  capabilityName: string,
  groupID?: string
): boolean {
  const name = shortName(capabilityName)
  for (const r of records) {
    if (r.role !== "capability") continue
    if (!r.active) continue
    if (shortName(r.agent) !== name) continue
    if (groupID !== undefined && r.groupID !== groupID) continue
    return true
  }
  return false
}

// ── Parent-chain resolution ───────────────────────────────────────────────────

/** Max hops when walking parentID to the root. Guards against a cyclic chain. */
export const MAX_CHAIN_DEPTH = 12

/**
 * Walk a parent chain to its root using an injected lookup.
 *
 * Pure over `lookup` so the walk itself — depth limiting, cycle detection,
 * the missing-link case — is testable without a server. The real caller passes
 * a `client.session.get` wrapper.
 *
 * Returns the ROOT session id (the group) or a refusal. A cycle or an
 * unresolvable link refuses rather than returning the last thing it saw:
 * a half-walked chain is exactly the "any available owner" answer I-227
 * forbids.
 */
export async function resolveGroupByChain(
  startID: string,
  startParent: string | null | undefined,
  lookup: (id: string) => Promise<{ parentID?: string | null } | undefined>
): Promise<Selection<string>> {
  if (startParent === undefined) return refuse("start-parent-unknown")
  if (startParent === null) return resolve(startID)

  const seen = new Set<string>([startID])
  let currentID = startParent
  for (let hop = 0; hop < MAX_CHAIN_DEPTH; hop++) {
    if (seen.has(currentID)) return refuse("cycle-in-parent-chain")
    seen.add(currentID)
    const next = await lookup(currentID)
    if (!next) return refuse("chain-link-missing")
    if (next.parentID === undefined || next.parentID === null) return resolve(currentID)
    currentID = next.parentID
  }
  return refuse("chain-too-deep")
}
