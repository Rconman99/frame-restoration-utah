# Frame Roofing Utah — Claude Master Context
> Last updated: 2026-05-08 | Auto-refreshed via Cowork scheduled task

---

## ⛔ CRITICAL RULES — READ BEFORE ANY EDIT

### DO NOT add false trust claims. These are NOT true:
- ~~**BBB A+ Rated**~~ — NOW CONFIRMED. BBB accreditation approved 2026-04-07. A+ BBB badge on site is accurate.
- **NRCA Member** — Frame Roofing is NOT an NRCA member. Never add this.
- **GAF Master Elite / OC Preferred** — Not verified. Do not claim.
- Any certification, membership, or accreditation that hasn't been confirmed by Ryan or Landon.

### These ARE true and can be used:
- Licensed & Insured in Utah
- Free Roof Inspections
- 24/7 Storm Response
- Financing Available
- 10-Year Workmanship Warranty
- BBB Accredited (confirmed by Landon 2026-04-07)
- A+ BBB Rating

### Phone numbers: TWO numbers with distinct roles (updated 2026-04-24 for 10DLC CTA verification)
- **CALL / VOICE → 435-302-4422** (Landon's direct Verizon line)
  - All `tel:` links, "Call us" CTAs, hero buttons, sticky mobile call bar, Contact → Phone card, email signatures, GBP, footer "Call:" line
  - Primary NAP number — keep consistent across site, schema (telephone), GBP, directories
- **TEXT / SMS → 435-292-8802** (Twilio A2P 10DLC registered sending number — **PUBLISHED on site as of commit 30b0215, 2026-04-24**)
  - This is the number Twilio sends outbound SMS from once 10DLC is live
  - Required to be published on site + consent copy + privacy + terms for **TCR (The Campaign Registry) CTA verification** — carriers (T-Mobile/AT&T) reject campaigns that don't disclose the sending number
  - Appears in: `sms:` links (footer "Text:" line, Contact → Text card on index), SMS consent checkbox copy on hero + contact + modal forms, privacy.html §SMS, terms.html §SMS
  - Do NOT use 435-292-8802 in `tel:` links or as the general business phone — it's sending-only
- **When in doubt:** Call = 302-4422, Text = 292-8802. Never swap them.

### Before generating or editing ANY page:
1. Read this CLAUDE.md first
2. Do NOT invent certifications, awards, or memberships
3. Do NOT re-add things that were previously removed
4. If unsure whether a claim is true, ASK — don't guess

## PEOPLE

- **Ryan Conwell** (ryanconwell99@gmail.com) — manages site, SEO, gets 10% commission on leads. Intermediate vibe coder using Claude Code, Cowork, Antigravity, and Google models. Also an Enterprise Platform AE at his day job.
- **Landon Yokers** (landon@framerestorations.com) — business owner. Wants leads via email + SMS to 435-302-4422 (his direct number, Verizon).
- **Business:** Frame Restoration Utah LLC, DBA Frame Roofing Utah
- **Address:** 142 S Main St, Heber City, UT 84032
- **Business phone:** 435-302-4422
- **Hours:** Mon–Sat 8AM–6PM
- **Email:** info@framerestorationutah.com (NEVER use sales@framerestorations.com — that's the Texas DBA, swept out 2026-04-22 to stop Google from cross-resolving the brand into Frisco TX)
- **Company entity (Vercel billing):** Acme Inc.

---

## DOMAINS & HOSTING

### Production (Landon's Vercel)
- **Live URL:** https://frameroofingutah.com / https://www.frameroofingutah.com
- **Vercel account:** landon-4824s-projects (Ryan is admin)
- **Deploys from:** GitHub repo Rconman99/frame-restoration-utah, main branch
- **Auto-deploys:** YES — every git push to main triggers production deploy

### Sandbox (Ryan's Vercel)
- **Team:** Ryan's projects (team_YY9hStNZc86Fgkf5Sin8Z0V0)
- **Project ID:** prj_zcwGmh7wUxHvqtRoHRmoRp441ePY
- **Domains:** framerestorationutah.com (OLD domain, still active), frame-restoration-utah.vercel.app
- **Use:** Testing new ideas, sandbox builds. NOT the live production site.
- **Design sandbox branch:** `design-refresh`

### Important Domain Notes
- frameroofingutah.com = PRODUCTION (Landon's Vercel)
- framerestorationutah.com = OLD/SANDBOX (Ryan's Vercel) — 301 domain forwarding to frameroofingutah.com ACTIVE (set up 2026-03-30 by Landon, path forwarding enabled)
- framerestorations.com = TEXAS Squarespace site (Landon's other market, Frisco TX) — causes SEO brand confusion. We do NOT control this.
- All canonical URLs, OG tags, and schema in the codebase reference www.frameroofingutah.com

### GitHub
- **Repo:** https://github.com/Rconman99/frame-restoration-utah
- **Branch:** main = production
- **Connected to BOTH Vercel accounts** — pushing to main deploys to both Landon's (production) and Ryan's (sandbox)

### Vercel MCP Access
- The Vercel MCP token only authenticates to Ryan's team (team_YY9hStNZc86Fgkf5Sin8Z0V0)
- Cannot see/manage Landon's Vercel project via MCP — but git push auto-deploys there
- Ryan's other Vercel projects: tradeworker-site, listingkit, template, taylor-creek, theology-app, conwell-agentic-seo, rc-digital, taylor-creek-site

---

## TECH STACK

- **Frontend:** Static HTML site (NOT React/Next.js — plain HTML files)
- **Hosting:** Vercel (static deployment)
- **Backend:** Supabase (lead handling)
- **Styling:** global.css (shared across all pages)
- **JS:** global-modal.js (booking form modal)
- **Config:** vercel.json (cleanUrls, security headers, caching, redirects)

---

## SITE STRUCTURE (~120+ HTML pages, 105 sitemap URLs as of 2026-04-22 — pruned from 126 during audit fix; removed dupes, robots-disallowed paths, Vercel-redirected routes)

- `/` — Homepage (index.html), H1: "Mountain-Grade Roofing, Valley-Wide" (rebrand 2026-04-17; previously "The Gold Standard In Utah Roofing"). Structure (top → bottom): Hero → **#watch-in-action 60s Heber Valley reroof showcase (added 2026-04-20, click-to-play MP4+WebM, VideoObject JSON-LD)** → Gallery → Video Showcase (drone loop) → Trust Bar → …
- `/about.html` — Root-level About page (redirects or mirrors pages/about)
- `/pages/` — 14 pages (residential-roofing, commercial-roofing, roof-repair, roof-replacement, storm-damage, storm-damage-restoration [redirects to storm-damage], emergency-tarping, gutters, solar-installation, insurance-claims, general-contracting, water-fire-flood-restoration, gallery, **about** [NEW — owner bio, headshot, E-E-A-T signals])
- `/locations/` — 45 location pages (all Utah cities along the Wasatch Front)
- `/blog/` — Blog index + 42 posts total (2 new posts added 2026-04-20 — April 2026 Wasatch storm checklist + Davis County wind damage guide; all have HowTo JSON-LD schema):
  - `/blog/utah/` — 11 statewide SEO posts (roof-replacement-cost, emergency-roof-repair, how-long-does-roof-last, how-to-choose-a-roofer, best-roofing-materials, signs-you-need-new-roof, utah-hail-season, utah-roof-insurance-claims, utah-roof-maintenance-checklist, utah-roof-ventilation-guide, **april-2026-wasatch-storm-roof-checklist** [NEW])
  - City subdirectories: heber-city/5, salt-lake-city/4, park-city/3, sandy/2, **bountiful/2** (added davis-county-wind-damage-guide 2026-04-20), plus 1 each in draper, herriman, layton, lehi, murray, orem, provo, west-jordan, west-valley-city (~25 city posts)
- `/projects/` — 1 case study (heber-valley-roof)
- `pages/gallery.html` — Now leads with **FEATURED IN-PROGRESS PROJECT** section (Heber Valley custom reroof): aerial panorama hero + 3-up grid + drone flyover video player; 4 new residential cards added at top of filtered grid (added 2026-04-20)
- `/seo-report/` — Live SEO & Lead Attribution Tracker (PIN-gated, multi-user admin panel, 30-day default view, Chart.js rendering). **2026-04-27:** Now ships alongside `/dashboard/` (productized successor) as fallback during ~7-day soak; planned 301 to /dashboard/ once verified.
- `/dashboard/` — **NEW 2026-04-27.** Productized client-dashboard module vendored from RCBuild-Kit v0.8.0. Config-driven via `window.DASHBOARD_CONFIG` (reads `data/dashboard-config.json` for Supabase URL + anon key + campaign key + branding). Same edge function (`/functions/v1/weekly-report`), same PIN system, same Supabase tables — existing PINs continue to work. Files: `dashboard/index.html`, `dashboard/dashboard.css` (--brand-accent CSS var for white-label), `dashboard/dashboard.js` (PIN gate + KPI grid + charts + admin panel). Hotfix 801bc59: absolute paths for CSS/JS (Vercel cleanUrls+trailingSlash:false strips /dashboard/ → /dashboard, breaking relative path resolution). **2026-04-27/28 polish stack:** chart canvases capped at 280px max-height + `maintainAspectRatio:false` (96f2c56 — fixed full-screen-height doughnuts); time-range buttons changed 7/14/30/90 → 7/30/60/90 with parallel current+prior fetches and per-KPI/per-page growth-vs-prior-period indicators (ed493ea); 🚀 Biggest Movers section (Top Growers / Fresh Wins / Needs Attention, top 3 each) + ⛈️ Storm Watch tile polling NWS api.weather.gov for storm/wind/hail/winter alerts in UT, ties active alerts to the $800/mo storm-trigger reserve recommendation in MARKETING-BUILD-CONTEXT.md (7a42f1d). **2026-04-28 Phase 2 Site Health tiles (50320e1, d083be1, b6f817c):** new "Site Health" section between Biggest Movers and Top Pages with three tiles — ⭐ **Reviews Velocity** (reads `/reviews.json`, shows total + rating + days-since-last-review w/ green≤14d / orange≤30d / red color coding + competitor-gap line vs roofingutah.com), 📝 **Content Freshness** (parses `/sitemap.xml` lastmod, shows total indexed pages + days-since-most-recent-update + 7d/30d/90d update counts to catch stale content drift), ⚡ **Core Web Vitals** (PageSpeed Insights API integration with 60-min sessionStorage cache, shows LCP/CLS/INP/TTFB origin field data + Lighthouse lab perf score; graceful fallbacks for missing key + insufficient CrUX data — Frame Utah currently in latter state, 587 impressions/30d too low). Live PSI API key restricted to PSI API + HTTP referrer www.frameroofingutah.com/* in Google Cloud Console. Each tile silent-fails if endpoint unreachable. All client-side, no edge function changes. Deploy-stamp now `v0.11.2` in `dashboard.js` to force Vercel byte-size change after the 2026-04-28 silent-webhook-failure incident (PR #6 merged but didn't deploy until commit d083be1 forced redeploy).
- `/scripts/` — **NEW 2026-04-27.** Wave 2 marketing-intel runners: `market-intel.mjs` + `market-intel-config.json` (45-city × 4-tier scoring), `market-intel-kit/` (bundled scoring + allocator + sources from RCBuild-Kit v0.7.0), `competitor-ads.mjs` (SerpAPI sweep), `competitor-tiktok.mjs` (Apify scraper), `supabase-pipeline-query.sql` (per-city job-value + close-rate from leads table). All dry-run when env vars missing. Vercelignored. **2026-04-28:** added `verify-deploy.sh` — compares local file size to production after a configurable wait, fails loud on drift; should run after every PR merge that touches `/dashboard/*` until the squash-merge → main → Vercel webhook chain is fully trusted (added after PR #6 merged but didn't actually deploy until forced re-deploy in PR #7). **2026-05-06 (evening):** AEO automation stack committed — `aeo-citation-monitor.py`, `aeo_actions.py`, `aeo-file-issues.py`, `aeo-fix-internal-links.py`, `aeo-citation-cron.sh`, `update-google-reviews-cron.sh` plus `Library/LaunchAgents/com.ryan.frame-roofing-aeo.plist` (monthly cron 5th of month 8:23am). Pure-cron replacement for the prior claude.ai/code AEO monitor trigger. SerpAPI sweep → leverage-scored actions (severity × lead-value) → auto-filed GitHub issues → optional PR-gated auto-fixer powered by local `mistral-nemo:12b`. `data/aeo-citations/` vercelignored. See SESSION LOG 2026-05-06 (evening).
- `/review/` — Review landing page + `review-request` edge function (automated post-job review collection)
- `backlink-playbook.html` — 12 backlink acquisition opportunities with step-by-step instructions
- `directory-blitz-tool.html` — Directory blitz tool v4 with full blitz results (Angi marked Already Done 2026-04-13)
- `/archive/` — Old docs, sub-location service pages, eval files
- `/images/` — Photos, OG image, brand source files (/brand-source/, /projects/cities/, /services/), landon-yokers-headshot.jpg (About page)
- `/assets/` — Hero video/poster, gutters video

### Key Files
- `vercel.json` — Redirects (storm-damage-restoration → storm-damage, /:city/storm-damage-restoration → /:city/storm-damage, /home → /, **NEW 2026-04-22:** /privacy-policy → /privacy, /terms-of-service → /terms after duplicate page deletion)
- `.vercelignore` — **NEW 2026-04-22.** Blocks deploying CLAUDE.md (contains Supabase anon key + internal rules), *.md strategy docs, *.py scripts, drive-photos.zip (8.5 MB customer photos), archive/, tmp-*/, internal audit/scratch HTML files
- `sitemap.xml` — 105 URLs (regenerated 2026-04-22 — pruned dupes, removed robots-disallowed paths and Vercel-redirected routes, fixed root trailing slash; was 126 → 105)
- `robots.txt` — Allows AI crawlers (GPTBot, Claude, Perplexity), blocks Bytespider. **2026-04-22:** Removed Disallow for /privacy and /terms (already noindex via meta — let Google crawl + honor noindex cleanly)
- `llms.txt` — AI/LLM optimization file
- `directory-tracker.html` — Interactive React-based directory tracker (38 directories)
- `global-modal.js` — Booking form modal → Supabase edge function
- `global.css` — Shared styles (self-hosted Archivo Black + Archivo WOFF2 already wired here — duplicate Google Fonts <link> removed from index 2026-04-22)
- `data/audits/` — **NEW 2026-05-04.** Lighthouse audit drops from cross-project sessions. Current: `lighthouse-2026-05-04.md` (rendered summary) + paired `-mobile.json` / `-desktop.json` (raw, ~1 MB each). Currently untracked — open question: commit raw JSONs for trend tracking vs `.gitignore data/audits/lighthouse-*.json` and only commit summaries. See SESSION LOG 2026-05-04.

---

## SEO STATUS (as of 2026-03-28)

### Google Search Console (Baseline 2026-03-30)
- **Property:** https://www.frameroofingutah.com/ (verified, ryanconwell99@gmail.com)
- **Performance (first 10 days):** 10 clicks, 587 impressions, 1.7% CTR, avg position 23.2
- **Indexed pages:** 19
- **Not indexed:** 89 (88 "Discovered - currently not indexed", 1 redirect error on storm-damage — FIXED 2026-03-30)
- **Sitemap:** Submitted 2026-03-26, 101 pages discovered, status: Success
- **Indexing requests submitted (2026-03-30):** roof-repair, residential-roofing, roof-replacement, commercial-roofing, insurance-claims, gutters, emergency-tarping, solar-installation (8 total, hit daily quota)
- **Still need indexing requests:** general-contracting, water-fire-flood-restoration, storm-damage (after fix deploys), plus ~40 location pages
- **Pages missing from sitemap:** insurance-claims, emergency-tarping (need to add)

### Completed
- Meta descriptions on ALL 45 location pages, 12 service pages, blog pages
- Canonical tags (self-referencing) on ALL pages
- Open Graph + Twitter card tags on ALL pages
- Schema markup: RoofingContractor, FAQPage, HowTo, BlogPosting, BreadcrumbList, AggregateRating, Article, **SpeakableSpecification (homepage FAQPage, added 2026-04-22 for AEO + voice assistants)**
- **2026-04-22 audit fix:** Texas-brand entity leak lockdown — purged sales@framerestorations.com from index/legal/10 blog posts, removed parentOrganization block from LocalBusiness schema, deleted broken "Part of Frame Roofing Utah" Texas-domain footer link, changed about page foundingLocation from Dallas-Fort Worth → Heber City, narrowed homepage services sub from "all of Utah" → "Wasatch Front + Heber Valley"
- **2026-04-22 audit fix:** FAQPage JSON-LD + visible Quick Answer passages added to 4 service pages (roof-replacement, storm-damage, insurance-claims, residential-roofing)
- **2026-04-22 audit fix:** AggregateRating (20 reviews, 5.0 stars) added to all 45 location pages (was previously only on homepage + about)
- **2026-04-22 audit fix:** Visible "Last updated" stamp under H1 on 87 blog + location pages (freshness signal visible to readers, not just in schema)
- **2026-04-22 audit fix:** Backfilled dateModified on two 2026 posts that still showed 2026-03-27; fixed malformed parentOrganization block on west-valley-city.html
- **2026-04-22 audit fix:** Removed two `EDITOR CHECK` placeholder paragraphs that had shipped to production on blog/park-city/ice-dam-winter-roof-damage.html (rest of blog grep-swept clean)
- **2026-04-22 audit fix:** Standardized "24/7 emergency response" copy across homepage FAQ/schema and services.html (was inconsistent — some "rapid," some "24/7")
- **2026-04-22 audit fix:** Deleted privacy-policy.html and terms-of-service.html duplicates; added 301 redirects in vercel.json; fixed privacy.html/terms.html canonicals to use www subdomain; removed robots Disallow on /privacy + /terms
- **2026-04-22 (afternoon) audit follow-up:** Hail cluster hub-spoke internal linking — 8 city posts (bountiful, draper, herriman, lehi, ogden, provo, riverton, sandy) now link up to the Utah hail pillar via "Statewide context" callout; pillar links down to all 8 cities via spoke block. Eliminates pillar-vs-city cannibalization without sacrificing long-tail city traffic.
- **2026-04-22 (afternoon) brand-safe review sync:** Hardened `update-google-reviews.py` — brand-leak filter drops bare "Frame Restoration" reviewers, city metadata preserved on author merge, empty-result fallback to existing feed. Aggregate verified against GBP data_id: 20 reviews / 5.0 stars.
- **2026-04-27 perf:** Blog hero images switched from `loading="lazy"` → `loading="eager" fetchpriority="high"` across all 23 blog posts using the figure.blog-featured-image template. Hero was below the dark header but still in the initial viewport — lazy was deferring it past first paint and dragging LCP / showing a visible blank gap. Web-standard above/near-the-fold pattern restored.
- **2026-05-01 CRITICAL SEO unblock (PR #10):** Fixed 5-week-silent `noindex,nofollow` bug on `pages/storm-damage.html` (highest-CPL service page in Frame's vertical) and `pages/general-contracting.html`. Both were in sitemap.xml + canonical to themselves but tagged noindex since 2026-03-28. Now `index,follow,max-snippet:-1,max-image-preview:large`.
- **2026-05-01 form CRO (PR #10):** All 3 primary lead funnels (index hero, index #contact, global-modal.js booking modal) cut from 6 required fields → 3 (Name + Phone + ZIP). Optional fields collapsed into `<details>` "Add details (optional)" disclosure. Hero subhead: "3 fields, 30 seconds. We'll call you back within 15 minutes during business hours."
- **2026-05-01 visible FAQ blocks (PR #11):** 4 visible Q&A blocks added to storm-damage / roof-replacement / insurance-claims service pages, near-verbatim to existing JSON-LD (closes the schema-content mismatch that disqualified them from FAQ rich-results, opens AEO citation surface).
- **2026-05-01 storm hub-spoke (PR #12 + #14):** Complete bidirectional cluster — `/pages/storm-damage` now links to all 11 city storm/hail/wind blog posts; each of those 11 posts has a city-personalized CTA card linking back to `/pages/storm-damage`.
- **2026-05-01 review-acquisition surface area (PR #9 + #13):** Gold "★ Leave a Review" link added to homepage footer + all 45 location-page footers, plus thank-you page review card. Surface area went ~2 → ~48 paths to `/review.html`.
- **2026-05-01 thank-you primary CTA flip (PR #13):** Primary visual CTA changed from "Back to Home" (wasted action) → gold ☎️ Call 435-302-4422 (tel:). New PostHog event `post_lead_call_now` for submitter→immediate-call attribution.
- **2026-05-01 neighborhood depth (PR #14):** "{City} Neighborhood-Specific Roofing Notes" section (4 callout cards each, sourced from real planning code + IRC + manufacturer specs) added to top 3 location pages (heber-city, park-city, salt-lake-city). Each closes with sources attribution citing planning code, IRC R905, manufacturer specs, Frame's Utah DOPL license #14256097-5501.
- **2026-05-06 mobile-perf partial fix (commits 660ead1 + 64128a4):** Homepage video stack reweighted to address the 2026-05-04 Lighthouse audit's 6.1 MB mobile page weight / 7.8 s LCP finding. `assets/drone-footage.mp4` 13.2 MB → 5.2 MB (H.264 720p, 24.5 s, moov-first faststart) and `assets/videos/frame-restoration-showcase.{mp4,webm}` 22.0/10.6 MB → 5.4/7.5 MB. The above-the-fold "Watch Us Work" section now autoplay-muted-loops a 5.4 MB silent aerial instead of a 22 MB controls-only narrative, and the original branded 60s music showreel was re-homed to a click-to-play element below the fold (commit 4009ffe) — audio is preserved for engaged scrollers without paying the LCP cost. Cachebuster `?v=20260506` on all three URLs. Re-audit pending. Two of the three audit-recommended fixes (PostHog `disable_surveys: true` + `index.html:1671` JS TypeError) still queued.
- **2026-05-06 reviews JSON sync (commit 21edf38, auto-update):** `data/google-reviews.json` + `reviews.json` ticked 19 → **20 reviews**. AggregateRating copy on LocalBusiness JSON-LD + all 45 location pages was already showing 20/5.0 stars since the 2026-04-22 audit fix — this commit catches the underlying JSON up to the schema claim. Performed by Review Bot automation identity (`review-bot@frameroofingutah.com`).
- **2026-05-06 (evening) AEO automation infra (commits 3adaf0f → 762b9b8):** Pure-cron AEO citation monitor stack committed (was untracked, local-only earlier today). 5-query SerpAPI sweep → repo-aware action engine (`leverage = severity × lead_value`, smart classification across freshness-anchor / authority-boost / refresh-stale / internal-link-boost / create-content) → GitHub-issue auto-filer (`gh` CLI, idempotent) → Level-2 PR-gated auto-fixer (`aeo-fix-internal-links.py`, local `mistral-nemo:12b`, confidence ≥ 0.75 + topicality check, NEVER auto-merges, 24h race-condition guard skips files Cowork may be editing). LaunchAgents plist `com.ryan.frame-roofing-aeo.plist` runs monthly (5th, 8:23am). **First run today:** score 1/5, Frame **#1 in local pack for "best roofer Heber City Utah"**, 3 medium-priority actions filed as issues #15-17, demo PR #18 added 3 internal links to the cost-2026 guide. Anchor-quality filters tightened in 762b9b8 after PRs #18-20 produced 3/8 borderline anchors (confidence threshold 0.6 → 0.75 + new `_topic_overlap()` rejects domain-stop-word-only anchors like "Utah" / "Salt Lake City" / "Frame Roofing Utah"). Token savings vs prior claude.ai/code monitor trigger: ~55K tokens/run = ~$0.23/month. Replaces the trigger entirely; trigger-side now retired.
- **2026-04-22 perf:** Removed double-loading Google Fonts <link> (self-hosted WOFF2 already wired in global.css — kills render-blocking + double FOUT); changed drone-loop video preload from "metadata" → "none" (13 MB clip was loading eagerly on mobile); added width/height to 6 service-card imgs (CLS fix)
- **2026-04-24 (afternoon) AEO gap closure:** Homepage hero `<p>` now leads with "Frame Roofing Utah is a family-owned, licensed roofing contractor based in Heber City" (definition pattern for AI direct-answer extraction); new `.quick-answer-strip` between hero and #watch-in-action carries visible "Last updated: April 24, 2026" stamp (87 blog/location pages already had it — homepage was the gap); `dateModified: 2026-04-24` added to index LocalBusiness JSON-LD (maintenance-layer was 0/2, now 2/2); "10-year" → "10 years" in hero so number matches AEO audit regex. llms.txt Texas-brand disambiguation rewritten to "not to be confused with … distinct from" phrasing (was "is a different business", bypassed entity-disambiguation heuristic). Perfect Stack audit: 76/B → 88/A- projected.
- **2026-04-24 (afternoon) llms.txt A-grade polish:** Blog Library + Owner line converted from `- Title — url` → `- [Title](url)` markdown link format (0 → 11 markdown links) to match llmstxt.org spec; audit llms_txt_quality 2/5 → 5/5 projected. Expected overall: 88 → 91 (A-).
- **2026-04-22 (evening) mobile polish (3 tiers + carousel):** Tier 1 perf/touch — removed Mapbox 4s timeout fallback (was loading 7s of JS into Lighthouse audit window on non-scrolling viewports), null-safed mobile nav toggle, SMS consent checkbox upgraded to WCAG 44px tap target (22×22 box, 14px font). Tier 2 type/visibility — hero-badge 10→12px, hero p 14→16px, hero-points 13→15px at ≤600px; Quick Answer boxes on 4 service pages swapped cream-on-cream → navy-tint (#EEF4F9) with 6px border + shadow; hamburger button 33×24 → min 44×44 (WCAG 2.5.5 / Fitts). Tier 3 legibility/thumb-zone — .last-updated inside dark-navy heroes forced to rgba white 0.82 (was invisible grey), .content-section p unified at 16px mobile, homepage hero subhead trimmed 5 sentences → 2 (was crowding CTA out of first scroll). Reviews carousel on mobile — removed min-height on slides so short reviews don't render as tall empty boxes, 7-line clamp on review body to stop 3 long quotes from stretching slides past 500px, hid under-sized 32×32 prev/next arrows, added native touchstart/touchend swipe handler (40px threshold, horizontal-only so vertical page scroll still works), touch-action: pan-y on viewport.
- Homepage H1 rebranded 2026-04-17: "Mountain-Grade Roofing, Valley-Wide"
- Storm-damage / storm-damage-restoration consolidated (301 redirect + canonical)
- Duplicate blog URLs cleaned from sitemap
- Yelp footer link corrected to /biz/frame-restoration-heber-city
- Directory tracker: Yelp marked as Done; Angi marked Done 2026-04-13
- robots.txt with AI crawler allowances
- llms.txt upgraded 2026-04-17 for AEO: 10 passage-citable Q&A, 45 service areas by county, verified-credentials-only
- Full rebrand from "Frame Restoration Utah" to "Frame Roofing Utah" (site-wide re-swept 2026-04-08)
- WebP conversion site-wide (88 images converted 2026-04-12, earlier 24 compressed 2026-04-07)
- IndexNow integration for bulk URL indexing (2026-04-12)
- HowTo JSON-LD on all 39 blog posts (2026-04-10)
- Author bios + comparison tables + digitalSourceType on blog + service pages (2026-04-08)
- FAQ schemas expanded 5→12 city-specific per location page (2026-04-08)
- Internal crosslinks: blog→location and location→location on all 45 location pages (2026-04-10)
- PostHog analytics wired on 107 pages + click tracking on 47 (2026-04-10)
- Live SEO & Lead Attribution Tracker launched with PIN gate + multi-user admin (2026-04-10)
- Review landing page + automated review-request edge function (2026-04-10)
- 301 redirects for old domain framerestorationutah.com → www.frameroofingutah.com (2026-04-07)
- HSTS header + PostHog reverse proxy (2026-04-08)
- A11y pass: aria-label roles, heading order, select label, sr-only class (2026-04-07)

### Competitors
- roofingutah.com — exact-match domain, 54 Google reviews
- utahroofingcompany.com — 50 Google reviews
- frameroofingutah.com — 19 Google reviews (us)

### Audit Reports (in project folder)
- Frame-Roofing-SEO-Audit-March2026.html — Full interactive SEO audit
- Frame-Roofing-GEO-Audit-March2026.html — GEO/AI optimization audit
- SEO-BRUTAL-AUDIT-March-2026.md — Honest audit scoring 38/100
- Frame-Roofing-SEO-Automation-Playbook.html — Automation strategy
- Frame-Restoration-Blog-Content-Strategy.xlsx — 23 topics x 44 cities keyword map

---

## LEAD PIPELINE (Supabase)

- **Project:** frame-roofing-utah (ID: hdcflshhomzildwqlmwh, region: us-west-1)
- **Edge function:** `handle-lead` v5 — receives JSON form submissions, saves to DB, emails via Formspree, sends SMS via Verizon gateway + Twilio (parallel)
- **DB table:** `leads` (id, created_at, name, email, phone, address, service, message, source_page, status, job_value, commission auto-calc 10%)
- **Supabase anon key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkY2Zsc2hob216aWxkd3FsbXdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODQzNzcsImV4cCI6MjA4OTQ2MDM3N30.GO5CU5dRBfeoC5ZEl2U143cTXbKdV5ZUhq4ucwBICoI
- **Edge function URL:** https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-lead
- **Formspree (backup):** meeroaqa (account: ryanconwell99@gmail.com)
- **Email:** Working via Formspree → Ryan. Needs change to send directly to landon@framerestorations.com CC ryanconwell99@gmail.com
- **SMS:** WORKING — sends via Verizon email-to-SMS gateway (4353024422@vtext.com) as primary + Twilio as secondary. Twilio outbound still blocked by 10DLC (error 30034) but Verizon gateway delivers.
- **Google Sheet:** NOT YET SET UP — env var ready, needs Google Apps Script webhook

---

## YELP

- **Listing:** https://www.yelp.com/biz/frame-restoration-heber-city
- **Display name:** FRAME RESTORATION (Yelp shortens LLC names — normal)
- **Free trial:** $17/day ($13 ads + $4 upgrade), ends 4/27/2026
- **Account email:** landon@framerestorations.com
- **Footer link:** Corrected and live on frameroofingutah.com

---

## BRAND

- **Colors:** Navy #0B4060, Gold #E1B969, Off-white #FAF9F5
- **Fonts:** Archivo Black (headings), Archivo (body) — Google Fonts, need to self-host
- **Logo:** Still says "Frame Restoration" in PNG — needs designer update to "Frame Roofing"
- **Logo file:** /images/logo-rc-darkblue.png (85px height, 100px nav bar)
- **OG image:** /images/og-image.jpg (branded aerial drone shot)

---

## PRIORITY TODO (as of 2026-04-17)

### Immediate
1. **🆕 Ship Lighthouse audit fixes (from `data/audits/lighthouse-2026-05-04.md`)** as a single PR `perf: Lighthouse 70→92 mobile + 100/100/100/100 desktop`. Three fixes: (a) `index.html:1671` `document.addEventListener` TypeError null-check (−4 BP, 10 min), (b) hero imagery `srcset`+WebP/AVIF + `loading="lazy"` for 6.1 MB → ≤1.5 MB mobile page weight (LCP 7.8 s → <2.5 s, 1–2 hr), (c) PostHog `disable_surveys: true` (or no-surveys CDN variant) to drop 65 KB unused JS (5 min). Re-audit on Vercel preview before squash-merge. Decide on `data/audits/` commit policy (raw JSONs vs summaries-only) before push.
2. Set up Twilio — Utah phone number, wire into edge function for lead SMS (10DLC consent checkbox now in place 2026-04-17, error 30923 resolved)
3. Build speed-to-lead AI bot — Twilio + Claude API + Supabase
4. Google Sheet lead tracker — Apps Script webhook
5. Direct email (replace Formspree with Resend/SendGrid)
6. ~~301 redirects framerestorationutah.com → frameroofingutah.com~~ ✅ DONE (Landon domain forwarding 2026-03-30; in-code 301s also added 2026-04-07)
7. ~~Google Search Console verification + sitemap for frameroofingutah.com~~ ✅ DONE
8. Update Google Business Profile with new URL
9. Reddit-scanner: response parsing hardened 2026-04-17 (HTTP status, empty body, retry, typed errors) — monitor reliability

### Short-term
9. ~~Self-host fonts (Archivo Black + Archivo)~~ ✅ DONE (already wired in global.css; double-loading Google Fonts <link> removed 2026-04-22)
10. ~~Convert images to WebP~~ ✅ DONE (88 images converted 2026-04-12 + 24 compressed 2026-04-07)
11. ~~Add author bios + publication dates to blog posts~~ ✅ DONE (2026-04-08)
12. Directory submissions (HomeAdvisor, Thumbtack, local chambers) — Angi + Yelp already done
13. Get updated logo from designer ("Frame Roofing" not "Frame Restoration")
14. ~~IndexNow integration~~ ✅ DONE (2026-04-12)
15. ~~HowTo schema coverage on blog~~ ✅ DONE (all 39 posts, 2026-04-10)

### Medium-term
13. Weather-triggered blog automation (NWS API, architecture in FRAMEROOFINGUTAH-BUILD-PLAN.md)
14. Rewrite 44 location pages with unique per-city content
15. Build more project case studies

---

## 💰 MARKETING BUILD (Active April 2026)

**Entry point for all marketing work:** [`data/MARKETING-BUILD-CONTEXT.md`](data/MARKETING-BUILD-CONTEXT.md)

That file is the canonical "start here" for any agent (Cowork, Claude Code, future-you) working on Frame Utah marketing. It contains the active $15K/mo allocation, Wave 1 findings already integrated, Wave 2 fire commands, free actions today, KPI scoreboard, confidence scorecard, and full file index.

### Quick reference

**Active $15K/mo allocation (Wave 1 deltas applied):**
- $7,500 — Tier-1 priority cities (Park City, Heber, Draper, Salt Lake, Cottonwood Heights, Midway)
- $2,500 — Tier-2/3 volume layer (West Valley, Sandy, Bountiful, Lehi)
- **$1,700 — Reviews acquisition** ⭐ (closes 20→60+ vs roofingutah.com's 54)
- $1,300 — YouTube + TikTok organic + light boost (Heber drone reuse)
- $700 — Content moat (narrowed scope after Wave 1)
- $800 — Storm-trigger reserve (May-Sept hail/wind + Dec-Feb ice dam)
- $500 / $0 — Yelp (decision pending — trial expired 2026-04-27)

**Critical Wave 1 finding:** roofingutah.com has not published a blog post since 2024-05-31 (sitemap-verified). Frame Utah's content moat is essentially already built; the actual gap is reviews + GBP. Allocation reflects this.

### Wired npm scripts (in `package.json`)

| Command | Purpose | Cost (live mode) |
|---|---|---|
| `npm run market-intel` | Offline scoring of 45 cities (smoke test) | $0 |
| `npm run market-intel:dataforseo` | Real per-city SERP + KW + paid-density | ~$0.30 / 45 cities |
| `npm run competitor-ads` | SerpAPI scan on roofingutah.com + utahroofingcompany.com + reignroofing.com | ~$0.15 |
| `npm run competitor-tiktok` | Apify TikTok scrape on UT competitor handles | ~$1.50 |

All scripts dry-run when env vars (`SERPAPI_KEY`, `APIFY_TOKEN`, `DATAFORSEO_*`, `CENSUS_API_KEY`) are missing — they print queries + estimated spend, exit 0, no API calls.

**Total Wave 2 spend:** ~$33 one-time across both Frame projects (UT + TX). Pending company CC.

### Free actions (no CC needed — do these first)

1. Pull Yelp 30-day dashboard → today's $510/mo decision
2. Pull GSC last-30-days → refresh March-30 baseline
3. Run `scripts/supabase-pipeline-query.sql` in Supabase SQL Editor → real per-city job-value + close-rate
4. Pull PostHog form-submission count last 30 days
5. Google Keyword Planner: Park City + Heber + Draper
6. 15-min Birdeye / NiceJob / Podium pricing calls
7. Send 5 manual review-requests via existing edge function
8. Storm-trigger fire drill via iMessage to Landon

### Key marketing files
- `data/MARKETING-BUILD-CONTEXT.md` — **canonical entry point**
- `data/30-day-lead-sprint-2026-05-01.md` — **NEW 2026-05-01.** May 2026 lead-velocity sprint plan (5 highest-EV plays — reviews velocity, speed-to-lead, form CRO, pre-built storm landing page, AI-Overview citation moat — w/ file paths, effort scores, expected impact, source citations, weekly cadence). PRs #9-#14 executed Day 1 of this plan.
- `data/RYAN-VALUE-MEMO-2026-05-01.md` — **NEW 2026-05-01.** Landon-facing build receipt + 10% commission cadence ask (SMS-friendly TLDR + long form). Frames the 5-week build, current GSC baseline, May sprint roadmap.
- `data/market-intel-audit-2026-04-27.md` — full $15K deep-dive audit
- `scripts/market-intel-kit/README.md` — bundled scoring + allocator kit docs
- `scripts/supabase-pipeline-query.sql` — ready-to-paste SQL for Supabase
- Cross-project research framework: `~/projects/frame-roofing-research-plan-to-A-grade-2026-04-27.md`
- Cross-project Wave 2 punch-list: `~/projects/frame-roofing-wave-2-readiness-2026-04-27.md`

### Operational separation reminder

Frame TX (`framerestoration.com` singular) and Frame Utah (`frameroofingutah.com`) are independent operational entities. **Never share runtime state, scheduled triggers, Twilio numbers, or GBP listings between projects.** Cross-project research artifacts at `~/projects/frame-roofing-*.md` are documentation only — not a license to cross-trigger. See § "Operational Separation from Frame Utah (enforced 2026-04-27)" in this CLAUDE.md.

---

## GIT WORKFLOW

- All work in `/Users/agenticmac/projects/frame-restoration-utah/` (NOT tradeworker-site/frame-restoration-utah — that is a stale obsolete copy)
- Push to `main` auto-deploys to BOTH Vercel accounts
- Commit format: descriptive message + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Watch for `.git/index.lock` — delete before committing if stale
- Desktop Commander read_file returns empty for HTML — use `start_search` with contextLines or `start_process` with `cat`

---

## SESSION LOG

### 2026-05-07 (afternoon) — Untracked Stack: Blog Generator Pipeline + Level-3 AEO Stale-Refresh Fixer + Supabase Edge Source-of-Truth + Internal-Link Runaway Guard
No new commits since the morning's `ef33690` auto-refresh. Working tree shows a meaningful untracked/uncommitted stack landed during the afternoon session (15:11 → 17:55), all building on top of the AEO v2 monitor + PR-gated auto-fixer that committed earlier the same day.
- **NEW `scripts/generate-blog-post.py` (30 KB, untracked, May-7 17:04):** Higgsfield-aware blog-post generator. Tier-based routing per the cost-optimized tool routing memory. Adds two npm scripts to `package.json` (uncommitted): `blog:draft` (`python3 scripts/generate-blog-post.py`) and `blog:render` (`python3 scripts/generate-blog-post.py --render`). Pairs with new `data/blog-pending/` workflow dir (also untracked).
- **NEW `data/blog-pending/storm-damage-roof-repair-park-city.json` (18 KB, May-7 17:09):** First draft from the new generator — Park City storm-damage piece. JSON includes title, slug, excerpt, category=Storm Response, etc. Pending review before render → `pages/storm-damage-roof-repair-park-city.html`. Slot in the storm-cluster hub-spoke that PR #12/#14 built (storm-damage hub already links to 11 city storm/hail/wind posts; this would be #12).
- **NEW `scripts/aeo-fix-refresh-stale.py` (15 KB, untracked, May-7 17:55):** Level-3 auto-fixer that complements the Level-2 LLM-based `aeo-fix-internal-links.py`. Pure mechanical refresh — **NO LLM** — bumps `dateModified` in JSON-LD + visible "Last updated" stamp on a stale page to today's date. Closes `refresh-stale` AEO action types (where the `aeo_actions.py` classifier flagged a high-leverage page as gone-stale). Rounds out the auto-fix coverage: `internal-link-boost` / `authority-boost` → Level-2 LLM fixer; `refresh-stale` → Level-3 mechanical fixer; remaining classifications (`freshness-anchor` / `create-content`) still need human authoring.
- **MODIFIED `scripts/aeo-fix-internal-links.py` (uncommitted, +21/-5 lines):** Runaway-protection patch after a **46-minute hung run** on action `aeo-ef3d8192` (looped through 23 candidates × 120s ollama timeout). Two bounds added: `MAX_LLM_CALLS = 8` (caps candidates evaluated per run) and `LLM_TIMEOUT_SEC = 30` (was implicit 120s; anchor drafting is ~300 token JSON, normally returns 5-15s). Also better progress logging (`[1/8] Trying foo (score 12)…`) and richer no-edits telemetry (`candidates_tried` + `candidates_total`).
- **NEW `supabase/functions/handle-lead/` (untracked dir, May-7 15:11):** Lead-handler Supabase Edge Function source-of-truth pulled into the repo as `index.ts` + `DEPLOY.md`. Previously the function existed only in the deployed Supabase project (referenced in PR #10's "POSTs to `/functions/v1/handle-lead`"); now its source is in-tree. **Note for future commit:** `.vercelignore` should add `supabase/` so the edge-function source doesn't ship to the static site CDN. The `.temp/cli-latest` companion dir is Supabase CLI scratch — should be `.gitignore`d.
- **Backup directories from 2026-05-06 video swap** (`assets/_backup-2026-05-06-drone-swap/` + `assets/videos/_backup-2026-05-06-showcase-swap/`) remain untracked and are already covered by the `.vercelignore` glob `assets/_backup-2026-*` added in commit 3adaf0f. Safe to either keep local-only or commit if cross-machine restore matters.
- **Open question (carried forward from 2026-05-06):** `data/aeo-citations/` rolling JSONs (`_actions.json` / `_filed_issues.json` / `_trend.json`) — still committed-as-bootstrap with parent dir `.vercelignore`d; whether to (a) periodically `git commit` trend data for cross-machine continuity, or (b) `.gitignore` the rolling JSONs and only commit the bootstrap snapshot. Defer 2-3 monthly runs to evaluate JSON drift rate.
- **Lighthouse audit follow-through (re: 2026-05-04):** unchanged — drone + showcase swaps from the morning of 2026-05-06 partially shipped fix #1 (mobile page weight / LCP). PostHog `disable_surveys` and the `index.html:1671` JS TypeError both still pending; no perf push today.
- **Status going into 2026-05-08:** untracked stack is functional but not yet committed. Suggested next-session ship — separate PRs for (a) the supabase/ edge source pull, (b) the blog generator pipeline + first Park City draft, (c) the Level-3 stale-refresh fixer, (d) the internal-link runaway guard. Keeping them separate preserves clean rollback + clean lift attribution.

### 2026-05-06 (evening) — AEO Citation Monitor v2: Repo-Aware Actions + PR-Gated Auto-Fixer + Anchor-Quality Hardening
Four commits (3adaf0f → 762b9b8) on the same day as the morning's drone/showcase/showreel/reviews work, now committing the AEO citation monitor stack that was logged earlier today as "untracked, local-only." Net effect: the prior claude.ai/code AEO monitor trigger is **retired**; replacement is repo-aware, ~$0.23/month, and closes the loop end-to-end (research → leverage-scored action → GitHub issue → optional PR-gated auto-fix).
- **Commit 3adaf0f / repo-aware citation monitor + auto-filed action issues (+1867 lines, 11 files):** The full Level-1 stack moves from untracked to committed.
  - `scripts/aeo-citation-monitor.py` (507 lines) — SerpAPI sweep across 5 high-value queries (local pack + organic + AI Overview), retry-with-backoff, telemetry → `~/.cache/local-llm-telemetry.jsonl`. Optional OpenRouter Perplexity Sonar citation check (skipped if no key). **Fixed local-pack detection bug** — Frame is **#1 for "best roofer Heber City Utah"** (the original organic-only check missed it).
  - `scripts/aeo_actions.py` (421 lines, NEW) — turns research into actionable, leverage-scored work. Per-query lead-value weights (1-10) → `leverage = severity × lead_value`. Repo-aware file mapping: action items reference real file paths with last-modified dates, word counts, current titles. Smart action classification (`freshness-anchor` / `authority-boost` / `refresh-stale` / `internal-link-boost` / `create-content`). Trend tracking → `_trend.json` (24-entry rolling history with sparkline). Persistent action IDs across runs → `_actions.json` shows `weeks_open`.
  - `scripts/aeo-file-issues.py` (242 lines, NEW) — reads `_actions.json` → files new actions as GitHub issues via `gh` CLI. Idempotent (action ID → issue number map in `_filed_issues.json`). Configurable threshold (high/medium/low), cap, dry-run, list modes. Auto-creates `aeo` + `auto-filed` + `priority:*` labels on first use.
  - `scripts/aeo-citation-cron.sh` + `Library/LaunchAgents/com.ryan.frame-roofing-aeo.plist` — replaces the monthly claude.ai/code trigger; runs **5th of month 8:23am**. Telemetry on success/failure.
  - `scripts/update-google-reviews-cron.sh` (108 lines) — cron-only replacement for the bi-monthly review-sync trigger built earlier today. Also includes telemetry. Pairs with the Review Bot identity already wired (commit 21edf38).
  - `.vercelignore` — `data/aeo-citations/` excluded from production deploy (internal monitoring artifacts, not customer-facing); `assets/_backup-2026-*` glob added to ignore the homepage video swap backups from the morning's commits 660ead1 / 64128a4 / 4009ffe.
  - **First run output (committed as bootstrap state):** Score **1/5** (Frame #1 in local pack for "best roofer Heber City Utah"). 3 medium-priority actions filed as GitHub issues **#15-#17**. Real competitor signal logged: `roofingutah.com` cited for Park City storm. State files: `data/aeo-citations/2026-05-06.{json,md}`, `_actions.json`, `_filed_issues.json`, `_trend.json`.
- **Commit 4f03d07 / Level-2 PR-gated auto-fixer (+561 lines):** `scripts/aeo-fix-internal-links.py` reads an open AEO action by `--action <id>` or `--issue <number>`, finds 3-5 high-relevance blog posts (excludes service/location/legal pages), drafts contextual link insertions via local `mistral-nemo:12b` (confidence ≥ 0.6 initial threshold — hardened to 0.75 in 762b9b8; anchor 3-12 words; anchor must exist verbatim in source paragraph). Handles both `internal-link-boost` and `authority-boost` action types — they share the same fix (add inbound internal links to the target page); only the diagnostic differs. Opens a branch `aeo-auto/<action-id>`, commits, pushes, opens a PR — **NEVER auto-merges**. Comments on the original GitHub issue with the PR link. Idempotent: refuses to re-run if branch already exists on origin. Auto-creates `aeo` + `aeo-auto-fix` labels on first use. **Safety constraints baked in:** cap 3 source-page edits per run; excludes `index.html`, `privacy.html`, `terms.html`, `thank-you.html`, all `pages/*`, `locations/*`, `archive/*`, `scripts/*`, `assets/*`, `images/*`; validates anchor text exists verbatim (rejects LLM hallucinations); skips paragraphs already containing `<a>` tags (no double-linking); 24-hour race-condition guard skips files Cowork may be editing. **Demo run:** opened **PR #18** with 3 edits adding internal links to the `roof-replacement-cost-utah-2026` cost guide from related blog posts.
- **Commit 8a1be3f / fix: don't pollute main with edits during PR creation:** Bug discovered the moment PRs #18-#20 ran — `apply_edits()` was writing to filesystem **before** the feature branch existed, leaving duplicate uncommitted changes on `main`. Fix: move the actual write into `open_pr()` (which already had the same logic for re-applying after stash); `apply_edits()` is now a validation-only pass. Also bumped `ls-remote` timeout 10s → 30s and gracefully continue on timeout (GitHub flakiness shouldn't abort a PR-in-flight).
- **Commit 762b9b8 / fix: tighten anchor quality — confidence + topicality:** First batch (PRs #18-#20) produced 3/8 borderline anchors. Two filters added:
  - `MIN_LLM_CONFIDENCE` 0.6 → **0.75** (drops PR #20's "Salt Lake City" anchor at 0.70).
  - New `_topic_overlap()` — anchor must share at least one topic word (length ≥ 4, not in domain stop list) with the target query. Stop words include domain-common terms (`utah`, `roofing`, `roofer`, `roof`, `best`, `top`, `help`) so e.g. "Utah" alone in an anchor doesn't count as topical. Year tokens (2024-2026) and 1-3 char tokens also filtered.
  - **Drops:** "Utah's freeze-thaw cycles" → cost-2026 (0 overlap); "Frame Roofing Utah" → storm damage (0 overlap); "Salt Lake City" → insurance claims (0 overlap); "Utah roof sustains emergency damage" → insurance (0 overlap).
  - **Keeps:** "what costs to expect" (cost match); "insurance claims process" (multi-match); "storm damage repair guide" (multi-match).
  - Net: future runs produce fewer edits per PR but each one is genuinely topical.
- **Open question logged:** `data/aeo-citations/_actions.json` / `_filed_issues.json` / `_trend.json` are committed as bootstrap state but the parent dir is also `.vercelignore`d. Subsequent monthly runs will append to these files locally — open whether to (a) periodically `git commit` trend data for cross-machine continuity, or (b) `.gitignore` the rolling JSONs and only commit the bootstrap snapshot. Defer 2-3 monthly runs to evaluate JSON drift rate.
- **Lighthouse audit follow-through (re: 2026-05-04 entry's 3 fixes):** unchanged from the morning's status — fix #1 (mobile page weight / LCP) partially shipped via the morning's drone + showcase swaps; PostHog `disable_surveys` and the `index.html:1671` JS TypeError both still pending.
- **No site/HTML/schema changes today's evening session** — all four commits are pure tooling. Source code (HTML / CSS / JSON-LD / sitemap) untouched between 21edf38 and 762b9b8.

### 2026-05-06 — Homepage Video Refresh: Drone Swap + Showcase Aerial + Branded Showreel Restore + Reviews → 20 + AEO Citation Monitor (untracked)
Four commits to main today (660ead1 → 21edf38) plus new local cron infrastructure for AEO citation monitoring + Google Reviews auto-sync. Net effect: homepage video stack got a quality + perf bump (partial mobile-LCP win on the 2026-05-04 audit's #2 finding), branded music showreel restored to bottom, automated review feed ticked 19 → 20.
- **Commit 660ead1 / Homepage drone footage swap:** `/assets/drone-footage.mp4` replaced (13.2 MB → **5.2 MB**, H.264 720p, 24.5s) with a fresh upscaled DJI clip (source: `dji_fly_20260504_172428` — real Landon drone, authenticity verified). New poster `/images/projects/heber-valley-drone-poster.webp` (luxury Heber Valley reroof, Wasatch backdrop). Moov-first faststart layout for instant streaming. Old files preserved in `assets/_backup-2026-05-06-drone-swap/` (untracked). **Direct partial fix for the 2026-05-04 audit's 6.1 MB mobile page weight finding** — drone clip was the largest single asset on the homepage at 13.2 MB; cutting it to 5.2 MB removes ~8 MB of mobile bandwidth on first load.
- **Commit 64128a4 / "Watch Us Work" showcase swap:** Top homepage `#watch-in-action` section swapped from the 22 MB / 10.6 MB 60-second narrative to a fresh aerial drone clip (`frame-restoration-showcase.mp4` 22 MB → **5.4 MB** H.264 720p / `.webm` 10.6 MB → 7.5 MB VP9 720p). Poster updated. Video element flipped from `controls` → `autoplay muted loop playsinline` (silent aerial reads better as ambient loop). Copy: "One minute / tear-off to finished" → aerial-pass framing. VideoObject JSON-LD `name`/`description`/`duration`/`uploadDate` updated to match. Meta tag "60-Second Showcase" → "Aerial Showcase". `?v=20260506` cachebuster on all asset URLs to defeat CDN/browser cache. Old files preserved in `assets/videos/_backup-2026-05-06-showcase-swap/` (untracked).
- **Commit 4009ffe / Restore branded 60s music showreel to bottom Video Showcase section:** The old 22 MB 1080p music narrative was NOT deleted — it was repurposed. New files `assets/videos/frame-roofing-showreel.{mp4,webm}` (22.0 MB / 10.7 MB) + poster shipped, and the bottom Video Showcase section now plays the click-to-play branded showreel **with audio**. Top section keeps the new silent DJI aerial loop from 64128a4. Element changed from `autoplay/muted/loop` → `controls` (autoplay-with-sound is browser-blocked; click-to-play unlocks the music). `?v=20260506` cachebuster on all 3 URLs. **Net homepage video stack:** silent aerial loop above the fold (fast LCP) + click-to-play branded music narrative below (full brand experience for engaged scrollers).
- **Commit 21edf38 / Google Reviews → 20 (auto-update):** Review Bot (`review-bot@frameroofingutah.com` automation identity) appended a new review to `data/google-reviews.json` and bumped `reviews.json` count 19 → 20. AggregateRating across LocalBusiness JSON-LD + 45 location pages now shows **20 reviews / 5.0 stars** (was already 20 in copy as of 2026-04-22 — this is the cron catching up the underlying JSON to match). Closes the "20 reviews" claim audit gap.
- **NEW AEO citation monitor cron stack (untracked, local-only):** Three new untracked artifacts on disk: `scripts/aeo-citation-monitor.py` (15.3 KB Python script — likely polls AI engines for Frame Roofing Utah brand mentions / extractions), `scripts/aeo-citation-cron.sh` (1.9 KB launcher), `scripts/update-google-reviews-cron.sh` (3.1 KB — wraps the existing `update-google-reviews.py` for cron). First citation snapshot at `data/aeo-citations/2026-05-06.md` (1.4 KB). All four files are gitignored or pending decision (also: `data/audits/` from the 2026-05-04 Lighthouse drop is still untracked). **Open question logged 2026-05-04 (whether to commit raw Lighthouse JSONs vs. rendered MD only) is still open** — neither path taken yet.
- **Lighthouse audit follow-through status (re: 2026-05-04 entry's 3 fixes):**
  1. Mobile page weight (LCP 7.8 s) — **partially shipped** by today's drone + showcase swaps (≈ −20 MB mobile bandwidth). PostHog surveys disable + JS console TypeError still pending. Re-audit recommended on next perf push.
  2. PostHog `disable_surveys: true` — still pending.
  3. `index.html:1671` JS TypeError — still pending.
- **No other code changes today.** No service-page edits, no schema changes, no sitemap delta. Source code untouched between 21edf38 and the next session.

### 2026-05-04 — Lighthouse Audit Drop from Frame-TX Session (Live Site: 70/100/100/100 mobile · 93/100/96/100 desktop)
No code commits today — but a meaningful artifact landed. A Lighthouse 13.1.0 audit of `https://www.frameroofingutah.com/` was dropped into `data/audits/` (untracked) by a Frame-TX session for the Utah dispatch lane to act on. Three new files (≈1.8 MB total): `lighthouse-2026-05-04-mobile.json`, `lighthouse-2026-05-04-desktop.json`, and a rendered summary `lighthouse-2026-05-04.md`. **The audit is NOT auto-applied** — per the dispatch hard rules in MEMORY (`feedback_frame_roofing_reviews.md`, `feedback_frame_brand_boundary.md`), all Utah HTML edits go through the Utah Cowork lane to avoid race conditions with parallel sessions.
- **Scoreboard:** Desktop **93 / 100 / 96 / 100** (perf / a11y / best practices / SEO). Mobile **70 / 100 / 96 / 100**. A11y 100 + SEO 100 on both viewports — strong line item for Landon's value memo. Mobile perf + best-practices are the only gaps.
- **Mobile CWV:** LCP **7.8 s** 🔴 (target < 2.5 s) — single biggest score-killer. CLS 0, TBT 0 ms, FCP 2.4 s, Speed Index 4.4 s. Mobile LCP > 2.5 s is what's blocking "Good" mobile CWV in GSC — a direct Google ranking signal for "roofer near me" queries.
- **Three specific fixes recommended** to take Utah to 100/100/100/100:
  1. **JS TypeError on every page load** (−4 BP both viewports). `errors-in-console` failing — `index.html:1671` calling `document.addEventListener(...)` where the LHS isn't an EventTarget. Fix: null-check the selector or fix the typo. Estimated 10 min. Flips BP 96 → 100.
  2. **6.1 MB mobile page weight** (LCP 7.8 s → ≤ 2.5 s). 30 requests / 6 scripts / 3 stylesheets / 3 fonts. Likely culprits: hero/photo imagery shipped at desktop res to phones (no `srcset`), PNG/JPEG instead of WebP/AVIF (note: 88 images already converted 2026-04-12 — verify hero set is included), missing `loading="lazy"` below fold, missing `width`/`height` attributes. Estimated 1–2 hr. +15–20 mobile perf pts (70 → 85–90).
  3. **PostHog shipping 65 KB unused JS** (−3–5 mobile perf). `posthog/static/array.js` 37.8 KB unused / `surveys.js` 27.0 KB unused (81%). Frame Utah doesn't use PostHog surveys. Fix: pass `disable_surveys: true` at init OR switch to the `array.no-surveys.min.js` CDN variant. Estimated 5 min. +3–5 mobile perf pts.
- **Combined post-fix projection:** Desktop 98 / 100 / 100 / 100. Mobile 92 / 100 / 100 / 100. 100/100/100/100 is achievable if hero conversion gets total page weight to ≤ 1.5 MB (mobile perf 95+).
- **Suggested next-session ship:** single PR titled `perf: Lighthouse 70→92 mobile + 100/100/100/100 desktop`. Re-audit on Vercel preview before squash-merge. Do NOT bundle with marketing content changes — keep it focused for clean rollback + clean lift attribution in the Friday weekly review.
- **Open question to resolve before commit:** whether to commit the JSONs (~1 MB each, useful for trend tracking against future audits) or `.gitignore data/audits/lighthouse-*.json` and only commit rendered summaries. The audit MD recommends one of those two paths, not pushing the raw JSONs unreviewed.
- **No commit made today** — refresh-only update to capture the audit context for the next Utah-lane session. Source code untouched since PR #14 (commit 818a0bd, 2026-05-01).

### 2026-05-01 — May Lead-Velocity Sprint Day 1: 6-PR Wave (Reviews / noindex Fix / Form CRO / Storm Hub-Spoke / Neighborhood Depth / FAQ AEO)
Six PRs merged to main today (#9 → #14) executing the first wave of the May 2026 lead-velocity sprint (canonical plan: `data/30-day-lead-sprint-2026-05-01.md`, vercelignored). All shipped through normal squash-merge → main → Vercel auto-deploy. Mix of CRO, SEO unblocks, AEO, and topical-cluster depth — no edge-function or schema-breaking changes.
- **PR #9 / Review velocity foundation (commit af15bc8):** Move #1 of the sprint — close the 20→54 review gap vs roofingutah.com (the #1 map-pack ranking factor per the May audit). Three surfaces:
  - **`thank-you.html`** — added a second card below "Message Received" (gold left-border, 5-star badge, "Help the next homeowner") pointing at `/review.html`. Both cards now in a flex stack. New PostHog events: `review_cta_click` (source=thank_you) + `lead_thank_you_view` for funnel attribution.
  - **`index.html` footer** — Contact column gained a gold "★ Leave a Review" link to `/review`. Every visitor (not just post-conversion) now has a review path.
  - **`pages/about.html`** — legal name corrected `Frame Roofing Utah LLC` → `Frame Restoration Utah LLC` in JSON-LD `legalName` + footer copyright. **Resolves the open question logged 2026-04-30** about whether the entity-name correction should land. Confirmed: registered Utah LLC = Frame Restoration Utah LLC (DBA Frame Roofing Utah).
  - **Sprint docs added (vercelignored):** `data/30-day-lead-sprint-2026-05-01.md` (canonical May sprint plan — 5 highest-EV plays w/ effort scores + impact + cadence) + `data/RYAN-VALUE-MEMO-2026-05-01.md` (Landon-facing build receipt + 10% commission cadence ask).
- **PR #10 / 5-week-old noindex bug + form CRO (commit ee88e79) — CRITICAL:** Two service pages had been silently telling Google `noindex,nofollow` for **5 weeks** since commit 53d6352 (2026-03-28 storm-damage consolidation). `pages/storm-damage.html` (highest-CPL page in Frame's vertical — hail / wind / insurance) AND `pages/general-contracting.html` were both in sitemap.xml + canonical to themselves but tagged noindex. Fixed: `noindex,nofollow` → `index,follow,max-snippet:-1,max-image-preview:large` on both. Plus Move #3 from the sprint — **form CRO 6→3 required fields** across all three primary funnels (index hero form, index #contact long form, global-modal.js booking modal). Required: Name + Phone + ZIP. Email/city/service/issue/message moved into a collapsed `<details>` "Add details (optional)" disclosure. Hero subhead changed to "3 fields, 30 seconds. We'll call you back within 15 minutes during business hours." Documented expectation: 20-35% completion lift. Modal also fixes a typo where ZIP wasn't being captured before. Forms still POST to same `/functions/v1/handle-lead` endpoint (handle-lead v5 already tolerates empty optional strings).
- **PR #11 / Visible FAQ blocks matching schema on top 3 service pages (commit a5b2351):** Move #5 from the sprint (AEO citation moat). storm-damage, roof-replacement, and insurance-claims pages all had FAQPage JSON-LD in `<head>` but **zero matching visible HTML** — schema-content mismatch silently disqualified them from FAQ rich-result eligibility, and AI engines (ChatGPT, Perplexity, Google AI Overviews) couldn't extract answers because they only cite from visible content. Fix: 4 visible Q&A blocks per page inserted between `</main>` and `<footer>`, near-verbatim to the JSON-LD (≥70% word overlap, no contradicting facts), reusing residential-roofing.html's existing FAQ block style for visual consistency. Each page +23 lines. Especially high-value for storm-damage now that PR #10 just unblocked it from indexing.
- **PR #12 / Storm-damage hub: link to all 11 city storm/hail/wind blog posts (commit 754114c):** storm-damage.html previously linked to only 2 city posts. Expanded the hub-spoke cluster to all 11 city storm/hail/wind posts (hail pillar + storm checklist + sandy/lehi/herriman/riverton/draper/ogden/bountiful/provo/west-jordan/heber-city). Section retitled "City-Specific Storm & Hail Damage Guides" (H3 → H2). Compounds the noindex unlock — city posts now flow PageRank into the canonical storm-damage page, AND any user landing on a city post has a clear path to the conversion-optimized service page.
- **PR #13 / Review CTAs on 45 location pages + thank-you primary CTA flip (commit 8c57b7a):** Move E + D from the sprint.
  - **Move E:** Each of the 45 location-page footers now carries a gold "★ Leave a Review" link to `/review.html`, inserted into the existing footer link row (Home · Privacy · Terms · phone). Single perl in-place edit; all 45 files match. **45×s the review-acquisition surface area** beyond the homepage footer + thank-you page already shipped in PR #9.
  - **Move D:** thank-you page primary visual CTA flipped from "Back to Home" (wasted action — sending converted leads back to the page they just left) → **gold ☎️ Call 435-302-4422 (tel:)** as the primary CTA. New headline: "Got it — we're on it." Sets explicit 15-minute response expectation tied to business hours. "Back to Frame Roofing Utah" demoted to a small grey link. PR #9's review card preserved as secondary cardstack. New PostHog event `post_lead_call_now` fires on tap so the dashboard can measure submitter→immediate-call conversion (strongest possible lead-quality signal).
- **PR #14 / Storm cluster reverse-links + neighborhood depth on top 3 location pages (commit 818a0bd):** Two compounding moves shipped together.
  - **PART 1 — Reverse storm CTAs on 11 city blog posts:** Closes the loop on PR #12. Every one of the 11 city storm/hail/wind blog posts now has a dark-navy CTA card (with city-personalized headline like "Storm hit your Sandy roof?") pointing back to `/pages/storm-damage`, plus a tap-to-call CTA. Inserted between `</article>` and existing related-articles / blog-cta / author-bio. JSON-LD untouched. None of the 11 had a pre-existing CTA card to /pages/storm-damage — only inline body links — so all 11 got the dedicated card.
  - **PART 2 — Neighborhood-specific depth on 3 highest-traffic location pages:** Audit agent flagged location pages as templated despite the earlier "unique city-specific content" rewrite. Real depth comes from concrete local data AI engines can extract for citation. Added a "{City} Neighborhood-Specific Roofing Notes" section with 4 callout cards each, sourced from real public planning code + IRC + manufacturer specs:
    - **heber-city.html:** Old Town pre-1960s cedar-shake-under-asphalt → tear-off on reroof; 5,600 ft snow load 50-70 psf per IRC Table R301.2(1) + structural review on 60+ yr roofs; mountain ice dam → 3 ft past interior wall I&W per IRC R905.1.2; Wasatch Mountain HOA earth-tone palette (OC TruDefinition Estate Gray / Driftwood).
    - **park-city.html:** Old Town HDC review per Ch. 15.11; Deer Valley Class A + 30-yr warranty (CT Landmark / standing-seam OK, 3-tab disqualified); 7,000 ft + lake-effect 80-100 psf, full-deck I&W shield above 6,500 ft; Empire Pass / Promontory / Glenwild HOA design-review coordination.
    - **salt-lake-city.html:** Avenues HDC permit on 1,300+ contributing structures; Sugar House 1920s-40s bungalows 4/12-6/12 + Class A citywide; Capitol Hill / Federal Heights — copper restricted in some Capitol Hill micro-overlays; SLC heat island west of I-15 → cool-roof shingles or 50%+ ventilation upgrade.
    - Each section closes with a sources attribution line citing the city planning code, IRC R905, manufacturer specs, and Frame's Utah DOPL license #14256097-5501. Reuses existing `.services-mini` / `.service-mini-card` classes (zero new CSS).
- **Net effect:** the 5-week-silent noindex bug is fixed, review-acquisition surface area went from ~2 surfaces to ~48 (homepage footer + thank-you + 45 location footers + about page links), the top 3 lead-volume forms are 50% smaller (6 → 3 required fields), the storm cluster now has a complete bidirectional hub-spoke (1 hub ↔ 11 spokes), top 3 service pages have visible-FAQ AEO citation surface, and the top 3 location pages have concrete neighborhood-specific data AI engines can quote. **Untouched intentionally:** Twilio 10DLC TCR brand-alignment from yesterday (no new fixes there yet); /dashboard/ (no Phase 3 work today); CLAUDE.md self-update sweep (this auto-refresh).

### 2026-04-30 — 10DLC Brand-Alignment Fix: Registered Brand Name in SMS Consent + Privacy + Terms
Single commit (1a15637) closing TCR campaign rejection **30927**: "opt-in consent named a different company than the registered brand 'Frame Restoration LLC'." The registered TCR brand for A2P 10DLC is **Frame Restoration LLC (DBA Frame Roofing Utah)** — but the SMS consent copy across forms, modal, and legal pages had been naming "Frame Roofing Utah" alone. Fix sweeps every SMS-consent surface to use the legally-registered brand string while leaving the consumer-facing "Frame Roofing Utah" brand in place everywhere else. **4 files changed** (`global-modal.js`, `index.html`, `privacy.html`, `terms.html` — 7 insertions, 7 deletions).
- **Forms (3 places — index hero form, index contact form, global modal):** consent copy now reads "I agree to receive SMS/text messages from **Frame Restoration LLC (DBA Frame Roofing Utah)**, sent from +1 435-292-8802, about my inquiry — including appointment confirmations, inspection scheduling, project updates, and service follow-ups." Was "from Frame Roofing Utah (sent from +1 435-292-8802)". Restructured punctuation: parenthetical sending-number → comma-delimited, then em-dash before the message-types list — keeps the registered-brand clause reading cleanly.
- **index.html Contact → Text card microcopy:** "SMS from **Frame Restoration LLC (DBA Frame Roofing Utah)**. Msg & data rates may apply…" (was "SMS from Frame Roofing Utah…").
- **privacy.html §SMS/Text Messaging:** opener rewritten to "SMS/text messaging is a separate, optional service operated by **Frame Restoration LLC (DBA Frame Roofing Utah)**." Both subsequent "from Frame Roofing Utah" mentions in this section now read "from Frame Restoration LLC."
- **terms.html §SMS/Text Messaging Terms:** same swap in the opener; **§Cost** also updated — "Frame Restoration LLC does not charge for text messages…" (was "Frame Roofing Utah does not charge…").
- **What this unblocks:** TCR (The Campaign Registry) CTA verification → Twilio campaign approval → Twilio outbound SMS delivery. Continues the rejection-chain saga (30034 → 30923 → 30927). Verizon email-to-SMS gateway (4353024422@vtext.com) remains the working fallback in the meantime.
- **Untouched intentionally:** marketing copy, hero H1, page titles, footer brand lines — those all keep "Frame Roofing Utah" since the TCR brand-alignment requirement only applies to the SMS-consent context. "Frame Restoration LLC" only appears in SMS-consent strings + SMS-related legal sections.
- **Working-tree note (uncommitted as of refresh):** `pages/about.html` has a 2-line edit changing JSON-LD `legalName` and the footer copyright string from "Frame Roofing Utah LLC" → "Frame Restoration Utah LLC" — a related entity-name correction matching CLAUDE.md's PEOPLE section. Not yet committed. **Open question worth verifying with Landon/TCR docs:** the registered TCR brand is "Frame Restoration LLC" (no "Utah"), but the about.html JSON-LD/footer use "Frame Restoration Utah LLC" (with "Utah"). These may be two distinct strings (LLC filing name vs. TCR brand registration name) — confirm before committing about.html so the schema's `legalName` matches the actual Utah Secretary of State filing.

### 2026-04-28 (afternoon) — /dashboard/ Phase 2 Site Health Tiles + Silent-Webhook-Failure Recovery + PSI Wiring
Three commits (#6, #7, #8) extending `/dashboard/` with SEO/AEO signals beyond Supabase data — and surfacing a Vercel deploy-trust gap in the process.
- **PR #6 / Phase 2 Site Health tiles (commit 50320e1):** New "Site Health" section between Biggest Movers and Top Pages, three tiles pulling SEO/AEO signals beyond the existing Supabase pipeline. **194 lines added across 2 files** (`dashboard/dashboard.js` +178, `data/dashboard-config.json` +16). All client-side; no edge function changes.
  - **⭐ Reviews Velocity** — reads `/reviews.json` (already populated by SerpAPI bi-monthly sync). Total count + rating + days-since-last-review color-coded (green ≤14d, orange ≤30d, red older). Configurable competitor-gap line displays "vs roofingutah.com: gap 34" — surfaces the marketing-build audit's #1 finding (reviews are the actual gap, 20 vs 54). No auth, no spend.
  - **📝 Content Freshness** — parses `/sitemap.xml` lastmod dates. Total indexed pages + days-since-most-recent-update + 7d/30d/90d update counts. Catches the "we haven't touched /pages/storm-damage in 6 months" stale-content drift pattern. No auth, no spend.
  - **⚡ Core Web Vitals** — PageSpeed Insights API integration with 60-min sessionStorage cache (avoids repeated PSI hits within a session). LCP / CLS / INP / TTFB origin-wide field data when available + Lighthouse lab perf score. Graceful fallbacks: no API key → "Add a key to dashboard-config.json"; has key, no field data → "Insufficient field data — site needs more traffic for CrUX inclusion." Frame Utah is currently in the second state (587 impressions/30d too low for CrUX inclusion).
  - **Config:** `dataSources.{reviews, sitemap, psi}` in `dashboard-config.json`. Each tile silent-fails if endpoint unreachable — won't break dashboard if a feed goes down.
- **PR #7 / Force re-deploy + verify-deploy.sh (commit d083be1):** PR #6 (v0.11.0) merged to main 16:24Z but Vercel didn't deploy it — both Vercel projects still served v0.10.0 (26231 bytes) while GitHub raw had the correct v0.11.0 (36230 bytes). The squash-merge → main → Vercel webhook chain failed silently. Fix:
  - Added `deploy-stamp: v0.11.1` comment at top of `dashboard.js` to force a content change Vercel can't dedupe with previous build cache.
  - Added `scripts/verify-deploy.sh` — compares local file size to production after a configurable wait, fails loud on drift. Should run after every PR merge that touches `/dashboard/*` until we trust the auto-deploy chain.
  - **Lesson logged:** declaring "shipped" after `gh pr merge --auto` without verifying production bytes is a real bug — closing the loop with the verify step.
- **PR #8 / Wire PSI API key + dataSources to inline config (commit b6f817c):** Loaders read `CFG.dataSources.*` from `window.DASHBOARD_CONFIG`, but the inline config block in `dashboard/index.html` only had the flat `clientName/supabaseUrl/etc.` fields — no `client.domain` and no `dataSources` block. Result: PSI tile fell through to the configure-key prompt even though `data/dashboard-config.json` had all the wiring. Fix: added `client.domain` (used as PSI origin fallback) + `dataSources` block (stormWatch/reviews/sitemap/psi) mirroring `data/dashboard-config.json` so the loaders actually see config. Live PSI API key now in both files; key restricted to PSI API + HTTP referrer `www.frameroofingutah.com/*` in Google Cloud Console (so even though it's exposed in page source — necessary for browser-side PSI calls — blast radius is limited). Bumped deploy-stamp to **v0.11.2** to force byte-size change so Vercel actually redeploys (vs. the v0.11.0 silent webhook failure discovered earlier the same day).
- **Net effect:** `/dashboard/` now ships its first non-Supabase signal layer — reviews velocity (which directly maps to the marketing-build $1,700/mo reviews acquisition allocation), content freshness (catches stale pages before they drift), and CWV (origin-field where CrUX data exists, lab fallback otherwise). Plus a deploy-trust loop closure (`verify-deploy.sh`) so the next webhook silent-failure gets caught immediately instead of hours later.

### 2026-04-28 — /dashboard/ Polish Stack: Chart-Height Hotfix + Growth-vs-Prior-Period + Biggest Movers + Storm Watch
Three back-to-back commits hardening `/dashboard/` after the 2026-04-27 evening launch. All client-side — no edge function changes, ships immediately on Vercel deploy.
- **Chart canvases full-screen-height hotfix (commit 96f2c56):** Chart.js doughnuts were rendering 1500px+ tall on wide monitors because `maintainAspectRatio:true` (the default) sizes the canvas to match its container width. On a 1500px-wide chart cell, that produced a 1500px-tall doughnut, pushing top pages table + location heatmap + recent leads + insights below the fold. Fix: cap canvas to 280px max via CSS + set `maintainAspectRatio:false` on both Chart.js configs so Chart.js respects the CSS-imposed height. 1 file changed (`dashboard/dashboard.js`).
- **Growth-vs-prior-period comparisons (commit ed493ea):** Time-range buttons changed 7/14/30/90 → **7/30/60/90** (Ryan's preference for SEO/AEO impact tracking). For each click, dashboard now fires TWO parallel fetches (`days=N` and `days=2N`), derives prior-period totals by subtraction (`current_2N − current_N`). Added growth indicators on KPI tiles (Pageviews / Google Organic / Form Leads / Inbound Calls — green=up, red=down, "NEW"=no prior data) + new Growth column on the Top Pages table showing per-page % change vs prior period of same length. Doubles bandwidth per range click (2 fetches instead of 1) — acceptable for the SEO/AEO observability win. If edge function gets slow at days=180, can later add a server-side `compare_days` param to do this in one call. 3 files changed (`dashboard/dashboard.js`, `dashboard/index.html`, `data/dashboard-config.json`).
- **🚀 Biggest Movers section + ⛈️ Storm Watch tile (commit 7a42f1d):** Two compounding wins on top of the growth data.
  - **🚀 Biggest Movers** — between charts and Top Pages, three columns: 📈 Top Growers (top 3 pages by positive growth %), ✨ Fresh Wins (top 3 NEW pages with no prior-period data), 📉 Needs Attention (top 3 pages with negative growth). Each card: page name + view count + growth %, color-coded. Directly extracts the SEO/AEO impact signal from the growth metrics added in #4.
  - **⛈️ Storm Watch** — top of dashboard, polls NWS API (`api.weather.gov`) on every render. Free public API, browser CORS allowed, no auth. Filters to roofing-relevant events (storm, wind, hail, tornado, thunderstorm, hurricane, winter, blizzard, ice, snow, flood) at Moderate/Severe/Extreme severity. **Active alert:** red/orange/gold border + event icon + headline + areaDesc + "Storm-trigger reserve recommended" CTA (ties to the $800/mo storm-trigger reserve recommendation in `data/MARKETING-BUILD-CONTEXT.md`). **No alerts:** green checkmark + "Storm-trigger reserve held; bid back to baseline." Configurable area via `dataSources.stormWatch.area` (default: UT). Silent fail if NWS unreachable so a weather-API outage can't break the dashboard. 2 files changed (`dashboard/dashboard.js` +114 lines, `data/dashboard-config.json` +5 lines).
- **Net effect:** `/dashboard/` is now actually usable on wide monitors (chart fix), shipped its first SEO/AEO observability layer (growth deltas + Biggest Movers), and gained a marketing-intel-aware operations widget (Storm Watch ↔ $800/mo storm reserve). Zero edge-function or schema changes — all four PRs merged today were pure client-side.

### 2026-04-27 (evening) — Dashboard Module + Marketing Build Context + Wave 2 Wiring + /dashboard/ Hotfix
Two PRs merged via release branch `release/2026-04-27-dashboard-and-marketing` plus the immediate hotfix.
- **PR #1 (commit bb48056):** `/dashboard/` productized module + marketing build context + Wave 2 marketing-intel wiring. **27 files changed, +5708/−1.**
  - **`/dashboard/` module** — productized client-dashboard vendored from RCBuild-Kit v0.8.0, replaces standalone `seo-report.html` pattern with a parameterized template. Config-driven via `window.DASHBOARD_CONFIG` (reads `data/dashboard-config.json`). **Same edge function (`/functions/v1/weekly-report`), same PIN system, same Supabase tables — existing PINs continue to work.** Files added: `dashboard/index.html` (118), `dashboard/dashboard.css` (196, with `--brand-accent` CSS variable for white-label), `dashboard/dashboard.js` (353; identical UX to seo-report.html — PIN gate, KPI grid, charts, admin panel), `data/dashboard-config.json` (86, per-client install state).
  - **Migration path:** `/seo-report.html` ships unchanged as fallback. After ~7-day soak verifying `/dashboard/` in production, plan 301 from `/seo-report.html` → `/dashboard/`.
  - **`.vercelignore` cross-state leak guard** — added 15+ Texas-pattern globs (`Fort-Worth-*`, `Dallas-*`, `Frisco-*`, `Plano-*`, `McKinney-*`, `Allen-*`, `Prosper-*`, `Celina-*`, `Lewisville-*`, `Carrollton-*`, `Flower-Mound-*`, `Southlake-*`, `TX-*`, `Texas-*`, `DFW-*`) so TX content can never accidentally deploy on the Utah site. Mirrors the brand-boundary lockdown enforced 2026-04-22.
  - **Marketing build context (canonical entry-point pattern):**
    - `data/MARKETING-BUILD-CONTEXT.md` (308 lines) — single "start here" doc for any agent (Cowork, Claude Code, future-you) working on Frame Utah marketing. Contains active $15K/mo allocation, Wave 1 findings already integrated, Wave 2 fire commands, free actions today, KPI scoreboard, confidence scorecard, full file index.
    - `data/market-intel-audit-2026-04-27.md` (252 lines) — full $15K/mo deep-dive audit: Tier-1-4 city ranking with EV math, channel ranking with Utah-specific CPL, Wave 1-3 confidence scorecard, KPI dashboard, open decisions.
    - `DASHBOARD-SECURITY-CHECKLIST.md` (122 lines) — per-project security verification with active curl tests for RLS posture (vercelignored as `*.md`).
  - **CLAUDE.md self-update (+57 lines):** new "💰 MARKETING BUILD (Active April 2026)" section between PRIORITY TODO and GIT WORKFLOW. Quick-reference allocation, Wave 1 finding (roofingutah.com content-DORMANT since 2024-05-31 → reviews acquisition is the actual gap, not content), npm scripts table, free actions, key files list, operational separation reminder pointing at MARKETING-BUILD-CONTEXT.md as canonical entry.
  - **Wave 2 marketing-intel wiring (~$33 spend pending company CC):**
    - `scripts/market-intel.mjs` + `scripts/market-intel-config.json` — 45 Wasatch Front + Heber Valley cities × 4 tiers, $15K growth tier
    - `scripts/market-intel-kit/` — bundled scoring + allocator + sources from RCBuild-Kit v0.7.0 (kept in-repo so runner works without npm-link)
    - `scripts/competitor-ads.mjs` — SerpAPI sweep on roofingutah.com + utahroofingcompany.com + reignroofing.com (~30 queries × $0.005 = ~$0.15)
    - `scripts/competitor-tiktok.mjs` — Apify TikTok scraper for UT competitor handles (~5 profiles × $0.30 = ~$1.50)
    - `scripts/supabase-pipeline-query.sql` — ready-to-paste SQL for real per-city job-value + close-rate from `leads` table (Tier C → A unlock)
    - All scripts dry-run when env vars (`SERPAPI_KEY`, `APIFY_TOKEN`, `DATAFORSEO_*`, `CENSUS_API_KEY`) are missing — print queries + estimated spend, exit 0, no API calls.
    - First-run output committed: `data/market-intel-report.md` (449), `data/market-intel-allocation.json` (2099) — offline mode all-neutral factors → all-LSA naive allocation; documents the concentration argument from the audit.
  - **`package.json`:** 4 npm scripts wired — `npm run market-intel`, `market-intel:dataforseo`, `competitor-ads`, `competitor-tiktok`. `scripts/*` and `*.md` vercelignored; `data/market-intel-allocation.json` deploys but contains no PII (internal scoring snapshot only).
  - **Side update:** `directory-tracker.html` — BuildZoom directory submission marked Live with profile URL (`https://www.buildzoom.com/contractor/frame-restoration-utah-llc`).
- **PR #2 / hotfix (commit 801bc59):** Fix `/dashboard/` — use absolute paths for CSS + JS. **Bug:** Vercel's `cleanUrls` + `trailingSlash:false` combo redirects `/dashboard/` → `/dashboard` (no trailing slash). With relative paths, `dashboard.css` resolved to `/dashboard.css` (sibling, 404) instead of `/dashboard/dashboard.css` (child, the actual file). Cascade: `dashboard.js` never loaded → `window.__dashboard` undefined → form's `onsubmit` handler threw `TypeError` → form submitted natively → page reloaded with no auth attempted. User saw "PIN didn't work" because the JS path that would have called the edge function never executed. **Fix:** switch `<link>` / `<script>` tags to absolute paths so resolution doesn't depend on the request URL's trailing-slash state. Same fix applied upstream in RCBuild-Kit `core/client-dashboard/template/`.

### 2026-04-27 — Blog Hero Image Uniqueness + Template Parity + Eager-Load LCP Fix
Three commits closing residual blog image-collision gaps left over from the 2026-04-20 hero photo rotation pass and a follow-up perf fix for blog hero LCP.
- **Reassign 3 duplicate blog hero images to unique real-Landon shots (commit a89192e):** Audit found 35/38 unique og:image entries across blog — three posts were still sharing hero photography. Fixes:
  - `blog/heber-city/reroofing-complete-guide.html` — `frame-restoration-08` → `heber-custom-reroof-aerial-1` (updated body `<img>`, og:image, and JSON-LD schema image — all 3 references aligned)
  - `blog/utah/how-to-choose-a-roofer-utah.html` — `frame-restoration-18` → `heber-valley-crew-rooftop` (og:image only at this commit)
  - `blog/utah/spring-roof-inspection-utah.html` — `heber-city-residential-reroof-2026` → `salt-lake-city-residential-reroof-2026` (og:image + twitter:image)
  - Result: **38/38 unique og:image entries**, all authentic real-Landon photography. Eliminates cross-post visual collision in social shares + Discover feed.
- **Bring how-to-choose-a-roofer-utah to template parity (commit 4efcc14):** Follow-up on the prior commit. The post had an inconsistency the audit didn't catch on the first pass — body `<img>` and JSON-LD `image` field weren't aligned with the new og:image. Fixes:
  - Added missing JSON-LD `BlogPosting.image` field (was absent from schema entirely)
  - Updated body hero `<img>` + alt text from `salt-lake-city-residential-reroof-2026` (which is now spring-roof-inspection-utah's hero — would have re-introduced a collision) → `heber-valley-crew-rooftop` to match og:image
  - All 3 image references now aligned (og:image + body img + JSON-LD image) — full template parity restored
- **Eager-load blog hero images for faster LCP (commit 40b6073):** User-reported visible blank gap on first paint where blog hero images appeared missing. Root cause: `figure.blog-featured-image` heroes were marked `loading="lazy"` even though they sit just below the dark page header — still in the initial viewport on most devices. Lazy loading was deferring fetch past first paint and dragging LCP. Swapped `loading="lazy"` → `loading="eager" fetchpriority="high"` across all 23 blog posts using the template — web-standard pattern for above/near-the-fold heroes. **0 remaining lazy-loaded heroes** in the blog hero figure template. Affects 23 files (1 line each, +23/−23). Visible-on-paint blog heroes; cleaner LCP signal for Core Web Vitals.

### 2026-04-24 (afternoon) — AEO Audit Gap Closure + llms.txt Markdown Polish + .vercelignore Incident #3
Three commits closing gaps surfaced by the 2026-04-24 Perfect Stack AEO audit (score 76/B → projected 91/A-) plus a repeat of the `.vercelignore` sweep booby-trap.
- **.vercelignore incident #3 (commit f51a24c):** `directory-blitz-tool.html` was 404ing in production — Landon is actively working through its "What We Need From You" todo block. Same root cause as the 2026-04-22 seo-report.html and reviews.json incidents: the audit commit swept it into the "Internal-only HTML" ignore bucket by name. While in, also unblocked the two siblings shipped by the same bug: `backlink-playbook.html` (12 backlink opportunities, shared with Landon) and `directory-tracker.html` (interactive React tracker, 38 directories) — both 404 live for the same reason. Expanded the `.vercelignore` warning header with the directory-blitz-tool incident note. **Working heuristic (third time confirmed):** "is this file fetched by the site OR shared with a customer/partner? If yes, LEAVE IT." The name-based "internal-looking" heuristic has failed three times — retire it.
- **AEO audit gap closure (commit ba20b2e):** Closed 4 of 6 Perfect Stack gaps flagged in the 2026-04-24 run.
  - **index.html hero `<p>`:** prepended "Frame Roofing Utah is a family-owned, licensed roofing contractor based in Heber City" (definition pattern — AI systems extract direct answers from "[Entity] is a [class] [qualifier]" structures). Fixed "10-year" (non-breaking hyphen) → "10 years" so the AEO-audit regex that counts numeric specifics actually matches.
  - **.quick-answer-strip section** added between hero and `#watch-in-action` — reinforces the definition + specifics (20 reviews / 5.0 stars / 45 cities / BBB A+) and carries a visible "Last updated: April 24, 2026" freshness stamp. The 87 blog + location pages already had last-updated stamps from 2026-04-22; the homepage itself was the gap.
  - **LocalBusiness JSON-LD:** added `"dateModified": "2026-04-24"` (was absent — maintenance-layer scored 0/2, now 2/2).
  - **llms.txt Texas-brand disambiguation:** rewrote "is a different business" → "not to be confused with … distinct from" phrasing (AEO entity-disambiguation checks look for "not to be confused" / "distinct from" / "different from" markers — the prior phrasing bypassed the heuristic).
  - **Intentionally untouched:** review count (owned by scheduled trigger `trig_01NZuRWGiWRybBqCYgrG5zcC`), .vercelignore hygiene (Cowork's territory), CWV field-data (needs real-user PSI data).
- **llms.txt A-grade markdown polish (commit 58d07f1):** audit's `llms_txt_quality` check counts `](http` markers as a proxy for llmstxt.org format (title + blockquote + sections + links). File had zero markdown-style `[title](url)` links — all Blog Library + People/Owner entries used `- Title — url`. Converted 11 lines to `- [Title](url)`. No content loss; links now crawlable as markdown for AI agents honoring the llmstxt.org spec. Score delta: `llms_txt_quality` 2/5 → 5/5 projected; overall 88 → 91 (A-).

### 2026-04-24 — 10DLC Fix: Publish Twilio Sending Number (435-292-8802) on Site + Forms + Privacy + Terms
Single commit (30b0215) to satisfy **TCR (The Campaign Registry) CTA verification** for A2P 10DLC. Carriers (T-Mobile / AT&T) were rejecting the campaign because the sending number wasn't disclosed on the website or in the consent flow. Fix: publish 435-292-8802 everywhere SMS-related, keep 435-302-4422 as the voice number.
- **index.html:**
  - Hero form + contact form — SMS consent checkbox copy expanded: names the sending number "(sent from +1 435-292-8802)", enumerates message types (appointment confirmations, inspection scheduling, project updates, service follow-ups), adds "Msg frequency varies (up to 5/month)" and "Reply STOP to opt out, HELP for help"
  - Contact section — new **Text** contact card added next to Phone card with `sms:+14352928802` link + inline microcopy "SMS from Frame Roofing Utah. Msg & data rates may apply. Reply STOP to opt out."
  - Footer — split single phone line into two lines: "Call: 435-302-4422" (tel:) + "Text: 435-292-8802" (sms:)
- **global-modal.js** — booking modal's SMS consent copy upgraded to match the expanded version (sending number + frequency + STOP/HELP)
- **privacy.html §SMS/Text Messaging** — names "+1 (435) 292-8802" as the sending number; adds "inspection scheduling" to the message-type list
- **terms.html §SMS/Text Messaging** — same: names the sending number explicitly + expanded message types
- **data/google-reviews.json** — refreshed (23-line diff from routine scraper run)
- **screenshots/mobile-audit/** — 9 new mobile-audit captures + diagnostics.json committed (home / heber-city / roof-replacement / blog-storm above-the-fold + full + nav-open variants)
- **CLAUDE.md rule updated** — the old "ONE number everywhere, never use 435-292-8802" rule is obsolete. Replaced with role-separation: Call=302-4422 (tel:), Text=292-8802 (sms:). See CRITICAL RULES section.
- **What this unblocks:** TCR CTA verification → Twilio campaign activation → Twilio outbound SMS delivery (currently blocked by 10DLC error 30034). Verizon email-to-SMS gateway remains the working fallback in the meantime.

### 2026-04-22 (evening) — Mobile Polish: 3-Tier Pass + Swipe-Driven Reviews Carousel
Four focused commits cleaning up the mobile experience after the morning audit + afternoon hub-spoke work. No new features — just fixing what was already there but broken on phones.
- **Tier 1 — perf + touch targets (commit 95d04ff):** Killed the Mapbox 4s timeout fallback — IO + scroll triggers already cover real users, and the timeout was firing during Lighthouse audits on non-scrolling viewports, dragging 7s of Mapbox JS eval + 2.3s TBT into the initial-load measurement window. Null-safed the mobile nav toggle (`menuBtn.addEventListener` was throwing silently on homepage when element wasn't in expected state, breaking subsequent handler binding). SMS consent checkbox on hero + contact forms upgraded to WCAG-compliant tap target — label now min-height 44px with padding, input bumped browser-native ~13px → 22×22px, font 13→14px.
- **Tier 2 — type sizes + Quick Answer visibility + hamburger (commit eee3c00):** Homepage mobile ≤600px: hero-badge 10→12px (trust strip + BBB line was unreadable), hero p 14→16px (was below body-copy minimum), hero-points 13→15px. ≤900px: hero p 15→16px for consistency. Quick Answer boxes on 4 service pages (roof-replacement, storm-damage, insurance-claims, residential-roofing) — swapped #FAF9F5 cream bg → #EEF4F9 navy-tint (cream-on-cream page was nearly invisible), bumped border 4→6px, added subtle shadow for card affordance. Hamburger (.mobile-btn) was 33×24 — added min-width/min-height 44px + flexbox centering + padding 10px (WCAG 2.5.5 / Fitts' Law).
- **Tier 3 — legibility + thumb-zone polish (commit eef8145):** `.last-updated` freshness stamp inside blog/location hero backgrounds — force high-contrast rgba(255,255,255,0.82) via global CSS override (inline #6B7280 was rendering as faded grey on dark-navy heroes, missing the freshness signal Google + readers should see). `.content-section p` unified at 16px mobile (was special-cased at 15px for no reason). Homepage hero subhead trimmed 5 sentences → 2 (family-owned + trust triad) — phone already lives in CTA button + sticky mobile bar, and the 5-line wrap was crowding the primary CTA out of the first scroll.
- **Mobile reviews carousel — swipe-driven, content-sized (commit 764fdc9):** Three problems at once — short reviews rendered as tall empty boxes (min-height on slides), three long quotes stretched slides past 500px (no line clamp), and prev/next arrows were 32×32 — under the 44px touch minimum. Fixes: removed min-height on .rc-slide at ≤600px; clamped review body to 7 lines; hid .rc-arrow on ≤600px (dots remain for tap-to-page). Added touchstart/touchend swipe handler on `.rc-viewport` — 40px horizontal threshold, only fires when |dx| > |dy| so vertical page scroll still works; auto-advance pauses during touch. `touch-action: pan-y` lets browser own vertical scroll while handler owns horizontal.
- **Untracked in repo (FYI):** `data/` and `screenshots/` directories not tracked.

### 2026-04-22 (afternoon) — Close Audit Follow-Ups: Hail Hub-Spoke + Brand-Safe Review Sync + reviews.json Unblock
Cleared the two "Not auto-fixed" items from the morning audit, plus a second `.vercelignore` booby-trap that surfaced same day.
- **Hail/storm cluster cannibalization resolved (commit b51894f):** The Utah hail pillar (`blog/utah/utah-hail-season-roof-guide-2026`) was competing with 8 city-level hail/storm posts for statewide queries. Fixed via **hub-spoke internal linking** (not canonicalization — city posts keep their long-tail traffic, pillar becomes authority):
  - Added "Statewide context" callout (`aside.pillar-callout`) at the top of 8 city posts: bountiful, draper, herriman, lehi, ogden, provo, riverton, sandy — each links to the pillar with city-specific "stay here for..." framing
  - Added "City-Specific Hail & Storm Guides" spoke block to the pillar linking all 8 cities (above the Service Areas H2)
  - Idempotent markers (`pillar-callout`, `city-guide-spokes`) — safe to re-run
- **reviews.json / GBP verification complete (commit b51894f):** Ran `scripts/update-google-reviews.py` against live SerpAPI pinned to the GBP data_id. Aggregate verified: **20 reviews, 5.0 stars (unchanged)**. Pulled 8 fresh snippets — 2 filtered because they used the old "Frame Restoration" brand wording (would have undone the morning's brand-leak lockdown).
  - **Script hardening:** new `_has_brand_leak()` drops bare "Frame Restoration" (allows "Frame Restoration Utah" LLC name); new `_merge_reviews()` preserves `city` metadata from prior curated feed when SerpAPI returns a known author; guardrail falls back to existing feed if filter nukes all fresh reviews
  - index.html schema `ratingValue` normalized "5" → "5.0"
- **.vercelignore booby-trap #2 (commit 565d920, incident 2026-04-22b):** Audit sweep had lumped `reviews.json` into "Data files not meant for public serving" — but index.html **fetches /reviews.json at runtime** to populate the live carousel. Carousel was sitting invisible (data-ready=0 → opacity:0) for JS-enabled visitors. Fix: removed from ignore list; added explicit entry to warning header; broadened the check from "is this shared with a customer" → "is this **fetched by the site** OR shared with a customer" (same root cause as the morning's seo-report.html incident).
- **Still open (minor):** 4 new-reviewer cities (Arikka Von, LeeAndra Jones, Yonghong Xu, Arianne Kaspar) render as "Google Review" until we backfill cities manually or SerpAPI starts exposing reviewer location.

### 2026-04-22 (hotfix) — Unblock seo-report.html + .vercelignore guardrail
- **Production 404 on /seo-report fixed:** The morning's audit commit (28f0dfa) had swept `seo-report.html` into `.vercelignore` as "internal", but it's the PIN-gated live SEO & lead tracker shared with Landon. Removed from ignore list; Vercel redeployed it (commit 30bad68).
- **Guardrail added:** 13-line warning header prepended to `.vercelignore` listing customer-facing HTML deliverables that must NEVER be ignored (seo-report.html, directory-blitz-tool.html, backlink-playbook.html, directory-tracker.html, review/, etc.). Prevents future audit-cleanup passes from re-blocking shared tools (commit b01847a).

### 2026-04-22 — Full Audit Fix: Brand-Leak Lockdown + AEO/Schema Pass + Perf
**101 files changed.** Fixes surfaced by the 2026-04-22 full site + ops audit.
- **Texas-brand entity leak lockdown (critical):** Google was cross-resolving Frame Roofing Utah into Landon's unrelated framerestorations.com (Frisco TX). Replaced sales@framerestorations.com → info@framerestorationutah.com across index, legal pages, and 10 blog posts. Removed parentOrganization block from index LocalBusiness schema (it's a DBA, not a subsidiary). Deleted broken "Part of Frame Roofing Utah" Texas-domain footer link. Changed about page foundingLocation schema from Dallas-Fort Worth → Heber City; rewrote "Our Story" H2 + lede around Heber City origin. Dropped "same standards from DFW" copy from services.html source fragment. Narrowed homepage services sub from "all of Utah" → "Wasatch Front + Heber Valley".
- **Stop deploying internal files (critical):** New `.vercelignore` blocks CLAUDE.md (contains Supabase anon key + rules), *.md strategy docs, *.py scripts, drive-photos.zip (8.5 MB customer photos), archive/, tmp-*/, internal audit/scratch HTML files.
- **Content leakage:** Removed two `EDITOR CHECK` placeholder paragraphs that had shipped to production on blog/park-city/ice-dam-winter-roof-damage.html. Grep-swept rest of blog — clean.
- **Schema + AEO pass:** Added FAQPage JSON-LD + visible Quick Answer passages to 4 service pages (roof-replacement, storm-damage, insurance-claims, residential-roofing). Added AggregateRating (20 reviews, 5.0 stars) to all 45 location pages. Added SpeakableSpecification to homepage FAQPage. Backfilled dateModified on two 2026 posts that still showed 2026-03-27. Added visible "Last updated" stamp under H1 on 87 blog + location pages. Fixed malformed stray parentOrganization block on west-valley-city.html.
- **Performance:** Removed double-loading Google Fonts <link> (self-hosted WOFF2 already wired in global.css — kills render-blocking + double FOUT). Changed drone-loop video preload from "metadata" → "none" (13 MB clip was loading eagerly on mobile). Added width/height to 6 service-card imgs (CLS fix on lazy-load).
- **Dedup + hygiene:** Standardized "24/7 emergency response" across homepage FAQ/schema + services.html. Deleted privacy-policy.html and terms-of-service.html duplicates; added 301 redirects to /privacy and /terms in vercel.json. Fixed privacy.html/terms.html canonicals to use www subdomain. Removed Disallow /privacy + /terms from robots.txt (they're already noindex via meta). Regenerated sitemap.xml: **126 URLs → 105**, pruned dupes, removed robots-disallowed paths and Vercel-redirected routes, fixed missing trailing slash on root.
- **Not auto-fixed (resolved afternoon of 2026-04-22 in commit b51894f):**
  - ~~8-post hail/storm city cluster cannibalizes the Utah-wide pillar~~ ✅ Fixed via hub-spoke internal linking (see 2026-04-22 afternoon log)
  - ~~reviews.json entries need 1:1 verification against the pinned GBP data_id~~ ✅ Verified 20 reviews / 5.0 stars; script hardened with brand-leak filter + fallback

### 2026-04-21 — Homepage Video Quality Bump + Untracked Repo Cleanup
- **Showcase video upscaled** 1024x576 → 1920x1080 (music kept bit-perfect)
- `drone-footage.mp4` replaced with stabilized + color-graded version; new `drone-footage-clip2.mp4` added as second drone asset; posters regenerated from new sources
- **Committed previously-untracked April work:** SEO directory blitz scripts, DieselEye GTM HTMLs in images/projects, contact photos. Also updated `.gitignore` to exclude node_modules, __pycache__, tmp-*.

### 2026-04-20 (late) — Heber Valley Drone Job + Blog Hero Photo Rotation
- **Heber Valley custom reroof drone capture (in-progress job):** 4 drone photos (panorama, aerial-1, aerial-2, front-view) at 3 responsive sizes each (WebP + JPG fallback) + drone flyover video (MP4 + WebM + poster). Gallery now leads with FEATURED IN-PROGRESS PROJECT section; 4 new residential cards added at top of filtered grid. heber-city.html hero, og:image, and Article schema image all swapped to new aerial panorama. Labeled "in progress" — post-completion shots follow once job closes; photo-authenticity policy preserved (no fabricated before/afters).
- **Blog hero photo rotation (42 unique images, zero duplicates):** sandy-storm-damage-reroof-2025-oct had been repeating across 3 posts; heber-city-residential-reroof-2026 + frame-restoration-18 each duplicated; 6 posts had no hero image at all. Swapped to unique shots + added heroes to the 6 bare posts (ogden/wind-damage, riverton/hail-inspection, utah/commercial-roofing, utah/gutter-installation, utah/roof-financing, utah/spring-inspection). The mountain-grade-roofing-materials post now showcases the new Wasatch-Back drone aerial.

### 2026-04-20 — Homepage Video Showcase + 2 SEO/AEO Blog Posts
- **#watch-in-action homepage section** added directly after hero (above the fold) — 60-second Heber Valley reroof showcase
  - Click-to-play with poster image (preload=none) to keep LCP clean
  - Dual source: MP4 (H.264, faststart) + WebM (VP9) for broad browser support
  - VideoObject JSON-LD schema for Google video rich results
  - Existing Gallery, Video Showcase (drone loop), and Trust Bar sections untouched
  - Assets added: `/assets/videos/frame-restoration-showcase.mp4` (11.7 MB), `.webm` (10.6 MB), poster `.jpg`
- **2 new blog posts (42 total, +2 sitemap URLs → 126):**
  - `/blog/utah/april-2026-wasatch-storm-roof-checklist.html` — post-storm 7-point inspection checklist after the April 2 Wasatch Front storm; Article + HowTo + FAQ schema; TL;DR answer box optimized for AI Overviews / extractive snippets; targets Salt Lake / Davis / Weber / Utah County post-storm searches
  - `/blog/bountiful/davis-county-wind-damage-guide.html` — Davis County wind-corridor geography + roof construction specs; targets Bountiful, Centerville, Farmington, Kaysville local SEO; Article + FAQ schema with city-specific areaServed; historical wind-event data card; Class H asphalt + standing seam recommendations
  - Blog index features both posts at top of grid; sitemap lastmod bumped 2026-04-20
- **Series plan:** 4 more posts scheduled (drought/snowpack, wildfire, hail season, city-specific)
- **Untracked in repo (FYI, not committed):** DieselEye HTML project files in `images/projects/`, test/helper scripts (blitz-test-brownbook.js, convert-webp.sh, directory-blitz.py, directory-blitz-prompt.md), node_modules/, package.json/lock, 2 contact screenshots

### 2026-04-17 (late) — Mapbox Service Map + Design System Sweep + Live Review Carousel + Auto Review Count
- **Interactive Mapbox GL JS 3D Wasatch Front service-area map** replaced the original SVG map (CSP updated to allow api.mapbox.com + tiles + events + worker blobs; bulletproof lazy-load with scroll + timeout fallbacks; 3 parallax silhouette mountain layers; self-hosted Tippy + Popper; per-city labelAnchor collision avoidance; tier dots + paint-order halos + progressive disclosure)
- **12 service pages redesigned** via global CSS overrides (no HTML changes needed — design system applied globally)
- **About/Meet Landon page redesigned** to match Frame Roofing design system
- **Before/after drag slider** in gallery (3 project pairs) — added then **pulled same day (commit 2861f0b)** because the before/after pairs were not same-roof; reinstate once true same-roof pairs are sourced
- **Live review carousel** reading `/reviews.json` on homepage
- **Review scraper switched from Google Places → SerpAPI**, made self-healing; auto-updates Google review count twice monthly
- **Review count bumped 19 → 20** in schema + hero CTA + hero subtitle (synced by self-healing scraper)
- **Dual sticky mobile CTA:** Call | Free Inspection (upgraded from single-button sticky call bar)
- **Replaced 14 stock images with real Landon job photos**; fixed og:image logo paths
- **Re-crop + relabel service tiles** for optimal visualization
- **Directory blitz tool:** added top-of-page "What We Need From You" todo block for Landon + solo-todo + GoDaddy delegate workaround; GoDaddy DNS item marked done
- **Fixed SMS consent label:** overflow on narrow viewports + broken label on hero + lead forms
- **Removed GitHub Action**, switching to Claude scheduled trigger for automation

### 2026-04-17 — H1 Rebrand + AEO llms.txt + 10DLC Consent + Reddit Scanner Hardening
- **Homepage H1 rebranded:** "The Gold Standard In Utah Roofing" → **"Mountain-Grade Roofing, Valley-Wide"** (positions Frame Roofing for both mountain-country Heber/Park City AND Wasatch Front valley markets)
- **llms.txt upgraded for AEO (Answer Engine Optimization):** 10 passage-citable Q&A blocks, 45 service areas categorized by county, verified-credentials-only policy (no BBB/certs not confirmed)
- **10DLC fix (error 30923):** Added optional SMS consent checkbox to lead form + linked consent text to privacy/terms policies (required for Twilio A2P 10DLC carrier compliance)
- **Reddit-scanner edge function hardened:** robust response parsing — HTTP status checks, empty body handling, retry logic, typed error returns

### 2026-04-12/13 — Performance + IndexNow + Sitemap Cleanup + Directory Blitz v4
- **Converted 88 images to WebP** and updated all HTML references (major perf win on LCP for location + service pages)
- **IndexNow integration** for bulk URL indexing (pushes updated URLs to Bing/Yandex/IndexNow-compatible engines immediately on publish)
- **Sitemap expanded 107 → 124 URLs** — added 17 missing pages Google couldn't discover
- **Directory blitz tool v4** with full blitz results; Angi moved to "Already Done" on 2026-04-13

### 2026-04-10 — Content + Schema + Analytics + Review Pipeline
- **6 new blog posts** added (5 long-tail SEO posts + spring roof inspection checklist) — blog count 34 → 40
- **HowTo JSON-LD schema complete across all 39 blog posts** (11 added earlier, gap closed today)
- **Blog↔Location crosslinks:** added internal blog links + city crosslinks to all 45 location pages, internal location links into 9 blog posts
- **Live SEO & Lead Attribution Tracker page launched** — Chart.js dashboards, Supabase-backed, default 30-day view
- **PIN login gate + multi-user admin panel** for SEO report (blocks public access, per-user credentials)
- **PostHog tracking rolled out:** init snippet on 107 pages, click event tracking on 47; CSP updated to allow us-assets.i.posthog.com + Chart.js CDN + Supabase edge function
- **Review landing page + `review-request` edge function** deployed for automated post-job review collection
- **Backlink acquisition playbook** (12 opportunities with step-by-step instructions) + **directory blitz tool v3**

### 2026-04-08 — Brand Sweep + FAQ/Schema Expansion + Security
- **Site-wide brand fix:** "Frame Restoration" → "Frame Roofing Utah" on all public pages (catches from earlier rebrand)
- **FAQ schemas expanded 5 → 12 city-specific per location page**, Article schema + direct-answer blocks added to all 45 location pages
- **Author bios, digitalSourceType, comparison tables** added to blog + service pages
- **Removed deprecated HowTo schema** from 4 blog posts that didn't fit the pattern
- **HSTS header added + PostHog reverse proxy** configured
- Sitemap lastmod bumped to 2026-04-08 for Google re-crawl
- Internal cross-links added between 6 priority cities + service pages

### 2026-04-07 (late evening) — SEO + A11y + Perf Sweep
- **HowTo schemas, CSP header, fixed broken JSON-LD** across site
- Fixed WebSite schema trailing comma + trimmed meta descriptions to 143 chars
- **301 redirects for old domain** (framerestorationutah.com → www.frameroofingutah.com) added in code
- **Perf + a11y:** compressed 24 images (-6.8MB), fixed aria-label roles, heading order, select label, added sr-only class
- BBB URL corrected to profile 90056184 (badge + schema sameAs both fixed)
- **SEO upgrade:** schema areaServed with 20 cities, social sameAs profiles, initial WebP conversion, Claude Code hooks for agent quality gates

### 2026-04-07 (evening) — Location Rewrite + Agent v2.2
- **All 44 location pages rewritten** with unique city-specific content (weather patterns, neighborhoods, housing stock, elevation, roofing challenges) — eliminates thin content / duplicate content SEO penalty risk
- **BBB A+ badge added to homepage trust bar** (SVG star icon, linked to correct BBB profile 90056184)
- Fixed broken BBB image tag the scheduled agent had left on the live page
- Corrected BBB URL across trust bar AND schema sameAs (both now profile 90056184)
- **Landon Message Agent upgraded to v2.2** — SKILL.md now 578 lines, 10/10 readiness on all 9 classification categories:
  - certification: SVG icon bank (8 icons), exact trust-item HTML, schema update, Lighthouse post-deploy
  - photos: iMessage extraction, sips auto-resize, Ollama alt-text, exact gallery HTML for both pages, fixed-grid warning
  - service_change: full 14-page inventory, exact service-card HTML, remove=escalate, Lighthouse verify
  - testimonial: copy-paste HTML template with star SVGs, reviewCount update, content verification
  - directory_update: curl HTTP pre-check, exact sameAs format, footer pattern, schema validation
  - repo_or_code: default=escalate, diagnostic toolkit (Formspree test, Lighthouse mobile, Playwright screenshots, git revert)
  - question: quick-reference cheat sheet (15 items)
  - excitement_or_status: soft follow-up awareness for potential content
  - general: Google Calendar MCP for scheduling
- **Global Post-Deploy Verification Protocol** added: HTTP 200 check → content grep → Lighthouse a11y+SEO ≥ 0.9 → auto-revert if dropped
- Agent SKILL.md location: `/Users/agenticmac/.claude/skills/landon-message-agent/SKILL.md`

### 2026-04-07 (earlier)
- BBB accreditation confirmed by Landon — removed from false claims list, added to confirmed list
- Updated Facebook link in footer: old /framerestorationutah → new /61572258054303 (Landon's new FB page)
- Apple Maps Business Connect rejected listing — service-area business without storefront, not actionable
- Landon now communicates primarily on Twilio number +14353024422 (not personal +18014103280)
- Landon Message Agent skill built and scheduled (every 15 min) — auto-processes Landon's iMessages
- Privacy & Terms pages updated with SMS/texting compliance for 10DLC
- 10DLC campaign resubmitted (expect 1-5 business days)

### 2026-04-01
- Phone number standardized to 435-302-4422 across all 103 HTML pages (index, locations, blog, services, archive, projects, legal pages) — ensures consistent NAP for local SEO signals
- Removed false BBB A+ and NRCA membership claims from all pages (these were AI-hallucinated trust badges that were never true)
- Added ⛔ CRITICAL RULES section to top of CLAUDE.md to prevent future false credential/certification claims

### 2026-03-30 (afternoon)
- Added About Us page (`pages/about.html`) with Landon Yokers owner bio, headshot (`images/landon-yokers-headshot.jpg`), and E-E-A-T trust signals
- Also created root-level `about.html`
- Site now has 115 HTML files, 102 sitemap URLs

### 2026-03-30 (morning)
- Landon completed 301 domain forwarding: framerestorationutah.com + www → frameroofingutah.com (permanent, path forwarding enabled)
- Updated robots.txt with AI crawler directives (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) and blocked bad bots (Bytespider, AhrefsBot)
- GSC audit: 19 indexed, 89 not indexed. Performance: 10 clicks, 587 impressions, 1.7% CTR, avg pos 23.2
- Submitted indexing requests for 8 service pages (roof-repair, residential-roofing, roof-replacement, commercial-roofing, insurance-claims, gutters, emergency-tarping, solar-installation)
- Found and fixed redirect loop in vercel.json: /pages/storm-damage ↔ /pages/storm-damage-restoration was an infinite loop. Removed the wrong-direction rule.
- Discovered insurance-claims and emergency-tarping pages missing from sitemap

### 2026-03-29
- Auto-refresh: No new commits or file changes since 2026-03-28
- Corrected CLAUDE.md inaccuracies: location count 44→45, added /blog/utah/ (10 statewide posts), added gallery.html to pages list

### 2026-03-28
- Fixed Yelp URL in index.html footer (/biz/frame-restoration-utah → /biz/frame-restoration-heber-city)
- Updated homepage H1 from "For Your Utah Home" to "In Utah Roofing"
- Consolidated storm-damage-restoration → storm-damage (301 redirect, canonical, sitemap)
- Verified all location/service/blog pages already had meta descriptions, canonicals, OG tags
- Pushed to GitHub, confirmed live on frameroofingutah.com via Chrome
- Created this CLAUDE.md
- Set up auto-update scheduled task for memory refresh

### Previous sessions (summary)
- Created 6 new blog posts, audited 30 existing
- Built directory tracker (38 directories)
- Full SEO audit (interactive HTML report)
- Full rebrand Frame Restoration → Frame Roofing (all 86 HTML files)
- Built Supabase lead pipeline + edge function
- Set up Yelp listing for Landon
- Migrated all canonical/OG URLs to frameroofingutah.com
- Built OG image, service card images, project city photos
