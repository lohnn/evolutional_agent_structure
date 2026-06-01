/**
 * Dream artifact IO: parse, serialize, next-ID assignment, and query helpers.
 *
 * Handrolled — zero YAML dependencies, consistent with the plugin's philosophy.
 *
 * Artifact schemas (from actual files in .opencode/dreams/artifacts/):
 *
 * INSIGHT   (.../insights/I-NNN.yaml)
 *   insight_id, source_dream, confidence, domain_tags (flow), content (quoted),
 *   actionable (bool), previously_invisible_because (quoted)
 *
 * WARNING   (.../warnings/W-NNN.yaml)
 *   warning_id, source_dream, confidence, justifiable (FULLY|PARTIALLY|INTUITION_ONLY),
 *   content (quoted), trigger_conditions (block-sequence)
 *
 * SONGLINE  (.../songlines/SNG-NNN.yaml)
 *   songline_id, source_dream, domain_tags (flow), transfer_rating,
 *   narrative (block scalar |, 2-space indent), encoded_principles (block-sequence)
 *
 * SHADOW    (.../shadows/SHADOW-NNN.yaml)
 *   shadow_id, source_dream, weight (HIGH|MEDIUM|LOW), content (quoted),
 *   location (quoted), nature (quoted), severity (quoted),
 *   trigger_conditions (block-sequence), resolution_hint (quoted)
 *
 * Format rules (observed from real files):
 *   - NO --- fencing
 *   - domain_tags: [a, b, c]           ← flow array
 *   - trigger_conditions / encoded_principles / other arrays: block-sequence (- "item")
 *   - narrative: block scalar |, each line indented 2 spaces
 *   - string fields: double-quoted on the same line as the key
 *   - numeric fields: unquoted
 *   - boolean fields: unquoted (true/false)
 */

import path from "path"
import fs from "fs"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ArtifactType = "insight" | "warning" | "songline" | "shadow"

export interface InsightArtifact {
  type: "insight"
  insight_id: string
  source_dream: string
  confidence: number
  domain_tags: string[]
  content: string
  actionable: boolean
  previously_invisible_because: string
}

export interface WarningArtifact {
  type: "warning"
  warning_id: string
  source_dream: string
  confidence: number
  justifiable: "FULLY" | "PARTIALLY" | "INTUITION_ONLY"
  content: string
  trigger_conditions: string[]
}

export interface SonglineArtifact {
  type: "songline"
  songline_id: string
  source_dream: string
  domain_tags: string[]
  transfer_rating: number
  narrative: string
  encoded_principles: string[]
}

export interface ShadowArtifact {
  type: "shadow"
  shadow_id: string
  source_dream: string
  weight: "HIGH" | "MEDIUM" | "LOW"
  content: string
  location: string
  nature: string
  severity: string
  trigger_conditions: string[]
  resolution_hint: string
}

export type ArtifactRecord = InsightArtifact | WarningArtifact | SonglineArtifact | ShadowArtifact

// ── Paths ─────────────────────────────────────────────────────────────────────

const TYPE_TO_SUBDIR: Record<ArtifactType, string> = {
  insight: "insights",
  warning: "warnings",
  songline: "songlines",
  shadow: "shadows",
}

const TYPE_TO_PREFIX: Record<ArtifactType, string> = {
  insight: "I",
  warning: "W",
  songline: "SNG",
  shadow: "SHADOW",
}

export function artifactsDir(directory: string): string {
  return path.join(directory, ".opencode/dreams/artifacts")
}

export function artifactSubdir(directory: string, type: ArtifactType): string {
  return path.join(artifactsDir(directory), TYPE_TO_SUBDIR[type])
}

export function artifactPath(directory: string, type: ArtifactType, id: string): string {
  return path.join(artifactSubdir(directory, type), `${id}.yaml`)
}

// ── Next-ID assignment ────────────────────────────────────────────────────────

/**
 * Scan the type's subdir for existing PREFIX-NNN.yaml files, return the next
 * sequential ID as a zero-padded 3-digit string (e.g. "I-048").
 * Gaps in the sequence are fine — we take max+1.
 */
export function nextArtifactId(directory: string, type: ArtifactType): string {
  const prefix = TYPE_TO_PREFIX[type]
  const subdir = artifactSubdir(directory, type)
  let max = 0
  try {
    const files = fs.readdirSync(subdir)
    for (const f of files) {
      // Match PREFIX-NNN.yaml — prefix may be multi-char (SHADOW)
      const m = f.match(/^[A-Z]+-(\d+)\.yaml$/)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > max) max = n
      }
    }
  } catch {
    // subdir may not exist yet — bootstrap creates it, but be safe
  }
  const next = String(max + 1).padStart(3, "0")
  return `${prefix}-${next}`
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a non-fenced YAML artifact file into a typed record.
 * Handles:
 *   - Scalar fields: key: value or key: "quoted value"
 *   - Flow arrays: key: [a, b, c]
 *   - Block sequences: key:\n  - "item"
 *   - Block scalars: key: |\n  line1\n  line2
 *   - Numeric and boolean fields are returned as their JS types.
 */
