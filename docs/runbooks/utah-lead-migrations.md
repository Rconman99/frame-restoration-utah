# Utah lead migrations — operator runbook (`scripts/run-lead-migrations.sh`)

Exact-target runner for three merged-but-unapplied Utah migrations, applied in
timestamp order in one guarded `migration up`:

| # | Version | File | What it adds |
|---|---------|------|--------------|
| 1 | `20261027221000` | `20261027221000_lead_spam_classification.sql` | five `leads.spam_*` columns + two indexes |
| 2 | `20261027230000` | `20261027230000_ai_referrer_tagging.sql` | `leads.ai_referrer`, `phone_clicks.ai_referrer`, `frame_ai_referrer(text,text)`, `frame_set_ai_referrer()`, two BEFORE INSERT triggers, one-time backfill |
| 3 | `20261122230000` | `20261122230000_leads_intake_zip_city_source.sql` | `leads.zip`, `leads.city_source` |

`20261111160000_utah_sms_contact_preferences.sql` and
`20261118000000_pgcron_lead_notification_worker_v2.sql` are **not** in scope.
They have no runner. Do not add them to this one.

**Why this doc and not `supabase/functions/handle-lead/DEPLOY.md`:**
`handle-lead/DEPLOY.md` is a digest-pinned reviewed source —
`scripts/client-ip-probe-audit-trusted.json` pins its SHA-256 and
`scripts/audit-client-ip-probe-contract.mjs` fails the compliance gate if its
bytes change. The runner shape itself is documented there (lines ~418–595 and
~1050–1141) and in `DASHBOARD-SECURITY-CHECKLIST.md` ("Safe Rollout Order");
this file is the operator section for these three targets only.

**Nothing in this runbook has been run.** No migration here has been applied,
and no production catalog was read while writing it. The runner needs a
different-lane review before first use.

## Operator prerequisites

1. **Merged release.** `RELEASE_SHA` is the full 40-character `origin/main` tip,
   not a branch head, preview or dirty worktree. The runner refuses anything
   else and refuses a SHA that is not exactly the current tip.
2. **The pinned CLI.** Official Supabase CLI **2.113.0**, macOS **arm64**, binary
   SHA-256 `ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a`.
   2.112.0 is forbidden (its generated Management API schema rejects valid
   offset timestamps during `link`), as is the bundled internal `supabase-go`
   compatibility binary.
3. **Sign-in.** Either the Mac's Supabase CLI Keychain profile
   (`LEAD_MIGRATION_AUTH_MODE=keychain-profile`, and `SUPABASE_ACCESS_TOKEN`
   must be absent) or a token injected from approved secret storage
   (`LEAD_MIGRATION_AUTH_MODE=injected-token`). Never print the value.
4. **An exclusive Utah migration-writer window**, secured before the first
   linked list and held through the final list: no other operator, workflow,
   Supabase Studio action, CLI process or automation may apply, repair, revert,
   squash or otherwise change migration history or the public schema. Bind
   `LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK` to the exact `RELEASE_SHA`.
5. **`jq`** on PATH. Any version from 1.6 to 1.8.1 — this runner's catalog
   validator was checked against 1.6, 1.7, 1.7.1, jq-1.7.1-apple, 1.8.0 and
   1.8.1 and behaves identically on all six.
   ⚠️ **`scripts/run-call-tracking-migrations.sh` is not jq-1.8 safe.** Its
   validator uses `… and .[0] as $s | …`, whose binding changed in jq 1.8, so
   under 1.8.x it dies with `Cannot index boolean with string "history"` and
   hard-stops with *"catalog state … differs from the reviewed contract"* on
   **every** input — which reads as production drift but is a jq incompatibility.
   Homebrew's current `jq` is 1.8.x. If the call-tracking pair still needs
   applying, either run it on a jq-1.7 host or fix that validator first. This is
   reported, not fixed here.
