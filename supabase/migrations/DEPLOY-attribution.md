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

## Deploy order (do these in sequence)

### 1. Apply the migration (Supabase, ~10 sec)

Either via Supabase CLI:
```bash
supabase db push --project-ref hdcflshhomzildwqlmwh
```
Or paste the SQL body into the [SQL editor](https://supabase.com/dashboard/project/hdcflshhomzildwqlmwh/sql) and run.

Verify:
```sql
\d public.leads
-- Should show: gclid, fbclid, msclkid, gbraid, wbraid,
-- utm_source/medium/campaign/term/content,
-- landing_page, referrer, won_at,
-- uploaded_to_google_ads_at, uploaded_to_meta_capi_at
```

### 2. Deploy the edge function (Supabase, ~20 sec)

```bash
cd ~/projects/frame-restoration-utah
supabase functions deploy handle-lead \
  --project-ref hdcflshhomzildwqlmwh \
  --no-verify-jwt
```

### 3. Push the frontend (Vercel auto-deploys from main)

```bash
git checkout -b feat/attribution-capture
git add track-attribution.js global-modal.js index.html supabase/
git commit -m "feat(attribution): wire gclid/fbclid/utm capture + thank-you redirect"
git push -u origin feat/attribution-capture
gh pr create --fill --auto --squash
```

### 4. End-to-end smoke test (~2 min, after Vercel deploys preview)

Append a fake gclid to the preview URL and submit the form:

```
https://{preview-url}.vercel.app/?gclid=test_gclid_abc&utm_source=google&utm_medium=cpc&utm_campaign=heber-storm-test
```

Expected:
1. Form submits successfully
2. Redirects to `/thank-you?lead=success&form=hero`
3. Supabase shows a new row in `leads` with `gclid='test_gclid_abc'`, `utm_source='google'`, `utm_medium='cpc'`, `utm_campaign='heber-storm-test'`

Run this query in SQL editor:
```sql
select id, created_at, name, gclid, utm_source, utm_medium, utm_campaign, landing_page
from public.leads
order by created_at desc limit 5;
```

If the gclid lands correctly → ship to main. If not → check browser console for `track-attribution.js` errors before merging.

## What's NOT in this PR (intentional, Phase 1+)

- **GTM container install** — Landon doesn't have one yet. The `dataLayer.push({event:'form_submit'})` calls still fire (they have since 2026 baseline); they just have no consumer. Once Landon creates a GTM container at [tagmanager.google.com](https://tagmanager.google.com), drop the loader snippet into the head of every page (same pattern as `track-attribution.js`) and the conversion tag fires automatically. **No further frontend code change needed.**
- **Google Ads conversion tag** — configured inside GTM, not in code. Trigger on `form_submit` dataLayer event. Conversion ID + label from Landon's Google Ads account.
- **Meta Pixel + Conversions API** — pixel via GTM (same pattern). CAPI server-side push in `offline-conversion-sync` Supabase fn — separate PR.
- **`offline-conversion-sync` Supabase fn** — daily worker that reads `leads WHERE status='won' AND gclid IS NOT NULL AND uploaded_to_google_ads_at IS NULL`, batch-uploads via [Google Ads Offline Conversion Import API](https://developers.google.com/google-ads/api/docs/conversions/upload-clicks). Build target: this week.
- **Dashboard Phase 3 ROAS panel** — depends on offline-conversion-sync. Build target: this week.

## Rollback plan

If anything breaks:

1. **Migration rollback** (additive only, but if needed):
   ```sql
   alter table public.leads
     drop column if exists gclid, drop column if exists fbclid,
     drop column if exists msclkid, drop column if exists gbraid,
     drop column if exists wbraid, drop column if exists utm_source,
     drop column if exists utm_medium, drop column if exists utm_campaign,
     drop column if exists utm_term, drop column if exists utm_content,
     drop column if exists landing_page, drop column if exists referrer,
     drop column if exists won_at,
     drop column if exists uploaded_to_google_ads_at,
     drop column if exists uploaded_to_meta_capi_at;
   alter table public.leads drop constraint if exists leads_status_check;
   ```

2. **Edge function rollback**: redeploy the prior version via `supabase functions deploy handle-lead --project-ref hdcflshhomzildwqlmwh --no-verify-jwt` from the previous git SHA.

3. **Frontend rollback**: `git revert` the PR — the `<script>` tag injection is reversible by deleting that one line from each HTML file (perl one-liner can do it):
   ```bash
   find . -name "*.html" -not -path "./archive/*" -exec \
     perl -i -ne 'print unless m|<script src="/track-attribution.js" defer></script>|' {} \;
   ```

## Open questions for next session

- **Define what triggers `status='won'`**: manual update via Landon's CRM workflow? Or automated when `job_value` becomes non-null? Decision blocks the offline-conversion-sync worker design.
- **Conversion value for the upload**: use actual `job_value` once known, or an estimated lead value (e.g., `$1,200` average per Searchlight 2026 roofing benchmark) for faster feedback to Google Ads' Smart Bidding?
- **GTM container**: who creates it — Ryan or Landon? Needs to be on Landon's Google Workspace ideally so it's owned by the business, not the contractor. Workflow: Landon creates → grants Ryan publish access.
