import path from "path";
import fs from "fs";
import crypto from "crypto";

// ── Paths ─────────────────────────────────────────────────────────────────────

function getHivemindPath(directory) {
  return path.join(directory, ".opencode/hivemind");
}

function getInboxPath(directory, capabilityName) {
  return path.join(getHivemindPath(directory), "inbox", capabilityName);
}

function getProcessedPath(directory) {
  return path.join(getHivemindPath(directory), "processed");
}

// ── Message filename ──────────────────────────────────────────────────────────

function makeFilename() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 15);
  const rand = crypto.randomBytes(3).toString("hex");
  return `msg_${ts}_${rand}.json`;
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Read all pending messages for a capability.
 * Checks both the named inbox and _broadcast.
 *
 * Returns array of { file, subdir, msg }
 */
export function getInbox(directory, capabilityName) {
  const subdirs = [capabilityName, "_broadcast"];
  const messages = [];

  for (const subdir of subdirs) {
    const inboxDir = getInboxPath(directory, subdir);
    let files;
    try {
      files = fs.readdirSync(inboxDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(inboxDir, file);
      try {
        const msg = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (msg.status === "pending") {
          messages.push({ file, subdir, msg });
        }
      } catch {
        // skip malformed files
      }
    }
  }

  return messages;
}

/**
 * Write a message JSON file to the target capability's inbox.
 * Creates the inbox dir if it doesn't exist.
 *
 * msg should include: sender, recipient, type, content, and optionally request.
 */
export function sendMessage(directory, msg) {
  const recipient = msg.recipient || "_broadcast";
  const inboxDir = getInboxPath(directory, recipient);
  fs.mkdirSync(inboxDir, { recursive: true });

  const envelope = {
    sender: msg.sender || "unknown",
    recipient,
    type: msg.type || "info",
    content: msg.content || "",
    ...(msg.request && { request: msg.request }),
    status: "pending",
    timestamp: new Date().toISOString(),
  };

  const filename = makeFilename();
  fs.writeFileSync(path.join(inboxDir, filename), JSON.stringify(envelope, null, 2), "utf8");
  return filename;
}

/**
 * Move a processed message from inbox to processed/.
 */
export function markProcessed(directory, subdir, filename) {
  const src = path.join(getInboxPath(directory, subdir), filename);
  const destDir = getProcessedPath(directory);
  fs.mkdirSync(destDir, { recursive: true });

  // Avoid collisions if same filename processed twice
  const destFilename = `${subdir}__${filename}`;
  const dest = path.join(destDir, destFilename);

  try {
    fs.renameSync(src, dest);
  } catch {
    // If rename fails (e.g. cross-device), copy then delete
    try {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } catch {
      // best effort
    }
  }
}

/**
 * Format pending messages into a readable block for injection into prompts.
 */
export function formatInboxForPrompt(messages) {
  if (!messages || messages.length === 0) return null;

  const lines = ["## HIVEmind — Pending Messages\n"];

  for (const { subdir, msg } of messages) {
    const channel = subdir === "_broadcast" ? "[broadcast]" : `[to: ${msg.recipient}]`;
    lines.push(`### Message from \`${msg.sender}\` ${channel}`);
    lines.push(`**Type**: ${msg.type}  |  **Sent**: ${msg.timestamp}`);
    lines.push(`**Content**: ${msg.content}`);

    if (msg.request) {
      const r = msg.request;
      lines.push(`**Coordinator Request** (kind: \`${r.kind}\`):`);
      if (r.kind === "explore") {
        lines.push(`  Query: ${r.query}`);
      } else if (r.kind === "dreams") {
        lines.push(`  Query: ${r.query}`);
      } else if (r.kind === "capability") {
        lines.push(`  Target: ${r.target}`);
        lines.push(`  Prompt: ${r.prompt}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}
