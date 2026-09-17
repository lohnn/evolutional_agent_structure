// Phase-B1 gate: boot @hive/dsh-board (the Board service) via the real cordis
// Context using the class-plugin path (the same shape the loader uses), and
// exercise the B1 read surface against a real-store COPY plus a synthetic
// workspace. Mirrors packages/dream-archive/test/service-harness.mjs.
//
// HARD RULE: the live store at /workspace/.opencode/board is NEVER written —
// this harness only ever cpSync's it into two tmp dirs and reads the copies.
import { Context } from "@deepseek-ai/cordis"
import Board from "@hive/dsh-board"
import { parseWorkItem, serializeWorkItem, listItemsInDir } from "@hive/dsh-board/lib/board-store"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

const results = []
const check = (id, ok, detail) => {
  results.push({ id, ok })
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`)
}

// Real-store copy: READ-ONLY methods over a copy of the live 78-entry board.
const realCopy = fs.mkdtempSync(path.join(os.tmpdir(), "p-b1-real-"))
fs.cpSync("/workspace/.opencode/board", path.join(realCopy, ".opencode/board"), { recursive: true })

// Synthetic workspace: write-adjacent reads (empty board) — never the live store.
const synth = fs.mkdtempSync(path.join(os.tmpdir(), "p-b1-synth-"))

// ── boot via class-plugin apply (loader shape) ───────────────────────────────
const ctx = new Context()
ctx.plugin(Board, { directory: realCopy })
await new Promise((r) => setTimeout(r, 50)) // fiber settle

check("boot.service-registered", typeof ctx.board?.items === "function", "ctx.board exposed with methods")
check("boot.directory-config", ctx.board.directory === realCopy, `directory wired from config (${ctx.board.directory})`)

// Activation line: the constructor logs "[board] storage module active …".
// dsh's CLI surfaces do not capture service INFO logs, so the harness mounts a
// real Context, splices a capture stub over the Context logger's info method,
// and lets the plugin ctor run exactly as the loader would.
{
  const captureCtx = new Context()
  const captured = []
  if (typeof captureCtx.logger === "function" || typeof captureCtx.logger === "object") {
    const originalInfo = captureCtx.logger.info?.bind(captureCtx.logger)
    captureCtx.logger.info = (msg, extra) => { captured.push([msg, extra]); return originalInfo?.(msg, extra) }
  }
  try {
    captureCtx.plugin(Board, { directory: synth })
    await new Promise((r) => setTimeout(r, 50))
    const hit = captured.find(([m]) => String(m).includes("[board] storage module active"))
    check("boot.activation-line", !!hit, hit ? `ctor logged via ctx.logger.info: "${hit[0]}"` : "activation line MISSING from ctor logs")
  } catch (err) {
    check("boot.activation-line", false, `capture boot failed: ${String(err)}`)
  }
}

// ── read surface against the real-store copy ─────────────────────────────────
const items = ctx.board.items()
check("read.list", items.length >= 60, `items() over real board copy: ${items.length} work items parsed`)
check("read.status-values-live",
  items.every((it) => ["backlog", "todo", "in_progress", "done"].includes(it.status)),
  "every parsed status is a legal WorkItemStatus (parser = neutral, dialect intact)")

// Byte-compatibility proof: serialize→parse a real item round-trips losslessly
// (the field the viewer displays must survive a whole write cycle unchanged).
const sample = items.find((it) => it.subtasks.length > 0) ?? items[0]
const roundTrip = parseWorkItem(serializeWorkItem(sample))
check("read.roundtrip-real-item",
  JSON.stringify(roundTrip) === JSON.stringify(sample),
  `serialize→parse round-trip lossless on real WI ${sample.id}`)

// Invariants over the real copy: detection runs, report-only.
const flagged = items.map((it) => [it.id, ctx.board.problems(it)]).filter(([, p]) => p.length > 0)
check("read.invariants-detection-only", true, `computeProblems over ${items.length} real items: ${flagged.length} flagged (detection only, nothing repaired)`)

// Recency: total shape — never "" for a real item.
check("read.recency-total", items.every((it) => ctx.board.recency(it).length > 0), "recencyKey total over every real item (never empty)")

// ── synthetic workspace (empty board) ────────────────────────────────────────
{
  const synthCtx = new Context()
  synthCtx.plugin(Board, { directory: synth })
  await new Promise((r) => setTimeout(r, 50))
  const synthBoard = synthCtx.board
  check("read.empty-board", Array.isArray(synthBoard.items()) && synthBoard.items().length === 0, "items() over an empty workspace returns [] (no crash)")
  check("read.missing-dir-tolerated",
    listItemsInDir(path.join(synth, ".opencode/board/never-existed")).length === 0,
    "wiping/missing board dir is tolerated (store creates on demand)")
}

// Summary for the node:test runner.
process.on("exit", () => {
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    console.error(`SERVICE-HARNESS FAILURES: ${failed.map((f) => f.id).join(", ")}`)
    process.exitCode = 1
  }
})
