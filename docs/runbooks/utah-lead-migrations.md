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

## 🔴 What the owner is accepting by approving a run

Three things. Read them before the prerequisites; nothing below removes them.

1. **An apply mints a temporary postgres login role, and can clear this
   project's IP bans.** `migration up --linked` needs a database connection and
   has no `--password` flag at CLI 2.113.0, so the CLI mints a temporary role via
   `POST /v1/projects/<ref>/cli/login-role` with `read_only: false`
   (`legacy-db-config.layer.ts:101-117`) and, from the **third** pooler connect
   failure onward, lists and **deletes** the project's IPv4 network bans
   (`119-127`, `157-161`), logging that only at `--debug`. Preflight does not do
   this — it reads only through the Management API read-only endpoint — but an
   apply cannot avoid it. Expect a short-lived role to appear and expire, and
   check the ban list afterwards if the pooler was flaky.
2. **`20261027230000` holds `ACCESS EXCLUSIVE` on `public.leads` and
   `public.phone_clicks` through its backfill, and no `lock_timeout` is set.**
   Lead-form inserts and phone-tap inserts block for the duration. Preflight
   prints both row counts and a `lock_note=` line so the window can be sized.
   **Run it off-peak**, inside the exclusive writer window. If it has not
   returned within a few minutes at the printed row counts, investigate the
   blocking session (`pg_locks` / `pg_stat_activity`) rather than killing the
   runner.
3. **If the history write ever fails, reconciliation is manual.** As of this
   change `20261027230000` carries no `begin;`/`commit;` of its own, so the CLI
   wraps the statements **and** the `schema_migrations` insert in one
   transaction and they commit or roll back together — the applied-but-unrecorded
   window is closed for all three targets. The runner still **hard-stops and
   says STOP AND ESCALATE** if it ever sees that state, because CLI 2.113.0
   cannot prove a history-write failure (exit codes 0/1 only, the
   `Applying migration …` line prints before the file runs, and `applied` is
   emitted only on success), so the state is indistinguishable from a
   hand-applied migration. There is no replay path and the runner will never
   write history. Reconciling it is a human decision; `migration repair` is
   never the answer.

## Operator prerequisites

1. **Merged release.** `RELEASE_SHA` is the full 40-character `origin/main` tip,
   not a branch head, preview or dirty worktree. The runner refuses anything
   else and refuses a SHA that is not exactly the current tip.
2. **A clean checkout of the release commit.** The runner hashes **its own
   bytes** and refuses to run unless they equal
   `git show <RELEASE_SHA>:scripts/run-lead-migrations.sh`. Launch it from a
   fresh checkout of `RELEASE_SHA`; a local edit, a stale working tree or a copy
   of the script stops the run before anything else happens.
3. **The pinned CLI, named by one absolute path.** Official Supabase CLI
   **2.113.0**, macOS **arm64**, binary SHA-256
   `ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a`. 2.112.0 is
   forbidden (its generated Management API schema rejects valid offset timestamps
   during `link`), as is the bundled internal `supabase-go` compatibility binary.
   `SUPABASE_BIN` must be an **absolute path** and must not be a symlink. The
   runner then **copies it into a private 0700 directory, hashes the copy with
   `/usr/bin/shasum`, and executes only the copy** — so the file that was
   verified is the file that runs, and the TOCTOU window on the operator's own
   path is closed rather than documented. The private directory is created with
   `mktemp -d` under a **fixed trusted root, `/private/tmp`** (checked to exist
   and not be a symlink, and verified 0700 afterwards); `TMPDIR` is **never
   read**, so a caller-supplied value has no effect at all.
