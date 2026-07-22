/**
 * Server-side HTML renderer for the Phase-1 read-only viewer.
 * No client framework, no build step — one self-contained page with inline
 * CSS and a meta-refresh. Everything on it comes from BoardState (on-disk).
 */
// Runtime imports here MUST stay browser-safe: render.ts is bundled for the
// client (src/web/client.ts) to power the diff-based poll refresh. The runtime
// deps below resolve to browser-safe modules (thresholds.ts, lineage.ts,
// placeholder-title.ts) — never the barrel files that pull node:fs /
// board-store. Everything else is `import type`, erased by the bundler.
import type { BoardState } from "../data/state"
import type { Capability } from "../data/capabilities"
import { DISSOLVE_THRESHOLD, SPLIT_THRESHOLD } from "../data/thresholds"
import type { DreamSummary, RecentArtifact } from "../data/dreams"
import type { BoardColumns } from "../data/board"
import type { HivemindMessage } from "../data/messages"
import type { SessionCard, SessionMirror } from "../data/sessions"
import type { Subtask, WorkItem } from "../data/workitems"
import { absorbedLineage, lineageSessions } from "../data/lineage"
import { displayTitle } from "../data/placeholder-title"
import { summarizeTodos, type TodoSubState } from "../data/todo-types"
import type { Notice } from "./notices"

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace("T", " ").slice(0, 16) + "Z"
}

/**
 * The build-version badge that sits in the top meta line. Renders the SERVER's
 * build SHA (`state.buildSha`). The stale verdict is NOT computed here — the
 * server can't know which bytes the browser's /client.js was built from. The
 * client (client.ts) reads `data-server-sha` after each poll, compares it to
 * its own baked-in SHA, and toggles the stale styling deterministically
 * (W-061). Stable `id="build-badge"` + `data-server-sha` are the client's
 * handle; keep them stable across renders so the morph reuses this node.
 */
function buildBadge(serverSha: string): string {
  const label = serverSha === "unknown" ? "build unknown" : `build ${esc(serverSha)}`
  const title = serverSha === "unknown" ? "git unavailable — running build could not be identified" : "server build SHA (board repo HEAD)"
  return `<span id="build-badge" class="build-badge" data-server-sha="${esc(serverSha)}" title="${esc(title)}">${label}</span>`
}

// ── Capabilities ─────────────────────────────────────────────────────────────

function energyClass(energy: number | null): string {
  if (energy === null) return "unknown"
  if (energy < DISSOLVE_THRESHOLD) return "dissolve"
  if (energy > SPLIT_THRESHOLD) return "split"
  return "healthy"
}

function capabilityRow(c: Capability): string {
  const cls = energyClass(c.energy)
  const width = c.energy === null ? 0 : Math.max(0, Math.min(100, c.energy))
  const label = c.energy === null ? "?" : String(c.energy)
  const badge =
    cls === "dissolve"
      ? '<span class="badge badge-dissolve" title="below dissolve threshold (&lt;10)">dissolve zone</span>'
      : cls === "split"
        ? '<span class="badge badge-split" title="above split threshold (&gt;90)">split zone</span>'
        : ""
  return `<div class="cap">
    <div class="cap-head">
      <span class="cap-name">${esc(c.name)}</span>
      <span class="cap-domain">${esc(c.domain)}</span>
      ${badge}
      <span class="cap-energy ${cls}">${label}</span>
    </div>
    <div class="bar" title="energy ${label}/100 — dissolve &lt;${DISSOLVE_THRESHOLD}, split &gt;${SPLIT_THRESHOLD}">
      <div class="bar-fill ${cls}" style="width:${width}%"></div>
      <div class="bar-mark" style="left:${DISSOLVE_THRESHOLD}%"></div>
      <div class="bar-mark" style="left:${SPLIT_THRESHOLD}%"></div>
    </div>
    <div class="cap-desc">${esc(truncate(c.description, 160))}</div>
  </div>`
}

// ── Dreams ───────────────────────────────────────────────────────────────────

function dreamRow(d: DreamSummary, active: boolean): string {
  const status = d.status ?? "?"
  const statusCls = status === "DREAMING" ? "dreaming" : status === "COMPLETE" ? "complete" : "unknown"
  return `<tr class="${active ? "active-dream" : ""}">
    <td class="mono">${esc(d.id)}</td>
    <td><span class="status ${statusCls}">${esc(status)}</span></td>
    <td>${d.depth ?? "—"}</td>
    <td>${esc(d.intentionType ?? "—")}</td>
    <td class="intent" title="${esc(d.intention ?? "")}">${esc(truncate(d.intention ?? "—", 110))}</td>
    <td>${d.artifacts.length > 0 ? `<span title="${esc(d.artifacts.join(", "))}">${d.artifacts.length}</span>` : "0"}</td>
    <td class="mono dim">${fmtTime(d.exitTime ?? d.entryTime)}</td>
  </tr>`
}

function recentArtifactRow(a: RecentArtifact): string {
  return `<tr>
    <td class="mono">${esc(a.id)}</td>
    <td><span class="atype atype-${esc(a.type)}">${esc(a.type)}</span></td>
    <td class="mono dim">${esc(a.sourceDream)}</td>
    <td class="intent">${esc(truncate(a.summary, 100))}</td>
  </tr>`
}

// ── Kanban board (Phase 2) ───────────────────────────────────────────────────

type SessionPresence = "exists" | "absent" | "unknown"

