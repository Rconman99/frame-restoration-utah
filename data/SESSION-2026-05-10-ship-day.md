# Frame Roofing Utah — Cowork Handoff (2026-05-10)

> **Status:** LIVE at https://www.frameroofingutah.com — generating leads via
> handle-lead v14 LLM tier classifier. Just shipped 11 PRs / 10 new blog posts
> in 24 hours expanding two content clusters. Storm cluster: 14 cities.
> Roof-replacement cluster: 8 cities + 1 statewide companion (quote checklist).

## 🚨 BEFORE YOU TOUCH ANYTHING

Read these in order:
1. `~/projects/frame-restoration-utah/CLAUDE.md` — full project context, **CRITICAL RULES section first**
2. `~/.claude/projects/-Users-agenticmac/memory/frame-utah-session-2026-05-07-09.md` — parallel session log (May 7-9)
3. This file — May 10 ship day
4. `data/SESSION-2026-05-09-email-fix-and-site-audit.md` — prior handoff (PR #25 email override + open audit findings + 2026-05-10 footer w/ Resend swap)

## ⛔ HARD RULES (do not violate)

- **Phone numbers:** Call=`435-302-4422` (`tel:+14353024422`). Text=`435-292-8802` (SMS-only). NEVER swap them.
- **NO fabricated certs.** BBB A+ ✓ confirmed 2026-04-07. NRCA / GAF Master Elite / OC Preferred = NOT TRUE.
- **NO invented company-age claims.** No "since 1999" / "decades of experience" / "20+ years" type prose.
- **NO Texas / Frisco / Dallas / Frame Restoration TX brand leak.** Site is Frame Roofing Utah ONLY.
- **NO fabricated property photos.** AI imagery only if clearly stylized + alt-text labels "illustration" + uses `ImageObject` schema with `disambiguatingDescription` (NEVER `Photograph` schema). Higgsfield assets: file path ends in `-illustration.webp`.
- **`.vercelignore` caution:** never blanket-ignore by extension. Check fetches + customer URLs first (3 incidents on record).
- **Brand boundary:** Restoration=TX, Roofing=Utah. Never cross-name.

## 🚢 WHAT SHIPPED IN THE LAST 24 HOURS (PRs #23-#35)

### New blog posts (10 total, all 1,500-2,900 words, all audit-clean)

**Storm-damage cluster (14 cities, +3 today):**
- `/blog/salt-lake-city/storm-damage-roofing-salt-lake-city` (PR #27, depth-play, real photo)
- `/blog/holladay/storm-damage-roofing-holladay` (PR #31, whitespace, real photo)
- `/blog/murray/storm-damage-roofing-murray-utah` (PR #32, demand-led/9 Reddit signals)

**Roof-replacement cluster (8 cities, +6 today + 1 statewide companion):**
- `/blog/cottonwood-heights/roof-replacement-cottonwood-heights-utah` (PR #32)
- `/blog/alpine/roof-replacement-alpine-utah` (PR #33)
- `/blog/highland/roof-replacement-highland-utah` (PR #33)
- `/blog/south-jordan/roof-replacement-south-jordan-utah` (PR #33, real photo, Daybreak ARC focus)
- `/blog/orem/roof-replacement-orem-utah` (PR #33)
- `/blog/provo/roof-replacement-provo-utah` (PR #33, 4-market segmentation)
- `/blog/utah/roof-replacement-quote-checklist-utah-2026` (PR #34, statewide companion, compounds aeo-76a17e0e)

### Infrastructure / tooling shipped

- **PR #23** — handle-lead debug-payload stripped; v14 live (no `_debug_*` keys leaking)
- **PR #24** — Blog generator (`scripts/generate-blog-post.py`) + npm scripts (`blog:draft`, `blog:render`)
- **PR #26** — Traffic-aware optimizer (`scripts/blog-target-prioritizer.py`) + `blog:target` / `blog:next` npm scripts. Reads `data/traffic-snapshot.json` (PostHog) + `data/reddit-signals-by-city.json` + market-intel + sitemap. Three strategic axes: WHITESPACE / DEMAND-LED / DEPTH-PLAY.
- **PR #29** — Blog index nested-anchor fix + AEO fixer hardened (ancestor-anchor check). Prevents recurrence of the PR #22 layout breakage.
- **PR #30** — `MAX_SPOKES_PER_CITY=2` cap on optimizer. Heber + SLC + Park City + Bountiful + Sandy now correctly filtered. Override: `--include-saturated`.

### Ollama daemon now configured for parallel drafting

- `OLLAMA_NUM_PARALLEL=2` / `OLLAMA_MAX_LOADED_MODELS=3` / `OLLAMA_KEEP_ALIVE=10m`
- Set via `launchctl setenv` + `brew services restart ollama`
- Multi-model parallel drafting tested + worked (qwen3:8b + mistral-nemo:12b concurrent, no queue contention)
- urllib timeout in `generate-blog-post.py` bumped 300s → 900s

## 🛠️  HOW TO CONTINUE THE WORK

### Pick the next blog target

```bash
cd ~/projects/frame-restoration-utah
npm run blog:target          # ranked table + 3 strategic-axis picks
npm run blog:next            # prints literal `npm run blog:draft -- ...` for #1
```

### Refresh traffic data first (recommended weekly)

```bash
# One-time setup if not already done:
mkdir -p ~/.config/frame-utah
echo 'FRAME_REPORT_PIN=frame2026' > ~/.config/frame-utah/.env
chmod 600 ~/.config/frame-utah/.env

# Then any time:
npm run blog:traffic
```

### Draft a new post (cost: $0)

```bash
# Use mistral-small3.1 for best prose quality (slower, ~3 min) OR
# qwen3:8b for faster cheaper-to-iterate drafts (~30s, lower base quality)
OLLAMA_MODEL=qwen3:8b npm run blog:draft -- \
  --keyword "..." --city <slug> --style atmospheric

# For parallel drafts, route to DIFFERENT models to avoid same-model queue
```

### After draft lands, hand-finish the manifest

Manifests at `data/blog-pending/{slug}.json` need expansion. Every one of the 10 posts today required 60-90 min hand-finishing — qwen3:8b/mistral drafts come in at 500-700 words generic; final ship targets 1,500-2,500 words with verified neighborhood data.

### Render the post

```bash
npm run blog:render -- \
  --manifest data/blog-pending/{slug}.json \
  --image-local /images/projects/cities/<real-photo>.webp
```

### Then ship as a single PR per pattern (see PR #31 / #32 / #33 / #34)

- Post HTML + manifest
- `sitemap.xml` entry (alphabetical)
- Cluster hub integration (`/pages/storm-damage` or `/pages/roof-replacement`)
- `/blog/utah/utah-hail-season-roof-guide-2026.html` spoke list (if storm-related)
- `/locations/{city}.html` "From Our Blog" section
- `/blog/index.html` card at top
- After merge: IndexNow ping all modified URLs

## 📋 OPEN WORK (queued, not blocking)

| Item | Effort | Why |
|---|---|---|
| Hail self-assessment statewide post (top-pick #2 from Reddit content opps) | 60-90 min hand-finish | Compounds the 14-city storm cluster the same way the quote checklist compounded the cost guide |
| Photo refresh for Highland / Orem / Provo / Murray | Frame-side photography | Currently using shared `heber-valley-drone-poster` fallback |
| Frame TX: bake `MAX_SPOKES_PER_CITY=2` cap into Dallas Build Kit | 2 hrs | Before TX 12-city × 5-service launch — avoid Frame Utah's near-saturation problem |
| AEO action `aeo-76a17e0e` should close on June 5 monitor | Wait | Cost guide gained 3 inbound links today (PRs #21 + #34 + Related Resources) |
| AEO action `aeo-ef3d8192` should close on June 5 monitor | Wait | Storm-damage hub has 28 inbound links sitewide (was 13 before today) |

## 🔐 KEY CREDENTIALS / ACCESS

- Higgsfield balance: ~1,100 credits, resets ~2026-05-18 (use-it-or-lose-it). 0 spent today (all posts used real photos).
- OpenRouter key in `Supabase app_config.OPENROUTER_API_KEY` — fixed today (was doubled `sk-or-sk-or-` prefix). Flagged for rotation per parallel-session log.
- Supabase service-role key — flagged for rotation per parallel-session log.
- `FRAME_REPORT_PIN` = `frame2026` (admin role), `landon26` (viewer role). Both in `report_access` table.
- PostHog project `333074`, key embedded in weekly-report edge function source.

## 🧠 STRATEGIC INSIGHT (from /innovate research today)

2026 local-SEO sentiment has converged on **"fewer/deeper, not more/thinner."**

- Sources: Caleb Ulku YouTube (200+ businesses, 90% of markets), r/localseo "delete weak city pages instead of adding more", r/localseo internal-link gap thread (24 comments).
- That's why the optimizer's 2-spoke cap matters. Past 2 spokes per city, the marginal lift on add-another-blog drops below the marginal lift on internal-link cleanup + location-page deepening.
- Frame's current state correctly reflects this: Heber + SLC at 5 spokes (saturated — no more), Park City at 3 (also saturated under the cap), most other Tier 1/2 cities at 0-2 (target zone).

## 📂 WHERE TO PICK UP

If you're a coworker landing fresh:

1. `git pull` from main (everything from today is merged in)
2. Run `npm run blog:target` to see the optimizer's current ranking
3. Pick a city × service from the top 3 strategic-axis picks
4. Draft → hand-finish → render → PR per the pattern above
5. Single-PR bundling all integrations is the proven workflow (see PR #31-#34 commit history)

Standing by to help once you're up to speed.
