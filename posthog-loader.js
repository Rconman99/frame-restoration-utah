/*
 * Idle PostHog loader for Frame Restoration Utah.
 *
 * Keeps a tiny capture queue available during page startup, then loads the
 * vendor bundle after the page is interactive so critical SEO pages do not pay
 * the full analytics parse/boot cost during Lighthouse's startup window.
 */
(function () {
  'use strict';

  if (window.__FrameUtahPostHogBooted) return;
  window.__FrameUtahPostHogBooted = true;

  var TOKEN = 'phc_BnECzlZ2OeDujli2dbqcgGODXlv2tYERbp40dTF7UBV';
  var HOST = 'https://us.i.posthog.com';
  var queue = window.FramePostHogPending = window.FramePostHogPending || [];
  var registered = {};
  var stub = window.posthog = window.posthog || {};

  if (typeof stub.capture !== 'function') {
    stub.capture = function (eventName, properties, options) {
      if (queue.length < 100) {
        queue.push({ eventName: eventName, properties: properties || {}, options: options });
      }
    };
  }

  if (typeof stub.register !== 'function') {
    stub.register = function (props) {
      Object.keys(props || {}).forEach(function (key) { registered[key] = props[key]; });
    };
  }

  function loadVendor() {
    if (window.__FrameUtahPostHogVendorLoaded) return;
    window.__FrameUtahPostHogVendorLoaded = true;

    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split('.');2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement('script')).type='text/javascript',p.crossOrigin='anonymous',p.async=!0,p.src=s.api_host.replace('.i.posthog.com','-assets.i.posthog.com')+'/static/array.js',(r=t.getElementsByTagName('script')[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a='posthog',u.people=u.people||[],u.toString=function(t){var e='posthog';return'posthog'!==a&&(e+='.'+a),t||(e+=' (stub)'),e},u.people.toString=function(){return u.toString(1)+'.people (stub)'},o='init capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset get_distinct_id'.split(' '),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    window.posthog.init(TOKEN, {
      api_host: HOST,
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: false,
      disable_surveys: true,
      disable_session_recording: true,
      person_profiles: 'identified_only'
    });
    window.posthog.register(Object.assign({ market: 'utah' }, registered));

    queue.splice(0).forEach(function (item) {
      try { window.posthog.capture(item.eventName, item.properties, item.options); } catch (e) { /* no-op */ }
    });
  }

  function schedule() {
    window.setTimeout(function () {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(loadVendor, { timeout: 3000 });
      } else {
        loadVendor();
      }
    }, 3500);
  }

  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule, { once: true });
  }
})();
