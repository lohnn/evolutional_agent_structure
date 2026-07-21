# hive-board — Work Item Schema (Contract)

Status: **v1.0 — RATIFIED (user, 2026-07-10).** This is the shared contract between the viewer and
the `hive_board_*` plugin tools. It is now binding on both deliverables; changes require publishing
to the other side before building against them (dreams I-065, I-051: a dedicated canon file up
front prevents multi-session naming/schema drift).

This file is the single source of truth for: work-item fields, the column↔status mapping, and the
ID scheme. If it isn't written here, don't assume it.

---

## 1. Storage layout

Work items follow HIVE conventions exactly: markdown with `---`-fenced YAML frontmatter, on disk,
no database, human-readable, git-friendly.

```
.opencode/board/
├── WI-001.md
├── WI-002.md
└── ...
```

**Column is NOT encoded by directory.** A single flat `board/` directory holds all items; the
`status` field determines the column. Rationale (dream I-049 / I-105): status is derived/canonical
*field* state and transitions are appends — moving files between folders on every transition would
turn every move into a delete+create that a watcher misreads, and invites path/status divergence.

> **OPEN (Q5):** flat `board/` vs. per-status subdirs. Draft picks flat. Revisit only if flat proves
> unwieldy at scale.

### ID scheme
`WI-NNN`, zero-padded to 3 digits, monotonically increasing. Next id = max existing + 1 (scanning
`board/`). Same convention as DRM/artifact ids (dream-state.ts `nextDreamId` pattern). The **id is
the stable key** — never infer identity from filename path or column.

---

## 1a. Portability invariant (load-bearing)

> **Any field the board DISPLAYS must be stored on the work-item file. Session SDK calls
> (`session.get`, `session.todo`) may power only NAVIGATION ("Open" deep link) and EXISTENCE checks —
> never rendered content.**

**Why:** the board data (`.opencode/board/`) and the opencode sessions (a separate SQLite DB) are
different stores. If you move the board to another machine, the sessions do **not** come with it. A
work item must therefore be **fully self-describing without its session** — you can inspect what the
work was, its spec, its subtasks, and what it produced, with zero session access. The session is a
*link*, never a *dependency*.

**Consequences:**
- Session-derived data (title, subtasks) is **cached into the item** by the owning session (a writer),
  and the board always reads the **item**, never the session, for content.
- On a machine where the owning session is absent: the card **renders normally from cached data**;
  only the "Open session" action is disabled (greyed + tooltip "session not available here").
  Absence = **unknown**, NOT "deleted" — it does not change the card's column/state and does NOT fold
  the owner into history (a session merely on another machine must not be mislabeled orphaned).
- This is the same principle that makes "Done = forgotten, not archived" work: the board is a durable
  record that *links to* live opencode state, never one that *depends on* it.

**Cached (session-derived) vs. absent behavior:**

| Field | Origin | On a machine without the session |
|---|---|---|
| `title` | mirrored from session, **stored on item** | ✅ visible (from cache) |
| `subtasks` | mirrored from session TodoWrite, **stored on item** | ✅ visible (last snapshot) |
| `todo_mirror` | live-reconciled mirror of session TodoWrite, **stored on item** (§4b) | ✅ visible (last mirrored snapshot; live read absent ⇒ mirror is the fallback, unknown ≠ empty) |
| spec/body, `dream_id`, artifact links, `transitions[]` | authored/derived, on item | ✅ visible |
| "Open session" deep link | `?session=<id>` navigation | ❌ disabled gracefully |
| "does owner still exist" | `session.get(id)` existence check | ⚠️ unknown (not "deleted") |

---

## 2. Frontmatter fields

