/**
 * @hive/dsh-helm — HELM orchestration tools (DSH 0.2.2-rc.2)
 *
 * Six helm_* tools for orchestrating the HELM hierarchy:
 *   helm_dispatch  — start role-preset children (Helmsman→Bosun→Hands)
 *   helm_status    — tracked children and whether each has finished
 *   helm_prompt    — steer a child (running → next step; idle/cold → new turn)
 *   helm_collect   — await the child's result and return it
 *   helm_resume    — send new instructions to a parked/cold child
 *   helm_cancel    — stop a child
 *
 * Role presets (design /workspace/scratch/naming/role-presets-design.md §5):
 * every dispatch resolves a preset target — per-entry `role` beat over batch
 * `defaultPreset`, beat over `workerDefault`→hands, beat over the caller's
 * default (helmsman→bosun, bosun→hands, legacy→bosun). The resolved id rides
 * `agentPreset` on every start spec, so children compose independently from
 * the parent; the retired `helm-coordinator` staging id is accepted as an
 * input alias for `bosun` for one release (see src/roles.ts). Callers may
 * only target their own hierarchy step (helmsman→bosun, bosun→hands, hands→
 * none), registry-validated before the first child starts, and only the
 * owning session may steer/collect/cancel a tracked child.
 *
 * Seam: `ctx.subagents` (SubagentRuntime, provided by @deepseek-ai/dsh-subagent
 * which the dsh-base bundle composes; backend provider "spawn" from
 * dsh-subagent-spawn-in-process). Children are continuable (durable session
 * ids, steer via sendMessage, cold resume under the tree root).
 *
 * Model routing: each child's LLM route rides `agentOptions`
 * {provider, model, reasoningEffort} — the per-child override the runtime
 * merges over the parent's options. Static defaults here; the Berget System
 * One decision API (scratch/helm-spike/decision-router.ts) can drive it once
 * wired — the routing decision just becomes the agentOptions values.
 *
 * NOTE (spike scope): the activation registry is per-plugin-instance memory.
 * A host restart clears it, and a child's activation handle is required for
 * collect/cancel — children dispatched before a restart are no longer
 * trackable here (their sessions persist; a future version can reattach by
 * session id; the owner/preset metadata below is shaped so the W-097
 * persistence replay can adopt the same fields without a format break).
 */

import { defineTool } from "@deepseek-ai/dsh-tools"
import type { ContentBlock } from "@deepseek-ai/dsh-llm"
import type { SubagentRuntime, SubagentActivation } from "@deepseek-ai/dsh-subagent"
import { resolveDispatchTarget, defaultRouteClassFor } from "./roles.js"

declare module "@deepseek-ai/cordis" {
  interface Context {
    tools: import("@deepseek-ai/dsh-tools").ToolRuntime
    subagents: SubagentRuntime
  }
}

type HelmCtx = import("@deepseek-ai/cordis").Context & {
  subagents: SubagentRuntime
}

const TEXT_OUT = {
  schema: { type: "string" },
  render: (_args: unknown, value: string): ContentBlock[] => [{ type: "text", text: value }],
} as const

const reqStr = (description: string) => ({ type: "string", required: true, description } as const)
const str = (description: string) => ({ type: "string", description } as const)
const bool = (description: string) => ({ type: "boolean", description } as const)
const num = (description: string) => ({ type: "number", description } as const)

// ── Model routing (static defaults; decision API can override later) ─────────

interface ModelRoute {
  provider: string
  model: string
  reasoningEffort?: string
}

const DEFAULT_COORDINATOR_ROUTE: ModelRoute = {
  provider: "berget",
  model: "zai-org/GLM-5.3-Flash",
  reasoningEffort: "medium",
}

const DEFAULT_WORKER_ROUTE: ModelRoute = {
  provider: "berget",
  model: "zai-org/GLM-5.3-Flash",
  reasoningEffort: "low",
}

const BACKEND_PROVIDER = "spawn" // dsh-subagent-spawn-in-process default providerName