export function parseArtifact(content: string, type: ArtifactType): ArtifactRecord {
  const lines = content.split("\n")
  const raw: Record<string, unknown> = {}

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Skip blank lines at top level
    if (line.trim() === "") { i++; continue }

    // Top-level key
    const topMatch = line.match(/^([a-zA-Z_]+):\s*(.*)$/)
    if (!topMatch) { i++; continue }

    const key = topMatch[1]
    const rest = topMatch[2].trim()

    // Flow array: [a, b, c]
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1)
      raw[key] = inner === "" ? [] : inner.split(",").map((s) => {
        const t = s.trim()
        if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1)
        return t
      })
      i++
      continue
    }

    // Block scalar: |
    if (rest === "|") {
      i++
      const blockLines: string[] = []
      // Collect indented lines (2-space indent for our files)
      while (i < lines.length && (lines[i].startsWith("  ") || lines[i].trim() === "")) {
        // Preserve internal blank lines but strip the 2-space indent
        blockLines.push(lines[i].startsWith("  ") ? lines[i].slice(2) : "")
        i++
      }
      // Trim trailing blank lines, add single trailing newline per YAML spec
      while (blockLines.length > 0 && blockLines[blockLines.length - 1].trim() === "") {
        blockLines.pop()
      }
      raw[key] = blockLines.join("\n") + "\n"
      continue
    }

    // Block sequence: (empty rest, next lines start with "  - ")
    if (rest === "") {
      i++
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        const itemMatch = lines[i].match(/^\s+-\s+(.*)$/)
        if (itemMatch) {
          const raw = itemMatch[1]
          if (raw.startsWith('"') && raw.endsWith('"')) {
            items.push(raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\"))
          } else if (raw.startsWith("'") && raw.endsWith("'")) {
            items.push(raw.slice(1, -1))
          } else {
            items.push(raw)
          }
        }
        i++
      }
      raw[key] = items
      continue
    }

    // Scalar (quoted or unquoted)
    let val: string | number | boolean = rest
    if (rest.startsWith('"') && rest.endsWith('"')) {
      // Double-quoted: strip outer quotes and unescape \" and \\
      val = rest.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
    } else if (rest.startsWith("'") && rest.endsWith("'")) {
      val = rest.slice(1, -1)
    }
    // Coerce known numeric fields
    if (key === "confidence" || key === "transfer_rating") {
      val = parseFloat(rest)
    }
    // Coerce boolean
    if (rest === "true") val = true
    if (rest === "false") val = false
    raw[key] = val
    i++
  }

  // Attach type discriminant
  raw.type = type
  return raw as unknown as ArtifactRecord
}

/**
 * Read and parse an artifact file from disk.
 */
export function readArtifact(directory: string, type: ArtifactType, id: string): ArtifactRecord | null {
  const filePath = artifactPath(directory, type, id)
  try {
    const content = fs.readFileSync(filePath, "utf8")
    return parseArtifact(content, type)
  } catch {
    return null
  }
}

// ── Serializer ────────────────────────────────────────────────────────────────

/** Double-quote a string for YAML, escaping internal double-quotes. */
function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

/** Emit a block-sequence array (dash-list format). */
function blockSeq(key: string, items: string[]): string {
  const lines = [`${key}:`]
  for (const item of items) {
    lines.push(`  - ${q(item)}`)
  }
  return lines.join("\n")
}

/** Emit a flow array. */
function flowArray(key: string, items: string[]): string {
  return `${key}: [${items.join(", ")}]`
}

/** Emit a block scalar (narrative: | with 2-space indent). */
function blockScalar(key: string, text: string): string {
  const body = text
    .replace(/\n$/, "")  // strip trailing newline before re-adding per-line indent
    .split("\n")
    .map((l) => l === "" ? "" : `  ${l}`)  // blank lines stay truly blank
    .join("\n")
  return `${key}: |\n${body}`
}

export function serializeInsight(a: InsightArtifact): string {
  return [
    `insight_id: ${a.insight_id}`,
    `source_dream: ${a.source_dream}`,
    `confidence: ${a.confidence}`,
    flowArray("domain_tags", a.domain_tags),
    `content: ${q(a.content)}`,
    `actionable: ${a.actionable}`,
    `previously_invisible_because: ${q(a.previously_invisible_because)}`,
    "",
  ].join("\n")
}

export function serializeWarning(a: WarningArtifact): string {
  return [
    `warning_id: ${a.warning_id}`,
    `source_dream: ${a.source_dream}`,
    `confidence: ${a.confidence}`,
    `justifiable: ${a.justifiable}`,
    `content: ${q(a.content)}`,
    blockSeq("trigger_conditions", a.trigger_conditions),
    "",
  ].join("\n")
}

export function serializeSongline(a: SonglineArtifact): string {
  return [
    `songline_id: ${a.songline_id}`,
    `source_dream: ${a.source_dream}`,
    flowArray("domain_tags", a.domain_tags),
    `transfer_rating: ${a.transfer_rating}`,
    blockScalar("narrative", a.narrative),
    blockSeq("encoded_principles", a.encoded_principles),
    "",
  ].join("\n")
}

