# SLC lead growth — seven-item execution record

Observed September 8, 2026. Scope: Utah / Landon only. These are dated findings,
not a claim that seven fixes shipped or that ranking gains have occurred.

Release receipt: PR286 merged at21:22:35 UTC as
`e5c7d5bb1c86233ea66c7d9815fec671e6f31625`. Source60, immutable preview160,
and canonical production170 rendered checks passed without failures. Production
`track-clicks.js` SHA256 `dea48b7b079fd97a78afb6a73ad4bc7491e30fab3b662c084a2b95323c0a6212`
matches reviewed source; normal JS revalidation remains enabled. Main blocking
checks pass. Fresh rank run34280344748 is separate from rollout proof.
The dated findings below preserve the investigation state; the two implemented
repairs are now released, not the owner-gated remaining work. Real-device,
inbound-call/MMS and booked-job outcome tests were not performed.

Shared context: hub PR81 merged as28f0f6de157fdf9a6d7aec6fe8c2c38276dab110.
The runtime sync attempt correctly refused the now-stale pinned hub snapshot;
a reviewed context rebind remains necessary before claiming these new facts
appear in the running Command Center. No binding override was performed.

## Outcome and baseline

The primary demonstrated acquisition gap is low commercial-search visibility.
The exact four-query GSC panel, August 9–September 5, reports 2,114 impressions
and 0 clicks to the intended SLC canonical. This is not all SLC search traffic.

| Exact query | Impressions | Clicks | GSC average position |
|---|---:|---:|---:|
| roofing contractor salt lake city | 259 | 0 | 32.5 |
| roof repair salt lake city | 1,518 | 0 | 24.8 |
| roof replacement salt lake city | 336 | 0 | 25.9 |
| roofer salt lake city | 1 | 0 | 35 |

Source: `data/rank-tracker/SLV-GSC-URL-ATTRIBUTION-LATEST.json`, snapshot September8.
All returned rows select `/locations/salt-lake-city`; no alternate URL appears in
these particular GSC rows. Do not manufacture a cannibalization diagnosis.

Separate live CRM read, September8 21:12 UTC, August11–September7 UTC:
five records have city Salt Lake City; all five remain `new`; none has populated
`job_value` or `margin`. One record matches an SLC source-page filter. These
overlapping slices cannot be added together or called five website acquisitions.
Four `phone_clicks` records match an SLC source page; all four have null city.
Click events are not unique callers, connected calls, qualified leads, or bookings.
No customer names, contact details, addresses, message bodies or credentials
were retrieved for the aggregate report. No CRM rows were changed.

## Seven workstreams

| # | Workstream | Verified state / work performed | Remaining completion gate |
|---|---|---|---|
| 1 | GBP/site identity | Existing SLC identity audit passes. Preserve public 435-292-8802 and exact SLC CID5689850818145735734. The 801 DID is not approved public NAP. | Current owner-view evidence still needed before any GBP edit. Do not publish a storefront address for the SAB. |
| 2 | Visibility and GBP performance | Reconciled fresh GSC panel. Found September7 rank run34105777358 collected measurements but crashed in intervention sync. Implemented safe unexpected-URL diagnosis hold and artifact preservation. | Merge/check the repair, then recover a fresh complete fixed panel. Current GBP impressions, search terms, calls and website clicks remain unknown. |
| 3 | Conversion path | Live SLC page already offers call, text and calendar scheduling. Rendered source check passes. No local hero form exists, despite a dormant form listener. Prepared bounded customer-copy test below. | Complete experiment evaluation before publishing copy; verify actual calendar completion and CRM booking linkage, not merely a CTA click. |
| 4 | Local proof | Confirmed SLC/Holladay/Millcreek approved project assets are already present. Found internal repository/backlog jargon in customer-facing captions. Prepared factual replacements below. | One-variable proof placement/caption experiment with rendered preview and production receipts; no invented project costs, dates, customer quotes or warranty claims. |
| 5 | AEO | Direct answer, FAQs, ordinary schema, official-source links already exist. JSON-LD audit passes. Consumer-AI ledger explicitly says invalid-provider-credential/unmeasured. | Restore an approved measurement capability, retain the exact panel, then report each engine separately. Do not represent absent measurements as zero visibility. |
| 6 | Lead/revenue attribution | Reproduced clean-URL city parsing defect; fixed shared tracker with regression coverage wired into blocking SLC audit. Read actual CRM aggregates above. | Preview/production proof for tracker; resolve five open CRM outcomes with Landon; populate actual job value/margin. Existing PR267 handles referrer parsing and PR272 handles tracker coverage separately. |
| 7 | Text/photo reliability | Live Twilio GET September8 21:10 UTC: 8802 and0526 have handle-sms + sms-fallback;8978 has neither despite SMS/MMS capability. Complete number list checked, no routing writes. | 8978 routing requires explicit configuration approval and preserved rollback; PR283 fallback source remains separate Claude-owned work. A fallback URL is not an inbound-MMS delivery test. |

