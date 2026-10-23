#!/usr/bin/env bash
# Kit freshness gate — the #59/#60 failure mode, machine-enforced.
#
# Failure mode (hit 2026-10-14): a board feature PR merged as source only; no
# tarball was repacked, so kit machines kept resolving board@0.1.5 and never
# got the buttons. The reversion rule (see ../../docs/DSH-UPDATE-RUNBOOK.md)
# demands a version bump + repack in the same PR; this gate makes CI fail
# when the rule is skipped.
#
# The check is git ANCESTRY, not a rebuild: for every dsh-hive package, the
# committed kit tarball matching the package's CURRENT version must have been
# last committed at or after the last commit that touched that package's
# build inputs. Rebuild-based diffs would need bun in CI and chip-free byte
# determinism (the client build stamps the short SHA + -dirty) — the ancestry
# check is exact, instant, and version-drift-proof.
#
#   ✅ tarball baked in the same commit as the source change (the normal
#      rebake flow), or in any commit after it
#   ❌ source commits newer than the tarball's birth  → FAIL
#   ❌ no tarball matching the current version at all → FAIL (version bump
#      without a repack — the exact reversion-rule miss)
#
# docs/ and test/ inside a package are excluded from the source watch list:
# they are not in the tarball's `files`, so touching them must not force a
# rebake. Everything else in the package dir is build input (src, websrc,
# scripts, client.js, package.json, tsconfig…).

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Packages intentionally NOT kit-shipped. Absence of a tarball is a DECISION
# here, not an omission — add a reason when you edit this list.
#   research-rampage: #53 — ships with the dsh host bundle (a dsh-commands
#   bundle patch), not as part of the hive profile cohort.
#   dsh-hive-relay: a plain svcwatch service, NOT a dsh plugin: the
#   kit installs plugins through `dsh plugin add` from KIT_TARBALLS, and a
#   plugin-less tarball has no verified semantics there. Kit machines fetch
#   relay.js directly (dsh-hive-relay.toml's pre_start, the same raw-fetch
#   rail as dsh-hive-web.toml's kit bootstrap). Mirrored in the rebake
#   filter (dsh-hive/scripts/rebake-kit.mjs).
NOT_KIT_SHIPPED="research-rampage dsh-hive-relay"

fail=0
for pkg_dir in dsh-hive/packages/*/; do
  pkg_short=${pkg_dir#dsh-hive/packages/}; pkg_short=${pkg_short%/}
  case " $NOT_KIT_SHIPPED " in
    *" $pkg_short "*)
      echo "SKIP $pkg_short — deliberately not kit-shipped (see NOT_KIT_SHIPPED above)"
      continue;;
  esac
  name=$(sed -n 's/.*"name": "\([^"]*\)".*/\1/p' "${pkg_dir}package.json" | head -1)
  version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "${pkg_dir}package.json" | head -1)
  [ -n "$name" ] && [ -n "$version" ] || {
    echo "FAIL ${pkg_dir}: cannot read name/version from package.json"; fail=1; continue
  }
  mangled=${name#@}; mangled=${mangled//\//-}
  tarball="dsh-hive-dist/${mangled}-${version}.tgz"

  src_sha=$(git log -1 --format=%H \
    -- "${pkg_dir}" \
    ':(exclude)'"${pkg_dir}"'docs' \
    ':(exclude)'"${pkg_dir}"'test')
  if [ -z "$src_sha" ]; then
    # A package with no build-input history yet (freshly scaffolded, or only
    # docs/test committed so far): nothing to go stale relative to.
    echo "OK   ${name}@${version} — no build-input commits yet"
    continue
  fi

  if [ ! -f "$tarball" ]; then
    echo "FAIL ${name}@${version} — no kit tarball ${tarball}."
    echo "     Repack in the same PR: pnpm --dir dsh-hive rebake ${mangled##*-}   (see docs/DSH-UPDATE-RUNBOOK.md)"
    fail=1
    continue
  fi

  tar_sha=$(git log -1 --format=%H -- "$tarball")
  if [ -z "$tar_sha" ]; then
    # Local-only state: packed but not yet committed. CI checks out a clean
    # tree, so it can never see this branch there — and its updater-bootstrap
    # gate fails independently if a referenced tarball was never committed.
    echo "WARN ${name}@${version} — ${mangled}-${version}.tgz exists but is not committed yet; commit it in the same PR"
    continue
  fi
  if git merge-base --is-ancestor "$src_sha" "$tar_sha"; then
    short_src=${src_sha:0:7}; short_tar=${tar_sha:0:7}
    fresh_note=""
    [ "$src_sha" != "$tar_sha" ] && fresh_note=" (covers ${short_src})"
    echo "OK   ${name}@${version} — ${mangled}-${version}.tgz baked in ${short_tar}${fresh_note}"
  else
    echo "FAIL ${name}@${version} — source changed in ${src_sha:0:7} but the kit still serves ${mangled}-${version}.tgz baked in ${tar_sha:0:7}."
    echo "     Kit machines will keep resolving the old version (the #59/#60 lesson). Repack in the same PR:"
    echo "       pnpm --dir dsh-hive rebake ${mangled##*-}   (see docs/DSH-UPDATE-RUNBOOK.md)"
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "kit freshness OK — every package tarball covers its latest build inputs"
else
  echo "kit freshness FAILED — merge without repacking ships to nobody (see docs/DSH-UPDATE-RUNBOOK.md, tarball reversion rule)"
fi
exit "$fail"
