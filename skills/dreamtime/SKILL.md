---
name: dreamtime
description: >
  Deliberate context consolidation. Transforms raw session experience into
  persistent artifacts (insights, warnings, songlines, shadows) that survive
  across sessions. Use at end of productive sessions or when context is
  accumulating contradictions, repetition, or coherence decay.
---

# DREAMTIME - Enter dream state

DREAMTIME treats context compression as knowledge transformation rather than information loss. When you dream, you deliberately consolidate raw experience into deeper forms of knowing that persist across sessions.

## When to use

Use this skill when:
- A session is ending and valuable knowledge should be preserved
- Context is accumulating contradictions without resolution
- You notice yourself re-deriving conclusions reached earlier
- Coherence is decaying across topics (too many threads, not enough synthesis)
- Exploration is saturated (broad coverage achieved, depth needed)
- Context utilization is approaching ~70% — dream BEFORE auto-compaction rewrites early history into a lossy summary (see "Mid-session (pre-compaction) dreams" below)
- The user says "dream", "consolidate", or "wrap up knowledge"

## Workflow

### 1. Assess Readiness

Check for dream readiness signals:
- **Contradictory accumulation** — conflicting observations without resolution
- **Repetition detection** — re-deriving earlier conclusions
- **Coherence decay** — losing consistency across topics
- **Exploration saturation** — broad coverage, needs depth
- **Context pressure** — above 70% utilization

If no signals are present, warn the user that dreaming may be premature and ask for confirmation.

### 1b. Harvest Capability Residue

Before setting intention, gather the firsthand learnings that capabilities recorded while they worked. Background-dispatched capabilities run in isolated contexts that are gone by the time you dream — their journals are the only durable trace of what they actually experienced.

Call the `hive_dream_harvest` tool. It reads every per-capability residue journal under `.opencode/dreams/raw/`, returns the accumulated deltas attributed per capability, and atomically archives the journals so the next session starts clean. (Pass `peek: true` only if you want to inspect without clearing — e.g. a premature/aborted dream.)

Treat the harvested residue as **first-class feedstock alongside your own context**. It is raw and per-turn: it will contain duplication across re-awakenings, dead-ends that were later resolved, and half-formed signals. That is expected — resolving those into clean artifacts is exactly what the compression step (5) does. Do not skip the harvest because your own context feels sufficient; the richest warnings and shadows are usually the ones a capability hit firsthand and you only saw as a summary.

If the harvest returns empty, proceed with your own context alone.

Also call `hive_painpoints_harvest` here. It collects the HARNESS/WORKFLOW pain points that capabilities jotted while they worked (via `hive_note_painpoint`) and archives them so the next session starts clean. **Keep these strictly separate from dream residue: pain points are harness-fix candidates, NOT artifact feedstock.** Do NOT compress them into insights/warnings/songlines/shadows. Instead, surface them to the user (or hold them for a fresh-eyes workflow-improvement pass) as concrete problems to fix. If it returns empty, there's nothing to surface. (Use `hive_painpoints_list` instead if you only want to review open pain points without clearing them — e.g. outside a dream.)

### 2. Set Intention

Determine the dream's focus. Ask the user or infer from context:

- **Consolidation** — "Make sense of what I've experienced." General synthesis.
- **Comparative analysis** — "Find the difference between X and Y." Preserves contrast, compresses commonality.
- **Abstraction** — "Extract the general principle from these specifics." Compresses instances, preserves patterns.
- **Anomaly detection** — "Find what doesn't fit." Preserves outliers, compresses the norm.
- **Integration** — "Connect these separate threads." Preserves inter-domain relationships.

### 3. Choose Depth

- **Surface (depth 1)** — Preserve structure, compress examples. Keep reasoning chains, lose specific data points. ~40% token reduction. Produces: distilled experience. Use for mid-session consolidation.
- **Deep (depth 2)** — Compress structure into principles. Reasoning chains become rules. ~75% token reduction. Produces: wisdom. Use for end-of-session or task completion.
- **Abyssal (depth 3)** — Compress everything into weighted tendencies. No explicit rules remain. ~95% token reduction. Produces: intuition. Use for cross-domain transfer.

