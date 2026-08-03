/**
 * Todo sub-state types — the finer-grained progress WITHIN an In-Progress card
 * (WI-038). The owning coordinator session's live TodoWrite list, mirrored onto
 * the work-item record so it survives a viewer restart (I-144 portability).
 *
 * ── Browser-safe by design (I-192) ──────────────────────────────────────────
 * render.ts is bundled for the browser and CANNOT transitively touch node:fs
 * (board-store). This module is pure types + pure functions ONLY — it is the
 * shared vocabulary imported by BOTH the server-side live-reader (data/todos.ts,
 * node-only) and the browser-side renderer (web/render.ts). Keep it free of any
 * fs / SDK / board-store import forever.
 */

/** A single TodoWrite entry, as the board displays it. Mirrors the SDK `Todo`
 * shape (content + status) minus the fields the board doesn't render. */
export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled"

export interface TodoItem {
  content: string
  status: TodoStatus
}

/**
 * The todo sub-state a card renders. Sourced two ways that reconcile to the
 * SAME shape (I-187: two freshness paths — live per-request vs the persisted
 * mirror). `source` records which won so the UI can be honest about freshness.
 */
export interface TodoSubState {
  todos: TodoItem[]
  /** Full-precision ISO of when this snapshot was captured (I-191/W-081:
   * never a date-only key — coarse keys silently collapse to insertion order). */
  updatedAt: string | null
  /**
   * Which path produced these todos:
   *  - "live"    → fresh per-request read of the owning session (freshest);
   *  - "mirror"  → the item's persisted todo_mirror (survives restart, may lag);
   *  - "none"    → no todos anywhere (session has none, or unreachable + no mirror).
   */
  source: "live" | "mirror" | "none"
}

const STATUSES: TodoStatus[] = ["pending", "in_progress", "completed", "cancelled"]

/** Coerce an arbitrary status string to a known TodoStatus (defensive — the
 * SDK types status as a bare `string`). Unknown ⇒ "pending". */
export function asTodoStatus(v: string | undefined | null): TodoStatus {
  return STATUSES.includes(v as TodoStatus) ? (v as TodoStatus) : "pending"
}

export interface TodoSummary {
  total: number
  completed: number
  inProgress: number
  pending: number
  cancelled: number
  /** The text of the first in-progress todo (the "current activity"), if any. */
  current: string | null
}

/**
 * Summarize a todo list into the counts + current-activity the card shows.
 * Pure — safe on both sides of the bundle boundary. Cancelled items are counted
 * but excluded from the done/total ratio's denominator is a rendering choice
 * left to the caller; this returns raw counts.
 */
export function summarizeTodos(todos: TodoItem[]): TodoSummary {
  let completed = 0
  let inProgress = 0
  let pending = 0
  let cancelled = 0
  let current: string | null = null
  for (const t of todos) {
    switch (t.status) {
      case "completed":
        completed++
        break
      case "in_progress":
        inProgress++
        if (current === null) current = t.content
        break
      case "pending":
        pending++
        break
      case "cancelled":
        cancelled++
        break
    }
  }
  return { total: todos.length, completed, inProgress, pending, cancelled, current }
}
