/**
 * hive-board viewer — Bun.serve entry point.
 *
 * Routes (see src/web/app.ts):
 *   GET  /                        server-rendered HTML dashboard
 *   GET  /api/state               the same BoardState as JSON
 *   GET  /healthz                 liveness probe
 *   POST /transitions/*           board-side write path (owner's module only)
 *
 * Read state is re-read from disk on every request — no cache, no watchers.
 * Statelessness guarantees the board never renders stale ground truth
 * (the W-030 failure mode) and treats vanished WI files (Q15 absorption) as
 * ordinary re-lists.
 */
import { httpSessionClient } from "evolutional-agent-structure/lib/board-transitions"
import { resolveConfig } from "./config"
import { computeSessionMirror } from "./data/sessions"
import { createApp } from "./web/app"

const config = resolveConfig()

// Session client (Start / fresh-promote — Q14: raw HTTP, Basic auth, username
// literally "opencode"). Unconfigured ⇒ null: session-creating affordances
// disable gracefully; reattach + file-only transitions still work.
const sessionClient =
  config.opencodeUrl && config.opencodePassword
    ? httpSessionClient({
        baseUrl: config.opencodeUrl,
        password: config.opencodePassword,
        directory: config.workspaceRoot,
      })
    : null
console.log(
  sessionClient
    ? `[hive-board] session backend: ${config.opencodeUrl}`
    : "[hive-board] session backend: NOT configured (Start disabled; set --opencode-url / OPENCODE_SERVER_PASSWORD)",
)

// Phase-1.5 back-fill: one-time bootstrap snapshot (DESIGN §6.a — bootstrap
// enumeration only, no steady-state loop). Restart the viewer to recompute.
const sessionMirror = computeSessionMirror(config)
if (sessionMirror.available) {
  console.log(
    `[hive-board] session back-fill: ${sessionMirror.cards.length} in-progress cards ` +
      `(${sessionMirror.awakeIds} awake ids, ${sessionMirror.awakeDeleted} deleted/placeholder, ` +
      `${sessionMirror.totalPersisted} persisted sessions in this workspace)`,
  )
} else {
  console.warn(`[hive-board] session back-fill unavailable: ${sessionMirror.error}`)
}

const server = Bun.serve({
  hostname: config.hostname,
  port: config.port,
  fetch: createApp(config, sessionMirror, sessionClient),
})

console.log(`[hive-board] viewer serving http://${config.hostname}:${server.port}`)
console.log(`[hive-board] workspace root: ${config.workspaceRoot} (board: ${config.boardDir})`)
