// @hive/dsh-board — GENERATED client bundle (WI-062 slice 3+3b + WI-083). DO NOT EDIT BY HAND.
// Build: dsh-hive/packages/board/scripts/build-client.ts (bun) — bundles
// websrc/client-main.ts (the ported 4400 viewer engine + the tab engine + the
// favicon driver + the item drawer + the WI-083 hive-state dock overlay) into
// the twin classic shape; the wrapper below is the only React-using code and
// takes React from the loader's runtime module table (W-044).
// Build stamp (both sides of the I-152 staleness verdict): 34a37e2-dirty
(()=>{var g6=Object.defineProperty;var h6=($)=>$;function u6($,J){this[$]=h6.bind(null,J)}var w6=($,J)=>{for(var Z in J)g6($,Z,{get:J[Z],enumerable:!0,configurable:!0,set:u6.bind(J,Z)})};var M0=($,J)=>()=>($&&(J=$($=0)),J);function a($){if($==null)return!0;let J=$.trim();if(J==="")return!0;return p6.test(J)}function m6($){return $!=null&&$.trim()!==""&&!a($)}function d0($,J,Z){if(!a($))return $;if(!J||!Z)return $;let Q=Z[J];return m6(Q)?Q:$}var p6;var G0=M0(()=>{p6=/^New session - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/});function T9($){return a($)||$.startsWith("/")}function y9($,J){if($.length<=J)return $;let Z=$.slice(0,J),Q=Z.lastIndexOf(" ");return(Q>J*0.5?Z.slice(0,Q):Z).trimEnd()+"…"}function z6($){let J=T9($),Z=$.startsWith("/")?"awaken-input-slug":a($)?"opencode-placeholder":"";return{display:J?y9($,S9):$,raw:$,raw_:J,rawKind:Z}}var S9=48,V6='<span class="raw-title-chip" title="title is raw/unverified — no session-title surface exists under dsh yet (SHADOW-019)">(raw title)</span>';var Y6=M0(()=>{G0()});var G6={};w6(G6,{openDrawer:()=>D0,bindItemDrawer:()=>L0,ITEM_URL:()=>U6,ITEM_MAX_BYTES:()=>M6,DRAWER_CSS:()=>k0});function W0($){if(!$)return"—";let J=new Date($);if(isNaN(J.getTime()))return $;return J.toISOString().slice(0,16).replace("T"," ")}function G($,J,Z){let Q=document.createElement($);if(J)Q.className=J;if(Z!==void 0)Q.textContent=Z;return Q}function b9(){let $=document.getElementById(N0);if($)return $;$=document.createElement("div"),$.id=N0,$.setAttribute("hidden",""),$.setAttribute("role","dialog"),$.setAttribute("aria-modal","false"),$.appendChild(E0());let J=document.createElement("div");return J.id=x0,J.setAttribute("hidden",""),J.addEventListener("click",()=>A0()),document.body.appendChild(J),document.body.appendChild($),$}function A0(){document.getElementById(N0)?.setAttribute("hidden",""),document.getElementById(x0)?.setAttribute("hidden","")}function L0(){if(j6||typeof document>"u")return;j6=!0,document.addEventListener("keydown",($)=>{if($.key==="Escape")A0()}),document.addEventListener("click",($)=>{let J=$.target;if(!(J instanceof Element))return;let Z=J.closest("a.open-link");if(Z instanceof HTMLAnchorElement){$.preventDefault();let q=Z.closest('[data-key^="wi:"]')?.getAttribute("data-key");if(q)D0(q.slice(3));return}let Q=J.closest('[data-key^="wi:"]');if(!Q)return;if(J.closest("a,button,input,textarea,select,form"))return;let X=(Q.getAttribute("data-key")??"").slice(3);if(X)D0(X)},!1)}function E0(){let $=G("button","hvb-drawer-close","×");return $.type="button",$.title="close the item detail (Esc works too)",$.addEventListener("click",A0),$}async function D0($){let J=b9();J.textContent="",J.appendChild(E0());let Z=G("div","hvb-drawer-head mono");Z.appendChild(G("span","hvb-wi-id",$)),Z.appendChild(G("span","meta","loading…")),J.appendChild(Z),document.getElementById(x0)?.removeAttribute("hidden"),J.removeAttribute("hidden");try{let Q=await fetch(`${U6}?id=${encodeURIComponent($)}`,{headers:{accept:"application/json"}});if(!Q.ok){_0(J,$,`HTTP ${Q.status}`);return}let W=await Q.json();if(!W||W.ok!==!0||!W.item){_0(J,$,W?.missing?.join(", ")??"unknown reason");return}v9(J,W.item,W)}catch(Q){_0(J,$,Q instanceof Error?Q.message:String(Q))}}function _0($,J,Z){let Q=G("div","hvb-drawer-body");Q.appendChild(G("div","meta",`${J} is not on the board (${Z}). It may have been dissolved or the board moved — hit the 15 s lane refresh and retry. Nothing was written; nothing was assumed.`)),$.appendChild(Q)}function f9($){let J=G("div","hvb-chip-row"),Z=[[$.status,`hvb-chip status-${$.status}`],[$.priority,`hvb-chip prio-${$.priority}`],...$.paused?[["paused","hvb-chip status-paused"]]:[]];for(let[Q,W]of Z)J.appendChild(G("span",W,Q));return J}function g($,J){let Z=G("div","hvb-face-row");return Z.appendChild(G("span","mono dim",$)),Z.appendChild(G("span","mono",J&&J.length?J:"—")),Z}function $0($){return G("div","hvb-section-title",$)}function v9($,J,Z){$.textContent="",$.appendChild(E0());let Q=z6(J.title),W=G("div","hvb-drawer-head"),X=G("div","hvb-drawer-title-row"),z=G("h3","hvb-drawer-title",Q.display);if(z.title=Q.raw,X.appendChild(z),Q.raw_){let F=document.createElement("span");F.innerHTML=V6,X.appendChild(F.firstChild)}W.appendChild(X),W.appendChild(f9(J)),$.appendChild(W);let q=G("div","hvb-face mono");if(q.appendChild(g("id",J.id)),q.appendChild(g("owner",J.owner_session)),q.appendChild(g("group",J.group_id)),q.appendChild(g("origin",J.origin)),q.appendChild(g("created",W0(J.created))),q.appendChild(g("updated",W0(J.updated))),q.appendChild(g("recency",J.recency)),q.appendChild(g("spec",J.spec_hash)),J.released_sessions&&J.released_sessions.length>0)q.appendChild(g("released",J.released_sessions.join(", ")));if(J.dream_id)q.appendChild(g("dream",J.dream_id));$.appendChild(q);let K=J.problems??[];if(K.length>0){let F=G("div","hvb-problems");F.appendChild($0("⚠ invariant problems (detection only — SCHEMA §3, WI-071)"));for(let P of K)F.appendChild(G("div","hvb-problem mono",P));$.appendChild(F)}if(J.subtasks&&J.subtasks.length>0){let F=G("div","hvb-subtasks");F.appendChild($0(`subtasks (${J.subtasks.filter((P)=>P.status==="completed").length}/${J.subtasks.length})`));for(let P of J.subtasks){let _=G("div","hvb-subtask-row");_.appendChild(G("span","mono hvb-subtask-icon",P.status==="completed"?"☑":P.status==="in_progress"?"▸":P.status==="cancelled"?"✕":"○")),_.appendChild(G("span",void 0,P.content)),F.appendChild(_)}$.appendChild(F)}let Y=J.todo_mirror??[];if(Y.length>0){let F=G("div","hvb-mirror");F.appendChild($0(`todo mirror (${Y.length}${J.todo_mirror_updated?` · updated ${W0(J.todo_mirror_updated)}`:""})`));for(let P of Y){let _=G("div","hvb-mirror-row"),C=String(P.state??P.status??"");_.appendChild(G("span","mono hvb-subtask-icon",C==="completed"?"☑":C==="in_progress"?"▸":"○")),_.appendChild(G("span",void 0,typeof P.content==="string"?P.content:JSON.stringify(P))),F.appendChild(_)}$.appendChild(F)}let H=J.transitions??[];if(H.length>0){let F=G("div","hvb-history");F.appendChild($0(`history (${H.length})`));let P=H.slice(0,K6);for(let _ of P){let C=G("div","hvb-history-row mono"),E=_.absorbed?`${_.from??"∅"} ⇢ ${_.to} (absorbed ${_.absorbed})`:`${_.from??"∅"} ⇢ ${_.to}`;C.appendChild(G("span","meta",W0(_.at))),C.appendChild(G("span",void 0,E)),C.appendChild(G("span","meta",_.by+(_.session?` · ${_.session}`:"")+(_.superseded?` · spec ${_.superseded} superseded`:""))),F.appendChild(C)}if(H.length>P.length)F.appendChild(G("div","meta",`+ ${H.length-P.length} older transitions not shown (drawer cap ${K6} — nothing dropped from the record; the board file keeps them all)`));$.appendChild(F)}let U=G("div","hvb-spec");U.appendChild($0("spec"));let D=G("pre","mono hvb-spec-body",J.body);if(D.setAttribute("tabindex","0"),U.appendChild(D),Z.truncated)U.appendChild(G("div","meta",`spec truncated for display at ${M6} chars (full spec is ${Z.bodyBytes??"?"} chars — served from the board file; this is a DISPLAY cap, the file is untouched)`));$.appendChild(U),$.appendChild(G("div","meta hvb-drawer-foot","read-only depth view — the board's write path stays sealed behind the hive_board_* tools (WI-062)"))}var U6="/api/hive-board/item",N0="hvb-drawer",x0="hvb-drawer-scrim",K6=50,M6=1e4,j6=!1,k0=`
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
`;var q0=M0(()=>{Y6()});function p0($){let J=new Set;for(let Z of $.transitions){if(Z.superseded!==void 0)continue;if(Z.session&&Z.session!==$.owner_session)J.add(Z.session)}return[...J]}function m0($){return $.transitions.filter((J)=>typeof J.superseded==="string"&&J.superseded!=="").map((J)=>({at:J.at,by:J.by,...J.session?{session:J.session}:{},supersededHash:J.superseded}))}function c0($){return $.transitions.filter((J)=>typeof J.absorbed==="string"&&J.absorbed!=="").map((J)=>({id:J.absorbed,at:J.at}))}G0();function h($){let J="";for(let Z of $.transitions)if(Z.at&&Z.at>J)J=Z.at;return J||$.updated}function l0($){let J=0,Z=0,Q=0,W=0,X=null;for(let z of $)switch(z.status){case"completed":J++;break;case"in_progress":if(Z++,X===null)X=z.content;break;case"pending":Q++;break;case"cancelled":W++;break}return{total:$.length,completed:J,inProgress:Z,pending:Q,cancelled:W,current:X}}var k={field:"#0d1117",panel:"#161b22",border:"#30363d",edge:"#30363d",node:"#484f58",strata:"#30363d",divider:"#8b949e",amber:"#d29922",red:"#f85149"},O2=k.field,s=[[11,28],[23,14],[33,29],[45,16],[53,28]],c6=[[0,1],[1,2],[1,3],[2,3],[3,4],[0,2]],d6=[[11,41,42,4],[7,47.5,50,5],[16,54,33,4]],l6=[3,1,4,2,0];function n0($){return $==="intervene"?k.red:$==="active"?k.amber:k.node}function B0($,J={}){let{idPrefix:Z="hbf",animate:Q=!1,size:W,title:X}=J,z=`${Z}-clip`,q=n0($.session),K=$.session==="quiet"?0:Math.min(Math.max($.count,1),s.length),Y=new Set(l6.slice(0,K)),H=Q?' class="lit"':"",U="";for(let[A,R]of c6){let b=Y.has(A)||Y.has(R),[I,w]=s[A],[p,B]=s[R];U+=`<line x1="${I}" y1="${w}" x2="${p}" y2="${B}" stroke="${b?q:k.edge}" stroke-width="1.4"${b?` opacity=".8"${H}`:""}/>`}for(let A=0;A<s.length;A++){let R=Y.has(A),[b,I]=s[A];U+=`<circle cx="${b}" cy="${I}" r="${R?4.2:3.2}" fill="${R?q:k.node}"${R?H:""}/>`}let D=$.dreaming?k.amber:k.strata,F=$.dreaming&&Q?' class="dreaming"':"",P=d6.map(([A,R,b,I])=>`<rect x="${A}" y="${R}" width="${b}" height="${I}" fill="${D}"/>`).join(""),_=W?` width="${W}" height="${W}"`:"",C=X?' role="img"':' aria-hidden="true"',E=X?`<title>${X}</title>`:"";return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${_}${C}>`+E+`<defs><clipPath id="${z}"><rect x="4" y="4" width="56" height="56" rx="12"/></clipPath></defs><rect x="4" y="4" width="56" height="56" rx="12" fill="${k.panel}" stroke="${k.border}" stroke-width="1.5"/><g clip-path="url(#${z})"${F}>${P}</g><line x1="9" y1="36" x2="55" y2="36" stroke="${k.divider}" stroke-width="1" opacity=".35"/><g>${U}</g></svg>`}function H0($,J={}){let{idPrefix:Z="hbr"}=J,Q=`${Z}-clip`,W=n0($.session),X=$.dreaming?k.amber:k.strata,z=$.dreaming?18:16;return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><clipPath id="${Q}"><rect x="3" y="3" width="58" height="58" rx="13"/></clipPath></defs><rect x="3" y="3" width="58" height="58" rx="13" fill="${k.panel}" stroke="${k.border}" stroke-width="2"/><g clip-path="url(#${Q})"><rect x="3" y="40" width="58" height="${z}" fill="${X}"/></g><line x1="8" y1="35" x2="56" y2="35" stroke="${k.divider}" stroke-width="1.6" opacity=".4"/><circle cx="32" cy="21" r="9" fill="${W}"/></svg>`}function V($){return $.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}function n($,J){return $.length>J?$.slice(0,J-1)+"…":$}function t($){if(!$)return"—";let J=new Date($);return Number.isNaN(J.getTime())?$:J.toISOString().replace("T"," ").slice(0,16)+"Z"}function n6($){let J=$==="unknown"?"build unknown":`build ${V($)}`,Z=$==="unknown"?"git unavailable — running build could not be identified":"server build SHA — HEAD of the HIVE plugin repo, which ships this viewer";return`<span id="build-badge" class="build-badge" data-server-sha="${V($)}" title="${V(Z)}">${J}</span>`}function o6($,J){if(!$)return"absent";if(!J.available)return"unknown";return J.persistedIds.includes($)?"exists":"absent"}function i6($,J,Z){if(!$)return"";return`<a class="open-link" href="${V(`${J}/?session=${$}`)}" target="_blank" rel="noopener" title="open in web GUI">Open ↗</a>`}var r6={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function a6($){if($.length===0)return"";let J=$.filter((Q)=>Q.status==="completed").length,Z=$.map((Q)=>`<li class="st st-${V(Q.status)}"><span class="st-icon">${r6[Q.status]??"?"}</span>${V(n(Q.content,70))}</li>`).join("");return`<div class="lane"><span class="lane-count">${J}/${$.length}</span><ul>${Z}</ul></div>`}var s6={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function t6($){if(!$||$.source==="none"||$.todos.length===0)return"";let J=l0($.todos),Z=J.total-J.cancelled,Q=Z>0?Math.round(J.completed/Z*100):0,W=$.source==="mirror"?' <span class="todo-cached" title="session not reachable now — showing the last mirrored snapshot (may lag)">cached</span>':"",X=J.current?`<div class="todo-current" title="${V(J.current)}"><span class="st-icon">▸</span>${V(n(J.current,72))}</div>`:J.inProgress===0&&J.pending>0?`<div class="todo-current dim">${J.pending} pending — none in progress</div>`:"",z=$.todos.map((q)=>`<li class="st st-${V(q.status)}"><span class="st-icon">${s6[q.status]??"?"}</span>${V(n(q.content,70))}</li>`).join("");return`<div class="todos" title="owning session TodoWrite progress (WI-038)">
    <div class="todo-head">
      <span class="todo-label">activity</span>
      <span class="todo-count mono">${J.completed}/${Z}</span>${W}
      <div class="todo-bar"><div class="todo-bar-fill" style="width:${Q}%"></div></div>
    </div>
    ${X}
    <details class="todo-list"><summary>${$.todos.length} todo${$.todos.length===1?"":"s"}</summary><ul>${z}</ul></details>
  </div>`}function e6($){let J=m0($);if(J.length===0)return"";let Z=J[J.length-1],Q=J.map((X)=>{let z=X.session?` <span class="mono dim">${V(i0(X.session))}</span>`:"",q=`superseded body — board/${$.id}/${X.supersededHash}.md`;return`<li><span class="mono dim">${V(t(X.at))}</span> ${V(X.by)}${z} <span class="mono dim" title="${V(q)}">${V(X.supersededHash)}</span></li>`}).join("");return`<details class="revisions"><summary>spec revised ${J.length===1?"once":`${J.length}×`}<span class="dim"> · latest ${V(t(Z.at))}</span></summary><ul>${Q}</ul></details>`}function $9($,J,Z){let Q=[],W=p0($);if(W.length>0){let X=W.map((z)=>o6(z,Z)==="exists"?`<a href="${V(`${J}/?session=${z}`)}" target="_blank" rel="noopener" class="mono">${V(z)}</a>`:`<span class="mono" title="session not available here">${V(z)}</span>`).join(", ");Q.push(`previously attempted in ${X}`)}for(let X of c0($))Q.push(`absorbed <span class="mono">${V(X.id)}</span> at bind${X.at?` (${t(X.at)})`:""}`);if(Q.length===0)return"";return`<div class="lineage">${Q.join(" · ")}</div>`}function i0($){return $.length>16?$.slice(0,16)+"…":$}function r0($,J){if(!$)return"";let Z=J.actionRequired[$];if(!Z)return"";let Q=[];if(Z.awaitingQuestion){let W=Z.questionCount>1?` (${Z.questionCount})`:"",X=Z.questionHeader?`the owning session is asking: "${Z.questionHeader}" — answer it in the session (WI-043)`:"the owning session is waiting on an answer to a question (WI-043)";Q.push(`<span class="badge badge-action badge-action-question" title="${V(X)}">❓ needs answer${W}</span>`)}if(Z.awaitingPermission){let W=Z.permissionCount>1?` (${Z.permissionCount})`:"";Q.push(`<span class="badge badge-action badge-action-permission" title="the owning session is waiting on a command/permission approval (WI-043)">✋ needs approval${W}</span>`)}return Q.join(" ")}function a0($,J){if(!$)return"";let Z=J.actionRequired[$];if(Z&&(Z.awaitingQuestion||Z.awaitingPermission))return"";let Q=J.sessionStatus[$];if(!Q)return"";switch(Q){case"busy":return'<span class="badge badge-status badge-status-busy" title="the owning session is actively processing (WI-044)">⚙ working</span>';case"retry":return'<span class="badge badge-status badge-status-retry" title="the owning session hit a provider error and is retrying (WI-044)">⟳ retrying</span>';case"idle":return`<span class="badge badge-status badge-status-idle" title="the owning session is idle — not currently processing (this is NOT 'done'; completion is dream/column-driven) (WI-044)">✓ idle</span>`}}function d($,J,Z){return` data-confirm="1" data-confirm-severity="${$}" data-confirm-title="${V(J)}" data-confirm-body="${V(Z)}"`}function J9($,J){let Z=J.decisions[$.id];if(!Z)return"";let Q=`<input type="hidden" name="id" value="${V($.id)}">`;if(Z.kind==="fresh"&&J.sessionBackend==="unconfigured")return'<div class="actions"><span class="act disabled" title="opencode server not configured (--opencode-url / OPENCODE_SERVER_PASSWORD) — session creation unavailable">Start ⏻</span></div>';if(Z.kind==="refuse")return`<div class="actions"><span class="act disabled" title="${V(`${Z.reason}: ${Z.detail}`)}">Promote</span></div>`;if(Z.kind==="fresh")switch(Z.reason){case"never-owned":return`<div class="actions"><form method="post" action="/transitions/start"${d("start","Start a session?","This creates a fresh top-level HIVE session, binds it, and runs /awaken seeded with the spec. Confirm to proceed.")}>${Q}<button class="act act-start" title="create a fresh top-level session, bind it, auto-/awaken seeded with the spec (§5.3c)">Start</button></form></div>`;case"spec-changed":return`<div class="actions"><form method="post" action="/transitions/promote"${d("start","Start a fresh session? (spec edited)","The spec was edited after this item was demoted, so promotion creates a FRESH session (the edit is the decision, Q13) — the previous session is not reattached. Confirm to proceed.")}>${Q}<button class="act act-start" title="spec was edited after demote — promotion creates a FRESH session (Q13: the edit is the decision)">Start fresh session (spec edited)</button></form></div>`;case"done-never-owned":return`<div class="actions"><form method="post" action="/transitions/promote"${d("start","Reopen as a fresh session?","This item was marked done without ever owning a session. Promotion un-does the done state (done→todo) and starts a FRESH session (Q16). Confirm to proceed.")}>${Q}<button class="act act-start" title="done without a session — promote un-does the item (done→todo) then starts a fresh session (Q16)">Reopen as fresh session</button></form></div>`}let X=Z.reason==="done-reopen",z=X?"Reopen — re-attach original session":`Re-attach ${i0(Z.sessionID)} (spec unchanged)`;return`<div class="actions"><form method="post" action="/transitions/promote"${X?d("start","Reopen this item?","This re-opens the item and RE-ATTACHES its original owning session by id — a deep link only; /awaken is never re-run (invariant 4). Confirm to proceed."):d("start","Re-attach session?","This re-opens the existing owning session (deep link only; /awaken is not re-run). Confirm to proceed.")}>${Q}<button class="act" title="re-attaches ${V(Z.sessionID)} — deep link only, /awaken is NEVER re-run (invariant 4)">${V(z)}</button></form></div>`}function Z9($,J){if($.status!=="in_progress")return J9($,J);let Z=[],Q=`<input type="hidden" name="id" value="${V($.id)}">`;if(Z.push($.paused?`<form method="post" action="/transitions/unpause">${Q}<button class="act" title="resume — same owning session">Unpause</button></form>`:`<form method="post" action="/transitions/pause">${Q}<button class="act" title="park it; resume the same session later (§5.5)">Pause</button></form>`),Z.push(`<form method="post" action="/transitions/demote"${d("warn","Demote this item?","This detaches and TOMBSTONES the owning session. The idea becomes fluid again and the session will not be reattached. Confirm to proceed.")}>${Q}<select name="to" class="act-select"><option value="todo">todo</option><option value="backlog">backlog</option></select><button class="act act-warn" title="true demote: detach + tombstone the session; the idea is fluid again (§5.5)">Demote</button></form>`),!$.paused)Z.push(`<form method="post" action="/transitions/done-without-dream"${d("warn","Mark done without a dream?","This is a terminal state and skips dreamtime — no artifacts will be linked and no consolidation happens (§5.4). Confirm to proceed.")}>${Q}<button class="act" title="manual done — skips dreamtime, badged no-dream (§5.4)">Done (no dream)</button></form>`);return`<div class="actions">${Z.join("")}</div>`}function o0($){return`<details class="create" data-key="create:${$}"><summary>+ new item</summary>
  <form method="post" action="/transitions/create" class="create-form">
    <input type="hidden" name="status" value="${$}">
    <input name="title" placeholder="title" required>
    <select name="priority"><option value="medium">medium</option><option value="high">high</option><option value="low">low</option></select>
    <input name="tags" placeholder="tags, comma-separated">
    <textarea name="body" rows="3" placeholder="spec / notes (markdown)"></textarea>
    <button type="submit">Create in ${$}</button>
  </form></details>`}function Q9($,J){let{guiBaseUrl:Z,mirror:Q,writesEnabled:W}=J,X=[],z=r0($.owner_session,J);if(z)X.push(z);let q=a0($.owner_session,J);if(q)X.push(q);if($.priority)X.push(`<span class="chip chip-prio-${V($.priority)}">${V($.priority)}</span>`);for(let U of $.tags)X.push(`<span class="chip">${V(U)}</span>`);if($.paused)X.push('<span class="badge badge-paused" title="parked — resume the same session (§5.5)">paused</span>');if($.done_without_dream)X.push('<span class="badge badge-nodream" title="done without a dream — consolidation skipped (§5.4)">no-dream</span>');for(let U of $.problems)X.push(`<span class="badge badge-problem" title="${V(U)}">⚠ invariant</span>`);let K=$.artifacts.length>0?`<div class="cap-desc">produced: ${$.artifacts.map((U)=>`<span class="chip mono">${V(U)}</span>`).join(" ")}${$.dream_id?` <span class="dim mono">(${V($.dream_id)})</span>`:""}</div>`:$.dream_id?`<div class="cap-desc dim mono">dream: ${V($.dream_id)}</div>`:"",Y=$.body?`<details class="spec"><summary>spec</summary><div class="spec-body">${V(n($.body,600))}</div></details>`:"",H=d0($.title,$.owner_session,Q.sessionTitles);return`<div class="card wi ${$.paused?"paused":""}" data-key="wi:${V($.id)}">
    <div class="cap-head">
      <span class="mono dim">${V($.id)}</span>
      <span class="cap-name">${V(n(H,90))}</span>
      ${i6($.owner_session,Z,Q)}
    </div>
    <div class="chips">${X.join(" ")}</div>
    ${a6($.subtasks)}
    ${t6(J.todoSubStates[$.id])}
    ${K}
    ${e6($)}
    ${$9($,Z,Q)}
    ${Y}
    ${W?Z9($,J):""}
  </div>`}function X9($,J){let Z=r0($.id,J),Q=a0($.id,J),W=[Z,Q].filter(Boolean).join(" ");return`<div class="card session-only" data-key="ses:${V($.id)}">
    <div class="cap-head">
      <span class="cap-name">${V(n($.title,80))}</span>
      <a class="open-link" href="${V($.openUrl)}" target="_blank" rel="noopener">Open ↗</a>
    </div>
    ${W?`<div class="chips">${W}</div>`:""}
    <div class="cap-desc mono">${V($.id)}</div>
    <div class="cap-desc dim">session-only — awakened, no work item yet · updated ${t($.updated)}</div>
  </div>`}function Q0($,J,Z=""){return`<div class="col" data-key="col:${V($)}" data-col="${V($)}">
    <div class="col-head"><button type="button" class="col-toggle" data-col-toggle="${V($)}" aria-pressed="false" title="collapse/expand this column (survives refresh)">${V($)} <span class="count">(${J.length})</span><span class="col-toggle-icon" aria-hidden="true">▾</span></button></div>
    <div class="col-body">
      ${Z}
      ${J.length===0?'<div class="empty">—</div>':J.join(`
`)}
    </div>
  </div>`}function W9($){let J=$.map((Z)=>{let Q=Array.isArray(Z.tags)?Z.tags:[];return{id:Z.id,status:Z.status,title:Z.title??"",tags:Q,hay:`${Z.id} ${Z.title??""} ${Q.join(" ")} ${Z.body??""}`.toLowerCase()}});return JSON.stringify(J).replaceAll("</","<\\/")}function q9($,J,Z){let Q=(q)=>Q9(q,J),W=[...$.inProgress.map((q)=>({key:h(q),tie:q.id,html:Q(q)})),...$.sessionOnly.map((q)=>({key:q.updated,tie:q.id,html:X9(q,J)}))];W.sort((q,K)=>q.key!==K.key?K.key.localeCompare(q.key):K.tie.localeCompare(q.tie));let X=W.map((q)=>q.html);return`${`<script id="filter-corpus" type="application/json" data-key="filter:corpus">${W9(Z)}</script>`}<div class="kanban">
    ${Q0("Backlog",$.backlog.map(Q),J.writesEnabled?o0("backlog"):"")}
    ${Q0("Todo",$.todo.map(Q),J.writesEnabled?o0("todo"):"")}
    ${Q0("In Progress",X)}
    ${Q0("Done",$.done.map(Q))}
  </div>`}var s0=`
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
`;function t0($){let J=new Map,Z=0;for(let K of $.items){let Y=Array.isArray(K.tags)?K.tags:[];if(Y.length===0)Z++;for(let H of Y)J.set(H,(J.get(H)??0)+1)}let Q=[...J.entries()].sort((K,Y)=>Y[1]-K[1]||K[0].localeCompare(Y[0])),W=(K,Y,H)=>`<button type="button" class="tag-chip" data-tag="${V(K)}" title="${V(H)}">${V(Y)}</button>`,X=12,z=Q.slice(0,X),q=Q.slice(X);return`<div id="board-controls">
  <div id="controls-row">
    <button type="button" id="controls-toggle" aria-expanded="true" aria-controls="controls-panel" title="collapse/expand the filter/tag controls">filters ▴</button>
    <input id="filter-q" type="search" placeholder="filter — id, title, tag, spec…" autocomplete="off" spellcheck="false" aria-label="filter work items">
    <span id="controls-summary" title="active filter — tap “filters” to change it"></span>
  </div>
  <div id="controls-panel">
    <div id="filter-bar" role="search">
      <div id="filter-tags" role="group" aria-label="filter by tag">
        ${z.map(([K,Y])=>W(K,`${K} ${Y}`,`${Y} item${Y===1?"":"s"} tagged ${K} — tap to filter`)).join(`
        `)}
        ${q.length>0?`<details id="filter-tags-more"><summary>+${q.length} more tags</summary><div class="tag-tail">${q.map(([K,Y])=>W(K,`${K} ${Y}`,`${Y} item${Y===1?"":"s"} tagged ${K} — tap to filter`)).join(`
        `)}</div></details>`:""}
        ${W("__untagged__",`untagged ${Z}`,"show ONLY items with no tags — the tagging-backlog hunting set (W-019)")}
      </div>
      <button type="button" id="filter-clear" title="clear search text and all tag filters" hidden>clear</button>
    </div>
    <div id="collapse-strip" aria-label="collapse/expand columns">
      ${["Backlog","Todo","In Progress","Done"].map((K)=>`<button type="button" class="col-toggle" data-col-toggle="${V(K)}" title="collapse/expand the ${V(K)} column">${V(K)} <span class="col-toggle-icon" aria-hidden="true">▾</span></button>`).join(`
      `)}
    </div>
  </div>
</div>`}function e0($,J=[]){let{dreams:Z,messages:Q}=$,W={guiBaseUrl:$.guiBaseUrl,mirror:$.sessions,writesEnabled:$.writesEnabled,sessionBackend:$.sessionBackend,decisions:$.promoteDecisions,todoSubStates:$.todoSubStates,actionRequired:$.actionRequired,sessionStatus:$.sessionStatus},X=J.length===0?"":`<div class="notices">${J.map((q)=>`<div class="notice"><span class="mono dim">${t(q.at)}</span> ${V(q.text)}</div>`).join("")}</div>`;return`${`<div class="meta mono">workspace ${V($.workspaceRoot)} · generated ${V($.generatedAt)} · live refresh 15s · ${n6($.buildSha)}</div>`}
<h2>Board <span class="count">(${$.items.length} items · ${$.board.sessionOnly.length} session-only)</span> <span id="filter-count" class="count" title="how many work items the current filter shows / total — updated live by the filter bar"></span></h2>
${X}
${q9($.board,W,$.items)}
${$.writesEnabled?"":'<div class="meta">read-only view — the board write path stays sealed behind the hive_board_* tools (WI-062)</div>'}`}function z9($){let J=$.tagName;return J==="INPUT"||J==="TEXTAREA"||J==="SELECT"}function V9($){let J=$.ownerDocument.activeElement??null;if(!J||!$.contains(J))return null;let Z=null,Q=null;if(J instanceof HTMLInputElement||J instanceof HTMLTextAreaElement)try{Z=J.selectionStart,Q=J.selectionEnd}catch{}return{key:Y9(J,$),name:J.getAttribute("name"),start:Z,end:Q}}function Y9($,J){let Z=$;while(Z&&Z!==J){let Q=Z.getAttribute("data-key");if(Q)return Q;Z=Z.parentElement}return null}function K9($,J){if(!J)return;let Z=J.key!==null?$.querySelector(`[data-key="${$6(J.key)}"]`)??$:$,Q=J.name?`[name="${$6(J.name)}"]`:null,W=Q?Z.querySelector(Q):null;if(W instanceof HTMLElement){if(W.focus(),(W instanceof HTMLInputElement||W instanceof HTMLTextAreaElement)&&J.start!==null)try{W.setSelectionRange(J.start,J.end??J.start)}catch{}}}function $6($){return $.replace(/["\\]/g,"\\$&")}function Z6($,J){let Z=V9($);Q6($,J,!0),K9($,Z)}function Q6($,J,Z=!1){if($.tagName!==J.tagName){$.replaceWith(J);return}j9($,J,Z),U9($,J)}function j9($,J,Z=!1){let Q=$.tagName==="DETAILS",W=z9($);for(let X of Array.from(J.attributes)){if(Q&&X.name==="open")continue;if(W&&X.name==="value")continue;if($.getAttribute(X.name)!==X.value)$.setAttribute(X.name,X.value)}if(!Z)for(let X of Array.from($.attributes)){if(Q&&X.name==="open")continue;if(W&&X.name==="value")continue;if(!J.hasAttribute(X.name))$.removeAttribute(X.name)}}function P0($){return $ instanceof Element?$.getAttribute("data-key"):null}function U9($,J){let Z=Array.from($.childNodes),Q=Array.from(J.childNodes),W=new Map;for(let z of Z){let q=P0(z);if(q!==null)W.set(q,z)}let X=0;for(let z of Q){let q=P0(z);if(q!==null&&W.has(q)){let Y=W.get(q);W.delete(q);let H=$.childNodes[X];if(H!==Y)$.insertBefore(Y,H??null);J6(Y,z),X=M9($,Y)+1;continue}let K=$.childNodes[X]??null;if(K&&P0(K)===null&&G9(K,z))J6(K,z),X++;else $.insertBefore(z.cloneNode(!0),K),X++}while($.childNodes.length>X)$.removeChild($.childNodes[X])}function M9($,J){return Array.prototype.indexOf.call($.childNodes,J)}function G9($,J){if($.nodeType!==J.nodeType)return!1;if($.nodeType===Node.ELEMENT_NODE)return $.tagName===J.tagName;return!0}function J6($,J){if($.nodeType===Node.ELEMENT_NODE&&J.nodeType===Node.ELEMENT_NODE){Q6($,J);return}if($.nodeType===Node.TEXT_NODE||$.nodeType===Node.COMMENT_NODE){if($.nodeValue!==J.nodeValue)$.nodeValue=J.nodeValue;return}$.replaceWith(J.cloneNode(!0))}var B9=["Backlog","Todo","In Progress","Done"],y={q:"hb.filter.q",tags:"hb.filter.tags",collapsed:"hb.collapsed",controls:"hb.controls.collapsed"};function H9(){try{return typeof window.matchMedia==="function"?window.matchMedia("(max-width:640px)").matches:!1}catch{return!1}}function i($){try{return window.localStorage.getItem($)}catch{return null}}function o($,J){try{window.localStorage.setItem($,J)}catch{}}function P9(){try{return new Set(JSON.parse(i(y.tags)??"[]"))}catch{return new Set}}function O9(){try{return new Set(JSON.parse(i(y.collapsed)??"[]"))}catch{return new Set}}function F9(){let $=i(y.controls);if($==="collapsed")return!0;if($==="expanded")return!1;return H9()}var j={q:i(y.q)??"",tags:P9(),collapsed:O9(),controlsCollapsed:F9()},f=[];function _9(){let $=document.getElementById("filter-corpus");if(!$||!$.textContent)return f;try{let J=JSON.parse($.textContent);return Array.isArray(J)?J:f}catch{return f}}var T="__untagged__";function N9($){let J=j.tags.has(T),Z=[...j.tags].filter((Q)=>Q!==T);if(J&&$.tags.length>0)return!1;if(!J){for(let Q of Z)if(!$.tags.includes(Q))return!1}else if(Z.length>0)return!1;if(j.q){let Q=j.q.toLowerCase();if(!$.hay.includes(Q))return!1}return!0}function e(){f=_9();let $=new Map;for(let X of f)$.set(X.id,N9(X));let J=j.q!==""||j.tags.size>0,Z=0,Q=0;for(let X of Array.from(document.querySelectorAll(".card.wi"))){let z=X.getAttribute("data-key")??"",q=z.startsWith("wi:")?z.slice(3):"",K=!J||$.get(q)===!0;if(X.classList.toggle("filter-hidden",!K),J)if(K)Z++;else Q++}for(let X of Array.from(document.querySelectorAll(".card.session-only")))X.classList.toggle("filter-dim",J);let W=document.getElementById("board-root");if(W)W.classList.toggle("filter-empty",J&&f.length>0&&Z===0);x9(J,Z,Q),L9(J,Z),E9()}function D9(){let $=[...j.tags].filter((X)=>X!==T);if($.length<2)return null;if(j.tags.has(T))return null;let J=j.q.toLowerCase(),Z=(X)=>J===""||X.hay.includes(J),Q=$.map((X)=>f.filter((z)=>z.tags.includes(X)&&Z(z)).length);if(Q.some((X)=>X===0))return null;return`no items have all of: ${$.map((X,z)=>`${X} (${Q[z]})`).join(" + ")} — each has matches individually`}function x9($,J,Z){let Q=document.getElementById("filter-count");if(!Q)return;let W=f.length,X=f.filter((z)=>z.tags.length===0).length;if(W===0){Q.textContent="· board is empty",Q.title="no work items on the board at all";return}if(!$){Q.textContent=`· ${W} items · ${X} untagged`,Q.title=`${X} of ${W} items carry no tags — the set a tag filter cannot reach (tap "untagged" to list them)`;return}if(J===0){let z=[...j.tags].filter((K)=>K!==T);if(j.tags.has(T)&&z.length>0){Q.textContent="· nothing can match — untagged + a tag is empty by definition",Q.title=`the untagged filter lists ONLY items with no tags, and ${z.join(" + ")} require${z.length===1?"s":""} a tag. Drop one of them.`;return}let q=D9();if(q){Q.textContent=`· ${q} — ${Z} hidden`,Q.title=`the AND-combination is empty: no single item carries every selected tag. Remove one tag to widen the result. ${X} item${X===1?"":"s"} on the board carry no tags.`;return}Q.textContent=Z>0?`· no items match — ${Z} hidden`:"· no items match",Q.title=`the filter hid all ${Z} item${Z===1?"":"s"}. ${X} item${X===1?"":"s"} on the board carry no tags and can only be reached via the "untagged" filter or free text.`}else Q.textContent=`· showing ${J}/${W} · ${X} untagged`,Q.title=`${Z} hidden by the filter · ${X} of ${W} items carry no tags`}function A9($,J){if(!$)return{text:"no filter active",tags:[],untaggedActive:!1};let Z=[...j.tags].filter((q)=>q!==T).sort(),Q=j.tags.has(T),W=j.q!==""?`“${j.q}”`:"",X=`showing ${J}/${f.length}`,z=[W,...Z,...Q?["untagged"]:[]];return{text:z.length>0?`${z.join(" + ")} · ${X}`:X,tags:Z,untaggedActive:Q}}function L9($,J){let Z=document.getElementById("controls-summary");if(!Z)return;let{text:Q,tags:W,untaggedActive:X}=A9($,J);if(Z.textContent="",Z.classList.toggle("has-filter",$),!$){Z.textContent=Q;return}let z=[...W,...X?[T]:[]],q=z.length,K=()=>{if(Z.textContent="",j.q!==""){let U=document.createElement("span");U.className="summary-q",U.textContent=`“${j.q}”`,Z.appendChild(U)}for(let U of z.slice(0,q)){let D=document.createElement("span");if(D.className="tag-chip active",U===T)D.setAttribute("data-tag",T);if(D.textContent=U===T?"untagged":U,q===1)D.classList.add("summary-chip-shrink");Z.appendChild(D)}let Y=z.length-q;if(Y>0){let U=document.createElement("span");U.className="summary-more",U.textContent=`+${Y} more`,U.title=`${Y} more active tag${Y===1?"":"s"}: ${z.slice(q).join(", ")} — tap “filters” to expand`,Z.appendChild(U)}let H=document.createElement("span");H.className="summary-n",H.textContent=`${J}/${f.length}`,Z.appendChild(H)};K();while(q>1&&Z.scrollWidth>Z.clientWidth)q--,K();Z.title=Q}function E9(){let $=document.getElementById("filter-q");if($&&$.value!==j.q)$.value=j.q;let J=document.getElementById("filter-clear");if(J)if(j.q!==""||j.tags.size>0)J.removeAttribute("hidden");else J.setAttribute("hidden","");for(let Z of Array.from(document.querySelectorAll("#filter-tags .tag-chip"))){let Q=Z.getAttribute("data-tag")??"";Z.classList.toggle("active",j.tags.has(Q)),Z.setAttribute("aria-pressed",j.tags.has(Q)?"true":"false")}for(let Z of Array.from(document.querySelectorAll("[data-col-toggle]"))){let Q=Z.getAttribute("data-col-toggle")??"";Z.setAttribute("aria-pressed",j.collapsed.has(Q)?"true":"false")}}function F0(){for(let $ of B9){let J=j.collapsed.has($),Z=document.querySelector(`.col[data-col="${X6($)}"]`);if(Z)Z.classList.toggle("collapsed",J);for(let Q of Array.from(document.querySelectorAll(`[data-col-toggle="${X6($)}"]`)))Q.setAttribute("aria-pressed",J?"true":"false")}}function X6($){return $.replace(/["\\]/g,"\\$&")}function k9($){if(j.collapsed.has($))j.collapsed.delete($);else j.collapsed.add($);o(y.collapsed,JSON.stringify([...j.collapsed])),F0()}function X0(){let $=document.getElementById("board-controls");if(!$)return;let J=j.controlsCollapsed;$.classList.toggle("controls-collapsed",J);let Z=document.getElementById("controls-toggle");if(Z)Z.setAttribute("aria-expanded",J?"false":"true"),Z.textContent=J?"filters ▾":"filters ▴",Z.title=J?"expand the filter/tag controls":"collapse the filter/tag controls"}function C9(){j.controlsCollapsed=!j.controlsCollapsed,o(y.controls,j.controlsCollapsed?"collapsed":"expanded"),X0()}function R9($){let J=$.target;if(!J)return;if(J.closest("#controls-toggle")){$.preventDefault(),C9();return}let Z=J.closest("[data-col-toggle]");if(Z){let W=Z.getAttribute("data-col-toggle");if(W)$.preventDefault(),k9(W);return}let Q=J.closest("#filter-tags .tag-chip");if(Q){let W=Q.getAttribute("data-tag");if(W){if(j.tags.has(W))j.tags.delete(W);else j.tags.add(W);o(y.tags,JSON.stringify([...j.tags])),e()}return}if(J.closest("#filter-clear"))j.q="",j.tags.clear(),o(y.q,""),o(y.tags,"[]"),e()}function I9($){let J=$.target;if(!J||J.id!=="filter-q")return;j.q=J.value,o(y.q,j.q),e()}var O0=!1;function W6(){if(O0)return;if(O0=!0,document.addEventListener("click",R9),document.addEventListener("input",I9),X0(),F0(),e(),i(y.controls)===null&&typeof window.matchMedia==="function")try{let $=window.matchMedia("(max-width:640px)"),J=(Z)=>{if(i(y.controls)!==null)return;j.controlsCollapsed=Z.matches,X0()};if(typeof $.addEventListener==="function")$.addEventListener("change",J);else if(typeof $.addListener==="function")$.addListener(J)}catch{}}function q6(){if(!O0)return;X0(),F0(),e()}q0();var g9=30000,P6="hvb-favicon",h9="data-plugin-favicon",u9=34;function I0($){let J=typeof $?.runningAgents==="number"&&isFinite($.runningAgents)&&$.runningAgents>0?Math.floor($.runningAgents):0,Z=typeof $?.hiveRunningAgents==="number"&&isFinite($.hiveRunningAgents)&&$.hiveRunningAgents>0?Math.floor($.hiveRunningAgents):0;if(J<=0)return{tier:"quiet",running:0,hive:0};return Z>0?{tier:"hive",running:J,hive:Z}:{tier:"ambient",running:J,hive:0}}function O6($){let{running:J}=I0($);return J>0?{session:"active",dreaming:!1,count:J}:{session:"quiet",dreaming:!1,count:0}}var w9="#d29922",p9="#866d3c";function F6($){return $.split(w9).join(p9)}var C0=!1,B6="";function m9($){let J=document.getElementById(P6);if(!J)return;let Z=O6($),{tier:Q}=I0($),W=Q==="ambient"?F6(H0(Z)):H0(Z),X="data:image/svg+xml,"+encodeURIComponent(W);if(X===B6)return;B6=X,J.setAttribute("href",X)}async function R0(){try{let $=await fetch(T0,{headers:{accept:"application/json"}});if(!$.ok)return;let J=await $.json();if(!J||typeof J!=="object"||J.ok!==!0)return;let Q=y0(J).activity;m9(Q),S0(Q)}catch{}}function r(){if(!document.hidden)R0()}var H6="";function S0($){let J=document.getElementById("hvb-panel-mark");if(!J)return;let Z=O6($),{tier:Q,running:W,hive:X}=I0($),z=`${Q}:${Z.count}`;if(z===H6)return;H6=z;let q=typeof $?.sampledAt==="string"?$.sampledAt.slice(0,16).replace("T"," "):"?",K=Q==="hive"?`${W} HIVE agent${W===1?"":"s"} running`:Q==="ambient"?`${W} other agent${W===1?"":"s"} running · no HIVE session active`:"quiet — nothing running";J.innerHTML=F6(B0(Z,{idPrefix:"hvbp",animate:!0,size:u9}));let Y=J.querySelector("svg");if(Y){let H=document.createElementNS("http://www.w3.org/2000/svg","title");H.textContent=`${K} · sampled ${q} UTC (may lag one poll cycle)`,Y.insertBefore(H,Y.firstChild)}}function _6($){if(C0)return;if(typeof document>"u")return;C0=!0,$.effect(()=>{let Z=document.querySelector('link[rel="icon"]'),Q=document.createElement("link");return Q.id=P6,Q.rel="icon",Q.type="image/svg+xml",Q.setAttribute(h9,"@hive/dsh-board"),document.head.appendChild(Q),R0(),document.addEventListener("visibilitychange",r),window.addEventListener("pageshow",r),window.addEventListener("focus",r),()=>{if(Q.remove(),Z)Z.setAttribute("href",Z.getAttribute("href")??"");document.removeEventListener("visibilitychange",r),window.removeEventListener("pageshow",r),window.removeEventListener("focus",r),C0=!1}},"board favicon driver");let J=$.interval;if(typeof J==="function")J(()=>{R0()},g9);else console.error("[@hive/dsh-board] favicon driver: no interval service — cadence degraded to refresh-on-visible")}var N6={high:0,medium:1,low:2};function b0($){return[...$].sort((J,Z)=>{let Q=N6[J.priority],W=N6[Z.priority];if(Q!==W)return Q-W;let X=h(J),z=h(Z);if(X!==z)return z.localeCompare(X);return Z.id.localeCompare(J.id)})}function D6($,J){let Z=h($),Q=h(J);if(Z!==Q)return Q.localeCompare(Z);return J.id.localeCompare($.id)}function x6($,J){let Z=new Set;for(let Q of $){if(Q.owner_session)Z.add(Q.owner_session);for(let W of Q.released_sessions)Z.add(W)}return{backlog:b0($.filter((Q)=>Q.status==="backlog")),todo:b0($.filter((Q)=>Q.status==="todo")),inProgress:$.filter((Q)=>Q.status==="in_progress").sort(D6),done:$.filter((Q)=>Q.status==="done").sort(D6),sessionOnly:J.cards.filter((Q)=>!Z.has(Q.id))}}var T0="/api/hive-board/index",c9=15000,z0="34a37e2-dirty";function d9($){if(!$||$==="unknown"||z0==="unknown")return"unknown";return $===z0?"match":"mismatch"}function l9($){let J=document.getElementById("build-badge");if(!J)return;if(d9($)==="mismatch")J.classList.add("stale"),J.textContent=`stale client — reload (bundle ${z0} ≠ host ${$})`,J.setAttribute("title",`this tab is running an old client bundle (built ${z0}) against a newer host build (${$}). Reload the page to get the current bundle.`);else J.classList.remove("stale")}var A6={available:!1,computedAt:"",totalPersisted:0,awakeIds:0,awakeDeleted:0,cards:[],persistedIds:[]},n9={artifactCounts:{insight:0,warning:0,songline:0,shadow:0,total:0},active:[],history:[],recentArtifacts:[]};function o9($){return{...$,tags:Array.isArray($.tags)?$.tags:[],subtasks:Array.isArray($.subtasks)?$.subtasks:[],todo_mirror:Array.isArray($.todo_mirror)?$.todo_mirror:[],transitions:Array.isArray($.transitions)?$.transitions:[],released_sessions:Array.isArray($.released_sessions)?$.released_sessions:[],artifacts:Array.isArray($.artifacts)?$.artifacts:[],problems:Array.isArray($.problems)?$.problems:[],status:$.status,priority:$.priority,origin:$.origin}}function y0($){let J=(Array.isArray($.items)?$.items:[]).map(o9);return{generatedAt:typeof $.generated==="string"?$.generated:"",workspaceRoot:typeof $.workspaceRoot==="string"?$.workspaceRoot:"(unknown workspace)",buildSha:typeof $.boardBuild==="string"&&$.boardBuild!==""?$.boardBuild:"unknown",activity:$.activity,guiBaseUrl:"",capabilities:[],dreams:n9,messages:[],items:J,board:x6(J,{...A6}),writesEnabled:!1,sessionBackend:"unconfigured",promoteDecisions:{},sessions:{...A6},todoSubStates:{},actionRequired:{},sessionStatus:{}}}var i9=null,k6="";function r9($){let J=document.createElement("main");return J.id="board-root",J.innerHTML=e0($),J}function a9($){let J=document.getElementById("board-root");if(!J)return;Z6(J,r9($)),l9($.buildSha),q6()}async function f0(){try{let $=await fetch(T0,{headers:{accept:"application/json"}});if(!$.ok)return;let J=await $.json();if(!J||typeof J!=="object"||J.ok!==!0)return;if(!Array.isArray(J.items))return;let Z=y0(J);i9=Z,k6=Z.buildSha,S0(Z.activity),s9(Z),a9(Z)}catch{}}var L6=!1;function s9($){if(L6)return;let J=document.getElementById("board-controls-host");if(!J)return;J.innerHTML=t0($),L6=!0}function v0(){if(document.hidden)return;f0()}document.addEventListener("visibilitychange",v0);window.addEventListener("pageshow",v0);window.addEventListener("focus",v0);var E6=!1;function C6($){if(W6(),L0(),!E6){E6=!0;let J=$.interval;if(typeof J==="function")J(()=>{f0()},c9);else console.error("[@hive/dsh-board] no interval service — poll cadence degraded to refresh-on-visible")}f0()}q0();var R6="/api/hive-state/session";function I6($,J){let Z=[];for(let Q of Object.values($?.byId??{}))if(Q&&Q.parentId===J&&Q.running===!0)Z.push(Q);return Z}function S6($,J){let Z=[];for(let Q of Object.values($?.byId??{}))if(Q&&Q.parentId===J)Z.push(Q);return Z}function T6($){if(!$)return[];let J=[],Z=$.hive;if(Z?.isCoordinator){let Q=Z.lastAwakenInput?` — "${Z.lastAwakenInput}"`:"";J.push({ts:Z.awakenedAt??null,kind:"awaken",text:`awakened as ${Z.agent??"unknown"}${Q}`})}for(let Q of $.usageMarks??[])J.push({ts:Q.timestamp,kind:"registered",text:`registered — dispatched as ${Q.capability}`});for(let Q of $.dreamEvents??[])J.push({ts:Q.ts,kind:"dream",text:`dream archive ${Q.tool}`});for(let Q of $.children??[]){let W=Q.capability?` as ${Q.capability}`:"",X=Q.label?` — "${Q.label}"`:"";J.push({ts:Q.createdAtMs?new Date(Q.createdAtMs).toISOString():null,kind:"dispatched",text:`child dispatched${W}${X} (${Q.mode})`})}if($.goal?.createdAt){let Q=typeof $.goal.roundsStarted==="number"?`, round ${$.goal.roundsStarted}`:"";J.push({ts:$.goal.createdAt,kind:"goal",text:`goal set · ${String($.goal.status??"")}${Q}`})}return J.sort((Q,W)=>new Date(W.ts||0).getTime()-new Date(Q.ts||0).getTime())}function g0($){let{payload:J,routeReachable:Z,pageRunning:Q}=$,W=J?.hive?.isCoordinator===!0;if(Q===!0||Z&&t9(J))return{stage:"working",tone:"live"};if(J===void 0)return{stage:"dormant",tone:"unknown"};if(W)return{stage:"awakened",tone:"hive"};if((J.usageMarks?.length??0)>0)return{stage:"registered",tone:"ambient"};if(J.live===!0)return{stage:"idle",tone:"ambient"};return{stage:"dormant",tone:"ambient"}}function t9($){if(!$)return!1;let J=$.idBare;for(let Z of $.agents??[])if(Z.id===$.id||e9(Z.id)===J)return Z.status==="running";return!1}function e9($){return $.startsWith("session-")?$.slice(8):$}function h0($,J){if(!$)return"";let Z=J-new Date($).getTime();if(!isFinite(Z)||Z<0)return"";if(Z<45000)return"seconds";if(Z<3600000)return`${Math.max(1,Math.round(Z/60000))}m`;if(Z<86400000)return`${Math.round(Z/3600000)}h`;return`${Math.round(Z/86400000)}d`}function J0($){if(!$)return"—";let J=new Date($);if(isNaN(J.getTime()))return String($);return J.toISOString().slice(0,16).replace("T"," ")}function V0($){if(!$)return"";let J=Date.now()-new Date($).getTime();if(!isFinite(J))return"";if(J<45000)return"now";if(J<3600000)return`${Math.round(J/60000)}m ago`;if(J<86400000)return`${Math.round(J/3600000)}h ago`;return`${Math.round(J/86400000)}d ago`}async function y6($){let J=await fetch(`/api/hive-board/session-item?id=${encodeURIComponent($)}`,{cache:"no-store"});if(!J.ok)throw Error(`route ${J.status}`);let Z=await J.json();if(Z?.ok===!1)throw Error("bad request");return Z.item??null}async function $2($){let J=await fetch(`${R6}?id=${encodeURIComponent($)}`,{cache:"no-store"});if(!J.ok)throw Error(`route ${J.status}`);return await J.json()}var f6=`
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
`;function M($,J,Z){let Q=document.createElement($);if(J)Q.className=J;if(Z!==void 0)Q.textContent=Z;return Q}var J2="hvs-timeline-panel";async function Z2($,J){let Z=$&&$.layout;if(Z&&typeof Z.selectPanel==="function"){try{Z.selectPanel("hive-board")}catch{}for(let W=0;W<40;W++){if(document.querySelector(".hvb-root"))break;await new Promise((X)=>setTimeout(X,60))}}let{openDrawer:Q}=await Promise.resolve().then(() => (q0(),G6));return await Q(J),"drawer"}var Q2={awaken:"◈",registered:"◇",working:"▶",idle:"⏸",done:"■",dispatched:"⇗",returned:"⇙",goal:"◎",dream:"☾"};function v6($,J){let Z=J;return function(W){let X=typeof W.sessionId==="string"?W.sessionId:"",z=typeof W.useSessions==="function"?W.useSessions:void 0,[q,K]=Z.useState(void 0),[Y,H]=Z.useState(!1),[U,D]=Z.useState(!1),[F,P]=Z.useState({item:null,pending:!0}),_=Z.useRef(!1);_.current=U;let[C,E]=Z.useState([]),[A,R]=Z.useState(Date.now()),b=Z.useRef(void 0),I=Z.useRef(""),w=Z.useRef(new Map),p=Z.useRef(!1),B=Z.useRef(null),L=z?z((O)=>O):void 0,u=L?.byId??{},m=X?u[X]:void 0,l=m?m.running===!0:void 0,Y0=I6(L,X),K0=S6(L,X);if(Z.useEffect(()=>{let O=b.current;if(O!==void 0&&O!==l){let N={ts:new Date().toISOString(),kind:l?"working":"idle",text:l?"working — turn started (observed)":"idle — turn ended (observed)",observed:!0};E((v)=>[N,...v].slice(0,40))}b.current=l;for(let N of K0){if(w.current.get(N.id)===!0&&N.running!==!0){let x={ts:new Date().toISOString(),kind:"returned",text:`child returned — ${String(N.displayTitle??N.title??N.id).slice(0,40)} (observed)`,observed:!0};E((U0)=>[x,...U0].slice(0,40))}w.current.set(N.id,N.running===!0)}let S=q?.goal;if(S){let N=`${S.roundsStarted??"?"}/${S.status??"?"}`;if(I.current!==""&&I.current!==N){let v={ts:S.updatedAt??new Date().toISOString(),kind:"goal",text:`goal → round ${S.roundsStarted??"—"} · ${S.status??""} (observed)`,observed:!0};E((x)=>[v,...x].slice(0,40))}I.current=N}if(X){let N=u[X]!==void 0;if(p.current&&!N){let v={ts:new Date().toISOString(),kind:"done",text:"done — session removed from the live session list (observed)",observed:!0};E((x)=>[v,...x].slice(0,40))}p.current=N}},[l,K0,X,u,q?.goal]),Z.useEffect(()=>{if(!X)return;let O=!1,S,N=()=>{if($2(X).then((x)=>{if(O)return;H(x?.ok===!1),K(x.ok===!1?void 0:x)}).catch(()=>{if(O)return;H(!0)}).finally(()=>{if(!O)S=setTimeout(N,6000)}),!_.current)return;y6(X).then((x)=>{if(O)return;P({item:x,pending:!1})}).catch(()=>{if(O)return;P((x)=>({...x,pending:!1,error:!0}))})};return N(),(()=>{y6(X).then((x)=>{if(!O)P({item:x,pending:!1})}).catch(()=>{if(!O)P((x)=>({...x,pending:!1,error:!0}))})})(),()=>{if(O=!0,S)clearTimeout(S)}},[X,U]),Z.useEffect(()=>{if(!U||!X)return;let O=document.body.appendChild(M("div","hvs-panel"));O.id=J2;let S=()=>{if(!O.isConnected)return;O.innerHTML="",W2(O,{sessionId:X,data:q,fetchFailed:Y,row:m,kids:Y0,kidsAll:K0,eventNotes:C,nowTick:A,itemCard:F,pluginCtx:$,onClose:()=>D(!1)});let c=B.current?.getBoundingClientRect();if(c){let Z0=Math.max(8,c.top-O.offsetHeight-10);O.style.top=`${Z0}px`,O.style.left=`${Math.min(Math.max(8,c.right-O.offsetWidth),window.innerWidth-O.offsetWidth-8)}px`}};S();let N=()=>S();window.addEventListener("resize",N),window.addEventListener("scroll",N,!0);let v=(c)=>{let Z0=c.target;if(!O.contains(Z0)&&B.current&&!B.current.contains(Z0))D(!1)},x=(c)=>{if(c.key==="Escape")D(!1)};document.addEventListener("click",v,!0),document.addEventListener("keydown",x);let U0=setInterval(()=>R(Date.now()),1000);return()=>{window.removeEventListener("resize",N),window.removeEventListener("scroll",N,!0),document.removeEventListener("click",v,!0),document.removeEventListener("keydown",x),clearInterval(U0),O.remove()}},[U,X,q,Y,m,C,A]),!X)return null;let j0=g0({payload:Y?void 0:q,routeReachable:!Y,pageRunning:l}),u0=Y?null:q?.goal?.roundsStarted,w0=Y?"":q?.hive?.isCoordinator===!0?"hive":"ambient";return Z.createElement("span",{className:"hvs-pill","data-tone":j0.tone,"data-slot-hive-state":X,role:"button","aria-expanded":U?"true":"false",ref:(O)=>{B.current=O},onClick:()=>D((O)=>!O),title:"HIVE state of this session (WI-083, read-only)"},Z.createElement("span",{className:"hvs-dot","data-dot":j0.tone}),Z.createElement("span",{className:"hvs-word"},`hive · ${Y?"route pending":j0.stage}`),u0?Z.createElement("span",{className:"hvs-badge"},`r${u0}`):null,Y0.length>0?Z.createElement("span",{className:"hvs-badge"},`+${Y0.length}`):null,w0?Z.createElement("span",{className:"hvs-badge"},w0):null)}}function b6($,J){for(let Z of $)if(Z.kind===J&&Z.ts)return Z.ts;return null}function X2($,J){let Z=null,Q=(W)=>{if(!W)return;let X=new Date(W).getTime();if(isFinite(X)&&(Z===null||X>Z))Z=X};Q(J?.updatedAt?new Date(J.updatedAt).toISOString():void 0),Q($?.goal?.updatedAt),Q($?.hive?.awakenedAt),Q($?.generated);for(let W of $?.usageMarks??[])Q(W.timestamp);for(let W of $?.dreamEvents??[])Q(W.ts);for(let W of $?.children??[])Q(W.createdAtMs?new Date(W.createdAtMs).toISOString():null);if(J?.updatedAt&&(Z===null||J.updatedAt>Z))Z=J.updatedAt;return Z===null?null:new Date(Z).toISOString()}function W2($,J){let Z=String(J.row?.displayTitle??J.row?.title??J.sessionId.slice(0,12)),Q=M("div","hvs-head"),W=M("div","hvs-title");W.textContent=`HIVE state — ${Z}`,Q.appendChild(W);let X=M("button","hvs-close","✕");X.addEventListener("click",()=>J.onClose()),Q.appendChild(X),$.appendChild(Q);let z=g0({payload:J.fetchFailed?void 0:J.data,routeReachable:!J.fetchFailed,pageRunning:J.row?J.row.running===!0:void 0}),q=M("div","hvs-stage");if(J.fetchFailed)q.setAttribute("data-live","0");else q.setAttribute("data-live",z.tone==="live"?"1":"0");let K=M("span","hvs-now",J.fetchFailed?"stage unknown":`now: ${z.stage}`);q.appendChild(K);let Y=b6(J.eventNotes,"working");if(z.stage==="working"){let B=Y?h0(Y,J.nowTick):"";q.appendChild(M("span","hvs-dur",B?`${B} so far`:"in progress — enter time not observed"))}let H=X2(J.fetchFailed?void 0:J.data,J.row);q.appendChild(M("span","hvs-sig",`latest signal ${J0(H)} · ${V0(H)}`)),$.appendChild(q);let U=M("div","hvs-card-wrap");if(J.itemCard.pending)U.appendChild(M("div","hvs-card-empty","attached board item — loading…"));else if(J.itemCard.error)U.appendChild(M("span","hvs-flag","board pairing unavailable — is the board route live yet?"));else if(J.itemCard.item){let B=M("div","hvs-card");B.setAttribute("role","button"),B.setAttribute("title",`Open ${J.itemCard.item.id} in the HIVE Board tab`);let L=M("div","hvs-card-top");L.appendChild(M("span","hvs-card-id",J.itemCard.item.id)),L.appendChild(M("span","hvs-card-status",J.itemCard.item.status)),L.appendChild(M("span","hvs-card-prio",J.itemCard.item.priority)),B.appendChild(L);let u=M("div","hvs-card-title",J.itemCard.item.title);B.appendChild(u),B.addEventListener("click",()=>{Z2(J.pluginCtx,J.itemCard.item.id)}),U.appendChild(B)}else U.appendChild(M("div","hvs-card-empty","no attached in-progress board item (owner/group match found none)"));$.appendChild(U);let D=M("div","hvs-meta"),F=J.data?.hive,P=M("div");if(J.fetchFailed)P.appendChild(M("span","hvs-flag","host route not live yet — the timeline needs the next dsh-web bounce (route shipped in @hive/dsh-evolution, read-only)"));else if(F?.isCoordinator)P.appendChild(M("span","hvs-hive","HIVE coordinator")),P.appendChild(document.createTextNode(` — ${F.agent??"unknown"} · awakened ${J0(F.awakenedAt)} (${V0(F.awakenedAt)})`));else P.appendChild(M("span","","not an awakened coordinator"));D.appendChild(P);let _=J.data?.live,C=M("div");C.appendChild(document.createTextNode(J.fetchFailed?"host truth: unknown (route pending)":`host truth: ${_===!0?"live on this host":"not live on this host"} · ${J.data?.runningAgents??0} agents running`)),D.appendChild(C);let E=J.data?.goal,A=M("div");if(E){let B=E.objective&&E.objective.length>90?`${E.objective.slice(0,90)}…`:E.objective;if(A.appendChild(M("b","",`goal · round ${E.roundsStarted??"—"} · ${E.status??""}`)),B)A.appendChild(document.createTextNode(` — ${B}`))}else if(!J.fetchFailed&&J.data?.goalReason==="no-live-agent")A.appendChild(M("span","hvs-flag","goal not observable (session not live on this host)"));else A.appendChild(M("span","","no active goal"));D.appendChild(A);let R=M("div"),b=J.data?.childrenTotal??J.kidsAll.length;R.appendChild(document.createTextNode(`children: ${J.kids.length} in flight · ${b} known`));for(let B of J.kids.slice(0,3))R.appendChild(M("span","",` · ${String(B.displayTitle??B.id).slice(0,24)}`));D.appendChild(R),$.appendChild(D);let I=M("div","hvs-rows"),w=[...J.eventNotes,...T6(J.fetchFailed?void 0:J.data)].sort((B,L)=>new Date(L.ts||0).getTime()-new Date(B.ts||0).getTime());if(w.length===0)I.appendChild(M("div","hvs-empty","no HIVE records for this session yet — stage transitions land here as they happen"));else for(let B of w.slice(0,80)){let L=M("div",`hvs-row${B.observed?" hvs-observed":""}`);L.appendChild(M("span","hvs-t",`${J0(B.ts)}${B.ts?` · ${V0(B.ts)}`:""}`));let u=M("span","hvs-g",Q2[B.kind]??"•");if(u.setAttribute("data-kind",B.kind),L.appendChild(u),L.appendChild(M("span","hvs-text",B.text)),B.kind==="working"&&z.stage==="working"&&B.ts===b6(J.eventNotes,"working")){let m=Y?h0(Y,J.nowTick):"";L.classList.add("hvs-current"),L.appendChild(M("span","hvs-dur",m?`${m} so far`:""))}I.appendChild(L)}$.appendChild(I);let p=M("div","hvs-foot");p.textContent=`read-only WI-083 overlay · session-scoped · sources: hive-sessions.json · hive-state.json · dream telemetry · subagent catalog · snapshot ${J0(J.data?.generated)}`,$.appendChild(p)}var q2=`
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
`,z2='<div class="empty">Fetching the board…</div>',V2='<div class="hvb-head-row"><span id="hvb-panel-mark" class="hb-mark" title="board activity"></span></div>'+'<div class="hvb-sub">read-only view of the workspace board (WI-*) — the write path stays sealed behind the hive_board_* tools (WI-062)</div>'+`<div id="board-controls-host"></div><main id="board-root">${z2}</main>`;function Y2($){let J=typeof $==="number"&&isFinite($)?$:20;return`<svg width="${J}" height="${J}" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><rect x="3" y="4" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/><rect x="3" y="15" width="5" height="5" rx="1" fill="currentColor" opacity="0.35"/><rect x="10" y="4" width="5" height="13" rx="1" fill="currentColor" opacity="0.8"/><rect x="10" y="19" width="5" height="1" rx="0.5" fill="currentColor" opacity="0.35"/><rect x="17" y="4" width="5" height="5" rx="1" fill="currentColor" opacity="0.8"/><rect x="17" y="11" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/></svg>`}globalThis.__BOARD_ENGINE={CSS:s0,CSS_OVERRIDES:q2+k0+f6,SHELL_MARKUP:V2,ICON_SVG:Y2,attachEngine:C6,startFaviconDriver:_6,makeHiveStateDock:v6};})();
;window.__ModuleLoader__.load({
  id: '@hive/dsh-board',
  factory: (require) => {
    const React = require('react');
    const E = (typeof __BOARD_ENGINE !== 'undefined') ? __BOARD_ENGINE : window.__BOARD_ENGINE;
    let applied_once = false;
    return {
      name: '@hive/dsh-board',
      // The load-bearing client services gate (I-128): registration goes
      // through 'slots'; the 15 s poll cadence rides ctx.interval ('timer');
      // the WI-083 open flow reads ctx.layout (cross-plugin panel-transition
      // face — selectPanel deep-links the board tab without touching :4400).
      inject: ['slots', 'timer', 'layout'],
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
              E.makeHiveStateDock(ctx, React),
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