function sessionPresence(id: string | null, mirror: SessionMirror): SessionPresence {
  if (!id) return "absent"
  if (!mirror.available) return "unknown"
  return mirror.persistedIds.includes(id) ? "exists" : "absent"
}

/**
 * "Open session" affordance (SCHEMA §1a): a NAVIGATION link only, rendered from
 * a work item's OWN stamped `owner_session` (its own record — I-143/I-144).
 *
 * Enablement trusts the stamped field, NOT the frozen session mirror. Because
 * bind/start only ever stamp a real, runtime-resolved session id (never a
 * self-reported one), the presence of `owner_session` is itself sufficient
 * proof the session exists — so a non-null id always yields a tappable deep
 * link. This is deliberate: the mirror (data/sessions.ts) is a BOOTSTRAP-ONLY
 * SQLite snapshot, computed once at startup and never refreshed (I-187/W-061),
 * and scoped to `directory = workspaceRoot` (excludes cross-project sessions).
 * Gating the link on that snapshot mis-rendered freshly-started and
 * cross-project owners as dead spans even though the session genuinely exists.
 * Reading the live field (SNG-045: the ship's own prow, not the harbormaster's
 * chalk-board) fixes both flavors without any render-time session-API call.
 *
 * The disabled/no-link path is preserved for the genuine no-owner case (`!id`).
 */
function openSessionHtml(id: string | null, guiBaseUrl: string, _mirror: SessionMirror): string {
  if (!id) return ""
  return `<a class="open-link" href="${esc(`${guiBaseUrl}/?session=${id}`)}" target="_blank" rel="noopener" title="open in web GUI">Open ↗</a>`
}

const SUBTASK_ICON: Record<string, string> = {
  completed: "✓",
  in_progress: "▸",
  pending: "○",
  cancelled: "✕",
}

function subtaskLane(subtasks: Subtask[]): string {
  if (subtasks.length === 0) return ""
  const done = subtasks.filter((s) => s.status === "completed").length
  const rows = subtasks
    .map(
      (s) =>
        `<li class="st st-${esc(s.status)}"><span class="st-icon">${SUBTASK_ICON[s.status] ?? "?"}</span>${esc(truncate(s.content, 70))}</li>`,
    )
    .join("")
  return `<div class="lane"><span class="lane-count">${done}/${subtasks.length}</span><ul>${rows}</ul></div>`
}

const TODO_ICON: Record<string, string> = {
  completed: "✓",
  in_progress: "▸",
  pending: "○",
  cancelled: "✕",
}

/**
 * Todo sub-state lane (WI-038): the finer-grained progress WITHIN an In-Progress
 * card — the owning session's live TodoWrite list rendered as a mini progress
 * view. Pure browser-safe render of the `TodoSubState` resolved server-side
 * (data/todos.ts); this function makes NO SDK call (I-192 bundle boundary).
 *
 * Renders a done/total summary bar + the current in-progress todo text, then the
 * full list. Degrades gracefully:
 *  - source "none" or empty ⇒ renders nothing (no owner, no todos, or session
 *    unreachable with no mirror — unknown ≠ wrong, no misleading zero bar).
 *  - source "mirror" ⇒ a "cached" hint so a lagging snapshot is honest (I-187).
 * Cancelled todos count toward total but not the completed ratio.
 */
function todoSubStateLane(sub: TodoSubState | undefined): string {
  if (!sub || sub.source === "none" || sub.todos.length === 0) return ""
  const s = summarizeTodos(sub.todos)
  // Denominator excludes cancelled work (it's neither done nor pending effort).
  const denom = s.total - s.cancelled
  const pct = denom > 0 ? Math.round((s.completed / denom) * 100) : 0
  const cached =
    sub.source === "mirror"
      ? ' <span class="todo-cached" title="session not reachable now — showing the last mirrored snapshot (may lag)">cached</span>'
      : ""
  const current = s.current
    ? `<div class="todo-current" title="${esc(s.current)}"><span class="st-icon">▸</span>${esc(truncate(s.current, 72))}</div>`
    : s.inProgress === 0 && s.pending > 0
      ? `<div class="todo-current dim">${s.pending} pending — none in progress</div>`
      : ""
  const rows = sub.todos
    .map(
      (t) =>
        `<li class="st st-${esc(t.status)}"><span class="st-icon">${TODO_ICON[t.status] ?? "?"}</span>${esc(truncate(t.content, 70))}</li>`,
    )
    .join("")
  return `<div class="todos" title="owning session TodoWrite progress (WI-038)">
    <div class="todo-head">
      <span class="todo-label">activity</span>
      <span class="todo-count mono">${s.completed}/${denom}</span>${cached}
      <div class="todo-bar"><div class="todo-bar-fill" style="width:${pct}%"></div></div>
    </div>
    ${current}
    <details class="todo-list"><summary>${sub.todos.length} todo${sub.todos.length === 1 ? "" : "s"}</summary><ul>${rows}</ul></details>
  </div>`
}

function lineageHtml(item: WorkItem, guiBaseUrl: string, mirror: SessionMirror): string {
  const parts: string[] = []
  const prior = lineageSessions(item)
  if (prior.length > 0) {
    const links = prior
      .map((id) =>
        sessionPresence(id, mirror) === "exists"
          ? `<a href="${esc(`${guiBaseUrl}/?session=${id}`)}" target="_blank" rel="noopener" class="mono">${esc(id)}</a>`
          : `<span class="mono" title="session not available here">${esc(id)}</span>`,
      )
      .join(", ")
    parts.push(`previously attempted in ${links}`)
  }
  // Q15: the only surviving record of a dissolved placeholder.
  for (const a of absorbedLineage(item)) {
    parts.push(`absorbed <span class="mono">${esc(a.id)}</span> at bind${a.at ? ` (${fmtTime(a.at)})` : ""}`)
  }
  if (parts.length === 0) return ""
  return `<div class="lineage">${parts.join(" · ")}</div>`
}

