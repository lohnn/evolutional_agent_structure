/**
 * WI-083 — HIVE-state overlay (client half): a timeline of the SELECTED
 * session's HIVE facts, rendered INTO the live web composer dock.
 *
 * Data contract (all real, read-only — no mocks):
 *   - Host route: GET /api/hive-state/session?id=<sessionId> (shipped in
 *     @hive/dsh-evolution; awaken ledger + usage marks + dream telemetry +
 *     ambient dreams + lastTick, plus LIVE goal/agent facts). Until the host
 *     half's route is live (next dsh-web bounce), the poll fails and the pill
 *     says so honestly — it never invents rows.
 *   - SELECTED session: the dock occupant is a `session`-scope standard-prop
 *     consumer — the framework hands `sessionId` and re-mounts on selection
 *     change (the conversation renders the dock only while a session is
 *     bound; conversation.composer.dock is list-kind, session-scope — the
 *     chat package's StatsPills precedent).
 *   - LIVE session facts: the global `useSessions` standard hook (ui-session's
 *     root provision) gives the selected row's running state, title, and the
 *     children list — re-rendered live by the page's session store.
 *
 * Disciplines honored:
 *   - React-free at import time (W-044): the wrapper passes the runtime
 *     module-table React into the factory; this module is DOM + textContent
 *     only for any data-derived string.
 *   - Theme tokens only (--dsw-alias-*), light/dark consistent by
 *     construction (the theme package restyles both modes).
 *   - The expanded panel portals to document.body (the item-drawer 3B
 *     posture: fixed positioning anchored OUT of transformed panel
 *     ancestors), so the composer's overflow can never clip it.
 *   - Console-clean: fetch failures degrade to pill text, never uncaught
 *     rejections.
 *
 * The pure projection logic (buildTimeline / childrenInFlight / pillState /
 * time stamps) lives in ../src/lib/hive-state-view.ts — bundled here AND
 * unit-tested from dist. This file is DOM + wiring only.
 */
import { buildTimeline, childrenInFlight, fmtTime, pillState, relTime, HIVE_STATE_URL } from "../src/lib/hive-state-view.js"
import type { HiveStatePayload, SessionRowLike, SessionListLike, TimelineEvent } from "../src/lib/hive-state-view.js"

async function fetchHiveState(sessionId: string): Promise<HiveStatePayload> {
  const res = await fetch(`${HIVE_STATE_URL}?id=${encodeURIComponent(sessionId)}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`route ${res.status}`)
  return (await res.json()) as HiveStatePayload
}

export const HIVE_STATE_CSS = `
/* ── WI-083 HIVE-state overlay (token-only styling; light+dark by tokens) ── */
.hvs-pill{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-tooltip-bg);
  color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.4;cursor:pointer;
  user-select:none;max-width:240px;white-space:nowrap;overflow:hidden}
.hvs-pill:hover{border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}
.hvs-pill .hvs-dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;
  background:var(--dsw-alias-state-idle-primary)}
.hvs-pill[data-tone="hive"] .hvs-dot{background:var(--dsw-alias-state-business-primary)}
.hvs-pill[data-tone="live"] .hvs-dot{background:var(--dsw-alias-state-success-primary);
  animation:hvs-pulse 1.6s ease-in-out infinite}
.hvs-pill[data-tone="unknown"] .hvs-dot{background:var(--dsw-alias-label-dimmed)}
.hvs-pill .hvs-word{overflow:hidden;text-overflow:ellipsis}
.hvs-pill .hvs-badge{flex:0 0 auto;font-size:10px;color:var(--dsw-alias-label-tertiary)}
@keyframes hvs-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){.hvs-pill[data-tone="live"] .hvs-dot{animation:none}}
.hvs-panel{position:fixed;z-index:10000;width:420px;max-width:calc(100vw - 24px);
  max-height:60vh;display:flex;flex-direction:column;overflow:hidden;
  border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
  background:var(--dsw-alias-tooltip-bg);color:var(--dsw-alias-label-primary);
  box-shadow:0 8px 28px rgba(0,0,0,.25);font-size:11.5px;line-height:1.45}
.hvs-panel .hvs-head{display:flex;align-items:center;gap:8px;padding:8px 10px 6px;
  border-bottom:1px solid var(--dsw-alias-border-l1)}
