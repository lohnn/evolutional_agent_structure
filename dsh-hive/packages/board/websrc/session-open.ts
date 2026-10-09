/**
 * session-open.ts — WI-087 (v1) DOM + plugin-ctx wiring for the item
 * drawer's "connected session" affordance. The PURE projection is
 * ../src/lib/session-open.js (bundled + unit-tested from dist); this file is
 * DOM and context only (the hive-state.ts split, mirrored).
 *
 * The open path is IN-APP by design (WI-087 route-model finding): dsh web
 * has no per-session URL, but the client `uiWorkspace` service's
 * openSession(sessionId) is the exact action a sidebar session-row click
 * runs. The services are waited for in the W-090 WAIT form
 * (ctx.inject WAIT — never a load-bearing entity inject; on compositions
 * without them the wait never fires and the affordance degrades to the
 * catalog-less honest row. The board tab itself keeps working either way).
 *
 * Discipline mirrors: React-free at import time (W-044: DOM + textContent
 * only for data-derived strings); html built with DOM APIs (the drawer
 * never string-splices untrusted data); console-clean (open failures land
 * as row notes, never uncaught rejections). Plugin-ctx access is guarded —
 * the plugin ctx is typed loose here, verified live-shape before use.
 */
import {
  resolveItemSessions,
  sessionRowModel,
  type SessionBearerItem,
  type SessionCatalogLike,
} from "../src/lib/session-open.js"

/** The plugin-ctx shape we rely on (guarded — see bindSessionOpen). */
interface PluginCtxLike {
  inject?: (names: string[], fn: (c: unknown) => void) => unknown
  get?: (name: string) => unknown
}

interface UiWorkspaceHandle {
  openSession?: (sessionId: string) => void
}

interface SessionsHandle {
  list?: {
    getSnapshot?: () => SessionCatalogLike
    subscribe?: (fn: () => void) => () => void
  }
}

let uiWorkspace: UiWorkspaceHandle | undefined
let sessions: SessionsHandle | undefined
let wired = false

function readService(ctx: unknown, name: string): unknown {
  if (ctx && typeof ctx === "object") {
    const getter = (ctx as { get?: (n: string) => unknown }).get
    if (typeof getter === "function") {
      try {
        return getter.call(ctx, name)
      } catch {
        /* service absent — stay undefined, honest degradation below */
      }
    }
  }
  return undefined
}

function shapeOk(value: unknown): UiWorkspaceHandle | undefined {
  if (value && typeof value === "object" && typeof (value as UiWorkspaceHandle).openSession === "function") {
    return value as UiWorkspaceHandle
  }
  return undefined
}

function sessionsShapeOk(value: unknown): SessionsHandle | undefined {
  if (value && typeof value === "object") {
    const list = (value as SessionsHandle).list
    if (list && typeof list.getSnapshot === "function") return value as SessionsHandle
  }
  return undefined
}

/**
 * Bind the session-open affordance to the plugin ctx (called once from
 * attachEngine). W-090 WAIT form: the wait simply never fires on
 * compositions that never provide the services — the affordance then
 * renders the honest catalog-less row instead of an open button.
 */
export function bindSessionOpen(pluginCtx: unknown): void {
  if (wired || typeof pluginCtx !== "object" || pluginCtx === null) return
  wired = true
  const ctx = pluginCtx as PluginCtxLike
  if (typeof ctx.inject !== "function") return
  try {
    ctx.inject(["sessions", "uiWorkspace"], (c) => {
      uiWorkspace = shapeOk(readService(c, "uiWorkspace"))
      sessions = sessionsShapeOk(readService(c, "sessions"))
    })
  } catch {
    /* wait registration refused — degrade honestly, never block apply */
  }
}

/** Test/verify seam: the service handles, as resolved so far. */
export function sessionOpenHandles(): { uiWorkspace: boolean; sessions: boolean } {
  return { uiWorkspace: uiWorkspace !== undefined, sessions: sessions !== undefined }
}

function liveCatalog(): SessionCatalogLike | undefined {
  try {
    return sessions?.list?.getSnapshot?.()
  } catch {
    return undefined
  }
}

