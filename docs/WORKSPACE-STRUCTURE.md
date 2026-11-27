# Canonical Workspace Structure

The canonical folder-structure contract for a HELM workspace: the reproducible
folder layout that surrounds the state root, so any HELM setup — on any machine — has
the same, predictable shape.

> **OpenCode retirement (2026-11-27):** the OpenCode plugin that bootstrapped and
> owned the `.helm/` runtime was deleted from this repo — `src/index.ts` +
> `bootstrapProject()`, `commands/`, `rules/`, `agents/`, `templates/`, and
> `/workspace/opencode.json` (helm-rebrand design §5.5, DSH-only move). Composition
> happens via the DSH profile; the `.helm/` runtime trees are owned by the DSH
> plugins in `dsh-hive/packages/*` (board, dream-archive, hivemind, painpoints,
> evolution). Sections describing the plugin's bootstrap machinery — §4, §5,
> Appendix A, and the "gift is the plugin" framing — are kept as **historical
> fact-records of the deleted code**. Live and still-true: the folder contract
> (§2/§3, minus the retired design-shell rows), the per-project description
> convention (§6), and the no-project-table rule (§8). The `.opencode → .helm`
> compat symlink stays until one cycle passes.

**What "canonical" means here:** the *folder contract* — the tier layout
(`projects/`, `reference/`, `scratch/`) — reproduced
by **convention + this document** (the old-harness bootstrap that also generated it was
retired 2026-11-27; the DSH plugins create the `.helm/` runtime trees they own). It is a
layout convention, **independent of whether the workspace itself is version-controlled**.
The workspace-root git repo (if any) is incidental and this-machine-only; this workspace
does not keep one.

### The gift is the kit, not the workspace repo

**Historical framing (pre-2026-11-27, updated):** when HELM is given to another
machine, the gift artifact is the **dsh-hive install kit** (`dsh-hive-dist/` —
committed version-pinned tarballs wired by `dsh-hive-update.sh` + `.pnpmfile.cjs`,
see `docs/DSH-UPDATE-RUNBOOK.md`) — *not* a workspace git repo. Before the DSH
move this role belonged to a published OpenCode plugin package; that distribution
channel is retired with the plugin. What travels is the kit; what it needs around
it is this *folder contract* (the kit machines run DSH and materialize `.helm/` from
the DSH plugins, not from a bootstrap).

---

## 1. Purpose & Scope

**Canonical here means the workspace folder *shell* AROUND `.helm/` — NOT the
`.helm/` internals.**

> **State-root name (harbor move, 2026-11-27):** the state root was renamed
> `.opencode/` → `.helm/`. Documents, code constants, and fixtures in this
> repo speak `.helm/` natively; the legacy `/workspace/.opencode` path survives
> as a **compat symlink → `.helm`** (covered by tools/test/layout-probe.test.mjs,
> to be removed with the symlink itself). The old-harness plugin (retirement
> pending) still materializes `.opencode` on fresh machines — through the
> symlink both names address the same tree.

The boundary is hard and deliberate:

- **The DSH plugins own everything *inside* `.helm/`.** Since the 2026-11-27 retirement
  there is no bootstrap plugin: each runtime tree is created and owned by its DSH package
  (`dsh-hive/packages/*` — board, dream-archive, hivemind, painpoints, evolution) from its
  `directory: /workspace` cordis config. You do **not** author those by hand, and this
  document does **not** specify them beyond what the packages guarantee.

- **This document owns the *shell*** — the folder tiers around `.helm/` and
  the ignore discipline that keeps work + runtime out of any workspace repo.

If you are looking for what lives *inside* `.helm/`, read the owning DSH package
(`dsh-hive/packages/<board|dream-archive|hivemind|painpoints|evolution>`) — that is the
source of truth, not this file.

---

## 2. The Folder Contract

Four tiers plus the (partly retired) design shell:

- **`projects/`** — things actively worked on. Git-ignored by any workspace repo;
  each project is its **own** independent git repo (or a plain dir).
- **`reference/`** — everything kept around but **not** worked on. Git-ignored.
  Two subfolders:
  - **`reference/repos/`** — git clones of **other** codebases (inspiration /
    source to read, not to modify).
  - **`reference/material/`** — non-code reference material (books, exports, notes).
