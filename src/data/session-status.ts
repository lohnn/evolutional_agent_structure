/**
 * Live per-session processing status (WI-044): surface, on the board, which
 * owning sessions are actively CHUGGING ALONG (busy), retrying after a provider
 * error, or idle — the "busy vs idle" half that action-required.ts's
 * "waiting-for-USER-input" half cannot see.
 *
 * ── NODE-ONLY — never import from render.ts (I-192 bundle boundary) ──────────
 * This module does network I/O (raw HTTP to the opencode server). It must NEVER
 * be pulled into the browser bundle. render.ts consumes ONLY the pure
 * `SessionStatusKind` VALUES this produces (off BoardState) and may
 * `import type` the alias here (types are erased by the bundler — same idiom
 * render.ts already uses for ActionRequired / WorkItem / SessionMirror).
 *
 * ── Why direct polling, not a plugin relay (matches action-required.ts) ──────
 * The running opencode server exposes processing status across ALL sessions via
 * ONE GLOBAL v2 endpoint — so this is ONE HTTP call per poll tick, not
 * per-session, and needs NO plugin changes:
 *   GET /session/status → { [sessionID]: SessionStatus }
 *     SessionStatus = {type:"idle"} | {type:"busy"}
 *                   | {type:"retry", attempt, message, next, action?}
 * Verified against the installed SDK @opencode-ai/sdk v2 gen (types.gen
 * `SessionStatus`, url:"/session/status", GET, accepts ?directory=, 200 ⇒ the
 * object map above).
 *
 * ── EMPIRICAL GATE FINDING (W-077, 2026-07-23) — the map is ACTIVE-ONLY ──────
 * Live-probed against the running server (127.0.0.1:4096) BEFORE building:
 *   1. DIRECTORY-SCOPED and strict — `GET /session/status` with NO ?directory
 *      returns `{}`; a project SUBDIR returns `{}`; only the exact workspace
 *      root the sessions were created under returns entries. We always send
 *      `?directory=<workspaceRoot>`, matching action-required.ts / todos.ts.
 *   2. THE MAP LISTS ONLY NON-IDLE SESSIONS. Ground truth: `/session` returned
 *      100 sessions in this directory; `/session/status` returned exactly 1
 *      (the one busy session). Idle sessions are OMITTED ENTIRELY, even though
 *      `{type:"idle"}` is a valid typed value.
 * CONSEQUENCE — encoded in this module's contract: a session id ABSENT from the
 * returned map means "idle OR unknown OR not-loaded", indistinguishable. We
 * therefore only ever record a POSITIVE busy/retry/idle entry for ids the
 * server actually reported. Absence carries NO information downstream: the
 * renderer treats a missing key as "no status badge" (unknown ≠ idle — never
 * paint doneness/idleness onto a session the server didn't mention). An `idle`
 * entry is kept faithfully IF the server ever emits one (a future/other build
 * might), but we never SYNTHESISE idle from absence.
 *
 * ── Freshness: PER-REQUEST, never through the frozen mirror (I-187) ──────────
 * Processing status is time-sensitive: it must APPEAR when a session goes busy
 * and CLEAR on the next poll once it goes idle. It rides the per-request board
 * assembly (like actionRequired / todoSubStates), NOT the bootstrap-only
 * sessionMirror (computed once at startup, never refreshed — routing a live
 * flag through it would go stale, I-187).
 *
 * ── Read-only (I-148/I-179) ─────────────────────────────────────────────────
 * The board only SURFACES status. It never changes it. Pure GET.
 */
import type { BoardConfig } from "../config"

/**
 * The three processing states the board recognises, projected from
 * SessionStatus.type. Only these three are ever stored; a session absent from
 * the map is NOT represented here (absence ⇒ "unknown / no badge" at the
 * renderer, per the active-only finding above).
 */
export type SessionStatusKind = "busy" | "idle" | "retry"

/** Raw shape of one `GET /session/status` map value (only `type` is read). */
interface RawSessionStatus {
  type?: string
}

/**
 * Fetch `GET /session/status` over raw HTTP, mirroring action-required.ts /
 * todos.ts exactly: Basic auth (username literally "opencode" — Q14),
 * directory-scoped to the workspace root, null-degradation on ANY failure
 * (unconfigured backend, network error, non-200, malformed body). Returns null
 * (⇒ "couldn't read", unknown ≠ empty) so the caller degrades to an empty map
 * this tick rather than throwing.
 *
 * NOTE the response is an OBJECT MAP, not an array (unlike /permission &
 * /question): we validate it's a non-null non-array object and iterate
 * Object.entries — there is deliberately no Array.isArray guard here.
 */
async function fetchStatusMap(config: BoardConfig): Promise<Record<string, RawSessionStatus> | null> {
  if (!config.opencodeUrl || !config.opencodePassword) return null
  const auth = "Basic " + Buffer.from(`opencode:${config.opencodePassword}`).toString("base64")
  const dirQ = `?directory=${encodeURIComponent(config.workspaceRoot)}`
  const url = `${config.opencodeUrl}/session/status${dirQ}`
  try {
    const res = await fetch(url, { headers: { Authorization: auth } })
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    if (!data || typeof data !== "object" || Array.isArray(data)) return null
    return data as Record<string, RawSessionStatus>
  } catch {
    return null
  }
}

/** Project a raw `type` string onto the recognised kinds; unrecognised ⇒ null. */
function asKind(type: string | undefined): SessionStatusKind | null {
  return type === "busy" || type === "idle" || type === "retry" ? type : null
}

/**
 * Build the `sessionID → SessionStatusKind` map for the current poll tick.
 *
 * ONE global HTTP call (all sessions at once). Only sessions the server
 * actually reported land in the returned map — and per the active-only finding,
 * that is in practice the busy/retry set (idle sessions are omitted). A session
 * absent from the result is "unknown", which the renderer treats as no badge
 * (never a synthesised "idle"). Backend unconfigured / read fails / malformed ⇒
 * empty map (graceful degradation, never a crash — SNG-046 unknown ≠ empty).
 */
export async function loadSessionStatus(
  config: BoardConfig,
): Promise<Record<string, SessionStatusKind>> {
  const raw = await fetchStatusMap(config)
  const out: Record<string, SessionStatusKind> = {}
  if (!raw) return out
  for (const [sid, val] of Object.entries(raw)) {
    if (!sid) continue
    const kind = asKind(val?.type)
    if (kind) out[sid] = kind
  }
  return out
}
