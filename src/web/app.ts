/**
 * The HTTP app — extracted from server.ts so tests can drive it without a
 * listening socket. GET routes render read-only state (re-read from disk per
 * request); POST /transitions/* is the sanctioned write path (Q6 option c).
 *
 * `sessionClient` is hive-infra's BoardSessionClient seam (httpSessionClient
 * in production, a fake in tests, null when unconfigured — Start/fresh-promote
 * degrade gracefully; reattach never needs it).
 */
import { boardDir } from "evolutional-agent-structure/lib/board-store"
import type { BoardSessionClient } from "evolutional-agent-structure/lib/board-transitions"
import type { BoardConfig } from "../config"
import type { SessionMirror } from "../data/sessions"
import { loadBoardState } from "../data/state"
import { buildClientBundle } from "./client-bundle"
import { listNotices } from "./notices"
import { renderPage } from "./render"
import { handleTransitionRoute } from "./transitions"

export function createApp(
  config: BoardConfig,
  sessionMirror: SessionMirror,
  sessionClient: BoardSessionClient | null = null,
) {
  const writesEnabled = config.boardDir === boardDir(config.workspaceRoot)
  const backend = sessionClient ? ("configured" as const) : ("unconfigured" as const)

  return async function fetchHandler(req: Request): Promise<Response> {
    const url = new URL(req.url)
    try {
      const transitionResponse = await handleTransitionRoute(
        url.pathname,
        req,
        config,
        writesEnabled,
        sessionClient,
      )
      if (transitionResponse) return transitionResponse

      switch (url.pathname) {
        case "/":
          return new Response(renderPage(loadBoardState(config, sessionMirror, backend), listNotices()), {
            headers: { "content-type": "text/html; charset=utf-8" },
          })
        case "/api/state":
          return Response.json(loadBoardState(config, sessionMirror, backend))
        case "/client.js": {
          // Browser client that powers the diff-based live refresh (replaces
          // the old meta-refresh). Bundled once at first request, then cached.
          const bundle = await buildClientBundle(config.buildSha)
          return new Response(bundle.js, {
            status: bundle.ok ? 200 : 500,
            headers: {
              "content-type": "text/javascript; charset=utf-8",
              "cache-control": "no-cache",
            },
          })
        }
        case "/healthz":
          return new Response("ok")
        default:
          return new Response("not found", { status: 404 })
      }
    } catch (err) {
      console.error("[hive-board] request error:", err)
      return new Response("hive-board internal error: " + String(err), { status: 500 })
    }
  }
}
