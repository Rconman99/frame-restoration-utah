# SEO QA Audit Report — Sandy, UT Service Landing Pages
### Frame Restoration Utah | Audit Date: March 7, 2026
### Auditor Role: Senior SEO QA Lead

---

## Executive Summary

**Pages Audited:** 6 Sandy service landing pages
**Total Issues Found:** 9
**Critical:** 3 (schema type mismatches)
**Medium:** 4 (duplicate links, missing global page links)
**Low:** 1 (wrong audience word in H2)
**Observation:** 1 (shared hero image across all 6 pages)

---

## Page 1: Residential Roofing (`/locations/sandy/residential-roofing.html`)

| # | Check | Status |
|---|-------|--------|
| **Basic On-Page SEO** | | |
| 1 | Title tag ≤ 65 chars, keyword-first | ✅ PASS — "Residential Roofing Sandy UT \| Roof Replacement & Repair \| Frame Restoration" |
| 2 | Meta description 150–162 chars w/ ZIP + CTA | ✅ PASS — Includes 84070, phone number |
| 3 | Single H1 matching page topic | ✅ PASS |
| 4 | Logical heading hierarchy (H1→H2→H3) | ✅ PASS |
| 5 | Canonical URL set to www domain | ✅ PASS |
| 6 | OG + Twitter meta tags present | ✅ PASS |
| **Local SEO / Entity Signals** | | |
| 7 | geo.region, geo.placename, geo.position meta | ✅ PASS |
| 8 | ZIP codes in content (84070, 84094) | ✅ PASS |
| 9 | Sandy neighborhood references | ✅ PASS — Alta Canyon, Pepperwood, Dimple Dell, The District, 11400 South |
| 10 | NAP consistency (name, address, phone) | ✅ PASS |
| 11 | BreadcrumbList schema (Home > Sandy > Service) | ✅ PASS |
| **Content Quality & Uniqueness** | | |
| 12 | 5+ process steps | ✅ PASS — 5 steps |
| 13 | 5+ common problems addressed | ✅ PASS — 5 problems |
| 14 | Sandy-specific content (not generic) | ✅ PASS — Wasatch climate, canyon references |
| 15 | FAQ section with 4+ questions | ✅ PASS — 5 FAQs |
| **UX & Conversion** | | |
| 16 | Sticky mobile call bar | ✅ PASS |
| 17 | Multiple CTAs (hero + inline + bottom) | ✅ PASS |
| 18 | Internal links to city hub + sibling pages | ✅ PASS — Links to /locations/sandy, /pages/residential-roofing, /pages/storm-damage-restoration, /locations/sandy/storm-damage-restoration |
| 19 | No duplicate internal links | ✅ PASS |
| **Schema / Structured Data** | | |
| 20 | Service + FAQPage @graph pattern | ✅ PASS |
| 21 | Provider @type matches service | ✅ PASS — RoofingContractor |
| 22 | areaServed includes Sandy + ZIPs | ✅ PASS |

**Result: ✅ ALL PASS — 22/22**

**Top 5 Priorities:** None — this page is the reference template.

---

## Page 2: Commercial Roofing (`/locations/sandy/commercial-roofing.html`)

| # | Check | Status |
|---|-------|--------|
| **Basic On-Page SEO** | | |
| 1 | Title tag ≤ 65 chars, keyword-first | ✅ PASS |
| 2 | Meta description 150–162 chars w/ ZIP + CTA | ✅ PASS |
| 3 | Single H1 matching page topic | ✅ PASS |
| 4 | Logical heading hierarchy | ✅ PASS |
| 5 | Canonical URL set | ✅ PASS |
| 6 | OG + Twitter meta tags | ✅ PASS |
| **Local SEO / Entity Signals** | | |
| 7 | geo meta tags | ✅ PASS |
| 8 | ZIP codes in content | ✅ PASS |
| 9 | Sandy-specific references | ✅ PASS — State Street, Alta View Hospital, 9400 South, I-15 industrial |
| 10 | NAP consistency | ✅ PASS |
| 11 | BreadcrumbList schema | ✅ PASS |
| **Content Quality & Uniqueness** | | |
| 12 | 5+ process steps | ✅ PASS |
| 13 | 5+ common problems | ✅ PASS |
| 14 | Sandy-specific content | ✅ PASS |
| 15 | FAQ section 4+ questions | ✅ PASS — 4 FAQs |
| **UX & Conversion** | | |
| 16 | Sticky mobile call bar | ✅ PASS |
| 17 | Multiple CTAs | ✅ PASS |
| 18 | Internal links to hub + siblings | ✅ PASS |
| 19 | No duplicate internal links | ✅ PASS |
| **Schema / Structured Data** | | |
| 20 | Service + FAQPage @graph | ✅ PASS |
| 21 | Provider @type matches service | ✅ PASS — RoofingContractor (acceptable for commercial roofing) |
| 22 | areaServed includes Sandy | ✅ PASS |
| **Content Quality (additional)** | | |
| 23 | Audience language matches service type | ❌ FAIL — Line 228: H2 says "Homeowners" instead of "Business Owners" for commercial roofing |

