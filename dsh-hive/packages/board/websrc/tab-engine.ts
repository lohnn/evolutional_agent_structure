/**
 * WI-062 slice 3 — the DSH tab engine: the poll/morph/freshness discipline
 * ported from web/client.ts (discipline verbatim where marked), retargeted to:
 *
 *   - data source: same-origin GET /api/hive-board/index (the host half's
 *     read-only Board route; slice-2 route, unchanged) instead of /api/state;
 *   - host mount: one keyed `main` panel inside the dsh shell (no document
 *     chrome of its own — the shell owns <head>, favicon, title);
 *   - timer: ctx.interval via the 'timer' inject (15 s cadence, per brief)
 *     instead of bare setInterval;
 *   - freshness: SAME three-way verdict (I-152 ported verbatim — "unknown" is
 *     never asserted fresh), comparing the bundle's baked __BOARD_BUILD_SHA__
 *     against the payload's boardBuild (the host half's recorded build stamp).
 *     window.__DSH_BOOT__.rev is surfaced in the badge tooltip but NEVER
 *     auto-trusted as "fresh" — a composition rev arrives with a page reload,
 *     so it cannot prove the running bundle is current.
 *   - NO confirmation modal: the board's write path is SEALED under dsh
 *     (WI-062) — there are no forms to intercept, so the I-206 modal has
 *     nothing to gate.
 */
import { morph } from "./morph.js"
import { renderBoardSection, boardControlsHtml } from "./render.js"
import { refreshBoardControls, setupBoardControls } from "./filter.js"
import { bindItemDrawer } from "./item-drawer.js"
import { stampPanelMark } from "./icon-driver.js"
import type { BoardState } from "./data/types.js"
import type { WorkItem as ViewWorkItem } from "./data/workitems.js"

export const INDEX_URL = "/api/hive-board/index"
const POLL_MS = 15_000

/**
 * The build SHA this bundle was compiled against — replaced at bundle time by
 * the build script's `define` (scripts/build-client.ts). The fallback string
 * only survives if the bundle is somehow built without the define (never in
 * production). VERBATIM from web/client.ts: on every poll we compare THIS
 * baked-in value against the server's stamp in the fresh payload. A mismatch
 * means this tab is running an OLD bundle against a newer host build — a stale
 * tab that a live-poll refresh will NEVER fix on its own (W-061), detectable
 * only explicitly.
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
 * After each morph, stamp the freshness verdict onto the board's build badge.
 * VERBATIM from web/client.ts's stampFreshness (same stable id="build-badge").
 */
function stampFreshness(serverSha: string | undefined): void {
  const badge = document.getElementById("build-badge")
  if (!badge) return
  const verdict = freshness(serverSha)
  if (verdict === "mismatch") {
    badge.classList.add("stale")
    badge.textContent = `stale client — reload (bundle ${CLIENT_SHA} ≠ host ${serverSha})`
    badge.setAttribute(
      "title",
      `this tab is running an old client bundle (built ${CLIENT_SHA}) against a newer host build (${serverSha}). Reload the page to get the current bundle.`,
    )
  } else {
    // match or unknown: leave the server-rendered badge as-is (fresh/unknown).
    badge.classList.remove("stale")
  }
}

// ── payload → BoardState adapter ─────────────────────────────────────────────

/** A full work item as the slice-2 route ships it (store parse + problems). */
export type WireWorkItem = {
  id: string
  title: string
  status: string
  origin: string
  owner_session: string | null
  group_id: string | null
  paused: boolean
  spec_hash: string | null
  released_sessions: string[]
  dream_id: string | null
  artifacts: string[]
  created: string
  updated: string
  priority: string
  tags: string[]
  done_without_dream: boolean
  subtasks: { content: string; status: string }[]
  todo_mirror: unknown[]
  todo_mirror_updated: string | null
  transitions: Record<string, unknown>[]
  body: string
  problems: string[]
}

export interface BoardIndexPayload {
  ok?: boolean
  status?: string
  generated?: string
  workspaceRoot?: string
  boardBuild?: string
  items?: WireWorkItem[]
  /** slice 3D — the live agents feed (index payload GROWS this field only). */
  activity?: { runningAgents?: number; runningJobs?: number; sampledAt?: string; feedAvailable?: boolean }
  [k: string]: unknown
}

