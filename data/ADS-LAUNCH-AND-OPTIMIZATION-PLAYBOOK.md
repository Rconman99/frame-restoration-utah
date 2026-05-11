# Frame Roofing Utah — Ad Launch + Backend Optimization Playbook (Ryan Technical Doc)

**Status:** ready to execute · **Owner split:** Landon (account holder steps — see `LANDON-LAUNCH-CHECKLIST.md`) + Ryan (technical + campaign management — this doc) · **Cost to launch:** $0 setup, ad spend per existing $15K/mo Wave 1 allocation · **Time to live ads:** 5-7 business days (LSA verification is the long pole) · **Last updated:** 2026-05-10 (revised post-audit)

> **Landon:** read `data/LANDON-LAUNCH-CHECKLIST.md` instead — the 2-page summary of what's actually on your plate. This doc is the technical operating plan for Ryan.

---

## Big picture — what we're building

A **closed-loop paid-ads engine** where every $1 of Frame Utah's $15K/mo budget is measurable from click → form/call → estimate → closed job. We do that in two phases:

- **Phase 0 (this week):** Get ads running with proper attribution capture + conversion tracking from day 1. No closed-loop yet, just clean attribution data flowing through to ad platforms.
- **Phase 1 (next 2 weeks):** Build the offline-conversion-sync engine that pushes closed job revenue back to Google Ads + Meta. Smart Bidding can then optimize toward higher-value conversions once closed revenue is consistently uploaded and enough data exists for the ML to stabilize.

Phase 0 cost: $0 + ad spend. Phase 1 cost: ~10 hrs of engineering time (mine), $0 in additional tools if we stay on the existing stack (call tracking and review-acquisition tools may add monthly cost — see Section 2.5 + 5).

The existing $15K/mo allocation from `data/MARKETING-BUILD-CONTEXT.md` doesn't change. What changes is how much of each dollar produces measurable closed-revenue jobs.

**Success means:** Every $1 of paid spend has a click-ID trail from ad click → form/call → estimate → closed job. Offline conversion sync uploads closed revenue daily with <5% error rate. Smart Bidding receives consistent value signal. Landon can answer "how much did we make from Google last month" from `/dashboard/` without writing a SQL query. Phase 1 closed-loop ROAS engine is reusable on Frame TX + future Perfect Stack clients without per-project re-engineering.

---

## Part 1 — Landon's checklist (he owns these, can't delegate)

These require Landon's identity, his Workspace login, his business documents, his bank account. Ryan can't do them.

### 1.1 — Google Ads account setup (~15 min)

