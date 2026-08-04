/**
 * WI-068 — the TOOL layer over lib/board-read.ts.
 *
 * board-read.test.ts proves the logic. This file proves the two things that
 * live only in src/tools.ts and are invisible from there:
 *
 *   1. WIRING. That each tool actually passes the caller's args through to the
 *      module and returns its text — including the args the declared schema
 *      does NOT type (`tool.schema` validates nothing at runtime, so an
 *      undeclared or ill-typed value really does arrive at execute()). A tool
 *      that quietly drops `status` would pass every module test.
 *   2. THE DESCRIPTION CONTRACT. `hive_board_create`'s description MUST point
 *      at `hive_board_search`. That pointer is the entire duplicate safeguard:
 *      create's premise is "you never need to open an existing item", and
 *      opening existing items WAS the check. The nearest-items advisory on the
 *      receipt fires only after the item is already on a board with no delete
 *      path. Drop the sentence and the safeguard is inert — so it is asserted,
 *      not trusted to survive the next description edit.
 *
 * What CANNOT be tested here, at all, and must not be faked: whether a model
 * READS these descriptions correctly. Tool descriptions freeze at process load
 * and the restart that makes them live kills the session that would check them
 * (W-127). That verification is a cold-agent run, not an assertion.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { createHiveTools } from "../src/tools.ts"
import { createIdea } from "../src/lib/board-transitions.ts"

/**
 * The read tools take `directory` and touch nothing else — no session, no
 * client, no nervous system. Stubs are honest here precisely because these
 * three tools deliberately hold no identity-dependent behaviour.
 */
function tools(directory: string) {
  return createHiveTools(
    {} as never,
    {} as never,
    () => {},
    directory
  )
}

const ctx = {} as never

let dir: string
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-read-tools-"))
  await createIdea(dir, {
    title: "Add push opt-out toggle",
    body: "Users need a way to disable push notifications.",
    status: "backlog",
    priority: "high",
    tags: ["proposal"],
  })
  await createIdea(dir, {
    title: "Reverse-engineer the proposal JSON endpoint",
    body: "The source site exposes GetProposals.",
    status: "todo",
  })
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe("hive_board_list — wiring", () => {
  test("reads the real board off disk through the shared store", async () => {
    const out = await tools(dir).hive_board_list.execute({} as never, ctx)
    expect(out).toContain("WI-001")
    expect(out).toContain("WI-002")
    expect(out).toContain("Add push opt-out toggle")
  })

  test("filters reach the module (a dropped arg would be invisible in module tests)", async () => {
    const out = await tools(dir).hive_board_list.execute({ status: "todo" } as never, ctx)
    expect(out).toContain("WI-002")
    expect(out).not.toContain("WI-001")
  })

  test("an out-of-enum value REACHES execute() and is refused there, not by the schema", async () => {
    const out = await tools(dir).hive_board_list.execute({ status: "nonsense" } as never, ctx)
    expect(out).toContain("BAD_ENUM")
  })

  test("limit passes through and is validated at runtime", async () => {
    expect(await tools(dir).hive_board_list.execute({ limit: 1 } as never, ctx)).toContain("1 more matched")
    expect(await tools(dir).hive_board_list.execute({ limit: -3 } as never, ctx)).toContain("Refused")
  })

  test("bodies never appear in the index", async () => {
    const out = await tools(dir).hive_board_list.execute({ status: "all" } as never, ctx)
    expect(out).not.toContain("disable push notifications")
  })
})

describe("hive_board_search — wiring", () => {
  test("query and k reach the module", async () => {
    const out = await tools(dir).hive_board_search.execute({ query: "push notifications" } as never, ctx)
    expect(out).toContain("WI-001")
    // execute() is TYPED as returning ToolResult; these tools return the plain
    // string opencode renders. Cast at the one place that needs string methods.
    const capped = (await tools(dir).hive_board_search.execute(
      { query: "proposal push endpoint", k: 1 } as never,
      ctx
    )) as unknown as string
    expect(capped.split("\n").filter((l) => /^ {2}\d\.\d{3}/.test(l))).toHaveLength(1)
  })

  test("a missing query is refused at runtime rather than throwing", async () => {
    const out = await tools(dir).hive_board_search.execute({} as never, ctx)
    expect(out).toContain("Refused")
  })
})

describe("hive_board_read — wiring", () => {
  test("returns the full spec body for named ids", async () => {
    const out = await tools(dir).hive_board_read.execute({ ids: "WI-001" } as never, ctx)
    expect(out).toContain("Users need a way to disable push notifications.")
  })

  test("unknown ids come back by name", async () => {
    const out = await tools(dir).hive_board_read.execute({ ids: "WI-001,WI-404" } as never, ctx)
    expect(out).toContain("WI-404")
    expect(out).toContain("Not found")
  })

  test("max_bytes passes through and bounds the payload", async () => {
    const out = await tools(dir).hive_board_read.execute(
      { ids: "WI-001", max_bytes: 500 } as never,
      ctx
    )
    expect(out).toContain("of 500 budgeted bytes")
    // Below the floor it is refused at runtime, not clamped silently.
    expect(
      await tools(dir).hive_board_read.execute({ ids: "WI-001", max_bytes: 10 } as never, ctx)
    ).toContain("OUT_OF_RANGE")
  })
})

describe("hive_board_create — the advisory and the pointer", () => {
  test("the receipt ALWAYS shows nearest items, with no threshold and no warning glyph", async () => {
    const t = createHiveTools(
      { resolveAgent: () => "test" } as never,
      {} as never,
      () => {},
      dir
    )
    const out = await t.hive_board_create.execute(
      { title: "Add a push opt-out setting" } as never,
      { sessionID: "ses_test", agent: "test" } as never
    )
    expect(out).toContain("Created WI-003")
    expect(out).toContain("NOT a duplicate verdict")
    expect(out).toContain("WI-001") // the near-identical existing item, surfaced
    expect(out).not.toContain("Possible duplicate") // the removed verdict phrasing
  })

  test("the description points at hive_board_search — the safeguard is inert without it", () => {
    const d = tools(dir).hive_board_create.description
    expect(d).toContain("hive_board_search")
    expect(d).toMatch(/BEFORE you file/)
  })

  test("the three read tools describe their own bound, so cost is predictable before calling", () => {
    const t = tools(dir)
    expect(t.hive_board_list.description).toContain("NEVER returns spec bodies")
    expect(t.hive_board_list.description).toContain('status="all"')
    expect(t.hive_board_search.description).toContain("It ranks, it does not judge")
    expect(t.hive_board_read.description).toContain("NOT a cross-item snapshot")
  })
})
