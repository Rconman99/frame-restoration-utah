# Frame Restoration Utah — Claude Master Context
> **Operating file only — slimmed 2026-10-17.** CI caps this file at 40,960 bytes (`scripts/audit-claude-md-budget.mjs`, workflow `.github/workflows/claude-md-budget.yml`). The "Last updated" banner chain, the SESSION LOG and the dated status sections were moved **verbatim** to `docs/history/` — read **HISTORY & LOGGING** at the end of this file before adding anything here. Dated session notes never go in this file again.
> **Rule recorded by the 2026-10-05 refresh, not yet folded into CRITICAL RULES below:** "Scope rules changed: 24/7 is valid ONLY for water/flood, emergency tarping and storm response (routine roofing = business hours); remodel claims removed from general-contracting + homepage GC schema." `scripts/validate-slc-identity.mjs` allows only the exact scoped 24/7 phrases.

---

## ⛔ CRITICAL RULES — READ BEFORE ANY EDIT

### DO NOT add false trust claims. These are NOT true:
- **Any BBB letter grade.** The official profile displayed A- when reviewed on
  2026-08-12, superseding the July repository-only conclusion. Publish
  `BBB Accredited` only; ratings are changeable and intentionally not mirrored.
- **NRCA Member** — Frame Roofing is NOT an NRCA member. Never add this.
- **GAF Master Elite / OC Preferred** — Not verified. Do not claim.
- Any certification, membership, or accreditation that hasn't been confirmed by Ryan or Landon.

### These ARE true and can be used:
- Licensed & Insured in Utah
- Free Roof Inspections
- 24/7 Storm Response
- Financing Available
- 10-Year Workmanship Warranty
- BBB Accredited (confirmed by Landon 2026-04-07)

### Phone numbers: ARCHITECTURE FLIPPED 2026-05-27 (commit 2fe52d2) — Twilio number IS now the public NAP
- **Public NAP / display / tel: href / sms: / schema.org / GBP / directories → 435-292-8802** (Twilio A2P 10DLC registered number)
  - **As of 2026-05-27 (commit 2fe52d2, 164 files / 1,341 swaps):** every visible display string AND every `tel:` href now uses 435-292-8802. Display text "(435) 292-8802" and "435-292-8802", `schema.org` `telephone`, `handle-lead` customer-facing auto-reply strings, footer "Call:" line, GBP primary phone, directory listings — ALL point here.
  - **Why the flip:** GBP "Call" button bypasses the website entirely; tracking only worked for clicks that came through the site. Making the Twilio number the public NAP funnels every Google-initiated call (GBP / organic / ads / referral) through `handle-call` → `call_logs` + auto-lead creation, closing the attribution gap.
  - Customer dials 435-292-8802 → Twilio → forwards to Landon's cell (435-302-4422) via `handle-call` TwiML → Landon's phone rings showing the Twilio caller ID. Customer experience unchanged from their side; Landon sees Twilio number on incoming call (already familiar — has been the SMS sending number since 4/24).
  - This is also the number Twilio sends outbound SMS from (10DLC live). Required to be published on site + consent copy + privacy + terms for **TCR (The Campaign Registry) CTA verification** — carriers (T-Mobile/AT&T) reject campaigns that don't disclose the sending number.
  - Appears in: every `tel:` href + every visible display string (2026-05-27); `sms:` links (footer "Text:" line, Contact → Text card on index); SMS consent checkbox copy on hero + contact + modal forms; privacy.html §SMS; terms.html §SMS; `schema.org` `telephone`; `handle-lead` auto-reply copy.
