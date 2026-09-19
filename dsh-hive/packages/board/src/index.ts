/**
 * @hive/dsh-board — the hive-board work-item store as a dsh Service (B1).
 *
 * Exposes `ctx.board`: the locked, byte-compatible replacement for OpenCode
 * `src/lib/board-store.ts` + `board-invariants.ts` + `board-recency.ts`, over
 * `<directory>/.opencode/board/WI-*.md` — the SAME store the OpenCode plugin
 * reads/writes (dual-run preserved; every SCHEMA.md format rule intact).
 *
 * The three lib modules under `./lib/` are VERBATIM ports of the OpenCode
 * plugin's files (byte-identical sources; only this package wrapper is new):
 *   - lib/board-store.ts       — the single code path for all WI-*.md writes
 *                                (advisory board-wide lock, atomic rename,
 *                                append-only transitions, respec archive)
 *   - lib/board-invariants.ts  — the SCHEMA §3 read-time check (detection
 *                                only, never normalization)
 *   - lib/board-recency.ts     — the shared recency key (banner replaced:
 *                                the browser-bundle constraint was
 *                                viewer-bundle-specific and does not exist
 *                                in the dsh port)
 *
 * B4 registers the 8 `hive_board_*` model-facing tools (list/search/read/
 * bind/create/respec/retitle/tag — audit §4 names, near-verbatim
 * contract-teaching descriptions). The awaken seam lands in B5, the
 * dream-complete seam in B6 (see scratch/dsh-migration/
 * dsh-migration-board-plan.md). Per the B-slice ruling (decisions D9/H1):
 * `hive_board_start` never ships; startItem/promoteItem stay module-resident,
 * compiled, tested, uncalled — they arrive with B2's verbatim
 * board-transitions port and gain no dsh caller.
 */

import { Service } from "@deepseek-ai/cordis"
import z from "@deepseek-ai/schemastery"
import { defineTool } from "@deepseek-ai/dsh-tools"
import { readFileSync } from "node:fs"
import type { ContentBlock } from "@deepseek-ai/dsh-llm"

import {
  boardDir,
  itemPath,
  nextItemId,
  specHash,
  serializeWorkItem,
  parseWorkItem,
  readItem,
  listItems,
  listItemsInDir,
  findItemByOwner,
  findItemReleasing,
  listRevisions,
  readRevision,
  isPlaceholderTitle,
  PLACEHOLDER_TITLE_RE,
  today,
  nowIso,
  type WorkItem,
} from "./lib/board-store.js"
import { computeProblems } from "./lib/board-invariants.js"
import { recencyKey } from "./lib/board-recency.js"
import {
  listBoard,
  searchBoard,
  readItems,
  nearestItems,
  formatNearest,
  scoreItem,
  excerptFor,
  normaliseItemId,
  DEFAULT_K,
  MAX_K,
  MAX_LIMIT,
  DEFAULT_MAX_BYTES,
  MIN_MAX_BYTES,
  MAX_MAX_BYTES,
  STATUS_FILTERS,
  OWNER_FILTERS,
  PRIORITY_FILTERS,
  type ListOptions,
} from "./lib/board-read.js"
import {
  createIdea,
  bindSession,
  autoRegister,
  pauseItem,
  unpauseItem,
  demoteItem,
  markDoneWithoutDream,
  dreamCompleteBy,
  markItemDoneFromDream,
  respecItem,
  retitleItem,
  editItemTags,
  startItem,
  promoteItem,
  reattachInfo,
  makeDrmPreCompactionCheck,
  TAG_PATTERN,
  expectStringArray,
  expectSubtaskArray,
  sdkSessionClient,
  httpSessionClient,
  type CreateIdeaInit,
  type MarkDoneFromDreamOptions,
  type RespecOptions,
  type BoardSessionClient,
  type SdkLikeClient,
  type StartOptions,
  type ReattachDecision,
  type TransitionOk,
  type TransitionErr,
  type TransitionResult,
} from "./lib/board-transitions.js"
import { isSessionAwakened } from "./lib/sessions-read.js"
export { makeDrmCompleteCheck, makeDrmArtifacts } from "./lib/drm-read.js"

// Re-export the lib surface — B4's tool registrations and the two seams (B5
// evolution, B6 tools) import through the package root, exactly the way
// @hive/dsh-tools consumes @hive/dsh-dream-archive's exports.
export {
  boardDir,
  itemPath,
  nextItemId,
  specHash,
  serializeWorkItem,
  parseWorkItem,
  readItem,
  listItems,
  listItemsInDir,
  findItemByOwner,
  findItemReleasing,
  listRevisions,
  readRevision,
  isPlaceholderTitle,
  PLACEHOLDER_TITLE_RE,
  today,
  nowIso,
  computeProblems,
  recencyKey,
  // transitions (B2)
  createIdea,
  bindSession,
  autoRegister,
  pauseItem,
  unpauseItem,
  demoteItem,
  markDoneWithoutDream,
  dreamCompleteBy,
  markItemDoneFromDream,
  respecItem,
  retitleItem,
  editItemTags,
  // COMPILED-BUT-UNCALLED on dsh (decisions D9/H1) — module completeness only
  startItem,
  promoteItem,
  reattachInfo,
  // DRM cross-checks (B2; one parser — @hive/dsh-dream-archive)
  makeDrmPreCompactionCheck,
  TAG_PATTERN,
  expectStringArray,
  expectSubtaskArray,
  sdkSessionClient,
  httpSessionClient,
  // read surface (B3)
  listBoard,
  searchBoard,
  readItems,
  nearestItems,
  formatNearest,
  scoreItem,
  excerptFor,
  normaliseItemId,
  STATUS_FILTERS,
  OWNER_FILTERS,
  PRIORITY_FILTERS,
  DEFAULT_K,
  MAX_K,
  MAX_LIMIT,
  DEFAULT_MAX_BYTES,
  MIN_MAX_BYTES,
  MAX_MAX_BYTES,
}
export type {
  WorkItem,
  WorkItemStatus,
  WorkItemOrigin,
  WorkItemPriority,
  Subtask,
  SubtaskStatus,
  ItemEdit,
} from "./lib/board-store.js"
export type {
  CreateIdeaInit,
  MarkDoneFromDreamOptions,
  RespecOptions,
  BoardSessionClient,
  SdkLikeClient,
  StartOptions,
  ReattachDecision,
  TransitionOk,
  TransitionErr,
  TransitionResult,
} from "./lib/board-transitions.js"

