# Market-Intel Kit (bundled into Frame Roofing Utah)

Vendored from `~/projects/RCBuild-Kit/core/market-intel/` (RCBuild-Kit v0.7.0). Bundled here so the runner works without npm-link, mirroring the existing `scripts/checklist-kit/` pattern.

## What this kit does

Turns a list of cities + a monthly budget into per-city, per-channel paid-marketing recommendations using a 6-factor scoring model:

```
Inputs                            Outputs
──────                            ───────
brand                             allocation: {
vertical (local-service)            byCity: [{
state                                 city, monthlyAllocation, perChannel: [...]
monthlyBudget ($15K growth tier)    }],
cities (45 Utah, 4 tiers)           totals: { ... }
keywords (5 templated)            }
naicsCode (238160)                report: markdown summary
stormCities (active list)         scoredCities, factors
sources flags
```

## Files

| File | Purpose |
|---|---|
| `market-intel.mjs` | Orchestrator — composes sources + scoring + allocator + reporter |
| `scoring.mjs` | Pure scoring (6 factors, channel sensitivity matrix, budget tier classification) |
| `budget-allocator.mjs` | Two-pass allocation: city-share by top-3 channel weight → greedy-fill within each city |
| `reporter.mjs` | Markdown report rendering |
| `channels/local-service.json` | Channel definitions (LSA / Search / Meta / TikTok / YouTube / SEO / Direct mail) with 2026 CPL benchmarks + sensitivity matrix + budget tiers + anti-patterns |
| `sources/census.mjs` | Free Census API client — ACS demographics + ZBP NAICS competitor density |
| `sources/dataforseo.mjs` | BYOK paid — per-city Google SERP, KW volume, paid-density |
| `sources/serpapi.mjs` | BYOK paid — Google + Google Maps |

## How it's wired in this project

The runner at `scripts/market-intel.mjs` (one level up) imports `./market-intel-kit/market-intel.mjs` directly. No npm install needed beyond the existing `playwright` dep.

## Running

From project root:

```bash
# Offline (Census-skipped if no key) — useful smoke test
npm run market-intel

# Live (Census free + DataForSEO paid)
CENSUS_API_KEY=... DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... \
  npm run market-intel:dataforseo

# Override config inline
node scripts/market-intel.mjs --budget=20000 --storm=park-city,heber-city
```

Outputs:
- `data/market-intel-report.md` — markdown summary
- `data/market-intel-allocation.json` — full structured output

## Source flags

| Flag | Purpose | Cost |
|---|---|---|
| `--use-dataforseo` | Real per-city SERP + KW volume + paid-density | ~$0.30 for 45 cities |
| `--use-serpapi` | SerpAPI fallback (rarely needed if DataForSEO is on) | ~$0.005/query |
| `--no-census` | Skip Census (forces neutral demoFit + paidDensity) | $0 |

If a source's env var isn't set, that source is silently skipped. Factors fall through to neutral 0.5.

## Scoring + allocation logic

**Scoring (per city × channel):**
```
score = 50 + 50 × Σ(factor × sensitivity × weight)
```
Where:
- `factor` ∈ [0,1] from sources (or 0.5 if missing)
- `sensitivity` ∈ [-1.5, 1.5] from `channels/local-service.json` (positive amplifies, negative dampens)
- `weight` from `factorWeights` (sum to 1.0)
- Channels below their `minMonthlyBudget` floor get score = 0 (gated)

**Allocation (two-pass):**
1. **City-share:** each city's "weight" = sum of its top-3 channel scores. City gets `monthlyBudget × (cityWeight / totalWeight)`.
2. **Within each city:** greedy-fill — walk top-scored channels in order, accept if its floor fits in remaining budget, then distribute remainder by score share. Cap at top 4 channels per city.

**Storm override:** if `stormCities` includes the city, pulls 30% from `seoContent` and boosts `googleLSA` (60%) + `googleSearch` (40%).

## Updating channel definitions

`channels/local-service.json` is the source of truth for:
- Channel list (id, name, minMonthlyBudget, estimatedCpl)
- Per-channel sensitivity matrix
- Factor weights (must sum to 1.0)
- Budget tiers (starter / growth / scale)
- Anti-patterns (Texas D2D enforcement copied from RCBuild-Kit; harmless on Utah)

To recalibrate sensitivities after Wave 2 data:
1. Pull 90-day attribution from PostHog × Supabase
2. For each channel, regress observed CPL against factor signals
3. Update sensitivities in `channels/local-service.json`
4. Re-run `npm run market-intel:dataforseo`

## When to re-vendor from RCBuild-Kit

Frame Utah and Frame TX both bundle this kit. If RCBuild-Kit ships a meaningful market-intel update (v0.8+), re-copy:

```bash
# From RCBuild-Kit project
cp ~/projects/RCBuild-Kit/core/market-intel/{scoring,budget-allocator,market-intel,reporter}.mjs \
   ~/projects/frame-restoration-utah/scripts/market-intel-kit/
cp ~/projects/RCBuild-Kit/core/market-intel/sources/*.mjs \
   ~/projects/frame-restoration-utah/scripts/market-intel-kit/sources/
cp ~/projects/RCBuild-Kit/core/market-intel/channels/*.json \
   ~/projects/frame-restoration-utah/scripts/market-intel-kit/channels/
```

Then smoke-test offline: `npm run market-intel`.

## Operational separation note

Frame TX has its own bundled copy at `~/projects/frame-restoration-texas/scripts/market-intel-kit/`. The two projects must stay independent — never share `data/market-intel-*.json` outputs across projects.

## See also

- Project marketing build: `data/MARKETING-BUILD-CONTEXT.md`
- Audit (full $15K analysis): `data/market-intel-audit-2026-04-27.md`
- Wave 2 readiness (env vars + sign-ups): `~/projects/frame-roofing-wave-2-readiness-2026-04-27.md`
