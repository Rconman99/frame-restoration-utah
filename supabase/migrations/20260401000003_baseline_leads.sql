-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 0 HARDENED BASELINE — leads (core CRM table)
-- Authored 2026-06-14 from live schema capture.
--
-- COMPOSITION CONTRACT (do not break):
--   This baseline creates the pre-attribution `leads` shape PLUS the columns that
--   were applied to live only via the Supabase SQL editor (margin, city, commission,
--   tier*, post-won lifecycle) and never had a migration.
--   It deliberately OMITS:
--     • the 15 ad-attribution columns + won_at  → added by 20260510_add_attribution_columns.sql
--       (its `ADD COLUMN IF NOT EXISTS` is a clean no-op here on a fresh DB)
--     • sms_consent                              → added by 20260610_sms_consent_and_auth_throttle.sql
--   So on a fresh territory project: this file runs first, then 20260510 / 20260610
--   add their columns. leads_status_check is added by 20260510 inside a
--   duplicate_object-swallowing DO block, so defining it here too is safe.
--
-- leads.id confirmed bigint identity. commission is a STORED generated column whose
-- city-aware rate (5% Heber/Midway, 10% elsewhere) is the one Utah-specific divergence
-- in the schema (a sibling territory template may use a flat rate). Verbatim from live.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.leads (
  id                   bigint generated always as identity,
  created_at           timestamptz default now(),
  name                 text not null,
  email                text,
  phone                text,
  address              text,
  service              text,
  message              text,
  source_page          text,
  status               text default 'new',
  job_value            numeric,
  notes                text,

  -- review lifecycle
  job_completed_at     timestamptz,
  review_requested_at  timestamptz,
  review_link_clicked  boolean default false,

  -- classifier (set by handle-lead)
  tier                 text not null default 'unclassified',
  tier_reason          text,
  tier_confidence      numeric(3,2),
  tier_classifier      text,

  -- commission inputs + generated output (Utah-specific city-aware rate)
  margin               numeric,
  city                 text,
  commission           numeric generated always as (
    case
      when lower(btrim(coalesce(city, ''))) = any (array['heber'::text, 'heber city'::text, 'midway'::text])
        then coalesce(margin, 0) * 0.05
      else coalesce(margin, 0) * 0.10
    end
  ) stored,

  -- post-won job pipeline
  deposit_received_at  timestamptz,
  deposit_amount       numeric,
  install_scheduled_for date,
  job_started_at       timestamptz,
  balance_due          numeric,
  contract_url         text,
  warranty_doc_url     text,
  product              text,

  constraint leads_pkey primary key (id),
  constraint leads_status_check check (
    status is null or status = any (array['new'::text, 'contacted'::text, 'estimated'::text, 'won'::text, 'lost'::text])
  ),
  constraint leads_tier_check check (
    tier = any (array['emergency'::text, 'urgent'::text, 'scheduled'::text, 'general'::text, 'spam'::text, 'unclassified'::text])
  )
);

comment on table public.leads is
  'Core CRM lead row. commission is GENERATED (never UPDATE directly — write margin/city). Attribution columns + sms_consent are added by later migrations.';
comment on column public.leads.commission is
  'Auto: margin*0.05 Heber/Midway, margin*0.10 elsewhere. GENERATED STORED. Utah-specific city-aware rate.';

create index if not exists leads_tier_idx on public.leads using btree (tier, created_at desc);
