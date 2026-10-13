/**
 * awaken.ts — WI-064 final push: the item drawer's "awaken a new session"
 * affordance (DOM only; the wired route lives in src/lib/awaken-route.js).
 *
 * Semantics (the shipped landing of the verified spike): POST
 * /api/hive-board/awaken {itemId, hint} creates a REAL top-level dsh session
 * through the same typert machinery the browser's "new chat" uses, then runs
 * the deployment's /awaken flip (registry + doctrine + board auto-register).
 * The route is host-OPT-IN (`awaken: true` on the board row) — when the
 * composition doesn't enable it, the POST answers 404 not-found (no route)
 * and this section says exactly that: honest degradation, no dead buttons.
 *
 * Pattern discipline (mirrored from session-open.ts, WI-087): DOM APIs +
 * textContent only for data-derived strings (the response texts are host
 * messages but still NEVER string-spliced into HTML); one button, disabled
 * while in flight (no double-awaken); typed errors surfaced verbatim (W-049)
 * with the "nothing was created" framing the route guarantees; success keeps
 * the drawer open showing the new session id with an Open ⇢ (the WI-087
 * uiWorkspace flow) and a copy-id button — the session also appears in the
 * sidebar list via the api-session/added broadcast.
 *
 * The section renders ONLY for items with no connected dsh session that are
 * not done and not paused (awakening a tombstone is a lie). The 15 s poll
 * never touches the drawer (sibling of the morph root), so in-flight state
 * cannot be clobbered by a re-render.
 */
import { resolveItemSessions, type SessionBearerItem } from "../src/lib/session-open.js"
import { openFlowAvailable, tryOpenSession } from "./session-open.js"

export const AWAKEN_URL = "/api/hive-board/awaken"

/** Item-shape slice for the gating decision (mirror of the drawer payload). */
interface AwakenableItem {
  id: string
  title: string
  status?: string
  paused?: boolean
  owner_session?: string | null
  group_id?: string | null
  released_sessions?: string[]
  [k: string]: unknown
}

interface AwakenOkResponse {
  ok: true
  sessionId: string
  preset?: string | null
  item?: { id: string; title: string } | null
  awakened: { commanded: boolean; ok: boolean; text: string }
  planted?: { requested: boolean; ok: boolean; error?: string }
}

interface AwakenErrResponse {
  ok: false
  error: string
  code?: string
}

async function copySessionId(sessionId: string, note: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(sessionId)
    note.textContent = "session id copied"
    note.setAttribute("data-flash", "1")
  } catch {
    note.textContent = "copy failed — select the id text above"
  }
  window.setTimeout(() => {
    note.textContent = ""
    note.removeAttribute("data-flash")
  }, 2500)
}

function shortId(sessionId: string): string {
  const tail = sessionId.startsWith("session-") ? sessionId.slice(8) : sessionId
  return `session-${tail.slice(0, 8)}…`
}

/**
 * Build the awaken section for the item drawer — or render nothing when the
 * item cannot honestly offer it (connected session present, done, or paused).
 */
export function renderAwakenSection(parent: HTMLElement, rawItem: AwakenableItem, onOpened?: () => void): void {
  // Gate: only items without ANY dsh-shaped session link, not done, not paused.
  if (resolveItemSessions(rawItem as SessionBearerItem).length > 0) return
  if ((rawItem.status ?? "") === "done") return
  if (rawItem.paused === true) return

  const section = document.createElement("div")
  section.className = "hvb-session-open"

  const head = document.createElement("div")
  head.className = "hvb-section-title"
  head.textContent = "awaken a new session"
  section.appendChild(head)

  const row = document.createElement("div")
  row.className = "hvb-session-row"

  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = "hvb-session-open-btn"
  btn.textContent = "Awaken ⚑"
  btn.title =
    `create a REAL dsh session for ${rawItem.id} and run the /awaken flip ` +
    `(host backend must compose board awaken:true; the session starts in this workspace with this item named in its brief)`

  const note = document.createElement("span")
  note.className = "hvb-session-note"
  note.textContent = "creates a new top-level session owned by this item's brief"

  let inFlight = false
  btn.addEventListener("click", () => {
    if (inFlight) return
    inFlight = true
    btn.setAttribute("disabled", "1")
    note.textContent = "awakening — creating the session and running the /awaken flip…"
    const payload = JSON.stringify({ itemId: rawItem.id, hint: rawItem.title })
    void fetch(AWAKEN_URL, { method: "POST", headers: { "content-type": "application/json" }, body: payload })
      .then(async (res) => {
        let body: (AwakenOkResponse | AwakenErrResponse) | null = null
        try {
          body = (await res.json()) as AwakenOkResponse | AwakenErrResponse
        } catch {
          body = null
        }
        if (body === null) {
          note.textContent = `awaken failed: non-JSON response (HTTP ${res.status}) — check the host log; nothing was assumed`
          return
        }
        renderOutcome(body)
      })
      .catch((err) => {
        note.textContent = `awaken failed: ${err instanceof Error ? err.message : String(err)} — the route is unreachable from this surface; is the board served by the dsh host? Nothing was assumed`
      })
      .finally(() => {
        inFlight = false
        btn.removeAttribute("disabled")
      })
  })

  // Outcome renderer: replaces the row content (the button stays for retry on
  // failure; success swaps it for Open/copy affordances on the new session).
  const renderOutcome = (body: AwakenOkResponse | AwakenErrResponse): void => {
    row.textContent = ""
    if (body.ok !== true) {
      row.appendChild(btn)
      const codeHint = body.code ? `${body.code}: ` : ""
      note.textContent = `${codeHint}${body.error}`
      row.appendChild(note)
      return
    }
    const created = document.createElement("span")
    created.className = "hvb-session-role mono"
    created.textContent = "created"
    row.appendChild(created)

    const canOpen = body.awakened.ok === true && openFlowAvailable()
    if (canOpen) {
      const open = document.createElement("button")
      open.type = "button"
      open.className = "hvb-session-open-btn"
      open.textContent = "Open ⇢"
      open.title = `open ${body.sessionId} in the dsh web app (switches the main panel to this session's conversation)`
      open.addEventListener("click", () => {
        tryOpenSession(body.sessionId)
        onOpened?.()
      })
      row.appendChild(open)
    }

    const id = document.createElement("span")
    id.className = "hvb-session-title"
    id.textContent = shortId(body.sessionId)
    id.title = body.sessionId
    row.appendChild(id)

    const copy = document.createElement("button")
    copy.type = "button"
    copy.className = "hvb-session-copy mono"
    copy.textContent = "⧉"
    copy.title = `copy the full session id (${body.sessionId})`
    copy.addEventListener("click", () => void copySessionId(body.sessionId, note))
    row.appendChild(copy)

    const outcome = document.createElement("span")
    outcome.className = "hvb-session-note"
    // The flip outcome names the auto-registered work item (W-049); clipped —
    // the board record carries the full text.
    const outcomeText = body.awakened.ok ? body.awakened.text : `flip issue — ${body.awakened.text}`
    outcome.textContent = outcomeText.length > 160 ? `${outcomeText.slice(0, 160)}…` : outcomeText
    row.appendChild(outcome)
  }

  row.appendChild(btn)
  row.appendChild(note)
  section.appendChild(row)
  parent.appendChild(section)
}