6. **Accepted starting history** (anything else is a hard stop): the reviewed
   36-version baseline, or that baseline plus **both** call-tracking versions
   (`20261027200000` + `20261027220000`), in either case plus any already
   recorded subset of the three targets. One of the two call-tracking versions
   means an interrupted call-tracking run — finish it through
   `scripts/run-call-tracking-migrations.sh` first.

Never `supabase db push`. Never `supabase migration repair`. Never paste the SQL
into the SQL editor or the Management API as a substitute.

## Lock note (read before choosing the window)

`20261027230000` runs `ALTER TABLE public.leads` and
`ALTER TABLE public.phone_clicks` and then backfills every resolving row in
both tables **inside its own transaction**, so it holds `ACCESS EXCLUSIVE` on
`public.leads` and `public.phone_clicks` for the whole apply. While it is held,
lead-form inserts and phone-tap inserts block. Preflight prints both row counts
(`lead_rows=`, `phone_click_rows=`) plus a `lock_note=` line so the window can
be sized; run it at a low-traffic hour.

## Preflight (read-only, no mutation)

```bash
cd /path/to/frame-restoration-utah          # clean checkout of main
export RELEASE_SHA="$(git rev-parse origin/main)"
export SUPABASE_BIN='/path/to/reviewed/supabase'
export LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK="$RELEASE_SHA"
export LEAD_MIGRATION_AUTH_MODE='keychain-profile'   # or injected-token
LEAD_MIGRATION_EXECUTION_MODE=preflight scripts/run-lead-migrations.sh
```

Expected output: `mode=preflight`, the `pending=` list in timestamp order,
`lead_rows=`/`phone_click_rows=`, the `lock_note=` line, a `receipt_dir=` under
`$TMPDIR` (mode 0700), and one JSON line of catalog state with the history
elided. Retain `receipt_dir`.

Preflight hard-stops, each fail-closed: operator inputs (SHA shape, SHA is not
the tip, missing/non-executable `SUPABASE_BIN`, unbound writer ack, unknown
execution or auth mode, token present in keychain mode or absent in injected
mode, unavailable Keychain profile), platform and binary (not macOS arm64, CLI
not 2.113.0, `supabase-go`, binary digest mismatch), identity (the login cannot
resolve exactly `hdcflshhomzildwqlmwh`, the runner linked to another project),
release bytes (any target or the poison guard differs from its pinned SHA-256,
or the archive produced anything other than the three targets), history
(unreviewed remote history, one of two call-tracking versions, a half-applied
target without its history row, a recorded target whose objects are missing),
the guarded `migration list` not being the matched history plus exactly the
pending targets, and any catalog movement between the first and final
preflight.

## Apply

Run as a **separate process**, immediately after a clean preflight, in the same
exclusive window:

```bash
LEAD_MIGRATION_EXECUTION_MODE=apply scripts/run-lead-migrations.sh
```

Order is fixed by filename: `20261027221000` → `20261027230000` →
`20261122230000`, all in one `supabase migration up --linked --include-all
--yes` against an isolated workdir that contains only the pending targets plus
one poison guard per already-recorded version. Already-recorded targets are
moved out of the run before it starts, so a resumed run applies only what is
left; with all three recorded the run is a verified no-op
("All three targets are already recorded; postflight checks only.").

Postflight requires: every object present, `leads` and `phone_clicks` row counts
not decreased, all three versions recorded, the final `migration list` fully
matched, and no poison-guard filename anywhere in the CLI's stdout or stderr.
On failure: keep the receipts, release nothing, and **do not** repair history.

## Post-apply verification (read-only)

