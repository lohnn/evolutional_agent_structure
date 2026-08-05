/**
 * hive-board shared transition module — the ONE implementation of board
 * transitions, used by BOTH the plugin's hive_board_* tools (in-session
 * identity: bind, awaken auto-register) and the hive-board viewer app
 * (board-side: create, pause/unpause, true-demote, manual done).
 *
 * Contract: docs/board-viewer/SCHEMA.md v1.0 + DESIGN §5. All writes go
 * through board-store (locked, temp+rename, append-only — SCHEMA §4a). Session
 * identity is the CALLER's problem: the plugin resolves it from the runtime
 * (context.sessionID, never agent self-report — W-009); the viewer performs
 * only ops that need no session identity.
 *
 * Phase 3 slot (hive_board_start): session.create → bindSession(newId) →
 * session.command awaken. bindSession is already the reusable piece, and
 * autoRegister's create-or-bind idempotency means the subsequent hive_awaken
 * inside the created session no-ops instead of double-registering.
 */

import {
  type WorkItem,
  type WorkItemStatus,
  type WorkItemPriority,
  type Transition,
  type Subtask,
  withBoardLock,
  listItems,
  readItem,
  createItemUnlocked,
  editItemUnlocked,
  deleteItemUnlocked,
  specHash,
  nowIso,
} from "./board-store.js"
import { makeDrmCompleteCheck, makeDrmArtifacts } from "./board-reconcile.js"

// ── Result shape ──────────────────────────────────────────────────────────────

export type TransitionOk = {
  ok: true
  /** what happened: created | bound | bound-absorbed | already-bound |
   *  registered | noop-owned | skipped-released | paused | already-paused |
   *  unpaused | not-paused | demoted | done | started | reattached |
   *  noop-no-owner | already-done | redefined */
  action: string
  item: WorkItem
  /** on "bound-absorbed": the pristine placeholder WI id that was dissolved (Q15) */
  absorbed?: string
  /** on "started"/"reattached": the owning session (created fresh, or re-attached by id) */
  sessionID?: string
}

export type TransitionErr = {
  ok: false
  /** machine-readable refusal: NOT_FOUND | ITEM_OWNED | SESSION_OWNS_OTHER |
   *  SESSION_RELEASED | NOT_IN_PROGRESS | ALREADY_DONE | DRM_NOT_COMPLETE */
  reason: string
  /** human-readable explanation for tool output / UI */
  detail: string
}

export type TransitionResult = TransitionOk | TransitionErr

// ── Idea-first creation (board-side or any session; DESIGN §5.2a path 1) ─────

export interface CreateIdeaInit {
  title: string
  body?: string
  status?: Extract<WorkItemStatus, "backlog" | "todo">
  priority?: WorkItemPriority
  tags?: string[]
  /**
   * Author-written plan/decomposition, CREATION-TIME ONLY (SCHEMA §4,
   * ratified 2026-08-03). `subtasks` is canonical authored content, so there
   * is deliberately no post-creation edit path: unlike `tags` (an unordered
   * set whose add/remove deltas commute), subtasks is an ordered list of rich
   * records whose concurrent edits do not commute, and a whole-replace
   * primitive would be a lost-update generator. Setting it at birth is safe
   * because there is no prior value to lose.
   */
  subtasks?: Subtask[]
  /** audit label for the birth transition, e.g. "board:create" */
  by?: string
}

/** Column values an idea may be BORN into. in_progress/done are reached only via transitions. */
const CREATABLE_STATUS = new Set(["backlog", "todo"])
const VALID_PRIORITY = new Set(["low", "medium", "high"])
/** Bare tokens only — letters, digits, dot, dash, underscore. */
export const TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Validate creation input AT RUNTIME.
 *
 * This lives in the module, not in the tool, for two reasons. First, the module
 * is the single owner-published write path (I-179) and board-viewer's create
 * form calls it directly — a guard in the plugin tool would leave the viewer
 * able to write the same illegal state. Second, and the reason this function
 * exists at all: the plugin's `tool()` is the IDENTITY function and
 * `tool.schema` is just re-exported zod that nothing ever invokes, so
 * `tool.schema.enum([...])` describes intent to the model and infers a
 * TypeScript type — but performs NO runtime rejection. A live call passing
 * `status: "in_progress"` reached disk and created an in_progress item with no
 * owner (WI-065, 2026-08-04). TypeScript had narrowed the value to the enum
 * and thereby argued that this check was redundant. It was not.
 */
/** What actually arrived, for a refusal message. `null` and arrays are not "object". */
function argType(v: unknown): string {
  if (v === null) return "null"
  if (Array.isArray(v)) return "array"
  return typeof v
}

/** ≤60 chars of the offending value so the caller recognises it — never a dump. */
function argPreview(v: unknown): string {
  let s: string
  try {
    s = typeof v === "string" ? v : (JSON.stringify(v) ?? String(v))
  } catch {
    s = String(v)
  }
  return s.length > 60 ? `${s.slice(0, 60)}…` : s
}

