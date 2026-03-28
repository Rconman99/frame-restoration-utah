# Frame Roofing Utah — Session Continuation Prompt

Copy everything below into a new Cowork session to pick up where we left off. Select the frame-restoration-utah folder when starting the session.

---

## CONTEXT

You are continuing work on **frameroofingutah.com**, a roofing contractor website for Frame Roofing Utah (previously Frame Restoration Utah), owned by **Landon Yokers** and managed by **Ryan Conwell** (ryanconwell99@gmail.com). The site is a static HTML site deployed on Vercel with a Supabase backend for lead handling.

## WHAT'S BEEN DONE

### Domain & Hosting
- **Live site:** https://frameroofingutah.com (Vercel, domain purchased through Landon's Vercel account: landon-4824s-projects)
- **Old domain:** framerestorationutah.com (still on Ryan's Vercel project: ryans-projects-51d84217, project ID prj_zcwGmh7wUxHvqtRoHRmoRp441ePY)
- **GitHub repo:** Rconman99/frame-restoration-utah (main branch = production, 53 commits, 194 files)
- **Design sandbox branch:** `design-refresh` — has CTA arrows and more whitespace. Preview at: frame-restoration-utah-5k93pv2b2-ryans-projects-51d84217.vercel.app
- All 86 HTML files migrated from framerestorationutah.com to frameroofingutah.com (canonical, OG, schema, sitemap, robots.txt)
- Full rebrand from "Frame Restoration Utah" to "Frame Roofing Utah" across all pages

### Lead Pipeline (Supabase)
- **Supabase project:** frame-roofing-utah (ID: hdcflshhomzildwqlmwh, region: us-west-1)
- **Edge function:** `handle-lead` v2 deployed — receives form submissions as JSON, saves to DB, forwards to Formspree for email, attempts SMS via Verizon gateway (didn't work — need Twilio)
- **Database table:** `leads` with columns: id, created_at, name, email, phone, address, service, message, source_page, status, job_value, commission (auto-calculated 10% of job_value), notes
- **Test lead confirmed in DB:** id=1, name=Test, phone=2065517537, service=reroof, submitted 2026-03-19
- **Forms updated:** Hero form, contact form, and modal form all submit to Supabase edge function via fetch() with JSON
- **Email:** Working — forwards to Formspree (meeroaqa) which emails Ryan. Still needs to be changed to send directly to landon@framerestorations.com with CC to ryanconwell99@gmail.com
- **SMS:** NOT WORKING — Verizon email-to-SMS gateway (8014103280@vtext.com) was blocked. Need Twilio setup.
- **Google Sheet:** NOT YET SET UP — edge function has GOOGLE_SHEET_WEBHOOK env var ready, needs Google Apps Script webhook
- **Formspree login:** Account under ryanconwell99@gmail.com, form ID meeroaqa

### Speed-to-Lead Bot (PLANNED — NOT BUILT YET)
- Client wants a Hermes-style AI texting bot that responds to leads within 30 seconds
- Architecture: Twilio (SMS) + Claude API (AI conversation) + Supabase (conversation storage + edge functions)
- Estimated cost to run: $5-25/month
- Needs: Twilio account with Utah phone number (801 area code), Claude API key
- Ryan plans to charge $1,500-2,500 setup + $150-300/month management
- Landon's phone: (801) 410-3280, carrier: Verizon

### Homepage Design
- Service cards have stock photos: residential (craftsman home), storm damage (lightning), commercial (aerial flat roof from user's Downloads folder), gutters (downspout), restoration (tornado), solar (panels on house roof)
- Nav logo: Full horizontal logo (diamond + FRAME RESTORATION / ROOFING & CONSTRUCTION) at 85px height, 100px nav bar — logo file: /images/logo-rc-darkblue.png (updated across all 84 pages)
- OG image: Branded aerial drone shot with navy overlay, gold headline "FRAME ROOFING UTAH", phone number CTA — file: /images/og-image.jpg
- Gallery images: object-position: center top, 5 photos (frame-restoration-08, 21, 04, 16 + heber-valley-roof-front)
- Stats section on live site: 10+ Years Experience, 44 Cities Served, 5.0 Google Rating, 24/7 Emergency Response (animated counter on scroll)
- Drone break section: Full-width Heber Valley aerial with overlay text "See the Difference From Above"
- Section padding: 110px (increased from 90px for whitespace)
- CTA buttons have arrow icons (→) with hover animation

### Brand Assets
- Logo files in `/images/` (logo.png, logo-rc-darkblue.png, wordmark variants, monogram variants)
- Full brand source files in `/images/brand-source/` (AI, SVG, PNG, EPS from 4 zip archives: Primary Logo, Wordmark, Monogram, Diamond)
- Brand colors: Navy #0B4060, Gold #E1B969, Off-white #FAF9F5
- Fonts: Archivo Black (headings), Archivo (body) — currently loading from Google Fonts, need to self-host
- NOTE: Logo still says "Frame Restoration" in the PNG — needs updated logo from designer with "Frame Roofing" text

### Site Structure
- 107+ HTML pages total
- `/pages/` — 12 service pages (residential-roofing, commercial-roofing, roof-repair, roof-replacement, storm-damage, storm-damage-restoration, emergency-tarping, gutters, solar-installation, insurance-claims, general-contracting, water-fire-flood-restoration)
- `/locations/` — 44 location pages (thin templated content, need unique rewrites)
- `/blog/` — 24 blog posts across 14 city subdirectories + index
- `/projects/` — 1 project case study (Heber Valley)
- `/images/services/` — 6 service card photos (residential, storm-damage, commercial, gutters, restoration, solar)
- `/archive/` — Old docs, sub-location service pages, eval files, previous portfolios
- `global.css` — Shared styles across all pages
- `global-modal.js` — Booking form modal (updated to use Supabase endpoint)
- `vercel.json` — cleanUrls, security headers, caching rules (fixed regex pattern issue)

### Strategy Documents (in project folder)
- `FRAMEROOFINGUTAH-BUILD-PLAN.md` — Full architecture for weather automation system
- `Frame-Restoration-Blog-Content-Strategy.xlsx` — 23 topics x 44 cities keyword map, 5 tabs (Master Content Map, City Coverage Matrix, AI-Safe Content Rules, Weather Triggers, System Architecture)
- `SEO-BRUTAL-AUDIT-March-2026.md` — Honest SEO audit scoring 38/100
- `CONTINUE-FROM-HERE.md` — This file

### SEO Audit Key Findings (38/100)
- framerestorations.com (Texas Squarespace site) causes brand confusion with Google
- 44 location pages are thin/templated — need unique rewrites with per-city JSON data
- No backlinks, no directory listings, no author bios, no publication dates on blogs
- Blog content quality is above average for industry
- New domain frameroofingutah.com is a fresh start with better keyword domain

## WHAT NEEDS TO BE DONE NEXT (Priority Order)

### Immediate
1. **Set up Twilio** — Create account, get Utah phone number (801 area code), wire into edge function for lead SMS notifications to Landon
2. **Build speed-to-lead AI bot** — Twilio + Claude API + Supabase edge functions for instant lead response, qualification conversation, and follow-up
3. **Set up Google Sheet lead tracker** — Google Apps Script webhook → Sheet for Ryan's commission tracking
4. **Set up direct email** — Replace Formspree with Resend/SendGrid in edge function so leads email landon@framerestorations.com with CC to ryanconwell99@gmail.com
5. **301 redirects** on framerestorationutah.com → frameroofingutah.com
6. **Google Search Console** — Verify frameroofingutah.com, submit sitemap, Change of Address tool
7. **Update Google Business Profile** with new URL

### Short-term
8. **Self-host fonts** — Download Archivo Black + Archivo to /assets/fonts/
9. **Convert images to WebP** — All project photos + service card images
10. **Add author bios + publication dates** to all 24 blog posts
11. **Directory submissions** — BBB, Angi, HomeAdvisor, Yelp, Thumbtack, local chambers
12. **Get updated logo** from designer that says "Frame Roofing" instead of "Frame Restoration"

### Medium-term
13. **Build weather-triggered blog automation** — NWS API monitor, blog draft generator, notification system, review dashboard (full architecture in FRAMEROOFINGUTAH-BUILD-PLAN.md)
14. **Rewrite 44 location pages** with unique content per city using JSON data files
15. **Build more project case studies** beyond Heber Valley

### Key Technical Details
- Git push workflow: Clone to /tmp/frame-restore-temp, rsync from workspace (excluding archive, brand-source, docs), commit, push with GIT_ASKPASS=/tmp/gh_2.67.0_linux_arm64/bin/gh
- GitHub CLI needs to be re-downloaded each session: `curl -sL https://github.com/cli/cli/releases/download/v2.67.0/gh_2.67.0_linux_arm64.tar.gz | tar xz -C /tmp/`
- Git config: user.email=ryanconwell99@gmail.com, user.name="Ryan Conwell"
- Supabase project ID: hdcflshhomzildwqlmwh
- Supabase anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkY2Zsc2hob216aWxkd3FsbXdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODQzNzcsImV4cCI6MjA4OTQ2MDM3N30.GO5CU5dRBfeoC5ZEl2U143cTXbKdV5ZUhq4ucwBICoI
- Edge function URL: https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-lead
- Formspree endpoint (backup): meeroaqa (account: ryanconwell99@gmail.com)
- Texas site (causes SEO confusion): framerestorations.com (Squarespace, Frisco TX)
- User's Downloads folder mounted at: /sessions/intelligent-dazzling-ride/mnt/Downloads

### People
- **Ryan Conwell** (ryanconwell99@gmail.com) — manages site, gets 10% commission on leads, intermediate vibe coder using Claude Code + Cowork + Google models
- **Landon Yokers** (landon@framerestorations.com) — owner, wants leads via email + SMS to (801) 410-3280 (Verizon), Vercel account: landon-4824
- **Business address:** 142 S Main St, Heber City, UT 84032
- **Business phone:** 435-302-4422
- **Company:** Acme Inc. (Landon's company name in Vercel billing)