/**
 * The hive-board Service. `directory` is the PROFILE-LEVEL fixed workspace
 * root (the directory that CONTAINS `.opencode/`) — the same constant every
 * HIVE service pins; sessions JOIN the profile's HIVE, they do not each grow
 * one. Board reads and writes share the root with the awaken ledger
 * (`.opencode/agents/hive-sessions.json`) and the dream archive
 * (`.opencode/dreams/`) by construction.
 */

// ── B4: the 8 hive_board_* model-facing tools ─────────────────────────────────
// Verbatim CLOSE ports of the OpenCode plugin's src/tools.ts definitions
// (audit §4 table); per D9/H1 there is deliberately NO hive_board_start.
// Three differences from the originals, all load-bearing and restated at
// their sites: (1) session/depth identity comes from the dsh exec ctx
// (`exec.agent.session.id` + the NAME/DEPTH of the caller) instead of
// OpenCode's nervous system; (2) the bind gate is the D5 ruling — refuse
// depth>0 (the worker analogue of the original capability refusal, cited in
// the text) + refuse not-awakened (board READS the ledger,
// lib/sessions-read.ts; evolution OWNS the writes); (3) the schema layer
// validates its declared shape, so the runtimes that made WI-065 possible
// are doubled here — but every WI-065 hardening stays EXACTLY where it was:
// dsh's parameter schema compiles to an OPEN object root, so UNDECLARED keys
// still sail through (the FORBIDDEN_CREATE_KEYS refusal by name remains
// load-bearing), and the module-level guards remain the real check.

const TEXT_OUT = {
  schema: { type: "string" },
  render: (_args: unknown, value: string): ContentBlock[] => [{ type: "text", text: value }],
} as const

/** Resolve caller identity (agent id, session id, delegation depth) from the dsh exec ctx. */
function resolveCaller(exec: { agent?: unknown }): {
  caller: string | null
  sessionID: string
  depth: number | undefined
} {
  const agent = exec.agent as
    | { session?: { id?: string; header?: { delegationDepth?: unknown } }; id?: string }
    | undefined
  const sessionID = agent?.session?.id ?? agent?.id ?? "unknown-session"
  const caller = agent?.id ?? null
  const raw = agent?.session?.header?.delegationDepth
  const depth = typeof raw === "number" && Number.isFinite(raw) ? raw : undefined
  return { caller, sessionID, depth }
}

// ⚠️ LOAD-BEARING (WI-065, ported verbatim from OpenCode src/tools.ts). dsh's
// parameter schema compiles to an implicit OPEN object root: declared keys are
// validated, but anything NOT declared arrives in execute() untouched — a live
// probe on OpenCode showed undeclared keys reaching the body and a
// status:"in_progress" reaching disk. Everything create's description
// advertises as managed must be refused HERE, imperatively, BY NAME.
const FORBIDDEN_CREATE_KEYS = [
  "id",
  "owner_session",
  "group_id",
  "spec_hash",
  "transitions",
  "dream_id",
  "artifacts",
  "todo_mirror",
  "released_sessions",
  "origin",
  "paused",
  "done_without_dream",
]

const str = (description: string) => ({ type: "string", description } as const)
const reqStr = (description: string) => ({ type: "string", required: true, description } as const)
const num = (description: string) => ({ type: "number", description } as const)

export class Board extends Service {
  static inject = ["tools"]
  static Config = z.object({
    // Workspace root (the dir containing `.opencode/`). Default: process cwd.
    directory: z.string().default(process.cwd()),
  })

  readonly directory: string

  /**
   * Slice 3D — the live-activity feed. Captured via the W-090 WAIT (below),
   * read EXECUTE-time only, never mutated. Kept structurally typed so this
   * package never needs agent-loop types (W-044 discipline): the ONLY field
   * the board consumes is `status` of the agents registry's `list()` rows —
   * `AgentStatus = 'idle' | 'running'` per @deepseek-ai/dsh-agent runtime
   * types (mirrored on every `agent/status` transition).
   */
  private agentsSvc: { list?: () => Array<{ status?: unknown }> | undefined } | undefined

