# Salt Lake City page adoption audit — 2026-08-11

## Decision

Do not replace or republish the live page yet. Keep the current route, canonical,
navigation, and service-intent structure, but adopt the generated draft's sourced
local guidance after the Salt Lake City business identity is verified as one
complete record. The live page currently mixes Salt Lake City and Heber identity
signals, so promotion remains blocked.

This audit is read-only with respect to the live route. It does not authorize a
deployment, Google Business Profile change, review edit, indexing request, or GBP
post.

## Baseline snapshot

- Fixed panel: `roofing contractor salt lake city`, `roof repair salt lake city`,
  and `roof replacement salt lake city`.
- ChatGPT consumer UI: Frame named in 0/3 and cited in 0/3.
- Perplexity Search: Frame named in 0/3 and cited in 0/3.
- Gemini: unmeasured. The Frame enterprise account presents first-use Terms &
  Privacy acceptance; no consent was granted.
- Google mobile organic, depth 30: the existing live SLC route ranked 23 for
  `roof repair salt lake city` and 24 for `roof replacement salt lake city`;
  `roofing contractor salt lake city` did not place the site in the top 30.
- AI Overviews: present for `roofing contractor salt lake city`, with Frame not
  cited; absent on the other two initial fixed-panel queries.
- Map-pack attribution is measured with the proven SLC CID. Three of the four
  mobile queries displayed a local pack; Frame's CID appeared in none of the
  returned pack results.

The canonical machine-readable receipt lives in Command Center's city-page
generator measurement directory. The city note remains `partial`, which is a
promotion-blocking state rather than a passing baseline.

## What should stay from the live page

| Surface | Recommendation | Reason |
|---|---|---|
| Route and canonical | Keep | The established `/locations/salt-lake-city` route is already indexable and is the ranking URL. |
| Title, H1, and core service intent | Keep and refine | Roof repair and replacement intent is direct and locally relevant. |
| Existing site shell | Keep | Navigation, footer framework, responsive components, analytics, and internal-link patterns already integrate with the Utah site. |
| Service and FAQ layout | Keep as the presentation layer | The layout can receive evidence-backed copy without replacing the entire page design. |
| Related service and guide links | Keep after link validation | They support the customer path and topical structure. |

## What should be adopted from the generated draft

| Draft element | Adoption action |
|---|---|
| Salt Lake City permit guidance | Replace universal permit promises with address- and scope-specific guidance linked to official Building Services. |
| Historic-property guidance | Explain designation and Planning review as explicit checks; do not imply every older home is designated. |
| Property observation checklist | Add the roof assembly, access, drainage, flashing, interior, staging, and jurisdiction questions as useful pre-inspection guidance. |
| Carrier-safe storm language | Describe factual condition documentation without predicting coverage, approval, or claim outcome. |
| Evidence register | Preserve official sources beside the claims they support. |
| Proof boundaries | Keep project assets labeled pending until captions and city connection are verified. |
| Identity fail-closed behavior | Do not render a local phone CTA or LocalBusiness identity until the exact SLC record is verified. |

## Blocking identity conflicts on the live page

1. The page's metadata, header, hero, lower CTA, footer, and mobile actions use
   `435-292-8802`, while the LocalBusiness schema and office block use
   `(801) 462-0526` (`locations/salt-lake-city.html`, lines 7, 35, 359-377,
   389-394, 512-522, and 679-686).
2. The schema and office block identify `3920 S 1500 E, Salt Lake City`, while
   the site footer identifies `142 S Main St, Heber City` (lines 50-57, 392-395,
   and 679-680).
3. CID `5689850818145735734` is now proven for the Salt Lake-area profile by a
   matching 2026-08-10 manager-grant email and 2026-07-13 setup guide. However,
   the same `RoofingContractor` graph still includes Heber Yelp, tourism, BBB,
   Angi, Thumbtack, Nextdoor, and Google Maps records in `sameAs` (lines 31-155).
   Those Heber URLs do not belong in the SLC entity graph.
4. The account boundary supplied by the owner is SLC = `ryan@frame`; Heber is a
   separate Utah profile under `ryanconwell99`. The page must not collapse those
   into one local identity.

## Claims requiring proof or safer copy before adoption

The following live-page claims are not accepted as verified by the current SLC
evidence contract. They should be sourced, narrowed, or removed in the adoption
change:

- `$8,000–$28,000`, May-August hail season, a ten-year workmanship warranty,
  the quoted December 2025 review, and a universal permit-handling promise
  (line 389).
- 24/7 response, 24-48-hour scheduling, one-to-four-day reroofs, two-to-four-week
  historic review, and five-to-ten-year roof-life loss (lines 195, 243, 259,
  275, 418, 428, 546, 600, 618, and 636).
- 1,300+ contributing structures and universal material-review rules, roofs
  running 20-30 degrees hotter, a 50% ventilation upgrade recommendation, and
  the business being 15 minutes away (lines 441, 453, and 512).
- General liability, workers' compensation, BBB A+, and review attribution must
  be tied to current, market-appropriate proof before being presented as SLC
  evidence (lines 283, 389, 513, 645, and 678).

This is an evidence finding, not a conclusion that every claim is false.

## Adoption sequence

1. Under the SLC Frame account, finish the exact public entity record. The CID
   and manager grant are proven; the live business name, public phone, address
   or service-area status, hours, and public Maps URL still need direct proof.
   Do not reuse Heber evidence.
2. Replace every SLC page identity surface in one change: metadata, header and
   mobile calls, office/NAP block, LocalBusiness schema, `hasMap`, `sameAs`,
   footer context, and review attribution.
3. Move the draft's sourced permit, historic-review, property-checklist, and
   carrier-safe content into the established live layout. Remove or qualify each
   unsupported claim listed above.
4. Verify every selected project asset and caption as truthful Salt Lake City or
   clearly described regional proof.
5. Complete the fixed named-citation panel. Gemini remains explicitly unmeasured
   until the owner accepts its first-use terms. Map-pack attribution can use the
   now-proven CID, while customer-facing NAP still waits for the remaining fields.
6. Record owner approval, then run the source gate and full five-viewport receipt
   against an immutable deployed preview with the intended freshness marker.
7. Only after all blocking checks pass, use the separately authorized merge and
   release workflow. Verify default-branch CI, deployment, and a new production
   receipt against the canonical customer URL before calling the change live.

## Current gate result

`BLOCKED — adoption plan ready; exact SLC identity, asset proof, complete
measurement panel, and owner publication approval are still required.`
