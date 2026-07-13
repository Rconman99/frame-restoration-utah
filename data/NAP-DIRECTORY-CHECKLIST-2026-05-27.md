# Frame Roofing Utah — Directory Phone Update Checklist
**Date:** 2026-05-27
**Trigger:** Public phone swap from `(435) 302-4422` → `(435) 292-8802` to capture every Google-initiated call in `call_logs`.

> SUPERSEDED - DO NOT USE FOR LIVE DIRECTORY WORK.
> Current source of truth: `data/NAP-DIRECTORY-CHECKLIST-2026-06-01.md`.
> Canonical directory name is now `Frame Restoration Utah LLC`; canonical website is `https://www.framerestorationutah.com/`.

## Paste-ready NAP block (copy this verbatim into every directory)

```
Business name:  Frame Roofing Utah
Legal:          Frame Restoration Utah LLC
Phone:          (435) 292-8802
Address:        142 S Main St, Heber City, UT 84032
Website:        https://www.frameroofingutah.com
Email:          info@framerestorationutah.com
Hours:          Mon–Fri 8:00 AM – 7:00 PM, Sat 8:00 AM – 6:00 PM, Sun closed
Founded:        2014
License:        Utah DOPL #14256097-5501
Primary cat:    Roofing Contractor
Secondary:      General Contractor, Gutter Cleaning Service
```

> Do NOT publish `(435) 302-4422` — that is Landon's direct cell (forwarding destination only).

---

## Tier 1 — Already live, phone is now wrong, fix NOW (4)

| # | Directory | Status | Edit URL |
|---|---|---|---|
| 1 | **Google Business Profile** | ✅ Submitted 2026-05-27 (pending Google review ≤10 min – up to 3 days) | https://business.google.com/locations |
| 2 | **Yelp** | Done — phone update needed | https://biz.yelp.com/ |
| 3 | **BBB (National)** | Done — phone update needed | https://www.bbb.org/business-login |
| 4 | **BuildZoom** | Live — phone update needed | https://www.buildzoom.com/contractor/frame-restoration-utah-llc |

---

## Tier 2 — High-priority, not yet claimed (11)

Claim each one with the new NAP block above. Do these in order — top of list has highest impact on Google's local-pack signals.

| # | Directory | Priority | Sign-up URL |
|---|---|---|---|
| 5  | **Apple Business Connect** (Apple Maps) | High | https://businessconnect.apple.com/ |
| 6  | **Bing Places** | High | https://www.bingplaces.com/ |
| 7  | **Facebook Business Page** | High | https://www.facebook.com/business |
| 8  | **Nextdoor Business** | High (Utah-local) | https://business.nextdoor.com/ |
| 9  | **Angi (Angie's List)** | High | https://www.angi.com/pro/sign-up |
| 10 | **HomeAdvisor** | High | https://pro.homeadvisor.com/ |
| 11 | **Thumbtack** | High | https://www.thumbtack.com/pro/ |
| 12 | **Houzz** | High | https://www.houzz.com/professionals |
| 13 | **Porch** | High | https://pro.porch.com/ |
| 14 | **Utah.com Business Directory** | High (Utah-local) | https://www.utah.com/business/ |
| 15 | **CertainTeed / GAF dealer listings** | High (roofing-specific) | varies by brand |

---

## Tier 3 — Medium priority (10)

Knock these out in batch once Tier 1 + 2 are clean.

| # | Directory | Sign-up URL |
|---|---|---|
| 16 | MapQuest | https://business.mapquest.com/ |
| 17 | YellowPages.com | https://www.yellowpages.com/claim |
| 18 | Superpages | https://www.superpages.com/ |
| 19 | Manta | https://www.manta.com/claim |
| 20 | Foursquare | https://foursquare.com/business |
| 21 | Networx | https://www.networx.com/pro |
| 22 | Bark | https://www.bark.com/en/us/pro/ |
| 23 | ChamberofCommerce.com | https://www.chamberofcommerce.com/ |
| 24 | SLC Chamber of Commerce | https://www.slchamber.com/ |
| 25 | BBB of Utah (state) | https://www.bbb.org/local/0477 |

---

## Tier 4 — Low priority (13, batch in one sitting)

CitySearch, Hotfrog, Local.com, ShowMeLocal, EZLocal, USDirectory, iBegin, 2FindLocal, Hub.biz, Tuugo, Brownbook, Cylex, n49.com, Storeboard

> These barely move the needle individually but add NAP consistency signals. Use the `directory-blitz.py` script in `scripts/` if you want to automate.

---

## How to verify the swap is working

After the GBP review approves (max 3 days), test the click path:

```bash
# 1. Tap "Call" on the Maps listing — Twilio should ring → forward to Landon's phone
# 2. Check the new call_logs row:
curl "https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/lead-report?key=frame-roofing-2026" \
  | python3 -m json.tool | head -50
```

The new row in `call_logs` will have:
- `from_number` = your test phone
- `to_number` = `+14352928802`
- `forwarded_to` = `+14353024422` (Landon)
- `source_page` = `website-tracking-number` (Twilio webhook label)
- auto-created `leads` row linked via `lead_id`

Every Google-initiated call now lands in the CRM with full attribution.
