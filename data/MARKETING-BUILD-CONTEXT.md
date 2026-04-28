# Frame Roofing Utah — Marketing Build Context

**Single entry point for any Claude / Cowork session working on Frame Utah marketing.**

Read this once and you'll know: what we're trying to do, what's been validated, what's wired but not running yet, what to spend, what to track, and where every artifact lives.

**Generated 2026-04-27.** Refresh quarterly or when Wave 2 validations complete.

---

## TL;DR — Active $15K/mo allocation

Recommendation, with Wave 1 deltas already applied (see § "Wave 1 Findings" below for what changed and why).

| Bucket | $/mo | What it funds |
|---|---|---|
| **Tier-1 priority cities** (Park City, Heber, Draper, Salt Lake) | $7,500 | LSA + Search + Meta + Local social, premium-ticket concentration |
| **Tier-2/3 volume layer** (West Valley, Sandy, Bountiful, Lehi) | $2,500 | LSA-anchored volume |
| **⭐ Reviews acquisition system** | **$1,700** | **The actual gap** — close 20→60+ vs roofingutah.com's 54 |
| Content moat (narrowed scope after Wave 1) | $700 | 2-3 high-conversion pillar pages, NOT volume |
| YouTube + TikTok organic + light boost (Heber drone reuse) | $1,300 | Asymmetric — zero competitor video presence in Utah roofing |
| Storm-trigger reserve (May-Sept hail/wind + Dec-Feb ice dam) | $800 | Two seasonal windows |
| Yelp (decision pending — trial expired 2026-04-27) | $500 / $0 | Kill if 30-day CPL >$200 |
| **Total** | **$15,000** | |

**Forecast at Month 4 steady state:** 70-110 leads/mo at $135-185 blended CPL · review count compounding 4-6/mo · parity with roofingutah.com by Q4 2026.

**Confidence on this allocation:** B+ overall (see § Confidence Scorecard). Lifts to A after Wave 2 paid validations + Wave 3 30-day live test.

---

## Wave 1 Findings (free intel, 2026-04-27 — already integrated above)

These three findings shifted the audit recommendation. Do not undo without re-running the underlying check.

### ✅ roofingutah.com is content-DORMANT
- Sitemap evidence: post-sitemap last-modified **2024-05-31** (23 months stale)
- 31 total posts, all from 2017-2024
- Stack: Wordpress + Yoast SEO
- **Implication:** Frame Utah's $1,500/mo content moat (in earlier audit) was budgeted to catch up to active competition — **they're not competing.** Reduced to $700/mo focused on 2-3 high-conversion pillar pages. Frame Utah already has 43 blog posts, 2-month-fresh.
- **Re-validate:** quarterly via `curl -sL https://www.roofingutah.com/post-sitemap.xml | grep -c '<url>'`

### ✅ utahroofingcompany.com has no blog
- 22 URLs total, no `/post-sitemap.xml`, custom stack (not WP)
- **Implication:** Utah's #2 competitor isn't even on the content map. The lever to win Utah is **reviews + GBP, not content.**

### ✅ Frame Utah blog velocity is sustainable at 3 posts/week
- 32 posts March 2026 (one-time rebuild sprint), 13 in April (true rate)
- **Implication:** content cadence already 3x what the audit budgeted for free. **Free up ~$800/mo of content budget for reviews + paid Search.**

---

## Wave 2 — wired but not running (waiting on company CC)

When the credit card lands, run these commands. Each is already in `package.json`. All scripts dry-run when env vars are missing — set the var, re-run, no code changes.

### Sign up + provision (one-time)

| # | Service | Cost | Sign-up |
|---|---|---|---|
| 1 | Census Bureau API | $0 | https://api.census.gov/data/key_signup.html |
| 2 | DataForSEO | ~$30 first run | https://dataforseo.com/register |
| 3 | SerpAPI | $0 — **reuse existing Frame Utah review-sync key** | already exists |
| 4 | Apify | ~$3 first run | https://apify.com/sign-up |
| 5 | Birdeye / NiceJob / Podium | $0 to evaluate | https://birdeye.com/request-a-demo |

### Env vars to set (in `~/.zshrc` or shell profile)

```bash
export CENSUS_API_KEY="..."
export DATAFORSEO_LOGIN="..."
export DATAFORSEO_PASSWORD="..."
export SERPAPI_KEY="..."           # reuse existing review-sync key
export APIFY_TOKEN="..."
```

### Fire commands (after env vars set, from project root)

```bash
cd ~/projects/frame-restoration-utah

# Real per-city scoring — Census free + DataForSEO ~$15 for 45 cities
npm run market-intel:dataforseo

# Competitor SERP scan — 30 queries × $0.005 = ~$0.15
SERPAPI_KEY=$SERPAPI_KEY npm run competitor-ads

# Competitor TikTok — 5 profiles × $0.30 = ~$1.50
APIFY_TOKEN=$APIFY_TOKEN npm run competitor-tiktok
```

