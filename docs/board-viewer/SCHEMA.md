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
├── WI-002/                  # spec-revision archive (only if the spec was ever revised)
│   └── a3f91c2e5b70.md      #   a superseded body, named by its own specHash
└── ...
```

**Per-item revision directories (WI-064).** When a spec body is replaced, the body it replaced is
archived to `board/<id>/<old-spec-hash>.md` *before* the new text lands — write-once, content-
addressed, **never pruned** (the board is gitignored; there is no VCS underneath to recover from).
Enumeration is unaffected: `listItemsInDir` filters on `/^WI-\d+\.md$/`, which a bare directory
name never matches, so revisions cost the board nothing to parse. Recover one with
`readRevision(dir, id, hash)`, which re-hashes the file and returns null if it no longer matches its
own name. Items that were never revised have no directory.

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
- Session-derived data (title, `todo_mirror`) is **cached into the item** by the owning session (a
  writer), and the board always reads the **item**, never the session, for content. (`subtasks` is
  NOT session-derived — it is authored directly on the item, §4.)
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
| `subtasks` | **authored on the item** — not session-derived at all (§4) | ✅ visible (it never depended on the session) |
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
subtasks:                       # AUTHOR-WRITTEN plan/decomposition (§4). Class A canonical — the
                                #   item file IS the source of truth. Hand-authoring is intended.
                                #   Typically present pre-ownership; see §4 for the disjointness
                                #   rule vs todo_mirror below.
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

> **Two different taxonomies use the letters A/B/C in this document. They are ORTHOGONAL AXES and
> the collision is a documentation hazard, so read the axis before reading the letter.**
>
> - **This table = the AUTHORITY axis** (DESIGN §4): *who* may write a field and *when*.
>   A = authority-restricted (transition module / owning session / an explicit tool);
>   B = freely writable while the item is un-owned ("proposal journal");
>   C = derived or stamped by a handler, never authored.
> - **§4 / §4b = the LOSS axis** (I-105/I-266): what happens if the value is *destroyed*.
>   Canonical = the item file is the only source of truth, loss is unrecoverable;
>   derived-rebuildable = a cache with an external source, loss costs a refresh.
>
> A field can be permissive on the authority axis and canonical on the loss axis at the same time —
> `tags` is exactly that. **Only the LOSS axis decides whether a whole-replace primitive is safe.**

| Field | Authority | Written by |
|---|---|---|
| `tags` | B (proposal-journal) — **but CANONICAL on the loss axis** | any session and the board, owned or not. Edited as **set deltas** (`ItemEdit.editTags` add/remove), never whole-replace — see §4e |
| `priority` | B (proposal-journal) | any session (and the board), while not owned |
| body (spec) | B → **A while owned** (Q13); revised only via `hive_board_respec` / `ItemEdit.setBody`, which preserves the prior text (§4d) | un-owned: any session/the board; owned: **owning session only** (it accumulates notes/decisions as it works); reverts to B on true-demote |
| `title` | B → **cached (A)** | authored freely while not owned; once owned, **mirrored from the session** and stored on the item (portability, §1a) — never read live |
| `status` | A/C | transition tools + derivation (never hand-edit to contradict a signal) |
| `owner_session`, `group_id` | A | `hive_board_bind` / `hive_board_start` / auto-register hook, resolved from plugin runtime + session map (W-009). **A navigation link, not a data dependency (§1a)** |
| `origin` | A | set once at birth (idea-first vs session-first) |
| `paused` | A | owning session sets it (or board affordance); a sub-state of In Progress, not a column |
| `spec_hash` | A | stamped at bind (provenance) and **re-stamped at true-demote**; on re-promote the live body hash is compared to the **demote-time** stamp to decide re-attach vs fresh session (§5.5, Q13) |
| `released_sessions[]` | A (append-only) | each true-demote appends the detached sessionID; read by the auto-register hook to skip re-adopting it |
| `history` (derived) | C | **not a stored field** — the "previously attempted in ses_..." lineage is read from `transitions[]`, which stamps `session` on every entry |
| `subtasks` | **A (canonical, authored)** | **author-written plan / decomposition stored on the item** (§4). The item file is its only source of truth — losing it is unrecoverable. Written at creation (`createItemUnlocked`) or hand-authored; **no `ItemEdit` primitive exists** (see §4b before adding one). Hand-authoring is *intended*, unlike every other field in this table |
| `todo_mirror`, `todo_mirror_updated` | A (cached/mirrored, derived-rebuildable) | whole-replaced from the owning session's live TodoWrite by the board via the shared locked-storage edit (`ItemEdit.setTodoMirror`, identity-free — I-179); `todo_mirror_updated` is a **full-precision ISO-8601** stamp (I-191/W-081). Derived-rebuildable throwaway cache (I-105/I-113). **Never hand-edited** (§4b) |
| `dream_id` | C (derived) | stamped by the **`hive_dream_begin` handler** — it resolves the calling session (`context.sessionID`), finds the item with matching `owner_session`, writes the new DRM id (DESIGN §5.4). File-scan detection is backfill/integrity fallback only |
| `artifacts[]` | C (cached) | copied onto the item by the **`hive_dream_complete` handler** (same session→item lookup), so "what it produced" survives migration (§1a). Skipped for DRMs carrying `pre_compaction: true` (WI-080) — a mid-session consolidation dream completes and archives but never touches the item |
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
   (which forces the `no-dream` badge). Note the converse is NOT an invariant: a COMPLETE DRM
   marked `pre_compaction: true` (WI-080) does not move its owning item — dream completion implies
   done only for unflagged (end-of-work) dreams.
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
   `dream_id` null, body hash == creation-time `spec_hash`, no `subtasks` authored on it), the placeholder
   is absorbed: its file is deleted (the one sanctioned deletion) and the surviving item's bind
   `transitions[]` entry records `absorbed: WI-NNN`. A non-pristine owned item still refuses
   (`SESSION_OWNS_OTHER`) — absorption never destroys accrued content.

---

## 4. `subtasks` — the author-written plan

> **Reclassified 2026-08-03** (ratified by hive-infra on board-viewer's census; supersedes the
> "subtask mirror" reading below). See the tombstone in §4b for what was replaced and why.

`subtasks` is the **author-written decomposition of a work item** — a human/agent-authored plan
stored on the item. It is *not* a mirror of anything. Each entry: `{ content, status }` where
`status ∈ {pending, in_progress, completed, cancelled}` (the same shape as `todo_mirror`, which is
what made the two confusable — shape similarity is not source similarity).

**`subtasks` and `todo_mirror` are disjoint by lifecycle, not by convention.** Verified against all
63 live work items on 2026-08-03:

| | `subtasks` | `todo_mirror` (§4b) |
|---|---|---|
| Lifecycle phase | **pre-ownership** — the item has no session yet | **post-ownership** — an owning session exists |
| Written by | a human/agent **authoring the plan** | the board, from the session's live TodoWrite |
| Source of truth | **the item file itself** | the live session's todo list |
| Write class (I-105) | **A — canonical** | **B — derived-rebuildable** |
| If lost | **information is gone forever** | rebuilt on next refresh |
| Observed live | 3 items, all `backlog`, `owner_session: null` | 11 items, all `in_progress`/`done` |
| Overlap | **zero** | **zero** |

An unowned item *cannot* hold a TodoWrite mirror — there is no session to mirror. An owned item's
live sub-state is `todo_mirror`'s job. The fields never compete for the same item at the same time.

**The Class A / Class B split is the load-bearing distinction, not the shape.** A canonical field and
a derived-rebuildable field must never be consolidated however alike they look, because they have
**opposite loss semantics**: deleting a Class-B mirror costs a refresh, deleting Class-A authored
content is unrecoverable data loss. Two fields that look identical but sit in different write classes
are not duplication — they are two different kinds of thing wearing the same shape.

> **`subtasks` MAY be hand-authored — that is now its purpose.** (This inverts the pre-2026-08-03
> warning, which forbade exactly what the live board does.) The W-030 divergence hazard does not
> apply: there is no live source for a hand edit to diverge *from*. The hazard applies to
> `todo_mirror`, which is still never hand-edited (§4b).

**Producer surface.** `subtasks` is written at item creation (`createItemUnlocked` already serializes
it) and otherwise hand-authored in the file. Note there is deliberately **no `ItemEdit` primitive**
for it — see the pre-approved extension point in §4b before adding one.

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

**Relationship to `subtasks` (§4).** They are **disjoint by lifecycle** — see the table in §4.
`subtasks` is the author-written plan of an *unowned* item (Class A, canonical); `todo_mirror` is the
machine-written cache of an *owned* session's live TodoWrite (Class B, derived-rebuildable).
`todo_mirror` carries its own full-precision `todo_mirror_updated` stamp (the legacy `updated` field
is date-only and must not be reused for ordering — I-191/W-081). **`todo_mirror` remains
authoritative for the live TodoWrite sub-state** — that part of the original ruling stands unchanged.

> ### ⚰️ Tombstone — "a future consolidation may retire `subtasks` in favor of `todo_mirror`"
>
> **Written:** ~2026-07-21 (WI-038). **Withdrawn:** 2026-08-03. **Do not re-derive it.**
>
> That line rested on the premise that both fields "cache the same source (the owning session's
> TodoWrite)" and that `subtasks` "never had a writer wired up" — i.e. that `subtasks` was a dormant
> duplicate (the I-209/I-213 dormant-field hazard). It was recorded as SHADOW-015.
>
> **The premise was falsified by census, not by argument.** All 63 live items were checked on
> 2026-08-03: the fields are perfectly disjoint, and `subtasks` had acquired a real producer — human
> authorship — and real content on 3 backlog items. It was never dormant; it had *changed jobs*
> without anyone recording it. The "same source, same semantics" test that makes a field duplication
> debt simply no longer returns true.
>
> Acting on the withdrawn line would now be **destructive twice over**: it deletes authored planning
> content that exists nowhere else (Class A — unrecoverable), and it breaks a live consumer in the
> plugin runtime, `isPristinePlaceholder()` in `board-transitions.ts`, which gates the one sanctioned
> deletion in the whole model on `subtasks.length === 0`. SHADOW-015's own escape condition ("no other
> consumer depends on subtasks") was never met.
>
> This tombstone exists because a deleted line leaves no trace of *why* — and the next reader,
> seeing two same-shaped fields, would re-derive the same wrong conclusion from the absence (W-103).
> The consolidation was **considered and rejected on evidence**, not forgotten.

**Pre-approved extension point — author-written `subtasks` from the board's create form.**
Ruled 2026-08-03; not yet built. Writing `subtasks` at item creation is **architecturally
permissible for board-viewer**, because the I-179 test passes: the write is **identity-free** (it
needs no in-session identity, unlike `todo_mirror` which requires the owning session's TodoWrite and
must stay plugin-runtime-owned). It must go through the one owner-published module, never a second
write path. Constraints, binding if it is built:

1. **Creation-time only, via `CreateIdeaInit`.** `createItemUnlocked` already serializes `subtasks`;
   only `CreateIdeaInit` needs an optional `subtasks?: Subtask[]` (hive-infra's change to make —
   signal before building the form, so the store change and the form land together rather than
   leaving dead surface).
2. **Do NOT reuse `setTodoMirror`'s shape** for any post-creation edit (I-190). It stamps
   `todo_mirror_updated`, a *cache-freshness* marker — authored content has no freshness, and
   stamping it would assert something false. More importantly its **whole-replace** semantics are
   safe only for a Class-B mirror whose truth lives elsewhere; whole-replacing Class-A authored
   content is a silent lost-update between two editors. A post-creation edit primitive therefore
   needs its own design (read-inside-lock at minimum), and is **not** approved here.
3. **`isPristinePlaceholder()` is unaffected** — re-verified on its hardest input, see §4c.

> Do not hand-edit `todo_mirror`/`todo_mirror_updated` (W-030) — the board whole-replaces them from
> live reads, so a hand edit is silently overwritten on the next refresh. **This warning applies to
> `todo_mirror` only.** It used to be justified "same rationale as `subtasks`"; since the 2026-08-03
> reclassification `subtasks` is deliberately hand-authorable (§4) and the shared rationale is gone.

---

## 4c. `isPristinePlaceholder()` under the reclassification

The `subtasks` reclassification changed what an existing gate *means*, so the gate was re-verified
before the reclassification was ratified (W-113: diff the new rule against the old on the old rule's
hardest inputs). Recorded here because this gate gates **the one sanctioned deletion in the model**.

`isPristinePlaceholder()` (plugin `board-transitions.ts`) decides whether a session's auto-registered
placeholder may be dissolved during bind-time absorption (§3 invariant 6 / Q15). One of its five
conditions is `item.subtasks.length === 0`.

**It survives, and lands on a better rationale than the one it was written with.** The check is
evaluated on the item being **dissolved** (`owned`), never on the item being bound to. So:

- An idea-first item carrying an author-written plan is always the **survivor**, never the sacrifice —
  its `subtasks` are never consulted by the gate and never destroyed.
- The gate's first condition is `origin === "session-first"`, and author-written plans live on
  `idea-first` items, which can never reach the gate as `owned` regardless of subtasks.
- Under the old reading the condition meant "no subtask *mirror* recorded". Under the new one it
  means "no authored content accrued on this placeholder" — which is **exactly** the gate's stated
  purpose ("anything else refuses so accrued content is never destroyed"). The check was more correct
  than its author knew.

Pinned by two tests in `test/board-transitions.test.ts` ("reclassification: …") so a future edit
cannot quietly point the check at the wrong item.

---

## 4d. Spec revisions — `setBody`, the revision archive, and `superseded` (WI-064)

Before WI-064 there was **no locked path to change a spec body at all**: `ItemEdit` could patch
`title` but not the body, so revising a spec meant hand text-surgery that bypassed the board lock
and destroyed the previous text. WI-055's original spec was lost exactly that way, and the board is
gitignored, so it was unrecoverable. This section is the closure of that gap.

**Retention is structural, not a convention.** `editItemUnlocked` archives the outgoing body
*before* the new one lands, whenever `setBody` is present. There is deliberately no flag to skip it:
a caller cannot destroy a spec body through this module even by mistake.

| Surface | Shape |
|---|---|
| `ItemEdit.setBody` | `{ body: string }` — replace the whole body. The ONLY primitive that writes outside the frontmatter region |
| `Transition.superseded` | `string?` — the `spec_hash` of the body this entry replaced. **A pointer; only present when a payload exists** |
| archive path | `board/<id>/<superseded>.md`, write-once, content-addressed, never pruned |
| read back | `readRevision(dir, id, hash)` → the body, or `null` if the file no longer hashes to its name |

**The revision entry is a tombstone (W-103).** A reader sees *that* the spec changed, when, and by
whom, straight from `transitions[]`, without opening the payload. `from` and `to` are the item's
status on both sides — a revision is not a column move, and the self-loop is the honest record.

**`spec_hash` is deliberately NOT re-stamped by a revision.** It is provenance from bind and
true-demote, and `reattachInfo()` compares it against the *live* body hash to decide re-attach vs
fresh session — "the edit is the decision" (Q13). Re-stamping here would silently convert
spec-changed into spec-unchanged and re-attach a session to a spec it never agreed to.

**`superseded` is only stamped when a payload exists.** Writing the first spec onto an item created
without a body supersedes nothing; stamping the empty-string hash would leave a pointer resolving to
`null` — an entry claiming text was replaced when none ever existed.

**Consumers must not read a revision entry as a work attempt.** Anything deriving "who worked on
this" from a transition's `session` must skip entries carrying `superseded`, or a spec *editor* is
mislabelled a failed prior *attempt*.

**Ownership gate.** Body and title are freely writable while un-owned and belong to the owning
session once owned (§2). Only the plugin runtime resolves a session id trustworthily (W-009), so an
identity-free caller may revise un-owned items only.

---

## 4e. `tags` — canonical content edited as set deltas (WI-064)

`tags` is **permissive on the authority axis** (anyone may edit, owned or not) and **canonical on
the loss axis** (author-written, no external source, unrecoverable if destroyed). Per I-266 the loss
axis is what governs the primitive: a whole-replace `setTags` would be a silent lost update between
two editors — the hazard that got post-creation `subtasks` editing rejected.

Tags nevertheless get a safe post-creation path where `subtasks` could not, and **the reason is the
data's algebra, not its storage shape.** Tags are an unordered SET of opaque tokens, so add/remove
are commutative and idempotent: two concurrent editors sending `{add:["a"]}` and `{add:["b"]}`
converge on `{a,b}` in either order, because neither ever transmits the whole set. `subtasks` is an
ORDERED list of rich records whose concurrent edits do not commute (reorder vs in-place content
edit), so it still needs its own design and **remains unapproved post-creation** — creation-time
only, via `CreateIdeaInit.subtasks`.

| Surface | Shape |
|---|---|
| `ItemEdit.editTags` | `{ add?: string[]; remove?: string[] }` — set delta, read from the file inside the lock |
| tag grammar | `/^[A-Za-z0-9][A-Za-z0-9._-]*$/` — bare tokens; no spaces, commas or brackets |

Refusals: a tag in **both** add and remove (refused, never guessed); malformed tokens; an empty
delta. Adding a present tag or removing an absent one is a no-op and skips the write entirely, so an
idempotent retry does not bump `updated` (I-212). No transition is appended — tags are mutable
metadata like `priority`, and the delta shape destroys nothing, so there is no loss to audit.

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
