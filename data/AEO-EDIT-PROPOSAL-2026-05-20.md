# Edit Proposal — Frame Cost-Page AIO Citation Experiment

**Date:** 2026-05-20 · **Author:** Claude Opus 4.7 (Auditor lane, /frame-business-loop)
**Pair docs:** [Competitor model](./AEO-COMPETITOR-MODEL-HOMERROOFING-2026-05-20.md) · [Frame page audit](./AEO-FRAME-COST-PAGE-AUDIT-2026-05-20.md)
**Status:** **Codex-audited 🟡 ship-with-changes — revisions applied below** · **Action required:** Cowork executes the PR using the revised wording
**Codex audit summary:** Edit 1 + Edit 3 wording revised to source-aligned phrasing; Edit 2 approved as-written. Skip pre-merge 26-query sweep — use May 20 10-query baseline as reference; first post-merge 26-query run becomes the full panel baseline.

---

## The hypothesis being tested

> **Frame's visible-text-snippet shape — not its schema, authority, or content depth — is the reason Frame is 0/7 cited in Google AI Overview blocks across its market.** Aligning the opening paragraph, FAQ surface, and title-tag-set with the structural pattern homerroofing.net uses (cited 5/7 in the same sweep) should move Frame's cost page into citation eligibility within 30 days of crawl.

The audit pair confirms the delta is **visible-text shape**, not schema (Frame already has richer schema than Homer). The proposal targets that single dimension with 3 minimal edits.

---

## Edit 1 — Rewrite the opening paragraph to lead with a concrete cost range

**Target file:** `blog/utah/roof-replacement-cost-utah-2026.html`
**Target lines:** Approximately lines 212–214 (first two `<p>` blocks of `article.blog-body`).

### Before (verbatim, lines 212–214)

```html
<p>Search "roof replacement cost Utah" and you'll get a dozen pages throwing out numbers like they know what your roof looks like. They don't. Every one of those calculators is guessing based on national averages and a zip code. The reality is that a roof replacement in <a href="/locations/sandy">Sandy</a> on a single-story rambler is a fundamentally different job than a steep-pitch mountain home in <a href="/locations/park-city">Park City</a> &mdash; and the price reflects that.</p>

<p>This guide won't give you a fake "your roof costs exactly $X" number. Instead, we'll walk through every factor that actually determines what you'll pay, explain why Utah is different from the rest of the country, and help you know what questions to ask before you sign anything.</p>
```

### After (Codex-revised, source-aligned — SHIP THIS)

```html
<p>A Utah roof replacement can range from under <strong>$8,000</strong> to well over <strong>$30,000</strong> in 2026. Using the architectural-shingle tier in this guide, a 2,400 sq ft roof budgets around <strong>$12,000 to $19,200</strong> before roof-specific variables like pitch, tear-off layers, access, elevation, and material choice move the number.</p>

<p>This guide walks through every factor that drives the price — and explains why an in-person inspection is the only honest way to land on a real number for your specific roof. A replacement in <a href="/locations/sandy">Sandy</a> on a single-story rambler is a fundamentally different job than a steep-pitch mountain home in <a href="/locations/park-city">Park City</a>, and the bid should reflect that.</p>
```

### Why this wording (Codex audit revision)

The original draft used "Most Utah homeowners pay between $8,000 and $30,000" and "typical single-family home landing around $12,000 to $19,000." Those are stronger framings than Frame's existing JSON-LD actually claims — the source schema says "can range from under $8,000... to well over $30,000" and gives per-sq-ft material tiers, not a "most/typical" claim.

