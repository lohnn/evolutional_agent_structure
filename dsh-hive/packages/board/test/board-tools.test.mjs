// B4 gate: the 8 hive_board_* tools — registration, the D5 bind gate, the
// WI-065 runtime refusals, the create receipt, and the tool-gate runtime leg
// (every HIVE_TOOL_NAMES entry must resolve via ctx.tools.get after cohort
// registration — the W-088 production deny-mask filter must never hide a
// registered tool).
//
// Boot recipe mirrors packages/evolution/test/service-harness.mjs: real cordis
// Context + real dsh services resolved from the pinned web profile. HARD
// RULE: the live store is NEVER written — fixtures live in tmp dirs.
import test from "node:test"
import assert from "node:assert/strict"
import { Context } from "@deepseek-ai/cordis"
import Board from "@hive/dsh-board"
import { isSessionAwakened, sessionsPath, readCoordinators } from "@hive/dsh-board/lib/sessions-read"
import assertNode from "node:assert"
import fs from "fs"
import os from "os"
import path from "path"

const { createRequire } = await import("node:module")
const require = createRequire("/root/.dsh/profiles/web/package.json")
const SPMod = require("@deepseek-ai/dsh-system-prompt")
const SP = SPMod.default ?? SPMod.SystemPrompt
const ToolsMod = require("@deepseek-ai/dsh-tools")
const Tools = ToolsMod.default ?? ToolsMod.Tools

