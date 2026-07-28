/**
 * hive-board's icon identity — a two-tier mark family, plus the derivation that
 * makes it a live status surface.
 *
 * ── BROWSER-SAFE (I-192 bundle boundary) ────────────────────────────────────
 * Pure string/geometry math with type-only imports. render.ts (shared) and
 * client.ts (browser) both pull from here; nothing in this module touches node
 * APIs, the filesystem, or the network.
 *
 * ── Two tiers, NOT one icon scaled ──────────────────────────────────────────
 * The full mark's peer-to-peer mesh turns to mush below ~32px (verified against
 * real screenshots in scratch/favicon-states/). So the family has two DIFFERENT
 * drawings on the same 64×64 viewBox:
 *
 *   fullMarkSvg()    — 180px+ (and the page header): a rounded panel split by a
 *                      divider. ABOVE it a HIVEmind mesh (5 nodes / 6 edges);
 *                      BELOW it inset, staggered strata (the dream archive).
 *   reducedMarkSvg() — 16/32px (the favicon): the same idea drawn coarsely —
 *                      one dot above the divider, one solid block below.
 *
 * Geometry here is copied VERBATIM from the approved prototype
 * (scratch/favicon-states/index.html). It was iterated against real pixel-size
 * screenshots and signed off; do not re-derive it.
 *
 * ── TWO independent additive channels ───────────────────────────────────────
 * The whole semantic fits in two places, and they combine freely:
 *
 *   TOP    (mesh nodes / the dot)  = SESSION state
 *            #484f58 quiet → #d29922 sessions active → #f85149 intervention
 *            required. Red ALWAYS wins over amber: it is the only colour that
 *            should make someone turn their head. ("quiet" is the dim tier the
 *            design calls idle — see SessionChannel for why the code refuses
 *            that word.)
 *   BOTTOM (strata / the block)    = DREAM state
 *            #30363d quiet → #d29922 while a dream is DREAMING.
 *
 * There is deliberately no third channel — it collapses at 16px.
 *
 * ── Two things that are NOT here, on purpose (empirically settled) ──────────
 *  • NO ANIMATED FAVICON. Background tabs clamp timers to ~1fps and
 *    Chrome/Safari don't animate SVG favicons at all; the frame-to-frame delta
 *    was invisible at 16px anyway. The favicon is static. (The HEADER mark may
 *    animate — that's CSS on a real element, see render.ts, gated behind
 *    prefers-reduced-motion.)
 *  • NO COUNT IN THE ICON. ×1 and ×3 lit nodes are pixel-identical at 16px.
 *    The count channel lives in document.title instead — `(2) hive-board …`.
 *
 * Palette is GitHub Primer dark, the same hexes render.ts already uses. No new
 * colours are invented here.
 */
import type { ActionRequired } from "../data/action-required"
import type { SessionStatusKind } from "../data/session-status"
import type { BoardState } from "../data/state"

// ── Palette (Primer dark — mirrors the hexes already in render.ts's CSS) ─────

const C = {
  /** Page background — also the <meta name="theme-color"> value. */
  field: "#0d1117",
  panel: "#161b22",
  border: "#30363d",
  edge: "#30363d",
  /** Dim node / dim dot — the "idle session" colour. */
  node: "#484f58",
  /** Dim strata / dim block — the "idle dream" colour. */
  strata: "#30363d",
  divider: "#8b949e",
  amber: "#d29922",
  red: "#f85149",
} as const

/** Exported for the theme-color meta tag so the hex is stated exactly once. */
export const THEME_COLOR = C.field

// ── Geometry (verbatim from the approved prototype) ─────────────────────────

const NODES: ReadonlyArray<readonly [number, number]> = [
  [11, 28],
  [23, 14],
  [33, 29],
  [45, 16],
  [53, 28],
]

const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [1, 3],
  [2, 3],
  [3, 4],
  [0, 2],
]

/** Inset + staggered: varying x offset AND width, so it reads as sediment
 *  rather than a left-aligned paragraph. [x, y, w, h] */
const STRATA: ReadonlyArray<readonly [number, number, number, number]> = [
  [11, 41, 42, 4],
  [7, 47.5, 50, 5],
  [16, 54, 33, 4],
]

