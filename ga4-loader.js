/*
 * GA4 (Google tag) loader for Frame Restoration Utah.
 * Measurement ID: G-1C86BMZS7T (property "framerestorationutah.com").
 * Standard gtag.js bootstrap, kept in an external file so the CSP stays
 * script-src 'self' + googletagmanager, and loaded with `defer` like the
 * PostHog loader so it never blocks first paint.
 */
(function () {
  'use strict';
  if (window.__FrameUtahGa4Booted) return;
  window.__FrameUtahGa4Booted = true;

  var MEASUREMENT_ID = 'G-1C86BMZS7T';

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
  }
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID);

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
  (document.head || document.documentElement).appendChild(s);
})();
