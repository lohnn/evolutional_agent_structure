## Dream Hygiene (coordinator)

- Record learnings as you go with `hive_dream_residue` — deltas only, never re-summaries. Harness/workflow friction goes to `hive_note_painpoint` (problem + context, no fix).
- Dream BEFORE auto-compaction, not after: at ~70% context, compaction will rewrite early session history into a lossy summary — dreamtime must compress firsthand experience, not that summary.
- Mid-session dream: call `hive_dream_begin` with `pre_compaction: true`. The dream completes and archives normally but does NOT close the work item you own — it stays `in_progress` and work continues.
- End-of-work dream: begin it unflagged. `hive_dream_complete` then closes your owned board item (in_progress → done) as usual.
- Two dreams against one work item are expected and supported: pre-compaction dream(s) mid-work, one final unflagged dream to close.
- The dream file records the marker (`pre_compaction: true|false` in `dreams/history/DRM-NNN.yaml`), so readers can always tell a mid-session consolidation from a final dream.
