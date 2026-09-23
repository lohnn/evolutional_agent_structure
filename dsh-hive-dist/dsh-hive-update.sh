#!/usr/bin/env bash
# dsh-hive-update.sh — install-or-update the @hive/* DSH plugin cohort into a
# dsh profile. Designed to run as a svcwatch `pre_start` step on EVERY
# (re)start of dsh-hive-web: each run force-re-resolves the floating git ref;
# a moved ref upgrades the cohort before the fresh dsh web boots.
#
# Usage:
#   dsh-hive-update.sh [profile-dir]        (default: ~/.dsh/profiles/hive)
# Env:
#   DSH_HIVE_REF   git ref to track                        (default: main)
#   DSH_HIVE_REPO  git base for the specs                  (default: github:lohnn/evolutional_agent_structure)
#   DSH_VERSION   pinned harness version for `dsh plugin` (default:
#                 0.1.7-alpha.2; when run under the dsh-hive-web service, the
#                 TOML `env` sets this and remains the single version source —
#                 bump THAT line, and keep it >= the version the profile
#                 actually serves)
#
# Behavior:
#   - First run: creates the profile scaffold next to what a `pnpm install`
#     needs (.pnpmfile.cjs, cordis ymls, pnpm-workspace.yaml with the two
#     settings git-hosted cohorts require, minimal package.json). Existing
#     files are NEVER overwritten — adjust them in place afterward.
#   - Every run: moves hand-written Berget/usage rows OUT of the profile's
#     cordis.patch.yml if present (the trio now ships its own
#     dsh.bundle.patch rows; a bundle row + a patch row with the same id
#     hard-fails the compose), then `dsh plugin add` bootstraps all NINE
#     packages (same repo+ref) and `dsh plugin update` force-re-resolves their
#     unchanged floating specs. The trio's bundle rows land in the profile's
#     dsh.profile.bundles automatically via the add.
#   - Offline tolerance: if either plugin command fails BUT the profile already
#     has the cohort installed, we keep the existing install and exit 0 so the
#     service still boots (stale-but-up beats down). If nothing is installed,
#     exit non-zero — svcwatch aborts the start and backs off.
set -u
set -o pipefail

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
DSH_VERSION="${DSH_VERSION:-0.1.7-alpha.2}"
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
# The Cordis files are user-owned after their initial scaffold. The pnpm hook
# is installer-owned: it describes the private cohort dependency graph and must
# track its tarball names, so refresh it before every cohort installation.
for f in cordis.yml cordis.patch.yml; do
  if [ ! -f "$PROFILE/$f" ]; then
    [ -f "$KIT/$f" ] || die "missing $KIT/$f — run from a complete dsh-hive-dist checkout"
    cp "$KIT/$f" "$PROFILE/$f"
    log "scaffold: wrote $f"
  fi
done
[ -f "$KIT/.pnpmfile.cjs" ] || die "missing $KIT/.pnpmfile.cjs — run from a complete dsh-hive-dist checkout"
install -m 0644 "$KIT/.pnpmfile.cjs" "$PROFILE/.pnpmfile.cjs" || die "cannot refresh profile .pnpmfile.cjs"
log "profile: refreshed managed .pnpmfile.cjs"

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