// ── Write-path affordances (only where valid per SCHEMA §3) ─────────────────

interface CardCtx {
  guiBaseUrl: string
  mirror: SessionMirror
  writesEnabled: boolean
  sessionBackend: "configured" | "unconfigured"
  decisions: Record<string, import("evolutional-agent-structure/lib/board-transitions").ReattachDecision>
  /** Todo sub-state per in-progress WI id (WI-038). */
  todoSubStates: Record<string, TodoSubState>
}

function shortSes(id: string): string {
  return id.length > 16 ? id.slice(0, 16) + "…" : id
}

/**
 * Confirmation-gate data attributes for a consequential write-path <form>
 * (I-206). The modal (page shell, OUTSIDE #board-root) reads these on submit
 * intercept and renders action-specific copy. Only truly consequential actions
 * carry these — Pause/Unpause/Create deliberately do not, so they fire
 * immediately. Severity drives the Confirm button styling: "start" ⇒ green,
 * "warn" ⇒ red. The gate is pure UX in FRONT of the already-correct locked
 * write path (I-179/I-212): on Confirm the ORIGINAL form submits unchanged.
 */
function confirmAttrs(severity: "start" | "warn", title: string, body: string): string {
  return ` data-confirm="1" data-confirm-severity="${severity}" data-confirm-title="${esc(title)}" data-confirm-body="${esc(body)}"`
}

/**
 * Start / Re-attach / Reopen — ONE button per promotable card, labeled with
 * the owner's reattachInfo decision BEFORE the click (behavior-as-signal:
 * the label tells you what promotion will actually do).
 */
function promoteForm(item: WorkItem, ctx: CardCtx): string {
  const d = ctx.decisions[item.id]
  if (!d) return ""
  const idField = `<input type="hidden" name="id" value="${esc(item.id)}">`
  const needsBackend = d.kind === "fresh"
  if (needsBackend && ctx.sessionBackend === "unconfigured") {
    return `<div class="actions"><span class="act disabled" title="opencode server not configured (--opencode-url / OPENCODE_SERVER_PASSWORD) — session creation unavailable">Start ⏻</span></div>`
  }
  if (d.kind === "refuse") {
    return `<div class="actions"><span class="act disabled" title="${esc(`${d.reason}: ${d.detail}`)}">Promote</span></div>`
  }
  if (d.kind === "fresh") {
    // Exhaustive on the fresh-reason union (Q16 added done-never-owned).
    switch (d.reason) {
      case "never-owned":
        return `<div class="actions"><form method="post" action="/transitions/start"${confirmAttrs("start", "Start a session?", "This creates a fresh top-level HIVE session, binds it, and runs /awaken seeded with the spec. Confirm to proceed.")}>${idField}<button class="act act-start" title="create a fresh top-level session, bind it, auto-/awaken seeded with the spec (§5.3c)">Start</button></form></div>`
      case "spec-changed":
        return `<div class="actions"><form method="post" action="/transitions/promote"${confirmAttrs("start", "Start a fresh session? (spec edited)", "The spec was edited after this item was demoted, so promotion creates a FRESH session (the edit is the decision, Q13) — the previous session is not reattached. Confirm to proceed.")}>${idField}<button class="act act-start" title="spec was edited after demote — promotion creates a FRESH session (Q13: the edit is the decision)">Start fresh session (spec edited)</button></form></div>`
      case "done-never-owned":
        return `<div class="actions"><form method="post" action="/transitions/promote"${confirmAttrs("start", "Reopen as a fresh session?", "This item was marked done without ever owning a session. Promotion un-does the done state (done→todo) and starts a FRESH session (Q16). Confirm to proceed.")}>${idField}<button class="act act-start" title="done without a session — promote un-does the item (done→todo) then starts a fresh session (Q16)">Reopen as fresh session</button></form></div>`
    }
  }
  const isReopen = d.reason === "done-reopen"
  const label = isReopen
    ? "Reopen — re-attach original session"
    : `Re-attach ${shortSes(d.sessionID)} (spec unchanged)`
  const confirm = isReopen
    ? confirmAttrs("start", "Reopen this item?", "This re-opens the item and RE-ATTACHES its original owning session by id — a deep link only; /awaken is never re-run (invariant 4). Confirm to proceed.")
    : confirmAttrs("start", "Re-attach session?", "This re-opens the existing owning session (deep link only; /awaken is not re-run). Confirm to proceed.")
  return `<div class="actions"><form method="post" action="/transitions/promote"${confirm}>${idField}<button class="act" title="re-attaches ${esc(d.sessionID)} — deep link only, /awaken is NEVER re-run (invariant 4)">${esc(label)}</button></form></div>`
}

