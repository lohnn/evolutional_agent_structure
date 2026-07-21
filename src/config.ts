/**
 * hive-board configuration.
 *
 * The HIVE plugin's own parsers (lib/dream-state, lib/dream-artifacts) take the
 * WORKSPACE root and append `.opencode/...` themselves — so the primary config
 * knob is the workspace root, not the .opencode dir. We expose both.
 *
 * Precedence: CLI arg (--root <path>) > HIVE_BOARD_ROOT env > cwd-derived default.
 * The cwd default walks upward from process.cwd() looking for a `.opencode/`
 * directory (so running from projects/hive-board/ finds /workspace).
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
  /** Bind hostname for the viewer (default 0.0.0.0 — reachable over LAN/Tailscale). */
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
   * Short git SHA of the RUNNING build (the board repo HEAD), `-dirty` if the
   * working tree has uncommitted changes, else the literal `"unknown"`.
   * Resolved once at startup and threaded into BoardState so the version badge
   * (and the /api/state poll payload) can surface which bytes are live — and so
   * the client can detect a stale tab running an OLD /client.js against a
   * freshly-restarted server. Also a defense against the "am I actually running
   * the new bytes?" confusion from the copied `file:` dep failure mode (W-079):
   * the badge makes the running commit VISIBLE instead of assumed.
   */
  buildSha: BuildSha
}

/**
 * Resolve the board repo's HEAD short SHA + dirty flag, once, at startup.
 * `dir` is the board project directory (config source lives in the repo, so we
 * anchor on __dirname's package root, not the workspace root — this must
 * reflect the BOARD repo HEAD, W-079). Any failure (no git, not a checkout,
 * detached weirdness) degrades to `"unknown"` rather than throwing.
 */
export function resolveBuildSha(dir: string = path.join(import.meta.dir, "..")): BuildSha {
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
  let hostname = process.env["HIVE_BOARD_HOST"] ?? "0.0.0.0"
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