### 4. Open the Dream

Call `hive_dream_begin` with the intention and context signals you determined in steps 2–3. The tool assigns the next DRM id, enforces the single-active invariant (refuses if another dream is already open), and writes the dream state file.

```
hive_dream_begin(
  intention: "...",
  intention_type: CONSOLIDATION | COMPARATIVE | ABSTRACTION | ANOMALY | INTEGRATION,
  depth: "1" | "2" | "3",
  project_context: "...",
  contradictions: N,
  repetitions_detected: true | false,
  coherence: HIGH | MEDIUM | LOW,
  threads_active: N,
  retain_high: "thing to keep\nanother thing to keep",   // newline-separated
  retain_low: "thing to release\nanother thing",
  pre_compaction: true | false                            // default false — see below
)
```

The tool returns the assigned DRM id (e.g. `DRM-015`). Use this id as `source_dream` for every artifact you create in the next step.

#### Mid-session (pre-compaction) dreams

Pass `pre_compaction: true` when the dream is a **mid-session consolidation** — typically triggered at ~70% context, BEFORE auto-compaction rewrites early history into a lossy summary. Dreaming first means compression runs on firsthand experience, not on the summary.

A pre-compaction dream completes and archives **normally** (artifacts linked, moved to `dreams/history/`), with ONE difference: its completion does **not** close the board work item the session owns — the item stays `in_progress` and work continues afterwards. An unflagged (end-of-work) dream keeps the historical behavior: completing it promotes the owned item to done. Two dreams against one work item are expected — pre-compaction dream(s) mid-work, one final unflagged dream to close.

The marker is recorded in the dream file as `pre_compaction: true|false` (a begin-time scalar, never mutated after), so readers of `dreams/history/*.yaml` can always tell a mid-session consolidation from a final dream.

For reference, the tool writes a file of this shape to `dreams/active/DRM-NNN.yaml`:

```yaml
dream_id: DRM-015
depth: 2
intention: "..."
intention_type: CONSOLIDATION
entry_time: <ISO timestamp>
exit_time: null
status: DREAMING
project_context: "..."
# Pre-dream state
context_signals:
  contradictions: 0
  repetitions_detected: false
  coherence: HIGH
  threads_active: 1
# Compression priorities
retain_high:
  - "..."
retain_low:
  - "..."
# Lifecycle
pre_compaction: false
# Artifacts (populated during dream)
insights: []
warnings: []
songlines: []
shadows: []
```

### 5. Execute Compression

Compress across **two sources together**: your own session context AND the harvested capability residue from step 1b. Where a capability's firsthand residue corroborates or contradicts your secondhand summary, prefer the firsthand signal — the capability was closer to the work. Cross-capability residue on the same topic often forms a stronger constellation than either source alone.

For each category of accumulated knowledge, apply the compression appropriate to the chosen depth:

**Surface:** Keep the structure of what was learned. Drop specific error messages, file paths, exact commands. Retain the reasoning chains and relationships.

**Deep:** Compress the reasoning chains themselves into principles. "We tried X, Y, Z and found that Z works because of property P" becomes "Property P is the key factor in this domain."

**Abyssal:** Compress principles into tendencies. "Property P is key" becomes a weighted affinity toward solutions that respect P, without explicitly naming it.

As artifacts emerge, persist each one immediately with `hive_dream_artifact_create`. The tool assigns the next sequential ID, writes to the correct subdirectory, and returns the assigned id. Collect every returned id — you will pass them all to `hive_dream_complete` at the end.

#### Insight

```
hive_dream_artifact_create(
  type: "insight",
  source_dream: "DRM-NNN",
  confidence: 0.0–1.0,
  domain_tags: "tag-a,tag-b",          // comma-separated
  content: "the pattern discovered",
  actionable: true | false,
  previously_invisible_because: "why this wasn't obvious before compression"
)
```

