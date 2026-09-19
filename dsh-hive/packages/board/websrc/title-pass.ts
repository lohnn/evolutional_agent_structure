/**
 * WI-062 SLICE 3B — SHADOW-019 title pass (authored; NOT a port — the 4400
 * viewer had no such pass; the shadow here is the DSH-era decision this surface
 * must make about RAW titles).
 *
 * Raw (unverified) titles reaching the board:
 *   1. opencode-placeholder: "New session - 2026-…Z"  — handled by the ported
 *      data/placeholder-title.ts (its mirror fallback is dead under dsh: the
 *      SessionMirror is EMPTY_MIRROR, so those render raw and fall through to
 *      THIS pass in the depth view);
 *   2. awaken-input slugs: titles written as "/awaken-input …" — the raw
 *      argument string of the spawn, frozen frontmatter-side by the board store.
 *
 * The presentation rule (deliberate, ONE place — render calls never massage
 * titles ad hoc):
 *   - display: truncated at MAX_PRESENT chars on a word boundary, "…" appended
 *     when cut; the FULL raw text rides the tooltip (never lost);
 *   - the depth drawer marks the raw state with a dim "(raw title)" chip and
 *     shows the raw text UNTRUNCATED in its own paragraph — a raw title is a
 *     pointer to something to verify, not a sentence to trust;
 *   - SHADOW-019 REVISIT CONDITION (the trigger that retires this pass): when
 *     dsh exposes a session-title surface (the parity equivalent of the
 *     opencode sessionTitles mirror), wire it in as the placeholder fallback
 *     and demote this truncation to "no mirror available" only.
 */

import { isPlaceholderTitle } from "./data/placeholder-title.js"

export const MAX_PRESENT = 48

/** True when the title is raw in either raw class above (shadows the mirror path). */
export function isRawTitle(title: string): boolean {
  return isPlaceholderTitle(title) || title.startsWith("/")
}

/** Word-boundary truncation with an explicit ellipsis; never splits mid-token. */
function truncateAtWord(raw: string, max: number): string {
  if (raw.length <= max) return raw
  const cut = raw.slice(0, max)
  const boundary = cut.lastIndexOf(" ")
  return (boundary > max * 0.5 ? cut.slice(0, boundary) : cut).trimEnd() + "…"
}

export interface PresentedTitle {
  /** The string to render (truncated when raw and long). */
  display: string
  /** Full raw text — goes to the tooltip; the drawer shows it verbatim. */
  raw: string
  /** "raw" presentation flags (chip + un-truncated drawer paragraph). */
  raw_: boolean
  /** "opencode-placeholder" | "awaken-input-slug" | "" */
  rawKind: string
}

export function presentTitle(raw: string): PresentedTitle {
  const rawFlag = isRawTitle(raw)
  const rawKind = raw.startsWith("/") ? "awaken-input-slug" : isPlaceholderTitle(raw) ? "opencode-placeholder" : ""
  return {
    display: rawFlag ? truncateAtWord(raw, MAX_PRESENT) : raw,
    raw,
    raw_: rawFlag,
    rawKind,
  }
}

/** The dim chip style marker the drawer renders next to a raw title. */
export const RAW_TITLE_CHIP = '<span class="raw-title-chip" title="title is raw/unverified — no session-title surface exists under dsh yet (SHADOW-019)">(raw title)</span>'
