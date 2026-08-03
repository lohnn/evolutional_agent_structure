/**
 * HIVEmind message flow — read from `<opencode>/hivemind/inbox/<recipient>/msg_….json`.
 * Filtered to status ∈ {pending, delivered} (DESIGN §6: read/processed
 * messages are history, not live flow).
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { shortCapabilityName } from "./capabilities"

export type MessageStatus = "pending" | "delivered"

export interface HivemindMessage {
  id: string
  sender: string
  recipient: string
  type: string
  content: string
  status: MessageStatus
  timestamp: string
  groupId?: string
}

const LIVE_STATUSES = new Set<string>(["pending", "delivered"])

export function loadLiveMessages(opencodeDir: string): HivemindMessage[] {
  const inbox = path.join(opencodeDir, "hivemind", "inbox")
  let recipients: string[]
  try {
    recipients = fs.readdirSync(inbox)
  } catch {
    return []
  }

  const messages: HivemindMessage[] = []
  for (const recipientDir of recipients) {
    const dir = path.join(inbox, recipientDir)
    let files: string[]
    try {
      if (!fs.statSync(dir).isDirectory()) continue
      files = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.startsWith("msg_") || !file.endsWith(".json")) continue
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
        if (typeof raw !== "object" || raw === null) continue
        if (!LIVE_STATUSES.has(String(raw.status))) continue
        messages.push({
          id: String(raw.id ?? file),
          sender: shortCapabilityName(String(raw.sender ?? "?")),
          recipient: recipientDir.startsWith("_")
            ? recipientDir
            : shortCapabilityName(String(raw.recipient ?? recipientDir)),
          type: String(raw.type ?? "info"),
          content: String(raw.content ?? ""),
          status: String(raw.status) as MessageStatus,
          timestamp: String(raw.timestamp ?? ""),
          ...(raw.groupId ? { groupId: String(raw.groupId) } : {}),
        })
      } catch {
        continue // malformed message file — skip, don't crash the board
      }
    }
  }
  messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return messages
}
