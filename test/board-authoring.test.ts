/**
 * WI-064 — authoring tools: create / respec / retitle / tags.
 *
 * The refusal tests here deliberately pass the forbidden values as REAL CALLS
 * and assert on the observed result and the observed file, never on what a
 * type or a description claims (I-246: a field advertised as rejected was once
 * silently accepted while a suite derived from the same belief as the code
 * stayed green). A test that asserts "the schema says no" is not evidence.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import {
  readItem,
  itemPath,
  specHash,
  listRevisions,
  readRevision,
  revisionDir,
  applyEditToContent,
  parseWorkItem,
  listItems,
} from "../src/lib/board-store.ts"
import {
  createIdea,
  respecItem,
  retitleItem,
  editItemTags,
  bindSession,
  demoteItem,
  reattachInfo,
} from "../src/lib/board-transitions.ts"

/**
 * Fixture helper: createIdea now returns TransitionResult (it validates input
 * at runtime — WI-065). These call sites expect success, so unwrap loudly
 * rather than letting a silently-refused fixture make a later assertion lie.
 */
async function mkIdea(d: string, init: Parameters<typeof createIdea>[1]) {
  const r = await createIdea(d, init)
  if (!r.ok) throw new Error(`fixture createIdea refused: ${r.reason} — ${r.detail}`)
  return r
}

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-authoring-"))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe("create", () => {
  test("allocates an id and sets birth defaults without the caller knowing the schema", async () => {
    const r = await mkIdea(dir, { title: "First", body: "spec text" })
    const it = r.item
    expect(it.id).toMatch(/^WI-\d{3}$/)
    expect(it.status).toBe("backlog")
    expect(it.owner_session).toBeNull()
    expect(it.group_id).toBeNull()
    expect(it.origin).toBe("idea-first")
    expect(it.spec_hash).toBeNull()
    expect(it.priority).toBe("medium")
    expect(it.transitions).toHaveLength(1)
    expect(it.transitions[0]!.from).toBeNull()
    expect(it.transitions[0]!.to).toBe("backlog")
  })

  test("creation-time subtasks land; todo_mirror stays empty (Class A vs B stay separate)", async () => {
    const r = await mkIdea(dir, {
      title: "Planned",
      subtasks: [
        { content: "Phase 1", status: "pending" },
        { content: "Phase 2", status: "pending" },
      ],
    })
    expect(r.item.subtasks.map((s) => s.content)).toEqual(["Phase 1", "Phase 2"])
    expect(r.item.todo_mirror).toEqual([])
    // survives a re-read from disk (serialization round-trip)
    expect(readItem(dir, r.item.id)!.subtasks).toHaveLength(2)
  })
})

/**
 * ── THE WI-065 REGRESSION CLASS ──────────────────────────────────────────────
 *
 * These exist because the previous suite was 26/26 green over a broken guard.
 * It was written from the same belief that produced the code — that
 * `tool.schema.enum([...])` rejects at runtime — so it never passed a bad
 * value and never saw the hole. A live call with status:"in_progress" then
 * wrote an in_progress, un-owned item to disk (WI-065): illegal state, since
 * in_progress implies ownership (SCHEMA §3 invariant 1).
 *
 * Every test below passes a value the code is *claimed* to reject and asserts
 * on the OBSERVED refusal and the OBSERVED absence of a file — never on a type,
 * a schema, or a description. `tool()` is the identity function and
 * `tool.schema` is uninvoked zod, so a declaration is documentation; only an
 * imperative check is a guard (I-246).
 */
