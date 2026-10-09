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

export type SessionItemMatch = "owner" | "group" | "history" | null

/** An ownership-evidence row the overlay renders as a session milestone. */
export interface OwnedItemTransition {
  at: string
  from: string | null
  to: string
  by: string
  session?: string
}

export interface SessionItemResolution {
  item: SessionItemCard | null
  matchedBy: SessionItemMatch
  /** The resolved item's transition history (latest first, capped) — v1.3
   *  milestone rows for the session timeline. Only present when an item
   *  resolved. */
  history?: OwnedItemTransition[]
  historyTotal?: number
}

/**
 * WI-085 (v1.3) — the session ⟷ board pairing, connective for settled items too. When no
 * live bind exists, the session's most recently OWNED item still pairs —
 * owner fields (any status), "by session" transition entries, and
 * released_sessions, ranked by ownership-evidence recency. The CARD
 * reflects the BOARD (durable fact); the session's STAGE stays a separate
 * liveness question (W-109 — the card never derives done from liveness).
 */
export function resolveSessionItem(
  items: ItemLike[],
  sessionId: string,
): { item: SessionItemCard | null; matchedBy: SessionItemMatch; history: OwnedItemTransition[]; historyTotal: number } {
  const bare = sessionId.startsWith("session-") ? sessionId.slice("session-".length) : sessionId
  const variants = new Set([sessionId, bare, `session-${bare}`])
  const card = (it: ItemLike): SessionItemCard => ({ id: it.id, title: it.title, status: it.status, priority: it.priority })
  const updatedMs = (it: ItemLike): number => {
    const t = it.updated ?? it.created
    const parsed = t ? new Date(t).getTime() : NaN
    return isFinite(parsed) ? parsed : 0
  }

  const itemMatches = (it: ItemLike): boolean => {
    if (it.owner_session != null && variants.has(it.owner_session)) return true
    if (Array.isArray(it.released_sessions) && it.released_sessions.some((sid) => variants.has(sid))) return true
    if (Array.isArray(it.transitions) && it.transitions.some((tr) => typeof tr.session === "string" && variants.has(tr.session))) return true
    if (it.group_id != null && variants.has(it.group_id)) return true
    return false
  }

  const live = items.find(
    (it) => it.status === "in_progress" && (itemMatches(it)) && ((it.owner_session != null && variants.has(it.owner_session)) || (it.group_id != null && variants.has(it.group_id))),
  )
  const matches = items.filter(itemMatches)
  // Ownership-evidence recency: the newest matching transition at, else the
  // item's updated stamp (an un-transcribed owned item still carries updated).
  const evidenceMs = (it: ItemLike): number => {
    let best = 0
    for (const tr of Array.isArray(it.transitions) ? it.transitions : []) {
      if (typeof tr.session !== "string" || !variants.has(tr.session)) continue
      const at = tr.at ? new Date(tr.at).getTime() : NaN
      if (isFinite(at) && at > best) best = at
    }
    return Math.max(best, updatedMs(it))
  }
  const settled = [...matches].sort((a, b) => evidenceMs(b) - evidenceMs(a))[0]
  if (live) {
    return { item: card(live), matchedBy: settleMatchOf(live, variants), history: [], historyTotal: 0 }
  }
  if (!settled) return { item: null, matchedBy: null, history: [], historyTotal: 0 }

  const transitions = (Array.isArray(settled.transitions) ? settled.transitions : []).filter(
    (tr) => typeof tr.at === "string",
  ) as OwnedItemTransition[]
  // Latest first for the timeline, capped — the record keeps everything.
  const sorted = [...transitions].sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
  return {
    item: card(settled),
    matchedBy: (settled.owner_session != null && variants.has(settled.owner_session) ? "owner" : "group") as SessionItemMatch,
    history: sorted.slice(0, 20),
    historyTotal: sorted.length,
  }
}

function settleMatchOf(it: ItemLike, variants: Set<string>): SessionItemMatch {
  if (it.owner_session != null && variants.has(it.owner_session)) return "owner"
  if (it.group_id != null && variants.has(it.group_id)) return "group"
  return "history"
}

interface ItemLike {
  id: string
  title: string
  status: string
  priority: string
  owner_session?: string | null
  group_id?: string | null
  updated?: string
  created?: string
  transitions?: Array<{ at?: string; from?: unknown; to?: unknown; by?: unknown; session?: unknown; absorbed?: unknown }>
  released_sessions?: string[] | null
}
