# oc-browser-bridge — setup

> **What this is:** the container/image and entrypoint requirements for
> `src/oc-browser-bridge/` — the headless OpenChamber browser pane that connects
> the `openchamber_web` agent tools to the container's Chromium.
>
> **Who this is for:** whoever builds the dev-container image (the Dockerfile
> lives outside `/workspace`, on the host). The agent cannot apply these — hand
> them to the image owner.

---

## What the bridge needs

1. **A working Chromium** at a stable path (`CHROME_EXECUTABLE`), with its system
   shared libraries baked in. The bridge launches it via `playwright-core`.
2. **Its own npm deps** (`playwright-core`, `eventsource`) installed next to the
   script.
3. **A supervisor** to start it on boot and keep it alive — svcwatch, spawned
   from `/entrypoint.sh` (PID 1 subtree).

None of these is optional; miss one and the `openchamber_web` tools fail with
`No OpenChamber client connected here can control a page`.

---

## 1. Dockerfile — bake in Chromium + its system libs

The bridge reuses the same Playwright Chromium the rest of the container's
browser tooling uses. Two `RUN` layers: the OS shared libraries (which can't
persist on the `agent_home` volume, so must be baked), and the browser binary
(pinned at a stable path so `CHROME_EXECUTABLE` is stable).

```dockerfile
# Playwright's system libraries (libnss3, libasound2, fonts, …). These are apt
# packages outside /root, so they can't persist on the agent_home volume — bake
# them in here so browser automation survives container recreates. Only the OS
# deps are baked; the browser binary is installed below at a fixed path.
RUN npx --yes playwright@latest install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# The chromium binary itself, baked into the image at a fixed path rather than
# downloaded at runtime into /root/.cache. Two reasons on this machine:
#   1. Flutter's web tooling needs CHROME_EXECUTABLE to point at a real binary at
#      container start — a runtime download makes that path unknown and unstable.
#   2. Google does not publish Chrome for linux/arm64, and Ubuntu's `chromium` is
#      a snap stub that can't work in Docker. Playwright's build is the only
#      chromium that actually exists for this architecture.
# The revision-numbered directory is resolved once at build time and pinned
# behind a stable symlink so CHROME_EXECUTABLE never has to know the revision.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN npx --yes playwright@latest install chromium \
    && ln -sf "$(find /opt/ms-playwright -type f -name chrome | head -1)" /usr/local/bin/chrome
ENV CHROME_EXECUTABLE=/usr/local/bin/chrome
```

The bridge launches `CHROME_EXECUTABLE` (defaulting to `/usr/local/bin/chrome`)
with `--no-sandbox --enable-unsafe-swiftshader`. See
`docs/BROWSER-TOOLING-SETUP.md` for why these specific Chromium choices were made
(arm64, root, snap-stub traps) — that doc covers the `chrome-devtools-mcp`
consumer; this one is the `openchamber_web` consumer, same binary.

---

## 2. Install the bridge's npm deps

The bridge needs `playwright-core` and `eventsource` beside the script. They're
gitignored, so install them at image build **or** first boot:

```bash
cd /workspace/projects/evolutional_agent_structure/src/oc-browser-bridge
npm install --no-audit --no-fund
```

> `playwright-core` (not full `playwright`) on purpose — the binary is already
> baked into the image (step 1), so the package only needs the driver library,
> not its own browser download.

---

## 3. entrypoint.sh — spawn svcwatch (one-time container touch)

The bridge is a long-lived service supervised by **svcwatch**
(`docs/SVCWATCH.md`). svcwatch must be born in PID 1's subtree (opencode sweeps
its own spawned-children on shutdown), so it is spawned from `/entrypoint.sh`.
Paste this block **before** the final `exec openchamber serve …`:

```sh
# ── svcwatch ── declarative process supervision (PID 1 subtree) ──────────────
# Adding a long-lived service = dropping ONE TOML into .opencode/services/.
# See docs/SVCWATCH.md in the HIVE plugin. This is the ONLY entrypoint touch;
# services never need entrypoint changes again.
SVCDIR=/workspace/.opencode/services
SVCWATCH=/workspace/projects/evolutional_agent_structure/src/svcwatch/svcwatch.py
SVCLOG=/var/log/svcwatch.log
mkdir -p "$SVCDIR"
(
  while true; do
    setsid --fork python3 "$SVCWATCH" --dir "$SVCDIR" >> "$SVCLOG" 2>&1
    echo "[entrypoint] svcwatch exited (code $?) — respawning in 2s" >> "$SVCLOG"
    sleep 2
  done
) &
# ── end svcwatch ─────────────────────────────────────────────────────────────
```

Then restart the container. From then on, no entrypoint change is needed to
add/remove a service — only TOML files.

---

## 4. The service definition (already in the workspace)

`/workspace/.opencode/services/oc-browser-bridge.toml`:

```toml
name = "oc-browser-bridge"
command = ["node", "oc-browser-bridge.js"]
cwd = "/workspace/projects/evolutional_agent_structure/src/oc-browser-bridge"
env = { OC_SERVER = "http://localhost:3000", OC_BRIDGE_DEBUG = "0" }
restart = "always"
restart_delay_sec = 2
backoff_max_sec = 60
start_grace_sec = 10
```

`OC_SERVER` is the OpenChamber server the bridge impersonates a pane against.
svcwatch scans the dir every ~2s: new TOML → start, deleted → graceful stop,
changed mtime → restart.

---

## Verify

After a container restart:

```bash
# svcwatch is up under PID 1, bridge under svcwatch
cat /run/svc/status.json
# → services[0].name == "oc-browser-bridge", state == "running", restarts == 0
```

Then drive it through the agent tools: `openchamber_web` `browser.open` +
`browser.snapshot` against any reachable URL should return page text and
interactive elements instead of the "No OpenChamber client connected" error.

---

## Caveats

- **Coexistence:** the broker is first-claim-wins with no priority. When a real
  OpenChamber desktop client is connected, it and the bridge race to claim each
  request. No mechanism to prefer one exists yet.
- **Flutter dev-server hang:** the release build works perfectly; `flutter run
  -d web-server` boots the engine but never runs the app (undiagnosed, likely
  DDC-specific). Use the release build for verification.
- **Rebuilds:** the `/entrypoint.sh` edit and the Dockerfile `RUN` layers both
  live in the image, so a rebuild that doesn't include them reintroduces the
  fault. Keep the image source in sync with this doc.
