#!/usr/bin/env bun
/**
 * hive-board viewer — executable entry point (the package's `hive-board` bin).
 *
 * Deliberately a THIN shim. All logic lives in ./index.ts so that importing
 * the viewer programmatically never starts a server as a side effect, while
 * `bunx hive-board` / `npx hive-board` still just works.
 *
 * Requires Bun (Bun.serve, Bun.build, bun:sqlite) — hence the shebang. This is
 * NOT a limitation introduced by the viewer: the HIVE plugin itself already
 * requires a Bun host (src/index.ts reaches bun:sqlite via board-reconcile-db),
 * and opencode runs on Bun.
 *
 * Routes (see src/board-viewer/web/app.ts):
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
import { startBoardViewer } from "./index"

startBoardViewer()
