#!/usr/bin/env node
// Behavioral tests for middleware.js, the login gate in front of /dashboard,
// /seo-report and /seo-report.html. Every request goes through the modeled
// matcher dispatch and the DEFAULT export (what Vercel runs). No network:
// lead-crm is stubbed through global fetch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ENCODED_PROBES, loadOwnerGate, runDefault } from './lib-owner-gate-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gateModule = await loadOwnerGate(root);
const { OWNER_COOKIE, LEAD_CRM_URL, normalizePath } = gateModule;

const ORIGIN = 'https://www.framerestorationutah.com';
const SESSION_FIXTURE = ['fixture', 'payload_part', 'signature_part'].join('.');

function crm(status, body) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, authorization: init?.headers?.Authorization });
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  };
  impl.calls = calls;
  return impl;
}
const neverCalled = async () => { throw new Error('auth service must not be called'); };
const req = (p, init = {}) => new Request(`${ORIGIN}${p}`, init);
const withCookie = (p, value = SESSION_FIXTURE) => req(p, { headers: { cookie: `a=b; ${OWNER_COOKIE}=${value}` } });

async function run(request, fetchStub = neverCalled) {
  const { dispatched, response } = await runDefault(gateModule, request, fetchStub);
  assert.ok(dispatched, `matcher does not dispatch ${new URL(request.url).pathname}`);
  return response;
}

const PAGES = ['/dashboard', '/dashboard/', '/dashboard/index.html', '/dashboard.html', '/seo-report', '/seo-report.html', '/seo-report/'];
const ASSETS = ['/dashboard/config.js', '/dashboard/dashboard.js', '/dashboard/dashboard.css', '/dashboard/safe-html.js', '/dashboard/nope.txt'];

test('anonymous pages redirect to /owner-login without calling the auth service', async () => {
  for (const p of PAGES) {
    const response = await run(req(p));
    assert.equal(response.status, 302, p);
    assert.equal(response.headers.get('location'), '/owner-login', p);
    assert.equal(response.headers.get('x-middleware-next'), null, p);
    assert.match(response.headers.get('cache-control'), /private, no-store/, p);
    assert.equal(response.headers.get('vary'), 'Cookie', p);
    assert.match(response.headers.get('x-robots-tag'), /noindex/, p);
  }
});

test('anonymous assets get 401 with no file content', async () => {
  for (const p of ASSETS) {
    const response = await run(req(p));
    assert.equal(response.status, 401, p);
    assert.equal(await response.text(), 'Unauthorized', p);
  }
});

test('encoded, doubled, backslashed, traversal, .html and mixed-case variants are gated', async () => {
  for (const p of ENCODED_PROBES) {
    const response = await run(req(p));
    assert.ok([302, 401].includes(response.status), `${p} -> ${response.status}`);
    assert.equal(response.headers.get('x-middleware-next'), null, p);
  }
});

test('normalizePath canonicalizes every variant', () => {
  const cases = {
    '//dashboard': '/dashboard',
    '/dashboard%2Fconfig.js': '/dashboard/config.js',
    '/dashboard%252Fconfig.js': '/dashboard/config.js',
    '/dashboard%5Cconfig.js': '/dashboard/config.js',
    '/%64ashboard/config.js': '/dashboard/config.js',
    '/dashboard.html': '/dashboard',
    '/dashboard/index.html': '/dashboard',
    '/seo-report/': '/seo-report',
    '/SEO-Report.HTML': '/seo-report',
    '/DASHBOARD/Config.JS': '/dashboard/config.js',
    '/locations/provo': '/locations/provo',
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(normalizePath(input), expected, input);
});

test('malformed encoding fails closed with 400', async () => {
  for (const p of ['/dashboard%', '/dashboard%E0%A4%A', '/%64ashboard%ZZ/config.js', '/dashboard%00/config.js', '/dashboard%2525252525252Fconfig.js']) {
    assert.equal(normalizePath(new URL(`${ORIGIN}${p}`).pathname), null, p);
    const response = await run(req(p));
    assert.equal(response.status, 400, p);
  }
});

test('public pages pass straight through without calling the auth service', async () => {
  for (const p of ['/', '/leads', '/owner-login', '/owner-login.js', '/global-modal.js', '/services']) {
    const response = await run(req(p));
    assert.equal(response.headers.get('x-middleware-next'), '1', p);
  }
  // High-volume public folders are not dispatched at all (plain paths only).
  for (const p of ['/images/logo.png', '/assets/x.css', '/locations/provo', '/ingest/e']) {
    const { dispatched } = await runDefault(gateModule, req(p), neverCalled);
    assert.equal(dispatched, false, p);
  }
});

test('malformed cookie is refused without calling the auth service', async () => {
  const response = await run(withCookie('/dashboard/dashboard.js', 'short'));
  assert.equal(response.status, 401);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});

test('revoked or expired session is refused and the cookie cleared', async () => {
  for (const status of [401, 403]) {
    const auth = crm(status, { error: 'invalid_session' });
    const page = await run(withCookie('/dashboard'), auth);
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('location'), '/owner-login');
    assert.match(page.headers.get('set-cookie'), new RegExp(`^${OWNER_COOKIE}=;.*Max-Age=0`));
    const asset = await run(withCookie('//dashboard%2Fdashboard.js'), auth);
    assert.equal(asset.status, 401);
  }
});

