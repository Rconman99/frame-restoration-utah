# Activity Log

## 2026-08-15 — Google Reviews Sync (FAILED — environment blocks serpapi.com)

**Routine:** Google reviews sync (`scripts/update-google-reviews.py` — check live GBP review count via SerpAPI, update `index.html` + `pages/about.html` + `data/google-reviews.json` if changed, commit + push).

**Outcome:** ❌ Failed at the fetch step, exit code 1. Live review count NOT retrieved this cycle.

**Root cause:** This remote execution environment's network policy blocks SerpAPI outright. The agent proxy answered **403 to CONNECT for `serpapi.com:443`** on both attempts. Confirmed three independent ways: (1) the script's `urllib` call raised `URLError: <urlopen error Tunnel connection failed: 403 Forbidden>`; (2) `curl` to the same host failed with exit 56, `CONNECT tunnel failed, response 403`; (3) `$HTTPS_PROXY/__agentproxy/status` listed two `connect_rejected` entries for `serpapi.com:443` with detail `gateway answered 403 to CONNECT (policy denial or upstream failure)`.

**This is NOT the pre-existing SerpAPI quota problem.** The standing `Restore SerpAPI plan` item (carried since the 7/20–8/03 CTA Liveness failures) is HTTP **429 from SerpAPI** — quota exhaustion, reached after connecting. This failure is HTTP **403 on CONNECT from the proxy** — the request never reaches SerpAPI at all. Restoring the billing plan will not fix this; the two need separate fixes and should not be conflated.

**Actions this run:**
- Exported `SERPAPI_KEY` and ran `python3 scripts/update-google-reviews.py` → exit 1.
- Read `$HTTPS_PROXY/__agentproxy/status` to distinguish a policy denial from a transient upstream failure — found the host explicitly in `recentRelayFailures`.
- Retried once (task rules allow up to two attempts for transient SerpAPI errors) plus a direct `curl` probe; both reproduced the same 403, confirming a hard block rather than flakiness. Stopped there rather than burning further attempts.
- Verified `git status --short` was clean — the script exited before writing, so no file was modified and nothing needed reverting.
- Did **not** commit review data, per the task rule "Never commit if exit code is 1 or 2."
- Sent PushNotification to owner: sync blocked, cause is environment egress policy, count unverified, key exposure flagged.

**Effect on the site:** None. `index.html`, `pages/about.html` and `data/google-reviews.json` are untouched and still serve the last synced value of **34 reviews / 5.0 stars**. The live count is **unverified** for this cycle — it may or may not have moved.

**Secondary finding (security):** The SerpAPI key is embedded in plaintext in this scheduled task's stored prompt, so it is exposed in the transcript of every run. Logged as a high-priority pending action: rotate it, then store it as a secret read at runtime (repo convention is `~/.config/frame-roofing-utah/.env`, already used by `update-google-reviews-cron.sh` and `aeo-citation-monitor.py`) instead of inlining it. The key was deliberately not echoed in any command output during this run.

**Guardrails honored:** no site HTML/schema/copy change; no review-count edit; no GBP action; no edge-function deploy; no migration; no commit of review data; script run at most twice; no file touched outside the state-management files this hook requires.

**Errors this run:** the blocking error above (recorded in `state.json` → `last_error`, scoped to this routine so it is not read as an AEO monitor failure).

**Files touched:**
- `state.json` (added `last_run_google_reviews_sync`; set `last_error`; added 2 pending actions — serpapi.com egress unblock, SerpAPI key rotation. The AEO citation monitor's `last_run`, `score`, `cited_this_cycle`, `still_failing` and threat blocks were deliberately left untouched — a different routine owns those, and overwriting `last_run` would have destroyed its 2026-08-05 record.)
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