/**
 * Which mesh nodes light up as the active-session count climbs, and in what
 * order. Node 3 first — that's the single-session composition the prototype
 * signed off (`active: 3`). Purely a full-mark richness detail: the count is
 * NOT readable at favicon size, which is exactly why it also lands in the
 * title (see boardTitle).
 */
const LIT_ORDER = [3, 1, 4, 2, 0] as const

// ── The icon state (the two channels + the title-only count) ────────────────

/**
 * TOP channel. Red always wins over amber.
 *
 * The dim tier is named `quiet`, NOT `idle`, and the distinction is load-
 * bearing (W-097). `GET /session/status` OMITS idle sessions entirely — idle
 * never appears as a literal entry despite being in the SDK's typed union. So
 * a session missing from that map is *unknown / no-signal*, not idle. `quiet`
 * means exactly "the board has nothing to report", which is what a dim node
 * honestly conveys; calling it `idle` invites the next editor to write
 * `if (status === "idle")` and turn an absence into a positive claim. Nothing
 * in this module ever reads `"idle"` as evidence of anything.
 */
export type SessionChannel = "quiet" | "active" | "intervene"

export interface IconState {
  /** TOP channel — mesh nodes (full mark) / the dot (reduced mark). */
  session: SessionChannel
  /** BOTTOM channel — strata (full mark) / the block (reduced mark). */
  dreaming: boolean
  /**
   * The COUNT channel — title-only, never drawn. Counts whatever the top
   * channel is currently showing: sessions needing intervention when
   * `session === "intervene"`, otherwise sessions actively processing. 0 when
   * quiet (no title prefix).
   */
  count: number
}

/** The accent hex the TOP channel paints with. */
function accentFor(session: SessionChannel): string {
  return session === "intervene" ? C.red : session === "active" ? C.amber : C.node
}

/** Human-readable channel state, for tooltips / accessible names. */
export function iconLabel(icon: IconState): string {
  const top =
    icon.session === "intervene"
      ? `intervention required${icon.count > 1 ? ` (${icon.count} sessions)` : ""}`
      : icon.session === "active"
        ? `${icon.count} session${icon.count === 1 ? "" : "s"} active`
        : // Deliberately not the word "idle" — see SessionChannel. We know only
          // that nothing is reporting, which is not the same as knowing all is
          // quiet on the server.
          "no active sessions reported"
  return icon.dreaming ? `${top} · dreaming` : top
}

// ── Derivation: read the two channels off the state we already publish ──────

/**
 * The subset of BoardState the icon derives from. Deliberately narrow so it is
 * obvious this adds NO new source of truth (the project's ground-truth
 * principle): every field here is already fetched, already rendered as a badge
 * somewhere on the board, and already shipped in /api/state.
 */
export type IconSource = Pick<
  BoardState,
  "items" | "board" | "actionRequired" | "sessionStatus" | "dreams"
>

/**
 * Every session id the board can currently paint a badge for: each work item's
 * owning coordinator session (any column — Done cards render badges too) plus
 * the unclaimed session-only cards.
 *
 * Scoping to THIS set (rather than every id in the global actionRequired /
 * sessionStatus maps) keeps the favicon honest: it lights for exactly the
 * sessions the board is showing you. Those maps are workspace-global, so an
 * unrelated non-HIVE chat awaiting a permission prompt must not turn the tab
 * red — it isn't on the board, and the board is the thing the tab represents.
 *
 * Freshness (I-187): `items` is re-read per request, so every WI card's owning
 * session is current. `board.sessionOnly` is built from the bootstrap-only
 * session mirror, so a brand-new UNCLAIMED session can't contribute until the
 * viewer restarts — the same limitation the board's own session-only column
 * already has, not a new one introduced here. It doesn't stale the FLAGS: those
 * are looked up fresh from the per-tick actionRequired / sessionStatus maps, so
 * the icon lights and clears in real time for every id it does know. In
 * practice every awakened session also auto-registers a work item, so the WI
 * path covers it.
 */
function boardSessionIds(state: IconSource): string[] {
  const ids = new Set<string>()
  for (const item of state.items) {
    if (item.owner_session) ids.add(item.owner_session)
  }
  for (const card of state.board.sessionOnly) {
    if (card.id) ids.add(card.id)
  }
  return Array.from(ids)
}

