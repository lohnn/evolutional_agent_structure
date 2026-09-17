import fs from "fs"
import path from "path"
import { readHiveState } from "./energy.js"
import type { CapabilityInfo } from "../index.js"

/**
 * The ecosystem dossier composer (T2, shared with T6): one textual snapshot of
 * the HIVE ecosystem — active roster with energies, the tick status, and the
 * dissolved listing (the void). Consumed by /awaken's dossier, the re-awaken
 * analysis, and (T6) /status's summary screen above its summary tool.
 *
 * Format follows D5: a clean HIVE dossier block, NO hand-drawn ASCII state
 * bars — the board panels (NEXT WORK) will own state rendering, the text
 * should not draw what a panel will show.
 *
 * Takes a structural source ({ directory, listCapabilities }) rather than the
 * concrete Evolution service so it stays unit-testable and reusable from T6
 * without a service boot; the service satisfies it by construction.
 */

export interface EcosystemSnapshotSource {
  /** Workspace root — the directory that CONTAINS `.opencode/` (as on Evolution). */
  directory: string
  /** The live roster (as on Evolution). */
  listCapabilities: () => CapabilityInfo[]
}

/**
 * Capability names in the void: the `dissolved/` dir holds the archived preset
 * dirs and `.md` ledgers (both per dissolve()); the listing shows each NAME
 * once.
 */
function listDissolved(directory: string): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(path.join(directory, ".opencode/agents/dissolved"), { withFileTypes: true })
  } catch {
    return []
  }
  const names = new Set<string>()
  for (const e of entries) {
    names.add(e.name.endsWith(".md") ? e.name.replace(/\.md$/, "") : e.name)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

export function composeEcosystemSnapshot(source: EcosystemSnapshotSource): string {
  const caps = source.listCapabilities()
  const state = readHiveState(source.directory)
  const dissolved = listDissolved(source.directory)

  const lines: string[] = ["## HIVE Ecosystem Dossier", ""]
  lines.push("### Roster (active capabilities)", "")
  if (caps.length === 0) {
    lines.push("  (none — the roster is empty)")
  } else {
    for (const c of caps) {
      const energy = c.energy === null ? "?" : String(c.energy)
      lines.push(`  ${c.name} — energy: ${energy} — ${c.description ?? "(no description)"}`)
    }
  }
  lines.push("")
  lines.push("### Energy", "")
  lines.push(`  last tick: ${state.lastTick ?? "never (no tick has run yet)"}`)
  lines.push("")
  lines.push("### The Void (dissolved capabilities)", "")
  if (dissolved.length === 0) {
    lines.push("  (the void holds nothing)")
  } else {
    for (const name of dissolved) lines.push(`  ${name}`)
  }
  return lines.join("\n")
}

// ── Post-compaction re-anchor (T6, the compaction seam) ──────────────────────
// dsh has no separate compaction event: `agent/created` fires with
// `source: "compact"` (SessionStartSource) when an existing session's context
// has just been summarized away. The compaction hook therefore registers a
// one-shot scoped section on the re-published agent carrying this block — the
// OpenCode createCompactionHook's context SHAPE replicated, not ported: the
// energy summary line + pre-compaction dream pointers (pointers only, full
// content stays in the archive behind the hive_dream_* query tools), one
// block aimed at a coordinator whose working context evaporated beneath it.

/**
 * Structural view of one pre-compaction dream pointer — the fields
 * `@hive/dsh-dream-archive`'s `recentPreCompactionDreams()` returns
 * (dreamId, intention, artifacts). Kept STRUCTURAL on purpose: no
 * cross-package import, so evolution stays typecheckable/loading alone and
 * the cohort's isolated git-path install pathway (whose nested prepare sees
 * only its own links) never needs the dream package to compile this one —
 * the same lesson the DREAMCATCHER_DISPATCH_PERSONA import-'fix' hit for
 * real (TS2307 live).
 */
export interface PreCompactionDreamPointer {
  dreamId: string
  intention: string
  artifacts: string[]
}

export interface PostCompactionContextSource {
  /**
   * `getCapabilitiesSummary()` output (an "Active capabilities:" list) or
   * null when the roster is empty/unreadable — an empty roster re-anchors
   * loudly ("(none …)"), it does not silently skip the whole block: the
   * re-anchor's job is to restore HIVE awareness, and "the roster is empty"
   * IS awareness.
   */
  capabilitySummary: string | null
  /**
   * Pre-compaction dream pointers (most recent first), or undefined when the
   * dream archive is not reachable in this process — the composer then
   * renders the honest "not mounted" fallback line instead of pointers
   * rather than pretending there were none.
   */
  dreamPointers?: PreCompactionDreamPointer[]
}

/** The per-block pointer cap — the OpenCode compaction hook's 5 (page 1 of memory, not everything). */
export const POST_COMPACTION_DREAM_LIMIT = 5

/** One-line intention digest — the OpenCode dreamPointerLine excerpt shape (flat whitespace, ~80 chars, then …). */
function intentionExcerpt(intention: string): string {
  const flat = intention.replace(/\s+/g, " ").trim()
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat
}

/**
 * Compose the post-compaction re-anchor block from its two ingredients.
 * Pure (both inputs already resolved by the caller) so the seam's text is
 * unit-testable without booting a service and the gate listener only decides
 * WHETHER to anchor, never how.
 */
export function composePostCompactionContext(source: PostCompactionContextSource): string {
  const lines: string[] = ["== [HIVE] context restored after compaction", ""]
  lines.push("Active capabilities:")
  if (source.capabilitySummary === null) {
    lines.push("  (none — the roster is empty)")
  } else {
    lines.push(source.capabilitySummary)
  }
  lines.push("")
  lines.push("Use /status to see full details. Capabilities with low energy may need attention.")
  lines.push("")
  if (source.dreamPointers === undefined) {
    lines.push("(the dream archive is not mounted in this process — pre-compaction dream pointers are unavailable)")
  } else if (source.dreamPointers.length === 0) {
    lines.push("(no pre-compaction dreams recorded)")
  } else {
    lines.push("Pre-compaction dreams (pointers only):")
    for (const d of source.dreamPointers) {
      const arts = d.artifacts.length > 0 ? d.artifacts.join(", ") : "none"
      lines.push(`- ${d.dreamId} (pre-compaction, artifacts: ${arts}) — ${intentionExcerpt(d.intention)}`)
    }
    lines.push("")
    lines.push('Full content is retrievable via hive_dream_query(ids:"<artifact ids>") or hive_dream_rank.')
  }
  return lines.join("\n")
}
