/**
 * hive-board viewer — the package's PROGRAMMATIC entry point.
 *
 * This is what `evolutional-agent-structure/board-viewer` resolves to. It is
 * deliberately SIDE-EFFECT FREE on import: importing it starts nothing, binds
 * no port and reads no state. Call `startBoardViewer()` to actually serve.
 * (`src/board-viewer/server.ts` is the executable `bin` shim that does exactly
 * that, and nothing else.)
 *
 * The exported surface here is an intentional, narrow contract (I-178) — four
 * names, each with a reason to exist, never a wildcard re-export of the whole
 * viewer:
 *
 *   startBoardViewer   launch it (the `bin` and any embedder use this)
 *   resolveConfig      resolve/override config without launching (tests, wrappers)
 *   createApp          the bare fetch handler, to mount inside another server
 *   computeSessionMirror  the one-time bootstrap snapshot, for callers that
 *                      want the mirror without an HTTP surface at all
 *
 * NOTE — this module is SERVER-side. It transitively reaches node:fs and
 * bun:sqlite and must never be pulled into the browser bundle (see
 * web/client-bundle.ts and the browser-purity boundary it guards).
 */
import { httpSessionClient } from "../lib/board-transitions"
import { resolveConfig, warnIfExposed, type BoardConfig } from "./config"
import { computeSessionMirror } from "./data/sessions"
import { createApp } from "./web/app"

export { resolveConfig, createApp, computeSessionMirror }
export type { BoardConfig }

export interface BoardViewerHandle {
  /** The resolved config the server actually started with. */
  config: BoardConfig
  /**
   * The port actually bound (differs from config.port when port 0 was
   * requested). `undefined` only in Bun's unix-socket mode, which this
   * viewer never uses.
   */
  port: number | undefined
  /** Shut the listener down. */
  stop(): void
}

/**
 * Resolve config, build the one-time session mirror, and serve.
 *
 * Binds `config.hostname`, which defaults to LOOPBACK — see config.ts for why
 * that default is not negotiable in a published package. A non-loopback bind
 * is supported but prints a loud warning naming what it exposes.
 */
export function startBoardViewer(argv: string[] = process.argv.slice(2)): BoardViewerHandle {
  const config = resolveConfig(argv)

  warnIfExposed(config.hostname, config.port)

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

  return {
    config,
    port: server.port,
    stop: () => void server.stop(),
  }
}