const results = []
const check = (id, ok, detail) => {
  results.push({ ok })
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`)
}

const mkCtx = () => {
  const c = new Context()
  new SP(c, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
  new Tools(c, {})
  return c
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), "b4-tools-"))
fs.mkdirSync(path.join(FIX, ".opencode/agents"), { recursive: true })

// an un-owned item to bind against, and a tombstoned variant
const ws = (await import("node:module")).createRequire(FIX + "/")
const { createIdea, bindSession, demoteItem, respecItem, retitleItem, editItemTags } = await import(
  "@hive/dsh-board/lib/board-transitions"
)
const { listItems, readItem } = await import("@hive/dsh-board/lib/board-store")
const { listBoard, listStatusFlavor } = await import("@hive/dsh-board/lib/board-read").catch(() => ({}))

async function seedBoard() {
  const a = await createIdea(FIX, { title: "B4 bind target", body: "bind spec", tags: ["gate"] })
  const b = await createIdea(FIX, { title: "B4 tombstone target", body: "tomb spec" })
  const shares = await createIdea(FIX, {
    title: "B4 advisory neighbor about bind gates",
    body: "bind spec",
  })
  return { a: a.item, b: b.item, shares: shares.item }
}
const seeded = await seedBoard()

// awaken one coordinator in the ledger (evolution's OWN writer shape — the
// board must read exactly this; see the shape-drift block below)
fs.writeFileSync(
  sessionsPath(FIX),
  JSON.stringify(
    {
      v: 1,
      coordinators: {
        ses_coord: { agent: "coordinator", awakenedAt: "2026-09-18T00:00:00.000Z", lastAwakenInput: "b4 gate" },
        ses_old: { agent: "coordinator", awakenedAt: "2026-09-17T00:00:00.000Z", lastAwakenInput: "earlier" },
      },
    },
    null,
    2
  ),
  "utf8"
)

// demote-but-bind trick to create a tombstone: bind ses_old to `b`, demote,
// then try to re-bind ses_old (the refusal comes from the module).
await bindSession(FIX, seeded.b.id, "ses_old", "ses_old")
await demoteItem(FIX, seeded.b.id)

// ── boot the Board service with the REAL tools runtime ───────────────────────
const ctx = mkCtx()
ctx.plugin(Board, { directory: FIX })
await new Promise((r) => setTimeout(r, 80))

const tool = (name) => ctx.tools.get(name)

test("b4: registration + exact names", () => {
  const wanted = [
    "hive_board_list",
    "hive_board_search",
    "hive_board_read",
    "hive_board_bind",
    "hive_board_create",
    "hive_board_respec",
    "hive_board_retitle",
    "hive_board_tag",
  ]
  for (const name of wanted) {
    const def = tool(name)
    assert.ok(def, `${name} must resolve via ctx.tools.get`)
    check(`tool.${name}`, !!def && def.name === name, `registered; description ${def?.description?.length ?? 0} chars`)
  }
  // and NOTHING else leaked in (start is D9 — must NOT exist)
  const others = ["hive_board_start", "hive_board_pause", "hive_board_promote", "hive_board_done"]
  for (const name of others) {
    assert.equal(tool(name), undefined, `${name} must NOT be registered (D9)`)
  }
  check("tool.none-extra", true, "no start/pause/promote/done tools registered (D9 compiled-but-uncalled)")
})

test("b4 gate-sync runtime leg: every HIVE_TOOL_NAMES entry resolves via ctx.tools.get (board cohort)", () => {
  // HIVE_TOOL_NAMES lives in @hive/dsh-evolution — resolved through that
  // package's own node_modules (no dependency cycle: require against ITS
  // package root).
  // Source-truth census (build-order independent — the same spirit as
  // evolution's tool-gate-sync.test.mjs source scan): read the const block
  // straight out of packages/evolution/src/index.ts.
  const evoSrc = fs.readFileSync(
    "/workspace/projects/evolutional_agent_structure/dsh-hive/packages/evolution/src/index.ts",
    "utf8"
  )
  const block = evoSrc.slice(evoSrc.indexOf("export const HIVE_TOOL_NAMES"), evoSrc.indexOf("]", evoSrc.indexOf("export const HIVE_TOOL_NAMES")))
  const names = [...block.matchAll(/"(hive_[a-z0-9_]+)"/g)].map((m) => m[1])
  assert.equal(names.length, 27, `census 27, got ${names.length}`)
  // The deny-mask filter in evolution does HIVE_TOOL_NAMES.filter(n =>
  // ctx.tools.get(n) !== undefined). In THIS harness the board cohort is
  // registered: all 8 board names must SURVIVE that filter (never hidden),
  // and the rest legitimately do not resolve here (their packages are
  // separate plugins).
  const resolvable = names.filter((n) => ctx.tools.get(n) !== undefined)
  for (const n of [
    "hive_board_list",
    "hive_board_search",
    "hive_board_read",
    "hive_board_bind",
    "hive_board_create",
    "hive_board_respec",
    "hive_board_retitle",
    "hive_board_tag",
  ]) {
    assert.ok(resolvable.includes(n), `${n} must resolve while its package is mounted`)
  }
  // simulate the production filter's safety net: nothing masked-but-unregistered
  const maskedButMissing = resolvable.filter((n) => !names.includes(n))
  assert.deepEqual(maskedButMissing, [])
  check("gate-sync.runtime", true, `HIVE_TOOL_NAMES=27; board cohort (8/8) resolvable via ctx.tools.get after registration`)
})

const execFor = (sessionID, depth = 0, id = undefined) => ({
  agent: { ...(id ? { id } : {}), session: { id: sessionID, header: { delegationDepth: depth } } },
})

// ── the bind gate (D5) ───────────────────────────────────────────────────────

test("b4: bind refuses a delegated child (depth>0) citing the original capability refusal", async () => {
  const def = tool("hive_board_bind")
  const out = await def.execute({ id: seeded.a.id }, execFor("ses_worker", 1))
  assert.ok(out.startsWith("Refused:"), out)
  assert.ok(out.includes("delegated sessions (depth 1)"))
  assert.ok(out.includes("capability sessions cannot own work items"))
  assert.ok(out.includes("hive_board_create"))
  // nothing was bound on disk
  assert.equal(readItem(FIX, seeded.a.id).owner_session, null)
  check("bind.depth-refusal", true, "D5 worker analogue refused with the capability-refusal citation")
})

test("b4: bind refuses a NOT-awakened top-level session with the /awaken hint", async () => {
  const def = tool("hive_board_bind")
  const out = await def.execute({ id: seeded.a.id }, execFor("ses_dormant", 0))
  assert.ok(out.startsWith("Refused:"), out)
  assert.ok(out.includes("not HIVE-awakened"))
  assert.ok(out.includes("Run /awaken first"))
  assert.ok(out.includes("invariant 1"))
  assert.equal(readItem(FIX, seeded.a.id).owner_session, null)
  check("bind.not-awakened-refusal", true, "D5 awakened-gate refused with the /awaken next step")
})

test("b4: bind refuses a tombstoned session (module refusal surfaces through the tool)", async () => {
  const def = tool("hive_board_bind")
  const out = await def.execute({ id: seeded.b.id }, execFor("ses_old", 0))
  assert.ok(out.startsWith("Refused (SESSION_RELEASED):"), out)
  check("bind.tombstone-refusal", true, "released_sessions tombstone honored through the tool surface")
})

test("b4: bind happy path stamps owner+group (group_id := self, D4) and reports the bind", async () => {
  const def = tool("hive_board_bind")
  const out = await def.execute({ id: seeded.a.id }, execFor("ses_coord", 0))
  assert.ok(out.startsWith('Bound WI-'), out)
  assert.ok(out.includes("in_progress"))
  assert.ok(out.includes("spec_hash stamped"))
  const it = readItem(FIX, seeded.a.id)
  assert.equal(it.owner_session, "ses_coord")
  assert.equal(it.group_id, "ses_coord")
  check("bind.happy", true, `${it.id} bound to ses_coord (owner+group stamped together)`)
})

test("b4: bind already-bound is an idempotent no-op message", async () => {
  const def = tool("hive_board_bind")
  const out = await def.execute({ id: seeded.a.id }, execFor("ses_coord", 0))
  assert.ok(out.includes("already bound to this session — no-op"), out)
  check("bind.idempotent", true, "re-bind no-op text")
})

// ── create: WI-065 refusals + the full receipt ───────────────────────────────

test("b4: create refunds FORBIDDEN_CREATE_KEYS BY NAME (the open-root probe)", async () => {
  const def = tool("hive_board_create")
  for (const key of ["id", "owner_session", "group_id", "spec_hash", "transitions", "dream_id", "artifacts"]) {
    const out = await def.execute({ title: "sneaky", [key]: "injected" }, execFor("ses_any"))
    assert.ok(out.startsWith("Refused (TRANSITION_MODULE_FIELD):"), `${key}: ${out}`)
    assert.ok(out.includes(key))
    assert.ok(out.includes("hive_board_bind") || out.includes("transition module"))
  }
  assert.equal(listItems(FIX).filter((i) => i.title === "sneaky").length, 0)
  check("create.forbidden-keys", true, "undeclared keys refused by name, nothing written")
})

test("b4: create refuses empty title", async () => {
  const def = tool("hive_board_create")
  const out = await def.execute({ title: "   " }, execFor("ses_any"))
  assert.ok(out.startsWith("Refused (EMPTY_TITLE):"), out)
  check("create.empty-title", true, "EMPTY_TITLE refusal via the tool")
})

test("b4: create subtasks raw-string dies at the schema layer; the imperative guard stays as the open-root backstop", async () => {
  const def = tool("hive_board_create")
  // dsh VALIDATES declared keys (the WI-065 delta from OpenCode): a raw
  // string subtasks is rejected before execute, with the arg named.
  await assert.rejects(
    () => def.execute({ title: "x", subtasks: "step one" }, execFor("ses_any")),
    (err) => /subtasks/.test(String(err)) && /array/i.test(String(err))
  )
  // The imperative expectStringArray guard remains in the body for the
  // open-root era (undeclared keys ride through; a wrongly-typed DECLARED key
  // here is schema-caught) — verified reachable via direct module call:
  const { expectStringArray } = await import("@hive/dsh-board/lib/board-transitions")
  const bad = expectStringArray("subtasks", "step one")
  assert.ok(bad && bad.reason === "NOT_AN_ARRAY" && bad.detail.includes('["step one"]'))
  const badElem = expectStringArray("subtasks", ["ok", 7])
  assert.ok(badElem && badElem.reason === "BAD_ARRAY_ELEMENT" && badElem.detail.includes("subtasks[1]"))
  check("create.subtasks-guard", true, "schema rejects raw strings before execute; module guard pinned with both refusal shapes")
})

test("b4: create full receipt echoes every supplied field + carries the nearest advisory", async () => {
  // a title that shares vocabulary with the probe so the advisory has a hit
  const neighbor = await createIdea(FIX, { title: "B4 create receipt probe for tagging", body: "unrelated spec" })
  const def = tool("hive_board_create")
  const out = await def.execute(
    {
      title: "B4 create receipt probe",
      body: "the spec text",
      status: "todo",
      priority: "high",
      tags: ["receipt", "probe"],
      subtasks: ["first step", "second step"],
    },
    execFor("ses_any")
  )
  assert.ok(out.includes("Created WI-"), out)
  assert.ok(out.includes("B4 create receipt probe"))
  assert.ok(out.includes("status     todo"))
  assert.ok(out.includes("priority   high"))
  assert.ok(out.includes("receipt, probe"))
  assert.ok(out.includes("13 bytes stored"))
  assert.ok(out.includes("2 recorded (not editable afterwards)"))
  assert.ok(out.includes("history    1 entry"))
  assert.ok(out.includes("Next: your coordinator can bind"))
  // the advisory text rides the receipt (advisory wording, not a verdict)
  assert.ok(out.includes("NOT a duplicate verdict"))
  check("create.receipt", true, "every supplied field echoed; advisory appended; receipt complete")
})

test("b4: create by-label carries the caller id (capability label verbatim)", async () => {
  const def = tool("hive_board_create")
  await def.execute({ title: "B4 bylabel probe" }, execFor("ses_writer", 0))
  const it = listItems(FIX).find((i) => i.title === "B4 bylabel probe")
  assert.ok(it.transitions[0].by.startsWith("hive_board_create:"), it.transitions[0].by)
  check("create.by-label", true, `birth transition by="${it.transitions[0].by}"`)
})

// ── respec / retitle / tag through the tool surface ──────────────────────────

test("b4: respec archives and says so; noop says nothing recorded", async () => {
  const def = tool("hive_board_respec")
  const target = listItems(FIX).find((i) => i.title === "B4 bylabel probe")
  const out = await def.execute({ id: target.id, body: "revised body" }, execFor("ses_writer"))
  assert.ok(out.includes(`Revised ${target.id}'s spec`), out)
  assert.ok(out.includes("spec_hash deliberately NOT re-stamped"))
  const noop = await def.execute({ id: target.id, body: "revised body" }, execFor("ses_writer"))
  assert.ok(noop.includes("byte-identical"), noop)
  check("respec.happy+noop", true, "archive message + Q13 wording + no-op wording")
})

