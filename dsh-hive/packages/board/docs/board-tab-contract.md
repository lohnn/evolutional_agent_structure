# HIVE Board → DSH web tab — pinned contract (WI-062 slice 1)

Re-verified against the **live** dsh **0.1.6-alpha.2** web boot on 2026-09-18 (not carried
over from the 0.1.5-rc.2-era dream contract). Every load-bearing claim names its evidence.

Where a dream artifact was confirmed it is cited (I-xxx/W-xxx); where it was **corrected** it
is cited as superseded-by this document.

---

## 0. Verification basis

- Live boot: `pnpm dlx @deepseek-ai/dsh@0.1.6-alpha.2 --profile web --port 4501` under
  svcwatch (PID tree 24→26→73), cwd `/workspace`, tee'd log `/tmp/dsh-web.log`.
  Profile **dist** `/workspace/web` is NOT what boots — see §1.
- Runtime source truth: pnpm store `@deepseek-ai/*` 0.1.6-alpha.2 trees; the host Service
  catalog pulled via `cordis_inspect` (Service.listService); client slot tree pulled by the
  coordinator from a live page-backed `Slots.listSubTree` (client queries cannot answer from
  a capability position — parent-side only; see §7.2).
- Precedent packages read end-to-end: `packages/berget-usage` (0.2.0: package.json + index.js
  + client.js + cordis.patch.yml), `packages/provider-usage` (0.1.0: same four), and
  `packages/board` src. `dsh-berget-usage`'s snapshot route was probed **on the live boot**.

## 1. Runtime topology — the I-116 / I-145 / I-146 reconciliation

Both memories were true of **different surfaces**:

| Surface | Path | Install mode | Serves |
|---|---|---|---|
| **LIVE web profile** | `/root/.dsh/profiles/web` | `link:` symlinks into the monorepo for **all 10 cohort packages** (verified `node_modules/@hive/*` → `projects/evolutional_agent_structure/dsh-hive/packages/*`; only `dsh-web-search-searxng` is versioned) | the git **working tree** (W-084 applies on every reload) |
| **Kit dist** | `/workspace/web` | tarball cohort (10 `*.tgz`, 2026-09-18) + **dual-mode** `.pnpmfile.cjs` (git **or** tarball siblings; tarball rewrites are ABSOLUTE `file:` paths anchored at the hook's `__dirname`, annotated "verified 2026-09-18, dsh 0.1.6-alpha.2 adoption gate") | other machines via `dsh plugin add` |
| **Kit updater** | `/root/.dsh/hive-kit/dsh-hive-update.sh` | deployed stale copy (`0.1.6-alpha.1`-era, boardless) — the AUTHORED source is `/workspace/projects/evolutional_agent_structure/dsh-hive-dist/dsh-hive-update.sh` (**10 packages**, board included, `DSH_VERSION` default `0.1.6-alpha.2`); deployed kit refresh = coordinator cp from source | `~/.dsh/profiles/*` on kit machines |

Consequences that pin later slices:

- For the live tab, **no reinstall step exists**: the working tree already mounts. A rebuild
  of board dist + **one dsh-web bounce** is the entire deployment (W-084 + W-093).
- The kit copy of board must be **repacked** (`repack` refers to kit tarballs only); the live
  surface never sees the tarball.
- Profile `pnpm-workspace.yaml` (live) needs NO `dangerouslyAllowAllBuilds` (that is the
  git-cohort prepare/tsc requirement, kit-side only).
- Live profile profile-manifest facts (kit template `/workspace/web/*.yml` differ from the
  composed live ones — always read the **live** profile files, the kit ones are stale
  templates): live `cordis.patch.yml` carries the 7 `@hive` LOAD rows (board row ids
  `board`/name `@hive/dsh-board`, with machine-specific `config.directory: /workspace` on
  four of them and disabled deepseek rows); berget trio rides as **bundle layers**.
  `dsh.profile.patchReload: "live"` is set — patch edits hot-reload, module changes do NOT.

## 2. Decision D1 — the client surface lives INSIDE `@hive/dsh-board`

Evidence:

1. The cohort's two-face precedent (berget-usage, provider-usage) is **one package = host
   half + prebuilt `./client` export + `dsh.client` stanza + `dsh.bundle.patch`**.
2. Board today has NO `dsh` stanza and no `./client` export (verified in the installed live
   copy and in source) — the tab is purely additive.
3. Board's LOAD row **already exists on both patch surfaces** (live profile rows; kit insert
   rows) ⇒ a client adds **ZERO new loader rows** ⇒ I-146's "missing insert row" trap cannot
   fire; I-146's kit machinery for the board reduces to repack + stanza (§6).
