/**
 * Text tokenisation + set similarity — the ONE definition, shared by every
 * subsystem that scores free text.
 *
 * ── Why this module is subject-neutral ──────────────────────────────────────
 * `tokenise` and `jaccard` were born inside dream-artifacts.ts because the
 * dream archive was the only thing that ranked text. WI-068 added a second
 * consumer (the board read/search surface), and at that moment there were only
 * two honest options: import the dream module from the board module — coupling
 * two unrelated subsystems through an incidental shared helper — or copy eight
 * lines and let them drift.
 *
 * Both are the shape of mistake I-191/W-042 records: a fix applied to one copy
 * of a rule and not its sibling produces no error, just quietly different
 * answers. So the helper moved OUT of the subsystem that happened to birth it
 * and into a module that belongs to neither. `dream-artifacts.ts` re-exports
 * both names for its published `exports["./lib/dream-artifacts"]` surface.
 *
 * ── What lives here, and what must not ──────────────────────────────────────
 * Only operations on TEXT and SETS OF TOKENS, with no opinion about what the
 * text describes. Scoring POLICY (query coverage vs symmetric Jaccard, tag
 * boosts, thresholds, floors) stays with each consumer, because those are
 * judgements about a particular corpus: dream-rank.ts deliberately uses
 * coverage rather than Jaccard for query-vs-document matching, and board-read.ts
 * makes the same call independently. Two consumers disagreeing on a THRESHOLD
 * is a choice; two consumers disagreeing on what a token IS would be a bug.
 * That line is what decides whether something belongs in this file.
 *
 * Leaf module: imports nothing. Keep it that way.
 */

/**
 * Tokenise a string into a set of lowercase words: punctuation becomes
 * whitespace, tokens shorter than 3 characters are dropped.
 *
 * The ≥3 floor is doing real work — it removes `a`, `is`, `of`, `to` and the
 * rest of the closed-class noise that would otherwise dominate every overlap
 * score — but it is also a KNOWN LIMITATION worth remembering at the call
 * site: short but meaningful tokens vanish with it (`db`, `id`, `ui`, `os`,
 * and every 1–2 char version or flag). A caller whose corpus turns on such
 * tokens must not assume this function preserves them.
 *
 * Set semantics, not a bag: term frequency is discarded, so a word repeated
 * twenty times counts exactly as much as one mentioned once. That is the right
 * default for "does this text concern X" and the wrong one for relevance
 * weighting; IDF weighting was measured on the board corpus during WI-068 and
 * did NOT improve discrimination there (the discriminating tokens were also
 * the rare ones), which is why nothing more elaborate lives here.
 */
export function tokenise(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3)
  )
}

/**
 * Jaccard similarity between two token sets: |a ∩ b| / |a ∪ b|.
 *
 * SYMMETRIC, and that symmetry is the thing to think about before using it:
 * it punishes length mismatch, so a short query against a long document scores
 * near zero even on a perfect topical hit. Jaccard is the right measure when
 * both sides are comparable documents (pairwise duplicate detection); use
 * coverage (|q ∩ d| / |q|) when one side is a query.
 *
 * Two empty sets score 0, not 1 — "nothing in common" rather than "identical",
 * because a caller comparing two empty fields is almost never asking whether
 * emptiness matches.
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}
