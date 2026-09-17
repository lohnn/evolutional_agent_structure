import fs from "fs"

/**
 * Plugin-shipped prompt assets, read at module load. These markdown files
 * ride inside the package (`assets/`), so both the src tree (typecheck) and
 * the built `dist/` resolve `../assets/` to the package root — the same
 * loader pattern as `presets/dreamcatcher/persona.md` in index.ts. They are
 * prompt text handed to a model; the drift-guard test pins their markers
 * and length bounds so future edits are conscious.
 */

/**
 * The awakened coordinator's standing system-prompt section (T3/D5) — the
 * near-full tonality port of the OpenCode HIVE doctrine. Registered as a
 * scoped `systemPrompt.section` on every awakened session.
 */
export const COORDINATOR_DOCTRINE = fs
  .readFileSync(new URL("../assets/doctrine.md", import.meta.url), "utf8")
  .trimEnd()

/**
 * The dormant-session explainer (T3/D6) — the Kanban-metaphor notice that a
 * session has not yet run /awaken. Registered as a scoped
 * `systemPrompt.section` alongside the tool-restriction gate on dormant
 * sessions.
 */
export const DORMANT_NOTICE = fs
  .readFileSync(new URL("../assets/dormant-explainer.md", import.meta.url), "utf8")
  .trimEnd()
