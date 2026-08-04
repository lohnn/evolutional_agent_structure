/**
 * HIVE custom tools: hive_signal, hive_listen, hive_awaken,
 *                    hive_dream_residue, hive_dream_harvest,
 *                    hive_dream_artifact_create, hive_dream_query,
 *                    hive_dream_rank,
 *                    hive_dream_begin, hive_dream_complete,
 *                    hive_dream_list, hive_dream_supersede,
 *                    hive_dream_mark_stale, hive_dream_detect_duplicates,
 *                    hive_note_painpoint, hive_painpoints_list, hive_painpoints_harvest,
 *                    workspace_map
 */

import { tool } from "@opencode-ai/plugin"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { formatInboxForPrompt } from "./lib/hivemind.js"
import type { NervousSystem } from "./lib/nervous-system.js"
import { appendResidue, harvestJournals, formatHarvestForDreamer, type ResidueKind } from "./lib/dream-journal.js"
import { appendPainpoint, listPainpoints, formatPainpointsForReview, harvestPainpoints, formatPainpointsForHarvest } from "./lib/painpoint-journal.js"
import {
  buildWorkspaceMap,
  lookupEntry,
  formatMap,
  formatEntry,
  formatNotFound,
} from "./lib/workspace-map.js"
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
import { rankArtifacts } from "./lib/dream-rank.js"
import { recordSurfacedEvent } from "./lib/dream-telemetry.js"
import {
  bindSession,
  autoRegister,
  startItem,
  markItemDoneFromDream,
  createIdea,
  respecItem,
  retitleItem,
  editItemTags,
  sdkSessionClient,
  type SdkLikeClient,
} from "./lib/board-transitions.js"
import { listRevisions } from "./lib/board-store.js"
import path from "path"
import fs from "fs"

type Client = ReturnType<typeof createOpencodeClient>
type LogFn = (level: "info" | "debug" | "error" | "warn", message: string, extra?: Record<string, unknown>) => void

// Keys a caller must never supply to hive_board_create. The schema does not
// reject undeclared keys (it rejects nothing at runtime), so "refuse, don't
// strip" has to be an explicit membership test — silently dropping them
// would teach the caller the wrong call shape worked.
const FORBIDDEN_CREATE_KEYS = [
  "id",
  "owner_session",
  "group_id",
  "spec_hash",
  "transitions",
  "dream_id",
  "artifacts",
  "todo_mirror",
  "released_sessions",
  "origin",
  "paused",
  "done_without_dream",
]


