/**
 * WI-108 — the /evolve mutation-apply path's queue + charter-integration lib.
 *
 * The MUTATE lifecycle operation was a no-op on dsh (WI-108): the /evolve
 * summon's hive_evolve tool was analysis-only (roster + energy) and approved
 * charter mutations sat unapplied on board ledger records. This lib is the
 * executor's substrate:
 *
 *   - `hive-mutations.json` — the machine-readable mutation queue (the same
 *     ledger home as hive-state.json / hive-sessions.json: `.opencode/agents/`).
 *     One record per mutation: the VERBATIM approved text, the target
 *     capability, lifecycle status, the operator-approval evidence, and an
 *     append-only transition history.
 *   - `integrateCharterMutation()` — surgical, verbatim-additive insertion of
 *     an approved mutation into the target's `agent.cordis.yml` persona block
 *     as a dated "## Charter Mutations" section. The charter of a capability
 *     IS its persona (what dispatched children read); a mutation never
 *     rewrites existing sections — it APPENDS the operator's words exactly.
 *
 * IO conventions mirror lib/energy.ts exactly: tolerant try/catch reads that
 * fall back to an empty store (reads never throw), whole-file JSON writes
 * with a 2-space indent.
 */

import fs from "fs"
import path from "path"

export type MutationStatus = "proposed" | "approved" | "applied" | "voided"

/** The operator's approval, carried to the executor through the summon cycle. */
export interface MutationApproval {
  /** The operator's approval words, verbatim, as the coordinator relayed them. */
  operator_verbatim: string
  /** ISO date (or timestamp) of the operator's approval. */
  approved_at: string
  /** Where the approval is archived (board item + revision, ledger line, …). */
  evidence?: string
}

/** One mutation record in the queue (append-and-transition; text is immutable). */
export interface CharterMutation {
  /** Stable slug id, e.g. `retrain-orchestrator-charter-p2`. */
  id: string
  /** The capability whose charter the mutation grows. */
  target: string
  /** v1: a charter (persona) growth. The field exists so later kinds can land without a schema break. */
  kind: "charter"
  /** The VERBATIM approved mutation text — integrated exactly, never paraphrased. */
  text: string
  /** Who proposed it (capability name, or `coordinator` relaying a capability's word). */
  proposed_by: string
  /** ISO date the proposal was made. */
  proposed_at: string
  /** Where the proposal is archived (board ledger/revision, dream residue, …). */
  evidence?: string
  status: MutationStatus
  approval?: MutationApproval
  /** Set only after end-state verification passed (W-047: never trust the write's return). */
  applied?: {
    at: string
    files: string[]
    verification: string
  }
  history: Array<{ at: string; from: string; to: string; by: string; note?: string }>
}

export interface MutationStore {
  v: 1
  updated_at: string
  mutations: CharterMutation[]
}

const EMPTY_STORE: MutationStore = { v: 1, updated_at: "", mutations: [] }

export function mutationsPath(directory: string): string {
  return path.join(directory, ".opencode/agents/hive-mutations.json")
}

export function readMutations(directory: string): MutationStore {
  try {
    const raw = JSON.parse(fs.readFileSync(mutationsPath(directory), "utf8")) as MutationStore
    if (!Array.isArray(raw.mutations)) return { ...EMPTY_STORE }
    return raw
  } catch {
    return { ...EMPTY_STORE }
  }
}

export function writeMutations(directory: string, store: MutationStore): void {
  const p = mutationsPath(directory)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify({ ...store, v: 1, updated_at: new Date().toISOString() }, null, 2), "utf8")
}

/**
 * Append one `<from> → <to>` transition to the record's history. Returns a NEW
 * store object (records are treated as immutable values outside this lib).
 */
export function transitionMutation(
  store: MutationStore,
  id: string,
  to: MutationStatus,
  by: string,
  note?: string,
  at: string = new Date().toISOString()
): MutationStore {
  const mutations = store.mutations.map((m) =>
    m.id === id
      ? { ...m, status: to, history: [...m.history, { at, from: m.status, to, by, ...(note ? { note } : {}) }] }
      : m
  )
  return { ...store, mutations }
}

// ── persona-block surgery ─────────────────────────────────────────────────────
// The persona lives inside agent.cordis.yml as a YAML block scalar rendered
// by renderAgentCordisYml (persona.ts):
//
//     - id: persona
//       name: '@deepseek-ai/dsh-persona'
//       config:
//         text: |-
//               <persona text, each line indented 6 spaces, empty lines stay empty>
//
// The executor integrates spawn-rendered presets ONLY: a file without the
// canonical `    text: |-` line is refused, never guessed at.

