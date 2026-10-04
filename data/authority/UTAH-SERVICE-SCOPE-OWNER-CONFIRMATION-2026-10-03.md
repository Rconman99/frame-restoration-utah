# Utah service scope — owner confirmation (2026-10-03)

Internal evidence for `data/route-factory/claim-registry.json` claims
`operations.water_flood_emergency_24_7`, `operations.storm_tarping_emergency_24_7`,
`operations.service_scope`, `credentials.iicrc_certification`,
`operations.general_contracting_additions_decks`, and `coverage.slc_profile_wasatch_front`.
Not a public route (`data/*` and `*.md` are excluded by `.vercelignore`).

Recorded 2026-10-03 (PT) from the account owner's direct answers during the Utah
GBP categories/services review (`utah-gbp-categories-services-2026-10-03.md`).

## Round 1 (morning)

| Question | Owner answer |
|---|---|
| Does Utah run real 24/7 emergency response? | Yes, real 24/7 on-call for restoration flood/water services (not routine roofing). |
| Which restoration lines does Utah actually do? | Fire and smoke restoration; mold remediation; siding; solar (plus water/flood). |
| Not selected / not offered | Sewage (Category 3) cleanup; kitchen and bathroom remodels. |

## Round 2 (afternoon follow-up, supersedes the open items from round 1)

| Question | Owner answer |
|---|---|
| Is emergency tarping / storm response 24/7? (C4) | Yes. Utah does 24/7 emergency tarping and storm response. Keep the existing 24/7 tarping/storm copy. |
| IICRC certification? (C10) | Yes, Utah is IICRC-certified. Keep the existing IICRC copy. |
| Additions and decks under general contracting? (C-GC) | Yes, still sold. Keep the copy. Kitchen/bath remodels remain not offered. |

## Coverage (round 2, recorded in PR #302, merged as 7a9805f)

| Question | Owner answer |
|---|---|
| Which area does the Salt Lake City service-area profile cover? | The Wasatch Front: Salt Lake City and the Salt Lake Valley, Davis and Weber counties, and the Utah County valley floor. The Heber City office covers the Heber Valley, Wasatch Back, and Summit County. |

This answer was encoded in PR #302's third commit ("SLC profile covers the Wasatch Front")
and in the merged `locations/salt-lake-city.html` service-area paragraph. Registered on
2026-10-03 as `coverage.slc_profile_wasatch_front` for the Batch 1a city service pages
(Salt Lake City, West Jordan, and South Jordan pages say "served from the Salt Lake City
service-area profile", with no storefront claim). The live GBP service-area list is a
separate, pending owner action and is not asserted by this claim.

## Consequences encoded in PR #302
- "24/7" is valid for water/flood emergencies, emergency tarping, and storm response only.
  Routine roofing (repair, replacement, inspections, estimates), fire and smoke, mold,
  siding, solar and gutters follow business hours (Mon–Fri 8am–7pm, Sat 8am–6pm, Sun closed).
- `scripts/validate-slc-identity.mjs` permits exactly two scoped phrases on the SLC page:
  "24/7 for water and flood emergencies, emergency tarping, and storm response" and
  "24/7 for water and flood emergencies". Every other "24/7" still fails.
- Service schema `hoursAvailable` 24/7 is set on water damage, flood cleanup, emergency
  tarping and storm damage Service nodes only.
- Still open (not encoded): SLC page coverage wording ("Salt Lake City and Millcreek")
  vs. the GBP listing Millcreek only.

Re-confirm before `expiresOn` (2027-01-03) in the claim registry.
