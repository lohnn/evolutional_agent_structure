import path from "path";
import fs from "fs";

export async function snapshotAgentsMtime(agentsPath) {
  const snapshot = {};

  async function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        const s = fs.statSync(full);
        if (s.isDirectory()) {
          await walk(full);
        } else if (entry.endsWith(".md")) {
          snapshot[full] = s.mtimeMs;
        }
      } catch {
        // ignore
      }
    }
  }

  await walk(agentsPath);
  return snapshot;
}

export function snapshotChanged(prev, next) {
  const prevKeys = Object.keys(prev).sort();
  const nextKeys = Object.keys(next).sort();
  if (prevKeys.length !== nextKeys.length) return true;
  if (prevKeys.join("\0") !== nextKeys.join("\0")) return true;
  for (const key of prevKeys) {
    if (prev[key] !== next[key]) return true;
  }
  return false;
}
