# Frame Roofing Utah — Continue From Here
> Updated: 2026-04-07 evening session

## What Was Just Completed

### 1. All 44 Location Pages Rewritten (DONE)
Every location page in `/locations/` now has unique, city-specific content with:
- Local weather patterns and roofing challenges
- Neighborhood references and housing stock context
- Elevation, zip codes, county info
- Unique service focus per city
- Nearby city cross-links
Script used: `/scripts/rewrite_locations.py` (711 lines, embedded CITIES dict with data for all 44 cities)

### 2. BBB Trust Bar Badge (DONE)
- SVG star icon + "BBB A+ Rated" added to homepage trust bar
- Links to correct BBB profile: `https://www.bbb.org/us/ut/heber-city/profile/roofing-contractors/frame-restoration-utah-llc-1166-90056184`
- Schema sameAs array also updated with correct BBB URL
- Broken agent BBB image tag removed from live site

### 3. Landon Message Agent v2.2 (DONE — 10/10 all categories)
Skill at: `/Users/agenticmac/.claude/skills/landon-message-agent/SKILL.md` (578 lines)
Scheduled: every 15 min, 8am-11pm

All 9 categories at 10/10 readiness:
- **certification:** SVG icon bank (8 icons), exact trust-item HTML, schema sameAs update, Lighthouse post-deploy
- **photos:** iMessage attachment extraction, sips auto-resize pipeline, Ollama alt-text generation, exact gallery-card HTML for both index.html (5-item fixed grid) and pages/gallery.html (auto-fill), naming convention
- **service_change:** Full 14-page service inventory, exact service-card HTML pattern, remove=escalate, Lighthouse post-deploy
- **testimonial:** Copy-paste HTML template with star SVGs, reviewCount schema update, post-deploy content verification
- **directory_update:** curl HTTP pre-check, exact sameAs format, footer HTML pattern, post-deploy schema validation
- **repo_or_code:** Default=escalate, diagnostic toolkit: Formspree endpoint test, Lighthouse mobile audit, Playwright visual regression, git revert
- **question:** Quick-reference cheat sheet (15 items: all URLs, phone, email, LLC, brand, services, areas)
- **excitement_or_status:** Soft follow-up awareness (big wins → potential testimonial/photo)
- **general:** Google Calendar MCP for scheduling, escalation fallback

Global Post-Deploy Verification Protocol: HTTP 200 → content grep → Lighthouse a11y+SEO ≥ 0.9 → auto-revert

## What's Pending / Next Up

### High Priority
1. **10DLC Campaign Approval** — resubmitted 2026-04-07, check-10dlc-status scheduled task monitors daily, expect 1-5 business days
2. **Directory Submissions** — 35 of 38 remaining. Cheat sheet at `Frame-Roofing-Directory-Cheat-Sheet.pdf`. Landon needs to blitz through these.
3. **Review Collection Strategy** — currently 19 Google reviews, target 200+. Need systematic approach.

### Medium Priority
4. **GBP Weekly Post** — scheduled task, first run next Monday
5. **After Photos from Landon** — site needs clean completed-job photos, not mid-construction
6. **Updated Logo** — current logo still says "Frame Restoration", waiting on Landon
7. **GoDaddy access** for framerestorations.com 301 redirect

### Future Enhancements
8. **Speed-to-lead AI texting bot** — auto-text new leads on form submit
9. **SEO monitoring dashboard** — track indexing progress, keyword rankings
10. **Blog content calendar** — strategy doc exists at `Frame-Restoration-Blog-Content-Strategy.xlsx`

## Key Paths
- **Repo:** `/Users/agenticmac/projects/frame-restoration-utah/`
- **Agent skill:** `/Users/agenticmac/.claude/skills/landon-message-agent/`
- **Agent state:** `/Users/agenticmac/.claude/skills/landon-message-agent/state.json`
- **Agent voice:** `/Users/agenticmac/.claude/skills/landon-message-agent/ryan-voice-guidelines.md`
- **CLAUDE.md:** `/Users/agenticmac/projects/frame-restoration-utah/CLAUDE.md`
- **Memory files:** `~/.auto-memory/` (project_frame_roofing.md, project_landon_agent.md)

## Mac Tools Available
Ollama (llama3.1, qwen2.5, codellama, deepseek-coder, mistral-small), Docker (Playwright image), Lighthouse CLI (npx), Node.js, Python3, ffmpeg, sips, curl, jq, Vercel CLI, Git

## Critical Reminders
- **Desktop Commander for ALL file edits** — sandbox Read tool returns metadata-only for Mac files
- **Git push to main = auto-deploy** to Vercel
- **Phone number is ALWAYS 435-302-4422** — never the Twilio number
- **BBB profile ID is 90056184** — not 90109025
- **LLC name on directories:** Frame Restoration Utah LLC
- **Website brand name:** Frame Roofing Utah