export function createHiveTools(
  ns: NervousSystem,
  client: Client,
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
        const groupID = ns.getGroupID(context.sessionID)

        let pending = ns.readMessages(agent, groupID)
        if (isCoordinator) {
          pending = [...pending, ...ns.readMessages("_coordinator", groupID)]
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

        // Board auto-register (hive-board DESIGN §5.3b): every awakened TOP-LEVEL
        // coordinator session gets a work item, create-or-bind semantics. Board
        // failures must never break awakening — best-effort with a warn log.
        let boardNote = ""
        try {
          let title = ""
          let parentID: string | undefined
          try {
            const res = await client.session.get({ path: { id: context.sessionID } })
            const sess = res?.data as { title?: string; parentID?: string } | undefined
            title = sess?.title ?? ""
            parentID = sess?.parentID
          } catch {
            // session.get unavailable — proceed with fallback title (awaken is a
            // user command, virtually always in a top-level chat)
          }
          // NOTE: at awaken time opencode's title is usually still the
          // "New session - <ISO>" placeholder (the model hasn't written a real
          // one yet). We store whatever we have; the session.updated event hook
          // (hooks.ts) patches it to the real title once opencode settles it —
          // do NOT try to "fix" the stale title here, the real one doesn't exist
          // yet at this moment.
          if (!parentID && !ns.isCapabilitySession(context.sessionID)) {
            const groupID = ns.getGroupID(context.sessionID) ?? context.sessionID
            const result = await autoRegister(
              directory,
              context.sessionID,
              groupID,
              title || `Session ${context.sessionID}`
            )
            if (result.action === "registered") {
              boardNote = ` Board: registered work item ${result.item.id} for this session.`
            } else if (result.action === "noop-owned") {
              boardNote = ` Board: this session already owns ${result.item.id}.`
            } else if (result.action === "skipped-released") {
              boardNote = ` Board: this session was released from ${result.item.id} (true-demoted) — not re-adopted.`
            }
          }
        } catch (err) {
          log("warn", "[board] awaken auto-register failed", { sessionID: context.sessionID, error: String(err) })
        }

        return "HIVE awakened for this session. Capability dispatch and HIVEmind messaging are now active." + boardNote
      },
    }),

    // ── hive-board: bind current session to a work item ──────────────────────

    hive_board_bind: tool({
      description:
        "Bind the CURRENT session to a hive-board work item (.opencode/board/WI-*.md): stamps this session as owner_session (+ group_id), moves the item to in_progress, appends the transition. " +
        "Session identity is resolved from the runtime — you do NOT pass a session id. " +
        "Enforced: the item must be un-owned, this session must not own another item (session⟷item is strictly 1:1), and this session must not be tombstoned in the item's released_sessions[].",
      args: {
        id: tool.schema.string().describe("Work item id, e.g. WI-007"),
      },
      async execute(args, context) {
        if (ns.isCapabilitySession(context.sessionID)) {
          return "Refused: capability sessions cannot own work items — only top-level HIVE coordinator sessions do."
        }
        if (!ns.isSessionAwake(context.sessionID)) {
          return "Refused: this session is not HIVE-awakened. Run /awaken first — In Progress requires an awakened coordinator owner (SCHEMA §3, invariant 1)."
        }
        const groupID = ns.getGroupID(context.sessionID) ?? context.sessionID
        const result = await bindSession(directory, args.id.trim(), context.sessionID, groupID)
        if (!result.ok) {
          const hint =
            result.reason === "SESSION_OWNS_OTHER"
              ? " To re-point this session, true-demote the currently owned item first (board demote — it tombstones this session there), then bind again."
              : ""
          return `Refused (${result.reason}): ${result.detail}${hint}`
        }
        if (result.action === "already-bound") {
          return `${result.item.id} is already bound to this session — no-op.`
        }
        const absorbedNote =
          result.action === "bound-absorbed" && result.absorbed
            ? ` Pristine auto-registered placeholder ${result.absorbed} was absorbed (dissolved; lineage recorded on the bind transition).`
            : ""
        return `Bound ${result.item.id} ("${result.item.title}") to this session (${context.sessionID}). Status: in_progress; owner_session + group_id stamped together; spec_hash stamped; transition appended.${absorbedNote}`
      },
    }),

    // ── hive-board: author a new work item ───────────────────────────────────

    hive_board_create: tool({
      description:
        "Create a hive-board work item (an idea) in .opencode/board/. " +
        "USE THIS INSTEAD OF HAND-WRITING A WI-*.md FILE — you do not need to read an existing item, look up the frontmatter shape, or find a free id. " +
        "The id is allocated atomically under the board lock and every birth default is set for you. " +
        "New items are UN-OWNED and land in backlog (or todo); ownership comes later via hive_board_bind (this session) or hive_board_start (a fresh session). " +
        "You do NOT pass id, owner_session, group_id, spec_hash, status beyond backlog/todo, or transitions — those belong to the transition module and are REFUSED if supplied, not silently ignored. " +
        "`subtasks` may be set here at creation time ONLY (an author-written plan); there is deliberately no tool to edit them afterwards.",
      args: {
        title: tool.schema.string().describe("Short imperative title, e.g. 'Add push opt-out toggle'"),
        body: tool.schema.string().optional().describe("The spec / notes, markdown. Revise later with hive_board_respec (which preserves what it replaces)."),
        status: tool.schema.enum(["backlog", "todo"]).optional().describe("Starting column. Default backlog. Anything else is refused — in_progress/done are reached through transitions, never set directly."),
        priority: tool.schema.enum(["low", "medium", "high"]).optional().describe("Ordering hint within the column. Default medium."),
        tags: tool.schema.array(tool.schema.string()).optional().describe("Bare tokens (letters/digits/dot/dash/underscore). Editable later with hive_board_tag."),
        subtasks: tool.schema.array(tool.schema.string()).optional().describe("Author-written plan steps, in order. CREATION-TIME ONLY — they cannot be edited afterwards, so only pass them if the decomposition is already settled."),
      },
      async execute(args, context) {
        // ── RUNTIME arg validation ────────────────────────────────────────
        // `tool()` is the identity function and `tool.schema` is re-exported
        // zod that nothing invokes: the declarations above describe the tool
        // to the model and infer TypeScript types, but reject NOTHING at
        // runtime. Anything the model emits arrives here as-is — including
        // values outside a declared enum, and keys not declared at all.
        // Verified the hard way: a live call with status:"in_progress" wrote
        // WI-065 to disk. Everything a description advertises as refused must
        // be refused HERE, imperatively (or in the module, for shared paths).
        const forbidden = FORBIDDEN_CREATE_KEYS.filter((k) => k in (args as Record<string, unknown>))
        if (forbidden.length > 0) {
          return (
            `Refused (TRANSITION_MODULE_FIELD): ${forbidden.join(", ")} ${forbidden.length === 1 ? "is" : "are"} owned by the transition module, not the author. ` +
            `Ownership (owner_session/group_id) is stamped by hive_board_bind / hive_board_start; spec_hash by bind and true-demote; ` +
            `transitions are appended by the operation that caused them; the id is allocated here. Drop ${forbidden.length === 1 ? "it" : "them"} and retry.`
          )
        }
        const title = args.title.trim()
        if (title === "") return "Refused (EMPTY_TITLE): title is required and cannot be empty."
        const result = await createIdea(directory, {
          title,
          ...(args.body !== undefined ? { body: args.body } : {}),
          ...(args.status !== undefined ? { status: args.status } : {}),
          ...(args.priority !== undefined ? { priority: args.priority } : {}),
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
          ...(args.subtasks !== undefined
            ? { subtasks: args.subtasks.map((content) => ({ content, status: "pending" as const })) }
            : {}),
          by: `hive_board_create:${ns.resolveAgent(context.sessionID, context.agent) ?? "session"}`,
        })
        // NEVER assume the module cannot refuse. The previous version of this
        // line asserted createIdea "returns TransitionOk unconditionally — the
        // only rejectable inputs are gated by schema", and that belief put an
        // in_progress un-owned item on disk (WI-065). tool.schema validates
        // nothing at runtime; the module is the guard, and it can say no.
        if (!result.ok) return `Refused (${result.reason}): ${result.detail}`
        const it = result.item
        return (
          `Created ${it.id} ("${it.title}") — status ${it.status}, priority ${it.priority}, un-owned. ` +
          `Birth transition appended.${it.subtasks.length > 0 ? ` ${it.subtasks.length} subtask(s) recorded (not editable afterwards).` : ""} ` +
          `Take ownership with hive_board_bind ${it.id} (this session) or hive_board_start ${it.id} (fresh session).`
        )
      },
    }),

    // ── hive-board: revise a spec body (history-preserving) ──────────────────

    hive_board_respec: tool({
      description:
        "Revise the SPEC BODY of a hive-board work item, preserving the text it replaces. " +
        "The previous body is NEVER destroyed: it is archived content-addressed under .opencode/board/<id>/ and the revision is appended to the item's transition log with the superseded spec_hash, so history stays readable and attributable. " +
        "Use this instead of editing a WI-*.md file by hand — a hand edit bypasses the board lock (the viewer writes to the same files) and loses the previous text permanently, since the board is gitignored and has no VCS underneath. " +
        "REFUSES if the item is owned by a DIFFERENT session: once owned, the spec belongs to the owning session, which accumulates decisions in it. Demote the item first to make it fluid again. " +
        "Does NOT touch status, ownership, subtasks, todo_mirror or spec_hash — on a demoted item the difference between the live body and the stamped spec_hash is what decides re-attach vs fresh session, so re-stamping it here would silently reattach a session to a spec it never agreed to.",
      args: {
        id: tool.schema.string().describe("Work item id, e.g. WI-064"),
        body: tool.schema.string().describe("The COMPLETE new spec body (this replaces the whole body, not a patch). Empty is refused — that would discard the spec, not revise it."),
      },
      async execute(args, context) {
        const id = args.id.trim()
        const result = await respecItem(directory, id, args.body, {
          session: context.sessionID,
          by: `hive_board_respec:${ns.resolveAgent(context.sessionID, context.agent) ?? "session"}`,
        })
        if (!result.ok) return `Refused (${result.reason}): ${result.detail}`
        if (result.action === "respec-noop") return `${id}: body is byte-identical to the current spec — no revision recorded.`
        const revs = listRevisions(directory, id)
        return (
          `Revised ${id}'s spec. Previous body archived at .opencode/board/${id}/ ` +
          `(${revs.length} revision${revs.length === 1 ? "" : "s"} retained; recover with the superseded hash on the transition entry). ` +
          `spec_hash deliberately NOT re-stamped.`
        )
      },
    }),

    // ── hive-board: retitle ─────────────────────────────────────────────────

    hive_board_retitle: tool({
      description:
        "Change a hive-board work item's title. " +
        "REFUSES if the item is owned by a different session — once owned, the title is mirrored from that session and stored on the item. " +
        "For the spec body use hive_board_respec; this touches the title only.",
      args: {
        id: tool.schema.string().describe("Work item id, e.g. WI-064"),
        title: tool.schema.string().describe("The new title."),
      },
      async execute(args, context) {
        const result = await retitleItem(directory, args.id.trim(), args.title, {
          session: context.sessionID,
          by: "hive_board_retitle",
        })
        if (!result.ok) return `Refused (${result.reason}): ${result.detail}`
        if (result.action === "retitle-noop") return `${args.id.trim()}: title unchanged — no write.`
        return `Retitled ${result.item.id} to "${result.item.title}".`
      },
    }),

    // ── hive-board: edit tags (set deltas) ───────────────────────────────────

    hive_board_tag: tool({
      description:
        "Add and/or remove TAGS on a hive-board work item. " +
        "Pass only what CHANGES — this is a set delta, never a whole-list replace, so a concurrent editor's tags are merged rather than clobbered. " +
        "Adding a tag that is already present, or removing one that is absent, is a harmless no-op. " +
        "Naming the same tag in both add and remove is REFUSED rather than guessed. " +
        "Tags are bare tokens: letters, digits, dot, dash, underscore — no spaces, commas or brackets. " +
        "Works on owned and un-owned items alike (tags are shared metadata, not part of the spec).",
      args: {
        id: tool.schema.string().describe("Work item id, e.g. WI-064"),
        add: tool.schema.array(tool.schema.string()).optional().describe("Tags to add. Only the ones you are adding."),
        remove: tool.schema.array(tool.schema.string()).optional().describe("Tags to remove. Only the ones you are removing."),
      },
      async execute(args, _context) {
        const result = await editItemTags(
          directory,
          args.id.trim(),
          {
            ...(args.add !== undefined ? { add: args.add } : {}),
            ...(args.remove !== undefined ? { remove: args.remove } : {}),
          },
          { by: "hive_board_tag" }
        )
        if (!result.ok) return `Refused (${result.reason}): ${result.detail}`
        if (result.action === "tags-noop") return `${args.id.trim()}: tags already in that state — no write.`
        return `${result.item.id} tags: [${result.item.tags.join(", ")}]`
      },
    }),

    // ── hive-board: start an idea item in a FRESH coordinator session ────────

    hive_board_start: tool({
      description:
        "Start a hive-board idea item (backlog/todo, un-owned) in a FRESH top-level HIVE coordinator session: creates the session, stamps it as owner, and triggers /awaken in it seeded with the item's spec. " +
        "Use hive_board_bind instead when THIS session should own the item. Done items are reopened via re-attach, not started fresh.",
      args: {
        id: tool.schema.string().describe("Work item id, e.g. WI-007"),
      },
      async execute(args, _context) {
        const sessions = sdkSessionClient(client as unknown as SdkLikeClient)
        const result = await startItem(directory, args.id.trim(), sessions, {
          onAwakenError: (err) =>
            log("warn", "[board] awaken-on-create trigger failed — session exists and is owned, but /awaken must be run manually", {
              itemID: args.id.trim(),
              error: String(err),
            }),
        })
        if (!result.ok) {
          return `Refused (${result.reason}): ${result.detail}`
        }
        return (
          `Started ${result.item.id} ("${result.item.title}") in fresh coordinator session ${result.sessionID}. ` +
          `Ownership stamped first, then /awaken triggered in it (seeded with the item spec — the session is awakening in the background). ` +
          `Deep link: ?session=${result.sessionID}`
        )
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
        appendResidue(directory, capability, context.sessionID, args.content, args.kind as ResidueKind | undefined)
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

    // ── Pain points (harness/workflow friction — problems only, no fixes) ─────

    hive_note_painpoint: tool({
      description:
        "Jot down a HARNESS or WORKFLOW pain point the moment you hit it — a friction in the tools, environment, or process (NOT a bug in the code you're building). " +
        "Capture the problem and the context needed to understand it later: what you were doing, what was slow or painful, what information you needed and couldn't easily get, and where (file paths, commands, cycle counts, retries). " +
        "CRITICAL DISCIPLINE — capture the PROBLEM ONLY. Do NOT propose, hint at, or record a solution: there is no solution field on purpose. Fixes come later, with fresh eyes; a premature fix jotted mid-frustration usually anchors on the wrong cause. " +
        "This is a stricter sibling of hive_dream_residue, kept in a separate log. Use hive_dream_residue for general cross-session learnings; use THIS only for concrete harness/workflow friction worth fixing. " +
        "The tool resolves your identity automatically; you do NOT pass your own name.",
      args: {
        problem: tool.schema.string().describe("The pain point itself — what was frustrating, slow, or missing. State the problem, not a fix."),
        context: tool.schema.string().describe("Everything needed to understand the problem later: what you were doing, what was painful, what info you needed, and where (file paths, commands, cycle/retry counts). Do NOT include a proposed solution."),
      },
      async execute(args, context) {
        const worker = ns.resolveAgent(context.sessionID, context.agent)
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[note_painpoint] capturing pain point", { worker })
        }
        appendPainpoint(directory, worker, context.sessionID, args.problem, args.context)
        return `Pain point captured (problem-only, no fix — as intended). Logged for \`${worker}\` in this session's pain-point log. Review anytime with hive_painpoints_list.`
      },
    }),

    hive_painpoints_list: tool({
      description:
        "List all currently-open HARNESS/WORKFLOW pain points across sessions (captured via hive_note_painpoint). " +
        "Read-only review: reads the raw pain-point logs and returns each open problem with its context, so the user — or a fresh-eyes pass looking to propose fixes — can review them anytime. " +
        "These are deliberately problems-only (no solutions attached). Use this before a workflow-improvement pass, or when the user asks 'what's been annoying us lately'.",
      args: {},
      async execute(_args, _context) {
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[painpoints_list] listing open pain points")
        }
        const files = listPainpoints(directory)
        return formatPainpointsForReview(files)
      },
    }),

    hive_painpoints_harvest: tool({
      description:
        "Harvest all open HARNESS/WORKFLOW pain points for the dreamtime consolidation workflow, then archive them so the next session starts clean. " +
        "Analogous to hive_dream_harvest but SEPARATE: pain points are harness-fix CANDIDATES, not dream feedstock — do NOT compress them into insights/warnings/songlines/shadows. Surface them to the user (or a fresh-eyes pass) as concrete workflow problems to fix. " +
        "By default the logs are atomically archived after reading (peek=true reads without clearing). " +
        "Call this during the dreamtime harvest step, alongside hive_dream_harvest. If you only want to review without clearing, use hive_painpoints_list instead.",
      args: {
        peek: tool.schema.boolean().optional().describe("If true, read pain points without archiving them (non-destructive peek). Default false — harvest and archive."),
      },
      async execute(args, _context) {
        const clear = !args.peek
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[painpoints_harvest] harvesting pain points", { clear })
        }
        const files = harvestPainpoints(directory, clear)
        log("info", `[painpoints_harvest] harvested ${files.length} pain-point log(s)`, { clear })
        return formatPainpointsForHarvest(files)
      },
    }),

    // ── Workspace map (fast orientation) ──────────────────────────────────────

    workspace_map: tool({
      description:
        "THE live source of truth for what projects exist in this workspace, where they are on disk, their git state, and what each one is. " +
        "Use this at the START of any work — to locate a project and see its git footing and description — INSTEAD of searching/globbing the tree or reading a project table (the root AGENTS.md no longer carries one). One call replaces the locate-then-git-status dance. " +
        "NO argument → the full workspace map across the canonical tiers: projects/ (worked-on — the primary detailed section, each with absolute path, concise git state, and a description read from the project's AGENTS.md/README front-matter), plus secondary context: reference/repos/ (clones of other codebases), reference/material/ (non-code reference), scratch/ (throwaway), and core folders (.opencode/, projects/). " +
        "WITH a name argument → fuzzy/substring-matches one entry (project, reference repo/material, scratch, or core folder) and returns its absolute path, full description, and git state; on no match it GUIDES you (close matches or the valid scopes) rather than returning empty. " +
        "Git state per entry: branch, clean/dirty, ahead/behind upstream, and whether it's an embedded/gitlink repo distinct from the workspace root — resolved per-entry, so embedded project repos are reported correctly. State is honest and degrades gracefully: a shared working tree can look odd mid-operation, so treat it as a snapshot, not gospel. " +
        "Descriptions come from each project's own AGENTS.md front-matter (`description:`), falling back to README.md front-matter; projects that carry neither simply show no description.",
      args: {
        name: tool.schema.string().optional().describe("Optional entry name (project, reference repo/material, scratch, or core folder) — fuzzy/substring, case-insensitive. Omit to list the entire workspace map."),
      },
      async execute(args, _context) {
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[workspace_map] building map", { name: args.name })
        }
        const entries = buildWorkspaceMap(directory)

        if (!args.name || args.name.trim() === "") {
          return formatMap(entries, directory)
        }

        const result = lookupEntry(entries, args.name)
        if (result.match) {
          return formatEntry(result.match)
        }
        return formatNotFound(args.name, result, entries)
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
        "All filters are optional — omitting all returns the full archive (likely index mode at 86+ artifacts). " +
        "IMPORTANT: domain_tags only exists on insights and songlines. Warnings and shadows carry NO tags, so any query with a domain_tags filter excludes ALL warnings and shadows. " +
        "To gather everything on a topic, run TWO queries: (1) domain_tags='<topic>' for tagged insights/songlines, then (2) a separate untagged query (e.g. types='warning,shadow' with no domain_tags) and judge relevance from content. " +
        "An empty result from a tag-filtered warning/shadow query means 'tags don't apply', NOT 'no relevant artifacts exist'. " +
        "EXACT FETCH: pass ids='I-012,W-007' to retrieve specific artifacts in full — the companion to hive_dream_rank's shortlist. When ids is set, all other filters are ignored and full content is always returned.",
      args: {
        types: tool.schema.string().optional().describe("Comma-separated artifact types to include: insight,warning,songline,shadow. Default: all."),
        domain_tags: tool.schema.string().optional().describe("Comma-separated tags, ANY-match. ONLY applies to insights and songlines — warnings and shadows have no tags and are excluded entirely when this filter is set. Omit it (and filter by types/content instead) to reach warnings/shadows. E.g. 'plugin-design,file-io'"),
        min_confidence: tool.schema.number().optional().describe("Minimum confidence or transfer_rating to include (0.0–1.0). Shadows have no confidence and are always included when their type is requested."),
        ids: tool.schema.string().optional().describe("Comma or space-separated artifact IDs for exact fetch (e.g. 'I-012,W-007,SNG-003'). Always returns full content; other filters are ignored. Use after hive_dream_rank to pull the shortlisted artifacts you judged promising."),
      },
      async execute(args, context) {
        // Exact-fetch mode: ids bypass every other filter (a tag/confidence
        // filter silently dropping an explicitly-requested ID would be the
        // "empty result is a lie" footgun in new clothes).
        if (args.ids && args.ids.trim() !== "") {
          const requested = args.ids.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
          const result = queryArtifacts(directory, { ids: requested })
          const foundIds = (result.full ?? []).map((e) => e.id)
          const missing = requested.filter((id) => !foundIds.includes(id))

          // Telemetry (Class B side effect — must never fail the query)
          recordSurfacedEvent(directory, context.sessionID, "query", `ids:${requested.join(",")}`, foundIds, result.total)

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
        // If a tag filter is combined with a type filter restricted to tagless types
        // (warning/shadow), the result can ONLY be empty — which reads as "no relevant
        // artifacts" when it really means "tags don't apply here". Fail loudly with guidance
        // instead of returning a misleading empty list.
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

        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_query] querying artifacts", { typeFilter, tagFilter, min_confidence: args.min_confidence })
        }

        const result = queryArtifacts(directory, {
          types: typeFilter,
          domain_tags: tagFilter,
          min_confidence: args.min_confidence,
        })

        // Telemetry (Class B side effect — never fails the query, never feeds ranking)
        {
          const surfacedIds = result.mode === "full"
            ? (result.full ?? []).map((e) => e.id)
            : (result.index ?? []).map((e) => e.id)
          const filterSummary = `types:${args.types ?? "*"} tags:${args.domain_tags ?? "*"} min_conf:${args.min_confidence ?? "*"}`
          recordSurfacedEvent(directory, context.sessionID, "query", filterSummary, surfacedIds, result.total)
        }

        // Mixed-case reminder: a tag filter silently excludes tagless types (warning/shadow).
        // The all-tagless case is already rejected above; here we only nudge when the query
        // is valid but tagless types were (or could have been) dropped by the tag filter.
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

        // Index mode
        const lines = [`Dream archive query — ${result.total} artifact(s) (summary index — request specific types/tags for full content):\n`]
        for (const { id, type, summary } of result.index!) {
          lines.push(`${id} [${type}]: ${summary}`)
        }
        return lines.join("\n") + taglessNote
      },
    }),

    hive_dream_rank: tool({
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
      args: {
        query: tool.schema.string().describe("Free-text description of the task/topic to rank against (e.g. 'concurrent file writes in plugin journals')"),
        k: tool.schema.number().optional().describe("Shortlist size (default 30). If k >= archive size, everything is returned ranked."),
        types: tool.schema.string().optional().describe("Comma-separated artifact types to restrict ranking to. Default: all four. NOTE: restricting types also disables the floors for excluded types."),
      },
      async execute(args, context) {
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

        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_rank] ranking artifacts", { query, k: args.k, types: args.types })
        }

        const { results, total, backend } = rankArtifacts(directory, query, {
          k: args.k,
          types: typeFilter,
        })

        // Telemetry (Class B side effect — never fails the query, never feeds ranking)
        recordSurfacedEvent(directory, context.sessionID, "rank", query, results.map((r) => r.id), total)

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
          const existing = active[0]!.replace(".yaml", "")
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
        // Exactly one element — both the 0 and >1 cases returned above.
        const activeDream = readDreamState(path.join(directory, ".opencode/dreams/active", active[0]!))
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

        // Board: if THIS session owns an in-progress work item, promote it to
        // Done now that its dream is COMPLETE (event-driven — there is no timer
        // tick, W-064; the completing process must apply the transition). Only
        // context.sessionID is trustworthy identity (I-179, never agent
        // self-report). The write is the shared, locked markItemDoneFromDream —
        // this handler only DETECTS + resolves identity. Best-effort: a board
        // failure must never fail the dream completion (mirrors the title hook).
        try {
          const promo = await markItemDoneFromDream(directory, context.sessionID, dreamId)
          if (promo.ok && (promo.action === "done" || promo.action === "redefined") && promo.item) {
            lines.push(
              `  Board: ${promo.item.id} → done (${promo.action === "redefined" ? "re-stamped from " : ""}${dreamId}, ${promo.item.artifacts.length} artifact(s) mirrored).`
            )
            log("info", `[dream_complete] board ${promo.action}`, { itemID: promo.item.id, dreamId, caller })
          } else if (!promo.ok) {
            log("warn", "[dream_complete] board promote refused", { reason: promo.reason, detail: promo.detail, dreamId, caller })
          }
        } catch (err: unknown) {
          log("error", "[dream_complete] board promote failed", { err: err instanceof Error ? err.message : String(err), dreamId, caller })
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
        "Scan the artifact archive and return candidate pairs within a similarity band, using cheap heuristics: " +
        "domain-tag Jaccard overlap + content-token Jaccard overlap. " +
        "Two bands, two jobs: the HIGH band (threshold ~0.6+) surfaces near-duplicate candidates (merge/supersede); " +
        "the MID band (threshold ~0.30, max_threshold ~0.60) is the contradiction-hunting zone — same topic, different words, possibly different stance. " +
        "Each pair carries divergence annotations: conf_delta (|confidence difference|) and dream_distance (DRM-ordinal gap) — " +
        "a high-similarity pair with divergent confidence or a large dream gap is prime supersession/contradiction territory. " +
        "This is a pre-filter only — divergent CLAIMS are not heuristically detectable; semantic judgment (duplicate vs contradiction vs unrelated) " +
        "and the final merge/supersede decision stay with dreamcatcher and dreamtime. " +
        "A high score means textual/tag similarity, not guaranteed duplication.",
      args: {
        threshold: tool.schema.number().optional().describe("Minimum similarity score 0.0–1.0 to report (default 0.35). Lower = more candidates, higher = fewer but stronger matches."),
        max_threshold: tool.schema.number().optional().describe("Maximum similarity score to report (default 1.0). Set threshold=0.30, max_threshold=0.60 to isolate the mid-band for contradiction hunting."),
        types: tool.schema.string().optional().describe("Comma-separated artifact types to scan. Default: all types."),
      },
      async execute(args, _context) {
        if (process.env.HIVE_DEBUG === "1") {
          log("info", "[dream_detect_duplicates] scanning", { threshold: args.threshold, max_threshold: args.max_threshold, types: args.types })
        }

        const threshold = args.threshold ?? 0.35
        const maxThreshold = args.max_threshold ?? 1.0
        if (maxThreshold < threshold) {
          return `Invalid band: max_threshold (${maxThreshold}) is below threshold (${threshold}). The band [threshold, max_threshold] can only be empty.`
        }

        // If type filter given, re-use full scan and filter — detectDuplicateCandidates
        // internally scans all types; we post-filter the pairs if needed
        const typeFilter = args.types
          ? new Set(args.types.split(",").map((t) => t.trim()) as ArtifactType[])
          : null

        const candidates = detectDuplicateCandidates(directory, threshold, maxThreshold)
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

  }
}