**Outputs land in:** `data/`
- `data/market-intel-report.md` + `data/market-intel-allocation.json`
- `data/competitor-ads-report-{date}.md` + `.json`
- `data/competitor-tiktok-{date}.md` + `.json`

**Total Wave 2 spend across both Frame projects:** ~$33 one-time.

---

## Free actions (no CC needed — do today)

These 8 actions cost $0 and unlock 6 of the 17 confidence categories without waiting:

| # | Action | Where | Time |
|---|---|---|---|
| 1 | **Pull Yelp 30-day dashboard** — decides today's $510/mo Yelp question | https://biz.yelp.com (Landon's account) | 5 min |
| 2 | **Pull Frame Utah GSC last-30-days** | https://search.google.com/search-console (ryanconwell99@gmail.com) — Performance tab | 5 min |
| 3 | **Run Supabase pipeline query** | Supabase SQL Editor (project `hdcflshhomzildwqlmwh`) → paste `scripts/supabase-pipeline-query.sql` | 5 min |
| 4 | **Pull PostHog form-submission count last 30 days** | PostHog dashboard | 5 min |
| 5 | **Google Keyword Planner: Park City + Heber + Draper** | https://ads.google.com (Tools → Keyword Planner) | 15 min |
| 6 | **15-min Birdeye / NiceJob / Podium pricing calls** | Web forms | 1 hour |
| 7 | **Send 5 manual review-requests via existing edge fn** | Supabase → Functions → review-request | 10 min |
| 8 | **Storm-trigger fire drill (iMessage Landon)** | iPhone | 1 day clock, 5 min effort |

---

## City tiers (Utah-specific)

Lifted from the full audit. Tier 4 = location-page SEO only, no paid spend.

### Tier 1 — Premium / Mountain (PRIMARY paid spend, $7,500/mo)
| City | Why | Single-roof EV |
|---|---|---|
| **Park City** | Deer Valley estate stock · ski-country premium | $50K-$150K |
| **Heber City** | HQ market · Heber Valley drone showcase = authentic proof · highest organic moat | $25K-$60K |
| **Midway** | Heber-adjacent · estate ski-country homes | $25K-$50K |
| **Draper** | Point of the Mountain wind convergence + affluent east bench | $20K-$40K |
| **Cottonwood Heights** | Big/Little Cottonwood Canyon ski-house owners | $20K-$40K |
| **Salt Lake City** | 1.5M metro · historic neighborhoods (Avenues, Sugar House, 9th-9th) | $12K-$30K |

### Tier 2 — Affluent suburb ($2,500/mo subset of priority paid)
Alpine, Highland, Holladay, Bountiful, Lehi, South Jordan

### Tier 3 — Volume Wasatch Front (LSA-anchored)
West Valley City, Sandy, West Jordan, Provo, Orem, Layton, Ogden, Murray, Kaysville, Millcreek, Riverton, Herriman

### Tier 4 — SEO-only (NO paid spend, let location pages do passive lead capture)
American Fork, Pleasant Grove, Lindon, Springville, Payson, Santaquin, Bluffdale, Taylorsville, Midvale, South Salt Lake, Magna, Kearns, Centerville, Farmington, North Salt Lake, West Bountiful, Woods Cross, Syracuse, Clinton, Clearfield, Wallsburg

**Full city list with ZIPs + tiering:** `scripts/market-intel-config.json`

---

## Channel ranking at $15K/mo (Utah-specific)

| Rank | Channel | Utah CPL | Lock-in / decay | Frame call |
|---|---|---|---|---|
| 1 | **Reviews acquisition** | $30-50/review | Compounds permanently into LSA + GBP rank | **Highest-leverage spend** — closes 20→60 |
| 2 | **googleLSA** | $40-110 | Pay-per-lead, no compounding | Anchor channel — already unblocked (phone + GBP live, 5.0★ qualifies) |
| 3 | **googleSearch (storm + cost KW)** | $90-180 std / $50-120 during May-Sept | None | Pre-build "ice dam removal [city]" winter ads + "wind damage roof [city]" spring-summer |
| 4 | **seoContent (pricing pillar + hail-damage hub)** | $0 marginal · 4-8mo lag | Compounds 5+ years | Narrowed scope after Wave 1 — competitors dormant |
| 5 | **YouTube + TikTok organic + light boost** | $20-60 boosted · $0 organic | Compounds modestly | **Asymmetric advantage** — Heber drone footage already shot, ZERO competitor video presence |
| 6 | **metaAds (HOA + neighborhood)** | $35-95 | Refresh every 14d | Park City HOAs · Draper East Bench · Holladay · Bountiful Davis wind-corridor zips |
| 7 | **Nextdoor sponsored** | $70-130 | Local-only | Sandy + Bountiful + Cottonwood Heights |
| ❌ | Direct mail | $90-180 | None | Skip until brand recognition compounds (Q3+) |
| ❌ | TikTok paid | $30-90 | — | Floor $3K/mo > priority-city allocation |

