// dsh-provider-usage — host-half micro tests.
// Plain node --test; no dsh runtime required (the apply() test runs against a
// cordis-shaped stub ctx: effect/provide/get + a recording webServer).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, normalizeRow, apply } from '../index.js';

test('normalizeRow: validates id, defaults label, nulls free fields', () => {
  assert.throws(() => normalizeRow(null), TypeError);
  assert.throws(() => normalizeRow({}), TypeError);
  assert.throws(() => normalizeRow({ id: 'has space' }), TypeError);
  const clean = normalizeRow({ id: 'berget', label: 'Berget', route: '/api/berget-usage/snapshot', note: 'x' });
  assert.deepEqual(clean, {
    id: 'berget', label: 'Berget',
    route: '/api/berget-usage/snapshot', note: 'x',
  });
  const minimal = normalizeRow({ id: 'acme' });
  assert.equal(minimal.label, 'acme');
  assert.equal(minimal.route, null);
  assert.equal(minimal.note, null);
});

test('createRegistry: register, disposer identity, replace, sorted list', () => {
  const reg = createRegistry();
  const d1 = reg.register({ id: 'berget', label: 'Berget' });
  const d2 = reg.register({ id: 'acme', label: 'Acme' });
  reg.register({ id: 'aa', label: 'AA' });

  assert.equal(reg.size(), 3);
  assert.deepEqual(reg.providers().map((r) => r.id), ['aa', 'acme', 'berget']);

  // Replace semantics: same id wins, previous row's disposer is inert.
  const d1b = reg.register({ id: 'berget', label: 'Berget 2' });
  assert.equal(reg.size(), 3);
  d1();
  assert.equal(reg.has('berget'), true);
  assert.equal(reg.providers().find((r) => r.id === 'berget').label, 'Berget 2');
  d1b();
  assert.equal(reg.has('berget'), false);

  // Each disposer removes only its own row.
  d2();
  assert.deepEqual(reg.providers().map((r) => r.id), ['aa']);
});

/** Minimal cordis-shaped ctx stub: effect ledger + provide/get/inject-wait + webServer recorder. */
function stubCtx({ preMounted = false } = {}) {
  const effects = [];
  const provided = new Map();
  const routes = [];
  const waiters = [];
  const services = new Map();
  const resolveService = (name) => (services.has(name) ? services.get(name) : undefined);
  if (preMounted) services.set('webServer', {
    register: (row) => {
      routes.push(row);
      return () => {
        const i = routes.indexOf(row);
        if (i >= 0) routes.splice(i, 1);
      };
    },
  });
  const made = {
    effects,
    provided,
    routes,
    waiters,
    services,
    response: null,
    logger: { info() {}, warn() {}, error() {} },
    effect(cb, label) {
      const dispose = cb();
      effects.push({ label, dispose });
      return dispose;
    },
    provide(name, value) {
      provided.set(name, value);
      return () => provided.delete(name);
    },
    /** cordis semantics: runs the callback synchronously when the services are
        mounted, otherwise parks the callback until they arrive. */
    inject(names, cb) {
      const missing = names.filter((n) => !services.has(n));
      if (missing.length === 0) cb(made);
      else waiters.push({ names, cb });
      return () => {};
    },
    get(name) {
      return resolveService(name);
    },
  };
  return made;
}

test('apply: provides providerUsage service and exact registry route; handler JSON round-trip', async () => {
  const ctx = stubCtx({ preMounted: true });
  apply(ctx);

  const service = ctx.provided.get('providerUsage');
  assert.ok(service, 'providerUsage service provided');
  assert.deepEqual(service.providers(), []);

  const route = ctx.routes.find((r) => r.kind === 'exact' && r.path === '/api/provider-usage/providers');
  assert.ok(route, 'registry route registered');

  service.register({ id: 'berget', label: 'Berget', route: '/api/berget-usage/snapshot' });

  let written = '';
  const res = {
    writeHead(code, headers) {
      ctx.response = { code, headers };
    },
    end(body) {
      written = body || '';
    },
  };
  await route.handler({}, res);
  assert.equal(ctx.response.code, 200);
  assert.match(String(ctx.response.headers['content-type']), /application\/json/);
  assert.deepEqual(JSON.parse(written), {
    ok: true,
    providers: [{ id: 'berget', label: 'Berget', route: '/api/berget-usage/snapshot', note: null }],
  });
});

test('apply: zero-inject plugin still registers the route later (service-availability order)', async () => {
  // dsh activation is service-availability driven: a plugin with no injects
  // applies BEFORE the webserver boots, so the route must ride a ctx.inject
  // wait instead of a ctx.get-at-apply-time.
  const ctx = stubCtx({ preMounted: false });
  apply(ctx);
  assert.deepEqual(ctx.routes, [], 'no route before webServer arrives');
  assert.equal(ctx.waiters.length, 1, 'route waits via ctx.inject');

  // The webserver service arrives; dsh fires the parked waiter.
  const [waiter] = ctx.waiters;
  ctx.services.set('webServer', {
    register: (row) => {
      ctx.routes.push(row);
      return () => {
        const i = ctx.routes.indexOf(row);
        if (i >= 0) ctx.routes.splice(i, 1);
      };
    },
  });
  waiter.cb({ get: (name) => ctx.services.get(name), effect: ctx.effect });
  const route = ctx.routes[0];
  assert.ok(route && route.path === '/api/provider-usage/providers');
});

test('apply: effect ledger carries typed labels for stop/update reversibility', () => {
  const ctx = stubCtx({ preMounted: true });
  apply(ctx);
  const labels = ctx.effects.map((e) => e.label);
  assert.ok(labels.some((l) => String(l).includes('registry service')), () => labels.join(','));
  assert.ok(labels.some((l) => String(l).includes('registry route')), () => labels.join(','));
  // Every effect produced a callable disposer.
  for (const e of ctx.effects) assert.equal(typeof e.dispose, 'function');
});