```yaml
---
id: WI-007                      # stable key, WI-NNN
title: "Add push-notification opt-out to settings"  # CACHED: mirrored from session, stored on item (§1a)
status: in_progress             # see §3 — the column driver
owner_session: ses_10a2...      # HIVE COORDINATOR sessionID that OWNS this item; null until In Progress
                                #   a LINK for navigation/existence only — NOT a data dependency (§1a)
group_id: ses_0e30...           # dispatch group of the owning session (I-043)
origin: session-first           # idea-first | session-first  (how the item was born, §5.2a)
paused: false                   # true ⇒ In-Progress but parked (dimmed); still owned, resume same session
spec_hash: a3f9c1               # content hash of the spec body, stamped at bind (provenance) and
                                #   RE-STAMPED at true-demote. On re-promote, compare current body
                                #   hash to the demote-time stamp: differs → fresh session (§5.5, Q13).
released_sessions: []           # tombstones: sessionIDs detached by true-demote, so /awaken
                                #   auto-register won't re-adopt them (§5.5). Empty unless demoted.
dream_id: DRM-041               # the DRM whose COMPLETE marks this Done; null until dreamt
artifacts: [I-142, W-061]       # CACHED: dream artifact IDs this work produced (from the DRM on
                                #   completion), stored on item so a migrated board shows "what it
                                #   produced" without the dream archive present (§1a)
created: 2026-07-06
updated: 2026-07-06
priority: medium                # low | medium | high  (Backlog/Todo ordering hint)
tags: [frontend, push]          # free-form
done_without_dream: false       # true ⇒ manual Done escape hatch; renders a 'no-dream' badge
subtasks:                       # CACHED: mirrored from owning session's TodoWrite; do not hand-edit.
                                #   Stored on item so it survives migration without the session (§1a)
  - { content: "Read current settings widget", status: completed }
  - { content: "Add opt-out toggle", status: in_progress }
  - { content: "Wire to backend unsubscribe", status: pending }
todo_mirror_updated: 2026-07-21T21:30:00.123Z   # FULL-PRECISION ISO-8601 stamp of the last
                                #   todo_mirror refresh (NOT the date-only granularity of `updated`;
                                #   I-191/W-081). null until first mirror write. Precedes the block.
todo_mirror:                    # CACHE-MIRROR of the owning session's LIVE TodoWrite list (WI-038).
                                #   Whole-replace, never append (I-190). Same {content,status} shape
                                #   as subtasks; stored on item for portability (§1a). See §4b.
  - { content: "Investigate push API", status: completed }
  - { content: "Wire opt-out toggle", status: in_progress }
transitions:                    # APPEND-ONLY audit log (I-049) — never rewrite prior entries
  - { at: 2026-07-06T09:00:00Z, from: todo, to: in_progress, by: hive_board_start, session: ses_10a2... }
---

## Spec / notes

Free-form markdown body. In Backlog/Todo this is where the idea matures — add context here over
time until the item is ready to start. When promoted to In Progress, this body seeds the owning
session's dispatch prompt.
```

### Field authority (from DESIGN §4 write-authority model)

| Field | Class | Written by |
|---|---|---|
| `tags`, `priority` | B (proposal-journal) | any session (and the board), while not owned |
| body (spec) | B → **A while owned** (Q13) | un-owned: any session/the board; owned: **owning session only** (it accumulates notes/decisions as it works); reverts to B on true-demote |
| `title` | B → **cached (A)** | authored freely while not owned; once owned, **mirrored from the session** and stored on the item (portability, §1a) — never read live |
| `status` | A/C | transition tools + derivation (never hand-edit to contradict a signal) |
| `owner_session`, `group_id` | A | `hive_board_bind` / `hive_board_start` / auto-register hook, resolved from plugin runtime + session map (W-009). **A navigation link, not a data dependency (§1a)** |
| `origin` | A | set once at birth (idea-first vs session-first) |
| `paused` | A | owning session sets it (or board affordance); a sub-state of In Progress, not a column |
| `spec_hash` | A | stamped at bind (provenance) and **re-stamped at true-demote**; on re-promote the live body hash is compared to the **demote-time** stamp to decide re-attach vs fresh session (§5.5, Q13) |
| `released_sessions[]` | A (append-only) | each true-demote appends the detached sessionID; read by the auto-register hook to skip re-adopting it |
| `history` (derived) | C | **not a stored field** — the "previously attempted in ses_..." lineage is read from `transitions[]`, which stamps `session` on every entry |
| `subtasks` | A (cached/mirrored) | mirrored from the owning session's TodoWrite (`session.todo`/`todo.updated`) via hook and **stored on the item** (§1a) — **never hand-edited** |
| `todo_mirror`, `todo_mirror_updated` | A (cached/mirrored, derived-rebuildable) | whole-replaced from the owning session's live TodoWrite by the board via the shared locked-storage edit (`ItemEdit.setTodoMirror`, identity-free — I-179); `todo_mirror_updated` is a **full-precision ISO-8601** stamp (I-191/W-081). Derived-rebuildable throwaway cache (I-105/I-113). **Never hand-edited** (§4b) |
| `dream_id` | C (derived) | stamped by the **`hive_dream_begin` handler** — it resolves the calling session (`context.sessionID`), finds the item with matching `owner_session`, writes the new DRM id (DESIGN §5.4). File-scan detection is backfill/integrity fallback only |
| `artifacts[]` | C (cached) | copied onto the item by the **`hive_dream_complete` handler** (same session→item lookup), so "what it produced" survives migration (§1a) |
| `done_without_dream` | A | explicit escape-hatch tool call only |
| `transitions[]` | A (append-only) | every transition appends one entry; prior entries immutable (I-049) |

