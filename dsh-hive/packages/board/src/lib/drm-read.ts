/**
 * DRM-history readers for the board's Done cross-check — dsh B2.
 *
 * The OpenCode board-transitions.ts pulled makeDrmCompleteCheck/makeDrmArtifacts
 * from board-reconcile.ts (the OpenChamber-bound reconciler, EXCLUDED from the
 * port) and readDreamState/historyDreamPath from dream-state.ts. These two
 * closures are pure DRM-file concerns with no reconciler dependency, so they
 * carry here — BYTE-IDENTICAL bodies — while the DRM file parses through
 * @hive/dsh-dream-archive's published reader (one-parser discipline: the DRM
 * YAML dialect is never forked; a drift there is that package's test suite,
 * not ours).
 *
 * `makeDrmPreCompactionCheck` already lives inside board-transitions.ts
 * (verbatim) and shares this module's parser import.
 */

// `readDreamState` comes from the dream archive package root; the PATH SCHEMA
// (dreams/history/DRM-NNN.yaml) lives at that package's ./lib/dream-state
// subpath export — still the ONE implementation, no copy.
import { readDreamState } from "@hive/dsh-dream-archive"
import { historyDreamPath } from "@hive/dsh-dream-archive/lib/dream-state"

// ── DRM cross-check helpers (bound to the real dream parser) ─────────────────

/** True iff dreams/history/DRM-NNN.yaml exists and is status COMPLETE. */
export function makeDrmCompleteCheck(directory: string): (drm: string) => boolean {
  const cache = new Map<string, boolean>()
  return (drm: string): boolean => {
    const hit = cache.get(drm)
    if (hit !== undefined) return hit
    let complete = false
    try {
      complete = readDreamState(historyDreamPath(directory, drm)).status === "COMPLETE"
    } catch {
      complete = false // no history file → not Done-eligible (belt and braces)
    }
    cache.set(drm, complete)
    return complete
  }
}

/** Artifact ids linked on a COMPLETE DRM (read via the published dream parser). */
export function makeDrmArtifacts(directory: string): (drm: string) => string[] {
  return (drm: string): string[] => {
    try {
      const d = readDreamState(historyDreamPath(directory, drm))
      return [...d.insights, ...d.warnings, ...d.songlines, ...d.shadows]
    } catch {
      return []
    }
  }
}
