# hive-board — Design

Status: **v1.0 — build phase** (SCHEMA ratified 2026-07-10; implementation started). This is the
canonical design; it supersedes any assumptions elsewhere. Companion docs: [`SCHEMA.md`](SCHEMA.md),
[`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).

---

## 1. Purpose & scope

hive-board is a kanban board that shows, at a glance, **what work exists, what is being worked on
right now, and what is done** — and lets you move work through that lifecycle. It sits *above* the
HIVE plugin the way a mission-control dashboard sits above a fleet: HIVE dispatches and remembers;
hive-board observes, organizes, and surfaces intent.

It is explicitly **not** a second coordination brain. HIVE already owns dispatch, capability
lifecycle, dreams, and messaging. hive-board introduces exactly one new concept HIVE lacks — the
**Work Item** — and binds it to signals HIVE already produces.

### What it is
- A top-down board of work items across three primary columns + a Backlog.
- A live view of the owning session's progress while an item is In Progress.
- The surface from which you *promote* an item into an owned, in-progress session.

### What it is not
- Not an agent runner (HIVE + opencode run agents).
- Not a task queue that agents poll.
- Not a hand-maintained TODO list. Column position is **derived from real HIVE state**, not typed in.

---

## 2. The governing constraint: item ⇔ HIVE coordinator session ⇔ dream

This single rule, from the user, determines the whole architecture:

> **A work item, once it enters `In Progress`, IS one full HIVE coordinator session** — the
> top-level chat where you talk to HIVE. Not a subagent. Subagent/capability dispatches are just
> *activity within* that session while the item is in progress. `Done` is reached when that
> session's dream (DRM) completes.

The board is therefore, first and foremost, **a semantic overlay on your HIVE coordinator
sessions** — the thing your raw opencode session list can't tell you:

- which sessions are **actively being worked** (or paused-but-intended-to-resume) → **In Progress**
- which are **finished** and safe to archive → **Done** (the board keeps the record so archiving
  the real session no longer means it vanishes from view)
- and a space for ideas that **have no session yet** → **Backlog / Todo**

**Only HIVE (awakened) sessions appear on the board.** Non-HIVE chats are never shown.

### Auto-registration (a hard requirement)

Any HIVE coordinator session must appear on the board **automatically**, even if it was never
created as a work item first. Concretely: *if you open a fresh chat and run `/awaken`, that session
appears in the In-Progress column* — the board back-fills a work item for it. Work items thus have
**two birth paths** (see §5.2a):
1. **Idea-first:** created in Backlog/Todo, later promoted to a session.
2. **Session-first:** a HIVE session is awakened directly; the board auto-creates its work item.

### Consequences

| Phase | Backed by a coordinator session? | Who may write the item | Backing HIVE reality |
|---|---|---|---|
| **Backlog** | no | any session (proposal-journal) | a plain idea file, no session, no dream |
| **Todo** | no | any session (proposal-journal) | ready-to-start idea, still no session |
| **In Progress** | **yes — one HIVE coordinator session owns it** | *only* the owning session (canonical) | an awakened top-level session (`parentID` absent); `owner_session` + `group_id` recorded |
| **Analysis** | (phase inside In Progress) | owning session | the owning session's early phase |
| **Done** | frozen (session may be archived) | derived transition only | the owning session's **DRM reached `COMPLETE`** |

Moving **backward** (e.g. Done → In Progress to pick work back up) re-attaches to the **original
owning coordinator session** — the same `ses_...` — not a new one. If that session was archived,
the board points you back to it (unarchive/resume); identity continuity is the point (dream I-042
confirms true session resumption by id).

---

## 3. Architecture: viewer + tools split

Two deliverables joined by one contract (the work-item schema).

```
┌────────────────────────────────────────────────────────────┐
│  hive-board web app  (projects/hive-board/)                │
│  • RENDERS read-only from .opencode/ + item cache          │
│  • Renders columns, cards, subtask lanes, dream links      │
│  • Board-side transitions executed directly via the shared │
│    transition module (owned by hive-infra — Q6)            │
└───────────────┬────────────────────────────────────────────┘
                │  reads files          │ writes via shared module
                ▼                       ▼  (locked storage, SCHEMA §4a)
┌────────────────────────────┐   ┌──────────────────────────────┐
│  .opencode/ file tree      │   │  hive_board_* plugin tools    │
│  (HIVE's ground truth)     │◄──│  (in the HIVE plugin repo)    │
│  board/ dreams/ agents/    │   │  • bind item ↔ current session│
│  hivemind/ nervous-system  │   │  • auto-register on /awaken   │
│                            │   │  • append status transitions  │
│                            │   │  • mirror session TodoWrite   │
│                            │   │  • reconcile Done ⇐ DRM       │
└────────────────────────────┘   └──────────────────────────────┘
```

> **Terminology:** the `hive_board_*` tools are **opencode plugin custom tools** — built with
> `tool()` from `@opencode-ai/plugin` and registered via the plugin's `tool:` hook key, exactly like
> the existing `hive_dream_*` tools (`src/tools.ts`). They are *not* MCP tools; earlier drafts used
> that term loosely.

Note: the owner is the **coordinator session itself**, so the plugin does not "spawn the owner" as
a subagent. It either (a) **binds** the item to the current session (`hive_board_bind`), (b)
**auto-registers** a session that runs `/awaken`, or (c) optionally **creates** a fresh top-level
session (`client.session.create`) for a promoted item — see §5.3 for the three start paths.

### Why this split (and not a pure external app)

The state-changing operations — *bind/create a coordinator session*, *stamp ownership*, *decide
Done from a DRM* — are **session and identity operations**. HIVE already owns that logic, and prior
learning is emphatic that duplicating it outside the plugin causes drift:

- Durable lifecycle IO belongs behind a **tool** that owns the contract, not prose path conventions
  (dream I-046).
- Session identity must be **resolved from the on-disk session map**, never from what an agent
  reports about itself — `context.agent` can lie on resumed sessions (dream W-009). The plugin runs
  inside the opencode runtime and can resolve the *current* session id reliably; an external app
  cannot.
- Session resumption by id is real and verified — re-opening a Done item points back to the *same*
  coordinator session (dream I-042).
- Plugin in-memory state is per-instance and isolated; **all shared state lives on disk** (dream I-030).

So the split is by **what a write needs to know**, not by "reader vs writer" (Q6 resolved — the
board was never meant to be read-only):

- **In-session identity required** (bind "this chat owns WI-007", auto-register on awaken) → lives
  in the plugin (tools/handlers), because only the plugin runtime can resolve the current session id.
- **No in-session identity required** (create/start, pause, true-demote, manual done) → the board
  app executes these **directly**, calling the **shared transition module** that hive-infra owns and
  exports from the plugin repo (same code path, one owner, no duplicated logic — I-046), writing
  through the locked storage layer (SCHEMA §4a).

The board *renders* read-only (all content from the item cache, §4.a) but is a first-class writer
for board-side transitions — always through the owner-published module, never with its own logic.

### Why not bake the whole board into the plugin

Serving UI from the plugin couples the dashboard's lifecycle to plugin restarts (the plugin runs
from source with no build step; only a restart applies changes — dream W-026). Keeping the viewer
separate lets it iterate freely. Only the *transition tools* live in the plugin.

---

## 4. Write-authority model (the anti-drift core)

Adapted directly from HIVE's three-class write model (dream I-105). Every piece of board state is
classified, and each class has exactly one write discipline:

| Class | What | Writer | Discipline |
|---|---|---|---|
| **A — Canonical** | An In-Progress item's `status`, `owner_session`, `subtasks` | the **owning coordinator session** (single ratifying writer) | append-only transitions; never parse→mutate→reserialize (dream I-049) |
| **B — Proposal journal** | Backlog/Todo item content & edits | any session | free-form; crystallizes into canonical when promoted |
| **C — Derived** | Column position, Done state, dream links, energy bars | **nobody writes directly** — computed from ground truth | rebuilt by reading dreams/sessions/capabilities; cache is disposable |

The rule that kills the W-030 "stale tracking file lies" failure mode:

> **A transition that has a ground-truth signal (In Progress ⇐ owning session exists; Done ⇐ DRM
> COMPLETE) is DERIVED and the board must never let a manual override contradict it silently.**
> Manual overrides are allowed only where no ground-truth signal exists (Backlog/Todo ordering, or
> an explicit, *badged* "done without dream" escape hatch).

### 4.a Portability: the item is self-contained; the session is a link

A second discipline, from the **migration scenario** (move the board to a machine that has the board
data but not the sessions):

> **Every field the board DISPLAYS is stored on the work-item file. Session SDK calls power only
> navigation ("Open") and existence — never rendered content.** (Full rule + field table: SCHEMA §1a.)

This reclassifies session-derived data as **cached-onto-the-item**, not read-live:
- The **owning session is a writer** that mirrors its `title` and `subtasks` into the item; the board
  is a **reader of the item**, never of the session, for content.
- `artifacts[]` (dream outputs) are copied onto the item at completion, so "what it produced" survives
  even without the dream archive present.
- On a machine without the session: the card renders fully from cache; only "Open session" is
  disabled. Absence = **unknown**, never "deleted" — it does not change the card's column and does not
  orphan the owner (a session merely on another machine must not be mislabeled).

This is the same instinct as "Done = forgotten": the board is a **durable record that links to** live
opencode state, never one that **depends on** it.

---

## 5. Columns & transitions

### 5.1 Backlog
Loosely-specified future work. An item here has a title and a growing body of notes/spec that you
add to over time. No owner, no dream. Freely editable from any session (Class B). This is where an
idea matures until it's worth starting.

### 5.2 Todo / New
A Backlog item deemed ready. Same storage, `status: todo`. Still no owner. The distinction from
Backlog is intent ("we will start this soon") and completeness of spec — not a different mechanism.

> **New vs Todo vs Backlog** are three points on one "not-yet-owned" spectrum sharing identical
> mechanics. Whether to render New and Todo as separate columns or as one is a UI choice — see
> OPEN-QUESTIONS Q1.

### 5.2a Two ways a work item is born
1. **Idea-first (promotion):** an item exists in Backlog/Todo, then gets a coordinator session and
   moves to In Progress (§5.3).
2. **Session-first (auto-registration):** a HIVE coordinator session is awakened directly (you open
   a chat, run `/awaken`); the plugin auto-creates a work item for it, already in In Progress, owned
   by that session. This satisfies the hard requirement that *every* HIVE session shows up on the
   board whether or not it started as a card.

Both paths converge on the same end state: `status: in_progress`, `owner_session` set to a HIVE
coordinator session's id.

### 5.3 In Progress  ← the pivotal state: item ↔ coordinator session
An item is In Progress **iff** a HIVE coordinator session owns it. There are **three start paths**
(all valid; the user wants all three available):

- **(a) Bind current session.** From inside a HIVE session, `hive_board_bind(WI-007)` stamps
  `owner_session = <this session's id>` onto the item and flips it to `in_progress`. The session id
  is resolved from the plugin runtime / on-disk session map, never from agent self-report (W-009),
  and `group_id` is captured at the same time (I-043).
- **(b) Auto-register on `/awaken`.** The plugin creates-or-binds a work item for the new session
  automatically (§5.2a path 2). Title/spec back-filled from the session; editable later.
  **Placement (code-verified):** the registration lives **inside the `hive_awaken` tool handler**
  (`src/tools.ts` — it already receives `context.sessionID` from the runtime and is the actual
  moment awakening happens), not on the command. A `command.execute.before` hook *does* exist and
  also carries `sessionID` (dream W-016 is stale — marked as such), but hooking the command would
  register sessions where the model never completed the awaken tool call. The handler also checks
  the item's `released_sessions[]` tombstones before adopting (§5.5).
- **(c) Create a fresh session for a promoted item.** `hive_board_start(WI-007)` calls
  `client.session.create({ title })` to make a new **top-level** session (no `parentID`), stamps
  ownership, and seeds it with the item's spec. Since the user works **100% in the web GUI**
  (OpenChamber / web, both of which support `?session=<id>` deep links), the board renders a real
  **"Open" link** straight into the created session — no manual picker step. (The earlier TUI
  force-open limitation is moot for a web-GUI workflow.) **Deep link verified live** (user-confirmed,
  2026-07-08): OpenChamber resolves e.g. `http://studio:3000/?session=ses_0bf489fe1ffe...` to the
  running session.
  **Awaken-on-create (user requirement, 2026-07-08):** a session created by `hive_board_start` must
  become a *HIVE* session automatically — a created-but-never-awakened session would violate
  invariant 1 (In Progress ⟺ owned by an **awakened** coordinator session). Mechanism (SDK-verified):
  after `session.create()`, call **`session.command({ path: { id }, body: { command: "awaken" } })`**
  (`POST /session/{id}/command` exists in the typed SDK) to run `/awaken` in the new session, with
  the item's spec seeded as the task context. **Ordering + idempotency:** `hive_board_start` stamps
  `owner_session` on the item *before* triggering awaken; the auto-register logic inside
  `hive_awaken` must therefore be **create-or-bind** — if an item already names this session as
  owner, it no-ops instead of creating a duplicate. (Verify at build time that `session.command`
  triggers an agent turn on an idle fresh session; if not, fall back to `session.prompt` with the
  awaken instruction as the first mandatory step.)
  **Scope (user requirement, 2026-07-08): awaken-on-create applies ONLY to sessions the board
  *creates*.** A **re-attach** — re-promote with unchanged `spec_hash`, resuming a Paused item, or
  Done → In Progress — must **never re-run `/awaken`**: the session already ran it, by definition
  (it could not have owned the item, i.e. been promoted, otherwise), and its awakened status
  persists in `awakeSessions` across restarts. Re-attach is a deep link only. Re-running awaken
  would burn a model turn and re-inject awakening context into a session that already has it.

Once owned, that coordinator session is the item's single canonical writer (Class A).

**Alive subtasks:** while In Progress, the card shows a subtask lane. The *upstream* source is the
**owning session's own TodoWrite list** (via `session.todo({ path:{ id } })` + the `todo.updated`
event); a hook **mirrors it into the item file as a cached snapshot**, and the board reads that
snapshot — never the session live (portability, §4.a). The coordinator already maintains these todos
to plan its work — we surface them, we don't ask for a second list. The board thus reflects *real*
progress (avoiding the stale-tracking lie, W-030) while staying inspectable even if the session is
absent (e.g. after migration).

**Analysis** is the owning session's early phase, shown as a sub-state/tag on the card (e.g. the
first todos being scoping/analysis todos), not a separate column. A separate Analysis column would
need its own ownership and exit rules for no real gain — see OPEN-QUESTIONS Q2 if we reconsider.

