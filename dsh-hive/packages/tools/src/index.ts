/**
 * @hive/dsh-tools — the 9 hive_dream_* tools, mechanical port from OpenCode
 * `tool({})` to dsh `defineTool({})`.
 *
 * Every tool's execute body calls `ctx.dreamArchive` (the Phase-1 service) —
 * the business logic is the SAME code that ran under OpenCode, minus the
 * NervousSystem/board hooks that are Phase-3/4 concerns:
 *   - hive_dream_residue: caller identity resolves from exec.agent (no roster).
 *   - hive_dream_complete: the board promotion hook is omitted (the board is a
 *     deferred subsystem); everything else is identical.
 * Tool execute bodies return the model-facing STRING; output.schema is
 * `string` and output.render wraps it in a text ContentBlock (the spike's
 * 0.1 pattern). defineTool() validates args against parameters before execute.
 */

import { defineTool } from "@deepseek-ai/dsh-tools"
import type { ContentBlock } from "@deepseek-ai/dsh-llm"
import fs from "fs"
import path from "path"
import {
  serializeArtifact,
  idToType,
  type ArtifactType,
  type InsightArtifact,
  type WarningArtifact,
  type SonglineArtifact,
  type ShadowArtifact,
  type IntentionType,
  type CoherenceLevel,
  type ResidueKind,
} from "@hive/dsh-dream-archive"

declare module "@deepseek-ai/cordis" {
  interface Context {
    tools: import("@deepseek-ai/dsh-tools").ToolRuntime
  }
}

type DreamToolsCtx = import("@deepseek-ai/cordis").Context & {
  dreamArchive: import("@hive/dsh-dream-archive").DreamArchive
}

const TEXT_OUT = {
  schema: { type: "string" },
  render: (_args: unknown, value: string): ContentBlock[] => [{ type: "text", text: value }],
} as const

/** Resolve caller identity (capability name, session id) from the dsh exec ctx. */
function resolveCaller(exec: { agent?: unknown }): { caller: string | null; sessionID: string } {
  const agent = exec.agent as { session?: { id?: string }; id?: string } | undefined
  const sessionID = agent?.session?.id ?? agent?.id ?? "unknown-session"
  const caller = agent?.id ?? null
  return { caller, sessionID }
}

const debug = () => process.env.HIVE_DEBUG === "1"

// ── parameter fragments (shared shapes) ──────────────────────────────────────
const str = (description: string) => ({ type: "string", description } as const)
const reqStr = (description: string) => ({ type: "string", required: true, description } as const)
const bool = (description: string) => ({ type: "boolean", description } as const)
const num = (description: string) => ({ type: "number", description } as const)

