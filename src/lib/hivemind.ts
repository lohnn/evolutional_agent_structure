import path from "path"
import fs from "fs"
import crypto from "crypto"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HiveMessage {
  id: string
  sender: string
  recipient: string
  type: "question" | "info" | "result" | "request"
  content: string
  status: "pending" | "delivered" | "read"
  timestamp: string
}

export interface InboxEntry {
  file: string
  subdir: string
  msg: HiveMessage
}

// ── Paths ─────────────────────────────────────────────────────────────────────

function hivemindPath(directory: string): string {
  return path.join(directory, ".opencode/hivemind")
}

function inboxPath(directory: string, recipient: string): string {
  return path.join(hivemindPath(directory), "inbox", recipient)
}

function makeFilename(): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 15)
  const rand = crypto.randomBytes(3).toString("hex")
  return `msg_${ts}_${rand}.json`
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Read all pending/delivered messages for a capability.
 * Checks both the named inbox and _broadcast.
 */
export function getInbox(directory: string, capabilityName: string): InboxEntry[] {
  const subdirs = [capabilityName, "_broadcast"]
  const messages: InboxEntry[] = []

  for (const subdir of subdirs) {
    const dir = inboxPath(directory, subdir)
    let files: string[]
    try {
      files = fs.readdirSync(dir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.endsWith(".json")) continue
      try {
        const msg: HiveMessage = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
        if (msg.status === "pending" || msg.status === "delivered") {
          messages.push({ file, subdir, msg })
        }
      } catch {
        // skip malformed
      }
    }
  }

  return messages.sort(
    (a, b) => new Date(a.msg.timestamp).getTime() - new Date(b.msg.timestamp).getTime()
  )
}

/**
 * Write a message to a recipient's inbox. Returns the filename.
 */
export function sendMessage(directory: string, msg: Pick<HiveMessage, "sender" | "recipient" | "type" | "content">): string {
  const dir = inboxPath(directory, msg.recipient)
  fs.mkdirSync(dir, { recursive: true })

  const envelope: HiveMessage = {
    id: `msg_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    sender: msg.sender,
    recipient: msg.recipient,
    type: msg.type,
    content: msg.content,
    status: "pending",
    timestamp: new Date().toISOString(),
  }

  const filename = makeFilename()
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(envelope, null, 2), "utf8")
  return filename
}

/**
 * Mark all pending messages as read for a capability.
 */
export function markAllRead(directory: string, capabilityName: string): void {
  const subdirs = [capabilityName, "_broadcast"]
  for (const subdir of subdirs) {
    const dir = inboxPath(directory, subdir)
    let files: string[]
    try {
      files = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue
      const filePath = path.join(dir, file)
      try {
        const msg: HiveMessage = JSON.parse(fs.readFileSync(filePath, "utf8"))
        if (msg.status === "pending" || msg.status === "delivered") {
          msg.status = "read"
          fs.writeFileSync(filePath, JSON.stringify(msg, null, 2), "utf8")
        }
      } catch {
        // skip
      }
    }
  }
}

/**
 * List all inbox directories that have pending messages.
 * Returns array of { recipient, count }.
 */
export function listPendingInboxes(directory: string): { recipient: string; count: number }[] {
  const base = path.join(directory, ".opencode/hivemind/inbox")
  let dirs: string[]
  try {
    dirs = fs.readdirSync(base).filter(
      (d) => !d.startsWith("_") && fs.statSync(path.join(base, d)).isDirectory()
    )
  } catch {
    return []
  }

  const results: { recipient: string; count: number }[] = []
  for (const recipient of dirs) {
    const pending = getInbox(directory, recipient)
    if (pending.length > 0) {
      results.push({ recipient, count: pending.length })
    }
  }
  return results
}

/**
 * Format pending messages into a readable block for prompt injection.
 */
export function formatInboxForPrompt(messages: InboxEntry[]): string | null {
  if (!messages || messages.length === 0) return null

  const lines = ["## HIVEmind — Pending Messages\n"]

  for (const { subdir, msg } of messages) {
    const channel = subdir === "_broadcast" ? "[broadcast]" : `[to: ${msg.recipient}]`
    lines.push(`### Message from \`${msg.sender}\` ${channel}`)
    lines.push(`**Type**: ${msg.type}  |  **Sent**: ${msg.timestamp}`)
    lines.push(`**Content**: ${msg.content}`)
    lines.push("")
  }

  return lines.join("\n")
}
