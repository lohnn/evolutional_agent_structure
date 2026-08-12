# HIVE Plugin — Cleanup / Refactor Backlog

This file tracks concrete cleanup and refactor items surfaced during development.
Items graduate out (are deleted from this list) once implemented and verified.
Do not add speculative work here — only items with a clear diagnosis and action.

---

## Open items

### 1. Investigate vestigial `snapshotChanged` call in `session.created`
**File:** `src/hooks.ts`, `createEventHook`
**Status:** Computes a result but does nothing with it.

```ts
const currentSnapshot = await snapshotAgentsMtime(projectAgentsPath)
if (snapshotChanged(getLastSnapshot(), currentSnapshot)) {
  setLastSnapshot(currentSnapshot)   // ← updates state, but no action follows
}
```

The actual hot-reload is driven by `file.watcher.updated` → `ns.handleFileChange()`. The
`snapshotChanged` branch here updates `lastSnapshot` silently but never triggers a reload or
notification. This looks like the residual half of a former "reload on new session if files changed"
feature that was later replaced by the file-watcher path.

**Action:** Either (a) remove the entire `snapshotChanged` branch and the `getLastSnapshot` /
`setLastSnapshot` plumbing from `HooksContext` if the file-watcher path is sufficient, or (b)
wire a reload/notification action when `snapshotChanged` is true (restoring the original intent).
Verify first whether `file.watcher.updated` fires reliably in all deployment scenarios (e.g. remote
mounts), which may be why the session-based snapshot check existed as a fallback.

---

## Graduated (WI-070, 2026-08-11)

Three items left this list when session identity was rebuilt on the server's parent chain
(`src/lib/session-identity.ts` + `NervousSystem.ensureIdentity`). Recorded here rather than
deleted silently, because each one turned out to be a face of the same defect:

- **`setParent()` never called** — deleted. It existed to repair a group link that
  `registerSession` was guessing; the group is now resolved authoritatively at registration, so
  there is nothing to repair after the fact.
- **`pruneAwakeSessions()` dead code** — replaced by `pruneAwake()` (pure, in
  `session-identity.ts`), called from `loadPersistedState`. It prunes REFERENTIALLY (an awake id
  whose registry record was dropped), never by age or by absence from an enumeration.
- **Cross-project routing woke the wrong coordinator** — the fallback that selected "any
  non-capability session" is gone. `selectWakeTarget` resolves the wake's target and its content
  from one group resolution and SUPPRESSES when the owner cannot be established (I-227).
