# ── hive-board ── paste into the entrypoint AFTER the `opencode serve` line ──
OPENCODE_PORT=4096   # ⚠️ EDIT (1/2): the port your entrypoint passes to `opencode serve --port`

# The viewer ships INSIDE the HIVE plugin package (src/board-viewer/), so this
# points at the plugin checkout — there is no separate hive-board repo.
HIVE_DIR=/workspace/projects/evolutional_agent_structure
HIVE_BOARD_LOG=/var/log/hive-board.log

# deps live in the /workspace volume; idempotent, ~200ms when already installed
(cd "$HIVE_DIR" && bun install) >> "$HIVE_BOARD_LOG" 2>&1

# respawn loop — Docker supervises only PID 1; a crashed board must self-restart
#
# --host 0.0.0.0 is REQUIRED and deliberate: the viewer defaults to 127.0.0.1
# (safe-by-default in a published package) and would otherwise be unreachable
# through the published port. It will print an exposure warning on startup —
# that warning is expected here, and is why the mapping below should stay on a
# network you trust.
(
  while true; do
    bun run "$HIVE_DIR/src/board-viewer/server.ts" \
      --root /workspace \
      --host 0.0.0.0 \
      --port 4400 \
      --opencode-url "http://127.0.0.1:${OPENCODE_PORT}" \
      --gui-url "${HIVE_BOARD_GUI_URL:-http://studio:3000}" \
      >> "$HIVE_BOARD_LOG" 2>&1
    echo "[entrypoint] hive-board exited (code $?) — respawning in 2s" >> "$HIVE_BOARD_LOG"
    sleep 2
  done
) &
# ── end hive-board ───────────────────────────────────────────────────────────
