---
description: HELM repo container — the dsh-hive DSH-plugin pnpm monorepo + install kit + docs. The OpenCode plugin surface (src/) retired 2026-11-27 with the DSH-only move.
---
# evolutional_agent_structure

This repo no longer ships an OpenCode plugin. Since 2026-11-27 it is the **container for the
DSH side**: the `dsh-hive/` pnpm monorepo (the live DSH plugins — board, evolution, tools,
hivemind, dream-archive, painpoints, helm, …), the `dsh-hive-dist/` install kit those packages
ship as, and the docs. Composition happens via the DSH profile (`~/.dsh/profiles/web`), not via
any root registration file.

## OpenCode retirement (2026-11-27 — DSH-only move)

Deleted, per the ratified teardown (`scratch/naming/helm-rebrand-design.md` §5.5):

`src/` (plugin runtime, absorbed `src/board-viewer/`, `src/svcwatch/`,
`src/oc-browser-bridge/`), `commands/`, `rules/`, `agents/`, `test/`, `fixtures/`,
`templates/_template.md`, `docs/board-viewer/`, `docs/OC-BROWSER-BRIDGE.md`,
`docs/BROWSER-TOOLING-SETUP.md`, `TODO.md`, root `bun.lock`, `/workspace/opencode.json`.
Replacement homes: board + board viewer → `dsh-hive/packages/board/` (contract:
`dsh-hive/packages/board/docs/board-tab-contract.md`); dream/comms/roster/tools →
`dsh-hive/packages/{dream-archive,hivemind,evolution,tools}/`. The DSH model-routing lever
is `agentOptions` on `ctx.subagents` (SHADOW-017) — the old `src/lib/model-resolve.ts`
frontmatter resolution is gone with the code.

svcwatch caveat: the container's running svcwatch (supervising dsh-web/dsh-relay/…) was booted
from the deleted `src/svcwatch/svcwatch.py`. A preserved copy sits in
`/workspace/scratch/naming/svcwatch-preserved/`; the durable fix is the entrypoint edit at the
next maintenance-window container recreation (design §5.5 step 7). Until then a fresh recreate
will not auto-start svcwatch.

## Layout

| Path | What |
|---|---|
| `dsh-hive/` | the DSH-plugin pnpm monorepo (twelve packages) |
| `dsh-hive-dist/` | the **install kit** those packages ship as (committed tarballs — the tarball NAME, version included, *is* the release identity) |
| `docs/` | DSH-era docs: DSH-UPDATE-RUNBOOK, WORKSPACE-STRUCTURE, LOCAL-PORTS, SVCWATCH, TOKEN-ECONOMY, HEADLESS-BROWSER-VERIFICATION |
| `skills/dreamtime/` | the dreamtime skill (symlinked from workspace `.helm/skills/`) |

## The dsh-hive cohort ships as a KIT — merge is not ship

`dsh-hive/` is the DSH-plugin pnpm monorepo; `dsh-hive-dist/` is the **install kit** those
packages ship as (committed tarballs — the tarball NAME, version included, *is* the release
identity). This machine runs a `link:` install of the working tree, so it sees everything the
moment it is written — every other machine installs tarballs and resolves `pkg@version`.
Split-brain lesson (2026-10-14, board buttons #59/#60 and again the same day, agents #54):
**a source PR merged without a repack ships to nobody.** A same-name repack also ships to
nobody — bump the version, always.

Definition of done for any `dsh-hive/packages/**` change, in the same PR:

```
pnpm --dir dsh-hive rebake <pkg…|--all>     # bump → build → pack → drop old →
                                            # repoint every ref site → run both gates
pnpm --dir dsh-hive rebake board --dry-run  # preview the plan, write nothing
```

The repoint list is non-obvious (`dsh-hive-update.sh` KIT_TARBALLS + SPECS,
`.pnpmfile.cjs`, the `dsh-profile-hive` `package.json`, the bootstrap test's cohort
pins) — which is exactly why it is scripted. CI (`.github/workflows/hive-kit.yml`)
fails a PR whose package sources are newer than their committed tarball
(`dsh-hive-dist/test/kit-freshness.test.sh`, pure git ancestry — no rebuilds). Keep
`dsh-hive/**` in that workflow's trigger paths: it once watched only `dsh-hive-dist/**`,
and source-only PRs slipped the kit gate entirely — the hole the whole rule now covers.
`research-rampage` is deliberately NOT kit-shipped (see `NOT_KIT_SHIPPED` in the gate).

Full cohort-bump checklist: `docs/DSH-UPDATE-RUNBOOK.md`; the three install ways and
their consumers: `dsh-hive-dist/README.md`.

## Gates (root)

`npx tsc --noEmit` exits 0 by construction (the root owns no TypeScript — `tsconfig.json` is
`files: []`); the real TS/test gates are per-package inside `dsh-hive/`
(`pnpm -r build` + `node --test` harness suites). Headless browser verification:
`docs/HEADLESS-BROWSER-VERIFICATION.md`.
