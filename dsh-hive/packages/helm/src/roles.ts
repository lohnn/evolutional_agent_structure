/**
 * @hive/dsh-helm — pure role-policy definitions (HELM role presets, design §1/§5).
 *
 * Role preset ids, the per-role allowed-tool tables, the caller→target
 * dispatch policy, and legacy-id normalization. Shared verbatim by
 * helm_dispatch (src/index.ts), the future Host role gate (phase 3), and the
 * test suites — so one policy table cannot drift between them.
 *
 * W-044: this module has NO runtime `@deepseek-ai/*` imports and must never
 * grow any; it is mounted in Host and Agent scopes alike and imported by
 * evolution (phase 3) under link:-installed profiles. Keep it pure.
 *
 * Dispatch-target semantics (design §5.1): `role` is the exact preset id —
 * there is no second role registry. `helmsman` is never a dispatch target for
 * any caller (policy §1: "Not a dispatch target for Helmsman or Bosun"; the
 * legacy row enumerates "bosun, hands, or a custom registered preset id").
 */

// ── Role ids (design §0.1: helmsman / bosun / hands) ────────────────────────

export const HELMSMAN = "helmsman"
export const BOSUN = "bosun"
export const HANDS = "hands"

export type RolePresetId = typeof HELMSMAN | typeof BOSUN | typeof HANDS

export const ROLE_PRESET_IDS: readonly RolePresetId[] = [HELMSMAN, BOSUN, HANDS]

export function isRolePreset(id: string | undefined): id is RolePresetId {
  return id === HELMSMAN || id === BOSUN || id === HANDS
}

// ── Tool families (design §1 policy table) ──────────────────────────────────

/** The six HELM orchestration tools registered by @hive/dsh-helm. */
export const HELM_TOOLS: readonly string[] = [
  "helm_dispatch",
  "helm_status",
  "helm_prompt",
  "helm_collect",
  "helm_resume",
  "helm_cancel",
]

/** Chart reads — exactly list/search/read per §1; chart mutation is not included. */
export const CHART_READ_TOOLS: readonly string[] = [
  "hive_board_list",
  "hive_board_search",
  "hive_board_read",
]

/** Comms — chart-write, lifecycle, and painpoint tools are not included. */
export const COMMS_TOOLS: readonly string[] = [
  "hive_signal",
  "hive_listen",
  "hive_sent",
  "hive_retire",
]

/**
 * Work set **W**. `bash` and `pwsh` are platform alternatives: the standard
 * preset's `disabled: !!js` rows expose exactly one per platform, so the
 * runtime census never contains both; the declarative allowed set carries both.
 */
export const WORK_TOOLS: readonly string[] = [
  "bash",
  "pwsh",
  "read",
  "read_image",
  "write",
  "edit",
  "glob",
  "grep",
  "job_output",
  "job_list",
  "job_kill",
  "todo_write",
  "web_fetch",
  "web_search",
]

/** Per-role allowed model tools. Everything not allowed is denied. */
export const ROLE_ALLOWED_TOOLS: Record<RolePresetId, readonly string[]> = {
  // Helmsman: six helm_* + chart reads + comms. No work tools — the chart and
  // comms are Host-global tools admitted by the (phase-3) role gate, not
  // plugin rows of the Helmsman declaration (design §3).
  [HELMSMAN]: [...HELM_TOOLS, ...CHART_READ_TOOLS, ...COMMS_TOOLS],
  // Bosun: work set W + all six helm_* tools (§1: "Work set W … plus all six
  // helm_* tools"). Generic subagent/workflow cargo denied.
  [BOSUN]: [...WORK_TOOLS, ...HELM_TOOLS],
  // Hands: work set W only. Every dispatch/control surface denied.
  [HANDS]: [...WORK_TOOLS],
}

// ── Role-gate math (design §2.3; phase 3) ───────────────────────────────────

