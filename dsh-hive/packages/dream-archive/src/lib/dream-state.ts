/**
 * Dream state (DRM) file IO: parse, serialize, next-ID assignment, and
 * active/history lifecycle helpers.
 *
 * DRM files live at:
 *   .opencode/dreams/active/DRM-NNN.yaml    — DREAMING
 *   .opencode/dreams/history/DRM-NNN.yaml   — COMPLETE
 *
 * Exact format (derived from real history/*.yaml files, DRM-013/014 as canon):
 *
 *   dream_id: DRM-014
 *   depth: 2
 *   intention: "..."
 *   intention_type: CONSOLIDATION
 *   entry_time: 2026-06-01T08:05:00Z
 *   exit_time: 2026-06-01T08:10:00Z      ← null when DREAMING
 *   status: COMPLETE                       ← DREAMING when active
 *   project_context: "..."
 *
 *   # Pre-dream state
 *   context_signals:
 *     contradictions: 0
 *     repetitions_detected: false
 *     coherence: HIGH
 *     threads_active: 1
 *
 *   # Compression priorities
 *   retain_high:
 *     - "..."
 *   retain_low:
 *     - "..."
 *
 *   # Lifecycle
 *   pre_compaction: false
 *
 *   # Artifacts (populated during dream)
 *   insights: [I-044, I-045]
 *   warnings: [W-018]
 *   songlines: [SNG-017]
 *   shadows: []
 *
 * Serialization rules (match real files exactly):
 *   - NO --- fencing
 *   - string scalar fields: double-quoted
 *   - integer / bool / unquoted-enum fields: unquoted
 *   - timestamps: unquoted ISO-8601
 *   - exit_time when null: literal `null`
 *   - context_signals: nested block mapping, 2-space indent, no quotes on values
 *   - retain_high / retain_low: block-sequence (dash-list) with quoted items
 *   - artifact ID arrays: flow arrays [A, B, C] or []
 *   - section comments at fixed positions (# Pre-dream state, etc.)
 */

import path from "path"
import fs from "fs"

// ── Types ─────────────────────────────────────────────────────────────────────

export type IntentionType =
  | "CONSOLIDATION"
  | "COMPARATIVE"
  | "ABSTRACTION"
  | "ANOMALY"
  | "INTEGRATION"

export type DreamStatus = "DREAMING" | "COMPLETE"
export type CoherenceLevel = "HIGH" | "MEDIUM" | "LOW"

export interface ContextSignals {
  contradictions: number
  repetitions_detected: boolean
  coherence: CoherenceLevel
  threads_active: number
}

export interface DreamState {
  dream_id: string
  depth: number
  intention: string
  intention_type: IntentionType
  entry_time: string
  exit_time: string | null
  status: DreamStatus
  project_context: string
  context_signals: ContextSignals
  retain_high: string[]
  retain_low: string[]
  /**
   * Lifecycle marker, set ONCE at hive_dream_begin and never mutated after
   * (scalar-set-at-begin semantics, I-190). `true` marks a mid-session,
   * pre-compaction consolidation: the dream completes and archives normally,
   * but its completion must NOT promote the owning session's board item to
   * done — work continues afterwards. Absent from older files; parse-side the
   * raw-record read yields undefined, which every consumer must treat as
   * false (an unflagged end-of-work dream keeps the historical close behavior).
   */
  pre_compaction: boolean
  insights: string[]
  warnings: string[]
  songlines: string[]
  shadows: string[]
}

// ── Paths ─────────────────────────────────────────────────────────────────────

export function dreamsBase(directory: string): string {
  return path.join(directory, ".opencode/dreams")
}

export function activeDreamPath(directory: string, id: string): string {
  return path.join(dreamsBase(directory), "active", `${id}.yaml`)
}

export function historyDreamPath(directory: string, id: string): string {
  return path.join(dreamsBase(directory), "history", `${id}.yaml`)
}

// ── Next-ID assignment ────────────────────────────────────────────────────────

/**
 * Scan BOTH active/ and history/ for DRM-NNN.yaml, return max+1.
 * Zero-padded to 3 digits (DRM-001, DRM-015, etc.).
 */
export function nextDreamId(directory: string): string {
  const base = dreamsBase(directory)
  let max = 0
  for (const subdir of ["active", "history"]) {
    const dir = path.join(base, subdir)
    let files: string[]
    try {
      files = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const f of files) {
      const m = f.match(/^DRM-(\d+)\.yaml$/)
      if (m) {
        const n = parseInt(m[1]!, 10)
        if (n > max) max = n
      }
    }
  }
  return `DRM-${String(max + 1).padStart(3, "0")}`
}

// ── Active dream discovery ────────────────────────────────────────────────────

