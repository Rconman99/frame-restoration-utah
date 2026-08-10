/* ═══════════════════════════════════════════════════════════════
   GLOBAL MODAL — Frame Restoration Utah
   Self-contained: injects CSS + HTML + event handlers
   Zero dependencies. Works on any static HTML page.
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var booted = false;

  function createSubmissionKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.prototype.map.call(bytes, function(value) {
      return value.toString(16).padStart(2, '0');
    }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function isModalTrigger(target) {
    if (!target || !target.closest) return false;
    var trigger = target.closest(
      '.free-inspection-trigger,.nav-cta,a[href*="calendar.app.google"],a[href="#heroForm"]'
    );
    if (!trigger) return false;
    if (trigger.matches && trigger.matches('a[href="#heroForm"]') && document.getElementById('heroForm')) {
      return false;
    }
    return true;
  }

  function earlyTrigger(e) {
    if (!isModalTrigger(e.target)) return;
    e.preventDefault();
    boot(true);
  }

  function boot(openAfterBoot) {
    if (booted) {
      if (openAfterBoot && window.FrameRestorationModal) window.FrameRestorationModal.open();
      return;
    }
    booted = true;

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
    '@media(max-width:600px){.fr-modal{max-width:100%;max-height:100vh;border-radius:0;min-height:100vh;display:flex;flex-direction:column;justify-content:center}.fr-modal-body{padding:32px 20px}}',
    /* ─── Mobile dual sticky bar (Call | Free Inspection) ─── */
    '.sticky-call.sticky-dual{display:none}',
    '@media(max-width:900px){.sticky-call.sticky-dual{display:flex!important;align-items:stretch}.sticky-call.sticky-dual a{flex:1 1 50%;min-width:0;min-height:56px;display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 8px;font-family:"Archivo Black",sans-serif;font-size:14px;font-weight:700;letter-spacing:1px;text-decoration:none;text-transform:uppercase;white-space:nowrap}.sticky-call.sticky-dual .sticky-call-side{background:#0B4060;color:#E1B969}.sticky-call.sticky-dual .sticky-cta-side{background:#E1B969;color:#0B4060;border-left:2px solid #0B4060;cursor:pointer}.sticky-call.sticky-dual .sticky-cta-side:active{background:#d4a84f}}'
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
    '    <p>3 fields, 30 seconds. We\'ll call within 15 minutes during business hours.</p>',
    '    <form id="frModalForm" method="post" action="https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-lead" accept-charset="UTF-8" data-endpoint="https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-lead">',
    '      <div aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;"><label>Company website<input type="text" name="company_website" tabindex="-1" autocomplete="off"></label></div>',
    '      <div class="fr-modal-row"><input type="text" name="name" placeholder="Full Name" required autocomplete="name"></div>',
    '      <div class="fr-modal-row"><input type="tel" name="phone" placeholder="Mobile Phone" required autocomplete="tel"></div>',
    '      <div class="fr-modal-row"><input type="text" name="address" placeholder="Street Address (optional)" autocomplete="street-address"></div>',
    '      <div class="fr-modal-row"><input type="text" name="zip" placeholder="ZIP Code" required autocomplete="postal-code" inputmode="numeric" pattern="[0-9]{5}" maxlength="5"></div>',
    '      <details class="fr-modal-optional" style="margin:6px 0 4px;font-size:13px;color:#4A5464;">',
    '        <summary style="cursor:pointer;list-style:none;padding:6px 0;color:#0B4060;font-weight:600;">+ Add details (optional)</summary>',
    '        <div class="fr-modal-row" style="margin-top:8px"><input type="email" name="email" placeholder="Email Address (optional)" autocomplete="email"></div>',
    '        <div class="fr-modal-row"><input type="text" name="city" placeholder="City (optional)"></div>',
    '        <div class="fr-modal-row">',
    '          <select name="issue">',
    '            <option value="">What\'s going on? (optional)</option>',
    '            <option value="hail">Hail / storm damage</option>',
    '            <option value="leak">Active roof leak</option>',
    '            <option value="old_roof">Old roof / replacement quote</option>',
    '            <option value="insurance">Insurance claim help</option>',
    '            <option value="other">Something else</option>',
    '          </select>',
    '        </div>',
    '      </details>',
    '      <label class="fr-modal-consent" style="display:flex;align-items:flex-start;gap:10px;margin:14px 0 8px;font-size:13px;line-height:1.5;color:#2a2a2a;cursor:pointer;">',
    '        <input type="checkbox" name="sms_consent" value="yes" style="margin-top:3px;flex-shrink:0;" />',
    '        <span>(Optional) Yes, I agree to receive SMS/text messages from Frame Restoration LLC (DBA Frame Roofing Utah), sent from +1 435-292-8802, about my inquiry — including appointment confirmations, inspection scheduling, project updates, and service follow-ups. Msg frequency varies (up to 5/month). Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help. Consent is not required to submit this form.</span>',
    '      </label>',
    '      <button type="submit" class="fr-modal-submit">Get My Free Roof Inspection</button>',
    '      <p class="fr-modal-note">Frame Roofing Utah will contact you about your inquiry by phone and/or email. See our <a href="/privacy" style="color:inherit;text-decoration:underline">Privacy Policy</a> &amp; <a href="/terms" style="color:inherit;text-decoration:underline">Terms</a>.</p>',
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

  // ─── Upgrade mobile sticky bar: Call | Free Inspection ───
  function upgradeStickyBar() {
    var bar = document.querySelector('.sticky-call');
    if (!bar || bar.getAttribute('data-upgraded') === '1') return;
    // Canonical static dual Call+Text bar already in the markup — don't rebuild it.
    if (bar.querySelector('.sticky-call-actions')) { bar.setAttribute('data-upgraded', '1'); return; }
    var existingCall = bar.querySelector('a[href^="tel:"]');
    if (!existingCall) return;
    bar.setAttribute('data-upgraded', '1');
    bar.classList.add('sticky-dual');
    existingCall.classList.add('sticky-call-side');
    existingCall.innerHTML = '&#9742; Call';
    existingCall.setAttribute('aria-label', 'Call 435-292-8802');

    var cta = document.createElement('a');
    cta.href = '#';
    cta.className = 'sticky-cta-side free-inspection-trigger';
    cta.setAttribute('aria-label', 'Get free roof inspection');
    cta.innerHTML = 'Free Inspection &rsaquo;';
    cta.addEventListener('click', function(e) { e.preventDefault(); openModal(); });
    bar.appendChild(cta);
  }
  upgradeStickyBar();

  // ─── Mobile reading guard for the persistent contact bar ───
  // The header already keeps a tap-to-call control available. Hide the bottom
  // dock while the visitor scrolls down to read, restore it when they scroll up,
  // and reserve its exact rendered height so final content remains reachable.
  function installStickyBarBehavior() {
    var bar = document.querySelector('.sticky-call');
    if (!bar || !window.matchMedia) return;

    var mobile = window.matchMedia('(max-width: 900px)');
    var root = document.documentElement;
    var lastY = window.scrollY || window.pageYOffset || 0;
    var ticking = false;

    function setHidden(hidden) {
      var state = hidden ? 'hidden' : 'visible';
      if (bar.getAttribute('data-scroll-state') === state) return;
      bar.setAttribute('data-scroll-state', state);
      bar.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    }

    function syncReservedHeight() {
      if (!mobile.matches) {
        root.style.removeProperty('--mobile-contact-bar-height');
        setHidden(false);
        return;
      }
      var height = Math.ceil(bar.getBoundingClientRect().height);
      if (height > 0) {
        root.style.setProperty('--mobile-contact-bar-height', height + 'px');
      }
    }

    function updateForScroll() {
      var y = window.scrollY || window.pageYOffset || 0;
      var delta = y - lastY;
      if (!mobile.matches || y <= 120) {
        setHidden(false);
      } else if (delta > 10) {
        setHidden(true);
      } else if (delta < -10) {
        setHidden(false);
      }
      lastY = y;
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateForScroll);
    }

    syncReservedHeight();
    setHidden(false);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', syncReservedHeight, { passive: true });
    bar.addEventListener('focusin', function() { setHidden(false); });
    if (mobile.addEventListener) mobile.addEventListener('change', syncReservedHeight);
    if ('ResizeObserver' in window) {
      new ResizeObserver(syncReservedHeight).observe(bar);
    }
  }
  installStickyBarBehavior();

  // ─── Form Submit ───
  var form = document.getElementById('frModalForm');
  if (form) {
    form.dataset.submissionKey = form.dataset.submissionKey || createSubmissionKey();
    // form_start event — fires once per session on first field focus.
    // Mirrors the pattern on index.html heroForm + leadForm. Powers
    // form-abandonment recovery (Phase 1 Supabase fn matches form_start
    // events without a subsequent form_submit within 5 min).
    form.addEventListener('focusin', function() {
      if (form.dataset.formStarted === 'true') return;
      form.dataset.formStarted = 'true';
      if (window.posthog) {
        posthog.capture('form_start', { form: 'modal_inspection', page: window.location.pathname });
      }
    });
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
      payload.sms_consent = payload.sms_consent === 'yes';
      payload.source_page = window.location.pathname;
      payload.submission_key = form.dataset.submissionKey;

      // Merge ad attribution (gclid/fbclid/utm_*) from /track-attribution.js
      if (window.FrameAttribution) {
        var attr = window.FrameAttribution.get();
        for (var k in attr) {
          if (Object.prototype.hasOwnProperty.call(attr, k)) payload[k] = attr[k];
        }
      }

      fetch(form.getAttribute('data-endpoint'), {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      }).then(function(res) {
        if (res.ok) {
          if (window.dataLayer) window.dataLayer.push({ event: 'form_submit', form_name: 'modal_inspection' });
          window.location.href = '/thank-you?lead=success&form=modal';
          return;
        }
        btn.disabled = false;
        btn.textContent = 'Get My Free Roof Inspection';
        var err = document.createElement('p');
        err.className = 'fr-modal-error';
        err.textContent = 'Something went wrong. Please try again or call 435-292-8802.';
        btn.insertAdjacentElement('afterend', err);
      }).catch(function() {
        btn.disabled = false;
        btn.textContent = 'Get My Free Roof Inspection';
        var err = document.createElement('p');
        err.className = 'fr-modal-error';
        err.textContent = 'Network error. Please call 435-292-8802.';
        btn.insertAdjacentElement('afterend', err);
      });
    });
  }

  window.FrameRestorationModal = { open: openModal, close: closeModal };
  document.removeEventListener('click', earlyTrigger, true);
  if (openAfterBoot) openModal();
  }

  document.addEventListener('click', earlyTrigger, true);

  function scheduleBoot() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(function() { boot(false); }, { timeout: 3500 });
    } else {
      window.setTimeout(function() { boot(false); }, 1800);
    }
  }

  if (document.readyState === 'complete') {
    scheduleBoot();
  } else {
    window.addEventListener('load', scheduleBoot, { once: true });
  }

})();
