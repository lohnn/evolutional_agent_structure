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
#   DSH_VERSION    pinned harness version for `dsh plugin` (default: 0.1.2-rc.1;
#                  when run under the dsh-hive-web service, the TOML `env` sets
#                  this — that line is then the single version source)
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

BERGET_ONLY=0
PROFILE=""
for a in "$@"; do
  case "$a" in
    --berget-only) BERGET_ONLY=1 ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) PROFILE="$a" ;;
  esac
done
PROFILE="${PROFILE:-${HOME}/.dsh/profiles/hive}"
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
mkdir -p "${HOME}/.dsh" || die "cannot create ${HOME}/.dsh"

# ── berget credentials: adopt an existing Berget Code (opencode) login ──────
# If the machine has already authenticated (opencode auth login for berget —
# the artifact lives in ~/.local/share/opencode/auth.json under "berget"),
# seed ~/.dsh/berget-credentials.json from it so dsh-berget-refresh has its
# state from the first boot. COPY ONLY: we never call the refresh endpoint
# here (it ROTATES the refresh token; racing the plugin's own rotation would
# be destructive). The plugin adopts refresh-token-wise from auth.json
# anyway; this just gives it the full state + sync-seedable access token
# earlier. Never overwrites an existing state file (it may hold a rotated
# token NEWER than auth.json).
adopt_berget_credentials() {
  local cred="$HOME/.dsh/berget-credentials.json"
  local auth="${BERGET_AUTH_SOURCE:-$HOME/.local/share/opencode/auth.json}"
  if [ -s "$cred" ]; then
    log "berget: credentials already present — leaving untouched"
    return 0
  fi
  if [ ! -s "$auth" ]; then
    warn "berget: no existing Berget Code login found ($auth) — \
run 'opencode auth login' (berget) or set BERGET_AUTH_SOURCE; continuing"
    return 0
  fi
  node - "$auth" "$cred" <<'NODE'
const fs = require("node:fs")
const { readFileSync, writeFileSync, renameSync, mkdirSync, chmodSync } = fs
const [authPath, credPath] = process.argv.slice(2)
const auth = JSON.parse(readFileSync(authPath, "utf8"))
const b = auth?.berget
const fail = (m) => { console.error(`[dsh-hive-update] berget: ${m}`); process.exit(2) }
if (!b || typeof b !== "object") fail(`no \"berget\" entry in ${authPath}`)
if (b.type !== "oauth") fail(`berget auth type \"${b.type}\" — OAuth expected; not adopted`)
if (typeof b.refresh !== "string" || b.refresh.length === 0) fail("berget entry has no refresh token")
const state = {
  type: "oauth",
  refresh: b.refresh,
  access: typeof b.access === "string" ? b.access : "",
  expires: typeof b.expires === "number" ? b.expires : 0,
  updatedAt: new Date().toISOString(),
}
mkdirSync(require("node:path").dirname(credPath), { recursive: true, mode: 0o700 })
const tmp = `${credPath}.tmp.${process.pid}`
writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 })
renameSync(tmp, credPath)
chmodSync(credPath, 0o600)
NODE
  case $? in
    0) log "berget: adopted Berget Code login from $auth -> $cred (0600)" ;;
    *) warn "berget: could not adopt from $auth (see above) — setup continues"
       return 1 ;;
  esac
  return 0
}

if [ "$BERGET_ONLY" = 1 ]; then
  adopt_berget_credentials
  exit $?
fi

adopt_berget_credentials

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
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } }
}
EOF
  log "profile: wrote package.json"
fi

# The service passes web-only flags, so repair profiles created by earlier
# versions of this script that selected the headless bundle.
node - "$PKG" <<'NODE'
const fs = require("node:fs")
const path = process.argv[2]
const pkg = JSON.parse(fs.readFileSync(path, "utf8"))
const profile = pkg.dsh?.profile
if (!profile || !Array.isArray(profile.bundles)) process.exit(0)
const headless = "@deepseek-ai/dsh-headless"
const web = "@deepseek-ai/dsh-web-app"
const index = profile.bundles.indexOf(headless)
if (index < 0) process.exit(0)
profile.bundles[index] = web
profile.bundles = profile.bundles.filter((bundle, i, bundles) => bundle !== web || i === bundles.indexOf(web))
fs.writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
NODE

# ── install / update: all seven in ONE add (cohort + hook template needs it) ─
SPECS=()
for p in agents dream-archive evolution hivemind painpoints tools; do
  SPECS+=("$REPO#$REF&path:dsh-hive/packages/$p")
done
SPECS+=("$REPO#$REF&path:dsh-hive/packages/berget-refresh")

log "dsh plugin add — profile=$NAME ref=$REF (7 packages)"
if DSH_HIVE_REF="$REF" DSH_HIVE_REPO="$REPO" \
   pnpm dlx \
     --allow-build @deepseek-ai/dsh-subprocess-local \
     --allow-build @google/genai \
     --allow-build koffi \
     --allow-build node-pty \
     --allow-build protobufjs \
     "@deepseek-ai/dsh@$DSH_VERSION" \
     plugin --profile "$NAME" add "${SPECS[@]}"; then
  log "cohort up to date (ref $REF)"
  exit 0
fi

if [ -e "$PROFILE/node_modules/@hive/dsh-dream-archive/dist/index.js" ]; then
  warn "add FAILED but an install already exists — keeping it (offline?)"
  exit 0
fi
die "add FAILED and no existing install — service start must be aborted"
