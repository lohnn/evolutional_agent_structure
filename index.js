/**
 * OpenCode HIVE Plugin
 *
 * Evolutional agent structure — collective intelligence that spawns, merges,
 * splits, mutates, and dissolves capabilities as needed.
 *
 * Registers the HIVE coordinator agent and lifecycle commands (/awaken, /spawn,
 * /status, /evolve, /dissolve, /reload) via the config hook.
 *
 * Also provides:
 * - Context compaction hooks (preserves HIVE state across compaction)
 * - Hot-reload on agent file changes
 *
 * Usage in opencode.json:
 *   "plugin": [["./projects/opencode-hive/index.js"]]
 *
 * Capabilities and dissolved agents remain as local .opencode/agents/ files
 * per project (not versioned by this plugin).
 */

import path from "path";
import fs from "fs";

// ─────────────────────────────────────────────────────────────────────────────
// Frontmatter parser (minimal YAML subset)
// ─────────────────────────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const fmStr = match[1];
  const body = match[2];
  const frontmatter = {};

  let currentKey = null;
  let inNestedBlock = false;
  let nestedKey = null;
  let nestedObj = {};

  function saveState() {
    if (inNestedBlock && nestedKey) {
      frontmatter[nestedKey] = nestedObj;
      inNestedBlock = false;
      nestedKey = null;
      nestedObj = {};
    } else if (currentKey) {
      currentKey = null;
    }
  }

  for (const line of fmStr.split("\n")) {
    if (line.trim() === "") continue;

    const topMatch = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (topMatch && !line.startsWith(" ") && !line.startsWith("\t")) {
      saveState();
      const key = topMatch[1];
      const val = topMatch[2].trim();

      if (val === "") {
        // Start of nested block
        inNestedBlock = true;
        nestedKey = key;
        nestedObj = {};
      } else {
        frontmatter[key] = val.replace(/^["']|["']$/g, "");
      }
      currentKey = key;
      continue;
    }

    if (inNestedBlock) {
      const nestedMatch = line.match(/^\s+([a-zA-Z_*"'-][a-zA-Z_*0-9"'-]*):\s*(.*)$/);
      if (nestedMatch) {
        const nk = nestedMatch[1].replace(/^["']|["']$/g, "");
        const nv = nestedMatch[2].trim().replace(/^["']|["']$/g, "");
        nestedObj[nk] = nv;
      }
    }
  }
  saveState();

  return { frontmatter, body };
}

// ─────────────────────────────────────────────────────────────────────────────
// File reading helpers
// ─────────────────────────────────────────────────────────────────────────────

function readMdFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return parseFrontmatter(content);
}

function readMdDir(dirPath, suffix = ".md") {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(suffix))
    .map((f) => {
      const { frontmatter, body } = readMdFile(path.join(dirPath, f));
      const name = f.replace(suffix, "");
      return { name, frontmatter, body };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hot-reload helpers
// ─────────────────────────────────────────────────────────────────────────────

async function snapshotAgentsMtime(agentsPath) {
  const snapshot = {};

  async function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        const s = fs.statSync(full);
        if (s.isDirectory()) {
          await walk(full);
        } else if (entry.endsWith(".md")) {
          snapshot[full] = s.mtimeMs;
        }
      } catch {
        // ignore
      }
    }
  }

  await walk(agentsPath);
  return snapshot;
}

function snapshotChanged(prev, next) {
  const prevKeys = Object.keys(prev).sort();
  const nextKeys = Object.keys(next).sort();
  if (prevKeys.length !== nextKeys.length) return true;
  if (prevKeys.join("\0") !== nextKeys.join("\0")) return true;
  for (const key of prevKeys) {
    if (prev[key] !== next[key]) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compaction helpers
// ─────────────────────────────────────────────────────────────────────────────

function getHiveState(capabilitiesPath) {
  let files;
  try {
    files = fs.readdirSync(capabilitiesPath);
  } catch {
    return null;
  }

  const capabilities = [];

  for (const file of files) {
    if (!file.endsWith(".md") || file.startsWith("_")) continue;

    const content = fs.readFileSync(path.join(capabilitiesPath, file), "utf8");
    const name = file.replace(".md", "");
    const energyMatch = content.match(/^energy:\s*(\d+)/m);
    const descMatch = content.match(/^description:\s*(.+)/m);

    const energy = energyMatch ? energyMatch[1] : "?";
    const desc = descMatch ? descMatch[1] : "no description";

    capabilities.push(`- ${name} (energy: ${energy}) — ${desc}`);
  }

  if (capabilities.length === 0) return null;
  return `Active capabilities:\n${capabilities.join("\n")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin export
// ─────────────────────────────────────────────────────────────────────────────

const PLUGIN_ROOT = path.dirname(new URL(import.meta.url).pathname);
const AGENTS_DIR = path.join(PLUGIN_ROOT, "agents");
const COMMANDS_DIR = path.join(PLUGIN_ROOT, "commands");
const TEMPLATES_DIR = path.join(PLUGIN_ROOT, "templates");
const RULES_DIR = path.join(PLUGIN_ROOT, "rules");

// Read version from package.json
let PLUGIN_VERSION = "unknown";
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "package.json"), "utf8"));
  PLUGIN_VERSION = pkg.version || "unknown";
} catch {
  // ignore
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap: ensure project has capabilities/dissolved dirs and _template.md
// ─────────────────────────────────────────────────────────────────────────────

function bootstrapProject(directory) {
  const capDir = path.join(directory, ".opencode/agents/capabilities");
  const disDir = path.join(directory, ".opencode/agents/dissolved");

  fs.mkdirSync(capDir, { recursive: true });
  fs.mkdirSync(disDir, { recursive: true });

  // Copy _template.md if missing
  const templateDest = path.join(capDir, "_template.md");
  if (!fs.existsSync(templateDest)) {
    const templateSrc = path.join(TEMPLATES_DIR, "_template.md");
    if (fs.existsSync(templateSrc)) {
      fs.copyFileSync(templateSrc, templateDest);
    }
  }
}

export const HivePlugin = async function (ctx) {
  const { directory, client } = ctx;
  const projectAgentsPath = path.join(directory, ".opencode/agents");
  const capabilitiesPath = path.join(projectAgentsPath, "capabilities");

  // Bootstrap project structure on first run
  bootstrapProject(directory);

  const log = (level, message, extra) => {
    client?.app?.log?.({
      body: { service: "opencode-hive", level, message, ...(extra && { extra }) },
    }).catch(() => {});
  };

  log("info", `HIVE plugin v${PLUGIN_VERSION} loaded from ${PLUGIN_ROOT}`);

  let lastSnapshot = await snapshotAgentsMtime(projectAgentsPath);

  return {
    // ── Config hook: register agents and commands ──
    config: async (config) => {
      try {
        config.agent = config.agent || {};
        config.command = config.command || {};

        // Register agents from bundled markdown
        const agents = readMdDir(AGENTS_DIR);
        for (const agent of agents) {
          const fm = agent.frontmatter;
          config.agent[agent.name] = {
            description: fm.description || "",
            prompt: agent.body.trim(),
            mode: fm.mode || "subagent",
            ...(fm.model && { model: fm.model }),
            ...(fm.permission && { permission: fm.permission }),
          };
        }

        // Register commands from bundled markdown
        const commands = readMdDir(COMMANDS_DIR);
        for (const cmd of commands) {
          const fm = cmd.frontmatter;
          config.command[cmd.name] = {
            description: fm.description || "",
            template: cmd.body.trim(),
            ...(fm.agent && { agent: fm.agent }),
          };
        }

        // Inject HIVE delegation rules as instructions
        config.instructions = config.instructions || [];
        const delegationRule = path.join(RULES_DIR, "delegation.md");
        if (!config.instructions.includes(delegationRule)) {
          config.instructions.push(delegationRule);
        }

        log("info", `HIVE config registered`, {
          agents: agents.map((a) => a.name),
          commands: commands.map((c) => c.name),
          rules: [delegationRule],
        });
      } catch (err) {
        fs.writeFileSync(
          "/tmp/opencode-hive-plugin-error.txt",
          err.stack || err.message || String(err)
        );
      }
    },

    // ── Hot-reload: /reload command intercept ──
    "command.execute.before": async (input, _output) => {
      if (input.command === "reload") {
        lastSnapshot = await snapshotAgentsMtime(projectAgentsPath);
        // @ts-ignore
        client?.instance?.dispose?.();
      }
    },

    // ── Hot-reload: auto-detect on new session ──
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const currentSnapshot = await snapshotAgentsMtime(projectAgentsPath);
        if (snapshotChanged(lastSnapshot, currentSnapshot)) {
          lastSnapshot = currentSnapshot;
          // @ts-ignore
          client?.instance?.dispose?.();
        }
      }
    },

    // ── Compaction: preserve HIVE state ──
    "experimental.session.compacting": async (_input, output) => {
      const state = getHiveState(capabilitiesPath);
      if (state) {
        output.context.push(`## HIVE State (preserved across compaction)\n\n${state}\n\nUse /status to see full details. Capabilities with low energy may need attention.`);
      }
    },
  };
};

export default HivePlugin;