/**
 * PTC transport reserved names: `tools.restrict()` REFUSES them by contract
 * (dsh-tools rejects exactly this name in allow/deny lists — a reserved
 * presentation transport, not a normal registration). Inlined as a local
 * brand on purpose (W-044: the pure module carries no @deepseek-ai imports).
 * `run_code` is still DENIED in every role — via the execution guard, which
 * enforces the exact allowed-name set at execution time.
 */
export const RESERVED_TRANSPORT_TOOLS: readonly string[] = ["run_code"]

/**
 * Compute a role's Host-global deny set per §2.3 (fail-closed, subtract-all-
 * unapproved): every tool currently visible in the GLOBAL census that the
 * role's allowed table does not admit. Scope-local names never enter — they
 * are preset- or agent-owned and governed by the guard + declarations.
 *
 * Reserved transport names are excluded (restrict() would throw on them, and
 * a thrown restriction at agent/created would reject publication for the
 * wrong reason) — the guard covers their execution instead. Platforms expose
 * exactly one of bash/pwsh; the other is a census name that simply hashes to
 * a no-op restriction entry, so it is left in (harmless, W-088 addresses
 * unknown names, not platform twins — both are registered definitions by the
 * declarations' `disabled: !!js` rows... a disabled row never registers, so
 * it only appears in tables, never in a live census; the subtract is a set
 * either way).
 */
export function computeRoleDenySet(role: RolePresetId, globalNames: readonly string[]): string[] {
  const allowed = new Set(ROLE_ALLOWED_TOOLS[role])
  return globalNames.filter(
    (name) => !allowed.has(name) && !RESERVED_TRANSPORT_TOOLS.includes(name),
  )
}

/** Model-facing reason a role tool call is refused (deny-with-explanation). */
export function roleDenialReason(role: RolePresetId, name: string): string {
  return (
    `Refused by the HELM role gate: "${name}" is not in the "${role}" role preset's approved tool set. ` +
    `The "${role}" surface is policy — request work through your role's channels (` +
    (role === HANDS
      ? `Hands have no dispatch or agent-control surfaces; report to your Bosun instead)`
      : role === BOSUN
        ? `Bosun uses shell/files/search/web work tools plus the six helm_* tools)`
        : `a Helmsman orchestrates via helm_*, reads the chart via hive_board_*, and comms via hive_signal/listen/sent/retire)`) +
    `.`
  )
}

/** Reason for the deny-all fallback on an illegal top-level Hands composition. */
export function illegalHandsReason(origin: string | undefined): string {
  return (
    `Refused by the HELM role gate: the "hands" preset is dispatch-only and may only be composed ` +
    `by a Bosun's helm_dispatch (session origin must be "subagent", got ${origin === undefined ? "(none)" : `"${origin}"`}). ` +
    `This session is not a dispatched Hand; the safe fallback denies every tool.`
  )
}

// ── Legacy-id normalization (design §0.1/§5.4: one release) ─────────────────

/**
 * Retired staging ids accepted as helm_dispatch input aliases. The retired
 * `helm-coordinator` id maps to `bosun` for one release; new sessions persist
 * only `bosun`.
 */
export const LEGACY_PRESET_ALIASES: Readonly<Record<string, string>> = {
  "helm-coordinator": BOSUN,
}

/** Trim and normalize a preset id; maps legacy aliases. Empty/None → undefined. */
export function normalizePresetAlias(id: string | undefined | null): string | undefined {
  if (typeof id !== "string") return undefined
  const trimmed = id.trim()
  if (trimmed === "") return undefined
  return LEGACY_PRESET_ALIASES[trimmed] ?? trimmed
}

// ── Caller-target policy (design §5.1 table) ────────────────────────────────

/**
 * Validate a resolved dispatch target against the caller's own preset.
 *
 * | Caller preset | Default target | Allowed targets |
 * |---|---|---|
 * | `helmsman` | `bosun` | `bosun` only |
 * | `bosun` | `hands` | `hands` only |
 * | `hands` | none | none — dispatch refuses even if a tool was exposed |
 * | legacy/non-role | `bosun` | `bosun`, `hands`, or a custom registered preset id |
 *
 * @returns a problem string when the target is denied; undefined when allowed.
 */
