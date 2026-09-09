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
import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { parseArtifact, serializeInsight, serializeWarning, serializeSongline, serializeShadow, serializeArtifact, idToType, appendFieldsToArtifact, tokenise, jaccard, type ArtifactType, type InsightArtifact, type WarningArtifact, type SonglineArtifact, type ShadowArtifact, type ArtifactRecord, type ArtifactEntry, type QueryFilter, type QueryResult, type ListEntry, type DuplicateCandidate } from "./lib/dream-artifacts.js";
import { parseDreamState, readDreamState, serializeDreamState, beginDream, type IntentionType, type DreamStatus, type CoherenceLevel, type ContextSignals, type DreamState, type PreCompactionDream, type BeginResult, type CompleteResult } from "./lib/dream-state.js";
import { formatHarvestForDreamer, type ResidueKind, type JournalEntry } from "./lib/dream-journal.js";
import { type RankedArtifact, type RankResult, type RankOptions } from "./lib/dream-rank.js";
import { type SurfacedEvent } from "./lib/dream-telemetry.js";
export interface DreamArchiveConfig {
    /**
     * Workspace root — the directory that CONTAINS `.opencode/`.
     * Defaults to the process cwd (dsh runs pinned to the workspace).
     */
    directory?: string;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dreamArchive: DreamArchive;
    }
}
/**
 * The archive service. Every method takes the same arguments as the
 * underlying lib function minus the leading `directory`, which the service
 * holds from config. Read-only methods are marked; the rest write.
 */
export declare class DreamArchive extends Service {
    static Config: z<Schemastery.ObjectS<{
        directory: any;
    }>, Schemastery.ObjectT<{
        directory: any;
    }>>;
    readonly directory: string;
    constructor(ctx: import("@deepseek-ai/cordis").Context, config: DreamArchiveConfig);
    artifactsDir: () => string;
    artifactSubdir: (type: ArtifactType) => string;
    artifactPath: (type: ArtifactType, id: string) => string;
    nextArtifactId: (type: ArtifactType) => string;
    readArtifact: (type: ArtifactType, id: string) => ArtifactRecord | null;
    writeArtifact: (artifact: ArtifactRecord) => string;
    scanArtifacts: (types?: ArtifactType[]) => ArtifactEntry[];
    query: (filter: QueryFilter) => QueryResult;
    pathForId: (id: string) => string | null;
    list: (opts?: {
        types?: ArtifactType[];
        source_dream?: string;
    }) => ListEntry[];
    appendFieldsToArtifact: typeof appendFieldsToArtifact;
    detectDuplicates: (minScore?: number, maxScore?: number) => DuplicateCandidate[];
    dreamsBase: () => string;
    activeDreamPath: (id: string) => string;
    historyDreamPath: (id: string) => string;
    nextDreamId: () => string;
    listActiveDreams: () => string[];
    recentPreCompactionDreams: (limit?: number) => PreCompactionDream[];
    begin: (state: Parameters<typeof beginDream>[1]) => BeginResult;
    complete: (exitTime: string, artifactIds: string[]) => CompleteResult;
    appendResidue: (capabilityName: string, sessionID: string, content: string, kind?: ResidueKind) => void;
    harvest: (clear?: boolean) => JournalEntry[];
    formatHarvestForDreamer: typeof formatHarvestForDreamer;
    rank: (query: string, opts?: RankOptions) => RankResult;
    recordSurfacedEvent: (sessionID: string, tool: string, queryText: string, surfacedIds: string[], total: number) => void;
}
export default DreamArchive;
export { parseArtifact, serializeArtifact, serializeInsight, serializeWarning, serializeSongline, serializeShadow, idToType, tokenise, jaccard, type ArtifactType, type InsightArtifact, type WarningArtifact, type SonglineArtifact, type ShadowArtifact, type ArtifactRecord, type ArtifactEntry, type QueryFilter, type QueryResult, type ListEntry, type DuplicateCandidate, parseDreamState, readDreamState, serializeDreamState, type IntentionType, type DreamStatus, type CoherenceLevel, type ContextSignals, type DreamState, type PreCompactionDream, type BeginResult, type CompleteResult, type ResidueKind, type JournalEntry, type RankedArtifact, type RankResult, type RankOptions, type SurfacedEvent, };
export declare const name = "dream-archive";
export declare const inject: string[];
