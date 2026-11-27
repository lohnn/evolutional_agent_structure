// LAYOUT PROBE — harbor-move compatibility contract (WAVE 3b, P4 readers).
//
// The workspace state root was moved live on 2026-11-27 (`mv .opencode → .helm`,
// atomic, verified): `/workspace/.helm` is the native root, and the legacy
// `/workspace/.opencode` path survives as a compatibility SYMLINK so that
// readers still carrying old `.opencode` constants keep resolving.
//
// REMOVE THIS FILE when the compat symlink retires (planned alias-retirement
// wave): without the symlink, `.opencode` is simply gone and these assertions
// would pin a contract that no longer exists.
//
// Machine-scoped on purpose: like the board/dream real-store reads in this
// suite family (service-harness.mjs `cpSync` from the live store), this test
// assumes the /workspace state root of this container. It documents the
// symlink contract, not a portable invariant.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { readlinkSync } from "node:fs"

const NEW_ROOT = "/workspace/.helm"
const LEGACY_PATH = "/workspace/.opencode"

test("state root: new .helm root exists and is a directory", () => {
  const st = fs.statSync(NEW_ROOT) // throws if missing
  assert.ok(st.isDirectory(), `${NEW_ROOT} should be a directory`)
})

test("state root: legacy .opencode is a SYMLINK pointing at .helm", () => {
  const lst = fs.lstatSync(LEGACY_PATH)
  assert.ok(lst.isSymbolicLink(), `${LEGACY_PATH} should be a symlink (not a dir)`)

  // The target may be recorded relative (".helm") or absolute; both must
  // resolve to the native root.
  const target = readlinkSync(LEGACY_PATH)
  const resolved = path.resolve(path.dirname(LEGACY_PATH), target)
  assert.equal(resolved, NEW_ROOT, `symlink target ${target} should resolve to ${NEW_ROOT}`)
})

test("state root: both names address the SAME tree (same real path)", () => {
  // realpath through the symlink must equal the native root's realpath.
  assert.equal(
    fs.realpathSync(LEGACY_PATH),
    fs.realpathSync(NEW_ROOT),
    "legacy and native names must share one physical tree",
  )
})

test("state root: the board lane is reachable through both names", () => {
  // The board store is the live-locked surface every harbor wave verified;
  // its presence through both path names is the functional end of the contract.
  assert.ok(fs.existsSync(path.join(NEW_ROOT, "board")), `${NEW_ROOT}/board missing`)
  assert.ok(fs.existsSync(path.join(LEGACY_PATH, "board")), `${LEGACY_PATH}/board missing via symlink`)
})
