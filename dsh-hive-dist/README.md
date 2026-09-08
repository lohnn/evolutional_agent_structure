# dsh-hive plugin tarballs (0.0.1 / 0.1.0)

Packed from `/workspace/projects/evolutional_agent_structure/dsh-hive` on
2026-09-08. This directory is a **self-contained dsh profile template**: copy
the whole thing to the other machine and install.

## Contents

| Tarball | Plugin id | What it is |
|---|---|---|
| `hive-dsh-dream-archive-0.0.1.tgz` | `dream-archive` | Dream archive service (insights/warnings/songlines/shadows, DRM state, rank, dedupe) |
| `hive-dsh-painpoints-0.0.1.tgz` | `painpoints` | Pain-point journal service |
| `hive-dsh-tools-0.0.1.tgz` | `hive-dream-tools` | The `hive_dream_*` / `hive_note_painpoint` tool surface |
| `hive-dsh-agents-0.0.1.tgz` | `hive-agents` | `dreamtime` skill (runtime-registered) + `presets/dreamcatcher/` + `dreamcatcher.md` |
| `hive-dsh-evolution-0.0.1.tgz` | `evolution` | Energy/lifecycle service (`/spawn` `/evolve` `/dissolve` `/tick`, `hive_dispatch`) |
| `hive-dsh-hivemind-0.0.1.tgz` | `hivemind` | HIVEmind messaging service |
| `dsh-berget-refresh-0.1.0.tgz` | `dsh-berget-refresh` | Berget auth token refresh provider |

Plus the profile scaffold: `package.json`, `.pnpmfile.cjs`, `cordis.yml`,
`cordis.patch.yml`.

## Install on the other instance

```sh
mkdir -p ~/.dsh/profiles/hive
cd ~/.dsh/profiles/hive
# copy this whole directory in (tarballs + scaffold), then:
pnpm install
pnpm dlx @deepseek-ai/dsh --profile hive --dump-config   # gate: exit 0, 7 plugin rows
```

Then launch dsh with `--profile hive` from your workspace root (the dir that
contains `.opencode/`). The service plugins default their `directory` config
to the process cwd; see `cordis.patch.yml` for how to pin it explicitly.

- **Web client instead of headless:** in `package.json`, swap
  `"@deepseek-ai/dsh-headless"` for `"@deepseek-ai/dsh-web-app"` in
  `dsh.profile.bundles`.
- **Keep `.pnpmfile.cjs` next to `package.json`.** `@hive/dsh-tools` depends on
  sibling `@hive/*` packages by version; since they are not on npm, the hook
  rewrites those specs to the local tarballs. pnpm `overrides` alone does not
  reach `file:`-tarball dependencies (verified on pnpm 11.24.0). npm users can
  instead use an `"overrides"` block — also verified — but pnpm + the hook is
  the tested configuration.
- The `@deepseek-ai/*` deps pinned in `package.json` (`0.1.2-rc.1`, cordis
  `^4.0.1`) are the versions these plugins were built and live-gated against.

## Verification already done on the pack side

- `pnpm -r typecheck` / `build` / `test`: all green (35/35 incl. service harnesses)
- Tarball contents: `dist/` + declared assets only; no `src/*.ts`, no tests;
  `workspace:*` specs rewritten to `0.0.1` by `pnpm pack`
- Consumption from tarballs in an isolated profile: install OK (pnpm hook and
  npm overrides), all 7 entries import cleanly (incl. the `agents` SKILL.md
  asset read at module load), `dsh --dump-config` exit 0 with all 7 rows
