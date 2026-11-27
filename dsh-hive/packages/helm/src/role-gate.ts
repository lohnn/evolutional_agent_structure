/**
 * @hive/dsh-helm — HOST-ONLY role gate (HELM role presets, design §2.3).
 *
 * Enforcement, not advisory ("subtract every unapproved global" — the patch
 * header in @hive/dsh-agents' role-presets.patch.yml references this
 * plugin): an Agent composed as helmsman/bosun/hands gets every Host-global
 * tool EXCEPT its policy table's approved set.
 *
 * Per Agent, on `agent/created` (serial: a throw here FAILS AGENT
 * PUBLICATION — the fail-closed window, §2.3.5) and on every committed
 * `agent-preset/selected` event (§2.3.1/§2.3.6):
 *
 * 1. Resolve the composed role. Not a role → dispose any prior gate state
 *    and return to the ordinary (ungated) path. Hands requires session
 *    origin "subagent" (dsh child-agent persists it at dispatch); on
 *    agent/created any other origin installs a deny-all execution guard and
 *    THROWS — a direct top-level Hands creation/resume can never publish a
 *    usable Hand. A committed picker selection cannot roll back (session
 *    observers are contained after commit), so the same deny-all fallback
 *    applies there — safe interim per design §8, strict select-rejection is
 *    the §4.4 registry leg (CORE-VIS; see the implementation log).
 * 2. Compute `deny` from the HOST-CONTEXT GLOBAL census minus the role's
 *    allowed table and `tools.restrict({ deny })` in the AGENT scope. Names
 *    come only from the live global registry (W-088-safe: every denied name
 *    was registered at compute time). Scope-local (preset-) tools are not
 *    named — controlled by the declarations and the guard.
 * 3. `tools.guard(...)` with the EXACT allowed-name set: late or
 *    agent-owned registrations outside the set are refused at execution
 *    even though agent-owned registrations are exempt from restrict.
 * 4. Track disposers per session; on `tools/change` recompute every tracked
 *    role Agent's deny set — new restriction installed BEFORE the old one
 *    lifts (fail-closed HMR: no unapproved tool is visible in between), and
 *    equal sets no-op. On `agent/disposed` dispose everything and forget.
 *
 * Fail-open is forbidden: a restriction/guard failure inside agent/created
 * propagates and rejects publication. (Deliberately NOT the evolution
 * fallback of evolution/src/index.ts:840-856, which logs and leaves the
 * child unrestricted — role authority may not fail open.)
 *
 * W-044: no module-scope runtime `@deepseek-ai/*` import here; the reserved
 * PTC transport name is an inlined local brand, and registry/tool faces are
 * type-only via the Context augmentation.
 */

import type { Agent } from "@deepseek-ai/dsh-agent"
import type {} from "@deepseek-ai/dsh-agent-preset-registry"
import {
  ROLE_ALLOWED_TOOLS,
  isRolePreset,
  computeRoleDenySet,
  roleDenialReason,
  illegalHandsReason,
  type RolePresetId,
} from "./roles.js"

declare module "@deepseek-ai/cordis" {
  interface Events {
    /**
     * Emitted by @deepseek-ai/dsh-tools whenever any tool layer changes
     * (registration, removal, scoped mount/unmount). Emitted-but-undeclared
     * upstream; declared here so the gate may listen with real types. Additive:
     * no other module declares this member.
     */
    "tools/change"(): void
  }
}

type GateCtx = import("@deepseek-ai/cordis").Context

/**
 * Per-session gate state. Keyed by SESSION id (the selection event addresses
 * sessions, agents re-publish under fresh identities on resume/compact and
 * the same session id), with the live Agent cell updated on every
 * agent/created so executions and disposers always belong to the live face.
 */
interface RoleGateState {
  role: RolePresetId
  agent: Agent
  /** Disposer for the agent-scoped tools.restrict({ deny }) mask. */
  restriction: () => void
  /** Disposer for the agent-scoped tools.guard(allow-set) execution guard. */
  guard: () => void
  /** The deny set currently installed (empty-list check for tools/change). */
  deny: readonly string[]
}

/** Face of the deny-all fallback: refuses every execution with an explanation. */
const DENY_ALL_REASON =
  "Refused by the HELM role gate: an illegally composed Hands session has no tools. " +
  'A "hands" preset session may only exist as a Bosun-dispatched child (session origin "subagent"); ' +
  "a session composed directly is denied everything while it lasts, and dispatch must happen through a Bosun's helm_dispatch."

