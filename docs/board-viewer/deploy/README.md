# hive-board — installation guide (same-container as opencode)

The board runs **in the same container as opencode**, started by the container
entrypoint. Follow the four Install steps in order — everything after that is
reference. You edit exactly **two** things, both marked `⚠️ EDIT`:
your opencode port (step 2) and your compose service name (step 3).
Everything else copy-pastes verbatim.

---

## Install

### 1. Add Bun to the Dockerfile

Add to your Dockerfile (anywhere after the base image line):

```dockerfile
# Bun — pinned system-wide; 1.3.14 is the version hive-board is verified against
COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun
RUN ln -sf /usr/local/bin/bun /usr/local/bin/bunx
```

**Check it worked:**

```console
$ docker build -t opencode-img . && docker run --rm opencode-img bun --version
1.3.14
```

### 2. Add the board to the entrypoint

Paste this block into your entrypoint script, **after** the line that starts
`opencode serve` (the board is a sibling process; opencode does not manage it).
One edit: set `OPENCODE_PORT` on the first line to the port your entrypoint
already passes to `opencode serve --port`.

```sh
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
```

(The same block lives in [`entrypoint-fragment.sh`](entrypoint-fragment.sh);
the README copy above is kept byte-identical by a test —
`test/deploy-docs.test.ts` fails if they drift.)

**Check it worked:** nothing to run yet — verified in step 4. If you want a
syntax check now: `bash -n your-entrypoint.sh`.

### 3. Publish the port in the compose file

Add the `ports` mapping to your existing opencode service:

```yaml
services:
  opencode:            # ⚠️ EDIT (2/2): your existing service name
    ports:
      - "4400:4400"    # hive-board
```

**Check it worked:** `docker compose config` renders without errors and shows
the `4400:4400` mapping.

### 4. Rebuild and verify

```console
$ docker compose up -d --build
```

Then, from the host (or any machine on your Tailscale/LAN):

```console
$ curl http://<host>:4400/healthz
ok
```

Open `http://<host>:4400/` — the board should render your capabilities,
dreams, and work items.

Finally confirm the session backend (what powers the **Start** buttons) is
wired — look at the board log:

```console
$ docker exec <container> tail -n 20 /var/log/hive-board.log
```

- ✅ You want to see: `[hive-board] session backend: http://127.0.0.1:<your port>`
- ❌ If you see: `[hive-board] session backend: NOT configured (Start disabled; set --opencode-url / OPENCODE_SERVER_PASSWORD)`
  → the `OPENCODE_PORT` edit in step 2 doesn't match your `opencode serve --port`,
  or `OPENCODE_SERVER_PASSWORD` isn't exported in the entrypoint's environment.
  Fix, `docker compose up -d --build`, re-check.

That's the whole install.

---

## Reference / why

- **Why a pinned, system-wide Bun (step 1):** the container previously had Bun
  only as an ad-hoc user-level install (`/root/.bun/bin`, one-off
  `curl | bash`) — it dies on every image rebuild and isn't on `PATH` for
  non-login shells. `COPY --from` of the official image is deterministic (no
  install script, no network fetch beyond the image pull). **To bump the pin:**
  change the tag, then run hive-board's `bunx tsc --noEmit && bun test` inside
  the container before trusting it.
- **Why `bun install` in the entrypoint, not the image:** the board and its
  `file:../evolutional_agent_structure` dependency live in the `/workspace`
  volume, not the image. The install is idempotent (~200 ms when populated).
  After changing the plugin repo itself, run `bun install --force` once — bun
  *copies* `file:` deps rather than symlinking.
- **Why the respawn loop (step 2):** Docker supervises only PID 1. The board
  once crashed in practice and stayed dead until manually restarted; the loop
  self-restarts it with a 2 s backoff and logs the exit code. Logs append to
  `/var/log/hive-board.log` inside the container
  (`docker exec <c> tail -f /var/log/hive-board.log`).
- **Why `--opencode-url` is explicit (step 2):** the board can auto-discover
  the opencode server, but only via `/proc/$OPENCODE_PID/cmdline` — and
  `OPENCODE_PID` exists only in processes *opencode itself spawns*. An
  entrypoint-started sibling doesn't have it, so relying on discovery here
  yields a silently degraded board (Start disabled). Same reason
  `--root /workspace` is explicit: no defaults-by-luck in deployment.
