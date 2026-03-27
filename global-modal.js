/* ═══════════════════════════════════════════════════════════════
   GLOBAL MODAL — Frame Restoration Utah
   Self-contained: injects CSS + HTML + event handlers
   Zero dependencies. Works on any static HTML page.
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  // ─── Inject CSS ───
  var css = document.createElement('style');
  css.textContent = [
    '.fr-modal-overlay{display:none;position:fixed;inset:0;z-index:10000;background:rgba(12,53,71,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .25s ease}',
    '.fr-modal-overlay.open{display:flex;opacity:1}',
    '.fr-modal{background:#fff;border-radius:6px;width:100%;max-width:440px;max-height:90vh;overflow-y:auto;border-top:4px solid #C9A44C;box-shadow:0 24px 64px rgba(0,0,0,0.35);position:relative;animation:frModalIn .3s ease}',
    '@keyframes frModalIn{from{transform:translateY(24px) scale(0.97);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}',
    '.fr-modal-close{position:absolute;top:12px;right:14px;background:none;border:none;font-size:28px;color:#4A5464;cursor:pointer;line-height:1;padding:4px 8px;z-index:1}',
    '.fr-modal-close:hover{color:#0C3547}',
    '.fr-modal-body{padding:32px 28px 24px}',
    '.fr-modal-body h2{font-family:"Archivo Black",sans-serif;font-size:20px;text-transform:uppercase;color:#0C3547;margin-bottom:6px;letter-spacing:.5px}',
    '.fr-modal-body>p{font-size:13px;color:#4A5464;margin-bottom:20px;line-height:1.5}',
    '.fr-modal-row{margin-bottom:14px}',
    '.fr-modal-row.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.fr-modal-body input,.fr-modal-body select{width:100%;padding:12px 14px;border-radius:3px;border:2px solid #E5E3DF;font-size:15px;font-family:"Archivo",sans-serif;color:#262626;background:#fff;transition:border-color .2s;-webkit-appearance:none;appearance:none}',
    '.fr-modal-body input:focus,.fr-modal-body select:focus{border-color:#0C3547;outline:none;box-shadow:0 0 0 3px rgba(12,53,71,0.1)}',
    '.fr-modal-body input::placeholder{color:#999}',
    '.fr-modal-submit{width:100%;margin-top:6px;cursor:pointer;min-height:48px;padding:14px 24px;background:#C9A44C;color:#0C3547;font-family:"Archivo Black",sans-serif;font-size:14px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;border:2px solid #C9A44C;border-radius:3px;box-shadow:0 4px 16px rgba(201,164,76,0.3);transition:all .2s}',
    '.fr-modal-submit:hover{background:#D4B46A;transform:translateY(-1px);box-shadow:0 6px 20px rgba(201,164,76,0.4)}',
    '.fr-modal-submit:disabled{opacity:.6;cursor:not-allowed;transform:none}',
    '.fr-modal-note{font-size:11px;color:#999;margin-top:10px;line-height:1.4;text-align:center}',
    '.fr-modal-error{color:#c0392b;font-size:12px;text-align:center;margin-top:8px}',
    '.fr-modal-success{text-align:center;padding:40px 20px}',
    '.fr-modal-success svg{width:48px;height:48px;margin:0 auto 16px;display:block}',
    '.fr-modal-success h2{font-family:"Archivo Black",sans-serif;color:#0C3547;font-size:22px;text-transform:uppercase;margin-bottom:8px}',
    '.fr-modal-success p{color:#4A5464;font-size:15px;line-height:1.6}',
    '.fr-modal-success a{display:inline-block;margin-top:16px;color:#0C3547;font-family:"Archivo Black",sans-serif;font-size:14px;text-transform:uppercase;letter-spacing:1px;text-decoration:none}',
    '@media(max-width:600px){.fr-modal{max-width:100%;max-height:100vh;border-radius:0;min-height:100vh;display:flex;flex-direction:column;justify-content:center}.fr-modal-body{padding:32px 20px}}'
  ].join('\n');
  document.head.appendChild(css);

  // ─── Inject Modal HTML ───
  var overlay = document.createElement('div');
  overlay.className = 'fr-modal-overlay';
  overlay.id = 'frModalOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Request a free roof inspection');
  overlay.innerHTML = [
    '<div class="fr-modal">',
    '  <button class="fr-modal-close" aria-label="Close">&times;</button>',
    '  <div class="fr-modal-body" id="frModalBody">',
    '    <h2>Get Your Free Roof Inspection</h2>',
    '    <p>No pressure, no obligation. We\'ll call within 15 minutes during business hours.</p>',
    '    <form id="frModalForm" data-endpoint="https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-lead">',
    '      <div class="fr-modal-row"><input type="text" name="name" placeholder="Full Name" required autocomplete="name"></div>',
    '      <div class="fr-modal-row"><input type="tel" name="phone" placeholder="Mobile Phone" required autocomplete="tel"></div>',
    '      <div class="fr-modal-row"><input type="email" name="email" placeholder="Email Address" required autocomplete="email"></div>',
    '      <div class="fr-modal-row two-col">',
    '        <input type="text" name="city" placeholder="City (e.g. Sandy)" required>',
    '        <input type="text" name="zip" placeholder="ZIP Code" autocomplete="postal-code" inputmode="numeric" pattern="[0-9]{5}" maxlength="5">',
    '      </div>',
    '      <div class="fr-modal-row">',
    '        <select name="issue" required>',
    '          <option value="">What\'s going on?</option>',
    '          <option value="hail">Hail / storm damage</option>',
    '          <option value="leak">Active roof leak</option>',
    '          <option value="old_roof">Old roof / replacement quote</option>',
    '          <option value="insurance">Insurance claim help</option>',
    '          <option value="other">Something else</option>',
    '        </select>',
    '      </div>',
    '      <button type="submit" class="fr-modal-submit">Get My Free Roof Inspection</button>',
    '      <p class="fr-modal-note">By submitting, you agree to a quick call or text. No spam.</p>',
    '    </form>',
    '  </div>',
    '</div>'
  ].join('\n');
  document.body.appendChild(overlay);

  // ─── Open / Close ───
  function openModal() {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(function() {
      var nameInput = overlay.querySelector('input[name="name"]');
      if (nameInput) nameInput.focus();
    }, 100);
    if (window.dataLayer) window.dataLayer.push({ event: 'modal_open', modal: 'free_inspection' });
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Close button
  overlay.querySelector('.fr-modal-close').addEventListener('click', closeModal);

  // Click outside modal
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeModal();
  });

  // Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  // ─── Auto-attach to ALL triggers ───
  // Works on: .nav-cta, .free-inspection-trigger, or any link with calendar.app.google
  function attachTriggers() {
    // 1. All elements with .free-inspection-trigger class
    document.querySelectorAll('.free-inspection-trigger').forEach(function(el) {
      el.addEventListener('click', function(e) { e.preventDefault(); openModal(); });
    });

    // 2. All .nav-cta links (nav "Free Inspection" buttons)
    document.querySelectorAll('.nav-cta').forEach(function(el) {
      el.addEventListener('click', function(e) { e.preventDefault(); openModal(); });
    });

    // 3. All calendar.app.google links (catch any remaining)
    document.querySelectorAll('a[href*="calendar.app.google"]').forEach(function(el) {
      el.addEventListener('click', function(e) { e.preventDefault(); openModal(); });
    });

    // 4. All links/buttons with href="#heroForm" — only on pages WITHOUT an inline #heroForm
    if (!document.getElementById('heroForm')) {
      document.querySelectorAll('a[href="#heroForm"]').forEach(function(el) {
        el.addEventListener('click', function(e) { e.preventDefault(); openModal(); });
      });
    }
  }
  attachTriggers();

  // ─── Form Submit ───
  var form = document.getElementById('frModalForm');
  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = form.querySelector('.fr-modal-submit');
      var body = document.getElementById('frModalBody');
      btn.disabled = true;
      btn.textContent = 'Sending...';

      // Remove any previous error
      var prevErr = form.querySelector('.fr-modal-error');
      if (prevErr) prevErr.remove();

      // Build JSON payload from form fields
      var payload = {};
      new FormData(form).forEach(function(v, k) { payload[k] = v; });
      payload.source_page = window.location.pathname;

      fetch(form.getAttribute('data-endpoint'), {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      }).then(function(res) {
        if (res.ok) {
          body.innerHTML = [
            '<div class="fr-modal-success">',
            '  <svg viewBox="0 0 24 24" fill="none" stroke="#C9A44C" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 12l2.5 2.5L16 9"/></svg>',
            '  <h2>Thanks!</h2>',
            '  <p>We\'ll call you within 15 minutes<br>during business hours.</p>',
            '  <a href="tel:+14353024422">Or call now: 435-302-4422</a>',
            '</div>'
          ].join('\n');
          if (window.dataLayer) window.dataLayer.push({ event: 'form_submit', form_name: 'modal_inspection' });
        } else {
          btn.disabled = false;
          btn.textContent = 'Get My Free Roof Inspection';
          var err = document.createElement('p');
          err.className = 'fr-modal-error';
          err.textContent = 'Something went wrong. Please try again or call 435-302-4422.';
          btn.insertAdjacentElement('afterend', err);
        }
      }).catch(function() {
        btn.disabled = false;
        btn.textContent = 'Get My Free Roof Inspection';
        var err = document.createElement('p');
        err.className = 'fr-modal-error';
        err.textContent = 'Network error. Please call 435-302-4422.';
        btn.insertAdjacentElement('afterend', err);
      });
    });
  }

})();