/**
 * Collapse the live board state into the two channels + the count.
 *
 * TOP channel:
 *   • intervene ⇐ any board session with `awaitingQuestion || awaitingPermission`
 *     (WI-043) — the same signal that paints the pulsing action badge on a card.
 *   • active    ⇐ any board session whose live status is `busy` or `retry`
 *     (WI-044). `retry` is still work in flight, not a user prompt, so it stays
 *     amber.
 *   • quiet     ⇐ otherwise — i.e. NOTHING reported, which is all we know.
 *
 * We only ever count POSITIVE evidence. A session absent from sessionStatus
 * contributes nothing, because `/session/status` omits idle sessions entirely
 * (W-097) — absence there is unknown, not idle, and unknown must never be
 * upgraded into a claim (W-030 / SNG-046). The happy consequence is that an
 * unreachable backend empties both maps and degrades to the dim mark: no
 * indicator, never a crash, and never a false alarm.
 *
 * BOTTOM channel: `dreams.active.length > 0` — the dreams/active/ vs
 * dreams/history/ split (loadDreamVitals), which is the same directory-based
 * read the board's own dream linkage keys off, and literally the same predicate
 * renderBoardBody uses to print the DREAMING badge in the Active-dream panel.
 * The icon therefore cannot disagree with the page it sits above.
 */
export function deriveIconState(state: IconSource): IconState {
  const ids = boardSessionIds(state)

  let intervening = 0
  let active = 0
  for (const id of ids) {
    const ar: ActionRequired | undefined = state.actionRequired[id]
    if (ar && (ar.awaitingQuestion || ar.awaitingPermission)) {
      intervening++
      continue // red wins; don't also count this one as merely "active"
    }
    const status: SessionStatusKind | undefined = state.sessionStatus[id]
    if (status === "busy" || status === "retry") active++
  }

  const session: SessionChannel =
    intervening > 0 ? "intervene" : active > 0 ? "active" : "quiet"

  return {
    session,
    dreaming: state.dreams.active.length > 0,
    count: intervening > 0 ? intervening : active,
  }
}

// ── The full mark (180px+, and the page header) ─────────────────────────────

/**
 * The full mark: panel + mesh (top channel) + strata (bottom channel).
 *
 * @param icon   the derived channel state
 * @param opts.idPrefix  namespace for the internal clipPath id, so two marks on
 *                       one page (or a mark alongside the data-URI favicon)
 *                       can never collide.
 * @param opts.animate   emit `class="lit"` hooks the page stylesheet can pulse.
 *                       Off for the favicon (external CSS can't reach a data:
 *                       URI, and the bytes would be dead weight).
 * @param opts.size      intrinsic width/height; omit for a viewBox-only,
 *                       scale-to-fit SVG.
 */
