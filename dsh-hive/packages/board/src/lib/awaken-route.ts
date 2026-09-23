/**
 * WI-064 spike — POST /api/hive-board/awaken (host-half, dependency-injected).
 *
 * The board-tab awaken seam studied in scratch/dsh-migration/wi-064-session-creation-findings.md:
 * create a REAL dsh session through the same core machinery the browser's
 * "new chat" button uses, then complete the HIVE flip by executing the
 * deployment's own /awaken human-command on the new agent. The subagent seam
 * (subagents.start/startContinuable) is deliberately NOT involved — this is
 * the top-level chain:
 *
 *   session/create  ⇢ typertGateway.invoke({namespace:'session', method:'create'})
 *                     The controller mints the id, composes the preset
 *                     (agentPresets.resolve + presets.mount inside the create
 *                     setup — BEFORE publication), ensures the cwd, guards
 *                     adopt/resume/subagent-ownership, and announces via the
 *                     vetoable session/created + serial agent/created edges.
 *                     Served identically to the web UI's own path.
 *   first message   ⇢ typertGateway.invoke({namespace:'session', method:'prompt'})
 *                     The controller admits and plants it (agent.followup —
 *                     mode 'queue') with requestId idempotence — the exact
 *                     call the web UI makes for its first turn. Queues BEHIND
 *                     the flip's own awaken brief when both are requested.
 *   /awaken flip    ⇢ commands.find(agent,'awaken') + commands.execute(agent,
 *                     '/awaken <input>') — the ONLY code path that writes the
 *                     HIVE registry + doctrine + the turn-scoped summary tool
 *                     (the dormant gate keys on that registry; an agentPreset
 *                     cannot pre-awaken — verified in @hive/dsh-evolution).
 *
 * TESTABILITY CONTRACT: the handler is a pure dependency-injected factory
 * (AwakenDeps). Unit tests drive it with fake agents/presets/commands/
 * gateway services — no cordis, no boot, no network, no model. The Board
 * service (src/index.ts) wires the real services through ONE combined
 * ctx.registry.inject WAIT — top level, never nested (W-096) — and registers
 * the route ONLY when the deployment composes `awaken: true` (opt-in, default
 * false): the route creates real sessions and, unauthenticated on plugin
 * routes by design (board-tab contract §5), the exposure question stays a
 * USER decision (§5 re-ratification), never a default.
 *
 * Error discipline (W-049): every failure path returns a specific, actionable
 * message naming what happened and what to do next; no bare String(err).
 */

import { randomUUID } from "node:crypto"

// ── structural seams (W-044 discipline: this package never imports the
//    framework's web/typert/commands typings — the shapes below are the
//    minimal structural slices those services actually expose) ───────────────

/** The typert gateway's in-process invoke seam (service key `typertGateway`). */
export interface AwakenGatewayLike {
  invoke(request: {
    namespace: string
    method: string
    args: Readonly<Record<string, unknown>>
  }): Promise<unknown>
}

/** The live agents registry (service key `agents`) — lookup only, never mutated. */
export interface AwakenAgentsLike {
  get(id: string): unknown
}

/** The human-command registry (service key `commands`) — find + execute. */
export interface AwakenCommandsLike {
  find(agent: unknown, name: string): { readonly name: string } | undefined
  execute(
    agent: unknown,
    line: string,
    submittedAttachments: readonly unknown[],
    signal: AbortSignal,
  ): Promise<{ result: { kind: "success" | "error"; text?: string } } | undefined>
}

/** The agent-preset registry (service key `agentPresets`) — early validation only. */
export interface AwakenPresetsLike {
  resolve(id?: string): Promise<{ id: string } & Record<string, unknown>>
}

/** The board's own item reader (board-store.readItem bound to the service directory). */
export type AwakenItemLoader = (id: string) => { id: string; title: string } | null

/** Minimal IncomingMessage slice (node:http request under the webServer route). */
export interface AwakenRequestLike {
  method?: unknown
  on(event: string, listener: (chunk?: unknown) => void): unknown
  /** Lowercased header bag, as node:http hands it. Absent on old callers = absent headers. */
  headers?: Record<string, string | string[] | undefined>
}

