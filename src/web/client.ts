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
}

let lastGood: BoardState | null = readIsland()

async function poll(): Promise<void> {
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

// The server already painted the initial state; the island is only a diff
// baseline for the morph (so lastGood is populated). Start polling on interval.
setInterval(poll, POLL_MS)
