# Utah growth plan — measured 2026-08-07

Every number here was measured, not estimated. Sources: the first live GSC pull via the native SEO
loop (`docs/seo/SEO-LOOP.md`), and read-only DataForSEO SERP / backlink calls. No page was edited
and no public surface was touched in producing it.

**Constraint set by the owner:** reviews are not something this side can influence. This plan
therefore only contains levers we control — content, links, and on-page/technical work.

---

## Where Utah actually stands

**73 clicks / 85,434 impressions** in 28 days (2026-07-08 → 08-04) — a **0.085% CTR**. For scale,
the Texas market runs 0.72% and Idaho 2.21%. Utah has by far the most impressions and the worst
conversion of them.

Clicks by page type (page dimension captures 100% of clicks, so this is exact):

| Page type | Pages | Impressions | Clicks | CTR |
| --- | --- | --- | --- | --- |
| locations | 55 | 58,714 | 13 | **0.02%** |
| /pages/* services | 12 | 22,188 | 2 | 0.01% |
| root + GBP-tagged | 11 | 15,513 | 37 | 0.24% |
| blog | 54 | 3,560 | **21** | **0.59%** |

**Blog converts 29× better per impression than location pages.** It is also the smallest surface.

---

## Why the location pages get no clicks — it is not the pages

Verified on live SERPs, not inferred:

| Query | Local pack | Frame in pack | Frame organic |
| --- | --- | --- | --- |
| roofing heber city ut | yes | **position 3** | **abs #1** |
| roof repair magna ut | yes | not in top 10 | abs #11 |
| roof repair farmington ut | yes | not in top 10 | abs #11 |
| roof repair eagle mountain ut | yes | not in top 10 | abs #10 |
| roof repair midway ut | **no — AI Overview instead** | n/a | abs #8 |

**7 of 8 city-service SERPs put a local pack above every organic result.** Frame appears in the pack
only near Heber City, where the business physically is. Magna, Farmington and Eagle Mountain are
30–60 miles out.

The pages themselves are fine: 2,754 words, Article + FAQPage + City + GeoCoordinates schema,
well-targeted titles, clean crawl (1 intentional noindex, 2 orphans). **There is no on-page defect
to fix, and no title rewrite changes a pack result.**

The decisive proof is in our own blog: `blog/alpine/storm-damage-roof-repair-alpine` ranks at
**position 3.6 with 657 impressions and zero clicks**. A page at position 3–4 should convert 8–15%.
It converts 0% because the pack takes the click. Meanwhile `blog/utah/utah-roof-ventilation-guide`
converts at **2.8%** from position 7.1.

**The variable is query type, not page type.** City + service = blocked. Statewide informational =
converts.

---

## The root constraint: Frame has essentially no legitimate backlinks

All 14 referring domains to `framerestorationutah.com`:

```
anchorurl.cloud   bazerdaily.com   buzzshrink.website   bye.fyi   drjack.world
ggmap.us.com      hostprinter.com  jake.eu             quero.party  ready.pro
screenshots.wiki  urls-shortener.eu  websitelaunches.com  parkcitytoprated.com
```

URL shorteners, screenshot scrapers and "website worth" spam. **Exactly one — `parkcitytoprated.com`
— is plausibly real.** Domain rank is 0.

For contrast, `bigfootroofing.com`, which holds the Eagle Mountain pack, has **124 referring
domains** and rank 151.

This is why the well-titled service pages cannot rank. `pages/roof-repair.html` is titled *"Roof
Repair Utah | Leak & Shingle Repair"* — a textbook match for "roof repair utah" (70/mo) — and sits
at **position 87.7**. Frame is **not in the top 30 for any statewide commercial term**:

| Term | Utah volume | Frame |
| --- | --- | --- |
| roofers utah | 480/mo | not in top 30 |
| roofing companies utah | 320/mo | not in top 30 |
| metal roofing utah | 70/mo | not in top 30 |
| roof repair utah | 70/mo | not in top 30 |

**Do not solve this by copying competitors' links. 98% of their link gap is spam** (`wallpapers.pro`,
`mydeepin.ru`, `australianwebdirectory.shop`, …). Pursuing those is a penalty risk, not a strategy.
Only 7 of 322 gap domains are legitimate.

---

## Market size — what the effort is actually worth

| Segment | Utah volume | Avg CPC |
| --- | --- | --- |
| Commercial ("roofers near me", "roofing companies utah", …) | **5,690/mo** | $44.98 |
| Informational ("how long does a roof last", cost/comparison) | 340/mo | ~$10 |

Commercial is **16.7×** the informational market, and at ~$45 CPC it is where the revenue is. But the
biggest commercial terms are "near me" queries that resolve to the pack.

Note: the two blog posts that actually convert report **zero** exact-match volume, yet earned 982
impressions and 20 clicks. They win on aggregate long-tail. **Do not plan content by head-term
volume** — plan by topic coverage.

---

## Plan

### P1 — Reclaim stranded citations (owner action, small, highest confidence)

The June domain migration left legitimate links pointing at the old host:

- **`bbb.org` → `frameroofingutah.com`.** The homepage claims "BBB A+ Accredited" while the BBB
  listing points at the old domain. Update the listing URL to `https://www.framerestorationutah.com`.
- **`gohebervalley.com` → `frameroofingutah.com`.** Same fix.

These are 2 of the ~3 legitimate links Frame has anywhere. Repointing them is the cheapest real
authority available.

### P2 — Fix the old-domain redirect chain (our action)

`frameroofingutah.com` → **307 temporary** → `www.frameroofingutah.com` → 308 → new domain.

A temporary first hop in a two-hop chain is the weakest way to pass equity, and it is the exact
`redirect-chain` issue our own crawler flags. Make the apex hop a permanent single hop to the final
destination.

### P3 — Earn the legitimate links that exist (owner-gated, we prepare the packet)

Ranked by authority and relevance. **All require owner approval before any submission** — the
standing rule is no directory or citation submissions without it.

1. **GAF contractor directory.** `gaf.com` ranks **#4 for "roofers utah"** — it is both a high-
   authority link and a ranking surface competitors already occupy. Requires GAF certification
   status to be confirmed.
2. **AGC Utah** (`members.agc-utah.org` ranked #9 for "roofing companies utah") — trade association.
3. **Local chambers**: Heber Valley, Wasatch County, Park City. Frame's pack strength is already in
   Heber — these reinforce the area where it genuinely ranks.
4. `expertise.com` "Best Roofers in Salt Lake City" — 4 of 4 competitors have it.
5. `roofingcontractors.org` — 3 of 4 competitors have it.

### P4 — Correct the content mix (our action, ongoing)

**Stop producing `<city> + storm damage` blog posts.** Measured at 0% CTR even from position 3.6.
That format is spending effort into a pack-blocked query class.

**Redirect that effort to statewide informational and comparison content** — the only format on this
site with a demonstrated CTR (1.4–2.8%). Prioritise topics that are also *linkable*, since P3 depends
on having something worth citing: Utah snow-load and ice-dam guidance, insurance/deductible
mechanics, material comparisons with real Utah climate data.

### P5 — Homepage title (our action, run as an experiment)

Current: `Frame Restoration Utah | Mountain-Grade Roofing, Valley-Wide`.

It contains none of the words the commercial market searches — no "roofers", no "roofing company",
no "roof repair". The homepage carries 4,429 impressions at position 16.8 with 9 clicks.

This is a genuine hypothesis, so run it through **`frame-seo-experiment.v1`** with a declared
`surfaceContract`, `keepWhen` and `earliestEvaluationAt` rather than editing it silently — the same
protocol the Allen experiment in the Texas market uses.

---

## What this plan deliberately does not do

- **No new location pages.** 55 exist and produce 13 clicks per 28 days.
- **No rewriting location titles/metas.** They are well-targeted; the constraint sits above them on
  the SERP.
- **No chasing impressions.** `/pages/storm-damage` holds 17,470 impressions (20% of the site) at
  position 21.4 with zero clicks, ranking for permutation queries across 44 tiny localities
  ("leland ut wind and storm damage repair"). Utah's impression count is a vanity number; growing it
  makes CTR worse.
- **No spam directories**, whatever competitors are doing.

## Verification

Re-measure with the daily loop. The numbers to watch are **clicks and CTR by page type**, not
impressions. Blog CTR (0.59%) is the benchmark to pull the rest of the site toward.
