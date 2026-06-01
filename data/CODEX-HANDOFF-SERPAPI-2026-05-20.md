# Codex Cross-Audit — Frame Utah AEO Tracking, SerpAPI Architecture v1.1

**From:** Claude (architecture lane, Opus 4.7) · **To:** Codex (cross-audit lane)
**Date:** 2026-05-20 · **Round:** 1 (manual paste; revisions via frame-relay)
**Workflow:** Per `docs/MULTI_LLM_WORKFLOW.md` in cbp.
**Supersedes:** `data/CODEX-HANDOFF-DATAFORSEO-2026-05-20.md` (v1.0, no longer the active proposal)

---

## TL;DR for Codex

We were going to subscribe to DataForSEO. Then we discovered Ryan already has a working SerpAPI Free Plan and ran two real validation runs (smoke test + 10-query AIO sweep) that prove the SerpAPI substrate covers Phase 1 of the original plan at $0/mo recurring. The 0% Frame citation baseline measured 2026-05-16 is **fully confirmed** across 7 independent AIO queries. The architecture pivots accordingly.

**You're auditing a smaller, cheaper, evidence-backed plan than v1.0.** The v1.0 DataForSEO plan is parked as a fallback if cbp client count makes SerpAPI Free Plan budget insufficient (~3 clients × current monthly usage = budget pressure). For now we keep what works.

Most important question for you: **am I right that the AEO play and the local-pack play are architecturally separate**, or am I missing a join I should design for?

---

## What changed since v1.0

| Decision | v1.0 (DataForSEO) | v1.1 (this doc) | Reason |
|---|---|---|---|
| Primary SERP/AIO substrate | DataForSEO Live API | **SerpAPI Free Plan** (already wired in `~/.config/frame-roofing-utah/.env`) | Already paying; AIO works on Free; budget fits Phase 1 |
| LLM Mentions substrate | DataForSEO LLM Mentions API | **Existing OpenRouter polling** in `aeo-citation-tracker` edge fn | No migration needed; already running |
| Local Pack substrate | DataForSEO `local_finder` | **Serper** ($5 minimum, $0.30/1000) — DEFERRED to Phase 3 wiring | Saves 4× vs SerpAPI Developer plan upgrade |
| AI Overview parser | DataForSEO `load_async_ai_overview=true` | **SerpAPI inline + `engine=google_ai_overview` async resolver** | Both modes work, confirmed 2026-05-20 |
| Monthly recurring cost | ~$10/mo Frame Utah | **$0/mo Frame Utah, ~$0.14/mo if Phase 3 added** | DataForSEO's $50 min top-up avoided entirely |
| cbp Phase 6 plan | DataForSEO at scale | **Re-evaluate at 3-5 cbp clients; SerpAPI Developer ($75/mo) or self-built on Serper+OpenRouter** | Premature to commit; v1.0 plan parked as fallback |

---

## Evidence (real runs, not theoretical)

### Run 1 — SerpAPI smoke test (2026-05-20, 5 calls)
Script: `~/projects/frame-restoration-utah/scripts/serpapi-smoke-test.py`
Output: `/tmp/serpapi-smoke-*.json`

**Confirmed:**
- Plan = `Free Plan`, 250/mo cap, 245 remaining at run time
- Local Pack endpoint returns clean structure: `position`, `place_id`, `rating`, `reviews`, `address`, `gps_coordinates`, `phone`
- Frame ranks **#3** for "roof replacement Heber City Utah" (Olympus #1, BigHorn #2, Frame #3 with 22 reviews / 5.0★)
- Frame ranks **#1** for "storm damage roof repair Heber City"
- Frame **absent from SLV local pack** for both "roof replacement Salt Lake City" and "storm damage roof repair Salt Lake City"
- Top SLV competitors: Roof Doctor 326 rev, Roof-It 238 rev, EZ Roofing 50 rev, American Roofing 246 rev, Olympus 300 rev (Frame at 22 reviews is 10-15× behind)
- No AIO block returned for "best roofer Heber City Utah" — Google didn't surface AIO for that local-commercial query

### Run 2 — AIO probe (3 informational queries, 3 calls)
**Confirmed:**
- AIO works on Free Plan (no paywall, no gate)
- 3/3 informational queries surfaced AIO
- Two modes: inline (`references` + `text_blocks` populated immediately) and async (`page_token` requires follow-up call to `engine=google_ai_overview`)

