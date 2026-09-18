/**
 * hive-board work-item storage — the SINGLE code path for all WI-*.md writes.
 *
 * Contract: docs/board-viewer/SCHEMA.md (v1.0, ratified 2026-07-10).
 * Storage layout: <workspace>/.opencode/board/WI-NNN.md — flat dir, markdown
 * with ----fenced YAML frontmatter (same dialect as capability files), the
 * `status` field (not the path) drives the column.
 *
 * Write discipline (SCHEMA §4a):
 *   1. temp-file + atomic rename, never in-place
 *   2. advisory lockfile around every read-modify-write (board-wide — stricter
 *      than the per-item minimum, because bind/auto-register need cross-item
 *      atomicity for the 1:1 session⟷item invariant)
 *   3. re-read inside the lock before mutating
 *   4. transitions[] / released_sessions[] are APPEND-ONLY (I-049): mutations
 *      are line-level text surgery on the raw file — prior entries and the
 *      free-form body are never re-serialized.
 *
 * Serialization rules (canonical form, produced by serializeWorkItem):
 *   - frontmatter fenced by --- lines; body follows after one blank line
 *   - title: double-quoted; content of subtasks double-quoted
 *   - session/DRM/WI ids, dates, enums: bare (unquoted)
 *   - null fields: literal `null`
 *   - artifacts / tags / released_sessions: flow arrays [a, b] or []
 *   - subtasks / todo_mirror / transitions: block sequences of flow maps
 *       - { content: "...", status: completed }
 *       - { at: 2026-07-06T09:00:00Z, from: todo, to: in_progress, by: x, session: ses_... }
 *   - todo_mirror is a whole-replace cache-mirror (WI-038) preceded by its
 *     full-precision stamp `todo_mirror_updated` (ISO-8601, NOT date-only)
 *   - transitions is ALWAYS the last frontmatter field (append surgery relies
 *     on finding the block; parser tolerates any order for robustness)
 *   - created/updated: date-only (YYYY-MM-DD); transition `at` &
 *     todo_mirror_updated: full ISO-8601 Z
 */

import path from "path"
import fs from "fs"
import crypto from "crypto"

// ── Types (SCHEMA §2) ─────────────────────────────────────────────────────────

export type WorkItemStatus = "backlog" | "todo" | "in_progress" | "done"
export type WorkItemOrigin = "idea-first" | "session-first"
export type WorkItemPriority = "low" | "medium" | "high"
export type SubtaskStatus = "pending" | "in_progress" | "completed" | "cancelled"

export interface Subtask {
  content: string
  status: SubtaskStatus
}

/**
 * One entry of the live TodoWrite mirror (`todo_mirror`). Same shape as a
 * Subtask (content + the four opencode todo states), but a DISTINCT field with
 * a DIFFERENT WRITE CLASS — and the class, not the shape, is what matters:
 *
 *   `todo_mirror` = Class B, derived-rebuildable. Machine-written cache of an
 *                   OWNED session's live TodoWrite. Losing it costs a refresh.
 *   `subtasks`    = Class A, canonical. AUTHOR-WRITTEN plan on an item, and
 *                   typically an UNOWNED one. Losing it is unrecoverable.
 *
 * (SCHEMA §4, reclassified 2026-08-03. This comment previously said `subtasks`
 * "was specced for the same source but never got a writer" — that was true when
 * written and is now false: its producer is human authorship, and a census of
 * all 63 live items found the two fields perfectly disjoint by lifecycle. See
 * the tombstone in SCHEMA §4b before concluding they should be merged.)
 *
 * Kept separate so board-viewer's live-read↔mirror reconcile loop owns its own
 * field + full-precision stamp.
 */
export interface TodoMirrorEntry {
  content: string
  status: SubtaskStatus
}

export interface Transition {
  at: string
  /** null on the birth entry (transition into existence) */
  from: WorkItemStatus | null
  to: WorkItemStatus
  /** tool/actor that performed it, e.g. "hive_board_bind", "board:demote" */
  by: string
  /** the session involved, when one exists (omitted for board-side idea edits) */
  session?: string
  /** lineage: the pristine placeholder WI id dissolved into this bind (Q15 / SCHEMA §3 inv. 6) */
  absorbed?: string
  /**
   * Spec-revision tombstone (WI-064): the `spec_hash` of the body this edit
   * REPLACED. The superseded text itself lives at
   * `board/<id>/<superseded>.md` — this entry is the pointer and the record.
   *
   * Its presence is what makes a revision visible in the log without opening
   * the payload (W-103: a superseded revision is a tombstone, not an absence).
   * It also MARKS the entry as a revision rather than a work attempt — any
   * reader that treats a transition's `session` as "someone who worked on
   * this" must skip entries carrying `superseded` (see SCHEMA §4d).
   */
  superseded?: string
}

