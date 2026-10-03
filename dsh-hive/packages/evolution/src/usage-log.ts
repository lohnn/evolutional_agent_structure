import fs from "fs"
import path from "path"

/**
 * TOKEN-ECONOMY D10 — the usage-ledger skeleton. One append-only JSONL file
 * per workflow root (`.opencode/hive-usage.jsonl`); one line per dispatch
 * call, plus one settle line for one-shot consults (their cost arrives when
 * the tool call ends — the plugin can see it). Resident settles are NOT yet
 * observable from plugin code (the subagent run events are host-side); until
 * a settle hook exists, residents log their START only and cost analysis is
 * call-side. That gap is the skeleton's named residual, recorded in
 * docs/TOKEN-ECONOMY.md (step 13).
 *
 * Fire-and-forget: every failure is swallowed — the ledger must never break
 * a dispatch, a settle, or an agent turn. Reads are best-effort (an unparsable
 * line is skipped, not fatal).
 */
export class UsageLog {
  constructor(readonly directory: string) {}

  get file(): string {
    return path.join(this.directory, ".opencode", "hive-usage.jsonl")
  }

  append(record: Record<string, unknown>): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const line = JSON.stringify({ ts: new Date().toISOString(), ...record })
      fs.appendFileSync(this.file, `${line}\n`)
    } catch {
      // fire-and-forget: a lost telemetry line never blocks dispatch
    }
  }

  read(): Record<string, unknown>[] {
    try {
      return fs
        .readFileSync(this.file, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .flatMap((l) => {
          try {
            return [JSON.parse(l) as Record<string, unknown>]
          } catch {
            return []
          }
        })
    } catch {
      return []
    }
  }
}
