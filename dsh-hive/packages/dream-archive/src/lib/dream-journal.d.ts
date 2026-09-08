/**
 * Dream journal IO helpers.
 *
 * Provides append/harvest/archive for the per-capability residue journals that
 * feed the dreamtime consolidation workflow.
 *
 * Layout:
 *   .opencode/dreams/raw/<capability>.<sessionID>.md   — active journal, one per (capability, session)
 *   .opencode/dreams/raw/.harvested/<cap>.<sid>-<ts>.md — archived after harvest
 *
 * Per-(capability, session) keying prevents concurrent same-capability sessions
 * from corrupting each other via interleaved appendFileSync calls.  A resumed
 * session (same sessionID) correctly accumulates into the same file.
 *
 * Attribution on harvest: split filename on the FIRST dot —
 *   capability = everything before first dot  (e.g. "hive-infra")
 *   session    = everything between first dot and ".md"  (e.g. "ses_17dc…")
 * Capability short-names use hyphens only (never dots), so this split is safe.
 * Legacy files of the form "<capability>.md" (no session segment) are also
 * handled: the "session" part becomes the empty string, capability attribution
 * still works correctly.
 */
export type ResidueKind = "insight" | "warning" | "shadow" | "note";
/**
 * Append a delta of dream-worthy learnings to the capability's per-session journal.
 * Creates the file if it does not exist; never overwrites.
 * Each (capability, sessionID) pair maps to its own file — concurrent sessions
 * of the same capability cannot interleave.  A resumed session (same sessionID)
 * appends to the same file, accumulating correctly (I-042).
 */
export declare function appendResidue(directory: string, capabilityName: string, sessionID: string, content: string, kind?: ResidueKind): void;
export interface JournalEntry {
    capability: string;
    content: string;
}
/**
 * Read all active journals and return their contents attributed per capability.
 * If clear=true (default), atomically rename each journal to the archive dir
 * so a concurrent append cannot race with a truncate.
 */
export declare function harvestJournals(directory: string, clear?: boolean): JournalEntry[];
/**
 * Format harvested entries into a readable block for the dreamer.
 */
export declare function formatHarvestForDreamer(entries: JournalEntry[]): string;
