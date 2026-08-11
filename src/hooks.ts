/**
 * HIVE event hooks: session tracking, energy tick, hot-reload, system transform, compaction
 *
 * Debug logging: set HIVE_DEBUG=1 in the environment to enable verbose [HIVE] info logs.
 * Error and warn level logs are always emitted regardless of this flag.
 */

import path from "path"
import fs from "fs"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { snapshotAgentsMtime, snapshotChanged } from "./lib/reload.js"
import { tickEnergy, getCapabilitiesSummary } from "./lib/energy.js"
import { refreshOwnerTitle } from "./lib/board-store.js"
import { recentPreCompactionDreams, type PreCompactionDream } from "./lib/dream-state.js"
import type { NervousSystem } from "./lib/nervous-system.js"

type Client = ReturnType<typeof createOpencodeClient>
type LogFn = (level: "info" | "debug" | "error" | "warn", message: string, extra?: Record<string, unknown>) => void

export interface HooksContext {
  ns: NervousSystem
  client: Client
  directory: string
  projectAgentsPath: string
  capabilitiesPath: string
  rulesDir: string
  log: LogFn
  /** Like log("info", ...) but gated behind HIVE_DEBUG=1. Use for high-frequency diagnostic lines. */
  debugLog: (message: string, extra?: Record<string, unknown>) => void
  getLastSnapshot: () => Record<string, number>
  setLastSnapshot: (snapshot: Record<string, number>) => void
  getActiveSessionId: () => string
  setActiveSessionId: (id: string) => void
}

/** Truncate an intention string for one-line digest display (~80 chars). */
function intentionExcerpt(intention: string): string {
  const flat = intention.replace(/\s+/g, " ").trim()
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat
}

/**
 * Format the post-compaction dream-pointer digest (WI-081). Shared shape for
 * the two layers: the compacting-hook context block and the session.compacted
 * noReply injection both render the same per-dream pointer line.
 */
function dreamPointerLine(d: PreCompactionDream): string {
  const arts = d.artifacts.length > 0 ? d.artifacts.join(", ") : "none"
  return `${d.dreamId} (pre-compaction, artifacts: ${arts}) — ${intentionExcerpt(d.intention)}`
}

