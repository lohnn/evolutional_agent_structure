import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import {
  parseArtifact,
  serializeArtifact,
  writeArtifact,
  readArtifact,
  scanArtifacts,
  queryArtifacts,
  listArtifacts,
  nextArtifactId,
  idToType,
  pathForId,
  appendFieldsToArtifact,
  detectDuplicateCandidates,
} from "../dist/lib/dream-artifacts.js"

// Real archive copy — the format's ground truth. Round-tripping every file
// through parse→serialize must be byte-identical where the serializer owns
// the whole file shape (no appended lifecycle fields).
const REAL_ARCHIVE = "/workspace/.opencode/dreams"

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-artifacts-test-"))
  for (const sub of ["insights", "warnings", "songlines", "shadows"]) {
    fs.mkdirSync(path.join(dir, ".opencode/dreams/artifacts", sub), { recursive: true })
  }
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const TYPE_DIRS = { insight: "insights", warning: "warnings", songline: "songlines", shadow: "shadows" }

describe("real-archive round-trip (byte identity)", () => {
  it("parse→serialize of every real artifact is byte-identical for serializer-owned files", () => {
    let total = 0
    let identical = 0
    const diverged = []
    for (const [type, sub] of Object.entries(TYPE_DIRS)) {
      const subdir = path.join(REAL_ARCHIVE, "artifacts", sub)
      for (const f of fs.readdirSync(subdir).filter((f) => f.endsWith(".yaml"))) {
        total++
        const original = fs.readFileSync(path.join(subdir, f), "utf8")
        // Skip files with appended lifecycle fields (stale/superseded_by/
        // resolution_note) — parseArtifact keeps them, but the serializers
        // don't own them, so a plain re-serialize legitimately drops them
        // (they're append-only; resolution_note is hand-appended by dreamtime
        // consolidations, e.g. I-018 in DRM-033).
        if (/^(stale|superseded_by|supersede_reason|stale_reason|resolution_note):/m.test(original)) continue
        const reserialized = serializeArtifact(parseArtifact(original, type))
        if (reserialized === original) identical++
        else diverged.push(`${sub}/${f}`)
      }
    }
    assert.ok(total > 80, `expected 80+ real artifacts, scanned ${total}`)
    assert.deepEqual(diverged, [], `${identical}/${total} identical; diverged: ${diverged.slice(0, 5).join(", ")}`)
  })

  it("parse→serialize is STABLE on second application for files with lifecycle fields", () => {
    // stale/superseded files: first serialize drops appended fields, second
    // must equal the first (idempotent normalization).
    let checked = 0
    for (const [type, sub] of Object.entries(TYPE_DIRS)) {
      const subdir = path.join(REAL_ARCHIVE, "artifacts", sub)
      for (const f of fs.readdirSync(subdir).filter((f) => f.endsWith(".yaml"))) {
        const original = fs.readFileSync(path.join(subdir, f), "utf8")
        if (!/^(stale|superseded_by|supersede_reason|stale_reason|resolution_note):/m.test(original)) continue
        const once = serializeArtifact(parseArtifact(original, type))
        const twice = serializeArtifact(parseArtifact(once, type))
        assert.equal(twice, once, `${sub}/${f} not stable on re-serialize`)
        checked++
      }
    }
    assert.ok(checked >= 1, "expected at least one lifecycle-field file in the real archive")
  })
})

describe("nextArtifactId", () => {
  it("assigns max+1 zero-padded, per type, including multi-char prefixes", () => {
    assert.equal(nextArtifactId(dir, "insight"), "I-001")
    fs.writeFileSync(path.join(dir, ".opencode/dreams/artifacts/insights/I-007.yaml"), "insight_id: I-007\n", "utf8")
    assert.equal(nextArtifactId(dir, "insight"), "I-008")
    assert.equal(nextArtifactId(dir, "shadow"), "SHADOW-001")
  })
})

describe("writeArtifact + readArtifact round-trip", () => {
  it("insight with tricky quoting survives byte-exact", () => {
    const a = {
      type: "insight",
      insight_id: "I-099",
      source_dream: "DRM-042",
      confidence: 0.85,
      domain_tags: ["yaml", "round-trip"],
      content: 'He said "byte-identical" — back\\slash and "quotes" must survive.',
      actionable: true,
      previously_invisible_because: "nobody diffed the files",
    }
    const p = writeArtifact(dir, a)
    assert.deepEqual(readArtifact(dir, "insight", "I-099"), a)
    // And serialize→parse is the identity on the file bytes
    const raw = fs.readFileSync(p, "utf8")
    assert.equal(serializeArtifact(parseArtifact(raw, "insight")), raw)
  })

  it("songline narrative block scalar round-trips multi-line with blank lines", () => {
    const a = {
      type: "songline",
      songline_id: "SNG-099",
      source_dream: "DRM-042",
      domain_tags: [],
      transfer_rating: 0.7,
      narrative: "Line one.\n\nLine three (blank above).\n",
      encoded_principles: ["first", "second"],
    }
    writeArtifact(dir, a)
    assert.deepEqual(readArtifact(dir, "songline", "SNG-099"), a)
  })

  it("shadow with all fields round-trips", () => {
    const a = {
      type: "shadow",
      shadow_id: "SHADOW-099",
      source_dream: "DRM-042",
      weight: "HIGH",
      content: "the lost knowledge",
      location: "somewhere",
      nature: "a decision",
      severity: "bad",
      trigger_conditions: ["when x", "when y"],
      resolution_hint: "vague memory",
    }
    writeArtifact(dir, a)
    assert.deepEqual(readArtifact(dir, "shadow", "SHADOW-099"), a)
  })
})

