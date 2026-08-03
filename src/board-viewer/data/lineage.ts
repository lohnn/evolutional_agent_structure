/**
 * Lineage helpers — pure functions over an already-parsed WorkItem's
 * transitions[]. Split out of workitems.ts (which pulls the node/bun-only
 * board-store) so the render layer can call them from a browser bundle.
 * workitems.ts re-exports them, so its public surface is unchanged.
 */
import type { Transition, WorkItem } from "evolutional-agent-structure/lib/board-store"

/**
 * "Previously attempted in ses_..." lineage (Q3c): every session stamped on
 * a transitions[] entry that is NOT the current owner. The append-only log is
 * read oldest→newest (I-049); first-seen order, deduplicated. Board-side
 * entries omit `session` entirely (contract delta) and are skipped.
 */
export function lineageSessions(item: WorkItem): string[] {
  const seen = new Set<string>()
  for (const t of item.transitions) {
    if (t.session && t.session !== item.owner_session) seen.add(t.session)
  }
  return [...seen]
}

/**
 * Absorption lineage (Q15): bind entries that dissolved a pristine
 * session-first placeholder carry `absorbed: WI-NNN` — the only surviving
 * record of the deleted placeholder file. Rendered as lineage.
 */
export function absorbedLineage(item: WorkItem): { id: string; at: string }[] {
  return item.transitions
    .filter((t): t is Transition & { absorbed: string } => typeof t.absorbed === "string" && t.absorbed !== "")
    .map((t) => ({ id: t.absorbed, at: t.at }))
}
