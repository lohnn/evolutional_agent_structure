# dsh-hive-relay

Transparent HTTP(+WebSocket) proxy for **dsh web** with a boot-URL sidecar —
the piece that lets a new browser open a logged-in dsh GUI from any tailnet
device with `https://<your-tailnet-name>/_/boot-url`, no `docker exec` into
the container for a boot-log token.

| Path | Behavior |
|---|---|
| everything else | Proxied to dsh web untouched: `Host` forwarded verbatim (dsh's `/api` browser-trust fence and its Host-derived cookie authority read the browser-visible host), request/response bodies stream, HTTP upgrades (the GUI's WebSocket live stream `/api/remote.mux`) are raw socket tunnels. |
| `GET /_/boot-url` | **302** to the current boot's `?token=` URL rewritten onto your public origin — one click opens a logged-in GUI. `?format=json` returns `{"url": "…"}` for scripts. |
| `GET /_/healthz` | `200 ok` liveness (for the svcwatch probe); never touches the boot log. |

Zero dependencies. CommonJS single file (`relay.js`), Node 22.

## Why it exists (the token contract it is honest about)

dsh web prints its launch URL (`?token=…`) once per boot. Verified live
against dsh@0.2.1-rc.2 (full evidence: `docs/token-consumption.md`):

- The token is a **per-process random constant**; redemption is stateless and
  **not consumed** — the same URL works repeatedly, for many browsers, and
  stays valid for the whole boot. (An earlier record called the exchange
  "single-use"; it is not, on this corridor.)
- A tokened URL **expires with the boot**: a dsh web restart prints a fresh
  token and the old URL 401s. The relay re-reads the boot log on every
  request, so it always serves the current boot.
- Cookied browsers never need a token; the 30-day authority cookie survives
  restarts (durable signing secret).

## Install on a kit machine (svcwatch machine)

The relay is **not a dsh plugin** — do not expect it in the profile cohort.
Run it as a service:

1. `pnpm install` in `dsh-hive/` is only needed to run this package's tests on
   dev machines; the service itself needs only `node` and the example TOML.
2. Copy `dsh-hive-dist/dsh-hive-relay.toml` into the target machine's
   `<workspace-root>/.opencode/services/` (same place as its sibling
   `dsh-hive-web.toml`).
3. Fill the machine-local values in the env line (workspace paths, your
   tailnet origin, ports) — the file documents each one right at the value.
   Nothing machine-specific is hardcoded in this package.
4. `svcwatch` hot-loads it. `curl /_/healthz` must answer `ok`, and — see the
   bind rule below — that check must come from a **non-loopback** address.

## The four safety rules this package ships with (and verifies)

1. **Single-argv command under svcwatch.** The example TOML wraps the node
   invocation in `bash -c` only to expand the script path (svcwatch argv has
   no env expansion) — the service stays one killable process group with no
   pipeline children, so a restart can never strand a sibling holding the
   port (a stranded-sibling orphan trap).
2. **Liveness probe on `/_/healthz`.** The example wires the svcwatch probe
   to it (3 failures → one restart). Positive-signal liveness only.
3. **Verify the real bind with a non-loopback curl.** `0.0.0.0` is required:
   Docker forwards a published port to the container's interface, not its
   loopback — a `127.0.0.1` bind inside the container is *silently*
   unreachable from the host even though loopback curls answer. Check from
   the container's eth0 address, not just `127.0.0.1`.
4. **No token values anywhere in logs.** The relay's own lines are method +
   pathname only — the query string that carries the token is never logged,
   and the redirect Location value is never logged. The token lives only in
   the dsh boot log itself (`tee`'d dsh stdout) and inside the browser's
   cookie mint.

Security posture of `/_/boot-url`: it hands the boot token to anyone who can
reach the relay port. That is the approved posture this fix was designed for
(single host / tailnet-trusted; a token readable by anything on the tailnet
is acceptable) — do not republish the relay port anywhere wider than that
without a fresh user decision.

## Development

```sh
pnpm --filter dsh-hive-relay test   # node --test: spawns relay + stub upstream
```

The tests cover: healthz, 302/JSON boot-url rewriting, last-line-wins
log re-reads (a restarted dsh web), 503 with no boot log, 405 on wrong
methods, Host-verbatim proxying, and the no-token-in-log discipline.

Provenance: authored as a workspace-local single-file service and adopted
into this monorepo (byte-compared at adoption, no behavior changes) as the
kit-distribution vehicle for other machines.
