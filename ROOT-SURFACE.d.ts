// Intentionally empty ambient marker.
// The OpenCode plugin TypeScript surface (src/, test/) was retired 2026-11-27;
// the repo root owns no TypeScript any more. This file exists only so that
// `npx tsc --noEmit` at the root exits 0 — TypeScript 6 hard-errors on an empty
// include/files list (TS18002/TS18003). The real TS gates are per-package in
// dsh-hive/ (pnpm -r build + each package's own tsconfig).
