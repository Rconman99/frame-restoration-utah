-- Call-source attribution for commission tracking.
-- Each inbound-call lead records which public tracking number it came in on so the
-- CRM can split leads into Ryan's commission vs not:
--   • call_source: 'google_website' (GBP + website NAP) | 'directory' | 'unknown'
--   • commission_eligible: true only for Google + website calls (Ryan's commission);
--     directory tracking lines (HomeAdvisor / Yelp / Angi / etc.) are false.
-- Additive + idempotent: nullable, no default, no constraint — existing inserts and
-- the GENERATED `commission` column (margin-based) are unaffected. Apply BEFORE
-- deploying the updated handle-call function (the insert references these columns).
alter table public.leads add column if not exists call_source text;
alter table public.leads add column if not exists commission_eligible boolean;
