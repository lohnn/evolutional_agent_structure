/**
 * WI-062 slice 3 — the client bundle build (runs under bun: `bun scripts/build-client.ts`).
 *
 * Bundles websrc/client-main.ts → client.js in the TWIN CLASSIC SHAPE:
 *   window.__ModuleLoader__.load({ id, factory(require) { … } })
 * a classic script (NOT an ES module), prebuilt and committed — the host reads
 * it raw at boot (package.json exports["./client"] stable, W-040's exports +
 * the twin precedent).
 *
 * Why bun without any new dependency: the kit's Way A installs run `prepare`
 * inside pnpm's bun-based prepare runner (see /workspace/web/pnpm-workspace.yaml
 * comment) and svcwatch runs this repo's services under bun — bun IS the
 * environment contract of this cohort. No dependency surgery was performed
 * under the live web (W-072).
 *
 * The build SHA (git short SHA of the dsh-hive monorepo, `-dirty` suffixed, the
 * same resolver the old viewer's config.ts#resolveBuildSha used — one repo, one
 * version) is STAMPED twice:
 *   1. into the bundle via `define` __BOARD_BUILD_SHA__ (the staleness-verdict
 *      client side, I-152 discipline);
 *   2. into dist/board-build.json — read at REQUEST time by the tab route so
 *      payload.boardBuild carries the running half's stamp (the verdict's
 *      server side).
 *
 * FAILS LOUDLY (non-zero exit) on any build failure; the previous client.js is
 * left untouched so the running tab stays functional while the gate is red.
 */
import * as path from "node:path"
import * as fs from "node:fs"
import * as cp from "node:child_process"

const PKG = path.dirname(import.meta.dir) // scripts/ → package root
const MONO = path.resolve(PKG, "..", "..") // the dsh-hive monorepo root (one repo, one version)

function gitSha(): string {
  const short = cp.execSync("git rev-parse --short HEAD", { cwd: MONO }).toString().trim()
  const dirty = cp.execSync("git status --porcelain", { cwd: MONO }).toString().trim().length > 0 ? "-dirty" : ""
  return short + dirty
}

const sha = gitSha()
const result = await Bun.build({
  entrypoints: [path.join(PKG, "websrc", "client-main.ts")],
  target: "browser",
  minify: true,
  format: "iife",
  globalName: "__BOARD_ENGINE",
  define: {
    // Baked-in build identity — the freshness verdict's client side (I-152).
    __BOARD_BUILD_SHA__: JSON.stringify(sha),
  },
})

if (!result.success || result.outputs.length === 0) {
  const msg = result.logs.map((l) => String(l)).join("; ") || "no outputs"
  console.error(`[hive-board] client bundle FAILED to build: ${msg}`)
  process.exit(1) // loud gate — the previous client.js keeps the live tab working
}

const bundled = await result.outputs[0]!.text()

// The hand-written loader wrapper (React only via the runtime module table).
const wrapper = `;window.__ModuleLoader__.load({
  id: '@hive/dsh-board',
  factory: (require) => {
    const React = require('react');
    const E = (typeof __BOARD_ENGINE !== 'undefined') ? __BOARD_ENGINE : window.__BOARD_ENGINE;
    let applied_once = false;
    return {
      name: '@hive/dsh-board',
      // The load-bearing client services gate (I-128): registration goes
      // through 'slots'; the 15 s poll cadence rides ctx.interval ('timer').
      inject: ['slots', 'timer'],
      apply(ctx) {
        if (applied_once) return; // idempotent: duplicate slot registration throws
        applied_once = true;
        ctx.effect(() => {
          const style = document.createElement('style');
          style.setAttribute('data-plugin-css', '@hive/dsh-board');
          style.textContent = E.CSS + E.CSS_OVERRIDES;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'board tab styles');
        const slots = ctx.get('slots');
        if (slots === undefined) {
          console.error('[@hive/dsh-board] no slots service — board panel not registered');
          return;
        }
        // Standalone sidebar entry ("HIVE Board"): keyed main panel + panellist
        // id of the same key (the berget-usage standalone pattern; slot kinds
        // verified live 2026-09-18).
        slots.inject('main', () => {
          slots.register(
            { name: 'main', key: 'hive-board' },
            () => React.createElement('div', {
              className: 'hvb-root',
              dangerouslySetInnerHTML: { __html: E.SHELL_MARKUP },
              ref: (el) => {
                if (el && !el.dataset.hvbBooted) {
                  el.dataset.hvbBooted = '1';
                  E.attachEngine(ctx);
                }
              },
            }),
          );
        });
        slots.inject('sidebar.panellist', () => {
          slots.register(
            { name: 'sidebar.panellist', id: 'hive-board', order: 110, label: 'HIVE Board' },
            (props) => React.createElement('span', {
              className: 'hvb-icon',
              dangerouslySetInnerHTML: { __html: E.ICON_SVG(props && typeof props.size === 'number' ? props.size : 20) },
            }),
          );
        });
        console.log('[@hive/dsh-board] client plugin applied (viewer-parity read-only board)');
      },
    };
  },
});
`

const banner = `// @hive/dsh-board — GENERATED client bundle (WI-062 slice 3). DO NOT EDIT BY HAND.
// Build: dsh-hive/packages/board/scripts/build-client.ts (bun) — bundles
// websrc/client-main.ts (the ported 4400 viewer engine + the tab engine) into
// the twin classic shape; the wrapper below is the only React-using code and
// takes React from the loader's runtime module table (W-044).
// Build stamp (both sides of the I-152 staleness verdict): ${sha}
`

const client = banner + bundled + wrapper
fs.writeFileSync(path.join(PKG, "client.js"), client)

fs.mkdirSync(path.join(PKG, "dist"), { recursive: true })
fs.writeFileSync(
  path.join(PKG, "dist", "board-build.json"),
  JSON.stringify({ boardBuild: sha }, null, 2) + "\n",
)

console.log(`[board] client bundle: ${client.length} bytes (build ${sha})`)