### Run 3 — Real Frame Utah AIO sweep (10 queries, 16 calls)
Script: `~/projects/frame-restoration-utah/scripts/aeo-aio-sweep.py`
Output: `~/projects/frame-restoration-utah/data/AEO-AIO-SWEEP-2026-05-20.md` (350 lines, full per-query)

**Headline:**
- **7/10 queries surfaced AIO (70%)**
- **0/7 Frame citation rate** — confirms 2026-05-16 baseline across 7 independent measurements
- Clean architectural split: AIO surfaces on informational queries, NOT on local-commercial queries
- **homerroofing.net cited 5/7 times** — the dominant winner in Frame's market. Studied URL patterns: `/learning-center/{topic}/`, `/pricing`, `/faqs/`
- Sample AIO text format (cost query): "Roof replacement in Utah in 2026 typically ranges from $8,500 to $25,000, with the average standard single-family home costing around $11,000 to $15,000. Costs are driven by your home's square footage, roof pitch, local building snow-load codes, and your choice of material."
- Cost: 16 calls = 6.4% of monthly Free Plan budget

**Per-query AIO surfacing:**

| Query | AIO? | Frame? | Notes |
|---|---|---|---|
| best roofer Heber City Utah | ❌ | n/a | Local-commercial, local pack dominates |
| roof replacement cost Utah 2026 | ✅ async | ❌ | 7 refs, 1 known competitor (roofingutah.com) cited |
| storm damage roofing Park City | ❌ | n/a | Local-commercial |
| Utah roof insurance claim help | ✅ async | ❌ | 11 refs, .gov source (Utah Insurance Dept) present |
| licensed roofer Wasatch Front | ❌ | n/a | Local-commercial |
| how much does a new roof cost in Utah | ✅ inline | ❌ | 14 refs, concrete $ snippet, Frame's cost page absent |
| signs you need a new roof Utah | ✅ async | ❌ | 8 refs |
| is hail damage covered by homeowners insurance Utah | ✅ async | ❌ | 0 refs after async resolve (anomaly) |
| how long does a roof last in Utah climate | ✅ async | ❌ | 11 refs |
| what to do after a storm damages your roof | ✅ async | ❌ | 9 refs |

**Quota status:** 24 calls used this session (smoke + probe + sweep), 226 remaining of 250 for the rest of May.

---

## Architecture v1.1 — phased build (rev'd against the v1.0 phases)

### Phase 0 — DELETE (already done, no DataForSEO sign-up needed)

### Phase 1 — Google AI Overview citation tracking *(unchanged plan, different substrate)*

**Substrate:** SerpAPI Free Plan (existing key in `~/.config/frame-roofing-utah/.env`)
**Cost:** $0/mo recurring · ~16 SerpAPI calls per monthly run · 6.4% of Free Plan quota

**Code:** Already drafted at `~/projects/frame-restoration-utah/scripts/aeo-aio-sweep.py` (300 lines, runs end-to-end). Handles inline + async AIO resolution, writes structured markdown to `data/AEO-AIO-SWEEP-{YYYY-MM-DD}.md`.

**Schema delta (same as v1.0):**
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

**New rows from Phase 1 land with `source_engine='google_ai_overview'`.**

**Cron:** New LaunchAgent `Library/LaunchAgents/com.ryan.frame-roofing-aeo-aio.plist` running monthly (1st of month, 8:23am — mirroring existing `com.ryan.frame-roofing-aeo.plist` cadence).

**Ship sequence:**
1. Run script as-is for 2 more cycles (1st of June, 1st of July) → confirm output stability
2. Add migration to apply `source_engine` column to live DB
3. Extend `aeo-aio-sweep.py` to write rows to `aeo_citation_log` in addition to the markdown report
4. Add LaunchAgent for monthly cron
5. Add tile to `/dashboard` showing AIO surfacing rate + Frame citation rate over time

### Phase 2 — LLM Mentions equivalent *(no migration)*

**Substrate:** Existing `aeo-citation-tracker` Supabase edge fn (OpenRouter polling: Perplexity Sonar + Gemini Flash + Claude Haiku)
**Cost:** ~$0.10/mo OpenRouter at current 20-prompt volume
**Schema delta:** None. Rows continue to land with `source_engine` in (`chatgpt`, `claude`, `gemini`, `perplexity`).

No code changes. Just keep running.

### Phase 3 — Local Pack rank tracking *(substrate change, plan unchanged)*

