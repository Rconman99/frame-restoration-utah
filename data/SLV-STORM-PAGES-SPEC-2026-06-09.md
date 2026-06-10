# Workstream C — SLV Storm-Damage Demand Capture (2026-06-09)

> Part of the Utah dominance plan (A = consensus orchestrator, B = review velocity — both live
> in `~/projects/frame-utah-aeo/ai-visibility/`). C captures transactional storm intent in the
> 6 SLV priority cities. **This doc is the branch-time integration contract.**

## Design decision — why storm-only, not service×city ×2
The original C scope was 12 pages (6 cities × replacement + storm). Reading the live templates
killed half of it: every parent location page's H1 already IS "Premium **Reroofing** in {City}"
with a replacement-cost answer box, and replacement blog spokes exist. A third URL on the same
intent = cannibalization + doorway-page risk (the exact thing city-quality + concentration rules
exist to prevent). **Replacement intent stays concentrated on the parents.** Storm-damage
transactional intent ("storm damage roof repair {city}", "emergency roof repair {city}") is
genuinely unowned — parents give it one mini-card; blog spokes are informational. So:

**6 new pages:** `locations/<city>/storm-damage.html` → `/locations/<city>/storm-damage`
for: cottonwood-heights · holladay · sandy · draper · millcreek · murray

## Page contract (all six conform)
- Geo meta + coords **copied from the parent page verbatim** (never invented — Fruit-Heights rule)
- JSON-LD: `Service` (serviceType "Storm Damage Roof Repair", provider = RoofingContractor w/
  DOPL credential + hasMap cid 8458659884566588108 + the 5 canonical sameAs) + `FAQPage` (4
  city-specific Q&As, schema ↔ visible accordion synced) + `BreadcrumbList` (4 levels)
- **NO AggregateRating, NO Review** (review-integrity gate)
- Phones: schema/`tel:` = `+14352928802`, display = 435-292-8802. Internal 302-4422 NEVER.
- Compliance: cornerstone framing only ("we document the damage… the claim stays between you and
  your insurer; we document, we don't adjust"). ZERO advocacy vocabulary (maximize payout / claim
  navigation / advocates / handles the claim / work directly with your adjuster / paid in full).
  **"insurance claim" phrase ≤1 per page** (site-wide saturation already over advisory cap) —
  resources block deliberately swaps the Insurance-Claims-Guide link for the storm-chaser pillar.
- ≥520 unique words each, city-specific mechanics (no {city}-swap), hero image reuses the
  parent's authentic asset with storm-context alt text.
- Tracking: standard PostHog + track-attribution + track-clicks?v=2 (the city regex
  `\/locations\/([^\/\.]+)/` already captures the city from subdirectory paths).

## Branch-time integration patches (tracked files — apply on the feature branch, NOT before)
1. **6 parent pages** — point the existing "Storm Damage & Insurance" `service-mini-card` h3 link
   from `/pages/storm-damage` → `/locations/<city>/storm-damage` (keeps equity in-city; the card
   copy already fits).
2. **`pages/storm-damage.html`** — in the "City-Specific Storm & Hail Damage Guides" section, add
   the 6 new transactional pages (label them "{City} storm damage roof repair") alongside the
   existing blog-guide links.
3. **`sitemap.xml`** — add 6 URLs, lastmod 2026-06-10, priority 0.7:
   `/locations/cottonwood-heights/storm-damage` · `/locations/holladay/storm-damage` ·
   `/locations/sandy/storm-damage` · `/locations/draper/storm-damage` ·
   `/locations/millcreek/storm-damage` · `/locations/murray/storm-damage`
4. **Blog storm spokes** (holladay, sandy, draper, murray ones referenced) — optional follow-up:
   add a "need repairs now?" CTA link down to the matching transactional page.

## Gate checklist before PR
`audit-jsonld` (valid) · `audit-compliance-words --strict` (0 blockers; local exit-1 on
saturation is advisory) · `audit-city-quality` (if it globs subdirs — verify ≥500 unique words
regardless) · `audit-links` (all hrefs resolve) · `audit-cta-integrity` (no internal phone, no
dead cid) · doc-isolation (this file is data/*.md — vercelignored, never deploys).

## Verified per-city facts used (sources: parent pages + existing blog spokes in-repo)
| City | Geo (from parent) | Hero asset (parent og:image) | Blog spoke linked |
|---|---|---|---|
| Cottonwood Heights | 40.6197;-111.8105 | cottonwood-heights-mt-olympus-golden-hour-2026 (3-size webp) | hail-season pillar (no city storm spoke) |
| Holladay | 40.668;-111.8247 | holladay-residential-reroof.webp | blog/holladay/storm-damage-roofing-holladay |
| Sandy | 40.565;-111.859 | sandy-storm-damage-reroof-1.webp | blog/sandy/spring-hail-damage-roof |
| Draper | 40.5247;-111.8638 | photos/frame-restoration-20.webp | blog/draper/insurance-claims-storm-damage |
| Millcreek | 40.6866;-111.8755 | millcreek-commercial-reroof.webp | hail-season pillar (no city storm spoke) |
| Murray | 40.6669;-111.888 | photos/frame-restoration-04.webp | blog/murray/storm-damage-roofing-murray-utah |

Replacement-intent Service JSON-LD upgrades on the 6 parents = deferred to C-part-2 (separate PR).
