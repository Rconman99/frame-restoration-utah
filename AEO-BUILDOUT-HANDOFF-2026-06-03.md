# Frame Utah — AEO Buildout Handoff (2026-06-03)

> The "really build AEO perfect" roadmap. Supersedes the on-page checklist in `AEO-GROWTH-HANDOFF-2026-06-01.md`
> and pairs with `GENAI-REPORT-HANDOFF-2026-06-03.md` (the GSC gen-AI report news).
> Written against **verified Utah state, 2026-06-03**. Companion: `frame-restoration-texas-v2/AEO-BUILDOUT-HANDOFF-2026-06-03.md`.

---

## The thesis (read this first)

On-page AEO is ~done and **it did not move the needle.** Proof from our own data:
- **Utah is cited 1/10** on Perplexity for money queries (only "Heber City") — baseline 2026-06-03.
- Prior `/innovate` run, Ahrefs-verified: **more schema produced no AI-citation uplift.**

Schema, FAQ, `llms.txt`, server-render = **table stakes already paid.** They make Frame *eligible* to be cited; they
don't make Frame *the cited answer.* AI engines cite **consensus across independent, indexed third-party sources.**
Frame has almost none. So the remaining ~80% of AEO gain is **off-page**, not more markup.

**Win condition:** money-query citation count climbs 1/10 → N, tracked weekly.

---

## Verified Utah state (2026-06-03)

| Layer | State | Verdict |
|---|---|---|
| Location pages | 47 | ✅ |
| Base schema (`RoofingContractor`, `Service`, `Person`, `FAQPage`, credentials) | rich | ✅ table stakes paid |
| `robots.txt` AI crawlers + `Google-Extended` | all `Allow` | ✅ keep |
| `llms.txt` | 17.6 KB | ✅ don't touch |
| **`Review` JSON-LD** | 2 / 47 pages | ⬜ in flight (gate `scripts/audit-review-integrity.mjs`, PR #77) |
| `hasMap` / `sameAs` (location pages) | 0 / 47 | ❌ entity-linking gap |
| AI-visibility tracker | ✅ `~/projects/frame-utah-aeo/ai-visibility/` (`check.mjs`, `utah-money-queries.json`, `log.jsonl`, `third-party-targets.md`) | ✅ baseline 1/10 |
| **GBP** | ✅ **healthy (5.0★, reviews 20→27 flowing)** as of 2026-06-03 | ✅ enforcement watch cleared — no appeal needed |

---

## The 4 pillars (priority order)

### Pillar 0 — UNBLOCK GBP — ✅ CLEARED 2026-06-03
**Resolved.** Validated against the live public listing: GBP is healthy (5.0★, **reviews 20→27 — flowing, not held**, open/not suspended). Owner fixed the "Insurance Claim Assistance"/"Free Roof Estimate" services and killed the auto-post that caused the posting violation (moved to manual-Monday). **No reinstatement appeal needed** — nothing is suspended, and a posting strike ages out once the behavior stops. ⇒ **Pillar 3 (review velocity) is now unblocked.**
- *History:* it was on enforcement watch from a reviews-mention post DPNB + adjusting-language services pushed 2026-05-11 (PR #71 scrubbed drafts). That's done.
- *Optional eyeball:* confirm "Insurance Claim Assistance" is gone from the **Services** field (the public page surfaces "insurance claim" — likely a customer review's text, not the service).

### Pillar 1 — Off-page citation substrate (≈80% of remaining gain) — THIS MONTH
AI cites consensus. Build it from `~/projects/frame-utah-aeo/ai-visibility/third-party-targets.md`:
- **Directory saturation** — BBB (✅ A+ 90056184), Angi, Thumbtack, Nextdoor, Yelp, Houzz + **local "best roofer in
  {city}" listicles** for Wasatch-Front cities.
- **Verify each is indexed** (`site:` check) — an unindexed listing is invisible to AI. This is the step everyone skips.
- **Manufacturer installer locators** — CertainTeed + Tamko "find a contractor" pages = high-authority anchors that
  double as `sameAs` targets (feeds Pillar 2).
- **Reddit/forum genuine answers** — r/Utah, r/SaltLakeCity storm/roof threads. Real help, never spam (compliance line).
- *Measure:* third-party indexed mentions count ↑, then citation count ↑ on the tracker.

### Pillar 2 — Entity consistency (makes citations resolve to ONE Frame) — THIS MONTH
Finish `hasMap` (GBP map URL) + `sameAs` [GBP, Facebook, BBB 90056184, DOPL #14256097-5501, CertainTeed/Tamko locators]
on all 47 location pages — **matching the exact NAP used in the Pillar 1 directories.** Inconsistent NAP → AI hedges →
no citation. The schema field is not the point; *cross-source agreement* is.
- *Measure:* hasMap 0→47, sameAs 0→47, NAP identical across site + all directories.

### Pillar 3 — Review velocity (the surface AI quotes) — AFTER Pillar 0
AI Overviews cite *individual* GBP reviews. Flywheel, not a one-off.
- Finish top-10-cities `Review` schema (real reviewers only — gate `audit-review-integrity.mjs`; NEVER `AggregateRating`
  on city pages; single GBP → homepage/About only). Then roll to all 47.
- ⚠️ **Blocked on Pillar 0** — no point driving review asks while GBP holds them.

### Pillar 4 — Measurement loop (so you know what worked) — THIS WEEK
- Turn `~/projects/frame-utah-aeo/ai-visibility/check.mjs` into a **weekly cron** (bridge Chrome :9222).
- Extend it to also count **third-party indexed mentions** (Pillar 1 proxy), not just direct citations.
- *Measure:* `log.jsonl` trend — watch 1/10 climb as Pillars 1–3 land.

---

## Sequenced next actions

**Now (owner):** ✅ GBP cleared 2026-06-03 (reviews flowing 20→27) — Pillars 0+3 unblocked. Next owner move = Pillar 1 directory claims.
**This week:** weekly tracker cron · finish top-10 Review schema (gate live).
**This month:** `hasMap`+`sameAs` × 47 · directory saturation + **index verification** · Reddit genuine-answer presence.
**This quarter:** manufacturer installer-locator listings as `sameAs` anchors · wire US GSC gen-AI report when it lands.

## Don't-do
❌ More schema for its own sake (no uplift). ❌ `llms.txt` polishing. ❌ `AggregateRating` on city pages.
❌ Enable the AI opt-out toggle. ❌ Spam Reddit/directories. ❌ Drive review asks before GBP reinstatement.

## Win metric
Perplexity/AIO money-query citations **1/10 → N**, measured weekly in `frame-utah-aeo/ai-visibility/log.jsonl`.