describe("REFUSALS proven by live calls with the forbidden value", () => {
  test("create with status:'in_progress' is REFUSED and writes NOTHING (the WI-065 case)", async () => {
    const before = listItems(dir).length
    // Deliberately defeat the type narrowing — this is exactly what the model
    // can emit at runtime, and what TypeScript wrongly promises cannot happen.
    const r = await createIdea(dir, {
      title: "should not exist",
      status: "in_progress" as unknown as "backlog",
    })
    expect(!r.ok && r.reason).toBe("INVALID_STATUS")
    expect(listItems(dir)).toHaveLength(before) // nothing on disk
  })

  test("create with status:'done' is REFUSED", async () => {
    const r = await createIdea(dir, { title: "x", status: "done" as unknown as "todo" })
    expect(!r.ok && r.reason).toBe("INVALID_STATUS")
    expect(listItems(dir)).toHaveLength(0)
  })

  test("no created item can ever be in_progress without an owner (the invariant itself)", async () => {
    for (const s of ["in_progress", "done", "archived", "", "BACKLOG"]) {
      await createIdea(dir, { title: `probe ${s}`, status: s as unknown as "backlog" })
    }
    const illegal = listItems(dir).filter((i) => i.status === "in_progress" && i.owner_session === null)
    expect(illegal).toEqual([])
    expect(listItems(dir)).toHaveLength(0)
  })

  test("create with a bogus priority is REFUSED", async () => {
    const r = await createIdea(dir, { title: "x", priority: "urgent" as unknown as "high" })
    expect(!r.ok && r.reason).toBe("INVALID_PRIORITY")
    expect(listItems(dir)).toHaveLength(0)
  })

  test("create with malformed tags is REFUSED before any write", async () => {
    const r = await createIdea(dir, { title: "x", tags: ["ok", "not ok"] })
    expect(!r.ok && r.reason).toBe("INVALID_TAG")
    expect(listItems(dir)).toHaveLength(0)
  })

  test("create with an empty/whitespace title is REFUSED", async () => {
    const r = await createIdea(dir, { title: "   " })
    expect(!r.ok && r.reason).toBe("EMPTY_TITLE")
    expect(listItems(dir)).toHaveLength(0)
  })

  test("valid statuses still pass — the guard rejects, it does not just block everything", async () => {
    const a = await createIdea(dir, { title: "a", status: "backlog" })
    const b = await createIdea(dir, { title: "b", status: "todo" })
    expect(a.ok && a.item.status).toBe("backlog")
    expect(b.ok && b.item.status).toBe("todo")
  })
})

describe("respec — retention is structural", () => {
  test("prior body is archived content-addressed and is byte-recoverable", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "ORIGINAL SPEC" })
    const originalHash = specHash("ORIGINAL SPEC")

    const r = await respecItem(dir, item.id, "REVISED SPEC")
    expect(r.ok && r.action).toBe("respecced")

    expect(listRevisions(dir, item.id)).toEqual([originalHash])
    expect(readRevision(dir, item.id, originalHash)).toBe("ORIGINAL SPEC")
    expect(readItem(dir, item.id)!.body).toBe("REVISED SPEC")
  })

  test("DESTRUCTIVE-EDIT REGRESSION: two revisions, BOTH prior bodies recoverable", async () => {
    // The WI-055 loss is the worked example this test exists for.
    const { item } = await mkIdea(dir, { title: "T", body: "v1 body" })
    await respecItem(dir, item.id, "v2 body")
    await respecItem(dir, item.id, "v3 body")

    const h1 = specHash("v1 body")
    const h2 = specHash("v2 body")
    expect(listRevisions(dir, item.id).sort()).toEqual([h1, h2].sort())
    expect(readRevision(dir, item.id, h1)).toBe("v1 body")
    expect(readRevision(dir, item.id, h2)).toBe("v2 body")
    expect(readItem(dir, item.id)!.body).toBe("v3 body")
  })

  test("the transition log is a readable tombstone without opening the payload (W-103)", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "old" })
    await respecItem(dir, item.id, "new", { by: "hive_board_respec:tester", session: null })
    const t = readItem(dir, item.id)!.transitions
    const rev = t[t.length - 1]!
    expect(rev.superseded).toBe(specHash("old"))
    expect(rev.by).toBe("hive_board_respec:tester")
    expect(rev.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    // a revision is not a column move
    expect(rev.from).toBe("backlog")
    expect(rev.to).toBe("backlog")
  })

  test("revision hashes survive a full serialize/parse round-trip", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "old" })
    await respecItem(dir, item.id, "new")
    const raw = fs.readFileSync(itemPath(dir, item.id), "utf8")
    expect(raw).toContain("superseded:")
    expect(parseWorkItem(raw).transitions.at(-1)!.superseded).toBe(specHash("old"))
  })

  test("NO DANGLING POINTER: respec on a body-less item stamps no `superseded`", async () => {
    // Found by disposing of WI-065 (created with no body). Stamping the
    // empty-string hash would leave a pointer resolving to null — an entry
    // claiming text was superseded when none ever existed.
    const { item } = await mkIdea(dir, { title: "no body yet" })
    const r = await respecItem(dir, item.id, "the first spec")
    expect(r.ok).toBe(true)

    const rev = readItem(dir, item.id)!.transitions.at(-1)!
    expect(rev.superseded).toBeUndefined()
    expect(listRevisions(dir, item.id)).toEqual([])
  })

  test("EVERY `superseded` pointer in a log resolves to a real payload", async () => {
    // The invariant the dangling-pointer bug violated, asserted directly.
    const { item } = await mkIdea(dir, { title: "T" }) // starts body-less
    await respecItem(dir, item.id, "first")
    await respecItem(dir, item.id, "second")
    await respecItem(dir, item.id, "third")

    const pointers = readItem(dir, item.id)!
      .transitions.map((t) => t.superseded)
      .filter((h): h is string => h !== undefined)
    expect(pointers).toHaveLength(2) // first→second, second→third; not the body-less one
    for (const h of pointers) {
      expect(readRevision(dir, item.id, h)).not.toBeNull()
    }
  })

  test("identical body is an idempotent no-op — no revision, no transition (I-212)", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "same" })
    const before = readItem(dir, item.id)!.transitions.length
    const r = await respecItem(dir, item.id, "same")
    expect(r.ok && r.action).toBe("respec-noop")
    expect(listRevisions(dir, item.id)).toEqual([])
    expect(readItem(dir, item.id)!.transitions).toHaveLength(before)
  })

  test("empty body is REFUSED — that discards a spec, not revises it", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "real spec" })
    const r = await respecItem(dir, item.id, "   \n  ")
    expect(!r.ok && r.reason).toBe("EMPTY_BODY")
    expect(readItem(dir, item.id)!.body).toBe("real spec")
  })
})

