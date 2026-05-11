# Frame Utah — GTM Container Setup Playbook

**Status:** ready to execute · **Owner:** Ryan (`ryanconwell99@gmail.com`) via delegate access to Landon's Google Workspace · **Time:** ~30 min · **Cost:** $0

## Why this matters

The 2026-05-10 attribution PR shipped `dataLayer.push({event: 'form_submit', form_name: ...})` calls on all 3 forms (hero, lead, modal). These pushes are firing right now, but nothing consumes them — GTM is the consumer. Once GTM is in place:

- Google Ads Conversion tag fires automatically on every form submit → Smart Bidding actually optimizes for leads instead of clicks
- Meta Pixel `Lead` event fires automatically → Meta lead ads optimize for real leads
- Microsoft Ads UET works the same way if/when we add Bing
- No more frontend code changes — all future ad-platform tags configured inside GTM

## Critical decision: which Google account owns the container?

**Recommended path:** Create under **Landon's Google Workspace**. Business owns the container, you have admin/publish rights.

Why:
- If you ever stop managing Frame UT, the container survives the handoff
- Landon can grant additional team members (Connor, future hires) access without your involvement
- Container's account ID is tied to Landon's Workspace billing → no risk of orphaned tags if your personal Gmail changes

**Login flow:**
1. Sign out of your personal `ryanconwell99@gmail.com`
2. Sign in as `landon@framerestorations.com` (or whatever the company Gmail is — confirm with Landon)
3. Create container as Landon
4. Then invite `ryanconwell99@gmail.com` as **Admin** so you can publish without re-logging-in

If that login flow is awkward, alternative: create container under your account → transfer ownership to Landon later. Works fine but creates a future cleanup task.

---

## Step 1 — Create the container (~3 min)

1. Go to https://tagmanager.google.com while logged into Landon's account
2. **Create Account**
   - Account name: `Frame Roofing Utah`
   - Country: `United States`
3. **Setup Container**
   - Container name: `frameroofingutah.com`
   - Target platform: **Web**
4. Accept Terms of Service
5. Container created → you'll see a modal with two snippets. **Copy the Container ID** (looks like `GTM-XXXXXXX`). You'll need it in Step 2.
6. **Don't close the modal yet** — copy both code blocks. We'll put them in Step 3.

---

## Step 2 — Invite yourself as Admin (~1 min)

Inside the container (after the install modal):

1. Top-left → click the Container ID dropdown → **Admin**
2. **User Management** → **+** (add user)
3. Email: `ryanconwell99@gmail.com`
4. Account permissions: **Admin**
5. Container permissions: **Publish**
6. Invite → done

Now you can publish container updates from your own login without switching accounts. From this point forward, do all GTM config work from `ryanconwell99@gmail.com`.

---

## Step 3 — Install the GTM loader site-wide (~5 min)

GTM gives you two snippets. The first goes in `<head>` (as high as possible, ideally above `track-attribution.js`). The second goes immediately after `<body>` (noscript fallback).

### Get the snippets from GTM

In the install modal (or `Admin → Install Google Tag Manager`):

**Snippet A — `<head>`:**
```html
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>
<!-- End Google Tag Manager -->
```
(Replace `GTM-XXXXXXX` with your real container ID.)

**Snippet B — after `<body>`:**
```html
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
```

### Inject site-wide (same idempotent pattern as track-attribution.js)

From `~/projects/frame-restoration-utah`, run this (replace `GTM-XXXXXXX` with your actual ID before pasting):

```bash
GTM_ID="GTM-XXXXXXX"   # ← paste your real ID here

# Inject <head> snippet — placed BEFORE track-attribution.js so GTM dataLayer is
# initialized first
HEAD_SNIPPET='<!-- Google Tag Manager -->\n<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;f.parentNode.insertBefore(j,f);})(window,document,"script","dataLayer","'"$GTM_ID"'");</script>\n<!-- End Google Tag Manager -->\n'

find . -name "*.html" \
  -not -path "./archive/*" -not -path "./tmp-*" -not -path "./node_modules/*" \
  -not -path "./data/*" -not -path "./images/projects/*" | while read f; do
  grep -q "GTM-" "$f" && continue        # idempotent
  grep -q "</head>" "$f" || continue     # skip fragments
  perl -i -pe 'BEGIN{$snip=`cat /tmp/gtm_head.txt`} s|<script src="/track-attribution.js"|$snip  <script src="/track-attribution.js"| if !$done && /<script src="\/track-attribution\.js"/ && ($done=1)' "$f"
done
```

