/**
 * Dream journal IO helpers.
 *
 * Provides append/harvest/archive for the per-capability residue journals that
 * feed the dreamtime consolidation workflow.
 *
 * Layout:
 *   .opencode/dreams/raw/<capability>.md        — active journal (append-only)
 *   .opencode/dreams/raw/.harvested/<cap>-<ts>.md — archived after harvest
 */

import path from "path"
import fs from "fs"

// ── Paths ─────────────────────────────────────────────────────────────────────

function rawDir(directory: string): string {
  return path.join(directory, ".opencode/dreams/raw")
}

function journalPath(directory: string, capabilityName: string): string {
  return path.join(rawDir(directory), `${capabilityName}.md`)
}

function harvestedDir(directory: string): string {
  return path.join(rawDir(directory), ".harvested")
}

// ── Append ────────────────────────────────────────────────────────────────────

export type ResidueKind = "insight" | "warning" | "shadow" | "note"

/**
 * Append a delta of dream-worthy learnings to the capability's journal.
 * Creates the file if it does not exist; never overwrites.
 */
export function appendResidue(
  directory: string,
  capabilityName: string,
  content: string,
  kind?: ResidueKind
): void {
  const filePath = journalPath(directory, capabilityName)
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

    const capability = file.replace(/\.md$/, "")
    entries.push({ capability, content })

    if (clear) {
      const archiveDir = harvestedDir(directory)
      // harvestedDir should already exist via bootstrap, but be safe
      fs.mkdirSync(archiveDir, { recursive: true })
      const dest = path.join(archiveDir, `${capability}-${ts}.md`)
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
