# Other-machine move manifest — the tarball/kit-machine recipe

**Phase:** HELM rebrand WAVE 1 P2 deliverable (`helm-rebrand-design.md` §3 P2 item 4 + §5 FULL-MOVE)
**Audience:** every kit machine that installs the tarball cohort (`~/.dsh/hive-kit/` + `dsh-hive-update.sh`) — NOT this studio (`link:` working tree; the studio's own cutover is the P3 stopped-host runbook)
**Status:** PREPARED 2026-11-27 — no step below runs until P3 (the cohort PR) exists. This file is the recipe, not a trigger.

---

## 0. What a kit machine has today

- dsh (alpha `dist-tag`, exact-version pin) with a profile whose `cordis.patch.yml` carries the SEVEN `@hive/*` loader rows (dream-archive, painpoints, hive-dream-tools, hive-agents, evolution, hivemind, board)
- `~/.dsh/hive-kit/` cache + `dsh-hive-update.sh` (git-mode updater; svcwatch `pre_start`)
- workspace state root `/workspace/.opencode/` (board, dreams, hivemind, painpoints, agents, services, skills, hive-usage.jsonl)

## 1. Cohort update path (the P3 move — one PR, one updater run)

The tarball NAME+version is the release identity; tarballs move as ONE cohort so npm names, loader rows, updater pins and tests flip together. Recipe:

1. **Wait for the P3 cohort PR to be merged and the tarball cohort rebaked** (`helm-dsh-*.tgz` at the new line, not `hive-dsh-*.tgz`). Verify with `bash dsh-hive-dist/test/updater-bootstrap.test.sh` (the fifth pin) and `test/kit-freshness.test.sh` — both must pass before a machine touches anything.
2. **Run the updated updater at a STOPPED service**: svcwatch `dsh-hive-web` down (the updater is the only writer of `KIT_TARBALLS`, `SPECS`, `PACKAGES`, the tarball→package `case`, allowBuilds names, board insertion row, kit path stamp). The new updater must understand BOTH cohorts and do the one-time removal/clean cutover of the old `@hive` mounts — "a naive install leaves both cohorts mounted" (design C1 split-brain rule).
3. **`@hive/dsh-helm` joins KIT_TARBALLS ONLY AT P3** — it is live-`link:` on the studio today and deliberately NOT kit-shipped until its separate kit-enablement acceptance criteria are met (design §C row + §3 P3). Kit machines get the six-tool orchestration seam the moment the updater's cohort list carries it; do NOT hand-add it before that (a manual tarball + an absent updater/path row is the W-092/W-093 invisible-insert class of failure — judge by BOOT WARNINGS, never by install exit codes).
4. **`@hive/dsh-agents` → profile `dsh.profile.bundles`** (picker rows): the dreamcatcher presets only help if the host's preset picker sees them; kit machines mount it via the profile bundle list, not only the plugin's own preset material. The updater/profile edit carries the row; verify with the picker UI + `dsh dump-config` (one row per plugin, no duplicate loader ids).
5. **Judge by BOOT WARNINGS** for every row above (I-145/I-146): a missing cordis.patch insert or a stale TARBALLS row is invisible to every install check.

## 2. State-root move (`mv` + compatibility symlink)

Applies AFTER the cohort cutover (§1), at a stopped host, on ONE filesystem:

```sh
svcwatch down dsh-hive-web            # quiesce the only writer
mv /workspace/.opencode /workspace/.helm   # atomic rename, single syscall
ln -s .helm /workspace/.opencode           # compatibility symlink (the 185-hit safety net)
```

- WI/DRM/I/W/SNG/SHADOW ids, capability slugs, message filenames, JSON field names: all path-derived or content-derived — byte-identical after the move; verify with the design §5.4.4 file-listing diff.
- `hivemind/` renames to `comms/` DURING the move (one touch of the tree); `capabilities/` and `dissolved/` move as-is; the three `hive-*.json` files + `hive-usage.jsonl` rename to `helm-*.json(l)` in the same window (dual-read fallback one cycle).
- Remove the symlink only after one full release cycle of zero symlink-fallback hits in logs (design §5.4.1 step 8). Backup before the move: `cp -a .opencode .opencode.pre-move-backup` (removed after verification).

## 3. svcwatch symlink transparency — nothing to edit

svcwatch is spawned by the container entrypoint with `SVCDIR="$WORKSPACE/.opencode/services"`. With the §2 symlink in place the entrypoint's path FOLLOWS the symlink and finds `.helm/services/` — svcwatch never notices, no TOML moves, no entrypoint edit. Editing `/entrypoint.sh` (`.opencode/services` → `.helm/services`) and removing the symlink is DEFERRED to a container-recreation maintenance window (W-076 asymmetric-loss risk; outside any working session).

## 4. OPTIONAL — OpenCode retirement leg (operator-signed only)

The 2026-09-19 "hive-board viewer KEPT" gate is EXERCISED ONLY by a direct operator decision (signing this leg), never by a kit machine inferring it. Ordered teardown — each step independently reversible — from design §5.5: stop opencode (4096) → drop `oc-browser-bridge.toml` → drop `hive-board.toml` (4400 freed) → delete `opencode.json` → delete the legacy OpenCode plugin source (a commit on the repo, not a machine-local edit) → docs/ports updates → entrypoint cleanup on next container recreation. Kit machines: NOTHING to do locally — the repo update carries it; local state roots stay (they are shared cargo).

## 5. Restart / verify checklist (post §1+§2, before resuming work)

1. Bounce the ONE `dsh-hive-web` svcwatch instance; verify the booting PID POSTDATES the edit (ps start time vs file mtimes — I-145/I-146 discipline), capture the fresh token from the service log (tokens rotate per boot).
2. **Zero `@hive` remnants**: `dsh dump-config` shows exactly one row per plugin, all `@helm/dsh-*` (or the staged P3 names), no `@hive/dsh-*` rows left active, no boot warnings about skipped/duplicate plugins.
3. **Tool census**: the adapters render BOTH spellings — `helm_*` canonical + `hive_*` legacy aliases (40 alias twins live: 30 global + 10 summons); the six `helm_dispatch/status/prompt/collect/resume/cancel` unchanged; no duplicate names. grep the tool catalog or a dump-config tool listing.
4. **Gates**: dormant session sees board discovery tools in BOTH spellings and nothing else; awakened `/status` summons both `hive_status`+`helm_crew_status` and a call retracts both; `/dream` toggles both spellings of the dreamtime partition; a dispatched dreamcatcher one-shot can call either dream-read spelling (its allow list covers twins).
5. **State counts**: board WI count, dream DRM count (active+history), capability roster count, comms inbox counts — all equal pre-move numbers (the §5.4.4 listing diff must be empty).
6. **Routes**: relay `/_/healthz` + board tab (`/api/hive-board/*` exact routes unchanged in P2) + standalone viewer if present; browser console clean (client-half failures never appear in host logs — I-107).
7. Old sessions resume: a cold-resumed session holding pre-rename `toolFilter`/persona composition still executes (aliases + the expandToolFilter normalization are the guarantee this build encodes).
