# Activity Log

## 2026-09-05 — AEO Citation Monitor (flat score, improving positions, two instrumentation defects found)

**Routine:** AEO citation monitor (5-query core panel: best roofer Heber City / roof replacement cost Utah 2026 / storm damage Park City / Utah roof insurance / licensed roofer Wasatch Front).

**Score:** 2/5 — **flat vs 2026-08-05 on the same instrument**, with both cited positions +1 (Park City 3→2, insurance 4→3). Series on this panel: 1/5 → 0/5 → 2/5 → 2/5.

**Actions this run:**
- Ran WebSearch across all 5 tracked queries; recorded competitors, authority sites, and answer-text snippets per query.
- Attempted Perplexity verification via WebFetch on `https://www.perplexity.ai/search?q=…` — returned `EGRESS_BLOCKED` from the remote container's network proxy on every query. Recorded as **unmeasured**, not as not-cited.
- Diffed competitors against every prior report. **First diff was wrong** — see Corrections below.
- Wrote report `data/aeo-citations/2026-09-05.md`; committed `f6bf616` under `AEO Monitor <aeo-monitor@frameroofingutah.com>`; pushed `76ee52c..f6bf616` to `main` as a fast-forward from lane branch `claude/aeo-citation-monitor-20260905`.
- Sent PushNotification to owner: 2/5, the retired-domain spec defect, the blocked Perplexity channel, and the instrument caveat against reading 2/5 as a decline from 5/12.
- Corrected the report and updated `state.json` + `activity-log.md` in a follow-up commit.

**Headline findings:**
1. 🔴 **The stored task prompt is checking a retired domain.** It still instructs a match on `frameroofingutah.com`, which has 301'd to `www.framerestorationutah.com` since the 2026-06-17 canonical migration (`0ef10e6`). **Both of today's citations landed on the canonical host and would have scored as misses under a literal reading.** Same defect class as the stale `TARGET_DOMAIN` that produced a false 0/5 before `331dc22` fixed it in the scripts — fixed in code, still live in this prompt.
2. 🔴 **Perplexity channel produced zero data** — egress-blocked. Logged as unmeasured specifically to avoid repeating the 2026-08-05 incident, where 12 swallowed SerpAPI 429s were published as a false `0 of 12` and overwrote a real 2/5 report.
3. 🟢 **Both citations are extractive, not just links.** Google's answer text reproduces Frame's own copy nearly verbatim — the Park City elevation/snow-load/I-80-corridor specifics, and the insurance guide's 15-day/30-day Utah Insurance Department timelines plus the deductible-fraud warning. That is the AEO outcome the content moat was built for.
4. 🟢 **Both cited URLs are blog posts**, not service or location pages — the third independent instrument to say so, corroborating the 09-02 sweep (13/13 AIO citations informational, zero local_commercial) and the 09-04 finding. The blog wins AI answers; the 60 location and 15 service pages remain absent.
5. 🟡 **The cost SERP is being colonized by calculators.** Five of nine slots are now tools/aggregators, two of them new this cycle. This reframes why the 2026-05-20 cost-page rewrite (`cdee7de`) never earned its citation — it was competing for a slot increasingly not allocated to contractor pages.
6. ⚠️ **`best roofer Heber City Utah` is not scoreable on this instrument.** It held Local Pack #1 on the 09-01 SerpAPI run; this panel has no local-pack channel and returns ~7 links. Logged as an instrument gap, explicitly **not** as a regression.

