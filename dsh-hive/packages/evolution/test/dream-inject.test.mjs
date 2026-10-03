// TOKEN-ECONOMY D3 — dream pointer plumbing:
// 1. isDreamArtifactId / parseDreamIds: the only shapes that can reach a
//    filesystem path are I-|W-|SNG-|SHADOW-<digits> (traversal-proof).
// 2. resolveDreamArtifacts: verbatim reads, per-id failures that never throw,
//    service pathForId preferred, direct probe fallback (standalone installs).
// 3. composeDreamArtifactBlock: verbatim artifact texts, lifecycle flags
//    surfaced BEFORE the text, null when nothing resolved.
// 4. describeDreamInjection: resolved ids, flagged ids, misses with reasons.
// 5. The pointer contract holds end-to-end: an id surface the persona
//    promises (filename stems) resolves against the real layout the archive
//    writes (artifacts/<subdir>/<ID>.yaml).
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import {
  isDreamArtifactId,
  parseDreamIds,
  resolveDreamArtifacts,
  composeDreamArtifactBlock,
  describeDreamInjection,
} from "@hive/dsh-evolution/lib/dream-inject"

function mkArchive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-inject-"))
  const base = path.join(dir, ".opencode/dreams/artifacts")
  for (const sub of ["insights", "warnings", "songlines", "shadows"]) fs.mkdirSync(path.join(base, sub), { recursive: true })
  fs.writeFileSync(path.join(base, "insights/I-012.yaml"), "insight_id: I-012\ncontent: the pattern discovered\ndomain_tags: [a]\n", "utf8")
  fs.writeFileSync(path.join(base, "warnings/W-007.yaml"), "warning_id: W-007\ncontent: the risk\nstale: true\n", "utf8")
  fs.writeFileSync(path.join(base, "insights/I-090.yaml"), "insight_id: I-090\ncontent: newer\nsuperseded_by: I-091\n", "utf8")
  fs.writeFileSync(path.join(base, "songlines/SNG-003.yaml"), "songline_id: SNG-003\nnarrative: the messenger story\n", "utf8")
  return dir
}

// ── 1. id grammar ────────────────────────────────────────────────────────────

test("only archive-shaped ids pass the grammar", () => {
  for (const ok of ["I-012", "W-007", "SNG-003", "SHADOW-010", " I-012 "]) assert.ok(isDreamArtifactId(ok), ok)
  for (const bad of ["", "I-", "I-abc", "../etc/passwd", "i-012", "SHADOW-", "I-012.yaml", "../../I-012", "I-012/extra"]) {
    assert.equal(isDreamArtifactId(bad), false, bad)
  }
})

test("parseDreamIds splits on commas and whitespace, drops empties", () => {
  assert.deepEqual(parseDreamIds("I-012, W-007  SNG-003,\nSHADOW-010"), ["I-012", "W-007", "SNG-003", "SHADOW-010"])
  assert.deepEqual(parseDreamIds("  ,,,  "), [])
  assert.deepEqual(parseDreamIds(""), [])
})

// ── 2. resolution ────────────────────────────────────────────────────────────

test("resolves verbatim text via the direct probe (archive layout)", () => {
  const dir = mkArchive()
  const [r] = resolveDreamArtifacts(dir, "I-012")
  assert.equal(r.ok, true)
  assert.equal(r.normalized, "I-012")
  assert.equal(r.text, "insight_id: I-012\ncontent: the pattern discovered\ndomain_tags: [a]\n")
})

test("resolves across all four types", () => {
  const dir = mkArchive()
  const rs = resolveDreamArtifacts(dir, "I-012, W-007, SNG-003")
  assert.equal(rs.length, 3)
  assert.ok(rs.every((r) => r.ok))
  assert.match(rs.find((r) => r.normalized === "W-007").text, /warning_id: W-007/)
})

test("a service pathForId wins when mounted (the mounted-archive path)", () => {
  const dir = mkArchive()
  const [r] = resolveDreamArtifacts(dir, "I-012", {
    pathForId: (id) => path.join(dir, ".opencode/dreams/artifacts/songlines", `${id}.yaml`),
  })
  assert.equal(r.ok, false, "the fake pathForId routes insights to songlines/ — and the miss is reported, not thrown")
  assert.match(r.detail, /not found/)
})

test("a mounted service that resolves correctly is used verbatim", () => {
  const dir = mkArchive()
  const [r] = resolveDreamArtifacts(dir, "I-012", {
    pathForId: (id) => path.join(dir, ".opencode/dreams/artifacts/insights", `${id}.yaml`),
  })
  assert.equal(r.ok, true)
  assert.match(r.text, /the pattern discovered/)
})

test("misses are per-id error entries, never exceptions; bad grammar is refused with a reason", () => {
  const dir = mkArchive()
  const rs = resolveDreamArtifacts(dir, "I-012, W-999, nope-xyz")
  assert.equal(rs.length, 3)
  assert.equal(rs[0].ok, true)
  assert.equal(rs[1].ok, false)
  assert.match(rs[1].detail, /not found/)
  assert.equal(rs[2].ok, false)
  assert.match(rs[2].detail, /not an artifact id/)
})

test("undefined / empty dream_ids resolve to nothing", () => {
  assert.deepEqual(resolveDreamArtifacts(mkArchive(), undefined), [])
  assert.deepEqual(resolveDreamArtifacts(mkArchive(), "   "), [])
})

// ── 3. the injected block ────────────────────────────────────────────────────

test("the block carries the DREAM POINTERS provenance header and verbatim artifact text", () => {
  const dir = mkArchive()
  const block = composeDreamArtifactBlock(resolveDreamArtifacts(dir, "I-012, SNG-003"))
  assert.match(block, /## Dream artifacts/)
  assert.match(block, /verbatim archive injection/)
  assert.match(block, /### I-012\n/)
  assert.match(block, /the pattern discovered/)
  assert.match(block, /### SNG-003\n/)
  assert.match(block, /the messenger story/)
})

test("lifecycle flags surface BEFORE the artifact text — staleness is seen first", () => {
  const dir = mkArchive()
  const block = composeDreamArtifactBlock(resolveDreamArtifacts(dir, "W-007, I-090"))
  const iW = block.indexOf("### W-007")
  const flagW = block.indexOf("⚠ lifecycle: stale", iW)
  assert.ok(flagW > iW && flagW < block.indexOf("warning_id: W-007"), "the ⚠ line sits between the heading and the body")
  const iI = block.indexOf("### I-090")
  const flagI = block.indexOf("superseded_by:I-091", iI)
  assert.ok(flagI > iI && flagI < block.indexOf("insight_id: I-090"))
  assert.match(block, /verify against I-091/)
})

test("all-miss resolutions compose null (no empty block appended to prompts)", () => {
  const dir = mkArchive()
  assert.equal(composeDreamArtifactBlock(resolveDreamArtifacts(dir, "W-999")), null)
})

// ── 4. the result line ───────────────────────────────────────────────────────

test("describeDreamInjection reports resolved ids, flags, and misses with reasons", () => {
  const dir = mkArchive()
  const line = describeDreamInjection(resolveDreamArtifacts(dir, "I-012, W-007, W-999"))
  assert.match(line, /Dream artifacts injected: I-012, W-007/)
  assert.match(line, /lifecycle flags on: W-007/)
  assert.match(line, /NOT injected — W-999/)
})

test("no dream_ids → no result note (byte-compat dispatch results)", () => {
  assert.equal(describeDreamInjection([]), null)
})
