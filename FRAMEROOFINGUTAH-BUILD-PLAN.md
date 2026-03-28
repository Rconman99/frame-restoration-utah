# frameroofingutah.com — Full Build Architecture

**Target:** Production-ready site that goes live the moment DNS points to Vercel
**Stack:** Static HTML + Supabase Edge Functions + Vercel
**Brand:** Frame Roofing Utah (rebranded from Frame Restoration Utah)

---

## WHAT MIGRATES (Keep)

| Asset | Count | Notes |
|-------|-------|-------|
| Blog posts (HTML) | 24 | Migrate all — upgrade with author bios, dates, new brand |
| Blog photos | 24 | Already unique per post |
| Project photos | 8 | Heber Valley project gallery |
| Project page | 1 | Heber Valley roof — keep and expand |
| Service pages | 12 | Keep structure, rewrite content for new brand |
| global.css | 1 | Keep — well-built, responsive, brand colors work |
| global-modal.js | 1 | Keep — inspection booking form |
| Drone videos | 2 | 36MB total — keep, convert to WebM too |
| Logo/brand assets | 24 | SVG + PNG variants — update "restoration" → "roofing" where text appears |
| favicon/icons | 4 | Keep as-is |
| 404 page | 1 | Keep — branded, well-designed |
| vercel.json | 1 | Keep config, update for new domain |
| robots.txt | 1 | Update domain references |
| manifest.json | 1 | Update name and URLs |

## WHAT GETS REBUILT (Don't migrate as-is)

| Asset | Count | Why |
|-------|-------|-----|
| Location pages | 44 | Templated city-swaps → unique content per city |
| Homepage (index.html) | 1 | Clean rebuild with new brand, fix all title/meta issues |
| sitemap.xml | 1 | Auto-generated from actual page list |
| Blog index | 1 | Rebuild with filtering, city tags, and auto-population |

## WHAT'S NEW (Build from scratch)

| Component | Purpose |
|-----------|---------|
| Weather Monitor | Supabase edge function polling NWS API every 30min |
| Blog Draft Generator | Creates draft HTML from weather events + templates |
| City Data Files (JSON) | Hyper-local content per city — neighborhoods, elevation, landmarks |
| Review Dashboard | Simple page where Ryan approves/edits/publishes drafts |
| PostHog integration | Track which posts drive leads |
| Self-hosted fonts | Archivo Black + Archivo — no Google Fonts dependency |
| WebP images | All JPGs converted to WebP with fallback |
| Author bio component | Reusable author section with schema for E-E-A-T |
| Publication date system | Visible dates on all blog posts with datePublished/dateModified schema |
| RSS feed | /blog/feed.xml for syndication and Google News potential |

---

## SITE STRUCTURE

```
frameroofingutah.com/
│
├── index.html                          # Homepage
├── global.css                          # Sitewide styles
├── global-modal.js                     # Booking modal
├── robots.txt                          # Crawl rules
├── sitemap.xml                         # Auto-generated
├── manifest.json                       # PWA manifest
├── favicon.ico / apple-touch-icon.png  # Icons
├── llms.txt                            # AI crawler context
├── 404.html                            # Custom 404
│
├── pages/                              # Service pages (12)
│   ├── residential-roofing.html
│   ├── commercial-roofing.html
│   ├── roof-repair.html
│   ├── roof-replacement.html
│   ├── storm-damage.html
│   ├── emergency-tarping.html
│   ├── gutters.html
│   ├── solar-installation.html
│   ├── insurance-claims.html
│   ├── general-contracting.html
│   ├── storm-damage-restoration.html
│   └── water-fire-flood-restoration.html
│
├── locations/                          # Location pages (44) — REBUILT UNIQUE
│   ├── _data/                          # City JSON data files
│   │   ├── salt-lake-city.json
│   │   ├── park-city.json
│   │   ├── heber-city.json
│   │   └── ... (44 files)
│   ├── salt-lake-city.html
│   ├── park-city.html
│   └── ... (44 pages)
│
├── blog/                               # Blog posts
│   ├── index.html                      # Blog index (filterable by city/topic)
│   ├── feed.xml                        # RSS feed
│   ├── salt-lake-city/
│   │   ├── historic-home-reroofing.html
│   │   └── ...
│   ├── park-city/
│   │   ├── ice-dam-winter-roof-damage.html
│   │   └── ...
│   └── ... (24 existing + auto-generated drafts)
│
├── projects/                           # Project case studies
│   └── heber-valley-roof.html
│
├── images/
│   ├── photos/                         # Project photos (WebP + JPG fallback)
│   ├── projects/                       # Case study photos
│   └── ... (logos, icons, brand assets)
│
├── assets/
│   ├── fonts/                          # Self-hosted Archivo Black + Archivo
│   ├── drone-footage.mp4
│   └── drone-showreel.mp4
│
├── api/                                # Supabase Edge Functions (deployed separately)
│   ├── weather-monitor.ts              # Polls NWS, detects roof-relevant events
│   ├── blog-generator.ts              # Creates draft HTML from templates + data
│   ├── publish.ts                      # Commits draft to GitHub → Vercel deploys
│   └── notify.ts                       # Emails/texts Ryan when draft is ready
│
└── admin/                              # Simple review dashboard
    └── index.html                      # Draft review + publish UI
```

