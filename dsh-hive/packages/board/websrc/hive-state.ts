/**
 * WI-083 (v1.1) — HIVE-state overlay (client half): a LIFECYCLE story of the
 * SELECTED session — stage transitions + milestones — rendered INTO the live
 * web composer dock.
 *
 * Data contract (all real, read-only — no mocks):
 *   - Host route: GET /api/hive-state/session?id=<sessionId> (shipped in
 *     @hive/dsh-evolution): awaken ledger, this session's usage/dispatch
 *     marks, its own dream telemetry, the DURABLE children catalog (real
 *     dispatch timestamps), live goal rounds and the host agents projection
 *     (+ the host-truth `live` flag). Until the host half's route is live
 *     (next dsh-web bounce), the poll fails and the pill says so honestly.
 *   - SELECTED session: the dock occupant is a `session`-scope standard-prop
 *     consumer — the framework hands `sessionId` and re-mounts on selection
 *     change (conversation.composer.dock is list-kind, session-scope — the
 *     chat package's StatsPills precedent).
 *   - LIVE page facts: the global `useSessions` standard hook gives the
 *     selected row's running state, title, updatedAt and the children rows —
 *     re-rendered live by the page's session store.
 *
 * v1.1 (user decisions):
 *   - SESSION-ONLY scope: workspace-level ambient facts (dream DRM runs,
 *     energy ticks) are NOT shown — the timeline is this session's story.
 *   - Rows are stage transitions (registered → awakened (tier) → working ⇄
 *     idle → … → done) plus milestones (children dispatched/returned, goal
 *     rounds, dream consults). Entering timestamp per row; duration-so-far
 *     on the ACTIVE stage (a 1 s tick keeps it honest); the current stage
 *     also lives in the header line.
 *   - LIVE truth: the stage tone flips on page running OR host route truth
 *     (route `live`/agents projection), so a stale page store can never
 *     certify a frozen idle while the session works (W-099 applied to this
 *     panel's own live section).
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
 * The pure projection logic (buildTimeline / currentStage / childrenInFlight /
 * durationSince / time stamps) lives in ../src/lib/hive-state-view.ts —
 * bundled here AND unit-tested from dist. This file is DOM + wiring only.
 */
import {
  buildTimeline,
  childrenInFlight,
  childrenKnown,
  currentStage,
  durationSince,
  fmtTime,
  relTime,
  HIVE_STATE_URL,
} from "../src/lib/hive-state-view.js"
import type { HiveStatePayload, SessionRowLike, SessionListLike, TimelineEvent } from "../src/lib/hive-state-view.js"

/** The light card face from /api/hive-board/session-item (board store read). */
export interface BoardItemCard {
  id: string
  title: string
  status: string
  priority: string
}

