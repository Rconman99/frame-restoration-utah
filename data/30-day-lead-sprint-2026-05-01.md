# Frame Roofing Utah — 30-Day Organic Lead Sprint
> Generated 2026-05-01 · Sprint window: May 1 – May 31 · Goal: prove ROI and lock in commission

## TL;DR

5 weeks since GSC baseline (10 clicks / 587 impr / pos 23.2). The site infrastructure is now A-grade (AEO 91, schema clean, 105 sitemap URLs, dashboard live). **The bottleneck is no longer crawlability — it's reviews velocity + conversion friction + speed-to-lead.**

The five plays below were intersected from two parallel research agents (in-codebase audit + 2026 roofing-vertical SEO/AEO research). Anything ranked HIGH below has at least 2 independent sources backing the lift estimate.

| # | Play | Effort | Days to ship | Ryan-only? | Lead-velocity impact |
|---|------|--------|--------------|------------|---------------------|
| 1 | Reviews velocity sprint (NiceJob + thank-you redirect) | S | 1 | Mostly | **HIGH** — closes 20→40+ vs roofingutah.com 54 |
| 2 | Speed-to-lead: <5min auto-SMS + auto-call after form fill | M | 3-5 | Yes (Twilio + Verizon already wired) | **HIGH** — 9× conversion lift on existing traffic |
| 3 | Form CRO: cut to 3 fields + sticky inspection CTA | S | 1-2 | Yes | **MED-HIGH** — documented 20-35% lift |
| 4 | Pre-built storm landing page + HailTrace-fed Google Ads trigger | M | 5 | Mostly | **HIGH (storm-conditional)** — 50-200% lift in 7-day window |
| 5 | Top-12 pages reformatted to AI-Overview answer chunks (H2 question + 40-80 word answer) | M | 7 | Yes | **MED** — defensible ChatGPT/Perplexity citation moat |

