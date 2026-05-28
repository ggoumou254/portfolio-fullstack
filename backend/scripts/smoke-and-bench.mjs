#!/usr/bin/env node
/**
 * scripts/smoke-and-bench.mjs
 * Smoke test + micro benchmark backend portfolio
 * Uso:
 *   node scripts/smoke-and-bench.mjs --base http://localhost:5000 [--token <JWT>] [--ratelimit] [--batches 5] [--concurrency 8]
 */

////////////////////////////////////////////////////////////////////////////////
// CLI parsing
////////////////////////////////////////////////////////////////////////////////
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => {
    if (!a.startsWith('--')) return [];
    const k = a.replace(/^--/, '');
    const v = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    return [k, v];
  }).filter(Boolean)
);

const BASE = String(args.base || 'http://localhost:5000').replace(/\/+$/, '');
const TOKEN = args.token && args.token !== 'true' ? String(args.token) : '';
const DO_RATELIMIT = !!args.ratelimit;
const BATCHES = Number.parseInt(args.batches || '5', 10);
const CONCURRENCY = Number.parseInt(args.concurrency || '8', 10);

////////////////////////////////////////////////////////////////////////////////
// Utils (no deps)
////////////////////////////////////////////////////////////////////////////////
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function nowMs() {
  const t = process.hrtime.bigint();
  return Number(t / 1000000n);
}

function human(ms) {
  return `${ms.toFixed(1)}ms`;
}

function okLine(name, detail) {
  console.log(`\x1b[32m✔\x1b[0m ${name.padEnd(46)} ${detail}`);
}
function failLine(name, detail) {
  console.log(`\x1b[31m✖\x1b[0m ${name.padEnd(46)} ${detail}`);
}
function infoLine(text) {
  console.log(`\x1b[36m>>\x1b[0m ${text}`);
}

function toUrl(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  return `${BASE}/${clean}`;
}

async function fetchText(url, opts = {}, timeoutMs = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  let res, text;
  const started = nowMs();
  try {
    res = await fetch(url, { ...opts, signal: ctl.signal });
    text = await res.text();
  } finally {
    clearTimeout(t);
  }
  const elapsed = nowMs() - started;
  return { res, text, elapsed };
}

function safeJson(text) {
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

function readNumber(obj, keys) {
  for (const k of keys) {
    const parts = String(k).split('.');
    let cur = obj, ok = true;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object' || !(p in cur)) { ok = false; break; }
      cur = cur[p];
    }
    if (ok && Number.isFinite(Number(cur))) return Number(cur);
  }
  return null;
}

function extractTotalsFromStats(payload) {
  return readNumber(payload, [
    'totals',
    'total',
    'count',
    'projects.total',
    'overview.totals.projects',
    'data.totals',
    'data.projects.total',
  ]);
}

function extractItems(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data?.projects)) return json.data.projects;
  if (Array.isArray(json?.projects)) return json.projects;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

////////////////////////////////////////////////////////////////////////////////
// HTTP wrapper (common headers)
////////////////////////////////////////////////////////////////////////////////
const BASE_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'smoke-and-bench/1.0',
};

function authHeaders() {
  return TOKEN ? { ...BASE_HEADERS, 'Authorization': `Bearer ${TOKEN}` } : { ...BASE_HEADERS };
}