**Paused ≠ done.** A session you've stepped away from but intend to resume stays In Progress. The
board does not need live busy/idle to know this — In Progress means *owned and not yet dreamt*,
regardless of whether the session is momentarily active. This is precisely the distinction your raw
session list can't show.

### 5.4 Done  ← derived from the dream
When the owning session runs dreamtime and its **DRM reaches `status: COMPLETE`**, the card moves
to Done, linking the DRM id and its produced artifacts.

**The DRM ↔ work-item join (the mechanism, previously unspecified):** nothing in the DRM YAML
records *which session* dreamt it, so the join cannot be inferred from the dream files alone. It is
made **inside the plugin's own dream tool handlers**, which know the calling session
(`context.sessionID`, runtime-resolved — W-009-safe):

- **`hive_dream_begin`**: look up the work item whose `owner_session` == the calling session; if
  found, stamp `dream_id: DRM-NNN` onto the item. From this moment the item and the dream are joined.
- **`hive_dream_complete`**: same lookup; copy the DRM's `artifacts[]` onto the item (portability,
  §4.a) and transition `status → done` (appending to `transitions[]`).

This makes Done **event-driven like everything else** (§6.a) — no file-watching required in the
common path. A scan of `dreams/history/DRM-*.yaml` for `COMPLETE` remains available as a
**backfill/integrity fallback only** (e.g. first-run back-fill, or a dream completed while the
board machinery was absent); when scanning, tail/diff rather than full-reparse (I-049). A session
that dreams while owning no work item is a no-op for the board.