/**
 * Refuse an argument that is not an array of strings — CONTAINER FIRST, then
 * elements. Exported because both the plugin tool layer and this module need
 * it: `hive_board_create`'s `subtasks` is consumed in `src/tools.ts` (a `.map`
 * that converts `string[]` into records) BEFORE `createIdea` is ever called, so
 * a module-only guard leaves that one arg still throwing.
 *
 * ── Why this exists at all: the declared schema is advertising ──────────────
 * `tool.schema.array(tool.schema.string())` describes the argument to the model
 * and infers a TypeScript type. It rejects NOTHING at runtime — `tool()` is the
 * identity function and `tool.schema` is re-exported zod that nothing invokes.
 * Whatever the model emits arrives as-is. This is the same defect class that
 * put WI-065 on disk (a declared status enum that did not gate), one layer in:
 * the WI-064/065 hardening validated tag CONTENTS (`TAG_PATTERN` per element)
 * but never that the container was an array. `(xs ?? [])` defends against
 * null/undefined and READS like a type guard, which is likely why the gap
 * survived review — it is the shape of a check without being one.
 *
 * Reported from a live machine 2026-08-05 and reproduced here: `tags` as a bare
 * string and as a JSON-encoded string both threw a raw TypeError naming an
 * internal expression (`(init.tags ?? []).filter is not a function`), which
 * surfaces to the caller as an "internal error" with no reason code and no
 * guidance, and reads like a plugin bug rather than a malformed call.
 *
 * ── Why it REFUSES rather than coercing a string to a one-element array ─────
 * Coercion is tempting for the bare case (`tags: "hive-board"` obviously means
 * one tag) but there is no safe general rule, and the two observed inputs need
 * OPPOSITE handling: `'["a","b"]'` coerced naively becomes a single absurd tag
 * whose text is `["a","b"]`. That one happens to trip TAG_PATTERN afterwards —
 * so it would be refused, but for the wrong reason, with a message pointing at
 * tag syntax instead of at the real mistake. Guessing differently for two
 * spellings of one error teaches an inconsistent contract, and for `subtasks`
 * (records, not strings) there is no defensible coercion at all. A refusal that
 * states the required shape is information; a coercion is a guess that writes
 * to disk. Nothing here is unrecoverable for the caller — they retry with an
 * array — so the conservative side is cheap.
 *
 * Returns `null` when the value is absent: every one of these args is optional.
 */
export function expectStringArray(field: string, value: unknown): TransitionErr | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) {
    const looksJson = typeof value === "string" && /^\s*\[/.test(value)
    return {
      ok: false as const,
      reason: "NOT_AN_ARRAY",
      detail:
        `${field} must be an ARRAY of strings, but arrived as ${argType(value)}: ${argPreview(value)}. ` +
        (looksJson
          ? `That looks like a JSON-ENCODED array, and it is deliberately not parsed: unwrapping a string ` +
            `because it resembles JSON would make this boundary guess at a transport problem, and a wrong ` +
            `guess writes a corrupt value no later check can tell from an intended one. `
          : `If you meant a single entry, wrap it in an array: ["${argPreview(value)}"]. `) +
        `Correct shape: ${field}: ["one", "two"].`,
    }
  }
  const at = value.findIndex((x) => typeof x !== "string")
  if (at !== -1) {
    return {
      ok: false as const,
      reason: "BAD_ARRAY_ELEMENT",
      detail:
        `${field}[${at}] must be a string, but is ${argType(value[at])}: ${argPreview(value[at])}. ` +
        `Every entry in ${field} is a plain string; nested arrays and objects are not flattened or unwrapped.`,
    }
  }
  return null
}

/**
 * Refuse a `subtasks` value that is not an array of `{ content, status }`
 * records. Separate from `expectStringArray` because the two layers genuinely
 * differ in shape: the plugin tool accepts `string[]` from the model and maps
 * it into records, so THIS module — the layer board-viewer and any direct
 * caller reach — must validate the RECORD form.
 *
 * The likeliest mistake is therefore an array of bare strings, which is
 * well-formed as an array and still threw (`s.content.trim` of undefined)
 * before this existed. That case is called out by name: a container check
 * alone would have passed it straight through to the same crash, which is why
 * "is it an array" was never a sufficient fix.
 */
export function expectSubtaskArray(field: string, value: unknown): TransitionErr | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) {
    return {
      ok: false as const,
      reason: "NOT_AN_ARRAY",
      detail:
        `${field} must be an ARRAY, but arrived as ${argType(value)}: ${argPreview(value)}. ` +
        `Correct shape: ${field}: [{ content: "step one", status: "pending" }].`,
    }
  }
  const at = value.findIndex(
    (s) => typeof s !== "object" || s === null || typeof (s as { content?: unknown }).content !== "string"
  )
  if (at !== -1) {
    const el = value[at]
    return {
      ok: false as const,
      reason: "BAD_ARRAY_ELEMENT",
      detail:
        `${field}[${at}] must be a record with a string \`content\`, but is ${argType(el)}: ${argPreview(el)}. ` +
        (typeof el === "string"
          ? `A bare string is the common mistake here: the hive_board_create TOOL accepts subtasks as plain ` +
            `strings and converts them for you, but this module is the shared write path and takes the ` +
            `converted form. Send [{ content: ${JSON.stringify(el)}, status: "pending" }].`
          : `Correct shape: ${field}: [{ content: "step one", status: "pending" }].`),
    }
  }
  return null
}

function validateCreateInit(init: CreateIdeaInit): TransitionErr | null {
  if (init.title.trim() === "") {
    return { ok: false as const, reason: "EMPTY_TITLE", detail: "A work item needs a title." }
  }
  if (init.status !== undefined && !CREATABLE_STATUS.has(init.status)) {
    return {
      ok: false as const,
      reason: "INVALID_STATUS",
      detail:
        `Cannot create an item with status "${init.status}". Ideas are born backlog or todo only — ` +
        `in_progress and done are REACHED through transitions (hive_board_bind / hive_board_start / dream completion), ` +
        `never set directly. Creating in_progress without an owner_session would violate SCHEMA §3 invariant 1.`,
    }
  }
  if (init.priority !== undefined && !VALID_PRIORITY.has(init.priority)) {
    return {
      ok: false as const,
      reason: "INVALID_PRIORITY",
      detail: `Invalid priority "${init.priority}" — use low, medium or high.`,
    }
  }
  // CONTAINER BEFORE CONTENTS. The two checks below inspect elements, and
  // every one of them is a method call that throws on a non-array. That
  // ordering is the entire bug this pair of guards fixes: the content checks
  // existed and looked thorough, but they were reached with an unvalidated
  // container, so a malformed arg crashed instead of being refused.
  const badTagsShape = expectStringArray("tags", init.tags)
  if (badTagsShape) return badTagsShape
  const badSubtasksShape = expectSubtaskArray("subtasks", init.subtasks)
  if (badSubtasksShape) return badSubtasksShape

  const badTags = (init.tags ?? []).filter((t) => !TAG_PATTERN.test(t))
  if (badTags.length > 0) {
    return {
      ok: false as const,
      reason: "INVALID_TAG",
      detail: `Invalid tag(s): ${badTags.join(", ")}. Tags are bare tokens — letters, digits, dot, dash, underscore.`,
    }
  }
  if ((init.subtasks ?? []).some((s) => s.content.trim() === "")) {
    return { ok: false as const, reason: "EMPTY_SUBTASK", detail: "Subtask entries cannot be empty." }
  }
  return null
}

