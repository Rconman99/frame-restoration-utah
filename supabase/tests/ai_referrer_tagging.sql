-- Synthetic contract for supabase/migrations/20261027230000_ai_referrer_tagging.sql.
-- Run only in the isolated local test database, after ai_referrer_tagging_fixture.sql
-- and after the migration has been applied TWICE (idempotency is part of the contract).
begin;

-- 1. Classifier: every tag, host and bare-utm forms, case folding, declared
--    first-match order, and non-AI inputs staying NULL.
do $$ begin
  assert public.frame_ai_referrer('https://chatgpt.com/', null::text) = 'chatgpt', 'chatgpt.com host';
  assert public.frame_ai_referrer('https://chat.openai.com/c/abc', null::text) = 'chatgpt', 'chat.openai.com host';
  assert public.frame_ai_referrer('https://www.perplexity.ai/search?q=roofers', null::text) = 'perplexity', 'perplexity.ai host';
  assert public.frame_ai_referrer('https://gemini.google.com/app', null::text) = 'gemini', 'gemini.google.com host';
  assert public.frame_ai_referrer('https://bard.google.com/', null::text) = 'gemini', 'bard.google.com host';
  assert public.frame_ai_referrer('https://copilot.microsoft.com/', null::text) = 'copilot', 'copilot.microsoft.com host';
  assert public.frame_ai_referrer('https://www.bing.com/chat?q=roofer', null::text) = 'copilot', 'bing.com/chat host';
  assert public.frame_ai_referrer('https://claude.ai/chat/1', null::text) = 'claude', 'claude.ai host';
  assert public.frame_ai_referrer('https://you.com/search?q=roofing', null::text) = 'other_ai', 'you.com';
  assert public.frame_ai_referrer('https://www.phind.com/', null::text) = 'other_ai', 'phind.com';
  assert public.frame_ai_referrer('https://kagi.com/assistant', null::text) = 'other_ai', 'kagi.com/assistant';
  assert public.frame_ai_referrer('https://www.meta.ai/', null::text) = 'other_ai', 'meta.ai';
  assert public.frame_ai_referrer('https://grok.com/', null::text) = 'other_ai', 'grok.com';
  assert public.frame_ai_referrer('https://x.com/i/grok?conversation=1', null::text) = 'other_ai', 'x.com/i/grok';
  assert public.frame_ai_referrer('https://chat.deepseek.com/', null::text) = 'other_ai', 'deepseek.com';
  assert public.frame_ai_referrer('https://chat.mistral.ai/chat', null::text) = 'other_ai', 'chat.mistral.ai';
  -- bare utm_source tokens (the utm argument is always preceded by a space)
  assert public.frame_ai_referrer(null::text, 'chatgpt') = 'chatgpt', 'bare chatgpt utm';
  assert public.frame_ai_referrer('', 'perplexity') = 'perplexity', 'bare perplexity utm';
  assert public.frame_ai_referrer(null::text, 'gemini') = 'gemini', 'bare gemini utm';
  assert public.frame_ai_referrer(null::text, 'copilot') = 'copilot', 'bare copilot utm';
  assert public.frame_ai_referrer(null::text, 'claude') = 'claude', 'bare claude utm';
  assert public.frame_ai_referrer(null::text, 'chatgpt.com') = 'chatgpt', 'host-form utm';
  -- case folding and a landing-page UTM carrying a host
  assert public.frame_ai_referrer('HTTPS://ChatGPT.com/', null::text) = 'chatgpt', 'case folding';
  assert public.frame_ai_referrer(' /?utm_source=claude.ai&utm_medium=referral', null::text) = 'claude', 'landing-page utm host';
  -- first match wins, in the declared order
  assert public.frame_ai_referrer('https://chatgpt.com/?via=perplexity', null::text) = 'chatgpt', 'chatgpt before perplexity';
  assert public.frame_ai_referrer('https://www.perplexity.ai/', 'gemini') = 'perplexity', 'perplexity before gemini';
  assert public.frame_ai_referrer('https://gemini.google.com/', 'copilot') = 'gemini', 'gemini before copilot';
  assert public.frame_ai_referrer('https://copilot.microsoft.com/', 'claude') = 'copilot', 'copilot before claude';
  assert public.frame_ai_referrer('https://claude.ai/', 'you.com') = 'claude', 'claude before other_ai';
  -- non-AI and empty inputs stay NULL
  assert public.frame_ai_referrer(null::text, null::text) is null, 'null/null tagged';
  assert public.frame_ai_referrer('', '') is null, 'empty/empty tagged';
  assert public.frame_ai_referrer('https://www.google.com/', null::text) is null, 'google organic tagged';
  assert public.frame_ai_referrer('https://www.google.com/maps/place/Frame', null::text) is null, 'google maps tagged';
  assert public.frame_ai_referrer('https://www.bing.com/search?q=roofer', null::text) is null, 'bing search tagged';
  assert public.frame_ai_referrer('https://duckduckgo.com/', null::text) is null, 'duckduckgo tagged';
  assert public.frame_ai_referrer('https://l.facebook.com/', null::text) is null, 'facebook tagged';
  assert public.frame_ai_referrer('/?gclid=abc', 'google') is null, 'google cpc tagged';
  assert public.frame_ai_referrer(null::text, 'yelp') is null, 'yelp utm tagged';
  -- host and token boundaries: look-alike hosts, own page slugs and campaign names stay NULL
  assert public.frame_ai_referrer('https://www.thankyou.com/ ', null::text) is null, 'thankyou.com read as you.com';
  assert public.frame_ai_referrer('https://www.bayou.com/ ', null::text) is null, 'bayou.com read as you.com';
  assert public.frame_ai_referrer('https://www.notperplexity.ai/ ', null::text) is null, 'notperplexity.ai read as perplexity';
  assert public.frame_ai_referrer(' /blog/perplexity-vs-google-for-roofers', null::text) is null, 'perplexity inside a page slug tagged';
  assert public.frame_ai_referrer(' /?utm_source=google&utm_campaign=perplexity-q4', 'google') is null, 'perplexity utm_campaign on paid google tagged';
  assert public.frame_ai_referrer('https://copilot.cloud.microsoft/', null::text) = 'copilot', 'Microsoft 365 Copilot host';