export function apply(ctx: GateCtx) {
  const log = (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) =>
    ctx.logger?.[level]?.(msg, extra)

  /** sessionId → state. Entries exist ONLY while a role gate is installed. */
  const tracked = new Map<string, RoleGateState>()
  /**
   * sessionId → live Agent, recorded at every publication (fresh create,
   * resume, compact republish). A committed `agent-preset/selected` event
   * addresses a SESSION, and the selection may ENTER a role from a non-role
   * composition (blank Standard → Helmsman, design §2.4) — that session has
   * no tracked role state yet, so the live agent face must come from here.
   */
  const live = new Map<string, Agent>()

  function sessionIdOf(agent: Agent): string {
    return String((agent.session?.id as unknown) ?? agent.id)
  }

  /** Read the agent's composed preset id, tolerating registry-less compositions. */
  function composedPresetOf(agent: Agent): string | undefined {
    try {
      const presets = ctx.get("agentPresets")
      return presets?.composedPreset(agent.ctx)
    } catch (err) {
      // Registry service read failed mid-recomposition — a preset BINDING
      // cannot be confirmed here. Treat as unresolvable: the caller decides.
      log("warn", "[helm-role-gate] composedPreset read failed", {
        error: err instanceof Error ? err.message : String(err),
      })
      return undefined
    }
  }

  function disposeState(state: RoleGateState): void {
    for (const disposer of [state.restriction, state.guard]) {
      try {
        disposer()
      } catch (err) {
        // An already-unwound scope rejects second disposal; nothing to hold.
        log("warn", "[helm-role-gate] disposer throw during teardown", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  /**
   * Build the role's execution guard: exact allowed-name set. Anything else —
   * late global HMR additions, agent-owned registrations, shadowing scoped
   * tools, reserved PTC transports — is denied with the role policy as the
   * model-facing reason. Guards are monotonic denials checked for every
   * execution in this scope chain (dsh-tool contracts).
   */
  function buildRoleGuard(role: RolePresetId): (execution: { name: string }) => { reason: string } | undefined {
    const allowed = new Set(ROLE_ALLOWED_TOOLS[role])
    return (execution) => {
      if (allowed.has(execution.name)) return undefined
      return { reason: roleDenialReason(role, execution.name) }
    }
  }

  /**
   * Install restriction + guard for a role agent. Throws on failure — the
   * caller decides whether that rejects publication (agent/created: yes)
   * or must fall back (selection event: cannot roll back). This is the
   * §2.3.2/§2.3.3 core, kept synchronous so the serial listener window
   * cannot be interleaved.
   */
  function installRoleGate(agent: Agent, role: RolePresetId): RoleGateState {
    // §2.3.2: deny SUBTRACTS from the live global census — never names scoped
    // tools, never names reserved transports (restrict() would throw and the
    // throw would kill publication with the wrong diagnosis).
    const globalNames = ctx.tools.definitions().map((def) => def.name as string)
    const deny = computeRoleDenySet(role, globalNames)
    // §2.3.2: restriction applies to global visibility AND execution.
    const restriction = agent.ctx.tools.restrict({ deny })
    try {
      // §2.3.3: exact-allow execution guard for late/agent-owned names.
      const guard = agent.ctx.tools.guard(buildRoleGuard(role))
      return { role, agent, restriction, guard, deny }
    } catch (err) {
      try {
        restriction()
      } catch {
        // already unwound — best effort during a failing install
      }
      throw err
    }
  }

  /** Deny-all fallback for an illegal Hands composition (§2.3.1/§2.3.6). */
  function installDenyAllFallback(agent: Agent): (() => void) | undefined {
    try {
      return agent.ctx.tools.guard(() => ({ reason: DENY_ALL_REASON }))
    } catch (err) {
      log("error", "[helm-role-gate] deny-all fallback FAILED to install", {
        sessionId: sessionIdOf(agent),
        error: err instanceof Error ? err.message : String(err),
      })
      return undefined
    }
  }

  /**
   * Shared gate decision for one live agent. Returns
   * - "installed-new" / "kept" / "lifted" / "fallback-denied" for logging, or
   * - throws when an install fails (the agent/created caller lets it propagate).
   */
  function reconcile(agent: Agent): string {
    const sessionId = sessionIdOf(agent)
    const state = tracked.get(sessionId)
    const preset = composedPresetOf(agent)

    if (!isRolePreset(preset)) {
      // §2.3.1: not a role — return the agent to the ordinary gate path.
      if (state !== undefined) {
        disposeState(state)
        tracked.delete(sessionId)
        log("info", "[helm-role-gate] role lifted", { sessionId, role: state.role })
        return "lifted"
      }
      return "untracked-no-role"
    }

    const role = preset as RolePresetId
    const origin = agent.session?.header?.origin

    if (role === "hands" && origin !== "subagent") {
      // §2.3.1/§2.3.6: illegally composed Hands. agent/created callers throw
      // after installing the fallback (rejecting publication); a committed
      // selection cannot roll back and keeps the deny-all surface + loud log.
      const existing = tracked.get(sessionId)
      if (existing !== undefined) {
        disposeState(existing)
        tracked.delete(sessionId)
      }
      const fallback = installDenyAllFallback(agent)
      log("error", "[helm-role-gate] ILLEGAL top-level hands composition — deny-all fallback installed", {
        sessionId,
        origin: origin ?? "(none)",
        persistence: fallback === undefined ? "UNPINNED (guard disposer unavailable — see error above)" : "held until disposal",
      })
      return "fallback-denied"
    }

    // Already tracking this exact role → keep (idempotent re-publish).
    if (state !== undefined && state.role === role) return "kept"
    // Role change (or fresh install): install the new face BEFORE lifting the
    // old restriction — an overlapping window must stay fail-closed.
    const installed = installRoleGate(agent, role)
    if (state !== undefined) disposeState(state)
    tracked.set(sessionId, installed)
    log("info", "[helm-role-gate] role gate installed", {
      sessionId,
      role,
      denied: installed.deny.length,
    })
    return "installed-new"
  }

  // ── Listeners ─────────────────────────────────────────────────────────────--

  // §2.3: primary window. Serial listeners run in order and are awaited before
  // creation resolves; a throw here fails creation — the fail-closed guarantee.
  ctx.on("agent/created", (payload): undefined => {
    const agent = payload.agent
    const sessionId = sessionIdOf(agent)
    live.set(sessionId, agent)
    const preset = composedPresetOf(agent)
    const role = isRolePreset(preset) ? (preset as RolePresetId) : undefined
    const origin = agent.session?.header?.origin

    // Illegal top-level Hands: install the deny-all guard, then THROW so
    // publication is rejected — the fallback only exists if the throw is
    // somehow contained (an older host that swallows listener errors).
    // §2.3.1 note: genuine children persist `origin: 'subagent'`.
    if (role === "hands" && origin !== "subagent") {
      installDenyAllFallback(agent)
      log("error", "[helm-role-gate] rejecting direct top-level hands creation/resume", {
        sessionId,
        origin: origin ?? "(none)",
      })
      throw new Error(illegalHandsReason(origin))
    }

    // Every other case (role install / keep / lift, non-role lift) goes
    // through §2.3's reconcile; a failure propagates and rejects
    // publication (§2.3.5 — never fail open).
    reconcile(agent)
    return undefined
  })

  // §2.3 step 1: recompose on committed selection events. The registry emits
  // (sessionId, presetId) AFTER mounting the new generation on the live agent
  // session — cannot veto (§0.6), only follow. The agent face resolves from
  // our live map: selection may ENTER a role from a plain composition (§2.4),
  // where no role state is tracked yet.
  ctx.on("agent-preset/selected", (sessionId): undefined => {
    const key = String(sessionId)
    const agent = live.get(key) ?? tracked.get(key)?.agent
    if (agent === undefined) {
      // A selection on a session we never saw publish: log loudly and do NOT
      // pretend. The agent/created window owns installation for it.
      const presets = ctx.get("agentPresets")
      log("warn", "[helm-role-gate] selection event for an untracked session", {
        sessionId: key,
        preset: typeof presets === "object" ? "(registry present, agent not seen publishing)" : "(no registry)",
      })
      return undefined
    }
    try {
      reconcile(agent)
    } catch (err) {
      // A failed recompose for a committed selection: the previous state was
      // swapped out only AFTER a successful install (reconcile keeps the old
      // face on throw), so the session keeps its previous gate. Loud log; no
      // fail-open.
      log("error", "[helm-role-gate] gate recompose after selection FAILED — previous gate retained", {
        sessionId: key,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return undefined
  })

  // §2.3.4: global tool set changed (HMR, plugin reload, preset mounts emit
  // this too via the registry's recompose). Recompute every tracked role
  // agent's deny set; install-new-before-lift-old; no-op on equal sets.
  ctx.on("tools/change", (): undefined => {
    const globalNames = ctx.tools.definitions().map((def) => def.name as string)
    for (const [sessionId, state] of [...tracked.entries()]) {
      const deny = computeRoleDenySet(state.role, globalNames)
      if (deny.length === state.deny.length && deny.every((name) => state.deny.includes(name))) continue
      let restriction: (() => void) | undefined
      try {
        restriction = state.agent.ctx.tools.restrict({ deny })
      } catch (err) {
        // Fail-closed: the OLD mask stays installed (never lifted on a failed
        // recompute), so a vanished census name cannot widen the surface.
        log("error", "[helm-role-gate] tools/change restriction recompute FAILED — old mask retained", {
          sessionId,
          role: state.role,
          error: err instanceof Error ? err.message : String(err),
        })
        continue
      }
      try {
        state.restriction()
      } catch {
        // already unwound
      }
      state.restriction = restriction
      state.deny = deny
      log("info", "[helm-role-gate] tools/change recomputed role mask", {
        sessionId,
        role: state.role,
        denied: deny.length,
      })
    }
    return undefined
  })

  // §2.3.4: dispose and forget.
  ctx.on("agent/disposed", (payload): undefined => {
    const sessionId = sessionIdOf(payload.agent)
    live.delete(sessionId)
    const state = tracked.get(sessionId)
    if (state === undefined) return undefined
    tracked.delete(sessionId)
    for (const disposer of [state.restriction, state.guard]) {
      try {
        disposer()
      } catch {
        // the agent's scoped world unwinds registrations with it
      }
    }
    return undefined
  })

  return () => {
    for (const [, state] of tracked) disposeState(state)
    tracked.clear()
    live.clear()
  }
}

// The dsh loader applies the DEFAULT export only; host row `helm-role-gate`.
;(apply as unknown as Record<string, unknown>).inject = ["tools"]
export default apply