export function createIdea(directory: string, init: CreateIdeaInit): Promise<TransitionResult> {
  const refusal = validateCreateInit(init)
  if (refusal) return Promise.resolve(refusal)
  return withBoardLock(directory, () => {
    const status = init.status ?? "backlog"
    const birth: Transition = { at: nowIso(), from: null, to: status, by: init.by ?? "board:create" }
    const item = createItemUnlocked(directory, {
      title: init.title.trim(),
      status,
      owner_session: null,
      group_id: null,
      origin: "idea-first",
      paused: false,
      spec_hash: null,
      released_sessions: [],
      dream_id: null,
      artifacts: [],
      priority: init.priority ?? "medium",
      tags: init.tags ?? [],
      done_without_dream: false,
      subtasks: init.subtasks ?? [],
      todo_mirror: [],
      todo_mirror_updated: null,
      transitions: [birth],
      body: init.body ?? "",
    })
    return { ok: true as const, action: "created", item }
  })
}

// ── Bind (in-session identity — hive_board_bind, and Phase 3 start) ──────────

/**
 * Bind a session to an item: stamp owner_session + group_id together (I-043),
 * origin stays as-born, status → in_progress, spec_hash stamped from the
 * current body (provenance), transition appended. Enforces the 1:1
 * session⟷item invariant (Q7) and released_sessions[] tombstones (§5.5),
 * all atomically under the board lock.
 */
export function bindSession(
  directory: string,
  id: string,
  sessionID: string,
  groupID: string | null,
  by = "hive_board_bind"
): Promise<TransitionResult> {
  return withBoardLock(directory, () => {
    const items = listItems(directory)
    const item = items.find((i) => i.id === id)
    if (!item) {
      return { ok: false as const, reason: "NOT_FOUND", detail: `No work item ${id} in .opencode/board/.` }
    }
    if (item.owner_session === sessionID) {
      return { ok: true as const, action: "already-bound", item } // idempotent (Phase 3 start flow)
    }
    if (item.owner_session) {
      return {
        ok: false as const,
        reason: "ITEM_OWNED",
        detail: `${id} is already owned by session ${item.owner_session} (1:1 invariant, Q7). Done→In-Progress must re-attach that session, never rebind.`,
      }
    }
    if (item.released_sessions.includes(sessionID)) {
      return {
        ok: false as const,
        reason: "SESSION_RELEASED",
        detail: `Session ${sessionID} was true-demoted from ${id} (tombstoned in released_sessions[]). Re-promoting with an unchanged spec re-attaches via deep link; a changed spec gets a fresh session (§5.5).`,
      }
    }
    const owned = items.find((i) => i.owner_session === sessionID)
    let absorbedId: string | undefined
    if (owned) {
      if (!isPristinePlaceholder(owned)) {
        return {
          ok: false as const,
          reason: "SESSION_OWNS_OTHER",
          detail: `This session already owns ${owned.id} ("${owned.title}") — session⟷item is strictly 1:1 (Q7).`,
        }
      }
      // Bind-time absorption (SCHEMA §3 invariant 6 / Q15): the placeholder is
      // pristine — zero information beyond what the survivor's lineage entry
      // records — so dissolve it. The one sanctioned deletion, inside the lock.
      deleteItemUnlocked(directory, owned.id)
      absorbedId = owned.id
    }
    const updated = editItemUnlocked(directory, id, {
      set: {
        owner_session: sessionID,
        group_id: groupID,
        status: "in_progress",
        paused: false,
        spec_hash: specHash(item.body),
      },
      appendTransition: {
        at: nowIso(),
        from: item.status,
        to: "in_progress",
        by,
        session: sessionID,
        ...(absorbedId !== undefined ? { absorbed: absorbedId } : {}),
      },
    })
    return absorbedId !== undefined
      ? { ok: true as const, action: "bound-absorbed", item: updated, absorbed: absorbedId }
      : { ok: true as const, action: "bound", item: updated }
  })
}

/**
 * Pristine placeholder (Q15): a session-first auto-registered item that has
 * accrued ZERO information since birth — origin session-first, never dreamt,
 * body unchanged since creation (hash equals the creation-time spec_hash
 * stamped by autoRegister), and no `subtasks` authored on it. Only such items
 * may be absorbed; anything else refuses so accrued content is never destroyed.
 *
 * IMPORTANT — this is evaluated on the item being DISSOLVED, never on the item
 * being bound to. An idea-first item carrying an author-written plan is always
 * the SURVIVOR, so its subtasks are never consulted here and never destroyed.
 *
 * The `subtasks.length === 0` condition was written when `subtasks` was
 * believed to be a TodoWrite mirror; under the 2026-08-03 reclassification
 * (SCHEMA §4/§4c) it reads as "no authored content accrued on this
 * placeholder", which is a BETTER fit for this gate's stated purpose than the
 * meaning it was written with. Re-verified on its hardest inputs — see the
 * "reclassification:" tests in test/board-transitions.test.ts.
 */
function isPristinePlaceholder(item: WorkItem): boolean {
  return (
    item.origin === "session-first" &&
    item.dream_id === null &&
    item.spec_hash !== null &&
    specHash(item.body) === item.spec_hash &&
    item.subtasks.length === 0
  )
}

// ── Auto-register on /awaken (create-or-bind — DESIGN §5.3b) ─────────────────

