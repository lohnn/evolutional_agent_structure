/**
 * @hive/dsh-agents — dreamtime skill + dreamcatcher preset for dsh.
 *
 * Two halves:
 *
 * 1. The `dreamtime` skill, registered as a RUNTIME skill (ctx.skills.register)
 *    with its SKILL.md body inlined — no filesystem-root coupling, always
 *    available wherever the plugin loads. (The filesystem provider discovers
 *    `<project>/.agents/skills`/`~/.agents/skills` roots too, but shipping the
 *    body with the plugin makes the skill independent of where dsh runs.)
 *
 * 2. The dreamcatcher preset MATERIAL: the Recall/Audit persona text and the
 *    tool allow-list, plus `agent.cordis.yml` + `preset.yml` written to
 *    `presets/dreamcatcher/` for installation into a dsh preset root
 *    (`$DSH_HOME/.agent-presets/dreamcatcher/`). The composition mounts the
 *    dream archive service + dream tools in the preset's scope so a
 *    dreamcatcher agent gets exactly the hive_dream_* catalog (Recall:
 *    read-only; Audit adds rank/detect — both are read-only; mutation tools
 *    stay reachable for the dreamtime CLOSURE path which is the workflow's
 *    write step, matching the OpenCode agent definition).
 *
 *    The persona body ALSO feeds `@hive/dsh-evolution`: `hive_dispatch`
 *    composes it into the dispatched dreamcatcher child's persona (via the
 *    `DREAMCATCHER_DISPATCH_PERSONA` export below), so dispatch is self-
 *    contained on the plugin side — no preset install, no orchestrator-side
 *    method spec.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))

const SKILL_MD = fs.readFileSync(path.join(HERE, "../skills/dreamtime/SKILL.md"), "utf8")

// The canonical dreamcatcher persona (Recall/Audit method, output formats,
// constraints, read-only statement) — the SINGLE SOURCE the dsh preset AND
// the evolution dispatch path both carry. The preset mounts it via
// presets/dreamcatcher/agent.cordis.yml; `@hive/dsh-evolution` embeds it in
// `hive_dispatch`'s per-child persona so a dispatched dreamcatcher child gets
// the full method WITHOUT any orchestrator-side spec and WITHOUT the preset
// being installed under $DSH_HOME. The dispatch wrapper (identity line +
// READ-ONLY statement) lives in evolution; this file is the persona body.
// A drift-guard test in evolution asserts this file and the preset yml text
// block stay identical.
const DREAMCATCHER_PERSONA_BODY = fs.readFileSync(path.join(HERE, "../presets/dreamcatcher/persona.md"), "utf8")

export const DREAMCATCHER_DISPATCH_PERSONA = DREAMCATCHER_PERSONA_BODY.trimEnd()

// Strip YAML frontmatter for the runtime registration (the dsh filesystem
// provider parses it from files; for a runtime registration the fields are
// passed structurally and the body is content only).
const body = SKILL_MD.replace(/^---\n[\s\S]*?\n---\n?/, "")

import type { Context } from "@deepseek-ai/cordis"

declare module "@deepseek-ai/cordis" {
  interface Context {
    skills: {
      register: (skill: {
        name: string
        description: string
        whenToUse?: string
        content: string
        source?: string
        provider?: string
        invocation?: { modelInvocable: boolean; userInvocable: boolean }
      }) => () => void
    }
  }
}

export type AgentsCtx = Context

export function apply(ctx: AgentsCtx) {
  // ── dreamtime skill (runtime registration) ────────────────────────────────
  // NB: validateDefinition (run when the skill is LOADED, not registered)
  // requires `source` and `provider` as plain strings — the registry fills
  // provider="runtime" but NOT source, which the loader then rejects with
  // `loaded skill "x" source must be a string`. Pass both explicitly.
  const disposeSkill = ctx.skills.register({
    name: "dreamtime",
    description:
      "Deliberate context consolidation. Transforms raw session experience into " +
      "persistent artifacts (insights, warnings, songlines, shadows) that survive " +
      "across sessions. Use at end of productive sessions or when context is " +
      "accumulating contradictions, repetition, or coherence decay.",
    content: body,
    source: "runtime",
    provider: "runtime",
    invocation: { modelInvocable: true, userInvocable: true },
  })
  return () => { disposeSkill() }
}

// The dsh loader applies the DEFAULT export only — inject rides on the fn
// (a function's own `name` is read-only, so only inject is attached).
;(apply as unknown as Record<string, unknown>).inject = ["skills"]
export default apply
