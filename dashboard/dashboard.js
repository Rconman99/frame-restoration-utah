/* deploy-stamp: v0.11.2 frame-roofing-utah — psi+dataSources wired */
/**
 * RCBuild-Kit Client Dashboard — base script
 *
 * Vendored from Frame Roofing Utah's seo-report.html (2026-04-27).
 * Reads window.DASHBOARD_CONFIG (set inline in index.html via build-time substitution).
 *
 * Config shape:
 *   {
 *     clientName: string,
 *     tagline: string,
 *     supabaseUrl: string,
 *     campaignKey: string,
 *     defaultDays: number,
 *     ranges: number[],          // e.g. [7, 14, 30, 90]
 *     footerLinks: { label: string, url: string }[],
 *     builderAttribution: string
 *   }
 *
 * Edge function endpoint: {supabaseUrl}/functions/v1/weekly-report
 *   GET ?days=<days>, Authorization: Bearer <short-lived session>
 *   Returns: { user, summary, gap_summary, top_pages, location_performance, location_gaps, leads, calls, traffic_breakdown, traffic_sources, generated_at }
 *
 * Access administration: {supabaseUrl}/functions/v1/lead-crm
 *   Admin-only actions; report_access is never queried from the browser.
 */

(function () {
  'use strict';

  var CFG = window.DASHBOARD_CONFIG || {};
  var API = CFG.supabaseUrl;
  var FAPI = API + '/functions/v1/weekly-report';
  var ACCESS_API = API + '/functions/v1/lead-crm';
  var ROUTING_KEY = CFG.campaignKey;
  var SESSION_STORAGE_KEY = 'frame.dashboard.session';
  var escapeHtml = typeof window.__dashboardEscapeHtml === 'function'
    ? window.__dashboardEscapeHtml
    : function () { return ''; };

  var curD = CFG.defaultDays || 30;
  var pC = null, bC = null;
  var SESSION_TOKEN = '';
  var CUR_USER = null;

  // ─── Auth ────────────────────────────────────────────────────────────

  function doLogin(e) {
    e.preventDefault();
    var p = document.getElementById('pinInput').value.trim();
    if (!p) { document.getElementById('loginErr').textContent = 'Please enter a PIN'; return false; }
    document.getElementById('loginErr').textContent = '';
    fetch(ACCESS_API + '?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routing_key: ROUTING_KEY, pin: p })
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) {
        document.getElementById('loginErr').textContent = 'Invalid PIN. Try again.';
        return;
      }
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.message || d.error || 'Login failed');
        return d;
      });
    }).then(function (d) {
      if (!d || d.error || !d.token) return;
      SESSION_TOKEN = d.token;
      CUR_USER = d.user;
      sessionStorage.setItem(SESSION_STORAGE_KEY, SESSION_TOKEN);
      document.getElementById('pinInput').value = '';
      showReport();
      go(curD);
    }).catch(function (error) {
      document.getElementById('loginErr').textContent = error.message || 'Connection error. Try again.';
    });
    return false;
  }

  function showReport() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('reportWrap').style.display = 'block';
    if (CUR_USER) {
      document.getElementById('userName').textContent = CUR_USER.name;
      document.getElementById('userRole').textContent = CUR_USER.role;
      if (CUR_USER.role === 'admin') document.getElementById('manageBtn').style.display = 'inline-block';
      var crmBtn = document.getElementById('crmBtn');
      if (crmBtn && (CUR_USER.role === 'sales' || CUR_USER.role === 'admin')) crmBtn.style.display = 'inline-block';
    }
  }

  function doLogout() {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    SESSION_TOKEN = ''; CUR_USER = null;
    document.getElementById('reportWrap').style.display = 'none';
    document.getElementById('manageBtn').style.display = 'none';
    var crmBtn = document.getElementById('crmBtn');
    if (crmBtn) crmBtn.style.display = 'none';
    document.getElementById('adminModal').classList.remove('show');
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('pinInput').value = '';
    document.getElementById('loginErr').textContent = '';
    document.getElementById('pinInput').focus();
  }

  // Auto-login retains only the short-lived signed token, never a PIN/key.
  (function () {
    var s = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (s) {
      SESSION_TOKEN = s;
      fetch(ACCESS_API + '?action=session', {
        headers: { 'Authorization': 'Bearer ' + SESSION_TOKEN }
      }).then(function (r) {
        if (r.status === 401 || r.status === 403) { doLogout(); return; }
        return r.json();
      }).then(function (d) {
        if (!d || d.error) { doLogout(); return; }
        CUR_USER = d.user;
        showReport();
        go(curD);
      }).catch(function () { doLogout(); });
    }
  })();

  // ─── Time-range switching ────────────────────────────────────────────

  function sw(d, btn) {
    curD = d;
    document.querySelectorAll('.pb').forEach(function (b) { b.classList.remove('act'); });
    btn.classList.add('act');
    document.getElementById('rPeriod').textContent = 'Last ' + d + ' Days';
    go(d);
  }

  async function go(days) {
    var el = document.getElementById('ct');
    el.innerHTML = '<div class="ld"><span class="sp"></span> Loading live data...</div>';
    try {
      // Fetch current period + 2x period in parallel; derive prior by subtraction.
      var [currentR, doubleR] = await Promise.all([
        fetch(FAPI + '?days=' + days, { headers: { 'Authorization': 'Bearer ' + SESSION_TOKEN } }),
        fetch(FAPI + '?days=' + (days * 2), { headers: { 'Authorization': 'Bearer ' + SESSION_TOKEN } }),
      ]);
      if (currentR.status === 401 || currentR.status === 403) { doLogout(); return; }
      var D = await currentR.json();
      if (D.error) throw new Error(D.error);
      var D2 = doubleR.ok ? await doubleR.json() : null;
      if (D.user) CUR_USER = D.user;
      document.getElementById('rDate').textContent = new Date(D.generated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      var growth = computeGrowth(D, D2, days);
      render(D, growth);
    } catch (e) {
      el.innerHTML = '<div class="ld" style="color:var(--red)">Error: ' + escapeHtml(e.message) + '</div>';
    }
  }

  // Compute per-metric and per-page growth vs prior period of same length.
  // Prior-period totals derived by subtraction: current_2N - current_N = prior_N.
  // Returns: { totals: {pageviews_pct, leads_pct, calls_pct}, pages: { path: pct } }
  function computeGrowth(current, double, days) {
    if (!current || !double) return null;
    var cs = current.summary || {};
    var ds = double.summary || {};
    function pct(now, prior) {
      if (prior == null || prior === 0) return now > 0 ? null : 0; // null = "NEW"
      return Math.round(((now - prior) / prior) * 100);
    }
    var growth = {
      days: days,
      totals: {
        pageviews: pct(cs.total_pageviews || 0, (ds.total_pageviews || 0) - (cs.total_pageviews || 0)),
        leads:     pct(cs.total_leads || 0,     (ds.total_leads || 0) - (cs.total_leads || 0)),
        calls:     pct(cs.total_calls || 0,     (ds.total_calls || 0) - (cs.total_calls || 0)),
        organic:   pct(cs.google_organic || 0,  (ds.google_organic || 0) - (cs.google_organic || 0)),
      },
      pages: {},
    };
    // Per-page growth — index double.top_pages by path, derive prior per page.
    var doubleByPath = {};
    (double.top_pages || []).forEach(function (p) { doubleByPath[p.path] = p.views || 0; });
    (current.top_pages || []).forEach(function (p) {
      var doubleViews = doubleByPath[p.path] || 0;
      var priorViews  = doubleViews - (p.views || 0);
      growth.pages[p.path] = pct(p.views || 0, priorViews);
    });
    return growth;
  }

  // Format a growth percentage as a colored span. null = NEW (no prior data).
  function fmtGrowth(g) {
    if (g === undefined || g === null) {
      return g === null ? '<span style="color:var(--blue)">NEW</span>' : '<span style="color:var(--muted)">—</span>';
    }
    if (g === 0) return '<span style="color:var(--muted)">0%</span>';
    var color = g > 0 ? 'var(--green)' : 'var(--red)';
    var sign = g > 0 ? '+' : '';
    return '<span style="color:' + color + ';font-weight:600">' + sign + g + '%</span>';
  }

  // ─── Admin panel ─────────────────────────────────────────────────────

  async function openAdmin() {
    if (!CUR_USER || CUR_USER.role !== 'admin') return;
    document.getElementById('adminModal').classList.add('show');
    await loadUsers();
  }
  function closeAdmin() { document.getElementById('adminModal').classList.remove('show'); }

  function setAdminMessage(message, isError) {
    var el = document.getElementById('adminMsg');
    el.textContent = message || '';
    el.style.color = isError ? 'var(--red)' : 'var(--green)';
  }

  async function accessRequest(action, options) {
    var url = ACCESS_API + '?action=' + encodeURIComponent(action);
    var request = options || {};
    request.headers = Object.assign({}, request.headers || {}, {
      'Authorization': 'Bearer ' + SESSION_TOKEN
    });
    var r = await fetch(url, request);
    var body = null;
    try { body = await r.json(); } catch (_) { body = {}; }
    if (r.status === 401) {
      doLogout();
      throw new Error('Your session expired. Sign in again.');
    }
    if (!r.ok) throw new Error(body.message || body.error || ('Request failed (' + r.status + ')'));
    return body;
  }

  function appendTextCell(row, value, className) {
    var cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = value == null ? '' : String(value);
    row.appendChild(cell);
    return cell;
  }

  async function loadUsers() {
    var tb = document.getElementById('accessBody');
    tb.replaceChildren();
    setAdminMessage('Loading access list…', false);
    try {
      var result = await accessRequest('access_list');
      (result.access || []).forEach(function (u) {
        var tr = document.createElement('tr');
        appendTextCell(tr, u.name);
        appendTextCell(tr, u.role || 'invalid');

        var statusCell = document.createElement('td');
        var status = document.createElement('span');
        status.className = u.active ? 'status-on' : 'status-off';
        status.textContent = u.active ? 'Active' : 'Disabled';
        statusCell.appendChild(status);
        tr.appendChild(statusCell);

        var lastAccessed = u.last_accessed
          ? new Date(u.last_accessed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'Never';
        appendTextCell(tr, lastAccessed);

        var credentialCell = document.createElement('td');
        var reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'toggle-btn off';
        reset.textContent = 'Reset PIN';
        reset.addEventListener('click', function () { resetUserPin(u.id, u.name); });
        credentialCell.appendChild(reset);
        tr.appendChild(credentialCell);

        var actionCell = document.createElement('td');
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'toggle-btn ' + (u.active ? 'on' : 'off');
        toggle.textContent = u.active ? 'Disable' : 'Enable';
        toggle.addEventListener('click', function () { toggleUser(u.id, !u.active); });
        actionCell.appendChild(toggle);
        tr.appendChild(actionCell);
        tb.appendChild(tr);
      });
      setAdminMessage('PINs are write-only and are never displayed.', false);
    } catch (e) {
      setAdminMessage(e.message || 'Could not load access list.', true);
    }
  }

  async function toggleUser(id, active) {
    try {
      await accessRequest('access_toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, active: active })
      });
      await loadUsers();
    } catch (e) {
      setAdminMessage(e.message || 'Could not update access.', true);
    }
  }

  async function resetUserPin(id, name) {
    var pin = window.prompt('Enter a new 6-12 digit PIN for ' + String(name || 'this user') + ':');
    if (pin === null) return;
    if (!/^\d{6,12}$/.test(pin)) {
      setAdminMessage('PIN must contain 6-12 digits.', true);
      return;
    }
    try {
      var result = await accessRequest('access_reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, pin: pin })
      });
      if (result.session_revoked) {
        doLogout();
        return;
      }
      setAdminMessage('PIN reset. The credential was not displayed or returned.', false);
    } catch (e) {
      setAdminMessage(e.message || 'Could not reset PIN.', true);
    }
  }

  async function addUser() {
    var n = document.getElementById('newName').value.trim();
    var p = document.getElementById('newPin').value.trim();
    var role = document.getElementById('newRole').value;
    if (!n || !/^\d{6,12}$/.test(p)) {
      setAdminMessage('Name and a 6-12 digit PIN are required.', true);
      return;
    }
    try {
      await accessRequest('access_create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, pin: p, role: role })
      });
      document.getElementById('newName').value = '';
      document.getElementById('newPin').value = '';
      setAdminMessage(n + ' added. The PIN is write-only.', false);
      await loadUsers();
    } catch (e) {
      setAdminMessage(e.message || 'Error adding user.', true);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────

  function ins(t, tx, a) {
    return '<div class="ib"><h3>' + escapeHtml(t) + '</h3><p>' + escapeHtml(tx) + '</p><p class="a">&rarr; ' + escapeHtml(a) + '</p></div>';
  }

  function render(D, growth) {
    var S = D.summary || {};
    var G = D.gap_summary || { locations_with_traffic: 0, total_locations: 0, coverage_pct: 0, locations_no_traffic: 0 };
    var gT = (growth && growth.totals) || {};
    var growthLabel = growth ? ' <small style="font-size:.65em;font-weight:400;color:var(--muted)">vs prior ' + growth.days + 'd</small>' : '';

    // Storm Watch placeholder — populated async after NWS API fetch
    var h = '<div id="stormWatch" class="sec"></div>';

    h += '<div class="kg">';
    [
      { v: S.total_pageviews || 0, l: 'Pageviews', c: '', growth: gT.pageviews },
      { v: S.google_organic || 0, l: 'Google Organic', c: 'g', growth: gT.organic },
      { v: S.total_leads || 0, l: 'Form Leads', c: 'b', growth: gT.leads },
      { v: S.total_calls || 0, l: 'Inbound Calls', c: 'b', growth: gT.calls },
      { v: (S.total_call_minutes || 0) + 'm', l: 'Call Minutes', c: 'p' },
      { v: (S.conversion_rate_pct || 0) + '%', l: 'Conversion Rate', c: '' },
      { v: (G.locations_with_traffic || 0) + '/' + (G.total_locations || 0), l: 'Locations Active', c: 'g' },
      { v: '$' + (S.total_job_value || 0), l: 'Revenue Tracked', c: '' }
    ].forEach(function (k) {
      var growthBadge = '';
      if (k.growth !== undefined) {
        growthBadge = '<div style="font-size:.78rem;margin-top:2px">' + fmtGrowth(k.growth) + growthLabel + '</div>';
      }
      h += '<div class="kc ' + k.c + '"><div class="v">' + escapeHtml(k.v) + '</div><div class="l">' + escapeHtml(k.l) + '</div>' + growthBadge + '</div>';
    });
    h += '</div>';

    h += '<div class="cg"><div class="cc"><h3>Traffic by Section</h3><canvas id="pieC"></canvas></div><div class="cc"><h3>Traffic Sources</h3><canvas id="barC"></canvas></div></div>';

    // ─── Biggest Movers section (driven by growth data) ───
    if (growth && Object.keys(growth.pages).length > 0) {
      var pageEntries = Object.entries(growth.pages).map(function (e) {
        var path = String(e[0] || ''), g = e[1];
        var page = (D.top_pages || []).find(function (p) { return p.path === path; });
        var views = page ? page.views : 0;
        var nm = path === '/' ? 'Homepage' : path.replace(/^\//, '').replace(/\//g, ' / ');
        return { path: path, name: nm, views: views, growth: g };
      });
      var winners = pageEntries.filter(function (p) { return typeof p.growth === 'number' && p.growth > 0; })
                               .sort(function (a, b) { return b.growth - a.growth; }).slice(0, 3);
      var losers  = pageEntries.filter(function (p) { return typeof p.growth === 'number' && p.growth < 0; })
                               .sort(function (a, b) { return a.growth - b.growth; }).slice(0, 3);
      var freshes = pageEntries.filter(function (p) { return p.growth === null; }).slice(0, 3);

      h += '<div class="sec"><div class="st">🚀 Biggest Movers <span class="badge bb">vs prior ' + growth.days + 'd</span></div>';
      h += '<div class="cg" style="grid-template-columns:1fr 1fr 1fr">';

      h += '<div class="cc"><h3 style="color:var(--green)">📈 Top Growers</h3>';
      if (winners.length) {
        winners.forEach(function (p) {
          h += '<div style="margin-bottom:10px"><div style="font-size:.9rem">' + escapeHtml(p.name) + '</div><div style="font-size:.78rem;color:var(--muted)">' + escapeHtml(p.views) + ' views · ' + fmtGrowth(p.growth) + '</div></div>';
        });
      } else { h += '<div style="color:var(--muted);font-size:.85rem">No positive growth this period</div>'; }
      h += '</div>';

      h += '<div class="cc"><h3 style="color:var(--blue)">✨ Fresh Wins</h3>';
      if (freshes.length) {
        freshes.forEach(function (p) {
          h += '<div style="margin-bottom:10px"><div style="font-size:.9rem">' + escapeHtml(p.name) + '</div><div style="font-size:.78rem;color:var(--muted)">' + escapeHtml(p.views) + ' views · NEW (no prior data)</div></div>';
        });
      } else { h += '<div style="color:var(--muted);font-size:.85rem">No new pages this period</div>'; }
      h += '</div>';

      h += '<div class="cc"><h3 style="color:var(--red)">📉 Needs Attention</h3>';
      if (losers.length) {
        losers.forEach(function (p) {
          h += '<div style="margin-bottom:10px"><div style="font-size:.9rem">' + escapeHtml(p.name) + '</div><div style="font-size:.78rem;color:var(--muted)">' + escapeHtml(p.views) + ' views · ' + fmtGrowth(p.growth) + '</div></div>';
        });
      } else { h += '<div style="color:var(--muted);font-size:.85rem">No declining pages — nice work!</div>'; }
      h += '</div>';

      h += '</div></div>';
    }

    // Site Health — 3 tiles loaded async (Reviews · Sitemap · CWV)
    h += '<div class="sec"><div class="st">Site Health <span class="badge bb">SEO/AEO signals</span></div>';
    h += '<div class="cg" style="grid-template-columns:1fr 1fr 1fr">';
    h += '<div id="reviewsCard"></div><div id="sitemapCard"></div><div id="cwvCard"></div>';
    h += '</div></div>';

    var growthHdr = growth ? '<th class="num">Growth (vs prior ' + growth.days + 'd)</th>' : '';
    h += '<div class="sec"><div class="st">Top Pages <span class="badge bb">by pageviews</span></div><div class="cc"><table><thead><tr><th>Page</th><th class="num">Views</th><th class="num">%</th>' + growthHdr + '</tr></thead><tbody>';
    var tp = D.top_pages || [];
    if (tp.length) {
      tp.forEach(function (p) {
        var pct = S.total_pageviews > 0 ? (p.views / S.total_pageviews * 100).toFixed(1) : '0';
        var pagePath = String(p.path || '');
        var nm = pagePath === '/' ? 'Homepage' : pagePath.replace(/^\//, '').replace(/\//g, ' / ');
        var growthCell = '';
        if (growth) {
          growthCell = '<td class="num">' + fmtGrowth(growth.pages[p.path]) + '</td>';
        }
        h += '<tr><td>' + escapeHtml(nm) + '</td><td class="num">' + escapeHtml(p.views) + '</td><td class="num">' + escapeHtml(pct) + '%</td>' + growthCell + '</tr>';
      });
    } else {
      h += '<tr><td colspan="' + (growth ? 4 : 3) + '" style="color:var(--muted);text-align:center">Pageview data collecting</td></tr>';
    }
    h += '</tbody></table></div></div>';

    h += '<div class="sec"><div class="st">Location Pages <span class="badge bgo">' + escapeHtml(G.coverage_pct || 0) + '% coverage</span></div><div class="cc"><h3>Green = 5+ views &middot; Orange = 2-4 &middot; Gray = 0</h3><div class="lg">';
    (D.location_performance || []).forEach(function (l) {
      var c = l.views >= 5 ? 'lh' : l.views >= 2 ? 'lw' : 'll';
      h += '<span class="lc ' + c + '">' + escapeHtml(String(l.location || '').replace(/-/g, ' ')) + ' (' + escapeHtml(l.views) + ')</span>';
    });
    (D.location_gaps || []).forEach(function (l) {
      h += '<span class="lc ll">' + escapeHtml(String(l || '').replace(/-/g, ' ')) + '</span>';
    });
    h += '</div></div></div>';

    h += '<div class="sec"><div class="st">Leads & Calls <span class="badge bg">conversion pipeline</span></div><div class="cg">';
    h += '<div class="cc"><h3>Recent Leads</h3><table><thead><tr><th>Name</th><th>Service</th><th>Source</th><th>Date</th></tr></thead><tbody>';
    var rl = (D.leads || []).filter(function (l) { return !l.name || String(l.name).indexOf('TEST') === -1; });
    if (rl.length) {
      rl.forEach(function (l) {
        var d = new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        h += '<tr><td>' + escapeHtml(l.name) + '</td><td>' + escapeHtml(l.service || '') + '</td><td>' + escapeHtml(l.source_page || '') + '</td><td>' + escapeHtml(d) + '</td></tr>';
      });
    } else {
      h += '<tr><td colspan="4" style="color:var(--muted);text-align:center">No leads this period</td></tr>';
    }
    h += '</tbody></table></div>';

    h += '<div class="cc"><h3>Recent Calls</h3><table><thead><tr><th>From</th><th>City</th><th>Dur</th><th>Date</th></tr></thead><tbody>';
    var cl = D.calls || [];
    if (cl.length) {
      cl.forEach(function (c) {
        var d = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        var dur = c.duration_seconds ? c.duration_seconds + 's' : '—';
        h += '<tr><td>' + escapeHtml(c.from_number) + '</td><td>' + escapeHtml(c.city || 'Unknown') + '</td><td>' + escapeHtml(dur) + '</td><td>' + escapeHtml(d) + '</td></tr>';
      });
    } else {
      h += '<tr><td colspan="4" style="color:var(--muted);text-align:center">No calls this period</td></tr>';
    }
    h += '</tbody></table></div></div></div>';

    // Insights (driven by edge function output; rules below match Frame Utah's pattern)
    h += '<div class="sec"><div class="st">Insights & Recommendations</div>';
    if (S.google_organic > 0) {
      h += ins('Google is finding you', S.google_organic + ' visits from Google organic. Pages indexed and ranking.', 'Keep publishing blog content + build backlinks.');
    } else {
      h += ins('Google organic at zero', 'No Google organic traffic yet. Pages indexed but not ranking high enough.', 'Focus on backlink acquisition and Google Business Profile.');
    }
    if ((G.locations_no_traffic || 0) > 20) {
      h += ins(G.locations_no_traffic + ' locations have zero traffic',
        'Only ' + G.coverage_pct + '% of ' + G.total_locations + ' location pages getting visits.',
        'Create blog posts targeting these cities + internal links from service pages.');
    }
    if ((D.location_performance || []).length > 0) {
      var top = D.location_performance[0];
      h += ins(top.location.replace(/-/g, ' ') + ' is your top location',
        top.location.replace(/-/g, ' ') + ' leads with ' + top.views + ' views.',
        'Write neighborhood-specific blog posts, get Google reviews for these cities.');
    }
    if (S.total_job_value === 0) {
      h += ins('Track job values to prove ROI',
        'No job values logged yet. Once leads convert with dollar amounts, this shows revenue per channel.',
        'Update lead records in Supabase with job_value when deals close.');
    }
    h += '</div>';

    h += '<div id="blogTractionBox" class="sec"></div>';

    document.getElementById('ct').innerHTML = h;

    // Storm Watch — fetch NWS API + render in placeholder. Async, non-blocking.
    loadStormWatch();
    // Phase 2 site-health tiles — all async, all silent-fail
    loadReviews();
    loadSitemap();
    loadCWV();
    // Blog traction tracker (data/blog-traction.json) — async, silent-fail
    loadBlogTraction();

    // Charts
    if (typeof Chart !== 'undefined') {
      var TB = D.traffic_breakdown || {}, TS = D.traffic_sources || {};
      if (pC) pC.destroy();
      if (bC) bC.destroy();
      var pe = document.getElementById('pieC');
      if (pe) {
        var pl = Object.keys(TB).length
          ? Object.keys(TB).map(function (k) { return k.charAt(0).toUpperCase() + k.slice(1); })
          : ['No data'];
        pC = new Chart(pe, {
          type: 'doughnut',
          data: {
            labels: pl,
            datasets: [{
              data: Object.keys(TB).length ? Object.values(TB) : [1],
              backgroundColor: ['#c8a951', '#3fb950', '#58a6ff', '#bc8cff', '#d29922', '#8b949e'],
              borderWidth: 0
            }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#8b949e', padding: 12, font: { size: 12 } } } } }
        });
      }
      var be = document.getElementById('barC');
      if (be) {
        var sl = Object.keys(TS).length
          ? Object.keys(TS).map(function (s) { return s === '$direct' ? 'Direct' : s.replace('www.', ''); })
          : ['No data'];
        bC = new Chart(be, {
          type: 'bar',
          data: {
            labels: sl,
            datasets: [{
              data: Object.keys(TS).length ? Object.values(TS) : [0],
              backgroundColor: ['#58a6ff', '#3fb950', '#c8a951', '#bc8cff', '#d29922', '#8b949e', '#f85149', '#e6edf3'],
              borderRadius: 6, borderSkipped: false
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: 'rgba(48,54,61,.5)' }, ticks: { color: '#8b949e' } },
              y: { grid: { display: false }, ticks: { color: '#e6edf3', font: { size: 12 } } }
            }
          }
        });
      }
    }
  }

  // ─── Phase 2: Site Health tiles ──────────────────────────────────────
  // Three async-loaded tiles that pull external SEO/AEO health signals.
  // Each tile is independent and silent-fails so the dashboard keeps working.

  function btScoreColor(s) { s = Number(s) || 0; if (s >= 85) return 'var(--green)'; if (s >= 70) return 'var(--gold)'; if (s >= 55) return 'var(--orange)'; return 'var(--red)'; }
  function btFresh(d) { if (d == null) return '<span style="color:var(--muted)">—</span>'; d = Number(d); if (!Number.isFinite(d)) return '<span style="color:var(--muted)">—</span>'; var c = d <= 120 ? 'var(--green)' : d <= 240 ? 'var(--gold)' : 'var(--red)'; return '<span style="color:' + c + '">' + escapeHtml(d) + 'd</span>'; }
  function btNz(v) { return (v == null) ? '<span style="color:var(--muted)">—</span>' : escapeHtml(v); }
  function btEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  async function loadBlogTraction() {
    var el = document.getElementById('blogTractionBox');
    if (!el) return;
    try {
      var results = await Promise.all([
        fetch('/data/blog-traction.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('traction ' + r.status); return r.json(); }),
        fetch('/data/blog-quality-benchmark.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      ]);
      var d = results[0], b = results[1];
      var posts = d.posts || [];
      var totalViews = 0, qSum = 0, i;
      for (i = 0; i < posts.length; i++) { totalViews += (posts[i].views_90d || 0); qSum += (posts[i].quality_score || 0); }
      var avgQ = posts.length ? (qSum / posts.length) : 0;
      var srcLabel = d.traffic_source === 'posthog' ? 'PostHog pageviews + structure' : 'structure only (no traffic data yet)';
      var gen = d.generated_at ? new Date(d.generated_at).toLocaleString() : '—';
      var champ = d.champion || {};
      var h = '<div class="st">Blog Traction <span class="badge bb">' + posts.length + ' posts</span></div>';
      h += '<div class="cc" style="margin-bottom:14px;color:var(--muted);font-size:.9rem;line-height:1.5">Every published blog post ranked by <b style="color:var(--text)">traction</b> — a blend of real PostHog pageviews and structural quality (depth, FAQs, schema, freshness). The <b style="color:var(--text)">enhancer</b> turns the champion into the bar each new post must beat, and the publish pipeline blocks any draft below the hard floor. Signal source: <b style="color:var(--gold)">' + btEsc(srcLabel) + '</b>. Built ' + btEsc(gen) + (d.traffic_snapshot_at ? ' &middot; traffic as of ' + btEsc(new Date(d.traffic_snapshot_at).toLocaleDateString()) : '') + '.</div>';
      // KPI row (self-contained)
      h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">';
      h += '<div class="cc" style="flex:1;min-width:130px;text-align:center"><div style="font-size:1.8rem;font-weight:700;color:var(--blue)">' + posts.length + '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Published posts</div></div>';
      h += '<div class="cc" style="flex:1;min-width:130px;text-align:center"><div style="font-size:1.8rem;font-weight:700;color:var(--green)">' + avgQ.toFixed(0) + '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Avg quality</div></div>';
      h += '<div class="cc" style="flex:1;min-width:130px;text-align:center"><div style="font-size:1.8rem;font-weight:700;color:var(--purple)">' + totalViews + '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Views / 90d</div></div>';
      h += '<div class="cc" style="flex:1.4;min-width:180px;text-align:center"><div style="font-size:.95rem;font-weight:600;color:var(--gold);line-height:1.3">' + btEsc(champ.slug || '—') + '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Champion — traction ' + (champ.traction_score != null ? champ.traction_score : '—') + '</div></div>';
      h += '</div>';
      // Bar to beat
      if (b && b.target) {
        var f = b.floor || {}, t = b.target || {};
        h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">';
        h += '<div class="cc" style="flex:1;min-width:260px"><h3 style="color:var(--muted);font-size:.9rem;margin-bottom:8px">Aspirational target <span style="font-weight:400">(best so far — enforced bar is the hard floor)</span></h3><table><tbody>'
          + '<tr><td>Words</td><td class="num">≥ ' + btNz(t.words) + '</td></tr>'
          + '<tr><td>Content H2 sections</td><td class="num">≥ ' + btNz(t.h2) + '</td></tr>'
          + '<tr><td>FAQs</td><td class="num">≥ ' + btNz(t.faqs) + '</td></tr>'
          + '<tr><td>Sources</td><td class="num">≥ ' + btNz(t.sources) + '</td></tr>'
          + '</tbody></table></div>';
        h += '<div class="cc" style="flex:1;min-width:260px"><h3 style="color:var(--muted);font-size:.9rem;margin-bottom:8px">Hard floor <span style="color:var(--muted);font-weight:400">(below → needs-review)</span></h3><table><tbody>'
          + '<tr><td>Words</td><td class="num">≥ ' + btNz(f.min_words) + '</td></tr>'
          + '<tr><td>Content H2 sections</td><td class="num">≥ ' + btNz(f.min_h2) + '</td></tr>'
          + '<tr><td>FAQs</td><td class="num">≥ ' + btNz(f.min_faqs) + '</td></tr>'
          + '<tr><td>Schema required</td><td class="num">' + btEsc((f.required_schema || []).join(', ') || '—') + '</td></tr>'
          + '</tbody></table></div>';
        h += '</div>';
      }
      // Per-city rollup
      var byCity = (d.by_city || []).filter(function (c) { return c.city_slug; });
      if (byCity.length) {
        h += '<div class="cc" style="margin-bottom:14px"><h3 style="color:var(--muted);font-size:.9rem;margin-bottom:8px">Traction by city <span class="badge bgo">where to double down</span></h3><table><thead><tr><th>City</th><th class="num">Posts</th><th class="num">Views/90d</th><th class="num">Avg quality</th><th>Top post</th></tr></thead><tbody>';
        for (i = 0; i < byCity.length; i++) {
          var cc = byCity[i];
          h += '<tr><td>' + btEsc(cc.city_slug) + '</td><td class="num">' + cc.posts + '</td><td class="num">' + (cc.views_90d || 0) + '</td><td class="num" style="color:' + btScoreColor(cc.avg_quality) + '">' + cc.avg_quality + '</td><td><a href="' + btEsc(cc.top_path || ('/blog/' + cc.city_slug + '/' + cc.top_slug)) + '" target="_blank" rel="noopener">' + btEsc(cc.top_slug || '—') + '</a></td></tr>';
        }
        h += '</tbody></table></div>';
      }
      // Ranked posts
      h += '<div class="cc"><h3 style="color:var(--muted);font-size:.9rem;margin-bottom:8px">All posts by traction</h3><table><thead><tr><th>#</th><th>Post</th><th>City</th><th class="num">Quality</th><th class="num">Traction</th><th class="num">30d</th><th class="num">90d</th><th class="num">Fresh</th></tr></thead><tbody>';
      for (i = 0; i < posts.length; i++) {
        var p = posts[i];
        h += '<tr><td style="color:var(--muted)">' + (i + 1) + '</td>'
          + '<td><a href="' + btEsc(p.url || ('/blog/' + p.city_slug + '/' + p.slug)) + '" target="_blank" rel="noopener">' + btEsc(p.title || p.slug) + '</a><div style="color:var(--muted);font-size:.7rem">' + btEsc(p.slug) + '</div></td>'
          + '<td>' + (p.city_slug ? btEsc(p.city_slug) : '<span style="color:var(--muted)">—</span>') + '</td>'
          + '<td class="num" style="color:' + btScoreColor(p.quality_score) + '">' + p.quality_score + '</td>'
          + '<td class="num" style="color:' + btScoreColor(p.traction_score) + ';font-weight:700">' + p.traction_score + '</td>'
          + '<td class="num">' + btNz(p.views_30d) + '</td>'
          + '<td class="num">' + btNz(p.views_90d) + '</td>'
          + '<td class="num">' + btFresh(p.freshness_days) + '</td></tr>';
      }
      h += '</tbody></table></div>';
      el.innerHTML = h;
    } catch (e) {
      el.innerHTML = '<div class="cc"><h3>Blog Traction</h3><div style="color:var(--muted);font-size:.85rem">Could not load /data/blog-traction.json (' + btEsc(e.message) + '). Run <code>python3 scripts/blog-traction.py &amp;&amp; python3 scripts/blog-enhancer.py</code> and commit the JSON.</div></div>';
    }
  }

  async function loadReviews() {
    var el = document.getElementById('reviewsCard');
    if (!el) return;
    var feed = (CFG.dataSources && CFG.dataSources.reviews) || {};
    if (feed.enabled === false) { el.innerHTML = ''; return; }
    var path = feed.feedPath || '/reviews.json';
    var competitorTarget = feed.competitorTarget || null; // {name, count}
    try {
      var r = await fetch(path);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      var agg = d.aggregate || {};
      var count = agg.review_count || 0;
      var rating = agg.rating || 0;
      var reviews = d.reviews || [];
      var lastReview = reviews.length ? new Date(reviews[0].date) : null;
      reviews.forEach(function (rv) {
        if (rv.date) {
          var rd = new Date(rv.date);
          if (!lastReview || rd > lastReview) lastReview = rd;
        }
      });
      var daysSince = lastReview ? Math.floor((Date.now() - lastReview.getTime()) / 86400000) : null;
      var staleColor = daysSince == null ? 'var(--muted)' : daysSince > 30 ? 'var(--red)' : daysSince > 14 ? 'var(--orange)' : 'var(--green)';

      var html = '<div class="cc"><h3>⭐ Reviews Velocity</h3>';
      html += '<div style="display:flex;gap:16px;align-items:baseline">';
      html += '<div style="font-size:1.8rem;font-weight:700">' + count + '</div>';
      html += '<div style="font-size:.95rem;color:var(--gold)">' + rating.toFixed(1) + '★</div>';
      html += '</div>';
      if (daysSince != null) {
        html += '<div style="font-size:.78rem;color:' + staleColor + ';margin-top:4px">Last review: ' + daysSince + ' day' + (daysSince === 1 ? '' : 's') + ' ago</div>';
      }
      if (competitorTarget) {
        var gap = (competitorTarget.count || 0) - count;
        var gapColor = gap > 0 ? 'var(--orange)' : 'var(--green)';
        html += '<div style="font-size:.78rem;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">';
        html += 'vs ' + escapeHtml(competitorTarget.name || 'competitor') + ': <span style="color:' + gapColor + ';font-weight:600">' + (gap > 0 ? 'gap ' + gap : 'lead +' + Math.abs(gap)) + '</span>';
        html += '</div>';
      }
      html += '</div>';
      el.innerHTML = html;
    } catch (e) {
      el.innerHTML = '<div class="cc"><h3>⭐ Reviews Velocity</h3><div style="color:var(--muted);font-size:.85rem">No review feed at ' + escapeHtml(path) + '</div></div>';
    }
  }

  async function loadSitemap() {
    var el = document.getElementById('sitemapCard');
    if (!el) return;
    var sm = (CFG.dataSources && CFG.dataSources.sitemap) || {};
    if (sm.enabled === false) { el.innerHTML = ''; return; }
    var url = sm.url || '/sitemap.xml';
    try {
      var r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var xml = await r.text();
      var dates = (xml.match(/<lastmod>([^<]+)<\/lastmod>/g) || [])
        .map(function (m) { return new Date(m.replace(/<\/?lastmod>/g, '')); })
        .filter(function (d) { return !isNaN(d.getTime()); });
      var totalPages = (xml.match(/<url>/g) || []).length;
      if (!dates.length) throw new Error('no lastmod entries');
      var newest = new Date(Math.max.apply(null, dates));
      var oldest = new Date(Math.min.apply(null, dates));
      var now = Date.now();
      var d7  = dates.filter(function (d) { return now - d < 7  * 86400000; }).length;
      var d30 = dates.filter(function (d) { return now - d < 30 * 86400000; }).length;
      var d90 = dates.filter(function (d) { return now - d < 90 * 86400000; }).length;
      var daysSinceNewest = Math.floor((now - newest.getTime()) / 86400000);
      var freshColor = daysSinceNewest <= 14 ? 'var(--green)' : daysSinceNewest <= 60 ? 'var(--orange)' : 'var(--red)';

      var html = '<div class="cc"><h3>📝 Content Freshness</h3>';
      html += '<div style="display:flex;gap:16px;align-items:baseline">';
      html += '<div style="font-size:1.8rem;font-weight:700">' + totalPages + '</div>';
      html += '<div style="font-size:.78rem;color:var(--muted)">indexed pages</div>';
      html += '</div>';
      html += '<div style="font-size:.78rem;color:' + freshColor + ';margin-top:4px">Last update: ' + daysSinceNewest + ' day' + (daysSinceNewest === 1 ? '' : 's') + ' ago</div>';
      html += '<div style="font-size:.78rem;margin-top:6px;padding-top:6px;border-top:1px solid var(--border);color:var(--muted)">';
      html += 'Updated last: <span style="color:var(--text)">' + d7 + '/7d</span> · <span style="color:var(--text)">' + d30 + '/30d</span> · <span style="color:var(--text)">' + d90 + '/90d</span>';
      html += '</div>';
      html += '</div>';
      el.innerHTML = html;
    } catch (e) {
      el.innerHTML = '<div class="cc"><h3>📝 Content Freshness</h3><div style="color:var(--muted);font-size:.85rem">Sitemap unavailable</div></div>';
    }
  }

  async function loadCWV() {
    var el = document.getElementById('cwvCard');
    if (!el) return;
    var psi = (CFG.dataSources && CFG.dataSources.psi) || {};
    if (psi.enabled === false) { el.innerHTML = ''; return; }
    var origin = psi.origin || ('https://' + (CFG.client && CFG.client.domain || ''));
    var apiKey = psi.apiKey;

    if (!apiKey) {
      var html = '<div class="cc"><h3>⚡ Core Web Vitals</h3>';
      html += '<div style="font-size:.85rem;color:var(--muted);line-height:1.5">Add a free PageSpeed Insights API key to <code style="background:var(--bg);padding:2px 6px;border-radius:4px">data/dashboard-config.json</code> → <code>dataSources.psi.apiKey</code> to enable LCP / CLS / INP tracking.</div>';
      html += '<div style="font-size:.78rem;margin-top:8px"><a href="https://developers.google.com/speed/docs/insights/v5/get-started" target="_blank" style="color:var(--blue)">Get key →</a></div>';
      html += '</div>';
      el.innerHTML = html;
      return;
    }

    // Cache 60 minutes
    var cacheKey = 'cwv-' + origin;
    var cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        var cd = JSON.parse(cached);
        if (Date.now() - cd.fetchedAt < 60 * 60 * 1000) { renderCWV(el, cd, origin); return; }
      } catch (e) {}
    }

    el.innerHTML = '<div class="cc"><h3>⚡ Core Web Vitals</h3><div style="color:var(--muted);font-size:.85rem"><span class="sp"></span> Loading from PageSpeed Insights…</div></div>';
    try {
      var url = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=' + encodeURIComponent(origin) + '&strategy=' + (psi.strategy || 'mobile') + '&key=' + apiKey;
      var r = await fetch(url);
      var d = await r.json();
      if (d.error) throw new Error(d.error.message || 'PSI error');
      var loadexp = (d.originLoadingExperience || d.loadingExperience || {}).metrics || {};
      var lhPerf = ((d.lighthouseResult || {}).categories || {}).performance || {};
      var data = {
        lcp:  loadexp.LARGEST_CONTENTFUL_PAINT_MS,
        cls:  loadexp.CUMULATIVE_LAYOUT_SHIFT_SCORE,
        inp:  loadexp.INTERACTION_TO_NEXT_PAINT,
        ttfb: loadexp.EXPERIMENTAL_TIME_TO_FIRST_BYTE,
        labScore: lhPerf.score,
        hasField: Object.keys(loadexp).length > 0,
        fetchedAt: Date.now(),
      };
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      renderCWV(el, data, origin);
    } catch (e) {
      el.innerHTML = '<div class="cc"><h3>⚡ Core Web Vitals</h3><div style="color:var(--muted);font-size:.85rem">PSI error: ' + escapeHtml(e.message) + '</div></div>';
    }
  }

  function renderCWV(el, data, origin) {
    var color = function (cat) {
      return cat === 'FAST' ? 'var(--green)' : cat === 'AVERAGE' ? 'var(--orange)' : cat === 'SLOW' ? 'var(--red)' : 'var(--muted)';
    };
    var fmt = function (m, formatter) {
      if (!m) return '<span style="color:var(--muted)">—</span>';
      return '<span style="color:' + color(m.category) + ';font-weight:600">' + formatter(m.percentile) + '</span>';
    };
    var html = '<div class="cc"><h3>⚡ Core Web Vitals</h3>';
    if (!data.hasField) {
      html += '<div style="font-size:.85rem;color:var(--muted);margin-bottom:8px">Insufficient field data — site needs more traffic for CrUX inclusion (~28 days of meaningful traffic).</div>';
    }
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.85rem">';
    html += '<div>LCP: ' + fmt(data.lcp,  function (v) { return (v / 1000).toFixed(1) + 's'; }) + '</div>';
    html += '<div>CLS: ' + fmt(data.cls,  function (v) { return (v / 100).toFixed(2); }) + '</div>';
    html += '<div>INP: ' + fmt(data.inp,  function (v) { return v + 'ms'; }) + '</div>';
    html += '<div>TTFB: ' + fmt(data.ttfb, function (v) { return v + 'ms'; }) + '</div>';
    html += '</div>';
    if (data.labScore != null) {
      var lbColor = data.labScore > 0.9 ? 'var(--green)' : data.labScore > 0.5 ? 'var(--orange)' : 'var(--red)';
      html += '<div style="font-size:.78rem;margin-top:8px;padding-top:6px;border-top:1px solid var(--border);color:var(--muted)">Lighthouse perf: <span style="color:' + lbColor + ';font-weight:600">' + Math.round(data.labScore * 100) + '/100</span></div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  // ─── Storm Watch (NWS API — free public, browser-CORS allowed) ───────
  // Pulls active alerts for client's state. Highlights severe events that
  // would trigger the marketing-intel storm-trigger reserve recommendation.
  // Service area is read from CFG.dataSources.stormWatch.area (default: 'UT').
  async function loadStormWatch() {
    var el = document.getElementById('stormWatch');
    if (!el) return;
    var area = (CFG.dataSources && CFG.dataSources.stormWatch && CFG.dataSources.stormWatch.area) || 'UT';
    try {
      var r = await fetch('https://api.weather.gov/alerts/active?area=' + area, {
        headers: { 'User-Agent': (CFG.client && CFG.client.domain) || 'client-dashboard' },
      });
      if (!r.ok) { el.innerHTML = ''; return; }
      var d = await r.json();
      var features = d.features || [];

      // Filter to relevant severities (skip "Minor" + "Unknown" + most non-storm)
      var relevant = features.filter(function (f) {
        var p = f.properties || {};
        var sev = p.severity || '';
        var ev = (p.event || '').toLowerCase();
        // Storm-driven roofing-relevant events:
        var stormy = /storm|wind|hail|tornado|thunderstorm|hurricane|winter|blizzard|ice|snow|flood/.test(ev);
        return stormy && (sev === 'Severe' || sev === 'Extreme' || sev === 'Moderate');
      });

      if (relevant.length === 0) {
        el.innerHTML = '<div class="cc" style="border-left:3px solid var(--green)"><div style="display:flex;align-items:center;gap:10px"><span style="font-size:1.4rem">✅</span><div><div style="font-weight:600">No storm-driven alerts in service area (' + escapeHtml(area) + ')</div><div style="font-size:.85rem;color:var(--muted)">Storm-trigger reserve held; bid back to baseline.</div></div></div></div>';
        return;
      }

      // Sort by severity (Extreme > Severe > Moderate)
      var sevRank = { 'Extreme': 0, 'Severe': 1, 'Moderate': 2, 'Minor': 3, 'Unknown': 4 };
      relevant.sort(function (a, b) { return (sevRank[a.properties.severity] || 9) - (sevRank[b.properties.severity] || 9); });

      var topAlert = relevant[0].properties;
      var color = topAlert.severity === 'Extreme' ? 'var(--red)' : topAlert.severity === 'Severe' ? 'var(--orange)' : 'var(--gold)';
      var icon = /tornado|hurricane/.test(topAlert.event.toLowerCase()) ? '🌪️' :
                 /hail|thunderstorm/.test(topAlert.event.toLowerCase()) ? '⛈️' :
                 /wind/.test(topAlert.event.toLowerCase()) ? '💨' :
                 /winter|blizzard|snow|ice/.test(topAlert.event.toLowerCase()) ? '❄️' :
                 /flood/.test(topAlert.event.toLowerCase()) ? '💧' : '⚠️';

      var html = '<div class="cc" style="border-left:3px solid ' + color + '">';
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">';
      html += '<span style="font-size:1.6rem">' + icon + '</span>';
      html += '<div style="flex:1">';
      html += '<div style="font-weight:600;color:' + color + '">' + escapeHtml(topAlert.event) + ' — ' + escapeHtml(topAlert.severity.toUpperCase()) + '</div>';
      html += '<div style="font-size:.85rem;color:var(--muted)">' + escapeHtml((topAlert.areaDesc || '').slice(0, 120)) + '</div>';
      html += '</div>';
      html += '<div style="text-align:right;font-size:.78rem;color:var(--muted)">' + relevant.length + ' active</div>';
      html += '</div>';
      html += '<div style="font-size:.85rem;color:var(--text);margin-bottom:6px">' + escapeHtml((topAlert.headline || '').slice(0, 200)) + '</div>';
      html += '<div style="font-size:.78rem;color:var(--gold);font-weight:500">→ Storm-trigger reserve recommended: bid up Search +50%, deploy /storm-response landing page</div>';
      html += '</div>';
      el.innerHTML = html;
    } catch (e) {
      el.innerHTML = ''; // silent fail — don't break the dashboard
    }
  }

  function initializeDashboardUi() {
    document.getElementById('loginForm').addEventListener('submit', doLogin);
    document.getElementById('refreshBtn').addEventListener('click', function () { go(curD); });
    document.getElementById('manageBtn').addEventListener('click', openAdmin);
    document.getElementById('logoutBtn').addEventListener('click', doLogout);
    document.getElementById('closeAdminBtn').addEventListener('click', closeAdmin);
    document.getElementById('addUserBtn').addEventListener('click', addUser);

    var ranges = CFG.ranges || [7, 14, 30, 90];
    var defaultDays = CFG.defaultDays || 30;
    var rangeBar = document.getElementById('rangeBar');
    ranges.forEach(function (days) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'pb' + (days === defaultDays ? ' act' : '');
      button.textContent = days + ' Days';
      button.addEventListener('click', function () { sw(days, button); });
      rangeBar.appendChild(button);
    });
  }

  initializeDashboardUi();

  // Expose a bounded compatibility surface for browser tests and legacy links.
  window.__dashboard = {
    doLogin: doLogin,
    doLogout: doLogout,
    sw: sw,
    go: go,
    openAdmin: openAdmin,
    closeAdmin: closeAdmin,
    addUser: addUser,
    toggleUser: toggleUser,
    resetUserPin: resetUserPin,
    refresh: function () { go(curD); }
  };
})();
