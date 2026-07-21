/**
 * A tiny, dependency-free keyed DOM morph.
 *
 * Why it exists (bug fix, 2026-07-20): the viewer used to refresh via
 * `<meta http-equiv="refresh">`, rebuilding the ENTIRE document every 15s.
 * That wholesale rebuild caused (1) a visible flicker on every poll and
 * (2) destruction of transient UI state — an expanded "+ new item" form and
 * anything typed into it collapsed on refresh (W-034: per-item ephemeral state
 * does not survive when the tree it lives on is swapped).
 *
 * The fix is to diff the freshly-rendered board against what is already on
 * screen and mutate ONLY what changed, leaving untouched nodes — and the
 * browser-owned transient state riding on them (open <details>, focus,
 * input/textarea/select values + selection, scroll position) — in place.
 *
 * This is deliberately small: it handles the node shapes this app emits
 * (elements, text, keyed lists) and nothing more. It is NOT a general vdom.
 *
 * Preservation rules applied while morphing:
 *  - `<details>` open/closed state is user-owned; never overwritten from markup.
 *  - Form field VALUES (input/textarea/select) and the currently-focused
 *    element's selection are preserved — a poll must never clobber typing.
 *  - Keyed children (`data-key`) are matched by key so reorders/insertions
 *    don't recreate surviving cards.
 *  - Scroll position survives implicitly: we never detach the scroll container.
 */

/** True for form controls whose live value is user state, not markup state. */
function isFormField(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

/** Capture the focus + selection so a morph of that subtree can restore it. */
interface FocusSnapshot {
  key: string | null
  name: string | null
  start: number | null
  end: number | null
}

function snapshotFocus(root: Element): FocusSnapshot | null {
  const active = (root.ownerDocument.activeElement as Element | null) ?? null
  if (!active || !root.contains(active)) return null
  let start: number | null = null
  let end: number | null = null
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    try {
      start = active.selectionStart
      end = active.selectionEnd
    } catch {
      /* some input types disallow selection reads — ignore */
    }
  }
  return {
    key: keyPath(active, root),
    name: active.getAttribute("name"),
    start,
    end,
  }
}

/** A stable-ish locator for the focused field: nearest data-key ancestor + name. */
function keyPath(el: Element, root: Element): string | null {
  let cur: Element | null = el
  while (cur && cur !== root) {
    const k = cur.getAttribute("data-key")
    if (k) return k
    cur = cur.parentElement
  }
  return null
}

function restoreFocus(root: Element, snap: FocusSnapshot | null): void {
  if (!snap) return
  const scope =
    snap.key !== null ? (root.querySelector(`[data-key="${cssEscape(snap.key)}"]`) ?? root) : root
  const selector = snap.name ? `[name="${cssEscape(snap.name)}"]` : null
  const target = selector ? scope.querySelector(selector) : null
  if (target instanceof HTMLElement) {
    target.focus()
    if (
      (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
      snap.start !== null
    ) {
      try {
        target.setSelectionRange(snap.start, snap.end ?? snap.start)
      } catch {
        /* ignore unsupported input types */
      }
    }
  }
}

function cssEscape(s: string): string {
  // CSS.escape isn't guaranteed everywhere; our keys/names are simple tokens,
  // but escape quotes/backslashes defensively for the attribute selector.
  return s.replace(/["\\]/g, "\\$&")
}

/** Morph `from` (live) to look like `to` (freshly rendered), in place. */
export function morph(from: Element, to: Element): void {
  const focus = snapshotFocus(from)
  morphElement(from, to)
  restoreFocus(from, focus)
}

function morphElement(from: Element, to: Element): void {
  if (from.tagName !== to.tagName) {
    from.replaceWith(to)
    return
  }
  morphAttributes(from, to)
  morphChildren(from, to)
}

function morphAttributes(from: Element, to: Element): void {
  // <details> open is user-owned: never let re-rendered markup toggle it.
  const preserveOpen = from.tagName === "DETAILS"

  // Live form-field values are user state; the freshly-rendered markup carries
  // only placeholder/default values, so don't stamp them back over typing.
  const isField = isFormField(from)

  for (const attr of Array.from(to.attributes)) {
    if (preserveOpen && attr.name === "open") continue
    if (isField && (attr.name === "value")) continue
    if (from.getAttribute(attr.name) !== attr.value) from.setAttribute(attr.name, attr.value)
  }
  for (const attr of Array.from(from.attributes)) {
    if (preserveOpen && attr.name === "open") continue
    if (isField && attr.name === "value") continue
    if (!to.hasAttribute(attr.name)) from.removeAttribute(attr.name)
  }

  // A <select> renders its selection via a child <option selected>; leave the
  // live selected value alone (option morphing below also guards `selected`).
}

function keyOf(node: Node): string | null {
  return node instanceof Element ? node.getAttribute("data-key") : null
}

function morphChildren(from: Element, to: Element): void {
  const oldChildren = Array.from(from.childNodes)
  const newChildren = Array.from(to.childNodes)

  // Index surviving keyed old children so we can move rather than recreate.
  const keyed = new Map<string, Element>()
  for (const c of oldChildren) {
    const k = keyOf(c)
    if (k !== null) keyed.set(k, c as Element)
  }

  let oldIdx = 0
  for (const newChild of newChildren) {
    const newKey = keyOf(newChild)

    if (newKey !== null && keyed.has(newKey)) {
      // Keyed match: reuse the existing node (preserving its subtree state),
      // move it into position if needed, then morph it.
      const match = keyed.get(newKey)!
      keyed.delete(newKey)
      const atPos = from.childNodes[oldIdx]
      if (atPos !== match) from.insertBefore(match, atPos ?? null)
      morphNode(match, newChild)
      oldIdx = indexOf(from, match) + 1
      continue
    }

    // Unkeyed (or new key): try to reuse the node currently at this position
    // when it's a compatible, unkeyed same-tag node; else insert a clone.
    const current = from.childNodes[oldIdx] ?? null
    if (
      current &&
      keyOf(current) === null &&
      compatible(current, newChild)
    ) {
      morphNode(current, newChild)
      oldIdx++
    } else {
      from.insertBefore(newChild.cloneNode(true), current)
      oldIdx++
    }
  }

  // Drop any leftover old nodes beyond the new list length.
  while (from.childNodes.length > oldIdx) {
    from.removeChild(from.childNodes[oldIdx]!)
  }
}

function indexOf(parent: Element, node: Node): number {
  return Array.prototype.indexOf.call(parent.childNodes, node)
}

function compatible(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false
  if (a.nodeType === Node.ELEMENT_NODE) return (a as Element).tagName === (b as Element).tagName
  return true // text/comment nodes are morphable in place
}

function morphNode(from: Node, to: Node): void {
  if (from.nodeType === Node.ELEMENT_NODE && to.nodeType === Node.ELEMENT_NODE) {
    morphElement(from as Element, to as Element)
    return
  }
  if (from.nodeType === Node.TEXT_NODE || from.nodeType === Node.COMMENT_NODE) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue
    return
  }
  // Fallback: replace outright.
  ;(from as ChildNode).replaceWith(to.cloneNode(true))
}
