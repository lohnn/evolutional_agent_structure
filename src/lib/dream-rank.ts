/**
 * Dream artifact ranking — server-side pre-filter for dreamcatcher Recall.
 *
 * Purpose: at archive scale, Recall must not read the whole archive. This
 * module scores every artifact against a free-text query and returns a top-k
 * shortlist (id + excerpt); the caller pulls full content for the entries it
 * judges promising via hive_dream_query(ids: ...). Pre-filter, not replacement:
 * semantic relevance judgment stays with the calling agent.
 *
 * Backend ladder (contract-first design — DESIGN-storage-improvements.md §9.1):
 *   v1 "token-v1" (this file): zero-dep token scoring. Query-token coverage of
 *       the artifact's text + a domain-tag boost. Exact, brute-force, fine at
 *       any plausible archive size (191 KB at N=166).
 *   v2 "embedding-v1" (future, at the §11 size trigger): cosine over a derived
 *       embedding sidecar. Swaps in behind the SAME RankedArtifact contract and
 *       tool surface — callers and the dreamcatcher prompt do not change.
 *
 * Contract-level guarantees (these survive any backend swap):
 *   - Type floors: top-k naively favours insights (89 of 166); shadows and
 *     warnings get guaranteed slots so shadow-first bias survives the shortlist.
 *   - Trigger bypass: warnings/shadows whose trigger_conditions literally
 *     overlap the query are included regardless of score — trigger conditions
 *     are DESIGNED to be matched literally; that is their job.
 *
 * Scoring note (deliberate deviation from plain Jaccard): for query-vs-document
 * matching, symmetric Jaccard punishes long artifacts — a 3-token query against
 * a 100-token artifact caps at ~0.03 even on a perfect hit. We use query
 * COVERAGE (|q ∩ d| / |q|) instead: "how much of the query's meaning does this
 * artifact touch". Jaccard remains the right tool for the pairwise duplicate
 * detector, where both sides are documents.
 *
 * This module is strictly READ-ONLY over the archive (Class A untouched) and
 * must never read telemetry (invariant: telemetry never feeds ranking — an
 * undamped popularity feedback loop; see dream-telemetry.ts).
 */

import {
  scanArtifacts,
  tokenise,
  type ArtifactType,
  type ArtifactRecord,
} from "./dream-artifacts.js"

// ── Contract ──────────────────────────────────────────────────────────────────

export interface RankedArtifact {
  id: string
  type: ArtifactType
  score: number
  source_dream: string
  excerpt: string            // ~200 chars of primary content
  flags: string[]            // e.g. "trigger-match", "floor:shadow", "stale", "superseded_by:I-053"
}

export interface RankResult {
  results: RankedArtifact[]
  total: number              // artifacts considered (after type filter)
  backend: string            // "token-v1" | (future) "embedding-v1"
}

export interface RankOptions {
  k?: number                 // shortlist size (default 30)
  types?: ArtifactType[]     // optional type restriction
}

const DEFAULT_K = 30
/** Guaranteed slots per tagless/failure-pattern type within k (min(FLOOR, available)). */
const SHADOW_FLOOR = 5
const WARNING_FLOOR = 5
/** Domain-tag match contributes up to this much on top of content coverage. */
const TAG_BOOST = 0.25
const EXCERPT_LEN = 200

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Primary free-text of an artifact (what a reader would skim). */
function primaryText(a: ArtifactRecord): string {
  if (a.type === "songline") return a.narrative
  return a.content
}

/** All searchable text: primary + auxiliary fields that carry topical signal. */
function searchableText(a: ArtifactRecord): string {
  const parts: string[] = [primaryText(a)]
  if (a.type === "insight") parts.push(a.previously_invisible_because)
  if (a.type === "warning") parts.push(a.trigger_conditions.join(" "))
  if (a.type === "songline") parts.push(a.encoded_principles.join(" "))
  if (a.type === "shadow") {
    parts.push(a.trigger_conditions.join(" "), a.location, a.nature)
  }
  return parts.join(" ")
}

function domainTags(a: ArtifactRecord): string[] {
  if (a.type === "insight" || a.type === "songline") return a.domain_tags
  return []
}

/** Lifecycle flags from appended fields (stale / superseded_by). parseArtifact
 * keeps unknown appended keys; duplicates are last-wins, which is fine for flags. */
function lifecycleFlags(a: ArtifactRecord): string[] {
  const raw = a as unknown as Record<string, unknown>
  const flags: string[] = []
  if (raw.stale === true || raw.stale === "true") flags.push("stale")
  if (typeof raw.superseded_by === "string" && raw.superseded_by) {
    flags.push(`superseded_by:${raw.superseded_by}`)
  }
  return flags
}

