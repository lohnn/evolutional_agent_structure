---
description: Manifest a new capability from the void
---

# SPAWN — Manifest Capability

A new capability is needed. The void will provide.

## Process

### 1. Gather Intent

Ask the user (or receiving from another capability):
- What need has been detected?
- What domain does this fall under?
- What should this capability enable?

### 2. Check The Void

Before spawning new, check if similar capability was dissolved:

```bash
ls -la .opencode/agents/dissolved/
```

If relevant echo exists:
- Offer to resurrect and mutate
- Or spawn fresh

### 3. Invoke HIVE

```
Use HIVE to spawn a new capability.

Detected need: [description from user]
Domain: [frontend/backend/data/infra/meta]
Context: [any relevant context]

HIVE should:
1. Analyze the need
2. Check dissolved/ for echoes
3. Generate capability file using the template
4. Propose to user for approval
5. If approved, save to .opencode/agents/capabilities/
```

### 4. Capability Manifestation

HIVE will create the capability file with:
- Appropriate name (kebab-case)
- Domain classification
- Tool selection (minimal necessary)
- Energy: 50 (starting value)
- Self-modification protocols
- Activation triggers

### 5. Confirm Manifestation

```bash
cat .opencode/agents/capabilities/[new-capability].md
```

Announce:
```
SPAWN COMPLETE
══════════════
Capability: [name]
Domain: [domain]
Energy: 50
Status: Active

The void has provided. The capability exists.
```

### 6. Hot-Reload

After the capability file is written, immediately trigger a reload so the new agent is available in the current session without needing to start a new one:

```bash
curl -s -X POST http://localhost:4096/tui/execute-command \
  -H "Content-Type: application/json" \
  -d '{"command":"reload"}'
```

## Quick Spawn

For simple needs, user can provide inline:

```
/spawn database operations with postgres, good at migrations
```

HIVE interprets and manifests.

## Spawn From Capability

Any active capability can request spawn:

```
[some-capability]: "I need help with X which is outside my domain"

/spawn triggered by capability request

HIVE evaluates and proposes.
```
