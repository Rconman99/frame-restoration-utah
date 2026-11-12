-- AI-search referrer tagging on leads (form submits) and phone_clicks
-- (phone taps). Landing page, referrer and UTMs are already captured by the
-- site script + track-click/handle-lead; this adds a derived `ai_referrer`
-- tag so AI-search traffic (ChatGPT, Perplexity, Gemini, Copilot, Claude...)
-- can be counted without regex at report time.
-- MIGRATION FILE ONLY — not applied. Additive + idempotent. The trigger fills
-- the tag on every insert regardless of which code path wrote the row, so no
-- edge-function deploy is required. The trailing UPDATEs backfill history.

create or replace function public.frame_ai_referrer(ref text, utm text)
returns text
language sql
immutable
as $$
  select case
    when s ~ '(chatgpt\.com|chat\.openai\.com)' or s ~ '(^|\s)chatgpt' then 'chatgpt'
    when s ~ 'perplexity(\.ai)?'                                    then 'perplexity'
    when s ~ '(gemini\.google\.com|bard\.google\.com|(^|\s)gemini)' then 'gemini'
    when s ~ '(copilot\.microsoft\.com|(^|\s)copilot|bing\.com/chat)' then 'copilot'
    when s ~ '(claude\.ai|(^|\s)claude)'                            then 'claude'
    when s ~ '(you\.com|phind\.com|kagi\.com/assistant|meta\.ai|grok\.com|x\.com/i/grok|deepseek\.com|chat\.mistral\.ai)' then 'other_ai'
    else null
  end
  from (select lower(coalesce(ref, '') || ' ' || coalesce(utm, '')) as s) t
$$;

comment on function public.frame_ai_referrer(text, text) is
  'Maps a referrer URL + utm_source to an AI-search tag (chatgpt|perplexity|gemini|copilot|claude|other_ai) or NULL.';

create or replace function public.frame_set_ai_referrer()
returns trigger
language plpgsql
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