(Easier: just write a small `inject-gtm.sh` script — or do the same perl one-liner I wrote for track-attribution.js with the GTM head snippet as the replacement. Pattern is identical.)

For the noscript fallback (Snippet B), inject after `<body`:

```bash
NOSCRIPT_SNIPPET='\n<!-- Google Tag Manager (noscript) -->\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id='"$GTM_ID"'"\nheight="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n<!-- End Google Tag Manager (noscript) -->'

find . -name "*.html" \
  -not -path "./archive/*" -not -path "./tmp-*" -not -path "./node_modules/*" \
  -not -path "./data/*" -not -path "./images/projects/*" | while read f; do
  grep -q "googletagmanager.com/ns.html" "$f" && continue
  grep -q "<body" "$f" || continue
  perl -i -pe "s|(<body[^>]*>)|\\1$NOSCRIPT_SNIPPET|" "$f"
done
```

**Note:** you might find it cleaner to ask me to run these injections in our next session once you have the real `GTM-XXXXXXX`. Same one-line-per-file pattern as the attribution capture — low risk, fully idempotent.

---

## Step 4 — Pull the conversion identifiers from Landon's Google Ads (~5 min)

Before configuring the GTM conversion tag, you need 3 values from Google Ads:

1. **Conversion ID** — looks like `AW-1234567890`. Found at: Google Ads → Tools → Conversions → click the conversion → Tag Setup → "Conversion ID"
2. **Conversion Label** — looks like `aBcD1234EfGh-IjK`. Same page, "Conversion Label"
3. **Customer ID** — the 10-digit account ID at top-right of any Google Ads screen. Format: `123-456-7890`

If Landon doesn't have a conversion action set up yet:

