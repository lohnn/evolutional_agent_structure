/**
 * @hive/dsh-dream-archive — the dream archive as a dsh Service.
 *
 * Exposes `ctx.dreamArchive`: the complete read/write surface over the
 * handrolled-YAML dream archive at `<workspace>/.opencode/dreams` (artifacts,
 * DRM state files, residue journals, rank, telemetry).
 *
 * The lib modules under `./lib/` are VERBATIM ports of the OpenCode HIVE
 * plugin's `src/lib/dream-*.ts` + `text-tokens.ts` — only imports change.
 * File formats are byte-identical by construction: same serializers, same IO.
 *
 * Phase 1 registers NO tools (service only). Tools land in `@hive/dsh-tools`.
 */

import { Service } from "@deepseek-ai/cordis"
import z from "@deepseek-ai/schemastery"

import {
  artifactsDir,
  artifactSubdir,
  artifactPath,
  nextArtifactId,
  parseArtifact,
  readArtifact,
  serializeInsight,
  serializeWarning,
  serializeSongline,
  serializeShadow,
  serializeArtifact,
  writeArtifact,
  scanArtifacts,
  queryArtifacts,
  idToType,
  pathForId,
  listArtifacts,
  appendFieldsToArtifact,
  detectDuplicateCandidates,
  tokenise,
  jaccard,
  type ArtifactType,
  type InsightArtifact,
  type WarningArtifact,
  type SonglineArtifact,
  type ShadowArtifact,
  type ArtifactRecord,
  type ArtifactEntry,
  type QueryFilter,
  type QueryResult,
  type ListEntry,
  type DuplicateCandidate,
} from "./lib/dream-artifacts.js"
import {
  dreamsBase,
  activeDreamPath,
  historyDreamPath,
  nextDreamId,
  listActiveDreams,
  recentPreCompactionDreams,
  parseDreamState,
  readDreamState,
  serializeDreamState,
  beginDream,
  completeDream,
  type IntentionType,
  type DreamStatus,
  type CoherenceLevel,
  type ContextSignals,
  type DreamState,
  type PreCompactionDream,
  type BeginResult,
  type CompleteResult,
} from "./lib/dream-state.js"
import {
  appendResidue,
  harvestJournals,
  formatHarvestForDreamer,
  type ResidueKind,
  type JournalEntry,
} from "./lib/dream-journal.js"
import {
  rankArtifacts,
  type RankedArtifact,
  type RankResult,
  type RankOptions,
} from "./lib/dream-rank.js"
import {
  recordSurfacedEvent,
  type SurfacedEvent,
} from "./lib/dream-telemetry.js"

export interface DreamArchiveConfig {
  /**
   * Workspace root — the directory that CONTAINS `.opencode/`.
   * Defaults to the process cwd (dsh runs pinned to the workspace).
   */
  directory?: string
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    dreamArchive: DreamArchive
  }
}

/**
 * The archive service. Every method takes the same arguments as the
 * underlying lib function minus the leading `directory`, which the service
 * holds from config. Read-only methods are marked; the rest write.
 */
export class DreamArchive extends Service {
  static Config = z.object({
    // Workspace root (the dir containing `.opencode/`). Default: process cwd.
    directory: z.string().default(process.cwd()),
  })

  readonly directory: string

  constructor(ctx: import("@deepseek-ai/cordis").Context, config: { directory: string }) {
    super(ctx, "dreamArchive")
    this.directory = config.directory
  }

  // ── artifacts ─────────────────────────────────────────────────────────────
  artifactsDir = () => artifactsDir(this.directory)
  artifactSubdir = (type: ArtifactType) => artifactSubdir(this.directory, type)
  artifactPath = (type: ArtifactType, id: string) => artifactPath(this.directory, type, id)
  nextArtifactId = (type: ArtifactType) => nextArtifactId(this.directory, type)
  readArtifact = (type: ArtifactType, id: string) => readArtifact(this.directory, type, id)
  writeArtifact = (artifact: ArtifactRecord) => writeArtifact(this.directory, artifact)
  scanArtifacts = (types?: ArtifactType[]) => scanArtifacts(this.directory, types)
  query = (filter: QueryFilter) => queryArtifacts(this.directory, filter)
  pathForId = (id: string) => pathForId(this.directory, id)
  list = (opts: { types?: ArtifactType[]; source_dream?: string } = {}) =>
    listArtifacts(this.directory, opts)
  appendFieldsToArtifact = appendFieldsToArtifact
  detectDuplicates = (minScore?: number, maxScore?: number) =>
    detectDuplicateCandidates(this.directory, minScore, maxScore)

  // ── dream state (DRM lifecycle) ───────────────────────────────────────────
  dreamsBase = () => dreamsBase(this.directory)
  activeDreamPath = (id: string) => activeDreamPath(this.directory, id)
  historyDreamPath = (id: string) => historyDreamPath(this.directory, id)
  nextDreamId = () => nextDreamId(this.directory)
  listActiveDreams = () => listActiveDreams(this.directory)
  recentPreCompactionDreams = (limit?: number) => recentPreCompactionDreams(this.directory, limit)
  begin = (state: Parameters<typeof beginDream>[1]) => beginDream(this.directory, state)
  complete = (exitTime: string, artifactIds: string[]) =>
    completeDream(this.directory, exitTime, artifactIds)

  // ── residue journals ──────────────────────────────────────────────────────
  appendResidue = (capabilityName: string, sessionID: string, content: string, kind?: ResidueKind) =>
    appendResidue(this.directory, capabilityName, sessionID, content, kind)
  harvest = (clear?: boolean) => harvestJournals(this.directory, clear)
  formatHarvestForDreamer = formatHarvestForDreamer

  // ── rank (read-only) ──────────────────────────────────────────────────────
  rank = (query: string, opts?: RankOptions) => rankArtifacts(this.directory, query, opts)

  // ── telemetry (write-only side channel; never feeds ranking) ─────────────
  recordSurfacedEvent = (sessionID: string, tool: string, queryText: string, surfacedIds: string[], total: number) =>
    recordSurfacedEvent(this.directory, sessionID, tool, queryText, surfacedIds, total)
}

export default DreamArchive

// Re-export the lib surface so consumers (tools, tests) can import types and
// the few pure helpers (parse/serialize/idToType) from one place.
export {
  // dream-artifacts
  parseArtifact,
  serializeArtifact,
  serializeInsight,
  serializeWarning,
  serializeSongline,
  serializeShadow,
  idToType,
  tokenise,
  jaccard,
  type ArtifactType,
  type InsightArtifact,
  type WarningArtifact,
  type SonglineArtifact,
  type ShadowArtifact,
  type ArtifactRecord,
  type ArtifactEntry,
  type QueryFilter,
  type QueryResult,
  type ListEntry,
  type DuplicateCandidate,
  // dream-state
  parseDreamState,
  readDreamState,
  serializeDreamState,
  type IntentionType,
  type DreamStatus,
  type CoherenceLevel,
  type ContextSignals,
  type DreamState,
  type PreCompactionDream,
  type BeginResult,
  type CompleteResult,
  // dream-journal
  type ResidueKind,
  type JournalEntry,
  // dream-rank
  type RankedArtifact,
  type RankResult,
  type RankOptions,
  // dream-telemetry
  type SurfacedEvent,
}

// dsh loader contract: a class plugin is applied by constructing it.
export const name = "dream-archive"
export const inject: string[] = []
