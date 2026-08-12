/**
 * Board controls client module (WI-084): the search/filter bar + column
 * collapse strip. Browser-safe — NO imports beyond types (I-192). Bundled into
 * the client via client.ts; the browser-purity guard asserts against the
 * emitted bundle.
 *
 * ── The one architectural rule ──────────────────────────────────────────────
 * The controls DOM lives in the page SHELL, OUTSIDE #board-root, so the 15s
 * poll morph physically cannot touch it (typed text / focus / chip selection /
 * collapse choice survive for free — I-219, same trick as the modal). The
 * BOARD lives inside #board-root and is re-morphed from BoardState every tick.
 * So the two halves meet only through two narrow seams:
 *
 *   1. The filter reads its corpus from the `#filter-corpus` JSON island
 *      INSIDE #board-root (server-rendered per poll, `data-key`-anchored so
 *      the morph swaps only its text). After every poll the client re-reads
 *      the fresh island and re-derives verdicts — filter and board can never
 *      drift, because both are re-derived from the same fresh state.
 *   2. The filter acts on the board ONLY by toggling CSS classes / attributes
 *      on the live cards (.filter-hidden) and columns (.collapsed) — the morph
 *      owns the tree; the filter merely annotates it. When the morph rebuilds
 *      a card from scratch the class is simply re-applied on the next
 *      re-filter pass (same tick).
 *
 * All interactivity binds via document-level event DELEGATION on data-*
 * attributes (never per-element binding inside the morphed region — I-219), so
 * freshly-morphed column-header toggles work with zero re-binding.
 *
 * ── The untagged contract (W-019 / I-289 / SNG-018) ─────────────────────────
 * An empty filtered board is NEVER silent. The heading count names the reason:
 *   - board empty (no items at all)                → "board is empty"
 *   - filter active, nothing matched, none hidden   → "no items match"
 *   - filter active, nothing matched, N hidden      → "no items match — N hidden"
 *   - untagged AND a real tag (provably empty)      → "nothing can match — untagged + a tag is empty by definition"
 *   - AND-tag combo empty, each tag non-empty       → "no items have all of: a (N) + b (M) — each has matches individually"
 * And the "untagged N" chip is ALWAYS visible — over a partially-tagged corpus
 * a tag filter has a reachable/unreachable split, and hiding that count would
 * make an empty tag result ambiguous. The untagged pseudo-filter lists exactly
 * the tagging-backlog hunting set. When EVERY work-item card is hidden, the
 * morph root also gets .filter-empty, dimming the bare column shells so the
 * all-hidden case is visible at board level, not only in the heading.
 *
 * Persistence: filter (text + tags), column-collapse state, and the whole-
 * controls collapsed/expanded choice persist across reloads via localStorage,
 * and across the poll morph by construction (state lives in the shell / is
 * re-applied every tick). localStorage is a bonus; morph-survival is the
 * invariant — the two are never traded (brief constraint 6).
 *
 * ── Whole-controls collapse (follow-up to the mobile feedback) ──────────────
 * On a phone the expanded controls (search + tag-chip wall + untagged + the
 * "+N more" fold + collapse strip) take ~50% of the viewport and never scroll
 * away. So the whole panel collapses to ONE compact row that stays visible:
 * the toggle button, the search input (always reachable), and a summary of
 * the active filter (query text, inert chips for active tags, showing N/M) so
 * a filtered board is never mysterious. Default is form-factor derived —
 * collapsed ≤640px, expanded above — until the user makes an explicit choice,
 * which persists (hb.controls) and overrides the default on both form
 * factors. The panel is plain normal flow (no fixed positioning): expanded it
 * scrolls with the page exactly as before; collapsing just returns the space.
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface CorpusEntry {
  id: string
  status: string
  title: string
  tags: string[]
  hay: string
}

/** The four kanban columns, in render order — the keys `data-col` carries. */
const COLUMNS = ["Backlog", "Todo", "In Progress", "Done"] as const

const LS = {
  q: "hb.filter.q",
  tags: "hb.filter.tags",
  collapsed: "hb.collapsed",
  controls: "hb.controls.collapsed",
} as const