function actionForms(item: WorkItem, ctx: CardCtx): string {
  if (item.status !== "in_progress") return promoteForm(item, ctx)
  const forms: string[] = []
  const idField = `<input type="hidden" name="id" value="${esc(item.id)}">`
  forms.push(
    item.paused
      ? `<form method="post" action="/transitions/unpause">${idField}<button class="act" title="resume — same owning session">Unpause</button></form>`
      : `<form method="post" action="/transitions/pause">${idField}<button class="act" title="park it; resume the same session later (§5.5)">Pause</button></form>`,
  )
  forms.push(
    `<form method="post" action="/transitions/demote"${confirmAttrs("warn", "Demote this item?", "This detaches and TOMBSTONES the owning session. The idea becomes fluid again and the session will not be reattached. Confirm to proceed.")}>${idField}<select name="to" class="act-select"><option value="todo">todo</option><option value="backlog">backlog</option></select><button class="act act-warn" title="true demote: detach + tombstone the session; the idea is fluid again (§5.5)">Demote</button></form>`,
  )
  if (!item.paused) {
    forms.push(
      `<form method="post" action="/transitions/done-without-dream"${confirmAttrs("warn", "Mark done without a dream?", "This is a terminal state and skips dreamtime — no artifacts will be linked and no consolidation happens (§5.4). Confirm to proceed.")}>${idField}<button class="act" title="manual done — skips dreamtime, badged no-dream (§5.4)">Done (no dream)</button></form>`,
    )
  }
  return `<div class="actions">${forms.join("")}</div>`
}

function createForm(status: "backlog" | "todo"): string {
  // data-key anchors this <details> across polls so the morph reuses the SAME
  // element — its open/closed state and any typed-in values survive a refresh
  // (bug #2 / W-034: transient state owned by a stable, non-recreated node).
  return `<details class="create" data-key="create:${status}"><summary>+ new item</summary>
  <form method="post" action="/transitions/create" class="create-form">
    <input type="hidden" name="status" value="${status}">
    <input name="title" placeholder="title" required>
    <select name="priority"><option value="medium">medium</option><option value="high">high</option><option value="low">low</option></select>
    <input name="tags" placeholder="tags, comma-separated">
    <textarea name="body" rows="3" placeholder="spec / notes (markdown)"></textarea>
    <button type="submit">Create in ${status}</button>
  </form></details>`
}

function itemCard(item: WorkItem, ctx: CardCtx): string {
  const { guiBaseUrl, mirror, writesEnabled } = ctx
  const chips: string[] = []
  if (item.priority) chips.push(`<span class="chip chip-prio-${esc(item.priority)}">${esc(item.priority)}</span>`)
  for (const t of item.tags) chips.push(`<span class="chip">${esc(t)}</span>`)
  if (item.paused) chips.push('<span class="badge badge-paused" title="parked — resume the same session (§5.5)">paused</span>')
  if (item.done_without_dream)
    chips.push('<span class="badge badge-nodream" title="done without a dream — consolidation skipped (§5.4)">no-dream</span>')
  for (const p of item.problems) chips.push(`<span class="badge badge-problem" title="${esc(p)}">⚠ invariant</span>`)

  const artifacts =
    item.artifacts.length > 0
      ? `<div class="cap-desc">produced: ${item.artifacts.map((a) => `<span class="chip mono">${esc(a)}</span>`).join(" ")}${
          item.dream_id ? ` <span class="dim mono">(${esc(item.dream_id)})</span>` : ""
        }</div>`
      : item.dream_id
        ? `<div class="cap-desc dim mono">dream: ${esc(item.dream_id)}</div>`
        : ""

  const body = item.body
    ? `<details class="spec"><summary>spec</summary><div class="spec-body">${esc(truncate(item.body, 600))}</div></details>`
    : ""

  // BOUNDED stopgap (data/placeholder-title.ts): if the frozen frontmatter
  // title is still opencode's auto-placeholder AND the owner session has a real
  // live title in the mirror, show that instead. Narrow fallback only — the WI
  // record stays authoritative for real titles (I-144). Absent mirror ⇒ no-op.
  const title = displayTitle(item.title, item.owner_session, mirror.sessionTitles)

  return `<div class="card wi ${item.paused ? "paused" : ""}" data-key="wi:${esc(item.id)}">
    <div class="cap-head">
      <span class="mono dim">${esc(item.id)}</span>
      <span class="cap-name">${esc(truncate(title, 90))}</span>
      ${openSessionHtml(item.owner_session, guiBaseUrl, mirror)}
    </div>
    <div class="chips">${chips.join(" ")}</div>
    ${subtaskLane(item.subtasks)}
    ${todoSubStateLane(ctx.todoSubStates[item.id])}
    ${artifacts}
    ${lineageHtml(item, guiBaseUrl, mirror)}
    ${body}
    ${writesEnabled ? actionForms(item, ctx) : ""}
  </div>`
}

function sessionOnlyCard(s: SessionCard): string {
  return `<div class="card session-only" data-key="ses:${esc(s.id)}">
    <div class="cap-head">
      <span class="cap-name">${esc(truncate(s.title, 80))}</span>
      <a class="open-link" href="${esc(s.openUrl)}" target="_blank" rel="noopener">Open ↗</a>
    </div>
    <div class="cap-desc mono">${esc(s.id)}</div>
    <div class="cap-desc dim">session-only — awakened, no work item yet · updated ${fmtTime(s.updated)}</div>
  </div>`
}

function column(title: string, cardsHtml: string[], extra = ""): string {
  return `<div class="col" data-key="col:${esc(title)}">
    <div class="col-head">${esc(title)} <span class="count">(${cardsHtml.length})</span></div>
    ${extra}
    ${cardsHtml.length === 0 ? '<div class="empty">—</div>' : cardsHtml.join("\n")}
  </div>`
}

