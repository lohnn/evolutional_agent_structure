/**
 * Bundles the browser client (client.ts → morph.ts, render.ts and their pure
 * transitive deps) into a single ES module string, once, at server startup.
 *
 * Kept in-memory (no dist/ artifact, matching the app's no-build-step ethos —
 * W-026): Bun bundles TS transparently. render.ts is deliberately browser-safe
 * (its only runtime imports are thresholds.ts + lineage.ts — no node:fs, no
 * board-store), so this bundle contains no server-only code.
 *
 * The server's build SHA is STAMPED into the bundle at build time via a Bun
 * `define` replacement (`__BOARD_BUILD_SHA__`). The emitted /client.js therefore
 * carries the exact SHA it was built against — the client compares that baked-in
 * value against the server SHA in each /api/state poll to detect a stale tab
 * (old bundle vs freshly-restarted server). W-061: staleness is caught by an
 * explicit deterministic comparison, never assumed to self-heal.
 *
 * If the bundle ever fails to build (e.g. a non-browser-safe import leaks into
 * the render path), we surface it loudly rather than silently shipping a broken
 * page: the /client.js route serves a console.error stub and the server logs.
 */
import * as path from "node:path"

export interface ClientBundle {
  js: string
  ok: boolean
  error?: string
}

// Cache keyed by the SHA it was built with, so a changed SHA forces a rebuild
// rather than serving a stale-stamped bundle (defensive — SHA is resolved once
// at startup in practice).
let cached: { sha: string; bundle: ClientBundle } | null = null

export async function buildClientBundle(buildSha: string): Promise<ClientBundle> {
  if (cached && cached.sha === buildSha) return cached.bundle
  const entry = path.join(import.meta.dir, "client.ts")
  try {
    const result = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      minify: true,
      format: "esm",
      define: {
        // Baked-in build identity: the SHA this client.js was compiled against.
        __BOARD_BUILD_SHA__: JSON.stringify(buildSha),
      },
    })
    if (!result.success || result.outputs.length === 0) {
      const msg = result.logs.map((l) => String(l)).join("; ") || "no outputs"
      const bundle = { js: stub(msg), ok: false, error: msg }
      cached = { sha: buildSha, bundle }
      return bundle
    }
    const js = await result.outputs[0]!.text()
    const bundle = { js, ok: true }
    cached = { sha: buildSha, bundle }
    return bundle
  } catch (err) {
    const msg = String(err)
    const bundle = { js: stub(msg), ok: false, error: msg }
    cached = { sha: buildSha, bundle }
    return bundle
  }
}

function stub(msg: string): string {
  return `console.error(${JSON.stringify("[hive-board] client bundle failed to build: " + msg)});`
}