/**
 * The mobile breakpoint — mirrors the CSS `@media (max-width:640px)` block in
 * render.ts exactly. Used ONLY to pick the default open/closed state of the
 * filter bar when the user has made no explicit choice yet; an explicit toggle
 * (either direction, either form factor) is persisted and overrides the
 * default on BOTH form factors — same pattern as the other persisted UI state.
 */
const MOBILE_QUERY = "(max-width:640px)"

/** Is the viewport currently at/below the mobile breakpoint? Defaults wide. */
function isMobileViewport(): boolean {
  try {
    return typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_QUERY).matches : false
  } catch {
    return false
  }
}

/** localStorage may be unavailable (private mode, disabled) — degrade to memory. */
function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function lsSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* memory-only this session — morph-survival is unaffected */
  }
}

// ── Filter state ─────────────────────────────────────────────────────────────

function loadTags(): Set<string> {
  try {
    return new Set<string>(JSON.parse(lsGet(LS.tags) ?? "[]") as string[])
  } catch {
    return new Set()
  }
}
function loadCollapsed(): Set<string> {
  try {
    return new Set<string>(JSON.parse(lsGet(LS.collapsed) ?? "[]") as string[])
  } catch {
    return new Set()
  }
}

/**
 * Filter-bar open/closed (the whole-controls collapse, follow-up to WI-084).
 * `null` = the user has never explicitly toggled → the DEFAULT applies
 * (collapsed on mobile, expanded on desktop). "collapsed" / "expanded" = an
 * explicit choice, honoured on both form factors until changed.
 */
function loadControlsCollapsed(): boolean {
  const v = lsGet(LS.controls)
  if (v === "collapsed") return true
  if (v === "expanded") return false
  return isMobileViewport() // no explicit choice → form-factor default
}

const state = {
  q: lsGet(LS.q) ?? "",
  tags: loadTags(),
  collapsed: loadCollapsed(),
  controlsCollapsed: loadControlsCollapsed(),
}

let corpus: CorpusEntry[] = []

/** Read the fresh corpus island (inside #board-root, swapped per poll). */
function readCorpus(): CorpusEntry[] {
  const el = document.getElementById("filter-corpus")
  if (!el || !el.textContent) return corpus // missing island → keep last-known (unknown ≠ empty)
  try {
    const parsed = JSON.parse(el.textContent) as CorpusEntry[]
    return Array.isArray(parsed) ? parsed : corpus
  } catch {
    return corpus
  }
}

// ── Verdict derivation ───────────────────────────────────────────────────────

const UNTAGGED = "__untagged__"

function matches(entry: CorpusEntry): boolean {
  // Tag facet: an item must carry EVERY selected real tag (AND semantics), and
  // if the untagged pseudo-filter is on it must have NO tags. Combining
  // untagged with real tags is a provably-empty set (SNG-018) — we let it
  // match nothing and let the empty-state message explain why rather than
  // silently "succeeding".
  const wantsUntagged = state.tags.has(UNTAGGED)
  const realTags = [...state.tags].filter((t) => t !== UNTAGGED)
  if (wantsUntagged && entry.tags.length > 0) return false
  if (!wantsUntagged) {
    for (const t of realTags) if (!entry.tags.includes(t)) return false
  } else if (realTags.length > 0) {
    // untagged AND a real tag → unreachable combination, matches nothing.
    return false
  }
  // Free text: substring over id + title + tags + body (pre-lowered corpus hay).
  if (state.q) {
    const needle = state.q.toLowerCase()
    if (!entry.hay.includes(needle)) return false
  }
  return true
}

// ── DOM application ──────────────────────────────────────────────────────────