---

## Storm seasonality (Utah has TWO windows — different from TX hail belt)

- **May-Sept:** hail + wind storms (April 2 Wasatch Front storm precedent)
- **Dec-Feb:** ice dam emergencies (high-margin, low-competition KW)

Storm-trigger reserve ($800/mo) deploys in either window via:
- `/storm-response` landing page (pre-build)
- Search RSAs: "ice dam removal [city]" / "wind damage roof [city]"
- 30-second Meta video creative

---

## Confidence Scorecard

| Category | Current | Target | Path to A |
|---|---|---|---|
| roofingutah.com content cadence | **A+** ✅ | A+ | Wave 1 — DONE |
| utahroofingcompany.com content | **A+** ✅ | A+ | Wave 1 — DONE |
| Frame Utah content capacity | **A** ✅ | A | Wave 1 — DONE |
| Site readiness | A | A+ | After 28 days of CrUX field data + Twilio 10DLC fully live |
| Phone/infrastructure gates | A | A+ | When 10DLC outbound delivers |
| GBP review counts | A | A+ | Continuous SerpAPI Maps tracker |
| City tier classification | B | A | Run `npm run market-intel:dataforseo` (Wave 2) |
| Channel CPL benchmarks (industry → Frame-specific) | B | A | 30 days of live LSA/Search dashboard |
| Channel sensitivity matrix | B | A | UTM-tag everything + 90 days PostHog × Supabase |
| Storm seasonality | B | A | Wire NOAA Storm Events monthly cron |
| Forecast (70-110 leads/mo) | C | A | 30-day single-city saturation test ($3K/Park City) |
| Single-roof EV per tier | C | A | Run `scripts/supabase-pipeline-query.sql` |
| Lead → job conversion | C | A | Same Supabase query |
| Reviews compounding velocity | C | A | 2-week manual review-request pilot |
| IWC review-gap trajectory | C | A | Weekly SerpAPI Maps tracker (~$4/mo) |
| Wortham/competitor TikTok | C | A | `npm run competitor-tiktok` (Wave 2) |
| Lon Smith TX paid spend (cross-ref) | D | A+ | TX project's `npm run competitor-ads` |
| Birdeye real pricing | D | A | 15-min sales call |
| Park City / Heber LSA volume | D | A | Google Keyword Planner (free) |
| Storm-trigger 24-48hr ops | D | A | Fire drill with Landon |

**Overall confidence:** B+ → reaches A after Wave 2 (~$33 + 1 week) and A+ at Day 90 of paid-spend data.

---

## KPI Scoreboard (track weekly)

| KPI | Baseline | Target by M3 | Re-balance trigger |
|---|---|---|---|
| GBP review count | **20 / 5.0★** | **35-40** ⭐ | If <30 by M3, double Birdeye / automation budget |
| GSC indexed pages | 19 of 108 | 80+ | If <50, run IndexNow batch + canonical audit |
| GSC clicks/mo | 30 (10 in first 10 days) | 500+ | If <200, double seoContent budget |
| Blended CPL | n/a (paid not live) | <$160 | If >$200 for 14d, kill bottom-quartile KW |
| Leads/mo | n/a | >70 | If <50, audit form CR before raising spend |
| Lead → job CR | unknown | >18% | If <12%, problem is qualification |
| Park City lead share | n/a | ≥25% | If <15%, premium creative needs review |
| Reviews vs roofingutah.com | 20 vs 54 (gap 34) | 35 vs 56 → 50 vs 58 → **60 vs 60 by Q4** ⭐ | If gap widens, escalate review-acquisition |
| Storm-reserve deploys | 0 | ≥1 in May, Aug, Dec | If 0 in active window, broaden trigger criteria |

---

## Open decisions (need Ryan or Landon input)

1. **Yelp trial decision** (expired 2026-04-27) — pull 30-day dashboard, kill if CPL >$200
2. **Birdeye vs DIY review automation** — depends on 2-week manual pilot CR (Wave 2)
3. **Park City ad-creative production budget** — premium tier may need $500-1500 one-time on top of recurring
4. **GBP per-tier sub-locations?** — Park City + Heber + SLC each get own GBP, OR shared service-area? Affects LSA targeting
5. **Landon's bandwidth for review-request loop** — needs post-job text trigger; without it the $1,700/mo line item won't compound
6. **Logo update ETA** — designer task open ("Frame Roofing" not "Frame Restoration"); paid creative consistency depends on it
7. **NTRCA + GAF cert status** — determines whether trust-stack messaging can lead with manufacturer credentials

