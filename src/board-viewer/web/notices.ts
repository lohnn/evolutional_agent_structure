/**
 * Ephemeral runtime notices — the server-rendered stand-in for a toast.
 * Used for async failures that happen AFTER a response was already sent
 * (fire-and-forget /awaken, per hive-infra's startItem default). Held in
 * memory, newest first, capped; rendered as a banner on the next page load.
 */
export interface Notice {
  at: string
  text: string
}

const MAX_NOTICES = 5
const notices: Notice[] = []

export function addNotice(text: string): void {
  notices.unshift({ at: new Date().toISOString(), text })
  if (notices.length > MAX_NOTICES) notices.length = MAX_NOTICES
}

export function listNotices(): Notice[] {
  return [...notices]
}

/** Test hook. */
export function clearNotices(): void {
  notices.length = 0
}
