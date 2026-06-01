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

import path from "path"
import fs from "fs"

// ── Paths ─────────────────────────────────────────────────────────────────────

function rawDir(directory: string): string {
  return path.join(directory, ".opencode/dreams/raw")
}

/** Sanitise sessionID for use as a filename segment — strip any path separators. */
function sanitiseSessionID(sessionID: string): string {
  return sessionID.replace(/[/\\]/g, "_")
}

function journalPath(directory: string, capabilityName: string, sessionID: string): string {
  const sid = sanitiseSessionID(sessionID)
  return path.join(rawDir(directory), `${capabilityName}.${sid}.md`)
}

/**
 * Extract capability name from a journal filename.
 * Files are named `<capability>.<sessionID>.md` — capability is everything
 * before the first dot.  Legacy `<capability>.md` files are also handled.
 */
function capabilityFromFilename(filename: string): string {
  const base = filename.replace(/\.md$/, "")        // strip .md
  const dotIdx = base.indexOf(".")
  return dotIdx === -1 ? base : base.slice(0, dotIdx)
}

function harvestedDir(directory: string): string {
  return path.join(rawDir(directory), ".harvested")
}

// ── Append ────────────────────────────────────────────────────────────────────

export type ResidueKind = "insight" | "warning" | "shadow" | "note"

/**
 * Append a delta of dream-worthy learnings to the capability's per-session journal.
 * Creates the file if it does not exist; never overwrites.
 * Each (capability, sessionID) pair maps to its own file — concurrent sessions
 * of the same capability cannot interleave.  A resumed session (same sessionID)
 * appends to the same file, accumulating correctly (I-042).
 */
export function appendResidue(
  directory: string,
  capabilityName: string,
  sessionID: string,
  content: string,
  kind?: ResidueKind
): void {
  const filePath = journalPath(directory, capabilityName, sessionID)
  const ts = new Date().toISOString()
  const kindTag = kind ? ` [${kind}]` : ""
  const header = `\n## ${ts}${kindTag}\n`
  fs.appendFileSync(filePath, header + content.trimEnd() + "\n", "utf8")
}

// ── Harvest ───────────────────────────────────────────────────────────────────

export interface JournalEntry {
  capability: string
  content: string
}

/**
 * Read all active journals and return their contents attributed per capability.
 * If clear=true (default), atomically rename each journal to the archive dir
 * so a concurrent append cannot race with a truncate.
 */
export function harvestJournals(
  directory: string,
  clear = true
): JournalEntry[] {
  const dir = rawDir(directory)
  let files: string[]
  try {
    files = fs.readdirSync(dir).filter(
      (f) => f.endsWith(".md") && !f.startsWith(".")
    )
  } catch {
    return []
  }

  const entries: JournalEntry[] = []
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 15)

  for (const file of files) {
    const src = path.join(dir, file)
    let content: string
    try {
      content = fs.readFileSync(src, "utf8").trim()
    } catch {
      continue
    }

    if (!content) continue

    const capability = capabilityFromFilename(file)
    entries.push({ capability, content })

    if (clear) {
      const archiveDir = harvestedDir(directory)
      // harvestedDir should already exist via bootstrap, but be safe
      fs.mkdirSync(archiveDir, { recursive: true })
      // Archive filename: strip .md, append -<ts>.md so it's traceable
      const base = file.replace(/\.md$/, "")
      const dest = path.join(archiveDir, `${base}-${ts}.md`)
      try {
        fs.renameSync(src, dest)
      } catch {
        // If rename fails (e.g. cross-device), fall back to copy+unlink
        fs.copyFileSync(src, dest)
        fs.unlinkSync(src)
      }
    }
  }

  return entries
}

/**
 * Format harvested entries into a readable block for the dreamer.
 */
export function formatHarvestForDreamer(entries: JournalEntry[]): string {
  if (entries.length === 0) return "No dream residue found. Journals are empty."

  const lines: string[] = [
    `# Dream Residue Harvest — ${new Date().toISOString()}`,
    `${entries.length} capability journal(s) harvested.\n`,
  ]

  for (const { capability, content } of entries) {
    lines.push(`---\n## Capability: \`${capability}\`\n`)
    lines.push(content)
    lines.push("")
  }

  return lines.join("\n")
}
