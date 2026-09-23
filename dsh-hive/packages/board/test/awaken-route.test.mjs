// WI-064 spike — POST /api/hive-board/awaken, direct API tests:
//   1. HANDLER-DRIVEN fakes (no cordis, no boot, no network, no model): the
//      full chain board lookup → preset resolve → session/create (via the
//      typert gateway) → /awaken flip (via commands) → first-message plant
//      (via session/prompt), with exact call-order and failure-shape asserts.
//   2. The OPT-IN flag: awaken:true must register the route on a provided
//      fake webServer (`exact`, POST); the default must NOT — while the
//      read-only index/item routes still register (the flag isolates).
// HARD RULE: the live store at /workspace/.opencode/board is NEVER written —
// handler tests use a synthetic empty directory; nothing here creates real
// sessions (the gateway/agents/commands are fakes).
import { Context } from "@deepseek-ai/cordis"
import Board from "@hive/dsh-board"
import { AWAKEN_ROUTE_PATH, AWAKEN_BODY_MAX_BYTES, createAwakenRouteHandler, readPostBody } from "@hive/dsh-board/lib/awaken-route"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import test from "node:test"

// ── 1. handler-driven fakes ───────────────────────────────────────────────────

/** Recorder services mirroring the structural seams the handler consumes. */
function fakeServices({
  sessionId = "session-test-1",
  presetEcho = "preset-a",
  presetOk = true,
  agentAfterCreate = true,
  commandFound = true,
  executeResult = { kind: "success", text: "Board: registered work item WI-999 — flipped." },
  createError,
} = {}) {
  const calls = []
  const gateway = {
    invoke: async (request) => {
      calls.push(["invoke", request.namespace, request.method, request.args])
      if (request.namespace === "session" && request.method === "create") {
        if (createError) throw createError
        return { sessionId, agentPreset: presetEcho }
      }
      if (request.namespace === "session" && request.method === "prompt") return { accepted: true }
      return {}
    },
  }
  const agents = { get: (id) => (agentAfterCreate ? { __fake: "agent", id } : undefined) }
  const commands = {
    find: (_agent, name) => (commandFound ? { name } : undefined),
    execute: async (agent, line, attachments, signal) => {
      calls.push(["execute", agent?.id, line, attachments.length, String(signal)])
      if (executeResult === "throw") throw new Error("flip boom")
      if (executeResult === "no-result") return undefined
      return { result: executeResult ?? { kind: "success", text: "Board: registered work item WI-999 — flipped." } }
    },
  }
  const presets = {
    resolve: async (id) => {
      calls.push(["resolve", id])
      if (!presetOk) throw new Error("no such preset")
      return { id: id ? id : "standard" }
    },
  }
  return { gateway, agents, commands, presets, calls }
}

const synthDir = fs.mkdtempSync(path.join(os.tmpdir(), "awaken-route-"))

function buildHandler(services, overrides = {}) {
  return createAwakenRouteHandler({
    directory: synthDir,
    loadItem: (id) => (id === "WI-012" ? { id: "WI-012", title: "existing item" } : null),
    ...services,
    mintRequestId: () => "req-fixed-1",
    ...overrides,
  })
}

async function fire(handler, { method = "POST", body, readBody, headers } = {}) {
  const req = {
    method,
    headers,
    on(event, listener) {
      if (event === "end") queueMicrotask(listener)
      if (event === "data" && body !== undefined) queueMicrotask(() => listener(Buffer.from(String(body))))
    },
  }
  const out = { status: null, headers: null, chunks: [] }
  const res = {
    writeHead(code, headers) {
      out.status = code
      out.headers = headers
    },
    end(chunk) {
      out.chunks.push(chunk)
    },
  }
  await handler(req, res)
  return {
    status: out.status,
    headers: out.headers,
    json: out.chunks.length > 0 ? JSON.parse(out.chunks.join("")) : null,
  }
}