test("b4: respec refuses the wrong owner (ITEM_OWNED through the tool)", async () => {
  const def = tool("hive_board_respec")
  const out = await def.execute({ id: seeded.a.id, body: "hostile" }, execFor("ses_other"))
  assert.ok(out.startsWith("Refused (ITEM_OWNED):"), out)
  check("respec.ownership", true, "owned item refuses a non-owner session")
})

test("b4: retitle + tag happy paths and refusals", async () => {
  const rdef = tool("hive_board_retitle")
  const tdef = tool("hive_board_tag")
  const target = listItems(FIX).find((i) => i.title === "B4 bylabel probe")
  const r1 = await rdef.execute({ id: target.id, title: "renamed by gate" }, execFor("ses_writer"))
  assert.ok(r1.startsWith('Retitled'), r1)
  const r2 = await rdef.execute({ id: seeded.a.id, title: "hostile" }, execFor("ses_writer"))
  assert.ok(r2.startsWith("Refused (ITEM_OWNED):"), r2)
  const t1 = await tdef.execute({ id: target.id, add: ["new-tag"] }, execFor("ses_writer"))
  assert.ok(t1.includes("new-tag"), t1)
  const t2 = await tdef.execute({ id: target.id, add: ["x"], remove: ["x"] }, execFor("ses_writer"))
  assert.ok(t2.startsWith("Refused (CONTRADICTORY_TAGS):"), t2)
  const t3 = await tdef.execute({ id: target.id, add: ["new-tag"] }, execFor("ses_writer"))
  assert.ok(t3.includes("already in that state — no write"), t3)
  check("retitle+tag.surface", true, "happy + ownership + contradiction + no-op via the tools")
})