/**
 * Called from the hive_awaken tool handler for top-level coordinator sessions.
 * Semantics (all under one lock):
 *   - session already owns an item        → no-op (idempotency for Phase 3 start)
 *   - session tombstoned in ANY item's released_sessions[] → skip entirely
 *     (true-demoted sessions must not reappear on the board — §5.5)
 *   - otherwise → create a session-first item, already in_progress, owned.
 */
export function autoRegister(
  directory: string,
  sessionID: string,
  groupID: string | null,
  title: string,
  by = "hive_awaken"
): Promise<TransitionOk> {
  return withBoardLock(directory, () => {
    const items = listItems(directory)
    const owned = items.find((i) => i.owner_session === sessionID)
    if (owned) {
      return { ok: true as const, action: "noop-owned", item: owned }
    }
    const releasing = items.find((i) => i.released_sessions.includes(sessionID))
    if (releasing) {
      return { ok: true as const, action: "skipped-released", item: releasing }
    }
    const body = ""
    const item = createItemUnlocked(directory, {
      title,
      status: "in_progress",
      owner_session: sessionID,
      group_id: groupID,
      origin: "session-first",
      paused: false,
      spec_hash: specHash(body), // creation IS the bind for session-first items
      released_sessions: [],
      dream_id: null,
      artifacts: [],
      priority: "medium",
      tags: [],
      done_without_dream: false,
      subtasks: [],
      todo_mirror: [],
      todo_mirror_updated: null,
      transitions: [{ at: nowIso(), from: null, to: "in_progress", by, session: sessionID }],
      body,
    })
    return { ok: true as const, action: "registered", item }
  })
}

// ── Pause / unpause (sub-state of In Progress — §5.5 "park it") ──────────────

export function pauseItem(directory: string, id: string, by = "board:pause"): Promise<TransitionResult> {
  return setPaused(directory, id, true, by)
}

export function unpauseItem(directory: string, id: string, by = "board:unpause"): Promise<TransitionResult> {
  return setPaused(directory, id, false, by)
}

function setPaused(directory: string, id: string, paused: boolean, by: string): Promise<TransitionResult> {
  return withBoardLock(directory, () => {
    const item = readInLock(directory, id)
    if (!item) return { ok: false as const, reason: "NOT_FOUND", detail: `No work item ${id}.` }
    if (item.status !== "in_progress") {
      return { ok: false as const, reason: "NOT_IN_PROGRESS", detail: `${id} is ${item.status}; paused is a sub-state of in_progress only.` }
    }
    if (item.paused === paused) {
      return { ok: true as const, action: paused ? "already-paused" : "not-paused", item }
    }
    const updated = editItemUnlocked(directory, id, {
      set: { paused },
      appendTransition: {
        at: nowIso(),
        from: "in_progress",
        to: "in_progress",
        by,
        ...(item.owner_session ? { session: item.owner_session } : {}),
      },
    })
    return { ok: true as const, action: paused ? "paused" : "unpaused", item: updated }
  })
}

// ── True demote (§5.5 "rethink it": tombstone + spec_hash re-stamp) ──────────

/**
 * Detach the owning session (append it to released_sessions[] so auto-register
 * never re-adopts it), clear ownership, re-stamp spec_hash from the CURRENT
 * body (the demote-time baseline that re-promote compares against — Q13), and
 * move the item back to todo/backlog. The session is history, not forgotten:
 * the transition entry keeps its id.
 */
export function demoteItem(
  directory: string,
  id: string,
  to: Extract<WorkItemStatus, "backlog" | "todo"> = "todo",
  by = "board:demote"
): Promise<TransitionResult> {
  return withBoardLock(directory, () => {
    const item = readInLock(directory, id)
    if (!item) return { ok: false as const, reason: "NOT_FOUND", detail: `No work item ${id}.` }
    if (item.status !== "in_progress") {
      return { ok: false as const, reason: "NOT_IN_PROGRESS", detail: `${id} is ${item.status}; true-demote applies to in_progress items.` }
    }
    const released = item.owner_session
    const updated = editItemUnlocked(directory, id, {
      set: {
        status: to,
        owner_session: null,
        group_id: null,
        paused: false,
        spec_hash: specHash(item.body), // demote-time baseline (Q13)
      },
      ...(released ? { appendReleasedSession: released } : {}),
      appendTransition: {
        at: nowIso(),
        from: "in_progress",
        to,
        by,
        ...(released ? { session: released } : {}),
      },
    })
    return { ok: true as const, action: "demoted", item: updated }
  })
}

// ── Manual done without dream (§5.4 escape hatch — badged, never silent) ─────

export function markDoneWithoutDream(
  directory: string,
  id: string,
  by = "board:done-without-dream"
): Promise<TransitionResult> {
  return withBoardLock(directory, () => {
    const item = readInLock(directory, id)
    if (!item) return { ok: false as const, reason: "NOT_FOUND", detail: `No work item ${id}.` }
    if (item.status === "done") {
      return { ok: false as const, reason: "ALREADY_DONE", detail: `${id} is already done.` }
    }
    const updated = editItemUnlocked(directory, id, {
      set: { status: "done", done_without_dream: true, paused: false },
      appendTransition: {
        at: nowIso(),
        from: item.status,
        to: "done",
        by,
        ...(item.owner_session ? { session: item.owner_session } : {}),
      },
    })
    return { ok: true as const, action: "done", item: updated }
  })
}

// ── Dream-complete → Done (event-driven, in-session identity — W-064/I-179) ──

/** The `by:` label for a dream-completion done transition, scoped by DRM. */
export function dreamCompleteBy(drm: string): string {
  return `board:dream-complete:${drm}`
}

