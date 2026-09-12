# dsh-hive plugins — install kit (0.0.1 / 0.1.0)

The DSH plugins live in `../dsh-hive/packages/`; this directory is the
**install kit**: ready-made tarballs plus a dsh profile scaffold. Three ways
to install on a new machine, pick one:

| Way | Best for | What you need |
|---|---|---|
| **A. `dsh plugin add` from git** | the normal case — auto-managed, re-run to upgrade | a checkout of this repo (or this branch, pre-merge) |
| **B. tarballs + scaffold (this dir)** | offline / pinned-freeze installs | this directory |
| **C. `link:` to a checkout** | development on the plugins themselves | a built monorepo checkout |

Prereqs for all ways: **Node 22+, pnpm 11, git** (Way A's cohort is
git-hosted; pnpm `dlx` likewise needs it), and a model-provider credential —
see "Shared notes" (the step people miss).

## Way A — `dsh plugin add` from git (recommended)

The repo declares `workspaces` and each package self-builds on install
(`prepare`), so git-hosted installs carry a built `dist/`. Run ONE add
command with all eight packages (they are one cohort; tools needs its
siblings in the same install):

```sh
mkdir -p ~/.dsh/profiles/hive
cp <repo>/dsh-hive-dist/{.pnpmfile.cjs,cordis.yml,cordis.patch.yml} ~/.dsh/profiles/hive/

# first add: put a pnpm-workspace.yaml in the profile (dsh's template plus
# the two settings the git cohort needs — see "Profile pnpm-workspace.yaml"
# below). Then:
REF=main   # or a branch/tag
for p in agents dream-archive evolution hivemind painpoints tools; do
  SPECS+=("github:lohnn/evolutional_agent_structure#$REF&path:dsh-hive/packages/$p")
done
SPECS+=("github:lohnn/evolutional_agent_structure#$REF&path:dsh-hive/packages/berget-refresh")
SPECS+=("github:lohnn/evolutional_agent_structure#$REF&path:dsh-hive/packages/berget-usage")

DSH_HIVE_REF=$REF pnpm dlx --allow-build @deepseek-ai/dsh-subprocess-local --allow-build @google/genai --allow-build koffi --allow-build node-pty --allow-build protobufjs @deepseek-ai/dsh plugin --profile hive add "${SPECS[@]}"
```

Notes:

- **All eight in ONE add command.** The `.pnpmfile.cjs` hook rewrites the
  inter-package specs to the same repo+ref; installing one alone leaves its
  siblings unresolved.
- **`DSH_HIVE_REF`** seeds the hook's default template on the first add (the
  profile's own manifest doesn't have the specs yet while pnpm resolves).
  You can skip it once `REF=main`.
- **Re-running the same `add` command upgrades** the whole cohort to the new
  commit of `$REF`.
- Verify: `pnpm dlx --allow-build @deepseek-ai/dsh-subprocess-local --allow-build @google/genai --allow-build koffi --allow-build node-pty --allow-build protobufjs @deepseek-ai/dsh --profile hive --dump-config` → exit 0,
  8 plugin rows.

### Profile pnpm-workspace.yaml

pnpm 11.24 blocks two things this cohort legitimately needs; both are
opt-outable in the profile's `pnpm-workspace.yaml`:

```yaml
packages:
  - .
nodeLinker: hoisted
autoInstallPeers: false
dangerouslyAllowAllBuilds: true   # lets the git-hosted packages run their prepare (tsc)
blockExoticSubdeps: false         # lets tools' sibling deps resolve to the same git repo
```

- `dangerouslyAllowAllBuilds` is the blanket switch. The strict alternative
  is `allowBuilds:` entries keyed by the exact id pnpm prints on failure —
  but those keys embed the resolved commit hash, so every upgrade needs
  re-approval. In a dsh profile whose deps you chose, the blanket switch is
  the practical choice.
- `blockExoticSubdeps: false` is needed because `@hive/dsh-tools` depends on
  sibling `@hive/*` packages that can only come from the same git repo. The
  `allowBuilds`-style strict option does not exist for this one.