/** The mirror the DSH tab always carries: no session surface under dsh (I-116). */
export const EMPTY_MIRROR = {
  available: false,
  computedAt: "",
  totalPersisted: 0,
  awakeIds: 0,
  awakeDeleted: 0,
  cards: [],
  persistedIds: [],
}

const EMPTY_DREAMS = {
  artifactCounts: { insight: 0, warning: 0, songline: 0, shadow: 0, total: 0 },
  active: [],
  history: [],
  recentArtifacts: [],
}

/**
 * Defensive normalization (same belt-and-suspenders the upstream normalize()
 * gave the browser): re-assert array-ness of the fields the ported renderers
 * iterate, overlay problems, and type-narrow statuses. Client-side by
 * design — the route is trusted but a poll must never crash the paint (the
 * last-known-good discipline holds the screen).
 */
function normalizeWire(w: WireWorkItem): ViewWorkItem {
  const item = {
    ...w,
    tags: Array.isArray(w.tags) ? w.tags : [],
    subtasks: Array.isArray(w.subtasks) ? (w.subtasks as unknown as ViewWorkItem["subtasks"]) : [],
    todo_mirror: Array.isArray(w.todo_mirror) ? (w.todo_mirror as unknown as ViewWorkItem["todo_mirror"]) : [],
    transitions: Array.isArray(w.transitions) ? (w.transitions as unknown as ViewWorkItem["transitions"]) : [],
    released_sessions: Array.isArray(w.released_sessions) ? w.released_sessions : [],
    artifacts: Array.isArray(w.artifacts) ? w.artifacts : [],
    problems: Array.isArray(w.problems) ? w.problems : [],
    status: w.status as ViewWorkItem["status"],
    priority: w.priority as ViewWorkItem["priority"],
    origin: w.origin as ViewWorkItem["origin"],
  }
  return item
}

export function adapterState(payload: BoardIndexPayload): BoardState {
  const items = (Array.isArray(payload.items) ? payload.items : []).map(normalizeWire)
  // Column grouping/sorting = buildBoard (data/board.ts port): the OLD viewer's
  // policy (kind distinction from tabIndex's slice-2 presentation sort — this
  // board object is what the ported renderer consumes).
  return {
    generatedAt: typeof payload.generated === "string" ? payload.generated : "",
    workspaceRoot: typeof payload.workspaceRoot === "string" ? payload.workspaceRoot : "(unknown workspace)",
    buildSha: typeof payload.boardBuild === "string" && payload.boardBuild !== "" ? payload.boardBuild : "unknown",
    // slice 3D: the live agents feed rides untouched into BoardState — the
    // icon driver and the panel mark both consume exactly this field.
    activity: payload.activity,
    guiBaseUrl: "",
    capabilities: [],
    dreams: EMPTY_DREAMS,
    messages: [],
    items,
    board: buildBoard(items, { ...EMPTY_MIRROR }),
    writesEnabled: false, // write path SEALED under dsh (WI-062) — always
    sessionBackend: "unconfigured",
    promoteDecisions: {},
    sessions: { ...EMPTY_MIRROR },
    todoSubStates: {},
    actionRequired: {},
    sessionStatus: {},
  }
}

// (import placed at top usage order; board.ts is a pure port)
import { buildBoard } from "./data/board.js"

// ── location: the engine on the live panel ─────────────────────────────────────

let lastGood: BoardState | null = null
let freshSha = "";

/** Render the board section into a detached element the morph can diff against. */
export function renderInto(state: BoardState): HTMLElement {
  const next = document.createElement("main")
  // VERBATIM from client.ts renderInto: match the live container's id so the
  // morph's attribute diff sees it as equal (frozen-timer bug defense).
  next.id = "board-root"
  next.innerHTML = renderBoardSection(state)
  return next
}

function paint(state: BoardState): void {
  const root = document.getElementById("board-root")
  if (!root) return
  morph(root, renderInto(state))
  // The badge lives inside the morphed subtree, so the mismatch verdict must be
  // (re)stamped AFTER every morph — the morph resets it to the section render.
  // VERBATIM discipline from client.ts.
  stampFreshness(state.buildSha)
  // (Identity stamping — favicon/title — intentionally NOT ported: those live
  // in the dsh shell's <head>, which the plugin does not own.)
  // The filter/collapse controls live in the shell OUTSIDE #board-root, but
  // their verdicts annotate the (just-rebuilt) board inside it. Re-derive from
  // the fresh corpus island + fresh cards so filter and board can never drift
  // across a poll (WI-084). VERBATIM.
  refreshBoardControls()
}