- **`scratch/`** — the user's own throwaway / scratch work. Git-ignored.
- **the design shell** — *retired with the plugin 2026-11-27*: `opencode.json` is
  **deleted from this workspace**, and the `.helm/index.ts` boot plugin +
  `.helm/rules/` never existed on this machine (gift-machine design only — see
  the historical table below); `AGENTS.md` and `.gitignore` remain.

```
<workspace-root>/
│
├── opencode.json                 ← RETIRED 2026-11-27 — plugin registration + permissions; deleted from this workspace
├── .gitignore                    ← workspace-level — "track design, ignore work+runtime" discipline
├── AGENTS.md                     ← workspace-wide agent instructions
│
├── .helm/                    ← MIXED — ignore the dir, re-include only design files (gift-machine git design; this workspace keeps no repo)
│   ├── index.ts                  ← RETIRED design — the BOOT plugin (never present on this machine; see §A3)
│   ├── rules/
│   │   └── no-update.md          ← RETIRED design — reserve /update for the user (nothing runs /update anymore)
│   ├── agents/
│   │   ├── capabilities/         ← MUTABLE state — capability prompt defs (owned by the evolution package)
│   │   │   └── _template.md      ← the capability seed (lives in state since the 2026-11-27 retirement of repo templates/)
│   │   └── dissolved/            ← retired capability prompts
│   │   └── …                     ← everything else under agents/ is IGNORED (runtime)
│   ├── skills/                   ← IGNORED  — runtime symlink dir (dreamtime → skills/dreamtime in this repo)
│   ├── dreams/                   ← IGNORED  (runtime) — artifacts, raw journals, DRM state
│   ├── hivemind/                 ← IGNORED  (runtime) — live message inboxes
│   ├── painpoints/               ← IGNORED  (runtime) — harness/workflow friction logs
│   ├── board/                    ← IGNORED  (runtime) — hive-board work items
│   └── *.log, hive-state.json    ← IGNORED  (runtime) — restart.log, evolution.log, energy
│
├── projects/                     ← IGNORED — things actively worked on
│   ├── <project-a>/              ← each is its OWN independent git repo (or plain dir)
│   └── <project-b>/
│
├── reference/                    ← IGNORED — kept around, NOT worked on
│   ├── repos/                    ←   git clones of other codebases (read, don't modify)
│   │   └── <some-cloned-repo>/
│   └── material/                 ←   non-code reference material
│       └── <book/, exports, …>
│
└── scratch/                      ← IGNORED — the user's own throwaway/scratch work
```

### Tracked-design vs ignored-runtime/work

| Entry | Status | Why |
|-------|--------|-----|
| `opencode.json` | **RETIRED 2026-11-27** | Registered the OpenCode plugin; deleted from this workspace with the engine (design §5.5 step 4). DSH composition is via the profile, not this file |
| `.gitignore` | kept | The enforcing mechanism of the folder contract (§3) — applies wherever a workspace repo exists |
| `AGENTS.md` | kept | Workspace-wide agent instructions (tooling/conventions — no project table; see §8) |
| `.helm/index.ts` | **RETIRED design** | The old **boot** plugin (restart log + `/update`) — nuclear design for gift machines; never present on this machine, OpenCode commands no longer exist |
| `.helm/rules/no-update.md` | **RETIRED design** | Safety rule reserving `/update` for the user — same retirement |
| `.helm/agents/capabilities/` | **State (owned by evolution pkg)** | Capability prompt definitions incl. `_template.md` — live in `.helm/`, owned by `dsh-hive/packages/evolution` |
| `.helm/agents/dissolved/` | **State (owned by evolution pkg)** | Retired capability prompts |
| everything else in `.helm/` | **Ignored (runtime)** | Owned/created by the DSH packages (no bootstrap since 2026-11-27) |
| `projects/` | **Ignored (work)** | Each project is its own repo; not part of the setup |
| `reference/repos/` | **Ignored (reference)** | Clones of other codebases you read but won't modify |
| `reference/material/` | **Ignored (reference)** | Non-code reference material |
| `scratch/` | **Ignored (work)** | The user's own throwaway work |

