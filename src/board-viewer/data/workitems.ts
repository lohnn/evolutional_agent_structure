/**
 * Work items — `board/WI-*.md` per SCHEMA v1.0 (§1a/§2/§3).
 *
 * ── Parsing is 100% owner-published ─────────────────────────────────────────
 * All WI file decoding goes through hive-infra's `lib/board-store` export
 * (`parseWorkItem` — the same code path the locked storage module writes
 * with; announced 2026-07-10). The former `wi-fields.ts` stopgap is deleted
 * (I-046/I-148: one owner, one code path). We re-export the owner's types;
 * the only addition is the `problems[]` OVERLAY — SCHEMA §3 invariant
 * violations surfaced visibly (W-030). The overlay is view-side; the RULES are
 * not — since WI-071 they too are the owner's, in `lib/board-invariants`, so
 * the card chip and the plugin's board read tools cannot disagree about
 * legality. This module only decides that the viewer carries the answer on
 * every item.
 *
 * `loadWorkItems(boardDir)` delegates to the owner's `listItemsInDir()`
 * (Q15 delta) — the `/^WI-\d+\.md$/` filename filter has ONE owner again.
 *
 * Vanished WI files are NORMAL (Q15: a pristine session-first placeholder is
 * deleted when hive_board_bind absorbs it — the one sanctioned deletion).
 * This loader is stateless per request: re-list and move on, never an error.
 *
 * READ-ONLY: this module never writes. Writes go through the owner's
 * `lib/board-transitions` exclusively (wired in src/web/transitions.ts).
 */
import {
  listItemsInDir,
  parseWorkItem as storeParseWorkItem,
  type Subtask,
  type TodoMirrorEntry,
  type Transition,
  type WorkItem as StoreWorkItem,
  type WorkItemPriority,
  type WorkItemStatus,
} from "../../lib/board-store"
// SCHEMA §3 invariant checking is defined once, in hive-infra's shared leaf
// module, so the viewer's `⚠ invariant` chip and the plugin's board read tools
// can never disagree about whether an item is in a legal state (WI-071). A
// violation is a FACT about an item, not a policy of a surface — two answers
// would mean one is simply wrong. Contrast `sortForColumn` below, which is
// deliberately NOT shared: column ordering is a policy, and two surfaces
// ordering differently is a legitimate choice.
//
// Computed SERVER-SIDE only: render.ts imports this module in type position
// and reads the `problems` FIELD off an already-normalized item, never the
// function, so nothing of this crosses to the browser but the result. The
// module is written pure, but note it is NOT covered by the bundle-purity
// guard (that guard asserts against the emitted bundle, and this never ships).
import { computeProblems } from "../../lib/board-invariants"
// Recency ordering is defined once, in the browser-safe leaf module recency.ts,
// so every column and the render layer sort by exactly the same rule.
import { recencyKey } from "./recency"

export type { Subtask, TodoMirrorEntry, Transition, WorkItemStatus, WorkItemPriority }

// Lineage helpers live in a browser-safe module (lineage.ts) so the render
// layer can call them without pulling this file's board-store (node/bun I/O).
// Re-exported here to keep the historical import site working.
export { absorbedLineage, lineageSessions } from "./lineage"

/**
 * The owner's WorkItem plus the `problems[]` overlay (SCHEMA §3 invariant
 * violations surfaced visibly — W-030), computed by the owner's shared
 * `lib/board-invariants#computeProblems`.
 *
 * READ IT AS A FLOOR, NOT A VERDICT: an empty `problems[]` means "violates
 * none of the three cheap, purely-local rules that module checks", NOT "this
 * item is schema-clean". SCHEMA §3 declares six invariants; three are
 * unchecked (they need the session map, a second file read, or the whole
 * board) and two of the three checked are weakened forms. No viewer copy may
 * imply otherwise — which is why the absence of the `⚠ invariant` chip is
 * silent rather than an "ok" badge. See the module header for the full gap.
 *
 * `todo_mirror` / `todo_mirror_updated` are the owner's OWN fields again
 * (WI-038 contract restored on board-store, v0.4.38): `todo_mirror:
 * TodoMirrorEntry[]` (additive) + `todo_mirror_updated: string | null`. The
 * owner's parser is old-record-safe — items predating the field (WI-026..037)
 * deserialize to `todo_mirror: []` / `todo_mirror_updated: null` (I-136). We
 * still re-default them defensively in `normalize` below as belt-and-suspenders
 * (I-191): cheap, and it guards against any in-memory record that somehow
 * bypassed the owner's parser. The historical 500 (`item.todo_mirror.length` on
 * an absent field) is thus defended in depth — owner parser AND view boundary.
 */
export type WorkItem = StoreWorkItem & { problems: string[] }

/**
 * Belt-and-suspenders default for the owner's `todo_mirror` field (I-191).
 * The owner's parser already guarantees `todo_mirror: []` for old records
 * (WI-026..037) that predate the field (I-136), so this is defensive-only: it
 * re-asserts array-ness before any downstream `.length`/iteration, guarding the
 * historical 500 (`item.todo_mirror.length` on an absent field) even for an
 * in-memory record that somehow bypassed the owner's parser. Entries are passed
 * through as the owner already typed them — we do NOT re-shape or re-stringify.
 */
function safeTodoMirror(item: StoreWorkItem): TodoMirrorEntry[] {
  return Array.isArray(item.todo_mirror) ? item.todo_mirror : []
}

function safeTodoMirrorUpdated(item: StoreWorkItem): string | null {
  return typeof item.todo_mirror_updated === "string" && item.todo_mirror_updated.length > 0
    ? item.todo_mirror_updated
    : null
}

/**
 * View-normalize an owner-parsed item: overlay invariant `problems[]` and
 * re-default `todo_mirror` / `todo_mirror_updated` defensively. Single boundary
 * (I-136) so every downstream consumer sees a stable shape regardless of the
 * record's age.
 */
function normalize(item: StoreWorkItem): WorkItem {
  return {
    ...item,
    problems: computeProblems(item),
    todo_mirror: safeTodoMirror(item),
    todo_mirror_updated: safeTodoMirrorUpdated(item),
  }
}

/** Owner's parse + view-side normalization (invariants + todo-mirror default). */
export function parseWorkItem(content: string): WorkItem {
  return normalize(storeParseWorkItem(content))
}

/** Owner's listing (filter, skip-unreadable) + view-side normalization overlay. */
export function loadWorkItems(boardDir: string): WorkItem[] {
  return listItemsInDir(boardDir).map(normalize)
}

const PRIORITY_ORDER: Record<WorkItemPriority, number> = { high: 0, medium: 1, low: 2 }

/**
 * Column ordering for the not-yet-owned columns (Backlog / Todo): priority
 * first, then recency, then a deterministic id tiebreak so a genuine tie can
 * never fall through to readdir order (I-191/W-081 — four such tie-groups were
 * live on the real board on 2026-08-03).
 *
 * The recency key is data/recency.ts#recencyKey — the SAME definition the owned
 * columns and the render layer's In-Progress interleave use. Sorting is the one
 * place where a second, subtly-different copy of that rule is most expensive:
 * it produces no error, just a quietly wrong order.
 */
export function sortForColumn(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority]
    const pb = PRIORITY_ORDER[b.priority]
    if (pa !== pb) return pa - pb
    const ka = recencyKey(a)
    const kb = recencyKey(b)
    if (ka !== kb) return kb.localeCompare(ka)
    // Deterministic tiebreak (newest id first) — never insertion order.
    return b.id.localeCompare(a.id)
  })
}


