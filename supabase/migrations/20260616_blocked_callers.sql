-- Phase 0 spam-call mitigation: blocklist of known repeat spam callers.
-- handle-call checks this table on every inbound call; matches get a polite
-- hangup (no Landon ring, no auto-created lead). Curated manually / from /leads.
-- handle-call fails OPEN if this table is absent, so applying this migration is
-- not a hard prerequisite for the deploy — but apply it so the blocklist works.
create table if not exists public.blocked_callers (
  phone      text primary key,                      -- E.164, e.g. +18333380180
  reason     text,
  source     text not null default 'manual',        -- 'manual' | 'seed' | 'crm'
  created_at timestamptz not null default now()
);

-- Seed: the cold-pitch SEO solicitation already auto-classified spam (2026-05-16).
insert into public.blocked_callers (phone, reason, source)
values ('+18333380180', 'cold-pitch SEO solicitation (auto-classified spam 2026-05-16)', 'seed')
on conflict (phone) do nothing;

-- Lock down like every other internal table (matches processed_webhooks + the
-- baseline-hardened-RLS posture): RLS on with NO policies → anon/authenticated are
-- denied; service_role keeps access via BYPASSRLS. handle-call reads this with the
-- service-role key, so the blocklist keeps working while staying invisible to the
-- public anon key. Safe on live Utah too — a brand-new table has no anon flow to break.
alter table public.blocked_callers enable row level security;
revoke all on table public.blocked_callers from anon, authenticated;
grant all on table public.blocked_callers to service_role;
