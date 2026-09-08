import path from "path"
import fs from "fs"

const ENERGY_DECAY = 10
const ENERGY_MIN = 0
const ENERGY_MAX = 100
const DISSOLVE_THRESHOLD = 10

export interface HiveState {
  lastTick: string | null
  usageLog: Array<{ capability: string; sessionId: string; timestamp: string }>
}

export interface TickResult {
  name: string
  oldEnergy: number
  newEnergy: number
  wasUsed: boolean
}

function getStatePath(directory: string): string {
  return path.join(directory, ".opencode/agents/hive-state.json")
}

export function readHiveState(directory: string): HiveState {
  try {
    const raw = JSON.parse(fs.readFileSync(getStatePath(directory), "utf8"))
    // Migrate old format: usedCapabilities → empty usageLog
    if (raw.usedCapabilities !== undefined && raw.usageLog === undefined) {
      return { lastTick: raw.lastTick ?? null, usageLog: [] }
    }
    return raw as HiveState
  } catch {
    return { lastTick: null, usageLog: [] }
  }
}

export function writeHiveState(directory: string, state: HiveState): void {
  const statePath = getStatePath(directory)
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8")
}

export function markCapabilityUsed(directory: string, capabilityName: string, sessionId: string): void {
  const state = readHiveState(directory)
  // Deduplicate by (capability + sessionId) pair
  const alreadyLogged = state.usageLog.some(
    (e) => e.capability === capabilityName && e.sessionId === sessionId
  )
  if (!alreadyLogged) {
    state.usageLog.push({ capability: capabilityName, sessionId, timestamp: new Date().toISOString() })
  }
  writeHiveState(directory, state)
}

function updateFrontmatterEnergy(filePath: string, newEnergy: number): void {
  const content = fs.readFileSync(filePath, "utf8")
  const updated = content.replace(/^energy:\s*\d+/m, `energy: ${newEnergy}`)
  if (updated !== content) {
    fs.writeFileSync(filePath, updated, "utf8")
  }
}

export function tickEnergy(directory: string): { results: TickResult[]; warnings: TickResult[]; skipped: boolean } {
  const capabilitiesPath = path.join(directory, ".opencode/agents/capabilities")
  const state = readHiveState(directory)
  const usageLog = state.usageLog || []

  if (usageLog.length === 0) {
    return { results: [], warnings: [], skipped: true }
  }

  if (state.lastTick) {
    const lastTickDate = new Date(state.lastTick).toDateString()
    const todayDate = new Date().toDateString()
    if (lastTickDate === todayDate) {
      return { results: [], warnings: [], skipped: true }
    }
  }

  // Count unique sessions per capability
  const sessionsByCapability = new Map<string, Set<string>>()
  for (const entry of usageLog) {
    if (!sessionsByCapability.has(entry.capability)) {
      sessionsByCapability.set(entry.capability, new Set())
    }
    sessionsByCapability.get(entry.capability)!.add(entry.sessionId)
  }

  let files: string[]
  try {
    files = fs.readdirSync(capabilitiesPath)
  } catch {
    return { results: [], warnings: [], skipped: false }
  }

  const results: TickResult[] = []

  for (const file of files) {
    if (!file.endsWith(".md") || file.startsWith("_")) continue

    const filePath = path.join(capabilitiesPath, file)
    const content = fs.readFileSync(filePath, "utf8")
    const name = file.replace(".md", "")
    const energyMatch = content.match(/^energy:\s*(\d+)/m)
    if (!energyMatch) continue

    // Group 1 exists by construction — the regex only matches with it.
    let energy = parseInt(energyMatch[1]!, 10)
    const uses = sessionsByCapability.get(name)?.size ?? 0
    const wasUsed = uses > 0
    const oldEnergy = energy

    if (wasUsed) {
      const boost = Math.floor(Math.log2(uses + 1) * 10)
      energy += boost
    } else {
      energy -= ENERGY_DECAY
    }
    energy = Math.max(ENERGY_MIN, Math.min(ENERGY_MAX, energy))

    updateFrontmatterEnergy(filePath, energy)
    results.push({ name, oldEnergy, newEnergy: energy, wasUsed })
  }

  writeHiveState(directory, {
    lastTick: new Date().toISOString(),
    usageLog: [],
  })

  const warnings = results.filter((r) => r.newEnergy < DISSOLVE_THRESHOLD)
  return { results, warnings, skipped: false }
}

export function getCapabilitiesSummary(capabilitiesPath: string): string | null {
  let files: string[]
  try {
    files = fs.readdirSync(capabilitiesPath)
  } catch {
    return null
  }

  const capabilities: string[] = []

  for (const file of files) {
    if (!file.endsWith(".md") || file.startsWith("_")) continue

    const content = fs.readFileSync(path.join(capabilitiesPath, file), "utf8")
    const name = file.replace(".md", "")
    const energyMatch = content.match(/^energy:\s*(\d+)/m)
    const descMatch = content.match(/^description:\s*(.+)/m)

    const energy = energyMatch ? energyMatch[1] : "?"
    const desc = descMatch ? descMatch[1] : "no description"

    capabilities.push(`- ${name} (energy: ${energy}) — ${desc}`)
  }

  if (capabilities.length === 0) return null
  return `Active capabilities:\n${capabilities.join("\n")}`
}