4. A separate `@hive/dsh-board-web` package would require new rows across all four kit
   surfaces for a surface that can never boot without board — a package split that buys
   nothing. Rejected.

Version/name stay `@hive/dsh-board` (a client addition is the same plugin acquiring a second
face; the loader id `board` is unchanged, so the deny-mask sync in evolution keeps applying).

## 3. Client contract (0.1.6-alpha.2, verified shapes)

### 3.1 package.json manifest — authoritatitive fields

From `@deepseek-ai/dsh-package-manifest/lib/types/types.d.ts` (0.1.6-alpha.2):

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },   // board is a LOAD row today; keep if kit adds bundle rows
  "client": {
    "platform": "web",          // required; Web consumer selects "web"
    "inject": [],               // INFORMATIONAL package-name deps — NOT cordis service injection
    "immediately": false,       // absent = shared application batch (both twins omit it)
    "external": []              // module-table requests beyond baseline; absent = baseline only
  }
}
```

- ⚠ I-127 refinement: the manifest `inject` array is **informational** ("Informational
  package-name dependencies, not Cordis service injection"). The **load-bearing** client
  services gate is the `inject` array **on the returned plugin entity** (§3.3). A manifest
  inject of `["slots"]` does NOT authorize anything.
- `exports` must keep `"./package.json"` (W-040) and gain `"./client"` pointing at the
  **prebuilt bundle file**; the host reads it raw at boot — absent/resolution failure fails
  the boot loudly (I-127's MissingClientBundleError; the exact 0.1.6 message is to be
  captured at slice-2's first boot — the string `MissingClientBundleError` no longer appears
  in the 0.1.6-alpha.2 host tree, so the error may have been renamed; the operative gate is
  "boot log is loud, boot warnings are the install check").
- ⚠ W-040 re-pin, **CAPTURED LIVE 2026-09-19 (slice-2 post-bounce)**: the bundle route on
  the wire is a **batched query form** — `/plugins/?<pkg>/client.js,<pkg>/client.js,…&rev=<hash>`
  (one request serving every composed entry's client; 59 factories in the live web's batch).
  The unsuffixed per-file path `/plugins/<pkg>/client.js` still 404s — the dream-era claim was
  right about the prefix, wrong about the wire shape. Per-entry urls also ride in
  `window.__DSH_BOOT__ = { rev, entries: [{ id, url }] }`. The route is served behind the
  cookie fence (curl needs the cookie the `?token=` URL mints); the boot manifest
  (clientModules.graph) is what builds the batch. Plugins add NO route for their own client —
  the host serves `exports["./client"]` automatically; openness gate = the entry appears in
  `__DSH_BOOT__.entries` on a live page. `@hive/dsh-board/client.js` verified IN the live
  batch (proxy: file bytes + both slot keys served through the batched request).

### 3.2 Bundle file format (copy verbatim from `packages/berget-usage/client.js`)

- A classic script whose only job is:

```js
window.__ModuleLoader__.load({
  id: '<package name>',
  factory: (require) => {
    const React = require('react');   // from the module table; NEVER bundled React
    // ... component definitions (React.createElement; no JSX, no deps) ...
    return {
      name: '<package name>',
      inject: ['slots', 'timer'],     // §3.3
      apply(ctx) { /* registration + CSS + wiring */ },
    };
  },
});
```

- Client half stays dependency-free of `@deepseek-ai/*` **in baked form** (W-044): inline
  small helpers, `require('react')` only.
- Registration is late-mounted inside `apply`:
  `slots.inject('<slot>', () => slots.register(options, component))`.
- CSS: a `<style data-plugin-css="<pkg>">` tag appended in `ctx.effect(fn, 'name')`, disposer
  removes it (the module system recognizes that attribute).
- Apply must be idempotent (`applied_once` guard — duplicate apply re-registers the same slot
  keys and throws, per the twin's comment).
- Board's own title-decision (SHADOW-019) rides in this file's code ownership (slice 3).

#### 3.2a Slice 3 — client.js is now GENERATED (viewer-parity port, 2026-09-19)

`client.js` is no longer hand-written: `scripts/build-client.ts` (bun; `npm run build` chains it
after `tsc`) bundles `websrc/client-main.ts` — the ported 4400 viewer engine (morph/filter/render/
icon + data modules under `websrc/`, drift-tested byte-true against
`src/board-viewer/{web,data}` by `test/board-tab-port.test.mjs`) into the SAME classic shape —
`window.__ModuleLoader__.load({ id: '@hive/dsh-board', factory(require){…} })` — with the
wrapper as the ONLY React-using code (React from the module table; W-044 holds).

Two build facts pinned here because they were DISCOVERED, not assumed:

- **bun's `format: "iife"` silently DROPS module exports** (`globalName` produced no global
  assignment on bun 1.3.14 — the bundle ended `})();` with no `__BOARD_ENGINE =`). The engine
  therefore crosses to the wrapper via an explicit side-effect assignment:
  `globalThis.__BOARD_ENGINE = { CSS, CSS_OVERRIDES, SHELL_MARKUP, ICON_SVG, attachEngine }`
  in `websrc/client-main.ts` (no `export` statements at all). The emitted guard asserts
  `__BOARD_ENGINE=` exists, so a silent drop can never ship again.
- The build stamps `__BOARD_BUILD_SHA__` via `define` (monorepo `git rev-parse --short HEAD`
  + `-dirty` — the I-152 staleness-verdict client side) and writes `dist/board-build.json`
  (the host side, read per payload by `tabIndex()`); the badge compares the two and the
  three-way verdict (match/mismatch/**unknown-never-fresh**) is ported verbatim.

### 3.3 Slots — live-verified tree (coordinator's page-backed pull)

- `main` — kind **keyed**, scope root; registration `{ name: 'main', key: string(required) }`;
  keyDomain **open** (any string; `conversation` taken). "Central panel selected by sidebar
  entry id" — the `sidebar.panellist` id with the same value selects it.
- `sidebar.panellist` — kind **list**; registration
  `{ id: string(required), order?: number, label?: string | (() => string) }`; component is
  the icon (props `{size}` → svg per the twin's `PanelIcon`).
- ⇒ Board (user decision 2, berget-usage standalone pattern) registers BOTH:
  - `slots.register({ name: 'main', key: 'hive-board' }, BoardPanel)`
  - `slots.register({ name: 'sidebar.panellist', id: 'hive-board', order: 110, label: 'HIVE Board' }, (props) => <HiveBoardIcon props>)`
    (order: highest seen today is 100/provider-usage — sort is `order ?? 0`.)
- Child tabs (slice 3 depth views, the provider-usage pattern): declared **in the same `main`
  registration** — `children: { ['hive-board.view']: { kind: 'list', scope: 'root' } }` —
  occupants `slots.inject('hive-board.view', ...)`; owner renders
  `props.renderSlot('hive-board.view', { active: true }, { only: activeId })`. Inactive
  occupants are **unmounted** (state loss by design; keep per-view state above the dispatch).
- The returned entity's `inject` is the real gate (I-128): `['slots']` minimum; add
  `'timer'` iff `ctx.interval` is used (twin uses both for its 60 s poll + 15 s tick).
  Undeclared service property access throws at first render into
  `<div data-slot-error="main">` — invisible in host logs.
- Boot-composition probe (if ever needed): `window.__DSH_BOOT__.entries` rows carry `id`
  (berget's tab-vs-standalone idiom). Board is a standalone entry; only listed for parity.

## 4. Host contract — route + registration timing

- Form (provider-usage `index.js`, the in-cohort precedent — NOT berget's apply-time
  `ctx.get` probe):
  ```js
  ctx.inject?.(['webServer'], (serverCtx) => {
    const webServer = serverCtx.get('webServer');
    if (!webServer || typeof webServer.register !== 'function') return;
    serverCtx.effect(() => webServer.register({ kind: 'exact', path: ROUTE, handler }), 'name');
  });
  ```
  webServer is a **wait, not a hard inject**: on a web-less profile the block never runs and
  the rest still boots (I-131 superseded by this stronger form — the twins' comments state
  the reason: empty-inject/no-inject plugins mount BEFORE the webserver finished booting).
- Board is a `Service` class (default export, `static inject = ['tools']`): the wait rides
  the SAME instance `ctx` the constructor already uses for `ctx.tools.register`/`ctx.effect`.
  Place after the tool registrations.
- `webServer` (0.1.6-alpha.2 catalog): `register(route)` / `registerUpgrade` / `registerFallback`
  / `tapIndex` / `applyIndexTaps` / `collectIndexInjections` / `renderIndex`. Handler is
  Node-style `(req, res)` per both twins' live code.
- Routes (read-only, over the Board service's own surface — never read `.md` files in the
  route; single code path):
  - slice 2: `GET /api/hive-board/index` → JSON of `board.items()` shaped for the tab
    (status/priority/owner/recency/tags/title/spec size; include `computeProblems` flags and
    optional `status=live|all|<exact>` mirroring `STATUS_FILTERS`).
  - slice 3 (DONE — payload extension, legacy keys untouched): the same route now ALSO carries
    `items: full store records + problems` (the whole board — the parity engine's feed),
    `workspaceRoot` (the service's board directory) and `boardBuild` (the package's own build
    stamp from `dist/board-build.json`, `"unknown"` when absent — never asserted fresh).
    `columns`/`counts`/`ok`/`status`/`generated` keep their slice-2 shapes; the 15-key row
    contract of test 3 is unchanged.
  - slice 3b (DONE — shipped as exact + query param, not `:id` path): `GET /api/hive-board/item?id=WI-…`
    → `{ ok, generated, boardBuild, id, item: <full store record + problems + recency + body>,
    truncated, bodyBytes, historyTotal }`. Only the `exact` route kind is in-cohort verified, so
    the path-param shape gave way to `?id=` (the `prefix` kind has no twin precedent — recorded
    here as the reason, not an oversight). Budgets follow the readItems discipline: spec body
    capped at 10k chars with `truncated` + full `bodyBytes` (nothing silent), history capped at
    50 with `historyTotal` (the record keeps everything — display cap only); unknown / malformed
    ids answer `ok:false` + `missing:[id]`, never a crash; malformed ids are refused at the
    handler by an id-shape guard (upstream-safe). The title rides RAW — the SHADOW-019
    presentation (truncation + the dim "(raw title)" chip) lives client-side in
    `websrc/title-pass.ts`, one place, with the revisit trigger named in its header (dsh
    exposing a session-title surface).
  - The CLIENT slice-3b consumers (all wrapped in the same client.js, guard-tested by emitted
    markers): `websrc/icon-driver.ts` (`startFaviconDriver` — APPLY-LEVEL, panel-independent,
    30 s cadence via 'timer', board-counts derivation with the session-channel literal-and-named
    STUB `attachSessionSurface`) and `websrc/item-drawer.ts` (click-delegation on the cards'
    existing `data-key="wi:…"` — zero ported-render bytes changed; anchors to document.body so
    fixed positioning escapes transformed panel ancestors; dead `Open ↗` links route into the
    drawer instead of soft-navigating the shell away).
  - Slice 3C — the panel-head mark: `stampPanelMark()` in the same `icon-driver.ts` stamps the
    ported FULL mark (`fullMarkSvg`, `idPrefix:"hvbp"`, `animate:true`, 34 px shell-size) into
    `.hvb-head-row > #hvb-panel-mark` at the panel's top-left — OUTSIDE the morph root, stamped
    on the engine's 15 s tick AND the driver's 30 s tick, state-keyed so innerHTML is only
    rewritten on state CHANGE (no churn, no animation restarts). Same `deriveBoardIcon` mapping
    as the favicon — mark, favicon and board truth can never disagree. Zero host-route changes;
    zero new head surfaces (the mark lives in the panel DOM; the breathe keyframes + reduced-motion
    gate are the already-ported `mark-breathe` CSS). Emitted guard asserts the holder, the
    `class="lit"` hook, the keyframes, and the id namespace.
  - Slice 3D — the derivation's ground truth is LIVE AGENTS, not lane counts. The index payload
    GROWS `activity: { runningAgents, sampledAt, feedAvailable }` (no other field changed; the
    item route is untouched). Mapping: `runningAgents > 0 ⇒ active (breathe), else quiet` — the
    in-progress-ITEMS proxy is GONE (in_progress items outlive their sessions for weeks; "bound"
    never meant "busy" — the user's semantic: breathe only while a session is actively WORKING).
    CHOSEN DISCRIMINATOR, exact source: the `agents` service (`ctx.agents`, key `agents`,
    process-local registry) — `list()` rows filtered by the per-agent `status` field; that is
    `AgentStatus = 'idle' | 'running'` from `@deepseek-ai/dsh-agent` runtime-types (mirrored on
    every `agent/status` transition). Liveness is free: the registry only carries LIVE agents
    (disposed = absent), so dissolved sessions cannot stale the signal by construction.
    `runningJobs` was deliberately NOT taken (the agents filter is direct and sufficient; fewer
    seams to defend). Injection is the W-090 WAIT (registry.inject, order-agnostic), NOT a
    static inject dep — the twin's own test pins exactly this form, and on webless profiles the
    wait never fires and `activityFor()` degrades to `{ runningAgents: 0, feedAvailable: false }`
    (shape-stable, honestly sampled). PURE READ — list() is never mutated.
    POLL-LAG CAVEAT (documented in the mark's tooltip): the sample rides the 15 s/30 s polls —
    mark + favicon may trail reality by one cycle; the sample time is shown, never trusted.
    KNOWN EDGE (accepted, revisit via WI-063's rewrite): an agent blocked awaiting a user answer
    mid-turn still reports `running` — the icon may breathe while WAITING FOR YOU; distinguishing
    blocked-await-answer from mid-turn needs the approval/userQuestions service state (not wired
    in this slice). The 3B stub `attachSessionSurface` is RESOLVED (deleted — the feed shipped as
    `payload.activity`); emitted guards now assert the feed's surviving property names
    (`runningAgents`) so minify can never eat the derivation. Host-side tests: running-only
    counting, zero-running quiet, and no-service degradation all asserted on real tab payloads.
  - Slice 3E — TWO-TIER ACTIVITY (HIVE vs ambient). `activity` now carries
    `{ runningAgents, hiveRunningAgents, sampledAt, feedAvailable, ledgerAvailable }` (additive —
    no route-shape break). Mapping table (both mark + favicon, one derivation):

      | state                                        | mark + favicon                          |
      |----------------------------------------------|-----------------------------------------|
      | runningAgents > 0 && hiveRunningAgents > 0   | breathe, CURRENT orange (ported amber `#d29922`, byte-unchanged) |
      | runningAgents > 0 && hiveRunningAgents == 0  | breathe, MUTED ochre `#866d3c` (desaturated/darker same-hue member of the ported amber family — distinct at 16 px and 34 px) |
      | runningAgents == 0 / unknown / feed absent   | ported static quiet drawing             |

    DISCRIMINATION — one authoritative signal joins the registry:
    `hiveRunningAgents` = running rows whose `id: SessionId` is a member of HIVE's own
    live-session ledger `<workspace>/.opencode/agents/hive-sessions.json` (the SAME registry the
    awaken/bind tools stamp — membership is authoritative; every id-keyed member map in the
    document is unioned, `coordinators` today, future sections honored without code change).
    Candidate B (dispatch-label prefixes on registry rows) was EVALUATED and DROPPED: the public
    `Agent` face carries only `id: SessionId` + the runtime `status` — there is no label field to
    read, and the ledger already contains label-less roots (the coordinator's own session id),
    so the label signal had no case the ledger couldn't answer; the two-signal precedence
    question collapses to one signal.
    RESIDUAL STALENESS (honest): the ledger is a MEMBERSHIP record, not a liveness record — it
    stamps on awaken/bind and does not track dispose. A leaked entry contributes nothing (the
    join is with RUNNING rows only); the residual gap is the first seconds of a session that
    runs BEFORE its ledger stamp — it reads AMBIENT until the stamp lands. A blind join
    (ledger unreadable/absent) is VISIBLE: `ledgerAvailable:false` and nobody is called HIVE.
    COLOR MECHANICS (authored, ported bytes locked): the muted tier re-accents the SAME ported
    SVG by swapping the amber accent hex for `#866d3c` (string replace in the driver — neither
    `icon.ts` nor `render.ts` bytes change; the am hex only paints the active accent and a
    dreaming stratum, and dreaming is structurally false under dsh). Reduced-motion gating
    carries over (port CSS). The as-of tooltip NAMES the tier: "N HIVE agents running" /
    "N other agents running · no HIVE session active" / "quiet — nothing running", each with
    the sampled stamp. Host-side tier tests: hive-only, ambient-only (1 HIVE + 2 others), blind
    ledger, zero-running, absent-feed. Guards: `hiveRunningAgents`, `#866d3c`, tier tooltip
    fragments survive minify.
- The bundle route is NOT ours (clientModules owns it, §3.1).

## 5. AUTH + EXPOSURE — new pin, decision needed (load-bearing for slice 2)

Verified live, twice (loopback 4501 **and** relay 0.0.0.0:3080):

```
curl http://127.0.0.1:3080/api/berget-usage/snapshot  → 200 {"ok":true,...,"email":"jlohnn@…"}
curl http://127.0.0.1:3080/                           → 401 unauthorized
```

- Plugin-registered `webServer` routes are served **without any token/cookie auth**. The dsh
  fence that guards `/api/*` traffic is the **confused-deputy fence**
  (`dsh-client-connection/lib/types/api-request-trust.d.ts`, in-tree docstring):
  Host = loopback / IP-literal / `--trusted-host` authority; it binds DNS-rebinding +
  cross-site read paths and states **"this fence is not an auth layer"**. LAN IP literals and
  the tailnet name both pass **by design** (web-app resolver trusts LAN IPs by default; the
  boot whitelists `studio.tailce8ca9.ts.net`).
- The 0.1.6-alpha.2 host catalog has **no auth-verify API for route handlers**
  (`connection.requestRejection` IS the fence decision, not an identity check).
- ⇒ The board index route will be readable by anything on the tailnet that can reach the
  relay. berget-usage already accepted exactly this posture (personal seat data). Options:
  (a) **mirror the precedent** (default for slice 2), (b) send `?token=…`/cookie out of band
  and compare (plausible but not an identity boundary without dsh support), (c) request a
  dsh-core per-route auth hook (feature request, out of our lane). Cool decision for the
  coordinator/user; see §8.

## 6. Install deltas

### 6a. Live surface — what slice 2 actually does

1. `packages/board/package.json`: add `dsh.client` stanza (§3.1, no `immediately`) +
   `"./client"` → `./client.js` export + add `"client.js"` to `files` (hand-written
   dependency-free bundle at package root, exactly like the twins — keeps `files:["dist"]`
   meaningful and the client byte-auditable).
2. Write `packages/board/client.js` (§3.2) with the slot registrations of §3.3; extend the
   Board service (§4) with the route wait.
3. `pnpm -r build` → per-package `node --test` (gate ladder head).
4. **Bounce the live dsh-web** (svcwatch `dsh-web` service restart — same single instance,
   never a second live instance W-083, no dependency surgery W-072). Host reads
   `exports["./client"]` at boot.
5. Gate: fresh boot log shows NO new warnings **and** the running PID's start postdates the
   edits (W-093); page reload shows the sidebar entry; browser console is the client-half
   gate (I-107); service-worker staleness in the loop (W-058).
6. cordis.patch rows: **none** (row exists; `patchReload: live` irrelevant for module code).

**Visibility schedule (coordinator-amended 2026-09-18):** user-visible tab targeted at
**slice 2** — after its bounce and one page reload. Slice 4 is kit durability only, not
first visibility. Communicate the early visibility honestly to the user.

### 6b. Kit surface — slice 4 (DONE 2026-09-19, evidence inline)

1. **updater gap (boardless NINE → TEN) — FIXED IN SOURCE, deployed copy pending one cp.**
   The authored kit source `/workspace/projects/evolutional_agent_structure/dsh-hive-dist/dsh-hive-update.sh`
   already carries board: SPECS/PACKAGES = **10** (`dsh-hive/packages/board` +
   `@hive/dsh-board`), `DSH_VERSION` default **`0.1.6-alpha.2`** (line ~49), insert-region
   splice for the board row, log lines "10 packages". The DEPLOYED `/root/.dsh/hive-kit/` copy
   is older (boardless, `0.1.6-alpha.1`) — refreshing it is a sandbox-escalted cp outside this
   capability's write scope (workspace-write denies `/root/.dsh/hive-kit`); coordinator one-liner:
   `cp dsh-hive-dist/{dsh-hive-update.sh,.pnpmfile.cjs,cordis.patch.yml,cordis.yml} /root/.dsh/hive-kit/`.
2. **W-085 coupling rows — DONE, four edit sites**: `dsh-hive-dist/.pnpmfile.cjs:43`,
   `dsh-hive-dist/package.json:7` (cohort manifest), the updater's tarball-mode
   `SPECS` array (`dsh-hive-update.sh:311` — `bash -n` clean), and the live tarball cohort
   `/workspace/web/.pnpmfile.cjs:43` — all now `hive-dsh-board-0.1.0.tgz`. The
   absolute `file:`-anchored sibling rewrites stay intentional (unpacked-tarball relative specs
   re-anchor to the virtual store — hook documents it); do not "fix" them back to relative.
   Loader row/id unchanged (`board` / `@hive/dsh-board`); `HAS_TARBALLS` probe file name
   (dream-archive) unaffected.
3. **Repack + version bump — DONE**: board `0.0.1 → 0.1.0` (`packages/board/package.json`);
   `pnpm pack` ran the **prepare** client build fresh (tarball `package/client.js` greps
   `hiveRunningAgents` — the 3E bundle, not a stale ear); tarball audited
   (`dist/`, `client.js`, `dist/board-build.json`, `package.json` with the full `dsh` stanza +
   `"files": ["dist","client.js"]`). Shipped `hive-dsh-board-0.1.0.tgz` to
   `/workspace/web/` AND `dsh-hive-dist/`; both `hive-dsh-board-0.0.1.tgz` copies removed.
4. **Insert rows** (`/workspace/web/cordis.patch.yml` + `dsh-hive-dist/cordis.patch.yml`):
   board row sits at the end of the insert region — **no new row**, anchoring unchanged (the
   updater's splice logic targets that same end-of-region anchor).
5. **Stale peer pins — OPEN, deliberate**: `@hive/dsh-board` (and siblings) pin
   `@deepseek-ai/dsh-llm` + `@deepseek-ai/dsh-tools` at `0.1.2-rc.1` vs runtime
   `0.1.6-alpha.2` — NOT bumped (coordinator instruction; belongs to the version-bump spike
   WI-044 / WI-063 cutover).
6. Kit failure-tolerance footguns remain real: a failed `plugin-manager add` sweeps its own
   scaffolding (W-092) and tolerance layers must name their failure cause at WARN (W-087).

### 6c. Coexistence decision — the 4400 viewer STAYS (user decision 2026-09-19, direct)

Slice 5 (retire the standalone 4400 hive-board viewer + its svcwatch TOML) is **CANCELLED**
by direct user decision. Two read-only surfaces now coexist deliberately over the ONE locked
write path (the board store under `/workspace/.opencode/board`): the standalone 4400 viewer
and the dsh-web tab. The 4400 viewer **remains** for as long as the user works through OLD
ACTIVE WORK ITEMS in the OLD HARNESS. Revisit trigger: a direct future user decision only —
never an inference from "the tab exists". The capability method file's operating-protocol line
is amended to match (this amendment is user-authorized).

## 7. Verification gates (all slices)

1. Gate ladder unchanged and law: `pnpm -r build` → per-package `node --test` → dump-config →
   detached live boot → live seam verify. Harness-green is happy-path evidence only; the
   browser console is the client-half truth (I-107).
2. Client-platform `cordis_inspect_query` **cannot answer** from a capability position (it
   pends forever without a page; wedged two turns here). Live client data comes from the
   coordinator's page-backed queries, verbatim. Host-platform queries work fine.
3. Boot-warning-not-install-result for kit checks (I-146); verify the booting PID postdates
   any edit (W-093); never boot a second live instance (W-083 — a verification boot needs the
   `--patch` overlay that disables `dsh-berget-refresh`); ports verify-before-trust (W-034).
4. Client bundle W-058 service-worker staleness rides every slice-2+ verify loop.
5. Commit discipline (coordinator, W-084): commits are snapshots in the working tree; no
   branch switches/rebases while the live web serves the tree; host half keeps the old module
   until bounce.

## 8. Open items for the coordinator

1. **Auth posture** (§5): ~~confirm with the user that (a) mirroring the berget-usage exposure
   posture is acceptable for the board index~~ **RATIFIED — user decision 2026-09-18: mirror
   precedent (§5a) for the slice-2 read-only index route; re-ratify before any interactive or
   richer-data surface ships (slice 3+ re-check).** (c) remains the escalation path if the
   posture ever needs to change.
2. ~~Capture the browser's exact client-bundle URL~~ **DONE 2026-09-19 — captured live;
   batched `/plugins/?…&rev=<hash>` form, see the W-040 re-pin in §3.1.**
3. Slice-2 ack (per I-143 rhythm).