function kanbanSection(
  board: BoardColumns,
  ctx: CardCtx,
): string {
  const card = (i: WorkItem) => itemCard(i, ctx)
  // In Progress interleaves WI cards with session-only cards into ONE
  // newest-first stream so the whole column reads consistently. Both keys are
  // comparable full-ISO timestamps: WI cards by their latest transitions[].at
  // (the same recency key board.ts sorts by — recomputed here to keep render
  // browser-safe, transitions[] is a WorkItem field), session cards by their
  // full-ISO `updated`. Ties fall back to a stable id/session-id compare.
  // `latestAt` mirrors board.ts#latestTransitionAt: NOT assuming the log is
  // sorted, falling back to date-only `updated` when transitions[] is empty.
  const latestAt = (i: WorkItem): string => {
    let max = ""
    for (const t of i.transitions) if (t.at && t.at > max) max = t.at
    return max || i.updated
  }
  type ProgressEntry = { key: string; tie: string; html: string }
  const progressEntries: ProgressEntry[] = [
    ...board.inProgress.map((i) => ({ key: latestAt(i), tie: i.id, html: card(i) })),
    ...board.sessionOnly.map((s) => ({ key: s.updated, tie: s.id, html: sessionOnlyCard(s) })),
  ]
  progressEntries.sort((a, b) => (a.key !== b.key ? b.key.localeCompare(a.key) : b.tie.localeCompare(a.tie)))
  const inProgress = progressEntries.map((e) => e.html)
  return `<div class="kanban">
    ${column("Backlog", board.backlog.map(card), ctx.writesEnabled ? createForm("backlog") : "")}
    ${column("Todo", board.todo.map(card), ctx.writesEnabled ? createForm("todo") : "")}
    ${column("In Progress", inProgress)}
    ${column("Done", board.done.map(card))}
  </div>`
}

