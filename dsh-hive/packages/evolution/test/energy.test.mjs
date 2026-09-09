// Energy tick semantics across simulated session starts — the Phase-3 test
// gate: "energy decays correctly across simulated session starts".
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import {
  readHiveState,
  writeHiveState,
  markCapabilityUsed,
  tickEnergy,
} from "@hive/dsh-evolution"

function mkWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evo-energy-"))
  fs.mkdirSync(path.join(dir, ".opencode/agents/capabilities"), { recursive: true })
  return dir
}

function writeCapability(dir, name, energy) {
  fs.writeFileSync(
    path.join(dir, ".opencode/agents/capabilities", `${name}.md`),
    `---\nname: ${name}\ndescription: ${name} desc\nenergy: ${energy}\n---\n\n# ${name}\n`
  )
}

function readEnergy(dir, name) {
  const content = fs.readFileSync(path.join(dir, ".opencode/agents/capabilities", `${name}.md`), "utf8")
  return parseInt(content.match(/^energy:\s*(\d+)/m)[1], 10)
}

test("tick decays an unused capability by ENERGY_DECAY", () => {
  const dir = mkWorkspace()
  writeCapability(dir, "alpha", 50)
  // Simulate a prior session that used nothing, with a stale lastTick.
  writeHiveState(dir, { lastTick: "2020-01-01T00:00:00.000Z", usageLog: [{ capability: "ghost", sessionId: "ses_x", timestamp: "2020-01-01T00:00:00.000Z" }] })
  const { results, skipped } = tickEnergy(dir)
  assert.equal(skipped, false)
  const r = results.find((x) => x.name === "alpha")
  assert.equal(r.oldEnergy, 50)
  assert.equal(r.newEnergy, 40)
  assert.equal(readEnergy(dir, "alpha"), 40)
  fs.rmSync(dir, { recursive: true, force: true })
})

test("tick boosts a used capability (log2 usage boost), floors at 0, caps at 100", () => {
  const dir = mkWorkspace()
  writeCapability(dir, "busy", 90)
  writeCapability(dir, "idle", 5)
  writeHiveState(dir, {
    lastTick: "2020-01-01T00:00:00.000Z",
    usageLog: [
      { capability: "busy", sessionId: "ses_1", timestamp: "2020-01-01T00:00:00.000Z" },
      { capability: "busy", sessionId: "ses_2", timestamp: "2020-01-01T00:00:00.000Z" },
      { capability: "busy", sessionId: "ses_3", timestamp: "2020-01-01T00:00:00.000Z" },
    ],
  })
  const { results } = tickEnergy(dir)
  const busy = results.find((x) => x.name === "busy")
  // 3 unique sessions → floor(log2(4) * 10) = 20 boost, capped at 100.
  assert.equal(busy.newEnergy, 100)
  const idle = results.find((x) => x.name === "idle")
  assert.equal(idle.newEnergy, 0)
  assert.equal(readEnergy(dir, "busy"), 100)
  assert.equal(readEnergy(dir, "idle"), 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test("tick is idempotent within a day (second same-day run skips)", () => {
  const dir = mkWorkspace()
  writeCapability(dir, "alpha", 50)
  markCapabilityUsed(dir, "alpha", "ses_1")
  const first = tickEnergy(dir)
  assert.equal(first.skipped, false)
  const second = tickEnergy(dir)
  assert.equal(second.skipped, true)
  assert.equal(readEnergy(dir, "alpha"), 60) // unchanged by the skipped run
  fs.rmSync(dir, { recursive: true, force: true })
})

test("tick skips when the usage log is empty (nothing to do)", () => {
  const dir = mkWorkspace()
  writeCapability(dir, "alpha", 50)
  const { skipped } = tickEnergy(dir)
  assert.equal(skipped, true)
  assert.equal(readEnergy(dir, "alpha"), 50)
  fs.rmSync(dir, { recursive: true, force: true })
})

test("markCapabilityUsed dedupes by (capability, sessionId)", () => {
  const dir = mkWorkspace()
  markCapabilityUsed(dir, "alpha", "ses_1")
  markCapabilityUsed(dir, "alpha", "ses_1")
  markCapabilityUsed(dir, "alpha", "ses_2")
  const state = readHiveState(dir)
  assert.equal(state.usageLog.length, 2)
  fs.rmSync(dir, { recursive: true, force: true })
})

test("tick warns below the dissolve threshold", () => {
  const dir = mkWorkspace()
  writeCapability(dir, "fading", 12)
  writeHiveState(dir, { lastTick: "2020-01-01T00:00:00.000Z", usageLog: [{ capability: "other", sessionId: "ses_1", timestamp: "2020-01-01T00:00:00.000Z" }] })
  const { warnings } = tickEnergy(dir)
  assert.deepEqual(warnings.map((w) => w.name), ["fading"])
  assert.equal(readEnergy(dir, "fading"), 2)
  fs.rmSync(dir, { recursive: true, force: true })
})

test("legacy hive-state format migrates (usedCapabilities → empty usageLog)", () => {
  const dir = mkWorkspace()
  fs.mkdirSync(path.join(dir, ".opencode/agents"), { recursive: true })
  fs.writeFileSync(
    path.join(dir, ".opencode/agents/hive-state.json"),
    JSON.stringify({ lastTick: "2020-01-01T00:00:00.000Z", usedCapabilities: ["alpha"] })
  )
  const state = readHiveState(dir)
  assert.deepEqual(state, { lastTick: "2020-01-01T00:00:00.000Z", usageLog: [] })
  fs.rmSync(dir, { recursive: true, force: true })
})
