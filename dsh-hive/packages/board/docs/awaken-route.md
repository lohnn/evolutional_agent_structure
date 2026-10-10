# The awaken route — enablement + verification runbook (WI-064)

One page for the operator who composes `board` with `awaken: true`.
Everything here is verified behavior; nothing is predicted.

## What the route does (and does not do)

`POST /api/hive-board/awaken` — body JSON `{itemId?, preset?, hint?, firstMessage?}`.
Creates a REAL top-level dsh session (the browser "new chat" path:
`session/create` → `ctx.agents.create`), runs the deployment's `/awaken`
flip on it (registry + doctrine + turn-scoped summon), optionally plants a
first message (`session/prompt`, queue mode), then answers:

```json
{ "ok": true, "sessionId": "session-…", "preset": "standard",
  "item": {"id": "WI-…", "title": "…"},
  "awakened": {"commanded": true, "ok": true, "text": "…Board: registered work item WI-…"},
  "planted": {"requested": true, "ok": true} }
```

Failures are typed and actionable end-to-end (`gateway/arguments-invalid`,
`session/conflict`, `agent-preset/conflict`, `hvb-board/cross-origin`) and
never leave a half-created session silently.

Guards (all decided 2026-10, user-ratified):
- **Opt-in**: the route exists ONLY when the board plugin composes
  `awaken: true` (default false, never a silent default).
- **Origin**: browsers must match the exact same origin AND pass the
  connection trust fence (`connection.requestRejection` — the gateway's own
  upgrade check); curl/CLI flows without an Origin header pass
  unauthenticated, exactly like every other board route (contract §5, the
  ratified "mirror precedent" posture).

## Enablement (the resting profile lives at /root/.dsh/profiles/web)

1. Edit the profile patch `/root/.dsh/profiles/web/cordis.patch.yml` — find
   the board row inside the user `insert` list and give it a config (a patch
   row replaces the row's WHOLE config; the board row carries no other keys):

   ```yaml
       - id: board
         name: '@hive/dsh-board'
         config:
           awaken: true
   ```

2. Apply it. This profile sets `dsh.profile.patchReload: live`, so a patch
   edit hot-reloads the board row — usual `dsh` semantics apply. If the
   running host does not pick it up (or you are on an older host), bounce:
   touch the svcwatch definition to force a reload —
   `touch /workspace/.opencode/services/dsh-web.toml` — or restart the
   service the ordinary way. **A dsh-web restart tears down every session in
   the environment** (the coordinator planned restarts LAST for exactly that
   reason), so do this outside a working session.

3. Confirm the host DID re-compose with the flag: the boot/svcwatch log
   (`/run/svc/logs/dsh-web.log`) gains the line

   `[board] awaken route registered at /api/hive-board/awaken (POST; opt-in awaken config)`

   (plugin INFO logs are captured there by svcwatch, not by the dsh stdout
   tee, which only carries the launch URL).

## Verification checklist (post-enablement, in order)

1. `curl -s -X POST http://127.0.0.1:4501/api/hive-board/awaken -H 'content-type: application/json' -d '{"hint":"enablement probe — one-line ack then stop"}'`
   → HTTP 200, `ok: true`, a fresh `sessionId`, `awakened.ok: true`
   (the flip auto-registers a session-first work item named by the hint).
2. Origin guard, foreign browser origin → typed 403, no session:
   `curl -s -i -X POST http://127.0.0.1:3080/api/hive-board/awaken -H 'origin: https://evil.example' -H 'content-type: application/json' -d '{}'`
   → 403 `hvb-board/cross-origin`.
3. Origin guard, no-origin through the relay still works:
   `curl -s -X POST http://127.0.0.1:3080/api/hive-board/awaken -H 'content-type: application/json' -d '{"hint":"relay probe"}'`
   → 200.
4. Browser: open a board item WITHOUT a connected session → the drawer shows
   "awaken a new session" with the Awaken ⚑ button; click it once — in-flight
   note, then `created` + the flip outcome; the new session appears in the
   sidebar list; Open ⇢ switches the main panel to it (when the uiWorkspace
   flow is composed — it is, on the web profile).
5. Ledger/board reality: the new session id appears in
   `/workspace/.opencode/agents/hive-sessions.json` and the auto-registered
   WI item on `/workspace/.opencode/board/`.

## Rollback

- Route: remove the `config: { awaken: true }` block from the board row in
  the profile patch (restores default-off; hot-reload or bounce applies it).
  The coil of code ships inert on main — nothing registers by default.
- State: auto-registered session-first work items from probe awakens are
  tombstoned/re-titled with `hive_board_respec`/`hive_board_retitle`;
  probing sessions can be removed like any session (workspace archive or
  host-side disposal).