.hvs-panel .hvs-title{font-weight:600;color:var(--dsw-alias-label-primary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto}
.hvs-panel .hvs-close{flex:0 0 auto;border:0;background:transparent;cursor:pointer;
  color:var(--dsw-alias-label-tertiary);font-size:13px;padding:2px 6px;border-radius:6px}
.hvs-panel .hvs-close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.hvs-panel .hvs-meta{padding:6px 10px;display:flex;flex-direction:column;gap:4px;
  border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.hvs-panel .hvs-meta b{color:var(--dsw-alias-label-primary);font-weight:600}
.hvs-panel .hvs-hive{color:var(--dsw-alias-state-business-primary)}
.hvs-panel .hvs-rows{overflow-y:auto;overscroll-behavior:contain;padding:6px 10px 8px}
.hvs-panel .hvs-row{display:flex;gap:8px;padding:3px 0;align-items:baseline}
.hvs-panel .hvs-t{flex:0 0 auto;min-width:104px;color:var(--dsw-alias-label-tertiary);font-size:10.5px;
  font-variant-numeric:tabular-nums}
.hvs-panel .hvs-g{flex:0 0 auto;width:12px;text-align:center;color:var(--dsw-alias-state-business-tertiary)}
.hvs-panel .hvs-g[data-kind="dream"]{color:var(--dsw-alias-state-warn-primary)}
.hvs-panel .hvs-g[data-kind="tick"]{color:var(--dsw-alias-label-dimmed)}
.hvs-panel .hvs-g[data-kind="used"]{color:var(--dsw-alias-label-tertiary)}
.hvs-panel .hvs-text{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.hvs-panel .hvs-ambient .hvs-text{color:var(--dsw-alias-label-tertiary)}
.hvs-panel .hvs-observed .hvs-text{color:var(--dsw-alias-state-success-secondary)}
.hvs-panel .hvs-empty{color:var(--dsw-alias-label-tertiary);padding:6px 0}
.hvs-panel .hvs-foot{padding:5px 10px 7px;border-top:1px solid var(--dsw-alias-border-l1);
  color:var(--dsw-alias-label-dimmed);font-size:10px}
.hvs-panel .hvs-flag{color:var(--dsw-alias-state-warn-label)}
`

/*
 * DOM helpers (drawer discipline: textContent for data, no data in HTML).
 */
function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

const PANEL_ID = "hvs-timeline-panel"

const KIND_GLYPH: Record<string, string> = {
  awaken: "◈",
  goal: "◎",
  used: "•",
  dream: "☾",
  tick: "⚡",
  live: "▶",
}

/**
 * The dock occupant component factory. REACT is passed in by the wrapper
 * (module table — W-044); the module itself imports nothing.
 */
export function makeHiveStateDock(ReactArg: {
  createElement: (type: string, props?: unknown, ...children: unknown[]) => unknown
  useEffect: (fn: () => void | (() => void), deps?: unknown[]) => void
  useRef: (init: unknown) => { current: unknown }
  useState: (init: unknown) => [unknown, (v: unknown | ((prev: unknown) => unknown)) => void]
}): (props: Record<string, unknown>) => unknown {
  // The runtime face: hooks come from the module table; typing stays loose —
  // this file belongs to the generated bundle path, verified by guards, not
  // by host typechecks.
  const React = ReactArg as never as {
    createElement: (type: string, props?: Record<string, unknown>, ...children: unknown[]) => never
    useEffect: (fn: () => void | (() => void), deps?: unknown[]) => void
    useRef: <T>(init: T) => { current: T }
    useState: <T>(init: T) => [T, (v: T | ((prev: T) => T)) => void]
  }

  return function HiveStateDock(props: Record<string, unknown>) {
    const sessionId = typeof props.sessionId === "string" ? props.sessionId : ""
    const useSessions =
      typeof props.useSessions === "function"
        ? (props.useSessions as (s: (v: SessionListLike) => SessionListLike | undefined) => SessionListLike | undefined)
        : undefined

    const [data, setData] = React.useState<HiveStatePayload | undefined>(undefined)
    const [fetchFailed, setFetchFailed] = React.useState<boolean>(false)
    const [open, setOpen] = React.useState<boolean>(false)
    const [eventNotes, setEventNotes] = React.useState<TimelineEvent[]>([])
    const runningRef = React.useRef<boolean | undefined>(undefined)
    const pillRef = React.useRef<HTMLElement | null>(null)

    // LIVE session facts from the session store (global standard seat).
    const list = useSessions ? useSessions((s: SessionListLike) => s) : undefined
    const rowList = list?.byId ?? {}
    const row = sessionId ? rowList[sessionId] : undefined
    const running = row ? row.running === true : undefined
    const kids = childrenInFlight(list, sessionId)

    // Observe running transitions while mounted (W-099: the timeline MOVES).
    React.useEffect(() => {
      const prev = runningRef.current
      if (prev !== undefined && prev !== running) {
        const note: TimelineEvent = {
          ts: new Date().toISOString(),
          kind: "live",
          text: prev === false && running === true ? "turn started (observed live)" : "turn ended (observed live)",
          observed: true,
        }
        setEventNotes((notes: TimelineEvent[]) => [note, ...notes].slice(0, 20))
      }
      runningRef.current = running
    }, [running])

    // The poll: immediate on selection change, then every 6 s while mounted.
    React.useEffect(() => {
      if (!sessionId) return
      let cancelled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const poll = () => {
        fetchHiveState(sessionId)
          .then((payload) => {
            if (cancelled) return
            setFetchFailed(payload?.ok === false)
            setData(payload.ok === false ? undefined : payload)
          })
          .catch(() => {
            if (cancelled) return
            setFetchFailed(true)
          })
          .finally(() => {
            if (!cancelled) timer = setTimeout(poll, 6000)
          })
      }
      poll()
      return () => {
        cancelled = true
        if (timer) clearTimeout(timer)
      }
    }, [sessionId])

    // Panel positioning: anchored to the pill, ABOVE the composer, portal to
    // document.body (drawer posture — escapes transformed panel ancestors).
    React.useEffect(() => {
      if (!open || !sessionId) return
      const panel = document.body.appendChild(el("div", "hvs-panel"))
      panel.id = PANEL_ID
      const render = () => {
        if (!panel.isConnected) return
        panel.innerHTML = ""
        drawPanel(panel, { sessionId, data, fetchFailed, row, kids, eventNotes, onClose: () => setOpen(false) })
        const rect = pillRef.current?.getBoundingClientRect()
        if (rect) {
          const top = Math.max(8, rect.top - panel.offsetHeight - 10)
          panel.style.top = `${top}px`
          panel.style.left = `${Math.min(Math.max(8, rect.right - panel.offsetWidth), window.innerWidth - panel.offsetWidth - 8)}px`
        }
      }
      render()
      const reposition = () => render()
      window.addEventListener("resize", reposition)
      window.addEventListener("scroll", reposition, true)
      const onDocClick = (e: Event) => {
        const target = e.target as Node
        if (!panel.contains(target) && pillRef.current && !pillRef.current.contains(target)) setOpen(false)
      }
      const onEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false)
      }
      document.addEventListener("click", onDocClick, true)
      document.addEventListener("keydown", onEsc)
      return () => {
        window.removeEventListener("resize", reposition)
        window.removeEventListener("scroll", reposition, true)
        document.removeEventListener("click", onDocClick, true)
        document.removeEventListener("keydown", onEsc)
        panel.remove()
      }
    }, [open, sessionId, data, fetchFailed, row, eventNotes])

    if (!sessionId) return null

    const state = pillState(fetchFailed ? undefined : data, running)
    const tone = running === true ? "live" : state.tone
    const goalRounds = fetchFailed ? null : data?.goal?.roundsStarted
    const hiveBadge = fetchFailed ? "" : data?.hive?.isCoordinator === true ? "hive" : "ambient"

    return React.createElement(
      "span",
      {
        className: "hvs-pill",
        "data-tone": tone,
        "data-slot-hive-state": sessionId,
        role: "button",
        "aria-expanded": open ? "true" : "false",
        ref: (n: HTMLElement | null) => {
          pillRef.current = n
        },
        onClick: () => setOpen((v: boolean) => !v),
        title: "HIVE state of this session (WI-083, read-only)",
      },
      React.createElement("span", { className: "hvs-dot", "data-dot": tone }),
      React.createElement("span", { className: "hvs-word" }, `hive · ${fetchFailed ? "route pending" : state.word}`),
      goalRounds ? React.createElement("span", { className: "hvs-badge" }, `r${goalRounds}`) : null,
      kids.length > 0 ? React.createElement("span", { className: "hvs-badge" }, `+${kids.length}`) : null,
      hiveBadge ? React.createElement("span", { className: "hvs-badge" }, hiveBadge) : null,
    )
  }
}

/** Full panel draw — DOM/textContent only, data-derived strings never in HTML. */
function drawPanel(
  panel: HTMLElement,
  parts: {
    sessionId: string
    data: HiveStatePayload | undefined
    fetchFailed: boolean
    row: SessionRowLike | undefined
    kids: SessionRowLike[]
    eventNotes: TimelineEvent[]
    onClose: () => void
  },
): void {
  const title = String(parts.row?.displayTitle ?? parts.row?.title ?? parts.sessionId.slice(0, 12))
  const head = el("div", "hvs-head")
  const titleEl = el("div", "hvs-title")
  titleEl.textContent = `HIVE state — ${title}`
  head.appendChild(titleEl)
  const close = el("button", "hvs-close", "✕")
  close.addEventListener("click", () => parts.onClose())
  head.appendChild(close)
  panel.appendChild(head)

  const meta = el("div", "hvs-meta")
  const hive = parts.data?.hive
  const hiveLine = el("div")
  if (parts.fetchFailed) {
    hiveLine.appendChild(
      el(
        "span",
        "hvs-flag",
        "host route not live yet — the timeline needs the next dsh-web bounce (route shipped in @hive/dsh-evolution, read-only)",
      ),
    )
  } else if (hive?.isCoordinator) {
    hiveLine.appendChild(el("span", "hvs-hive", "HIVE coordinator"))
    hiveLine.appendChild(
      document.createTextNode(` — ${hive.agent ?? "unknown"} · awakened ${fmtTime(hive.awakenedAt)} (${relTime(hive.awakenedAt)})`),
    )
  } else {
    hiveLine.appendChild(el("span", "", "not an awakened coordinator (ambient session)"))
  }
  meta.appendChild(hiveLine)

  const liveLine = el("div")
  liveLine.appendChild(
    document.createTextNode(
      `live: ${
        parts.row
          ? parts.row.running
            ? "working now"
            : `idle — last update ${parts.row.updatedAt ? fmtTime(new Date(parts.row.updatedAt).toISOString()) : "—"}`
          : "session row unknown"
      }`,
    ),
  )
  meta.appendChild(liveLine)

  const goal = parts.data?.goal
  const goalLine = el("div")
  if (goal) {
    const objective = goal.objective && goal.objective.length > 90 ? `${goal.objective.slice(0, 90)}…` : goal.objective
    goalLine.appendChild(el("b", "", `goal · round ${goal.roundsStarted ?? "—"} · ${goal.status ?? ""}`))
    if (objective) goalLine.appendChild(document.createTextNode(` — ${objective}`))
  } else if (!parts.fetchFailed && parts.data?.goalReason === "no-live-agent") {
    goalLine.appendChild(el("span", "hvs-flag", "goal not observable (session not live on this host)"))
  } else {
    goalLine.appendChild(el("span", "", "no active goal"))
  }
  meta.appendChild(goalLine)

  const kidLine = el("div")
  if (parts.kids.length > 0) {
    kidLine.appendChild(document.createTextNode(`children in flight: ${parts.kids.length}`))
    for (const k of parts.kids.slice(0, 5)) {
      kidLine.appendChild(el("span", "", ` · ${String(k.displayTitle ?? k.id).slice(0, 28)}`))
    }
  } else {
    kidLine.appendChild(el("span", "", "children in flight: none"))
  }
  meta.appendChild(kidLine)
  panel.appendChild(meta)

  const rows = el("div", "hvs-rows")
  const events = [...parts.eventNotes, ...buildTimeline(parts.data)].sort(
    (a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime(),
  )
  if (events.length === 0) {
    rows.appendChild(el("div", "hvs-empty", "no HIVE records for this session yet — the ledger rows land here as they happen"))
  } else {
    for (const ev of events.slice(0, 80)) {
      const rowEl = el("div", `hvs-row${ev.ambient ? " hvs-ambient" : ""}${ev.observed ? " hvs-observed" : ""}`)
      rowEl.appendChild(el("span", "hvs-t", `${fmtTime(ev.ts)}${ev.ts ? ` · ${relTime(ev.ts)}` : ""}`))
      const glyph = el("span", "hvs-g", KIND_GLYPH[ev.kind] ?? "•")
      glyph.setAttribute("data-kind", ev.kind)
      rowEl.appendChild(glyph)
      rowEl.appendChild(el("span", "hvs-text", ev.text))
      rows.appendChild(rowEl)
    }
  }
  panel.appendChild(rows)

  const foot = el("div", "hvs-foot")
  foot.textContent = `read-only WI-083 overlay · sources: hive-sessions.json · hive-state.json · dreams/* · snapshot ${fmtTime(parts.data?.generated)}`
  panel.appendChild(foot)
}