/** Minimal page shell for transition results (refusals, lock retry, errors). */
export function renderMessagePage(title: string, fragments: string[]): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>hive-board — ${esc(title)}</title>
<style>${CSS}</style></head>
<body><h1>${esc(title)}</h1>${fragments.join("\n")}</body></html>`
}

// ── Session mirror diagnostics (Phase 1.5 back-fill) ─────────────────────────

function mirrorDiagnostics(m: SessionMirror): string {
  if (!m.available) {
    return `<div class="empty">session mirror unavailable — ${esc(m.error ?? "enumeration failed")} (unknown, not empty; item cards render from cache, "Open" disabled)</div>`
  }
  return `<div class="meta">session mirror: snapshot ${fmtTime(m.computedAt)} · ${m.awakeIds} awakened ids · ${m.awakeDeleted} deleted/placeholder excluded · ${m.totalPersisted} persisted sessions in workspace · restart viewer to recompute</div>`
}

// ── Messages ─────────────────────────────────────────────────────────────────

function messageRow(m: HivemindMessage): string {
  return `<tr>
    <td class="mono dim">${fmtTime(m.timestamp)}</td>
    <td class="mono">${esc(m.sender)} → ${esc(m.recipient)}</td>
    <td><span class="mtype mtype-${esc(m.type)}">${esc(m.type)}</span></td>
    <td><span class="status ${m.status === "pending" ? "pending" : "delivered"}">${esc(m.status)}</span></td>
    <td class="intent" title="${esc(truncate(m.content, 600))}">${esc(truncate(m.content, 140))}</td>
  </tr>`
}

// ── Page ─────────────────────────────────────────────────────────────────────

const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { background:#0d1117; color:#c9d1d9; font:14px/1.45 system-ui, sans-serif; margin:0; padding:1.5rem 2rem 4rem; }
h1 { font-size:1.3rem; margin:0; }
h1 .phase { color:#8b949e; font-weight:400; font-size:.85rem; margin-left:.6rem; }
h2 { font-size:1.05rem; margin:2rem 0 .8rem; border-bottom:1px solid #21262d; padding-bottom:.4rem; }
h2 .count { color:#8b949e; font-weight:400; font-size:.85rem; }
.meta { color:#8b949e; font-size:.8rem; margin-top:.3rem; }
.mono { font-family:ui-monospace, monospace; font-size:.85em; }
.dim { color:#8b949e; }
.build-badge { padding:.02rem .4rem; border-radius:10px; border:1px solid #30363d; background:#161b22; }
.build-badge.stale { color:#f85149; border-color:#f85149; background:#f8514922; font-weight:600; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:.8rem; }
.cap { background:#161b22; border:1px solid #21262d; border-radius:8px; padding:.7rem .9rem; }
.cap-head { display:flex; align-items:baseline; gap:.6rem; }
.cap-name { font-weight:600; }
.cap-domain { color:#8b949e; font-size:.75rem; }
.cap-energy { margin-left:auto; font-family:ui-monospace,monospace; font-size:.85rem; }
.cap-energy.dissolve { color:#f85149; } .cap-energy.split { color:#a371f7; }
.cap-energy.healthy { color:#3fb950; } .cap-energy.unknown { color:#8b949e; }
.cap-desc { color:#8b949e; font-size:.78rem; margin-top:.45rem; }
.bar { position:relative; height:8px; background:#21262d; border-radius:4px; margin-top:.55rem; overflow:hidden; }
.bar-fill { height:100%; border-radius:4px; }
.bar-fill.healthy { background:#3fb950; } .bar-fill.dissolve { background:#f85149; }
.bar-fill.split { background:#a371f7; } .bar-fill.unknown { background:#30363d; }
.bar-mark { position:absolute; top:0; bottom:0; width:1px; background:#8b949e88; }
.badge { font-size:.68rem; padding:.05rem .45rem; border-radius:10px; }
.badge-dissolve { background:#f8514922; color:#f85149; border:1px solid #f8514955; }
.badge-split { background:#a371f722; color:#a371f7; border:1px solid #a371f755; }
.tiles { display:flex; gap:.8rem; flex-wrap:wrap; margin-bottom:1rem; }
.tile { background:#161b22; border:1px solid #21262d; border-radius:8px; padding:.6rem 1.1rem; min-width:110px; }
.tile .n { font-size:1.5rem; font-weight:700; }
.tile .l { color:#8b949e; font-size:.75rem; }
.tile.insight .n { color:#58a6ff; } .tile.warning .n { color:#d29922; }
.tile.songline .n { color:#3fb950; } .tile.shadow .n { color:#a371f7; }
table { width:100%; border-collapse:collapse; font-size:.82rem; }
th { text-align:left; color:#8b949e; font-weight:500; padding:.3rem .55rem; border-bottom:1px solid #21262d; }
td { padding:.3rem .55rem; border-bottom:1px solid #161b22; vertical-align:top; }
tr.active-dream td { background:#1c2128; }
.intent { color:#b1bac4; }
.status { font-size:.72rem; padding:.05rem .45rem; border-radius:10px; border:1px solid transparent; }
.status.complete { color:#3fb950; border-color:#3fb95055; }
.status.dreaming { color:#d29922; border-color:#d2992255; animation:pulse 1.6s infinite; }
.status.pending { color:#d29922; border-color:#d2992255; }
.status.delivered { color:#58a6ff; border-color:#58a6ff55; }
.status.unknown { color:#8b949e; border-color:#30363d; }
@keyframes pulse { 50% { opacity:.45; } }
.atype, .mtype { font-size:.72rem; padding:.05rem .45rem; border-radius:10px; background:#21262d; }
.atype-insight { color:#58a6ff; } .atype-warning { color:#d29922; }
.atype-songline { color:#3fb950; } .atype-shadow { color:#a371f7; }
.mtype-question { color:#d29922; } .mtype-result { color:#3fb950; }
.mtype-info { color:#58a6ff; } .mtype-request { color:#a371f7; }
.empty { color:#8b949e; font-style:italic; padding:.5rem 0; }
.panel { background:#161b22; border:1px solid #21262d; border-radius:8px; padding:.8rem 1rem; margin-bottom:1rem; }
.open-link { margin-left:auto; color:#58a6ff; text-decoration:none; font-size:.8rem; white-space:nowrap; }
.open-link:hover { text-decoration:underline; }
.open-link.disabled { color:#484f58; cursor:not-allowed; }
.kanban { display:grid; grid-template-columns:repeat(4,1fr); gap:.8rem; align-items:start; }
@media (max-width:1100px) { .kanban { grid-template-columns:repeat(2,1fr); } }
.col { background:#10141a; border:1px solid #21262d; border-radius:10px; padding:.6rem; min-height:80px; }
.col-head { font-weight:600; font-size:.85rem; color:#8b949e; padding:.15rem .3rem .5rem; text-transform:uppercase; letter-spacing:.04em; }
.card { background:#161b22; border:1px solid #21262d; border-radius:8px; padding:.6rem .8rem; margin-bottom:.6rem; }
.card.wi { border-left:3px solid #3fb950; }
.card.wi.paused { opacity:.55; border-left-color:#8b949e; }
.card.session-only { border-left:3px solid #d29922; border-style:solid solid solid dashed; }
.chips { margin-top:.35rem; display:flex; flex-wrap:wrap; gap:.3rem; }
.chip { font-size:.68rem; padding:.05rem .45rem; border-radius:10px; background:#21262d; color:#8b949e; }
.chip-prio-high { color:#f85149; } .chip-prio-medium { color:#d29922; } .chip-prio-low { color:#58a6ff; }
.badge-paused { background:#8b949e22; color:#8b949e; border:1px solid #8b949e55; }
.badge-nodream { background:#d2992222; color:#d29922; border:1px solid #d2992255; }
.badge-problem { background:#f8514922; color:#f85149; border:1px solid #f8514955; }
.lane { margin-top:.45rem; display:flex; gap:.5rem; align-items:baseline; }
.lane-count { font-family:ui-monospace,monospace; font-size:.72rem; color:#8b949e; white-space:nowrap; }
.lane ul { list-style:none; margin:0; padding:0; font-size:.75rem; }
.lane .st { color:#8b949e; }
.lane .st-completed { text-decoration:line-through; opacity:.6; }
.lane .st-in_progress { color:#d29922; }
.lane .st-cancelled { text-decoration:line-through; opacity:.35; }
.st-icon { display:inline-block; width:1.1em; }
.todos { margin-top:.5rem; padding-top:.45rem; border-top:1px dashed #21262d; }
.todo-head { display:flex; align-items:center; gap:.5rem; }
.todo-label { font-size:.66rem; text-transform:uppercase; letter-spacing:.05em; color:#8b949e; }
.todo-count { font-size:.72rem; color:#c9d1d9; }
.todo-cached { font-size:.6rem; padding:.02rem .35rem; border-radius:8px; background:#8b949e22; color:#8b949e; border:1px solid #8b949e44; }
.todo-bar { flex:1; height:5px; background:#21262d; border-radius:3px; overflow:hidden; min-width:40px; }
.todo-bar-fill { height:100%; background:#3fb950; border-radius:3px; transition:width .3s; }
.todo-current { margin-top:.35rem; font-size:.75rem; color:#d29922; }
.todo-current.dim { color:#8b949e; }
.todo-current .st-icon { color:#d29922; }
.todo-list > summary { font-size:.68rem; color:#8b949e; margin:.35rem 0 0; }
.todo-list ul { list-style:none; margin:.3rem 0 0; padding:0; font-size:.75rem; }
.todo-list .st { color:#8b949e; }
.todo-list .st-completed { text-decoration:line-through; opacity:.6; }
.todo-list .st-in_progress { color:#d29922; }
.todo-list .st-cancelled { text-decoration:line-through; opacity:.35; }
.lineage { margin-top:.4rem; font-size:.7rem; color:#484f58; }
.lineage a { color:#58a6ff88; }
.spec > summary { font-size:.72rem; margin:.35rem 0 0; }
.spec-body { font-size:.75rem; color:#8b949e; white-space:pre-wrap; margin-top:.3rem; }
.actions { margin-top:.5rem; display:flex; flex-wrap:wrap; gap:.35rem; align-items:center; }
.actions form { display:flex; gap:.25rem; align-items:center; margin:0; }
.act { background:#21262d; color:#c9d1d9; border:1px solid #30363d; border-radius:6px; font-size:.7rem; padding:.15rem .5rem; cursor:pointer; }
.act:hover { background:#30363d; }
.act-warn { color:#f85149; border-color:#f8514955; }
.act-start { background:#238636; color:#fff; border-color:#2ea043; }
.act.disabled { opacity:.45; cursor:not-allowed; }
.notices { margin:.6rem 0 1rem; }
.notice { background:#d2992218; border:1px solid #d2992255; color:#d29922; border-radius:8px; padding:.5rem .8rem; font-size:.8rem; margin-bottom:.4rem; }
.act-select { background:#0d1117; color:#c9d1d9; border:1px solid #30363d; border-radius:6px; font-size:.7rem; padding:.1rem; }
.create > summary { font-size:.75rem; color:#58a6ff; cursor:pointer; margin:.2rem .3rem .5rem; }
.create-form { display:flex; flex-direction:column; gap:.35rem; background:#161b22; border:1px solid #21262d; border-radius:8px; padding:.6rem; margin-bottom:.6rem; }
.create-form input, .create-form textarea, .create-form select { background:#0d1117; color:#c9d1d9; border:1px solid #30363d; border-radius:6px; font-size:.78rem; padding:.3rem .45rem; font-family:inherit; }
.create-form button { background:#238636; color:#fff; border:none; border-radius:6px; font-size:.75rem; padding:.35rem; cursor:pointer; }
.refusal-code { color:#f85149; font-size:1.1rem; }
body > form button, .retry button { background:#238636; color:#fff; border:none; border-radius:6px; padding:.4rem .8rem; cursor:pointer; }
details > summary { cursor:pointer; color:#8b949e; font-size:.85rem; margin:.5rem 0; }

/* ── Confirmation modal (I-206) ─────────────────────────────────────────────
   Centered dark overlay + scrim, GitHub-ish palette to match the board. Lives
   in the page shell OUTSIDE #board-root so the poll morph never touches it. */
.modal-scrim { position:fixed; inset:0; z-index:1000; display:flex;
  align-items:center; justify-content:center; padding:1rem;
  background:#010409cc; -webkit-backdrop-filter:blur(1px); backdrop-filter:blur(1px); }
.modal-scrim[hidden] { display:none; }
.modal { background:#161b22; border:1px solid #30363d; border-radius:12px;
  box-shadow:0 12px 40px #000a; padding:1.2rem 1.3rem 1.1rem; width:min(30rem,100%);
  max-height:90vh; overflow:auto; }
.modal-title { font-size:1.05rem; margin:0 0 .55rem; border:none; padding:0; color:#f0f6fc; }
.modal-body { color:#c9d1d9; font-size:.88rem; line-height:1.5; margin:0 0 1.1rem; }
.modal-body strong { color:#f0f6fc; }
.modal-actions { display:flex; justify-content:flex-end; gap:.6rem; }
.modal .act { font-size:.85rem; padding:.45rem .95rem; border-radius:6px; }
.modal-cancel { background:#21262d; color:#c9d1d9; border:1px solid #30363d; }
.modal-cancel:hover { background:#30363d; }
.modal-confirm { background:#238636; color:#fff; border:1px solid #2ea043; font-weight:600; }
.modal-confirm:hover { background:#2ea043; }
.modal-confirm.warn { background:#da3633; border-color:#f85149; }
.modal-confirm.warn:hover { background:#f85149; }

`

