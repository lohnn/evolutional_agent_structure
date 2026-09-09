/**
 * Recall telemetry — Class B derived state (DESIGN-storage-improvements.md §9.5).
 *
 * Records which artifacts get surfaced by retrieval tools, as evidence for
 * future Audit passes (never-surfaced → staleness CANDIDATES; heavily-surfaced
 * → supersession-protection signal). Written server-side by tool
 * implementations as a side effect — no agent holds or needs this authority.
 *
 * Layout: .opencode/dreams/index/telemetry/<sessionID>.jsonl
 *   One file per session (per-writer separation, W-024 — concurrent sessions
 *   never share an append target). One JSON line per surfacing event.
 *   A future maintenance step compacts these into a summary via
 *   harvest-and-rename (I-047 discipline); until then the raw events are the data.
 *
 * HARD INVARIANTS (design §9.5 / §13 — do not weaken):
 *   1. Telemetry NEVER feeds ranking. dream-rank.ts must never import this
 *      module's read side (there deliberately isn't one yet). Surfaced-count
 *      boosting rank is an undamped popularity feedback loop.
 *   2. Telemetry NEVER auto-acts. Zero-surfaced is a candidate signal for
 *      dreamcatcher judgment — shadows/warnings are event-triggered and
 *      legitimately dormant. No auto-stale, ever.
 *   3. A query must never fail because its telemetry side effect did — all
 *      IO errors are swallowed.
 *
 * This state is deletable: removing index/telemetry/ loses usage history but
 * breaks nothing (Class B loss tolerance).
 */
export interface SurfacedEvent {
    ts: string;
    tool: string;
    query: string;
    surfaced: string[];
    surfaced_count: number;
    total: number;
}
/**
 * Append one surfacing event to the current session's telemetry journal.
 * Self-sufficient (creates its directory) and infallible by contract:
 * any error is swallowed — telemetry must never break the query it rides on.
 */
export declare function recordSurfacedEvent(directory: string, sessionID: string, tool: string, queryText: string, surfacedIds: string[], total: number): void;
