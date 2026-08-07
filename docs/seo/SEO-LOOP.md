# SEO Loop (Utah) — live crawl, GSC snapshots, regression-first diff

**Added 2026-08-07.** Ported from the sibling market's implementation. Method originally from the
[seo-god skill](https://github.com/AKCodez/seo-god), implemented natively: no Docker, no container,
**zero npm dependencies**, plain Node.

Canonical cross-market reference (method, honesty rules, porting checklist):
`~/projects/agentic-context-hub/shared/SEO-LOOP-METHOD.md`.

## Why here

The existing `audit-*` scripts are static scans of HTML on disk. None sees what production serves.
This adds real status codes, redirect chains, noindex / thin-content / canonical drift on **rendered**
output, orphan pages by live link graph, Search Console ingestion into dated committed snapshots,
and a regression-first daily readout with a 48h deadman.

Run: `node scripts/seo-snapshot.mjs && node scripts/seo-diff.mjs`
Tests: `node --test scripts/seo-diff.test.mjs scripts/seo-crawl.test.mjs`
Schedule: daily ~06:37 Denver (`12:37` UTC), staggered off the sibling market's window so the two
never contend. Also `workflow_dispatch`.

## GSC: this market uses the URL-PREFIX property, not sc-domain

`DEFAULT_SITE` is `https://www.framerestorationutah.com/` — **with the trailing slash**. The
`sc-domain:` form is inaccessible for this property and the sibling market's Google account is
denied, so the sibling's default would have failed here. Repo variable `GSC_SITE_URL` can override.
Until `GSC_SERVICE_ACCOUNT_JSON` is set the loop runs crawl-only and GSC reads "not measured".

## Honesty rules (non-negotiable)

- **`available: false` / `measured: false` / `position: null` mean NOT MEASURED — never zero.**
- **A failed crawl writes no snapshot** — a fabricated `pages: 0, issues: []` would read as "every
  issue resolved" in tomorrow's diff.
- **First snapshot reports absolutes only** — no delta against zero.
- **Sort before capping** so truncation can never invent a "new" item in a diff.

## It will never edit pages

seo-god's `act` phase is deliberately not ported — its hard laws don't know this market's compliance
gates. Fixes stay human decisions.

`.vercelignore` excludes `data/seo/`, so committed Search Console query data is never served.

## Verified 2026-08-07 — first live production crawl

**151 URLs, all HTTP 200, 148 indexable.** 18/18 unit tests green.

Findings:

| Severity | Issue | Detail |
| --- | --- | --- |
| warn | `noindex-page` (1) | `/review` — verify this is intentional |
| info | `orphan-page` (2) | `/blog/utah/utah-roof-ventilation-guide`, `/pages/general-contracting` |

The orphans are the useful part: both are in the sitemap but **nothing on the live site links to
them**, so they earn little internal crawl equity. Neither the on-disk audits nor Search Console
would have surfaced that — it needs the live link graph. Fixing is a normal reviewed content change
behind the compliance gate, not automation.

## Optional next step

`data/seo/keywords.json` as `{ "keywords": [...] }` (10–30 commercial-intent terms). Positions stay
`null` — honest — until a rank source exists.

## 2026-08-07 — ported from the shared loop method: page dimension + honest query coverage

Ported wholesale. Nothing changed but the host and the Search Console property; the portable
method lives in `shared/SEO-LOOP-METHOD.md`.

**`gsc.top_pages` (added 2026-08-07)** is the `page` dimension pulled on its own: which URLs earn
impressions and where they rank. The loop already fetched `query+page` but kept only a
`query → page` string map, discarding every metric — so nothing downstream could answer "is this
page invisible?". Summing the query rows by page is **not** a substitute even after the query
storage fix below: those rows are still a bounded slice of the query set (≤400 of up to 5,000), and
per-query positions cannot be averaged into a page position. The page dimension is the only source
that answers the question directly. Snapshots written before this key exists report the page
sections as **not measured**, not as zero.

### Added honesty rules

- **A cap counts as truncation wherever it happens.** `gsc.truncated` reports rows dropped by the
  storage cap as well as by the fetch `rowLimit`. Until 2026-08-07 it tested only
  `queryRows.length >= 1000`, so a 400-row pull stored 200 and still reported `truncated: false` —
  the readout then implied full coverage over half the data. Where counts exist the caveat names
  them ("showing 200 of 400"); a maxed-out fetch says "at least", because the true total is unknown.
- **Coverage is reported as an impression share, not a row count.** "200 of 1000 queries" sounds
  like most of the picture; the same slice covering **2.5% of impressions** does not. The caveat
  rides the GSC totals line so it shows on a first snapshot too, where the new-queries section
  cannot render.
- **A clicks-ordered sample is not a sample.** The Search Analytics API only ever returns rows
  clicks-desc and offers no sort control, so on a low-click site every zero-click query sinks below
  every 1-click query no matter how many impressions it carries. `top_queries` therefore stores the
  **union of the top 200 by clicks and the top 200 by impressions** (≤400 rows, impressions-desc):
  clicks answer "what is working", impressions answer "what is invisible", and either ordering alone
  loses one. The fetch also reaches `rowLimit: 5000`, because that zero-click volume lives in the
  tail — at 1000 Utah's stored slice covered 2.5% of its impressions.

**Two porting slips fixed here at the same time:** the workflow's concurrency group read
`seo-loop-texas`, and CI never ran the unit tests in this repo either — so a green PR said
nothing about whether the loop still worked.