export interface WorkItem {
  id: string
  title: string
  status: WorkItemStatus
  owner_session: string | null
  group_id: string | null
  origin: WorkItemOrigin
  paused: boolean
  spec_hash: string | null
  released_sessions: string[]
  dream_id: string | null
  artifacts: string[]
  created: string
  updated: string
  priority: WorkItemPriority
  tags: string[]
  done_without_dream: boolean
  subtasks: Subtask[]
  /**
   * CACHE-MIRROR of the owning session's live TodoWrite list (WI-038 /
   * SCHEMA §1a portability). Whole-replace, never append (I-190): it mirrors
   * the session's COMPLETE current todos. Derived-rebuildable (I-105 /
   * I-113): reconstructable from the owning session alone, so a throwaway
   * cache — but stored on the item so the board renders it without the
   * session present. Empty array when unmirrored.
   */
  todo_mirror: TodoMirrorEntry[]
  /**
   * FULL-PRECISION ISO-8601 timestamp of the last todo_mirror refresh
   * (I-191/W-081: never the date-only granularity of `updated`). null until
   * first mirror write.
   */
  todo_mirror_updated: string | null
  transitions: Transition[]
  /** free-form markdown spec/notes (everything after the closing fence) */
  body: string
}

// ── Paths & IDs ───────────────────────────────────────────────────────────────

export function boardDir(directory: string): string {
  return path.join(directory, ".opencode/board")
}

export function itemPath(directory: string, id: string): string {
  return path.join(boardDir(directory), `${id}.md`)
}

/** WI-NNN, zero-padded 3 digits, max existing + 1 (same pattern as nextDreamId). */
export function nextItemId(directory: string): string {
  let max = 0
  let files: string[]
  try {
    files = fs.readdirSync(boardDir(directory))
  } catch {
    files = []
  }
  for (const f of files) {
    const m = f.match(/^WI-(\d+)\.md$/)
    if (m) {
      const n = parseInt(m[1]!, 10)
      if (n > max) max = n
    }
  }
  return `WI-${String(max + 1).padStart(3, "0")}`
}

// ── Spec hash ─────────────────────────────────────────────────────────────────

/**
 * Content hash of the spec body (stamped at bind, re-stamped at true-demote —
 * SCHEMA §2). Algorithm is module-owned: first 12 hex chars of SHA-256 over the
 * trimmed body. Always compare via this function, never re-implement.
 */
export function specHash(body: string): string {
  return crypto.createHash("sha256").update(body.trim()).digest("hex").slice(0, 12)
}

// ── Scalar emit/parse helpers ─────────────────────────────────────────────────

/** Double-quote a string, escaping backslashes and double-quotes. */
function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

/** Unquote a scalar (double or single quoted), or return as-is. */
function unq(s: string): string {
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1)
  }
  return s
}

/** Emit a token bare when safe (ids, enums, dates), quoted otherwise. */
function token(s: string): string {
  return /^[A-Za-z0-9_.:+-]+$/.test(s) ? s : q(s)
}

function flowArray(items: string[]): string {
  return `[${items.map(token).join(", ")}]`
}

/** Quote-aware split of flow content on top-level commas. */
function splitFlow(inner: string): string[] {
  const parts: string[] = []
  let cur = ""
  let inQ: string | null = null
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!
    if (inQ) {
      cur += ch
      if (ch === inQ && inner[i - 1] !== "\\") inQ = null
      continue
    }
    if (ch === '"' || ch === "'") {
      inQ = ch
      cur += ch
      continue
    }
    if (ch === ",") {
      parts.push(cur.trim())
      cur = ""
      continue
    }
    cur += ch
  }
  if (cur.trim() !== "") parts.push(cur.trim())
  return parts
}

function parseFlowArray(rest: string): string[] {
  const inner = rest.slice(1, -1).trim()
  if (inner === "") return []
  return splitFlow(inner).map(unq)
}

/** Parse `{ k: v, k2: "v 2" }` into a string map (values unquoted). */
function parseFlowMap(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  const t = s.trim()
  if (!t.startsWith("{") || !t.endsWith("}")) return out
  for (const part of splitFlow(t.slice(1, -1).trim())) {
    const idx = part.indexOf(":")
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k !== "") out[k] = unq(v)
  }
  return out
}

function emitTransition(t: Transition): string {
  const pairs = [
    `at: ${t.at}`,
    `from: ${t.from === null ? "null" : t.from}`,
    `to: ${t.to}`,
    `by: ${token(t.by)}`,
    ...(t.session !== undefined ? [`session: ${token(t.session)}`] : []),
    ...(t.absorbed !== undefined ? [`absorbed: ${token(t.absorbed)}`] : []),
    ...(t.superseded !== undefined ? [`superseded: ${token(t.superseded)}`] : []),
  ]
  return `{ ${pairs.join(", ")} }`
}

function emitSubtask(s: Subtask): string {
  return `{ content: ${q(s.content)}, status: ${s.status} }`
}

function emitTodoMirror(t: TodoMirrorEntry): string {
  return `{ content: ${q(t.content)}, status: ${t.status} }`
}

// ── Serializer (used for CREATION only — existing files are text-edited) ─────