  constructor(ctx: import("@deepseek-ai/cordis").Context, config: { directory: string }) {
    super(ctx, "board")
    this.directory = config.directory
    this.ctx.logger?.info?.("[board] storage module active (8 hive_board_* tools registered)", {
      directory: this.directory,
      tools: 8,
    })

    const directory = this.directory
    const log = (level: "info" | "warn", msg: string, extra?: Record<string, unknown>) =>
      this.ctx.logger?.[level]?.(msg, extra)

    // ── hive_board_list ──────────────────────────────────────────────────────
    const listTool = () =>
      defineTool({
        name: "hive_board_list",
        description:
          "Enumerate the hive-board: the INDEX of work items — id, status, priority, owner, recency, spec SIZE, tags and title, one line each. " +
          "NEVER returns spec bodies, and that is the point: the entire board indexes to a few thousand tokens, so this call is always affordable and its cost is predictable before you make it. The `body` column is the spec's size, so you can see what reading one would cost before you ask for it. " +
          'Defaults to status="live" — backlog + todo + in_progress. DONE items are EXCLUDED by default (most of a mature board is finished work); pass status="all" to include them. ' +
          "This is the tool for 'what is on the board right now'. Reach for hive_board_search instead when you have WORDS rather than a filter (it also spans done items), and hive_board_read when you already know the ids and need the actual spec text. " +
          'It is ALSO how you find corruption. Every call checks the SCHEMA §3 invariants on every matched item, counts violations in the header and marks each violating row "⚠" with the invariant it breaks — no filter or flag needed, and the count spans everything matched, not just the rows `limit` rendered. Illegal states genuinely reach disk (WI-065 proved it), so this answers "which items are in an illegal state" board-wide. Detection only: nothing is repaired, and a clean board shows no marker at all. Note the check is a floor, not an audit — three of the schema\'s six invariants, two of them in weakened form, so no ⚠ means "breaks none of the three cheap per-item rules", not "schema-clean". ' +
          "Reads take no lock and no snapshot: writes are atomic per file, so nothing you see is ever half-written, but a long listing may observe one item before and another after a concurrent write.",
        parameters: {
          status: {
            type: "string",
            enum: [...STATUS_FILTERS],
            description:
              "live (DEFAULT) = everything except done. all = including done. Or one exact status. `all` exists as a real value rather than 'omit the filter' so the narrow default cannot silently hide finished work from you.",
          },
          owner: {
            type: "string",
            enum: [...OWNER_FILTERS],
            description:
              "any (default). owned = a session is on it. none = un-owned, i.e. free to pick up. Note that owned ⟺ in_progress by schema, so combining owner with a queued status is refused rather than answered with a misleading empty list.",
          },
          priority: {
            type: "string",
            enum: [...PRIORITY_FILTERS],
            description: "any (default), or one exact priority.",
          },
          limit: num("Cap the number of rows. Rarely needed — the whole index is cheap by construction. When it cuts, the count omitted is reported, never silently."),
        },
        output: TEXT_OUT,
        async execute(args) {
          const r = listBoard(listItems(directory), args as ListOptions)
          return r.ok ? r.text : r.error
        },
      })

    // ── hive_board_search ────────────────────────────────────────────────────
    const searchTool = () =>
      defineTool({
        name: "hive_board_search",
        description:
          "Find work items by free text: a RANKED shortlist with scores and a matching excerpt from each spec. Spans EVERY status including done — solved work is often the most valuable thing to find, and it is invisible to hive_board_list's default. " +
          "USE THIS BEFORE FILING ANYTHING NEW. The board has no delete path, so a duplicate item is expensive to unpick afterwards; two minutes here is the cheapest moment to discover the work already exists. " +
          "It ranks, it does not judge: scores are lexical token overlap (query coverage plus a title boost), so a high score means 'shares vocabulary', not 'is the same work', and a low score does not prove unrelated. There is deliberately no duplicate verdict and no threshold — a cutoff was measured on a real board and fired on 0 of 2346 pairs while missing genuine re-files, so the ordering is handed to you and the judgement stays yours. " +
          "Bounded by k (default " +
          DEFAULT_K +
          ", ceiling " +
          MAX_K +
          "), excerpt only. Follow up with hive_board_read for the full spec of anything that looks close.",
        parameters: {
          query: reqStr(
            "Free text describing the work you are looking for — the words you would use to explain it, not a filter expression. Tokens are lowercased, punctuation-stripped, and 1–2 character words are dropped (so db/id/ui/os do not survive; give the ranker a longer word too)."
          ),
          k: num(
            "Shortlist size, default " +
              DEFAULT_K +
              ", ceiling " +
              MAX_K +
              ". Only items scoring above zero are returned, so a small k is usually enough."
          ),
        },
        output: TEXT_OUT,
        async execute(args) {
          const r = searchBoard(listItems(directory), args.query, { k: (args as Record<string, unknown>).k as number | undefined })
          return r.ok ? r.text : r.error
        },
      })

    // ── hive_board_read ──────────────────────────────────────────────────────
    const readTool = () =>
      defineTool({
        name: "hive_board_read",
        description:
          "Read the FULL spec of named work items: the complete body, plus tags/dates/ownership, the append-only history, and `subtasks` and `todo_mirror` shown SEPARATELY — they have the same shape but different write classes (an author-written plan whose loss is unrecoverable, versus a rebuildable mirror of the owning session's live todos). " +
          "This is the expensive one, and explicitly so. Spec bodies run from empty to ~12 KB, so it takes named ids rather than a filter and is bounded by a byte budget (default " +
          DEFAULT_MAX_BYTES +
          " bytes, ceiling " +
          MAX_MAX_BYTES +
          "). Discover ids with hive_board_list or hive_board_search first. " +
          "Nothing disappears quietly: an id with no item on the board is reported by name, and an item the budget could not fit is reported by name as deferred — never dropped. " +
          "Use this instead of opening .opencode/board/WI-*.md by hand: this is the same parser the writers use, so what you read is what the board stores. " +
          'If the item violates a SCHEMA §3 invariant, that is stated as a "⚠ ILLEGAL" line directly under its status — the record is real and in a forbidden state, not a parse error. Reported, never repaired. ' +
          "One honest limitation: reading several items is NOT a cross-item snapshot. No lock is taken (a read must never be able to make a concurrent write fail), and while each file is written atomically so no single item is ever torn, a multi-item read may observe one item before and another after a concurrent write.",
        parameters: {
          ids: reqStr(
            'Work item ids, comma or space separated, e.g. "WI-012,WI-031". Zero-padding and case are forgiven (wi-3 → WI-003); anything that is not id-shaped is refused rather than guessed at.'
          ),
          max_bytes: num(
            "Payload ceiling in characters (default " +
              DEFAULT_MAX_BYTES +
              ", range 500–" +
              MAX_MAX_BYTES +
              "). Items past it are named as deferred so you can fetch them in a second call."
          ),
        },
        output: TEXT_OUT,
        async execute(args) {
          const r = readItems(listItems(directory), args.ids, {
            max_bytes: (args as Record<string, unknown>).max_bytes as number | undefined,
          })
          return r.ok ? r.text : r.error
        },
      })

    // ── hive_board_bind ──────────────────────────────────────────────────────
    const bindTool = () =>
      defineTool({
        name: "hive_board_bind",
        description:
          "Bind the CURRENT session to a hive-board work item (.opencode/board/WI-*.md): stamps this session as owner_session (+ group_id), moves the item to in_progress, appends the transition. " +
          "Session identity is resolved from the runtime — you do NOT pass a session id. " +
          "Enforced: the item must be un-owned, this session must not own another item (session⟷item is strictly 1:1), this session must be a HIVE-awakened top-level coordinator (an in_progress item with a non-coordinator owner is an illegal state), and this session must not be tombstoned in the item's released_sessions[].",
        parameters: {
          id: reqStr("Work item id, e.g. WI-007"),
        },
        output: TEXT_OUT,
        async execute(args, exec) {
          const { sessionID, depth } = resolveCaller(exec)
          // ── the D5 gate: only an awakened top-level coordinator may own ─────
          // (a) delegated children (delegationDepth > 0) may not own items —
          // the dsh analogue of the original capability refusal; the citation
          // travels in the text so a worker reading the refusal understands
          // it is a ROLE boundary, not a broken tool.
          if (depth !== undefined && depth > 0) {
            return (
              `Refused: delegated sessions (depth ${depth}) cannot own work items — only top-level HIVE coordinator sessions do. ` +
              `(The original plugin refused capability sessions for the same reason: capability sessions cannot own work items.) ` +
              `File or update items with hive_board_create / hive_board_respec / hive_board_tag instead — ownership belongs to the coordinator.`
            )
          }
          // (b) the session must be HIVE-awakened — In Progress requires an
          // awakened coordinator owner (SCHEMA §3, invariant 1). The board
          // READS the awaken ledger; @hive/dsh-evolution OWNS its writes.
          if (!isSessionAwakened(directory, sessionID)) {
            return "Refused: this session is not HIVE-awakened. Run /awaken first — In Progress requires an awakened coordinator owner (SCHEMA §3, invariant 1)."
          }
          const groupID = sessionID
          const result = await bindSession(directory, args.id.trim(), sessionID, groupID)
          if (!result.ok) {
            const hint =
              result.reason === "SESSION_OWNS_OTHER"
                ? " To re-point this session, true-demote the currently owned item first (board demote — it tombstones this session there), then bind again."
                : ""
            return `Refused (${result.reason}): ${result.detail}${hint}`
          }
          if (result.action === "already-bound") {
            return `${result.item.id} is already bound to this session — no-op.`
          }
          const absorbedNote =
            result.action === "bound-absorbed" && result.absorbed
              ? ` Pristine auto-registered placeholder ${result.absorbed} was absorbed (dissolved; lineage recorded on the bind transition).`
              : ""
          log("info", `[board] bind ${args.id.trim()} ← ${sessionID}`, { absorbed: result.absorbed ?? null })
          return `Bound ${result.item.id} ("${result.item.title}") to this session (${sessionID}). Status: in_progress; owner_session + group_id stamped together; spec_hash stamped; transition appended.${absorbedNote}`
        },
      })

    // ── hive_board_create ────────────────────────────────────────────────────
    const createTool = () =>
      defineTool({
        name: "hive_board_create",
        description:
          "File a work item on the hive-board. " +
          "Returns a full receipt of what was stored — the new id plus title, status, priority, tags, body size, subtask count and next steps — so you never need to open the file to confirm the write. " +
          "Use this instead of writing a WI-*.md file by hand: it allocates the next id atomically under the board lock, timestamps it, and opens the item's append-only history with an entry recording its creation — nothing to look up, no existing item to copy. " +
          "New items are UN-OWNED: captured, with no session working them yet. Ownership comes later — your coordinator takes it with hive_board_bind. " +
          // ⚠️ LOAD-BEARING POINTER (WI-068). This tool's premise is "you never
          // need to open an existing item" — and opening existing items WAS the
          // duplicate check. The mechanism-side replacement (the nearest-items
          // advisory on the receipt below) fires only AFTER the item is on a
          // board with no delete path. Without this sentence the caller has no
          // reason to look before writing, and the safeguard is inert.
          "BEFORE you file: run hive_board_search with the words you would use to describe this work. There is no delete path on this board, so an accidental duplicate is expensive to unpick, and search spans done items — which the board index hides by default. " +
          // ⚠️ The sentence below is LOAD-BEARING — see the comment on
          // FORBIDDEN_CREATE_KEYS before shortening it in a way that weakens
          // the claim. It looks redundant with the declared schema; it is not:
          // the parameter schema validates its DECLARED keys but compiles to an
          // OPEN object root, so undeclared keys reach execute() untouched.
          "These fields are managed for you and are refused if passed: id, ownership, spec_hash, transitions, dream/artifact links, todo mirror, released sessions, origin, paused and done badges — and any status beyond backlog/todo. " +
          "They belong to the transition module, and the refusal is by name — nothing is silently dropped.",
        parameters: {
          title: reqStr("Short imperative title, e.g. 'Add push opt-out toggle'."),
          body: str(
            "The spec, markdown. Write it for someone picking this up cold: what the problem is, what is in and out of scope, and what 'done' looks like. No house template is enforced. Revise later with hive_board_respec, which preserves the text it replaces."
          ),
          status: {
            type: "string",
            enum: ["backlog", "todo"],
            description:
              "backlog (default) = captured, not yet queued. todo = triaged and next up. Nothing behaves differently between them — both are un-owned and both can be started at any time; the column is a human queueing signal, not a state machine. When in doubt, backlog.",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description:
              "Really does sort: this is the PRIMARY sort key in the Backlog and Todo columns, ahead of recency, so high visibly moves the card to the top. Default medium.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional. Free-form labels — there is no controlled vocabulary and no namespacing convention. The common pattern is the project or component name (jellyfetch, hive-board, tooling). Bare tokens: letters, digits, dot, dash, underscore. Editable later with hive_board_tag.",
          },
          subtasks: {
            type: "array",
            items: { type: "string" },
            description:
              "An author-written plan: the steps you would take, in order. CREATION-TIME ONLY — not because the plan is meant to be frozen as a record of original intent, but because no safe concurrent-edit primitive for it exists yet: an ordered list of rich records cannot be merged the way a set of tags can, so a whole-replace edit would silently lose a concurrent editor's change. Optional, and omitting it is the normal case — pass a decomposition only if it is already settled; to revise a plan later, put the revision in the body. Distinct from todo_mirror, which is the owning session's live TodoWrite and is machine-written.",
          },
        },
        output: TEXT_OUT,
        async execute(args, exec) {
          // ── RUNTIME arg validation ────────────────────────────────────────
          // The declared schema validates DECLARED keys, but the object root is
          // OPEN: anything the model emits beyond the declaration arrives here
          // as-is. Verified the hard way on the original: a live call with
          // status:"in_progress" wrote WI-065 to disk. Everything the
          // description advertises as refused is refused HERE, imperatively
          // (or in the module, for shared paths).
          const forbidden = FORBIDDEN_CREATE_KEYS.filter((k) => k in (args as Record<string, unknown>))
          if (forbidden.length > 0) {
            return (
              `Refused (TRANSITION_MODULE_FIELD): ${forbidden.join(", ")} ${forbidden.length === 1 ? "is" : "are"} owned by the transition module, not the author. ` +
              `Ownership (owner_session/group_id) is stamped by hive_board_bind; spec_hash by bind and true-demote; ` +
              `transitions are appended by the operation that caused them; the id is allocated here. Drop ${forbidden.length === 1 ? "it" : "them"} and retry.`
            )
          }
          const title = args.title.trim()
          if (title === "") return "Refused (EMPTY_TITLE): title is required and cannot be empty."
          // `subtasks` MUST be shape-checked here, not only in the module: the
          // `.map` below converts string[] into records and runs BEFORE
          // createIdea, so a module-only guard leaves this arg still throwing a
          // raw TypeError. `tags` is deliberately NOT duplicated here — it is
          // passed through untouched and the module refuses it with the same
          // message, and a second copy of a guard is a second thing to drift.
          const badSubtasks = expectStringArray("subtasks", (args as Record<string, unknown>).subtasks)
          if (badSubtasks) return `Refused (${badSubtasks.reason}): ${badSubtasks.detail}`
          const { caller } = resolveCaller(exec)
          const result = await createIdea(directory, {
            title,
            ...(args.body !== undefined ? { body: args.body } : {}),
            ...(args.status !== undefined ? { status: args.status } : {}),
            ...(args.priority !== undefined ? { priority: args.priority } : {}),
            ...(args.tags !== undefined ? { tags: args.tags } : {}),
            ...(args.subtasks !== undefined
              ? { subtasks: args.subtasks.map((content: string) => ({ content, status: "pending" as const })) }
              : {}),
            by: `hive_board_create:${caller ?? "session"}`,
          })
          // NEVER assume the module cannot refuse. The original's previous
          // version asserted createIdea "returns TransitionOk unconditionally",
          // and that belief put an in_progress un-owned item on disk (WI-065).
          // The module is the guard, and it can say no.
          if (!result.ok) return `Refused (${result.reason}): ${result.detail}`
          const it = result.item
          // Advisory, unconditional, and NOT a verdict — see the tombstone above
          // for why the threshold check it replaced was removed.
          const nearNote = formatNearest(
            nearestItems(
              listItems(directory).filter((x) => x.id !== it.id),
              it.title,
              3
            )
          )
          // A COMPLETE RECEIPT. This tool's whole premise is "you don't need to
          // read the file", so the caller has no other way to confirm what was
          // stored — every field they supplied must be echoed back, or they are
          // left unable to verify their own write.
          return (
            `Created ${it.id} — stored and verified:\n` +
            `  title      ${it.title}\n` +
            `  status     ${it.status} (un-owned — no session is working it yet)\n` +
            `  priority   ${it.priority}\n` +
            `  tags       ${it.tags.length > 0 ? it.tags.join(", ") : "(none)"}\n` +
            `  body       ${it.body.length > 0 ? `${it.body.length} bytes stored` : "(empty — add one with hive_board_respec)"}\n` +
            `  subtasks   ${it.subtasks.length > 0 ? `${it.subtasks.length} recorded (not editable afterwards)` : "(none)"}\n` +
            `  history    1 entry — the item's creation, logged to its append-only history\n` +
            `Next: your coordinator can bind ${it.id} (hive_board_bind) to work it in its own session.` +
            nearNote
          )
        },
      })

    // ── hive_board_respec ────────────────────────────────────────────────────
    const respecTool = () =>
      defineTool({
        name: "hive_board_respec",
        description:
          "Rewrite a work item's spec body. The text you replace is never lost — it is archived automatically and the change is recorded in the item's history, so a reader can see that the spec changed, when, and by whom. " +
          "Use this rather than editing the file: a hand edit bypasses the board lock (the board viewer writes to the same items) and destroys the previous text permanently, since the board has no version control underneath. " +
          "Touches the body only — status, ownership, subtasks and the live todo mirror are untouched. " +
          "Refused if a different session owns the item: once work starts, the spec belongs to the session accumulating decisions in it (the coordinator can demote the item first to make it editable again).",
        parameters: {
          id: reqStr("Work item id, e.g. WI-064."),
          body: reqStr(
            "The COMPLETE new spec body — this replaces the whole body, it is not a patch, so include everything you want to keep. Markdown. An empty body is refused (that discards a spec rather than revising it); a body identical to the current one is a no-op and records nothing."
          ),
        },
        output: TEXT_OUT,
        async execute(args, exec) {
          const { sessionID, caller } = resolveCaller(exec)
          const id = args.id.trim()
          const result = await respecItem(directory, id, args.body, {
            session: sessionID,
            by: `hive_board_respec:${caller ?? "session"}`,
          })
          if (!result.ok) return `Refused (${result.reason}): ${result.detail}`
          if (result.action === "respec-noop") return `${id}: body is byte-identical to the current spec — no revision recorded.`
          const revs = listRevisions(directory, id)
          return (
            `Revised ${id}'s spec. Previous body archived at .opencode/board/${id}/ ` +
            `(${revs.length} revision${revs.length === 1 ? "" : "s"} retained; recover with the superseded hash on the transition entry). ` +
            `spec_hash deliberately NOT re-stamped.`
          )
        },
      })

    // ── hive_board_retitle ───────────────────────────────────────────────────
    const retitleTool = () =>
      defineTool({
        name: "hive_board_retitle",
        description:
          "Change a work item's title. Titles are short and imperative — for the spec itself use hive_board_respec. " +
          "Refused if a different session owns the item (an owned item's title is mirrored from that session).",
        parameters: {
          id: reqStr("Work item id, e.g. WI-064."),
          title: reqStr("The new title, short and imperative. Empty is refused."),
        },
        output: TEXT_OUT,
        async execute(args, exec) {
          const { sessionID } = resolveCaller(exec)
          const result = await retitleItem(directory, args.id.trim(), args.title, {
            session: sessionID,
            by: "hive_board_retitle",
          })
          if (!result.ok) return `Refused (${result.reason}): ${result.detail}`
          if (result.action === "retitle-noop") return `${args.id.trim()}: title unchanged — no write.`
          return `Retitled ${result.item.id} to "${result.item.title}".`
        },
      })

    // ── hive_board_tag ───────────────────────────────────────────────────────
    const tagTool = () =>
      defineTool({
        name: "hive_board_tag",
        description:
          "Add or remove tags on a work item. Pass only what CHANGES — this is a delta, so a concurrent editor's tags are merged rather than overwritten. " +
          "Works whether or not the item is owned; tags are shared metadata, not part of the spec.",
        parameters: {
          id: reqStr("Work item id, e.g. WI-064."),
          add: {
            type: "array",
            items: { type: "string" },
            description:
              "Tags to add — only the new ones. Free-form: no controlled vocabulary and no namespacing convention; the common pattern is the project or component name (jellyfetch, hive-board, tooling). Bare tokens: letters, digits, dot, dash, underscore. Adding a tag that is already present is a harmless no-op.",
          },
          remove: {
            type: "array",
            items: { type: "string" },
            description:
              "Tags to remove — only those. Removing an absent tag is a harmless no-op. Naming the same tag in both add and remove is refused rather than guessed.",
          },
        },
        output: TEXT_OUT,
        async execute(args) {
          const result = await editItemTags(
            directory,
            args.id.trim(),
            {
              ...(args.add !== undefined ? { add: args.add } : {}),
              ...(args.remove !== undefined ? { remove: args.remove } : {}),
            },
            { by: "hive_board_tag" }
          )
          if (!result.ok) return `Refused (${result.reason}): ${result.detail}`
          if (result.action === "tags-noop") return `${args.id.trim()}: tags already in that state — no write.`
          return `${result.item.id} tags: [${result.item.tags.join(", ")}]`
        },
      })

    // Register all 8; each disposer is scoped to this service so the tools
    // unwind together with it. The deny mask on @hive/dsh-evolution
    // (HIVE_TOOL_NAMES) covers these names; see
    // packages/evolution/test/tool-gate-sync.test.mjs + this package's
    // board-tools.test.mjs for both halves of that sync guarantee.
    const registrations = [
      listTool(),
      searchTool(),
      readTool(),
      bindTool(),
      createTool(),
      respecTool(),
      retitleTool(),
      tagTool(),
    ]
    const disposers = registrations.map((def) => ctx.tools.register(def))
    // A cordis effect's body returns the Disposable (a () => void disposer)
    // that runs when the effect unwinds:
    ctx.effect(() => () => {
      for (const d of disposers) d()
    })

    // ── WI-062 slice 2: the same-origin JSON route for the web tab ────────────
    // WAIT form (contract §4, provider-usage precedent): webServer is a WAIT,
    // never a hard inject — a plugin that awaits nothing mounts BEFORE the
    // webserver finishes booting, and on web-less profiles this callback
    // simply never runs while the rest of the service still boots.
    // Read-only index; auth = the user-ratified "mirror precedent" posture
    // (contract §5/§8.1, 2026-09-18): the route carries no token check,
    // exactly like the live berget-usage snapshot route.
    ctx.registry.inject(["webServer"], (serverCtx) => {
      const webServer = serverCtx.get("webServer") as WebServerLike | undefined
      if (!webServer || typeof webServer.register !== "function") {
        this.ctx.logger?.warn?.("[board] webServer arrived without register — tab index route skipped")
        return
      }
      serverCtx.effect(
        () =>
          webServer.register({
            kind: "exact",
            path: "/api/hive-board/index",
            handler: async (_req: unknown, res: WebLikeResponse) => {
              let payload: unknown
              try {
                payload = this.tabIndex()
              } catch (e) {
                payload = { ok: false, error: String((e as Error)?.message ?? e) }
              }
              res.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
              })
              res.end(JSON.stringify(payload))
            },
          }),
        "board tab index route",
      )
      this.ctx.logger?.info?.("[board] tab index route registered at /api/hive-board/index")

      // Slice 3b: the item depth view. Exact-kind + query param on purpose:
      // only `exact` is in-cohort verified; the `prefix` kind exists in the
      // catalog but has no twin precedent — the client (websrc/item-drawer.ts)
      // calls /api/hive-board/item?id=WI-… Same auth posture, same WAIT.
      serverCtx.effect(
        () =>
          webServer.register({
            kind: "exact",
            path: "/api/hive-board/item",
            handler: async (req: unknown, res: WebLikeResponse) => {
              let payload: unknown
              let itemId = ""
              try {
                const reqAny = req as { url?: unknown } | null
                const raw = typeof reqAny?.url === "string" ? reqAny.url : ""
 itemId = new URLSearchParams(raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "").get("id")?.trim() ?? ""
                itemId = decodeURIComponent(itemId)
                if (!itemId.match(/^[A-Za-z0-9._-]+$/)) {
                  payload = { ok: false, error: "missing or malformed id query parameter", missing: itemId ? [itemId] : [] }
                } else {
                  payload = this.tabItem(itemId)
                }
              } catch (e) {
                payload = { ok: false, error: String((e as Error)?.message ?? e), missing: itemId ? [itemId] : [] }
              }
              res.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
              })
              res.end(JSON.stringify(payload))
            },
          }),
        "board tab item route",
      )
      this.ctx.logger?.info?.("[board] tab item route registered at /api/hive-board/item")
    })

    // Slice 3D — the live-activity feed. WAIT (the W-090 order-agnostic
    // form), never a static inject dep: the twin's own test pins exactly
    // this ("registry row rides a ctx.inject wait, never an inject dep") —
    // on profiles without the agents service the callback simply never
    // fires and `activityFor()` degrades to zeros, honestly sampled. PURE
    // READ: list() returns a fresh array; nothing here mutates agent state.
    // Registered on its own (NOT nested in the webServer wait) so the icon
    // feed works on webless compositions too.
    ctx.registry.inject(["agents"], (agentsCtx) => {
      const svc = agentsCtx.get("agents") as { list?: unknown } | undefined
      if (svc && typeof svc.list === "function") {
        this.agentsSvc = svc as { list?(): Array<{ status?: unknown }> }
        this.ctx.logger?.info?.("[board] agents feed captured — activity rides real agent status")
      } else {
        this.ctx.logger?.warn?.("[board] agents service arrived without list() — activity stays zero")
      }
    })
  }

  // ── read surface (B1; the locked write surface lives in the lib modules —
  //    the B4 tools wrap those directly) ───────────────────────────────────────
  boardDir = () => boardDir(this.directory)
  items = () => listItems(this.directory)
  readItem = (id: string) => readItem(this.directory, id)
  readByOwner = (sessionID: string) => findItemByOwner(this.directory, sessionID)
  readReleasing = (sessionID: string) => findItemReleasing(this.directory, sessionID)
  revisions = (id: string) => listRevisions(this.directory, id)
  readRevision = (id: string, hash: string) => readRevision(this.directory, id, hash)
  problems = (item: WorkItem) => computeProblems(item)
  recency = (item: Parameters<typeof recencyKey>[0]) => recencyKey(item)

  // ── WI-062 slice 2: the web tab payload (read-only index) ─────────────────────
  // Shape for GET /api/hive-board/index (contract: docs/board-tab-contract.md
  // §4). Grouping and column sort are POLICY for this surface; recency itself
  // stays the shared recencyKey (a FACT — recencyKey exists so two surfaces
  // can never disagree on it). Read-only like every B1 surface: no lock, no
  // write, no snapshot — each column may observe a different write instant,
  // and the tab treats nothing it shows as a consistent transaction.
  tabIndex(status: (typeof STATUS_FILTERS)[number] = "live") {
    const all = this.items()
    const rows =
      status === "live"
        ? all.filter((it) => it.status !== "done")
        : status === "all"
          ? all
          : all.filter((it) => it.status === status)
    const summarize = (it: WorkItem) => ({
      id: it.id,
      title: it.title,
      status: it.status,
      priority: it.priority,
      owner: it.owner_session,
      paused: it.paused,
      tags: it.tags,
      body_bytes: it.body.length,
      subtasks: it.subtasks.length,
      subtasks_done: it.subtasks.filter((s) => s.status === "completed").length,
      todo_mirror: it.todo_mirror.length,
      created: it.created,
      updated: it.updated,
      recency: recencyKey(it),
      problems: computeProblems(it),
    })
    const priorityRank = { high: 3, medium: 2, low: 1 } as const
    const byPriorityThenRecency = (a: WorkItem, b: WorkItem) => {
      const p = (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0)
      if (p !== 0) return p
      const r = recencyKey(b).localeCompare(recencyKey(a))
      return r !== 0 ? r : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    }
    const byRecency = (a: WorkItem, b: WorkItem) =>
      recencyKey(b).localeCompare(recencyKey(a)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    // Queued = backlog + todo (the two UN-OWNED statuses): priority is the
    // PRIMARY sort key, recency second — the same promise hive_board_list
    // makes. In Progress and Done sort newest-first via the shared recency
    // key. Done rides along so the tab gets the whole board in one payload
    // (the whole index is cheap by construction); the CLIENT caps rendering.
    const queued = rows.filter((it) => it.status === "backlog" || it.status === "todo").sort(byPriorityThenRecency)
    const active = rows.filter((it) => it.status === "in_progress").sort(byRecency)
    const done = all.filter((it) => it.status === "done").sort(byRecency)
    // WI-062 slice 3: the viewer-parity port consumes FULL items (the old
    // /api/state payload shipped the same whole records) — the store parse
    // objects with the read-time problems overlay (the one-boundary normalize
    // the old data/workitems.ts performed; here the route performs it). The
    // slice-2 `columns` summaries are UNTOUCHED for compatibility.
    const fullItems = all.map((it) => ({ ...it, problems: computeProblems(it) }))
    return {
      ok: true as const,
      status,
      generated: nowIso(),
      // slice 3: the parity engine's BoardState adapter consumes these.
      workspaceRoot: this.directory,
      boardBuild: readBoardBuild(),
      // slice 3D: live activity — the icon/mark derivation's ground truth.
      activity: this.activityFor(),
      counts: {
        total: all.length,
        queued: queued.length,
        in_progress: active.length,
        done: done.length,
      },
      columns: {
        queued: queued.map(summarize),
        in_progress: active.map(summarize),
        done: done.map(summarize),
      },
      items: fullItems,
    }
  }

  /**
   * Slice 3D — the icon/mark derivation's ground truth. RUNNERS, not bound
   * items: the count of agents whose registry status is `running` RIGHT NOW.
   * The old in-progress-item proxy is gone (in_progress items outlive their
   * sessions for weeks — "bound" never meant "busy").
   *
   * CHOSEN DISCRIMINATOR (documented in the contract): `agents.list()` —
   * process-local, LIVE-only (disposed agents are absent, so dissolved
   * sessions are stale-proof by construction) — filtered by the per-agent
   * `status` (`AgentStatus = 'idle' | 'running'`, @deepseek-ai/dsh-agent).
   * runningJobs was deliberately NOT taken (the agents filter is direct and
   * sufficient; every extra seam is one more thing to defend).
   *
   * KNOWN EDGE (accepted, revisit via WI-063's rewrite): an agent blocked
   * awaiting a user answer mid-turn still reports `running` — a question does
   * not flip the loop to idle. The icon may breathe while WAITING FOR YOU.
   * Distinguishing blocked-await-answer from mid-turn needs the
   * approval/userQuestions service state; not wired in this slice.
   *
   * @param missing — no agents service (wait never fired) ⇒ zeros + a flag;
   *   the payload stays shape-stable and the client stays quiet, honestly.
   */
  activityFor(): { runningAgents: number; sampledAt: string; feedAvailable: boolean } {
    const sampledAt = nowIso()
    const svc = this.agentsSvc
    if (!svc || typeof svc.list !== "function") {
      return { runningAgents: 0, sampledAt, feedAvailable: false }
    }
    try {
      const rows = svc.list() ?? []
      const runningAgents = rows.filter((row) => row?.status === "running").length
      return { runningAgents, sampledAt, feedAvailable: true }
    } catch (e) {
      this.ctx.logger?.warn?.("[board] agents.list() threw — activity sampled as zero", {
        error: String((e as Error)?.message ?? e),
      })
      return { runningAgents: 0, sampledAt, feedAvailable: false }
    }
  }

  /**
   * Slice 3b — the item depth view's payload (GET /api/hive-board/item?id=…).
   * Read-only, over the SAME single parse pass as tabIndex (this.items()); the
   * budget discipline follows readItems: caps are explicit — the spec body is
   * capped at ITEM_BODY_BUDGET chars with `truncated` + full `bodyBytes`, the
   * transition history at HISTORY_CAP with `historyTotal` — nothing is dropped
   * silently, and the board file is never written (one code path, read only).
   * The title rides RAW — presentation (SHADOW-019 truncation) is the CLIENT's
   * decision, the server never massages titles.
   */
  tabItem(itemId: string): unknown {
    const all = this.items()
    const found = all.find((it) => it.id === itemId || it.id.toLowerCase() === itemId.toLowerCase())
    if (!found) {
      return { ok: false as const, error: `no such work item on this board`, missing: [itemId] }
    }
    const bodyFull = found.body
    const body = bodyFull.length > ITEM_BODY_BUDGET ? bodyFull.slice(0, ITEM_BODY_BUDGET) : bodyFull
    const transitionsFull = Array.isArray(found.transitions) ? found.transitions : []
    if (transitionsFull.length > HISTORY_CAP) {
      this.ctx.logger?.info?.(`[board] item payload: history shown for ${found.id} capped at ${HISTORY_CAP} of ${transitionsFull.length}`)
    }
    return {
      ok: true as const,
      generated: nowIso(),
      boardBuild: readBoardBuild(),
      id: found.id,
      item: { ...found, body, problems: computeProblems(found), transitions: transitionsFull.slice(0, HISTORY_CAP), recency: recencyKey(found) },
      truncated: body.length < bodyFull.length,
      bodyBytes: bodyFull.length,
      historyTotal: transitionsFull.length,
    }
  }
}

