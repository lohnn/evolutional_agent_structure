---
description: The hive-board viewer — a kanban board layer over HIVE's on-disk state, shipped inside the HIVE plugin package as src/board-viewer/.
---
# hive-board (the viewer)

> A kanban board layer on top of the HIVE plugin. Visualizes and drives **work items** as they
> move through Backlog → Todo → In Progress → Done, bound tightly to HIVE's real on-disk state
> (dreams, capabilities, sessions, HIVEmind messages).

This is a **companion layer to HIVE**, not a replacement for it. HIVE remains the coordination
brain; the board is the *observation + intent surface* on top of it — the glanceable "where is
the work" view HIVE otherwise lacks.

> **This file was `projects/hive-board/AGENTS.md`.** The viewer no longer has its own repo — it
> was absorbed into the HIVE plugin package on 2026-08-03 so that HIVE + board install as ONE
> npm dependency. Source now lives at `src/board-viewer/`, tests at `test/board-viewer/`, docs
> here in `docs/board-viewer/`. Owned by the **board-viewer** capability; the surrounding package
> is **hive-infra**'s.

## Status

**Build phase.** SCHEMA ratified v1.0 (2026-07-10); the board is live and drives transitions. The
canonical design lives alongside this file in `docs/board-viewer/`:

- [`DESIGN.md`](DESIGN.md) — architecture, data model, lifecycle, write-authority
- [`SCHEMA.md`](SCHEMA.md) — the work-item contract (frontmatter fields, column↔status map, ID scheme)
- [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md) — the decision LOG: Q1–Q13 are all resolved, and it is
  kept as the record of what was decided and why, not as a list of open work

Read `DESIGN.md` first. It takes precedence over any assumptions.

## The one constraint that shapes everything

**A work item in `In Progress` (and onward) IS one full HIVE coordinator session** — the top-level
chat where you talk to HIVE, *not* a subagent. Subagent/capability dispatches are just activity
*within* that session.

- In Backlog/Todo, an item is a free-floating idea — no session exists yet; any chat can iterate on it.
- It reaches In Progress one of three ways: **bind** the current HIVE session to it, **auto-register**
  when a chat runs `/awaken`, or **create** a fresh top-level session for it.
- That owning coordinator session is the single canonical writer of the item's status and subtasks.
- **Only HIVE (awakened) sessions appear on the board.** Non-HIVE chats are never shown.
- **Every HIVE session auto-appears** on the board (In Progress) even if it never started as a card.
- Re-opening a Done card **re-attaches to the same coordinator session** (by id), preserving context.
- `Done` is reached when the owning session's **dream (DRM) reaches `COMPLETE`** (manual "done without
  dream" allowed, but badged). Once Done, the real session can be **archived without losing the record**.

The board's core purpose: make your opencode session list legible — which HIVE sessions are actively
being worked (or paused-but-resuming) vs. finished vs. mere ideas-not-yet-started.

## Core principle: derived from ground truth, never a second source

The board must **read HIVE's real state**, never maintain a parallel bookkeeping that can drift.
A stale hand-edited tracking file actively lies (dream W-030). The board avoids this by deriving
column position from real signals — session ownership, DRM completion — and using an append-only,
single-writer discipline for the state it *does* own (dream I-105).

## Tech (settled — see OPEN-QUESTIONS Q4/Q6)

TypeScript web app (runs under Bun; web layer TBD in Phase 1) that **renders read-only** from
`.opencode/` files and the work-item cache — but is **not a read-only tool**: board-side transitions
(create/start+auto-awaken, pause, demote, manual done) are executed directly by the app through a
**shared transition module** owned by hive-infra and exported from the plugin repo (locked storage,
SCHEMA §4a). In-session transitions (bind, awaken auto-register) live in the HIVE plugin as
`hive_board_*` **plugin custom tools** (built with `tool()` from `@opencode-ai/plugin`, same
extension point as the existing `hive_dream_*` tools — *not* MCP tools). No database.
Markdown + YAML on disk, matching HIVE conventions exactly.

## Relationship to the HIVE plugin

One repo, one package, **two owners** — the merge was packaging, not authority.

Transitions that spawn/resume/complete sessions are `hive_board_*` plugin tools owned by
**hive-infra**, alongside everything under `src/lib/` (the locked store, the shared transition
module, the dream/YAML parsers). The viewer under `src/board-viewer/` is owned by
**board-viewer** and is a *caller* of those modules, never a second implementation.

The eight `evolutional-agent-structure/lib/*` subpath imports became relative imports in the
merge. That changed their shape, not their meaning — and because a relative import no longer
*looks* foreign, the discipline the package boundary used to make obvious is now held by a live
guard (`test/entrypoint-isolation.test.ts`), which fails if viewer code writes to disk directly,
if the plugin entrypoint reaches viewer code, or if server code leaks into the browser bundle.

The work-item schema in [`SCHEMA.md`](SCHEMA.md) remains the contract between the two.

## Reaching the pre-move history

All 23 commits of the viewer's original repo were imported with `git subtree add`, so they are
genuine ancestors of this repo's HEAD — not a flattened copy:

```sh
git merge-base --is-ancestor 5231176 HEAD && echo "full history present"

# Browse the imported history. Paths are the PRE-MOVE ones (src/config.ts, not
# src/board-viewer/config.ts) — the reshape happened in a later, separate commit.
git log 12ae0c5^2
git log 12ae0c5^2 -- src/config.ts
```

**`git log --follow src/board-viewer/<file>` returns nothing, and that is not history loss.**
History simplification will not traverse a subtree merge, so the `--follow` heuristic stops dead
at the reshape commit. Use the `12ae0c5^2` form above — it reaches the same commits through the
merge's second parent. Nobody rediscovers this syntax by guessing; that is why it is written down
here rather than left to be inferred.

This section was originally `projects/hive-board/MOVED.md`. That directory was deleted on
2026-08-03 once the container entrypoint was migrated to launch the viewer from this package, so
this file is now the only record of the incantation. The GitHub remote `lohnn/hive-board` still
exists and has been pushed an archive commit marking it superseded; it is not deleted, and the
commits referenced above live here regardless.