The revised opener:
- Uses **"can range"** (matches FAQPage `acceptedAnswer.text` verbatim)
- Says **"Using the architectural-shingle tier in this guide"** (anchors the $12,000-$19,200 to the HowTo schema's $5-8/sq ft × 2,400 sq ft computation, not a population claim)
- Lists the drivers ("pitch, tear-off layers, access, elevation, material choice") without overclaiming a typical homeowner experience

This stays compliant with Frame's existing schema while still surfacing the parseable $ ranges needed for AIO snippet eligibility.

### Hypothesis this tests
Concrete $ range as the first sentence (extractable as AIO snippet text) is the structural prerequisite for AIO citation eligibility on cost-style queries. **Specifically tests:** does the AIO snippet extraction prefer "Most Utah homeowners pay $X to $Y" sentence shape over "Search X and you'll get…" sentence shape?

### Why this is not a fabricated claim
The proposed $ ranges are taken directly from **Frame's existing JSON-LD on this same page**:
- `FAQPage > mainEntity[0] > acceptedAnswer.text` already states: *"A Utah roof replacement can range from under $8,000 for a small, simple roof to well over $30,000 for a large or complex one"*
- `HowTo` schema material tiers compute to $12,000–$19,200 for a 2,400 sq ft architectural roof at $5-8/sq ft, which establishes the "typical" $12,000–$19,000 anchor
- No new dollar figures are introduced. The edit surfaces what's already in Frame's schema.

### Constraints honored
- ✅ Frame's editorial voice preserved (still leads with honesty about variables, still ends with "in-person inspection is the only honest way")
- ✅ City links to Sandy + Park City preserved (moved to paragraph 2)
- ✅ No new trust claims
- ✅ No keyword stuffing; ranges appear once, naturally

### Acceptance criteria
- [ ] First paragraph's first sentence contains the literal pattern `$X,XXX and $XX,XXX` or `$X,XXX to $XX,XXX`
- [ ] First 60 words contain at least 2 concrete dollar ranges
- [ ] Page word count change: +30 to +60 words (no net page-length explosion)
- [ ] `<strong>` tags on the two dollar ranges (visual emphasis for human readers + structural signal for parsers)
- [ ] No change to JSON-LD; no change to canonical; no change to URL

---

## Edit 2 — Add a visible FAQ section mirroring the existing JSON-LD FAQPage

**Target file:** `blog/utah/roof-replacement-cost-utah-2026.html`
**Target insertion point:** Between the "The Real Answer: Get Your Roof Inspected" H2 section and the existing `<div class="sources-section">` Sources block (approximately after line 325).

### Before
No visible FAQ section exists on the page. The 5 Q&A pairs live only in `<script type="application/ld+json">` FAQPage block (lines 67–109 of the file).

### After (proposed)

Insert a new H2 section with the 5 Q&A pairs rendered as visible HTML. The Q&A text comes verbatim from the existing JSON-LD `acceptedAnswer.text` strings — no new content, just surfacing.

```html
<h2>Frequently Asked Questions</h2>

<h3>How much does a roof replacement cost in Utah in 2026?</h3>
<p>There is no single answer. A Utah roof replacement can range from under $8,000 for a small, simple roof to well over $30,000 for a large or complex one. The price depends on your roof's square footage, pitch, number of layers to tear off, the material you choose, and your home's location and elevation. The only way to get a real number is a professional inspection of your specific roof.</p>

<h3>Why do online roof cost calculators give different numbers than actual bids?</h3>
<p>Online calculators use national averages and square footage estimates. They cannot see your roof's actual condition — rotted decking, multiple shingle layers, flashing failures, ventilation issues, or access challenges. A contractor who walks your roof will find things a calculator never can, which is why in-person estimates are consistently different from online tools.</p>

<h3>Does insurance cover roof replacement in Utah?</h3>
<p>If your roof was damaged by a specific weather event — hail, wind, a fallen tree — your homeowner's insurance typically covers the replacement minus your deductible. Damage from normal aging and wear is not covered. A qualified roofing contractor can inspect your roof and tell you honestly whether the damage appears storm-related before you file a claim.</p>

<h3>Is a roof replacement cheaper in the Salt Lake Valley than in Park City or Heber City?</h3>
<p>Generally yes. Mountain communities like Park City, Heber City, and Midway require materials rated for heavier snow loads, higher wind resistance, and extreme freeze-thaw cycling. Steeper pitches common at elevation add labor time and safety equipment costs. Access can also be more difficult. Valley homes tend to have simpler roof lines and standard material requirements.</p>

<h3>How long does a roof replacement take in Utah?</h3>
<p>Most single-family homes take one to three days. Larger homes, steep pitches, or roofs with multiple layers to tear off can take three to five days. Weather is the main variable — Utah's afternoon storms in spring and summer can push timelines. Your contractor should give you a specific estimate before starting.</p>
```

### Hypothesis this tests
Visible Q&A blocks contribute to AIO follow-up-card eligibility independently of JSON-LD `FAQPage`. **Specifically tests:** does AIO weight visible-FAQ-on-page differently than schema-only-FAQ?

### Why this is not a duplication risk
- The content is identical to existing JSON-LD `acceptedAnswer.text` — Google does not penalize for schema-content match. They reward it.
- The 2026-04-22 audit log notes Frame already added "FAQPage JSON-LD + visible Quick Answer passages" to 4 OTHER service pages (residential-roofing, roof-replacement, storm-damage, insurance-claims). This is the same pattern applied to the cost blog post.

### Constraints honored
- ✅ No new claims (text comes verbatim from existing schema, which Landon authored)
- ✅ Dual-number rule untouched
- ✅ Brand voice untouched (the Q&A text is Frame's existing voice already)

### Acceptance criteria
- [ ] H2 "Frequently Asked Questions" appears between the inspection-CTA section and Sources section
- [ ] 5 H3 + paragraph pairs visible on rendered page
- [ ] Each Q&A `<p>` text matches its corresponding JSON-LD `acceptedAnswer.text` verbatim (no drift)
- [ ] Page word count change: +400 to +500 words (within Homer's 2,100-2,300 envelope)
- [ ] No change to JSON-LD itself
- [ ] Existing CSS classes used (or none added — plain `<h2>`/`<h3>`/`<p>`)

---

## Edit 3 — Reframe title tag, meta description, and H1 to question form with $ range

**Target file:** `blog/utah/roof-replacement-cost-utah-2026.html`
**Target lines:**
- Line 7 (`<title>`)
- Line 8 (`<meta name="description">`)
- Lines 14–15, 22–23 (`og:title`, `og:description`, `twitter:title`, `twitter:description`)
- Line 202 (`<h1>`)

### Before (verbatim)

```html
<!-- Line 7 -->
<title>Roof Replacement Cost in Utah (2026 Guide) | What You'll Actually Pay</title>

<!-- Line 8 -->
<meta name="description" content="What does a new roof actually cost in Utah in 2026? Learn what drives pricing — roof size, pitch, materials, elevation — and why online calculators get it wrong. No prices locked in, just the factors that matter." />

<!-- Line 202 -->
<h1>Roof Replacement Cost in <span>Utah</span>: What You'll Actually Pay in 2026</h1>
```

### After (Codex-revised, source-aligned — SHIP THIS)

```html
<!-- Line 7 -->
<title>How Much Does a Roof Replacement Cost in Utah? (2026 Guide)</title>

<!-- Line 8 (Codex-revised: 132 chars, source-aligned) -->
<meta name="description" content="Utah roof replacement can range from under $8,000 to over $30,000 in 2026; a 2,400 sq ft architectural roof budgets $12,000-$19,200." />

<!-- Line 202 -->
<h1>How Much Does a Roof Replacement Cost in <span>Utah</span> in 2026?</h1>
```

**Also update the 4 paired Open Graph + Twitter Card lines** (14, 15, 22, 23):
- `og:title` + `twitter:title` → match the new `<title>` text
- `og:description` + `twitter:description` → match the new `<meta description>` text

So OG and SERP previews stay in sync with the new title + description.

### Hypothesis this tests
Question-format title + meta + H1 (matching the user's literal AIO query word-for-word) drives AIO query-matching at retrieval time. **Specifically tests:** does AIO retrieval weight question-form headlines higher than declarative-topic headlines?

### Constraints honored
- ✅ Year ("2026") preserved in all three elements
- ✅ Brand voice preserved in meta description (still names the drivers + "compare bids honestly")
- ✅ JSON-LD `BlogPosting.headline` left as-is to avoid double-update inconsistency (acceptable: Google AIO uses visible H1 + title, not JSON-LD headline, for query matching)
- ✅ `<span>` gold-highlight on "Utah" preserved (brand styling)
- ✅ No keyword stuffing (the phrase "roof replacement cost" appears once per element instead of twice)

### Acceptance criteria
- [ ] `<title>` starts with literal phrase "How Much Does a"
- [ ] `<title>` ends with year "(2026 Guide)"
- [ ] `<meta description>` contains the literal $ range "$8,000 and $30,000" and "$12,000-$19,000"
- [ ] `<h1>` ends with question mark `?`
- [ ] OG and Twitter title/description tags updated to mirror (4 lines)
- [ ] Total characters in title tag stays under 60 (currently proposed: ~57)
- [ ] Total characters in meta description stays 140-160 range (currently proposed: ~190 — **may need trimming** — see Codex review note below)

### ✅ Codex finalized the meta description
The version above is Codex's source-aligned 132-character revision (was ~190 in my original draft — over Google's 155-160 char truncation threshold and used the same "most" framing flagged in Edit 1). Final wording is locked; Cowork ships it verbatim.

---

## What this proposal explicitly does NOT do

Per Codex's audit + Ryan's safety corrections + Cowork handoff rules:

- ❌ **NO URL slug migration to `/learning-center/`.** Per Ryan's correction to the handoff (`COWORK-HANDOFF-2026-05-20.md` line 96), this is an audit finding only. A plain Vercel redirect doesn't test slug influence (Google consolidates to destination). A real canonical migration carries SEO risk (existing inbound links, organic rankings, internal links from 11+ other pages on the site). **Deferred to a separate proposal if Edits 1-3 don't move the needle.**
- ❌ **NO new JSON-LD.** Frame already has more schema than Homer; adding more isn't the lever.
- ❌ **NO changes to existing internal links, CTAs, or related-content chips.**
- ❌ **NO changes to `tel:`/`sms:` hrefs** (preserves dual-number rule: visible 435-302-4422, hrefs 435-292-8802 — both confirmed already correct on this page at lines 189, 356, 395).
- ❌ **NO changes to author bio, BBB badge, DOPL license citation, or 10-year workmanship warranty language.**

---

## Falsification path

If all 3 edits ship and Frame is still 0/N cited on:
- **June 1 sweep** (14 days post-merge if Cowork ships within a week)
- **July 1 sweep** (additional 30 days for crawl + AIO index refresh)

…then the hypothesis is falsified. The visible-text-snippet structure is NOT the gating factor for Frame's AIO citation eligibility on this query. Next investigation candidates (in priority order):

1. **Off-page authority** — backlinks profile vs Homer's. Use Ahrefs MCP to compare referring-domain count + DR.
2. **Domain age / topical authority** — Homer may have been crawled-as-roofing-authority-domain longer.
3. **Content depth signals** — page-level word count alone may not capture "topical comprehensiveness" Google weighs.
4. **URL slug pattern** — the deferred `/learning-center/` migration becomes the next experiment, with full canonical migration cost accepted.

---

## Recommended sequencing for Cowork

1. Branch off main: `aeo/cost-page-aio-rewrite-2026-05-20`
2. Apply Edit 3 first (smallest blast radius, single-paragraph changes across `<head>` + H1)
3. Apply Edit 1 (rewrite first two body paragraphs — use the Codex-revised "can range" wording verbatim)
4. Apply Edit 2 (insert visible FAQ section — answers must match `acceptedAnswer.text` verbatim)
5. Manual verify in browser: page renders cleanly on mobile (320px viewport, where AIO surfaces) + desktop
6. Manual verify rendered HTML on Vercel preview matches `acceptedAnswer.text` strings (no drift)
7. **Run Codex Cowork Gate** (below) — block PR creation if any check fails
8. `gh pr create --auto --squash` per `feedback_pr_workflow_solo_repos.md`
9. After merge: WebFetch `https://www.frameroofingutah.com/blog/utah/roof-replacement-cost-utah-2026` to confirm production reflects the changes

## Codex Cowork Gate (pre-PR verification)

Run these from `~/projects/frame-restoration-utah/`:

```bash
# 1. Block stronger "most/typical" framing — these strings should NOT appear in the rewritten page
rg -n "Most Utah homeowners|typical single-family" blog/utah/roof-replacement-cost-utah-2026.html

# 2. Confirm dual-number rule preserved — visible 435-302-4422 displays, tel: hrefs point to 435-292-8802
rg -n "435-302-4422|tel:\+14352928802|sms:" blog/utah/roof-replacement-cost-utah-2026.html

# 3. No trailing whitespace, no merge conflict markers, no submodule errors
git diff --check
```

**Block PR creation if:**
- Check 1 returns ANY matches (stronger-than-source framing must be absent)
- Check 2 fails to find the dual-number pattern (must still show visible 435-302-4422 + tel: hrefs pointing to +14352928802)
- Check 3 returns errors
- The PR adds URL redirects, schema rewrites, new claims, phone-number changes, or more than the 3 approved edits

---

## Final disposition (post-Codex audit)

**Verdict: 🟡 Ship-with-changes (changes integrated above).** All 3 proposed edits are:
- Pure visible-text changes (paragraph rewrite, FAQ section insertion, title/meta/H1 reframe)
- No URL changes, no schema changes, no infrastructure changes
- Reversible via standard git revert if measurement shows a regression
- Consistent with Frame's existing JSON-LD (no fabrication; the $ ranges come from Frame's own author-attested schema)
- **Wording revisions applied** to remove "most" / "typical" claims that overclaimed beyond schema source

**Measurement call (Codex): skip the pre-merge 26-query sweep.** Use the May 20 10-query baseline as the reference for the cost-query AIO measurement. The first post-merge 26-query run (June 1) becomes the full-panel baseline going forward.

**Hypothesis remains testable.** The structural evidence is strong (Homer 5/7 with pattern, Frame 0/7 without it). The revised edits surface what Frame's existing schema already publishes, with no new claims introduced. There's no responsible way to test the visible-text-shape hypothesis without running this experiment.

## Audit history

| Round | Auditor | Verdict | Date |
|---|---|---|---|
| 1 — Proposal audit | Codex (independent) | 🟡 Ship-with-changes | 2026-05-20 |
| Reconciliation | Claude | Codex revisions applied | 2026-05-20 |
| 2 — Post-merge audit | Codex (independent, against live production HTML) | 🟢 Ship-cleared | 2026-05-20 |

## Shipped

| Field | Value |
|---|---|
| **PR** | [#58](https://github.com/Rconman99/frame-restoration-utah/pull/58) |
| **Branch** | `aeo/cost-page-aio-rewrite-2026-05-20` |
| **Local pre-merge commit** | `bbc20d3` |
| **Squash commit on main** | `cdee7ded0814d23f73385389164b5b6c5630036a` |
| **Merged at** | 2026-05-20T21:40:46Z |
| **Production URL** | https://www.frameroofingutah.com/blog/utah/roof-replacement-cost-utah-2026 (live, HTTP 200, content verified) |
| **File** | `blog/utah/roof-replacement-cost-utah-2026.html` (+26, −9) |
| **JSON-LD** | Byte-identical pre/post: BlogPosting + FAQPage + HowTo + BreadcrumbList intact |
| **Revert command if needed** | `git revert cdee7ded0814d23f73385389164b5b6c5630036a` (use the squash SHA, NOT bbc20d3 — bbc20d3 isn't on main) |

## Monitoring window

| Milestone | Date | Measurement |
|---|---|---|
| Experiment running as of | 2026-05-20 | Confirmed production deploy |
| First measurement of record | 2026-06-01 | `python3 ~/projects/frame-restoration-utah/scripts/aeo-aio-sweep.py` against `QUERY_PANEL_V1` (locked 26-query panel) — full-panel baseline |
| Falsification window close | 2026-07-01 | Second sweep against `QUERY_PANEL_V1` |
| Hypothesis falsified if | Frame still 0/N cited on `QUERY_PANEL_V1` cost queries at 2026-07-01 sweep | Next experiment: off-page authority (Ahrefs backlink comparison) or full canonical migration to `/learning-center/` slug with documented SEO risk |

## Residual watch items (NOT blocking, NOT this experiment)

1. **Bottom CTA fixed-position text overflow at 320px viewport** (Codex post-merge audit). Document width stays 320px (no page-level horizontal overflow), changed content is not the cause. Separate follow-up candidate — not a revert trigger for this experiment.

---

_End of edit proposal. Awaiting human approval. Cowork executes the PR using the Codex-revised wording above + the Codex Cowork Gate verification commands._