**Result: 22/23 — 1 FAIL**

**Top 5 Priorities:**
1. **🔴 Fix H2 line 228** — Change "Why Sandy Homeowners Choose…" → "Why Sandy Business Owners Choose…"
2. Consider adding a 5th FAQ to match residential roofing page depth
3. Add commercial-specific schema properties (e.g., service areas for commercial districts)
4. Consider unique hero image showing commercial roofing work
5. Add link to a sibling restoration page for cross-linking depth

---

## Page 3: Storm Damage Restoration (`/locations/sandy/storm-damage-restoration.html`)

| # | Check | Status |
|---|-------|--------|
| **Basic On-Page SEO** | | |
| 1 | Title tag ≤ 65 chars, keyword-first | ✅ PASS |
| 2 | Meta description w/ ZIP + CTA | ✅ PASS |
| 3 | Single H1 | ✅ PASS |
| 4 | Logical heading hierarchy | ✅ PASS |
| 5 | Canonical URL | ✅ PASS |
| 6 | OG + Twitter meta | ✅ PASS |
| **Local SEO / Entity Signals** | | |
| 7 | geo meta tags | ✅ PASS |
| 8 | ZIP codes | ✅ PASS |
| 9 | Sandy-specific references | ✅ PASS — Pepperwood, Snowbird Village, Dimple Dell Park, Big/Little Cottonwood Canyons |
| 10 | NAP consistency | ✅ PASS |
| 11 | BreadcrumbList | ✅ PASS |
| **Content Quality & Uniqueness** | | |
| 12 | 5+ process steps | ✅ PASS |
| 13 | 5+ common problems | ✅ PASS |
| 14 | Sandy-specific content | ✅ PASS |
| 15 | FAQ 4+ questions | ✅ PASS — 5 FAQs |
| **UX & Conversion** | | |
| 16 | Sticky call bar | ✅ PASS |
| 17 | Multiple CTAs | ✅ PASS |
| 18 | Internal links | ✅ PASS — /locations/sandy, /pages/storm-damage-restoration, /locations/sandy/residential-roofing, /locations/sandy/water-fire-flood-restoration |
| 19 | No duplicate links | ✅ PASS |
| **Schema / Structured Data** | | |
| 20 | Service + FAQPage @graph | ✅ PASS |
| 21 | Provider @type matches service | ✅ PASS — RoofingContractor (acceptable, storm damage is roofing-related) |
| 22 | areaServed | ✅ PASS |

**Result: ✅ ALL PASS — 22/22**

**Top 5 Priorities:** None critical — clean page. Minor improvements:
1. Consider unique hero image showing storm damage work
2. Add emergency response time language to schema description
3. Consider adding insurance claim process FAQ
4. Strengthen canyon-specific weather pattern content
5. Add seasonal storm calendar for Sandy area

---

## Page 4: Water & Fire Damage Restoration (`/locations/sandy/water-fire-flood-restoration.html`)

