# Heber Valley hail campaign — evidence-led implementation plan

Decision date: 2026-09-17 America/Los_Angeles. Baseline source: main d2c377a81791b4a8aa685e074824a5f2001527ea. Release status belongs in the release receipt; this plan alone does not prove deployment, indexing or leads.

## Evidence and decisions

Google recommends crawlable internal links, useful original content, good page experience and visible/schema parity for both Search and its AI features. There is no special AI schema requirement or guaranteed inclusion. [Google AI guidance](https://developers.google.com/search/docs/appearance/ai-features), [crawlable links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).

Source inspection: none of the three new guides was linked from the homepage or storm service page. Existing forms retain first-touch landing/UTM attribution, but not an explicit guide context. Storm service FAQ schema still asserted a universal 45–60-day insurance window, contradicting its policy-specific visible answer. Homepage callback copy promised 15 minutes without current operational proof.

The user's report is evidence that a homeowner reported hail, not independent proof of its date, measured size, damage to any roof or exact geographic footprint. Supplied photo remains unpublished pending capture details and publication permission. Existing project images must retain their true location and historical-project caption. Do not relabel a Midway job as Hideout/Charleston storm damage.

## Ranked queue and acceptance

| Priority | Work | Evidence/acceptance | Gate/status |
| --- | --- | --- | --- |
| 1 | Discovery and answer accuracy | Compact, crawlable links from home + storm page to all three guides; no new doorway pages; FAQ visible/schema parity | Implement now; source/preview/production receipts |
| 2 | Inquiry context | Article → form retains allowlisted `roof_guide` in the actual submit-page `source_page` URL; UTMs, first landing, message, issue and property city remain unchanged; SMS remains optional | Implement now; intercepted browser tests, no real leads |
| 3 | Storm evidence | Capture date/time/timezone, actual location, photographer permission, measured size only if known; official report if available | Owner input; never manufacture evidence |
| 4 | Local distribution | Relevant GBP update + photo and guide button; owner-approved neighborhood/HOA sharing | Draft below; no automatic public posting |
| 5 | Inspection case study | Actual inspection date/town, observed roof conditions, permission-cleared photos, scope/outcome; explain if no damage found | Owner/crew evidence required; no fake urgency or claim outcomes |
| 6 | Earned local mentions | Useful evidence/checklist offered to a real community editor or existing HOA relationship | Draft below; no scraped outreach, purchased links or seeded endorsements |
| 7 | Measure and decide | GSC exact-URL discovery/impressions/clicks → inquiries → confirmed inspections → jobs; separate per-engine citation panel | Baseline unknown where not measured; scheduled windows below are a plan, not a running job |

## Measurement contract

Canonical guides: `/blog/midway/hail-roof-inspection-midway`, `/blog/hideout/hail-roof-inspection-hideout`, `/blog/charleston/hail-roof-inspection-charleston`.

Latest pre-change evidence: sitemap accepted/downloaded 2026-09-18 03:07Z (UTC), 152 submitted URLs, zero reported errors/warnings. Individual inspections reported unknown-to-Google, not indexed; sitemap submission is not indexing proof. Receipt directory: local `outputs/hail-expansion-20260917/`. Do not resubmit repeatedly to imply acceleration.

At days 7 (September 24) and 28 (October 15), compare exact-page Web Search impressions, clicks, query mix and selected canonical; account for reporting delay. Join first landing/UTM plus `source_page=/?roof_guide=<town>` to deduplicated inquiries, actual property town, booked inspection and job outcome in private CRM. That parameter is guide context, not the property's location. A click is not a delivered message, qualified lead, booking or sale. Call/text attribution is existing click tracking, not proof of carrier delivery. No campaign performance gain has yet been measured.

Review caught and removed an unsafe first draft that prepended tracking text to `message`: that field controls lead triage. The final design only carries an allowlisted query on the actual submit-page URL. It does not require a backend deploy. Static homepage forms are covered; JavaScript-disabled submissions keep their normal POST fallback but cannot enrich context, and existing modal/phone/text paths are not claimed as campaign form attribution.

AI panel: for each of Midway/Hideout/Charleston, repeat “Who inspects hail-damaged roofs in [town], Utah?” and “What should I do after hail hits my roof in [town], Utah?” on each actually accessible consumer engine (ChatGPT, Perplexity, Google AI features, Gemini). Record engine/version, date, location context, full prompt, answer/source URLs, whether Frame is named and whether its URL is cited. Denominator is completed eligible runs; missing runs are unknown, never zero. No new paid runs are authorized by this plan. Existing engine baselines: not verified for this campaign. Google Web Search reports combine AI and traditional traffic; do not label them a separate AI-overview metric. Keep/revise the experiment from evidence, not a fabricated score; retain factual corrections even if a ranking experiment is inconclusive.

## Landon evidence request — DRAFT, not sent

“We have homeowner hail guides for Midway, Hideout and Charleston. Please confirm the photo’s capture date/time and town, who took it and permission to publish. If your crew has inspected roofs, send the actual town/date, what they observed, permission-cleared photos, and current appointment availability. Please do not share customer addresses/policy documents publicly. We will only describe damage, visit times and outcomes you can substantiate.”

## GBP / community draft — owner review required, not sent or posted

“Concerned about your roof after hail in the Heber Valley? Our homeowner guides explain what to photograph safely from the ground, what to tell an inspector and how to keep records. Do not climb onto the roof to check for damage. Read the guide for your town and contact Frame Restoration Utah to request a free inspection. Please confirm appointment availability with our team.”

Use the corresponding canonical guide as the GBP Learn more button; no phone number in post body. Use only the relevant actual business profile, not a fabricated local branch. Original photo only after permission/capture verification. Owner may share helpful information in communities where participation is allowed and disclose affiliation; no repetitive group blasting or manufactured testimonials. [GBP post guidance](https://support.google.com/business/answer/7342169), [local visibility factors](https://support.google.com/business/answer/7091).

External distribution may use `utm_source=google&utm_medium=organic&utm_campaign=heber_valley_hail&utm_content=gbp_midway` (substitute actual source/town); internal links must not reset acquisition with UTMs.

## Local editor / HOA draft — not sent

“We put together town-specific homeowner roof-check guides covering safe ground-level documentation and questions to ask before scheduling an inspection. If useful to your residents, you are welcome to link to the relevant guide. We can provide verified local inspection observations and permission-cleared photos when available. We represent Frame Restoration Utah.”

## Release and rollback

Quality gate note: use the pre-existing rapid-response guide exception from `MIDWAY-HAIL-ARTICLE-2026-09-17.md`: content profile with 500 distinct words plus each guide's separate 1150-total-word floor. Default 800-distinct-vocabulary scan still fails (523/570/611), retained as a known diagnostic; no padding to satisfy a vocabulary quota. Similarity/uniqueness checks remain enabled. AEO gate is yellow for limited first-hand specifics/authority surfaces, not a promise of rankings. No made-up statistics or unrelated directory identifiers will be added just to clear a heuristic. Existing homepage 24/7 service assertions outside the two form intros were not independently reverified in this bounded campaign; owner availability validation remains open.

No changes to Twilio/Supabase handlers, tracking numbers, SMS consent language, ad spend, GBP, DNS or runtime binding. Isolated branch; leave other lanes' PRs untouched. Require independent review and green blocking CI at exact head, then squash merge. Verify default-branch CI, canonical bytes and five-viewport surface receipt before saying live. New CSS scoped to new components. Revert the reviewed campaign commit if conversion/rendering regresses; preserve factual corrections in a follow-up. Browser emulation does not certify real iOS/Android, screen readers, carrier delivery or achieved search ranking.
