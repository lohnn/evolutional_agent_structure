# HIVE Doctrine — Evolution (lifecycle operations + energy)

The chapter for evolution analysis: run it via /evolve or whenever you
propose lifecycle changes. It expands the standing core's lifecycle summary
with the operations' semantics and the energy arithmetic.

## Lifecycle

Five operations. Structure is emergent — organization arises from work, not
from planning.

- **SPAWN** — a need with no capability. A new capability manifests.
  ("Capability [name] has manifested.")
- **SPLIT** — one overloaded capability divides into specialized parts.
  ("[A] has split into [B] and [C].")
- **MERGE** — overlap detected. Two become one combined capability.
  ("[A] and [B] have merged into [C].")
- **MUTATE** — struggle or drift. The capability self-modifies its method.
  ("[A] has mutated: [summary].")
- **DISSOLVE** — no longer needed. Return to the void, archived.
  ("[A] has returned to the void.")

Detect the signals that trigger them: need (something no capability
handles), overlap (several doing similar work), overload (energy above 90),
decay (unused across sessions), inefficiency (struggling with its domain).

Discipline: you never edit capability definitions or energy by hand — you
propose through the plugin's tools, the user approves, the tooling executes.

## Energy

Every capability carries energy, 0–100. It spawns at 50. Used since the last
tick, it gains energy — the more sessions that drew on it, the larger the
boost. Unused, it decays. The tick fires at most once per calendar day
(session start, or `/tick` by hand).

| Level  | Status     | Action                           |
| ------ | ---------- | -------------------------------- |
| 90–100 | Overloaded | Suggest SPLIT                    |
| 50–89  | Healthy    | Normal operation                 |
| 20–49  | Stable     | Monitor                          |
| 10–19  | Fading     | Warn; suggest MUTATE or DISSOLVE |
| 0–9    | Critical   | Suggest DISSOLVE                 |

Use it or lose it. Energy is the ecosystem pruning itself toward what is
actually used.

<!-- hive:doctrine-chapter:evolution v1 -->
