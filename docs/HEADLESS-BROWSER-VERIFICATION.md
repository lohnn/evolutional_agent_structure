# Headless-Browser Verification Recipe (CONTRACT)

**Owner:** hive-infra · **Status:** canonical · **Applies to:** every capability shipping an interactive web UI on this workspace.

This is the workspace's single "done gate" for interactive web UIs. Green build + clean
analyze proves **nothing** about whether the thing renders or is usable (W-072). The only
proof is a headless run of the **built bundle** in a real browser. Conform to this
mechanically — do not invent your own launch flags or skip the gate.

---

## 0. This box (aarch64)

- Native arm64 Chromium is cached by Playwright at:
  `/root/.cache/ms-playwright/chromium-1228/chrome-linux/chrome`
- Use that binary directly (both bash-Playwright and chrome-devtools-mcp point at it).

---

## 1. One-time host setup

The browser binary is present but needs system shared libs. Install once per host:

```bash
npx playwright install-deps chromium
```

(apt-installs: libglib, libnss, libgbm, libpango, cairo, cups, xvfb, fonts.)

**Detect it's already done** (skip the install if this exits 0):

```bash
ldd /root/.cache/ms-playwright/chromium-1228/chrome-linux/chrome | grep -q 'not found' \
  && echo "NEEDS install-deps" || echo "deps OK"
```

If `ldd` reports any `=> not found`, run the install-deps line above.

---

## 2. Launch config for this box

**Executable path:**
```
/root/.cache/ms-playwright/chromium-1228/chrome-linux/chrome
```

**Base flags (all targets):**
```
--no-sandbox
```
(Headless itself is set via Playwright's `headless: true` in MODE (a), or `--headless`
in the MCP command in MODE (b) — don't also pass `--headless` in `args`.)

**MANDATORY extra flags for CanvasKit / Flutter-web targets** (I-071 — without these the
canvas paints **blank** and no test will catch it):
```
--use-gl=swiftshader  --enable-unsafe-swiftshader
```

Plain DOM targets (Jaspr SSR/HTML, React, static) do **not** need the swiftshader flags,
but they are harmless if left on.

---

## 3. Minimal driver pattern

Drive against the **BUILT bundle** (the served `build/`/`dist` output), **never** dev
source (W-072). Capture all three browser-only error channels as text (I-071), then write a
full-page PNG. Copy-paste and adapt `URL` / `OUT`:

```js
// verify.mjs — run: node verify.mjs
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:8080/';   // BUILT bundle, not dev source
const OUT = process.env.OUT || '/tmp/verify.png';
const CANVASKIT = process.env.CANVASKIT === '1';            // set 1 for Flutter-web/CanvasKit

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1228/chrome-linux/chrome',
  headless: true,
  args: [
    '--no-sandbox',
    ...(CANVASKIT ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] : []),
  ],
});

const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE.error: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', r => errors.push('REQUESTFAILED: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

await page.goto(URL, { waitUntil: 'networkidle' });
// For CanvasKit, give the canvas a beat to paint before asserting/screenshotting:
if (CANVASKIT) await page.waitForTimeout(2000);

await page.screenshot({ path: OUT, fullPage: true });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'CLEAN: no console/page/request errors');
console.log('screenshot: ' + OUT);
await browser.close();
process.exit(errors.length ? 1 : 0);
```

Exit code is `1` on any captured error — wire it into scripts as a hard gate.

### "BUILT bundle" when there is no build directory
Some targets in this repo have **no `build/`/`dist/` artifact to point at** — the hive-board
viewer bundles its browser client in memory with `Bun.build` and serves it at `/client.js`
(there is no build script; `main`/`exports`/`bin` point at `src/*.ts` directly). That does
**not** exempt them from the gate, and it does not mean "drive the dev source": the emitted
bundle *is* what the running server hands the browser. So for in-memory bundlers, **the BUILT
bundle == the running server's output** — start the server and drive `http://127.0.0.1:<port>/`.
The `/client.js` request appearing `200` in `list_network_requests` is your evidence the
emitted bundle (not a source file) was executed.

### Interactive & host-embedded variants
- **Interactive state** (modal / hover / in-flight edit): after load, drive the interaction
  (`page.click`, `page.hover`, `page.fill`) and screenshot the **OPEN / interactive** state.
  Golden/screenshot pipelines are a design oracle, **not** a substitute for this live run
  (I-140, W-034, SNG-024).
- **Host-embedded UI** (e.g. Jellyfin plugin config page — I-116): graft the served fragment
  into a host-viewport document, same-origin-proxy the host API, drive with a real device
  descriptor, and screenshot the OPEN/interactive state. Verifying only the SEAMS proves
  everything except that the thing renders and is usable.

---

## 4. Two verification MODES

**(a) Mid-session — bash-driven Playwright** *(the working path right now)*
Use the npm `playwright` package + the `node verify.mjs` driver above. Available immediately,
same session. This is the fallback whenever MCP isn't live yet.

**(b) Next-session — chrome-devtools-mcp tools**
Wired in `/workspace/opencode.json` as the `chrome-devtools` local MCP (already points at the
executable above, `--headless --isolated`). Gives you `list_console_messages`,
`take_screenshot`, and network inspection as first-class tools.
**W-018 CAVEAT — MCP tools register only at SESSION INIT.** After the config was added they
are live **next** session, not mid-session. If the `chrome-devtools` tools aren't in your
toolset, you're in the same session they were added — use MODE (a).

---

## 5. THE DONE GATE

Before calling **any** interactive web UI "done", ALL must hold:

- [ ] The **BUILT bundle** loads (served build output — not dev source, not a mock).
- [ ] **Zero** uncaught console errors, pageerrors, and failed requests (driver exits `0`).
- [ ] A **full-page screenshot** was captured and eyeballed (renders — not blank; for
      CanvasKit, confirm the canvas actually painted).
- [ ] Any **interactive state** (modal / hover / in-flight edit) was exercised **in-browser**
      and screenshotted in its open state.

Unit-green + golden-green + analyze-clean does **NOT** satisfy this gate (W-072, W-034,
I-140, SNG-024). The richest defects appear only when the whole is composed and exercised in
the body of a real browser.