test('unknown role is refused', async () => {
  const response = await run(withCookie('/dashboard/config.js'), crm(200, { user: { name: 'X', role: 'owner' } }));
  assert.equal(response.status, 401);
});

test('auth outage fails closed with 503', async () => {
  for (const auth of [crm(500, {}), crm(503, {}), async () => { throw new Error('down'); }, crm(200, undefined)]) {
    const response = await run(withCookie('/dashboard/dashboard.js'), auth);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('x-middleware-next'), null);
  }
});

test('valid allowlisted session passes through with private, no-store and Vary: Cookie', async () => {
  for (const role of ['viewer', 'sales', 'admin']) {
    const auth = crm(200, { user: { name: 'Team', role } });
    for (const p of ['/dashboard', ...ASSETS]) {
      const response = await run(withCookie(p), auth);
      assert.equal(response.headers.get('x-middleware-next'), '1', `${role} ${p}`);
      assert.equal(response.headers.get('cache-control'), 'private, no-store', `${role} ${p}`);
      assert.equal(response.headers.get('vary'), 'Cookie', `${role} ${p}`);
    }
    assert.equal(auth.calls[0].url, `${LEAD_CRM_URL}?action=session`);
    assert.equal(auth.calls[0].authorization, `Bearer ${SESSION_FIXTURE}`);
  }
});

test('valid session on /seo-report variants goes to /dashboard', async () => {
  for (const p of ['/seo-report', '/seo-report.html', '/seo-report/']) {
    const response = await run(withCookie(p), crm(200, { user: { name: 'Team', role: 'viewer' } }));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/dashboard');
  }
});

test('POST /owner-session sets an HttpOnly cookie only for a verified, same-origin token', async () => {
  const ok = await run(req('/owner-session', {
    method: 'POST', headers: { authorization: `Bearer ${SESSION_FIXTURE}`, origin: ORIGIN },
  }), crm(200, { user: { name: 'Team', role: 'admin' } }));
  assert.equal(ok.status, 204);
  const cookie = ok.headers.get('set-cookie');
  assert.ok(cookie.startsWith(`${OWNER_COOKIE}=${SESSION_FIXTURE};`));
  for (const flag of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=28800']) assert.ok(cookie.includes(flag), flag);

  const bad = await run(req('/owner-session', {
    method: 'POST', headers: { authorization: `Bearer ${SESSION_FIXTURE}`, origin: ORIGIN },
  }), crm(401, { error: 'invalid_session' }));
  assert.equal(bad.status, 401);
  assert.match(bad.headers.get('set-cookie'), /Max-Age=0/);

  const missingBearer = await run(req('/owner-session', { method: 'POST', headers: { origin: ORIGIN } }));
  assert.equal(missingBearer.status, 401);
});

test('/owner-session refuses missing or foreign Origin on POST and other methods', async () => {
  const noOrigin = await run(req('/owner-session', {
    method: 'POST', headers: { authorization: `Bearer ${SESSION_FIXTURE}` },
  }));
  assert.equal(noOrigin.status, 403);
  const cross = await run(req('/owner-session', {
    method: 'POST', headers: { authorization: `Bearer ${SESSION_FIXTURE}`, origin: 'https://evil.example' },
  }));
  assert.equal(cross.status, 403);
  assert.equal((await run(req('/owner-session'))).status, 405);
  const crossDelete = await run(req('/owner-session', { method: 'DELETE', headers: { origin: 'https://evil.example' } }));
  assert.equal(crossDelete.status, 403);
  const del = await run(req('/owner-session', { method: 'DELETE', headers: { origin: ORIGIN } }));
  assert.equal(del.status, 204);
  assert.match(del.headers.get('set-cookie'), /Max-Age=0/);
});

test('owner-login page is noindex and carries no report content', () => {
  const html = fs.readFileSync(path.join(root, 'owner-login.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.doesNotMatch(html, /posthog|dashboard\.js|config\.js|Built by/i);
});

test('dashboard HTML stays noindex and has no builder credit', () => {
  for (const rel of ['dashboard/index.html', 'dashboard/config.js']) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.doesNotMatch(text, /Built by|Conwell/i, rel);
  }
  const index = fs.readFileSync(path.join(root, 'dashboard/index.html'), 'utf8');
  assert.match(index, /<meta name="robots" content="noindex,nofollow">/);
});

test('sign-out only confirms after a 204 from DELETE /owner-session', () => {
  const dashboard = fs.readFileSync(path.join(root, 'dashboard/dashboard.js'), 'utf8');
  const leads = fs.readFileSync(path.join(root, 'leads.html'), 'utf8');
  for (const [name, source] of [['dashboard/dashboard.js', dashboard], ['leads.html', leads]]) {
    assert.match(source, /method\s*:\s*['"]DELETE['"]/, `${name}: no DELETE /owner-session`);
    assert.match(source, /status\s*!==\s*204/, `${name}: sign-out does not check for 204`);
  }
});
