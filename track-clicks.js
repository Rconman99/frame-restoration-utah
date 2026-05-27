/*
 * track-clicks.js — Frame Roofing Utah  (v2 2026-05-27)
 *
 * Auto-instruments every tel: and sms: link on the page. On click:
 *   1. PostHog event ('phone_click' or 'sms_click')
 *   2. Beacon POST to /track-click edge fn (persisted to phone_clicks table)
 *   3. Google Ads gtag conversion (if FrameAds config present)
 *   4. dataLayer.push for GTM (if any)
 *
 * Depends on track-attribution.js being loaded first (it captures gclid/utm
 * and exposes window.FrameAttribution.get()). Falls back gracefully if not.
 *
 * Load this AFTER track-attribution.js with `defer`. Self-contained.
 *
 * Optional Google Ads conversion: set window.FrameAds = {
 *   send_to: 'AW-1234567890/AbCdEfGhIjKlMnO',  // conversion ID/label
 *   value:   25                                  // optional default value
 * } in a <script> before this file, and conversions will fire.
 *
 * v2 fix (2026-05-27): previous version sent the beacon as a
 * `application/json` Blob, which forces a CORS preflight that races the
 * dialer hand-off. sendBeacon returned `true` but the browser dropped the
 * payload, so phone_clicks stayed at 0 rows while PostHog captured the
 * events normally. Switched to a `text/plain` Blob (a CORS "simple"
 * request — no preflight) and made fetch+keepalive the primary path with
 * sendBeacon as the fallback. The edge function reads the body with
 * `req.json()` which ignores the declared Content-Type.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/track-click';

  function getAttribution() {
    try {
      if (window.FrameAttribution && typeof window.FrameAttribution.get === 'function') {
        return window.FrameAttribution.get() || {};
      }
    } catch (e) { /* fall through */ }
    return {};
  }

  function getCityFromPath() {
    var path = (window.location.pathname || '').toLowerCase();
    var m = path.match(/\/locations\/([a-z-]+)\.html/);
    if (m) return m[1].replace(/-/g, ' ');
    m = path.match(/\/blog\/([a-z-]+)\//);
    if (m && m[1] !== 'utah') return m[1].replace(/-/g, ' ');
    return null;
  }

  function digits(s) { return String(s || '').replace(/[^\d+]/g, ''); }

  function buildPayload(link, clickType) {
    var attr = getAttribution();
    var phone = digits(link.getAttribute('href') || '').replace(/^tel:|^sms:/i, '');
    return {
      click_type: clickType,
      phone: phone,
      source_page: window.location.href.slice(0, 500),
      page_title: (document.title || '').slice(0, 300),
      referrer: attr.referrer || document.referrer || '',
      gclid: attr.gclid || null,
      gbraid: attr.gbraid || null,
      wbraid: attr.wbraid || null,
      fbclid: attr.fbclid || null,
      msclkid: attr.msclkid || null,
      utm_source: attr.utm_source || null,
      utm_medium: attr.utm_medium || null,
      utm_campaign: attr.utm_campaign || null,
      utm_term: attr.utm_term || null,
      utm_content: attr.utm_content || null,
      city: getCityFromPath()
    };
  }

  function sendBeacon(payload) {
    // v2: keep this a CORS "simple" request (no preflight).
    // - Body MUST be a string OR a Blob with type one of:
    //     application/x-www-form-urlencoded, multipart/form-data, text/plain
    // - No custom request headers. Content-Type must be text/plain.
    // The edge function uses req.json() which parses regardless of the
    // declared Content-Type — we keep the body as JSON so the server side
    // is unchanged.
    var json;
    try { json = JSON.stringify(payload); } catch (e) { return; }

    // Primary: fetch + keepalive. Survives in-tab navigation (tel: handoff
    // on most desktops + iOS). Works cross-origin without a preflight as
    // long as we don't set non-simple headers.
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        body: json,                       // raw string body (simple request)
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        keepalive: true,
        mode: 'cors',
        credentials: 'omit'
      }).catch(function () { /* fire and forget */ });
    } catch (e) { /* fall through to sendBeacon */ }

    // Fallback: sendBeacon. Older Safari sometimes kills keepalive fetch
    // on full page unload; sendBeacon is designed for that case. Use
    // text/plain Blob so the browser does NOT preflight (the v1 bug).
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([json], { type: 'text/plain;charset=UTF-8' });
        navigator.sendBeacon(ENDPOINT, blob);
      }
    } catch (e) { /* no-op */ }
  }

  function fireGtag(payload) {
    try {
      if (typeof window.gtag !== 'function') return;
      // Generic event for Analytics
      window.gtag('event', payload.click_type === 'sms' ? 'sms_click' : 'phone_click', {
        event_category: 'engagement',
        event_label: payload.phone,
        source_page: payload.source_page,
        source: payload.utm_source || 'organic',
        city: payload.city || 'unknown'
      });
      // Google Ads conversion (only if configured)
      if (window.FrameAds && window.FrameAds.send_to) {
        window.gtag('event', 'conversion', {
          send_to: window.FrameAds.send_to,
          value: window.FrameAds.value || 0,
          currency: 'USD'
        });
      }
    } catch (e) { /* no-op */ }
  }

  function firePostHog(payload) {
    try {
      if (window.posthog && typeof window.posthog.capture === 'function') {
        var evt = payload.click_type === 'sms' ? 'sms_click' : 'phone_click';
        window.posthog.capture(evt, payload);
      }
    } catch (e) { /* no-op */ }
  }

  function fireDataLayer(payload) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: payload.click_type === 'sms' ? 'sms_click' : 'phone_click',
        phone_number: payload.phone,
        source_page: payload.source_page,
        utm_source: payload.utm_source,
        gclid: payload.gclid
      });
    } catch (e) { /* no-op */ }
  }

  function handleClick(e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"], a[href^="sms:"]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var clickType = href.toLowerCase().indexOf('sms:') === 0 ? 'sms' : 'call';
    var payload = buildPayload(a, clickType);
    firePostHog(payload);
    fireGtag(payload);
    fireDataLayer(payload);
    sendBeacon(payload);
    // Don't preventDefault — the native tel:/sms: handoff continues
  }

  // Use capture phase so we fire BEFORE the browser hands off to the dialer.
  // On mobile, the page may be backgrounded immediately after the click, so
  // sendBeacon (above) is the safest delivery mechanism.
  if (document.addEventListener) {
    document.addEventListener('click', handleClick, true);
    document.addEventListener('auxclick', handleClick, true);
    // touchstart catches some mobile dialers that fire dial before click
    document.addEventListener('touchstart', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href^="tel:"], a[href^="sms:"]');
      if (a) handleClick(e);
    }, { passive: true, capture: true });
  }

  // Expose for manual testing from console
  window.FrameClicks = { _send: sendBeacon, _build: buildPayload };
})();