const bodyReaderFor = (payload) => ((_req, _max) => Promise.resolve(payload === undefined ? "" : JSON.stringify(payload)))

// ── happy path ────────────────────────────────────────────────────────────────

test("awaken handler — happy path: resolve → create → flip → plant, exact order and shapes", async () => {
  const services = fakeServices()
  const handler = buildHandler(services, { readBody: bodyReaderFor({ itemId: "WI-012", preset: "preset-a", hint: "fix the widget", firstMessage: "start now" }) })
  const r = await fire(handler, { body: "{}" })
  assert.equal(r.status, 200)
  assert.equal(r.headers["content-type"], "application/json; charset=utf-8")
  assert.equal(r.headers["cache-control"], "no-store")
  const body = r.json
  assert.equal(body.ok, true)
  assert.equal(body.sessionId, "session-test-1")
  assert.equal(body.preset, "preset-a")
  assert.equal(body.cwd, synthDir)
  assert.deepEqual(body.item, { id: "WI-012", title: "existing item" })
  assert.deepEqual(body.awakened, { commanded: true, ok: true, text: "Board: registered work item WI-999 — flipped." })
  assert.deepEqual(body.planted, { requested: true, ok: true })

  // exact call order: preset resolve (early validation) → create → flip → plant
  assert.deepEqual(
    services.calls.map(([kind, a, b]) => [kind, a ?? null, b ?? null]),
    [
      ["resolve", "preset-a", null],
      ["invoke", "session", "create"],
      ["execute", "session-test-1", "/awaken WI-012 — fix the widget"],
      ["invoke", "session", "prompt"],
    ],
  )

  // create wire shape (captured live 2026-09-20): the descriptor's ONE named
  // parameter `request` wraps the body — flattened fields fail the gateway
  // decode with gateway/arguments-invalid (typed, actionable).
  assert.deepEqual(Object.keys(services.calls[1][3]), ["request"], "invoke args use the method's named parameter `request`")
  const createArgs = services.calls[1][3].request
  assert.equal(createArgs.cwd, synthDir)
  assert.equal(createArgs.agentPreset, "preset-a")
  assert.ok(!("sessionId" in createArgs), "the handler must NOT pass a caller-supplied sessionId")

  // flip line: item + hint, one line, fed verbatim to /awaken (it titles the
  // auto-registered session-first item)
  assert.equal(services.calls[2][2], "/awaken WI-012 — fix the widget")
  assert.equal(services.calls[2][3], 0, "no submitted attachments")
  assert.match(services.calls[2][4], /AbortSignal/, "execute carries a cancellation signal")

  // plant: server-side prompt with the minted requestId, queue mode, text block
  assert.deepEqual(Object.keys(services.calls[3][3]), ["request"], "prompt invoke args nest under `request` too")
  const promptArgs = services.calls[3][3].request
  assert.equal(promptArgs.sessionId, "session-test-1")
  assert.equal(promptArgs.requestId, "req-fixed-1")
  assert.equal(promptArgs.mode, "queue")
  assert.deepEqual(promptArgs.content, [{ type: "text", text: "start now" }])
})

test("awaken handler — omitted preset/firstMessage/itemId: create rides cwd only (deployment default), no flip input decoration, no plant", async () => {
  const services = fakeServices()
  const handler = buildHandler(services, { readBody: bodyReaderFor({}) })
  const r = await fire(handler, { body: "{}" })
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
  assert.equal(r.json.preset, "preset-a", "the controller echoes the resolved deployment default preset")
  assert.ok(!("planted" in r.json), "no firstMessage ⇒ no planted field at all")
  assert.equal(services.calls.length, 2, "flip + create only")
  assert.deepEqual(services.calls.map((c) => c[0]), ["invoke", "execute"])
  const createArgs = services.calls[0][3].request
  assert.deepEqual(Object.keys(createArgs), ["cwd"], "omitted preset must not send an agentPreset key at all")
  assert.equal(services.calls[1][2], "/awaken", "no itemId and no hint ⇒ bare /awaken line")
})

