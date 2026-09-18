// B6: the dream-complete → board-done seam (plan §B6).
// Real cordis context, real dsh services from the pinned web profile, the REAL
// DreamArchive + Board services, and the REAL tools package apply() — the only
// fixtures on top are the board items and, for the refusal case, an archive
// stub that completes a dream WITHOUT writing its history file (the
// belt-and-braces refusal: the DRM cannot be confirmed COMPLETE).
import { Context } from "@deepseek-ai/cordis"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const { createRequire } = await import("node:module")
const require = createRequire("/root/.dsh/profiles/web/package.json")

const SPMod = require("@deepseek-ai/dsh-system-prompt")
const SP = SPMod.default ?? SPMod.SystemPrompt
const ToolsMod = require("@deepseek-ai/dsh-tools")
const Tools = ToolsMod.default ?? ToolsMod.Tools
const DreamArchiveSrv = (await import("@hive/dsh-dream-archive")).default
const BoardSrv = (await import("@hive/dsh-board")).default

const WS = fs.mkdtempSync(path.join(os.tmpdir(), "b6-seam-"))
fs.mkdirSync(path.join(WS, ".opencode/agents"), { recursive: true })
fs.mkdirSync(path.join(WS, ".opencode/dreams/active"), { recursive: true })
fs.mkdirSync(path.join(WS, ".opencode/dreams/history"), { recursive: true })
fs.mkdirSync(path.join(WS, ".opencode/board"), { recursive: true })
for (const t of ["insights", "warnings", "songlines", "shadows"]) fs.mkdirSync(path.join(WS, ".opencode/dreams/artifacts", t), { recursive: true })

