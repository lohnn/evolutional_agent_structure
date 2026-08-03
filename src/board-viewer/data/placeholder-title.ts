/**
 * BOUNDED stopgap: render a WI card's LIVE session title when its frozen
 * frontmatter `title` is still opencode's auto-generated placeholder.
 *
 * ── Why this is deliberately narrow (I-144 / SNG-046, portability invariant) ──
 * The WI record is normally the AUTHORITY for displayed content; live reads
 * power navigation/existence only. hive-infra owns the title-write contract
 * and is fixing the root cause (keeping WI frontmatter title in sync with the
 * real session title going forward). This helper only BRIDGES already-frozen
 * historical items — it must NOT become a competing permanent title source.
 * Hence: gated strictly on the placeholder pattern, never a blanket
 * "always prefer the live title".
 *
 * ── The pattern (W-061: an explicit match, never assume self-heal) ────────────
 * opencode's default session title is `New session - <ISO 8601 timestamp>`
 * (space-hyphen-space separator, UTC stamp ending in `Z`, millis optional).
 * We also treat an EMPTY / whitespace-only title as a placeholder.
 * ⚠ PENDING hive-infra contract confirmation (HIVEmind question sent
 * 2026-07-21): exact separator, stamp format/timezone, and whether other
 * variants ("Untitled" etc.) occur. Update PLACEHOLDER_TITLE_RE if the
 * published contract differs.
 *
 * This module is browser-safe (no node imports): render.ts imports it and is
 * bundled into /client.js, so the fallback runs identically on the initial
 * server paint and every client-side poll.
 */

/**
 * opencode's default placeholder title. Anchored, case-sensitive on the literal
 * prefix. The timestamp is validated loosely (date + `T` + time, optional
 * fractional seconds, `Z` or numeric offset) — we care that it LOOKS like the
 * auto-generated stamp, not that it round-trips as a Date.
 */
export const PLACEHOLDER_TITLE_RE =
  /^New session - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/

/**
 * True when a frontmatter title is opencode's auto-placeholder (or blank).
 * Blank counts as a placeholder: a card with no real name is exactly the case
 * this stopgap exists to rescue.
 */
export function isPlaceholderTitle(title: string | null | undefined): boolean {
  if (title == null) return true
  const trimmed = title.trim()
  if (trimmed === "") return true
  return PLACEHOLDER_TITLE_RE.test(trimmed)
}

/**
 * True when a session title from the mirror is itself USABLE — i.e. present,
 * non-blank, and NOT itself a placeholder. Guards W-063/W-077: the SQLite
 * `title` column can be empty/null, so a "live" title that is itself a
 * placeholder (or missing) must NOT override the frontmatter — that would swap
 * one timestamp for another and defeat the purpose.
 */
export function isRealSessionTitle(title: string | null | undefined): boolean {
  return title != null && title.trim() !== "" && !isPlaceholderTitle(title)
}

/**
 * Resolve the title to DISPLAY for a work-item card.
 *
 * Fallback rule (narrow, explicit):
 *   render the live session title ⇐⇒
 *     (frontmatter title is a placeholder / blank)
 *     ∧ (an owner_session id is present)
 *     ∧ (the mirror has a REAL, non-placeholder title for that owner)
 *   otherwise render the frontmatter title UNCHANGED.
 *
 * `sessionTitles` is undefined when the mirror is unavailable/absent → we fall
 * through to the frontmatter title (unknown ≠ wrong, SNG-046). Never throws.
 */
export function displayTitle(
  frontmatterTitle: string,
  ownerSession: string | null | undefined,
  sessionTitles: Record<string, string> | undefined,
): string {
  if (!isPlaceholderTitle(frontmatterTitle)) return frontmatterTitle
  if (!ownerSession || !sessionTitles) return frontmatterTitle
  const live = sessionTitles[ownerSession]
  return isRealSessionTitle(live) ? live! : frontmatterTitle
}
