#!/usr/bin/env node
/**
 * oc-browser-bridge — a headless "OpenChamber browser pane" for container use.
 *
 * OpenChamber's openchamber_web tools route browser actions to whichever
 * client owns the in-app browser view. In a headless container no desktop /
 * webview client is connected, so the tools fail with "No OpenChamber client
 * connected here can control a page".
 *
 * This bridge impersonates a browser-capable pane: it subscribes to the
 * server's event stream with browser=1, claims each
 * `openchamber:browser-control-request`, executes it against headless
 * Chromium via playwright-core, and posts the outcome back to
 * /api/browser-control/result.
 *
 * Usage:
 *   OC_SERVER=http://localhost:3000 node oc-browser-bridge.js
 */

import { chromium } from 'playwright-core';
import { EventSource } from 'eventsource';

const SERVER = (process.env.OC_SERVER || 'http://localhost:3000').replace(/\/+$/, '');
const DEBUG = process.env.OC_BRIDGE_DEBUG === '1';

const log = (...args) => console.log(`[oc-browser-bridge ${new Date().toISOString()}]`, ...args);
const dbg = (...args) => { if (DEBUG) log(...args); };

// ---------------------------------------------------------------------------
// Page state: a single lazy browser/context/page triple, like the pane.
// ---------------------------------------------------------------------------

let browser = null;
let context = null;
let page = null;
let pageErrors = [];

// SNG-007: Flutter web renders to WebGL; headless Chrome forbids the software
// GL fallback by default, so the page boots but paints nothing. Playwright's
// own default launch stack (--use-angle=swiftshader-webgl via its built-in
// flags) is what works here — the only addition needed is unsafe-swiftshader
// so Chrome allows the software path at all.
const BROWSER_ARGS = [
  '--no-sandbox',
  '--enable-unsafe-swiftshader',
];

const viewportSize = (name) => {
  switch (name) {
    case 'mobile': return { width: 390, height: 844 };
    case 'tablet': return { width: 820, height: 1180 };
    case 'desktop': return { width: 1280, height: 800 };
    default: return null;
  }
};

async function ensureBrowser() {
  if (browser && browser.isConnected()) return;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE || '/usr/local/bin/chrome',
    args: BROWSER_ARGS,
  });
  context = null;
  page = null;
}

async function ensurePage({ viewport } = {}) {
  await ensureBrowser();
  if (!context) {
    const size = viewportSize(viewport);
    context = await browser.newContext(size ? { viewport: size } : {});
  }
  if (page && !page.isClosed()) return page;
  page = await context.newPage();
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      pageErrors.push(`console.${msg.type()}: ${msg.text()}`);
    }
  });
  return page;
}

// ---------------------------------------------------------------------------
// Selector / visible-label resolution
// ---------------------------------------------------------------------------

// A plain `load` event is far too early for Flutter web — the engine boots,
// compiles and renders the first frame after load. Wait for network to be
// quiet and, if the page is a Flutter app, for its semantics tree to appear
// (flutter initializes semantics after the first painted frame).
async function waitForPageSettle(p) {
  // Networkidle is too strict for Flutter apps holding a live connection (the
  // challenge socket never goes idle). Cap the whole settle at ~9s so the tool
  // timeout (20s) is never crossed: first try a short idle window, then wait
  // for the Flutter frame — whichever comes first.
  await p.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  const isFlutter = await p.evaluate(() => typeof window._flutter !== 'undefined').catch(() => false);
  if (isFlutter) {
    await p.waitForSelector('flt-glass-pane, flt-semantics [role], flt-semantics button', { timeout: 6000 })
      .catch(() => {});
  }
}

function resolveTarget(p, { selector, text }) {
  if (selector) return p.locator(selector).first();
  if (text) {
    // Visible label match, same spirit as the pane: prefer buttons/links,
    // then fall back to any element containing that text.
    const byRole = p.getByRole('button', { name: text, exact: false })
      .or(p.getByRole('link', { name: text, exact: false }));
    return byRole.count().then((n) => (n > 0 ? byRole.first() : p.getByText(text, { exact: false }).first()));
  }
  throw new Error('either selector or text is required');
}

