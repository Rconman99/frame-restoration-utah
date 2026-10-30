-- AI-search referrer tagging on leads (form submits) and phone_clicks
-- (phone taps). Landing page, referrer and UTMs are already captured by the
-- site script + track-click/handle-lead; this adds a derived `ai_referrer`
-- tag so AI-search traffic (ChatGPT, Perplexity, Gemini, Copilot, Claude...)
-- can be counted without regex at report time.
-- MIGRATION FILE ONLY — not applied. Additive + idempotent. The trigger fills
-- the tag on every insert regardless of which code path wrote the row, so no
-- edge-function deploy is required. The trailing UPDATEs backfill history.

-- Both functions pin search_path = '' like Utah's other public helpers (e.g.
-- resend_notification_status_rank in 20260807000100); every name they use is
-- built in or schema-qualified.
create or replace function public.frame_ai_referrer(ref text, utm text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    -- Hosts must start at a host/value boundary (start, space, '/', '.', '=') so
    -- thankyou.com or bayou.com never read as you.com; bare product words only
    -- count as a whole utm_source token (preceded by the separating space).
    when s ~ '(^|[\s/.=])(chatgpt\.com|chat\.openai\.com)' or s ~ '(^|\s)chatgpt' then 'chatgpt'
    when s ~ '(^|[\s/.=])perplexity\.ai' or s ~ '(^|\s)perplexity'     then 'perplexity'
    when s ~ '(^|[\s/.=])(gemini|bard)\.google\.com' or s ~ '(^|\s)gemini' then 'gemini'
    when s ~ '(^|[\s/.=])(copilot\.microsoft\.com|copilot\.cloud\.microsoft|bing\.com/chat)' or s ~ '(^|\s)copilot' then 'copilot'
    when s ~ '(^|[\s/.=])claude\.ai' or s ~ '(^|\s)claude'             then 'claude'
    when s ~ '(^|[\s/.=])(you\.com|phind\.com|kagi\.com/assistant|meta\.ai|grok\.com|x\.com/i/grok|deepseek\.com|chat\.mistral\.ai)' then 'other_ai'
    else null
  end
  from (select lower(coalesce(ref, '') || ' ' || coalesce(utm, '')) as s) t
$$;

comment on function public.frame_ai_referrer(text, text) is
  'Maps a referrer URL + utm_source to an AI-search tag (chatgpt|perplexity|gemini|copilot|claude|other_ai) or NULL.';

create or replace function public.frame_set_ai_referrer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare j jsonb := to_jsonb(new);
begin
  if new.ai_referrer is null then
    new.ai_referrer := public.frame_ai_referrer(
      coalesce(j ->> 'referrer', '') || ' ' || coalesce(j ->> 'landing_page', ''),
      j ->> 'utm_source');
  end if;
  return new;
end
$$;

-- Same pair as every other Utah function migration. The 2026-08-07 containment
-- (20260807000095) revokes EXECUTE through per-schema default privileges, which
-- cannot remove PostgreSQL's global PUBLIC EXECUTE on new functions, so without
-- this both functions are callable by anon/authenticated. Keep the grant: the
-- trigger calls the classifier as the inserting role (service_role on every
-- Utah write path), and a revoke without it makes every lead insert fail.
revoke all on function public.frame_ai_referrer(text, text) from public, anon, authenticated;
revoke all on function public.frame_set_ai_referrer() from public, anon, authenticated;
grant execute on function public.frame_ai_referrer(text, text) to service_role;

alter table public.leads add column if not exists ai_referrer text;
comment on column public.leads.ai_referrer is
  'Derived AI-search source tag from referrer/landing_page/utm_source (trigger-filled on insert).';
drop trigger if exists leads_set_ai_referrer on public.leads;
create trigger leads_set_ai_referrer before insert
  on public.leads for each row execute function public.frame_set_ai_referrer();

alter table public.phone_clicks add column if not exists ai_referrer text;
comment on column public.phone_clicks.ai_referrer is
  'Derived AI-search source tag from referrer/landing_page/utm_source (trigger-filled on insert).';
drop trigger if exists phone_clicks_set_ai_referrer on public.phone_clicks;
create trigger phone_clicks_set_ai_referrer before insert
  on public.phone_clicks for each row execute function public.frame_set_ai_referrer();

-- One-time backfill (runs when applied). Only rows that resolve to a tag are
-- touched, so ordinary rows see no UPDATE (and no update triggers fire).
update public.leads l
   set ai_referrer = t.tag
  from (select id, public.frame_ai_referrer(
                 coalesce(to_jsonb(x) ->> 'referrer', '') || ' ' || coalesce(to_jsonb(x) ->> 'landing_page', ''),
                 to_jsonb(x) ->> 'utm_source') as tag
          from public.leads x where x.ai_referrer is null) t
 where l.id = t.id and t.tag is not null;
update public.phone_clicks p
   set ai_referrer = t.tag
  from (select id, public.frame_ai_referrer(
                 coalesce(to_jsonb(x) ->> 'referrer', '') || ' ' || coalesce(to_jsonb(x) ->> 'landing_page', ''),
                 to_jsonb(x) ->> 'utm_source') as tag
          from public.phone_clicks x where x.ai_referrer is null) t
 where p.id = t.id and t.tag is not null;
