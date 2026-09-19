/**
 * WI-062 SLICE 3B — the read-only item depth view (the drawer).
 *
 * AUTHORED in the ported design language (reuses the palette constants of
 * render.ts's CSS — panel/border/dim/green/amber — but built with DOM APIs and
 * textContent, because it renders RAW MARKDOWN SPECS that must never be
 * string-spliced into HTML). No upstream equivalent: the 4400 viewer opened
 * sessions in the opencode GUI instead; under dsh there is no session surface,
 * so the item detail replaces it.
 *
 * Mechanics:
 *  - data source: GET /api/hive-board/item?id=<WI-id> (the host half's slice-3b
 *    route; read-only, byte-budgeted like readItems — body capped at
 *    ITEM_MAX_BYTES with a truncated flag + full byte count, never silently).
 *  - binding: document-level click delegation on `[data-key^="wi:"]` (the
 *    cards ALREADY carry that key — zero bytes change in the ported kanban
 *    renderer; filter chips / collapse toggles are BUTTONS, never card
 *    ancestors, so no conflict) — bound ONCE, morph-safe (I-219 class:
 *    listeners live on document, never re-bound per render).
 *  - mount: the drawer is a SIBLING of #board-root inside .hvb-root, NEVER
 *    inside the morph root — open state, scroll, and content survive polls
 *    (the same reason the controls live outside; W-034/I-219 class).
 *  - the card "Open ↗" anchors (dead href under dsh: guiBaseUrl is an empty
 *    string, so "?session=…" would soft-navigate the shell away) are
 *    intercepted in the same delegation and fall back to opening THIS drawer
 *    for the same item — no invented session deep-links until dsh exposes the
 *    surface (the session-stub posture of the favicon driver, mirrored here).
 */
import { presentTitle, RAW_TITLE_CHIP } from "./title-pass.js"

export const ITEM_URL = "/api/hive-board/item"
const DRAWER_ID = "hvb-drawer"
const SCRAY_ID = "hvb-drawer-scrim"
const HISTORY_CAP = 50

/** Mirrors readItems' budget discipline: the cap is explicit, never silent. */
export const ITEM_MAX_BYTES = 10_000

export interface ItemPayload {
  ok: boolean
  generated?: string
  id?: string
  missing?: string[]
  truncated?: boolean
  bodyBytes?: number
  item?: {
    id: string
    title: string
    status: string
    priority: string
    owner_session: string | null
    group_id: string | null
    origin: string
    paused: boolean
    spec_hash: string | null
    created: string
    updated: string
    recency: string
    tags: string[]
    artifacts?: string[]
    dream_id?: string | null
    done_without_dream?: boolean
    released_sessions?: string[]
    subtasks?: { content: string; status: string }[]
    todo_mirror?: { content?: string; state?: string; status?: string; [k: string]: unknown }[]
    todo_mirror_updated?: string | null
    transitions?: { at: string; from: string | null; to: string; by: string; session?: string; absorbed?: string; superseded?: string }[]
    problems?: string[]
    body: string
  }
  [k: string]: unknown
}

/** Small time formatter for the drawer (card chrome uses the ported fmtTime). */
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 16).replace("T", " ")
}

// ── shell mounting (outside the morph root) ───────────────────────────────────

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

function ensureDrawer(): HTMLElement {
  let drawer = document.getElementById(DRAWER_ID)
  if (drawer) return drawer
  // BOTH layers anchor to document.body: position:fixed must escape any
  // transformed ancestor (shell panels often carry transform) and must NOT sit
  // inside the morph root.
  drawer = document.createElement("div")
  drawer.id = DRAWER_ID
  drawer.setAttribute("hidden", "")
  drawer.setAttribute("role", "dialog")
  drawer.setAttribute("aria-modal", "false")
  drawer.appendChild(closeBtn())
  const scrim = document.createElement("div")
  scrim.id = SCRAY_ID
  scrim.setAttribute("hidden", "")
  scrim.addEventListener("click", () => closeDrawer())
  document.body.appendChild(scrim)
  document.body.appendChild(drawer)
  return drawer
}

