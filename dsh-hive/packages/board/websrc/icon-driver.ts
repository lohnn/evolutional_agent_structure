/**
 * WI-062 SLICE 3B — the favicon driver (USER REQUEST): the icon identity of
 * the 4400 viewer, as an APPLY-LEVEL effect. apply() is panel-independent —
 * this runs at PLUGIN BOOT, not at board-tab mount, so the browser tab reflects
 * board truth while the user works in a different panel (acceptance A).
 *
 * ── What is ported vs substituted ─────────────────────────────────────────────
 * The RENDERER is the ported one (websrc/icon.ts — the reduced mark/data-URI
 * machinery, byte-ported): faviconHref(icon) — full percent-encoding, correct.
 * The DERIVATION is substituted: collectDeriveIconState (icon.ts, drift-locked)
 * reads ONLY session channels (actionRequired / sessionStatus / dreams) — every
 * one of those is a dead data source under dsh (no session surface, I-116), so
 * porting the derivation verbatim would weld the icon to "quiet" forever.
 * The tab's substitute derives from what IS true under dsh — board lane counts:
 *   session:  "intervene" when any actionRequired entry flags (STUB — structurally
 *             impossible today, wired for the day dsh exposes a session surface),
 *             "active" while item has in_progress work, else "quiet";
 *   dreaming: false — no dream surface under dsh (true only via the same future hook);
 *   count:    in-progress item count (what the top channel is showing — the
 *             ported channel contract).
 * document.title / <meta theme-color> are NOT touched: the dsh shell owns
 * <head> identity — hijacking the title from a plugin is exactly the kind of
 * head-fighting the coordinator's brief calls out; the count channel therefore
 * rides the tooltip instead of the tab strip title (documented degradation).
 * If the shell fights the injected <link rel=icon> (thrash/CSP), the symptom
 * gets REPORTED and the driver falls back to the in-panel badge (which the
 * morph already keeps fresh) rather than fighting back.
 */
import { faviconHref } from "./icon.js"
import { adapterState, INDEX_URL, type BoardIndexPayload } from "./tab-engine.js"
import type { IconState } from "./icon.js"

const FAVICON_POLL_MS = 30_000
const LINK_ID = "hvb-favicon"
const LINK_ATTR = "data-plugin-favicon"

/** Board-truth derivation (see module comment for the session→counts substitution). */
export function deriveBoardIcon(items: { status: string; paused: boolean }[], actionRequired: Record<string, { awaitingQuestion: boolean; awaitingPermission: boolean }>): IconState {
  let active = 0
  for (const it of items) {
    if (it.status === "in_progress" && !it.paused) active++
  }
  let intervening = 0
  for (const key of Object.keys(actionRequired)) {
    const ar = actionRequired[key]
    if (ar && (ar.awaitingQuestion || ar.awaitingPermission)) intervening++
  }
  return intervening > 0
    ? { session: "intervene", dreaming: false, count: intervening }
    : active > 0
      ? { session: "active", dreaming: false, count: active }
      : { session: "quiet", dreaming: false, count: 0 }
}

let bound = false
let lastHref = ""

function stampFavicon(items: { status: string; paused: boolean }[], actionRequired: Record<string, { awaitingQuestion: boolean; awaitingPermission: boolean }>): void {
  const link = document.getElementById(LINK_ID) as HTMLLinkElement | null
  if (!link) return // disposer ran (plugin unmounted) — keep quiet
  const href = faviconHref(deriveBoardIcon(items, actionRequired))
  if (href === lastHref) return // same href re-decode/rasterise churn guard (ported discipline)
  lastHref = href
  link.setAttribute("href", href)
}

async function poll(): Promise<void> {
  try {
    const res = await fetch(INDEX_URL, { headers: { accept: "application/json" } })
    if (!res.ok) return
    const payload = (await res.json()) as BoardIndexPayload
    if (!payload || typeof payload !== "object" || payload.ok !== true) return
    const state = adapterState(payload)
    stampFavicon(state.items, state.actionRequired)
  } catch {
    // transient — the next tick retries; the tab's previous icon persists
  }
}

function refreshIfVisible(): void {
  if (!document.hidden) void poll()
}

/**
 * STUB — SESSION-SYNC HOOK (named, inert): the old viewer re-derived the icon
 * from live opencode session status/action-required endpoints. dsh exposes NO
 * session surface yet, so this stays a no-op placeholder. When dsh ships one,
 * wire it here (its data product feeds `actionRequired`/`sessionStatus` and
 * `dreaming`, and `deriveBoardIcon` already honors them ahead of lane counts).
 * Do NOT invent a transport in the meantime.
 */
export function attachSessionSurface(_surface: unknown): void {
  void _surface // inert until the dsh session surface exists (see module comment)
}

/** Boot the driver once per plugin apply (idempotent). */
export function startFaviconDriver(ctx: {
  /** the dsh effect primitive (the same one apply() uses for the style tag) */
  effect: (fn: () => (() => void) | void, label?: string) => unknown
  interval?: (fn: () => void, ms: number) => (() => void) | undefined
}): void {
  if (bound) return
  if (typeof document === "undefined") return
  bound = true
  ctx.effect(() => {
    const previous = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const link = document.createElement("link")
    link.id = LINK_ID
    link.rel = "icon"
    link.type = "image/svg+xml"
    link.setAttribute(LINK_ATTR, "@hive/dsh-board")
    document.head.appendChild(link)
    void poll() // first stamp without waiting a full interval
    document.addEventListener("visibilitychange", refreshIfVisible)
    window.addEventListener("pageshow", refreshIfVisible)
    window.addEventListener("focus", refreshIfVisible)
    return () => {
      link.remove()
      // restore the shell's own favicon (head ownership returns cleanly)
      if (previous) previous.setAttribute("href", previous.getAttribute("href") ?? "")
      document.removeEventListener("visibilitychange", refreshIfVisible)
      window.removeEventListener("pageshow", refreshIfVisible)
      window.removeEventListener("focus", refreshIfVisible)
      bound = false
    }
  }, "board favicon driver")
  const maybeInterval = (ctx as { interval?: (fn: () => void, ms: number) => unknown }).interval
  if (typeof maybeInterval === "function") {
    maybeInterval(() => { void poll() }, FAVICON_POLL_MS)
  } else {
    // degrade: refresh-on-visible only (same discipline as the engine's timer fallback)
    console.error("[@hive/dsh-board] favicon driver: no interval service — cadence degraded to refresh-on-visible")
  }
}
