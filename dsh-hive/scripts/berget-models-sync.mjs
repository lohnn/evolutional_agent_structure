#!/usr/bin/env node
/**
 * berget-models-sync — keep the hand-declared `llm-pi-ai.providers.berget`
 * models block in $DSH_HOME/settings.yaml in sync with Berget's API.
 *
 * Replaces the manual archaeology of 2026-08/09: one call refreshes ids,
 * context windows, vision capabilities, lifecycle flags, and re-sweeps the
 * vendor-neutral reasoning_effort ladder per model.
 *
 * Sources (see docs in dsh-migration + openapi.json):
 *   GET /v1/models/            — capabilities.vision, status.up, lifecycle_status
 *   GET /v1/models/chat        — contextWindow (ONLY source of context windows)
 *   GET /openapi.json          — the vendor-neutral reasoning_effort enum
 *   POST /v1/chat/completions  — per-model sweep of that enum (16-token probes)
 *   models.dev/api.json        — curated output limits for the `berget` entry (best effort)
 *
 * Credentials: same contract as the dsh-berget-refresh plugin (WI-040) —
 * reads ~/.dsh/berget-credentials.json (fallback auth.json), refreshes when
 * expired, and PERSISTS rotated tokens back to BOTH files so the running
 * plugin never gets orphaned. Tokens are never printed.
 *
 * curation layer — endpoint data tells us what EXISTS; behavioral evidence
 * tells us what to OFFER (model-rodeo batteries, 2026-09): GLM-5.2 low degrades
 * state tracking; gemma inverts when sent effort values. These omissions
 * survive refreshes by design.
 *
 * Usage:
 *   node scripts/berget-models-sync.mjs [--dry] [--no-probe] [--no-models-dev]
 *   --dry          render + report, write nothing
 *   --no-probe     skip the reasoning_effort sweep entirely
 *   --probe-all    sweep EVERY model (default: only models that have no effort
 *                  map yet — probing is rate-limit sensitive and existing maps
 *                  came from verified sweeps; re-run with this flag to re-verify
 *                  everything, ideally when Berget is quiet)
 *   --no-models-dev skip the models.dev maxTokens lookup for new ids
 *
 * Idempotent: running twice yields no diff. Writes are atomic; the previous
 * settings.yaml is kept as settings.yaml.bak-<timestamp>.
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// ── config ────────────────────────────────────────────────────────────────────

const API = process.env.BERGET_API_URL || 'https://api.berget.ai';
const SETTINGS = join(homedir(), '.dsh', 'settings.yaml');
const STATE_FILE = join(homedir(), '.dsh', 'berget-credentials.json');
const AUTH_JSON = join(homedir(), '.local', 'share', 'opencode', 'auth.json');
const PROBE_STATE_FILE = join(homedir(), '.dsh', 'berget-reasoning-probes.json');

const EFFORT_LADDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
// offered (picker-visible) ladder — full wire-verified set, no exotic gaps
const OFFER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']; // 'off' = omit param
const EXPIRY_MARGIN_MS = 90 * 1000;

/** Probes are 16-token calls; budget per model keeps the sweep snappy. */
const PROBE_TIMEOUT_MS = 20_000;
const PROBE_CONCURRENCY = 4;

/**
 * Behavioral curation — survives refreshes. Sources: model-rodeo batteries
 * (rodeo workspace, 2026-09) + live probes.
 */
const KNOWN = {
  'moonshotai/Kimi-K3': { name: 'Kimi K3' },
  'zai-org/GLM-5.2': {
    name: 'GLM 5.2',
    omitLevels: ['low'],
    note: 'rodeo 2026-09: effort=low degrades GLM-5.2 state tracking — not offered (wire accepts it)',
  },
  'zai-org/GLM-5.3-Flash': { name: 'GLM 5.3 Flash' },
  'Qwen/Qwen3.8-27B-FP8': { name: 'Qwen3.8 27B', note: 'gateway quirk: minimal/high/max rejected (HTTP 400) — sweep decides' },
  'google/gemma-4-31B-it': {
    name: 'Gemma 4 31B',
    omitAllEfforts: true,
    note: 'rodeo 2026-09: sending any reasoning_effort inverts gemma behavior (triggers thinking) — no map, wire would accept one',
  },
  'openai/gpt-oss-120b': { name: 'GPT-OSS 120B' },
  'meta-llama/Llama-3.3-70B-Instruct': {
    name: 'Llama 3.3 70B',
    note: 'endpoint answered 500/503 to every probe at 2026-09-07 sync — no effort map possible; revisit whenBerget recovers',
  },
  'mistralai/Mistral-Small-3.2-24B-Instruct-2506': { name: 'Mistral Small 3.2 24B' },
};

