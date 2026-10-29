// WI-107 regression guard — the capability roster lists each capability
// EXACTLY ONCE across the two supported layouts:
//
//   (a) the dsh preset pair <name>/preset.yml + agent.cordis.yml plus the
//       sibling <name>.md energy ledger (what the dsh-era spawn() writes),
//   (b) the legacy OpenCode ledger-only <name>.md (the 8 dir-less roster
//       singles on this workspace).
//
// The bug this pins (W-124): the pre-fix listCapabilities() pushed one
// roster entry per FILE, so every (a) pair double-listed the capability —
// 22 roster lines for 15 capabilities. The pairing contract (lib/roster.ts):
// the preset wins when both exist (the same D7 rule lib/material.ts encodes
// for dispatch material), the ledger carries the pair's energy, and the
// ledger-only layout still lists.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { pairCapabilityEntries } from "@hive/dsh-evolution"

const dirEntry = (name) => ({ name, isDirectory: () => true, isFile: () => false })
const fileEntry = (name) => ({ name, isDirectory: () => false, isFile: () => true })

function mkCaps() {
  const caps = fs.mkdtempSync(path.join(os.tmpdir(), "evo-roster-"))
  return caps
}

// Materialize the EXACT pair the dsh-era spawn() writes (see
// renderAgentCordisYml/spawn in src/index.ts — preset.yml + agent.cordis.yml
// + the seeded ledger).
function writeSpawnPair(caps, name, description, energy) {
  fs.mkdirSync(path.join(caps, name), { recursive: true })
  fs.writeFileSync(
    path.join(caps, name, "preset.yml"),
    `name: ${name}\ndescription: ${description}\norder: 10\nmodel_tier: standard\n`
  )
  fs.writeFileSync(
    path.join(caps, name, "agent.cordis.yml"),
    `name: ${name}\ndescription: ${description}\n`
  )
  fs.writeFileSync(
    path.join(caps, `${name}.md`),
    `---\nname: ${name}\ndescription: ${description}\nenergy: ${energy}\n---\n\n# ${name}\n\n${description}\n`
  )
}

function writeLedger(caps, name, energy) {
  fs.writeFileSync(
    path.join(caps, `${name}.md`),
    `---\nname: ${name}\ndescription: ${name} desc\nenergy: ${energy}\n---\n\n# ${name}\n`
  )
}

test("a dir+ledger pair lists ONCE: preset description, ledger energy", () => {
  const caps = mkCaps()
  writeSpawnPair(caps, "alpha", "the alpha capability", 40)
  const list = pairCapabilityEntries([dirEntry("alpha"), fileEntry("alpha.md")], caps)
  assert.equal(list.length, 1, `the pair must enumerate once, got ${JSON.stringify(list)}`)
  assert.deepEqual(list[0], { name: "alpha", energy: 40, description: "the alpha capability" })
})

test("the same pair lists ONCE in the reversed readdir scan order (dir overwrites a ledger seen first)", () => {
  const caps = mkCaps()
  writeSpawnPair(caps, "alpha", "the alpha capability", 40)
  const list = pairCapabilityEntries([fileEntry("alpha.md"), dirEntry("alpha")], caps)
  assert.equal(list.length, 1, `the pair must enumerate once, got ${JSON.stringify(list)}`)
  assert.deepEqual(list[0], { name: "alpha", energy: 40, description: "the alpha capability" })
})

test("a ledger-only capability (legacy layout) still lists ONCE with its own frontmatter", () => {
  const caps = mkCaps()
  writeLedger(caps, "solo", 7)
  const list = pairCapabilityEntries([fileEntry("solo.md")], caps)
  assert.deepEqual(list, [{ name: "solo", energy: 7, description: "solo desc" }])
})

test("mixed layout (pair + ledger-only) enumerates each capability exactly once", () => {
  const caps = mkCaps()
  writeSpawnPair(caps, "paired", "paired capability", 55)
  writeLedger(caps, "solo", 12)
  const list = pairCapabilityEntries([dirEntry("paired"), fileEntry("paired.md"), fileEntry("solo.md")], caps)
  assert.deepEqual(
    list.map((c) => c.name),
    ["paired", "solo"]
  )
  assert.equal(list[0].energy, 55, "the pair's energy rides the ledger")
  assert.equal(list[1].energy, 12, "the ledger-only capability keeps its own energy")
})

test("real fs fixture: names sort, stray non-capability forms stay invisible", () => {
  const caps = mkCaps()
  writeSpawnPair(caps, "paired", "paired capability", 42)
  writeLedger(caps, "solo", 3)
  // A preset-less directory is NOT a capability — but its stray ledger,
  // if any, still lists (pre-fix semantics for the legacy layout).
  fs.mkdirSync(path.join(caps, "ghost"), { recursive: true })
  writeLedger(caps, "ghost-with-ledger", 9)
  // Ignored shapes: underscore-prefixed, non-markdown files, empty dirs.
  writeLedger(caps, "_template", 99)
  fs.writeFileSync(path.join(caps, "notes.txt"), "not a capability\n")
  fs.mkdirSync(path.join(caps, "empty-dir"), { recursive: true })

  const list = pairCapabilityEntries(fs.readdirSync(caps, { withFileTypes: true }), caps)
  assert.deepEqual(
    list.map((c) => c.name),
    ["ghost-with-ledger", "paired", "solo"]
  )
  assert.equal(list.find((c) => c.name === "paired")?.energy, 42, "the pair's energy rides the ledger")
  assert.equal(list.find((c) => c.name === "ghost-with-ledger")?.energy, 9)
})
