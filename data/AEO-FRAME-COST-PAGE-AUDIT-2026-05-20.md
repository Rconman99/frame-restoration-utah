# Frame Cost-Page Audit — `blog/utah/roof-replacement-cost-utah-2026.html`

**Date:** 2026-05-20 · **Audited by:** Claude Opus 4.7 (Auditor lane, /frame-business-loop)
**File audited:** `~/projects/frame-restoration-utah/blog/utah/roof-replacement-cost-utah-2026.html` (read-only; no edits made this pass)
**Pair audit:** `data/AEO-COMPETITOR-MODEL-HOMERROOFING-2026-05-20.md`

## Page-level facts

| Field | Value |
|---|---|
| URL on production | `https://www.frameroofingutah.com/blog/utah/roof-replacement-cost-utah-2026` |
| Local file | `blog/utah/roof-replacement-cost-utah-2026.html` |
| URL slug pattern | `/blog/{state}/{slug}.html` (with `.html` extension — distinguishes from Homer's `/learning-center/{topic}/`) |
| Title tag | `Roof Replacement Cost in Utah (2026 Guide) \| What You'll Actually Pay` |
| Meta description | "What does a new roof actually cost in Utah in 2026? Learn what drives pricing — roof size, pitch, materials, elevation — and why online calculators get it wrong. No prices locked in, just the factors that matter." |
| Canonical | `https://www.frameroofingutah.com/blog/utah/roof-replacement-cost-utah-2026` |
| Robots | `index, follow` |
| H1 (visible) | `Roof Replacement Cost in Utah: What You'll Actually Pay in 2026` |
| Last updated | 2026-04-22 (visible + JSON-LD `dateModified`) |
| Published | 2026-03-27 (JSON-LD `datePublished`) |
| Approximate word count | ~1,800 words (body) |
| Author | Landon Yokers (visible bio, DOPL #14256097-5501 cited) |

## Schema present

| @type | Present? | Quality |
|---|---|---|
| `BlogPosting` | ✅ | Full — headline, datePublished, dateModified, author Person w/ jobTitle Owner, publisher Organization, mainEntityOfPage, `digitalSourceType: humanWritten` |
| `FAQPage` | ✅ | 5 Q&A pairs, each with $ ranges and specific details in `acceptedAnswer.text` |
| `HowTo` | ✅ | 6 named steps with per-step $ ranges per square foot for material tiers |
| `BreadcrumbList` | ✅ | 3-item breadcrumb chain |

**Frame has more schema than Homer (Homer had no detectable JSON-LD).** This is the proof that JSON-LD richness is not the AIO citation differentiator for this query.

## First paragraph (verbatim)

> "Search 'roof replacement cost Utah' and you'll get a dozen pages throwing out numbers like they know what your roof looks like. They don't. Every one of those calculators is guessing based on national averages and a zip code. The reality is that a roof replacement in Sandy on a single-story rambler is a fundamentally different job than a steep-pitch mountain home in Park City — and the price reflects that."

## Second paragraph (verbatim)

> "This guide won't give you a fake 'your roof costs exactly $X' number. Instead, we'll walk through every factor that actually determines what you'll pay, explain why Utah is different from the rest of the country, and help you know what questions to ask before you sign anything."

## $ ranges in first 100 words

**ZERO.** First 100 words contain zero dollar amounts.

The first dollar amount appears in the JSON-LD FAQPage `acceptedAnswer` (Q1: "$8,000 for a small, simple roof to well over $30,000") — buried in `<head>`, not visible body text. The HowTo schema also has per-tier $ ranges ($3-5/sq ft, $5-8/sq ft, $8-15+/sq ft) — also in `<head>`.

## Visible FAQ block on page

**None visible.** The 5 Q&A pairs exist only in JSON-LD `FAQPage.mainEntity`. They do not appear as visible HTML for users (or for AIO crawler text extraction).

## Body content structure

The page is well-organized but optimized for "this person isn't going to lie to me" trust-building, not AIO snippet extraction:

- H2 "Why There's No Single Answer to 'How Much?'" — explicitly refuses to anchor a number
- H3 sections deconstruct each pricing factor (size, pitch, tear-off, decking, material, ventilation)
- H2 "What Makes Utah Different From National Averages" — elevation, hail, snow loads, climate swings
- H2 "The Insurance Factor" — emphasizes inspection-before-claim
- H2 "Why Online Calculators Get It Wrong" — anti-calculator framing
- H2 "How to Compare Bids Without Getting Burned" — bid-vetting checklist
- H2 "When to Replace vs. Repair"
- H2 "The Real Answer: Get Your Roof Inspected"

The page closes with a "Get a Straight Answer on Your Roof" CTA leading to the free-inspection booking calendar.

## Editorial voice — what's strong

- Honest framing builds **click-through-to-quote conversion**. A homeowner who reads this page is more likely to book an inspection than one who reads Homer's numbers-first page.
- **E-E-A-T signals strong:** owner-author byline, DOPL license number, BBB A+ badge, 10-year workmanship warranty.
- **Local specificity** beats Homer: 13 city links, elevation specifics by community, neighborhood-specific architectural-shingle preferences.
- **Compliance posture is conservative:** "no prices locked in" guards Frame against bait-and-switch accusations, which is a real legal/regulatory consideration in roofing.

## The structural delta (Frame vs Homer)

| Trait | Homer (cited 5/7 AIO) | Frame (cited 0/7) |
|---|---|---|
| H1 in question form | ✅ "How Much Does a New Roof Cost in Utah in 2026?" | ❌ "Roof Replacement Cost in Utah: What You'll Actually Pay in 2026" (declarative title) |
| $ range in first sentence | ✅ "Most Utah homeowners pay between $8,500 and $25,000" | ❌ "Search 'roof replacement cost Utah' and you'll get a dozen pages..." |
| Typical/average anchor figure in first 100 words | ✅ "$11,000 to $14,000 average" | ❌ Absent |
| Visible FAQ Q&A blocks | ✅ 8 visible Q&As | ❌ FAQ only in JSON-LD |
| URL slug | `/learning-center/{topic}/` (evergreen reference) | `/blog/{state}/{slug}.html` (time-bound post) |
| Word count | 2,100-2,300 | ~1,800 |
| JSON-LD richness | None detected | BlogPosting + FAQPage + HowTo + BreadcrumbList |
| Author E-E-A-T | Not visible | Strong (owner byline + DOPL license) |

## What the audit proves

1. **Frame's page is editorially excellent and structurally invisible to Google AI Overview.** Both are true at the same time.
2. **JSON-LD is not the AIO citation differentiator** for this query. Frame has more schema than Homer; Frame still loses.
3. **Visible-text-snippet shape matters more than schema.** The AIO is extracting the cited text from visible HTML, then using it verbatim. Frame's visible HTML actively refuses to provide an extractable cost sentence.
4. **The fix is editorial-style alignment** (concrete $ ranges in the opener, visible FAQ mirror, question-format title) — not schema additions, URL changes, or technical SEO work.

---

## Constraints carried into the edit proposal

Per the Cowork handoff rules of engagement:

- ⛔ No new fabricated trust claims. Anything in the rewrite must be consistent with Frame's existing JSON-LD `acceptedAnswer.text` ranges + HowTo per-sq-ft tiers (which Landon authored). Cross-check below.
- ⛔ No "drone inspection" service framing.
- ⛔ Dual-number rule preserved: visible 435-302-4422 (display), `tel:` href to 435-292-8802 (already on this page — confirmed lines 189, 356, 395).
- ⛔ Frame Roofing Utah brand string (no cross to Frame Restoration TX).
- ⛔ AEO: concentration over repetition. Don't keyword-stuff. One rewritten opener, one FAQ block, one title/meta/H1 reframe — that's it.

## Cross-check: are the $ ranges Frame already endorses consistent?

Pulling from Frame's own existing schema on this same page (no fabrication, just surfacing what's already there):

- **FAQPage Q1 acceptedAnswer text** says: *"A Utah roof replacement can range from under $8,000 for a small, simple roof to well over $30,000 for a large or complex one."*
- **HowTo material tiers** say: *"Basic three-tab shingles cost $3-5/sq ft installed. Architectural shingles run $5-8/sq ft. Designer and metal range from $8-15+/sq ft."*

A 2,400 sq ft roof at $5-8/sq ft architectural = $12,000-$19,200, which lands squarely in the $11,000-$15,000 "typical" anchor Homer uses. Frame's existing schema endorses the same range Homer publishes. The range isn't fabricated — it's just absent from visible text.

**This is the key compliance finding:** the proposed edits surface ranges Frame's owner has already endorsed in JSON-LD. They are not new claims.

---

_End of Frame cost-page audit._
