#!/bin/bash
# Byte-identity gate: run the SAME dream cycle through OpenCode's tools.ts
# (bun) and the dsh port (node), then diff the resulting archive trees with
# volatile fields (ISO timestamps) normalized. Any other byte difference
# fails the gate.
set -euo pipefail

ROOT=/workspace/scratch/dsh-migration/dsh-hive
OC_WS=$(mktemp -d /tmp/opencode/byteid-opencode-XXXX)
DSH_WS=$(mktemp -d /tmp/opencode/byteid-dsh-XXXX)

cleanup() { rm -rf "$OC_WS" "$DSH_WS"; }
trap cleanup EXIT

echo "── opencode run ($OC_WS)"
(cd /workspace/projects/evolutional_agent_structure && bun "$ROOT/fixtures/opencode-fixture-run.ts" "$OC_WS")

echo "── dsh run ($DSH_WS)"
(cd "$ROOT/packages/tools" && node "$ROOT/packages/tools/test/dsh-fixture-run.mjs" "$DSH_WS")

echo "── normalized diff"
# Normalize: ISO-8601 timestamps (entry_time, exit_time, journal headers,
# telemetry ts + filenames) are volatile by design. Everything else must match.
normalize() {
  sed -E \
    -e 's/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z/<TS>/g' \
    -e 's/[0-9]{14,15}/<HARTS>/g'
}

DIFF_OUT=$(
  diff -r <(cd "$OC_WS" && find . -type f | sort | grep -v telemetry | sed -E 's/[0-9]{14,15}/<HARTS>/g') \
          <(cd "$DSH_WS" && find . -type f | sort | grep -v telemetry | sed -E 's/[0-9]{14,15}/<HARTS>/g') || true
)
if [ -n "$DIFF_OUT" ]; then
  echo "FAIL: file LISTS differ:"; echo "$DIFF_OUT"; exit 1
fi

FAILED=0
while IFS= read -r relnorm; do
  # map normalized name back to each side's concrete file (harvest ts differs)
  a=$(cd "$OC_WS" && find . -type f | grep -v telemetry | sed -E 's/[0-9]{14,15}/<HARTS>/g' | grep -F "$relnorm" | head -1)
  # find concrete paths by matching the normalized pattern
  afile=$(cd "$OC_WS" && find . -type f | grep -v telemetry | while read -r f; do nf=$(echo "$f" | sed -E 's/[0-9]{14,15}/<HARTS>/g'); [ "$nf" = "$relnorm" ] && echo "$f" && break; done)
  bfile=$(cd "$DSH_WS" && find . -type f | grep -v telemetry | while read -r f; do nf=$(echo "$f" | sed -E 's/[0-9]{14,15}/<HARTS>/g'); [ "$nf" = "$relnorm" ] && echo "$f" && break; done)
  if ! diff <(normalize < "$OC_WS/$afile") <(normalize < "$DSH_WS/$bfile") > /dev/null; then
    echo "FAIL: $relnorm differs (after timestamp normalization):"
    diff <(normalize < "$OC_WS/$afile") <(normalize < "$DSH_WS/$bfile") | head -20
    FAILED=1
  fi
done < <(cd "$OC_WS" && find . -type f | sort | grep -v telemetry | sed -E 's/[0-9]{14,15}/<HARTS>/g')

if [ "$FAILED" = "1" ]; then exit 1; fi
echo "PASS: archive trees byte-identical (timestamps normalized)"
