/**
 * ENTRYPOINT ISOLATION GUARD
 *
 * The board viewer now lives inside the plugin package (src/board-viewer/).
 * The plugin entrypoint (src/index.ts) must NOT reach it.
 *
 * Why this needs to be a live check and not a comment (I-246): the coupling
 * this prevents is INVISIBLE until it hits someone else's machine. src/index.ts
 * is loaded by opencode on every session, in every project. If a viewer import
 * ever leaks into that graph, opencode starts paying for — and can fail on —
 * `Bun.serve`, the DOM-targeted browser bundler, happy-dom-adjacent code and
 * the whole HTTP surface, at plugin-load time. Nothing in a normal dev loop
 * surfaces that: `tsc` stays green, `bun test` stays green, and the viewer
 * still works. Only a real guard bites.
 *
 * ── A correction worth recording ──────────────────────────────────────────
 * The original framing of this guard was "src/index.ts must not transitively
 * import bun:sqlite, because that breaks the plugin on non-Bun hosts."
 * That premise was already false before the merge: src/index.ts imports
 * ./lib/board-reconcile-db.js, which imports `bun:sqlite`. The plugin has
 * required a Bun host for some time. Absorbing the viewer did not introduce
 * that, and this guard must not pretend to defend an invariant the codebase
 * does not actually hold — a guard that asserts a false premise is worse than
 * none, because it manufactures confidence.
 *
 * So the guard asserts what is TRUE and worth keeping:
 *   1. src/index.ts's static import graph never reaches src/board-viewer/.
 *   2. It never reaches viewer-only runtime surface (Bun.serve / Bun.build).
 *   3. The bun-only module set reachable from the entrypoint is PINNED, so
 *      the pre-existing bun:sqlite dependency stays visible and deliberate
 *      instead of quietly growing.
 */
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import { buildClientBundle } from "../src/board-viewer/web/client-bundle"

const PACKAGE_ROOT = path.resolve(import.meta.dir, "..")
const SRC = path.join(PACKAGE_ROOT, "src")

/** Every relative/bare specifier in a module, ignoring line comments. */
function importsOf(file: string): string[] {
  const code = fs.readFileSync(file, "utf8")
  const specs: string[] = []
  // static `from "x"`, side-effect `import "x"`, and dynamic/type `import("x")`
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']/g,
  ]
  for (const re of patterns) {
    for (const m of code.matchAll(re)) specs.push(m[1]!)
  }
  return specs
}

/** Resolve a relative specifier to a real file on disk (.ts / .js / index). */
function resolveLocal(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null
  const base = path.resolve(path.dirname(fromFile), spec)
  const candidates = [
    base,
    base.replace(/\.js$/, ".ts"),
    `${base}.ts`,
    path.join(base, "index.ts"),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  return null
}

/** Transitive static import graph rooted at `entry`, local files only. */
function importGraph(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>()
  const bare = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    for (const spec of importsOf(file)) {
      const local = resolveLocal(file, spec)
      if (local) queue.push(local)
      else if (!spec.startsWith(".")) bare.add(spec)
    }
  }
  return { files, bare }
}

const entry = path.join(SRC, "index.ts")
const graph = importGraph(entry)
const rel = (f: string) => path.relative(PACKAGE_ROOT, f)

