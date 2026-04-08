# Frame Roofing Utah — Claude Master Context
> Last updated: 2026-04-07 | Auto-refreshed via Cowork scheduled task

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
- **Email:** info@framerestorationutah.com
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

## SITE STRUCTURE (115 HTML pages, 102 sitemap URLs)

- `/` — Homepage (index.html), H1: "The Gold Standard In Utah Roofing"
- `/about.html` — Root-level About page (redirects or mirrors pages/about)
- `/pages/` — 14 pages (residential-roofing, commercial-roofing, roof-repair, roof-replacement, storm-damage, storm-damage-restoration [redirects to storm-damage], emergency-tarping, gutters, solar-installation, insurance-claims, general-contracting, water-fire-flood-restoration, gallery, **about** [NEW — owner bio, headshot, E-E-A-T signals])
- `/locations/` — 45 location pages (all Utah cities along the Wasatch Front)
- `/blog/` — Blog index + 34 posts total:
  - `/blog/utah/` — 10 statewide SEO posts (roof-replacement-cost, emergency-roof-repair, how-long-does-roof-last, how-to-choose-a-roofer, best-roofing-materials, signs-you-need-new-roof, utah-hail-season, utah-roof-insurance-claims, utah-roof-maintenance-checklist, utah-roof-ventilation-guide)
  - City subdirectories: heber-city/5, salt-lake-city/4, park-city/3, sandy/2, plus 1 each in bountiful, draper, herriman, layton, lehi, murray, orem, provo, west-jordan, west-valley-city (~24 city posts)
- `/projects/` — 1 case study (heber-valley-roof)
- `/archive/` — Old docs, sub-location service pages, eval files
- `/images/` — Photos, OG image, brand source files (/brand-source/, /projects/cities/, /services/), landon-yokers-headshot.jpg (About page)
- `/assets/` — Hero video/poster, gutters video

### Key Files
- `vercel.json` — Redirects (storm-damage-restoration → storm-damage, /:city/storm-damage-restoration → /:city/storm-damage, /home → /)
- `sitemap.xml` — 150+ URLs
- `robots.txt` — Allows AI crawlers (GPTBot, Claude, Perplexity), blocks Bytespider
- `llms.txt` — AI/LLM optimization file
- `directory-tracker.html` — Interactive React-based directory tracker (38 directories)
- `global-modal.js` — Booking form modal → Supabase edge function
- `global.css` — Shared styles

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
- Meta descriptions on ALL 44 location pages, 12 service pages, blog pages
- Canonical tags (self-referencing) on ALL pages
- Open Graph + Twitter card tags on ALL pages
- Schema markup: RoofingContractor, FAQPage, HowTo, BlogPosting, BreadcrumbList, AggregateRating
- Homepage H1 optimized: "The Gold Standard In Utah Roofing"
- Storm-damage / storm-damage-restoration consolidated (301 redirect + canonical)
- Duplicate blog URLs cleaned from sitemap
- Yelp footer link corrected to /biz/frame-restoration-heber-city
- Directory tracker: Yelp marked as Done
- robots.txt with AI crawler allowances
- llms.txt for LLM optimization
- Full rebrand from "Frame Restoration Utah" to "Frame Roofing Utah"

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

## PRIORITY TODO (as of 2026-03-28)

### Immediate
1. Set up Twilio — Utah phone number, wire into edge function for lead SMS
2. Build speed-to-lead AI bot — Twilio + Claude API + Supabase
3. Google Sheet lead tracker — Apps Script webhook
4. Direct email (replace Formspree with Resend/SendGrid)
5. ~~301 redirects framerestorationutah.com → frameroofingutah.com~~ ✅ DONE (Landon set up domain forwarding 2026-03-30)
6. ~~Google Search Console verification + sitemap for frameroofingutah.com~~ ✅ DONE (verified, sitemap submitted, indexing requests started 2026-03-30)
7. Update Google Business Profile with new URL

### Short-term
8. Self-host fonts (Archivo Black + Archivo)
9. Convert images to WebP
10. Add author bios + publication dates to blog posts
11. Directory submissions (Angi, HomeAdvisor, Thumbtack, local chambers)
12. Get updated logo from designer ("Frame Roofing" not "Frame Restoration")

### Medium-term
13. Weather-triggered blog automation (NWS API, architecture in FRAMEROOFINGUTAH-BUILD-PLAN.md)
14. Rewrite 44 location pages with unique per-city content
15. Build more project case studies

---

## GIT WORKFLOW

- All work in `/Users/agenticmac/projects/tradeworker-site/frame-restoration-utah/`
- Push to `main` auto-deploys to BOTH Vercel accounts
- Commit format: descriptive message + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Watch for `.git/index.lock` — delete before committing if stale
- Desktop Commander read_file returns empty for HTML — use `start_search` with contextLines or `start_process` with `cat`

---

## SESSION LOG

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