Do NOT delete `.pnpmfile.cjs` from the profile — without it, tools' sibling
`workspace:*` specs cannot resolve outside the monorepo.

## Way B — tarballs + scaffold (this directory, offline)

1. In a repo checkout: `cd dsh-hive && pnpm pack:all` regenerates the 8
   tarballs into this directory.
2. Copy this whole directory to `~/.dsh/profiles/hive/` on the other machine
   — tarballs + scaffold (`.pnpmfile.cjs`, `cordis.yml`, `cordis.patch.yml`,
   `package.json`).
3. There: `pnpm install`, then the same `--dump-config` verify.

No `pnpm-workspace.yaml` edits needed here: no prepare runs (tarballs carry a
built `dist/`), and tarball deps are not "exotic".

## Way C — `link:` to a checkout (development)

Build the monorepo (`cd dsh-hive && pnpm install && pnpm -r build`), then
make the profile depend on the package DIRECTORIES with absolute `link:`
paths (no `.pnpmfile.cjs` needed — sibling deps resolve via the monorepo's
own workspace install), same `cordis.*.yml` scaffold, `pnpm install`, verify.

## Shared notes

- **Run dsh from your workspace root** — the dir containing `.opencode/`.
  The service plugins default their `directory` config to the process cwd;
  `cordis.patch.yml` shows how to pin it explicitly.
- **Setup is copy-paste now**: in `dsh-hive-web.toml`, the five `>>> EDIT`
  values (workspace root, trusted host, hive ref, dsh version, kit path) are
  the only edits; workspace root/host/dsh-version/reach svcwatch's children
  through the service `env` — no other placeholders. `cwd` stays `.` because
  svcwatch chdirs literally (no env expansion); the command `cd`s to
  `DSH_WORKSPACE_ROOT` itself.
- **Model provider + credentials** (the step people miss): dsh needs a model
  route. For the Berget setup these plugins were gated with:
  `~/.dsh/berget-credentials.json` (login/token file, rotated in place by
  `dsh-berget-refresh`), a hand-declared `llm-pi-ai.providers.berget` models
  block in `~/.dsh/settings.yaml` — refresh it with
  `node dsh-hive/scripts/berget-models-sync.mjs` from a checkout — and
  `BERGET_API_KEY` UNSET in the service environment (a set var shadows the
  credential ref). Any other OpenAI-compatible provider works the same way
  via a settings.yaml route; only the refresh plugin and the usage panel
  (`dsh-berget-usage`, the web sidebar panel showing rolling seat budgets,
  per-model caps, subscription period and API credits) are Berget-specific.
  **Bonus:** if the machine already has a Berget Code login (opencode's
  `auth login` — `~/.local/share/opencode/auth.json`, key `"berget"`), the
  update script seeds `~/.dsh/berget-credentials.json` from it on first run
  (copy only — the refresh endpoint rotates tokens, so the script never
  calls it; the plugin takes over from there). Never overwrites an existing
  state file; source path overridable with `BERGET_AUTH_SOURCE`; debug with
  `dsh-hive-update.sh --berget-only`.
- **HIVE state survives nothing by accident**: the plugins create their
  state dirs on demand (`.opencode/dreams|hivemind|…` in the workspace,
  `mkdir -p` on first write), so a fresh machine starts empty. To carry
  history over, copy those dirs from an existing workspace BEFORE first
  boot.
- **Dreamcatcher preset** (needed for `hive_dispatch(capability:
  "dreamcatcher")`): copy `node_modules/@hive/dsh-agents/presets/dreamcatcher/`
  into `~/.dsh/.agent-presets/dreamcatcher/`.
- **Web client:** `dsh-hive-update.sh` configures the profile with
  `"@deepseek-ai/dsh-web-app"` and repairs earlier service profiles that used
  `"@deepseek-ai/dsh-headless"`.
- The `@deepseek-ai/*` versions the plugins were built and live-gated
  against: `0.1.2-rc.1`, cordis `^4.0.1`.

## Run it as a service (the other machine)