export function serializeWorkItem(item: WorkItem): string {
  const lines: string[] = [
    "---",
    `id: ${item.id}`,
    `title: ${q(item.title)}`,
    `status: ${item.status}`,
    `owner_session: ${item.owner_session ?? "null"}`,
    `group_id: ${item.group_id ?? "null"}`,
    `origin: ${item.origin}`,
    `paused: ${item.paused}`,
    `spec_hash: ${item.spec_hash ?? "null"}`,
    `released_sessions: ${flowArray(item.released_sessions)}`,
    `dream_id: ${item.dream_id ?? "null"}`,
    `artifacts: ${flowArray(item.artifacts)}`,
    `created: ${item.created}`,
    `updated: ${item.updated}`,
    `priority: ${item.priority}`,
    `tags: ${flowArray(item.tags)}`,
    `done_without_dream: ${item.done_without_dream}`,
  ]
  if (item.subtasks.length === 0) {
    lines.push("subtasks: []")
  } else {
    lines.push("subtasks:")
    for (const s of item.subtasks) lines.push(`  - ${emitSubtask(s)}`)
  }
  lines.push(`todo_mirror_updated: ${item.todo_mirror_updated ?? "null"}`)
  if (item.todo_mirror.length === 0) {
    lines.push("todo_mirror: []")
  } else {
    lines.push("todo_mirror:")
    for (const t of item.todo_mirror) lines.push(`  - ${emitTodoMirror(t)}`)
  }
  // transitions LAST — append surgery relies on canonical placement
  if (item.transitions.length === 0) {
    lines.push("transitions: []")
  } else {
    lines.push("transitions:")
    for (const t of item.transitions) lines.push(`  - ${emitTransition(t)}`)
  }
  lines.push("---")
  const body = item.body.replace(/^\n+/, "").replace(/\n+$/, "")
  return lines.join("\n") + "\n\n" + (body === "" ? "" : body + "\n")
}

// ── Parser ────────────────────────────────────────────────────────────────────

const STATUSES: WorkItemStatus[] = ["backlog", "todo", "in_progress", "done"]

function asStatus(v: string | undefined, fallback: WorkItemStatus): WorkItemStatus {
  return STATUSES.includes(v as WorkItemStatus) ? (v as WorkItemStatus) : fallback
}

function nullable(v: string): string | null {
  return v === "null" || v === "" ? null : v
}

/**
 * Parse a WI-*.md file. Permissive: missing fields get schema defaults,
 * unknown fields are ignored (but preserved on disk — mutations are surgical).
 */
export function parseWorkItem(content: string): WorkItem {
  const lines = content.split("\n")
  const raw: Record<string, string> = {}
  const subtasks: Subtask[] = []
  const todoMirror: TodoMirrorEntry[] = []
  const transitions: Transition[] = []
  let body = ""

  let i = 0
  // Opening fence
  if (lines[0]?.trim() === "---") i = 1

  let currentList: "subtasks" | "todo_mirror" | "transitions" | null = null
  for (; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim() === "---") {
      body = lines.slice(i + 1).join("\n")
      break
    }
    if (line.trim() === "" || line.trim().startsWith("#")) continue

    // List item under subtasks/transitions
    const itemMatch = line.match(/^\s+-\s+(.*)$/)
    if (itemMatch && currentList) {
      const m = parseFlowMap(itemMatch[1]!)
      if (currentList === "subtasks") {
        subtasks.push({
          content: m.content ?? "",
          status: (m.status as SubtaskStatus) ?? "pending",
        })
      } else if (currentList === "todo_mirror") {
        todoMirror.push({
          content: m.content ?? "",
          status: (m.status as SubtaskStatus) ?? "pending",
        })
      } else {
        transitions.push({
          at: m.at ?? "",
          from: m.from === undefined || m.from === "null" ? null : asStatus(m.from, "backlog"),
          to: asStatus(m.to, "backlog"),
          by: m.by ?? "",
          ...(m.session !== undefined && m.session !== "null" ? { session: m.session } : {}),
          ...(m.absorbed !== undefined && m.absorbed !== "null" ? { absorbed: m.absorbed } : {}),
          ...(m.superseded !== undefined && m.superseded !== "null" ? { superseded: m.superseded } : {}),
        })
      }
      continue
    }

    // Top-level key
    const topMatch = line.match(/^([a-zA-Z_]+):\s*(.*)$/)
    if (!topMatch || line.startsWith(" ") || line.startsWith("\t")) {
      currentList = null
      continue
    }
    const key = topMatch[1]!
    const rest = topMatch[2]!.trim()

    if (key === "subtasks" || key === "todo_mirror" || key === "transitions") {
      currentList = key
      if (rest.startsWith("[") && rest.endsWith("]") && rest.slice(1, -1).trim() === "") {
        // empty flow form — nothing to collect
        currentList = null
      }
      continue
    }
    currentList = null
    raw[key] = rest
  }

  const arrays = (key: string): string[] => {
    const v = raw[key]
    if (v === undefined || !v.startsWith("[")) return []
    return parseFlowArray(v)
  }

  return {
    id: unq(raw.id ?? ""),
    title: unq(raw.title ?? ""),
    status: asStatus(raw.status, "backlog"),
    owner_session: nullable(unq(raw.owner_session ?? "null")),
    group_id: nullable(unq(raw.group_id ?? "null")),
    origin: (unq(raw.origin ?? "") === "session-first" ? "session-first" : "idea-first"),
    paused: raw.paused === "true",
    spec_hash: nullable(unq(raw.spec_hash ?? "null")),
    released_sessions: arrays("released_sessions"),
    dream_id: nullable(unq(raw.dream_id ?? "null")),
    artifacts: arrays("artifacts"),
    created: unq(raw.created ?? ""),
    updated: unq(raw.updated ?? ""),
    priority: (["low", "medium", "high"].includes(unq(raw.priority ?? "")) ? unq(raw.priority!) : "medium") as WorkItemPriority,
    tags: arrays("tags"),
    done_without_dream: raw.done_without_dream === "true",
    subtasks,
    todo_mirror: todoMirror,
    todo_mirror_updated: nullable(unq(raw.todo_mirror_updated ?? "null")),
    transitions,
    // Contract: body carries no leading/trailing newlines (serializer re-adds
    // canonical separation), so serialize→parse round-trips are stable.
    body: body.replace(/^\n+/, "").replace(/\s+$/, ""),
  }
}

