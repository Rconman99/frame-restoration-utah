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
      // Fetch current period + 2x period in parallel; derive prior by subtraction.
      var [currentR, doubleR] = await Promise.all([
        fetch(FAPI + '?key=' + KEY + '&pin=' + encodeURIComponent(PIN) + '&days=' + days),
        fetch(FAPI + '?key=' + KEY + '&pin=' + encodeURIComponent(PIN) + '&days=' + (days * 2)),
      ]);
      if (currentR.status === 403) { doLogout(); return; }
      var D = await currentR.json();
      if (D.error) throw new Error(D.error);
      var D2 = doubleR.ok ? await doubleR.json() : null;
      if (D.user) CUR_USER = D.user;
      document.getElementById('rDate').textContent = new Date(D.generated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      var growth = computeGrowth(D, D2, days);
      render(D, growth);
    } catch (e) {
      el.innerHTML = '<div class="ld" style="color:var(--red)">Error: ' + e.message + '</div>';
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
      h += '<div class="kc ' + k.c + '"><div class="v">' + k.v + '</div><div class="l">' + k.l + '</div>' + growthBadge + '</div>';
    });
    h += '</div>';

    h += '<div class="cg"><div class="cc"><h3>Traffic by Section</h3><canvas id="pieC"></canvas></div><div class="cc"><h3>Traffic Sources</h3><canvas id="barC"></canvas></div></div>';

    // ─── Biggest Movers section (driven by growth data) ───
    if (growth && Object.keys(growth.pages).length > 0) {
      var pageEntries = Object.entries(growth.pages).map(function (e) {
        var path = e[0], g = e[1];
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
          h += '<div style="margin-bottom:10px"><div style="font-size:.9rem">' + p.name + '</div><div style="font-size:.78rem;color:var(--muted)">' + p.views + ' views · ' + fmtGrowth(p.growth) + '</div></div>';
        });
      } else { h += '<div style="color:var(--muted);font-size:.85rem">No positive growth this period</div>'; }
      h += '</div>';

      h += '<div class="cc"><h3 style="color:var(--blue)">✨ Fresh Wins</h3>';
      if (freshes.length) {
        freshes.forEach(function (p) {
          h += '<div style="margin-bottom:10px"><div style="font-size:.9rem">' + p.name + '</div><div style="font-size:.78rem;color:var(--muted)">' + p.views + ' views · NEW (no prior data)</div></div>';
        });
      } else { h += '<div style="color:var(--muted);font-size:.85rem">No new pages this period</div>'; }
      h += '</div>';

      h += '<div class="cc"><h3 style="color:var(--red)">📉 Needs Attention</h3>';
      if (losers.length) {
        losers.forEach(function (p) {
          h += '<div style="margin-bottom:10px"><div style="font-size:.9rem">' + p.name + '</div><div style="font-size:.78rem;color:var(--muted)">' + p.views + ' views · ' + fmtGrowth(p.growth) + '</div></div>';
        });
      } else { h += '<div style="color:var(--muted);font-size:.85rem">No declining pages — nice work!</div>'; }
      h += '</div>';

      h += '</div></div>';
    }

    var growthHdr = growth ? '<th class="num">Growth (vs prior ' + growth.days + 'd)</th>' : '';
    h += '<div class="sec"><div class="st">Top Pages <span class="badge bb">by pageviews</span></div><div class="cc"><table><thead><tr><th>Page</th><th class="num">Views</th><th class="num">%</th>' + growthHdr + '</tr></thead><tbody>';
    var tp = D.top_pages || [];
    if (tp.length) {
      tp.forEach(function (p) {
        var pct = S.total_pageviews > 0 ? (p.views / S.total_pageviews * 100).toFixed(1) : '0';
        var nm = p.path === '/' ? 'Homepage' : p.path.replace(/^\//, '').replace(/\//g, ' / ');
        var growthCell = '';
        if (growth) {
          growthCell = '<td class="num">' + fmtGrowth(growth.pages[p.path]) + '</td>';
        }
        h += '<tr><td>' + nm + '</td><td class="num">' + p.views + '</td><td class="num">' + pct + '%</td>' + growthCell + '</tr>';
      });
    } else {
      h += '<tr><td colspan="' + (growth ? 4 : 3) + '" style="color:var(--muted);text-align:center">Pageview data collecting</td></tr>';
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

    // Storm Watch — fetch NWS API + render in placeholder. Async, non-blocking.
    loadStormWatch();

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
        el.innerHTML = '<div class="cc" style="border-left:3px solid var(--green)"><div style="display:flex;align-items:center;gap:10px"><span style="font-size:1.4rem">✅</span><div><div style="font-weight:600">No storm-driven alerts in service area (' + area + ')</div><div style="font-size:.85rem;color:var(--muted)">Storm-trigger reserve held; bid back to baseline.</div></div></div></div>';
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
      html += '<div style="font-weight:600;color:' + color + '">' + topAlert.event + ' — ' + topAlert.severity.toUpperCase() + '</div>';
      html += '<div style="font-size:.85rem;color:var(--muted)">' + (topAlert.areaDesc || '').slice(0, 120) + '</div>';
      html += '</div>';
      html += '<div style="text-align:right;font-size:.78rem;color:var(--muted)">' + relevant.length + ' active</div>';
      html += '</div>';
      html += '<div style="font-size:.85rem;color:var(--text);margin-bottom:6px">' + (topAlert.headline || '').slice(0, 200) + '</div>';
      html += '<div style="font-size:.78rem;color:var(--gold);font-weight:500">→ Storm-trigger reserve recommended: bid up Search +50%, deploy /storm-response landing page</div>';
      html += '</div>';
      el.innerHTML = html;
    } catch (e) {
      el.innerHTML = ''; // silent fail — don't break the dashboard
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