export function fullMarkSvg(
  icon: IconState,
  opts: { idPrefix?: string; animate?: boolean; size?: number; title?: string } = {},
): string {
  const { idPrefix = "hbf", animate = false, size, title } = opts
  const clip = `${idPrefix}-clip`
  const accent = accentFor(icon.session)

  // Which nodes are lit — see LIT_ORDER. Never more than the mesh has.
  const litCount = icon.session === "quiet" ? 0 : Math.min(Math.max(icon.count, 1), NODES.length)
  const lit = new Set<number>(LIT_ORDER.slice(0, litCount))
  const litCls = animate ? ' class="lit"' : ""

  // Edges first so nodes sit on top. An edge touching a lit node takes the
  // accent at .8 opacity — the mesh "conducts" from the live session.
  let mesh = ""
  for (const [a, b] of EDGES) {
    const hot = lit.has(a) || lit.has(b)
    const [x1, y1] = NODES[a]!
    const [x2, y2] = NODES[b]!
    mesh += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${hot ? accent : C.edge}" stroke-width="1.4"${hot ? ` opacity=".8"${litCls}` : ""}/>`
  }
  for (let i = 0; i < NODES.length; i++) {
    const on = lit.has(i)
    const [x, y] = NODES[i]!
    mesh += `<circle cx="${x}" cy="${y}" r="${on ? 4.2 : 3.2}" fill="${on ? accent : C.node}"${on ? litCls : ""}/>`
  }

  const strataFill = icon.dreaming ? C.amber : C.strata
  const strataCls = icon.dreaming && animate ? ' class="dreaming"' : ""
  const strata = STRATA.map(
    ([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${strataFill}"/>`,
  ).join("")

  const dims = size ? ` width="${size}" height="${size}"` : ""
  // Labelled → an image with an accessible name; unlabelled → decorative.
  const a11y = title ? ` role="img"` : ` aria-hidden="true"`
  const titleEl = title ? `<title>${title}</title>` : ""

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${dims}${a11y}>` +
    titleEl +
    `<defs><clipPath id="${clip}"><rect x="4" y="4" width="56" height="56" rx="12"/></clipPath></defs>` +
    `<rect x="4" y="4" width="56" height="56" rx="12" fill="${C.panel}" stroke="${C.border}" stroke-width="1.5"/>` +
    `<g clip-path="url(#${clip})"${strataCls}>${strata}</g>` +
    `<line x1="9" y1="36" x2="55" y2="36" stroke="${C.divider}" stroke-width="1" opacity=".35"/>` +
    `<g>${mesh}</g>` +
    `</svg>`
  )
}

// ── The reduced mark (16/32px — the favicon) ────────────────────────────────

/**
 * The reduced mark: a deliberately DIFFERENT, coarser drawing — one dot, one
 * divider, one solid block. Not the full mark scaled; at 16px the mesh is mush
 * and the strata smear into a single grey bar.
 *
 * The dreaming block is 2px taller as well as amber, so the bottom channel
 * still reads on a light-background tab strip where the amber/dim contrast is
 * weakest.
 */
export function reducedMarkSvg(icon: IconState, opts: { idPrefix?: string } = {}): string {
  const { idPrefix = "hbr" } = opts
  const clip = `${idPrefix}-clip`
  const dot = accentFor(icon.session)
  const blockFill = icon.dreaming ? C.amber : C.strata
  const blockH = icon.dreaming ? 18 : 16

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` +
    `<defs><clipPath id="${clip}"><rect x="3" y="3" width="58" height="58" rx="13"/></clipPath></defs>` +
    `<rect x="3" y="3" width="58" height="58" rx="13" fill="${C.panel}" stroke="${C.border}" stroke-width="2"/>` +
    `<g clip-path="url(#${clip})">` +
    `<rect x="3" y="40" width="58" height="${blockH}" fill="${blockFill}"/>` +
    `</g>` +
    `<line x1="8" y1="35" x2="56" y2="35" stroke="${C.divider}" stroke-width="1.6" opacity=".4"/>` +
    `<circle cx="32" cy="21" r="9" fill="${dot}"/>` +
    `</svg>`
  )
}

// ── Favicon href + document title ───────────────────────────────────────────

/**
 * The favicon as an inline `data:` URI (see the module header in render.ts for
 * why a data URI beats a route here).
 *
 * encodeURIComponent rather than hand-rolled escaping: the payload contains
 * `#` (every hex colour), `<`, `>` and `"`, all of which are either illegal or
 * ambiguous unescaped in a URI. Full percent-encoding is ~1.6KB and provably
 * correct; a "compact" partial escape is neither.
 */
export function faviconHref(icon: IconState): string {
  return "data:image/svg+xml," + encodeURIComponent(reducedMarkSvg(icon))
}

/** Base document title, with no state prefix. */
export const BASE_TITLE = "hive-board — mission control"

/**
 * The COUNT channel. `(2) hive-board — mission control`.
 *
 * This exists because the icon physically cannot carry it: ×1 and ×3 lit nodes
 * rasterise to identical pixels at 16px. The number therefore rides the title,
 * where a tab strip will still show it after truncating everything else.
 */
export function boardTitle(icon: IconState): string {
  return icon.count > 0 ? `(${icon.count}) ${BASE_TITLE}` : BASE_TITLE
}

/**
 * The `<link rel="icon">` + `<meta name="theme-color">` pair for a page <head>.
 * Emitted identically by renderPage and renderMessagePage so every response
 * this server produces carries the identity.
 */
export function headIconTags(icon: IconState): string {
  return (
    `<link rel="icon" type="image/svg+xml" href="${faviconHref(icon)}">` +
    `<meta name="theme-color" content="${THEME_COLOR}">`
  )
}
