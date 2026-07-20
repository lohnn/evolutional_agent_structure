import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { listItems, specHash } from "evolutional-agent-structure/lib/board-store"
import type { BoardSessionClient } from "evolutional-agent-structure/lib/board-transitions"
import type { BoardConfig } from "../src/config"
import type { SessionMirror } from "../src/data/sessions"
import { createApp } from "../src/web/app"
import { clearNotices } from "../src/web/notices"

let ws: string
let config: BoardConfig

const mirror: SessionMirror = {
  available: false,
  computedAt: "2026-07-11T00:00:00Z",
  totalPersisted: 0,
  awakeIds: 0,
  awakeDeleted: 0,
  cards: [],
  persistedIds: [],
  error: "test stub",
}

interface FakeClient {
  client: BoardSessionClient
  created: string[]
  commands: [string, string, string][]
}

function fakeClient(opts: { failCommand?: boolean } = {}): FakeClient {
  const created: string[] = []
  const commands: [string, string, string][] = []
  let n = 0
  return {
    created,
    commands,
    client: {
      async createSession(title: string): Promise<string> {
        created.push(title)
        return `ses_fake_${String(++n).padStart(3, "0")}_0000000000`
      },
      async command(sessionID: string, command: string, argsText: string): Promise<void> {
        if (opts.failCommand) throw new Error("COMMAND_BOOM")
        commands.push([sessionID, command, argsText])
      },
    },
  }
}

function writeItem(id: string, fields: string[], body = "Spec."): void {
  fs.writeFileSync(
    path.join(ws, ".opencode", "board", `${id}.md`),
    ["---", `id: ${id}`, ...fields, "---", "", body].join("\n"),
  )
}

function post(app: (r: Request) => Promise<Response>, pathname: string, fields: Record<string, string>) {
  return app(new Request(`http://test${pathname}`, { method: "POST", body: new URLSearchParams(fields) }))
}

beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hive-board-p3-"))
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
  }
})

beforeEach(() => {
  clearNotices()
  for (const f of fs.readdirSync(path.join(ws, ".opencode", "board"))) {
    fs.rmSync(path.join(ws, ".opencode", "board", f), { recursive: true, force: true })
  }
})

afterAll(() => fs.rmSync(ws, { recursive: true, force: true }))

describe("POST /transitions/start", () => {
  test("unowned todo → session created, ownership stamped, awaken seeded with spec", async () => {
    writeItem("WI-001", ['title: "Startable"', "status: todo"], "The spec body.")
    const fake = fakeClient()
    const app = createApp(config, mirror, fake.client)

    const res = await post(app, "/transitions/start", { id: "WI-001" })
    expect(res.status).toBe(303)

    const item = listItems(ws)[0]!
    expect(item.status).toBe("in_progress")
    expect(item.owner_session).toBe("ses_fake_001_0000000000")
    expect(item.group_id).toBe(item.owner_session) // I-043: stamped together

    expect(fake.created).toEqual(["Startable"])
    await Bun.sleep(5) // fire-and-forget command settles
    expect(fake.commands).toHaveLength(1)
    const [sid, cmd, args] = fake.commands[0]!
    expect(sid).toBe("ses_fake_001_0000000000")
    expect(cmd).toBe("awaken")
    expect(args).toContain("WI-001")
    expect(args).toContain("The spec body.")
  })

  test("owned item → ITEM_OWNED refusal, NO session created (orphan-free pre-validation)", async () => {
    writeItem("WI-002", ['title: "Owned"', "status: in_progress", "owner_session: ses_x", "group_id: ses_x"])
    const fake = fakeClient()
    const app = createApp(config, mirror, fake.client)
    const res = await post(app, "/transitions/start", { id: "WI-002" })
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("ITEM_OWNED")
    expect(fake.created).toHaveLength(0)
  })

  test("awaken failure → visible notice; session stays created and owned", async () => {
    writeItem("WI-003", ['title: "Awaken fails"', "status: todo"])
    const fake = fakeClient({ failCommand: true })
    const app = createApp(config, mirror, fake.client)

    expect((await post(app, "/transitions/start", { id: "WI-003" })).status).toBe(303)
    await Bun.sleep(5)
    const html = await (await app(new Request("http://test/"))).text()
    expect(html).toContain("/awaken failed")
    expect(html).toContain("run /awaken manually")
    expect(html).toContain("ses_fake_001_0000000000")
    expect(listItems(ws)[0]!.owner_session).toBe("ses_fake_001_0000000000") // still owned
  })

  test("unconfigured backend → honest 409, nothing created", async () => {
    writeItem("WI-004", ['title: "No backend"', "status: todo"])
    const app = createApp(config, mirror, null)
    const res = await post(app, "/transitions/start", { id: "WI-004" })
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("not configured")
    expect(listItems(ws)[0]!.status).toBe("todo")
  })
})