// ── validation and failure mapping ────────────────────────────────────────────

test("awaken handler — GET/PUT answer 405 with the POST-only guidance, before anything else", async () => {
  for (const method of ["GET", "PUT", "DELETE"]) {
    const services = fakeServices()
    const handler = buildHandler(services)
    const r = await fire(handler, { method })
    assert.equal(r.status, 405)
    assert.equal(r.json.ok, false)
    assert.match(r.json.error, /POST only/)
    assert.equal(services.calls.length, 0, "no service call before the method gate")
  }
})

test("awaken handler — malformed body 400, oversize 413, unknown itemId 404 — all before create", async () => {
  // malformed JSON
  let services = fakeServices()
  let handler = buildHandler(services, { readBody: () => Promise.resolve("{not json") })
  let r = await fire(handler)
  assert.equal(r.status, 400)
  assert.match(r.json.error, /unreadable request body/)
  assert.equal(services.calls.length, 0)

  // oversize (readBody throws the same phrase the production reader throws)
  services = fakeServices()
  handler = buildHandler(services, { readBody: () => Promise.reject(new Error(`body exceeds ${AWAKEN_BODY_MAX_BYTES} bytes`)) })
  r = await fire(handler)
  assert.equal(r.status, 413)
  assert.match(r.json.error, /body exceeds/)
  assert.equal(services.calls.length, 0)

  // unknown itemId → 404 with missing[], nothing created
  services = fakeServices()
  handler = buildHandler(services, { readBody: bodyReaderFor({ itemId: "WI-404" }) })
  r = await fire(handler, { body: "{}" })
  assert.equal(r.status, 404)
  assert.equal(r.json.ok, false)
  assert.deepEqual(r.json.missing, ["WI-404"])
  assert.match(r.json.error, /no such work item/)
  assert.equal(services.calls.length, 0)
})

test("awaken handler — unknown preset fails EARLY (400) without creating anything", async () => {
  const services = fakeServices({ presetOk: false })
  const handler = buildHandler(services, { readBody: bodyReaderFor({ preset: "nope" }) })
  const r = await fire(handler, { body: "{}" })
  assert.equal(r.status, 400)
  assert.equal(r.json.ok, false)
  assert.match(r.json.error, /unknown agent preset "nope"/)
  assert.equal(services.calls.length, 1, "resolve ran, create did not")
  assert.equal(services.calls[0][0], "resolve")
})

test("awaken handler — create failure carries the controller's typed code with the mapped status", async () => {
  const cases = [
    [{ code: "gateway/bad-request", message: "session.create accepts workspaceId or cwd, not both" }, 400],
    [{ code: "session/conflict", message: "cwd conflict" }, 409],
    [{ code: "agent-preset/conflict", message: "preset conflict" }, 409],
    [{ code: "session/workspace-attach-failed", message: "attached but no workspace" }, 500],
    [{ code: "session/not-found", message: "vanished" }, 500],
    [new Error("plain boom"), 500],
  ]
  for (const [err, expectedStatus] of cases) {
    const services = fakeServices({ createError: err })
    const handler = buildHandler(services, { readBody: bodyReaderFor({}) })
    const r = await fire(handler, { body: "{}" })
    assert.equal(r.status, expectedStatus, `status for ${err.code ?? "plain error"}`)
    assert.equal(r.json.ok, false)
    assert.equal(r.json.code, err.code, "the typed code rides through verbatim when present")
    assert.equal(typeof r.json.error, "string")
    assert.match(r.json.note, /nothing was created, nothing was flipped/)
  }
})

test("awaken handler — create shape fault (no sessionId) is an honest 500", async () => {
  const services = fakeServices({ sessionId: "" })
  const handler = buildHandler(services, { readBody: bodyReaderFor({}) })
  const r = await fire(handler, { body: "{}" })
  assert.equal(r.status, 500)
  assert.match(r.json.error, /returned no sessionId/)
})