- Google Ads → Tools → Conversions → **+ New conversion action**
- Conversion source: **Website**
- Goal: **Submit lead form**
- Conversion name: `Frame Roofing Utah - Lead Form Submit`
- Value: `Use the same value for each conversion` → `$50` (rough lead-value estimate; Smart Bidding learns the actual value over time from `won_at` updates we push via offline conversion sync later)
- Count: `One` (per click)
- Conversion window: `30 days`
- Attribution model: `Data-driven` (Google's default, best for limited-data accounts)
- Save → grab Conversion ID + Label

Also pull Meta Pixel ID if you're running (or planning to run) Meta lead ads:
- Meta Business Manager → Events Manager → Pixel ID (15-digit number)

---

## Step 5 — Configure tags inside GTM (~10 min)

In GTM, click **Tags → New** four times to create these:

### Tag 1: Google Ads Conversion Linker (foundational — required for accurate gclid tracking)

- Tag type: **Google Ads Conversion Linker**
- No config needed
- Triggering: **All Pages**
- Save as `Google Ads - Conversion Linker`

### Tag 2: Google Ads Lead Conversion (the money tag)

- Tag type: **Google Ads Conversion Tracking**
- Conversion ID: `AW-XXXXXXXXXX` (from Step 4)
- Conversion Label: `aBcD...` (from Step 4)
- Conversion Value: leave blank (we'll push `$50` from dataLayer later; for now Smart Bidding uses the default account-level value)
- Transaction ID: leave blank (we don't have a stable lead_id at submit yet — that's a Phase 2 enhancement)
- Triggering: **Create new trigger**
  - Trigger type: **Custom Event**
  - Event name: `form_submit`
  - Fires on: **All Custom Events**
- Save as `Google Ads - Lead Conversion`

### Tag 3: Meta Pixel Base Code (only if running Meta ads)

- Tag type: **Custom HTML**
- HTML:
  ```html
  <script>
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', 'PIXEL_ID_HERE');
    fbq('track', 'PageView');
  </script>
  ```
  (Replace `PIXEL_ID_HERE` with your real Meta Pixel ID.)
- Triggering: **All Pages**
- Save as `Meta Pixel - Base`

### Tag 4: Meta Pixel - Lead Event

- Tag type: **Custom HTML**
- HTML:
  ```html
  <script>fbq('track', 'Lead');</script>
  ```
- Triggering: same `form_submit` Custom Event trigger you created for Tag 2
- Tag firing options: **Once per event**
- Save as `Meta Pixel - Lead Event`

---

## Step 6 — Verify before publishing (~5 min)

1. Inside GTM, top-right → **Preview**
2. Enter `https://frameroofingutah.com` → Connect
3. New tab opens with your live site + GTM debugger panel at bottom
4. Append `?gclid=test_verify_2026_05_10` to the URL
5. Submit the hero form
6. In the debugger panel, scroll to the `form_submit` custom event
7. Verify:
   - **Google Ads - Conversion Linker** fired on initial page load ✓
   - **Google Ads - Lead Conversion** fired on `form_submit` ✓
   - **Meta Pixel - Lead Event** fired on `form_submit` ✓ (if you added Meta)

If anything didn't fire, check the trigger event name spelling — must be `form_submit` (snake_case, matches what our frontend pushes).

Also verify in **Google Ads → Tools → Conversions** — your conversion action's "All conversions" count should tick up by 1 within ~3 hours.

---

## Step 7 — Publish (~30 sec)

GTM top-right → **Submit**:
- Version name: `Initial setup - conversion tracking`
- Description: `Google Ads + Meta Pixel conversion on form_submit. Conversion Linker on all pages.`
- → **Publish**

Done. From this point, every form submission on Frame Utah fires real conversions to Google Ads and Meta — and Smart Bidding starts learning which keywords/campaigns produce leads vs noise.

---

## What this unlocks vs what's still pending

### Unlocked immediately (after publish)

- ✅ Google Ads Smart Bidding can optimize for leads (was running blind)
- ✅ Meta lead ads optimize for actual leads (was clicks-only)
- ✅ Per-channel ROAS becomes visible in Google Ads + Meta dashboards
- ✅ Microsoft Ads UET / Pinterest / LinkedIn can be added later — same dataLayer event, same GTM trigger, no code changes

### Still pending (Phase 1+ — offline conversion sync)

- ❌ Closed-loop attribution back to actual job value (not lead count)
- ❌ Suppress unprofitable keywords automatically
- ❌ Cannibalization detector (paid + organic competing on same query)
- ❌ /dashboard/ Phase 3 ROAS panel

Phase 1 work assumes this GTM step is done — the `offline-conversion-sync` Supabase fn needs the `gclid` (already captured by `track-attribution.js`) plus the Google Ads `customer_id` + `conversion_action_id` from Landon's account to upload offline conversions.

---

## Values to capture before next session

Once you've done Steps 1-7, jot these somewhere we can reference (probably `data/` in this repo — no PII, but vercelignored):

| Variable | Where to find | Format |
|---|---|---|
| GTM Container ID | GTM container header | `GTM-XXXXXXX` |
| Google Ads Customer ID | top-right of any Google Ads screen | `123-456-7890` |
| Conversion Action ID | URL path when viewing the conversion (`/conversion_actions/12345`) | numeric |
| Conversion ID | Conversion tag setup page | `AW-1234567890` |
| Conversion Label | Conversion tag setup page | `aBcD1234EfGh-IjK` |
| Meta Pixel ID (if applicable) | Events Manager | 15-digit number |
| OAuth Refresh Token (Google Ads API, for offline conversion uploads) | requires OAuth dance — separate doc in Phase 1 | hex string |

The last one (OAuth refresh token) is what unlocks the `offline-conversion-sync` Supabase fn. It's a separate workflow — I'll write the OAuth setup doc when we get to Phase 1.
