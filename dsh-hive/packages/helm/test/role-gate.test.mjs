/**
 * @hive/dsh-helm — role-gate enforcement tests (HELM role presets phase 3)
 *
 * Design §6.1 subset for the plugin-side enforcement leg. The gate is the
 * fail-closed seam (§2.3), so the battery is deliberately negative-heavy:
 * the deny set must subtract every unapproved GLOBAL tool, the guard must
 * refuse late/agent-owned registrations at execution, an illegal top-level
 * Hands composition must be rejected (create-throw + deny-all fallback), and
 * no path may fail open. The tools runtime here faithfully mocks the dsh-tools
 * semantics the gate leans on (restrict validates names and intersects; scoped
 * registrations stay visible and exempt from restrict; guards are monotonic
 * and deny execution; host-view definitions()). The real-composition census
 * (§6.1.4) and live negative censuses (§6.2) are separate legs.
 */

import { test } from "node:test"
import assert from "node:assert"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const DIST = "../dist/"

/** Pure role tables under test (the same module the gate consumes). */
const roles = require(`${DIST}roles.js`)
/** The Host-only gate plugin under test. */
const roleGate = require(`${DIST}role-gate.js`)

const { computeRoleDenySet, ROLE_ALLOWED_TOOLS } = roles

// ── Faithful tools-runtime mock ──────────────────────────────────────────────

/**
 * Simulates dsh-tools' registry semantics at the surface the gate uses:
 * - global layer, visible minus the INTERSECTION of per-scope deny masks,
 * - agent-scoped registrations (visible, EXEMPT from restrict),
 * - per-scope guards checked after visibility, deny-with-reason,
 * - restrict validates every name against the global census and THROWS on
 *   unknown or reserved names (dsh-tools contracts).
 */
function makeToolsRuntime() {
  const globals = new Map() // name → { name }
  const scoped = new Map() // sessionId → Map(name → def)
  const restrictions = new Map() // sessionId → Array<Set<string>>
  const guards = new Map() // sessionId → Array<fn>
  const restrictAudit = [] // every successful restrict, in order

  return {
    restrictAudit,
    register(def) {
      globals.set(def.name, def)
    },
    removeGlobal(name) {
      globals.delete(name)
    },
    registerScoped(sessionId, name) {
      if (!scoped.has(sessionId)) scoped.set(sessionId, new Map())
      scoped.get(sessionId).set(name, { name })
    },
    guardCount(sessionId) {
      return (guards.get(sessionId) ?? []).length
    },
    /** HOST-side global view — what ctx.tools.definitions() returns to the gate. */
    definitions() {
      return [...globals.values()]
    },
    /** Agent-scoped visible definitions (restrictions intersect; scoped defs
     * SHADOW same-named globals — nearer registrations win, exactly once). */
    visible(sessionId) {
      const denied = new Set()
      for (const mask of restrictions.get(sessionId) ?? []) for (const n of mask) denied.add(n)
      const out = new Map()
      for (const [name, def] of globals) if (!denied.has(name)) out.set(name, def)
      for (const [name, def] of scoped.get(sessionId) ?? []) out.set(name, def) // shadows
      return [...out.values()]
    },
    /** Agent-scoped restrict — as strict about names as the real one. */
    restrict(sessionId, filter) {
      const deny = filter.deny ?? []
      if (deny.includes("run_code")) {
        throw new Error('tools.restrict() cannot name reserved PTC mode presentation transport "run_code"; restrict end-capability tools instead')
      }
      const unknown = deny.filter((n) => !globals.has(n))
      if (unknown.length > 0) {
        throw new Error(`tools.restrict() names unknown global tools ${unknown.map((n) => `"${n}"`).join(", ")}`)
      }
      const mask = new Set(deny)
      if (!restrictions.has(sessionId)) restrictions.set(sessionId, [])
      restrictions.get(sessionId).push(mask)
      restrictAudit.push({ sessionId, deny: [...deny] })
      return () => {
        const masks = restrictions.get(sessionId) ?? []
        const i = masks.indexOf(mask)
        if (i >= 0) masks.splice(i, 1)
      }
    },
    guard(sessionId, fn) {
      if (!guards.has(sessionId)) guards.set(sessionId, [])
      guards.get(sessionId).push(fn)
      return () => {
        const stack = guards.get(sessionId) ?? []
        const i = stack.indexOf(fn)
        if (i >= 0) stack.splice(i, 1)
      }
    },
    /** Pipeline: visibility (UNKNOWN_TOOL) → guards (GUARD) → execute (OK).
     * `run_code` bypasses the census check — the PTC executor transports it
     * regardless of registry visibility — and lands in the guards, which is
     * where the gate denies it. */
    execute(sessionId, name) {
      const executorOwned = name === "run_code"
      if (!executorOwned && !this.visible(sessionId).some((d) => d.name === name)) {
        return { ok: false, kind: "UNKNOWN_TOOL" }
      }
      for (const fn of guards.get(sessionId) ?? []) {
        const denial = fn({ name })
        if (denial !== undefined) {
          return { ok: false, kind: "GUARD", reason: typeof denial === "string" ? denial : denial.reason }
        }
      }
      return { ok: true, kind: "EXECUTED" }
    },
  }
}

