-- ONLY for an empty disposable test database. Never apply to a market project.
--
-- Contract for supabase/migrations/20261027230000_ai_referrer_tagging.sql.
-- Precondition: the REAL Utah baselines are applied first, in this order:
--   supabase/migrations/20260401000003_baseline_leads.sql
--   supabase/migrations/20260401000004_baseline_phone_clicks.sql
--   supabase/migrations/20260510_add_attribution_columns.sql
-- so the migration is exercised against the real column set: leads carries
-- referrer / landing_page / utm_source, phone_clicks carries referrer /
-- utm_source and has NO landing_page (the migration's to_jsonb lookup reads
-- that as NULL). After this file the migration is applied TWICE, then
-- supabase/tests/ai_referrer_tagging.sql asserts.
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;

-- Every UPDATE the backfill performs is recorded, so the contract can prove it
-- touches only rows that resolve to a tag, never overwrites a tag, and does
-- nothing on a second application.
create table public.ai_referrer_update_log(
  table_name text not null,
  row_id     bigint not null,
  old_tag    text,
  new_tag    text,
  logged_at  timestamptz not null default now()
);
create function public.log_ai_referrer_update() returns trigger
language plpgsql as $$
begin
  -- to_jsonb tolerates the column not existing yet (the migration adds it).
  insert into public.ai_referrer_update_log(table_name, row_id, old_tag, new_tag)
  values (tg_table_name, new.id, to_jsonb(old) ->> 'ai_referrer', to_jsonb(new) ->> 'ai_referrer');
  return new;
end $$;
create trigger leads_log_ai_referrer_update after update on public.leads
  for each row execute function public.log_ai_referrer_update();
create trigger phone_clicks_log_ai_referrer_update after update on public.phone_clicks
  for each row execute function public.log_ai_referrer_update();

-- Synthetic history rows written BEFORE the migration exists (no ai_referrer
-- column yet), so the backfill has real work to do. No real people; 555 numbers.
-- The expected tag lives in the label (name / page_title): 8 of 13 leads and
-- 4 of 7 phone clicks resolve, the rest must stay NULL.
insert into public.leads(name, phone, source_page, referrer, landing_page, utm_source) values
  ('L-chatgpt-ref',    '+18015550101', 'test', 'https://chatgpt.com/',                         null, null),
  ('L-openai-ref',     '+18015550102', 'test', 'https://chat.openai.com/c/abc',                null, null),
  ('L-perplexity-ref', '+18015550103', 'test', 'https://www.perplexity.ai/search?q=roofers',   null, null),
  ('L-gemini-ref',     '+18015550104', 'test', 'https://gemini.google.com/app',                null, null),
  ('L-copilot-utm',    '+18015550105', 'test', null, '/roof-repair?utm_source=copilot',          'copilot'),
  ('L-claude-landing', '+18015550106', 'test', null, '/?utm_source=claude.ai&utm_medium=referral', null),
  ('L-other-ai-ref',   '+18015550107', 'test', 'https://you.com/search?q=heber+roofing',       null, null),
  ('L-case-fold',      '+18015550108', 'test', 'HTTPS://ChatGPT.com/',                         null, null),
  ('L-google-organic', '+18015550109', 'test', 'https://www.google.com/',                      null, null),
  ('L-gbp',            '+18015550110', 'test', 'https://www.google.com/maps/place/Frame',      null, null),
  ('L-direct',         '+18015550111', 'test', null, null, null),
  ('L-utm-google-cpc', '+18015550112', 'test', null, '/?gclid=abc', 'google'),
  ('L-facebook',       '+18015550113', 'test', 'https://l.facebook.com/',                      null, null);

insert into public.phone_clicks(click_type, phone, source_page, page_title, referrer, utm_source) values
  ('call', '+14352928802', '/', 'P-perplexity-ref', 'https://www.perplexity.ai/',           null),
  ('call', '+14352928802', '/', 'P-bing-chat-ref',  'https://www.bing.com/chat?q=roofer',   null),
  ('sms',  '+14352928802', '/', 'P-gemini-utm',     '',                                     'gemini'),
  ('call', '+14352928802', '/', 'P-grok-ref',       'https://x.com/i/grok?conversation=1',  null),
  ('call', '+14352928802', '/', 'P-bing-search',    'https://www.bing.com/search?q=roofer', null),
  ('call', '+14352928802', '/', 'P-direct',         '',                                     null),
  ('sms',  '+14352928802', '/', 'P-duckduckgo',     'https://duckduckgo.com/',              null);
