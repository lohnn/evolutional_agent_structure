#!/usr/bin/env node
/**
 * rebake-kit — turn "dsh-hive/package changed" into "kit repacked" in ONE command.
 *
 * The failure mode (hit 2026-10-14, board buttons; hit 2026-10-14 again the
 * same day, agents token-economy #54): a source PR merges, no tarball is
 * repacked, kit machines resolve the old version forever. The tarball
 * reversion rule (../../docs/DSH-UPDATE-RUNBOOK.md) demands four fiddly,
 * error-prone steps per repack — this script does all of them:
 *
 *   1. bump the package version (patch by default — same-name repacks ship
 *      to NOBODY, the version is the release identity);
 *   2. build, then `pnpm pack` into ../dsh-hive-dist/;
 *   3. drop the superseded tarball;
 *   4. re-point EVERY reference site (dsh-hive-update.sh KIT_TARBALLS + SPECS,
 *      .pnpmfile.cjs, dsh-profile-hive package.json, test pins, README if any)
 *      by filename — then run BOTH kit gates (updater bootstrap + freshness).
 *
 * Usage (from dsh-hive/, or --dir from the repo root):
 *   pnpm rebake board [more names…]   # dir names under dsh-hive/packages/
 *   pnpm rebake --all                 # every kit-shipped package
 *   pnpm rebake agents --set 0.1.0    # explicit version instead of patch bump
 *   pnpm rebake board --dry-run       # print the plan, write nothing
 *
 * A rebake is for CHANGES: manifest == shipped always means one more bump.
 * To inspect without writing, use --dry-run; every intermediate bump the kit
 * never shipped is harmless — only committed tarballs resolvable.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as cp from "node:child_process"
import { fileURLToPath } from "node:url"

const HIVE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DIST_DIR = path.resolve(HIVE_DIR, "..", "dsh-hive-dist")

const argv = process.argv.slice(2)
const flags = {
  all: argv.includes("--all"),
  dry: argv.includes("--dry-run"),
  set: extractValue("--set"),
}
const names = argv.filter((a) => !a.startsWith("--") && a !== flags.set)

function extractValue(flag) {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : null
}

function fail(msg) {
  console.error(`rebake-kit: FAIL — ${msg}`)
  process.exit(1)
}

function sh(cmd, opts = {}) {
  const r = cp.spawnSync(cmd[0], cmd.slice(1), { cwd: opts.cwd ?? process.cwd(), stdio: ["ignore", opts.capture ? "pipe" : "inherit", "inherit"], encoding: "utf8" })
  if (r.status !== 0) fail(`command failed (${r.status}): ${cmd.join(" ")}`)
  return r.stdout
}

const REPO_ROOT = path.resolve(DIST_DIR, "..")

function readPkg(dir) {
  const json = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
  if (!/^\d+\.\d+\.\d+$/.test(json.version)) {
    fail(`${dir}: version "${json.version}" is not plain x.y.z — rebump manually or pass --set`)
  }
  return json
}

function bumpPatch(v) {
  const [x, y, z] = v.split(".").map(Number)
  return `${x}.${y}.${z + 1}`
}

const mangle = (name) => name.replace(/^@/, "").replace(/\//g, "-")

// walk dsh-hive-dist/ for text files that may reference tarball names
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else if (!entry.name.endsWith(".tgz")) yield p
  }
}

const PACKAGES_DIR = path.join(HIVE_DIR, "packages")
const allShort = fs.readdirSync(PACKAGES_DIR).filter((d) => fs.existsSync(path.join(PACKAGES_DIR, d, "package.json")))

let shorts = names
if (flags.all) {
  shorts = allShort.filter((d) => !["research-rampage"].includes(d)) // NOT_KIT_SHIPPED — see dsh-hive-dist/test/kit-freshness.test.sh
} else if (shorts.length === 0) {
  console.error(`usage: pnpm rebake <package…|--all> [--set x.y.z] [--dry-run]\npackages: ${allShort.join(", ")}`)
  process.exit(1)
}
for (const s of shorts) {
  fs.existsSync(path.join(PACKAGES_DIR, s, "package.json")) || fail(`no package dir dsh-hive/packages/${s}/`)
}

// — plan —
//
// Reconciliation model: the MANIFEST version is the desired version, the KIT
// references are the shipped version. This makes a half-finished run safely
// resumable (e.g. the manifest was already bumped when something failed):
//   kit ref == manifest  → normal path: bump, build, pack, drop old, repoint
//   kit ref <  manifest  → resume: NO second bump; pack the manifest version
//                          and repoint the kit refs onto it
//   no kit ref           → first-ever bake of a fresh package (no bump needed;
//                          nothing out there resolves it yet)
const distText = new Map()
for (const file of walk(DIST_DIR)) distText.set(file, fs.readFileSync(file, "utf8"))
const kitVersionFor = (mangled) => {
  for (const text of distText.values()) {
    const m = text.match(new RegExp(`${mangled}-(\\d+\\.\\d+\\.\\d+)\\.tgz`))
    if (m) return m[1]
  }
  return null
}

const jobs = shorts.map((s) => {
  const dir = path.join(PACKAGES_DIR, s)
  const pkg = readPkg(dir)
  const mangled = mangle(pkg.name)
  const shipped = kitVersionFor(mangled)
  let next
  if (flags.set) next = flags.set
  else if (shipped === pkg.version) next = bumpPatch(pkg.version)      // normal path
  else next = pkg.version                                              // resume / first bake
  const oldTgz = shipped ? path.join(DIST_DIR, `${mangled}-${shipped}.tgz`) : null
  const newTgz = path.join(DIST_DIR, `${mangled}-${next}.tgz`)
  const manifest = { ...pkg, version: next }
  const mode = !shipped ? "first bake"
    : shipped === next ? "already shipped — skipping (delete the tarball or pass --set to force)"
    : shipped === pkg.version ? "bump + repack"
    : `resume — manifest already at ${next}, kit still serves ${shipped}`
  return { s, dir, pkg, mangled, shipped, next, oldTgz, newTgz, manifest, mode }
})

const doing = jobs.filter((j) => j.mode !== "already shipped — skipping (delete the tarball or pass --set to force)")
console.log("rebake-kit plan:")
for (const j of jobs) console.log(`  ${j.pkg.name} ${j.mode}`)
if (doing.length === 0) {
  console.log("nothing to do — every requested package is already shipped at its manifest version")
  process.exit(0)
}
if (flags.dry) {
  console.log("dry-run — nothing written, no build/pack/tests run")
  process.exit(0)
}

// — version bumps (all first: pack reads the manifest) —
for (const j of doing) {
  if (j.manifest.version === j.pkg.version && j.mode !== "first bake") continue // resume: manifest already right
  fs.writeFileSync(path.join(j.dir, "package.json"), JSON.stringify(j.manifest, null, 2) + "\n")
  console.log(`bumped ${j.pkg.name} → ${j.next}`)
}

// — build + pack per package —
for (const j of doing) {
  // Build is optional: plain-JS packages (dsh-berget-refresh) carry no build
  // script — skip instead of failing the bake. A declared-but-broken build
  // stays loud through the normal failure path.
  if (j.pkg.scripts?.build) {
    console.log(`building ${j.pkg.name}…`)
    sh(["pnpm", "--filter", j.pkg.name, "run", "build"], { cwd: HIVE_DIR })
  } else {
    console.log(`building ${j.pkg.name}… (no build script — skipping)`)
  }
  console.log(`packing ${j.pkg.name}…`)
  sh(["pnpm", "--filter", j.pkg.name, "exec", "pnpm", "pack", "--pack-destination", DIST_DIR], { cwd: HIVE_DIR })
  fs.existsSync(j.newTgz) || fail(`expected tarball missing after pack: ${j.newTgz}`)

  if (j.shipped && j.shipped !== j.next && j.oldTgz && fs.existsSync(j.oldTgz)) {
    const resolved = path.resolve(j.oldTgz)
    if (path.dirname(resolved) !== DIST_DIR || !path.basename(resolved).includes(`-${j.shipped}.tgz`)) {
      fail(`refusing to remove unexpected path: ${resolved}`)
    }
    fs.rmSync(j.oldTgz)
    console.log(`dropped superseded ${path.basename(j.oldTgz)}`)
  }
}

// — re-point every reference site in dsh-hive-dist (text files only) —
let refsFlipped = 0
for (const [file, text] of distText) {
  let next = text
  for (const j of doing) {
    if (j.shipped) next = next.split(`${j.mangled}-${j.shipped}.tgz`).join(`${j.mangled}-${j.next}.tgz`)
  }
  if (next !== text) {
    fs.writeFileSync(file, next)
    distText.set(file, next)
    refsFlipped++
    console.log(`re-pointed ${path.relative(REPO_ROOT, file)}`)
  }
}
console.log(`${refsFlipped} reference site(s) re-pointed`)

// — both kit gates —
console.log("running kit gates (updater bootstrap + freshness)…")
sh(["bash", path.join(DIST_DIR, "test", "updater-bootstrap.test.sh")], { cwd: REPO_ROOT })
sh(["bash", path.join(DIST_DIR, "test", "kit-freshness.test.sh")], { cwd: REPO_ROOT })

console.log(`rebake-kit OK: ${jobs.map((j) => `${j.pkg.name.split("/").pop()}@${j.next}`).join(", ")}`)
console.log("remember: run the package test suite (`pnpm --dir dsh-hive -r test`) and commit the tarballs in the SAME PR — CI enforces it.")
