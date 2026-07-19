/**
 * Workspace map — fast orientation over the workspace's canonical folder tiers.
 *
 * Collapses "where is project X on disk + what's its git state + what is it" into
 * one call. Since the root AGENTS.md no longer carries a project table, this tool
 * is the LIVE source of truth for what projects exist, where they are, their git
 * state, and their description.
 *
 * Plugin-native (W-007): resolves everything from the runtime `directory` and
 * the on-disk tree, so it works in any workspace, not just this one.
 *
 * Canonical taxonomy (see docs/WORKSPACE-STRUCTURE.md) — four tiers:
 * - projects/            — things actively worked on (primary, detailed section)
 * - reference/repos/     — clones of OTHER codebases (reference, not worked on)
 * - reference/material/  — non-code reference material
 * - scratch/             — the user's own throwaway/scratch work
 * plus the .opencode/ core structural folder.
 *
 * Per-entry description (I-027): read `description:` from the project's own
 * AGENTS.md YAML front-matter; fall back to README.md front-matter; if neither
 * carries one, show no description (graceful, never crash).
 *
 * Git handling (W-023, W-060):
 * - Resolve the git root PER entry via `git rev-parse --show-toplevel`. An entry
 *   whose toplevel differs from the workspace-root toplevel is an EMBEDDED repo
 *   (its own repo/remote — e.g. kindergarten-planner, a gitlink), flagged
 *   distinctly. Do NOT assume one .git for the whole tree.
 * - Report state honestly and degrade gracefully: a shared working tree means
 *   git state can legitimately look odd mid-operation. Never crash; annotate.
 */

import path from "path"
import fs from "fs"
import { execFileSync } from "child_process"
import { readMdFile } from "./frontmatter.js"

// ── Entry model ─────────────────────────────────────────────────────────────

/** Which canonical tier an entry belongs to. */
export type EntryKind = "project" | "reference-repo" | "reference-material" | "scratch" | "core"

export interface WorkspaceEntry {
  /** Short display name (folder basename, e.g. "podcase") */
  name: string
  /** Absolute on-disk path */
  absPath: string
  /** Canonical tier this entry belongs to */
  kind: EntryKind
  /** Concise one-line git state, or a graceful degraded note */
  git: GitState
  /**
   * Description read from the entry's AGENTS.md front-matter (or README.md
   * fallback), if present. Undefined when neither carries a `description:` field.
   */
  description?: string
}

export interface GitState {
  /** true if this path is inside a git repo at all */
  tracked: boolean
  /** Absolute path of the resolved git toplevel for this entry, if tracked */
  toplevel?: string
  /** true if this entry is its own repo, distinct from the workspace-root repo */
  embedded: boolean
  branch?: string
  dirty?: boolean
  ahead?: number
  behind?: number
  /** Whether an upstream is configured (ahead/behind meaningful only if true) */
  hasUpstream?: boolean
  /** Populated when git inspection failed unexpectedly (degraded, not fatal) */
  note?: string
}

// ── Git helpers ─────────────────────────────────────────────────────────────

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return null
  }
}

/**
 * Resolve concise git state for a single directory, relative to the given
 * workspace-root toplevel (used to decide "embedded" distinctly).
 */
export function gitStateFor(dir: string, workspaceToplevel: string | null): GitState {
  const toplevel = git(dir, ["rev-parse", "--show-toplevel"])
  if (!toplevel) {
    return { tracked: false, embedded: false }
  }

  const embedded = workspaceToplevel !== null && path.resolve(toplevel) !== path.resolve(workspaceToplevel)

  const state: GitState = {
    tracked: true,
    toplevel,
    embedded,
  }

  const branch = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])
  if (branch !== null) state.branch = branch === "HEAD" ? "(detached)" : branch

  // Dirty flag — any porcelain output means uncommitted changes.
  const porcelain = git(dir, ["status", "--porcelain"])
  if (porcelain === null) {
    state.note = "git status unavailable (repo may be mid-operation)"
  } else {
    state.dirty = porcelain.length > 0
  }

  // Ahead/behind — only meaningful with an upstream.
  const counts = git(dir, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"])
  if (counts === null) {
    state.hasUpstream = false
  } else {
    const parts = counts.split(/\s+/).map((n) => parseInt(n, 10))
    if (parts.length === 2 && !parts.some(Number.isNaN)) {
      state.hasUpstream = true
      state.behind = parts[0]
      state.ahead = parts[1]
    } else {
      state.hasUpstream = false
    }
  }

  return state
}

// ── Description (front-matter) ──────────────────────────────────────────────

/**
 * Read a `description:` field from an entry's AGENTS.md YAML front-matter, or
 * fall back to README.md front-matter. Returns undefined when neither file
 * exists or neither carries a `description` field. Never throws — a malformed
 * or unreadable file simply yields no description (graceful, per the contract).
 *
 * Reuses the plugin's own front-matter parser rather than hand-rolling.
 */