4. **A clean environment, an allowlisted one for the CLI, a pinned profile, and
   a private working directory.** The deny-list pre-check refuses to start if any
   `SUPABASE_*` variable other than `SUPABASE_BIN`, `SUPABASE_ACCESS_TOKEN` and
   `SUPABASE_NO_KEYRING` is set, if any `PG*` variable is set, if shell tracing
   is on, or if `PS4` was inherited. On top of that **every CLI call runs under
   `env -i` with an explicit allowlist** — `HOME`, `PATH`, `LANG`, `LC_ALL`,
   `SUPABASE_NO_KEYRING` and the token — with `--profile supabase` and an
   absolute `--workdir`, and the binary is executed only from its own 0700
   directory, never from the checkout.
   `HOME` is passed, deliberately, but **redirected into the private
   directory**: the CLI reads `~/.supabase/access-token` and
   `~/.supabase/profile` and may write config there, so a private `HOME` stops
   it reading the operator's persisted profile or token and keeps any write
   inside the receipt directory. Omitting `HOME` is worse — tools then fall back
   to the passwd entry, i.e. the real home.
   The runner's own utilities are pinned and **nothing about them is
   configurable**: `PATH` is fixed to `/usr/bin:/bin:/usr/sbin:/sbin`, and
   `shasum`, `git`, `curl`, `env`, `awk` and `bash` are absolute
   `/usr/bin/...` (`/bin/bash`) paths. `jq` is the one tool chosen from a short
   candidate list, with a version gate. There is **no test mode**: no
   environment variable changes which tools the shipped script uses, where its
   private root is, or which PATH it searches. The suite substitutes those
   constants itself, in `scripts/test/lead-migration-runner-harness.mjs`, and a
   test asserts the shipped script contains no test-mode switch.
   The access token is also validated before use: anything outside
   `[0-9A-Za-z._-]` is refused, because the script hands it to a curl config
   document and to a shell `read`.
   Verified against supabase/cli v2.113.0 (commit `03880bb1`):
   - `apps/cli/src/legacy/config/legacy-cli-config.layer.ts:38-80` — with no
     `--profile` flag and no `SUPABASE_PROFILE`, the CLI falls back to the
     **persisted `~/.supabase/profile` file**, and that token may itself be a
     path to a viper config file
     (`apps/cli/src/legacy/shared/legacy-profile-load.ts:101-145`). A profile
     supplies `api_url`, `project_host` and `pooler_host` (same file, 215-221),
     so clearing the environment is **not enough**: every ref check can agree
     while the CLI talks to a different Management API, project host and pooler.
   - the same layer, `31-33` and `49-52` — an explicit `--profile supabase`
     shadows the env var **and** the persisted file even at the default value,
     and `legacy-profile-load.ts:106-117` resolves that built-in name without
     reading any file. That is why the flag is pinned rather than the env
     cleared.
   - the same layer, `98-126` — an explicit `--workdir` beats `SUPABASE_WORKDIR`.
   - `apps/cli/scripts/build.ts:144-156` — the release is a Bun single-file
     executable (`bun build --compile`, with no `--env` control), and Bun reads a
     dotenv file from the process working directory at runtime. So a `.env` in
     the repository checkout could inject settings **after** the environment
     scan. The runner therefore `cd`s into its private receipt directory before
     the very first CLI invocation, `--version` included.
   - `migration up` and `migration list` expose no `--project-ref` flag at this
     tag (`apps/cli/src/legacy/commands/migration/{up,list}/*.command.ts`), so
     the linked ref file plus the pinned profile are the whole of the project
     binding.
5. **Sign-in: injected token only.**
   `LEAD_MIGRATION_AUTH_MODE=injected-token` with `SUPABASE_ACCESS_TOKEN` from
   approved secret storage. `keychain-profile` is **refused** — see the auth
   subsection below for why. Never print the value.
6. **An exclusive Utah migration-writer window**, secured before the first
   linked list and held through the final list: no other operator, workflow,
   Supabase Studio action, CLI process or automation may apply, repair, revert,
   squash or otherwise change migration history or the public schema. Bind
   `LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK` to the exact `RELEASE_SHA`.
7. **`jq` at `/opt/homebrew/bin/jq` or `/usr/bin/jq`**, whichever exists first.
   There is **no path override** — the runner takes a short list of absolute
   candidates and nothing else — and it checks `jq --version` is in the reviewed
   range `jq-1.6` to `jq-1.8`, because `as` binding changed in 1.8 and the
   catalog validator is written for both. The validator was checked against 1.6,
   1.7, 1.7.1, jq-1.7.1-apple, 1.8.0 and 1.8.1 and behaves identically on all
   six.
   ⚠️ **`scripts/run-call-tracking-migrations.sh` is not jq-1.8 safe.** Its
   validator uses `… and .[0] as $s | …`, whose binding changed in jq 1.8, so
   under 1.8.x it dies with `Cannot index boolean with string "history"` and
   hard-stops with *"catalog state … differs from the reviewed contract"* on
   **every** input — which reads as production drift but is a jq incompatibility.
   Homebrew's current `jq` is 1.8.x. If the call-tracking pair still needs
   applying, either run it on a jq-1.7 host or fix that validator first. This is
   reported, not fixed here.
