# Utah aggregate counts

This report belongs in `frame-restoration-utah`: Utah's Supabase project
`hdcflshhomzildwqlmwh` owns the data, and this repository owns its schema and
edge functions. `frame-territory-command` is cross-market and is not the
execution location for this report.

Command Engineer supplies `UTAH_READONLY_DATABASE_URL` through the operator's
environment, using a read-only role in that Utah project. No connection value
is stored here. Node 24+ and `psql` must be installed. The URL must include the
host, user and database; the only supported query option is `sslmode` with
`require` (default), `verify-ca` or `verify-full`. Percent-encode URL components
as needed. The runner passes connection settings through the child environment,
not command-line arguments, and ignores ambient libpq connection settings.

```sh
# Previous completed Monday–Sunday week in America/Denver (Utah).
node scripts/utah-weekly-counts.mjs
# Explicit Monday, through the next Monday exclusively.
node scripts/utah-weekly-counts.mjs --week 2026-09-07
# Complete September calendar month, through October 1 exclusively.
node scripts/utah-weekly-counts.mjs --month 2026-09
```

All boundaries are local midnight in `America/Denver`, inclusive at the start
and exclusive at the end. PostgreSQL resolves daylight-saving offsets. The
September window is `[2026-09-01 00:00:00 America/Denver,
2026-10-01 00:00:00 America/Denver)`. Explicit modes may include a future or
unfinished period; counts reflect only rows visible at execution time.

Standard output contains exactly eight nonnegative integer lines in this order:

| Line | Metric | Window/filter |
| --- | --- | --- |
| 1 | Calls total | `call_logs.created_at` |
| 2 | Calls answered | Same window; `status = 'completed' AND duration_seconds > 0` |
| 3 | Calls with a lead | Same window; `lead_id IS NOT NULL` |
| 4 | Leads total | `leads.created_at` |
| 5 | Leads with city | Same window; city contains a non-whitespace character |
| 6 | Leads with city and source | Same window; nonblank city and either nonblank `source_page` or `utm_source` |
| 7 | Review requests | `review_requested_at` in window, regardless of lead creation date |
| 8 | Won | `won_at` in window, regardless of lead creation date or current status |

Every count excludes `is_test = true` and includes false/NULL markers. Calls
linked to a lead are counted by presence of the link; no join or distinct-person
inference is made. Review requests and won are timestamp counts, not status
counts. The historical **2 all-time won** reference must not be treated as a
September expectation. No expected city-and-source count was supplied.

The checked-in SQL has only aggregate SELECTs using quoted psql variables
`window_start` and `window_end`. The runner validates it before execution,
wraps it in `BEGIN TRANSACTION READ ONLY, ISOLATION LEVEL REPEATABLE READ` and
`ROLLBACK`, and uses `ON_ERROR_STOP=1` with startup files/password prompts off.
All eight queries share one snapshot. Failure closes the connection (rolling
back the transaction), suppresses partial counts and reports a generic error
without psql diagnostics. Each query has a 30-second statement timeout.

CI runs `node scripts/audit-utah-weekly-counts.mjs` and
`node --test scripts/utah-weekly-counts.test.mjs` with mocks only. The guard
accepts exactly the eight count statements and their approved filters; it
rejects forbidden PII columns, row projections, grouping, extra statements,
dynamic SQL and psql commands. This does not establish database permissions,
RLS coverage, deployed schema compatibility or actual counts. Command Engineer
must verify role visibility and run the report read-only to reconcile the
scoreboard, including its original timezone. No database validation is claimed.

PostgreSQL references: [psql variables and execution options](https://www.postgresql.org/docs/current/app-psql.html),
[transaction modes](https://www.postgresql.org/docs/current/sql-set-transaction.html).
