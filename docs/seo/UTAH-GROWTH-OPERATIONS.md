# Utah operational growth loop

Installed into the existing daily `SEO loop (Utah)` workflow; no second scheduler,
paid API calls, owner sends, CRM writes or public mutations. Owner priority is SLC,
then Heber and the Midway/Hideout/Charleston hail guides. This priority is a business
instruction, not a measured profit model.

## Operating contract

1. Existing crawl/GSC collection and exact-query attribution refresh run first.
2. `node scripts/seo-growth-operations.mjs` writes `data/seo/growth/latest.json`
   and `latest.md`, prints the work queue into the Actions summary, and the existing
   bot commits the artifacts. Each source is SHA-256 bound.
3. Crawl errors precede optimization. Inputs older than 48 hours, future snapshots,
   failed/wrong-property GSC and a search-window edge older than seven days block
   discovery promotion. Missing/unreturned data is null, not zero.
4. Query discovery is not an exact query/page baseline. Diagnose the named URL
   using existing targeted GSC evidence before proposing a single-variable edit.
   Protect all existing experiments, integrity corrections and owner gates.
5. SLC's weekly measured calendar/panel-count decision now moves the queue from
   waiting to **observation review due**; September 9 is no longer a permanent hold.
   Missing consumer-AI panels and confounds still block causal claims. Integrity
   corrections stay kept. The homepage experiment needs deployment evidence.
6. Hail release PR #295 is an observation, not an isolated causal experiment. The
   first full day is September 18; explicitly query September 18–October 15 no earlier
   than October 18, subject to final-data availability. Rolling page readings only
   support discovery and never substitute for the fixed-window closeout.
7. Qualified leads → booked inspections → sold jobs → collected revenue remain
   unmeasured until existing attribution and owner-confirmed CRM evidence support
   them. Never translate impressions into projected revenue or overwrite CRM truth.

## Next bounded work

- System lane: review mature SLC observation; locate homepage production receipt;
  select an exact-query/page Heber opportunity from current readings; retain the
  existing 18-city queue rather than duplicate it.
- Owner/evidence lane: reconcile existing request-board responses before asking for
  local job photos/permissions, exact-profile GBP evidence or job outcomes again.
- Consumer-AI lane: use the existing fixed provider panels; missing credentials or
  new spend remain separately approved. No aggregate Google Web data is labeled
  an independently measured AI citation rate.
- Command Center: this is a repository/Actions operational artifact, not a claim
  that an installed Mac runtime was repinned. Runtime adoption remains a separately
  reviewed exact-code/context binding operation.

## Evidence and checks

Texas reference: exact-baseline → isolated change → production proof → dated
readout, as used in PRs #428–430. Utah already had scheduled daily collection;
this closes missing queue/readout integration, not every growth-system dependency.

September18 Davis extension: the same job now tracks Layton and Farmington guides
as two additional priority pages and a separate Davis query-discovery region. Its
fixed campaign window is September19–October16, with readout due no earlier than
October19 MDT and only with fresh inputs and a settled end. The older Heber Valley
window remains unchanged. Missing page rows stay null; Davis activity must never
be recoded as SLC leads or commission. No additional schedule or provider calls.

Google documents that [AI features use the same SEO fundamentals and their traffic
is included in Web search reporting](https://developers.google.com/search/docs/appearance/ai-features).
Its [Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
supports exact filters, final data and bounded results; unreturned query rows are
not proof of no demand. Checked September 18, 2026 UTC.

Tests: `node --test scripts/seo-growth-operations.test.mjs scripts/lib/slv-intervention-queue.test.mjs`.
Generated queue: `npm run sync:slv-interventions && npm run sync:slv-execution-registry`.
Read-only local report: `node scripts/seo-growth-operations.mjs --no-write`.
