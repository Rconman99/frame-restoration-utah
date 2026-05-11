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
    '    <form id="frModalForm" data-endpoint="https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-lead">',
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
    var existingCall = bar.querySelector('a[href^="tel:"]');
    if (!existingCall) return;
    bar.setAttribute('data-upgraded', '1');
    bar.classList.add('sticky-dual');
    existingCall.classList.add('sticky-call-side');
    existingCall.innerHTML = '&#9742; Call';
    existingCall.setAttribute('aria-label', 'Call 435-302-4422');

    var cta = document.createElement('a');
    cta.href = '#';
    cta.className = 'sticky-cta-side free-inspection-trigger';
    cta.setAttribute('aria-label', 'Get free roof inspection');
    cta.innerHTML = 'Free Inspection &rsaquo;';
    cta.addEventListener('click', function(e) { e.preventDefault(); openModal(); });
    bar.appendChild(cta);
  }
  upgradeStickyBar();

  // ─── Form Submit ───
  var form = document.getElementById('frModalForm');
  if (form) {
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
        err.textContent = 'Something went wrong. Please try again or call 435-302-4422.';
        btn.insertAdjacentElement('afterend', err);
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

  // ─── Mobile exit-intent slide-up ───
  // Fires once per session when a phone user scrolls past 40% depth then
  // reverses direction (signal: "I've seen enough, leaving"). Desktop has
  // mouseleave-top; mobile gets scroll-velocity-reversal as the analog.
  //
  // Hard rules:
  //   - mobile-only (≤820px)
  //   - one shot per session (sessionStorage)
  //   - never fires if the booking modal is already open
  //   - never fires if user already submitted a lead this session
  //   - suppressed on /thank-you, /privacy, /terms, /review
  //   - PostHog events: exit_intent_show / _call / _form / _dismiss
  function installExitIntent() {
    var SESSION_KEY = 'fr_exit_intent_shown';
    var SUBMIT_KEY  = 'fr_lead_submitted';
    var path = window.location.pathname.toLowerCase();
    var suppressPaths = ['/thank-you', '/privacy', '/terms', '/review'];
    for (var i = 0; i < suppressPaths.length; i++) {
      if (path.indexOf(suppressPaths[i]) === 0) return;
    }
    if (sessionStorage.getItem(SESSION_KEY) === '1') return;
    if (sessionStorage.getItem(SUBMIT_KEY) === '1') return;

    var styleId = 'fr-exit-intent-style';
    if (!document.getElementById(styleId)) {
      var style = document.createElement('style');
      style.id = styleId;
      style.textContent = [
        '.fr-exit-intent{position:fixed;left:0;right:0;bottom:0;z-index:9998;',
        'background:#0B4060;color:#FAF9F5;padding:18px 16px 20px;',
        'box-shadow:0 -8px 32px rgba(0,0,0,0.35);transform:translateY(110%);',
        'transition:transform .35s cubic-bezier(.2,.8,.2,1);',
        'border-top:3px solid #E1B969;font-family:"Archivo",sans-serif}',
        '.fr-exit-intent.open{transform:translateY(0)}',
        // Lift above the dual sticky-call bar so neither overlaps.
        'body.fr-has-sticky-call .fr-exit-intent{bottom:56px}',
        '.fr-exit-intent-close{position:absolute;top:8px;right:10px;',
        'background:none;border:none;color:rgba(250,249,245,0.7);font-size:24px;',
        'line-height:1;padding:4px 8px;cursor:pointer;min-height:36px;min-width:36px}',
        '.fr-exit-intent-close:hover{color:#E1B969}',
        '.fr-exit-intent h3{font-family:"Archivo Black",sans-serif;font-size:16px;',
        'text-transform:uppercase;margin:0 0 4px;color:#E1B969;letter-spacing:0.5px}',
        '.fr-exit-intent p{font-size:14px;line-height:1.5;margin:0 0 12px;',
        'color:rgba(250,249,245,0.92);max-width:420px}',
        '.fr-exit-intent-cta-row{display:flex;gap:10px}',
        '.fr-exit-intent-cta-row a,.fr-exit-intent-cta-row button{flex:1 1 50%;',
        'min-height:48px;display:flex;align-items:center;justify-content:center;',
        'gap:6px;padding:12px 10px;font-family:"Archivo Black",sans-serif;',
        'font-size:14px;font-weight:700;letter-spacing:1px;text-decoration:none;',
        'text-transform:uppercase;border-radius:4px;cursor:pointer;border:none}',
        '.fr-exit-intent-call{background:#E1B969;color:#0B4060}',
        '.fr-exit-intent-call:active{background:#d4a84f}',
        '.fr-exit-intent-form{background:transparent;color:#FAF9F5;',
        'border:2px solid rgba(250,249,245,0.85)!important}',
        '.fr-exit-intent-form:active{background:rgba(250,249,245,0.1)}',
        '@media(min-width:821px){.fr-exit-intent{display:none!important}}'
      ].join('');
      document.head.appendChild(style);
    }

    if (document.querySelector('.sticky-call')) {
      document.body.classList.add('fr-has-sticky-call');
    }

    var banner = document.createElement('div');
    banner.className = 'fr-exit-intent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Free roof inspection offer');
    banner.setAttribute('aria-hidden', 'true');
    banner.innerHTML = [
      '<button class="fr-exit-intent-close" aria-label="Dismiss">&times;</button>',
      '<h3>Before you go &mdash; free inspection</h3>',
      '<p>Wasatch Front roof? Frame Roofing Utah will inspect it free &mdash; no pressure, 15-minute callback during business hours.</p>',
      '<div class="fr-exit-intent-cta-row">',
      '<a class="fr-exit-intent-call" href="tel:+14353024422" aria-label="Call 435-302-4422">&#9742; Call now</a>',
      '<button class="fr-exit-intent-form" type="button" aria-label="Open free inspection form">Free inspection</button>',
      '</div>'
    ].join('');
    document.body.appendChild(banner);

    function capture(event) {
      if (window.posthog) {
        posthog.capture(event, { path: path });
      }
      if (window.dataLayer) {
        window.dataLayer.push({ event: event, path: path });
      }
    }

    function show() {
      if (sessionStorage.getItem(SESSION_KEY) === '1') return;
      if (overlay && overlay.classList.contains('open')) return;
      sessionStorage.setItem(SESSION_KEY, '1');
      banner.classList.add('open');
      banner.setAttribute('aria-hidden', 'false');
      capture('exit_intent_show');
    }

    function hide(reason) {
      banner.classList.remove('open');
      banner.setAttribute('aria-hidden', 'true');
      if (reason) capture(reason);
    }

    banner.querySelector('.fr-exit-intent-close').addEventListener('click', function() {
      hide('exit_intent_dismiss');
    });
    banner.querySelector('.fr-exit-intent-call').addEventListener('click', function() {
      capture('exit_intent_call');
    });
    banner.querySelector('.fr-exit-intent-form').addEventListener('click', function() {
      capture('exit_intent_form');
      hide();
      openModal();
    });

    // ─── Scroll-velocity-reversal trigger ───
    // Wait until user has reached ≥40% scroll depth, THEN watch for an
    // upward scroll of ≥80px within a 600ms window. That combination is
    // the mobile analog of mouseleave-top: "I read something, now leaving."
    var DEPTH_THRESHOLD = 0.4;
    var REVERSAL_PIXELS = 80;
    var WINDOW_MS = 600;

    var reachedDepth = false;
    var lastY = window.scrollY || window.pageYOffset || 0;
    var lastT = Date.now();
    var deltaUp = 0;
    var windowStart = lastT;

    function onScroll() {
      var y = window.scrollY || window.pageYOffset || 0;
      var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll < 600) return; // pages too short to bother
      var depth = y / maxScroll;

      if (!reachedDepth && depth >= DEPTH_THRESHOLD) {
        reachedDepth = true;
      }

      var dy = y - lastY;
      var now = Date.now();
      if (now - windowStart > WINDOW_MS) {
        deltaUp = 0;
        windowStart = now;
      }
      if (dy < 0) deltaUp += -dy;

      if (reachedDepth && deltaUp >= REVERSAL_PIXELS) {
        show();
        window.removeEventListener('scroll', onScroll);
      }

      lastY = y;
      lastT = now;
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // Also fire on pagehide / visibilitychange-to-hidden as a backstop.
    // Without this, users who only tap-and-leave never see it.
    function onLeave() {
      if (reachedDepth) show();
    }
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') onLeave();
    });
    window.addEventListener('pagehide', onLeave);

    // Mark lead submitted so we never re-show after a successful form.
    document.addEventListener('submit', function(e) {
      var f = e.target;
      if (f && f.tagName === 'FORM') {
        sessionStorage.setItem(SUBMIT_KEY, '1');
        hide();
      }
    }, true);
  }

  // Only install on phone-sized viewports. Desktop already has nav CTA + side
  // sticky; an exit-intent layer there is noise.
  if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) {
    installExitIntent();
  }

})();