8. **Accepted starting history** (anything else is a hard stop): the reviewed
   36-version baseline, or that baseline plus **both** call-tracking versions
   (`20261027200000` + `20261027220000`), in either case plus any already
   recorded subset of the three targets. One of the two call-tracking versions
   means an interrupted call-tracking run — finish it through
   `scripts/run-call-tracking-migrations.sh` first.

Never `supabase db push`. Never `supabase migration repair`. Never paste the SQL
into the SQL editor or the Management API as a substitute.

## Order relative to `scripts/run-call-tracking-migrations.sh`

**The call-tracking runner must go first.** Its own validator accepts only the
36-version baseline plus a prefix of its two versions — nothing else — so the
moment any lead target is recorded, `scripts/run-call-tracking-migrations.sh`
hard-stops on every input and can never be run again without editing its
baseline. This runner, by contrast, accepts the history both before and after
the call-tracking pair. So: call-tracking pair, then these three. Verified by
reading that sibling's `validate_catalog_state`, not assumed.

**Apply mode enforces it.** If either `20261027200000` or `20261027220000` is
missing from history, `LEAD_MIGRATION_EXECUTION_MODE=apply` hard-stops and tells
you to finish the call-tracking runner first. Preflight still runs on the bare
36-version baseline and reports `call_tracking_recorded=false`, so the state can
be inspected before anything is applied.

## `20261027230000` no longer commits itself

It used to. The file carried its own `begin;`/`commit;`, and CLI 2.113.0 executes
a migration file's statements and then inserts the `schema_migrations` row —
verified in the pinned source, `apps/cli/src/legacy/shared/
legacy-migration-apply.ts:145-153` and `205-234`: the batch is
`BEGIN` → statements → history insert → `COMMIT`, and *"A file with no such
statements is a single BEGIN/COMMIT"*. An inner `commit;` therefore ended the
CLI's transaction **before** the history insert, leaving a window where the
schema change and both backfills were committed with the version unrecorded.

**That window is now closed at the source.** The file has been re-cut in place
without its own transaction (it has never been applied anywhere, so there is no
recorded history row or deployed schema to contradict), its SHA-256 is re-pinned
in the runner, and every contract that applies it now passes `--single-transaction`
(`-1`) to psql — `.github/workflows/ai-referrer-tagging.yml`, the
`lead-migration-rollback` job and `scripts/test-lead-migration-probe.mjs`. A
test asserts that **none** of the three targets contains a `begin;`/`commit;`.

**Why `-1` is now mandatory for any psql-based applier:** without a surrounding
transaction, a bare `psql -f` runs each statement on its own and can leave the
`revoke all on function public.frame_ai_referrer(...)` applied without its
paired `grant execute … to service_role` four lines later — the one state that
breaks every `leads` and `phone_clicks` insert with *permission denied for
function frame_ai_referrer*. The migration's own header says so.

**The hard stop stays anyway.** If the runner ever sees the AI-referrer objects
present with no history row, it prints `STOP AND ESCALATE`, names the receipt
directory and exits non-zero. See acceptance item 3 above for why there is no
replay path.

## Lock note (read before choosing the window)

`20261027230000` runs `ALTER TABLE public.leads` and
`ALTER TABLE public.phone_clicks` and then backfills every resolving row in
both tables **inside its own transaction**, so it holds `ACCESS EXCLUSIVE` on
`public.leads` and `public.phone_clicks` for the whole apply. While it is held,
lead-form inserts and phone-tap inserts block. Preflight prints both row counts
(`lead_rows=`, `phone_click_rows=`) plus a `lock_note=` line so the window can
be sized; run it at a low-traffic hour.

**No `lock_timeout` is set.** The runner does not set one, because the only
statement that would hit it is the `ALTER TABLE` inside the migration's own
transaction, and a half-applied transaction is worse than a wait. The mitigation
is procedural: run off-peak, inside the exclusive window, and if the apply has
not returned within a few minutes at the printed row counts, investigate the
blocking session (`pg_locks` / `pg_stat_activity`) rather than killing the
runner.

## Receipts contain CLI diagnostics