# Moved to bundle rows: strip hand-written Berget/usage rows from the
# profile's cordis.patch.yml. Since PR "promote the berget/usage trio to
# self-declared profile bundles" the trio's packages carry their own
# dsh.bundle.patch — and a surviving hand row with the same id would
# hard-fail every boot with "duplicate loader entry id". Profiles created
# from the current kit scaffold are already clean; this repairs older ones.
# Idempotent, and the profile's OTHER editing is untouched.
node - "$PROFILE/cordis.patch.yml" <<'NODE'
const fs = require("node:fs")
const path = process.argv[2]
const LEGACY = new Map([
  ["dsh-berget-refresh", "dsh-berget-refresh"],
  ["dsh-berget-usage", "dsh-berget-usage"],
  ["provider-usage", "dsh-provider-usage"],
])
let text = fs.readFileSync(path, "utf8") // exits 1 if scaffold failed earlier
const lines = text.split("\n")
const out = []
let removed = 0
for (let i = 0; i < lines.length; i++) {
  const idLine = lines[i]
  const idMatch = idLine.match(/^(\s*)-\s+id:\s*(\S+)\s*$/)
  const nameLine = idMatch ? lines[i + 1] : undefined
  const nameMatch =
    idMatch && nameLine ? nameLine.match(/^(\s*)name:\s*'?([^'\n]+?)'?\s*$/) : undefined
  if (idMatch && nameMatch && LEGACY.get(idMatch[2]) === nameMatch[2]) {
    // Drop the id+name pair and any following `config:` block (deeper- or
    // equal-indentation lines, plus blank separators) that belongs to it.
    removed += 1
    const indent = idMatch[1]
    let j = i + 2
    while (
      j < lines.length &&
      (lines[j].trim() === "" ||
        lines[j].startsWith(`${indent}  `) ||
        (lines[j].startsWith(`${indent}config:`) ?? false))
    ) {
      if (lines[j].trim() === "" && !/^[\s]*[^\s]/.test(lines[j + 1] ?? "")) break
      j += 1
    }
    i = j - 1
    continue
  }
  out.push(idLine)
}
if (removed > 0) {
  fs.writeFileSync(path, out.join("\n"))
  console.log(
    `[dsh-hive-update] patch: removed ${removed} hand row(s) for the bundle-carried Berget/usage trio (prevents duplicate loader entry id)`,
  )
}
NODE

# Repair profiles scaffolded before the board merge: the kit's patch rows
# gained the `board` load row (@hive/dsh-tools waits for the board service;
# six-row profiles leave tools pending forever). Idempotent.
node - "$PROFILE/cordis.patch.yml" <<'NODE'
const fs = require("node:fs")
const path = process.argv[2]
if (!fs.existsSync(path)) process.exit(0)
const text = fs.readFileSync(path, "utf8")
if (text.includes("@hive/dsh-board")) process.exit(0)
const row = "    - id: board\n      name: '@hive/dsh-board'\n"
if (!/\n- insert:\n/.test(text)) {
  fs.writeFileSync(path, `${text.replace(/\s*$/, "\n")}\n- insert:\n${row}`)
  console.log("[dsh-hive-update] patch: appended board insert block (tools' board service row)")
} else {
  // Insert at the END OF THE INSERT REGION, never at EOF: profiles may carry
  // hand-tuned local rows AFTER the block (column-0 items such as local
  // `disabled:` overrides) — appending a four-space row there corrupts the
  // YAML nesting (observed on a hand-tuned web profile, 2026-09-18).
  const lines = text.replace(/\s*$/, "").split("\n")
  const ins = lines.indexOf("- insert:")
  let end = ins + 1
  let sawRow = false
  for (let i = ins + 1; i < lines.length; i++) {
    if (/^ {4}- id:/.test(lines[i])) { sawRow = true; continue }
    if (sawRow && (lines[i].startsWith("- ") || lines[i].startsWith("#"))) { end = i; break }
  }
  if (!sawRow) end = lines.length
  lines.splice(end, 0, "    - id: board", "      name: '@hive/dsh-board'")
  fs.writeFileSync(path, lines.join("\n") + "\n")
  console.log("[dsh-hive-update] patch: inserted the board load row (tools' board service row)")
}
NODE

