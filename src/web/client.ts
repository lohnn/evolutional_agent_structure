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
  next.innerHTML = renderBoardBody(state)
  return next
}

function paint(state: BoardState): void {
  const root = document.getElementById("board-root")
  if (!root) return
  morph(root, renderInto(state))
  // The badge lives inside the morphed subtree, so the mismatch verdict must be
  // (re)stamped AFTER every morph — the morph resets it to the server render.
  stampFreshness(state.buildSha)
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

// The server already painted the initial state; the island is only a diff
// baseline for the morph (so lastGood is populated). Start polling on interval.
setInterval(poll, POLL_MS)
