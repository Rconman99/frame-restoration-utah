# Utah lead-notification pg_cron worker — operator runbook

For `supabase/migrations/20261118000000_pgcron_lead_notification_worker_v2.sql`.

## 🛑 Status: PARKED. Do not apply. Owner decision, 2026-11-26.

The pg_cron + pg_net approach to the lead-notification cadence is **parked**.
The 15-minute GitHub Actions schedule in
`.github/workflows/lead-notification-worker.yml` **stays** as the mechanism.
This migration has never been applied anywhere and is not to be applied.

**Why, both specific to hosted Supabase:**

1. **The bearer token cannot be kept out of a PUBLIC-readable queue.** pg_net
   stores each request's `Authorization` header in `net.http_request_queue`
   until its background worker drains it, and pg_net's own installation script
   grants schema `net` and all of its tables to PUBLIC (pg_net v0.19.5,
   `sql/pg_net.sql:355-357`) — so `anon`, `authenticated` and `service_role` can
   all read it. On a hosted project those objects are owned by
   `supabase_admin`, so those grants **cannot be revoked safely** from this
   project: it would reach into an extension the project does not own and would
   break every other pg_net consumer on it.
2. **The Vault secret is readable by `service_role`,** so moving the token there
   does not contain it either.

Together those mean the design cannot hold the credential it has to post every
fifteen minutes. That is a design problem, not a bug to patch.

**An earlier revision of this runbook gave a "revoke PUBLIC on schema net"
remediation. That remediation has been deleted** — it is not safe to run on a
hosted project, for the reason in (1).

**What a supported design would need:**

- **The token must not be stored anywhere a PUBLIC-readable queue or a
  `service_role`-readable secret store can expose it.** A scheduler that holds
  the credential outside the database (which is what GitHub Actions does today)
  satisfies this; pg_net as currently granted does not.
- **Scheduler provenance must be verifiable.** A 2xx that a human can produce by
  hand must not be able to satisfy the cutover gate. The health view in this
  file scopes responses to request ids the worker recorded, which is necessary
  but not sufficient: anyone who can execute the worker function can mint such a
  row. A real cutover needs evidence that the **scheduler** fired, not that the
  endpoint can return 200.
These are **design requirements for a future proposal**, not a checklist to work
through. Nothing in this runbook asks anyone to enable an extension, put a token
in Vault, apply this migration, or change the GitHub schedule — the only
procedure here is the incident check below.

Nothing in this runbook has been run, and no production catalog was read while
writing it.

## What is still in the file, and why

The SQL is kept rather than deleted so the work stays reviewable, and so the
**refuse-to-schedule gate remains in the file as a safety net** if anyone ever
tries to apply it. The gate is deliberately **not** extended any further. Under
the Supabase CLI's migration transaction (and under `psql -1`, which is how the
contract tests it), that refusal **rolls the whole file back** — no table, no
function, no view, no job. An earlier revision said the objects would be left
behind with only the job missing; that is only true under a bare `psql -f`
without `-1`, and it is corrected.

## Incident check: did someone apply it anyway?

This is the only operational procedure left in this runbook. It is **read-only**
and it is for answering one question — whether the parked migration was applied
by accident — not for preparing an apply.

**Run it as one block.** It must not error on a database where `pg_net`,
`pg_cron` or `vault` is not installed yet — which is this project's state. Note
why the obvious form does **not** work: PostgreSQL parses a whole statement
before executing it, so a `select … case when to_regclass('vault.secrets') is
null then null else (select … from vault.secrets) end` still raises
`42P01 relation "vault.secrets" does not exist` at parse time. An earlier
revision of this runbook had exactly that bug. Every reference to a
possibly-absent relation therefore goes through `execute`:

