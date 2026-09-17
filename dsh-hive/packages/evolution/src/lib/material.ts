import fs from "fs"
import path from "path"

/**
 * T5/D7 — capability METHOD transport. `composeDispatchPersona` composes the
 * dispatched child's persona as: identity line + capability material + the
 * plugin's capability standing context. This module resolves the middle
 * element — the capability's OWN method — from the roster's two layouts:
 *
 * (a) the dsh preset dir `<capabilitiesPath>/<name>/agent.cordis.yml`: the
 *     persona text block under `    text: |-` (lines indented 6 spaces, blank
 *     lines empty, exactly what `renderAgentCordisYml` writes), with the
 *     FIRST line dropped — that is the identity line, re-composed fresh by
 *     the composer;
 * (b) else the legacy OpenCode ledger `<capabilitiesPath>/<name>.md`: the
 *     body after the frontmatter block (the roster readers' regex-line
 *     parsing style — deliberately NO YAML dependency);
 * (c) else `undefined` — non-fatal everywhere; the caller (hive_dispatch)
 *     logs the miss at debug and the child dispatches with identity +
 *     standing only.
 *
 * The preset wins when both exist (D7 cutover: legacy bodies are promoted
 * into preset persona material so dispatch reads one canonical source). The
 * `directory` argument is accepted for diagnostics symmetry with the call
 * site (the debug-launch context names the workspace); resolution itself
 * needs only `capabilitiesPath`.
 */
export function resolveCapabilityMaterial(
  directory: string,
  capabilitiesPath: string,
  name: string
): string | undefined {
  // (a) preset persona text block.
  try {
    const yml = fs.readFileSync(path.join(capabilitiesPath, name, "agent.cordis.yml"), "utf8")
    const block = extractYamlPersonaText(yml)
    if (block !== undefined && block.trim() !== "") return block
  } catch {
    // fall through to the legacy ledger
  }
  // (b) legacy capability markdown, body after frontmatter.
  try {
    const md = fs.readFileSync(path.join(capabilitiesPath, `${name}.md`), "utf8")
    const body = mdBodyAfterFrontmatter(md)
    if (body !== "") return body
  } catch {
    // fall through to the miss
  }
  return undefined
}

/**
 * Extract the persona text block from a preset `agent.cordis.yml` (the same
 * block the plugin renders via `renderAgentCordisYml`): the lines under the
 * `    text: |-` marker that are blank or indented 6 spaces, up to the first
 * line with less indent, 6-space prefix stripped — then the FIRST line
 * dropped (the identity line is re-composed fresh by the composer, so it
 * must not double). Returns `undefined` when the file carries no text block
 * or nothing survives the identity-line drop.
 */
export function extractYamlPersonaText(yml: string): string | undefined {
  const lines = yml.split("\n")
  const start = lines.findIndex((line) => /^    text:\s*\|-\s*$/.test(line))
  if (start === -1) return undefined
  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line === "" || line.startsWith("      ")) {
      body.push(line.startsWith("      ") ? line.slice(6) : "")
    } else {
      break // first line with less indent ends the block scalar
    }
  }
  const text = body.join("\n").trimEnd()
  if (text === "") return undefined
  const withoutIdentity = text.split("\n").slice(1).join("\n").trim()
  return withoutIdentity === "" ? undefined : withoutIdentity
}

/**
 * Body of a legacy capability markdown after its frontmatter block — the
 * same regex-line parsing style the roster readers use (no YAML dependency).
 * Content without a frontmatter block is body as-is; empty bodies collapse
 * to `""`.
 */
function mdBodyAfterFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  const body = match ? content.slice(match[0].length) : content
  return body.trim()
}
