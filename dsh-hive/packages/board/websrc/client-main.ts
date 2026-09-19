/**
 * WI-062 slice 3 — bundle ENTRY for the board tab's generated client.
 *
 * This module is bundled by scripts/build-client.ts (bun build, target browser,
 * format iife, globalName __BOARD_ENGINE) and consumed by the HAND-WRITTEN
 * loader wrapper that the build script appends to client.js:
 *
 *   window.__ModuleLoader__.load({ id:'@hive/dsh-board', factory:(require)=>{ … }
 *
 * The wrapper is the ONLY place React appears: it comes from the loader's
 * runtime module table (`require('react')`), never from this bundle (W-044:
 * baked client stays dependency-free; require is the host's runtime seam).
 * The engine (morph/filter/render/icon + tab-engine) is therefore completely
 * React-free — vanilla DOM, exactly like the old viewer's client.
 */
import { CSS } from "./render.js"
import { attachEngine } from "./tab-engine.js"
import { DRAWER_CSS } from "./item-drawer.js"
import { startFaviconDriver, attachSessionSurface } from "./icon-driver.js"

/**
 * Shell-safety overrides for the ported viewer CSS. Authored (slice 3), not a
 * port: the old CSS styles a full-viewport page; this panel lives INSIDE the
 * dsh shell, so per brief §8 the shell-safe sizing WINS where they clash —
 * denser typography and flex column widths tuned to a side-panel container.
 * Everything else (palette, chips, cards, badges, lanes) is the 4400 design
 * language, byte-ported.
 */
const CSS_OVERRIDES = `
/* ── DSH shell-adaptation overrides (WI-062 slice 3; authored — see banner) ── */
.hvb-root{height:100%;overflow-y:auto;box-sizing:border-box;padding:16px 20px 32px;font-size:12.5px;line-height:1.45}
.hvb-root h2{font-size:13.5px;margin:0 0 8px}
.hvb-root .kanban{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
.hvb-root .col{flex:1 1 200px;min-width:200px;max-width:360px}
.hvb-sub{color:rgba(128,128,128,.9);font-size:11.5px;margin:0 0 10px}
.hvb-controls-note{color:rgba(128,128,128,.75);font-size:11px;margin:0 0 8px}
`

const LOADING_HTML = '<div class="empty">Fetching the board…</div>'

/**
 * The panel shell, OUTSIDE the morph root (the slice-2 subtitle survives):
 *   .hvb-sub            read-only note (from the slice-2 panel, kept verbatim in spirit)
 *   #board-controls-host  the filter/collapse controls mount — engine fills it
 *                       from the first good payload, exactly once (upstream
 *                       equivalence: renderPage built them from page-load state)
 *   main#board-root     the morph root; starts in the loading state
 */
const SHELL_MARKUP =
  `<div class="hvb-sub">read-only view of the workspace board (WI-*) — the write path stays sealed behind the hive_board_* tools (WI-062)</div>` +
  `<div id="board-controls-host"></div>` +
  `<main id="board-root">${LOADING_HTML}</main>`

/** Sidebar glyph (kept from the slice-2 client): a small kanban mark. */
function iconSvg(size: number): string {
  const s = typeof size === "number" && isFinite(size) ? size : 20
  return (
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" style="display:block">` +
    `<rect x="3" y="4" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/>` +
    `<rect x="3" y="15" width="5" height="5" rx="1" fill="currentColor" opacity="0.35"/>` +
    `<rect x="10" y="4" width="5" height="13" rx="1" fill="currentColor" opacity="0.8"/>` +
    `<rect x="10" y="19" width="5" height="1" rx="0.5" fill="currentColor" opacity="0.35"/>` +
    `<rect x="17" y="4" width="5" height="5" rx="1" fill="currentColor" opacity="0.8"/>` +
    `<rect x="17" y="11" width="5" height="9" rx="1" fill="currentColor" opacity="0.55"/>` +
    `</svg>`
  )
}

/**
 * Engine handoff — SIDE-EFFECT module (no exports; bun's iife target silently
 * DROPS module exports, so the API must cross to the classic wrapper via an
 * explicit global assignment — the wrapper's E.CSS/E.ICON_SVG/E.SHELL_MARKUP/
 * E.attachEngine/E.startFaviconDriver reads depend on exactly this line).
 * DRAWER_CSS (slice 3b) rides inside the same override block so the style tag
 * stays ONE effect (the module system reads the data-plugin-css attribute).
 */
;(globalThis as unknown as Record<string, unknown>).__BOARD_ENGINE = {
  CSS,
  CSS_OVERRIDES: CSS_OVERRIDES + DRAWER_CSS,
  SHELL_MARKUP,
  ICON_SVG: iconSvg,
  attachEngine,
  startFaviconDriver,
  // Named, inert — carried on the global so the stub SURVIVES the bundle (an
  // uncalled module-local would be tree-shaken away). Nothing calls it until
  // dsh ships a session surface; see icon-driver.ts for the wiring contract.
  attachSessionSurface,
}
