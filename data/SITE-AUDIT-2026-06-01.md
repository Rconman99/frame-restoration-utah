# Frame Roofing Utah — Full-Site Audit (2026-06-01)

**Scope:** all 116 sitemap pages of the merged/live code. **Methodology:** the 2026 audit framework from `/innovate` (Google Search Central "AI features = SEO" guidance + technical-SEO checklists + honest AEO caveat). **Tooling:** ported gate scripts (`audit-jsonld`/`audit-links`/`audit-city-quality`/`audit-compliance-words`), new `scripts/audit-full-site.mjs` (crawl/on-page/citability), Lighthouse + performance trace via Chrome DevTools (homepage archetype).

## Headline
**The site is technically strong — the gaps are content-metadata hygiene, not architecture.** Schema is 100% valid, SEO/Accessibility = 100, Core Web Vitals are excellent (LCP 291ms, CLS 0.02), and 99/116 pages carry FAQ schema. The real work is **blog title/meta length, broken internal links, and a few thin pages.**

## Scorecard
| Dimension | Result | Verdict |
|---|---|---|
| JSON-LD validity | 0 invalid / 364 blocks | 🟢 |
| Core Web Vitals (homepage) | LCP **291ms**, CLS **0.02**, TTFB 35ms | 🟢 (no CrUX field data — site too new) |
| Lighthouse | SEO **100**, Accessibility **100**, Best-Practices **92**, Agentic-Browsing **67** | 🟢 / 🟡 agentic |
| Crawl/index | sitemap 116 URLs, **0 broken entries**; robots + llms present | 🟢 |
| Compliance copy (Utah law) | 0 blockers | 🟢 |
| Titles | 0 missing, 0 dupes, **49 too long (>65)** | 🟡 |
| Meta descriptions | 0 missing, **46 bad length** (mostly too long), 3 dup groups | 🟡 |
| Internal links | **17 broken** | 🟡→🔴 (`${item.url}` leak is a bug) |
| Content depth | 3 service pages <500 words; 32 location pages <500 *unique* words | 🟡 |
| Image alt coverage | 0 missing | 🟢 |
| FAQ/citability | 99/116 pages have FAQPage | 🟢 |

---

## 🔴 High — fix first
1. **17 broken internal links.** Includes a real template bug `${item.url}` (literal, unrendered) and `...` (ellipsis leak); `/pages/solar` (should be `/pages/solar-installation`); `/blog/snow-damage-roof-heber-city-84032` (×9 — missing `/heber-city/` path segment, file is `blog/heber-city/...`); per-city service subpages that don't exist (`/locations/<city>/residential-roofing`, `/storm-damage-restoration`, etc.); missing cities `/locations/fruit-heights`, `/locations/spanish-fork`. → fix the links or add `vercel.json` rewrites; then flip `audit-links` to `--strict` blocking.
2. **3 thin service pages (total words):** `pages/general-contracting` (325w), `pages/solar-installation` (449w), `pages/water-fire-flood-restoration` (492w). Expand to ≥600 words of unique substance.