| # | Check | Status |
|---|-------|--------|
| **Basic On-Page SEO** | | |
| 1 | Title tag | ✅ PASS |
| 2 | Meta description | ✅ PASS |
| 3 | Single H1 | ✅ PASS |
| 4 | Heading hierarchy | ✅ PASS |
| 5 | Canonical URL | ✅ PASS |
| 6 | OG + Twitter meta | ✅ PASS |
| **Local SEO / Entity Signals** | | |
| 7 | geo meta tags | ✅ PASS |
| 8 | ZIP codes | ✅ PASS |
| 9 | Sandy-specific references | ✅ PASS — Canyon drainages, Dimple Dell flooding, IICRC |
| 10 | NAP consistency | ✅ PASS |
| 11 | BreadcrumbList | ✅ PASS |
| **Content Quality & Uniqueness** | | |
| 12 | 5+ process steps | ✅ PASS |
| 13 | 5+ common problems | ✅ PASS |
| 14 | Sandy-specific content | ✅ PASS |
| 15 | FAQ 4+ questions | ✅ PASS — 4 FAQs |
| **UX & Conversion** | | |
| 16 | Sticky call bar | ✅ PASS |
| 17 | Multiple CTAs | ✅ PASS |
| 18 | Internal links to hub + siblings | ⚠️ PARTIAL — Links to siblings but missing global /pages/water-fire-flood-restoration |
| 19 | No duplicate links | ✅ PASS |
| **Schema / Structured Data** | | |
| 20 | Service + FAQPage @graph | ✅ PASS |
| 21 | Provider @type matches service | ❌ FAIL — Line 42: "RoofingContractor" should be "HomeAndConstructionBusiness" |
| 22 | areaServed | ✅ PASS |

**Result: 20/22 — 1 FAIL, 1 PARTIAL**

**Top 5 Priorities:**
1. **🔴 Fix schema @type line 42** — Change `"RoofingContractor"` → `"HomeAndConstructionBusiness"`
2. **🟡 Add global service link** — Add link to `/pages/water-fire-flood-restoration` (page needs to be created first)
3. Consider adding a 5th FAQ for parity with roofing pages
4. Consider unique hero image showing restoration work
5. Add 24/7 emergency availability to schema additionalType or description

---

## Page 5: Solar Installation (`/locations/sandy/solar-installation.html`)

| # | Check | Status |
|---|-------|--------|
| **Basic On-Page SEO** | | |
| 1 | Title tag | ✅ PASS |
| 2 | Meta description | ✅ PASS |
| 3 | Single H1 | ✅ PASS |
| 4 | Heading hierarchy | ✅ PASS |
| 5 | Canonical URL | ✅ PASS |
| 6 | OG + Twitter meta | ✅ PASS |
| **Local SEO / Entity Signals** | | |
| 7 | geo meta tags | ✅ PASS |
| 8 | ZIP codes | ✅ PASS |
| 9 | Sandy-specific references | ✅ PASS — 225+ sunny days, White City, Pepperwood, Rocky Mountain Power |
| 10 | NAP consistency | ✅ PASS |
| 11 | BreadcrumbList | ✅ PASS |
| **Content Quality & Uniqueness** | | |
| 12 | 5+ process steps | ✅ PASS |
| 13 | 5+ common problems | ✅ PASS |
| 14 | Sandy-specific content | ✅ PASS |
| 15 | FAQ 4+ questions | ✅ PASS — 4 FAQs |
| **UX & Conversion** | | |
| 16 | Sticky call bar | ✅ PASS |
| 17 | Multiple CTAs | ✅ PASS |
| 18 | Internal links to hub + siblings | ⚠️ PARTIAL — Missing global /pages/solar-installation link |
| 19 | No duplicate internal links | ❌ FAIL — Lines 316+318: "Sandy Service Area" and "All Sandy Services" both → /locations/sandy |
| **Schema / Structured Data** | | |
| 20 | Service + FAQPage @graph | ✅ PASS |
| 21 | Provider @type matches service | ❌ FAIL — Line 42: "RoofingContractor" should be "Electrician" or "HomeAndConstructionBusiness" |
| 22 | areaServed | ✅ PASS |

**Result: 19/22 — 2 FAIL, 1 PARTIAL**

**Top 5 Priorities:**
1. **🔴 Fix schema @type line 42** — Change `"RoofingContractor"` → `"HomeAndConstructionBusiness"`
2. **🔴 Fix duplicate link lines 316+318** — Change "All Sandy Services" link to a sibling service page (e.g., `/locations/sandy/residential-roofing`)
3. **🟡 Add global service link** — Add link to `/pages/solar-installation` (page needs creation)
4. Consider unique hero image showing solar panel installation
5. Add Rocky Mountain Power net metering details to FAQ

