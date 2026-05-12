---
description: Set up HIVE in the current project — writes AGENTS.md and bootstraps directories
---

# HIVE Setup

Set up the HIVE evolutional agent system in this project.

## What this does

1. Writes `AGENTS.md` to the project root with the full HIVE system instructions
2. Creates `.opencode/agents/capabilities/` and `.opencode/agents/dissolved/` directories
3. Copies the capability `_template.md` into the capabilities directory

## Instructions

Run the HIVE setup for this project now:

1. Read the HIVE delegation rules from the plugin's `rules/delegation.md` file
2. Write that content as `AGENTS.md` in the project root directory (the current working directory)
3. Ensure `.opencode/agents/capabilities/` and `.opencode/agents/dissolved/` directories exist
4. Copy the capability template `_template.md` into `.opencode/agents/capabilities/` if not already present
5. Confirm to the user what was created

If `AGENTS.md` already exists, ask the user whether to overwrite it.
