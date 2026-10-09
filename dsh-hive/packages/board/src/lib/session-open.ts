/**
 * session-open.ts — WI-087 client view logic: resolve the DSH session(s)
 * connected to a board item and the honest display model for the drawer's
 * "connected session" section. Shared by the bundled websrc module AND the
 * node --test suite (the hive-state-view.ts pattern: NODE-FREE ON PURPOSE,
 * I-192 class — this file compiles both to dist and INTO the client bundle,
 * so it imports no fs/path and no framework; DOM, fetch and plugin-ctx
 * wiring live in websrc/session-open.ts).
 *
 * WI-087 design (the route-model finding that shapes everything here):
 *   dsh 0.2.0-rc.2's web GUI has NO browser-URL route to a specific session.
 *   The only URL contract is the boot exchange (`/?token=` → 30-day authority
 *   cookie → 303 `./`), and no client module reads location.search/hash for
 *   app state (swept across the full 0.2.0-rc.2 web-app bundle, 498 reachable
 *   js files). View selection lives in the client `uiWorkspace` service —
 *   `openSession(sessionId)` is exactly the action a sidebar session-row
 *   click runs (restores the session into the main conversation panel,
 *   selectPanel(null) reveals it). The board therefore opens the session
 *   IN-APP when that service is present and degrades honestly when it is
 *   not — it never invents a token-bearing URL (W-075: tokens rotate every
 *   boot; the durable cookie is what survives restarts).
 *
 * Discriminator: board records carry session ids from TWO harnesses (this
 * workspace's one shared store) — opencode-era `ses_…` rows and dsh
 * `session-…` rows. Only dsh ids are affording here: an old-harness id can
 * never exist in the dsh web GUI's session catalog, and advertising an open
 * affordance for it would be a dead affordance by construction.
 */

/** A board record's session-bearing fields, projected (only what we read). */
export interface SessionBearerItem {
  owner_session?: string | null
  group_id?: string | null
  released_sessions?: string[] | null
  /** Transition rows may stamp a session id (session-item.ts evidence joins these). */
  transitions?: Array<{ session?: unknown }> | null
}

/** Where a resolved session id was found on the item, in resolution priority. */
export type SessionLinkRole = "owner" | "group" | "released" | "history"

/** One affordance row: the dsh-shaped session id and where it came from. */
export interface SessionLink {
  id: string
  role: SessionLinkRole
}

/**
 * True for dsh-minted session ids. dsh's SessionStore mints `session-<n>`
 * (prepare() counter — dsh-session/lib/index.js brandString(`session-…`))
 * and the host mints `session-<uuid>` variants; opencode-era ids (`ses_…`)
 * and bare uuids are NOT dsh ids.
 */
export function isDshSessionId(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 72) return false
  return /^(?:session-[0-9]{1,12}|session-[0-9a-zA-Z-]{4,64})$/.test(value)
}

function pushUnique(out: SessionLink[], id: string, role: SessionLinkRole): void {
  if (!isDshSessionId(id)) return
  if (out.some((link) => link.id === id)) return
  out.push({ id, role })
}

/**
 * All dsh-shaped sessions connected to an item, in the order the affordance
 * should present them: owner_session first (the B-for-bind 1:1 contract),
 * then group_id, then released_sessions (tombstones), then transition
 * session marks (history evidence) — deduped, non-dsh ids silently excluded
 * (they keep their plain face rows in the drawer; no affordance is built
 * for them, per the no-dead-affordance rule).
 */
export function resolveItemSessions(item: SessionBearerItem | null | undefined): SessionLink[] {
  const out: SessionLink[] = []
  if (!item) return out
  if (item.owner_session != null) pushUnique(out, item.owner_session, "owner")
  if (item.group_id != null) pushUnique(out, item.group_id, "group")
  for (const id of Array.isArray(item.released_sessions) ? item.released_sessions : []) {
    pushUnique(out, id, "released")
  }
  for (const tr of Array.isArray(item.transitions) ? item.transitions : []) {
    if (typeof tr?.session === "string") pushUnique(out, tr.session, "history")
  }
  return out
}

/** The catalog row shape the drawer reads (client `sessions.list` projection). */
export interface SessionRowLike {
  id: string
  displayTitle?: string
  title?: string
  running?: boolean
  blank?: boolean
}

export interface SessionCatalogLike {
  ids?: string[]
  byId?: Record<string, SessionRowLike>
  phase?: string
}

/** Short display form of a session id ("session-1028f640…"). */
export function shortSessionId(id: string): string {
  const bare = id.startsWith("session-") ? id.slice("session-".length) : id
  return `session-${bare.slice(0, 8)}…`
}

/**
 * Honest display model for one resolved session, against the live client
 * catalog: the REAL human title when the host projected one (dsh 0.2.0-rc.2
 * displayTitle — durable log-backed title, project basename, then session id),
 * an honest "not in the live session list" note when the id is absent (ended
 * before catalog load, old-harness leftovers, or a catalog still pending).
 * Never invents a title.
 */
export function sessionRowModel(
  id: string,
  catalog: SessionCatalogLike | undefined,
): { id: string; known: boolean; title: string; running: boolean | undefined; note: string } {
  const row = catalog?.byId?.[id]
  if (row) {
    const title = typeof row.displayTitle === "string" && row.displayTitle.length > 0
      ? row.displayTitle
      : typeof row.title === "string" && row.title.length > 0
        ? row.title
        : shortSessionId(id)
    return { id, known: true, title, running: row.running, note: "" }
  }
  const phase = catalog?.phase
  const note =
    phase && phase !== "ready"
      ? "session catalog still loading"
      : "not in the live session list (ended, or from the other harness)"
  return { id, known: false, title: shortSessionId(id), running: undefined, note }
}
