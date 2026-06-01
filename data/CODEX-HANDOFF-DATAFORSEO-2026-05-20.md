# Codex Cross-Audit — DataForSEO Integration Plan v1.0

**From:** Claude (architecture lane, Opus 4.7) · **To:** Codex (cross-audit lane)  
**Date:** 2026-05-20 · **Round:** 1 (manual paste; future revisions via frame-relay)  
**Workflow:** Per `docs/MULTI_LLM_WORKFLOW.md` in cbp — Claude builds plan, Codex audits, Claude reconciles, Ryan implements.

---

## Context for Codex

Ryan is evaluating DataForSEO as a data substrate for:
- **Frame Roofing Utah** (LIVE, Supabase + static HTML, generating leads, 10% commission to Ryan, `aeo_citation_log` measured 0% baseline 2026-05-16 on Gemini for "best roofer Heber City Utah")
- **Frame Restoration TX** (T-7 to 5/27 launch, mirrors Utah stack)
- **BioChargeLabs** (pre-launch, 28 peptides × content, domain flip pending)
- **cbp / Customer Build Platform** (multi-tenant agency SaaS; Track E v0 revenue-attribution tile in design; DataForSEO is the candidate data layer that makes bottom-tier client pricing work at margin)

Existing tooling we're augmenting (not replacing):
- **SerpAPI** — currently used by `aeo-citation-monitor.py` for monthly 5-query sweep + `update-google-reviews.py` for bi-monthly review sync
- **Ahrefs MCP** — backlinks + Brand Radar AI responses (claude_ai_Ahrefs tools)
- **`aeo-citation-tracker` Supabase edge fn** — currently polls Perplexity Sonar + Gemini Flash + Claude Haiku across 20 prompts; **0% Frame citation rate baseline** captured 2026-05-16

Existing wiring partially in place:
- `package.json` script `market-intel:dataforseo` already exists in Frame Utah, pending company-CC top-up
- `~/.env.frame-roofing` is the canonical secrets file (also holds OpenRouter + Supabase service-role keys)

**The 0% AEO citation baseline + cbp's gross-margin math at the $300/mo tier are the two forcing functions for this work.** Plan must serve both.

---

## /innovate research base (2026-05-20)

🟢 cost: $0 (web-only mode)

**Sources:**
- GitHub trending (10 repos): AgriciDaniel/claude-seo 6,829⭐, gbessoni/seobuild-onpage 212⭐, dataforseo/mcp-server-typescript 200⭐ (pushed 2026-05-19), AgriciDaniel/codex-seo 152⭐, zubair-trabzada/dataforseo-claude 75⭐, dataforseo/open-ai-actions 31⭐, agencia-conversion/agentic-seo-skills 19⭐
- Reddit (6 threads, 382 upvotes): r/mcp, r/opencode, r/GoogleAntigravityIDE communities — confirms agentic-SEO + MCP-server wave is the broader pattern
- HN: 0 stories in last 30 days for the query — DataForSEO itself isn't a hot HN topic; the wrappers are
- WebSearch (18 pages): DataForSEO docs, NextGrowth, BuildMVPFast, CostBench, ProxiesSX, G2, Trustpilot, Dataslayer

**Raw research dump:** `~/Documents/Last30Days/dataforseo-api-mcp-server-integration-ai-overview-tracking-raw-v3.md`

---

## 🆕 GENUINELY NEW findings (N≥2 source verified, inversion-checked)