const ctx = new Context()
new SP(ctx, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
new Tools(ctx, {})
new DreamArchiveSrv(ctx, { directory: WS })
new BoardSrv(ctx, { directory: WS })
await new Promise((r) => setTimeout(r, 80))

// the tools plugin — the same apply() the loader runs
const toolsMod = await import("@hive/dsh-tools")
const apply = toolsMod.default
apply(ctx)
await new Promise((r) => setTimeout(r, 80))

const complete = ctx.tools.get("hive_dream_complete")
assert.ok(complete, "hive_dream_complete registered")

const results = []
const check = (id, ok, detail) => {
  results.push({ ok })
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`)
}

const board = await import("@hive/dsh-board/lib/board-store")
const transitions = await import("@hive/dsh-board/lib/board-transitions")
const { readItem } = board

const execFor = (sid) => ({ agent: { id: sid, session: { id: sid, header: {} } } })

// an owned in-progress item for a session
const ownItem = async (sid, title) => {
  const created = await transitions.createIdea(WS, { title, status: "todo", priority: "medium", body: `${title} body` })
  if (!created.ok || !created.item) throw new Error(`createIdea refused: ${JSON.stringify(created).slice(0, 200)}`)
  // startItem with a fixture session client — the client hands back OUR
  // session id, so ownership lands on `sid` exactly as a real start would.
  const started = await transitions.startItem(WS, created.item.id, {
    createSession: async () => sid,
    updateSessionTitle: async () => {},
    command: async () => {},
  }, { by: "b6-fixture" })
  if (!started.ok) throw new Error(`startItem refused: ${JSON.stringify(started).slice(0, 160)}`)
  return started.item
}

// ── 1) unflagged COMPLETE dream → item done ──────────────────────────────────
{
  const item = await ownItem("ses_a", "B6 seam: real close")
  const itemBefore = readItem(WS, item.id)
  assert.equal(itemBefore.status, "in_progress")

  const beginDef = ctx.tools.get("hive_dream_begin")
  const beginOut = await beginDef.execute(
    { intention: "close the work", intention_type: "CONSOLIDATION", depth: "1", project_context: WS }, execFor("ses_a"))
  assert.match(String(beginOut), /^Dream DRM-\d+ opened/)
  const drm = String(beginOut).match(/DRM-\d+/)[0]

  // create ONE real artifact → the DRM file carries it; handler args then
  // mention it too. The mirror must come from the FILE (authoritative).
  const createDef = ctx.tools.get("hive_dream_artifact_create")
  const artOut = await createDef.execute(
    { type: "insight", source_dream: drm, content: "seam insight", confidence: 0.9, domain_tags: "seam", actionable: true, previously_invisible_because: "was opaque" },
    execFor("ses_a"))
  const artId = String(artOut).match(/(I-\d+)/)?.[1]
  assert.ok(artId, `artifact created (${String(artOut).slice(0, 80)})`)

  const out = await complete.execute({ artifact_ids: artId }, execFor("ses_a"))
  check("seam.done-line", String(out).includes(`Board: ${item.id} → done (${drm}, 1 artifact(s) mirrored).`), `done line: ${String(out).split("\n").find((l) => l.includes("Board:"))}`)
  const after = readItem(WS, item.id)
  check("seam.done-status", after.status === "done" && after.dream_id === drm, `status=${after.status} dream_id=${after.dream_id}`)

  // the AUTHORITY assert: the board's artifacts equal the DRM file's buckets
  // (parsed from disk), not "whatever the handler received".
  const historyFile = path.join(WS, ".opencode/dreams/history", `${drm}.yaml`)
  const drmText = fs.readFileSync(historyFile, "utf8")
  const fileInsights = [...drmText.matchAll(/^\s*insights:\s*\n?\s*[-:]\s*\[?\s*(I-\d+)/gm)].map((m) => m[1])
  if (fileInsights.length === 0) {
    // single-line form: insights: [I-501]
    const m = drmText.match(/insights:\s*\n(?:\s*-\s*(I-\d+)\s*\n)+|insights:\s*\[(I-\d+)\]/)
    const inline = drmText.match(/insights:\s*\[(.*?)\]/)
    if (inline) fileInsights.push(...inline[1].split(",").map((s) => s.trim()).filter(Boolean))
  }
  check("seam.mirrors-file", after.artifacts.includes(artId) && fileInsights.includes(artId), `board artifacts=${JSON.stringify(after.artifacts)} drm-file insights=${JSON.stringify(fileInsights)}`)
  const last = after.transitions[after.transitions.length - 1]
  check("seam.transition-by", last?.by === `board:dream-complete:${drm}`, `last transition by=${last?.by}`)

  //梦境 complete call is idempotent at the board: re-fire → already-done, text keeps success
  const out2 = await transitions.markItemDoneFromDream(WS, "ses_a", drm)
  check("seam.already-done", out2.ok && out2.action === "already-done", `re-fire: ${out2.action}`)
}

// ── 2) pre-compaction dream → stays in_progress, zero new transitions ────────
{
  const item = await ownItem("ses_b", "B6 seam: pre-compaction")
  const nBefore = readItem(WS, item.id).transitions.length

  await ctx.tools.get("hive_dream_begin").execute(
    { intention: "mid-session consolidation", intention_type: "CONSOLIDATION", depth: "1", project_context: WS, pre_compaction: true },
    execFor("ses_b"))
  const out = await complete.execute({ artifact_ids: "" }, execFor("ses_b"))
  check("seam.pre-compaction-line", String(out).includes(`Board: ${item.id} stays in_progress (pre-compaction dream`), `skip line: ${String(out).split("\n").find((l) => l.includes("Board:"))}`)
  const after = readItem(WS, item.id)
  check("seam.pre-compaction-stays", after.status === "in_progress", `status=${after.status}`)
  check("seam.no-new-transition", after.transitions.length === nBefore, `transitions ${nBefore} → ${after.transitions.length} (W-126: readers see nothing)`)
}

// ── 3) no owned item → completion text unchanged (no Board lines) ────────────
{
  await ctx.tools.get("hive_dream_begin").execute(
    { intention: "unowned consolidation", intention_type: "CONSOLIDATION", depth: "1", project_context: WS },
    execFor("ses_nobody"))
  const out = await complete.execute({ artifact_ids: "" }, execFor("ses_nobody"))
  check("seam.no-owner-unchanged", !String(out).includes("Board:") && String(out).startsWith("Dream DRM-"), `text unchanged: ${String(out).split("\n")[0]}`)
  check("seam.no-owner-warns-quiet", !String(out).includes("refused") && !String(out).includes("failed"), "noop lands in NO branch of the promo (silent, like the original)")
}

// ── 4) DRM not confirmably COMPLETE → dream still succeeds, nothing written ──
{
  // stub archive in its OWN context (the real service already holds the root
  // key): completes the dream bookkeeping WITHOUT writing the history file →
  // the board-side belt-and-braces can NOT confirm COMPLETE.
  const ctx2 = new Context()
  new SP(ctx2, { includeHarnessIdentity: true, includeRuntimeContext: false, persona: "gate" })
  new Tools(ctx2, {})
  ctx2.provide("dreamArchive", {
    directory: WS,
    listActiveDreams: () => ["DRM-990"],
    complete: (_exitTime, artifactIds) => ({
      dreamId: "DRM-990",
      historyPath: path.join(WS, ".opencode/dreams/history/DRM-990.yaml"),
      linkedArtifacts: { insights: artifactIds, warnings: [], songlines: [], shadows: [] },
      missingArtifacts: [],
    }),
  })
  new BoardSrv(ctx2, { directory: WS })
  await new Promise((r) => setTimeout(r, 40))
  apply(ctx2)
  await new Promise((r) => setTimeout(r, 40))
  const complete2 = ctx2.tools.get("hive_dream_complete")

  const item = await ownItem("ses_c", "B6 seam: incomplete DRM")
  const out = await complete2.execute({ artifact_ids: "" }, execFor("ses_c"))
  check("seam.dream-still-succeeds", String(out).startsWith("Dream DRM-990 completed."), `first line: ${String(out).split("\n")[0]}`)
  check("seam.no-done-written", !String(out).includes("Board: ") || String(out).includes("stays"), "no done claimed in the text")
  const after = readItem(WS, item.id)
  const lastBy = after.transitions[after.transitions.length - 1]?.by
  check("seam.incomplete-no-transition", after.status === "in_progress" && !String(lastBy ?? "").startsWith("board:dream-complete"), `status=${after.status}, last by=${lastBy}`)
}

fs.rmSync(WS, { recursive: true, force: true })
const failed = results.filter((r) => !r.ok)
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`)
process.exit(failed.length ? 1 : 0)