function closeDrawer(): void {
  document.getElementById(DRAWER_ID)?.setAttribute("hidden", "")
  document.getElementById(SCRAY_ID)?.setAttribute("hidden", "")
}

let escBound = false

/** Idempotent global bindings (delegation; Esc; morph-safe). Called once per boot. */
export function bindItemDrawer(): void {
  if (escBound || typeof document === "undefined") return
  escBound = true
  document.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") closeDrawer()
  })
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target
      if (!(t instanceof Element)) return
      // dead session anchors first (see module comment): route them into the
      // drawer for the SAME item instead of soft-navigating the shell away
      const link = t.closest("a.open-link")
      if (link instanceof HTMLAnchorElement) {
        e.preventDefault()
        const card = link.closest('[data-key^="wi:"]')
        const key = card?.getAttribute("data-key")
        if (key) void openDrawer(key.slice(3))
        return
      }
      const card = t.closest('[data-key^="wi:"]') as HTMLElement | null
      if (!card) return
      if (t.closest("a,button,input,textarea,select,form")) return
      const key = card.getAttribute("data-key") ?? ""
      const id = key.slice("wi:".length)
      if (id) void openDrawer(id)
    },
    false,
  )
}

// ── open + render ─────────────────────────────────────────────────────────────

function closeBtn(): HTMLButtonElement {
  const btn = el("button", "hvb-drawer-close", "×") as HTMLButtonElement
  btn.type = "button"
  btn.title = "close the item detail (Esc works too)"
  btn.addEventListener("click", closeDrawer)
  return btn
}

export async function openDrawer(id: string): Promise<void> {
  const drawer = ensureDrawer()
  drawer.textContent = ""
  drawer.appendChild(closeBtn())
  const head = el("div", "hvb-drawer-head mono")
  head.appendChild(el("span", "hvb-wi-id", id))
  head.appendChild(el("span", "meta", "loading…"))
  drawer.appendChild(head)
  document.getElementById(SCRAY_ID)?.removeAttribute("hidden")
  drawer.removeAttribute("hidden")
  try {
    const res = await fetch(`${ITEM_URL}?id=${encodeURIComponent(id)}`, { headers: { accept: "application/json" } })
    if (!res.ok) {
      renderNotFound(drawer, id, `HTTP ${res.status}`)
      return
    }
    const payload = (await res.json()) as ItemPayload
    if (!payload || payload.ok !== true || !payload.item) {
      renderNotFound(drawer, id, payload?.missing?.join(", ") ?? "unknown reason")
      return
    }
    renderItem(drawer, payload.item, payload)
  } catch (err) {
    renderNotFound(drawer, id, err instanceof Error ? err.message : String(err))
  }
}

function renderNotFound(drawer: HTMLElement, id: string, reason: string): void {
  const body = el("div", "hvb-drawer-body")
  body.appendChild(
    el("div", "meta", `${id} is not on the board (${reason}). It may have been dissolved or the board moved — hit the 15 s lane refresh and retry. Nothing was written; nothing was assumed.`),
  )
  drawer.appendChild(body)
}

function chipRow(item: NonNullable<ItemPayload["item"]>): HTMLElement {
  const row = el("div", "hvb-chip-row")
  const chips: [string, string][] = [
    [item.status, `hvb-chip status-${item.status}`],
    [item.priority, `hvb-chip prio-${item.priority}`],
    ...(item.paused ? ([["paused", "hvb-chip status-paused"]] as [string, string][]) : []),
  ]
  for (const [text, cls] of chips) {
    row.appendChild(el("span", cls, text))
  }
  return row
}

function faceLine(label: string, value: string | null | undefined): HTMLElement {
  const row = el("div", "hvb-face-row")
  row.appendChild(el("span", "mono dim", label))
  row.appendChild(el("span", "mono", value && value.length ? value : "—"))
  return row
}

function sectionTitle(text: string): HTMLElement {
  return el("div", "hvb-section-title", text)
}