export function createEventHook(ctx: HooksContext) {
  return async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const { ns, client, directory, projectAgentsPath, log, debugLog, getLastSnapshot, setLastSnapshot, setActiveSessionId } = ctx

    if (event.type === "session.created") {
      const { results, skipped } = tickEnergy(directory)
      if (!skipped) {
        debugLog("Energy tick applied on session.created", { results })
      }

      const currentSnapshot = await snapshotAgentsMtime(projectAgentsPath)
      if (snapshotChanged(getLastSnapshot(), currentSnapshot)) {
        setLastSnapshot(currentSnapshot)
      }
    }

    if (event.type === "session.status") {
      const props = event.properties as { sessionID: string; status: { type: string } }
      if (props.status.type === "busy") {
        setActiveSessionId(props.sessionID)
        ns.markActive(props.sessionID)
      }
    }

    if (event.type === "session.idle") {
      const props = event.properties as { sessionID: string }
      ns.markIdle(props.sessionID)

      // If this was a capability session, check for pending unrouted messages
      // and wake the coordinator so it can route them. The block shape (and
      // its live-vs-stale bucketing, WI-051 D) is rendered ONCE in
      // ns.formatRoutingNeeded — the two routing sites had already drifted.
      if (ns.isCapabilitySession(props.sessionID)) {
        const capName = ns.resolveAgent(props.sessionID)
        const capGroupID = ns.getGroupID(props.sessionID)
        const block = ns.formatRoutingNeeded(capGroupID)
        if (block) {
          const reason = `Capability ${capName} completed. Pending routing needed:\n${block}`
          ns.wakeCoordinator(reason, props.sessionID).catch((err) => {
            log("error", `[HIVE] wakeCoordinator failed: ${String(err)}`)
          })
        }
      }
    }

    if (event.type === "file.watcher.updated") {
      const props = event.properties as unknown as { path: string }
      await ns.handleFileChange(props.path)
    }

    // Board title tracking: when opencode writes a session's real title (it
    // starts as the "New session - <ISO>" placeholder at creation and is
    // replaced once the model settles a descriptive one), patch the owning WI's
    // frontmatter title IF it's still the placeholder. This is what makes the
    // WI record self-describing (portability invariant, I-144/SNG-046) without a
    // live session read at render time. The refresh is an EXPLICIT locked patch
    // through the shared storage module (I-179/I-180) — it does not assume the
    // placeholder self-heals (W-061/W-079). Best-effort; never throws upward.
    if (event.type === "session.updated") {
      const props = event.properties as { info?: { id?: string; title?: string; parentID?: string } }
      const info = props.info
      if (info?.id && !info.parentID && typeof info.title === "string") {
        try {
          const patchedId = await refreshOwnerTitle(directory, info.id, info.title)
          if (patchedId) {
            debugLog("[board] refreshed WI title from settled session title", {
              itemID: patchedId,
              sessionID: info.id,
              title: info.title,
            })
          }
        } catch (err) {
          log("warn", "[board] title refresh failed", { sessionID: info.id, error: String(err) })
        }
      }
    }

    // Post-compaction dream-pointer digest (WI-081, layer B): compaction has
    // just rewritten early history into a summary — remind the agent that its
    // mid-session dreams survived on disk and how to pull them back.
    if (event.type === "session.compacted") {
      try {
        const props = event.properties as { sessionID?: string }
        const sessionID = props?.sessionID
        if (!sessionID) return
        // Guards mirror system.transform (I-041): only awakened coordinator
        // sessions own board dreams — capability/generic sessions get nothing.
        if (!ns.hasCapabilities() || !ns.isSessionAwake(sessionID)) return
        if (ns.isCapabilitySession(sessionID)) return
        // isCoordinatorSession depends on the chat.message hook having
        // registered the session's agent — but sessions created via `opencode
        // run`/attach may compact BEFORE any chat.message fires in THIS
        // process, leaving them unregistered (isCoordinatorSession → false).
        // An awakened session is coordinator by construction (hive_awaken only
        // auto-registers board items for top-level sessions), so fall back to
        // a parentID lookup only when registration is absent.
        if (!ns.isCoordinatorSession(sessionID)) {
          const res = await client.session.get({ path: { id: sessionID } }).catch(() => undefined)
          const sess = res?.data as { parentID?: string } | undefined
          if (sess?.parentID) return // a child session — not a coordinator
          // top-level (or lookup failed-open) + awake → coordinator
        }

        const dreams = recentPreCompactionDreams(directory, 5)
        if (dreams.length === 0) return

        const lines = [
          `[HIVE] Compaction just rewrote early history. Your mid-session dream(s) survived on disk:`,
          ...dreams.map((d) => `- ${dreamPointerLine(d)}`),
          `Pull content with hive_dream_query(ids:"DRM-NNN-linked artifact ids") or hive_dream_rank as needed.`,
          `A final unflagged dream still closes your board item.`,
        ]
        await ns.injectNotice(sessionID, lines.join("\n"))
        debugLog("[dreams] injected post-compaction pointer digest", { sessionID, dreams: dreams.map((d) => d.dreamId) })
      } catch (err) {
        // Best-effort: a failed injection must never break the event hook.
        log("warn", "[dreams] post-compaction digest injection failed", { error: String(err) })
      }
    }
  }
}

