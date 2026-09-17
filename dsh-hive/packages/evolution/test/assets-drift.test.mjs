// Asset drift guard (T3) — the doctrine and dormant-explainer markdown files
// are prompt text shipped to a model. The marker lines make edits conscious,
// the length bounds keep them readable as standing prompt sections, and the
// placeholder scan catches unresolved template seams. Plain node:test; no
// TS imports — the assets are read straight off disk.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import { fileURLToPath } from "url"

const DOCTRINE_PATH = fileURLToPath(new URL("../assets/doctrine.md", import.meta.url))
const DORMANT_PATH = fileURLToPath(new URL("../assets/dormant-explainer.md", import.meta.url))
const STANDING_PATH = fileURLToPath(new URL("../assets/capability-standing.md", import.meta.url))

const DOCTRINE_MARKER = "<!-- hive:doctrine v1 -->"
const DORMANT_MARKER = "<!-- hive:dormant v1 -->"
const STANDING_MARKER = "<!-- hive:capability-standing v1 -->"

function readAsset(path) {
  assert.ok(fs.existsSync(path), `expected asset file to exist: ${path}`)
  return fs.readFileSync(path, "utf8").trimEnd()
}

function lineCount(content) {
  return content.split("\n").length
}

function lastLine(content) {
  const lines = content.split("\n")
  return lines[lines.length - 1]
}

for (const [path, marker, name] of [
  [DOCTRINE_PATH, DOCTRINE_MARKER, "doctrine"],
  [DORMANT_PATH, DORMANT_MARKER, "dormant-explainer"],
  [STANDING_PATH, STANDING_MARKER, "capability-standing"],
]) {
  test(`${name} asset exists and has no unresolved placeholders`, () => {
    const content = readAsset(path)
    assert.ok(content.length > 0, "asset must not be empty")
    assert.ok(!content.includes("{{"), "asset must not contain {{ placeholder syntax")
  })

  test(`${name} asset ends with its exact marker line`, () => {
    const content = readAsset(path)
    assert.equal(lastLine(content), marker)
  })
}

// Doctrine bound: settled empirically at first authoring; hard ceiling guards
// runaway growth. Tonality (D5, near-full port) outweighs a length guess.
test("doctrine line count stays within settled bounds (100-240)", () => {
  const count = lineCount(readAsset(DOCTRINE_PATH))
  assert.ok(count >= 100, "doctrine too short for a standing section")
  assert.ok(count <= 240, "doctrine too long — runaway growth")
})

test("dormant explainer stays within its compact bounds (8-25 lines)", () => {
  assert.ok(lineCount(readAsset(DORMANT_PATH)) >= 8, "dormant explainer too short")
  assert.ok(lineCount(readAsset(DORMANT_PATH)) <= 25, "dormant explainer too long")
})

// Capability standing (T5): rides in EVERY capability dispatch persona (T5/D7
// persona-carried transport) next to the capability's own method — compact
// enough to be standing context, present enough to hold the five survivor
// constraints (scope discipline, lead-with-the-outcome reporting, honor/
// publish contracts, independent-first, the coordinator synapse).
test("capability standing stays within its compact bounds (20-60 lines)", () => {
  assert.ok(lineCount(readAsset(STANDING_PATH)) >= 20, "capability standing too short")
  assert.ok(lineCount(readAsset(STANDING_PATH)) <= 60, "capability standing too long — runaway growth")
})

test("capability standing carries the synapse rule and no D3-dead messaging", () => {
  const content = readAsset(STANDING_PATH)
  // The D3 replacement line is the load-bearing one: siblings never see
  // each other's context; everything flows through the coordinator.
  assert.match(content, /THROUGH THE COORDINATOR/)
  assert.match(content, /synapse/)
  // The messaging half (hive_signal/listen/sent/retire + mailbox) died with
  // D3 — it must not leak back into the shipped doctrine.
  for (const dead of ["hive_signal", "hive_listen", "hive_sent", "hive_retire", "_broadcast", "_coordinator"]) {
    assert.ok(!content.includes(dead), `capability standing must not mention the retired messaging layer (${dead})`)
  }
})

test("dormant explainer mentions no command mechanics beyond /awaken", () => {
  const content = readAsset(DORMANT_PATH)
  const slashCommands = content.match(/\/[a-z]+/g) ?? []
  for (const cmd of slashCommands) {
    assert.equal(cmd, "/awaken", `dormant explainer must not name commands other than /awaken (found ${cmd})`)
  }
})
