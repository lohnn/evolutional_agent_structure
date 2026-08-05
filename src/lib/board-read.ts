/**
 * hive-board READ surface — filter, rank, budget and format, over an
 * already-parsed `WorkItem[]`. (WI-068)
 *
 * The board had six tools and every one was a write or a transition. There was
 * no sanctioned way to READ it, so an agent wanting to know what already exists
 * had to open raw WI-*.md files — exactly what `hive_board_create`'s own
 * description forbids. This module is the missing half.
 *
 * ── Why this is a PURE module and not tool code ─────────────────────────────
 * Tool code and tool descriptions freeze at process load, and the restart that
 * makes a change live kills the session that would verify it (W-127). So every
 * decision worth getting right — which items match, what order they come back
 * in, what a refusal says, where the byte budget cuts — lives HERE, over an
 * in-memory array, where `bun test` can exercise it with no restart and no
 * board on disk. `src/tools.ts` supplies `listItems(directory)` and returns the
 * string; it holds no logic that could be wrong in an unobservable way.
 *
 * ── Three tools, and MODE IS THE TOOL ───────────────────────────────────────
 * `list` enumerates (never bodies), `search` ranks (excerpt only), `read`
 * fetches full specs of named ids. This is a deliberate divergence from
 * `hive_dream_query`, which switches between index and full content at RUNTIME
 * based on result-set size — so a caller cannot predict what a call will cost
 * until it arrives. On the measured board corpus that unpredictability is
 * exactly where a context bomb hides: bodies run 1 B (p50) to 12 KB (max), 43
 * of 69 items are empty placeholders, and full content of five unlucky items is
 * ~14k tokens while the whole index is ~2.3k. Count predicts payload badly;
 * bytes predict it exactly. `list` is therefore a PROMISE of cheapness and
 * `read` is an EXPLICIT request to spend.
 *
 * ── No lock, and it is not a snapshot ───────────────────────────────────────
 * Reads take no board lock, deliberately. Writers use temp-file + atomic
 * rename, so any single-file read sees old bytes or new bytes, never a tear.
 * Holding the board lock across a whole-board read would block every
 * bind/create/respec and, given the lock's 5 s timeout, could make concurrent
 * WRITES fail spuriously: a read must never be able to break the write path.
 *
 * The honest cost, stated rather than papered over (I-277): a multi-item read
 * is NOT a cross-item snapshot. It may observe item A before and item B after a
 * concurrent write. Acceptable because every result here is advisory — nothing
 * downstream is allowed to treat a read as a consistent transaction.
 *
 * ── Guards live here, not only in the tool wrapper (SHADOW-026 / W-125) ─────
 * `tool()` is the identity function and `tool.schema` validates NOTHING at
 * runtime — a declared enum is advertising, not a gate (proven the hard way:
 * WI-065 reached disk with `status: in_progress`). Validation therefore lives
 * in this module, so ANY caller gets it, not just the one that goes through the
 * declared schema. There is no FORBIDDEN_* list here because there is no write
 * path: an undeclared key can only be ignored.
 *
 * ── Ordering is POLICY and is deliberately NOT shared with the viewer ───────
 * `recencyKey` is imported from lib/board-recency.ts because "how recent is
 * this item" is a FACT — two implementations disagreeing would be a bug by
 * definition (it was: I-191). The ORDER items are listed in is a POLICY about a
 * surface, and this surface's job (read a board you cannot see) differs from a
 * kanban column's. board-viewer's `sortForColumn` stays where it is; a shared
 * module that one caller ignores is worse than no shared module, because it
 * advertises a contract that is not real.
 *
 * `computeProblems` (lib/board-invariants.ts) is shared for the same reason
 * `recencyKey` is: an invariant violation is a FACT. It arrived here in WI-071
 * for a reason worth stating — it was computed per CARD in the viewer, so
 * "which items are in an illegal state" was a board-wide question no surface
 * could answer. That is what the ⚠ marker and header count below exist to fix,
 * and why `checkImpossible` no longer has to hand out a manual workaround.
 */

import type { WorkItem, WorkItemPriority, WorkItemStatus } from "./board-store.js"
import { recencyKey } from "./board-recency.js"
import { computeProblems } from "./board-invariants.js"
import { tokenise } from "./text-tokens.js"

// ── Result contract ───────────────────────────────────────────────────────────