async function copyText(text: string, note: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
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

/**
 * Build the "connected session" section for the item drawer. Renders ONE
 * row per dsh-shaped session link (owner → group → released → history),
 * each with:
 *   - an Open ↗ button ONLY when the session is in the live catalog AND the
 *     uiWorkspace open flow is available (never a dead affordance);
 *   - the session's REAL human title from the catalog (db 0.2.0 displayTitle),
 *     or the short id + an honest note when absent;
 *   - a running dot fed by the catalog row (visible while it works);
 *   - a copy-id button for every row.
 * Re-renders live while the drawer is open if the catalog changes
 * (subscription prunes itself once the section leaves the DOM).
 */
export function renderSessionSection(
  parent: HTMLElement,
  item: SessionBearerItem,
  onOpened?: () => void,
): void {
  const links = resolveItemSessions(item)
  if (links.length === 0) return // no dsh session, no affordance — not even a heading

  const section = document.createElement("div")
  section.className = "hvb-session-open"
  const head = document.createElement("div")
  head.className = "hvb-section-title"
  head.textContent = "connected session"
  section.appendChild(head)

  const rebuild = (fromSubscription = false): void => {
    // prune stale SUBSCRIPTION rebuilds (the drawer re-rendered or closed) —
    // but the INITIAL build always runs: it happens BEFORE the section is
    // connected (appendChild comes last), so an unconditional isConnected
    // guard here would leave the heading orphaned with zero rows.
    if (fromSubscription && !section.isConnected) return
    const catalog = liveCatalog()
    section.textContent = ""
    section.appendChild(head)
    for (const link of links) {
      const model = sessionRowModel(link.id, catalog)
      // honesty refinement: an absent snapshot WITH a live catalog handle is
      // "still loading" (the early boot race), not "ended" — never lie the
      // first 2 seconds of a fresh page.
      if (!model.known && !catalog && sessions !== undefined) {
        model.note = "session catalog still loading"
      }
      const row = document.createElement("div")
      row.className = "hvb-session-row"

      const role = document.createElement("span")
      role.className = "hvb-session-role mono"
      role.textContent =
        link.role === "owner" ? "owner" : link.role === "group" ? "group" : link.role === "released" ? "released" : "history"
      row.appendChild(role)

      const canOpen = model.known && uiWorkspace !== undefined
      if (canOpen) {
        if (model.running) {
          const dot = document.createElement("span")
          dot.className = "hvb-session-dot"
          dot.title = "running right now (per the live session list)"
          row.appendChild(dot)
        }
        const btn = document.createElement("button")
        btn.type = "button"
        btn.className = "hvb-session-open-btn"
        btn.textContent = "Open ⇢"
        btn.title = `open ${link.id} in the dsh web app (switches the main panel to this session's conversation)`
        btn.addEventListener("click", () => {
          const note = row.querySelector<HTMLElement>(".hvb-session-note")
          try {
            uiWorkspace?.openSession?.(link.id)
            // the main panel switched to the conversation — the drawer did
            // its job; close it so the session is what the user sees.
            onOpened?.()
          } catch (err) {
            if (note) {
              note.textContent = `open failed: ${err instanceof Error ? err.message : String(err)}`
            }
          }
        })
        row.appendChild(btn)
      }

      const title = document.createElement("span")
      title.className = "hvb-session-title"
      title.textContent = model.title
      title.title = link.id // full id always reachable (tooltip — SHADOW-019 rule)
      row.appendChild(title)

      const note = document.createElement("span")
      note.className = "hvb-session-note"
      if (model.note) note.textContent = model.note
      row.appendChild(note)

      const copy = document.createElement("button")
      copy.type = "button"
      copy.className = "hvb-session-copy mono"
      copy.textContent = "⧉"
      copy.title = `copy the full session id (${link.id})`
      copy.addEventListener("click", () => void copyText(link.id, note))
      row.appendChild(copy)

      section.appendChild(row)
    }
    if (links.length > 0 && !sessions) {
      const dim = document.createElement("div")
      dim.className = "hvb-session-note"
      dim.textContent = "session catalog unavailable in this composition — id copy still works"
      section.appendChild(dim)
    }
  }
  rebuild()

  // live re-render while mounted: catalog arrival/updates add the Open
  // affordance (a session still loading when the drawer first painted).
  // Subscription-triggered rebuilds prune themselves once the section leaves
  // the DOM (each drawer re-render replaces the section, so stale listeners
  // self-drop).
  let unsub: (() => void) | undefined
  unsub = sessions?.list?.subscribe?.(() => {
    if (!section.isConnected) {
      try {
        unsub?.()
      } catch {
        /* disposer already gone */
      }
      return
    }
    rebuild(true)
  })

  parent.appendChild(section)
}
