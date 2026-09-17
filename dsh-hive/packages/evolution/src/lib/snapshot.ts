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
