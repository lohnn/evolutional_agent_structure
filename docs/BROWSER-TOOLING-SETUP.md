# Browser Tooling Setup (chrome-devtools-mcp)

> **What this is:** a from-scratch guide to give an opencode agent *eyes on the
> web* — real headless Chromium with JS execution, console/network capture, and
> screenshots — via the official [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp).
>
> **Who this is for:** setting the tooling up on a **new machine / container**
> (this guide was written after doing it on an aarch64 Linux container running as
> root). For *using* the browser to verify a web UI once it's set up, see the
> sibling doc `HEADLESS-BROWSER-VERIFICATION.md`.

---

## TL;DR — the four things that actually matter

1. **Get a real browser binary.** Playwright ships a native one; install it +
   its system libs. (Chrome/Chromium via apt is often a snap stub — avoid.)
2. **Install the system shared libs** (`playwright install-deps`) or the binary
   dies at launch with `libglib-2.0.so.0: cannot open shared object file`.
3. **Wire `chrome-devtools-mcp` into opencode config**, pointed at that binary.
4. **Pass `--no-sandbox` if running as root**, or every call fails with
   `Target.setDiscoverTargets: Target closed`.

Miss any one and it looks broken. Details below.

---

## Prerequisites

- **opencode** installed and running.
- **Node.js + npx** (this box: Node v22, npx 10.9). `chrome-devtools-mcp` is
  launched via `npx`, so npx must be on PATH for the opencode process.
- Network access to npm (to fetch `chrome-devtools-mcp` and Playwright's browser).
- A Debian/Ubuntu-family base (the `install-deps` step uses `apt`). On other
  distros you install the equivalent shared libs by hand (see Step 2 notes).

This guide assumes **Linux**. It was validated on **aarch64 (arm64), running as
root, no Docker-in-Docker, no snap**. The arm64 detail matters: Puppeteer's own
Chrome download is x86-64-only and fails under emulation — **Playwright ships a
working native arm64 Chromium**, which is why we use Playwright's binary.

---

## Step 1 — Install a real browser binary via Playwright

Playwright downloads a native browser for your arch into a cache dir.

```bash
# installs the `playwright` package somewhere you can invoke it, then the browser
npm install -g playwright        # or: npx playwright ...
npx playwright install chromium
```

This lands a browser under `~/.cache/ms-playwright/chromium-<BUILD>/`, e.g.
`chromium-1228`. **The build number is not stable across time/versions** — do
not assume `1228`; resolve it (Step 3).

Full browser vs headless shell: the cache contains both
`chromium-<BUILD>/chrome-linux/chrome` (full) and
`chromium_headless_shell-<BUILD>/.../headless_shell`. **`chrome-devtools-mcp`
needs the full `chrome` binary** (DevTools features), not the headless shell.

> **Already have Playwright browsers cached?** (e.g. the image pre-baked them.)
> Skip the download; just confirm the path in Step 3. On this box they were
> already present — only Step 2 was missing.

---

## Step 2 — Install the browser's system shared libraries

The downloaded binary needs system `.so` libraries that aren't in a minimal
container. Without them it launches and instantly dies:

```
error while loading shared libraries: libglib-2.0.so.0: cannot open shared object file
```

Install them (idempotent, safe to re-run):

```bash
npx playwright install-deps chromium
```

This `apt`-installs: `libglib`, `libnss3`, `libgbm1`, `libpango`, `libcairo2`,
`libcups2`, `xvfb`, fonts, and friends.

**Detect whether it's already done** (so you can skip it in a provisioning script):

```bash
CHROME=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome | head -1)
ldd "$CHROME" | grep -q 'not found' && echo "NEEDS install-deps" || echo "deps OK"
```

If `ldd` prints any `=> not found`, run the `install-deps` line.

> **Non-apt distro?** `install-deps` only knows apt. Read what it *would* install
> from the Playwright docs and install the equivalents with your package manager.
> The `ldd ... not found` check above tells you when you've got them all.

**Verify the browser actually launches** before touching opencode config — this
is the decisive test, and it's fast:

```bash
CHROME=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome | head -1)
"$CHROME" --headless --no-sandbox --disable-gpu --dump-dom https://example.com \
  >/dev/null 2>&1 && echo "LAUNCH OK" || echo "LAUNCH FAIL"
```

`LAUNCH OK` means Steps 1–2 are done. (The `dbus` / `Failed to connect to the
bus` warnings Chrome prints headless are **noise** — non-fatal, ignore them.)

---

## Step 3 — Wire chrome-devtools-mcp into opencode config

Find the exact browser path (don't hardcode the build number):

```bash
ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome
# e.g. /root/.cache/ms-playwright/chromium-1228/chrome-linux/chrome
```

Add an `mcp` entry to your opencode config (project-level
`opencode.json`, or `~/.config/opencode/opencode.json` for all projects). Use
the **actual path** from the command above:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "chrome-devtools": {
      "type": "local",
      "command": [
        "npx", "-y", "chrome-devtools-mcp@latest",
        "--headless",
        "--isolated",
        "--executablePath", "/root/.cache/ms-playwright/chromium-1228/chrome-linux/chrome",
        "--chromeArg=--no-sandbox"
      ],
      "enabled": true
    }
  }
}
```

Flag-by-flag, and **why each is here** (these were all learned the hard way):

| Flag | Why |
| --- | --- |
| `--headless` | No display in a container. |
| `--isolated` | Fresh temp user-data-dir per run; auto-cleaned. Avoids stale-profile lockups. |
| `--executablePath <path>` | **Required.** Without it the MCP hunts for stable Google Chrome, which isn't installed — only Playwright's chromium is. Point it at the full `chrome` from Step 1. |
| `--chromeArg=--no-sandbox` | **Required when running as root.** Chrome refuses its sandbox as root and the target dies instantly (`Target.setDiscoverTargets: Target closed`). Non-root users can drop this. |

> **Version pinning caveat.** The `executablePath` embeds the Playwright build
> number (`chromium-1228`). If a later `playwright install` pulls a different
> build, this path goes stale and the MCP breaks. Either (a) re-run the `ls -d`
> command and update the path when you upgrade Playwright, or (b) pin the
> Playwright version so the build number is stable, or (c) symlink a stable path
> (e.g. `ln -s <resolved> /opt/chrome`) and point the config at the symlink.

---

## Step 4 — Restart opencode, then verify in-session

**MCP tools register only at session init.** Editing the config does **not**
hot-load them into a running session — you must **restart opencode**. (If you
just added the config and the `chrome-devtools` tools aren't in your toolset,
you're in the pre-edit session; restart.)

After restart, the agent should have a `chrome-devtools` tool namespace with
~28 tools. Smoke-test the four capabilities that were the whole point:

- `navigate_page` → `https://example.com/` → expect "Successfully navigated".
- `evaluate_script` → run `() => document.title` → proves **JS executes**.
- `list_console_messages` → **debug console** capture.
- `list_network_requests` → shows `GET ... [200]` — **network** visibility.
- `take_screenshot` (to a file under the OS temp dir) → **visual** capture; read
  the PNG back to eyeball the render.

