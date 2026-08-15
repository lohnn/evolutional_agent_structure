# svcwatch — declarative process supervision

> **What this is:** a generic, stdlib-only Python 3 process supervisor for the
> dev container. Adding a long-lived service (a relay, a bot, a watcher) =
> dropping ONE TOML file into `/workspace/.opencode/services/`. No entrypoint or
> image changes ever again.
>
> **Who this is for:** hive-infra, and anyone adding a background service to the
> container. Infrastructure, not application code.

## Why it exists (the two constraints that shaped it)

1. **PID 1 is `docker-init` (tini).** It reaps zombies but never respawns.
   There is no systemd, cron, supervisord, s6, or pm2. Something has to own the
   respawn loop — svcwatch does it generically instead of each service
   hand-rolling one.
2. **opencode sweeps its spawned-children tree on shutdown (SHADOW-024).**
   Anything launched from an agent Bash tool DIES on opencode restart, even with
   `setsid --fork`. The only escape is reparenting to **PID 1's subtree** — so
   svcwatch is spawned from `/entrypoint.sh`, never from an agent shell.

svcwatch generalizes the hand-rolled `while true; do … ; sleep 2; done` respawn
loop the entrypoint already used for hive-board.

## The one-time setup (the ONLY container touch)

The watcher must be born in PID 1's subtree. Paste this block into
`/entrypoint.sh` **after** the `opencode serve` line, **before** the final
`exec openchamber serve …`. It is a respawn loop for the watcher itself (same
self-heal pattern hive-board uses):

```sh
# ── svcwatch ── declarative process supervision (PID 1 subtree) ──────────────
SVCDIR=/workspace/.opencode/services
SVCWATCH=/workspace/projects/evolutional_agent_structure/src/svcwatch/svcwatch.py
SVCLOG=/var/log/svcwatch.log
mkdir -p "$SVCDIR"
(
  while true; do
    setsid --fork python3 "$SVCWATCH" --dir "$SVCDIR" >> "$SVCLOG" 2>&1
    echo "[entrypoint] svcwatch exited (code $?) — respawning in 2s" >> "$SVCLOG"
    sleep 2
  done
) &
# ── end svcwatch ─────────────────────────────────────────────────────────────
```

Then **restart the container**. That is the entire install. From then on, no
entrypoint change is ever needed to add/remove a service.

> Applying this block and restarting the container is the **user's reviewed
> step** — it is the one irreversible-ish container touch and is deliberately
> NOT done by the agent.

## Adding a service

Drop `<name>.toml` into `/workspace/.opencode/services/`. The filename must
equal the `name` inside. svcwatch scans every ~2s: new file → start, deleted →
graceful stop (SIGTERM, 5s, SIGKILL), changed mtime → restart that service.

### Schema (contract — svcwatch is the owner)

```toml
name = "matrix-relay"                # required, unique, [a-z0-9-]+ ; == filename
command = ["node", "dist/relay.js"]  # required, argv array — NO shell
cwd = "/workspace/scratch/matrix-bridge"  # optional (default /)
env_file = "/path/to/.env"           # optional, PREFERRED for secrets (path-ref, never inline)
# env = { KEY = "val" }              # optional, merged over env_file
restart = "always"                   # always | on-failure | never (default always)
restart_delay_sec = 2                # initial backoff (default 2)
backoff_max_sec = 60                 # exponential cap (default 60)
start_grace_sec = 10                 # exit within grace => crash-loop (default 10)
# liveness_cmd = ["curl","-sf","http://127.0.0.1:PORT/health"]  # optional, positive-signal only
# liveness_interval_sec = 60
# liveness_failures = 3
```

Validated: `name` matches `[a-z0-9-]+` and the filename; `command` is a
non-empty string array; `restart` is one of the three policies; the numeric
fields are range-checked. A bad TOML logs a `CONFIG ERROR` and is surfaced in
`status.json` under `config_errors` — it never kills the watcher or other
services.

## Semantics (deliberately minimal)

- **Spawn:** each service is `fork`+`execvp`'d in its **own session**
  (`setsid`), so a service's whole process group dies with it. Signals go to the
  process group.
- **Restart:** `waitpid` reaps; on exit the policy decides. Exponential backoff
  from `restart_delay_sec`, doubling to `backoff_max_sec`. A service that exits
  **inside `start_grace_sec`** is a crash-loop → marked `degraded`, keeps
  retrying, never silently gives up. A healthy run (uptime ≥ grace) resets
  backoff to the initial delay.
- **Crash detection is `waitpid` ONLY — never silence/inactivity-based.** A
  healthy process once stalled 7h49m (SHADOW-033); a quiet process is not a dead
  one. Liveness probes are **opt-in**, require a **positive failure signal**
  (`liveness_cmd` exit ≠ 0), `liveness_failures` consecutive failures, then
  **ONE** restart + re-enter grace. No death-loops.
- **State:** atomic-written `/run/svc/status.json` (tmp + `os.replace`).
- **Logs:** per-service at `/run/svc/logs/<name>.log`, size-rotated at 1 MiB to
  `<name>.log.1` (one generation). The watcher's own `/var/log/svcwatch.log`
  rotates the same way.
- **Single watcher:** a `flock` on `/run/svc/control.lock` makes a second
  instance exit rather than double-supervise.

## Operating it: `svcwatchctl`

`src/svcwatch/svcwatchctl` is on PATH via the entrypoint (or call it directly).
It is a **dashboard**, not a raw dump:

```
svcwatchctl list                 # NAME STATE PID RESTARTS EXIT UPTIME
svcwatchctl status               # raw status.json
svcwatchctl start|stop|restart <name>   # via the control FIFO
svcwatchctl tail <name>          # tail -f the service log
```

## What svcwatch deliberately does NOT do

- **No port policy.** Health-endpoint port allocation stays governed by
  `docs/LOCAL-PORTS.md`. svcwatch never binds, checks, or enforces ports.
- **No shell.** Every command is an argv array; `execvp` only. `env_file` is a
  minimal `KEY=VALUE` parser, not a sourced shell file.
- **No dependency ordering / readiness gates.** Services are independent; there
  is no `after=`/`requires=`. Keep it that way.

## Examples

- `src/svcwatch/examples/matrix-relay.toml` — the Matrix relay (chat-bridge
  owns the real one). Note it **omits `env_file`**: the relay reads credentials
  from disk at call time (chmod-600 files), keeping them out of the
  world-readable process env.
- `src/svcwatch/examples/hive-board.toml` — the OPTIONAL future migration of
  hive-board off its hard-coded entrypoint loop. When that happens, delete the
  hand-rolled hive-board block from `/entrypoint.sh` so only one supervisor owns
  the viewer.

## Files

| Path | What |
|---|---|
| `src/svcwatch/svcwatch.py` | the watcher (~590 lines, stdlib-only) |
| `src/svcwatch/svcwatchctl` | dashboard + control shim |
| `src/svcwatch/examples/*.toml` | example service definitions |
| `/workspace/.opencode/services/*.toml` | live service definitions (versioned) |
| `/run/svc/status.json` | live status (runtime, never tracked) |
| `/run/svc/logs/<name>.log` | per-service logs (runtime) |
| `/run/svc/control.fifo` | control channel (runtime) |
| `/var/log/svcwatch.log` | the watcher's own log (runtime) |
