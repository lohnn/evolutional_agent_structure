/**
 * dsh-berget-refresh — mini-refresh credential plugin (WI-040).
 *
 * Scope: the OAuth refresh call ONLY. No browser PKCE (stays descoped).
 *
 * Keeps the BERGET_API_KEY credential reference fed with a live Berget access
 * token so the hand-declared `llm-pi-ai.providers.berget` route (apiKeyEnv:
 * BERGET_API_KEY) always resolves a fresh key. dsh-llm-pi-ai re-resolves the
 * reference on EVERY request (resolveApiKey → ctx.credentials.resolve), so a
 * value written here reaches the next request with no restart.
 *
 * Flow:
 *   - Source the OAuth refresh token from OpenCode's auth.json (same place the
 *     @bergetai/opencode-auth plugin reads it).
 *   - POST https://api.berget.ai/v1/auth/refresh { refresh_token } →
 *     { token, expires_in, refresh_token? }.
 *   - The refresh token ROTATES per call — persist the rotated token back to
 *     our own credential file (and best-effort mirror to auth.json) or the next
 *     refresh fails.
 *   - Write the fresh access token into the credential seam via
 *     ctx.credentials.set(credentialRef("BERGET_API_KEY"), token).
 *   - Refresh proactively before the 900s expiry (safety margin) and once on
 *     boot (survives dsh restarts).
 *
 * IMPORTANT: run dsh with BERGET_API_KEY UNSET in the process environment —
 * the inherited env layer wins over the managed store and set() rejects while
 * a process-env var shadows the reference.
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

// credentialRef is a brand + a POSIX-identifier check; inlining it keeps this
// plugin dependency-free (a link: dep cannot resolve @deepseek-ai/* from the
// store). The reference IS just the env-var name string at runtime.
const credentialRef = (value) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new TypeError(`invalid credential reference name: ${value}`);
  }
  return value;
};

export const name = 'dsh-berget-refresh';
export const inject = ['credentials'];

const REFRESH_ENDPOINT =
  (process.env.BERGET_API_URL || 'https://api.berget.ai') + '/v1/auth/refresh';

const REF_NAME = 'BERGET_API_KEY';
const AUTH_JSON = join(homedir(), '.local', 'share', 'opencode', 'auth.json');
const STATE_FILE = join(homedir(), '.dsh', 'berget-credentials.json');

// Refresh this far before the access token's expiry (15 min tokens → refresh
// at ~13.5 min). Also the floor for the next timer after any refresh.
const EXPIRY_MARGIN_MS = 90 * 1000;
// Poll cadence fallback / retry backoff.
const RETRY_MS = 60 * 1000;
const CATALOG_SYNC_MS = 24 * 60 * 60 * 1000;
const CATALOG_SYNC_STATE = join(homedir(), '.dsh', 'berget-catalog-sync.json');
const CATALOG_SYNC_SCRIPT = join(homedir(), '.dsh', 'hive-kit', 'berget-models-sync.mjs');

export async function apply(ctx) {
  const log = ctx.logger ?? console;
  const credentials = ctx.get('credentials');
  if (!credentials) {
    log.error?.(
      '[dsh-berget-refresh] no ctx.credentials service mounted — cannot feed BERGET_API_KEY; mount dsh-credentials-local',
    );
    return;
  }

  let stopped = false;
  let timer = null;
  let inFlight = null;
  let catalogTimer = null;

  // Synchronous seed at apply()-time: if the persisted state file still holds a
  // valid access token, push it into the credential store BEFORE any request
  // can resolve BERGET_API_KEY. This closes the stale-credential race that a
  // one-shot headless dsh hits on restart with an expired token — the model's
  // first resolve() then finds a live key, while the async boot refresh (below)
  // rotates in a fresh one for the next window.
  try {
    const raw = readFileSync(STATE_FILE, 'utf8');
    const state = JSON.parse(raw);
    if (
      typeof state?.access === 'string' &&
      typeof state?.expires === 'number' &&
      state.expires - EXPIRY_MARGIN_MS > Date.now()
    ) {
      const ref = credentialRef(REF_NAME);
      // set() returns a promise; the file write is atomic and lands well before
      // the (also-async) model resolution reaches resolve(), so we do not block
      // plugin load on it — but we do surface a failure loudly.
      Promise.resolve(credentials.set(ref, state.access)).catch((e) =>
        log.warn?.('[dsh-berget-refresh] seed set failed: %s', e?.message ?? e),
      );
      log.info?.('[dsh-berget-refresh] seeded %s from persisted state (valid ~%ds)', REF_NAME, Math.round((state.expires - Date.now()) / 1000));
    }
  } catch {
    // No usable persisted state — cold start; the async boot refresh seeds it.
  }

  const schedule = (delayMs) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      tick().catch((e) => log.warn?.('[dsh-berget-refresh] tick failed: %s', e?.message ?? e));
    }, Math.max(1000, delayMs));
    timer.unref?.();
  };

  async function readJson(path) {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch {
      return undefined;
    }
  }

  async function writeJsonAtomic(path, obj) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = path + '.tmp.' + process.pid;
    await writeFile(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
    await rename(tmp, path);
  }

  /** Load the current refresh token: our state file wins, else auth.json. */
  async function loadRefreshToken() {
    const state = await readJson(STATE_FILE);
    if (typeof state?.refresh === 'string' && state.refresh.length > 0) {
      return { refresh: state.refresh, expires: state.expires };
    }
    const auth = await readJson(AUTH_JSON);
    const b = auth?.berget;
    if (b?.type === 'oauth' && typeof b.refresh === 'string' && b.refresh.length > 0) {
      return { refresh: b.refresh, expires: b.expires };
    }
    return undefined;
  }

  /** Persist the (possibly rotated) refresh token so the next refresh works. */
  async function persistRefreshToken(refresh, access, expires) {
    // Our own store — authoritative for the next refresh.
    await writeJsonAtomic(STATE_FILE, {
      type: 'oauth',
      refresh,
      access,
      expires,
      updatedAt: new Date().toISOString(),
    });
    // Best-effort mirror back into auth.json so OpenCode stays in sync and a
    // cold start (no state file) still has a valid refresh token. Never throws.
    try {
      const auth = (await readJson(AUTH_JSON)) ?? {};
      auth.berget = { type: 'oauth', refresh, access, expires };
      await writeJsonAtomic(AUTH_JSON, auth);
    } catch (e) {
      log.warn?.('[dsh-berget-refresh] auth.json mirror failed (non-fatal): %s', e?.message ?? e);
    }
  }

  /** Feed the fresh access token into the credential seam. */
  async function feedCredential(accessToken) {
    const ref = credentialRef(REF_NAME);
    await credentials.set(ref, accessToken);
    log.info?.('[dsh-berget-refresh] fed fresh %s into credential seam', REF_NAME);
  }

  /** One refresh pass. Returns ms until the next scheduled refresh. */
  async function refreshOnce() {
    const current = await loadRefreshToken();
    if (!current) {
      // Fail LOUDLY (W-022): no silent no-op into 15-min-later 401s.
      log.error?.(
        '[dsh-berget-refresh] no Berget refresh token found (checked %s and %s). Run `opencode auth login` for berget.',
        STATE_FILE,
        AUTH_JSON,
      );
      return RETRY_MS;
    }

    // Skip the network call if the stored access token is still comfortably valid.
    if (typeof current.expires === 'number' && current.expires - EXPIRY_MARGIN_MS > Date.now()) {
      const state = await readJson(STATE_FILE);
      if (typeof state?.access === 'string') {
        await feedCredential(state.access);
        return current.expires - EXPIRY_MARGIN_MS - Date.now();
      }
    }

    log.info?.('[dsh-berget-refresh] refreshing Berget access token');
    const res = await fetch(REFRESH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: current.refresh }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log.error?.('[dsh-berget-refresh] refresh failed: HTTP %d %s', res.status, text.slice(0, 200));
      // Retry soon; a transient 5xx or another-process race may clear.
      return RETRY_MS;
    }

    const data = await res.json();
    if (typeof data?.token !== 'string' || typeof data?.expires_in !== 'number') {
      log.error?.('[dsh-berget-refresh] refresh returned malformed body');
      return RETRY_MS;
    }

    const access = data.token;
    const rotated = typeof data.refresh_token === 'string' ? data.refresh_token : current.refresh;
    const expires = Date.now() + data.expires_in * 1000;

    await persistRefreshToken(rotated, access, expires);
    await feedCredential(access);

    log.info?.('[dsh-berget-refresh] refreshed; expires_in=%ds (rotated=%s)', data.expires_in, rotated !== current.refresh);
    return data.expires_in * 1000 - EXPIRY_MARGIN_MS;
  }

  async function tick() {
    if (stopped) return;
    if (inFlight) return inFlight; // dedupe concurrent refreshes
    inFlight = (async () => {
      try {
        const nextIn = await refreshOnce();
        schedule(nextIn);
      } catch (e) {
        log.warn?.('[dsh-berget-refresh] refresh error: %s', e?.message ?? e);
        schedule(RETRY_MS);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  async function syncCatalog() {
    let lastSync = 0;
    try { lastSync = JSON.parse(await readFile(CATALOG_SYNC_STATE, 'utf8')).at ?? 0; } catch {}
    const delay = Math.max(0, lastSync + CATALOG_SYNC_MS - Date.now());
    catalogTimer = setTimeout(async () => {
      try {
        await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [CATALOG_SYNC_SCRIPT, '--only-new-models'], { stdio: 'ignore' });
          child.once('error', reject);
          child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
        });
        await writeJsonAtomic(CATALOG_SYNC_STATE, { at: Date.now() });
        log.info?.('[dsh-berget-refresh] refreshed Berget model catalog');
      } catch (e) {
        log.warn?.('[dsh-berget-refresh] catalog refresh failed: %s', e?.message ?? e);
      } finally {
        syncCatalog();
      }
    }, delay);
    catalogTimer.unref?.();
  }

  ctx.on?.('dispose', () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(catalogTimer);
  });

  // Boot refresh: re-refresh-on-boot and seed the store BEFORE dsh proceeds to
  // any prompt. `apply` is async and cordis awaits its return value as plugin
  // startup, so awaiting this guarantees a fresh credential is committed before
  // the first request resolves BERGET_API_KEY — closing the stale-credential
  // race that made a one-shot headless dsh 401 on restart with an expired
  // token. A refresh failure is caught (never blocks boot); the 15-min expiry
  // window means steady-state boots take the fast no-network path in
  // refreshOnce().
  try {
    await tick();
  } catch (e) {
    log.warn?.('[dsh-berget-refresh] boot refresh failed (non-fatal): %s', e?.message ?? e);
  }

  syncCatalog();

  log.info?.('[dsh-berget-refresh] plugin applied (endpoint %s)', REFRESH_ENDPOINT);
}
