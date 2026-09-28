# DSH host + HIVE cohort update runbook

Git-public on purpose (kit machines read this file). It is the authoritative
sequence for moving the whole stack — harness host pin, cohort pins, and the
install kit — to a new dsh release. Mirrors the choreography used by the
0.1.7-alpha.2 bump (#47) and the 0.1.7-rc.2 bump (#50); the audit skill that
produces the evidence is `dsh-upgrade-audit`.

## Version map (all move together in ONE PR)

| Thing | Where | Discipline |
|---|---|---|
| harness host pin | `.opencode/services/dsh-web.toml` (studio) / `dsh-hive-web.toml` env `DSH_VERSION` (kit machines) | exact version, never a dist-tag — `alpha` lags `latest` |
| cohort peer pins | `dsh-hive/packages/*/package.json` + `dsh-hive-dist/package.json` | exact (`0.1.7-rc.2`); since 0.1.7-rc.2 these are **gate-enforced at boot** by `dsh-app-boot` — wrong pins silently skip the kit |
| plugin package versions | `dsh-hive/packages/*/package.json` `version` + `dsh-hive-dist/*.tgz` names | see the reversion rule below |
| lockfile + policy rows | `dsh-hive/pnpm-lock.yaml` + `pnpm-workspace.yaml` `minimumReleaseAgeExclude` | regenerate and re-point every cohort row |

## Tarball reversion rule (hard requirement — learned 2026-09-28)

Kit tarball names are the release identity. Tarball-mode updates
(`dsh plugin add file:./…`, the service pre-start default, and
`fetch_missing_tarballs()`) resolve an installed `pkg@version` as satisfied
**regardless of archive contents** — a same-name repack (as PR #50 shipped,
for historical reasons because the rc.2 cohort did not bump plugin versions)
updates nothing on kit machines. Therefore, before repacking for ANY content
change:

1. bump the changed packages' versions in `dsh-hive/packages/*/package.json`
   (e.g. `0.1.0` → `0.1.1`) **before** `pnpm pack:all`;
2. re-point `KIT_TARBALLS` + `SPECS` in `dsh-hive-update.sh` and the tarball
   names the `.pnpmfile.cjs` hook rewrites;
3. commit the refreshed tarballs in the same PR.

Way A (git) re-resolves by moving ref — unaffected.

## Cohort bump checklist (ordered)

1. **Audit the corridor** first: materialize both published trees + any rc
   midpoint, fetch the FULL paginated commit list (the compare API caps at
   250), run the facade scans, verify every removal/wire claim against the
   trees. Watch the hard guards (`SESSION_FORMAT_VERSION`,
   SQLite schema) and the boot-compatibility gate.
2. **Bump pins** per the version map (cohort + kit manifest + kit TOML +
   update-script default + README gate line). Check promised peers
   (e.g. `cordis-plugin-group` pin stays only while the new `dsh-app-boot`
   still peers `~x.y`).
3. **Regenerate the lockfile** (`pnpm install --lockfile-only`) and re-point
   the `minimumReleaseAgeExclude` cohort rows; confirm the supply-chain
   policy check passes.
4. **Gates**: `pnpm install` (prepare on all packages), `pnpm -r typecheck`,
   evolution `node --test` (the event-catalog guard re-proves the vocabulary
   against the new corridor), and `dsh-hive-dist/test/updater-bootstrap.test.sh`.
5. **Commit pins/config**; then **repack the kit tarballs from a clean
   worktree at that commit** (never the working tree — unrelated in-flight
   WIP must not ship) with plugin versions bumped per the reversion rule.
   Verify tarball contents: embedded peer pins = new corridor, zero WIP
   paths, zero stale-version refs outside intentionally historical comments.
   Commit the tarballs.
6. **Merge the PR first; move the host pin last** — editing
   `.opencode/services/dsh-web.toml` hot-restarts the service through
   svcwatch and kills agent sessions. Do it outside a working session (or
   restart the container after the edit).
7. **First-boot proof**: `grep -E "skipping profile bundle|disabling profile
   plugin" <boot log>` must print **nothing** (any hit means a cohort pin
   was missed). Fetch the fresh `?token=` launch URL from the boot log.

## Updating a kit machine

- **Way A (recommended)**: re-run the multi-package `dsh plugin add` command
  from `dsh-hive-dist/README.md` at the merged ref — re-running upgrades the
  whole cohort (packages self-build on install).
- **Way B (offline)**: copy `dsh-hive-dist/` to the machine; the updater's
  tarball mode then pins by name — which is exactly why the reversion rule
  matters.

## Rollback caveats

- **Binaries roll back; data does not.** Sessions written by the newer host
  may fail *explicitly* on the older host (tool-registry developer messages;
  schedule interval floor 300→60 s in the α.2→rc.2 corridor).
- Keep the service TOML version >= what the profile actually serves.
- Emergency bridge for a missed pin: profile-local `compatibility.json`
  exemption or `dsh plugin allow-version <pkg@ver> --dsh-version <exact>
  --accept-risk` — temporary only; fix the pins as the resting state.