test("awaken handler — agent vanished between create and registry lookup: 500, honest, sessionId echoed", async () => {
  const services = fakeServices({ agentAfterCreate: false })
  const handler = buildHandler(services, { readBody: bodyReaderFor({}) })
  const r = await fire(handler, { body: "{}" })
  assert.equal(r.status, 500)
  assert.equal(r.json.sessionId, "session-test-1")
  assert.match(r.json.error, /not in the agents registry/)
  assert.match(r.json.error, /rollback/)
})

// ── flip outcomes (partial success is STATED, never silent — W-049) ──────────

test("awaken handler — /awaken command absent: ok:true with commanded:false and the actionable text", async () => {
  const services = fakeServices({ commandFound: false })
  const handler = buildHandler(services, { readBody: bodyReaderFor({ firstMessage: "hi" }) })
  const r = await fire(handler, { body: "{}" })
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true, "session creation SUCCEEDED — the flip gap is reported inside, not as a failure")
  assert.equal(r.json.awakened.commanded, false)
  assert.equal(r.json.awakened.ok, false)
  assert.match(r.json.awakened.text, /not registered/)
  assert.match(r.json.awakened.text, /DORMANT/)
  assert.equal(r.json.planted.ok, true, "planting still runs for a session that exists")
})

test("awaken handler — execute error result / no result / thrown handler all degrade to commanded:true, ok:false", async () => {
  for (const [executeResult, fragment] of [
    [{ kind: "error", text: "child cannot self-awaken" }, "child cannot self-awaken"],
    ["no-result", /did not resolve/],
    ["throw", /flip boom/],
  ]) {
    const services = fakeServices({ executeResult })
    const handler = buildHandler(services, { readBody: bodyReaderFor({}) })
    const r = await fire(handler, { body: "{}" })
    assert.equal(r.status, 200)
    assert.equal(r.json.ok, true, "the SESSION was created; only the flip failed")
    assert.equal(r.json.awakened.commanded, true)
    assert.equal(r.json.awakened.ok, false)
    assert.ok(
      typeof fragment === "string" ? r.json.awakened.text.includes(fragment) : fragment.test(r.json.awakened.text),
      `actionable text for ${fragment.toString()}`,
    )
  }
})

test("awaken handler — plant failure is contained: planted.ok:false with the typed error, flip result stands", async () => {
  const services = fakeServices()
  const originalInvoke = services.gateway.invoke
  services.gateway.invoke = async (request) => {
    if (request.namespace === "session" && request.method === "prompt") {
      const err = new Error("session content invalid")
      err.code = "gateway/bad-request"
      throw err
    }
    return originalInvoke(request)
  }
  const handler = buildHandler(services, { readBody: bodyReaderFor({ firstMessage: "will not pass validation" }) })
  const r = await fire(handler, { body: "{}" })
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true, "plant failure never fails the whole awaken")
  assert.equal(r.json.planted.requested, true)
  assert.equal(r.json.planted.ok, false)
  assert.match(r.json.planted.error, /session\/prompt failed/)
  assert.match(r.json.planted.error, /gateway\/bad-request/)
  assert.equal(r.json.awakened.ok, true)
})

// ── the production body reader (structural fake of node:http request) ────────

test("readPostBody — assembles chunks, enforces the cap, rejects on error", async () => {
  const emitted = (chunks, error) => ({
    on(event, listener) {
      if (event === "data") {
        // deliver synchronously: 'data' precedes 'end' registration in the
        // reader, so sync delivery cannot race the end listener
        for (const chunk of chunks) listener(chunk)
      }
      if (event === "end" && error === undefined) queueMicrotask(listener)
      if (event === "error" && error !== undefined) queueMicrotask(() => listener(error))
    },
  })
  const good = await readPostBody(emitted([Buffer.from('{"a"'), Buffer.from(":1}")]), 100)
  assert.equal(good, '{"a":1}')
  await assert.rejects(() => readPostBody(emitted([Buffer.alloc(60), Buffer.alloc(60)]), 64), /body exceeds 64 bytes/)
  await assert.rejects(() => readPostBody(emitted([], new Error("socket died"))), /socket died/)
})

