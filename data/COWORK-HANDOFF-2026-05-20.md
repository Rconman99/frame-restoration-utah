# Cowork Handoff — AIO Citation Experiment (Cost-Page Rewrite)

**Date:** 2026-05-20 · **Author:** Claude Opus 4.7 (architecture lane)
**Cowork instance:** Frame Roofing Utah (Roofing=Utah lane only — do NOT cross to Restoration=TX)
**Status:** Ready to execute · **Codex audit:** passed (v1.1 ship-with-changes, all diffs applied to instrumentation)
**Estimated effort:** ~60-90 min Cowork time · **Hypothesis target:** first Frame cost-query AIO citation by mid-July 2026 if the structural pattern is causal

---

## ⛔ Read first — rules of engagement

1. **Edit HTML directly via Cowork — Claude Code does NOT touch HTML in this repo** (race-condition risk; this is the locked boundary).
2. **NO new fabricated trust claims.** Confirmed allowed list lives at top of `CLAUDE.md` under "These ARE true."
3. **Dual-number rule: visible NAP = 435-302-4422 (display only), every `tel:`/`sms:` href = 435-292-8802 (Twilio).** Don't break this.
4. **AEO: concentration over repetition.** Don't keyword-stuff. Don't write the same fact 30 times. Vary phrasing. Specificity > volume.
5. **Brand: Frame Roofing Utah (DBA), Frame Restoration Utah LLC (legal name).** Don't cross-name with Frame Restoration TX.
6. **No "drone inspection" service framing.** Aerial photography fine; "drone inspection" as a service is ruled out.

---

## Why we're doing this — the measurement loop

A locked 26-query measurement panel (`QUERY_PANEL_V1` in `scripts/aeo-aio-sweep.py`) runs against Google AI Overview monthly. The 2026-05-20 baseline:

