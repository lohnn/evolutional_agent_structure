import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import {
  appendPainpoint,
  listPainpoints,
  formatPainpointsForReview,
  harvestPainpoints,
  formatPainpointsForHarvest,
} from "../dist/lib/painpoint-journal.js"

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "painpoint-test-"))
  fs.mkdirSync(path.join(dir, ".opencode/painpoints/raw"), { recursive: true })
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe("appendPainpoint", () => {
  it("writes per-session logs with worker attribution inside the entry", () => {
    appendPainpoint(dir, "hive-infra", "ses_1", "tool X is slow", "running Y, 3 cycles")
    appendPainpoint(dir, "coordinator", "ses_1", "second friction", "more context")
    const f = path.join(dir, ".opencode/painpoints/raw/ses_1.md")
    const content = fs.readFileSync(f, "utf8")
    assert.ok(content.includes("hive-infra (ses_1)"))
    assert.ok(content.includes("**Problem:** tool X is slow"))
    assert.ok(content.includes("**Context:** running Y, 3 cycles"))
    assert.ok(content.includes("second friction"))
    // no solution field anywhere by construction
    assert.ok(!content.toLowerCase().includes("solution"))
  })

  it("sanitises path separators in the session id", () => {
    appendPainpoint(dir, "w", "a/b", "p", "c")
    assert.ok(fs.existsSync(path.join(dir, ".opencode/painpoints/raw/a_b.md")))
  })
})

describe("listPainpoints", () => {
  it("reads all open logs sorted, read-only", () => {
    appendPainpoint(dir, "w1", "ses_b", "pb", "cb")
    appendPainpoint(dir, "w2", "ses_a", "pa", "ca")
    const files = listPainpoints(dir)
    assert.equal(files.length, 2)
    assert.deepEqual(files.map((f) => f.sessionID), ["ses_a", "ses_b"])
    // read-only: files still there
    assert.equal(listPainpoints(dir).length, 2)
  })

  it("empty dir → empty list with the empty-state message", () => {
    assert.equal(listPainpoints(dir).length, 0)
    assert.equal(formatPainpointsForReview([]), "No open pain points. The harness/workflow friction log is empty.")
  })
})

describe("harvestPainpoints", () => {
  it("reads + archives atomically when clearing, peek leaves in place", () => {
    appendPainpoint(dir, "w", "ses_1", "p1", "c1")
    const peeked = harvestPainpoints(dir, false)
    assert.equal(peeked.length, 1)
    assert.ok(fs.existsSync(path.join(dir, ".opencode/painpoints/raw/ses_1.md")))
    const harvested = harvestPainpoints(dir, true)
    assert.equal(harvested.length, 1)
    assert.ok(harvested[0].content.includes("p1"))
    const rawLeft = fs.readdirSync(path.join(dir, ".opencode/painpoints/raw")).filter((f) => f.endsWith(".md"))
    assert.equal(rawLeft.length, 0)
    assert.equal(fs.readdirSync(path.join(dir, ".opencode/painpoints/raw/.harvested")).length, 1)
  })
})

describe("formatPainpointsForHarvest", () => {
  it("marks entries as harness-fix candidates, not dream feedstock", () => {
    const out = formatPainpointsForHarvest([{ sessionID: "ses_1", content: "body" }])
    assert.ok(out.includes("HARNESS-FIX CANDIDATES"))
    assert.ok(out.includes("## Session: `ses_1`"))
  })
})
