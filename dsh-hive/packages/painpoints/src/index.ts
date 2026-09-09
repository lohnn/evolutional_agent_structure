/**
 * @hive/dsh-painpoints — pain-point journal service + 3 tools.
 *
 * `ctx.painpoints` exposes the journal IO (verbatim port of the OpenCode
 * plugin's `src/lib/painpoint-journal.ts` — only imports change); the three
 * `hive_*painpoint*` tools are registered via defineTool() (auto arg
 * validation — the direct analogue of OpenCode's `tool()`).
 *
 * Pain points are HARNESS/WORKFLOW friction, problem-only (no solution field
 * by design), kept strictly separate from dream residue.
 */

import { Service } from "@deepseek-ai/cordis"
import z from "@deepseek-ai/schemastery"
import { defineTool } from "@deepseek-ai/dsh-tools"
import {
  appendPainpoint,
  listPainpoints,
  formatPainpointsForReview,
  harvestPainpoints,
  formatPainpointsForHarvest,
  type PainpointFile,
} from "./lib/painpoint-journal.js"

declare module "@deepseek-ai/cordis" {
  interface Context {
    painpoints: Painpoints
    tools: import("@deepseek-ai/dsh-tools").ToolRuntime
  }
}

/** Resolve the worker identity + session id from a tool execution context. */
function resolveCaller(exec: { agent?: unknown }): { worker: string; sessionID: string } {
  const agent = exec.agent as { session?: { id?: string }; id?: string } | undefined
  const sessionID = agent?.session?.id ?? agent?.id ?? "unknown-session"
  // Under dsh there is no capability roster yet (Phase 3); the worker name is
  // the agent/preset id when available, else the session id.
  const worker = agent?.id ?? sessionID
  return { worker, sessionID }
}

import type { ContentBlock } from "@deepseek-ai/dsh-llm"

const TEXT_OUT = {
  schema: { type: "string" },
  render: (_args: unknown, value: string): ContentBlock[] => [{ type: "text", text: value }],
} as const

export class Painpoints extends Service {
  // The dsh loader applies the DEFAULT export only and ignores its named
  // siblings — inject must live on the class itself (cordis reads static
  // `inject` from the plugin constructor).
  static inject = ["tools"]
  static Config = z.object({
    // Workspace root (the dir containing `.opencode/`). Default: process cwd.
    directory: z.string().default(process.cwd()),
  })

  readonly directory: string

  constructor(ctx: import("@deepseek-ai/cordis").Context, config: { directory: string }) {
    super(ctx, "painpoints")
    this.directory = config.directory

    ctx.effect(() => {
      const d1 = ctx.tools.register(defineTool({
        name: "hive_note_painpoint",
        description:
          "Jot down a HARNESS or WORKFLOW pain point the moment you hit it — a friction in the tools, environment, or process (NOT a bug in the code you're building). " +
          "Capture the problem and the context needed to understand it later: what you were doing, what was slow or painful, what information you needed and couldn't easily get, and where (file paths, commands, cycle counts, retries). " +
          "CRITICAL DISCIPLINE — capture the PROBLEM ONLY. Do NOT propose, hint at, or record a solution: there is no solution field on purpose. Fixes come later, with fresh eyes; a premature fix jotted mid-frustration usually anchors on the wrong cause. " +
          "This is a stricter sibling of hive_dream_residue, kept in a separate log. Use hive_dream_residue for general cross-session learnings; use THIS only for concrete harness/workflow friction worth fixing. " +
          "The tool resolves your identity automatically; you do NOT pass your own name.",
        parameters: {
          problem: {
            type: "string", required: true,
            description: "The pain point itself — what was frustrating, slow, or missing. State the problem, not a fix.",
          },
          context: {
            type: "string", required: true,
            description: "Everything needed to understand the problem later: what you were doing, what was painful, what info you needed, and where (file paths, commands, cycle/retry counts). Do NOT include a proposed solution.",
          },
        },
        output: TEXT_OUT,
        execute: async (args, exec) => {
          const { worker, sessionID } = resolveCaller(exec)
          this.append(worker, sessionID, args.problem, args.context)
          return `Pain point captured (problem-only, no fix — as intended). Logged for \`${worker}\` in this session's pain-point log. Review anytime with hive_painpoints_list.`
        },
      }))

      const d2 = ctx.tools.register(defineTool({
        name: "hive_painpoints_list",
        description:
          "List all currently-open HARNESS/WORKFLOW pain points across sessions (captured via hive_note_painpoint). " +
          "Read-only review: reads the raw pain-point logs and returns each open problem with its context, so the user — or a fresh-eyes pass looking to propose fixes — can review them anytime. " +
          "These are deliberately problems-only (no solutions attached). Use this before a workflow-improvement pass, or when the user asks 'what's been annoying us lately'.",
        parameters: {},
        output: TEXT_OUT,
        execute: async () => formatPainpointsForReview(this.list()),
      }))

      const d3 = ctx.tools.register(defineTool({
        name: "hive_painpoints_harvest",
        description:
          "Harvest all open HARNESS/WORKFLOW pain points for the dreamtime consolidation workflow, then archive them so the next session starts clean. " +
          "Analogous to hive_dream_harvest but SEPARATE: pain points are harness-fix CANDIDATES, not dream feedstock — do NOT compress them into insights/warnings/songlines/shadows. Surface them to the user (or a fresh-eyes pass) as concrete workflow problems to fix. " +
          "By default the logs are atomically archived after reading (peek=true reads without clearing). " +
          "Call this during the dreamtime harvest step, alongside hive_dream_harvest. If you only want to review without clearing, use hive_painpoints_list instead.",
        parameters: {
          peek: {
            type: "boolean",
            description: "If true, read pain points without archiving them (non-destructive peek). Default false — harvest and archive.",
          },
        },
        output: TEXT_OUT,
        execute: async (args) => formatPainpointsForHarvest(this.harvest(!args.peek)),
      }))

      return () => { d1(); d2(); d3() }
    }, "painpoints.tools()")
  }

  append = (worker: string, sessionID: string, problem: string, context: string) =>
    appendPainpoint(this.directory, worker, sessionID, problem, context)
  list = (): PainpointFile[] => listPainpoints(this.directory)
  harvest = (clear?: boolean): PainpointFile[] => harvestPainpoints(this.directory, clear)
}

export default Painpoints
export const name = "painpoints"
