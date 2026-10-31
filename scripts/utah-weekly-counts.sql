-- Supplied by utah-weekly-counts.mjs as quoted psql variables.
-- Half-open window: start inclusive, end exclusive. Eight counts, in this order.
SELECT COUNT(*) AS calls_total
FROM public.call_logs
WHERE is_test IS NOT TRUE
  AND created_at >= :'window_start'::timestamptz
  AND created_at < :'window_end'::timestamptz;

SELECT COUNT(*) AS calls_answered
FROM public.call_logs
WHERE is_test IS NOT TRUE
  AND created_at >= :'window_start'::timestamptz
  AND created_at < :'window_end'::timestamptz
  AND status = 'completed' AND duration_seconds > 0;

SELECT COUNT(*) AS calls_with_lead
FROM public.call_logs
WHERE is_test IS NOT TRUE
  AND created_at >= :'window_start'::timestamptz
  AND created_at < :'window_end'::timestamptz
  AND lead_id IS NOT NULL;

SELECT COUNT(*) AS leads_total
FROM public.leads
WHERE is_test IS NOT TRUE
  AND created_at >= :'window_start'::timestamptz
  AND created_at < :'window_end'::timestamptz;

SELECT COUNT(*) AS leads_with_city
FROM public.leads
WHERE is_test IS NOT TRUE
  AND created_at >= :'window_start'::timestamptz
  AND created_at < :'window_end'::timestamptz
  AND city ~ '[^[:space:]]';

SELECT COUNT(*) AS leads_with_city_and_source
FROM public.leads
WHERE is_test IS NOT TRUE
  AND created_at >= :'window_start'::timestamptz
  AND created_at < :'window_end'::timestamptz
  AND city ~ '[^[:space:]]'
  AND (source_page ~ '[^[:space:]]' OR utm_source ~ '[^[:space:]]');

-- Lifecycle events count even when the lead was created before this window.
SELECT COUNT(*) AS review_requests
FROM public.leads
WHERE is_test IS NOT TRUE
  AND review_requested_at >= :'window_start'::timestamptz
  AND review_requested_at < :'window_end'::timestamptz;

SELECT COUNT(*) AS won
FROM public.leads
WHERE is_test IS NOT TRUE
  AND won_at >= :'window_start'::timestamptz
  AND won_at < :'window_end'::timestamptz;