export interface MarkDoneFromDreamOptions {
  /**
   * Belt-and-braces DRM-COMPLETE cross-check (W-077). Defaults to the real
   * dreams/history/DRM-NNN.yaml reader; tests inject a fake. If it returns
   * false the helper refuses (a Done must never be stamped from a DRM that is
   * not genuinely COMPLETE on disk).
   */
  drmIsComplete?: (drm: string) => boolean
  /**
   * Artifact ids to mirror onto the item (cache mirror, I-144). Defaults to
   * reading them from the COMPLETE DRM file. The handler already has these from
   * completeDream's result, but we re-derive from the authoritative DRM by
   * default so the mirror can never diverge from the archive.
   */
  drmArtifacts?: (drm: string) => string[]
}

/**
 * Promote the work item OWNED by `sessionID` to Done because that session's
 * dream `drm` just completed. The event-driven sibling of the reconciler's
 * back-fill Done path: the reconciler CREATES done cards for un-owned sessions;
 * this PROMOTES an already-owned in_progress item whose owning session dreamt
 * (the gap — there is no timer tick, W-064, so the completing process applies
 * the transition itself). Trigger lives in the hive_dream_complete tool handler
 * (the only place with trustworthy in-session identity, I-179); this is the ONE
 * locked write (withBoardLock + editItemUnlocked), never a second writer.
 *
 * All decisions are made under the lock against a fresh disk read (idempotency
 * by explicit marker on the WI — the stamped dream_id and the recorded
 * transition, never inference-from-absence, W-061/W-079):
 *
 *   - no item owned by this session  → clean no-op (action "noop-no-owner").
 *     The common case: most dreaming sessions don't own a board item.
 *   - DRM not COMPLETE on disk       → refuse DRM_NOT_COMPLETE (belt & braces).
 *   - item in_progress               → stamp dream_id + artifacts, clear paused,
 *     append in_progress→done (action "done").
 *   - item already done, dream_id == drm → clean no-op (action "already-done").
 *     Exact re-fire (double completion of the same DRM) double-appends nothing.
 *   - item already done, different/absent dream_id → RE-STAMP to this DRM
 *     (action "redefined"): a later dream in a multi-dream session, or an
 *     upgrade of a done_without_dream escape-hatch item to a real dream basis.
 *     Follows the reconciler convention (latest COMPLETE is the definer; earlier
 *     done transitions stay in the log as lineage). Clears done_without_dream —
 *     an audited state change (the appended transition), never a silent flip.
 *   - item backlog/todo (owned but not in progress — should not happen) → refuse
 *     NOT_IN_PROGRESS. Never reopen/clobber; a real reopen is promoteItem's
 *     audited done→todo, not this path.
 */
export function markItemDoneFromDream(
  directory: string,
  sessionID: string,
  drm: string,
  opts: MarkDoneFromDreamOptions = {}
): Promise<TransitionResult> {
  const isComplete = opts.drmIsComplete ?? makeDrmCompleteCheck(directory)
  const artifactsOf = opts.drmArtifacts ?? makeDrmArtifacts(directory)
  return withBoardLock(directory, () => {
    // Re-read inside the lock — no stale in-memory copy (SCHEMA §4a.3).
    const item = listItems(directory).find((i) => i.owner_session === sessionID)
    if (!item) {
      return {
        ok: true as const,
        action: "noop-no-owner",
        // Synthetic empty item keeps the OK shape uniform without a real record.
        item: undefined as unknown as WorkItem,
      }
    }

    // Already done and already defined by THIS dream → exact re-fire, no-op.
    if (item.status === "done" && item.dream_id === drm) {
      return { ok: true as const, action: "already-done", item }
    }

    // Belt-and-braces: only mark Done from a DRM the archive confirms COMPLETE.
    if (!isComplete(drm)) {
      return {
        ok: false as const,
        reason: "DRM_NOT_COMPLETE",
        detail: `${drm} is not status COMPLETE in dreams/history/ — refusing to mark ${item.id} done from an incomplete dream.`,
      }
    }

    // Owned but parked outside in_progress/done (backlog/todo) — never clobber.
    if (item.status !== "in_progress" && item.status !== "done") {
      return {
        ok: false as const,
        reason: "NOT_IN_PROGRESS",
        detail: `${item.id} is ${item.status}; dream-complete Done applies to the in_progress owner only (reopen is promoteItem's audited transition, not this path).`,
      }
    }

    const artifacts = artifactsOf(drm)
    const from = item.status // "in_progress" (happy path) or "done" (re-stamp lineage)
    const updated = editItemUnlocked(directory, item.id, {
      set: {
        status: "done",
        dream_id: drm,
        paused: false,
        // A dream-backed Done is by definition not "without dream"; clearing the
        // escape-hatch badge here is audited by the appended transition below.
        done_without_dream: false,
      },
      setArtifacts: artifacts,
      appendTransition: {
        at: nowIso(),
        from,
        to: "done",
        by: dreamCompleteBy(drm),
        session: sessionID,
      },
    })
    return {
      ok: true as const,
      action: from === "done" ? "redefined" : "done",
      item: updated,
    }
  })
}

// ── Authoring edits: respec / retitle / tags (WI-064) ────────────────────────

/**
 * Ownership gate shared by the authoring edits (SCHEMA §2 field authority).
 *
 * Body and title are freely writable while the item is UN-OWNED, and belong to
 * the owning session once it is owned ("B → A while owned", Q13). Only the
 * plugin runtime can resolve a session id trustworthily (W-009), so the caller
 * passes the identity it has proven; `null` means "no proven session", which
 * may only edit un-owned items.
 */
function ownershipRefusal(item: WorkItem, callerSession: string | null, what: string): TransitionErr | null {
  if (item.owner_session === null) return null
  if (item.owner_session === callerSession) return null
  return {
    ok: false as const,
    reason: "ITEM_OWNED",
    detail:
      `${item.id} is owned by session ${item.owner_session}; once owned, its ${what} belongs to that ` +
      `session alone (SCHEMA §2 — it accumulates notes and decisions as it works). ` +
      `Edit it from that session, or true-demote the item first to make it fluid again (§5.5).`,
  }
}

export interface RespecOptions {
  /** The caller's PROVEN session id, or null for an identity-free caller (the board). */
  session?: string | null
  /** Audit label, e.g. "hive_board_respec". */
  by?: string
}

