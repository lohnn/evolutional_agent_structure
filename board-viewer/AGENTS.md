---
description: A kanban board layer on top of the HIVE plugin — visualizes and drives work items (Backlog → Todo → In Progress → Done) bound to HIVE's on-disk state.
---
# hive-board

> A kanban board layer on top of the HIVE plugin. Visualizes and drives **work items** as they
> move through Backlog → Todo → In Progress → Done, bound tightly to HIVE's real on-disk state
> (dreams, capabilities, sessions, HIVEmind messages).

This is a **companion layer to HIVE**, not a replacement for it. HIVE remains the coordination
brain; hive-board is the *observation + intent surface* on top of it — the glanceable "where is
the work" view HIVE currently lacks.

## Status

**Build phase.** SCHEMA ratified v1.0 (2026-07-10). The canonical design lives in `docs/`:

- [`docs/DESIGN.md`](docs/DESIGN.md) — architecture, data model, lifecycle, write-authority
- [`docs/SCHEMA.md`](docs/SCHEMA.md) — the work-item contract (frontmatter fields, column↔status map, ID scheme)
- [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md) — unresolved decisions to work through next

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

## Relationship to the HIVE plugin repo

Transitions that spawn/resume/complete sessions belong in the HIVE plugin
(`projects/evolutional_agent_structure/`) as `hive_board_*` tools, owned by the **hive-infra**
capability. The viewer app lives here in `projects/hive-board/`. These are two deliverables with a
contract (the work-item schema in `docs/SCHEMA.md`) between them.
