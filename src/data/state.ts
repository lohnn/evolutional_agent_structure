/**
 * Board state assembly — one call gathers everything the Phase-1 viewer renders.
 *
 * Portability discipline (I-144 / SNG-038): every data source in this module
 * is LOCAL ON-DISK state under the configured workspace. No network calls, no
 * SDK calls — and future phases must keep rendered content sourced from disk
 * (external calls may only ever power navigation/existence checks).
 */
import { boardDir } from "evolutional-agent-structure/lib/board-store"
import { reattachInfo, type ReattachDecision } from "evolutional-agent-structure/lib/board-transitions"
import type { BoardConfig } from "../config"
import { buildBoard, type BoardColumns } from "./board"
import { loadCapabilities, type Capability } from "./capabilities"
import { loadDreamVitals, type DreamVitals } from "./dreams"
import { loadLiveMessages, type HivemindMessage } from "./messages"
import type { SessionMirror } from "./sessions"
import { loadWorkItems, type WorkItem } from "./workitems"

export interface BoardState {
  generatedAt: string
  workspaceRoot: string
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
}

export function loadBoardState(
  config: BoardConfig,
  sessions: SessionMirror,
  sessionBackend: "configured" | "unconfigured" = "unconfigured",
): BoardState {
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
  return {
    generatedAt: new Date().toISOString(),
    workspaceRoot: config.workspaceRoot,
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
  }
}
