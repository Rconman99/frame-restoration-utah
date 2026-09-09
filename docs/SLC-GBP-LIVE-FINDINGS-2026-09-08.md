# SLC profile: current facts and human-applied correction packet

Official authenticated read-only API checks, 2026-09-08 at 23:35 UTC.
Evidence: `data/rank-tracker/evidence/SLC-GBP-OFFICIAL-API-2026-09-08.json`.

The existing Command Center OAuth connection now works for account discovery,
Business Information and Performance (all HTTP 200). The old blanket
quota-zero/API-unapproved blocker is superseded for those endpoints. Reviews
returned HTTP 403; no new review count or rating is claimed.

Exact SLC CID 5689850818145735734 maps to location 9007705197244307984.
This is authenticated API evidence, not a fabricated owner-panel screenshot or
an owner attestation. The separate owner-view receipt is intentionally untouched.

## What is actually missing

The saved service-area list contains only **Millcreek, UT, USA**. Salt Lake City
is not explicitly listed. That does not prove Google never associates the
business with SLC or that adding it will raise rankings; it is a concrete
relevance/configuration gap for the market Ryan wants to grow.

The profile website is `/salt-lake-city`; it correctly redirects HTTP 308 to
`/locations/salt-lake-city`. This is not a broken landing page. The canonical
direct link removes the redirect; tagged URLs could improve website attribution
but do not identify which shared-number phone call belongs to SLC.

Configured services are roof inspection, roof installation and roof repair.
Google's returned category service catalog is not evidence that every catalog
service is configured or offered. Do not bulk-add it.

## Human-applied changes — no GBP mutation authorized by this packet

1. On the exact SLC profile, verify actual service coverage and explicitly save
   **Salt Lake City, UT, USA**, retaining Millcreek if still served. Do not add all
   18 portfolio cities merely because the website has pages for them.
2. Set the website to the canonical destination:
   `https://www.framerestorationutah.com/locations/salt-lake-city`.
   Keep optional UTM attribution as a separately reviewed choice.
3. Preserve **435-292-8802**, **Roofing contractor**, the current business name,
   and **customer-location-only** service-area status. Do not add a storefront,
   the orphaned 801 number, promotional names or unverified services.
4. Re-read the saved profile through the same API afterward and record the exact
   change time. Compare 28-day profile interactions and the fixed Google panel;
   do not promise an immediate ranking increase.

## Demand baseline, August 11–September 7

- Website clicks: **8**; call-button clicks: **1**.
- Maps impressions: 10 desktop, 12 mobile.
- Search impressions: 61 desktop, 40 mobile.
- Each requested metric returned 28 daily rows.

These are Google's profile metrics, not unique people or booked jobs. Do not add
them to website events or CRM records to invent a lead total. Website/CRM and
phone handling need their own booking and outcome evidence.

References: [Google performance API](https://developers.google.com/my-business/reference/performance/rest/v1/locations/fetchMultiDailyMetricsTimeSeries)
and [local ranking guidance](https://support.google.com/business/answer/7091).
Keep ranking relevance, distance and prominence separate from lead handling.
