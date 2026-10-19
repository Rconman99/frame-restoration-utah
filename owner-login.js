// Sign-in for the owner-only routes (/dashboard, /seo-report).
// Uses the same lead-crm PIN login and report_access allowlist as /leads, then
// hands the short-lived bearer token to POST /owner-session, which re-verifies
// it server-side and sets an HttpOnly cookie that middleware.js checks on every
// protected request. The PIN is never stored; only the token goes to
// sessionStorage (same key /leads and /dashboard already use).
(function () {
  'use strict';

  var ACCESS_API = 'https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/lead-crm';
  var ROUTING_KEY = 'frame-roofing-2026';
  var SESSION_STORAGE_KEY = 'frame.dashboard.session';
  var DESTINATION = '/dashboard';

  var form = document.getElementById('ownerLoginForm');
  var pinInput = document.getElementById('pinInput');
  var button = document.getElementById('ownerLoginBtn');
  var errorBox = document.getElementById('loginErr');

  function showError(message) {
    errorBox.textContent = message;
    button.disabled = false;
  }

  function exchange(token) {
    return fetch('/owner-session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function (r) {
      if (r.status === 204) return 'ok';
      if (r.status === 401 || r.status === 403) return 'denied';
      return 'unavailable';
    });
  }

  function enter() {
    window.location.replace(DESTINATION);
  }

  // Reuse a live session from /leads or /dashboard in this tab, if any.
  var existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) {
    button.disabled = true;
    exchange(existing).then(function (verdict) {
      if (verdict === 'ok') { enter(); return; }
      if (verdict === 'denied') sessionStorage.removeItem(SESSION_STORAGE_KEY);
      button.disabled = false;
    }).catch(function () { button.disabled = false; });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var p = pinInput.value.trim();
    if (!p) { showError('Please enter a PIN'); return; }
    errorBox.textContent = '';
    button.disabled = true;
    fetch(ACCESS_API + '?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routing_key: ROUTING_KEY, pin: p })
    }).then(function (r) {
      pinInput.value = '';
      if (r.status === 401 || r.status === 403) throw new Error('Invalid PIN. Try again.');
      if (r.status === 429) throw new Error('Too many attempts. Wait a few minutes and try again.');
      return r.json().then(function (d) {
        if (!r.ok || !d || !d.token) throw new Error('Sign-in failed. Try again.');
        return d.token;
      });
    }).then(function (token) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, token);
      return exchange(token);
    }).then(function (verdict) {
      if (verdict === 'ok') { enter(); return; }
      showError(verdict === 'denied'
        ? 'This account cannot open the dashboard.'
        : 'Sign-in is temporarily unavailable. Try again.');
    }).catch(function (error) {
      showError(error && error.message ? error.message : 'Connection error. Try again.');
    });
  });
})();
