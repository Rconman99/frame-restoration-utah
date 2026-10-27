# Frame Restoration Utah — Claude Master Context

> **This file is the trimmed operating context (2026-10-19).** Rules, guards, market isolation, architecture and runbooks stay here. History, status logs and inventories moved verbatim to `docs/claude-context/` — read them when a task needs the detail:
> - [`docs/claude-context/status-history.md`](docs/claude-context/status-history.md) — every prior auto-refresh status header
> - [`docs/claude-context/session-log.md`](docs/claude-context/session-log.md) — full SESSION LOG (all entries)
> - [`docs/claude-context/site-structure.md`](docs/claude-context/site-structure.md) — full SITE STRUCTURE inventory
> - [`docs/claude-context/seo-status.md`](docs/claude-context/seo-status.md) — full SEO STATUS, baselines, completed work, competitors
> Auto-refresh: append new status/log entries to the docs files above, not here. Keep this file under ~60 KB.

## CURRENT STATUS (latest auto-refresh header)

> Last updated: 2026-10-19 (Monday Auto-Refresh — **~2 WEEKS OF HUMAN SHIPPING 10/11-10/18 (#306-#334): OWNER DASHBOARD + /seo-report MOVED BEHIND TEAM LOGIN, GA4 ADDED SITEWIDE, DAILY REVIEW-REQUEST TRIGGER, NEW BLOCKING CI GUARDS.** Window 2026-10-05 -> 2026-10-19, origin/main `895d92ec`: 31 Rconman99 commits + bot data commits (SEO Loop x15, AEO Monitor x3, Rank Tracker x3, Blog Bot x2). Corpus: blog 78 HTML, locations 72 HTML, sitemap 172 `<loc>` (flat vs 10/5). Highlights: #306 PageSpeed key to env via /api/pagespeed; #310 GA4 G-1C86BMZS7T sitewide; #311 modal SMS consent restored + Springville mobile layout; #312 AEO monitor survives SerpAPI 520/522; #315/#316 daily review-request trigger (dry-run, claim-before-send, key moved to secret); #317 missed-lead notification recovery schedule (dry-run); #321 HTML entities decoded in 10 JSON-LD strings + gate; #322 Heber emergency availability aligned to approved scope; #324 every booking CTA -> on-site lead form, dead calendar link blocked; #327 dead Google Business short link replaced; #328 mobile showreel + Mapbox deferred; #329 contrast + keyboard-focusable table scrollers; #330 404 DOPL/SLC reference links replaced; #331 blocking Frame guards (no-Ryan, NAP lock, market isolation, dead GBP links); #332 builder credit and family review removed, SLC LLC name trailing period dropped; #333 /dashboard and /seo-report put behind existing team login (owner gate, NFKC path-fold hardening); #334 lead-form test flake fix. SEO Loop 10/19: 175 pages crawled (172 indexable), 0 error issue types; GSC 111 clicks / 49,544 impr (9/19-10/16), clicks WoW 25 -> 23; rank drops: roofer cottonwood heights 14 -> >30, roof replacement holladay 13 -> 28, roof repair sandy 20 -> >30, roofing contractor draper 1 -> >30. Still 0-click/high-impression: /locations/midway (2,597 impr @ 8.5), provo, eagle-mountain, tooele, park-city, sandy, orem, highland, lehi. Quick wins: roof repair heber city ut pos 6.4 (1,972 impr), roofing heber city ut pos 4.7, roof repair farmington/tooele/eagle mountain ut. SLV panel (72/72 measured): exact-CID maps #1 still 0/4 in every city; Magna AIO cited 1/1 is the only AIO citation. AEO citation monitor 10/13: cited in 1 of 12. **Local primary clone still stale (`main` 1 ahead / 395 behind `origin/main`, 218 dirty/untracked files) — this refresh was built in an isolated worktree at `origin/main` `895d92ec`; do not `git pull` over the dirty tree without stashing.** See SESSION LOG 2026-10-19.)

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

### 2026-10-05 service-scope rule (active — do NOT violate):
- **24/7 is valid ONLY for water/flood, emergency tarping and storm response.** Routine roofing = business hours (see Hours above). Do not put "24/7" on routine roofing copy, schema, GBP drafts or auto-reply strings. Owner-confirmed 2026-10-03 (#302 round 2 — scope was first water/flood only, then widened to emergency tarping + storm response).
- **Remodel claims removed.** Kitchen/bath remodel was dropped from general-contracting and the homepage GC schema (#302). Do not re-add remodel as a service.
- `scripts/validate-slc-identity.mjs` allows only the exact scoped 24/7 phrases on the Salt Lake City page — it covers that one page, not the site. Apply this rule before writing any customer-facing copy. Full record: `docs/claude-context/session-log.md` (2026-10-05 entry) and `docs/claude-context/status-history.md` (10/05 header).

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

## SITE STRUCTURE (~120+ HTML pages, 105 sitemap URLs as of 2026-04-22 — pruned from 126 during audit fix; removed dupes, robots-disallowed paths, Vercel-redirected routes)

> Index only — one line per entry, truncated. **Full text (paths, commands, guard details): [`docs/claude-context/site-structure.md`](docs/claude-context/site-structure.md).**

- `/` — Homepage (index.html), H1: "Mountain-Grade Roofing, Valley-Wide" (rebrand 2026-04-17; previously "The Gold Standard In Utah Roofing"). Hero badge reads **"★★★★…
- `/about.html` — Thin root-level About page (1,424w). **2026-06-02 (PR #74):** now **301-redirects to `/pages/about`** (`vercel.json`) and removed from `sitemap.xml`;…
- ⚪ `/salt-lake-city` — **REMOVED 2026-08-10 (`179b443` #203). The root-level `salt-lake-city.html` is DELETED and consolidated into the canonical `/locations/salt-lak…
- 🟢 `/locations/salt-lake-city` — **THE canonical SLC URL, and as of 2026-08-11 (`0404691`, PR #228) the only page in the corpus bound to a separately verified GBP ide…
- 🟡 `/previews/city-pages/` — **NEW 2026-08-11 (`0404691`, PR #228). The Multi-City Page Generator's first artifact, deliberately not public.** `salt-lake-city.html` +…
- `/pages/` — **15 pages** (residential-roofing, commercial-roofing, roof-repair, roof-replacement, storm-damage, storm-damage-restoration [redirects to storm-damage],…
- `/locations/` — **47 location pages on `main`** (all Utah cities along the Wasatch Front; verified `ls locations/*.html | wc -l` = 47 as of 2026-06-09); **all clear…
- `/blog/` — **CURRENT COUNT, verified on `8a0b4442` 2026-09-18: 77 blog `.html` files EXCLUDING `blog/index.html` (78 including it).** **+5 on 2026-09-18** — the firs…
- `/projects/` — 1 case study (heber-valley-roof)
- `pages/gallery.html` — Now leads with **FEATURED IN-PROGRESS PROJECT** section (Heber Valley custom reroof): aerial panorama hero + 3-up grid + drone flyover video p…
- `/seo-report/` — Live SEO & Lead Attribution Tracker (PIN-gated, multi-user admin panel, 30-day default view, Chart.js rendering). **2026-04-27:** Now ships alongsid…
- `/dashboard/` — **NEW 2026-04-27.** Productized client-dashboard module vendored from RCBuild-Kit v0.8.0. Config-driven via `window.DASHBOARD_CONFIG` (reads `data/da…
- `/scripts/` — **NEW 2026-04-27.** Wave 2 marketing-intel runners: `market-intel.mjs` + `market-intel-config.json` (45-city × 4-tier scoring), `market-intel-kit/` (bu…
- `/supabase/` — **NEW 2026-05-09 (PR #23), expanded 2026-05-10 (d9bd585), expanded again 2026-05-11 evening.** Edge function source-of-truth, previously deployed-only…
- `/leads.html` — **NEW 2026-05-10 (d9bd585), expanded 2026-05-11 evening (71eef60 + 6559fcf + 459bfda + 67caae9).** Public deliverable (PIN-gated) at `/leads` (cleanU…
- `/track-attribution.js` — **NEW 2026-05-11 evening (PR #39).** Phase 0 closed-loop ROAS instrumentation. Captures ad click IDs (`gclid`/`fbclid`/`msclkid`/`gbraid`/`…
- `/track-clicks.js` — **NEW 2026-05-11 evening (PR #55, 158 lines).** Auto-instruments every `tel:`/`sms:` link site-wide. On click: PostHog event (`phone_click`/`sms…
- `/review/` — Review landing page + `review-request` edge function (automated post-job review collection)
- `backlink-playbook.html` — 12 backlink acquisition opportunities with step-by-step instructions
- `directory-blitz-tool.html` — Directory blitz tool v4 with full blitz results (Angi marked Already Done 2026-04-13)
- `Frame-Innovation-Audit-2026-05-16.html` — **NEW 2026-05-16 (06ee582, 272 lines).** Strategic-thinking artifact (NOT action) pulled from live Supabase + scheduled ta…
- `Frame-Reddit-AEO-Playbook.html` — **NEW 2026-05-16 (c957cfe).** Strategy doc for the Phoenix-pattern Reddit-AEO classifier rollout: rules of engagement, persona gui…
- `Frame-AEO-Master-Play.html` — **NEW 2026-05-16 evening (9467596, 260 lines).** Strategy doc for the unified 8-surface AEO distribution system (Reddit / YouTube / Ne…
- `/build-intelligence/` — **NEW 2026-05-16 (8a8063f), expanded 2026-05-16 evening (9467596).** Scratch/feedback dir holding the build-intelligence loop scaffolding co…
- `/archive/` — Old docs, sub-location service pages, eval files
- `/images/` — Photos, OG image, brand source files (/brand-source/, /projects/cities/, /services/), landon-yokers-headshot.jpg (About page)
- `/assets/` — Hero video/poster, gutters video

### Key Files
- `vercel.json` — Redirects (storm-damage-restoration → storm-damage, /:city/storm-damage-restoration → /:city/storm-damage, /home → /, **NEW 2026-04-22:** /privacy-po…
- `.vercelignore` — **NEW 2026-04-22.** Blocks deploying CLAUDE.md (contains Supabase anon key + internal rules), *.md strategy docs, *.py scripts, drive-photos.zip (8…
- `sitemap.xml` — **CURRENT: 148 `<loc>` URLs, verified on `9fdcae6` 2026-08-13** (147 → 148, +1 from the 8/13 auto-published post `blog/utah/asphalt-shingles-vs-metal…
- `robots.txt` — Allows AI crawlers (GPTBot, Claude, Perplexity), blocks Bytespider. **2026-04-22:** Removed Disallow for /privacy and /terms (already noindex via meta…
- `llms.txt` — AI/LLM optimization file
- `directory-tracker.html` — Interactive React-based directory tracker (38 directories)
- `global-modal.js` — Booking form modal → Supabase edge function
- `global.css` — Shared styles (self-hosted Archivo Black + Archivo WOFF2 already wired here — duplicate Google Fonts <link> removed from index 2026-04-22)
- `data/audits/` — **NEW 2026-05-04.** Lighthouse audit drops from cross-project sessions. Current: `lighthouse-2026-05-04.md` (rendered summary) + paired `-mobile.jso…
- `data/route-factory/business.json` + `scripts/audit-cta-integrity.mjs` + `.github/workflows/cta-liveness.yml` + `scripts/check-cta-liveness.py` + `.vercelignore` — *…
- `PORT-PLAN.md` + `data/route-factory/` + `scripts/audit-*.mjs` + `.github/workflows/compliance-gate.yml` — **NEW 2026-05-30, COMMITTED + MERGED to `main` via PR #59…
- `scripts/audit-review-integrity.mjs` — **NEW 2026-06-03, MERGED to `main` via PR #77 (`4c2c1ce`).** **Blocking** review-integrity gate: forbids cloned `AggregateRati…
- `AEO-BUILDOUT-HANDOFF-2026-06-03.md` — **NEW 2026-06-03, UNTRACKED** (per the handoff-doc convention; supersedes the on-page checklist in `AEO-GROWTH-HANDOFF-2026-06…
- `state.json` + `activity-log.md` (repo root) + `data/aeo-citations/2026-07-05.md` — **NEW 2026-07-05 (`dc99ba0` / `4b72540`, AEO Monitor identity).** First TRACKED r…
- `data/AEO-AIO-SWEEP-2026-08-07.md` + `data/raw/aio-runs/<runid>/` + `data/.last_run.json` + `.github/workflows/aeo-aio-sweep.yml` — **NEW 2026-08-07 (`e48b565`, PR #…
- `qa/surface-contract.utah-lcp.source.json` + `qa/receipts/utah-lcp-source-20260727-rerun.json` — **NEW 2026-08-07 (`bd90e2e`, PR #182).** LCP field-hotspot surface c…
- `supabase/functions/lead-notification-worker/` + `supabase/functions/resend-webhook/` + `supabase/functions/_shared/lead-notification.ts` + `_shared/lead-request.ts`…
- `qa/surface-contract.internal.source.json` — **NEW 2026-08-09 (`29dfdcf`, PR #200).** Durable internal-route surface contract covering `/review`, `/dashboard`, `/lea…
- `scripts/validate-slc-identity.mjs` + `scripts/validate-city-page-drafts.mjs` + `qa/SLC-ADOPTION-AUDIT-2026-08-11.md` + `qa/CITY-PAGE-GENERATOR-SLC.md` + `qa/surface…
- `.github/workflows/seo-loop.yml` + `scripts/seo-crawl.mjs` + `scripts/seo-snapshot.mjs` + `scripts/seo-diff.mjs` + `scripts/seo-merge-ai-visibility.mjs` + `scripts/l…
- `scripts/audit-doc-isolation.mjs` — **HARDENED 2026-08-07 (`9b41c53` #191 +126, `e788765` #192 +32).** **Blocking** isolation gate: deploy-data manifest, sensitive-p…
- `supabase/migrations/*_emergency_customer_data_containment.sql` — **NEW 2026-08-07 (`9b41c53`, PR #191).** Record of the emergency transaction applied manually 2026-…
- `.vercelignore` — **⚠️ REWRITTEN 2026-08-07 (`9b41c53`, PR #191) to DEFAULT-DENY.** The internal `data/` tree is now blocked wholesale via `data/*`, with exactly two…
- `docs/seo/UTAH-GROWTH-PLAN.md` + `scripts/blog-target-prioritizer.py` — **NEW/REWIRED 2026-08-07 (`17dc7c6` #196, `f7e37da` #197, `ce2ef5b` #198).** The measured Uta…
- `data/rank-tracker/` + `scripts/dataforseo-rank-tracker.mjs` + `scripts/test-dataforseo-rank-tracker.mjs` + `.github/workflows/rank-tracker.yml` — **NEW 2026-08-11/1…

## SEO STATUS (as of 2026-03-28)

> Full section moved verbatim to [`docs/claude-context/seo-status.md`](docs/claude-context/seo-status.md) (baselines, completed log, competitors, audit reports). Current SEO state is in CURRENT STATUS above.

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

## PRIORITY TODO (as of 2026-04-17)

### Immediate
1. ~~**Ship Lighthouse audit fixes (from `data/audits/lighthouse-2026-05-04.md`)**~~ ✅ DONE 2026-05-10. All three fixes shipped: (a) `index.html:1692` IIFE-wrapping-addEventListener TypeError fixed in commit 0199efd; (b) LCP was already solved by 2026-05-06 video swap (fresh audit 2026-05-10 reports 99/100 mobile perf, LCP 1.5s — no image work needed); (c) PostHog `disable_surveys: true` added in 0199efd, saves 27 KB unused JS. Best Practices projected 96 → 100. `data/audits/` commit policy still open.
2. Set up Twilio — Utah phone number, wire into edge function for lead SMS (10DLC consent checkbox now in place 2026-04-17, error 30923 resolved)
3. Build speed-to-lead AI bot — Twilio + Claude API + Supabase
4. Google Sheet lead tracker — Apps Script webhook (lower priority now that `/leads` CRM exists, 2026-05-10)
5. ~~Direct email (replace Formspree with Resend/SendGrid)~~ ✅ DONE 2026-05-10 (PR d9bd585 — handle-lead v8 swaps Formspree → Resend; Resend free tier 100/day vs Formspree's 50/mo)
6. ~~301 redirects framerestorationutah.com → frameroofingutah.com~~ ✅ DONE (Landon domain forwarding 2026-03-30; in-code 301s also added 2026-04-07)
7. ~~Google Search Console verification + sitemap for frameroofingutah.com~~ ✅ DONE
8. Update Google Business Profile with new URL
9. Reddit-scanner: response parsing hardened 2026-04-17 (HTTP status, empty body, retry, typed errors) — monitor reliability

### Short-term
9. ~~Self-host fonts (Archivo Black + Archivo)~~ ✅ DONE (already wired in global.css; double-loading Google Fonts <link> removed 2026-04-22)
10. ~~Convert images to WebP~~ ✅ DONE (88 images converted 2026-04-12 + 24 compressed 2026-04-07)
11. ~~Add author bios + publication dates to blog posts~~ ✅ DONE (2026-04-08)
12. Directory submissions (HomeAdvisor, Thumbtack, local chambers) — Angi + Yelp already done
13. Get updated logo from designer ("Frame Roofing" not "Frame Restoration")
14. ~~IndexNow integration~~ ✅ DONE (2026-04-12)
15. ~~HowTo schema coverage on blog~~ ✅ DONE (all 39 posts, 2026-04-10)

### Medium-term
13. ~~Weather-triggered blog automation (NWS API, architecture in FRAMEROOFINGUTAH-BUILD-PLAN.md)~~ ✅ DONE 2026-07-09 (PR #153 — `.github/workflows/blog-autopost.yml`, cloud auto-poster: prioritizer picks the top weather+tracking target via free NWS + in-repo PostHog, drafts via OpenRouter, publishes fully autonomously Mon+Thu, no Mac dependency)
14. Rewrite 44 location pages with unique per-city content
15. Build more project case studies

---

## 💰 MARKETING BUILD (Active April 2026)

**Entry point for all marketing work:** [`data/MARKETING-BUILD-CONTEXT.md`](data/MARKETING-BUILD-CONTEXT.md)

That file is the canonical "start here" for any agent (Cowork, Claude Code, future-you) working on Frame Utah marketing. It contains the active $15K/mo allocation, Wave 1 findings already integrated, Wave 2 fire commands, free actions today, KPI scoreboard, confidence scorecard, and full file index.

### Quick reference

**Active $15K/mo allocation (Wave 1 deltas applied):**
- $7,500 — Tier-1 priority cities (Park City, Heber, Draper, Salt Lake, Cottonwood Heights, Midway)
- $2,500 — Tier-2/3 volume layer (West Valley, Sandy, Bountiful, Lehi)
- **$1,700 — Reviews acquisition** ⭐ (closes 20→60+ vs roofingutah.com's 54)
- $1,300 — YouTube + TikTok organic + light boost (Heber drone reuse)
- $700 — Content moat (narrowed scope after Wave 1)
- $800 — Storm-trigger reserve (May-Sept hail/wind + Dec-Feb ice dam)
- $500 / $0 — Yelp (decision pending — trial expired 2026-04-27)

**Critical Wave 1 finding:** roofingutah.com has not published a blog post since 2024-05-31 (sitemap-verified). Frame Utah's content moat is essentially already built; the actual gap is reviews + GBP. Allocation reflects this.

### Wired npm scripts (in `package.json`)

| Command | Purpose | Cost (live mode) |
|---|---|---|
| `npm run market-intel` | Offline scoring of 45 cities (smoke test) | $0 |
| `npm run market-intel:dataforseo` | Real per-city SERP + KW + paid-density | ~$0.30 / 45 cities |
| `npm run competitor-ads` | SerpAPI scan on roofingutah.com + utahroofingcompany.com + reignroofing.com | ~$0.15 |
| `npm run competitor-tiktok` | Apify TikTok scrape on UT competitor handles | ~$1.50 |

All scripts dry-run when env vars (`SERPAPI_KEY`, `APIFY_TOKEN`, `DATAFORSEO_*`, `CENSUS_API_KEY`) are missing — they print queries + estimated spend, exit 0, no API calls.

**Total Wave 2 spend:** ~$33 one-time across both Frame projects (UT + TX). Pending company CC.

### Free actions (no CC needed — do these first)

1. Pull Yelp 30-day dashboard → today's $510/mo decision
2. Pull GSC last-30-days → refresh March-30 baseline
3. Run `scripts/supabase-pipeline-query.sql` in Supabase SQL Editor → real per-city job-value + close-rate
4. Pull PostHog form-submission count last 30 days
5. Google Keyword Planner: Park City + Heber + Draper
6. 15-min Birdeye / NiceJob / Podium pricing calls
7. Send 5 manual review-requests via existing edge function
8. Storm-trigger fire drill via iMessage to Landon

### Key marketing files
- `data/MARKETING-BUILD-CONTEXT.md` — **canonical entry point**
- `data/30-day-lead-sprint-2026-05-01.md` — **NEW 2026-05-01.** May 2026 lead-velocity sprint plan (5 highest-EV plays — reviews velocity, speed-to-lead, form CRO, pre-built storm landing page, AI-Overview citation moat — w/ file paths, effort scores, expected impact, source citations, weekly cadence). PRs #9-#14 executed Day 1 of this plan.
- `data/RYAN-VALUE-MEMO-2026-05-01.md` — **NEW 2026-05-01.** Landon-facing build receipt + 10% commission cadence ask (SMS-friendly TLDR + long form). Frames the 5-week build, current GSC baseline, May sprint roadmap.
- `data/market-intel-audit-2026-04-27.md` — full $15K deep-dive audit
- `scripts/market-intel-kit/README.md` — bundled scoring + allocator kit docs
- `scripts/supabase-pipeline-query.sql` — ready-to-paste SQL for Supabase
- Cross-project research framework: `~/projects/frame-roofing-research-plan-to-A-grade-2026-04-27.md`
- Cross-project Wave 2 punch-list: `~/projects/frame-roofing-wave-2-readiness-2026-04-27.md`

### Operational separation reminder

Frame TX (`framerestoration.com` singular) and Frame Utah (`frameroofingutah.com`) are independent operational entities. **Never share runtime state, scheduled triggers, Twilio numbers, or GBP listings between projects.** Cross-project research artifacts at `~/projects/frame-roofing-*.md` are documentation only — not a license to cross-trigger. See § "Operational Separation from Frame Utah (enforced 2026-04-27)" in this CLAUDE.md.

---

## GIT WORKFLOW

- All work in `/Users/agenticmac/projects/frame-restoration-utah/` (NOT tradeworker-site/frame-restoration-utah — that is a stale obsolete copy)
- Push to `main` auto-deploys to BOTH Vercel accounts
- Commit format: descriptive message + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Watch for `.git/index.lock` — delete before committing if stale
- Desktop Commander read_file returns empty for HTML — use `start_search` with contextLines or `start_process` with `cat`

---

## SESSION LOG

> Latest entry only. Full log: [`docs/claude-context/session-log.md`](docs/claude-context/session-log.md).

### 2026-10-19 (Monday Auto-Refresh — #306-#334 shipped; owner dashboard gated; GA4 + review-request automation; new CI guards)
- **Code (origin/main `895d92ec`, 31 human commits since 10/5):** analytics/ops — #306 PageSpeed key -> env, #310 GA4 sitewide, #312 AEO monitor retries, #315/#316 daily review-request trigger (dry-run + idempotent claim, secret-held key), #317 missed-lead recovery schedule (dry-run, counts-only). Site/SEO — #321 JSON-LD entity decode + gate, #322 Heber emergency scope, #324 booking CTAs -> on-site form, #327/#330 dead links replaced (GBP short link, DOPL, SLC refs), #328 deferred showreel/Mapbox (CWV), #329 a11y contrast/focus, #332 builder credit + family review removed. Security/CI — #331 blocking guards (no-Ryan, NAP lock, market isolation, dead GBP links), #333 owner gate on /dashboard + /seo-report (middleware matcher narrowed so public pages never invoke it; NFKC fullwidth path folds -> 400).
- **Bots:** SEO Loop daily through 10/19; AEO Monitor AIO sweeps 10/7 + 10/14, citation report 10/13 (1 of 12 cited); Rank Tracker SLV matrix 10/19; Blog Bot traction snapshots 10/5 + 10/12. No blog auto-publishes (blog flat at 78).
- **SEO state:** see header. Priorities unchanged: diagnose 0-click location pages (local-entity/ranking signals before copy edits), watch Draper/Sandy/Holladay/Cottonwood Heights drops, exact-CID maps #1 still 0/4 across SLV.
- **Housekeeping:** local clone stale; refresh built in isolated worktree. This refresh commits CLAUDE.md only.