// ── Test rig ────────────────────────────────────────────────────────────────

const GLOBAL_CENSUS = [
  "bash", "pwsh", "read", "read_image", "write", "edit", "glob", "grep",
  "job_output", "job_list", "job_kill", "todo_write", "web_fetch", "web_search",
  "hive_board_list", "hive_board_search", "hive_board_read",
  "hive_board_bind", "hive_board_create", "hive_board_respec",
  "hive_signal", "hive_listen", "hive_sent", "hive_retire",
  "hive_dream_begin", "hive_dream_complete", "hive_note_painpoint",
  "hive_dispatch", "hive_send", "hive_children",
  "subagent", "subagent_fork", "workflow",
  "send_message", "list_agents", "wait_agent", "interrupt_agent",
  // the LEGACY global helm row (kept one release; design §5.4) — role agents
  // shadow it with their scoped preset registration [definition identity must
  // be asserted in the real-composition leg; the mask here treats the global
  // names exactly like any other]
  "helm_dispatch", "helm_status", "helm_prompt",
  "helm_collect", "helm_resume", "helm_cancel",
  // NOTE: run_code is deliberately NOT here. In the real host it is not a
  // registry census entry at all — it is the PTC executor's reserved
  // transport (dsh-tool-executor-ptc get(): name === RUN_CODE_NAME →
  // requirePtcTransport()). The mock's execute() simulates that path.
]

function makeAgent(tools, { id, sessionId = id, origin = undefined, restrictThrow = undefined }) {
  const agent = {
    id,
    session: { id: sessionId, header: { origin, delegationDepth: origin === "subagent" ? 1 : undefined } },
    ctx: {
      __sid: sessionId,
      tools: {
        restrict: (filter) => {
          if (restrictThrow !== undefined) throw new Error(restrictThrow)
          return tools.restrict(sessionId, filter)
        },
        guard: (fn) => tools.guard(sessionId, fn),
      },
    },
  }
  return agent
}

/**
 * Host plugin ctx + serial agent/created dispatch (a listener throw skips
 * later listeners and must FAIL CREATION — the fail-closed window).
 * presetsFor(sessionKey) → composed preset id | undefined.
 */
function rig(presetsFor = () => undefined) {
  const tools = makeToolsRuntime()
  for (const name of GLOBAL_CENSUS) tools.register({ name })
  const logger = { errors: [], warns: [], infos: [] }
  const listeners = new Map()
  const presetsSvc = {
    composedPreset: (agentCtx) => presetsFor(agentCtx?.__sid),
    resolve: async (id) => ({ id }),
  }
  const host = {
    tools,
    get(name) {
      if (name === "agentPresets") return presetsSvc
      throw new Error(`unmocked service: ${name}`)
    },
    logger: {
      error: (m, e) => logger.errors.push({ m, e }),
      warn: (m, e) => logger.warns.push({ m, e }),
      info: (m, e) => logger.infos.push({ m, e }),
    },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(fn)
      return () => {}
    },
    async fire(event, payload) {
      if (event === "agent/created") {
        for (const fn of listeners.get(event) ?? []) await fn(payload) // rethrows
        return
      }
      for (const fn of listeners.get(event) ?? []) await fn(payload)
    },
  }
  const disposer = roleGate.apply(host)
  return { tools, host, logger, disposer }
}

// ── §6.1.2 gate math (census derivation, W-088 hygiene) ──────────────────────

