/**
 * Board state assembly — one call gathers everything the Phase-1 viewer renders.
 *
 * Portability discipline (I-144 / SNG-038): every DISPLAYED data source here is
 * cached in local on-disk state under the configured workspace. The one network
 * touch — the live todo-sub-state read (WI-038, data/todos.ts) — powers only the
 * FRESHNESS of content that is ALSO persisted to the item's own todo_mirror; the
 * mirror remains the portability-invariant fallback (unknown ≠ empty). No other
 * source calls the network, and none render content sourced solely from a live
 * call (external calls may otherwise only ever power navigation/existence).
 */
import { boardDir } from "../../lib/board-store"
import { reattachInfo, type ReattachDecision } from "../../lib/board-transitions"
import type { BoardConfig } from "../config"
import { buildBoard, type BoardColumns } from "./board"
import { loadCapabilities, type Capability } from "./capabilities"
import { loadDreamVitals, type DreamVitals } from "./dreams"
import { loadLiveMessages, type HivemindMessage } from "./messages"
import type { SessionMirror } from "./sessions"
import { loadTodoSubStates } from "./todos"
import type { TodoSubState } from "./todo-types"
import { loadActionRequired, type ActionRequired } from "./action-required"
import { loadSessionStatus, type SessionStatusKind } from "./session-status"
import { loadWorkItems, type WorkItem } from "./workitems"

export interface BoardState {
  generatedAt: string
  workspaceRoot: string
  /**
   * Short git SHA of the running server build (`f4ff50b`, `f4ff50b-dirty`, or
   * the sentinel `"unknown"`). Carried in every /api/state payload so each poll
   * lets the client compare the server's SHA against the one baked into its own
   * /client.js bundle — an explicit per-poll staleness check (W-061: staleness
   * does NOT self-heal, prove it). Also surfaces which bytes are actually live
   * despite the copied `file:` dep masking upstream edits (W-079).
   */
  buildSha: string
  /** GUI base for ?session= deep links (config knob, needed at render time). */
  guiBaseUrl: string
  capabilities: Capability[]
  dreams: DreamVitals
  messages: HivemindMessage[]
  /** Work items (board/WI-*.md), re-read per request like all file sources. */
  items: WorkItem[]
  /** The four kanban columns + unclaimed session-only cards (merged view). */
  board: BoardColumns
  /**
   * Write affordances shown/accepted only when the rendered board IS the
   * workspace's real board (the transition module always writes there —
   * mutating from fixture mode would desync view from writes).
   */
  writesEnabled: boolean
  /**
   * Whether the opencode session backend is configured (Start / fresh-promote
   * create real sessions). Reattach paths never need it (invariant 4).
   */
  sessionBackend: "configured" | "unconfigured"
  /**
   * Per-item promote decision (owner's reattachInfo, computed at render time
   * so buttons are labeled with the TRUE outcome before the click). Only for
   * promotable cards (backlog/todo/done) on the real board.
   */
  promoteDecisions: Record<string, ReattachDecision>
  /**
   * Phase-1.5 back-fill mirror. Computed ONCE at startup (bootstrap-only,
   * I-143) and passed in — deliberately NOT re-read per request like the
   * file-backed sources above.
   */
  sessions: SessionMirror
  /**
   * Todo sub-state per in-progress item id (WI-038): the owning session's
   * TodoWrite list, read LIVE per request when reachable and otherwise from the
   * item's persisted todo_mirror (I-187 two-path reconciliation). Keyed by WI
   * id; absent key ⇒ no owner/no todos. Render reads this off BoardState — it
   * never calls the SDK itself (I-192 bundle boundary). This is the ONE data
   * source in this module that may touch the network, and ONLY to power
   * freshness of DISPLAYED content that is ALSO mirrored on disk (I-144).
   */
  todoSubStates: Record<string, TodoSubState>
  /**
   * Action-required per SESSION id (WI-043): which owning sessions are blocked
   * waiting on the user — a pending question (awaitingQuestion) or a pending
   * command/permission (awaitingPermission). Read LIVE per request from the two
   * global opencode endpoints (data/action-required.ts) — NOT through the frozen
   * sessionMirror, because this flag is time-sensitive and must clear the moment
   * the prompt is answered (I-187). Keyed by session id (owner_session for WI
   * cards, the session's own id for session-only cards); a session absent from
   * the map is unblocked. Render reads this off BoardState only — it never calls
   * the SDK itself (I-192 bundle boundary). Empty when the backend is
   * unreachable (graceful degradation, no indicators — never a crash).
   */
  actionRequired: Record<string, ActionRequired>
  /**
   * Live processing status per SESSION id (WI-044): which owning sessions are
   * busy (chugging along), retrying after a provider error, or idle. Read LIVE
   * per request from the single global `GET /session/status` endpoint
   * (data/session-status.ts) — NOT through the frozen sessionMirror, because
   * status is time-sensitive and must clear the moment a session goes idle
   * (I-187). Keyed by session id (owner_session for WI cards, the session's own
   * id for session-only cards).
   *
   * EMPIRICAL CONTRACT (active-only, verified 2026-07-23): the endpoint reports
   * ONLY non-idle sessions, so a session ABSENT from this map is
   * "idle-or-unknown", indistinguishable — the renderer treats absence as NO
   * badge (never a synthesised "idle"; unknown ≠ done, W-030). Render reads this
   * off BoardState only — it never calls the SDK itself (I-192 bundle boundary).
   * Empty when the backend is unreachable (graceful degradation, no crash).
   */
  sessionStatus: Record<string, SessionStatusKind>
}

export async function loadBoardState(
  config: BoardConfig,
  sessions: SessionMirror,
  sessionBackend: "configured" | "unconfigured" = "unconfigured",
): Promise<BoardState> {
  const items = loadWorkItems(config.boardDir)
  const writesEnabled = config.boardDir === boardDir(config.workspaceRoot)
  const promoteDecisions: Record<string, ReattachDecision> = {}
  if (writesEnabled) {
    for (const item of items) {
      if (item.status !== "in_progress") {
        promoteDecisions[item.id] = reattachInfo(config.workspaceRoot, item.id)
      }
    }
  }
  // Live todo sub-state for in-progress cards (WI-038) + action-required per
  // session (WI-043) — both live, per-request reads over the existing HTTP
  // transport; run concurrently (independent calls). action-required is two
  // GLOBAL calls (all sessions), so it's cheap regardless of card count.
  const [todoSubStates, actionRequired, sessionStatus] = await Promise.all([
    loadTodoSubStates(config, items, writesEnabled),
    loadActionRequired(config),
    loadSessionStatus(config),
  ])
  return {
    generatedAt: new Date().toISOString(),
    workspaceRoot: config.workspaceRoot,
    buildSha: config.buildSha,
    guiBaseUrl: config.guiBaseUrl,
    capabilities: loadCapabilities(config.opencodeDir),
    dreams: loadDreamVitals(config.workspaceRoot),
    messages: loadLiveMessages(config.opencodeDir),
    items,
    board: buildBoard(items, sessions),
    writesEnabled,
    sessionBackend,
    promoteDecisions,
    sessions,
    todoSubStates,
    actionRequired,
    sessionStatus,
  }
}
