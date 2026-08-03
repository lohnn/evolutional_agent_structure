/**
 * Live todo sub-state reader + mirror writer (WI-038).
 *
 * ── NODE-ONLY — never import from render.ts (I-192 bundle boundary) ──────────
 * This module does network I/O (raw HTTP to the opencode server) and, for the
 * mirror write, calls the owner's locked-storage edit module (which touches
 * node:fs). It must NEVER be pulled into the browser bundle. render.ts consumes
 * ONLY the pure `TodoSubState` values this produces, off BoardState — it does
 * not import this file. Shared vocabulary lives in the browser-safe
 * data/todo-types.ts.
 *
 * ── Two freshness paths, reconciled (I-187) ─────────────────────────────────
 * A card's todo sub-state has two independent sources:
 *   1. LIVE  — `GET /session/{id}/todo` on the owning session, per request. Fresh
 *      even for sessions created after viewer startup (bridges the mirror gap).
 *   2. MIRROR — `todo_mirror` persisted on the WI record: survives viewer restart
 *      and satisfies the portability invariant (I-144: everything DISPLAYED is
 *      cached in the item's own record; the live read powers freshness, not the
 *      sole content source). OPTIONAL & history-dependent: WI-026..037 predate it
 *      (no key), and the owner's parser normalizes those old records to `[]`
 *      (I-136); we also re-default at our own parse boundary (workitems.ts) as
 *      belt-and-suspenders (I-191). When a live read succeeds we DISPLAY live AND
 *      refresh the mirror (whole-replace, I-190) so the two paths converge. When
 *      the live read fails/absent, we fall back to the persisted mirror
 *      (unknown ≠ empty — W-061). Absent session is "unknown", never orphaning
 *      (SCHEMA §1a portability).
 *
 * ── Mirror write is IDENTITY-FREE (I-179) ───────────────────────────────────
 * We already hold the owning session id from the WI record; refreshing the
 * mirror needs no in-session identity, so it routes through the shared,
 * owner-published, locked-storage edit module (mutateItem → ItemEdit.setTodoMirror),
 * NOT a second writer. The write is a WHOLE-REPLACE of the mirror field (I-190:
 * a cache-mirror of the session's CURRENT todos, not an append log). The
 * `todo_mirror` / `todo_mirror_updated` schema fields and the `setTodoMirror`
 * edit primitive are the PUBLISHED hive-infra contract (board-store, WI-038,
 * restored on plugin v0.4.38).
 */
import { mutateItem, type ItemEdit } from "evolutional-agent-structure/lib/board-store"
import type { BoardConfig } from "../config"
import { asTodoStatus, type TodoItem, type TodoSubState } from "./todo-types"
import type { WorkItem } from "./workitems"

/** Raw SDK/HTTP Todo shape (`GET /session/{id}/todo`). status is a bare string. */
interface RawTodo {
  content?: string
  status?: string
  priority?: string
  id?: string
}

/**
 * Read the persisted mirror off the WI record.
 *
 * `todo_mirror` is an OPTIONAL, history-dependent field: WI-026..037 predate it
 * and carry no key at all. The owner's parser normalizes those old records to
 * `[]` (I-136, additive+nullable so old records break nothing), and we
 * view-normalize to an array again at our parse boundary (workitems.ts
 * `normalize`) — so it is ALWAYS an array here. We STILL guard inline with
 * `Array.isArray` (I-191 defensive idiom, defense-in-depth: never assume
 * presence before `.length`/iteration; the write contract returning does NOT
 * make this redundant — old records on disk forever predate the field). Returns
 * null when there's nothing to fall back to, so callers treat it as "no mirror".
 */
function mirrorOf(item: WorkItem): { todos: TodoItem[]; updatedAt: string | null } | null {
  const entries = Array.isArray(item.todo_mirror) ? item.todo_mirror : []
  if (entries.length === 0) return null
  return {
    todos: entries.map((t) => ({ content: t.content, status: asTodoStatus(t.status) })),
    updatedAt: item.todo_mirror_updated ?? null,
  }
}

/**
 * Live-read a session's TodoWrite list over raw HTTP (Basic auth, username
 * literally "opencode" — Q14, same as httpSessionClient). Returns null on ANY
 * failure (unconfigured backend, network error, non-200, 404 unknown session)
 * — null means "couldn't read live", NOT "empty". The caller falls back to the
 * mirror. Directory-scoped to the workspace root, matching the session client.
 */
