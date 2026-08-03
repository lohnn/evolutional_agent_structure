# ── hive-board ── paste into the entrypoint AFTER the `opencode serve` line ──
OPENCODE_PORT=4096   # ⚠️ EDIT (1/2): the port your entrypoint passes to `opencode serve --port`

HIVE_BOARD_DIR=/workspace/projects/hive-board
HIVE_BOARD_LOG=/var/log/hive-board.log

# deps live in the /workspace volume; idempotent, ~200ms when already installed
(cd "$HIVE_BOARD_DIR" && bun install) >> "$HIVE_BOARD_LOG" 2>&1

# respawn loop — Docker supervises only PID 1; a crashed board must self-restart
(
  while true; do
    bun run "$HIVE_BOARD_DIR/src/server.ts" \
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
