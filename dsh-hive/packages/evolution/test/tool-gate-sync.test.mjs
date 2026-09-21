// T2 guard: the awaken gate's deny mask must cover EVERY hive_* tool the
// cohort registers GLOBALLY (defineTool) — a new tool that ships without
// joining HIVE_TOOL_NAMES would stay visible to dormant top-level agents and
// the absent-not-denied gate would leak. Deliberately NOT counted: the
// lifecycle SUMMONS (registerLifecycleTool) — those are turn-scoped tools that
// never exist at the global layer; they are gated upstream by requireAwake()
// on their commands (D2), and putting never-registered names in the deny mask
// would make tools.restrict() throw on validation in production. Same
// source-scanning spirit as event-catalog-guard.test.mjs: plain regex over the
// monorepo sources, no TS imports, runtime-free.
//
// WI-066 leg: the deny mask is now the census MINUS HIVE_DORMANT_OPEN_TOOLS
// (the board's discovery/authoring surface, re-opened to dormant sessions).
// The open surface gets its own sync pins below: exact membership, ⊆ census,
// ⊆ the board cohort's actual defineTool registrations, and hive_board_bind
// never on it (ownership stays awakened-only). A rename on the board side
// that forgets these lists would otherwise silently re-mask an open tool.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import path from "path"
import url from "node:url"

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
const PKG = path.join(HERE, "..") // packages/evolution
const MONOREPO = path.join(PKG, "..", "..") // dsh-hive/

function walkTs(dir, fn) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkTs(p, fn)
    else if (e.name.endsWith(".ts")) fn(p)
  }
}

function collectGlobalHiveTools() {
  const names = new Set()
  const pkgRoot = path.join(MONOREPO, "packages")
  for (const pkg of fs.readdirSync(pkgRoot)) {
    walkTs(path.join(pkgRoot, pkg, "src"), (file) => {
      const text = fs.readFileSync(file, "utf8")
      for (const m of text.matchAll(/defineTool\(\{\s*name:\s*"(hive_[a-z0-9_]+)"/g)) names.add(m[1])
    })
  }
  return names
}

function collectLifecycleSummons() {
  const names = new Set()
  const src = path.join(PKG, "src")
  walkTs(src, (file) => {
    const text = fs.readFileSync(file, "utf8")
    for (const m of text.matchAll(/registerLifecycleTool\(\s*[A-Za-z_$][\w$.]*\s*,\s*"(hive_[a-z0-9_]+)"/g)) names.add(m[1])
  })
  return [...names].sort()
}

function collectDenyMask() {
  const indexSrc = fs.readFileSync(path.join(PKG, "src", "index.ts"), "utf8")
  const start = indexSrc.indexOf("export const HIVE_TOOL_NAMES")
  const end = indexSrc.indexOf("]", start)
  const block = indexSrc.slice(start, end)
  return new Set([...block.matchAll(/"(hive_[a-z0-9_]+)"/g)].map((m) => m[1]))
}

function collectOpenSurface() {
  const indexSrc = fs.readFileSync(path.join(PKG, "src", "index.ts"), "utf8")
  const start = indexSrc.indexOf("export const HIVE_DORMANT_OPEN_TOOLS")
  assert.ok(start >= 0, "HIVE_DORMANT_OPEN_TOOLS must exist in evolution src (WI-066)")
  const end = indexSrc.indexOf("]", start)
  return new Set([...indexSrc.slice(start, end).matchAll(/"(hive_[a-z0-9_]+)"/g)].map((m) => m[1]))
}

function collectBoardCohortTools() {
  const names = new Set()
  walkTs(path.join(MONOREPO, "packages", "board", "src"), (file) => {
    const text = fs.readFileSync(file, "utf8")
    for (const m of text.matchAll(/defineTool\(\{\s*name:\s*"(hive_[a-z0-9_]+)"/g)) names.add(m[1])
  })
  return names
}

test("globally registered hive_* tools across the cohort == the deny mask base (HIVE_TOOL_NAMES)", () => {
  const registered = collectGlobalHiveTools()
  const masked = collectDenyMask()
  assert.ok(registered.size >= 17, `expected the full cohort surface, found ${registered.size}: ${[...registered].join(", ")}`)
  const missing = [...registered].filter((n) => !masked.has(n)).sort()
  const extra = [...masked].filter((n) => !registered.has(n)).sort()
  assert.deepEqual(
    { missing, extra },
    { missing: [], extra: [] },
    `deny mask out of sync — missing from mask: [${missing}], masked but unregistered: [${extra}]`
  )
})

// WI-066: the dormant OPEN surface — exact membership pinned, subset of both
// the census and the board's real registrations, bind forever excluded.
test("dormant open surface == the 7 board discovery/authoring tools (exact, no bind)", () => {
  const open = collectOpenSurface()
  assert.deepEqual(
    [...open].sort(),
    [
      "hive_board_create",
      "hive_board_list",
      "hive_board_read",
      "hive_board_respec",
      "hive_board_retitle",
      "hive_board_search",
      "hive_board_tag",
    ],
    `HIVE_DORMANT_OPEN_TOOLS drifted — got [${[...open].sort().join(", ")}]. ` +
      `The dormant surface is the board's discovery/authoring half ONLY; touching it is a WI-066-level decision.`
  )
  assert.equal(open.size, 7, `expected exactly 7 open tools, found ${open.size}`)
})

test("open surface ⊆ census and ⊆ board's defineTool registrations; hive_board_bind stays masked", () => {
  const open = collectOpenSurface()
  const census = collectDenyMask()
  const board = collectBoardCohortTools()
  const notCensused = [...open].filter((n) => !census.has(n))
  const phantom = [...open].filter((n) => !board.has(n))
  assert.deepEqual({ notCensused, phantom }, { notCensused: [], phantom: [] },
    `open surface out of sync — not in HIVE_TOOL_NAMES: [${notCensused}], no defineTool registration in @hive/dsh-board: [${phantom}]`)
  assert.ok(open.has("hive_board_bind") === false, "hive_board_bind must NEVER sit on the dormant open surface (ownership stays awakened-only, SNG-038)")
  // the board census side: exactly the 8 known names, so a renamed/added board
  // tool must consciously join census+open or accept the mask (bind-style)
  const expectedBoard = new Set([
    "hive_board_list",
    "hive_board_search",
    "hive_board_read",
    "hive_board_bind",
    "hive_board_create",
    "hive_board_respec",
    "hive_board_retitle",
    "hive_board_tag",
  ])
  assert.deepEqual([...board].sort(), [...expectedBoard].sort(), `board cohort census drifted: [${[...board].sort().join(", ")}]`)
  // census minus open == exactly { hive_board_bind } for the board family —
  // the masked remainder of the board cohort is bind and nothing else
  const maskedBoard = [...expectedBoard].filter((n) => !open.has(n))
  assert.deepEqual(maskedBoard, ["hive_board_bind"], "bind is the ONLY board tool still denied to dormant sessions")
})

test("lifecycle summons stay turn-scoped (never globally registered, gated by requireAwake)", () => {
  // The summons exist ONLY inside command invocations; their gating lives in
  // the command handlers (D2) plus /awaken (exempt, it opens the gate). Pin
  // the expected surface so a new command's summon cannot silently skip the
  // gate review: adding a name here must come with a requireAwake() guard or
  // an explicit exemption in the commands block.
  assert.deepEqual(collectLifecycleSummons(), [
    "hive_awaken_spawn",
    "hive_dissolve",
    "hive_evolve",
    "hive_spawn",
    "hive_status",
    "hive_tick",
  ])
})
