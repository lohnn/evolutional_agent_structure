// TOKEN-ECONOMY D10 — the usage-ledger skeleton:
// 1. append/read roundtrip + ts stamping; a corrupt line is skipped, not fatal.
// 2. fire-and-forget: a bad directory must never throw (telemetry never
//    blocks a dispatch).
// 3. Documented residual (docs/TOKEN-ECONOMY.md step 13): residents log their
//    START only; one-shot consults log call + settle. Pinned here so the gap
//    is a decision, not an oversight.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { UsageLog } from "@hive/dsh-evolution"

test("usage log: append/read roundtrip with ts stamping; corrupt lines skipped", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-log-"))
  const log = new UsageLog(dir)
  assert.equal(log.file, path.join(dir, ".opencode", "hive-usage.jsonl"))
  assert.deepEqual(log.read(), [], "fresh log reads empty")
  log.append({ kind: "dispatch", shape: "resident", address: "capability/x" })
  log.append({ kind: "settle", shape: "one-shot", address: "builtin/dreamcatcher", ms: 4210, outcome: "completed" })
  const rows = log.read()
  assert.equal(rows.length, 2)
  assert.equal(rows[0].kind, "dispatch")
  assert.equal(rows[1].outcome, "completed")
  assert.ok(typeof rows[0].ts === "string" && !Number.isNaN(Date.parse(String(rows[0].ts))), "every line carries a parseable ts")
  // corrupt line is skipped on read, and append still works after it
  fs.appendFileSync(log.file, "{not json\n")
  log.append({ kind: "dispatch", shape: "resident", address: "capability/y" })
  assert.equal(log.read().length, 3)
})

test("usage log: fire-and-forget — telemetry never throws", () => {
  // a path whose PARENT is a file: mkdirSync below must fail and be swallowed
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-log-"))
  fs.writeFileSync(path.join(dir, "blocker"), "x")
  const log = new UsageLog(path.join(dir, "blocker", "nested"))
  assert.doesNotThrow(() => log.append({ kind: "dispatch" }), "a failing append must never throw")
  assert.deepEqual(log.read(), [])
})
