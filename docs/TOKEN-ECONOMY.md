# Token Economy — making awakened HIVE sessions affordable

Status: **in implementation** (branch `hive-token-economy`, off fresh `main` @ 9924968).
Origin: user directive 2026-12 — "/awaken uses way too many tokens for not too
much gains. Optimize the workflow without trading output quality for cheaper
token usage."

This document is the working spec: the measured cost map, the verified dsh
facts that constrain the design, the decisions (D1–D10), and the ordered
implementation checklist. Each decision names its test story.

---

## 1. Where the tokens go (measured, dsh-hive @ main)

### Standing per-turn surface of an awakened coordinator

| Item | Size (source-measured) | ≈ tokens/turn |
|---|---|---|
| 11 `hive_dream_*` tool descriptions + schemas | ~6.7K chars desc; ~15–20K with schemas | ~4–5K |
| 8 `hive_board_*` tools (very long descriptions) | ~8K chars desc | ~4K |
| 4 `hive_*` hivemind tools | ~3K chars | ~1.5K |
| 3 painpoint tools | ~1.5K chars | ~0.7K |
| `hive_dispatch` (desc + 5 verbose params) | ~3.8K chars | ~1K |
| `assets/doctrine.md` standing section (order 55) | 10.5 KB | ~2.6K |
| **Total awakened standing surface** | | **~13–15K/turn** |

The dormant gate keeps the 7 board discovery/authoring tools open
(`HIVE_DORMANT_OPEN_TOOLS`), so dormancy is not free either — but the delta
at flip is ~20 tools + doctrine.

### Recurring bleed: dream recall before every delegation

`doctrine.md` §"Dream Recall (mandatory — never skip)": a one-shot
`builtin/dreamcatcher` consult per delegation, whose full-artifact content is
paid **three times**:

1. dreamcatcher reads full artifacts via `hive_dream_query` (child input),
2. re-renders them as a `DREAM RECALL` block (child output, into coordinator
   input),
3. coordinator re-pastes them **verbatim** into the dispatch prompt
   (coordinator output + worker input).

≈5–15K tokens per delegation, every delegation.

### One-time awaken cost

Brief + dossier + batch-spawn schema + the mandatory flip-time recall
(4.8KB dreamcatcher persona + full inherited base tool surface for 3–5
turns).

---

## 2. Verified dsh facts (0.2.0-rc.2, the pinned host)

Facts checked against the live store packages, not assumed:

- **F1 — `spawn_teammate` has NO model override.** Tool schema is exactly
  `{name, description, prompt, context}` and the host-side
  `SpawnTeammateRequest` (`dsh-experimental-agent-team/lib/types/types.d.ts`)
  is `{name, description, prompt, context, provider, signal}` — `provider`
  selects the subagent *provider* ("spawn"/"fork"), not an LLM route. No
  `agentOptions`, no `persona`, no `toolFilter`. The member *view* reports
  provider/model as read-only diagnostics.
- **F2 — The team profile REPLACES the subagent tools.**
  `dsh-experimental-agent-team-profile/cordis.patch.yml` disables
  `tool-subagent`, `tool-subagent-control`, `tool-subagent-list-agents`,
  `tool-subagent-fork` and installs `agent-team` + `tool-agent-team`.
  Consequence: `list_agents`/`send_message` are **team-roster-scoped**; HIVE
  children spawned via `ctx.subagents.startContinuable` are likely NOT
  addressable through them in this profile (the `hive_dispatch` echo text
  claiming otherwise predates the team profile — VERIFY, D5).
