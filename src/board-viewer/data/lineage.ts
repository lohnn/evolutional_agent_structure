/**
 * Lineage helpers — pure functions over an already-parsed WorkItem's
 * transitions[]. Split out of workitems.ts (which pulls the node/bun-only
 * board-store) so the render layer can call them from a browser bundle.
 * workitems.ts re-exports them, so its public surface is unchanged.
 */
import type { Transition, WorkItem } from "../../lib/board-store"

/**
 * "Previously attempted in ses_..." lineage (Q3c): every session stamped on
 * a transitions[] entry that is NOT the current owner. The append-only log is
 * read oldest→newest (I-049); first-seen order, deduplicated. Board-side
 * entries omit `session` entirely (contract delta) and are skipped.
 *
 * ── Revision entries are NOT attempts (SCHEMA §4d, binding consumer rule) ────
 * WI-064 added a new KIND of entry to this shared log: a spec revision, with
 * `from`/`to` both the item's current status and a truthful `session` naming
 * whoever edited the spec. Truthful at the log level — and it silently changed
 * what this function means. Without the guard below, anyone who revises a spec
 * is rendered "previously attempted in ses_…": a *reader* of the item is
 * relabelled a *failed prior worker*, which is a lie about the item's history
 * and defames a session that never touched the work.
 *
 * `superseded` is the discriminator. It marks the entry as a revision, so it is
 * skipped here regardless of `session`. Note this is NOT "skip status
 * self-loops" — a genuine attempt could in principle self-loop; the annotation
 * is what carries the meaning.
 */
export function lineageSessions(item: WorkItem): string[] {
  const seen = new Set<string>()
  for (const t of item.transitions) {
    if (t.superseded !== undefined) continue // a spec edit, not a work attempt
    if (t.session && t.session !== item.owner_session) seen.add(t.session)
  }
  return [...seen]
}

/** One spec revision, read straight off `transitions[]` — never from the payload. */
export interface SpecRevision {
  at: string
  /** Actor string from the log (`hive_board_respec:hive-infra`, `board:respec`). */
  by: string
  /** Editing session, when the writer had one. Board-side edits omit it. */
  session?: string
  /** `spec_hash` of the body this replaced — the archive filename under `board/<id>/`. */
  supersededHash: string
}

/**
 * Spec revisions in log order (SCHEMA §4d).
 *
 * The entry is a TOMBSTONE (W-103): it records *that* the spec changed, when,
 * by whom, and what it superseded, without opening the archived payload. That
 * is the whole point of surfacing it — a revised spec whose history renders as
 * nothing is indistinguishable from a spec that was never revised, and the
 * reader has no way to know the text they are reading replaced something.
 *
 * Every entry carrying `superseded` counts, INCLUDING one whose payload no
 * longer resolves. A dangling pointer is a real, historically-true event (the
 * log is append-only — I-049 — so a mis-stamped pointer is never rewritten);
 * suppressing it here would hide a revision that genuinely happened. Whether
 * the payload resolves is a separate, server-side question.
 */
export function specRevisions(item: WorkItem): SpecRevision[] {
  return item.transitions
    .filter((t): t is Transition & { superseded: string } => typeof t.superseded === "string" && t.superseded !== "")
    .map((t) => ({
      at: t.at,
      by: t.by,
      ...(t.session ? { session: t.session } : {}),
      supersededHash: t.superseded,
    }))
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
