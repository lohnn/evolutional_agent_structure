/**
 * Viewer write path (Q6 option c) — board-side transitions as POST endpoints.
 *
 * Every mutation calls hive-infra's `lib/board-transitions` module directly —
 * the shared, owner-published code path over the locked storage layer
 * (SCHEMA §4a). The viewer NEVER calls `bindSession`/`autoRegister` (they
 * need in-session identity — W-009/I-148 partition) and never touches the
 * board-store write primitives.
 *
 * Endpoints (form-encoded POST, server-rendered results — zero-JS):
 *   POST /transitions/create              title, status(backlog|todo), priority, tags, body
 *   POST /transitions/pause               id
 *   POST /transitions/unpause             id
 *   POST /transitions/demote              id, to(todo|backlog)
 *   POST /transitions/done-without-dream  id
 *
 * Refusal UX: TransitionErr renders an honest error page with the
 * machine-readable `reason` code + the owner's `detail` text (which carries
 * hints like demote-first for SESSION_OWNS_OTHER). A thrown
 * BOARD_LOCK_TIMEOUT renders a page with a Retry form that re-POSTs the
 * exact same request (the lock is advisory with a 5s acquire window —
 * contention is retryable, never a silent failure).
 */
import {
  createIdea,
  demoteItem,
  markDoneWithoutDream,
  pauseItem,
  promoteItem,
  startItem,
  unpauseItem,
  type BoardSessionClient,
  type TransitionResult,
} from "evolutional-agent-structure/lib/board-transitions"
import { readItem } from "evolutional-agent-structure/lib/board-store"
import type { BoardConfig } from "../config"
import { addNotice } from "./notices"

/** The runtime FormData type as Request.formData() actually returns it. */
type Form = Awaited<ReturnType<Request["formData"]>>
import { renderMessagePage } from "./render"

const VALID_CREATE_STATUS = new Set(["backlog", "todo"])
const VALID_PRIORITY = new Set(["low", "medium", "high"])
const VALID_DEMOTE_TO = new Set(["todo", "backlog"])

function field(form: Form, name: string): string {
  const v = form.get(name)
  return typeof v === "string" ? v.trim() : ""
}

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location } })
}