**`projects/` note:** each entry under `projects/` is an *independent* git repo (or
a plain directory). No workspace repo ever tracks their contents — only the design
shell around them. (On the builder machine, several projects — and the
`reference/repos/` clones — are embedded repos with their own remotes; the
workspace is oblivious to them by design, courtesy of the `/projects/` and
`/reference/` ignore rules. `workspace_map` resolves each entry's git root
per-entry, so those embedded/gitlink repos are reported correctly.)

---

## 3. The `.gitignore` Discipline

This is the enforcing mechanism of the entire contract. The governing rule, quoted
from the workspace root `.gitignore`:

> This repo versions the *workspace setup itself* — the OpenCode/HELM config and
> agent prompt definitions — NOT the projects we work on (each has its own repo)
> and NOT the live runtime state the HELM generates as it runs.
>
> **Rule of thumb: track the *design* of the workspace, ignore everything we are
> actively working on and everything generated at runtime.**

### Work + reference + scratch: ignore wholesale

```gitignore
# projects/  — things actively worked on (each has its own independent git repo)
/projects/
# reference/ — kept around but NOT worked on: reference/repos/ (clones of other
#              codebases) + reference/material/ (non-code reference, e.g. book/)
/reference/
# scratch/   — the user's own throwaway/scratch work
/scratch/

# Large / non-setup content anywhere
*.deb
*.tar.gz
```

A single `/reference/` rule covers both `reference/repos/` and
`reference/material/` (including any `book/` or large archives that now live
under it) — there are no per-item root rules to drift. `/scratch/` covers the
throwaway tier. `projects/` is unchanged.

### `.helm/`: ignore the directory, then **re-include** the design files

`.helm/` is mixed — mostly runtime, a few design files. The discipline is:
ignore the whole directory, then re-include exactly the design entries with `!`
re-include rules. This is the "track the design, ignore the runtime" pattern made
concrete:

```gitignore
# Ignore the whole directory…
/.helm/*

# …then re-include the config + plugin wiring
!/.helm/index.ts
!/.helm/rules/
!/.helm/agents/

# Within agents/, track only the prompt definitions, not runtime state files
/.helm/agents/*
!/.helm/agents/capabilities/
!/.helm/agents/dissolved/
```

**Re-include mechanics — read them in order:**

1. `/.helm/*` ignores every top-level entry in `.helm/`.
2. `!/.helm/index.ts`, `!/.helm/rules/`, `!/.helm/agents/`
   un-ignore only the design entries.
3. `/.helm/agents/*` then re-ignores everything *inside* `agents/`…
4. …and `!/.helm/agents/capabilities/` + `!/.helm/agents/dissolved/`
   re-include only the two prompt-definition subtrees — so runtime files like
   `agents/hive-state.json` stay ignored.

**`skills/` is intentionally NOT tracked here.** It is a runtime symlink dir
(`dreamtime → <repo>/skills/dreamtime` — the target is `skills/dreamtime/` in THIS repo) whose
*content* is versioned in this repo, not in a workspace setup repo. It's covered by `/.helm/*`
and also by a nested `.helm/.gitignore`. It **was** wired in at runtime by the plugin's
`bootstrapProject()` (see §A1, §5) — retired 2026-11-27; the existing symlink on this machine
predates that and still resolves into this repo (`skills/dreamtime/` is kept).

---

## 4. Two Provisioning Modes

> **RETIRED 2026-11-27.** This section described how the OpenCode plugin resolved its assets in
> vendored vs published installs — `opencode.json`, `PACKAGE_ROOT`, published-plugin npm
> distribution. All gone with the engine. Kept verbatim as a fact-record.

The plugin resolves all of its *own* assets from its own module location
(`import.meta.url`), not from a fixed workspace-relative path (see §A2). This is
what makes both modes work from the same code.

