/**
 * dsh-berget-usage — host half (BERGET PROVIDER plugin).
 *
 * Split note: the shared, tabbed usage panel lives in dsh-provider-usage; this
 * package is now a provider plugin for the Berget Code seat subscription
 * (api.berget.ai). It keeps everything provider-specific here: its own
 * snapshot route, its own token seam, its own sanitizers.
 *
 * Serves the Berget seat-usage snapshot as a same-origin JSON route the web
 * panel fetches every minute:
 *
 *   GET /api/berget-usage/snapshot
 *     -> { ok, error, tokenSource, seat, subscriptions, credits,
 *          seatBudget, seatBudgetReason }
 *
 * Endpoints (all GET, Bearer auth):
 *   /v1/auth/status    -> seat id + tier + user (seat resolution)
 *   /v1/usage/tokens   -> subscription billing-period usage (cents)
 *   /v1/account        -> prepaid API credits balance
 *   /v1/seats/budgets  -> rolling daily/weekly/monthly budget + per-model caps
 *                         (undocumented, deployed; used by console.berget.ai)
 *
 * Token resolution: the BERGET_API_KEY credential reference (fed by
 * dsh-berget-refresh) -> /root/.dsh/berget-credentials.json access token.
 * The refresh call itself is NEVER made from here — refresh_token rotates and
 * dsh-berget-refresh owns that state machine.
 *
 * Provider-plugin contract (the "general shape" side): this half announces
 * itself to dsh-provider-usage's host registry through a ctx.inject wait —
 * order-agnostic (fires whenever, or ever, the core appears), so this
 * package still boots and serves where the usage-tab core is not composed.
 * The client half makes the same tab-vs-standalone decision from the boot
 * manifest.
 */

export const name = 'dsh-berget-usage';
export const inject = ['credentials', 'subprocess'];

const API = 'https://api.berget.ai';
const STATE_FILE = '/root/.dsh/berget-credentials.json';
const ROUTE_PATH = '/api/berget-usage/snapshot';

const messageOf = (e) => String((e && e.message) || e);

async function authorizedGet(ctx, curlPathRef, token, url) {
  if (!curlPathRef.value) curlPathRef.value = await ctx.subprocess.resolveExecutable('curl');
  const handle = ctx.subprocess.spawn({
    argv: [
      curlPathRef.value,
      '-sS', '--max-time', '15', '--connect-timeout', '8',
      '-H', 'Accept: application/json',
      '-H', `Authorization: Bearer ${token}`,
      '-w', '\n<<BERGET_STATUS:%{http_code}>>',
      url,
    ],
    cwd: '/tmp',
    stdio: { stdin: 'ignore', stdout: { maxBytes: 262144 }, stderr: { maxBytes: 8192 } },
    graceMs: 2000,
  });
  const outcome = await handle.done;
  const read = (name) => {
    const stream = handle.collected && handle.collected[name];
    if (!stream) return '';
    const chunk = typeof stream.readFrom === 'function' ? stream.readFrom(0) : stream;
    if (chunk && typeof chunk === 'object' && 'text' in chunk) return chunk.text || '';
    return typeof chunk === 'string' ? chunk : '';
  };
  const stdout = read('stdout');
  const stderr = read('stderr');
  if (!outcome || outcome.exitCode !== 0) {
    return { status: 0, json: null, error: `curl exit ${outcome ? outcome.exitCode : '?'}${stderr ? ': ' + stderr.slice(0, 160) : ''}` };
  }
  const m = stdout.match(/\n?<<BERGET_STATUS:(\d+)>>\s*$/);
  if (!m) return { status: 0, json: null, error: ('no status marker' + (stderr ? ': ' + stderr.slice(0, 160) : '')) };
  const status = Number(m[1]);
  let json = null;
  const body = stdout.slice(0, m.index).trim();
  if (body.length > 0) {
    try { json = JSON.parse(body); } catch { json = null; }
  }
  return { status, json, error: null };
}

async function resolveToken(ctx, log) {
  const credentials = ctx.get('credentials');
  if (credentials) {
    try {
      const credential = await credentials.resolve('BERGET_API_KEY');
      if (credential && typeof credential.value === 'string' && credential.value.length > 20) {
        return { token: credential.value, source: 'credential-seam' };
      }
    } catch (e) {
      log.warn?.('[dsh-berget-usage] seam resolve failed: %s', messageOf(e));
    }
  }
  const fs = ctx.get('fs');
  if (fs) {
    try {
      const target = await fs.resolve(STATE_FILE);
      const state = JSON.parse(await fs.readText(target));
      if (state && typeof state.access === 'string' && state.access.length > 20) {
        return { token: state.access, source: 'state-file' };
      }
    } catch (e) {
      log.warn?.('[dsh-berget-usage] state-file fallback failed: %s', messageOf(e));
    }
  }
  return null;
}

