/**
 * HIVE custom tools: hive_signal, hive_listen, hive_awaken,
 *                    hive_dream_residue, hive_dream_harvest,
 *                    hive_dream_artifact_create, hive_dream_query,
 *                    hive_dream_begin, hive_dream_complete,
 *                    hive_dream_list, hive_dream_supersede,
 *                    hive_dream_mark_stale, hive_dream_detect_duplicates
 */

import { tool } from "@opencode-ai/plugin"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { formatInboxForPrompt } from "./lib/hivemind.js"
import type { NervousSystem } from "./lib/nervous-system.js"
import { appendResidue, harvestJournals, formatHarvestForDreamer, type ResidueKind } from "./lib/dream-journal.js"
import {
  nextArtifactId,
  writeArtifact,
  queryArtifacts,
  serializeArtifact,
  listArtifacts,
  pathForId,
  idToType,
  appendFieldsToArtifact,
  detectDuplicateCandidates,
  type ArtifactType,
  type InsightArtifact,
  type WarningArtifact,
  type SonglineArtifact,
  type ShadowArtifact,
} from "./lib/dream-artifacts.js"
import {
  listActiveDreams,
  beginDream,
  completeDream,
  readDreamState,
  activeDreamPath,
  type IntentionType,
  type CoherenceLevel,
} from "./lib/dream-state.js"
import path from "path"
import fs from "fs"

type Client = ReturnType<typeof createOpencodeClient>
type LogFn = (level: "info" | "debug" | "error" | "warn", message: string, extra?: Record<string, unknown>) => void

