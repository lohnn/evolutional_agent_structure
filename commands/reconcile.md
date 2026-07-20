---
description: Back-fill the hive-board with real session history (dry-run by default; --write to create cards)
---

# RECONCILE — Board Back-fill

One-time / occasional maintenance: retroactively create hive-board work items for
the workspace's real awakened top-level sessions.

- **In Progress** cards for live/paused sessions.
- **Done** cards for sessions that *provably* dreamt (a `hive_dream_complete` tool
  call in opencode's transcript **and** the DRM file is `status: COMPLETE`).

The plugin computes the plan (or writes it) and injects the result. Present the
injected `RECONCILE` report to the user verbatim in a clear block.

## Modes

- `/reconcile` — **dry-run (default, safe).** Shows the full plan table
  (session → status → dream, with Done / In Progress / skipped counts) and writes
  nothing.
- `/reconcile --write` — **creates the cards** through the locked board-store, then
  reports the created id range and counts.

Reconciliation is **idempotent** — it skips sessions that already own an item, so
re-invoking is always safe.

## What to say

Relay the injected report exactly. If it was a dry-run, remind the user they can
run `/reconcile --write` to apply it. If it wrote, confirm the created id range.
Do not invent counts — use only the injected report.