// ── Reads (no lock needed — writers use atomic rename) ───────────────────────

export function readItem(directory: string, id: string): WorkItem | null {
  try {
    return parseWorkItem(fs.readFileSync(itemPath(directory, id), "utf8"))
  } catch {
    return null
  }
}

export function listItems(directory: string): WorkItem[] {
  return listItemsInDir(boardDir(directory))
}

/**
 * List work items from an ARBITRARY directory (fixtures, tests). Owns the
 * filename filter (/^WI-\d+\.md$/ — .locks/ and temp files never match).
 * listItems(workspaceRoot) is the .opencode/board wrapper over this.
 */
export function listItemsInDir(dir: string): WorkItem[] {
  let files: string[]
  try {
    files = fs.readdirSync(dir)
  } catch {
    return []
  }
  const items: WorkItem[] = []
  for (const f of files.sort()) {
    if (!/^WI-\d+\.md$/.test(f)) continue
    try {
      items.push(parseWorkItem(fs.readFileSync(path.join(dir, f), "utf8")))
    } catch {
      // unreadable item — skip, never crash the board
    }
  }
  return items
}

/** The item owned by a session, if any (1:1 invariant — Q7). */
export function findItemByOwner(directory: string, sessionID: string): WorkItem | null {
  for (const item of listItems(directory)) {
    if (item.owner_session === sessionID) return item
  }
  return null
}

// ── Title authority (the WI title-write contract — this module OWNS it) ──────

/**
 * opencode's auto-generated placeholder title, present on a freshly-created
 * session BEFORE the model writes a descriptive title. Format:
 *   `New session - <ISO-8601>`
 * e.g. "New session - 2026-07-20T22:18:00.584Z" (space-hyphen-space separator).
 * The ISO stamp: `T` separator; timezone is `Z` OR a `±HH:MM`/`±HHMM` offset;
 * millis optional. An empty/blank title is also treated as unsettled.
 *
 * This regex is the PUBLISHED, SHARED contract: board-viewer's stopgap fallback
 * gates on the SAME pattern for already-frozen historical items (I-180 — one
 * title-authority contract, not two). It is the superset board-viewer verified
 * empirically against the live opencode.db (327 sessions), so the two sides
 * cannot fork on what counts as a placeholder.
 */
export const PLACEHOLDER_TITLE_RE =
  /^\s*New session - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\s*$/

/** True if `title` is opencode's auto-placeholder (or empty) — i.e. NOT settled. */
export function isPlaceholderTitle(title: string | null | undefined): boolean {
  if (title === null || title === undefined) return true
  if (title.trim() === "") return true
  return PLACEHOLDER_TITLE_RE.test(title)
}

/**
 * Refresh the owning item's title from the real session title — ONLY when the
 * stored title is still a placeholder and the incoming one is real. This is the
 * single locked write path for post-creation title tracking (I-179/I-180); it
 * never overwrites a title the model/user already settled, and it is a no-op
 * when there is no owning item or nothing to fix. Returns the item id if
 * patched, else null.
 */
export async function refreshOwnerTitle(
  directory: string,
  sessionID: string,
  incomingTitle: string
): Promise<string | null> {
  if (isPlaceholderTitle(incomingTitle)) return null // incoming isn't real yet
  return withBoardLock(directory, () => {
    // Re-read inside the lock (SCHEMA §4a.3) — no stale in-memory copy.
    const item = listItems(directory).find((i) => i.owner_session === sessionID)
    if (!item) return null
    if (!isPlaceholderTitle(item.title)) return null // already settled — don't clobber
    if (item.title === incomingTitle) return null
    editItemUnlocked(directory, item.id, { set: { title: incomingTitle } })
    return item.id
  })
}

