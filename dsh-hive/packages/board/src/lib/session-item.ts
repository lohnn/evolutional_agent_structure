/**
 * session-item.ts — WI-083 (v1.2) the session ⟷ board pairing resolver.
 *
 * The overlay's item card answers ONE question from the LOCKED board store:
 * which in_progress work item does this session own? Resolution rides the
 * store's SHARED READ primitives (listItems — the single-writer store's own
 * face; the route never raw-reads .opencode/board files).
 *
 * The bind contract (B-for-bind, board-tab contract): an in_progress bind is
 * strictly 1:1 session⟷item via `owner_session`; `group_id` MAY also carry a
 * session id (dispatch groups stamp it), so a group match is the honest
 * fallback — a child session shows the group's in_progress item.
 *
 * Session-id normalization: ids arrive in several shapes (full
 * "session-<uuid>", bare "<uuid>", and user-supplied prefixes) — the same
 * bareId join the ledgers use, mirrored here so a full-id query matches bare
 * owner fields and vice versa.
 */

/** The light card face the overlay renders (id/title/status/priority only). */
export interface SessionItemCard {
  id: string
  title: string
  status: string
  priority: string
}

export type SessionItemMatch = "owner" | "group" | null

/** OWNER match first (the strict 1:1 bind), then the group fallback. */
export function resolveSessionItem(
  items: Array<{
    id: string
    title: string
    status: string
    priority: string
    owner_session?: string | null
    group_id?: string | null
  }>,
  sessionId: string,
): { item: SessionItemCard | null; matchedBy: SessionItemMatch } {
  const bare = sessionId.startsWith("session-") ? sessionId.slice("session-".length) : sessionId
  const variants = new Set([sessionId, bare, `session-${bare}`])
  // An owner/group field may hold EITHER id shape (ledgers stamp both) —
  // match any variant, exactly like the session matching elsewhere.
  const owned = items.find(
    (it) => it.status === "in_progress" && it.owner_session != null && variants.has(it.owner_session),
  )
  if (owned) {
    return {
      item: { id: owned.id, title: owned.title, status: owned.status, priority: owned.priority },
      matchedBy: "owner",
    }
  }
  const grouped = items.find(
    (it) => it.status === "in_progress" && it.group_id != null && variants.has(it.group_id),
  )
  if (grouped) {
    return {
      item: { id: grouped.id, title: grouped.title, status: grouped.status, priority: grouped.priority },
      matchedBy: "group",
    }
  }
  return { item: null, matchedBy: null }
}
