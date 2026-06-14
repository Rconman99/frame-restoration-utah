-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 0 HARDENED BASELINE — phone_clicks (tel:/sms: click attribution)
-- Authored 2026-06-14 from live schema capture. id = bigint identity.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.phone_clicks (
  id           bigint generated always as identity,
  created_at   timestamptz default now(),
  click_type   text not null,
  phone        text,
  source_page  text,
  page_title   text,
  referrer     text,
  source       text,
  user_agent   text,
  ip           text,
  gclid        text,
  gbraid       text,
  wbraid       text,
  fbclid       text,
  msclkid      text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_term     text,
  utm_content  text,
  city         text,
  notes        text,
  constraint phone_clicks_pkey primary key (id),
  constraint phone_clicks_click_type_check check (click_type = any (array['call'::text, 'sms'::text]))
);

create index if not exists phone_clicks_created_at_idx on public.phone_clicks using btree (created_at desc);
create index if not exists phone_clicks_source_idx on public.phone_clicks using btree (source);
create index if not exists phone_clicks_type_idx on public.phone_clicks using btree (click_type);