test("gate math: hands deny set subtracts nothing allowed and keeps no reserved transport", () => {
  const census = ["bash", "read", "subagent", "helm_dispatch", "hive_dispatch", "run_code", "workflow"]
  const deny = computeRoleDenySet("hands", census)
  assert.deepEqual(deny.sort(), ["helm_dispatch", "hive_dispatch", "subagent", "workflow"])
  assert.ok(!deny.includes("run_code"), "reserved transport must never enter restrict")
})

test("gate math: helmsman deny set strips work+dispatch tools but keeps chart reads and comms", () => {
  const deny = computeRoleDenySet("helmsman", GLOBAL_CENSUS)
  assert.deepEqual(deny.sort(), [
    "bash", "pwsh", "read", "read_image", "write", "edit", "glob", "grep",
    "job_output", "job_list", "job_kill", "todo_write", "web_fetch", "web_search",
    "hive_board_bind", "hive_board_create", "hive_board_respec",
    "hive_dream_begin", "hive_dream_complete", "hive_note_painpoint",
    "hive_dispatch", "hive_send", "hive_children",
    "subagent", "subagent_fork", "workflow",
    "send_message", "list_agents", "wait_agent", "interrupt_agent",
    // run_code excluded from the RESTRICTION (reserved) — guard covers it
  ].sort())
})

test("gate math: bosun deny set keeps W + six helm tools, strips chart-write/comms/dream/dispatch", () => {
  const deny = computeRoleDenySet("bosun", GLOBAL_CENSUS).sort()
  for (const n of ["hive_board_bind", "hive_board_create", "hive_board_respec",
    "hive_signal", "hive_listen", "hive_sent", "hive_retire",
    "hive_dream_begin", "hive_dream_complete", "hive_note_painpoint",
    "hive_dispatch", "hive_send", "hive_children",
    "subagent", "subagent_fork", "workflow",
    "send_message", "list_agents", "wait_agent", "interrupt_agent"]) {
    assert.ok(deny.includes(n), `bosun must deny ${n}`)
  }
  for (const n of ["bash", "read", "helm_dispatch", "helm_status", "helm_prompt", "helm_collect", "helm_resume", "helm_cancel"]) {
    assert.ok(!deny.includes(n), `bosun must keep ${n}`)
  }
  assert.ok(!deny.includes("run_code"), "reserved transport never enters restrict")
})

// ── §2.3 gate behavior ───────────────────────────────────────────────────────

test("helmsman census: exactly six helm tools + three chart reads + four comms tools survive (§6.2 helmsman row)", async () => {
  const { tools, host } = rig(() => "helmsman")
  const agent = makeAgent(tools, { id: "top-helm" })
  await host.fire("agent/created", { agent, source: "startup" })
  const visible = tools.visible("top-helm").map((d) => d.name).sort()
  assert.deepEqual(visible,
    [...ROLE_ALLOWED_TOOLS.helmsman].sort())
  assert.equal(visible.length, 13)
})

test("helmsman negative execution: hidden tools read as tool-not-found, allowed tools run", async () => {
  const { tools, host } = rig(() => "helmsman")
  const agent = makeAgent(tools, { id: "top-helm" })
  await host.fire("agent/created", { agent, source: "startup" })
  assert.equal(tools.execute("top-helm", "hive_board_read").kind, "EXECUTED")
  for (const n of ["bash", "write", "subagent", "workflow", "hive_board_create"]) {
    assert.equal(tools.execute("top-helm", n).kind, "UNKNOWN_TOOL", `${n} must be invisible`)
  }
})

test("bosun census: W + six helm tools visible; dispatch/agent cargo absent; run_code refused by guard", async () => {
  const { tools, host } = rig(() => "bosun")
  const agent = makeAgent(tools, { id: "top-bosun", sessionId: "sess-bosun" })
  await host.fire("agent/created", { agent, source: "startup" })
  const expected = [...ROLE_ALLOWED_TOOLS.bosun].sort()
  assert.deepEqual(tools.visible("sess-bosun").map((d) => d.name).sort(), expected)
  assert.equal(tools.execute("sess-bosun", "bash").kind, "EXECUTED")
  assert.equal(tools.execute("sess-bosun", "helm_collect").kind, "EXECUTED")
  assert.equal(tools.execute("sess-bosun", "subagent").kind, "UNKNOWN_TOOL")
  const transport = tools.execute("sess-bosun", "run_code")
  assert.equal(transport.kind, "GUARD", "run_code is denied by the exact-allow guard, not by restrict")
  assert.match(transport.reason, /role gate/)
})

