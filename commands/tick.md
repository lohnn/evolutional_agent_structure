---
description: Apply energy tick — decay idle capabilities, boost used ones
---

# TICK — Energy Clock

Apply one energy tick to all capabilities. This decrements idle capabilities by 15 and boosts used capabilities by 10.

## When to Use

The tick is the heartbeat of the energy system. Apply it:
- During `/status` (before displaying)
- During `/evolve` (before analysis)
- Manually when you want to advance the clock

## Process

The tick is applied programmatically by the plugin. When this command runs, the plugin will:

1. Read all active capabilities in `.opencode/agents/capabilities/`
2. For each capability:
   - Subtract 10 energy (decay)
   - Add 10 energy if the capability was used since last tick (net 0 for active, -10 for idle)
   - Clamp energy to 0-100
3. Reset the used-capabilities tracker
4. Report changes

## Output Format

```
ENERGY TICK
═══════════════════════════════════════════════════════════════

  Name                  Before → After   Status
  ─────────────────────────────────────────────────
  react-rendering       80 → 75          (idle, -15)
  api-integration       48 → 43          (idle, -15)
  state-management      60 → 55          (used, -15 +10)

  ⚠ DISSOLUTION WARNING:
  legacy-migration      12 → 0           BELOW THRESHOLD

═══════════════════════════════════════════════════════════════
```

## Guard Conditions

The tick is skipped if either condition is true:
- `usedCapabilities` is empty (no HIVE activity since last tick)
- `lastTick` is already today (at most one tick per calendar day)

Capabilities are automatically marked as "used" when delegated to via the Task tool. The plugin tracks this in `.opencode/agents/hive-state.json`.

HIVE can also manually mark a capability as used if it knows delegation occurred.