/**
 * Every entry point returns ok-or-refusal rather than throwing. A refusal is a
 * COMPLETE message for the caller: what was wrong, and what to send instead.
 */
export interface Refusal {
  ok: false
  error: string
}

export interface ListResult {
  ok: true
  /** Rendered index, ready to return from a tool. */
  text: string
  /** The items that matched the filters, in presentation order. */
  matched: WorkItem[]
  /** Items considered before filtering. */
  total: number
  /** Items actually rendered (< matched.length when `limit` cut it). */
  shown: number
}

export interface SearchHit {
  id: string
  title: string
  status: WorkItemStatus
  score: number
  excerpt: string
}

export interface SearchResult {
  ok: true
  text: string
  hits: SearchHit[]
  /** Items with a non-zero score (the pool `k` was taken from). */
  scored: number
  total: number
}

export interface ReadResult {
  ok: true
  text: string
  /** Ids rendered in full. */
  found: string[]
  /** Requested ids with no item on the board — ALWAYS reported by name. */
  missing: string[]
  /** Ids the byte budget pushed to a follow-up call — also reported by name. */
  deferred: string[]
  /** Rendered size, in characters. */
  bytes: number
}

// ── Filter vocabulary ─────────────────────────────────────────────────────────

/**
 * `live` (default) is every status except `done`; `all` includes done.
 *
 * The default is a judgement about what "what's on the board?" means when a
 * caller does not say: 46 of 69 items are done, so an unfiltered dump is
 * two-thirds archaeology. `all` is a first-class value rather than "omit the
 * filter" precisely so the default can be narrow without being a trap — the
 * enum itself tells the caller that a wider view exists. `search` ignores this
 * axis entirely and spans every status, so solved work stays findable.
 */
export const STATUS_FILTERS = ["live", "all", "backlog", "todo", "in_progress", "done"] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

/** `owned` = a session holds it; `none` = un-owned; `any` = don't care. */
export const OWNER_FILTERS = ["any", "owned", "none"] as const
export type OwnerFilter = (typeof OWNER_FILTERS)[number]

export const PRIORITY_FILTERS = ["any", "low", "medium", "high"] as const
export type PriorityFilter = (typeof PRIORITY_FILTERS)[number]

const LIVE_STATUSES: WorkItemStatus[] = ["backlog", "todo", "in_progress"]

// ── Bounds ────────────────────────────────────────────────────────────────────

export const DEFAULT_K = 8
export const MAX_K = 30
export const MAX_LIMIT = 500
export const DEFAULT_MAX_BYTES = 24_000
export const MIN_MAX_BYTES = 500
export const MAX_MAX_BYTES = 120_000
const EXCERPT_LEN = 200
const MAX_HISTORY_LINES = 8
/** Title tokens contribute this much on top of full-text coverage. */
const TITLE_BOOST = 0.25

// ── Guards ────────────────────────────────────────────────────────────────────

function refuse(error: string): Refusal {
  return { ok: false, error }
}

/**
 * Validate an enum-ish argument IMPERATIVELY and list the accepted set in the
 * refusal. The declared tool schema does not do this — see the module header.
 */
function checkEnum<T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T | Refusal {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    return refuse(
      `Refused (BAD_ENUM): ${field}=${JSON.stringify(value)} is not a valid value. ` +
        `Accepted: ${allowed.join(", ")}. (Default: ${fallback}.)`
    )
  }
  return value as T
}

/** Validate a bounded integer. Rejects non-integers, negatives and absurd values. */
function checkInt(
  field: string,
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number | Refusal {
  if (value === undefined || value === null) return fallback
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return refuse(
      `Refused (BAD_NUMBER): ${field}=${JSON.stringify(value)} must be a whole number ` +
        `between ${min} and ${max}. (Default: ${fallback}.)`
    )
  }
  if (value < min || value > max) {
    return refuse(
      `Refused (OUT_OF_RANGE): ${field}=${value} is outside ${min}–${max}. ` +
        `(Default: ${fallback}.) The ceiling exists because this tool's payload is bounded on purpose.`
    )
  }
  return value
}

function isRefusal(v: unknown): v is Refusal {
  return typeof v === "object" && v !== null && (v as Refusal).ok === false
}

