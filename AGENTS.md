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
| `src/svcwatch/` | svcwatch — declarative process supervision for the dev container (PID 1 subtree) | hive-infra |
| `src/oc-browser-bridge/` | headless OpenChamber browser pane (connects `openchamber_web` tools to container Chromium via svcwatch) | hive-infra |
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

## Agent frontmatter names the MODEL, not the provider

**Write `model: claude-sonnet-5`, never `model: anthropic/claude-sonnet-5`.**

This package is distributed. Which provider a user has auth for is a property of *their machine*,
not of the agent — a hardcoded `anthropic/` prefix simply breaks the agent on a machine with only
GitHub Copilot. It is a prefix problem and not a model-mapping one: in the models.dev catalog the
model *name* is identical across providers (`anthropic` and `github-copilot` both expose a model
literally called `claude-sonnet-5`), so the name travels and only the prefix has to be supplied
locally. `src/lib/model-resolve.ts` supplies it at config time.

| Frontmatter | Resolves to |
|---|---|
| *(no `model:`)* | nothing registered — the agent **inherits the session's model** |
| `claude-sonnet-5` | `<provider of the machine's default model>/claude-sonnet-5` |
| `anthropic/claude-sonnet-5` | **exactly that** — a `/` means "pin this, I mean it", passed through untouched |

Two rules the resolver never breaks:

- **`HIVE_MODEL_<AGENT>` overrides everything**, verbatim and unvalidated — e.g.
  `HIVE_MODEL_DREAMCATCHER=github-copilot/gpt-5.1`. Non-alphanumerics in the agent name become
  underscores (`board-viewer` → `HIVE_MODEL_BOARD_VIEWER`). It is an escape hatch; it does not
  second-guess you.
- **Every failure degrades to inherit, never to a guessed provider.** No default model, a default
  with no `provider/` prefix, or a catalog that positively says the provider lacks that model — all
  register no model, so the agent runs on the session's model, which is by definition a working one.

The models.dev catalog (`~/.cache/opencode/models.json`, XDG and macOS paths also checked) is used
**best-effort only**: absent, unreadable or missing that provider all resolve *optimistically* to
the composed id and let opencode be the judge. Only a positive "provider is present AND lacks this
model" drops to inherit. A stale cache must never silently unpin every agent.

**The provider comes from `config.model`, which is only populated by a config FILE** — verified
empirically: a `-m/--model` CLI flag does *not* feed it, and there is no global "last selected
model" state a plugin can see. So a machine that picks its model interactively rather than in
`opencode.json` will see every bare-name agent inherit. That is safe, not broken — but if you want
the pin honoured there, put `"model": "<provider>/<model>"` in `opencode.json`.

Every decision is logged at info as `[model] <agent>: <outcome>` with the frontmatter spec, the
machine's default, whether the catalog loaded, and the reason. That line is the diagnostic to read
first when an agent misbehaves on a new machine.

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
