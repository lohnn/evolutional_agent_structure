# HIVE Plugin — Cleanup / Refactor Backlog

This file tracks concrete cleanup and refactor items surfaced during development.
Items graduate out (are deleted from this list) once implemented and verified.
Do not add speculative work here — only items with a clear diagnosis and action.

---

## Open items

### 1. Remove `setParent()` from nervous-system.ts
**File:** `src/lib/nervous-system.ts`
**Status:** Defined and exported, never called externally.

`setParent(childSessionID, coordinatorSessionID)` was intended for explicit coordinator→capability
groupID linking. The auto-assignment in `registerSession` (via `findCoordinatorSession()`) now
covers the same ground implicitly whenever `chat.message` fires for a new capability session.

**Action:** Verify no external caller exists (grep confirmed zero as of the last audit), then delete
the method. Before deleting, confirm that the `registerSession` auto-assignment is reliable across
all observed dispatch patterns — in particular, check whether there's ever a boot-order race where
`findCoordinatorSession()` returns `undefined` at registration time (coordinator not yet registered
when capability registers first).

---

### 2. Wire `pruneAwakeSessions()` — currently a no-op dead-end
**File:** `src/lib/nervous-system.ts`
**Status:** Defined, never called. The `awakeSessions` set grows unboundedly in the persisted
`.nervous-system-state.json`.

`pruneAwakeSessions(keepSessionIDs: Set<string>)` is fully implemented but has no call site.
The persisted awakeSessions set accumulates stale coordinator session IDs across restarts.

**Action:** Decide on a prune policy, then wire a call. Two sensible options:
- **Referential prune:** on `session.created` (which already runs `tickEnergy`), call
  `pruneAwakeSessions` with the set of session IDs currently present in `sessionMap`. This drops
  awake entries for coordinators whose sessions are no longer tracked anywhere.
- **TTL prune:** extend `SessionInfo` with a `createdAt` timestamp and prune entries older than N
  days (e.g. 14). More robust to the case where a coordinator session was evicted from sessionMap
  but is still meaningfully active.

The referential approach is simpler and sufficient for the common case.

---

### 3. Investigate vestigial `snapshotChanged` call in `session.created`
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