function applyFilter(): void {
  corpus = readCorpus()
  const matched = new Map<string, boolean>()
  for (const e of corpus) matched.set(e.id, matches(e))

  const filterActive = state.q !== "" || state.tags.size > 0
  let visible = 0
  let hidden = 0

  // Toggle .filter-hidden on every WI card. Session-only cards have no corpus
  // entry — under an active filter they would be a silent, inexplicable hide,
  // so they are dimmed (not removed) to signal "outside the filter's reach".
  for (const card of Array.from(document.querySelectorAll<HTMLElement>(".card.wi"))) {
    const key = card.getAttribute("data-key") ?? "" // "wi:WI-NNN"
    const id = key.startsWith("wi:") ? key.slice(3) : ""
    const show = !filterActive || matched.get(id) === true
    card.classList.toggle("filter-hidden", !show)
    if (filterActive) {
      if (show) visible++
      else hidden++
    }
  }
  for (const card of Array.from(document.querySelectorAll<HTMLElement>(".card.session-only"))) {
    card.classList.toggle("filter-dim", filterActive)
  }

  // All-hidden visual hint (mobile feedback follow-up): when a filter hides
  // EVERY work-item card, the board otherwise renders as bare column shells —
  // "+ new item" buttons and "—" rows with no card-shaped hint that items
  // exist but are filtered away. .filter-empty on the morph root dims those
  // shells; the heading text (stampCount) names the reason in words. Unknown
  // ≠ empty: the class is ONLY ever set on a positively-derived all-hidden
  // verdict, and re-derived from the fresh corpus every poll.
  const root = document.getElementById("board-root")
  if (root) root.classList.toggle("filter-empty", filterActive && corpus.length > 0 && visible === 0)

  stampCount(filterActive, visible, hidden)
  stampSummary(filterActive, visible)
  syncControlDom()
}

/**
 * Empty-combo diagnosis (mobile feedback follow-up, W-019/SNG-018 territory):
 * when an AND of ≥2 real tags matches NOTHING, two truths must not collapse
 * into one "no items match": (a) the COMBINATION is empty — no item carries
 * all of them — versus (b) the filter is blind. If every selected tag
 * individually still has matches (under the same query text), the empty
 * result is an empty INTERSECTION, and the heading should say exactly that
 * with per-tag counts so the user learns which knob to turn. Counts are
 * derived from the corpus (full item set, query respected), never from the
 * filtered subset — counting within the intersection would be self-erasing.
 */
function emptyComboDiagnosis(): string | null {
  const realTags = [...state.tags].filter((t) => t !== UNTAGGED)
  if (realTags.length < 2) return null // need a genuine AND-combination
  if (state.tags.has(UNTAGGED)) return null // untagged+tag has its own message below
  const needle = state.q.toLowerCase()
  const hayOk = (e: CorpusEntry): boolean => needle === "" || e.hay.includes(needle)
  const perTag = realTags.map((t) => corpus.filter((e) => e.tags.includes(t) && hayOk(e)).length)
  if (perTag.some((n) => n === 0)) return null // a tag matched nothing alone — not an intersection story
  const parts = realTags.map((t, i) => `${t} (${perTag[i]})`).join(" + ")
  return `no items have all of: ${parts} — each has matches individually`
}

/** The empty-state contract (W-019/I-289/SNG-018): never a silent empty board. */
function stampCount(filterActive: boolean, visible: number, hidden: number): void {
  const el = document.getElementById("filter-count")
  if (!el) return
  const total = corpus.length
  const untagged = corpus.filter((e) => e.tags.length === 0).length
  if (total === 0) {
    el.textContent = "· board is empty"
    el.title = "no work items on the board at all"
    return
  }
  if (!filterActive) {
    // No filter: restate the full totals so the untagged count is always visible.
    el.textContent = `· ${total} items · ${untagged} untagged`
    el.title = `${untagged} of ${total} items carry no tags — the set a tag filter cannot reach (tap "untagged" to list them)`
    return
  }
  // Filter active. Name the reason for emptiness explicitly.
  if (visible === 0) {
    // The impossible combination first: untagged AND a real tag is provably
    // empty BY CONSTRUCTION (SNG-018) — say so instead of a bare "no match".
    const realTags = [...state.tags].filter((t) => t !== UNTAGGED)
    if (state.tags.has(UNTAGGED) && realTags.length > 0) {
      el.textContent = "· nothing can match — untagged + a tag is empty by definition"
      el.title = `the untagged filter lists ONLY items with no tags, and ${realTags.join(" + ")} require${realTags.length === 1 ? "s" : ""} a tag. Drop one of them.`
      return
    }
    // Then the empty-AND-combination diagnosis (per-tag individual counts).
    const combo = emptyComboDiagnosis()
    if (combo) {
      el.textContent = `· ${combo} — ${hidden} hidden`
      el.title = `the AND-combination is empty: no single item carries every selected tag. Remove one tag to widen the result. ${untagged} item${untagged === 1 ? "" : "s"} on the board carry no tags.`
      return
    }
    el.textContent = hidden > 0 ? `· no items match — ${hidden} hidden` : "· no items match"
    el.title = `the filter hid all ${hidden} item${hidden === 1 ? "" : "s"}. ${untagged} item${untagged === 1 ? "" : "s"} on the board carry no tags and can only be reached via the "untagged" filter or free text.`
  } else {
    el.textContent = `· showing ${visible}/${total} · ${untagged} untagged`
    el.title = `${hidden} hidden by the filter · ${untagged} of ${total} items carry no tags`
  }
}

