/**
 * hive-board work-item storage — the SINGLE code path for all WI-*.md writes.
 *
 * Contract: projects/hive-board/docs/SCHEMA.md (v1.0, ratified 2026-07-10).
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
 *   - subtasks / transitions: block sequences of flow maps
 *       - { content: "...", status: completed }
 *       - { at: 2026-07-06T09:00:00Z, from: todo, to: in_progress, by: x, session: ses_... }
 *   - transitions is ALWAYS the last frontmatter field (append surgery relies
 *     on finding the block; parser tolerates any order for robustness)
 *   - created/updated: date-only (YYYY-MM-DD); transition `at`: full ISO-8601 Z
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
  ]
  return `{ ${pairs.join(", ")} }`
}

function emitSubtask(s: Subtask): string {
  return `{ content: ${q(s.content)}, status: ${s.status} }`
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
  const transitions: Transition[] = []
  let body = ""

  let i = 0
  // Opening fence
  if (lines[0]?.trim() === "---") i = 1

  let currentList: "subtasks" | "transitions" | null = null
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
      } else {
        transitions.push({
          at: m.at ?? "",
          from: m.from === undefined || m.from === "null" ? null : asStatus(m.from, "backlog"),
          to: asStatus(m.to, "backlog"),
          by: m.by ?? "",
          ...(m.session !== undefined && m.session !== "null" ? { session: m.session } : {}),
          ...(m.absorbed !== undefined && m.absorbed !== "null" ? { absorbed: m.absorbed } : {}),
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

    if (key === "subtasks" || key === "transitions") {
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
  const withUpdated: ItemEdit = {
    ...edit,
    set: { updated: today(), ...(edit.set ?? {}) },
  }
  const next = applyEditToContent(content, withUpdated)
  atomicWrite(directory, id, next)
  return parseWorkItem(next)
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
