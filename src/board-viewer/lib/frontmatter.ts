/**
 * Minimal frontmatter parser for HIVE capability files (`agents/capabilities/*.md`).
 *
 * This parser is OWNED BY the board-viewer capability and covers exactly the
 * simple `key: value` YAML that capability frontmatter uses (scalars, flow
 * arrays, one level of nested block mapping such as `permission:`). It
 * deliberately does NOT handle the dream/DRM YAML dialect — that format's
 * serialization rules live only in hive-infra's own parsers (SHADOW-005),
 * which this viewer consumes through relative imports of `../../lib/*`, never
 * by reimplementing the format here.
 *
 * Those were cross-package subpath imports until the viewer was absorbed into
 * the plugin package. The PACKAGE boundary is gone; the OWNERSHIP boundary is
 * not — a relative import no longer LOOKS foreign, which is precisely why this
 * file must never grow to cover the dialect it disclaims above.
 */

export type FrontmatterValue = string | number | boolean | string[] | Record<string, string>

export interface ParsedFrontmatter {
  fields: Record<string, FrontmatterValue>
  /** Markdown body after the closing fence. */
  body: string
}

function parseScalar(raw: string): string | number | boolean {
  const s = raw.trim()
  if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return s.slice(1, -1)
  if (s === "true") return true
  if (s === "false") return false
  if (s !== "" && !Number.isNaN(Number(s))) return Number(s)
  return s
}

function parseFlowArray(raw: string): string[] {
  const inner = raw.trim().slice(1, -1).trim()
  if (inner === "") return []
  return inner.split(",").map((s) => String(parseScalar(s)))
}

/**
 * Parse a `---`-fenced frontmatter block at the start of `content`.
 * Returns null if the file has no frontmatter fence.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const lines = content.split("\n")
  if (lines[0]?.trim() !== "---") return null

  const fields: Record<string, FrontmatterValue> = {}
  let i = 1
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (line.trim() === "---") {
      return { fields, body: lines.slice(i + 1).join("\n") }
    }
    i++
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) continue
    // Top-level keys only — nested (indented) lines are handled below.
    if (/^\s/.test(line)) continue

    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]!
    const rest = (m[2] ?? "").trim()

    if (rest === "") {
      // Block value: collect the following indented `sub: value` lines.
      const nested: Record<string, string> = {}
      while (i < lines.length) {
        const sub = lines[i] ?? ""
        if (!/^\s+\S/.test(sub)) break
        const sm = sub.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
        if (sm) nested[sm[1]!] = String(parseScalar(sm[2] ?? ""))
        i++
      }
      fields[key] = nested
    } else if (rest.startsWith("[") && rest.endsWith("]")) {
      fields[key] = parseFlowArray(rest)
    } else {
      fields[key] = parseScalar(rest)
    }
  }
  // No closing fence — treat as malformed.
  return null
}