/**
 * Slice-3b payload budgets (readItems discipline, scaled for a drawer): the
 * spec body of a real WI can be tens of thousands of chars; the drawer shows
 * the head and names the cap. History is a display cap only — the record keeps
 * every transition.
 */
const ITEM_BODY_BUDGET = 10_000
const HISTORY_CAP = 50

/**
 * The board package's own build stamp (the client bundle writes the same one —
 * scripts/build-client.ts) — the host side of the I-152 staleness verdict
 * payload. "unknown" when the stamp file is absent (never asserted fresh —
 * the same discipline as the client's verdict).
 */
function readBoardBuild(): string {
  try {
    const raw = readFileSync(new URL("./board-build.json", import.meta.url), "utf8")
    const parsed = JSON.parse(raw) as { boardBuild?: unknown }
    return typeof parsed.boardBuild === "string" && parsed.boardBuild !== "" ? parsed.boardBuild : "unknown"
  } catch {
    return "unknown"
  }
}

/** Structural slices of the dsh webServer route seam — deliberately minimal, so this package never needs webserver types (W-044 discipline). */
interface WebLikeResponse {
  writeHead(code: number, headers: Record<string, string>): unknown
  end(chunk: string): unknown
}

interface WebServerLike {
  /** Returns the route's unregister disposer (the real webServer contract), handed to effect as the body's Disposer. */
  register: (route: {
    kind: string
    path: string
    handler: (req: unknown, res: WebLikeResponse) => void | Promise<void>
  }) => () => void
}

export default Board
