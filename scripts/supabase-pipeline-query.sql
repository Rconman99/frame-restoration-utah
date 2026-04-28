-- Frame Roofing Utah — Lead → Quote → Win pipeline by city
-- Project: hdcflshhomzildwqlmwh (frame-roofing-utah, us-west-1)
-- Run in: Supabase SQL Editor → New Query → paste → Run
--
-- Output: per-city volume, conversion rates, AND real avg/median job value.
-- Replaces the audit's $50K-150K Park City / $25K-60K Heber estimated ranges
-- with measured numbers from Frame's actual closed jobs.
--
-- Definition of "won": status = 'won'. Adjust if your status enum uses a
-- different terminal value (e.g., 'completed', 'invoiced').

WITH leads_180d AS (
  SELECT
    id,
    created_at,
    name,
    address,
    service,
    source_page,
    status,
    job_value,
    -- Try several extraction strategies for city
    COALESCE(
      NULLIF(metadata->>'city', ''),
      NULLIF(regexp_replace(source_page, '^/locations/([a-z-]+).*$', '\1'), source_page),
      'unspecified'
    ) AS city
  FROM leads
  WHERE created_at >= NOW() - INTERVAL '180 days'
)
SELECT
  city,
  COUNT(*)                                                                AS total_leads,
  COUNT(*) FILTER (WHERE status IN ('quoted', 'won', 'in_progress'))      AS quoted_or_better,
  COUNT(*) FILTER (WHERE status = 'won')                                  AS won,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'won')::numeric
    / NULLIF(COUNT(*), 0) * 100,
    1
  )                                                                       AS lead_to_won_pct,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'won')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE status IN ('quoted', 'won', 'in_progress')), 0) * 100,
    1
  )                                                                       AS quote_to_won_pct,
  ROUND(AVG(job_value) FILTER (WHERE status = 'won')::numeric, 0)         AS avg_won_job_value,
  ROUND(
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY job_value)
      FILTER (WHERE status = 'won')::numeric,
    0
  )                                                                       AS median_won_job_value,
  ROUND(MIN(job_value) FILTER (WHERE status = 'won')::numeric, 0)         AS min_won_job_value,
  ROUND(MAX(job_value) FILTER (WHERE status = 'won')::numeric, 0)         AS max_won_job_value,
  ROUND(SUM(job_value) FILTER (WHERE status = 'won')::numeric, 0)         AS total_won_revenue
FROM leads_180d
GROUP BY city
HAVING COUNT(*) >= 1
ORDER BY total_leads DESC;

-- Bonus query — Channel attribution (run separately if UTM tagging is live)
--
-- WITH leads_90d AS (
--   SELECT
--     id, created_at, status, job_value,
--     COALESCE(metadata->>'utm_source', 'organic-or-direct') AS channel,
--     COALESCE(metadata->>'utm_campaign', '-') AS campaign
--   FROM leads
--   WHERE created_at >= NOW() - INTERVAL '90 days'
-- )
-- SELECT
--   channel,
--   COUNT(*) AS leads,
--   COUNT(*) FILTER (WHERE status = 'won') AS won,
--   ROUND(AVG(job_value) FILTER (WHERE status = 'won'), 0) AS avg_job
-- FROM leads_90d
-- GROUP BY channel
-- ORDER BY leads DESC;