| Aspect | **Builder machine** (this one — the exception) | **Gift / published machine** (the norm) |
|--------|-----------------------------------------------|-----------------------------------------|
| Plugin location | Vendored at `projects/evolutional_agent_structure/` | Installed as a published/global OpenCode plugin package |
| `opencode.json` registration | Relative src path: `"./projects/evolutional_agent_structure/src/index.ts"` | Package name: `"evolutional-agent-structure"` |
| `PACKAGE_ROOT` resolves to | `…/projects/evolutional_agent_structure/` (sibling of `.helm/`) | The global package install dir (wherever the plugin manager put it) |
| Skills symlink `src` (target) | `PACKAGE_ROOT/skills/dreamtime` → resolves into the vendored sibling | `PACKAGE_ROOT/skills/dreamtime` → resolves into the **installed package** dir |
| Skills symlink `dest` | `<workspace>/.helm/skills/dreamtime` | `<workspace>/.helm/skills/dreamtime` |
| Skills symlink outcome | Resolves to sibling — works | **Resolves to the installed package's `skills/` — works, does NOT dangle** (see §A1) |
| Shipped assets (agents, commands, rules, `_template.md`) | Read from `PACKAGE_ROOT` (sibling) | Read from `PACKAGE_ROOT` (installed package) — same code path |

**Published-install skills symlink — verdict (per Part A / §A1): it works, it does
not dangle.** The symlink target is computed from the plugin's own install
location via `import.meta.url`, and `skills/` ships in the published package (no
`files` field, no `.npmignore`, so npm includes it). So on a gift machine the
symlink points into the installed package's `skills/dreamtime`, exactly as it
points into the vendored sibling here. There is **no vendored-layout assumption**
in the asset-resolution code.

The only residual caveats are environmental, not layout-related:
- Symlink creation requires an OS/filesystem that supports symlinks (some
  Windows/sandbox setups do not). If symlinks are unavailable, `dreamtime` skill
  discovery would fail — but this is unrelated to whether the plugin is vendored.
- The published package must actually contain `skills/`. It does today; a future
  `files`/`.npmignore` change that dropped `skills/` would break discovery. Worth
  a publish-time check.

---

## 5. The Bootstrap Contract

> **RETIRED 2026-11-27.** `bootstrapProject()` lived in the deleted `src/index.ts`. The trees it
> used to create are now created/owned by the DSH packages themselves (board, dream-archive,
> hivemind, painpoints, evolution — each from its `directory: /workspace` cordis config); the
> skills symlink is the one survivor on this machine (kept, see §3). Kept verbatim as a
> fact-record of the deleted mechanism.

`bootstrapProject(directory)` runs on **every** session start (and on
`hive-setup`). It is idempotent — safe to run repeatedly. It **generates
automatically** (so it need NOT pre-exist on a gift machine):

Workspace-root taxonomy shell (created empty if absent — the folder contract's
tier dirs, so the taxonomy exists and `workspace_map` can enumerate it on any
machine; all are git-ignored, so empty dirs add zero tracked clutter):
- `reference/repos/`, `reference/material/`, `scratch/`

Under `<workspace>/.helm/`:
- `agents/capabilities/` and `agents/dissolved/` (created if absent)
- `agents/capabilities/_template.md` — copied from the plugin's
  `templates/_template.md` **only if not already present** (never overwrites a
  local one)
- `dreams/` tree: `active/`, `history/`,
  `artifacts/{insights,warnings,songlines,shadows}/`, `raw/`, `raw/.harvested/`,
  `index/telemetry/`
- `painpoints/` tree: `raw/`, `raw/.harvested/`
- `hivemind/` tree: `inbox/_broadcast/`, `processed/`
- `skills/` and the `skills/dreamtime` **symlink** into the plugin's own
  `skills/dreamtime` (re-created if the existing dest isn't already the right
  symlink)

> Note: bootstrap creates the tier *folders* (`projects/` is assumed to exist for
> your work; `reference/*` and `scratch/` are auto-created). It does **not** create
> the design-shell *files* — those are the authored seed below.

What must **pre-exist** as the authored seed (NOT generated by bootstrap):
- `opencode.json` (with the plugin registered — by package name on a gift machine)
- `.gitignore` (the §3 discipline)
- `AGENTS.md`
- `.helm/index.ts` (the boot plugin) and `.helm/rules/no-update.md`

