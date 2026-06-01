# Frame Utah — Local SEO / AEO Growth Handoff

> Created 2026-06-01 · ports the DFW `/innovate` findings (run against frame-restoration-texas-v2) to Frame Utah.
> Source of findings: `/innovate "local SEO and AEO for DFW roofing"` — see TX repo. This doc is the Utah-specific action list, written against Utah's **actual** repo state (verified, not assumed).

## TL;DR
Utah is **further along than TX** on systems: live site (`framerestorationutah.com`), `llms.txt` present, all 3 CI workflows ported (compliance-gate, google-reviews-sync, deploy-edge-function), 45+ location pages, and **richer schema than TX** (`RoofingContractor`, `Service`, `Person`, `EducationalOccupationalCredential` vs TX's plain `Organization`). The growth gaps are the same 4 the DFW research surfaced — mostly schema fields + a review/GBP habit, not infrastructure.

Do these in order: (1) per-location review schema, (2) `hasMap`/`sameAs`→GBP schema fields, (3) GBP spam-name audit, (4) GBP engagement SLA. Skip llms.txt polishing.

---

## Verified current state (2026-06-01)

| Thing | TX (frame-restoration-texas-v2) | **Utah (frame-restoration-utah)** |
|---|---|---|
| Live | ✅ framerestoration.com | ✅ framerestorationutah.com (308/307 redirects resolve) |
| Branch in flight | `grapevine-clean` | **`feat/tx-systems-port`** (mid-port; recent rating-integrity fix) |
| Location pages | 46 | 45+ (alpine, american-fork, bluffdale, bountiful, …) |
| Schema base | Organization, FAQPage, Article, GeoCoordinates | **richer**: + RoofingContractor, Service, Person, credentials |
| llms.txt | ✅ 18 KB | ✅ 17.6 KB (May 12) |
| compliance-gate.yml | ✅ | ✅ (re-authored for Utah law) |
| google-reviews-sync.yml | ✅ weekly | ✅ ported (wraps UT's existing scraper) |
| deploy edge function | ✅ TX Supabase | ✅ UT Supabase |
| `areaServed` | 57 files | 93 files ✅ |
| `hasMap` | **0** ❌ | **0** ❌ |
| `sameAs` | 2 (homepage-ish) | **1** ❌ thin |
| `Review` schema | **0** ❌ | **1** ❌ (essentially none) |
| `AggregateRating` | 3 | 6 — ⚠️ **UT just removed 45 cloned AggregateRatings** (commit 816c280, "rating-integrity"). Do NOT reintroduce fake/cloned ratings. |

**Important Utah-specific caveat:** the recent commit `816c280 fix(schema): rating-integrity — remove cloned AggregateRating from 45 location pages` means someone already caught duplicated/fabricated rating markup. The review action below must use **real, per-location review data from the reviews-sync pipeline only** — never clone a sitewide rating onto city pages. This is both a quality and a compliance line (fake reviews/ratings = hard block).

---

## The 4 actions (mirror of the DFW findings, Utah-fitted)

### 1. Per-location Google reviews + `Review`/`AggregateRating` JSON-LD  — THIS WEEK
**Why:** Google AI Overviews now cites *individual* GBP reviews as sources ([DAC, 2026-05](https://www.dacgroup.com/insights/local-search-news/google-ai-overviews-begin-citing-individual-business-profile-reviews/)). Utah has `Review` schema on only 1 page.
**Do:**
- Surface 2–3 **real** city-relevant reviews on each `/locations/*.html`, fed by the existing `google-reviews-sync.yml` output (NOT cloned).
- Add `Review` + a single honest `AggregateRating` per page **only where real per-location data exists**; otherwise omit (respect the 816c280 rating-integrity fix).
- Artifact: location page template + reviews-sync wiring. Accept: Rich Results Test passes on 3 sample cities + `compliance-gate` green. Approval-gate: publish.

### 2. Add `hasMap` + `sameAs`→GBP to Organization/RoofingContractor schema — THIS WEEK
**Why:** these are the exact fields AIO reads for "near me" ([Stridec entity-first guide](https://www.stridec.com/blog/how-to-get-cited-in-google-ai-overviews-guide/)). Utah has `hasMap`=0, `sameAs`=1.
**Do:** add `hasMap` (Google Maps listing URL), `sameAs` (GBP + Yelp + directory URLs), confirm precise `geo` + `openingHoursSpecification`. Quick JSON-LD edit to the shared schema block. Accept: Rich Results Test + manual field check.

### 3. GBP spam-name audit — THIS WEEK (Request input — needs GBP access)
**Why:** Google is suspending listings for keyword-stuffed business names/categories in 2026 ([Sterling Sky local changes](https://www.sterlingsky.ca/google-local-changes/)). Suspension = catastrophic.
**Do:** confirm Utah GBP business name = clean legal name (e.g. "Frame Restoration", not "Frame Restoration Roofing Salt Lake City"), categories not stuffed. 15 min in GBP. **Needs Ryan / GBP login.**

### 4. GBP engagement SLA — THIS MONTH
**Why:** clicks/calls/direction-requests/review-replies are now ranking inputs, not just review count ([Sterling Sky State of Local SEO 2026](https://www.sterlingsky.ca/the-state-of-local-seo-in-2026/)).
**Do:** 24–48h review-reply SLA; confirm GBP call/directions actions tracked. Process change, document in the Utah growth loop.

### SKIP — llms.txt
Evidence says llms.txt does ~nothing for citations ([SE Ranking ~300K-domain study: no significant correlation](https://searchsignal.online/blog/llms-txt-2026); Mueller confirms Google uses it for nothing). Utah already has one — leave it, don't invest more cycles.

---

## Munger inversion (read before acting)
The whole AEO play has one structural risk: **you can win the citation and lose the click** — Seer found organic CTR fell 1.41%→0.64% when AIO shows. So measure **citations + calls**, not sessions. Optimizing purely for blue-link traffic lets AIO quietly eat the funnel while rank "looks fine."

---

## How to run it
```bash
cd ~/projects/frame-restoration-utah
# you're on feat/tx-systems-port — branch from there or continue it
# ship each action through the Utah compliance-gate (same gate as TX, Utah-law-authored)
```
Prefer the `frame-business-loop` skill for build→gate→publish, same as TX. Each action above already names its artifact + acceptance check so it's loop-ready.

## Optional: GSC request-indexing for Utah
TX has a chrome-devtools bridge to the authenticated GSC (see TX memory `frame-tx-chrome-bridge-2026-05-30`). If you want the same request-indexing push for Utah's location/service pages, set up the equivalent bridge against the Utah GSC property — same one-URL-at-a-time method, ~11–14/day quota.
