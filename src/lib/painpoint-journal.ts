/**
 * Pain-point journal IO helpers.
 *
 * A STRICTER SIBLING of the dream residue journal (see dream-journal.ts).
 * Where residue captures anything dream-worthy, a pain point captures ONE thing:
 * a HARNESS / WORKFLOW friction — a problem the working agent hit, WITH the
 * context needed to understand it, but deliberately WITHOUT a solution. The
 * fix comes later, with fresh eyes. That "problem only, no fix" discipline is
 * the whole point of keeping this separate from residue.
 *
 * Layout:
 *   .opencode/painpoints/raw/<sessionID>.md              — active log, one per session
 *   .opencode/painpoints/raw/.harvested/<sid>-<ts>.md    — archived after harvest
 *
 * Per-session keying (mirroring dream-journal.ts) prevents concurrent sessions
 * from corrupting each other via interleaved appendFileSync calls. Atomic
 * rename-to-archive protects harvest-vs-append; the per-session key protects
 * append-vs-append (I-057, W-024). A resumed session (same sessionID) correctly
 * accumulates into the same file.
 *
 * Unlike the dream residue journal, pain points are NOT keyed by capability in
 * the filename — a pain point is about the harness/workflow, not about who hit
 * it. The capturing worker identity is recorded INSIDE each entry instead, so
 * attribution survives without complicating the filename split.
 */

import path from "path"
import fs from "fs"

// ── Paths ─────────────────────────────────────────────────────────────────────

function rawDir(directory: string): string {
  return path.join(directory, ".opencode/painpoints/raw")
}

function harvestedDir(directory: string): string {
  return path.join(rawDir(directory), ".harvested")
}

/** Sanitise sessionID for use as a filename segment — strip any path separators. */
function sanitiseSessionID(sessionID: string): string {
  return sessionID.replace(/[/\\]/g, "_")
}

function journalPath(directory: string, sessionID: string): string {
  const sid = sanitiseSessionID(sessionID)
  return path.join(rawDir(directory), `${sid}.md`)
}

// ── Append ────────────────────────────────────────────────────────────────────

/**
 * Append one pain point to the session's per-session log.
 * Creates the file if it does not exist; never overwrites.
 *
 * Records the capturing worker + session + timestamp in the entry header so
 * attribution survives harvest even though the filename is keyed by session only.
 * There is deliberately NO solution parameter — capture the problem and its
 * context only.
 */
export function appendPainpoint(
  directory: string,
  worker: string,
  sessionID: string,
  problem: string,
  context: string
): void {
  const filePath = journalPath(directory, sessionID)
  const ts = new Date().toISOString()
  const block = [
    ``,
    `## ${ts} — ${worker} (${sessionID})`,
    ``,
    `**Problem:** ${problem.trim()}`,
    ``,
    `**Context:** ${context.trim()}`,
    ``,
  ].join("\n")
  fs.appendFileSync(filePath, block, "utf8")
}

// ── List (read-only, on-demand review) ─────────────────────────────────────────

export interface PainpointFile {
  sessionID: string
  content: string
}

/**
 * Read all currently-open pain-point logs (the raw dir, excluding the archive).
 * Read-only: never archives or mutates. Used by the on-demand list tool so the
 * user or a fresh-eyes pass can review open pain points across sessions anytime.
 */
export function listPainpoints(directory: string): PainpointFile[] {
  const dir = rawDir(directory)
  let files: string[]
  try {
    files = fs.readdirSync(dir).filter(
      (f) => f.endsWith(".md") && !f.startsWith(".")
    )
  } catch {
    return []
  }

  const out: PainpointFile[] = []
  for (const file of files.sort()) {
    let content: string
    try {
      content = fs.readFileSync(path.join(dir, file), "utf8").trim()
    } catch {
      continue
    }
    if (!content) continue
    out.push({ sessionID: file.replace(/\.md$/, ""), content })
  }
  return out
}

/**
 * Format open pain points into a readable review block.
 */
export function formatPainpointsForReview(files: PainpointFile[]): string {
  if (files.length === 0) {
    return "No open pain points. The harness/workflow friction log is empty."
  }

  const lines: string[] = [
    `# Open Pain Points — ${new Date().toISOString()}`,
    `${files.length} session log(s) with open pain points.`,
    ``,
    `These are captured problems only (no solutions by design). ` +
      `Review with fresh eyes; propose fixes separately.`,
    ``,
  ]

  for (const { sessionID, content } of files) {
    lines.push(`---`)
    lines.push(`## Session: \`${sessionID}\``)
    lines.push(``)
    lines.push(content)
    lines.push(``)
  }

  return lines.join("\n")
}

// ── Harvest (dreamtime hookup) ─────────────────────────────────────────────────

/**
 * Read all pain-point logs and return their contents, one entry per session.
 * If clear=true (default), atomically rename each log to the archive dir so a
 * concurrent append cannot race with a truncate (mirrors harvestJournals).
 *
 * Distinct from the dream residue harvest: pain points are harness-fix
 * candidates, NOT dream feedstock. The dreamtime workflow surfaces them so they
 * are not lost, but keeps them clearly separated from residue.
 */
export function harvestPainpoints(
  directory: string,
  clear = true
): PainpointFile[] {
  const dir = rawDir(directory)
  let files: string[]
  try {
    files = fs.readdirSync(dir).filter(
      (f) => f.endsWith(".md") && !f.startsWith(".")
    )
  } catch {
    return []
  }

  const out: PainpointFile[] = []
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

    out.push({ sessionID: file.replace(/\.md$/, ""), content })

    if (clear) {
      const archiveDir = harvestedDir(directory)
      fs.mkdirSync(archiveDir, { recursive: true })
      const base = file.replace(/\.md$/, "")
      const dest = path.join(archiveDir, `${base}-${ts}.md`)
      try {
        fs.renameSync(src, dest)
      } catch {
        fs.copyFileSync(src, dest)
        fs.unlinkSync(src)
      }
    }
  }

  return out
}

/**
 * Format harvested pain points for the dreamtime workflow. Kept visually
 * distinct from residue so the dreamer treats them as harness-fix candidates,
 * not artifact feedstock.
 */
export function formatPainpointsForHarvest(files: PainpointFile[]): string {
  if (files.length === 0) {
    return "No pain points harvested. The harness/workflow friction log is empty."
  }

  const lines: string[] = [
    `# Pain-Point Harvest — ${new Date().toISOString()}`,
    `${files.length} session log(s) of harness/workflow friction harvested.`,
    ``,
    `NOTE: these are HARNESS-FIX CANDIDATES, not dream feedstock. Do not compress ` +
      `them into insights/warnings/songlines/shadows. Surface them to the user (or a ` +
      `fresh-eyes pass) as concrete workflow problems to fix, distinct from dream residue.`,
    ``,
  ]

  for (const { sessionID, content } of files) {
    lines.push(`---`)
    lines.push(`## Session: \`${sessionID}\``)
    lines.push(``)
    lines.push(content)
    lines.push(``)
  }

  return lines.join("\n")
}
