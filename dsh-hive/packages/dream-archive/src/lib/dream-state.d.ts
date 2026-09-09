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
export type IntentionType = "CONSOLIDATION" | "COMPARATIVE" | "ABSTRACTION" | "ANOMALY" | "INTEGRATION";
export type DreamStatus = "DREAMING" | "COMPLETE";
export type CoherenceLevel = "HIGH" | "MEDIUM" | "LOW";
export interface ContextSignals {
    contradictions: number;
    repetitions_detected: boolean;
    coherence: CoherenceLevel;
    threads_active: number;
}
export interface DreamState {
    dream_id: string;
    depth: number;
    intention: string;
    intention_type: IntentionType;
    entry_time: string;
    exit_time: string | null;
    status: DreamStatus;
    project_context: string;
    context_signals: ContextSignals;
    retain_high: string[];
    retain_low: string[];
    /**
     * Lifecycle marker, set ONCE at hive_dream_begin and never mutated after
     * (scalar-set-at-begin semantics, I-190). `true` marks a mid-session,
     * pre-compaction consolidation: the dream completes and archives normally,
     * but its completion must NOT promote the owning session's board item to
     * done — work continues afterwards. Absent from older files; parse-side the
     * raw-record read yields undefined, which every consumer must treat as
     * false (an unflagged end-of-work dream keeps the historical close behavior).
     */
    pre_compaction: boolean;
    insights: string[];
    warnings: string[];
    songlines: string[];
    shadows: string[];
}
export declare function dreamsBase(directory: string): string;
export declare function activeDreamPath(directory: string, id: string): string;
export declare function historyDreamPath(directory: string, id: string): string;
/**
 * Scan BOTH active/ and history/ for DRM-NNN.yaml, return max+1.
 * Zero-padded to 3 digits (DRM-001, DRM-015, etc.).
 */
export declare function nextDreamId(directory: string): string;
/**
 * Return the filenames (without path) of all DRM-*.yaml files in active/.
 */
export declare function listActiveDreams(directory: string): string[];
/** A completed pre-compaction dream, summarised for pointer digests. */
export interface PreCompactionDream {
    dreamId: string;
    intention: string;
    artifacts: string[];
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
export declare function recentPreCompactionDreams(directory: string, limit?: number): PreCompactionDream[];
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
export declare function parseDreamState(content: string): DreamState;
export declare function readDreamState(filePath: string): DreamState;
export declare function serializeDreamState(d: DreamState): string;
export interface BeginResult {
    dreamId: string;
    filePath: string;
}
export declare function beginDream(directory: string, state: Omit<DreamState, "dream_id" | "exit_time" | "status" | "insights" | "warnings" | "songlines" | "shadows" | "pre_compaction"> & {
    pre_compaction?: boolean;
}): BeginResult;
export interface CompleteResult {
    dreamId: string;
    historyPath: string;
    linkedArtifacts: {
        insights: string[];
        warnings: string[];
        songlines: string[];
        shadows: string[];
    };
    missingArtifacts: string[];
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
export declare function completeDream(directory: string, exitTime: string, artifactIds: string[]): CompleteResult;
