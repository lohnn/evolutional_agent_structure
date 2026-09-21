#!/usr/bin/env bash
# Hermetic smoke test for the self-updating kit path. It starts with only the
# text kit files, so the updater must fetch every release artifact and select
# file:-tarball mode instead of falling back to git-hosted prepares.
set -euo pipefail

ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT

KIT="$ROOT/kit"
PROFILE="$ROOT/profile"
BIN="$ROOT/bin"
HOME_DIR="$ROOT/home"
TRACE="$ROOT/pnpm.args"
CURL_TRACE="$ROOT/curl.urls"
ARCHIVE="$ROOT/archive.tgz"
mkdir -p "$KIT" "$BIN" "$HOME_DIR"

cp \
  dsh-hive-dist/dsh-hive-update.sh \
  dsh-hive-dist/.pnpmfile.cjs \
  dsh-hive-dist/cordis.yml \
  dsh-hive-dist/cordis.patch.yml \
  "$KIT/"
printf 'fixture archive\n' > "$ARCHIVE"

cat > "$BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
out=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    *) url="$1"; shift ;;
  esac
done
printf '%s\n' "$url" >> "$CURL_TRACE"
cp "$FIXTURE_ARCHIVE" "$out"
EOF

cat > "$BIN/pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "--version" ]; then
  echo '12.3.4'
  exit 0
fi
printf '%q ' "$@" >> "$PNPM_TRACE"
printf '\n' >> "$PNPM_TRACE"
EOF
chmod +x "$BIN/curl" "$BIN/pnpm"

HOME="$HOME_DIR" \
PATH="$BIN:$PATH" \
CURL_TRACE="$CURL_TRACE" \
FIXTURE_ARCHIVE="$ARCHIVE" \
PNPM_TRACE="$TRACE" \
DSH_HIVE_REF="fixture-ref" \
DSH_HIVE_RAW="https://example.test/evolutional_agent_structure" \
"$KIT/dsh-hive-update.sh" "$PROFILE" > "$ROOT/updater.log"

archives=(
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

for archive in "${archives[@]}"; do
  test -f "$KIT/$archive"
  test -f "$PROFILE/$archive"
  grep -qx "https://example.test/evolutional_agent_structure/fixture-ref/dsh-hive-dist/$archive" "$CURL_TRACE"
  grep -Fq "file:./$archive" "$TRACE"
done

grep -q "name: '@hive/dsh-board'" "$PROFILE/cordis.patch.yml"
grep -Fq '@deepseek-ai/cordis-plugin-group@1.0.2' "$TRACE"
grep -Fq '@deepseek-ai/cordis-plugin-group@1.0.2' dsh-hive-dist/dsh-hive-web.toml
grep -q 'tarball mode: copied 10 kit tarballs' "$ROOT/updater.log"

echo 'updater bootstrap test passed'
