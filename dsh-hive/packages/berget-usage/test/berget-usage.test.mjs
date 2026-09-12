// dsh-berget-usage — split-contract micro tests.
//
// These keep the provider-plugin split from silently regressing on either
// half: the client must offer BOTH registration routes (provider tab +
// standalone fallback), and the host must announce itself to the optional
// providerUsage registry with ctx.get (inject would park boot on a machine
// without dsh-provider-usage).
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

test('host: optional providerUsage row via ctx.get, never inject', () => {
  assert.match(hostSrc, /export const inject = \['credentials', 'subprocess'\]/, 'host inject list unchanged');
  assert.match(hostSrc, /ctx\.get\('providerUsage'\)/, 'registry lookup is optional via ctx.get');
  assert.doesNotMatch(hostSrc, /inject: \[[^\]]*providerUsage/, 'registry must NOT be an inject dependency');
  assert.match(hostSrc, /id: 'berget',/, 'registry row id');
  assert.match(hostSrc, /new RegExp|ROUTE_PATH/, 'route constant still declared');
  assert.match(hostSrc, /\/api\/berget-usage\/snapshot/, 'snapshot route path unchanged');
});
