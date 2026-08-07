# Track E v0 — Revenue Attribution Design (Frame Utah Prototype)

> **Status:** Design draft 2026-05-17. Frame Utah is the v0 prototype client. When validated, propagates to Frame TX + future cbp clients via Track D.
> **Author:** Claude (architecture lane). **Implementer:** Codex (TypeScript/SQL lane) when back from 5/19 outage.
> **Why this matters:** This tile is what turns Frame Utah's SoM gains (76 → 85) into a defensible $ claim. It's the single artifact that justifies the recurring growth retainer pricing.

---

## 1. Goal

Surface **per-page revenue attribution** in Frame Utah's `/dashboard/` so any client looking at the dashboard can answer four questions immediately:

1. Which pages produced won leads in the last N days?
2. How much $ has been paid (realized) vs booked (awaiting payment) vs pipeline (estimated, not won)?
3. Which traffic source (organic Google / LLM / paid / direct) drove each revenue stream?
4. What's the lead-to-pay ratio and average time-to-pay?

Plus a 30-day forecast: jobs completing in the next 30 days × margin = expected next-period revenue.

---

## 2. Scope of v0

**In scope:**
- Frame Utah only (prototype)
- Last-touch attribution (the page where the form submitted OR tel: was clicked)
- Channel rollup: 8 buckets (paid_search / paid_social / organic_google / organic_bing / llm_chatgpt / llm_perplexity / llm_gemini / llm_claude / llm_copilot / direct / other)
- 4 time windows (7/30/60/90 days — matches existing dashboard toggle)
- Current + prior period delta (matches existing pattern)
- Phone_clicks → leads join (manually-created inbound-call leads)

**Out of scope for v0:**
- Multi-touch attribution (requires PostHog session journey join — defer to v1)
- Net-of-ad-spend margin (gross only — v1 add-on once ad spend is tracked)
- Cross-device attribution (no stable user ID)
- TX rollout (after Utah proves the value)

---

## 3. Data model

Tables used (all already exist or migration shipped):

| Table | Source | Purpose |
|---|---|---|
| `public.leads` | Utah + TX | Lifecycle, margin, source_page, attribution columns |
| `public.phone_clicks` | Utah live; TX migration shipped 2026-05-17 | Pre-click intent + channel |
| `public.report_access` | Utah live; TX needs port | PIN auth for dashboard endpoint |

Required `leads` columns (all already on Utah live):
- `id`, `created_at`, `name`, `phone`, `source_page`, `status` (CHECK: new/contacted/estimated/won/lost)
- `job_value`, `margin`, `city`, `commission` (GENERATED)
- `won_at`, `deposit_received_at`, `deposit_amount`, `install_scheduled_for`, `job_started_at`, `job_completed_at`, `balance_due`, `final_payment_received_at` (Utah needs this added — Utah's lead-crm v6 doesn't have it yet; mirror TX v2 migration)
- `estimated_completion_date` (Utah needs this added — same)
- Attribution cols: `gclid`, `fbclid`, `msclkid`, `gbraid`, `wbraid`, `utm_*`, `landing_page`, `referrer`

**Utah migration needed before v0 ships:** add `estimated_completion_date` (date) + `final_payment_received_at` (timestamptz) to Utah's leads table. ~5-line migration.

---

## 4. Channel classification — the CASE expression

Server-side classifier used in both rollup queries AND the `/track-click` edge function:

```sql
CASE
  -- LLM referrals (Frame's compounding moat — verify against referrer carefully)
  WHEN referrer ILIKE '%chatgpt.com%'                THEN 'llm_chatgpt'
  WHEN referrer ILIKE '%perplexity.ai%'              THEN 'llm_perplexity'
  WHEN referrer ILIKE '%gemini.google%'
    OR referrer ILIKE '%google.com/gemini%'          THEN 'llm_gemini'
  WHEN referrer ILIKE '%claude.ai%'                  THEN 'llm_claude'
  WHEN referrer ILIKE '%copilot.microsoft%'          THEN 'llm_copilot'

  -- Paid (excluded from "your work, your money" attribution)
  WHEN gclid IS NOT NULL OR utm_medium = 'cpc'       THEN 'paid_search'
  WHEN fbclid IS NOT NULL
    OR utm_medium IN ('paid_social', 'social-paid')  THEN 'paid_social'

  -- Organic search (Frame's earned SEO work)
  WHEN referrer ILIKE '%google.com%'
    OR utm_medium = 'organic'                        THEN 'organic_google'
  WHEN referrer ILIKE '%bing.com%'                   THEN 'organic_bing'

  -- Direct (likely AI Overview, dark social, brand recall, bookmark)
  WHEN referrer IS NULL OR referrer = ''             THEN 'direct'

  ELSE 'referral_other'
END
```

**"Your work, your money" filter** (used for the headline organic revenue number):

```sql
channel IN ('organic_google', 'organic_bing', 'llm_chatgpt', 'llm_perplexity', 'llm_gemini', 'llm_claude', 'llm_copilot', 'direct')
```

`paid_search` + `paid_social` are tracked but excluded from organic-credit.
`referral_other` flagged for manual review (could be a managed directory = our money, or a friend = not our money).

---

## 5. Joining strategy

Three independent join cases handled by the same cron job (`update-attribution-joins`, runs every 5 min):

### Case A: Phone-in lead manually created (Connor/Landon used `/leads` "+ Add Lead")

```sql
-- Newly-created inbound-call leads in last 1 hour
WITH recent_phone_leads AS (
  SELECT id, phone, created_at, source_page
  FROM public.leads
  WHERE source_page = 'manual-inbound-call'
    AND created_at >= NOW() - INTERVAL '1 hour'
),
best_click_match AS (
  SELECT
    l.id AS lead_id,
    pc.id AS click_id,
    pc.created_at AS click_at,
    EXTRACT(EPOCH FROM (l.created_at - pc.created_at)) AS seconds_before_lead_entry,
    ROW_NUMBER() OVER (
      PARTITION BY l.id
      ORDER BY ABS(EXTRACT(EPOCH FROM (l.created_at - pc.created_at)))
    ) AS rank
  FROM recent_phone_leads l
  JOIN public.phone_clicks pc
    ON pc.created_at BETWEEN l.created_at - INTERVAL '24 hours'
                         AND l.created_at + INTERVAL '5 minutes'
    AND pc.matched_lead_id IS NULL
)
UPDATE public.phone_clicks pc
SET matched_lead_id = m.lead_id
FROM best_click_match m
WHERE m.rank = 1 AND pc.id = m.click_id;
```

Conservative 24-hour back-window since Landon may log a call hours later. Closest time-match wins.

### Case B: Form-submit lead with full attribution captured

No join needed — `handle-lead` already captures `source_page`, `gclid`, `fbclid`, `utm_*`, `referrer`, `landing_page` at insert. Direct query.

### Case C (TX only): call_logs from CallRail/parent-API import

