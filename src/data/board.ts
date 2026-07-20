/**
 * Board assembly — the four SCHEMA §3 columns, merging work items with the
 * Phase-1.5 session mirror.
 *
 * ── Merge rule (keyed on owner_session) ─────────────────────────────────────
 * Once auto-registration (hive-infra, concurrent) creates real items for
 * awakened sessions, a session must not render twice. A mirror card is
 * suppressed when its session id is:
 *   - any item's `owner_session` (the WI card supersedes it, whatever its
 *     column — a Done item's session is finished work, not an unregistered
 *     In-Progress session), or
 *   - in any item's `released_sessions[]` (true-demote tombstones, §5.5 —
 *     a deliberately detached session must not visually resurrect as a card;
 *     it remains reachable via the item's lineage links).
 * Mirror cards surviving the filter render in the In Progress column as
 * "session-only" cards (awakened session, no work item yet).
 */
import type { SessionCard, SessionMirror } from "./sessions"
import { sortForColumn, type WorkItem } from "./workitems"

export interface BoardColumns {
  backlog: WorkItem[]
  todo: WorkItem[]
  inProgress: WorkItem[]
  done: WorkItem[]
  /** Awakened sessions with no work item yet — rendered in In Progress. */
  sessionOnly: SessionCard[]
}

function byUpdatedDesc(a: WorkItem, b: WorkItem): number {
  return b.updated.localeCompare(a.updated)
}

export function buildBoard(items: WorkItem[], mirror: SessionMirror): BoardColumns {
  const claimed = new Set<string>()
  for (const item of items) {
    // Demote clears owner_session and appends the tombstone in ONE atomic
    // write (hive-infra-confirmed), so keying on both leaves no double-card
    // window on either side of a demote.
    if (item.owner_session) claimed.add(item.owner_session)
    for (const released of item.released_sessions) claimed.add(released)
  }

  return {
    backlog: sortForColumn(items.filter((i) => i.status === "backlog")),
    todo: sortForColumn(items.filter((i) => i.status === "todo")),
    inProgress: items.filter((i) => i.status === "in_progress").sort(byUpdatedDesc),
    done: items.filter((i) => i.status === "done").sort(byUpdatedDesc),
    sessionOnly: mirror.cards.filter((c) => !claimed.has(c.id)),
  }
}
