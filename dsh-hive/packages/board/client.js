// @hive/dsh-board — client half (prebuilt-style client bundle).
//
// dsh client-module contract: a classic script whose only job is to register
// the package's factory with the boot-time module loader. The factory's
// exports ARE the client plugin ({ name, inject, apply(ctx) }) — the vendored
// cordis Loader imports the package row and mounts it on the client context
// like any other plugin. The LOAD-BEARING service gate is the inject array on
// the RETURNED ENTITY (['slots','timer']); the package.json dsh.client.inject
// array is informational only (dsh-package-manifest types 0.1.6-alpha.2).
//
// WI-062 slice 2 — READ-ONLY board index (user decision 2026-09-18):
// a standalone sidebar entry ("HIVE Board", the berget-usage standalone
// pattern) rendering one `main` panel fed by the host half's same-origin
// JSON route:
//
//   GET /api/hive-board/index
//     -> { ok, status, generated, counts:{total,queued,in_progress,done},
//          columns:{ queued:[...], in_progress:[...], done:[...] } }
//
// No interactivity beyond Refresh + poll (interactivity is a later slice;
// nothing here can mutate the board — the write path stays transition-locked
// behind the hive_board_* tools).
//
// Differences vs the dynamic twin lineage (same as berget-usage):
//   - CSS: a fiber-owned <style data-plugin-css="@hive/dsh-board"> tag.
//   - RPC: same-origin GET to the host half's webserver route; NO
//     harness.handle RPC exists for static packages (I-127).
//   - React comes from the module table; no bundled React, no @deepseek-ai/*
//     imports in this baked file (W-044).
window.__ModuleLoader__.load({
  id: '@hive/dsh-board',
  factory: (require) => {
    const React = require('react');

    const CSS = '.hvb-panel{height:100%;overflow-y:auto;box-sizing:border-box;padding:24px 28px 40px;font-size:13px;line-height:1.5}' +
      '.hvb-title-row{display:flex;align-items:center;gap:10px;margin-bottom:2px;flex-wrap:wrap}' +
      '.hvb-title{font-size:15px;font-weight:600}.hvb-sub{color:rgba(128,128,128,.9);margin-bottom:14px;font-size:12px}' +
      '.hvb-chip{display:inline-block;padding:0 8px;border-radius:999px;font-size:11px;border:1px solid rgba(128,128,128,.4);color:rgba(128,128,128,1);white-space:nowrap}' +
      '.hvb-chip-accent{border-color:#30a46c80;color:#30a46c}.hvb-chip-warn{border-color:#f5a52480;color:#f5a524}.hvb-chip-low{border-color:rgba(128,128,128,.25)}' +
      '.hvb-refresh{margin-left:auto}' +
      '.hvb-cols{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}' +
      '.hvb-col{flex:1 1 240px;min-width:240px;max-width:420px}' +
      '.hvb-col-head{display:flex;align-items:baseline;gap:8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:rgba(128,128,128,.9);margin:0 0 8px}' +
      '.hvb-col-count{font-weight:400;letter-spacing:0}' +
      '.hvb-card{border:1px solid rgba(128,128,128,.28);border-radius:8px;padding:9px 11px;margin:0 0 8px;background:transparent}' +
      '.hvb-card-inprog{border-color:#30a46c55}.hvb-card-done{opacity:.72}.hvb-card-paused{border-style:dashed}' +
      '.hvb-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;color:rgba(128,128,128,.95)}' +
      '.hvb-card-title{font-weight:600;margin:3px 0 4px;overflow-wrap:anywhere}' +
      '.hvb-chips{display:flex;gap:5px;flex-wrap:wrap;margin:0 0 4px}' +
      '.hvb-meta{color:rgba(128,128,128,.9);font-size:11.5px;display:flex;gap:8px;flex-wrap:wrap}' +
      '.hvb-problem{color:#e5484d;font-size:11px;margin-top:3px;overflow-wrap:anywhere}' +
      '.hvb-error-text{color:#e5484d;font-size:12px;white-space:pre-wrap;word-break:break-word;margin-top:8px}' +
      '.hvb-btn{border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;border-radius:6px;padding:4px 12px;cursor:pointer;font:inherit;font-size:12px}' +
      '.hvb-btn:hover{background:rgba(128,128,128,.14)}' +
      '.hvb-more{color:rgba(128,128,128,.9);font-size:11.5px;padding:2px 0 0 2px}' +
      '.hvb-empty{color:rgba(128,128,128,.9);font-size:12px;font-style:italic;padding:2px 0}';

    const INDEX_URL = '/api/hive-board/index';
    const DONE_SHOW = 8; // rendering cap only — the payload always carries all done items

    function OwnerTail(props) {
      const owner = props.owner;
      if (!owner || typeof owner !== 'string') return 'un-owned';
      const tail = owner.length > 14 ? '…' + owner.slice(-8) : owner;
      return owner.startsWith('session-') ? 'session ' + tail : tail;
    }

    function Card(props) {
      const it = props.item;
      const chips = [];
      if (it.priority === 'high') chips.push(React.createElement('span', { key: 'p', className: 'hvb-chip hvb-chip-warn' }, 'high'));
      else if (it.priority === 'low') chips.push(React.createElement('span', { key: 'p', className: 'hvb-chip hvb-chip-low' }, 'low'));
      if (props.showStatus) chips.push(React.createElement('span', { key: 's', className: 'hvb-chip' }, it.status));
      if (it.paused) chips.push(React.createElement('span', { key: 'z', className: 'hvb-chip hvb-chip-warn' }, 'paused'));
      for (const t of (it.tags || [])) chips.push(React.createElement('span', { key: 't:' + t, className: 'hvb-chip' }, t));
      const problems = Array.isArray(it.problems) ? it.problems : [];
      const meta = [
        React.createElement('span', { key: 'o' }, OwnerTail({ owner: it.owner })),
        React.createElement('span', { key: 'b', title: 'spec size' }, (it.body_bytes === 0 ? 'no spec' : it.body_bytes + ' B spec')),
        (it.subtasks > 0 ? React.createElement('span', { key: 'st' }, it.subtasks_done + '/' + it.subtasks + ' subtasks') : null),
        React.createElement('span', { key: 'u', title: 'newest transition (recency key)' }, typeof it.recency === 'string' ? it.recency.slice(0, 10) : '—'),
      ].filter(Boolean);
      return React.createElement('div', { className:
          'hvb-card' + (it.status === 'in_progress' ? ' hvb-card-inprog' : '')
        + (it.status === 'done' ? ' hvb-card-done' : '')
        + (it.paused ? ' hvb-card-paused' : '') },
        React.createElement('div', { className: 'hvb-chips' },
          React.createElement('span', { key: 'id', className: 'hvb-id' }, it.id), chips),
        React.createElement('div', { className: 'hvb-card-title', title: it.title }, it.title || '—'),
        React.createElement('div', { className: 'hvb-meta' }, meta),
        problems.map((p, i) => React.createElement('div', { key: 'p' + i, className: 'hvb-problem' }, '⚠ ' + p)));
    }

    function Column(props) {
      const items = props.items || [];
      const shown = props.cap ? items.slice(0, props.cap) : items;
      return React.createElement('div', { className: 'hvb-col' },
        React.createElement('div', { className: 'hvb-col-head' }, props.name,
          React.createElement('span', { className: 'hvb-col-count' }, String(items.length))),
        items.length === 0 ? React.createElement('div', { className: 'hvb-empty' }, props.emptyText || 'nothing')
          : shown.map((it, i) => React.createElement(Card, { key: it.id + ':' + i, item: it, showStatus: !!props.showStatus })),
        (props.cap && items.length > props.cap)
          ? React.createElement('div', { className: 'hvb-more' }, '+' + (items.length - props.cap) + ' older — not rendered (data is in the payload)') : null);
    }

    function Panel(props) {
      // The stateful panel. The host passes the applied client `ctx` in as a
      // prop so the poll effect can use the inject-guarded ctx.interval.
      const st = React.useState({ phase: 'loading', data: null, at: null });
      const view = st[0], setView = st[1];
      const ctx = props.applyCtx;

      const load = () => {
        fetch(INDEX_URL, { cache: 'no-store' })
          .then((res) => res.json().catch(() => ({})))
          .then((result) => {
            setView({ phase: result && result.ok === true ? 'ready' : 'error', data: result || {}, at: Date.now() });
          })
          .catch((err) => setView({ phase: 'error', data: { ok: false, error: String(err) }, at: Date.now() }));
      };

      React.useEffect(() => {
        load();
        return ctx && typeof ctx.interval === 'function' ? ctx.interval(() => { load(); }, 60 * 1000) : undefined;
      }, []);

      const counts = view.data && view.data.counts;
      const head = React.createElement('div', { className: 'hvb-title-row' },
        React.createElement('span', { className: 'hvb-title' }, 'HIVE Board'),
        view.phase === 'ready' && counts ? React.createElement('span', { className: 'hvb-chip', title: 'board totals' },
          counts.queued + ' queued · ' + counts.in_progress + ' in progress · ' + counts.done + ' done (of ' + counts.total + ')') : null,
        view.phase === 'ready' && view.at ? React.createElement('span', { className: 'hvb-chip hvb-chip-low' }, 'as of ' + new Date(view.at).toTimeString().slice(0, 8)) : null,
        React.createElement('button', { className: 'hvb-btn hvb-refresh', onClick: load }, 'Refresh'));
      const sub = React.createElement('div', { className: 'hvb-sub' },
        'read-only view of /workspace/.opencode/board (WI-*) — changes go through the hive_board_* tools');

      if (view.phase === 'loading') {
        return React.createElement('div', { className: 'hvb-panel' }, head, sub,
          React.createElement('div', { className: 'hvb-empty' }, 'Fetching the board…'));
      }
      if (view.phase !== 'ready' || !view.data) {
        const message = (view.data && (view.data.error || 'index route failed — is the dsh web host half booted with the tab route?'));
        return React.createElement('div', { className: 'hvb-panel' }, head, sub,
          React.createElement('div', { className: 'hvb-error-text' }, 'Could not load the board index. ' + message));
      }
      const cols = view.data.columns || {};
      return React.createElement('div', { className: 'hvb-panel' }, head, sub,
        React.createElement('div', { className: 'hvb-cols' },
          React.createElement(Column, { name: 'Queued', items: cols.queued || [], showStatus: true, emptyText: 'no backlog or todo items' }),
          React.createElement(Column, { name: 'In Progress', items: cols.in_progress || [], emptyText: 'nothing in progress — bind an item to work it' }),
          React.createElement(Column, { name: 'Done', items: cols.done || [], cap: DONE_SHOW, emptyText: 'nothing done yet' })));
    }

    let apply_ctx = null;
    let applied_once = false;

    function BoardIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 20;
      // A small kanban glyph: three columns of varying fill.
      return React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true },
        React.createElement('rect', { x: 3, y: 4, width: 5, height: 9, rx: 1, fill: 'currentColor', opacity: 0.55 }),
        React.createElement('rect', { x: 3, y: 15, width: 5, height: 5, rx: 1, fill: 'currentColor', opacity: 0.35 }),
        React.createElement('rect', { x: 10, y: 4, width: 5, height: 13, rx: 1, fill: 'currentColor', opacity: 0.8 }),
        React.createElement('rect', { x: 10, y: 19, width: 5, height: 1, rx: 0.5, fill: 'currentColor', opacity: 0.35 }),
        React.createElement('rect', { x: 17, y: 4, width: 5, height: 5, rx: 1, fill: 'currentColor', opacity: 0.8 }),
        React.createElement('rect', { x: 17, y: 11, width: 5, height: 9, rx: 1, fill: 'currentColor', opacity: 0.55 }));
    }

    return {
      name: '@hive/dsh-board',
      // Hard dependencies: registration goes through the slots service; the
      // panel's 60 s poll effect uses ctx.interval. The client context guard
      // throws "cannot get property X without inject" for any undeclared
      // service property, so both must be declared for the loader to sequence.
      inject: ['slots', 'timer'],
      apply(ctx) {
        if (applied_once) return; // idempotent: duplicate apply would re-register the same slot keys and throw
        applied_once = true;
        apply_ctx = ctx;
        const slots = ctx.get('slots');
        if (slots === undefined) {
          console.error('[@hive/dsh-board] no slots service — board panel not registered');
          return;
        }
        ctx.effect(() => {
          const style = document.createElement('style');
          style.setAttribute('data-plugin-css', '@hive/dsh-board');
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'board tab styles');
        // Standalone sidebar entry ("HIVE Board"): one keyed `main` panel
        // selected by the `sidebar.panellist` id of the same value (both
        // required kinds of the berget-usage standalone pattern).
        slots.inject('main', () => {
          slots.register(
            { name: 'main', key: 'hive-board' },
            (props) => React.createElement(Panel, { applyCtx: apply_ctx }),
          );
        });
        slots.inject('sidebar.panellist', () => {
          slots.register(
            { name: 'sidebar.panellist', id: 'hive-board', order: 110, label: 'HIVE Board' },
            (props) => React.createElement(BoardIcon, props),
          );
        });
        console.log('[@hive/dsh-board] client plugin applied (read-only board panel)');
      },
    };
  },
});