- **7/10 queries** surfaced AIO (we'll see the new number across 26 queries on June 1)
- **0/7 cited Frame** — confirms the 2026-05-16 Master AEO Play 0% baseline across 7 independent measurements
- **Most-cited domain in Frame's market: `homerroofing.net`** — 5 citations across 7 AIO blocks. Sky Ridge, Dynamite, IWC Roofing, usasuperior, peakroofingandco each cited 2x.

This is **not** a content-volume problem. Frame has plenty of cost/insurance/storm content already. The question is **why specific competitor pages win AIO citation slots and Frame's don't.**

This Cowork handoff is the smallest experiment that can answer that.

---

## The hypothesis (one thing being tested)

> **Frame's existing `blog/utah/roof-replacement-cost-utah-2026.html` is losing AIO citation to `homerroofing.net/learning-center/roof-replacement-cost-utah/` because of 3 specific structural differences in (a) URL slug pattern, (b) opening paragraph snippet shape, (c) cost-figure prominence.**
>
> If we make those 3 specific edits (without rewriting the whole page), Frame should become a plausible cost-query AIO citation candidate within 30 days of crawl.

If the hypothesis is right, we may win 1 of 7 AIO surfaces and earn a real, measurable citation on the next sweep (June 1 sweep at the earliest, July 1 sweep at the latest). If it's wrong, we learn something equally valuable about what Google's AIO actually weighs.

---

## Task 1 — Audit homerroofing.net's cited cost page (15 min)

**Target URL:** `https://homerroofing.net/learning-center/roof-replacement-cost-utah/`

Use WebFetch with this prompt:
```
Extract the page's structure: H1, first paragraph (verbatim), URL slug, schema.org JSON-LD types present,
table of contents if visible, any concrete $ ranges in the first 200 words, FAQ-style Q&A blocks if present.
Don't summarize — give me the raw structural facts.
```

Save findings to `~/projects/frame-restoration-utah/data/AEO-COMPETITOR-MODEL-HOMERROOFING-2026-05-20.md`. Include:

- Verbatim H1 + first 100 words
- URL slug pattern (the `/learning-center/{topic}/` choice vs Frame's `/blog/utah/{topic}.html`)
- Whether their `<title>` includes the year ("2026")
- Whether their first paragraph leads with a concrete $ range
- Any `Article`, `FAQPage`, or `HowTo` JSON-LD
- Length of the page in words (~ballpark)

**Also fetch these 2 secondary cited URLs** for additional pattern triangulation:
- `https://homerroofing.net/pricing/`
- `https://homerroofing.net/faqs/`

Note any URL pattern consistency (do all 3 use `/learning-center/`-style slugs? Or are some different?).

---

## Task 2 — Audit Frame's current cost page (10 min)

**Target file (read, do NOT edit yet):** `~/projects/frame-restoration-utah/blog/utah/roof-replacement-cost-utah-2026.html`

Extract the same structural facts as Task 1:

- Verbatim H1 + first 100 words
- URL slug pattern (`/blog/utah/roof-replacement-cost-utah-2026.html`)
- `<title>` tag contents
- First paragraph: does it lead with a concrete $ range?
- JSON-LD schemas present
- FAQ blocks present?
- Approximate word count

Save findings to `~/projects/frame-restoration-utah/data/AEO-FRAME-COST-PAGE-AUDIT-2026-05-20.md` alongside the homerroofing audit.

---

## Task 3 — Identify the 3 highest-leverage edits (15 min, analysis only)

Diff the two audits. Pick the **3 edits with the highest plausible impact on AIO citation eligibility**, prioritized by:

1. **Opening paragraph shape** — does Frame's first 100 words contain a clean parseable cost range like `"$8,500 to $25,000"` or `"\\$8,500"` snippet candidate? (homerroofing's AIO-winning snippet was: *"Roof replacement in Utah in 2026 typically ranges from $8,500 to $25,000, with the average standard single-family home costing around $11,000 to $15,000. Costs are driven by your home's square footage, roof pitch, local building snow-load codes, and your choice of material."*)
2. **URL slug pattern** — Frame's `/blog/utah/roof-replacement-cost-utah-2026.html` vs homerroofing's `/learning-center/roof-replacement-cost-utah/`. Treat this as an audit finding, not an automatic edit. A plain Vercel redirect from `/learning-center/roof-replacement-cost-utah/` to the existing blog URL will not cleanly test slug/path influence because Google will consolidate to the destination. Only choose a URL-path edit if you propose a real canonical migration or static canonical page and document the SEO risk; otherwise choose another on-page structural edit.
3. **Concrete $ figure prominence** — is the average dollar number in the H1, the meta description, OR within the first sentence visible at the top of mobile viewport? (Mobile is where AIO surfaces.)

**Do NOT propose more than 3 edits.** This is a single-hypothesis test, not a rewrite. Fewer changes = cleaner attribution when (if) the citation lands.

Document the 3 proposed edits in `~/projects/frame-restoration-utah/data/AEO-EDIT-PROPOSAL-2026-05-20.md` with:

- The edit (specific before/after text or file change)
- The hypothesis it tests
- The acceptance criteria for "edit shipped correctly"

---

## Task 4 — Ship the 3 edits via PR (20-30 min)

**Workflow (per `feedback_pr_workflow_solo_repos.md`):**

```
git checkout -b aeo/cost-page-aio-rewrite-2026-05-20
# Apply the 3 edits
git add -A
git commit -m "feat(aeo): rewrite cost-page structure for AIO citation eligibility

3-edit experiment per data/AEO-EDIT-PROPOSAL-2026-05-20.md:
1. <replace with final edit 1 from proposal>
2. <replace with final edit 2 from proposal>
3. <replace with final edit 3 from proposal>

Tests hypothesis that homerroofing.net's 5/7 AIO citation rate is driven by
specific structural patterns. Measured against locked 26-query panel by next
monthly sweep.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

gh pr create --title "feat(aeo): cost-page AIO citation experiment (3 edits)" \
  --body "$(cat <<'EOF'
## Summary

- Ships the 3 edits documented in \`data/AEO-EDIT-PROPOSAL-2026-05-20.md\`
- Keeps the experiment scoped to one page and one hypothesis
- Does not add a URL redirect unless the proposal explicitly chooses a canonical migration and documents the risk

## Hypothesis

Per \`data/AEO-COMPETITOR-MODEL-HOMERROOFING-2026-05-20.md\`, homerroofing.net is cited
5/7 times in Frame's market AIO blocks. These 3 structural changes test whether
the proposed structural differences drive eligibility.

## Test plan

- [ ] Vercel preview deploys clean
- [ ] Page renders correctly on mobile (320px viewport — where AIO surfaces)
- [ ] No regression in existing JSON-LD schemas
- [ ] \`tel:\` and \`sms:\` hrefs unchanged (302-4422 display, 292-8802 Twilio)
- [ ] No new fabricated trust claims
- [ ] Measured against locked panel on June 1 monthly sweep

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" \
  --auto --squash
```

After merge: confirm `https://www.frameroofingutah.com/blog/utah/roof-replacement-cost-utah-2026` loads with the new opening paragraph (use WebFetch or curl to verify).

---

## Task 5 — Wait for crawl + index, then re-measure (automatic)

**No action needed** — the next scheduled AIO sweep is June 1 (manual trigger until LaunchAgent ships in Phase 1.5).

When you re-run the sweep, the script's locked panel + same location/device/day pattern guarantees apples-to-apples comparison vs `data/AEO-AIO-SWEEP-2026-05-20.md` baseline.

**Trigger the June 1 sweep manually with:**
```bash
python3 ~/projects/frame-restoration-utah/scripts/aeo-aio-sweep.py
```

Compare delta in `data/AEO-AIO-SWEEP-2026-06-01.md` vs today's baseline. Look for:

- ✅ **Win condition:** Frame cited in the cost-query AIO block (specifically `how much does a new roof cost in Utah` or `roof replacement cost Utah 2026`)
- ⚠️ **Partial win:** AIO references include Frame's domain at any position, even if not in the cost query specifically
- ❌ **No-op:** Frame still 0/N cited → hypothesis wrong; revisit pattern (likely needs deeper authority signal: backlinks, age, schema)

---

## What this experiment is NOT

- ❌ A site-wide rewrite of all blog content
- ❌ A multi-page edit batch
- ❌ A keyword-stuffing pass (the "AEO: concentration over repetition" rule applies)
- ❌ A schema change unless directly tied to the 3 edits
- ❌ Anything that changes the dual-number convention or brand boundary

Keep scope tight. **One hypothesis, 3 edits, 1 PR, measured on 1 panel.**

---

## Acceptance criteria

This Cowork handoff is "complete" when:

1. ✅ `data/AEO-COMPETITOR-MODEL-HOMERROOFING-2026-05-20.md` exists with structural audit of all 3 cited homerroofing URLs
2. ✅ `data/AEO-FRAME-COST-PAGE-AUDIT-2026-05-20.md` exists with parallel audit of Frame's current cost page
3. ✅ `data/AEO-EDIT-PROPOSAL-2026-05-20.md` documents the 3 specific edits + hypothesis + acceptance criteria
4. ✅ PR merged to main, auto-deployed to https://www.frameroofingutah.com
5. ✅ Live page confirmed to reflect changes via WebFetch
6. ✅ Note added to this file's `## SESSION LOG` describing what was shipped, what wasn't, and any blockers

If any task can't be completed, leave a note in this file under `## Blockers` instead of forcing the experiment to ship in a degraded form. A failed audit ≠ a failed experiment.

---

## Reference artifacts (read these if you need more context)

- `~/projects/frame-restoration-utah/data/AEO-AIO-SWEEP-2026-05-20.md` — the baseline measurement (full per-query detail across 10 queries; 350 lines)
- `~/projects/frame-restoration-utah/scripts/aeo-aio-sweep.py` — instrumentation, Codex-audited, locked panel
- `~/projects/frame-restoration-utah/data/CODEX-HANDOFF-SERPAPI-2026-05-20.md` — the architecture v1.1 doc Codex audited
- `~/projects/frame-restoration-utah/CLAUDE.md` — full Frame Utah state (rules, schema, conventions)
- `~/projects/frame-restoration-utah/blog/utah/roof-replacement-cost-utah-2026.html` — the page being modified

---

## SESSION LOG

_(append below as work progresses)_

### 2026-05-20 — Handoff created
- Tasks 1-5 defined. Awaiting Cowork pickup.

### 2026-05-20 — Audit phase complete (Claude, /frame-business-loop)
- Tasks 1-3 executed by Claude Opus 4.7 in audit lane.
- Deliverables on disk: `AEO-COMPETITOR-MODEL-HOMERROOFING-2026-05-20.md`, `AEO-FRAME-COST-PAGE-AUDIT-2026-05-20.md`, `AEO-EDIT-PROPOSAL-2026-05-20.md`.
- Proposal verdict: 🟢 ship text/meta only; skip pre-merge 26-query sweep; do not reject hypothesis.
- Handed to Codex for independent audit.

### 2026-05-20 — Codex proposal audit returned 🟡 ship-with-changes
- 2 wording revisions applied to Edit 1 (source-align "can range" framing, drop "Most/typical" overclaims) + Edit 3 meta description (132-char source-aligned rewrite under Google truncation threshold).
- Edit 2 approved as-written.
- Measurement call: skip pre-merge 26-query sweep; use May 20 10-query baseline + first post-merge sweep on June 1 as full-panel baseline.

### 2026-05-20 — Implementation shipped (Claude, /frame-business-loop)
- **Boundary deviation noted:** implementation lane assigned to Claude rather than Cowork by explicit user instruction. No race occurred (no Cowork session was mid-edit). Pattern logged in handoff for audit trail.
- All 3 Cowork Gates passed pre-push.
- PR [#58](https://github.com/Rconman99/frame-restoration-utah/pull/58) created and auto-squash-merged at 2026-05-20T21:40:46Z.
- Squash commit on main: `cdee7ded0814d23f73385389164b5b6c5630036a` (revert this SHA if needed, NOT the local pre-merge `bbc20d3`).
- File scope: 1 file (`blog/utah/roof-replacement-cost-utah-2026.html`), +26 / −9.

### 2026-05-20 — Codex post-merge audit returned 🟢 ship-cleared
- All 8 verification checks passed against live production HTML.
- JSON-LD byte-identical pre/post (BlogPosting + FAQPage + HowTo + BreadcrumbList).
- Production URL returns HTTP 200 with merged content; 320px mobile renders cleanly.
- Residual watch item logged: bottom CTA fixed-position text overflow at 320px viewport — NOT caused by this experiment, NOT a revert trigger.
- **Status:** experiment running. Monitoring window: first measurement 2026-06-01, falsification close 2026-07-01.

---

_End of Cowork handoff. Frame Roofing Utah lane only._
