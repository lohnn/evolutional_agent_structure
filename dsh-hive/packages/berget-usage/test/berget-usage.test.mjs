// dsh-berget-usage — split-contract micro tests.
//
// These keep the provider-plugin split from silently regressing on either
// half: the client must offer BOTH registration routes (provider tab +
// standalone fallback), and the host must announce itself to the optional
// providerUsage registry through a ctx.inject WAIT (order-agnostic across
// bundle orders; absent core = callback never fires, boot never parks).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const clientSrc = readFileSync(join(here, '..', 'client.js'), 'utf8');
const hostSrc = readFileSync(join(here, '..', 'index.js'), 'utf8');

test('client: offers the provider-usage tab registration', () => {
  assert.match(clientSrc, /slots\.inject\('provider-usage\.tab'/, 'provider-usage.tab inject present');
  assert.match(clientSrc, /id: 'berget', order: 100, label: 'Berget'/, 'tab entry basics present');
  assert.doesNotMatch(clientSrc, /inject: \[[^\]]*providerUsage/, 'client must not inject a host service');
});

test('client: keeps the standalone fallback for core-less machines', () => {
  assert.match(clientSrc, /window\.__DSH_BOOT__/, 'boot-manifest probe present');
  assert.match(clientSrc, /PROVIDER_USAGE_CORE = 'dsh-provider-usage'/, 'core id probe present');
  assert.match(clientSrc, /slots\.inject\('main'/, 'standalone main registration present');
  assert.match(clientSrc, /slots\.inject\('sidebar\.panellist'/, 'standalone sidebar registration present');
  assert.match(clientSrc, /key: 'berget-usage'/, 'standalone main key unchanged');
});

test('client: fetches its own snapshot route (provider-owned, core-independent)', () => {
  assert.match(clientSrc, /\/api\/berget-usage\/snapshot/, 'snapshot URL present');
});

test('host: registry row rides a ctx.inject wait (order-agnostic), never an inject dep', () => {
  assert.match(hostSrc, /export const inject = \['credentials', 'subprocess'\]/, 'host inject list unchanged (boot never parks on the core)');
  assert.ok(hostSrc.includes("ctx.inject?.(['providerUsage']"), 'registry row waits via ctx.inject — no apply-time ctx.get race across bundle orders');
  assert.match(hostSrc, /providerUsage\.register\(\{/, 'registry call present');
  assert.match(hostSrc, /id: 'berget',/, 'registry row id');
  assert.match(hostSrc, /new RegExp|ROUTE_PATH/, 'route constant still declared');
  assert.match(hostSrc, /\/api\/berget-usage\/snapshot/, 'snapshot route path unchanged');
});

test('host: registry row registers on late core arrival and is a no-op absent one', async () => {
  // Simulate the other machine's ordering: this plugin applies BEFORE
  // dsh-provider-usage provides the service. The wait must fire when it
  // arrives, and must not require it.
  // berget apply() early-returns without a webServer; provide a stub route
  // sink so the registry-wait block is reached.
  const provided = new Map([['webServer', { register: () => () => {} }]]);
  const effects = [];
  const waiters = [];
  let registered = null;
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    effect(cb, label) {
      effects.push(cb());
      return cb;
    },
    get(name) {
      return provided.get(name);
    },
    inject(names, cb) {
      const missing = names.filter((n) => !provided.has(n));
      if (missing.length > 0) {
        waiters.push(cb);
        return;
      }
      cb({ get: (name) => provided.get(name), effect: ctx.effect });
    },
  };
  const host = await import(join(here, '..', 'index.js'));
  host.apply(ctx);
  assert.equal(registered, null, 'no row before the core provides');
  assert.equal(waiters.length, 1, 'row waits on providerUsage');

  // The core boots later and provides the service.
  provided.set('providerUsage', {
    register: (row) => {
      registered = row;
      return () => {};
    },
  });
  waiters[0]({ get: (name) => provided.get(name), effect: ctx.effect });
  assert.ok(registered, 'row registered once the core arrives');
  assert.equal(registered.id, 'berget');
  assert.equal(registered.route, '/api/berget-usage/snapshot');
});
