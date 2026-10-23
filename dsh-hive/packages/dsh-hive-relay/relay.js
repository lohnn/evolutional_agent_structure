#!/usr/bin/env node
/**
 * dsh-relay — transparent HTTP(+upgrade) proxy for dsh web with a boot-URL
 * sidecar. Replaces the plain socat pipe (0.0.0.0:3080 -> 127.0.0.1:4501).
 *
 * Everything except the extra /_/ paths is proxied to the upstream dsh web
 * listener byte-for-byte in spirit: Host and all headers are forwarded
 * verbatim (dsh's /api browser-trust fence and its Host-derived cookie
 * authority both read the browser-visible Host, so rewriting Host would
 * break auth), request/response bodies stream (POST RPC, attachments), and
 * HTTP upgrades (WebSocket) become a raw socket tunnel.
 *
 * Extra endpoint, clearly named, serving the LATEST launch-token URL printed
 * by dsh web in its boot log:
 *
 *   GET /_/healthz    -> 200 "ok" (liveness; never touches the log)
 *   GET /_/boot-url   -> 302 redirect to the current boot's tokened URL
 *                        rewritten to the public origin (click-openable);
 *                        ?format=json returns {"url": "..."} instead.
 *
 * Contract of the served URL (verified against dsh@0.2.1-rc.2, see
 * docs/token-consumption.md): the token is a per-process random constant,
 * redemption is stateless and NOT consumed — every browser presenting it
 * mints its own session cookie — but it expires with the boot (a new dsh web
 * boot prints a new token; the old URL 401s). The boot log file is re-read on
 * every request, so a restarted dsh web is picked up automatically.
 *
 * Security posture: this endpoint exposes the boot launch token to anyone who
 * can reach this port. That is the approved deployment posture here: single
 * host, published only through the user's Tailscale Serve (tailnet-trusted);
 * a token readable by anything on the tailnet is acceptable. Do not republish
 * this port anywhere wider without a new user decision.
 *
 * Log discipline: the sidecar's own log lines carry METHOD + PATH-ONLY. The
 * query string (which holds the token on the redeem request) is never logged,
 * and the served Location value is never logged.
 *
 * Configuration via environment (all optional):
 *   RELAY_PORT      listen port                     (default 3080)
 *   RELAY_HOST      listen address                  (default 0.0.0.0)
 *   RELAY_UP_HOST   upstream host                   (default 127.0.0.1)
 *   RELAY_UP_PORT   upstream port                   (default 4501)
 *   RELAY_LOG       dsh web boot log file           (default /tmp/dsh-web.log)
 *   RELAY_ORIGIN    public origin to rewrite onto   (default
 *                   http://127.0.0.1:3080 — set your own public https origin)
 *
 * Zero dependencies; runs under plain node (v18+). Sourced as a plain file,
 * supervised by svcwatch (.opencode/services/dsh-relay.toml): stdout/stderr
 * land in /run/svc/logs/dsh-relay.log, TERM/KILL handled by svcwatch's group
 * stop; no pipeline children, so a restart can never strand a sibling holding
 * the port.
 */
"use strict";

const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");

const PORT = Number(process.env.RELAY_PORT || 3080);
const HOST = process.env.RELAY_HOST || "0.0.0.0";
const UP_HOST = process.env.RELAY_UP_HOST || "127.0.0.1";
const UP_PORT = Number(process.env.RELAY_UP_PORT || 4501);
const BOOT_LOG = process.env.RELAY_LOG || "/tmp/dsh-web.log";
const PUBLIC_ORIGIN = (process.env.RELAY_ORIGIN || "http://127.0.0.1:3080").replace(/\/+$/, "");

/** The one printed line carrying the token, e.g.
 *  `dsh web: http://127.0.0.1:4501/?token=<43 base64url chars>` */
const TOKEN_URL_RE = /dsh web: \S*\/?\?token=([A-Za-z0-9_-]+)/;
/** Last matching URL line in the log wins: tee truncates per dsh web boot, so
 *  the file's only/most recent line is the current boot's URL. */
function readBootToken() {
  let text;
  try {
    text = fs.readFileSync(BOOT_LOG, "utf8");
  } catch {
    return null; // log not created yet (dsh web still booting) — caller answers 503
  }
  // Token values are base64url; scanning line-by-line keeps any exotic bytes
  // in other lines out of the match.
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = TOKEN_URL_RE.exec(lines[i]);
    if (m) return m[1];
  }
  return null;
}

function bootUrlPath(token) {
  return `/?token=${token}`;
}

function log(msg) {
  // PATH-ONLY discipline: callers never pass a query string here.
  process.stdout.write(`[dsh-relay] ${new Date().toISOString()} ${msg}\n`);
}

function res_json(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body + "\n");
}

/** Hop-by-hop headers (RFC 9110 §7.6.1) must not be forwarded. */
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
]);

function forwardableHeaders(req) {
  const out = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(name)) continue;
    out[name] = value;
  }
  return out;
}

/**
 * Proxy one plain HTTP request. The raw req/res pair streams in both
 * directions so SSE (text/event-stream) and chunked flows pass unbuffered,
 * and POST bodies (composer RPC, attachments) pass sized or chunked.
 */