Already designed in `~/projects/frame-restoration-texas/supabase/migrations/20260517_call_logs_table_init.sql`. Join logic:
- Match by `caller_id` to existing `leads.phone`
- Or match by `source_page` + time-proximity to `phone_clicks` (-5min/+30s window)
- If neither, auto-create lead (mirrors Utah's `handle-call` v2 pattern but post-hoc)

---

## 6. The rollup query

Single SELECT producing the JSON response. Two parameters: `:days` (window) and `:client_id` (multi-client safety, even though v0 is Utah-only).

```sql
WITH leads_window AS (
  SELECT
    l.id, l.created_at, l.won_at, l.status, l.source_page, l.landing_page,
    l.job_value, l.margin,
    l.deposit_amount, l.balance_due,
    l.final_payment_received_at,
    l.estimated_completion_date,
    -- Channel classification inline
    CASE
      WHEN l.referrer ILIKE '%chatgpt.com%'                THEN 'llm_chatgpt'
      WHEN l.referrer ILIKE '%perplexity.ai%'              THEN 'llm_perplexity'
      WHEN l.referrer ILIKE '%gemini.google%'
        OR l.referrer ILIKE '%google.com/gemini%'          THEN 'llm_gemini'
      WHEN l.referrer ILIKE '%claude.ai%'                  THEN 'llm_claude'
      WHEN l.referrer ILIKE '%copilot.microsoft%'          THEN 'llm_copilot'
      WHEN l.gclid IS NOT NULL OR l.utm_medium = 'cpc'     THEN 'paid_search'
      WHEN l.fbclid IS NOT NULL
        OR l.utm_medium IN ('paid_social', 'social-paid')  THEN 'paid_social'
      WHEN l.referrer ILIKE '%google.com%'
        OR l.utm_medium = 'organic'                        THEN 'organic_google'
      WHEN l.referrer ILIKE '%bing.com%'                   THEN 'organic_bing'
      WHEN l.referrer IS NULL OR l.referrer = ''           THEN 'direct'
      ELSE 'referral_other'
    END AS channel,
    REGEXP_REPLACE(REGEXP_REPLACE(l.source_page, '^https?://[^/]+', ''), '\?.*$', '') AS page_path
  FROM public.leads l
  WHERE l.created_at >= NOW() - (INTERVAL '1 day' * :days)
),
page_rollup AS (
  SELECT
    page_path,
    channel,
    COUNT(*)                                                                            AS total_leads,
    COUNT(*) FILTER (WHERE status = 'won')                                              AS won_leads,
    -- Realized revenue (won + paid balance)
    SUM(margin) FILTER (WHERE status = 'won' AND final_payment_received_at IS NOT NULL) AS margin_paid,
    -- Booked revenue (won, awaiting payment)
    SUM(margin) FILTER (WHERE status = 'won' AND final_payment_received_at IS NULL)     AS margin_booked,
    -- Pipeline (in flight)
    SUM(job_value) FILTER (WHERE status IN ('contacted', 'estimated'))                  AS pipeline_value,
    -- Time-to-pay average for paid leads
    AVG(EXTRACT(DAY FROM (final_payment_received_at - won_at)))
      FILTER (WHERE final_payment_received_at IS NOT NULL)                              AS avg_days_won_to_paid
  FROM leads_window
  WHERE page_path IS NOT NULL AND page_path != ''
  GROUP BY page_path, channel
)
SELECT
  page_path,
  channel,
  total_leads,
  won_leads,
  COALESCE(margin_paid, 0)::numeric                          AS margin_paid,
  COALESCE(margin_booked, 0)::numeric                        AS margin_booked,
  COALESCE(pipeline_value, 0)::numeric                       AS pipeline_value,
  ROUND(avg_days_won_to_paid::numeric, 1)                    AS avg_days_won_to_paid
FROM page_rollup
ORDER BY (COALESCE(margin_paid, 0) + COALESCE(margin_booked, 0)) DESC NULLS LAST;
```

Plus a parallel query for **lead-to-pay ratio** + **30-day forecast**:

```sql
-- Lead-to-pay ratio (overall, not per-page)
SELECT
  COUNT(*) FILTER (WHERE status = 'won')                                                AS won_total,
  COUNT(*) FILTER (WHERE status = 'won' AND final_payment_received_at IS NOT NULL)      AS won_paid,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'won' AND final_payment_received_at IS NOT NULL)::numeric
    / NULLIF(COUNT(*) FILTER (WHERE status = 'won'), 0) * 100,
    1
  ) AS pay_realization_pct,
  AVG(EXTRACT(DAY FROM (final_payment_received_at - won_at)))
    FILTER (WHERE final_payment_received_at IS NOT NULL)                                AS avg_days_won_to_paid_overall
FROM public.leads
WHERE created_at >= NOW() - (INTERVAL '1 day' * :days);

-- 30-day forecast (won leads with estimated_completion_date in next 30 days)
SELECT
  COUNT(*)                                                                              AS jobs_due_next_30d,
  SUM(margin)::numeric                                                                  AS forecast_margin,
  jsonb_agg(
    jsonb_build_object(
      'lead_id', id,
      'name', name,
      'estimated_completion_date', estimated_completion_date,
      'margin', margin,
      'balance_due', balance_due,
      'days_until', EXTRACT(DAY FROM (estimated_completion_date - CURRENT_DATE))::int
    ) ORDER BY estimated_completion_date ASC
  ) AS jobs
FROM public.leads
WHERE status = 'won'
  AND estimated_completion_date IS NOT NULL
  AND estimated_completion_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
  AND final_payment_received_at IS NULL;
```

---

## 7. Edge function endpoint shape

Extend existing `weekly-report` edge function with a new action:

`GET /functions/v1/weekly-report?action=revenue&key=...&pin=...&days=90`

Response shape:

```json
{
  "user": { "name": "...", "role": "..." },
  "window_days": 90,
  "current": {
    "summary": {
      "margin_paid_total": 36000,
      "margin_booked_total": 108000,
      "pipeline_value_total": 250000,
      "won_total": 1,
      "won_paid": 0,
      "pay_realization_pct": 0,
      "avg_days_won_to_paid_overall": null,
      "data_confidence": "insufficient",
      "min_n_for_confidence": 10
    },
    "pages": [
      {
        "page_path": "/blog/utah/local-roofer-vs-storm-chaser-utah",
        "channels": {
          "organic_google": { "total_leads": 1, "won_leads": 1, "margin_paid": 0, "margin_booked": 36000 },
          "llm_chatgpt": { "total_leads": 0, "won_leads": 0, "margin_paid": 0, "margin_booked": 0 }
        },
        "page_total_margin": 36000,
        "page_total_leads": 1,
        "page_won_leads": 1
      }
    ],
    "channel_rollup": {
      "organic_google": { "total_leads": 1, "won_leads": 1, "margin_paid": 0, "margin_booked": 36000 },
      "paid_search": { "total_leads": 0, "won_leads": 0, "margin_paid": 0, "margin_booked": 0 },
      "...": "..."
    },
    "forecast_30d": {
      "jobs_due_next_30d": 1,
      "forecast_margin": 36000,
      "jobs": [
[REDACTED 2026-08-07: customer-identifying operational and financial detail removed from the public repository.]
      ]
    }
  },
  "prior": { "...same shape as current..." },
  "deltas": {
    "margin_paid_total_delta_pct": null,
    "margin_booked_total_delta_pct": null,
    "pay_realization_pct_delta_pp": null,
    "note": "insufficient prior-period data — collecting baseline"
  },
  "attribution_model": "last_touch_source_page",
  "generated_at": "2026-05-17T..."
}
```

**Caching:** 5-min Supabase function-level cache. Dashboard adds 60-min sessionStorage on top.

---

## 8. Dashboard tile design

New section in `/dashboard/`, between **Biggest Movers** and **Site Health**. Follows existing Phase 2 tile pattern.

```
┌─ 💰 REVENUE ATTRIBUTION (last 90d) ────────────────────────────────────────┐
│                                                                            │
│  $36,000 paid · $108,000 booked · $250,000 pipeline · pay realization 0%   │
│  ⚠️ Insufficient data (N=1 won lead). Collecting baseline.                  │
│                                                                            │
│  🏆 TOP EARNERS                  💼 BOOKED, AWAITING PAY                    │
[REDACTED 2026-08-07: customer-identifying operational and financial detail removed from the public repository.]
│   $36k · 1 won · organic            est. complete 6/05 (T+19)               │
│   ...                               ...                                     │
│                                                                            │
│  🌱 ORGANIC + LLM ATTRIBUTION (your work, your money)                       │
│   organic_google: $36k · llm_*: $0 · direct: $0 · bing: $0                  │
│                                                                            │
│  📊 PIPELINE VALUE                ⏱️ LEAD-TO-PAY METRICS                    │
│   /pages/insurance-claims           Pay realization: 0% (N=1)               │
│   $0 · 0 contacted/estimated        Avg days won → paid: — (no data yet)    │
│   ...                                                                       │
│                                                                            │
│  🗓️ FORECAST NEXT 30 DAYS                                                   │
[REDACTED 2026-08-07: customer-identifying operational and financial detail removed from the public repository.]
│                                                                            │
│  Last-touch attribution. Source: leads + phone_clicks. Updated 2 min ago.   │
└────────────────────────────────────────────────────────────────────────────┘
```

**Edge cases handled:**

1. **N < 10 won leads** → "Insufficient data (N=X). Collecting baseline." Display data with the warning, don't hide.
2. **No prior period data** → "collecting baseline" instead of delta arrows
3. **No paid leads yet** → "Pay realization: 0% (N won = X)" with explainer tooltip
4. **`estimated_completion_date` past due** → red chip in forecast list
5. **`final_payment_received_at` null + won > 60 days** → "⏰ Follow up — payment status unknown" callout in Booked panel

**Interaction:**
- Time range follows the existing global toggle (7/30/60/90)
- Click any page row → opens a detail modal with all leads from that page
- Click any channel → filters the page list to that channel
- Hover any lead in forecast → shows full lead detail card

---

## 9. Implementation sequencing (Codex's work on return 5/19)

### Phase 1 — Schema parity (Utah catches up to TX v2)
1. New migration `supabase/migrations/20260518_add_payment_forecast_columns.sql`:
   - `ADD COLUMN IF NOT EXISTS estimated_completion_date date`
   - `ADD COLUMN IF NOT EXISTS final_payment_received_at timestamptz`
2. Apply via `supabase db push --project-ref hdcflshhomzildwqlmwh`
[REDACTED 2026-08-07: customer-identifying operational and financial detail removed from the public repository.]

### Phase 2 — Lead-crm v7 + leads.html
1. Add `final_payment_received_at` + `estimated_completion_date` to lead-crm SELECT (line 71-78 area)
2. Add UPDATE handlers for both columns
3. Add two new fields to leads.html drawer Job pipeline panel
4. Test locally: deno check + manual curl
5. Deploy lead-crm v7

### Phase 3 — Attribution join cron
1. New Supabase scheduled function `update-attribution-joins`
2. Runs every 5 min
3. Handles Case A (phone-in leads → phone_clicks)
4. Logs match counts + leaves matched_lead_id unset if no candidate

### Phase 4 — Weekly-report `?action=revenue` endpoint
1. Add to `supabase/functions/weekly-report/index.ts`
2. Returns the JSON shape from §7
3. Parameterized by `days` (7/30/60/90)
4. Parallel current + prior queries (matches existing pattern)
5. PIN auth same as existing actions

### Phase 5 — Dashboard tile JS
1. Add Revenue Attribution section to `dashboard/dashboard.js` between Biggest Movers and Site Health
2. Loader function reads `revenue_by_page` from response
3. Renders all 5 sub-panels per §8
4. 60-min sessionStorage cache
5. Silent-fail if endpoint unreachable
6. Low-N display per §8 edge cases

### Phase 6 — Verification
1. Run with N=1 (Greg) — verify "insufficient data" displays correctly
2. Wait for N≥10 won leads (could be 60-90 days for Frame Utah at current volume) — verify confidence label switches
3. Run with prior-period data — verify delta arrows
4. Mobile responsive check
5. Lighthouse score regression check on /dashboard/

---

## 10. Acceptance criteria

Ships when:
1. Utah migration adds the 2 new columns without breaking the lead-crm SELECT/UPDATE
2. `update-attribution-joins` cron runs cleanly with zero matches expected (no current phone-in leads to test against — fires when Landon logs first one)
3. `weekly-report?action=revenue&days=90` returns the JSON shape from §7 with Greg's data
4. Dashboard renders the new section with "Insufficient data (N=1)" warning
5. All existing dashboard tiles unaffected (Biggest Movers / Site Health / Storm Watch / Top Pages still work)
6. PageSpeed Insights perf score on `/dashboard/` doesn't regress > 2 points
7. PIN auth unchanged (existing Landon/Ryan PINs still work)

---

## 11. Honest limitations

| Limitation | Severity | Mitigation |
|---|---|---|
| Last-touch attribution only | Medium | Labeled in footer; v1 adds multi-touch via PostHog session join |
[REDACTED 2026-08-07: customer-identifying operational and financial detail removed from the public repository.]
| `final_payment_received_at` requires Landon discipline | High — single point of failure | Weekly reminder + "follow up" callout if won > 60 days unpaid |
| `estimated_completion_date` requires Landon to set + adjust | Medium | Default suggestion = job_started_at + 14 days; surface past-due chip |
| LLM referrers often strip referrer | Medium | Direct traffic partial proxy; Connor/Landon can manually tag known LLM-sourced leads in notes |
| No paid-ad-spend deduction | Medium | Tile shows gross margin; net-of-spend is v1 |
| Cross-device journey invisible | Low (mobile-first market) | Most local-services traffic is single-device |
| Greg's data may show wrong channel (his lead pre-dates attribution capture) | Low — historical edge case | Manual override field for backfilled leads |

---

## 12. v1 roadmap (after v0 validates)

1. **Multi-touch attribution** — join PostHog session journeys to leads, show first-touch + last-touch + assist
2. **Net-of-spend margin** — subtract ad spend from paid_* channel margins for true ROAS
3. **Per-page cost** — attribute SEO investment (content, audits) per page → ROI per page
4. **Cross-client benchmarking** — compare Frame Utah revenue/page to Frame TX and other clients (anonymized)
5. **TX rollout** — port via Track D propagation once v0 proves the loop
6. **Predictive forecast** — extend 30-day forecast to use historical pay-realization rate

---

## 13. Where this design lives

- **This file:** `~/projects/frame-restoration-utah/data/REVENUE-TILE-DESIGN-2026-05-17.md` (canonical, in the repo it implements against)
- **Memory mirror:** `~/.claude/projects/-Users-agenticmac/memory/cbp-track-e-v0-revenue-attribution-design-2026-05-17.md` (for cross-session continuity)
- **Implementation tracker:** referenced from `customer-build-platform-state.md` Track E section

---

## 14. Open decisions for Ryan

1. **Default time window** — 30 or 90 days? (Currently 90 for "first paid lead" visibility; 30 better for ongoing operational view once volume grows.)
2. **Tile position** — between Biggest Movers and Site Health (proposed) or top of dashboard (most-prominent)?
3. **N≥10 threshold for "sufficient confidence"** — too high? too low? Could be N≥5 if you want signal sooner.
4. **`final_payment_received_at` reminder cadence** — weekly email to Landon listing won leads with no payment stamp 60+ days old?
5. **Manual override for backfilled leads (like Greg)** — should the UI let Landon manually tag a lead's channel after the fact, since his lead pre-dates `referrer` capture?

---

## 15. What Codex implements on return (handoff packet)

Continue Track E v0 implementation on Frame Utah.

Repo: `/Users/agenticmac/projects/frame-restoration-utah`

Read first:
- `data/REVENUE-TILE-DESIGN-2026-05-17.md` (this file)
- `supabase/functions/lead-crm/index.ts` (current v6)
- `supabase/functions/weekly-report/` (current implementation)
- `dashboard/dashboard.js` (current tile patterns)
- `~/projects/frame-restoration-texas/supabase/migrations/20260517_leads_table_init.sql` (TX schema parity reference)

Tasks (in order):
1. Schema migration: add `estimated_completion_date` + `final_payment_received_at`
2. lead-crm v7: read/write the new columns
3. leads.html drawer: 2 new fields in Job pipeline panel
4. `update-attribution-joins` scheduled fn
5. weekly-report `?action=revenue` endpoint
6. dashboard.js Revenue Attribution section

Hard boundaries:
- No remote deploy without approval
- No production data mutation outside the standard `/leads` CRM flow
- Don't change existing dashboard tiles
- PIN auth unchanged

Acceptance:
- All §10 criteria
- typecheck + deno check + brand-audit pass
- Manual curl verifies the new endpoint
- Dashboard renders with Greg's data showing the warning state

Output expected:
- Files changed
- Validation passed
- What's deferred
- Open questions if any new ones emerged

End of design doc.
