/**
 * Energy thresholds from the HIVE lifecycle: dissolve below, split above.
 *
 * Split out of capabilities.ts (which pulls node:fs) so the rendering layer can
 * import these constants without dragging server-only I/O into the browser
 * bundle. capabilities.ts re-exports them, so its public surface is unchanged.
 */
export const DISSOLVE_THRESHOLD = 10
export const SPLIT_THRESHOLD = 90
