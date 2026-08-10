#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tainted = '<img src=x onerror="globalThis.__dashboardStolen=1">';
const sessionToken = 'header_payload.signature_part.session_signature';
const requests = [];
const canonicalRoutes = new Map([
  ['review.html', 'https://www.framerestorationutah.com/review'],
  ['dashboard/index.html', 'https://www.framerestorationutah.com/dashboard'],
  ['leads.html', 'https://www.framerestorationutah.com/leads'],
]);
const loginViewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 740, height: 360 },
];

for (const [relative, expected] of canonicalRoutes) {
  const markup = fs.readFileSync(path.resolve(root, relative), 'utf8');
  const canonicalTags = (markup.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/giu) || []);
  assert.equal(canonicalTags.length, 1, `${relative} must expose exactly one canonical`);
  const href = canonicalTags[0].match(/\bhref=["']([^"']+)["']/iu)?.[1];
  assert.equal(href, expected, `${relative} canonical must match its clean production route`);
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const requestPath = new URL(req.url, 'http://localhost').pathname;
  const relative = requestPath === '/dashboard' || requestPath === '/dashboard/'
    ? 'dashboard/index.html'
    : requestPath.replace(/^\//, '');
  const resolved = path.resolve(root, relative || 'index.html');
  if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': contentTypes[path.extname(resolved)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(resolved).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.route('https://cdnjs.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('https://api.weather.gov/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: [] }) }));
  await page.route('https://www.googleapis.com/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.route('https://hdcflshhomzildwqlmwh.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const action = url.searchParams.get('action');
    requests.push({
      url: request.url(),
      method: request.method(),
      authorization: request.headers().authorization || '',
      body: request.postData() || '',
    });

    if (action === 'login') {
      assert.equal(request.method(), 'POST');
      assert.deepEqual(JSON.parse(request.postData()), {
        routing_key: 'frame-roofing-2026',
        pin: '654321',
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: sessionToken,
          token_type: 'Bearer',
          expires_in: 28_800,
          user: { name: 'Admin', role: 'admin' },
        }),
      });
      return;
    }
    assert.equal(request.headers().authorization, `Bearer ${sessionToken}`);
    if (action === 'access_list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { name: 'Admin', role: 'admin' },
          access: [{
            id: '123e4567-e89b-42d3-a456-426614174001',
            name: 'Admin',
            role: 'admin',
            active: true,
            last_accessed: null,
          }, {
            id: '123e4567-e89b-42d3-a456-426614174000',
            name: tainted,
            role: 'sales',
            active: true,
            last_accessed: null,
          }],
        }),
      });
      return;
    }
    if (action === 'access_reset') {
      assert.equal(request.method(), 'POST');
      assert.deepEqual(JSON.parse(request.postData()), {
        id: '123e4567-e89b-42d3-a456-426614174001',
        pin: '765432',
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session_revoked: true }),
      });
      return;
    }
    if (action === 'session') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { name: 'Admin', role: 'admin' } }),
      });
      return;
    }
    if (action === 'list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { name: 'Admin', role: 'admin' },
          schema: { crm_parity_ready: true },
          leads: [{
            id: 1,
            created_at: '2026-08-07T12:00:00Z',
            name: tainted,
            phone: tainted,
            service: tainted,
            source_page: tainted,
            status: 'ul_request',
            tier: 'general',
            notification_attempts: 1,
            notification_error: tainted,
            notified: false,
            lead_notifications: [
              {
                recipient_role: 'primary',
                status: 'delivered',
                attempts: 1,
                delivered_at: '2026-08-07T12:01:00Z',
              },
              {
                recipient_role: 'backup',
                status: 'bounced',
                attempts: 2,
                last_event_at: '2026-08-07T12:05:00Z',
                last_error_code: 'email.bounced',
                last_error: tainted,
              },
            ],
          }, {
            id: 2,
            created_at: '2026-08-07T11:00:00Z',
            name: 'Primary failure fixture',
            status: 'new',
            tier: 'general',
            notification_attempts: 2,
            notified: false,
            lead_notifications: [
              {
                recipient_role: 'primary',
                status: 'failed',
                attempts: 2,
                last_event_at: '2026-08-07T11:05:00Z',
                last_error_code: 'provider_error',
              },
              {
                recipient_role: 'backup',
                status: 'delivered',
                attempts: 1,
                delivered_at: '2026-08-07T11:01:00Z',
              },
            ],
          }, {
            id: 3,
            created_at: '2026-08-07T10:00:00Z',
            name: 'Successful outbox fixture',
            status: 'contacted',
            tier: 'general',
            notification_attempts: 8,
            notification_error: tainted,
            notified: false,
            lead_notifications: [
              {
                recipient_role: 'primary',
                status: 'delivered',
                attempts: 1,
                delivered_at: '2026-08-07T10:01:00Z',
              },
              {
                recipient_role: 'backup',
                status: 'accepted',
                attempts: 1,
                accepted_at: '2026-08-07T10:01:00Z',
              },
            ],
          }],
        }),
      });
      return;
    }
    if (action === 'growth_state') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { name: 'Admin', role: 'admin' }, storage_ready: false, actions: [] }),
      });
      return;
    }
    if (action === 'clicks') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { name: 'Admin', role: 'admin' },
          totals: { call: 1, sms: 0 },
          by_source: { [tainted]: { call: 1, sms: 0 } },
          recent: [{
            id: 1,
            created_at: '2026-08-07T12:00:00Z',
            click_type: 'call',
            source: tainted,
            source_page: tainted,
            city: tainted,
          }],
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  // Register weekly-report last with a more specific route; Playwright applies
  // the most recently registered matching handler first.
  await page.route('**/functions/v1/weekly-report?*', async (route) => {
    const request = route.request();
    requests.push({
      url: request.url(),
      method: request.method(),
      authorization: request.headers().authorization || '',
      body: request.postData() || '',
    });
    assert.equal(request.headers().authorization, `Bearer ${sessionToken}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { name: 'Admin', role: 'admin' },
        generated_at: '2026-08-07T12:00:00Z',
        summary: { total_pageviews: 1, total_leads: 1, total_calls: 1 },
        gap_summary: { locations_with_traffic: 1, total_locations: 1, coverage_pct: 100, locations_no_traffic: 0 },
        top_pages: [{ path: `/${tainted}`, views: 1 }],
        location_performance: [{ location: tainted, views: 1 }],
        location_gaps: [],
        leads: [{ name: tainted, service: tainted, source_page: tainted, created_at: '2026-08-07T12:00:00Z' }],
        calls: [{ from_number: tainted, city: tainted, duration_seconds: 1, created_at: '2026-08-07T12:00:00Z' }],
        traffic_breakdown: {},
        traffic_sources: {},
      }),
    });
  });

  await page.goto(`http://127.0.0.1:${address.port}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.fill('#pinInput', '654321');
  await page.click('button.login-btn[type="submit"]');
  await page.waitForFunction(() => document.getElementById('reportWrap').style.display === 'block');
  await page.waitForFunction((value) => document.getElementById('ct').textContent.includes(value), tainted);

  assert.equal(await page.inputValue('#pinInput'), '', 'login input retained PIN');
  const storage = await page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }));
  assert.equal(storage.session['frame.dashboard.session'], sessionToken);
  assert.equal(Object.values(storage.local).includes(sessionToken), false, 'session token persisted in localStorage');
  const serializedStorage = JSON.stringify(storage);
  assert.equal(serializedStorage.includes('654321'), false, 'PIN persisted in browser storage');
  assert.equal(serializedStorage.includes('frame-roofing-2026'), false, 'routing key persisted in browser storage');
  assert.equal(await page.locator('#ct img').count(), 0, 'tainted report field created an element');
  assert.equal(await page.evaluate(() => globalThis.__dashboardStolen), undefined, 'tainted handler executed');

  await page.evaluate(() => window.__dashboard.openAdmin());
  await page.waitForFunction((value) => document.getElementById('accessBody').textContent.includes(value), tainted);
  assert.equal(await page.locator('#accessBody img').count(), 0, 'tainted access name created an element');

  page.once('dialog', (dialog) => dialog.accept('765432'));
  await page.locator('#accessBody button').first().click();
  await page.waitForFunction(() => document.getElementById('loginOverlay').style.display === 'flex');
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem('frame.dashboard.session')),
    null,
    'self-PIN reset retained a revoked session token',
  );

  await page.fill('#pinInput', '654321');
  await page.click('button.login-btn[type="submit"]');
  await page.waitForFunction(() => document.getElementById('reportWrap').style.display === 'block');

  await page.evaluate(() => sessionStorage.removeItem('frame.dashboard.session'));
  await page.goto(`http://127.0.0.1:${address.port}/seo-report.html`, { waitUntil: 'domcontentloaded' });
  await page.fill('#pinInput', '654321');
  await page.click('#loginForm button[type="submit"]');
  await page.waitForFunction((value) => document.getElementById('ct').textContent.includes(value), tainted);
  assert.equal(await page.inputValue('#pinInput'), '', 'legacy report retained PIN');
  assert.equal(await page.locator('#ct img').count(), 0, 'legacy report tainted field created an element');

  await page.evaluate(() => sessionStorage.removeItem('frame.dashboard.session'));
  await page.goto(`http://127.0.0.1:${address.port}/leads.html`, { waitUntil: 'domcontentloaded' });
  for (const viewport of loginViewports) {
    await page.setViewportSize(viewport);
    await page.goto(`http://127.0.0.1:${address.port}/leads.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('#pinInput').focus();
    const closedPanels = await page.locator('.panel').evaluateAll((panels) => panels.map((panel) => ({
      inert: panel.hasAttribute('inert'),
      ariaHidden: panel.getAttribute('aria-hidden'),
    })));
    assert(
      closedPanels.every((panel) => panel.inert && panel.ariaHidden === 'true'),
      `closed CRM panels remain keyboard-accessible at ${viewport.width}x${viewport.height}`,
    );
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => ({
        insideLogin: document.getElementById('loginOverlay').contains(document.activeElement),
        insidePanel: Boolean(document.activeElement.closest?.('.panel')),
      }));
      assert.equal(
        focus.insideLogin,
        true,
        `login focus escaped at ${viewport.width}x${viewport.height}, step ${step + 1}`,
      );
      assert.equal(
        focus.insidePanel,
        false,
        `closed panel received focus at ${viewport.width}x${viewport.height}, step ${step + 1}`,
      );
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.fill('#pinInput', '654321');
  await page.click('button.login-btn[type="submit"]');
  await page.waitForFunction((value) => document.getElementById('ct').textContent.includes(value), tainted);
  await page.waitForFunction((value) => document.getElementById('clicks-recent').textContent.includes(value), tainted);
  assert.equal(await page.inputValue('#pinInput'), '', 'CRM retained PIN');
  assert.equal(await page.locator('#ct img, #notifyRows img, #clicks-recent img').count(), 0, 'CRM tainted field created an element');
  assert.equal(await page.locator('#k-notify').innerText(), '2', 'notification KPI ignored a recipient failure');
  const crmText = await page.locator('#ct').innerText();
  assert.match(crmText, /Backup: bounced/i, 'CRM badge hid the backup delivery failure');
  assert.match(crmText, /Landon: failed/i, 'CRM badge hid the primary delivery failure');
  const notificationPanelText = await page.locator('#notifyRows').innerText();
  assert.match(notificationPanelText, /Backup: bounced/i, 'notification panel hid the backup role');
  assert.match(notificationPanelText, /Landon: failed/i, 'notification panel hid the primary role');
  assert.doesNotMatch(notificationPanelText, /Successful outbox fixture/i, 'stale legacy fields overrode successful outbox receipts');
  const successfulOutboxRow = await page.locator('#ct tr.row[data-id="3"]').innerText();
  assert.match(successfulOutboxRow, /delivered/i, 'successful outbox badge lost authoritative delivery state');
  assert.doesNotMatch(successfulOutboxRow, /failed|bounced|complained|no receipt/i, 'successful outbox badge used stale legacy failure fields');
  await page.locator('#ct tr.row[data-id="1"]').click();
  assert.equal(await page.locator('#panel').getAttribute('inert'), null, 'open lead panel remained inert');
  assert.equal(await page.locator('#panel').getAttribute('aria-hidden'), null, 'open lead panel remained hidden from assistive technology');
  assert.match(await page.locator('#p-notification').innerText(), /Landon: delivered/i, 'lead panel hid Landon delivery state');
  assert.match(await page.locator('#p-notification').innerText(), /Backup: bounced/i, 'lead panel hid backup delivery state');
  assert.equal(await page.locator('#p-notification img').count(), 0, 'notification error created an element');
  assert.equal(await page.evaluate(() => globalThis.__dashboardStolen), undefined, 'tainted handler executed after cross-surface render');
  await page.locator('#panel-close').click();
  assert.equal(await page.locator('#panel').getAttribute('aria-hidden'), 'true', 'closed lead panel remained exposed to assistive technology');
  assert.equal(await page.locator('#panel').getAttribute('inert'), '', 'closed lead panel remained keyboard-accessible');

  for (const request of requests) {
    const url = new URL(request.url);
    assert.equal(url.searchParams.has('pin'), false, `PIN leaked in ${url}`);
    assert.equal(url.searchParams.has('key'), false, `routing key leaked in ${url}`);
    if (url.searchParams.get('action') !== 'login') {
      assert.equal(request.authorization, `Bearer ${sessionToken}`, `Bearer missing for ${url}`);
    }
  }
  console.log(`Dashboard session clients passed (${requests.length} requests across dashboard, legacy report, and CRM; stored-XSS fixture neutralized).`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
