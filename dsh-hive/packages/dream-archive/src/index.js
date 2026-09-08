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
import { artifactsDir, artifactSubdir, artifactPath, nextArtifactId, parseArtifact, readArtifact, serializeInsight, serializeWarning, serializeSongline, serializeShadow, serializeArtifact, writeArtifact, scanArtifacts, queryArtifacts, idToType, pathForId, listArtifacts, appendFieldsToArtifact, detectDuplicateCandidates, tokenise, jaccard, } from "./lib/dream-artifacts.js";
import { dreamsBase, activeDreamPath, historyDreamPath, nextDreamId, listActiveDreams, recentPreCompactionDreams, parseDreamState, readDreamState, serializeDreamState, beginDream, completeDream, } from "./lib/dream-state.js";
import { appendResidue, harvestJournals, formatHarvestForDreamer, } from "./lib/dream-journal.js";
import { rankArtifacts, } from "./lib/dream-rank.js";
import { recordSurfacedEvent, } from "./lib/dream-telemetry.js";
/**
 * The archive service. Every method takes the same arguments as the
 * underlying lib function minus the leading `directory`, which the service
 * holds from config. Read-only methods are marked; the rest write.
 */
export class DreamArchive extends Service {
    static Config = z.object({
        directory: z.string().optional(),
    });
    directory;
    constructor(ctx, config) {
        super(ctx, "dreamArchive");
        this.directory = config.directory ?? process.cwd();
    }
    // ── artifacts ─────────────────────────────────────────────────────────────
    artifactsDir = () => artifactsDir(this.directory);
    artifactSubdir = (type) => artifactSubdir(this.directory, type);
    artifactPath = (type, id) => artifactPath(this.directory, type, id);
    nextArtifactId = (type) => nextArtifactId(this.directory, type);
    readArtifact = (type, id) => readArtifact(this.directory, type, id);
    writeArtifact = (artifact) => writeArtifact(this.directory, artifact);
    scanArtifacts = (types) => scanArtifacts(this.directory, types);
    query = (filter) => queryArtifacts(this.directory, filter);
    pathForId = (id) => pathForId(this.directory, id);
    list = (opts = {}) => listArtifacts(this.directory, opts);
    appendFieldsToArtifact = appendFieldsToArtifact;
    detectDuplicates = (minScore, maxScore) => detectDuplicateCandidates(this.directory, minScore, maxScore);
    // ── dream state (DRM lifecycle) ───────────────────────────────────────────
    dreamsBase = () => dreamsBase(this.directory);
    activeDreamPath = (id) => activeDreamPath(this.directory, id);
    historyDreamPath = (id) => historyDreamPath(this.directory, id);
    nextDreamId = () => nextDreamId(this.directory);
    listActiveDreams = () => listActiveDreams(this.directory);
    recentPreCompactionDreams = (limit) => recentPreCompactionDreams(this.directory, limit);
    begin = (state) => beginDream(this.directory, state);
    complete = (exitTime, artifactIds) => completeDream(this.directory, exitTime, artifactIds);
    // ── residue journals ──────────────────────────────────────────────────────
    appendResidue = (capabilityName, sessionID, content, kind) => appendResidue(this.directory, capabilityName, sessionID, content, kind);
    harvest = (clear) => harvestJournals(this.directory, clear);
    formatHarvestForDreamer = formatHarvestForDreamer;
    // ── rank (read-only) ──────────────────────────────────────────────────────
    rank = (query, opts) => rankArtifacts(this.directory, query, opts);
    // ── telemetry (write-only side channel; never feeds ranking) ─────────────
    recordSurfacedEvent = (sessionID, tool, queryText, surfacedIds, total) => recordSurfacedEvent(this.directory, sessionID, tool, queryText, surfacedIds, total);
}
export default DreamArchive;
// Re-export the lib surface so consumers (tools, tests) can import types and
// the few pure helpers (parse/serialize/idToType) from one place.
export { 
// dream-artifacts
parseArtifact, serializeArtifact, serializeInsight, serializeWarning, serializeSongline, serializeShadow, idToType, tokenise, jaccard, 
// dream-state
parseDreamState, readDreamState, serializeDreamState, };
// dsh loader contract: a class plugin is applied by constructing it.
export const name = "dream-archive";
export const inject = [];