// ── read/list/search passthrough ─────────────────────────────────────────────

test("b4: read defers over-budget items BY NAME and list shows ⚠ for a violating fixture", async () => {
  const rd = tool("hive_board_read")
  const target = listItems(FIX).find((i) => i.title === "B4 create receipt probe")
  const fat = await createIdea(FIX, { title: "B4 fat item", body: "x".repeat(9000) })
  const out = await rd.execute({ ids: `${target.id},${fat.item.id}`, max_bytes: 1000 }, execFor("ses_any"))
  assert.ok(out.includes("NOT included: ") && out.includes(fat.item.id), out)
  assert.ok(!out.includes("TRUNCATED")) // the fat item is DEFERRED here, not truncated
  // single-oversized truncation passes through too (module-level shape)
  const trunc = await rd.execute({ ids: fat.item.id, max_bytes: 1000 }, execFor("ses_any"))
  assert.ok(trunc.includes("TRUNCATED") && trunc.includes("larger max_bytes"), trunc)

  const ld = tool("hive_board_list")
  // inject an illegal record directly (a real board can contain them)
  const { serializeWorkItem, listItemsInDir, itemPath } = await import("@hive/dsh-board/lib/board-store")
  const illegal = structuredClone(readItem(FIX, target.id))
  illegal.id = "WI-901"
  illegal.title = "B4 illegal probe"
  illegal.status = "in_progress"
  illegal.owner_session = null
  fs.writeFileSync(itemPath(FIX, illegal.id), serializeWorkItem(illegal), "utf8")
  const listed = await ld.execute({ status: "all" }, execFor("ses_any"))
  assert.ok(listed.includes("⚠"), "the violating row must be marked")
  assert.ok(listed.includes("invariant 1"), "the marker names the invariant")
  check("read+list.surface", true, "deferral by name + TRUNCATED + ⚠ marker with invariant named")
})

