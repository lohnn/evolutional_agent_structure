/**
 * hive-board COMMAND transitions (WI-093) — the locked-store write paths for
 * the user-invocable `/board-close` / `/board-release` / `/board-reopen`
 * commands (dsh evolution package; every mutation in this file sits inside
 * withBoardLock and goes through editItemUnlocked — the ONE write path).
 *
 * Why a separate module instead of extending board-transitions.ts: that file
 * is a documented BYTE-IDENTICAL port of the OpenCode plugin's module (B2,
 * D9/H1) and the 8-verb model-facing tool surface is frozen (B4) — the
 * command surface is a deliberate dsh-side addition (WI-093, user decision
 * 2026-10-14) and grows HERE, next to the store it drives, without perturbing
 * the ported upstream module. Semantics still follow the shared contract:
 * signed `by:` labels, append-only transitions, released_sessions[]
 * tombstones (§5.5), spec_hash re-stamp = demote-time baseline (Q13).
 *
 * Session identity is the CALLER's problem (same rule as board-transitions):
 * the command layer resolves it from the runtime (context.sessionID, never
 * agent self-report — W-009) and signs it into `by`. `note` rides the
 * appended transition only on close (the /board-close reason line), but the
 * field is general (board-store Transition.note).
 */

import {
  type WorkItemStatus,
  withBoardLock,
  listItems,
  editItemUnlocked,
  specHash,
  nowIso,
} from "./board-store.js"
import type { TransitionResult } from "./board-transitions.js"

/** Shared option shape for the three command transitions. */
export interface BoardCommandOptions {
  /**
   * Audit label for the appended transition. The command layer signs it
   * `command:<name>:<session>` (WI-093) so the history names who ran what —
   * e.g. "command:board-close:session-abc123".
   */
  by?: string
  /**
   * Free text recorded verbatim on the appended transition entry (WI-093's
   * reason line). Omitted → the entry carries no note and stays byte-identical
   * to the pre-note format.
   */
  note?: string
}

/** Release target column for the demote flavor (`to`; default todo). */
export type ReleaseTarget = Extract<WorkItemStatus, "backlog" | "todo">

// ── close (any live state → done, badged done_without_dream — §5.4) ──────────

/**
 * Close a work item as DONE WITHOUT A DREAM: the §5.4 escape hatch, badged
 * `done_without_dream: true` on the item so the completion is never mistaken
 * for a dream-completion close. This is closeItem's ONE write; the sibling
 * markDoneWithoutDream (board-transitions) is the byte-identical port of the
 * upstream viewer action and cannot carry `note` without forking — the
 * command surface drives THIS path. Ownership: the invoking session must own
 * the item or the item must be un-owned — an owned item's state belongs to
 * its owning session (the same gate the authoring edits enforce, SCHEMA §2);
 * a close of another session's item is refused correctably (ITEM_OWNED,
 * naming the owner).
 */
export function closeItem(
  directory: string,
  id: string,
  opts: BoardCommandOptions & { /** the acting session, for the ownership gate; null = identity-free board surface */ actingSession?: string | null } = {}
): Promise<TransitionResult> {
  const acting = opts.actingSession ?? null
  return withBoardLock(directory, () => {
    const item = listItems(directory).find((i) => i.id === id)
    if (!item) {
      return { ok: false as const, reason: "NOT_FOUND", detail: `No work item ${id} in .opencode/board/.` }
    }
    if (item.status === "done") {
      return { ok: false as const, reason: "ALREADY_DONE", detail: `${id} is already done.` }
    }
    if (item.owner_session !== null && item.owner_session !== acting) {
      return {
        ok: false as const,
        reason: "ITEM_OWNED",
        detail:
          `${item.id} is owned by session ${item.owner_session}; once owned, its state belongs to that ` +
          `session alone (SCHEMA §2). Close it from that session, or /board-release it first to make it fluid.`,
      }
    }
    const updated = editItemUnlocked(directory, id, {
      set: { status: "done", done_without_dream: true, paused: false },
      appendTransition: {
        at: nowIso(),
        from: item.status,
        to: "done",
        by: opts.by ?? "command:board-close",
        ...(item.owner_session ? { session: item.owner_session } : {}),
        ...(opts.note !== undefined ? { note: opts.note } : {}),
      },
    })
    return { ok: true as const, action: "done", item: updated }
  })
}