If `navigate_page` throws `Target closed`, you almost certainly missed
`--chromeArg=--no-sandbox` (root) or the `executablePath` is wrong/stale.

---

## Provisioning script (one-shot, idempotent)

Drop-in for a container build / setup script. Safe to re-run.

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Browser binary (skip download if already cached)
if ! ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome >/dev/null 2>&1; then
  npm install -g playwright
  npx playwright install chromium
fi

CHROME=$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome | head -1)

# 2. System shared libs (only if missing)
if ldd "$CHROME" | grep -q 'not found'; then
  npx playwright install-deps chromium
fi

# 3. Prove it launches
"$CHROME" --headless --no-sandbox --disable-gpu --dump-dom https://example.com >/dev/null 2>&1 \
  && echo "browser OK: $CHROME" \
  || { echo "browser FAILED to launch"; exit 1; }

echo
echo "Add this to opencode.json (adjust --chromeArg for non-root), then RESTART opencode:"
cat <<EOF

  "mcp": {
    "chrome-devtools": {
      "type": "local",
      "command": [
        "npx", "-y", "chrome-devtools-mcp@latest",
        "--headless", "--isolated",
        "--executablePath", "$CHROME",
        "--chromeArg=--no-sandbox"
      ],
      "enabled": true
    }
  }
EOF
```

> The config injection is left as a manual/echoed step on purpose — merging JSON
> into an existing `opencode.json` safely is fiddly, and you likely already have
> `plugin`/`permission` blocks to preserve. Paste the `mcp` block in by hand.

---

## Gotchas index (each cost real debugging time)

| Symptom | Cause | Fix |
| --- | --- | --- |
| `libglib-2.0.so.0: cannot open shared object file` at launch | System libs missing | `npx playwright install-deps chromium` (Step 2) |
| `Target.setDiscoverTargets: Target closed` on first navigate | Running as root without `--no-sandbox` | Add `--chromeArg=--no-sandbox` (Step 3) |
| MCP hunts for Chrome, can't find it | No stable Google Chrome installed | `--executablePath` at Playwright's chromium (Step 3) |
| Config edited but tools absent | MCP registers only at session init | **Restart opencode** (Step 4) |
| Path breaks after a Playwright upgrade | `chromium-<BUILD>` number changed | Re-resolve path / pin version / symlink (Step 3 caveat) |
| Screenshots can only write to temp dir | MCP restricts file writes unless `roots` negotiated | Fine for `/tmp`; for project dirs start server with `--allow-unrestricted-paths` |
| `dbus` / "Failed to connect to the bus" spam | Chrome headless always logs this | **Ignore** — non-fatal noise |
| Puppeteer/Chrome download fails on arm64 | Puppeteer's Chrome is x86-64-only | Use **Playwright**'s native arm64 chromium (Step 1) |

---

## Environment this was validated on

- **Arch:** aarch64 (arm64) Linux
- **User:** root (hence `--no-sandbox`)
- **Node:** v22.23.1, **npx:** 10.9.8
- **Playwright browser:** `chromium-1228` at
  `/root/.cache/ms-playwright/chromium-1228/chrome-linux/chrome`
- **MCP:** `chrome-devtools-mcp@latest` (was v1.6.0 at validation)
- No Docker-in-Docker, no snap, no display server.

If your other machine differs (x86-64, non-root, different distro), the only
changes should be: the resolved chromium path (Step 3), and dropping
`--no-sandbox` if you're not root. Everything else transfers.
