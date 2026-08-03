---
description: The HIVE plugin itself (evolutional-agent-structure) — agent prompts, commands, custom tools, the dream/board/HIVEmind layers, bootstrap, AND the hive-board viewer. This is the reusable engine, distributed as a single published opencode plugin.
---
# evolutional_agent_structure

The HIVE plugin — the collective-intelligence coordinator for opencode. See `docs/WORKSPACE-STRUCTURE.md` for the canonical workspace folder contract this plugin expects and bootstraps.

**This package ships HIVE *and* the hive-board viewer as one dependency.** The viewer was absorbed
from `projects/hive-board/` on 2026-08-03; that directory no longer holds the source.

## Layout

| Path | What | Owner |
|---|---|---|
| `src/index.ts`, `src/hooks.ts`, `src/tools.ts` | plugin runtime opencode loads every session | hive-infra |
| `src/lib/` | shared modules: locked board store, transition module, dream/YAML parsers, HIVEmind | hive-infra |
| `src/board-viewer/` | the hive-board viewer app | board-viewer |
| `test/board-viewer/`, `fixtures/`, `docs/board-viewer/` | the viewer's tests, fixtures, docs | board-viewer |
| `package.json`, `tsconfig.json`, `exports`, `bin` | packaging | hive-infra |

## No build step

`main`/`exports` point at `src/*.ts` **directly**. `dist/` is gitignored and is never loaded at
runtime. There is no build script — do not go looking for a build artifact to prove correctness.

```
npx tsc --noEmit   # the only typecheck signal
bun test           # tests import bun:test and ONLY run under bun (W-075)
bun run board      # start the viewer locally (binds 127.0.0.1)
```

Under node/tsx the tests fail with a misleading `ERR_UNSUPPORTED_ESM_URL_SCHEME` that looks like a
regression but is not.

## Guards that are load-bearing

`test/entrypoint-isolation.test.ts` enforces three invariants that are otherwise invisible until
they break on someone else's machine. All three were verified to fail on a real injected violation:

1. **`src/index.ts` never reaches `src/board-viewer/`.** The plugin entrypoint loads in every
   opencode session, in every project; a viewer import there drags `Bun.serve` and the whole HTTP
   surface into plugin load.
2. **Viewer code never writes to disk directly.** Until the merge this was enforced by the npm
   package boundary. It is now enforced by the guard (I-048: it should never have depended on
   packaging).
3. **Server code never leaks into the browser bundle** (I-192), asserted against the *emitted*
   bundle rather than a static import scan — type-position imports are erased and must not be
   flagged.

The guard also **pins** the bun-only modules reachable from the entrypoint to exactly
`["bun:sqlite"]`. That dependency predates the viewer merge (`src/index.ts` →
`lib/board-reconcile-db.ts` → `bun:sqlite`): the plugin already requires a Bun host. The pin keeps
that visible and deliberate rather than letting it quietly grow.