/**
 * Return the filenames (without path) of all DRM-*.yaml files in active/.
 */
export function listActiveDreams(directory: string): string[] {
  const dir = path.join(dreamsBase(directory), "active")
  try {
    return fs.readdirSync(dir).filter((f) => f.match(/^DRM-\d+\.yaml$/))
  } catch {
    return []
  }
}

// ── Pre-compaction dream discovery (WI-081) ──────────────────────────────────

/** A completed pre-compaction dream, summarised for pointer digests. */
export interface PreCompactionDream {
  dreamId: string
  intention: string
  artifacts: string[]
}

/**
 * Scan dreams/history/ for COMPLETE DRMs carrying `pre_compaction: true`,
 * most recent first (by DRM number — ids are sequential, so numeric order IS
 * chronological order), capped at `limit` (default 5).
 *
 * Attribution heuristic (I-182): DRM files carry no owning-session field, so
 * this returns the workspace's most recent pre-compaction dreams rather than
 * "this session's". That is deliberate: the digest is a POINTER (ids + how to
 * re-query), not a mutation — showing one extra dream from a sibling session
 * is harmless, and exact attribution would require mining the opencode
 * transcript DB, which is over-engineering for a reminder. Never throws: an
 * unreadable/missing history dir or an unparseable file is skipped.
 */