test("hands (legal subagent child): exactly W; late agent-owned scope registration is visible but EXECUTION-refused", async () => {
  const { tools, host } = rig(() => "hands")
  const agent = makeAgent(tools, { id: "hand-child", sessionId: "sess-hand", origin: "subagent" })
  await host.fire("agent/created", { agent, source: "startup" })
  assert.deepEqual(tools.visible("sess-hand").map((d) => d.name).sort(), [...ROLE_ALLOWED_TOOLS.hands].sort())
  tools.registerScoped("sess-hand", "sneaky_dispatch")
  assert.ok(tools.visible("sess-hand").some((d) => d.name === "sneaky_dispatch"),
    "agent-owned regs stay visible (restrict exemption is real dsh-tools semantics)")
  const refused = tools.execute("sess-hand", "sneaky_dispatch")
  assert.equal(refused.kind, "GUARD", "the guard catches what restrict cannot name")
  assert.match(refused.reason, /"hands"/)
})

test("ILLEGAL top-level hands: agent/created THROWS (publication rejected) after installing a deny-all fallback", async () => {
  const { tools, host, logger } = rig(() => "hands")
  const agent = makeAgent(tools, { id: "rogue", sessionId: "sess-rogue", origin: undefined })
  await assert.rejects(
    () => host.fire("agent/created", { agent, source: "startup" }),
    (err) => /dispatch-only/.test(String(err)),
  )
  // The fallback exists ONLY for a host that contains the throw — everything refused:
  assert.equal(tools.execute("sess-rogue", "bash").kind, "GUARD")
  assert.match(tools.execute("sess-rogue", "read").reason, /denied everything/)
  assert.ok(logger.errors.some((e) => /rejecting direct top-level hands/.test(e.m)), "loud error logged")
  // the fallback (no throw) is the committed-SELECTION path:
  await host.fire("agent-preset/selected", "sess-rogue") // same session, live map still holds it
  assert.ok(logger.errors.some((e) => /ILLEGAL top-level hands/.test(e.m)), "selection-path fallback logs loudly")
})

test("cold resume replays: legal hands child stays gated correctly; a former hands child that now composes no preset lifts cleanly", async () => {
  let preset = "hands"
  const { tools, host } = rig(() => preset)
  const agent = makeAgent(tools, { id: "c", sessionId: "sess-c", origin: "subagent" })
  await host.fire("agent/created", { agent, source: "resume" })
  assert.equal(tools.execute("sess-c", "edit").kind, "EXECUTED")
  assert.equal(tools.execute("sess-c", "helm_cancel").kind, "UNKNOWN_TOOL")
  preset = undefined // e.g. rebake/hot-reload composed it back to a non-role preset
  await host.fire("agent/created", { agent, source: "resume" })
  assert.equal(tools.execute("sess-c", "helm_cancel").kind, "EXECUTED", "ordinary path restored after the role lifted")
})

test("selection transitions: standard→helmsman composes the role surface; helmsman→standard restores it", async () => {
  let preset = undefined
  const { tools, host } = rig(() => preset)
  const agent = makeAgent(tools, { id: "blank", sessionId: "sess-blank" })
  await host.fire("agent/created", { agent, source: "startup" })
  assert.ok(tools.visible("sess-blank").some((d) => d.name === "bash"), "standard keeps bash")

  preset = "helmsman"
  await host.fire("agent-preset/selected", "sess-blank")
  assert.ok(!tools.visible("sess-blank").some((d) => d.name === "bash"), "helmsman loses bash after committed selection")
  assert.ok(tools.visible("sess-blank").some((d) => d.name === "hive_signal"), "comms survive the dormant-mask reconciliation lane")
  assert.ok(tools.visible("sess-blank").some((d) => d.name === "hive_board_search"))

  preset = undefined
  await host.fire("agent-preset/selected", "sess-blank")
  assert.ok(tools.visible("sess-blank").some((d) => d.name === "bash"), "leaving the role restores the ordinary surface")
  assert.equal(tools.execute("sess-blank", "subagent").kind, "EXECUTED", "standard is ungated again")
})