> **Why no `capability` field:** the owner is a full **coordinator session**, which dispatches many
> capabilities over its life. Capability involvement is observable per-session (via its subagent
> children / residue), not a single fixed attribute of the item. If a "primary capability" hint is
> ever wanted for filtering, it's a derived annotation, not an ownership field.

---

## 3. Column ↔ status map

The board renders columns; the file stores `status`. This table is the *only* mapping. UI column
names may differ from status values, but this table binds them.

| Column (UI) | `status` value | Owner? | Done signal |
|---|---|---|---|
| Backlog | `backlog` | no | — |
| Todo / New | `todo` | no | — |
| In Progress | `in_progress` | **yes** (`owner_session` set) | — |
| Done | `done` | frozen | `dream_id`'s DRM is `COMPLETE`, **or** `done_without_dream: true` |

- **New vs Todo:** resolved (Q1) — **one pre-owned column** for now; New is folded into `todo`. If
  ever split, both map to `status: todo` (distinguished by a UI flag/`priority`, not a new status).
- **Analysis:** resolved (Q2) — NOT a status. It's a phase inside `in_progress`, surfaced from the
  shape of the owning session's early subtasks (or an optional `phase: analysis` hint).

### Invariants
1. `status: in_progress` ⟺ `owner_session != null` **and** that session is a HIVE (awakened),
   top-level coordinator session (`parentID` absent). The board must never show In Progress without a
   resolvable owner in the session map, and never shows non-HIVE sessions at all.
2. `status: done` requires either a `COMPLETE` DRM at `dream_id`, or `done_without_dream: true`
   (which forces the `no-dream` badge).
3. `owner_session` and `group_id` are set **together, at bind/registration** (dream I-043).
4. A backward move Done → In Progress **must** re-attach to the existing `owner_session` (same id,
   unarchiving if needed), not allocate a new session (dream I-042: true resumption by id).
   **Re-attach never re-runs `/awaken`** — that applies to *every* re-attach (unchanged-spec
   re-promote, resume-from-Paused, Done → In Progress): a session can only have become an owner by
   being awakened, and awakened status persists in `awakeSessions`. Awaken is triggered **only** by
   `hive_board_start` on a session it just created (DESIGN §5.3c).
5. Every awakened HIVE coordinator session has exactly one work item (auto-registered if not
   created idea-first). Session ⟷ item is 1:1 (see OPEN-QUESTIONS Q7).
6. **Bind-time absorption (Q15):** if `hive_board_bind` targets an idea item while the session's
   only owned item is a **pristine** session-first placeholder (`origin: session-first`,
   `dream_id` null, body hash == creation-time `spec_hash`, no subtask progress), the placeholder
   is absorbed: its file is deleted (the one sanctioned deletion) and the surviving item's bind
   `transitions[]` entry records `absorbed: WI-NNN`. A non-pristine owned item still refuses
   (`SESSION_OWNS_OTHER`) — absorption never destroys accrued content.

---

## 4. Subtask mirror format

