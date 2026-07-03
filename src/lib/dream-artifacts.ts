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
  ids?: string[]                  // exact-fetch mode: when set, other filters are bypassed
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
  // ids mode: exact fetch by artifact ID — the companion to hive_dream_rank's
  // two-step (rank returns an excerpt shortlist; query-by-ids returns full
  // content for the entries the caller judged promising). Requesting specific
  // IDs is a deliberate act, so this mode ALWAYS returns full content and
  // bypasses the other filters (a tag/confidence filter silently dropping an
  // explicitly-requested ID would be the "empty result is a lie" footgun again).
  if (filter.ids && filter.ids.length > 0) {
    const entries: ArtifactEntry[] = []
    for (const id of filter.ids) {
      const type = idToType(id)
      if (!type) continue
      const artifact = readArtifact(directory, type, id)
      if (artifact) {
        entries.push({ type, id, filePath: artifactPath(directory, type, id), artifact })
      }
    }
    return { full: entries, total: entries.length, mode: "full" }
  }

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

// ── ID → type resolution ──────────────────────────────────────────────────────

/** Map an artifact ID prefix to its type. Returns null if unrecognised. */
export function idToType(id: string): ArtifactType | null {
  if (/^I-\d+$/.test(id)) return "insight"
  if (/^W-\d+$/.test(id)) return "warning"
  if (/^SNG-\d+$/.test(id)) return "songline"
  if (/^SHADOW-\d+$/.test(id)) return "shadow"
  return null
}

/** Resolve the filesystem path for any artifact ID. Returns null if prefix unknown. */
export function pathForId(directory: string, id: string): string | null {
  const type = idToType(id)
  if (!type) return null
  return artifactPath(directory, type, id)
}

// ── Cheap list (no full parse) ────────────────────────────────────────────────

export interface ListEntry {
  id: string
  type: ArtifactType
  source_dream: string
  summary: string   // first ~80 chars of primary content field
}

/**
 * Lightweight index of artifacts — extracts id, source_dream, and a content
 * summary WITHOUT a full parse. Reads just enough lines to find the fields.
 * Primary field: insight/warning/shadow → content; songline → narrative.
 *
 * Optional filters: type and/or source_dream.
 */
export function listArtifacts(
  directory: string,
  opts: { types?: ArtifactType[]; source_dream?: string } = {}
): ListEntry[] {
  const targetTypes: ArtifactType[] = opts.types ?? ["insight", "warning", "songline", "shadow"]
  const entries: ListEntry[] = []

  for (const type of targetTypes) {
    const subdir = artifactSubdir(directory, type)
    let files: string[]
    try {
      files = fs.readdirSync(subdir).filter((f) => f.endsWith(".yaml"))
    } catch {
      continue
    }

    for (const file of files) {
      const id = file.replace(/\.yaml$/, "")
      const filePath = path.join(subdir, file)

      let source_dream = ""
      let summary = ""

      try {
        const content = fs.readFileSync(filePath, "utf8")
        const lines = content.split("\n")

        // Walk lines looking for source_dream and the primary content field
        // Stop early once both found — avoids parsing the whole file
        let inNarrative = false
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]

          // Leaving narrative block
          if (inNarrative && !line.startsWith("  ") && line.trim() !== "") {
            inNarrative = false
          }

          if (inNarrative && summary.length < 80) {
            const text = line.startsWith("  ") ? line.slice(2) : line
            if (summary.length === 0) summary = text
            // just take the first non-empty line of the narrative
          }

          if (line.startsWith("source_dream:")) {
            source_dream = line.split(":")[1].trim().replace(/^["']|["']$/g, "")
          }

          if ((type === "insight" || type === "warning" || type === "shadow") &&
              line.startsWith("content:") && summary === "") {
            const val = line.slice("content:".length).trim()
            const unquoted = val.startsWith('"') ? val.slice(1, -1).replace(/\\"/g, '"') : val
            summary = unquoted.slice(0, 80)
          }

          if (type === "songline" && line.startsWith("narrative: |")) {
            inNarrative = true
          }

          // Early exit once we have both
          if (source_dream && summary) break
        }
      } catch {
        continue
      }

      // source_dream filter
      if (opts.source_dream && source_dream !== opts.source_dream) continue

      entries.push({ id, type, source_dream, summary: summary.slice(0, 80) })
    }
  }

  return entries
}

// ── Append-field mutation (supersede / mark_stale) ────────────────────────────

/**
 * Append one or more `key: value` fields to an existing artifact file.
 * Preserves the original content byte-for-byte; only appends to the end.
 * Values are double-quoted if they are strings; booleans/numbers are unquoted.
 * All files end with a single `\n` — we trim it, append fields, re-add `\n`.
 */
export function appendFieldsToArtifact(
  filePath: string,
  fields: Array<{ key: string; value: string | boolean | number }>
): void {
  const original = fs.readFileSync(filePath, "utf8")
  // Trim the final newline; we'll re-add it after appending
  const base = original.endsWith("\n") ? original.slice(0, -1) : original
  const additions = fields.map(({ key, value }) => {
    if (typeof value === "boolean") return `${key}: ${value}`
    if (typeof value === "number") return `${key}: ${value}`
    // string — double-quote
    const escaped = (value as string).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    return `${key}: "${escaped}"`
  })
  fs.writeFileSync(filePath, base + "\n" + additions.join("\n") + "\n", "utf8")
}

// ── Duplicate detection ───────────────────────────────────────────────────────

export interface DuplicateCandidate {
  idA: string
  typeA: ArtifactType
  idB: string
  typeB: ArtifactType
  score: number            // 0.0–1.0 combined heuristic
  tag_jaccard: number
  token_overlap: number
  summaryA: string
  summaryB: string
  /** |confidence_A − confidence_B| (transfer_rating for songlines). Undefined when either side has no confidence-like field (shadows). A large delta on a high-similarity pair suggests one claim should supersede the other. */
  confidence_delta?: number
  /** |ordinal(source_dream_A) − ordinal(source_dream_B)| — DRM-NNN gap. A large gap on a same-topic pair means the topic was revisited much later: prime supersession/contradiction territory. */
  dream_distance?: number
}

/** Tokenise a string into lowercase words (≥3 chars, strip punctuation). */
export function tokenise(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3)
  )
}