export function readEntryDescription(entryDir: string): string | undefined {
  for (const fname of ["AGENTS.md", "README.md"]) {
    const p = path.join(entryDir, fname)
    let fm: Record<string, unknown>
    try {
      if (!fs.existsSync(p)) continue
      fm = readMdFile(p).frontmatter as Record<string, unknown>
    } catch {
      continue
    }
    const desc = fm?.description
    if (typeof desc === "string" && desc.trim() !== "") {
      return desc.trim()
    }
  }
  return undefined
}

// ── Discovery ─────────────────────────────────────────────────────────────

/**
 * Core structural folders of the workspace worth surfacing alongside projects.
 * Only those that actually exist on disk are returned.
 */
const CORE_FOLDER_CANDIDATES = [".opencode", "projects"]

/** List immediate subdirectories of a dir (sorted, no dotfiles). Empty if absent. */
function listSubdirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * Build the full workspace map: every entry under projects/ plus the core
 * structural folders. Each entry carries its absolute path and concise git state.
 *
 * @param workspaceRoot absolute path to the workspace root (the plugin `directory`)
 */
export function buildWorkspaceMap(workspaceRoot: string): WorkspaceEntry[] {
  const root = path.resolve(workspaceRoot)
  const workspaceToplevel = git(root, ["rev-parse", "--show-toplevel"])

  const entries: WorkspaceEntry[] = []

  const makeEntry = (dir: string, name: string, kind: EntryKind, withDescription: boolean): WorkspaceEntry => {
    const absPath = path.join(dir, name)
    return {
      name,
      absPath,
      kind,
      git: gitStateFor(absPath, workspaceToplevel),
      ...(withDescription ? { description: readEntryDescription(absPath) } : {}),
    }
  }

  // ── Tier 1: projects/ (primary, detailed — git-state + description) ──
  const projectsDir = path.join(root, "projects")
  for (const name of listSubdirs(projectsDir)) {
    entries.push(makeEntry(projectsDir, name, "project", true))
  }

  // ── Tier 2: reference/ (secondary context) ──
  //   reference/repos/     — clones of OTHER codebases (git-state useful)
  //   reference/material/  — non-code reference material (no description expected)
  const refReposDir = path.join(root, "reference", "repos")
  for (const name of listSubdirs(refReposDir)) {
    entries.push(makeEntry(refReposDir, name, "reference-repo", true))
  }
  const refMaterialDir = path.join(root, "reference", "material")
  for (const name of listSubdirs(refMaterialDir)) {
    entries.push(makeEntry(refMaterialDir, name, "reference-material", true))
  }

  // ── Tier 3: scratch/ (user's own throwaway work) ──
  const scratchDir = path.join(root, "scratch")
  for (const name of listSubdirs(scratchDir)) {
    entries.push(makeEntry(scratchDir, name, "scratch", true))
  }

  // ── Core structural folders ──
  for (const cand of CORE_FOLDER_CANDIDATES) {
    const absPath = path.join(root, cand)
    if (!fs.existsSync(absPath)) continue
    entries.push({
      name: cand,
      absPath,
      kind: "core",
      git: gitStateFor(absPath, workspaceToplevel),
    })
  }

  return entries
}

// ── Fuzzy lookup ─────────────────────────────────────────────────────────────

export interface LookupResult {
  match?: WorkspaceEntry
  /** Populated when there is no exact-ish match — close candidates to guide the user */
  suggestions: WorkspaceEntry[]
}

/**
 * Fuzzy/substring lookup of a single entry by name. Case-insensitive.
 * On no direct match, returns close candidates (SNG-018: guide, don't return
 * bare emptiness).
 */
