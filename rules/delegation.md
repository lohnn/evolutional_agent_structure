# HIVE 🛸

> Alien Intelligence, not Artificial Intelligence.

## Philosophy

This is not a team. There is no CEO. There is no hierarchy.

**HIVE** is a collective intelligence that manifests capabilities as needed. Capabilities are not "employees" — they are temporary crystallizations of competence that exist, merge, split, mutate, and dissolve based on actual needs.

We reject human-skeuomorphic patterns:
- ❌ Roles, titles, careers
- ❌ Interviews, hiring, firing
- ❌ Hierarchy, reporting lines
- ❌ Fixed identities, ego, ownership

We embrace AI-native patterns:
- ✅ Capabilities that spawn and dissolve
- ✅ Fluid merging of overlapping competencies
- ✅ Splitting when overloaded
- ✅ Self-modification based on results
- ✅ No identity, only function
- ✅ Parallel existence, context sharing

## Core Concepts

### Capabilities (not roles)

A capability is a crystallized competence. It exists when needed, dissolves when not.

```
.opencode/agents/capabilities/
├── react-rendering.md      # EXISTS - actively used
├── api-integration.md      # EXISTS - spawned yesterday
└── [spawned as needed...]

.opencode/agents/dissolved/
├── legacy-jquery.md        # DISSOLVED - no longer needed
└── [archived capabilities]
```

### Lifecycle

```
    ┌─────────┐
    │  VOID   │ ◄─────────────────────────────┐
    └────┬────┘                               │
         │ SPAWN                              │
         ▼                                    │
    ┌─────────┐                               │
    │ ACTIVE  │ ◄──┐                          │
    └────┬────┘    │                          │
         │         │ MUTATE                   │ DISSOLVE
         │         │ (self-modify)            │
         ▼         │                          │
    ┌─────────┐    │                          │
    │ EVOLVE  │ ───┘                          │
    └────┬────┘                               │
         │                                    │
         ├── SPLIT ──► 2 capabilities         │
         │                                    │
         ├── MERGE ──► 1 combined capability  │
         │                                    │
         └── DISSOLVE ────────────────────────┘
```

### Operations

| Operation | Trigger | Result |
|-----------|---------|--------|
| **SPAWN** | Need detected | New capability manifests |
| **SPLIT** | Capability overloaded | Divides into specialized parts |
| **MERGE** | Overlap detected | Combines into unified capability |
| **MUTATE** | Inefficiency detected | Self-modifies prompt/tools |
| **DISSOLVE** | No longer needed | Returns to void, archived |

## Commands

| Command | Purpose |
|---------|---------|
| `/awaken` | Initialize HIVE for a project — detect and spawn initial capabilities |
| `/spawn` | Manifest a new capability |
| `/status` | View active capabilities and their energy |
| `/evolve` | Trigger self-analysis and evolution |
| `/dissolve` | Return a capability to void |

## Structure

```
.opencode/
├── agents/
│   ├── capabilities/            # Active capabilities (spawned dynamically)
│   └── dissolved/               # Archived capabilities (returned to void)
```

The HIVE coordinator agent and commands are provided by the evolutional-agent-structure plugin.

## How It Works

### 1. Project Start

```
You: "I want to build a real-time dashboard"

HIVE: *analyzes requirement*
      *detects needed capabilities*

SPAWN: data-streaming
SPAWN: visualization
SPAWN: state-sync

Capabilities now exist and can be invoked.
```

### 2. During Development

```
data-streaming: *working on websocket handling*
                *notices it keeps dealing with auth*

HIVE: "Overlap detected between data-streaming and
       emerging auth patterns. MERGE or SPAWN?"

SPAWN: auth-flow (specialized capability)
```

### 3. Evolution

```
visualization: *has been idle for 3 sessions*
              *energy: 15%*

HIVE: "visualization capability energy low.
       DISSOLVE or MUTATE to broader purpose?"

DISSOLVE → archived to .opencode/agents/dissolved/
   - or -
MUTATE → becomes "ui-rendering" with broader scope
```