/**
 * Replace an item's spec body, preserving the text it replaces (WI-064).
 *
 * The prior body is archived content-addressed under `board/<id>/` by the
 * storage layer (structurally, not optionally), and a transition entry
 * carrying `superseded: <old hash>` records THAT the spec changed, when, and
 * by whom — a tombstone readable without opening the payload (W-103).
 *
 * Deliberately does NOT re-stamp `spec_hash`: `reattachInfo()` compares the
 * stamp against the live body to decide re-attach vs fresh session, so the
 * divergence this edit creates IS the signal (Q13).
 */
export function respecItem(
  directory: string,
  id: string,
  body: string,
  opts: RespecOptions = {}
): Promise<TransitionResult> {
  const callerSession = opts.session ?? null
  return withBoardLock(directory, () => {
    const item = readItem(directory, id) // re-read inside the lock
    if (!item) {
      return { ok: false as const, reason: "NOT_FOUND", detail: `No work item ${id} in .opencode/board/.` }
    }
    const refusal = ownershipRefusal(item, callerSession, "spec body")
    if (refusal) return refusal

    const next = body.replace(/^\n+/, "").replace(/\s+$/, "")
    if (next === "") {
      return {
        ok: false as const,
        reason: "EMPTY_BODY",
        detail: `Refusing to replace ${id}'s spec with an empty body — that would discard the spec, not revise it.`,
      }
    }
    const priorHash = specHash(item.body)
    if (specHash(next) === priorHash) {
      // Idempotent no-op (I-212): no revision, no transition, no `updated` bump.
      return { ok: true as const, action: "respec-noop", item }
    }

    // `superseded` is a POINTER to an archived payload, so it may only be
    // stamped when a payload actually exists. Writing the first spec onto an
    // item created without a body supersedes nothing: the storage layer
    // archives nothing (there is no text to preserve), so stamping the hash of
    // the empty string would leave a dangling pointer that resolves to null —
    // an entry claiming text was replaced when none ever existed. Found by
    // disposing of WI-065, which had an empty body; every test until then had
    // created items WITH bodies and never exercised this path.
    const hadPriorBody = item.body.trim() !== ""

    const updated = editItemUnlocked(directory, id, {
      setBody: { body: next },
      appendTransition: {
        at: nowIso(),
        from: item.status,
        to: item.status, // a revision is not a column move — the status self-loop is the honest record
        by: opts.by ?? "board:respec",
        ...(callerSession !== null ? { session: callerSession } : {}),
        ...(hadPriorBody ? { superseded: priorHash } : {}),
      },
    })
    return { ok: true as const, action: "respecced", item: updated }
  })
}

/** Retitle an item. Same ownership rule as the body — once owned, the title is session-mirrored (§2). */
export function retitleItem(
  directory: string,
  id: string,
  title: string,
  opts: RespecOptions = {}
): Promise<TransitionResult> {
  const callerSession = opts.session ?? null
  return withBoardLock(directory, () => {
    const item = readItem(directory, id)
    if (!item) {
      return { ok: false as const, reason: "NOT_FOUND", detail: `No work item ${id} in .opencode/board/.` }
    }
    const refusal = ownershipRefusal(item, callerSession, "title")
    if (refusal) return refusal
    const next = title.trim()
    if (next === "") {
      return { ok: false as const, reason: "EMPTY_TITLE", detail: `Refusing to set an empty title on ${id}.` }
    }
    if (next === item.title) return { ok: true as const, action: "retitle-noop", item }
    return { ok: true as const, action: "retitled", item: editItemUnlocked(directory, id, { set: { title: next } }) }
  })
}

/**
 * Add and/or remove tags as SET DELTAS (WI-064).
 *
 * No ownership gate: tags are proposal-journal metadata that any session or
 * the board may adjust (SCHEMA §2), and the delta shape means a concurrent
 * editor's change is merged rather than clobbered. No transition entry either
 * — tags are mutable metadata like `priority` (which has never logged one),
 * and nothing is destroyed, so there is no loss to audit.
 */
export function editItemTags(
  directory: string,
  id: string,
  delta: { add?: string[]; remove?: string[] },
  _opts: RespecOptions = {}
): Promise<TransitionResult> {
  // Shape is checked BEFORE the lock and before readItem, deliberately, for two
  // reasons. It is a pure argument check that needs no board state, so taking a
  // 5 s-timeout lock to perform it can make a concurrent WRITE fail for a call
  // that was never going to write. And it fixes the order in which a caller
  // learns things: previously a malformed `add` on an id that does not exist
  // reported NOT_FOUND, so the caller fixed the id and only then met the
  // TypeError — two round trips for one malformed call. A malformed argument
  // now outranks a missing target.
  const badAdd = expectStringArray("add", delta.add)
  if (badAdd) return Promise.resolve(badAdd)
  const badRemove = expectStringArray("remove", delta.remove)
  if (badRemove) return Promise.resolve(badRemove)

  return withBoardLock(directory, () => {
    const item = readItem(directory, id)
    if (!item) {
      return { ok: false as const, reason: "NOT_FOUND", detail: `No work item ${id} in .opencode/board/.` }
    }
    const norm = (xs: string[] | undefined) =>
      [...new Set((xs ?? []).map((t) => t.trim()).filter((t) => t !== ""))]
    const add = norm(delta.add)
    const remove = norm(delta.remove)
    const bad = add.filter((t) => remove.includes(t))
    if (bad.length > 0) {
      return {
        ok: false as const,
        reason: "CONTRADICTORY_TAGS",
        detail: `Tag(s) ${bad.join(", ")} appear in both add and remove — refusing to guess an order. Send one or the other.`,
      }
    }
    const malformed = [...add, ...remove].filter((t) => !TAG_PATTERN.test(t))
    if (malformed.length > 0) {
      return {
        ok: false as const,
        reason: "INVALID_TAG",
        detail: `Invalid tag(s): ${malformed.join(", ")}. Tags are bare tokens — letters, digits, dot, dash, underscore; no spaces, commas or brackets.`,
      }
    }
    if (add.length === 0 && remove.length === 0) {
      return { ok: false as const, reason: "EMPTY_DELTA", detail: `Nothing to do for ${id} — pass add and/or remove.` }
    }
    // Guard-before-mutate (I-212): skip the write entirely when the delta is a
    // no-op, so an idempotent retry does not bump `updated`.
    const wouldAdd = add.some((t) => !item.tags.includes(t))
    const wouldRemove = remove.some((t) => item.tags.includes(t))
    if (!wouldAdd && !wouldRemove) return { ok: true as const, action: "tags-noop", item }

    return {
      ok: true as const,
      action: "tags-edited",
      item: editItemUnlocked(directory, id, { editTags: { add, remove } }),
    }
  })
}