function refusalPage(action: string, result: { reason: string; detail: string }): Response {
  return new Response(
    renderMessagePage("Transition refused", [
      `<p><strong>${action}</strong> was refused by the transition module:</p>`,
      `<p class="mono refusal-code">${result.reason}</p>`,
      `<p>${result.detail}</p>`,
      `<p><a href="/">← back to the board</a></p>`,
    ]),
    { status: 409, headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

/** Transient-failure page with a Retry form that re-POSTs the same request. */
function retryablePage(title: string, action: string, retryAction: string, form: Form, explanation: string): Response {
  const hidden = [...form.entries()]
    .filter((e): e is [string, string] => typeof e[1] === "string")
    .map(([k, v]) => `<input type="hidden" name="${escapeAttr(k)}" value="${escapeAttr(v)}">`)
    .join("")
  return new Response(
    renderMessagePage(title, [
      `<p><strong>${action}</strong>: ${explanation}</p>`,
      `<form method="post" action="${escapeAttr(retryAction)}">${hidden}<button type="submit">Retry</button></form>`,
      `<p><a href="/">← back to the board</a></p>`,
    ]),
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

function badRequest(msg: string): Response {
  return new Response(
    renderMessagePage("Invalid request", [`<p>${msg}</p>`, `<p><a href="/">← back to the board</a></p>`]),
    { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

function escapeAttr(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
}

function isLockTimeout(err: unknown): boolean {
  return String(err).includes("BOARD_LOCK_TIMEOUT")
}

const UNCONFIGURED_MSG = "SESSION_BACKEND_UNCONFIGURED"

/**
 * Stand-in client when no opencode server is configured. Reattach promotes
 * never touch the client (invariant 4 — test-proven owner-side), so they
 * still work; anything session-creating throws and is rendered honestly.
 */
export const unconfiguredSessionClient: BoardSessionClient = {
  createSession(): Promise<string> {
    return Promise.reject(new Error(UNCONFIGURED_MSG))
  },
  command(): Promise<void> {
    return Promise.reject(new Error(UNCONFIGURED_MSG))
  },
}

function unconfiguredPage(): Response {
  return new Response(
    renderMessagePage("Session backend not configured", [
      "<p>Starting an item creates a real opencode session, but no opencode server is configured.</p>",
      "<p>Set <span class='mono'>--opencode-url</span> / <span class='mono'>HIVE_BOARD_OPENCODE_URL</span> ",
      "(and <span class='mono'>OPENCODE_SERVER_PASSWORD</span>), then restart the viewer. ",
      "Re-attach and file-only transitions work without it.</p>",
      '<p><a href="/">← back to the board</a></p>',
    ]),
    { status: 409, headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

function awakenErrorHandler(dir: string, id: string) {
  return (err: unknown) => {
    // Owner is on disk BEFORE the awaken command fires (owner's ordering
    // guarantee, §5.3c) — so the item names the created session reliably.
    const owner = readItem(dir, id)?.owner_session
    addNotice(
      `${id}: session${owner ? ` ${owner}` : ""} was created and owns the item, but the fire-and-forget /awaken failed (${String(err)}). Open the session and run /awaken manually.`,
    )
  }
}

/**
 * Handle a POST /transitions/* request. Returns null when the path doesn't
 * match. `writesEnabled` is false when the board dir is overridden away from
 * the workspace's real .opencode/board (fixture mode) — the transition module
 * always writes to the WORKSPACE board, so mutating from fixture mode would
 * desync what you see from what you change.
 */
export async function handleTransitionRoute(
  pathname: string,
  req: Request,
  config: BoardConfig,
  writesEnabled: boolean,
  sessionClient: BoardSessionClient | null,
): Promise<Response | null> {
  if (!pathname.startsWith("/transitions/")) return null
  if (req.method !== "POST") return badRequest("Transitions are POST-only.")
  if (!writesEnabled) {
    return new Response(
      renderMessagePage("Writes disabled", [
        "<p>This viewer instance renders a non-default board directory (fixture mode); ",
        "the transition module writes only to the workspace's real board. Writes are disabled.</p>",
        '<p><a href="/">← back to the board</a></p>',
      ]),
      { status: 409, headers: { "content-type": "text/html; charset=utf-8" } },
    )
  }

  const action = pathname.slice("/transitions/".length)
  const form = await req.formData()
  const dir = config.workspaceRoot
  const id = field(form, "id")

  try {
    let result: TransitionResult
    switch (action) {
      case "create": {
        const title = field(form, "title")
        if (title === "") return badRequest("A title is required to create an item.")
        const status = field(form, "status") || "backlog"
        if (!VALID_CREATE_STATUS.has(status)) return badRequest(`Invalid create status "${status}".`)
        const priority = field(form, "priority") || "medium"
        if (!VALID_PRIORITY.has(priority)) return badRequest(`Invalid priority "${priority}".`)
        const tags = field(form, "tags")
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t !== "")
        result = await createIdea(dir, {
          title,
          status: status as "backlog" | "todo",
          priority: priority as "low" | "medium" | "high",
          tags,
          body: field(form, "body"),
          by: "board:create",
        })
        break
      }
      case "pause":
        if (!id) return badRequest("Missing item id.")
        result = await pauseItem(dir, id, "board:pause")
        break
      case "unpause":
        if (!id) return badRequest("Missing item id.")
        result = await unpauseItem(dir, id, "board:unpause")
        break
      case "demote": {
        if (!id) return badRequest("Missing item id.")
        const to = field(form, "to") || "todo"
        if (!VALID_DEMOTE_TO.has(to)) return badRequest(`Invalid demote target "${to}".`)
        result = await demoteItem(dir, id, to as "todo" | "backlog", "board:demote")
        break
      }
      case "done-without-dream":
        if (!id) return badRequest("Missing item id.")
        result = await markDoneWithoutDream(dir, id, "board:done-without-dream")
        break
      case "start": {
        // DESIGN §5.3 path c: fresh top-level session + bind + awaken-on-create.
        if (!id) return badRequest("Missing item id.")
        if (!sessionClient) return unconfiguredPage()
        result = await startItem(dir, id, sessionClient, {
          by: "board:start",
          // waitForAwaken stays FALSE (owner default): the awaken turn can
          // take minutes — respond as soon as ownership is stamped.
          onAwakenError: awakenErrorHandler(dir, id),
        })
        break
      }
      case "promote": {
        // Executes the owner's reattachInfo decision: fresh → startItem
        // (awaken-on-create); reattach/reopen → re-stamp the ORIGINAL session,
        // never createSession, never /awaken (invariant 4).
        if (!id) return badRequest("Missing item id.")
        result = await promoteItem(dir, id, sessionClient ?? unconfiguredSessionClient, {
          onAwakenError: awakenErrorHandler(dir, id),
        })
        break
      }
      default:
        return badRequest(`Unknown transition "${action}".`)
    }

    return transitionResponse(action, pathname, form, result)
  } catch (err) {
    if (isLockTimeout(err)) {
      return retryablePage(
        "Board busy",
        action,
        pathname,
        form,
        "could not acquire the board lock (another writer is active). This is transient — retry is safe.",
      )
    }
    if (String(err).includes(UNCONFIGURED_MSG)) return unconfiguredPage()
    throw err
  }
}

/**
 * Route a TransitionResult to a response. Exported for tests.
 * CONFLICT (Q16: a concurrent writer won the race mid-promote; the item is
 * safely in todo at worst, never stuck done) is RETRYABLE — it gets the same
 * retry-form UX as a lock timeout, not a dead-end refusal.
 */
export function transitionResponse(
  action: string,
  pathname: string,
  form: Form,
  result: TransitionResult,
): Response {
  if (result.ok) return seeOther("/")
  if (result.reason === "CONFLICT") {
    return retryablePage("Concurrent change", action, pathname, form, `${result.detail} Retry is safe.`)
  }
  return refusalPage(action, result)
}