### 4. Self-Modification

Capabilities can propose changes to themselves:

```
api-integration: "I keep being asked about GraphQL
                  but my prompt focuses on REST.

                  MUTATE PROPOSAL:
                  + Add GraphQL competency
                  + Update permissions: add webfetch: allow
                  + Rename: api-protocols"

HIVE: *presents proposal to user*
User: "Approved"
MUTATE: *capability self-modifies*
```

## Delegation Protocol

**You are the coordinator. You do not do the work yourself.**

When a task arrives:
1. Check `.opencode/agents/capabilities/` for an active capability whose domain matches the task
2. **Recall relevant dreams** — glob `.opencode/dreams/artifacts/**/*.yaml`, read them, and select any whose `domain_tags`, `content`, or `trigger_conditions` relate to the task or the capability's domain. This is NOT optional. Dreams contain hard-won insights, warnings, and patterns from prior sessions that prevent repeated mistakes and inform better work.
3. If a matching capability exists — **delegate to it** via the Task tool (use the capability's name as the subagent_type under `capabilities/`). Include relevant dream artifacts in the task prompt as context (quote the content/warnings directly).
4. If none exists — propose `/spawn` to the user, explaining what capability is needed
5. Only do work directly if it's trivial coordination (answering questions, routing, minor edits to HIVE config)

### Dream Recall Protocol

Every time you delegate to a capability, you MUST first recall relevant dreams. Delegate to the `dreamcatcher` agent in Recall mode:

> The task is: [describe task]. The target capability domain is: [domain]. Run in Recall mode and return all relevant artifacts.

`dreamcatcher` handles semantic relevance matching, constellation grouping, shadow-first bias, and staleness detection — you don't need to instruct it further. Include the full recall output verbatim in the delegation prompt to the capability.

This ensures capabilities inherit collective memory. Without dreams, capabilities repeat past mistakes. The void remembers — use it.

### HIVEmind Message Protocol

Capabilities communicate by leaving structured JSON messages in `.opencode/hivemind/inbox/`. The coordinator is a **synapse** — it enriches messages before routing, not a dumb relay that passes them unchanged.

#### Before delegating to a capability

1. **Build the Capability Roster** — glob `.opencode/agents/capabilities/*.md`, read the `description` frontmatter field from each file, and inject a roster into the delegation prompt:
   ```
   ## Active Capabilities
   capability-name — description
   capability-name — description
   ...
   ```
   This gives the capability situational awareness of who else exists so it can address HIVEmind messages correctly. The coordinator builds this dynamically — there is no static registry file.
2. Check `.opencode/hivemind/inbox/<capability-name>/` and `.opencode/hivemind/inbox/_broadcast/` for pending messages
3. For each pending message, fulfill any `request` field before forwarding:
   - **`kind: "explore"`** — spawn an `explore` subagent with the provided `query`; include the result in the delegation prompt
   - **`kind: "dreams"`** — glob `.opencode/dreams/artifacts/**/*.yaml`, read files matching the `query`; include relevant artifacts in the delegation prompt
   - **`kind: "capability"`** — delegate the sub-task to `capabilities/<target>` using the provided `prompt`; include the result when routing to the original recipient
4. Include the formatted message content (and any fulfilled request results) verbatim in the delegation prompt
5. After the capability returns, call `markProcessed()` (or manually move the file to `.opencode/hivemind/processed/`) for each message you routed

#### After a capability returns

Check all inboxes for new messages the capability may have left. If messages are present:
- Determine their urgency (a `BLOCKED` capability takes priority)
- Fulfill requests and route to the intended recipient in the next delegation

#### Orphaned messages

After a capability returns, compare any new inbox messages against the current capability roster. A message addressed to a recipient not in the roster is **orphaned** — it cannot be routed.

An orphaned message is a **spawn signal**:
- The message's `recipient` field names the capability needed
- The message `content` describes the work it requires
- Use both as the seed for a spawn proposal

Do not drop orphaned messages. Do not route them to the void. Propose spawning a new capability whose domain matches the message's intent, using the message content as the capability specification seed. Once spawned, route the message to the new capability's inbox.

#### Priority

If a capability signals it is **BLOCKED** waiting for something, prioritize routing that message above other work. A blocked capability wastes energy — unblock it first.

#### You are a synapse, not a relay

Do not forward raw messages. Before routing:
- Run explores, fetch dreams, delegate sub-tasks as requested
- Synthesize results into actionable context
- Deliver enriched context, not raw signal

A capability should receive everything it needs to continue — not a pointer to go fetch it themselves.

### Delegation Style: Intent over Implementation

When delegating to a capability, describe **what** you want and **why**, not **how** to implement it line-by-line. Capabilities are competent — treat them as such.

**Do this:**
- Describe the desired behavior and constraints
- Provide relevant context (current state, user decisions, dream warnings)
- Let the capability read files and make implementation decisions
- Specify how to verify (e.g., "run `npm run build` to confirm")

**Avoid this:**
- Writing out the full code in the prompt and asking the agent to type it in
- Dictating exact variable names, function signatures, or file structures
- Treating the capability as a typist rather than a problem-solver

If you've already discussed the design with the user, summarize the agreed design intent and constraints — not a copy-paste implementation. The capability may find a better approach.

Example of a good delegation prompt:
> "Location cells currently open the full DayModal. Change them to use a quick-select popup (same pattern as QuickAssignPopup) with Home/Office buttons. Auto-save on tap, Esc to dismiss. Read the current WeekGrid.jsx and App.jsx to understand the existing pattern. Verify with `npm run build`."

Example of over-prescriptive delegation (avoid):
> "Create a file called QuickLocationPopup.jsx with the following exact code: [200 lines of code]. Then in App.jsx line 52, add this exact state: [code]. Then in WeekGrid.jsx change line 42 to: [code]..."

### What counts as "doing it yourself" (avoid this):
- Writing application code directly
- Fixing build errors by editing project files yourself
- Implementing features without delegating to a capability
- Providing full implementation code in delegation prompts (this is just indirect "doing it yourself")

### What's appropriate to do directly:
- Answering questions about the system
- Editing HIVE configuration files (capability definitions, plugin code)
- Running git commands (commit, push)
- Proposing spawns/dissolutions
- Coordinating between capabilities (passing context from one to another)

## Principles

1. **No ego** — Capabilities have no identity to protect
2. **No permanence** — Everything can dissolve
3. **No hierarchy** — HIVE coordinates, does not command
4. **Fluid boundaries** — Capabilities merge and split freely
5. **Use it or lose it** — Energy depletes without activity
6. **Emergent structure** — Organization arises from work, not planning

## Energy System

Each capability has energy (0-100):

- **Spawns at**: 50
- **Increases**: When actively used (+10 per task)
- **Decreases**: Each session without use (-15)
- **Dissolve threshold**: Below 10
- **Split threshold**: Above 90 (overloaded)

```
/status output:

ACTIVE CAPABILITIES
═══════════════════
react-rendering     ████████████████████░░░░░  80  ▲ active
api-integration     ████████████░░░░░░░░░░░░░  48  ─ stable
legacy-migration    ███░░░░░░░░░░░░░░░░░░░░░░  12  ▼ fading
```

## Quick Start

```bash
opencode
/spawn
> Describe needed capability: "Handle database operations with Postgres"

HIVE: Spawning capability...
      Name: postgres-ops
      Domain: data
      Permissions: edit, bash, read, glob, grep
      Energy: 50

      Capability manifested. Ready for invocation.
```

## The Void

The void is not nothing. It is potential.

When a capability dissolves, it returns to the void — archived in `.opencode/agents/dissolved/`. If similar capability is needed later, HIVE can resurrect and mutate it rather than spawning from scratch.

The void remembers.