/** Minimal ServerResponse slice (matches the board service's WebLikeResponse). */
export interface AwakenResponseLike {
  writeHead(code: number, headers: Record<string, string>): unknown
  end(chunk: string): unknown
}

/**
 * The connection trust fence (service key `connection`, method
 * `requestRejection`) — the SAME belt the typert gateway's WebSocket upgrade
 * runs. Returns a rejection value when the request's surface is untrusted,
 * undefined when it admits. Plugin routes carry no other auth by design
 * (board-tab contract §5), so this is depth, never the primary gate.
 */
export type AwakenConnectionTrust = (req: AwakenRequestLike) => unknown

/** Everything the handler needs; Board wires the real services, tests the fakes. */
export interface AwakenDeps {
  /** The workspace root (the dir containing `.opencode/`) created sessions start in. */
  directory: string
  gateway: AwakenGatewayLike
  agents: AwakenAgentsLike
  commands: AwakenCommandsLike
  presets: AwakenPresetsLike
  /** board-store.readItem bound to the same workspace root. */
  loadItem: AwakenItemLoader
  /**
   * ORIGIN GUARD (WI-064 final-push decision, 2026-10): browsers send an
   * `Origin` on cross-site and same-origin POSTs alike; non-browser clients
   * (curl/CLI) send none. Requests WITHOUT Origin pass (nothing to forge);
   * requests WITH Origin must be exact same-origin against the request's own
   * Host header (true through any passthrough relay) AND admitted by the
   * connection trust fence when one is wired. Mismatches get a typed 403
   * BEFORE any board lookup, session creation, or flip — nothing happened,
   * nothing to undo (W-049).
   */
  connectionTrust?: AwakenConnectionTrust
  /** Test seams — production code never passes these. */
  mintSessionId?: () => string
  mintRequestId?: () => string
  /** Test seam — production uses readPostBody. */
  readBody?: (req: AwakenRequestLike, maxBytes: number) => Promise<string>
  log?: (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => void
}

/** POST body contract (all fields optional; unknown fields are ignored). */
export interface AwakenRequestPayload {
  /** Existing work item to reference in the awaken input (validated against the board). */
  itemId?: string
  /** Agent preset id to compose the session with (default: the deployment's default). */
  preset?: string
  /** Free-text awaken input — becomes the /awaken hint and the auto-registered item title. */
  hint?: string
  /** First user message to plant via session/prompt AFTER the flip settles. */
  firstMessage?: string
}

/** A settled handler outcome — never a throw; status + payload speak for it. */
export interface AwakenOutcome {
  status: number
  payload: unknown
}

/** Route constants — the one place they live (tests + wiring import these). */
export const AWAKEN_ROUTE_PATH = "/api/hive-board/awaken"
export const AWAKEN_BODY_MAX_BYTES = 64 * 1024
export const AWAKEN_HINT_MAX_CHARS = 2_000
export const AWAKEN_FIRST_MESSAGE_MAX_CHARS = 8_000

/** Read a POST body as text with a hard cap (production reader; tests may inject one). */
export function readPostBody(req: AwakenRequestLike, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    req.on("data", (chunk?: unknown) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ""))
      total += buf.length
      if (total > maxBytes) {
        finish(() => reject(new Error(`body exceeds ${maxBytes} bytes`)))
        return
      }
      chunks.push(buf)
    })
    req.on("end", () => finish(() => resolve(Buffer.concat(chunks).toString("utf8"))))
    req.on("error", (err?: unknown) => finish(() => reject(err instanceof Error ? err : new Error(String(err)))))
  })
}

/**
 * Classify a failure into (status, code, message). Remote-shaped errors
 * (structurally: a `code` string) keep their code; the wire codes the
 * session controller documents on the create path map to their HTTP class —
 * gateway/bad-request → 400, workspace/not-found → 404, the two conflict
 * codes → 409, everything else 500. Anything with no `code` is a 500 with
 * the raw message — never swallowed silently.
 */
