# Harbor move — upgrade recipe for kit (tarball) machines

**Audience:** every machine that installs the cohort via **built tarballs** (`dsh-hive-dist/dsh-hive-update.sh` as the `dsh-hive-web` svcwatch pre-start) — not the source checkout.
**As-shipped state:** PR #73 (branch `helm-harbor-move`) — this replaces the earlier Wave-1 *projection*: the shipped truth keeps the `@hive/dsh-*` scope and the `hive-dsh-*.tgz` tarball prefix (no cross-package cutover, no `hivemind→comms` rename); what changes is versions, one NEW package (`@hive/dsh-helm`), one new repair row in the updater, and the state root.

---

## 0. What a kit machine has today

- dsh (pinned exact version) with a profile whose `cordis.patch.yml` carries the seven `@hive/*` loader rows (dream-archive, painpoints, hive-dream-tools, hive-agents, evolution, hivemind, board)
- `~/.dsh/hive-kit/` cache + `dsh-hive-update.sh` (tarball-transport updater; svcwatch `pre_start`)
- Workspace state root `/workspace/.opencode/` (board, dreams, hivemind, painpoints, agents, services, skills, `hive-usage.jsonl`)

## 1. The ordered upgrade (exact steps)

Merge the PR first — the updater fetches kit files from the tracked ref, so the ref must carry this PR before anything below runs.

### Step 1 — profile bundle row (BEFORE the restart)

Add `@hive/dsh-agents` to the profile's `dsh.profile.bundles` (after `@deepseek-ai/dsh-web-app`). This ships the three picker rows (Helmsman / Bosun / Hands) at the next compose.

```sh
# in ~/.dsh/profiles/<your-profile>/package.json → dsh.profile.bundles:
"@hive/dsh-agents"
```

Registry default stays whatever it is; the picker is opt-in per session.

### Step 2 — state-root move (BEFORE the restart, services down)

The **new** cohort reads `.helm/` natively — the state must be at its new home (or behind the symlink) before the first boot on the new cohort, or archives/board/comms look empty:

```sh
# quiesce the only writer: stop the dsh-hive-web svcwatch service
cp -a /workspace/.opencode /workspace/.opencode.pre-move-backup   # safety ballast
mv /workspace/.opencode /workspace/.helm
ln -s .helm /workspace/.opencode                                  # compatibility symlink
```

- ids (WI/DRM/I/W/SNG/SHADOW), capability slugs, message filenames: byte-identical after the move.
- **Keep the symlink one full release cycle** — it covers the container entrypoint's services-dir hardcode and any other old-path reader. Remove it only after a cycle with zero symlink-dependent hits.

### Step 3 — restart `dsh-hive-web` (the update happens in pre-start)

```sh
# svcwatch: start the dsh-hive-web service
```

The pre-start updater now: fetches the new kit files + all 12 tarballs (incl. `hive-dsh-helm-0.0.4.tgz`, helm's **first bake**) from the ref → `dsh plugin add/update` installs them → **the updater's new HELM repair row** appends the `helm` loader row to the profile's `cordis.patch.yml` automatically (idempotent; mirrors the board repair) → the fresh dsh boots with the whole HELM stack.

The container entrypoint's `SVCDIR` may still hardcode `.opencode/services` — with the Step-2 symlink it transparently finds `.helm/services/`. Fix the hardcode at your next maintenance window; the symlink cover makes it non-urgent.

### Step 4 — verify (boot-warning discipline, §I-145/I-146)

1. The booting PID postdates your edits; capture the fresh `?token=` from the service log (tokens rotate per boot).
2. **Zero boot warnings** about skipped/duplicate/disabled plugins; `helm (@hive/dsh-helm)` must NOT appear as pending or disabled.
3. **Picker**: a new session shows Helmsman / Bosun / Hands among the modes (Hands is visible until the upstream `dispatchOnly` leg — dispatch-time composition already enforces Hands' no-dispatch surface).
4. **Tool census**: 40 `helm_*` aliases + the six `helm_dispatch/status/prompt/collect/resume/cancel` beside their `hive_*` twins — both spellings callable.
5. **State counts**: board WI count, dream DRM count, capability roster, comms inbox — all equal pre-move numbers.
6. Chart ops through both paths (one `hive_board_list` per spelling) return the same inventory.

## 2. OPTIONAL — OpenCode-era retirement (operator-signed only)

Only if the machine still runs opencode-era pieces. Ordered, each step reversible:

1. Stop `opencode serve` (port 4096) if running.
2. Remove `oc-browser-bridge.toml` + `hive-board.toml` from `/workspace/.helm/services/` (svcwatch hot-reload stops them).
3. Delete `/workspace/opencode.json`.
4. The repo-side engine deletion is already done in this PR — nothing to do locally.

The 2026-09-19 "hive-board viewer KEPT on 4400" decision remains each deployment's own call; the removal is a signed operator act, never an inference.

## 2.1 REQUIRED when restarting after pulling this PR — entrypoint svcwatch relocation

The retirement **deleted the repo's `src/svcwatch/svcwatch.py`**. Any deployment whose container
entrypoint resolves its supervisor from that repo path (source-checkout deployments — this
includes an in-place `docker compose restart`, which re-executes the entrypoint in the same
filesystem) will boot with **no supervision at all**: both the `[ -f <path> ]` guard AND the
assignment must be repointed, not just one of them (the guard is the one that silently fails
first — the resolved path still exists in some line but never gets selected).

**The failing signature** (after the repo pull):

```sh
# entrypoint still testing a path the retirement deleted:
if [ -f "$WORKSPACE/projects/evolutional_agent_structure/src/svcwatch/svcwatch.py" ]; then
  SVCWATCH="$WORKSPACE/projects/evolutional_agent_structure/src/svcwatch/svcwatch.py"
```

**The fix** (promote the preserved copy to the persistent toolbox volume, then point BOTH the
guard and the assignment at it):

```sh
cp -r <repo>/svcwatch-preserved /opt/toolbox/svcwatch   # python + svcwatchctl + examples
```

```sh
SVCWATCH=""
if [ -f /opt/toolbox/svcwatch/svcwatch.py ]; then
  SVCWATCH=/opt/toolbox/svcwatch/svcwatch.py
fi
```

Plus a guard-failure log line (`svcwatch.py not found at /opt/toolbox/svcwatch —`) so the next
failure names the path.

**Recreate note (host/Mac side):** the entrypoint file is **baked into the image** — an in-place
edit survives `docker compose restart`, but a `--force-recreate`/image rebuild resets it. Copy
the same change into your compose/Dockerfile entrypoint source when you next touch the image,
or the trap returns on recreate only.

---

## 3. What does NOT change

- Package scope stays `@hive/dsh-*`; tarball names stay `hive-dsh-*.tgz`.
- The `hive_*` tool names stay live (alias cycle); removal is a later, validated cut.
- Profile `directory:` configs, `.dsh` profile state, and session archives are untouched.
- Dream/comms/board ids are the cargo — never deleted, only relocated.

## 4. Rollback

Quiesce services, `rm /workspace/.opencode` (the symlink), `mv /workspace/.helm /workspace/.opencode`, restore the prior cohort via `dsh plugin update` at the previous ref (or re-add the old tarballs) — the pre-move backup from Step 2 is the ballast of last resort.