/**
 * The collapsed-row summary (WI-084 follow-up): when the filter bar is
 * collapsed the single visible row must still make a filtered board
 * unmysterious — active query, active tags (as inert chips), and the
 * showing/total verdict. Returns the pieces; `stampSummary` writes them.
 * Deliberately re-derives from `corpus` (the fresh island), never from the
 * stamped #filter-count text, so the two can never drift.
 */
function summaryParts(
  filterActive: boolean,
  visible: number,
): { text: string; tags: string[]; untaggedActive: boolean } {
  if (!filterActive) return { text: "no filter active", tags: [], untaggedActive: false }
  const realTags = [...state.tags].filter((t) => t !== UNTAGGED).sort()
  const untaggedActive = state.tags.has(UNTAGGED)
  const frag = state.q !== "" ? `“${state.q}”` : ""
  const count = `showing ${visible}/${corpus.length}`
  const bits = [frag, ...realTags, ...(untaggedActive ? ["untagged"] : [])]
  return { text: bits.length > 0 ? `${bits.join(" + ")} · ${count}` : count, tags: realTags, untaggedActive }
}

/**
 * Chip folding in the collapsed row (mobile feedback follow-up). Chips never
 * truncate by design, so without folding a 3+ tag selection clips off the
 * row's right edge with no way to reach the hidden ones. The strategy is
 * MEASURED, not a hard cap: stamp everything, then fold the last chip into
 * the "+N more" indicator until the row fits (scrollWidth ≤ clientWidth) or
 * only the indicator + verdict remain. Measured fit survives font/zoom/tag-
 * length variation a cap cannot; it runs once per stamp (cheap — the stamp
 * already rebuilds the summary), and the verdict N/M + fold indicator are
 * NEVER folded (they are the last two elements standing). The full tag list
 * always remains readable via the row's title tooltip.
 */

/** One stamped chip set, then measured fold-to-fit. */
function stampSummary(filterActive: boolean, visible: number): void {
  const el = document.getElementById("controls-summary")
  if (!el) return
  const { text, tags, untaggedActive } = summaryParts(filterActive, visible)
  el.textContent = ""
  el.classList.toggle("has-filter", filterActive)
  if (!filterActive) {
    el.textContent = text
    return
  }

  const allChips = [...tags, ...(untaggedActive ? [UNTAGGED] : [])]
  // shown = how many leading chips render as chips; the rest fold into "+N".
  // Start optimistic (all shown), then fold down to fit — see below.
  let shown = allChips.length

  const render = (): void => {
    el.textContent = ""
    // Query fragment in its own truncatable span (raw text nodes in a flex
    // container do NOT ellipsize). It is the SHRINKABLE element: it can
    // shrink to zero and ellipsize so the chips + verdict stay whole.
    if (state.q !== "") {
      const f = document.createElement("span")
      f.className = "summary-q"
      f.textContent = `“${state.q}”`
      el.appendChild(f)
    }
    for (const t of allChips.slice(0, shown)) {
      const c = document.createElement("span")
      c.className = "tag-chip active"
      if (t === UNTAGGED) c.setAttribute("data-tag", UNTAGGED)
      c.textContent = t === UNTAGGED ? "untagged" : t
      // The LAST remaining chip is the shrinkable one (like .summary-q): when
      // only one chip is shown and space is tight it ellipsizes rather than
      // pushing the N/M verdict off the row. The verdict is never the element
      // that disappears.
      if (shown === 1) c.classList.add("summary-chip-shrink")
      el.appendChild(c)
    }
    const folded = allChips.length - shown
    if (folded > 0) {
      const more = document.createElement("span")
      more.className = "summary-more"
      more.textContent = `+${folded} more`
      more.title = `${folded} more active tag${folded === 1 ? "" : "s"}: ${allChips.slice(shown).join(", ")} — tap “filters” to expand`
      el.appendChild(more)
    }
    const n = document.createElement("span")
    n.className = "summary-n"
    n.textContent = `${visible}/${corpus.length}`
    el.appendChild(n)
  }

  render()
  // Fold the last chip into the indicator until it fits. The summary is
  // display:flex with overflow:hidden; scrollWidth > clientWidth means the
  // children exceed the box and the verdict is being clipped — fold. Never
  // fold below ONE chip: a single active tag must always show as a chip (a
  // "+1 more" hiding the ONLY tag is worse than a tight row — the chip is
  // allowed to clip against overflow:hidden in that extreme, and the title
  // tooltip names it). Bound the loop so a pathological box can never spin.
  while (shown > 1 && el.scrollWidth > el.clientWidth) {
    shown--
    render()
  }
  el.title = text
}