describe("plugin entrypoint isolation", () => {
  test("the guard is actually traversing a real graph (not vacuously passing)", () => {
    // If resolution silently broke, every assertion below would pass on an
    // empty set. Pin the graph as non-trivial and containing known members.
    expect(graph.files.size).toBeGreaterThan(5)
    const names = [...graph.files].map(rel)
    expect(names).toContain("src/index.ts")
    expect(names).toContain("src/tools.ts")
    expect(names).toContain("src/lib/board-store.ts")
  })

  test("src/index.ts never transitively imports src/board-viewer/", () => {
    const leaked = [...graph.files].filter((f) => f.startsWith(path.join(SRC, "board-viewer")))
    expect(leaked.map(rel)).toEqual([])
  })

  test("no viewer-only runtime surface reachable from the entrypoint", () => {
    // Bun.serve / Bun.build are the viewer's; the plugin must never boot them.
    const offenders: string[] = []
    for (const f of graph.files) {
      const code = fs.readFileSync(f, "utf8")
      if (/\bBun\s*\.\s*(serve|build)\s*\(/.test(code)) offenders.push(rel(f))
    }
    expect(offenders).toEqual([])
  })

  test("bun-only modules reachable from the entrypoint are pinned", () => {
    // NOT "there are none" — there is one, and it predates the viewer merge.
    // Pinning it keeps the Bun-host requirement visible and deliberate; this
    // test fails if a NEW bun:* dependency sneaks into the plugin entrypoint.
    const bunOnly = [...graph.bare].filter((s) => s.startsWith("bun:")).sort()
    expect(bunOnly).toEqual(["bun:sqlite"])
  })
})

describe("write authority (I-148 / I-179)", () => {
  // Until now, "the viewer never writes item files with its own logic" was
  // enforced by PACKAGING: hive-board was a separate npm package, so every
  // write had to come back through `evolutional-agent-structure/lib/*` — a
  // visibly foreign import that no one could add by accident.
  //
  // Absorbing the viewer dissolves that boundary. `../../lib/board-store` now
  // looks exactly as local as `./data/workitems`, and nothing stops a future
  // edit from just calling fs.writeFileSync on a WI file directly — producing
  // the second writer to one locked store that I-148/I-179 exist to forbid.
  //
  // Per I-048 that separation should never have depended on packaging in the
  // first place. So this is the replacement: a real check, not a convention.
  // The invariant is currently TRUE — the viewer performs zero direct fs
  // writes, routing everything through the owner's transition/store modules.
  //
  // If board-viewer ever legitimately needs to write something, this test
  // fails and forces the conversation about write authority rather than
  // letting a second writer appear silently. That failure is the feature.
  const WRITE_APIS =
    /\b(writeFileSync|appendFileSync|renameSync|unlinkSync|rmSync|rmdirSync|mkdirSync|truncateSync|copyFileSync|createWriteStream|openSync)\b|\bfs\.promises\b|\bBun\.write\b/

  function viewerFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) return viewerFiles(p)
      return e.isFile() && p.endsWith(".ts") ? [p] : []
    })
  }

  const files = viewerFiles(path.join(SRC, "board-viewer"))

  test("the scan sees a real viewer tree", () => {
    expect(files.length).toBeGreaterThan(15)
  })

  test("no file under src/board-viewer/ calls an fs write API directly", () => {
    const writers = files.filter((f) => WRITE_APIS.test(fs.readFileSync(f, "utf8"))).map(rel)
    expect(writers).toEqual([])
  })
})

describe("browser-bundle purity (I-192)", () => {
  // web/render.ts and web/client.ts are compiled FOR THE BROWSER and must
  // never reach anything touching node:fs — the same shape as the bun:sqlite
  // hazard, one level down. The merge rewrote render.ts's cross-package
  // imports into relative ones, which is exactly the edit that could quietly
  // drag board-store into the browser graph.
  //
  // This asserts against the REAL BUNDLER, not a static import scan. That
  // matters: render.ts legitimately references a board-transitions type via
  // an inline `import("...")` in TYPE POSITION, which TypeScript and Bun both
  // erase. A static scan flags that as a violation and is simply wrong — it
  // would have failed this very merge for a non-problem. The emitted bundle
  // is the only honest oracle for "what actually ships to the browser".
  //
  // Verified to bite (2026-08-03): making render.ts's renderBoardBody — which
  // client.ts genuinely calls — invoke board-store's readItem fails the bundle
  // build, and this test catches it. Note the deliberate semantics: an import
  // that is tree-shaken out does NOT fail, because it does not ship. The guard
  // asserts what reaches the browser, not what someone typed.
  //
  // SCOPE NOTE (WI-068): the browser-reachable set is no longer confined to
  // src/board-viewer/. `src/lib/board-recency.ts` is now compiled into this
  // bundle via render.ts — the FIRST file under src/lib/ to ship to the
  // browser, in a directory where node:/bun: surface is otherwise normal
  // (board-store, board-reconcile-db). It carries a matching banner naming the
  // constraint; this note is the other half, so the two ends of an invariant
  // enforced HERE and violated THERE both point at each other.
  test("the browser bundle builds", async () => {
    const bundle = await buildClientBundle("guard-test")
    expect(bundle.error ?? null).toBeNull()
    expect(bundle.ok).toBe(true)
    // Non-trivial output — guards against a vacuous pass on an empty bundle.
    expect(bundle.js.length).toBeGreaterThan(1000)
  })

  test("the emitted browser bundle contains no server-only surface", async () => {
    const { js } = await buildClientBundle("guard-test")
    const forbidden: Array<[string, RegExp]> = [
      ["node: builtin", /["']node:[a-z_]+["']/],
      ["bun: builtin", /["']bun:[a-z_]+["']/],
      ["CommonJS require", /\brequire\s*\(/],
      ["board-store internals", /\breadItem\b|\bmutateItem\b|\blistItems\b/],
      ["transition internals", /\bhttpSessionClient\b|\breattachInfo\b/],
      ["fs calls", /\breadFileSync\b|\bwriteFileSync\b|\bexistsSync\b/],
    ]
    const leaked = forbidden.filter(([, re]) => re.test(js)).map(([name]) => name)
    expect(leaked).toEqual([])
  })
})