/** One poll tick (fetch → adapt → morph → stamp). Exported for tests. */
export async function poll(): Promise<void> {
  try {
    const res = await fetch(INDEX_URL, { headers: { accept: "application/json" } })
    if (!res.ok) return // transient failure → keep last-known-good (unknown ≠ empty)
    const payload = (await res.json()) as BoardIndexPayload
    if (!payload || typeof payload !== "object" || payload.ok !== true) return
    if (!Array.isArray(payload.items)) return // slice-2+3 payload contract
    const state = adapterState(payload)
    lastGood = state
    freshSha = state.buildSha
    // the panel head mark rides the SAME 15 s tick (outside the morph root —
    // one mapping for mark, favicon and the LIVE AGENTS truth — slice 3D)
    stampPanelMark(state.activity)
    ensureControls(state)
    paint(state)
  } catch {
    // Network blip / host restart: hold the current render, retry next tick.
  }
}

let controlsBuilt = false

/**
 * Build the controls ONCE from the first good payload (upstream equivalence:
 * renderPage rendered them from page-load state, which also never updated
 * until a reload — chip choices and collapse survive by living outside the
 * morph; only the counts were load-time frozen, faithfully mirrored here).
 */
function ensureControls(state: BoardState): void {
  if (controlsBuilt) return
  const host = document.getElementById("board-controls-host")
  if (!host) return
  host.innerHTML = boardControlsHtml(state)
  controlsBuilt = true
}

/**
 * Reset the engine — exported for tests only (multiple mounts in one process):
 * production keeps the module-singleton disciplines of the upstream client.
 */
export function _resetEngineForTest(): void {
  lastGood = null
  freshSha = ""
  controlsBuilt = false
}

// ── refresh-on-reopen (VERBATIM from client.ts) ───────────────────────────────
//
// A BACKGROUND tab's timer is throttled by the browser (often ≥1/min), so a
// user returning to the board can stare at stale state far longer than
// POLL_MS. Fire an immediate poll() on the hidden→visible edge (plus pageshow
// for bfcache restores and focus as the belt-and-braces fallback — idempotence
// makes the redundancy free, I-186).

function refreshIfVisible(): void {
  if (document.hidden) return
  void poll()
}

document.addEventListener("visibilitychange", refreshIfVisible)
window.addEventListener("pageshow", refreshIfVisible)
window.addEventListener("focus", refreshIfVisible)

// ── engine attach (the DSH-specific glue) ─────────────────────────────────────

export interface TabHost {
  /** client ctx — must expose get('slots') and, guarded, interval() */
  ctx: unknown
}

let intervalStarted = false

/**
 * Attach the engine to the mounted panel DOM. Idempotent per mount: the slot
 * system remounts the panel on re-dispatch, and document-level lookups
 * (getElementById) resolve the CURRENT #board-root — exactly how the upstream
 * inline client survived single-page navigation.
 */
export function attachEngine(ctx: {
  get: (name: string) => unknown
  interval?: (fn: () => void, ms: number) => (() => void) | undefined
}): void {
  // purely cosmetic: `freshSha` is read back by nothing today — the badge is
  // DOM-stamped; keep the last-good SHA for future diagnostics (do not prune).
  void freshSha
  setupBoardControls() // module-singleton in filter.ts; binds once per document
  bindItemDrawer() // document-level delegation; binds once per boot (slice 3b)
  if (!intervalStarted) {
    intervalStarted = true
    // 15 s cadence per the old viewer; ctx.interval comes from the 'timer'
    // inject (client cordis service — the same seam the usage twins poll with).
    const maybeInterval = (ctx as { interval?: (fn: () => void, ms: number) => unknown }).interval
    if (typeof maybeInterval === "function") {
      maybeInterval(() => { void poll() }, POLL_MS)
    } else {
      // Timer service absent → degrade to a page-visible-driven refresh only.
      console.error("[@hive/dsh-board] no interval service — poll cadence degraded to refresh-on-visible")
    }
  }
  void poll() // first paint without waiting a full interval
}