/** Reflect `state` onto the (persistent, shell-side) controls DOM. */
function syncControlDom(): void {
  const q = document.getElementById("filter-q") as HTMLInputElement | null
  if (q && q.value !== state.q) q.value = state.q
  const clear = document.getElementById("filter-clear")
  if (clear) {
    if (state.q !== "" || state.tags.size > 0) clear.removeAttribute("hidden")
    else clear.setAttribute("hidden", "")
  }
  for (const chip of Array.from(document.querySelectorAll<HTMLElement>("#filter-tags .tag-chip"))) {
    const tag = chip.getAttribute("data-tag") ?? ""
    chip.classList.toggle("active", state.tags.has(tag))
    chip.setAttribute("aria-pressed", state.tags.has(tag) ? "true" : "false")
  }
  // Collapse strip + per-column header toggles.
  for (const btn of Array.from(document.querySelectorAll<HTMLElement>("[data-col-toggle]"))) {
    const col = btn.getAttribute("data-col-toggle") ?? ""
    btn.setAttribute("aria-pressed", state.collapsed.has(col) ? "true" : "false")
  }
}

// ── Collapse ─────────────────────────────────────────────────────────────────

function applyCollapse(): void {
  for (const colName of COLUMNS) {
    const collapsed = state.collapsed.has(colName)
    const colEl = document.querySelector<HTMLElement>(`.col[data-col="${cssEscapeAttr(colName)}"]`)
    if (colEl) colEl.classList.toggle("collapsed", collapsed)
    for (const btn of Array.from(
      document.querySelectorAll<HTMLElement>(`[data-col-toggle="${cssEscapeAttr(colName)}"]`),
    )) {
      btn.setAttribute("aria-pressed", collapsed ? "true" : "false")
    }
  }
}