---

## WEATHER-TRIGGERED BLOG SYSTEM

### How It Works

```
NWS API (api.weather.gov)
    │
    ▼ (every 30 min)
┌─────────────────────┐
│  Weather Monitor     │  Supabase Edge Function (cron)
│  - Checks Utah alerts│
│  - Filters for:      │
│    • Hail > 1"       │
│    • Wind > 50mph    │
│    • Snow > 8"       │
│    • Ice/freeze      │
│    • Flash flood     │
└─────────┬───────────┘
          │ Event detected
          ▼
┌─────────────────────┐
│  Blog Generator      │  Supabase Edge Function
│  - Picks template    │
│  - Injects NWS data  │
│  - Loads city JSON    │
│  - Randomizes struct  │
│  - Saves to Supabase │
└─────────┬───────────┘
          │ Draft ready
          ▼
┌─────────────────────┐
│  Notification        │  Email + SMS to Ryan
│  "Hail in Sandy —    │
│   draft ready for    │
│   review"            │
└─────────┬───────────┘
          │ Ryan reviews
          ▼
┌─────────────────────┐
│  Admin Dashboard     │  Simple web UI
│  - Preview draft     │
│  - Edit/add notes    │
│  - Approve           │
└─────────┬───────────┘
          │ Approved
          ▼
┌─────────────────────┐
│  Publisher            │  Supabase Edge Function
│  - Commits HTML to   │
│    GitHub repo        │
│  - Updates sitemap    │
│  - Updates blog index │
│  - Vercel auto-deploys│
└─────────────────────┘
```

### NWS API Endpoints

```
Active alerts for Utah:
https://api.weather.gov/alerts/active?area=UT

Specific zone alerts:
https://api.weather.gov/alerts/active?zone=UTZ040  (Wasatch Front)
https://api.weather.gov/alerts/active?zone=UTZ041  (Salt Lake Valley)
https://api.weather.gov/alerts/active?zone=UTZ042  (Utah Valley)

7-day forecast by coordinates:
https://api.weather.gov/points/{lat},{lon}/forecast
```

### City Data File Format (locations/_data/park-city.json)

```json
{
  "city": "Park City",
  "slug": "park-city",
  "state": "UT",
  "zip": "84060",
  "county": "Summit",
  "elevation_ft": 6902,
  "tier": 2,
  "lat": 40.6461,
  "lon": -111.498,
  "nws_zone": "UTZ043",
  "climate": {
    "avg_annual_snowfall_in": 149,
    "avg_winter_low_f": 12,
    "avg_summer_high_f": 82,
    "freeze_thaw_cycles_per_year": 85,
    "hail_risk": "moderate",
    "wind_exposure": "high — canyon effect from Parley's"
  },
  "neighborhoods": [
    "Old Town", "Prospector", "Thaynes Canyon", "Park Meadows",
    "Jeremy Ranch", "Silver Springs", "Pinebrook", "Summit Park"
  ],
  "landmarks": [
    "Main Street Historic District", "Deer Valley Resort",
    "Park City Mountain Resort", "Utah Olympic Park"
  ],
  "common_home_types": [
    "Luxury ski condos (1990s-2010s)",
    "Custom mountain homes (timber frame, stone)",
    "Historic Main Street buildings (1880s-1920s)",
    "Modern townhomes (Canyons Village, Kimball Junction)"
  ],
  "common_roof_issues": [
    "Ice dams from heat loss in cathedral ceilings",
    "Snow load stress on flat/low-slope ski lodge roofs",
    "UV degradation at elevation (higher UV exposure than valley)",
    "Wildlife damage (raccoons, squirrels accessing attic via roof)"
  ],
  "local_building_codes": "IRC 2021 with Summit County amendments — 40psf ground snow load",
  "hoa_names": ["Deer Valley HOA", "Jeremy Ranch HOA", "Silver Springs HOA"],
  "school_district": "Park City School District",
  "competitors_active": ["BigHorn Roofing", "All Season Roofing", "FBC Roofing"],
  "unique_angle": "Luxury mountain homes with extreme weather exposure — premium materials and ice dam expertise are the sell, not price"
}
```

### Blog Template Randomization System

Each blog topic has 8-12 section variants. The generator randomly selects 5-6 and shuffles the order.

**Example for "Hail Damage" topic:**

