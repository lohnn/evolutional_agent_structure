import path from "path";
import fs from "fs";

const ENERGY_DECAY = 10;
const ENERGY_BOOST = 10;
const ENERGY_MIN = 0;
const ENERGY_MAX = 100;
const DISSOLVE_THRESHOLD = 10;

// ── State file ────────────────────────────────────────────────────────────────

function getStatePath(directory) {
  return path.join(directory, ".opencode/agents/hive-state.json");
}

export function readHiveState(directory) {
  try {
    return JSON.parse(fs.readFileSync(getStatePath(directory), "utf8"));
  } catch {
    return { lastTick: null, usedCapabilities: [] };
  }
}

export function writeHiveState(directory, state) {
  const statePath = getStatePath(directory);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

export function markCapabilityUsed(directory, capabilityName) {
  const state = readHiveState(directory);
  if (!state.usedCapabilities.includes(capabilityName)) {
    state.usedCapabilities.push(capabilityName);
  }
  writeHiveState(directory, state);
}

// ── Frontmatter energy update ─────────────────────────────────────────────────

function updateFrontmatterEnergy(filePath, newEnergy) {
  const content = fs.readFileSync(filePath, "utf8");
  const updated = content.replace(/^energy:\s*\d+/m, `energy: ${newEnergy}`);
  if (updated !== content) {
    fs.writeFileSync(filePath, updated, "utf8");
  }
}

// ── Tick ──────────────────────────────────────────────────────────────────────

/**
 * Apply one energy tick to all capabilities.
 *
 * Guard conditions (either skips the tick):
 *   - usedCapabilities is empty (no HIVE activity since last tick)
 *   - lastTick is already today (at most one tick per calendar day)
 *
 * Returns { results, warnings, skipped }
 */
export function tickEnergy(directory) {
  const capabilitiesPath = path.join(directory, ".opencode/agents/capabilities");
  const state = readHiveState(directory);
  const usedSet = new Set(state.usedCapabilities || []);

  if (usedSet.size === 0) {
    return { results: [], warnings: [], skipped: true };
  }

  if (state.lastTick) {
    const lastTickDate = new Date(state.lastTick).toDateString();
    const todayDate = new Date().toDateString();
    if (lastTickDate === todayDate) {
      return { results: [], warnings: [], skipped: true };
    }
  }

  let files;
  try {
    files = fs.readdirSync(capabilitiesPath);
  } catch {
    return { results: [], warnings: [], skipped: false };
  }

  const results = [];

  for (const file of files) {
    if (!file.endsWith(".md") || file.startsWith("_")) continue;

    const filePath = path.join(capabilitiesPath, file);
    const content = fs.readFileSync(filePath, "utf8");
    const name = file.replace(".md", "");
    const energyMatch = content.match(/^energy:\s*(\d+)/m);
    if (!energyMatch) continue;

    let energy = parseInt(energyMatch[1], 10);
    const wasUsed = usedSet.has(name);
    const oldEnergy = energy;

    energy -= ENERGY_DECAY;
    if (wasUsed) energy += ENERGY_BOOST;
    energy = Math.max(ENERGY_MIN, Math.min(ENERGY_MAX, energy));

    updateFrontmatterEnergy(filePath, energy);
    results.push({ name, oldEnergy, newEnergy: energy, wasUsed });
  }

  writeHiveState(directory, {
    lastTick: new Date().toISOString(),
    usedCapabilities: [],
  });

  const warnings = results.filter((r) => r.newEnergy < DISSOLVE_THRESHOLD);
  return { results, warnings, skipped: false };
}

// ── Compaction summary ────────────────────────────────────────────────────────

/**
 * Returns a compact summary of active capabilities for compaction context.
 */
export function getCapabilitiesSummary(capabilitiesPath) {
  let files;
  try {
    files = fs.readdirSync(capabilitiesPath);
  } catch {
    return null;
  }

  const capabilities = [];

  for (const file of files) {
    if (!file.endsWith(".md") || file.startsWith("_")) continue;

    const content = fs.readFileSync(path.join(capabilitiesPath, file), "utf8");
    const name = file.replace(".md", "");
    const energyMatch = content.match(/^energy:\s*(\d+)/m);
    const descMatch = content.match(/^description:\s*(.+)/m);

    const energy = energyMatch ? energyMatch[1] : "?";
    const desc = descMatch ? descMatch[1] : "no description";

    capabilities.push(`- ${name} (energy: ${energy}) — ${desc}`);
  }

  if (capabilities.length === 0) return null;
  return `Active capabilities:\n${capabilities.join("\n")}`;
}
