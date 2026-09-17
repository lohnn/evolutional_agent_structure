/**
 * The capability "rich method body" (T2 happy-path landing of D7's persona
 * contract): a spawned capability's method travels as STRUCTURED SECTIONS —
 * What This Enables / Activation Triggers / Operating Protocol /
 * Self-Modification Protocol / Boundaries / Evolution History — not free
 * prose. Enables+Triggers+Boundaries are the discriminators the coordinator's
 * use-vs-spawn decision reads; the scaffold keeps them crisp instead of
 * letting them dissolve into a paragraph.
 *
 * Rendered markdown is indented by the caller (see renderAgentCordisYml) into
 * the preset's `agent.cordis.yml` persona text block.
 */

/** The OpenCode capability template's sections, as named string fields (D7). */
export interface CapabilityPersona {
  /** What This Enables — REQUIRED. The use-vs-spawn discriminator. */
  enables: string
  /** Activation Triggers — REQUIRED. When to reach for the capability. */
  triggers: string
  /** Operating Protocol — the method: how the capability works. */
  protocol?: string
  /** Self-Modification Protocol — how the capability evolves itself. */
  selfModification?: string
  /** Boundaries — what the capability must NOT do. */
  boundaries?: string
  /** Evolution History — spawn provenance; uncertainty is allowed to live here. */
  history?: string
}

const SECTION_TITLES: Array<{ key: keyof CapabilityPersona; title: string }> = [
  { key: "enables", title: "What This Enables" },
  { key: "triggers", title: "Activation Triggers" },
  { key: "protocol", title: "Operating Protocol" },
  { key: "selfModification", title: "Self-Modification Protocol" },
  { key: "boundaries", title: "Boundaries" },
  { key: "history", title: "Evolution History" },
]

/**
 * Validate + normalize a raw persona value arriving over the tool boundary.
 * Returns `undefined` when persona is absent (minimal two-line spawn stays
 * valid, D7). Throws with a model-actionable message when present-but-invalid:
 * `enables` + `triggers` are REQUIRED and non-empty; empty optional sections
 * are DROPPED (a section with nothing to say must not render as a stub).
 */
export function parseCapabilityPersona(raw: unknown): CapabilityPersona | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`persona must be an object with named section fields (${SECTION_TITLES.map((s) => s.key).join(", ")})`)
  }
  const rec = raw as Record<string, unknown>
  const section = (key: keyof CapabilityPersona): string | undefined => {
    const v = rec[key]
    if (v === undefined || v === null) return undefined
    if (typeof v !== "string") throw new Error(`persona.${String(key)} must be a string`)
    const trimmed = v.trim()
    return trimmed === "" ? undefined : trimmed
  }
  const enables = section("enables")
  const triggers = section("triggers")
  if (!enables || !triggers) {
    throw new Error(
      "persona requires non-empty `enables` and `triggers` sections — they are the discriminators " +
        "the coordinator reads when deciding to USE vs SPAWN the capability"
    )
  }
  return {
    enables,
    triggers,
    protocol: section("protocol"),
    selfModification: section("selfModification"),
    boundaries: section("boundaries"),
    history: section("history"),
  }
}

/**
 * Render the persona as the markdown method block (present sections only, in
 * template order). Heading style matches the OpenCode template the doctrine
 * teaches; the body is one paragraph per section.
 */
export function renderPersonaSections(persona: CapabilityPersona): string {
  const blocks: string[] = []
  for (const { key, title } of SECTION_TITLES) {
    const value = persona[key]
    if (value === undefined || value.trim() === "") continue
    blocks.push(`## ${title}\n\n${value.trim()}`)
  }
  return blocks.join("\n\n")
}

/**
 * Compose the preset's `agent.cordis.yml` — the persona-mounting file /spawn
 * and the awaken batch tool materialize. The no-persona path is BYTE-IDENTICAL
 * to the pre-T2 spawn output (pinned by test); with a persona, the text block
 * keeps the identity line and appends the rendered method under it. YAML block
 * scalar: content lines are indented 6 spaces under `    text: |-`, and blank
 * lines stay truly empty (trailing spaces would leak into the scalar value).
 */
export function renderAgentCordisYml(name: string, description: string, persona?: CapabilityPersona): string {
  const headerLines = [
    `# The \`${name}\` capability preset — spawned by /spawn.`,
    `# Persona + mounted tools are edited here; energy lives in the sibling`,
    `# \`${name}.md\` ledger that the tick manages.`,
    `- id: persona`,
    `  name: '@deepseek-ai/dsh-persona'`,
    `  config:`,
    `    text: |-`,
  ]
  let text = `You are the ${name} capability: ${description}`
  if (persona) {
    text += `\n\n${renderPersonaSections(persona)}`
  }
  const textLines = text.split("\n").map((line) => (line.length > 0 ? `      ${line}` : line))
  return [...headerLines, ...textLines, ""].join("\n")
}