**Minimal gift-machine seed, therefore:** install the published plugin, register it
in `opencode.json` by name, drop in the design-shell files above, and start
OpenCode. The tier folders (`reference/*`, `scratch/`) and everything under
`.helm/` materialize on first load. Note the folder contract is a *convention*:
it holds whether or not the workspace itself is under git — git-ignore rules only
matter if you choose to version-control the workspace root.

---

## 6. Per-Project Description Convention

`workspace_map` surfaces a short **description** for each project so you can tell
what something is without opening it. Descriptions are read from front-matter, on
an **opt-in** basis, with a fallback chain:

1. The project's own **`AGENTS.md`** YAML front-matter `description:` field.
2. If that file has no front-matter `description`, fall back to the project's
   **`README.md`** front-matter `description:` field.
3. If neither carries one, the project shows **no description** — graceful, never
   an error.

To give a project a description, add a YAML front-matter block at the very top of
its `AGENTS.md` (preferred) or `README.md`:

```markdown
---
description: One-line summary of what this project is.
---

# Project Title
…
```

Notes:
- The field is a single flat string. Keep it to one concise line — `workspace_map`
  truncates long values in the list-all view and shows the full text for a single
  named lookup.
- This is **opt-in and additive**. Projects with a plain `# Heading` and no
  front-matter (the current state of every project on the builder machine) simply
  show no description; nothing breaks.
- The parser is the plugin's own front-matter reader (`lib/frontmatter`), the same
  one used for agent/command prompt files — so quoting and nesting behave
  identically.

---

## 7. Known Drift / Watch-Outs

Current, real observations — recorded so a gift-machine setup (or a cleanup pass)
doesn't inherit them. **Not fixed here.**

1. **Project descriptions are unset everywhere (expected, opt-in).** No project
   currently carries a front-matter `description:` (they open with a `#` heading),
   so `workspace_map` shows no description for any of them today. This is the
   default state of the §6 convention, not a bug — add front-matter per project as
   desired.

2. **`.gitignore` tracks the *live* capability roster (intentional — left as-is).**
   The re-include rule `!/.helm/agents/capabilities/` pulls in **every**
   capability prompt in that directory, so on the builder machine the workspace git
   would carry this machine's full live roster, not just `_template.md`. This is a
   known "leak" of machine-specific state into the workspace repo — but since the
   **gift artifact is the published plugin, not the workspace repo** (see the intro),
   it does not affect distribution and is deliberately **left unchanged**.

3. **Skills symlink on published install — RESOLVED, not a gap.** The original
   concern was that the symlink might hardcode the vendored sibling path and
   dangle on a published install. Part A (§A1) shows it does **not**: the target is
   computed from the plugin's own install location and `skills/` ships in the
   package, so it resolves correctly on a gift machine. The only watch-outs are
   environmental: (a) the host must support symlinks, and (b) a future
   `files`/`.npmignore` change must not drop `skills/` from the published package.

---

## 8. Root `AGENTS.md` Carries No Project Table

The root `AGENTS.md` deliberately does **not** contain a project table — a
hand-maintained table drifts from `projects/` reality (it always did). Instead,
`AGENTS.md` stays scoped to workspace-wide tooling and conventions, and points
agents at the **`workspace_map`** tool as the live source of truth for what
projects exist, where they are, their git state, and their description. Do not
reintroduce a project table into `AGENTS.md` or duplicate one here — `workspace_map`
is the register.

---

## Appendix A — Part A Investigation Findings (fact-per-code)

> **RETIRED 2026-11-27** — describes code (`src/index.ts`, `src/hooks.ts`) that no longer
> exists. Kept verbatim as the fact-record of the deleted mechanism; do not cite as current.

Grounded in `src/index.ts` and `src/hooks.ts` as they exist at the time of writing.
Behavior stated is what the code does, not what is assumed.

### A1. Skills symlink

- **Where:** `bootstrapProject()` in `src/index.ts`.
- **Target computation:** the symlink **source** is
  `path.join(PACKAGE_ROOT, "skills", entry)`, where
  `PACKAGE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")`.
  It is **computed from the plugin's own module location** — NOT hardcoded as a
  workspace-relative sibling path.
