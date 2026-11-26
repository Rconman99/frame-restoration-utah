-- ONLY for an empty disposable test database. Never apply to a market project.
--
-- Proves that the rollback SQL printed in docs/runbooks/utah-lead-migrations.md
-- is the rollback that actually works: after it, the catalog and
-- supabase_migrations.schema_migrations AGREE, and no row was lost. The
-- 2026-11-26 review found the Texas runbook's documented rollback deleted the
-- history row while leaving the columns behind, which is the one state the
-- runner's own preflight treats as a hard stop.
--
-- Order: fixture, then the three targets applied in timestamp order, then this
-- file. The rollback statements below are a VERBATIM copy of the runbook's,
-- in the runbook's order (3 -> 2 -> 1). If one drifts, this contract fails.

\set ON_ERROR_STOP on

-- The runner is what records history in production; here the three rows are
-- inserted by hand so the rollback has history to remove.
insert into supabase_migrations.schema_migrations (version, name)
values ('20261027221000', 'lead_spam_classification'),
       ('20261027230000', 'ai_referrer_tagging'),
       ('20261122230000', 'leads_intake_zip_city_source')
on conflict (version) do nothing;

-- -------------------------------------------------- applied state, asserted --
do $$
declare v_leads bigint; v_clicks bigint;
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'leads'
         and column_name in ('spam_label', 'spam_score', 'spam_reason',
                             'spam_classifier', 'spam_classified_at')) <> 5 then
    raise exception 'ASSERT FAILED: the five leads.spam_* columns are not present before rollback';
  end if;
  if (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'leads'
       and indexname in ('leads_spam_unclassified_idx', 'leads_spam_label_created_idx')) <> 2 then
    raise exception 'ASSERT FAILED: the two spam indexes are not present before rollback';
  end if;
  if to_regprocedure('public.frame_ai_referrer(text,text)') is null
     or to_regprocedure('public.frame_set_ai_referrer()') is null then
    raise exception 'ASSERT FAILED: the AI-referrer functions are not present before rollback';
  end if;
  if (select count(*) from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and not t.tgisinternal
         and t.tgname in ('leads_set_ai_referrer', 'phone_clicks_set_ai_referrer')) <> 2 then
    raise exception 'ASSERT FAILED: both AI-referrer triggers are not present before rollback';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'leads'
         and column_name in ('zip', 'city_source')) <> 2 then
    raise exception 'ASSERT FAILED: leads.zip / leads.city_source are not present before rollback';
  end if;
  -- The backfill ran: the ChatGPT lead and the Perplexity tap carry a tag.
  if (select count(*) from public.leads where ai_referrer = 'chatgpt') <> 1 then
    raise exception 'ASSERT FAILED: the AI-referrer backfill did not tag the synthetic ChatGPT lead';
  end if;
  if (select count(*) from public.phone_clicks where ai_referrer = 'perplexity') <> 1 then
    raise exception 'ASSERT FAILED: the AI-referrer backfill did not tag the synthetic Perplexity tap';
  end if;

  select count(*) into v_leads from public.leads;
  select count(*) into v_clicks from public.phone_clicks;
  create temporary table rollback_row_counts (lead_rows bigint, phone_click_rows bigint);
  insert into rollback_row_counts values (v_leads, v_clicks);
end
$$;

-- ---------------------------------------------- the runbook's rollback, 3-2-1 --
begin;
alter table public.leads drop column if exists city_source;
alter table public.leads drop column if exists zip;
delete from supabase_migrations.schema_migrations where version = '20261122230000';
commit;

begin;
drop trigger if exists phone_clicks_set_ai_referrer on public.phone_clicks;
drop trigger if exists leads_set_ai_referrer on public.leads;
alter table public.phone_clicks drop column if exists ai_referrer;
alter table public.leads drop column if exists ai_referrer;
drop function if exists public.frame_set_ai_referrer();
drop function if exists public.frame_ai_referrer(text, text);
delete from supabase_migrations.schema_migrations where version = '20261027230000';
commit;

begin;
drop index if exists public.leads_spam_label_created_idx;
drop index if exists public.leads_spam_unclassified_idx;
alter table public.leads
  drop column if exists spam_classified_at,
  drop column if exists spam_classifier,
  drop column if exists spam_reason,
  drop column if exists spam_score,
  drop column if exists spam_label;
delete from supabase_migrations.schema_migrations where version = '20261027221000';
commit;

-- ------------------------------- catalog AND history agree, nothing was lost --
do $$
declare v_leads bigint; v_clicks bigint; v_before_leads bigint; v_before_clicks bigint;
begin
  -- Catalog: every object the three targets created is gone.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'leads'
         and column_name in ('spam_label', 'spam_score', 'spam_reason', 'spam_classifier',
                             'spam_classified_at', 'zip', 'city_source', 'ai_referrer')) <> 0 then
    raise exception 'ASSERT FAILED: a column the rollback should have dropped is still on public.leads';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'phone_clicks'
         and column_name = 'ai_referrer') <> 0 then
    raise exception 'ASSERT FAILED: phone_clicks.ai_referrer survived the rollback';
  end if;
  if (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'leads'
       and indexname in ('leads_spam_unclassified_idx', 'leads_spam_label_created_idx')) <> 0 then
    raise exception 'ASSERT FAILED: a spam index survived the rollback';
  end if;
  if to_regprocedure('public.frame_ai_referrer(text,text)') is not null
     or to_regprocedure('public.frame_set_ai_referrer()') is not null then
    raise exception 'ASSERT FAILED: an AI-referrer function survived the rollback';
  end if;
  if (select count(*) from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and not t.tgisinternal
         and t.tgname in ('leads_set_ai_referrer', 'phone_clicks_set_ai_referrer')) <> 0 then
    raise exception 'ASSERT FAILED: an AI-referrer trigger survived the rollback';
  end if;

  -- History: and no row claims any of them is applied. Catalog and history
  -- agreeing is the whole point — either both or neither.
  if (select count(*) from supabase_migrations.schema_migrations
       where version in ('20261027221000', '20261027230000', '20261122230000')) <> 0 then
    raise exception 'ASSERT FAILED: a history row survived the rollback while its objects are gone';
  end if;

  -- Nothing else in history was touched.
  if (select count(*) from supabase_migrations.schema_migrations) <> 0 then
    raise exception 'ASSERT FAILED: the rollback removed a history row it does not own';
  end if;

  -- Rows: dropping a column never drops a row.
  select lead_rows, phone_click_rows into v_before_leads, v_before_clicks
    from rollback_row_counts;
  select count(*) into v_leads from public.leads;
  select count(*) into v_clicks from public.phone_clicks;
  if v_leads <> v_before_leads or v_clicks <> v_before_clicks then
    raise exception 'ASSERT FAILED: rows changed across the rollback (leads % -> %, phone_clicks % -> %)',
      v_before_leads, v_leads, v_before_clicks, v_clicks;
  end if;
end
$$;

select 'lead migrations rollback contract: catalog and history agree' as result;
