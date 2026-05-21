/**
 * OpenCode HIVE Plugin
 *
 * Evolutional agent structure — collective intelligence that spawns, merges,
 * splits, mutates, and dissolves capabilities as needed.
 *
 * Registers the HIVE coordinator agent and lifecycle commands (/awaken, /spawn,
 * /status, /evolve, /dissolve, /reload, /tick) via the config hook.
 *
 * Also provides:
 * - Energy tick system (auto-applied on session.created and compaction)
 * - Context compaction hooks (preserves HIVE state across compaction)
 * - Hot-reload on agent file changes
 *
 * Usage in opencode.json:
 *   "plugin": [["./projects/evolutional_agent_structure/index.js"]]
 *
 * Capabilities and dissolved agents remain as local .opencode/agents/ files
 * per project (not versioned by this plugin).
 */

import path from "path";
import fs from "fs";
import { readMdDir } from "./lib/frontmatter.js";
import { snapshotAgentsMtime, snapshotChanged } from "./lib/reload.js";
import { tickEnergy, markCapabilityUsed, getCapabilitiesSummary } from "./lib/energy.js";
import { getInbox, formatInboxForPrompt } from "./lib/hivemind.js";

const PLUGIN_ROOT = path.dirname(new URL(import.meta.url).pathname);
const AGENTS_DIR = path.join(PLUGIN_ROOT, "agents");
const COMMANDS_DIR = path.join(PLUGIN_ROOT, "commands");
const TEMPLATES_DIR = path.join(PLUGIN_ROOT, "templates");
const RULES_DIR = path.join(PLUGIN_ROOT, "rules");
const SKILLS_DIR = path.join(PLUGIN_ROOT, "skills");

let PLUGIN_VERSION = "unknown";
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "package.json"), "utf8"));
  PLUGIN_VERSION = pkg.version || "unknown";
} catch {
  // ignore
}

function bootstrapProject(directory) {
  const capDir = path.join(directory, ".opencode/agents/capabilities");
  const disDir = path.join(directory, ".opencode/agents/dissolved");

  fs.mkdirSync(capDir, { recursive: true });
  fs.mkdirSync(disDir, { recursive: true });

  const templateDest = path.join(capDir, "_template.md");
  if (!fs.existsSync(templateDest)) {
    const templateSrc = path.join(TEMPLATES_DIR, "_template.md");
    if (fs.existsSync(templateSrc)) {
      fs.copyFileSync(templateSrc, templateDest);
    }
  }

  // Bootstrap dreams directory structure
  const dreamsBase = path.join(directory, ".opencode/dreams");
  for (const sub of ["active", "history", "artifacts/insights", "artifacts/warnings", "artifacts/songlines", "artifacts/shadows"]) {
    fs.mkdirSync(path.join(dreamsBase, sub), { recursive: true });
  }

  // Bootstrap HIVEmind directory structure
  const hivemindBase = path.join(directory, ".opencode/hivemind");
  for (const sub of ["inbox/_broadcast", "processed"]) {
    fs.mkdirSync(path.join(hivemindBase, sub), { recursive: true });
  }

  // Symlink plugin skills into .opencode/skills/ for discovery
  const projectSkillsDir = path.join(directory, ".opencode/skills");
  fs.mkdirSync(projectSkillsDir, { recursive: true });
  const pluginSkillsDir = path.join(PLUGIN_ROOT, "skills");
  if (fs.existsSync(pluginSkillsDir)) {
    for (const entry of fs.readdirSync(pluginSkillsDir)) {
      const src = path.join(pluginSkillsDir, entry);
      const dest = path.join(projectSkillsDir, entry);
      if (fs.statSync(src).isDirectory()) {
        try {
          const existing = fs.lstatSync(dest);
          // If it's already a symlink pointing to the right place, skip
          if (existing.isSymbolicLink() && fs.readlinkSync(dest) === src) continue;
          // Otherwise remove and re-create
          fs.rmSync(dest, { recursive: true });
        } catch {
          // dest doesn't exist, fine
        }
        fs.symlinkSync(src, dest);
      }
    }
  }
}