## Implemented repairs and regression prevention

1. `guardSelectedOrganicUrls` treats a different/malformed selected URL as
   evidence requiring read-only diagnosis. It forces Monitor while preserving
   the original experiment, owner, integrity and foothold gates. Unranked nulls
   remain unranked; malformed shape still fails. The original assertion treated
   Google's choice as a code invariant and discarded the entire completed run.
2. A temporary-fixture integration test injects the failure into the SLC
   portfolio, runs actual queue write/check, and proves false URL-selection
   evidence persists without opening a public-action gate. Unit tests cover
   canonical/HTML/trailing-slash URLs, foreign hosts and malformed values.
3. Rank workflow archives the existing `data/rank-tracker/` after failures too.
   Archive existence does not prove freshness: always check its observedAt and
   completeness. No failed job is converted into a green measurement.
4. Shared click tracker now recognizes production extensionless city routes.
   Existing mutable-JS `must-revalidate` policy is preserved; page HTML, title,
   H1, canonical, identity and experimental content are unchanged.

Residual technical debt: separate expansion-city intended-URL assertions remain;
this is the observed intervention-sync failure repair, not a guarantee every
possible 18-city pipeline change can pass. Click tracker also has duplicate-event
risks (touchstart plus click, fetch plus beacon, and legacy inline listeners).
Do not infer visitor-to-lead conversion by dividing these raw event counts.
No historical click backfill or CRM reclassification was performed.

## Ready-to-implement content test, after the experiment gate

Earliest existing evaluation: **2026-09-09T04:40:58Z** (September8 9:40pm Pacific).
Time elapsed alone is not an evaluation. Check complete comparable panels and
record the outcome; keep required factual corrections regardless of rank.
Source: `data/seo-experiments/utah-slc-entity-trust-correction-2026-08-12.json`.

Keep the current H1, canonical, NAP, real roofing imagery, navy/gold system,
mobile call/text controls and source-linked permit guidance. Do not add an owner
portrait hero or bulk city/service pages.

First test: move the existing SLC proof block immediately after the quick facts
and use customer-readable captions. Treat the grouped proof presentation as one
declared test; leave title/H1/service copy unchanged.

- SLC caption: “Residential roof tear-off in Salt Lake City.”
- Millcreek caption: “Commercial roof tear-off in Millcreek.”
- Holladay caption: “Completed residential roof in Holladay.”
- Intro: “See examples of our residential and commercial roofing work in the Salt Lake Valley.”

These replace internal phrases about the repository and GBP backlog; retain the
existing asset-to-location provenance in internal records, not in sales copy.

Second, separate test: shorten the introductory text to a plain customer answer
and compare scheduling engagement only after attribution is dependable:
“Need a roof repair or replacement in Salt Lake City? Frame Restoration Utah
inspects the roof, documents what we find, and explains the next steps. Call
435-292-8802 or request a free inspection.” Preserve availability qualifiers and
do not promise emergency response times or fixed prices without owner evidence.

Rank/lead review cadence: weekly same-query organic and exact-CID Maps panels;
28-day GSC query/page windows; per-engine AI panels; qualified inquiries,
connected calls, booked inspections, won jobs, actual job value and actual margin
reported as separate stages. Compare like windows and annotate tracking changes.

## Access and policy boundaries

The Claude connector bridge attempted a read-only GBP/PostHog evidence pull and
timed out (exit142), returning no usable data. This does not prove the accounts
are disconnected. Repository owner-evidence file remains awaiting current proof.
Do not ask for credentials in chat or bypass Google approval through automation.

For SMS, same-day live routing independently supersedes the old missing-fallback
claim. `sms-fallback` in PR283 announces attachment counts but does not relay
photos; normal media forwarding and fallback recovery are separate tests.
Never use an arbitrary outbound picture as proof of the inbound relay.

Google says local ranking depends primarily on relevance, distance and prominence;
accurate profile information and genuine reviews/links are appropriate work,
not guaranteed rankings: https://support.google.com/business/answer/7091 .
Google's AI guidance requires no special AI schema or extra optimization:
https://developers.google.com/search/docs/appearance/ai-features .
There is no justified universal review-count threshold or promised citation lift
in this plan. GBP edits, review requests, outreach, number configuration, ads and
indexing actions remain gated; none was performed here.