export function recentPreCompactionDreams(directory: string, limit = 5): PreCompactionDream[] {
  const histDir = path.join(dreamsBase(directory), "history")
  let files: string[]
  try {
    files = fs.readdirSync(histDir).filter((f) => /^DRM-\d+\.yaml$/.test(f))
  } catch {
    return []
  }
  // Numeric descending (newest dream first)
  files.sort((a, b) => {
    const na = parseInt(a.match(/^DRM-(\d+)/)![1]!, 10)
    const nb = parseInt(b.match(/^DRM-(\d+)/)![1]!, 10)
    return nb - na
  })
  const out: PreCompactionDream[] = []
  for (const f of files) {
    if (out.length >= limit) break
    try {
      const d = readDreamState(path.join(histDir, f))
      if (d.pre_compaction !== true) continue
      out.push({
        dreamId: d.dream_id,
        intention: typeof d.intention === "string" ? d.intention : "",
        artifacts: [...(d.insights ?? []), ...(d.warnings ?? []), ...(d.songlines ?? []), ...(d.shadows ?? [])],
      })
    } catch {
      continue // unparseable file — skip, never break the scan
    }
  }
  return out
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a DRM YAML file (non-fenced).
 * Handles:
 *   - Scalar fields (quoted and unquoted)
 *   - Nested block mapping (context_signals)
 *   - Block-sequence arrays (retain_high, retain_low)
 *   - Flow arrays (insights, warnings, songlines, shadows)
 *   - Comments (# lines) and blank lines are skipped
 *   - `null` literal for exit_time
 */
export function parseDreamState(content: string): DreamState {
  const lines = content.split("\n")
  const raw: Record<string, unknown> = {}

  let i = 0
  while (i < lines.length) {
    const line = lines[i]!

    // Skip blank lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) { i++; continue }

    // Top-level key
    const topMatch = line.match(/^([a-zA-Z_]+):\s*(.*)$/)
    if (!topMatch || line.startsWith(" ") || line.startsWith("\t")) { i++; continue }

    const key = topMatch[1]!
    const rest = topMatch[2]!.trim()

    // Flow array: [A, B, C] or []
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1).trim()
      raw[key] = inner === "" ? [] : inner.split(",").map((s) => s.trim())
      i++
      continue
    }

    // Nested block mapping (context_signals): empty rest, next lines are "  key: value"
    if (rest === "") {
      // Peek: is the next non-blank line indented?
      let j = i + 1
      while (j < lines.length && lines[j]!.trim() === "") j++
      if (j < lines.length && (lines[j]!.startsWith("  ") || lines[j]!.startsWith("\t"))
          && lines[j]!.match(/^\s+[a-zA-Z_]+:\s/)) {
        // Nested mapping
        i++
        const nested: Record<string, unknown> = {}
        while (i < lines.length) {
          const nLine = lines[i]!
          if (nLine.trim() === "" || nLine.trim().startsWith("#")) { i++; continue }
          if (!nLine.startsWith(" ") && !nLine.startsWith("\t")) break
          const nm = nLine.match(/^\s+([a-zA-Z_]+):\s*(.*)$/)
          if (nm) {
            let v: string | number | boolean = nm[2]!.trim()
            if (v === "true") v = true
            else if (v === "false") v = false
            else {
              const num = Number(v)
              if (!isNaN(num) && v !== "") v = num
            }
            nested[nm[1]!] = v
          }
          i++
        }
        raw[key] = nested
        continue
      }

      // Empty rest, but next lines are block-sequence (  - "item")
      if (j < lines.length && lines[j]!.match(/^\s+-\s/)) {
        i++
        const items: string[] = []
        while (i < lines.length) {
          const bLine = lines[i]!
          if (bLine.trim() === "" || bLine.trim().startsWith("#")) { i++; continue }
          if (!bLine.match(/^\s+-\s/)) break
          const bm = bLine.match(/^\s+-\s+(.*)$/)
          if (bm) {
            const v = bm[1]!.trim()
            if (v.startsWith('"') && v.endsWith('"')) {
              items.push(v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\"))
            } else if (v.startsWith("'") && v.endsWith("'")) {
              items.push(v.slice(1, -1))
            } else {
              items.push(v)
            }
          }
          i++
        }
        raw[key] = items
        continue
      }

      // Empty rest with nothing parseable after — treat as empty string
      raw[key] = ""
      i++
      continue
    }

    // Null literal
    if (rest === "null") {
      raw[key] = null
      i++
      continue
    }

    // Scalar
    let val: string | number | boolean = rest
    if (rest.startsWith('"') && rest.endsWith('"')) {
      val = rest.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
    } else if (rest.startsWith("'") && rest.endsWith("'")) {
      val = rest.slice(1, -1)
    } else if (rest === "true") {
      val = true
    } else if (rest === "false") {
      val = false
    } else {
      const num = Number(rest)
      if (!isNaN(num) && rest !== "") val = num
    }
    raw[key] = val
    i++
  }

  return raw as unknown as DreamState
}

export function readDreamState(filePath: string): DreamState {
  const content = fs.readFileSync(filePath, "utf8")
  return parseDreamState(content)
}

// ── Serializer ────────────────────────────────────────────────────────────────

/** Double-quote a string, escaping internal double-quotes and backslashes. */
function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

/** Block-sequence array (dash-list with quoted items). */
function blockSeq(key: string, items: string[]): string {
  if (items.length === 0) return `${key}:`
  return `${key}:\n` + items.map((item) => `  - ${q(item)}`).join("\n")
}

/** Flow array. */
function flowArray(key: string, items: string[]): string {
  return `${key}: [${items.join(", ")}]`
}

export function serializeDreamState(d: DreamState): string {
  const exitTime = d.exit_time === null ? "null" : d.exit_time

  const sections: string[] = []

  // Header fields
  sections.push([
    `dream_id: ${d.dream_id}`,
    `depth: ${d.depth}`,
    `intention: ${q(d.intention)}`,
    `intention_type: ${d.intention_type}`,
    `entry_time: ${d.entry_time}`,
    `exit_time: ${exitTime}`,
    `status: ${d.status}`,
    `project_context: ${q(d.project_context)}`,
  ].join("\n"))

  // context_signals block
  const cs = d.context_signals
  sections.push([
    `# Pre-dream state`,
    `context_signals:`,
    `  contradictions: ${cs.contradictions}`,
    `  repetitions_detected: ${cs.repetitions_detected}`,
    `  coherence: ${cs.coherence}`,
    `  threads_active: ${cs.threads_active}`,
  ].join("\n"))

  // retain blocks
  sections.push([
    `# Compression priorities`,
    blockSeq("retain_high", d.retain_high),
    blockSeq("retain_low", d.retain_low),
  ].join("\n"))

  // Lifecycle marker (set at begin, never mutated after)
  sections.push([
    `# Lifecycle`,
    `pre_compaction: ${d.pre_compaction === true}`,
  ].join("\n"))

  // artifact arrays
  sections.push([
    `# Artifacts (populated during dream)`,
    flowArray("insights", d.insights),
    flowArray("warnings", d.warnings),
    flowArray("songlines", d.songlines),
    flowArray("shadows", d.shadows),
  ].join("\n"))

  return sections.join("\n\n") + "\n"
}

// ── Lifecycle: begin ──────────────────────────────────────────────────────────

export interface BeginResult {
  dreamId: string
  filePath: string
}

export function beginDream(directory: string, state: Omit<DreamState, "dream_id" | "exit_time" | "status" | "insights" | "warnings" | "songlines" | "shadows" | "pre_compaction"> & { pre_compaction?: boolean }): BeginResult {
  const id = nextDreamId(directory)
  const dream: DreamState = {
    ...state,
    dream_id: id,
    exit_time: null,
    status: "DREAMING",
    pre_compaction: state.pre_compaction ?? false,
    insights: [],
    warnings: [],
    songlines: [],
    shadows: [],
  }
  const filePath = activeDreamPath(directory, id)
  fs.writeFileSync(filePath, serializeDreamState(dream), "utf8")
  return { dreamId: id, filePath }
}

// ── Lifecycle: complete ───────────────────────────────────────────────────────

export interface CompleteResult {
  dreamId: string
  historyPath: string
  linkedArtifacts: {
    insights: string[]
    warnings: string[]
    songlines: string[]
    shadows: string[]
  }
  missingArtifacts: string[]
}

/**
 * Rewrite the two top-level scalar lines completion mutates (`exit_time`,
 * `status`) IN PLACE within the file's raw text. Both are written by
 * beginDream as single unindented `key: value` lines, so a line-anchored
 * rewrite is exact — and everything else in the file (comments, sections,
 * any field a later writer added that this serializer does not know) is
 * preserved byte-for-byte (I-049: never round-trip parse→mutate→serialize a
 * file whose schema can grow underneath you).
 */
function rewriteCompletionScalars(content: string, exitTime: string): string {
  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.startsWith("exit_time: ")) lines[i] = `exit_time: ${exitTime}`
    else if (line.startsWith("status: ")) lines[i] = `status: COMPLETE`
  }
  return lines.join("\n")
}

