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

/**
 * Newest-first sort key for owned columns (In Progress / Done).
 *
 * `updated` is DATE-ONLY (`today()` → "2026-07-21"), so every item touched on
 * the same calendar day collides and JS `sort` falls back to insertion (id)
 * order — a fresh in_progress item lands mid-cluster instead of on top (the
 * bug). We sort on the newest `transitions[].at` instead: a full-ISO,
 * second-precision timestamp written uniformly on every In-Progress/Done code
 * path (I-189), from the item's own append-only log (I-190) — an in-record key
 * that respects the portability invariant (I-144), no session/external call.
 *
 * The log is NOT assumed sorted — we take the max `at` defensively. An item
 * with an empty/missing `transitions[]` falls back to the date-only `updated`
 * (then `id`), so nothing crashes or vanishes.
 */
function latestTransitionAt(item: WorkItem): string {
  let max = ""
  for (const t of item.transitions) {
    if (t.at && t.at > max) max = t.at
  }
  return max
}

function byRecencyDesc(a: WorkItem, b: WorkItem): number {
  const ta = latestTransitionAt(a)
  const tb = latestTransitionAt(b)
  // Fall back to date-only `updated` when a transition timestamp is absent, so
  // an item with no log still slots by best-available recency.
  const ka = ta || a.updated
  const kb = tb || b.updated
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
