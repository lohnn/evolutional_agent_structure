# hive-board — Open Questions

**Status: ALL questions Q1–Q13 resolved (Q9 moot). The design is ready to build.** This file is kept
as a decision log — each question records its resolution and rationale. New questions get appended
here as they arise during implementation.

---

## Q1 — New vs Todo vs Backlog: three columns or fewer?  ✅ RESOLVED
**Resolved (user): one pre-owned column for now** (New folded into Todo). Start smaller; scale up if
a real need emerges. Storage is unaffected (all map to `backlog`/`todo`), so splitting later is a
pure UI change. Effective columns: **Backlog · Todo · In Progress · Done**.

## Q2 — Analysis: phase, tag, or column?  ✅ RESOLVED
Draft treats Analysis as a **phase inside In Progress** (surfaced from early subtasks or an optional
`phase: analysis` hint). Alternative: a real column between Todo and In Progress. The cost of a real
column is it needs its own ownership + entry/exit rules; a pre-ownership Analysis column contradicts
the "In Progress = owned session" constraint (analysis usually needs a session to do the analyzing).
**Resolved (user): keep it a phase inside In Progress**, not a top-level column. Surfaced from the
shape of the owning session's early subtasks (or an optional `phase: analysis` hint). Revisit only
if we later want spike/research work that is owned but explicitly *not* yet committed to
implementation.

## Q3 — Backward move: the "two destinations, two meanings" model  ✅ RESOLVED
**Resolved (user + analysis):** there are two distinct reasons to move a card back, and the
**destination you drag to IS the decision** — no in-the-moment dialog needed.

| Destination | Intent | Session fate | Re-promote |
|---|---|---|---|
| **Paused** (sub-state of In Progress, dimmed — NOT a real backward move) | "park it, resume later" | preserved, still owner | re-attach same session (deep link, I-042) |
| **Todo / Backlog** (true demote) | "rethink it; the idea is fluid again" | **detached / orphaned** (tombstoned) | **fresh** session |

Rationale for why fresh-on-re-promote is right (user's own words: *"the content of the work item has
changed, so it has to be a new one"*): a demoted item's spec is expected to be edited; the old
session's context was built against the *old* spec, so resuming it would be resuming stale intent.

**Two mechanisms this requires:**
1. **Tombstone** (`released_sessions[]`): because every awakened HIVE session auto-registers as In
   Progress, a truly-detached session whose chat still exists would be re-adopted on the next tick.
   True-demote must record the released session id so the auto-register hook skips it. Without this,
   demote silently doesn't stick.
2. **Spec-edit as the fresh-session signal (optional refinement):** editing a demoted item's spec is
   itself the signal "this is now a different task" → forces a fresh session on re-promote; leaving
   the spec untouched *could* allow re-attaching the old session. This gives the "should it be
   possible to decide?" flexibility the user asked about, driven by behavior rather than a toggle.

**Resolved (user):**
- (a) **Paused IS a visible sub-state within In Progress** (dimmed/flagged card), not a backward
  move. It directly serves the "actively-worked vs paused-but-resuming" distinction the board exists
  for. → `paused` field (SCHEMA §2).
- (b) **Spec-edit is the fresh-session signal.** Editing a demoted item's spec forces a fresh session
  on re-promote; leaving it untouched allows re-attaching the old session. Behavior decides, no
  modal. → tracked via a spec content hash on the item (SCHEMA §2, `spec_hash`).
- (c) **A released session is HISTORY, not forgotten.** True-demote keeps a faint lineage link
  ("previously attempted in ses_...") on the item, consistent with HIVE's ethos that the void
  remembers. This needs **no new field** — the append-only `transitions[]` log already stamps the
  `session` on every entry, so every prior owning session is recoverable from it. The board renders
  a "previously attempted in ses_..." affordance by reading `transitions[]` (and, if that session
  dreamt, links its DRM). `released_sessions[]` is just the fast-lookup tombstone set for the
  auto-register guard. (SCHEMA §2)

## Q4 — Viewer tech stack  ✅ RESOLVED: TypeScript
Settled with the user: **TypeScript**, to avoid keeping two languages/codebases in sync. Decisive
benefits: the viewer can **`import` the plugin's own hand-rolled YAML parsers verbatim** (dream
SHADOW-005 — never reimplement that format) and **share the `@opencode-ai/sdk` client** for
`session.list()`/`session.todo()`/`session.create()`. Remaining sub-choice (non-blocking): the web
layer — plain Node HTTP + a small frontend, or a light framework. Pick during Phase 1; the data
layer (parser reuse + SDK) is the part that matters and is now fixed.