/**
 * The mutable board content — everything below the page shell that changes on
 * a poll. Rendered identically by the server (initial paint) and the client
 * (each poll → morphed into #board-root, never a full-document rebuild). It is
 * a PURE function of BoardState (+ transient notices), so the client can call
 * it with a freshly-fetched /api/state and diff the result. `data-key` markers
 * anchor the morph's keyed reconciliation to stable regions and cards.
 */
export function renderBoardBody(state: BoardState, notices: Notice[] = []): string {
  const caps = state.capabilities
  const { dreams, messages } = state
  const cardCtx: CardCtx = {
    guiBaseUrl: state.guiBaseUrl,
    mirror: state.sessions,
    writesEnabled: state.writesEnabled,
    sessionBackend: state.sessionBackend,
    decisions: state.promoteDecisions,
    todoSubStates: state.todoSubStates,
  }
  const noticesHtml =
    notices.length === 0
      ? ""
      : `<div class="notices">${notices
          .map((n) => `<div class="notice"><span class="mono dim">${fmtTime(n.at)}</span> ${esc(n.text)}</div>`)
          .join("")}</div>`

  const activeSection =
    dreams.active.length === 0
      ? '<div class="empty">no active dream — the hive is awake</div>'
      : `<div class="panel">${dreams.active
          .map(
            (d) => `<strong class="mono">${esc(d.id)}</strong>
              <span class="status dreaming">DREAMING</span>
              <span class="dim"> depth ${d.depth ?? "?"} · ${esc(d.intentionType ?? "?")} · entered ${fmtTime(d.entryTime)}</span>
              <div class="intent" style="margin-top:.4rem">${esc(d.intention ?? "")}</div>`,
          )
          .join("<hr>")}</div>`

  const historyRows = dreams.history.map((d) => dreamRow(d, false)).join("\n")
  const recentRows = dreams.recentArtifacts.map(recentArtifactRow).join("\n")
  const messageRows = messages.map(messageRow).join("\n")

  return `<h1>hive-board <span class="phase">Phase 1 · read-only HIVE state viewer</span></h1>
<div class="meta mono">workspace ${esc(state.workspaceRoot)} · generated ${esc(state.generatedAt)} · live refresh 15s · ${buildBadge(state.buildSha)}</div>

<h2>Board <span class="count">(${state.items.length} items · ${state.board.sessionOnly.length} session-only)</span></h2>
${noticesHtml}
${kanbanSection(state.board, cardCtx)}
${state.writesEnabled ? "" : '<div class="meta">fixture mode — write affordances disabled (transitions only ever write the workspace board)</div>'}
${mirrorDiagnostics(state.sessions)}

<h2>Capabilities <span class="count">(${caps.length})</span></h2>
${caps.length === 0 ? '<div class="empty">no capabilities found</div>' : `<div class="grid">${caps.map(capabilityRow).join("\n")}</div>`}

<h2>Dream archive</h2>
<div class="tiles">
  <div class="tile insight"><div class="n">${dreams.artifactCounts.insight}</div><div class="l">insights</div></div>
  <div class="tile warning"><div class="n">${dreams.artifactCounts.warning}</div><div class="l">warnings</div></div>
  <div class="tile songline"><div class="n">${dreams.artifactCounts.songline}</div><div class="l">songlines</div></div>
  <div class="tile shadow"><div class="n">${dreams.artifactCounts.shadow}</div><div class="l">shadows</div></div>
  <div class="tile"><div class="n">${dreams.artifactCounts.total}</div><div class="l">total artifacts</div></div>
  <div class="tile"><div class="n">${dreams.history.length}</div><div class="l">dreams dreamt</div></div>
</div>

<h3>Active dream</h3>
${activeSection}

${
  dreams.recentArtifacts.length > 0
    ? `<details open><summary>Recent artifacts</summary>
<table><thead><tr><th>id</th><th>type</th><th>dream</th><th>summary</th></tr></thead>
<tbody>${recentRows}</tbody></table></details>`
    : ""
}

<details><summary>DRM history (${dreams.history.length})</summary>
<table>
<thead><tr><th>id</th><th>status</th><th>depth</th><th>type</th><th>intention</th><th>artifacts</th><th>time</th></tr></thead>
<tbody>${historyRows}</tbody>
</table></details>

<h2>HIVEmind message flow <span class="count">(${messages.length} pending/delivered)</span></h2>
${
  messages.length === 0
    ? '<div class="empty">no live messages — all inboxes clear</div>'
    : `<table>
<thead><tr><th>time</th><th>route</th><th>type</th><th>status</th><th>content</th></tr></thead>
<tbody>${messageRows}</tbody>
</table>`
}`
}