describe("respec — ownership gate (SCHEMA §2), proven by live calls", () => {
  test("un-owned item: an identity-free caller MAY revise", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "a" })
    const r = await respecItem(dir, item.id, "b", { session: null })
    expect(r.ok).toBe(true)
  })

  test("owned item + WRONG session: REFUSED, and the body on disk is unchanged", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "owned spec" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")

    const r = await respecItem(dir, item.id, "hostile rewrite", { session: "ses_intruder" })

    expect(!r.ok && r.reason).toBe("ITEM_OWNED")
    expect(readItem(dir, item.id)!.body).toBe("owned spec")
    expect(listRevisions(dir, item.id)).toEqual([]) // nothing archived on a refusal
  })

  test("owned item + the OWNING session: allowed", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "owned spec" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")
    const r = await respecItem(dir, item.id, "owner's revision", { session: "ses_owner" })
    expect(r.ok).toBe(true)
    expect(readItem(dir, item.id)!.body).toBe("owner's revision")
  })

  test("an identity-free caller may NOT revise an owned item", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "owned spec" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")
    const r = await respecItem(dir, item.id, "board rewrite", { session: null })
    expect(!r.ok && r.reason).toBe("ITEM_OWNED")
  })
})

describe("respec never touches transition-module-owned state", () => {
  test("owner_session, group_id, status, spec_hash, todo_mirror, subtasks all survive", async () => {
    const { item } = await mkIdea(dir, {
      title: "T",
      body: "before",
      subtasks: [{ content: "authored step", status: "pending" }],
    })
    await bindSession(dir, item.id, "ses_owner", "grp_1")
    const pre = readItem(dir, item.id)!

    await respecItem(dir, item.id, "after", { session: "ses_owner" })
    const post = readItem(dir, item.id)!

    expect(post.owner_session).toBe(pre.owner_session)
    expect(post.group_id).toBe(pre.group_id)
    expect(post.status).toBe(pre.status)
    expect(post.spec_hash).toBe(pre.spec_hash) // NOT re-stamped — Q13
    expect(post.todo_mirror).toEqual(pre.todo_mirror)
    expect(post.subtasks).toEqual(pre.subtasks)
    expect(post.released_sessions).toEqual(pre.released_sessions)
    expect(post.transitions.length).toBe(pre.transitions.length + 1)
  })

  test("Q13 INTEGRITY: respec on a demoted item still yields a FRESH session decision", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "original" })
    await bindSession(dir, item.id, "ses_a", "ses_a")
    await demoteItem(dir, item.id, "todo")
    // demote re-stamps spec_hash → unchanged spec would re-attach
    expect(reattachInfo(dir, item.id)).toMatchObject({ kind: "reattach", reason: "spec-unchanged" })

    await respecItem(dir, item.id, "materially different spec")

    // the edit IS the decision: a revised spec must NOT re-attach
    expect(reattachInfo(dir, item.id)).toMatchObject({ kind: "fresh", reason: "spec-changed" })
  })
})

