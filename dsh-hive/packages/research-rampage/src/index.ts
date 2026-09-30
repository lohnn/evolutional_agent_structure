/**
 * dsh-research-rampage — the /research-rampage command.
 *
 * A coordinator-run, multi-subagent DEEP-research protocol:
 *   Phase 0  interrogate the user (requirements freeze via ask_user_question)
 *   Phase 1  blueprint the research tracks
 *   Phase 2  rampage — parallel subagent waves (tracks, then verify & fill)
 *   Phase 3  land the artifacts (report.md + optional interactive site.html)
 *   Phase 4  validation loop — fresh auditor subagent breaks or passes the
 *            report (every load-bearing link must HOLD its claim); FAILED
 *            audits dispatch fixer subagents and re-audit, ≤3 rounds
 *   Phase 5  deliver the TL;DR in chat
 *
 * The full protocol lives in `assets/brief.md` (see src/assets.ts). The command
 * itself carries NO service state and NO config: it is a PROMPT INJECTION — the
 * same shape the HIVE lifecycle commands (@hive/dsh-evolution) use, where a dsh
 * slash command runs against the agent WITHOUT creating a model message, so the
 * handler's only job is to hand the receiving agent the rampage brief as a
 * user-role followup. Everything after that turn is the model executing the
 * brief with the session's ordinary tools (ask_user_question, subagent,
 * workflow, web_search/web_fetch, file tools).
 */

import { Service } from "@deepseek-ai/cordis"
import { createMessage } from "@deepseek-ai/dsh-llm"

// Re-exported so the drift-guard tests (and any future consumer walking the
// package entry) reach the protocol text through the root export.
export { loadRampageBrief } from "./assets.js"
import { loadRampageBrief } from "./assets.js"

// Context.commands must be visible to THIS standalone typecheck: the ported
// packages each re-declare the identical member (interface merging with an
// identical member type is legal — the same augmentation @hive/dsh-evolution
// carries), and the composed profile's copy provably merges with it.
declare module "@deepseek-ai/cordis" {
  interface Context {
    commands: import("@deepseek-ai/dsh-commands").CommandRuntime
  }
}

export class ResearchRampage extends Service {
  // The dsh loader applies the DEFAULT export only and ignores its named
  // siblings — inject must live on the class itself (cordis reads static
  // `inject` from the plugin constructor; the same note @hive/dsh-painpoints
  // carries). Only the command registry is needed: a pure command producer.
  static inject = ["commands"]

  constructor(ctx: import("@deepseek-ai/cordis").Context) {
    super(ctx, "research-rampage")
    ctx.effect(() => {
      const cmd = ctx.commands.register({
        name: "research-rampage",
        description:
          "Deep-research via a coordinated subagent fleet: an interview phase locks the brief, " +
          "parallel subagent waves rampage across research tracks (then verify them), the run " +
          "lands as a markdown report and/or a self-contained interactive local website, and " +
          "the coordinator closes with a TL;DR in chat.",
        input: { hint: "<research goal> — optional; the interview (Phase 0) fills in the rest" },
        handler: (inv) => {
          const agent = inv.agent
          if (!agent) {
            return {
              kind: "error" as const,
              text:
                "/research-rampage needs a live receiving agent (invoke it from a session composer, not a bare CLI).",
            }
          }
          const raw = (inv.rawInput ?? "").trim()
          // Read the kit PER LAUNCH: the workspace tree is live-serve
          // material, so an edit to assets/brief.md must reach the very next
          // rampage without a host restart.
          const brief = loadRampageBrief()
          agent.followup(
            createMessage({
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    `[RESEARCH RAMPAGE] The user just launched a deep-research rampage.\n\n` +
                    `${brief}\n\n` +
                    (raw
                      ? `The user's opening line for this rampage (carry every answer it already gives into Phase 0 — never re-ask it):\n\n<initial-research-goal>\n${raw}\n</initial-research-goal>\n\n`
                      : `The user gave no opening line — start the interrogation from zero.\n\n`) +
                    `You are the rampage coordinator. Begin with Phase 0 now.`,
                },
              ],
              source: { kind: "user" },
            }),
          )
          return {
            kind: "success" as const,
            text:
              "/research-rampage armed: the coordinator brief is queued for this session — " +
              "the interrogation (Phase 0) starts on the next model step.",
          }
        },
      })
      // Registering the same name twice in one scope throws upstream; the
      // disposer keeps the effect symmetric with every other scoped
      // registration in this monorepo (tools/commands dispose with the ctx).
      return () => {
        cmd()
      }
    })
  }
}

export default ResearchRampage