## 🟡 Medium — content-metadata hygiene (high volume, mechanical)
3. **49 over-length titles (>65 chars)** — 40 blog, 5 location, 4 service. Blogs run to ~103 chars (truncated in SERP). Trim to ≤60.
4. **46 bad-length meta descriptions** — 39 blog; many are *way* over (226–267 chars). Trim to ~150–160.
5. **3 orphan files (not in sitemap):** `blog/salt-lake-valley/salt-lake-valley-premium-roof-replacement-2026.html` (stranded — add to sitemap or remove), `pages/about.html` (duplicate of `/about` — canonical/dup risk), `pages/storm-damage-restoration.html` (duplicate of `/pages/storm-damage`?).
6. **3 duplicate meta-description groups** — 2 blog pairs (heber-city, park-city) + `blog/provo/storm-damage-roof-repair` shares its meta with `locations/provo`. Differentiate.
7. **5 blog pages missing `og:image`** — ogden/wind-damage, riverton/hail-damage, utah/commercial-roofing, utah/gutter-installation, utah/roof-financing.
8. **32 location pages below the 500-*unique*-word depth floor** (city-quality red-copy). Not doorway pages (differentiation passes) — just thin. Add ~25–80 unique words each (local detail: neighborhoods, common roof types, recent storms).
9. **Lighthouse minor:** `label-content-name-mismatch` (a button's visible text ≠ accessible name); `errors-in-console` + `inspector-issues` (browser console messages — likely PostHog/CSP, verify); **agentic-browsing 67** — `agent-accessibility-tree not well-formed` (the AI-agent crawlability signal; worth investigating for the non-Google AI engines).

## 🟢 Strong — keep / no action
- **Architecture wins:** static HTML on Vercel CDN → LCP 291ms, CLS 0.02, TTFB 35ms. Server-rendered content = the 2026 advantage for AI crawlers (per methodology).
- **Schema:** 364 JSON-LD blocks, 0 invalid; 99/116 FAQPage; rating-integrity clean (no cloned AggregateRating).
- **SEO + Accessibility 100; compliance gate green; sitemap fully resolves; alt coverage complete.**

## Methodology notes (what we deliberately did NOT chase)
Per Google's May-2026 guidance, the audit does **not** flag missing `llms.txt`, AI-specific files, or "special AI schema" — Google says those don't affect its AI features, and our research confirmed it. AI-citation readiness here = clean schema + citable FAQ passages + NAP/entity consistency (the brand/NAP cleanup already in flight), **not** AEO gimmicks. The honest caveat: ~60% of AI-Overview citations come from non-top-20 pages and ChatGPT/Perplexity select differently — so off-site presence + structured answers remain the levers for the non-Google engines.

## Suggested fix order
1. Broken links (#1) — quick, includes a real bug. → then `audit-links --strict`.
2. Blog meta + title trim (#3, #4) — mechanical, high page count, real SERP impact.
3. Orphans + dup metas + og:image (#5–7).
4. Thin pages (#2 services, #8 locations) — content work.
5. agentic-browsing tree + console errors (#9) — investigate.

---

## ✅ Fixes applied (2026-06-01, branch `fix/site-audit-2026-06-01`)

**Analyzer correction:** the initial run reported "15 broken metas + 3 duplicate meta groups" — those were a bug in `audit-full-site.mjs` (its regex truncated meta values at internal apostrophes). Fixed the extractor (delimiter-aware + entity-decoded rendered length). **Truth: 0 broken metas, 0 duplicate metas** — the only meta issue was 47 over-length.

**Resolved:**
- 🔴 **17 broken links → 0.** Scoped `audit-links` to served pages (archive/draft noise excluded); fixed real ones: heber-city + sandy blog path bugs (13 links), removed dead `fruit-heights`/`spanish-fork` links. **link-integrity gate flipped to `--strict` blocking.**
- 🟡 **49 over-length titles → 0.** Removed ZIP/year/filler bloat (script) + hand-rewrote 39 to ≤60 rendered chars, keeping city + primary keyword.
- 🟡 **47 over-length metas → 0.** Trimmed to ≤160 at clean boundaries.
- 🟡 **5 missing og:image → 0.** Added relevant existing images (+ twitter:image).
- 🟡 **1 sitemap orphan resolved** (salt-lake-valley blog added). `storm-damage-restoration` already canonicals to `/pages/storm-damage` (correctly de-duped).

**Still open (content / owner decision — not mechanical):**
- 3 thin service pages (`general-contracting` 325w, `solar-installation` 449w, `water-fire-flood-restoration` 492w) — expand to ≥600w.
- 32 location pages < 500 *unique* words — add local detail.
- `pages/about.html` self-canonicals and may duplicate `/about` — owner: keep (add to sitemap) or canonical to `/about`?
- Lighthouse: `label-content-name-mismatch` (a11y), console errors (likely PostHog), agentic-browsing 67 (`agent-accessibility-tree`) — investigate.
- `fruit-heights` + `spanish-fork` are served areas without location pages — candidates for new pages.
