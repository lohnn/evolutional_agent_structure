// dsh-web-search-searxng — SearXNG-backed search provider for the ctx.web seam.
//
// One search is a plain GET against the instance's `/search?format=json`
// endpoint: no model turn, no API key. Configuration is the plugin row's own
// Config (Cordis settings forms project it automatically on dsh >= 0.1.7), with
// $SEARXNG_URL as the fallback when `baseURL` is empty.
//
// Deliberately free of the removed `settings.installSection` API: the row's
// config arrives through apply() and a config edit re-applies the plugin, so
// no settings-seam wiring is needed.
import z from '@deepseek-ai/schemastery';
import { WebError } from '@deepseek-ai/dsh-web';

export const name = 'web-search-searxng';
export const inject = ['web'];

export const PROVIDER_ID = 'searxng';
export const BASE_URL_ENV = 'SEARXNG_URL';
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_SNIPPET_CHARS = 500;
const ERROR_BODY_MAX_CHARS = 300;

export const Config = z.object({
  baseURL: z.string().description('SearXNG instance root, e.g. http://127.0.0.1:8080. Empty = $SEARXNG_URL.'),
  categories: z.array(z.string()).description('SearXNG categories to query.'),
  engines: z.array(z.string()).description('Restrict to these engines.'),
  language: z.string().description('Search language, e.g. en or sv-SE.'),
  timeRange: z.union(['day', 'week', 'month', 'year']),
  safesearch: z.union([0, 1, 2]),
  timeoutMs: z.natural().min(1).default(DEFAULT_TIMEOUT_MS),
  maxSnippetChars: z.natural().min(1).default(DEFAULT_MAX_SNIPPET_CHARS),
});

/** Parse an http(s) URL or return undefined. Cheap and synchronous. */
export function parseBaseURL(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Effective instance URL: row config first, then the environment. */
export function resolveBaseURL(config, env = process.env) {
  return parseBaseURL(config?.baseURL) ?? parseBaseURL(env[BASE_URL_ENV]);
}

function text(value) {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length === 0 ? undefined : t;
}

function cap(value, max) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** Map a `format=json` body to the seam's WebSearchResult. */
export function mapResponse(body, maxSnippetChars = DEFAULT_MAX_SNIPPET_CHARS) {
  const raw = Array.isArray(body?.results) ? body.results : [];
  const seen = new Set();
  const sources = [];
  for (const r of raw) {
    const url = text(r?.url);
    if (url === undefined || seen.has(url)) continue;
    seen.add(url);
    const title = text(r?.title);
    const snippet = text(r?.content);
    const publishedAt = text(r?.publishedDate);
    sources.push({
      url,
      ...(title && { title }),
      ...(snippet && { snippet: cap(snippet, maxSnippetChars) }),
      ...(publishedAt && { publishedAt }),
    });
  }
  const answers = Array.isArray(body?.answers)
    ? body.answers.map((a) => text(typeof a === 'string' ? a : a?.answer)).filter(Boolean)
    : [];
  // truncated stays false: the seam owns maxResults enforcement.
  return { ...(answers.length && { content: answers.join('\n') }), sources, truncated: false };
}

async function instanceError(response) {
  try {
    const body = JSON.parse(await response.text());
    const e = typeof body?.error === 'string' ? body.error.trim() : '';
    return e ? cap(e, ERROR_BODY_MAX_CHARS) : undefined;
  } catch {
    return undefined;
  }
}

export class SearxngSearchProvider {
  id = PROVIDER_ID;

  constructor(config, { fetch: fetchImpl = globalThis.fetch, env = process.env } = {}) {
    this.config = config ?? {};
    this.fetch = fetchImpl;
    this.env = env;
  }

  available() {
    return resolveBaseURL(this.config, this.env) !== undefined;
  }

  async search(request, signal) {
    const c = this.config;
    const base = resolveBaseURL(c, this.env);
    if (!base) {
      throw new WebError(`SearXNG has no usable baseURL; set it on the plugin row or via $${BASE_URL_ENV}`, 'WEB_PROVIDER_ERROR');
    }
    const url = new URL('search', base.href.endsWith('/') ? base.href : `${base.href}/`);
    url.searchParams.set('q', request.query);
    url.searchParams.set('format', 'json');
    if (c.categories?.length) url.searchParams.set('categories', c.categories.join(','));
    if (c.engines?.length) url.searchParams.set('engines', c.engines.join(','));
    if (c.language) url.searchParams.set('language', c.language);
    if (c.timeRange) url.searchParams.set('time_range', c.timeRange);
    if (c.safesearch !== undefined) url.searchParams.set('safesearch', String(c.safesearch));

    const timeoutMs = c.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response;
    try {
      response = await this.fetch(url, {
        method: 'GET',
        // A self-hosted instance has no reason to redirect a search.
        redirect: 'error',
        headers: { accept: 'application/json' },
        signal: combined,
      });
    } catch (error) {
      if (signal?.aborted) throw new WebError('SearXNG search aborted', 'WEB_ABORTED', { cause: signal.reason });
      if (timeout.aborted) throw new WebError(`SearXNG search timed out after ${timeoutMs}ms`, 'WEB_PROVIDER_ERROR', { cause: timeout.reason });
      throw new WebError(`SearXNG request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
    }

    if (!response.ok) {
      const reason = await instanceError(response);
      const hint = response.status === 403 ? ' (bot filter? run your own instance)' : '';
      throw new WebError(`SearXNG search failed with HTTP ${response.status}${reason ? `: ${reason}` : ''}${hint}`, 'WEB_PROVIDER_ERROR');
    }
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('json')) {
      throw new WebError(`SearXNG returned "${type || 'no content-type'}" instead of JSON; add "json" to search.formats in settings.yml`, 'WEB_PROVIDER_ERROR');
    }
    let body;
    try {
      body = await response.json();
    } catch (error) {
      throw new WebError(`SearXNG returned an unparseable body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
    }
    return mapResponse(body, c.maxSnippetChars ?? DEFAULT_MAX_SNIPPET_CHARS);
  }
}

/** Registration is effect-scoped: it unregisters with this fiber (HMR, disable, config reload). */
export function apply(ctx, config) {
  ctx.web.registerSearchProvider(new SearxngSearchProvider(config));
}
