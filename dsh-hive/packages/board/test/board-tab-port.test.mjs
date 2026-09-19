// WI-062 slice 3 — I-139 doctrine for the board tab: the ported browser modules
// are COPIES of src/board-viewer/web|data, verified here by DRIFT TESTS against
// the upstream tree (byte-identity after normalizing ONLY the documented
// deltas), plus the A7/I-192 emitted-bundle guard (buffer-level, not source) —
// server-only code must never reach client.js bytes.
//
// The upstream tree is the sibling repo checkout at
// /workspace/projects/evolutional_agent_structure/src/board-viewer — per the
// I-139 pattern the test SKIPS QUIETLY when that tree is absent (kit Way A
// prepares inside the package dir with no siblings); when it exists, drift is
// a hard failure.
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import test from "node:test"

const PKG = path.dirname(new URL(import.meta.url).pathname.replace("/test", ""))
const UPSTREAM = "/workspace/projects/evolutional_agent_structure/src/board-viewer"
const upstreamAvailable = existsSync(path.join(UPSTREAM, "web", "render.ts"))

/**
 * Strip the provenance banner (only if present — upstream files carry their
 * own module docs that must STAY in the comparison) and all module-connective
 * lines (`import … from "…"` / `export … from "…"`) — the documented delta
 * classes. Everything else must be byte-identical.
 */
function normalized(source) {
  let text = source
  if (text.includes("WEB PORT PROVENANCE")) text = text.slice(text.indexOf("*/") + 2)
  return text
    .replace(/^\s+/, "")
    .replace(/import[\s\S]*?from\s*"[^"]*"\n?/g, "")
    .replace(/export[ \t]*\{[^}]*\}[ \t]*from\s*"[^"]*"\n?/g, "")
}

test("port drift: verbatim copies match upstream (morph, filter, icon, data/*)", (t) => {
  if (!upstreamAvailable) { t.skip("upstream sibling absent — kit Way A; drift test skips quietly"); return }
  const pairs = [
    ["web/morph.ts", "websrc/morph.ts"],
    ["web/filter.ts", "websrc/filter.ts"],
    ["web/icon.ts", "websrc/icon.ts"],
    ["data/thresholds.ts", "websrc/data/thresholds.ts"],
    ["data/placeholder-title.ts", "websrc/data/placeholder-title.ts"],
    ["data/todo-types.ts", "websrc/data/todo-types.ts"],
    ["data/lineage.ts", "websrc/data/lineage.ts"],
    ["data/recency.ts", "websrc/data/recency.ts"],
    ["data/board.ts", "websrc/data/board.ts"],
  ]
  for (const [up, local] of pairs) {
    const a = normalized(readFileSync(path.join(UPSTREAM, up), "utf8"))
    const b = normalized(readFileSync(path.join(PKG, local), "utf8"))
    assert.equal(b, a, `drift between ${up} and ${local}`)
  }
})

test("port drift: data/workitems.ts keeps the sortForColumn policy byte-true", (t) => {
  if (!upstreamAvailable) { t.skip("upstream sibling absent"); return }
  const region = (src) => {
    const start = src.indexOf("const PRIORITY_ORDER")
    const end = src.indexOf("\n}", src.indexOf("export function sortForColumn")) + 3
    assert.ok(start > 0 && end > start, "sortForColumn region found")
    return src
      .slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, "") // doc comments may be condensed; CODE may not drift
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n")
  }
  const up = region(readFileSync(path.join(UPSTREAM, "data/workitems.ts"), "utf8"))
  const local = region(readFileSync(path.join(PKG, "websrc/data/workitems.ts"), "utf8"))
  assert.equal(local, up, "sortForColumn policy code drifted from upstream")
})

