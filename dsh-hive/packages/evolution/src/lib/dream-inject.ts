/**
 * Dream artifact injection for the dispatch seam (TOKEN-ECONOMY D3).
 *
 * The dreamcatcher now returns POINTERS (artifact ids + one-line whys — the
 * pointer, not the body), and `hive_dispatch` accepts those ids as
 * `dream_ids`. This module transports the artifact TEXT in code: the ids are
 * resolved against the mounted dream-archive service and the verbatim
 * artifact files are composed into the dispatched child's prompt. The
 * coordinator never re-types artifact bodies (the triple-pay dies: child
 * output, coordinator re-paste, worker re-read), and no transcription drift
 * can enter.
 *
 * ISOLATION (the standing rule): evolution must not import the dream-archive
 * package — the cohort's isolated git-path install pathway compiles packages
 * with only their own links present, where a cross-package import failed for
 * real (TS2307, 2026-09-15). The archive is therefore accessed as a
 * STRUCTURAL service handle: if `ctx.dreamArchive` is mounted, its
 * `pathForId` resolves the file; if it is not mounted, resolution degrades to
 * a direct filesystem probe under the same path convention. Both paths are
 * read-only; a miss names the id and degrades — injection trouble never
 * fails the dispatch.
 */

import fs from "fs"

// artifact id shape: type prefix + numeric stem. Enforced BEFORE any path
// derivation, so nothing that starts with ".", "/", or a drive letter can
// ever reach a filesystem path through this module.
const DREAM_ID_PATTERN = /^(I|W|SNG|SHADOW)-\d+$/

export function isDreamArtifactId(id: string): boolean {
  return DREAM_ID_PATTERN.test(id.trim())
}

/** Parse the `dream_ids` argument: comma/space/whitespace separated. */
export function parseDreamIds(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "")
}

/** How the archive surface is reached — evolution is structurally tolerant. */
export interface DreamArchiveLike {
  /** The service method (mounted when @hive/dsh-dream-archive is installed). */
  pathForId?: (id: string) => string
  /** Optional surfacing telemetry (never load-bearing). */
  recordSurfacedEvent?: (sessionID: string, tool: string, queryText: string, surfacedIds: string[], total: number) => unknown
}

export interface DreamArtifactResolution {
  id: string
  /** Short id-normalized form actually used. */
  normalized: string
  ok: boolean
  /** The verbatim file text when ok. */
  text?: string
  /** Lifecycle flags detected in the artifact (stale / superseded_by). */
  flags?: string[]
  detail?: string
}

/** Detect the lifecycle annotation lines the seal/append path writes. */
function lifecycleFlags(text: string): string[] {
  const flags: string[] = []
  if (/^stale:\s*(true|["']?true["']?)\s*$/m.test(text)) flags.push("stale")
  const sup = text.match(/^superseded_by:\s*(\S+)\s*$/m)
  if (sup) flags.push(`superseded_by:${sup[1]}`)
  return flags
}

/**
 * Resolve ids to verbatim artifact texts. Never throws: every failure is a
 * per-id error entry (the dispatch result reports it; the dispatch itself
 * proceeds). `archive` may be undefined (standalone install) — the direct
 * fallback probes `<directory>/.opencode/dreams/artifacts/<subdir>/<id>.yaml`
 * using the same prefix→subdir mapping the archive's own pathForId applies.
 */
export function resolveDreamArtifacts(
  directory: string,
  rawIds: string | undefined,
  archive?: DreamArchiveLike
): DreamArtifactResolution[] {
  if (!rawIds || rawIds.trim() === "") return []
  const ids = parseDreamIds(rawIds)
  const out: DreamArtifactResolution[] = []
  for (const id of ids) {
    const normalized = id.trim().toUpperCase()
    if (!isDreamArtifactId(normalized)) {
      out.push({ id, normalized, ok: false, detail: `not an artifact id (expected I-|W-|SNG-|SHADOW-<number>, got "${id}")` })
      continue
    }
    let text: string | undefined
    try {
      const viaService = archive?.pathForId?.(normalized)
      const path =
        viaService ??
        `${directory}/.opencode/dreams/artifacts/${dreamSubdir(normalized)}/${normalized}.yaml`
      text = fs.readFileSync(path, "utf8")
    } catch (err) {
      out.push({ id, normalized, ok: false, detail: `not found in the archive${archive?.pathForId ? "" : " (dream archive service not mounted — direct probe)"}: ${String(err)}`.slice(0, 300) })
      continue
    }
    out.push({ id, normalized, ok: true, text, flags: lifecycleFlags(text) })
  }
  return out
}

/** The dream-archive path convention: prefix → subdir. Mirrors pathForId. */
export function dreamSubdir(id: string): string {
  if (id.startsWith("SHADOW-")) return "shadows"
  if (id.startsWith("SNG-")) return "songlines"
  if (id.startsWith("W-")) return "warnings"
  return "insights"
}

/**
 * Compose the injected block: a header that states provenance and the
 * lifecycle contract, then each resolved artifact verbatim under its id.
 * Flagged artifacts get an explicit ⚠ line BEFORE their text — the worker
 * sees staleness first, not buried in appended YAML fields.
 */
export function composeDreamArtifactBlock(resolutions: DreamArtifactResolution[]): string | null {
  const ok = resolutions.filter((r) => r.ok)
  if (ok.length === 0) return null
  const lines: string[] = [
    "## Dream artifacts (verbatim archive injection — DREAM POINTERS resolved by the dispatch seam, not re-typed by any model)",
    "",
    "These artifacts were surfaced for this task. Honor lifecycle flags: a `stale` or `superseded_by:X` artifact is shown for context — verify against X before applying it; X supersedes it.",
    "",
  ]
  for (const r of ok) {
    lines.push(`### ${r.normalized}`)
    if (r.flags && r.flags.length > 0) {
      lines.push(`⚠ lifecycle: ${r.flags.join(", ")}`)
      const sup = r.flags.find((f) => f.startsWith("superseded_by:"))
      if (sup) lines.push(`⚠ superseded — verify against ${sup.slice("superseded_by:".length)} before applying anything here.`)
    }
    lines.push("")
    lines.push((r.text ?? "").trimEnd())
    lines.push("")
  }
  return lines.join("\n").trimEnd()
}

/**
 * One line for the dispatch RESULT telling the dispatcher what happened with
 * its dream_ids (resolved count, flagged ids, misses with reasons) — the
 * coordinator must see injection outcomes without opening the archive.
 */
export function describeDreamInjection(resolutions: DreamArtifactResolution[]): string | null {
  if (resolutions.length === 0) return null
  const ok = resolutions.filter((r) => r.ok)
  const failed = resolutions.filter((r) => !r.ok)
  const flagged = resolutions.filter((r) => r.flags && r.flags.length > 0).map((r) => r.normalized)
  const parts: string[] = []
  parts.push(`Dream artifacts injected: ${ok.map((r) => r.normalized).join(", ") || "none"}`)
  if (flagged.length > 0) parts.push(`lifecycle flags on: ${flagged.join(", ")}`)
  for (const f of failed) parts.push(`NOT injected — ${f.id}: ${f.detail ?? "unknown error"}`)
  return parts.join(". ") + "."
}

