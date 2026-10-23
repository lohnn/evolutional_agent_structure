# Token consumption semantics — evidence for the boot-URL sidecar

Scope: `dsh web` as deployed here, **dsh@0.2.1-rc.2** (corridor pin of
2026-10-19). Recorded 2026-10-23 while verifying the relay. Recordings are
version-scoped: if a future dsh version disagrees, re-verify live and update
this file and relay.js's header comment.

## What the dispatch asked to confirm

> Before building, confirm the token consumption semantics live: an earlier
> record claimed a single-use exchange — verify what a second redemption on
> the same boot actually does, so the sidecar's contract is honest.

## Method (two layers, same running version)

1. **Installed-code read** of `@deepseek-ai/dsh-client-connection@0.2.1-rc.2`
   and `@deepseek-ai/dsh-web-app@0.2.1-rc.2` (pnpm store, read-only) —
   `authorizeIndex`, `authorizeConnect`, `processLaunchToken`,
   `isTrustedApiRequest`, the CLI flag surface.
2. **Live instance** of the exact same version (same argv as production, minus
   `--trusted-host` in run 1, with it in runs 2–4): isolated `DSH_HOME`
   (`/tmp/dsh-lab/home` — its durable signing secret and every minted cookie
   belonged only to the lab and were destroyed after testing), empty cwd,
   port 4502, stdout teed to a lab boot log. Production was never touched.

## Verified semantics (both layers agree)

| The question | The verified answer |
|---|---|
| What is the launch token? | `base64url(randomBytes(32))` — 43 chars — generated lazily per **process** and held in a WeakMap keyed by the root context. Never persisted to disk, never in `.credentials.yaml`. |
| Does redemption consume it? | **No.** `GET /?token=<matching>` → `303 Location: ./` + fresh `Set-Cookie`, stateless `timingSafeEqual` against the process constant. A second redemption on the same boot returns **identical 303 + fresh cookie**. Any number of redemptions, browsers, tabs: all succeed. An earlier record's "SINGLE-USE exchange" claim is factually wrong for 0.2.1-rc.2 (its other consequences still hold — see below). |
| Does a second redemption invalidate the first cookie? | No authentication-relevant state changes on redemption; each minted cookie stands until its own expiry/invalidity. A session cookie remains valid while redemptions multiply. |
| Cookie facts | Name `dsh-auth-<base64url(sha256(authority))>`; **authority = browser-visible Host** (port-stripped; derived from the request's `Host` header, not the listener config); payload v1 `{authority, issuedAt, expiresAt}` HMAC-SHA256-signed by a durable per-home secret in `<home>/.credentials.yaml`; attributes `Max-Age=2592000; Path=/; Expires=…; HttpOnly; SameSite=Strict` (+`Secure` only when the dsh listener itself serves TLS — ours does not, Tailscale Serve terminates TLS one hop out). |
| Does the cookie survive a restart? | Yes — the signing secret is durable, so cookied browsers keep working across dsh web restarts (the earlier record was right on this). |
| When does a tokened URL stop working? | When the process dies. A new boot generates a new token; the old URL 401s (`dsh web authentication required; reopen the URL printed by dsh web.`). |
| Unauthenticated requests | `401` on `/`, `401` on `/api/*`. |
| `/api` browser-trust fence | Host must be loopback, the bind address, or a `--trusted-host` authority — else `403` even with a wrong token present. `Origin`, when present, must match Host; `sec-fetch-site: cross-site` rejected. |

## What this means for the sidecar (implemented in relay.js)

- Serving the boot URL is **safe to reuse within the boot** — it is not a
  burning match; a user can click it later, share it to another tailnet
  device, refresh it. The relay re-reads the boot log per request, so it
  always reflects the current boot.
- After a dsh web restart the sidecar's answer changes by itself (new log
  line). Verified live: restart lab instance, sidecar immediately served the
  new token, the old URL turned 401.
- No caching anywhere; `no-store` on both `/_/` endpoints.

## Design note: a durable-token flag (future idea)

Because redemption is stateless and the token is merely per-process random,
a `--launch-token <secret>` override (durable token = stable boot-to-boot)
would make a bookmarked `?token=` URL mint cookies **indefinitely** with no
new server state — the risk-inverting move is that a static token's leak stops
being boot-scoped. That trade (plus who should set it) is the design question
for a future feature, not "is it implementable" — it is a flag read + a
token substitution in `BrowserAuth`.

## Log discipline during the live exercise

The relay's own log was grepped after the full exercise (`redemptions`, GUI
index + asset fetches, WS handshakes, restart rotation): **zero** `token=`
occurrences. Lines carry method + pathname only. One sandbox cookie value was
printed once into a session transcript by an over-clipped `sed` — sandbox-only
material from the lab `DSH_HOME`, deleted with it; production values were
never printed, logged, or stored outside `/tmp/dsh-web.log`'s own text.
