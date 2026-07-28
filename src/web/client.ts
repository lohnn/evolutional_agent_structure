/**
 * Client-side live refresh — the anti-flicker, form-surviving poll loop.
 *
 * Replaces the old `<meta http-equiv="refresh">` full-document rebuild. Every
 * POLL_MS it fetches /api/state (the same BoardState the server renders from),
 * re-renders the board body with the SHARED renderBoardBody(), and morphs the
 * live #board-root subtree to match — mutating only changed nodes. Untouched
 * DOM (and the transient UI state living on it) is preserved:
 *
 *  • no flicker — unchanged cards/columns are never torn down (bug #1);
 *  • the expanded "+ new item" <details> and anything typed into it survive a
 *    poll — that state rides on DOM the morph leaves in place (bug #2, W-034);
 *  • scroll position survives (we never detach the scroll container).
 *
 * Resilience (SNG-046 / I-143): a source that fails to answer is "unknown",
 * not "empty". A failed or malformed poll keeps the last-known-good render on
 * screen rather than blanking it. The initial baseline comes from an inline
 * JSON island so first paint needs no round-trip.
 */
import { renderBoardBody } from "./render"
import { morph } from "./morph"
import { boardTitle, deriveIconState, faviconHref } from "./icon"
import type { BoardState } from "../data/state"

const POLL_MS = 15_000

/**
 * The build SHA this bundle was compiled against — replaced at bundle time by a
 * Bun `define` in client-bundle.ts. The fallback string only survives if the
 * bundle is somehow built without the define (never in production).
 *
 * On every poll we compare THIS baked-in value against the server's SHA in the
 * fresh /api/state payload. A mismatch means this tab is running an OLD
 * /client.js against a newer server — a stale tab that a live-poll refresh will
 * NEVER fix on its own (W-061: staleness does not self-heal, so we detect it
 * explicitly and tell the user to reload). This is also the visible defense
 * against the copied `file:` dep masking upstream edits (W-079): the badge
 * proves which bytes are actually running rather than leaving it assumed.
 */
declare const __BOARD_BUILD_SHA__: string
const CLIENT_SHA: string = typeof __BOARD_BUILD_SHA__ === "string" ? __BOARD_BUILD_SHA__ : "unknown"

/** Deterministic three-way verdict (I-152): compare by the literal SHA string. */
type FreshnessVerdict = "match" | "mismatch" | "unknown"

function freshness(serverSha: string | undefined): FreshnessVerdict {
  // If either side is unknowable, we cannot ASSERT staleness — say so, don't
  // guess. Only a concrete server≠client SHA pair proves a stale tab.
  if (!serverSha || serverSha === "unknown" || CLIENT_SHA === "unknown") return "unknown"
  return serverSha === CLIENT_SHA ? "match" : "mismatch"
}

/**
 * After each morph, stamp the freshness verdict onto the server-rendered build
 * badge. The server render only knows its OWN SHA; this is where the client's
 * baked-in SHA enters the comparison and the badge turns red on a stale tab.
 */
function stampFreshness(serverSha: string | undefined): void {
  const badge = document.getElementById("build-badge")
  if (!badge) return
  const verdict = freshness(serverSha)
  if (verdict === "mismatch") {
    badge.classList.add("stale")
    badge.textContent = `stale tab — reload (client ${CLIENT_SHA} ≠ server ${serverSha})`
    badge.setAttribute(
      "title",
      `this tab is running an old /client.js (built ${CLIENT_SHA}) against a newer server (${serverSha}). Reload to get the current build.`,
    )
  } else {
    // match or unknown: leave the server-rendered badge as-is (fresh/unknown).
    badge.classList.remove("stale")
  }
}

function readIsland(): BoardState | null {
  const el = document.getElementById("board-state")
  if (!el || !el.textContent) return null
  try {
    return JSON.parse(el.textContent) as BoardState
  } catch {
    return null
  }
}

/** Render the board body into a detached element the morph can diff against. */
function renderInto(state: BoardState): HTMLElement {
  const next = document.createElement("main")
  // Match the live container's identity so the morph's attribute diff sees them
  // as equal. morph() also protects the root's id structurally, but carrying it
  // here makes the intent explicit at the call site and keeps the diff a no-op
  // for the container itself (defense in depth against the frozen-timer bug:
  // a bare id-less <main> used to make morph strip id="board-root" on tick 1).
  next.id = "board-root"
  next.innerHTML = renderBoardBody(state)
  return next
}