```sql
do $check$
declare
  v_extensions text;
  v_queue_public boolean;
  v_responses_public boolean;
  v_sr_net_usage boolean;
  v_token_present boolean;
  v_scheduled boolean;
begin
  -- 1. are the extensions actually installed? (the whole premise)
  select coalesce(string_agg(extname || ' ' || extversion, ', '), 'none')
    into v_extensions
    from pg_catalog.pg_extension
   where extname in ('pg_cron', 'pg_net');

  -- 2. who can reach pg_net's queue and responses? On a stock project pg_net's
  --    own install script grants schema net and ALL its tables to PUBLIC
  --    (pg_net v0.19.5 sql/pg_net.sql:355-357). Expect true, and treat it as
  --    the reason this approach is parked, not as something to fix here.
  --    Catalog-only, so these two are always safe to run.
  select exists (
    select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join pg_catalog.aclexplode(c.relacl) a
     where n.nspname = 'net' and c.relname = 'http_request_queue' and a.grantee = 0
  ) into v_queue_public;
  select exists (
    select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join pg_catalog.aclexplode(c.relacl) a
     where n.nspname = 'net' and c.relname = '_http_response' and a.grantee = 0
  ) into v_responses_public;

  v_sr_net_usage := case
    when pg_catalog.to_regnamespace('net') is null then null
    when not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then null
    else pg_catalog.has_schema_privilege('service_role', 'net', 'USAGE')
  end;

  -- 3. is the worker token in Vault? Presence only — never decrypt it here.
  if pg_catalog.to_regclass('vault.secrets') is null then
    v_token_present := null;
  else
    execute 'select exists (select 1 from vault.secrets where name = $1)'
      into v_token_present using 'lead_notification_worker_token';
  end if;

  -- 4. is anything already scheduled under this name?
  if pg_catalog.to_regclass('cron.job') is null then
    v_scheduled := null;
  else
    execute 'select exists (select 1 from cron.job where jobname = $1)'
      into v_scheduled using 'lead-notification-worker';
  end if;

  raise notice 'extensions=%', v_extensions;
  raise notice 'queue_granted_to_public=%', v_queue_public;
  raise notice 'responses_granted_to_public=%', v_responses_public;
  raise notice 'service_role_net_usage=%', v_sr_net_usage;
  raise notice 'worker_token_present=%', v_token_present;
  raise notice 'already_scheduled=%', v_scheduled;
end
$check$;
```

`<NULL>` for a value means "that extension or role is not installed yet".
`queue_granted_to_public=t` is the parked-status reason, not an action item.

## If someone applied it by accident

**Do not treat this as a cutover.** Applying it is a mistake to undo, not a step
to finish.

1. **Check** with the read-only block above. `already_scheduled=t` means the job
   exists; `extensions` naming `pg_cron`/`pg_net` means they were enabled.
2. **Unschedule immediately** — while the job exists it is posting the worker
   bearer token into `net.http_request_queue` every fifteen minutes, where
   PUBLIC can read it:
   ```sql
   select cron.unschedule('lead-notification-worker');
   ```
3. **Drop the objects** (they are inert once the job is gone, but they advertise
   a design that is parked):
   ```sql
   drop view if exists public.lead_notification_worker_cron_health;
   drop function if exists public.invoke_lead_notification_worker();
   drop table if exists public.lead_notification_worker_cron_requests;
   ```
4. **Treat the token as exposed** if the job ran even once: it sat in a
   PUBLIC-readable queue. Rotate the two credentials that are actually in use,
   the `LEAD_NOTIFICATION_WORKER_TOKEN` GitHub secret and the edge-function
   secret, together, and redeploy `lead-notification-worker`. **Do not put the
   new token in Vault.** Vault is readable by `service_role`, which is one of
   the two reasons this path is parked. Retire the abandoned
   `lead_notification_worker_token` Vault entry instead of updating it.
5. **Tell the owner (Ryan) and note it in the Frame Command Center.** Before
   saying what was applied, check it: the job name `lead-notification-worker`
   is shared with the older `20260819000000` file, so a scheduled job does not
   prove this version ran. Read `supabase_migrations.schema_migrations` for
   `20261118000000`, and look for the objects only this version creates
   (`public.lead_notification_worker_cron_requests` and
   `public.lead_notification_worker_cron_health`). If a history row exists, no
   reviewed runner wrote it, and whoever reconciles migration history needs to
   know. **Do not** delete a history row to "clean up" — a history edit is a
   reviewed action, not an incident fix.
6. **Leave the GitHub schedule alone.** It is the mechanism; it should have been
   running the whole time.

## The defects this version fixes

A review on 2026-11-26 confirmed both against a throwaway PostgreSQL with the
original file applied:

1. **The health view was unscoped.** It selected every row of
   `net._http_response`. With one unrelated pg_net response inserted, the
   original view returned it — so a 2xx in that view did **not** prove this
   worker had succeeded — and at the time that view was (wrongly) treated as the
   go/no-go for cutting the GitHub schedule. It is not a cutover gate now; see
   the scheduler-provenance requirement above. Fixed by having the function record each request id it
   issues in `public.lead_notification_worker_cron_requests` and having the view
   join `net._http_response` to that ledger.
2. **The view was `security_invoker = true`.** Reproduced: `set role
   service_role; select … from the view` failed with
   `permission denied for table _http_response`. Note the sharper version of
   this, which only became clear after reading pg_net's own SQL (see the token
   section below): with pg_net's default `PUBLIC` grants in place the invoker
   view would **not** have errored — it would have worked by handing
   `service_role` every pg_net caller's responses. Either way it was wrong.
   Fixed by making it a definer view (`security_invoker = false`, owned by
   `postgres`) whose restriction is the join, with `public`, `anon` and
   `authenticated` revoked.

Two more, from the 2026-11-26 review, fixed in the follow-up:

