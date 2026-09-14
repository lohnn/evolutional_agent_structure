# dsh-provider-usage — the shared, tabbed usage panel

The **general shape** of the provider usage surface: one sidebar entry ("Usage")
that opens one panel with **one tab per provider**. It owns no provider-specific
logic. Provider plugins ship as separate dsh packages and plug in from both
halves:

| Package | Role |
|---|---|
| `dsh-provider-usage` (**this**) | client: sidebar entry, `main` panel, tab chrome, the `provider-usage.tab` extension seat · host: optional `providerUsage` registry service + `GET /api/provider-usage/providers` debug route |
| `dsh-berget-usage` | one provider plugin: Berget Code seat subscription (its own API client, its own snapshot route, its own tab) |

This split exists so a second provider (e.g. the one on the other machine,
living next to Berget Code there) is just **another provider package** — both
tabs then show up inside the same panel and switch via the tab bar.

## Extension contract

### Client side (required)

Shared boot facts you do NOT need to re-implement: the core's `main`
registration declares the child slot `provider-usage.tab`
(`{ kind: 'list', scope: 'root' }`). Your client half registers one list entry
there — the same pattern the shell's own `sidebar.panellist` uses:

```js
// my-provider/client.js (the dsh client-module contract)
window.__ModuleLoader__.load({
  id: 'dsh-my-usage',
  factory: (require) => {
    const React = require('react');

    function MyPanel() {
      // Fetch YOUR snapshot route, render YOUR cards. Self-contained:
      // no props are required; `{ active }` is passed today (always true —
      // only the active tab is mounted).
      return React.createElement('div', { style: { padding: '24px 28px 40px' } }, '…');
    }

    return {
      name: 'dsh-my-usage',
      inject: ['slots', 'timer'],
      apply(ctx) {
        const slots = ctx.get('slots');
        if (slots === undefined) return;
        ctx.effect(() => { /* YOUR <style data-plugin-css="…"> styles */ }, 'my styles');
        slots.inject('provider-usage.tab', () => slots.register(
          { name: 'provider-usage.tab', id: 'my-provider', order: 200, label: 'MyProvider' },
          () => React.createElement(MyPanel),
        ));
      },
    };
  },
});
```

Rules:

- **Never touch `main` or `sidebar.panellist`** — those are the core's.
- `id` (stable slug) must be unique among provider tabs; `order` sorts the tab
  bar (berget uses `100` — pick `200+`); `label` is a plain string shown in the
  tab button.
- Only the **active** tab is mounted (`renderSlot(..., { only: active })`), so
  your component may mount/unmount on every tab switch. Do your own fetch in a
  `useEffect` (mount = initial load; keep any polling inside your own fiber
  via `ctx.interval`).
- If the core client is missing, you may register your own standalone
  `main`/`sidebar.panellist` pair as a fallback — dsh-berget-usage does exactly
  this by checking `window.__DSH_BOOT__.entries` for `dsh-provider-usage`
  before choosing its registration route.

### Host side (optional)

A provider serves **its own** snapshot route under a provider-owned path (its
credential handling and sanitizers stay in the provider package — the core
never abstracts HTTP or tokens). The debug route
`GET /api/provider-usage/providers` answers:

```json
{ "ok": true, "providers": [{ "id": "berget", "label": "Berget",
                               "route": "/api/berget-usage/snapshot", "note": null }] }
```

To appear there, announce from your host half:

```js
// Rides a ctx.inject WAIT — order-agnostic: fires whenever the core provides
// the service, and never runs (harmlessly) on machines without it.
ctx.inject?.(['providerUsage'], (usageCtx) => {
  const providerUsage = usageCtx.get('providerUsage');
  if (!providerUsage || typeof providerUsage.register !== 'function') return;
  usageCtx.effect(() => providerUsage.register({
    id: 'my-provider', label: 'MyProvider', route: '/api/my-provider-usage/snapshot',
  }), 'my providerUsage row');
});
```

The wait (rather than an apply-time `ctx.get` probe) matters because profile
reconcile orders bundle rows by dependency name — on some machines your
plugin applies before this core. The wait keeps the row order-independent
while never parking boot on an absent core (the callback simply never
fires). Register nothing else into `main` or `sidebar.panellist` — your
client tab is covered in the skeleton above.

## Files

- `index.js` — host half: `providerUsage` service + registry route.
- `client.js` — client half: tabbed panel, sidebar entry, `provider-usage.tab` seat.
- `test/` — node-only micro tests (registry state machine, route handler).

## Wiring a machine

The trio (this package, `dsh-berget-usage`, `dsh-berget-refresh`) are
**profile bundles**: each package's `package.json` declares
`dsh.bundle.patch: ./cordis.patch.yml`, which makes the dependency auto-join
the load stack of any profile that has it — no user-patch rows needed.

1. `dsh plugin --profile <name> add /path/to/dsh-hive/packages/<pkg>`
   (or a tarball) — the reconcile adds the dependency **and** the bundle
   layer automatically. A `link:` dependency in the profile's
   `package.json` joins the stack the same way on the next boot.
2. Restart/update the dsh instance for that profile.
3. Add one package per provider (skeleton above) — same bundle mechanics;
   keep any *machine-specific* config (directories, paths) in the profile's
   own `cordis.patch.yml` as id-targeted rows, never inside the packages.

If the profile is set up without the bundle mechanism, the legacy form still
works: link the package and insert `{ id: provider-usage, name: dsh-provider-usage }`
in `cordis.patch.yml` yourself — just remember a bundle row and a user-patch
row with the SAME id must never both exist (duplicate loader entry id).