export function createSystemTransformHook(ctx: HooksContext) {
  // Cache rule file contents (they don't change during a session)
  let delegationContent: string | null = null
  let hivemindCapContent: string | null = null
  let coordinatorDreamsContent: string | null = null

  return async (input: { sessionID?: string; model?: unknown }, output: { system: string[] }) => {
    const { ns, log, debugLog, rulesDir } = ctx

    if (!input.sessionID) return

    // Check if HIVE is awake for this session — log BEFORE the guard (W-017) so gate
    // failures are visible when HIVE_DEBUG=1.
    const isAwake = ns.hasCapabilities() && ns.isSessionAwake(input.sessionID)
    const isCap = ns.isCapabilitySession(input.sessionID)
    const isCoordinator = ns.isCoordinatorSession(input.sessionID)
    debugLog(`[HIVE] system.transform fired — sessionID: ${input.sessionID}, isCapability: ${isCap}, isCoordinator: ${isCoordinator}, isAwake: ${isAwake}`)
    if (!isAwake) return

    // Only inject HIVE context for coordinator and capability sessions
    if (!isCap && !isCoordinator) return

    // For a coordinator, its own sessionID is its dispatch groupID — scope the
    // roster's [resumable] annotations to sessions this coordinator owns (I-032).
    // Capability sessions don't dispatch, so they get an unannotated roster.
    const rosterGroupID = isCoordinator ? ns.getGroupID(input.sessionID) || input.sessionID : undefined
    output.system.push(ns.buildRoster(rosterGroupID))

    if (isCap) {
      // Capability: inject hivemind messaging rules + pending messages
      if (hivemindCapContent === null) {
        try {
          hivemindCapContent = fs.readFileSync(path.join(rulesDir, "hivemind-capabilities.md"), "utf8")
        } catch {
          hivemindCapContent = ""
        }
      }
      if (hivemindCapContent) output.system.push(hivemindCapContent)

      const capName = ns.resolveAgent(input.sessionID)
      const sessionGroupID = ns.getGroupID(input.sessionID)
      const formatted = ns.formatMessages(capName, sessionGroupID)
      if (formatted) {
        output.system.push(formatted)
        debugLog(`[HIVE] system.transform injected messages for ${capName}`)
      }
    } else if (isCoordinator) {
      // Coordinator: inject delegation rules + dream hygiene guidance +
      // _coordinator messages + queue status
      if (delegationContent === null) {
        try {
          delegationContent = fs.readFileSync(path.join(rulesDir, "delegation.md"), "utf8")
        } catch {
          delegationContent = ""
        }
      }
      if (delegationContent) output.system.push(delegationContent)

      // Dream hygiene (WI-080): residue rhythm, dream-before-compaction, and
      // the pre_compaction lifecycle flag. Ships WITH the plugin as a rules/
      // asset (PACKAGE_ROOT via the same rulesDir mechanism as delegation.md)
      // instead of workspace-local `config.instructions` files, which every
      // workspace had to author by hand and which drifted (W-008). Injected
      // here — the coordinator-only branch of system.transform (I-023/I-036) —
      // so it can never leak into capability or generic subagent prompts
      // (three-category injection rule, I-041).
      if (coordinatorDreamsContent === null) {
        try {
          coordinatorDreamsContent = fs.readFileSync(path.join(rulesDir, "coordinator-dreams.md"), "utf8")
        } catch {
          coordinatorDreamsContent = ""
        }
      }
      if (coordinatorDreamsContent) output.system.push(coordinatorDreamsContent)

      const coordGroupID = ns.getGroupID(input.sessionID)
      const coordMessages = ns.formatMessages("_coordinator", coordGroupID)
      if (coordMessages) output.system.push(coordMessages)

      const queueStatus = ns.buildQueueStatus(coordGroupID)
      if (queueStatus) output.system.push(queueStatus)
    }
    // else: non-HIVE subagent (general, explore, dreamcatcher) — nothing injected
  }
}

export function createChatMessageHook(ctx: HooksContext) {
  return async (input: { sessionID?: string; agent?: string }, _output: unknown) => {
    const { ns } = ctx
    if (input.sessionID && input.agent) {
      ns.registerSession(input.sessionID, input.agent)
    }
  }
}

