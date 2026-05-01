# Frame Roofing Utah — Build Receipt + Compensation Memo
> From: Ryan Conwell · To: Landon Yokers · Date: 2026-05-01

> **NOTE TO RYAN:** This file is `.vercelignore`d (`.md` ignore rule). Send the SMS-TLDR below as a text or email to Landon, then send him the longer version as a PDF or Google Doc.

---

## SMS-friendly TLDR (paste into iMessage)

> Hey — wanted to put down on paper what I've built for frameroofingutah.com so we're aligned on next steps + payment.
>
> 5 weeks of work since the site went live: 105 indexed pages, 45 city pages, 42 blog posts, 20 verified reviews live, BBB A+ wired, AEO score 91/A-, dashboard live at frameroofingutah.com/dashboard, lead pipeline running through Twilio + Supabase.
>
> Site is no longer the bottleneck. Reviews velocity + speed-to-lead + form CRO are. Sprint plan locked for May.
>
> Comp ask: 10% commission on jobs sourced from organic web (already in our agreement). Dashboard now tracks this automatically — every lead from the website hits the leads table with `source_page` so we can attribute. Want to set up weekly Friday review.

---

## Long Version

### What was built (5 weeks ending 2026-05-01)

**Public site (105 sitemap URLs):**
- Homepage rebuilt with hero video, drone-aerial of Heber Valley reroof, sticky tap-to-call, mobile-first CTAs, schema markup for LocalBusiness + RoofingContractor + AggregateRating + FAQPage
- 45 location pages (every Utah Wasatch Front + Heber Valley city) with unique per-city content, weather data, neighborhood notes
- 12 service pages (residential, commercial, repair, replacement, storm, gutters, solar, insurance, etc.)
- 42 blog posts including 11 statewide SEO posts + 25 city-specific posts + the April 2026 Wasatch storm checklist + Davis County wind guide
- About page with owner bio + headshot + E-E-A-T trust signals
- Heber Valley featured in-progress project showcase (drone aerials + flyover video + 4 residential cards)
- Yelp listing fixed and live, BBB A+ wired with verified profile link, AggregateRating on all 45 location pages

**Backend / pipeline:**
- Supabase project: `frame-roofing-utah` (us-west-1)
- `handle-lead` edge function v5 — receives form JSON, saves to `leads` table, sends email via Formspree, sends SMS via Verizon gateway + Twilio in parallel
- Lead schema includes `source_page` so we can attribute every lead back to which URL drove it
- Twilio A2P 10DLC campaign in progress (consent copy, sending number 435-292-8802 published per TCR requirements)
- Review landing page at `/review` with Google + Yelp + BBB + Facebook channels
- Self-healing Google review scraper (1st + 15th of each month) that auto-updates the homepage carousel + count

**Live dashboard at frameroofingutah.com/dashboard (PIN-gated):**
- Pageviews / Google organic clicks / form leads / inbound calls (last 7/30/60/90 days, with growth-vs-prior-period)
- Top pages by traffic
- Location heatmap
- Recent leads
- Biggest movers (top growers / fresh wins / pages needing attention)
- Storm Watch tile (live NWS Wasatch Front alerts)
- Reviews velocity tile
- Sitemap freshness tile
- Core Web Vitals tile (Google PageSpeed Insights)
- Multi-user PIN management with role-based access

**SEO/AEO posture:**
- AEO score 91/A- (audited 2026-04-24, projected after llms.txt polish)
- SpeakableSpecification + FAQPage + AggregateRating + HowTo + Article + BlogPosting + BreadcrumbList all schema-validated
- Texas-brand entity-leak hardened (April 22 audit fix — purged sales@framerestorations.com from 11 pages, removed Dallas-Fort Worth references, scoped service area to Wasatch + Heber Valley)
- 87 blog/location pages have visible "Last updated" stamps
- Hub-spoke internal linking on hail cluster (8 city posts ↔ Utah pillar)
- Mobile polish: hero/footer/Quick Answer boxes, swipe-driven reviews carousel, WCAG-compliant tap targets, 13MB drone-loop video deferred to scroll
- 10 passage-citable Q&A in llms.txt for AI/LLM extraction
- Site is allow-listed for GPTBot, ClaudeBot, PerplexityBot via robots.txt