/**
 * Reject filter combinations that CANNOT match, with the correction (I-050).
 *
 * An empty result is ambiguous between "nothing matches right now" and "this
 * question can never be answered yes", and the second one silently teaches the
 * caller something false about the board. SCHEMA §3 invariant 1 makes
 * `in_progress` ⟺ owned, so two combinations are structurally unanswerable.
 *
 * Note what the refusal text has to admit: the invariant constrains what is
 * LEGAL, not what is on disk — WI-065 really was written as in_progress with a
 * null owner. A caller filtering this way may therefore be legitimately HUNTING
 * corruption, and a refusal that only says "impossible" blinds exactly them.
 *
 * WI-071 changed what this refusal can offer. It used to route such a caller at
 * a MANUAL WORKAROUND — "read the owner column, un-owned rows are marked —" —
 * which was honest but was, in its author's own words, a workaround for the
 * absence of `problems[]` on this surface. That absence is now closed: the
 * violation marker and header count are a real answer, so the refusal points at
 * them instead. It still must never read as "no such state exists".
 */
function checkImpossible(status: StatusFilter, owner: OwnerFilter): Refusal | null {
  if (status === "in_progress" && owner === "none") {
    return refuse(
      `Refused (IMPOSSIBLE_FILTER): status=in_progress + owner=none cannot match. ` +
        `SCHEMA §3 invariant 1 makes in_progress ⟺ owner_session set, so this asks for a state the schema forbids — ` +
        `an empty list here would read as "nothing in progress", which is a different and false claim.\n` +
        `  • To see work in flight:      status="in_progress" (owner filter omitted)\n` +
        `  • To see un-owned work:       owner="none" (status "live" covers backlog + todo)\n` +
        `  • To HUNT invariant violations: a schema invariant constrains what is LEGAL, never what is STORED. ` +
        `Illegal states DO reach disk — WI-065 was written in precisely this state — so this filter is refused ` +
        `for asking an unanswerable question, NOT because the state cannot exist. You do not need a filter to ` +
        `find them: EVERY hive_board_list call already checks, counts violations in its header line, and marks ` +
        `each violating row "⚠" with the invariant it breaks. Run status="all" (widest net, done items included) ` +
        `and read the header. hive_board_read shows the same per named item.`
    )
  }
  if ((status === "backlog" || status === "todo") && owner === "owned") {
    return refuse(
      `Refused (IMPOSSIBLE_FILTER): status=${status} + owner=owned cannot match. ` +
        `Ownership is stamped by bind/start, which moves an item to in_progress; releasing it (demote) clears the owner. ` +
        `So a ${status} item is un-owned by construction.\n` +
        `  • Owned work:                 status="in_progress"\n` +
        `  • Everything queued and free: status="${status}" (owner filter omitted)`
    )
  }
  return null
}

// ── Small formatting helpers ──────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n === 0) return "—"
  if (n < 1000) return `${n}`
  return `${(n / 1000).toFixed(1)}k`
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length)
}

const PRIORITY_ORDER: Record<WorkItemPriority, number> = { high: 0, medium: 1, low: 2 }
const STATUS_ORDER: Record<WorkItemStatus, number> = {
  in_progress: 0,
  todo: 1,
  backlog: 2,
  done: 3,
}

const PRIORITY_SHORT: Record<WorkItemPriority, string> = { high: "high", medium: "med", low: "low" }

/**
 * Presentation order for the read surface: work in flight first, then queued,
 * then captured, then done; within a status group, priority, then newest first,
 * then a deterministic id tiebreak so a tie can never fall through to readdir
 * order (I-191/W-081).
 *
 * This is THIS SURFACE's policy — see the module header on why it is not shared
 * with the viewer's column ordering.
 */
function byReadOrder(a: WorkItem, b: WorkItem): number {
  const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  if (s !== 0) return s
  const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  if (p !== 0) return p
  const ka = recencyKey(a)
  const kb = recencyKey(b)
  if (ka !== kb) return kb.localeCompare(ka)
  return b.id.localeCompare(a.id)
}

/** Short session marker — full ids are noise in an index line. */
function shortSession(id: string | null): string {
  if (!id) return "—"
  return id.length > 10 ? `${id.slice(0, 10)}…` : id
}

// ── list ──────────────────────────────────────────────────────────────────────

export interface ListOptions {
  status?: unknown
  owner?: unknown
  priority?: unknown
  limit?: unknown
}

