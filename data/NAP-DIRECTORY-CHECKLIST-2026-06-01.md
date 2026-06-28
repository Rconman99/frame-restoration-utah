# Frame Utah — NAP / Directory Cleanup Checklist (refreshed + audited)

**Date:** 2026-06-01 · supersedes `NAP-DIRECTORY-CHECKLIST-2026-05-27.md`
**Triggers:** (1) public phone swap `(435) 302-4422` → `(435) 292-8802`; (2) audit finding #2 — directories on the old number; (3) audit finding #1 — name inconsistency.

## ✅ DECIDED — canonical name = "Frame Roofing Utah" (2026-06-01)
Align GBP + directories **to the website** ("Frame Roofing Utah"). See `BRAND-DECISION-2026-06-01.md`.
**Sequence the GBP name change safely: confirm the registered LLC name → file DBA "Frame Roofing Utah" → then edit the GBP name.** A GBP name backed by a registered DBA passes Google's review; one that isn't can stall on re-verification (risky for an already-slipping listing).

## ✅ Repo side — DONE
`llms.txt` → `435-292-8802` (PR #59). Website HTML/schema already on the new number + "Frame Roofing Utah". `435-302-4422` retained only as internal `LANDON_PHONE` forwarding target — never publish it.

---

## Paste-ready NAP block (copy verbatim into every listing)
```
Business name:  Frame Roofing Utah
Phone:          (435) 292-8802
Address:        142 S Main St, Heber City, UT 84032
Website:        https://www.frameroofingutah.com
License:        Utah DOPL #14256097-5501
Primary cat:    Roofing Contractor
```
> Do NOT publish `(435) 302-4422` (internal forwarding line).
> ⚠️ Verify before publishing: "Founded 2014" (05-27 block) vs LLC incorporated 2025 (BBB/Bizapedia); email `info@framerestorationutah.com` uses the *old* domain.

---

## Tier 1 — Live listings to fix (AUDITED 2026-06-01) — name → "Frame Roofing Utah", phone → 292-8802

### ✅ Verified live (I loaded each page — currently shows the wrong name)
| # | Directory | Current name | Current phone | Edit URL | Notes |
|---|---|---|---|---|---|
| 1 | **Google Business Profile** | Frame Restoration Utah | — | https://business.google.com/locations | THE big one. Name change is review-gated → do after the DBA. 27 reviews stay attached. Verified via screenshot + scrape. |
| 2 | **BBB** | Frame Restoration Utah LLC | shows BOTH 302-4422 + 292-8802 | https://www.bbb.org/us/ut/heber-city/profile/roofing-contractors/frame-restoration-utah-llc-1166-90056184 | remove the old number |
| 3 | **Nextdoor** | Frame Restoration Utah LLC | 302-4422 | https://nextdoor.com/pages/frame-restoration-utah-llc-heber-city-ut/ | name + phone |
| 4 | **BuildZoom** | Frame Restoration Utah LLC | — | https://www.buildzoom.com/contractor/frame-restoration-utah-llc | also add DOPL # (shows "no active license") |

### ❓ Unverified — blocked to automated checking, confirm when you log in
| # | Directory | Edit URL | Status |
|---|---|---|---|
| 5 | **HomeAdvisor / Angi** | https://www.homeadvisor.com/rated.FrameRestoration.157214032.html | 403 to automated fetch; Google index title reads "Frame Restoration Utah LLC" → likely wrong, confirm live |
| 6 | **Yelp** | https://www.yelp.com/biz/frame-restoration-heber-city | 403; slug implies "Frame Restoration" — confirm it resolves + the name |
| 7 | **Facebook** | https://www.facebook.com/61572258054303 | login-walled; confirm the page display name |
| 8 | **Instagram** | https://www.instagram.com/frameroofingutah | handle already correct ✅; confirm display name |

### 🏛️ Legal / owned — not a directory edit
| Source | Note |
|---|---|
| **Bizapedia** (https://www.bizapedia.com/ut/frame-restoration-llc.html) | Shows "FRAME RESTORATION LLC" — the *state record*. Follows the DBA/legal filing, not a directory edit. Confirms the legal-name ambiguity. |
| **framerestorations.com/utah-home** | Returned **404** on fetch (2026-06-01) — verify in a browser; may be a dead/stale-indexed page on your TX domain. Decide: redirect to frameroofingutah.com or remove. |

---

## Tier 2 — High-priority, claim with the NAP block above (10)
Apple Business Connect · Bing Places · Facebook Business · Angi · Thumbtack · Houzz · Porch · Utah.com · GAF/CertainTeed dealer listings · SLC Chamber

## Tier 3 — Medium (batch) (9)
MapQuest · YellowPages · Superpages · Manta · Foursquare · Networx · Bark · ChamberofCommerce.com · BBB-UT (0477)

## Tier 4 — Low (batch) (14)
CitySearch · Hotfrog · Local.com · ShowMeLocal · EZLocal · USDirectory · iBegin · 2FindLocal · Hub.biz · Tuugo · Brownbook · Cylex · n49 · Storeboard
> Legacy directory-blitz automation is retired. Use this locked checklist plus owner-approved vendor data room/change approvals for any long-tail citation work.

---

## Verify the swap captures calls (after GBP shows 292-8802)
```bash
curl "https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/lead-report?key=frame-roofing-2026" | python3 -m json.tool | head -50
```
New `call_logs` row should show `to_number = +14352928802`, `forwarded_to = +14353024422`, linked to an auto-created `leads` row.

## Run order
1. Confirm registered LLC name → **file DBA "Frame Roofing Utah."**
2. Verify GBP phone = 292-8802; then edit GBP **name** (after DBA).
3. Fix name + phone on BBB, Nextdoor, BuildZoom (verified); then check/fix HomeAdvisor, Yelp, FB/IG.
4. Resolve `framerestorations.com/utah-home` (redirect or remove).
5. Tier 2 claims → batch Tier 3–4.