// ── Session client seam (Phase 3: start/create + re-attach) ──────────────────

/**
 * The narrow session surface the transition module needs. Two adapters ship
 * (sdkSessionClient for the plugin, httpSessionClient for the viewer); tests
 * fake this seam directly.
 */
export interface BoardSessionClient {
  /** Create a fresh TOP-LEVEL session (no parentID). Returns its session id. */
  createSession(title: string): Promise<string>
  /** Run a slash command inside a session (used ONLY for /awaken on created sessions). */
  command(sessionID: string, command: string, argsText: string): Promise<void>
}

/** Structural view of the typed @opencode-ai/sdk client (plugin side). */
export interface SdkLikeClient {
  session: {
    create(opts: { body: { title: string } }): Promise<{ data?: { id?: string } | undefined }>
    command(opts: {
      path: { id: string }
      body: { command: string; arguments: string }
    }): Promise<unknown>
  }
}

/** Adapter over the plugin's own SDK client. */
export function sdkSessionClient(client: SdkLikeClient): BoardSessionClient {
  return {
    async createSession(title: string): Promise<string> {
      const res = await client.session.create({ body: { title } })
      const id = res?.data?.id
      if (!id) throw new Error("SESSION_CREATE_FAILED: no session id in SDK response")
      return id
    },
    async command(sessionID: string, command: string, argsText: string): Promise<void> {
      await client.session.command({ path: { id: sessionID }, body: { command, arguments: argsText } })
    },
  }
}

/**
 * Adapter over the raw HTTP server (viewer side): 127.0.0.1:$PORT, HTTP Basic
 * with username literally "opencode" and password $OPENCODE_SERVER_PASSWORD
 * (OPEN-QUESTIONS Q14 record). `directory` should be the workspace root —
 * session creation is directory-scoped.
 */
export function httpSessionClient(opts: {
  baseUrl: string
  password: string
  username?: string
  directory?: string
}): BoardSessionClient {
  const auth = "Basic " + Buffer.from(`${opts.username ?? "opencode"}:${opts.password}`).toString("base64")
  const dirQ = opts.directory ? `?directory=${encodeURIComponent(opts.directory)}` : ""
  const headers = { "Content-Type": "application/json", Authorization: auth }
  return {
    async createSession(title: string): Promise<string> {
      const res = await fetch(`${opts.baseUrl}/session${dirQ}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error(`SESSION_CREATE_FAILED: HTTP ${res.status}`)
      const data = (await res.json()) as { id?: string }
      if (!data.id) throw new Error("SESSION_CREATE_FAILED: no session id in response")
      return data.id
    },
    async command(sessionID: string, command: string, argsText: string): Promise<void> {
      const res = await fetch(`${opts.baseUrl}/session/${encodeURIComponent(sessionID)}/command${dirQ}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ command, arguments: argsText }),
      })
      if (!res.ok) throw new Error(`SESSION_COMMAND_FAILED: HTTP ${res.status}`)
    },
  }
}

// ── Start (DESIGN §5.3 path c: fresh session + bind + awaken-on-create) ──────

export interface StartOptions {
  /** audit label (default "hive_board_start") */
  by?: string
  /**
   * Await the /awaken agent turn (a full model turn — can take minutes).
   * Default FALSE: the command is fired and the function returns as soon as
   * ownership is stamped; awaken failures go to onAwakenError.
   */
  waitForAwaken?: boolean
  /** called if the fire-and-forget /awaken trigger fails */
  onAwakenError?: (err: unknown) => void
}

/**
 * Start an idea item: session.create a fresh TOP-LEVEL session, bind ownership
 * through the SAME bindSession logic (no duplicated stamping), then trigger
 * /awaken in the new session seeded with the item's spec.
 *
 * ORDERING (DESIGN §5.3c, verified by test): owner_session is stamped BEFORE
 * the awaken command fires — hive_awaken's auto-register is create-or-bind and
 * no-ops on an already-owned session.
 *
 * Awaken-on-create applies ONLY here (sessions the board creates). Re-attach
 * paths never re-run /awaken (SCHEMA §3 invariant 4).
 */
export async function startItem(
  directory: string,
  id: string,
  sessions: BoardSessionClient,
  opts: StartOptions = {}
): Promise<TransitionResult> {
  const by = opts.by ?? "hive_board_start"

  // Pre-validate BEFORE creating a session, so refusals don't leak orphans.
  const pre = readItem(directory, id)
  if (!pre) return { ok: false, reason: "NOT_FOUND", detail: `No work item ${id} in .opencode/board/.` }
  if (pre.status === "done") {
    return { ok: false, reason: "ALREADY_DONE", detail: `${id} is done — reopen via promoteItem (re-attaches the original session), never a fresh start.` }
  }
  if (pre.owner_session) {
    return { ok: false, reason: "ITEM_OWNED", detail: `${id} is already owned by session ${pre.owner_session}.` }
  }

  const sessionID = await sessions.createSession(pre.title)

  // Authoritative stamp under the board lock (re-checks everything).
  const bound = await bindSession(directory, id, sessionID, sessionID, by)
  if (!bound.ok) {
    return {
      ok: false,
      reason: bound.reason,
      detail: `${bound.detail} NOTE: fresh session ${sessionID} was created before the race was detected and is now orphaned — safe to delete.`,
    }
  }

  // Owner is on disk — NOW trigger /awaken, seeded with the spec.
  const seed = `Work item ${bound.item.id}: "${bound.item.title}".${bound.item.body.trim() ? `\n\nSpec:\n${bound.item.body.trim()}` : ""}`
  const awaken = sessions.command(sessionID, "awaken", seed)
  if (opts.waitForAwaken) {
    await awaken
  } else {
    awaken.catch((err) => opts.onAwakenError?.(err))
  }

  return { ok: true, action: "started", item: bound.item, sessionID }
}