// ── credentials (mirror of dsh-berget-refresh's contract) ─────────────────────

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return undefined; }
}

async function writeJsonAtomic(path, obj, mode = 0o600) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), { mode });
  await rename(tmp, path);
}

async function bearer() {
  const state = await readJson(STATE_FILE);
  if (state?.access && typeof state.expires === 'number' && state.expires - EXPIRY_MARGIN_MS > Date.now()) {
    return state.access;
  }
  // expired / missing — refresh, rotating exactly like the plugin does
  let current;
  if (state?.refresh) current = state.refresh;
  else {
    const auth = await readJson(AUTH_JSON);
    if (auth?.berget?.type === 'oauth') current = auth.berget.refresh;
  }
  if (!current) throw new Error('no Berget refresh token found (checked state file and auth.json) — run `opencode auth login`');
  process.stderr.write('[berget-models-sync] access token expired — refreshing (rotating like the plugin)…\n');
  const res = await fetch(`${API}/v1/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: current }),
  });
  if (!res.ok) throw new Error(`token refresh failed: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`);
  const data = await res.json();
  if (typeof data?.token !== 'string' || typeof data?.expires_in !== 'number') throw new Error('malformed refresh response');
  const rotated = typeof data.refresh_token === 'string' ? data.refresh_token : current;
  const access = data.token;
  const expires = Date.now() + data.expires_in * 1000;
  // persist rotation to BOTH files (state file authoritative, auth.json mirror)
  await writeJsonAtomic(STATE_FILE, { type: 'oauth', refresh: rotated, access, expires, updatedAt: new Date().toISOString() });
  const auth = (await readJson(AUTH_JSON)) ?? {};
  auth.berget = { type: 'oauth', refresh: rotated, access, expires };
  await writeJsonAtomic(AUTH_JSON, auth).catch(() => {}); // best-effort mirror
  return access;
}

// ── endpoint fetches ──────────────────────────────────────────────────────────

async function getJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function probeOne(token, model, effort) {
  const body = JSON.stringify({
    model, messages: [{ role: 'user', content: 'OK' }], max_tokens: 16,
    ...(effort ? { reasoning_effort: effort } : {}),
  });
  return fetch(`${API}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  }).then((r) => (r.ok ? 'ok' : `HTTP ${r.status}`), () => 'ERR');
}

async function probeEfforts(token, model) {
  const out = {};
  const values = [...EFFORT_LADDER];
  let i = 0;
  while (i < values.length) {
    const chunk = values.slice(i, i + PROBE_CONCURRENCY);
    const results = await Promise.all(chunk.map((v) => probeOne(token, model, v)));
    chunk.forEach((v, j) => { out[v] = results[j]; });
    i += PROBE_CONCURRENCY;
  }
  return out;
}

// ── curation helpers ──────────────────────────────────────────────────────────

const prettyName = (id) =>
  (id.split('/').pop() ?? id)
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/\bfp8\b/i, 'FP8')
    .replace(/\bit\b/i, '')
    .replace(/gpt oss/i, 'GPT-OSS')
    .replace(/\bglm\b/i, 'GLM')
    .replace(/\bit$/i, '')
    .trim();

function effortMap(sweep, k, prevLevels) {
  const cur = KNOWN[k] ?? {};
  if (cur?.omitAllEfforts) return undefined;
  const omit = new Set(cur?.omitLevels ?? []);
  // Classification: 'ok' → offer; 'HTTP 400' → wire-rejected, drop; anything
  // else (timeout/5xx/429/ERR) is INCONCLUSIVE — keep the level only if the
  // previous settings already had it, so a bad network day never shrinks a
  // verified map (and never produces dsh-rejected off-only maps).
  const usable = OFFER.filter((lvl) => {
    if (lvl === 'off') return false;
    if (omit.has(lvl)) return false;
    const outcome = sweep[lvl];
    if (outcome === 'ok') return true;
    if (outcome === 'HTTP 400') return false;
    return (prevLevels ?? []).includes(lvl);
  });
  if (usable.length === 0) return undefined;
  const lines = ['            off:'];
  for (const lvl of usable) lines.push(`            ${lvl}: ${lvl}`);
  return lines.join('\n');
}

const isConclusiveSweep = (sweep) =>
  Object.values(sweep).every((outcome) => outcome === 'ok' || outcome === 'HTTP 400');

