# Deploy Notes — 2026-05-10 Attribution Capture

Phase 0 of the closed-loop ROAS engine. All changes additive — no behavior break for existing leads.

## What's in this PR

| File | Purpose |
|---|---|
| `track-attribution.js` (new, root) | Captures `gclid`/`fbclid`/`msclkid`/`gbraid`/`wbraid` (last-touch, 90d localStorage) + `utm_*` (first-touch, sessionStorage) + `landing_page` + `referrer`. Exposes `window.FrameAttribution.get()`. |
| `supabase/migrations/20260510_add_attribution_columns.sql` (new) | Adds 15 columns to `leads` + 2 partial indexes + status CHECK constraint. |
| `supabase/functions/handle-lead/index.ts` (modified) | Destructures + persists the new attribution fields. Backwards-compatible — pre-attribution payloads still work. |
| `index.html` (modified) | Hero form + Lead form: merge `FrameAttribution.get()` into payload; on success, redirect to `/thank-you?lead=success&form={hero,contact}` instead of inline-replace. |
| `global-modal.js` (modified) | Modal form: same attribution merge + redirect to `/thank-you?lead=success&form=modal`. |
| 134 HTML pages (modified) | `<script src="/track-attribution.js" defer></script>` injected before `</head>`. |

## Historical rollout state — do not execute

The attribution migration, handler change, frontend change, and original smoke
test were completed in 2026. No command in this record authorizes a current
production mutation or lead submission. Future Utah migration, protected
function deployment, rollback, and controlled-test work must use
`supabase/functions/handle-lead/DEPLOY.md`, the canonical clean repository,
exact-main CI, and fresh signed receipts.

## What's NOT in this PR (intentional, Phase 1+)

- **GTM container install** — Landon doesn't have one yet. The `dataLayer.push({event:'form_submit'})` calls still fire (they have since 2026 baseline); they just have no consumer. Once Landon creates a GTM container at [tagmanager.google.com](https://tagmanager.google.com), drop the loader snippet into the head of every page (same pattern as `track-attribution.js`) and the conversion tag fires automatically. **No further frontend code change needed.**
- **Google Ads conversion tag** — configured inside GTM, not in code. Trigger on `form_submit` dataLayer event. Conversion ID + label from Landon's Google Ads account.
- **Meta Pixel + Conversions API** — pixel via GTM (same pattern). CAPI server-side push in `offline-conversion-sync` Supabase fn — separate PR.
- **`offline-conversion-sync` Supabase fn** — daily worker that reads `leads WHERE status='won' AND gclid IS NOT NULL AND uploaded_to_google_ads_at IS NULL`, batch-uploads via [Google Ads Offline Conversion Import API](https://developers.google.com/google-ads/api/docs/conversions/upload-clicks). Build target: this week.
- **Dashboard Phase 3 ROAS panel** — depends on offline-conversion-sync. Build target: this week.

## Historical rollback instructions retired

Do not execute selective schema drops, direct function redeploys, or bulk file
rewrites from this record. Any current rollback must start with a reviewed
forward repair or revert on `main` and follow the migration, receipt, deploy,
and verification contracts in `supabase/functions/handle-lead/DEPLOY.md`.

## Open questions for next session

- **Define what triggers `status='won'`**: manual update via Landon's CRM workflow? Or automated when `job_value` becomes non-null? Decision blocks the offline-conversion-sync worker design.
- **Conversion value for the upload**: use actual `job_value` once known, or an estimated lead value (e.g., `$1,200` average per Searchlight 2026 roofing benchmark) for faster feedback to Google Ads' Smart Bidding?
- **GTM container**: who creates it — Ryan or Landon? Needs to be on Landon's Google Workspace ideally so it's owned by the business, not the contractor. Workflow: Landon creates → grants Ryan publish access.
