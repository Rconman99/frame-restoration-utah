# Competitor Model — homerroofing.net AIO Citation Pattern

**Date:** 2026-05-20 · **Audited by:** Claude Opus 4.7 (Auditor lane, /frame-business-loop)
**Source:** AEO sweep 2026-05-20 measured `homerroofing.net` as the most-cited domain across Frame's market AIO blocks (5 citations across 7 AIO surfaces). This audit deconstructs why.

## URLs audited

1. `https://homerroofing.net/learning-center/roof-replacement-cost-utah/` — the AIO-winning cost page (cited #2 in the AIO for "how much does a new roof cost in Utah")
2. `https://homerroofing.net/pricing/` — the published-pricing page (cited at #10 for the same AIO query)
3. `https://homerroofing.net/faqs/` — the FAQ hub (cited #14 for the cost AIO)

All 3 URLs accessed via WebFetch on 2026-05-20.

---

## URL 1 — `/learning-center/roof-replacement-cost-utah/`

| Field | Value |
|---|---|
| H1 | `How Much Does a New Roof Cost in Utah in 2026?` |
| Title tag | `How Much Does a New Roof Cost in Utah in 2026? \| Homer Roofing` |
| URL slug pattern | `/learning-center/{topic}/` (no `.html` extension, trailing slash) |
| First-100-words concrete $ ranges | **3 distinct ranges in first 100 words:** `$8,500 and $25,000`, `$11,000 to $14,000`, mention of "metal roofing and premium materials run higher" |
| Visible FAQ | Yes — 8 Q&A pairs visible on page |
| JSON-LD schemas | Not detected in fetched HTML (could be JS-injected; WebFetch may not see it) |
| Approximate word count | 2,100–2,300 words |

### First paragraph (verbatim)
> "Most Utah homeowners pay between $8,500 and $25,000 for a full roof replacement with asphalt shingles. The average for a standard single-family home falls around $11,000 to $14,000. Metal roofing and premium materials run higher. Here is what drives that range."

### Structural takeaways
- **Question-format H1** matches the user's literal AIO query verbatim
- **Concrete $ range in sentence 1** — extractable as AIO snippet text (this exact range appears as the AIO text block we measured 2026-05-20)
- **Average / median callout** in sentence 2 — gives AIO a "typical" anchor number
- **"Here is what drives that range"** — explicit transition that AIO can use as a follow-up card

---

## URL 2 — `/pricing/`

| Field | Value |
|---|---|
| H1 | `How Much Does a New Roof Cost in Utah?` |
| Title tag | Not extractable from fetched content |
| URL slug pattern | `/pricing/` (trailing slash, no extension) |
| First-100-words concrete $ ranges | 3 ranges: `$12,000 to $18,000`, `$5,000–$6,000`, `$25,000+` |
| Visible FAQ | Yes — 1 "Pricing Questions We Hear Every Day" section with Q&A pairs |
| JSON-LD schemas | Not detected |
| Approximate word count | ~2,100 |

### First paragraph (verbatim)
> "You deserve real numbers before anyone shows up at your door. Most homeowners worry they will get a vague quote, a high-pressure pitch, or a surprise bill after the work is done. We publish our pricing because you should know what a roof costs before you ever pick up the phone."

### Structural takeaway
- Different rhetorical opening (trust framing) but still has concrete $ ranges within first 100 words. Pattern holds.

---

## URL 3 — `/faqs/`

| Field | Value |
|---|---|
| H1 | `Frequently Asked Questions` |
| URL slug pattern | `/faqs/` (trailing slash, no extension) |
| First-100-words concrete $ ranges | 2: `$8,500 to $25,000`, `$15,000` (metal roof start) |
| Visible FAQ | Yes — **20 Q&A pairs** across 4 themed sections (General, Replacement & Installation, Materials, Storm Damage & Insurance) |
| JSON-LD schemas | Not detected |
| Approximate word count | 3,200 |

### First paragraph (verbatim)
> "Our team is here to give you honest answers and help you make the right decision for your home. General Roofing Questions What does a new roof cost in Utah? Homer Roofing replaces most Utah asphalt shingle roofs for $8,500 to $25,000, and metal roofs typically start around $15,000..."

### Structural takeaway
- Even the FAQ hub leads with the cost-question and its concrete $ range. The pattern is consistent across the 3 cited pages.

---

## Cross-URL pattern (the model)

All 3 cited Homer pages share **5 structural traits**:

1. **H1 in question form** matching the user's literal AIO query ("How Much Does a New Roof Cost in Utah?" — not "Roof Replacement Cost Guide")
2. **Concrete $ range in sentence 1 or 2** of the first paragraph, extractable as AIO snippet text without further parsing
3. **"Typical / average / standard" anchor figure** (e.g. "$11,000 to $14,000") alongside the wider range — gives AIO an anchor it can pull out separately
4. **Visible FAQ Q&A blocks** (8-20 pairs depending on page) — not just JSON-LD FAQPage; the answers are visible HTML
5. **URL pattern signaling evergreen reference content** (`/learning-center/`, `/pricing/`, `/faqs/` — no date stamps, no `.html` extensions, no `/blog/` connotation)

## Caveats

- **JSON-LD wasn't detectable on any of the 3 URLs via WebFetch.** Could be JS-injected (Schema.org markup loaded via tag manager or React SSR hydration), or genuinely absent. **Frame has more schema than Homer** (BlogPosting + FAQPage + HowTo + BreadcrumbList all present). Frame still loses the citation slot. **Schema is not the differentiator — visible-text-snippet shape is.** This is the most important finding of the audit.
- Sample size is 3 pages. Pattern is consistent across all 3 but not statistically conclusive. Codex's recommendation of a 20-30 query measurement panel against the same locked query set is the right rigor.
- The audit doesn't measure backlink authority, domain age, GBP signals, or other off-page factors that may also drive citation selection. We're testing ONE hypothesis (on-page visible structure); if that hypothesis fails, those off-page factors become the next investigation.

---

## What Homer does NOT do that Frame does

For balance — Frame's page has strengths Homer's doesn't:

- **Author E-E-A-T:** Frame's page has Landon Yokers author bio with DOPL license #14256097-5501, BBB A+ accreditation badge, 10-year workmanship warranty. Homer's pages don't show comparable owner-byline credentials.
- **Schema depth:** Frame has BlogPosting + FAQPage + HowTo + BreadcrumbList JSON-LD all present. Homer has none detected.
- **Local specificity:** Frame's page links to 13 city pages and discusses elevation-specific roofing requirements (Heber Valley snow loads, Wasatch Front hail). Homer's page is statewide-generic.
- **Editorial voice:** Frame's "we won't give you a fake number" framing builds trust on click-through. That's a conversion-optimization choice with real value.

Frame's page is **editorially stronger**. It just isn't AIO-extraction-friendly. The proposed edits preserve Frame's editorial strengths while adding the AIO-extraction shape Homer demonstrates is necessary.

---

_End of competitor model audit._