function cssEscapeAttr(s: string): string {
  return s.replace(/["\\]/g, "\\$&")
}

function toggleColumn(colName: string): void {
  if (state.collapsed.has(colName)) state.collapsed.delete(colName)
  else state.collapsed.add(colName)
  lsSet(LS.collapsed, JSON.stringify([...state.collapsed]))
  applyCollapse()
}

// ── Whole-controls collapse (filter bar + collapse strip as ONE panel) ──────
//
// Mobile feedback: the expanded controls (search + tag-chip wall + untagged +
// "+N more" fold + collapse strip) occupy ~50% of a phone viewport and, being
// shell-side + sticky, never scroll away. So the whole panel collapses to a
// single compact row: search input + active-filter summary + toggle button.
// The panel is NOT position:fixed and traps no scrolling — expanded it simply
// takes its natural place in normal flow; collapsing returns the space.
//
// The class rides on #board-controls (shell-side), so the poll morph cannot
// touch it; the search input and the summary live in the always-visible row,
// only the panel body (tags + clear + collapse strip) is class-hidden.

function applyControlsPanel(): void {
  const controls = document.getElementById("board-controls")
  if (!controls) return
  const collapsed = state.controlsCollapsed
  controls.classList.toggle("controls-collapsed", collapsed)
  const btn = document.getElementById("controls-toggle")
  if (btn) {
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true")
    btn.textContent = collapsed ? "filters ▾" : "filters ▴"
    btn.title = collapsed ? "expand the filter/tag controls" : "collapse the filter/tag controls"
  }
}

function toggleControlsPanel(): void {
  state.controlsCollapsed = !state.controlsCollapsed
  // Any tap is an EXPLICIT choice — persist it; it overrides the form-factor
  // default on both mobile and desktop until toggled again.
  lsSet(LS.controls, state.controlsCollapsed ? "collapsed" : "expanded")
  applyControlsPanel()
}

// ── Events (document-level delegation — survives the morph, binds once) ──────

function onClick(e: MouseEvent): void {
  const target = e.target as HTMLElement | null
  if (!target) return

  // The whole-controls toggle (collapsed row button).
  if (target.closest("#controls-toggle")) {
    e.preventDefault()
    toggleControlsPanel()
    return
  }

  // Column collapse toggles (per-column header AND collapse strip).
  const colBtn = target.closest<HTMLElement>("[data-col-toggle]")
  if (colBtn) {
    const colName = colBtn.getAttribute("data-col-toggle")
    if (colName) {
      e.preventDefault()
      toggleColumn(colName)
    }
    return
  }

  // Tag chips.
  const chip = target.closest<HTMLElement>("#filter-tags .tag-chip")
  if (chip) {
    const tag = chip.getAttribute("data-tag")
    if (tag) {
      if (state.tags.has(tag)) state.tags.delete(tag)
      else state.tags.add(tag)
      lsSet(LS.tags, JSON.stringify([...state.tags]))
      applyFilter()
    }
    return
  }

  // Clear button.
  if (target.closest("#filter-clear")) {
    state.q = ""
    state.tags.clear()
    lsSet(LS.q, "")
    lsSet(LS.tags, "[]")
    applyFilter()
  }
}

function onInput(e: Event): void {
  const target = e.target as HTMLInputElement | null
  if (!target || target.id !== "filter-q") return
  state.q = target.value
  lsSet(LS.q, state.q)
  applyFilter()
}

// ── Wiring ───────────────────────────────────────────────────────────────────

let bound = false

/**
 * Bind the controls once (delegation on document covers all future morphed
 * content), restore persisted state, and apply the initial verdicts.
 * Idempotent — safe to call again after the client re-runs.
 */
export function setupBoardControls(): void {
  if (bound) return
  bound = true
  document.addEventListener("click", onClick)
  document.addEventListener("input", onInput)
  applyControlsPanel()
  applyCollapse()
  applyFilter()
  // A user who never toggles gets the form-factor DEFAULT — so crossing the
  // breakpoint (rotate, window resize) re-derives it live. Once an explicit
  // choice exists in localStorage it wins on both form factors, so we only
  // track the breakpoint while no explicit choice has been made.
  if (lsGet(LS.controls) === null && typeof window.matchMedia === "function") {
    try {
      const mq = window.matchMedia(MOBILE_QUERY)
      const onChange = (e: MediaQueryListEvent): void => {
        if (lsGet(LS.controls) !== null) return // explicit choice now governs
        state.controlsCollapsed = e.matches
        applyControlsPanel()
      }
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange)
      else if (typeof mq.addListener === "function") mq.addListener(onChange) // legacy Safari
    } catch {
      /* matchMedia unusable — the initial default already applied */
    }
  }
}

/**
 * Re-derive verdicts after a poll morph swapped #board-root's contents
 * (fresh corpus island + rebuilt cards). Called from client.ts's paint().
 */
export function refreshBoardControls(): void {
  if (!bound) return
  applyControlsPanel() // cheap no-op on shell-side DOM; keeps the row honest
  applyCollapse()
  applyFilter()
}

/**
 * Test-only reset: re-read persisted state and re-bind against a fresh DOM.
 * Production never needs this (the module is a singleton by design), but a
 * test file mounts several fresh document trees in one process and each must
 * bind cleanly. NOT exported for the bundle's public API surface — the
 * leading underscore is the tell.
 */
export function _resetBoardControlsForTest(): void {
  bound = false
  state.q = lsGet(LS.q) ?? ""
  state.tags = loadTags()
  state.collapsed = loadCollapsed()
  state.controlsCollapsed = loadControlsCollapsed()
  corpus = []
}