/** The item (if any) whose released_sessions[] tombstones this session. */
export function findItemReleasing(directory: string, sessionID: string): WorkItem | null {
  for (const item of listItems(directory)) {
    if (item.released_sessions.includes(sessionID)) return item
  }
  return null
}

// ── Advisory lock (SCHEMA §4a — two plugin instances on one dir are real) ────

const LOCK_RETRY_MS = 40
const LOCK_TIMEOUT_MS = 5000
const LOCK_STALE_MS = 15000

function lockPath(directory: string): string {
  return path.join(boardDir(directory), ".locks", "board.lock")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run `fn` while holding the board-wide advisory lock. NOT re-entrant — never
 * call a locked API (createItem/mutateItem/transition ops) from inside `fn`;
 * use the *Unlocked primitives instead.
 */
export async function withBoardLock<T>(directory: string, fn: () => T | Promise<T>): Promise<T> {
  const lp = lockPath(directory)
  fs.mkdirSync(path.dirname(lp), { recursive: true })
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    try {
      fs.writeFileSync(lp, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: "wx" })
      break
    } catch {
      // Lock held — steal if stale (holder crashed), else wait and retry
      try {
        const age = Date.now() - fs.statSync(lp).mtimeMs
        if (age > LOCK_STALE_MS) {
          fs.unlinkSync(lp)
          continue
        }
      } catch {
        continue // lock vanished between attempts — retry immediately
      }
      if (Date.now() > deadline) {
        throw new Error(`BOARD_LOCK_TIMEOUT: could not acquire ${lp} within ${LOCK_TIMEOUT_MS}ms`)
      }
      await sleep(LOCK_RETRY_MS)
    }
  }
  try {
    return await fn()
  } finally {
    try {
      fs.unlinkSync(lp)
    } catch {
      // already released/stolen — ignore
    }
  }
}

// ── Atomic write (temp file + rename) ─────────────────────────────────────────

function atomicWrite(directory: string, id: string, content: string): void {
  const dir = boardDir(directory)
  const tmpDir = path.join(dir, ".locks")
  fs.mkdirSync(tmpDir, { recursive: true })
  const tmp = path.join(tmpDir, `.tmp-${id}-${process.pid}-${Date.now()}`)
  fs.writeFileSync(tmp, content, "utf8")
  fs.renameSync(tmp, itemPath(directory, id))
}

// ── Text-surgery edit primitives (I-049: never reserialize existing files) ───

/** ISO date (YYYY-MM-DD, UTC) for created/updated. */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Full ISO-8601 UTC timestamp for transition entries. */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
}

/** The frontmatter region [start, end) line indexes (between the fences). */
function fmRegion(lines: string[]): { start: number; end: number } {
  let start = 0
  if (lines[0]?.trim() === "---") start = 1
  for (let i = start; i < lines.length; i++) {
    if (lines[i]!.trim() === "---") return { start, end: i }
  }
  return { start, end: lines.length }
}

/** Values accepted for scalar patches. */
export type ScalarPatch = Partial<{
  title: string
  status: WorkItemStatus
  owner_session: string | null
  group_id: string | null
  origin: WorkItemOrigin
  paused: boolean
  spec_hash: string | null
  dream_id: string | null
  priority: WorkItemPriority
  done_without_dream: boolean
  updated: string
}>

const QUOTED_SCALARS = new Set(["title"])

function emitScalar(key: string, value: string | boolean | null): string {
  if (value === null) return `${key}: null`
  if (typeof value === "boolean") return `${key}: ${value}`
  return QUOTED_SCALARS.has(key) ? `${key}: ${q(value)}` : `${key}: ${value}`
}