describe("body surgery preserves everything else byte-for-byte (I-049)", () => {
  test("unknown frontmatter fields, comments and hand edits survive a body replace", () => {
    const raw = [
      "---",
      "id: WI-900",
      'title: "Probe"',
      "status: backlog",
      "# a hand-written comment",
      "some_unknown_future_field: keep-me",
      "tags: [alpha]",
      "transitions:",
      "  - { at: 2026-08-03T10:00:00Z, from: null, to: backlog, by: board:create }",
      "---",
      "",
      "OLD BODY",
      "",
    ].join("\n")

    const out = applyEditToContent(raw, { setBody: { body: "NEW BODY" } })

    expect(out).toContain("some_unknown_future_field: keep-me")
    expect(out).toContain("# a hand-written comment")
    expect(out.split("\n---\n")[0]).toBe(raw.split("\n---\n")[0]) // frontmatter identical
    expect(parseWorkItem(out).body).toBe("NEW BODY")
  })

  test("a body containing '---' and '  - ' list lines round-trips (the rejected in-frontmatter design would break here)", () => {
    const body = ["Intro para.", "", "---", "", "Steps:", "  - alpha", "  - beta", "", "Done."].join("\n")
    const { item: _ } = { item: null }
    void _
    const raw = ["---", "id: WI-901", 'title: "P"', "status: backlog", "transitions: []", "---", "", "x", ""].join("\n")
    const out = applyEditToContent(raw, { setBody: { body } })
    const parsed = parseWorkItem(out)
    expect(parsed.body).toBe(body)
    expect(parsed.id).toBe("WI-901") // frontmatter still parses despite --- in the body
    expect(parsed.status).toBe("backlog")
  })
})