---

## File index — where every artifact lives

### Active marketing build (this session)
- `data/MARKETING-BUILD-CONTEXT.md` ← **YOU ARE HERE**
- `data/market-intel-audit-2026-04-27.md` — full deep-dive audit (Tier rankings, channel ranking, $15K split, 90-day execution sequence)

### Cross-project (Frame TX comparison + research framework)
- `~/projects/frame-roofing-research-plan-to-A-grade-2026-04-27.md` — Wave 1-4 research plan with confidence-grade roadmap
- `~/projects/frame-roofing-wave-2-readiness-2026-04-27.md` — env vars + sign-up URLs + fire commands

### Wired scripts (`scripts/`)
- `scripts/market-intel.mjs` — runner; offline + dataforseo modes
- `scripts/market-intel-config.json` — 45 cities × 4 tiers, $15K growth tier, NAICS 238160
- `scripts/market-intel-kit/` — bundled scoring + allocator + sources (Census/DataForSEO/SerpAPI)
- `scripts/market-intel-kit/README.md` — kit-level documentation
- `scripts/competitor-ads.mjs` — SerpAPI sweep on UT competitors
- `scripts/competitor-tiktok.mjs` — Apify sweep on UT competitor TikTok handles
- `scripts/supabase-pipeline-query.sql` — ready-to-paste SQL for job-value + close-rate

### npm scripts (`package.json`)
- `npm run market-intel` — offline mode
- `npm run market-intel:dataforseo` — live with paid keys
- `npm run competitor-ads` — SerpAPI sweep (dry-run if SERPAPI_KEY unset)
- `npm run competitor-tiktok` — Apify sweep (dry-run if APIFY_TOKEN unset)

### Data outputs (timestamped, never overwritten)
- `data/market-intel-report.md` + `data/market-intel-allocation.json`
- `data/competitor-ads-report-{date}.md` + `.json`
- `data/competitor-tiktok-{date}.md` + `.json`

### Existing project artifacts (reference)
- `CLAUDE.md` — project master context (people, domains, tech stack, hard rules)
- `data/google-reviews.json` — verified GBP feed (20 reviews / 5.0★, last sync 2026-04-22)
- `SEO-BRUTAL-AUDIT-March-2026.md` — March audit baseline
- `Frame-Roofing-SEO-Audit-March2026.html` — interactive SEO audit
- `Frame-Roofing-GEO-Audit-March2026.html` — GEO/AI audit
- `Frame-Restoration-Blog-Content-Strategy.xlsx` — 23 topics × 44 cities keyword map

---

## Operational separation (DO NOT cross-trigger with Frame TX)

Frame Roofing Utah and Frame Restoration TX are **independent operational entities** even though Landon's parent (`framerestorations.com`) connects them. From `CLAUDE.md:128`:

> This project runs on **its own Cowork instance · its own scheduled triggers · its own email · its own owner-agent dispatch**. Never share runtime state with `~/projects/frame-restoration-texas/`. Brand-family references in `data/brand-brief.md` are documentation only — not a license to cross-trigger.

Concrete rules:
- Different Twilio numbers (UT 435-302-4422 / TX pending)
- Different GBP listings
- Different SerpAPI sub-accounts (or at minimum different `engagement` tags on shared key)
- Different Vercel projects (Landon's account for UT, separate for TX)
- Different review-sync triggers (UT scheduled, TX not yet)

The Wave 2 spend recommendation totals $33 across both projects, but those are **two separate API runs with two separate datasets** — not a shared pull.

---

## Cadence (how to keep this doc fresh)

| Doc | Refresh trigger |
|---|---|
| **MARKETING-BUILD-CONTEXT.md** (this file) | Quarterly OR after Wave 2 validations OR after KPI re-balance |
| `market-intel-audit-2026-04-27.md` | Major recalibration only — keep as historical anchor |
| Competitor scrapes | Monthly — competitor SERP shifts faster than annual data |
| Wave 1 sitemap re-checks | Quarterly — content cadence shifts on the year scale |

---

## For Cowork sessions: the 60-second briefing

If you've never seen this project before:

1. Read `CLAUDE.md` (top section — critical rules + people + domains)
2. Read this file (`data/MARKETING-BUILD-CONTEXT.md`)
3. Pick the smallest task you can complete: any of the 8 free actions in § "Free actions (no CC needed)"
4. If editing the marketing build, update both this file AND `data/market-intel-audit-2026-04-27.md` if the change is structural
5. Honor operational separation — never trigger or read TX state

That's it. Everything else is detail.
