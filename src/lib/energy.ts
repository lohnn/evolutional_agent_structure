import path from "path"
import fs from "fs"

const ENERGY_DECAY = 10
const ENERGY_BOOST = 10
const ENERGY_MIN = 0
const ENERGY_MAX = 100
const DISSOLVE_THRESHOLD = 10

export interface HiveState {
  lastTick: string | null
  usedCapabilities: string[]
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
    return JSON.parse(fs.readFileSync(getStatePath(directory), "utf8"))
  } catch {
    return { lastTick: null, usedCapabilities: [] }
  }
}

export function writeHiveState(directory: string, state: HiveState): void {
  const statePath = getStatePath(directory)
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8")
}

export function markCapabilityUsed(directory: string, capabilityName: string): void {
  const state = readHiveState(directory)
  if (!state.usedCapabilities.includes(capabilityName)) {
    state.usedCapabilities.push(capabilityName)
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
  const usedSet = new Set(state.usedCapabilities || [])

  if (usedSet.size === 0) {
    return { results: [], warnings: [], skipped: true }
  }

  if (state.lastTick) {
    const lastTickDate = new Date(state.lastTick).toDateString()
    const todayDate = new Date().toDateString()
    if (lastTickDate === todayDate) {
      return { results: [], warnings: [], skipped: true }
    }
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

    let energy = parseInt(energyMatch[1], 10)
    const wasUsed = usedSet.has(name)
    const oldEnergy = energy

    if (wasUsed) {
      energy += ENERGY_BOOST
    } else {
      energy -= ENERGY_DECAY
    }
    energy = Math.max(ENERGY_MIN, Math.min(ENERGY_MAX, energy))

    updateFrontmatterEnergy(filePath, energy)
    results.push({ name, oldEnergy, newEnergy: energy, wasUsed })
  }

  writeHiveState(directory, {
    lastTick: new Date().toISOString(),
    usedCapabilities: [],
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
