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
import { fullMarkSvg, reducedMarkSvg } from "./icon.js"
import { adapterState, INDEX_URL, type BoardIndexPayload } from "./tab-engine.js"
import type { IconState } from "./icon.js"

const FAVICON_POLL_MS = 30_000
const LINK_ID = "hvb-favicon"
const LINK_ATTR = "data-plugin-favicon"
const PANEL_MARK_SIZE = 34 // shell-safe density override lives in CSS_OVERRIDES

/** The slice-3D/3E shape the index route ships (index payload GROWS fields). */
export interface Activity {
  runningAgents?: number
  hiveRunningAgents?: number
  runningJobs?: number
  sampledAt?: string
  feedAvailable?: boolean
  ledgerAvailable?: boolean
}

/**
 * The two-tier derivation (slice 3E), shared by mark + favicon:
 *   tier "hive"    — HIVE sessions running → breathe in the CURRENT orange
 *                    (byte-unchanged amber, the ported active accent);
 *   tier "ambient" — other sessions running, none HIVE → breathe in a MUTED
 *                    same-hue ochre (#866d3c: ~half the amber saturation,
 *                    ~20% darker — distinct from amber at favicon 16px AND
 *                    at the 34px panel mark; a desaturated member of the
 *                    ported palette's own amber family);
 *   tier "quiet"   — nothing running → the ported static drawing.
 * Unknown/absent activity ⇒ quiet — never asserted busy.
 */
export type ActivityTier = "hive" | "ambient" | "quiet"

export function activityTier(activity: Activity | undefined): { tier: ActivityTier; running: number; hive: number } {
  const running =
    typeof activity?.runningAgents === "number" && isFinite(activity.runningAgents) && activity.runningAgents > 0
      ? Math.floor(activity.runningAgents)
      : 0
  const hive =
    typeof activity?.hiveRunningAgents === "number" && isFinite(activity.hiveRunningAgents) && activity.hiveRunningAgents > 0
      ? Math.floor(activity.hiveRunningAgents)
      : 0
  if (running <= 0) return { tier: "quiet", running: 0, hive: 0 }
  return hive > 0 ? { tier: "hive", running, hive } : { tier: "ambient", running, hive: 0 }
}

export function deriveBoardIcon(activity: Activity | undefined): IconState {
  const { running } = activityTier(activity)
  return running > 0
    ? { session: "active", dreaming: false, count: running }
    : { session: "quiet", dreaming: false, count: 0 }
}

// Tier color mechanics (authored — see activityTier doc). The ported emitters
// paint the active accent as the literal amber hex; the muted tier is the
// SAME drawing re-accented via a string swap, so the ported files stay
// byte-locked and both tiers keep crisp rendering at any size (no CSS filter
// fuzz). Scope note: #d29922 also paints a DREAMING stratum, but dreaming is
// structurally false under dsh (empty dreams feed) — swap-safe by
// construction, documented in the contract.
const AMBER_HEX = "#d29922"
const AMBER_MUTED_HEX = "#866d3c"

function reaccent(svg: string): string {
  return svg.split(AMBER_HEX).join(AMBER_MUTED_HEX)
}

let bound = false
let lastHref = ""

function stampFavicon(activity: Activity | undefined): void {
  const link = document.getElementById(LINK_ID) as HTMLLinkElement | null
  if (!link) return // disposer ran (plugin unmounted) — keep quiet
  const icon = deriveBoardIcon(activity)
  const { tier } = activityTier(activity)
  const svg = tier === "ambient" ? reaccent(reducedMarkSvg(icon)) : reducedMarkSvg(icon)
  const href = "data:image/svg+xml," + encodeURIComponent(svg)
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
  const { tier, running, hive } = activityTier(activity)
  const stateKey = `${tier}:${icon.count}`
  if (stateKey === lastPanelState) return // no churn, no animation restarts
  lastPanelState = stateKey
  const when = typeof activity?.sampledAt === "string" ? activity.sampledAt.slice(0, 16).replace("T", " ") : "?"
  // the as-of stamp NAMES the tier (slice 3E) — misreads must be cheap
  const now =
    tier === "hive"
      ? `${running} HIVE agent${running === 1 ? "" : "s"} running`
      : tier === "ambient"
        ? `${running} other agent${running === 1 ? "" : "s"} running · no HIVE session active`
        : "quiet — nothing running"
  holder.innerHTML = reaccent(
    fullMarkSvg(icon, {
      idPrefix: "hvbp",
      animate: true,
      size: PANEL_MARK_SIZE,
    }),
  )
  // the tooltip rides as an SVG <title> (the fullMarkSvg opts.title renders a
  // different element; a <title> child is the accessible-layer standard)
  const svg = holder.querySelector("svg")
  if (svg) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "title")
    t.textContent = `${now} · sampled ${when} UTC (may lag one poll cycle)`
    svg.insertBefore(t, svg.firstChild)
  }
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