/** Jaccard similarity between two sets. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** Parse the ordinal out of a DRM id (e.g. "DRM-014" → 14). Returns undefined if unparseable. */
function dreamOrdinal(sourceDream: string): number | undefined {
  const m = sourceDream.match(/DRM-(\d+)/)
  return m ? parseInt(m[1], 10) : undefined
}

/**
 * Return candidate pairs within a similarity band [minScore, maxScore].
 * Heuristic: average of domain_tag Jaccard + content-token Jaccard.
 * Semantic judgment stays in the calling agent / dreamcatcher.
 *
 * Two bands, two jobs:
 *   - High band (≥ ~0.6): near-duplicate candidates (merge/supersede).
 *   - Mid band (~0.30–0.60): contradiction-hunting zone — same topic, different
 *     words (and possibly different stance). "Divergent claims" is NOT
 *     heuristically detectable (and embedding cosine is symmetric between
 *     agreement and contradiction), so this tool only shrinks the pair space;
 *     each pair is annotated with confidence_delta and dream_distance as cheap
 *     divergence hints, and dreamcatcher judges duplicate/contradiction/unrelated.
 */
export function detectDuplicateCandidates(
  directory: string,
  minScore = 0.35,
  maxScore = 1.0
): DuplicateCandidate[] {
  const entries = scanArtifacts(directory)
  const candidates: DuplicateCandidate[] = []

  // Pre-compute tokens + tags once per artifact
  const precomputed = entries.map((e) => {
    const a = e.artifact
    let contentText = ""
    let tags: string[] = []
    if (a.type === "insight") { contentText = a.content; tags = a.domain_tags }
    else if (a.type === "warning") { contentText = a.content }
    else if (a.type === "songline") { contentText = a.narrative; tags = a.domain_tags }
    else if (a.type === "shadow") { contentText = a.content }
    return { entry: e, tokens: tokenise(contentText), tags: new Set(tags) }
  })

  // O(n²) pairwise — 86 artifacts → ~3700 pairs, fast enough
  for (let i = 0; i < precomputed.length; i++) {
    for (let j = i + 1; j < precomputed.length; j++) {
      const a = precomputed[i]
      const b = precomputed[j]

      const tag_jaccard = jaccard(a.tags, b.tags)
      const token_overlap = jaccard(a.tokens, b.tokens)
      const score = (tag_jaccard + token_overlap) / 2

      if (score >= minScore && score <= maxScore) {
        const summaryA = [...a.tokens].slice(0, 10).join(" ")
        const summaryB = [...b.tokens].slice(0, 10).join(" ")

        // Divergence annotations (cheap, reliable) — see docstring
        const confA = artifactConfidence(a.entry.artifact)
        const confB = artifactConfidence(b.entry.artifact)
        const confidence_delta = confA !== undefined && confB !== undefined
          ? Math.round(Math.abs(confA - confB) * 100) / 100
          : undefined
        const ordA = dreamOrdinal(a.entry.artifact.source_dream)
        const ordB = dreamOrdinal(b.entry.artifact.source_dream)
        const dream_distance = ordA !== undefined && ordB !== undefined
          ? Math.abs(ordA - ordB)
          : undefined

        candidates.push({
          idA: a.entry.id,
          typeA: a.entry.type,
          idB: b.entry.id,
          typeB: b.entry.type,
          score: Math.round(score * 100) / 100,
          tag_jaccard: Math.round(tag_jaccard * 100) / 100,
          token_overlap: Math.round(token_overlap * 100) / 100,
          summaryA,
          summaryB,
          ...(confidence_delta !== undefined && { confidence_delta }),
          ...(dream_distance !== undefined && { dream_distance }),
        })
      }
    }
  }

  // Sort by score descending
  return candidates.sort((a, b) => b.score - a.score)
}
