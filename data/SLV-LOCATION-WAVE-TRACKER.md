# SLV Location-Page Wave — Tracker

> Source of truth for the 6-page Salt Lake Valley location-page rebuild kicked off 2026-05-11.
> Lives here, not in CLAUDE.md, so it can be vercelignored + edited frequently without bloating the master context.
> Update after every PR merge or new Drive-pull batch.

Last refreshed: **2026-05-11** (PM)

---

## The 6 Target Pages (SLV premium-ZIP focus per c6ce67c)

| # | Page | Tier | Premium ZIPs |
|---|------|------|--------------|
| 1 | `/locations/cottonwood-heights` | Tier 1 | 84047 / 84093 / 84121 |
| 2 | `/locations/holladay`           | Tier 1 | 84117 / 84121 / 84124 |
| 3 | `/locations/millcreek`          | Tier 2 | 84106 / 84109 (east bench) |
| 4 | `/locations/sandy`              | Tier 1 | 84092 / 84094 (east bench) |
| 5 | `/locations/draper`             | Tier 1 | 84020 (east bench) |
| 6 | `/locations/salt-lake-city`     | Tier 1 | 84102 / 84103 / 84105 / 84108 (east bench) |

---

## Phase A — Foundation (DONE 2026-05-11)

| PR | Title | Merged | Pages touched |
|---|---|---|---|
| **#37** | hero `fetchpriority="high"` + Holladay alt rewrite | 2026-05-11 20:13Z | All 6 |
| **#38** | mid-page navy `.page-cta-inverted` CTA | 2026-05-11 20:13Z | All 6 |

**Net Phase-A effect:** every SLV location page now has (1) LCP-prioritized hero, (2) Holladay-recipe playbook-quality alt on at least one page, (3) 3-CTA layout (hero gold + mid-page navy + footer gold).

---

## Phase B — Hero swaps (1 of 6 done, 5 to go)

Replace generic placeholder hero with authentic CH/SLV photography. Per the playbook: 9 image files per page (800/1200/1600 widths × AVIF/WEBP/JPG), surgical 2-line HTML diff (`<img src>` + `og:image`), playbook-recipe alt text, og:image filename must match `<img src>` filename.

| Page | PR | Hero asset | Status |
|---|---|---|---|
| Cottonwood Heights | **#48 OPEN** | `cottonwood-heights-mt-olympus-golden-hour-2026-{800\|1200\|1600}.{avif\|webp\|jpg}` | ✅ CLEAN/MERGEABLE, all Vercel checks green — awaiting Ryan merge |
| Holladay | — | Blog hero only (`holladay-mt-olympus-architectural-install-2026.webp`) — not yet responsive-cropped to location-page set | ⏳ blocked on responsive-image build OR fresh Drive pull |
| Millcreek | — | Blog hero only (`millcreek-murray-rambler-reroof-2026.webp`) — not yet responsive-cropped | ⏳ blocked on responsive-image build OR fresh Drive pull |
| Sandy | — | Blog hero only (`sandy-east-bench-architectural-install-2026.webp`) — not yet responsive-cropped | ⏳ blocked on responsive-image build OR fresh Drive pull |
| Draper | — | **No photos staged** in `/images/projects/cities/draper-*` | 🚫 blocked on Drive pull |
| Salt Lake City | — | Blog hero only (`salt-lake-city-east-bench-tearoff-2026.webp`) — not yet responsive-cropped | ⏳ blocked on responsive-image build OR fresh Drive pull |

**Unblock path:**
1. **Fastest:** convert the 5 existing blog-hero WEBPs to the 9-file responsive set (3 widths × 3 formats) via the same pipeline used for PR #48's CH photos. Source files already in-repo.
2. **Best:** Ryan pulls 5 fresh Drive photos (one per remaining city) showing actual Frame work or the city's iconic backdrop, runs them through the encode pipeline, ships 5 PRs.

---

## Phase B + C — Out of scope but queued

- **Hero-copy rewrite per city.** PR #48 already flags this: CH hero copy currently reads "Premium Reroofing" but the truthful photo read pairs better with "Need a new roof in Cottonwood Heights?" Same applies to other 5 cities once their hero photo lands.
- **Phase C — workmanship-forward swaps.** Once Landon books a job in each premium ZIP and crews capture install aerials, the current atmospheric heroes get demoted to supporting position and the workmanship photo becomes the new hero.

---

## Linked work (not part of SLV wave but compounds)

- **PR #41** (merged) — homepage hero badge specific-fact rewrite ("5.0 from 20 Google reviews" / "45+ cities")
- **PR #42** (merged) — `form_start` PostHog event site-wide
- **PR #40** (merged) — `#fresh-aerials` "Just Shipped May 2026" homepage section
- **PR #39** (merged) — `track-attribution.js` + thank-you redirect (gclid/fbclid/utm capture)
- **PR #44 / #45 / #47** (merged) — content density refresh waves 1+2+3 across 9 blog posts
- **PR #46 OPEN** — schema entity-graph `@id` linking + Landon Person enrichment (parallel work)
- **PR #43 OPEN** — content density audit script (gating tool for density work)

---

## Hard rules carried forward (every SLV PR)

- ✅ **No drone-inspection language** in alt text or service claims (Landon directive 191ef15, 2026-05-11). "Aerial drone photograph" OK; "drone inspection" forbidden.
- ✅ **og:image filename must match `<img src>` filename** — playbook Section 11.
- ✅ **TX brand-leak grep** must return 0 hits per PR.
- ✅ **Surgical-diff guard** — 2 changed HTML lines per location-page hero swap (img src + og:image only).
- ✅ **9 image files per location page** — 3 widths × 3 formats. Filename pattern: `{city}-{descriptor}-2026-{800\|1200\|1600}.{avif\|webp\|jpg}`.

---

## What "done" looks like

When this tracker can be deleted:
- All 6 SLV location pages have authentic local hero photography (not stock, not generic, not duplicates across pages).
- All 6 have playbook-recipe alt text (4-clause, mentions city + Frame Roofing Utah + environmental signal).
- All 6 have matching og:image / twitter:image.
- Hero copy on all 6 reflects the photo's truthful read (not aspirational headline disconnect).
- A re-run of the SLV review-language audit + density audit shows the SLV pages no longer cluster in the bottom-quartile content-quality tier.