function proxyRequest(req, res) {
  const upstream = http.request({
    host: UP_HOST,
    port: UP_PORT,
    method: req.method,
    path: req.url,
    headers: forwardableHeaders(req), // Host etc. forwarded verbatim
  }, (up) => {
    const headers = { ...up.headers };
    for (const h of HOP_BY_HOP) delete headers[h];
    res.writeHead(up.statusCode || 502, headers);
    up.pipe(res);
    up.on("error", () => res.destroy());
  });
  upstream.on("socket", (socket) => {
    socket.setTimeout(0); // streaming responses may idle long; never time it out
    socket.setNoDelay(true);
  });
  upstream.on("error", (err) => {
    if (res.headersSent) { res.destroy(); return; }
    res_json(res, 502, {
      error: "upstream-unavailable",
      detail: `dsh web at ${UP_HOST}:${UP_PORT}: ${err.code || err.message}`,
    });
  });
  req.pipe(upstream); // request body streams through (buffered or chunked)
  req.on("error", () => upstream.destroy());
}

/**
 * Tunnel an HTTP upgrade (WebSocket) through a raw TCP socket pair. Headers
 * are re-serialized verbatim from rawHeaders (Host kept — dsh's fence reads
 * it), then both sides are pure pipes from there on.
 */
function tunnelUpgrade(req, clientSocket, head) {
  const upstream = net.connect(UP_PORT, UP_HOST, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    upstream.write(lines.join("\r\n") + "\r\n\r\n");
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  const teardown = (who) => () => {
    clientSocket.destroy();
    upstream.destroy();
    if (who) log(`upgrade closed (${who})`);
  };
  upstream.on("error", (err) => {
    // Best-effort HTTP/1.1 rejection when the socket still speaks HTTP.
    if (clientSocket.writable) {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\ncontent-length: 0\r\n\r\n");
    }
    clientSocket.destroy();
    log(`upgrade upstream error: ${err.code || err.message}`);
  });
  clientSocket.on("error", teardown("client"));
  upstream.on("close", teardown("upstream"));
  clientSocket.on("close", () => upstream.destroy());
}

/** The sidecar endpoint. Returns true when the request was served here. */
function serveSidecar(req, res, url) {
  // Liveness: no dependencies, no log reads — answers even while upstream is down.
  if (url.pathname === "/_/healthz" && (req.method === "GET" || req.method === "HEAD")) {
    let text = "ok";
    if (req.method === "HEAD") { res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); res.end(); return true; }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end(text + "\n");
    return true;
  }
  if (url.pathname !== "/_/boot-url") return false;
  if (req.method !== "GET" && req.method !== "HEAD") {
    res_json(res, 405, { error: "method not allowed; use GET" });
    return true;
  }
  const token = readBootToken();
  if (token === null) {
    res_json(res, 503, {
      error: "boot-url-unavailable",
      detail: `no dsh web boot line found in ${BOOT_LOG} yet; retry shortly`,
    });
    return true;
  }
  const path = bootUrlPath(token);
  if (new URL(req.url, "http://dsh.invalid").searchParams.get("format") === "json") {
    const location = `${PUBLIC_ORIGIN}${path}`;
    // Log the shape, never the value (token lives in the query string).
    log(`boot-url served (json) — token length ${token.length}`);
    res_json(res, 200, { url: location });
    return true;
  }
  // Default: one-click. A 302 makes even a hand-copied /_/boot-url open the
  // login straight through Tailscale Serve.
  log(`boot-url served (redirect) — token length ${token.length}`);
  res.writeHead(302, {
    location: `${PUBLIC_ORIGIN}${path}`,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  res.end();
  return true;
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url ?? "/", "http://dsh.invalid");
  } catch {
    res_json(res, 400, { error: "bad request url" });
    return;
  }
  if (serveSidecar(req, res, url)) return;
  // Log method + pathname only: the query string can carry the token.
  log(`${req.method} ${url.pathname}`);
  proxyRequest(req, res);
});

server.on("upgrade", (req, clientSocket, head) => {
  let path = "?";
  try {
    path = new URL(req.url ?? "/", "http://dsh.invalid").pathname;
  } catch { socketless_400(clientSocket); return; }
  log(`UPGRADE ${path}`);
  tunnelUpgrade(req, clientSocket, head);
});

function socketless_400(socket) {
  socket.write("HTTP/1.1 400 Bad Request\r\nconnection: close\r\ncontent-length: 0\r\n\r\n");
  socket.destroy();
}

server.on("error", (err) => {
  // Loud on stderr => svcwatch log; a wrong bind must be visible, not silent.
  process.stderr.write(`[dsh-relay] FATAL ${err.code || ""} ${err.message}\n`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const addr = server.address();
  const shown = typeof addr === "object" && addr ? `${addr.address}:${addr.port}` : String(addr);
  log(`listening on ${shown} -> http://${UP_HOST}:${UP_PORT} (boot log: ${BOOT_LOG}, origin: ${PUBLIC_ORIGIN})`);
});

process.on("SIGTERM", () => {
  log("SIGTERM — closing listener"); // svcwatch group-stop; sockets die with us
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
});