// ── release (un-own + tombstone — the §5.5 demote, plus its done sibling) ────

export interface ReleaseOptions extends BoardCommandOptions {
  /** Target column for the in_progress flavor: todo (default) or backlog. */
  to?: ReleaseTarget
}

/**
 * RELEASE ownership of a work item and tombstone the released session into
 * `released_sessions[]` (§5.5), re-stamping `spec_hash` from the current body
 * (the demote-time baseline, Q13). Two flavors, one audited verb:
 *
 *   - in_progress owned item (ANY owner — the operator verb): the full
 *     true-demote. Status moves to `to` (todo by default; backlog option),
 *     owner_session + group_id clear, the owning session is tombstoned. This
 *     flavor is semantically demoteItem (board-transitions) — reimplemented
 *     here under this module's command-shaped audit, not delegated, because
 *     the tombstone/re-stamp fields must land identically in BOTH flavors.
 *   - done-but-still-owned item (the WI-083 case: a dream promoted the item
 *     to done while the owning session kept it, and the 1:1 invariant now
 *     blocks that session's next bind): un-own + tombstone + re-stamp with
 *     status LEFT AT DONE — a release never redefines how an item finished
 *     (done→todo is promoteItem's audited reopen, §5.5). A `to` on this
 *     flavor is refused (INVALID_TARGET) rather than silently ignored.
 *
 * Un-owned QUEUED items and done-but-UN-owned items have no ownership to
 * release → NOT_OWNED refusal (terminal: no argument fixes it).
 */
export function releaseItem(
  directory: string,
  id: string,
  opts: ReleaseOptions = {}
): Promise<TransitionResult> {
  const to = opts.to ?? "todo"
  return withBoardLock(directory, () => {
    const item = listItems(directory).find((i) => i.id === id)
    if (!item) {
      return { ok: false as const, reason: "NOT_FOUND", detail: `No work item ${id} in .opencode/board/.` }
    }
    if (item.owner_session === null) {
      return {
        ok: false as const,
        reason: "NOT_OWNED",
        detail:
          `${item.id} is un-owned (${item.status}) — there is no ownership to release. ` +
          `released_sessions is for sessions that HELD this item; unbindable origins never held it.`,
      }
    }
    if (item.status === "done") {
      if (opts.to !== undefined) {
        return {
          ok: false as const,
          reason: "INVALID_TARGET",
          detail:
            `${item.id} is done — a release leaves the DONE badge alone (how an item finished is history, ` +
            `not a column move). Drop \`to\` to plain-release it, or /board-reopen to bring it back to in_progress.`,
        }
      }
      const released = item.owner_session
      const updated = editItemUnlocked(directory, id, {
        set: { owner_session: null, group_id: null, spec_hash: specHash(item.body) },
        appendReleasedSession: released,
        appendTransition: {
          at: nowIso(),
          from: item.status,
          to: item.status, // release-from-done is not a column move — the honest self-loop
          by: opts.by ?? "command:board-release",
          session: released,
          ...(opts.note !== undefined ? { note: opts.note } : {}),
        },
      })
      return { ok: true as const, action: "released-from-done", item: updated }
    }
    if (item.status !== "in_progress") {
      return {
        ok: false as const,
        reason: "NOT_IN_PROGRESS",
        detail: `${item.id} is ${item.status}; release applies the true-demote to in_progress items only (queued items are already un-owned).`,
      }
    }
    // True-demote flavor: identical field set to demoteItem (§5.5/Q13) —
    // status → `to`, owner+group cleared, tombstone appended, spec_hash
    // re-stamped from the demote-time body, paused cleared.
    const released = item.owner_session
    const updated = editItemUnlocked(directory, id, {
      set: {
        status: to,
        owner_session: null,
        group_id: null,
        paused: false,
        spec_hash: specHash(item.body),
      },
      appendReleasedSession: released,
      appendTransition: {
        at: nowIso(),
        from: item.status,
        to,
        by: opts.by ?? "command:board-release",
        session: released,
        ...(opts.note !== undefined ? { note: opts.note } : {}),
      },
    })
    return { ok: true as const, action: "demoted", item: updated }
  })
}

// ── reopen (done → in_progress, per WI-069's ownership rule) ─────────────────