async function readLiveTodos(config: BoardConfig, sessionId: string): Promise<TodoItem[] | null> {
  if (!config.opencodeUrl || !config.opencodePassword) return null
  const auth = "Basic " + Buffer.from(`opencode:${config.opencodePassword}`).toString("base64")
  const dirQ = `?directory=${encodeURIComponent(config.workspaceRoot)}`
  const url = `${config.opencodeUrl}/session/${encodeURIComponent(sessionId)}/todo${dirQ}`
  try {
    const res = await fetch(url, { headers: { Authorization: auth } })
    if (!res.ok) return null
    const data = (await res.json()) as RawTodo[]
    if (!Array.isArray(data)) return null
    return data.map((t) => ({ content: String(t.content ?? ""), status: asTodoStatus(t.status) }))
  } catch {
    return null
  }
}

/** Structural equality of two todo lists (content + status, in order) — decides
 * whether a mirror refresh is even needed (avoid a lock+write when unchanged). */
function todosEqual(a: TodoItem[], b: TodoItem[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.content !== b[i]!.content || a[i]!.status !== b[i]!.status) return false
  }
  return true
}

/**
 * Persist the whole-replace todo mirror onto the WI record via the shared
 * locked-storage edit module (identity-free — I-179). Best-effort: any failure
 * (lock contention, write error) is swallowed — the mirror is a durability
 * optimization, never a correctness dependency (I-105/I-113). The LIVE read
 * already drives what the user sees this request.
 *
 * `writesEnabled` gates this to the REAL workspace board only (never fixtures —
 * mutating fixture files would desync view from writes, matching the existing
 * transition write-gate in app.ts / state.ts).
 */
async function refreshMirror(
  config: BoardConfig,
  itemId: string,
  todos: TodoItem[],
): Promise<void> {
  const edit: ItemEdit = {
    setTodoMirror: { todos, at: new Date().toISOString() },
  }
  try {
    await mutateItem(config.workspaceRoot, itemId, edit)
  } catch {
    // Write failed (lock contention, I/O error) — non-fatal (see docstring).
  }
}

/**
 * Resolve the todo sub-state for ONE in-progress item, reconciling live + mirror.
 *
 *  - live read succeeds → display live; refresh the mirror if it drifted (and
 *    writes are enabled). source = "live".
 *  - live read fails/absent → fall back to the persisted mirror. source =
 *    "mirror" (or "none" if there's no mirror either).
 *  - item has no owner_session → nothing to read; use mirror if present.
 */
async function resolveItemTodos(
  config: BoardConfig,
  item: WorkItem,
  writesEnabled: boolean,
): Promise<TodoSubState> {
  const mirror = mirrorOf(item)
  const sessionId = item.owner_session

  let live: TodoItem[] | null = null
  if (sessionId) live = await readLiveTodos(config, sessionId)

  if (live !== null) {
    // Freshest source wins the display. Converge the mirror if it drifted.
    if (writesEnabled && (!mirror || !todosEqual(mirror.todos, live))) {
      await refreshMirror(config, item.id, live)
    }
    return {
      todos: live,
      updatedAt: new Date().toISOString(),
      source: "live",
    }
  }

  // Live unavailable → mirror is the portability-invariant fallback (I-144).
  if (mirror && mirror.todos.length > 0) {
    return { todos: mirror.todos, updatedAt: mirror.updatedAt, source: "mirror" }
  }
  return { todos: [], updatedAt: mirror?.updatedAt ?? null, source: "none" }
}

/**
 * Resolve todo sub-state for every in-progress item, keyed by item id. Called
 * once per board-state assembly. Items are read concurrently (independent HTTP
 * calls). Only in-progress items are read — the sub-state is a WITHIN-column
 * concern (W-030: column position is derived elsewhere, never from todos).
 *
 * Backend unconfigured / no in-progress items ⇒ empty map (each card degrades
 * to its own mirror via resolveItemTodos, or renders nothing).
 */
export async function loadTodoSubStates(
  config: BoardConfig,
  items: WorkItem[],
  writesEnabled: boolean,
): Promise<Record<string, TodoSubState>> {
  const inProgress = items.filter((i) => i.status === "in_progress")
  const entries = await Promise.all(
    inProgress.map(
      async (item) => [item.id, await resolveItemTodos(config, item, writesEnabled)] as const,
    ),
  )
  const out: Record<string, TodoSubState> = {}
  for (const [id, sub] of entries) out[id] = sub
  return out
}