// ── main ──────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const NO_PROBE = args.has('--no-probe');
const NO_MODELS_DEV = args.has('--no-models-dev');

const token = await bearer();
process.stderr.write('[berget-models-sync] credential ok\n');

const [rich, chatListing, modelsDev] = await Promise.all([
  getJson(`${API}/v1/models/`, token),
  getJson(`${API}/v1/models/chat`, token),
  NO_MODELS_DEV
    ? Promise.resolve(undefined)
    : fetch('https://models.dev/api.json').then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined),
]);

const chatCtx = new Map(
  (chatListing instanceof Array ? chatListing : chatListing.data ?? chatListing.models ?? []).map((m) => [m.id, m]),
); // contextWindow + chat membership
const richById = new Map((rich?.data ?? []).map((m) => [m.id, m]));
const devLimits = modelsDev?.berget?.models ?? {};

const ids = [...chatCtx.keys()];
process.stderr.write(`[berget-models-sync] ${ids.length} chat models on the endpoint\n`);

const settingsText = await readFile(SETTINGS, 'utf8');
const prevModels = parsePreviousModels(settingsText);
const probeState = (await readJson(PROBE_STATE_FILE)) ?? {};

// ── effort sweep (parallel, cheap 16-token probes) ───────────────────────────
const sweeps = new Map();
if (!NO_PROBE) {
  const targets = args.has('--probe-all')
    ? ids
    : ids.filter((id) => !probeState[id]?.complete && !(KNOWN[id] ?? {}).omitAllEfforts);
  if (targets.length < ids.length) {
    process.stderr.write(`[berget-models-sync] sweeping ${targets.length}/${ids.length} models (use --probe-all to re-verify mapped ones)\n`);
  }
  const queue = [...targets];
  const workers = Array.from({ length: Math.min(PROBE_CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const m = queue.shift();
      if (m === undefined) return;
      sweeps.set(m, await probeEfforts(token, m));
    }
  });
  await Promise.all(workers);
}

// ── render the models block ───────────────────────────────────────────────────
const lines = [
  '      models:',
  '        # GENERATED by dsh-hive/scripts/berget-models-sync.mjs — regenerable,',
  '        # do not hand-edit (hand knowledge lives in the script).',
  '        # Sources: /v1/models/ (capabilities, status, lifecycle),',
  '        # /v1/models/chat (contextWindow), openapi.json reasoning_effort enum',
  '        # (none|minimal|low|medium|high|xhigh|max; vendor-neutral, gateway-converted;',
  '        # thinking cannot be disabled on always-think models — none → lowest budget),',
  '        # per-model wire probes. Behavioral curation from model-rodeo 2026-09.',
];

let changes = [];
const seen = new Set();

for (const id of ids) {
  seen.add(id);
  const rich = richById.get(id) ?? {};
  const k = KNOWN[id] ?? {};
  const name = k.name ?? prettyName(id);
  const ctxw = chatCtx.get(id)?.contextWindow;
  const prevMax = prevModels.get(id)?.maxTokens;
  const maxTok =
    k.maxTokens
    ?? (prevMax && !prevModels.get(id)?.maxTokensEstimated ? prevMax : undefined)
    ?? devLimits[id]?.limit?.output
    ?? (ctxw >= 131072 ? 32768 : 8192);
  const estimated = k.maxTokens === undefined && !devLimits[id]?.limit?.output && !prevModels.get(id)?.maxTokens;

  const down = rich?.status?.up === false;
  const hasContext = typeof ctxw === 'number';

  const head = [
    `        - id: ${id}`,
    `          name: ${name}`,
    ...(hasContext ? [`          contextWindow: ${ctxw}`] : []),
    `          maxTokens: ${maxTok}${estimated ? ' # estimated — unverified' : ''}`,
  ];

  const caps = rich?.capabilities ?? {};
  if (caps.vision) {
    head.push('          # capabilities.vision=true per /v1/models/');
    head.push('          input: [ text, image ]');
  }
  if (rich?.lifecycle_status && rich.lifecycle_status !== 'active') head.push(`          # lifecycle: ${rich.lifecycle_status}`);
  if (down) head.push('          # status.up=false at sync time — endpoint serving errors');

  // efforts
  const sweep = sweeps.get(id);
  const prevLevels = prevModels.get(id)?.efforts;
  const mapText = NO_PROBE
    ? (prevModels.get(id)?.effortsRaw ?? undefined)
    : sweep
      ? effortMap(sweep, id, prevLevels)
      : prevModels.get(id)?.effortsRaw;
  if (k.note) head.push(`          # ${k.note}`);
  if (mapText) head.push(`          reasoningEfforts:\n${mapText}`);
  if (!NO_PROBE && sweep && isConclusiveSweep(sweep) && !effortMap(sweep, id) && !k.omitAllEfforts && !k.note) {
    head.push(`          # sweep: no reasoning_effort values accepted on the wire`);
  }

  const before = prevModels.get(id);
  if (!before) changes.push(`+ added ${id}`);
  else {
    if (before.contextWindow !== ctxw) changes.push(`~ ${id}: contextWindow ${before.contextWindow} → ${ctxw}`);
    if (before.vision !== !!caps.vision) changes.push(`~ ${id}: vision ${before.vision} → ${!!caps.vision}`);
  }
  lines.push(...head);
}