export interface ItemEdit {
  /** replace individual scalar frontmatter lines (line surgery) */
  set?: ScalarPatch
  /** append one entry to the transitions[] block (append-only, I-049) */
  appendTransition?: Transition
  /** append one id to the released_sessions flow array (append-only, I-049) */
  appendReleasedSession?: string
  /**
   * Replace the whole `artifacts` flow array. This is a CACHE-MIRROR field
   * (SCHEMA §2 / I-144): the dream's artifact ids are copied onto the item so
   * "what it produced" survives without the dream archive — a whole-list mirror
   * of the DRM's linked artifacts, not an append log. Whole-replace is correct
   * because the DRM is the source of truth for its own artifact set.
   */
  setArtifacts?: string[]
  /**
   * Whole-replace the `todo_mirror` block AND stamp `todo_mirror_updated`
   * (WI-038). This is a CACHE-MIRROR of the owning session's CURRENT
   * TodoWrite list (I-190: whole-list mirror, not an append log — the live
   * session is the source of truth for its own todos). `at` is a
   * full-precision ISO-8601 timestamp (I-191/W-081), NOT the date-only
   * granularity of `updated`. Identity-free (I-179): the caller already holds
   * the owning session id, so this routes through the one locked storage
   * module like any other edit. An empty `todos` clears the mirror to `[]`.
   */
  setTodoMirror?: { todos: TodoMirrorEntry[]; at: string }
  /**
   * Replace the spec BODY (WI-064). The ONLY primitive that writes outside the
   * frontmatter region — every other edit here is frontmatter line surgery.
   *
   * RETENTION IS STRUCTURAL, NOT OPTIONAL: `editItemUnlocked` writes the body
   * being replaced to `board/<id>/<old-spec-hash>.md` BEFORE the new content
   * lands. There is deliberately no flag to skip that. A caller cannot destroy
   * a spec body through this module even by mistake — which is the entire
   * point of WI-064 (the WI-055 body was lost precisely because the only
   * available path was hand text-surgery with no retention).
   *
   * Does NOT re-stamp `spec_hash`. That stamp is provenance from bind /
   * true-demote, and `reattachInfo()` compares it against the LIVE body hash
   * to decide re-attach vs fresh session ("the edit is the decision", Q13).
   * Re-stamping here would silently convert spec-changed → spec-unchanged and
   * re-attach a session to a spec it never agreed to.
   */
  setBody?: { body: string }
  /**
   * Add and/or remove `tags` as SET DELTAS — never a whole-list replace.
   *
   * WRITE CLASS (WI-064): tags are author-written content with no external
   * source of truth, so on the loss axis they sit with `subtasks` (canonical,
   * unrecoverable) and NOT with `todo_mirror`/`artifacts` (rebuildable cache
   * mirrors). Whole-replacing canonical content is a lost update between two
   * editors — the hazard that got post-creation `subtasks` editing rejected.
   *
   * Tags nevertheless GET a safe post-creation path where `subtasks` could
   * not, and the reason is the data's algebra, not its storage shape: tags are
   * an unordered SET of opaque tokens, so add/remove are commutative and
   * idempotent. Two concurrent editors sending `{add:["a"]}` and
   * `{add:["b"]}` converge on {a,b} in either order, because neither ever
   * transmits the whole set. `subtasks` is an ORDERED list of rich records
   * whose edits do not commute (reorder vs in-place content edit), which is
   * why it still needs its own design and remains unapproved.
   *
   * Idempotent (I-212): adding a present tag or removing an absent one is a
   * no-op. Callers should treat a tag appearing in BOTH add and remove as
   * malformed and refuse rather than guess an order.
   */
  editTags?: { add?: string[]; remove?: string[] }
}

/**
 * Apply an edit to the raw text of an item file. Pure function — exported for
 * testability. Everything not named in the edit is preserved byte-for-byte.
 */