/**
 * Stamp the active dream COMPLETE, link artifact IDs, and atomically move it
 * to history/. Uses the same renameSync + copy+unlink fallback as dream-journal.ts.
 *
 * I-049 append-preserve: completion never reserializes the DRM file. The
 * scalar rewrite above mutates exit_time/status in place; the artifact ID
 * arrays are appended as flow-array lines to the END of the file (valid YAML
 * — the parser takes the last occurrence of a repeated key, and the empty
 * arrays begin wrote are earlier lines). A pre_compaction marker, a comment,
 * or any future field written at begin therefore survives completion
 * untouched.
 */
export function completeDream(
  directory: string,
  exitTime: string,
  artifactIds: string[]
): CompleteResult {
  // Bucket IDs by prefix (only valid-format IDs)
  const allIds = artifactIds.filter((id) => /^(I|W|SNG|SHADOW)-\d+$/.test(id))

  // Validate artifact files exist; split into present/missing
  const missingArtifacts: string[] = []
  const presentIds: string[] = []
  const artifactsBase = path.join(directory, ".opencode/dreams/artifacts")
  const prefixToSubdir: Record<string, string> = {
    I: "insights",
    W: "warnings",
    SNG: "songlines",
    SHADOW: "shadows",
  }
  for (const id of allIds) {
    const prefixMatch = id.match(/^([A-Z]+)-\d+$/)
    if (!prefixMatch) { missingArtifacts.push(id); continue }
    const subdir = prefixToSubdir[prefixMatch[1]!]
    if (!subdir) { missingArtifacts.push(id); continue }
    const p = path.join(artifactsBase, subdir, `${id}.yaml`)
    if (!fs.existsSync(p)) {
      missingArtifacts.push(id)
    } else {
      presentIds.push(id)
    }
  }

  // Bucket validated IDs only
  const insights = presentIds.filter((id) => /^I-\d+$/.test(id))
  const warnings = presentIds.filter((id) => /^W-\d+$/.test(id))
  const songlines = presentIds.filter((id) => /^SNG-\d+$/.test(id))
  const shadows = presentIds.filter((id) => /^SHADOW-\d+$/.test(id))

  // Read active dream
  const activeDir = path.join(dreamsBase(directory), "active")
  const activeFile = (() => {
    try {
      return fs.readdirSync(activeDir).find((f) => f.match(/^DRM-\d+\.yaml$/))
    } catch {
      return undefined
    }
  })()
  if (!activeFile) throw new Error("NO_ACTIVE_DREAM")

  const activeFull = path.join(activeDir, activeFile)
  const dreamId = activeFile.replace(/\.yaml$/, "")

  // Update the file content WITHOUT reserializing (see function doc).
  const original = fs.readFileSync(activeFull, "utf8")
  let content = rewriteCompletionScalars(original, exitTime)
  content = content.replace(/\s*$/, "\n")
  content += [
    flowArray("insights", insights),
    flowArray("warnings", warnings),
    flowArray("songlines", songlines),
    flowArray("shadows", shadows),
    "",
  ].join("\n")

  const histPath = historyDreamPath(directory, dreamId)

  // Write updated content to active path first, then move
  fs.writeFileSync(activeFull, content, "utf8")

  // Atomic rename-to-history (same pattern as dream-journal.ts:99-104)
  try {
    fs.renameSync(activeFull, histPath)
  } catch {
    fs.copyFileSync(activeFull, histPath)
    fs.unlinkSync(activeFull)
  }

  return {
    dreamId,
    historyPath: histPath,
    linkedArtifacts: { insights, warnings, songlines, shadows },
    missingArtifacts,
  }
}
