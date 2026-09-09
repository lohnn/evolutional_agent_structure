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
export type ArtifactType = "insight" | "warning" | "songline" | "shadow";
export interface InsightArtifact {
    type: "insight";
    insight_id: string;
    source_dream: string;
    confidence: number;
    domain_tags: string[];
    content: string;
    actionable: boolean;
    previously_invisible_because: string;
}
export interface WarningArtifact {
    type: "warning";
    warning_id: string;
    source_dream: string;
    confidence: number;
    justifiable: "FULLY" | "PARTIALLY" | "INTUITION_ONLY";
    content: string;
    trigger_conditions: string[];
}
export interface SonglineArtifact {
    type: "songline";
    songline_id: string;
    source_dream: string;
    domain_tags: string[];
    transfer_rating: number;
    narrative: string;
    encoded_principles: string[];
}
export interface ShadowArtifact {
    type: "shadow";
    shadow_id: string;
    source_dream: string;
    weight: "HIGH" | "MEDIUM" | "LOW";
    content: string;
    location: string;
    nature: string;
    severity: string;
    trigger_conditions: string[];
    resolution_hint: string;
}
export type ArtifactRecord = InsightArtifact | WarningArtifact | SonglineArtifact | ShadowArtifact;
export declare function artifactsDir(directory: string): string;
export declare function artifactSubdir(directory: string, type: ArtifactType): string;
export declare function artifactPath(directory: string, type: ArtifactType, id: string): string;
/**
 * Scan the type's subdir for existing PREFIX-NNN.yaml files, return the next
 * sequential ID as a zero-padded 3-digit string (e.g. "I-048").
 * Gaps in the sequence are fine — we take max+1.
 */
export declare function nextArtifactId(directory: string, type: ArtifactType): string;
/**
 * Parse a non-fenced YAML artifact file into a typed record.
 * Handles:
 *   - Scalar fields: key: value or key: "quoted value"
 *   - Flow arrays: key: [a, b, c]
 *   - Block sequences: key:\n  - "item"
 *   - Block scalars: key: |\n  line1\n  line2
 *   - Numeric and boolean fields are returned as their JS types.
 */
export declare function parseArtifact(content: string, type: ArtifactType): ArtifactRecord;
/**
 * Read and parse an artifact file from disk.
 */
export declare function readArtifact(directory: string, type: ArtifactType, id: string): ArtifactRecord | null;
export declare function serializeInsight(a: InsightArtifact): string;
export declare function serializeWarning(a: WarningArtifact): string;
export declare function serializeSongline(a: SonglineArtifact): string;
export declare function serializeShadow(a: ShadowArtifact): string;
export declare function serializeArtifact(a: ArtifactRecord): string;
/**
 * Write an artifact to disk. The directory must already exist (created by bootstrap).
 * Returns the file path written.
 */
export declare function writeArtifact(directory: string, artifact: ArtifactRecord): string;
export interface ArtifactEntry {
    type: ArtifactType;
    id: string;
    filePath: string;
    artifact: ArtifactRecord;
}
/**
 * Read all artifact files of a given type (or all types if omitted).
 * Skips files that fail to parse.
 */
export declare function scanArtifacts(directory: string, types?: ArtifactType[]): ArtifactEntry[];
export interface QueryFilter {
    types?: ArtifactType[];
    domain_tags?: string[];
    min_confidence?: number;
    ids?: string[];
}
export interface QueryResult {
    /** Full artifact records when count ≤ FULL_CONTENT_THRESHOLD */
    full?: ArtifactEntry[];
    /** Summary index when count > FULL_CONTENT_THRESHOLD */
    index?: Array<{
        id: string;
        type: ArtifactType;
        summary: string;
    }>;
    total: number;
    mode: "full" | "index";
}
export declare function queryArtifacts(directory: string, filter: QueryFilter): QueryResult;
/** Map an artifact ID prefix to its type. Returns null if unrecognised. */
export declare function idToType(id: string): ArtifactType | null;
/** Resolve the filesystem path for any artifact ID. Returns null if prefix unknown. */
export declare function pathForId(directory: string, id: string): string | null;
export interface ListEntry {
    id: string;
    type: ArtifactType;
    source_dream: string;
    summary: string;
}
/**
 * Lightweight index of artifacts — extracts id, source_dream, and a content
 * summary WITHOUT a full parse. Reads just enough lines to find the fields.
 * Primary field: insight/warning/shadow → content; songline → narrative.
 *
 * Optional filters: type and/or source_dream.
 */
export declare function listArtifacts(directory: string, opts?: {
    types?: ArtifactType[];
    source_dream?: string;
}): ListEntry[];
/**
 * Append one or more `key: value` fields to an existing artifact file.
 * Preserves the original content byte-for-byte; only appends to the end.
 * Values are double-quoted if they are strings; booleans/numbers are unquoted.
 * All files end with a single `\n` — we trim it, append fields, re-add `\n`.
 */
export declare function appendFieldsToArtifact(filePath: string, fields: Array<{
    key: string;
    value: string | boolean | number;
}>): void;
export interface DuplicateCandidate {
    idA: string;
    typeA: ArtifactType;
    idB: string;
    typeB: ArtifactType;
    score: number;
    tag_jaccard: number;
    token_overlap: number;
    summaryA: string;
    summaryB: string;
    /** |confidence_A − confidence_B| (transfer_rating for songlines). Undefined when either side has no confidence-like field (shadows). A large delta on a high-similarity pair suggests one claim should supersede the other. */
    confidence_delta?: number;
    /** |ordinal(source_dream_A) − ordinal(source_dream_B)| — DRM-NNN gap. A large gap on a same-topic pair means the topic was revisited much later: prime supersession/contradiction territory. */
    dream_distance?: number;
}
/**
 * `tokenise` / `jaccard` MOVED to lib/text-tokens.ts (WI-068) and are
 * re-exported here unchanged.
 *
 * They were never about dreams — they are subject-neutral text helpers that
 * simply happened to be born in the first subsystem that needed them. Once the
 * board's read surface became a second consumer, leaving them here would have
 * meant either the board importing the dream archive for eight lines of string
 * handling, or a second copy free to drift from this one. Both are worse than
 * a neutral home.
 *
 * The re-export is deliberate and load-bearing, not laziness: this module is a
 * PUBLISHED entry point (`exports["./lib/dream-artifacts"]` in package.json),
 * so dropping the names would be a breaking change for any consumer outside
 * this repo. New call sites should import from lib/text-tokens.js directly.
 */
export { tokenise, jaccard } from "./text-tokens.js";
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
export declare function detectDuplicateCandidates(directory: string, minScore?: number, maxScore?: number): DuplicateCandidate[];
