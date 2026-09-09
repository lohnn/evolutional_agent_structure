# dsh-hive plugins — install kit (0.0.1 / 0.1.0)

The DSH plugins live in `../dsh-hive/packages/`; this directory is the
**install kit**: ready-made tarballs plus a dsh profile scaffold. Three ways
to install on a new machine, pick one:

| Way | Best for | What you need |
|---|---|---|
| **A. `dsh plugin add` from git** | the normal case — auto-managed, re-run to upgrade | a checkout of this repo (or this branch, pre-merge) |
| **B. tarballs + scaffold (this dir)** | offline / pinned-freeze installs | this directory |
| **C. `link:` to a checkout** | development on the plugins themselves | a built monorepo checkout |

## Way A — `dsh plugin add` from git (recommended)

The repo declares `workspaces` and each package self-builds on install
(`prepare`), so git-hosted installs carry a built `dist/`. Run ONE add
command with all seven packages (they are one cohort; tools needs its
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

DSH_HIVE_REF=$REF pnpm dlx @deepseek-ai/dsh plugin --profile hive add "${SPECS[@]}"
```

Notes:

- **All seven in ONE add command.** The `.pnpmfile.cjs` hook rewrites the
  inter-package specs to the same repo+ref; installing one alone leaves its
  siblings unresolved.
- **`DSH_HIVE_REF`** seeds the hook's default template on the first add (the
  profile's own manifest doesn't have the specs yet while pnpm resolves).
  You can skip it once `REF=main`.
- **Re-running the same `add` command upgrades** the whole cohort to the new
  commit of `$REF`.
- Verify: `pnpm dlx @deepseek-ai/dsh --profile hive --dump-config` → exit 0,
  7 plugin rows.

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

1. In a repo checkout: `cd dsh-hive && pnpm pack:all` regenerates the 7
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
- **Dreamcatcher preset** (needed for `hive_dispatch(capability:
  "dreamcatcher")`): copy `node_modules/@hive/dsh-agents/presets/dreamcatcher/`
  into `~/.dsh/.agent-presets/dreamcatcher/`.
- **Web client instead of headless:** swap `"@deepseek-ai/dsh-headless"` for
  `"@deepseek-ai/dsh-web-app"` in the profile's `dsh.profile.bundles`.
- The `@deepseek-ai/*` versions the plugins were built and live-gated
  against: `0.1.2-rc.1`, cordis `^4.0.1`.

## Run it as a service (the other machine)

`dsh-hive-web.toml` (and the optional `dsh-hive-relay.toml`) are svcwatch
service templates: copy them into the target machine's
`<workspace-root>/.opencode/services/`, adjust the `<...>` placeholders
(workspace root, profile name, port, trusted host), and the watcher picks
them up by hot-reload. The HIVE stack then survives reboots and container
recreations exactly like `dsh-web` + `dsh-relay` do on the dev machine. The
relay is optional — only for exposing dsh beyond the machine (dsh refuses
`--host 0.0.0.0` by design).

## Stay up to date (pre_start)

`dsh-hive-web.toml` declares a `pre_start`: **`dsh-hive-update.sh` runs
before every (re)start of the service** and re-runs the one-command
`dsh plugin add` for the cohort against the configured `DSH_HIVE_REF`
(`env = { DSH_HIVE_REF = "main" }` in the TOML; default `main`). So:

- svcwatch boot, crash-restart, or def-change ⇒ plugins re-resolve first,
  and the fresh dsh web boots on what it just updated.
- `svcwatchctl restart dsh-hive-web` is the manual "pull now".
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