3. **The request ledger granted `select, insert, delete` to `service_role`.**
   Hosted `service_role` carries `BYPASSRLS`, so that grant let it insert ids the
   worker never issued — changing what the postgres-owned view exposes — or
   delete the rows that are the only evidence of a failure. **All** direct
   privileges are now revoked from `public, anon, authenticated, service_role`
   after the table is created (which is also what neutralises a project-level
   `alter default privileges ... grant all on tables to service_role`). The
   definer function owns every write; the definer view owns every read; no role
   needs a grant.
4. **The token-isolation claim was false** — see the token section below. The
   migration now verifies it and refuses to schedule without it.

A third problem was found while fixing those: `20260819000000` declares
`public.invoke_lead_notification_worker()` as `RETURNS void`, and
`create or replace` cannot change a return type — applying the old file and
then this one errored with `cannot change return type of existing function`.
The function is now dropped by signature before it is created, so the file's
own claim that it supersedes `20260819000000` is finally true.

## 🔴 Token exposure — and the correction to what this runbook used to say

**An earlier revision of this runbook, and of the migration's header, claimed
that schema `net` "is reachable only by a role with privileges there
(`postgres`), not by `anon`, `authenticated` or `service_role`". That was
false.** pg_net v0.19.5's own installation script ends with
(`sql/pg_net.sql:355-357`):

```sql
grant usage on schema net to PUBLIC;
grant all on all sequences in schema net to PUBLIC;
grant all on all tables in schema net to PUBLIC;
```

So on a stock Supabase project, after `create extension pg_net`, **every role —
`anon` and `authenticated` included, because they are members of PUBLIC** — can

- `SELECT net.http_request_queue`, which holds this worker's
  `Authorization: Bearer …` header until the background worker drains it, and
- `INSERT`/`UPDATE`/`DELETE net._http_response`, which is the only evidence the
  health view reports on — so that signal is forgeable and erasable, which is a
  second reason it was never a cutover gate.

Nothing in `supautils.conf` or Supabase's extension custom scripts revokes it
(checked 2026-11-26: `pg_net` is in `supautils.privileged_extensions`, and the
`postgresql_extension_custom_scripts` directory has no `pg_net` entry). I could
not find a Supabase-specific hook that *adds* API-role grants either — pg_net's
own `PUBLIC` grants are already sufficient, so it does not matter which.

Also corrected: **pg_net has exactly two tables**, `net.http_request_queue` and
`net._http_response`. There is **no separate failed-request table** — a failure
lands in `_http_response` with `error_msg` / `timed_out`. The earlier claim of
one was wrong.

**What the migration now does about it.** It no longer asserts isolation; it
verifies it. A guarded block sitting immediately before `cron.schedule` raises
unless `anon`, `authenticated` and `PUBLIC` all lack queue-read and
response-write access, so on a stock project the migration **refuses** and
nothing starts posting a bearer every fifteen minutes into a database where
PUBLIC can read it back out. Under one transaction — the CLI's own, and `psql
-1` in the contract — that refusal rolls the entire file back: no job, no
ledger, no view, no function.

**There is no remediation offered here.** The earlier "revoke PUBLIC on schema
net" block has been deleted: on a hosted project `net.http_request_queue` and
`net._http_response` are owned by `supabase_admin`, so revoking those grants is
not this project's to do and would break every other pg_net consumer. This is
the reason the approach is parked rather than hardened.

Two further leaks that no SQL here can close, so nobody assumes otherwise:

- **`cron.job_run_details` retains the text of database errors** raised by the
  job. This function never puts the token in an exception message, but anything
  that does would land there.
- **pg_net at log level `DEBUG2` or finer logs outgoing request headers** to the
  Postgres log. Keep `log_min_messages` well above that.

If the residency in `net.http_request_queue` is unacceptable even with PUBLIC
revoked, the alternative is not this migration: it is leaving the schedule in
GitHub Actions, where the token lives in an Actions secret instead.

## Tests

`.github/workflows/pgcron-lead-notification-worker.yml` (blocking,
path-filtered, no secrets) stands up a throwaway `postgres:16-alpine`, stubs
`cron`, `net` and `vault` minimally via
`supabase/tests/pgcron_lead_notification_worker_fixture.sql`, applies the
migration **twice**, and runs
`supabase/tests/pgcron_lead_notification_worker.sql` — which now also proves
that `service_role` holds **no** direct privilege on the request ledger and is
refused every write to it at run time (with a realistic `BYPASSRLS`
`service_role` and Supabase's own `alter default privileges ... grant all on
tables` in place), that the definer view still reads for it, and that the
drop-first upgrade path from `20260819000000`'s `RETURNS void` function works
where `create or replace` errors.

A second database in the same job applies
`supabase/tests/pgcron_lead_notification_worker_upstream_grants.sql` — pg_net's
own `PUBLIC` grants, verbatim — and asserts that the migration **fails** and
that `supabase/tests/pgcron_lead_notification_worker_refusal.sql` finds no cron
job scheduled.

A passing run proves the contract of the SQL, not that production is in any
particular state.
