# Activity Log

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
