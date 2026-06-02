# Frame Roofing Utah — GBP Services Proposal

**Date:** 2026-05-27
**Purpose:** Add a Services section to the GBP so Google can match more local-pack queries to Frame. Each service Google approves becomes a keyword anchor used by their query-understanding model.
**Status:** Draft for Ryan's review. **Do not submit until Ryan approves.**

---

## Why this matters

GBP Services are the strongest unused local-pack signal on Frame's profile right now. Today the profile shows zero services. Google treats blank Services as "this business hasn't told us what they actually do" — which is a credibility/freshness ding even when the description is good.

For a local roofer competing on "roofers near me" / "roof repair Heber City" / etc., a populated Services list typically lifts pack visibility within 2–3 weeks of the edits clearing.

---

## Policy guardrails I followed when drafting

| Rule | How I applied it |
|---|---|
| No phone numbers in descriptions | Removed |
| No URLs | None used |
| No promo language ("free", "call now", "discount") | Stripped |
| No subjective superlatives ("premium", "best", "#1") | Removed |
| No mentions of Google reviews or stars | Avoided entirely (DPNB risk per the prior posting violation) |
| Description ≤ ~300 chars per service | All under |
| Only services Frame actually offers | Confirmed against memory `project_frame_photo_authenticity` + on-site Pages catalogue |
| **No drone inspection** (Landon ruled out 2026-05-11) | Excluded |

---

## Tier A — Predefined Google services (toggle ON, no custom text needed)

These are Google's preset service names mapped to "Roofing contractor". Selecting them costs nothing and they all match real Frame work.

- [ ] Roof installation
- [ ] Roof replacement
- [ ] Roof repair
- [ ] Roof inspection
- [ ] Storm damage repair
- [ ] Hail damage repair
- [ ] Leak repair
- [ ] Shingle installation
- [ ] Asphalt shingle installation
- [ ] Metal roof installation
- [ ] Flat roof installation
- [ ] Flashing repair
- [ ] Roof ventilation
- [ ] Skylight installation
- [ ] Gutter installation
- [ ] Gutter repair
- [ ] Gutter cleaning

> If Google's UI only shows some of these (the predefined list varies by region), check each one that appears and skip the rest — I'll cover the misses with custom services below.

---

## Tier B — Custom services with SEO-targeted descriptions

Custom services let you match long-tail and locality-specific queries that the predefined list misses. Each description is policy-safe (factual, no promo language).

| # | Service name | Description (≤300 chars) |
|---|---|---|
| 1 | **Residential Reroofing** | Full tear-off and reroofing for single-family homes across the Wasatch Front and Heber Valley. Includes plywood decking inspection, new underlayment, drip edge, valley metal, and flashing replacement. |
| 2 | **Storm & Hail Damage Roofing** | Storm and hail damage roofing for Utah homeowners. We document the damage, provide a line-item scope your adjuster can read, and meet your adjuster on site when requested. The claim stays between you and your insurer — we don't adjust. (Renamed from "Insurance Claim Roofing" 2026-06-01 — claim navigation / supplement prep is licensed adjusting under Utah §31A-26-201; the original wording is a violation.) |
| 3 | **Designer Shake Reroofing** | Synthetic and composite shake-style roofing installation including Brava, DaVinci, and CertainTeed Grand Manor. Common for Park City, Midway, Alpine, and Heber-area homes. |
| 4 | **Standing-Seam Metal Roofing** | Mountain-grade standing-seam metal panel roofing for residential and commercial buildings. Snow-shed and fire-resistance benefits relevant to Wasatch Front conditions. |
| 5 | **Snow & Ice Damage Repair** | Ice dam, snow load, and freeze-thaw damage assessment and repair. Includes heat-cable installation and ventilation correction to prevent recurrence. |
| 6 | **Wind Damage Roof Repair** | Lifted-shingle, missing-shingle, and ridge-cap repair following Wasatch Front wind events. Same-week service for active leaks. |
| 7 | **Roof Tarping (Emergency Mitigation)** | Tarp installation for active leaks while a permanent repair is scheduled. Available across the Wasatch Front. |
| 8 | **Solar-Ready Roof Replacement** | Reroofing planned to support a future or concurrent rooftop solar install. Includes upgraded decking and conduit pre-routing where applicable. |
| 9 | **Commercial Flat Roofing (TPO/EPDM)** | Single-ply membrane roofing systems for commercial buildings and multifamily properties. Includes tear-off, recover, and maintenance. |
| 10 | **Gutter & Downspout Replacement** | Seamless aluminum gutter and downspout fabrication and installation. Includes gutter guard options. |

---

## Service-area locality notes (no edit needed, just FYI)

Google reads service AREAS from the Location tab (currently set to 142 S Main St, Heber City). For a contractor, you also want to enable **"Service area"** mode listing the cities you'll travel to. If that's not already configured, the cities to list are (matches the description we just submitted):

Heber City · Park City · Midway · Provo · Orem · Salt Lake City · Sandy · Holladay · Cottonwood Heights · Bountiful · Layton · Ogden · Wasatch Front · Heber Valley

---

## Things I would NOT add even if asked

| Service | Reason |
|---|---|
| Drone inspection | Landon ruled out 2026-05-11 (memory `feedback_no_drone_marketing`) |
| "Free roof inspection" or any "free" service | Promo language → instant rejection trigger |
| "24/7 emergency response" as a separate service | Better as a description bullet; standalone is borderline promo |
| Anything mentioning Google reviews / star ratings | DPNB violation territory — Frame is on enforcement watch |
| Specific warranty length as a service name | Same as above — borderline promotional |

---

## Approval checklist (Ryan, mark the ones you want submitted)

- [ ] Submit all 17 Tier A predefined services Google offers
- [ ] Submit all 10 Tier B custom services as-drafted
- [ ] Submit Tier B services with edits (note changes inline)
- [ ] Hold off on a specific Tier B service: `___________`

Once you've marked, reply "submit" and I'll execute via Claude in Chrome.
