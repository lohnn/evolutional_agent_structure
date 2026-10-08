/**
 * The optional-peer service read (W-090 pattern, smoke-hardened 2026-10-07).
 *
 * Live-learned in the token-economy smoke: a strict cordis host REFUSES
 * undeclared service reads — the reflecting proxy throws "cannot get
 * property <name> without inject" even when the service is mounted and
 * healthy, because the plugin's inject map does not declare it. Declaring
 * the peer would hard-couple the plugins (an unmounted dream plugin would
 * hold this service's boot), so optional peers must be read WITHOUT inject:
 *
 * Single mechanism: `ctx.get(name)` — cordis' sanctioned accessor, no
 * inject requirement; `undefined` when the service is not (yet) provided,
 * and correctly undefined after a provide/dispose cycle (a raw property
 * read would see the STALE value — learned against the harness in the same
 * smoke). A ctx without a `get` degrades to undefined.
 *
 * Never throws; `undefined` always means "peer absent", which callers treat
 * as feature-degradation (fs fallback, missing pointers), never an error.
 */
export function optionalService<T = unknown>(ctx: unknown, name: string): T | undefined {
  try {
    const getter = (ctx as { get?: unknown }).get
    if (typeof getter === "function") {
      const viaGet = (getter as (this: unknown, n: string, strict?: boolean) => unknown).call(ctx, name)
      return viaGet === undefined ? undefined : (viaGet as T)
    }
    return undefined
  } catch {
    return undefined
  }
}