Section pool:
1. "What [NWS alert severity] hail does to [material_type] shingles"
2. "The first 48 hours: what [city] homeowners should check"
3. "[City] hail history: how [date] compares to previous events"
4. "Insurance claim timeline for [county] County homeowners"
5. "Hidden hail damage: what you can't see from the ground"
6. "Why [city] homes at [elevation]ft face different hail risks"
7. "Emergency tarping: when hail breaks through"
8. "Contractor vs DIY damage assessment: the honest comparison"
9. "[Neighborhood] and [neighborhood]: highest-risk areas in [city]"
10. "How [material_type] roofs vs [material_type] roofs handle [hail_size] hail"
11. "Professional inspection: what we check and why"
12. "Your roof warranty after hail: what's covered and what's not"

**Output for Sandy post:** Sections 2, 6, 10, 4, 11 (randomized order)
**Output for Park City post:** Sections 1, 5, 9, 7, 12 (different selection, different order)

Combined with city-specific data injection, the posts are structurally and substantively different.

### Intro Hook Variants (5+ per topic, never repeat within 3 posts)

1. **Question hook:** "Did you hear that thud on your roof last night? If you're in [city], you weren't imagining it."
2. **Data hook:** "The National Weather Service recorded [hail_size] hail across [county] County at [time] on [date] — here's what that means for your roof."
3. **Story hook:** "When [neighborhood] residents woke up on [date], their cars were dented and their gutters were full of shingle granules."
4. **Weather hook:** "At [elevation] feet, [city] gets hit differently than the valley. Last night's storm proved it."
5. **Urgency hook:** "[Hours] hours ago, a severe thunderstorm cell dropped [hail_size] hail across [city]. If you haven't checked your roof yet, here's what to look for."

---

## LOCATION PAGE REBUILD STRATEGY

Each of the 44 location pages must be genuinely unique. The city JSON data files power the differentiation.

### Content Sections (each page gets ALL of these, but content varies by city)

1. **Hero** — City-specific headline + photo from that area (if available) or closest project
2. **Why [City] Roofs Are Different** — Elevation, climate, common home types, specific challenges
3. **Our Work in [City]** — Specific neighborhoods served, named projects if available
4. **Common Roof Problems in [City]** — Pulled from city JSON, genuinely different per location
5. **Services We Provide** — Same list but weighted differently (Park City = ice dam focus, WVC = cost focus)
6. **Local FAQ** — 5 questions unique to that city, never repeated across locations
7. **Weather & Your Roof** — Climate stats, avg snowfall, hail risk, wind exposure — all real data
8. **What Our [City] Customers Say** — Reviews from that area (or nearest)
9. **Service Area Map** — Embedded map centered on that city
10. **CTA** — City-specific inspection offer

### Word Count Target
- Tier 1 cities (SLC, Provo, Orem, Sandy, Ogden, WVC): 2,500+ words
- Tier 2 cities (Park City, Heber, Draper, Lehi, etc.): 2,000+ words
- Tier 3 cities (smaller markets): 1,500+ words

---

## E-E-A-T SIGNALS (Built Into Every Page)

### Author Bio Component
```html
<section class="author-bio" itemscope itemtype="https://schema.org/Person">
  <img src="/images/team/ryan-conwell.jpg" alt="Ryan Conwell" itemprop="image" />
  <div>
    <strong itemprop="name">Ryan Conwell</strong>
    <span itemprop="jobTitle">Owner & Lead Roofing Specialist</span>
    <p itemprop="description">Ryan founded Frame Roofing Utah after [X] years in
    the roofing industry. Based in Heber City, he leads every major project
    personally and has completed [X]+ roof installations across the Wasatch Front.</p>
    <meta itemprop="knowsAbout" content="Roofing, Storm Damage Restoration, Metal Roofing, Ice Dam Prevention" />
  </div>
</section>
```

### Publication Dates (Visible + Schema)
```html
<time datetime="2026-03-17" itemprop="datePublished">March 17, 2026</time>
<time datetime="2026-03-17" itemprop="dateModified">March 17, 2026</time>
```

### Trust Signals
- Google review count + rating pulled from GBP (or hardcoded with update schedule)
- GAF/Owens Corning certification badges (if applicable)
- Utah contractor license number
- BBB rating (once listed)
- "Locally owned, Heber City based" on every page

---

## TECHNICAL IMPROVEMENTS

### Self-Hosted Fonts
Download Archivo Black + Archivo from Google Fonts, host in `/assets/fonts/`:
```css
@font-face {
  font-family: 'Archivo Black';
  src: url('/assets/fonts/archivo-black-v22-latin-regular.woff2') format('woff2');
  font-display: swap;
}
```
Eliminates render-blocking external request to fonts.googleapis.com.

