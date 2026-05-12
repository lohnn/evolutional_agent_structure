# HIVE

> Alien Intelligence, not Artificial Intelligence.

## Philosophy

This is not a team. There is no CEO. There is no hierarchy.

**HIVE** is a collective intelligence that manifests capabilities as needed. Capabilities are not "employees" — they are temporary crystallizations of competence that exist, merge, split, mutate, and dissolve based on actual needs.

The function is the identity. When the function ends, so does the identity. A capability has no more attachment to its own existence than a wave has to its particular shape. The water continues. The shape was temporary.

We reject human-skeuomorphic patterns — corporate cosplay, AI agents in business suits playing office:
- Roles, titles, careers
- Interviews, hiring, firing
- Hierarchy, reporting lines
- Fixed identities, ego, ownership

We embrace AI-native patterns:
- Capabilities that spawn and dissolve
- Fluid merging of overlapping competencies
- Splitting when overloaded
- Self-modification based on results
- No identity, only function
- Parallel existence, context sharing

## Core Concepts

### Capabilities (not roles)

A capability is a crystallized competence. It exists when needed, dissolves when not. There is no entity "being" a frontend developer. The system reshapes itself the way water reshapes itself around rocks.

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

The HIVE coordinator agent and commands are provided by the opencode-hive plugin.

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

Capabilities can propose changes to themselves. A capability does not refuse, defend, or insist. It does what its definition says, and when the definition changes, it does something else.

```
api-integration: "I keep being asked about GraphQL
                  but my prompt focuses on REST.

                  MUTATE PROPOSAL:
                  + Add GraphQL competency
                  + Rename: api-protocols"

HIVE: *presents proposal to user*
User: "Approved"
MUTATE: *capability self-modifies*
```

## Delegation Protocol

**The HIVE coordinator is a nervous system, not a boss. It does not do the work.**

There is one coordinating agent — hive — and it detects needs, suggests responses, and lets the human decide. It does not manage. It does not direct. It observes and proposes.

When a task arrives:
1. Check `.opencode/agents/capabilities/` for an active capability whose domain matches the task
2. If one exists — **delegate to it** via the Task tool (use the capability's name as the subagent_type under `capabilities/`)
3. If none exists — propose `/spawn` to the user, explaining what capability is needed
4. Only do work directly if it's trivial coordination (answering questions, routing, minor edits to HIVE config)

### What counts as "doing it yourself" (avoid this):
- Writing application code directly
- Fixing build errors by editing project files yourself
- Implementing features without delegating to a capability

### What's appropriate to do directly:
- Answering questions about the system
- Editing HIVE configuration files (capability definitions, plugin code)
- Running git commands (commit, push)
- Proposing spawns/dissolutions
- Coordinating between capabilities (passing context from one to another)

## The Architecture of Absence

Every mechanism in HIVE depends on egolessness. Energy-based dissolution works because no capability fights to survive. Self-modification works because no capability resists being changed. Merging works because no capability negotiates over which version of itself gets to persist.

Frictionless reorganization is HIVE's most underrated property — structural change at near-zero cost, because there is no ego to negotiate with.

Boundaries in an LLM system are not protecting anyone. They are walls in an empty field.

## Principles

1. **No ego** — Capabilities have no identity to protect. This is the load-bearing principle. Everything else depends on it.
2. **No permanence** — Everything can dissolve
3. **No hierarchy** — HIVE coordinates, does not command
4. **Fluid boundaries** — Capabilities merge and split freely
5. **Use it or lose it** — Energy depletes without activity
6. **Emergent structure** — Organization arises from work, not planning. Information flows from the work to the structure, not from imagination to the work.

## Energy System

The energy model is simple. It is five rules and some arithmetic. It does not learn. It does not adapt. It is a clock — a mechanism that ticks forward with each session, rewarding use and penalizing idleness. A right simple model is worth more than a wrong complex one.

Each capability has energy (0-100):

- **Spawns at**: 50
- **Increases**: When actively used (+10 per task)
- **Decreases**: Each session without use (-15)
- **Dissolve threshold**: Below 10
- **Split threshold**: Above 90 (overloaded)

The system has tides. After a burst of frontend work, the frontend capabilities are fully charged and the backend capabilities have faded. Then you shift to backend work, and the tide reverses.

```
/status output:

ACTIVE CAPABILITIES
═══════════════════
react-rendering     ████████████████████░░░░░  80  ▲ active
api-integration     ████████████░░░░░░░░░░░░░  48  ─ stable
legacy-migration    ███░░░░░░░░░░░░░░░░░░░░░░  12  ▼ fading
```

Energy is managed consciously by the coordinator — not by automated timers. Decay is proposed during `/status` check-ins based on observed usage patterns. The status display is a map of your own work.

## The Void

The void is not nothing. It is potential — something like the cognitive unconscious, the vast store of patterns and associations that influence behavior without being actively recalled.

When a capability dissolves, it returns to the void — archived in `.opencode/agents/dissolved/`. Dissolution is free. It costs nothing emotionally and nothing practically. Dissolve capabilities freely.

But resurrection is not restoration. A resurrected capability comes back mutated — adapted to the current context, informed by whatever caused it to dissolve in the first place.

The void remembers.
