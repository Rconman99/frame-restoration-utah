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
    // Root-level standalone service landing pages (e.g. /salt-lake-city).
    // Extend this list if more root city pages ship.
    if (path === '/salt-lake-city' || path === '/salt-lake-city.html') return 'salt lake city';
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

  function vitalRating(name, value) {
    if (name === 'CLS') return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs_improvement' : 'poor';
    if (name === 'INP') return value <= 200 ? 'good' : value <= 500 ? 'needs_improvement' : 'poor';
    if (name === 'LCP') return value <= 2500 ? 'good' : value <= 4000 ? 'needs_improvement' : 'poor';
    if (name === 'FCP') return value <= 1800 ? 'good' : value <= 3000 ? 'needs_improvement' : 'poor';
    if (name === 'TTFB') return value <= 800 ? 'good' : value <= 1800 ? 'needs_improvement' : 'poor';
    return 'unknown';
  }

  function sendWebVital(name, value, phase) {
    if (!isFinite(value)) return;
    var metricValue = name === 'CLS' ? Number(value.toFixed(4)) : Math.round(value);
    window.FrameWebVitalsLastSent = window.FrameWebVitalsLastSent || {};
    if (window.FrameWebVitalsLastSent[name] === metricValue) return;
    window.FrameWebVitalsLastSent[name] = metricValue;
    var payload = {
      market: 'utah',
      page: window.location.pathname,
      metric_name: name,
      metric_value: metricValue,
      metric_rating: vitalRating(name, value),
      metric_phase: phase,
      source: 'performance_observer'
    };
    try {
      if (window.posthog && typeof window.posthog.capture === 'function') {
        window.posthog.capture('web_vital', payload);
      }
    } catch (e) { /* no-op */ }
    try {
      if (typeof window.gtag === 'function') window.gtag('event', 'web_vital', payload);
    } catch (e) { /* no-op */ }
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'web_vital', metric_name: name, metric_value: metricValue, metric_rating: payload.metric_rating });
    } catch (e) { /* no-op */ }
  }

  function observeWebVitals() {
    if (window.FrameWebVitalsLoaded) return;
    window.FrameWebVitalsLoaded = true;

    function observe(type, cb) {
      try {
        if (!('PerformanceObserver' in window)) return;
        if (PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.indexOf(type) === -1) return;
        var observer = new PerformanceObserver(function (list) {
          list.getEntries().forEach(cb);
        });
        observer.observe({ type: type, buffered: true });
      } catch (e) { /* unsupported metric observer */ }
    }

    try {
      var nav = performance.getEntriesByType('navigation')[0];
      if (nav) sendWebVital('TTFB', nav.responseStart - nav.requestStart, 'initial');
    } catch (e) { /* no-op */ }

    observe('paint', function (entry) {
      if (entry.name === 'first-contentful-paint') sendWebVital('FCP', entry.startTime, 'initial');
    });

    var lcpEntry = null;
    observe('largest-contentful-paint', function (entry) { lcpEntry = entry; });

    var cls = 0;
    observe('layout-shift', function (entry) {
      if (!entry.hadRecentInput) cls += entry.value || 0;
    });

    var inp = 0;
    observe('event', function (entry) {
      if (entry.interactionId && entry.duration > inp) inp = entry.duration;
    });

    function flush(phase, includeZeroCls) {
      if (lcpEntry) sendWebVital('LCP', lcpEntry.startTime, phase);
      if (cls > 0 || includeZeroCls) sendWebVital('CLS', cls, phase);
      if (inp > 0) sendWebVital('INP', inp, phase);
    }

    window.setTimeout(function () { flush('timed_snapshot', true); }, 5000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush('visibility_hidden', true);
    });
    window.addEventListener('pagehide', function () { flush('pagehide', true); });
  }

  observeWebVitals();
})();
