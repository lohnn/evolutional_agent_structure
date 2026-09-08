/**
 * Dream artifact ranking — server-side pre-filter for dreamcatcher Recall.
 *
 * Purpose: at archive scale, Recall must not read the whole archive. This
 * module scores every artifact against a free-text query and returns a top-k
 * shortlist (id + excerpt); the caller pulls full content for the entries it
 * judges promising via hive_dream_query(ids: ...). Pre-filter, not replacement:
 * semantic relevance judgment stays with the calling agent.
 *
 * Backend ladder (contract-first design — DESIGN-storage-improvements.md §9.1):
 *   v1 "token-v1" (this file): zero-dep token scoring. Query-token coverage of
 *       the artifact's text + a domain-tag boost. Exact, brute-force, fine at
 *       any plausible archive size (191 KB at N=166).
 *   v2 "embedding-v1" (future, at the §11 size trigger): cosine over a derived
 *       embedding sidecar. Swaps in behind the SAME RankedArtifact contract and
 *       tool surface — callers and the dreamcatcher prompt do not change.
 *
 * Contract-level guarantees (these survive any backend swap):
 *   - Type floors: top-k naively favours insights (89 of 166); shadows and
 *     warnings get guaranteed slots so shadow-first bias survives the shortlist.
 *   - Trigger bypass: warnings/shadows whose trigger_conditions literally
 *     overlap the query are included regardless of score — trigger conditions
 *     are DESIGNED to be matched literally; that is their job.
 *
 * Scoring note (deliberate deviation from plain Jaccard): for query-vs-document
 * matching, symmetric Jaccard punishes long artifacts — a 3-token query against
 * a 100-token artifact caps at ~0.03 even on a perfect hit. We use query
 * COVERAGE (|q ∩ d| / |q|) instead: "how much of the query's meaning does this
 * artifact touch". Jaccard remains the right tool for the pairwise duplicate
 * detector, where both sides are documents.
 *
 * This module is strictly READ-ONLY over the archive (Class A untouched) and
 * must never read telemetry (invariant: telemetry never feeds ranking — an
 * undamped popularity feedback loop; see dream-telemetry.ts).
 */
import { type ArtifactType } from "./dream-artifacts.js";
export interface RankedArtifact {
    id: string;
    type: ArtifactType;
    score: number;
    source_dream: string;
    excerpt: string;
    flags: string[];
}
export interface RankResult {
    results: RankedArtifact[];
    total: number;
    backend: string;
}
export interface RankOptions {
    k?: number;
    types?: ArtifactType[];
}
export declare function rankArtifacts(directory: string, query: string, opts?: RankOptions): RankResult;