**Escape hatch:** an item may be marked done *without* a dream (small work not warranting a full
dreamtime). This is allowed but the card is **badged `no-dream`** so the skipped consolidation is
visible, never silent (dreams W-030, I-048). This keeps the invariant honest without being rigid.

### 5.4a Done = "forgotten", not archived
A key pain this solves: today you keep finished sessions in your session list *because there's no
way to mark them done without losing them*. The board fixes this **without touching opencode at
all**. "Done" is a state the *board* holds, not an opencode archive action:

- The real coordinator session is **left exactly where it is** in your session list — untouched.
- The board's Done column is where it lives *mentally*: the card holds the record (title, DRM link,
  artifacts, owning session id) and a deep link back to the session if you ever want it.
- Nothing is archived, hidden, or deleted on the opencode side. The board is purely the "I'm done
  thinking about this" layer.

This dissolves the earlier archive-state / SDK-version concern entirely — the board never needs to
read or write opencode's archive state. (See OPEN-QUESTIONS Q9, now largely moot.)

### 5.5 Moving backward — two destinations, two meanings
The key realization: dragging a card backward has **two distinct intents**, and rather than asking
you to declare intent in a dialog, **the destination you drag to IS the decision** (see
OPEN-QUESTIONS Q3 for the full reasoning).