end $$;

-- 2. Shape after a double apply: one text column per table, exactly one
--    BEFORE INSERT row trigger per table bound to frame_set_ai_referrer(),
--    an IMMUTABLE classifier, neither function SECURITY DEFINER, both with a
--    pinned empty search_path, and Utah's browser-free EXECUTE posture.
do $$ begin
  assert (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'leads'
             and column_name = 'ai_referrer' and data_type = 'text') = 1, 'leads.ai_referrer missing or not text';
  assert (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'phone_clicks'
             and column_name = 'ai_referrer' and data_type = 'text') = 1, 'phone_clicks.ai_referrer missing or not text';
  assert (select count(*) from pg_trigger
           where tgrelid = 'public.leads'::regclass and not tgisinternal
             and tgfoid = 'public.frame_set_ai_referrer'::regproc) = 1, 'leads must carry exactly one ai_referrer trigger after a double apply';
  assert (select count(*) from pg_trigger
           where tgrelid = 'public.phone_clicks'::regclass and not tgisinternal
             and tgfoid = 'public.frame_set_ai_referrer'::regproc) = 1, 'phone_clicks must carry exactly one ai_referrer trigger after a double apply';
  -- tgtype 7 = ROW (1) | BEFORE (2) | INSERT (4): never AFTER, never UPDATE.
  assert (select bool_and(tgtype = 7) from pg_trigger
           where tgfoid = 'public.frame_set_ai_referrer'::regproc), 'ai_referrer trigger is not BEFORE INSERT ... FOR EACH ROW';
  assert (select count(*) from pg_proc where proname = 'frame_ai_referrer' and pronamespace = 'public'::regnamespace) = 1, 'classifier overload sprawl after a double apply';
  assert (select provolatile from pg_proc where oid = 'public.frame_ai_referrer(text,text)'::regprocedure) = 'i', 'classifier is not IMMUTABLE';
  assert not (select prosecdef from pg_proc where oid = 'public.frame_ai_referrer(text,text)'::regprocedure), 'classifier is SECURITY DEFINER';
  assert not (select prosecdef from pg_proc where oid = 'public.frame_set_ai_referrer()'::regprocedure), 'trigger function is SECURITY DEFINER';
  assert (select proconfig from pg_proc where oid = 'public.frame_ai_referrer(text,text)'::regprocedure) = array['search_path=""'], 'classifier search_path is not pinned to empty';
  assert (select proconfig from pg_proc where oid = 'public.frame_set_ai_referrer()'::regprocedure) = array['search_path=""'], 'trigger function search_path is not pinned to empty';
  -- Utah containment (20260807000095): no public function is browser-executable,
  -- and service_role keeps EXECUTE because the trigger runs as the inserting role.
  assert not has_function_privilege('anon', 'public.frame_ai_referrer(text,text)', 'execute'), 'anon can execute the classifier';
  assert not has_function_privilege('authenticated', 'public.frame_ai_referrer(text,text)', 'execute'), 'authenticated can execute the classifier';
  assert not has_function_privilege('anon', 'public.frame_set_ai_referrer()', 'execute'), 'anon can execute the trigger function';
  assert not has_function_privilege('authenticated', 'public.frame_set_ai_referrer()', 'execute'), 'authenticated can execute the trigger function';
  assert has_function_privilege('service_role', 'public.frame_ai_referrer(text,text)', 'execute'), 'service_role cannot execute the classifier: every lead insert would fail';
  assert col_description('public.leads'::regclass, (select attnum from pg_attribute where attrelid = 'public.leads'::regclass and attname = 'ai_referrer')) is not null, 'leads.ai_referrer comment missing';
  assert col_description('public.phone_clicks'::regclass, (select attnum from pg_attribute where attrelid = 'public.phone_clicks'::regclass and attname = 'ai_referrer')) is not null, 'phone_clicks.ai_referrer comment missing';