async function req(path, { method = 'GET', headers = {}, body = undefined } = {}) {
  const url = toUrl(path);
  const started = nowMs();
  const { res, text, elapsed } = await fetchText(url, {
    method,
    headers: { ...authHeaders(), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = safeJson(text);
  return { status: res.status, json, text, elapsed };
}

////////////////////////////////////////////////////////////////////////////////
/** TESTS **/
////////////////////////////////////////////////////////////////////////////////

async function testProjectsOk() {
  const q = 'api/projects?status=published&limit=100&sort=-createdAt';
  const r = await req(q);
  const items = extractItems(r.json);
  const pass = r.status === 200 && Array.isArray(items);
  const detail = `${r.status}, items=${items.length || 0}, ${human(r.elapsed)}`;
  return { name: 'GET /api/projects (limit<=100)', pass, detail };
}

async function testProjectsLimitTooHigh() {
  const q = 'api/projects?status=published&limit=200&sort=-createdAt';
  const r = await req(q);
  const isValErr = r.json?.code === 'VALIDATION_ERROR' || /VALIDATION/i.test(r.json?.message || '');
  const pass = r.status === 400 && isValErr;
  const detail = `${r.status} ${r.json?.code || ''}`.trim();
  return { name: 'GET /api/projects (limit=200 -> 400)', pass, detail };
}

async function testProjectsFeatured() {
  const r = await req('api/projects/featured');
  const items = extractItems(r.json);
  const featuredTrue = items.filter(it => !!(it.featured ?? it?.data?.featured)).length;
  const approx = `${featuredTrue}≈${items.length || 0}`;
  const pass = r.status === 200 && items.length >= 0; // non fallire se backend filtra già
  const detail = `${r.status}, items=${items.length || 0}, featuredTrue≈${approx}`;
  return { name: 'GET /api/projects/featured', pass, detail };
}

async function testStatsPublic() {
  const r = await req('api/stats/projects');
  const totals = extractTotalsFromStats(r.json);
  const pass = r.status === 200 && totals !== null;
  const detail = `${r.status}, totals=${totals ?? 'n/a'}`;
  return { name: 'GET /api/stats/projects (pubblico)', pass, detail };
}

async function testStatsOverviewPrivate() {
  const r = await req('api/stats/overview');
  // Se non c'è TOKEN, accettiamo sia 200 (endpoint pubblico) che 401/403 (privato)
  const expectedNoToken = !TOKEN && (r.status === 200 || r.status === 401 || r.status === 403);
  const pass = (TOKEN && r.status === 200) || expectedNoToken;
  const mode = TOKEN ? 'authed' : 'no-token';
  return { name: `GET /api/stats/overview (${mode})`, pass, detail: `${r.status}` };
}

async function benchProjects(batches = BATCHES, conc = CONCURRENCY) {
  const times = [];
  for (let b = 0; b < batches; b++) {
    const jobs = Array.from({ length: conc }, () => req('api/projects?status=published&limit=100&sort=-createdAt'));
    const results = await Promise.all(jobs);
    for (const r of results) times.push(r.elapsed);
    // piccola pausa tra batch
    await sleep(50);
  }
  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = times.reduce((s, v) => s + v, 0) / times.length;
  const name = `Benchmark /api/projects x${batches} batches @${conc} conc.`;
  const detail = `avg=${avg.toFixed(1)}ms, min=${min.toFixed(1)}ms, max=${max.toFixed(1)}ms`;
  const pass = true;
  return { name, pass, detail };
}

async function testRateLimit() {
  // 70 richieste lampo
  const N = 70;
  const jobs = [];
  for (let i = 0; i < N; i++) {
    jobs.push(req('api/projects?status=published&limit=100&sort=-createdAt'));
  }
  const results = await Promise.all(jobs);
  const count200 = results.filter(r => r.status === 200).length;
  const count429 = results.filter(r => r.status === 429).length;
  const others = results.length - count200 - count429;
  const pass = count429 > 0; // ci aspettiamo rate limit attivo
  const detail = `200=${count200}, 429=${count429}${others ? `, other=${others}` : ''} `;
  return { name: 'Rate limit check (70 richieste veloci)', pass, detail };
}

////////////////////////////////////////////////////////////////////////////////
// Runner
////////////////////////////////////////////////////////////////////////////////
async function run() {
  console.log('\n=== API Smoke & Bench ===');
  console.log(`Base URL: ${BASE}`);
  console.log(`Token: ${TOKEN ? '(provided)' : '(none)'}\n`);

  const tests = [
    testProjectsOk,
    testProjectsLimitTooHigh,
    testProjectsFeatured,
    testStatsPublic,
    testStatsOverviewPrivate,
  ];

  const results = [];
  for (const t of tests) {
    try {
      const r = await t();
      results.push(r);
      r.pass ? okLine(r.name, r.detail) : failLine(r.name, r.detail);
    } catch (e) {
      const r = { name: t.name || 'test', pass: false, detail: e?.message || 'error' };
      results.push(r);
      failLine(r.name, r.detail);
    }
  }

  // Benchmark
  const bench = await benchProjects();
  results.push(bench);
  okLine(bench.name, bench.detail);

  // Rate limit (opzionale)
  if (DO_RATELIMIT) {
    const rl = await testRateLimit();
    results.push(rl);
    (rl.pass ? okLine : failLine)(rl.name, rl.detail);
  }

  // Summary
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`\nSummary: ${passed}/${total} PASSED\n`);
}

run().catch(err => {
  console.error('Runner error:', err);
  process.exit(1);
});
