# dsh-web-search-searxng

A SearXNG search provider for the dsh `ctx.web` seam. It is an in-house port of
the community `dsh-web-search-searxng` 0.4.0 package. That package stopped
working on dsh 0.1.7-alpha.2 because it called `settings.installSection`, which
has been removed.

- Config: the plugin row's `Config` (`baseURL`, `categories`, `engines`,
  `language`, `timeRange`, `safesearch`, `timeoutMs`, `maxSnippetChars`). dsh
  renders it as a settings form. An empty `baseURL` falls back to `$SEARXNG_URL`.
- The bundle patch sets `baseURL: http://127.0.0.1:8080` and pins
  `web.searchProvider: searxng`.
- The instance must have `json` in `search.formats`.
- Unlike the original, there is no custom settings card. The generic form
  covers the same fields.

Tests: `node --test`.
