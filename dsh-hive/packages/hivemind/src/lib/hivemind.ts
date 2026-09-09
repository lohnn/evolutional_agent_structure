import path from "path"
import fs from "fs"
import crypto from "crypto"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HiveMessage {
  id: string
  sender: string
  recipient: string
  type: "question" | "info" | "result" | "request"
  content: string
  status: "pending" | "delivered" | "read"
  timestamp: string
  /**
   * Session group this message belongs to (the sender's groupID, which equals the
   * coordinator sessionID that spawned the sending capability). Used for group-scoped
   * inbox filtering so capabilities only see messages from their own session lineage.
   *
   * Policy: messages with no groupId are treated as legacy/pre-scoping messages and
   * are EXCLUDED from filtered reads. This is intentional — absent = unknown group =
   * treat as stale. A fresh session should never see week-old messages from an
   * unrelated prior session.
   */
  groupId?: string
  /**
   * Broadcast aggregate receipt (WI-051, locked decision 3): session IDs this
   * broadcast was successfully injected into live. Present ONLY on _broadcast
   * messages. Deliberately an aggregate — no per-recipient receipt structures;
   * broadcasts are rare and low-stakes, and "delivered to N sessions" is all a
   * sender-side view needs.
   */
  deliveredTo?: string[]
}

export interface InboxEntry {
  file: string
  subdir: string
  msg: HiveMessage
}

// ── Paths ─────────────────────────────────────────────────────────────────────

function hivemindPath(directory: string): string {
  return path.join(directory, ".opencode/hivemind")
}

function inboxPath(directory: string, recipient: string): string {
  return path.join(hivemindPath(directory), "inbox", recipient)
}

function makeFilename(): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 15)
  const rand = crypto.randomBytes(3).toString("hex")
  return `msg_${ts}_${rand}.json`
}

// ── Staleness (WI-051) ────────────────────────────────────────────────────────
//
// LAZY evaluation only (W-064): the plugin has no timer tick, so staleness is
// evaluated at read/dispatch time inside getInbox / listPendingInboxes / the
// tools — never on a schedule.
//
// Staleness is defined by STRONG signals, not age alone:
//   - dissolved-sender: the sender capability no longer exists as an ACTIVE
//     capability file. Detected by checking agents/capabilities/<name>.md.
//     The historical prefix form `dissolved/<name>` (observed in the wild:
//     senders stamped "dissolved/ui-ux") is also matched and treated as
//     dissolved-by-definition. STRONG — the sender can never act on a reply
//     and can never resend. A sender in agents/dissolved/ but not
//     capabilities/ is the canonical case; a sender in NEITHER (never a
//     capability, e.g. a coordinator agent name like "build") is NOT judged
//     stale by this signal — coordinator identity is session-scoped (WI-070),
//     not disk-scoped, and claiming otherwise would be inventing a contract.
//   - age: the message is very old AND still pending. WEAK — age alone is a
//     poor proxy (a month-old question to an active capability may still be
//     exactly what it needs to see). Surfaced, but treated as a weaker signal
//     than dissolved-sender: it never excludes on its own.
//
// A stale message is EXCLUDED FROM DELIVERY but NOT DELETED (SNG-020:
// excluding from delivery ≠ deleting). Deletion is a separate, explicit,
// audited act — see the retirement section below.

/** Conservative age threshold for the weak staleness signal (30 days). */
export const STALE_AGE_DAYS = 30

export type StaleSignal = "dissolved-sender" | "age"

export interface Staleness {
  /** True only when a STRONG signal fired (weak signals alone never exclude). */
  stale: boolean
  /** Strong signals — these justify exclusion from delivery on their own. */
  strong: StaleSignal[]
  /** Weak signals — surfaced, but never sufficient alone for exclusion. */
  weak: StaleSignal[]
}

/** All fired signals as a flat list (strong first), for audit-trail recording. */
export function staleSignals(s: Staleness): StaleSignal[] {
  return [...s.strong, ...s.weak]
}

/**
 * Evaluate staleness for one message. Exempt from the sender-existence check:
 *   - system senders ("_coordinator", "_broadcast") — not files on disk;
 *   - senders with no capability file ANYWHERE (neither capabilities/ nor
 *     dissolved/) — these are coordinator agent names ("build", "hive"),
 *     whose identity is session-scoped and owned by WI-070, not disk-scoped.
 * `now` is injectable for tests.
 */