export function createHiveTools(
  ns: NervousSystem,
  _client: Client,
  log: LogFn,
  directory: string
) {
  return {

    // ── Messaging ─────────────────────────────────────────────────────────────

    hive_signal: tool({
      description: "Send a message to another capability in the HIVE ecosystem. Use this when you need information from, or want to share information with, another capability. Messages are delivered in real-time if the recipient is active, otherwise queued for their next session. Check the Active Capabilities list in your system prompt to see valid recipients.",
      args: {
        recipient: tool.schema.string().describe("Target capability name, '_broadcast' for all, or '_coordinator' to escalate"),
        type: tool.schema.enum(["question", "info", "result", "request"]).describe("Message type: question (need answer), info (FYI), result (answering prior question), request (ask coordinator to act)"),
        content: tool.schema.string().describe("Message content"),
      },
      async execute(args, context) {
        const sender = ns.resolveAgent(context.sessionID, context.agent)
        const { filename, delivered } = await ns.send(sender, args.recipient, args.type, args.content, context.sessionID)
        return delivered
          ? `Message sent to ${args.recipient} and delivered in real-time. (file: ${filename})`
          : `Message queued for ${args.recipient}. They will receive it on their next session. (file: ${filename})`
      },
    }),

    hive_listen: tool({
      description: "Read pending messages from other capabilities addressed to you. Messages are also injected into your system prompt automatically, but use this tool to explicitly check for and acknowledge messages.",
      args: {
        mark_read: tool.schema.boolean().optional().describe("If true, mark all messages as read after retrieving them"),
      },
      async execute(args, context) {
        const agent = ns.resolveAgent(context.sessionID, context.agent)
        const isCoordinator = !ns.isCapabilitySession(context.sessionID)

        let pending = ns.readMessages(agent)
        if (isCoordinator) {
          pending = [...pending, ...ns.readMessages("_coordinator")]
        }

        if (pending.length === 0) return "No pending messages."

        const formatted = formatInboxForPrompt(pending)
        if (args.mark_read) {
          ns.acknowledgeMessages(agent)
          if (isCoordinator) ns.acknowledgeMessages("_coordinator")
        }

        return formatted || "No pending messages."
      },
    }),

    hive_awaken: tool({
      description: "Activate HIVE for the current session. Call this when processing /awaken to enable capability dispatch, roster injection, and HIVEmind messaging for this session. Without this, HIVE context is not injected.",
      args: {},
      async execute(_args, context) {
        ns.awakenSession(context.sessionID)
        return "HIVE awakened for this session. Capability dispatch and HIVEmind messaging are now active."
      },
    }),

    // ── Dream journals (capability-side residue) ──────────────────────────────

    hive_dream_residue: tool({
      description:
        "Persist a delta of dream-worthy learnings to your capability's journal. " +
        "Call this whenever you encounter something worth preserving across sessions: " +
        "a hard-won insight, a dead-end to avoid, a surprising behaviour, an unresolved tension, or an ambient 'something felt wrong' signal. " +
        "Write only what is NEW this turn — do not re-summarise prior entries. " +
        "The tool resolves your identity automatically; you do NOT pass your own name. " +
        "These journals feed the dreamtime consolidation workflow so learnings survive context resets.",
      args: {
        content: tool.schema.string().describe("The residue note — new learnings, dead-ends, warnings, or signals worth preserving. Write only what is new this turn."),
        kind: tool.schema.enum(["insight", "warning", "shadow", "note"]).optional().describe("Category hint: insight (discovery), warning (hazard), shadow (unresolved tension), note (general observation)"),
      },
      async execute(args, context) {
        const capability = ns.resolveAgent(context.sessionID, context.agent)
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_residue] appending residue", { capability, kind: args.kind })
        }
        if (!capability) {
          log("warn", "[dream_residue] could not resolve capability from session — residue not written", { sessionID: context.sessionID, agent: context.agent })
          return "Warning: could not resolve capability identity. Residue was NOT written."
        }
        appendResidue(directory, capability, args.content, args.kind as ResidueKind | undefined)
        return `Residue appended to journal for \`${capability}\`${args.kind ? ` [${args.kind}]` : ""}.`
      },
    }),

    hive_dream_harvest: tool({
      description:
        "Read all accumulated capability dream journals and return their contents as feedstock for dreamtime consolidation. " +
        "Use this at the start of a dreamtime workflow to collect what capabilities have learned. " +
        "By default, journals are atomically archived after reading so the next session starts clean (peek=true skips archiving). " +
        "Only the dreamtime workflow should call this — individual capabilities should use hive_dream_residue instead.",
      args: {
        peek: tool.schema.boolean().optional().describe("If true, read journals without archiving them (non-destructive peek). Default false — harvest and archive."),
      },
      async execute(args, context) {
        const caller = ns.resolveAgent(context.sessionID, context.agent)
        const clear = !args.peek
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_harvest] harvesting journals", { caller, clear })
        }
        const entries = harvestJournals(directory, clear)
        log("info", `[dream_harvest] harvested ${entries.length} journals`, { clear, caller })
        return formatHarvestForDreamer(entries)
      },
    }),

    // ── Dream artifacts (permanent archive) ───────────────────────────────────

    hive_dream_artifact_create: tool({
      description:
        "Create a permanent dream artifact (insight, warning, songline, or shadow) in the dream archive. " +
        "The server assigns the next sequential ID and writes to the correct subdirectory — you do NOT pick the ID. " +
        "Use this during a dreamtime workflow when compression produces a new artifact worth persisting. " +
        "Fields vary by type — insight: confidence/domain_tags/content/actionable/previously_invisible_because; " +
        "warning: confidence/justifiable/content/trigger_conditions; " +
        "songline: domain_tags/transfer_rating/narrative/encoded_principles; " +
        "shadow: weight/content/location/nature/severity/trigger_conditions/resolution_hint. " +
        "All types require source_dream (e.g. 'DRM-015'). Returns the assigned ID and file path.",
      args: {
        type: tool.schema.enum(["insight", "warning", "songline", "shadow"]).describe("Artifact type"),
        source_dream: tool.schema.string().describe("Dream ID this artifact was produced in (e.g. DRM-015)"),
        // shared / insight / warning
        confidence: tool.schema.number().optional().describe("(insight, warning) Confidence 0.0–1.0"),
        domain_tags: tool.schema.string().optional().describe("(insight, songline) Comma-separated tags e.g. 'plugin-design,file-io'"),
        content: tool.schema.string().optional().describe("(insight, warning, shadow) Core content of the artifact"),
        actionable: tool.schema.boolean().optional().describe("(insight) Whether this insight is immediately actionable"),
        previously_invisible_because: tool.schema.string().optional().describe("(insight) Why this wasn't obvious before compression"),
        justifiable: tool.schema.enum(["FULLY", "PARTIALLY", "INTUITION_ONLY"]).optional().describe("(warning) How well the warning can be justified"),
        trigger_conditions: tool.schema.string().optional().describe("(warning, shadow) Newline-separated conditions that should surface this artifact"),
        // songline
        transfer_rating: tool.schema.number().optional().describe("(songline) Transfer rating 0.0–1.0"),
        narrative: tool.schema.string().optional().describe("(songline) The story that encodes the principle. Use metaphor."),
        encoded_principles: tool.schema.string().optional().describe("(songline) Newline-separated principles encoded in the narrative"),
        // shadow
        weight: tool.schema.enum(["HIGH", "MEDIUM", "LOW"]).optional().describe("(shadow) Severity weight of this knowledge loss"),
        location: tool.schema.string().optional().describe("(shadow) Where the lost knowledge applied"),
        nature: tool.schema.string().optional().describe("(shadow) What kind of knowledge was lost"),
        severity: tool.schema.string().optional().describe("(shadow) How bad it is that this is lost"),
        resolution_hint: tool.schema.string().optional().describe("(shadow) Any partial memory of what the resolution was"),
      },
      async execute(args, context) {
        const caller = ns.resolveAgent(context.sessionID, context.agent)
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_artifact_create] creating artifact", { caller, type: args.type })
        }

        const type = args.type as ArtifactType
        const id = nextArtifactId(directory, type)
        const splitLines = (s?: string): string[] =>
          s ? s.split("\n").map((l) => l.trim()).filter(Boolean) : []
        const splitTags = (s?: string): string[] =>
          s ? s.split(",").map((t) => t.trim()).filter(Boolean) : []

        let artifact: InsightArtifact | WarningArtifact | SonglineArtifact | ShadowArtifact

        if (type === "insight") {
          if (args.content === undefined || args.confidence === undefined ||
              args.actionable === undefined || args.previously_invisible_because === undefined) {
            log("warn", "[dream_artifact_create] missing required insight fields", { caller })
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
            log("warn", "[dream_artifact_create] missing required warning fields", { caller })
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
            log("warn", "[dream_artifact_create] missing required songline fields", { caller })
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
          // shadow
          if (args.content === undefined || args.location === undefined ||
              args.nature === undefined || args.severity === undefined ||
              args.weight === undefined || args.resolution_hint === undefined) {
            log("warn", "[dream_artifact_create] missing required shadow fields", { caller })
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

        const filePath = writeArtifact(directory, artifact)
        log("info", `[dream_artifact_create] wrote ${id}`, { filePath, caller })
        return `Created ${id} at ${filePath}`
      },
    }),

    hive_dream_query: tool({
      description:
        "Query the permanent dream artifact archive. Returns full artifact content when the filtered result set is small (≤20), " +
        "or a summary index (ID + excerpt) when large. " +
        "Use this to surface relevant learnings before delegating to a capability, or as feedstock for dreamcatcher Recall. " +
        "Server-side filters reduce context load; semantic relevance judgment stays with the calling agent. " +
        "All filters are optional — omitting all returns the full archive (likely index mode at 86+ artifacts).",
      args: {
        types: tool.schema.string().optional().describe("Comma-separated artifact types to include: insight,warning,songline,shadow. Default: all."),
        domain_tags: tool.schema.string().optional().describe("Comma-separated tags — returns artifacts matching ANY listed tag (applies to insights and songlines). E.g. 'plugin-design,file-io'"),
        min_confidence: tool.schema.number().optional().describe("Minimum confidence or transfer_rating to include (0.0–1.0). Shadows have no confidence and are always included when their type is requested."),
      },
      async execute(args, _context) {
        const typeFilter = args.types
          ? (args.types.split(",").map((t) => t.trim()).filter(Boolean) as ArtifactType[])
          : undefined
        const tagFilter = args.domain_tags
          ? args.domain_tags.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined

        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_query] querying artifacts", { typeFilter, tagFilter, min_confidence: args.min_confidence })
        }

        const result = queryArtifacts(directory, {
          types: typeFilter,
          domain_tags: tagFilter,
          min_confidence: args.min_confidence,
        })

        if (result.total === 0) {
          return "No artifacts found matching the given filters."
        }

        if (result.mode === "full" && result.full) {
          const lines = [`Dream archive query — ${result.total} artifact(s) (full content):\n`]
          for (const entry of result.full) {
            lines.push(`--- ${entry.id} [${entry.type}] ---`)
            lines.push(serializeArtifact(entry.artifact).trimEnd())
            lines.push("")
          }
          return lines.join("\n")
        }

        // Index mode
        const lines = [`Dream archive query — ${result.total} artifact(s) (summary index — request specific types/tags for full content):\n`]
        for (const { id, type, summary } of result.index!) {
          lines.push(`${id} [${type}]: ${summary}`)
        }
        return lines.join("\n")
      },
    }),

    // ── Dream lifecycle (DRM state files) ─────────────────────────────────────

    hive_dream_begin: tool({
      description:
        "Open a new dream session. Assigns the next sequential DRM-NNN id (scanning both active/ and history/ to avoid collisions), " +
        "enforces the single-active invariant (refuses if a dream is already active — name it in the error), " +
        "and writes dreams/active/DRM-NNN.yaml with status DREAMING. " +
        "Use this at the start of the dreamtime workflow, after hive_dream_harvest. " +
        "Returns the assigned DRM id.",
      args: {
        intention: tool.schema.string().describe("Free-text description of what this dream intends to consolidate"),
        intention_type: tool.schema.enum(["CONSOLIDATION", "COMPARATIVE", "ABSTRACTION", "ANOMALY", "INTEGRATION"]).describe("Dream intention type"),
        depth: tool.schema.enum(["1", "2", "3"]).describe("Compression depth: 1=surface (~40% reduction), 2=deep (~75%), 3=abyssal (~95%)"),
        project_context: tool.schema.string().describe("Workspace name or path this dream covers (e.g. '/workspace — evolutional_agent_structure (HIVE plugin)')"),
        contradictions: tool.schema.number().optional().describe("Number of contradictions detected in pre-dream context (default 0)"),
        repetitions_detected: tool.schema.boolean().optional().describe("Whether repetitions were detected in pre-dream context (default false)"),
        coherence: tool.schema.enum(["HIGH", "MEDIUM", "LOW"]).optional().describe("Coherence level of pre-dream context (default HIGH)"),
        threads_active: tool.schema.number().optional().describe("Number of active threads in pre-dream context (default 1)"),
        retain_high: tool.schema.string().optional().describe("Newline-separated list of things to retain at high fidelity during compression"),
        retain_low: tool.schema.string().optional().describe("Newline-separated list of things that can be released during compression"),
      },
      async execute(args, context) {
        const caller = ns.resolveAgent(context.sessionID, context.agent)
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_begin] checking active dreams", { caller })
        }

        // Single-active invariant
        const active = listActiveDreams(directory)
        if (active.length > 0) {
          const existing = active[0].replace(".yaml", "")
          log("warn", "[dream_begin] refused — active dream already exists", { existing, caller })
          return `Cannot begin a new dream: ${existing} is already active. Complete it first with hive_dream_complete, or check dreams/active/ manually.`
        }

        const splitLines = (s?: string): string[] =>
          s ? s.split("\n").map((l) => l.trim()).filter(Boolean) : []

        const { dreamId, filePath } = beginDream(directory, {
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
        })

        log("info", `[dream_begin] opened ${dreamId}`, { filePath, caller })
        return `Dream ${dreamId} opened (status: DREAMING). File: ${filePath}\nProceed with compression and call hive_dream_artifact_create for each artifact, then hive_dream_complete when done.`
      },
    }),

    hive_dream_complete: tool({
      description:
        "Close the active dream session. Stamps exit_time and status COMPLETE, links the produced artifact IDs into the DRM arrays " +
        "(bucketed automatically by prefix: I-/W-/SNG-/SHADOW-), validates that referenced artifact files exist (warns on missing, does not hard-fail), " +
        "and atomically moves dreams/active/DRM-NNN.yaml to dreams/history/DRM-NNN.yaml. " +
        "Returns a summary of the DRM id, artifact counts, and the final path.",
      args: {
        artifact_ids: tool.schema.string().optional().describe("Space or newline-separated list of artifact IDs produced during this dream (e.g. 'I-048 W-019 SNG-018'). May be empty if no artifacts were created."),
      },
      async execute(args, context) {
        const caller = ns.resolveAgent(context.sessionID, context.agent)

        // Single-active invariant checks
        const active = listActiveDreams(directory)
        if (active.length === 0) {
          log("warn", "[dream_complete] no active dream found", { caller })
          return "Error: no active dream found in dreams/active/. Nothing to complete."
        }
        if (active.length > 1) {
          log("warn", "[dream_complete] multiple active dreams — invariant violated", { active, caller })
          return `Error: single-active invariant violated — found ${active.length} active dreams: ${active.join(", ")}. Resolve manually.`
        }

        // Read active dream to get its ID for the log
        const activeDream = readDreamState(path.join(directory, ".opencode/dreams/active", active[0]))
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_complete] completing dream", { dreamId: activeDream.dream_id, caller })
        }

        // Parse artifact IDs
        const rawIds = args.artifact_ids ?? ""
        const artifactIds = rawIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)

        const exitTime = new Date().toISOString()

        let result
        try {
          result = completeDream(directory, exitTime, artifactIds)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg === "NO_ACTIVE_DREAM") {
            return "Error: no active dream found. Nothing to complete."
          }
          log("error", "[dream_complete] failed", { err: msg, caller })
          return `Error completing dream: ${msg}`
        }

        const { dreamId, historyPath, linkedArtifacts, missingArtifacts } = result
        const totalLinked = Object.values(linkedArtifacts).reduce((s, a) => s + a.length, 0)

        log("info", `[dream_complete] completed ${dreamId}`, { historyPath, totalLinked, caller })

        const lines = [
          `Dream ${dreamId} completed.`,
          `  Status: COMPLETE`,
          `  History: ${historyPath}`,
          `  Artifacts linked: ${totalLinked} (insights:${linkedArtifacts.insights.length} warnings:${linkedArtifacts.warnings.length} songlines:${linkedArtifacts.songlines.length} shadows:${linkedArtifacts.shadows.length})`,
        ]
        if (missingArtifacts.length > 0) {
          lines.push(`  ⚠ Missing artifact files (linked in DRM but not found on disk): ${missingArtifacts.join(", ")}`)
        }
        return lines.join("\n")
      },
    }),

    // ── Audit helpers ─────────────────────────────────────────────────────────

    hive_dream_list: tool({
      description:
        "Return a lightweight index of dream artifacts — ID, type, source dream, and a ~80-char content excerpt. " +
        "Cheaper than hive_dream_query (no full parse); use for ID validation, audit pre-pass, or a quick 'what exists' overview. " +
        "Optional filters: type (one artifact type) and/or source_dream (e.g. 'DRM-014'). " +
        "Distinct from hive_dream_query which returns full content and supports confidence/tag filtering.",
      args: {
        type: tool.schema.enum(["insight", "warning", "songline", "shadow"]).optional().describe("Filter to a single artifact type. Omit for all types."),
        source_dream: tool.schema.string().optional().describe("Filter to artifacts from a specific dream (e.g. 'DRM-014')."),
      },
      async execute(args, _context) {
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_list] listing artifacts", { type: args.type, source_dream: args.source_dream })
        }

        const types: ArtifactType[] | undefined = args.type ? [args.type as ArtifactType] : undefined
        const entries = listArtifacts(directory, { types, source_dream: args.source_dream })

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

    hive_dream_supersede: tool({
      description:
        "Mark an artifact as superseded by a newer one. " +
        "Appends superseded_by and optionally supersede_reason to the artifact file, preserving all existing content byte-for-byte. " +
        "Validates both IDs exist on disk before writing. " +
        "Called by dreamtime after a dreamcatcher audit flags a supersession candidate — dreamcatcher itself is read-only. " +
        "Use hive_dream_mark_stale instead if there is no direct replacement artifact.",
      args: {
        id: tool.schema.string().describe("The artifact being superseded (e.g. 'I-034')"),
        superseded_by: tool.schema.string().describe("The replacement artifact ID (e.g. 'I-047')"),
        reason: tool.schema.string().optional().describe("Optional short explanation of why this artifact was superseded"),
      },
      async execute(args, context) {
        const caller = ns.resolveAgent(context.sessionID, context.agent)
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_supersede] marking superseded", { id: args.id, superseded_by: args.superseded_by, caller })
        }

        // Validate target artifact exists
        const targetPath = pathForId(directory, args.id)
        if (!targetPath) {
          log("warn", "[dream_supersede] unknown id prefix", { id: args.id, caller })
          return `Error: cannot resolve artifact type from id '${args.id}'. Expected format: I-NNN, W-NNN, SNG-NNN, SHADOW-NNN.`
        }
        if (!fs.existsSync(targetPath)) {
          log("warn", "[dream_supersede] target artifact not found", { id: args.id, targetPath, caller })
          return `Error: artifact ${args.id} not found at ${targetPath}.`
        }

        // Validate replacement artifact exists
        const replacementPath = pathForId(directory, args.superseded_by)
        if (!replacementPath) {
          log("warn", "[dream_supersede] unknown replacement id prefix", { superseded_by: args.superseded_by, caller })
          return `Error: cannot resolve artifact type from replacement id '${args.superseded_by}'.`
        }
        if (!fs.existsSync(replacementPath)) {
          log("warn", "[dream_supersede] replacement artifact not found", { superseded_by: args.superseded_by, caller })
          return `Error: replacement artifact ${args.superseded_by} not found at ${replacementPath}. Create it first.`
        }

        const fields: Array<{ key: string; value: string | boolean | number }> = [
          { key: "superseded_by", value: args.superseded_by },
        ]
        if (args.reason) {
          fields.push({ key: "supersede_reason", value: args.reason })
        }

        appendFieldsToArtifact(targetPath, fields)
        log("info", `[dream_supersede] ${args.id} superseded by ${args.superseded_by}`, { targetPath, caller })
        return `${args.id} marked superseded_by: ${args.superseded_by}${args.reason ? ` (reason: ${args.reason})` : ""}. File: ${targetPath}`
      },
    }),

    hive_dream_mark_stale: tool({
      description:
        "Mark an artifact as stale (no longer reliable, but no direct replacement). " +
        "Appends stale: true and optionally stale_reason to the artifact file, preserving all existing content byte-for-byte. " +
        "Validates the artifact ID exists on disk before writing. " +
        "Called by dreamtime after a dreamcatcher audit flags a staleness candidate. " +
        "Use hive_dream_supersede instead if there is a specific replacement artifact.",
      args: {
        id: tool.schema.string().describe("The artifact to mark stale (e.g. 'W-003')"),
        reason: tool.schema.string().optional().describe("Optional short explanation of why this artifact is stale"),
      },
      async execute(args, context) {
        const caller = ns.resolveAgent(context.sessionID, context.agent)
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_mark_stale] marking stale", { id: args.id, caller })
        }

        const targetPath = pathForId(directory, args.id)
        if (!targetPath) {
          log("warn", "[dream_mark_stale] unknown id prefix", { id: args.id, caller })
          return `Error: cannot resolve artifact type from id '${args.id}'. Expected format: I-NNN, W-NNN, SNG-NNN, SHADOW-NNN.`
        }
        if (!fs.existsSync(targetPath)) {
          log("warn", "[dream_mark_stale] artifact not found", { id: args.id, targetPath, caller })
          return `Error: artifact ${args.id} not found at ${targetPath}.`
        }

        const fields: Array<{ key: string; value: string | boolean | number }> = [
          { key: "stale", value: true },
        ]
        if (args.reason) {
          fields.push({ key: "stale_reason", value: args.reason })
        }

        appendFieldsToArtifact(targetPath, fields)
        log("info", `[dream_mark_stale] ${args.id} marked stale`, { targetPath, caller })
        return `${args.id} marked stale: true${args.reason ? ` (reason: ${args.reason})` : ""}. File: ${targetPath}`
      },
    }),

    hive_dream_detect_duplicates: tool({
      description:
        "Scan the artifact archive and return candidate near-duplicate pairs using cheap heuristics: " +
        "domain-tag Jaccard overlap + content-token Jaccard overlap. " +
        "Returns pairs above a similarity threshold with scores and content excerpts. " +
        "This is a pre-filter only — semantic relevance judgment and the final merge/supersede decision stay with dreamcatcher and dreamtime. " +
        "A high score means textual/tag similarity, not guaranteed duplication.",
      args: {
        threshold: tool.schema.number().optional().describe("Minimum similarity score 0.0–1.0 to report (default 0.35). Lower = more candidates, higher = fewer but stronger matches."),
        types: tool.schema.string().optional().describe("Comma-separated artifact types to scan. Default: all types."),
      },
      async execute(args, _context) {
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_detect_duplicates] scanning", { threshold: args.threshold, types: args.types })
        }

        const threshold = args.threshold ?? 0.35

        // If type filter given, re-use full scan and filter — detectDuplicateCandidates
        // internally scans all types; we post-filter the pairs if needed
        const typeFilter = args.types
          ? new Set(args.types.split(",").map((t) => t.trim()) as ArtifactType[])
          : null

        const candidates = detectDuplicateCandidates(directory, threshold)
        const filtered = typeFilter
          ? candidates.filter((c) => typeFilter.has(c.typeA) || typeFilter.has(c.typeB))
          : candidates

        if (filtered.length === 0) {
          return `No near-duplicate candidates found above threshold ${threshold}.`
        }

        const lines = [
          `Duplicate detection — ${filtered.length} candidate pair(s) above threshold ${threshold}:\n`,
        ]
        for (const c of filtered) {
          lines.push(
            `${c.idA} [${c.typeA}] ≈ ${c.idB} [${c.typeB}]  score=${c.score} ` +
            `(tags=${c.tag_jaccard} tokens=${c.token_overlap})`
          )
          lines.push(`  A: ${c.summaryA}`)
          lines.push(`  B: ${c.summaryB}`)
          lines.push("")
        }
        lines.push("Semantic judgment: use dreamcatcher Audit mode to assess whether these are true duplicates.")
        return lines.join("\n")
      },
    }),

  }
}
