/**
 * dsh-provider-usage — host half.
 *
 * The GENERAL SHAPE of the usage panel. It owns no provider: provider-specific
 * subscription plugins (dsh-berget-usage today, one per provider) plug in from
 * both sides:
 *
 *   Host:   a provider serves its own snapshot route (its own credential
 *           handling, its own sanitizers) and MAY announce itself here:
 *
 *             const providerUsage = ctx.get('providerUsage');   // optional — never inject
 *             providerUsage?.register({ id: 'berget', label: 'Berget',
 *                                       route: '/api/berget-usage/snapshot' });
 *
 *           This half exposes the optional `providerUsage` service and one
 *           debug route so a human can see (via curl) which provider plugins
 *           the composition currently mounts:
 *
 *             GET /api/provider-usage/providers
 *               -> { ok, providers: [{ id, label, route, note }] }
 *
 *           (The route mounts through a ctx.inject(['webServer']) wait — dsh
 *           activation is service-availability driven, and a zero-`inject`
 *           plugin applies before the webserver boots.)
 *
 *   Client: a provider registers one tab into the shared panel:
 *
 *             slots.inject('provider-usage.tab', () => slots.register(
 *               { name: 'provider-usage.tab', id: 'berget', order: 100, label: 'Berget' },
 *               () => React.createElement(MyProviderPanel),
 *             ));
 *
 * The tab chrome, the sidebar entry and the `main` panel key are owned here —
 * providers must NOT touch 'main' or 'sidebar.panellist' themselves. The full
 * plugin contract (including a copy-paste provider skeleton) lives in
 * ./README.md in this package.
 */

export const name = 'dsh-provider-usage';
export const inject = [];

const ROUTE_PATH = '/api/provider-usage/providers';

const messageOf = (e) => String((e && e.message) || e);
const idPattern = /^[a-z0-9][a-z0-9-]*$/i;

/** Validate and normalize one registry row; throws with a actionable message. */
export function normalizeRow(row) {
  if (!row || typeof row !== 'object') {
    throw new TypeError('providerUsage.register: needs a row object { id, label?, route?, note? }');
  }
  if (typeof row.id !== 'string' || !idPattern.test(row.id)) {
    throw new TypeError(
      `providerUsage.register: row.id must be a short slug string like "berget", got ${JSON.stringify(row.id)}`,
    );
  }
  const clean = {
    id: row.id,
    label: typeof row.label === 'string' && row.label.length > 0 ? row.label : row.id,
    route: typeof row.route === 'string' && row.route.length > 0 ? row.route : null,
    note: typeof row.note === 'string' && row.note.length > 0 ? row.note : null,
  };
  return clean;
}

/** Pure registry state machine: hoisted for tests, used by apply() below. */
export function createRegistry() {
  const rows = new Map();
  return {
    register(row) {
      const clean = normalizeRow(row);
      rows.set(clean.id, clean);
      return () => {
        if (rows.get(clean.id) === clean) rows.delete(clean.id);
      };
    },
    providers() {
      return [...rows.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },
    has(id) {
      return rows.has(id);
    },
    size() {
      return rows.size;
    },
  };
}

export function apply(ctx) {
  const log = ctx.logger ?? console;
  const registry = createRegistry();

  const service = {
    register: (row) => {
      const clean = normalizeRow(row);
      const dispose = registry.register(clean);
      log.info?.('[dsh-provider-usage] provider registered: %j', clean);
      return dispose;
    },
    providers: () => registry.providers(),
  };

  // Publish the optional service. A provider host half reads it with
  // ctx.get('providerUsage') — never with inject — so a provider plugin stays
  // bootable (and keeps serving its snapshot) on machines without this core.
  ctx.effect(() => {
    const provide = typeof ctx.provide === 'function'
      ? (n, v) => ctx.provide(n, v)
      : ctx.reflect && typeof ctx.reflect.provide === 'function'
        ? (n, v) => ctx.reflect.provide(n, v)
        : null;
    if (!provide) {
      log.warn?.('[dsh-provider-usage] no provide capability on ctx — providerUsage service unavailable');
      return () => {};
    }
    const dispose = provide('providerUsage', service);
    return () => ( typeof dispose === 'function' ? dispose() : undefined );
  }, 'provider-usage registry service');

  // The registry route waits for the webServer service (activation is
  // service-availability driven in dsh — a plugin with no injects mounts
  // BEFORE the webserver finishes booting). ctx.inject([...], cb) runs the
  // callback once the service appears, in this plugin's fiber; on a web-less
  // profile it simply never runs, and the providerUsage service above still
  // works — that is why webServer is a wait, not a hard `inject`.
  ctx.inject?.(['webServer'], (serverCtx) => {
    const webServer = serverCtx.get('webServer');
    if (!webServer || typeof webServer.register !== 'function') {
      log.warn?.('[dsh-provider-usage] webServer arrived without a register method — registry route skipped');
      return;
    }
    serverCtx.effect(() => webServer.register({
      kind: 'exact',
      path: ROUTE_PATH,
      handler: async (req, res) => {
        let payload;
        try {
          payload = { ok: true, providers: service.providers() };
        } catch (e) {
          payload = { ok: false, error: messageOf(e) };
        }
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(JSON.stringify(payload));
      },
    }), 'provider-usage registry route');
    log.info?.('[dsh-provider-usage] registry route registered at %s', ROUTE_PATH);
  }) ?? log.warn?.('[dsh-provider-usage] ctx.inject unavailable on this host — registry route unavailable');

  log.info?.('[dsh-provider-usage] applied (usage-tab core; providers plug in via slots + providerUsage)');
}
