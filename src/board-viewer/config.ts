/**
 * hive-board configuration.
 *
 * The HIVE plugin's own parsers (lib/dream-state, lib/dream-artifacts) take the
 * WORKSPACE root and append `.opencode/...` themselves — so the primary config
 * knob is the workspace root, not the .opencode dir. We expose both.
 *
 * Precedence: CLI arg (--root <path>) > HIVE_BOARD_ROOT env > cwd-derived default.
 * The cwd default walks upward from process.cwd() looking for a `.opencode/`
 * directory (so running from anywhere inside the workspace finds its root).
 */
import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"

/**
 * The running build's identity: a short git SHA (optionally `-dirty`), or the
 * literal sentinel `"unknown"` when git is unavailable / this isn't a checkout.
 * Three deterministic states so the version badge can distinguish stale-tab
 * from fresh from unknowable (I-152) — never a vague "something differs".
 */
export type BuildSha = string

export interface BoardConfig {
  /** Workspace root — the directory that CONTAINS `.opencode/`. */
  workspaceRoot: string
  /** Convenience: `<workspaceRoot>/.opencode`. */
  opencodeDir: string
  /**
   * Bind hostname for the viewer. Defaults to LOOPBACK (127.0.0.1).
   *
   * This viewer serves the contents of `.opencode/` — session titles, dream
   * artifacts, HIVEmind messages — over plain HTTP with NO authentication,
   * and exposes `POST /transitions/*`, which can create, pause, demote and
   * complete work items and spawn opencode sessions. It is an unauthenticated
   * read+write window onto the operator's agent state.
   *
   * While hive-board was a `private: true` repo on one machine, defaulting to
   * `0.0.0.0` was a reasonable local convenience. Shipping inside a public
   * MIT package it is not: the default must be safe on an untrusted network,
   * because the person running `npx hive-board` on café wifi did not opt into
   * publishing their agent state to that network. Non-loopback binds remain
   * fully supported, but are now an explicit, warned-about choice.
   */
  hostname: string
  /** HTTP port for the viewer. */
  port: number
  /**
   * opencode's SQLite session DB, read READ-ONLY by the Phase-1.5 back-fill.
   * The API's session enumeration is provably incomplete (100-row cap AND
   * project_id scoping — gating verification 2026-07-10), so the DB is the
   * only source that returns the full persisted set.
   */
  opencodeDbPath: string
  /**
   * Base URL of the opencode web GUI, used for "Open" deep links
   * (`<guiBaseUrl>/?session=<id>`). Default matches the user's verified
   * OpenChamber deployment (DESIGN §5.3c).
   */
  guiBaseUrl: string
  /**
   * Directory containing work items (board/WI-*.md). Defaults to
   * `<opencodeDir>/board`; overridable so tests/dev point at local fixtures
   * while hive-infra's locked storage module owns the real directory.
   */
  boardDir: string
  /**
   * opencode server base URL for the session client (Start / fresh-promote —
   * Q14). Default: discovered from the running `opencode serve` process via
   * $OPENCODE_PID (/proc cmdline: --hostname/--port). Null ⇒ session-creating
   * affordances are disabled gracefully; file-only transitions still work.
   */
  opencodeUrl: string | null
  /** HTTP Basic password (username is literally "opencode" — Q14). */
  opencodePassword: string | null
  /**
   * Short git SHA of the RUNNING build — the HIVE plugin repo's HEAD, which
   * since the absorption IS the viewer's HEAD (one repo, one version; there is
   * no separate board repo). `-dirty` when the working tree has uncommitted
   * changes, else the literal `"unknown"`.
   *
   * Resolved once at startup and threaded into BoardState so the version badge
   * (and the /api/state poll payload) can surface which bytes are live — and so
   * the client can detect a stale tab running an OLD /client.js against a
   * freshly-restarted server.
   *
   * It was ALSO introduced as a defense against the "am I actually running the
   * new bytes?" confusion from the copied `file:../evolutional_agent_structure`
   * dependency (W-079). That failure mode is gone with the dependency itself —
   * noted rather than deleted, because the badge can now look like belt-and-
   * braces to someone who never saw the failure it was built for. The remaining
   * two jobs above are reason enough to keep it.
   */
  buildSha: BuildSha
}

/**
 * Resolve the running build's HEAD short SHA + dirty flag, once, at startup.
 *
 * `dir` defaults to PACKAGE_ROOT — resolved RELATIVE TO THIS FILE, never a
 * hardcoded sibling path (I-173). That is what makes this work identically
 * whether the package is a git checkout in a workspace or an installed
 * dependency in someone's node_modules. Since the viewer was absorbed into
 * the plugin package, PACKAGE_ROOT is the plugin repo — so the badge now
 * reports the HIVE package's HEAD, which IS the viewer's HEAD (one repo, one
 * version). Any failure (no git, installed from a tarball, not a checkout)
 * degrades to the literal `"unknown"` rather than throwing.
 */
const PACKAGE_ROOT = path.resolve(import.meta.dir, "..", "..")