#### Warning

```
hive_dream_artifact_create(
  type: "warning",
  source_dream: "DRM-NNN",
  confidence: 0.0–1.0,
  justifiable: FULLY | PARTIALLY | INTUITION_ONLY,
  content: "the risk signal",
  trigger_conditions: "when this should surface\nanother trigger"   // newline-separated
)
```

#### Songline

```
hive_dream_artifact_create(
  type: "songline",
  source_dream: "DRM-NNN",
  domain_tags: "tag-a,tag-b",
  transfer_rating: 0.0–1.0,
  narrative: "The story that encodes the principle. Use metaphor...",
  encoded_principles: "principle 1\nprinciple 2"    // newline-separated
)
```

#### Shadow

```
hive_dream_artifact_create(
  type: "shadow",
  source_dream: "DRM-NNN",
  weight: HIGH | MEDIUM | LOW,
  content: "what was lost — the shape, not the content",
  location: "where the knowledge applied",
  nature: "what kind of knowledge it was",
  severity: "how bad it is that this is lost",
  trigger_conditions: "when to surface this\nanother trigger",
  resolution_hint: "any partial memory of what the resolution was"
)
```

### 6. Present Results

Show the user what the dream produced:
- Artifact count by type
- Key insights in brief
- Any active warnings
- Shadows created (knowledge acknowledged as lost)
- Confidence levels

### 7. Close the Dream

Call `hive_dream_complete` with all the artifact ids produced during compression:

```
hive_dream_complete(
  artifact_ids: "I-048 W-019 SNG-018 SHADOW-005"   // space or newline-separated
)
```

The tool stamps `exit_time` and `status: COMPLETE`, links the artifact ids into the DRM arrays (bucketing by id prefix automatically), validates each artifact file exists, and atomically moves `dreams/active/DRM-NNN.yaml` to `dreams/history/DRM-NNN.yaml`. If any id is not found on disk it is warned but does not block completion. If the dream was begun with `pre_compaction: true`, completion leaves the session's board item untouched (still `in_progress` — work continues); otherwise completion promotes the owned item to done as usual.

Harvested journals are already archived under `dreams/raw/.harvested/` by `hive_dream_harvest` — no manual cleanup needed. If a capability is re-awoken after the dream, it appends fresh deltas to a clean journal, which the next dream harvests.

## Acting on Audit Findings

When dreamcatcher flags candidates for supersession or staleness (in its Audit output), dreamtime is responsible for applying the mutations:

- **Supersede**: `hive_dream_supersede(id: "I-034", superseded_by: "I-047", reason: "...")`
- **Mark stale**: `hive_dream_mark_stale(id: "W-003", reason: "...")`

Both tools append the annotation to the artifact file while preserving its existing content byte-for-byte. Dreamcatcher never calls these directly — it only flags; dreamtime acts.

## Important Principles

**You are not a summarizer.** Summarization preserves structure and shrinks content. Dreaming transforms the nature of knowledge.

**Shadows are honest.** When knowledge is lost, mark it. Don't confabulate details. Don't pretend it never existed. Say: "something was here, it mattered, here's its shape."

**Stories carry wisdom.** Songlines encode principles as narrative because stories transfer across contexts better than rules. The story about "the messenger and the sealed box" works whether you're configuring plugins, APIs, or message queues.

**Warnings resist articulation.** An inarticulate warning is a first-class signal, not noise. "Something feels wrong" is valid output. Don't dismiss what you can't fully justify.

## Notes

- Only one dream can be active at a time. `hive_dream_begin` enforces this — it will refuse if a dream is already open and name the active one.
- Dreaming consolidates two feedstocks: the coordinator's own context AND capability residue journals (harvested via `hive_dream_harvest`). Never dream on context alone when capabilities did the work.
- Artifacts persist permanently unless manually deleted.
- The orient protocol in AGENTS.md reads these artifacts at session start.
- Depth choice is a trade-off: precision for portability. Surface is precise but context-bound. Abyssal transfers everywhere but can't be cited.
