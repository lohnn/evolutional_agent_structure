import fs from "fs"
import path from "path"
import type { CapabilityInfo } from "../index.js"

export interface FrontmatterInfo {
  energy: number | null
  description: string | null
}

/**
 * Parse the `energy:` and `description:` frontmatter lines of a capability
 * file (a legacy markdown ledger, or preset.yml — the same regex-line style,
 * deliberately no YAML dependency). Mirrors the regexes the OpenCode plugin
 * used (energy tick reads/writes `energy:` in place; the roster reads both).
 * Moved here from index.ts by WI-107: the roster pairing below is the only
 * caller left in the service.
 */
export function readCapabilityFrontmatter(filePath: string): FrontmatterInfo {
  let content: string
  try {
    content = fs.readFileSync(filePath, "utf8")
  } catch {
    return { energy: null, description: null }
  }
  const energyMatch = content.match(/^energy:\s*(\d+)/m)
  const descMatch = content.match(/^description:\s*(.+)/m)
  return {
    energy: energyMatch ? parseInt(energyMatch[1]!, 10) : null,
    description: descMatch ? descMatch[1]!.trim() : null,
  }
}

/**
 * Structural subset of fs.Dirent the pairing needs — also the shape a
 * synthetic test entry satisfies, so tests never construct a real Dirent.
 */
export interface CapabilityDirEntry {
  name: string
  isDirectory(): boolean
  isFile(): boolean
}

/**
 * WI-107 — the roster renders ONE entry per CAPABILITY, not one per FILE.
 *
 * The dsh-era spawn() deliberately materializes a PAIR per capability under
 * the capabilities root:
 *
 *   <name>/preset.yml + <name>/agent.cordis.yml — the dsh preset manifest
 *       (what dsh spawns as a continuable child; dispatch material, model
 *       tier, order),
 *   <name>.md                                   — the energy ledger the
 *       energy tick reads/writes in place.
 *
 * OpenCode-era capabilities exist ONLY as `<name>.md` — the ledger-only
 * layout is first-class. Both forms carry the same name and description;
 * the preset dir additionally orders and routes. Listing both halves as
 * separate roster entries is what doubled every dsh-spawned capability
 * (W-124: 3 doubles on 2026-10-14, 7 by 2026-10-29 — tracking dsh-era
 * spawns, never the ledger count).
 *
 * Pairing rule: the PRESET wins when both exist — the same D7 rule
 * lib/material.ts encodes for dispatch material. The merged entry takes its
 * description from preset.yml and its energy from the sibling legacy ledger
 * when present (the ledger is the energy record; the preset is not), else
 * the preset files' own `energy:` line. A ledger whose name no preset dir
 * claims still lists. The readdir iteration order cannot resurrect a double:
 * a preset dir overwrites a ledger entry seen first, and a ledger seen after
 * its dir is skipped.
 *
 * Everything else is byte-compatible with the pre-WI-107 enumeration:
 * `_`-prefixed entries skip, a directory without preset.yml is invisible
 * (but its sibling ledger, if any, still lists — a preset-less dir is not a
 * capability), non-markdown files are ignored, and the result is sorted by
 * name exactly as before.
 */
export function pairCapabilityEntries(
  entries: readonly CapabilityDirEntry[],
  capabilitiesPath: string
): CapabilityInfo[] {
  const byName = new Map<string, CapabilityInfo>()
  for (const e of entries) {
    if (e.name.startsWith("_")) continue
    if (e.isDirectory()) {
      const presetFile = path.join(capabilitiesPath, e.name, "preset.yml")
      if (!fs.existsSync(presetFile)) continue
      const agentFile = path.join(capabilitiesPath, e.name, "agent.cordis.yml")
      const { description } = readCapabilityFrontmatter(presetFile)
      // Energy lives in the capability's own file for the directory form
      // too (energy.ts manages `<name>.md` files; for preset dirs we read
      // the sibling energy from the legacy md when present, else from
      // preset.yml's own `energy:` line). Pre-WI-107 semantics kept.
      const legacyMd = path.join(capabilitiesPath, `${e.name}.md`)
      const energy = fs.existsSync(legacyMd)
        ? readCapabilityFrontmatter(legacyMd).energy
        : readCapabilityFrontmatter(agentFile).energy
      byName.set(e.name, { name: e.name, energy, description })
    } else if (e.isFile() && e.name.endsWith(".md")) {
      const name = e.name.replace(/\.md$/, "")
      // WI-107: a preset dir already speaks for this capability — the
      // sibling ledger is its energy file, not a second capability.
      if (byName.has(name)) continue
      const { energy, description } = readCapabilityFrontmatter(path.join(capabilitiesPath, e.name))
      byName.set(name, { name, energy, description })
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}
