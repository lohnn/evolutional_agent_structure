/**
 * HIVE custom tools: hive_signal, hive_listen, hive_awaken,
 *                    hive_dream_residue, hive_dream_harvest,
 *                    hive_dream_artifact_create, hive_dream_query
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
  type ArtifactType,
  type InsightArtifact,
  type WarningArtifact,
  type SonglineArtifact,
  type ShadowArtifact,
} from "./lib/dream-artifacts.js"

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

  }
}
