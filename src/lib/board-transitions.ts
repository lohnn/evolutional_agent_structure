/**
 * hive-board shared transition module — the ONE implementation of board
 * transitions, used by BOTH the plugin's hive_board_* tools (in-session
 * identity: bind, awaken auto-register) and the hive-board viewer app
 * (board-side: create, pause/unpause, true-demote, manual done).
 *
 * Contract: projects/hive-board/docs/SCHEMA.md v1.0 + DESIGN §5. All writes go
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
  /** audit label for the birth transition, e.g. "board:create" */
  by?: string
}

export function createIdea(directory: string, init: CreateIdeaInit): Promise<TransitionOk> {
  return withBoardLock(directory, () => {
    const status = init.status ?? "backlog"
    const birth: Transition = { at: nowIso(), from: null, to: status, by: init.by ?? "board:create" }
    const item = createItemUnlocked(directory, {
      title: init.title,
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
      subtasks: [],
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
 * stamped by autoRegister), and no subtask mirror recorded. Only such items
 * may be absorbed; anything else refuses so accrued content is never destroyed.
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
