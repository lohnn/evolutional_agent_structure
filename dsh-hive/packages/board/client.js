// @hive/dsh-board — GENERATED client bundle (WI-062 slice 3+3b + WI-083). DO NOT EDIT BY HAND.
// Build: dsh-hive/packages/board/scripts/build-client.ts (bun) — bundles
// websrc/client-main.ts (the ported 4400 viewer engine + the tab engine + the
// favicon driver + the item drawer + the WI-083 hive-state dock overlay) into
// the twin classic shape; the wrapper below is the only React-using code and
// takes React from the loader's runtime module table (W-044).
// Build stamp (both sides of the I-152 staleness verdict): 71085bb-dirty
(()=>{function S0($){let J=new Set;for(let Z of $.transitions){if(Z.superseded!==void 0)continue;if(Z.session&&Z.session!==$.owner_session)J.add(Z.session)}return[...J]}function T0($){return $.transitions.filter((J)=>typeof J.superseded==="string"&&J.superseded!=="").map((J)=>({at:J.at,by:J.by,...J.session?{session:J.session}:{},supersededHash:J.superseded}))}function y0($){return $.transitions.filter((J)=>typeof J.absorbed==="string"&&J.absorbed!=="").map((J)=>({id:J.absorbed,at:J.at}))}var L6=/^New session - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;function r($){if($==null)return!0;let J=$.trim();if(J==="")return!0;return L6.test(J)}function C6($){return $!=null&&$.trim()!==""&&!r($)}function b0($,J,Z){if(!r($))return $;if(!J||!Z)return $;let Q=Z[J];return C6(Q)?Q:$}function g($){let J="";for(let Z of $.transitions)if(Z.at&&Z.at>J)J=Z.at;return J||$.updated}function f0($){let J=0,Z=0,Q=0,X=0,W=null;for(let z of $)switch(z.status){case"completed":J++;break;case"in_progress":if(Z++,W===null)W=z.content;break;case"pending":Q++;break;case"cancelled":X++;break}return{total:$.length,completed:J,inProgress:Z,pending:Q,cancelled:X,current:W}}var C={field:"#0d1117",panel:"#161b22",border:"#30363d",edge:"#30363d",node:"#484f58",strata:"#30363d",divider:"#8b949e",amber:"#d29922",red:"#f85149"},Z2=C.field,i=[[11,28],[23,14],[33,29],[45,16],[53,28]],E6=[[0,1],[1,2],[1,3],[2,3],[3,4],[0,2]],k6=[[11,41,42,4],[7,47.5,50,5],[16,54,33,4]],R6=[3,1,4,2,0];function v0($){return $==="intervene"?C.red:$==="active"?C.amber:C.node}function V0($,J={}){let{idPrefix:Z="hbf",animate:Q=!1,size:X,title:W}=J,z=`${Z}-clip`,q=v0($.session),V=$.session==="quiet"?0:Math.min(Math.max($.count,1),i.length),K=new Set(R6.slice(0,V)),G=Q?' class="lit"':"",U="";for(let[L,R]of E6){let E=K.has(L)||K.has(R),[T,u]=i[L],[O,A]=i[R];U+=`<line x1="${T}" y1="${u}" x2="${O}" y2="${A}" stroke="${E?q:C.edge}" stroke-width="1.4"${E?` opacity=".8"${G}`:""}/>`}for(let L=0;L<i.length;L++){let R=K.has(L),[E,T]=i[L];U+=`<circle cx="${E}" cy="${T}" r="${R?4.2:3.2}" fill="${R?q:C.node}"${R?G:""}/>`}let x=$.dreaming?C.amber:C.strata,B=$.dreaming&&Q?' class="dreaming"':"",F=k6.map(([L,R,E,T])=>`<rect x="${L}" y="${R}" width="${E}" height="${T}" fill="${x}"/>`).join(""),P=X?` width="${X}" height="${X}"`:"",D=W?' role="img"':' aria-hidden="true"',k=W?`<title>${W}</title>`:"";return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${P}${D}>`+k+`<defs><clipPath id="${z}"><rect x="4" y="4" width="56" height="56" rx="12"/></clipPath></defs><rect x="4" y="4" width="56" height="56" rx="12" fill="${C.panel}" stroke="${C.border}" stroke-width="1.5"/><g clip-path="url(#${z})"${B}>${F}</g><line x1="9" y1="36" x2="55" y2="36" stroke="${C.divider}" stroke-width="1" opacity=".35"/><g>${U}</g></svg>`}function Y0($,J={}){let{idPrefix:Z="hbr"}=J,Q=`${Z}-clip`,X=v0($.session),W=$.dreaming?C.amber:C.strata,z=$.dreaming?18:16;return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><clipPath id="${Q}"><rect x="3" y="3" width="58" height="58" rx="13"/></clipPath></defs><rect x="3" y="3" width="58" height="58" rx="13" fill="${C.panel}" stroke="${C.border}" stroke-width="2"/><g clip-path="url(#${Q})"><rect x="3" y="40" width="58" height="${z}" fill="${W}"/></g><line x1="8" y1="35" x2="56" y2="35" stroke="${C.divider}" stroke-width="1.6" opacity=".4"/><circle cx="32" cy="21" r="9" fill="${X}"/></svg>`}function Y($){return $.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}function d($,J){return $.length>J?$.slice(0,J-1)+"…":$}function a($){if(!$)return"—";let J=new Date($);return Number.isNaN(J.getTime())?$:J.toISOString().replace("T"," ").slice(0,16)+"Z"}function I6($){let J=$==="unknown"?"build unknown":`build ${Y($)}`,Z=$==="unknown"?"git unavailable — running build could not be identified":"server build SHA — HEAD of the HIVE plugin repo, which ships this viewer";return`<span id="build-badge" class="build-badge" data-server-sha="${Y($)}" title="${Y(Z)}">${J}</span>`}function S6($,J){if(!$)return"absent";if(!J.available)return"unknown";return J.persistedIds.includes($)?"exists":"absent"}function T6($,J,Z){if(!$)return"";return`<a class="open-link" href="${Y(`${J}/?session=${$}`)}" target="_blank" rel="noopener" title="open in web GUI">Open ↗</a>`}var y6={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function b6($){if($.length===0)return"";let J=$.filter((Q)=>Q.status==="completed").length,Z=$.map((Q)=>`<li class="st st-${Y(Q.status)}"><span class="st-icon">${y6[Q.status]??"?"}</span>${Y(d(Q.content,70))}</li>`).join("");return`<div class="lane"><span class="lane-count">${J}/${$.length}</span><ul>${Z}</ul></div>`}var f6={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function v6($){if(!$||$.source==="none"||$.todos.length===0)return"";let J=f0($.todos),Z=J.total-J.cancelled,Q=Z>0?Math.round(J.completed/Z*100):0,X=$.source==="mirror"?' <span class="todo-cached" title="session not reachable now — showing the last mirrored snapshot (may lag)">cached</span>':"",W=J.current?`<div class="todo-current" title="${Y(J.current)}"><span class="st-icon">▸</span>${Y(d(J.current,72))}</div>`:J.inProgress===0&&J.pending>0?`<div class="todo-current dim">${J.pending} pending — none in progress</div>`:"",z=$.todos.map((q)=>`<li class="st st-${Y(q.status)}"><span class="st-icon">${f6[q.status]??"?"}</span>${Y(d(q.content,70))}</li>`).join("");return`<div class="todos" title="owning session TodoWrite progress (WI-038)">
    <div class="todo-head">
      <span class="todo-label">activity</span>
      <span class="todo-count mono">${J.completed}/${Z}</span>${X}
      <div class="todo-bar"><div class="todo-bar-fill" style="width:${Q}%"></div></div>
    </div>
    ${W}
    <details class="todo-list"><summary>${$.todos.length} todo${$.todos.length===1?"":"s"}</summary><ul>${z}</ul></details>
  </div>`}function g6($){let J=T0($);if(J.length===0)return"";let Z=J[J.length-1],Q=J.map((W)=>{let z=W.session?` <span class="mono dim">${Y(u0(W.session))}</span>`:"",q=`superseded body — board/${$.id}/${W.supersededHash}.md`;return`<li><span class="mono dim">${Y(a(W.at))}</span> ${Y(W.by)}${z} <span class="mono dim" title="${Y(q)}">${Y(W.supersededHash)}</span></li>`}).join("");return`<details class="revisions"><summary>spec revised ${J.length===1?"once":`${J.length}×`}<span class="dim"> · latest ${Y(a(Z.at))}</span></summary><ul>${Q}</ul></details>`}function u6($,J,Z){let Q=[],X=S0($);if(X.length>0){let W=X.map((z)=>S6(z,Z)==="exists"?`<a href="${Y(`${J}/?session=${z}`)}" target="_blank" rel="noopener" class="mono">${Y(z)}</a>`:`<span class="mono" title="session not available here">${Y(z)}</span>`).join(", ");Q.push(`previously attempted in ${W}`)}for(let W of y0($))Q.push(`absorbed <span class="mono">${Y(W.id)}</span> at bind${W.at?` (${a(W.at)})`:""}`);if(Q.length===0)return"";return`<div class="lineage">${Q.join(" · ")}</div>`}function u0($){return $.length>16?$.slice(0,16)+"…":$}function h0($,J){if(!$)return"";let Z=J.actionRequired[$];if(!Z)return"";let Q=[];if(Z.awaitingQuestion){let X=Z.questionCount>1?` (${Z.questionCount})`:"",W=Z.questionHeader?`the owning session is asking: "${Z.questionHeader}" — answer it in the session (WI-043)`:"the owning session is waiting on an answer to a question (WI-043)";Q.push(`<span class="badge badge-action badge-action-question" title="${Y(W)}">❓ needs answer${X}</span>`)}if(Z.awaitingPermission){let X=Z.permissionCount>1?` (${Z.permissionCount})`:"";Q.push(`<span class="badge badge-action badge-action-permission" title="the owning session is waiting on a command/permission approval (WI-043)">✋ needs approval${X}</span>`)}return Q.join(" ")}function w0($,J){if(!$)return"";let Z=J.actionRequired[$];if(Z&&(Z.awaitingQuestion||Z.awaitingPermission))return"";let Q=J.sessionStatus[$];if(!Q)return"";switch(Q){case"busy":return'<span class="badge badge-status badge-status-busy" title="the owning session is actively processing (WI-044)">⚙ working</span>';case"retry":return'<span class="badge badge-status badge-status-retry" title="the owning session hit a provider error and is retrying (WI-044)">⟳ retrying</span>';case"idle":return`<span class="badge badge-status badge-status-idle" title="the owning session is idle — not currently processing (this is NOT 'done'; completion is dream/column-driven) (WI-044)">✓ idle</span>`}}function p($,J,Z){return` data-confirm="1" data-confirm-severity="${$}" data-confirm-title="${Y(J)}" data-confirm-body="${Y(Z)}"`}function h6($,J){let Z=J.decisions[$.id];if(!Z)return"";let Q=`<input type="hidden" name="id" value="${Y($.id)}">`;if(Z.kind==="fresh"&&J.sessionBackend==="unconfigured")return'<div class="actions"><span class="act disabled" title="opencode server not configured (--opencode-url / OPENCODE_SERVER_PASSWORD) — session creation unavailable">Start ⏻</span></div>';if(Z.kind==="refuse")return`<div class="actions"><span class="act disabled" title="${Y(`${Z.reason}: ${Z.detail}`)}">Promote</span></div>`;if(Z.kind==="fresh")switch(Z.reason){case"never-owned":return`<div class="actions"><form method="post" action="/transitions/start"${p("start","Start a session?","This creates a fresh top-level HIVE session, binds it, and runs /awaken seeded with the spec. Confirm to proceed.")}>${Q}<button class="act act-start" title="create a fresh top-level session, bind it, auto-/awaken seeded with the spec (§5.3c)">Start</button></form></div>`;case"spec-changed":return`<div class="actions"><form method="post" action="/transitions/promote"${p("start","Start a fresh session? (spec edited)","The spec was edited after this item was demoted, so promotion creates a FRESH session (the edit is the decision, Q13) — the previous session is not reattached. Confirm to proceed.")}>${Q}<button class="act act-start" title="spec was edited after demote — promotion creates a FRESH session (Q13: the edit is the decision)">Start fresh session (spec edited)</button></form></div>`;case"done-never-owned":return`<div class="actions"><form method="post" action="/transitions/promote"${p("start","Reopen as a fresh session?","This item was marked done without ever owning a session. Promotion un-does the done state (done→todo) and starts a FRESH session (Q16). Confirm to proceed.")}>${Q}<button class="act act-start" title="done without a session — promote un-does the item (done→todo) then starts a fresh session (Q16)">Reopen as fresh session</button></form></div>`}let W=Z.reason==="done-reopen",z=W?"Reopen — re-attach original session":`Re-attach ${u0(Z.sessionID)} (spec unchanged)`;return`<div class="actions"><form method="post" action="/transitions/promote"${W?p("start","Reopen this item?","This re-opens the item and RE-ATTACHES its original owning session by id — a deep link only; /awaken is never re-run (invariant 4). Confirm to proceed."):p("start","Re-attach session?","This re-opens the existing owning session (deep link only; /awaken is not re-run). Confirm to proceed.")}>${Q}<button class="act" title="re-attaches ${Y(Z.sessionID)} — deep link only, /awaken is NEVER re-run (invariant 4)">${Y(z)}</button></form></div>`}function w6($,J){if($.status!=="in_progress")return h6($,J);let Z=[],Q=`<input type="hidden" name="id" value="${Y($.id)}">`;if(Z.push($.paused?`<form method="post" action="/transitions/unpause">${Q}<button class="act" title="resume — same owning session">Unpause</button></form>`:`<form method="post" action="/transitions/pause">${Q}<button class="act" title="park it; resume the same session later (§5.5)">Pause</button></form>`),Z.push(`<form method="post" action="/transitions/demote"${p("warn","Demote this item?","This detaches and TOMBSTONES the owning session. The idea becomes fluid again and the session will not be reattached. Confirm to proceed.")}>${Q}<select name="to" class="act-select"><option value="todo">todo</option><option value="backlog">backlog</option></select><button class="act act-warn" title="true demote: detach + tombstone the session; the idea is fluid again (§5.5)">Demote</button></form>`),!$.paused)Z.push(`<form method="post" action="/transitions/done-without-dream"${p("warn","Mark done without a dream?","This is a terminal state and skips dreamtime — no artifacts will be linked and no consolidation happens (§5.4). Confirm to proceed.")}>${Q}<button class="act" title="manual done — skips dreamtime, badged no-dream (§5.4)">Done (no dream)</button></form>`);return`<div class="actions">${Z.join("")}</div>`}function g0($){return`<details class="create" data-key="create:${$}"><summary>+ new item</summary>
  <form method="post" action="/transitions/create" class="create-form">
    <input type="hidden" name="status" value="${$}">
    <input name="title" placeholder="title" required>
    <select name="priority"><option value="medium">medium</option><option value="high">high</option><option value="low">low</option></select>
    <input name="tags" placeholder="tags, comma-separated">
    <textarea name="body" rows="3" placeholder="spec / notes (markdown)"></textarea>
    <button type="submit">Create in ${$}</button>
  </form></details>`}function p6($,J){let{guiBaseUrl:Z,mirror:Q,writesEnabled:X}=J,W=[],z=h0($.owner_session,J);if(z)W.push(z);let q=w0($.owner_session,J);if(q)W.push(q);if($.priority)W.push(`<span class="chip chip-prio-${Y($.priority)}">${Y($.priority)}</span>`);for(let U of $.tags)W.push(`<span class="chip">${Y(U)}</span>`);if($.paused)W.push('<span class="badge badge-paused" title="parked — resume the same session (§5.5)">paused</span>');if($.done_without_dream)W.push('<span class="badge badge-nodream" title="done without a dream — consolidation skipped (§5.4)">no-dream</span>');for(let U of $.problems)W.push(`<span class="badge badge-problem" title="${Y(U)}">⚠ invariant</span>`);let V=$.artifacts.length>0?`<div class="cap-desc">produced: ${$.artifacts.map((U)=>`<span class="chip mono">${Y(U)}</span>`).join(" ")}${$.dream_id?` <span class="dim mono">(${Y($.dream_id)})</span>`:""}</div>`:$.dream_id?`<div class="cap-desc dim mono">dream: ${Y($.dream_id)}</div>`:"",K=$.body?`<details class="spec"><summary>spec</summary><div class="spec-body">${Y(d($.body,600))}</div></details>`:"",G=b0($.title,$.owner_session,Q.sessionTitles);return`<div class="card wi ${$.paused?"paused":""}" data-key="wi:${Y($.id)}">
    <div class="cap-head">
      <span class="mono dim">${Y($.id)}</span>
      <span class="cap-name">${Y(d(G,90))}</span>
      ${T6($.owner_session,Z,Q)}
    </div>
    <div class="chips">${W.join(" ")}</div>
    ${b6($.subtasks)}
    ${v6(J.todoSubStates[$.id])}
    ${V}
    ${g6($)}
    ${u6($,Z,Q)}
    ${K}
    ${X?w6($,J):""}
  </div>`}function m6($,J){let Z=h0($.id,J),Q=w0($.id,J),X=[Z,Q].filter(Boolean).join(" ");return`<div class="card session-only" data-key="ses:${Y($.id)}">
    <div class="cap-head">
      <span class="cap-name">${Y(d($.title,80))}</span>
      <a class="open-link" href="${Y($.openUrl)}" target="_blank" rel="noopener">Open ↗</a>
    </div>
    ${X?`<div class="chips">${X}</div>`:""}
    <div class="cap-desc mono">${Y($.id)}</div>
    <div class="cap-desc dim">session-only — awakened, no work item yet · updated ${a($.updated)}</div>
  </div>`}function J0($,J,Z=""){return`<div class="col" data-key="col:${Y($)}" data-col="${Y($)}">
    <div class="col-head"><button type="button" class="col-toggle" data-col-toggle="${Y($)}" aria-pressed="false" title="collapse/expand this column (survives refresh)">${Y($)} <span class="count">(${J.length})</span><span class="col-toggle-icon" aria-hidden="true">▾</span></button></div>
    <div class="col-body">
      ${Z}
      ${J.length===0?'<div class="empty">—</div>':J.join(`
`)}
    </div>
  </div>`}function c6($){let J=$.map((Z)=>{let Q=Array.isArray(Z.tags)?Z.tags:[];return{id:Z.id,status:Z.status,title:Z.title??"",tags:Q,hay:`${Z.id} ${Z.title??""} ${Q.join(" ")} ${Z.body??""}`.toLowerCase()}});return JSON.stringify(J).replaceAll("</","<\\/")}function d6($,J,Z){let Q=(q)=>p6(q,J),X=[...$.inProgress.map((q)=>({key:g(q),tie:q.id,html:Q(q)})),...$.sessionOnly.map((q)=>({key:q.updated,tie:q.id,html:m6(q,J)}))];X.sort((q,V)=>q.key!==V.key?V.key.localeCompare(q.key):V.tie.localeCompare(q.tie));let W=X.map((q)=>q.html);return`${`<script id="filter-corpus" type="application/json" data-key="filter:corpus">${c6(Z)}</script>`}<div class="kanban">
    ${J0("Backlog",$.backlog.map(Q),J.writesEnabled?g0("backlog"):"")}
    ${J0("Todo",$.todo.map(Q),J.writesEnabled?g0("todo"):"")}
    ${J0("In Progress",W)}
    ${J0("Done",$.done.map(Q))}
  </div>`}var p0=`
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
`;function m0($){let J=new Map,Z=0;for(let V of $.items){let K=Array.isArray(V.tags)?V.tags:[];if(K.length===0)Z++;for(let G of K)J.set(G,(J.get(G)??0)+1)}let Q=[...J.entries()].sort((V,K)=>K[1]-V[1]||V[0].localeCompare(K[0])),X=(V,K,G)=>`<button type="button" class="tag-chip" data-tag="${Y(V)}" title="${Y(G)}">${Y(K)}</button>`,W=12,z=Q.slice(0,W),q=Q.slice(W);return`<div id="board-controls">
  <div id="controls-row">
    <button type="button" id="controls-toggle" aria-expanded="true" aria-controls="controls-panel" title="collapse/expand the filter/tag controls">filters ▴</button>
    <input id="filter-q" type="search" placeholder="filter — id, title, tag, spec…" autocomplete="off" spellcheck="false" aria-label="filter work items">
    <span id="controls-summary" title="active filter — tap “filters” to change it"></span>
  </div>
  <div id="controls-panel">
    <div id="filter-bar" role="search">
      <div id="filter-tags" role="group" aria-label="filter by tag">
        ${z.map(([V,K])=>X(V,`${V} ${K}`,`${K} item${K===1?"":"s"} tagged ${V} — tap to filter`)).join(`
        `)}
        ${q.length>0?`<details id="filter-tags-more"><summary>+${q.length} more tags</summary><div class="tag-tail">${q.map(([V,K])=>X(V,`${V} ${K}`,`${K} item${K===1?"":"s"} tagged ${V} — tap to filter`)).join(`
        `)}</div></details>`:""}
        ${X("__untagged__",`untagged ${Z}`,"show ONLY items with no tags — the tagging-backlog hunting set (W-019)")}
      </div>
      <button type="button" id="filter-clear" title="clear search text and all tag filters" hidden>clear</button>
    </div>
    <div id="collapse-strip" aria-label="collapse/expand columns">
      ${["Backlog","Todo","In Progress","Done"].map((V)=>`<button type="button" class="col-toggle" data-col-toggle="${Y(V)}" title="collapse/expand the ${Y(V)} column">${Y(V)} <span class="col-toggle-icon" aria-hidden="true">▾</span></button>`).join(`
      `)}
    </div>
  </div>
</div>`}function c0($,J=[]){let{dreams:Z,messages:Q}=$,X={guiBaseUrl:$.guiBaseUrl,mirror:$.sessions,writesEnabled:$.writesEnabled,sessionBackend:$.sessionBackend,decisions:$.promoteDecisions,todoSubStates:$.todoSubStates,actionRequired:$.actionRequired,sessionStatus:$.sessionStatus},W=J.length===0?"":`<div class="notices">${J.map((q)=>`<div class="notice"><span class="mono dim">${a(q.at)}</span> ${Y(q.text)}</div>`).join("")}</div>`;return`${`<div class="meta mono">workspace ${Y($.workspaceRoot)} · generated ${Y($.generatedAt)} · live refresh 15s · ${I6($.buildSha)}</div>`}
<h2>Board <span class="count">(${$.items.length} items · ${$.board.sessionOnly.length} session-only)</span> <span id="filter-count" class="count" title="how many work items the current filter shows / total — updated live by the filter bar"></span></h2>
${W}
${d6($.board,X,$.items)}
${$.writesEnabled?"":'<div class="meta">read-only view — the board write path stays sealed behind the hive_board_* tools (WI-062)</div>'}`}function l6($){let J=$.tagName;return J==="INPUT"||J==="TEXTAREA"||J==="SELECT"}function n6($){let J=$.ownerDocument.activeElement??null;if(!J||!$.contains(J))return null;let Z=null,Q=null;if(J instanceof HTMLInputElement||J instanceof HTMLTextAreaElement)try{Z=J.selectionStart,Q=J.selectionEnd}catch{}return{key:o6(J,$),name:J.getAttribute("name"),start:Z,end:Q}}function o6($,J){let Z=$;while(Z&&Z!==J){let Q=Z.getAttribute("data-key");if(Q)return Q;Z=Z.parentElement}return null}function r6($,J){if(!J)return;let Z=J.key!==null?$.querySelector(`[data-key="${d0(J.key)}"]`)??$:$,Q=J.name?`[name="${d0(J.name)}"]`:null,X=Q?Z.querySelector(Q):null;if(X instanceof HTMLElement){if(X.focus(),(X instanceof HTMLInputElement||X instanceof HTMLTextAreaElement)&&J.start!==null)try{X.setSelectionRange(J.start,J.end??J.start)}catch{}}}function d0($){return $.replace(/["\\]/g,"\\$&")}function n0($,J){let Z=n6($);o0($,J,!0),r6($,Z)}function o0($,J,Z=!1){if($.tagName!==J.tagName){$.replaceWith(J);return}i6($,J,Z),a6($,J)}function i6($,J,Z=!1){let Q=$.tagName==="DETAILS",X=l6($);for(let W of Array.from(J.attributes)){if(Q&&W.name==="open")continue;if(X&&W.name==="value")continue;if($.getAttribute(W.name)!==W.value)$.setAttribute(W.name,W.value)}if(!Z)for(let W of Array.from($.attributes)){if(Q&&W.name==="open")continue;if(X&&W.name==="value")continue;if(!J.hasAttribute(W.name))$.removeAttribute(W.name)}}function K0($){return $ instanceof Element?$.getAttribute("data-key"):null}function a6($,J){let Z=Array.from($.childNodes),Q=Array.from(J.childNodes),X=new Map;for(let z of Z){let q=K0(z);if(q!==null)X.set(q,z)}let W=0;for(let z of Q){let q=K0(z);if(q!==null&&X.has(q)){let K=X.get(q);X.delete(q);let G=$.childNodes[W];if(G!==K)$.insertBefore(K,G??null);l0(K,z),W=s6($,K)+1;continue}let V=$.childNodes[W]??null;if(V&&K0(V)===null&&t6(V,z))l0(V,z),W++;else $.insertBefore(z.cloneNode(!0),V),W++}while($.childNodes.length>W)$.removeChild($.childNodes[W])}function s6($,J){return Array.prototype.indexOf.call($.childNodes,J)}function t6($,J){if($.nodeType!==J.nodeType)return!1;if($.nodeType===Node.ELEMENT_NODE)return $.tagName===J.tagName;return!0}function l0($,J){if($.nodeType===Node.ELEMENT_NODE&&J.nodeType===Node.ELEMENT_NODE){o0($,J);return}if($.nodeType===Node.TEXT_NODE||$.nodeType===Node.COMMENT_NODE){if($.nodeValue!==J.nodeValue)$.nodeValue=J.nodeValue;return}$.replaceWith(J.cloneNode(!0))}var e6=["Backlog","Todo","In Progress","Done"],b={q:"hb.filter.q",tags:"hb.filter.tags",collapsed:"hb.collapsed",controls:"hb.controls.collapsed"};function $9(){try{return typeof window.matchMedia==="function"?window.matchMedia("(max-width:640px)").matches:!1}catch{return!1}}function n($){try{return window.localStorage.getItem($)}catch{return null}}function l($,J){try{window.localStorage.setItem($,J)}catch{}}function J9(){try{return new Set(JSON.parse(n(b.tags)??"[]"))}catch{return new Set}}function Z9(){try{return new Set(JSON.parse(n(b.collapsed)??"[]"))}catch{return new Set}}function Q9(){let $=n(b.controls);if($==="collapsed")return!0;if($==="expanded")return!1;return $9()}var j={q:n(b.q)??"",tags:J9(),collapsed:Z9(),controlsCollapsed:Q9()},f=[];function X9(){let $=document.getElementById("filter-corpus");if(!$||!$.textContent)return f;try{let J=JSON.parse($.textContent);return Array.isArray(J)?J:f}catch{return f}}var y="__untagged__";function W9($){let J=j.tags.has(y),Z=[...j.tags].filter((Q)=>Q!==y);if(J&&$.tags.length>0)return!1;if(!J){for(let Q of Z)if(!$.tags.includes(Q))return!1}else if(Z.length>0)return!1;if(j.q){let Q=j.q.toLowerCase();if(!$.hay.includes(Q))return!1}return!0}function s(){f=X9();let $=new Map;for(let W of f)$.set(W.id,W9(W));let J=j.q!==""||j.tags.size>0,Z=0,Q=0;for(let W of Array.from(document.querySelectorAll(".card.wi"))){let z=W.getAttribute("data-key")??"",q=z.startsWith("wi:")?z.slice(3):"",V=!J||$.get(q)===!0;if(W.classList.toggle("filter-hidden",!V),J)if(V)Z++;else Q++}for(let W of Array.from(document.querySelectorAll(".card.session-only")))W.classList.toggle("filter-dim",J);let X=document.getElementById("board-root");if(X)X.classList.toggle("filter-empty",J&&f.length>0&&Z===0);z9(J,Z,Q),Y9(J,Z),K9()}function q9(){let $=[...j.tags].filter((W)=>W!==y);if($.length<2)return null;if(j.tags.has(y))return null;let J=j.q.toLowerCase(),Z=(W)=>J===""||W.hay.includes(J),Q=$.map((W)=>f.filter((z)=>z.tags.includes(W)&&Z(z)).length);if(Q.some((W)=>W===0))return null;return`no items have all of: ${$.map((W,z)=>`${W} (${Q[z]})`).join(" + ")} — each has matches individually`}function z9($,J,Z){let Q=document.getElementById("filter-count");if(!Q)return;let X=f.length,W=f.filter((z)=>z.tags.length===0).length;if(X===0){Q.textContent="· board is empty",Q.title="no work items on the board at all";return}if(!$){Q.textContent=`· ${X} items · ${W} untagged`,Q.title=`${W} of ${X} items carry no tags — the set a tag filter cannot reach (tap "untagged" to list them)`;return}if(J===0){let z=[...j.tags].filter((V)=>V!==y);if(j.tags.has(y)&&z.length>0){Q.textContent="· nothing can match — untagged + a tag is empty by definition",Q.title=`the untagged filter lists ONLY items with no tags, and ${z.join(" + ")} require${z.length===1?"s":""} a tag. Drop one of them.`;return}let q=q9();if(q){Q.textContent=`· ${q} — ${Z} hidden`,Q.title=`the AND-combination is empty: no single item carries every selected tag. Remove one tag to widen the result. ${W} item${W===1?"":"s"} on the board carry no tags.`;return}Q.textContent=Z>0?`· no items match — ${Z} hidden`:"· no items match",Q.title=`the filter hid all ${Z} item${Z===1?"":"s"}. ${W} item${W===1?"":"s"} on the board carry no tags and can only be reached via the "untagged" filter or free text.`}else Q.textContent=`· showing ${J}/${X} · ${W} untagged`,Q.title=`${Z} hidden by the filter · ${W} of ${X} items carry no tags`}function V9($,J){if(!$)return{text:"no filter active",tags:[],untaggedActive:!1};let Z=[...j.tags].filter((q)=>q!==y).sort(),Q=j.tags.has(y),X=j.q!==""?`“${j.q}”`:"",W=`showing ${J}/${f.length}`,z=[X,...Z,...Q?["untagged"]:[]];return{text:z.length>0?`${z.join(" + ")} · ${W}`:W,tags:Z,untaggedActive:Q}}function Y9($,J){let Z=document.getElementById("controls-summary");if(!Z)return;let{text:Q,tags:X,untaggedActive:W}=V9($,J);if(Z.textContent="",Z.classList.toggle("has-filter",$),!$){Z.textContent=Q;return}let z=[...X,...W?[y]:[]],q=z.length,V=()=>{if(Z.textContent="",j.q!==""){let U=document.createElement("span");U.className="summary-q",U.textContent=`“${j.q}”`,Z.appendChild(U)}for(let U of z.slice(0,q)){let x=document.createElement("span");if(x.className="tag-chip active",U===y)x.setAttribute("data-tag",y);if(x.textContent=U===y?"untagged":U,q===1)x.classList.add("summary-chip-shrink");Z.appendChild(x)}let K=z.length-q;if(K>0){let U=document.createElement("span");U.className="summary-more",U.textContent=`+${K} more`,U.title=`${K} more active tag${K===1?"":"s"}: ${z.slice(q).join(", ")} — tap “filters” to expand`,Z.appendChild(U)}let G=document.createElement("span");G.className="summary-n",G.textContent=`${J}/${f.length}`,Z.appendChild(G)};V();while(q>1&&Z.scrollWidth>Z.clientWidth)q--,V();Z.title=Q}function K9(){let $=document.getElementById("filter-q");if($&&$.value!==j.q)$.value=j.q;let J=document.getElementById("filter-clear");if(J)if(j.q!==""||j.tags.size>0)J.removeAttribute("hidden");else J.setAttribute("hidden","");for(let Z of Array.from(document.querySelectorAll("#filter-tags .tag-chip"))){let Q=Z.getAttribute("data-tag")??"";Z.classList.toggle("active",j.tags.has(Q)),Z.setAttribute("aria-pressed",j.tags.has(Q)?"true":"false")}for(let Z of Array.from(document.querySelectorAll("[data-col-toggle]"))){let Q=Z.getAttribute("data-col-toggle")??"";Z.setAttribute("aria-pressed",j.collapsed.has(Q)?"true":"false")}}function U0(){for(let $ of e6){let J=j.collapsed.has($),Z=document.querySelector(`.col[data-col="${r0($)}"]`);if(Z)Z.classList.toggle("collapsed",J);for(let Q of Array.from(document.querySelectorAll(`[data-col-toggle="${r0($)}"]`)))Q.setAttribute("aria-pressed",J?"true":"false")}}function r0($){return $.replace(/["\\]/g,"\\$&")}function j9($){if(j.collapsed.has($))j.collapsed.delete($);else j.collapsed.add($);l(b.collapsed,JSON.stringify([...j.collapsed])),U0()}function Z0(){let $=document.getElementById("board-controls");if(!$)return;let J=j.controlsCollapsed;$.classList.toggle("controls-collapsed",J);let Z=document.getElementById("controls-toggle");if(Z)Z.setAttribute("aria-expanded",J?"false":"true"),Z.textContent=J?"filters ▾":"filters ▴",Z.title=J?"expand the filter/tag controls":"collapse the filter/tag controls"}function U9(){j.controlsCollapsed=!j.controlsCollapsed,l(b.controls,j.controlsCollapsed?"collapsed":"expanded"),Z0()}function M9($){let J=$.target;if(!J)return;if(J.closest("#controls-toggle")){$.preventDefault(),U9();return}let Z=J.closest("[data-col-toggle]");if(Z){let X=Z.getAttribute("data-col-toggle");if(X)$.preventDefault(),j9(X);return}let Q=J.closest("#filter-tags .tag-chip");if(Q){let X=Q.getAttribute("data-tag");if(X){if(j.tags.has(X))j.tags.delete(X);else j.tags.add(X);l(b.tags,JSON.stringify([...j.tags])),s()}return}if(J.closest("#filter-clear"))j.q="",j.tags.clear(),l(b.q,""),l(b.tags,"[]"),s()}function G9($){let J=$.target;if(!J||J.id!=="filter-q")return;j.q=J.value,l(b.q,j.q),s()}var j0=!1;function i0(){if(j0)return;if(j0=!0,document.addEventListener("click",M9),document.addEventListener("input",G9),Z0(),U0(),s(),n(b.controls)===null&&typeof window.matchMedia==="function")try{let $=window.matchMedia("(max-width:640px)"),J=(Z)=>{if(n(b.controls)!==null)return;j.controlsCollapsed=Z.matches,Z0()};if(typeof $.addEventListener==="function")$.addEventListener("change",J);else if(typeof $.addListener==="function")$.addListener(J)}catch{}}function a0(){if(!j0)return;Z0(),U0(),s()}var B9=48;function H9($){return r($)||$.startsWith("/")}function P9($,J){if($.length<=J)return $;let Z=$.slice(0,J),Q=Z.lastIndexOf(" ");return(Q>J*0.5?Z.slice(0,Q):Z).trimEnd()+"…"}function s0($){let J=H9($),Z=$.startsWith("/")?"awaken-input-slug":r($)?"opencode-placeholder":"";return{display:J?P9($,B9):$,raw:$,raw_:J,rawKind:Z}}var t0='<span class="raw-title-chip" title="title is raw/unverified — no session-title surface exists under dsh yet (SHADOW-019)">(raw title)</span>';var O9="/api/hive-board/item",G0="hvb-drawer",B0="hvb-drawer-scrim",e0=50,F9=1e4;function Q0($){if(!$)return"—";let J=new Date($);if(isNaN(J.getTime()))return $;return J.toISOString().slice(0,16).replace("T"," ")}function M($,J,Z){let Q=document.createElement($);if(J)Q.className=J;if(Z!==void 0)Q.textContent=Z;return Q}function _9(){let $=document.getElementById(G0);if($)return $;$=document.createElement("div"),$.id=G0,$.setAttribute("hidden",""),$.setAttribute("role","dialog"),$.setAttribute("aria-modal","false"),$.appendChild(P0());let J=document.createElement("div");return J.id=B0,J.setAttribute("hidden",""),J.addEventListener("click",()=>H0()),document.body.appendChild(J),document.body.appendChild($),$}function H0(){document.getElementById(G0)?.setAttribute("hidden",""),document.getElementById(B0)?.setAttribute("hidden","")}var $6=!1;function Z6(){if($6||typeof document>"u")return;$6=!0,document.addEventListener("keydown",($)=>{if($.key==="Escape")H0()}),document.addEventListener("click",($)=>{let J=$.target;if(!(J instanceof Element))return;let Z=J.closest("a.open-link");if(Z instanceof HTMLAnchorElement){$.preventDefault();let q=Z.closest('[data-key^="wi:"]')?.getAttribute("data-key");if(q)J6(q.slice(3));return}let Q=J.closest('[data-key^="wi:"]');if(!Q)return;if(J.closest("a,button,input,textarea,select,form"))return;let W=(Q.getAttribute("data-key")??"").slice(3);if(W)J6(W)},!1)}function P0(){let $=M("button","hvb-drawer-close","×");return $.type="button",$.title="close the item detail (Esc works too)",$.addEventListener("click",H0),$}async function J6($){let J=_9();J.textContent="",J.appendChild(P0());let Z=M("div","hvb-drawer-head mono");Z.appendChild(M("span","hvb-wi-id",$)),Z.appendChild(M("span","meta","loading…")),J.appendChild(Z),document.getElementById(B0)?.removeAttribute("hidden"),J.removeAttribute("hidden");try{let Q=await fetch(`${O9}?id=${encodeURIComponent($)}`,{headers:{accept:"application/json"}});if(!Q.ok){M0(J,$,`HTTP ${Q.status}`);return}let X=await Q.json();if(!X||X.ok!==!0||!X.item){M0(J,$,X?.missing?.join(", ")??"unknown reason");return}D9(J,X.item,X)}catch(Q){M0(J,$,Q instanceof Error?Q.message:String(Q))}}function M0($,J,Z){let Q=M("div","hvb-drawer-body");Q.appendChild(M("div","meta",`${J} is not on the board (${Z}). It may have been dissolved or the board moved — hit the 15 s lane refresh and retry. Nothing was written; nothing was assumed.`)),$.appendChild(Q)}function N9($){let J=M("div","hvb-chip-row"),Z=[[$.status,`hvb-chip status-${$.status}`],[$.priority,`hvb-chip prio-${$.priority}`],...$.paused?[["paused","hvb-chip status-paused"]]:[]];for(let[Q,X]of Z)J.appendChild(M("span",X,Q));return J}function v($,J){let Z=M("div","hvb-face-row");return Z.appendChild(M("span","mono dim",$)),Z.appendChild(M("span","mono",J&&J.length?J:"—")),Z}function t($){return M("div","hvb-section-title",$)}function D9($,J,Z){$.textContent="",$.appendChild(P0());let Q=s0(J.title),X=M("div","hvb-drawer-head"),W=M("div","hvb-drawer-title-row"),z=M("h3","hvb-drawer-title",Q.display);if(z.title=Q.raw,W.appendChild(z),Q.raw_){let B=document.createElement("span");B.innerHTML=t0,W.appendChild(B.firstChild)}X.appendChild(W),X.appendChild(N9(J)),$.appendChild(X);let q=M("div","hvb-face mono");if(q.appendChild(v("id",J.id)),q.appendChild(v("owner",J.owner_session)),q.appendChild(v("group",J.group_id)),q.appendChild(v("origin",J.origin)),q.appendChild(v("created",Q0(J.created))),q.appendChild(v("updated",Q0(J.updated))),q.appendChild(v("recency",J.recency)),q.appendChild(v("spec",J.spec_hash)),J.released_sessions&&J.released_sessions.length>0)q.appendChild(v("released",J.released_sessions.join(", ")));if(J.dream_id)q.appendChild(v("dream",J.dream_id));$.appendChild(q);let V=J.problems??[];if(V.length>0){let B=M("div","hvb-problems");B.appendChild(t("⚠ invariant problems (detection only — SCHEMA §3, WI-071)"));for(let F of V)B.appendChild(M("div","hvb-problem mono",F));$.appendChild(B)}if(J.subtasks&&J.subtasks.length>0){let B=M("div","hvb-subtasks");B.appendChild(t(`subtasks (${J.subtasks.filter((F)=>F.status==="completed").length}/${J.subtasks.length})`));for(let F of J.subtasks){let P=M("div","hvb-subtask-row");P.appendChild(M("span","mono hvb-subtask-icon",F.status==="completed"?"☑":F.status==="in_progress"?"▸":F.status==="cancelled"?"✕":"○")),P.appendChild(M("span",void 0,F.content)),B.appendChild(P)}$.appendChild(B)}let K=J.todo_mirror??[];if(K.length>0){let B=M("div","hvb-mirror");B.appendChild(t(`todo mirror (${K.length}${J.todo_mirror_updated?` · updated ${Q0(J.todo_mirror_updated)}`:""})`));for(let F of K){let P=M("div","hvb-mirror-row"),D=String(F.state??F.status??"");P.appendChild(M("span","mono hvb-subtask-icon",D==="completed"?"☑":D==="in_progress"?"▸":"○")),P.appendChild(M("span",void 0,typeof F.content==="string"?F.content:JSON.stringify(F))),B.appendChild(P)}$.appendChild(B)}let G=J.transitions??[];if(G.length>0){let B=M("div","hvb-history");B.appendChild(t(`history (${G.length})`));let F=G.slice(0,e0);for(let P of F){let D=M("div","hvb-history-row mono"),k=P.absorbed?`${P.from??"∅"} ⇢ ${P.to} (absorbed ${P.absorbed})`:`${P.from??"∅"} ⇢ ${P.to}`;D.appendChild(M("span","meta",Q0(P.at))),D.appendChild(M("span",void 0,k)),D.appendChild(M("span","meta",P.by+(P.session?` · ${P.session}`:"")+(P.superseded?` · spec ${P.superseded} superseded`:""))),B.appendChild(D)}if(G.length>F.length)B.appendChild(M("div","meta",`+ ${G.length-F.length} older transitions not shown (drawer cap ${e0} — nothing dropped from the record; the board file keeps them all)`));$.appendChild(B)}let U=M("div","hvb-spec");U.appendChild(t("spec"));let x=M("pre","mono hvb-spec-body",J.body);if(x.setAttribute("tabindex","0"),U.appendChild(x),Z.truncated)U.appendChild(M("div","meta",`spec truncated for display at ${F9} chars (full spec is ${Z.bodyBytes??"?"} chars — served from the board file; this is a DISPLAY cap, the file is untouched)`));$.appendChild(U),$.appendChild(M("div","meta hvb-drawer-foot","read-only depth view — the board's write path stays sealed behind the hive_board_* tools (WI-062)"))}var Q6=`
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
`;var x9=30000,q6="hvb-favicon",A9="data-plugin-favicon",L9=34;function _0($){let J=typeof $?.runningAgents==="number"&&isFinite($.runningAgents)&&$.runningAgents>0?Math.floor($.runningAgents):0,Z=typeof $?.hiveRunningAgents==="number"&&isFinite($.hiveRunningAgents)&&$.hiveRunningAgents>0?Math.floor($.hiveRunningAgents):0;if(J<=0)return{tier:"quiet",running:0,hive:0};return Z>0?{tier:"hive",running:J,hive:Z}:{tier:"ambient",running:J,hive:0}}function z6($){let{running:J}=_0($);return J>0?{session:"active",dreaming:!1,count:J}:{session:"quiet",dreaming:!1,count:0}}var C9="#d29922",E9="#866d3c";function V6($){return $.split(C9).join(E9)}var O0=!1,X6="";function k9($){let J=document.getElementById(q6);if(!J)return;let Z=z6($),{tier:Q}=_0($),X=Q==="ambient"?V6(Y0(Z)):Y0(Z),W="data:image/svg+xml,"+encodeURIComponent(X);if(W===X6)return;X6=W,J.setAttribute("href",W)}async function F0(){try{let $=await fetch(D0,{headers:{accept:"application/json"}});if(!$.ok)return;let J=await $.json();if(!J||typeof J!=="object"||J.ok!==!0)return;let Q=x0(J).activity;k9(Q),N0(Q)}catch{}}function o(){if(!document.hidden)F0()}var W6="";function N0($){let J=document.getElementById("hvb-panel-mark");if(!J)return;let Z=z6($),{tier:Q,running:X,hive:W}=_0($),z=`${Q}:${Z.count}`;if(z===W6)return;W6=z;let q=typeof $?.sampledAt==="string"?$.sampledAt.slice(0,16).replace("T"," "):"?",V=Q==="hive"?`${X} HIVE agent${X===1?"":"s"} running`:Q==="ambient"?`${X} other agent${X===1?"":"s"} running · no HIVE session active`:"quiet — nothing running";J.innerHTML=V6(V0(Z,{idPrefix:"hvbp",animate:!0,size:L9}));let K=J.querySelector("svg");if(K){let G=document.createElementNS("http://www.w3.org/2000/svg","title");G.textContent=`${V} · sampled ${q} UTC (may lag one poll cycle)`,K.insertBefore(G,K.firstChild)}}function Y6($){if(O0)return;if(typeof document>"u")return;O0=!0,$.effect(()=>{let Z=document.querySelector('link[rel="icon"]'),Q=document.createElement("link");return Q.id=q6,Q.rel="icon",Q.type="image/svg+xml",Q.setAttribute(A9,"@hive/dsh-board"),document.head.appendChild(Q),F0(),document.addEventListener("visibilitychange",o),window.addEventListener("pageshow",o),window.addEventListener("focus",o),()=>{if(Q.remove(),Z)Z.setAttribute("href",Z.getAttribute("href")??"");document.removeEventListener("visibilitychange",o),window.removeEventListener("pageshow",o),window.removeEventListener("focus",o),O0=!1}},"board favicon driver");let J=$.interval;if(typeof J==="function")J(()=>{F0()},x9);else console.error("[@hive/dsh-board] favicon driver: no interval service — cadence degraded to refresh-on-visible")}var K6={high:0,medium:1,low:2};function A0($){return[...$].sort((J,Z)=>{let Q=K6[J.priority],X=K6[Z.priority];if(Q!==X)return Q-X;let W=g(J),z=g(Z);if(W!==z)return z.localeCompare(W);return Z.id.localeCompare(J.id)})}function j6($,J){let Z=g($),Q=g(J);if(Z!==Q)return Q.localeCompare(Z);return J.id.localeCompare($.id)}function U6($,J){let Z=new Set;for(let Q of $){if(Q.owner_session)Z.add(Q.owner_session);for(let X of Q.released_sessions)Z.add(X)}return{backlog:A0($.filter((Q)=>Q.status==="backlog")),todo:A0($.filter((Q)=>Q.status==="todo")),inProgress:$.filter((Q)=>Q.status==="in_progress").sort(j6),done:$.filter((Q)=>Q.status==="done").sort(j6),sessionOnly:J.cards.filter((Q)=>!Z.has(Q.id))}}var D0="/api/hive-board/index",R9=15000,X0="71085bb-dirty";function I9($){if(!$||$==="unknown"||X0==="unknown")return"unknown";return $===X0?"match":"mismatch"}function S9($){let J=document.getElementById("build-badge");if(!J)return;if(I9($)==="mismatch")J.classList.add("stale"),J.textContent=`stale client — reload (bundle ${X0} ≠ host ${$})`,J.setAttribute("title",`this tab is running an old client bundle (built ${X0}) against a newer host build (${$}). Reload the page to get the current bundle.`);else J.classList.remove("stale")}var M6={available:!1,computedAt:"",totalPersisted:0,awakeIds:0,awakeDeleted:0,cards:[],persistedIds:[]},T9={artifactCounts:{insight:0,warning:0,songline:0,shadow:0,total:0},active:[],history:[],recentArtifacts:[]};function y9($){return{...$,tags:Array.isArray($.tags)?$.tags:[],subtasks:Array.isArray($.subtasks)?$.subtasks:[],todo_mirror:Array.isArray($.todo_mirror)?$.todo_mirror:[],transitions:Array.isArray($.transitions)?$.transitions:[],released_sessions:Array.isArray($.released_sessions)?$.released_sessions:[],artifacts:Array.isArray($.artifacts)?$.artifacts:[],problems:Array.isArray($.problems)?$.problems:[],status:$.status,priority:$.priority,origin:$.origin}}function x0($){let J=(Array.isArray($.items)?$.items:[]).map(y9);return{generatedAt:typeof $.generated==="string"?$.generated:"",workspaceRoot:typeof $.workspaceRoot==="string"?$.workspaceRoot:"(unknown workspace)",buildSha:typeof $.boardBuild==="string"&&$.boardBuild!==""?$.boardBuild:"unknown",activity:$.activity,guiBaseUrl:"",capabilities:[],dreams:T9,messages:[],items:J,board:U6(J,{...M6}),writesEnabled:!1,sessionBackend:"unconfigured",promoteDecisions:{},sessions:{...M6},todoSubStates:{},actionRequired:{},sessionStatus:{}}}var b9=null,H6="";function f9($){let J=document.createElement("main");return J.id="board-root",J.innerHTML=c0($),J}function v9($){let J=document.getElementById("board-root");if(!J)return;n0(J,f9($)),S9($.buildSha),a0()}async function L0(){try{let $=await fetch(D0,{headers:{accept:"application/json"}});if(!$.ok)return;let J=await $.json();if(!J||typeof J!=="object"||J.ok!==!0)return;if(!Array.isArray(J.items))return;let Z=x0(J);b9=Z,H6=Z.buildSha,N0(Z.activity),g9(Z),v9(Z)}catch{}}var G6=!1;function g9($){if(G6)return;let J=document.getElementById("board-controls-host");if(!J)return;J.innerHTML=m0($),G6=!0}function C0(){if(document.hidden)return;L0()}document.addEventListener("visibilitychange",C0);window.addEventListener("pageshow",C0);window.addEventListener("focus",C0);var B6=!1;function P6($){if(i0(),Z6(),!B6){B6=!0;let J=$.interval;if(typeof J==="function")J(()=>{L0()},R9);else console.error("[@hive/dsh-board] no interval service — poll cadence degraded to refresh-on-visible")}L0()}var O6="/api/hive-state/session";function F6($,J){let Z=[];for(let Q of Object.values($?.byId??{}))if(Q&&Q.parentId===J&&Q.running===!0)Z.push(Q);return Z}function _6($,J){let Z=[];for(let Q of Object.values($?.byId??{}))if(Q&&Q.parentId===J)Z.push(Q);return Z}function N6($){if(!$)return[];let J=[],Z=$.hive;if(Z?.isCoordinator){let Q=Z.lastAwakenInput?` — "${Z.lastAwakenInput}"`:"";J.push({ts:Z.awakenedAt??null,kind:"awaken",text:`awakened as ${Z.agent??"unknown"}${Q}`})}for(let Q of $.usageMarks??[])J.push({ts:Q.timestamp,kind:"registered",text:`registered — dispatched as ${Q.capability}`});for(let Q of $.dreamEvents??[])J.push({ts:Q.ts,kind:"dream",text:`dream archive ${Q.tool}`});for(let Q of $.children??[]){let X=Q.capability?` as ${Q.capability}`:"",W=Q.label?` — "${Q.label}"`:"";J.push({ts:Q.createdAtMs?new Date(Q.createdAtMs).toISOString():null,kind:"dispatched",text:`child dispatched${X}${W} (${Q.mode})`})}if($.goal?.createdAt){let Q=typeof $.goal.roundsStarted==="number"?`, round ${$.goal.roundsStarted}`:"";J.push({ts:$.goal.createdAt,kind:"goal",text:`goal set · ${String($.goal.status??"")}${Q}`})}return J.sort((Q,X)=>new Date(X.ts||0).getTime()-new Date(Q.ts||0).getTime())}function E0($){let{payload:J,routeReachable:Z,pageRunning:Q}=$,X=J?.hive?.isCoordinator===!0;if(Q===!0||Z&&u9(J))return{stage:"working",tone:"live"};if(J===void 0)return{stage:"dormant",tone:"unknown"};if(X)return{stage:"awakened",tone:"hive"};if((J.usageMarks?.length??0)>0)return{stage:"registered",tone:"ambient"};if(J.live===!0)return{stage:"idle",tone:"ambient"};return{stage:"dormant",tone:"ambient"}}function u9($){if(!$)return!1;let J=$.idBare;for(let Z of $.agents??[])if(Z.id===$.id||h9(Z.id)===J)return Z.status==="running";return!1}function h9($){return $.startsWith("session-")?$.slice(8):$}function k0($,J){if(!$)return"";let Z=J-new Date($).getTime();if(!isFinite(Z)||Z<0)return"";if(Z<45000)return"seconds";if(Z<3600000)return`${Math.max(1,Math.round(Z/60000))}m`;if(Z<86400000)return`${Math.round(Z/3600000)}h`;return`${Math.round(Z/86400000)}d`}function e($){if(!$)return"—";let J=new Date($);if(isNaN(J.getTime()))return String($);return J.toISOString().slice(0,16).replace("T"," ")}function W0($){if(!$)return"";let J=Date.now()-new Date($).getTime();if(!isFinite(J))return"";if(J<45000)return"now";if(J<3600000)return`${Math.round(J/60000)}m ago`;if(J<86400000)return`${Math.round(J/3600000)}h ago`;return`${Math.round(J/86400000)}d ago`}async function w9($){let J=await fetch(`${O6}?id=${encodeURIComponent($)}`,{cache:"no-store"});if(!J.ok)throw Error(`route ${J.status}`);return await J.json()}var x6=`
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
`;function H($,J,Z){let Q=document.createElement($);if(J)Q.className=J;if(Z!==void 0)Q.textContent=Z;return Q}var p9="hvs-timeline-panel",m9={awaken:"◈",registered:"◇",working:"▶",idle:"⏸",done:"■",dispatched:"⇗",returned:"⇙",goal:"◎",dream:"☾"};function A6($){let J=$;return function(Q){let X=typeof Q.sessionId==="string"?Q.sessionId:"",W=typeof Q.useSessions==="function"?Q.useSessions:void 0,[z,q]=J.useState(void 0),[V,K]=J.useState(!1),[G,U]=J.useState(!1),[x,B]=J.useState([]),[F,P]=J.useState(Date.now()),D=J.useRef(void 0),k=J.useRef(""),L=J.useRef(new Map),R=J.useRef(!1),E=J.useRef(null),T=W?W((_)=>_):void 0,u=T?.byId??{},O=X?u[X]:void 0,A=O?O.running===!0:void 0,m=F6(T,X),c=_6(T,X);if(J.useEffect(()=>{let _=D.current;if(_!==void 0&&_!==A){let N={ts:new Date().toISOString(),kind:A?"working":"idle",text:A?"working — turn started (observed)":"idle — turn ended (observed)",observed:!0};B((S)=>[N,...S].slice(0,40))}D.current=A;for(let N of c){if(L.current.get(N.id)===!0&&N.running!==!0){let h={ts:new Date().toISOString(),kind:"returned",text:`child returned — ${String(N.displayTitle??N.title??N.id).slice(0,40)} (observed)`,observed:!0};B((z0)=>[h,...z0].slice(0,40))}L.current.set(N.id,N.running===!0)}let I=z?.goal;if(I){let N=`${I.roundsStarted??"?"}/${I.status??"?"}`;if(k.current!==""&&k.current!==N){let S={ts:I.updatedAt??new Date().toISOString(),kind:"goal",text:`goal → round ${I.roundsStarted??"—"} · ${I.status??""} (observed)`,observed:!0};B((h)=>[S,...h].slice(0,40))}k.current=N}if(X){let N=u[X]!==void 0;if(R.current&&!N){let S={ts:new Date().toISOString(),kind:"done",text:"done — session removed from the live session list (observed)",observed:!0};B((h)=>[S,...h].slice(0,40))}R.current=N}},[A,c,X,u,z?.goal]),J.useEffect(()=>{if(!X)return;let _=!1,I,N=()=>{w9(X).then((S)=>{if(_)return;K(S?.ok===!1),q(S.ok===!1?void 0:S)}).catch(()=>{if(_)return;K(!0)}).finally(()=>{if(!_)I=setTimeout(N,6000)})};return N(),()=>{if(_=!0,I)clearTimeout(I)}},[X]),J.useEffect(()=>{if(!G||!X)return;let _=document.body.appendChild(H("div","hvs-panel"));_.id=p9;let I=()=>{if(!_.isConnected)return;_.innerHTML="",d9(_,{sessionId:X,data:z,fetchFailed:V,row:O,kids:m,kidsAll:c,eventNotes:x,nowTick:F,onClose:()=>U(!1)});let w=E.current?.getBoundingClientRect();if(w){let $0=Math.max(8,w.top-_.offsetHeight-10);_.style.top=`${$0}px`,_.style.left=`${Math.min(Math.max(8,w.right-_.offsetWidth),window.innerWidth-_.offsetWidth-8)}px`}};I();let N=()=>I();window.addEventListener("resize",N),window.addEventListener("scroll",N,!0);let S=(w)=>{let $0=w.target;if(!_.contains($0)&&E.current&&!E.current.contains($0))U(!1)},h=(w)=>{if(w.key==="Escape")U(!1)};document.addEventListener("click",S,!0),document.addEventListener("keydown",h);let z0=setInterval(()=>P(Date.now()),1000);return()=>{window.removeEventListener("resize",N),window.removeEventListener("scroll",N,!0),document.removeEventListener("click",S,!0),document.removeEventListener("keydown",h),clearInterval(z0),_.remove()}},[G,X,z,V,O,x,F]),!X)return null;let q0=E0({payload:V?void 0:z,routeReachable:!V,pageRunning:A}),R0=V?null:z?.goal?.roundsStarted,I0=V?"":z?.hive?.isCoordinator===!0?"hive":"ambient";return J.createElement("span",{className:"hvs-pill","data-tone":q0.tone,"data-slot-hive-state":X,role:"button","aria-expanded":G?"true":"false",ref:(_)=>{E.current=_},onClick:()=>U((_)=>!_),title:"HIVE state of this session (WI-083, read-only)"},J.createElement("span",{className:"hvs-dot","data-dot":q0.tone}),J.createElement("span",{className:"hvs-word"},`hive · ${V?"route pending":q0.stage}`),R0?J.createElement("span",{className:"hvs-badge"},`r${R0}`):null,m.length>0?J.createElement("span",{className:"hvs-badge"},`+${m.length}`):null,I0?J.createElement("span",{className:"hvs-badge"},I0):null)}}function D6($,J){for(let Z of $)if(Z.kind===J&&Z.ts)return Z.ts;return null}function c9($,J){let Z=null,Q=(X)=>{if(!X)return;let W=new Date(X).getTime();if(isFinite(W)&&(Z===null||W>Z))Z=W};Q(J?.updatedAt?new Date(J.updatedAt).toISOString():void 0),Q($?.goal?.updatedAt),Q($?.hive?.awakenedAt),Q($?.generated);for(let X of $?.usageMarks??[])Q(X.timestamp);for(let X of $?.dreamEvents??[])Q(X.ts);for(let X of $?.children??[])Q(X.createdAtMs?new Date(X.createdAtMs).toISOString():null);if(J?.updatedAt&&(Z===null||J.updatedAt>Z))Z=J.updatedAt;return Z===null?null:new Date(Z).toISOString()}function d9($,J){let Z=String(J.row?.displayTitle??J.row?.title??J.sessionId.slice(0,12)),Q=H("div","hvs-head"),X=H("div","hvs-title");X.textContent=`HIVE state — ${Z}`,Q.appendChild(X);let W=H("button","hvs-close","✕");W.addEventListener("click",()=>J.onClose()),Q.appendChild(W),$.appendChild(Q);let z=E0({payload:J.fetchFailed?void 0:J.data,routeReachable:!J.fetchFailed,pageRunning:J.row?J.row.running===!0:void 0}),q=H("div","hvs-stage");if(J.fetchFailed)q.setAttribute("data-live","0");else q.setAttribute("data-live",z.tone==="live"?"1":"0");let V=H("span","hvs-now",J.fetchFailed?"stage unknown":`now: ${z.stage}`);q.appendChild(V);let K=D6(J.eventNotes,"working");if(z.stage==="working"){let O=K?k0(K,J.nowTick):"";q.appendChild(H("span","hvs-dur",O?`${O} so far`:"in progress — enter time not observed"))}let G=c9(J.fetchFailed?void 0:J.data,J.row);q.appendChild(H("span","hvs-sig",`latest signal ${e(G)} · ${W0(G)}`)),$.appendChild(q);let U=H("div","hvs-meta"),x=J.data?.hive,B=H("div");if(J.fetchFailed)B.appendChild(H("span","hvs-flag","host route not live yet — the timeline needs the next dsh-web bounce (route shipped in @hive/dsh-evolution, read-only)"));else if(x?.isCoordinator)B.appendChild(H("span","hvs-hive","HIVE coordinator")),B.appendChild(document.createTextNode(` — ${x.agent??"unknown"} · awakened ${e(x.awakenedAt)} (${W0(x.awakenedAt)})`));else B.appendChild(H("span","","not an awakened coordinator"));U.appendChild(B);let F=J.data?.live,P=H("div");P.appendChild(document.createTextNode(J.fetchFailed?"host truth: unknown (route pending)":`host truth: ${F===!0?"live on this host":"not live on this host"} · ${J.data?.runningAgents??0} agents running`)),U.appendChild(P);let D=J.data?.goal,k=H("div");if(D){let O=D.objective&&D.objective.length>90?`${D.objective.slice(0,90)}…`:D.objective;if(k.appendChild(H("b","",`goal · round ${D.roundsStarted??"—"} · ${D.status??""}`)),O)k.appendChild(document.createTextNode(` — ${O}`))}else if(!J.fetchFailed&&J.data?.goalReason==="no-live-agent")k.appendChild(H("span","hvs-flag","goal not observable (session not live on this host)"));else k.appendChild(H("span","","no active goal"));U.appendChild(k);let L=H("div"),R=J.data?.childrenTotal??J.kidsAll.length;L.appendChild(document.createTextNode(`children: ${J.kids.length} in flight · ${R} known`));for(let O of J.kids.slice(0,3))L.appendChild(H("span","",` · ${String(O.displayTitle??O.id).slice(0,24)}`));U.appendChild(L),$.appendChild(U);let E=H("div","hvs-rows"),T=[...J.eventNotes,...N6(J.fetchFailed?void 0:J.data)].sort((O,A)=>new Date(A.ts||0).getTime()-new Date(O.ts||0).getTime());if(T.length===0)E.appendChild(H("div","hvs-empty","no HIVE records for this session yet — stage transitions land here as they happen"));else for(let O of T.slice(0,80)){let A=H("div",`hvs-row${O.observed?" hvs-observed":""}`);A.appendChild(H("span","hvs-t",`${e(O.ts)}${O.ts?` · ${W0(O.ts)}`:""}`));let m=H("span","hvs-g",m9[O.kind]??"•");if(m.setAttribute("data-kind",O.kind),A.appendChild(m),A.appendChild(H("span","hvs-text",O.text)),O.kind==="working"&&z.stage==="working"&&O.ts===D6(J.eventNotes,"working")){let c=K?k0(K,J.nowTick):"";A.classList.add("hvs-current"),A.appendChild(H("span","hvs-dur",c?`${c} so far`:""))}E.appendChild(A)}$.appendChild(E);let u=H("div","hvs-foot");u.textContent=`read-only WI-083 overlay · session-scoped · sources: hive-sessions.json · hive-state.json · dream telemetry · subagent catalog · snapshot ${e(J.data?.generated)}`,$.appendChild(u)}var l9=`
/* ── DSH shell-adaptation overrides (WI-062 slice 3; authored — see banner) ── */
.hvb-root{height:100%;overflow-y:auto;box-sizing:border-box;padding:16px 20px 32px;font-size:12.5px;line-height:1.45}
.hvb-root h2{font-size:13.5px;margin:0 0 8px}
.hvb-root .kanban{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
.hvb-root .col{flex:1 1 200px;min-width:200px;max-width:360px}
.hvb-sub{color:rgba(128,128,128,.9);font-size:11.5px;margin:0 0 10px}
.hvb-controls-note{color:rgba(128,128,128,.75);font-size:11px;margin:0 0 8px}
/* head row (slice 3C): the animated full mark, top-left of the title row —
   shell-safe sizing on purpose (the 4400 header's 40px sat on a full-page h1;
   a side-panel row holds 34px without crowding the controls below). The
   breathe ANIMATION itself comes from the ported keyframes (reduced-motion
   gated there). The holder is OUTSIDE the morph root — survives polls. */
.hvb-head-row{display:flex;gap:10px;align-items:center;margin:0 0 8px}
.hvb-head-row .hb-mark{display:block;flex:0 0 auto;max-width:34px}
.hvb-head-row .hb-mark svg{width:100%;height:auto;display:block}
`,n9='<div class="empty">Fetching the board…</div>',o9='<div class="hvb-head-row"><span id="hvb-panel-mark" class="hb-mark" title="board activity"></span></div>'+'<div class="hvb-sub">read-only view of the workspace board (WI-*) — the write path stays sealed behind the hive_board_* tools (WI-062)</div>'+`<div id="board-controls-host"></div><main id="board-root">${n9}</main>`;function r9($){let J=typeof $==="number"&&isFinite($)?$:20;return`<svg width="${J}" height="${J}" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><rect x="3" y="4" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/><rect x="3" y="15" width="5" height="5" rx="1" fill="currentColor" opacity="0.35"/><rect x="10" y="4" width="5" height="13" rx="1" fill="currentColor" opacity="0.8"/><rect x="10" y="19" width="5" height="1" rx="0.5" fill="currentColor" opacity="0.35"/><rect x="17" y="4" width="5" height="5" rx="1" fill="currentColor" opacity="0.8"/><rect x="17" y="11" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/></svg>`}globalThis.__BOARD_ENGINE={CSS:p0,CSS_OVERRIDES:l9+Q6+x6,SHELL_MARKUP:o9,ICON_SVG:r9,attachEngine:P6,startFaviconDriver:Y6,makeHiveStateDock:A6};})();
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
        // WI-083 — HIVE-state overlay: a SESSION-scope occupant of the
        // conversation composer dock (the chat package's StatsPills pattern).
        // The framework hands the component sessionId + the global
        // useSessions standard hooks (ui-session's root provision); the
        // component polls the READ-ONLY /api/hive-state/session route
        // (@hive/dsh-evolution host half). No board state is touched.
        if (typeof E.makeHiveStateDock === 'function') {
          slots.inject('conversation.composer.dock', () => {
            slots.register(
              { name: 'conversation.composer.dock', id: 'hive-state-timeline', order: 60 },
              E.makeHiveStateDock(React),
            );
          });
        } else {
          console.warn('[@hive/dsh-board] __BOARD_ENGINE.makeHiveStateDock missing — WI-083 overlay skipped (stale bundle?)');
        }
        console.log('[@hive/dsh-board] client plugin applied (viewer-parity read-only board + favicon driver + item drawer + hive-state dock)');
      },
    };
  },
});
