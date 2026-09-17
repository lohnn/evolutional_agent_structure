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

test("globally registered hive_* tools across the cohort == the deny mask (HIVE_TOOL_NAMES)", () => {
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
    "hive_tick",
  ])
})
