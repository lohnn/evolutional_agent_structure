// @hive/dsh-board — GENERATED client bundle (WI-062 slice 3+3b). DO NOT EDIT BY HAND.
// Build: dsh-hive/packages/board/scripts/build-client.ts (bun) — bundles
// websrc/client-main.ts (the ported 4400 viewer engine + the tab engine + the
// favicon driver + the item drawer) into the twin classic shape; the wrapper
// below is the only React-using code and takes React from the loader's runtime
// module table (W-044).
// Build stamp (both sides of the I-152 staleness verdict): 18ecdaf-dirty
(()=>{function Z0(Z){let $=new Set;for(let J of Z.transitions){if(J.superseded!==void 0)continue;if(J.session&&J.session!==Z.owner_session)$.add(J.session)}return[...$]}function $0(Z){return Z.transitions.filter(($)=>typeof $.superseded==="string"&&$.superseded!=="").map(($)=>({at:$.at,by:$.by,...$.session?{session:$.session}:{},supersededHash:$.superseded}))}function J0(Z){return Z.transitions.filter(($)=>typeof $.absorbed==="string"&&$.absorbed!=="").map(($)=>({id:$.absorbed,at:$.at}))}var u0=/^New session - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;function T(Z){if(Z==null)return!0;let $=Z.trim();if($==="")return!0;return u0.test($)}function p0(Z){return Z!=null&&Z.trim()!==""&&!T(Z)}function Q0(Z,$,J){if(!T(Z))return Z;if(!$||!J)return Z;let Q=J[$];return p0(Q)?Q:Z}function D(Z){let $="";for(let J of Z.transitions)if(J.at&&J.at>$)$=J.at;return $||Z.updated}function X0(Z){let $=0,J=0,Q=0,W=0,X=null;for(let V of Z)switch(V.status){case"completed":$++;break;case"in_progress":if(J++,X===null)X=V.content;break;case"pending":Q++;break;case"cancelled":W++;break}return{total:Z.length,completed:$,inProgress:J,pending:Q,cancelled:W,current:X}}var L={field:"#0d1117",panel:"#161b22",border:"#30363d",edge:"#30363d",node:"#484f58",strata:"#30363d",divider:"#8b949e",amber:"#d29922",red:"#f85149"},V9=L.field;function m0(Z){return Z==="intervene"?L.red:Z==="active"?L.amber:L.node}function d0(Z,$={}){let{idPrefix:J="hbr"}=$,Q=`${J}-clip`,W=m0(Z.session),X=Z.dreaming?L.amber:L.strata,V=Z.dreaming?18:16;return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><clipPath id="${Q}"><rect x="3" y="3" width="58" height="58" rx="13"/></clipPath></defs><rect x="3" y="3" width="58" height="58" rx="13" fill="${L.panel}" stroke="${L.border}" stroke-width="2"/><g clip-path="url(#${Q})"><rect x="3" y="40" width="58" height="${V}" fill="${X}"/></g><line x1="8" y1="35" x2="56" y2="35" stroke="${L.divider}" stroke-width="1.6" opacity=".4"/><circle cx="32" cy="21" r="9" fill="${W}"/></svg>`}function W0(Z){return"data:image/svg+xml,"+encodeURIComponent(d0(Z))}function K(Z){return Z.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}function A(Z,$){return Z.length>$?Z.slice(0,$-1)+"…":Z}function S(Z){if(!Z)return"—";let $=new Date(Z);return Number.isNaN($.getTime())?Z:$.toISOString().replace("T"," ").slice(0,16)+"Z"}function c0(Z){let $=Z==="unknown"?"build unknown":`build ${K(Z)}`,J=Z==="unknown"?"git unavailable — running build could not be identified":"server build SHA — HEAD of the HIVE plugin repo, which ships this viewer";return`<span id="build-badge" class="build-badge" data-server-sha="${K(Z)}" title="${K(J)}">${$}</span>`}function n0(Z,$){if(!Z)return"absent";if(!$.available)return"unknown";return $.persistedIds.includes(Z)?"exists":"absent"}function l0(Z,$,J){if(!Z)return"";return`<a class="open-link" href="${K(`${$}/?session=${Z}`)}" target="_blank" rel="noopener" title="open in web GUI">Open ↗</a>`}var o0={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function i0(Z){if(Z.length===0)return"";let $=Z.filter((Q)=>Q.status==="completed").length,J=Z.map((Q)=>`<li class="st st-${K(Q.status)}"><span class="st-icon">${o0[Q.status]??"?"}</span>${K(A(Q.content,70))}</li>`).join("");return`<div class="lane"><span class="lane-count">${$}/${Z.length}</span><ul>${J}</ul></div>`}var r0={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function a0(Z){if(!Z||Z.source==="none"||Z.todos.length===0)return"";let $=X0(Z.todos),J=$.total-$.cancelled,Q=J>0?Math.round($.completed/J*100):0,W=Z.source==="mirror"?' <span class="todo-cached" title="session not reachable now — showing the last mirrored snapshot (may lag)">cached</span>':"",X=$.current?`<div class="todo-current" title="${K($.current)}"><span class="st-icon">▸</span>${K(A($.current,72))}</div>`:$.inProgress===0&&$.pending>0?`<div class="todo-current dim">${$.pending} pending — none in progress</div>`:"",V=Z.todos.map((z)=>`<li class="st st-${K(z.status)}"><span class="st-icon">${r0[z.status]??"?"}</span>${K(A(z.content,70))}</li>`).join("");return`<div class="todos" title="owning session TodoWrite progress (WI-038)">
    <div class="todo-head">
      <span class="todo-label">activity</span>
      <span class="todo-count mono">${$.completed}/${J}</span>${W}
      <div class="todo-bar"><div class="todo-bar-fill" style="width:${Q}%"></div></div>
    </div>
    ${X}
    <details class="todo-list"><summary>${Z.todos.length} todo${Z.todos.length===1?"":"s"}</summary><ul>${V}</ul></details>
  </div>`}function s0(Z){let $=$0(Z);if($.length===0)return"";let J=$[$.length-1],Q=$.map((X)=>{let V=X.session?` <span class="mono dim">${K(V0(X.session))}</span>`:"",z=`superseded body — board/${Z.id}/${X.supersededHash}.md`;return`<li><span class="mono dim">${K(S(X.at))}</span> ${K(X.by)}${V} <span class="mono dim" title="${K(z)}">${K(X.supersededHash)}</span></li>`}).join("");return`<details class="revisions"><summary>spec revised ${$.length===1?"once":`${$.length}×`}<span class="dim"> · latest ${K(S(J.at))}</span></summary><ul>${Q}</ul></details>`}function t0(Z,$,J){let Q=[],W=Z0(Z);if(W.length>0){let X=W.map((V)=>n0(V,J)==="exists"?`<a href="${K(`${$}/?session=${V}`)}" target="_blank" rel="noopener" class="mono">${K(V)}</a>`:`<span class="mono" title="session not available here">${K(V)}</span>`).join(", ");Q.push(`previously attempted in ${X}`)}for(let X of J0(Z))Q.push(`absorbed <span class="mono">${K(X.id)}</span> at bind${X.at?` (${S(X.at)})`:""}`);if(Q.length===0)return"";return`<div class="lineage">${Q.join(" · ")}</div>`}function V0(Z){return Z.length>16?Z.slice(0,16)+"…":Z}function K0(Z,$){if(!Z)return"";let J=$.actionRequired[Z];if(!J)return"";let Q=[];if(J.awaitingQuestion){let W=J.questionCount>1?` (${J.questionCount})`:"",X=J.questionHeader?`the owning session is asking: "${J.questionHeader}" — answer it in the session (WI-043)`:"the owning session is waiting on an answer to a question (WI-043)";Q.push(`<span class="badge badge-action badge-action-question" title="${K(X)}">❓ needs answer${W}</span>`)}if(J.awaitingPermission){let W=J.permissionCount>1?` (${J.permissionCount})`:"";Q.push(`<span class="badge badge-action badge-action-permission" title="the owning session is waiting on a command/permission approval (WI-043)">✋ needs approval${W}</span>`)}return Q.join(" ")}function Y0(Z,$){if(!Z)return"";let J=$.actionRequired[Z];if(J&&(J.awaitingQuestion||J.awaitingPermission))return"";let Q=$.sessionStatus[Z];if(!Q)return"";switch(Q){case"busy":return'<span class="badge badge-status badge-status-busy" title="the owning session is actively processing (WI-044)">⚙ working</span>';case"retry":return'<span class="badge badge-status badge-status-retry" title="the owning session hit a provider error and is retrying (WI-044)">⟳ retrying</span>';case"idle":return`<span class="badge badge-status badge-status-idle" title="the owning session is idle — not currently processing (this is NOT 'done'; completion is dream/column-driven) (WI-044)">✓ idle</span>`}}function R(Z,$,J){return` data-confirm="1" data-confirm-severity="${Z}" data-confirm-title="${K($)}" data-confirm-body="${K(J)}"`}function e0(Z,$){let J=$.decisions[Z.id];if(!J)return"";let Q=`<input type="hidden" name="id" value="${K(Z.id)}">`;if(J.kind==="fresh"&&$.sessionBackend==="unconfigured")return'<div class="actions"><span class="act disabled" title="opencode server not configured (--opencode-url / OPENCODE_SERVER_PASSWORD) — session creation unavailable">Start ⏻</span></div>';if(J.kind==="refuse")return`<div class="actions"><span class="act disabled" title="${K(`${J.reason}: ${J.detail}`)}">Promote</span></div>`;if(J.kind==="fresh")switch(J.reason){case"never-owned":return`<div class="actions"><form method="post" action="/transitions/start"${R("start","Start a session?","This creates a fresh top-level HIVE session, binds it, and runs /awaken seeded with the spec. Confirm to proceed.")}>${Q}<button class="act act-start" title="create a fresh top-level session, bind it, auto-/awaken seeded with the spec (§5.3c)">Start</button></form></div>`;case"spec-changed":return`<div class="actions"><form method="post" action="/transitions/promote"${R("start","Start a fresh session? (spec edited)","The spec was edited after this item was demoted, so promotion creates a FRESH session (the edit is the decision, Q13) — the previous session is not reattached. Confirm to proceed.")}>${Q}<button class="act act-start" title="spec was edited after demote — promotion creates a FRESH session (Q13: the edit is the decision)">Start fresh session (spec edited)</button></form></div>`;case"done-never-owned":return`<div class="actions"><form method="post" action="/transitions/promote"${R("start","Reopen as a fresh session?","This item was marked done without ever owning a session. Promotion un-does the done state (done→todo) and starts a FRESH session (Q16). Confirm to proceed.")}>${Q}<button class="act act-start" title="done without a session — promote un-does the item (done→todo) then starts a fresh session (Q16)">Reopen as fresh session</button></form></div>`}let X=J.reason==="done-reopen",V=X?"Reopen — re-attach original session":`Re-attach ${V0(J.sessionID)} (spec unchanged)`;return`<div class="actions"><form method="post" action="/transitions/promote"${X?R("start","Reopen this item?","This re-opens the item and RE-ATTACHES its original owning session by id — a deep link only; /awaken is never re-run (invariant 4). Confirm to proceed."):R("start","Re-attach session?","This re-opens the existing owning session (deep link only; /awaken is not re-run). Confirm to proceed.")}>${Q}<button class="act" title="re-attaches ${K(J.sessionID)} — deep link only, /awaken is NEVER re-run (invariant 4)">${K(V)}</button></form></div>`}function Z6(Z,$){if(Z.status!=="in_progress")return e0(Z,$);let J=[],Q=`<input type="hidden" name="id" value="${K(Z.id)}">`;if(J.push(Z.paused?`<form method="post" action="/transitions/unpause">${Q}<button class="act" title="resume — same owning session">Unpause</button></form>`:`<form method="post" action="/transitions/pause">${Q}<button class="act" title="park it; resume the same session later (§5.5)">Pause</button></form>`),J.push(`<form method="post" action="/transitions/demote"${R("warn","Demote this item?","This detaches and TOMBSTONES the owning session. The idea becomes fluid again and the session will not be reattached. Confirm to proceed.")}>${Q}<select name="to" class="act-select"><option value="todo">todo</option><option value="backlog">backlog</option></select><button class="act act-warn" title="true demote: detach + tombstone the session; the idea is fluid again (§5.5)">Demote</button></form>`),!Z.paused)J.push(`<form method="post" action="/transitions/done-without-dream"${R("warn","Mark done without a dream?","This is a terminal state and skips dreamtime — no artifacts will be linked and no consolidation happens (§5.4). Confirm to proceed.")}>${Q}<button class="act" title="manual done — skips dreamtime, badged no-dream (§5.4)">Done (no dream)</button></form>`);return`<div class="actions">${J.join("")}</div>`}function z0(Z){return`<details class="create" data-key="create:${Z}"><summary>+ new item</summary>
  <form method="post" action="/transitions/create" class="create-form">
    <input type="hidden" name="status" value="${Z}">
    <input name="title" placeholder="title" required>
    <select name="priority"><option value="medium">medium</option><option value="high">high</option><option value="low">low</option></select>
    <input name="tags" placeholder="tags, comma-separated">
    <textarea name="body" rows="3" placeholder="spec / notes (markdown)"></textarea>
    <button type="submit">Create in ${Z}</button>
  </form></details>`}function $6(Z,$){let{guiBaseUrl:J,mirror:Q,writesEnabled:W}=$,X=[],V=K0(Z.owner_session,$);if(V)X.push(V);let z=Y0(Z.owner_session,$);if(z)X.push(z);if(Z.priority)X.push(`<span class="chip chip-prio-${K(Z.priority)}">${K(Z.priority)}</span>`);for(let U of Z.tags)X.push(`<span class="chip">${K(U)}</span>`);if(Z.paused)X.push('<span class="badge badge-paused" title="parked — resume the same session (§5.5)">paused</span>');if(Z.done_without_dream)X.push('<span class="badge badge-nodream" title="done without a dream — consolidation skipped (§5.4)">no-dream</span>');for(let U of Z.problems)X.push(`<span class="badge badge-problem" title="${K(U)}">⚠ invariant</span>`);let Y=Z.artifacts.length>0?`<div class="cap-desc">produced: ${Z.artifacts.map((U)=>`<span class="chip mono">${K(U)}</span>`).join(" ")}${Z.dream_id?` <span class="dim mono">(${K(Z.dream_id)})</span>`:""}</div>`:Z.dream_id?`<div class="cap-desc dim mono">dream: ${K(Z.dream_id)}</div>`:"",M=Z.body?`<details class="spec"><summary>spec</summary><div class="spec-body">${K(A(Z.body,600))}</div></details>`:"",G=Q0(Z.title,Z.owner_session,Q.sessionTitles);return`<div class="card wi ${Z.paused?"paused":""}" data-key="wi:${K(Z.id)}">
    <div class="cap-head">
      <span class="mono dim">${K(Z.id)}</span>
      <span class="cap-name">${K(A(G,90))}</span>
      ${l0(Z.owner_session,J,Q)}
    </div>
    <div class="chips">${X.join(" ")}</div>
    ${i0(Z.subtasks)}
    ${a0($.todoSubStates[Z.id])}
    ${Y}
    ${s0(Z)}
    ${t0(Z,J,Q)}
    ${M}
    ${W?Z6(Z,$):""}
  </div>`}function J6(Z,$){let J=K0(Z.id,$),Q=Y0(Z.id,$),W=[J,Q].filter(Boolean).join(" ");return`<div class="card session-only" data-key="ses:${K(Z.id)}">
    <div class="cap-head">
      <span class="cap-name">${K(A(Z.title,80))}</span>
      <a class="open-link" href="${K(Z.openUrl)}" target="_blank" rel="noopener">Open ↗</a>
    </div>
    ${W?`<div class="chips">${W}</div>`:""}
    <div class="cap-desc mono">${K(Z.id)}</div>
    <div class="cap-desc dim">session-only — awakened, no work item yet · updated ${S(Z.updated)}</div>
  </div>`}function g(Z,$,J=""){return`<div class="col" data-key="col:${K(Z)}" data-col="${K(Z)}">
    <div class="col-head"><button type="button" class="col-toggle" data-col-toggle="${K(Z)}" aria-pressed="false" title="collapse/expand this column (survives refresh)">${K(Z)} <span class="count">(${$.length})</span><span class="col-toggle-icon" aria-hidden="true">▾</span></button></div>
    <div class="col-body">
      ${J}
      ${$.length===0?'<div class="empty">—</div>':$.join(`
`)}
    </div>
  </div>`}function Q6(Z){let $=Z.map((J)=>{let Q=Array.isArray(J.tags)?J.tags:[];return{id:J.id,status:J.status,title:J.title??"",tags:Q,hay:`${J.id} ${J.title??""} ${Q.join(" ")} ${J.body??""}`.toLowerCase()}});return JSON.stringify($).replaceAll("</","<\\/")}function X6(Z,$,J){let Q=(z)=>$6(z,$),W=[...Z.inProgress.map((z)=>({key:D(z),tie:z.id,html:Q(z)})),...Z.sessionOnly.map((z)=>({key:z.updated,tie:z.id,html:J6(z,$)}))];W.sort((z,Y)=>z.key!==Y.key?Y.key.localeCompare(z.key):Y.tie.localeCompare(z.tie));let X=W.map((z)=>z.html);return`${`<script id="filter-corpus" type="application/json" data-key="filter:corpus">${Q6(J)}</script>`}<div class="kanban">
    ${g("Backlog",Z.backlog.map(Q),$.writesEnabled?z0("backlog"):"")}
    ${g("Todo",Z.todo.map(Q),$.writesEnabled?z0("todo"):"")}
    ${g("In Progress",X)}
    ${g("Done",Z.done.map(Q))}
  </div>`}var q0=`
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
`;function j0(Z){let $=new Map,J=0;for(let Y of Z.items){let M=Array.isArray(Y.tags)?Y.tags:[];if(M.length===0)J++;for(let G of M)$.set(G,($.get(G)??0)+1)}let Q=[...$.entries()].sort((Y,M)=>M[1]-Y[1]||Y[0].localeCompare(M[0])),W=(Y,M,G)=>`<button type="button" class="tag-chip" data-tag="${K(Y)}" title="${K(G)}">${K(M)}</button>`,X=12,V=Q.slice(0,X),z=Q.slice(X);return`<div id="board-controls">
  <div id="controls-row">
    <button type="button" id="controls-toggle" aria-expanded="true" aria-controls="controls-panel" title="collapse/expand the filter/tag controls">filters ▴</button>
    <input id="filter-q" type="search" placeholder="filter — id, title, tag, spec…" autocomplete="off" spellcheck="false" aria-label="filter work items">
    <span id="controls-summary" title="active filter — tap “filters” to change it"></span>
  </div>
  <div id="controls-panel">
    <div id="filter-bar" role="search">
      <div id="filter-tags" role="group" aria-label="filter by tag">
        ${V.map(([Y,M])=>W(Y,`${Y} ${M}`,`${M} item${M===1?"":"s"} tagged ${Y} — tap to filter`)).join(`
        `)}
        ${z.length>0?`<details id="filter-tags-more"><summary>+${z.length} more tags</summary><div class="tag-tail">${z.map(([Y,M])=>W(Y,`${Y} ${M}`,`${M} item${M===1?"":"s"} tagged ${Y} — tap to filter`)).join(`
        `)}</div></details>`:""}
        ${W("__untagged__",`untagged ${J}`,"show ONLY items with no tags — the tagging-backlog hunting set (W-019)")}
      </div>
      <button type="button" id="filter-clear" title="clear search text and all tag filters" hidden>clear</button>
    </div>
    <div id="collapse-strip" aria-label="collapse/expand columns">
      ${["Backlog","Todo","In Progress","Done"].map((Y)=>`<button type="button" class="col-toggle" data-col-toggle="${K(Y)}" title="collapse/expand the ${K(Y)} column">${K(Y)} <span class="col-toggle-icon" aria-hidden="true">▾</span></button>`).join(`
      `)}
    </div>
  </div>
</div>`}function M0(Z,$=[]){let{dreams:J,messages:Q}=Z,W={guiBaseUrl:Z.guiBaseUrl,mirror:Z.sessions,writesEnabled:Z.writesEnabled,sessionBackend:Z.sessionBackend,decisions:Z.promoteDecisions,todoSubStates:Z.todoSubStates,actionRequired:Z.actionRequired,sessionStatus:Z.sessionStatus},X=$.length===0?"":`<div class="notices">${$.map((z)=>`<div class="notice"><span class="mono dim">${S(z.at)}</span> ${K(z.text)}</div>`).join("")}</div>`;return`${`<div class="meta mono">workspace ${K(Z.workspaceRoot)} · generated ${K(Z.generatedAt)} · live refresh 15s · ${c0(Z.buildSha)}</div>`}
<h2>Board <span class="count">(${Z.items.length} items · ${Z.board.sessionOnly.length} session-only)</span> <span id="filter-count" class="count" title="how many work items the current filter shows / total — updated live by the filter bar"></span></h2>
${X}
${X6(Z.board,W,Z.items)}
${Z.writesEnabled?"":'<div class="meta">read-only view — the board write path stays sealed behind the hive_board_* tools (WI-062)</div>'}`}function W6(Z){let $=Z.tagName;return $==="INPUT"||$==="TEXTAREA"||$==="SELECT"}function z6(Z){let $=Z.ownerDocument.activeElement??null;if(!$||!Z.contains($))return null;let J=null,Q=null;if($ instanceof HTMLInputElement||$ instanceof HTMLTextAreaElement)try{J=$.selectionStart,Q=$.selectionEnd}catch{}return{key:V6($,Z),name:$.getAttribute("name"),start:J,end:Q}}function V6(Z,$){let J=Z;while(J&&J!==$){let Q=J.getAttribute("data-key");if(Q)return Q;J=J.parentElement}return null}function K6(Z,$){if(!$)return;let J=$.key!==null?Z.querySelector(`[data-key="${U0($.key)}"]`)??Z:Z,Q=$.name?`[name="${U0($.name)}"]`:null,W=Q?J.querySelector(Q):null;if(W instanceof HTMLElement){if(W.focus(),(W instanceof HTMLInputElement||W instanceof HTMLTextAreaElement)&&$.start!==null)try{W.setSelectionRange($.start,$.end??$.start)}catch{}}}function U0(Z){return Z.replace(/["\\]/g,"\\$&")}function G0(Z,$){let J=z6(Z);H0(Z,$,!0),K6(Z,J)}function H0(Z,$,J=!1){if(Z.tagName!==$.tagName){Z.replaceWith($);return}Y6(Z,$,J),q6(Z,$)}function Y6(Z,$,J=!1){let Q=Z.tagName==="DETAILS",W=W6(Z);for(let X of Array.from($.attributes)){if(Q&&X.name==="open")continue;if(W&&X.name==="value")continue;if(Z.getAttribute(X.name)!==X.value)Z.setAttribute(X.name,X.value)}if(!J)for(let X of Array.from(Z.attributes)){if(Q&&X.name==="open")continue;if(W&&X.name==="value")continue;if(!$.hasAttribute(X.name))Z.removeAttribute(X.name)}}function w(Z){return Z instanceof Element?Z.getAttribute("data-key"):null}function q6(Z,$){let J=Array.from(Z.childNodes),Q=Array.from($.childNodes),W=new Map;for(let V of J){let z=w(V);if(z!==null)W.set(z,V)}let X=0;for(let V of Q){let z=w(V);if(z!==null&&W.has(z)){let M=W.get(z);W.delete(z);let G=Z.childNodes[X];if(G!==M)Z.insertBefore(M,G??null);B0(M,V),X=j6(Z,M)+1;continue}let Y=Z.childNodes[X]??null;if(Y&&w(Y)===null&&M6(Y,V))B0(Y,V),X++;else Z.insertBefore(V.cloneNode(!0),Y),X++}while(Z.childNodes.length>X)Z.removeChild(Z.childNodes[X])}function j6(Z,$){return Array.prototype.indexOf.call(Z.childNodes,$)}function M6(Z,$){if(Z.nodeType!==$.nodeType)return!1;if(Z.nodeType===Node.ELEMENT_NODE)return Z.tagName===$.tagName;return!0}function B0(Z,$){if(Z.nodeType===Node.ELEMENT_NODE&&$.nodeType===Node.ELEMENT_NODE){H0(Z,$);return}if(Z.nodeType===Node.TEXT_NODE||Z.nodeType===Node.COMMENT_NODE){if(Z.nodeValue!==$.nodeValue)Z.nodeValue=$.nodeValue;return}Z.replaceWith($.cloneNode(!0))}var U6=["Backlog","Todo","In Progress","Done"],O={q:"hb.filter.q",tags:"hb.filter.tags",collapsed:"hb.collapsed",controls:"hb.controls.collapsed"};function B6(){try{return typeof window.matchMedia==="function"?window.matchMedia("(max-width:640px)").matches:!1}catch{return!1}}function I(Z){try{return window.localStorage.getItem(Z)}catch{return null}}function x(Z,$){try{window.localStorage.setItem(Z,$)}catch{}}function G6(){try{return new Set(JSON.parse(I(O.tags)??"[]"))}catch{return new Set}}function H6(){try{return new Set(JSON.parse(I(O.collapsed)??"[]"))}catch{return new Set}}function P6(){let Z=I(O.controls);if(Z==="collapsed")return!0;if(Z==="expanded")return!1;return B6()}var q={q:I(O.q)??"",tags:G6(),collapsed:H6(),controlsCollapsed:P6()},_=[];function F6(){let Z=document.getElementById("filter-corpus");if(!Z||!Z.textContent)return _;try{let $=JSON.parse(Z.textContent);return Array.isArray($)?$:_}catch{return _}}var F="__untagged__";function O6(Z){let $=q.tags.has(F),J=[...q.tags].filter((Q)=>Q!==F);if($&&Z.tags.length>0)return!1;if(!$){for(let Q of J)if(!Z.tags.includes(Q))return!1}else if(J.length>0)return!1;if(q.q){let Q=q.q.toLowerCase();if(!Z.hay.includes(Q))return!1}return!0}function y(){_=F6();let Z=new Map;for(let X of _)Z.set(X.id,O6(X));let $=q.q!==""||q.tags.size>0,J=0,Q=0;for(let X of Array.from(document.querySelectorAll(".card.wi"))){let V=X.getAttribute("data-key")??"",z=V.startsWith("wi:")?V.slice(3):"",Y=!$||Z.get(z)===!0;if(X.classList.toggle("filter-hidden",!Y),$)if(Y)J++;else Q++}for(let X of Array.from(document.querySelectorAll(".card.session-only")))X.classList.toggle("filter-dim",$);let W=document.getElementById("board-root");if(W)W.classList.toggle("filter-empty",$&&_.length>0&&J===0);N6($,J,Q),L6($,J),k6()}function _6(){let Z=[...q.tags].filter((X)=>X!==F);if(Z.length<2)return null;if(q.tags.has(F))return null;let $=q.q.toLowerCase(),J=(X)=>$===""||X.hay.includes($),Q=Z.map((X)=>_.filter((V)=>V.tags.includes(X)&&J(V)).length);if(Q.some((X)=>X===0))return null;return`no items have all of: ${Z.map((X,V)=>`${X} (${Q[V]})`).join(" + ")} — each has matches individually`}function N6(Z,$,J){let Q=document.getElementById("filter-count");if(!Q)return;let W=_.length,X=_.filter((V)=>V.tags.length===0).length;if(W===0){Q.textContent="· board is empty",Q.title="no work items on the board at all";return}if(!Z){Q.textContent=`· ${W} items · ${X} untagged`,Q.title=`${X} of ${W} items carry no tags — the set a tag filter cannot reach (tap "untagged" to list them)`;return}if($===0){let V=[...q.tags].filter((Y)=>Y!==F);if(q.tags.has(F)&&V.length>0){Q.textContent="· nothing can match — untagged + a tag is empty by definition",Q.title=`the untagged filter lists ONLY items with no tags, and ${V.join(" + ")} require${V.length===1?"s":""} a tag. Drop one of them.`;return}let z=_6();if(z){Q.textContent=`· ${z} — ${J} hidden`,Q.title=`the AND-combination is empty: no single item carries every selected tag. Remove one tag to widen the result. ${X} item${X===1?"":"s"} on the board carry no tags.`;return}Q.textContent=J>0?`· no items match — ${J} hidden`:"· no items match",Q.title=`the filter hid all ${J} item${J===1?"":"s"}. ${X} item${X===1?"":"s"} on the board carry no tags and can only be reached via the "untagged" filter or free text.`}else Q.textContent=`· showing ${$}/${W} · ${X} untagged`,Q.title=`${J} hidden by the filter · ${X} of ${W} items carry no tags`}function D6(Z,$){if(!Z)return{text:"no filter active",tags:[],untaggedActive:!1};let J=[...q.tags].filter((z)=>z!==F).sort(),Q=q.tags.has(F),W=q.q!==""?`“${q.q}”`:"",X=`showing ${$}/${_.length}`,V=[W,...J,...Q?["untagged"]:[]];return{text:V.length>0?`${V.join(" + ")} · ${X}`:X,tags:J,untaggedActive:Q}}function L6(Z,$){let J=document.getElementById("controls-summary");if(!J)return;let{text:Q,tags:W,untaggedActive:X}=D6(Z,$);if(J.textContent="",J.classList.toggle("has-filter",Z),!Z){J.textContent=Q;return}let V=[...W,...X?[F]:[]],z=V.length,Y=()=>{if(J.textContent="",q.q!==""){let U=document.createElement("span");U.className="summary-q",U.textContent=`“${q.q}”`,J.appendChild(U)}for(let U of V.slice(0,z)){let k=document.createElement("span");if(k.className="tag-chip active",U===F)k.setAttribute("data-tag",F);if(k.textContent=U===F?"untagged":U,z===1)k.classList.add("summary-chip-shrink");J.appendChild(k)}let M=V.length-z;if(M>0){let U=document.createElement("span");U.className="summary-more",U.textContent=`+${M} more`,U.title=`${M} more active tag${M===1?"":"s"}: ${V.slice(z).join(", ")} — tap “filters” to expand`,J.appendChild(U)}let G=document.createElement("span");G.className="summary-n",G.textContent=`${$}/${_.length}`,J.appendChild(G)};Y();while(z>1&&J.scrollWidth>J.clientWidth)z--,Y();J.title=Q}function k6(){let Z=document.getElementById("filter-q");if(Z&&Z.value!==q.q)Z.value=q.q;let $=document.getElementById("filter-clear");if($)if(q.q!==""||q.tags.size>0)$.removeAttribute("hidden");else $.setAttribute("hidden","");for(let J of Array.from(document.querySelectorAll("#filter-tags .tag-chip"))){let Q=J.getAttribute("data-tag")??"";J.classList.toggle("active",q.tags.has(Q)),J.setAttribute("aria-pressed",q.tags.has(Q)?"true":"false")}for(let J of Array.from(document.querySelectorAll("[data-col-toggle]"))){let Q=J.getAttribute("data-col-toggle")??"";J.setAttribute("aria-pressed",q.collapsed.has(Q)?"true":"false")}}function p(){for(let Z of U6){let $=q.collapsed.has(Z),J=document.querySelector(`.col[data-col="${P0(Z)}"]`);if(J)J.classList.toggle("collapsed",$);for(let Q of Array.from(document.querySelectorAll(`[data-col-toggle="${P0(Z)}"]`)))Q.setAttribute("aria-pressed",$?"true":"false")}}function P0(Z){return Z.replace(/["\\]/g,"\\$&")}function E6(Z){if(q.collapsed.has(Z))q.collapsed.delete(Z);else q.collapsed.add(Z);x(O.collapsed,JSON.stringify([...q.collapsed])),p()}function b(){let Z=document.getElementById("board-controls");if(!Z)return;let $=q.controlsCollapsed;Z.classList.toggle("controls-collapsed",$);let J=document.getElementById("controls-toggle");if(J)J.setAttribute("aria-expanded",$?"false":"true"),J.textContent=$?"filters ▾":"filters ▴",J.title=$?"expand the filter/tag controls":"collapse the filter/tag controls"}function R6(){q.controlsCollapsed=!q.controlsCollapsed,x(O.controls,q.controlsCollapsed?"collapsed":"expanded"),b()}function A6(Z){let $=Z.target;if(!$)return;if($.closest("#controls-toggle")){Z.preventDefault(),R6();return}let J=$.closest("[data-col-toggle]");if(J){let W=J.getAttribute("data-col-toggle");if(W)Z.preventDefault(),E6(W);return}let Q=$.closest("#filter-tags .tag-chip");if(Q){let W=Q.getAttribute("data-tag");if(W){if(q.tags.has(W))q.tags.delete(W);else q.tags.add(W);x(O.tags,JSON.stringify([...q.tags])),y()}return}if($.closest("#filter-clear"))q.q="",q.tags.clear(),x(O.q,""),x(O.tags,"[]"),y()}function x6(Z){let $=Z.target;if(!$||$.id!=="filter-q")return;q.q=$.value,x(O.q,q.q),y()}var u=!1;function F0(){if(u)return;if(u=!0,document.addEventListener("click",A6),document.addEventListener("input",x6),b(),p(),y(),I(O.controls)===null&&typeof window.matchMedia==="function")try{let Z=window.matchMedia("(max-width:640px)"),$=(J)=>{if(I(O.controls)!==null)return;q.controlsCollapsed=J.matches,b()};if(typeof Z.addEventListener==="function")Z.addEventListener("change",$);else if(typeof Z.addListener==="function")Z.addListener($)}catch{}}function O0(){if(!u)return;b(),p(),y()}var I6=48;function C6(Z){return T(Z)||Z.startsWith("/")}function T6(Z,$){if(Z.length<=$)return Z;let J=Z.slice(0,$),Q=J.lastIndexOf(" ");return(Q>$*0.5?J.slice(0,Q):J).trimEnd()+"…"}function _0(Z){let $=C6(Z),J=Z.startsWith("/")?"awaken-input-slug":T(Z)?"opencode-placeholder":"";return{display:$?T6(Z,I6):Z,raw:Z,raw_:$,rawKind:J}}var N0='<span class="raw-title-chip" title="title is raw/unverified — no session-title surface exists under dsh yet (SHADOW-019)">(raw title)</span>';var S6="/api/hive-board/item",d="hvb-drawer",c="hvb-drawer-scrim",D0=50,y6=1e4;function f(Z){if(!Z)return"—";let $=new Date(Z);if(isNaN($.getTime()))return Z;return $.toISOString().slice(0,16).replace("T"," ")}function j(Z,$,J){let Q=document.createElement(Z);if($)Q.className=$;if(J!==void 0)Q.textContent=J;return Q}function v6(){let Z=document.getElementById(d);if(Z)return Z;Z=document.createElement("div"),Z.id=d,Z.setAttribute("hidden",""),Z.setAttribute("role","dialog"),Z.setAttribute("aria-modal","false"),Z.appendChild(l());let $=document.createElement("div");return $.id=c,$.setAttribute("hidden",""),$.addEventListener("click",()=>n()),document.body.appendChild($),document.body.appendChild(Z),Z}function n(){document.getElementById(d)?.setAttribute("hidden",""),document.getElementById(c)?.setAttribute("hidden","")}var L0=!1;function E0(){if(L0||typeof document>"u")return;L0=!0,document.addEventListener("keydown",(Z)=>{if(Z.key==="Escape")n()}),document.addEventListener("click",(Z)=>{let $=Z.target;if(!($ instanceof Element))return;let J=$.closest("a.open-link");if(J instanceof HTMLAnchorElement){Z.preventDefault();let z=J.closest('[data-key^="wi:"]')?.getAttribute("data-key");if(z)k0(z.slice(3));return}let Q=$.closest('[data-key^="wi:"]');if(!Q)return;if($.closest("a,button,input,textarea,select,form"))return;let X=(Q.getAttribute("data-key")??"").slice(3);if(X)k0(X)},!1)}function l(){let Z=j("button","hvb-drawer-close","×");return Z.type="button",Z.title="close the item detail (Esc works too)",Z.addEventListener("click",n),Z}async function k0(Z){let $=v6();$.textContent="",$.appendChild(l());let J=j("div","hvb-drawer-head mono");J.appendChild(j("span","hvb-wi-id",Z)),J.appendChild(j("span","meta","loading…")),$.appendChild(J),document.getElementById(c)?.removeAttribute("hidden"),$.removeAttribute("hidden");try{let Q=await fetch(`${S6}?id=${encodeURIComponent(Z)}`,{headers:{accept:"application/json"}});if(!Q.ok){m($,Z,`HTTP ${Q.status}`);return}let W=await Q.json();if(!W||W.ok!==!0||!W.item){m($,Z,W?.missing?.join(", ")??"unknown reason");return}b6($,W.item,W)}catch(Q){m($,Z,Q instanceof Error?Q.message:String(Q))}}function m(Z,$,J){let Q=j("div","hvb-drawer-body");Q.appendChild(j("div","meta",`${$} is not on the board (${J}). It may have been dissolved or the board moved — hit the 15 s lane refresh and retry. Nothing was written; nothing was assumed.`)),Z.appendChild(Q)}function g6(Z){let $=j("div","hvb-chip-row"),J=[[Z.status,`hvb-chip status-${Z.status}`],[Z.priority,`hvb-chip prio-${Z.priority}`],...Z.paused?[["paused","hvb-chip status-paused"]]:[]];for(let[Q,W]of J)$.appendChild(j("span",W,Q));return $}function N(Z,$){let J=j("div","hvb-face-row");return J.appendChild(j("span","mono dim",Z)),J.appendChild(j("span","mono",$&&$.length?$:"—")),J}function v(Z){return j("div","hvb-section-title",Z)}function b6(Z,$,J){Z.textContent="",Z.appendChild(l());let Q=_0($.title),W=j("div","hvb-drawer-head"),X=j("div","hvb-drawer-title-row"),V=j("h3","hvb-drawer-title",Q.display);if(V.title=Q.raw,X.appendChild(V),Q.raw_){let H=document.createElement("span");H.innerHTML=N0,X.appendChild(H.firstChild)}W.appendChild(X),W.appendChild(g6($)),Z.appendChild(W);let z=j("div","hvb-face mono");if(z.appendChild(N("id",$.id)),z.appendChild(N("owner",$.owner_session)),z.appendChild(N("group",$.group_id)),z.appendChild(N("origin",$.origin)),z.appendChild(N("created",f($.created))),z.appendChild(N("updated",f($.updated))),z.appendChild(N("recency",$.recency)),z.appendChild(N("spec",$.spec_hash)),$.released_sessions&&$.released_sessions.length>0)z.appendChild(N("released",$.released_sessions.join(", ")));if($.dream_id)z.appendChild(N("dream",$.dream_id));Z.appendChild(z);let Y=$.problems??[];if(Y.length>0){let H=j("div","hvb-problems");H.appendChild(v("⚠ invariant problems (detection only — SCHEMA §3, WI-071)"));for(let P of Y)H.appendChild(j("div","hvb-problem mono",P));Z.appendChild(H)}if($.subtasks&&$.subtasks.length>0){let H=j("div","hvb-subtasks");H.appendChild(v(`subtasks (${$.subtasks.filter((P)=>P.status==="completed").length}/${$.subtasks.length})`));for(let P of $.subtasks){let B=j("div","hvb-subtask-row");B.appendChild(j("span","mono hvb-subtask-icon",P.status==="completed"?"☑":P.status==="in_progress"?"▸":P.status==="cancelled"?"✕":"○")),B.appendChild(j("span",void 0,P.content)),H.appendChild(B)}Z.appendChild(H)}let M=$.todo_mirror??[];if(M.length>0){let H=j("div","hvb-mirror");H.appendChild(v(`todo mirror (${M.length}${$.todo_mirror_updated?` · updated ${f($.todo_mirror_updated)}`:""})`));for(let P of M){let B=j("div","hvb-mirror-row"),E=String(P.state??P.status??"");B.appendChild(j("span","mono hvb-subtask-icon",E==="completed"?"☑":E==="in_progress"?"▸":"○")),B.appendChild(j("span",void 0,typeof P.content==="string"?P.content:JSON.stringify(P))),H.appendChild(B)}Z.appendChild(H)}let G=$.transitions??[];if(G.length>0){let H=j("div","hvb-history");H.appendChild(v(`history (${G.length})`));let P=G.slice(0,D0);for(let B of P){let E=j("div","hvb-history-row mono"),w0=B.absorbed?`${B.from??"∅"} ⇢ ${B.to} (absorbed ${B.absorbed})`:`${B.from??"∅"} ⇢ ${B.to}`;E.appendChild(j("span","meta",f(B.at))),E.appendChild(j("span",void 0,w0)),E.appendChild(j("span","meta",B.by+(B.session?` · ${B.session}`:"")+(B.superseded?` · spec ${B.superseded} superseded`:""))),H.appendChild(E)}if(G.length>P.length)H.appendChild(j("div","meta",`+ ${G.length-P.length} older transitions not shown (drawer cap ${D0} — nothing dropped from the record; the board file keeps them all)`));Z.appendChild(H)}let U=j("div","hvb-spec");U.appendChild(v("spec"));let k=j("pre","mono hvb-spec-body",$.body);if(k.setAttribute("tabindex","0"),U.appendChild(k),J.truncated)U.appendChild(j("div","meta",`spec truncated for display at ${y6} chars (full spec is ${J.bodyBytes??"?"} chars — served from the board file; this is a DISPLAY cap, the file is untouched)`));Z.appendChild(U),Z.appendChild(j("div","meta hvb-drawer-foot","read-only depth view — the board's write path stays sealed behind the hive_board_* tools (WI-062)"))}var R0=`
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
`;var A0={high:0,medium:1,low:2};function o(Z){return[...Z].sort(($,J)=>{let Q=A0[$.priority],W=A0[J.priority];if(Q!==W)return Q-W;let X=D($),V=D(J);if(X!==V)return V.localeCompare(X);return J.id.localeCompare($.id)})}function x0(Z,$){let J=D(Z),Q=D($);if(J!==Q)return Q.localeCompare(J);return $.id.localeCompare(Z.id)}function I0(Z,$){let J=new Set;for(let Q of Z){if(Q.owner_session)J.add(Q.owner_session);for(let W of Q.released_sessions)J.add(W)}return{backlog:o(Z.filter((Q)=>Q.status==="backlog")),todo:o(Z.filter((Q)=>Q.status==="todo")),inProgress:Z.filter((Q)=>Q.status==="in_progress").sort(x0),done:Z.filter((Q)=>Q.status==="done").sort(x0),sessionOnly:$.cards.filter((Q)=>!J.has(Q.id))}}var r="/api/hive-board/index",f6=15000,h="18ecdaf-dirty";function h6(Z){if(!Z||Z==="unknown"||h==="unknown")return"unknown";return Z===h?"match":"mismatch"}function w6(Z){let $=document.getElementById("build-badge");if(!$)return;if(h6(Z)==="mismatch")$.classList.add("stale"),$.textContent=`stale client — reload (bundle ${h} ≠ host ${Z})`,$.setAttribute("title",`this tab is running an old client bundle (built ${h}) against a newer host build (${Z}). Reload the page to get the current bundle.`);else $.classList.remove("stale")}var C0={available:!1,computedAt:"",totalPersisted:0,awakeIds:0,awakeDeleted:0,cards:[],persistedIds:[]},u6={artifactCounts:{insight:0,warning:0,songline:0,shadow:0,total:0},active:[],history:[],recentArtifacts:[]};function p6(Z){return{...Z,tags:Array.isArray(Z.tags)?Z.tags:[],subtasks:Array.isArray(Z.subtasks)?Z.subtasks:[],todo_mirror:Array.isArray(Z.todo_mirror)?Z.todo_mirror:[],transitions:Array.isArray(Z.transitions)?Z.transitions:[],released_sessions:Array.isArray(Z.released_sessions)?Z.released_sessions:[],artifacts:Array.isArray(Z.artifacts)?Z.artifacts:[],problems:Array.isArray(Z.problems)?Z.problems:[],status:Z.status,priority:Z.priority,origin:Z.origin}}function a(Z){let $=(Array.isArray(Z.items)?Z.items:[]).map(p6);return{generatedAt:typeof Z.generated==="string"?Z.generated:"",workspaceRoot:typeof Z.workspaceRoot==="string"?Z.workspaceRoot:"(unknown workspace)",buildSha:typeof Z.boardBuild==="string"&&Z.boardBuild!==""?Z.boardBuild:"unknown",guiBaseUrl:"",capabilities:[],dreams:u6,messages:[],items:$,board:I0($,{...C0}),writesEnabled:!1,sessionBackend:"unconfigured",promoteDecisions:{},sessions:{...C0},todoSubStates:{},actionRequired:{},sessionStatus:{}}}var m6=null,y0="";function d6(Z){let $=document.createElement("main");return $.id="board-root",$.innerHTML=M0(Z),$}function c6(Z){let $=document.getElementById("board-root");if(!$)return;G0($,d6(Z)),w6(Z.buildSha),O0()}async function i(){try{let Z=await fetch(r,{headers:{accept:"application/json"}});if(!Z.ok)return;let $=await Z.json();if(!$||typeof $!=="object"||$.ok!==!0)return;if(!Array.isArray($.items))return;let J=a($);m6=J,y0=J.buildSha,n6(J),c6(J)}catch{}}var T0=!1;function n6(Z){if(T0)return;let $=document.getElementById("board-controls-host");if(!$)return;$.innerHTML=j0(Z),T0=!0}function s(){if(document.hidden)return;i()}document.addEventListener("visibilitychange",s);window.addEventListener("pageshow",s);window.addEventListener("focus",s);var S0=!1;function v0(Z){if(F0(),E0(),!S0){S0=!0;let $=Z.interval;if(typeof $==="function")$(()=>{i()},f6);else console.error("[@hive/dsh-board] no interval service — poll cadence degraded to refresh-on-visible")}i()}var l6=30000,b0="hvb-favicon",o6="data-plugin-favicon";function i6(Z,$){let J=0;for(let W of Z)if(W.status==="in_progress"&&!W.paused)J++;let Q=0;for(let W of Object.keys($)){let X=$[W];if(X&&(X.awaitingQuestion||X.awaitingPermission))Q++}return Q>0?{session:"intervene",dreaming:!1,count:Q}:J>0?{session:"active",dreaming:!1,count:J}:{session:"quiet",dreaming:!1,count:0}}var t=!1,g0="";function r6(Z,$){let J=document.getElementById(b0);if(!J)return;let Q=W0(i6(Z,$));if(Q===g0)return;g0=Q,J.setAttribute("href",Q)}async function e(){try{let Z=await fetch(r,{headers:{accept:"application/json"}});if(!Z.ok)return;let $=await Z.json();if(!$||typeof $!=="object"||$.ok!==!0)return;let J=a($);r6(J.items,J.actionRequired)}catch{}}function C(){if(!document.hidden)e()}function f0(Z){}function h0(Z){if(t)return;if(typeof document>"u")return;t=!0,Z.effect(()=>{let J=document.querySelector('link[rel="icon"]'),Q=document.createElement("link");return Q.id=b0,Q.rel="icon",Q.type="image/svg+xml",Q.setAttribute(o6,"@hive/dsh-board"),document.head.appendChild(Q),e(),document.addEventListener("visibilitychange",C),window.addEventListener("pageshow",C),window.addEventListener("focus",C),()=>{if(Q.remove(),J)J.setAttribute("href",J.getAttribute("href")??"");document.removeEventListener("visibilitychange",C),window.removeEventListener("pageshow",C),window.removeEventListener("focus",C),t=!1}},"board favicon driver");let $=Z.interval;if(typeof $==="function")$(()=>{e()},l6);else console.error("[@hive/dsh-board] favicon driver: no interval service — cadence degraded to refresh-on-visible")}var a6=`
/* ── DSH shell-adaptation overrides (WI-062 slice 3; authored — see banner) ── */
.hvb-root{height:100%;overflow-y:auto;box-sizing:border-box;padding:16px 20px 32px;font-size:12.5px;line-height:1.45}
.hvb-root h2{font-size:13.5px;margin:0 0 8px}
.hvb-root .kanban{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
.hvb-root .col{flex:1 1 200px;min-width:200px;max-width:360px}
.hvb-sub{color:rgba(128,128,128,.9);font-size:11.5px;margin:0 0 10px}
.hvb-controls-note{color:rgba(128,128,128,.75);font-size:11px;margin:0 0 8px}
`,s6='<div class="empty">Fetching the board…</div>',t6='<div class="hvb-sub">read-only view of the workspace board (WI-*) — the write path stays sealed behind the hive_board_* tools (WI-062)</div>'+`<div id="board-controls-host"></div><main id="board-root">${s6}</main>`;function e6(Z){let $=typeof Z==="number"&&isFinite(Z)?Z:20;return`<svg width="${$}" height="${$}" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><rect x="3" y="4" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/><rect x="3" y="15" width="5" height="5" rx="1" fill="currentColor" opacity="0.35"/><rect x="10" y="4" width="5" height="13" rx="1" fill="currentColor" opacity="0.8"/><rect x="10" y="19" width="5" height="1" rx="0.5" fill="currentColor" opacity="0.35"/><rect x="17" y="4" width="5" height="5" rx="1" fill="currentColor" opacity="0.8"/><rect x="17" y="11" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/></svg>`}globalThis.__BOARD_ENGINE={CSS:q0,CSS_OVERRIDES:a6+R0,SHELL_MARKUP:t6,ICON_SVG:e6,attachEngine:v0,startFaviconDriver:h0,attachSessionSurface:f0};})();
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
        // Favicon driver (slice 3b) — APPLY-LEVEL on purpose: it must run at
        // plugin boot, BEFORE and INDEPENDENT of any board-panel mount, so the
        // browser tab's icon reflects board truth while a different panel is
        // active. Panel-level wiring (slots) above stays untouched.
        E.startFaviconDriver(ctx);
        console.log('[@hive/dsh-board] client plugin applied (viewer-parity read-only board + favicon driver + item drawer)');
      },
    };
  },
});
