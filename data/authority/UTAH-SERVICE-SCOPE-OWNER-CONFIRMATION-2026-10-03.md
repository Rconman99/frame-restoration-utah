# Utah service scope — owner confirmation (2026-10-03)

Internal evidence for `data/route-factory/claim-registry.json` claims
`operations.water_flood_emergency_24_7` and `operations.service_scope`.
Not a public route (`data/*` and `*.md` are excluded by `.vercelignore`).

Recorded 2026-10-03 (PT) from the account owner's direct answers during the Utah
GBP categories/services review (`utah-gbp-categories-services-2026-10-03.md`):

| Question | Owner answer |
|---|---|
| Does Utah run real 24/7 emergency response? | Yes, real 24/7 on-call — **for restoration flood/water services only** (not roofing). |
| Which restoration lines does Utah actually do? | Fire and smoke restoration; mold remediation; siding; solar (plus water/flood). |
| Not selected / not offered | Sewage (Category 3) cleanup; kitchen and bathroom remodels. |

Consequences encoded in this PR:
- "24/7" may appear only in water/flood emergency copy. Roofing, emergency tarping,
  fire, mold, siding, solar and gutters follow business hours
  (Mon–Fri 8am–7pm, Sat 8am–6pm, Sun closed).
- `scripts/validate-slc-identity.mjs` permits exactly the scoped phrase
  "24/7 for water and flood emergencies" on the SLC page; every other "24/7" still fails.
- Still open (not encoded): after-hours tarping (C4), IICRC/other certifications (C10),
  whether additions/decks are still sold under general contracting (C-GC).

Re-confirm before `expiresOn` (2027-01-03) in the claim registry.