describe("POST /transitions/promote — the reattachInfo decision, executed", () => {
  test("done item → reattached to ORIGINAL session; ZERO client calls; no-dream badge cleared", async () => {
    writeItem("WI-010", [
      'title: "Done item"',
      "status: done",
      "owner_session: ses_original_owner_000000",
      "group_id: ses_original_owner_000000",
      "done_without_dream: true",
    ])
    const fake = fakeClient()
    const app = createApp(config, mirror, fake.client)

    const res = await post(app, "/transitions/promote", { id: "WI-010" })
    expect(res.status).toBe(303)
    const item = listItems(ws)[0]!
    expect(item.status).toBe("in_progress")
    expect(item.owner_session).toBe("ses_original_owner_000000") // same session, invariant 4
    expect(item.done_without_dream).toBe(false) // reopen clears the badge
    expect(fake.created).toHaveLength(0) // never createSession
    await Bun.sleep(5)
    expect(fake.commands).toHaveLength(0) // never /awaken on re-attach
  })

  test("demoted + spec UNCHANGED → re-attach last released session, zero client calls", async () => {
    const body = "Unchanged spec."
    writeItem(
      "WI-011",
      [
        'title: "Demoted, unchanged"',
        "status: todo",
        "released_sessions: [ses_released_111111111111]",
        `spec_hash: ${specHash(body)}`, // demote-time baseline matches current body
      ],
      body,
    )
    const fake = fakeClient()
    const app = createApp(config, mirror, fake.client)

    expect((await post(app, "/transitions/promote", { id: "WI-011" })).status).toBe(303)
    const item = listItems(ws)[0]!
    expect(item.owner_session).toBe("ses_released_111111111111")
    expect(item.released_sessions).toEqual(["ses_released_111111111111"]) // tombstone persists (append-only)
    expect(fake.created).toHaveLength(0)
    await Bun.sleep(5)
    expect(fake.commands).toHaveLength(0)
  })

  test("demoted + spec EDITED → fresh session (the edit IS the decision, Q13)", async () => {
    writeItem(
      "WI-012",
      [
        'title: "Demoted, edited"',
        "status: todo",
        "released_sessions: [ses_released_222222222222]",
        "spec_hash: aaaaaaaaaaaa", // ≠ specHash(body): body was edited after demote
      ],
      "Edited spec.",
    )
    const fake = fakeClient()
    const app = createApp(config, mirror, fake.client)

    expect((await post(app, "/transitions/promote", { id: "WI-012" })).status).toBe(303)
    const item = listItems(ws)[0]!
    expect(fake.created).toHaveLength(1) // fresh session created
    expect(item.owner_session).toBe("ses_fake_001_0000000000")
    expect(item.released_sessions).toEqual(["ses_released_222222222222"]) // tombstone survives
  })

  test("unconfigured backend: reattach still works (client never touched)", async () => {
    writeItem("WI-013", [
      'title: "Reopen without backend"',
      "status: done",
      "owner_session: ses_frozen_owner_00000000",
      "group_id: ses_frozen_owner_00000000",
      "dream_id: DRM-001",
    ])
    const app = createApp(config, mirror, null)
    expect((await post(app, "/transitions/promote", { id: "WI-013" })).status).toBe(303)
    expect(listItems(ws)[0]!.status).toBe("in_progress")
  })
})