test("port drift: render.ts differs ONLY by the documented deltas", (t) => {
  if (!upstreamAvailable) { t.skip("upstream sibling absent"); return }
  const up = normalized(readFileSync(path.join(UPSTREAM, "web/render.ts"), "utf8"))
  let local = normalized(readFileSync(path.join(PKG, "websrc/render.ts"), "utf8"))
  // documented delta 1: re-export keyword additions (visual API for the tab host)
  const exportKeywords = ["export function buildBadge", "export interface CardCtx", "export function kanbanSection", "export const CSS = `", "export function boardControlsHtml"]
  // documented delta 2: the Notice type is inlined (notices.ts excluded)
  const noticeBlockStart = local.indexOf("// notices.ts is EXCLUDED from the port")
  const noticeType = "type Notice = { at: string; text: string }"
  const noticeBlockEnd = local.indexOf(noticeType)
  assert.ok(noticeBlockStart > 0 && noticeBlockEnd > noticeBlockStart, "Notice inlining present")
  const noticeAfter = noticeBlockEnd + noticeType.length // cut PAST the inlined type too
  // documented delta 3: the appended TAB ADDITION section + its meta line
  const tabStart = local.indexOf("── TAB ADDITION (WI-062 slice 3)")
  assert.ok(tabStart > noticeAfter, "renderBoardSection appended")
  // excision sutures and the removed import block leave blank-line runs that
  // upstream (whose import block was stripped clean) does not have; blank-line
  // runs carry no semantics in TS, so collapse them on BOTH sides — only then
  // must the bytes match.
  const withoutBlankRuns = (s) => s.replace(/\n\s*\n/g, "\n")
  const localBodyFull = (local.slice(0, noticeBlockStart) + local.slice(noticeAfter))
    .replace(/export function buildBadge/g, "function buildBadge")
    .replace(/export interface CardCtx/g, "interface CardCtx")
    .replace(/export function kanbanSection/g, "function kanbanSection")
    .replace(/export const CSS = `/g, "const CSS = `")
    .replace(/export function boardControlsHtml/g, "function boardControlsHtml")
    // inline import-type redirect carries only a path change
    .replaceAll(`import("../src/lib/board-transitions.js").ReattachDecision`, `import("../../lib/board-transitions").ReattachDecision`)
  const bannerIdx = localBodyFull.indexOf("/**\n * ── TAB ADDITION")
  assert.ok(bannerIdx > 0, "TAB ADDITION banner present in body")
  const localBody = withoutBlankRuns(localBodyFull.slice(0, bannerIdx))
  const upBody = withoutBlankRuns(up)
  assert.equal(localBody, upBody, "drift beyond the documented export/Notice/inline-type deltas")
  void exportKeywords
})

// ── A7 / I-192: the EMITTED bundle guard (bytes, not source) ──────────────────

const CLIENT = readFileSync(path.join(PKG, "client.js"), "utf8")

test("emitted client.js: no server-only import forms survive (I-192, byte-level)", () => {
  const forbidden = [
    /from\s*"(node:|bun:)/, // ESM forms
    /require\(\s*"(node:|bun:|fs|path|os|child_process)/, // CJS forms
    /import\(\s*"(node:|bun:)/,
    /board-store/, // the store module must NEVER reach the bundle (its W-044 leak class)
    /@deepseek-ai\//, // framework packages are runtime-module-table only (W-044)
  ]
  for (const rx of forbidden) {
    assert.doesNotMatch(CLIENT, rx, `server-only leak matched ${rx}`)
  }
  // the react seam is the ONLY runtime require the wrapper holds
  const requires = CLIENT.match(/require\(/g) ?? []
  assert.equal(requires.length, 1, "exactly one require — the wrapper's React table read")
})

test("emitted client.js: carries the slice-3 + 3b surface markers", () => {
  assert.ok(CLIENT.includes("__ModuleLoader__.load"), "classic loader registration present")
  assert.match(CLIENT, /__BOARD_ENGINE=/, "engine global assignment present")
  assert.ok(CLIENT.includes("build-badge"), "staleness badge markup present (I-152)")
  assert.ok(CLIENT.includes("filter-corpus"), "filter corpus island present (WI-084)")
  assert.ok(CLIENT.includes("data-col-toggle"), "column collapse strip present")
  assert.ok(CLIENT.includes("hive-board"), "board slot keys present")
  // slice 3b markers (the favicon driver, the drawer, the title pass)
  assert.ok(CLIENT.includes("startFaviconDriver"), "favicon driver exported through the engine global")
  assert.ok(CLIENT.includes("hvb-favicon"), "favicon link id present")
  // slice 3D: the stub was RESOLVED, not renamed — real feed asserts follow
  assert.ok(!CLIENT.includes("attachSessionSurface"), "3B stub gone from the bundle (real feed shipped)")
  assert.ok(CLIENT.includes("/api/hive-board/item"), "item depth route url present")
  assert.ok(CLIENT.includes("hvb-drawer"), "drawer mount present")
  assert.ok(CLIENT.includes("raw-title-chip"), "SHADOW-019 raw title chip present")
  // the drawer + scrim must anchor to document.body (fixed positioning must
  // escape transformed panel ancestors) — asserted as a structural string
  assert.ok(CLIENT.includes("document.body.appendChild"), "drawer body-mount present")
  // slice 3C — the animated panel-head mark (surviving string literals only:
  // internal fn names minify away; CSS keyframe names, class hooks and id
  // prefixes survive the minifier by being string literals)
  assert.ok(CLIENT.includes("hvb-panel-mark"), "panel mark holder present in shell + driver lookup")
  assert.ok(CLIENT.includes('class="lit"'), "mark breathe hooks emitted when animate:true")
  assert.ok(CLIENT.includes("mark-breathe"), "ported breathe keyframes ship in the style tag")
  assert.ok(CLIENT.includes('idPrefix:"hvbp"'), "panel mark clip ids namespaced away from other marks")
  // slice 3D — the live-activity feed (property names survive minification).
  // NOTE: the per-agent `status === "running"` discriminator lives in the HOST
  // (src/index.ts activityFor) — asserted there by the tab tests; the CLIENT
  // only consumes activity.runningAgents, so that is what guards here.
  assert.ok(CLIENT.includes("runningAgents"), "runningAgents feed read survives minify")
  assert.ok(CLIENT.includes("board activity") && CLIENT.includes("running · sampled"), "mark tooltip carries the count semantics + the as-of stamp (minified template splits — assert fragments)")
})