// ── ORIGIN GUARD (final-push decision 2026-10): no-Origin passes, same-origin
// passes, cross-site Origin is a typed 403 BEFORE any service call ────────────

test("origin guard — no Origin header (curl/CLI) passes end-to-end unchanged", async () => {
  const services = fakeServices()
  let fenceCalls = 0
  const handler = buildHandler(services, {
    connectionTrust: () => { fenceCalls++; return undefined },
    readBody: bodyReaderFor({}),
  })
  const r = await fire(handler, { body: "{}" })
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
  assert.equal(fenceCalls, 0, "no Origin ⇒ the fence is never consulted")
})

test("origin guard — exact same-origin Origin (+ admitting fence) passes", async () => {
  const services = fakeServices()
  let seen = null
  const handler = buildHandler(services, {
    connectionTrust: (req) => { seen = req; return undefined },
    readBody: bodyReaderFor({}),
  })
  const r = await fire(handler, { body: "{}", headers: { origin: "http://127.0.0.1:4501", host: "127.0.0.1:4501" } })
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
  assert.ok(seen, "same-origin requests are still handed to the trust fence")
})

test("origin guard — cross-site Origin is a typed 403 BEFORE any service call", async () => {
  const services = fakeServices()
  const handler = buildHandler(services, { readBody: bodyReaderFor({ itemId: "WI-012" }) })
  const r = await fire(handler, {
    body: "{}",
    headers: { origin: "https://evil.example", host: "127.0.0.1:4501" },
  })
  assert.equal(r.status, 403)
  assert.equal(r.json.ok, false)
  assert.equal(r.json.code, "hvb-board/cross-origin")
  assert.match(r.json.error, /cross-site Origin "https:\/\/evil\.example"/)
  assert.match(r.json.error, /Nothing was read from the board, nothing was created/)
  assert.equal(services.calls.length, 0, "no board lookup, no create, no flip on a refused origin")
  assert.equal(r.json.origin, "https://evil.example")
})

test("origin guard — same-origin but fence-rejected is also a 403", async () => {
  const services = fakeServices()
  const handler = buildHandler(services, {
    connectionTrust: () => "untrusted surface (test)",
    readBody: bodyReaderFor({}),
  })
  const r = await fire(handler, { body: "{}", headers: { origin: "http://127.0.0.1:4501", host: "127.0.0.1:4501" } })
  assert.equal(r.status, 403)
  assert.equal(r.json.code, "hvb-board/cross-origin")
  assert.equal(services.calls.length, 0)
})

test("origin guard — Origin with missing/mismatched Host fails closed; garbage URL fails closed", async () => {
  for (const headers of [
    { origin: "http://127.0.0.1:4501" },
    { origin: "http://127.0.0.1:4501", host: "other-host:1234" },
    { origin: "::::not-a-url", host: "127.0.0.1:4501" },
  ]) {
    const services = fakeServices()
    const handler = buildHandler(services, { readBody: bodyReaderFor({}) })
    const r = await fire(handler, { body: "{}", headers })
    assert.equal(r.status, 403, `403 for ${JSON.stringify(headers)}`)
    assert.equal(r.json.code, "hvb-board/cross-origin")
    assert.equal(services.calls.length, 0)
  }
})

// ── 2. the cordis-level wiring: OPT-IN flag gates ONLY the awaken route ──────