end $$;

-- 3. Backfill: every history row carries exactly the tag its label promises;
--    non-AI history stays NULL; fixture counts intact.
do $$ begin
  assert (select count(*) from public.leads) = 13, 'fixture lead count changed';
  assert (select count(*) from public.phone_clicks) = 7, 'fixture click count changed';
  assert (select ai_referrer from public.leads where name = 'L-chatgpt-ref') = 'chatgpt', 'backfill: chatgpt referrer';
  assert (select ai_referrer from public.leads where name = 'L-openai-ref') = 'chatgpt', 'backfill: chat.openai.com referrer';
  assert (select ai_referrer from public.leads where name = 'L-perplexity-ref') = 'perplexity', 'backfill: perplexity referrer';
  assert (select ai_referrer from public.leads where name = 'L-gemini-ref') = 'gemini', 'backfill: gemini referrer';
  assert (select ai_referrer from public.leads where name = 'L-copilot-utm') = 'copilot', 'backfill: bare copilot utm_source';
  assert (select ai_referrer from public.leads where name = 'L-claude-landing') = 'claude', 'backfill: claude.ai inside landing_page';
  assert (select ai_referrer from public.leads where name = 'L-other-ai-ref') = 'other_ai', 'backfill: you.com referrer';
  assert (select ai_referrer from public.leads where name = 'L-case-fold') = 'chatgpt', 'backfill: upper-case referrer';
  assert (select count(*) from public.leads where ai_referrer is not null) = 8, 'backfill tagged the wrong number of leads';
  assert (select count(*) from public.leads where ai_referrer is null
           and name in ('L-google-organic', 'L-gbp', 'L-direct', 'L-utm-google-cpc', 'L-facebook')) = 5, 'backfill tagged a non-AI lead';
  assert (select ai_referrer from public.phone_clicks where page_title = 'P-perplexity-ref') = 'perplexity', 'backfill: perplexity click';
  assert (select ai_referrer from public.phone_clicks where page_title = 'P-bing-chat-ref') = 'copilot', 'backfill: bing.com/chat click';
  assert (select ai_referrer from public.phone_clicks where page_title = 'P-gemini-utm') = 'gemini', 'backfill: bare gemini utm_source click';
  assert (select ai_referrer from public.phone_clicks where page_title = 'P-grok-ref') = 'other_ai', 'backfill: x.com/i/grok click';
  assert (select count(*) from public.phone_clicks where ai_referrer is not null) = 4, 'backfill tagged the wrong number of clicks';
  assert (select count(*) from public.phone_clicks where ai_referrer is null
           and page_title in ('P-bing-search', 'P-direct', 'P-duckduckgo')) = 3, 'backfill tagged a non-AI click';
end $$;