/**
 * Enumerate the board. NEVER includes bodies — that promise is the whole reason
 * this tool is separate from `read`.
 */
export function listBoard(items: WorkItem[], opts: ListOptions = {}): ListResult | Refusal {
  const status = checkEnum("status", opts.status, STATUS_FILTERS, "live")
  if (isRefusal(status)) return status
  const owner = checkEnum("owner", opts.owner, OWNER_FILTERS, "any")
  if (isRefusal(owner)) return owner
  const priority = checkEnum("priority", opts.priority, PRIORITY_FILTERS, "any")
  if (isRefusal(priority)) return priority
  const limit = checkInt("limit", opts.limit, 1, MAX_LIMIT, MAX_LIMIT)
  if (isRefusal(limit)) return limit

  const impossible = checkImpossible(status, owner)
  if (impossible) return impossible

  const matched = items
    .filter((it) => {
      if (status === "live") {
        if (!LIVE_STATUSES.includes(it.status)) return false
      } else if (status !== "all" && it.status !== status) return false
      if (owner === "owned" && !it.owner_session) return false
      if (owner === "none" && it.owner_session) return false
      if (priority !== "any" && it.priority !== priority) return false
      return true
    })
    .sort(byReadOrder)

  const shown = matched.slice(0, limit)
  // Invariant violations are counted over EVERYTHING MATCHED, not just the
  // rendered page: "how many items are in an illegal state" is the board-wide
  // question this surface exists to answer, and a count that silently excluded
  // what `limit` cut would answer a narrower question under the same name.
  const problemsOf = new Map(matched.map((it) => [it.id, computeProblems(it)]))
  const violating = matched.filter((it) => problemsOf.get(it.id)!.length > 0)
  const counts: Record<string, number> = {}
  for (const it of matched) counts[it.status] = (counts[it.status] ?? 0) + 1
  const breakdown =
    (["in_progress", "todo", "backlog", "done"] as WorkItemStatus[])
      .filter((s) => counts[s])
      .map((s) => `${s} ${counts[s]}`)
      .join(" · ") || "none"

  const lines: string[] = []
  lines.push(
    `hive-board index — ${matched.length} of ${items.length} items match ` +
      `(status=${status}, owner=${owner}, priority=${priority}).`
  )
  lines.push(`  ${breakdown}`)
  if (violating.length > 0) {
    lines.push(
      `  ⚠ ${violating.length} of ${matched.length} matched item${violating.length === 1 ? " is" : "s are"} ` +
        `in an ILLEGAL state (SCHEMA §3): ${violating.map((it) => it.id).join(", ")} — marked ⚠ below. ` +
        `Detection only; the state is on disk and repairing it is a separate decision.`
    )
  }
  if (status === "live") {
    lines.push(`  Done items are EXCLUDED by default — pass status="all" to include them.`)
  }
  lines.push("")

  if (shown.length === 0) {
    lines.push("  (no items match — the filters are valid, the board simply has none)")
  } else {
    lines.push(
      `  ${pad("id", 7)}${pad("status", 13)}${pad("pri", 6)}${pad("owner", 12)}${pad("recent", 12)}${pad("body", 6)}title / tags`
    )
    for (const it of shown) {
      const tags = it.tags.length > 0 ? `  [${it.tags.join(", ")}]` : ""
      const problems = problemsOf.get(it.id)!
      // The violation text rides on the row rather than being a bare glyph:
      // violating rows are rare by construction, and "⚠" alone would send the
      // reader to hive_board_read just to learn WHICH invariant broke.
      const mark = problems.length > 0 ? `  ⚠ ILLEGAL: ${problems.join("; ")}` : ""
      lines.push(
        `  ${pad(it.id, 7)}${pad(it.status, 13)}${pad(PRIORITY_SHORT[it.priority], 6)}` +
          `${pad(shortSession(it.owner_session), 12)}${pad(recencyKey(it).slice(0, 10), 12)}` +
          `${pad(formatBytes(it.body.length), 6)}${it.title}${tags}${mark}`
      )
    }
  }
  if (shown.length < matched.length) {
    lines.push("")
    lines.push(`  … ${matched.length - shown.length} more matched but limit=${limit} cut the list.`)
  }
  lines.push("")
  lines.push(
    `Bodies are never included here — "body" is the spec's SIZE, so you can predict what reading it costs. ` +
      `Full specs: hive_board_read(ids: "WI-012,WI-031"). Free-text across ALL statuses: hive_board_search(query: "…").`
  )
  return { ok: true, text: lines.join("\n"), matched, total: items.length, shown: shown.length }
}

