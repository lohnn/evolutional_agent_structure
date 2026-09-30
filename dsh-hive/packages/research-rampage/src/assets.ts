/**
 * Asset loading for dsh-research-rampage.
 *
 * The brief is read PER INVOCATION, not at module load: this package is a
 * link:-installed workspace plugin whose working tree is live-serve material
 * (the workspace AGENTS.md rule), and a module-load-time read would freeze the
 * protocol text into the host process until restart. A ~11 KB readFileSync per
 * rampage launch is nothing; a stale kit is a real failure mode.
 */
import fs from "fs"

/** The full research-rampage protocol the coordinator receives as a user-role followup. */
export function loadRampageBrief(): string {
  return fs.readFileSync(new URL("../assets/brief.md", import.meta.url), "utf8").trimEnd()
}