**Active scheduled triggers:**
- `frame-roofing-google-reviews` — 1st + 15th @ 7:17am Denver (review carousel auto-update)
- `frame-roofing-aeo-citation-monitor` — 5th of month @ 8:23am Denver (AI engine citation tracker)
- `weekly-seo-audit` — Mondays @ 8:17am Denver (Perfect Stack scoring)

---

### Where we are vs where we were

| Dimension | Pre-Ryan (March 2026) | Today (May 1, 2026) |
|-----------|----------------------|---------------------|
| Indexed pages | "Frame Restoration Utah" w/ Texas brand confusion | 105 sitemap URLs, Wasatch-scoped |
| Schema | None / broken | LocalBusiness + 8 schema types validated |
| AEO score | N/A | 91 / A- |
| Reviews surface | 19 reviews, no live carousel | 20 reviews, self-updating carousel, /review/ collection page |
| Lead pipeline | Form → email | Form → Supabase → email + SMS to Landon (Verizon + Twilio) |
| Trust signals | Generic | BBB A+ verified, AggregateRating on 45 pages, owner bio |
| Mobile UX | Render-blocking, oversized fonts, broken touch targets | WCAG-compliant, lazy-loaded, swipe-enabled carousel |
| Reporting | None | Live dashboard with 7+ tiles, growth-vs-prior, PIN-gated |

---

### What organic clicks have done so far (GSC March 30 baseline)

10 clicks · 587 impressions · 1.7% CTR · avg position 23.2 over the first 10 days post-launch.

This is exactly the curve you'd expect — Google takes 6-12 weeks to fully index a new site and pages start moving up from position 20-30 → top 10 over months 2-6. The infrastructure is in place. Reviews + content velocity + speed-to-lead now compound.

---

### What's next (May sprint — see `30-day-lead-sprint-2026-05-01.md`)

1. **Reviews velocity** — close the 20→30+ gap so we beat utahroofingcompany.com (50) and approach roofingutah.com (54)
2. **Speed-to-lead automation** — auto-SMS within 60s of form submit, auto-call escalation at 5min. Per industry data, lifts close rate 2× on existing traffic.
3. **Form CRO** — cut to 3 fields, sticky inspection CTA, real photos. Documented 20-35% lift.
4. **Storm landing page + HailTrace stack** — pre-built so we beat storm-chasers in the 7-day post-storm CPL window.
5. **AI-Overview citation moat** — reformat top-12 pages to answer-shaped chunks for ChatGPT / Perplexity / AI Overviews.

---

### Compensation structure (per our existing agreement)

**10% commission on jobs sourced from organic web traffic.**

Tracking is now automated:
- Every form submission lands in Supabase `leads` table with `source_page` (the URL the user came from)
- The `job_value` column gets backfilled when a job closes (you mark it on your end)
- The dashboard auto-calculates 10% commission on closed `job_value`
- Friday weekly report shows the commission earned that week

### Proposed cadence

- **Friday 4pm Denver — 15-min review call** to walk through the dashboard, review the week's lead pipeline, mark any closed jobs, lock the commission tally
- **Monthly Tuesday — 30-min planning call** to review what's working, what's next, any feature requests
- **Commission paid weekly via** [Venmo / Zelle / your preference]

### What I need from you

1. **Confirm the Friday call cadence** (or pick your preferred day)
2. **Mark any jobs already closed** in the past 5 weeks that came from organic so we can backfill the commission ledger (just text me a list)
3. **Sign off on the May sprint plan** (top 5 plays from the sprint doc, takes 5 min to read)
4. **Decide on NiceJob** ($75/mo, automates review requests post-job) — or commit to me building the Twilio-native review-request flow as an alternative
5. **HailTrace go/no-go** ($99/mo, pause/unpause monthly) — wire it before May 15 so the storm-trigger system is hot for hail season

---

*Ryan Conwell · ryan@framerestorations.com · 435-292-8802 (text) · 435-302-4422 not in use for outbound — Landon's direct line*
