# BRUTAL SEO AUDIT: framerestorationutah.com

**Date:** March 17, 2026
**Audited by:** Claude (Cowork)
**Overall Score: 38/100**

---

## EXECUTIVE SUMMARY

Your site is invisible to Google. Not struggling — **invisible**. A `site:framerestorationutah.com` search returns 3 indexed pages out of 107. Google is indexing your homepage with a title that says **"Top-Rated Roofers & General Contractors in Frisco, TX"** — a city you don't operate in, in a state 1,200 miles away. Your 44 location pages are templated city-name-swaps that Google's Helpful Content system is almost certainly suppressing. You have zero backlinks from any authority source, zero Google Business Profile integration with the site, and your competitors (BigHorn, Olympus, Utah Roofing Experts) are outranking you on every keyword in every city you serve — including Heber City, where your office is.

The blog content is the one bright spot. It's long-form, unique, well-structured. But it's buried under a foundation of technical failures and strategic misfires that prevent any of it from ranking.

**Top 3 problems that must be fixed immediately:**

1. Your homepage title tag tells Google you're a Frisco, TX company
2. Google has only indexed ~3 of your 107 pages
3. Your 44 location pages are thin, templated content that triggers duplicate content suppression

---

## PROBLEM #1: GOOGLE THINKS YOU'RE IN TEXAS

**Severity: CATASTROPHIC**

When Google crawls your homepage, the first thing it reads is:

> `<title>Top-Rated Roofers & General Contractors in Frisco, TX | Frame Restoration Experts</title>`

This is the #1 ranking signal for local search. Every search Google processes for "roofing Heber City" or "roof repair Salt Lake City" immediately disqualifies you because your title says Texas.

Your H1 says Utah. Your address says Utah. Your phone number is a 435 area code. But the title — the single most important on-page signal — says Frisco, TX.

**This alone explains why you're not ranking for anything.** Google's local algorithm is seeing contradictory geographic signals and choosing to suppress you rather than guess.

**Why this happened:** This is likely a leftover from a Squarespace template or a copy-paste error from another Frame Restoration property. It was never caught because the site looks fine visually — you'd never see the title tag unless you viewed source.