# ── install / update: tarball-first, git fallback ───────────────────────────
# TARBALL mode (default): the kit ships PREBUILT cohort tarballs (packed at
# release time — dist/ included). The updater copies them beside the
# profile's .pnpmfile.cjs, and `dsh plugin add` uses file: specs, so pnpm
# never runs a prepare: no bun, no allowBuilds, no git-clone, and each
# release's tarballs are the pinned version the profile gets.
#
# The service pre-start fetches the small text kit files from raw GitHub. Keep
# this script self-sufficient too: an already-installed service TOML may be
# older than the current template and therefore not fetch the tarballs itself.
# Once this freshly fetched updater runs, it fills a missing kit from the same
# ref before choosing a transport. That prevents a stale pre-start from
# falling through to pnpm's fragile git-hosted prepare path.
#
# GIT fallback (kit tarballs unavailable): `dsh plugin add` with github:…
# #path:… specs. pnpm >= 11 blocks the git-hosted `prepare` builds behind
# an allowBuilds allowlist keyed by the RESOLVED spec (codeload URL with
# the commit sha embedded) — `dangerouslyAllowAllBuilds: true` is pnpm-10
# vocabulary, ignored by 11/12. For the fallback the script manages a
# marker-wrapped allowBuilds block keyed to the freshly resolved sha.
# CAVEAT (verified 2026-09-18): even with the allowlist satisfied, pnpm 12
# hands git-hosted prepares to a bun runner that walks UP to the cloned
# repo's workspace root and recursively prepares ALL monorepo packages —
# whose cross-package imports need sibling dist/ that does not exist in a
# fresh clone. Git-mode installs of the post-board cohort are therefore
# unreliable by construction; ship kit tarballs instead (they are the
# release artifacts). Also: pnpm 11's allowBuilds matcher rejects even the
# exact keys it prints (upstream, 11.24 verified) — the fallback targets
# pnpm 10.x or >=12.0 only.
KIT_TARBALLS=(
  hive-dsh-agents-0.0.1.tgz
  hive-dsh-board-0.1.0.tgz
  hive-dsh-dream-archive-0.0.1.tgz
  hive-dsh-evolution-0.0.1.tgz
  hive-dsh-hivemind-0.0.1.tgz
  hive-dsh-painpoints-0.0.1.tgz
  hive-dsh-tools-0.0.1.tgz
  dsh-berget-refresh-0.1.0.tgz
  dsh-berget-usage-0.2.0.tgz
  dsh-provider-usage-0.1.0.tgz
)

kit_has_all_tarballs() {
  local archive
  for archive in "${KIT_TARBALLS[@]}"; do
    [ -f "$KIT/$archive" ] || return 1
  done
}

fetch_missing_tarballs() {
  [ "${DSH_HIVE_GIT_MODE:-0}" = "1" ] && return 0
  command -v curl >/dev/null 2>&1 || return 0

  local raw_root="${DSH_HIVE_RAW:-}"
  if [ -z "$raw_root" ]; then
    case "$REPO" in
      github:*) raw_root="https://raw.githubusercontent.com/${REPO#github:}" ;;
      git+https://github.com/*.git) raw_root="https://raw.githubusercontent.com/${REPO#git+https://github.com/}"; raw_root="${raw_root%.git}" ;;
      https://github.com/*.git) raw_root="https://raw.githubusercontent.com/${REPO#https://github.com/}"; raw_root="${raw_root%.git}" ;;
      *) return 0 ;;
    esac
  fi

  local archive url tmp
  for archive in "${KIT_TARBALLS[@]}"; do
    [ -f "$KIT/$archive" ] && continue
    url="${raw_root%/}/${REF}/dsh-hive-dist/$archive"
    tmp="$KIT/.tmp.$archive"
    if curl -fsSL --max-time 60 "$url" -o "$tmp"; then
      mv "$tmp" "$KIT/$archive"
      log "tarball: fetched $archive"
    else
      rm -f "$tmp"
      warn "tarball: could not fetch $archive from $url"
    fi
  done
}

fetch_missing_tarballs
HAS_KIT_TARBALLS=0
if kit_has_all_tarballs; then HAS_KIT_TARBALLS=1; fi
# Tarballs already include dist/. Their package manifests retain source-tree
# prepare hooks, which pnpm otherwise runs while adding file: archives and
# which cannot resolve the isolated cohort's workspace imports.
IGNORE_PACKAGE_SCRIPTS=false

