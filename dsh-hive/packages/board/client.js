// @hive/dsh-board — GENERATED client bundle (WI-062 slice 3+3b). DO NOT EDIT BY HAND.
// Build: dsh-hive/packages/board/scripts/build-client.ts (bun) — bundles
// websrc/client-main.ts (the ported 4400 viewer engine + the tab engine + the
// favicon driver + the item drawer) into the twin classic shape; the wrapper
// below is the only React-using code and takes React from the loader's runtime
// module table (W-044).
// Build stamp (both sides of the I-152 staleness verdict): 49afcf4-dirty
(()=>{function V0($){let J=new Set;for(let Z of $.transitions){if(Z.superseded!==void 0)continue;if(Z.session&&Z.session!==$.owner_session)J.add(Z.session)}return[...J]}function Y0($){return $.transitions.filter((J)=>typeof J.superseded==="string"&&J.superseded!=="").map((J)=>({at:J.at,by:J.by,...J.session?{session:J.session}:{},supersededHash:J.superseded}))}function K0($){return $.transitions.filter((J)=>typeof J.absorbed==="string"&&J.absorbed!=="").map((J)=>({id:J.absorbed,at:J.at}))}var t0=/^New session - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;function g($){if($==null)return!0;let J=$.trim();if(J==="")return!0;return t0.test(J)}function e0($){return $!=null&&$.trim()!==""&&!g($)}function j0($,J,Z){if(!g($))return $;if(!J||!Z)return $;let Q=Z[J];return e0(Q)?Q:$}function E($){let J="";for(let Z of $.transitions)if(Z.at&&Z.at>J)J=Z.at;return J||$.updated}function M0($){let J=0,Z=0,Q=0,W=0,X=null;for(let z of $)switch(z.status){case"completed":J++;break;case"in_progress":if(Z++,X===null)X=z.content;break;case"pending":Q++;break;case"cancelled":W++;break}return{total:$.length,completed:J,inProgress:Z,pending:Q,cancelled:W,current:X}}var P={field:"#0d1117",panel:"#161b22",border:"#30363d",edge:"#30363d",node:"#484f58",strata:"#30363d",divider:"#8b949e",amber:"#d29922",red:"#f85149"},N9=P.field,b=[[11,28],[23,14],[33,29],[45,16],[53,28]],$6=[[0,1],[1,2],[1,3],[2,3],[3,4],[0,2]],J6=[[11,41,42,4],[7,47.5,50,5],[16,54,33,4]],Z6=[3,1,4,2,0];function U0($){return $==="intervene"?P.red:$==="active"?P.amber:P.node}function n($,J={}){let{idPrefix:Z="hbf",animate:Q=!1,size:W,title:X}=J,z=`${Z}-clip`,q=U0($.session),Y=$.session==="quiet"?0:Math.min(Math.max($.count,1),b.length),M=new Set(Z6.slice(0,Y)),G=Q?' class="lit"':"",U="";for(let[k,A]of $6){let I=M.has(k)||M.has(A),[v,r0]=b[k],[a0,s0]=b[A];U+=`<line x1="${v}" y1="${r0}" x2="${a0}" y2="${s0}" stroke="${I?q:P.edge}" stroke-width="1.4"${I?` opacity=".8"${G}`:""}/>`}for(let k=0;k<b.length;k++){let A=M.has(k),[I,v]=b[k];U+=`<circle cx="${I}" cy="${v}" r="${A?4.2:3.2}" fill="${A?q:P.node}"${A?G:""}/>`}let D=$.dreaming?P.amber:P.strata,H=$.dreaming&&Q?' class="dreaming"':"",F=J6.map(([k,A,I,v])=>`<rect x="${k}" y="${A}" width="${I}" height="${v}" fill="${D}"/>`).join(""),B=W?` width="${W}" height="${W}"`:"",R=X?' role="img"':' aria-hidden="true"',c=X?`<title>${X}</title>`:"";return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${B}${R}>`+c+`<defs><clipPath id="${z}"><rect x="4" y="4" width="56" height="56" rx="12"/></clipPath></defs><rect x="4" y="4" width="56" height="56" rx="12" fill="${P.panel}" stroke="${P.border}" stroke-width="1.5"/><g clip-path="url(#${z})"${H}>${F}</g><line x1="9" y1="36" x2="55" y2="36" stroke="${P.divider}" stroke-width="1" opacity=".35"/><g>${U}</g></svg>`}function Q6($,J={}){let{idPrefix:Z="hbr"}=J,Q=`${Z}-clip`,W=U0($.session),X=$.dreaming?P.amber:P.strata,z=$.dreaming?18:16;return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><clipPath id="${Q}"><rect x="3" y="3" width="58" height="58" rx="13"/></clipPath></defs><rect x="3" y="3" width="58" height="58" rx="13" fill="${P.panel}" stroke="${P.border}" stroke-width="2"/><g clip-path="url(#${Q})"><rect x="3" y="40" width="58" height="${z}" fill="${X}"/></g><line x1="8" y1="35" x2="56" y2="35" stroke="${P.divider}" stroke-width="1.6" opacity=".4"/><circle cx="32" cy="21" r="9" fill="${W}"/></svg>`}function G0($){return"data:image/svg+xml,"+encodeURIComponent(Q6($))}function V($){return $.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}function C($,J){return $.length>J?$.slice(0,J-1)+"…":$}function f($){if(!$)return"—";let J=new Date($);return Number.isNaN(J.getTime())?$:J.toISOString().replace("T"," ").slice(0,16)+"Z"}function X6($){let J=$==="unknown"?"build unknown":`build ${V($)}`,Z=$==="unknown"?"git unavailable — running build could not be identified":"server build SHA — HEAD of the HIVE plugin repo, which ships this viewer";return`<span id="build-badge" class="build-badge" data-server-sha="${V($)}" title="${V(Z)}">${J}</span>`}function W6($,J){if(!$)return"absent";if(!J.available)return"unknown";return J.persistedIds.includes($)?"exists":"absent"}function q6($,J,Z){if(!$)return"";return`<a class="open-link" href="${V(`${J}/?session=${$}`)}" target="_blank" rel="noopener" title="open in web GUI">Open ↗</a>`}var z6={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function V6($){if($.length===0)return"";let J=$.filter((Q)=>Q.status==="completed").length,Z=$.map((Q)=>`<li class="st st-${V(Q.status)}"><span class="st-icon">${z6[Q.status]??"?"}</span>${V(C(Q.content,70))}</li>`).join("");return`<div class="lane"><span class="lane-count">${J}/${$.length}</span><ul>${Z}</ul></div>`}var Y6={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function K6($){if(!$||$.source==="none"||$.todos.length===0)return"";let J=M0($.todos),Z=J.total-J.cancelled,Q=Z>0?Math.round(J.completed/Z*100):0,W=$.source==="mirror"?' <span class="todo-cached" title="session not reachable now — showing the last mirrored snapshot (may lag)">cached</span>':"",X=J.current?`<div class="todo-current" title="${V(J.current)}"><span class="st-icon">▸</span>${V(C(J.current,72))}</div>`:J.inProgress===0&&J.pending>0?`<div class="todo-current dim">${J.pending} pending — none in progress</div>`:"",z=$.todos.map((q)=>`<li class="st st-${V(q.status)}"><span class="st-icon">${Y6[q.status]??"?"}</span>${V(C(q.content,70))}</li>`).join("");return`<div class="todos" title="owning session TodoWrite progress (WI-038)">
    <div class="todo-head">
      <span class="todo-label">activity</span>
      <span class="todo-count mono">${J.completed}/${Z}</span>${W}
      <div class="todo-bar"><div class="todo-bar-fill" style="width:${Q}%"></div></div>
    </div>
    ${X}
    <details class="todo-list"><summary>${$.todos.length} todo${$.todos.length===1?"":"s"}</summary><ul>${z}</ul></details>
  </div>`}function j6($){let J=Y0($);if(J.length===0)return"";let Z=J[J.length-1],Q=J.map((X)=>{let z=X.session?` <span class="mono dim">${V(H0(X.session))}</span>`:"",q=`superseded body — board/${$.id}/${X.supersededHash}.md`;return`<li><span class="mono dim">${V(f(X.at))}</span> ${V(X.by)}${z} <span class="mono dim" title="${V(q)}">${V(X.supersededHash)}</span></li>`}).join("");return`<details class="revisions"><summary>spec revised ${J.length===1?"once":`${J.length}×`}<span class="dim"> · latest ${V(f(Z.at))}</span></summary><ul>${Q}</ul></details>`}function M6($,J,Z){let Q=[],W=V0($);if(W.length>0){let X=W.map((z)=>W6(z,Z)==="exists"?`<a href="${V(`${J}/?session=${z}`)}" target="_blank" rel="noopener" class="mono">${V(z)}</a>`:`<span class="mono" title="session not available here">${V(z)}</span>`).join(", ");Q.push(`previously attempted in ${X}`)}for(let X of K0($))Q.push(`absorbed <span class="mono">${V(X.id)}</span> at bind${X.at?` (${f(X.at)})`:""}`);if(Q.length===0)return"";return`<div class="lineage">${Q.join(" · ")}</div>`}function H0($){return $.length>16?$.slice(0,16)+"…":$}function F0($,J){if(!$)return"";let Z=J.actionRequired[$];if(!Z)return"";let Q=[];if(Z.awaitingQuestion){let W=Z.questionCount>1?` (${Z.questionCount})`:"",X=Z.questionHeader?`the owning session is asking: "${Z.questionHeader}" — answer it in the session (WI-043)`:"the owning session is waiting on an answer to a question (WI-043)";Q.push(`<span class="badge badge-action badge-action-question" title="${V(X)}">❓ needs answer${W}</span>`)}if(Z.awaitingPermission){let W=Z.permissionCount>1?` (${Z.permissionCount})`:"";Q.push(`<span class="badge badge-action badge-action-permission" title="the owning session is waiting on a command/permission approval (WI-043)">✋ needs approval${W}</span>`)}return Q.join(" ")}function P0($,J){if(!$)return"";let Z=J.actionRequired[$];if(Z&&(Z.awaitingQuestion||Z.awaitingPermission))return"";let Q=J.sessionStatus[$];if(!Q)return"";switch(Q){case"busy":return'<span class="badge badge-status badge-status-busy" title="the owning session is actively processing (WI-044)">⚙ working</span>';case"retry":return'<span class="badge badge-status badge-status-retry" title="the owning session hit a provider error and is retrying (WI-044)">⟳ retrying</span>';case"idle":return`<span class="badge badge-status badge-status-idle" title="the owning session is idle — not currently processing (this is NOT 'done'; completion is dream/column-driven) (WI-044)">✓ idle</span>`}}function x($,J,Z){return` data-confirm="1" data-confirm-severity="${$}" data-confirm-title="${V(J)}" data-confirm-body="${V(Z)}"`}function U6($,J){let Z=J.decisions[$.id];if(!Z)return"";let Q=`<input type="hidden" name="id" value="${V($.id)}">`;if(Z.kind==="fresh"&&J.sessionBackend==="unconfigured")return'<div class="actions"><span class="act disabled" title="opencode server not configured (--opencode-url / OPENCODE_SERVER_PASSWORD) — session creation unavailable">Start ⏻</span></div>';if(Z.kind==="refuse")return`<div class="actions"><span class="act disabled" title="${V(`${Z.reason}: ${Z.detail}`)}">Promote</span></div>`;if(Z.kind==="fresh")switch(Z.reason){case"never-owned":return`<div class="actions"><form method="post" action="/transitions/start"${x("start","Start a session?","This creates a fresh top-level HIVE session, binds it, and runs /awaken seeded with the spec. Confirm to proceed.")}>${Q}<button class="act act-start" title="create a fresh top-level session, bind it, auto-/awaken seeded with the spec (§5.3c)">Start</button></form></div>`;case"spec-changed":return`<div class="actions"><form method="post" action="/transitions/promote"${x("start","Start a fresh session? (spec edited)","The spec was edited after this item was demoted, so promotion creates a FRESH session (the edit is the decision, Q13) — the previous session is not reattached. Confirm to proceed.")}>${Q}<button class="act act-start" title="spec was edited after demote — promotion creates a FRESH session (Q13: the edit is the decision)">Start fresh session (spec edited)</button></form></div>`;case"done-never-owned":return`<div class="actions"><form method="post" action="/transitions/promote"${x("start","Reopen as a fresh session?","This item was marked done without ever owning a session. Promotion un-does the done state (done→todo) and starts a FRESH session (Q16). Confirm to proceed.")}>${Q}<button class="act act-start" title="done without a session — promote un-does the item (done→todo) then starts a fresh session (Q16)">Reopen as fresh session</button></form></div>`}let X=Z.reason==="done-reopen",z=X?"Reopen — re-attach original session":`Re-attach ${H0(Z.sessionID)} (spec unchanged)`;return`<div class="actions"><form method="post" action="/transitions/promote"${X?x("start","Reopen this item?","This re-opens the item and RE-ATTACHES its original owning session by id — a deep link only; /awaken is never re-run (invariant 4). Confirm to proceed."):x("start","Re-attach session?","This re-opens the existing owning session (deep link only; /awaken is not re-run). Confirm to proceed.")}>${Q}<button class="act" title="re-attaches ${V(Z.sessionID)} — deep link only, /awaken is NEVER re-run (invariant 4)">${V(z)}</button></form></div>`}function G6($,J){if($.status!=="in_progress")return U6($,J);let Z=[],Q=`<input type="hidden" name="id" value="${V($.id)}">`;if(Z.push($.paused?`<form method="post" action="/transitions/unpause">${Q}<button class="act" title="resume — same owning session">Unpause</button></form>`:`<form method="post" action="/transitions/pause">${Q}<button class="act" title="park it; resume the same session later (§5.5)">Pause</button></form>`),Z.push(`<form method="post" action="/transitions/demote"${x("warn","Demote this item?","This detaches and TOMBSTONES the owning session. The idea becomes fluid again and the session will not be reattached. Confirm to proceed.")}>${Q}<select name="to" class="act-select"><option value="todo">todo</option><option value="backlog">backlog</option></select><button class="act act-warn" title="true demote: detach + tombstone the session; the idea is fluid again (§5.5)">Demote</button></form>`),!$.paused)Z.push(`<form method="post" action="/transitions/done-without-dream"${x("warn","Mark done without a dream?","This is a terminal state and skips dreamtime — no artifacts will be linked and no consolidation happens (§5.4). Confirm to proceed.")}>${Q}<button class="act" title="manual done — skips dreamtime, badged no-dream (§5.4)">Done (no dream)</button></form>`);return`<div class="actions">${Z.join("")}</div>`}function B0($){return`<details class="create" data-key="create:${$}"><summary>+ new item</summary>
  <form method="post" action="/transitions/create" class="create-form">
    <input type="hidden" name="status" value="${$}">
    <input name="title" placeholder="title" required>
    <select name="priority"><option value="medium">medium</option><option value="high">high</option><option value="low">low</option></select>
    <input name="tags" placeholder="tags, comma-separated">
    <textarea name="body" rows="3" placeholder="spec / notes (markdown)"></textarea>
    <button type="submit">Create in ${$}</button>
  </form></details>`}function B6($,J){let{guiBaseUrl:Z,mirror:Q,writesEnabled:W}=J,X=[],z=F0($.owner_session,J);if(z)X.push(z);let q=P0($.owner_session,J);if(q)X.push(q);if($.priority)X.push(`<span class="chip chip-prio-${V($.priority)}">${V($.priority)}</span>`);for(let U of $.tags)X.push(`<span class="chip">${V(U)}</span>`);if($.paused)X.push('<span class="badge badge-paused" title="parked — resume the same session (§5.5)">paused</span>');if($.done_without_dream)X.push('<span class="badge badge-nodream" title="done without a dream — consolidation skipped (§5.4)">no-dream</span>');for(let U of $.problems)X.push(`<span class="badge badge-problem" title="${V(U)}">⚠ invariant</span>`);let Y=$.artifacts.length>0?`<div class="cap-desc">produced: ${$.artifacts.map((U)=>`<span class="chip mono">${V(U)}</span>`).join(" ")}${$.dream_id?` <span class="dim mono">(${V($.dream_id)})</span>`:""}</div>`:$.dream_id?`<div class="cap-desc dim mono">dream: ${V($.dream_id)}</div>`:"",M=$.body?`<details class="spec"><summary>spec</summary><div class="spec-body">${V(C($.body,600))}</div></details>`:"",G=j0($.title,$.owner_session,Q.sessionTitles);return`<div class="card wi ${$.paused?"paused":""}" data-key="wi:${V($.id)}">
    <div class="cap-head">
      <span class="mono dim">${V($.id)}</span>
      <span class="cap-name">${V(C(G,90))}</span>
      ${q6($.owner_session,Z,Q)}
    </div>
    <div class="chips">${X.join(" ")}</div>
    ${V6($.subtasks)}
    ${K6(J.todoSubStates[$.id])}
    ${Y}
    ${j6($)}
    ${M6($,Z,Q)}
    ${M}
    ${W?G6($,J):""}
  </div>`}function H6($,J){let Z=F0($.id,J),Q=P0($.id,J),W=[Z,Q].filter(Boolean).join(" ");return`<div class="card session-only" data-key="ses:${V($.id)}">
    <div class="cap-head">
      <span class="cap-name">${V(C($.title,80))}</span>
      <a class="open-link" href="${V($.openUrl)}" target="_blank" rel="noopener">Open ↗</a>
    </div>
    ${W?`<div class="chips">${W}</div>`:""}
    <div class="cap-desc mono">${V($.id)}</div>
    <div class="cap-desc dim">session-only — awakened, no work item yet · updated ${f($.updated)}</div>
  </div>`}function w($,J,Z=""){return`<div class="col" data-key="col:${V($)}" data-col="${V($)}">
    <div class="col-head"><button type="button" class="col-toggle" data-col-toggle="${V($)}" aria-pressed="false" title="collapse/expand this column (survives refresh)">${V($)} <span class="count">(${J.length})</span><span class="col-toggle-icon" aria-hidden="true">▾</span></button></div>
    <div class="col-body">
      ${Z}
      ${J.length===0?'<div class="empty">—</div>':J.join(`
`)}
    </div>
  </div>`}function F6($){let J=$.map((Z)=>{let Q=Array.isArray(Z.tags)?Z.tags:[];return{id:Z.id,status:Z.status,title:Z.title??"",tags:Q,hay:`${Z.id} ${Z.title??""} ${Q.join(" ")} ${Z.body??""}`.toLowerCase()}});return JSON.stringify(J).replaceAll("</","<\\/")}function P6($,J,Z){let Q=(q)=>B6(q,J),W=[...$.inProgress.map((q)=>({key:E(q),tie:q.id,html:Q(q)})),...$.sessionOnly.map((q)=>({key:q.updated,tie:q.id,html:H6(q,J)}))];W.sort((q,Y)=>q.key!==Y.key?Y.key.localeCompare(q.key):Y.tie.localeCompare(q.tie));let X=W.map((q)=>q.html);return`${`<script id="filter-corpus" type="application/json" data-key="filter:corpus">${F6(Z)}</script>`}<div class="kanban">
    ${w("Backlog",$.backlog.map(Q),J.writesEnabled?B0("backlog"):"")}
    ${w("Todo",$.todo.map(Q),J.writesEnabled?B0("todo"):"")}
    ${w("In Progress",X)}
    ${w("Done",$.done.map(Q))}
  </div>`}var O0=`
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
`;function _0($){let J=new Map,Z=0;for(let Y of $.items){let M=Array.isArray(Y.tags)?Y.tags:[];if(M.length===0)Z++;for(let G of M)J.set(G,(J.get(G)??0)+1)}let Q=[...J.entries()].sort((Y,M)=>M[1]-Y[1]||Y[0].localeCompare(M[0])),W=(Y,M,G)=>`<button type="button" class="tag-chip" data-tag="${V(Y)}" title="${V(G)}">${V(M)}</button>`,X=12,z=Q.slice(0,X),q=Q.slice(X);return`<div id="board-controls">
  <div id="controls-row">
    <button type="button" id="controls-toggle" aria-expanded="true" aria-controls="controls-panel" title="collapse/expand the filter/tag controls">filters ▴</button>
    <input id="filter-q" type="search" placeholder="filter — id, title, tag, spec…" autocomplete="off" spellcheck="false" aria-label="filter work items">
    <span id="controls-summary" title="active filter — tap “filters” to change it"></span>
  </div>
  <div id="controls-panel">
    <div id="filter-bar" role="search">
      <div id="filter-tags" role="group" aria-label="filter by tag">
        ${z.map(([Y,M])=>W(Y,`${Y} ${M}`,`${M} item${M===1?"":"s"} tagged ${Y} — tap to filter`)).join(`
        `)}
        ${q.length>0?`<details id="filter-tags-more"><summary>+${q.length} more tags</summary><div class="tag-tail">${q.map(([Y,M])=>W(Y,`${Y} ${M}`,`${M} item${M===1?"":"s"} tagged ${Y} — tap to filter`)).join(`
        `)}</div></details>`:""}
        ${W("__untagged__",`untagged ${Z}`,"show ONLY items with no tags — the tagging-backlog hunting set (W-019)")}
      </div>
      <button type="button" id="filter-clear" title="clear search text and all tag filters" hidden>clear</button>
    </div>
    <div id="collapse-strip" aria-label="collapse/expand columns">
      ${["Backlog","Todo","In Progress","Done"].map((Y)=>`<button type="button" class="col-toggle" data-col-toggle="${V(Y)}" title="collapse/expand the ${V(Y)} column">${V(Y)} <span class="col-toggle-icon" aria-hidden="true">▾</span></button>`).join(`
      `)}
    </div>
  </div>
</div>`}function N0($,J=[]){let{dreams:Z,messages:Q}=$,W={guiBaseUrl:$.guiBaseUrl,mirror:$.sessions,writesEnabled:$.writesEnabled,sessionBackend:$.sessionBackend,decisions:$.promoteDecisions,todoSubStates:$.todoSubStates,actionRequired:$.actionRequired,sessionStatus:$.sessionStatus},X=J.length===0?"":`<div class="notices">${J.map((q)=>`<div class="notice"><span class="mono dim">${f(q.at)}</span> ${V(q.text)}</div>`).join("")}</div>`;return`${`<div class="meta mono">workspace ${V($.workspaceRoot)} · generated ${V($.generatedAt)} · live refresh 15s · ${X6($.buildSha)}</div>`}
<h2>Board <span class="count">(${$.items.length} items · ${$.board.sessionOnly.length} session-only)</span> <span id="filter-count" class="count" title="how many work items the current filter shows / total — updated live by the filter bar"></span></h2>
${X}
${P6($.board,W,$.items)}
${$.writesEnabled?"":'<div class="meta">read-only view — the board write path stays sealed behind the hive_board_* tools (WI-062)</div>'}`}function O6($){let J=$.tagName;return J==="INPUT"||J==="TEXTAREA"||J==="SELECT"}function _6($){let J=$.ownerDocument.activeElement??null;if(!J||!$.contains(J))return null;let Z=null,Q=null;if(J instanceof HTMLInputElement||J instanceof HTMLTextAreaElement)try{Z=J.selectionStart,Q=J.selectionEnd}catch{}return{key:N6(J,$),name:J.getAttribute("name"),start:Z,end:Q}}function N6($,J){let Z=$;while(Z&&Z!==J){let Q=Z.getAttribute("data-key");if(Q)return Q;Z=Z.parentElement}return null}function D6($,J){if(!J)return;let Z=J.key!==null?$.querySelector(`[data-key="${D0(J.key)}"]`)??$:$,Q=J.name?`[name="${D0(J.name)}"]`:null,W=Q?Z.querySelector(Q):null;if(W instanceof HTMLElement){if(W.focus(),(W instanceof HTMLInputElement||W instanceof HTMLTextAreaElement)&&J.start!==null)try{W.setSelectionRange(J.start,J.end??J.start)}catch{}}}function D0($){return $.replace(/["\\]/g,"\\$&")}function R0($,J){let Z=_6($);k0($,J,!0),D6($,Z)}function k0($,J,Z=!1){if($.tagName!==J.tagName){$.replaceWith(J);return}L6($,J,Z),R6($,J)}function L6($,J,Z=!1){let Q=$.tagName==="DETAILS",W=O6($);for(let X of Array.from(J.attributes)){if(Q&&X.name==="open")continue;if(W&&X.name==="value")continue;if($.getAttribute(X.name)!==X.value)$.setAttribute(X.name,X.value)}if(!Z)for(let X of Array.from($.attributes)){if(Q&&X.name==="open")continue;if(W&&X.name==="value")continue;if(!J.hasAttribute(X.name))$.removeAttribute(X.name)}}function l($){return $ instanceof Element?$.getAttribute("data-key"):null}function R6($,J){let Z=Array.from($.childNodes),Q=Array.from(J.childNodes),W=new Map;for(let z of Z){let q=l(z);if(q!==null)W.set(q,z)}let X=0;for(let z of Q){let q=l(z);if(q!==null&&W.has(q)){let M=W.get(q);W.delete(q);let G=$.childNodes[X];if(G!==M)$.insertBefore(M,G??null);L0(M,z),X=k6($,M)+1;continue}let Y=$.childNodes[X]??null;if(Y&&l(Y)===null&&E6(Y,z))L0(Y,z),X++;else $.insertBefore(z.cloneNode(!0),Y),X++}while($.childNodes.length>X)$.removeChild($.childNodes[X])}function k6($,J){return Array.prototype.indexOf.call($.childNodes,J)}function E6($,J){if($.nodeType!==J.nodeType)return!1;if($.nodeType===Node.ELEMENT_NODE)return $.tagName===J.tagName;return!0}function L0($,J){if($.nodeType===Node.ELEMENT_NODE&&J.nodeType===Node.ELEMENT_NODE){k0($,J);return}if($.nodeType===Node.TEXT_NODE||$.nodeType===Node.COMMENT_NODE){if($.nodeValue!==J.nodeValue)$.nodeValue=J.nodeValue;return}$.replaceWith(J.cloneNode(!0))}var A6=["Backlog","Todo","In Progress","Done"],_={q:"hb.filter.q",tags:"hb.filter.tags",collapsed:"hb.collapsed",controls:"hb.controls.collapsed"};function x6(){try{return typeof window.matchMedia==="function"?window.matchMedia("(max-width:640px)").matches:!1}catch{return!1}}function S($){try{return window.localStorage.getItem($)}catch{return null}}function T($,J){try{window.localStorage.setItem($,J)}catch{}}function I6(){try{return new Set(JSON.parse(S(_.tags)??"[]"))}catch{return new Set}}function C6(){try{return new Set(JSON.parse(S(_.collapsed)??"[]"))}catch{return new Set}}function T6(){let $=S(_.controls);if($==="collapsed")return!0;if($==="expanded")return!1;return x6()}var K={q:S(_.q)??"",tags:I6(),collapsed:C6(),controlsCollapsed:T6()},N=[];function S6(){let $=document.getElementById("filter-corpus");if(!$||!$.textContent)return N;try{let J=JSON.parse($.textContent);return Array.isArray(J)?J:N}catch{return N}}var O="__untagged__";function y6($){let J=K.tags.has(O),Z=[...K.tags].filter((Q)=>Q!==O);if(J&&$.tags.length>0)return!1;if(!J){for(let Q of Z)if(!$.tags.includes(Q))return!1}else if(Z.length>0)return!1;if(K.q){let Q=K.q.toLowerCase();if(!$.hay.includes(Q))return!1}return!0}function h(){N=S6();let $=new Map;for(let X of N)$.set(X.id,y6(X));let J=K.q!==""||K.tags.size>0,Z=0,Q=0;for(let X of Array.from(document.querySelectorAll(".card.wi"))){let z=X.getAttribute("data-key")??"",q=z.startsWith("wi:")?z.slice(3):"",Y=!J||$.get(q)===!0;if(X.classList.toggle("filter-hidden",!Y),J)if(Y)Z++;else Q++}for(let X of Array.from(document.querySelectorAll(".card.session-only")))X.classList.toggle("filter-dim",J);let W=document.getElementById("board-root");if(W)W.classList.toggle("filter-empty",J&&N.length>0&&Z===0);g6(J,Z,Q),f6(J,Z),h6()}function v6(){let $=[...K.tags].filter((X)=>X!==O);if($.length<2)return null;if(K.tags.has(O))return null;let J=K.q.toLowerCase(),Z=(X)=>J===""||X.hay.includes(J),Q=$.map((X)=>N.filter((z)=>z.tags.includes(X)&&Z(z)).length);if(Q.some((X)=>X===0))return null;return`no items have all of: ${$.map((X,z)=>`${X} (${Q[z]})`).join(" + ")} — each has matches individually`}function g6($,J,Z){let Q=document.getElementById("filter-count");if(!Q)return;let W=N.length,X=N.filter((z)=>z.tags.length===0).length;if(W===0){Q.textContent="· board is empty",Q.title="no work items on the board at all";return}if(!$){Q.textContent=`· ${W} items · ${X} untagged`,Q.title=`${X} of ${W} items carry no tags — the set a tag filter cannot reach (tap "untagged" to list them)`;return}if(J===0){let z=[...K.tags].filter((Y)=>Y!==O);if(K.tags.has(O)&&z.length>0){Q.textContent="· nothing can match — untagged + a tag is empty by definition",Q.title=`the untagged filter lists ONLY items with no tags, and ${z.join(" + ")} require${z.length===1?"s":""} a tag. Drop one of them.`;return}let q=v6();if(q){Q.textContent=`· ${q} — ${Z} hidden`,Q.title=`the AND-combination is empty: no single item carries every selected tag. Remove one tag to widen the result. ${X} item${X===1?"":"s"} on the board carry no tags.`;return}Q.textContent=Z>0?`· no items match — ${Z} hidden`:"· no items match",Q.title=`the filter hid all ${Z} item${Z===1?"":"s"}. ${X} item${X===1?"":"s"} on the board carry no tags and can only be reached via the "untagged" filter or free text.`}else Q.textContent=`· showing ${J}/${W} · ${X} untagged`,Q.title=`${Z} hidden by the filter · ${X} of ${W} items carry no tags`}function b6($,J){if(!$)return{text:"no filter active",tags:[],untaggedActive:!1};let Z=[...K.tags].filter((q)=>q!==O).sort(),Q=K.tags.has(O),W=K.q!==""?`“${K.q}”`:"",X=`showing ${J}/${N.length}`,z=[W,...Z,...Q?["untagged"]:[]];return{text:z.length>0?`${z.join(" + ")} · ${X}`:X,tags:Z,untaggedActive:Q}}function f6($,J){let Z=document.getElementById("controls-summary");if(!Z)return;let{text:Q,tags:W,untaggedActive:X}=b6($,J);if(Z.textContent="",Z.classList.toggle("has-filter",$),!$){Z.textContent=Q;return}let z=[...W,...X?[O]:[]],q=z.length,Y=()=>{if(Z.textContent="",K.q!==""){let U=document.createElement("span");U.className="summary-q",U.textContent=`“${K.q}”`,Z.appendChild(U)}for(let U of z.slice(0,q)){let D=document.createElement("span");if(D.className="tag-chip active",U===O)D.setAttribute("data-tag",O);if(D.textContent=U===O?"untagged":U,q===1)D.classList.add("summary-chip-shrink");Z.appendChild(D)}let M=z.length-q;if(M>0){let U=document.createElement("span");U.className="summary-more",U.textContent=`+${M} more`,U.title=`${M} more active tag${M===1?"":"s"}: ${z.slice(q).join(", ")} — tap “filters” to expand`,Z.appendChild(U)}let G=document.createElement("span");G.className="summary-n",G.textContent=`${J}/${N.length}`,Z.appendChild(G)};Y();while(q>1&&Z.scrollWidth>Z.clientWidth)q--,Y();Z.title=Q}function h6(){let $=document.getElementById("filter-q");if($&&$.value!==K.q)$.value=K.q;let J=document.getElementById("filter-clear");if(J)if(K.q!==""||K.tags.size>0)J.removeAttribute("hidden");else J.setAttribute("hidden","");for(let Z of Array.from(document.querySelectorAll("#filter-tags .tag-chip"))){let Q=Z.getAttribute("data-tag")??"";Z.classList.toggle("active",K.tags.has(Q)),Z.setAttribute("aria-pressed",K.tags.has(Q)?"true":"false")}for(let Z of Array.from(document.querySelectorAll("[data-col-toggle]"))){let Q=Z.getAttribute("data-col-toggle")??"";Z.setAttribute("aria-pressed",K.collapsed.has(Q)?"true":"false")}}function i(){for(let $ of A6){let J=K.collapsed.has($),Z=document.querySelector(`.col[data-col="${E0($)}"]`);if(Z)Z.classList.toggle("collapsed",J);for(let Q of Array.from(document.querySelectorAll(`[data-col-toggle="${E0($)}"]`)))Q.setAttribute("aria-pressed",J?"true":"false")}}function E0($){return $.replace(/["\\]/g,"\\$&")}function u6($){if(K.collapsed.has($))K.collapsed.delete($);else K.collapsed.add($);T(_.collapsed,JSON.stringify([...K.collapsed])),i()}function p(){let $=document.getElementById("board-controls");if(!$)return;let J=K.controlsCollapsed;$.classList.toggle("controls-collapsed",J);let Z=document.getElementById("controls-toggle");if(Z)Z.setAttribute("aria-expanded",J?"false":"true"),Z.textContent=J?"filters ▾":"filters ▴",Z.title=J?"expand the filter/tag controls":"collapse the filter/tag controls"}function w6(){K.controlsCollapsed=!K.controlsCollapsed,T(_.controls,K.controlsCollapsed?"collapsed":"expanded"),p()}function p6($){let J=$.target;if(!J)return;if(J.closest("#controls-toggle")){$.preventDefault(),w6();return}let Z=J.closest("[data-col-toggle]");if(Z){let W=Z.getAttribute("data-col-toggle");if(W)$.preventDefault(),u6(W);return}let Q=J.closest("#filter-tags .tag-chip");if(Q){let W=Q.getAttribute("data-tag");if(W){if(K.tags.has(W))K.tags.delete(W);else K.tags.add(W);T(_.tags,JSON.stringify([...K.tags])),h()}return}if(J.closest("#filter-clear"))K.q="",K.tags.clear(),T(_.q,""),T(_.tags,"[]"),h()}function m6($){let J=$.target;if(!J||J.id!=="filter-q")return;K.q=J.value,T(_.q,K.q),h()}var o=!1;function A0(){if(o)return;if(o=!0,document.addEventListener("click",p6),document.addEventListener("input",m6),p(),i(),h(),S(_.controls)===null&&typeof window.matchMedia==="function")try{let $=window.matchMedia("(max-width:640px)"),J=(Z)=>{if(S(_.controls)!==null)return;K.controlsCollapsed=Z.matches,p()};if(typeof $.addEventListener==="function")$.addEventListener("change",J);else if(typeof $.addListener==="function")$.addListener(J)}catch{}}function x0(){if(!o)return;p(),i(),h()}var d6=48;function c6($){return g($)||$.startsWith("/")}function n6($,J){if($.length<=J)return $;let Z=$.slice(0,J),Q=Z.lastIndexOf(" ");return(Q>J*0.5?Z.slice(0,Q):Z).trimEnd()+"…"}function I0($){let J=c6($),Z=$.startsWith("/")?"awaken-input-slug":g($)?"opencode-placeholder":"";return{display:J?n6($,d6):$,raw:$,raw_:J,rawKind:Z}}var C0='<span class="raw-title-chip" title="title is raw/unverified — no session-title surface exists under dsh yet (SHADOW-019)">(raw title)</span>';var l6="/api/hive-board/item",a="hvb-drawer",s="hvb-drawer-scrim",T0=50,o6=1e4;function m($){if(!$)return"—";let J=new Date($);if(isNaN(J.getTime()))return $;return J.toISOString().slice(0,16).replace("T"," ")}function j($,J,Z){let Q=document.createElement($);if(J)Q.className=J;if(Z!==void 0)Q.textContent=Z;return Q}function i6(){let $=document.getElementById(a);if($)return $;$=document.createElement("div"),$.id=a,$.setAttribute("hidden",""),$.setAttribute("role","dialog"),$.setAttribute("aria-modal","false"),$.appendChild(e());let J=document.createElement("div");return J.id=s,J.setAttribute("hidden",""),J.addEventListener("click",()=>t()),document.body.appendChild(J),document.body.appendChild($),$}function t(){document.getElementById(a)?.setAttribute("hidden",""),document.getElementById(s)?.setAttribute("hidden","")}var S0=!1;function v0(){if(S0||typeof document>"u")return;S0=!0,document.addEventListener("keydown",($)=>{if($.key==="Escape")t()}),document.addEventListener("click",($)=>{let J=$.target;if(!(J instanceof Element))return;let Z=J.closest("a.open-link");if(Z instanceof HTMLAnchorElement){$.preventDefault();let q=Z.closest('[data-key^="wi:"]')?.getAttribute("data-key");if(q)y0(q.slice(3));return}let Q=J.closest('[data-key^="wi:"]');if(!Q)return;if(J.closest("a,button,input,textarea,select,form"))return;let X=(Q.getAttribute("data-key")??"").slice(3);if(X)y0(X)},!1)}function e(){let $=j("button","hvb-drawer-close","×");return $.type="button",$.title="close the item detail (Esc works too)",$.addEventListener("click",t),$}async function y0($){let J=i6();J.textContent="",J.appendChild(e());let Z=j("div","hvb-drawer-head mono");Z.appendChild(j("span","hvb-wi-id",$)),Z.appendChild(j("span","meta","loading…")),J.appendChild(Z),document.getElementById(s)?.removeAttribute("hidden"),J.removeAttribute("hidden");try{let Q=await fetch(`${l6}?id=${encodeURIComponent($)}`,{headers:{accept:"application/json"}});if(!Q.ok){r(J,$,`HTTP ${Q.status}`);return}let W=await Q.json();if(!W||W.ok!==!0||!W.item){r(J,$,W?.missing?.join(", ")??"unknown reason");return}a6(J,W.item,W)}catch(Q){r(J,$,Q instanceof Error?Q.message:String(Q))}}function r($,J,Z){let Q=j("div","hvb-drawer-body");Q.appendChild(j("div","meta",`${J} is not on the board (${Z}). It may have been dissolved or the board moved — hit the 15 s lane refresh and retry. Nothing was written; nothing was assumed.`)),$.appendChild(Q)}function r6($){let J=j("div","hvb-chip-row"),Z=[[$.status,`hvb-chip status-${$.status}`],[$.priority,`hvb-chip prio-${$.priority}`],...$.paused?[["paused","hvb-chip status-paused"]]:[]];for(let[Q,W]of Z)J.appendChild(j("span",W,Q));return J}function L($,J){let Z=j("div","hvb-face-row");return Z.appendChild(j("span","mono dim",$)),Z.appendChild(j("span","mono",J&&J.length?J:"—")),Z}function u($){return j("div","hvb-section-title",$)}function a6($,J,Z){$.textContent="",$.appendChild(e());let Q=I0(J.title),W=j("div","hvb-drawer-head"),X=j("div","hvb-drawer-title-row"),z=j("h3","hvb-drawer-title",Q.display);if(z.title=Q.raw,X.appendChild(z),Q.raw_){let H=document.createElement("span");H.innerHTML=C0,X.appendChild(H.firstChild)}W.appendChild(X),W.appendChild(r6(J)),$.appendChild(W);let q=j("div","hvb-face mono");if(q.appendChild(L("id",J.id)),q.appendChild(L("owner",J.owner_session)),q.appendChild(L("group",J.group_id)),q.appendChild(L("origin",J.origin)),q.appendChild(L("created",m(J.created))),q.appendChild(L("updated",m(J.updated))),q.appendChild(L("recency",J.recency)),q.appendChild(L("spec",J.spec_hash)),J.released_sessions&&J.released_sessions.length>0)q.appendChild(L("released",J.released_sessions.join(", ")));if(J.dream_id)q.appendChild(L("dream",J.dream_id));$.appendChild(q);let Y=J.problems??[];if(Y.length>0){let H=j("div","hvb-problems");H.appendChild(u("⚠ invariant problems (detection only — SCHEMA §3, WI-071)"));for(let F of Y)H.appendChild(j("div","hvb-problem mono",F));$.appendChild(H)}if(J.subtasks&&J.subtasks.length>0){let H=j("div","hvb-subtasks");H.appendChild(u(`subtasks (${J.subtasks.filter((F)=>F.status==="completed").length}/${J.subtasks.length})`));for(let F of J.subtasks){let B=j("div","hvb-subtask-row");B.appendChild(j("span","mono hvb-subtask-icon",F.status==="completed"?"☑":F.status==="in_progress"?"▸":F.status==="cancelled"?"✕":"○")),B.appendChild(j("span",void 0,F.content)),H.appendChild(B)}$.appendChild(H)}let M=J.todo_mirror??[];if(M.length>0){let H=j("div","hvb-mirror");H.appendChild(u(`todo mirror (${M.length}${J.todo_mirror_updated?` · updated ${m(J.todo_mirror_updated)}`:""})`));for(let F of M){let B=j("div","hvb-mirror-row"),R=String(F.state??F.status??"");B.appendChild(j("span","mono hvb-subtask-icon",R==="completed"?"☑":R==="in_progress"?"▸":"○")),B.appendChild(j("span",void 0,typeof F.content==="string"?F.content:JSON.stringify(F))),H.appendChild(B)}$.appendChild(H)}let G=J.transitions??[];if(G.length>0){let H=j("div","hvb-history");H.appendChild(u(`history (${G.length})`));let F=G.slice(0,T0);for(let B of F){let R=j("div","hvb-history-row mono"),c=B.absorbed?`${B.from??"∅"} ⇢ ${B.to} (absorbed ${B.absorbed})`:`${B.from??"∅"} ⇢ ${B.to}`;R.appendChild(j("span","meta",m(B.at))),R.appendChild(j("span",void 0,c)),R.appendChild(j("span","meta",B.by+(B.session?` · ${B.session}`:"")+(B.superseded?` · spec ${B.superseded} superseded`:""))),H.appendChild(R)}if(G.length>F.length)H.appendChild(j("div","meta",`+ ${G.length-F.length} older transitions not shown (drawer cap ${T0} — nothing dropped from the record; the board file keeps them all)`));$.appendChild(H)}let U=j("div","hvb-spec");U.appendChild(u("spec"));let D=j("pre","mono hvb-spec-body",J.body);if(D.setAttribute("tabindex","0"),U.appendChild(D),Z.truncated)U.appendChild(j("div","meta",`spec truncated for display at ${o6} chars (full spec is ${Z.bodyBytes??"?"} chars — served from the board file; this is a DISPLAY cap, the file is untouched)`));$.appendChild(U),$.appendChild(j("div","meta hvb-drawer-foot","read-only depth view — the board's write path stays sealed behind the hive_board_* tools (WI-062)"))}var g0=`
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
`;var s6=30000,h0="hvb-favicon",t6="data-plugin-favicon",e6=34;function u0($){let J=typeof $?.runningAgents==="number"&&isFinite($.runningAgents)&&$.runningAgents>0?Math.floor($.runningAgents):0;return J>0?{session:"active",dreaming:!1,count:J}:{session:"quiet",dreaming:!1,count:0}}var $0=!1,b0="";function $9($){let J=document.getElementById(h0);if(!J)return;let Z=G0(u0($));if(Z===b0)return;b0=Z,J.setAttribute("href",Z)}async function J0(){try{let $=await fetch(Q0,{headers:{accept:"application/json"}});if(!$.ok)return;let J=await $.json();if(!J||typeof J!=="object"||J.ok!==!0)return;let Q=X0(J).activity;$9(Q),Z0(Q)}catch{}}function y(){if(!document.hidden)J0()}var f0="";function Z0($){let J=document.getElementById("hvb-panel-mark");if(!J)return;let Z=u0($),Q=`${Z.session}:${Z.count}:${Z.dreaming}`;if(Q===f0)return;f0=Q;let W=typeof $?.sampledAt==="string"?$.sampledAt.slice(0,16).replace("T"," "):"?";J.innerHTML=n(Z,{idPrefix:"hvbp",animate:!0,size:e6,title:`board activity — ${Z.count} agent${Z.count===1?"":"s"} running · sampled ${W} UTC (may lag one poll cycle)`})}function w0($){if($0)return;if(typeof document>"u")return;$0=!0,$.effect(()=>{let Z=document.querySelector('link[rel="icon"]'),Q=document.createElement("link");return Q.id=h0,Q.rel="icon",Q.type="image/svg+xml",Q.setAttribute(t6,"@hive/dsh-board"),document.head.appendChild(Q),J0(),document.addEventListener("visibilitychange",y),window.addEventListener("pageshow",y),window.addEventListener("focus",y),()=>{if(Q.remove(),Z)Z.setAttribute("href",Z.getAttribute("href")??"");document.removeEventListener("visibilitychange",y),window.removeEventListener("pageshow",y),window.removeEventListener("focus",y),$0=!1}},"board favicon driver");let J=$.interval;if(typeof J==="function")J(()=>{J0()},s6);else console.error("[@hive/dsh-board] favicon driver: no interval service — cadence degraded to refresh-on-visible")}var p0={high:0,medium:1,low:2};function W0($){return[...$].sort((J,Z)=>{let Q=p0[J.priority],W=p0[Z.priority];if(Q!==W)return Q-W;let X=E(J),z=E(Z);if(X!==z)return z.localeCompare(X);return Z.id.localeCompare(J.id)})}function m0($,J){let Z=E($),Q=E(J);if(Z!==Q)return Q.localeCompare(Z);return J.id.localeCompare($.id)}function d0($,J){let Z=new Set;for(let Q of $){if(Q.owner_session)Z.add(Q.owner_session);for(let W of Q.released_sessions)Z.add(W)}return{backlog:W0($.filter((Q)=>Q.status==="backlog")),todo:W0($.filter((Q)=>Q.status==="todo")),inProgress:$.filter((Q)=>Q.status==="in_progress").sort(m0),done:$.filter((Q)=>Q.status==="done").sort(m0),sessionOnly:J.cards.filter((Q)=>!Z.has(Q.id))}}var Q0="/api/hive-board/index",J9=15000,d="49afcf4-dirty";function Z9($){if(!$||$==="unknown"||d==="unknown")return"unknown";return $===d?"match":"mismatch"}function Q9($){let J=document.getElementById("build-badge");if(!J)return;if(Z9($)==="mismatch")J.classList.add("stale"),J.textContent=`stale client — reload (bundle ${d} ≠ host ${$})`,J.setAttribute("title",`this tab is running an old client bundle (built ${d}) against a newer host build (${$}). Reload the page to get the current bundle.`);else J.classList.remove("stale")}var c0={available:!1,computedAt:"",totalPersisted:0,awakeIds:0,awakeDeleted:0,cards:[],persistedIds:[]},X9={artifactCounts:{insight:0,warning:0,songline:0,shadow:0,total:0},active:[],history:[],recentArtifacts:[]};function W9($){return{...$,tags:Array.isArray($.tags)?$.tags:[],subtasks:Array.isArray($.subtasks)?$.subtasks:[],todo_mirror:Array.isArray($.todo_mirror)?$.todo_mirror:[],transitions:Array.isArray($.transitions)?$.transitions:[],released_sessions:Array.isArray($.released_sessions)?$.released_sessions:[],artifacts:Array.isArray($.artifacts)?$.artifacts:[],problems:Array.isArray($.problems)?$.problems:[],status:$.status,priority:$.priority,origin:$.origin}}function X0($){let J=(Array.isArray($.items)?$.items:[]).map(W9);return{generatedAt:typeof $.generated==="string"?$.generated:"",workspaceRoot:typeof $.workspaceRoot==="string"?$.workspaceRoot:"(unknown workspace)",buildSha:typeof $.boardBuild==="string"&&$.boardBuild!==""?$.boardBuild:"unknown",activity:$.activity,guiBaseUrl:"",capabilities:[],dreams:X9,messages:[],items:J,board:d0(J,{...c0}),writesEnabled:!1,sessionBackend:"unconfigured",promoteDecisions:{},sessions:{...c0},todoSubStates:{},actionRequired:{},sessionStatus:{}}}var q9=null,o0="";function z9($){let J=document.createElement("main");return J.id="board-root",J.innerHTML=N0($),J}function V9($){let J=document.getElementById("board-root");if(!J)return;R0(J,z9($)),Q9($.buildSha),x0()}async function q0(){try{let $=await fetch(Q0,{headers:{accept:"application/json"}});if(!$.ok)return;let J=await $.json();if(!J||typeof J!=="object"||J.ok!==!0)return;if(!Array.isArray(J.items))return;let Z=X0(J);q9=Z,o0=Z.buildSha,Z0(Z.activity),Y9(Z),V9(Z)}catch{}}var n0=!1;function Y9($){if(n0)return;let J=document.getElementById("board-controls-host");if(!J)return;J.innerHTML=_0($),n0=!0}function z0(){if(document.hidden)return;q0()}document.addEventListener("visibilitychange",z0);window.addEventListener("pageshow",z0);window.addEventListener("focus",z0);var l0=!1;function i0($){if(A0(),v0(),!l0){l0=!0;let J=$.interval;if(typeof J==="function")J(()=>{q0()},J9);else console.error("[@hive/dsh-board] no interval service — poll cadence degraded to refresh-on-visible")}q0()}var K9=`
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
`,j9='<div class="empty">Fetching the board…</div>',M9='<div class="hvb-head-row"><span id="hvb-panel-mark" class="hb-mark" title="board activity"></span></div>'+'<div class="hvb-sub">read-only view of the workspace board (WI-*) — the write path stays sealed behind the hive_board_* tools (WI-062)</div>'+`<div id="board-controls-host"></div><main id="board-root">${j9}</main>`;function U9($){let J=typeof $==="number"&&isFinite($)?$:20;return`<svg width="${J}" height="${J}" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><rect x="3" y="4" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/><rect x="3" y="15" width="5" height="5" rx="1" fill="currentColor" opacity="0.35"/><rect x="10" y="4" width="5" height="13" rx="1" fill="currentColor" opacity="0.8"/><rect x="10" y="19" width="5" height="1" rx="0.5" fill="currentColor" opacity="0.35"/><rect x="17" y="4" width="5" height="5" rx="1" fill="currentColor" opacity="0.8"/><rect x="17" y="11" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/></svg>`}globalThis.__BOARD_ENGINE={CSS:O0,CSS_OVERRIDES:K9+g0,SHELL_MARKUP:M9,ICON_SVG:U9,attachEngine:i0,startFaviconDriver:w0};})();
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