The receipt directory is created under `/private/tmp` with `mktemp -d`, is mode
0700 (verified after creation), and holds the private copy of the CLI, the
private `HOME` the CLI runs with, the staged migration workdir, `probe.sql`,
every read-only request body and status, every catalog read, `run.json`, the
staged-set manifests, and the **stdout and stderr of every CLI call**. In apply
mode it also holds the linked workdir, including `supabase/.temp/pooler-url`.
**Sanitise before sharing a receipt** in a PR, a hub snapshot, chat or anywhere
else. The runner prints `receipt_dir=` as its very first line — before anything
can mutate — so a crashed run is still recoverable, and prints
`receipts_contain_cli_diagnostics=1` in every summary.

Nothing from a CLI or curl stream is ever echoed to the terminal: the CLI puts
server response bodies into its login-role errors, and a Management API error
body can echo request content. A failed call reports its exit status or HTTP
code and the path to its retained stream, and nothing more.

## Preflight is read-only. Apply is not, and cannot be.

An earlier revision of this runbook asked the operator to *acknowledge* that the
preflight mutated the project. That acknowledgement is gone, and so is the
mutation: **every preflight read now goes to the Supabase Management API
read-only query endpoint**, the same surface
`.github/workflows/deploy-edge-function.yml` already uses in production:

```
POST https://api.supabase.com/v1/projects/hdcflshhomzildwqlmwh/database/query/read-only
Authorization: Bearer <token>
Content-Type: application/json
User-Agent: SupabaseCLI/2.113.0
{"query":"<the catalog probe>"}
```

The body is **exactly** `{"query": "…"}`. That is the documented schema — the
API reference for *Run a sql query as supabase_read_only_user* lists `query`
(required string) and `parameters` (optional array) and **no `read_only`
member**; the read-only behaviour comes from the path. An earlier revision of
this runner sent an undocumented `read_only: true`; it has been removed.
Documented success is **201**; the runner accepts **200 or 201** (the reference
shows only 201 and the endpoint is marked Beta) and hard-stops on anything else,
including 401/403/429/500.

The reference also states **"All entity references must be schema qualified."**
Every relation and catalog function in the probe is therefore fully qualified —
`pg_catalog.pg_trigger`, `pg_catalog.pg_class`, `pg_catalog.pg_index`,
`pg_catalog.pg_indexes`, `pg_catalog.pg_namespace`, `pg_catalog.pg_proc`,
`information_schema.columns`, `supabase_migrations.schema_migrations`,
`public.leads`, `public.phone_clicks`, and `pg_catalog.to_regprocedure`,
`pg_catalog.has_function_privilege`, `pg_catalog.pg_get_indexdef`,
`pg_catalog.jsonb_agg`, `pg_catalog.count`. (`coalesce`, `exists` and `case` are
SQL constructs, not schema-qualifiable.) The qualified probe was executed
against a real PostgreSQL 16 to confirm it parses and returns the same values.

**The response is fail-closed before any field is read.** The runner slurps it
(`jq -s`) and requires exactly **one** document that is an **array of exactly
one row object**, with `history` an array of strings, every flag a **JSON
boolean** and every count a **non-negative integer**. Nothing is coerced: a
string `"false"` or `"0"` is a hard stop, and an empty body or empty stream
fails the same gate on jq 1.6 through 1.8. The documented 201 response body is
`{}` in the reference, so the array-of-rows shape is **not** documented — which
is exactly why an unexpected shape can only produce a hard stop, never a
verdict.

The project ref is a **literal in the URL**, so no profile, environment variable
or linked-ref file can redirect it. That the read-only role can see what the
probe needs is not an assumption: that deploy workflow's own production query
selects `m.version::text from supabase_migrations.schema_migrations`, which is
the history table this probe reads, and the rest of the probe is catalog views
plus two `count(*)`s. **I could not call the endpoint myself** — this is read
from the workflow and the API docs, not observed.

**Why the CLI is not used for reads.** `db query --linked` resolves a live
database connection before it runs anything, and that resolution (verified in
supabase/cli v2.113.0, commit `03880bb1`):

- mints a **temporary postgres login role** via
  `POST /v1/projects/<ref>/cli/login-role` with `read_only: false`
  (`apps/cli/src/legacy/shared/legacy-db-config.layer.ts:101-117`);
- from the **third** pooler connect failure onward, lists and **deletes this
  project's IPv4 network bans** (same file, `119-127` and `157-161`);
- and then **discards the connection**, because the query itself goes over the
  Management API anyway (`…/commands/db/query/query.handler.ts:283-289`).