/** Dispatch-time model override → AgentOptions for the child. */
function routeToAgentOptions(route: ModelRoute | undefined): Record<string, unknown> | undefined {
  if (!route) return undefined
  return {
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}),
  }
}

// ── apply ────────────────────────────────────────────────────────────────────

export function apply(ctx: HelmCtx) {
  const log = (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) =>
    ctx.logger?.[level]?.(msg, extra)

  /**
   * Per-instance activation registry: childId → live handle.
   * `state` is maintained by .then() handlers on the result promise —
   * a synchronous, always-correct settled flag with no race.
   *
   * `ownerSessionId` (the dispatching agent's session id) and `preset` (the
   * resolved role preset id) ride beside the activation: all steering/
   * collect/cancel operations are owner-checked (§5.2) and the fields are the
   * shape the future W-097 persistence replay will adopt, not a new format.
   */
  const registry = new Map<
    string,
    {
      activation: SubagentActivation
      label: string
      dispatchedAt: string
      ownerSessionId: string
      preset: string
      state: { settled: boolean; result?: Awaited<SubagentActivation["result"]> }
    }
  >()

  function summarize(childId: string): Record<string, unknown> | undefined {
    const entry = registry.get(childId)
    if (!entry) return undefined
    return {
      childId,
      name: entry.activation.name,
      label: entry.label,
      preset: entry.preset,
      dispatchedAt: entry.dispatchedAt,
      finished: entry.state.settled,
    }
  }

  /** §5.2 ownership: only the dispatching session may inspect/steer/collect/cancel. */
  function ownerRefusal(childId: string, caller: { id: string } | undefined): string | undefined {
    const entry = registry.get(childId)
    if (!entry) return `No tracked coordinator with childId ${childId} owned by this session.`
    if (caller === undefined || caller.id !== entry.ownerSessionId) {
      return `Refused: childId ${childId} belongs to another caller's session — steering, collecting, and cancelling are owner-only.`
    }
    return undefined
  }

  function text(content: readonly ContentBlock[]): string {
    return content
      .map((b) => (b.type === "text" ? b.text : `[${b.type} block]`))
      .join("\n")
  }

  const registrations = [
    // ── helm_dispatch ───────────────────────────────────────────────────────
    defineTool({
      name: "helm_dispatch",
      description:
        "Start one or more resident role-preset children for your request (Helmsman dispatches Bosuns, a Bosun dispatches Hands). " +
        "Returns immediately with each child's durable session id (childId), target preset, and model route. " +
        "Children keep working in the background; their completion notice arrives as a message. " +
        "Steer with helm_prompt, collect with helm_collect, stop with helm_cancel. " +
        "Model routing: give each coordinator an explicit model override, or omit for the role's default route.",
      parameters: {
        intent: reqStr("The user's intent this dispatch serves (for the coordination log)"),
        coordinators: str(
          "Optional. JSON array of coordinators to start: " +
            '[{"title":"...","taskBrief":"...","model":"provider/model-name","reasoningEffort":"low|medium|high","name":"a-z0-9- up to 32","role":"bosun|hands|registered-preset-id"}]. ' +
            "role is the exact preset id (alias helm-coordinator→bosun accepted for one release). " +
            "Omit for a single coordinator carrying the whole intent.",
        ),
        defaultPreset: str(
          "Optional. Batch default preset id for entries without an explicit role (normalized: alias helm-coordinator→bosun). " +
            "Precedence per entry: role ?? defaultPreset ?? workerDefault→hands ?? the caller's role default (helmsman→bosun, bosun→hands, other→bosun). " +
            "A Helmsman may target only bosun; a Bosun only hands; Hands has no dispatch surface; helmsman is never a dispatch target.",
        ),
        workerDefault: bool(
          "Use the cheaper worker route instead of the coordinator route (default false). " +
            "Also selects the hands preset when no role/defaultPreset targets one — which a Helmsman caller rejects (Hands is not a permitted direct target).",
        ),
      },
      output: TEXT_OUT,
      async execute(args, exec) {
        const parent = exec.agent
        if (!parent) {
          return "Error: no parent agent in execution context — helm_dispatch must run inside an agent session."
        }

        // §5.2 step 3 / §4.5: role dispatch needs the agent-preset registry.
        // Absent (e.g. headless) is a fail-closed composition error BEFORE any
        // child starts — never a silent inheritance of the caller's tools.
        const presets = ctx.get("agentPresets")
        if (!presets) {
          return "Error: agent-presets service unavailable; role dispatch unsupported in this composition. " +
            "helm_dispatch dispatches role presets and cannot silently inherit the caller's composition."
        }
        const callerPreset = presets.composedPreset(parent.ctx)

        const intent = String(args.intent)
        const argDefaultPreset = typeof args.defaultPreset === "string" ? args.defaultPreset : undefined
        const workerDefault = args.workerDefault === true

        interface CoordinatorSpec {
          title?: string
          taskBrief: string
          model?: string
          reasoningEffort?: string
          name?: string
          role?: string
        }

        let specs: CoordinatorSpec[] = [{ taskBrief: intent }]
        if (typeof args.coordinators === "string" && args.coordinators.trim() !== "") {
          try {
            const parsed: unknown = JSON.parse(args.coordinators)
            if (!Array.isArray(parsed) || parsed.length === 0) {
              return "Error: coordinators must be a non-empty JSON array."
            }
            const bad = parsed.findIndex(
              (s) => typeof (s as CoordinatorSpec).taskBrief !== "string" || (s as CoordinatorSpec).taskBrief === "",
            )
            if (bad >= 0) {
              return `Error: coordinators[${bad}] is missing a non-empty string "taskBrief".`
            }
            specs = parsed as CoordinatorSpec[]
            const badRole = specs.findIndex(
              (s) => s.role !== undefined && (typeof s.role !== "string" || s.role.trim() === ""),
            )
            if (badRole >= 0) {
              return `Error: coordinators[${badRole}] has an invalid "role" — when present it must be a non-empty preset id string.`
            }
          } catch {
            return "Error: coordinators is not valid JSON — pass a JSON array string."
          }
        }

        // §5.2 preflight (1–2): resolve every entry's target and apply the
        // caller-target policy BEFORE starting anything — no partial fan-out
        // from a later invalid role.
        const targets: Array<{ target: string; source: string }> = []
        for (let i = 0; i < specs.length; i++) {
          const resolution = resolveDispatchTarget({
            callerPreset,
            entryRole: specs[i].role,
            defaultPreset: argDefaultPreset,
            workerDefault,
          })
          if (!resolution.ok) {
            return `Error: coordinators[${i}]: dispatch target refused — ${resolution.problem} (nothing was started).`
          }
          targets.push({ target: resolution.target, source: resolution.source })
        }

        // §5.2 preflight (4): registry-resolve every distinct target; unknown
        // or broken definitions abort the batch before the first start.
        for (const target of [...new Set(targets.map((t) => t.target))]) {
          try {
            await presets.resolve(target)
          } catch (err) {
            return `Error: dispatch target preset "${target}" failed registry preflight: ${String(err)} — batch aborted before any child started.`
          }
        }

        const results: Array<Record<string, unknown>> = []
        for (const [i, spec] of specs.entries()) {
          const target = targets[i].target
          try {
            // Route: derive from the resolved TARGET only (§5.1) — hands
            // defaults to the worker route, every other target to the
            // coordinator route. workerDefault's cheap route is retained
            // through its hands target selection; an explicit per-child
            // model/reasoningEffort still wins below.
            let childRoute: Record<string, unknown> | undefined = routeToAgentOptions(
              defaultRouteClassFor(target) === "worker" ? DEFAULT_WORKER_ROUTE : DEFAULT_COORDINATOR_ROUTE,
            )
            if (spec.model) {
              const [provider, ...rest] = spec.model.split("/")
              childRoute = {
                provider,
                model: rest.join("/"),
                ...(spec.reasoningEffort ? { reasoningEffort: spec.reasoningEffort } : {}),
              }
            } else if (spec.reasoningEffort && childRoute) {
              childRoute = { ...childRoute, reasoningEffort: spec.reasoningEffort }
            }

            const label = spec.title ?? `helm: ${intent.slice(0, 60)}`
            // §5.2: agentPreset is mandatory for role dispatch — the child
            // composes the target preset independently of the parent.
            const activation = await ctx.subagents.startActivation({
              provider: BACKEND_PROVIDER,
              label,
              ...(spec.name ? { name: spec.name } : {}),
              ...(childRoute ? { agentOptions: childRoute as never } : {}),
              agentPreset: target,
              prompt: [{ type: "text", text: spec.taskBrief }],
              parent,
              signal: exec.signal,
              delivery: "parent",
            })
            const state: { settled: boolean } = { settled: false }
            void activation.result.then(
              (r) => { state.settled = true; void r },
              () => { state.settled = true },
            )
            registry.set(activation.childId, {
              activation,
              label,
              dispatchedAt: new Date().toISOString(),
              ownerSessionId: parent.id,
              preset: target,
              state,
            })
            results.push({ childId: activation.childId, name: activation.name, label, preset: target, model: childRoute })
            log("info", "[helm_dispatch] role child started", {
              childId: activation.childId,
              label,
              preset: target,
              callerPreset: callerPreset ?? "(none)",
            })
          } catch (err) {
            results.push({ error: String(err), label: spec.title ?? "(unlabeled)" })
          }
        }

        const lines = [
          `Dispatched ${results.filter((r) => !r.error).length}/${specs.length} role child(ren) for: "${args.intent}"`,
          "",
          ...results.map((r) =>
            r.error
              ? `- FAILED (${r.label}): ${r.error}`
              : `- ${r.name ?? "?"} — childId ${r.childId} · preset ${r.preset}${r.model ? ` · route ${JSON.stringify(r.model)}` : ""} · "${r.label}"`,
          ),
          "",
          "Steer with helm_prompt(childId, text); check with helm_status; collect with helm_collect(childId).",
        ]
        return lines.join("\n")
      },
    }),

    // ── helm_status ─────────────────────────────────────────────────────────
    defineTool({
      name: "helm_status",
      description:
        "List your tracked coordinators and whether each has finished. Lightweight: doesn't read child transcripts. " +
        "Pass childId for one coordinator; omit for all. Lists only the calling session's own children.",
      parameters: {
        childId: str("Optional: one coordinator's childId. Omit to list all."),
      },
      output: TEXT_OUT,
      async execute(args, exec) {
        if (args.childId) {
          const refusal = ownerRefusal(String(args.childId), exec.agent)
          if (refusal) return refusal
          const s = summarize(String(args.childId))
          if (!s) return `No tracked coordinator with childId ${args.childId}. (Registry is per-plugin-instance; a host restart clears it.)`
          return JSON.stringify(s, null, 2)
        }
        const callerId = exec.agent?.id
        const owned = [...registry.entries()].filter(([, entry]) => callerId !== undefined && entry.ownerSessionId === callerId)
        if (owned.length === 0) return "No coordinators tracked for this session."
        const rows = owned.map(([id]) => summarize(id))
        const done = rows.filter((r) => r?.finished).length
        return `Coordinators: ${rows.length} tracked, ${done} finished.\n\n` +
          rows.map((r) => `- ${r?.name} · ${r?.childId} · preset ${r?.preset} · ${r?.finished ? "finished" : "running"} · "${r?.label}"`).join("\n")
      },
    }),

    // ── helm_prompt ─────────────────────────────────────────────────────────
    defineTool({
      name: "helm_prompt",
      description:
        "Steer a coordinator with one message. A running coordinator receives it at its next step; " +
        "an idle one starts a turn; a cold one resumes from disk. Direct children only.",
      parameters: {
        childId: reqStr("Target coordinator's childId"),
        text: reqStr("Message to deliver"),
      },
      output: TEXT_OUT,
      async execute(args, exec) {
        const parent = exec.agent
        if (!parent) return "Error: no parent agent in execution context."
        const refusal = ownerRefusal(String(args.childId), parent)
        if (refusal) return refusal
        try {
          const messageId = await ctx.subagents.sendMessage(
            parent,
            String(args.childId) as never,
            [{ type: "text", text: args.text }],
            { signal: exec.signal },
          )
          return `Delivered to ${args.childId} (inbox message ${messageId}).`
        } catch (err) {
          return `Send failed for ${args.childId}: ${String(err)}`
        }
      },
    }),

    // ── helm_collect ────────────────────────────────────────────────────────
    defineTool({
      name: "helm_collect",
      description:
        "Collect a coordinator's result. With wait=false (default): returns its current state without blocking. " +
        "With wait=true: blocks until the run completes (or the tool is cancelled), then returns the final output.",
      parameters: {
        childId: reqStr("Coordinator's childId"),
        wait: bool("Block until the coordinator completes (default false)"),
      },
      output: TEXT_OUT,
      async execute(args, exec) {
        const refusal = ownerRefusal(String(args.childId), exec.agent)
        if (refusal) return refusal
        const entry = registry.get(String(args.childId))
        if (!entry) return `No tracked coordinator with childId ${args.childId}.`
        if (!args.wait) {
          if (!entry.state.settled) {
            return JSON.stringify({ childId: args.childId, finished: false, note: "still running — helm_collect with wait=true to block" }, null, 2)
          }
        }
        try {
          const result = await entry.activation.result
          const out = text(result.output)
          const body = [
            `childId ${args.childId} — stopReason: ${result.stopReason}`,
            result.diagnostic ? `diagnostic: ${result.diagnostic}` : "",
            "",
            out || "(no output)",
          ].filter(Boolean)
          return body.join("\n").slice(0, 16000)
        } catch (err) {
          return `Collect failed for ${args.childId}: ${String(err)}`
        }
      },
    }),

    // ── helm_resume ─────────────────────────────────────────────────────────
    defineTool({
      name: "helm_resume",
      description:
        "Send new instructions to a parked or finished coordinator. This is a steering message — the coordinator " +
        "keeps its full context; it does not re-run its original brief.",
      parameters: {
        childId: reqStr("Coordinator's childId"),
        instructions: reqStr("New instructions or context to resume with"),
      },
      output: TEXT_OUT,
      async execute(args, exec) {
        const parent = exec.agent
        if (!parent) return "Error: no parent agent in execution context."
        const refusal = ownerRefusal(String(args.childId), parent)
        if (refusal) return refusal
        try {
          const messageId = await ctx.subagents.sendMessage(
            parent,
            String(args.childId) as never,
            [{ type: "text", text: args.instructions }],
            { signal: exec.signal },
          )
          return `Resume instructions delivered to ${args.childId} (inbox message ${messageId}).`
        } catch (err) {
          return `Resume failed for ${args.childId}: ${String(err)}`
        }
      },
    }),

    // ── helm_cancel ─────────────────────────────────────────────────────────
    defineTool({
      name: "helm_cancel",
      description:
        "Stop a coordinator's current run and release its activation. The child's session persists on disk, " +
        "but this plugin instance can no longer steer or collect it.",
      parameters: {
        childId: reqStr("Coordinator's childId"),
      },
      output: TEXT_OUT,
      async execute(args, exec) {
        const refusal = ownerRefusal(String(args.childId), exec.agent)
        if (refusal) return refusal
        const entry = registry.get(String(args.childId))
        if (!entry) return `No tracked coordinator with childId ${args.childId}.`
        try {
          await entry.activation.dispose()
          registry.delete(String(args.childId))
          return `Cancelled ${args.childId} and released its handle.`
        } catch (err) {
          return `Cancel failed for ${args.childId}: ${String(err)}`
        }
      },
    }),
  ]

  const disposers = registrations.map((def) => ctx.tools.register(def))
  return () => {
    for (const d of disposers) d()
    // Release every live activation this instance owns.
    for (const [, entry] of registry) {
      void entry.activation.dispose().catch(() => {})
    }
    registry.clear()
  }
}

// The dsh loader applies the DEFAULT export only; inject rides on the function.
;(apply as unknown as Record<string, unknown>).inject = ["tools", "subagents"]
export default apply