export function dispatchTargetProblem(
  callerPreset: string | undefined,
  target: string,
): string | undefined {
  if (callerPreset === HANDS) {
    return `the hands preset has no dispatch surface — Hands must perform work, not start children`
  }
  if (target === HELMSMAN) {
    return `"helmsman" is not a permitted dispatch target for any caller — Helmsman is the top-level composition, never a dispatched child`
  }
  if (callerPreset === HELMSMAN) {
    if (target !== BOSUN) return `a Helmsman may dispatch only "bosun" (got "${target}")`
    return undefined
  }
  if (callerPreset === BOSUN) {
    if (target !== HANDS) return `a Bosun may dispatch only "hands" (got "${target}")`
    return undefined
  }
  // Legacy / non-role caller: bosun, hands, or a custom (non-role) preset id.
  // Custom ids still fail the registry preflight when unregistered; the
  // blanket `helmsman`-target denial above already covers the role target.
  return undefined
}

/**
 * Per-caller default dispatch target (§5.1 precedence's `callerDefault` step):
 * helmsman → bosun, bosun → hands, legacy/other → bosun. A Hands caller never
 * reaches this — {@link dispatchTargetProblem} refuses it first.
 */
export function defaultTargetFor(callerPreset: string | undefined): string {
  return callerPreset === BOSUN ? HANDS : BOSUN
}

// ── Resolution precedence (design §5.1) ─────────────────────────────────────

/** Inputs to the §5.1 resolution precedence. Ids normalize (helm-coordinator→bosun). */
export interface DispatchSelection {
  /** Caller's own preset id (from `agentPresets.composedPreset`), if any. */
  callerPreset?: string | undefined
  /** This entry's explicit `role`. */
  entryRole?: string | undefined
  /** Batch-level `defaultPreset`. */
  defaultPreset?: string | undefined
  /** Batch-level `workerDefault` flag. */
  workerDefault?: boolean | undefined
}

export type DispatchTargetResolution =
  | { ok: true; target: string; source: "entry-role" | "default-preset" | "worker-default" | "caller-default" }
  | { ok: false; problem: string }

/**
 * Resolve one coordinators entry to a dispatch target.
 *
 * ```text
 * entry.role ?? defaultPreset ?? (workerDefault === true ? "hands") ?? callerDefault
 * ```
 *
 * Normalizes the legacy `helm-coordinator` alias before validation, then
 * applies the caller-target policy. Targets a caller may not use are refused
 * here — with zero children started (§5.2 preflight order).
 */
export function resolveDispatchTarget(sel: DispatchSelection): DispatchTargetResolution {
  const caller = normalizePresetAlias(sel.callerPreset)
  let target: string
  let source: "entry-role" | "default-preset" | "worker-default" | "caller-default"
  const role = normalizePresetAlias(sel.entryRole)
  const batch = normalizePresetAlias(sel.defaultPreset)
  if (role !== undefined) {
    target = role
    source = "entry-role"
  } else if (batch !== undefined) {
    target = batch
    source = "default-preset"
  } else if (sel.workerDefault === true) {
    // workerDefault retains its cheap worker route and now also selects Hands
    // when no stronger preset selector is present (§5.1). Hands is not a
    // permitted direct target for a Helmsman caller, so the policy check below
    // rejects exactly that intentional hierarchy narrowing (§5.4).
    target = HANDS
    source = "worker-default"
  } else {
    target = defaultTargetFor(caller)
    source = "caller-default"
  }
  const problem = dispatchTargetProblem(caller, target)
  if (problem !== undefined) return { ok: false, problem }
  return { ok: true, target, source }
}

// ── Route class (design §5.1) ───────────────────────────────────────────────

/**
 * Default model-route class for a target (§5.1): hands defaults to the worker
 * route; every other target defaults to the coordinator route. Explicit
 * per-child `model` overrides still win over the role-derived route.
 */
export function defaultRouteClassFor(target: string): "worker" | "coordinator" {
  return target === HANDS ? "worker" : "coordinator"
}
