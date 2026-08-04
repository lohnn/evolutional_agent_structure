import { beforeAll, afterAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { listItems } from "../../src/lib/board-store"
import type { BoardConfig } from "../../src/board-viewer/config"
import type { SessionMirror } from "../../src/board-viewer/data/sessions"
import { createApp } from "../../src/board-viewer/web/app"

/** Scratch WORKSPACE (not the real one) — transitions write only here. */
let ws: string
let config: BoardConfig
let app: (req: Request) => Promise<Response>

const mirror: SessionMirror = {
  available: false,
  computedAt: "2026-07-10T00:00:00Z",
  totalPersisted: 0,
  awakeIds: 0,
  awakeDeleted: 0,
  cards: [],
  persistedIds: [],
  error: "test stub",
}

function post(pathname: string, fields: Record<string, string>): Promise<Response> {
  return app(
    new Request(`http://test${pathname}`, { method: "POST", body: new URLSearchParams(fields) }),
  )
}

beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hive-board-ws-"))
  fs.mkdirSync(path.join(ws, ".opencode", "board"), { recursive: true })
  config = {
    workspaceRoot: ws,
    opencodeDir: path.join(ws, ".opencode"),
    hostname: "127.0.0.1",
    port: 0,
    opencodeDbPath: "/nonexistent.db",
    guiBaseUrl: "http://gui",
    boardDir: path.join(ws, ".opencode", "board"),
    opencodeUrl: null,
    opencodePassword: null,
    buildSha: "testsha",
  }
  app = createApp(config, mirror)
})

afterAll(() => fs.rmSync(ws, { recursive: true, force: true }))

describe("POST /transitions/create", () => {
  test("creates an idea item via the owner's module", async () => {
    const res = await post("/transitions/create", {
      title: "First idea",
      status: "todo",
      priority: "high",
      tags: "alpha, beta",
      body: "Spec text.",
    })
    expect(res.status).toBe(303)
    const items = listItems(ws)
    expect(items).toHaveLength(1)
    const i = items[0]!
    expect(i.id).toBe("WI-001")
    expect(i.status).toBe("todo")
    expect(i.priority).toBe("high")
    expect(i.tags).toEqual(["alpha", "beta"])
    expect(i.origin).toBe("idea-first")
    expect(i.transitions[0]!.from).toBeNull() // birth entry
    expect(i.body).toBe("Spec text.")
  })

  test("missing title → 400, nothing written", async () => {
    const res = await post("/transitions/create", { title: "  " })
    expect(res.status).toBe(400)
    expect(listItems(ws)).toHaveLength(1)
  })
})

describe("in_progress ops (seeded via hand-written scratch fixture)", () => {
  beforeAll(() => {
    // Scratch workspace, not the real board — fixture seeding is legitimate
    // here exactly like fixtures/board/ (the viewer itself never writes WI
    // files; only the owner's module does, and it refuses to invent owners).
    fs.writeFileSync(
      path.join(ws, ".opencode", "board", "WI-050.md"),
      [
        "---",
        "id: WI-050",
        'title: "Owned fixture"',
        "status: in_progress",
        "owner_session: ses_scratch_owner_000000000",
        "group_id: ses_scratch_owner_000000000",
        "origin: session-first",
        "paused: false",
        "spec_hash: abc123",
        "released_sessions: []",
        "dream_id: null",
        "artifacts: []",
        "created: 2026-07-10",
        "updated: 2026-07-10",
        "priority: medium",
        "tags: []",
        "done_without_dream: false",
        "subtasks: []",
        "transitions:",
        "  - { at: 2026-07-10T10:00:00Z, from: todo, to: in_progress, by: hive_board_bind, session: ses_scratch_owner_000000000 }",
        "---",
        "",
        "Scratch.",
      ].join("\n"),
    )
  })

  test("pause → paused sub-state", async () => {
    expect((await post("/transitions/pause", { id: "WI-050" })).status).toBe(303)
    expect(listItems(ws).find((i) => i.id === "WI-050")!.paused).toBe(true)
  })

  test("unpause → resumes", async () => {
    expect((await post("/transitions/unpause", { id: "WI-050" })).status).toBe(303)
    expect(listItems(ws).find((i) => i.id === "WI-050")!.paused).toBe(false)
  })

  test("demote → tombstone + owner cleared + spec_hash re-stamped", async () => {
    expect((await post("/transitions/demote", { id: "WI-050", to: "backlog" })).status).toBe(303)
    const i = listItems(ws).find((i) => i.id === "WI-050")!
    expect(i.status).toBe("backlog")
    expect(i.owner_session).toBeNull()
    expect(i.released_sessions).toEqual(["ses_scratch_owner_000000000"])
    expect(i.spec_hash).not.toBe("abc123") // Q13 demote-time re-stamp
  })
})

/**
 * WI-064 made `createIdea()` return `TransitionResult` and validate imperatively
 * INSIDE the shared module. These pin that the viewer's create form is a
 * well-behaved caller of that surface — it must surface a refusal, never assume
 * success.
 *
 * The tag case is the one that matters, and it is a genuine gap this found in
 * MY code. The form validates `status` and `priority` imperatively because both
 * are read as untyped strings and cast to unions — the cast made the boundary
 * visibly untrusted. `tags` needed no cast: splitting a form field yields
 * `string[]`, which is an HONEST type, so nothing prompted a guard. But honest
 * about the SHAPE is not honest about the GRAMMAR — `string[]` says nothing
 * about tokens being bare. So a tag with a space used to be written to disk
 * unchallenged. The module now refuses it, and the form's job is to show that
 * refusal rather than swallow it. The lens generalises past a wrong type: the
 * guard you skip is the one where the type is TRUE but insufficient.
 */
