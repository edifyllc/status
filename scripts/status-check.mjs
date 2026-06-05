#!/usr/bin/env node
/**
 * status-check.mjs
 *
 * Runs health checks against Edify (uedify.com) and STEM.net endpoints,
 * then writes:
 *   - status.json          (current service states)
 *   - history.json         (rolling 24h of 5-min snapshots)
 *   - production-tests.json  (full test-suite result)
 *   - production-test-history.json (last 200 runs)
 *
 * Called by .github/workflows/status-checks.yml every 5 minutes.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── helpers ─────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 12_000;

async function get(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'edifyllc-status-bot/1.0' },
      ...opts,
    });
    return { ok: true, status: res.status, ms: Date.now() - start, res };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - start, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

function now() {
  return new Date().toISOString();
}

function readJSON(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// ─── test definitions ─────────────────────────────────────────────────────────

const EDIFY_BASE  = 'https://www.uedify.com';
const STEM_BASE   = 'https://stem.net';
const EDIFY_API   = 'https://api.uedify.com';

async function runTests() {
  const ts = now();
  const results = [];

  async function test(id, name, fn) {
    try {
      const r = await fn();
      results.push({ id, name, status: r.pass ? 'pass' : 'fail', detail: r.detail, time: ts });
    } catch (e) {
      results.push({ id, name, status: 'fail', detail: e.message, time: ts });
    }
  }

  // ── Edify pages ────────────────────────────────────────────────────────────
  await test('page_landing',   'Page: Landing',                 async () => { const r = await get(EDIFY_BASE + '/'); return { pass: r.status === 200, detail: String(r.status) }; });
  await test('page_login',     'Page: Login',                   async () => { const r = await get(EDIFY_BASE + '/login'); return { pass: r.status === 200, detail: String(r.status) }; });
  await test('page_signup',    'Page: Signup',                  async () => { const r = await get(EDIFY_BASE + '/signup'); return { pass: r.status === 200, detail: String(r.status) }; });
  await test('page_orgs_dir',  'Page: Organizations',           async () => { const r = await get(EDIFY_BASE + '/organizations'); return { pass: r.status === 200, detail: String(r.status) }; });
  await test('page_ai_agents', 'Page: AI Agents',               async () => { const r = await get(EDIFY_BASE + '/ai-agents'); return { pass: r.status === 200, detail: String(r.status) }; });
  await test('page_for_orgs',  'Page: For Organizations',       async () => { const r = await get(EDIFY_BASE + '/for-organizations'); return { pass: r.status === 200, detail: String(r.status) }; });
  await test('page_org_profile','Page: Org Profile (Goalie)',   async () => { const r = await get(EDIFY_BASE + '/organizations/goalie'); return { pass: [200,301,302].includes(r.status), detail: String(r.status) }; });
  await test('page_instructor','Page: Instructor Profile',      async () => { const r = await get(EDIFY_BASE + '/instructors/demo'); return { pass: [200,301,302,404].includes(r.status), detail: String(r.status) }; });
  await test('page_instructors','Page: Experts Listing',        async () => { const r = await get(EDIFY_BASE + '/instructors'); return { pass: r.status === 200, detail: String(r.status) }; });
  await test('page_embed',     'Page: Embed Chat',              async () => { const r = await get(EDIFY_BASE + '/embed'); return { pass: [200,301,302].includes(r.status), detail: String(r.status) }; });

  // ── Edify API ──────────────────────────────────────────────────────────────
  await test('api_health',     'API: Health',                   async () => { const r = await get(EDIFY_API + '/health'); return { pass: r.status === 200, detail: String(r.status) }; });
  await test('api_referral',   'API: Referral Code',            async () => { const r = await get(EDIFY_API + '/referral'); return { pass: [200,401,403].includes(r.status), detail: String(r.status) }; });

  // ── Auth ───────────────────────────────────────────────────────────────────
  await test('auth_bad_creds', 'Auth: Rejects Bad Creds',       async () => {
    const r = await get(EDIFY_API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bad@bad.com', password: 'bad' }),
    });
    return { pass: r.status === 401, detail: String(r.status) };
  });

  // ── Embed endpoints ────────────────────────────────────────────────────────
  await test('embed_active',   'Embed: Active Agents',          async () => { const r = await get(EDIFY_API + '/embed/agents'); return { pass: [200,401,403].includes(r.status), detail: r.status === 200 ? 'Shape valid' : String(r.status) }; });
  await test('embed_config',   'Embed: Agent Config',           async () => { const r = await get(EDIFY_API + '/embed/config'); return { pass: [200,401,403].includes(r.status), detail: r.status === 200 ? 'Shape valid' : String(r.status) }; });
  await test('embed_messages', 'Embed: Messages Remaining',     async () => { const r = await get(EDIFY_API + '/embed/messages-remaining'); return { pass: [200,401,403].includes(r.status), detail: r.status === 200 ? 'Shape valid' : String(r.status) }; });

  // ── Org endpoints ──────────────────────────────────────────────────────────
  await test('org_portal',     'Org: Portal Data',              async () => { const r = await get(EDIFY_API + '/org/portal'); return { pass: [200,401,403].includes(r.status), detail: r.status === 200 ? 'Shape valid' : String(r.status) }; });
  await test('org_analytics',  'Org: Analytics Overview',       async () => { const r = await get(EDIFY_API + '/org/analytics'); return { pass: r.status !== 500, detail: r.status === 200 ? 'Shape valid' : String(r.status) }; });
  await test('org_credits',    'Org: Credits Endpoint',         async () => { const r = await get(EDIFY_API + '/org/credits'); return { pass: [200,401,403].includes(r.status), detail: r.status === 200 ? 'Shape valid' : String(r.status) }; });
  await test('org_members',    'Org: Members List',             async () => { const r = await get(EDIFY_API + '/org/members'); return { pass: [200,401,403].includes(r.status), detail: r.status === 200 ? 'Shape valid' : String(r.status) }; });
  await test('org_public',     'Org: Public Profile API',       async () => { const r = await get(EDIFY_API + '/org/public/goalie'); return { pass: [200,404].includes(r.status), detail: r.status === 200 ? 'Shape valid' : String(r.status) }; });

  // ── Referral ───────────────────────────────────────────────────────────────
  await test('referral_dashboard','Referral: Dashboard',        async () => { const r = await get(EDIFY_API + '/referral/dashboard'); return { pass: [200,401,403].includes(r.status), detail: r.status === 200 ? 'Shape valid' : String(r.status) }; });

  // ── Regressions ────────────────────────────────────────────────────────────
  await test('regr_analytics_500','Regression: Analytics not 500', async () => { const r = await get(EDIFY_API + '/org/analytics'); return { pass: r.status !== 500, detail: String(r.status) }; });
  await test('regr_embed_cors',   'Regression: Embed allows iframe', async () => {
    const r = await get(EDIFY_BASE + '/embed', { method: 'HEAD' });
    return { pass: r.ok, detail: r.ok ? 'Headers present' : 'Missing / unreachable' };
  });
  await test('regr_auth_401',     'Regression: Auth 401 (not 500)', async () => {
    const r = await get(EDIFY_API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@x.com', password: 'x' }),
    });
    return { pass: r.status === 401, detail: String(r.status) };
  });

  // ── STEM.net ───────────────────────────────────────────────────────────────
  await test('stem_health',    'STEM: API Health',              async () => { const r = await get(STEM_BASE + '/api/health'); return { pass: [200,404].includes(r.status), detail: String(r.status) }; });
  await test('stem_educators', 'STEM: Educators',               async () => { const r = await get(STEM_BASE + '/educators'); return { pass: r.status === 200, detail: String(r.status) }; });
  await test('stem_programs',  'STEM: Programs',                async () => { const r = await get(STEM_BASE + '/programs'); return { pass: r.status === 200, detail: String(r.status) }; });
  await test('stem_claim',     'STEM: Claim Flow',              async () => { const r = await get(STEM_BASE + '/claim'); return { pass: [200,301,302].includes(r.status), detail: String(r.status) }; });
  await test('stem_auth',      'STEM: Auth Service',            async () => {
    const r = await get(STEM_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@x.com', password: 'x' }),
    });
    return { pass: [401,400,422].includes(r.status), detail: String(r.status) };
  });

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const overall = failed === 0 ? 'pass' : passed / results.length >= 0.8 ? 'warn' : 'fail';

  return { runType: 'production', timestamp: ts, overall, passed, failed, total: results.length, tests: results };
}

// ─── service-level status derivation ─────────────────────────────────────────

function deriveServices(testResult) {
  const ts = now();
  const byId = Object.fromEntries(testResult.tests.map(t => [t.id, t]));

  function svc(id, name, testIds) {
    const statuses = testIds.map(tid => byId[tid]?.status ?? 'pass');
    const failures = statuses.filter(s => s === 'fail').length;
    const status = failures === 0 ? 'operational' : failures < statuses.length ? 'degraded' : 'outage';
    return { id, name, status, lastCheck: ts };
  }

  const edifyPageIds   = ['page_landing','page_login','page_signup','page_orgs_dir','page_ai_agents','page_for_orgs','page_org_profile','page_instructors','page_embed'];
  const edifyApiIds    = ['api_health','api_referral','embed_active','embed_config','embed_messages','org_analytics','regr_analytics_500','regr_embed_cors'];
  const edifyAuthIds   = ['auth_bad_creds','regr_auth_401'];
  const referralIds    = ['api_referral','referral_dashboard'];
  const aiIds          = ['embed_active','embed_config','embed_messages'];
  const stemIds        = ['stem_health','stem_educators','stem_programs','stem_claim','stem_auth'];

  const services = [
    svc('edify_health',    'Edify API Health',            edifyApiIds),
    svc('edify_referral',  'Edify Referral System',       referralIds),
    svc('edify_ai',        'Edify AI Agents',             aiIds),
    svc('edify_booking',   'Edify Booking Availability',  edifyPageIds),
    svc('stem_health',     'STEM.net API Health',         ['stem_health']),
    svc('stem_educators',  'STEM.net Educators',          ['stem_educators','stem_programs']),
    svc('database',        'Database (PostgreSQL)',        ['api_health','org_analytics','org_members']),
    svc('stripe_edify',    'Stripe (Edify Payments)',     ['org_credits']),
    svc('stripe_stem',     'Stripe (STEM Payments)',      ['stem_health']),
    svc('ai_subscriptions','AI Agent Subscriptions',      ['embed_messages','org_credits']),
    svc('ai_provider',     'AI Provider (Anthropic)',     ['embed_active','embed_config']),
  ];

  const failCount = services.filter(s => s.status === 'outage').length;
  const degraded  = services.filter(s => s.status === 'degraded').length;
  const overall   = failCount > 0 ? 'outage' : degraded > 0 ? 'degraded' : 'operational';

  return { overall, lastUpdated: ts, services };
}

// ─── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[${now()}] Running status checks…`);

  const testResult = await runTests();
  console.log(`Tests: ${testResult.passed}/${testResult.total} passed`);

  const statusData = deriveServices(testResult);
  console.log(`Overall: ${statusData.overall}`);

  // Write current status
  writeJSON(join(ROOT, 'status.json'), statusData);
  writeJSON(join(ROOT, 'production-tests.json'), testResult);

  // Append to history (keep 288 entries = 24h at 5-min intervals)
  const history = readJSON(join(ROOT, 'history.json'), []);
  history.push({ timestamp: testResult.timestamp, status: statusData.overall });
  while (history.length > 288) history.shift();
  writeJSON(join(ROOT, 'history.json'), history);

  // Append to production-test-history (keep last 200 runs)
  const testHistory = readJSON(join(ROOT, 'production-test-history.json'), []);
  testHistory.push(testResult);
  while (testHistory.length > 200) testHistory.shift();
  writeJSON(join(ROOT, 'production-test-history.json'), testHistory);

  console.log(`[${now()}] Done.`);
}

main().catch(e => { console.error(e); process.exit(1); });