-- 4. Backfill scope: across TWO applications, exactly one UPDATE per resolving
--    row, none on an untagged row, never an overwrite, never a NULL write.
do $$ begin
  assert (select count(*) from public.ai_referrer_update_log) = 12, 'backfill touched an unexpected number of rows across two applications';
  assert (select count(*) from public.ai_referrer_update_log where table_name = 'leads') = 8, 'leads update count';
  assert (select count(*) from public.ai_referrer_update_log where table_name = 'phone_clicks') = 4, 'phone_clicks update count';
  assert (select count(distinct (table_name, row_id)) from public.ai_referrer_update_log) = 12, 'a row was updated twice (second application is not a no-op)';
  assert not exists (select from public.ai_referrer_update_log g join public.leads l on l.id = g.row_id
                      where g.table_name = 'leads' and l.ai_referrer is null), 'an untagged lead was updated';
  assert not exists (select from public.ai_referrer_update_log g join public.phone_clicks p on p.id = g.row_id
                      where g.table_name = 'phone_clicks' and p.ai_referrer is null), 'an untagged click was updated';
  assert not exists (select from public.ai_referrer_update_log where old_tag is not null), 'backfill overwrote an existing tag';
  assert not exists (select from public.ai_referrer_update_log where new_tag is null), 'backfill wrote a NULL tag';
end $$;

-- 5. Insert path: the trigger tags from referrer, landing_page and utm_source on
--    both tables, keeps a preset tag, leaves non-AI rows NULL, and inserts
--    generate no UPDATEs.
insert into public.leads(name, phone, source_page, referrer) values ('I-perplexity-ref', '+18015550121', 'test', 'https://www.perplexity.ai/');
insert into public.leads(name, phone, source_page, landing_page) values ('I-chatgpt-landing', '+18015550122', 'test', '/?utm_source=chatgpt.com');
insert into public.leads(name, phone, source_page, utm_source) values ('I-claude-utm', '+18015550123', 'test', 'claude');
insert into public.leads(name, phone, source_page, referrer, ai_referrer) values ('I-preset', '+18015550124', 'test', 'https://chatgpt.com/', 'manual');
insert into public.leads(name, phone, source_page, referrer) values ('I-google', '+18015550125', 'test', 'https://www.google.com/');
insert into public.phone_clicks(click_type, phone, source_page, page_title, referrer) values ('call', '+14352928802', '/', 'I-copilot-ref', 'https://copilot.microsoft.com/');
insert into public.phone_clicks(click_type, phone, source_page, page_title, referrer, utm_source) values ('sms', '+14352928802', '/', 'I-perplexity-utm', '', 'perplexity');
insert into public.phone_clicks(click_type, phone, source_page, page_title, referrer, ai_referrer) values ('call', '+14352928802', '/', 'I-preset', 'https://claude.ai/', 'manual');
insert into public.phone_clicks(click_type, phone, source_page, page_title, referrer) values ('call', '+14352928802', '/', 'I-direct', '');
-- The role every Utah edge function writes as: the trigger must still tag.
set local role service_role;
insert into public.leads(name, phone, source_page, referrer) values ('I-service-role', '+18015550126', 'test', 'https://chatgpt.com/');
insert into public.phone_clicks(click_type, phone, source_page, page_title, referrer) values ('call', '+14352928802', '/', 'I-service-role', 'https://www.perplexity.ai/');
reset role;
do $$ begin
  assert (select ai_referrer from public.leads where name = 'I-perplexity-ref') = 'perplexity', 'insert: referrer not tagged';
  assert (select ai_referrer from public.leads where name = 'I-chatgpt-landing') = 'chatgpt', 'insert: landing_page utm host not tagged';
  assert (select ai_referrer from public.leads where name = 'I-claude-utm') = 'claude', 'insert: utm_source not tagged';
  assert (select ai_referrer from public.leads where name = 'I-preset') = 'manual', 'insert: preset tag overwritten';
  assert (select ai_referrer from public.leads where name = 'I-google') is null, 'insert: non-AI lead tagged';
  assert (select ai_referrer from public.phone_clicks where page_title = 'I-copilot-ref') = 'copilot', 'insert: click referrer not tagged';
  assert (select ai_referrer from public.phone_clicks where page_title = 'I-perplexity-utm') = 'perplexity', 'insert: click utm_source not tagged';
  assert (select ai_referrer from public.phone_clicks where page_title = 'I-preset') = 'manual', 'insert: click preset tag overwritten';
  assert (select ai_referrer from public.phone_clicks where page_title = 'I-direct') is null, 'insert: non-AI click tagged';
  assert (select ai_referrer from public.leads where name = 'I-service-role') = 'chatgpt', 'insert as service_role: lead not tagged';
  assert (select ai_referrer from public.phone_clicks where page_title = 'I-service-role') = 'perplexity', 'insert as service_role: click not tagged';
  assert (select count(*) from public.ai_referrer_update_log) = 12, 'inserts produced UPDATEs';
end $$;
rollback;