function renderItem(drawer: HTMLElement, item: NonNullable<ItemPayload["item"]>, payload: ItemPayload): void {
  drawer.textContent = ""
  drawer.appendChild(closeBtn())

  const presented = presentTitle(item.title)
  const head = el("div", "hvb-drawer-head")
  const titleRow = el("div", "hvb-drawer-title-row")
  const title = el("h3", "hvb-drawer-title", presented.display)
  title.title = presented.raw // full raw text always reachable (SHADOW-019 rule)
  titleRow.appendChild(title)
  if (presented.raw_) {
    const chipWrap = document.createElement("span")
    chipWrap.innerHTML = RAW_TITLE_CHIP // static authored markup — trusted constant
    titleRow.appendChild(chipWrap.firstChild as HTMLElement)
  }
  head.appendChild(titleRow)
  head.appendChild(chipRow(item))
  drawer.appendChild(head)

  const meta = el("div", "hvb-face mono")
  meta.appendChild(faceLine("id", item.id))
  meta.appendChild(faceLine("owner", item.owner_session))
  meta.appendChild(faceLine("group", item.group_id))
  meta.appendChild(faceLine("origin", item.origin))
  meta.appendChild(faceLine("created", fmtTime(item.created)))
  meta.appendChild(faceLine("updated", fmtTime(item.updated)))
  meta.appendChild(faceLine("recency", item.recency))
  meta.appendChild(faceLine("spec", item.spec_hash))
  if (item.released_sessions && item.released_sessions.length > 0) {
    meta.appendChild(faceLine("released", item.released_sessions.join(", ")))
  }
  if (item.dream_id) meta.appendChild(faceLine("dream", item.dream_id))
  drawer.appendChild(meta)

  const problems = item.problems ?? []
  if (problems.length > 0) {
    const prow = el("div", "hvb-problems")
    prow.appendChild(sectionTitle("⚠ invariant problems (detection only — SCHEMA §3, WI-071)"))
    for (const problem of problems) prow.appendChild(el("div", "hvb-problem mono", problem))
    drawer.appendChild(prow)
  }

  if (item.subtasks && item.subtasks.length > 0) {
    const srow = el("div", "hvb-subtasks")
    srow.appendChild(sectionTitle(`subtasks (${item.subtasks.filter((s) => s.status === "completed").length}/${item.subtasks.length})`))
    for (const sub of item.subtasks) {
      const row = el("div", "hvb-subtask-row")
      row.appendChild(el("span", "mono hvb-subtask-icon", sub.status === "completed" ? "☑" : sub.status === "in_progress" ? "▸" : sub.status === "cancelled" ? "✕" : "○"))
      row.appendChild(el("span", undefined, sub.content))
      srow.appendChild(row)
    }
    drawer.appendChild(srow)
  }

  const mirror = item.todo_mirror ?? []
  if (mirror.length > 0) {
    const mrow = el("div", "hvb-mirror")
    mrow.appendChild(sectionTitle(`todo mirror (${mirror.length}${item.todo_mirror_updated ? ` · updated ${fmtTime(item.todo_mirror_updated)}` : ""})`))
    for (const entry of mirror) {
      const row = el("div", "hvb-mirror-row")
      const state = String(entry.state ?? entry.status ?? "")
      row.appendChild(el("span", "mono hvb-subtask-icon", state === "completed" ? "☑" : state === "in_progress" ? "▸" : "○"))
      row.appendChild(el("span", undefined, typeof entry.content === "string" ? entry.content : JSON.stringify(entry)))
      mrow.appendChild(row)
    }
    drawer.appendChild(mrow)
  }

  const transitions = item.transitions ?? []
  if (transitions.length > 0) {
    const trow = el("div", "hvb-history")
    trow.appendChild(sectionTitle(`history (${transitions.length})`))
    // chronological (oldest first — file order, the tool's order)
    const shown = transitions.slice(0, HISTORY_CAP)
    for (const t of shown) {
      const row = el("div", "hvb-history-row mono")
      const arrow = t.absorbed
        ? `${t.from ?? "∅"} ⇢ ${t.to} (absorbed ${t.absorbed})`
        : `${t.from ?? "∅"} ⇢ ${t.to}`
      row.appendChild(el("span", "meta", fmtTime(t.at)))
      row.appendChild(el("span", undefined, arrow))
      row.appendChild(el("span", "meta", t.by + (t.session ? ` · ${t.session}` : "") + (t.superseded ? ` · spec ${t.superseded} superseded` : "")))
      trow.appendChild(row)
    }
    if (transitions.length > shown.length) {
      trow.appendChild(
        el("div", "meta", `+ ${transitions.length - shown.length} older transitions not shown (drawer cap ${HISTORY_CAP} — nothing dropped from the record; the board file keeps them all)`),
      )
    }
    drawer.appendChild(trow)
  }

  const spec = el("div", "hvb-spec")
  spec.appendChild(sectionTitle("spec"))
  const pre = el("pre", "mono hvb-spec-body", item.body)
  pre.setAttribute("tabindex", "0")
  spec.appendChild(pre)
  if (payload.truncated) {
    spec.appendChild(el("div", "meta", `spec truncated for display at ${ITEM_MAX_BYTES} chars (full spec is ${payload.bodyBytes ?? "?"} chars — served from the board file; this is a DISPLAY cap, the file is untouched)`))
  }
  drawer.appendChild(spec)

  drawer.appendChild(el("div", "meta hvb-drawer-foot", "read-only depth view — the board's write path stays sealed behind the hive_board_* tools (WI-062)"))
}