- **Password:** `OPENCODE_SERVER_PASSWORD` is inherited from the same
  environment that starts `opencode serve`, so it's present by construction.
  If it's ever absent the board still starts and renders everything;
  file-only transitions and re-attach promotes keep working; only
  session-*creating* affordances (Start / fresh promote) render disabled, and
  POSTs to them return an honest 409. The exact log lines are in step 4.

## Config reference

Precedence everywhere: **CLI flag > env var > default.** Read once at startup;
restart to apply.

| Flag | Env | Default | Purpose | Same-container | Split-container |
|---|---|---|---|---|---|
| `--root` | `HIVE_BOARD_ROOT` | walk up from cwd to the first dir containing `.opencode/` | workspace root (everything else derives from it) | set explicitly in the fragment (`/workspace`) | **mandatory** |
| `--host` | `HIVE_BOARD_HOST` | `0.0.0.0` | bind address | default is right (reachable via published port) | default |
| `--port` | `HIVE_BOARD_PORT` | `4400` | HTTP port (validated: integer 0–65535, fails fast otherwise) | default | default |
| `--db` | `HIVE_BOARD_OPENCODE_DB` | `~/.local/share/opencode/opencode.db` | opencode's SQLite session DB, read **read-only** (session back-fill + existence checks) | default is right (same filesystem) | **mandatory mount** (see below) |
| `--gui-url` | `HIVE_BOARD_GUI_URL` | `http://studio:3000` | web-GUI base for `?session=` deep links (pure link rendering, never fetched) | set if your GUI isn't at studio:3000 | same |
| `--opencode-url` | `HIVE_BOARD_OPENCODE_URL` | auto-discovery via `/proc/$OPENCODE_PID/cmdline`, else unset | opencode server for session creation (Start / fresh promote) | **set explicitly** — discovery does NOT work from an entrypoint sibling (see Reference) | **mandatory** |
| — | `HIVE_BOARD_OPENCODE_PASSWORD`, falls back to `OPENCODE_SERVER_PASSWORD` | unset | HTTP Basic password for the opencode server (username is literally `opencode`). Deliberately env-only — secrets don't belong in argv/`ps` output | present by construction (same env) | **mandatory** |
| `--board` | `HIVE_BOARD_BOARD_DIR` | `<root>/.opencode/board` | **fixtures/dev mode only.** Pointing this anywhere non-default disables ALL writes (`writesEnabled: false`): the transition module always writes the workspace board, so a fixture view must never mutate | never set in deployment | never set |

## Future path: the board as its own container (NOT the current setup)

The same-container choice is load-bearing: almost every knob above works by
default because the board shares opencode's filesystem and environment. If
the board is ever split into its own service, three couplings become explicit
— all three **mandatory**, no in-container fallbacks:

- [ ] **SQLite DB mount (read-only):** mount the opencode data dir
      (`~/.local/share/opencode/`) into the board container and point
      `HIVE_BOARD_OPENCODE_DB` at `opencode.db` inside it. `:ro` is correct —
      the board only ever reads it (per-bootstrap `bun:sqlite` readonly; WAL
      tolerates the concurrent writer).
- [ ] **Fixed opencode URL + password env:** `HIVE_BOARD_OPENCODE_URL` pointing
      at the opencode service (compose DNS name, not 127.0.0.1) and
      `OPENCODE_SERVER_PASSWORD` passed into the board's environment.
      `/proc`-based discovery is impossible across containers.
- [ ] **`/workspace` volume mounted RW:** the board reads all HIVE state from
      it AND writes work items through the locked storage module
      (`.opencode/board/` + `.locks/`). Same volume as opencode — the advisory
      lock only coordinates writers on a shared filesystem.

## Verification honesty

Verified from inside this container: Bun 1.3.14 running the board (typecheck +
54 tests + live serving), the respawn loop itself (killed the process, watched
it self-restart), all config knobs and precedence, the unconfigured-backend
degradation, and the `OPENCODE_PID` discovery behavior in both environments.
**Not verifiable from in here:** your actual Dockerfile, compose file, and
entrypoint — the fragments are written to copy-paste, with the two marked
edits yours to align.