---

## Page 6: General Contracting (`/locations/sandy/general-contracting.html`)

| # | Check | Status |
|---|-------|--------|
| **Basic On-Page SEO** | | |
| 1 | Title tag | ✅ PASS |
| 2 | Meta description | ✅ PASS |
| 3 | Single H1 | ✅ PASS |
| 4 | Heading hierarchy | ✅ PASS |
| 5 | Canonical URL | ✅ PASS |
| 6 | OG + Twitter meta | ✅ PASS |
| **Local SEO / Entity Signals** | | |
| 7 | geo meta tags | ✅ PASS |
| 8 | ZIP codes | ✅ PASS |
| 9 | Sandy-specific references | ✅ PASS — Alta Canyon 1990s kitchens, Dimple Dell, 11400 South subdivisions |
| 10 | NAP consistency | ✅ PASS |
| 11 | BreadcrumbList | ✅ PASS |
| **Content Quality & Uniqueness** | | |
| 12 | 5+ process steps | ✅ PASS |
| 13 | 5+ common problems | ✅ PASS |
| 14 | Sandy-specific content | ✅ PASS |
| 15 | FAQ 4+ questions | ✅ PASS — 5 FAQs |
| **UX & Conversion** | | |
| 16 | Sticky call bar | ✅ PASS |
| 17 | Multiple CTAs | ✅ PASS |
| 18 | Internal links to hub + siblings | ⚠️ PARTIAL — Missing global /pages/general-contracting link |
| 19 | No duplicate internal links | ❌ FAIL — Lines 329+332: "Sandy Service Area" and "All Sandy Services" both → /locations/sandy |
| **Schema / Structured Data** | | |
| 20 | Service + FAQPage @graph | ✅ PASS |
| 21 | Provider @type matches service | ❌ FAIL — Line 42: "RoofingContractor" should be "GeneralContractor" |
| 22 | areaServed | ✅ PASS |

**Result: 19/22 — 2 FAIL, 1 PARTIAL**

**Top 5 Priorities:**
1. **🔴 Fix schema @type line 42** — Change `"RoofingContractor"` → `"GeneralContractor"`
2. **🔴 Fix duplicate link lines 329+332** — Change "All Sandy Services" link to a sibling service page (e.g., `/locations/sandy/water-fire-flood-restoration`)
3. **🟡 Add global service link** — Add link to `/pages/general-contracting` (page needs creation)
4. Consider unique hero image showing remodeling/construction work
5. Add Utah contractor license number to schema if available

---

## Consolidated Fix List (Implementation Order)

| # | Severity | File | Fix |
|---|----------|------|-----|
| 1 | 🔴 Critical | water-fire-flood-restoration.html | Line 42: Change `"@type": "RoofingContractor"` → `"HomeAndConstructionBusiness"` |
| 2 | 🔴 Critical | solar-installation.html | Line 42: Change `"@type": "RoofingContractor"` → `"HomeAndConstructionBusiness"` |
| 3 | 🔴 Critical | general-contracting.html | Line 42: Change `"@type": "RoofingContractor"` → `"GeneralContractor"` |
| 4 | 🔴 High | solar-installation.html | Lines 316+318: Remove duplicate `/locations/sandy` link, replace with sibling page |
| 5 | 🔴 High | general-contracting.html | Lines 329+332: Remove duplicate `/locations/sandy` link, replace with sibling page |
| 6 | 🟡 Medium | commercial-roofing.html | Line 228: Change "Homeowners" → "Business Owners" |
| 7 | 🟡 Medium | water-fire-flood-restoration.html | Add global `/pages/water-fire-flood-restoration` link to internal links section |
| 8 | 🟡 Medium | solar-installation.html | Add global `/pages/solar-installation` link to internal links section |
| 9 | 🟡 Medium | general-contracting.html | Add global `/pages/general-contracting` link to internal links section |

**Note on items 7-9:** The global service pages (`/pages/water-fire-flood-restoration`, `/pages/solar-installation`, `/pages/general-contracting`) do not yet exist. These links should be added now as forward-references and the global pages created in a future session.

---

*Report compiled by Senior SEO QA Lead audit process — Frame Restoration Utah*
