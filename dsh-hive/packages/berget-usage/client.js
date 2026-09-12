// dsh-berget-usage — client half (prebuilt-style client bundle).
//
// dsh client-module contract: a classic script whose only job is to register
// the package's factory with the boot-time module loader. The factory's
// exports ARE the client plugin ({ name, apply(ctx) }) — the vendored cordis
// Loader imports the package row and mounts it on the client context like any
// other plugin.
//
// Differences vs the dynamic-plug-in twin (session-scoped berget-1):
//   - CSS: a fiber-owned <style data-plugin-css="dsh-berget-usage"> tag
//     (the module system recognizes that attribute) instead of the dynamic
//     runner's injected `styles` global.
//   - RPC: same-origin GET /api/berget-usage/snapshot (the host half's
//     webserver route) instead of dynamic per-package `host.call`.
window.__ModuleLoader__.load({
  id: 'dsh-berget-usage',
  factory: (require) => {
    const React = require('react');

    const CSS = '.berget-panel{height:100%;overflow-y:auto;box-sizing:border-box;padding:24px 28px 40px;font-size:13px;line-height:1.5}.berget-title-row{display:flex;align-items:center;gap:10px;margin-bottom:2px;flex-wrap:wrap}.berget-title{font-size:15px;font-weight:600}.berget-chip{display:inline-block;padding:0 8px;border-radius:999px;font-size:11px;border:1px solid rgba(128,128,128,.4);color:rgba(128,128,128,1);white-space:nowrap}.berget-chip-accent{border-color:#30a46c80;color:#30a46c}.berget-refresh{margin-left:auto}.berget-sub{color:rgba(128,128,128,.9);margin-bottom:14px}.berget-card{border:1px solid rgba(128,128,128,.28);border-radius:10px;padding:14px 16px;margin:0 0 12px}.berget-headline{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}.berget-strong{font-weight:600}.berget-bigpct{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}.berget-track{position:relative;height:8px;border-radius:4px;background:rgba(128,128,128,.22);overflow:visible;margin:8px 0 10px}.berget-fill{position:absolute;left:0;top:0;height:100%;border-radius:4px;transition:width .4s ease}.berget-clock{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:rgba(255,255,255,.85);box-shadow:0 0 0 1px rgba(0,0,0,.45);border-radius:1px;pointer-events:none}.berget-muted{color:rgba(128,128,128,.9);font-size:12px}.berget-nums{display:flex;flex-direction:column;gap:2px;margin-top:6px}.berget-num-row{display:flex;gap:10px;font-size:12px}.berget-num-val{margin-left:auto;font-variant-numeric:tabular-nums}.berget-btn{border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;border-radius:6px;padding:4px 12px;cursor:pointer;font:inherit;font-size:12px}.berget-btn:hover{background:rgba(128,128,128,.14)}.berget-error-text{color:#e5484d;margin-top:8px;font-size:12px;white-space:pre-wrap;word-break:break-word}.berget-note{color:rgba(128,128,128,.9);font-size:12px}.berget-section{margin:18px 0 8px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:rgba(128,128,128,.9)}.berget-model-row{display:flex;gap:8px;font-size:12px;align-items:center}.berget-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}.berget-model-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.berget-model-val{margin-left:auto;font-variant-numeric:tabular-nums;flex-shrink:0;text-align:right}.berget-models{margin-top:8px;display:flex;flex-direction:column;gap:3px}.berget-period-name{font-weight:600;letter-spacing:.04em;font-size:11px;text-transform:uppercase}.berget-pct{margin-left:auto;font-variant-numeric:tabular-nums;text-align:right}.berget-limits{width:100%;border-collapse:collapse;font-size:12px}.berget-limits th{text-align:right;font-weight:500;color:rgba(128,128,128,.9);padding:3px 0 3px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.04em}.berget-limits td{padding:3px 0 3px 12px;font-variant-numeric:tabular-nums;text-align:right}.berget-limits th:first-child,.berget-limits td:first-child{text-align:left;padding-left:0}.berget-limits td:first-child{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.berget-warn{color:#f5a524;font-weight:600}';

    // Rolling window lengths inferred from Berget's limiter (reset offsets are
    // consistent with 24h / 7d / 30d windows anchored at first usage).
    const PERIOD_WINDOWS = { daily: 86400, weekly: 604800, monthly: 2592000 };
    const PERIOD_WINDOW_LABEL = { daily: '24h', weekly: '7d', monthly: '30d' };

    const SNAPSHOT_URL = '/api/berget-usage/snapshot';

    const fmtEur = (cents) => (typeof cents === 'number' && isFinite(cents)) ? '€ ' + (cents / 100).toFixed(2) : '—';
    const fmtDate = (iso) => (typeof iso === 'string' && iso.length >= 10) ? iso.slice(0, 10) : '—';
    const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : ((typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) ? Number(v) : null);
    const fmtEurUnit = (v) => { const n = num(v); return n === null ? '—' : '€ ' + n.toFixed(2); };
    const fmtPct = (p) => { const n = num(p.usedPercent); return n === null ? '—' : ((n % 1 === 0 ? String(n) : n.toFixed(1)) + '%'); };
    const fmtDur = (s) => {
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
      if (d > 0) return d + 'd ' + h + 'h';
      if (h > 0) return h + 'h ' + m + 'm';
      return m + 'm';
    };
    const resetText = (s) => {
      if (typeof s !== 'number' || !isFinite(s)) return 'no active window';
      if (s <= 0) return 'resets any moment now';
      return 'resets in ' + fmtDur(s);
    };
    const barColor = (pct) => { const f = num(pct) / 100; return !isFinite(f) ? 'rgba(128,128,128,.6)' : f >= 0.9 ? '#e5484d' : f >= 0.65 ? '#f5a524' : '#30a46c'; };
    const MODEL_COLORS = ['#8FD6B4', '#A8C7FA', '#E8C07D', '#D9A7C7', '#B5A7E8', '#7DD3D9'];
    const modelColor = (id) => { let t = 0; for (let i = 0; i < id.length; i++) t = (t * 31 + id.charCodeAt(i)) | 0; return MODEL_COLORS[Math.abs(t) % MODEL_COLORS.length]; };
    const prettyModel = (id) => {
      const slash = id.indexOf('/');
      const vendor = slash > -1 ? id.slice(0, slash) : '';
      const base = slash > -1 ? id.slice(slash + 1) : id;
      return { name: base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), vendor: vendor };
    };

    function StatusChip(props) {
      return React.createElement('span', { className: 'berget-chip' + (props.accent === true ? ' berget-chip-accent' : ''), title: props.title }, props.text);
    }
    function NumRows(props) {
      return React.createElement('div', { className: 'berget-nums' },
        props.rows.map((r) => React.createElement('div', { className: 'berget-num-row', key: r[0] },
          React.createElement('span', { className: 'berget-muted' }, r[0]),
          React.createElement('span', { className: 'berget-num-val' }, r[1]))));
    }
    function SubscriptionCard(props) {
      const sub = props.sub;
      const kids = [React.createElement('div', { className: 'berget-headline', key: 'h' },
        React.createElement('span', { className: 'berget-strong' }, sub.name || sub.planCode || 'Subscription'),
        sub.status ? React.createElement(StatusChip, { key: 's', text: sub.status, accent: sub.status === 'active' }) : null,
        sub.planCode ? React.createElement('span', { className: 'berget-muted', key: 'p' }, sub.planCode) : null)];
      const start = sub.currentBillingPeriodStartDate, end = sub.currentBillingPeriodEndDate;
      if (typeof start === 'string' && typeof end === 'string') {
        const anchor = props.serverNow || (props.fetchedAt ? new Date(props.fetchedAt).toISOString() : null);
        const t0 = Date.parse(start), t1 = Date.parse(end), nowMs = anchor ? Date.parse(anchor) : Date.now();
        let progress = null;
        if (isFinite(t0) && isFinite(t1) && t1 > t0 && isFinite(nowMs)) progress = Math.min(1, Math.max(0, (nowMs - t0) / (t1 - t0)));
        const totalDays = Math.max(1, Math.round((t1 - t0) / 86400000));
        const dayNo = isFinite(nowMs) && isFinite(t0) ? Math.min(totalDays, Math.max(1, Math.floor((nowMs - t0) / 86400000) + 1)) : null;
        kids.push(React.createElement('div', { key: 'pl' },
          React.createElement('div', { className: 'berget-num-row' },
            React.createElement('span', { className: 'berget-muted' }, 'Billing period'),
            React.createElement('span', { className: 'berget-num-val' }, fmtDate(start) + ' → ' + fmtDate(end) + (dayNo ? '  ·  day ' + dayNo + '/' + totalDays : ''))),
          progress !== null ? React.createElement('div', { className: 'berget-track', key: 't', title: 'Calendar progress through the billing period — not usage' },
            React.createElement('div', { className: 'berget-fill', style: { width: (progress * 100).toFixed(1) + '%', background: 'rgba(128,128,128,.55)' } })) : null));
      }
      const usage = sub.usage || {};
      kids.push(React.createElement(NumRows, { key: 'u', rows: [
        ['Usage this period', fmtEur(usage.currentUsageAmountCents)],
        ['Invoiced to date', fmtEur(usage.invoicedUsageAmountCents)],
        ['Historical (external)', fmtEur(usage.externalHistoricalUsageAmountCents)],
      ] }));
      return React.createElement('div', { className: 'berget-card' }, kids);
    }
    function CreditsCard(props) {
      const c = props.credits;
      const kids = [React.createElement('div', { className: 'berget-headline', key: 'h' },
        React.createElement('span', { className: 'berget-strong' }, 'API credits'),
        c.currency ? React.createElement('span', { className: 'berget-muted' }, c.currency) : null)];
      kids.push(React.createElement(NumRows, { key: 'b', rows: [
        ['Current', fmtEurUnit(c.current)],
        ['Available', fmtEurUnit(c.available)],
        ['Consumed credits', (c.consumedCredits === null || c.consumedCredits === undefined) ? '—' : String(c.consumedCredits)],
      ] }));
      if (c.lastUpdated) kids.push(React.createElement('div', { className: 'berget-muted', key: 'lu', style: { marginTop: 6 } }, 'updated ' + fmtDate(c.lastUpdated)));
      return React.createElement('div', { className: 'berget-card' }, kids);
    }
    function PeriodCard(props) {
      const period = props.period;
      const used = num(period.usedPercent);
      let remaining = null;
      if (typeof period.resetInSeconds === 'number') {
        remaining = period.resetInSeconds;
        if (props.now && props.fetchedAt) remaining -= Math.max(0, Math.floor((props.now - props.fetchedAt) / 1000));
      }
      // Position of "now" inside the rolling window: elapsed/window.
      const windowSec = props.windowSeconds;
      let elapsedFrac = null;
      let elapsedSec = null;
      if (windowSec && typeof period.resetInSeconds === 'number') {
        elapsedSec = windowSec - remaining;
        elapsedFrac = Math.min(1, Math.max(0, elapsedSec / windowSec));
      }
      const kids = [React.createElement('div', { className: 'berget-headline', key: 'h' },
        React.createElement('span', { className: 'berget-period-name' }, props.name),
        React.createElement('span', { className: 'berget-pct' },
          React.createElement('span', { className: 'berget-bigpct' }, fmtPct(period)),
          React.createElement('span', { className: 'berget-muted' }, ' of period budget')))];
      const trackTitle = elapsedFrac === null
        ? 'Used this rolling window'
        : fmtDur(Math.max(0, elapsedSec)) + ' elapsed of ' + props.windowLabel + ' window — the white needle marks now; resets in ' + fmtDur(Math.max(0, remaining));
      kids.push(React.createElement('div', { className: 'berget-track', key: 't', title: trackTitle },
        React.createElement('div', { className: 'berget-fill', style: { width: Math.min(100, Math.max(0, used === null ? 0 : used)) + '%', background: barColor(used) } }),
        elapsedFrac !== null ? React.createElement('div', {
          className: 'berget-clock',
          style: { left: (elapsedFrac * 100).toFixed(2) + '%' },
        }) : null));
      kids.push(React.createElement('div', { className: 'berget-muted', key: 'r' },
        elapsedSec !== null
          ? fmtDur(Math.max(0, elapsedSec)) + ' elapsed of ' + props.windowLabel + ' window  ·  ' + resetText(remaining)
          : (remaining === null ? 'no active window' : resetText(remaining))));
      const entries = Object.keys(period.models || {}).map((id) => ({ id: id, share: num(period.models[id]) })).filter((e) => e.share !== null);
      if (entries.length > 0) {
        entries.sort((a, b) => b.share - a.share);
        entries.forEach((e) => { e.ofBudget = (used !== null) ? Math.round(e.share * used / 100) : null; });
        const fmtOf = (v) => (v === null) ? '—' : (v === 0 ? '<1%' : v + '%');
        kids.push(React.createElement('div', { className: 'berget-models', key: 'm' },
          entries.map((e0) => {
            const pretty = prettyModel(e0.id);
            return React.createElement('div', { className: 'berget-model-row', key: e0.id },
              React.createElement('span', { className: 'berget-dot', style: { background: modelColor(e0.id) } }),
              React.createElement('span', { className: 'berget-model-name', title: e0.id }, pretty.name,
                pretty.vendor ? React.createElement('span', { className: 'berget-muted' }, '  ' + pretty.vendor) : null),
              React.createElement('span', { className: 'berget-model-val' },
                fmtOf(e0.ofBudget) + ' of budget',
                React.createElement('span', { className: 'berget-muted' }, '  ·  ' + e0.share + '% of used')));
          })));
      }
      return React.createElement('div', { className: 'berget-card' }, kids);
    }
    function LimitsCard(props) {
      const limits = props.limits, usedByPeriod = props.usedByPeriod, modelsByPeriod = props.modelsByPeriod || {};
      const ids = Object.keys(limits).sort();
      if (ids.length === 0) return null;
      const periods = ['daily', 'weekly', 'monthly'];
      const head = React.createElement('tr', { key: 'head' },
        React.createElement('th', null, 'Per-model cap'), periods.map((p) => React.createElement('th', { key: p }, p)));
      const rows = ids.map((id) => {
        const cells = periods.map((p) => {
          const cap = limits[id] ? num(limits[id][p]) : null;
          let usedPct = null;
          if (modelsByPeriod[p] && usedByPeriod[p] !== null && usedByPeriod[p] !== undefined) {
            const share = num(modelsByPeriod[p][id]);
            if (share !== null) usedPct = Math.round(share * usedByPeriod[p] / 100);
          }
          const over = cap !== null && usedPct !== null && usedPct > cap;
          return React.createElement('td', { key: p, className: over ? 'berget-warn' : undefined },
            (cap === null ? '—' : cap + '%') + (over ? ' (' + usedPct + '% used)' : ''));
        });
        const pretty = prettyModel(id);
        return React.createElement('tr', { key: id },
          React.createElement('td', { title: id }, pretty.name + (pretty.vendor ? ' · ' + pretty.vendor : '')), cells);
      });
      return React.createElement('div', { className: 'berget-card' },
        React.createElement('div', { className: 'berget-muted', style: { marginBottom: 8 } },
          'Per-model hard caps — a model is rate-limited once its own use crosses the cap for a period, even with total budget left. Amber = currently over.'),
        React.createElement('table', { className: 'berget-limits' }, React.createElement('tbody', null, [head].concat(rows))));
    }

    function BergetPanel() {
      const state = React.useState({ phase: 'loading', data: null, at: null });
      const view = state[0], setView = state[1];
      const tickState = React.useState(null);
      const now = tickState[0], setNow = tickState[1];
      const ctx = apply_ctx;
      const load = () => {
        fetch(SNAPSHOT_URL, { cache: 'no-store' })
          .then((res) => res.json().catch(() => ({})))
          .then((result) => {
            setView({ phase: result && result.ok === true ? 'ready' : 'error', data: result || {}, at: Date.now() });
          })
          .catch((err) => setView({ phase: 'error', data: { ok: false, reason: 'network', error: String(err) }, at: Date.now() }));
      };
      React.useEffect(() => { load(); return typeof ctx.interval === 'function' ? ctx.interval(() => { load(); }, 60 * 1000) : undefined; }, []);
      React.useEffect(() => { return typeof ctx.interval === 'function' ? ctx.interval(() => { setNow(Date.now()); }, 15000) : undefined; }, []);

      if (view.phase === 'loading') {
        return React.createElement('div', { className: 'berget-panel' },
          React.createElement('div', { className: 'berget-title-row' },
            React.createElement('span', { className: 'berget-title' }, 'Berget'),
            React.createElement('button', { className: 'berget-btn berget-refresh', onClick: load }, 'Refresh')),
          React.createElement('div', { className: 'berget-sub' }, 'Fetching account status…'));
      }
      if (view.phase !== 'ready' || !view.data) {
        const reason = view.data && view.data.reason;
        let message = (view.data && view.data.error) || 'Snapshot failed.';
        if (reason === 'no-token') message = 'No Berget credential found on the host. The Berget Code login credential is fed by dsh-berget-refresh — run `berget code init` or `opencode auth login` (berget) once, then Refresh.';
        if (reason === 'network') message = 'Could not reach the host snapshot route (' + SNAPSHOT_URL + '). ' + ((view.data && view.data.error) || '');
        return React.createElement('div', { className: 'berget-panel' },
          React.createElement('div', { className: 'berget-title-row' },
            React.createElement('span', { className: 'berget-title' }, 'Berget'),
            React.createElement('button', { className: 'berget-btn berget-refresh', onClick: load }, 'Refresh')),
          React.createElement('div', { className: 'berget-card' },
            React.createElement('div', null, 'Could not load Berget status.'),
            React.createElement('div', { className: 'berget-error-text' }, message)));
      }

      const snap = view.data;
      const seat = snap.seat;
      const chips = [];
      if (seat && seat.tier) chips.push(React.createElement(StatusChip, { key: 'tier', text: seat.tier, accent: true }));
      if (seat && seat.seatId !== null && seat.seatId !== undefined) chips.push(React.createElement(StatusChip, { key: 'seat', text: 'seat #' + seat.seatId }));
      if (snap.tokenSource) chips.push(React.createElement(StatusChip, { key: 'src', text: snap.tokenSource === 'state-file' ? 'login (state file)' : 'Berget Code login', title: 'Credential used for these calls — refreshed automatically by dsh-berget-refresh' }));

      const subscriptions = Array.isArray(snap.subscriptions) ? snap.subscriptions : [];
      const subCards = subscriptions.map((sub, i) => React.createElement(SubscriptionCard, { key: i, sub: sub, fetchedAt: view.at, serverNow: sub.usage && sub.usage.toDateTime }));
      const creditsCard = snap.credits ? React.createElement(CreditsCard, { credits: snap.credits }) : null;

      let budgetSection = null;
      const budget = snap.seatBudget;
      if (budget) {
        const defs = [
          { name: 'Daily', key: 'daily' },
          { name: 'Weekly', key: 'weekly' },
          { name: 'Monthly', key: 'monthly' },
        ];
        const cards = [], usedByPeriod = {}, modelsByPeriod = {};
        for (let i = 0; i < defs.length; i++) {
          const p = budget.periods[defs[i].key];
          if (!p) continue;
          usedByPeriod[defs[i].key] = num(p.usedPercent);
          modelsByPeriod[defs[i].key] = p.models || {};
          cards.push(React.createElement(PeriodCard, {
            key: defs[i].key,
            name: defs[i].name,
            period: p,
            fetchedAt: view.at,
            now: now,
            windowSeconds: PERIOD_WINDOWS[defs[i].key],
            windowLabel: PERIOD_WINDOW_LABEL[defs[i].key],
          }));
        }
        budgetSection = React.createElement('div', null,
          React.createElement('div', { className: 'berget-section' }, 'Rolling seat budget'),
          React.createElement('div', { className: 'berget-muted', style: { marginBottom: 8 } },
            'White needle on each bar = where you are inside the rolling window (24h / 7d / 30d).'),
          budget.shadowMode ? React.createElement('div', { className: 'berget-muted', style: { marginBottom: 8 } }, 'shadow mode — limiter observes only, numbers are advisory') : null,
          cards,
          budget.modelLimits ? React.createElement(LimitsCard, { limits: budget.modelLimits, usedByPeriod: usedByPeriod, modelsByPeriod: modelsByPeriod }) : null);
      } else {
        budgetSection = React.createElement('div', null,
          React.createElement('div', { className: 'berget-section' }, 'Rolling seat budget'),
          React.createElement('div', { className: 'berget-card' },
            React.createElement('div', { className: 'berget-muted' }, 'Seat budget unavailable' + (snap.seatBudgetReason ? ' (' + snap.seatBudgetReason + ')' : '') + '.')));
      }

      const whoami = seat && seat.name ? seat.name : (seat && seat.email ? seat.email : null);
      return React.createElement('div', { className: 'berget-panel' },
        React.createElement('div', { className: 'berget-title-row' },
          React.createElement('span', { className: 'berget-title' }, 'Berget'), chips,
          React.createElement('button', { className: 'berget-btn berget-refresh', onClick: load }, 'Refresh')),
        React.createElement('div', { className: 'berget-sub' }, whoami || 'api.berget.ai'),
        subscriptions.length > 0 ? React.createElement('div', { className: 'berget-section' }, 'Subscription') : null,
        subCards,
        creditsCard ? React.createElement('div', { className: 'berget-section' }, 'Balance') : null,
        creditsCard,
        budgetSection,
        React.createElement('div', { className: 'berget-note', style: { marginTop: 14 } },
          'GET /v1/auth/status · GET /v1/usage/tokens · GET /v1/account · GET /v1/seats/budgets · auto-refresh 1 min'));
    }

    let apply_ctx = null;

    function PanelIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 20;
      return React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true },
        React.createElement('rect', { x: 4, y: 12, width: 4, height: 7, rx: 1, fill: 'currentColor', opacity: 0.55 }),
        React.createElement('rect', { x: 10, y: 7, width: 4, height: 12, rx: 1, fill: 'currentColor', opacity: 0.8 }),
        React.createElement('rect', { x: 16, y: 3, width: 4, height: 16, rx: 1, fill: 'currentColor' }));
    }

    return {
      name: 'dsh-berget-usage',
      apply(ctx) {
        apply_ctx = ctx;
        const slots = ctx.get('slots');
        if (slots === undefined) {
          console.error('[dsh-berget-usage] no slots service — panel not registered');
          return;
        }
        ctx.effect(() => {
          const style = document.createElement('style');
          style.setAttribute('data-plugin-css', 'dsh-berget-usage');
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'berget-usage panel styles');
        slots.inject('main', () => { slots.register({ name: 'main', key: 'berget-usage' }, () => React.createElement(BergetPanel)); });
        slots.inject('sidebar.panellist', () => { slots.register({ name: 'sidebar.panellist', id: 'berget-usage', order: 100, label: 'Berget usage' }, (props) => React.createElement(PanelIcon, props)); });
        console.log('[dsh-berget-usage] client plugin applied (panel + rolling budget needles)');
      },
    };
  },
});