Preflight therefore makes exactly **two** CLI calls, `--version` and
`projects list`, neither of which opens a database connection, and it does
**not** `link`. It prints `cli_calls=version,projects-list` and
`reads=management-api-read-only` so you can see that.

### 🔴 Apply is not read-only

`migration up --linked` needs a database connection and has **no `--password`
flag** at this tag, so the login-role mint and the possible network-ban removal
happen on apply. They are unavoidable apply-time effects, not something an
acknowledgement can remove. The runner prints them as `apply_side_effects=…`
before it mutates anything. Expect a short-lived `cli_login_role`-style role to
appear and expire, and check the project's network-ban list afterwards if the
pooler was flaky during the run.

Apply's own pre-mutation re-probe and its postflight both use the read-only
endpoint; the CLI is used only for `init`, `link` and `migration up`
(`cli_calls=version,projects-list,init,link,migration-up`).

### Auth: injected token only

`LEAD_MIGRATION_AUTH_MODE=injected-token` is the only accepted value, and
`SUPABASE_ACCESS_TOKEN` must be present. **`keychain-profile` mode is refused.**
The read-only endpoint needs a bearer token in both modes, and the only other
source is the macOS Keychain — getting it out would mean running
`security find-generic-password -w` to print the operator's token into a shell
variable, which this repository's rules forbid and which can raise an
interactive Keychain prompt in a non-interactive run. Half-supporting it would
be worse than refusing it.

The token never reaches a process argument list or a file: `curl` reads its
configuration from **stdin** (`--config -`), the config is built by a shell
builtin, and a test asserts that no retained receipt contains the token.

### How the local-vs-remote comparison is done now

There is no `migration list --linked` anywhere — it needs the same database
connection. The comparison is rebuilt locally from the history the read-only
probe returned plus the staged file set: exactly one poison guard per recorded
version, plus exactly the pending targets, compared with `cmp` in both
directions. Postflight re-reads the history and requires it to equal the
matched history plus exactly what was pending.

## Preflight

```bash
cd /path/to/a/clean/checkout/of/RELEASE_SHA       # the self-check requires it
export RELEASE_SHA="$(git rev-parse origin/main)"
export SUPABASE_BIN='/absolute/path/to/reviewed/supabase'   # absolute, not a symlink
export SUPABASE_ACCESS_TOKEN='<injected from approved secret storage>'
export LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK="$RELEASE_SHA"
export LEAD_MIGRATION_AUTH_MODE='injected-token'
# only if jq is not at /opt/homebrew/bin/jq:
# export LEAD_MIGRATION_JQ='/absolute/path/to/jq'
LEAD_MIGRATION_EXECUTION_MODE=preflight scripts/run-lead-migrations.sh
```

Expected output, in this order and nothing else — the summary is an explicit
field allowlist and the catalog JSON is **never** echoed:

```
receipt_dir=/private/tmp/utah-lead-migrations.XXXXXX
mode=preflight
release_sha=… project_ref=… mode=… pending=… lead_rows=… phone_click_rows=…
call_tracking_recorded=… row_count_warning=0 receipt_dir=…
lock_note=…
receipts_contain_cli_diagnostics=1
reads=management-api-read-only
cli_calls=version,projects-list
```

`receipt_dir` is printed **first**, before anything else can happen, so a
crashed run is still recoverable. Retain it: it holds `probe.sql`, the
read-only request bodies and statuses, both catalog reads, `run.json`, the
staged-set manifests, and the stdout **and** stderr of every CLI call.

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

Postflight requires: every object present **and armed** (both triggers enabled
with `tgtype` exactly 7 — row-level `BEFORE INSERT` and nothing else — no `WHEN`
clause, bound to `public.frame_set_ai_referrer`; both spam indexes
`indisvalid and indisready` **and** matching their pinned `pg_get_indexdef`
byte for byte, so a renamed-over or redefined index fails),
`service_role` holding EXECUTE on the classifier
while `anon` and `authenticated` hold none on either function, all three
versions recorded, the final `migration list` equal to the complete expected
version set with no duplicates, and no poison-guard filename anywhere in the
CLI's stdout or stderr (a `grep` that cannot read those files is a hard stop,
not a clean scan). On failure: keep the receipts, release nothing, and **do not**
repair history.