export function evaluateStaleness(directory: string, msg: HiveMessage, now: Date = new Date()): Staleness {
  const strong: StaleSignal[] = []
  const weak: StaleSignal[] = []

  const sender = msg.sender
  const explicitDissolved = sender.startsWith("dissolved/")
  const bare = explicitDissolved ? sender.slice("dissolved/".length) : sender
  const isSystem = sender === "_coordinator" || sender === "_broadcast"

  if (!isSystem) {
    if (explicitDissolved) {
      // The sender was stamped with the dissolved/ prefix at write time —
      // dissolved by definition, no disk check needed.
      strong.push("dissolved-sender")
    } else {
      const activeDir = path.join(directory, ".opencode/agents/capabilities")
      const dissolvedDir = path.join(directory, ".opencode/agents/dissolved")
      const inActive = fs.existsSync(path.join(activeDir, `${bare}.md`))
      const inDissolved = fs.existsSync(path.join(dissolvedDir, `${bare}.md`))
      // Dissolved (in dissolved/, not capabilities/) OR was-once-a-capability-
      // and-now-purged (in NEITHER, but see the doc comment: a sender in
      // neither dir could also be a coordinator name — so the neither-case is
      // NOT judged stale; only the positive dissolved/ record is).
      if (!inActive && inDissolved) {
        strong.push("dissolved-sender")
      }
    }
  }

  const ageMs = now.getTime() - new Date(msg.timestamp).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  if (msg.status === "pending" && ageDays > STALE_AGE_DAYS) {
    weak.push("age")
  }

  return { stale: strong.length > 0, strong, weak }
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Read all pending/delivered messages for a capability.
 * Checks both the named inbox and _broadcast.
 *
 * @param groupId - When provided, only messages whose stamped groupId matches are
 *   returned. Messages with no groupId field (legacy/un-stamped) are EXCLUDED —
 *   absent groupId means "unknown session lineage", treated as stale.
 *   Pass undefined to read all messages regardless of group (e.g. for markAllRead).
 */
export function getInbox(directory: string, capabilityName: string, groupId?: string): InboxEntry[] {
  const subdirs = readerBuckets(capabilityName)
  const messages: InboxEntry[] = []

  for (const subdir of subdirs) {
    const dir = inboxPath(directory, subdir)
    let files: string[]
    try {
      files = fs.readdirSync(dir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.endsWith(".json")) continue
      try {
        const msg: HiveMessage = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
        if (msg.status === "pending" || msg.status === "delivered") {
          // Group-scope filter: if groupId is provided, only include messages stamped
          // with the same groupId. Messages with no groupId are excluded (legacy/stale).
          if (groupId !== undefined && msg.groupId !== groupId) continue
          messages.push({ file, subdir, msg })
        }
      } catch {
        // skip malformed
      }
    }
  }

  return messages.sort(
    (a, b) => new Date(a.msg.timestamp).getTime() - new Date(b.msg.timestamp).getTime()
  )
}

// ── Special addresses (I-033) ─────────────────────────────────────────────────
//
// Recipients prefixed with `_` are SPECIAL ADDRESSES, not capability names:
//   _coordinator — mail FOR the coordinator session itself;
//   _broadcast   — fire-and-forget to all sessions in the sender's group.
// They must NEVER be checked against the capability-name filesystem
// (agents/capabilities/<name>.md) — they have no file and never will, so such
// a check either rejects them or, worse, lets a stray `_foo` address mint a
// new on-disk bucket by accident. Only these two are legal; any other `_`
// recipient is refused at the write path so a typo becomes an error instead
// of a silently orphaned inbox directory.

export const SPECIAL_RECIPIENTS = new Set(["_coordinator", "_broadcast"])

export function isSpecialRecipient(recipient: string): boolean {
  return SPECIAL_RECIPIENTS.has(recipient)
}

/**
 * The inbox subdirs a READER of `name` should see (WI-083).
 *
 * A name that IS a special address reads only its own bucket — the `_`
 * addresses are roles, not capabilities, and there is no such thing as
 * "_coordinator's broadcast" distinct from the general one. Any other name
 * reads its own bucket plus the shared broadcast channel.
 *
 * One definition, consumed by BOTH the read (getInbox) and the acknowledge
 * (markAllRead) paths: W-141 demands the mutating path act on exactly the set
 * the read path showed, so the set must come from one place.
 */
export function readerBuckets(name: string): string[] {
  return isSpecialRecipient(name) ? [name] : [name, "_broadcast"]
}

/**
 * Write a message to a recipient's inbox. Returns the filename.
 * groupId should be the sender's groupID (coordinator sessionID) so the message
 * can be group-filtered by the recipient at read time.
 *
 * Throws on an unknown `_`-prefixed recipient (I-033): the two special
 * addresses above bypass the capability-name check by being EXPLICIT, not by
 * being names that happen not to collide with a file.
 */
export function sendMessage(directory: string, msg: Pick<HiveMessage, "sender" | "recipient" | "type" | "content"> & { groupId?: string }): string {
  if (msg.recipient.startsWith("_") && !isSpecialRecipient(msg.recipient)) {
    throw new Error(`Refused: unknown special recipient "${msg.recipient}". Only _coordinator and _broadcast are legal special addresses (I-033).`)
  }

  const dir = inboxPath(directory, msg.recipient)
  fs.mkdirSync(dir, { recursive: true })

  const envelope: HiveMessage = {
    id: `msg_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    sender: msg.sender,
    recipient: msg.recipient,
    type: msg.type,
    content: msg.content,
    status: "pending",
    timestamp: new Date().toISOString(),
    groupId: msg.groupId,
  }

  const filename = makeFilename()
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(envelope, null, 2), "utf8")
  return filename
}

/**
 * Flip a message file's status in place (W-119/WI-051): the schema has always
 * declared `delivered` and readers already treat it as not-yet-read, but no
 * code path ever WROTE it — a message reported "delivered in real-time" kept
 * showing as pending/queued forever. Called after a successful live
 * injection. Best-effort: a failed flip logs nothing here (the delivery
 * already happened; the file staying `pending` is the old behaviour, not a
 * new failure) and returns false.
 */
export function markDelivered(directory: string, recipient: string, file: string): boolean {
  const filePath = path.join(inboxPath(directory, recipient), file)
  try {
    const msg: HiveMessage = JSON.parse(fs.readFileSync(filePath, "utf8"))
    if (msg.status !== "pending") return false
    msg.status = "delivered"
    fs.writeFileSync(filePath, JSON.stringify(msg, null, 2), "utf8")
    return true
  } catch {
    return false
  }
}

/**
 * Record a successful live injection on a broadcast message's aggregate
 * receipt (WI-051, locked decision 3): append the sessionID to deliveredTo.
 * Best-effort like markDelivered; returns false on any failure.
 */
export function recordBroadcastDelivery(directory: string, file: string, sessionID: string): boolean {
  const filePath = path.join(inboxPath(directory, "_broadcast"), file)
  try {
    const msg: HiveMessage = JSON.parse(fs.readFileSync(filePath, "utf8"))
    msg.deliveredTo = [...(msg.deliveredTo ?? []), sessionID]
    // A broadcast that reached at least one session is "delivered" in the
    // same not-yet-read sense readers already understand.
    if (msg.status === "pending") msg.status = "delivered"
    fs.writeFileSync(filePath, JSON.stringify(msg, null, 2), "utf8")
    return true
  } catch {
    return false
  }
}

/**
 * Mark pending/delivered messages as read for a capability — SWEEP-ONLY-SHOWN
 * (WI-051, locked decision 2). When `groupId` is provided, only the messages
 * the group-filtered read path would have SHOWN are marked read; messages
 * from other session groups stay pending for their own lineage. (Previously
 * this loop had no groupId filter, so a capability in group B calling
 * hive_listen(mark_read:true) silently marked read messages from group A it
 * was never shown — retiring work it could not justify.)
 *
 * Returns the number of messages flipped, so callers can report honestly.
 */
export function markAllRead(directory: string, capabilityName: string, groupId?: string): number {
  const subdirs = readerBuckets(capabilityName)
  let marked = 0
  for (const subdir of subdirs) {
    const dir = inboxPath(directory, subdir)
    let files: string[]
    try {
      files = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue
      const filePath = path.join(dir, file)
      try {
        const msg: HiveMessage = JSON.parse(fs.readFileSync(filePath, "utf8"))
        if (msg.status === "pending" || msg.status === "delivered") {
          // Same group-scope filter as getInbox: absent groupId on the message
          // never matches a provided filter (legacy/stale lineage stays put).
          if (groupId !== undefined && msg.groupId !== groupId) continue
          msg.status = "read"
          fs.writeFileSync(filePath, JSON.stringify(msg, null, 2), "utf8")
          marked++
        }
      } catch {
        // skip
      }
    }
  }
  return marked
}

/**
 * List all inbox directories that have pending messages.
 * Returns array of { recipient, count }.
 *
 * @param groupId - When provided, only counts messages from that session group
 *   (same filter as getInbox). Pass undefined to count all pending messages.
 */
export function listPendingInboxes(directory: string, groupId?: string): { recipient: string; count: number }[] {
  const base = path.join(directory, ".opencode/hivemind/inbox")
  let dirs: string[]
  try {
    dirs = fs.readdirSync(base).filter(
      (d) => d !== "_broadcast" && fs.statSync(path.join(base, d)).isDirectory()
    )
  } catch {
    return []
  }

  const results: { recipient: string; count: number }[] = []
  for (const recipient of dirs) {
    const pending = getInbox(directory, recipient, groupId)
    if (pending.length > 0) {
      results.push({ recipient, count: pending.length })
    }
  }
  return results
}

/**
 * Format pending messages into a readable block for prompt injection.
 */
export function formatInboxForPrompt(messages: InboxEntry[]): string | null {
  if (!messages || messages.length === 0) return null

  const lines = ["## HIVEmind — Pending Messages\n"]

  for (const { subdir, msg } of messages) {
    const channel = subdir === "_broadcast" ? "[broadcast]" : `[to: ${msg.recipient}]`
    lines.push(`### Message from \`${msg.sender}\` ${channel}`)
    lines.push(`**Type**: ${msg.type}  |  **Sent**: ${msg.timestamp}`)
    lines.push(`**Content**: ${msg.content}`)
    lines.push("")
  }

  return lines.join("\n")
}

// ── Retirement + audit trail (WI-051) ─────────────────────────────────────────
//
// Retirement MOVES a message out of the active inbox into retired/<recipient>/
// — it is not deletion, and it is not bulk-mark-read. Every retirement is
// justified INDIVIDUALLY by naming the staleness signal(s) that fired (the
// spec's non-negotiable: "justify each retirement").
//
// AUDIT TRAIL — shape frozen NOW (W-126: adding an entry type to a shared
// append-only log silently redefines every reader, so there is exactly ONE
// entry shape and no versioning escape hatch):
//
//   .opencode/hivemind/retirement-log.jsonl   — one JSON object per line:
//     {
//       v: 1,                          // entry-shape version, always 1
//       at: string,                    // ISO timestamp of the retirement
//       file: string,                  // original filename (msg_*.json)
//       from: string,                  // source inbox subdir (recipient bucket)
//       to: string,                    // retired/<from>
//       id: string,                    // message id
//       sender: string,
//       recipient: string,
//       status: string,                // status at retirement time
//       timestamp: string,             // message's own send timestamp
//       signals: string[],             // staleness signals that fired ([] if forced)
//       retired_by: string,            // agent identity that ran the tool
//       reason: string,                // human-supplied justification (required)
//     }
//
// The log lives at the hivemind ROOT, not inside inbox/ and not inside
// retired/ (W-124: a record placed at the location being retired is not
// durable — it must survive the retirement, and any future sweep of retired/).

export interface RetirementRecord {
  ok: boolean
  file: string
  detail: string
}

function retirementLogPath(directory: string): string {
  return path.join(hivemindPath(directory), "retirement-log.jsonl")
}

function appendRetirementLog(directory: string, entry: Record<string, unknown>): void {
  const logPath = retirementLogPath(directory)
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8")
}

/**
 * Read the retirement audit log. Returns parsed entries (malformed lines are
 * reported as { _malformed: raw } rather than skipped, so the trail can never
 * silently lose a record).
 */
export function readRetirementLog(directory: string): Record<string, unknown>[] {
  try {
    const raw = fs.readFileSync(retirementLogPath(directory), "utf8")
    return raw
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>
        } catch {
          return { _malformed: l }
        }
      })
  } catch {
    return []
  }
}