// ---------------------------------------------------------------------------
// Snapshot: visible text + interactive elements, the shape the agent reads.
// ---------------------------------------------------------------------------

async function snapshot(p) {
  return p.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const text = (document.body?.innerText || '').slice(0, 20000);

    const elements = [];
    const candidates = document.querySelectorAll(
      'a, button, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [onclick]',
    );
    for (const el of candidates) {
      if (elements.length >= 200) break;
      if (!visible(el)) continue;
      const label = (
        el.getAttribute('aria-label')
        || (el.tagName === 'INPUT' ? el.getAttribute('placeholder') : '')
        || el.textContent
        || ''
      ).trim().replace(/\s+/g, ' ').slice(0, 120);
      const selector = (() => {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const tag = el.tagName.toLowerCase();
        const cls = [...el.classList].slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
        return `${tag}${cls}`;
      })();
      elements.push({ tag: el.tagName.toLowerCase(), label, selector });
    }

    return {
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      text,
      elements,
      flutter: {
        hasSemanticsPlaceholder: !!document.querySelector('flt-semantics-placeholder'),
        hasGlassPane: !!document.querySelector('flt-glass-pane'),
        hasCanvas: !!document.querySelector('canvas'),
        engineLoaded: typeof window._flutter !== 'undefined',
        webgl: (() => {
          try {
            const c = document.createElement('canvas');
            const gl = c.getContext('webgl2') || c.getContext('webgl');
            if (!gl) return 'unavailable';
            const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
            return dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : 'available';
          } catch (e) { return `error: ${e.message}`; }
        })(),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Actions — one entry per openchamber_web tool action.
// ---------------------------------------------------------------------------

const actions = {
  'browser.open': async ({ url, viewport } = {}) => {
    if (!url) throw new Error('url is required');
    const p = await ensurePage({ viewport });
    await p.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
    await waitForPageSettle(p);
    const size = viewportSize(viewport);
    return { url: p.url(), opened: true, viewportApplied: !!size, ...(size ? { viewport: size } : {}) };
  },

  'browser.snapshot': async ({ selector } = {}) => {
    const p = await ensurePage();
    const errors = pageErrors.splice(0);
    if (selector) {
      const text = await p.locator(selector).first()
        .evaluate((el) => el.innerText || '')
        .catch(() => '');
      return { url: p.url(), title: await p.title(), selector, text: text.slice(0, 10000), errors };
    }
    const snap = await snapshot(p);
    return { ...snap, errors };
  },

  'browser.click': async (params = {}) => {
    const p = await ensurePage();
    const loc = await resolveTarget(p, params);
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    try {
      await loc.click({ timeout: 5000 });
    } catch {
      // Flutter's semantics placeholder lives off-viewport; a real mouse click
      // can't reach it. A DOM click is what enables the a11y tree — and the
      // tree is what we actually need (SNG-007). Fall back to it.
      await loc.evaluate((el) => el.click());
    }
    return { clicked: true, url: p.url() };
  },

  'browser.type': async ({ selector, value, submit } = {}) => {
    const p = await ensurePage();
    const loc = await resolveTarget(p, { selector });
    await loc.scrollIntoViewIfNeeded();
    await loc.click({ timeout: 10000 });
    // fill() goes through CDP input events; Flutter's editable text hears it
    // (SNG-007: synthetic events are deaf to Flutter, real CDP input is not).
    await loc.fill(value ?? '');
    if (submit) await loc.press('Enter');
    return { typed: true, value, submitted: submit === true };
  },

  'browser.scroll': async ({ direction, selector } = {}) => {
    const p = await ensurePage();
    if (selector) {
      await p.locator(selector).first().scrollIntoViewIfNeeded();
      return { scrolled: true, selector };
    }
    const delta = { up: -600, down: 600, top: -100000, bottom: 100000 }[direction ?? 'down'] ?? 600;
    await p.mouse.wheel(0, delta);
    await p.waitForTimeout(150);
    return { scrolled: true, direction: direction ?? 'down' };
  },

  'browser.back': async () => {
    const p = await ensurePage();
    await p.goBack({ waitUntil: 'load', timeout: 10000 }).catch(() => null);
    return { url: p.url(), title: await p.title() };
  },

  'browser.forward': async () => {
    const p = await ensurePage();
    await p.goForward({ waitUntil: 'load', timeout: 10000 }).catch(() => null);
    return { url: p.url(), title: await p.title() };
  },

  'browser.inspect': async (params = {}) => {
    const p = await ensurePage();
    const loc = await resolveTarget(p, params);
    return loc.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const styles = {};
      for (let i = 0; i < cs.length; i += 1) {
        const prop = cs[i];
        styles[prop] = cs.getPropertyValue(prop);
      }
      return { styles };
    });
  },

  'browser.capture': async () => {
    // The SERVER writes the file — the contract is that the client returns the
    // image bytes (base64), the URL, title and viewport size, and the server
    // saves them beside the project (server/lib/openchamber-control/service.js).
    const p = await ensurePage();
    await waitForPageSettle(p);
    const buffer = await p.screenshot({ fullPage: false, type: 'png' });
    const viewport = p.viewportSize() ?? { width: 0, height: 0 };
    return {
      base64: buffer.toString('base64'),
      mime: 'image/png',
      url: p.url(),
      title: await p.title(),
      viewport,
      width: viewport.width,
      height: viewport.height,
    };
  },

  'browser.resize': async ({ viewport } = {}) => {
    const size = viewportSize(viewport);
    if (!size) return { viewportApplied: false, note: `unknown viewport "${viewport}"` };
    const p = await ensurePage();
    await p.setViewportSize(size);
    return { viewportApplied: true, viewport: size };
  },
};

// ---------------------------------------------------------------------------
// Protocol client: SSE in → claim → execute → result out.
// ---------------------------------------------------------------------------

async function postJson(pathname, body) {
  const res = await fetch(`${SERVER}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${pathname} -> HTTP ${res.status}`);
  return res.json();
}

async function handleRequest({ requestId, action, parameters }) {
  const run = actions[action];
  if (!run) {
    dbg(`unknown action ${action}, leaving it alone`);
    return;
  }
  let granted;
  try {
    ({ granted } = await postJson('/api/browser-control/claim', { requestId }));
  } catch (err) {
    log(`claim failed for ${requestId}: ${err.message}`);
    return;
  }
  if (!granted) {
    dbg(`claim not granted for ${requestId} (${action})`);
    return;
  }
  log(`${requestId} ${action}`);
  try {
    const data = await run(parameters ?? {});
    await postJson('/api/browser-control/result', { requestId, ok: true, data });
    dbg(`${requestId} ${action} ok`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`${requestId} ${action} FAILED: ${message}`);
    await postJson('/api/browser-control/result', { requestId, ok: false, error: message }).catch(() => {});
  }
}

function connect() {
  const url = `${SERVER}/api/openchamber/events?browser=1`;
  log(`connecting to ${url}`);
  const es = new EventSource(url);

  es.onopen = () => log('event stream open');
  es.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg?.type !== 'openchamber:browser-control-request') return;
    const { requestId, action, parameters } = msg.properties ?? {};
    if (!requestId || !action) return;
    handleRequest({ requestId, action, parameters });
  };
  es.onerror = (err) => {
    log(`event stream error, reconnecting in 3s: ${err?.message ?? 'unknown'}`);
    es.close();
    setTimeout(connect, 3000);
  };
}

const shutdown = async () => {
  try { await browser?.close(); } catch {}
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

connect();
