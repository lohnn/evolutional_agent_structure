/**
 * WI-062 slices 3B/3D — the icon identity driver: favicon + panel-head mark.
 *
 * The mark renderer is the ported one (websrc/icon.ts — reduced mark / full
 * mark, byte-ported); the DERIVATION is the slice-3D resolution of the 3B
 * session-channel problem: the derivation now runs on the HOST's live-activity
 * feed instead of any proxy:
 *
 *   ⌐ payload.activity (index route): { runningAgents, sampledAt }
 *     — runningAgents = agents-registry rows whose status is "running".
 *       The agents registry is process-local and LIVE-only (disposed agents
 *       are ABSENT from list()), so dissolved sessions cannot stale the
 *       signal by construction. `AgentStatus = 'idle' | 'running'`
 *       (@deepseek-ai/dsh-agent) — the registry knows each agent's phase.
 *   ⌐ deriveBoardIcon(activity): runningAgents > 0 ⇒ the `active` channel
 *     (breathe), else `quiet` (static). The in-progress-ITEMS proxy is GONE —
 *     in_progress items outlive their sessions for weeks; "bound" never meant
 *     "busy" (the user's own words: only if a session is ACTIVELY doing
 *     things, not inactive-waiting).
 *
 * KNOWN EDGE (accepted, revisit via WI-063): an agent blocked awaiting a user
 * answer mid-turn still reports `running` — expect a breathing icon while it
 * WAITS FOR YOU; the ask/permission surface can distinguish this later.
 *
 * Poll lag (documented, honest): the sampled stamp rides the index payload;
 * mark + favicon may trail reality by one poll cycle (15 s panel / 30 s
 * driver). No stale timestamp is trusted; the sample time is shown in the
 * mark tooltip ("as of" stamp — slice 3D).
 *
 * apply()-level: this runs at PLUGIN BOOT, not at board-tab mount, so the
 * browser tab reflects board truth while the user works in a different panel.
 * document.title / theme-color stay shell-owned; if the shell ever fights the
 * favicon <link>, the symptom gets reported and the in-panel badge remains.
 *
 * The 3B stub `attachSessionSurface` is RESOLVED (removed), not renamed: the
 * session surface it was waiting for shipped as payload.activity — the real
 * feed flows through the same poll. The minify-guard asserts the FEED's
 * surviving property names ("runningAgents"/"activity") instead of a stub.
 */
import { faviconHref, fullMarkSvg } from "./icon.js"
import { adapterState, INDEX_URL, type BoardIndexPayload } from "./tab-engine.js"
import type { IconState } from "./icon.js"

const FAVICON_POLL_MS = 30_000
const LINK_ID = "hvb-favicon"
const LINK_ATTR = "data-plugin-favicon"
const PANEL_MARK_SIZE = 34 // shell-safe density override lives in CSS_OVERRIDES

/** The slice-3D shape the index route ships (index payload GROWS this field). */
export interface Activity {
  runningAgents?: number
  runningJobs?: number
  sampledAt?: string
  feedAvailable?: boolean
}

/**
 * The one derivation both consumers share. runningAgents > 0 ⇒ the `active`
 * channel (breathe), count = how many (the ported channel contract: the count
 * channel shows what the top channel is showing). Anything non-numeric/absent
 * ⇒ quiet — unknown activity is NEVER asserted busy.
 */
export function deriveBoardIcon(activity: Activity | undefined): IconState {
  const running =
    typeof activity?.runningAgents === "number" && isFinite(activity.runningAgents) && activity.runningAgents > 0
      ? Math.floor(activity.runningAgents)
      : 0
  return running > 0
    ? { session: "active", dreaming: false, count: running }
    : { session: "quiet", dreaming: false, count: 0 }
}

let bound = false
let lastHref = ""

function stampFavicon(activity: Activity | undefined): void {
  const link = document.getElementById(LINK_ID) as HTMLLinkElement | null
  if (!link) return // disposer ran (plugin unmounted) — keep quiet
  const href = faviconHref(deriveBoardIcon(activity))
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
    const activity = state.activity
    stampFavicon(activity)
    stampPanelMark(activity)
  } catch {
    // transient — the next tick retries; the tab's previous icon persists
  }
}

function refreshIfVisible(): void {
  if (!document.hidden) void poll()
}

// ── the panel header mark (slice 3C, derivation now slice 3D) ─────────────────
// SAME mapping as the favicon (deriveBoardIcon) — mark, favicon and the live
// agents truth can never disagree. The mark is the ported FULL drawing: mesh
// nodes breathe via the ported mark-breathe keyframes, gated by
// prefers-reduced-motion in the ported CSS. idPrefix "hvbp" namespaces its
// clip ids; the favicon never collides (data: URI = isolated document).

let lastPanelState = ""

/** Stamp the active panel's top-left mark (no-op when no panel is mounted). */
export function stampPanelMark(activity: Activity | undefined): void {
  const holder = document.getElementById("hvb-panel-mark")
  if (!holder) return // panel not mounted — favicon-only mode, by design
  const icon = deriveBoardIcon(activity)
  const stateKey = `${icon.session}:${icon.count}:${icon.dreaming}`
  if (stateKey === lastPanelState) return // no churn, no animation restarts
  lastPanelState = stateKey
  const when = typeof activity?.sampledAt === "string" ? activity.sampledAt.slice(0, 16).replace("T", " ") : "?"
  holder.innerHTML = fullMarkSvg(icon, {
    idPrefix: "hvbp",
    animate: true,
    size: PANEL_MARK_SIZE,
    // the "as of" honesty stamp (slice 3D): activity may lag one poll cycle
    title: `board activity — ${icon.count} agent${icon.count === 1 ? "" : "s"} running · sampled ${when} UTC (may lag one poll cycle)`,
  })
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
