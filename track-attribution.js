/*
 * track-attribution.js — Frame Roofing Utah
 *
 * Captures ad click IDs (gclid/fbclid/msclkid/gbraid/wbraid) + UTM params on
 * page load, persists across navigation, exposes payload on
 * window.FrameAttribution.get() for forms to merge in before submit.
 *
 * Behavior:
 *  - Click IDs: last-touch — if URL has one, overwrite existing. Persists 90
 *    days in localStorage to match Google Ads conversion window. Without this,
 *    offline-conversion-import API uploads can't happen.
 *  - UTM params: first-touch this session — tells the channel that originally
 *    brought the user (don't overwrite on internal navigation).
 *  - landing_page: first URL hit this session (with query string).
 *  - referrer: external document.referrer, captured once per session.
 *
 * Designed to be loaded as early as possible in <head> with defer so it runs
 * before any form submit. Self-contained — no dependencies.
 */
(function () {
  'use strict';

  var CLICK_IDS = ['gclid', 'fbclid', 'msclkid', 'gbraid', 'wbraid'];
  var UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  var CLICK_ID_TTL_DAYS = 90; // matches Google Ads conversion window
  var STORAGE_PREFIX = 'fru_attr_';

  function safeGet(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(storage, key, val) {
    try { storage.setItem(key, val); } catch (e) { /* quota exceeded or storage disabled — silently no-op */ }
  }
  function safeRemove(storage, key) {
    try { storage.removeItem(key); } catch (e) { /* no-op */ }
  }

  function parseURLParams() {
    var params = {};
    try {
      var qs = new URLSearchParams(window.location.search);
      qs.forEach(function (value, key) { params[key.toLowerCase()] = value; });
    } catch (e) { /* old browser — leave params empty */ }
    return params;
  }

  function capture() {
    var params = parseURLParams();
    var nowMs = Date.now();
    var ttlMs = CLICK_ID_TTL_DAYS * 24 * 60 * 60 * 1000;

    CLICK_IDS.forEach(function (k) {
      if (params[k]) {
        safeSet(localStorage, STORAGE_PREFIX + k, params[k]);
        safeSet(localStorage, STORAGE_PREFIX + k + '_ts', String(nowMs));
      } else {
        var ts = parseInt(safeGet(localStorage, STORAGE_PREFIX + k + '_ts') || '0', 10);
        if (ts && (nowMs - ts) > ttlMs) {
          safeRemove(localStorage, STORAGE_PREFIX + k);
          safeRemove(localStorage, STORAGE_PREFIX + k + '_ts');
        }
      }
    });

    UTMS.forEach(function (k) {
      if (params[k] && !safeGet(sessionStorage, STORAGE_PREFIX + k)) {
        safeSet(sessionStorage, STORAGE_PREFIX + k, params[k]);
      }
    });

    if (!safeGet(sessionStorage, STORAGE_PREFIX + 'landing_page')) {
      safeSet(sessionStorage, STORAGE_PREFIX + 'landing_page',
              window.location.pathname + window.location.search);
    }

    if (!safeGet(sessionStorage, STORAGE_PREFIX + 'referrer')) {
      var ref = document.referrer || '';
      if (ref) {
        try {
          if (new URL(ref).hostname !== window.location.hostname) {
            safeSet(sessionStorage, STORAGE_PREFIX + 'referrer', ref);
          }
        } catch (e) {
          safeSet(sessionStorage, STORAGE_PREFIX + 'referrer', ref);
        }
      }
    }
  }

  function get() {
    var out = {};
    CLICK_IDS.forEach(function (k) {
      var v = safeGet(localStorage, STORAGE_PREFIX + k);
      if (v) out[k] = v;
    });
    UTMS.forEach(function (k) {
      var v = safeGet(sessionStorage, STORAGE_PREFIX + k);
      if (v) out[k] = v;
    });
    var lp = safeGet(sessionStorage, STORAGE_PREFIX + 'landing_page');
    if (lp) out.landing_page = lp;
    var ref = safeGet(sessionStorage, STORAGE_PREFIX + 'referrer');
    if (ref) out.referrer = ref;
    return out;
  }

  capture();

  window.FrameAttribution = { get: get, _capture: capture };
})();
