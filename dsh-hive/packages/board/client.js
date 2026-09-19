// @hive/dsh-board — GENERATED client bundle (WI-062 slice 3). DO NOT EDIT BY HAND.
// Build: dsh-hive/packages/board/scripts/build-client.ts (bun) — bundles
// websrc/client-main.ts (the ported 4400 viewer engine + the tab engine) into
// the twin classic shape; the wrapper below is the only React-using code and
// takes React from the loader's runtime module table (W-044).
// Build stamp (both sides of the I-152 staleness verdict): 06a5c44-dirty
(()=>{function S(W){let Z=new Set;for(let $ of W.transitions){if($.superseded!==void 0)continue;if($.session&&$.session!==W.owner_session)Z.add($.session)}return[...Z]}function v(W){return W.transitions.filter((Z)=>typeof Z.superseded==="string"&&Z.superseded!=="").map((Z)=>({at:Z.at,by:Z.by,...Z.session?{session:Z.session}:{},supersededHash:Z.superseded}))}function b(W){return W.transitions.filter((Z)=>typeof Z.absorbed==="string"&&Z.absorbed!=="").map((Z)=>({id:Z.absorbed,at:Z.at}))}var q0=/^New session - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;function f(W){if(W==null)return!0;let Z=W.trim();if(Z==="")return!0;return q0.test(Z)}function z0(W){return W!=null&&W.trim()!==""&&!f(W)}function g(W,Z,$){if(!f(W))return W;if(!Z||!$)return W;let J=$[Z];return z0(J)?J:W}function F(W){let Z="";for(let $ of W.transitions)if($.at&&$.at>Z)Z=$.at;return Z||W.updated}function h(W){let Z=0,$=0,J=0,Q=0,X=null;for(let Y of W)switch(Y.status){case"completed":Z++;break;case"in_progress":if($++,X===null)X=Y.content;break;case"pending":J++;break;case"cancelled":Q++;break}return{total:W.length,completed:Z,inProgress:$,pending:J,cancelled:Q,current:X}}var K0={field:"#0d1117",panel:"#161b22",border:"#30363d",edge:"#30363d",node:"#484f58",strata:"#30363d",divider:"#8b949e",amber:"#d29922",red:"#f85149"},P6=K0.field;function V(W){return W.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}function G(W,Z){return W.length>Z?W.slice(0,Z-1)+"…":W}function R(W){if(!W)return"—";let Z=new Date(W);return Number.isNaN(Z.getTime())?W:Z.toISOString().replace("T"," ").slice(0,16)+"Z"}function j0(W){let Z=W==="unknown"?"build unknown":`build ${V(W)}`,$=W==="unknown"?"git unavailable — running build could not be identified":"server build SHA — HEAD of the HIVE plugin repo, which ships this viewer";return`<span id="build-badge" class="build-badge" data-server-sha="${V(W)}" title="${V($)}">${Z}</span>`}function M0(W,Z){if(!W)return"absent";if(!Z.available)return"unknown";return Z.persistedIds.includes(W)?"exists":"absent"}function U0(W,Z,$){if(!W)return"";return`<a class="open-link" href="${V(`${Z}/?session=${W}`)}" target="_blank" rel="noopener" title="open in web GUI">Open ↗</a>`}var B0={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function _0(W){if(W.length===0)return"";let Z=W.filter((J)=>J.status==="completed").length,$=W.map((J)=>`<li class="st st-${V(J.status)}"><span class="st-icon">${B0[J.status]??"?"}</span>${V(G(J.content,70))}</li>`).join("");return`<div class="lane"><span class="lane-count">${Z}/${W.length}</span><ul>${$}</ul></div>`}var H0={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function F0(W){if(!W||W.source==="none"||W.todos.length===0)return"";let Z=h(W.todos),$=Z.total-Z.cancelled,J=$>0?Math.round(Z.completed/$*100):0,Q=W.source==="mirror"?' <span class="todo-cached" title="session not reachable now — showing the last mirrored snapshot (may lag)">cached</span>':"",X=Z.current?`<div class="todo-current" title="${V(Z.current)}"><span class="st-icon">▸</span>${V(G(Z.current,72))}</div>`:Z.inProgress===0&&Z.pending>0?`<div class="todo-current dim">${Z.pending} pending — none in progress</div>`:"",Y=W.todos.map((q)=>`<li class="st st-${V(q.status)}"><span class="st-icon">${H0[q.status]??"?"}</span>${V(G(q.content,70))}</li>`).join("");return`<div class="todos" title="owning session TodoWrite progress (WI-038)">
    <div class="todo-head">
      <span class="todo-label">activity</span>
      <span class="todo-count mono">${Z.completed}/${$}</span>${Q}
      <div class="todo-bar"><div class="todo-bar-fill" style="width:${J}%"></div></div>
    </div>
    ${X}
    <details class="todo-list"><summary>${W.todos.length} todo${W.todos.length===1?"":"s"}</summary><ul>${Y}</ul></details>
  </div>`}function P0(W){let Z=v(W);if(Z.length===0)return"";let $=Z[Z.length-1],J=Z.map((X)=>{let Y=X.session?` <span class="mono dim">${V(p(X.session))}</span>`:"",q=`superseded body — board/${W.id}/${X.supersededHash}.md`;return`<li><span class="mono dim">${V(R(X.at))}</span> ${V(X.by)}${Y} <span class="mono dim" title="${V(q)}">${V(X.supersededHash)}</span></li>`}).join("");return`<details class="revisions"><summary>spec revised ${Z.length===1?"once":`${Z.length}×`}<span class="dim"> · latest ${V(R($.at))}</span></summary><ul>${J}</ul></details>`}function G0(W,Z,$){let J=[],Q=S(W);if(Q.length>0){let X=Q.map((Y)=>M0(Y,$)==="exists"?`<a href="${V(`${Z}/?session=${Y}`)}" target="_blank" rel="noopener" class="mono">${V(Y)}</a>`:`<span class="mono" title="session not available here">${V(Y)}</span>`).join(", ");J.push(`previously attempted in ${X}`)}for(let X of b(W))J.push(`absorbed <span class="mono">${V(X.id)}</span> at bind${X.at?` (${R(X.at)})`:""}`);if(J.length===0)return"";return`<div class="lineage">${J.join(" · ")}</div>`}function p(W){return W.length>16?W.slice(0,16)+"…":W}function m(W,Z){if(!W)return"";let $=Z.actionRequired[W];if(!$)return"";let J=[];if($.awaitingQuestion){let Q=$.questionCount>1?` (${$.questionCount})`:"",X=$.questionHeader?`the owning session is asking: "${$.questionHeader}" — answer it in the session (WI-043)`:"the owning session is waiting on an answer to a question (WI-043)";J.push(`<span class="badge badge-action badge-action-question" title="${V(X)}">❓ needs answer${Q}</span>`)}if($.awaitingPermission){let Q=$.permissionCount>1?` (${$.permissionCount})`:"";J.push(`<span class="badge badge-action badge-action-permission" title="the owning session is waiting on a command/permission approval (WI-043)">✋ needs approval${Q}</span>`)}return J.join(" ")}function d(W,Z){if(!W)return"";let $=Z.actionRequired[W];if($&&($.awaitingQuestion||$.awaitingPermission))return"";let J=Z.sessionStatus[W];if(!J)return"";switch(J){case"busy":return'<span class="badge badge-status badge-status-busy" title="the owning session is actively processing (WI-044)">⚙ working</span>';case"retry":return'<span class="badge badge-status badge-status-retry" title="the owning session hit a provider error and is retrying (WI-044)">⟳ retrying</span>';case"idle":return`<span class="badge badge-status badge-status-idle" title="the owning session is idle — not currently processing (this is NOT 'done'; completion is dream/column-driven) (WI-044)">✓ idle</span>`}}function P(W,Z,$){return` data-confirm="1" data-confirm-severity="${W}" data-confirm-title="${V(Z)}" data-confirm-body="${V($)}"`}function D0(W,Z){let $=Z.decisions[W.id];if(!$)return"";let J=`<input type="hidden" name="id" value="${V(W.id)}">`;if($.kind==="fresh"&&Z.sessionBackend==="unconfigured")return'<div class="actions"><span class="act disabled" title="opencode server not configured (--opencode-url / OPENCODE_SERVER_PASSWORD) — session creation unavailable">Start ⏻</span></div>';if($.kind==="refuse")return`<div class="actions"><span class="act disabled" title="${V(`${$.reason}: ${$.detail}`)}">Promote</span></div>`;if($.kind==="fresh")switch($.reason){case"never-owned":return`<div class="actions"><form method="post" action="/transitions/start"${P("start","Start a session?","This creates a fresh top-level HIVE session, binds it, and runs /awaken seeded with the spec. Confirm to proceed.")}>${J}<button class="act act-start" title="create a fresh top-level session, bind it, auto-/awaken seeded with the spec (§5.3c)">Start</button></form></div>`;case"spec-changed":return`<div class="actions"><form method="post" action="/transitions/promote"${P("start","Start a fresh session? (spec edited)","The spec was edited after this item was demoted, so promotion creates a FRESH session (the edit is the decision, Q13) — the previous session is not reattached. Confirm to proceed.")}>${J}<button class="act act-start" title="spec was edited after demote — promotion creates a FRESH session (Q13: the edit is the decision)">Start fresh session (spec edited)</button></form></div>`;case"done-never-owned":return`<div class="actions"><form method="post" action="/transitions/promote"${P("start","Reopen as a fresh session?","This item was marked done without ever owning a session. Promotion un-does the done state (done→todo) and starts a FRESH session (Q16). Confirm to proceed.")}>${J}<button class="act act-start" title="done without a session — promote un-does the item (done→todo) then starts a fresh session (Q16)">Reopen as fresh session</button></form></div>`}let X=$.reason==="done-reopen",Y=X?"Reopen — re-attach original session":`Re-attach ${p($.sessionID)} (spec unchanged)`;return`<div class="actions"><form method="post" action="/transitions/promote"${X?P("start","Reopen this item?","This re-opens the item and RE-ATTACHES its original owning session by id — a deep link only; /awaken is never re-run (invariant 4). Confirm to proceed."):P("start","Re-attach session?","This re-opens the existing owning session (deep link only; /awaken is not re-run). Confirm to proceed.")}>${J}<button class="act" title="re-attaches ${V($.sessionID)} — deep link only, /awaken is NEVER re-run (invariant 4)">${V(Y)}</button></form></div>`}function O0(W,Z){if(W.status!=="in_progress")return D0(W,Z);let $=[],J=`<input type="hidden" name="id" value="${V(W.id)}">`;if($.push(W.paused?`<form method="post" action="/transitions/unpause">${J}<button class="act" title="resume — same owning session">Unpause</button></form>`:`<form method="post" action="/transitions/pause">${J}<button class="act" title="park it; resume the same session later (§5.5)">Pause</button></form>`),$.push(`<form method="post" action="/transitions/demote"${P("warn","Demote this item?","This detaches and TOMBSTONES the owning session. The idea becomes fluid again and the session will not be reattached. Confirm to proceed.")}>${J}<select name="to" class="act-select"><option value="todo">todo</option><option value="backlog">backlog</option></select><button class="act act-warn" title="true demote: detach + tombstone the session; the idea is fluid again (§5.5)">Demote</button></form>`),!W.paused)$.push(`<form method="post" action="/transitions/done-without-dream"${P("warn","Mark done without a dream?","This is a terminal state and skips dreamtime — no artifacts will be linked and no consolidation happens (§5.4). Confirm to proceed.")}>${J}<button class="act" title="manual done — skips dreamtime, badged no-dream (§5.4)">Done (no dream)</button></form>`);return`<div class="actions">${$.join("")}</div>`}function u(W){return`<details class="create" data-key="create:${W}"><summary>+ new item</summary>
  <form method="post" action="/transitions/create" class="create-form">
    <input type="hidden" name="status" value="${W}">
    <input name="title" placeholder="title" required>
    <select name="priority"><option value="medium">medium</option><option value="high">high</option><option value="low">low</option></select>
    <input name="tags" placeholder="tags, comma-separated">
    <textarea name="body" rows="3" placeholder="spec / notes (markdown)"></textarea>
    <button type="submit">Create in ${W}</button>
  </form></details>`}function N0(W,Z){let{guiBaseUrl:$,mirror:J,writesEnabled:Q}=Z,X=[],Y=m(W.owner_session,Z);if(Y)X.push(Y);let q=d(W.owner_session,Z);if(q)X.push(q);if(W.priority)X.push(`<span class="chip chip-prio-${V(W.priority)}">${V(W.priority)}</span>`);for(let M of W.tags)X.push(`<span class="chip">${V(M)}</span>`);if(W.paused)X.push('<span class="badge badge-paused" title="parked — resume the same session (§5.5)">paused</span>');if(W.done_without_dream)X.push('<span class="badge badge-nodream" title="done without a dream — consolidation skipped (§5.4)">no-dream</span>');for(let M of W.problems)X.push(`<span class="badge badge-problem" title="${V(M)}">⚠ invariant</span>`);let K=W.artifacts.length>0?`<div class="cap-desc">produced: ${W.artifacts.map((M)=>`<span class="chip mono">${V(M)}</span>`).join(" ")}${W.dream_id?` <span class="dim mono">(${V(W.dream_id)})</span>`:""}</div>`:W.dream_id?`<div class="cap-desc dim mono">dream: ${V(W.dream_id)}</div>`:"",j=W.body?`<details class="spec"><summary>spec</summary><div class="spec-body">${V(G(W.body,600))}</div></details>`:"",U=g(W.title,W.owner_session,J.sessionTitles);return`<div class="card wi ${W.paused?"paused":""}" data-key="wi:${V(W.id)}">
    <div class="cap-head">
      <span class="mono dim">${V(W.id)}</span>
      <span class="cap-name">${V(G(U,90))}</span>
      ${U0(W.owner_session,$,J)}
    </div>
    <div class="chips">${X.join(" ")}</div>
    ${_0(W.subtasks)}
    ${F0(Z.todoSubStates[W.id])}
    ${K}
    ${P0(W)}
    ${G0(W,$,J)}
    ${j}
    ${Q?O0(W,Z):""}
  </div>`}function R0(W,Z){let $=m(W.id,Z),J=d(W.id,Z),Q=[$,J].filter(Boolean).join(" ");return`<div class="card session-only" data-key="ses:${V(W.id)}">
    <div class="cap-head">
      <span class="cap-name">${V(G(W.title,80))}</span>
      <a class="open-link" href="${V(W.openUrl)}" target="_blank" rel="noopener">Open ↗</a>
    </div>
    ${Q?`<div class="chips">${Q}</div>`:""}
    <div class="cap-desc mono">${V(W.id)}</div>
    <div class="cap-desc dim">session-only — awakened, no work item yet · updated ${R(W.updated)}</div>
  </div>`}function k(W,Z,$=""){return`<div class="col" data-key="col:${V(W)}" data-col="${V(W)}">
    <div class="col-head"><button type="button" class="col-toggle" data-col-toggle="${V(W)}" aria-pressed="false" title="collapse/expand this column (survives refresh)">${V(W)} <span class="count">(${Z.length})</span><span class="col-toggle-icon" aria-hidden="true">▾</span></button></div>
    <div class="col-body">
      ${$}
      ${Z.length===0?'<div class="empty">—</div>':Z.join(`
`)}
    </div>
  </div>`}function L0(W){let Z=W.map(($)=>{let J=Array.isArray($.tags)?$.tags:[];return{id:$.id,status:$.status,title:$.title??"",tags:J,hay:`${$.id} ${$.title??""} ${J.join(" ")} ${$.body??""}`.toLowerCase()}});return JSON.stringify(Z).replaceAll("</","<\\/")}function k0(W,Z,$){let J=(q)=>N0(q,Z),Q=[...W.inProgress.map((q)=>({key:F(q),tie:q.id,html:J(q)})),...W.sessionOnly.map((q)=>({key:q.updated,tie:q.id,html:R0(q,Z)}))];Q.sort((q,K)=>q.key!==K.key?K.key.localeCompare(q.key):K.tie.localeCompare(q.tie));let X=Q.map((q)=>q.html);return`${`<script id="filter-corpus" type="application/json" data-key="filter:corpus">${L0($)}</script>`}<div class="kanban">
    ${k("Backlog",W.backlog.map(J),Z.writesEnabled?u("backlog"):"")}
    ${k("Todo",W.todo.map(J),Z.writesEnabled?u("todo"):"")}
    ${k("In Progress",X)}
    ${k("Done",W.done.map(J))}
  </div>`}var c=`
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { background:#0d1117; color:#c9d1d9; font:14px/1.45 system-ui, sans-serif; margin:0; padding:1.5rem 2rem 4rem; }
h1 { font-size:1.3rem; margin:0; display:flex; align-items:center; gap:.55rem; flex-wrap:wrap; }
h1 .phase { color:#8b949e; font-weight:400; font-size:.85rem; margin-left:.6rem; }
/* The full mark beside the <h1> (icon.ts). Unlike the favicon — which is a
   static data: URI by decision, since browsers won't animate SVG favicons and
   background tabs clamp timers to ~1fps — this is a real element in the
   document, so the lit mesh and a dreaming stratum may breathe. Motion is
   OPT-IN: everything below sits inside prefers-reduced-motion:no-preference,
   so a user who asked for stillness gets the identical mark, held still. */
.hb-mark { display:inline-flex; flex:0 0 auto; line-height:0; }
.hb-mark svg { display:block; }
@media (prefers-reduced-motion: no-preference) {
  .hb-mark svg .lit { animation:mark-breathe 2.4s ease-in-out infinite; }
  .hb-mark svg g.dreaming { animation:mark-breathe 3.4s ease-in-out infinite; }
}
@keyframes mark-breathe { 50% { opacity:.55; } }
h2 { font-size:1.05rem; margin:2rem 0 .8rem; border-bottom:1px solid #21262d; padding-bottom:.4rem; }
h2 .count { color:#8b949e; font-weight:400; font-size:.85rem; }
.meta { color:#8b949e; font-size:.8rem; margin-top:.3rem; }
.mono { font-family:ui-monospace, monospace; font-size:.85em; }
.dim { color:#8b949e; }
.build-badge { padding:.02rem .4rem; border-radius:10px; border:1px solid #30363d; background:#161b22; }
.build-badge.stale { color:#f85149; border-color:#f85149; background:#f8514922; font-weight:600; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:.8rem; }
.cap { background:#161b22; border:1px solid #21262d; border-radius:8px; padding:.7rem .9rem; }
.cap-head { display:flex; align-items:baseline; gap:.6rem; flex-wrap:wrap; }
.cap-name { font-weight:600; min-width:0; overflow-wrap:anywhere; }
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
/* ── Board controls (WI-084): filter bar + collapse strip ───────────────────
   Lives in the page shell OUTSIDE #board-root (I-219) so typed text / focus /
   chip selection survive the 15s poll morph for free. All styling is on the
   controls themselves; the board-side verdicts ride as classes on the cards
   (.filter-hidden / .collapsed above). */
#board-controls { position:sticky; top:0; z-index:50; background:#0d1117; padding:.5rem 0 .6rem; margin-bottom:.4rem; }
/* The whole-controls collapse (mobile-space follow-up): #controls-row is the
   one-line compact strip that is ALWAYS visible (toggle + search + active-
   filter summary); #controls-panel is everything below it. The client toggles
   .controls-collapsed on #board-controls; the class is shell-side so the poll
   morph cannot touch it. No fixed positioning — expanded, the panel is plain
   normal flow and the page scrolls exactly as before; collapsing simply
   returns the space. */
#controls-row { display:flex; align-items:center; gap:.45rem; }
#controls-toggle { flex:0 1 auto; min-width:0; background:#21262d; color:#8b949e; border:1px solid #30363d; border-radius:6px; font-size:.72rem; padding:.25rem .6rem; cursor:pointer; font-family:inherit; white-space:nowrap; }
#controls-toggle:hover { background:#30363d; color:#c9d1d9; }
/* When collapsed, the summary — not the search input — is the row's flexible
   element (flex:1 1 auto): it takes exactly what the toggle + input leave.
   Its own overflow is honest: children wider than the box are clipped by
   overflow:hidden (that's how the query ellipsizes). Priority INSIDE the
   summary: the query text (.summary-q) is the shrinkable element — it can
   shrink to zero and ellipsize; chips, the "+N more" fold and the N/M
   verdict are pinned flex:0 0 auto so the verdict can never be the element
   that disappears (it is the most important one). */
#board-controls.controls-collapsed #controls-row #filter-q { flex:0 1 11rem; }
#board-controls.controls-collapsed #controls-summary { flex:1 1 auto; }
#controls-summary { flex:0 1 auto; min-width:2rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#484f58; font-size:.75rem; display:none; align-items:center; gap:.3rem; }
#controls-summary .tag-chip { cursor:default; flex:0 0 auto; }
/* The query fragment truncates with an ellipsis when space is tight (raw text
   nodes in a flex container do not ellipsize — it needs its own box). */
#controls-summary .summary-q { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* A lone remaining chip gets the same shrink-to-ellipsis treatment as the
   query — the verdict must never be the element clipped off the row. */
#controls-summary .tag-chip.summary-chip-shrink { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }
/* The match count never truncates — it is the verdict. */
#controls-summary .summary-n { flex:0 0 auto; }
/* Overflowing active tags fold into this indicator (never clipped, row stays
   one line) — visually quiet, it just says "more than shown". */
#controls-summary .summary-more { flex:0 0 auto; font-size:.68rem; color:#8b949e; border:1px dashed #30363d; border-radius:10px; padding:.1rem .45rem; white-space:nowrap; }
#board-controls.controls-collapsed #controls-panel { display:none; }
#board-controls.controls-collapsed #controls-summary { display:inline-flex; }
#board-controls.controls-collapsed #controls-summary.has-filter { color:#c9d1d9; }
#board-controls:not(.controls-collapsed) #controls-row { margin-bottom:.5rem; }
#filter-bar { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; }
#filter-q { flex:1 1 220px; min-width:160px; background:#161b22; color:#c9d1d9; border:1px solid #30363d; border-radius:6px; font-size:.85rem; padding:.4rem .6rem; font-family:inherit; }
#filter-q::placeholder { color:#484f58; }
#controls-row #filter-q { flex:1 1 auto; min-width:5rem; }
#filter-tags { display:flex; flex-wrap:wrap; gap:.35rem; align-items:center; }
.tag-chip { background:#21262d; color:#8b949e; border:1px solid #30363d; border-radius:10px; font-size:.7rem; padding:.15rem .55rem; cursor:pointer; }
.tag-chip:hover { background:#30363d; color:#c9d1d9; }
.tag-chip.active { background:#1f6feb; color:#fff; border-color:#388bfd; }
/* The untagged pseudo-chip is visually distinct (dashed) — it is a STRUCTURAL
   filter ("items this corpus cannot tag-reach"), not a real tag (W-019). */
.tag-chip[data-tag="__untagged__"] { border-style:dashed; font-style:italic; }
.tag-chip[data-tag="__untagged__"].active { background:#9e6a03; border-color:#d29922; color:#fff; font-style:normal; }
#filter-clear { background:#21262d; color:#c9d1d9; border:1px solid #30363d; border-radius:6px; font-size:.72rem; padding:.25rem .6rem; cursor:pointer; }
#filter-clear:hover { background:#30363d; }
/* The "+N more tags" disclosure folds the long tail of a large corpus. It is
   shell-side (outside #board-root) so its open state survives the poll morph
   for free — same reason the whole control bar lives out here. */
#filter-tags-more > summary { font-size:.72rem; color:#58a6ff; cursor:pointer; min-height:auto; display:inline-flex; align-items:center; padding:.15rem .4rem; margin:0; }
#filter-tags-more[open] > summary { margin-bottom:.35rem; }
#filter-tags-more .tag-tail { display:flex; flex-wrap:wrap; gap:.35rem; }
#collapse-strip { display:flex; flex-wrap:wrap; gap:.35rem; margin-top:.5rem; }
#collapse-strip .col-toggle { width:auto; flex:0 0 auto; background:#161b22; border:1px solid #21262d; border-radius:6px; padding:.3rem .6rem; text-transform:none; letter-spacing:0; font-size:.75rem; font-weight:500; }
#collapse-strip .col-toggle .col-toggle-icon { margin-left:.35rem; }
#collapse-strip .col-toggle[aria-pressed="true"] { background:#10141a; color:#6e7681; }
.kanban { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.8rem; align-items:start; }
.col { background:#10141a; border:1px solid #21262d; border-radius:10px; padding:.6rem; min-height:80px; min-width:0; }
.col-head { padding:.15rem .3rem .5rem; }
/* The collapse toggle is the WHOLE column header (name + count + chevron) —
   one wide, obvious tap target. Rendered as a button so it is keyboard-
   focusable and announces as an action. */
.col-toggle { display:flex; align-items:center; gap:.4rem; width:100%; background:none; border:none; padding:0; margin:0; color:#8b949e; font:inherit; font-weight:600; font-size:.85rem; text-transform:uppercase; letter-spacing:.04em; cursor:pointer; text-align:left; }
.col-toggle .count { color:#8b949e; font-weight:400; }
.col-toggle-icon { margin-left:auto; font-size:.75rem; transition:transform .15s; }
/* Collapsed state: the client toggles .collapsed on the column (and
   aria-pressed on its header button). The body is display:none'd — the column
   KEEPS its grid track and shrinks to its header, which stays readable (name +
   count). Mobile wants it tight; on desktop the collapsed column just narrows. */
.col.collapsed .col-body { display:none; }
.col.collapsed .col-toggle-icon, .col-toggle[aria-pressed="true"] .col-toggle-icon { transform:rotate(-90deg); }
/* Client-side filtering hides cards + empty shells with a class, never by
   removing them — the morph owns the tree; the filter only annotates it. */
.card.filter-hidden { display:none; }
/* All-hidden hint (mobile feedback follow-up): when the filter hides EVERY
   work-item card the board otherwise renders as bare column shells with no
   card-shaped hint. The client stamps .filter-empty on #board-root; the
   empty-shell rows and the Board heading dim so the all-hidden case reads as
   "items exist but are filtered away", not as an empty board. The heading
   text itself names the reason in words (filter.ts stampCount). */
#board-root.filter-empty > h2:first-of-type { opacity:.55; }
#board-root.filter-empty .col .empty { opacity:.3; }
.card { background:#161b22; border:1px solid #21262d; border-radius:8px; padding:.6rem .8rem; margin-bottom:.6rem; min-width:0; overflow-wrap:anywhere; }
.card.wi { border-left:3px solid #3fb950; }
.card.wi.paused { opacity:.55; border-left-color:#8b949e; }
.card.session-only { border-left:3px solid #d29922; border-style:solid solid solid dashed; }
.chips { margin-top:.35rem; display:flex; flex-wrap:wrap; gap:.3rem; }
.chip { font-size:.68rem; padding:.05rem .45rem; border-radius:10px; background:#21262d; color:#8b949e; }
.chip-prio-high { color:#f85149; } .chip-prio-medium { color:#d29922; } .chip-prio-low { color:#58a6ff; }
.badge-paused { background:#8b949e22; color:#8b949e; border:1px solid #8b949e55; }
.badge-nodream { background:#d2992222; color:#d29922; border:1px solid #d2992255; }
.badge-problem { background:#f8514922; color:#f85149; border:1px solid #f8514955; }
/* Action-required (WI-043): pulses (reusing the DREAMING keyframe) so a session
   blocked on the user catches the eye. Two distinct states, two colours:
   question=amber (answer needed), permission=blue (approval needed). */
.badge-action { animation:pulse 1.6s infinite; font-weight:600; }
.badge-action-question { background:#d2992222; color:#d29922; border:1px solid #d2992288; }
.badge-action-permission { background:#58a6ff22; color:#58a6ff; border:1px solid #58a6ff88; }
/* Processing status (WI-044): live busy/retry/idle. busy & retry pulse (active),
   idle is static. Suppressed by the renderer when action-required is present. */
.badge-status { font-weight:600; }
.badge-status-busy { background:#3fb95022; color:#3fb950; border:1px solid #3fb95088; animation:pulse 1.6s infinite; }
.badge-status-retry { background:#db6d2822; color:#db6d28; border:1px solid #db6d2888; animation:pulse 1.6s infinite; }
.badge-status-idle { background:#8b949e22; color:#8b949e; border:1px solid #8b949e55; }
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
.revisions > summary { font-size:.7rem; margin:.35rem 0 0; color:#6e7681; cursor:pointer; }
.revisions ul { margin:.25rem 0 0; padding-left:1rem; font-size:.68rem; color:#6e7681; }
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

/* Dense data tables (dream archive, DRM history, HIVEmind flow) can be wider
   than a phone; keep the overflow CONTAINED to their own horizontal scroller
   instead of blowing out the whole page width. -webkit-overflow-scrolling for
   momentum on iOS Safari. */
.table-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; max-width:100%; }
.table-scroll table { min-width:max-content; }

/* ── Tablet: 641–1024px → 2 columns ─────────────────────────────────────── */
@media (max-width:1024px) {
  .kanban { grid-template-columns:repeat(2,minmax(0,1fr)); }
}

/* ── Phone: ≤640px → single stacked column ──────────────────────────────────
   Vertical stacking (not horizontal column-swipe) is deliberate (task brief /
   I-186): the board is a keyed-morph polling renderer, and the page's normal
   VERTICAL scroll already survives a poll tick (morph.ts never detaches the
   scroll container). A horizontal column scroller would need its scrollLeft
   preserved across every 15s morph or yank the user back to column 1 — the
   risk asymmetry isn't worth it. Stacking inherits the already-safe vertical
   scroll for free. Touch targets are floored to ≥44px and the tiniest labels
   are floored to ~11px, since this is the width where it actually matters. */
@media (max-width:640px) {
  body { font-size:15px; padding:1rem .8rem 3rem; }
  h1 { font-size:1.2rem; }
  h2 { margin:1.4rem 0 .7rem; }

  .kanban { grid-template-columns:1fr; gap:.7rem; }
  .grid { grid-template-columns:1fr; }
  .col { padding:.6rem .55rem; }
  .card { padding:.7rem .75rem; }

  /* Board controls (WI-084): sticky so they stay reachable while scrolling the
     stacked columns; generous 44px touch targets; the tag corpus wraps. The
     collapse strip is the mobile headline feature — a collapsed board on a
     phone is 4 tappable headers instead of a wall of cards. */
  #board-controls { padding:.4rem 0 .5rem; }
  /* The collapsed controls are ONE 44px row: toggle + search + summary. */
  #controls-toggle { min-height:44px; font-size:.8rem; padding:.45rem .7rem; }
  #controls-summary { font-size:.78rem; }
  #controls-summary .tag-chip { min-height:0; padding:.1rem .5rem; }
  #filter-q { flex-basis:100%; min-height:44px; font-size:.9rem; }
  #controls-row #filter-q { flex:1 1 auto; min-width:4rem; }
  .tag-chip { min-height:34px; padding:.3rem .7rem; font-size:.72rem; }
  #filter-clear { min-height:44px; font-size:.85rem; }
  #collapse-strip { gap:.45rem; }
  #collapse-strip .col-toggle { min-height:44px; padding:.45rem .8rem; font-size:.85rem; flex:1 1 40%; }
  /* Column header toggle is already the whole header — make it thumb-sized. */
  .col-head .col-toggle { min-height:44px; align-items:center; }

  /* Comfortable, thumb-tappable interactive controls. 44px min height is the
     iOS/Android floor. Applies to every write affordance + navigation link. */
  .act, .act-select, .create-form button, .create-form input,
  .create-form textarea, .create-form select, body > form button, .retry button,
  .modal .act {
    min-height:44px; font-size:.9rem; padding:.5rem .75rem;
  }
  .modal { padding:1.1rem; }
  .modal-actions { gap:.7rem; }
  .actions { gap:.5rem; }
  .actions form { gap:.4rem; }
  /* select carries its own line-height chrome; keep the visible box ≥44px. */
  .act-select { padding:.45rem .5rem; }

  /* Tap-friendly disclosure toggles: spec, todos, create form, DRM/artifacts. */
  details > summary, .spec > summary, .todo-list > summary,
  .create > summary { min-height:44px; display:flex; align-items:center;
    font-size:.85rem; }

  /* Bigger, easier-to-hit navigation deep links. */
  .open-link { min-height:44px; display:inline-flex; align-items:center;
    padding:0 .3rem; font-size:.85rem; }

  /* Floor the very smallest labels so nothing renders below ~11px on a phone. */
  .cap-domain, .badge, .chip, .todo-label, .todo-count, .todo-cached,
  .lane-count, .lane ul, .todo-list ul, .lineage, .spec-body,
  .todo-current, .cap-desc, .meta { font-size:.72rem; }
  .badge, .chip { padding:.15rem .5rem; }
  table { font-size:.78rem; }
}
`;function l(W){let Z=new Map,$=0;for(let K of W.items){let j=Array.isArray(K.tags)?K.tags:[];if(j.length===0)$++;for(let U of j)Z.set(U,(Z.get(U)??0)+1)}let J=[...Z.entries()].sort((K,j)=>j[1]-K[1]||K[0].localeCompare(j[0])),Q=(K,j,U)=>`<button type="button" class="tag-chip" data-tag="${V(K)}" title="${V(U)}">${V(j)}</button>`,X=12,Y=J.slice(0,X),q=J.slice(X);return`<div id="board-controls">
  <div id="controls-row">
    <button type="button" id="controls-toggle" aria-expanded="true" aria-controls="controls-panel" title="collapse/expand the filter/tag controls">filters ▴</button>
    <input id="filter-q" type="search" placeholder="filter — id, title, tag, spec…" autocomplete="off" spellcheck="false" aria-label="filter work items">
    <span id="controls-summary" title="active filter — tap “filters” to change it"></span>
  </div>
  <div id="controls-panel">
    <div id="filter-bar" role="search">
      <div id="filter-tags" role="group" aria-label="filter by tag">
        ${Y.map(([K,j])=>Q(K,`${K} ${j}`,`${j} item${j===1?"":"s"} tagged ${K} — tap to filter`)).join(`
        `)}
        ${q.length>0?`<details id="filter-tags-more"><summary>+${q.length} more tags</summary><div class="tag-tail">${q.map(([K,j])=>Q(K,`${K} ${j}`,`${j} item${j===1?"":"s"} tagged ${K} — tap to filter`)).join(`
        `)}</div></details>`:""}
        ${Q("__untagged__",`untagged ${$}`,"show ONLY items with no tags — the tagging-backlog hunting set (W-019)")}
      </div>
      <button type="button" id="filter-clear" title="clear search text and all tag filters" hidden>clear</button>
    </div>
    <div id="collapse-strip" aria-label="collapse/expand columns">
      ${["Backlog","Todo","In Progress","Done"].map((K)=>`<button type="button" class="col-toggle" data-col-toggle="${V(K)}" title="collapse/expand the ${V(K)} column">${V(K)} <span class="col-toggle-icon" aria-hidden="true">▾</span></button>`).join(`
      `)}
    </div>
  </div>
</div>`}function n(W,Z=[]){let{dreams:$,messages:J}=W,Q={guiBaseUrl:W.guiBaseUrl,mirror:W.sessions,writesEnabled:W.writesEnabled,sessionBackend:W.sessionBackend,decisions:W.promoteDecisions,todoSubStates:W.todoSubStates,actionRequired:W.actionRequired,sessionStatus:W.sessionStatus},X=Z.length===0?"":`<div class="notices">${Z.map((q)=>`<div class="notice"><span class="mono dim">${R(q.at)}</span> ${V(q.text)}</div>`).join("")}</div>`;return`${`<div class="meta mono">workspace ${V(W.workspaceRoot)} · generated ${V(W.generatedAt)} · live refresh 15s · ${j0(W.buildSha)}</div>`}
<h2>Board <span class="count">(${W.items.length} items · ${W.board.sessionOnly.length} session-only)</span> <span id="filter-count" class="count" title="how many work items the current filter shows / total — updated live by the filter bar"></span></h2>
${X}
${k0(W.board,Q,W.items)}
${W.writesEnabled?"":'<div class="meta">read-only view — the board write path stays sealed behind the hive_board_* tools (WI-062)</div>'}`}function I0(W){let Z=W.tagName;return Z==="INPUT"||Z==="TEXTAREA"||Z==="SELECT"}function A0(W){let Z=W.ownerDocument.activeElement??null;if(!Z||!W.contains(Z))return null;let $=null,J=null;if(Z instanceof HTMLInputElement||Z instanceof HTMLTextAreaElement)try{$=Z.selectionStart,J=Z.selectionEnd}catch{}return{key:x0(Z,W),name:Z.getAttribute("name"),start:$,end:J}}function x0(W,Z){let $=W;while($&&$!==Z){let J=$.getAttribute("data-key");if(J)return J;$=$.parentElement}return null}function E0(W,Z){if(!Z)return;let $=Z.key!==null?W.querySelector(`[data-key="${o(Z.key)}"]`)??W:W,J=Z.name?`[name="${o(Z.name)}"]`:null,Q=J?$.querySelector(J):null;if(Q instanceof HTMLElement){if(Q.focus(),(Q instanceof HTMLInputElement||Q instanceof HTMLTextAreaElement)&&Z.start!==null)try{Q.setSelectionRange(Z.start,Z.end??Z.start)}catch{}}}function o(W){return W.replace(/["\\]/g,"\\$&")}function i(W,Z){let $=A0(W);a(W,Z,!0),E0(W,$)}function a(W,Z,$=!1){if(W.tagName!==Z.tagName){W.replaceWith(Z);return}C0(W,Z,$),T0(W,Z)}function C0(W,Z,$=!1){let J=W.tagName==="DETAILS",Q=I0(W);for(let X of Array.from(Z.attributes)){if(J&&X.name==="open")continue;if(Q&&X.name==="value")continue;if(W.getAttribute(X.name)!==X.value)W.setAttribute(X.name,X.value)}if(!$)for(let X of Array.from(W.attributes)){if(J&&X.name==="open")continue;if(Q&&X.name==="value")continue;if(!Z.hasAttribute(X.name))W.removeAttribute(X.name)}}function x(W){return W instanceof Element?W.getAttribute("data-key"):null}function T0(W,Z){let $=Array.from(W.childNodes),J=Array.from(Z.childNodes),Q=new Map;for(let Y of $){let q=x(Y);if(q!==null)Q.set(q,Y)}let X=0;for(let Y of J){let q=x(Y);if(q!==null&&Q.has(q)){let j=Q.get(q);Q.delete(q);let U=W.childNodes[X];if(U!==j)W.insertBefore(j,U??null);r(j,Y),X=w0(W,j)+1;continue}let K=W.childNodes[X]??null;if(K&&x(K)===null&&y0(K,Y))r(K,Y),X++;else W.insertBefore(Y.cloneNode(!0),K),X++}while(W.childNodes.length>X)W.removeChild(W.childNodes[X])}function w0(W,Z){return Array.prototype.indexOf.call(W.childNodes,Z)}function y0(W,Z){if(W.nodeType!==Z.nodeType)return!1;if(W.nodeType===Node.ELEMENT_NODE)return W.tagName===Z.tagName;return!0}function r(W,Z){if(W.nodeType===Node.ELEMENT_NODE&&Z.nodeType===Node.ELEMENT_NODE){a(W,Z);return}if(W.nodeType===Node.TEXT_NODE||W.nodeType===Node.COMMENT_NODE){if(W.nodeValue!==Z.nodeValue)W.nodeValue=Z.nodeValue;return}W.replaceWith(Z.cloneNode(!0))}var S0=["Backlog","Todo","In Progress","Done"],_={q:"hb.filter.q",tags:"hb.filter.tags",collapsed:"hb.collapsed",controls:"hb.controls.collapsed"};function v0(){try{return typeof window.matchMedia==="function"?window.matchMedia("(max-width:640px)").matches:!1}catch{return!1}}function O(W){try{return window.localStorage.getItem(W)}catch{return null}}function D(W,Z){try{window.localStorage.setItem(W,Z)}catch{}}function b0(){try{return new Set(JSON.parse(O(_.tags)??"[]"))}catch{return new Set}}function f0(){try{return new Set(JSON.parse(O(_.collapsed)??"[]"))}catch{return new Set}}function g0(){let W=O(_.controls);if(W==="collapsed")return!0;if(W==="expanded")return!1;return v0()}var z={q:O(_.q)??"",tags:b0(),collapsed:f0(),controlsCollapsed:g0()},H=[];function h0(){let W=document.getElementById("filter-corpus");if(!W||!W.textContent)return H;try{let Z=JSON.parse(W.textContent);return Array.isArray(Z)?Z:H}catch{return H}}var B="__untagged__";function u0(W){let Z=z.tags.has(B),$=[...z.tags].filter((J)=>J!==B);if(Z&&W.tags.length>0)return!1;if(!Z){for(let J of $)if(!W.tags.includes(J))return!1}else if($.length>0)return!1;if(z.q){let J=z.q.toLowerCase();if(!W.hay.includes(J))return!1}return!0}function L(){H=h0();let W=new Map;for(let X of H)W.set(X.id,u0(X));let Z=z.q!==""||z.tags.size>0,$=0,J=0;for(let X of Array.from(document.querySelectorAll(".card.wi"))){let Y=X.getAttribute("data-key")??"",q=Y.startsWith("wi:")?Y.slice(3):"",K=!Z||W.get(q)===!0;if(X.classList.toggle("filter-hidden",!K),Z)if(K)$++;else J++}for(let X of Array.from(document.querySelectorAll(".card.session-only")))X.classList.toggle("filter-dim",Z);let Q=document.getElementById("board-root");if(Q)Q.classList.toggle("filter-empty",Z&&H.length>0&&$===0);m0(Z,$,J),c0(Z,$),l0()}function p0(){let W=[...z.tags].filter((X)=>X!==B);if(W.length<2)return null;if(z.tags.has(B))return null;let Z=z.q.toLowerCase(),$=(X)=>Z===""||X.hay.includes(Z),J=W.map((X)=>H.filter((Y)=>Y.tags.includes(X)&&$(Y)).length);if(J.some((X)=>X===0))return null;return`no items have all of: ${W.map((X,Y)=>`${X} (${J[Y]})`).join(" + ")} — each has matches individually`}function m0(W,Z,$){let J=document.getElementById("filter-count");if(!J)return;let Q=H.length,X=H.filter((Y)=>Y.tags.length===0).length;if(Q===0){J.textContent="· board is empty",J.title="no work items on the board at all";return}if(!W){J.textContent=`· ${Q} items · ${X} untagged`,J.title=`${X} of ${Q} items carry no tags — the set a tag filter cannot reach (tap "untagged" to list them)`;return}if(Z===0){let Y=[...z.tags].filter((K)=>K!==B);if(z.tags.has(B)&&Y.length>0){J.textContent="· nothing can match — untagged + a tag is empty by definition",J.title=`the untagged filter lists ONLY items with no tags, and ${Y.join(" + ")} require${Y.length===1?"s":""} a tag. Drop one of them.`;return}let q=p0();if(q){J.textContent=`· ${q} — ${$} hidden`,J.title=`the AND-combination is empty: no single item carries every selected tag. Remove one tag to widen the result. ${X} item${X===1?"":"s"} on the board carry no tags.`;return}J.textContent=$>0?`· no items match — ${$} hidden`:"· no items match",J.title=`the filter hid all ${$} item${$===1?"":"s"}. ${X} item${X===1?"":"s"} on the board carry no tags and can only be reached via the "untagged" filter or free text.`}else J.textContent=`· showing ${Z}/${Q} · ${X} untagged`,J.title=`${$} hidden by the filter · ${X} of ${Q} items carry no tags`}function d0(W,Z){if(!W)return{text:"no filter active",tags:[],untaggedActive:!1};let $=[...z.tags].filter((q)=>q!==B).sort(),J=z.tags.has(B),Q=z.q!==""?`“${z.q}”`:"",X=`showing ${Z}/${H.length}`,Y=[Q,...$,...J?["untagged"]:[]];return{text:Y.length>0?`${Y.join(" + ")} · ${X}`:X,tags:$,untaggedActive:J}}function c0(W,Z){let $=document.getElementById("controls-summary");if(!$)return;let{text:J,tags:Q,untaggedActive:X}=d0(W,Z);if($.textContent="",$.classList.toggle("has-filter",W),!W){$.textContent=J;return}let Y=[...Q,...X?[B]:[]],q=Y.length,K=()=>{if($.textContent="",z.q!==""){let M=document.createElement("span");M.className="summary-q",M.textContent=`“${z.q}”`,$.appendChild(M)}for(let M of Y.slice(0,q)){let N=document.createElement("span");if(N.className="tag-chip active",M===B)N.setAttribute("data-tag",B);if(N.textContent=M===B?"untagged":M,q===1)N.classList.add("summary-chip-shrink");$.appendChild(N)}let j=Y.length-q;if(j>0){let M=document.createElement("span");M.className="summary-more",M.textContent=`+${j} more`,M.title=`${j} more active tag${j===1?"":"s"}: ${Y.slice(q).join(", ")} — tap “filters” to expand`,$.appendChild(M)}let U=document.createElement("span");U.className="summary-n",U.textContent=`${Z}/${H.length}`,$.appendChild(U)};K();while(q>1&&$.scrollWidth>$.clientWidth)q--,K();$.title=J}function l0(){let W=document.getElementById("filter-q");if(W&&W.value!==z.q)W.value=z.q;let Z=document.getElementById("filter-clear");if(Z)if(z.q!==""||z.tags.size>0)Z.removeAttribute("hidden");else Z.setAttribute("hidden","");for(let $ of Array.from(document.querySelectorAll("#filter-tags .tag-chip"))){let J=$.getAttribute("data-tag")??"";$.classList.toggle("active",z.tags.has(J)),$.setAttribute("aria-pressed",z.tags.has(J)?"true":"false")}for(let $ of Array.from(document.querySelectorAll("[data-col-toggle]"))){let J=$.getAttribute("data-col-toggle")??"";$.setAttribute("aria-pressed",z.collapsed.has(J)?"true":"false")}}function C(){for(let W of S0){let Z=z.collapsed.has(W),$=document.querySelector(`.col[data-col="${s(W)}"]`);if($)$.classList.toggle("collapsed",Z);for(let J of Array.from(document.querySelectorAll(`[data-col-toggle="${s(W)}"]`)))J.setAttribute("aria-pressed",Z?"true":"false")}}function s(W){return W.replace(/["\\]/g,"\\$&")}function n0(W){if(z.collapsed.has(W))z.collapsed.delete(W);else z.collapsed.add(W);D(_.collapsed,JSON.stringify([...z.collapsed])),C()}function I(){let W=document.getElementById("board-controls");if(!W)return;let Z=z.controlsCollapsed;W.classList.toggle("controls-collapsed",Z);let $=document.getElementById("controls-toggle");if($)$.setAttribute("aria-expanded",Z?"false":"true"),$.textContent=Z?"filters ▾":"filters ▴",$.title=Z?"expand the filter/tag controls":"collapse the filter/tag controls"}function o0(){z.controlsCollapsed=!z.controlsCollapsed,D(_.controls,z.controlsCollapsed?"collapsed":"expanded"),I()}function r0(W){let Z=W.target;if(!Z)return;if(Z.closest("#controls-toggle")){W.preventDefault(),o0();return}let $=Z.closest("[data-col-toggle]");if($){let Q=$.getAttribute("data-col-toggle");if(Q)W.preventDefault(),n0(Q);return}let J=Z.closest("#filter-tags .tag-chip");if(J){let Q=J.getAttribute("data-tag");if(Q){if(z.tags.has(Q))z.tags.delete(Q);else z.tags.add(Q);D(_.tags,JSON.stringify([...z.tags])),L()}return}if(Z.closest("#filter-clear"))z.q="",z.tags.clear(),D(_.q,""),D(_.tags,"[]"),L()}function i0(W){let Z=W.target;if(!Z||Z.id!=="filter-q")return;z.q=Z.value,D(_.q,z.q),L()}var E=!1;function t(){if(E)return;if(E=!0,document.addEventListener("click",r0),document.addEventListener("input",i0),I(),C(),L(),O(_.controls)===null&&typeof window.matchMedia==="function")try{let W=window.matchMedia("(max-width:640px)"),Z=($)=>{if(O(_.controls)!==null)return;z.controlsCollapsed=$.matches,I()};if(typeof W.addEventListener==="function")W.addEventListener("change",Z);else if(typeof W.addListener==="function")W.addListener(Z)}catch{}}function e(){if(!E)return;I(),C(),L()}var W0={high:0,medium:1,low:2};function T(W){return[...W].sort((Z,$)=>{let J=W0[Z.priority],Q=W0[$.priority];if(J!==Q)return J-Q;let X=F(Z),Y=F($);if(X!==Y)return Y.localeCompare(X);return $.id.localeCompare(Z.id)})}function Z0(W,Z){let $=F(W),J=F(Z);if($!==J)return J.localeCompare($);return Z.id.localeCompare(W.id)}function $0(W,Z){let $=new Set;for(let J of W){if(J.owner_session)$.add(J.owner_session);for(let Q of J.released_sessions)$.add(Q)}return{backlog:T(W.filter((J)=>J.status==="backlog")),todo:T(W.filter((J)=>J.status==="todo")),inProgress:W.filter((J)=>J.status==="in_progress").sort(Z0),done:W.filter((J)=>J.status==="done").sort(Z0),sessionOnly:Z.cards.filter((J)=>!$.has(J.id))}}var a0="/api/hive-board/index",s0=15000,A="06a5c44-dirty";function t0(W){if(!W||W==="unknown"||A==="unknown")return"unknown";return W===A?"match":"mismatch"}function e0(W){let Z=document.getElementById("build-badge");if(!Z)return;if(t0(W)==="mismatch")Z.classList.add("stale"),Z.textContent=`stale client — reload (bundle ${A} ≠ host ${W})`,Z.setAttribute("title",`this tab is running an old client bundle (built ${A}) against a newer host build (${W}). Reload the page to get the current bundle.`);else Z.classList.remove("stale")}var J0={available:!1,computedAt:"",totalPersisted:0,awakeIds:0,awakeDeleted:0,cards:[],persistedIds:[]},W6={artifactCounts:{insight:0,warning:0,songline:0,shadow:0,total:0},active:[],history:[],recentArtifacts:[]};function Z6(W){return{...W,tags:Array.isArray(W.tags)?W.tags:[],subtasks:Array.isArray(W.subtasks)?W.subtasks:[],todo_mirror:Array.isArray(W.todo_mirror)?W.todo_mirror:[],transitions:Array.isArray(W.transitions)?W.transitions:[],released_sessions:Array.isArray(W.released_sessions)?W.released_sessions:[],artifacts:Array.isArray(W.artifacts)?W.artifacts:[],problems:Array.isArray(W.problems)?W.problems:[],status:W.status,priority:W.priority,origin:W.origin}}function $6(W){let Z=(Array.isArray(W.items)?W.items:[]).map(Z6);return{generatedAt:typeof W.generated==="string"?W.generated:"",workspaceRoot:typeof W.workspaceRoot==="string"?W.workspaceRoot:"(unknown workspace)",buildSha:typeof W.boardBuild==="string"&&W.boardBuild!==""?W.boardBuild:"unknown",guiBaseUrl:"",capabilities:[],dreams:W6,messages:[],items:Z,board:$0(Z,{...J0}),writesEnabled:!1,sessionBackend:"unconfigured",promoteDecisions:{},sessions:{...J0},todoSubStates:{},actionRequired:{},sessionStatus:{}}}var J6=null,V0="";function X6(W){let Z=document.createElement("main");return Z.id="board-root",Z.innerHTML=n(W),Z}function Q6(W){let Z=document.getElementById("board-root");if(!Z)return;i(Z,X6(W)),e0(W.buildSha),e()}async function w(){try{let W=await fetch(a0,{headers:{accept:"application/json"}});if(!W.ok)return;let Z=await W.json();if(!Z||typeof Z!=="object"||Z.ok!==!0)return;if(!Array.isArray(Z.items))return;let $=$6(Z);J6=$,V0=$.buildSha,V6($),Q6($)}catch{}}var X0=!1;function V6(W){if(X0)return;let Z=document.getElementById("board-controls-host");if(!Z)return;Z.innerHTML=l(W),X0=!0}function y(){if(document.hidden)return;w()}document.addEventListener("visibilitychange",y);window.addEventListener("pageshow",y);window.addEventListener("focus",y);var Q0=!1;function Y0(W){if(t(),!Q0){Q0=!0;let Z=W.interval;if(typeof Z==="function")Z(()=>{w()},s0);else console.error("[@hive/dsh-board] no interval service — poll cadence degraded to refresh-on-visible")}w()}var Y6=`
/* ── DSH shell-adaptation overrides (WI-062 slice 3; authored — see banner) ── */
.hvb-root{height:100%;overflow-y:auto;box-sizing:border-box;padding:16px 20px 32px;font-size:12.5px;line-height:1.45}
.hvb-root h2{font-size:13.5px;margin:0 0 8px}
.hvb-root .kanban{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
.hvb-root .col{flex:1 1 200px;min-width:200px;max-width:360px}
.hvb-sub{color:rgba(128,128,128,.9);font-size:11.5px;margin:0 0 10px}
.hvb-controls-note{color:rgba(128,128,128,.75);font-size:11px;margin:0 0 8px}
`,q6='<div class="empty">Fetching the board…</div>',z6='<div class="hvb-sub">read-only view of the workspace board (WI-*) — the write path stays sealed behind the hive_board_* tools (WI-062)</div>'+`<div id="board-controls-host"></div><main id="board-root">${q6}</main>`;function K6(W){let Z=typeof W==="number"&&isFinite(W)?W:20;return`<svg width="${Z}" height="${Z}" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><rect x="3" y="4" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/><rect x="3" y="15" width="5" height="5" rx="1" fill="currentColor" opacity="0.35"/><rect x="10" y="4" width="5" height="13" rx="1" fill="currentColor" opacity="0.8"/><rect x="10" y="19" width="5" height="1" rx="0.5" fill="currentColor" opacity="0.35"/><rect x="17" y="4" width="5" height="5" rx="1" fill="currentColor" opacity="0.8"/><rect x="17" y="11" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/></svg>`}globalThis.__BOARD_ENGINE={CSS:c,CSS_OVERRIDES:Y6,SHELL_MARKUP:z6,ICON_SVG:K6,attachEngine:Y0};})();
;window.__ModuleLoader__.load({
  id: '@hive/dsh-board',
  factory: (require) => {
    const React = require('react');
    const E = (typeof __BOARD_ENGINE !== 'undefined') ? __BOARD_ENGINE : window.__BOARD_ENGINE;
    let applied_once = false;
    return {
      name: '@hive/dsh-board',
      // The load-bearing client services gate (I-128): registration goes
      // through 'slots'; the 15 s poll cadence rides ctx.interval ('timer').
      inject: ['slots', 'timer'],
      apply(ctx) {
        if (applied_once) return; // idempotent: duplicate slot registration throws
        applied_once = true;
        ctx.effect(() => {
          const style = document.createElement('style');
          style.setAttribute('data-plugin-css', '@hive/dsh-board');
          style.textContent = E.CSS + E.CSS_OVERRIDES;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'board tab styles');
        const slots = ctx.get('slots');
        if (slots === undefined) {
          console.error('[@hive/dsh-board] no slots service — board panel not registered');
          return;
        }
        // Standalone sidebar entry ("HIVE Board"): keyed main panel + panellist
        // id of the same key (the berget-usage standalone pattern; slot kinds
        // verified live 2026-09-18).
        slots.inject('main', () => {
          slots.register(
            { name: 'main', key: 'hive-board' },
            () => React.createElement('div', {
              className: 'hvb-root',
              dangerouslySetInnerHTML: { __html: E.SHELL_MARKUP },
              ref: (el) => {
                if (el && !el.dataset.hvbBooted) {
                  el.dataset.hvbBooted = '1';
                  E.attachEngine(ctx);
                }
              },
            }),
          );
        });
        slots.inject('sidebar.panellist', () => {
          slots.register(
            { name: 'sidebar.panellist', id: 'hive-board', order: 110, label: 'HIVE Board' },
            (props) => React.createElement('span', {
              className: 'hvb-icon',
              dangerouslySetInnerHTML: { __html: E.ICON_SVG(props && typeof props.size === 'number' ? props.size : 20) },
            }),
          );
        });
        console.log('[@hive/dsh-board] client plugin applied (viewer-parity read-only board)');
      },
    };
  },
});