export function serializeShadow(a: ShadowArtifact): string {
  return [
    `shadow_id: ${a.shadow_id}`,
    `source_dream: ${a.source_dream}`,
    `weight: ${a.weight}`,
    `content: ${q(a.content)}`,
    `location: ${q(a.location)}`,
    `nature: ${q(a.nature)}`,
    `severity: ${q(a.severity)}`,
    blockSeq("trigger_conditions", a.trigger_conditions),
    `resolution_hint: ${q(a.resolution_hint)}`,
    "",
  ].join("\n")
}

export function serializeArtifact(a: ArtifactRecord): string {
  switch (a.type) {
    case "insight":  return serializeInsight(a)
    case "warning":  return serializeWarning(a)
    case "songline": return serializeSongline(a)
    case "shadow":   return serializeShadow(a)
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Write an artifact to disk. The directory must already exist (created by bootstrap).
 * Returns the file path written.
 */
export function writeArtifact(directory: string, artifact: ArtifactRecord): string {
  const type = artifact.type
  const id = (artifact as unknown as Record<string, unknown>)[`${type}_id`] as string
  const filePath = artifactPath(directory, type, id)
  fs.writeFileSync(filePath, serializeArtifact(artifact), "utf8")
  return filePath
}

// ── Scan all ──────────────────────────────────────────────────────────────────

export interface ArtifactEntry {
  type: ArtifactType
  id: string
  filePath: string
  artifact: ArtifactRecord
}

/**
 * Read all artifact files of a given type (or all types if omitted).
 * Skips files that fail to parse.
 */
export function scanArtifacts(directory: string, types?: ArtifactType[]): ArtifactEntry[] {
  const targetTypes: ArtifactType[] = types ?? ["insight", "warning", "songline", "shadow"]
  const entries: ArtifactEntry[] = []

  for (const type of targetTypes) {
    const subdir = artifactSubdir(directory, type)
    let files: string[]
    try {
      files = fs.readdirSync(subdir).filter((f) => f.endsWith(".yaml"))
    } catch {
      continue
    }
    for (const file of files) {
      const filePath = path.join(subdir, file)
      try {
        const content = fs.readFileSync(filePath, "utf8")
        const artifact = parseArtifact(content, type)
        const id = file.replace(/\.yaml$/, "")
        entries.push({ type, id, filePath, artifact })
      } catch {
        // skip malformed
      }
    }
  }

  return entries
}

// ── Query / filter ────────────────────────────────────────────────────────────

export interface QueryFilter {
  types?: ArtifactType[]
  domain_tags?: string[]          // any-match (OR)
  min_confidence?: number         // applies to insight, warning, songline (transfer_rating)
}

/** Get the confidence-like numeric field for an artifact, if any. */
function artifactConfidence(a: ArtifactRecord): number | undefined {
  if (a.type === "insight") return a.confidence
  if (a.type === "warning") return a.confidence
  if (a.type === "songline") return a.transfer_rating
  return undefined // shadows have no confidence field
}

/** Get domain_tags for an artifact, if any. */
function artifactDomainTags(a: ArtifactRecord): string[] {
  if (a.type === "insight") return a.domain_tags
  if (a.type === "songline") return a.domain_tags
  return []
}

export interface QueryResult {
  /** Full artifact records when count ≤ FULL_CONTENT_THRESHOLD */
  full?: ArtifactEntry[]
  /** Summary index when count > FULL_CONTENT_THRESHOLD */
  index?: Array<{ id: string; type: ArtifactType; summary: string }>
  total: number
  mode: "full" | "index"
}

const FULL_CONTENT_THRESHOLD = 20

export function queryArtifacts(directory: string, filter: QueryFilter): QueryResult {
  const all = scanArtifacts(directory, filter.types)

  const filtered = all.filter((e) => {
    // min_confidence filter
    if (filter.min_confidence !== undefined) {
      const conf = artifactConfidence(e.artifact)
      // Shadows have no confidence — always include them if type is requested
      if (conf !== undefined && conf < filter.min_confidence) return false
    }

    // domain_tags filter (any-match)
    if (filter.domain_tags && filter.domain_tags.length > 0) {
      const tags = artifactDomainTags(e.artifact)
      if (!filter.domain_tags.some((t) => tags.includes(t))) return false
    }

    return true
  })

  const total = filtered.length

  if (total <= FULL_CONTENT_THRESHOLD) {
    return { full: filtered, total, mode: "full" }
  }

  // Index mode: ID + type + first 120 chars of content
  const index = filtered.map((e) => {
    const a = e.artifact
    let raw = ""
    if (a.type === "insight") raw = a.content
    else if (a.type === "warning") raw = a.content
    else if (a.type === "songline") raw = a.narrative
    else if (a.type === "shadow") raw = a.content
    const summary = raw.length > 120 ? raw.slice(0, 120) + "…" : raw
    return { id: e.id, type: e.type, summary }
  })

  return { index, total, mode: "index" }
}
