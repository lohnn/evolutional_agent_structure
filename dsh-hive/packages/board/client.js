// @hive/dsh-board — GENERATED client bundle (WI-062 slice 3+3b + WI-083). DO NOT EDIT BY HAND.
// Build: dsh-hive/packages/board/scripts/build-client.ts (bun) — bundles
// websrc/client-main.ts (the ported 4400 viewer engine + the tab engine + the
// favicon driver + the item drawer + the WI-083 hive-state dock overlay) into
// the twin classic shape; the wrapper below is the only React-using code and
// takes React from the loader's runtime module table (W-044).
// Build stamp (both sides of the I-152 staleness verdict): afbd5af-dirty
(()=>{var e6=Object.defineProperty;var $9=($)=>$;function J9($,J){this[$]=$9.bind(null,J)}var Z9=($,J)=>{for(var Z in J)e6($,Z,{get:J[Z],enumerable:!0,configurable:!0,set:J9.bind(J,Z)})};var s=($,J)=>()=>($&&(J=$($=0)),J);function t($){if($==null)return!0;let J=$.trim();if(J==="")return!0;return Q9.test(J)}function X9($){return $!=null&&$.trim()!==""&&!t($)}function i0($,J,Z){if(!t($))return $;if(!J||!Z)return $;let Q=Z[J];return X9(Q)?Q:$}var Q9;var _0=s(()=>{Q9=/^New session - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/});function r9($){return t($)||$.startsWith("/")}function i9($,J){if($.length<=J)return $;let Z=$.slice(0,J),Q=Z.lastIndexOf(" ");return(Q>J*0.5?Z.slice(0,Q):Z).trimEnd()+"…"}function M6($){let J=r9($),Z=$.startsWith("/")?"awaken-input-slug":t($)?"opencode-placeholder":"";return{display:J?i9($,o9):$,raw:$,raw_:J,rawKind:Z}}var o9=48,U6='<span class="raw-title-chip" title="title is raw/unverified — no session-title surface exists under dsh yet (SHADOW-019)">(raw title)</span>';var G6=s(()=>{_0()});function s9($){if(typeof $!=="string"||$.length>72)return!1;return/^(?:session-[0-9]{1,12}|session-[0-9a-zA-Z-]{4,64})$/.test($)}function W0($,J,Z){if(!s9(J))return;if($.some((Q)=>Q.id===J))return;$.push({id:J,role:Z})}function K0($){let J=[];if(!$)return J;if($.owner_session!=null)W0(J,$.owner_session,"owner");if($.group_id!=null)W0(J,$.group_id,"group");for(let Z of Array.isArray($.released_sessions)?$.released_sessions:[])W0(J,Z,"released");for(let Z of Array.isArray($.transitions)?$.transitions:[])if(typeof Z?.session==="string")W0(J,Z.session,"history");return J}function B6($){return`session-${($.startsWith("session-")?$.slice(8):$).slice(0,8)}…`}function H6($,J){let Z=J?.byId?.[$];if(Z){let X=typeof Z.displayTitle==="string"&&Z.displayTitle.length>0?Z.displayTitle:typeof Z.title==="string"&&Z.title.length>0?Z.title:B6($);return{id:$,known:!0,title:X,running:Z.running,note:""}}let Q=J?.phase,z=Q&&Q!=="ready"?"session catalog still loading":"not in the live session list (ended, or from the other harness)";return{id:$,known:!1,title:B6($),running:void 0,note:z}}function F6($,J){if($&&typeof $==="object"){let Z=$.get;if(typeof Z==="function")try{return Z.call($,J)}catch{}}return}function t9($){if($&&typeof $==="object"&&typeof $.openSession==="function")return $;return}function e9($){if($&&typeof $==="object"){let J=$.list;if(J&&typeof J.getSnapshot==="function")return $}return}function O6($){if(P6||typeof $!=="object"||$===null)return;P6=!0;let J=$;if(typeof J.inject!=="function")return;try{J.inject(["sessions","uiWorkspace"],(Z)=>{i=t9(F6(Z,"uiWorkspace")),Z0=e9(F6(Z,"sessions"))})}catch{}}function _6(){return i!==void 0}function N6($){if(i?.openSession===void 0)return!1;try{return i.openSession($),!0}catch{return!1}}function $2(){try{return Z0?.list?.getSnapshot?.()}catch{return}}async function J2($,J){try{await navigator.clipboard.writeText($),J.textContent="session id copied",J.setAttribute("data-flash","1")}catch{J.textContent="copy failed — select the id text above"}window.setTimeout(()=>{J.textContent="",J.removeAttribute("data-flash")},2500)}function D6($,J,Z){let Q=K0(J);if(Q.length===0)return;let z=document.createElement("div");z.className="hvb-session-open";let X=document.createElement("div");X.className="hvb-section-title",X.textContent="connected session",z.appendChild(X);let q=(j=!1)=>{if(j&&!z.isConnected)return;let K=$2();z.textContent="",z.appendChild(X);for(let Y of Q){let W=H6(Y.id,K);if(!W.known&&!K&&Z0!==void 0)W.note="session catalog still loading";let H=document.createElement("div");H.className="hvb-session-row";let P=document.createElement("span");if(P.className="hvb-session-role mono",P.textContent=Y.role==="owner"?"owner":Y.role==="group"?"group":Y.role==="released"?"released":"history",H.appendChild(P),W.known&&i!==void 0){if(W.running){let x=document.createElement("span");x.className="hvb-session-dot",x.title="running right now (per the live session list)",H.appendChild(x)}let A=document.createElement("button");A.type="button",A.className="hvb-session-open-btn",A.textContent="Open ⇢",A.title=`open ${Y.id} in the dsh web app (switches the main panel to this session's conversation)`,A.addEventListener("click",()=>{let x=H.querySelector(".hvb-session-note");try{i?.openSession?.(Y.id),Z?.()}catch(T){if(x)x.textContent=`open failed: ${T instanceof Error?T.message:String(T)}`}}),H.appendChild(A)}let F=document.createElement("span");F.className="hvb-session-title",F.textContent=W.title,F.title=Y.id,H.appendChild(F);let L=document.createElement("span");if(L.className="hvb-session-note",W.note)L.textContent=W.note;H.appendChild(L);let N=document.createElement("button");N.type="button",N.className="hvb-session-copy mono",N.textContent="⧉",N.title=`copy the full session id (${Y.id})`,N.addEventListener("click",()=>void J2(Y.id,L)),H.appendChild(N),z.appendChild(H)}if(Q.length>0&&!Z0){let Y=document.createElement("div");Y.className="hvb-session-note",Y.textContent="session catalog unavailable in this composition — id copy still works",z.appendChild(Y)}};q();let V;V=Z0?.list?.subscribe?.(()=>{if(!z.isConnected){try{V?.()}catch{}return}q(!0)}),$.appendChild(z)}var i,Z0,P6=!1;var j0=()=>{};async function Q2($,J){try{await navigator.clipboard.writeText($),J.textContent="session id copied",J.setAttribute("data-flash","1")}catch{J.textContent="copy failed — select the id text above"}window.setTimeout(()=>{J.textContent="",J.removeAttribute("data-flash")},2500)}function X2($){return`session-${($.startsWith("session-")?$.slice(8):$).slice(0,8)}…`}function A6($,J,Z){if(K0(J).length>0)return;if((J.status??"")==="done")return;if(J.paused===!0)return;let Q=document.createElement("div");Q.className="hvb-session-open";let z=document.createElement("div");z.className="hvb-section-title",z.textContent="awaken a new session",Q.appendChild(z);let X=document.createElement("div");X.className="hvb-session-row";let q=document.createElement("button");q.type="button",q.className="hvb-session-open-btn",q.textContent="Awaken ⚑",q.title=`create a REAL dsh session for ${J.id} and run the /awaken flip (host backend must compose board awaken:true; the session starts in this workspace with this item named in its brief)`;let V=document.createElement("span");V.className="hvb-session-note",V.textContent="creates a new top-level session owned by this item's brief";let j=!1;q.addEventListener("click",()=>{if(j)return;j=!0,q.setAttribute("disabled","1"),V.textContent="awakening — creating the session and running the /awaken flip…";let Y=JSON.stringify({itemId:J.id,hint:J.title});fetch(Z2,{method:"POST",headers:{"content-type":"application/json"},body:Y}).then(async(W)=>{let H=null;try{H=await W.json()}catch{H=null}if(H===null){V.textContent=`awaken failed: non-JSON response (HTTP ${W.status}) — check the host log; nothing was assumed`;return}K(H)}).catch((W)=>{V.textContent=`awaken failed: ${W instanceof Error?W.message:String(W)} — the route is unreachable from this surface; is the board served by the dsh host? Nothing was assumed`}).finally(()=>{j=!1,q.removeAttribute("disabled")})});let K=(Y)=>{if(X.textContent="",Y.ok!==!0){X.appendChild(q);let N=Y.code?`${Y.code}: `:"";V.textContent=`${N}${Y.error}`,X.appendChild(V);return}let W=document.createElement("span");if(W.className="hvb-session-role mono",W.textContent="created",X.appendChild(W),Y.awakened.ok===!0&&_6()){let N=document.createElement("button");N.type="button",N.className="hvb-session-open-btn",N.textContent="Open ⇢",N.title=`open ${Y.sessionId} in the dsh web app (switches the main panel to this session's conversation)`,N.addEventListener("click",()=>{N6(Y.sessionId),Z?.()}),X.appendChild(N)}let P=document.createElement("span");P.className="hvb-session-title",P.textContent=X2(Y.sessionId),P.title=Y.sessionId,X.appendChild(P);let G=document.createElement("button");G.type="button",G.className="hvb-session-copy mono",G.textContent="⧉",G.title=`copy the full session id (${Y.sessionId})`,G.addEventListener("click",()=>void Q2(Y.sessionId,V)),X.appendChild(G);let F=document.createElement("span");F.className="hvb-session-note";let L=Y.awakened.ok?Y.awakened.text:`flip issue — ${Y.awakened.text}`;F.textContent=L.length>160?`${L.slice(0,160)}…`:L,X.appendChild(F)};X.appendChild(q),X.appendChild(V),Q.appendChild(X),$.appendChild(Q)}var Z2="/api/hive-board/awaken";var L6=s(()=>{j0()});var k6={};Z9(k6,{openDrawer:()=>C0,bindItemDrawer:()=>T0,ITEM_URL:()=>R6,ITEM_MAX_BYTES:()=>C6,DRAWER_CSS:()=>I0});function M0($){if(!$)return"—";let J=new Date($);if(isNaN(J.getTime()))return $;return J.toISOString().slice(0,16).replace("T"," ")}function O($,J,Z){let Q=document.createElement($);if(J)Q.className=J;if(Z!==void 0)Q.textContent=Z;return Q}function z2(){let $=document.getElementById(R0);if($)return $;$=document.createElement("div"),$.id=R0,$.setAttribute("hidden",""),$.setAttribute("role","dialog"),$.setAttribute("aria-modal","false"),$.appendChild(S0());let J=document.createElement("div");return J.id=k0,J.setAttribute("hidden",""),J.addEventListener("click",()=>X0()),document.body.appendChild(J),document.body.appendChild($),$}function X0(){document.getElementById(R0)?.setAttribute("hidden",""),document.getElementById(k0)?.setAttribute("hidden","")}function T0(){if(x6||typeof document>"u")return;x6=!0,document.addEventListener("keydown",($)=>{if($.key==="Escape")X0()}),document.addEventListener("click",($)=>{let J=$.target;if(!(J instanceof Element))return;let Z=J.closest("a.open-link");if(Z instanceof HTMLAnchorElement){$.preventDefault();let V=Z.closest('[data-key^="wi:"]')?.getAttribute("data-key");if(V)C0(V.slice(3));return}let Q=J.closest('[data-key^="wi:"]');if(!Q)return;if(J.closest("a,button,input,textarea,select,form"))return;let X=(Q.getAttribute("data-key")??"").slice(3);if(X)C0(X)},!1)}function S0(){let $=O("button","hvb-drawer-close","×");return $.type="button",$.title="close the item detail (Esc works too)",$.addEventListener("click",X0),$}async function C0($){let J=z2();J.textContent="",J.appendChild(S0());let Z=O("div","hvb-drawer-head mono");Z.appendChild(O("span","hvb-wi-id",$)),Z.appendChild(O("span","meta","loading…")),J.appendChild(Z),document.getElementById(k0)?.removeAttribute("hidden"),J.removeAttribute("hidden");try{let Q=await fetch(`${R6}?id=${encodeURIComponent($)}`,{headers:{accept:"application/json"}});if(!Q.ok){x0(J,$,`HTTP ${Q.status}`);return}let z=await Q.json();if(!z||z.ok!==!0||!z.item){x0(J,$,z?.missing?.join(", ")??"unknown reason");return}q2(J,z.item,z)}catch(Q){x0(J,$,Q instanceof Error?Q.message:String(Q))}}function x0($,J,Z){let Q=O("div","hvb-drawer-body");Q.appendChild(O("div","meta",`${J} is not on the board (${Z}). It may have been dissolved or the board moved — hit the 15 s lane refresh and retry. Nothing was written; nothing was assumed.`)),$.appendChild(Q)}function V2($){let J=O("div","hvb-chip-row"),Z=[[$.status,`hvb-chip status-${$.status}`],[$.priority,`hvb-chip prio-${$.priority}`],...$.paused?[["paused","hvb-chip status-paused"]]:[]];for(let[Q,z]of Z)J.appendChild(O("span",z,Q));return J}function h($,J){let Z=O("div","hvb-face-row");return Z.appendChild(O("span","mono dim",$)),Z.appendChild(O("span","mono",J&&J.length?J:"—")),Z}function Q0($){return O("div","hvb-section-title",$)}function q2($,J,Z){$.textContent="",$.appendChild(S0());let Q=M6(J.title),z=O("div","hvb-drawer-head"),X=O("div","hvb-drawer-title-row"),q=O("h3","hvb-drawer-title",Q.display);if(q.title=Q.raw,X.appendChild(q),Q.raw_){let P=document.createElement("span");P.innerHTML=U6,X.appendChild(P.firstChild)}z.appendChild(X),z.appendChild(V2(J)),$.appendChild(z);let V=O("div","hvb-face mono");if(V.appendChild(h("id",J.id)),V.appendChild(h("owner",J.owner_session)),V.appendChild(h("group",J.group_id)),V.appendChild(h("origin",J.origin)),V.appendChild(h("created",M0(J.created))),V.appendChild(h("updated",M0(J.updated))),V.appendChild(h("recency",J.recency)),V.appendChild(h("spec",J.spec_hash)),J.released_sessions&&J.released_sessions.length>0)V.appendChild(h("released",J.released_sessions.join(", ")));if(J.dream_id)V.appendChild(h("dream",J.dream_id));$.appendChild(V),D6($,J,X0),A6($,J,X0);let j=J.problems??[];if(j.length>0){let P=O("div","hvb-problems");P.appendChild(Q0("⚠ invariant problems (detection only — SCHEMA §3, WI-071)"));for(let G of j)P.appendChild(O("div","hvb-problem mono",G));$.appendChild(P)}if(J.subtasks&&J.subtasks.length>0){let P=O("div","hvb-subtasks");P.appendChild(Q0(`subtasks (${J.subtasks.filter((G)=>G.status==="completed").length}/${J.subtasks.length})`));for(let G of J.subtasks){let F=O("div","hvb-subtask-row");F.appendChild(O("span","mono hvb-subtask-icon",G.status==="completed"?"☑":G.status==="in_progress"?"▸":G.status==="cancelled"?"✕":"○")),F.appendChild(O("span",void 0,G.content)),P.appendChild(F)}$.appendChild(P)}let K=J.todo_mirror??[];if(K.length>0){let P=O("div","hvb-mirror");P.appendChild(Q0(`todo mirror (${K.length}${J.todo_mirror_updated?` · updated ${M0(J.todo_mirror_updated)}`:""})`));for(let G of K){let F=O("div","hvb-mirror-row"),L=String(G.state??G.status??"");F.appendChild(O("span","mono hvb-subtask-icon",L==="completed"?"☑":L==="in_progress"?"▸":"○")),F.appendChild(O("span",void 0,typeof G.content==="string"?G.content:JSON.stringify(G))),P.appendChild(F)}$.appendChild(P)}let Y=J.transitions??[];if(Y.length>0){let P=O("div","hvb-history");P.appendChild(Q0(`history (${Y.length})`));let G=Y.slice(0,E6);for(let F of G){let L=O("div","hvb-history-row mono"),N=F.absorbed?`${F.from??"∅"} ⇢ ${F.to} (absorbed ${F.absorbed})`:`${F.from??"∅"} ⇢ ${F.to}`;L.appendChild(O("span","meta",M0(F.at))),L.appendChild(O("span",void 0,N)),L.appendChild(O("span","meta",F.by+(F.session?` · ${F.session}`:"")+(F.superseded?` · spec ${F.superseded} superseded`:""))),P.appendChild(L)}if(Y.length>G.length)P.appendChild(O("div","meta",`+ ${Y.length-G.length} older transitions not shown (drawer cap ${E6} — nothing dropped from the record; the board file keeps them all)`));$.appendChild(P)}let W=O("div","hvb-spec");W.appendChild(Q0("spec"));let H=O("pre","mono hvb-spec-body",J.body);if(H.setAttribute("tabindex","0"),W.appendChild(H),Z.truncated)W.appendChild(O("div","meta",`spec truncated for display at ${C6} chars (full spec is ${Z.bodyBytes??"?"} chars — served from the board file; this is a DISPLAY cap, the file is untouched)`));$.appendChild(W),$.appendChild(O("div","meta hvb-drawer-foot","read-only depth view — the board's write path stays sealed behind the hive_board_* tools (WI-062)"))}var R6="/api/hive-board/item",R0="hvb-drawer",k0="hvb-drawer-scrim",E6=50,C6=1e4,x6=!1,I0=`
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
/* ── WI-087 connected-session affordance (same palette, drawer-scoped) ── */
#hvb-drawer .hvb-session-open{margin:10px 0;padding:8px 10px;background:#0d1117;border:1px solid #21262d;border-radius:8px}
#hvb-drawer .hvb-session-open .hvb-section-title{margin:0 0 6px}
#hvb-drawer .hvb-session-row{display:flex;gap:8px;align-items:center;margin:2px 0;flex-wrap:wrap}
#hvb-drawer .hvb-session-role{color:#8b949e;font-size:11px;flex:0 0 auto}
#hvb-drawer .hvb-session-open-btn{background:#21262d;color:#3fb950;border:1px solid #30363d;border-radius:6px;padding:1px 8px;font-size:11px;cursor:pointer;flex:0 0 auto}
#hvb-drawer .hvb-session-open-btn:hover{border-color:#3fb950;color:#56d364}
#hvb-drawer .hvb-session-copy{background:#21262d;color:#8b949e;border:1px solid #30363d;border-radius:6px;padding:1px 6px;font-size:11px;cursor:pointer;flex:0 0 auto}
#hvb-drawer .hvb-session-copy:hover{color:#e6edf3;border-color:#8b949e}
#hvb-drawer .hvb-session-title{color:#e6edf3;font-size:11.5px;overflow-wrap:anywhere}
#hvb-drawer .hvb-session-note{color:#8b949e;font-size:11px;overflow-wrap:anywhere}
#hvb-drawer .hvb-session-note[data-flash="1"]{color:#3fb950}
#hvb-drawer .hvb-session-dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:#3fb950}
@media (prefers-reduced-motion: reduce){#hvb-drawer .hvb-session-dot{animation:none}}
/* ── WI-064 awaken affordance (same palette; reuses hvb-session-open-btn) ── */
#hvb-drawer .hvb-session-open-btn[disabled]{color:#8b949e;border-color:#21262d;cursor:default}
`;var U0=s(()=>{G6();j0();L6()});function n0($){let J=new Set;for(let Z of $.transitions){if(Z.superseded!==void 0)continue;if(Z.session&&Z.session!==$.owner_session)J.add(Z.session)}return[...J]}function o0($){return $.transitions.filter((J)=>typeof J.superseded==="string"&&J.superseded!=="").map((J)=>({at:J.at,by:J.by,...J.session?{session:J.session}:{},supersededHash:J.superseded}))}function r0($){return $.transitions.filter((J)=>typeof J.absorbed==="string"&&J.absorbed!=="").map((J)=>({id:J.absorbed,at:J.at}))}_0();function u($){let J="";for(let Z of $.transitions)if(Z.at&&Z.at>J)J=Z.at;return J||$.updated}function a0($){let J=0,Z=0,Q=0,z=0,X=null;for(let q of $)switch(q.status){case"completed":J++;break;case"in_progress":if(Z++,X===null)X=q.content;break;case"pending":Q++;break;case"cancelled":z++;break}return{total:$.length,completed:J,inProgress:Z,pending:Q,cancelled:z,current:X}}var k={field:"#0d1117",panel:"#161b22",border:"#30363d",edge:"#30363d",node:"#484f58",strata:"#30363d",divider:"#8b949e",amber:"#d29922",red:"#f85149"},c2=k.field,e=[[11,28],[23,14],[33,29],[45,16],[53,28]],z9=[[0,1],[1,2],[1,3],[2,3],[3,4],[0,2]],V9=[[11,41,42,4],[7,47.5,50,5],[16,54,33,4]],q9=[3,1,4,2,0];function s0($){return $==="intervene"?k.red:$==="active"?k.amber:k.node}function N0($,J={}){let{idPrefix:Z="hbf",animate:Q=!1,size:z,title:X}=J,q=`${Z}-clip`,V=s0($.session),j=$.session==="quiet"?0:Math.min(Math.max($.count,1),e.length),K=new Set(q9.slice(0,j)),Y=Q?' class="lit"':"",W="";for(let[A,x]of z9){let T=K.has(A)||K.has(x),[S,p]=e[A],[m,_]=e[x];W+=`<line x1="${S}" y1="${p}" x2="${m}" y2="${_}" stroke="${T?V:k.edge}" stroke-width="1.4"${T?` opacity=".8"${Y}`:""}/>`}for(let A=0;A<e.length;A++){let x=K.has(A),[T,S]=e[A];W+=`<circle cx="${T}" cy="${S}" r="${x?4.2:3.2}" fill="${x?V:k.node}"${x?Y:""}/>`}let H=$.dreaming?k.amber:k.strata,P=$.dreaming&&Q?' class="dreaming"':"",G=V9.map(([A,x,T,S])=>`<rect x="${A}" y="${x}" width="${T}" height="${S}" fill="${H}"/>`).join(""),F=z?` width="${z}" height="${z}"`:"",L=X?' role="img"':' aria-hidden="true"',N=X?`<title>${X}</title>`:"";return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${F}${L}>`+N+`<defs><clipPath id="${q}"><rect x="4" y="4" width="56" height="56" rx="12"/></clipPath></defs><rect x="4" y="4" width="56" height="56" rx="12" fill="${k.panel}" stroke="${k.border}" stroke-width="1.5"/><g clip-path="url(#${q})"${P}>${G}</g><line x1="9" y1="36" x2="55" y2="36" stroke="${k.divider}" stroke-width="1" opacity=".35"/><g>${W}</g></svg>`}function D0($,J={}){let{idPrefix:Z="hbr"}=J,Q=`${Z}-clip`,z=s0($.session),X=$.dreaming?k.amber:k.strata,q=$.dreaming?18:16;return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><clipPath id="${Q}"><rect x="3" y="3" width="58" height="58" rx="13"/></clipPath></defs><rect x="3" y="3" width="58" height="58" rx="13" fill="${k.panel}" stroke="${k.border}" stroke-width="2"/><g clip-path="url(#${Q})"><rect x="3" y="40" width="58" height="${q}" fill="${X}"/></g><line x1="8" y1="35" x2="56" y2="35" stroke="${k.divider}" stroke-width="1.6" opacity=".4"/><circle cx="32" cy="21" r="9" fill="${z}"/></svg>`}function M($){return $.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}function n($,J){return $.length>J?$.slice(0,J-1)+"…":$}function $0($){if(!$)return"—";let J=new Date($);return Number.isNaN(J.getTime())?$:J.toISOString().replace("T"," ").slice(0,16)+"Z"}function Y9($){let J=$==="unknown"?"build unknown":`build ${M($)}`,Z=$==="unknown"?"git unavailable — running build could not be identified":"server build SHA — HEAD of the HIVE plugin repo, which ships this viewer";return`<span id="build-badge" class="build-badge" data-server-sha="${M($)}" title="${M(Z)}">${J}</span>`}function W9($,J){if(!$)return"absent";if(!J.available)return"unknown";return J.persistedIds.includes($)?"exists":"absent"}function K9($,J,Z){if(!$)return"";return`<a class="open-link" href="${M(`${J}/?session=${$}`)}" target="_blank" rel="noopener" title="open in web GUI">Open ↗</a>`}var j9={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function M9($){if($.length===0)return"";let J=$.filter((Q)=>Q.status==="completed").length,Z=$.map((Q)=>`<li class="st st-${M(Q.status)}"><span class="st-icon">${j9[Q.status]??"?"}</span>${M(n(Q.content,70))}</li>`).join("");return`<div class="lane"><span class="lane-count">${J}/${$.length}</span><ul>${Z}</ul></div>`}var U9={completed:"✓",in_progress:"▸",pending:"○",cancelled:"✕"};function G9($){if(!$||$.source==="none"||$.todos.length===0)return"";let J=a0($.todos),Z=J.total-J.cancelled,Q=Z>0?Math.round(J.completed/Z*100):0,z=$.source==="mirror"?' <span class="todo-cached" title="session not reachable now — showing the last mirrored snapshot (may lag)">cached</span>':"",X=J.current?`<div class="todo-current" title="${M(J.current)}"><span class="st-icon">▸</span>${M(n(J.current,72))}</div>`:J.inProgress===0&&J.pending>0?`<div class="todo-current dim">${J.pending} pending — none in progress</div>`:"",q=$.todos.map((V)=>`<li class="st st-${M(V.status)}"><span class="st-icon">${U9[V.status]??"?"}</span>${M(n(V.content,70))}</li>`).join("");return`<div class="todos" title="owning session TodoWrite progress (WI-038)">
    <div class="todo-head">
      <span class="todo-label">activity</span>
      <span class="todo-count mono">${J.completed}/${Z}</span>${z}
      <div class="todo-bar"><div class="todo-bar-fill" style="width:${Q}%"></div></div>
    </div>
    ${X}
    <details class="todo-list"><summary>${$.todos.length} todo${$.todos.length===1?"":"s"}</summary><ul>${q}</ul></details>
  </div>`}function B9($){let J=o0($);if(J.length===0)return"";let Z=J[J.length-1],Q=J.map((X)=>{let q=X.session?` <span class="mono dim">${M(e0(X.session))}</span>`:"",V=`superseded body — board/${$.id}/${X.supersededHash}.md`;return`<li><span class="mono dim">${M($0(X.at))}</span> ${M(X.by)}${q} <span class="mono dim" title="${M(V)}">${M(X.supersededHash)}</span></li>`}).join("");return`<details class="revisions"><summary>spec revised ${J.length===1?"once":`${J.length}×`}<span class="dim"> · latest ${M($0(Z.at))}</span></summary><ul>${Q}</ul></details>`}function H9($,J,Z){let Q=[],z=n0($);if(z.length>0){let X=z.map((q)=>W9(q,Z)==="exists"?`<a href="${M(`${J}/?session=${q}`)}" target="_blank" rel="noopener" class="mono">${M(q)}</a>`:`<span class="mono" title="session not available here">${M(q)}</span>`).join(", ");Q.push(`previously attempted in ${X}`)}for(let X of r0($))Q.push(`absorbed <span class="mono">${M(X.id)}</span> at bind${X.at?` (${$0(X.at)})`:""}`);if(Q.length===0)return"";return`<div class="lineage">${Q.join(" · ")}</div>`}function e0($){return $.length>16?$.slice(0,16)+"…":$}function $6($,J){if(!$)return"";let Z=J.actionRequired[$];if(!Z)return"";let Q=[];if(Z.awaitingQuestion){let z=Z.questionCount>1?` (${Z.questionCount})`:"",X=Z.questionHeader?`the owning session is asking: "${Z.questionHeader}" — answer it in the session (WI-043)`:"the owning session is waiting on an answer to a question (WI-043)";Q.push(`<span class="badge badge-action badge-action-question" title="${M(X)}">❓ needs answer${z}</span>`)}if(Z.awaitingPermission){let z=Z.permissionCount>1?` (${Z.permissionCount})`:"";Q.push(`<span class="badge badge-action badge-action-permission" title="the owning session is waiting on a command/permission approval (WI-043)">✋ needs approval${z}</span>`)}return Q.join(" ")}function J6($,J){if(!$)return"";let Z=J.actionRequired[$];if(Z&&(Z.awaitingQuestion||Z.awaitingPermission))return"";let Q=J.sessionStatus[$];if(!Q)return"";switch(Q){case"busy":return'<span class="badge badge-status badge-status-busy" title="the owning session is actively processing (WI-044)">⚙ working</span>';case"retry":return'<span class="badge badge-status badge-status-retry" title="the owning session hit a provider error and is retrying (WI-044)">⟳ retrying</span>';case"idle":return`<span class="badge badge-status badge-status-idle" title="the owning session is idle — not currently processing (this is NOT 'done'; completion is dream/column-driven) (WI-044)">✓ idle</span>`}}function d($,J,Z){return` data-confirm="1" data-confirm-severity="${$}" data-confirm-title="${M(J)}" data-confirm-body="${M(Z)}"`}function P9($,J){let Z=J.decisions[$.id];if(!Z)return"";let Q=`<input type="hidden" name="id" value="${M($.id)}">`;if(Z.kind==="fresh"&&J.sessionBackend==="unconfigured")return'<div class="actions"><span class="act disabled" title="opencode server not configured (--opencode-url / OPENCODE_SERVER_PASSWORD) — session creation unavailable">Start ⏻</span></div>';if(Z.kind==="refuse")return`<div class="actions"><span class="act disabled" title="${M(`${Z.reason}: ${Z.detail}`)}">Promote</span></div>`;if(Z.kind==="fresh")switch(Z.reason){case"never-owned":return`<div class="actions"><form method="post" action="/transitions/start"${d("start","Start a session?","This creates a fresh top-level HIVE session, binds it, and runs /awaken seeded with the spec. Confirm to proceed.")}>${Q}<button class="act act-start" title="create a fresh top-level session, bind it, auto-/awaken seeded with the spec (§5.3c)">Start</button></form></div>`;case"spec-changed":return`<div class="actions"><form method="post" action="/transitions/promote"${d("start","Start a fresh session? (spec edited)","The spec was edited after this item was demoted, so promotion creates a FRESH session (the edit is the decision, Q13) — the previous session is not reattached. Confirm to proceed.")}>${Q}<button class="act act-start" title="spec was edited after demote — promotion creates a FRESH session (Q13: the edit is the decision)">Start fresh session (spec edited)</button></form></div>`;case"done-never-owned":return`<div class="actions"><form method="post" action="/transitions/promote"${d("start","Reopen as a fresh session?","This item was marked done without ever owning a session. Promotion un-does the done state (done→todo) and starts a FRESH session (Q16). Confirm to proceed.")}>${Q}<button class="act act-start" title="done without a session — promote un-does the item (done→todo) then starts a fresh session (Q16)">Reopen as fresh session</button></form></div>`}let X=Z.reason==="done-reopen",q=X?"Reopen — re-attach original session":`Re-attach ${e0(Z.sessionID)} (spec unchanged)`;return`<div class="actions"><form method="post" action="/transitions/promote"${X?d("start","Reopen this item?","This re-opens the item and RE-ATTACHES its original owning session by id — a deep link only; /awaken is never re-run (invariant 4). Confirm to proceed."):d("start","Re-attach session?","This re-opens the existing owning session (deep link only; /awaken is not re-run). Confirm to proceed.")}>${Q}<button class="act" title="re-attaches ${M(Z.sessionID)} — deep link only, /awaken is NEVER re-run (invariant 4)">${M(q)}</button></form></div>`}function F9($,J){if($.status!=="in_progress")return P9($,J);let Z=[],Q=`<input type="hidden" name="id" value="${M($.id)}">`;if(Z.push($.paused?`<form method="post" action="/transitions/unpause">${Q}<button class="act" title="resume — same owning session">Unpause</button></form>`:`<form method="post" action="/transitions/pause">${Q}<button class="act" title="park it; resume the same session later (§5.5)">Pause</button></form>`),Z.push(`<form method="post" action="/transitions/demote"${d("warn","Demote this item?","This detaches and TOMBSTONES the owning session. The idea becomes fluid again and the session will not be reattached. Confirm to proceed.")}>${Q}<select name="to" class="act-select"><option value="todo">todo</option><option value="backlog">backlog</option></select><button class="act act-warn" title="true demote: detach + tombstone the session; the idea is fluid again (§5.5)">Demote</button></form>`),!$.paused)Z.push(`<form method="post" action="/transitions/done-without-dream"${d("warn","Mark done without a dream?","This is a terminal state and skips dreamtime — no artifacts will be linked and no consolidation happens (§5.4). Confirm to proceed.")}>${Q}<button class="act" title="manual done — skips dreamtime, badged no-dream (§5.4)">Done (no dream)</button></form>`);return`<div class="actions">${Z.join("")}</div>`}function t0($){return`<details class="create" data-key="create:${$}"><summary>+ new item</summary>
  <form method="post" action="/transitions/create" class="create-form">
    <input type="hidden" name="status" value="${$}">
    <input name="title" placeholder="title" required>
    <select name="priority"><option value="medium">medium</option><option value="high">high</option><option value="low">low</option></select>
    <input name="tags" placeholder="tags, comma-separated">
    <textarea name="body" rows="3" placeholder="spec / notes (markdown)"></textarea>
    <button type="submit">Create in ${$}</button>
  </form></details>`}function O9($,J){let{guiBaseUrl:Z,mirror:Q,writesEnabled:z}=J,X=[],q=$6($.owner_session,J);if(q)X.push(q);let V=J6($.owner_session,J);if(V)X.push(V);if($.priority)X.push(`<span class="chip chip-prio-${M($.priority)}">${M($.priority)}</span>`);for(let W of $.tags)X.push(`<span class="chip">${M(W)}</span>`);if($.paused)X.push('<span class="badge badge-paused" title="parked — resume the same session (§5.5)">paused</span>');if($.done_without_dream)X.push('<span class="badge badge-nodream" title="done without a dream — consolidation skipped (§5.4)">no-dream</span>');for(let W of $.problems)X.push(`<span class="badge badge-problem" title="${M(W)}">⚠ invariant</span>`);let j=$.artifacts.length>0?`<div class="cap-desc">produced: ${$.artifacts.map((W)=>`<span class="chip mono">${M(W)}</span>`).join(" ")}${$.dream_id?` <span class="dim mono">(${M($.dream_id)})</span>`:""}</div>`:$.dream_id?`<div class="cap-desc dim mono">dream: ${M($.dream_id)}</div>`:"",K=$.body?`<details class="spec"><summary>spec</summary><div class="spec-body">${M(n($.body,600))}</div></details>`:"",Y=i0($.title,$.owner_session,Q.sessionTitles);return`<div class="card wi ${$.paused?"paused":""}" data-key="wi:${M($.id)}">
    <div class="cap-head">
      <span class="mono dim">${M($.id)}</span>
      <span class="cap-name">${M(n(Y,90))}</span>
      ${K9($.owner_session,Z,Q)}
    </div>
    <div class="chips">${X.join(" ")}</div>
    ${M9($.subtasks)}
    ${G9(J.todoSubStates[$.id])}
    ${j}
    ${B9($)}
    ${H9($,Z,Q)}
    ${K}
    ${z?F9($,J):""}
  </div>`}function _9($,J){let Z=$6($.id,J),Q=J6($.id,J),z=[Z,Q].filter(Boolean).join(" ");return`<div class="card session-only" data-key="ses:${M($.id)}">
    <div class="cap-head">
      <span class="cap-name">${M(n($.title,80))}</span>
      <a class="open-link" href="${M($.openUrl)}" target="_blank" rel="noopener">Open ↗</a>
    </div>
    ${z?`<div class="chips">${z}</div>`:""}
    <div class="cap-desc mono">${M($.id)}</div>
    <div class="cap-desc dim">session-only — awakened, no work item yet · updated ${$0($.updated)}</div>
  </div>`}function q0($,J,Z=""){return`<div class="col" data-key="col:${M($)}" data-col="${M($)}">
    <div class="col-head"><button type="button" class="col-toggle" data-col-toggle="${M($)}" aria-pressed="false" title="collapse/expand this column (survives refresh)">${M($)} <span class="count">(${J.length})</span><span class="col-toggle-icon" aria-hidden="true">▾</span></button></div>
    <div class="col-body">
      ${Z}
      ${J.length===0?'<div class="empty">—</div>':J.join(`
`)}
    </div>
  </div>`}function N9($){let J=$.map((Z)=>{let Q=Array.isArray(Z.tags)?Z.tags:[];return{id:Z.id,status:Z.status,title:Z.title??"",tags:Q,hay:`${Z.id} ${Z.title??""} ${Q.join(" ")} ${Z.body??""}`.toLowerCase()}});return JSON.stringify(J).replaceAll("</","<\\/")}function D9($,J,Z){let Q=(V)=>O9(V,J),z=[...$.inProgress.map((V)=>({key:u(V),tie:V.id,html:Q(V)})),...$.sessionOnly.map((V)=>({key:V.updated,tie:V.id,html:_9(V,J)}))];z.sort((V,j)=>V.key!==j.key?j.key.localeCompare(V.key):j.tie.localeCompare(V.tie));let X=z.map((V)=>V.html);return`${`<script id="filter-corpus" type="application/json" data-key="filter:corpus">${N9(Z)}</script>`}<div class="kanban">
    ${q0("Backlog",$.backlog.map(Q),J.writesEnabled?t0("backlog"):"")}
    ${q0("Todo",$.todo.map(Q),J.writesEnabled?t0("todo"):"")}
    ${q0("In Progress",X)}
    ${q0("Done",$.done.map(Q))}
  </div>`}var Z6=`
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
`;function Q6($){let J=new Map,Z=0;for(let j of $.items){let K=Array.isArray(j.tags)?j.tags:[];if(K.length===0)Z++;for(let Y of K)J.set(Y,(J.get(Y)??0)+1)}let Q=[...J.entries()].sort((j,K)=>K[1]-j[1]||j[0].localeCompare(K[0])),z=(j,K,Y)=>`<button type="button" class="tag-chip" data-tag="${M(j)}" title="${M(Y)}">${M(K)}</button>`,X=12,q=Q.slice(0,X),V=Q.slice(X);return`<div id="board-controls">
  <div id="controls-row">
    <button type="button" id="controls-toggle" aria-expanded="true" aria-controls="controls-panel" title="collapse/expand the filter/tag controls">filters ▴</button>
    <input id="filter-q" type="search" placeholder="filter — id, title, tag, spec…" autocomplete="off" spellcheck="false" aria-label="filter work items">
    <span id="controls-summary" title="active filter — tap “filters” to change it"></span>
  </div>
  <div id="controls-panel">
    <div id="filter-bar" role="search">
      <div id="filter-tags" role="group" aria-label="filter by tag">
        ${q.map(([j,K])=>z(j,`${j} ${K}`,`${K} item${K===1?"":"s"} tagged ${j} — tap to filter`)).join(`
        `)}
        ${V.length>0?`<details id="filter-tags-more"><summary>+${V.length} more tags</summary><div class="tag-tail">${V.map(([j,K])=>z(j,`${j} ${K}`,`${K} item${K===1?"":"s"} tagged ${j} — tap to filter`)).join(`
        `)}</div></details>`:""}
        ${z("__untagged__",`untagged ${Z}`,"show ONLY items with no tags — the tagging-backlog hunting set (W-019)")}
      </div>
      <button type="button" id="filter-clear" title="clear search text and all tag filters" hidden>clear</button>
    </div>
    <div id="collapse-strip" aria-label="collapse/expand columns">
      ${["Backlog","Todo","In Progress","Done"].map((j)=>`<button type="button" class="col-toggle" data-col-toggle="${M(j)}" title="collapse/expand the ${M(j)} column">${M(j)} <span class="col-toggle-icon" aria-hidden="true">▾</span></button>`).join(`
      `)}
    </div>
  </div>
</div>`}function X6($,J=[]){let{dreams:Z,messages:Q}=$,z={guiBaseUrl:$.guiBaseUrl,mirror:$.sessions,writesEnabled:$.writesEnabled,sessionBackend:$.sessionBackend,decisions:$.promoteDecisions,todoSubStates:$.todoSubStates,actionRequired:$.actionRequired,sessionStatus:$.sessionStatus},X=J.length===0?"":`<div class="notices">${J.map((V)=>`<div class="notice"><span class="mono dim">${$0(V.at)}</span> ${M(V.text)}</div>`).join("")}</div>`;return`${`<div class="meta mono">workspace ${M($.workspaceRoot)} · generated ${M($.generatedAt)} · live refresh 15s · ${Y9($.buildSha)}</div>`}
<h2>Board <span class="count">(${$.items.length} items · ${$.board.sessionOnly.length} session-only)</span> <span id="filter-count" class="count" title="how many work items the current filter shows / total — updated live by the filter bar"></span></h2>
${X}
${D9($.board,z,$.items)}
${$.writesEnabled?"":'<div class="meta">read-only view — the board write path stays sealed behind the hive_board_* tools (WI-062)</div>'}`}function A9($){let J=$.tagName;return J==="INPUT"||J==="TEXTAREA"||J==="SELECT"}function L9($){let J=$.ownerDocument.activeElement??null;if(!J||!$.contains(J))return null;let Z=null,Q=null;if(J instanceof HTMLInputElement||J instanceof HTMLTextAreaElement)try{Z=J.selectionStart,Q=J.selectionEnd}catch{}return{key:E9(J,$),name:J.getAttribute("name"),start:Z,end:Q}}function E9($,J){let Z=$;while(Z&&Z!==J){let Q=Z.getAttribute("data-key");if(Q)return Q;Z=Z.parentElement}return null}function x9($,J){if(!J)return;let Z=J.key!==null?$.querySelector(`[data-key="${z6(J.key)}"]`)??$:$,Q=J.name?`[name="${z6(J.name)}"]`:null,z=Q?Z.querySelector(Q):null;if(z instanceof HTMLElement){if(z.focus(),(z instanceof HTMLInputElement||z instanceof HTMLTextAreaElement)&&J.start!==null)try{z.setSelectionRange(J.start,J.end??J.start)}catch{}}}function z6($){return $.replace(/["\\]/g,"\\$&")}function q6($,J){let Z=L9($);Y6($,J,!0),x9($,Z)}function Y6($,J,Z=!1){if($.tagName!==J.tagName){$.replaceWith(J);return}R9($,J,Z),C9($,J)}function R9($,J,Z=!1){let Q=$.tagName==="DETAILS",z=A9($);for(let X of Array.from(J.attributes)){if(Q&&X.name==="open")continue;if(z&&X.name==="value")continue;if($.getAttribute(X.name)!==X.value)$.setAttribute(X.name,X.value)}if(!Z)for(let X of Array.from($.attributes)){if(Q&&X.name==="open")continue;if(z&&X.name==="value")continue;if(!J.hasAttribute(X.name))$.removeAttribute(X.name)}}function A0($){return $ instanceof Element?$.getAttribute("data-key"):null}function C9($,J){let Z=Array.from($.childNodes),Q=Array.from(J.childNodes),z=new Map;for(let q of Z){let V=A0(q);if(V!==null)z.set(V,q)}let X=0;for(let q of Q){let V=A0(q);if(V!==null&&z.has(V)){let K=z.get(V);z.delete(V);let Y=$.childNodes[X];if(Y!==K)$.insertBefore(K,Y??null);V6(K,q),X=k9($,K)+1;continue}let j=$.childNodes[X]??null;if(j&&A0(j)===null&&T9(j,q))V6(j,q),X++;else $.insertBefore(q.cloneNode(!0),j),X++}while($.childNodes.length>X)$.removeChild($.childNodes[X])}function k9($,J){return Array.prototype.indexOf.call($.childNodes,J)}function T9($,J){if($.nodeType!==J.nodeType)return!1;if($.nodeType===Node.ELEMENT_NODE)return $.tagName===J.tagName;return!0}function V6($,J){if($.nodeType===Node.ELEMENT_NODE&&J.nodeType===Node.ELEMENT_NODE){Y6($,J);return}if($.nodeType===Node.TEXT_NODE||$.nodeType===Node.COMMENT_NODE){if($.nodeValue!==J.nodeValue)$.nodeValue=J.nodeValue;return}$.replaceWith(J.cloneNode(!0))}var S9=["Backlog","Todo","In Progress","Done"],y={q:"hb.filter.q",tags:"hb.filter.tags",collapsed:"hb.collapsed",controls:"hb.controls.collapsed"};function I9(){try{return typeof window.matchMedia==="function"?window.matchMedia("(max-width:640px)").matches:!1}catch{return!1}}function r($){try{return window.localStorage.getItem($)}catch{return null}}function o($,J){try{window.localStorage.setItem($,J)}catch{}}function f9(){try{return new Set(JSON.parse(r(y.tags)??"[]"))}catch{return new Set}}function y9(){try{return new Set(JSON.parse(r(y.collapsed)??"[]"))}catch{return new Set}}function b9(){let $=r(y.controls);if($==="collapsed")return!0;if($==="expanded")return!1;return I9()}var U={q:r(y.q)??"",tags:f9(),collapsed:y9(),controlsCollapsed:b9()},v=[];function v9(){let $=document.getElementById("filter-corpus");if(!$||!$.textContent)return v;try{let J=JSON.parse($.textContent);return Array.isArray(J)?J:v}catch{return v}}var f="__untagged__";function g9($){let J=U.tags.has(f),Z=[...U.tags].filter((Q)=>Q!==f);if(J&&$.tags.length>0)return!1;if(!J){for(let Q of Z)if(!$.tags.includes(Q))return!1}else if(Z.length>0)return!1;if(U.q){let Q=U.q.toLowerCase();if(!$.hay.includes(Q))return!1}return!0}function J0(){v=v9();let $=new Map;for(let X of v)$.set(X.id,g9(X));let J=U.q!==""||U.tags.size>0,Z=0,Q=0;for(let X of Array.from(document.querySelectorAll(".card.wi"))){let q=X.getAttribute("data-key")??"",V=q.startsWith("wi:")?q.slice(3):"",j=!J||$.get(V)===!0;if(X.classList.toggle("filter-hidden",!j),J)if(j)Z++;else Q++}for(let X of Array.from(document.querySelectorAll(".card.session-only")))X.classList.toggle("filter-dim",J);let z=document.getElementById("board-root");if(z)z.classList.toggle("filter-empty",J&&v.length>0&&Z===0);w9(J,Z,Q),p9(J,Z),m9()}function h9(){let $=[...U.tags].filter((X)=>X!==f);if($.length<2)return null;if(U.tags.has(f))return null;let J=U.q.toLowerCase(),Z=(X)=>J===""||X.hay.includes(J),Q=$.map((X)=>v.filter((q)=>q.tags.includes(X)&&Z(q)).length);if(Q.some((X)=>X===0))return null;return`no items have all of: ${$.map((X,q)=>`${X} (${Q[q]})`).join(" + ")} — each has matches individually`}function w9($,J,Z){let Q=document.getElementById("filter-count");if(!Q)return;let z=v.length,X=v.filter((q)=>q.tags.length===0).length;if(z===0){Q.textContent="· board is empty",Q.title="no work items on the board at all";return}if(!$){Q.textContent=`· ${z} items · ${X} untagged`,Q.title=`${X} of ${z} items carry no tags — the set a tag filter cannot reach (tap "untagged" to list them)`;return}if(J===0){let q=[...U.tags].filter((j)=>j!==f);if(U.tags.has(f)&&q.length>0){Q.textContent="· nothing can match — untagged + a tag is empty by definition",Q.title=`the untagged filter lists ONLY items with no tags, and ${q.join(" + ")} require${q.length===1?"s":""} a tag. Drop one of them.`;return}let V=h9();if(V){Q.textContent=`· ${V} — ${Z} hidden`,Q.title=`the AND-combination is empty: no single item carries every selected tag. Remove one tag to widen the result. ${X} item${X===1?"":"s"} on the board carry no tags.`;return}Q.textContent=Z>0?`· no items match — ${Z} hidden`:"· no items match",Q.title=`the filter hid all ${Z} item${Z===1?"":"s"}. ${X} item${X===1?"":"s"} on the board carry no tags and can only be reached via the "untagged" filter or free text.`}else Q.textContent=`· showing ${J}/${z} · ${X} untagged`,Q.title=`${Z} hidden by the filter · ${X} of ${z} items carry no tags`}function u9($,J){if(!$)return{text:"no filter active",tags:[],untaggedActive:!1};let Z=[...U.tags].filter((V)=>V!==f).sort(),Q=U.tags.has(f),z=U.q!==""?`“${U.q}”`:"",X=`showing ${J}/${v.length}`,q=[z,...Z,...Q?["untagged"]:[]];return{text:q.length>0?`${q.join(" + ")} · ${X}`:X,tags:Z,untaggedActive:Q}}function p9($,J){let Z=document.getElementById("controls-summary");if(!Z)return;let{text:Q,tags:z,untaggedActive:X}=u9($,J);if(Z.textContent="",Z.classList.toggle("has-filter",$),!$){Z.textContent=Q;return}let q=[...z,...X?[f]:[]],V=q.length,j=()=>{if(Z.textContent="",U.q!==""){let W=document.createElement("span");W.className="summary-q",W.textContent=`“${U.q}”`,Z.appendChild(W)}for(let W of q.slice(0,V)){let H=document.createElement("span");if(H.className="tag-chip active",W===f)H.setAttribute("data-tag",f);if(H.textContent=W===f?"untagged":W,V===1)H.classList.add("summary-chip-shrink");Z.appendChild(H)}let K=q.length-V;if(K>0){let W=document.createElement("span");W.className="summary-more",W.textContent=`+${K} more`,W.title=`${K} more active tag${K===1?"":"s"}: ${q.slice(V).join(", ")} — tap “filters” to expand`,Z.appendChild(W)}let Y=document.createElement("span");Y.className="summary-n",Y.textContent=`${J}/${v.length}`,Z.appendChild(Y)};j();while(V>1&&Z.scrollWidth>Z.clientWidth)V--,j();Z.title=Q}function m9(){let $=document.getElementById("filter-q");if($&&$.value!==U.q)$.value=U.q;let J=document.getElementById("filter-clear");if(J)if(U.q!==""||U.tags.size>0)J.removeAttribute("hidden");else J.setAttribute("hidden","");for(let Z of Array.from(document.querySelectorAll("#filter-tags .tag-chip"))){let Q=Z.getAttribute("data-tag")??"";Z.classList.toggle("active",U.tags.has(Q)),Z.setAttribute("aria-pressed",U.tags.has(Q)?"true":"false")}for(let Z of Array.from(document.querySelectorAll("[data-col-toggle]"))){let Q=Z.getAttribute("data-col-toggle")??"";Z.setAttribute("aria-pressed",U.collapsed.has(Q)?"true":"false")}}function E0(){for(let $ of S9){let J=U.collapsed.has($),Z=document.querySelector(`.col[data-col="${W6($)}"]`);if(Z)Z.classList.toggle("collapsed",J);for(let Q of Array.from(document.querySelectorAll(`[data-col-toggle="${W6($)}"]`)))Q.setAttribute("aria-pressed",J?"true":"false")}}function W6($){return $.replace(/["\\]/g,"\\$&")}function c9($){if(U.collapsed.has($))U.collapsed.delete($);else U.collapsed.add($);o(y.collapsed,JSON.stringify([...U.collapsed])),E0()}function Y0(){let $=document.getElementById("board-controls");if(!$)return;let J=U.controlsCollapsed;$.classList.toggle("controls-collapsed",J);let Z=document.getElementById("controls-toggle");if(Z)Z.setAttribute("aria-expanded",J?"false":"true"),Z.textContent=J?"filters ▾":"filters ▴",Z.title=J?"expand the filter/tag controls":"collapse the filter/tag controls"}function d9(){U.controlsCollapsed=!U.controlsCollapsed,o(y.controls,U.controlsCollapsed?"collapsed":"expanded"),Y0()}function l9($){let J=$.target;if(!J)return;if(J.closest("#controls-toggle")){$.preventDefault(),d9();return}let Z=J.closest("[data-col-toggle]");if(Z){let z=Z.getAttribute("data-col-toggle");if(z)$.preventDefault(),c9(z);return}let Q=J.closest("#filter-tags .tag-chip");if(Q){let z=Q.getAttribute("data-tag");if(z){if(U.tags.has(z))U.tags.delete(z);else U.tags.add(z);o(y.tags,JSON.stringify([...U.tags])),J0()}return}if(J.closest("#filter-clear"))U.q="",U.tags.clear(),o(y.q,""),o(y.tags,"[]"),J0()}function n9($){let J=$.target;if(!J||J.id!=="filter-q")return;U.q=J.value,o(y.q,U.q),J0()}var L0=!1;function K6(){if(L0)return;if(L0=!0,document.addEventListener("click",l9),document.addEventListener("input",n9),Y0(),E0(),J0(),r(y.controls)===null&&typeof window.matchMedia==="function")try{let $=window.matchMedia("(max-width:640px)"),J=(Z)=>{if(r(y.controls)!==null)return;U.controlsCollapsed=Z.matches,Y0()};if(typeof $.addEventListener==="function")$.addEventListener("change",J);else if(typeof $.addListener==="function")$.addListener(J)}catch{}}function j6(){if(!L0)return;Y0(),E0(),J0()}U0();j0();var Y2=30000,I6="hvb-favicon",W2="data-plugin-favicon",K2=34;function b0($){let J=typeof $?.runningAgents==="number"&&isFinite($.runningAgents)&&$.runningAgents>0?Math.floor($.runningAgents):0,Z=typeof $?.hiveRunningAgents==="number"&&isFinite($.hiveRunningAgents)&&$.hiveRunningAgents>0?Math.floor($.hiveRunningAgents):0;if(J<=0)return{tier:"quiet",running:0,hive:0};return Z>0?{tier:"hive",running:J,hive:Z}:{tier:"ambient",running:J,hive:0}}function f6($){let{running:J}=b0($);return J>0?{session:"active",dreaming:!1,count:J}:{session:"quiet",dreaming:!1,count:0}}var j2="#d29922",M2="#866d3c";function y6($){return $.split(j2).join(M2)}var f0=!1,T6="";function U2($){let J=document.getElementById(I6);if(!J)return;let Z=f6($),{tier:Q}=b0($),z=Q==="ambient"?y6(D0(Z)):D0(Z),X="data:image/svg+xml,"+encodeURIComponent(z);if(X===T6)return;T6=X,J.setAttribute("href",X)}async function y0(){try{let $=await fetch(g0,{headers:{accept:"application/json"}});if(!$.ok)return;let J=await $.json();if(!J||typeof J!=="object"||J.ok!==!0)return;let Q=h0(J).activity;U2(Q),v0(Q)}catch{}}function a(){if(!document.hidden)y0()}var S6="";function v0($){let J=document.getElementById("hvb-panel-mark");if(!J)return;let Z=f6($),{tier:Q,running:z,hive:X}=b0($),q=`${Q}:${Z.count}`;if(q===S6)return;S6=q;let V=typeof $?.sampledAt==="string"?$.sampledAt.slice(0,16).replace("T"," "):"?",j=Q==="hive"?`${z} HIVE agent${z===1?"":"s"} running`:Q==="ambient"?`${z} other agent${z===1?"":"s"} running · no HIVE session active`:"quiet — nothing running";J.innerHTML=y6(N0(Z,{idPrefix:"hvbp",animate:!0,size:K2}));let K=J.querySelector("svg");if(K){let Y=document.createElementNS("http://www.w3.org/2000/svg","title");Y.textContent=`${j} · sampled ${V} UTC (may lag one poll cycle)`,K.insertBefore(Y,K.firstChild)}}function b6($){if(f0)return;if(typeof document>"u")return;f0=!0,$.effect(()=>{let Z=document.querySelector('link[rel="icon"]'),Q=document.createElement("link");return Q.id=I6,Q.rel="icon",Q.type="image/svg+xml",Q.setAttribute(W2,"@hive/dsh-board"),document.head.appendChild(Q),y0(),document.addEventListener("visibilitychange",a),window.addEventListener("pageshow",a),window.addEventListener("focus",a),()=>{if(Q.remove(),Z)Z.setAttribute("href",Z.getAttribute("href")??"");document.removeEventListener("visibilitychange",a),window.removeEventListener("pageshow",a),window.removeEventListener("focus",a),f0=!1}},"board favicon driver");let J=$.interval;if(typeof J==="function")J(()=>{y0()},Y2);else console.error("[@hive/dsh-board] favicon driver: no interval service — cadence degraded to refresh-on-visible")}var v6={high:0,medium:1,low:2};function w0($){return[...$].sort((J,Z)=>{let Q=v6[J.priority],z=v6[Z.priority];if(Q!==z)return Q-z;let X=u(J),q=u(Z);if(X!==q)return q.localeCompare(X);return Z.id.localeCompare(J.id)})}function g6($,J){let Z=u($),Q=u(J);if(Z!==Q)return Q.localeCompare(Z);return J.id.localeCompare($.id)}function h6($,J){let Z=new Set;for(let Q of $){if(Q.owner_session)Z.add(Q.owner_session);for(let z of Q.released_sessions)Z.add(z)}return{backlog:w0($.filter((Q)=>Q.status==="backlog")),todo:w0($.filter((Q)=>Q.status==="todo")),inProgress:$.filter((Q)=>Q.status==="in_progress").sort(g6),done:$.filter((Q)=>Q.status==="done").sort(g6),sessionOnly:J.cards.filter((Q)=>!Z.has(Q.id))}}var g0="/api/hive-board/index",G2=15000,G0="afbd5af-dirty";function B2($){if(!$||$==="unknown"||G0==="unknown")return"unknown";return $===G0?"match":"mismatch"}function H2($){let J=document.getElementById("build-badge");if(!J)return;if(B2($)==="mismatch")J.classList.add("stale"),J.textContent=`stale client — reload (bundle ${G0} ≠ host ${$})`,J.setAttribute("title",`this tab is running an old client bundle (built ${G0}) against a newer host build (${$}). Reload the page to get the current bundle.`);else J.classList.remove("stale")}var w6={available:!1,computedAt:"",totalPersisted:0,awakeIds:0,awakeDeleted:0,cards:[],persistedIds:[]},P2={artifactCounts:{insight:0,warning:0,songline:0,shadow:0,total:0},active:[],history:[],recentArtifacts:[]};function F2($){return{...$,tags:Array.isArray($.tags)?$.tags:[],subtasks:Array.isArray($.subtasks)?$.subtasks:[],todo_mirror:Array.isArray($.todo_mirror)?$.todo_mirror:[],transitions:Array.isArray($.transitions)?$.transitions:[],released_sessions:Array.isArray($.released_sessions)?$.released_sessions:[],artifacts:Array.isArray($.artifacts)?$.artifacts:[],problems:Array.isArray($.problems)?$.problems:[],status:$.status,priority:$.priority,origin:$.origin}}function h0($){let J=(Array.isArray($.items)?$.items:[]).map(F2);return{generatedAt:typeof $.generated==="string"?$.generated:"",workspaceRoot:typeof $.workspaceRoot==="string"?$.workspaceRoot:"(unknown workspace)",buildSha:typeof $.boardBuild==="string"&&$.boardBuild!==""?$.boardBuild:"unknown",activity:$.activity,guiBaseUrl:"",capabilities:[],dreams:P2,messages:[],items:J,board:h6(J,{...w6}),writesEnabled:!1,sessionBackend:"unconfigured",promoteDecisions:{},sessions:{...w6},todoSubStates:{},actionRequired:{},sessionStatus:{}}}var O2=null,m6="";function _2($){let J=document.createElement("main");return J.id="board-root",J.innerHTML=X6($),J}function N2($){let J=document.getElementById("board-root");if(!J)return;q6(J,_2($)),H2($.buildSha),j6()}async function u0(){try{let $=await fetch(g0,{headers:{accept:"application/json"}});if(!$.ok)return;let J=await $.json();if(!J||typeof J!=="object"||J.ok!==!0)return;if(!Array.isArray(J.items))return;let Z=h0(J);O2=Z,m6=Z.buildSha,v0(Z.activity),D2(Z),N2(Z)}catch{}}var u6=!1;function D2($){if(u6)return;let J=document.getElementById("board-controls-host");if(!J)return;J.innerHTML=Q6($),u6=!0}function p0(){if(document.hidden)return;u0()}document.addEventListener("visibilitychange",p0);window.addEventListener("pageshow",p0);window.addEventListener("focus",p0);var p6=!1;function c6($){if(K6(),T0(),O6($),!p6){p6=!0;let J=$.interval;if(typeof J==="function")J(()=>{u0()},G2);else console.error("[@hive/dsh-board] no interval service — poll cadence degraded to refresh-on-visible")}u0()}U0();var d6="/api/hive-state/session";function l6($,J){let Z=[];for(let Q of Object.values($?.byId??{}))if(Q&&Q.parentId===J&&Q.running===!0)Z.push(Q);return Z}function n6($,J){let Z=[];for(let Q of Object.values($?.byId??{}))if(Q&&Q.parentId===J)Z.push(Q);return Z}function o6($){if(!$)return[];let J=[],Z=$.hive;if(Z?.isCoordinator){let Q=Z.lastAwakenInput?` — "${Z.lastAwakenInput}"`:"";J.push({ts:Z.awakenedAt??null,kind:"awaken",text:`awakened as ${Z.agent??"unknown"}${Q}`})}for(let Q of $.usageMarks??[])J.push({ts:Q.timestamp,kind:"registered",text:`registered — dispatched as ${Q.capability}`});for(let Q of $.dreamEvents??[])J.push({ts:Q.ts,kind:"dream",text:`dream archive ${Q.tool}`});for(let Q of $.dreams?.history??[])J.push({ts:Q.entryTime,kind:"dream",text:`dreaming · ${Q.dreamId} started${Q.exitTime?" · completed":""}`});for(let Q of $.dreams?.active??[])J.push({ts:Q.entryTime,kind:"dreaming",text:`dreaming · ${Q.dreamId} (active)`});for(let Q of $.children??[]){let z=Q.capability?` as ${Q.capability}`:"",X=Q.label?` — "${Q.label}"`:"";J.push({ts:Q.createdAtMs?new Date(Q.createdAtMs).toISOString():null,kind:"dispatched",text:`child dispatched${z}${X} (${Q.mode})`})}if($.goal?.createdAt){let Q=typeof $.goal.roundsStarted==="number"?`, round ${$.goal.roundsStarted}`:"";J.push({ts:$.goal.createdAt,kind:"goal",text:`goal set · ${String($.goal.status??"")}${Q}`})}return J.sort((Q,z)=>new Date(z.ts||0).getTime()-new Date(Q.ts||0).getTime())}function m0($){let{payload:J,routeReachable:Z,pageRunning:Q}=$,z=J?.hive?.isCoordinator===!0;if(Q===!0||Z&&A2(J))return{stage:"working",tone:"live"};if(J===void 0)return{stage:"dormant",tone:"unknown"};if((J.dreams?.active?.length??0)>0)return{stage:"dreaming",tone:"dream"};if(z)return{stage:"awakened",tone:"hive"};if((J.usageMarks?.length??0)>0)return{stage:"registered",tone:"ambient"};if(J.live===!0)return{stage:"idle",tone:"ambient"};return{stage:"dormant",tone:"ambient"}}function A2($){if(!$)return!1;let J=$.idBare;for(let Z of $.agents??[])if(Z.id===$.id||L2(Z.id)===J)return Z.status==="running";return!1}function L2($){return $.startsWith("session-")?$.slice(8):$}function c0($,J){if(!$)return"";let Z=J-new Date($).getTime();if(!isFinite(Z)||Z<0)return"";if(Z<45000)return"seconds";if(Z<3600000)return`${Math.max(1,Math.round(Z/60000))}m`;if(Z<86400000)return`${Math.round(Z/3600000)}h`;return`${Math.round(Z/86400000)}d`}function r6($){if(!$||!Array.isArray($.history))return[];return $.history.map((J)=>({ts:J.at,kind:"transition",text:`${J.from===null||J.from===void 0?"∅":J.from} → ${J.to} (by ${J.by}${J.session?`, ${J.session.slice(0,12)}`:""})`}))}function z0($){if(!$)return"—";let J=new Date($);if(isNaN(J.getTime()))return String($);return J.toISOString().slice(0,16).replace("T"," ")}function B0($){if(!$)return"";let J=Date.now()-new Date($).getTime();if(!isFinite(J))return"";if(J<45000)return"now";if(J<3600000)return`${Math.round(J/60000)}m ago`;if(J<86400000)return`${Math.round(J/3600000)}h ago`;return`${Math.round(J/86400000)}d ago`}async function i6($){let J=await fetch(`/api/hive-board/session-item?id=${encodeURIComponent($)}`,{cache:"no-store"});if(!J.ok)throw Error(`route ${J.status}`);let Z=await J.json();if(Z?.ok===!1)throw Error("bad request");return{item:Z.item??null,history:Array.isArray(Z.history)?Z.history:[],historyTotal:typeof Z.historyTotal==="number"?Z.historyTotal:0}}async function E2($){let J=await fetch(`${d6}?id=${encodeURIComponent($)}`,{cache:"no-store"});if(!J.ok)throw Error(`route ${J.status}`);return await J.json()}var s6=`
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
.hvs-pill[data-tone="dream"] .hvs-dot{background:var(--dsw-alias-state-warn-primary)}
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
`;function B($,J,Z){let Q=document.createElement($);if(J)Q.className=J;if(Z!==void 0)Q.textContent=Z;return Q}var x2="hvs-timeline-panel";async function R2($,J){let Z=$&&$.layout;if(Z&&typeof Z.selectPanel==="function"){try{Z.selectPanel("hive-board")}catch{}for(let z=0;z<40;z++){if(document.querySelector(".hvb-root"))break;await new Promise((X)=>setTimeout(X,60))}}let{openDrawer:Q}=await Promise.resolve().then(() => (U0(),k6));return await Q(J),"drawer"}var C2={awaken:"◈",registered:"◇",working:"▶",idle:"⏸",done:"■",dispatched:"⇗",returned:"⇙",goal:"◎",dream:"☾",dreaming:"☾",transition:"⇄"};function t6($,J){let Z=J;return function(z){let X=typeof z.sessionId==="string"?z.sessionId:"",q=typeof z.useSessions==="function"?z.useSessions:void 0,[V,j]=Z.useState(void 0),[K,Y]=Z.useState(!1),[W,H]=Z.useState(!1),[P,G]=Z.useState({pairing:void 0,pending:!0}),F=Z.useRef(!1);F.current=W;let[L,N]=Z.useState([]),[A,x]=Z.useState(Date.now()),T=Z.useRef(void 0),S=Z.useRef(""),p=Z.useRef(new Map),m=Z.useRef(!1),_=Z.useRef(null),C=q?q((D)=>D):void 0,b=C?.byId??{},w=X?b[X]:void 0,l=w?w.running===!0:void 0,H0=l6(C,X),P0=n6(C,X);if(Z.useEffect(()=>{let D=T.current;if(D!==void 0&&D!==l){let E={ts:new Date().toISOString(),kind:l?"working":"idle",text:l?"working — turn started (observed)":"idle — turn ended (observed)",observed:!0};N((g)=>[E,...g].slice(0,40))}T.current=l;for(let E of P0){if(p.current.get(E.id)===!0&&E.running!==!0){let R={ts:new Date().toISOString(),kind:"returned",text:`child returned — ${String(E.displayTitle??E.title??E.id).slice(0,40)} (observed)`,observed:!0};N((O0)=>[R,...O0].slice(0,40))}p.current.set(E.id,E.running===!0)}let I=V?.goal;if(I){let E=`${I.roundsStarted??"?"}/${I.status??"?"}`;if(S.current!==""&&S.current!==E){let g={ts:I.updatedAt??new Date().toISOString(),kind:"goal",text:`goal → round ${I.roundsStarted??"—"} · ${I.status??""} (observed)`,observed:!0};N((R)=>[g,...R].slice(0,40))}S.current=E}if(X){let E=b[X]!==void 0;if(m.current&&!E){let g={ts:new Date().toISOString(),kind:"done",text:"done — session removed from the live session list (observed)",observed:!0};N((R)=>[g,...R].slice(0,40))}m.current=E}},[l,P0,X,b,V?.goal]),Z.useEffect(()=>{if(!X)return;let D=!1,I,E=()=>{if(E2(X).then((R)=>{if(D)return;Y(R?.ok===!1),j(R.ok===!1?void 0:R)}).catch(()=>{if(D)return;Y(!0)}).finally(()=>{if(!D)I=setTimeout(E,6000)}),!F.current)return;i6(X).then((R)=>{if(D)return;G({pairing:R,pending:!1})}).catch(()=>{if(D)return;G((R)=>({...R,pending:!1,error:!0}))})};return E(),(()=>{i6(X).then((R)=>{if(!D)G({pairing:R,pending:!1})}).catch(()=>{if(!D)G((R)=>({...R,pending:!1,error:!0}))})})(),()=>{if(D=!0,I)clearTimeout(I)}},[X,W]),Z.useEffect(()=>{if(!W||!X)return;let D=document.body.appendChild(B("div","hvs-panel"));D.id=x2;let I=()=>{if(!D.isConnected)return;D.innerHTML="",T2(D,{sessionId:X,data:V,fetchFailed:K,row:w,kids:H0,kidsAll:P0,eventNotes:L,nowTick:A,itemCard:P,pluginCtx:$,onClose:()=>H(!1)});let c=_.current?.getBoundingClientRect();if(c){let V0=Math.max(8,c.top-D.offsetHeight-10);D.style.top=`${V0}px`,D.style.left=`${Math.min(Math.max(8,c.right-D.offsetWidth),window.innerWidth-D.offsetWidth-8)}px`}};I();let E=()=>I();window.addEventListener("resize",E),window.addEventListener("scroll",E,!0);let g=(c)=>{let V0=c.target;if(!D.contains(V0)&&_.current&&!_.current.contains(V0))H(!1)},R=(c)=>{if(c.key==="Escape")H(!1)};document.addEventListener("click",g,!0),document.addEventListener("keydown",R);let O0=setInterval(()=>x(Date.now()),1000);return()=>{window.removeEventListener("resize",E),window.removeEventListener("scroll",E,!0),document.removeEventListener("click",g,!0),document.removeEventListener("keydown",R),clearInterval(O0),D.remove()}},[W,X,V,K,w,L,A]),!X)return null;let F0=m0({payload:K?void 0:V,routeReachable:!K,pageRunning:l}),d0=K?null:V?.goal?.roundsStarted,l0=K?"":V?.hive?.isCoordinator===!0?"hive":"ambient";return Z.createElement("span",{className:"hvs-pill","data-tone":F0.tone,"data-slot-hive-state":X,role:"button","aria-expanded":W?"true":"false",ref:(D)=>{_.current=D},onClick:()=>H((D)=>!D),title:"HIVE state of this session (WI-083, read-only)"},Z.createElement("span",{className:"hvs-dot","data-dot":F0.tone}),Z.createElement("span",{className:"hvs-word"},`hive · ${K?"route pending":F0.stage}`),d0?Z.createElement("span",{className:"hvs-badge"},`r${d0}`):null,H0.length>0?Z.createElement("span",{className:"hvs-badge"},`+${H0.length}`):null,l0?Z.createElement("span",{className:"hvs-badge"},l0):null)}}function a6($,J){for(let Z of $)if(Z.kind===J&&Z.ts)return Z.ts;return null}function k2($,J){let Z=null,Q=(z)=>{if(!z)return;let X=new Date(z).getTime();if(isFinite(X)&&(Z===null||X>Z))Z=X};Q(J?.updatedAt?new Date(J.updatedAt).toISOString():void 0),Q($?.goal?.updatedAt),Q($?.hive?.awakenedAt),Q($?.generated);for(let z of $?.usageMarks??[])Q(z.timestamp);for(let z of $?.dreamEvents??[])Q(z.ts);for(let z of $?.children??[])Q(z.createdAtMs?new Date(z.createdAtMs).toISOString():null);if(J?.updatedAt&&(Z===null||J.updatedAt>Z))Z=J.updatedAt;return Z===null?null:new Date(Z).toISOString()}function T2($,J){let Z=String(J.row?.displayTitle??J.row?.title??J.sessionId.slice(0,12)),Q=B("div","hvs-head"),z=B("div","hvs-title");z.textContent=`HIVE state — ${Z}`,Q.appendChild(z);let X=B("button","hvs-close","✕");X.addEventListener("click",()=>J.onClose()),Q.appendChild(X),$.appendChild(Q);let q=m0({payload:J.fetchFailed?void 0:J.data,routeReachable:!J.fetchFailed,pageRunning:J.row?J.row.running===!0:void 0}),V=B("div","hvs-stage");if(J.fetchFailed)V.setAttribute("data-live","0");else V.setAttribute("data-live",q.tone==="live"?"1":"0");let j=B("span","hvs-now",J.fetchFailed?"stage unknown":`now: ${q.stage}`);V.appendChild(j);let K=a6(J.eventNotes,"working");if(q.stage==="working"){let _=K?c0(K,J.nowTick):"";V.appendChild(B("span","hvs-dur",_?`${_} so far`:"in progress — enter time not observed"))}let Y=k2(J.fetchFailed?void 0:J.data,J.row);V.appendChild(B("span","hvs-sig",`latest signal ${z0(Y)} · ${B0(Y)}`)),$.appendChild(V);let W=B("div","hvs-card-wrap");if(J.itemCard.pending)W.appendChild(B("div","hvs-card-empty","attached board item — loading…"));else if(J.itemCard.error)W.appendChild(B("span","hvs-flag","board pairing unavailable — is the board route live yet?"));else if(J.itemCard.pairing?.item){let _=J.itemCard.pairing.item,C=B("div","hvs-card");C.setAttribute("role","button"),C.setAttribute("title",`Open ${_.id} in the HIVE Board tab`);let b=B("div","hvs-card-top");b.appendChild(B("span","hvs-card-id",_.id)),b.appendChild(B("span","hvs-card-status",_.status)),b.appendChild(B("span","hvs-card-prio",_.priority)),C.appendChild(b);let w=B("div","hvs-card-title",_.title);C.appendChild(w),C.addEventListener("click",()=>{R2(J.pluginCtx,_.id)}),W.appendChild(C)}else W.appendChild(B("div","hvs-card-empty","no owned board item — the session has not owned one (owner/bind/history found none)"));$.appendChild(W);let H=B("div","hvs-meta"),P=J.data?.hive,G=B("div");if(J.fetchFailed)G.appendChild(B("span","hvs-flag","host route not live yet — the timeline needs the next dsh-web bounce (route shipped in @hive/dsh-evolution, read-only)"));else if(P?.isCoordinator)G.appendChild(B("span","hvs-hive","HIVE coordinator")),G.appendChild(document.createTextNode(` — ${P.agent??"unknown"} · awakened ${z0(P.awakenedAt)} (${B0(P.awakenedAt)})`));else G.appendChild(B("span","","not an awakened coordinator"));H.appendChild(G);let F=J.data?.live,L=B("div");L.appendChild(document.createTextNode(J.fetchFailed?"host truth: unknown (route pending)":`host truth: ${F===!0?"live on this host":"not live on this host"} · ${J.data?.runningAgents??0} agents running`)),H.appendChild(L);let N=J.data?.goal,A=B("div");if(N){let _=N.objective&&N.objective.length>90?`${N.objective.slice(0,90)}…`:N.objective;if(A.appendChild(B("b","",`goal · round ${N.roundsStarted??"—"} · ${N.status??""}`)),_)A.appendChild(document.createTextNode(` — ${_}`))}else if(!J.fetchFailed&&J.data?.goalReason==="no-live-agent")A.appendChild(B("span","hvs-flag","goal not observable (session not live on this host)"));else A.appendChild(B("span","","no active goal"));H.appendChild(A);let x=B("div"),T=J.data?.childrenTotal??J.kidsAll.length;x.appendChild(document.createTextNode(`children: ${J.kids.length} in flight · ${T} known`));for(let _ of J.kids.slice(0,3))x.appendChild(B("span","",` · ${String(_.displayTitle??_.id).slice(0,24)}`));H.appendChild(x),$.appendChild(H);let S=B("div","hvs-rows"),p=[...J.eventNotes,...o6(J.fetchFailed?void 0:J.data),...r6(J.fetchFailed?void 0:J.itemCard?.pairing)].sort((_,C)=>new Date(C.ts||0).getTime()-new Date(_.ts||0).getTime());if(p.length===0)S.appendChild(B("div","hvs-empty","no HIVE records for this session yet — stage transitions land here as they happen"));else for(let _ of p.slice(0,80)){let C=B("div",`hvs-row${_.observed?" hvs-observed":""}`);C.appendChild(B("span","hvs-t",`${z0(_.ts)}${_.ts?` · ${B0(_.ts)}`:""}`));let b=B("span","hvs-g",C2[_.kind]??"•");if(b.setAttribute("data-kind",_.kind),C.appendChild(b),C.appendChild(B("span","hvs-text",_.text)),_.kind==="working"&&q.stage==="working"&&_.ts===a6(J.eventNotes,"working")){let w=K?c0(K,J.nowTick):"";C.classList.add("hvs-current"),C.appendChild(B("span","hvs-dur",w?`${w} so far`:""))}S.appendChild(C)}$.appendChild(S);let m=B("div","hvs-foot");m.textContent=`read-only WI-083 overlay · session-scoped · sources: hive-sessions.json · hive-state.json · dream telemetry · subagent catalog · snapshot ${z0(J.data?.generated)}`,$.appendChild(m)}var S2=`
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
`,I2='<div class="empty">Fetching the board…</div>',f2='<div class="hvb-head-row"><span id="hvb-panel-mark" class="hb-mark" title="board activity"></span></div>'+'<div class="hvb-sub">read-only view of the workspace board (WI-*) — the write path stays sealed behind the hive_board_* tools (WI-062)</div>'+`<div id="board-controls-host"></div><main id="board-root">${I2}</main>`;function y2($){let J=typeof $==="number"&&isFinite($)?$:20;return`<svg width="${J}" height="${J}" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><rect x="3" y="4" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/><rect x="3" y="15" width="5" height="5" rx="1" fill="currentColor" opacity="0.35"/><rect x="10" y="4" width="5" height="13" rx="1" fill="currentColor" opacity="0.8"/><rect x="10" y="19" width="5" height="1" rx="0.5" fill="currentColor" opacity="0.35"/><rect x="17" y="4" width="5" height="5" rx="1" fill="currentColor" opacity="0.8"/><rect x="17" y="11" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/></svg>`}globalThis.__BOARD_ENGINE={CSS:Z6,CSS_OVERRIDES:S2+I0+s6,SHELL_MARKUP:f2,ICON_SVG:y2,attachEngine:c6,startFaviconDriver:b6,makeHiveStateDock:t6};})();
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