// ── Ranking (shared by search and the create-time advisory) ───────────────────

/** Everything about an item a free-text query could reasonably match. */
function searchableText(it: WorkItem): string {
  return [it.title, it.tags.join(" "), it.body].join(" ")
}

/**
 * Score one item against a tokenised query: QUERY COVERAGE (|q ∩ d| / |q|),
 * plus a boost for tokens that hit the title.
 *
 * Coverage, not Jaccard, and for the same reason dream-rank.ts made the same
 * call independently: symmetric Jaccard punishes long documents, so a 3-token
 * query against a 2 KB spec caps near zero even on a perfect hit. Coverage asks
 * "how much of the query does this item touch", which is the actual question.
 * The title boost encodes that a hit in a 6-word title is stronger evidence
 * than the same hit buried in a 2 KB body.
 */
export function scoreItem(it: WorkItem, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0
  const doc = tokenise(searchableText(it))
  let hits = 0
  for (const t of queryTokens) if (doc.has(t)) hits++
  const coverage = hits / queryTokens.size

  const titleTokens = tokenise(it.title)
  let titleHits = 0
  for (const t of queryTokens) if (titleTokens.has(t)) titleHits++
  const boost = (titleHits / queryTokens.size) * TITLE_BOOST

  return Math.round((coverage + boost) * 1000) / 1000
}

/**
 * ~200 chars of body, WINDOWED on the first query-token hit when there is one.
 * A fixed head-of-body excerpt on a 12 KB spec routinely shows a heading and
 * nothing that explains the match.
 */
export function excerptFor(it: WorkItem, queryTokens: Set<string>): string {
  const body = it.body.replace(/\s+/g, " ").trim()
  if (body === "") return "(no body — placeholder item)"
  const lower = body.toLowerCase()
  let at = -1
  for (const t of queryTokens) {
    const i = lower.indexOf(t)
    if (i !== -1 && (at === -1 || i < at)) at = i
  }
  if (at <= 0 || body.length <= EXCERPT_LEN) {
    return body.length > EXCERPT_LEN ? `${body.slice(0, EXCERPT_LEN)}…` : body
  }
  const start = Math.max(0, at - 60)
  const slice = body.slice(start, start + EXCERPT_LEN)
  return `${start > 0 ? "…" : ""}${slice}${start + EXCERPT_LEN < body.length ? "…" : ""}`
}

// ── search ────────────────────────────────────────────────────────────────────

export interface SearchOptions {
  k?: unknown
}

/**
 * Free-text ranked shortlist across EVERY status (done included — solved work
 * is the most valuable thing to find before re-filing it).
 *
 * Ranking rather than a threshold detector, deliberately. A near-duplicate
 * check with a cutoff was measured on the real board and fired on 0 of 2346
 * pairs, while a genuine re-file of an existing item in different words scored
 * 0.31 — it could not catch the case it existed for, and everything below the
 * cutoff was shared project vocabulary. Ranking works BECAUSE it never has to
 * name a cutoff: it orders candidates and the agent judges (I-104).
 */
