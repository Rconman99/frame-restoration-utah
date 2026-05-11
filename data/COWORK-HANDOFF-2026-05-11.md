# Cowork Handoff — Frame Roofing Utah · 2026-05-11 (evening)

> Single-doc pickup for the next Cowork / Claude Code / Ryan-PM session on Frame Roofing Utah.
> Vercelignored via `*.md`. Replaces prior 2026-05-10 handoff as the most-recent canonical state doc.
> Companions still live: `data/SLV-LOCATION-WAVE-TRACKER.md` (active wave state) + `CLAUDE.md` (long-form context).

---

## TL;DR

Session shipped **6 PRs** building on this morning's SLV refocus + afternoon SLV location-page wave. Net: content density GOOD-tier blog count up by 9 (3 waves × 3 pages), schema entity-graph now @id-linked from homepage → Landon Person entity, mobile exit-intent slide-up live sitewide, SLV wave state captured in a dedicated tracker so it stops bloating CLAUDE.md.

Open in-flight: **PR #43 / #44 / #45 / #46 / #48** — all by Ryan-PM, all green Vercel checks, all awaiting human merge approval. Cowork's lane is clear to take Phase B hero swaps on the remaining 5 SLV cities.

---

## What shipped today (chronological, all in main)

### Morning — SLV strategic refocus + flagship + audits (Ryan-PM CLI)
14 commits between 09:04 → 11:03 MDT (`db96579` → `ef749ab`). Already documented in CLAUDE.md → "2026-05-11 (mid-morning)". Key beats: Review Language Audit tool built + run; GBP merchant-profile audit (Products empty, Services misconfigured, Service Area 10 → 20 cities); Heber-Valley-is-ONE-market rule baked; SLV-premium-ZIPs refocus (`c6ce67c`); flagship 3,057-word SLV Premium Roof Replacement Guide shipped with real-Landon Mt. Olympus aerial hero.

### Afternoon — SLV location-page wave Phase A + homepage trust polish + #fresh-aerials + attribution (Ryan-PM CLI)
6 commits between mid-morning → late afternoon. Already documented in CLAUDE.md → "2026-05-11 (afternoon)". Key beats: PRs #37 (hero `fetchpriority` + Holladay alt) + #38 (mid-page navy CTA on all 6 SLV pages) + #40 (#fresh-aerials homepage section) + #41 (hero badge specific-fact rewrite) + #42 (`form_start` analytics) + #39 (gclid/fbclid/utm capture + thank-you redirect). 5 SLV blog Posts #2-6 hero photos pre-staged.

### Evening — density + schema + tracker + mobile-CRO (this Claude Code session)

| PR | Title | State | Notes |
|---|---|---|---|
| **#43** | content density audit script + first Frame UT run | **OPEN** | Vercel checks green. Gating tool for all density work — ready to merge. |
| **#44** | refresh top 3 priority pages (wave 1, 2.66/2.14/2.70 per 200w) | **OPEN** | salt-lake-city/roofing-materials-climate-guide + heber-city/reroofing-complete-guide + park-city/designer-shake-style-shingles |
| **#45** | density refresh wave 2 (next 3 pages) | **OPEN** | salt-lake-city/reroofing-established-neighborhoods + west-jordan/roof-leak-after-rainstorm + salt-lake-city/historic-home-reroofing |
| **#46** | schema entity-graph @id linking + Landon Person enrichment | **OPEN** | index.html Organization @id, BuildZoom sameAs, founder Person @id ref; pages/about.html Person @id, knowsAbout (13), description, hasCredential, worksFor.@id |
| **#47** | density refresh wave 3 — Heber + Sandy + Layton | ✅ **MERGED** | blog/heber-city/seasonal-roof-maintenance (2.93) + blog/sandy/roof-leak-repair-sandy-84070 (2.37) + blog/layton/emergency-roof-tarping (1.60) |
| **#48** | locations: CH hero swap — Mt. Olympus + Wasatch golden-hour | **OPEN** | 9 new image files (3 widths × 3 formats) + 2-line HTML diff on `/locations/cottonwood-heights`. CLEAN/MERGEABLE, Vercel checks green. |
| **#49** | SLV location-wave tracker doc | ✅ **MERGED** | `data/SLV-LOCATION-WAVE-TRACKER.md` — pickup-doc for the remaining 5 hero swaps |
| **#50** | mobile exit-intent slide-up with scroll-reversal trigger | ✅ **MERGED** | global-modal.js +184 lines. Mobile-only (≤820px), one-shot per session, fires on 40% depth + 80px reversal in 600ms. PostHog `exit_intent_*` events. |

**Important:** Ryan-PM CLI's queue showed PRs #43 / #44 / #45 / #46 / #48 as in-flight. None auto-merged because they need a final human review. Cowork should NOT pick any of these up — they're Ryan's review surface.

---

