# Texas → Utah Systems Port

**Created:** 2026-05-30 · **Branch:** `feat/tx-systems-port` · **Scope:** Full port (Phases 1–5)
**Source of truth:** `~/projects/frame-restoration-texas-v2` (template-bearer, launched 2026-05-30)
**Target:** `~/projects/frame-restoration-utah` (live, separate market + domain + law)

## Premise

TX v2 was cloned from UT, then gained a systems layer UT never received. This ports those
systems and **adapts the data/law to Utah** — it is NOT a content copy. Utah is *ahead* on
call/SMS edge functions and AEO measurement; those must not be overwritten.

## Hard adaptation constraints

- **Law differs.** TX gate enforces TX Insurance Code §4102.163 (roofers ≠ public adjusters,
  "negotiate" forbidden). **Utah has no §4102.** Utah fence = DOPL contractor licensing +
  Utah's own roofing/insurance advertising rules. `compliance-words.json` is re-authored for UT.
- **Cities differ.** 45 UT cities (Provo, Lehi, SLC…) already have pages. Template/schema
  improvements port; city copy does not.
- **Targets differ.** UT Vercel project `frame-restoration-utah` (prj_zcwGmh7wUxHvqtRoHRmoRp441ePY);
  UT Supabase project ref + GBP place-ID + reviews.json are Utah's own. Public NAP = 435-292-8802.
- **Do NOT touch** UT's `handle-call` / `handle-sms` / `send-message` edge fns, AEO measurement
  scripts (aeo-aio-sweep, serpapi, reddit-scanner, indexnow), `dashboard/`, `build-intelligence/`,
  or the daily CLAUDE.md auto-refresh cron.

## Phases (each ships as its own PR through the new gate)

- [ ] **P0 — Baseline & branch.** ✅ branch created. Confirm UT Supabase ref + GBP place-ID.
- [ ] **P1 — Quality-gate tooling.** Port 8 `scripts/*.mjs` + `compliance-gate.yml`; re-author
      `data/route-factory/compliance-words.json` for Utah law; land advisory-first (no day-1 red-block).
- [ ] **P2 — Schema/rating integrity.** Strip business-wide AggregateRating cloned across 45 UT
      location pages; keep only on canonical home/org entity. JSON-LD gate enforces.
- [ ] **P3 — Reviews automation.** Port `update-google-reviews.mjs` + `google-reviews-sync.yml`,
      repoint to UT GBP place-ID + reviews.json.
- [ ] **P4 — Lead-pipeline hardening.** Port `verify-pin` + `_shared` into UT supabase functions
      (without touching call/SMS/send-message); add `deploy-edge-function.yml` for UT ref; port
      `track-analytics.js`.
- [ ] **P5 — Insurance-claims cornerstone.** Build UT `services/insurance-claims/` modeled on TX,
      rewritten for Utah law (no §4102; Utah hail/wind + DOPL framing). Through the gate before merge.
- [ ] **P6 — Verify & ship.** Live smoke-test on UT sandbox; merge each PR via frame-business-loop.

## Sequencing rationale

Gates first (P1) so every later phase is verified by them. Content (P5) last — only piece needing
fresh Utah-localized copy + legal research.