/**
 * Icon identity (favicon + title) — the two channels, restamped every tick.
 *
 * These live in <head>, deliberately OUTSIDE <main id="board-root">, which is
 * the only subtree morph() touches. So unlike the build badge below, they are
 * not reset by the morph — but they are also not updated by it, which is
 * exactly why this function exists. Keeping icon markup out of the morph is a
 * hard rule, not an accident: the morph reconciles attributes bidirectionally,
 * and letting it near identity attributes is how the live-refresh loop got
 * frozen on tick 1 once before.
 *
 * The derivation is shared with the server render (deriveIconState in icon.ts),
 * so the first paint and every subsequent poll agree by construction rather
 * than by two hand-kept-in-sync copies.
 *
 * Writes are guarded by an equality check: assigning the same href would make
 * some browsers re-decode and re-rasterise the icon 4× a minute forever, and
 * re-assigning document.title needlessly churns the tab strip.
 */
function stampIdentity(state: BoardState): void {
  const icon = deriveIconState(state)

  const title = boardTitle(icon)
  if (document.title !== title) document.title = title

  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) return // no icon link in this shell — nothing to swap, not an error
  const href = faviconHref(icon)
  if (link.getAttribute("href") !== href) link.setAttribute("href", href)
}

function paint(state: BoardState): void {
  const root = document.getElementById("board-root")
  if (!root) return
  morph(root, renderInto(state))
  // The badge lives inside the morphed subtree, so the mismatch verdict must be
  // (re)stamped AFTER every morph — the morph resets it to the server render.
  stampFreshness(state.buildSha)
  // The favicon/title live OUTSIDE it, so they must be stamped explicitly. Note
  // the header full mark needs neither: it rides inside #board-root and the
  // shared renderer redraws it as part of the morph.
  stampIdentity(state)
}

let lastGood: BoardState | null = readIsland()

/** Exported for tests — one poll tick (fetch /api/state, morph, stamp badge). */
export async function poll(): Promise<void> {
  try {
    const res = await fetch("/api/state", { headers: { accept: "application/json" } })
    if (!res.ok) return // transient failure → keep last-known-good (unknown ≠ empty)
    const state = (await res.json()) as BoardState
    if (!state || typeof state !== "object" || !Array.isArray(state.items)) return
    lastGood = state
    paint(state)
  } catch {
    // Network blip / server restart: hold the current render, retry next tick.
  }
}

// Stamp the freshness verdict on first load too, from the JSON island — so a
// tab that was left open across a server restart flips to "stale" on the very
// next paint (initial island or first poll), not only after a change lands.
stampFreshness(lastGood?.buildSha)

// The server already rendered the state-derived favicon + title into <head>, so
// this is normally a no-op (the equality guards make it free). It matters when
// the shell and the island disagree — e.g. a cached document restored from
// bfcache — so the identity matches the state we're actually about to diff
// against, without waiting a full poll interval.
if (lastGood) stampIdentity(lastGood)

// The server already painted the initial state; the island is only a diff
// baseline for the morph (so lastGood is populated). Start polling on interval.
setInterval(poll, POLL_MS)

// ── Refresh-on-reopen (tab re-focus / bfcache restore) ──────────────────────
//
// The interval poll is the steady-state case, but a BACKGROUNDED tab has its
// setInterval throttled by the browser (often to ≥1/min), so a user returning
// to the board can stare at stale state for far longer than POLL_MS. Fire an
// immediate poll() the moment the tab becomes visible again so the board is
// fresh right away — the interval is untouched and keeps running.
//
// poll() is idempotent and self-guarding (holds last-known-good on failure), so
// an extra invocation here is always safe — no dedup/debounce needed (I-186:
// the morph won't disturb the open modal or scroll/focus; SHADOW-006: lean on
// idempotence rather than hand-tuning per-browser). We wire THREE signals for
// portability across engines, all funnelling into the same refresh:
//
//   • visibilitychange → refresh only on the hidden→visible EDGE (the standard
//     "became visible" pattern). Covers tab switch, unminimize, wake.
//   • pageshow          → covers a bfcache restore (back/forward into the board),
//     which does NOT fire visibilitychange but DOES fire pageshow. We refresh on
//     any pageshow that lands on a visible page (event.persisted is the bfcache
//     hint, but we don't gate on it — a plain reload's pageshow re-poll is a
//     harmless no-op given idempotence).
//   • focus             → belt-and-braces fallback for engines/versions where
//     visibilitychange is unreliable on navigation (SHADOW-006, iOS/iPadOS
//     Safari especially). Redundant with the above on well-behaved browsers;
//     idempotence makes the redundancy free.
//
// W-093 caution: the guard below (skip when still hidden) must NOT silently
// swallow a genuine became-visible transition — it only short-circuits the
// hidden case, and every visible path reaches poll(). No downstream early-return
// stands between this trigger and the fetch.
function refreshIfVisible(): void {
  // document.hidden is the portable read; visibilityState === "visible" is the
  // same edge said the other way. Only act when the page is actually visible.
  if (document.hidden) return
  void poll()
}

