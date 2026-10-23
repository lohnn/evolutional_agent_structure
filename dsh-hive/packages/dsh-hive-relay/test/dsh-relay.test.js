// dsh-hive-relay tests — spawn the relay as a real process against a stub
// upstream and exercise its public surface end to end. Nothing here touches
// dsh web, profiles, or any persistent state: every run uses throwaway ports
// and temp files under os.tmpdir().
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RELAY = path.resolve(__dirname, "..", "relay.js");

/** Bind port 0, learn a free port, release it. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function get(port, reqPath, { host = "127.0.0.1", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    // Always dial loopback; `host` is the browser-visible Host HEADER only.
    const req = http.get(
      { host: "127.0.0.1", port, path: reqPath, headers: { host, ...headers } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on("error", reject);
  });
}

/** Start the relay + one stub upstream. Resolves ports and the relay log. */
async function startStack(t, { bootLog = "dsh web: http://127.0.0.1:4502/?token=TESTTOKEN", withBootLog = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-relay-test-"));
  const logPath = path.join(dir, "boot.log");
  const upstreamPort = await freePort();
  const relayPort = await freePort();

  const upstream = http.createServer((req, res) => {
    res.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
    res.end("upstream-401-body");
    req.resume();
  });
  await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve));

  if (withBootLog) fs.writeFileSync(logPath, bootLog + "\n");

  const relay = spawn(process.execPath, [RELAY], {
    env: {
      ...process.env,
      RELAY_PORT: String(relayPort),
      RELAY_HOST: "127.0.0.1",
      RELAY_UP_PORT: String(upstreamPort),
      RELAY_LOG: logPath,
      RELAY_ORIGIN: "https://studio.example.test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let relayLog = "";
  const logChunks = (buf) => (relayLog += buf.toString("utf8"));
  relay.stdout.on("data", logChunks);
  relay.stderr.on("data", logChunks);
  t.after(() => {
    relay.kill("SIGTERM");
    upstream.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // readiness: healthz answers
  for (let i = 0; ; i++) {
    try {
      const r = await get(relayPort, "/_/healthz");
      if (r.status === 200) break;
    } catch {
      /* not listening yet */
    }
    if (i > 50) throw new Error(`relay did not come up; log:\n${relayLog}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return { relayPort, upstreamPort, relayLog: () => relayLog, logPath };
}

test("healthz answers without touching the boot log", async (t) => {
  const { relayPort, relayLog } = await startStack(t, { withBootLog: false });
  const r = await get(relayPort, "/_/healthz");
  assert.equal(r.status, 200);
  assert.equal(r.body.trim(), "ok");
  assert.equal(r.headers["cache-control"], "no-store");
  assert.match(relayLog(), /listening/);
});

test("boot-url rewrites to the origin; json form returns the same url", async (t) => {
  const { relayPort } = await startStack(t);
  const red = await get(relayPort, "/_/boot-url");
  assert.equal(red.status, 302);
  assert.ok(red.headers.location.startsWith("https://studio.example.test/?token=TESTTOKEN"), red.headers.location);
  const json = await get(relayPort, "/_/boot-url?format=json");
  assert.equal(json.status, 200);
  assert.equal(JSON.parse(json.body).url, "https://studio.example.test/?token=TESTTOKEN");
});

test("a missing boot log answers 503 with a retry hint", async (t) => {
  const { relayPort } = await startStack(t, { withBootLog: false });
  const r = await get(relayPort, "/_/boot-url");
  assert.equal(r.status, 503);
  assert.match(JSON.parse(r.body).error, /boot-url-unavailable/);
});

test("boot-url path listing is last-line-wins and re-reads per request", async (t) => {
  const { relayPort, logPath } = await startStack(t);
  const before = await get(relayPort, "/_/boot-url?format=json");
  const oldUrl = JSON.parse(before.body).url;
  // A restarted dsh web truncates the log (tee) and prints a fresh token.
  fs.writeFileSync(logPath, "dsh web: http://127.0.0.1:4501/?token=FRESHTOKEN\n");
  const after = await get(relayPort, "/_/boot-url?format=json");
  const newUrl = JSON.parse(after.body).url;
  assert.notEqual(newUrl, oldUrl);
  assert.ok(newUrl.includes("FRESHTOKEN"));
});

test("sidecar paths are strict about methods and unknown /_/ paths proxy through", async (t) => {
  const { relayPort } = await startStack(t);
  assert.equal((await post(relayPort, "/_/boot-url")).status, 405);
  // Unknown /_ paths fall through to the proxy (they are not owned here).
  const unknown = await get(relayPort, "/_/nothing");
  assert.match(unknown.body, /upstream-401-body/);
});

async function post(port, reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: reqPath, method: "POST" }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("proxy passes upstream status, body, and Host verbatim", async (t) => {
  const seen = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-relay-test-"));
  const logPath = path.join(dir, "boot.log");
  fs.writeFileSync(logPath, "dsh web: http://127.0.0.1:4502/?token=TESTTOKEN\n");
  const upstreamPort = await freePort();
  const relayPort = await freePort();
  const upstream = http.createServer((req, res) => {
    seen.host = req.headers.host; // the fence reads this — must arrive untouched
    seen.url = req.url;
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html>index</html>");
    req.resume();
  });
  await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve));
  const relay = spawn(process.execPath, [RELAY], {
    env: {
      ...process.env,
      RELAY_PORT: String(relayPort),
      RELAY_HOST: "127.0.0.1",
      RELAY_UP_PORT: String(upstreamPort),
      RELAY_LOG: logPath,
      RELAY_ORIGIN: "https://studio.example.test",
    },
    stdio: "ignore",
  });
  t.after(() => {
    relay.kill("SIGTERM");
    upstream.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  for (let i = 0; ; i++) {
    try {
      if ((await get(relayPort, "/_/healthz")).status === 200) break;
    } catch {}
    if (i > 50) throw new Error("relay did not come up");
    await new Promise((r) => setTimeout(r, 100));
  }
  const r = await get(relayPort, "/?token=TESTTOKEN", { host: "studio.example.test" });
  assert.equal(r.status, 200);
  assert.equal(r.body, "<html>index</html>");
  assert.equal(r.headers["content-type"], "text/html");
  assert.equal(seen.host, "studio.example.test"); // never rewritten
  assert.equal(seen.url, "/?token=TESTTOKEN");
});

test("relay never writes token material into its own log", async (t) => {
  const { relayPort, relayLog } = await startStack(t);
  await get(relayPort, "/_/boot-url");
  await get(relayPort, "/_/boot-url?format=json");
  await get(relayPort, "/?token=TESTTOKEN"); // the redeem request carries a token
  await get(relayPort, "/_/healthz");
  await new Promise((r) => setTimeout(r, 200)); // let async log writes land
  const log = relayLog();
  assert.ok(log.includes("GET /"), "requests are logged");
  assert.ok(!/token=/.test(log), "no token= anywhere in the relay log");
  assert.ok(!log.includes("TESTTOKEN"), "no token value anywhere in the relay log");
});
