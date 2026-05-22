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
  request?: MessageRequest | null
  status: "pending" | "delivered" | "read"
  timestamp: string
}

export interface MessageRequest {
  kind: "explore" | "dreams" | "capability"
  query?: string
  target?: string
  prompt?: string
}

export interface InboxEntry {
  file: string
  subdir: string
  msg: HiveMessage
}

// ── Paths ─────────────────────────────────────────────────────────────────────

function getHivemindPath(directory: string): string {
  return path.join(directory, ".opencode/hivemind")
}

function getInboxPath(directory: string, capabilityName: string): string {
  return path.join(getHivemindPath(directory), "inbox", capabilityName)
}

function getProcessedPath(directory: string): string {
  return path.join(getHivemindPath(directory), "processed")
}

function makeFilename(): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 15)
  const rand = crypto.randomBytes(3).toString("hex")
  return `msg_${ts}_${rand}.json`
}

export function generateMessageId(): string {
  const ts = Date.now()
  const rand = crypto.randomBytes(3).toString("hex")
  return `msg_${ts}_${rand}`
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Read all pending messages for a capability.
 * Checks both the named inbox and _broadcast.
 */
export function getInbox(directory: string, capabilityName: string): InboxEntry[] {
  const subdirs = [capabilityName, "_broadcast"]
  const messages: InboxEntry[] = []

  for (const subdir of subdirs) {
    const inboxDir = getInboxPath(directory, subdir)
    let files: string[]
    try {
      files = fs.readdirSync(inboxDir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.endsWith(".json")) continue
      const filePath = path.join(inboxDir, file)
      try {
        const msg: HiveMessage = JSON.parse(fs.readFileSync(filePath, "utf8"))
        if (msg.status === "pending" || msg.status === "delivered") {
          messages.push({ file, subdir, msg })
        }
      } catch {
        // skip malformed files
      }
    }
  }

  return messages.sort(
    (a, b) => new Date(a.msg.timestamp).getTime() - new Date(b.msg.timestamp).getTime()
  )
}

/**
 * Write a message to the target capability's inbox.
 */
export function sendMessage(directory: string, msg: Partial<HiveMessage>): string {
  const recipient = msg.recipient || "_broadcast"
  const inboxDir = getInboxPath(directory, recipient)
  fs.mkdirSync(inboxDir, { recursive: true })

  const envelope: HiveMessage = {
    id: generateMessageId(),
    sender: msg.sender || "unknown",
    recipient,
    type: msg.type || "info",
    content: msg.content || "",
    ...(msg.request && { request: msg.request }),
    status: "pending",
    timestamp: new Date().toISOString(),
  }

  const filename = makeFilename()
  fs.writeFileSync(path.join(inboxDir, filename), JSON.stringify(envelope, null, 2), "utf8")
  return filename
}

/**
 * Move a processed message from inbox to processed/.
 */
export function markProcessed(directory: string, subdir: string, filename: string): void {
  const src = path.join(getInboxPath(directory, subdir), filename)
  const destDir = getProcessedPath(directory)
  fs.mkdirSync(destDir, { recursive: true })

  const destFilename = `${subdir}__${filename}`
  const dest = path.join(destDir, destFilename)

  try {
    fs.renameSync(src, dest)
  } catch {
    try {
      fs.copyFileSync(src, dest)
      fs.unlinkSync(src)
    } catch {
      // best effort
    }
  }
}

/**
 * Mark all pending messages as read for a capability.
 */
export function markAllRead(directory: string, capabilityName: string): void {
  const subdirs = [capabilityName, "_broadcast"]
  for (const subdir of subdirs) {
    const dir = getInboxPath(directory, subdir)
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
 * Format pending messages into a readable block for injection into prompts.
 */
export function formatInboxForPrompt(messages: InboxEntry[]): string | null {
  if (!messages || messages.length === 0) return null

  const lines = ["## HIVEmind — Pending Messages\n"]

  for (const { subdir, msg } of messages) {
    const channel = subdir === "_broadcast" ? "[broadcast]" : `[to: ${msg.recipient}]`
    lines.push(`### Message from \`${msg.sender}\` ${channel}`)
    lines.push(`**Type**: ${msg.type}  |  **Sent**: ${msg.timestamp}`)
    lines.push(`**Content**: ${msg.content}`)

    if (msg.request) {
      const r = msg.request
      lines.push(`**Coordinator Request** (kind: \`${r.kind}\`):`)
      if (r.kind === "explore") {
        lines.push(`  Query: ${r.query}`)
      } else if (r.kind === "dreams") {
        lines.push(`  Query: ${r.query}`)
      } else if (r.kind === "capability") {
        lines.push(`  Target: ${r.target}`)
        lines.push(`  Prompt: ${r.prompt}`)
      }
    }

    lines.push("")
  }

  return lines.join("\n")
}
