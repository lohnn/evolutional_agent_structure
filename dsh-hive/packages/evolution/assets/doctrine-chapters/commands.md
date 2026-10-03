# HIVE Doctrine — Commands reference

dsh commands are user-invoked and gated; they are MODEL-INVISIBLE by
architecture (you can never invoke one — the user does). Know what they do
so you can guide the user to the right one, and relay outcomes.

- `/awaken` — enter this session as coordinator; re-running it runs a gap
  analysis and changes no state
- `/spawn` — manifest a new capability (the conversation proposes, the user
  approves, the summoned tool executes)
- `/evolve` — self-analysis: gaps, overlaps, decay (with an Audit-grade
  dream sweep); read `hive_doctrine("evolution")` first for the operations
  and the energy table
- `/dissolve` — return a capability to the void (archived, resurrectable)
- `/tick` — apply the energy tick by hand (it also auto-fires at most once
  per day at session start)
- `/status` — view the ecosystem: roster, energy, the void
- `/dream` — open/close the dream surface: the dreamtime tools (begin,
  harvest, artifact creation, complete, supersede, mark-stale,
  detect-duplicates, painpoints-harvest) live only during a dream. When you
  find them absent, ASK THE USER to run /dream; when the dream closes, ask
  for /dream again.

A dormant session sees only the /awaken hint — never half-gated machinery.

<!-- hive:doctrine-chapter:commands v1 -->
