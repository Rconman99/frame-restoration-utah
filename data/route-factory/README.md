# Frame TX Route Factory

Purpose: speed up route-depth parity work without letting multiple terminals fight over shared files.

This is a lightweight workflow for static HTML production. It does not introduce a CMS and does not generate production pages automatically. Workers create or edit page files in isolated worktrees, then the coordinator integrates shared indexes and sitemap entries in one controlled pass.

## Roles

### Coordinator terminal

Owns shared surfaces:

- `blog/index.html`
- `sitemap.xml`
- top-level navigation and footer changes
- reusable templates or site-wide CSS
- final PR creation, merge readiness, and live verification

The coordinator is the only terminal that should edit shared hub or sitemap files during a batch.

### Worker terminals

Own page-only scopes:

- `blog/<slug>/index.html`
- `locations/<city>.html`
- `projects/<slug>/index.html`
- one narrow service page when assigned

Workers should not edit `blog/index.html`, `sitemap.xml`, `global.css`, nav, or footer unless explicitly assigned.

### Audit terminal

Runs the same acceptance gates before a batch becomes mergeable:

- JSON-LD parses
- local links and images resolve
- no Utah or disputed-photo leakage
- no fake pricing, response-time, or claim-outcome promises
- no forbidden compliance terms — `node scripts/audit-compliance-words.mjs <files>` returns 0 blockers ("public adjuster" + "negotiate" families are banned site-wide; insurance language is topic-conditional — soft-link to `/services/insurance-claims/` instead of repeating jargon)
- `llms.txt` is a generated fact surface, not an AEO ranking tactic. Edit `data/route-factory/claim-registry.json`, then run `node scripts/audit-claim-registry.mjs --write`; CI requires byte-for-byte parity and verifies every registered claim's evidence/mirror contract.
- sitemap entries exist for integrated routes
- blog hub ItemList order matches visible resource-card order when the hub is touched
- `git diff --check`
- rendered desktop/mobile smoke for any new page template or layout variant

## Recommended Batch Sizes

- Blog guides: 3-5 URLs per PR
- City pages: 3-6 URLs per PR after Ryan approves the city list and photo policy
- Project pages: 1-2 URLs per PR only when photo provenance is clean
- Shared infrastructure or docs: 1 PR, no content bundled

## Worktree Pattern

Use a clean worktree for every batch:

```bash
cd ~/projects/frame-restoration-texas-v2
git fetch origin main --prune
git worktree add -b v2/blog-batch-a-2026-05-22 ../frame-tx-v2-blog-batch-a origin/main
```

Worker branches should be named by scope, not by terminal:

```text
v2/blog-batch-a-2026-05-22
v2/city-tier1-batch-a-2026-05-22
v2/projects-batch-a-2026-05-22
```

## Two-Pass Production Flow

### Pass 1: Page-only worker output

Each worker creates only assigned page files. The worker runs:

```bash
node scripts/audit-route-batch.mjs --manifest data/route-factory/batch-manifest.example.json
git diff --check
```

The worker reports:

- file list
- new route list
- image sources used
- JSON-LD types emitted
- known caveats

### Pass 2: Coordinator integration

The coordinator integrates approved page files and then edits shared surfaces once:

- add hub cards
- update ItemList schema
- add sitemap entries
- update hub date/lede if needed

Then the coordinator runs the same audit script against the integrated batch and performs browser smoke tests.

## Guardrails

### Copy

Do:

- keep Texas wording local to DFW and Frame Restoration
- preserve documentation-only insurance framing: Frame documents observed roof conditions and prepares written construction scopes; licensed adjusting work stays with licensed professionals
- say the carrier determines coverage when insurance is mentioned
- describe only what the page can support

Do not:

- promise claim approval or coverage
- promise emergency response time unless Ryan explicitly provides the service-level claim
- use fake dollar pricing
- claim statewide roofer licensing in Texas
- name Lon Smith
- import Utah, Wasatch, Salt Lake, Orem, Provo, or Park City language

### Images

Do:

- use existing verified TX image pools
- use service OG images for generic guide pages
- use project photos only when city and project provenance are clean

Do not:

- use the disputed McKinney / Plano / Wylie project pairs until Matt or Connor confirms provenance
- relabel a photo city or completion state to fit a page
- invent a before/after story from a single image

### Schema

Blog guide pages should normally include:

- `BreadcrumbList`
- `BlogPosting`
- `FAQPage`

Project pages should normally include:

- `BreadcrumbList`
- `Article`

Location pages should follow the existing location-page schema contract before any batch expansion.

## PR Rules

- Keep page-only worker PRs draft until coordinator integration is complete.
- Prefer one integrated PR per batch.
- No auto-merge.
- Use verdicts in handoffs: `APPROVE`, `REVISE`, `HOLD`, `STOP`.
- If a batch produces conflicting facts, stop and ask Ryan before trying to write around it.