for (const [id] of prevModels) {
  if (!seen.has(id)) changes.push(`- removed ${id} (absent from endpoint)`);
}

const block = lines.join('\n');

// A non-200/non-400 response says nothing about the selected effort: quota,
// temporary outages, and transport errors must be retried on a later sync.
for (const [id, sweep] of sweeps) {
  if (isConclusiveSweep(sweep)) {
    probeState[id] = { complete: true, at: new Date().toISOString() };
  }
}

// default-model safety net
const dm = settingsText.match(/agent-default-model:\n  provider: \S+\n  model: (\S+)/);
const defaultModel = dm?.[1];
const defaultLive = seen.has(defaultModel);

// ── write ─────────────────────────────────────────────────────────────────────
const cur = await readFile(SETTINGS, 'utf8');
const start = cur.indexOf('\n      models:\n');
const end = cur.indexOf('\nagent-default-model:');
if (start < 0 || end < 0 || end < start) {
  console.error('[berget-models-sync] could not locate the berget models block — refusing to write');
  process.exit(1);
}

const needle = cur.slice(start + 1, end + 1); // includes trailing newline of block

if (needle === block + '\n') {
  console.log('[berget-models-sync] settings already up to date (no diff).');
} else {
  if (DRY) {
    console.log('[berget-models-sync] --dry: would rewrite the berget models block. New block:');
    console.log(block);
  } else {
    const next = cur.slice(0, start + 1) + block + '\n' + cur.slice(end + 1);
    const bak = `${SETTINGS}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await writeFile(bak, cur, { mode: 0o600 });
    await rename(await (async () => { const t = SETTINGS + '.tmp.' + process.pid; await writeFile(t, next, { mode: 0o600 }); return t; })(), SETTINGS);
    console.log(`[berget-models-sync] wrote settings.yaml (backup: ${bak})`);
  }
}

if (!DRY && sweeps.size) await writeJsonAtomic(PROBE_STATE_FILE, probeState);

if (changes.length) console.log('changes:\n  ' + changes.join('\n  '));
if (!defaultLive) {
  console.warn(`[berget-models-sync] WARNING: agent-default-model "${defaultModel}" is not in the live model set — fix agent-default-model in settings.yaml`);
}
if (sweeps.size && !changes.length && !DRY) {
  console.log('[berget-models-sync] sweep complete; effort maps current.');
}

// ── parse the existing block back out (best-effort struct) ────────────────────

function parsePreviousModels(txt) {
  const out = new Map();
  if (typeof txt !== 'string' || !txt) return out;
  const m = txt.match(/\n      models:\n([\s\S]*?)\nagent-default-model:/);
  if (!m) return out;
  const entries = m[1].split(/\n(?=        - id: )/).filter((s) => s.trim());
  for (const e of entries) {
    const id = (e.match(/- id: (\S+)/) ?? [])[1];
    if (!id) continue;
    const ctxw = Number((e.match(/contextWindow: (\d+)/) ?? [])[1]);
    const maxT = Number((e.match(/maxTokens: (\d+)/) ?? [])[1]) || undefined;
    const vision = /input: \[ text, image \]/.test(e);
    const effortsRaw = e.includes('reasoningEfforts:')
      ? e.split('reasoningEfforts:\n')[1]?.split('\n').filter((l) => /^            /.test(l)).join('\n')
      : undefined;
    const efforts = (effortsRaw ?? '')
      .split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => { const [key, rest] = l.split(':'); return rest?.trim() || key; });
    out.set(id, { contextWindow: ctxw, maxTokens: maxT, maxTokensEstimated: false, vision, efforts, effortsRaw });
  }
  return out;
}