export const PERSONA_BLOCK_HINT =
  'agent.cordis.yml has no canonical persona text block — the executor integrates the spawn-rendered shape ' +
  '(`- id: persona` → `config:` → `    text: |-`, content lines at 6 spaces) and refuses rather than guessing'

interface PersonaBlockParse {
  /** The de-indented persona text. */
  text: string
  /** Index of the `    text: |-` line in the file. */
  textLineIdx: number
  /** Indices of the content lines that follow it. */
  contentIdxs: number[]
}

/**
 * Extract the persona text block from an agent.cordis.yml. Throws (with the
 * model-actionable PERSONA_BLOCK_HINT) when the canonical block is absent.
 * Block content = every line after `    text: |-` that is empty or indented
 * ≥6 spaces; the first non-empty line at lower indent (e.g. `  - id:` or
 * `- id:`) — or EOF — ends the block.
 */
export function parsePersonaBlock(yml: string): PersonaBlockParse {
  const lines = yml.split("\n")
  const textLineIdx = lines.findIndex((l) => l === "    text: |-")
  if (textLineIdx === -1) throw new Error(PERSONA_BLOCK_HINT)
  const contentIdxs: number[] = []
  for (let i = textLineIdx + 1; i < lines.length; i++) {
    const line = lines[i]!
    if (line === "" || line.startsWith("      ")) contentIdxs.push(i)
    else break
  }
  const text = contentIdxs
    .map((i) => (lines[i] === "" ? "" : (lines[i] as string).slice(6)))
    .join("\n")
    .replace(/\n+$/, "")
  return { text, textLineIdx, contentIdxs }
}

/** Render the dated section an applied mutation contributes to the persona. */
export function charterMutationSection(m: { id: string; approvedAt: string; evidence?: string; text: string }): string {
  const lines = ["## Charter Mutations", "", `### ${m.id} — operator-approved ${m.approvedAt}`]
  if (m.evidence) lines.push(`Approval evidence: ${m.evidence}`)
  lines.push("", m.text)
  return lines.join("\n")
}

/**
 * Integrate one approved mutation into the persona text: verbatim-additive.
 * Existing sections are NEVER rewritten (the executor has no business
 * paraphrasing an operator-approved charter growth); the dated section is
 * appended at the persona's end. Throws when the block is absent, when the
 * mutation id is already integrated (double-apply guard), or when the
 * text would not round-trip through the 6-space block indent (content lines
 * with leading whitespace are cut to indent — the executor refuses those
 * rather than silently changing the operators' words).
 */
export function integrateCharterMutation(
  yml: string,
  m: { id: string; approvedAt: string; evidence?: string; text: string }
): string {
  const parsed = parsePersonaBlock(yml)
  if (parsed.text.includes(`### ${m.id} `)) {
    throw new Error(`mutation "${m.id}" is already integrated into this persona — refusing to double-apply`)
  }
  if (m.text.split("\n").some((l) => l.length > 0 && l.startsWith(" "))) {
    throw new Error("mutation text must not contain lines with leading whitespace (it would not round-trip the YAML block indent)")
  }
  const newPersona = (parsed.text + "\n\n" + charterMutationSection(m)).trimEnd()
  const newContent = newPersona.split("\n").map((line) => (line === "" ? "" : `      ${line}`))
  const lines = yml.split("\n")
  const before = lines.slice(0, parsed.contentIdxs[0] ?? parsed.textLineIdx + 1)
  const after = lines.slice((parsed.contentIdxs[0] ?? parsed.textLineIdx + 1) + parsed.contentIdxs.length)
  return [...before, ...newContent, ...after].join("\n")
}

/**
 * W-047 end-state verification: re-read the INTEGRATED file and derive success
 * from what actually landed — the dated marker, the exact verbatim text inside
 * the de-indented persona block, and nothing else assumed. Returns the found
 * persona text for the caller's report.
 */
export function verifyCharterIntegration(
  yml: string,
  m: { id: string; approvedAt: string; text: string }
): { ok: boolean; problem?: string; persona: string } {
  let parsed: PersonaBlockParse
  try {
    parsed = parsePersonaBlock(yml)
  } catch (err) {
    return { ok: false, problem: `persona block unreadable after write: ${err instanceof Error ? err.message : String(err)}`, persona: "" }
  }
  const marker = `### ${m.id} — operator-approved ${m.approvedAt}`
  if (!parsed.text.includes(marker)) return { ok: false, problem: `marker "${marker}" absent from the written persona`, persona: parsed.text }
  if (!parsed.text.includes(m.text)) return { ok: false, problem: `verbatim approved text absent from the written persona`, persona: parsed.text }
  return { ok: true, persona: parsed.text }
}
