import path from "path"
import fs from "fs"

export async function snapshotAgentsMtime(agentsPath: string): Promise<Record<string, number>> {
  const snapshot: Record<string, number> = {}

  function walk(dir: string) {
    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry)
      try {
        const s = fs.statSync(full)
        if (s.isDirectory()) {
          walk(full)
        } else if (entry.endsWith(".md")) {
          snapshot[full] = s.mtimeMs
        }
      } catch {
        // ignore
      }
    }
  }

  walk(agentsPath)
  return snapshot
}

export function snapshotChanged(prev: Record<string, number>, next: Record<string, number>): boolean {
  const prevKeys = Object.keys(prev).sort()
  const nextKeys = Object.keys(next).sort()
  if (prevKeys.length !== nextKeys.length) return true
  if (prevKeys.join("\0") !== nextKeys.join("\0")) return true
  for (const key of prevKeys) {
    if (prev[key] !== next[key]) return true
  }
  return false
}