/**
 * Full document shell. The board content lives in <main id="board-root">, and
 * a client module (client.js) polls /api/state and morphs that subtree in
 * place — NO meta-refresh, so no full-document rebuild (the old flicker + form
 * collapse root cause). The initial BoardState is inlined as a JSON island so
 * the client's first diff has a baseline without an extra fetch.
 */
export function renderPage(state: BoardState, notices: Notice[] = []): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hive-board — mission control</title>
<style>${CSS}</style>
</head>
<body>
<main id="board-root">${renderBoardBody(state, notices)}</main>
${confirmModalHtml()}
<script id="board-state" type="application/json">${jsonIsland(state)}</script>
<script type="module" src="/client.js"></script>
</body>
</html>`
}

/**
 * The confirmation modal (I-206) lives in the page SHELL, deliberately OUTSIDE
 * <main id="board-root"> — the only subtree the poll morph touches (client.ts /
 * morph.ts). A modal is browser-owned transient UI state the markup doesn't
 * carry (like open <details> / focus), so a poll landing while it's open would
 * rip it out mid-decision (I-186). Keeping it out of the morphed region means
 * the morph physically cannot reach it — no preserve-list entry needed, the
 * cleanest guarantee. Hidden by default; the intercept script (client.ts) fills
 * the title/body, sets the Confirm severity class, and toggles [hidden].
 */
function confirmModalHtml(): string {
  return `<div id="confirm-modal" class="modal-scrim" hidden role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body">
  <div class="modal">
    <h2 id="confirm-title" class="modal-title"></h2>
    <p id="confirm-body" class="modal-body"></p>
    <div class="modal-actions">
      <button type="button" id="confirm-cancel" class="act modal-cancel">Cancel</button>
      <button type="button" id="confirm-ok" class="act modal-confirm">Confirm</button>
    </div>
  </div>
</div>`
}

/**
 * Serialize BoardState for the inline JSON island. `</script` is escaped so a
 * string value in the state can never break out of the script element.
 */
function jsonIsland(state: BoardState): string {
  return JSON.stringify(state).replaceAll("</", "<\\/")
}