async function fetchItemCard(sessionId: string): Promise<BoardItemCard | null> {
  const res = await fetch(`/api/hive-board/session-item?id=${encodeURIComponent(sessionId)}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`route ${res.status}`)
  const body = (await res.json()) as { ok?: boolean; item?: BoardItemCard | null }
  if (body?.ok === false) throw new Error("bad request")
  return body.item ?? null
}

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
.hvs-panel{position:fixed;z-index:10000;width:440px;max-width:calc(100vw - 24px);
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
.hvs-panel .hvs-stage{padding:7px 10px;display:flex;align-items:baseline;gap:8px;
  border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px}
.hvs-panel .hvs-stage .hvs-now{font-weight:600;color:var(--dsw-alias-label-primary)}
.hvs-panel[data-live="1"] .hvs-stage .hvs-now{color:var(--dsw-alias-state-success-primary)}
.hvs-panel .hvs-stage .hvs-dur{color:var(--dsw-alias-state-business-primary);font-variant-numeric:tabular-nums}
.hvs-panel .hvs-stage .hvs-sig{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:10.5px}
.hvs-panel .hvs-card-wrap{padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.hvs-panel .hvs-card{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 8px;cursor:pointer;
  background:var(--dsw-alias-tooltip-key-bg)}
.hvs-panel .hvs-card:hover{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}
.hvs-panel .hvs-card-top{display:flex;gap:8px;align-items:baseline}
.hvs-panel .hvs-card-id{font-weight:600;color:var(--dsw-alias-state-business-primary);font-variant-numeric:tabular-nums}
.hvs-panel .hvs-card-status{color:var(--dsw-alias-label-secondary);font-size:10px}
.hvs-panel .hvs-card-prio{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:10px}
.hvs-panel .hvs-card-title{color:var(--dsw-alias-label-primary);font-size:11.5px;margin-top:2px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.hvs-panel .hvs-card-empty{color:var(--dsw-alias-label-dimmed);font-size:11px}
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
.hvs-panel .hvs-g[data-kind="returned"]{color:var(--dsw-alias-state-success-secondary)}
.hvs-panel .hvs-g[data-kind="dispatched"]{color:var(--dsw-alias-state-business-primary)}
.hvs-panel .hvs-g[data-kind="goal"]{color:var(--dsw-alias-label-primary)}
.hvs-panel .hvs-g[data-kind="idle"]{color:var(--dsw-alias-label-dimmed)}
.hvs-panel .hvs-text{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.hvs-panel .hvs-row.hvs-current .hvs-text{color:var(--dsw-alias-label-primary);font-weight:600}
.hvs-panel .hvs-dur{flex:0 0 auto;font-size:10px;color:var(--dsw-alias-state-business-primary);
  font-variant-numeric:tabular-nums}
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

/**
 * WI-083 (v1.2) — the open flow (user priority tree, branch 1): deep-link
 * into the "HIVE Board" tab INSIDE the dsh web UI via ctx.layout.selectPanel
 * (the framework's cross-plugin panel-transition face — ILAYOUT documents
 * itself as "the contract other plugins' apply worlds reach for panel
 * transitions"), then open THAT item in the tab's REAL inspector (the same
 * drawer the board cards use — openDrawer, one trajectory, no :4400
 * hand-off, no duplicated spec/history rendering).
 */
async function openInBoardTab(pluginCtx: Record<string, unknown> | undefined, itemId: string): Promise<string> {
  const layout = pluginCtx && (pluginCtx as { layout?: { selectPanel?: (id: string | null) => void } }).layout
  if (layout && typeof layout.selectPanel === "function") {
    try {
      // The board's own main-slot key (this package's registration: 'hive-board').
      layout.selectPanel("hive-board")
    } catch {
      // an unregistered main key throws — the drawer still opens below
    }
    // give the tab a moment to mount, so the drawer opens over the board
    for (let i = 0; i < 40; i++) {
      if (document.querySelector(".hvb-root")) break
      await new Promise((r) => setTimeout(r, 60))
    }
  }
  // The item inspector is the SAME drawer module the board tab uses (one
  // bundled instance, one trajectory — the tab's cards ride bindItemDrawer
  // delegation onto this exact openDrawer).
  const { openDrawer } = await import("./item-drawer.js")
  await openDrawer(itemId)
  return "drawer"
}

const KIND_GLYPH: Record<string, string> = {
  awaken: "◈",
  registered: "◇",
  working: "▶",
  idle: "⏸",
  done: "■",
  dispatched: "⇗",
  returned: "⇙",
  goal: "◎",
  dream: "☾",
}

/**
 * The dock occupant component factory. REACT is passed in by the wrapper
 * (module table — W-044); the module itself imports nothing.
 */
export function makeHiveStateDock(
  // The plugin ctx (for the WI-083 open flow: ctx.layout.selectPanel — the
  // framework's cross-plugin panel-transition face; guarded by the entity
  // inject's 'layout' entry) + the module-table React (W-044).
  pluginCtx: Record<string, unknown> | undefined,
  ReactArg: {
    createElement: (type: string, props?: unknown, ...children: unknown[]) => unknown
    useEffect: (fn: () => void | (() => void), deps?: unknown[]) => void
    useRef: (init: unknown) => { current: unknown }
    useState: (init: unknown) => [unknown, (v: unknown | ((prev: unknown) => unknown)) => void]
  },
): (props: Record<string, unknown>) => unknown {
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
    // v1.2 — the attached board work item (light card from the board store's
    // read primitives, /api/hive-board/session-item).
    const [itemCard, setItemCard] = React.useState<{ item: BoardItemCard | null; pending: boolean; error?: boolean }>({ item: null, pending: true })
    const openRef = React.useRef<boolean>(false)
    openRef.current = open
    const [eventNotes, setEventNotes] = React.useState<TimelineEvent[]>([])
    const [nowTick, setNowTick] = React.useState<number>(Date.now())
    const runningRef = React.useRef<boolean | undefined>(undefined)
    const goalRef = React.useRef<string>("")
    const childRunRef = React.useRef<Map<string, boolean>>(new Map())
    const rowSeenRef = React.useRef<boolean>(false)
    const pillRef = React.useRef<HTMLElement | null>(null)

    // LIVE session facts from the session store (global standard seat).
    const list = useSessions ? useSessions((s: SessionListLike) => s) : undefined
    const rowList = list?.byId ?? {}
    const row = sessionId ? rowList[sessionId] : undefined
    const running = row ? row.running === true : undefined
    const kids = childrenInFlight(list, sessionId)
    const kidsAll = childrenKnown(list, sessionId)

    // Observe REAL transitions while mounted (W-099: the story must move).
    React.useEffect(() => {
      const prev = runningRef.current
      if (prev !== undefined && prev !== running) {
        const note: TimelineEvent = {
          ts: new Date().toISOString(),
          kind: running ? "working" : "idle",
          text: running ? "working — turn started (observed)" : "idle — turn ended (observed)",
          observed: true,
        }
        setEventNotes((notes: TimelineEvent[]) => [note, ...notes].slice(0, 40))
      }
      runningRef.current = running
      // children running-flips → "returned" milestones (not durably stamped)
      for (const c of kidsAll) {
        const was = childRunRef.current.get(c.id)
        if (was === true && c.running !== true) {
          const note: TimelineEvent = {
            ts: new Date().toISOString(),
            kind: "returned",
            text: `child returned — ${String(c.displayTitle ?? c.title ?? c.id).slice(0, 40)} (observed)`,
            observed: true,
          }
          setEventNotes((notes: TimelineEvent[]) => [note, ...notes].slice(0, 40))
        }
        childRunRef.current.set(c.id, c.running === true)
      }
      // goal changes → milestones (rounds + status are current-state only)
      const g = data?.goal
      if (g) {
        const sig = `${g.roundsStarted ?? "?"}/${g.status ?? "?"}`
        if (goalRef.current !== "" && goalRef.current !== sig) {
          const note: TimelineEvent = {
            ts: g.updatedAt ?? new Date().toISOString(),
            kind: "goal",
            text: `goal → round ${g.roundsStarted ?? "—"} · ${g.status ?? ""} (observed)`,
            observed: true,
          }
          setEventNotes((notes: TimelineEvent[]) => [note, ...notes].slice(0, 40))
        }
        goalRef.current = sig
      }
      // the selected session itself vanishing → done (observed)
      if (sessionId) {
        const present = rowList[sessionId] !== undefined
        if (rowSeenRef.current && !present) {
          const note: TimelineEvent = {
            ts: new Date().toISOString(),
            kind: "done",
            text: "done — session removed from the live session list (observed)",
            observed: true,
          }
          setEventNotes((notes: TimelineEvent[]) => [note, ...notes].slice(0, 40))
        }
        rowSeenRef.current = present
      }
    }, [running, kidsAll, sessionId, rowList, data?.goal])

    // The poll: immediate on selection change, then every 6 s while mounted.
    // The v1.2 item card rides the same cadence ONLY while the panel is open
    // (the pill does not need it; keeps the board-store read cadence kind).
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
        if (!openRef.current) return
        fetchItemCard(sessionId)
          .then((card) => {
            if (cancelled) return
            setItemCard({ item: card, pending: false })
          })
          .catch(() => {
            if (cancelled) return
            setItemCard((prev) => ({ ...prev, pending: false, error: true }))
          })
      }
      poll()
      const onOpen = () => {
        fetchItemCard(sessionId)
          .then((card) => { if (!cancelled) setItemCard({ item: card, pending: false }) })
          .catch(() => { if (!cancelled) setItemCard((prev) => ({ ...prev, pending: false, error: true })) })
      }
      onOpen()
      return () => {
        cancelled = true
        if (timer) clearTimeout(timer)
      }
    }, [sessionId, open])

    // Panel positioning: anchored to the pill, ABOVE the composer, portal to
    // document.body (drawer posture — escapes transformed panel ancestors).
    React.useEffect(() => {
      if (!open || !sessionId) return
      const panel = document.body.appendChild(el("div", "hvs-panel"))
      panel.id = PANEL_ID
      const render = () => {
        if (!panel.isConnected) return
        panel.innerHTML = ""
        drawPanel(panel, {
          sessionId,
          data,
          fetchFailed,
          row,
          kids,
          kidsAll,
          eventNotes,
          nowTick,
          itemCard,
          pluginCtx,
          onClose: () => setOpen(false),
        })
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
      // 1 s tick: the active stage's duration-so-far stays honest
      const tick = setInterval(() => setNowTick(Date.now()), 1000)
      return () => {
        window.removeEventListener("resize", reposition)
        window.removeEventListener("scroll", reposition, true)
        document.removeEventListener("click", onDocClick, true)
        document.removeEventListener("keydown", onEsc)
        clearInterval(tick)
        panel.remove()
      }
    }, [open, sessionId, data, fetchFailed, row, eventNotes, nowTick])

    if (!sessionId) return null

    const stage = currentStage({ payload: fetchFailed ? undefined : data, routeReachable: !fetchFailed, pageRunning: running })
    const goalRounds = fetchFailed ? null : data?.goal?.roundsStarted
    const hiveBadge = fetchFailed ? "" : data?.hive?.isCoordinator === true ? "hive" : "ambient"

    return React.createElement(
      "span",
      {
        className: "hvs-pill",
        "data-tone": stage.tone,
        "data-slot-hive-state": sessionId,
        role: "button",
        "aria-expanded": open ? "true" : "false",
        ref: (n: HTMLElement | null) => {
          pillRef.current = n
        },
        onClick: () => setOpen((v: boolean) => !v),
        title: "HIVE state of this session (WI-083, read-only)",
      },
      React.createElement("span", { className: "hvs-dot", "data-dot": stage.tone }),
      React.createElement("span", { className: "hvs-word" }, `hive · ${fetchFailed ? "route pending" : stage.stage}`),
      goalRounds ? React.createElement("span", { className: "hvs-badge" }, `r${goalRounds}`) : null,
      kids.length > 0 ? React.createElement("span", { className: "hvs-badge" }, `+${kids.length}`) : null,
      hiveBadge ? React.createElement("span", { className: "hvs-badge" }, hiveBadge) : null,
    )
  }
}

function findLatestKind(notes: TimelineEvent[], kind: string): string | null {
  for (const n of notes) if (n.kind === kind && n.ts) return n.ts
  return null
}

/** The latest signal stamp across the session's own story. */
function latestSignalTs(data: HiveStatePayload | undefined, row: SessionRowLike | undefined): string | null {
  let best: number | null = null
  const consider = (iso: string | null | undefined) => {
    if (!iso) return
    const t = new Date(iso).getTime()
    if (isFinite(t) && (best === null || t > best)) best = t
  }
  consider(row?.updatedAt ? new Date(row.updatedAt).toISOString() : undefined)
  consider(data?.goal?.updatedAt)
  consider(data?.hive?.awakenedAt)
  consider(data?.generated)
  for (const m of data?.usageMarks ?? []) consider(m.timestamp)
  for (const d of data?.dreamEvents ?? []) consider(d.ts)
  for (const c of data?.children ?? []) consider(c.createdAtMs ? new Date(c.createdAtMs).toISOString() : null)
  if (row?.updatedAt && (best === null || row.updatedAt > best)) best = row.updatedAt
  return best === null ? null : new Date(best).toISOString()
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
    kidsAll: SessionRowLike[]
    eventNotes: TimelineEvent[]
    nowTick: number
    itemCard: { item: BoardItemCard | null; pending: boolean; error?: boolean }
    pluginCtx: Record<string, unknown> | undefined
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

  // ── CURRENT STAGE (the header line the user asked to keep) ────────────────
  const stage = currentStage({
    payload: parts.fetchFailed ? undefined : parts.data,
    routeReachable: !parts.fetchFailed,
    pageRunning: parts.row ? parts.row.running === true : undefined,
  })
  const stageLine = el("div", "hvs-stage")
  if (parts.fetchFailed) stageLine.setAttribute("data-live", "0")
  else stageLine.setAttribute("data-live", stage.tone === "live" ? "1" : "0")
  const now = el("span", "hvs-now", parts.fetchFailed ? "stage unknown" : `now: ${stage.stage}`)
  stageLine.appendChild(now)
  const workTs = findLatestKind(parts.eventNotes, "working")
  if (stage.stage === "working") {
    const dur = workTs ? durationSince(workTs, parts.nowTick) : ""
    stageLine.appendChild(el("span", "hvs-dur", dur ? `${dur} so far` : "in progress — enter time not observed"))
  }
  const sig = latestSignalTs(parts.fetchFailed ? undefined : parts.data, parts.row)
  stageLine.appendChild(el("span", "hvs-sig", `latest signal ${fmtTime(sig)} · ${relTime(sig)}`))
  panel.appendChild(stageLine)

  // ── ATTACHED BOARD WORK ITEM (v1.2): slim card, tap opens the item in the
  // HIVE Board tab (selectPanel deep-link + the tab's own drawer). Muted hint
  // when the store says the session owns nothing; honest pending/pending-route
  // states otherwise. READ-ONLY: the card opens the board's existing
  // inspector — no transitions, no actions from the overlay.
  const cardContainer = el("div", "hvs-card-wrap")
  if (parts.itemCard.pending) {
    cardContainer.appendChild(el("div", "hvs-card-empty", "attached board item — loading…"))
  } else if (parts.itemCard.error) {
    cardContainer.appendChild(el("span", "hvs-flag", "board pairing unavailable — is the board route live yet?"))
  } else if (parts.itemCard.item) {
    const card = el("div", "hvs-card")
    card.setAttribute("role", "button")
    card.setAttribute("title", `Open ${parts.itemCard.item.id} in the HIVE Board tab`)
    const top = el("div", "hvs-card-top")
    top.appendChild(el("span", "hvs-card-id", parts.itemCard.item.id))
    top.appendChild(el("span", `hvs-card-status`, parts.itemCard.item.status))
    top.appendChild(el("span", "hvs-card-prio", parts.itemCard.item.priority))
    card.appendChild(top)
    const title = el("div", "hvs-card-title", parts.itemCard.item.title)
    card.appendChild(title)
    card.addEventListener("click", () => {
      void openInBoardTab(parts.pluginCtx, parts.itemCard.item!.id)
    })
    cardContainer.appendChild(card)
  } else {
    cardContainer.appendChild(el("div", "hvs-card-empty", "no attached in-progress board item (owner/group match found none)"))
  }
  panel.appendChild(cardContainer)

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
    hiveLine.appendChild(el("span", "", "not an awakened coordinator"))
  }
  meta.appendChild(hiveLine)

  const live = parts.data?.live
  const hostLine = el("div")
  hostLine.appendChild(
    document.createTextNode(
      parts.fetchFailed
        ? "host truth: unknown (route pending)"
        : `host truth: ${live === true ? "live on this host" : "not live on this host"} · ${parts.data?.runningAgents ?? 0} agents running`,
    ),
  )
  meta.appendChild(hostLine)

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
  const total = parts.data?.childrenTotal ?? parts.kidsAll.length
  kidLine.appendChild(
    document.createTextNode(
      `children: ${parts.kids.length} in flight · ${total} known`,
    ),
  )
  for (const k of parts.kids.slice(0, 3)) {
    kidLine.appendChild(el("span", "", ` · ${String(k.displayTitle ?? k.id).slice(0, 24)}`))
  }
  meta.appendChild(kidLine)
  panel.appendChild(meta)

  // ── LIFECYCLE ROWS (stage transitions + milestones, newest first) ─────────
  const rows = el("div", "hvs-rows")
  const events = [...parts.eventNotes, ...buildTimeline(parts.fetchFailed ? undefined : parts.data)].sort(
    (a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime(),
  )
  if (events.length === 0) {
    rows.appendChild(el("div", "hvs-empty", "no HIVE records for this session yet — stage transitions land here as they happen"))
  } else {
    for (const ev of events.slice(0, 80)) {
      const rowEl = el("div", `hvs-row${ev.observed ? " hvs-observed" : ""}`)
      rowEl.appendChild(el("span", "hvs-t", `${fmtTime(ev.ts)}${ev.ts ? ` · ${relTime(ev.ts)}` : ""}`))
      const glyph = el("span", "hvs-g", KIND_GLYPH[ev.kind] ?? "•")
      glyph.setAttribute("data-kind", ev.kind)
      rowEl.appendChild(glyph)
      rowEl.appendChild(el("span", "hvs-text", ev.text))
      // duration-so-far rides the ACTIVE working stage row
      if (ev.kind === "working" && stage.stage === "working" && ev.ts === findLatestKind(parts.eventNotes, "working")) {
        const dur = workTs ? durationSince(workTs, parts.nowTick) : ""
        rowEl.classList.add("hvs-current")
        rowEl.appendChild(el("span", "hvs-dur", dur ? `${dur} so far` : ""))
      }
      rows.appendChild(rowEl)
    }
  }
  panel.appendChild(rows)

  const foot = el("div", "hvs-foot")
  foot.textContent = `read-only WI-083 overlay · session-scoped · sources: hive-sessions.json · hive-state.json · dream telemetry · subagent catalog · snapshot ${fmtTime(parts.data?.generated)}`
  panel.appendChild(foot)
}
