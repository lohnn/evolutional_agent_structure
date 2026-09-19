/**
 * WI-062 slice 3 — the TYPE-ONLY faces of the node-side board-viewer data modules,
 * assembled verbatim so the ported browser modules (web/render.ts, web/icon.ts,
 * data/board.ts) can compile inside @hive/dsh-board without importing the node
 * modules they originally lived in (I-192: those modules are node/bun-only —
 * bun:sqlite, node:fs, opencode HTTP — and are EXCLUDED from the port).
 *
 * PROVENANCE (copied 2026-09-19, upstream git 06a5c44-clean):
 *   SessionCard, SessionMirror          ← src/board-viewer/data/sessions.ts      (interfaces only)
 *   MessageStatus, HivemindMessage      ← src/board-viewer/data/messages.ts      (interfaces only)
 *   Capability                          ← src/board-viewer/data/capabilities.ts  (interface only)
 *   ArtifactCounts, DreamSummary,
 *   RecentArtifact, DreamVitals         ← src/board-viewer/data/dreams.ts        (interfaces only; ArtifactType value
 *                                                                                  from lib/dream-artifacts.ts — a string union, copied)
 *   ActionRequired                      ← src/board-viewer/data/action-required.ts (interface only)
 *   SessionStatusKind                   ← src/board-viewer/data/session-status.ts  (type only)
 *   BoardState                          ← src/board-viewer/data/state.ts          (interface only)
 *
 * Every field/type below is byte-copied from the named source (doc comments may
 * be shortened for this assembly, but no SHAPE changed — the drifted-shape guard
 * is the morph/filter/render renderers themselves: if a field vanished, the
 * copied code that reads it fails to compile).
 *
 * The VALUE faces of these modules (loadBoardState, loadCapabilities, the
 * SQLite mirror reader, the opencode endpoints) are deliberately NOT ported —
 * those data sources are dead under dsh; the DSH tab feeds this BoardState from
 * its own host route (websrc/tab-engine.ts adapter), with every session/dream/
 * message channel at the same empty carrying value the original degrades to.
 */

// ── sessions.ts (interfaces only) ─────────────────────────────────────────────

export interface SessionCard {
  id: string
  title: string
  created: string // ISO
  updated: string // ISO
  /** `<guiBaseUrl>/?session=<id>` deep link (navigation only — I-144). */
  openUrl: string
}

export interface SessionMirror {
  /** false ⇒ enumeration failed (DB unreadable) — unknown, NOT empty. */
  available: boolean
  computedAt: string
  /** Diagnostics for the intersection (rendered + cross-checkable). */
  totalPersisted: number
  awakeIds: number
  awakeDeleted: number
  cards: SessionCard[]
  /**
   * ALL persisted session ids in this workspace (not just awakened) — the
   * existence oracle for "Open session" links (SCHEMA §1a: enabled iff the
   * session is present here; absent = unknown, never "deleted").
   */
  persistedIds: string[]
  /**
   * id → live session title for ALL persisted sessions (raw, unmassaged — may
   * itself be empty or an opencode placeholder). Feeds ONLY the bounded
   * placeholder-title fallback (data/placeholder-title.ts): when a WI card's
   * frozen frontmatter title is still opencode's auto-placeholder, the card
   * renders the owner session's real title from here. NOT a general title
   * source — the WI record stays authoritative for non-placeholder titles
   * (I-144). Undefined when the mirror is unavailable.
   */
  sessionTitles?: Record<string, string>
  error?: string
}

// ── messages.ts (types only) ──────────────────────────────────────────────────

export type MessageStatus = "pending" | "delivered"

export interface HivemindMessage {
  id: string
  sender: string
  recipient: string
  type: string
  content: string
  status: MessageStatus
  timestamp: string
  groupId?: string
}

// ── capabilities.ts (interface only) ──────────────────────────────────────────

export interface Capability {
  /** Short-form name, e.g. "proposal-web" — never "capabilities/proposal-web". */
  name: string
  description: string
  domain: string
  energy: number | null
  spawned: string
  mode: string
  canMergeWith: string[]
}

// ── dreams.ts (interfaces only) ───────────────────────────────────────────────

export type ArtifactType = "insight" | "warning" | "songline" | "shadow"

export interface ArtifactCounts {
  insight: number
  warning: number
  songline: number
  shadow: number
  total: number
}

export interface DreamSummary {
  id: string // DRM-NNN
  status: string | null // DREAMING | COMPLETE — null if the file was unreadable
  intention: string | null
  intentionType: string | null
  depth: number | null
  entryTime: string | null
  exitTime: string | null
  /** Artifact ids linked in the DRM (I-/W-/SNG-/SHADOW-). */
  artifacts: string[]
}

export interface RecentArtifact {
  id: string
  type: ArtifactType
  sourceDream: string
  summary: string
}

export interface DreamVitals {
  artifactCounts: ArtifactCounts
  /** Dreams currently in dreams/active/ (normally 0 or 1). */
  active: DreamSummary[]
  /** dreams/history/, newest first. */
  history: DreamSummary[]
  /** Highest-numbered artifacts, newest first. */
  recentArtifacts: RecentArtifact[]
}

// ── action-required.ts (interface only) ───────────────────────────────────────

export interface ActionRequired {
  /** A command/permission prompt is pending approval for this session. */
  awaitingPermission: boolean
  /** A question is pending an answer for this session. */
  awaitingQuestion: boolean
  /** Count of pending permission requests (for a tooltip / at-a-glance). */
  permissionCount: number
  /** Count of pending question requests. */
  questionCount: number
  /**
   * Short header text of the FIRST pending question (QuestionInfo.header, "very
   * short label (max 30 chars)" per the SDK) — powers a tooltip so the user can
   * see what's being asked without leaving the board. Empty when none/unknown.
   */
  questionHeader: string
}

// ── session-status.ts (type only) ─────────────────────────────────────────────

export type SessionStatusKind = "busy" | "idle" | "retry"

// ── state.ts (interface only — BoardState as the ported renderer consumes it) ──

import type { BoardColumns } from "./board.js"
import type { WorkItem } from "./workitems.js"

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
   *
   * DSH ADAPTATION (WI-062 slice 3): the tab route fills this from the board
   * package's own recorded build stamp (dist/board-build.json written by the
   * client build step) — the running half-builds under a schema where the
   * "server" is the same package that emitted the client bundle, so the
   * three-way verdict compares the tab's baked bundle SHA against the HOST
   * build stamp. "unknown" is never asserted fresh (I-152, ported verbatim).
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
   * (data/session-status.ts) — NOT through the frozen sessionMirror, because this
   * flag is time-sensitive and must clear the moment a session goes idle (I-187).
   * Keyed by session id (owner_session for WI cards, the session's own id for
   * session-only cards).
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

// Tab-local imports retained for the doc-comment type references above.
// ReattachDecision is TYPE-ONLY from the sealed transitions module (the write
// path is SEALED under dsh — promoteDecisions is structurally always {} — but
// the BoardState shape keeps its field, and a type-only import erases at
// bundle time, so the sealed module never ships).
import type { ReattachDecision } from "../../src/lib/board-transitions.js"
import type { TodoSubState } from "./todo-types.js"
