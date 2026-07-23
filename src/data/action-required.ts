/**
 * Action-required detection (WI-043): surface, on the board, which sessions are
 * blocked waiting on the USER — a pending question needing an answer, or a
 * command/permission needing approval.
 *
 * ── NODE-ONLY — never import from render.ts (I-192 bundle boundary) ──────────
 * This module does network I/O (raw HTTP to the opencode server). It must NEVER
 * be pulled into the browser bundle. render.ts consumes ONLY the pure
 * `ActionRequired` VALUES this produces (off BoardState) and may `import type`
 * the interfaces here (types are erased by the bundler — same idiom render.ts
 * already uses for WorkItem/SessionMirror).
 *
 * ── Why direct polling, not a plugin relay (design decision, user-approved) ──
 * The running opencode server already exposes pending prompts across ALL
 * sessions via two GLOBAL v2 endpoints — so this is TWO HTTP calls per poll
 * tick, not per-session, and needs NO plugin changes / no persist-to-disk
 * relay:
 *   GET /permission → Array<PermissionRequest>  { id, sessionID, permission,
 *                     patterns[], metadata, always[], tool? }
 *   GET /question   → Array<QuestionRequest>    { id, sessionID,
 *                     questions: QuestionInfo[] { question, header, options[] } }
 * Both verified against the installed SDK @opencode-ai/sdk v1.17.18 v2 gen
 * (dist/v2/gen/{sdk,types}.gen — url:"/permission" & "/question", both GET,
 * both accept ?directory=, 200 ⇒ the arrays above). These are the AUTHORITATIVE
 * "waiting for input" signal: session status idle/busy CANNOT distinguish
 * idle-waiting-for-input from idle-done, so we never infer from it.
 *
 * ── Freshness: PER-REQUEST, never through the frozen mirror (I-187) ──────────
 * This flag is time-sensitive: it must APPEAR when a prompt is pending and CLEAR
 * on the next poll once it's answered. It therefore rides the per-request board
 * assembly (like todoSubStates), NOT the bootstrap-only sessionMirror, which is
 * computed once at startup and never refreshed — routing a live flag through it
 * would ghost/go-stale (I-187).
 *
 * ── Read-only (I-148/I-179) ─────────────────────────────────────────────────
 * The board only SURFACES that action is needed. It never approves/answers from
 * here — no reply/reject call. The /permission/{id}/reply & /question/{id}/reply
 * write endpoints exist in the SDK but are deliberately NOT used.
 */
import type { BoardConfig } from "../config"

/**
 * The per-session action-required state. Both flags default false; a session id
 * only appears in the map when at least one is true (see loadActionRequired).
 */
export interface ActionRequired {
  /** A command/permission prompt is pending approval for this session. */
  awaitingPermission: boolean
  /** A question is pending an answer for this session. */
  awaitingQuestion: boolean
  /** Count of pending permission requests (for a tooltip / at-a-glance). */
  permissionCount: number
  /** Count of pending question requests. */
  questionCount: number
  /**
   * Short header text of the FIRST pending question (QuestionInfo.header, "very
   * short label (max 30 chars)" per the SDK) — powers a tooltip so the user can
   * see what's being asked without leaving the board. Empty when none/unknown.
   */
  questionHeader: string
}

/** Raw shape of `GET /permission` items (only the fields we read). */
interface RawPermissionRequest {
  sessionID?: string
  permission?: string
}

/** Raw shape of `GET /question` items (only the fields we read). */
interface RawQuestionInfo {
  header?: string
  question?: string
}
interface RawQuestionRequest {
  sessionID?: string
  questions?: RawQuestionInfo[]
}

/**
 * Fetch one global list endpoint over raw HTTP, mirroring todos.ts exactly:
 * Basic auth (username literally "opencode" — Q14), directory-scoped to the
 * workspace root, and null-degradation on ANY failure (unconfigured backend,
 * network error, non-200, malformed body). null means "couldn't read" (unknown
 * ≠ empty) — the caller treats it as "no indicators this tick", never a throw.
 */
async function fetchList<T>(config: BoardConfig, endpointPath: string): Promise<T[] | null> {
  if (!config.opencodeUrl || !config.opencodePassword) return null
  const auth = "Basic " + Buffer.from(`opencode:${config.opencodePassword}`).toString("base64")
  const dirQ = `?directory=${encodeURIComponent(config.workspaceRoot)}`
  const url = `${config.opencodeUrl}${endpointPath}${dirQ}`
  try {
    const res = await fetch(url, { headers: { Authorization: auth } })
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    if (!Array.isArray(data)) return null
    return data as T[]
  } catch {
    return null
  }
}

/**
 * Build the `sessionID → ActionRequired` map for the current poll tick.
 *
 * Two global HTTP calls total (permissions + questions across all sessions),
 * run concurrently. A session id is present in the returned map ONLY when it
 * has at least one pending prompt — so `map[sessionId]` is naturally falsy for
 * the common (unblocked) case and the renderer can treat absence as "no action
 * required". Backend unconfigured / both reads fail ⇒ empty map (no indicators;
 * graceful degradation, never a crash — SNG-046 unknown ≠ empty).
 */
export async function loadActionRequired(
  config: BoardConfig,
): Promise<Record<string, ActionRequired>> {
  const [permissions, questions] = await Promise.all([
    fetchList<RawPermissionRequest>(config, "/permission"),
    fetchList<RawQuestionRequest>(config, "/question"),
  ])

  const out: Record<string, ActionRequired> = {}

  /** Lazily create the entry for a session so absent = unblocked stays true. */
  const entryFor = (sessionId: string): ActionRequired => {
    let e = out[sessionId]
    if (!e) {
      e = {
        awaitingPermission: false,
        awaitingQuestion: false,
        permissionCount: 0,
        questionCount: 0,
        questionHeader: "",
      }
      out[sessionId] = e
    }
    return e
  }

  for (const p of permissions ?? []) {
    const sid = p.sessionID
    if (!sid) continue
    const e = entryFor(sid)
    e.awaitingPermission = true
    e.permissionCount++
  }

  for (const q of questions ?? []) {
    const sid = q.sessionID
    if (!sid) continue
    const e = entryFor(sid)
    e.awaitingQuestion = true
    const infos = Array.isArray(q.questions) ? q.questions : []
    e.questionCount += infos.length > 0 ? infos.length : 1
    // First non-empty header wins the tooltip; fall back to the full question.
    if (!e.questionHeader) {
      const first = infos[0]
      e.questionHeader = String(first?.header ?? first?.question ?? "").slice(0, 60)
    }
  }

  return out
}
