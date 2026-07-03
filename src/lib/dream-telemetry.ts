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

import path from "path"
import fs from "fs"

/** Cap surfaced-id lists per event so full-archive queries don't bloat the log. */
const MAX_IDS_PER_EVENT = 50
/** Cap stored query text. */
const MAX_QUERY_LEN = 300

function telemetryDir(directory: string): string {
  return path.join(directory, ".opencode/dreams/index/telemetry")
}

/** Sanitise sessionID for use as a filename segment (same rule as dream-journal.ts). */
function sanitiseSessionID(sessionID: string): string {
  return sessionID.replace(/[/\\]/g, "_")
}

export interface SurfacedEvent {
  ts: string
  tool: string               // "rank" | "query"
  query: string              // free-text query or filter summary
  surfaced: string[]         // artifact ids returned (capped)
  surfaced_count: number     // true count before capping
  total: number              // archive/result-set size the surfacing drew from
}

/**
 * Append one surfacing event to the current session's telemetry journal.
 * Self-sufficient (creates its directory) and infallible by contract:
 * any error is swallowed — telemetry must never break the query it rides on.
 */
export function recordSurfacedEvent(
  directory: string,
  sessionID: string,
  tool: string,
  queryText: string,
  surfacedIds: string[],
  total: number
): void {
  try {
    const dir = telemetryDir(directory)
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${sanitiseSessionID(sessionID)}.jsonl`)
    const event: SurfacedEvent = {
      ts: new Date().toISOString(),
      tool,
      query: queryText.slice(0, MAX_QUERY_LEN),
      surfaced: surfacedIds.slice(0, MAX_IDS_PER_EVENT),
      surfaced_count: surfacedIds.length,
      total,
    }
    fs.appendFileSync(file, JSON.stringify(event) + "\n", "utf8")
  } catch {
    // Invariant 3: telemetry failure is invisible to the caller.
  }
}
