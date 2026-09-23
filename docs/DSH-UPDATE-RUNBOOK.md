# DSH update runbook (host + dsh-hive cohort + kit)

Last exercised end-to-end: `0.1.6-alpha.2 → 0.1.7-alpha.2` on 2026-09-23 (PR #47).
Written from that run — read it before the next bump; fix it during the next bump.

## 0. Read first — versions and tags

- Pre-releases land under npm dist-tag **`alpha`**; `latest` can be an OLDER line
  (it was `0.1.5-rc.3` while `0.1.7-alpha.2` was current). **Always pin exact**
  (`@deepseek-ai/dsh@0.1.7-alpha.2`); a bare package name resolves to `latest`
  and silently downgrades.
- `npm view @deepseek-ai/dsh dist-tags --json` (if npm errors EACCES on the
  machine cache, add `--cache /tmp/npm-any-name`).
- The cohort moves TOGETHER: host + every `@deepseek-ai/dsh-*` pin in `dsh-hive`
  + the profile manifest + kit tarballs. Never bump one alone.

## 1. The three pin surfaces

| Surface | This machine (studio) | Kit machine |
|---|---|---|
| Host version pin | `~workspace/.opencode/services/dsh-web.toml` → the `pnpm dlx @deepseek-ai/dsh@…` command line | `<workspace>/.opencode/services/dsh-hive-web.toml` → env `DSH_VERSION` (single source of truth; `dsh-hive-update.sh` default is only a fallback) |
| Cohort pins | `dsh-hive/packages/*/package.json` (peer+dev, exact) + `dsh-hive-dist/package.json` + `dsh-hive/pnpm-lock.yaml` + `dsh-hive/pnpm-workspace.yaml` `minimumReleaseAgeExclude` | same repo, fetched by svcwatch `pre_start` on every (re)start from `DSH_HIVE_REF` |
| Kit artifacts | `dsh-hive-dist/*.tgz` (10 committed release artifacts — repack per W-085/W-088) + `cordis-plugin-group` pin | `~/.dsh/hive-kit/` (auto-refreshed) + profile, installed by `dsh plugin add` |

The `cordis-plugin-group` (or loader/include) pin moves in **lockstep** in 4
sites: `dsh-hive-update.sh`, `dsh-hive-web.toml` (command + VERSION-BUMP-GUARD
comment), `dsh-hive-dist/test/updater-bootstrap.test.sh`. Before changing it,
check `@deepseek-ai/dsh-app-boot@<new>`'s peer range (`npm view
@deepseek-ai/dsh-app-boot@<new> peerDependencies`) — that is the GUARD's rule.

## 2. Order of operations

0. **Finish and commit any WIP first.** A dsh host restart kills in-flight
   agent sessions (coordinators included); sessions persist on disk and resume,
   but a mid-turn kill is always a mess.
1. **Audit the corridor** with the `dsh-upgrade-audit` skill (npm mode for
   published versions): materializes both versions, finds removals/classifies
   renames, writes `tmp/<fromNorm>-to-<toNorm>/UPGRADE-ADAPTATION.md`. Decide
   the migration work from its REMOVED/RENAMED sections against the
   dsh-hive seam map (evolution is the deepest consumer; board carries the
   webServer/slots wire seams; berget trio is string-keyed runtime only).
2. **Migration branch in this repo**: bump the cohort pins → run the gates
   (below) and fix the type breaks they name → regenerate the lockfile
   (`pnpm install` in `dsh-hive/`) → **re-point `minimumReleaseAgeExclude` to
   the resolved new cohort** (a machine running a pnpm `minimumReleaseAge`
   policy refuses a day-of-release cohort otherwise — observed 2026-09-23; if
   `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` names a spec, add that spec as a
   row, then re-run install) → repack the kit tarballs → open the PR → merge.
   - Known corridor snag: @deepseek-ai/schemastery minor drift can break the
     tsc emit (TS2742, "inferred type of 'Config' cannot be named"). The
     0.1.7-alpha.2 run pinned the dsh-hive DEV resolution via a workspace
     `overrides:` (runtime face stays `^`).
   - Known family of type breaks: the host interfaces tighten (0.1.7-alpha.2
     required `agent/created` listeners returning `undefined |
     Promise<undefined>` and typed the `source` payload field — evolution's
     src comments carry the standing corridor notes).
3. **Restart each host** (the only step that needs operator timing):
   - Studio: edit the `dsh-web.toml` pin → restart the container (svcwatch
     also hot-reloads on TOML mtime). Cookies survive restarts, so the browser
     is just a hard refresh; the fresh `?token=` launch URL is printed to
     `/tmp/dsh-web.log` every boot.
   - Kit machine: `git pull` this repo, make sure the TOML env `DSH_VERSION`
     equals the new pin, restart the dsh-hive-web service/container — svcwatch
     `pre_start` refetches the kit from `DSH_HIVE_REF` and `dsh plugin add`
     installs the repacked cohort automatically. If its fetch fails offline
     with a cached kit, it boots stale-but-up by design.
4. **Post-boot checks**: `/api/hive-board/index` → `{"ok":true,"items":[…]}`;
   plugin roster mounts in the GUI; first access to pre-bump sessions runs the
   guarded session-format migration (format guards jump between releases —
   SESSION_FORMAT_VERSION 3→4 shipped migration-chain packages; no action
   needed).

## 3. Gates (run on the migration branch before merging)

```bash
cd dsh-hive && pnpm -r typecheck && pnpm -r test   # 8 packages, 0 fail expected
cd .. && npx tsc --noEmit && bun test              # root: 13/13
bash dsh-hive-dist/test/updater-bootstrap.test.sh  # kit CI gate (pin lockstep)
# isolated host boot on a SPARE port (4503 is squatted here; 4502 used last time):
mkdir -p /tmp/dshhome && cp -a /root/.dsh/profiles /tmp/dshhome/profiles
DSH_HOME=/tmp/dshhome XDG_CACHE_HOME=/tmp/dshhome/xdg-cache \
XDG_DATA_HOME=/tmp/dshhome/xdg-data XDG_STATE_HOME=/tmp/dshhome/xdg-state \
setsid --fork bash -c 'cd /tmp/dshhome && DSH_HOME=/tmp/dshhome for-flags-see-below' \
  > /tmp/dshboot.log 2>&1 </dev/null
# that command: /opt/toolbox/bin/pnpm --package=@deepseek-ai/cordis-plugin-group@<pin> \
#   --package=@deepseek-ai/dsh@<new> dlx --allow-build=@deepseek-ai/dsh-subprocess-local \
#   --allow-build=@google/genai --allow-build=koffi --allow-build=node-pty \
#   --allow-build=protobufjs dsh --profile web --port 4502 --no-open
curl -s http://127.0.0.1:4502/api/hive-board/index | head -c 300
pkill -f -- '--port 4502'   # ONLY that pattern — live dsh is --port 4501
```

Environment quirks (this container): `ss` does not exist (use a python bind
test for port checks); npm needs a writable cache; subagent sessions need the
`XDG_*` redirection for dlx; never kill svcwatch (its pids are the first ones).
Precedent: PR #47 runs the whole runbook against `0.1.6-alpha.2 → 0.1.7-alpha.2`
with the audit at `tmp/0.1.6alpha2-to-0.1.7alpha2/UPGRADE-ADAPTATION.md`.