export function resolveBuildSha(dir: string = PACKAGE_ROOT): BuildSha {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    if (!sha) return "unknown"
    const porcelain = execFileSync("git", ["status", "--porcelain"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return porcelain.trim().length > 0 ? `${sha}-dirty` : sha
  } catch {
    return "unknown"
  }
}

/** Discover the running opencode server's base URL from $OPENCODE_PID. */
function discoverOpencodeUrl(): string | null {
  const pid = process.env["OPENCODE_PID"]
  if (!pid || !/^\d+$/.test(pid)) return null
  try {
    const argv = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0")
    const hostIdx = argv.indexOf("--hostname")
    const portIdx = argv.indexOf("--port")
    if (portIdx === -1 || !argv[portIdx + 1]) return null
    const host = hostIdx !== -1 && argv[hostIdx + 1] ? argv[hostIdx + 1] : "127.0.0.1"
    return `http://${host}:${argv[portIdx + 1]}`
  } catch {
    return null
  }
}

/**
 * A bind address is "loopback" if it can only be reached from this machine.
 * Everything else — `0.0.0.0`, `::`, a LAN IP, a Tailscale name — publishes
 * the viewer to at least one other host.
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "")
  return h === "localhost" || h === "::1" || /^127\./.test(h)
}

/**
 * Print a loud, specific warning when the operator binds somewhere reachable.
 * Deliberately NOT a hard failure: exposing the board on a trusted LAN or a
 * Tailnet is a legitimate, documented deployment (docs/board-viewer/deploy/).
 * The goal is informed consent, not prohibition — so the warning names what
 * is actually exposed rather than saying a vague "this may be insecure".
 */
export function warnIfExposed(hostname: string, port: number): void {
  if (isLoopbackHost(hostname)) return
  console.warn(
    [
      "",
      "  ┌─ hive-board: BINDING TO A NON-LOOPBACK ADDRESS ──────────────────",
      `  │  ${hostname}:${port} is reachable from other machines.`,
      "  │",
      "  │  This viewer has NO authentication. Anyone who can reach it can:",
      "  │    • read your .opencode/ state — work items, session titles,",
      "  │      dream artifacts, HIVEmind messages",
      "  │    • POST /transitions/* to create, pause, demote and complete",
      "  │      work items, and to spawn opencode sessions",
      "  │",
      "  │  Only do this on a network you trust (LAN, Tailnet, or behind an",
      "  │  authenticating reverse proxy). To bind locally instead, drop",
      "  │  --host / HIVE_BOARD_HOST and it will default to 127.0.0.1.",
      "  └──────────────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  )
}

function findWorkspaceRoot(start: string): string | null {
  let dir = path.resolve(start)
  for (;;) {
    if (fs.existsSync(path.join(dir, ".opencode"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function resolveConfig(argv: string[] = process.argv.slice(2)): BoardConfig {
  let root: string | undefined
  let hostname = process.env["HIVE_BOARD_HOST"] ?? "127.0.0.1"
  let port = Number(process.env["HIVE_BOARD_PORT"] ?? 4400)
  let opencodeDbPath =
    process.env["HIVE_BOARD_OPENCODE_DB"] ??
    path.join(process.env["HOME"] ?? "/root", ".local/share/opencode/opencode.db")
  let guiBaseUrl = process.env["HIVE_BOARD_GUI_URL"] ?? "http://studio:3000"
  let boardDir = process.env["HIVE_BOARD_BOARD_DIR"]
  let opencodeUrl = process.env["HIVE_BOARD_OPENCODE_URL"] ?? discoverOpencodeUrl()
  const opencodePassword =
    process.env["HIVE_BOARD_OPENCODE_PASSWORD"] ?? process.env["OPENCODE_SERVER_PASSWORD"] ?? null

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1]) root = argv[++i]!
    if (argv[i] === "--host" && argv[i + 1]) hostname = argv[++i]!
    if (argv[i] === "--port" && argv[i + 1]) port = Number(argv[++i])
    if (argv[i] === "--db" && argv[i + 1]) opencodeDbPath = argv[++i]!
    if (argv[i] === "--gui-url" && argv[i + 1]) guiBaseUrl = argv[++i]!
    if (argv[i] === "--board" && argv[i + 1]) boardDir = argv[++i]!
    if (argv[i] === "--opencode-url" && argv[i + 1]) opencodeUrl = argv[++i]!
  }

  root ??= process.env["HIVE_BOARD_ROOT"] ?? findWorkspaceRoot(process.cwd()) ?? undefined
  if (!root) {
    throw new Error(
      "hive-board: could not locate a workspace root containing .opencode/. " +
        "Pass --root <dir> or set HIVE_BOARD_ROOT.",
    )
  }

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`hive-board: invalid port "${port}" — set --port / HIVE_BOARD_PORT to an integer 0-65535.`)
  }

  const workspaceRoot = path.resolve(root)
  const opencodeDir = path.join(workspaceRoot, ".opencode")
  if (!fs.existsSync(opencodeDir)) {
    throw new Error(`hive-board: ${opencodeDir} does not exist — is ${workspaceRoot} a HIVE workspace?`)
  }

  return {
    workspaceRoot,
    opencodeDir,
    hostname,
    port,
    opencodeDbPath,
    guiBaseUrl: guiBaseUrl.replace(/\/+$/, ""),
    boardDir: boardDir ? path.resolve(boardDir) : path.join(opencodeDir, "board"),
    opencodeUrl: opencodeUrl?.replace(/\/+$/, "") ?? null,
    opencodePassword,
    buildSha: resolveBuildSha(),
  }
}