describe("queryArtifacts", () => {
  beforeEach(() => {
    writeArtifact(dir, {
      type: "insight", insight_id: "I-001", source_dream: "DRM-001",
      confidence: 0.9, domain_tags: ["alpha"], content: "c1", actionable: true,
      previously_invisible_because: "p",
    })
    writeArtifact(dir, {
      type: "warning", warning_id: "W-001", source_dream: "DRM-001",
      confidence: 0.4, justifiable: "FULLY", content: "c2", trigger_conditions: ["t"],
    })
  })

  it("ids exact-fetch bypasses other filters and always returns full", () => {
    const r = queryArtifacts(dir, { ids: ["I-001", "W-001", "I-404"], min_confidence: 0.99 })
    assert.equal(r.mode, "full")
    assert.deepEqual(r.full.map((e) => e.id), ["I-001", "W-001"])
  })

  it("min_confidence filters insights but never shadows", () => {
    writeArtifact(dir, {
      type: "shadow", shadow_id: "SHADOW-001", source_dream: "DRM-001",
      weight: "LOW", content: "c3", location: "l", nature: "n", severity: "s",
      trigger_conditions: [], resolution_hint: "r",
    })
    const r = queryArtifacts(dir, { min_confidence: 0.8 })
    assert.deepEqual(r.full.map((e) => e.id).sort(), ["I-001", "SHADOW-001"])
  })

  it("domain_tags filter matches only tagged types", () => {
    const r = queryArtifacts(dir, { domain_tags: ["alpha"] })
    assert.deepEqual(r.full.map((e) => e.id), ["I-001"])
  })
})

describe("idToType / pathForId", () => {
  it("resolves all four prefixes and refuses garbage", () => {
    assert.equal(idToType("I-001"), "insight")
    assert.equal(idToType("W-001"), "warning")
    assert.equal(idToType("SNG-001"), "songline")
    assert.equal(idToType("SHADOW-001"), "shadow")
    assert.equal(idToType("X-001"), null)
    assert.equal(pathForId(dir, "W-003"), path.join(dir, ".opencode/dreams/artifacts/warnings/W-003.yaml"))
  })
})

describe("listArtifacts (cheap index)", () => {
  it("extracts id/source_dream/summary without full parse, filters by source_dream", () => {
    writeArtifact(dir, {
      type: "insight", insight_id: "I-010", source_dream: "DRM-010",
      confidence: 0.5, domain_tags: [], content: "x".repeat(200), actionable: false,
      previously_invisible_because: "p",
    })
    const all = listArtifacts(dir)
    assert.equal(all.length, 1)
    assert.equal(all[0].id, "I-010")
    assert.equal(all[0].source_dream, "DRM-010")
    assert.ok(all[0].summary.length <= 80)
    assert.equal(listArtifacts(dir, { source_dream: "DRM-999" }).length, 0)
  })
})

describe("appendFieldsToArtifact (supersede/mark-stale path)", () => {
  it("appends fields preserving existing bytes exactly", () => {
    const p = writeArtifact(dir, {
      type: "warning", warning_id: "W-050", source_dream: "DRM-003",
      confidence: 0.7, justifiable: "PARTIALLY", content: "c", trigger_conditions: [],
    })
    const before = fs.readFileSync(p, "utf8")
    appendFieldsToArtifact(p, [
      { key: "superseded_by", value: "W-051" },
      { key: "stale", value: true },
      { key: "supersede_reason", value: 'replaced by "better"' },
    ])
    const after = fs.readFileSync(p, "utf8")
    assert.ok(after.startsWith(before.replace(/\n$/, "")))
    assert.ok(after.includes('superseded_by: "W-051"'))
    assert.ok(after.includes("stale: true"))
    assert.ok(after.includes('supersede_reason: "replaced by \\"better\\""'))
  })
})

describe("detectDuplicateCandidates", () => {
  it("finds a high-similarity pair and respects the band", () => {
    // Tags and content must be LEXICALLY DISJOINT here: detectDuplicateCandidates
    // averages tag-Jaccard with content-token-Jaccard, and shared vocabulary
    // across the two channels would blur the band arithmetic.
    const shared = "alpha beta gamma delta epsilon zeta eta theta"
    for (const [id, sd] of [["I-001", "DRM-001"], ["I-002", "DRM-005"]]) {
      writeArtifact(dir, {
        type: "insight", insight_id: id, source_dream: sd,
        confidence: id === "I-001" ? 0.9 : 0.5, domain_tags: ["sametopic"],
        content: shared, actionable: true, previously_invisible_because: "p",
      })
    }
    writeArtifact(dir, {
      type: "insight", insight_id: "I-003", source_dream: "DRM-002",
      confidence: 0.1, domain_tags: ["xyzuvw"], content: "completely different words here",
      actionable: false, previously_invisible_because: "q",
    })
    const cands = detectDuplicateCandidates(dir, 0.5)
    assert.equal(cands.length, 1)
    assert.deepEqual([cands[0].idA, cands[0].idB].sort(), ["I-001", "I-002"])
    assert.equal(cands[0].confidence_delta, 0.4)
    assert.equal(cands[0].dream_distance, 4)
    // The identical pair scores exactly 1.0 — excluded only above the band.
    assert.equal(detectDuplicateCandidates(dir, 0.5, 0.9).length, 0)
  })
})