describe("button labeling from reattachInfo (decision visible BEFORE the click)", () => {
  test("labels per decision kind", async () => {
    writeItem("WI-020", ['title: "Never owned"', "status: todo"])
    writeItem(
      "WI-021",
      ['title: "Demoted unchanged"', "status: todo", "released_sessions: [ses_rel_a_00000000000000]", `spec_hash: ${specHash("Same.")}`],
      "Same.",
    )
    writeItem(
      "WI-022",
      ['title: "Demoted edited"', "status: backlog", "released_sessions: [ses_rel_b_00000000000000]", "spec_hash: bbbbbbbbbbbb"],
      "Different.",
    )
    writeItem("WI-023", [
      'title: "Done reopen"',
      "status: done",
      "owner_session: ses_done_owner_0000000000",
      "group_id: ses_done_owner_0000000000",
      "dream_id: DRM-002",
    ])
    const app = createApp(config, mirror, fakeClient().client)
    const html = await (await app(new Request("http://test/"))).text()

    expect(html).toContain(">Start</button>") // never-owned
    expect(html).toContain("Re-attach ses_rel_a_000000… (spec unchanged)")
    expect(html).toContain("Start fresh session (spec edited)")
    expect(html).toContain("Reopen — re-attach original session")
  })

  test("done-never-owned (Q16) → 'Reopen as fresh session' label, and promote WORKS", async () => {
    writeItem("WI-024", ['title: "Idea marked done"', "status: done", "done_without_dream: true"])
    const fake = fakeClient()
    const app = createApp(config, mirror, fake.client)

    const html = await (await app(new Request("http://test/"))).text()
    expect(html).toContain("Reopen as fresh session")

    // Q16: promote un-does (done→todo) then starts fresh — no circular refusal.
    const res = await post(app, "/transitions/promote", { id: "WI-024" })
    expect(res.status).toBe(303)
    const item = listItems(ws)[0]!
    expect(item.status).toBe("in_progress")
    expect(item.owner_session).toBe("ses_fake_001_0000000000")
    expect(item.done_without_dream).toBe(false) // badge cleared on the un-done
    expect(fake.created).toHaveLength(1)
  })

  test("unconfigured backend: session-creating buttons disabled, reattach buttons live", async () => {
    writeItem("WI-030", ['title: "Fresh needs backend"', "status: todo"])
    writeItem("WI-031", [
      'title: "Reattach fine"',
      "status: done",
      "owner_session: ses_ok_owner_000000000000",
      "group_id: ses_ok_owner_000000000000",
      "dream_id: DRM-003",
    ])
    const app = createApp(config, mirror, null)
    const html = await (await app(new Request("http://test/"))).text()
    expect(html).toContain("opencode server not configured")
    expect(html).not.toContain('action="/transitions/start"')
    expect(html).toContain("Reopen — re-attach original session")
  })
})

describe("CONFLICT is retryable, not a dead-end (Q16)", () => {
  test("transitionResponse renders a retry form for CONFLICT; dead-end 409 for others", async () => {
    const { transitionResponse } = await import("../src/web/transitions")
    const form = await new Request("http://test/x", {
      method: "POST",
      body: new URLSearchParams({ id: "WI-042" }),
    }).formData()

    const conflict = transitionResponse("promote", "/transitions/promote", form, {
      ok: false,
      reason: "CONFLICT",
      detail: "A concurrent writer changed WI-042 mid-promote; it is now in todo.",
    })
    expect(conflict.status).toBe(503)
    const html = await conflict.text()
    expect(html).toContain('action="/transitions/promote"')
    expect(html).toContain('name="id" value="WI-042"')
    expect(html).toContain(">Retry</button>")
    expect(html).toContain("Retry is safe")

    const refusal = transitionResponse("promote", "/transitions/promote", form, {
      ok: false,
      reason: "NOT_FOUND",
      detail: "No work item WI-042.",
    })
    expect(refusal.status).toBe(409)
    expect(await refusal.text()).not.toContain(">Retry</button>")
  })
})