/**
 * Retire a single message file: move it from inbox/<recipient>/<file> to
 * retired/<recipient>/<file> and append the audit entry. Pure disk operation —
 * argument validation happens at the tool layer, justification assembly at
 * the caller. Fails (ok:false) rather than throwing on any disk error, and
 * NEVER deletes: if the move cannot complete, the message stays put.
 *
 * `opts.signals` names the staleness signals that fired (empty array is
 * permitted ONLY for an explicit force-retire, which the audit entry then
 * shows as signals:[] — a visible, greppable anomaly, not a silent one).
 */
export function retireMessage(
  directory: string,
  recipient: string,
  file: string,
  opts: { signals: string[]; retiredBy: string; reason: string }
): RetirementRecord {
  const srcDir = inboxPath(directory, recipient)
  const srcPath = path.join(srcDir, file)
  const dstDir = path.join(hivemindPath(directory), "retired", recipient)
  const dstPath = path.join(dstDir, file)

  let msg: HiveMessage
  try {
    msg = JSON.parse(fs.readFileSync(srcPath, "utf8"))
  } catch (err) {
    return { ok: false, file, detail: `cannot read/parse ${srcPath}: ${String(err)}` }
  }

  try {
    fs.mkdirSync(dstDir, { recursive: true })
    fs.renameSync(srcPath, dstPath)
  } catch (err) {
    return { ok: false, file, detail: `move failed: ${String(err)}` }
  }

  try {
    appendRetirementLog(directory, {
      v: 1,
      at: new Date().toISOString(),
      file,
      from: recipient,
      to: `retired/${recipient}`,
      id: msg.id,
      sender: msg.sender,
      recipient: msg.recipient,
      status: msg.status,
      timestamp: msg.timestamp,
      signals: opts.signals,
      retired_by: opts.retiredBy,
      reason: opts.reason,
    })
  } catch (err) {
    // The move already happened; a log failure here is serious (W-124) but
    // must not half-roll-back the file. Report it loudly in the record.
    return { ok: false, file, detail: `moved, but audit-log append FAILED: ${String(err)}` }
  }

  return { ok: true, file, detail: `retired to retired/${recipient}/${file}` }
}