## Open work queue (what's next)

### A) Phase B hero swaps — 5 cities remaining
Pickup doc: **`data/SLV-LOCATION-WAVE-TRACKER.md`** (just shipped, has full state).

Asset state in `/images/projects/cities/`:
- ✅ **Cottonwood Heights** — PR #48 OPEN, awaiting Ryan merge.
- ⏳ **Holladay** — has `holladay-mt-olympus-architectural-install-2026.webp` (blog Post #3 hero, 343 KB). Needs 9-file responsive set (800/1200/1600 × AVIF/WEBP/JPG) before location-page swap.
- ⏳ **Millcreek** — has `millcreek-murray-rambler-reroof-2026.webp` (blog Post #6 hero, 402 KB). Needs responsive set.
- ⏳ **Sandy** — has `sandy-east-bench-architectural-install-2026.webp` (blog Post #5 hero, 516 KB). Needs responsive set.
- 🚫 **Draper** — NO photos staged. Blocked on Ryan Drive pull.
- ⏳ **Salt Lake City** — has `salt-lake-city-east-bench-tearoff-2026.webp` (blog Post #4 hero, 501 KB) AND existing `salt-lake-city-residential-reroof-2026.webp`. Needs responsive set on whichever Cowork picks.

**Two paths for the 4 cities with single-WEBP photos:**
1. **Fastest** — re-encode each existing WEBP into the 9-file responsive set using the same `sips` / cwebp / avifenc pipeline PR #48 used. Source files already in-repo, zero Drive round-trip.
2. **Best** — Ryan pulls fresh per-city Drive photos showing actual Frame work, runs them through the encode pipeline, ships 5 PRs.

PR shape per city should mirror **PR #48**: 2-line HTML diff (img src + og:image), 9 new image files, playbook-recipe 4-clause alt text, no inline styles, `fetchpriority="high"` preserved from PR #37.

### B) SLV blog calendar — Posts #2-#6
Hero photos pre-staged in `b017481` (5 WEBPs in `/images/projects/cities/`). Pipeline ready (PR #24 generator + PR #26 prioritizer). Queue per `c6ce67c`:
1. ~~Post #1 SLV Premium Reroof Guide~~ ✅ SHIPPED (commit `34eb621` + `ef749ab`)
2. Cottonwood Heights mountain-modern aging-home — hero `cottonwood-heights-mountain-modern-reroof-2026.webp`
3. Holladay architectural vs metal Mt. Olympus — hero `holladay-mt-olympus-architectural-install-2026.webp`
4. SLC East Bench historic (Avenues / Federal Heights / Sugarhouse) — hero `salt-lake-city-east-bench-tearoff-2026.webp`
5. Sandy East Bench (Pepperwood / Granite / Alta-foothill) — hero `sandy-east-bench-architectural-install-2026.webp`
6. Millcreek + Murray mid-tier upgrade — hero `millcreek-murray-rambler-reroof-2026.webp`

Cadence target: 1 post/week. Drafting next 5 weeks of SLV content can skip the Drive round-trip entirely.

### C) Carry-forward debt (rolling, still open)

| Item | Age | Notes |
|---|---|---|
| Level-3 AEO `refresh-stale` fixer (`scripts/aeo-fix-refresh-stale.py`) | 4 days uncommitted | Mechanical no-LLM auto-fixer, complements Level-2 internal-link fixer. Race-guarded. No live fires yet — Frame Utah blog posts age into eligibility starting June 2026. |
| `data/audits/` raw Lighthouse JSON commit policy | open | Whether to commit ~1 MB JSONs for trend tracking vs `.gitignore` + commit only rendered summaries. |
| GTM container + `track-attribution.js` site-wide rollout | in flight | `track-attribution.js` shipped in PR #39 + injected into 134 HTML files. Container setup (`data/SETUP-GTM-CONTAINER.md`) still needs Ryan @ GTM console. |
| Formspree (account meeroaqa) retirement | clock 2026-05-10 | Retired in PR d9bd585 (handle-lead v8 → Resend) but account not yet deleted; ~30 days as rollback option. |
| Manual publish of GBP service-area-expansion post | open | `data/GBP-POST-PUBLISH-READY-2026-05-11.md` — needs Landon or Ryan at GBP browser (composer is in a cross-origin iframe, can't auto-publish). |
| GBP Products section still empty | open | Landon photos to add per `data/GBP-AUDIT-2026-05-11.md`. |
| GBP: General Contractor + Gutter Cleaning category decisions | open | Same audit doc. |

### D) Tracking other agents' work
- **Connor + Landon (pair)** — anything new tasked at Frame Restorations goes to the pair. Frame Roofing Utah only — NOT cross-resolved with Frame TX.
- **Cowork Vercel MCP** — token swap via Settings → Connectors → Disconnect/Connect. Not file-editable.

---

## Hard rules carried forward (do NOT violate)

1. **NO drone in marketing.** Landon ruled it out 2026-05-11 (commit `191ef15`). "Aerial drone photograph" OK in alt text; "drone inspection" as a marketed service is forbidden. Applies to GBP Products, GBP Services, RoofingContractor schema services, review-language audit attribute taxonomy.
2. **Heber Valley is ONE market** (commits `37e8d7e` / `cf6c269`). No Midway-only or Wallsburg-only posts. Use the umbrella "Heber Valley" brand.
3. **"Valley" = Salt Lake Valley** in current strategy (commit `c6ce67c`). Heber Valley / Park City / Utah Valley / Davis County are demoted for the current 6-post calendar.
4. **Every GBP post must include a photo.** Text-only GBP posts underperform — never queue or publish text-only (Ryan directive, commit `ec1171e`).
5. **Hours: Mon-Fri 8AM-7PM, Sat 8AM-6PM.** Memory may still say Mon-Sat 8-6 in older docs — corrected hours are canonical (commit `23ae38a`).
6. **TX brand-leak grep clean on every PR.** Filter `framerestorations.com` minus the `landon@framerestorations.com` email (which is the working inbox now per PR #25 override).
7. **og:image filename must match `<img src>` filename.** Playbook Section 11.
8. **Surgical-diff guard** — 2 changed HTML lines per location-page hero swap (img src + og:image only). PR #48 holds the gold-standard pattern.
9. **9 image files per location page hero** — 3 widths × 3 formats. Filename pattern: `{city}-{descriptor}-2026-{800|1200|1600}.{avif|webp|jpg}`.
10. **/leads + /seo-report stay public.** Both are PIN-gated infra with `noindex,nofollow` + `report_access` table check. Do NOT add to `.vercelignore`.
11. **Phone numbers role-separated:** Call = `435-302-4422` (tel: + voice CTA + sticky-call). Text = `435-292-8802` (sms: + SMS-consent surfaces). Never swap.

---

## Key files for next-session pickup

| Purpose | Path |
|---|---|
| Live SLV wave state | `data/SLV-LOCATION-WAVE-TRACKER.md` |
| Today's session log (this doc) | `data/COWORK-HANDOFF-2026-05-11.md` |
| Master long-form context | `CLAUDE.md` |
| Density audit tool | `scripts/content-density-audit.py` (PR #43 OPEN) |
| Density audit output (latest) | `data/content-density-audit-2026-05-11.{md,json}` |
| Mobile exit-intent | `global-modal.js` lines 230-410 (`installExitIntent()`) |
| Booking modal | `global-modal.js` lines 1-230 (`openModal()` / `closeModal()`) |
| Attribution capture | `track-attribution.js` (site-wide, 90d localStorage) |
| Lead handler edge fn | `supabase/functions/handle-lead/index.ts` (v8, Resend) |
| Lead CRM edge fn | `supabase/functions/lead-crm/index.ts` |
| `/leads` CRM page | `leads.html` |
| SLV blog hero assets | `images/projects/cities/{city}-*-2026.webp` |
| Cowork-specific previous handoff | `data/COWORK-HANDOFF-2026-05-10.md` |

---

## Recommended pickup order for next session

1. **If Ryan merged #43 / #44 / #45 / #46 / #48 between sessions** → start with Phase B remaining city hero swaps (Holladay first since it already has a real-Landon Mt. Olympus install photo on disk). Pattern: PR #48.
2. **If still open** → Phase B is blocked on review; switch to SLV blog Post #2 (Cottonwood Heights mountain-modern). Hero asset already staged. Drafting recipe is `scripts/generate-blog-post.py` + `scripts/blog-target-prioritizer.py`.
3. **If both options blocked** → ship the Level-3 `refresh-stale` AEO fixer (`scripts/aeo-fix-refresh-stale.py` already drafted, 4-day-old uncommitted debt). Mechanical, no-LLM, ready to go.

---

## Production verification one-liners

```bash
# All checks should return HTTP/2 200
curl -fsSI https://www.frameroofingutah.com/locations/cottonwood-heights | head -1
curl -fsSI https://www.frameroofingutah.com/blog/heber-city/seasonal-roof-maintenance | head -1
curl -fsSI https://www.frameroofingutah.com/blog/sandy/roof-leak-repair-sandy-84070 | head -1
curl -fsSI https://www.frameroofingutah.com/blog/layton/emergency-roof-tarping | head -1

# Mobile exit-intent should be present in global-modal.js
curl -fsS https://www.frameroofingutah.com/global-modal.js | grep -c "fr-exit-intent"
# Expect: 10+ matches

# SLV tracker doc must NOT ship to production (vercelignored)
curl -fsSI https://www.frameroofingutah.com/data/SLV-LOCATION-WAVE-TRACKER.md | head -1
# Expect: HTTP/2 404
```