export function apply(ctx: DreamToolsCtx) {
  const arc = () => ctx.dreamArchive
  const log = (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) =>
    ctx.logger?.[level]?.(msg, extra)

  const registrations = [
    // ── hive_dream_residue ──────────────────────────────────────────────────
    defineTool({
      name: "hive_dream_residue",
      description:
        "Persist a delta of dream-worthy learnings to your capability's journal. " +
        "Call this whenever you encounter something worth preserving across sessions: " +
        "a hard-won insight, a dead-end to avoid, a surprising behaviour, an unresolved tension, or an ambient 'something felt wrong' signal. " +
        "Write only what is NEW this turn — do not re-summarise prior entries. " +
        "The tool resolves your identity automatically; you do NOT pass your own name. " +
        "These journals feed the dreamtime consolidation workflow so learnings survive context resets.",
      parameters: {
        content: reqStr("The residue note — new learnings, dead-ends, warnings, or signals worth preserving. Write only what is new this turn."),
        kind: {
          type: "string",
          enum: ["insight", "warning", "shadow", "note"],
          description: "Category hint: insight (discovery), warning (hazard), shadow (unresolved tension), note (general observation)",
        },
      },
      output: TEXT_OUT,
      async execute(args, exec) {
        const { caller, sessionID } = resolveCaller(exec)
        if (!caller) {
          log("warn", "[dream_residue] could not resolve capability from session — residue not written", { sessionID })
          return "Warning: could not resolve capability identity. Residue was NOT written."
        }
        arc().appendResidue(caller, sessionID, args.content, args.kind as ResidueKind | undefined)
        return `Residue appended to journal for \`${caller}\`${args.kind ? ` [${args.kind}]` : ""}.`
      },
    }),

    // ── hive_dream_harvest ──────────────────────────────────────────────────
    defineTool({
      name: "hive_dream_harvest",
      description:
        "Read all accumulated capability dream journals and return their contents as feedstock for dreamtime consolidation. " +
        "Use this at the start of a dreamtime workflow to collect what capabilities have learned. " +
        "By default, journals are atomically archived after reading so the next session starts clean (peek=true skips archiving). " +
        "Only the dreamtime workflow should call this — individual capabilities should use hive_dream_residue instead.",
      parameters: {
        peek: bool("If true, read journals without archiving them (non-destructive peek). Default false — harvest and archive."),
      },
      output: TEXT_OUT,
      async execute(args) {
        const entries = arc().harvest(!args.peek)
        log("info", `[dream_harvest] harvested ${entries.length} journals`, { clear: !args.peek })
        return arc().formatHarvestForDreamer(entries)
      },
    }),

    // ── hive_dream_artifact_create ──────────────────────────────────────────
    defineTool({
      name: "hive_dream_artifact_create",
      description:
        "Create a permanent dream artifact (insight, warning, songline, or shadow) in the dream archive. " +
        "The server assigns the next sequential ID and writes to the correct subdirectory — you do NOT pick the ID. " +
        "Use this during a dreamtime workflow when compression produces a new artifact worth persisting. " +
        "Fields vary by type — insight: confidence/domain_tags/content/actionable/previously_invisible_because; " +
        "warning: confidence/justifiable/content/trigger_conditions; " +
        "songline: domain_tags/transfer_rating/narrative/encoded_principles; " +
        "shadow: weight/content/location/nature/severity/trigger_conditions/resolution_hint. " +
        "All types require source_dream (e.g. 'DRM-015'). Returns the assigned ID and file path.",
      parameters: {
        type: { type: "string", required: true, enum: ["insight", "warning", "songline", "shadow"], description: "Artifact type" },
        source_dream: reqStr("Dream ID this artifact was produced in (e.g. DRM-015)"),
        confidence: num("(insight, warning) Confidence 0.0–1.0"),
        domain_tags: str("(insight, songline) Comma-separated tags e.g. 'plugin-design,file-io'"),
        content: str("(insight, warning, shadow) Core content of the artifact"),
        actionable: bool("(insight) Whether this insight is immediately actionable"),
        previously_invisible_because: str("(insight) Why this wasn't obvious before compression"),
        justifiable: { type: "string", enum: ["FULLY", "PARTIALLY", "INTUITION_ONLY"], description: "(warning) How well the warning can be justified" },
        trigger_conditions: str("(warning, shadow) Newline-separated conditions that should surface this artifact"),
        transfer_rating: num("(songline) Transfer rating 0.0–1.0"),
        narrative: str("(songline) The story that encodes the principle. Use metaphor."),
        encoded_principles: str("(songline) Newline-separated principles encoded in the narrative"),
        weight: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"], description: "(shadow) Severity weight of this knowledge loss" },
        location: str("(shadow) Where the lost knowledge applied"),
        nature: str("(shadow) What kind of knowledge was lost"),
        severity: str("(shadow) How bad it is that this is lost"),
        resolution_hint: str("(shadow) Any partial memory of what the resolution was"),
      },
      output: TEXT_OUT,
      async execute(args) {
        const type = args.type as ArtifactType
        const id = arc().nextArtifactId(type)
        const splitLines = (s?: string): string[] =>
          s ? s.split("\n").map((l) => l.trim()).filter(Boolean) : []
        const splitTags = (s?: string): string[] =>
          s ? s.split(",").map((t) => t.trim()).filter(Boolean) : []

        let artifact: InsightArtifact | WarningArtifact | SonglineArtifact | ShadowArtifact

        if (type === "insight") {
          if (args.content === undefined || args.confidence === undefined ||
              args.actionable === undefined || args.previously_invisible_because === undefined) {
            return "Error: insight requires content, confidence, actionable, and previously_invisible_because."
          }
          artifact = {
            type: "insight",
            insight_id: id,
            source_dream: args.source_dream,
            confidence: args.confidence,
            domain_tags: splitTags(args.domain_tags),
            content: args.content,
            actionable: args.actionable,
            previously_invisible_because: args.previously_invisible_because,
          } satisfies InsightArtifact
        } else if (type === "warning") {
          if (args.content === undefined || args.confidence === undefined || args.justifiable === undefined) {
            return "Error: warning requires content, confidence, and justifiable."
          }
          artifact = {
            type: "warning",
            warning_id: id,
            source_dream: args.source_dream,
            confidence: args.confidence,
            justifiable: args.justifiable as "FULLY" | "PARTIALLY" | "INTUITION_ONLY",
            content: args.content,
            trigger_conditions: splitLines(args.trigger_conditions),
          } satisfies WarningArtifact
        } else if (type === "songline") {
          if (args.narrative === undefined || args.transfer_rating === undefined) {
            return "Error: songline requires narrative and transfer_rating."
          }
          artifact = {
            type: "songline",
            songline_id: id,
            source_dream: args.source_dream,
            domain_tags: splitTags(args.domain_tags),
            transfer_rating: args.transfer_rating,
            narrative: args.narrative.endsWith("\n") ? args.narrative : args.narrative + "\n",
            encoded_principles: splitLines(args.encoded_principles),
          } satisfies SonglineArtifact
        } else {
          if (args.content === undefined || args.location === undefined ||
              args.nature === undefined || args.severity === undefined ||
              args.weight === undefined || args.resolution_hint === undefined) {
            return "Error: shadow requires content, location, nature, severity, weight, and resolution_hint."
          }
          artifact = {
            type: "shadow",
            shadow_id: id,
            source_dream: args.source_dream,
            weight: args.weight as "HIGH" | "MEDIUM" | "LOW",
            content: args.content,
            location: args.location,
            nature: args.nature,
            severity: args.severity,
            trigger_conditions: splitLines(args.trigger_conditions),
            resolution_hint: args.resolution_hint,
          } satisfies ShadowArtifact
        }

        const filePath = arc().writeArtifact(artifact)
        log("info", `[dream_artifact_create] wrote ${id}`, { filePath })
        return `Created ${id} at ${filePath}`
      },
    }),

    // ── hive_dream_query ────────────────────────────────────────────────────
    defineTool({
      name: "hive_dream_query",
      description:
        "Query the permanent dream artifact archive. Returns full artifact content when the filtered result set is small (≤20), " +
        "or a summary index (ID + excerpt) when large. " +
        "Use this to surface relevant learnings before delegating to a capability, or as feedstock for dreamcatcher Recall. " +
        "Server-side filters reduce context load; semantic relevance judgment stays with the calling agent. " +
        "All filters are optional — omitting all returns the full archive (likely index mode at 86+ artifacts). " +
        "IMPORTANT: domain_tags only exists on insights and songlines. Warnings and shadows carry NO tags, so any query with a domain_tags filter excludes ALL warnings and shadows. " +
        "To gather everything on a topic, run TWO queries: (1) domain_tags='<topic>' for tagged insights/songlines, then (2) a separate untagged query (e.g. types='warning,shadow' with no domain_tags) and judge relevance from content. " +
        "An empty result from a tag-filtered warning/shadow query means 'tags don't apply', NOT 'no relevant artifacts exist'. " +
        "EXACT FETCH: pass ids='I-012,W-007' to retrieve specific artifacts in full — the companion to hive_dream_rank's shortlist. When ids is set, all other filters are ignored and full content is always returned.",
      parameters: {
        types: str("Comma-separated artifact types to include: insight,warning,songline,shadow. Default: all."),
        domain_tags: str("Comma-separated tags, ANY-match. ONLY applies to insights and songlines — warnings and shadows have no tags and are excluded entirely when this filter is set. Omit it (and filter by types/content instead) to reach warnings/shadows. E.g. 'plugin-design,file-io'"),
        min_confidence: num("Minimum confidence or transfer_rating to include (0.0–1.0). Shadows have no confidence and are always included when their type is requested."),
        ids: str("Comma or space-separated artifact IDs for exact fetch (e.g. 'I-012,W-007,SNG-003'). Always returns full content; other filters are ignored. Use after hive_dream_rank to pull the shortlisted artifacts you judged promising."),
      },
      output: TEXT_OUT,
      async execute(args, exec) {
        const { sessionID } = resolveCaller(exec)

        // Exact-fetch mode: ids bypass every other filter.
        if (args.ids && args.ids.trim() !== "") {
          const requested = args.ids.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
          const result = arc().query({ ids: requested })
          const foundIds = (result.full ?? []).map((e) => e.id)
          const missing = requested.filter((id) => !foundIds.includes(id))

          arc().recordSurfacedEvent(sessionID, "query", `ids:${requested.join(",")}`, foundIds, result.total)

          if (result.total === 0) {
            return `No artifacts found for ids: ${requested.join(", ")}. Check the ID format (I-NNN, W-NNN, SNG-NNN, SHADOW-NNN).`
          }
          const lines = [`Dream archive fetch — ${result.total} artifact(s) (full content):\n`]
          for (const entry of result.full!) {
            lines.push(`--- ${entry.id} [${entry.type}] ---`)
            lines.push(serializeArtifact(entry.artifact).trimEnd())
            lines.push("")
          }
          if (missing.length > 0) {
            lines.push(`⚠ Not found: ${missing.join(", ")}`)
          }
          return lines.join("\n")
        }

        const typeFilter = args.types
          ? (args.types.split(",").map((t) => t.trim()).filter(Boolean) as ArtifactType[])
          : undefined
        const tagFilter = args.domain_tags
          ? args.domain_tags.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined

        // Guard the silent-empty footgun: domain_tags only exists on insights/songlines.
        if (tagFilter && tagFilter.length > 0 && typeFilter && typeFilter.length > 0) {
          const TAGLESS: ArtifactType[] = ["warning", "shadow"]
          const requestedTagless = typeFilter.filter((t) => TAGLESS.includes(t))
          const requestedTagged = typeFilter.filter((t) => !TAGLESS.includes(t))
          if (requestedTagged.length === 0) {
            return (
              `Invalid query: domain_tags was set, but every requested type (${requestedTagless.join(", ")}) is tagless. ` +
              `domain_tags only exists on insights and songlines — warnings and shadows carry no tags, so this filter combination can ONLY return empty. ` +
              `An empty result here would mean "tags don't apply", NOT "no relevant artifacts exist".\n\n` +
              `To cover this topic, run two queries:\n` +
              `  1. hive_dream_query(types: "insight,songline", domain_tags: "${args.domain_tags}")  — tagged retrieval\n` +
              `  2. hive_dream_query(types: "${requestedTagless.join(",")}", min_confidence: <floor>)  — drop domain_tags; judge relevance from content`
            )
          }
        }

        const result = arc().query({
          types: typeFilter,
          domain_tags: tagFilter,
          min_confidence: args.min_confidence,
        })

        // Telemetry (never fails the query, never feeds ranking)
        {
          const surfacedIds = result.mode === "full"
            ? (result.full ?? []).map((e) => e.id)
            : (result.index ?? []).map((e) => e.id)
          const filterSummary = `types:${args.types ?? "*"} tags:${args.domain_tags ?? "*"} min_conf:${args.min_confidence ?? "*"}`
          arc().recordSurfacedEvent(sessionID, "query", filterSummary, surfacedIds, result.total)
        }

        let taglessNote = ""
        if (tagFilter && tagFilter.length > 0) {
          const taglessExcluded = !typeFilter || typeFilter.some((t) => t === "warning" || t === "shadow")
          if (taglessExcluded) {
            taglessNote =
              `\n\nNote: domain_tags excludes warnings and shadows (they carry no tags). ` +
              `If failure-patterns on this topic matter, run a follow-up: hive_dream_query(types: "warning,shadow", min_confidence: <floor>) without domain_tags.`
          }
        }

        if (result.total === 0) {
          return "No artifacts found matching the given filters." + taglessNote
        }

        if (result.mode === "full" && result.full) {
          const lines = [`Dream archive query — ${result.total} artifact(s) (full content):\n`]
          for (const entry of result.full) {
            lines.push(`--- ${entry.id} [${entry.type}] ---`)
            lines.push(serializeArtifact(entry.artifact).trimEnd())
            lines.push("")
          }
          return lines.join("\n") + taglessNote
        }

        const lines = [`Dream archive query — ${result.total} artifact(s) (summary index — request specific types/tags for full content):\n`]
        for (const { id, type, summary } of result.index!) {
          lines.push(`${id} [${type}]: ${summary}`)
        }
        return lines.join("\n") + taglessNote
      },
    }),

    // ── hive_dream_rank ─────────────────────────────────────────────────────
    defineTool({
      name: "hive_dream_rank",
      description:
        "Rank dream artifacts against a free-text query and return a top-k shortlist (id, type, score, ~200-char excerpt). " +
        "The scale-safe entry point for Recall: instead of reading the whole archive, get a ranked shortlist, judge it semantically, " +
        "then pull full content for promising entries with hive_dream_query(ids: ...). " +
        "All four types are ranked uniformly by content (no tag asymmetry). " +
        "Guarantees: shadows and warnings get reserved slots in the shortlist (shadow-first bias survives top-k), and warnings/shadows " +
        "whose trigger_conditions literally overlap the query are always included (flag: trigger-match). " +
        "Entries carry lifecycle flags (stale, superseded_by:X) so staleness is visible at shortlist level. " +
        "This is a pre-filter: scores are lexical (token backend), not semantic truth — relevance judgment stays with you. " +
        "A low score does not prove irrelevance; a high score does not prove relevance.",
      parameters: {
        query: reqStr("Free-text description of the task/topic to rank against (e.g. 'concurrent file writes in plugin journals')"),
        k: num("Shortlist size (default 30). If k >= archive size, everything is returned ranked."),
        types: str("Comma-separated artifact types to restrict ranking to. Default: all four. NOTE: restricting types also disables the floors for excluded types."),
      },
      output: TEXT_OUT,
      async execute(args, exec) {
        const { sessionID } = resolveCaller(exec)
        const query = args.query?.trim() ?? ""
        if (query === "") {
          return (
            "Invalid query: empty. hive_dream_rank needs a free-text topic/task description to rank against. " +
            "For an unranked overview of the archive, use hive_dream_list instead."
          )
        }

        const typeFilter = args.types
          ? (args.types.split(",").map((t) => t.trim()).filter(Boolean) as ArtifactType[])
          : undefined

        const { results, total, backend } = arc().rank(query, {
          k: args.k,
          types: typeFilter,
        })

        arc().recordSurfacedEvent(sessionID, "rank", query, results.map((r) => r.id), total)

        if (results.length === 0) {
          return "Archive is empty (no artifacts to rank)."
        }

        const lines = [
          `Dream rank — top ${results.length} of ${total} artifact(s) (backend: ${backend}):\n`,
        ]
        for (const r of results) {
          const flagStr = r.flags.length > 0 ? `  [${r.flags.join(", ")}]` : ""
          lines.push(`${r.id} [${r.type}] score=${r.score} (${r.source_dream})${flagStr}`)
          lines.push(`  ${r.excerpt}`)
        }
        lines.push("")
        lines.push(`Pull full content for promising entries: hive_dream_query(ids: "I-NNN,W-NNN,...")`)
        return lines.join("\n")
      },
    }),

    // ── hive_dream_begin ────────────────────────────────────────────────────
    defineTool({
      name: "hive_dream_begin",
      description:
        "Open a new dream session. Assigns the next sequential DRM-NNN id (scanning both active/ and history/ to avoid collisions), " +
        "enforces the single-active invariant (refuses if a dream is already active — name it in the error), " +
        "and writes dreams/active/DRM-NNN.yaml with status DREAMING. " +
        "Use this at the start of the dreamtime workflow, after hive_dream_harvest. " +
        "Returns the assigned DRM id.",
      parameters: {
        intention: reqStr("Free-text description of what this dream intends to consolidate"),
        intention_type: { type: "string", required: true, enum: ["CONSOLIDATION", "COMPARATIVE", "ABSTRACTION", "ANOMALY", "INTEGRATION"], description: "Dream intention type" },
        depth: { type: "string", required: true, enum: ["1", "2", "3"], description: "Compression depth: 1=surface (~40% reduction), 2=deep (~75%), 3=abyssal (~95%)" },
        project_context: reqStr("Workspace name or path this dream covers (e.g. '/workspace — evolutional_agent_structure (HIVE plugin)')"),
        contradictions: num("Number of contradictions detected in pre-dream context (default 0)"),
        repetitions_detected: bool("Whether repetitions were detected in pre-dream context (default false)"),
        coherence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"], description: "Coherence level of pre-dream context (default HIGH)" },
        threads_active: num("Number of active threads in pre-dream context (default 1)"),
        retain_high: str("Newline-separated list of things to retain at high fidelity during compression"),
        retain_low: str("Newline-separated list of things that can be released during compression"),
        pre_compaction: bool(
          "Mark this as a mid-session, pre-compaction consolidation (default false). " +
          "Set true when dreaming BEFORE auto-compaction (~70% context) so compression runs on firsthand experience, not a lossy summary. " +
          "A pre-compaction dream completes and archives normally, but its completion does NOT close the work item this session owns — work continues afterwards. " +
          "Omit/false for an end-of-work dream, which closes the owned item on completion as usual."
        ),
      },
      output: TEXT_OUT,
      async execute(args) {
        // Single-active invariant
        const active = arc().listActiveDreams()
        if (active.length > 0) {
          const existing = active[0]!.replace(".yaml", "")
          log("warn", "[dream_begin] refused — active dream already exists", { existing })
          return `Cannot begin a new dream: ${existing} is already active. Complete it first with hive_dream_complete, or check dreams/active/ manually.`
        }

        const splitLines = (s?: string): string[] =>
          s ? s.split("\n").map((l) => l.trim()).filter(Boolean) : []

        const { dreamId, filePath } = arc().begin({
          depth: parseInt(args.depth, 10),
          intention: args.intention,
          intention_type: args.intention_type as IntentionType,
          entry_time: new Date().toISOString(),
          project_context: args.project_context,
          context_signals: {
            contradictions: args.contradictions ?? 0,
            repetitions_detected: args.repetitions_detected ?? false,
            coherence: (args.coherence ?? "HIGH") as CoherenceLevel,
            threads_active: args.threads_active ?? 1,
          },
          retain_high: splitLines(args.retain_high),
          retain_low: splitLines(args.retain_low),
          pre_compaction: args.pre_compaction ?? false,
        })

        log("info", `[dream_begin] opened ${dreamId}`, { filePath, preCompaction: args.pre_compaction ?? false })
        const lifecycleNote = args.pre_compaction === true
          ? "\nMarked pre_compaction: completing this dream will NOT close any board work item — work continues afterwards."
          : ""
        return `Dream ${dreamId} opened (status: DREAMING). File: ${filePath}${lifecycleNote}\nProceed with compression and call hive_dream_artifact_create for each artifact, then hive_dream_complete when done.`
      },
    }),

    // ── hive_dream_complete ─────────────────────────────────────────────────
    defineTool({
      name: "hive_dream_complete",
      description:
        "Close the active dream session. Stamps exit_time and status COMPLETE, links the produced artifact IDs into the DRM arrays " +
        "(bucketed automatically by prefix: I-/W-/SNG-/SHADOW-), validates that referenced artifact files exist (warns on missing, does not hard-fail), " +
        "and atomically moves dreams/active/DRM-NNN.yaml to dreams/history/DRM-NNN.yaml. " +
        "Returns a summary of the DRM id, artifact counts, and the final path.",
      parameters: {
        artifact_ids: str("Space or newline-separated list of artifact IDs produced during this dream (e.g. 'I-048 W-019 SNG-018'). May be empty if no artifacts were created."),
      },
      output: TEXT_OUT,
      async execute(args) {
        // Single-active invariant checks
        const active = arc().listActiveDreams()
        if (active.length === 0) {
          return "Error: no active dream found in dreams/active/. Nothing to complete."
        }
        if (active.length > 1) {
          return `Error: single-active invariant violated — found ${active.length} active dreams: ${active.join(", ")}. Resolve manually.`
        }

        const rawIds = args.artifact_ids ?? ""
        const artifactIds = rawIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)

        const exitTime = new Date().toISOString()

        let result
        try {
          result = arc().complete(exitTime, artifactIds)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg === "NO_ACTIVE_DREAM") {
            return "Error: no active dream found. Nothing to complete."
          }
          log("error", "[dream_complete] failed", { err: msg })
          return `Error completing dream: ${msg}`
        }

        const { dreamId, historyPath, linkedArtifacts, missingArtifacts } = result
        const totalLinked = Object.values(linkedArtifacts).reduce((s, a) => s + a.length, 0)

        log("info", `[dream_complete] completed ${dreamId}`, { historyPath, totalLinked })

        const lines = [
          `Dream ${dreamId} completed.`,
          `  Status: COMPLETE`,
          `  History: ${historyPath}`,
          `  Artifacts linked: ${totalLinked} (insights:${linkedArtifacts.insights.length} warnings:${linkedArtifacts.warnings.length} songlines:${linkedArtifacts.songlines.length} shadows:${linkedArtifacts.shadows.length})`,
        ]
        if (missingArtifacts.length > 0) {
          lines.push(`  ⚠ Missing artifact files (linked in DRM but not found on disk): ${missingArtifacts.join(", ")}`)
        }
        // NOTE: the OpenCode board-promotion hook (markItemDoneFromDream) is
        // deliberately absent — the board subsystem is a deferred migration
        // phase. This is the ONLY behavioural delta from the OpenCode tool.
        return lines.join("\n")
      },
    }),

    // ── hive_dream_list ─────────────────────────────────────────────────────
    defineTool({
      name: "hive_dream_list",
      description:
        "Return a lightweight index of dream artifacts — ID, type, source dream, and a ~80-char content excerpt. " +
        "Cheaper than hive_dream_query (no full parse); use for ID validation, audit pre-pass, or a quick 'what exists' overview. " +
        "Optional filters: type (one artifact type) and/or source_dream (e.g. 'DRM-014'). " +
        "Distinct from hive_dream_query which returns full content and supports confidence/tag filtering.",
      parameters: {
        type: { type: "string", enum: ["insight", "warning", "songline", "shadow"], description: "Filter to a single artifact type. Omit for all types." },
        source_dream: str("Filter to artifacts from a specific dream (e.g. 'DRM-014')."),
      },
      output: TEXT_OUT,
      async execute(args) {
        const types: ArtifactType[] | undefined = args.type ? [args.type as ArtifactType] : undefined
        const entries = arc().list({ types, source_dream: args.source_dream })

        if (entries.length === 0) {
          return "No artifacts found matching the given filters."
        }

        const lines = [`Dream artifact index — ${entries.length} artifact(s):\n`]
        for (const { id, type, source_dream, summary } of entries) {
          lines.push(`${id} [${type}] (${source_dream}): ${summary}${summary.length >= 80 ? "…" : ""}`)
        }
        return lines.join("\n")
      },
    }),

    // ── hive_dream_supersede ────────────────────────────────────────────────
    defineTool({
      name: "hive_dream_supersede",
      description:
        "Mark an artifact as superseded by a newer one. " +
        "Appends superseded_by and optionally supersede_reason to the artifact file, preserving all existing content byte-for-byte. " +
        "Validates both IDs exist on disk before writing. " +
        "Called by dreamtime after a dreamcatcher audit flags a supersession candidate — dreamcatcher itself is read-only. " +
        "Use hive_dream_mark_stale instead if there is no direct replacement artifact.",
      parameters: {
        id: reqStr("The artifact being superseded (e.g. 'I-034')"),
        superseded_by: reqStr("The replacement artifact ID (e.g. 'I-047')"),
        reason: str("Optional short explanation of why this artifact was superseded"),
      },
      output: TEXT_OUT,
      async execute(args) {
        const targetPath = arc().pathForId(args.id)
        if (!targetPath) {
          return `Error: cannot resolve artifact type from id '${args.id}'. Expected format: I-NNN, W-NNN, SNG-NNN, SHADOW-NNN.`
        }
        if (!fs.existsSync(targetPath)) {
          return `Error: artifact ${args.id} not found at ${targetPath}.`
        }

        const replacementPath = arc().pathForId(args.superseded_by)
        if (!replacementPath) {
          return `Error: cannot resolve artifact type from replacement id '${args.superseded_by}'.`
        }
        if (!fs.existsSync(replacementPath)) {
          return `Error: replacement artifact ${args.superseded_by} not found at ${replacementPath}. Create it first.`
        }

        const fields: Array<{ key: string; value: string | boolean | number }> = [
          { key: "superseded_by", value: args.superseded_by },
        ]
        if (args.reason) {
          fields.push({ key: "supersede_reason", value: args.reason })
        }

        arc().appendFieldsToArtifact(targetPath, fields)
        log("info", `[dream_supersede] ${args.id} superseded by ${args.superseded_by}`, { targetPath })
        return `${args.id} marked superseded_by: ${args.superseded_by}${args.reason ? ` (reason: ${args.reason})` : ""}. File: ${targetPath}`
      },
    }),

    // ── hive_dream_mark_stale ───────────────────────────────────────────────
    defineTool({
      name: "hive_dream_mark_stale",
      description:
        "Mark an artifact as stale (no longer reliable, but no direct replacement). " +
        "Appends stale: true and optionally stale_reason to the artifact file, preserving all existing content byte-for-byte. " +
        "Validates the artifact ID exists on disk before writing. " +
        "Called by dreamtime after a dreamcatcher audit flags a staleness candidate. " +
        "Use hive_dream_supersede instead if there is a specific replacement artifact.",
      parameters: {
        id: reqStr("The artifact to mark stale (e.g. 'W-003')"),
        reason: str("Optional short explanation of why this artifact is stale"),
      },
      output: TEXT_OUT,
      async execute(args) {
        const targetPath = arc().pathForId(args.id)
        if (!targetPath) {
          return `Error: cannot resolve artifact type from id '${args.id}'. Expected format: I-NNN, W-NNN, SNG-NNN, SHADOW-NNN.`
        }
        if (!fs.existsSync(targetPath)) {
          return `Error: artifact ${args.id} not found at ${targetPath}.`
        }

        const fields: Array<{ key: string; value: string | boolean | number }> = [
          { key: "stale", value: true },
        ]
        if (args.reason) {
          fields.push({ key: "stale_reason", value: args.reason })
        }

        arc().appendFieldsToArtifact(targetPath, fields)
        log("info", `[dream_mark_stale] ${args.id} marked stale`, { targetPath })
        return `${args.id} marked stale: true${args.reason ? ` (reason: ${args.reason})` : ""}. File: ${targetPath}`
      },
    }),

    // ── hive_dream_detect_duplicates ────────────────────────────────────────
    defineTool({
      name: "hive_dream_detect_duplicates",
      description:
        "Scan the artifact archive and return candidate pairs within a similarity band, using cheap heuristics: " +
        "domain-tag Jaccard overlap + content-token Jaccard overlap. " +
        "Two bands, two jobs: the HIGH band (threshold ~0.6+) surfaces near-duplicate candidates (merge/supersede); " +
        "the MID band (threshold ~0.30, max_threshold ~0.60) is the contradiction-hunting zone — same topic, different words, possibly different stance. " +
        "Each pair carries divergence annotations: conf_delta (|confidence difference|) and dream_distance (DRM-ordinal gap) — " +
        "a high-similarity pair with divergent confidence or a large dream gap is prime supersession/contradiction territory. " +
        "This is a pre-filter only — divergent CLAIMS are not heuristically detectable; semantic judgment (duplicate vs contradiction vs unrelated) " +
        "and the final merge/supersede decision stay with dreamcatcher and dreamtime. " +
        "A high score means textual/tag similarity, not guaranteed duplication.",
      parameters: {
        threshold: num("Minimum similarity score 0.0–1.0 to report (default 0.35). Lower = more candidates, higher = fewer but stronger matches."),
        max_threshold: num("Maximum similarity score to report (default 1.0). Set threshold=0.30, max_threshold=0.60 to isolate the mid-band for contradiction hunting."),
        types: str("Comma-separated artifact types to scan. Default: all types."),
      },
      output: TEXT_OUT,
      async execute(args) {
        const threshold = args.threshold ?? 0.35
        const maxThreshold = args.max_threshold ?? 1.0
        if (maxThreshold < threshold) {
          return `Invalid band: max_threshold (${maxThreshold}) is below threshold (${threshold}). The band [threshold, max_threshold] can only be empty.`
        }

        const typeFilter = args.types
          ? new Set(args.types.split(",").map((t) => t.trim()) as ArtifactType[])
          : null

        const candidates = arc().detectDuplicates(threshold, maxThreshold)
        const filtered = typeFilter
          ? candidates.filter((c) => typeFilter.has(c.typeA) || typeFilter.has(c.typeB))
          : candidates

        const bandLabel = maxThreshold < 1.0 ? `band [${threshold}, ${maxThreshold}]` : `threshold ${threshold}`

        if (filtered.length === 0) {
          return `No candidate pairs found in ${bandLabel}.`
        }

        const lines = [
          `Similarity scan — ${filtered.length} candidate pair(s) in ${bandLabel}:\n`,
        ]
        for (const c of filtered) {
          const annotations: string[] = [`tags=${c.tag_jaccard}`, `tokens=${c.token_overlap}`]
          if (c.confidence_delta !== undefined) annotations.push(`conf_delta=${c.confidence_delta}`)
          if (c.dream_distance !== undefined) annotations.push(`dream_distance=${c.dream_distance}`)
          lines.push(
            `${c.idA} [${c.typeA}] ≈ ${c.idB} [${c.typeB}]  score=${c.score} ` +
            `(${annotations.join(" ")})`
          )
          lines.push(`  A: ${c.summaryA}`)
          lines.push(`  B: ${c.summaryB}`)
          lines.push("")
        }
        lines.push("Semantic judgment: use dreamcatcher Audit mode to classify each pair as duplicate, contradiction, or unrelated.")
        return lines.join("\n")
      },
    }),
  ]

  // Register all 9 tools; the disposer removes them together.
  const disposers = registrations.map((def) => ctx.tools.register(def))
  return () => { for (const d of disposers) d() }
}

// The dsh loader applies the DEFAULT export only and ignores named siblings,
// so inject rides on the function itself (cordis reads `plugin.inject`).
// NB: a function's own `name` property is read-only — do NOT Object.assign name onto it.
(apply as unknown as Record<string, unknown>).inject = ["tools", "dreamArchive"]
export default apply