```sql
-- 1. history
select version from supabase_migrations.schema_migrations
 where version in ('20261027221000','20261027230000','20261122230000')
 order by version;

-- 2. 20261027221000
select column_name from information_schema.columns
 where table_schema='public' and table_name='leads'
   and column_name in ('spam_label','spam_score','spam_reason',
                       'spam_classifier','spam_classified_at')
 order by column_name;
select indexname from pg_indexes
 where schemaname='public' and tablename='leads'
   and indexname in ('leads_spam_unclassified_idx','leads_spam_label_created_idx');

-- 3. 20261027230000
select to_regprocedure('public.frame_ai_referrer(text,text)') is not null as classifier,
       to_regprocedure('public.frame_set_ai_referrer()') is not null as trigger_fn,
       has_function_privilege('service_role',
         'public.frame_ai_referrer(text,text)','EXECUTE') as service_role_execute;
select c.relname, t.tgname from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and not t.tgisinternal
   and t.tgname in ('leads_set_ai_referrer','phone_clicks_set_ai_referrer');
select ai_referrer, count(*) from public.leads group by 1 order by 2 desc;
select ai_referrer, count(*) from public.phone_clicks group by 1 order by 2 desc;

-- 4. 20261122230000
select column_name from information_schema.columns
 where table_schema='public' and table_name='leads'
   and column_name in ('zip','city_source') order by column_name;

-- 5. nothing was lost
select (select count(*) from public.leads) as lead_rows,
       (select count(*) from public.phone_clicks) as phone_click_rows;
```

Then submit one controlled test lead and confirm its row carries `zip`,
`city_source` and (for an AI-referrer landing) `ai_referrer`.

## Rollback SQL, per target

Each target is additive, so rollback is a drop. Dropping a column **destroys the
data in it**; for `ai_referrer` that is the backfill, which the migration can
recompute on a re-apply, and for `spam_*` that is classifier output, which
`scripts/classify-lead-spam.py` can recompute. Removing the history row is only
correct when the objects are gone too — never remove one without the other.

```sql
-- 20261122230000_leads_intake_zip_city_source.sql
begin;
alter table public.leads drop column if exists city_source;
alter table public.leads drop column if exists zip;
delete from supabase_migrations.schema_migrations where version = '20261122230000';
commit;

-- 20261027230000_ai_referrer_tagging.sql
begin;
drop trigger if exists phone_clicks_set_ai_referrer on public.phone_clicks;
drop trigger if exists leads_set_ai_referrer on public.leads;
alter table public.phone_clicks drop column if exists ai_referrer;
alter table public.leads drop column if exists ai_referrer;
drop function if exists public.frame_set_ai_referrer();
drop function if exists public.frame_ai_referrer(text, text);
delete from supabase_migrations.schema_migrations where version = '20261027230000';
commit;

-- 20261027221000_lead_spam_classification.sql
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
```

Roll back in the reverse of the apply order (3 → 2 → 1). `20261027230000`'s
rollback takes the same `ACCESS EXCLUSIVE` locks as its apply.

## Order relative to other work

- **`handle-lead` deploy is safe before or after `20261122230000`.** The
  function tolerates `zip`/`city_source` being absent — it retries the insert
  without them — so neither ordering breaks lead capture. Before the migration,
  new leads simply carry no `zip`/`city_source`.
- **`scripts/classify-lead-spam.py` must not run until `20261027221000` is
  applied.** It writes `leads.spam_label`, `spam_score`, `spam_reason`,
  `spam_classifier` and `spam_classified_at`; those columns do not exist yet, so
  every write fails. Keep `.github/workflows/lead-spam-classifier.yml` off until
  the history row for `20261027221000` exists.
- `20261027230000` needs **no** edge-function deploy: the triggers fill the tag
  on every insert whichever code path wrote the row.
- `leads.commission` is GENERATED from `leads.city`. None of these three
  migrations touches that rule.

## Tests

`node --test scripts/run-lead-migrations.test.mjs` (blocking job
`lead-migration-runner` in `.github/workflows/hook-guards.yml`) drives the real
runner against a throwaway git repository and a stub `supabase` executable: each
gate above is exercised to its hard stop, plus happy-path preflight, happy-path
apply and the already-applied no-op. It touches no Supabase project. A passing
run is **not** evidence about production state and is not a substitute for the
live read-only preflight.