/**
 * REOPEN a done work item: status → in_progress, the done_without_dream badge
 * cleared (an audited state change via the appended transition — the same
 * convention markItemDoneFromDream/promoteItem observe), ownership settled by
 * WI-069's rule:
 *
 *   - item owned by the ACTING session  → reopened in place; ownership stays.
 *   - item un-owned, acting session free → the acting session ADOPTS it
 *     (owner_session + group_id stamped together, I-043 — same pairing
 *     discipline as bind).
 *   - item un-owned, acting session OWNS ANOTHER item → refused
 *     SESSION_OWNS_OTHER naming that item (the 1:1 invariant, Q7 — mirrors
 *     bind's messaging; /board-release the other item first).
 *   - item owned by ANOTHER session     → refused ITEM_OWNED naming the
 *     blocking owner; release it (/board-release) or reopen from that
 *     session — never rebind a done item under a new owner silently.
 *
 * released_sessions[] tombstones are RESPECTED: a session true-demoted from
 * this item cannot re-own it (SESSION_RELEASED — §5.5's history-not-forgotten
 * rule; terminal for the summon). spec_hash is deliberately NOT re-stamped:
 * reopen never rewrites provenance (same as promoteItem's re-attach path).
 *
 * Non-done states are exact refusals: in_progress → ALREADY_IN_PROGRESS
 * (nothing to reopen); todo/backlog → NOT_DONE (they were never closed —
 * binding, not reopening, is their verb).
 */
export function reopenItem(
  directory: string,
  id: string,
  actingSessionID: string,
  opts: BoardCommandOptions = {}
): Promise<TransitionResult> {
  return withBoardLock(directory, () => {
    const item = listItems(directory).find((i) => i.id === id)
    if (!item) {
      return { ok: false as const, reason: "NOT_FOUND", detail: `No work item ${id} in .opencode/board/.` }
    }
    if (item.released_sessions.includes(actingSessionID)) {
      return {
        ok: false as const,
        reason: "SESSION_RELEASED",
        detail:
          `Session ${actingSessionID} was released from ${item.id} (tombstoned in released_sessions[] — §5.5). ` +
          `The tombstone is history, not a stale flag: a different session (or a release of the CURRENT state) is the path, never a re-own.`,
      }
    }
    if (item.status === "in_progress") {
      return {
        ok: false as const,
        reason: "ALREADY_IN_PROGRESS",
        detail: `${item.id} is already in progress (owner ${item.owner_session ?? "unset"}) — nothing to reopen.`,
      }
    }
    if (item.status !== "done") {
      return {
        ok: false as const,
        reason: "NOT_DONE",
        detail: `${item.id} is ${item.status} — reopen applies to DONE items only. A queued item was never closed; bind it instead.`,
      }
    }
    if (item.owner_session !== null && item.owner_session !== actingSessionID) {
      return {
        ok: false as const,
        reason: "ITEM_OWNED",
        detail:
          `${item.id} is owned by session ${item.owner_session} — the blocking owner must release it ` +
          `(/board-release) before another session can reopen it, or reopen it from that session.`,
      }
    }
    // Un-owned: adoption requires the acting session to be FREE (1:1, Q7).
    let adopt = false
    if (item.owner_session === null) {
      const owned = listItems(directory).find((i) => i.owner_session === actingSessionID)
      if (owned) {
        return {
          ok: false as const,
          reason: "SESSION_OWNS_OTHER",
          detail:
            `This session already owns ${owned.id} ("${owned.title}") — session⟷item is strictly 1:1 (Q7). ` +
            `/board-release the owned item first, then reopen ${item.id}; adoption then re-stamps ownership.`,
        }
      }
      adopt = true
    }
    const updated = editItemUnlocked(directory, id, {
      set: {
        status: "in_progress",
        paused: false,
        // reopening clears the escape-hatch badge; a later completion re-decides
        // (promoteItem's audited-clear convention)
        done_without_dream: false,
        ...(adopt ? { owner_session: actingSessionID, group_id: actingSessionID } : {}),
      },
      appendTransition: {
        at: nowIso(),
        from: item.status,
        to: "in_progress",
        by: opts.by ?? "command:board-reopen",
        session: actingSessionID,
        ...(opts.note !== undefined ? { note: opts.note } : {}),
      },
    })
    return { ok: true as const, action: adopt ? "adopted" : "reopened", item: updated }
  })
}