`dsh-hive-web.toml` (and the optional `dsh-hive-relay.toml`) are svcwatch
service templates: copy them into the target machine's
`<workspace-root>/.opencode/services/` and fill in the `env` line. The
watcher hot-reloads them; the HIVE stack then survives reboots and container
recreations exactly like `dsh-web` + `dsh-relay` do on the dev machine. The
relay is optional — only for exposing dsh beyond the machine (dsh refuses
`--host 0.0.0.0` by design).

**The TOML is the only locally maintained artifact.** Its `pre_start` is a
short fetcher: on every (re)start it syncs the kit (`dsh-hive-update.sh`,
`.pnpmfile.cjs`, both cordis ymls) from this repo at the pinned
`DSH_HIVE_REF` into `~/.dsh/hive-kit` (repo is public; raw.githubusercontent,
TLS), then execs the freshly fetched script. So the kit itself is
always-current too — hand-copying `dsh-hive-dist/` is only needed for the
tarball flow (Way B). Consequences, verified from a cold fake-HOME:

- cold bootstrap: kit fetch + profile scaffold + cohort from the public
  GitHub transport in ~25s, then `--dump-config` exit 0 / 7 rows
- offline with a cached kit → boots on the cached copy (stale-but-up)
- offline with nothing fetched yet → pre_start fails, start backs off until
  egress works
- `DSH_HIVE_REF=main` runs the repo's latest on every restart — the intent;
  pin a tag/SHA (or set `DSH_HIVE_RAW` for forks) to freeze

Future road (when wanted): the TOML itself can move into the repo the same
way — the pre_start chain is already built so the TOML is the only moving
part.

## Stay up to date (pre_start)

`dsh-hive-web.toml` declares a `pre_start` that runs on every (re)start of
the service: first it syncs the kit from the repo (see above), then
`dsh-hive-update.sh` re-runs the one-command `dsh plugin add` for the cohort
against the configured `DSH_HIVE_REF` (`env` in the TOML; default `main`).
So:

- svcwatch boot, crash-restart, or def-change ⇒ plugins re-resolve first,
  and the fresh dsh web boots on what it just updated.
- `svcwatchctl restart dsh-hive-web` is the manual "pull now".
- The dsh version pin lives ONCE, in the service's `env`
  (`DSH_VERSION`): `pre_start` inherits it from svcwatch, the main command
  expands `${DSH_VERSION:?...}` from it (bash fails loudly if the line is
  removed) — bump in one place, both sides follow.
- First run also bootstraps the profile scaffold from the kit dir next to
  the script — the script is self-teaching; existing files are never
  overwritten.
- Offline with an existing install ⇒ keeps it and boots anyway (stale-but-up
  beats down). Offline with nothing installed ⇒ the start aborts and backs
  off until it succeeds.
- Requires a svcwatch with `pre_start` support (this plugin version); a
  running old watcher must be restarted once (or the container recreated).
  `svcwatch pre_start` also fixed a latent marker bug: ctl-stop of a
  first-boot service could resurrect it; stops now always stay down.

## Verification already done

- `pnpm -r typecheck` / `build` / `test`: all green (35/35 incl. service harnesses)
- Tarball flow (Way B): install OK (pnpm hook and npm overrides), all 7
  entries import cleanly (incl. the `agents` SKILL.md asset read at module
  load), `dsh --dump-config` exit 0 with all 7 rows
- Git flow (Way A): all 7 installed with one `dsh plugin add` from
  git-hosted specs; each package self-built via `prepare` in pnpm's
  bun-based prepare runner (incl. tools' sibling-build step and the
  `workspaces`-field + `norewrite` fixes it required); `--dump-config`
  exit 0 with all 7 rows
- Update path: `dsh-hive-update.sh` exercised cold (bootstrap + install,
  15s), idempotent re-run, offline-tolerant (bogus ref + existing install ⇒
  warn + exit 0) and fail-closed (bogus ref + fresh profile ⇒ exit 1)
- svcwatch `pre_start`: 18-check behavioral driver over the real classes
  (success gates main, failure + backoff, timeout SIGKILL + retry,
  stop-during-pre resolves down, ctl-stop stays down, restart comes back)