describe("retitle refusals, proven by live calls", () => {
  test("retitle on an item owned by ANOTHER session is REFUSED; title on disk unchanged", async () => {
    const { item } = await mkIdea(dir, { title: "original title" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")
    const r = await retitleItem(dir, item.id, "hostile retitle", { session: "ses_intruder" })
    expect(!r.ok && r.reason).toBe("ITEM_OWNED")
    expect(readItem(dir, item.id)!.title).toBe("original title")
  })

  test("the owning session MAY retitle", async () => {
    const { item } = await mkIdea(dir, { title: "original title" })
    await bindSession(dir, item.id, "ses_owner", "ses_owner")
    const r = await retitleItem(dir, item.id, "owner retitle", { session: "ses_owner" })
    expect(r.ok).toBe(true)
    expect(readItem(dir, item.id)!.title).toBe("owner retitle")
  })

  test("empty title is REFUSED", async () => {
    const { item } = await mkIdea(dir, { title: "keep me" })
    const r = await retitleItem(dir, item.id, "   ")
    expect(!r.ok && r.reason).toBe("EMPTY_TITLE")
    expect(readItem(dir, item.id)!.title).toBe("keep me")
  })

  test("retitle on a MISSING item is refused, not silently created", async () => {
    const r = await retitleItem(dir, "WI-404", "ghost")
    expect(!r.ok && r.reason).toBe("NOT_FOUND")
    expect(listItems(dir)).toHaveLength(0)
  })
})

describe("tags — set deltas, not whole-replace", () => {
  test("add and remove merge into the existing set", async () => {
    const { item } = await mkIdea(dir, { title: "T", tags: ["alpha", "beta"] })
    await editItemTags(dir, item.id, { add: ["gamma"], remove: ["alpha"] })
    expect(readItem(dir, item.id)!.tags).toEqual(["beta", "gamma"])
  })

  test("idempotent: re-adding a present tag does not duplicate or bump the file", async () => {
    const { item } = await mkIdea(dir, { title: "T", tags: ["alpha"] })
    const r = await editItemTags(dir, item.id, { add: ["alpha"] })
    expect(r.ok && r.action).toBe("tags-noop")
    expect(readItem(dir, item.id)!.tags).toEqual(["alpha"])
  })

  test("a tag in BOTH add and remove is refused, not guessed", async () => {
    const { item } = await mkIdea(dir, { title: "T", tags: ["alpha"] })
    const r = await editItemTags(dir, item.id, { add: ["x"], remove: ["x"] })
    expect(!r.ok && r.reason).toBe("CONTRADICTORY_TAGS")
    expect(readItem(dir, item.id)!.tags).toEqual(["alpha"])
  })

  test("malformed tags are refused before any write", async () => {
    const { item } = await mkIdea(dir, { title: "T", tags: ["alpha"] })
    const r = await editItemTags(dir, item.id, { add: ["has space", "ok"] })
    expect(!r.ok && r.reason).toBe("INVALID_TAG")
    expect(readItem(dir, item.id)!.tags).toEqual(["alpha"])
  })

  test("tags edits append NO transition (metadata, like priority)", async () => {
    const { item } = await mkIdea(dir, { title: "T" })
    const before = readItem(dir, item.id)!.transitions.length
    await editItemTags(dir, item.id, { add: ["x"] })
    expect(readItem(dir, item.id)!.transitions).toHaveLength(before)
  })
})

describe("CONCURRENCY (the lock is the guarantee, W-024)", () => {
  test("parallel creates allocate DISTINCT ids", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => mkIdea(dir, { title: `Parallel ${i}` }))
    )
    const ids = results.map((r) => r.item.id)
    expect(new Set(ids).size).toBe(8)
    expect(listItems(dir)).toHaveLength(8)
  })

  test("TAGS: two concurrent editors — neither change is lost", async () => {
    const { item } = await mkIdea(dir, { title: "T", tags: ["base"] })
    await Promise.all([
      editItemTags(dir, item.id, { add: ["from-editor-a"] }),
      editItemTags(dir, item.id, { add: ["from-editor-b"] }),
    ])
    const tags = readItem(dir, item.id)!.tags
    expect(tags).toContain("base")
    expect(tags).toContain("from-editor-a")
    expect(tags).toContain("from-editor-b")
  })

  test("RESPEC: concurrent revisions lose no body — every superseded text is archived", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "start" })
    await Promise.all([
      respecItem(dir, item.id, "revision-one"),
      respecItem(dir, item.id, "revision-two"),
    ])
    const final = readItem(dir, item.id)!.body
    const archived = listRevisions(dir, item.id).map((h) => readRevision(dir, item.id, h))
    // whichever won, the other two texts are both recoverable
    const all = [...archived, final]
    expect(all).toContain("start")
    expect(all).toContain("revision-one")
    expect(all).toContain("revision-two")
  })
})

describe("revision archive hygiene", () => {
  test("revision dirs are invisible to item enumeration", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "a" })
    await respecItem(dir, item.id, "b")
    expect(fs.existsSync(revisionDir(dir, item.id))).toBe(true)
    expect(listItems(dir).map((i) => i.id)).toEqual([item.id]) // the dir is not parsed as an item
  })

  test("readRevision verifies the content still hashes to its filename", async () => {
    const { item } = await mkIdea(dir, { title: "T", body: "authentic" })
    await respecItem(dir, item.id, "next")
    const h = specHash("authentic")
    expect(readRevision(dir, item.id, h)).toBe("authentic")
    // tamper with the archived file — the pointer must stop trusting it
    fs.writeFileSync(path.join(revisionDir(dir, item.id), `${h}.md`), "tampered\n", "utf8")
    expect(readRevision(dir, item.id, h)).toBeNull()
  })
})