const numOr = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const centsOf = (v) =>
  (typeof v === 'number' && isFinite(v)) ? v
  : (typeof v === 'string' && isFinite(Number(v))) ? Number(v)
  : null;

function sanitizeSeat(json) {
  if (!json || typeof json !== 'object') return null;
  const user = (json.user && typeof json.user === 'object') ? json.user : {};
  return {
    seatId: typeof json.seatId === 'number' ? json.seatId : null,
    tier: typeof json.tier === 'string' ? json.tier : null,
    hasSeat: json.hasBergetCodeSeat === true,
    email: typeof user.email === 'string' ? user.email : null,
    name: typeof user.name === 'string' ? user.name : null,
  };
}

function sanitizeSubscriptions(json) {
  if (!Array.isArray(json)) return null;
  return json.slice(0, 10).map((s) => {
    const usage = (s && s.usage && typeof s.usage === 'object') ? s.usage : {};
    return {
      name: typeof s?.name === 'string' ? s.name : null,
      planCode: typeof s?.planCode === 'string' ? s.planCode : null,
      status: typeof s?.status === 'string' ? s.status : null,
      externalId: typeof s?.externalId === 'string' ? s.externalId : null,
      currentBillingPeriodStartDate: typeof s?.currentBillingPeriodStartDate === 'string' ? s.currentBillingPeriodStartDate : null,
      currentBillingPeriodEndDate: typeof s?.currentBillingPeriodEndDate === 'string' ? s.currentBillingPeriodEndDate : null,
      usage: {
        currentUsageAmountCents: centsOf(usage.currentUsageAmountCents),
        invoicedUsageAmountCents: centsOf(usage.invoicedUsageAmountCents),
        externalHistoricalUsageAmountCents: centsOf(usage.externalHistoricalUsageAmountCents),
        fromDateTime: typeof usage.fromDateTime === 'string' ? usage.fromDateTime : null,
        toDateTime: typeof usage.toDateTime === 'string' ? usage.toDateTime : null,
      },
    };
  });
}

function sanitizeCredits(json) {
  if (!json || typeof json !== 'object') return null;
  const account = (json.account && typeof json.account === 'object') ? json.account : {};
  const balance = (json.balance && typeof json.balance === 'object') ? json.balance : {};
  return {
    name: typeof account.name === 'string' ? account.name : null,
    type: typeof account.type === 'string' ? account.type : null,
    currency: typeof balance.currency === 'string' ? balance.currency : (typeof account.currency === 'string' ? account.currency : null),
    current: centsOf(balance.current),
    available: centsOf(balance.available),
    consumedCredits: centsOf(balance.consumedCredits),
    lastUpdated: typeof balance.lastUpdated === 'string' ? balance.lastUpdated : null,
  };
}

function sanitizeSeatBudgets(json, mySeatId) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.seats) || json.seats.length === 0) return null;
  let mine = null;
  if (typeof mySeatId === 'number') {
    for (const s of json.seats) {
      if (s.seatId === mySeatId) { mine = s; break; }
    }
  }
  if (!mine) mine = json.seats[0];
  if (!mine || typeof mine !== 'object') return null;

  const period = (p) => {
    if (!p || typeof p !== 'object') return null;
    const models = {};
    const src = (p.models && typeof p.models === 'object') ? p.models : {};
    for (const k of Object.keys(src)) {
      const v = numOr(src[k]);
      if (v !== null) models[k] = v;
    }
    return { usedPercent: numOr(p.usedPercent), resetInSeconds: numOr(p.resetInSeconds), models };
  };

  const limits = {};
  const lsrc = (json.modelLimits && typeof json.modelLimits === 'object') ? json.modelLimits : {};
  for (const m of Object.keys(lsrc)) {
    const row = lsrc[m];
    if (!row || typeof row !== 'object') continue;
    limits[m] = { daily: numOr(row.daily), weekly: numOr(row.weekly), monthly: numOr(row.monthly) };
  }

  const periods = (mine.periods && typeof mine.periods === 'object') ? mine.periods : {};
  return {
    seatId: numOr(mine.seatId),
    tier: typeof mine.tier === 'string' ? mine.tier : null,
    shadowMode: mine.shadow_mode === true || mine.shadowMode === true,
    periods: {
      daily: period(periods.daily),
      weekly: period(periods.weekly),
      monthly: period(periods.monthly),
    },
    modelLimits: Object.keys(limits).length > 0 ? limits : null,
  };
}

