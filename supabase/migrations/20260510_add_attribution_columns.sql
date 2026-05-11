-- Frame Roofing Utah — add ad attribution columns to leads
-- Date: 2026-05-10
-- Purpose: Unblock closed-loop attribution. Without gclid/fbclid persistence,
-- Google Ads Offline Conversion Import + Meta Conversions API uploads are
-- impossible. Form-side capture handled by /track-attribution.js, server-side
-- persistence handled by handle-lead v7+ (updated in same PR).
--
-- All additions nullable + additive. Existing handle-lead inserts will succeed
-- unchanged. Existing 15 rows untouched.
--
-- Apply via Supabase CLI:
--   supabase db push --project-ref hdcflshhomzildwqlmwh
-- Or via MCP / SQL editor:
--   paste the body of this file into the SQL Editor at
--   https://supabase.com/dashboard/project/hdcflshhomzildwqlmwh/sql

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS gclid                      text,
  ADD COLUMN IF NOT EXISTS fbclid                     text,
  ADD COLUMN IF NOT EXISTS msclkid                    text,
  ADD COLUMN IF NOT EXISTS gbraid                     text,
  ADD COLUMN IF NOT EXISTS wbraid                     text,
  ADD COLUMN IF NOT EXISTS utm_source                 text,
  ADD COLUMN IF NOT EXISTS utm_medium                 text,
  ADD COLUMN IF NOT EXISTS utm_campaign               text,
  ADD COLUMN IF NOT EXISTS utm_term                   text,
  ADD COLUMN IF NOT EXISTS utm_content                text,
  ADD COLUMN IF NOT EXISTS landing_page               text,
  ADD COLUMN IF NOT EXISTS referrer                   text,
  ADD COLUMN IF NOT EXISTS won_at                     timestamptz,
  ADD COLUMN IF NOT EXISTS uploaded_to_google_ads_at  timestamptz,
  ADD COLUMN IF NOT EXISTS uploaded_to_meta_capi_at   timestamptz;

-- Column comments for downstream tooling / dashboard / future-you context
COMMENT ON COLUMN public.leads.gclid                     IS 'Google Ads click identifier. Required for Offline Conversion Import API uploads. 90-day validity window.';
COMMENT ON COLUMN public.leads.fbclid                    IS 'Meta (Facebook) click identifier. Used in Conversions API event_id for click-to-conversion dedup.';
COMMENT ON COLUMN public.leads.msclkid                   IS 'Microsoft (Bing) Ads click identifier.';
COMMENT ON COLUMN public.leads.gbraid                    IS 'Google Ads enhanced conversion ID — iOS web/app post-IDFA.';
COMMENT ON COLUMN public.leads.wbraid                    IS 'Google Ads enhanced conversion ID — web post-cookie restrictions (newer alternative to gclid).';
COMMENT ON COLUMN public.leads.utm_source                IS 'First-touch UTM source for this session (e.g. google, meta, yelp).';
COMMENT ON COLUMN public.leads.utm_medium                IS 'First-touch UTM medium (e.g. cpc, lsa, organic, social).';
COMMENT ON COLUMN public.leads.utm_campaign              IS 'First-touch UTM campaign identifier.';
COMMENT ON COLUMN public.leads.utm_term                  IS 'First-touch UTM term — keyword from paid search if passed.';
COMMENT ON COLUMN public.leads.utm_content               IS 'First-touch UTM content variant — ad creative / placement identifier.';
COMMENT ON COLUMN public.leads.landing_page              IS 'First page URL (path + search) the user hit this session — distinct from source_page (page where form submit happened).';
COMMENT ON COLUMN public.leads.referrer                  IS 'External document.referrer captured once per session.';
COMMENT ON COLUMN public.leads.won_at                    IS 'Timestamp lead.status flipped to "won". Distinct from job_completed_at which is when physical work finished. Fires the offline-conversion-sync.';
COMMENT ON COLUMN public.leads.uploaded_to_google_ads_at IS 'When the closed-won event was successfully uploaded to Google Ads Offline Conversion Import.';
COMMENT ON COLUMN public.leads.uploaded_to_meta_capi_at  IS 'When the closed-won event was successfully sent to Meta Conversions API.';

-- Partial index for offline-conversion-sync worker. Daily job will scan only
-- rows where status='won' AND gclid IS NOT NULL AND uploaded_to_google_ads_at IS NULL.
CREATE INDEX IF NOT EXISTS leads_pending_google_ads_sync_idx
  ON public.leads (status, uploaded_to_google_ads_at)
  WHERE status = 'won' AND gclid IS NOT NULL AND uploaded_to_google_ads_at IS NULL;

CREATE INDEX IF NOT EXISTS leads_pending_meta_capi_sync_idx
  ON public.leads (status, uploaded_to_meta_capi_at)
  WHERE status = 'won' AND fbclid IS NOT NULL AND uploaded_to_meta_capi_at IS NULL;

-- Optional safety: enumerate status values so misclassified writes surface
-- early. Existing 15 rows all status='new' — safe to add. Skipped if values
-- ever drift outside the set (raises notice, doesn't error).
DO $$
BEGIN
  ALTER TABLE public.leads
    ADD CONSTRAINT leads_status_check
    CHECK (status IS NULL OR status = ANY (ARRAY[
      'new'::text, 'contacted'::text, 'estimated'::text,
      'won'::text, 'lost'::text
    ]));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN check_violation THEN
    RAISE NOTICE 'Existing rows have status values outside the expected set; skipping check constraint.';
END $$;