if [ "$HAS_KIT_TARBALLS" = "1" ] && [ "${DSH_HIVE_GIT_MODE:-0}" != "1" ]; then
  IGNORE_PACKAGE_SCRIPTS=true
  # ── TARBALL mode ──────────────────────────────────────────────────────────
  cp "$KIT"/*.tgz "$PROFILE/"
  log "tarball mode: copied $(ls "$KIT"/*.tgz | wc -l | tr -d ' ') kit tarballs beside the profile hook"
  # Relative specs ONLY, and the add must run with the profile as the pnpm
  # cwd. Absolute file: args get re-anchored through the dsh plugin-manager
  # chain with the profile name injected as a phantom segment (observed:
  # "…/profiles/web/web/hive-dsh-agents-0.0.1.tgz", and "hive/hive/…"
  # before it) — relative "./x.tgz" args resolve against the manifest's own
  # dir and never travel through that code. The updater therefore `cd`s
  # into the profile (restoring cwd after) and the plugin-manager's own
  # rel-spec anchoring against the caller cwd is bypassed by the cd.
  SPECS=(
    file:./hive-dsh-agents-0.0.1.tgz
    file:./hive-dsh-board-0.1.0.tgz
    file:./hive-dsh-dream-archive-0.0.1.tgz
    file:./hive-dsh-evolution-0.0.1.tgz
    file:./hive-dsh-hivemind-0.0.1.tgz
    file:./hive-dsh-painpoints-0.0.1.tgz
    file:./hive-dsh-tools-0.0.1.tgz
    file:./dsh-berget-refresh-0.1.0.tgz
    file:./dsh-berget-usage-0.2.0.tgz
    file:./dsh-provider-usage-0.1.0.tgz
  )
  PACKAGES_NAMES=(
    @hive/dsh-agents @hive/dsh-board @hive/dsh-dream-archive @hive/dsh-evolution
    @hive/dsh-hivemind @hive/dsh-painpoints @hive/dsh-tools
    dsh-berget-refresh dsh-berget-usage dsh-provider-usage
  )
else
  # ── GIT fallback mode ─────────────────────────────────────────────────────
  REF_SHA="$(git ls-remote "${REPO/github:/https://github.com/}" "refs/heads/$REF" 2>/dev/null | cut -f1)"
  if [ -z "$REF_SHA" ]; then REF_SHA="$(git ls-remote "${REPO/github:/https://github.com/}" "refs/tags/$REF" 2>/dev/null | cut -f1)"; fi
  if [ -z "$REF_SHA" ]; then REF_SHA="$REF"; fi
  CODELOAD_BASE="$(echo "${REPO/github:/}" | sed 's#^#https://codeload.github.com/#')/tar.gz/$REF_SHA"
  PNPMWS="$PROFILE/pnpm-workspace.yaml"
  node - "$PNPMWS" "$CODELOAD_BASE" agents board dream-archive evolution hivemind painpoints tools berget-refresh berget-usage provider-usage <<'NODE'
const fs = require("node:fs")
const [path, base, ...dirs] = process.argv.slice(2)
const BEGIN = "# dsh-hive-update:allowBuilds(begin)"
const END = "# dsh-hive-update:allowBuilds(end)"
let text = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""
const re = new RegExp(`\\n?${BEGIN}[\\s\\S]*?${END}\\n?`, "g")
text = text.replace(re, "")
const lines = ["", BEGIN, "allowBuilds:"]
for (const d of dirs) {
  const name = d.startsWith("berget-") ? d : `@hive/dsh-${d}`
  lines.push(`  '${name}@${base}#path:dsh-hive/packages/${d}': true`)
}
lines.push(END, "")
text += lines.join("\n")
fs.writeFileSync(path, text)
console.log("[dsh-hive-update] allowBuilds: wrote managed block (git fallback, sha-pinned)")
NODE
  PNPM_MAJOR="$(pnpm --version 2>/dev/null | cut -d. -f1)"
  if [ "$PNPM_MAJOR" = "11" ]; then
    warn "pnpm 11.x detected: its allowBuilds matcher rejects even the exact keys it prints (upstream, 11.24 verified) — ship kit tarballs or move to pnpm 10.x/>=12.0"
  fi
  SPECS=()
  for p in agents board dream-archive evolution hivemind painpoints tools berget-refresh berget-usage provider-usage; do
    SPECS+=("$REPO#$REF&path:dsh-hive/packages/$p")
  done
  PACKAGES_NAMES=(
    @hive/dsh-agents @hive/dsh-board @hive/dsh-dream-archive @hive/dsh-evolution
    @hive/dsh-hivemind @hive/dsh-painpoints @hive/dsh-tools
    dsh-berget-refresh dsh-berget-usage dsh-provider-usage
  )
fi

run_dsh_plugin() {
  # dsh-app-boot imports this peer at runtime. Keep this bootstrap invocation
  # aligned with the web service command: `pnpm dlx dsh` alone can resolve the
  # CLI but then fails before `plugin add` runs with ERR_MODULE_NOT_FOUND.
  DSH_HIVE_REF="$REF" DSH_HIVE_REPO="$REPO" PNPM_CONFIG_IGNORE_SCRIPTS="$IGNORE_PACKAGE_SCRIPTS" \
    pnpm \
      --package "@deepseek-ai/cordis-plugin-group@1.0.4" \
      --package "@deepseek-ai/dsh@$DSH_VERSION" \
      dlx \
      --allow-build=@deepseek-ai/dsh-subprocess-local \
      --allow-build=@google/genai \
      --allow-build=koffi \
      --allow-build=node-pty \
      --allow-build=protobufjs \
      dsh \
      plugin --profile "$NAME" "$@"
}

has_usable_board() {
  [ -f "$PROFILE/node_modules/@hive/dsh-board/dist/index.js" ] &&
    [ -f "$PROFILE/node_modules/@hive/dsh-board/dist/lib/board-transitions.js" ] &&
    [ -f "$PROFILE/node_modules/@hive/dsh-board/client.js" ]
}

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT
# Output streams live (tee) AND is kept, so a failure can quote the actual
# error — the 2026-09-15 war: every pre_start failure surfaced as a bare
# "keeping it (offline?)" while the real cause (a session write policy
# denying dlx-cache writes under /root) sat buried in pnpm stderr.
log "dsh plugin add — profile=$NAME (10 packages)"
# cd into the profile so relative file: specs (tarball mode) and pnpm's own
# file: resolution anchor at the manifest dir, never the caller's cwd.
if ! ( cd "$PROFILE" && run_dsh_plugin add "${SPECS[@]}" 2>&1 ) | tee "$OUT"; then
  warn "add FAILED — last output lines:"
  tail -n 12 "$OUT" | while IFS= read -r l; do warn "  └ $l"; done
  if [ -e "$PROFILE/node_modules/@hive/dsh-dream-archive/dist/index.js" ] && has_usable_board; then
    warn "add FAILED but a complete board-capable install already exists — keeping it (was it offline? see lines above)"
    exit 0
  fi
  die "add FAILED and no complete board-capable install exists — service start must be aborted"
fi

if [ "$HAS_KIT_TARBALLS" = "1" ] && [ "${DSH_HIVE_GIT_MODE:-0}" != "1" ]; then
  log "tarball mode: versions pinned by the shipped kit tarballs — nothing to re-resolve"
  exit 0
fi

log "dsh plugin update — force-re-resolving ref=$REF (10 packages)"
if run_dsh_plugin update "${PACKAGES_NAMES[@]}" 2>&1 | tee "$OUT"; then
  log "cohort up to date (ref $REF)"
  exit 0
fi

warn "update FAILED — last output lines:"
tail -n 12 "$OUT" | while IFS= read -r l; do warn "  └ $l"; done
if [ -e "$PROFILE/node_modules/@hive/dsh-dream-archive/dist/index.js" ] && has_usable_board; then
  warn "update FAILED but a complete board-capable install already exists — keeping it (was it offline? see lines above)"
  exit 0
fi
die "update FAILED and no complete board-capable install exists — service start must be aborted"
