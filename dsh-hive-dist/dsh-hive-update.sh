#!/usr/bin/env bash
# dsh-hive-update.sh — install-or-update the @hive/* DSH plugin cohort into a
# dsh profile. Designed to run as a svcwatch `pre_start` step on EVERY
# (re)start of dsh-hive-web: egress costs one git re-resolve when nothing
# changed; a moved ref upgrades the cohort before the fresh dsh web boots.
#
# Usage:
#   dsh-hive-update.sh [profile-dir]        (default: ~/.dsh/profiles/hive)
# Env:
#   DSH_HIVE_REF   git ref to track                        (default: main)
#   DSH_HIVE_REPO  git base for the specs                  (default: github:lohnn/evolutional_agent_structure)
#   DSH_VERSION    pinned harness version for `dsh plugin` (default: 0.1.2-rc.1)
#
# Behavior:
#   - First run: creates the profile scaffold next to what a `pnpm install`
#     needs (.pnpmfile.cjs, cordis ymls, pnpm-workspace.yaml with the two
#     settings git-hosted cohorts require, minimal package.json). Existing
#     files are NEVER overwritten — adjust them in place afterward.
#   - Every run: `dsh plugin add` for all SEVEN packages in one command
#     (same repo+ref). pnpm re-resolves the ref; re-running upgrades.
#   - Offline tolerance: if the add fails BUT the profile already has the
#     cohort installed, we keep the existing install and exit 0 so the
#     service still boots (stale-but-up beats down). If nothing is installed,
#     exit non-zero — svcwatch aborts the start and backs off.
set -u

PROFILE="${1:-${HOME}/.dsh/profiles/hive}"
REF="${DSH_HIVE_REF:-main}"
REPO="${DSH_HIVE_REPO:-github:lohnn/evolutional_agent_structure}"
DSH_VERSION="${DSH_VERSION:-0.1.2-rc.1}"
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="$(basename "$PROFILE")"
STAMP="[dsh-hive-update]"

log() { printf '%s %s\n' "$STAMP" "$*"; }

die() { log "ERROR: $*"; exit 1; }
warn() { log "WARN: $*"; }

command -v pnpm >/dev/null 2>&1 || die "pnpm not on PATH"
command -v node >/dev/null 2>&1 || die "node not on PATH"

mkdir -p "$PROFILE" || die "cannot create $PROFILE"

# ── scaffold: copy-if-absent from THIS kit directory ────────────────────────
for f in .pnpmfile.cjs cordis.yml cordis.patch.yml; do
  if [ ! -f "$PROFILE/$f" ]; then
    [ -f "$KIT/$f" ] || die "missing $KIT/$f — run from a complete dsh-hive-dist checkout"
    cp "$KIT/$f" "$PROFILE/$f"
    log "scaffold: wrote $f"
  fi
done

ensure_setting() { # file, line, marker-grep
  if ! grep -qF "$3" "$1" 2>/dev/null; then
    printf '\n# dsh-hive-update: required by the git-hosted @hive cohort\n%s\n' "$2" >>"$1"
    log "workspace: appended $3"
  fi
}

PNPMWS="$PROFILE/pnpm-workspace.yaml"
if [ ! -f "$PNPMWS" ]; then
  cat >"$PNPMWS" <<'EOF'
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
# required by the git-hosted @hive cohort (see dsh-hive-dist/README.md):
dangerouslyAllowAllBuilds: true   # allow the packages' prepare (tsc) inside pnpm's bun-based prepare runner
blockExoticSubdeps: false         # tools' sibling deps come from the same git repo
EOF
  log "workspace: wrote pnpm-workspace.yaml"
else
  ensure_setting "$PNPMWS" 'dangerouslyAllowAllBuilds: true' 'dangerouslyAllowAllBuilds'
  ensure_setting "$PNPMWS" 'blockExoticSubdeps: false' 'blockExoticSubdeps'
fi

PKG="$PROFILE/package.json"
if [ ! -f "$PKG" ]; then
  cat >"$PKG" <<EOF
{
  "name": "dsh-profile-$NAME",
  "private": true,
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless"] } }
}
EOF
  log "profile: wrote package.json"
fi

# ── install / update: all seven in ONE add (cohort + hook template needs it) ─
SPECS=()
for p in agents dream-archive evolution hivemind painpoints tools; do
  SPECS+=("$REPO#$REF&path:dsh-hive/packages/$p")
done
SPECS+=("$REPO#$REF&path:dsh-hive/packages/berget-refresh")

log "dsh plugin add — profile=$NAME ref=$REF (7 packages)"
if DSH_HIVE_REF="$REF" DSH_HIVE_REPO="$REPO" \
   pnpm dlx "@deepseek-ai/dsh@$DSH_VERSION" plugin --profile "$NAME" add "${SPECS[@]}"; then
  log "cohort up to date (ref $REF)"
  exit 0
fi

if [ -e "$PROFILE/node_modules/@hive/dsh-dream-archive/dist/index.js" ]; then
  warn "add FAILED but an install already exists — keeping it (offline?)"
  exit 0
fi
die "add FAILED and no existing install — service start must be aborted"
