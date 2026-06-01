# Frame Utah — Canonical Brand-Name Decision

**Date:** 2026-06-01 · **STATUS: ✅ DECIDED — canonical brand = "Frame Roofing Utah" (Option B)** (Ryan, 2026-06-01)

## Decision
The one official public name is **Frame Roofing Utah**. The website (3,345 refs across 161 files), schema, and `llms.txt` already use it — they stay as-is. The GBP, BBB, and all directories (currently "Frame Restoration Utah") get aligned **to** the website.

Rationale: the website *is* the brand and the SEO foundation; "Roofing" is the clearer/stronger token for a roofer than "Restoration"; aligning ~15 listings is far less work (and less risk) than rewriting 161 files; and the directory name edits piggyback on the phone cleanup that's happening anyway.

> Superseded: the earlier "DECIDE FIRST" block. Option A (rename the site to "Frame Restoration Utah") is NOT being taken.

---

## Execution sequence (DBA-first — de-risks the GBP name change)

1. **Confirm the exact registered LLC name.** ⚠️ Sources disagree — BBB says "Frame Restoration **Utah** LLC", the state record (Bizapedia) says "FRAME RESTORATION LLC" (no "Utah"). Check with the registered agent / Utah business search before filing anything.
2. **File a DBA / assumed name "Frame Roofing Utah"** with the Utah Division of Corporations. This makes the GBP name change legitimate and low-risk (a GBP name matching a registered DBA passes Google's review; one that doesn't can stall on re-verification — bad for an already-slipping listing).
3. **Edit the GBP name** "Frame Restoration Utah" → "Frame Roofing Utah". The 27 reviews stay attached (reviews don't transfer off on a name edit). Expect a Google review/possible re-verify — normal.
4. **Update the name + phone on directories** (see `NAP-DIRECTORY-CHECKLIST-2026-06-01.md`) in one pass.
5. **Website + llms.txt:** no change (already correct).

## What does NOT change
- Domain stays `frameroofingutah.com`.
- `435-302-4422` stays as internal `LANDON_PHONE` (forwarding target in edge functions) — never public.
- The 27-review GBP listing is preserved (name edit only, not a new listing).

> Honest caveat (unchanged): the name fix is consistency *hygiene*, not a guaranteed ranking jump. The Heber drop is also driven by directory presence (~4 of 38), review velocity, and proximity — see `CITY-RANKING-ACTION-PLAN-2026-05-27`. Name consistency removes one suppressor; citations + reviews are the rest.