- **Park it → "Paused" (stays In Progress, dimmed/flagged).** "The work is fine, I just can't
  continue now; resume *this* session later." The session stays the owner and source of truth.
  Re-activating re-attaches the same session id via deep link (dream I-042). This is the common case
  and, notably, is *not really a backward move* — it's a sub-state within In Progress, which is
  exactly the "actively-worked vs paused-but-resuming" distinction the board exists to show.
- **Rethink it → true demote to Todo/Backlog.** "I'm not sure this is even the right task; the idea
  is fluid again." Here the **idea** becomes the source of truth, and the old session is **detached**
  — but **not forgotten** (it's history, per Q3). Re-promoting *may* create a fresh session,
  governed by the spec-edit signal below.
  - **Tombstone requirement:** because every awakened HIVE session auto-registers as In Progress
    (§5.2a), a detached session whose real chat still exists would be re-adopted on the next tick.
    True-demote appends the detached id to `released_sessions[]` so auto-register skips it.
  - **Spec-edit decides re-attach vs fresh (Q3 + Q13, resolved):** the item stamps a `spec_hash`
    at bind time (provenance) and **re-stamps it at true-demote** — the baseline that matters. On
    re-promote, the board compares the current spec-body hash to the **demote-time** stamp (bind-time
    would falsely flag legitimate mid-work edits by the owning session — Q13):
    - **unchanged** → offer to **re-attach the original session** (deep link; context still valid).
      **No re-awaken:** re-attach never re-runs `/awaken` — the session ran it before it could ever
      own the item, and awakened status persists (§5.3c scope note).
    - **changed** → the task is now different → **fresh session** (the "move it back, edit it, next
      time it's new" behavior the user described). No modal — the edit *is* the decision.
  - **History, not forgotten (Q3, resolved):** the released session stays discoverable. The board
    renders a faint "previously attempted in `ses_...`" link from the append-only `transitions[]` log
    (which stamps `session` on every entry); if that session dreamt, its DRM is linked too. Consistent
    with HIVE's ethos — the void remembers.

Done → In Progress always **re-attaches the original session** (deep link, dream I-042) — you never
lose a completed session's context by revisiting it. As with all re-attaches, `/awaken` is **not**
re-run (§5.3c scope note).

---

## 6. What the board reads (ground-truth map)

All read-only, all from `<project>/.opencode/`. Reuse the plugin's own parsers where possible —
the DRM/artifact YAML is hand-rolled and a generic YAML lib may misparse it (dream SHADOW-005).

| Board concern | Source | Notes |
|---|---|---|
| Work items & columns | `board/WI-*.md` (new) | frontmatter `status`, `owner_session`, `dream_id` |
| Which sessions are HIVE sessions | `hivemind/.nervous-system-state.json` (`awakeSessions`, session map) | only awakened top-level sessions belong on the board; non-HIVE chats excluded |
| Displayed content (title, subtasks, spec, artifacts) | **the work-item file** (`board/WI-*.md`) | portability rule §4.a / SCHEMA §1a — the board reads content from the item, cached there by the session; **never reads the session live for content** |
| Session detail refresh + existence | opencode SDK **`session.get(id)`** | id comes from the item's `owner_session`; used to **update the cache** and check existence — navigation/integrity, not primary content. Degrades gracefully if the session is absent (another machine) |
| One-time back-fill discovery | opencode SDK **`session.list()`** — **bootstrap only** | used **once** on first run to find pre-existing awakened sessions; NOT part of the steady-state loop. Then the cap/scope caveats apply (see §6.a) |
| Owner identity resolution | plugin runtime (current session) + session map | resolve from runtime/map, never agent self-report (W-009) |
| Done signal | **primary:** `hive_dream_begin`/`hive_dream_complete` handlers stamp `dream_id`/`artifacts[]`/`done` onto the item (§5.4, join via `context.sessionID`) | fallback/integrity only: scan `dreams/history/DRM-*.yaml` for `status: COMPLETE` — tail/diff, don't rebuild (I-049); DRM id is the stable key |
| Subtask cache refresh | owning session's TodoWrite via `session.todo(id)` + `todo.updated` event | mirrored **into the item file** by a hook; board then reads the item (not the session) — survives migration |
| Deep link to a session | `?session=<id>` on the web GUI | board renders "Open" links; disabled gracefully if the session is absent on this machine (§4.a) |
| Capability energy/health (fleet view) | `agents/capabilities/*.md` frontmatter | skip `_*`; normalize `capabilities/<name>` ↔ short name (I-025) |
| In-flight residue (optional feed) | `dreams/raw/<cap>.<sid>.md` | un-harvested = live; `.harvested/` = consumed |
| Message context (optional) | `hivemind/inbox/*/msg_*.json` | filter `status ∈ {pending,delivered}` and apply groupId scoping (I-058, W-025) |

> **SDK version policy:** this environment **tracks the latest opencode** (the user updates
> regularly) — there is no meaningful version pin. The HIVE plugin repo declares
> `@opencode-ai/sdk: ^1.15.7` (floating); the claims below were verified against both 1.14.37 and
> 1.15.7. The viewer must declare the **same floating SDK dependency as the plugin** so the two
> deliverables never diverge on SDK behavior, and SDK-surface assumptions (like the `session.list`
> caveat below) should be re-verified after opencode updates.

**Two caveats carried from the SDK/plugin internals:**

1. **Existence ≠ busy-ness (and the board keys off existence).** A session's *existence* is durable
   (survives reboots — `session.get(id)`/`session.list()` read the on-disk SQLite DB); `session.status()`/events
   tell you it's *busy right now* (live, in-memory). The board keys columns off **existence +
   ownership + dream-state**, never off live busy-state. This is why paused-but-intended sessions
   correctly stay In Progress, and why nothing is lost across reboots (the user's explicit goal: keep
   the data, just display it better). Note the board tracks existence mostly via its own work-item
   files + `/awaken` events; it doesn't need a live enumeration to know what it already owns (§6.a).
2. **No dependency on opencode archive-state.** "Done" is a board-held state, not an opencode
   archive action (§5.4a) — the real session is left untouched in the session list. This means the
   board never reads or writes `Session.time.archived`, sidestepping the SDK version-skew entirely.
   (The per-session `agent` field is still absent from the typed SDK, but the board doesn't need it —
   HIVE identity comes from the session map / `awakeSessions`, not the `Session` object.)

### 6.a Discovery model: event-driven, not enumeration  (Q10 resolved)

A subtle but important decision: **the board learns about sessions by events, not by polling
`session.list()`.** This falls out of the ownership model — a work item *names* its owner
(`owner_session: ses_...`), so we almost never need to *enumerate* sessions to find one; we already
have the id and can fetch detail with `session.get(id)`.

**What each SDK call is actually for:**

| Need | Call | When |
|---|---|---|
| Detail of a known owner (title, timestamps, still-exists?) | `session.get(id)` | any time we render/refresh a card — id comes from the item |
| Learn about a *newly* awakened session | **the `/awaken` event** (id in hand) | steady state — the plugin auto-registers the work item there and then |
| Find sessions that existed **before the board did** | `session.list()` ∩ `awakeSessions` | **once**, first-run back-fill only |

**Consequences of choosing event-driven:**
- **No polling loop.** The board doesn't periodically re-enumerate. `/awaken` pushes new sessions in;
  `session.get(id)` pulls detail for owners we already know. Less machinery, no re-deriving what
  events already tell us.
- **`session.list()` shrinks to a bootstrap tool.** Its *only* justified call is the one-time
  back-fill: on first run, enumerate existing awakened HIVE sessions and create In-Progress cards so
  your current in-flight work appears immediately (user chose this; without it, existing sessions
  wouldn't show until re-awakened).
- **The list caveats now scope to one code path.** The 100-row default cap and directory-scoping
  (verified real) only matter for the back-fill pass. **Correction (code-verified):** the typed SDK
  exposes **no `limit` parameter on `session.list()`** — its query accepts only `directory` (in both
  SDK 1.14.37 and 1.15.7; a `limit` param exists only on `session.messages()`). The earlier
  mitigation "pass an explicit high `limit`" is therefore **not possible through the typed client**.
  ⛔ **Mandatory gating step at the start of Phase 1.5** (cheap, minutes): empirically verify
  enumeration completeness — call `session.list()` and compare the row count against a known-larger
  ground truth (e.g. the `sessions` map in `.nervous-system-state.json`, 200+ entries). If the
  result is capped at 100: **stop and resolve before building the back-fill** — try an untyped
  `limit` query param on the raw `GET /session` endpoint, or read opencode's SQLite `session` table
  directly. Do not ship a back-fill that silently truncates (that is the W-030 "board lies" failure
  mode on day one).
  **⛔ GATE OUTCOME (run 2026-07-10, opencode ~1.17): API enumeration failed the gate — twice.**
  The 100-row cap is liftable (untyped `?limit=`), but `/session` is additionally
  **project_id-scoped with no lifting parameter**, and this workspace's sessions span two
  project_ids (opencode changed project-identity computation 2026-06-23) — the API could only ever
  see 114 of 284 sessions, losing 12 of 26 top-level awakened sessions. **Resolution: the back-fill
  enumerates opencode's SQLite `session` table read-only; the API is per-id `session.get` only
  (verified to resolve cross-project).** Full record: OPEN-QUESTIONS Q14.
- **Deletion detection** (does an item's owner still exist?) uses `session.get(id)` returning
  not-found, not a `list()` scan. Per-id, on demand.

**Net:** `session.list()` gives us only *titles, existence, timestamps*, and only for **bootstrap
discovery**. Everything else is HIVE's own files + `/awaken` events + per-id `session.get`.

---

## 7. Lifecycle diagram

```
   ┌──────────┐  add spec over time   ┌──────────┐
   │ BACKLOG  │──────────────────────►│  TODO    │      (no coordinator session yet)
   │(no session)│◄────────────────────│(no session)│
   └──────────┘                       └────┬─────┘
        ▲                                  │ promote (3 start paths):
        │ demote                           │  (a) bind current session
        │ (detach ownership)               │  (b) auto-register on /awaken
        │                                  │  (c) create fresh top-level session
        │                                  ▼  → record owner_session + group_id
        │                          ┌────────────────────────┐
        │                          │      IN PROGRESS       │  ◄── a HIVE session that
        │                          │  owned by 1 coordinator │      ran /awaken lands
        └──────────────────────────│  session (paused OK)   │      here directly (b)
                                   │  • analysis phase       │
                                   │  • alive subtasks       │  (mirrored from session.todo)
                                   │    ↕ live                │
                                   └────────┬───────────────┘
                                            │ owning session runs dreamtime
                                            │  DRM → COMPLETE   (or manual+badged)
                                            ▼
                                     ┌──────────────────────┐
       re-attach to same session id  │        DONE          │
       ◄────────────────────────────►│  DRM linked;         │
       (I-042, deep-link back)        │  real session left   │
                                     │  untouched ("forgotten")│
                                     └──────────────────────┘
```

---

## 8. Key risks & the dreams that flag them

> **Anchor citations:** this design's own generative dream is **DRM-036**; its artifacts are the
> primary verified ground truth for the claims here — **I-141** (SDK surface: `session.create`,
> `parentID`, `session.todo`+`todo.updated`), **I-142** (`session.list` = full durable set; the
> 100-row/directory traps), **I-143** (the item⇔session⇔dream model itself), **I-144** (the
> portability invariant, §4.a), **I-145** (destination-as-decision, §5.5), **SNG-038**, **W-061**
> (sessions never drop out of the list — tombstones are mandatory, not hygiene), **W-062** (the
> back-fill traps). Cite these first; the artifacts below are supporting material.

| Risk | Mitigation | Dream |
|---|---|---|
| Board drifts from reality, "lies" like a stale TODO | Derive column from ground truth; single-writer canonical state; badge escape hatches | W-030, I-105, I-048 |
| Losing/duplicating dream state by reparsing | Append-only; tail/diff for COMPLETE; tolerate duplicate append fields | I-049 |
| Misreading owner identity | Resolve from plugin runtime + session map, never `context.agent` | W-009 |
| Hand-rolled DRM YAML misparsed | Reuse `lib/dream-state.ts` / `lib/dream-artifacts.ts` parsers | SHADOW-005 |
| Detached session auto-resurrected as In-Progress card | True-demote must write a tombstone so `/awaken` auto-register doesn't re-adopt a released session | (this session) |
| Back-fill misses older sessions | `session.list()` caps at 100 rows; typed SDK has **no `limit` param** — run the ⛔ gating verification (§6.a) before Phase 1.5; fall back to raw HTTP / SQLite if capped | I-142, W-062 |
| Back-fill misses sessions in other dirs | `session.list()` is directory-scoped by default — omit/set `directory` deliberately **in the back-fill pass** | I-142, W-062 |
| Stale ids assumed to "drop out" of `session.list()` | They never do — sessions persist forever in the DB. Release must be an **explicit tombstone write** (`released_sessions[]`), never inferred from list absence | W-061 |
| Two writers append to the same item file | Single-writer per file is per-*process*: two opencode instances on the same dir = two plugin instances (I-030). All item writes go through one storage module using **atomic write-temp+rename** + advisory lock | W-024, I-030 |
| New `hive_board_*` tools don't register / can't be tested in the session that builds them | Plugin loads once at startup — full opencode **restart** required; test from a *fresh* session, not the building one | W-026, W-031, W-018 |
| Auto-register misidentifies session type | Registration must confirm the session is a top-level (`parentID` absent), *awakened* coordinator — placed inside `hive_awaken` (the actual awakening moment), not merely on the command | I-040, I-041 |
| Board doesn't know which DRM belongs to which item | Join stamped by `hive_dream_begin`/`complete` handlers via `context.sessionID` (§5.4); file scan is fallback only | (this review) |
| groupID assigned lazily → dropped messages/ownership | Assign at bind/registration time | I-043 |
| Cross-coordinator inbox noise shown as live work | Apply groupId scoping + status filter on the persisted read path too | I-058, W-025 |
| Board unusable after migration (sessions absent) | Portability invariant: all displayed content cached on the item; session calls only for nav/existence, degrade gracefully | §4.a, SCHEMA §1a |
| Absent session mislabeled as deleted/orphaned | Treat unreachable owner as "unknown", not "deleted" — don't change column or fold into history | §4.a |
| The board's own build reasoning vanishes | Run a live residue loop while building it (don't repeat SHADOW-004) | SHADOW-004 |

---

## 9. Build phasing (proposed)

Phased so each stage is independently useful (dream I-051: build in phases, real files beat memory).

- **Phase 0 — Contract.** Ratify `SCHEMA.md` (work-item fields, column↔status map, ID scheme). One
  canon file up front prevents multi-session drift (dreams I-065, I-051).
- **Phase 1 — Read-only viewer.** Render existing HIVE state (capabilities+energy, dreams, active
  dream, message flow) with *no* work items yet. Immediately useful as the "mission control" HIVE
  lacks, and validates the parsers.
- **Phase 1.5 — Session back-fill mirror (high value, low cost).** Render existing HIVE **coordinator
  sessions** as read-only In-Progress cards via the **one-time back-fill**: `session.list()` ∩
  `awakeSessions`, filtered to top-level HIVE sessions, then `session.get(id)` for titles. This is the
  one place `session.list()` is used. **First action of this phase is the ⛔ gating verification
  (§6.a):** confirm `session.list()` enumerates completely (no typed `limit` param exists to lift the
  100-row cap); if it caps, stop and resolve (raw HTTP / SQLite) before building the back-fill. Mind
  the directory scope too. Solves the stated pain — "which sessions are actually active/paused/done"
  — before any work-item machinery exists.
- **Phase 2 — Work items + event-driven registration.** `board/WI-*.md` files + columns;
  `hive_board_bind` to stamp the current session onto an item; **auto-register inside the
  `hive_awaken` tool handler** (the hard requirement, and the steady-state discovery path — §5.3b,
  §6.a). Proves the data model, the item↔session join, and that the board runs on events (not
  polling) once bootstrapped. Note W-018/W-031: the new tools only exist after an opencode restart
  and can't be exercised by the session that built them — test from a fresh session.
- **Phase 3 — Create & re-attach tools.** `hive_board_start` (path c: `session.create` a fresh
  top-level session + bind), Done→In-Progress re-attach to the same session id. Owner always
  resolved from runtime/session map.
- **Phase 4 — Live subtasks.** Hook mirrors owning session's TodoWrite (`session.todo` /
  `todo.updated`) → item subtask lane.
- **Phase 5 — Done reconciliation.** Detect DRM COMPLETE → auto-move to Done + link artifacts;
  implement the badged manual escape hatch.
- **Phase 6 — Polish.** Backward moves, drag-and-drop, filtering, energy/health visualization.

---

## 10. Ownership & who builds what

- **hive-infra** capability owns the `hive_board_*` tools, the `/awaken` auto-registration hook, and
  any other hook changes inside the HIVE plugin repo (`projects/evolutional_agent_structure/`).
- The **viewer app** (this repo) owner: TBD — likely a new capability spawned once the framework is
  chosen (OPEN-QUESTIONS Q4). It must not create/bind sessions itself; it only reads + triggers
  plugin tools.
- The **schema contract** (`SCHEMA.md`) is the shared boundary; whoever owns it publishes changes to
  the other side before building against them.
- **Parser reuse contract (Q4 resolved detail):** the plugin's `package.json` exports map currently
  exposes only `"."` — the viewer cannot import `lib/dream-state.ts` / `lib/dream-artifacts.ts`
  through it. Resolution: **hive-infra adds explicit subpath exports** (e.g.
  `"./lib/dream-state"`, `"./lib/dream-artifacts"`) pointing at the TS source, and the viewer runs
  under a TS-transparent runtime (**Bun**, already the repo's toolchain). Explicit named exports —
  not a wildcard, not deep file-path imports — so the shared surface is an intentional, owner-published
  contract (I-046) that survives internal refactors.
