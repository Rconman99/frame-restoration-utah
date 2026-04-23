# Frame Roofing Utah — Claude Master Context
> Last updated: 2026-04-22 | Auto-refreshed via Cowork scheduled task

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

### Phone number: ONE number everywhere
- **435-302-4422** is the ONLY phone number on the website (Landon's direct)
- Do NOT use 435-292-8802 (Twilio tracking number — texts are blocked by carriers)
- If creating any new page, template, or content: use 435-302-4422

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
- `/seo-report/` — Live SEO & Lead Attribution Tracker (PIN-gated, multi-user admin panel, 30-day default view, Chart.js rendering)
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
- **2026-04-22 perf:** Removed double-loading Google Fonts <link> (self-hosted WOFF2 already wired in global.css — kills render-blocking + double FOUT); changed drone-loop video preload from "metadata" → "none" (13 MB clip was loading eagerly on mobile); added width/height to 6 service-card imgs (CLS fix)
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
1. Set up Twilio — Utah phone number, wire into edge function for lead SMS (10DLC consent checkbox now in place 2026-04-17, error 30923 resolved)
2. Build speed-to-lead AI bot — Twilio + Claude API + Supabase
3. Google Sheet lead tracker — Apps Script webhook
4. Direct email (replace Formspree with Resend/SendGrid)
5. ~~301 redirects framerestorationutah.com → frameroofingutah.com~~ ✅ DONE (Landon domain forwarding 2026-03-30; in-code 301s also added 2026-04-07)
6. ~~Google Search Console verification + sitemap for frameroofingutah.com~~ ✅ DONE
7. Update Google Business Profile with new URL
8. Reddit-scanner: response parsing hardened 2026-04-17 (HTTP status, empty body, retry, typed errors) — monitor reliability

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

## GIT WORKFLOW

- All work in `/Users/agenticmac/projects/frame-restoration-utah/` (NOT tradeworker-site/frame-restoration-utah — that is a stale obsolete copy)
- Push to `main` auto-deploys to BOTH Vercel accounts
- Commit format: descriptive message + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Watch for `.git/index.lock` — delete before committing if stale
- Desktop Commander read_file returns empty for HTML — use `start_search` with contextLines or `start_process` with `cat`

---

## SESSION LOG

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
