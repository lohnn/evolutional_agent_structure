import { describe, test, expect, beforeEach, afterEach } from "bun:test"
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
  historyDreamPath,
  type DreamState,
} from "../src/lib/dream-state.ts"

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-state-test-"))
  fs.mkdirSync(path.join(dir, ".opencode/dreams/active"), { recursive: true })
  fs.mkdirSync(path.join(dir, ".opencode/dreams/history"), { recursive: true })
  fs.mkdirSync(path.join(dir, ".opencode/dreams/artifacts/insights"), { recursive: true })
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function baseIntent(over: Record<string, unknown> = {}) {
  return {
    depth: 2,
    intention: "test dream",
    intention_type: "CONSOLIDATION" as const,
    entry_time: "2026-08-11T00:00:00Z",
    project_context: "test",
    context_signals: { contradictions: 0, repetitions_detected: false, coherence: "HIGH" as const, threads_active: 1 },
    retain_high: [],
    retain_low: [],
    ...over,
  }
}

describe("pre_compaction lifecycle marker (WI-080)", () => {
  test("beginDream defaults to pre_compaction: false and writes the line", () => {
    const { dreamId, filePath } = beginDream(dir, baseIntent())
    const raw = fs.readFileSync(filePath, "utf8")
    expect(raw).toContain("# Lifecycle\npre_compaction: false")
    const state = readDreamState(filePath)
    expect(state.pre_compaction).toBe(false)
    expect(state.dream_id).toBe(dreamId)
  })

  test("beginDream with pre_compaction: true writes true and it round-trips", () => {
    const { filePath } = beginDream(dir, baseIntent({ pre_compaction: true }))
    const raw = fs.readFileSync(filePath, "utf8")
    expect(raw).toContain("pre_compaction: true")
    expect(readDreamState(filePath).pre_compaction).toBe(true)
  })

  test("serialize → parse round-trips pre_compaction both ways", () => {
    const base = parseDreamState(serializeDreamState({
      ...baseIntent(),
      dream_id: "DRM-001",
      exit_time: null,
      status: "DREAMING",
      pre_compaction: true,
      insights: [],
      warnings: [],
      songlines: [],
      shadows: [],
    } as DreamState))
    expect(base.pre_compaction).toBe(true)
    const other = parseDreamState(serializeDreamState({
      ...baseIntent(),
      dream_id: "DRM-001",
      exit_time: null,
      status: "DREAMING",
      pre_compaction: false,
      insights: [],
      warnings: [],
      songlines: [],
      shadows: [],
    } as DreamState))
    expect(other.pre_compaction).toBe(false)
  })

  test("an OLD dream file without the field parses with pre_compaction falsy (treated as end-of-work)", () => {
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
    expect(state.pre_compaction).toBeFalsy()
    expect(state.status).toBe("COMPLETE")
  })

  test("completeDream PRESERVES the marker and appends artifacts without reserializing (I-049)", () => {
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
    expect(result.dreamId).toBe(dreamId)
    expect(fs.existsSync(activeDreamPath(dir, dreamId))).toBe(false)

    const hist = fs.readFileSync(historyDreamPath(dir, dreamId), "utf8")
    // completion scalars rewritten in place
    expect(hist).toContain("exit_time: 2026-08-11T01:00:00Z")
    expect(hist).toContain("status: COMPLETE")
    // the marker, the foreign field, and the comment all survived
    expect(hist).toContain("pre_compaction: true")
    expect(hist).toContain("future_field: some-value")
    expect(hist).toContain("# a hand note")
    // Nothing was reserialized: apart from the two rewritten scalar lines and the
    // four appended flow-array lines, the pre-completion bytes are intact —
    // the planted foreign content sits between the begin-written body and the
    // appended arrays, exactly where it was written.
    const rewritten = rawBefore
      .replace("exit_time: null", "exit_time: 2026-08-11T01:00:00Z")
      .replace("status: DREAMING", "status: COMPLETE")
    expect(hist.startsWith(rewritten.replace(/\n$/, "\n"))).toBe(true)
    // appended flow arrays parse as the linked artifacts
    const state = readDreamState(historyDreamPath(dir, dreamId))
    expect(state.insights).toEqual(["I-001"])
    expect(state.pre_compaction).toBe(true)
    expect(state.exit_time).toBe("2026-08-11T01:00:00Z")
    expect(state.status).toBe("COMPLETE")
  })

  test("completeDream on an unflagged dream writes pre_compaction: false through to history", () => {
    const { dreamId } = beginDream(dir, baseIntent())
    completeDream(dir, "2026-08-11T02:00:00Z", [])
    const hist = fs.readFileSync(historyDreamPath(dir, dreamId), "utf8")
    expect(hist).toContain("pre_compaction: false")
    expect(readDreamState(historyDreamPath(dir, dreamId)).pre_compaction).toBe(false)
  })
})