export function classifyAwakenFailure(error: unknown): { status: number; code: string | undefined; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  const code = typeof (error as { code?: unknown })?.code === "string" ? ((error as { code: string }).code) : undefined
  if (code === "gateway/bad-request") return { status: 400, code, message }
  if (code === "workspace/not-found") return { status: 404, code, message }
  if (code === "session/conflict" || code === "agent-preset/conflict") return { status: 409, code, message }
  return { status: 500, code, message }
}

function respond(res: AwakenResponseLike, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  res.end(JSON.stringify(payload))
}

/**
 * Build the /awaken route handler. Single code path with the unit tests: the
 * Board service constructs this ONCE per plugin instance from the captured
 * services; tests construct it with fakes.
 */
export function createAwakenRouteHandler(deps: AwakenDeps) {
  const mintSessionId = deps.mintSessionId ?? (() => `session-${randomUUID()}`)
  const mintRequestId = deps.mintRequestId ?? (() => randomUUID())
  const log = deps.log ?? (() => {})
  const readBody = deps.readBody ?? ((req, maxBytes) => readPostBody(req, maxBytes))

  return async function awakenHandler(req: AwakenRequestLike, res: AwakenResponseLike): Promise<void> {
    const generated = nowIso()
    // Method gate: exact-kind routes match ANY method — answer non-POST by name.
    if (String(req?.method ?? "GET").toUpperCase() !== "POST") {
      respond(res, 405, { ok: false, error: `${AWAKEN_ROUTE_PATH} answers POST only (creates a real session — GET is never safe here)`, generated })
      return
    }

    // ── ORIGIN GUARD (before ANY service call, lookup, or creation) ──────────
    // No Origin header ⇒ not a browser submission — allow (curl/CLI flows).
    // An Origin ⇒ must be exact same-origin with the request's Host header
    // (holds true through the plain TCP relay) AND admitted by the connection
    // trust fence when wired. Anything else is a typed 403 naming the origin
    // and the expected surface — before the board store is even read (W-049).
    const origin = headerValue(req, "origin")
    if (origin !== undefined) {
      const hostHeader = headerValue(req, "host") ?? ""
      let sameOrigin = false
      try {
        sameOrigin = new URL(origin).host === hostHeader && hostHeader !== ""
      } catch {
        sameOrigin = false
      }
      let rejectedByFence: unknown
      if (sameOrigin && deps.connectionTrust) {
        try {
          rejectedByFence = deps.connectionTrust(req)
        } catch {
          rejectedByFence = "trust fence threw"
        }
      }
      if (!sameOrigin || rejectedByFence !== undefined) {
        log("warn", "[board] awaken route: origin refused", { origin, hostHeader, sameOrigin, fence: rejectedByFence !== undefined })
        respond(res, 403, {
          ok: false,
          error:
            `refused: cross-site Origin "${origin}" (expected the exact same web origin${hostHeader ? ` "${hostHeader}"` : ""}). ` +
            `Use the board tab served by this dsh instance, or a non-browser client (curl/CLI, no Origin header). ` +
            `Nothing was read from the board, nothing was created, nothing was flipped.`,
          code: "hvb-board/cross-origin",
          origin,
          generated,
        })
        return
      }
    }

    // Body: cap + parse. A malformed body is the caller's error (400), not a crash.
    let body: AwakenRequestPayload
    try {
      const text = await readBody(req, AWAKEN_BODY_MAX_BYTES)
      const parsed: unknown = text.trim() === "" ? {} : JSON.parse(text)
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("body must be a JSON object")
      }
      body = parsed as AwakenRequestPayload
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      respond(res, message.includes("exceeds") ? 413 : 400, {
        ok: false,
        error: `unreadable request body: ${message}. POST a JSON object: {"itemId?","preset?","hint?","firstMessage?"}.`,
        generated,
      })
      return
    }

    // Field validation BY NAME, bounded (spec-shape discipline like item ids).
    const itemId = stringField(body.itemId)
    const preset = stringField(body.preset)
    const hint = stringField(body.hint)
    const firstMessage = stringField(body.firstMessage)
    if (hint && hint.length > AWAKEN_HINT_MAX_CHARS) {
      respond(res, 400, { ok: false, error: `hint exceeds ${AWAKEN_HINT_MAX_CHARS} chars — shorten it or drive the session directly`, generated })
      return
    }
    if (firstMessage && firstMessage.length > AWAKEN_FIRST_MESSAGE_MAX_CHARS) {
      respond(res, 400, { ok: false, error: `firstMessage exceeds ${AWAKEN_FIRST_MESSAGE_MAX_CHARS} chars — shorten it or steer later in the session`, generated })
      return
    }

    // Board lookup FIRST: an unknown itemId must fail before any real
    // session exists (no orphan session for a typo'd reference).
    let item: { id: string; title: string } | null = null
    if (itemId) {
      try {
        item = deps.loadItem(itemId)
      } catch (e) {
        log("warn", "[board] awaken route: item lookup threw", { itemId, error: String((e as Error)?.message ?? e) })
        item = null
      }
      if (!item) {
        respond(res, 404, {
          ok: false,
          error: `no such work item on this board — resolve the id first (hive_board_list / GET /api/hive-board/index). Nothing was created.`,
          missing: [itemId],
          generated,
        })
        return
      }
    }

    // Preset validation EARLY: an unknown preset must fail before create.
    let resolvedPresetId: string | undefined
    if (preset) {
      try {
        const resolved = await deps.presets.resolve(preset)
        resolvedPresetId = String(resolved?.id ?? "")
        if (!resolvedPresetId) throw new Error("preset resolved to an empty id")
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        respond(res, 400, {
          ok: false,
          error: `unknown agent preset "${preset}": ${message} — list presets via agentPresets or omit "preset" for the deployment default`,
          generated,
        })
        return
      }
    }

    // ── 1. session/create through the same controller the web UI drives ──────
    // The caller-supplied sessionId is deliberately NOT offered: server-minted
    // ids avoid adopting-or-resuming an unrelated persisted twin (the
    // controller's checkPersistedIdentity path) — awaken always means a NEW
    // session here.
    // WIRE SHAPE (captured live 2026-09-20): gateway invoke args are the
    // METHOD's NAMED parameters — the controller's create(request) takes one
    // object ⇒ args = { request: { cwd, agentPreset? } }. Flattened fields
    // fail the decode with gateway/arguments-invalid (typed, actionable).
    const requestBody: Record<string, unknown> = { cwd: deps.directory }
    // agentPreset rides only when requested; omitted ⇒ the deployment default
    // (the controller resolves it — the same resolution as the browser's new chat).
    if (resolvedPresetId) requestBody.agentPreset = resolvedPresetId
    let createValue: { sessionId?: unknown; agentPreset?: unknown }
    try {
      createValue = (await deps.gateway.invoke({
        namespace: "session",
        method: "create",
        args: { request: requestBody },
      })) as { sessionId?: unknown; agentPreset?: unknown }
    } catch (e) {
      const { status, code, message } = classifyAwakenFailure(e)
      log(status >= 500 ? "error" : "warn", "[board] awaken route: session/create failed", { code, status, message })
      respond(res, status, {
        ok: false,
        error: message,
        code,
        note: "session creation failed — nothing was created, nothing was flipped",
        generated,
      })
      return
    }
    if (typeof createValue?.sessionId !== "string" || !createValue.sessionId) {
      respond(res, 500, {
        ok: false,
        error: `session/create returned no sessionId (shape fault: ${JSON.stringify(createValue)}) — report this to the host owner`,
        generated,
      })
      return
    }
    const sessionId = createValue.sessionId

    // ── 2. the /awaken flip — the deployment's own command, on the new agent ──
    // The dormant gate keys on the HIVE registry only this flip writes, so the
    // raw input (itemId + hint, one line — it also titles the auto-registered
    // session-first item) is passed verbatim; no reinterpretation here.
    const awakenInputParts = [item ? item.id : "", hint ?? ""].filter((part) => part.length > 0)
    const awakenInput = awakenInputParts.join(" — ")
    const line = awakenInput.length > 0 ? `/awaken ${awakenInput}` : "/awaken"
    let awakened: { commanded: boolean; ok: boolean; text: string }
    try {
      const agent = deps.agents.get(sessionId)
      if (agent === undefined || agent === null) {
        // Rollback honesty: create is rollback-covered, so an absent agent right
        // after create is a state fault, not a flip failure — surface it.
        respond(res, 500, {
          ok: false,
          sessionId,
          error: `session "${sessionId}" was created but is not in the agents registry — a rollback or teardown won between the two calls; retry the awaken (no cleanup needed; the session is already gone)`,
          generated,
        })
        return
      }
      const definition = deps.commands.find(agent, "awaken")
      if (definition === undefined) {
        // Partial success, stated (W-049): the session EXISTS; the flip does not.
        awakened = {
          commanded: false,
          ok: false,
          text:
            "/awaken is not registered on this deployment (the HIVE evolution plugin is absent or disabled) — " +
            "the session was created but stays DORMANT: open it and run /awaken from its composer, or enable evolution.",
        }
      } else {
        const execution = await deps.commands.execute(agent, line, [], AbortSignal.timeout(60_000))
        const result = execution?.result
        if (!result) {
          awakened = {
            commanded: true,
            ok: false,
            text:
              "/awaken did not resolve (execute returned undefined — parse failure or unknown name at the runtime). " +
              "The session exists and stays DORMANT: run /awaken manually from its composer.",
          }
        } else if (result.kind === "error") {
          awakened = {
            commanded: true,
            ok: false,
            text: `the /awaken flip failed in the command handler: ${result.text ?? "(no text)"} — the session exists but stays DORMANT; read its composer and retry /awaken there.`,
          }
        } else {
          awakened = { commanded: true, ok: true, text: result.text ?? "/awaken flip succeeded (no outcome text returned)." }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      log("warn", "[board] awaken route: flip threw", { sessionId, error: message })
      awakened = {
        commanded: true,
        ok: false,
        text: `the /awaken flip threw: ${message} — the session exists; check its composer and run /awaken manually if needed.`,
      }
    }

    // ── 3. plant the first message AFTER the flip (queuing order) ─────────────
    // session/prompt with a client-minted requestId — the controller's own
    // admission (content validation, requestId idempotence, followup with
    // 'queue' mode). The flip's awaken brief is the FIRST model-visible
    // message; a planted firstMessage queues behind it (deterministic order).
    let planted: { requested: boolean; ok: boolean; error?: string } | undefined
    if (firstMessage) {
      planted = { requested: true, ok: false }
      try {
        await deps.gateway.invoke({
          namespace: "session",
          method: "prompt",
          args: {
            request: {
              sessionId,
              requestId: mintRequestId(),
              mode: "queue",
              content: [{ type: "text", text: firstMessage }],
            },
          },
        })
        planted.ok = true
      } catch (e) {
        const { status: _s, code, message } = classifyAwakenFailure(e)
        planted.error =
          `session/prompt failed${code ? ` (${code})` : ""}: ${message} — the session exists and the flip outcome above still stands; plant the message from the session composer instead.`
        log("warn", "[board] awaken route: first-message plant failed", { sessionId, error: message })
      }
    }

    log("info", "[board] awaken route: session created", { sessionId, preset: resolvedPresetId ?? null, item: item?.id ?? null, flipOk: awakened.ok })

    respond(res, 200, {
      ok: true as const,
      generated,
      sessionId,
      preset: (typeof createValue.agentPreset === "string" && createValue.agentPreset) || resolvedPresetId || null,
      cwd: deps.directory,
      item: item ?? null,
      awakened,
      ...(planted ? { planted } : {}),
    })
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

/** First header value, tolerant of node:http's string and string[] bags. */
function headerValue(req: AwakenRequestLike, lowerCased: string): string | undefined {
  const raw = req?.headers?.[lowerCased]
  if (typeof raw === "string" && raw !== "") return raw
  if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0] !== "") return raw[0]
  return undefined
}

function nowIso(): string {
  return new Date().toISOString()
}
