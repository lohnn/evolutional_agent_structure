# dsh-research-rampage

The `/research-rampage` command — a coordinator-run, **multi-subagent deep-research
protocol** for dsh sessions.

## What it does

Running `/research-rampage <topic>` (topic optional) arms the session's model as a
*rampage coordinator* by injecting `assets/brief.md` as a user-role followup (the
same prompt-injection shape as the HIVE lifecycle commands in `@hive/dsh-evolution`
— a dsh slash command runs against the agent without creating a model message, so
the handler's only job is to enqueue the brief). The brief is read **per launch**,
so edits to it are live-serve material and reach the next rampage with no restart.
The model then executes:

| Phase | What happens |
|---|---|
| 0 — INTERROGATE | batches of `ask_user_question` rounds freeze the brief (core question, audience, depth tier, scope, freshness, trust, output shape); silence or "just go" ramps on stated assumptions |
| 1 — BLUEPRINT | 5–12 research tracks from different angles, each with mission, questions, must-cover entities, verification bar; the shared pool `<out>/findings/` is created |
| 2 — RAMPAGE | MODE SELECT: **TEAM MODE** (Agent Teams available) spawns a durable writer first, then researcher teammates (≤6 at once) delivering to the shared pool; **FLEET MODE** spawns parallel one-shot `subagent` children (or a scripted `workflow` fan-out) whose returns the coordinator files into the pool; wave 2 = adversarial verifiers + gap-fillers; wave 3 = red-team (exhaustive tier) |
| 3 — LAND | THE WRITER (exactly one — a durable teammate in team mode, a one-shot child otherwise) reads the entire pool as its only input, decides the format, and writes `report.md` (TL;DR, confidence + cited findings, per-track sections, contradictions, source index) and/or `site.html` — one self-contained interactive file, no CDN, opens from `file://`; it adds no facts and routes uncited material back as defects, never silently drops it |
| 4 — VALIDATE | a brand-new auditor `subagent` per round tries to BREAK the report: it `web_fetch`es every load-bearing citation (the link must HOLD the claim), re-checks findings for contradicted/superseded sources; a FAIL dispatches fixers (team mode: the OWNING researcher via message; fleet mode: fresh fixer children) and re-audits — ≤3 rounds, residual defects land as an explicit `VALIDATION DISCLOSURE`, never silently |
| 5 — TL;DR | the writer drafts it, the coordinator delivers it: validation outcome + verdict-style executive summary in chat + `present`-ed file cards |

## Shape

- **No service state, no config** (like `dsh-berget-refresh`): pure command producer,
  `static inject = ["commands"]`.
- The protocol text is the real implementation — `test/brief-drift.test.mjs` carries
  a drift guard over its load-bearing markers (phases, modes, tool names, writer
  contract, pool, citation discipline, artifact contract, serving constraints), and
  `test/service-harness.mjs` boots the plugin against a real cordis Context +
  CommandRuntime (mount, discovery, handler paths, dispose).
- Ships a profile-bundle layer (`cordis.patch.yml` with a `dsh.bundle` manifest
  field, row id `research-rampage`); a profile that adds the package as a
  dependency gets the command with no user-patch rows.
