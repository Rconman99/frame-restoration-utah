/* utah-owner-recovery-20260908a: load before third-party resources. */
(function () {
  'use strict';
  var api = 'https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/lead-crm';
  var token = '', mode = 'signin', generation = 0, ready = false;
  function consumeFragment() {
    if (location.hash.indexOf('#reset=') !== 0) return false;
    var value = location.hash.slice(7);
    history.replaceState(null, '', location.pathname + location.search);
    token = /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
    mode = 'complete'; generation++;
    sessionStorage.removeItem('frame.dashboard.session');
    return true;
  }
  consumeFragment();
  window.FrameOwnerRecovery = {
    active: function () { return mode !== 'signin'; },
    version: function () { return generation; }
  };
  function el(id) { return document.getElementById(id); }
  function show(next) {
    mode = next; generation++;
    if (!ready) return;
    el('signInSection').hidden = mode !== 'signin';
    el('requestResetSection').hidden = mode !== 'request';
    el('completeResetSection').hidden = mode !== 'complete';
    if (mode !== 'signin') {
      window.dispatchEvent(new Event('frame-owner-recovery-start'));
      sessionStorage.removeItem('frame.dashboard.session');
      el('reportWrap').style.display = 'none';
      el('loginOverlay').style.display = 'flex';
      el('loginOverlay').removeAttribute('aria-hidden');
      el('loginOverlay').inert = false;
      el('pinInput').value = '';
    }
    if (mode === 'complete') {
      el('completeResetForm').hidden = !token;
      el('completeResetStatus').textContent = token ? '' : 'This link is invalid or expired. Request a new link.';
      if (token) el('newPassword').focus();
    } else if (mode === 'request') el('recoveryName').focus();
    else el('pinInput').focus();
  }
  async function post(action, body) {
    var response = await fetch(api + '?action=' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    var data = {}; try { data = await response.json(); } catch (_) {}
    return { status: response.status, ok: response.ok, data: data };
  }
  function mount() {
    var form = el('loginForm'), box = form.parentElement, status = el('loginErr');
    var signin = document.createElement('section'); signin.id = 'signInSection';
    box.insertBefore(signin, form); signin.append(form, status);
    var forgot = document.createElement('button'); forgot.id = 'forgotPasswordButton'; forgot.type = 'button';
    forgot.className = 'recovery-link'; forgot.textContent = 'Forgot password?'; signin.append(forgot);
    var recovery = document.createElement('div'); recovery.className = 'owner-recovery';
    recovery.innerHTML = '<section id="requestResetSection" hidden><h2>Reset your password</h2><p>Enter the full name shown in your portal and your recovery email. We’ll email you a link to choose a new password.</p><form id="requestResetForm"><label for="recoveryName">Account name</label><input id="recoveryName" autocomplete="username" required maxlength="160"><label for="recoveryEmail">Recovery email</label><input id="recoveryEmail" type="email" autocomplete="email" required maxlength="254"><button id="requestResetButton" class="login-btn" type="submit">Email reset link</button></form><p id="requestResetStatus" role="status" aria-live="polite"></p><button type="button" class="recovery-link" data-signin>Back to sign in</button></section><section id="completeResetSection" hidden><h2>Choose a new password</h2><form id="completeResetForm"><p>Use at least 12 characters. Letters, numbers, symbols and spaces are supported.</p><label for="newPassword">New password</label><input id="newPassword" type="password" autocomplete="new-password" required><label for="confirmPassword">Confirm password</label><input id="confirmPassword" type="password" autocomplete="new-password" required><button id="completeResetButton" type="submit" class="login-btn">Save password</button></form><p id="completeResetStatus" role="status" aria-live="polite"></p><button type="button" class="recovery-link" id="newResetLink">Request a new link</button><button type="button" class="recovery-link" data-signin>Back to sign in</button></section>';
    box.append(recovery); ready = true;
    forgot.addEventListener('click', function () { token = ''; show('request'); });
    el('newResetLink').addEventListener('click', function () { token = ''; show('request'); });
    box.querySelectorAll('[data-signin]').forEach(function (button) { button.addEventListener('click', function () { token = ''; show('signin'); }); });
    el('requestResetForm').addEventListener('submit', async function (event) {
      event.preventDefault(); var version = generation, button = el('requestResetButton'); button.disabled = true;
      el('requestResetStatus').textContent = 'Sending…';
      try {
        var result = await post('request_password_reset', { name: el('recoveryName').value.trim(), email: el('recoveryEmail').value.trim() });
        if (generation !== version) return;
        el('requestResetStatus').textContent = result.status === 202 ? 'If the name and email match an active account, a reset link will arrive shortly. Check your spam folder too.' : 'Password recovery is temporarily unavailable. Please try again shortly.';
      } catch (_) { if (generation === version) el('requestResetStatus').textContent = 'Could not connect. Please try again.'; }
      finally { button.disabled = false; }
    });
    el('completeResetForm').addEventListener('submit', async function (event) {
      event.preventDefault(); var password = el('newPassword').value, status = el('completeResetStatus');
      if (!token) return;
      if (password !== el('confirmPassword').value) { status.textContent = 'The passwords don’t match.'; return; }
      if (Array.from(password).length < 12 || new TextEncoder().encode(password).length > 72 || !password.trim()) { status.textContent = 'Use at least 12 characters and no more than 72 UTF-8 bytes.'; return; }
      var version = generation, button = el('completeResetButton'); button.disabled = true; status.textContent = 'Saving…';
      try {
        var result = await post('reset_password', { token: token, password: password });
        if (generation !== version) return;
        if (result.ok) {
          token = ''; sessionStorage.removeItem('frame.dashboard.session'); el('completeResetForm').reset();
          show('signin'); el('loginErr').textContent = 'Password updated. Sign in with your new password.';
        } else if (result.data.error === 'invalid_or_expired_link') {
          token = ''; show('complete');
        } else status.textContent = result.data.message || 'Could not update your password. Please try again shortly.';
      } catch (_) { if (generation === version) status.textContent = 'Could not connect. Reopen your email link and try again.'; }
      finally { button.disabled = false; }
    });
    if (mode !== 'signin') show(mode);
  }
  window.addEventListener('hashchange', function () { if (consumeFragment()) show('complete'); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