document.addEventListener("visibilitychange", refreshIfVisible)
window.addEventListener("pageshow", refreshIfVisible)
window.addEventListener("focus", refreshIfVisible)

// ── Confirmation modal (I-206) ──────────────────────────────────────────────
//
// A UX gate purely in FRONT of the already-correct locked write path
// (I-179/I-212): we intercept submit on the consequential forms, show a styled
// modal, and let the ORIGINAL form POST proceed on Confirm — no transition
// logic is duplicated here.
//
// Poll-survival (I-186): the modal DOM lives in the page shell OUTSIDE
// #board-root, so a morph physically cannot touch it while it's open. The
// forms it gates ARE inside #board-root (re-rendered each poll), so we bind via
// event DELEGATION on document — a freshly-morphed form is still intercepted
// without re-binding. The modal's own controls are stable, bound once.
setupConfirmModal()

function setupConfirmModal(): void {
  const scrim = document.getElementById("confirm-modal")
  const titleEl = document.getElementById("confirm-title")
  const bodyEl = document.getElementById("confirm-body")
  const okBtn = document.getElementById("confirm-ok") as HTMLButtonElement | null
  const cancelBtn = document.getElementById("confirm-cancel") as HTMLButtonElement | null
  // Defensive: if the shell somehow lacks the modal, leave native submit intact
  // rather than swallowing clicks (unknown ≠ break; SNG-046).
  if (!scrim || !titleEl || !bodyEl || !okBtn || !cancelBtn) return

  // The form awaiting a decision, and a guard so a confirmed submit can never
  // fire twice (double-click / re-entrancy).
  let pendingForm: HTMLFormElement | null = null
  let submitting = false

  function close(): void {
    scrim!.setAttribute("hidden", "")
    pendingForm = null
    okBtn!.classList.remove("warn")
  }

  function open(form: HTMLFormElement): void {
    pendingForm = form
    const severity = form.getAttribute("data-confirm-severity") === "warn" ? "warn" : "start"
    titleEl!.textContent = form.getAttribute("data-confirm-title") || "Confirm this action?"
    bodyEl!.textContent = form.getAttribute("data-confirm-body") || ""
    okBtn!.classList.toggle("warn", severity === "warn")
    okBtn!.disabled = false
    scrim!.removeAttribute("hidden")
    // Confirm focused on open (a11y / keyboard).
    okBtn!.focus()
  }

  // Intercept submits from any gated form, current or future (delegation).
  document.addEventListener(
    "submit",
    (e) => {
      const target = e.target
      if (!(target instanceof HTMLFormElement)) return
      if (target.getAttribute("data-confirm") !== "1") return // ungated → native submit
      if (submitting) return // already confirmed this one; let it through
      e.preventDefault()
      open(target)
    },
    true, // capture: run before any default form handling
  )

  okBtn.addEventListener("click", () => {
    if (!pendingForm || submitting) return
    submitting = true
    okBtn.disabled = true
    const form = pendingForm
    close()
    // Native POST to the same /transitions/* endpoint. form.submit() does NOT
    // re-dispatch the submit event, so our interceptor won't re-fire — no need
    // to detach the listener, and the double-submit guard covers re-entrancy.
    form.submit()
  })

  cancelBtn.addEventListener("click", close)

  // Scrim click cancels — but only when the click is on the backdrop itself,
  // not bubbling up from inside the .modal panel.
  scrim.addEventListener("click", (e) => {
    if (e.target === scrim) close()
  })

  // Esc cancels while open.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !scrim.hasAttribute("hidden")) close()
  })
}