export function applyEditToContent(content: string, edit: ItemEdit): string {
  let lines = content.split("\n")

  // 1. Scalar replacements (within the frontmatter region only)
  const patch: Record<string, string | boolean | null> = { ...(edit.set ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    const { start, end } = fmRegion(lines)
    let replaced = false
    for (let i = start; i < end; i++) {
      if (new RegExp(`^${key}:`).test(lines[i]!)) {
        lines[i] = emitScalar(key, value as string | boolean | null)
        replaced = true
        break
      }
    }
    if (!replaced) {
      // Field missing (hand-created file) — insert before transitions:/fence
      let insertAt = end
      for (let i = start; i < end; i++) {
        if (/^transitions:/.test(lines[i]!)) {
          insertAt = i
          break
        }
      }
      lines.splice(insertAt, 0, emitScalar(key, value as string | boolean | null))
    }
  }

  // 2. released_sessions append (single-line flow-array surgery)
  if (edit.appendReleasedSession !== undefined) {
    const sid = edit.appendReleasedSession
    const { start, end } = fmRegion(lines)
    let done = false
    for (let i = start; i < end; i++) {
      const m = lines[i]!.match(/^released_sessions:\s*\[(.*)\]\s*$/)
      if (m) {
        const inner = m[1]!.trim()
        lines[i] = `released_sessions: [${inner === "" ? sid : `${inner}, ${sid}`}]`
        done = true
        break
      }
    }
    if (!done) {
      const { end: e2 } = fmRegion(lines)
      lines.splice(e2, 0, `released_sessions: [${sid}]`)
    }
  }

  // 2b. artifacts whole-list replace (flow-array surgery — cache mirror, I-144)
  if (edit.setArtifacts !== undefined) {
    const rendered = `artifacts: [${edit.setArtifacts.map(token).join(", ")}]`
    const { start, end } = fmRegion(lines)
    let done = false
    for (let i = start; i < end; i++) {
      if (/^artifacts:/.test(lines[i]!)) {
        lines[i] = rendered
        done = true
        break
      }
    }
    if (!done) {
      // Field missing — insert before transitions:/fence (same rule as scalars).
      const { start: s2, end: e2 } = fmRegion(lines)
      let insertAt = e2
      for (let i = s2; i < e2; i++) {
        if (/^transitions:/.test(lines[i]!)) {
          insertAt = i
          break
        }
      }
      lines.splice(insertAt, 0, rendered)
    }
  }

  // 2c. todo_mirror whole-block replace + full-precision stamp (WI-038, I-190).
  //     Cache-mirror of the session's CURRENT todos: rip out any existing
  //     todo_mirror block + todo_mirror_updated line, then reinsert the fresh
  //     pair before transitions:/fence. Whole-replace, never append.
  if (edit.setTodoMirror !== undefined) {
    const { todos, at } = edit.setTodoMirror
    // 2c.i — excise the old todo_mirror block (header + its `  - ` entries, or
    // the empty flow form) and the old todo_mirror_updated scalar line.
    for (let scan = 0; scan < 2; scan++) {
      const { start, end } = fmRegion(lines)
      let removed = false
      for (let i = start; i < end; i++) {
        if (/^todo_mirror_updated:/.test(lines[i]!)) {
          lines.splice(i, 1)
          removed = true
          break
        }
        if (/^todo_mirror:/.test(lines[i]!)) {
          let j = i + 1
          while (j < fmRegion(lines).end && /^\s+-\s/.test(lines[j]!)) j++
          lines.splice(i, j - i)
          removed = true
          break
        }
      }
      if (!removed) break
    }
    // 2c.ii — build the fresh lines (block form if non-empty, else empty flow).
    const fresh: string[] = [`todo_mirror_updated: ${at}`]
    if (todos.length === 0) {
      fresh.push("todo_mirror: []")
    } else {
      fresh.push("todo_mirror:")
      for (const t of todos) fresh.push(`  - ${emitTodoMirror(t)}`)
    }
    // 2c.iii — insert before transitions:/fence (canonical placement).
    const { start: s3, end: e3 } = fmRegion(lines)
    let insertAt = e3
    for (let i = s3; i < e3; i++) {
      if (/^transitions:/.test(lines[i]!)) {
        insertAt = i
        break
      }
    }
    lines.splice(insertAt, 0, ...fresh)
  }

  // 2d. tags set-delta (flow-array surgery). Read the CURRENT value out of the
  //     text being edited — never from a caller-supplied snapshot — so two
  //     serialized editors each apply their delta to the other's result
  //     instead of clobbering it (I-190 / WI-064).
  if (edit.editTags !== undefined) {
    const { add = [], remove = [] } = edit.editTags
    const { start, end } = fmRegion(lines)
    let idx = -1
    for (let i = start; i < end; i++) {
      if (/^tags:/.test(lines[i]!)) {
        idx = i
        break
      }
    }
    const current =
      idx === -1
        ? []
        : (lines[idx]!.match(/^tags:\s*\[(.*)\]\s*$/)?.[1] ?? "")
            .split(",")
            .map((t) => unq(t.trim()))
            .filter((t) => t !== "")
    const removeSet = new Set(remove)
    const next = current.filter((t) => !removeSet.has(t))
    for (const t of add) if (!next.includes(t)) next.push(t)
    const rendered = `tags: [${next.map(token).join(", ")}]`
    if (idx === -1) {
      let insertAt = end
      for (let i = start; i < end; i++) {
        if (/^transitions:/.test(lines[i]!)) {
          insertAt = i
          break
        }
      }
      lines.splice(insertAt, 0, rendered)
    } else {
      lines[idx] = rendered
    }
  }

  // 3. transitions append (block surgery — insert after last entry)
  if (edit.appendTransition) {
    const entryLine = `  - ${emitTransition(edit.appendTransition)}`
    const { start, end } = fmRegion(lines)
    let headerIdx = -1
    for (let i = start; i < end; i++) {
      if (/^transitions:/.test(lines[i]!)) {
        headerIdx = i
        break
      }
    }
    if (headerIdx === -1) {
      // No transitions field at all — create block just before the fence
      lines.splice(end, 0, "transitions:", entryLine)
    } else if (/^transitions:\s*\[\s*\]\s*$/.test(lines[headerIdx]!)) {
      // `transitions: []` — convert the empty flow form to a block
      lines.splice(headerIdx, 1, "transitions:", entryLine)
    } else {
      // Walk past existing `  - ` entries, insert after the last one
      let insertAt = headerIdx + 1
      while (insertAt < fmRegion(lines).end && /^\s+-\s/.test(lines[insertAt]!)) insertAt++
      lines.splice(insertAt, 0, entryLine)
    }
  }

  // 4. BODY replacement — the ONLY step that writes outside fmRegion.
  //
  //    Done LAST, deliberately: every step above addresses lines by index
  //    inside the frontmatter region, and rewriting the tail first would leave
  //    those indexes describing a document that no longer exists. Keeping the
  //    body edit terminal means the frontmatter surgery above is byte-for-byte
  //    unaffected by it — unknown fields, comments and hand edits still
  //    round-trip exactly as before (I-049).
  //
  //    Reproduces serializeWorkItem's tail contract exactly: fence, blank
  //    line, body with leading/trailing newlines stripped, single trailing
  //    newline; empty body collapses to just the blank line.
  if (edit.setBody !== undefined) {
    const { end } = fmRegion(lines)
    const body = edit.setBody.body.replace(/^\n+/, "").replace(/\n+$/, "")
    const head = lines.slice(0, end + 1) // frontmatter + closing fence
    lines = body === "" ? [...head, "", ""] : [...head, "", ...body.split("\n"), ""]
  }

  return lines.join("\n")
}

// ── Unlocked write primitives (callers MUST hold withBoardLock) ──────────────

/**
 * Create a new item file (assigns the next WI id). MUST be called inside
 * withBoardLock — id assignment races otherwise (W-024/I-030).
 */
export function createItemUnlocked(
  directory: string,
  init: Omit<WorkItem, "id" | "created" | "updated"> & { created?: string; updated?: string }
): WorkItem {
  fs.mkdirSync(boardDir(directory), { recursive: true })
  const id = nextItemId(directory)
  const item: WorkItem = {
    ...init,
    id,
    created: init.created ?? today(),
    updated: init.updated ?? today(),
  }
  atomicWrite(directory, id, serializeWorkItem(item))
  return item
}

/**
 * Delete an item file. THE ONE SANCTIONED DELETION in the model (SCHEMA §3
 * invariant 6 / Q15): dissolving a PRISTINE session-first placeholder during
 * bind-time absorption, where the survivor's transitions[] entry records the
 * lineage (`absorbed: WI-NNN`). MUST be called inside withBoardLock, and only
 * after the pristine check passed. Any other deletion violates the append-only
 * model — demote instead.
 */
export function deleteItemUnlocked(directory: string, id: string): void {
  fs.unlinkSync(itemPath(directory, id))
}

/**
 * Read-modify-write an existing item via text surgery. MUST be called inside
 * withBoardLock. Re-reads from disk (no stale in-memory copy), stamps
 * `updated`, writes temp+rename. Returns the re-parsed item.
 */
export function editItemUnlocked(directory: string, id: string, edit: ItemEdit): WorkItem {
  const p = itemPath(directory, id)
  const content = fs.readFileSync(p, "utf8") // re-read inside the lock
  // Retention BEFORE replacement (WI-064). Deliberately unconditional and
  // unskippable: if a body is being replaced, the old one is durable first.
  // Content-addressed, so a no-op "revision" back to a previous text costs
  // nothing and re-writing the same revision is idempotent.
  if (edit.setBody !== undefined) {
    const prior = parseWorkItem(content).body
    if (prior.trim() !== "") writeRevisionUnlocked(directory, id, prior)
  }
  const withUpdated: ItemEdit = {
    ...edit,
    set: { updated: today(), ...(edit.set ?? {}) },
  }
  const next = applyEditToContent(content, withUpdated)
  atomicWrite(directory, id, next)
  return parseWorkItem(next)
}

// ── Spec revision archive (WI-064) ────────────────────────────────────────────

/**
 * Per-item revision directory: `.opencode/board/<id>/`.
 *
 * Safe alongside item files because `listItemsInDir` filters on
 * /^WI-\d+\.md$/ — a bare directory name never matches, so revisions are
 * invisible to enumeration and cost the board nothing to parse.
 */
export function revisionDir(directory: string, id: string): string {
  return path.join(boardDir(directory), id)
}

/**
 * Persist a superseded body, content-addressed by its own `specHash`.
 *
 * Write-once and never mutated: the filename IS the hash of the contents, so a
 * reader can verify the pointer by re-hashing, identical bodies dedupe for
 * free, and re-running the same revision is idempotent (I-212). Never pruned —
 * the board is gitignored, so there is no VCS underneath to recover from.
 * MUST be called inside withBoardLock.
 */
export function writeRevisionUnlocked(directory: string, id: string, body: string): string {
  const hash = specHash(body)
  const dir = revisionDir(directory, id)
  fs.mkdirSync(dir, { recursive: true })
  const rp = path.join(dir, `${hash}.md`)
  if (!fs.existsSync(rp)) fs.writeFileSync(rp, body.replace(/\n+$/, "") + "\n", "utf8")
  return hash
}

/** Hashes of every archived revision of an item (unordered — order via transitions[]). */
export function listRevisions(directory: string, id: string): string[] {
  try {
    return fs
      .readdirSync(revisionDir(directory, id))
      .filter((f) => /^[0-9a-f]{12}\.md$/.test(f))
      .map((f) => f.slice(0, -3))
      .sort()
  } catch {
    return []
  }
}

/** Read one archived revision by hash, or null. Verifies the content still hashes to its name. */
export function readRevision(directory: string, id: string, hash: string): string | null {
  try {
    const text = fs.readFileSync(path.join(revisionDir(directory, id), `${hash}.md`), "utf8")
    const body = text.replace(/^\n+/, "").replace(/\s+$/, "")
    return specHash(body) === hash ? body : null
  } catch {
    return null
  }
}

// ── Locked convenience wrappers ───────────────────────────────────────────────

/** Locked create. Do not call while already holding the board lock. */
export function createItem(
  directory: string,
  init: Omit<WorkItem, "id" | "created" | "updated"> & { created?: string; updated?: string }
): Promise<WorkItem> {
  return withBoardLock(directory, () => createItemUnlocked(directory, init))
}

/** Locked single-item edit. Do not call while already holding the board lock. */
export function mutateItem(directory: string, id: string, edit: ItemEdit): Promise<WorkItem> {
  return withBoardLock(directory, () => editItemUnlocked(directory, id, edit))
}