// ── Re-promote decision + execution (§5.5, SCHEMA §3 invariant 4) ────────────

export type ReattachDecision =
  | { kind: "fresh"; reason: "never-owned" | "spec-changed" | "done-never-owned" }
  | { kind: "reattach"; sessionID: string; reAwaken: false; reason: "spec-unchanged" | "done-reopen" }
  | { kind: "refuse"; reason: string; detail: string }

/**
 * Pure decision: what should promoting this item do?
 *   - done            → re-attach the frozen owner (invariant 4), never fresh
 *   - demoted, body hash == demote-time spec_hash → re-attach the last
 *     released session (deep link only — NO re-awaken, ever)
 *   - demoted, body changed → fresh session (the edit IS the decision)
 *   - never owned → fresh session
 */
export function reattachInfo(directory: string, id: string): ReattachDecision {
  const item = readItem(directory, id)
  if (!item) return { kind: "refuse", reason: "NOT_FOUND", detail: `No work item ${id}.` }
  if (item.status === "in_progress") {
    return { kind: "refuse", reason: "ALREADY_IN_PROGRESS", detail: `${id} is already in progress (owner ${item.owner_session ?? "unset"}).` }
  }
  if (item.status === "done") {
    // done_without_dream on a never-owned idea (Q16): reopen means a FRESH
    // start — there is no session to re-attach. promoteItem un-does the item
    // first; direct startItem still refuses ALREADY_DONE.
    if (!item.owner_session) return { kind: "fresh", reason: "done-never-owned" }
    return { kind: "reattach", sessionID: item.owner_session, reAwaken: false, reason: "done-reopen" }
  }
  // backlog / todo
  const lastReleased = item.released_sessions[item.released_sessions.length - 1]
  if (lastReleased === undefined) return { kind: "fresh", reason: "never-owned" }
  if (item.spec_hash !== null && specHash(item.body) === item.spec_hash) {
    return { kind: "reattach", sessionID: lastReleased, reAwaken: false, reason: "spec-unchanged" }
  }
  return { kind: "fresh", reason: "spec-changed" }
}

/**
 * Execute the promote decision. Fresh → startItem (awaken-on-create). Reattach
 * → re-stamp the ORIGINAL session as owner (deep link re-entry; /awaken is
 * NEVER re-run — the session could only ever have owned an item by having been
 * awakened, and awakened status persists in awakeSessions).
 */
export async function promoteItem(
  directory: string,
  id: string,
  sessions: BoardSessionClient,
  opts: StartOptions & { by?: string } = {}
): Promise<TransitionResult> {
  const by = opts.by ?? "board:promote"
  const decision = reattachInfo(directory, id)
  if (decision.kind === "refuse") {
    return { ok: false, reason: decision.reason, detail: decision.detail }
  }
  if (decision.kind === "fresh") {
    if (decision.reason === "done-never-owned") {
      // Q16: reopen-as-fresh. Un-do the item first (clear the badge, leave
      // done), THEN run the normal awaken-on-create start. All start refusals
      // are pre-validated by the decision itself (item exists, un-owned; done
      // is the one gate we are deliberately lifting), so the un-done item
      // cannot be stranded by a startItem refusal — only a concurrent writer
      // could interfere, and bind stays authoritative for that.
      const undone = await withBoardLock(directory, (): TransitionErr | { item: WorkItem } => {
        const item = readInLock(directory, id)
        if (!item) return { ok: false, reason: "NOT_FOUND", detail: `No work item ${id}.` }
        if (item.status !== "done" || item.owner_session) {
          return {
            ok: false,
            reason: "CONFLICT",
            detail: `${id} changed concurrently (status ${item.status}, owner ${item.owner_session ?? "none"}) — re-run promote.`,
          }
        }
        return {
          item: editItemUnlocked(directory, id, {
            set: { status: "todo", done_without_dream: false },
            appendTransition: { at: nowIso(), from: "done", to: "todo", by },
          }),
        }
      })
      if ("ok" in undone) return undone
      return startItem(directory, id, sessions, { ...opts, by })
    }
    return startItem(directory, id, sessions, { ...opts, by })
  }
  // Re-attach under the lock (re-verify the decision against fresh disk state).
  return withBoardLock(directory, () => {
    const item = readInLock(directory, id)
    if (!item) return { ok: false as const, reason: "NOT_FOUND", detail: `No work item ${id}.` }
    if (item.status === "in_progress") {
      return { ok: false as const, reason: "ALREADY_IN_PROGRESS", detail: `${id} became in_progress concurrently.` }
    }
    const updated = editItemUnlocked(directory, id, {
      set: {
        owner_session: decision.sessionID,
        group_id: decision.sessionID,
        status: "in_progress",
        paused: false,
        // reopening clears the escape-hatch badge; a later completion re-decides
        done_without_dream: false,
      },
      appendTransition: { at: nowIso(), from: item.status, to: "in_progress", by, session: decision.sessionID },
    })
    return { ok: true as const, action: "reattached", item: updated, sessionID: decision.sessionID }
  })
}

// ── internal ──────────────────────────────────────────────────────────────────

/** Fresh read inside the lock (never a stale in-memory copy — SCHEMA §4a.3). */
function readInLock(directory: string, id: string): WorkItem | null {
  return readItem(directory, id)
}