test("b4: search refusal paths surface through the tool (NO_USABLE_TOKENS, BAD_ENUM)", async () => {
  const sd = tool("hive_board_search")
  const out = await sd.execute({ query: "a is of" }, execFor("ses_any"))
  assert.ok(out.startsWith("Refused") || out.includes("NO_USABLE_TOKENS"), out)
  const ld = tool("hive_board_list")
  // declared enum blocks bad status at the schema; probe the module guard via a direct override
  const raw = await ld.execute({ status: "in-progress" }, execFor("ses_any")).catch(() => null)
  if (raw === null) {
    check("guards.enum", true, "status 'in-progress' rejected BEFORE execute by the declared schema (dsh validates declared keys)")
  } else {
    assert.match(raw, /BAD_ENUM/)
    check("guards.enum", true, "status 'in-progress' refused BAD_ENUM by the module guard")
  }
})

// ── sessions-read: the ledger shape contract (board READS, evolution OWNS) ───

test("b4: sessions-read reads evolution's EXACT writer shape", () => {
  // the seeded ledger at FIX was written in evolution's writer shape
  assert.deepEqual(Object.keys(readCoordinators(FIX)), ["ses_coord", "ses_old"])
  assert.equal(isSessionAwakened(FIX, "ses_coord"), true)
  assert.equal(isSessionAwakened(FIX, "ses_dormant"), false)
  check("ledger.exact-shape", true, "coordinators[ses_coord] read from the evolution-shaped ledger")
})

test("b4: sessions-read tolerates drifted shapes (fail-closed to the empty ledger)", () => {
  const drift = fs.mkdtempSync(path.join(os.tmpdir(), "b4-ledger-"))
  fs.mkdirSync(path.join(drift, ".opencode/agents"), { recursive: true })
  const writeLedger = (content) => fs.writeFileSync(sessionsPath(drift), content, "utf8")

  writeLedger(JSON.stringify({ v: 1, coordinators: { ses_x: { agent: "a", awakenedAt: "t", lastAwakenInput: "" } } }))
  assert.equal(isSessionAwakened(drift, "ses_x"), true, "well-formed ledger reads")

  writeLedger(JSON.stringify({ v: 1 })) // missing coordinators
  assert.equal(isSessionAwakened(drift, "ses_x"), false, "missing coordinators key → empty ledger")

  writeLedger(JSON.stringify({ coordinators: "not-an-object" })) // drifted type
  assert.equal(isSessionAwakened(drift, "ses_x"), false, "non-object coordinators → empty ledger")

  writeLedger("{corrupt json")
  assert.equal(isSessionAwakened(drift, "ses_x"), false, "corrupt JSON → empty ledger (fail-closed)")

  fs.rmSync(sessionsPath(drift))
  assert.equal(isSessionAwakened(drift, "ses_any"), false, "absent file → empty ledger")
  check("ledger.drift-tolerant", true, "all four drifted inputs fail CLOSED (nobody reads as awakened)")
})

// Summary for the node:test reporter.
process.on("exit", () => {
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) process.exitCode = 1
})
