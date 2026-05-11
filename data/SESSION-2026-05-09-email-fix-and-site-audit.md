# Session Handoff — 2026-05-09 / Email Fix + Site Audit

**Worked by:** Claude Opus 4.7 (1M context) via Claude Code
**Worked with:** Ryan (agenticmac terminal)
**Branch state at end:** `main` clean (PR #25 squash-merged + Vercel auto-deployed)

---

## ✅ Done this session

### 1. Replaced dead `info@framerestorationutah.com` → `landon@framerestorations.com`

**Root cause:** the `info@` mailbox was never provisioned. Every `mailto:` link on the public site was silently bouncing — leads dropped into the void. Ryan flagged this; replaced everywhere.

**PR #25:** https://github.com/Rconman99/frame-restoration-utah/pull/25 — squash-merged 2026-05-09 17:45 UTC. Auto-deployed to prod via Landon's Vercel.

**Files touched (16):**
- `index.html` (3 hits), `terms.html` (2), `privacy.html` (2), `pages/about.html` (2), `llms.txt` (1)
- 10 blog posts: `draper/insurance-claims-storm-damage` (2), `heber-city/snow-damage-roof-heber-city-84032`, `herriman/hail-damage-new-homes`, `salt-lake-city/older-home-roof-replacement`, `sandy/spring-hail-damage-roof`, `sandy/roof-leak-repair-sandy-84070`, `utah/how-to-choose-a-roofer-utah`, `utah/roof-replacement-cost-utah-2026`, `west-jordan/roof-leak-after-rainstorm`, `west-valley-city/roof-replacement-cost`
- `CLAUDE.md` — PEOPLE block updated with the override note so Cowork doesn't reintroduce the bad email

**Verified live on prod:** `curl -s https://www.frameroofingutah.com/ | grep -oE "[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+"` returns only `landon@framerestorations.com` + the form placeholder `you@email.com`. The `info@` string is 100% purged from the site.

### Brand-boundary tradeoff (explicit, documented)

This change re-introduces the `framerestorations.com` (plural-S Texas-parent domain) signal that the **2026-04-22 entity-leak lockdown** specifically removed. Ryan accepted the cross-resolution risk in exchange for a working inbox. Documented in two places so it doesn't read as a regression to future sessions:
- `CLAUDE.md` PEOPLE block — inline override note
- `~/.claude/projects/-Users-agenticmac/memory/feedback_frame_brand_boundary.md` — new "Documented exception" section at bottom

**If anyone proposes flipping back to a `*utah.com` address:** first verify the mailbox actually receives mail before editing. That's the rule we put in place.

### Leads-digestion pipeline status

Checked, not touched. `supabase/functions/handle-lead/index.ts` doesn't hardcode `info@` anywhere — leads route via Formspree (`_replyto` header) to Landon and via Verizon SMS gateway to his phone. Both already point at correct destinations.

**Recommended test for next coworker:** submit a contact form on prod → confirm Landon receives the email. Site is fixed; this just validates the Formspree side too.

---

## 🔴 Open — Critical (visible to Google + users)

### 2. Two competing About pages

Ran a full site audit during the same session. Found this:

- **`/about`** — root `about.html`. Title: *"About Frame Roofing Utah | Landon Yokers, Owner"*. Description: "Premium roofing and **restoration** contractor serving 40+ communities across Utah's Wasatch Front." This is what `sitemap.xml` points at.
- **`/pages/about`** — canonical. Title: *"About Frame Roofing Utah | Meet Owner Landon Yokers"*. This is what the live nav `href="/pages/about"` links to.

Both return 200. Google is being told via sitemap to crawl `/about`; humans land on `/pages/about` via nav. Duplicate content + split canonical signals.

**Fix:** delete root `about.html`, add a 301 redirect in `vercel.json` (`/about` → `/pages/about`), update sitemap entry. One small PR.

### 3. Four internal admin pages live on prod

These were probably never meant to be publicly indexed but are 200 OK and missing from `.vercelignore`:

| URL | Why it's bad |
|---|---|
| `/backlink-playbook` | Claims "CertainTeed and Tamko certified"; third-party number `(435) 631-9555` (a TownLift ads contact, not Frame); references "Frame Restoration Utah LLC" |
| `/directory-blitz-tool` | Same certification claims; "Frame Restoration Utah LLC" in the NAP block |
| `/directory-tracker` | "Frame Restoration Utah LLC" in NAP |
| `/seo-report` | Internal audit prose |

**Risk:** Google indexes these → SOPs and stale numbers leak into SERPs.

**Fix:** add to `.vercelignore` (or move to `_internal/` and exclude that dir). Recheck via `curl -sL -o /dev/null -w "%{http_code}" https://www.frameroofingutah.com/backlink-playbook` after deploy.

⚠️ **Don't blanket-ignore by extension.** Per Ryan's `.vercelignore caution` memory (two 2026-04-22 incidents), check fetches + customer URLs first. Add the four files explicitly by name.

---

## 🟡 Open — Medium (SEO consistency)

### 4. JSON-LD brand-name split across blog posts

- **5 posts** use legal entity `"name": "Frame Restoration Utah LLC"` in `author` / `publisher` schema
- **37 posts** use brand `"name": "Frame Roofing Utah"` ✓

Inconsistent entity signal to Google. Per CLAUDE.md the LLC name is defensible for legal/schema use, but 88% are already on brand — easier to flip 5 than 37.

**To find them:** `grep -rl "Frame Restoration Utah LLC" --include="*.html" blog/`

**One known offender confirmed during audit:** `blog/riverton/hail-damage-roof-inspection.html` (both author + publisher).

### 5. Stale "19 reviews" inside the 4 exposed admin pages

Customer-facing site (homepage, About, all 45 location-page JSON-LD `reviewCount` fields) correctly shows **20 / 5.0★** ✓. The 19 figure only persists in the admin pages above. Killing those (item #3) kills this too.

---

## 🟢 Open — Low / Cleanup

### 6. `index-redesign.html` — unfinished orphan in repo

- Contains `sales@framerestorations.com` (×3) and dummy phone `(435) 555-1234` placeholder
- Currently 404s on prod (vercelignored or unrouted) ✓ — not user-visible
- But it sits in the repo where Cowork could accidentally reference it as "the redesign"
- **Recommend:** delete from repo, or move to `archive/`

### 7. Other audited items — all clean ✓

Documenting these so the next coworker doesn't re-audit:

- **Phone-number swaps:** zero. No `tel:` link contains the SMS number `292-8802`; no `sms:` link contains the call number `302-4422`. Only valid numbers found across the site: `435-302-4422` (call), `435-292-8802` (SMS), plus the dummy/orphan numbers noted above.
- **Address consistency:** every hit is `142 S Main St, Heber City, UT 84032` ✓
- **ZIP codes 84020/84057/84060 in some blog posts:** these are `areaServed.PostalAddress` schema fields (the city being served), not HQ claims. Correct usage.
- **"Across Utah" copy:** scoped to the few statewide-by-design blog guides (`blog/utah/*`). Intentional, not overreach.
- **`info@framerestorationutah.com`:** 100% purged from public site files ✓
- **March-2026 audit HTMLs in repo root** (`Frame-Roofing-SEO-Audit-March2026.html`, `Frame-Roofing-GEO-Audit-March2026.html`, `Frame-Roofing-Directory-Cheat-Sheet*.html`, `Frame-Roofing-SEO-Automation-Playbook.html`, `Landon-Action-Items-March2026.html`, `seo-audit-march-2026.html`): all already 404 on prod ✓
- **BBB A+ Accredited claim:** confirmed by Landon 2026-04-07 per CLAUDE.md ✓

---

## Suggested next-PR scope (one bundle)

If you (next coworker) want to ship a single follow-up:

1. **Delete** `about.html` (root)
2. **Add** redirect to `vercel.json`: `{ "source": "/about", "destination": "/pages/about", "permanent": true }`
3. **Update** `sitemap.xml`: change `/about` → `/pages/about`
4. **Add** to `.vercelignore`: `backlink-playbook.html`, `directory-blitz-tool.html`, `directory-tracker.html`, `seo-report.html`
5. **Delete** `index-redesign.html` (or move to `archive/`)
6. **Standardize** the 5 outlier blog posts to use `"Frame Roofing Utah"` in author/publisher schema

**PR pattern (per memory):** branch + `gh pr create` + `gh pr merge --auto --squash`. Direct push to `main` is hook-blocked. Vercel auto-deploys from main on merge.

**Verification after deploy:**
```bash
# All four should 404
for u in backlink-playbook directory-blitz-tool directory-tracker seo-report; do
  curl -sL -o /dev/null -w "%{http_code}  /$u\n" "https://www.frameroofingutah.com/$u"
done

# /about should redirect to /pages/about
curl -sL -o /dev/null -w "%{http_code}  %{url_effective}\n" "https://www.frameroofingutah.com/about"

# Blog JSON-LD should all be on brand
grep -rl "Frame Restoration Utah LLC" --include="*.html" blog/  # expect: empty
```

---

## Re-run audit commands (for the future)

```bash
cd ~/projects/frame-restoration-utah

# 1. Texas-domain leaks (landon@ is the one allowed exception)
grep -rn "framerestorations\.com" --include="*.html" --include="*.txt" \
  --exclude-dir=archive --exclude-dir=node_modules --exclude-dir=data . \
  | grep -v "landon@framerestorations\.com"

# 2. Forbidden trust claims
grep -rniE "NRCA member|GAF Master Elite|OC Preferred|Owens Corning Preferred|Platinum Preferred" \
  --include="*.html" --exclude-dir=archive --exclude-dir=node_modules --exclude-dir=data .

# 3. Phone swaps
grep -rniE "tel:[^\"']*292[^\"']*8802|sms:[^\"']*302[^\"']*4422" --include="*.html" .

# 4. Review-count drift
grep -rniE "\"reviewCount\"\s*:\s*\"?[0-9]+" --include="*.html" . | grep -v '"20"'

# 5. Wrong brand combos
grep -rniE "Frame Restoration Utah(?! LLC)|Frame Roofing Texas|Frame Roofing TX" --include="*.html" .

# 6. Live page-status probe (the actually-important check)
for u in about pages/about backlink-playbook directory-blitz-tool directory-tracker seo-report \
         Landon-Action-Items-March2026 Frame-Roofing-SEO-Audit-March2026 index-redesign; do
  curl -sL -o /dev/null -w "%{http_code}  /$u\n" "https://www.frameroofingutah.com/$u"
done
```

---

## Context dump for whoever picks this up

- **Live URL:** https://www.frameroofingutah.com
- **Vercel:** Landon's account (auto-deploy on `main` push)
- **Repo:** https://github.com/Rconman99/frame-restoration-utah
- **Most recent merged PR:** #25 (the email fix, this session)
- **Brand-boundary memory:** `~/.claude/projects/-Users-agenticmac/memory/feedback_frame_brand_boundary.md` — read this before touching anything that mixes "Restoration" + "Utah" or "Roofing" + "Texas"
- **Solo-repo PR workflow memory:** `~/.claude/projects/-Users-agenticmac/memory/feedback_pr_workflow_solo_repos.md` — branch + PR + auto-squash, no direct main push

---

## 2026-05-10 UPDATE — Resend swap + /leads CRM

A later session shipped two things that change the relevant areas above:

### Formspree → Resend (handle-lead v8 — deployed 2026-05-10)
- Section "Leads-digestion pipeline status" above is now **stale**. Leads no longer route via Formspree. `handle-lead/index.ts` now uses Resend for both Landon's email + the Verizon SMS gateway path. `RESEND_API_KEY` is a Supabase Deno secret.
- Verified domain in Resend: `frameroofingutah.com` (sending-enabled; DKIM + 2 SPF records green).
- FROM: `leads@frameroofingutah.com` → TO Landon, CC `ryanconwell99@gmail.com`. End-to-end test 2026-05-10 fired: Supabase row #43 + 2 Resend deliveries confirmed via `GET https://api.resend.com/emails`.
- Reason for swap: Formspree free tier (50/mo) was hitting cap because every lead burned 2× quota (Landon notification + Verizon gateway).

### New page `/leads` (hosted CRM at frameroofingutah.com/leads)
- **Item #3 above lists `/seo-report` as an "admin page leak" — this is incorrect.** Both `/seo-report` AND the new `/leads` are intentional **PIN-gated infra** with `<meta name="robots" content="noindex,nofollow">`. PIN validation runs through `report_access` table. Do NOT add either to `.vercelignore` — that would break Ryan's + Landon's tooling.
- The other three admin pages flagged in item #3 (`/backlink-playbook`, `/directory-blitz-tool`, `/directory-tracker`) are genuine concerns and remain open.
- New edge function `lead-crm` (version 1, ACTIVE) handles PIN-validated reads + writes. Same auth pattern as `weekly-report`.
- `/seo-report` now has a "→ Leads CRM" button in its header linking to `/leads`.

### Migration applied to prod (out of order vs the in-repo file)
- `20260510_add_attribution_columns.sql` was applied via Supabase MCP `apply_migration` on 2026-05-10 02:00 UTC. Adds `won_at`, attribution columns (`gclid`/`fbclid`/`utm_*`/`landing_page`/`referrer`/`uploaded_to_*`), partial indexes for offline-conversion sync, + `leads_status_check` CHECK constraint.
- File is now committed to repo (commit `755b5b6` on main).

### One TEST lead still in DB
- `id=43, name=TEST-resend-pipeline-2026-05-10` — keep or `DELETE FROM public.leads WHERE id = 43`. The weekly-report function already filters TEST* names out, so it's harmless if left.