**Import mechanics (resolved during design review):** the plugin's exports map only exposes `"."`
(raw TS source), so the parsers are not importable as-is. Chosen: **hive-infra adds explicit
subpath exports** (`"./lib/dream-state"`, `"./lib/dream-artifacts"`, …) to the plugin package, and
the viewer runs under **Bun** (TS-transparent, already the repo toolchain). Why this over the
alternatives: deep file-path imports bypass the owner's contract and break silently on internal
refactor; the compiled `dist/` is not what opencode loads and would go stale; a wildcard export
exposes internals indiscriminately. Explicit named subpaths make the shared surface an intentional,
owner-published contract (I-046). SDK version: the viewer declares the **same floating
`@opencode-ai/sdk` range as the plugin** (`^1.15.x`; the environment tracks latest opencode — no
1.14.37 pin exists in the plugin repo).

## Q5 — Work-item storage: flat `board/` vs per-status subdirs  ✅ RESOLVED
**Resolved (user): doesn't matter much — go flat, keep it modular/swappable.** The storage layer
must sit behind a small interface (read/write/list work items) so the on-disk layout can change
without touching the rest. Draft stays **flat `board/`** (SCHEMA §1) — avoids cross-directory
renames on every transition — but the modularity is the real requirement, not the specific layout.

## Q6 — How does a viewer button trigger a plugin tool?  ✅ RESOLVED (option c — direct writes via shared module)
The viewer (TypeScript, sharing the SDK client) can talk to the opencode server directly. Options
for the state-changing transitions:
- (a) The viewer writes an intent file / queue that the plugin picks up on its next event tick.
- (b) The viewer uses the SDK to prompt a coordinator session that invokes the `hive_board_*` tool
  (and, for "create", the viewer can even call `session.create` itself then render a `?session=<id>`
  **deep link** — the user is 100% web GUI, so opening the new session is one click).
- (c) Transitions are driven by *you* asking the agent in-session ("start WI-007"); viewer buttons
  are later sugar. **Draft position** for early phases: (c) — viewer is read-only first.

**Deep-link upgrade (new):** since both web GUIs (OpenChamber / web) support `?session=<id>`, the
board can *create* a session and immediately hand you a working "Open" link. This makes path (c) in
DESIGN §5.3 seamless and softens the need for a heavy trigger channel — a create-tool + deep link
covers the most important transition without round-tripping through a prompted agent turn. Phases
1–1.5 still stay read-only; this just makes the eventual write path lighter than feared.
**Deep link verified live** (user, 2026-07-08): `http://studio:3000/?session=ses_...` resolves in
OpenChamber.

**Resolved (user, 2026-07-08): option (c) — the viewer executes transitions directly.** The user's
own framing: *"I never intended for this tool to be read only actually."* Split transitions by
whether they need *in-session identity*, and drop the intent-queue idea entirely:

