/**
 * Dream archive vitals — artifact counts, DRM history, active dream(s).
 *
 * ── Contract (SHADOW-005 / DESIGN §10 / hive-infra, 2026-07-10) ─────────────
 * The DRM/artifact YAML is a hand-rolled dialect whose serialization rules
 * live ONLY in the HIVE plugin. We consume it exclusively through the owner's
 * modules — never by reimplementing the format (SHADOW-005):
 *
 *   "../../lib/dream-state"
 *   "../../lib/dream-artifacts"
 *
 * These were `evolutional-agent-structure/lib/*` subpath imports until the
 * viewer was absorbed into the plugin package; they are now internal relative
 * imports. The PACKAGE boundary is gone, the OWNERSHIP boundary is not: these
 * modules are hive-infra's, and this viewer is a read-only consumer of them.
 *
 * Contract semantics we rely on (stated as stable by the owner):
 *  - path-taking functions receive the WORKSPACE root and append
 *    `.opencode/...` themselves;
 *  - readDreamState takes a FILE PATH (use the exported path builders);
 *  - the modules also export write-side functions (beginDream, writeArtifact,
 *    serialize*) — those are plugin/coordinator-owned and MUST NOT be called
 *    from this read-only viewer (I-049).
 */
import {
  listActiveDreams,
  activeDreamPath,
  historyDreamPath,
  readDreamState,
  dreamsBase,
  type DreamState,
} from "../../lib/dream-state"
import { listArtifacts, type ArtifactType } from "../../lib/dream-artifacts"
import * as fs from "node:fs"
import * as path from "node:path"

export type { ArtifactType }

// ── Public shape (what the renderer sees) ────────────────────────────────────

export interface ArtifactCounts {
  insight: number
  warning: number
  songline: number
  shadow: number
  total: number
}

export interface DreamSummary {
  id: string // DRM-NNN
  status: string | null // DREAMING | COMPLETE — null if the file was unreadable
  intention: string | null
  intentionType: string | null
  depth: number | null
  entryTime: string | null
  exitTime: string | null
  /** Artifact ids linked in the DRM (I-/W-/SNG-/SHADOW-). */
  artifacts: string[]
}

export interface RecentArtifact {
  id: string
  type: ArtifactType
  sourceDream: string
  summary: string
}

export interface DreamVitals {
  artifactCounts: ArtifactCounts
  /** Dreams currently in dreams/active/ (normally 0 or 1). */
  active: DreamSummary[]
  /** dreams/history/, newest first. */
  history: DreamSummary[]
  /** Highest-numbered artifacts, newest first. */
  recentArtifacts: RecentArtifact[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function drmNumber(id: string): number {
  const m = id.match(/^DRM-(\d+)$/)
  return m ? parseInt(m[1]!, 10) : -1
}

function artifactNumber(id: string): number {
  const m = id.match(/-(\d+)$/)
  return m ? parseInt(m[1]!, 10) : -1
}

function toSummary(d: DreamState): DreamSummary {
  return {
    id: d.dream_id,
    status: d.status ?? null,
    intention: d.intention ?? null,
    intentionType: d.intention_type ?? null,
    depth: d.depth ?? null,
    entryTime: d.entry_time ?? null,
    exitTime: d.exit_time ?? null,
    artifacts: [
      ...(d.insights ?? []),
      ...(d.warnings ?? []),
      ...(d.songlines ?? []),
      ...(d.shadows ?? []),
    ],
  }
}

function bareSummary(id: string): DreamSummary {
  return {
    id,
    status: null,
    intention: null,
    intentionType: null,
    depth: null,
    entryTime: null,
    exitTime: null,
    artifacts: [],
  }
}

/** Read one DRM defensively — an unreadable file must not take the board down. */
function readSafe(filePath: string, id: string): DreamSummary {
  try {
    return toSummary(readDreamState(filePath))
  } catch {
    return bareSummary(id)
  }
}

/** DRM ids in dreams/history/ (filenames only — ids, not YAML). */
function listHistoryDreamIds(workspaceRoot: string): string[] {
  const dir = path.join(dreamsBase(workspaceRoot), "history")
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^DRM-\d+\.yaml$/.test(f))
      .map((f) => f.slice(0, -".yaml".length))
  } catch {
    return []
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function loadDreamVitals(workspaceRoot: string): DreamVitals {
  // listActiveDreams returns filenames (DRM-NNN.yaml) — normalize to ids.
  const activeIds = listActiveDreams(workspaceRoot)
    .map((f) => f.replace(/\.yaml$/, ""))
    .sort((a, b) => drmNumber(b) - drmNumber(a))
  const historyIds = listHistoryDreamIds(workspaceRoot).sort((a, b) => drmNumber(b) - drmNumber(a))

  const active = activeIds.map((id) => readSafe(activeDreamPath(workspaceRoot, id), id))
  const history = historyIds.map((id) => readSafe(historyDreamPath(workspaceRoot, id), id))

  const counts: ArtifactCounts = { insight: 0, warning: 0, songline: 0, shadow: 0, total: 0 }
  let recentArtifacts: RecentArtifact[] = []
  try {
    const index = listArtifacts(workspaceRoot)
    for (const e of index) {
      counts[e.type]++
      counts.total++
    }
    // Ids are sequential PER TYPE, so "recent" is only meaningful within a
    // type — take the latest two of each stream (insight/warning/songline/shadow).
    for (const type of ["insight", "warning", "songline", "shadow"] as ArtifactType[]) {
      const latest = index
        .filter((e) => e.type === type)
        .sort((a, b) => artifactNumber(b.id) - artifactNumber(a.id))
        .slice(0, 2)
      recentArtifacts.push(
        ...latest.map((e) => ({ id: e.id, type: e.type, sourceDream: e.source_dream, summary: e.summary })),
      )
    }
  } catch {
    // artifact index unavailable — dreams still render
  }

  return { artifactCounts: counts, active, history, recentArtifacts }
}