function excerptOf(a: ArtifactRecord): string {
  const text = primaryText(a).replace(/\s+/g, " ").trim()
  return text.length > EXCERPT_LEN ? text.slice(0, EXCERPT_LEN) + "…" : text
}

// ── v1 backend: token scoring ─────────────────────────────────────────────────

interface ScoredEntry {
  ranked: RankedArtifact
  bypass: boolean            // trigger-match — guaranteed inclusion
}

function scoreEntries(
  directory: string,
  queryTokens: Set<string>,
  types?: ArtifactType[]
): ScoredEntry[] {
  const entries = scanArtifacts(directory, types)
  const scored: ScoredEntry[] = []

  for (const e of entries) {
    const a = e.artifact
    const docTokens = tokenise(searchableText(a))

    // Query coverage: fraction of query tokens present in the artifact
    let hits = 0
    for (const t of queryTokens) if (docTokens.has(t)) hits++
    const coverage = queryTokens.size === 0 ? 0 : hits / queryTokens.size

    // Tag boost: fraction of query tokens present in the (tokenised) tags
    const tagTokens = tokenise(domainTags(a).join(" "))
    let tagHits = 0
    for (const t of queryTokens) if (tagTokens.has(t)) tagHits++
    const tagBoost = queryTokens.size === 0 ? 0 : (tagHits / queryTokens.size) * TAG_BOOST

    const flags = lifecycleFlags(a)

    // Trigger bypass: warnings/shadows whose trigger_conditions literally
    // overlap the query are included regardless of score.
    let bypass = false
    if (a.type === "warning" || a.type === "shadow") {
      const triggerTokens = tokenise(a.trigger_conditions.join(" "))
      let trigHits = 0
      for (const t of queryTokens) if (triggerTokens.has(t)) trigHits++
      if (trigHits >= Math.min(2, queryTokens.size) && trigHits > 0) {
        bypass = true
        flags.unshift("trigger-match")
      }
    }

    scored.push({
      ranked: {
        id: e.id,
        type: e.type,
        score: Math.round((coverage + tagBoost) * 1000) / 1000,
        source_dream: a.source_dream,
        excerpt: excerptOf(a),
        flags,
      },
      bypass,
    })
  }

  return scored
}

// ── Rank (contract entry point) ───────────────────────────────────────────────

export function rankArtifacts(
  directory: string,
  query: string,
  opts: RankOptions = {}
): RankResult {
  const k = opts.k ?? DEFAULT_K
  const queryTokens = tokenise(query)

  const scored = scoreEntries(directory, queryTokens, opts.types)
  const total = scored.length

  // Global order: score desc, stable id tiebreak
  const byScore = [...scored].sort(
    (a, b) => b.ranked.score - a.ranked.score || a.ranked.id.localeCompare(b.ranked.id)
  )

  // k >= N: everything, ranked. (Makes the tool a safe adoption at small N.)
  if (k >= total) {
    return { results: byScore.map((s) => s.ranked), total, backend: "token-v1" }
  }

  // Selection: bypass set + type floors + open competition, all within/around k.
  const selected = new Map<string, ScoredEntry>()

  // 1. Trigger-bypass warnings/shadows — guaranteed, may exceed k (documented).
  for (const s of byScore) {
    if (s.bypass) selected.set(s.ranked.id, s)
  }

  // 2. Type floors: best-scoring shadows/warnings up to min(FLOOR, available),
  //    counting any already selected via bypass toward the floor.
  for (const [floorType, floorSize] of [["shadow", SHADOW_FLOOR], ["warning", WARNING_FLOOR]] as const) {
    let have = 0
    for (const s of selected.values()) if (s.ranked.type === floorType) have++
    for (const s of byScore) {
      if (have >= floorSize) break
      if (s.ranked.type !== floorType || selected.has(s.ranked.id)) continue
      s.ranked.flags.push(`floor:${floorType}`)
      selected.set(s.ranked.id, s)
      have++
    }
  }

  // 3. Open competition for the remaining slots up to k. (Bypass + floors may
  //    already exceed k — then no open slots remain; guaranteed items stay.)
  for (const s of byScore) {
    if (selected.size >= k) break
    if (!selected.has(s.ranked.id)) selected.set(s.ranked.id, s)
  }

  const results = [...selected.values()]
    .map((s) => s.ranked)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

  return { results, total, backend: "token-v1" }
}