- **Dest:** `path.join(directory, ".helm/skills", entry)` — i.e. under the
  *workspace* root passed in by OpenCode.
- **Symlink vs copy:** it **symlinks** (`fs.symlinkSync(src, dest)`). It does not
  copy. Before linking, if a `dest` already exists and is not already the correct
  symlink (checked via `lstatSync` + `readlinkSync` exact-string match), it is
  removed and re-created; a matching existing symlink is left untouched.
- **Published install (no `projects/evolutional_agent_structure/`):** the target
  still resolves — `PACKAGE_ROOT` points at the *installed package* dir, and its
  `skills/` subdir ships (the plugin has no `files` field and no `.npmignore`, so
  npm includes `skills/`; the plugin's own `.gitignore` only excludes
  `node_modules/` and `dist/`). So the symlink points into the installed package,
  **it does not dangle.** The guard `if (fs.existsSync(pluginSkillsDir))` means
  that if `skills/` were somehow absent, bootstrap simply **skips** the symlink
  step rather than failing.

### A2. Plugin self-location (asset path resolution)

Every asset the plugin *ships* is resolved from `PACKAGE_ROOT` (install-location
relative → **portable**). Every path into *runtime state* is resolved from
`directory` (the workspace root → correct in every mode). No asset read is
workspace-relative in a way that assumes the vendored layout.

| Asset | Resolved from | Portable? |
|-------|---------------|-----------|
| `agents/*.md` (`AGENTS_DIR`) → `config.agent` | `PACKAGE_ROOT/agents` | ✅ portable |
| `commands/*.md` (`COMMANDS_DIR`) → `config.command` | `PACKAGE_ROOT/commands` | ✅ portable |
| `templates/_template.md` (`TEMPLATES_DIR`) copy | `PACKAGE_ROOT/templates` | ✅ portable |
| `rules/delegation.md`, `rules/coordinator-dreams.md`, `rules/hivemind-capabilities.md` (`RULES_DIR`, injected via `ctx.rulesDir` in `system.transform` — the first two coordinator-only, the last capability-only) | `PACKAGE_ROOT/rules` | ✅ portable |
| `skills/*` symlink source | `PACKAGE_ROOT/skills` | ✅ portable |
| `package.json` (version read) | `PACKAGE_ROOT/package.json` | ✅ portable |
| all `.helm/…` runtime (dreams, hivemind, painpoints, board, capabilities, skills **dest**) | `directory` (workspace) | ✅ correct — always the workspace |

`readMdDir()` is existence-guarded (`if (!fs.existsSync(dirPath)) return []`), so a
missing shipped-asset dir degrades to "no agents/commands registered" rather than
crashing. **No code path assumes the plugin lives at `projects/…`.**

### A3. `opencode.json` registration

- **This machine (builder):** the root `opencode.json` `plugin` array is:
  ```json
  "plugin": [
    "./.opencode/index.ts",
    "./projects/evolutional_agent_structure/src/index.ts",
    "./projects/opencode-discord-bridge/dist/index.js"
  ]
  ```
  HELM is registered by **relative src path** (vendored).
- **Published-install equivalent:** register by **package name**, e.g.
  `"evolutional-agent-structure"` in the `plugin` array (OpenCode resolves it from
  the installed plugin package).
- **The boot plugin `.helm/index.ts` is separate and unrelated to HELM
  (confirmed).** It is a small independent plugin that maintains
  `.helm/restart.log` and registers a `/update` command (which runs
  `opencode upgrade && kill 1`). It shares no code with HELM and is registered as
  its own entry in the `plugin` array. On a gift machine it is part of the design
  shell (tracked), but it is not the HELM plugin.

### A4. Anything else that assumes the vendored layout

- **Nothing in the plugin's own asset resolution** assumes it. The only place the
  vendored path appears literally is the *builder machine's* `opencode.json`
  registration and the resulting on-disk absolute symlink target — both are
  artifacts of this machine being the vendored exception, not code-level
  assumptions.
- **Environmental, not layout:** symlink support must exist on the host; the
  published package must keep shipping `skills/`. See §6.3.
