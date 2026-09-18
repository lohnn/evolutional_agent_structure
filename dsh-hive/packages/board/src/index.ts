/**
 * @hive/dsh-board — the hive-board work-item store as a dsh Service (B1).
 *
 * Exposes `ctx.board`: the locked, byte-compatible replacement for OpenCode
 * `src/lib/board-store.ts` + `board-invariants.ts` + `board-recency.ts`, over
 * `<directory>/.opencode/board/WI-*.md` — the SAME store the OpenCode plugin
 * reads/writes (dual-run preserved; every SCHEMA.md format rule intact).
 *
 * The three lib modules under `./lib/` are VERBATIM ports of the OpenCode
 * plugin's files (byte-identical sources; only this package wrapper is new):
 *   - lib/board-store.ts       — the single code path for all WI-*.md writes
 *                                (advisory board-wide lock, atomic rename,
 *                                append-only transitions, respec archive)
 *   - lib/board-invariants.ts  — the SCHEMA §3 read-time check (detection
 *                                only, never normalization)
 *   - lib/board-recency.ts     — the shared recency key (banner replaced:
 *                                the browser-bundle constraint was
 *                                viewer-bundle-specific and does not exist
 *                                in the dsh port)
 *
 * B1 registers NO tools (the dream-archive precedent: Phase-1 service only).
 * The 8 `hive_board_*` model-facing tools land in B4, the awaken seam in B5,
 * the dream-complete seam in B6 (see scratch/dsh-migration/
 * dsh-migration-board-plan.md). Per the B-slice ruling (decisions D9/H1):
 * `hive_board_start` never ships; startItem/promoteItem stay module-resident,
 * compiled, tested, uncalled — they arrive with B2's verbatim
 * board-transitions port and gain no dsh caller.
 */

import { Service } from "@deepseek-ai/cordis"
import z from "@deepseek-ai/schemastery"

import {
  boardDir,
  itemPath,
  nextItemId,
  specHash,
  serializeWorkItem,
  parseWorkItem,
  readItem,
  listItems,
  listItemsInDir,
  findItemByOwner,
  findItemReleasing,
  listRevisions,
  readRevision,
  isPlaceholderTitle,
  PLACEHOLDER_TITLE_RE,
  today,
  nowIso,
  type WorkItem,
} from "./lib/board-store.js"
import { computeProblems } from "./lib/board-invariants.js"
import { recencyKey } from "./lib/board-recency.js"
import {
  createIdea,
  bindSession,
  autoRegister,
  pauseItem,
  unpauseItem,
  demoteItem,
  markDoneWithoutDream,
  dreamCompleteBy,
  markItemDoneFromDream,
  respecItem,
  retitleItem,
  editItemTags,
  startItem,
  promoteItem,
  reattachInfo,
  makeDrmPreCompactionCheck,
  TAG_PATTERN,
  expectStringArray,
  expectSubtaskArray,
  sdkSessionClient,
  httpSessionClient,
  type CreateIdeaInit,
  type MarkDoneFromDreamOptions,
  type RespecOptions,
  type BoardSessionClient,
  type SdkLikeClient,
  type StartOptions,
  type ReattachDecision,
  type TransitionOk,
  type TransitionErr,
  type TransitionResult,
} from "./lib/board-transitions.js"
export { makeDrmCompleteCheck, makeDrmArtifacts } from "./lib/drm-read.js"

// Re-export the lib surface — B4's tool registrations and the two seams (B5
// evolution, B6 tools) import through the package root, exactly the way
// @hive/dsh-tools consumes @hive/dsh-dream-archive's exports.
export {
  boardDir,
  itemPath,
  nextItemId,
  specHash,
  serializeWorkItem,
  parseWorkItem,
  readItem,
  listItems,
  listItemsInDir,
  findItemByOwner,
  findItemReleasing,
  listRevisions,
  readRevision,
  isPlaceholderTitle,
  PLACEHOLDER_TITLE_RE,
  today,
  nowIso,
  computeProblems,
  recencyKey,
  // transitions (B2)
  createIdea,
  bindSession,
  autoRegister,
  pauseItem,
  unpauseItem,
  demoteItem,
  markDoneWithoutDream,
  dreamCompleteBy,
  markItemDoneFromDream,
  respecItem,
  retitleItem,
  editItemTags,
  // COMPILED-BUT-UNCALLED on dsh (decisions D9/H1) — module completeness only
  startItem,
  promoteItem,
  reattachInfo,
  // DRM cross-checks (B2; one parser — @hive/dsh-dream-archive)
  makeDrmPreCompactionCheck,
  TAG_PATTERN,
  expectStringArray,
  expectSubtaskArray,
  sdkSessionClient,
  httpSessionClient,
}
export type {
  WorkItem,
  WorkItemStatus,
  WorkItemOrigin,
  WorkItemPriority,
  Subtask,
  SubtaskStatus,
  ItemEdit,
} from "./lib/board-store.js"
export type {
  CreateIdeaInit,
  MarkDoneFromDreamOptions,
  RespecOptions,
  BoardSessionClient,
  SdkLikeClient,
  StartOptions,
  ReattachDecision,
  TransitionOk,
  TransitionErr,
  TransitionResult,
} from "./lib/board-transitions.js"

/**
 * The hive-board Service. `directory` is the PROFILE-LEVEL fixed workspace
 * root (the directory that CONTAINS `.opencode/`) — the same constant every
 * HIVE service pins; sessions JOIN the profile's HIVE, they do not each grow
 * one. Board reads and writes share the root with the awaken ledger
 * (`.opencode/agents/hive-sessions.json`) and the dream archive
 * (`.opencode/dreams/`) by construction.
 */
export class Board extends Service {
  static Config = z.object({
    // Workspace root (the dir containing `.opencode/`). Default: process cwd.
    directory: z.string().default(process.cwd()),
  })

  readonly directory: string

  constructor(ctx: import("@deepseek-ai/cordis").Context, config: { directory: string }) {
    super(ctx, "board")
    this.directory = config.directory
    this.ctx.logger?.info?.("[board] storage module active (0 tools registered)", {
      directory: this.directory,
    })
  }

  // ── read surface (B1; the locked write surface arrives with the
  //    transitions module in B2 — tools wrap these from B4) ──────────────────
  boardDir = () => boardDir(this.directory)
  items = () => listItems(this.directory)
  readItem = (id: string) => readItem(this.directory, id)
  readByOwner = (sessionID: string) => findItemByOwner(this.directory, sessionID)
  readReleasing = (sessionID: string) => findItemReleasing(this.directory, sessionID)
  revisions = (id: string) => listRevisions(this.directory, id)
  readRevision = (id: string, hash: string) => readRevision(this.directory, id, hash)
  problems = (item: WorkItem) => computeProblems(item)
  recency = (item: Parameters<typeof recencyKey>[0]) => recencyKey(item)
}

export default Board
