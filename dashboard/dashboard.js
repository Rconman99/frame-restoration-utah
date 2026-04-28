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
 *     supabaseAnonKey: string,
 *     campaignKey: string,
 *     defaultDays: number,
 *     ranges: number[],          // e.g. [7, 14, 30, 90]
 *     footerLinks: { label: string, url: string }[],
 *     builderAttribution: string
 *   }
 *
 * Edge function endpoint: {supabaseUrl}/functions/v1/weekly-report
 *   GET ?key=<campaignKey>&pin=<pin>&days=<days>
 *   Returns: { user, summary, gap_summary, top_pages, location_performance, location_gaps, leads, calls, traffic_breakdown, traffic_sources, generated_at }
 *
 * Admin REST: {supabaseUrl}/rest/v1/report_access
 *   PIN-gated via RLS — see db/rls-policies.sql.
 */

(function () {
  'use strict';

  var CFG = window.DASHBOARD_CONFIG || {};
  var API = CFG.supabaseUrl;
  var FAPI = API + '/functions/v1/weekly-report';
  var SKEY = CFG.supabaseAnonKey;
  var KEY = CFG.campaignKey;

  var curD = CFG.defaultDays || 30;
  var pC = null, bC = null;
  var PIN = '';
  var CUR_USER = null;

  // ─── Auth ────────────────────────────────────────────────────────────

  function doLogin(e) {
    e.preventDefault();
    var p = document.getElementById('pinInput').value.trim();
    if (!p) { document.getElementById('loginErr').textContent = 'Please enter a PIN'; return false; }
    document.getElementById('loginErr').textContent = '';
    PIN = p;
    fetch(FAPI + '?key=' + KEY + '&pin=' + encodeURIComponent(p) + '&days=1').then(function (r) {
      if (r.status === 403) {
        document.getElementById('loginErr').textContent = 'Invalid PIN. Try again.';
        PIN = ''; return;
      }
      return r.json();
    }).then(function (d) {
      if (!d || d.error) return;
      CUR_USER = d.user;
      sessionStorage.setItem(KEY, p);
      showReport();
      go(curD);
    }).catch(function () {
      document.getElementById('loginErr').textContent = 'Connection error. Try again.';
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
    }
  }

  function doLogout() {
    sessionStorage.removeItem(KEY);
    PIN = ''; CUR_USER = null;
    document.getElementById('reportWrap').style.display = 'none';
    document.getElementById('manageBtn').style.display = 'none';
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('pinInput').value = '';
    document.getElementById('loginErr').textContent = '';
    document.getElementById('pinInput').focus();
  }

  // Auto-login if session has PIN
  (function () {
    var s = sessionStorage.getItem(KEY);
    if (s) {
      PIN = s;
      fetch(FAPI + '?key=' + KEY + '&pin=' + encodeURIComponent(s) + '&days=1').then(function (r) {
        if (r.status === 403) { doLogout(); return; }
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
      var r = await fetch(FAPI + '?key=' + KEY + '&pin=' + encodeURIComponent(PIN) + '&days=' + days);
      if (r.status === 403) { doLogout(); return; }
      var D = await r.json();
      if (D.error) throw new Error(D.error);
      if (D.user) CUR_USER = D.user;
      document.getElementById('rDate').textContent = new Date(D.generated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      render(D);
    } catch (e) {
      el.innerHTML = '<div class="ld" style="color:var(--red)">Error: ' + e.message + '</div>';
    }
  }

  // ─── Admin panel ─────────────────────────────────────────────────────

  async function openAdmin() { document.getElementById('adminModal').classList.add('show'); await loadUsers(); }
  function closeAdmin() { document.getElementById('adminModal').classList.remove('show'); }

  async function loadUsers() {
    var r = await fetch(API + '/rest/v1/report_access?select=id,name,pin,role,active,last_accessed&order=created_at', {
      headers: { 'apikey': SKEY, 'Authorization': 'Bearer ' + SKEY }
    });
    var users = await r.json();
    var tb = document.getElementById('accessBody');
    tb.innerHTML = '';
    users.forEach(function (u) {
      var la = u.last_accessed ? new Date(u.last_accessed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never';
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + u.name + '</td><td style="font-family:monospace;color:var(--muted)">' + u.pin + '</td><td>' + u.role + '</td><td>' + (u.active ? '<span class="status-on">Active</span>' : '<span class="status-off">Disabled</span>') + '</td><td><button class="toggle-btn ' + (u.active ? 'on' : 'off') + '" onclick="window.__dashboard.toggleUser(\'' + u.id + '\',' + !u.active + ')">' + (u.active ? 'Disable' : 'Enable') + '</button></td>';
      tb.appendChild(tr);
    });
  }

  async function toggleUser(id, active) {
    await fetch(API + '/rest/v1/report_access?id=eq.' + id, {
      method: 'PATCH',
      headers: { 'apikey': SKEY, 'Authorization': 'Bearer ' + SKEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ active: active })
    });
    loadUsers();
  }

  async function addUser() {
    var n = document.getElementById('newName').value.trim();
    var p = document.getElementById('newPin').value.trim();
    if (!n || !p) {
      document.getElementById('adminMsg').textContent = 'Name and PIN required';
      document.getElementById('adminMsg').style.color = 'var(--red)';
      return;
    }
    var r = await fetch(API + '/rest/v1/report_access', {
      method: 'POST',
      headers: { 'apikey': SKEY, 'Authorization': 'Bearer ' + SKEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ name: n, pin: p, role: 'viewer', campaign_key: KEY })
    });
    if (r.ok) {
      document.getElementById('newName').value = '';
      document.getElementById('newPin').value = '';
      document.getElementById('adminMsg').textContent = n + ' added!';
      document.getElementById('adminMsg').style.color = 'var(--green)';
      loadUsers();
    } else {
      var e = await r.json();
      document.getElementById('adminMsg').textContent = e.message || 'Error adding user';
      document.getElementById('adminMsg').style.color = 'var(--red)';
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────

  function ins(t, tx, a) {
    return '<div class="ib"><h3>' + t + '</h3><p>' + tx + '</p><p class="a">&rarr; ' + a + '</p></div>';
  }

  function render(D) {
    var S = D.summary || {};
    var G = D.gap_summary || { locations_with_traffic: 0, total_locations: 0, coverage_pct: 0, locations_no_traffic: 0 };

    var h = '<div class="kg">';
    [
      { v: S.total_pageviews || 0, l: 'Pageviews', c: '' },
      { v: S.google_organic || 0, l: 'Google Organic', c: 'g' },
      { v: S.total_leads || 0, l: 'Form Leads', c: 'b' },
      { v: S.total_calls || 0, l: 'Inbound Calls', c: 'b' },
      { v: (S.total_call_minutes || 0) + 'm', l: 'Call Minutes', c: 'p' },
      { v: (S.conversion_rate_pct || 0) + '%', l: 'Conversion Rate', c: '' },
      { v: (G.locations_with_traffic || 0) + '/' + (G.total_locations || 0), l: 'Locations Active', c: 'g' },
      { v: '$' + (S.total_job_value || 0), l: 'Revenue Tracked', c: '' }
    ].forEach(function (k) {
      h += '<div class="kc ' + k.c + '"><div class="v">' + k.v + '</div><div class="l">' + k.l + '</div></div>';
    });
    h += '</div>';

    h += '<div class="cg"><div class="cc"><h3>Traffic by Section</h3><canvas id="pieC"></canvas></div><div class="cc"><h3>Traffic Sources</h3><canvas id="barC"></canvas></div></div>';

    h += '<div class="sec"><div class="st">Top Pages <span class="badge bb">by pageviews</span></div><div class="cc"><table><thead><tr><th>Page</th><th class="num">Views</th><th class="num">%</th></tr></thead><tbody>';
    var tp = D.top_pages || [];
    if (tp.length) {
      tp.forEach(function (p) {
        var pct = S.total_pageviews > 0 ? (p.views / S.total_pageviews * 100).toFixed(1) : '0';
        var nm = p.path === '/' ? 'Homepage' : p.path.replace(/^\//, '').replace(/\//g, ' / ');
        h += '<tr><td>' + nm + '</td><td class="num">' + p.views + '</td><td class="num">' + pct + '%</td></tr>';
      });
    } else {
      h += '<tr><td colspan="3" style="color:var(--muted);text-align:center">Pageview data collecting</td></tr>';
    }
    h += '</tbody></table></div></div>';

    h += '<div class="sec"><div class="st">Location Pages <span class="badge bgo">' + (G.coverage_pct || 0) + '% coverage</span></div><div class="cc"><h3>Green = 5+ views &middot; Orange = 2-4 &middot; Gray = 0</h3><div class="lg">';
    (D.location_performance || []).forEach(function (l) {
      var c = l.views >= 5 ? 'lh' : l.views >= 2 ? 'lw' : 'll';
      h += '<span class="lc ' + c + '">' + l.location.replace(/-/g, ' ') + ' (' + l.views + ')</span>';
    });
    (D.location_gaps || []).forEach(function (l) {
      h += '<span class="lc ll">' + l.replace(/-/g, ' ') + '</span>';
    });
    h += '</div></div></div>';

    h += '<div class="sec"><div class="st">Leads & Calls <span class="badge bg">conversion pipeline</span></div><div class="cg">';
    h += '<div class="cc"><h3>Recent Leads</h3><table><thead><tr><th>Name</th><th>Service</th><th>Source</th><th>Date</th></tr></thead><tbody>';
    var rl = (D.leads || []).filter(function (l) { return !l.name || l.name.indexOf('TEST') === -1; });
    if (rl.length) {
      rl.forEach(function (l) {
        var d = new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        h += '<tr><td>' + l.name + '</td><td>' + (l.service || '') + '</td><td>' + (l.source_page || '') + '</td><td>' + d + '</td></tr>';
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
        h += '<tr><td>' + c.from_number + '</td><td>' + (c.city || 'Unknown') + '</td><td>' + dur + '</td><td>' + d + '</td></tr>';
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

    document.getElementById('ct').innerHTML = h;

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
          options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#8b949e', padding: 12, font: { size: 12 } } } } }
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
            responsive: true, indexAxis: 'y',
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

  // Expose handlers used by inline onclick
  window.__dashboard = {
    doLogin: doLogin,
    doLogout: doLogout,
    sw: sw,
    go: go,
    openAdmin: openAdmin,
    closeAdmin: closeAdmin,
    addUser: addUser,
    toggleUser: toggleUser,
    refresh: function () { go(curD); }
  };
})();