**Plays NOT recommended this sprint (deferred):**
- Spinning up more programmatic location pages (Google's March 2026 core update penalizes scaled-content sites; Frame already has 45 — differentiate the existing ones first)
- Schema padding for AI Overviews (no causal correlation; content authority + listicle presence matters more)
- Review-gating funnels ("happy → Google / unhappy → private form") — Google's April 2026 review-policy update is actively pulling those down

---

## Play 1 — Reviews Velocity Sprint

**Current:** 20 reviews / 5.0 stars · roofingutah.com 54 reviews · utahroofingcompany.com 50 · gap is the single biggest map-pack ranking factor.

**The fix isn't gating — it's friction reduction + cadence.** 4 fresh reviews per month outweighs 50 stale reviews in the local-pack algorithm. Velocity is what matters.

### Ship this week
1. **Thank-you redirect → /review.html** (5-min ship — see Move #1 below). Currently the thank-you page just says "we'll get back to you." That's a wasted moment — the user just trusted us with their info, that's peak goodwill. Push them to `/review.html` after a 60-second delay OR add a "While you wait — past customer? Leave us a review" card.
2. **Homepage footer review link** — `/review.html` linked alongside the BBB/Yelp footer icons (right now footer surfaces social profiles but not the review prompt).
3. **Add /review.html links to all 45 location-page footers** — replace generic "Also serving" line with "Frame Roofing customer? **[Leave a review →]**".
4. **Sticky mobile CTA addition** — on location pages where Frame has completed jobs (Heber, Park City, Sandy, Bountiful, Draper), add a third "Past Customer? Review Us" button to the sticky mobile bar.

### Ship next week
5. **NiceJob trial** ($75/mo, no add-ons). Connects to whatever pipeline tool Landon uses (or Supabase + a webhook). Auto-fires a review request 24hrs after job-completion timestamp. Target: **6-10 new Google reviews in 30 days**.
   - Alternative if Landon won't add a tool: Twilio scheduled-task that sends "How was the job? Reply YES for a 30-sec review link" via the Verizon SMS gateway (already wired).
6. **QR card for Landon's truck/clipboard** — generated via `qrencode` pointing at `https://frameroofingutah.com/review`. Print 50 cards. Hand to every customer at job-close.

### Compliance note
**Do NOT** rebuild any "happy path → Google / unhappy → private form" funnel. Google's April 2026 review-policy update is auto-detecting and removing reviews from gated funnels. Frame's `/review.html` already does it right (4 channels, no filter).

**Source:** [DG Agency — Google Review Policy 2026](https://dgagency.co/blog/google-review-policy-2026-changes-roofers), [NiceJob vs Podium](https://get.nicejob.com/compare/podium)

---

## Play 2 — Speed-to-Lead Automation

**The single biggest ROI lever.** Leads contacted in <5 min are **9× more likely to convert**. **78% of homeowners hire the first responder.**

Frame TX already has the Twilio stack patterned (per memory). Clone the pattern to Frame Utah:

### Architecture
```
Form submit → Supabase handle-lead edge fn (already live) →
  ├─ Email Landon (already live)
  ├─ SMS Landon at 435-302-4422 via Verizon gateway (already live)
  └─ NEW: 5-min countdown trigger
      ├─ At T+0:60s: auto-SMS to homeowner: "Hi {name}, this is Landon at Frame Roofing — saw your inspection request. Calling you in 5 min from 435-302-4422."
      └─ At T+5:00m: if Landon hasn't called outbound, ring the on-call rep again
```

### Ship this week
1. Extend `handle-lead` edge function to enqueue a `lead_followup` row in Supabase with `due_at = now() + 60s` and `escalate_at = now() + 5min`.
2. Add a Supabase scheduled trigger (cron: `* * * * *`) that processes the queue.
3. SMS template variable injection: `{name}`, `{city}` (parsed from form), `{service}`.

### Why this matters for proving ROI
At current ~10 clicks/day → ~1 form/day, going from 20% → 40% close rate = **6 extra closed jobs/month**. At avg roof job $12K, that's **$72K incremental revenue**, **$7.2K Ryan commission**.

**Source:** [Roofr Speed to Lead](https://roofr.com/more-info/speed-to-lead-roofing-software), [Lead Response Time Automation](https://www.leadgen-economy.com/blog/response-time-automation-lead-conversion/)

---

## Play 3 — Form CRO

**Documented A/B lifts, 2026 roofing-vertical:**
- Form length 7→3 fields: **+20-35%** completion
- Sticky scroll-following CTA: **+25%** form fills
- Real project photos vs stock: **+37%** trust → click

### Ship this week
1. **Cut hero contact form to 3 fields:** Name, Phone, ZIP. Service-type and message become optional (collapsed by default).
2. **Sticky inspection-request button** — already exists as "Free Inspection" but currently only on mobile. Add to desktop scroll behavior (>800px scroll, fixed bottom-right corner, brand-gold CTA).
3. **Photo audit** — replace any remaining stock images on top-3 GSC entry pages with Frame's actual project photos (drone aerials from Heber Valley reroof are the strongest assets; 2026-04-20 batch).

### Files to touch
- `index.html` (lines 1962-2118 area for hero form)
- `pages/storm-damage.html`, `pages/roof-replacement.html`, `pages/residential-roofing.html` (top service entries)
- `global.css` (sticky CTA media-query)

**Source:** [Podium — CRO for Roofing](https://www.podium.com/article/conversion-rate-optimization-roofing), [Robben Media — Roofing Conversion](https://robbenmedia.com/top-10-tips-for-roofing-contractor-website-conversion-optimization/)

---

## Play 4 — Pre-Built Storm Landing Page + Trigger Stack

**Why now:** May-June is hail season on the Wasatch Front. Each storm = highest-CPL window of the year. Pre-build beats reactive by ~3 days, which is the entire competitive window for storm-chasers.

### Ship this week
1. **New page:** `/wasatch-hail-damage-inspection.html` (or extend existing `/pages/storm-damage.html` with a "post-storm" mode). Headline angle: **"Licensed Local Roofer, Not a Storm Chaser"** + 24hr-response promise + insurance-claim help + **3-field sticky form**.
2. **HailTrace subscription** for Wasatch Front polygons. Lower-tier plan ~$99/mo, pause/unpause monthly.
3. **Storm-trigger Cowork agent or Claude routine** that polls NWS + HailTrace polygons. When hail of 1"+ hits a Frame service-area ZIP:
   - Pushes a fresh ad copy block referencing the storm date/city to Google Ads (paused → live)
   - Posts a Google Business Post the same day
   - Sends Landon a SMS: "Hail confirmed in {city}. Storm landing page is live. $800/mo storm-trigger reserve activated for 7 days."

### Why Frame wins on storm content vs competitors
roofingutah.com hasn't blogged since May 2024. utahroofingcompany.com is sleepy on content velocity. Frame's "10-year warranty + BBB A+ + 24/7 storm response" copy crushes out-of-state storm-chasers on **trust**, not just **speed**.

**Source:** [Hook Agency — Hail Trackers for Roofing](https://hookagency.com/blog/hail-trackers-for-roofing/), [DG Agency — Storm Restoration Playbook 2026](https://dgagency.co/blog/texas-roofers-storm-restoration-playbook-2026), [Webology — Chasing Storms with Google Ads](https://webology.io/chasing-storms-effectively-with-google-ads/)

---

## Play 5 — AI-Overview Citation Moat

**The opportunity:** Frame already scores 91/A- on AEO audit. The foundation is there. The gap is **answer-shaped chunks + multi-platform presence**.

Schema padding does NOT predict AI citations. **Content authority + listicle presence does.** Roofers cited across Google + Yelp + Facebook are **2.8× more likely** to surface in ChatGPT/Perplexity/AI Overview answers.

### Ship over weeks 2-3
1. **Reformat top-12 pages to H2 question + 40-80 word direct answers.** Current Frame service pages have FAQs but the bodies still flow as marketing prose. AI engines extract **direct-answer chunks**. Pattern:
   ```
   ## How long does a roof replacement take in Utah?
   A typical asphalt-shingle roof replacement on a Utah single-family home takes 1-2 days.
   Heavier metal or tile installs run 3-5 days. Crews start at 7 AM, work past sunset in summer,
   and Frame Roofing finishes most Wasatch Front replacements in a single day to avoid
   overnight tarp risk during storm season.
   ```
2. **Pull literal queries from GSC's "queries" tab + AlsoAsked.com and seed 5-10 of them as new H2s on roof-replacement.html, storm-damage.html, insurance-claims.html, residential-roofing.html.**
3. **Third-party listicle outreach:** Apply/submit to Expertise.com "Best Roofers in Salt Lake City", Three Best Rated, Forbes Home, Yelp top-10 lists. AI engines cite these as authoritative. (~2 hr/listing, free.)

### Already running (don't duplicate)
- `frame-roofing-aeo-citation-monitor` scheduled trigger fires on the 5th of each month — keeps tracking which AI engines cite Frame.

**Source:** [Roofing Webmasters — AI SEO for Roofers](https://www.roofingwebmasters.com/ai-seo-for-roofers/), [Soar Agency — Schema Markup for AI Citations](https://www.soar.sh/blog/schema-markup-ai-citations-2026)

---

## Sprint Cadence

| Week | Ship | KPI Check |
|------|------|-----------|
| **Week 1 (May 1-7)** | Plays 1.1-1.4, Play 3 form CRO, Play 4 storm landing page | Baseline GSC + dashboard snapshot |
| **Week 2 (May 8-14)** | Play 2 speed-to-lead, NiceJob trial start, Play 5 (top 4 pages reformatted) | First review-velocity check |
| **Week 3 (May 15-21)** | Play 5 (next 8 pages), listicle outreach, HailTrace subscription | Mid-sprint review with Landon |
| **Week 4 (May 22-31)** | Iterate based on dashboard data, A/B test results | Final sprint report → comp memo |

---

## What success looks like (May 31 targets)

| Metric | Apr 30 baseline | May 31 target | Source |
|--------|-----------------|---------------|--------|
| Google reviews | 20 | 30+ | GBP |
| GSC clicks (30d) | ~10 (5wk-old baseline) | 50+ | GSC |
| Form submissions (30d) | TBD pull | 2× baseline | Supabase `leads` table |
| Phone calls (30d) | TBD pull | 2× baseline | Supabase `calls` table or PostHog |
| Storm-page activation events | 0 | 1+ (if hail event) | NWS log + ads dashboard |
| AI Overview citations | TBD baseline | tracked monthly | aeo-citation-monitor trigger |

The dashboard at `/dashboard` already renders all of these — that's the proof artifact.
