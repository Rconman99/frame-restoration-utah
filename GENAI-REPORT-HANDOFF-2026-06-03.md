# Frame Utah — Gen-AI Search Report Handoff (2026-06-03)

> Trigger: Google launched **Search Generative AI performance reports** in Search Console on 2026-06-03
> ([Google Search Central](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports)).
> Source research: `/innovate "GSC gen-AI performance reports … --project frame-restoration-utah --deep"`.
> This doc is written against Utah's **verified repo state on 2026-06-03**, not assumed. Companion: TX has its own
> handoff (`frame-restoration-texas-v2/GENAI-REPORT-HANDOFF-2026-06-03.md`). Builds on `AEO-GROWTH-HANDOFF-2026-06-01.md`.

---

## What changed (the news)

Google now reports, inside Search Console, how your pages appear in **AI Overviews, AI Mode, and generative Discover** —
broken down by **impressions, pages, countries, devices, dates** (down to hourly). Google also began testing an
**opt-out toggle** to block a site's content from AI features.

**Two hard caveats that shape everything below:**
1. **Impressions only — no clicks, no queries/prompts.** You can measure *appearance*, not *traffic*. (@aleyda;
   r/Wordpress top comment: *"I like how there's no click data."*)
2. **UK-only rollout first** (driven by a UK CMA ruling). **Frame Utah (US) cannot open this report in GSC yet.**
   So the play this month is not "read the report" — it's "close the gaps that generate AI impressions + build our own
   measurement + protect the toggle," then plug the report in when it reaches the US.

---

## Verified Utah state (2026-06-03)

| Thing | State | Note |
|---|---|---|
| Live | ✅ frameroofingutah.com | static HTML |
| Location pages | **47** | branch `feat/location-pages-fruit-heights-spanish-fork` in flight |
| `robots.txt` AI crawlers | ✅ `Google-Extended`, `GPTBot`, `ClaudeBot`, `PerplexityBot` all `Allow` | this is what lets Google *ground* AI answers in our content — **keep it** |
| `llms.txt` | ✅ 17.6 KB | do NOT spend cycles polishing (≈zero citation lift) |
| Schema base | ✅ rich: `RoofingContractor`, `Service`, `Person`, `FAQPage`, credentials | ahead of most local competitors |
| **`Review` JSON-LD** | ❌ **2 / 47 pages** | **biggest gap** — AI features cite individual GBP reviews |
| `hasMap` | ❌ **0 / 47** | entity-linking gap |
| `sameAs` (location pages) | ❌ **0 / 47** | entity-linking gap |
| Workflows | ✅ `compliance-gate`, `cta-liveness`, `deploy-edge-function`, `google-reviews-sync` | infra is ready |
| AI-visibility tracker | ❌ **none** | TX has one to port (see below) |
| GSC gen-AI report | ⛔ not available (US) | monitor for US rollout |

**Compliance line (from our own history):** commit `816c280` already removed 45 **cloned** `AggregateRating` blocks.
**Never re-clone a sitewide rating onto city pages.** All review/rating markup must come from real
`google-reviews-sync.yml` data only. Fake/cloned ratings = hard block.

---

## Action plan

### THIS WEEK (by 2026-06-10)

- [ ] **Guardrail — protect AI visibility.** Confirm `frameroofingutah.com` is verified in GSC; confirm the AI opt-out
  toggle is **OFF**; confirm `Google-Extended: Allow` stays in `robots.txt` (currently ✅).
  - *Why:* opting out forfeits 100% of AI impressions for zero ranking benefit.
  - *Accept:* screenshot of GSC AI-settings + `robots.txt` unchanged. *Approval gate:* none.

- [ ] **Stand up the AI-visibility tracker (port from TX).** Copy `~/projects/frame-tx-aeo/ai-visibility/check.mjs` +
  `third-party-targets.md`; swap in Utah money queries (e.g. "roof repair Heber City", "storm damage Salt Lake roofer",
  "metal roof Park City", "hail damage Lehi"). Capture a **baseline** citation count across Perplexity / ChatGPT / AI Overviews.
  - *Why:* this is the **only** AI KPI we can read until the US GSC report ships.
  - *Artifact:* `ai-visibility/check.mjs` + `utah-money-queries.json` + `log.jsonl`. *Accept:* baseline JSON committed.
  - *Measure:* # AI citations / week. *Approval gate:* none.

- [ ] **Per-location `Review` JSON-LD — top 10 traffic cities first.** Generate `Review`/`AggregateRating` from
  `google-reviews-sync.yml` output for the 10 highest-traffic location pages. **Real data only — never clone.**
  - *Why:* #1 AI citation surface; Utah is at 2/47.
  - *Accept:* `compliance-gate.yml` green + Google Rich Results test passes. *Approval gate:* reviews (real-data only).

### THIS MONTH (by 2026-07-03)

- [ ] **Roll `Review` schema to all 47 pages** (real sync data only).
  - *Accept:* compliance-gate + `cta-liveness` green. *Measure:* Review coverage 2 → 47.

- [ ] **Add `hasMap` + `sameAs` sitewide.** `hasMap` = GBP map URL; `sameAs` = [GBP profile, Facebook, BBB profile
  90056184, DOPL #14256097-5501] on every location page.
  - *Why:* entity-linking is what makes AI ground answers in *our* business, not a competitor's.
  - *Measure:* hasMap 0 → 47, sameAs 0 → 47.

- [ ] **Re-frame the dashboard KPI** from "AI clicks" → **AI impression-share + GBP actions + calls**.
  - *Why:* AI gives impressions, not clicks; the money moment is the GBP panel + the phone (435-292-8802).
  - *Artifact:* `dashboard/` KPI tile. *Accept:* tile live.

### THIS QUARTER (by 2026-09-01)

- [ ] **Third-party directory / listicle presence** (the real non-schema AI-visibility lever): get Frame onto
  Wasatch-Front "best roofer" listicles + directories, then verify indexing.
  - *Measure:* appearances in AIO / Perplexity money-query answers (via the tracker).

- [ ] **US rollout integration.** When Google expands the gen-AI report to the US, wire its impressions export into the
  weekly dashboard alongside the manual tracker. *Trigger:* US rollout announcement.

---

## Skip / don't-do
- ❌ Don't enable the AI opt-out toggle.
- ❌ Don't polish `llms.txt` further (≈zero citation lift).
- ❌ Don't clone a sitewide rating onto city pages (compliance + quality block).
- ❌ Don't treat the GSC gen-AI report as actionable today — it's UK-only.

## Re-run trigger
Re-run `/innovate` when Google announces **US rollout** of the gen-AI report — at that point the "manual tracker"
branch collapses into "read the report," and the KPI dashboard gets a real impressions feed.