/**
 * One sweep candidate: a pending/delivered message with its staleness verdict.
 * Used by the retirement tool (to act) and by the queue dashboard (to show
 * live-vs-sediment without acting).
 */
export interface SweepEntry {
  recipient: string
  file: string
  msg: HiveMessage
  staleness: Staleness
}

/**
 * Enumerate every pending/delivered message across all inbox subdirs with its
 * lazily-evaluated staleness. Read-only — the sweep itself never moves or
 * marks anything.
 */
export function sweepInboxes(directory: string, groupId?: string, now: Date = new Date()): SweepEntry[] {
  const base = path.join(hivemindPath(directory), "inbox")
  let dirs: string[]
  try {
    dirs = fs.readdirSync(base).filter((d) => fs.statSync(path.join(base, d)).isDirectory())
  } catch {
    return []
  }

  const out: SweepEntry[] = []
  for (const recipient of dirs) {
    const dir = path.join(base, recipient)
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue
      try {
        const msg: HiveMessage = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
        if (msg.status !== "pending" && msg.status !== "delivered") continue
        if (groupId !== undefined && msg.groupId !== groupId) continue
        out.push({ recipient, file, msg, staleness: evaluateStaleness(directory, msg, now) })
      } catch {
        // skip malformed
      }
    }
  }
  return out
}