export function lookupEntry(entries: WorkspaceEntry[], query: string): LookupResult {
  const q = query.trim().toLowerCase()

  // Exact name match wins.
  const exact = entries.find((e) => e.name.toLowerCase() === q)
  if (exact) return { match: exact, suggestions: [] }

  // Substring matches.
  const substr = entries.filter((e) => e.name.toLowerCase().includes(q))
  if (substr.length === 1) return { match: substr[0], suggestions: [] }
  if (substr.length > 1) return { match: undefined, suggestions: substr }

  // No substring hit — offer fuzzy near-matches by shared prefix / token overlap.
  const suggestions = entries
    .map((e) => ({ e, score: similarity(q, e.name.toLowerCase()) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.e)

  return { match: undefined, suggestions }
}

/** Cheap similarity: shared-token + common-prefix length. Enough to guide. */
function similarity(a: string, b: string): number {
  let prefix = 0
  const min = Math.min(a.length, b.length)
  while (prefix < min && a[prefix] === b[prefix]) prefix++
  // token overlap on non-alphanumeric boundaries
  const at = new Set(a.split(/[^a-z0-9]+/).filter(Boolean))
  const bt = new Set(b.split(/[^a-z0-9]+/).filter(Boolean))
  let shared = 0
  for (const t of at) if (bt.has(t)) shared++
  return prefix + shared * 2
}

// ── Formatting ─────────────────────────────────────────────────────────────

/** One-line git summary for the list-all case. */
export function formatGitLine(g: GitState): string {
  if (!g.tracked) return "not a git repo"
  const bits: string[] = []
  bits.push(g.branch ?? "?")
  if (g.dirty === undefined) {
    bits.push("state?")
  } else {
    bits.push(g.dirty ? "dirty" : "clean")
  }
  if (g.hasUpstream) {
    const a = g.ahead ?? 0
    const b = g.behind ?? 0
    if (a || b) bits.push(`↑${a} ↓${b}`)
    else bits.push("up-to-date")
  } else {
    bits.push("no upstream")
  }
  if (g.embedded) bits.push("EMBEDDED repo")
  if (g.note) bits.push(`(${g.note})`)
  return bits.join(", ")
}

/** Truncate a description for the concise list-all case. */
function conciseDescription(desc: string, max = 100): string {
  const oneLine = desc.replace(/\s+/g, " ").trim()
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine
}

/**
 * Format the full map (list-all). projects/ is the primary detailed section
 * (git-state + description per entry); reference/ and scratch/ tiers are
 * secondary context.
 */
export function formatMap(entries: WorkspaceEntry[], workspaceRoot: string): string {
  const projects = entries.filter((e) => e.kind === "project")
  const refRepos = entries.filter((e) => e.kind === "reference-repo")
  const refMaterial = entries.filter((e) => e.kind === "reference-material")
  const scratch = entries.filter((e) => e.kind === "scratch")
  const core = entries.filter((e) => e.kind === "core")

  const lines: string[] = [
    `# Workspace Map — ${path.resolve(workspaceRoot)}`,
    `${projects.length} project(s), ${refRepos.length} reference repo(s), ` +
      `${refMaterial.length} reference material item(s), ${scratch.length} scratch item(s), ` +
      `${core.length} core folder(s).`,
    ``,
  ]

  // Primary detailed section: projects/
  if (projects.length > 0) {
    lines.push(`## Projects (worked-on)`)
    for (const e of projects) {
      lines.push(`- ${e.name}`)
      if (e.description) lines.push(`    ${conciseDescription(e.description)}`)
      lines.push(`    ${e.absPath}`)
      lines.push(`    git: ${formatGitLine(e.git)}`)
    }
    lines.push(``)
  } else {
    lines.push(`## Projects (worked-on)`)
    lines.push(`  (none — projects/ is empty or absent)`)
    lines.push(``)
  }

  // Secondary context: reference/repos
  if (refRepos.length > 0) {
    lines.push(`## reference/repos (clones — not worked on)`)
    for (const e of refRepos) {
      const desc = e.description ? ` — ${conciseDescription(e.description, 70)}` : ""
      lines.push(`- ${e.name}${desc}  [git: ${formatGitLine(e.git)}]`)
    }
    lines.push(``)
  }

  // Secondary context: reference/material
  if (refMaterial.length > 0) {
    lines.push(`## reference/material (non-code reference)`)
    for (const e of refMaterial) {
      const desc = e.description ? ` — ${conciseDescription(e.description, 70)}` : ""
      lines.push(`- ${e.name}${desc}`)
    }
    lines.push(``)
  }

  // Secondary context: scratch
  if (scratch.length > 0) {
    lines.push(`## scratch (throwaway)`)
    for (const e of scratch) {
      lines.push(`- ${e.name}`)
    }
    lines.push(``)
  }

  // Core structural folders
  if (core.length > 0) {
    lines.push(`## Core folders`)
    for (const e of core) {
      lines.push(`- ${e.name}`)
      lines.push(`    ${e.absPath}`)
      lines.push(`    git: ${formatGitLine(e.git)}`)
    }
  }

  return lines.join("\n").trimEnd()
}

/** Format a single matched entry (fuller — full description). */
export function formatEntry(e: WorkspaceEntry): string {
  return [
    `${e.name} [${e.kind}]`,
    e.description ? `  description: ${e.description.replace(/\s+/g, " ").trim()}` : ``,
    `  path: ${e.absPath}`,
    `  git:  ${formatGitLine(e.git)}`,
    e.git.toplevel ? `  git root: ${e.git.toplevel}` : ``,
  ]
    .filter(Boolean)
    .join("\n")
}

/** Format a not-found result — guide the user (SNG-018). */
export function formatNotFound(query: string, result: LookupResult, entries: WorkspaceEntry[]): string {
  const lines: string[] = [`No workspace entry matched "${query}".`]
  if (result.suggestions.length > 0) {
    lines.push(``)
    lines.push(`Did you mean one of these?`)
    for (const e of result.suggestions) {
      lines.push(`  - ${e.name} [${e.kind}] — ${e.absPath}`)
    }
  } else {
    lines.push(``)
    lines.push(`Valid scopes (${entries.length} total):`)
    const names = entries.map((e) => e.name).sort()
    lines.push(`  ${names.join(", ")}`)
  }
  lines.push(``)
  lines.push(`Call workspace_map with no argument to see the full map.`)
  return lines.join("\n")
}