- **Internal-only / forwarding destination / never expose → 435-302-4422** (Landon's direct Verizon cell)
  - **Preserved ONLY as the `LANDON_PHONE` constant** in `supabase/functions/handle-call/index.ts`, `supabase/functions/handle-lead/index.ts`, `supabase/functions/handle-sms/index.ts` — used as the Twilio forwarding destination.
  - **Never put this number on a public surface again.** Not in HTML, not in schema, not in GBP, not in directories, not in customer-facing auto-reply copy. If you find it on a public surface, it's a regression — remove it.
- **⚠️ 2026-08-11 (`0404691`, PR #228) — THE SALT LAKE CITY EXCEPTION IS CANCELLED. Utah is back to ONE public number.** The read-only GBP verification (`qa/SLC-ADOPTION-AUDIT-2026-08-11.md`) proved the live Salt Lake profile is a **service-area business** whose **public phone is 435-292-8802** and which publishes **no storefront address**. `locations/salt-lake-city.html` therefore had its schema `telephone` swapped `+18014620526` → **`+14352928802`**, and its `PostalAddress` (3920 S 1500 E, SLC 84124) + `geo` block **deleted**. **`scripts/validate-slc-identity.mjs` is now a BLOCKING compliance-gate step — re-adding `+18014620526`, `(801) 462-0526`, an `address` or a `geo` to that page will fail CI.**
  - **The SLC GBP tracking DID `+18014620526` is now ORPHANED.** It is still mapped in `supabase/functions/handle-call/index.ts` `NUMBER_SOURCES` as `{ source: "slc_gbp", commission: true }`, but it is published on **no** surface and cannot be re-published without recreating the NAP conflict. **Owner decision owed: release it at Twilio, or accept a paid line with no surface.** Do not "fix" this by putting the 801 back on the page or on the GBP.
  - The `slc_backlink` DID **`+14356108978`** (Contractor ReIndependence campaign) is likewise orphaned — the root `/salt-lake-city` page it lived on was deleted 2026-08-10 (`179b443`, #203). Same decision applies.
- **Companion follow-ups still in progress (carry-forwards from 2026-05-27):**
  - **GBP primary phone edit:** submitted 2026-05-27, pending Google review (24-72h typical). Verify acceptance in GBP merchant panel.
  - **Directory updates:** BBB, Yelp, Apple Maps, etc. need manual NAP updates — checklist tracked in `data/NAP-DIRECTORY-CHECKLIST-2026-05-27.md` (NAP inconsistency across citations = local-pack ranking penalty).
- **Historic context (no longer the active architecture):** From 2026-04-24 → 2026-05-16, 292-8802 was Twilio-only (SMS + selectively published). From 2026-05-16 → 2026-05-27, `tel:` hrefs dialed 292-8802 but visible display still said "302-4422" (split-brain — display ≠ dial). 2026-05-27 unified everything onto 292-8802.

### Before generating or editing ANY page:
1. Read this CLAUDE.md first
2. Do NOT invent certifications, awards, or memberships
3. Do NOT re-add things that were previously removed
4. If unsure whether a claim is true, ASK — don't guess

### 2026-05-11 directives (active rules — do NOT violate):
- **NO DRONE in marketing.** Landon ruled it out 2026-05-11 (commit 191ef15). Drone inspection is NOT a marketed service. Do not list under GBP Products, GBP Services, Roofing Contractor services-to-add, or in the review-language audit attribute taxonomy. Existing aerial drone *photography* (homepage video, hero shots) is fine — what's banned is "drone inspection" as a service offering.
- **Heber Valley is ONE market** (commits 37e8d7e / cf6c269). Heber City + Midway + Wallsburg + Charleston + Daniel = same elevation (5,600+ ft), same snowload, same drive radius. Do NOT fragment content into Midway-only or Wallsburg-only posts. Use the umbrella "Heber Valley" brand. Existing `/blog/heber-city/` posts stay (already indexed) but cross-link UP to any future `/blog/heber-valley/` umbrella content.
- **"Valley" = Salt Lake Valley** (commit c6ce67c). Ryan clarified 2026-05-11: when current strategy says "focus on the valley," that means **Salt Lake City + surrounding premium ZIPs** — 84093/84121 (Cottonwood Heights), 84117/84121/84124 (Holladay), 84106/84109 (Millcreek east), 84092/84094 (Sandy east bench), 84020 (Draper east bench), 84102/84103/84105/84108 (SLC east bench). Heber Valley / Park City / Utah Valley / Davis County are **demoted** for the current 6-post calendar — Frame already has visibility in those markets.
- **Every GBP post must include a photo** (Ryan directive 2026-05-11, commit ec1171e). Text-only GBP posts underperform on Frame's profile — never queue or publish text-only.
- **🚫 NEVER auto-publish to Google Business Profile — owner-manual-publish ONLY** (Ryan directive 2026-06-08). An auto-published post that mentioned reviews/stars (a DPNB violation) is what put Frame's GBP on enforcement watch (cleared 2026-06-03 — do not earn another). **No Claude session, "Auto-Refresh" agent, scheduled job, cron, or browser automation (incl. the `:9222` bridge / Claude-in-Chrome) may publish, schedule, or submit ANY GBP post, update, offer, event, or service.** Drafting/queueing copy into `data/GBP-*.md` is allowed; *publishing* is a human (Landon) action at business.google.com only. Every queued draft must first pass `node scripts/audit-gbp-copy.mjs` (the gbp-copy gate — blocks adjusting language, "Free"/promo service names, reviews/stars solicitation, internal-phone leaks). If you are an automated/unattended run and a task implies pushing anything live to GBP, **STOP and leave it for owner review** — never click Publish/Submit on the merchant panel.
- **Hours have changed.** Memory and any older docs may say Mon–Sat 8AM–6PM — actual hours are **Mon–Fri 8AM–7PM, Sat 8AM–6PM**. Use the corrected hours.

## PEOPLE

- **Ryan Conwell** (ryanconwell99@gmail.com) — manages site, SEO, gets 10% commission on leads. Intermediate vibe coder using Claude Code, Cowork, Antigravity, and Google models. Also an Enterprise Platform AE at his day job.
- **Landon Yokers** (landon@framerestorations.com) — business owner. Wants leads via email + SMS to 435-302-4422 (his direct number, Verizon — internal forwarding destination only, no longer public NAP as of 2026-05-27).
- **Business:** Frame Restoration Utah LLC, DBA Frame Roofing Utah
- **Address:** 142 S Main St, Heber City, UT 84032
- **Business phone (public NAP):** 435-292-8802 (Twilio tracking number — flipped from 302-4422 on 2026-05-27 via commit 2fe52d2; see CRITICAL RULES Phone numbers section for full rationale)
- **Hours:** Mon–Fri 8AM–7PM, Sat 8AM–6PM (corrected 2026-05-11 from live GBP merchant panel — site schema + thank-you copy fixed in commit 23ae38a; was Mon–Sat 8AM–6PM)
- **Utah DOPL license #:** 14256097-5501 (in GBP description, canonicalized 2026-05-11)
- **GBP merchant profile ID:** 9902208163385139295
- **Email:** landon@framerestorations.com (Ryan override 2026-05-09 — info@framerestorationutah.com was never set up to receive mail, so leads were dying. Accepted Texas-brand cross-resolution risk in exchange for working inbox. NEVER use sales@framerestorations.com — that one was swept out 2026-04-22 for the same Frisco TX cross-resolution reason.)
- **Company entity (Vercel billing):** Acme Inc.

---

## DOMAINS & HOSTING

### Production (Landon's Vercel)
- **Live URL (canonical as of 2026-06-17):** https://www.framerestorationutah.com — **CANONICAL DOMAIN MIGRATED 2026-06-17** (`0ef10e6` + merge `e2a74fe`). The old `frameroofingutah.com` / `www.frameroofingutah.com` now 301-redirect HERE (was the reverse). All on-page canonical/og/twitter/schema/sitemap/robots reference `www.framerestorationutah.com`.
- **Vercel account:** landon-4824s-projects (Ryan is admin)
- **Deploys from:** GitHub repo Rconman99/frame-restoration-utah, main branch
- **Auto-deploys:** YES — every git push to main triggers production deploy

### Sandbox (Ryan's Vercel)
- **Team:** Ryan's projects (team_YY9hStNZc86Fgkf5Sin8Z0V0)
- **Project ID:** prj_zcwGmh7wUxHvqtRoHRmoRp441ePY
- **Domains:** framerestorationutah.com / www.framerestorationutah.com (**NOW the canonical production domain as of the 2026-06-17 migration** — confirm which Vercel project serves it on prod), frame-restoration-utah.vercel.app
- **Use:** Testing new ideas, sandbox builds. NOT the live production site.
- **Design sandbox branch:** `design-refresh`

### Important Domain Notes
- **www.framerestorationutah.com = CANONICAL PRODUCTION as of 2026-06-17** (domain migration `0ef10e6` + merge `e2a74fe`). All in-repo canonical/OG/Twitter/schema/sitemap/robots reference it.
- frameroofingutah.com + www.frameroofingutah.com = OLD domain — now **301-redirect TO www.framerestorationutah.com** (`vercel.json` redirects flipped 2026-06-17; this REVERSES the prior 2026-03-30 forwarding that pointed framerestorationutah.com → frameroofingutah.com).
- ⚠️ CONFIRM which Vercel project serves www.framerestorationutah.com on prod (the migration's merge gate required it to serve 200 to avoid a redirect loop). Edge-function email senders (`RESEND_FROM_*`) were intentionally NOT migrated — still on the old domain.
- framerestorations.com = TEXAS Squarespace site (Landon's other market, Frisco TX) — causes SEO brand confusion. We do NOT control this.
- All canonical URLs, OG tags, and schema in the codebase now reference www.framerestorationutah.com (was www.frameroofingutah.com until the 2026-06-17 migration)

### GitHub
- **Repo:** https://github.com/Rconman99/frame-restoration-utah
- **Branch:** main = production
- **Connected to BOTH Vercel accounts** — pushing to main deploys to both Landon's (production) and Ryan's (sandbox)

### Vercel MCP Access
- The Vercel MCP token only authenticates to Ryan's team (team_YY9hStNZc86Fgkf5Sin8Z0V0)
- Cannot see/manage Landon's Vercel project via MCP — but git push auto-deploys there
- Ryan's other Vercel projects: tradeworker-site, listingkit, template, taylor-creek, theology-app, conwell-agentic-seo, rc-digital, taylor-creek-site

---

## TECH STACK

- **Frontend:** Static HTML site (NOT React/Next.js — plain HTML files)
- **Hosting:** Vercel (static deployment)
- **Backend:** Supabase (lead handling)
- **Styling:** global.css (shared across all pages)
- **JS:** global-modal.js (booking form modal)
- **Config:** vercel.json (cleanUrls, security headers, caching, redirects)

---

## SITE STRUCTURE & KEY FILES

Compact, undated map verified against the tree on 2026-10-17. The long per-file changelog that used to sit here ("SITE STRUCTURE … as of 2026-04-22" + "Key Files") is archived verbatim in `docs/history/CLAUDE-STATUS-SNAPSHOT-2026-10-05.md`. Counts drift — `ls` before you quote one.

- `/` — `index.html` (homepage), `services.html`, `privacy.html`, `terms.html`, `thank-you.html`, `404.html`; `review.html` (review landing at `/review`); `leads.html` (PIN-gated CRM at `/leads`); `seo-report.html` (PIN-gated tracker at `/seo-report`); `directory-blitz-tool.html` + `directory-tracker.html` (Landon-shared tools); `google054d522a8c2d926c.html` (Search Console verification — must stay deployed). Internal root HTML (`Frame-*.html`, `Landon-Action-Items-*.html`, `seo-audit-*.html`, `hero.html`, `index-redesign.html`, `google-maps-pins.html`, `backlink-playbook.html`) is listed in `.vercelignore`.
- `/pages/` — service and utility pages: about, contact, gallery, residential-roofing, commercial-roofing, roof-repair, roof-replacement, storm-damage, emergency-tarping, gutters, siding, solar-installation, insurance-claims, general-contracting, water-damage-restoration, flood-cleanup, fire-damage-restoration, mold-remediation, water-fire-flood-restoration, licensed-roofer-wasatch-front.
- `/locations/` — one `<city>.html` per Wasatch Front city plus `/locations/<city>/<service>.html` child pages for cottonwood-heights, draper, heber-city, holladay, midvale, millcreek, murray, orem, provo, salt-lake-city, sandy, south-jordan, west-jordan. `locations/salt-lake-city.html` is bound to a separately verified service-area GBP identity — see CRITICAL RULES and `scripts/validate-slc-identity.mjs`.
- `/blog/` — `blog/index.html` plus posts in per-city folders, `blog/utah/` (statewide) and `blog/salt-lake-valley/` (valley umbrella). Heber Valley is ONE market (CRITICAL RULES).
- `/projects/` — case studies (`heber-valley-roof.html`). `/previews/city-pages/` — noindex Multi-City Page Generator artifacts, never linked publicly.
- `/dashboard/` — client dashboard module (`index.html`, `config.js`, `dashboard.js`, `safe-html.js`). `/api/pagespeed.js` — Vercel serverless proxy for PageSpeed Insights (key read from env, never committed).
- `/supabase/` — edge-function source of truth: `functions/handle-lead`, `handle-sms`, `handle-call`, `lead-crm`, `review-request`, `send-message`, `outbound-call`, `inbound-media`, `track-click`, `weekly-report`, `lead-notification-worker`, `resend-webhook`, shared code in `functions/_shared/`; plus `migrations/`, `migration-baselines/`, `probe-templates/`, `cutovers/`, `tests/`. Runbooks: `functions/{handle-lead,handle-sms,handle-call}/DEPLOY.md`; dashboard / intake / CRM deploys are receipt-gated in `compliance-gate.yml`.
- `/scripts/` — the gates (`audit-*.mjs`, `validate-*.mjs`, `test-*.mjs`), the SEO loop (`seo-crawl`, `seo-snapshot`, `seo-diff`, `lib/gsc.mjs`), the DataForSEO rank tracker, the blog generator/publisher (Python), the SLV sync scripts. Entry points are the `audit:*` / `test:*` / `sync:*` / `blog:*` scripts in `package.json`.
- `/.github/workflows/` — `compliance-gate.yml` (the blocking PR gate, one job per audit script; its source is digest-pinned by `scripts/audit-client-ip-probe-contract.mjs`, so editing it means re-blessing `scripts/client-ip-probe-audit-trusted.json`), `claude-md-budget.yml` (this file's size gate), `lane-guard.yml` (branch must start with `claude/`, `codex/`, `cowork/`, `agy/` or `human/`), `rank-recovery-ci.yml`, `voice-screening.yml`, `seo-quality-checks.yml` (advisory), `slv-city-integrity.yml`, `slv-city-goal-program.yml`, the scheduled loops (`seo-loop.yml`, `rank-tracker.yml`, `blog-autopost.yml`, `blog-traction.yml`, `google-reviews-sync.yml`, `review-request-daily.yml`, `lead-notification-worker.yml`, `cta-liveness.yml`, `aeo-aio-sweep.yml`, `aeo-citation-monitor.yml`, `slv-consumer-ai-import.yml`), the manual baselines (`slv-expansion-baseline.yml`, `slv-review-baseline.yml`) and `deploy-edge-function.yml` (the only approved deploy path).
- `/data/` — internal data, default-denied from deploy by `.vercelignore` (`data/*`) except `data/blog-traction.json` and `data/blog-quality-benchmark.json`. `data/route-factory/business.json` = NAP / brand / GBP source of truth; `compliance-words.json` + `UTAH-COMPLIANCE-LAW.md` = forbidden-word dictionary; `claim-registry.json` = verified claims; `gbp-copy.json` + `data/GBP-*.md` = GBP draft copy (owner-manual-publish only). Also `data/seo/` (loop snapshots), `data/rank-tracker/`, `data/aeo/`, `data/aeo-citations/`, `data/authority/`, `data/blog-briefs/`, `data/blog-published/`, `data/raw/`, `data/seo-experiments/`, and `data/MARKETING-BUILD-CONTEXT.md` (marketing entry point).
- `/docs/` — `docs/seo/` (`SEO-LOOP.md`, `UTAH-GROWTH-PLAN.md`, `UTAH-GROWTH-OPERATIONS.md`, `GROWTH-FOLLOWTHROUGH-2026-09-18.md`), the hail-campaign and SLC docs, and `docs/history/` (this file's archived history).
- `/qa/` — surface contracts (`surface-contract.*.json`), `receipts/`, `runtime-contracts/`, `screenshots/`, `SLC-ADOPTION-AUDIT-2026-08-11.md`, `CITY-PAGE-GENERATOR-SLC.md`. `/tests/` — Python tests (`test_provider_workflows.py` runs in the gate). `/build-intelligence/` — shared build-intelligence adapter (see `AGENTS.md`). `/archive/`, `/screenshots/`, `/images/` (incl. `images/brand-source/`), `/assets/` (hero video/poster, fonts), `/vendor/` (tippy, popper).

### Key files
- `vercel.json` — cleanUrls, security headers + CSP, caching, redirects (old `frameroofingutah.com` → `www.framerestorationutah.com`). `.vercelignore` — the deploy exclusion list; read its header before adding anything (three incidents came from over-ignoring).
- `sitemap.xml`, `robots.txt`, `llms.txt`, `manifest.json` — public crawl surface; sitemap asset integrity and public-surface drift are gated.
- `global.css`, `global-critical.css`, `global-modal.js` (booking modal → `handle-lead`) — shared assets whose immutable versions are pinned by `scripts/sync-shared-asset-versions.mjs --check`; `ga4-loader.js`, `posthog-loader.js`, `track-attribution.js`, `track-clicks.js`, `hail-campaign.css`, `hail-guide-context.js` — the other site-wide loaders and trackers.
- `reviews.json` — live Google-reviews feed fetched by the homepage carousel (PUBLIC; never ignore it). `data/reviews-full.json` — full sync output (internal).
- `state.json` + `activity-log.md` — AEO citation-monitor run state written by automation; never hand-edit or commit them from a lane.
- `AGENTS.md` — build-intelligence adapter instructions for Codex/AI builders. `CONTINUE-FROM-HERE.md`, `PORT-PLAN.md`, `DASHBOARD-SECURITY-CHECKLIST.md`, `*-HANDOFF-*.md` — internal docs, never deployed.
- `package.json` — every `audit:*`, `test:*`, `sync:*`, `blog:*` entry point. `CLAUDE.md` — this file (≤ 40,960 bytes, gated).

---

## LEAD PIPELINE (Supabase)

- **Project:** frame-roofing-utah (ID: hdcflshhomzildwqlmwh, region: us-west-1)
- **Edge function:** `handle-lead` **v8** (PR d9bd585, 2026-05-10) — receives JSON form submissions, saves to DB, emails via **Resend** (replaces Formspree as of v8), sends SMS via Verizon email-to-SMS gateway + Twilio (parallel). v7 added OpenRouter / Gemini 2.0 Flash tier classifier (emergency / urgent / scheduled / general / spam routing); v8 swaps the email backend.
- **Edge function:** `lead-crm` **v6 as of 2026-05-16 (1b95df5)** — PIN-gated reads + writes for the `/leads` CRM page; auth mirrors `weekly-report` (key=`frame-roofing-2026` + per-user PIN against `report_access` table — existing PINs work unchanged). v6 adds the 8 post-won lifecycle fields to LIST + UPDATE (deposit_received_at/deposit_amount/install_scheduled_for/job_started_at/job_completed_at/balance_due/contract_url/warranty_doc_url/product). v5 added `?action=clicks` + `action=create`. Source at `supabase/functions/lead-crm/index.ts`.
- **Edge function:** `handle-call` **v2 as of 2026-05-16 (8a8063f)** — Twilio inbound voice webhook. v2 auto-creates a `leads` row for any unknown caller (`source_page=inbound-call`, `tier=general`, normalizes phone to E.164, 90-day dedupe against `leads.phone`), stamps `call_logs.lead_id` so the CRM can show the call thread on the lead detail. Closes audit gap #3. **Hardened 2026-06-08 (PRs #82/#87):** now validates `X-Twilio-Signature` via `_shared/twilio-verify.ts` (rejects forged webhooks), idempotent via `processed_webhooks`/`claimWebhook()` (Twilio retries can't double-process), `.or()` query-injection fixed, proper `CallSid` dedupe. **v3 as of 2026-06-16 (`dc4e63a`, Phase 0 spam-call screening):** inbound calls now route 3 ways — `blocked_callers`-table match → polite hangup (no ring / no lead); Utah area code (801/385/435) → ring through; else (out-of-state / no caller-ID) → `<Gather>` "press 1" human-gate (press 1 → lead + ring Landon; no input → voicemail, NO lead). Lead creation for screened calls deferred to `/connect`; blocklist + gate both FAIL OPEN. Adds per-number commission attribution via the `NUMBER_SOURCES` map + new `leads.call_source` / `leads.commission_eligible` cols + the `blocked_callers` table (migrations `20260616_blocked_callers.sql` / `20260617_lead_call_source.sql`). **Apply both migrations BEFORE deploying; owner-manual edge-fn deploy still pending.** **2026-07-01 (`5aa0384`):** `NUMBER_SOURCES` extended with the SLC backlink DID `+14356108978` → `source='slc_backlink'` / commission-eligible (vendor Contractor ReIndependence forwards (435) 610-7699 into this Twilio DID). Code-only, no new migration — **but still requires `supabase functions deploy handle-call` to take effect (owner action owed, queued not live).**
- **Edge function:** `handle-sms` **v5 as of 2026-05-16 (8a8063f)** — Twilio inbound SMS webhook. v5 mirrors handle-call behavior: first inbound SMS from an unknown number auto-creates a lead with the message body captured as `leads.message` (so Ryan sees customer intent immediately). Skips messages from Landon (operator commands). 7 historic inbound contacts (6 calls + 1 SMS) backfilled; cold-pitch SEO solicitation +18333380180 auto-classified spam. **Hardened 2026-06-08 (PRs #82/#84/#85):** `X-Twilio-Signature` HMAC validation (`_shared/twilio-verify.ts`), webhook idempotency (`processed_webhooks`/`claimWebhook()`), A2P STOP/UNSUBSCRIBE opt-out, sticky-TTL conversation routing, `.or()` query-injection fix.
- **Edge function:** `outbound-call` **NEW 2026-06-08 (`858b727`, PR #86; deploy-allowlisted via PR #88)** — hardened outbound-call origination (click-to-call / callback), 106 lines, source at `supabase/functions/outbound-call/index.ts`. Part of the TX→UT relay parity port.
- **Shared module:** `_shared/twilio-verify.ts` **NEW 2026-06-08 (`014edca`, PR #82)** — Twilio request-signature (`X-Twilio-Signature`) HMAC validation used by `handle-call`/`handle-sms`/`outbound-call`; needs `TWILIO_AUTH_TOKEN` secret. Closes a CRITICAL spoofable-webhook hole.
- **Edge function:** `review-request` **v2 as of 2026-05-16 (1b95df5)** — daily cron, was previously DOA filtering on `status='completed'` (impossible — nothing set that value). v2 now filters on `status='won' AND job_completed_at IS NOT NULL +3d`. Verified GET returns "No review requests due" cleanly with the new query shape. Closes audit gap #7.
- **Edge functions:** `reddit-aeo-classifier` + `reddit-aeo-digest` **NEW 2026-05-16 (c957cfe)** — LLM-powered multi-class classifier (gemini-2.0-flash) inspired by the xai-org x-algorithm Phoenix multi-action-prediction pattern. Predicts independent probabilities per axis (`p_utah_lead`/`p_aeo`/`p_competitor`/`p_storm`/`p_spam`), weighted-sum into `aeo_score`. Digest fn produces sms/markdown/json/html formats. Reclassified all **254 historic reddit_signals rows**: before 0 leads / 254 noise (0 actionable); after 6 utah_lead + 55 aeo_opportunity + 3 competitor_intel + 1 storm_signal + 150 noise + 39 spam (65 actionable).
- **Edge functions:** `youtube-script-drafter` + `aeo-master-digest` + `aeo-citation-tracker` **NEW 2026-05-16 evening (9467596)** — the unified 8-surface AEO distribution stack. `youtube-script-drafter` converts a Frame pillar/spoke URL into a 60-90s Landon-voice video brief (hook + talking points + shot list + voiceover + hashtags + thumbnail idea + YouTube description); **18 scripts already drafted** from the storm-chaser pillar + 13 spokes and queued. `aeo-master-digest` replaces the reddit-only digest — pulls top-per-surface picks across `aeo_distribution_queue`, formats `sms`/`markdown`/`html`/`json`; the `reddit-aeo-monday-digest` scheduled task now fires this instead. `aeo-citation-tracker` queries Perplexity Sonar + Gemini Flash + Claude Haiku with 20 Utah roofing prompts, parses for Frame citations, logs to `aeo_citation_log`. **Baseline measured 2026-05-16:** 0% Frame citation rate on "Best roofing company in Heber City Utah" (Gemini) — competitor "Premier Roofing" cited instead. Architecture inspired by xai-org/x-algorithm Phoenix component; plug-and-play surface drafters — each new platform (Nextdoor / Yelp / LinkedIn / Quora) drops in as one new edge fn + queue inserts without changing digest or queue shape.
- **DB tables (Master AEO Play 2026-05-16 evening, 9467596):** `aeo_distribution_queue` — unified queue across all citation surfaces (columns: `priority_score`, `status` workflow, `expires_at`, `performance_data` slot, surface-tag). Seeded by migrating all **65 actionable `reddit_signals` rows** (carries `aeo_score` + `recommended_url` + `reply_draft` + `persona_voice` from the morning's Phoenix classifier) + 18 YouTube scripts from `youtube-script-drafter` — **83 drafts cooked** as of close, ~2+ months of weekly posting backlog. `aeo_citation_log` — measurement-loop foundation; rows written by `aeo-citation-tracker`. First row logs the 0% baseline.
- [REDACTED 2026-08-07: customer-identifying operational and financial detail removed from the public repository.]
- **DB tables (Reddit-AEO 2026-05-16, c957cfe):** `reddit_signals` gains 12 new columns (`aeo_score`, `p_utah_lead`/`p_aeo`/`p_competitor`/`p_storm`/`p_spam`, `recommended_url`, `reply_draft`, `persona_voice`, `digest_sent_at`, `posted_to_reddit_at`, `posted_url`). New table `frame_content_inventory` seeded with 21 Frame pillar/spoke URLs + `topic_tags` + `question_patterns` for classifier URL matching.
- **CRM dashboard:** `/leads` (`leads.html`, **NEW 2026-05-10**, expanded 2026-05-16) — PIN-gated dark-themed CRM. KPIs (new untouched / last 30d / open pipeline / won MTD / commission MTD), filter+sort+search, click-to-edit panel. **2026-05-16 (1b95df5):** new "Job pipeline" sub-panel inside the edit drawer that only renders when `status=won` (keeps the form lean for new leads); shows deposit/install/balance/start/complete dates inline + a "Review request status" line stating exactly when the review-request auto-fire will go. Auto-stamps `won_at` when status flips to `won`. `/seo-report` user-bar links to it.
- **Supabase browser key:** Managed in Supabase/Vercel; never paste credential values into tracked docs.
- **Edge function URLs:** https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-lead · https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/lead-crm · https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-call · https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-sms · https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/review-request · https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/reddit-aeo-classifier · https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/reddit-aeo-digest · https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/youtube-script-drafter · https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/aeo-master-digest · https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/aeo-citation-tracker
- **Email:** WORKING via Resend (as of 2026-05-10, PR d9bd585) — Resend free tier 100/day, 3000/mo (vs Formspree's 50/mo). Domain `frameroofingutah.com` to verify in Resend; `RESEND_API_KEY` stored as a Deno secret. Landon notification: `leads@frameroofingutah.com` → `landon@framerestorations.com`, CC `ryanconwell99@gmail.com`. Verizon SMS gateway sender: `noreply@frameroofingutah.com` → `{digits}@vtext.com`. Formspree (account meeroaqa, ryanconwell99@gmail.com) retired but not yet deleted — keep ~30 days as rollback option.
- **SMS:** WORKING — sends via Verizon email-to-SMS gateway (4353024422@vtext.com) via Resend as primary + Twilio as secondary. Twilio outbound still blocked by 10DLC (error 30034) but Verizon gateway delivers.
- **Google Sheet:** NOT YET SET UP — env var ready, needs Google Apps Script webhook (lower priority now that `/leads` CRM exists)

---

## YELP

- **Listing:** https://www.yelp.com/biz/frame-restoration-heber-city
- **Display name:** FRAME RESTORATION (Yelp shortens LLC names — normal)
- **Free trial:** $17/day ($13 ads + $4 upgrade), ends 4/27/2026
- **Account email:** landon@framerestorations.com
- **Footer link:** Corrected and live on frameroofingutah.com

---

## BRAND

- **🆕 Public brand name (2026-06-15, #129 `feadbe1`):** **Frame Restoration Utah** (was "Frame Roofing Utah"). Source of truth = `data/route-factory/business.json` (`brand` + `legal_entity` → **Frame Restoration Utah LLC**). The blog generator now reads `BUSINESS_NAME` from `business.json` (#128) — do NOT hard-code the old brand in new pages/posts. **Continuity exceptions (do NOT "fix"):** canonical domain **MIGRATED 2026-06-17 to `www.framerestorationutah.com`** (`0ef10e6` migration + `c140f98` SOT closeout — this exception is now SUPERSEDED; the old `frameroofingutah.com` 301-redirects to the new host, and `business.json` `canonical_host` is updated), `index.html` schema `alternateName` is deliberately retained as the old `Frame Roofing Utah`, and SMS-consent legal string stays `Frame Restoration LLC (DBA Frame Roofing Utah)`.
- **Colors:** Navy #0B4060, Gold #E1B969, Off-white #FAF9F5
- **Fonts:** Archivo Black (headings), Archivo (body) — Google Fonts, need to self-host
- **Logo:** PNG reads "Frame Restoration" — now ON-brand after the 2026-06-15 transition to Frame Restoration Utah (no designer update needed; the prior "needs update to Frame Roofing" note is obsolete).
- **Logo file:** /images/logo-rc-darkblue.png (85px height, 100px nav bar)
- **OG image:** /images/og-image.jpg (branded aerial drone shot)

---

## GIT WORKFLOW

- All work in `/Users/agenticmac/projects/frame-restoration-utah/` (NOT tradeworker-site/frame-restoration-utah — that is a stale obsolete copy)
- Push to `main` auto-deploys to BOTH Vercel accounts
- Commit format: descriptive message + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Watch for `.git/index.lock` — delete before committing if stale
- Desktop Commander read_file returns empty for HTML — use `start_search` with contextLines or `start_process` with `cat`

---

## HISTORY & LOGGING

Everything dated that used to live in this file was moved out on 2026-10-17, byte-for-byte, from `CLAUDE.md` at `origin/main` `e2847cc3`:

- `docs/history/CLAUDE-UPDATE-LOG.md` — the `> Last updated` / `> Earlier` refresh-banner chain (old lines 2–856; newest first, 2026-10-05 back to the first refresh).
- `docs/history/CLAUDE-SESSION-LOG.md` — the `## SESSION LOG` (old lines 1260–4097; newest first, 2026-10-05 back to the first sessions).
- `docs/history/CLAUDE-STATUS-SNAPSHOT-2026-10-05.md` — the dated status sections: SITE STRUCTURE (as of 2026-04-22) + Key Files and SEO STATUS (as of 2026-03-28) (old lines 967–1116); PRIORITY TODO (as of 2026-04-17) and 💰 MARKETING BUILD (Active April 2026) (old lines 1162–1249).
- Verify any of them: `git show e2847cc3:CLAUDE.md | sed -n '<from>,<to>p' | shasum -a 256` must equal the body sha256 printed in that file's header.

**How to log from now on**
- Session notes and Auto-Refresh entries: prepend a dated `### YYYY-MM-DD (…)` entry directly under the `## SESSION LOG` heading in `docs/history/CLAUDE-SESSION-LOG.md`, and put the matching refresh banner at the top of `docs/history/CLAUDE-UPDATE-LOG.md`. Never add either to this file — `claude-md-budget.yml` fails if a `## SESSION LOG` heading or a `> Last updated:` / `> Earlier (` banner line reappears here, or if the file passes 40,960 bytes.
- A changed RULE is edited in place in the section that owns it (CRITICAL RULES, PEOPLE, DOMAINS & HOSTING, …): one or two lines, no narrative.
- Status snapshots (rank reads, sitemap counts, bot runs) belong in `docs/seo/`, `data/`, or the session log — never here.
- The Auto-Refresh job (commits as `Review Bot <review-bot@frameroofingutah.com>`, pushes straight to `main`) still targets this file as of 2026-10-17. Until it is re-pointed at `docs/history/`, its next run will turn `main` red on `claude-md-budget.yml`; that re-point is the follow-up listed in the PR that made this split.