/** Authored drawer styles — the ported palette tokens, drawer chrome around them. */
export const DRAWER_CSS = `
/* ── item drawer (WI-062 slice 3b; authored — reuse of the ported palette) ── */
#hvb-drawer-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9990}
#hvb-drawer{position:fixed;top:0;right:0;height:100vh;width:min(560px,94vw);background:#161b22;border-left:1px solid #30363d;z-index:9991;overflow-y:auto;box-sizing:border-box;padding:14px 16px 28px;font-size:12.5px;line-height:1.45;color:#e6edf3}
#hvb-drawer .hvb-drawer-close{position:sticky;top:0;float:right;background:#21262d;color:#8b949e;border:1px solid #30363d;border-radius:6px;width:26px;height:26px;font-size:15px;cursor:pointer;z-index:2}
#hvb-drawer .hvb-drawer-close:hover{color:#e6edf3}
#hvb-drawer .hvb-drawer-id,.hvb-wi-id{color:#3fb950;font-weight:600}
#hvb-drawer .hvb-drawer-head{margin:2px 0 10px}
#hvb-drawer .hvb-drawer-title-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
#hvb-drawer .hvb-drawer-title{margin:0;font-size:14.5px;overflow-wrap:anywhere}
#hvb-drawer .raw-title-chip{color:#d29922;font-size:11px;border:1px solid #30363d;border-radius:8px;padding:0 6px}
#hvb-drawer .hvb-chip-row{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
#hvb-drawer .hvb-chip{border:1px solid #30363d;border-radius:8px;padding:0 8px;font-size:11px;color:#8b949e}
#hvb-drawer .hvb-chip.status-in_progress{color:#3fb950;border-color:#3fb950}
#hvb-drawer .hvb-chip.prio-high{color:#f85149;border-color:#f85149}
#hvb-drawer .hvb-chip.status-paused{color:#d29922;border-color:#d29922}
#hvb-drawer .hvb-face{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:10px 0;padding:8px 10px;background:#0d1117;border:1px solid #21262d;border-radius:8px}
#hvb-drawer .hvb-face .dim{color:#8b949e}
#hvb-drawer .hvb-section-title{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8b949e;margin:14px 0 4px}
#hvb-drawer .hvb-problem{color:#d29922;margin:2px 0;overflow-wrap:anywhere}
#hvb-drawer .hvb-subtask-row,#hvb-drawer .hvb-mirror-row,#hvb-drawer .hvb-history-row{display:flex;gap:8px;margin:2px 0;align-items:baseline}
#hvb-drawer .hvb-subtask-icon{color:#8b949e}
#hvb-drawer .hvb-history-row{overflow-wrap:anywhere}
#hvb-drawer .hvb-spec-body{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:10px;margin:4px 0 8px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:46vh;overflow-y:auto;font-size:11.5px}
#hvb-drawer .hvb-drawer-foot{margin-top:14px}
#hvb-drawer .meta,#hvb-drawer .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
#hvb-drawer .meta{color:#8b949e;font-size:11px}
`
