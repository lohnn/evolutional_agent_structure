// dsh-provider-usage — client half (prebuilt-style client bundle).
//
// dsh client-module contract: a classic script whose only job is to register
// the package's factory with the boot-time module loader. The factory's
// exports ARE the client plugin ({ name, apply(ctx) }) — the vendored cordis
// Loader imports the package row and mounts it on the client context like any
// other plugin.
//
// The GENERAL SHAPE of the usage panel, mirroring how the shell composes its
// own chrome:
//
//   - one sidebar entry ("Usage", id `provider-usage`) + one `main` panel,
//   - the `main` registration DECLARES the child slot `provider-usage.tab`
//     (kind list) — the single extension seat for the whole panel,
//   - the tab bar reads `provider-usage.tab` entries (id/order/label) and
//     dispatches the ACTIVE provider's component with
//     renderSlot('provider-usage.tab', { active }, { only: id }), so inactive
//     tabs stay unmounted exactly like shell panels do across sidebar clicks.
//
// Provider plugins (dsh-berget-usage today) only ever touch
// `provider-usage.tab` — never 'main' or 'sidebar.panellist'. Their rendering
// contract: self-fetching React component, no owner props required. See
// ./README.md in this package for the full provider contract + skeleton.

window.__ModuleLoader__.load({
  id: 'dsh-provider-usage',
  factory: (require) => {
    const React = require('react');

    const CSS = '.pu-shell{height:100%;overflow-y:auto;box-sizing:border-box}.pu-tabbar{display:flex;gap:6px;flex-wrap:wrap;padding:14px 28px 0;border-bottom:1px solid rgba(128,128,128,.25);margin-bottom:0}.pu-tab{appearance:none;background:transparent;color:rgba(128,128,128,1);font:inherit;font-size:12px;line-height:1;padding:7px 13px;border-radius:999px;border:1px solid transparent;cursor:pointer}.pu-tab:hover{background:rgba(128,128,128,.14)}.pu-tab[data-active="true"]{border-color:rgba(128,128,128,.4);color:inherit;font-weight:600;background:rgba(128,128,128,.08)}.pu-body{min-height:200px}.pu-empty{padding:24px 28px 40px;font-size:13px;line-height:1.5}.pu-emptycard{border:1px solid rgba(128,128,128,.28);border-radius:10px;padding:14px 16px;color:rgba(128,128,128,1);font-size:12px;line-height:1.6;max-width:640px}.pu-emptycode{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;word-break:break-all}';

    const PANEL_KEY = 'provider-usage';
    const TAB_SLOT = 'provider-usage.tab';
    const SIDEBAR_ID = 'provider-usage';

    let apply_ctx = null;

    // Reads one provider-tab entry snapshot (the same shape the shell's
    // sidebar reads for the global panel list: id + order + label).
    function readTabs(slots) {
      if (!slots || typeof slots.entriesOfSlot !== 'function') return [];
      const rows = [];
      for (const entry of slots.entriesOfSlot(TAB_SLOT)) {
        const options = (entry && entry.options) || {};
        const id = options.id;
        if (typeof id !== 'string' || id.length === 0) continue;
        rows.push({
          id: id,
          order: typeof options.order === 'number' && isFinite(options.order) ? options.order : 0,
          label: (typeof options.label === 'string' && options.label.length > 0) ? options.label : id,
        });
      }
      rows.sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return rows;
    }

    function ProviderUsagePanel(props) {
      const ctx = apply_ctx;
      const slots = ctx ? ctx.get('slots') : undefined;
      const tabsState = React.useState(null);
      const tabs = tabsState[0], setTabs = tabsState[1];
      const activeState = React.useState(null);
      const active = activeState[0], setActive = activeState[1];

      React.useEffect(() => {
        if (!slots || typeof slots.subscribe !== 'function') return undefined;
        const sync = () => {
          const next = readTabs(slots);
          setTabs(next);
          // Keep a valid active tab: keep the current pick if it survives,
          // otherwise take the first tab in dismissal order.
          setActive((prev) => (prev !== null && next.some((t) => t.id === prev)) ? prev : (next.length > 0 ? next[0].id : null));
        };
        sync();
        return slots.subscribe(TAB_SLOT, sync);
      }, [slots]);

      const renderSlot = props && props.renderSlot;
      const list = tabs || [];

      const bar = React.createElement('div', { className: 'pu-tabbar' },
        list.map((t) => React.createElement('button', {
          key: t.id,
          type: 'button',
          className: 'pu-tab',
          'data-active': active === t.id ? 'true' : 'false',
          onClick: () => setActive(t.id),
        }, t.label)));

      let body = null;
      if (active === null || active === undefined) {
        body = React.createElement('div', { className: 'pu-empty' },
          React.createElement('div', { className: 'pu-emptycard' },
            React.createElement('div', null, 'No provider plugins are registered yet.'),
            React.createElement('div', null, 'A provider plugin registers into the '),
            React.createElement('span', { className: 'pu-emptycode' }, 'provider-usage.tab'), ' slot — see ',
            React.createElement('span', { className: 'pu-emptycode' }, 'packages/provider-usage/README.md'), ' in the dsh-hive monorepo for the skeleton.',
            React.createElement('div', { style: { marginTop: 6 } }, 'Slots: ' + TAB_SLOT)));
      } else if (renderSlot) {
        body = React.createElement('div', { className: 'pu-body' },
          renderSlot(TAB_SLOT, { active: true }, { only: active }));
      } else {
        body = React.createElement('div', { className: 'pu-empty' },
          React.createElement('div', { className: 'pu-emptycard' }, 'Tab renderer unavailable (children renderSlot missing from composed props).'));
      }

      return React.createElement('div', { className: 'pu-shell' }, bar, body);
    }

    // The shared sidebar glyph: three ascending bars, same as the old Berget
    // panel icon — it reads as "usage" from any provider.
    function UsageIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 20;
      return React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true },
        React.createElement('rect', { x: 4, y: 12, width: 4, height: 7, rx: 1, fill: 'currentColor', opacity: 0.55 }),
        React.createElement('rect', { x: 10, y: 7, width: 4, height: 12, rx: 1, fill: 'currentColor', opacity: 0.8 }),
        React.createElement('rect', { x: 16, y: 3, width: 4, height: 16, rx: 1, fill: 'currentColor' }));
    }

    return {
      name: 'dsh-provider-usage',
      // Registration goes through the slots service. No timer: the core never
      // polls — each provider panel owns its own refresh cadence.
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots');
        if (slots === undefined) {
          console.error('[dsh-provider-usage] no slots service — usage panel not registered');
          return;
        }
        apply_ctx = ctx;
        ctx.effect(() => {
          const style = document.createElement('style');
          style.setAttribute('data-plugin-css', 'dsh-provider-usage');
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'provider-usage tab styles');
        // One shared panel: the `main` registration DECLARES the child tab
        // slot, so provider registrations keyed off it probe/wait via
        // slots.inject(CORE_TAB_SLOT) — the shell's own inject-then-register
        // idiom, no cross-package module coupling anywhere.
        slots.inject('main', () => {
          slots.register({
            name: 'main',
            key: PANEL_KEY,
            children: {
              [TAB_SLOT]: { kind: 'list', scope: 'root' },
            },
          }, (props) => React.createElement(ProviderUsagePanel, props));
        });
        slots.inject('sidebar.panellist', () => {
          slots.register({
            name: 'sidebar.panellist',
            id: SIDEBAR_ID,
            order: 100,
            label: 'Usage',
          }, (props) => React.createElement(UsageIcon, props));
        });
        console.log('[dsh-provider-usage] client plugin applied (tabbed usage panel at key ' + PANEL_KEY + ')');
      },
    };
  },
});