const bootCtx = async (config) => {
  const { createRequire } = await import("node:module")
  const require = createRequire("/root/.dsh/profiles/web/package.json")
  const SPMod = require("@deepseek-ai/dsh-system-prompt")
  const ToolsMod = require("@deepseek-ai/dsh-tools")
  const SP = SPMod.default ?? SPMod.SystemPrompt
  const Tools = ToolsMod.default ?? ToolsMod.Tools

  const routeCtx = new Context()
  new SP(routeCtx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
  new Tools(routeCtx, {})

  const routes = []
  provide(routeCtx, "webServer", { register: (route) => { routes.push(route); return () => {} } })
  // the merged agents fake covers BOTH waits: 3D wants list(), awaken wants get()
  provide(routeCtx, "agents", { get: (id) => ({ id }), list: () => [] })
  provide(routeCtx, "commands", { find: () => ({ name: "awaken" }), execute: async () => ({ result: { kind: "success", text: "flipped" } }) })
  provide(routeCtx, "agentPresets", { resolve: async (id) => ({ id: id ?? "standard" }) })
  provide(routeCtx, "typertGateway", { invoke: async () => ({ sessionId: "session-cordis-1", agentPreset: "standard" }) })
  // ORIGIN GUARD belt: a trust fence fake that admits everything (loopback-like)
  provide(routeCtx, "connection", { requestRejection: (req) => undefined })

  routeCtx.plugin(Board, config)
  await new Promise((r) => setTimeout(r, 100))
  return { routeCtx, routes }
}

function provide(ctx, key, value) {
  const fn = typeof ctx.provide === "function" ? ctx.provide.bind(ctx) : (ctx.reflect && typeof ctx.reflect.provide === "function" ? ctx.reflect.provide.bind(ctx.reflect) : null)
  assert.ok(fn, "a real cordis Context must expose provide")
  fn(key, value)
}

test("awaken:true registers the POST route (exact) beside the read-only routes, and it answers end-to-end over fakes", async () => {
  const { routes, routeCtx } = await bootCtx({ directory: synthDir, awaken: true })
  assert.equal(routeCtx.board.awaken, true)
  const awakenRoute = routes.find((r) => r.path === AWAKEN_ROUTE_PATH)
  assert.ok(awakenRoute, "the awaken route registers ONLY when the opt-in flag composes true")
  assert.equal(awakenRoute.kind, "exact")
  assert.ok(routes.some((r) => r.path === "/api/hive-board/index"), "read-only index route unaffected")
  assert.ok(routes.some((r) => r.path === "/api/hive-board/item"), "read-only item route unaffected")

  // End-to-end over fakes THROUGH the wired handler: POST, empty body.
  const chunks = []
  let status = null
  const req = { method: "POST", on(event, listener) { if (event === "end") queueMicrotask(listener) } }
  await awakenRoute.handler(req, { writeHead: (c) => (status = c), end: (c) => chunks.push(c) })
  const body = JSON.parse(chunks.join(""))
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.sessionId, "session-cordis-1")
  assert.equal(body.awakened.commanded, true)

  // Same-origin browser-style POST through the WIRED handler also passes (the
  // wiring hands the connection trust fence through, and it admits here).
  const wired = []
  let wiredStatus = null
  const sameOriginReq = {
    method: "POST",
    headers: { origin: "http://127.0.0.1:4501", host: "127.0.0.1:4501" },
    on(event, listener) { if (event === "end") queueMicrotask(listener) },
  }
  await awakenRoute.handler(sameOriginReq, { writeHead: (c) => (wiredStatus = c), end: (c) => wired.push(c) })
  assert.equal(wiredStatus, 200)
  assert.equal(JSON.parse(wired.join("")).ok, true)
})

test("default (no awaken config) — the awaken route is NOT registered; read-only routes still are", async () => {
  const { routes, routeCtx } = await bootCtx({ directory: synthDir })
  assert.equal(routeCtx.board.awaken, false, "the config default is OFF (opt-in, never a silent exposure)")
  assert.ok(!routes.some((r) => r.path === AWAKEN_ROUTE_PATH), "no awaken route without the opt-in flag")
  assert.ok(routes.some((r) => r.path === "/api/hive-board/index"))
  assert.ok(routes.some((r) => r.path === "/api/hive-board/item"))
})
