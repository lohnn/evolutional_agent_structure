/**
 * Bundles the browser client (client.ts → morph.ts, render.ts and their pure
 * transitive deps) into a single ES module string, once, at server startup.
 *
 * Kept in-memory (no dist/ artifact, matching the app's no-build-step ethos —
 * W-026): Bun bundles TS transparently. render.ts is deliberately browser-safe
 * (its only runtime imports are thresholds.ts + lineage.ts — no node:fs, no
 * board-store), so this bundle contains no server-only code.
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

let cached: ClientBundle | null = null

export async function buildClientBundle(): Promise<ClientBundle> {
  if (cached) return cached
  const entry = path.join(import.meta.dir, "client.ts")
  try {
    const result = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      minify: true,
      format: "esm",
    })
    if (!result.success || result.outputs.length === 0) {
      const msg = result.logs.map((l) => String(l)).join("; ") || "no outputs"
      cached = { js: stub(msg), ok: false, error: msg }
      return cached
    }
    const js = await result.outputs[0]!.text()
    cached = { js, ok: true }
    return cached
  } catch (err) {
    const msg = String(err)
    cached = { js: stub(msg), ok: false, error: msg }
    return cached
  }
}

function stub(msg: string): string {
  return `console.error(${JSON.stringify("[hive-board] client bundle failed to build: " + msg)});`
}