export function apply(ctx) {
  const log = ctx.logger ?? console;

  const webServer = ctx.get('webServer');
  if (!webServer || typeof webServer.register !== 'function') {
    log.error?.('[dsh-berget-usage] no ctx.webServer service mounted — snapshot route unavailable');
    return;
  }

  const curlPathRef = { value: null };

  async function snapshot() {
    const login = await resolveToken(ctx, log);
    if (!login) {
      return {
        ok: false,
        reason: 'no-token',
        error: 'No Berget credential found. The Berget Code login credential is fed by dsh-berget-refresh — run `berget code init` or `opencode auth login` (berget) once, then hit Refresh.',
      };
    }
    const token = login.token;

    const [auth, usage, account, budgets] = await Promise.all([
      authorizedGet(ctx, curlPathRef, token, `${API}/v1/auth/status`),
      authorizedGet(ctx, curlPathRef, token, `${API}/v1/usage/tokens`),
      authorizedGet(ctx, curlPathRef, token, `${API}/v1/account`),
      authorizedGet(ctx, curlPathRef, token, `${API}/v1/seats/budgets`),
    ]);
    const results = [auth, usage, account, budgets];

    const seat = sanitizeSeat(auth.status === 200 ? auth.json : null);
    const subscriptions = sanitizeSubscriptions(usage.status === 200 ? usage.json : null);
    const credits = sanitizeCredits(account.status === 200 ? account.json : null);

    let seatBudget = null;
    let seatBudgetReason = 'error';
    if (budgets.status === 200) {
      seatBudget = sanitizeSeatBudgets(budgets.json, seat ? seat.seatId : null);
      seatBudgetReason = seatBudget ? 'ok' : 'bad-payload';
    } else if (budgets.status === 404) {
      seatBudgetReason = 'http-404';
    } else if (budgets.status === 403) {
      seatBudgetReason = 'http-403';
    } else if (budgets.status === 0) {
      seatBudgetReason = 'network';
    }

    const anyOk = results.slice(0, 3).some((x) => x.status === 200);
    const errors = results.filter((x) => x.status === 0 && x.error).map((x) => x.error);

    return {
      ok: anyOk,
      reason: anyOk ? null : 'all-failed',
      error: errors.length > 0 ? errors.join(' | ') : (anyOk ? null : 'All endpoints failed (auth likely rejected).'),
      tokenSource: login.source,
      seat,
      subscriptions,
      credits,
      seatBudget,
      seatBudgetReason,
    };
  }

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      let payload;
      try {
        payload = await snapshot();
      } catch (e) {
        payload = { ok: false, reason: 'handler', error: messageOf(e) };
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(payload));
    },
  }), 'berget-usage snapshot route');

  log.info?.('[dsh-berget-usage] snapshot route registered at %s', ROUTE_PATH);

  // Optional provider-usage registry row (see dsh-provider-usage/README.md).
  // Rides a ctx.inject WAIT rather than a ctx.get-at-apply-time probe:
  // composition order must not decide whether the row registers (reconcile
  // orders bundles by dependency name, so on some machines this plugin
  // applies before the core provides the service — the callback then parks
  // and fires whenever the core arrives, in this plugin's fiber). If the
  // core is never composed, the callback simply never runs. The row is
  // metadata only; the snapshot route above is order-independent.
  ctx.inject?.(['providerUsage'], (usageCtx) => {
    const providerUsage = usageCtx.get('providerUsage');
    if (!providerUsage || typeof providerUsage.register !== 'function') return;
    usageCtx.effect(() => providerUsage.register({
      id: 'berget',
      label: 'Berget',
      route: ROUTE_PATH,
      note: 'Berget Code seat subscription (api.berget.ai)',
    }), 'berget providerUsage registry row');
    log.info?.('[dsh-provider-usage] registry row: berget -> %s', ROUTE_PATH);
  }) ?? log.warn?.('[dsh-provider-usage] ctx.inject unavailable on this host — registry row skipped (route still serves)');
}