**Corrections made this run:**
- An earlier draft of the report claimed **9 new competitors**. The diff was domain-string-based, but prior reports frequently name competitors in prose ("Rooval Roofing", "Crown Roofing Park City") without the domain — producing **6 false positives**. Re-run by company name, the true count is **3** (Lloyd's Quality Roofing, Vanderflip Home, smartroofingcalculator.com), all on the cost query. The report was corrected before the final push. **Standing lesson: diff competitors by NAME as well as domain.**
- The first draft also under-reported the trend by comparing 2/5 against the 12-query SerpAPI panel's 5/12. The valid comparison is against `2026-08-05.md` — same panel, same tool — which shows flat score with both positions improving.

**Guardrails honored:** monitoring-only — no site HTML/schema/copy change; no GBP publish; no edge-function deploy; no migration; no CI-skip token in any commit message; no force-push; no hook bypass. Pushed from a lane-prefixed branch to `main` as a clean fast-forward (HEAD was detached at `origin/main`, 0/0 divergence, no lane-guard hook present in this remote clone).

**Errors this run:** `EGRESS_BLOCKED` on all 5 Perplexity fetches — recorded in `state.json.last_error`, non-blocking, Google-proxy channel unaffected.

**Files touched:**
- `data/aeo-citations/2026-09-05.md` (created, then corrected)
- `state.json` (updated — timestamp, score history 2/5, last_error set, pending_actions rebuilt with the retired-domain fix as highest priority, threats re-diffed to 3 new)
- `activity-log.md` (this entry prepended)

---

## 2026-08-05 — AEO Citation Monitor (FIRST scheduled cron fire + first score improvement)

**Routine:** AEO citation monitor (5-query panel: best roofer Heber City / roof replacement cost Utah 2026 / storm damage Park City / Utah roof insurance / licensed roofer Wasatch Front).

**Score:** 2/5 (up from 0/5 on 2026-07-05, 1/5 on 2026-05-06 — first improvement since monitoring began).

**Milestone:** This is the FIRST-EVER automated scheduled run of `.github/workflows/aeo-citation-monitor.yml` (cron `23 14 5 * *`, fired 2026-08-05 14:23 UTC). Prior reports (2026-05-06, 2026-07-05) were manually dispatched. Today's positive result lands on the first automated fire in project history.

**Actions this run:**
- Ran WebSearch across all 5 tracked queries; recorded top-10 competitors and authority sites per query.
- Attempted Perplexity direct-source verification via WebFetch on `https://www.perplexity.ai/search?q=…` — returned HTTP 403 (auth-gated, same as May and July cycles); fell back to Google web-search proxy.
- Diffed findings against `data/aeo-citations/2026-07-05.md` + `state.json` history to compute deltas per query.
- Wrote report: `data/aeo-citations/2026-08-05.md` (89 lines, structured per spec: score → trend → per-query → threats → actions → meta).
- Committed as `ea01ebc` under `AEO Monitor <aeo-monitor@frameroofingutah.com>` identity.
- Pushed detached-HEAD commit to `origin/main` (`ec69ee6..ea01ebc`) — 1 commit advanced.
- Updated `state.json` with cited URLs, provenance, 8-item pending_actions queue, and 6 new threats.
- Sent PushNotification to owner: 0/5 → 2/5, Park City auto-post + insurance guide cited, action = re-enable `Blog auto-post (Utah)`.

**Headline findings:**
1. 🟢 **Score 0/5 → 2/5.** Frame Restoration Utah is cited on `storm damage roofing Park City` (position #3) via `blog/park-city/storm-damage-roof-repair-park-city` — the AUTO-PUBLISHED post from 2026-06-10 (commit `356a716`, first `[skip-review scheduled post]` cron auto-publish, Blog Bot). AND on `Utah roof insurance claim help` (position #4) via `blog/utah/utah-roof-insurance-claims-guide`.
2. 🟢 **The disabled blog auto-poster just PROVED it produces AIO-citable content.** `Blog auto-post (Utah)` has been `disabled_manually` since 7/20 (5 missed slots, 15 days without a post). Today's monitor confirms one of its outputs is cited in Google AI Overviews. Highest-impact action on the board is re-enabling it.
3. 🟢 **Domain migration fully reflected.** All citations resolve on canonical `www.framerestorationutah.com` — the 2026-06-17 domain migration (`0ef10e6`) is fully indexed by Google end-to-end.
4. 🚨 **Cost-page AIO hypothesis definitively failed** (2nd consecutive scheduled miss). Day +77 post-merge on `cdee7de` (30-day window closed 2026-06-19). Homer Roofing + Sky Ridge Roofing (with a 2026-title-match URL) still own the citation.
5. 🚨 **Heber City still regressed** (same as July). BigHorn Roofing continues to dominate; new competitor R&R Partner Roofing added with a dedicated Heber-slug page.
6. ⚠ **Insurance guide title tag may be brand-stale.** AIO snippet showed "Frame Restoration" not "Frame Restoration Utah" — verify whether Google is display-trimming the suffix or the title tag pre-dates the 2026-06-15 brand transition (`feadbe1`).

**New threats this cycle:**
- R & R Partner Roofing (dedicated Heber-slug page)
- Rooval Roofing (matches Homer's cost URL pattern)
- Sky Ridge Roofing (escalating — 2 queries now)
- Action Roofing (Wasatch Front, "94+ communities" framing)
- Cardinal Roofing (Wasatch Front, 7-county framing)
- RoofingScout aggregator (citation surface acquisition target)

**Guardrails honored:** monitoring-only — no site HTML/schema/copy changes; no GBP publish; no edge-function deploy; no migration; no Landon-facing outreach beyond the notification; SerpAPI intentionally not called (would 429 anyway per the standing 3-cycle exhaustion) — used free WebSearch instead.

**Errors this run:** none (Perplexity 403 was expected and handled with a documented fallback in the report's Meta section, same as May and July).

**Files touched:**
- `data/aeo-citations/2026-08-05.md` (created, 89 lines)
- `state.json` (updated — score 0 → 2, pending_actions rebuilt with re-enable-blog-autopost as highest priority, 6 new threats logged)
- `activity-log.md` (this entry prepended)

---

## 2026-07-05 — AEO Citation Monitor (monthly run)

**Routine:** AEO citation monitor (5-query panel: best roofer Heber City / roof replacement cost Utah 2026 / storm damage Park City / Utah roof insurance / licensed roofer Wasatch Front).

**Score:** 0/5 (down from 1/5 on 2026-05-06 — first zero-baseline captured by this monitor).

**Actions this run:**
- Ran WebSearch across all 5 tracked queries; recorded top-10 competitors and authority sites per query.
- Attempted Perplexity direct-source verification via WebFetch on `https://www.perplexity.ai/search?q=…` — returned HTTP 403 (auth-gated); fell back to Google web-search proxy, which is what AI Overviews synthesize from.
- Diffed findings against `data/aeo-citations/2026-05-06.md` + `_trend.json` to compute deltas per query.
- Wrote report: `data/aeo-citations/2026-07-05.md` (72 lines, structured per spec: score → trend → per-query → threats → actions → meta).
- Committed as `dc99ba0` under `AEO Monitor <aeo-monitor@frameroofingutah.com>` identity.
- Rebased detached-HEAD commit onto `main` (was `4913cde` at push start; now `dc99ba0`).
- Pushed `main` to `origin` — 8 commits total advanced (`4913cde..dc99ba0`), including 7 pre-existing local commits from prior auto-refresh sessions that hadn't been pushed yet.
- Sent PushNotification to owner: 0/5 regression, Heber City Local Pack fall from #1, GBP verification recommended as first check.

**Headline findings:**
1. 🚨 **Heber City regression** — Frame was Local Pack #1 in May, now not in top 10. Suspects: 2026-05-27 GBP primary-phone edit acceptance or reversal, 2026-06-15 brand transition (Frame Roofing Utah → Frame Restoration Utah) triggering GBP re-verification, NAP-directory drift, competitor content push (BigHorn's GAF Master Elite credential).
2. 🚨 **Cost-page AIO hypothesis missed its 30-day window.** `cdee7de` (2026-05-20 structural rewrite of `blog/utah/roof-replacement-cost-utah-2026.html`) targeted first citation by mid-July. It is now July 5; Frame is still not cited. Homer Roofing (the competitor model) still owns the citation.
3. **New competitors on-radar:** BigHorn Roofing (Heber), Crown Roofing Park City (dedicated exact-match domain), M.W. Roofing (targets "Wasatch Front" H1). Persistent: Homer Roofing, roofingutah.com.

**Guardrails honored:** monitoring-only — no site HTML/schema/copy changes; no GBP publish; no edge-function deploy; no migration; no Landon-facing outreach beyond the notification.

**Errors this run:** none (Perplexity 403 was expected and handled with a documented fallback in the report's Meta section).

**Files touched:**
- `data/aeo-citations/2026-07-05.md` (created)
- `state.json` (created — first run of state-management for this container)
- `activity-log.md` (created — first entry)