### 1. LLM Mentions API — 200M indexed responses across ChatGPT, Claude, Gemini, Perplexity
- **Source:** [DataForSEO docs](https://docs.dataforseo.com/v3/ai_optimization-llm_mentions-overview/) + [NextGrowth deep-dive review](https://nextgrowth.ai/dataforseo-llm-mentions-api/) + DataForSEO help center
- **What's new:** Distinguishes *citations* (URL linked) from *mentions* (brand named without URL). Replaces the bespoke `aeo-citation-tracker` polling loop with a single API call against a pre-indexed corpus.
- **Inversion:** 2-7 day data freshness lag. Brand-name false-positive risk (Frame Restoration TX cross-resolution). Mitigate by filtering on domain (`frameroofingutah.com`), not brand string.
- **Confidence:** HIGH

### 2. DataForSEO MCP Server (TypeScript) — pushed 2026-05-19
- **Source:** [GitHub repo](https://github.com/dataforseo/mcp-server-typescript) + [official launch page](https://dataforseo.com/update/dataforseo-mcp-server-launch)
- **What's new:** Wraps all 7 major DataForSEO APIs as MCP tools callable from Claude Code / Cursor / Antigravity. 200 stars, official maintainer, active pushes.
- **Inversion:** Async-by-default (returns task ID, you poll or webhook). Fine for cron, awkward for interactive sessions.
- **Confidence:** HIGH

### 3. Agentic-SEO skill ecosystem pre-built on DataForSEO
- **Source:** 5 GitHub repos active in last 30 days totaling 7,287 stars
- **What's new:** AgriciDaniel/claude-seo (6,829⭐, 25 sub-skills + 18 sub-agents) + AgriciDaniel/codex-seo (152⭐, 26 workflows + 24 TOML agents) + zubair-trabzada/dataforseo-claude (75⭐, 13 skills + 5 subagents) + agencia-conversion/agentic-seo-skills (19⭐) all wrap DataForSEO as substrate. Ryan can adopt rather than build.
- **Inversion:** 6.8K stars on a 2-week-old repo is vanity signal; need to read actual sub-skill .md files before adopting.
- **Confidence:** HIGH

### 4. SERP API at $0.0006/query (Standard Queue) — 25× cheaper than SerpAPI
- **Source:** [BuildMVPFast pricing](https://www.buildmvpfast.com/tools/api-pricing-estimator/dataforseo) + [SerpAPI benchmark](https://apiserpent.com/blog/serpapi-vs-dataforseo-benchmark) + DataForSEO official pricing
- **What's new:** Pricing differential is structural. At 30K SERPs/mo DataForSEO is 15× cheaper; at 1M/mo it's $600 vs $5,000+.
- **Inversion:** Standard Queue has ~5-min latency. Live mode at $0.002/query closes the gap at 3× the cost. Credit-burn-on-Live-for-batch is the most-cited operational footgun on G2.
- **Confidence:** HIGH

## 🔄 Iterations
- AI Keyword Data API — LLM-query phrasing volume signal (not Google)
- `load_async_ai_overview=true` flag on SERP API — Google AI Overview parsing
- Local Pack endpoint — structured `place_id` / `rating` / `reviews_count` / `rank_group`

## 🎭 Hype filter (skip)
- DataForSEO as Ahrefs replacement (less comprehensive backlinks index — keep Ahrefs MCP)
- DataForSEO as Semrush replacement (search volume = rebranded Google Keyword Planner; fine for relative ranking, not authoritative)
- AgriciDaniel/claude-seo at 6.8K stars without sub-skill quality audit

---

# Implementation Plan v1.0 (the artifact you're auditing)

## Strategic frame
Three forcing functions: (a) `aeo_citation_log` 0% baseline on 2026-05-16, (b) cbp $300/mo bottom-tier gross margin requires data layer ≤$10/mo per tenant, (c) integration is reversible (PAYG, no contract).

## Phase 0 — Sign-up + endpoint validation (1 hr, this week)
- Sign up on $1 free credit (no card)
- Write `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` to `~/.env.frame-roofing`
- Validate 3 endpoints via curl:
  - `serp/google/organic/live/advanced` with `load_async_ai_overview=true`
  - `serp/google/local_finder/live/advanced`
  - `dataforseo_labs/google/ranked_keywords/live` for `roofingutah.com`
- Estimated spend: $0.006 of trial credit

## Phase 1 — Google AI Overview citation tracking (4 hr, this week)
**Goal:** Close measurement blind spot on the surface that actually drives roofing buyer-intent traffic.

**Schema delta** (new migration `supabase/migrations/20260521_add_aiov_surface_to_citation_log.sql`):
```sql
ALTER TABLE public.aeo_citation_log
  ADD COLUMN IF NOT EXISTS source_engine text;

UPDATE public.aeo_citation_log SET source_engine = COALESCE(source_engine,
  CASE
    WHEN llm_name ILIKE '%chatgpt%'    THEN 'chatgpt'
    WHEN llm_name ILIKE '%claude%'     THEN 'claude'
    WHEN llm_name ILIKE '%gemini%'     THEN 'gemini'
    WHEN llm_name ILIKE '%perplexity%' THEN 'perplexity'
    ELSE 'unknown'
  END);

CREATE INDEX IF NOT EXISTS idx_aeo_citation_log_source_engine
  ON public.aeo_citation_log (source_engine, queried_at DESC);
```

**Endpoint:** `serp/google/organic/live/advanced` with `load_async_ai_overview=true`, `device=mobile`. Live mode chosen because monthly cron runs synchronously inside `aeo-citation-monitor.py` and writes results to a single SQL transaction. Converting to async polling adds complexity for negligible savings (20 × $0.002 = $0.04 vs $0.012 Standard).

**Files touched:** `scripts/aeo-citation-monitor.py` (extend with `fetch_google_ai_overview()`)

**Failure modes covered:** AIO block absent (return `present=False`); API 429/5xx (retry pattern already in script); creds missing (fall back to current loop).

**Cost:** $0.04/mo.

## Phase 2 — LLM Mentions API migration (1 day, this week)
**Goal:** Replace bespoke 3-engine polling loop with single LLM Mentions call.

**Strategy:** 14-day shadow period with feature flag. Both paths write to `aeo_citation_log` (LLM Mentions rows tagged `source_engine='llm_mentions_api'`). Migrate only if hit-rate ≥ 90% of bespoke loop.

**Endpoint:** `ai_optimization/llm_mentions/live` — accepts brand domain + keyword list.

**Files touched:** `supabase/functions/aeo-citation-tracker/index.ts` (add new path, keep old one behind flag)

**Failure modes covered:** 2-7 day freshness lag (fine for monthly cron); brand-name false positives (filter by domain not brand); quota exhaustion (monthly call budget in `app_config`).

**Cost:** $0.02/run × monthly = $0.24/yr.

## Phase 3 — Local Pack rank tracker (1 day, this month)
**Goal:** Bi-weekly rank tracking across 45 cities × 5 services × Frame Utah.

**Schema delta** (new migration `supabase/migrations/20260601_add_local_pack_history.sql`):
```sql
CREATE TABLE IF NOT EXISTS public.local_pack_history (
  id              bigserial PRIMARY KEY,
  measured_at     timestamptz NOT NULL DEFAULT now(),
  keyword         text NOT NULL,
  location        text NOT NULL,
  rank_group      integer,
  place_id        text,
  rating          numeric(2,1),
  reviews_count   integer,
  competitor_rank_1_place_id text,
  competitor_rank_2_place_id text,
  raw_response    jsonb
);
CREATE INDEX IF NOT EXISTS idx_lph_keyword_location_time
  ON public.local_pack_history (keyword, location, measured_at DESC);
```

**Endpoint:** `serp/google/local_finder/live/advanced` (Live mode, 225 calls/run)

**Files touched:**
- New: `scripts/local-pack-tracker.py`
- New: `Library/LaunchAgents/com.ryan.local-pack-tracker.plist` (bi-weekly)
- Extend: `dashboard/dashboard.js` (new tile)

**Cost:** $0.45/run × bi-weekly = $0.90/mo.

**Critical pre-flight:** Pre-validate 45 city `location_name` strings against DataForSEO's location endpoint BEFORE first cron run. Silent garbage-row failure mode otherwise.

## Phase 4 — blog-target-prioritizer keyword-volume enrichment (1 day, this month)
**Goal:** Add real search-volume × competitor-gap signal to `scripts/blog-target-prioritizer.py`.

**Endpoints:**
- `keywords_data/google/search_volume/live` — bulk fetch volume for 675 keywords (45 cities × 5 services × 3 variants). $0.05/call, accepts up to 1000 keywords per call.
- `dataforseo_labs/google/ranked_keywords/live` — top-100 ranking keywords for `roofingutah.com` + `utahroofingcompany.com`. $0.01 × 2 = $0.02.

**Files touched:** `scripts/blog-target-prioritizer.py` (extend `score_target()`); new cache `~/.cache/blog-prioritizer-kw-cache.json` (30d TTL)

**Important caveat:** DataForSEO search volume = Google Keyword Planner rebrand. Fine for relative target prioritization, do NOT cite as authoritative in client reports.

**Cost:** Quarterly refresh = $0.28/yr.

## Phase 5 — Frame TX mirror + BioChargeLabs baseline (3-4 days, this month)
**Frame TX:** Same Phase 1-3 wiring, env-var driven for location strings + domain. Brand-boundary discipline enforced via env vars (no hardcoded "Heber City" or "Utah" in shared code).

**BioChargeLabs:** Pre-launch LLM Mentions baseline only. 28 peptides × 3 intent angles = 84 prompts. Monthly. $0.02/mo.

## Phase 6 — cbp multi-tenant wiring (1 week, this quarter)
**Architecture:** Centralized DataForSEO account, per-tenant `tag` field, per-tenant Supabase isolation.

**Cost projection at 30 cbp clients (mix-weighted):**
- Starter ($300/mo, 10 cities × 3 svc): $1.40/mo data layer cost
- Growth ($800/mo, 25 × 5): $4.85/mo
- Scale ($1500/mo, 50 × 7): $13.50/mo
- Aggregate ~$150/mo at 30 clients, net margin contribution ≈ $25K/mo

**Architecture risk:** Centralized credentials = blast radius. Mitigations: IP allowlist API user to cbp orchestrator's egress IPs, per-tenant daily budget caps in `app_config`, per-tenant `tag` attribution for billing reconciliation.

---

# Self-Audit (Trust-Tier Rubric — 6-tier risk classification)

| Phase | Trust tier | Top risk | Mitigation |
|---|---|---|---|
| 0 | 🟢 GREEN | None | n/a |
| 1 | 🟡 YELLOW | Live-mode cost creep in cron | Billing review after 2 runs |
| 2 | 🟡 YELLOW | LLM Mentions misses Frame citations vs bespoke loop | 14-day shadow with hit-rate gate (extend to 30d if no citations land either path) |
| 3 | 🟡 YELLOW | Location-string silent-garbage failure | Pre-validate 45 strings before first cron |
| 4 | 🟢 GREEN | KP-rebrand volume data | Relative ranking only, not client-facing |
| 5 | 🟡 YELLOW | UT/TX brand cross-leak | Env-var-driven location + domain |
| 6 | 🔴 RED-STRUCTURAL | Centralized creds = 30-tenant blast radius | IP allowlist + budget caps + tag attribution |

No 🔴 RED-BLOCK items.

---

# The 12 Questions for You, Codex

These are the decisions I made under uncertainty. Audit each independently.

**Architecture:**
1. Per-tenant Supabase vs central with `tenant_id` column — at 30+ cbp tenants, does per-tenant Supabase project management break? Should we revisit before Phase 6?
2. DataForSEO's `tag` field — does it surface in the billing API so we can reconstruct per-tenant cost? Need to verify before committing Phase 6 to this attribution model. If not queryable, what's the minimum metering layer we'd need?
3. Live mode vs Standard Queue — cutover at ~225 calls/run feels right for cron use cases but I haven't stress-tested. Is the threshold defensible?

**Failure modes I may have missed:**
4. Google AIO HTML structure changes — DataForSEO parses AIO server-side; if Google changes format, parser breaks silently. What's the failure mode + detection plan?
5. LLM Mentions 2-7 day freshness lag — is there a scenario where Frame's citation rate moves materially within 7 days (viral Reddit thread → fast index)? If yes, we need a real-time fallback.
6. Rate limits — pricing pages don't mention RPS limits. 225 Live calls in a single cron run could be throttled. What's the right pattern: batch with sleep, async queue, or just accept retries?

**Code-shape concerns:**
7. Phase 2 shadow period writes 2× rows. Should I add `shadow_run=true` boolean to filter analytics during 14-day overlap?
8. Phase 1 schema migration's existing-row backfill — embedded in migration (idempotent) or separate one-shot script (safer)?
9. Phase 3 `raw_response jsonb` — at 225 rows × 26 runs/yr × ~50 KB = 290 MB/yr per project. Sample 1-in-10 instead, or 6-month TTL?

**Strategic / scope:**
10. Phase 6 multi-tenant abstraction at 1 cbp tenant — premature? Wait until 5+ tenants exist?
11. AEO Citation Defender idea seed could validate faster than Phase 6 — should we de-prioritize cbp wiring in favor of testing SaaS PMF first?
12. Backlinks "redundant with Ahrefs MCP" judgment — any case where having both DataForSEO + Ahrefs backlinks pays off (independent verification)?

---

# Response format I need from you

**Don't re-plan.** Return:

1. **Audit verdict per phase:** 🟢 ship as-is / 🟡 ship with explicit changes / 🔴 redesign before ship. Cite which trust-tier item or question drives the verdict.
2. **Answers to the 12 questions:** Direct answers, not "depends on..." Where you don't know, say so explicitly.
3. **Missed failure modes:** Specifically what Claude didn't catch. Be ruthless — Claude's known weakness is overconfidence on API behavior it hasn't tested.
4. **Diff to plan:** Concrete proposed changes — schema edits, endpoint swaps, migration ordering — in patch form where possible.
5. **Stop conditions:** What would cause you to recommend NOT proceeding with this integration at all? (If you'd ship it, what's the smallest version you'd ship first?)

Length cap: under 1500 words. Don't pad.

Reconciliation step happens in Claude after your response. Final plan goes to Ryan for Phase 0 execution.

---

# Reference docs (read these if you need more context)

- Frame Utah CLAUDE.md — full project state, schema, tooling already in place
- `~/projects/frame-restoration-utah/data/REVENUE-TILE-DESIGN-2026-05-17.md` — Track E v0 design (DataForSEO local-pack data feeds this)
- `~/Documents/New project/customer-build-platform/docs/MULTI_LLM_WORKFLOW.md` — the workflow contract we're operating under
- This conversation history — `/innovate` pipeline output is in the chat above the plan

---

_End of Codex handoff package. Generated 2026-05-20 by Claude Opus 4.7._