- [ ] **Landon logs into [ads.google.com](https://ads.google.com)** with `landon@framerestorations.com`
- [ ] If no Google Ads account exists yet, click **Start now** → pick **Switch to Expert Mode** at the bottom (avoids Smart Campaigns trap)
- [ ] Skip the "Create a campaign" prompt → **Create an account without a campaign**
- [ ] Set:
  - Billing country: **United States**
  - Time zone: **(GMT-07:00) Mountain Time**
  - Currency: **USD**
- [ ] **Billing & Payments** → add payment method (business credit card preferred for accounting; bank account works too)
- [ ] **Tools → Access and security → Users** → invite `ryanconwell99@gmail.com` as **Admin** so Ryan can build campaigns
- [ ] Note the **10-digit Customer ID** at the top-right of the screen (format `XXX-XXX-XXXX`) — Ryan needs this

### 1.2 — Google Business Profile (GBP) verification check (~5 min)

GBP is already claimed (per `frame-roofing-google-reviews` scheduled trigger pinning data_id `0x874df59069be3e09:0x756332595f702acc`), but verify:

- [ ] [business.google.com/locations](https://business.google.com/locations) → confirm "Frame Restoration Utah LLC" appears with **green ✓ Verified**
- [ ] If not verified, request a new postcard verification (5-7 day delay)
- [ ] **DO NOT change business name, address, or category right now.** Per the April 2026 GBP mass-suspension wave (see TX project's CLAUDE.md GBP rules — same principles apply): rapid profile edits trigger Gemini moderation. Frame Utah's profile is stable and ranking; leave it alone.
- [ ] Confirm primary category is **Roofing contractor** (not "Roofer" or "Roofing & gutters")

### 1.3 — Local Service Ads (LSA) setup (~30 min + multi-day verification, length varies)

LSA is expected to be one of the highest-intent paid channels for roofing — pay-per-lead, not per-click, with the Google Guarantee badge attached. Reference benchmark: [Roofing Webmasters' 2026 guide](https://www.roofingwebmasters.com/google-ads/).

- [ ] In Google Ads (or [ads.google.com/local-services-ads](https://ads.google.com/local-services-ads)), click **Get started with Local Services Ads**
- [ ] Service area: **all 45 Wasatch Front cities** Frame currently serves (mirror sitemap.xml)
- [ ] Services: select EVERY service Frame actually does:
  - Roof installation
  - Roof repair
  - Roof inspection (free)
  - Storm damage repair
  - Gutter installation / repair
  - Emergency tarping
  - Insurance claim assistance
- [ ] Business details: pull from current site footer + GBP. License #14256097-5501 (Utah DOPL).
- [ ] **Complete any required Google Local Services verification steps the LSA dashboard prompts for.** Depending on Google's current requirements for the roofing category in Utah, this may include:
  - Business registration verification
  - License verification (Utah DOPL)
  - Insurance verification (general liability, workers' comp or exemption affidavit)
  - Identity verification of the listed business owner
  - Background check on the business owner
  - Manual review of uploaded documents
  Follow the exact instructions Google provides inside the LSA dashboard; don't assume a specific process (e.g. fingerprint vendor, document format) until Google tells you. **This is the long pole** — start it TODAY even if other steps aren't ready.
- [ ] **Budget:** start at **$2,500/mo** (per Tier-1 priority cities allocation from `data/MARKETING-BUILD-CONTEXT.md`). Increase once verified.
- [ ] **Lead types:** check ALL of (Phone calls, Messages, Booking) — more surface area = more leads, and Google's pricing is per-lead so coverage > exclusivity here.

### 1.4 — Meta Business Manager + Lead Ads (~20 min, optional but recommended)

Meta lead ads converted 3-4× cheaper per qualified lead than Google Search in [home services benchmarks](https://www.get-ryze.ai/blog/ai-meta-ads-for-roofing-contractors-guide). Worth $1,500-2,000/mo of the $15K allocation.

- [ ] Landon logs into [business.facebook.com](https://business.facebook.com) with personal Facebook account
- [ ] **Business Settings → Business Info** → confirm or create `Frame Roofing Utah` business
- [ ] **Business Settings → People** → add `ryanconwell99@gmail.com` as **Admin**
- [ ] **Business Settings → Pages** → claim or create `Frame Roofing Utah` page (matches the Facebook page already linked in site footer: `/61572258054303`)
- [ ] **Business Settings → Ad Accounts** → Create new ad account
  - Name: `Frame Roofing Utah - Main`
  - Time zone: Mountain
  - Currency: USD
  - Payment method: same as Google Ads
- [ ] **Events Manager → Connect Data Sources → Web → Meta Pixel** → name it `Frame Roofing Utah` → **note the Pixel ID** (15-digit number)

### 1.5 — GTM container (~5 min via Ryan delegate access)

Per `data/SETUP-GTM-CONTAINER.md` (already written). Landon's only ask: log into `landon@framerestorations.com` on tagmanager.google.com once, then invite `ryanconwell99@gmail.com` as Admin. Everything else Ryan handles.

### 1.6 — DNS for Resend (~10 min, needed for handle-lead v8)

The 2026-05-10 v8 edge function uses Resend (`leads@frameroofingutah.com`) for outbound email instead of Formspree. Resend requires domain verification via SPF + DKIM TXT records (DMARC is optional but improves deliverability).

- [ ] **Ryan goes to [resend.com/domains](https://resend.com/domains) → Add Domain `frameroofingutah.com`.** Resend then shows the EXACT records to add — copy those, don't infer them. The DKIM selector and TXT value are generated per domain.
- [ ] Landon (or whoever owns DNS for `frameroofingutah.com`) adds the exact records Resend provides:
  - SPF record (TXT at root `@`). **If an SPF record already exists, merge the Resend `include` into the existing record — don't create a second SPF record** (multiple SPFs at the same host break SPF resolution entirely)
  - DKIM record(s) (TXT at the Resend-provided selector hostname — the value is a long base64 string)
  - DMARC record (optional, TXT at `_dmarc`)
- [ ] Click **Verify** in Resend dashboard → domain shows **Verified ✓** typically within 5-30 min (DNS propagation can take up to 24 hrs in edge cases)
- [ ] Once verified, set the Deno secret: `supabase secrets set RESEND_API_KEY=re_YOUR_KEY --project-ref hdcflshhomzildwqlmwh` and confirm with a test send before deploying v8

### 1.7 — Landon checklist summary

| # | Task | Owner | Time | Status |
|---|---|---|---|---|
| 1.1 | Google Ads account + invite Ryan | Landon | 15 min | ⬜ |
| 1.2 | Confirm GBP verified | Landon | 5 min | ⬜ |
| 1.3 | LSA submission + complete Google's verification flow | Landon | 30 min + multi-day wait (length varies) | ⬜ |
| 1.4 | Meta Business Manager + Pixel | Landon | 20 min | ⬜ (optional) |
| 1.5 | GTM container (Ryan does most of it via delegate) | Landon | 1 min | ⬜ |
| 1.6 | DNS records for Resend (use exact Resend-provided records) | Landon | 10 min | ⬜ |

**Critical path:** 1.3 (LSA verification) — start it Day 1, most other work can happen in parallel during the wait.

---

## Part 2 — Ryan's wiring (already mostly built, just needs deployment)

### 2.1 — Apply pending migration + deploy v8 edge fn (~5 min, BLOCKS EVERYTHING ELSE)

Per `supabase/migrations/DEPLOY-attribution.md`:

```bash
cd ~/projects/frame-restoration-utah

# v8 also added RESEND_API_KEY as a required Deno secret (per the v8 header comment)
supabase secrets set RESEND_API_KEY=re_YOUR_KEY --project-ref hdcflshhomzildwqlmwh

# Apply the attribution-columns migration
supabase db push --project-ref hdcflshhomzildwqlmwh

# Deploy v8 handle-lead with both v7 classifier + v8 Resend + 2026-05-10 attribution capture
supabase functions deploy handle-lead --project-ref hdcflshhomzildwqlmwh --no-verify-jwt
```

Verify via SQL:
```sql
\d public.leads
-- Should show gclid, fbclid, msclkid, gbraid, wbraid, utm_*, landing_page, referrer, won_at, uploaded_to_*_at
```

**You are done when:** `\d public.leads` shows all 15 new columns + `leads_status_check` constraint, AND a smoke-test POST to handle-lead returns 200 AND v8 outbound email path delivers a test message via Resend to landon@framerestorations.com (check inbox + Resend dashboard).

### 2.2 — PR the frontend changes

```bash
git checkout -b feat/attribution-and-ads-launch
git add track-attribution.js global-modal.js index.html supabase/
git add $(git ls-files -m | grep '\.html$')
git commit -m "feat(attribution): wire gclid/fbclid/utm capture + thank-you redirect"
git push -u origin feat/attribution-and-ads-launch
gh pr create --fill --auto --squash
```

**You are done when:** PR is merged to main, Vercel production deploy is green, AND a fake-`gclid` form submit on the live site lands a row in `leads` with `gclid` populated (confirms end-to-end client→edge fn pipeline survived the deploy).

### 2.3 — GTM container build (~30 min, post-Landon-invite)

Per `data/SETUP-GTM-CONTAINER.md` Steps 1-7. Configures the 4 tags: Conversion Linker, Google Ads Lead Conversion, Meta Pixel Base, Meta Pixel Lead Event.

**You are done when:** All 4 tags fire in GTM Preview mode on a `form_submit` event, AND the container is **Published** (not just saved as a workspace draft — paused publish means tags don't fire in production).

### 2.4 — Test the conversion pipeline end-to-end (~10 min)

After GTM is published:

1. Hit a Vercel preview URL with fake UTM:
   ```
   https://{preview-url}.vercel.app/?gclid=test_2026_05_10&utm_source=google&utm_medium=cpc&utm_campaign=heber-storm-test
   ```
2. Submit the hero form with throwaway info
3. Verify in 4 places:
   - **Supabase** — new row in `leads` with `gclid='test_2026_05_10'`, `utm_source='google'`, etc.
   - **GTM Preview mode** — `form_submit` event fired → Google Ads + Meta tags both fired
   - **Google Ads → Tools → Conversions** — conversion count ticks up within ~3 hours
   - **Meta Events Manager → Test Events** — `Lead` event appears within ~60 seconds

If any of those four checks fails, fix before launching real spend.

**You are done when:** All 4 verification checkpoints pass for a single fake-attribution form submit (Supabase row + GTM Preview + Google Ads Conversions count + Meta Events Manager Test Events). Document the pass in the PR description as a smoke-test receipt.

### 2.5 — Required before scaling: call tracking

**Roofing leads are call-heavy.** Per [Roofing Webmasters 2026](https://www.roofingwebmasters.com/google-ads/), LSA and high-intent Google Search produce more phone calls than form fills. Without call tracking, the "closed loop" system is incomplete — every direct call to 435-302-4422 from an LSA ad, GBP listing, or organic search becomes an unattributed lead.

Frame already has `public.call_logs` table wired (per schema audit). Phase 0 doesn't NEED call tracking to launch, but **Phase 1 closed-loop is incomplete without it**. Wire this in parallel with the offline-conversion-sync work.

**Minimum viable call tracking (Phase 1 prerequisite):**

- [ ] **Google Ads Call extensions / Call assets** — built-in, free, fires a Google-tracked phone number on paid clicks. Conversion firing built-in. Configure at Google Ads → Ads & assets → Assets → Call.
- [ ] **LSA call tracking** — Google routes all LSA calls through Google's tracking number automatically. Already configured by default when LSA goes live; just confirm in LSA dashboard → Settings → Communications.
- [ ] **GBP call insights** — already tracked via GBP Insights tab. Not directly tied to ad spend, but baseline data.

**Full closed-loop call tracking (recommended for $5K+ monthly spend):**

- [ ] **Dynamic Number Insertion (DNI)** on the website — visitor sees a different phone number depending on `utm_source` / `gclid`. Provider options + monthly cost:
  - **CallRail** — $45/mo for 10 tracking numbers + 500 calls. Easiest integration; webhook to Supabase straightforward.
  - **WhatConverts** — $40/mo. Built-in lead scoring.
  - **Twilio + custom DNI** — ~$15/mo at this volume, ~5 hrs eng time. Cheapest but you maintain it.
- [ ] **Per-channel tracking numbers** — separate numbers for Google Search, LSA, Meta, Organic, Direct. Forwards to Landon's 435-302-4422 transparently to the caller.
- [ ] **Webhook to `call_logs`** — store `from_number`, `to_number` (the tracking number), `forwarded_to`, `duration_seconds`, `recording_url`, `source` (derived from the tracking number used), and `lead_id` (matched if subsequent form submit comes from the same browser session within 24h).
- [ ] **Tier classification on call transcripts** — extend the existing handle-lead classifier to consume call recordings (Whisper transcription → same Gemini Flash classifier). Catches emergency/urgent calls automatically for routing.

**Decision rule:** Don't scale paid spend beyond $5K/mo until DNI is wired. Without it, you're flying blind on >50% of paid traffic (the calls).

**You are done when:** Either (a) a DNI provider is contracted with per-channel tracking numbers forwarding to 435-302-4422 AND `call_logs` table receives a test webhook with `lead_source_channel` populated, OR (b) a documented manual-tagged-number plan exists in `data/` AND Google Ads call-tracking is enabled at minimum (no DNI but at least Google Ads paid calls attributed natively).

---

## Part 3 — Launch sequence (Week 0)

### Day -7 to -3 (waiting on LSA background check)

Use the wait to:
- Run Part 2 (Ryan's wiring) — get attribution + GTM live
- Smoke-test conversion pipeline with fake clicks
- Pre-build Google Search campaigns in **paused** state (campaign structure below)

### Day 0 (launch day, when LSA verification clears)

| Channel | Action | Daily budget |
|---|---|---|
| **LSA** | Activate (verified status flips to "Live") | $83 ($2,500 / 30) |
| **Google Search — Branded** | Activate paused campaign | $20 ($600 / mo) |
| **Google Search — High-intent non-brand** | Activate paused campaign | $130 ($3,900 / mo) |
| **Meta Lead Ads** | Activate Tier-1 city audiences | $50 ($1,500 / mo) |
| **Reviews acquisition** | Day-of-job SMS workflow (growth infra, not ad spend) | $1,700/mo via Birdeye/manual |

Total Day 0 paid-media spend rate: **~$283/day** = $8,490/mo of the $13,100 paid-media bucket. Rest stays in reserve (storm-trigger $800, YouTube/TikTok $1,300, Tier-2/3 cities $2,500) — release after 14 days of learning. Growth infrastructure ($1,700 reviews + $700 content moat) runs in parallel from Day 1, not gated on LSA approval.

**LSA UTM caveat:** LSA traffic does NOT automatically pass `utm_source=lsa` to the website (LSA leads go through the LSA dashboard, not a website click in most cases). Use the dedicated `lead_source_channel='google_lsa'` field instead — derived in handle-lead from a combination of:
- LSA dashboard exports (manual sync or scraped via API once LSA exposes one)
- Dedicated call-tracking number assigned only to LSA (DNI — see Section 2.5)
- Phone numbers matching LSA's known forwarding-number pool
- Where LSA *does* allow custom landing-page URLs (Messages → website link), tag them with `?utm_source=google_lsa&utm_medium=local_service_ads` explicitly

### Day 1-7: monitor only, NO optimization

Smart Bidding needs **at least 30 conversions in 30 days** before its ML stabilizes. Don't touch keyword bids, don't pause ads, don't change ad copy. Just watch:

- **Daily check (5 min):** any tag firing errors? Any campaigns disapproved? Any spend anomalies (>30% over daily budget)?
- **Daily SQL pull** (we'll wire to dashboard later):
  ```sql
  select date_trunc('day', created_at) as day,
         count(*) filter (where utm_source = 'google') as google_paid,
         count(*) filter (where utm_source = 'lsa') as lsa,
         count(*) filter (where utm_source = 'meta') as meta_paid,
         count(*) filter (where gclid is null and utm_source is null) as direct_or_organic
  from leads
  where created_at >= current_date - 7
  group by 1 order by 1 desc;
  ```

### Day 7: first review

- Total leads by channel
- Cost per lead by channel (manual: spend ÷ lead count for now; auto via dashboard Phase 3)
- Tier classification distribution (emergency / urgent / scheduled / general / spam) per channel — Meta lead ads tend to skew "spam"-heavy, that's the cost of cheap clicks
- Decision: **scale winning channels, cut losing channels** ONLY if a channel has ≥10 leads AND CPL is >2× the target (LSA target $55-90, Search $50-80, Meta $30-50)

### Day 14: ramp + storm-trigger reserve

- Release Tier-2/3 city budget ($2,500) once LSA + Search prove out in Tier-1
- Release storm-trigger reserve ($800) into rapid-response Meta ads if NWS issues hail/wind alert (Storm Watch tile on /dashboard/ already monitors this — wire the trigger to Meta Ads pause/resume API in Phase 2)

---

## Part 4 — Backend optimization engine (Phase 1, Week 2+)

This is where the closed-loop magic happens. **Everything below requires Phase 0 to be fully live for at least 7 days first** so we have real conversion data.

### 4.1 — Define what triggers `status='won'`

The `leads.status` column already exists with default `'new'`. We need to populate it as leads progress:

| Status | When it fires | Who/what sets it |
|---|---|---|
| `new` | Form submit | `handle-lead` (default) |
| `contacted` | Landon called/texted back (any outbound from Frame to lead) | **OPEN QUESTION** — see below |
| `estimated` | Estimate provided to homeowner | **OPEN QUESTION** |
| `won` | Contract signed | **OPEN QUESTION** — this fires conversion upload |
| `lost` | Homeowner went with competitor or no-decision >30 days | Auto-set by Supabase scheduled fn after 30 days inactive |

**Decision needed before building offline-conversion-sync:**

- **Option A — Manual via Google Sheet:** Landon updates a "Status" column in the existing Google Sheet (memory says webhook to Sheets is wired but Apps Script not done). Sheet → Apps Script → Supabase RPC. **Pros:** zero behavior change for Landon. **Cons:** he has to remember.
- **Option B — Twilio SMS state machine:** When Landon texts the lead from his real Twilio number, `sms_logs` table already records it → trigger flips `status` to 'contacted' automatically. When he texts "WON" to the bot (or replies to a daily summary), flip to 'won'. **Pros:** Landon already lives in SMS. **Cons:** more engineering, edge cases.
- **Option C — Daily ops digest with quick buttons:** Send Landon a daily SMS at 6pm with "Reply 1 for 'estimated', 2 for 'won', 3 for 'lost' on lead #123". Inbound webhook updates status. **Pros:** lowest-friction for Landon, no new UI. **Cons:** asynchronous, can lag.

**Recommendation:** Option C. Wire it in Phase 1 alongside the conversion-sync. Total ~2 days work.

**Source of truth rule:** Supabase `leads` is the system of record for lead status. Google Sheet, SMS replies, dashboard widgets, CallRail webhooks — anything that updates lead state — must write back to Supabase first. The offline-conversion-sync worker reads only from Supabase. No "Sheet has status=won but Supabase says contacted" drift allowed.

### 4.2 — `offline-conversion-sync` Supabase scheduled function

New file: `supabase/functions/offline-conversion-sync/index.ts`

Runs daily at 3am MT via `pg_cron` or external scheduler. Two upload paths per platform, prioritized:

#### Google Ads — two upload modes, complementary

**Mode A: Click-ID-based offline conversion import (primary)**

Google Ads' [Offline Conversion Import API](https://developers.google.com/google-ads/api/docs/conversions/upload-clicks) accepts one of: `gclid`, `gbraid`, `wbraid`. Requires `conversion_action`, `conversion_date_time`, `conversion_value`, and exactly one click identifier.

```typescript
// 1. Fetch leads ready for click-ID upload
const { data: googleClickLeads } = await supabase
  .from('leads')
  .select('id, gclid, gbraid, wbraid, won_at, job_value, conversion_upload_error')
  .eq('status', 'won')
  .or('gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null')
  .is('uploaded_to_google_ads_at', null);

const conversions = googleClickLeads.map(lead => {
  const conv = {
    conversion_action: `customers/${CUSTOMER_ID}/conversionActions/${CONVERSION_ACTION_ID}`,
    conversion_date_time: lead.won_at,
    conversion_value: lead.job_value || DEFAULT_CONVERSION_VALUE,
    currency_code: 'USD',
  };
  // Exactly one click ID per Google's spec — prefer gclid, fall back to gbraid/wbraid
  if (lead.gclid) conv.gclid = lead.gclid;
  else if (lead.gbraid) conv.gbraid = lead.gbraid;
  else if (lead.wbraid) conv.wbraid = lead.wbraid;
  return conv;
});
```

**Mode B: Enhanced Conversions for Leads (improves match rate on click-ID-less leads)**

Even when `gclid` is missing (cookie loss, ad blocker, direct call → form), Google can match via hashed first-party customer data. [Enhanced Conversions for Leads](https://support.google.com/google-ads/answer/13258081) accepts SHA-256-hashed email + phone and matches them against the user's Google account to rebuild the click attribution.

```typescript
// Helper: normalize before hashing per Google spec — lowercase, strip whitespace, E.164 phone
async function sha256(input) {
  const buf = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

const enhancedConversions = await Promise.all(
  closedLeadsWithoutClickId.map(async (lead) => ({
    conversion_action: `customers/${CUSTOMER_ID}/conversionActions/${CONVERSION_ACTION_ID}`,
    conversion_date_time: lead.won_at,
    conversion_value: lead.job_value || DEFAULT_CONVERSION_VALUE,
    currency_code: 'USD',
    user_identifiers: [
      lead.email ? { hashed_email: await sha256(lead.email.toLowerCase().trim()) } : null,
      lead.phone ? { hashed_phone_number: await sha256(normalizeToE164(lead.phone)) } : null,
    ].filter(Boolean),
  }))
);
```

Run both modes in the same daily job. Match rates are additive — Mode A captures direct paid-click attribution; Mode B recovers leads where click ID was lost.

#### Meta Conversions API — event_id deduplication is mandatory

The browser-side Meta Pixel already fires `Lead` on form submit (configured via GTM in Phase 0). When the server-side CAPI sends the SAME conversion later (with closed revenue), Meta must dedupe — otherwise the conversion is counted twice.

**The rule per [Meta's CAPI documentation](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events):** the browser Pixel and the server-side CAPI event MUST share **the same `event_name`** AND **the same `event_id`**.

Implementation:

```javascript
// 1. On form submit (client side, before fetch):
const eventId = crypto.randomUUID();  // stable, unique per lead
payload.event_id = eventId;           // include in handle-lead payload

// 2. GTM Meta Pixel Lead Event tag — fire with this event_id:
fbq('track', 'Lead', { value: 50, currency: 'USD' }, { eventID: eventId });
```

```typescript
// 3. handle-lead persists event_id into leads.event_id
// (add to schema below)

// 4. offline-conversion-sync, when pushing Meta CAPI Lead event for closed revenue:
const metaPayload = {
  data: [{
    event_name: 'Lead',                            // MUST match browser Pixel
    event_id: lead.event_id,                       // MUST match browser Pixel
    event_time: Math.floor(new Date(lead.won_at).getTime() / 1000),
    action_source: 'website',
    user_data: {
      em: [await sha256(lead.email.toLowerCase().trim())],
      ph: [await sha256(normalizeToE164(lead.phone))],
      fbc: lead.fbclid ? `fb.1.${browserTs}.${lead.fbclid}` : undefined,
    },
    custom_data: { value: lead.job_value || DEFAULT_VALUE, currency: 'USD' },
  }],
};
```

Without matching `event_name` + `event_id`, Meta will count both the Pixel Lead (at form submit) AND the CAPI Lead (at job close) as separate conversions → inflated ROAS in Meta dashboards, broken Smart Optimization.

**Needed credentials:** Google Ads OAuth refresh token + developer token + Customer ID + Conversion Action ID (per `data/SETUP-GTM-CONTAINER.md` Step 4). Meta Pixel ID + System User access token (long-lived). Both stored as Supabase Deno secrets, never in code.

**Schema additions required before this fn ships** — see Section 4.6.

**You are done when:** A closed-won test lead with both `gclid` + email/phone successfully uploads via Mode A (verify in Google Ads → Conversions → "Conversion goals" → conversion count ticks up within 24h with "Imported" attribution) AND a closed-won test lead WITHOUT `gclid` successfully matches via Mode B (Enhanced Conversions for Leads — verify in Google Ads → Conversions → "Diagnostics" shows match rate >0%) AND a Meta CAPI `Lead` event with matching `event_id` appears in Events Manager → Test Events with no "Duplicate" warning.

### 4.3 — Cannibalization detector

Goal: if Frame organically ranks #1-2 for a query AND we're bidding on that exact keyword in Google Search, the paid impression is mostly cannibalizing the free organic click. Pause that keyword.

Data sources:
- **Organic positions:** Google Search Console API (we already have GSC verified for `www.frameroofingutah.com/`)
- **Paid keywords:** Google Ads API `keyword_view` resource

Logic (new file: `scripts/cannibalization-detector.py`, runs weekly):
1. Pull top-100 organic queries from GSC where Frame is position ≤ 2
2. Pull all active Google Ads keywords from the Search campaigns
3. For each overlap:
   - If paid CTR > organic CTR on that query → **keep** (paid is incremental)
   - If paid CTR < organic CTR → **flag for pause**
4. Output: weekly Slack/SMS digest + dashboard tile

**You are done when:** Weekly cron runs on schedule, produces a digest with at least one real organic/paid overlap pulled from live GSC + Google Ads data, and writes flag rows to a new `cannibalization_flags` table (or equivalent persisted state) so the dashboard tile and weekly digest read from a stable source.

### 4.4 — Auto-pause unprofitable keywords (staged, not immediate)

A single roofing job can justify a lot of early spend ($1k-$30k ticket sizes). Aggressive same-day auto-pause kills experiments that would have worked. Use a 3-stage progression:

| Stage | Condition | Action |
|---|---|---|
| **Negative keyword sweep (always on)** | Search Terms report shows clearly irrelevant query (e.g. "free", "jobs", "DIY", competitor brand names) | Add to negative keyword list **immediately**, daily Slack alert |
| **Stage 1 — Flag only** (Day 1-14) | Keyword has >$200 spend AND 0 leads in 14 days | **Flag in dashboard + Slack alert.** No auto-pause. Ryan reviews weekly. |
| **Stage 2 — Pause candidate** (Day 15-30) | Keyword has >$300 spend AND 0 qualified leads (tier != 'spam') in 30 days | **Mark "pause candidate"** in dashboard. Ryan one-click pauses from dashboard or replies "pause kw_id_123" via SMS. |
| **Stage 3 — Auto-pause + alert** (Day 30+) | Keyword has >$500 spend AND 0 estimates or won jobs in 30 days | **PAUSE via Google Ads API** automatically + Slack/SMS alert with diagnosis. Manual override required to resume. |
| **Resume gate** | Manual resume only — no auto-resume | Prevents thrashing on volatile keywords |

This keeps Ryan in control during the learning period and only automates after the data is statistically meaningful. Industry benchmark for roofing closed ROAS is 2.46x ([Searchlight Digital 2026](https://searchlightdigital.io/roofing-google-ads-cost-per-lead/)); a keyword at $500 spend with zero estimates is well below that floor.

**You are done when:** Stage 1 (flag-only) is producing dashboard surfaces + Slack alerts for keywords crossing the threshold. Stage 2 + Stage 3 logic is built but gated behind a per-stage feature flag (`AUTO_PAUSE_STAGE_2_ENABLED`, `AUTO_PAUSE_STAGE_3_ENABLED` in app_config) — default off, manual enable per stage after 14 days of clean data.

### 4.5 — `/dashboard/` Phase 3 ROAS panel

New section between "Biggest Movers" and "Top Pages" on the existing dashboard at `/dashboard/`:

- **ROAS by channel** (last 7/30/60/90 days): LSA, Google Search, Meta Lead Ads, Organic, Direct
- **Closed CAC** per channel
- **Top-spending keywords** with closed ROAS (red if <3x, green if >5x)
- **Cannibalization flags** (queries where we rank organic AND pay for paid clicks)
- **Pending offline conversion uploads** (count of leads in `status='won'` not yet pushed to ad platforms)

Reuses the existing `dashboard/dashboard.js` Phase 2 pattern — silent-fails if config missing, no breaking changes.

**You are done when:** ROAS panel renders on `/dashboard/` with real closed-loop data once offline-conversion-sync has run at least 7 days. Silent-fails gracefully if sync hasn't run yet (shows "Pending first sync" placeholder, not a broken tile). Existing Phase 1+2 dashboard tiles continue to render unchanged.

### 4.6 — Required Supabase schema additions (before Phase 1 ships)

The 2026-05-10 migration covered the click-ID + UTM capture. Phase 1 needs more lifecycle fields. New migration `supabase/migrations/20260512_lead_lifecycle_fields.sql`:

| Column | Type | Purpose |
|---|---|---|
| `lead_source_channel` | text | Normalized channel name: `google_search`, `google_lsa`, `meta_lead_ads`, `organic`, `direct`, `referral`, `yelp`, `nextdoor`. Derived from `utm_source` + `referrer` heuristic in handle-lead. Use this in dashboard queries — much cleaner than re-parsing utm_source every time. |
| `lead_quality` | text | Mirrors `tier` (emergency/urgent/scheduled/general/spam) but as a separate column to allow human override (Landon marks a "general" lead as "qualified" after the call). |
| `first_contacted_at` | timestamptz | When Frame's first outbound message went to the lead (any channel). Powers speed-to-lead KPI. Set by trigger on `sms_logs` insert or manual flip. |
| `estimate_sent_at` | timestamptz | When an estimate was provided to the homeowner. Mid-funnel conversion event. Eligible for offline conversion upload as a secondary conversion action ("Estimate Sent", Google Ads supports multiple conversion actions per account). |
| `lost_reason` | text | Free-text for `status='lost'` rows: `'price'`, `'competitor'`, `'no-response'`, `'unqualified'`, `'out-of-area'`. Critical for channel-optimization analysis. |
| `event_id` | text | UUID generated client-side on form submit. Required for Meta Pixel + CAPI deduplication (Section 4.2). Also used for Google Ads transaction_id where applicable. |
| `gclsrc` | text | Google click source identifier — distinguishes Google Ads from other Google properties. Capture from URL if present (`gclsrc=aw.ds` etc). |
| `conversion_upload_error` | text | Error message if Google Ads or Meta CAPI upload failed. Nullable — set by offline-conversion-sync on retry exhaustion. Powers the daily sync health check (Section 4.7). |
| `last_synced_at` | timestamptz | Last time the offline-conversion-sync worker touched this row, regardless of success. Sync observability. |

Update `track-attribution.js` to capture `gclsrc` from URL (same pattern as gclid). Update form handlers to generate `event_id = crypto.randomUUID()` on submit and merge into payload (browser Pixel call must use the same value — see Section 4.2 Meta CAPI block).

**You are done when:** Migration `20260512_lead_lifecycle_fields.sql` is applied, handle-lead persists `event_id` end-to-end (form-side UUID matches the row), `track-attribution.js` captures `gclsrc`, and a new test lead row carries `event_id` + nullable lifecycle fields without breaking the existing tier classifier.

### 4.7 — Daily sync health check

The offline-conversion-sync is silent if it fails (3am job, Landon doesn't see logs). Wire a daily heartbeat:

- **Supabase scheduled fn** runs at 4am MT (1 hr after sync), queries:
  ```sql
  select
    count(*) filter (where status='won' and gclid is not null and uploaded_to_google_ads_at is null and won_at < now() - interval '48 hours') as overdue_google,
    count(*) filter (where status='won' and fbclid is not null and uploaded_to_meta_capi_at is null and won_at < now() - interval '48 hours') as overdue_meta,
    count(*) filter (where conversion_upload_error is not null) as errored,
    count(*) filter (where status='won' and won_at >= now() - interval '24 hours') as new_wins_today
  from public.leads;
  ```
- If `overdue_google + overdue_meta > 0` OR `errored > 0` → SMS Ryan + log to a `sync_health` table
- If all zero AND `new_wins_today > 0` → daily 6am "✓ Sync healthy. N wins synced." digest

Cost: ~$0/mo (Supabase scheduled fn + SMS via existing Twilio). Catches: silent API auth failures, schema drift after a migration, OAuth refresh token expiry (Google's refresh tokens can revoke if unused 6+ months).

**You are done when:** 4am cron runs successfully against real data, queries the 4 health counts, and either sends a green daily digest ("✓ Sync healthy. N wins synced today") or a red alert SMS. Verified end-to-end by intentionally breaking the sync once (e.g. expire the OAuth token for an hour) and confirming the alert fires within 24h.

---

## Part 5 — Budget allocation (live $15K/mo, no changes from Wave 1)

Split into two buckets for cleaner reporting: paid media (ad spend) vs growth infrastructure (reputation + organic).

### Paid media ($13,100/mo)

| Channel | $/mo | Goal | Measured by |
|---|---|---|---|
| **LSA** | $2,500 | 28-45 leads/mo @ $55-90 CPL | LSA dashboard + leads table `lead_source_channel='google_lsa'` |
| **Google Search — high-intent non-brand** | $3,900 | "roofer near me" / "hail damage repair {city}" / "insurance claim roof Utah" | Google Ads + `utm_campaign` tracking |
| **Google Search — branded defense** | $600 | Capture "frame roofing" queries before competitors bid on our name | Branded ROAS target 6x ([Searchlight 2026 benchmark](https://searchlightdigital.io/roofing-google-ads-cost-per-lead/)) |
| **Meta Lead Ads — Tier-1 cities** | $1,500 | Park City, Heber, Draper, SLC, Cottonwood Heights, Midway | Meta + leads table `lead_source_channel='meta_lead_ads'` |
| **Tier-2/3 city layer** | $2,500 | West Valley, Sandy, Bountiful, Lehi (mix of Search + Meta) | Per-city CAC |
| **YouTube + TikTok organic + light boost** | $1,300 | Reuse Heber drone footage, retarget Meta visitors | Engagement + retargeting CPM |
| **Storm-trigger reserve** | $800 | Hold for hail/wind events May-Sept + ice-dam Dec-Feb | Trigger when NWS alert active |
| **Yelp decision pending** | $0 or $510 | $510/mo only if existing trial data shows ≥3 leads/mo | TBD post-decision |
| **Paid media subtotal** | **$13,100** | | |

### Growth infrastructure ($2,400/mo) — NOT ad spend, treated separately for reporting

| Item | $/mo | Goal | Measured by |
|---|---|---|---|
| **Reviews acquisition** ⭐ | $1,700 | Get 20→50 reviews in 90 days (LSA ranking threshold) | `reviews.json` velocity |
| **Content moat** | $700 | 5-8 high-EV pillar pages (Wave 1 narrowed scope) | Pillar page organic clicks |
| **Infrastructure subtotal** | **$2,400** | | |

### Optional add-ons (not in $15K but may be necessary at scale)

| Item | $/mo | Required when | Notes |
|---|---|---|---|
| Call tracking (CallRail or equivalent) | $40-50 | Paid spend > $5K/mo | Closes the call-attribution gap. See Section 2.5. |
| Review-acquisition platform (Birdeye/NiceJob/Podium) | $200-400 | Always — replaces or augments the $1,700 manual budget | Pricing varies; treat as alternative to manual workflow within the $1,700 reviews line |

**Total $15,000/mo with both buckets.** Phase 1 productization (sell the engine as Perfect Stack add-on) is what funds the optional add-ons without raising Landon's budget.

### Per-channel CAC targets (informs auto-pause)

| Channel | Target CAC (Cost per closed job) | Lead CR assumption | Target CPL |
|---|---|---|---|
| LSA | $400-600 | 15-25% lead → close | $60-150 |
| Google Search high-intent | $500-800 | 10-20% close | $50-160 |
| Meta Lead Ads | $300-500 | 5-10% close | $15-50 |
| Branded search | $200-400 | 30-40% close | $60-160 |
| Organic | $0 (free) | 8-15% close | $0 |

Auto-pause triggers when CAC > 1.5× target for 14 consecutive days AND ≥10 leads have been measured (statistical floor).

---

## Part 6 — KPIs + decision triggers

### Required conversion events (granular, micro + macro)

Track all 7 of these in PostHog + GTM dataLayer so we have both browser-side analytics and ad-platform tag firing:

| Event | Where it fires | Fires what |
|---|---|---|
| `phone_click` | Any `tel:` link click | PostHog phone_click (already wired) + optional Google Ads Call conversion |
| `form_start` | First field focus on hero/lead/modal form | PostHog form_start (not yet wired — add in next PR) — measures form abandonment |
| `form_submit` | Form fetch returns 200 | dataLayer.push (already wired) → GTM → Google Ads Lead Conversion + Meta Pixel Lead |
| `thank_you_view` | Landing on /thank-you?lead=success | PostHog `lead_thank_you_view` (already wired) — funnel completion verification |
| `qualified_lead` | handle-lead classifier returns tier in {emergency,urgent,scheduled} | Server-side event in Supabase + optional Google Ads secondary conversion ("Qualified Lead") |
| `estimate_sent` | Landon manually flips lead → `status='estimated'` | Server-side event + Google Ads secondary conversion ("Estimate Sent") + Meta CAPI custom event |
| `won_job` | Landon flips lead → `status='won'` | Triggers offline-conversion-sync → Google Ads primary conversion with `conversion_value=job_value` + Meta CAPI Lead with same event_id as browser Pixel |

Micro (start/click) tells us about traffic quality. Macro (estimate/won) tells us about money. Both feed Smart Bidding once Phase 1 is live.

### Daily KPIs (check on /dashboard/)

| Metric | Green | Yellow | Red |
|---|---|---|---|
| Lead volume (last 7d rolling) | ≥30 | 15-29 | <15 |
| Speed-to-lead (time from submit → `first_contacted_at`) | <5 min | 5-15 min | >15 min |
| Spam rate (handle-lead tier='spam') | <5% | 5-15% | >15% |
| Emergency-tier leads | (no target — track for capacity) | | |
| Form submit → /thank-you redirect | 100% | 95-99% | <95% (something broken) |
| Offline-conversion-sync health (Section 4.7) | All green | Any overdue | Errored OR sync skipped |

### Weekly KPIs (review Mondays)

| Metric | Green | Yellow | Red |
|---|---|---|---|
| LSA leads vs target | 7+/week | 4-6/week | <4/week |
| Google Search non-brand CPL | ≤$80 | $80-130 | >$130 |
| Branded ROAS | ≥6x | 3-6x | <3x |
| Meta lead quality (non-spam tier) | ≥70% | 50-70% | <50% |
| Reviews delta (week-over-week) | +3+ | +1-2 | 0 |

### Monthly KPIs (review 1st of month)

| Metric | Green | Yellow | Red |
|---|---|---|---|
| Total leads | ≥120/mo | 80-119 | <80 |
| Closed jobs from paid | ≥18 | 10-17 | <10 |
| Blended CAC | ≤$700 | $700-1,100 | >$1,100 |
| Closed ROAS (revenue ÷ spend) | ≥3x | 2-3x | <2x |
| Total ad spend (actual vs $15K) | $14-15K | $11-13K or $15-16K | <$11K or >$16K |

### Decision triggers (automated where possible)

| Condition | Action |
|---|---|
| LSA approved + ≥30 conversions in 14 days | Increase LSA budget 50% ($2,500 → $3,750) |
| Google Search keyword has >$200 spend + 0 conversions in 14 days | **AUTO-PAUSE** via Google Ads API |
| Meta Lead Ad CPL > $80 for 7 days | Switch from "Leads" optimization to "Conversions" (requires Pixel data) |
| Branded ROAS drops below 4x | Investigate — competitor likely bidding on our brand |
| Reviews count crosses 50 | Move $400 of reviews budget into Tier-2 cities (LSA threshold unlocked) |
| NWS hail alert in Utah | Trigger Meta rapid-response ads from storm reserve ($800 pool) |
| Closed ROAS hits 5x for 30 days | Increase total monthly budget 20% (test scale ceiling) |

---

## Part 7 — Open decisions before launch

| # | Decision | Default if no decision | Who decides |
|---|---|---|---|
| 7.1 | Default conversion value uploaded to Google Ads when `job_value` unknown | $50 (per LSA per-lead pricing midpoint) | Ryan + Landon — discuss in Day 7 review |
| 7.2 | Yelp $510/mo: take it or skip? | Skip (trial expired with insufficient data to justify) | Landon (it's his cash) |
| 7.3 | Bing Ads — add or skip? | Skip Phase 0, revisit Phase 2 | Ryan — Bing CPC is 30% cheaper but volume is small in roofing |
| 7.4 | How does `status='won'` get set? (Section 4.1) | Option C — daily SMS digest with reply-codes | Ryan + Landon |
| 7.5 | Smart Bidding strategy: Maximize Conversions vs Maximize Conversion Value | Maximize Conversions for first 30 days (no value signal yet), then flip to Maximize Conversion Value once offline-conversion-sync is live and Smart Bidding has $-value data | Auto-flip on Day 30 of Phase 1 |
| 7.6 | Manager (MCC) account or direct? | Direct (Frame's own Google Ads account) — Landon owns it | Already decided |

---

## Part 8 — Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LSA verification delayed >7 days | Medium | Blocks $2,500/mo channel | Run Google Search + Meta in parallel; they don't need LSA verification |
| GBP suspension during ad launch | Low | Massive — kills LSA + brand search rankings | Don't edit GBP profile during launch. April-2026 mass-suspension memory applies. |
| Twilio 10DLC re-blocked | Low | Customer auto-text fails, but Verizon gateway is the working primary anyway | Verizon gateway in handle-lead is the fallback, currently the primary working path |
| Resend domain not verified before v8 deploy | High (today) | Email notifications fail silently | Verify DNS before deploy (Section 1.6 + Section 2.1 order) |
| Smart Bidding under-spends in first 30 days | High | Slow ramp | Set Target Impression Share to 80% on top 5 keywords as a backstop |
| Click fraud on Google Search non-brand | Medium | 5-15% of spend wasted | Enable IP exclusions for known bot ranges; review Search Terms report weekly Day 1-30 |
| Frame UT ranks organically for terms we're paying for | High | Cannibalization wastes paid spend | Cannibalization detector (Section 4.3) catches this |
| Landon ignores `status='won'` updates | High | Offline conversion sync starves, Smart Bidding never gets revenue signal | Daily SMS digest (Option C from 4.1) — friction must be near-zero |
| **Call leads are not attributed correctly** | **High** | **High — >50% of paid traffic for roofing is phone** | **Wire DNI call tracking before paid spend exceeds $5K/mo (Section 2.5)** |
| **LSA lead quality is poor / billed for bad-fit leads** | Medium | Medium — wastes per-lead spend | Aggressively dispute invalid leads in LSA dashboard within 30-day window; tighten service-area + services list if disputes >15% |
| **Meta lead spam is high** | High | Medium — pollutes Smart Bidding signal | Add qualifying questions in instant form (ZIP, "do you own this home?", "timeline?"); fast follow-up within 5 min — most spam abandons; aggressively mark spam tier in CRM so CAPI back-feeds the negative signal |
| **Offline conversion upload fails silently** | Medium | High — Smart Bidding starves of revenue signal | Daily sync health check (Section 4.7) + error logging in `conversion_upload_error` column + Slack/SMS alert on first failure |
| **Landon misses speed-to-lead window** | Medium | High — every minute >5 cuts close rate 30-40% | Immediate SMS notification (handle-lead already wired) + missed-lead escalation: if `first_contacted_at` is null after 15 min during business hours, second SMS to Landon with louder formatting + tier upgrade |
| **Duplicate conversions counted** | Medium | High — inflated ROAS leads to wrong scaling decisions | Meta event_id deduplication (Section 4.2); Google Ads order_id where applicable; daily reconciliation query comparing platform-reported conversions vs Supabase `status='won'` count |
| **Reviews acquisition violates platform rules** | Low-Medium | High — Google review purge could nuke 20→0 overnight | Don't incentivize reviews (Google TOS violation); don't gate negative reviews (TOS violation + manipulation flag); ask for honest reviews only; use Google's official "ask for reviews" link from GBP, never third-party gating tools |

### Bail-out conditions — when to stop building, not optimize

The risk table above lists threats and mitigations. **This table lists thresholds at which the right move is to STOP building Phase 1 and re-plan**, not push through with optimization. When any of these fires, page back to Part 7 open decisions and reassess.

| Trigger | Stop and... |
|---|---|
| LSA verification delayed >14 days | Halt Phase 1 build. Revisit Part 5 allocation — shift LSA budget into Search/Meta before building offline-conversion-sync (no point optimizing a channel that hasn't gone live). |
| Smart Bidding under-spending <50% of daily budget after 30 days of conversion data | Switch top campaigns to **Manual CPC** or **Maximize Clicks** until data density is sufficient. Pause Phase 1 conversion-value work until baseline conversion volume exists (Google needs ~30 conv/30d minimum). |
| Offline-conversion-sync match rate <30% after 30 days | Diagnose PII hashing pipeline + `event_id` plumbing before adding new conversion tags. Broken upstream attribution invalidates every downstream optimization decision. |
| Closed ROAS <1.5x after 60 days of clean closed-loop data | **Pause paid spend entirely.** The problem is upstream of bidding (pricing, sales close rate, lead quality, capacity) — adding tooling will not fix it. Escalate to Landon for product/process diagnosis before any further build. |
| Duplicate conversions appearing in Google Ads OR Meta dashboards | Emergency `event_id` + `order_id` audit. Do not increase bids or scale spend until dedup is verified across browser Pixel + server-side CAPI + offline conversion paths. |
| 2 consecutive daily sync-health alerts (Section 4.7) | Pause Stage 2/3 auto-pause logic AND any budget changes until upload reliability is restored 7 consecutive days. Untrusted data → untrusted decisions. |
| GBP suspension during launch | **Stop all paid spend immediately.** Paid clicks landing on a Google-flagged GBP profile compound the trust signal damage. Reinstate GBP first via appeal flow before resuming. |

The pattern: **don't optimize on top of broken foundations.** Phase 1 work assumes Phase 0 data is trustworthy; if Phase 0 breaks, fix Phase 0 first.

---

## Part 9 — Phase 2+ (post-Phase 1 stable)

After 60 days of clean closed-loop data:

- **Auto-suppress cannibalization** — currently flag-only; flip to auto-pause via API
- **Productize as `~/projects/roas-engine/`** — extract Frame UT-specific bits, parameterize via config (geo-aeo-tracker pattern). Sell as Perfect Stack Growth tier add-on ($800/mo retainer)
- **Port to Frame TX** post-Dallas-launch (5/27) — same engine, different brand kit
- **LinkedIn Ads** — if Frame moves into commercial roofing (gov + property management)
- **Programmatic landing pages per ad** — match keyword intent to dedicated landing page variant (`/heber-hail-repair`, `/sandy-storm-damage`) — lifts CR 20-40% vs generic homepage landing

---

## Quick start: literal order of operations

If you only read one section, read this one:

1. **Today (Landon, 30 min):** Steps 1.1 + 1.3 (start the LSA verification flow NOW — whatever Google asks for, kick it off; it's the long pole)
2. **Today (Ryan, 30 min):** Apply migration + deploy v8 edge fn + PR the attribution capture (Section 2.1-2.2) — gated on Step 6 below being done first
3. **Today (Landon, 10 min):** DNS records for Resend (Section 1.6) — using the exact records the Resend dashboard provides — must be done BEFORE Ryan tries to deploy v8 (handle-lead will fail-silent on outbound email otherwise)
4. **Tomorrow (both, 15 min):** Landon does Steps 1.2 (GBP confirm), 1.5 (GTM invite), 1.4 (Meta if doing it). Ryan starts campaign builds in paused state.
5. **Day 3-5 (Ryan, 1 hr):** GTM tag config (Section 2.3) + end-to-end smoke test (Section 2.4)
6. **Day 5-7:** Wait for LSA verification + decide on call tracking provider (Section 2.5) so it can go live with paid spend
7. **Day 7 (LSA clears):** Activate all paused campaigns (Section 3 Day 0)
8. **Day 14:** First real-data review. Discuss Phase 1 build (closed-loop engine + lifecycle schema fields per Section 4.6)
9. **Day 30:** Ship Phase 1 (`offline-conversion-sync` + dashboard ROAS panel + status-update flow + daily sync health check per Section 4.7)
10. **Day 60:** Closed-loop data clean → consider flipping Smart Bidding from "Maximize Conversions" to "Maximize Conversion Value" → staged auto-pause (Section 4.4) progresses from flag-only to pause-candidate to auto-pause

That's the whole playbook. The long pole stopping Day 1 is whatever Google Local Services verification requires (which we won't know exactly until Landon starts the LSA flow). Most remaining work can happen in parallel during that wait.
