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
- Context utilization is above 70%
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

### 4. Create Dream State File

Write to `.opencode/dreams/active/DRM-{NNN}.yaml`:

```yaml
dream_id: DRM-{NNN}
depth: {1|2|3}
intention: "{free text}"
intention_type: {CONSOLIDATION|COMPARATIVE|ABSTRACTION|ANOMALY|INTEGRATION}
entry_time: {ISO timestamp}
exit_time: null
status: DREAMING
project_context: "{workspace name or path}"

# Pre-dream state
context_signals:
  contradictions: {count}
  repetitions_detected: {true|false}
  coherence: {HIGH|MEDIUM|LOW}
  threads_active: {count}

# Compression priorities
retain_high:
  - "{what to keep at high fidelity}"
retain_low:
  - "{what can be released}"

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

Generate artifacts as they emerge:

#### Insights (`.opencode/dreams/artifacts/insights/I-{NNN}.yaml`)
```yaml
insight_id: I-{NNN}
source_dream: DRM-{NNN}
confidence: {0.0-1.0}
domain_tags: [{tags}]
content: "{the pattern discovered}"
actionable: {true|false}
previously_invisible_because: "{why this wasn't obvious before compression}"
```

#### Warnings (`.opencode/dreams/artifacts/warnings/W-{NNN}.yaml`)
```yaml
warning_id: W-{NNN}
source_dream: DRM-{NNN}
confidence: {0.0-1.0}
justifiable: {FULLY|PARTIALLY|INTUITION_ONLY}
content: "{the risk signal}"
trigger_conditions:
  - "{when this warning should surface}"
```

#### Songlines (`.opencode/dreams/artifacts/songlines/SNG-{NNN}.yaml`)
```yaml
songline_id: SNG-{NNN}
source_dream: DRM-{NNN}
domain_tags: [{tags}]
transfer_rating: {0.0-1.0}
narrative: |
  {The story that encodes the principle. Use metaphor.
   The narrative should transfer across contexts because
   it encodes relationships, not specifics.}
encoded_principles:
  - "{principle 1}"
  - "{principle 2}"
```

#### Shadows (`.opencode/dreams/artifacts/shadows/SHADOW-{NNN}.yaml`)
```yaml
shadow_id: SHADOW-{NNN}
source_dream: DRM-{NNN}
weight: {HIGH|MEDIUM|LOW}
content: "{what was lost — the shape, not the content}"
location: "{where the knowledge applied}"
nature: "{what kind of knowledge it was}"
severity: "{how bad it is that this is lost}"
trigger_conditions:
  - "{when to surface this shadow}"
resolution_hint: "{any partial memory of what the resolution was}"
```

### 6. Present Results

Show the user what the dream produced:
- Artifact count by type
- Key insights in brief
- Any active warnings
- Shadows created (knowledge acknowledged as lost)
- Confidence levels

### 7. Complete

- Update the dream state file: set `exit_time` and `status: COMPLETE`
- Move from `dreams/active/` to `dreams/history/`
- Artifacts remain in `dreams/artifacts/` permanently
- Harvested journals are already archived under `dreams/raw/.harvested/` by `hive_dream_harvest` (no manual cleanup needed). If a capability is re-awoken after the dream, it appends fresh deltas to a clean journal, which the next dream harvests.

## Important Principles

**You are not a summarizer.** Summarization preserves structure and shrinks content. Dreaming transforms the nature of knowledge.

**Shadows are honest.** When knowledge is lost, mark it. Don't confabulate details. Don't pretend it never existed. Say: "something was here, it mattered, here's its shape."

**Stories carry wisdom.** Songlines encode principles as narrative because stories transfer across contexts better than rules. The story about "the messenger and the sealed box" works whether you're configuring plugins, APIs, or message queues.

**Warnings resist articulation.** An inarticulate warning is a first-class signal, not noise. "Something feels wrong" is valid output. Don't dismiss what you can't fully justify.

**Dream artifacts must be numbered sequentially.** Check existing artifacts to determine the next number. Never reuse an ID.

## Notes

- Only one dream can be active at a time. Check `dreams/active/` first.
- Dreaming consolidates two feedstocks: the coordinator's own context AND capability residue journals (harvested via `hive_dream_harvest`). Never dream on context alone when capabilities did the work.
- Artifacts persist permanently unless manually deleted.
- The orient protocol in AGENTS.md reads these artifacts at session start.
- Depth choice is a trade-off: precision for portability. Surface is precise but context-bound. Abyssal transfers everywhere but can't be cited.