export const HivePlugin = async function (ctx) {
  const { directory, client } = ctx;
  const projectAgentsPath = path.join(directory, ".opencode/agents");
  const capabilitiesPath = path.join(projectAgentsPath, "capabilities");

  bootstrapProject(directory);

  const log = (level, message, extra) => {
    client?.app?.log?.({
      body: { service: "evolutional-agent-structure", level, message, ...(extra && { extra }) },
    }).catch(() => {});
  };

  log("info", `HIVE plugin v${PLUGIN_VERSION} loaded from ${PLUGIN_ROOT}`);

  let lastSnapshot = await snapshotAgentsMtime(projectAgentsPath);

  return {
    // ── Config: register agents, commands, and rules ──
    config: async (config) => {
      try {
        config.agent = config.agent || {};
        config.command = config.command || {};

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

        const commands = readMdDir(COMMANDS_DIR);
        for (const cmd of commands) {
          const fm = cmd.frontmatter;
          config.command[cmd.name] = {
            description: fm.description || "",
            template: cmd.body.trim(),
            ...(fm.agent && { agent: fm.agent }),
          };
        }

        config.instructions = config.instructions || [];
        const delegationRule = path.join(RULES_DIR, "delegation.md");
        if (!config.instructions.includes(delegationRule)) {
          config.instructions.push(delegationRule);
        }

        const hivemindRule = path.join(RULES_DIR, "hivemind-capabilities.md");
        if (!config.instructions.includes(hivemindRule)) {
          config.instructions.push(hivemindRule);
        }

        log("info", `HIVE config registered`, {
          agents: agents.map((a) => a.name),
          commands: commands.map((c) => c.name),
          rules: [delegationRule, hivemindRule],
        });
      } catch (err) {
        fs.writeFileSync(
          "/tmp/evolutional-agent-structure-error.txt",
          err.stack || err.message || String(err)
        );
      }
    },

    // ── Commands: hive-setup, tick, reload ──
    "command.execute.before": async (input, _output) => {
      if (input.command === "hive-setup") {
        const agentsMdDest = path.join(directory, "AGENTS.md");
        const rulesSource = path.join(RULES_DIR, "delegation.md");
        if (fs.existsSync(rulesSource)) {
          const content = fs.readFileSync(rulesSource, "utf8");
          fs.writeFileSync(agentsMdDest, content, "utf8");
          log("info", `AGENTS.md written to ${agentsMdDest}`);
        }
        bootstrapProject(directory);
      }

      if (input.command === "tick") {
        const { results, warnings, skipped } = tickEnergy(directory);
        log("info", skipped ? "Energy tick skipped" : "Energy tick applied", { results, warnings });
      }

      if (input.command === "reload") {
        lastSnapshot = await snapshotAgentsMtime(projectAgentsPath);
        // @ts-ignore
        client?.instance?.dispose?.();
      }


    },

    // ── Track capability usage when delegated to via Task tool ──
    "tool.execute.after": async (input) => {
      if (input.tool === "task") {
        const agentType = input?.args?.subagent_type || "";
        if (agentType.startsWith("capabilities/")) {
          const capName = agentType.replace("capabilities/", "");
          markCapabilityUsed(directory, capName);
          log("info", `Marked capability as used: ${capName}`);

          // Check for pending HIVEmind messages left by this capability
          const pending = getInbox(directory, capName);
          if (pending.length > 0) {
            const formatted = formatInboxForPrompt(pending);
            log("info", `HIVEmind: ${pending.length} pending message(s) after ${capName} ran`, { formatted });
          }
        }
      }
    },

    // ── Session created: auto-tick + hot-reload ──
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const { results, skipped } = tickEnergy(directory);
        if (!skipped) {
          log("info", "Energy tick applied on session.created", { results });
        }

        const currentSnapshot = await snapshotAgentsMtime(projectAgentsPath);
        if (snapshotChanged(lastSnapshot, currentSnapshot)) {
          lastSnapshot = currentSnapshot;
          // @ts-ignore
          client?.instance?.dispose?.();
        }
      }
    },

    // ── Compaction: auto-tick + preserve HIVE state ──
    "experimental.session.compacting": async (_input, output) => {
      const { results, skipped } = tickEnergy(directory);
      if (!skipped) {
        log("info", "Energy tick applied on compaction", { results });
      }

      const summary = getCapabilitiesSummary(capabilitiesPath);
      if (summary) {
        output.context.push(
          `## HIVE State (preserved across compaction)\n\n${summary}\n\nUse /status to see full details. Capabilities with low energy may need attention.`
        );
      }
    },
  };
};

export default HivePlugin;