test("tools/change HMR: a late global decoy is subtracted for role agents and never for others; removal restores; equal sets no-op", async () => {
  // session-aware composition: the Hand is a role child, the other agent is
  // a plain Standard session (different __sid → different preset).
  const { tools, host, logger } = rig((sid) => (sid === "sess-hand" ? "hands" : undefined))
  const hand = makeAgent(tools, { id: "h", sessionId: "sess-hand", origin: "subagent" })
  const plain = makeAgent(tools, { id: "p", sessionId: "sess-plain" })
  await host.fire("agent/created", { agent: hand, source: "startup" })
  await host.fire("agent/created", { agent: plain, source: "startup" })

  tools.register({ name: "decoy_hands_must_not_see" })
  await host.fire("tools/change")
  const masks = tools.restrictAudit.filter((r) => r.sessionId === "sess-hand")
  assert.ok(masks.at(-1).deny.includes("decoy_hands_must_not_see"),
    "the new mask (installed before the old lifted) contains the decoy")
  assert.ok(!tools.visible("sess-hand").some((d) => d.name === "decoy_hands_must_not_see"))
  assert.ok(tools.visible("sess-plain").some((d) => d.name === "decoy_hands_must_not_see"),
    "non-role agents are untouched by the gate")

  // removal from the census must restore (a stale mask would hide a now-legit tool)
  tools.removeGlobal("decoy_hands_must_not_see")
  await host.fire("tools/change")
  const afterRemoval = tools.restrictAudit.filter((r) => r.sessionId === "sess-hand").at(-1)
  assert.ok(!afterRemoval.deny.includes("decoy_hands_must_not_see"))

  // equal-set no-op
  const count = tools.restrictAudit.filter((r) => r.sessionId === "sess-hand").length
  await host.fire("tools/change")
  assert.equal(tools.restrictAudit.filter((r) => r.sessionId === "sess-hand").length, count)
  assert.equal(logger.errors.length, 0)
})

test("fail-closed: a restrict() failure inside agent/created rejects publication and installs NO guard", async () => {
  let preset = "bosun"
  const { tools, host } = rig(() => preset)
  const agent = makeAgent(tools, { id: "x", sessionId: "sess-x", origin: "subagent", restrictThrow: 'tools.restrict() names unknown global tools "bash"' })
  await assert.rejects(() => host.fire("agent/created", { agent, source: "startup" }), /unknown global tools/)
  assert.equal(tools.guardCount("sess-x"), 0, "no half-installed gate")
  // recovery: same session, healthy restrict → gate composes
  const healthy = makeAgent(tools, { id: "x2", sessionId: "sess-x", origin: "subagent" })
  await host.fire("agent/created", { agent: healthy, source: "startup" })
  assert.equal(tools.execute("sess-x", "bash").kind, "EXECUTED")
  assert.equal(tools.execute("sess-x", "subagent").kind, "UNKNOWN_TOOL")
})

test("run_code is never named in a restriction mask (reserved transports throw in restrict)", async () => {
  let preset = "bosun"
  const { tools, host } = rig(() => preset)
  const agent = makeAgent(tools, { id: "r", sessionId: "sess-r", origin: "subagent" })
  await host.fire("agent/created", { agent, source: "startup" })
  for (const mask of tools.restrictAudit.filter((r) => r.sessionId === "sess-r")) {
    assert.ok(!mask.deny.includes("run_code"), "reserved transport never enters restrict")
  }
  assert.equal(tools.execute("sess-r", "run_code").kind, "GUARD")
})

test("agent/disposed releases the tracked state; a disposed agent leaves no disposers behind", async () => {
  let preset = "bosun"
  const { tools, host } = rig(() => preset)
  const agent = makeAgent(tools, { id: "g", sessionId: "sess-g", origin: "subagent" })
  await host.fire("agent/created", { agent, source: "startup" })
  assert.ok(tools.restrictAudit.some((r) => r.sessionId === "sess-g"))
  await host.fire("agent/disposed", { agent })
  // after disposal the masks are lifted — execute runs ungated (non-role mock world)
  assert.equal(tools.execute("sess-g", "subagent").kind, "EXECUTED")
})

test("selection on an untracked session is logged, not faked", async () => {
  const { host, logger } = rig(() => "helmsman")
  await host.fire("agent-preset/selected", "never-seen")
  assert.ok(logger.warns.some((w) => /untracked session/.test(w.m)), "no pretend-recomposition")
})

test("plugin disposer tears down every gate face", async () => {
  const { tools, host, disposer } = rig(() => "helmsman")
  const agent = makeAgent(tools, { id: "d", sessionId: "sess-d" })
  await host.fire("agent/created", { agent, source: "startup" })
  disposer()
  assert.equal(tools.execute("sess-d", "bash").kind, "EXECUTED", "restrictions lifted with the plugin")
})
