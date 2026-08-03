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
import { recencyKey } from "./recency"
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

/**
 * Newest-first ordering for the owned columns (In Progress / Done).
 *
 * The recency key itself lives in data/recency.ts — ONE definition shared by
 * every column and by the render layer's In-Progress interleave. See that
 * module for why (short version: this logic used to exist in three places, and
 * the I-191 bug was one of those copies falling behind the others).
 */
function byRecencyDesc(a: WorkItem, b: WorkItem): number {
  const ka = recencyKey(a)
  const kb = recencyKey(b)
  if (ka !== kb) return kb.localeCompare(ka)
  return b.id.localeCompare(a.id) // stable, deterministic tiebreak (newest id first)
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
    inProgress: items.filter((i) => i.status === "in_progress").sort(byRecencyDesc),
    done: items.filter((i) => i.status === "done").sort(byRecencyDesc),
    sessionOnly: mirror.cards.filter((c) => !claimed.has(c.id)),
  }
}
