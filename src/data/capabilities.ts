/**
 * Capability roster + energy — read from `<opencode>/agents/capabilities/*.md`.
 *
 * Rules (DESIGN §6 table row "Capability energy/health"):
 *  - skip files starting with `_` (templates)
 *  - normalize names to SHORT form (never "capabilities/<name>") — dream I-025:
 *    all name handling goes through ONE helper, `shortCapabilityName`.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { parseFrontmatter } from "../lib/frontmatter"

// Energy thresholds live in a browser-safe module (thresholds.ts) so the
// render layer can import them without pulling this file's node:fs. Re-exported
// here to keep the historical import site (`../data/capabilities`) working.
export { DISSOLVE_THRESHOLD, SPLIT_THRESHOLD } from "./thresholds"

export interface Capability {
  /** Short-form name, e.g. "proposal-web" — never "capabilities/proposal-web". */
  name: string
  description: string
  domain: string
  energy: number | null
  spawned: string
  mode: string
  canMergeWith: string[]
}

/**
 * THE name normalizer (I-025). Accepts "capabilities/foo", "foo.md",
 * "capabilities/foo.md" or "foo" and always returns "foo".
 */
export function shortCapabilityName(name: string): string {
  let n = name.trim()
  if (n.startsWith("capabilities/")) n = n.slice("capabilities/".length)
  if (n.endsWith(".md")) n = n.slice(0, -3)
  return n
}

export function loadCapabilities(opencodeDir: string): Capability[] {
  const dir = path.join(opencodeDir, "agents", "capabilities")
  let files: string[]
  try {
    files = fs.readdirSync(dir)
  } catch {
    return []
  }

  const caps: Capability[] = []
  for (const file of files.sort()) {
    if (!file.endsWith(".md") || file.startsWith("_")) continue
    let content: string
    try {
      content = fs.readFileSync(path.join(dir, file), "utf8")
    } catch {
      continue
    }
    const fm = parseFrontmatter(content)
    if (!fm) continue
    const f = fm.fields
    const energyRaw = f["energy"]
    caps.push({
      name: shortCapabilityName(file),
      description: typeof f["description"] === "string" ? f["description"] : "",
      domain: typeof f["domain"] === "string" ? f["domain"] : "",
      energy: typeof energyRaw === "number" ? energyRaw : null,
      spawned: String(f["spawned"] ?? ""),
      mode: String(f["mode"] ?? ""),
      canMergeWith: Array.isArray(f["can-merge-with"])
        ? f["can-merge-with"].map(shortCapabilityName)
        : [],
    })
  }
  return caps
}