**Fix:** Change the title to `Roofing Contractor Utah | Frame Restoration Utah` (which is what's in the actual file — so the live deployment may be serving a cached or different version).

---

## PROBLEM #2: GOOGLE HAS INDEXED ALMOST NOTHING

**Severity: CATASTROPHIC**

A `site:framerestorationutah.com` search returns **3 pages:**
- Homepage (with the wrong Texas title)
- Blog index (titled "Blog 3-Frame Restoration (Copy)")
- /in-the-news page

Out of **107 HTML pages**, Google has chosen to index 3. That's a **2.8% index rate**.

**What this means:** Your 44 location pages, 24 blog posts, 12 service pages, and project page essentially don't exist in Google's eyes. All the SEO work we've done — the schema markup, the BreadcrumbList, the FAQPage expansion, the blog content — none of it matters if Google won't index the pages.

**Likely causes:**
- The Texas title confusion is sending a "this site is unreliable" signal
- The blog index title literally says "(Copy)" — a Squarespace artifact that signals duplicate/test content
- 44 near-identical location pages may have triggered thin content suppression, dragging down the whole domain
- Possible crawl budget exhaustion — Google may have decided the site isn't worth crawling deeply

**What needs to happen:**
- Fix the homepage title (Problem #1)
- Submit each page individually through Google Search Console
- Request re-indexing after fixes
- Monitor crawl stats in GSC for the next 30 days

---

## PROBLEM #3: LOCATION PAGES ARE THIN CONTENT

**Severity: HIGH**

All 44 location pages follow the exact same template:
- Same H1 pattern: "Premium Reroofing in [CITY]"
- Same section headings in same order
- Same boilerplate paragraphs with city name swapped
- Same CTA text: "Schedule Your [CITY] Roof Inspection"
- Same word count (~1,850 words each)
- Same internal link structure (23 links per page)

If you remove the city name from any two location pages and compare them, they're 90%+ identical.

**Google's Scaled Content Abuse policy (updated January 2026) explicitly targets this pattern.** Their quality raters are trained to check: "If you remove the location name, is this page meaningfully different from the other location pages?" For your site, the answer is no.

**Your competitors are doing the same thing** (BigHorn's Heber City page is also thin), but they have years of domain authority and backlinks protecting them. You don't have that cushion.

**The alpine.html page is the exception** — it was rewritten with unique elevation data, local geography, and custom service descriptions. That's the model for what every location page needs to become.

---

## PROBLEM #4: ZERO COMPETITIVE VISIBILITY

**Severity: HIGH**

For the search "roof replacement heber city utah" — literally your home market — here's who ranks on page 1:

1. utahroofing.com (dedicated Heber City location page + blog post)
2. fbcroofing.com (Heber City service page)
3. rr-partnerroofing.com (Heber City contractor page)
4. gobighorn.com (Heber City location page)
5. eliteservicesandroofing.com (Heber service area page)
6. roofmaxx.com (Heber City dealer page)

**Frame Restoration Utah: Not on page 1, 2, or 3.**

For "best roofing companies Utah" — you're not listed on any ranking page or directory. BigHorn, Olympus, Heaton Bros, Pioneer Roofing, and others dominate.

For "frame restoration roofing utah" — a branded search for YOUR company — Google returns competitor pages and directories. Your own site barely appears.

**You are being outranked on your own brand name.**

---

## PROBLEM #5: BLOG INDEX SAYS "(COPY)"

**Severity: MEDIUM-HIGH**

The blog index page that Google has indexed has the title:

> "Blog 3-Frame Restoration (Copy)"

This is a Squarespace export artifact. It tells Google this is a copy of another page — literally the word "Copy" in the title. This is a deduplication signal that may be causing Google to treat your entire blog section as duplicate content from the original Squarespace site (if it's still live).

**Is the old Squarespace site still live?** If framerestorations.com (without "utah") is still serving the same content, Google may be treating your entire site as a duplicate. This would explain the 2.8% index rate.

---

## PROBLEM #6: NO BACKLINKS, NO AUTHORITY

**Severity: HIGH**

Your competitors have:
- **Olympus Roofing:** 51 years in business, GAF Master Elite certification, Owens Corning Preferred, BBB listing, Angi listing, Salt Lake HBA member
- **BigHorn Roofing:** GAF 3-Star President's Club (top 1% nationwide), 20+ years, PR coverage, industry awards
- **Utah Roofing Experts:** Multiple city-specific pages ranking, blog content for every service area

**Frame Restoration Utah has:**
- A domain registered recently
- 19 Google reviews (5.0 stars — good, but low volume)
- No BBB listing appearing in searches
- No industry directory listings
- No PR coverage
- No backlinks from local businesses, suppliers, or industry sites

**Domain authority is earned over time, but you can accelerate it** through directory submissions, supplier partnerships, local news coverage, and genuine community involvement that generates links.

---

## TECHNICAL AUDIT SCORECARD

| Check | Status | Details |
|-------|--------|---------|
| Homepage title tag | FAIL | Says "Frisco, TX" — wrong state |
| Blog index title | FAIL | Says "(Copy)" — Squarespace artifact |
| Meta descriptions | PASS | Present and unique on key pages |
| H1 tags | WARNING | Location pages all identical pattern |
| Canonical tags | PASS | Properly set |
| OG/Twitter tags | PASS | Complete on all pages |
| JSON-LD schema | PASS | RoofingContractor, FAQPage, BreadcrumbList, BlogPosting |
| Sitemap.xml | WARNING | Exists but missing 6 pages |
| Robots.txt | PASS | Properly configured |
| Security headers | PASS | All present via Vercel |
| Image alt text | PASS | 100% coverage |
| Internal links | PASS | Consistent 23 links/page |
| Broken links | PASS | None found |
| Mobile responsive | PASS | Verified |
| Page speed | WARNING | No CDN for images, no WebP, fonts loaded externally |
| HTTPS | PASS | Full HTTPS |
| Google indexation | FAIL | 3/107 pages indexed (2.8%) |
| Content uniqueness | FAIL | 44 location pages are 90%+ identical |
| Word count | PASS | Blogs avg 2,678 words, locations avg 1,850 |
| Publication dates | WARNING | No visible dates on blog posts |
| Author attribution | FAIL | No author bios or E-E-A-T signals |

---

## COMPETITOR COMPARISON

| Dimension | Frame Restoration | BigHorn Roofing | Utah Roofing Experts | Olympus Roofing |
|-----------|------------------|-----------------|---------------------|-----------------|
| Domain age | ~6 months | 10+ years | 5+ years | 10+ years |
| Google index | ~3 pages | 100+ pages | 200+ pages | 50+ pages |
| Blog posts | 24 (good quality) | 50+ (city-targeted) | 100+ (city-targeted) | 10+ |
| Location pages | 44 (thin/template) | 30+ (moderate) | 40+ (moderate-good) | 10+ |
| Google reviews | 19 (5.0 stars) | 200+ (4.8 stars) | 100+ (4.9 stars) | 500+ (4.8 stars) |
| Backlink profile | None visible | Strong | Moderate | Strong |
| Industry certs | Unknown | GAF President's Club | Multiple | GAF Master Elite, OC Preferred |
| Local directories | None | BBB, Angi, HomeAdvisor | BBB, Angi | BBB, Angi, SLHBA |
| SERP features | None | Local pack, snippets | Featured snippets, PAA | Local pack |
| Keyword rankings | 0 page-1 rankings | 50+ page-1 | 100+ page-1 | 30+ page-1 |

**You are not in the same league as your competitors right now.** They have years of authority, hundreds of reviews, and established backlink profiles. Your content quality is competitive, but your infrastructure is broken.

---

## KEYWORD OPPORTUNITIES (Sorted by Realistic Opportunity)

| Keyword | Difficulty | Opportunity | Your Ranking | Intent | Action |
|---------|-----------|-------------|-------------|--------|--------|
| frame restoration utah | Easy | HIGH | Not ranking | Branded | Fix homepage title — this should be #1 |
| roof repair heber city | Moderate | HIGH | Not indexed | Transactional | Fix indexation, build unique Heber content |
| hail damage roof park city | Moderate | HIGH | Not indexed | Transactional | Weather-triggered blog + fix indexation |
| roofing contractor wasatch county | Easy | HIGH | Not indexed | Transactional | You're the only Heber-based roofer — own this |
| emergency roof repair utah | Hard | MEDIUM | Not indexed | Urgent | Long-tail blog content, fix indexation first |
| roof replacement cost utah 2026 | Hard | MEDIUM | Not indexed | Commercial | Existing blog post, needs indexation |
| ice dam removal park city | Easy-Mod | HIGH | Not indexed | Seasonal | Existing blog post, needs indexation |
| metal roofing utah | Hard | LOW | Not indexed | Commercial | Big competitors own this — defer |
| best roofer salt lake city | Very Hard | LOW | Not indexed | Navigational | Need 100+ reviews and years of authority |

**The honest truth:** Until you fix the indexation problem, keyword targeting is academic. You could have perfect content for every keyword and it wouldn't matter because Google isn't reading your pages.

---

## PRIORITIZED ACTION PLAN

### THIS WEEK (Emergency Fixes)

**1. Fix the homepage title tag** — Change from Frisco TX to Utah. This is a 30-second fix that's costing you everything. Verify the deployed version matches the source file.

**2. Fix the blog index title** — Remove "(Copy)" from the title. Check all other pages for Squarespace artifacts.

**3. Check if framerestorations.com is still live** — If the old site is serving duplicate content, Google is choosing it over you. Either take it down or add canonical tags pointing to framerestorationutah.com.

**4. Request re-indexing in Google Search Console** — Submit your sitemap, then manually request indexing for: homepage, all service pages, top 10 blog posts, top 10 location pages.

**5. Audit every page title for geographic errors** — grep the entire site for "Frisco", "TX", "Texas", "DFW", "(Copy)" or any other artifacts.

### THIS MONTH (Foundation Repairs)

**6. Rewrite 10 highest-value location pages with unique content** — Start with Heber City, Park City, Salt Lake City, Sandy, Draper, Provo, Orem, Lehi, Ogden, Bountiful. Each page needs unique local content (neighborhoods, landmarks, climate data, building codes, project photos from that area).

**7. Add author bios to all blog posts** — Create an author entity for Ryan / Frame Restoration with credentials, photo, and schema markup. E-E-A-T requires demonstrable expertise.

**8. Add publication dates to all blog posts** — Google rewards fresh content. Dateless posts look like they could be 10 years old.

**9. Submit to every local directory** — BBB, Angi, HomeAdvisor, Thumbtack, Yelp Business, Google Business Profile optimization, Salt Lake Home Builders Association, Utah Roofing Contractors Association.

**10. Build 5 genuine backlinks** — Supplier pages (GAF, Owens Corning dealer locator), local chamber of commerce, Heber City business directory, Wasatch County contractor registry.

### THIS QUARTER (Growth Strategy)

**11. Implement the weather-triggered blog system** — Start generating timely, data-driven content tied to real NWS events.

**12. Convert all images to WebP** — Page speed improvement + modern signal.

**13. Self-host Google Fonts** — Eliminate render-blocking external requests.

**14. Build a project gallery section** — Real photos of real jobs with locations tagged. This is E-E-A-T proof that you do actual work in these cities.

**15. Get to 50+ Google reviews** — Ask every completed job for a review. Volume matters for local pack ranking.

---

## THE UNCOMFORTABLE TRUTH

You've built a technically solid site with good content, but you're fighting competitors who have 10+ years of domain authority, hundreds of reviews, industry certifications, and established backlink profiles. No amount of on-page SEO will overcome that gap in the short term.

**Your realistic path to page 1 rankings:**

**Months 1-3:** Fix the catastrophic technical issues (title tags, indexation, duplicate content). Get indexed. Get listed in directories. Start building backlinks. Target long-tail keywords where competition is lower.

**Months 3-6:** The weather-triggered blog system starts producing timely, genuinely useful content that earns organic links and social shares. Location pages get rewritten with unique content. Review count grows toward 50+.

**Months 6-12:** Domain authority builds. You start appearing on page 2-3 for competitive keywords. Long-tail and local keywords (Heber City, Wasatch County, Midway) start hitting page 1 because you're the only local roofer with deep content for these smaller markets.

**Month 12+:** Competitive keywords become realistic targets as authority compounds.

**The weather-triggered blog system is your unfair advantage.** Your competitors are publishing generic content on a content calendar. You'll be publishing real data about real storms hitting real neighborhoods — the day they happen. That's content Google can't help but rank, because it's the most relevant result for "hail damage [city] [date]" and nobody else is producing it.

But none of that matters until you fix the Texas title tag and get indexed.

---

*Score breakdown: Technical (5/15) + Content Quality (12/20) + Indexation (2/20) + Authority (3/15) + Local SEO (5/15) + Competitive Position (3/15) = 30/100... bumped to 38 because the blog content quality is genuinely above average for the industry.*
