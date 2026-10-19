#!/usr/bin/env node
// Behavioral tests for middleware.js, the login gate in front of /dashboard,
// /seo-report and /seo-report.html. No network: lead-crm is stubbed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../middleware.js', import.meta.url), 'utf8');
const gateModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { gate, config, OWNER_COOKIE, LEAD_CRM_URL } = gateModule;

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
const neverCalled = () => { throw new Error('auth service must not be called'); };
const req = (path, init = {}) => new Request(`${ORIGIN}${path}`, init);
const withCookie = (path, value = SESSION_FIXTURE) => req(path, { headers: { cookie: `a=b; ${OWNER_COOKIE}=${value}` } });

const PAGES = ['/dashboard', '/dashboard/', '/dashboard/index.html', '/seo-report', '/seo-report.html'];
const ASSETS = ['/dashboard/config.js', '/dashboard/dashboard.js', '/dashboard/dashboard.css', '/dashboard/safe-html.js', '/dashboard/nope.txt'];

test('matcher covers every protected route', () => {
  for (const route of ['/dashboard', '/dashboard/:path*', '/seo-report', '/seo-report.html', '/owner-session']) {
    assert.ok(config.matcher.includes(route), route);
  }
});

test('anonymous pages redirect to /owner-login without calling the auth service', async () => {
  for (const path of PAGES) {
    const response = await gate(req(path), neverCalled);
    assert.equal(response.status, 302, path);
    assert.equal(response.headers.get('location'), '/owner-login', path);
    assert.equal(response.headers.get('x-middleware-next'), null, path);
    assert.match(response.headers.get('cache-control'), /no-store/, path);
    assert.match(response.headers.get('x-robots-tag'), /noindex/, path);
  }
});

test('anonymous assets get 401 with no file content', async () => {
  for (const path of ASSETS) {
    const response = await gate(req(path), neverCalled);
    assert.equal(response.status, 401, path);
    assert.equal(await response.text(), 'Unauthorized', path);
  }
});

test('mixed-case paths are still gated', async () => {
  const response = await gate(req('/Dashboard/Dashboard.js'), neverCalled);
  assert.equal(response.status, 401);
});

test('malformed cookie is refused without calling the auth service', async () => {
  const response = await gate(withCookie('/dashboard/dashboard.js', 'short'), neverCalled);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});

test('revoked or expired session is refused and the cookie cleared', async () => {
  for (const status of [401, 403]) {
    const auth = crm(status, { error: 'invalid_session' });
    const page = await gate(withCookie('/dashboard'), auth);
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('location'), '/owner-login');
    assert.match(page.headers.get('set-cookie'), new RegExp(`^${OWNER_COOKIE}=;.*Max-Age=0`));
    const asset = await gate(withCookie('/dashboard/dashboard.js'), auth);
    assert.equal(asset.status, 401);
  }
});

test('unknown role is refused', async () => {
  const response = await gate(withCookie('/dashboard/config.js'), crm(200, { user: { name: 'X', role: 'owner' } }));
  assert.equal(response.status, 401);
});

test('auth outage fails closed with 503', async () => {
  for (const auth of [crm(500, {}), crm(503, {}), async () => { throw new Error('down'); }, crm(200, undefined)]) {
    const response = await gate(withCookie('/dashboard/dashboard.js'), auth);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('x-middleware-next'), null);
  }
});

test('valid allowlisted session passes through to the static file', async () => {
  for (const role of ['viewer', 'sales', 'admin']) {
    const auth = crm(200, { user: { name: 'Team', role } });
    for (const path of ['/dashboard', ...ASSETS]) {
      const response = await gate(withCookie(path), auth);
      assert.equal(response.headers.get('x-middleware-next'), '1', `${role} ${path}`);
    }
    assert.equal(auth.calls[0].url, `${LEAD_CRM_URL}?action=session`);
    assert.equal(auth.calls[0].authorization, `Bearer ${SESSION_FIXTURE}`);
  }
});

test('valid session on /seo-report goes to /dashboard', async () => {
  for (const path of ['/seo-report', '/seo-report.html']) {
    const response = await gate(withCookie(path), crm(200, { user: { name: 'Team', role: 'viewer' } }));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/dashboard');
  }
});

test('POST /owner-session sets an HttpOnly cookie only for a verified token', async () => {
  const ok = await gate(req('/owner-session', {
    method: 'POST', headers: { authorization: `Bearer ${SESSION_FIXTURE}`, origin: ORIGIN },
  }), crm(200, { user: { name: 'Team', role: 'admin' } }));
  assert.equal(ok.status, 204);
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, new RegExp(`^${OWNER_COOKIE}=${SESSION_FIXTURE.replace(/\./g, '\\.')};`));
  for (const flag of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=28800']) assert.ok(cookie.includes(flag), flag);

  const bad = await gate(req('/owner-session', {
    method: 'POST', headers: { authorization: `Bearer ${SESSION_FIXTURE}` },
  }), crm(401, { error: 'invalid_session' }));
  assert.equal(bad.status, 401);
  assert.match(bad.headers.get('set-cookie'), /Max-Age=0/);

  const missing = await gate(req('/owner-session', { method: 'POST' }), neverCalled);
  assert.equal(missing.status, 401);
});

test('/owner-session refuses cross-origin requests and other methods', async () => {
  const cross = await gate(req('/owner-session', {
    method: 'POST', headers: { authorization: `Bearer ${SESSION_FIXTURE}`, origin: 'https://evil.example' },
  }), neverCalled);
  assert.equal(cross.status, 403);
  const get = await gate(req('/owner-session'), neverCalled);
  assert.equal(get.status, 405);
  const del = await gate(req('/owner-session', { method: 'DELETE', headers: { origin: ORIGIN } }), neverCalled);
  assert.equal(del.status, 204);
  assert.match(del.headers.get('set-cookie'), /Max-Age=0/);
});

test('owner-login page is noindex and carries no report content', () => {
  const html = fs.readFileSync(new URL('../owner-login.html', import.meta.url), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.doesNotMatch(html, /posthog|dashboard\.js|config\.js|Built by/i);
});

test('dashboard HTML stays noindex and has no builder credit', () => {
  for (const rel of ['../dashboard/index.html', '../dashboard/config.js']) {
    const text = fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /Built by|Conwell/i, rel);
  }
  const index = fs.readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
  assert.match(index, /<meta name="robots" content="noindex,nofollow">/);
});