export function createCompactionHook(ctx: HooksContext) {
  return async (input: { sessionID?: string }, output: { context: string[] }) => {
    const { directory, capabilitiesPath, debugLog } = ctx

    const { results, skipped } = tickEnergy(directory)
    if (!skipped) {
      debugLog("Energy tick applied on compaction", { results })
    }

    const summary = getCapabilitiesSummary(capabilitiesPath)
    if (summary) {
      output.context.push(
        `## HIVE State (preserved across compaction)\n\n${summary}\n\nUse /status to see full details. Capabilities with low energy may need attention.`
      )
    }

    // Dream pointers (WI-081, layer A): the summarizer must not drop the ids of
    // this session's mid-session (pre-compaction) dreams — after compaction
    // they are the only way back to the consolidated artifacts.
    try {
      const dreams = recentPreCompactionDreams(directory, 5)
      if (dreams.length > 0) {
        const lines = [
          `## HIVE dream pointers (preserve in summary)`,
          ``,
          ...dreams.map((d) => `- ${dreamPointerLine(d)}`),
          ``,
          `Re-query content with hive_dream_query(ids:"<artifact ids>") or hive_dream_rank after compaction.`,
        ]
        output.context.push(lines.join("\n"))
        debugLog("[dreams] added pointer block to compaction context", { sessionID: input.sessionID, dreams: dreams.map((d) => d.dreamId) })
      }
    } catch {
      // Best-effort: a scan failure must never block compaction.
    }
  }
}

export function createToolDefinitionHook(ctx: HooksContext) {
  return async (input: { toolID: string }, output: { description: string; parameters: any }) => {
    if (input.toolID !== "task") return

    const { ns, debugLog } = ctx
    if (!ns.hasCapabilities() || !ns.isHiveActive()) return
    debugLog(`[HIVE] tool.definition hook fired for: ${input.toolID}`)
    const roster = ns.buildRoster()

    output.description += `\n\n## HIVE Capability Dispatch\n\nWhen dispatching to a capability (subagent_type starting with "capabilities/"), **default to passing \`background: true\`**. This tool defaults to foreground — omitting the flag runs the dispatch *blocking*; you must explicitly set \`background: true\` to get async execution. Capability work takes minutes; blocking freezes the session so you cannot talk to the user, route messages, or dispatch other capabilities while you wait. So pass \`background: true\`, tell the user it's running, and act on the auto-notification when it completes. Reserve blocking (omitting \`background\`) for fast read-only lookups (dreamcatcher Recall, explore) where the next step is fully gated on a result that returns in seconds.\n\nIf a capability in the roster shows \`[resumable: task_id=...]\`, you MAY pass that value as the \`task_id\` argument to continue its existing session (preserving its accumulated context and pending HIVEmind messages) instead of spawning a fresh one. Prefer resumption when the new work is a direct continuation of what that capability was doing; prefer a fresh dispatch for unrelated work to avoid context bloat. The resumable annotation only appears for idle capabilities you previously dispatched in this session.\n\n${roster}\n\nThe prompt you provide will be automatically enriched with the capability roster, pending HIVEmind messages, and relevant context. You do NOT need to manually inject these — just provide the task-specific instructions.`
  }
}

export function createToolExecuteAfterHook(ctx: HooksContext) {
  return async (input: { tool: string; sessionID: string; callID: string; args?: any }, output: { title: string; output: string; metadata: any }) => {
    const { ns, directory, debugLog, getActiveSessionId } = ctx

    if (input.tool !== "task") return

    const agentType = input?.args?.subagent_type || ""
    if (!agentType.startsWith("capabilities/")) return

    const capName = agentType.replace("capabilities/", "")
    const { markCapabilityUsed } = await import("./lib/energy.js")
    markCapabilityUsed(directory, capName, getActiveSessionId())
    debugLog(`[HIVE] Capability task completed: ${capName}`)

    // Check for pending messages that need routing (scoped to caller's group).
    // Same shared renderer as the session.idle site — one shape, no drift.
    const callerGroupID = ns.getGroupID(input.sessionID)
    const block = ns.formatRoutingNeeded(callerGroupID)
    if (block) {
      output.output += `\n\n## HIVEmind — Routing Needed\n\n${block}`
    }
  }
}