export function searchBoard(
  items: WorkItem[],
  query: unknown,
  opts: SearchOptions = {}
): SearchResult | Refusal {
  if (typeof query !== "string" || query.trim() === "") {
    return refuse(
      `Refused (EMPTY_QUERY): query is required — free text describing what you are looking for, ` +
        `e.g. "push notification opt-out" or "duplicate detection on the board". ` +
        `To enumerate rather than search, use hive_board_list.`
    )
  }
  const k = checkInt("k", opts.k, 1, MAX_K, DEFAULT_K)
  if (isRefusal(k)) return k

  const queryTokens = tokenise(query)
  if (queryTokens.size === 0) {
    return refuse(
      `Refused (NO_USABLE_TOKENS): "${query}" contains no token of 3+ characters, so nothing can be scored. ` +
        `Tokenisation lowercases, strips punctuation and drops 1–2 character words — which means short but real ` +
        `terms (db, id, ui, os) vanish too. Add a longer word, or use hive_board_list to enumerate instead.`
    )
  }

  const scoredAll = items
    .map((it) => ({ it, score: scoreItem(it, queryTokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.it.id.localeCompare(a.it.id))

  const hits: SearchHit[] = scoredAll.slice(0, k).map(({ it, score }) => ({
    id: it.id,
    title: it.title,
    status: it.status,
    score,
    excerpt: excerptFor(it, queryTokens),
  }))

  const lines: string[] = []
  if (hits.length === 0) {
    lines.push(
      `No item scored above zero for "${query}" — ${items.length} items searched, across ALL statuses.`
    )
    lines.push(`  Tokens used: ${[...queryTokens].join(", ")}`)
    lines.push(
      `  This is a real empty result, not a filtered one: nothing on the board shares a word with that query. ` +
        `Try fewer or more common words, or hive_board_list to see what exists.`
    )
    return { ok: true, text: lines.join("\n"), hits, scored: 0, total: items.length }
  }

  lines.push(
    `hive-board search "${query}" — showing ${hits.length} of ${scoredAll.length} items with a non-zero score ` +
      `(${items.length} searched, all statuses).`
  )
  lines.push(
    `Scores are LEXICAL token overlap, not a relevance verdict and not a duplicate verdict — read them and judge.`
  )
  lines.push("")
  for (const h of hits) {
    lines.push(`  ${h.score.toFixed(3)}  ${pad(h.id, 7)}${pad(h.status, 13)}${h.title}`)
    lines.push(`         ${h.excerpt}`)
  }
  lines.push("")
  lines.push(`Full spec of anything above: hive_board_read(ids: "${hits[0]!.id}").`)
  return { ok: true, text: lines.join("\n"), hits, scored: scoredAll.length, total: items.length }
}

// ── read ──────────────────────────────────────────────────────────────────────

export interface ReadOptions {
  max_bytes?: unknown
}

/**
 * Normalise a requested id, or null if it is not id-shaped.
 * Tolerant about zero-padding and case (`wi-68` → `WI-068`) because the
 * alternative is a "not found" that looks like a missing item rather than a
 * malformed request.
 */
export function normaliseItemId(raw: string): string | null {
  const m = raw.trim().toUpperCase().match(/^WI-(\d+)$/)
  if (!m) return null
  return `WI-${String(parseInt(m[1]!, 10)).padStart(3, "0")}`
}

function renderHistory(it: WorkItem): string[] {
  const out: string[] = []
  const entries = it.transitions
  if (entries.length === 0) {
    out.push(`  history    (none recorded)`)
    return out
  }
  const shown = entries.slice(-MAX_HISTORY_LINES)
  const omitted = entries.length - shown.length
  const revisions = entries.filter((t) => t.superseded).length
  out.push(
    `  history    ${entries.length} entr${entries.length === 1 ? "y" : "ies"}` +
      (revisions > 0
        ? ` · ${revisions} spec revision${revisions === 1 ? "" : "s"} archived (hash on the entry)`
        : "")
  )
  if (omitted > 0) out.push(`             … ${omitted} older entr${omitted === 1 ? "y" : "ies"} omitted`)
  for (const t of shown) {
    const who = t.session ? ` session:${shortSession(t.session)}` : ""
    const extra = [
      t.absorbed ? `absorbed:${t.absorbed}` : "",
      t.superseded ? `superseded:${t.superseded}` : "",
    ]
      .filter(Boolean)
      .join(" ")
    out.push(
      `             ${t.at}  ${t.from ?? "∅"} → ${t.to}  by ${t.by}${who}${extra ? `  ${extra}` : ""}`
    )
  }
  return out
}

/** One item, fully rendered. Pure — the budget loop decides whether to keep it. */
function renderItem(it: WorkItem): string {
  const lines: string[] = []
  lines.push(`═══ ${it.id} — "${it.title}"`)
  lines.push(
    `  status     ${it.status}${it.paused ? " (PAUSED)" : ""} · owner ${it.owner_session ?? "none"}` +
      (it.group_id ? ` · group ${it.group_id}` : "")
  )
  // Directly under `status`, because every checked invariant is a claim about
  // the status/owner/dream fields on the line above — the violation is only
  // legible next to the state that violates it.
  const problems = computeProblems(it)
  if (problems.length > 0) {
    for (const p of problems) lines.push(`  ⚠ ILLEGAL  ${p}`)
    lines.push(
      `             This item VIOLATES SCHEMA §3. The schema constrains what is LEGAL, never what is ` +
        `STORED, so this is a real record in a forbidden state — not a parse error. Reported, never ` +
        `repaired: do not "fix" it as a side effect of having read it.`
    )
  }
  lines.push(
    `  priority   ${it.priority} · origin ${it.origin} · tags ${it.tags.length > 0 ? it.tags.join(", ") : "(none)"}`
  )
  lines.push(
    `  dates      created ${it.created} · updated ${it.updated}` +
      (it.dream_id ? ` · dream ${it.dream_id}` : "") +
      (it.done_without_dream ? " · done_without_dream" : "")
  )
  if (it.spec_hash) lines.push(`  spec_hash  ${it.spec_hash}`)
  if (it.released_sessions.length > 0) {
    lines.push(`  released   ${it.released_sessions.map(shortSession).join(", ")} (tombstoned — cannot re-bind)`)
  }
  lines.push(...renderHistory(it))

  lines.push("")
  if (it.body.trim() === "") {
    lines.push(`--- spec body: EMPTY ---`)
    lines.push(
      `  This item has no spec. That is normal for a session-first item (auto-registered from a live ` +
        `session), and means the work is described in the session, not on the board.`
    )
  } else {
    lines.push(`--- spec body (${it.body.length} bytes) ---`)
    lines.push(it.body)
  }

  // subtasks and todo_mirror are the SAME SHAPE with DIFFERENT WRITE CLASSES
  // (I-266). Never merged, and each is labelled with its class, because the
  // class is what tells a reader whether losing it would matter.
  lines.push("")
  if (it.subtasks.length > 0) {
    lines.push(`--- subtasks — author-written plan, canonical (losing it is unrecoverable) ---`)
    for (const s of it.subtasks) lines.push(`  [${s.status}] ${s.content}`)
  } else {
    lines.push(`--- subtasks: none authored ---`)
  }
  if (it.todo_mirror.length > 0) {
    lines.push(
      `--- todo_mirror — the OWNING SESSION's live TodoWrite, a rebuildable cache ` +
        `(stamped ${it.todo_mirror_updated ?? "never"}) ---`
    )
    for (const t of it.todo_mirror) lines.push(`  [${t.status}] ${t.content}`)
  } else {
    lines.push(`--- todo_mirror: empty (no live session mirror) ---`)
  }
  return lines.join("\n")
}

/**
 * Fetch full specs for explicitly named ids, under a byte budget.
 *
 * Two things are never silent here: an id with no item on the board is reported
 * BY NAME (a quietly-dropped id looks like "that item has no content"), and an
 * item the budget could not fit is reported by name as deferred, not omitted.
 */
export function readItems(
  items: WorkItem[],
  ids: unknown,
  opts: ReadOptions = {}
): ReadResult | Refusal {
  const rawList: string[] = Array.isArray(ids)
    ? ids.map((x) => String(x))
    : typeof ids === "string"
      ? ids.split(/[\s,]+/)
      : []
  const requested = rawList.map((s) => s.trim()).filter((s) => s !== "")
  if (requested.length === 0) {
    return refuse(
      `Refused (NO_IDS): ids is required — this tool fetches NAMED items, e.g. ids: "WI-012,WI-031". ` +
        `To discover ids first use hive_board_list (index) or hive_board_search (free text).`
    )
  }

  const malformed = requested.filter((r) => normaliseItemId(r) === null)
  if (malformed.length > 0) {
    return refuse(
      `Refused (BAD_ID): ${malformed.join(", ")} ${malformed.length === 1 ? "is" : "are"} not work-item id(s). ` +
        `The shape is WI-NNN (e.g. WI-068). Zero-padding and case are forgiven; anything else is not guessed at.`
    )
  }

  const maxBytes = checkInt("max_bytes", opts.max_bytes, MIN_MAX_BYTES, MAX_MAX_BYTES, DEFAULT_MAX_BYTES)
  if (isRefusal(maxBytes)) return maxBytes

  // De-duplicate, preserving the caller's order.
  const wanted: string[] = []
  for (const r of requested) {
    const id = normaliseItemId(r)!
    if (!wanted.includes(id)) wanted.push(id)
  }

  const byId = new Map(items.map((it) => [it.id, it]))
  const missing = wanted.filter((id) => !byId.has(id))
  const present = wanted.filter((id) => byId.has(id))

  const blocks: string[] = []
  const found: string[] = []
  const deferred: string[] = []
  let used = 0
  for (const id of present) {
    const block = renderItem(byId.get(id)!)
    if (used > 0 && used + block.length > maxBytes) {
      deferred.push(id)
      continue
    }
    if (used === 0 && block.length > maxBytes) {
      // First item alone blows the budget: truncating a spec silently is worse
      // than anything else this module can do, so it is emitted, cut, and the
      // cut is announced in the payload itself.
      const cut = block.slice(0, maxBytes)
      blocks.push(
        `${cut}\n\n⚠ TRUNCATED — ${id} rendered to ${maxBytes} of ${block.length} bytes. ` +
          `Re-read it alone with a larger max_bytes to see the rest.`
      )
      found.push(id)
      used = maxBytes
      continue
    }
    blocks.push(block)
    found.push(id)
    used += block.length
  }

  const head: string[] = []
  head.push(
    `hive-board read — ${found.length} item${found.length === 1 ? "" : "s"} in full, ` +
      `${used} of ${maxBytes} budgeted bytes used.`
  )
  head.push(
    `Not a snapshot: items are read one file at a time with no lock, so a concurrent write may land between two of them. ` +
      `Every write is atomic, so no single item is ever torn.`
  )
  if (missing.length > 0) {
    head.push(
      `⚠ Not found on the board: ${missing.join(", ")} — no such item file. ` +
        `(Ids are never silently dropped; check hive_board_list.)`
    )
  }
  if (deferred.length > 0) {
    head.push(
      `⚠ Budget reached — NOT included: ${deferred.join(", ")}. Call again with just those ids ` +
        `(or raise max_bytes, ceiling ${MAX_MAX_BYTES}).`
    )
  }
  if (found.length === 0) {
    head.push(`Nothing was rendered. This is a lookup failure, not an empty board.`)
  }

  const text = [head.join("\n"), ...blocks].join("\n\n")
  return { ok: true, text, found, missing, deferred, bytes: text.length }
}

// ── Create-time advisory (replaces the threshold near-duplicate check) ────────

export interface NearestItem {
  id: string
  title: string
  status: WorkItemStatus
  score: number
}

/**
 * The N nearest existing items to a title, by rank — no threshold, no verdict.
 *
 * This REPLACES a title-Jaccard ≥ 0.5 duplicate check that measurement showed
 * to be a placebo: on the real board it fired on 0 of 2346 pairs, and a genuine
 * re-file of an existing item in different words scored 0.31 — below its own
 * cutoff. A detector that cannot catch the case it exists for, but reads as
 * authoritative when it stays silent, is worse than nothing (W-019).
 *
 * So the mechanism keeps its side of the bargain differently: `hive_board_create`
 * tells the caller they need not read an existing item, and that read was also
 * the duplicate check. This puts the neighbours in front of them unconditionally
 * — ALWAYS shown, never a warning, phrased as "nearest", and left to their
 * judgement.
 */
export function nearestItems(items: WorkItem[], title: string, n = 3): NearestItem[] {
  const queryTokens = tokenise(title)
  if (queryTokens.size === 0) return []
  return items
    .map((it) => ({ it, score: scoreItem(it, queryTokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.it.id.localeCompare(a.it.id))
    .slice(0, n)
    .map(({ it, score }) => ({ id: it.id, title: it.title, status: it.status, score }))
}

/** The advisory line(s) appended to a create receipt. Empty string when nothing scored. */
export function formatNearest(nearest: NearestItem[]): string {
  if (nearest.length === 0) return ""
  const lines = [
    ``,
    `Nearest existing items — NOT a duplicate verdict, just the closest titles by word overlap. Judge for yourself:`,
  ]
  for (const n of nearest) {
    lines.push(`  ${n.score.toFixed(2)}  ${pad(n.id, 7)}${pad(n.status, 13)}${n.title}`)
  }
  lines.push(
    `  (There is no delete path. If one of these IS the same work, resolve it with hive_board_respec/retitle ` +
      `or by closing one — and read it first with hive_board_read.)`
  )
  return lines.join("\n")
}
