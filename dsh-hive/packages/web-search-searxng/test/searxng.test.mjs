import test from 'node:test';
import assert from 'node:assert/strict';
import { SearxngSearchProvider, mapResponse, resolveBaseURL, apply } from '../index.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('resolveBaseURL: config beats env, rejects non-http', () => {
  assert.equal(resolveBaseURL({ baseURL: 'http://a:1' }, { SEARXNG_URL: 'http://b' }).host, 'a:1');
  assert.equal(resolveBaseURL({}, { SEARXNG_URL: 'http://b' }).host, 'b');
  assert.equal(resolveBaseURL({ baseURL: 'ftp://x' }, {}), undefined);
});

test('available reflects baseURL', () => {
  assert.equal(new SearxngSearchProvider({}, { env: {} }).available(), false);
  assert.equal(new SearxngSearchProvider({ baseURL: 'http://x' }, { env: {} }).available(), true);
});

test('mapResponse dedupes, caps snippets, surfaces answers', () => {
  const r = mapResponse({
    results: [{ url: 'https://a', title: 't', content: 'x'.repeat(10) }, { url: 'https://a' }, { url: '' }],
    answers: ['42'],
  }, 4);
  assert.deepEqual(r, { content: '42', sources: [{ url: 'https://a', title: 't', snippet: 'xxxx' }], truncated: false });
});

test('search builds the query and maps', async () => {
  let seen;
  const p = new SearxngSearchProvider(
    { baseURL: 'http://h:8080', engines: ['ddg'], language: 'sv' },
    { env: {}, fetch: async (url) => { seen = url; return json({ results: [{ url: 'https://z' }] }); } },
  );
  const r = await p.search({ query: 'hej' });
  assert.equal(seen.pathname, '/search');
  assert.equal(seen.searchParams.get('format'), 'json');
  assert.equal(seen.searchParams.get('engines'), 'ddg');
  assert.equal(r.sources[0].url, 'https://z');
});

test('search surfaces instance error and non-json', async () => {
  const bad = new SearxngSearchProvider({ baseURL: 'http://h' }, { env: {}, fetch: async () => json({ error: 'Invalid value' }, 400) });
  await assert.rejects(bad.search({ query: 'q' }), /HTTP 400: Invalid value/);
  const html = new SearxngSearchProvider({ baseURL: 'http://h' }, { env: {}, fetch: async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }) });
  await assert.rejects(html.search({ query: 'q' }), /search\.formats/);
});

test('apply registers with ctx.web', () => {
  const registered = [];
  apply({ web: { registerSearchProvider: (p) => registered.push(p) } }, { baseURL: 'http://x' });
  assert.equal(registered[0].id, 'searxng');
});