describe("create form is a well-behaved caller of createIdea()'s refusals", () => {
  test("a malformed tag is refused BY THE MODULE and the refusal reaches the user", async () => {
    const res = await post("/transitions/create", {
      title: "Item with a bad tag",
      status: "backlog",
      tags: "fine, not a bare token",
    })
    expect(res.status).toBe(409)
    const html = await res.text()
    expect(html).toContain("INVALID_TAG")
    // ...and nothing was written: a refusal must not half-create.
    expect(listItems(ws).some((i) => i.title === "Item with a bad tag")).toBe(false)
  })

  test("an empty title is caught by the form BEFORE the module (400, not 409)", async () => {
    // Both layers guard this; the form's own check answers first with a 400.
    const res = await post("/transitions/create", { title: "   ", status: "backlog" })
    expect(res.status).toBe(400)
  })

  test("status outside backlog/todo is refused, and never reaches disk", async () => {
    // The illegal state WI-065 was born in: in_progress with owner_session null.
    const res = await post("/transitions/create", {
      title: "Illegal in_progress birth",
      status: "in_progress",
    })
    expect(res.status).toBe(400) // the form's VALID_CREATE_STATUS answers first
    expect(listItems(ws).some((i) => i.status === "in_progress" && i.owner_session === null)).toBe(false)
  })
})

describe("honest refusals (TransitionErr → 409 with code + detail)", () => {
  test("pause on a non-in_progress item → NOT_IN_PROGRESS", async () => {
    const res = await post("/transitions/pause", { id: "WI-001" })
    expect(res.status).toBe(409)
    const html = await res.text()
    expect(html).toContain("NOT_IN_PROGRESS")
    expect(html).toContain("paused is a sub-state of in_progress")
  })

  test("done-without-dream succeeds then refuses ALREADY_DONE", async () => {
    expect((await post("/transitions/done-without-dream", { id: "WI-001" })).status).toBe(303)
    const i = listItems(ws).find((i) => i.id === "WI-001")!
    expect(i.status).toBe("done")
    expect(i.done_without_dream).toBe(true)

    const res = await post("/transitions/done-without-dream", { id: "WI-001" })
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("ALREADY_DONE")
  })

  test("unknown id → NOT_FOUND", async () => {
    const res = await post("/transitions/demote", { id: "WI-999" })
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("NOT_FOUND")
  })
})

describe("affordance visibility (SCHEMA §3-valid ops only)", () => {
  test("GET /: create forms on pre-owned columns; done card has no action forms", async () => {
    const res = await app(new Request("http://test/"))
    const html = await res.text()
    expect(html).toContain('action="/transitions/create"') // backlog+todo forms
    // WI-001 is done, WI-050 is backlog → no pause/demote/done forms remain
    expect(html).not.toContain('action="/transitions/pause"')
    expect(html).not.toContain('action="/transitions/done-without-dream"')
  })

  test("in_progress card shows pause/demote/done; paused card shows unpause", async () => {
    fs.writeFileSync(
      path.join(ws, ".opencode", "board", "WI-051.md"),
      "---\nid: WI-051\ntitle: x\nstatus: in_progress\nowner_session: ses_a\ngroup_id: ses_a\npaused: false\n---\n",
    )
    let html = await (await app(new Request("http://test/"))).text()
    expect(html).toContain('action="/transitions/pause"')
    expect(html).toContain('action="/transitions/demote"')
    expect(html).toContain('action="/transitions/done-without-dream"')

    fs.writeFileSync(
      path.join(ws, ".opencode", "board", "WI-051.md"),
      "---\nid: WI-051\ntitle: x\nstatus: in_progress\nowner_session: ses_a\ngroup_id: ses_a\npaused: true\n---\n",
    )
    html = await (await app(new Request("http://test/"))).text()
    expect(html).toContain('action="/transitions/unpause"')
    expect(html).not.toContain('action="/transitions/pause"')
    fs.rmSync(path.join(ws, ".opencode", "board", "WI-051.md"))
  })

  test("absorbed transitions render as lineage (Q15)", async () => {
    fs.writeFileSync(
      path.join(ws, ".opencode", "board", "WI-052.md"),
      [
        "---",
        "id: WI-052",
        'title: "Absorbing survivor"',
        "status: in_progress",
        "owner_session: ses_b",
        "group_id: ses_b",
        "transitions:",
        "  - { at: 2026-07-10T20:00:00Z, from: todo, to: in_progress, by: hive_board_bind, session: ses_b, absorbed: WI-009 }",
        "---",
      ].join("\n"),
    )
    const html = await (await app(new Request("http://test/"))).text()
    expect(html).toContain("absorbed <span class=\"mono\">WI-009</span> at bind")
    fs.rmSync(path.join(ws, ".opencode", "board", "WI-052.md"))
  })
})

describe("fixture mode — writes disabled", () => {
  test("POST refused with 409; GET hides affordances", async () => {
    const fixtureApp = createApp(
      { ...config, boardDir: path.join(import.meta.dir, "..", "..", "fixtures", "board") },
      mirror,
    )
    const res = await fixtureApp(
      new Request("http://test/transitions/create", {
        method: "POST",
        body: new URLSearchParams({ title: "nope" }),
      }),
    )
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("Writes disabled")

    const html = await (await fixtureApp(new Request("http://test/"))).text()
    expect(html).not.toContain('action="/transitions/')
    expect(html).toContain("fixture mode")
  })
})