/**
 * Sender-side unread view (WI-051, per I-028: a queue dashboard, not raw
 * dumps). Every message `sender` has sent that is not yet read, across all
 * recipient inboxes — with staleness attached per message so live can be told
 * from sediment. Status is read from the FILE on disk, not from any reader's
 * memory. Includes `delivered` messages (injected live but not yet
 * acknowledged) — they are reported with their status so the sender can tell
 * "never reached" from "reached but unanswered".
 */
export interface SentEntry {
  recipient: string
  file: string
  msg: HiveMessage
  staleness: Staleness
}

export function sentBy(directory: string, sender: string, opts?: { unreadOnly?: boolean; now?: Date }): SentEntry[] {
  const unreadOnly = opts?.unreadOnly ?? true
  const now = opts?.now ?? new Date()
  const base = path.join(hivemindPath(directory), "inbox")
  let dirs: string[]
  try {
    dirs = fs.readdirSync(base).filter((d) => fs.statSync(path.join(base, d)).isDirectory())
  } catch {
    return []
  }

  const out: SentEntry[] = []
  for (const recipient of dirs) {
    const dir = path.join(base, recipient)
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue
      try {
        const msg: HiveMessage = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
        if (msg.sender !== sender) continue
        if (unreadOnly && msg.status === "read") continue
        out.push({ recipient, file, msg, staleness: evaluateStaleness(directory, msg, now) })
      } catch {
        // skip malformed
      }
    }
  }
  return out.sort((a, b) => new Date(a.msg.timestamp).getTime() - new Date(b.msg.timestamp).getTime())
}