- **In-session transitions** — `hive_board_bind` (needs the *current* session's id) stays a plugin
  tool, invoked from inside the session. Auto-register lives in `hive_awaken` (DESIGN §5.3b).
- **Board-side transitions** — start/create (path c: `session.create()` → stamp `owner_session` →
  `session.command(id, "awaken")` to auto-awaken the new session, DESIGN §5.3c), pause/unpause,
  true-demote, manual done-without-dream — need **no** in-session identity (create gets its id from
  `session.create()`'s return; the rest are item-file writes). The viewer server performs these
  **directly**, by calling a **shared transition module** that lives in the plugin repo (owned by
  hive-infra, exported via the same subpath-exports contract as the parsers — I-046: one owner,
  logic never duplicated) and writes through the locked storage layer (SCHEMA §4a).
- **Why not option (a), the intent-file queue:** the plugin has **no timer tick** — it is purely
  event-driven (verified: no `setInterval`/watch loop in src/). A queued intent would sit
  unprocessed until some unrelated event happens to fire, i.e. a button click that does nothing for
  an unbounded time. Dead on arrival.
- **Why not option (b), prompting an agent turn:** heavyweight, slow, and burns a model call to do
  a file write; kept only as the natural *conversational* path ("start WI-007" in-session), which
  remains available for free.
- **Consequence (accepted):** the viewer is not a read-only tool — it *renders* read-only, and its
  transitions go through the shared, owner-published transition module + locked storage layer
  (SCHEMA §4a). DESIGN §3's wording amended accordingly. Phases 1–1.5 still ship without any write
  path (transitions arrive Phase 2+).

## Q7 — Multiple items per session, or strictly 1:1?  ✅ RESOLVED
**Resolved (user): strictly 1:1.** One In-Progress work item ⟷ one coordinator session, always.
Required for clean auto-registration (one awakened session → exactly one work item). Epics/child
work are explicitly out of scope for v1; if wanted later, an epic would be a Backlog item spawning
separate child sessions, each its own WI.

## Q9 — Archived-session detection  ❌ MOOT (dissolved by "Done = forgotten, not archived")
Original concern: the SDK (then believed pinned at v1.14.37 — historical note: nothing pins it; the
environment tracks latest opencode) has no typed `Session.time.archived`, so detecting an
archived session was version-skew-fragile. **This no longer matters.** "Done" is a board-held state,
not an opencode archive action (DESIGN §5.4a) — the real session is left untouched in the session
list, and the board never reads or writes opencode archive state. Kept here only for provenance.

## Q10 — Which sessions does the board show? (avoiding ghost cards)  ✅ RESOLVED
The board shows **only HIVE (awakened) sessions**. The plugin tracks awakened sessions in an
`awakeSessions` list on disk — but that list is **never pruned** (the plugin's `pruneAwakeSessions`
is a known un-called TODO), so it accumulates **stale ids** across restarts. Trusting it directly
would render **ghost cards** for sessions that no longer exist — the W-030 "stale tracking lies"
failure mode again.

**Resolved (user): a session belongs on the board iff it is both persisted and awakened** — i.e.
`session.list()` ∩ `awakeSessions`. **But note (see Q11):** this intersection is only actually
*computed by enumeration* during the **one-time back-fill**. In steady state the board learns about
sessions from `/awaken` events (the awaken hook already gates on HIVE-awakened status), so the
"∩ awakened" test is applied at registration, not by repeatedly scanning `session.list()`.

**Verified semantics of `session.list()` (this is durable ground truth — evidence below):**
- `session.list()` (`GET /session`) returns **ALL persisted sessions**, read live from opencode's
  on-disk SQLite DB (`~/.local/share/opencode/opencode.db`, `session` table). It is **independent of
  reboots and recent activity** — a session from weeks ago, untouched across restarts, still appears.
  (Proof: the live DB held 276 sessions spanning 34 days across many reboots.) This is exactly the
  "keep all the data around, just display it better" property the user wants — nothing is dropped.
- **Existence vs. busy-ness are orthogonal:** `session.list()` = *does it exist* (durable);
  `session.status()` / `session.idle` events = *is it busy right now* (live runtime). The board keys
  columns off existence + ownership, never off live busy-state.

**Correction to earlier reasoning:** an earlier draft claimed ghosts "vanish automatically because
dead sessions drop out of `session.list()`." That was wrong — persisted sessions do **not** drop out.
What the intersection actually does: it keeps **every real HIVE session** (durable, good), and
excludes only `awakeSessions` ids that point at a session which was genuinely **deleted** (absent
from `session.list()`). So the un-pruned `awakeSessions` list is harmless: staleness only matters if
it names a deleted session, and the `session.list()` join filters exactly those out. No data loss.

**Two build-time caveats — now scoped to the back-fill pass only (see Q11):**
1. **Default 100-row cap.** `session.list()` returns at most 100 rows (newest-first).
   **Correction (code-verified, 2026-07-08):** the typed SDK exposes **no `limit` parameter** on
   `session.list()` (query accepts only `directory`; `limit` exists only on `session.messages()`),
   so the cap **cannot be lifted through the typed client**. ⛔ Phase 1.5 opens with a mandatory,
   quick verification: enumerate and compare against known ground truth (e.g. the 200+ `sessions`
   entries in `.nervous-system-state.json`); if capped, **stop and resolve** (untyped `limit` query
   param on raw `GET /session`, or read opencode's SQLite `session` table) before building the
   back-fill. See DESIGN §6.a.
2. **Directory scoping.** The SDK filters to the current `directory` by default. The **back-fill**
   must omit / deliberately set `directory` to enumerate the whole project's sessions.

Since these only apply to the single first-run back-fill (not a steady-state loop), they're a
one-place concern rather than a hot-path hazard.

Settled edge cases under this rule:
- Top-level session that never ran `/awaken` → **not** shown (non-HIVE chat). Correct.
- `/awaken` run late → registers on awaken; back-filled title may be stale but is editable.
- Subagent/child sessions (`parentID` present) → never their own cards; they're activity *inside* the
  owning coordinator session. Filtered out via `parentID`.

## Q11 — What is `session.list()` actually FOR? (discovery model)  ✅ RESOLVED
Prompted by the user asking: *why do we even need `session.list()`, and what data do we want from it?*
The honest audit: the board's ownership model is **item-driven** — a work item names its owner
(`owner_session`), so we almost never need to *enumerate* sessions to find one. From `session.list()`
we'd only ever want **titles, existence, and timestamps**, and even those we can get **per-id** via
`session.get(id)` since we already hold the id.

**Resolved (user): event-driven primary + `session.list()` for one-time back-fill only.**
- **Steady state = events.** `/awaken` tells the board about a new HIVE session *with its id in hand*
  → the awaken hook auto-registers the work item and `session.get(id)` fetches its title. No polling,
  no enumeration.
- **`session.get(id)`** covers per-card detail refresh and deletion detection (not-found) — per-id,
  on demand.
- **`session.list()` is a bootstrap tool.** Its sole justified call is the **first-run back-fill**
  (user confirmed they want pre-existing awakened sessions to appear): enumerate `session.list()` ∩
  `awakeSessions` once, create In-Progress cards, done. This is the only place the 100-row-cap /
  directory-scope caveats apply.

**Consequences folded into DESIGN §6.a:** no steady-state polling loop; the board runs on HIVE's own
files + `/awaken` events + per-id `session.get`; `session.list()` shrinks from "core data source" to
"one-time bootstrap." Simpler architecture, and the list caveats become a one-place concern.

**Optional/open:** whether to also run a *periodic integrity sweep* with `session.list()` (catch
anything events missed) is deliberately deferred — event-driven + back-fill is enough for v1; add a
sweep only if drift is observed in practice.

## Q12 — Portability: does a work item survive moving the board to another machine?  ✅ RESOLVED
Prompted by the user: *if I move the board (with its data) to another machine, the sessions behind the
items won't be there — but I'd still like to inspect the work items, their descriptions, and whatever
we decide lives in them. Just not navigate to the (absent) session.*

This surfaced a latent flaw: `title` and `subtasks` were framed as read-live from the session, which
would render **blank** on a migrated board. Fix = an explicit **portability invariant** (SCHEMA §1a,
DESIGN §4.a):

> **Everything the board displays is stored on the work-item file. Session SDK calls power only
> navigation ("Open") and existence — never rendered content.**

**Resolved (user):**
- **Cache onto the item:** title + subtask snapshot + spec/body + `dream_id` + `artifacts[]` (the
  produced insights/warnings). Enough to fully understand what the work was and what it produced, with
  zero session (or even dream-archive) access. Session-derived fields are *mirrored in* by the owning
  session, not read live.
- **Absent-session UX:** the card **renders normally from cache**; only the "Open session" action is
  disabled (greyed + tooltip "session not available here"). Absence = **unknown**, NOT "deleted" — it
  does **not** change the card's column and does **not** fold the owner into history. A session merely
  on another machine must never be mislabeled orphaned.

Same principle as "Done = forgotten": the board *links to* live opencode state, never *depends on* it.
New fields: `title` reclassified as cached; `artifacts[]` added (SCHEMA §2).

## Q8 — Kanban board vs "fleet-status" view  ✅ RESOLVED (kanban first; fleet later, separate tab)
**The two views, explained.** They read the *same* HIVE files but answer different questions:

| | **Kanban board** | **Fleet-status view** |
|---|---|---|
| Question | "Where is the work?" | "What's the health of the collective?" |
| Organized by | **work item** | **capability** |
| Analogy | Jira/Trello project board | Grafana / ops dashboard |
| Shows | cards moving Backlog→In Progress→Done; subtasks; paused/live | per-capability **energy bars** (0–100), dissolve (<10) / split (>90) thresholds; dream-archive vitals (insight/warning/shadow counts, active DREAMING, DRM history); HIVEmind message flow / BLOCKED capabilities; the void (dissolved caps) |

The fleet view surfaces things the kanban structurally can't (capability energy, dream vitals,
message backlog) because those aren't "work moving through columns" — they're the state of the
organism.

**Resolved (user + recommendation): build the kanban first; leave a hook for a fleet view as a
separate tab/page later.** Rationale: the kanban is the actual ask and the priority; the fleet view
is a valuable *second lens* but competes with core work. It's cheap to add later — it reads the same
parsed files the board already loads. Not in v1 scope; keep the door open. (Note: Phase 1.5 already
renders sessions read-only, and Phase 1 optionally renders some HIVE state to validate parsers — that
is a stepping stone, not the full fleet view.)

**Dogfooding note (user idea):** once the board can hold Backlog/Todo items, the fleet-status view
itself becomes the board's **first real Todo card** — the tool tracking its own future work. A fitting
first entry, and a live test of the idea-first birth path.

## Q13 — Who may edit the spec body while an item is owned, and when is `spec_hash` stamped?  ✅ RESOLVED

Surfaced by design review: SCHEMA's authority table covers the body only "while not owned", and
`spec_hash` as specified (stamped at **bind** time, compared at re-promote) has a semantic bug —
legitimate body edits made *during* In Progress (the coordinator appending findings/decisions)
would later make the hash differ even if nobody touched the spec after demote, falsely forcing a
fresh session.

**Resolved (user, 2026-07-08): both parts as proposed.**
1. **Body while owned = Class A.** Once `owner_session` is set, the spec body is editable only
   by/through the owning session (same rule as `title`). The coordinator is *expected* to accumulate
   notes into it as work proceeds. Other sessions may not edit an owned item's body (single-writer).
   On true-demote the body reverts to Class B (any session may reshape the idea).
2. **`spec_hash` is (re)stamped at true-demote, and compared against that.** The question the hash
   answers is "did the spec change *while the item sat un-owned* in Todo/Backlog?" — so the baseline
   must be taken at the moment ownership was released, not at bind. Keep the bind-time stamp too if
   provenance is wanted, but the re-promote comparison uses the demote-time hash. (Bind-time
   stamping alone is only correct for items never edited during ownership.)

---

## Resolved (moved here from questions, kept for provenance)
- **What a work item IS** → one full HIVE **coordinator session**, not a subagent. Subagent
  dispatches are activity *within* it. (DESIGN §2)
- **Only HIVE sessions on the board** → non-HIVE chats excluded; every awakened session auto-appears
  In Progress even if not created as a card first. (DESIGN §2, §5.2a)
- **Three start paths** → bind current session / auto-register on `/awaken` / create fresh top-level
  session. All supported; plugin *can* create a top-level session (`session.create`), and the web
  GUI's `?session=<id>` **deep link** makes opening it one click (no TUI force-open needed).
  (DESIGN §5.3, SDK research)
- **Architecture split** → viewer (read-only first) + `hive_board_*` plugin tools. (DESIGN §3)
- **Ownership binding** → `hive_board_bind` stamps `owner_session` = current coordinator sessionID,
  resolved from plugin runtime + session map. (SCHEMA §2)
- **Viewer stack** → TypeScript, reusing the plugin's YAML parsers + SDK client. (Q4)
- **Work-item storage medium** → markdown+YAML under `.opencode/board/`. (SCHEMA §1)
- **Coupling** → tight: item ⇔ owning coordinator session ⇔ DRM. (DESIGN §2)
- **Subtask source of truth** → mirror the owning session's TodoWrite (`session.todo`/`todo.updated`). (SCHEMA §4)
- **Done gating** → DRM COMPLETE canonical; manual "done without dream" allowed but badged. (DESIGN §5.4)
- **Done = forgotten, not archived** → board holds "done" state; real session left untouched in the
  session list. Dissolves the SDK archive-state concern (Q9 moot). (DESIGN §5.4a)
- **Backward move** → destination is the decision: Paused (sub-state, same session) vs true-demote
  (detach + tombstone, fresh session on re-promote). Spec-edit (via `spec_hash`, re-stamped at
  true-demote — Q13) decides re-attach vs fresh; released sessions kept as history via
  `transitions[]`. (DESIGN §5.5, Q3)
- **Analysis** → phase inside In Progress, not a top-level column. (Q2, DESIGN §5.3)
- **Columns** → one pre-owned column (New folded into Todo): **Backlog · Todo · In Progress · Done**;
  scale up later if needed. (Q1)
- **Work-item storage** → flat `board/`, behind a swappable storage interface (modularity is the
  requirement, not the layout). (Q5, SCHEMA §1)
- **Session ↔ item** → strictly **1:1**; epics out of scope for v1. (Q7)
- **Which sessions show** → a session belongs iff persisted ∩ awakened; enforced at registration, not
  by polling. (Q10)
- **`session.list()` role** → event-driven in steady state (`/awaken` + `session.get(id)`);
  `session.list()` used only for the one-time first-run back-fill. No polling loop. (Q11, DESIGN §6.a)
- **Portability** → work item is self-contained: all displayed content (title, subtasks, spec,
  `artifacts[]`) cached on the item; session calls only for nav/existence; absent session degrades
  gracefully (card renders, "Open" disabled, absence = unknown not deleted). (Q12, SCHEMA §1a, DESIGN §4.a)
- **Fleet-status view** → out of v1 scope; kanban first, fleet view as a later separate tab (reads
  the same parsed files); becomes the board's own first Todo card. (Q8)

- **Viewer write path** → option (c): the viewer executes board-side transitions directly through
  the shared, hive-infra-owned transition module (+ locked storage, SCHEMA §4a); only in-session
  bind stays a plugin tool; no intent queue (plugin has no tick), no prompted agent turns. The tool
  was never meant to be read-only. `hive_board_start` = `session.create` → bind → auto-`/awaken`
  via `session.command` — but **only for sessions the board creates**; re-attach paths
  (unchanged-spec re-promote, resume-from-Paused, Done → In Progress) never re-run `/awaken`, since
  a session can only have become an owner by already being awakened (DESIGN §5.3c). (Q6)
- **Spec authority & `spec_hash` timing** → body is Class A (owning session only) while owned,
  Class B when un-owned; `spec_hash` re-stamped at **true-demote**, re-promote compares against the
  demote-time hash (bind-time stamp kept for provenance only). (Q13)

## Q14 — Phase 1.5 gate outcome: how is the full session set actually enumerated?  ✅ RESOLVED (SQLite, not the API)

The ⛔ gating verification (DESIGN §6.a) ran on 2026-07-10 against opencode ~1.17 and found **two
independent truncations** in API enumeration:

1. The 100-row default cap is real (`GET /session?directory=/workspace` → exactly 100 rows) but
   **liftable** via the untyped `?limit=` query param on the raw endpoint (verified working).
2. **Previously unknown, and fatal for enumeration:** `/session` is **project_id-scoped** and no
   parameter lifts it. opencode changed its project-identity computation on 2026-06-23, so the DB's
   284 sessions (all `directory=/workspace`) are split across **two** project_ids; the API returns
   only the current project's 114 rows. 12 of the 26 top-level awakened sessions lived in the old
   project_id and were unreachable through list — nearly half the board would have been silently
   lost. Also: bare `GET /session` (no `directory` param) scopes to the **server's** cwd → 0 rows;
   the param is effectively mandatory.

`session.get(id)` **does** resolve cross-project (verified 200 on old-project ids), so per-id
navigation/existence stays API-backed and safe.

**Resolution (implemented in Phase 1.5):** the back-fill enumerates from opencode's SQLite
`session` table **read-only** (`bun:sqlite` with `readonly: true` — safe concurrent reads against
the live WAL-mode DB) — provably complete because it *is* the persistence store. The API is used
only for per-id `session.get`. Standing rule: any future back-fill/enumeration must cross-check its
row count against the DB, never trust `/session` row counts. (Server access, for the record:
`opencode serve` at `127.0.0.1:$PORT`, HTTP Basic auth with username literally `opencode` and
password `$OPENCODE_SERVER_PASSWORD`.)

Intersection arithmetic that validated the mirror: 36 `awakeSessions` = 1 placeholder id (absent
from DB, excluded per W-061) + 9 children (`parent_id` set, never cards) + **26 top-level awakened
= 26 cards**.

---

## Q15 — `hive_board_bind` vs the auto-registered placeholder  ✅ RESOLVED (absorb pristine placeholder)

Surfaced by Phase 2 implementation (hive-infra, 2026-07-10): auto-registration (§5.2a path 2) means
**every** awakened session immediately owns a session-first placeholder item — so binding that
session to an idea-first item always hit the strict 1:1 refusal (`SESSION_OWNS_OTHER`). The most
common bind path ("this chat is now working on WI-007") had guaranteed friction: demote the
placeholder manually first.

**Resolved (user, 2026-07-10): bind absorbs a *pristine* placeholder.**
- **Pristine** = `origin: session-first` ∧ `dream_id` null ∧ spec body unchanged since creation
  (current body hash equals the creation-time `spec_hash`) ∧ no recorded subtask progress.
- If the session's only owned item is a pristine placeholder, `hive_board_bind` dissolves it and
  binds the idea item: the surviving item's bind `transitions[]` entry records
  `absorbed: WI-NNN` (lineage), and the placeholder **file is removed** — the one sanctioned
  deletion in the model, sound because "pristine" means zero information beyond what the survivor's
  lineage entry records.
- If the owned item is **not** pristine, the strict refusal stands (machine-readable
  `SESSION_OWNS_OTHER` + demote-first hint) — absorption never destroys accrued content.
- 1:1 (Q7) holds exactly at all times.

---

## Q16 — done-without-dream on a never-owned item: the reopen dead-end  ✅ RESOLVED (promote reopens as fresh)

Surfaced by board-viewer during Phase 3 (2026-07-11): `markDoneWithoutDream` permits closing a
never-owned idea straight from Todo/Backlog (guard is only `ALREADY_DONE`), but such an item could
never be reopened — `reattachInfo` decided `fresh` (nothing to re-attach), yet `startItem` refused
`ALREADY_DONE` with a "reopen via promoteItem" hint: circular.

**Resolved (user, 2026-07-11): keep the todo→done shortcut legal** (useful for "obsolete / turned
out trivial") **and make promote reopen it as a fresh start.** `promoteItem` on a done + never-owned
item executes the fresh path (status leaves `done`, `done_without_dream` clears, then the normal
awaken-on-create start) — the only coherent meaning of reopening an idea that never had a session.
Invariant 4 is untouched: it governs re-attach for items that *have* an owner; this corner has none.
`reattachInfo` reports it distinctly (`fresh` / `done-never-owned`) so the button can say what it
does ("Reopen as fresh session").

---

**All questions Q1–Q16 are now resolved (Q9 moot). Phases 0–3 are built; Phases 4–6 next.**