- **F3 — `ctx.subagents.startContinuable` supports everything teams lack:**
  `persona`, `toolFilter`, `agentOptions` (provider/model route merge over
  the parent's). HIVE's dispatch seam already uses all three.
- **F4 — The underlying spawn machinery already accepts agent options**;
  the team service simply doesn't pass them through. An upstream patch adding
  optional `agentOptions` to `SpawnTeammateRequest` is small and well-scoped.
- **F5 — Turn-scoped tool summoning exists and works** (the WI-037 pattern:
  `/spawn`, `/tick`, `/evolve` register a scoped tool that self-retracts).
  Reusable for the dream lifecycle (D4).
- **F6 — `hive_dream_rank` returns excerpts** (~200 chars) + flags
  (`trigger-match`, `stale`, `superseded_by:*`) with type floors for
  warnings/shadows. A coordinator-side first pass costs ≈6KB worst case
  (k=30), no child spawn needed.

---

## 3. Decisions

### D1 — Tier-based model routing (provider-PORTABLE pins)

Problem: pins must not name a provider — the user's other machine has two
providers (one work-only, one personal), and a hardcoded route breaks one of
them (the exact lesson the OpenCode plugin's `model-resolve.ts` encoded:
frontmatter names the MODEL, never the provider).

Design: capabilities and built-ins declare a **tier**, not a model:

- Preset `agent.cordis.yml` gains optional `model_tier: mechanical | standard | deep`.
- The Evolution service config gains a per-machine route table:
  `modelRoutes: { mechanical?: "<provider>/<model>", standard?: ..., deep?: ... }`
  — set per deployment (work machine → work provider's models; personal
  machine → personal provider's). Compose-time, never in the preset.
- Env overrides, verbatim and unvalidated (the OpenCode escape-hatch rule):
  `HIVE_MODEL_TIER_<TIER>` replaces a tier's route; `HIVE_MODEL_<CAPABILITY>`
  pins one capability/built-in exactly (non-alphanumerics → `_`).
- Resolution order at dispatch: per-call `model:` arg >
  `HIVE_MODEL_<CAP>` > preset exact pin (rare) > tier route >
  **inherit session model** (every failure degrades to inherit, never to a
  guessed provider — the standing OpenCode rule).
- Doctrine carries a 4-line tier policy: cheapest tier that can be correct;
  `mechanical` for well-specified/mechanical work, `standard` for
  implementation, `deep` for design/coordination/review.

Quality gate doctrine (the "better model checks after" idea, sharpened):
the cheapest verifier is CODE — tests, typecheck, lint, build (zero LLM
tokens, deterministic). Dispatch cheap → run the machine-checkable gate →
only escalate to a strong-model review consult when the task has no
machine-checkable criterion. Model review is the exception, not the pattern.

Example route tables (reviewer follow-up after the Kimi K3 audit: the
resolver ships with NO table, so out of the box every dispatch inherits —
the savings a deployment gets are exactly the table it configures). Copy
and edit; the model id is whatever the provider's catalog calls it:

Real Berget catalog ids (verified locally — copy only verified rows; a
route that names a model the provider lacks falls back to INHERIT, which is
a silent saving-loss, not an error):

```json
{
  "modelRoutes": {
    "mechanical": "berget/zai-org/GLM-5.3-Flash",
    "standard":   "berget/Qwen/Qwen3.8-27B-FP8",
    "deep":       "berget/zai-org/GLM-5.2"
  }
}
```

Two-machine example (the constraint that shaped this design): the work
machine has ONE provider, the personal machine another — the pins in the
preset name tiers, only these tables name models.

```js
// work machine (providers/models as your office policy pins them)
{ mechanical: "<work>/<fast-coder>", standard: "<work>/<workhorse>", deep: "<work>/<frontier>" }
// personal machine (Berget, ids as cataloged)
{ mechanical: "berget/zai-org/GLM-5.3-Flash", standard: "berget/moonshotai/Kimi-K3", deep: "berget/zai-org/GLM-5.2" }
```

Per-deployment overrides without touching the profile (env, takes
precedence over the table; a capability pin beats everything but the call
arg):

```bash
HIVE_MODEL_TIER_MECHANICAL=berget/zai-org/GLM-5.3-Flash   # a whole tier
HIVE_MODEL_DREAMCATCHER=openrouter/moonshotai/kimi-k3     # one capability, exact
```

Leave a tier's route empty (or unset the env) and dispatches at that tier
inherit the session's model — safe, never a guessed provider.

### D2 — Dreamcatcher runs at `mechanical`/`standard` tier by default

`BuiltinAgentDef` gains `modelTier`; dreamcatcher's Recall pins
`mechanical` (rank is a lexical pre-filter; with D3 its output shrinks to
ID lists — near-mechanical), Audit pins `standard` (whole-archive
contradiction reasoning). Overridable per call (`model:` arg) and per
machine (`HIVE_MODEL_DREAMCATCHER`). No coordinator memory required.

### D3 — Dream plumbing via code: pointers out, artifacts injected

The triple-pay dies. New flow:

1. Recall returns **pointers only**: artifact IDs + one-line relevance notes
   (a compact `DREAM POINTERS` block), never re-rendered artifact bodies.
2. `hive_dispatch` gains `dream_ids: "I-012,W-007,SNG-003"`. The dispatch
   seam resolves them via `dreamArchive.query()` and composes the FULL
   artifact text into the child's prompt/persona **in code** — zero model
   tokens for transport, no transcription drift, staleness flags
   re-evaluated at injection time (stale/superseded artifacts are injected
   with their flag, or refused with the reason named).
3. Coordinator keeps only the pointer lines in its context.
4. Doctrine change: recall becomes **rank-first, escalate on ambiguity** —
   the coordinator calls `hive_dream_rank` itself (F6, ~6KB worst case),
   and only consults the dreamcatcher child when the shortlist is ambiguous
   or an Audit is wanted. The mandatory-child-recall-per-delegation ritual
   ends.
5. `/awaken`'s flip-time recall (awaken-brief §0) defers: recall happens
   after the "what are we building" answer, with the real task as query —
   and skips entirely for pure-Q&A sessions (D9).

Dreamcatcher persona (`presets/dreamcatcher/persona.md`, three drift-guarded
copies) gains the pointer-output contract; the dispatch-contract test that
pins byte-identity across copies must be updated in the same commit.

### D4 — Dream-lifecycle tools become summon-scoped

The coordinator needs `hive_dream_residue`, `hive_dream_rank`,
`hive_dream_query`, `hive_dream_list` mid-session. It needs
`begin`/`complete`/`artifact_create`/`supersede`/`mark_stale`/
`detect_duplicates` only DURING dreamtime. A `/dream` command (and the
dreamtime skill's tool-load step) summons those six for the dream turns
only, riding the F5 pattern. ~4–6K tokens/turn off the standing surface.

Gate-list bookkeeping: `HIVE_TOOL_NAMES` stays the full census; the dormant
mask is unchanged; the awakened surface becomes census-minus-summoned.
`test/tool-gate-sync.test.mjs` and the dormant-open-surface test gain the
new partition.

### D5 — Agent teams: phased piggyback, blocked on F1 for full adoption

Given F1 (no model/persona/toolFilter on teammates) and F2 (team-scoped
messaging), wholesale migration of capability dispatch to `spawn_teammate`
is NOT viable at 0.2.0-rc.2 without losing D1/D2 (model routing) and the
read-only dreamcatcher. Phased instead:

- **Phase A (this branch):** keep spawning via `startContinuable`. VERIFY
  the F2 question live — can a HIVE child be reached by `send_message`
  under the team profile? Correct the `hive_dispatch` echo text and the
  doctrine's steering instructions to the verified truth.
- **Phase B (this branch):** adopt the teams *coordination patterns* inside
  HIVE doctrine where they're free: contract-ownership as explicit
  dependencies, peer-message-style reporting, shared task substrate via the
  board (hive_board items already carry ownership; doctrine teaches
  dependency naming in dispatch prompts).
- **Phase C (upstream, not this branch):** propose adding optional
  `agentOptions` (+ optionally `persona`, `toolFilter`) to
  `SpawnTeammateRequest` — F4 says the plumbing exists underneath. If/when
  that lands in a corridor, re-evaluate full team adoption (hivemind
  retirement, team_task substrate) in a dedicated WI.
- The 4 hivemind tools stay for now (their unique value: broadcast,
  cross-group async, offline recipients) but are **config-gated**:
  `evolution` config `hivemind: false` removes them from the awakened
  surface for deployments that coordinate synchronously. Default on
  (no behavior change), documented off-ramp.

### D6 — Doctrine diet: standing core + on-demand chapters

`doctrine.md` (10.5KB) splits: a ~3KB standing core (identity, dispatch
rules incl. D3's rank-first rule, the tier policy, working style, energy
table) stays at order 55; the chapters (spawn/merge/split semantics,
contract-ownership patterns, synapse detail) move to a plugin asset fetched
by a new `hive_doctrine(topic)` tool (awakened-only, tiny schema). The
command briefs link the chapters by name. ~1.5–2K tokens/turn saved.

### D7 — Tool-description diet + consult allow-lists

- Trim the long tool descriptions (worst offenders: `hive_board_list`
  ~1.2K chars, `hive_dream_query` ~1.2K, `hive_dispatch` ~1.3K): teaching
  text moves to the doctrine chapters / skill docs; schemas keep the
  contract-essential lines (refusals stay model-actionable).
- One-shot consults (D2's Recall) get an **allow-list-shaped toolFilter**:
  the dreamcatcher child sees the 4 read tools (+ fs read), not the full
  base harness surface. Implemented in the dispatch seam where the deny
  filter already rides (F3).

### D8 — Report budgets for capabilities

`capability-standing.md` gains a soft budget: final reports ≲500 words,
lead with the outcome, detail lives in files/artifacts — every report
lands verbatim in the coordinator's context. Free, immediate.

### D9 — Deferred awaken recall

Covered by D3.5: the awaken brief's §0 becomes "recall after the task is
known, via rank-first" — killing the flip-time one-shot child spawn for
sessions that turn out to be Q&A.

### D10 — Telemetry + cache ordering (investigate, small)

- Wire `dsh-session-stats` (present in the 0.2.0-rc.2 store) into a minimal
  per-child token accounting log at dispatch settle
  (`.opencode/hive-usage.jsonl`: child, capability, model route, tokens
  in/out where available). Empirical tier calibration comes later; the log
  is the enabler. If the stats service doesn't expose per-child usage
  cleanly, land the dispatch-side skeleton and defer the reader.
- Investigate (one spike, no commitment): whether volatile sections
  (roster, order 50) placed before static ones (doctrine, 55) hurt provider
  prompt-cache prefix hits; if so, reorder.

---

## 4. Implementation checklist (ordered)

1. [x] D1 tier routing: config schema, resolver (`lib/model-tiers.ts`),
      env overrides, `hive_dispatch` integration, unit tests
      (resolution order, degrade-to-inherit, env verbatim).
2. [x] D2 `BuiltinAgentDef.modelTier` + dreamcatcher pins; dispatch
      contract test updated.
3. [x] D3 pointer plumbing: dreamcatcher persona pointer contract (all
      copies + drift test), `dream_ids` on `hive_dispatch`, code-side
      artifact composition + staleness re-flag, tests.
4. [x] D3.5/D9 doctrine + awaken-brief rewrite (rank-first, deferred
      recall), drift-guard marker updates.
5. [x] D4 summon-scoped dream tools: `/dream` command + gate partition +
      sync tests. (commits 3eaed0f)
6. [x] D5-A verified: the model-facing `send_message`/`list_agents` are
      TEAM-member-scoped (live experiment: a spawned subagent child is
      refused as "active teammate not found"); the real parent↔child
      channel is SubagentRuntime.sendMessage/listChildren. `hive_send` +
      `hive_children` expose it; echoes + doctrine teach the truth.
      (commit 763de8f)
7. [x] D5-B hivemind config gate (`hivemind: false` masks the 4 mailbox
      tools top-level only; default true); sync + runtime legs.
8. [x] D6 doctrine split: 178-line standing core + 3 chapters via
      `hive_doctrine` (evolution / contracts / commands).
9. [x] D7 description diet (board 7801→5758 chars, dream tools, dispatch,
      per the agent-experience rules) + one-shot allow-list
      (`childToolFilterFor`, dreamcatcher Recall sees only the 4 read tools).
10. [x] D8 standing-report budget (outcome + next-move findings + retrieval
      pointers, ~40 lines).
11. [x] D10 usage-log skeleton (`.opencode/hive-usage.jsonl`, fire-and-forget;
      dispatch lines both shapes, settle lines for one-shot). Named residual:
      resident settles are host-side until a settle hook exists — the reader
      and the cache-order spike (§D10) stay open, deliberately small.
12. [x] Full suite green (`pnpm -r test`, node --test per package — 10
      packages, 0 failures) + tsc clean. Live smoke (fresh profile boot,
      /awaken, one dispatch with dream_ids, one dreamtime) deferred to the
      first session on the dsh branch — the D5 send-message-reality claim is
      the one part already live-verified, from this session's own DSH
      experiment.

## 5. Explicitly out of scope (this branch)

- Upstreaming `SpawnTeammateRequest.agentOptions` (Phase C, D5) — tracked
  as a follow-up proposal, not implemented here.
- Embedding-based dream ranking (`embedding-v1`) — orthogonal.
- Dreamtime model downgrade — deliberately NOT done: knowledge compression
  is the most quality-sensitive step in the system; it keeps the
  coordinator's model. Its token cost is instead attacked by D4 (tool
  surface) and D8/D3 (smaller inputs).

## 6. Preserved collateral

- The pre-existing uncommitted WI-064 spike (`board` awaken route +
  client edits) was stashed on branch switch:
  `stash: WI-064 awaken-route spike (board) — preserved before token-economy branch`.
  Not part of this work; restore with `git stash pop` when that WI resumes.
