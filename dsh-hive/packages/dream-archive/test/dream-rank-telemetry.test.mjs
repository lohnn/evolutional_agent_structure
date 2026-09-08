import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { rankArtifacts } from "../dist/lib/dream-rank.js"
import { writeArtifact } from "../dist/lib/dream-artifacts.js"
import { recordSurfacedEvent } from "../dist/lib/dream-telemetry.js"

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-rank-test-"))
  for (const sub of ["insights", "warnings", "songlines", "shadows"]) {
    fs.mkdirSync(path.join(dir, ".opencode/dreams/artifacts", sub), { recursive: true })
  }
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function seed() {
  // 8 insights, 1 warning, 1 shadow — enough that floors matter at small k
  for (let i = 1; i <= 8; i++) {
    writeArtifact(dir, {
      type: "insight", insight_id: `I-00${i}`, source_dream: "DRM-001",
      confidence: 0.8, domain_tags: i === 1 ? ["dsh"] : [],
      content: i === 1 ? "dsh tool registration defines validation" : `filler topic ${i} unrelated`,
      actionable: true, previously_invisible_because: "p",
    })
  }
  writeArtifact(dir, {
    type: "warning", warning_id: "W-001", source_dream: "DRM-001",
    confidence: 0.9, justifiable: "FULLY", content: "dsh register never validates args",
    trigger_conditions: ["porting dsh tool schemas"],
  })
  writeArtifact(dir, {
    type: "shadow", shadow_id: "SHADOW-001", source_dream: "DRM-001",
    weight: "MEDIUM", content: "lost dsh context", location: "l", nature: "n",
    severity: "s", trigger_conditions: ["when dsh breaks"], resolution_hint: "r",
  })
}

describe("rankArtifacts (token-v1 backend)", () => {
  it("ranks the topically-matching insight first, reports backend + total", () => {
    seed()
    const r = rankArtifacts(dir, "dsh registration validation")
    assert.equal(r.backend, "token-v1")
    assert.equal(r.total, 10)
    assert.equal(r.results[0].id, "I-001")
  })

  it("shadow/warning floors guarantee slots within small k", () => {
    seed()
    const r = rankArtifacts(dir, "unrelated filler", { k: 3 })
    const ids = r.results.map((x) => x.id)
    assert.ok(ids.includes("W-001"), "warning floor slot missing")
    assert.ok(ids.includes("SHADOW-001"), "shadow floor slot missing")
    assert.ok(r.results.find((x) => x.id === "W-001").flags.includes("floor:warning"))
  })

  it("trigger-match bypasses score for warnings/shadows", () => {
    seed()
    const r = rankArtifacts(dir, "porting dsh tool schemas carefully", { k: 2 })
    const w = r.results.find((x) => x.id === "W-001")
    assert.ok(w, "trigger-matched warning must be included even past k")
    assert.ok(w.flags.includes("trigger-match"))
  })

  it("lifecycle flags surface (stale, superseded_by)", () => {
    seed()
    fs.appendFileSync(
      path.join(dir, ".opencode/dreams/artifacts/insights/I-001.yaml"),
      "stale: true\n",
      "utf8"
    )
    const r = rankArtifacts(dir, "dsh registration")
    assert.ok(r.results.find((x) => x.id === "I-001").flags.includes("stale"))
  })

  it("type restriction disables floors for excluded types", () => {
    seed()
    const r = rankArtifacts(dir, "dsh", { k: 3, types: ["insight"] })
    assert.ok(r.results.every((x) => x.type === "insight"))
  })

  it("empty archive returns no results", () => {
    const r = rankArtifacts(dir, "anything")
    assert.equal(r.results.length, 0)
    assert.equal(r.total, 0)
  })
})

describe("recordSurfacedEvent", () => {
  it("appends one jsonl line per event, creating dirs, never throwing", () => {
    recordSurfacedEvent(dir, "ses_1", "rank", "q text", ["I-001", "W-001"], 10)
    recordSurfacedEvent(dir, "ses_1", "query", "ids:I-001", ["I-001"], 1)
    const f = path.join(dir, ".opencode/dreams/index/telemetry/ses_1.jsonl")
    const lines = fs.readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l))
    assert.equal(lines.length, 2)
    assert.equal(lines[0].tool, "rank")
    assert.equal(lines[0].surfaced_count, 2)
    assert.equal(lines[0].total, 10)
    assert.equal(lines[1].query, "ids:I-001")
  })

  it("caps surfaced ids and query length", () => {
    recordSurfacedEvent(dir, "s", "rank", "q".repeat(500), Array.from({ length: 80 }, (_, i) => `I-${i}`), 100)
    const f = path.join(dir, ".opencode/dreams/index/telemetry/s.jsonl")
    const ev = JSON.parse(fs.readFileSync(f, "utf8").trim())
    assert.equal(ev.surfaced.length, 50)
    assert.equal(ev.surfaced_count, 80)
    assert.equal(ev.query.length, 300)
  })
})