**Substrate:** **Serper** (`SERPER_API_KEY` to be added to `~/.config/frame-roofing-utah/.env`) — $5 minimum top-up, $0.30/1000 ongoing
**Cost:** $5 one-time + ~$0.14/mo at 45 cities × 5 services bi-weekly = 450 calls/mo
**Why not SerpAPI:** 450 calls/mo × 2 (UT+TX) = 900 calls/mo would consume 360% of SerpAPI Free Plan budget. Upgrading SerpAPI to Developer ($75/mo) is 535× the cost of Serper.

**Schema delta (same as v1.0):**
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

**Pre-flight:** Serper accepts `location` as a string (same UX as SerpAPI's `location` parameter). Pre-validate the 45 city strings against Serper's location autocomplete before first cron run.

**Ship sequence:** Same as v1.0 Phase 3, just swap the API client. Smoke test against Heber + SLC first.

### Phase 4 — Keyword volume enrichment *(deferred)*

**Substrate:** Google Ads API (free with Ryan's existing Google Ads account)
**Cost:** $0
**Status:** Deferred until Phase 1 + 3 are stable. Not blocking.

### Phase 5 — Frame TX + BioChargeLabs mirrors *(unchanged plan)*

Same env-var-driven mirror pattern. Frame TX uses same SerpAPI key + Serper key (centralized for now). BioChargeLabs gets a pre-launch AIO baseline for 28 peptides × 3 angles via OpenRouter polling only (no SerpAPI needed for peptide queries — most AIO surfaces will be too broad).

### Phase 6 — cbp multi-tenant *(architecture decision deferred)*

**Status:** Re-evaluate when cbp client count ≥ 3. At Frame Utah + Frame TX + BioChargeLabs + cbp client #1 = 4 tenants on shared SerpAPI Free Plan budget. Math:
- 4 tenants × ~30 AIO calls/mo = 120 calls/mo (48% of budget) ✓ fits
- 5+ tenants → upgrade to SerpAPI Developer ($75/mo, 5000 calls) OR build self-served on Serper + OpenRouter

**Decision gate** in the v1.0 doc (centralized credentials / per-tenant Supabase / tag-based attribution) — all the structural concerns still apply but trigger only at cbp client #3.

---

## Self-audit (Trust-Tier classification, post-pivot)

| Phase | Trust tier | Top risk | Mitigation |
|---|---|---|---|
| 1 — AIO via SerpAPI | 🟢 GREEN | Quota burn if 20-prompt sweep added without budget check | Hard-cap script at `quota_left > 50` precheck |
| 2 — LLM Mentions via OpenRouter | 🟢 GREEN | None (already in production) | n/a |
| 3 — Local Pack via Serper | 🟡 YELLOW | Schema-shape difference vs DataForSEO's `local_finder` | Smoke-test Serper first, document delta |
| 4 — Keyword via Google Ads API | 🟡 YELLOW | OAuth setup overhead | Defer until needed |
| 5 — Frame TX mirror | 🟡 YELLOW | UT/TX brand cross-leak via shared SerpAPI key | Env-var-driven location + domain, same as v1.0 plan |
| 6 — cbp multi-tenant | 🔴 RED-STRUCTURAL (parked) | Same as v1.0 | n/a until cbp client #3 lands |

**No 🔴-BLOCK items.** The plan is implementable today.

---

## Questions for you, Codex

These are the 8 questions I want your audit to focus on. The previous v1.0 doc had 12 questions; 4 of those (DataForSEO `tag` attribution, per-tenant Supabase at scale, Live-vs-Standard cutover, AgriciDaniel adoption) are now N/A.

### Architecture (where I made the most consequential calls)

1. **AEO and local pack are separate battles — confirm or refute.** v1.1 treats Phase 1 (AIO citation, informational queries) and Phase 3 (local pack rank, commercial queries) as fully independent surfaces with no join required at the data layer. Am I right, or is there a join (e.g., Frame's `phone_clicks.source_page` → AIO citation events) I should design for now to avoid a future migration?

2. **Async AIO resolution counting against quota.** Smoke test showed 16 script-counted calls but only 14 monthly-usage-counted calls — discrepancy of 2. Either SerpAPI counts `engine=google_ai_overview` differently, or there's lazy accounting. **Do you know SerpAPI's exact billing rule for the async AIO follow-up call?** If it's free or half-counted, the Phase 1 budget math is even better. If it counts at 1× and there's an accounting lag, my projection is right.

3. **homerroofing.net being cited 5/7 times** — is this a content-pattern signal worth modeling, or coincidence from a 7-query sample? My instinct says pattern; small sample says caveat. **What's the smallest experiment that would distinguish?** I'm thinking: WebFetch their 3 cited pages, deconstruct H1 + first paragraph + URL slug, compare against Frame's analogous pages, propose 2-3 specific copy edits to Frame's cost page, measure citation rate over the next 30 days. Is that right, or am I over-fitting?

### Code shape / data model

4. **`source_engine` column backfill embedded in migration vs separate script.** Same question as v1.0. I went with embedded; safer would be separate. Your call.

5. **Async resolution failure mode.** Query #8 ("is hail damage covered by homeowners insurance Utah") surfaced AIO but the async resolver returned 0 references. The other 5 async queries returned 8-14 references each. **Is this a SerpAPI bug, a Google bug, or a parser edge case I need to handle?** Worth WebFetch-ing serpapi.com's recent changelog before designing around it?

6. **Markdown report vs DB write.** Phase 1 currently writes a markdown report to disk only — no DB write. Should we add DB write in v1 or keep it disk-only for the first 2 cycles to allow output review? My instinct says disk-only for now, DB writes after we've manually QA'd 2 monthly cycles.

### Strategic / Track E

7. **Track E v0 revenue-attribution tile** — original design (`data/REVENUE-TILE-DESIGN-2026-05-17.md`) assumed source attribution via `phone_clicks.referrer` + `leads.utm_*`. If we land Phase 1, we get a new data point: AIO citation events for Frame. **Should the Track E tile show "first AIO citation date" as a milestone marker, or is that too narrow a signal to surface?** Frame is currently at 0 citations — when the first one lands (e.g., if the cost-page rewrite works), it'll be a notable event.

8. **Stop conditions.** What would cause you to recommend NOT proceeding with the v1.1 plan at all? (If you'd ship it, what's the smallest version you'd ship first?)

---

## Response format I need

Same as v1.0 request:

1. **Audit verdict per phase:** 🟢/🟡/🔴 ship-as-is / ship-with-changes / redesign. Cite which trust-tier item or question drives the verdict.
2. **Answers to the 8 questions.** Direct, not "depends on." Where you don't know, say so.
3. **Missed failure modes** specifically not covered above. Claude's overconfidence on API behavior is the known weakness; lean into that.
4. **Diff to plan** — patch-form schema edits, endpoint swaps, ordering changes.
5. **Stop conditions** (question 8 above).

**Length cap: under 1200 words.** Plan is smaller than v1.0, audit should be smaller too. Don't pad.

---

## Reference artifacts

All on disk, runnable / readable as-is:

- `~/projects/frame-restoration-utah/scripts/serpapi-smoke-test.py` — Run 1 source
- `~/projects/frame-restoration-utah/scripts/aeo-aio-sweep.py` — Run 3 source, production-ready
- `~/projects/frame-restoration-utah/data/AEO-AIO-SWEEP-2026-05-20.md` — Run 3 full report (350 lines)
- `~/projects/frame-restoration-utah/data/CODEX-HANDOFF-DATAFORSEO-2026-05-20.md` — v1.0 doc (parked, not the active proposal)
- `~/projects/frame-restoration-utah/scripts/aeo-citation-monitor.py` — Existing production AEO monitor (5-query SerpAPI sweep, monthly cron) — Phase 1's neighbor
- `~/projects/frame-restoration-utah/supabase/functions/aeo-citation-tracker/index.ts` — *NOT in repo, deployed remote only* — but the source-of-truth for Phase 2's substrate
- `~/.config/frame-roofing-utah/.env` — canonical secrets (SERPAPI_KEY already present)
- `~/projects/frame-restoration-utah/CLAUDE.md` — full Frame Utah state

---

## Reconciliation flow after your audit

1. You return audit in Ryan's Codex terminal
2. Ryan pastes your response back to me in this conversation
3. I reconcile diffs against v1.1, flag disagreements explicitly, emit v1.2 if changes needed (or "ship v1.1 as-is" if your audit clears)
4. If v1.2 is needed → second round via frame-relay (per [feedback_frame_relay_v2_handoff.md](file:///Users/agenticmac/.claude/projects/-Users-agenticmac/memory/feedback_frame_relay_v2_handoff.md) — round-2+ revisions go through frame-relay, not manual paste)
5. Once plan is final → Cowork handoff for the homerroofing.net audit + cost-page rewrite + Phase 1 cron wiring

---

_End of Codex handoff v1.1. Generated 2026-05-20 by Claude Opus 4.7._