**A row count that fell is reported as a concurrent delete, not a failed
migration.** All three targets are additive; none deletes a row. So if the apply
committed, is recorded, and the final list is fully matched, a lower
`leads`/`phone_clicks` count means something wrote from outside the exclusive
window. The runner prints `row_count_warning=1` and a `WARNING:` line saying
exactly that, and exits 0. Investigate the writer; **do not roll back on that
signal alone.**

## Post-apply verification

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
correct when the objects are gone too — never remove one without the other,
which is why each block below drops the objects and deletes the history row in
**one transaction**.

**This is verified, not asserted.** `supabase/tests/lead_migrations_rollback.sql`
holds a verbatim copy of these three blocks and runs them against a throwaway
`postgres:16-alpine` with the real Utah baselines, the three targets applied and
history rows present (blocking job `lead-migration-rollback` in
`.github/workflows/hook-guards.yml`). It asserts afterwards that every object is
gone, that no history row survived, that no history row it does not own was
touched, and that `leads`/`phone_clicks` row counts are unchanged — i.e. that
catalog and history **agree**. If a block here drifts from that file, CI fails.

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
`lead-migration-runner`) drives the **real** script. The shipped script has **no
test mode**, so the substitution happens in a TEST-ONLY file,
`scripts/test/lead-migration-runner-harness.mjs`, which rewrites a fixed,
asserted list of production constants (the `PATH` line, `SHASUM`, `CURL`,
`TRUSTED_TMP_ROOT`, the jq candidate list) and hands the result to the suite to
commit into its throwaway repository. Each substitution must still match the
shipped text or the harness throws, so the suite cannot drift into testing
something else. The runner's self-verification then compares the executed bytes
with `git show <RELEASE_SHA>:scripts/run-lead-migrations.sh` **inside that
repository**, so it still proves the bytes that ran are the bytes that were
committed — and a working-tree edit after the commit still stops the run. A
separate test asserts the shipped script contains no `TEST_HARNESS`,
`LEAD_MIGRATION_JQ` or `test_harness` string and that nothing outside the test
tree references the harness file.

The stubs are strict: `supabase` **dispatches on the argument array**, never on a
joined string, records argv NUL-separated, logs its cwd, `HOME`, `PATH` and the
full key set of its environment, captures `ps` output for itself and its parent,
and exits 90/91/92 on an unexpected vector, missing pinned flags, or an `init`
whose `--workdir` differs from the pinned one. `curl` requires `-q` as its
**first** argument, parses the config from stdin, records the environment it was
given, and asserts the method, URL, headers and body.

Cases added in this revision: the documented 201 and 200 are accepted and
202/204/400/401/403/429/500 are hard stops; fifteen malformed response bodies —
empty, whitespace, non-JSON, object-not-array, empty array, two rows, two
documents, a string `"false"` where a boolean belongs, a string `"0"` where a
count belongs, a negative and a fractional count, a missing field, and a
malformed `history` — each stop **before any field is read**; the body is exactly
`{"query": …}`; the token reaches the CLI's environment and curl's header but
appears in no argv, no `ps` line, no receipt and no output; a token with a quote,
backslash, space, `$(…)` or newline is refused before anything runs; a hostile
`.curlrc` in the real `HOME` plus `HTTPS_PROXY`/`https_proxy`/`ALL_PROXY`/
`CURL_CA_BUNDLE`/`SSL_CERT_FILE` in the caller's environment all fail to reach
curl; the exact runbook launch form (relative path) works and `SELF_PATH`
resolves before the `cd`; a no-op apply reports `cli_calls=version,projects-list`
and never claims `init`, `link` or `migration-up`; and the CLI's own JSON is
shape-gated the same way.

`node scripts/test-lead-migration-probe.mjs` (blocking job
`lead-migration-probe`) extracts the **real** probe SQL and the runner's **own**
jq validator and escalation detector and runs them against a throwaway
`postgres:16-alpine`. It **refuses to run if `PGDATABASE` is set**: it creates
and drops its own disposable database, so it can never apply migrations or
perturb catalogs in a database the caller chose. It also asserts the probe SQL
is schema-qualified, as the endpoint requires.

`supabase/tests/lead_migrations_rollback.sql` (blocking job
`lead-migration-rollback`) runs a verbatim copy of the rollback above on real
Postgres and asserts catalog and history end up agreeing; a unit test fails if
the runbook and that file drift apart. All three targets are applied there with
`psql -1`, as every psql-based applier now must.

A passing run of any of them is **not** evidence about production state and is
not a substitute for the live preflight.