Subtasks mirror the owning coordinator session's TodoWrite items 1:1, read via the SDK
`session.todo({ path: { id } })` call and kept fresh by the `todo.updated` event. Each:
`{ content, status }` where `status ∈ {pending, in_progress, completed, cancelled}` (matching
opencode's todo states). The mirror is a **replace-whole-list** operation from the latest snapshot
(the todo list is itself authoritative and small), NOT an append log — this is the one Class-A field
that is a snapshot, because its source of truth is the live todo list, not the item file.

> Do not hand-edit `subtasks`. Editing them here does not change the agent's actual todos and would
> reintroduce exactly the divergence this design exists to prevent (W-030).

---

## 4b. `todo_mirror` — the live-reconciled TodoWrite cache (WI-038)

**Owner:** hive-infra (the field, its serialization, and the `setTodoMirror` edit primitive all live
in the plugin's `board-store.ts`; board-viewer consumes them). Published contract surface:

| Surface | Shape |
|---|---|
| `WorkItem.todo_mirror` | `{ content: string; status: "pending"\|"in_progress"\|"completed"\|"cancelled" }[]` (empty `[]` when unmirrored) |
| `WorkItem.todo_mirror_updated` | `string \| null` — **full-precision ISO-8601** (e.g. `2026-07-21T21:30:00.123Z`), `null` until first write |
| `ItemEdit.setTodoMirror` | `{ todos: TodoMirrorEntry[]; at: string }` — **whole-replace** the block AND stamp `todo_mirror_updated: at` in one edit |

**On-disk serialization** (block-sequence-of-flow-maps, same dialect as `subtasks`; the scalar stamp
precedes the block; both sit **before** `transitions:`):

```yaml
todo_mirror_updated: 2026-07-21T21:30:00.123Z
todo_mirror:
  - { content: "Investigate push API", status: completed }
  - { content: "Wire opt-out toggle", status: in_progress }
```

Empty form: `todo_mirror_updated: null` (or a stamp) + `todo_mirror: []`.

**Semantics.** Whole-replace, never append (I-190) — it mirrors the session's COMPLETE current todo
list, which is itself the source of truth. **Derived-rebuildable** (I-105 / I-113): reconstructable
from the owning session alone, so a throwaway cache — but persisted on the item so the board renders
the sub-state without the session present (§1a portability). The write is **identity-free** (I-179):
the caller already holds `owner_session`, so it routes through the shared locked-storage edit
(`mutateItem` → `setTodoMirror`), not a second writer and not the plugin-runtime identity path.

**Relationship to `subtasks` (§4).** Both cache the same source (the owning session's TodoWrite), but
they are **distinct fields on purpose**. `subtasks` was specced in §4 as the mirror but never had a
writer wired up. `todo_mirror` is the field the board **actually** writes and reads via a live-read↔
mirror reconcile loop, and it carries its own full-precision `todo_mirror_updated` stamp (the legacy
`updated` field is date-only and must not be reused for ordering — I-191/W-081). Consumers should
read `todo_mirror` for the live sub-state. A future consolidation may retire `subtasks` in favor of
`todo_mirror`; until then, treat `todo_mirror` as authoritative for the live TodoWrite sub-state.

> Do not hand-edit `todo_mirror`/`todo_mirror_updated` — same rationale as `subtasks` (W-030). The
> board whole-replaces them from live reads; a hand edit is silently overwritten on the next refresh.

---

## 4a. Write discipline (all writers)

Single-writer authority (§2) is a *per-process* guarantee only: two opencode instances open on the
same directory mean two plugin instances (dream I-030), and append-vs-append between them is not
protected by atomic-rename-on-read (dream W-024). Therefore **every** work-item write — plugin
tools, hooks, and any future viewer-side writer — goes through one shared storage module (the
swappable interface from Q5) that:

1. writes **temp-file + atomic rename**, never in-place;
2. takes a simple **advisory lock** (lockfile) around read-modify-write of a single item;
3. re-reads the item inside the lock before mutating (no stale in-memory copy);
4. appends to `transitions[]` / `released_sessions[]` — never rewrites prior entries (I-049).

## 5. Normalization rules
- Capability names are stored **short-form** (`proposal-web`), never `capabilities/proposal-web`
  (dream I-025). Any indexing/join on capability normalizes to short-form.
- Session ids are opencode `ses_...` strings, used verbatim for deep links (`?session=<id>`) and
  re-attachment (dream I-042: true resumption by id).
- Timestamps are ISO-8601 UTC (`Z`).
- DRM / WI / artifact ids are always the stable keys for cross-references, never file paths.
