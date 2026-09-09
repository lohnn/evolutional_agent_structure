import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import {
  appendResidue,
  harvestJournals,
  formatHarvestForDreamer,
} from "../dist/lib/dream-journal.js"

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-journal-test-"))
  fs.mkdirSync(path.join(dir, ".opencode/dreams/raw"), { recursive: true })
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe("appendResidue", () => {
  it("appends per (capability, session) with timestamp + optional kind tag", () => {
    appendResidue(dir, "hive-infra", "ses_1", "first note", "insight")
    appendResidue(dir, "hive-infra", "ses_1", "second note")
    appendResidue(dir, "other-cap", "ses_2", "someone else")
    const f = path.join(dir, ".opencode/dreams/raw/hive-infra.ses_1.md")
    const content = fs.readFileSync(f, "utf8")
    assert.ok(content.includes("## 20") && content.includes("[insight]"))
    assert.ok(content.includes("first note") && content.includes("second note"))
    assert.ok(fs.existsSync(path.join(dir, ".opencode/dreams/raw/other-cap.ses_2.md")))
  })

  it("sanitises path separators in the session id", () => {
    appendResidue(dir, "cap", "a/b\\c", "note")
    assert.ok(fs.existsSync(path.join(dir, ".opencode/dreams/raw/cap.a_b_c.md")))
  })
})

describe("harvestJournals", () => {
  it("reads all journals, attributes by first-dot, archives with timestamp when clearing", () => {
    appendResidue(dir, "hive-infra", "ses_aaa", "note A")
    appendResidue(dir, "builder", "ses_bbb", "note B")
    const entries = harvestJournals(dir, true)
    assert.equal(entries.length, 2)
    const byCap = Object.fromEntries(entries.map((e) => [e.capability, e.content]))
    assert.ok(byCap["hive-infra"].includes("note A"))
    assert.ok(byCap["builder"].includes("note B"))
    // raw dir cleared, harvested archive holds the files
    const raw = fs.readdirSync(path.join(dir, ".opencode/dreams/raw")).filter((f) => f.endsWith(".md"))
    assert.equal(raw.length, 0)
    const harvested = fs.readdirSync(path.join(dir, ".opencode/dreams/raw/.harvested"))
    assert.equal(harvested.length, 2)
    assert.ok(harvested.every((f) => f.endsWith(".md")))
  })

  it("peek (clear=false) leaves files in place", () => {
    appendResidue(dir, "cap", "ses_x", "peek note")
    const entries = harvestJournals(dir, false)
    assert.equal(entries.length, 1)
    assert.ok(fs.existsSync(path.join(dir, ".opencode/dreams/raw/cap.ses_x.md")))
  })

  it("empty raw dir harvests to nothing", () => {
    assert.equal(harvestJournals(dir, true).length, 0)
    assert.equal(formatHarvestForDreamer([]), "No dream residue found. Journals are empty.")
  })

  it("legacy <capability>.md filenames attribute with empty session", () => {
    fs.writeFileSync(path.join(dir, ".opencode/dreams/raw/legacy-cap.md"), "old note\n", "utf8")
    const entries = harvestJournals(dir, false)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].capability, "legacy-cap")
  })
})

describe("formatHarvestForDreamer", () => {
  it("renders a per-capability block", () => {
    const out = formatHarvestForDreamer([{ capability: "cap", content: "body" }])
    assert.ok(out.includes("# Dream Residue Harvest"))
    assert.ok(out.includes("## Capability: `cap`"))
    assert.ok(out.includes("body"))
  })
})
