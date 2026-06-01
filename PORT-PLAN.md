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

- [x] **P0 — Baseline & branch.** Branch `feat/tx-systems-port` created. UT Vercel project confirmed.
- [x] **P1 — Quality-gate tooling.** ✅ PR #59. 6 audit scripts + `compliance-gate.yml`; Utah
      `compliance-words.json` authored from primary-sourced Utah law (§31A-26-201, §13-50-302).
      compliance-words + jsonld BLOCKING (pass clean); links + city-quality advisory.
- [x] **P2 — Schema/rating integrity.** ✅ Stripped cloned `5/20` AggregateRating from all 45 location
      pages (`fix-location-aggregate-rating.mjs --apply`); home/org keeps the one canonical rating.
      jsonld still green. Rating-integrity red-block cleared.
- [x] **P3 — Reviews automation.** ✅ `google-reviews-sync.yml` runs UT's EXISTING proven scraper
      (`scripts/update-google-reviews.py`, SerpAPI) in the cloud instead of a local launchd cron —
      kept UT's logic (no regression), gained cloud scheduling + gate-verify + draft-PR safety.
      ⚠️ **User action:** add repo secret `SERPAPI_KEY` (Settings → Secrets → Actions) to activate;
      workflow skips gracefully until then.
- [x] **P4 — Edge-function CI deploy.** ✅ `deploy-edge-function.yml` (manual-dispatch, ref
      `hdcflshhomzildwqlmwh`, allowlist = UT's 7 functions, same shell-injection hardening as TX).
      ⚠️ **User action:** add repo secret `SUPABASE_ACCESS_TOKEN`. **SCOPE REDUCED after review:**
      `verify-pin` + `_shared` deliberately SKIPPED — verify-pin gates a TX `report_access` table UT
      doesn't have, UT has no PIN flow, and `_shared` would inject an unused parallel utility layer
      (UT functions are standalone). `track-analytics.js` SKIPPED — it's a 404 shim and UT references
      `/track-analytics.js` nowhere. Porting any = TX-specific dead code, not "better work."
      _Note: `supabase/functions/send-message/` is untracked on disk — commit before CI-deploying it._
- [ ] **P5 — Insurance-claims cornerstone.** Build UT `services/insurance-claims/` modeled on TX,
      rewritten for Utah law (no §4102; Utah hail/wind + DOPL framing). Through the gate before merge.
- [ ] **P6 — Verify & ship.** Live smoke-test on UT sandbox; merge each PR via frame-business-loop.

## Backlog (surfaced by the gates — not part of the systems port)

- **Depth:** 32 location pages sit at 474–499 unique words (just under the 500 floor). Differentiation
  + local-substance PASS — these are not doorway pages, just marginally thin. ~1–25 words each to clear.
- **Broken links (17):** per-city service subpages (`/locations/<city>/residential-roofing` etc.) that
  don't exist in UT, missing city pages (`fruit-heights`, `spanish-fork`), a `${item.url}` template
  leak, and a `...` ellipsis. Fix → then flip link-integrity to `--strict` blocking.
- **Saturation:** "insurance claim" / "roof replacement" exceed concentration caps corpus-wide
  (advisory) — redistribute via FAQ schema per the AEO concentration rule.

## Sequencing rationale

Gates first (P1) so every later phase is verified by them. Content (P5) last — only piece needing
fresh Utah-localized copy + legal research.
