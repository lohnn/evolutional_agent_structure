import { describe, test as it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import {
  beginDream,
  completeDream,
  readDreamState,
  serializeDreamState,
  parseDreamState,
  activeDreamPath,
  historyDreamPath } from "../dist/lib/dream-state.js"

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-state-test-"))
  fs.mkdirSync(path.join(dir, ".opencode/dreams/active"), { recursive: true })
  fs.mkdirSync(path.join(dir, ".opencode/dreams/history"), { recursive: true })
  fs.mkdirSync(path.join(dir, ".opencode/dreams/artifacts/insights"), { recursive: true })
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function baseIntent(over = {}) {
  return {
    depth: 2,
    intention: "test dream",
    intention_type: "CONSOLIDATION",
    entry_time: "2026-08-11T00:00:00Z",
    project_context: "test",
    context_signals: { contradictions: 0, repetitions_detected: false, coherence: "HIGH", threads_active: 1 },
    retain_high: [],
    retain_low: [],
    ...over }
}

describe("pre_compaction lifecycle marker (WI-080)", () => {
  it("beginDream defaults to pre_compaction: false and writes the line", () => {
    const { dreamId, filePath } = beginDream(dir, baseIntent())
    const raw = fs.readFileSync(filePath, "utf8")
    assert.ok(raw.includes("# Lifecycle\npre_compaction: false"))
    const state = readDreamState(filePath)
    assert.equal(state.pre_compaction, false)
    assert.equal(state.dream_id, dreamId)
  })

  it("beginDream with pre_compaction: true writes true and it round-trips", () => {
    const { filePath } = beginDream(dir, baseIntent({ pre_compaction: true }))
    const raw = fs.readFileSync(filePath, "utf8")
    assert.ok(raw.includes("pre_compaction: true"))
    assert.equal(readDreamState(filePath).pre_compaction, true)
  })

  it("serialize → parse round-trips pre_compaction both ways", () => {
    const base = parseDreamState(serializeDreamState({
      ...baseIntent(),
      dream_id: "DRM-001",
      exit_time: null,
      status: "DREAMING",
      pre_compaction: true,
      insights: [],
      warnings: [],
      songlines: [],
      shadows: [] }))
    assert.equal(base.pre_compaction, true)
    const other = parseDreamState(serializeDreamState({
      ...baseIntent(),
      dream_id: "DRM-001",
      exit_time: null,
      status: "DREAMING",
      pre_compaction: false,
      insights: [],
      warnings: [],
      songlines: [],
      shadows: [] }))
    assert.equal(other.pre_compaction, false)
  })

  it("an OLD dream file without the field parses with pre_compaction falsy (treated as end-of-work)", () => {
    // Hand-write a legacy-format DRM (no Lifecycle section at all).
    const legacy = [
      "dream_id: DRM-900",
      "depth: 2",
      'intention: "legacy"',
      "intention_type: CONSOLIDATION",
      "entry_time: 2026-06-01T08:05:00Z",
      "exit_time: 2026-06-01T08:10:00Z",
      "status: COMPLETE",
      'project_context: "legacy"',
      "",
      "# Pre-dream state",
      "context_signals:",
      "  contradictions: 0",
      "  repetitions_detected: false",
      "  coherence: HIGH",
      "  threads_active: 1",
      "",
      "insights: [I-044]",
      "warnings: []",
      "songlines: []",
      "shadows: []",
      "",
    ].join("\n")
    fs.writeFileSync(historyDreamPath(dir, "DRM-900"), legacy, "utf8")
    const state = readDreamState(historyDreamPath(dir, "DRM-900"))
    assert.ok(!(state.pre_compaction))
    assert.equal(state.status, "COMPLETE")
  })

  it("completeDream PRESERVES the marker and appends artifacts without reserializing (I-049)", () => {
    const { dreamId, filePath } = beginDream(dir, baseIntent({ pre_compaction: true }))
    // Plant a foreign field a serializer round-trip would erase (the I-049 trap),
    // plus a comment, to prove completion never rewrites what it doesn't own.
    fs.appendFileSync(filePath, "future_field: some-value\n# a hand note\n")
    const rawBefore = fs.readFileSync(filePath, "utf8")

    // A real artifact file so it validates present.
    fs.writeFileSync(
      path.join(dir, ".opencode/dreams/artifacts/insights/I-001.yaml"),
      "insight_id: I-001\nsource_dream: " + dreamId + "\n",
      "utf8"
    )

    const result = completeDream(dir, "2026-08-11T01:00:00Z", ["I-001"])
    assert.equal(result.dreamId, dreamId)
    assert.equal(fs.existsSync(activeDreamPath(dir, dreamId)), false)

    const hist = fs.readFileSync(historyDreamPath(dir, dreamId), "utf8")
    // completion scalars rewritten in place
    assert.ok(hist.includes("exit_time: 2026-08-11T01:00:00Z"))
    assert.ok(hist.includes("status: COMPLETE"))
    // the marker, the foreign field, and the comment all survived
    assert.ok(hist.includes("pre_compaction: true"))
    assert.ok(hist.includes("future_field: some-value"))
    assert.ok(hist.includes("# a hand note"))
    // Nothing was reserialized: apart from the two rewritten scalar lines and the
    // four appended flow-array lines, the pre-completion bytes are intact —
    // the planted foreign content sits between the begin-written body and the
    // appended arrays, exactly where it was written.
    const rewritten = rawBefore
      .replace("exit_time: null", "exit_time: 2026-08-11T01:00:00Z")
      .replace("status: DREAMING", "status: COMPLETE")
    assert.equal(hist.startsWith(rewritten.replace(/\n$/, "\n")), true)
    // appended flow arrays parse as the linked artifacts
    const state = readDreamState(historyDreamPath(dir, dreamId))
    assert.deepEqual(state.insights, ["I-001"])
    assert.equal(state.pre_compaction, true)
    assert.equal(state.exit_time, "2026-08-11T01:00:00Z")
    assert.equal(state.status, "COMPLETE")
  })

  it("completeDream on an unflagged dream writes pre_compaction: false through to history", () => {
    const { dreamId } = beginDream(dir, baseIntent())
    completeDream(dir, "2026-08-11T02:00:00Z", [])
    const hist = fs.readFileSync(historyDreamPath(dir, dreamId), "utf8")
    assert.ok(hist.includes("pre_compaction: false"))
    assert.equal(readDreamState(historyDreamPath(dir, dreamId)).pre_compaction, false)
  })
})
