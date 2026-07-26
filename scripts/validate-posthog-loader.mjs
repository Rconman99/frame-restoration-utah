import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../posthog-loader.js', import.meta.url), 'utf8');
const scheduled = [];
const idleCallbacks = [];
const insertedScripts = [];
const listeners = {};
const beacons = [];
const storage = new Map();

const window = {
  addEventListener(type, callback) {
    listeners[type] = callback;
  },
  btoa(value) {
    return Buffer.from(value, 'binary').toString('base64');
  },
  crypto: {
    randomUUID() {
      return 'test-device-id';
    },
  },
  fetch() {
    throw new Error('sendBeacon should handle the tested pageview path');
  },
  localStorage: {
    getItem(key) {
      return storage.get(key) || null;
    },
    setItem(key, value) {
      storage.set(key, value);
    },
  },
  location: {
    host: 'www.framerestorationutah.com',
    href: 'https://www.framerestorationutah.com/pages/storm-damage',
    pathname: '/pages/storm-damage',
  },
  navigator: {
    sendBeacon(url, body) {
      beacons.push({ body, url });
      return true;
    },
  },
  requestIdleCallback(callback, options) {
    idleCallbacks.push({ callback, options });
  },
  setTimeout(callback, delay) {
    scheduled.push({ callback, delay });
  },
};

const document = {
  referrer: 'https://www.google.com/',
  readyState: 'complete',
  createElement() {
    return {};
  },
  getElementsByTagName() {
    return [{
      parentNode: {
        insertBefore(script) {
          insertedScripts.push(script);
        },
      },
    }];
  },
};

window.window = window;
vm.runInNewContext(source, { Blob, document, Math, Object, window });

assert.equal(Array.isArray(window.posthog), true, 'PostHog bootstrap must use an array-backed stub');
window.posthog.register({ landing_page: '/pages/storm-damage' });
window.posthog.capture('frame_click', { action: 'call' });
window.posthog.capture('$web_vitals', { metric: 'LCP', value: 2800 });

assert.equal(window.FramePostHogPending.length, 2, 'startup captures should remain queued');
assert.equal(scheduled.length, 2, 'pageview and vendor loads should each be scheduled once');
assert.equal(scheduled[0].delay, 3500, 'lightweight pageview delay changed unexpectedly');
assert.equal(scheduled[1].delay, 3500, 'vendor delay changed unexpectedly');

listeners.pagehide();
assert.equal(beacons.length, 1, 'short visits should emit an unload-safe pageview beacon');
assert.equal(beacons[0].url, 'https://us.i.posthog.com/e/?compression=base64');
assert.equal(beacons[0].body.type, 'application/x-www-form-urlencoded');
const encodedPageview = new URLSearchParams(await beacons[0].body.text()).get('data');
const pageview = JSON.parse(Buffer.from(encodedPageview, 'base64').toString('utf8'));
assert.equal(pageview.event, '$pageview');
assert.equal(pageview.properties.distinct_id, 'frame_test-device-id');

scheduled[0].callback();
assert.equal(beacons.length, 1, 'scheduled capture must not duplicate a short-session pageview');

scheduled[1].callback();
assert.equal(idleCallbacks.length, 1, 'vendor load should wait for an idle callback');
assert.equal(idleCallbacks[0].options.timeout, 3000, 'idle timeout changed unexpectedly');

idleCallbacks[0].callback();

assert.equal(insertedScripts.length, 1, 'vendor bundle should be inserted once');
assert.match(insertedScripts[0].src, /us-assets\.i\.posthog\.com\/static\/array\.js$/);
assert.equal(window.posthog._i.length, 1, 'PostHog init should be queued once');
assert.equal(window.posthog._i[0][1].capture_pageview, false, 'SDK must not duplicate the early pageview');

const vendorCalls = window.posthog.filter(Array.isArray);
assert.deepEqual(
  Array.from(vendorCalls, (call) => call[0]),
  ['register', 'capture', 'capture'],
  'registered properties, clicks, and web vitals should replay in order',
);
assert.equal(window.FramePostHogPending.length, 0, 'startup queue should drain after vendor bootstrap');

console.log('PostHog loader contract PASS (short-session pageview, delayed boot, queued event replay)');