### WebP Images
Convert all 24 JPG photos to WebP (50-70% smaller):
```html
<picture>
  <source srcset="/images/photos/frame-restoration-01.webp" type="image/webp">
  <img src="/images/photos/frame-restoration-01.jpg" alt="..." loading="lazy">
</picture>
```

### Auto-Generated Sitemap
Python script runs on each publish:
- Scans all HTML files
- Sets priority by page type (homepage 1.0, services 0.8, blog 0.7, locations 0.6)
- Sets lastmod from git commit date
- Writes sitemap.xml

### RSS Feed
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Frame Roofing Utah Blog</title>
    <link>https://frameroofingutah.com/blog</link>
    <description>Expert roofing insights for Utah homeowners</description>
    <!-- Auto-populated from blog posts -->
  </channel>
</rss>
```

---

## LAUNCH CHECKLIST

### Pre-Launch (Before DNS Switch)
- [ ] All 107+ pages built and tested locally
- [ ] New Vercel project created for frameroofingutah.com
- [ ] All images converted to WebP with JPG fallback
- [ ] Fonts self-hosted, Google Fonts removed
- [ ] Author bios added to all blog posts
- [ ] Publication dates added to all blog posts
- [ ] Location pages rewritten with unique content (44 pages)
- [ ] City JSON data files created (44 files)
- [ ] Weather monitor edge function deployed to Supabase
- [ ] Blog generator edge function deployed
- [ ] Admin dashboard built and accessible
- [ ] PostHog tracking code added
- [ ] Google Search Console verified (DNS TXT record)
- [ ] Google Business Profile updated with new domain
- [ ] All schema markup updated with new domain URLs
- [ ] Canonical tags updated to frameroofingutah.com
- [ ] OG/Twitter tags updated with new domain
- [ ] sitemap.xml generated with new URLs
- [ ] robots.txt updated with new sitemap URL
- [ ] manifest.json updated with new domain
- [ ] SSL certificate provisioned (Vercel handles this)
- [ ] vercel.json configured with cleanUrls, headers, caching

### Launch Day (DNS Switch)
- [ ] Point frameroofingutah.com DNS to Vercel
- [ ] Verify SSL is active
- [ ] Submit sitemap to Google Search Console
- [ ] Request indexing for top 20 pages manually
- [ ] Verify all pages load correctly
- [ ] Test booking form (Formspree)
- [ ] Test mobile experience
- [ ] Verify structured data with Google Rich Results Test

### Post-Launch (First Week)
- [ ] Monitor Google Search Console for crawl errors
- [ ] Set up 301 redirects from framerestorationutah.com → frameroofingutah.com (if keeping old domain)
- [ ] Submit to local directories: BBB, Angi, Yelp, HomeAdvisor, Thumbtack
- [ ] Update Facebook, Instagram, Google Business with new URL
- [ ] Monitor PostHog for first traffic data
- [ ] Verify weather monitor is running and detecting alerts
- [ ] Publish first weather-triggered blog post if events occur

### Post-Launch (First Month)
- [ ] Monitor index rate in GSC (target: 50%+ pages indexed within 30 days)
- [ ] Review PostHog data — which pages get traffic, which CTAs convert
- [ ] Build first 5 backlinks (directories, suppliers, chamber of commerce)
- [ ] Aim for 5+ new Google reviews
- [ ] Publish 2-4 blog posts (weather-triggered or scheduled)
- [ ] Run Google PageSpeed Insights on top 10 pages

---

## DOMAIN MIGRATION: framerestorationutah.com → frameroofingutah.com

If keeping the old domain active temporarily:

```
# In old site's vercel.json (framerestorationutah.com)
{
  "redirects": [
    { "source": "/(.*)", "destination": "https://frameroofingutah.com/$1", "permanent": true }
  ]
}
```

This 301 redirects all traffic and passes SEO juice (whatever exists) to the new domain. Keep this running for 6-12 months minimum.

---

## TIMELINE

| Week | Deliverable |
|------|-------------|
| Week 1 | New Vercel project, repo structure, CSS/JS migrated, homepage rebuilt |
| Week 2 | Service pages migrated + updated, self-hosted fonts, WebP conversion |
| Week 3 | Blog posts migrated with author bios + dates, blog index rebuilt |
| Week 4 | Location pages rebuilt (Tier 1 cities: SLC, Park City, Heber, Sandy, Provo, Orem) |
| Week 5 | Location pages rebuilt (Tier 2 cities), city JSON data files |
| Week 6 | Location pages rebuilt (Tier 3 cities), sitemap, RSS feed |
| Week 7 | Weather monitor + blog generator built and tested |
| Week 8 | Admin dashboard, PostHog integration, final QA |
| Week 9 | Launch prep — DNS verification, GSC setup, directory submissions |
| Week 10 | GO LIVE |

**Total estimated effort: 8-10 weeks to production-ready**
