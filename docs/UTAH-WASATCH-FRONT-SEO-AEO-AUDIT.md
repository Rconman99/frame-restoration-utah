# Frame Restoration Utah — Wasatch Front SEO/AEO Audit

> **Date:** 2026-06-17 · **Auditor:** Opus 4.8 (orchestrator) + 3 read-only evidence agents · **Site:** https://www.framerestorationutah.com
> **Scope:** Audit + plan ONLY. No production changes, no push, no deploy, no Supabase writes.
> **Evidence basis:** live crawl of 18 production URLs (2026-06-17), repo `main` @ `bb0f8fd`, prior audit docs, and the `frame-utah-aeo` AI-visibility tracker.
> **Integrity rule:** Rankings, GSC clicks/impressions, organic traffic, live GBP state, and live AI-citation results are **UNKNOWN** unless a file or live check provided them — none are fabricated. Point-in-time tracker numbers are dated and labeled.

---

## 1. Executive Summary

**The site is technically excellent and is NOT what's holding back organic leads.** Live crawl confirms: every page 200, canonical correct on the new domain, clean index/follow, rich valid schema, consistent NAP, public phone only, mobile Call/Text live, AI crawlers allowed, sitemap complete. The 4 priority city pages (Holladay, Cottonwood Heights, Sandy, Midvale) are genuinely city-specific (real neighborhoods, ZIPs, geography, 12 FAQ Q&As, ~1,250–1,500 words each) — **not thin, not boilerplate-only.**

**What is actually hurting Wasatch Front organic leads** is the off-page + proof layer, and a structural local-pack limit:

- **Where strong:** technical SEO, on-page metadata, entity/schema markup, canonical/domain consistency post-swap, NAP consistency, city-page *content depth*, mobile conversion affordances.
- **Where weak:** off-page authority (very few indexed third-party citations → AI answers cite competitors), local *proof* on city pages (no city project photos/before-afters, no city-specific testimonials, **AggregateRating missing on every location page**), review velocity (29 vs competitors' 54–105), no Wasatch Front / Salt Lake Valley **hub page**, and AEO answer content for insurance-documentation queries.
- **Most hurting organic leads right now:** thin off-page authority + missing local proof on the SLV city pages. The pages exist and read well, but nothing external corroborates Frame as the SLV roofer, and the pages don't *show* SLV work.
- **Most hurting AI/AEO visibility:** lack of third-party consensus. Per the AI tracker (2026-06-11), Frame is cited in **3/22** Perplexity roofing queries — **all 3 are Heber City**; Frame is absent on every Salt Lake City / SLV / Park City / Lehi / Draper query. AI cites competitors (amcoroof, bartlettroofs, modernize, parkcityroofingpros, mwroofingutah).
- **What needs to happen first:** (1) reconcile the brand/entity + `business.json` canonical_host so off-site citations stop fragmenting; (2) add local proof (photos + city reviews + AggregateRating) to the 4 target city pages; (3) build a Salt Lake Valley hub; (4) drive review velocity; (5) execute the off-page citation pipeline.
- **What should NOT be prioritized yet:** chasing Salt Lake Valley **map-pack** dominance via content/schema — the verified GBP pin is in Heber City (~30 mi south), so the SLV local pack is proximity-gated and largely unreachable without a real staffed SLV location. Do not stand up a fake/virtual pin (suspension risk + prior enforcement history). Also defer: more schema-for-its-own-sake, llms.txt polishing, net-new city pages for unserved areas.

### Top 5 blockers (evidence-backed)
1. **Off-page authority gap** — directory pipeline shows only **1 "citing"** (Angi) of ~19 targets; AI cites competitors not Frame outside Heber. *(frame-utah-aeo CONSENSUS-DIGEST 2026-06-12)*
2. **Local proof gap on city pages** — 1 image/page, **0 city-specific project photos/before-afters**, **AggregateRating on 0/53 location pages**, city reviews are a shared pool not city-tied. *(city-page agent)*
3. **Review velocity deficit** — Frame 5.0★ / ~29 vs roofingutah.com 54, Vault 105, Kimball 65. *(REVIEW-VELOCITY / competitor-reviews 2026-06-09)*
4. **Brand/entity + source-of-truth drift** — `business.json` `canonical_host` still `www.frameroofingutah.com` after the live swap to `www.framerestorationutah.com`; legal-entity name unconfirmed; off-site docs + AEO tracker still hard-code old brand → citation NAP fragmentation (the historical SEO problem). *(repo agent)*
5. **No Wasatch Front / SLV hub page** — nothing consolidates the valley cluster or its internal-link authority. *(city-page agent)*

### Top 5 fastest wins
1. Fix `business.json` `canonical_host` → `www.framerestorationutah.com` (1-line source-of-truth fix; gates other tooling). *(P0, Ryan)*
2. Reconcile homepage vs About **AggregateRating** (29 vs 20) and lengthen the **homepage meta description** (currently 34 chars). *(P0, Ryan)*
3. Add **AggregateRating** + a city-true testimonial to Holladay / Cottonwood Heights / Sandy / Midvale. *(P1, Ryan + Landon for review text)*
4. Build the **Midvale storm-damage subpage** (only target missing one; the other 3 have it). *(P1, Ryan)*
5. Fix the **H1 no-space concatenation** ("Roof RepairAcross Utah" as read by crawlers/AI). *(P1, Ryan)*

### Top 5 Wasatch Front opportunities
1. **Salt Lake Valley roofing hub** + Holladay/CH/Sandy/Midvale cluster cross-linking → consolidate organic authority.
2. **Local proof layer** — real SLV job photos + before/after + per-city reviews (Landon-supplied) → the differentiator AI + buyers both reward.
3. **Insurance-documentation AEO answer pages** (compliant, §31A-safe) — "what info does insurance need about my roof," UL 2218 Class 4 in Utah — high-intent, low-competition, citable.
4. **Review velocity to 60+** to close the competitor gap and seed AIO attribute coverage (cleanup / warranty / free-inspection are <15%).
5. **Off-page citation execution** — finish the ~9 todo directory claims + `site:` index verification + manufacturer locators → the ~80% AEO lever.

---

## 2. Verified Current State

| Area | Status | Evidence | Notes |
|---|---|---|---|
| Live domain | **VERIFIED** | curl 2026-06-17 | `https://www.framerestorationutah.com` serves 200, no forward; swap complete |
| Active brand name (live) | **VERIFIED** | live HTML, all pages | "Frame Restoration Utah" in visible copy + schema `name` everywhere; `alternateName` "Frame Roofing Utah" (1×, intentional) |
| Legal/entity name | **PARTIAL** | schema `legalName` = "Frame Restoration Utah LLC"; `BRAND-DECISION` notes state record may be "FRAME RESTORATION LLC" | **Unconfirmed** registered name — needs owner/Sec-of-State confirmation |
| `business.json` canonical_host | **VERIFIED STALE** | `data/route-factory/business.json` = `www.frameroofingutah.com` | Live site canonicals to `www.framerestorationutah.com` → source-of-truth file not updated post-swap |
| Homepage | **VERIFIED** | live | 200, index/follow, 10 JSON-LD blocks, rich entity graph; meta desc too short (34 chars) |
| Service pages (14) | **VERIFIED** | live | All 200, index/follow, FAQPage on most; titles/metas in range |
| Location pages (target 4 + others) | **VERIFIED** | live + repo | All 200, city-specific, 12 FAQ Q&As, ~1,250–1,500w; AggregateRating absent |
| Sitemap | **VERIFIED** | `/sitemap.xml` | 138 `<loc>`, all new domain, all targets + storm subpages present |
| Robots | **VERIFIED** | `/robots.txt` | `Allow: /`; AI crawlers allowed (GPTBot/ClaudeBot/PerplexityBot/Google-Extended); Bytespider/Ahrefs blocked; header comment still says old brand (cosmetic) |
| Schema | **VERIFIED** | live + SITE-AUDIT 2026-06-01 (364 blocks, 0 invalid) | RoofingContractor/Org/FAQPage/Service/BreadcrumbList/Review/GeoCoordinates/hasMap/sameAs all present; AggregateRating only on home+about |
| GBP / NAP info | **PARTIAL** | `business.json` (cid/place_id/data_id), `GBP-SERVICE-AREA-AUDIT 2026-05-11` | GBP service area = 10 cities (5/11); enforcement watch reported CLEARED 2026-06-03; **live GBP dashboard state = UNKNOWN (needs owner login)** |
| Citation tracker | **VERIFIED (point-in-time)** | `frame-utah-aeo` consensus-pipeline 2026-06-12 | 19 targets: 1 citing (Angi), 5 indexed, 3 live, ~2 submitted, ~9 todo |
| Reviews | **PARTIAL** | `reviews.json` (5.0★/29, synced 2026-05-11); REVIEW-VELOCITY flags live likely higher | **Live count UNKNOWN** (files show 27 on 6/01, 29 on 6/09) |
| GSC / indexing | **NEEDS ACCESS** | — | No live GSC clicks/impressions/coverage in repo; **UNKNOWN** — needs GSC property access (ryanconwell99 verified per CLAUDE.md) |
| AI/AEO tracker | **VERIFIED (point-in-time)** | `frame-utah-aeo/ai-visibility/latest.md` 2026-06-11 | Frame cited **3/22** Perplexity queries, all Heber City; absent on SLV/SLC/PC; **live current results UNKNOWN** without re-run |
| Lead/conversion tracking | **PARTIAL** | live `data-cta` hooks + `track-clicks.js`; CLAUDE.md (PostHog, phone_clicks, handle-lead) | Instrumentation present; **actual lead/call volumes = UNKNOWN** (Supabase read out of scope this pass) |
| Core Web Vitals | **PARTIAL** | SITE-AUDIT 2026-06-01 lab: LCP 291ms/CLS 0.02/TTFB 35ms; no CrUX field | **Field CWV/INP UNKNOWN** — needs CrUX/PSI; site too low-traffic for CrUX inclusion historically |

---

## 3. Wasatch Front Opportunity Map

> **Three lanes are intentionally separated.** GBP pin is in **Heber City** — Salt Lake Valley cities are ~20–35 mi away, so the **local map pack is proximity-gated and largely unreachable** for these cities without a real staffed SLV location. **Organic SEO** and **AEO** are winnable from Heber; **local pack** is not (today). Do not create a fake/virtual SLV pin (suspension risk + prior enforcement history).

| City | Page Exists? | Current Strength | Organic Opportunity | Local Pack Reality | Needed Proof | Priority |
|---|---|---|---|---|---|---|
| Holladay | Yes (+storm) | Strong (493 uniq, city-true) | High | Proximity-limited (no pin) | Photos, city review, AggRating | **P0** |
| Cottonwood Heights | Yes (+storm) | Strong (554 uniq) | High | Proximity-limited | Photos, city review, AggRating | **P0** |
| Sandy | Yes (+storm) | Strong (572 uniq, has Review schema*) | High | In GBP service area (5/11) but pin far | Photos, city-tied review, AggRating | **P0** |
| Midvale | Yes (**no storm sub**) | Strong (491 uniq) | High | Proximity-limited | **Storm subpage**, photos, review, AggRating | **P0** |
| Salt Lake City | Yes | Strong (587 uniq, Review*) | High (broad) | In service area; competitive | Photos, reviews, authority | **P1** |
| Millcreek | Yes (+storm) | Strong (555 uniq, Review*) | Medium-High | Proximity-limited | Photos, AggRating | **P1** |
| Murray | Yes (+storm) | Strong (539 uniq) | Medium-High | Proximity-limited | Photos, review, AggRating | **P1** |
| Draper | Yes (+storm) | Strong (537 uniq) | Medium | In service area | Photos, AggRating | **P1** |
| South Jordan | Yes | Strong (528 uniq) | Medium | In service area | Photos | **P2** |
| West Jordan | Yes | Strong (516 uniq, Review*) | Medium | Proximity | Photos | **P2** |
| South Salt Lake | Yes | Strong (569 uniq) | Medium | Proximity | Photos | **P2** |
| Taylorsville | Yes | Medium (499 uniq) | Medium | Proximity | Depth + photos | **P2** |
| Riverton | Yes | Medium (491 uniq) | Lower | Proximity | Depth + photos | **P2** |
| Herriman | Yes | Medium (494 uniq) | Lower | Proximity | Depth + photos | **P2** |
| Alpine / Highland | Yes | Strong (custom H1s) | Niche (Utah County) | Proximity | Existing | **Parked** |
| Heber City / Park City | Yes | Anchor markets | **Maintain only** | Pin is here → strong | — | **Parked (anchor)** |

\* "Review schema" on Sandy/Millcreek/WJ/SLC = a real Google review from a shared pool, **not city-specific**. AggregateRating present on **0** location pages.

**Lane separation summary:**
- **Organic SEO opportunity:** HIGH and winnable from Heber for all SLV targets — content depth already exists; needs proof + links + hub + reviews.
- **Local pack / GBP opportunity:** CONSTRAINED by proximity. Realistic plays: expand GBP service-area list (toward Google's ~20 cap), keep NAP perfectly consistent, drive reviews — but expect map-pack wins mainly near Heber Valley, not Holladay/CH/Sandy/Midvale, absent a real SLV address.
- **AEO opportunity:** HIGH and winnable — off-page consensus + answer pages can get Frame cited for SLV queries independent of the map pack.

---

## 4. What Is Hurting Rankings Most

| Rank | Issue | Severity | Evidence | Why It Hurts SEO/AEO | Owner | Fix |
|---|---|---|---|---|---|---|
| 1 | Weak off-page authority / third-party consensus | **Critical** | pipeline 1 citing/19 (2026-06-12); AI cites competitors | AI + Google both weight independent corroboration; Frame has almost none outside Heber | Ryan+Landon | Execute citation pipeline + `site:` index-verify + manufacturer locators |
| 2 | Missing local proof on city pages (photos/before-after/AggRating) | **Critical** | 1 image/page; AggRating 0/53; reviews not city-tied (city-page agent) | No corroboration that Frame does SLV work; weak E-E-A-T + conversion | Landon (assets) + Ryan (impl) | Add real SLV job photos + AggregateRating + city reviews |
| 3 | Review velocity deficit | **High** | 29 vs 54/65/105 competitors (2026-06-09) | Top-3 local-pack + trust factor; thin AIO attribute coverage | Landon | Review-request cadence to 60+; seed cleanup/warranty/free-inspection attributes |
| 4 | No Wasatch Front / SLV hub page | **High** | no hub found (city-page agent) | No authority consolidation or cluster cross-linking for the valley | Ryan | Build `/locations/salt-lake-valley` (or hub) + cross-link cluster |
| 5 | Brand/entity + canonical_host drift | **High** | business.json canonical_host stale; off-site docs old brand | Citation/NAP fragmentation = the historical Frame SEO problem | Ryan+Landon | Reconcile source-of-truth + directory NAP to live brand |
| 6 | AEO answer-content gap (insurance docs / Class 4) | **Medium** | 0/7 AIO cited Frame (5/20); no dedicated answer pages | Misses high-intent, low-competition citable queries | Ryan | Build compliant answer pages (see §8) |
| 7 | Stat/citation density LOW on location + service pages | **Medium** | content-density 2026-05-11 (all 45 loc + 13 svc LOW) | Fewer extractable facts for AI snippets | Ryan | Add stats + outbound citations to cornerstone pages (concentrated, not repeated) |
| 8 | GBP proximity to SLV | **Medium (structural)** | pin = Heber City; targets 20–35mi | Caps map-pack reach in SLV | Landon (biz decision) | Do NOT fake a pin; revisit only with a real SLV location |
| 9 | Homepage meta desc too short + H1 no-space + AggRating mismatch (29 vs 20) | **Low** | live crawl | Minor CTR/parse/consistency loss | Ryan | Quick metadata fixes |
| 10 | Insufficient live GSC/AI measurement loop | **Medium** | GenAI report US-locked; tracker not yet cron | Can't see what's working | Ryan | Stand up weekly AI-visibility cron + GSC baseline export |

*(Only items with file/live evidence are listed; speculative damage was excluded.)*

---

## 5. SEO Scorecard

> Grades reflect **verified** current state. Categories dependent on data we can't see (GSC, live GBP) are graded on available evidence and flagged.

| Category | Current Grade | Evidence | Main Problem | Target Grade | First Fix |
|---|---|---|---|---|---|
| 1. Technical SEO | **A** | live: 200s, canonical clean, robots good, SITE-AUDIT SEO 100 | Agentic-browsing 67 (a11y tree) | A+ | Fix agent-accessibility-tree + H1 spacing |
| 2. Indexing/GSC | **UNKNOWN (B?)** | sitemap 138 clean; no live GSC data | No visibility into coverage/clicks | B+ | Export GSC baseline (needs access) |
| 3. On-page SEO | **A−** | titles/metas in range, H1s present | Homepage meta 34 chars; H1 no-space | A | Metadata polish |
| 4. Local SEO/GBP | **C** | GBP 10-city area; pin in Heber; live state unknown | Proximity + manual-publish only | C+ | Expand service area; perfect NAP |
| 5. NAP/citations | **C** | business.json source-of-truth; pipeline 1 citing/19; canonical_host stale | Few indexed citations; brand drift in docs | B | Reconcile + execute pipeline |
| 6. Brand/entity consistency | **B (live) / C (ecosystem)** | live clean; off-site docs + tracker stale | Legal name unconfirmed; canonical_host stale | A− | Source-of-truth reconcile |
| 7. Wasatch Front city pages | **B+** | city-specific, deep, schema-rich | No proof/photos/AggRating; shared boilerplate tail | A | Proof layer + reduce boilerplate ratio |
| 8. Service pages | **B** | FAQPage, in-range metadata | Low stat/citation density | A− | Add stats + cites to cornerstones |
| 9. Roofing topical authority | **B** | broad blog + service + city coverage | Density + few external links in | A− | Cornerstone depth + backlinks |
| 10. Internal linking | **B+** | 6–54 internal links/page; clusters exist | No SLV hub to anchor | A | Build hub + cluster links |
| 11. Schema/entity markup | **A−** | 364 blocks 0 invalid; hasMap/sameAs 47/47 | AggRating missing on city pages | A | Add AggregateRating to location pages |
| 12. Reviews/reputation | **C+** | 5.0★/~29; competitors 54–105 | Velocity + city-tying | B+ | Review cadence to 60+ |
| 13. Project proof/photos | **D** | 1 image/page, 0 city job photos | No visual proof of SLV work | B | Landon photo pipeline |
| 14. Backlinks/local authority | **D/UNKNOWN** | DR low (CLAUDE.md history); pipeline early | Almost no third-party authority | C+ | Citations + local PR/chamber |
| 15. AEO/AI visibility | **D+** | 3/22 Perplexity, Heber-only (6/11); 0/7 AIO (5/20) | No SLV consensus | C+ | Off-page + answer pages + measure |
| 16. Conversion/CRO | **B+** | mobile Call/Text live; 3-field forms (CLAUDE.md) | Thin trust proof on city pages | A− | City proof + review blocks |
| 17. Tracking/analytics | **B** | PostHog + track-clicks + attribution | No live AI/GSC loop surfaced | A− | Weekly AI cron + GSC export |
| 18. Overall Wasatch Front readiness | **C+** | strong base, weak proof+authority+pack | Off-page + proof + proximity | B+ | Execute §11 plan |

---

## 6. Page-by-Page Audit

| URL/Page | Purpose | SEO Issue | AEO Issue | Conversion Issue | Priority | Recommended Fix |
|---|---|---|---|---|---|---|
| `/` | Brand/convert | Meta desc 34 chars; AggRating 29 vs About's 20 | Strong entity graph — OK | Mobile CTA live — OK | P0 | Lengthen meta; reconcile rating count |
| `/pages/roof-replacement` | Core service | Low stat density | FAQ present; add Class-4/cost facts | OK | P1 | Add stats + citations |
| `/pages/roof-repair` | Core service | No FAQPage; H1 no-space | Add Q&A | OK | P1 | Add FAQPage + fix H1 |
| `/pages/storm-damage` | High-intent | 1,039w but 0 stats/cites | Add storm/hail data, Class-4 | OK | P1 | Concentrate stats here (cornerstone) |
| `/pages/insurance-claims` | High-intent | Density low | **AEO cornerstone** for insurance-doc queries (§31A-compliant) | Ensure compliant CTA | **P0** | Build answer content (see §8) — compliance-gated |
| `/locations/holladay` | City | Shared boilerplate tail; no AggRating | No city proof for AI | No photos/testimonial | **P0** | AggRating + city photo + city review |
| `/locations/cottonwood-heights` | City | same | same | same | **P0** | same |
| `/locations/sandy` | City | Review not city-tied; no AggRating | same | Photos | **P0** | City-tie review + AggRating + photos |
| `/locations/midvale` | City | **No storm subpage**; no AggRating | No storm-intent capture | Photos | **P0** | Build storm subpage + proof |
| `/locations/<other SLV>` | City | Boilerplate ratio; no AggRating | Thin proof | Photos | P1–P2 | Batch proof + AggRating |
| `/pages/about` | E-E-A-T | H1 reused from homepage; AggRating 20 (vs 29) | Person/Org entity OK | OK | P1 | About-specific H1; reconcile rating |
| `/contact` (form/`#contact`) | Convert | — | — | Verify mobile submit not covered (fixed for sticky bar) | P1 | Confirm form CRO |
| `/thank-you` | Post-convert | noindex (correct) | — | Has Call CTA | OK | none |
| `/review` | Reviews | noindex/nofollow (correct); no meta desc/H1 (acceptable) | — | One-tap writereview live | OK | none |
| **(missing)** `/locations/salt-lake-valley` hub | Cluster anchor | **Does not exist** | No valley consensus hub | — | **P1** | Build hub (see §7) |

---

## 7. Wasatch Front Content Architecture

> Goal: consolidate organic authority for the SLV cluster and create answer-ready, citable assets. **Do not create pages for unserved areas. Do not fabricate proof.**

| Page/Asset | Target Query | Intent | Why Needed | Owner | Priority |
|---|---|---|---|---|---|
| **Salt Lake Valley roofing hub** `/locations/salt-lake-valley` | "roofing salt lake valley", "salt lake valley roofer" | Commercial | No hub exists; anchors + cross-links the cluster | Ryan | **P0** |
| Wasatch Front hub (or section on SLV hub) | "wasatch front roofing" | Commercial | Umbrella authority | Ryan | P1 |
| Holladay city page upgrade | "roofing contractor Holladay Utah", "roof replacement Holladay" | Commercial | Proof + AggRating + photo | Ryan+Landon | **P0** |
| Cottonwood Heights upgrade | "roofing contractor Cottonwood Heights", "roof repair Cottonwood Heights" | Commercial | same | Ryan+Landon | **P0** |
| Sandy upgrade | "roof replacement Sandy", "roofing contractor Sandy" | Commercial | city-tie review + AggRating | Ryan+Landon | **P0** |
| Midvale upgrade + **storm subpage** `/locations/midvale/storm-damage` | "roof repair Midvale Utah", "storm damage roof repair Midvale" | Commercial/urgent | only target missing storm sub | Ryan | **P0** |
| SLV storm hub | "storm damage roof repair Salt Lake Valley" | Urgent | consolidate storm intent | Ryan | P1 |
| Insurance-documentation answer page | "roof insurance documentation Utah", "what roof information does insurance need" | Informational/high-intent | citable, low-competition, §31A-safe | Ryan | **P0** |
| Class-4 / UL 2218 answer page | "UL 2218 Class 3/Class 4 roof rating Utah", "Class 4 shingles Utah" | Informational | citable, ties to hail/insurance | Ryan | P1 |
| Metal roofing SLV (only if served) | "metal roofing Salt Lake Valley" | Commercial | confirm Frame offers before building | Landon confirm → Ryan | P2 |
| "Best roofer near {CH/Sandy/Holladay}" comparison/FAQ | "best roofer near Cottonwood Heights / Sandy / Holladay" | Commercial-investigational | AEO + buyer trust | Ryan | P1 |
| City case-study pages (per real job) | "{city} roof replacement before after" | Proof | E-E-A-T + AI proof | Landon (assets) + Ryan | P1 |
| Internal-link hub block (cluster) | — | — | wire hub ↔ city ↔ service ↔ blog | Ryan | P1 |

---

## 8. AEO / AI Visibility Plan

> **Baseline (point-in-time, 2026-06-11, `frame-utah-aeo/latest.md`):** Frame cited in 3/22 Perplexity queries — all Heber City. Live current results **UNKNOWN** without re-running the tracker. AI requirements: clear entity · trusted third-party citations · reviews · city proof · project photos · schema · FAQ/answer content · citation consistency.

| AI Query | Current Result | Desired Result | Missing Evidence | Needed Page/Citation/Proof | Owner |
|---|---|---|---|---|---|
| best roofer in Holladay Utah | Absent (competitors cited) | Cited | Holladay proof + citations | Holladay proof upgrade + directory citations | Ryan+Landon |
| roofing contractor Cottonwood Heights | Absent | Cited | CH proof + consensus | CH upgrade + citations | Ryan+Landon |
| roof replacement Sandy Utah | Absent | Cited | Sandy reviews/photos | Sandy upgrade | Ryan+Landon |
| roof repair Midvale Utah | Absent | Cited | Midvale storm/proof | Midvale storm subpage + proof | Ryan |
| storm damage roof repair Salt Lake Valley | Absent | Cited | SLV storm hub + citations | SLV storm hub | Ryan |
| who is Frame Restoration Utah | UNKNOWN | Clear entity answer | Entity consensus across directories | Reconcile brand + citations | Ryan+Landon |
| who is Frame Roofing Utah | UNKNOWN | Resolve to same entity | alternateName + sameAs consensus | Keep alternateName; align directories | Ryan |
| roof insurance documentation Utah | Absent | Cited | §31A-safe answer page | Insurance-doc answer page | Ryan |
| what information does insurance need about my roof | Absent | Cited | answer page + FAQ schema | same | Ryan |
| UL 2218 Class 4 shingles Utah | Absent | Cited | Class-4 answer page | Class-4 page + cites | Ryan |

**AEO execution (the ~80% lever, per AEO-BUILDOUT-HANDOFF 2026-06-03):** finish the ~9 todo directory claims (Houzz, Expertise, Three Best Rated, Modernize, CertainTeed/TAMKO locators, Heber Valley Chamber, local press), **`site:` verify each is actually indexed** (the step everyone skips), keep AI crawlers allowed, and stand up the weekly `check.mjs` cron to watch 3/22 → N. On-page is table-stakes already paid — do not over-invest in more markup.

---

## 9. Local Proof / Project Asset Plan

> All proof must be **real**. No fabricated before/afters, no invented testimonials, no pages for unserved cities.

| Asset Needed | City | Why It Matters | Owner | Proof Format | Priority |
|---|---|---|---|---|---|
| 2–3 real job photos | Holladay | City proof for SEO/AEO + conversion | Landon | JPG/WEBP, dated, geotag/neighborhood note | **P0** |
| 2–3 real job photos | Cottonwood Heights | same | Landon | same | **P0** |
| 2–3 real job photos | Sandy | same | Landon | same | **P0** |
| 2–3 real job photos | Midvale | same | Landon | same | **P0** |
| Before/after pair (same roof) | any SLV | strongest visual proof | Landon | matched same-roof pair only | P1 |
| Roof type + shingle/manufacturer per job | each | material authority + Class-4 story | Landon | short caption | P1 |
| City-specific (non-private) customer story | Holladay/CH/Midvale | testimonial gap | Landon | name + city, consent | P1 |
| Review request push | all targets | velocity 29→60 | Landon | Google one-tap, real customers, no incentives | **P0** |
| Insurance roof-documentation example (redacted) | — | AEO answer-page proof, §31A-safe | Landon | redacted scope/photos | P1 |
| Job closeout data (product/warranty) | each | E-E-A-T specifics | Landon | structured note | P2 |

---

## 10. Conversion / Lead Path Audit

| Conversion Element | Current State | Issue | Fix | Priority |
|---|---|---|---|---|
| Mobile Call/Text bar | **Live** (shipped 2026-06-16) | none | maintain | — |
| Phone visibility | 292-8802 site-wide, header + sticky | none | maintain | — |
| Lead form flow | 3-field (CLAUDE.md PR #10) | verify submit not covered (fixed for sticky bar) | spot-check live | P1 |
| Mobile conversion | dual CTA + safe-area | verified clean | maintain | — |
| Trust blocks | BBB A+, licensed/insured, 5.0★ | city pages lack proof blocks | add city proof/review blocks | P1 |
| Review proof | homepage carousel; city pages none | AggRating missing on city pages | add AggRating + city reviews | **P0** |
| Warranty/license/insurance claims | 10-yr workmanship, DOPL #, BBB | ensure §31A-safe wording on insurance copy | compliance sweep on insurance pages | P1 |
| Emergency wording | 24/7 storm response present | OK | maintain | — |
| Lead routing | handle-lead → email/SMS/CRM (CLAUDE.md) | not in scope (no Supabase writes) | UNKNOWN this pass | — |
| Call tracking | Twilio 292-8802 + track-clicks | working (CLAUDE.md) | maintain | — |
| Spam / UL-request separation | classifier in CRM (CLAUDE.md) | CRM data out of scope | UNKNOWN this pass | — |

---

## 11. 30/60/90 Day Game Plan

| Phase | Timeline | Goal | Ryan/Dev Tasks | Landon/Owner Tasks | Success Criteria |
|---|---|---|---|---|---|
| **Short** | 0–14 days | Fix entity/source-of-truth + target-city proof + baselines | Fix `business.json` canonical_host; reconcile AggRating; lengthen home meta; fix H1 spacing; add AggRating + (Landon) reviews to 4 targets; build Midvale storm subpage; SLV hub scaffold; internal-link cluster; GSC baseline export; AI tracker cron | Supply SLV job photos (4 cities); push review requests; confirm legal entity name; GBP screenshots/access; confirm served cities | Source-of-truth consistent; 4 targets have proof+AggRating; Midvale storm live; GSC + AI baseline captured |
| **Mid** | 15–60 days | Proof + hub + citations + answer pages | Publish city case studies; finish SLV/Wasatch hub + storm hub; insurance-doc + Class-4 answer pages (§31A-safe); concentrate stats/cites on cornerstones; citation pipeline execution + `site:` verify | Provide before/afters + material data; review cadence to 60; local relationships (chamber/press) | Hub live + cross-linked; ≥3 answer pages; citations todo→indexed; reviews → ~45–60 |
| **Long** | 60–180 days | Authority + AEO command loop | Local backlink/PR; topical clusters; GSC/AEO-driven optimization; weekly territory-command report | Ongoing reviews; community mentions; LSA enrollment (GL cert + background check) | AI citations 3/22 → target; reviews 60+; measurable SLV organic lead lift in GSC/CRM |

---

## 12. Task Split: Ryan vs Landon

| Owner | Task | Why | Proof Required | Priority |
|---|---|---|---|---|
| Ryan | Fix `business.json` canonical_host → new domain | Source-of-truth gates tooling/citations | diff | **P0** |
| Ryan | Reconcile AggRating (29 vs 20) + add to city pages | Schema consistency + trust | live schema | **P0** |
| Ryan | Build Midvale storm subpage + SLV hub | Cluster + intent capture | new pages | **P0/P1** |
| Ryan | Insurance-doc + Class-4 answer pages (§31A-safe) | AEO citable assets | compliance gate green | P1 |
| Ryan | Internal-link cluster + metadata polish + H1 fix | Authority + hygiene | diff | P1 |
| Ryan | GSC baseline export + weekly AI-visibility cron | Measurement loop | data files | P1 |
| Ryan | Citation pipeline execution support + `site:` verify | Off-page (the ~80%) | indexed checks | P1 |
| Landon | Real SLV project photos (4 target cities) | Local proof for SEO/AEO/CRO | dated photos | **P0** |
| Landon | Review velocity push (→60) | Top-3 local factor | GBP review count | **P0** |
| Landon | Confirm legal entity name (Sec of State) | Resolve unconfirmed legal name | filing/screenshot | P1 |
| Landon | GBP access/screenshots + confirm served cities | Verify live GBP state (currently UNKNOWN) | screenshots | P1 |
| Landon | Before/after + material/warranty per job | E-E-A-T specifics | assets | P1 |
| Landon | Local relationships/mentions (chamber/press) | Backlinks/authority | links | P2 |

---

## 13. First 7-Day Sprint

> Focus only on: highest blockers · Wasatch Front core pages · proof collection · schema/NAP · GSC/AEO baseline · conversion checks. **No production changes ship without Ryan approval of a follow-up implementation sprint.**

**Day 1**
- Ryan: Approve audit; greenlight implementation sprint scope. Fix `business.json` canonical_host (1-line). Capture GSC baseline export.
- Landon: Start pulling 2–3 real job photos each for Holladay, Cottonwood Heights, Sandy, Midvale.

**Day 2**
- Ryan: Reconcile AggregateRating (home 29 vs about 20) → single source; lengthen homepage meta description; fix H1 no-space across service pages.
- Landon: Send review requests to recent completed jobs (real customers, Google one-tap).

**Day 3**
- Ryan: Add AggregateRating schema to the 4 target city pages; scaffold `/locations/salt-lake-valley` hub.
- Landon: Confirm legal entity name (Sec of State) + which SLV cities are actually served.

**Day 4**
- Ryan: Build Midvale storm-damage subpage (mirror Holladay/CH/Sandy pattern, city-true content).
- Landon: Provide a city-true testimonial (consented) for Holladay or CH.

**Day 5**
- Ryan: Wire internal-link cluster (hub ↔ 4 city pages ↔ storm subs ↔ service pages); insert supplied photos.
- Landon: GBP screenshots (services, service-area, review count) so live GBP state moves from UNKNOWN → VERIFIED.

**Day 6**
- Ryan: Re-run `frame-utah-aeo/check.mjs` to refresh the AI-citation baseline; stand up the weekly cron.
- Landon: Continue review push; gather before/after pair if available.

**Day 7**
- Ryan: Draft insurance-documentation answer page (compliance-gated, §31A-safe); compile sprint report (baseline deltas).
- Landon: Confirm citation-claim access for the ~9 todo directories.

---

## 14. Implementation Backlog (DRAFT — do not create issues until Ryan approves)

1. **Fix business.json canonical_host to new domain** · P0 · Ryan · BG: source-of-truth stale post-swap · AC: `canonical_host=www.framerestorationutah.com`, gates pass · Proof: diff · Dep: none
2. **Reconcile AggregateRating count site-wide** · P0 · Ryan · BG: home 29 vs about 20 · AC: single consistent count from reviews.json · Proof: live schema · Dep: review feed sync
3. **Add AggregateRating to all location pages** · P0 · Ryan · BG: 0/53 have it · AC: valid AggRating, passes review-integrity gate (no cloned fake) · Proof: schema validator · Dep: #2
4. **Build Midvale storm-damage subpage** · P0 · Ryan · BG: only target missing one · AC: city-true ≥650w, schema, sitemap · Proof: live page · Dep: none
5. **Scaffold Salt Lake Valley hub page** · P0 · Ryan · BG: no hub exists · AC: hub + cluster links + schema · Proof: live · Dep: none
6. **Lengthen homepage meta description** · P0 · Ryan · BG: 34 chars · AC: 130–155 chars · Proof: live · Dep: none
7. **Fix H1 no-space concatenation (service pages)** · P1 · Ryan · BG: "Roof RepairAcross Utah" · AC: space in rendered text node · Proof: live · Dep: none
8. **Add real SLV job photos to 4 target city pages** · P0 · Ryan(impl)+Landon(assets) · AC: ≥2 city photos/page w/ alt · Proof: live · Dep: Landon assets
9. **Add city-true testimonial to Holladay/CH/Midvale** · P1 · Ryan+Landon · AC: real consented review, city-tied · Proof: live · Dep: Landon
10. **Insurance-documentation AEO answer page (§31A-safe)** · P0 · Ryan · AC: compliant copy, FAQ schema, compliance gate green · Proof: gate · Dep: compliance review
11. **UL 2218 Class 4 answer page** · P1 · Ryan · AC: citable facts + cites · Proof: live · Dep: none
12. **Internal-link cluster wiring (hub↔city↔service↔blog)** · P1 · Ryan · AC: bidirectional links, link gate green · Proof: gate · Dep: #5
13. **Reduce boilerplate ratio on location pages** · P2 · Ryan · BG: 44/53 share exact sentences · AC: vary shared tail, keep unique core · Proof: density audit · Dep: none
14. **Concentrate stats+citations on cornerstones (storm/insurance)** · P1 · Ryan · AC: density ≥ target on cornerstones only · Proof: density audit · Dep: none
15. **GSC baseline export + dashboard** · P1 · Ryan · AC: 30-day baseline captured · Proof: data file · Dep: GSC access
16. **Weekly AI-visibility cron (check.mjs)** · P1 · Ryan · AC: scheduled, logs to jsonl · Proof: cron + log · Dep: bridge Chrome
17. **Citation pipeline execution + `site:` index verify (~9 todo)** · P1 · Ryan+Landon · AC: todo→indexed with proof · Proof: site: checks · Dep: Landon access
18. **GBP service-area expansion (toward ~20 cap)** · P1 · Landon · AC: target cities added · Proof: GBP screenshot · Dep: owner login
19. **Review velocity program to 60+** · P0 · Landon · AC: count rising weekly · Proof: GBP · Dep: none
20. **Directory NAP reconcile to live brand** · P1 · Ryan+Landon · AC: consistent NAP/brand across Tier-1 · Proof: listings · Dep: brand decision locked
21. **robots.txt header brand comment cleanup** · P2 · Ryan · AC: cosmetic brand string · Proof: diff · Dep: none
22. **About-page specific H1** · P2 · Ryan · AC: unique H1 · Proof: live · Dep: none
23. **City case-study pages (per real job)** · P1 · Ryan+Landon · AC: real proof, schema · Proof: live · Dep: Landon assets
24. **"Best roofer near {city}" comparison/FAQ pages** · P2 · Ryan · AC: citable, compliant · Proof: live · Dep: none
25. **Fix Lighthouse agentic-browsing 67 (a11y tree)** · P2 · Ryan · AC: well-formed tree · Proof: Lighthouse · Dep: none

---

## 15. Final Recommendation

**Build/fix first:**
1. Reconcile source-of-truth + entity (business.json canonical_host, AggregateRating consistency, confirm legal name) — stops citation/NAP fragmentation, the historical Frame SEO wound.
2. Add the **local proof layer** to Holladay / Cottonwood Heights / Sandy / Midvale (real photos + city-tied reviews + AggregateRating) and build the **Midvale storm subpage**.
3. Build the **Salt Lake Valley hub** + cluster internal-linking + the **insurance-documentation answer page**.

**Do not prioritize yet:**
1. Salt Lake Valley **map-pack** dominance via content/schema (proximity-gated; not winnable from a Heber pin — and never fake a pin).
2. More schema-for-its-own-sake / llms.txt polishing (on-page is already table-stakes-paid).
3. Net-new city pages for unserved/low-priority areas (Riverton/Herriman are already adequate; depth over breadth).

**Need from Landon:**
1. Real SLV project photos (4 target cities) + before/afters.
2. Review velocity push to 60+ (real customers, no incentives).
3. Confirm legal entity name + GBP access/screenshots + which cities are actually served.

**Need from Ryan:**
1. Approve a follow-up implementation sprint (this pass made no production changes).
2. Source-of-truth + schema + hub + answer-page builds.
3. GSC baseline + weekly AI-visibility cron (the measurement loop).

**Biggest Wasatch Front bet:**
> **Win the Salt Lake Valley on organic + AEO, not the map pack.** The site already ranks-ready (technically excellent, city-specific pages). The single highest-leverage move is to build the **proof + consensus layer** — real SLV job photos, city-tied reviews to 60+, a Salt Lake Valley hub, and off-page citations — so Google and AI engines see Frame *corroborated* as the Salt Lake Valley roofer, the way Frame already wins Heber City. Accept that map-pack dominance in Holladay/CH/Sandy/Midvale is proximity-gated until there's a real SLV location; don't fake it.

---

### Appendix — Verified vs Assumption / UNKNOWN
- **VERIFIED (live 2026-06-17):** 200s, canonical on new domain, robots, sitemap 138, schema types, NAP/phone integrity (0× internal phone), mobile CTA, city-page depth, AggRating gap, no hub, Midvale missing storm sub.
- **VERIFIED (point-in-time, dated):** AI citations 3/22 Perplexity Heber-only (6/11); pipeline 1 citing/19 (6/12); reviews 5.0★/~29 (synced 5/11); competitor reviews 54/65/105 (6/09); SITE-AUDIT Lighthouse SEO100/A11y100/BP92/Agentic67 + lab CWV (6/01); content density all loc/svc LOW (5/11).
- **UNKNOWN / NEEDS ACCESS:** Google rankings; GSC clicks/impressions/coverage; organic traffic; live GBP dashboard state + current review count; live current AI-citation results (need tracker re-run); field CWV/INP (CrUX/PSI); live lead/call volumes (Supabase, out of scope); LSA pack status; confirmed legal entity name.
- **Assumptions explicitly avoided:** no fabricated rankings/traffic/citations; map-pack constraint stated as structural (proximity) not as a fixable on-page issue.
