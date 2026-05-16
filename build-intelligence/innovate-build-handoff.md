# Innovate Build Handoff

Generated: 2026-05-15

Purpose: give every current, legacy, and greenfield build the same instruction for using the upgraded `innovate-research` skill, the build intelligence loop, and the auto-enhance design lane.

This handoff is meant to be pasted into Claude Code, Codex, or a build agent at the start of a build/improvement session.

## Copy/Paste Handoff

```text
Use $innovate-research in Operating Loop Mode and apply the local contractor growth rules for this build.

Build:
- Name: <build/client name>
- Mode: <current | legacy | greenfield>
- Trade: <roofing/restoration/HVAC/plumbing/etc.>
- Primary cities: <cities>
- Primary services/products: <services>
- Current goal: <what we are trying to improve now>

Read first:
1. AGENTS.md
2. build-intelligence/README.md
3. build-intelligence/build-intelligence-loop.md
4. build-intelligence/implementation-queue.md
5. build-intelligence/contractor-growth-category-knowledge-map.md
6. build-intelligence/build_intelligence.json

Do not redo the research unless a claim is current/time-sensitive or the requested work requires fresh sources.

Use this loop:
research -> categorize -> investigate -> audit -> fix -> re-audit -> implement -> measure

Your job:
1. Identify the highest-value improvement for this build.
2. If there are multiple possible improvements, use Recommendation Pipeline Mode:
   source -> hydrate -> filter -> score -> select -> side effect -> feedback.
3. If the session is broad, high-stakes, competitive, or system-building, use World-Class Ranking Mode:
   candidate registry -> evidence feature store -> bias/diversity gates -> semantic recall -> eval harness -> feedback ledger.
4. Map the selected improvement to one loop stage and one concrete artifact.
5. If customer input is missing, create/update a customer request row instead of inventing facts.
6. If design quality is part of the gap, run the Auto-Enhance Design Lane.
7. Make the smallest bounded change that improves the build.
8. Run the relevant checks.
9. Report what changed, what passed, what is still blocked, and what should be reused in future builds.

Public-side-effect rules:
- Do not publish, send outreach, edit GBP, change DNS, run ads, request reviews, add tracking scripts, or use public claims/photos/reviews/credentials without approval.
- Do not invent service areas, licenses, warranties, emergency availability, years in business, financing, or proof.
- Trend research never overrides approved client facts.

Done means:
- Artifact changed or a request row was created.
- Validation proof exists.
- Remaining risk is named.
- A reusable lesson is added to the adapter, skill, template, QA gate, or backlog when it should affect future builds.
```

## Recommendation Pipeline Mode

Use this when a build has many possible improvements and needs a defensible priority order.

```text
source -> hydrate -> filter -> score -> select -> side effect -> feedback
```

This pattern is adapted from recommendation-system architecture, including X's open `x-algorithm` candidate pipeline. For our builds, candidates are not posts; they are possible improvements.

Use it this way:

- `Source`: collect possible improvements from research, build-intelligence feed, audits, customer blockers, competitor gaps, analytics, QA, or owner requests.
- `Hydrate`: add source, date, confidence, category, mode fit, artifact target, approval gate, risk, and acceptance check.
- `Filter`: remove unsupported, stale, risky, duplicated, low-fit, or no-artifact ideas.
- `Score`: rank by business value, confidence, speed gain, reuse, lead value, authority value, design value, implementation cost, compliance risk, hype risk, customer blocker risk, and maintenance cost.
- `Select`: pick the P0 action for this build mode.
- `Side effect`: patch a file, update a doc/template/skill/MCP resource, create a customer request row, or add a QA gate.
- `Feedback`: measure speed, rework, visibility, lead quality, customer wait time, or design/conversion quality.

Decision labels:

- `Ship`: implement now.
- `Monitor`: keep watching or wait for approval/evidence.
- `Skip`: low fit, unsafe, unsupported, or too expensive.
- `Request input`: blocked by missing customer fact, asset, access, or approval.

## World-Class Ranking Mode

Use this when the build goal is broad, competitive, or meant to improve the whole factory. This mode brings in the best process patterns from X/xAI candidate pipelines, Microsoft Recommenders, TensorFlow Recommenders/Ranking, Metarank, Feast, NVIDIA Merlin, Faiss, Vespa, RecBole, Gorse, DSPy, and OpenAI Evals.

Required records:

- `Candidate registry`: every idea gets source URL, source date, observed date, tier, confidence, category, mode fit, artifact target, approval gate, decision, acceptance check, and measurement path.
- `Evidence feature store`: source/date/confidence are preserved at decision time; stale evidence is marked, not overwritten.
- `Score vector`: score business value, confidence, speed gain, reuse, lead value, authority value, design value, learning value, implementation cost, compliance risk, hype risk, customer blocker risk, maintenance cost, source bias risk, and recency bias risk.
- `Bias and diversity gates`: check vendor bias, popularity bias, recency bias, repeated-source bias, category collapse, survivorship bias, and feedback bias before selecting the final actions.
- `Semantic recall`: search existing docs, handoffs, templates, skills, validators, MCP resources, customer request models, and audits before creating a new artifact.
- `Eval harness`: define pass/fail cases for broad strategy, implementation-loop, and compliance-sensitive outputs.
- `Feedback ledger`: after implementation, record validation result, cycle-time delta, quality delta, visibility/lead delta, rework delta, customer-wait delta, and whether to keep, revise, revert, or promote.

Selection rules:

- Top actions should usually cover at least three categories and no more than two actions from one source family.
- High-bias candidates become `Monitor` or `Skip` unless corroborated.
- New artifacts require a semantic recall result.
- Recurring wins must be promoted into a template, skill, validator, MCP resource, AGENTS.md rule, or dashboard metric.

## Build Mode Rules

### Current Builds

Use the skill to improve active work without reopening the whole product.

Default actions:

- Pull the build intelligence feed or local adapter.
- Choose one P0 loop action.
- Patch the active artifact.
- Re-audit with tests/browser checks.
- Promote reusable lessons into MCP resources, docs, templates, or AGENTS.md.

### Legacy Builds

Use the skill to audit before editing.

Default actions:

- Install/read `build-intelligence/`.
- Score the build against current Local Lead Operating System standards.
- Create a ranked upgrade queue.
- Touch one high-impact artifact at a time.
- Keep all public updates owner-approved.

### Greenfield Builds

Use the skill before sitemap, copy, design, or starter generation.

Default actions:

- Install/read `build-intelligence/`.
- Build the customer request pack first.
- Lock the build packet.
- Generate sitemap/copy/design/schema/tracking/QA from the same source of truth.
- Run auto-enhance design before launch QA.

## Auto-Enhance Design Lane

Use this lane when the build needs better visual quality, conversion clarity, trust proof, mobile usability, or professional polish.

```text
baseline screenshot -> design/category audit -> enhancement plan
  -> bounded visual patch -> browser QA -> score -> reusable pattern
```

Inputs:

- Current screenshots or rendered pages.
- Brand colors/logo/assets.
- Primary service and city intent.
- Proof assets and approval status.
- CTA and lead destination.
- Page/component files.
- Current build constraints.

Design categories:

- First impression trust.
- Mobile CTA clarity.
- Service/category scannability.
- Local proof and credibility.
- Visual hierarchy and spacing.
- Text fit and no overlap.
- Accessibility and readable contrast.
- Performance-safe media.
- Reusable component quality.

Auto-enhance rules:

- Improve the actual product surface, not a marketing explanation page.
- Use real approved proof/photos when available; otherwise create placeholders that are clearly not public proof.
- Do not add fake awards, badges, reviews, certifications, warranties, financing, or service areas.
- Keep UI dense and useful for operational dashboards; keep contractor public pages trust-forward and conversion-focused.
- Do not let design changes break SEO/AEO content, schema consistency, forms, tracking, or launch QA.

Acceptance checks:

- Desktop and mobile render without overlap.
- CTA remains obvious.
- Long text fits.
- Public claims are approved or marked draft.
- No layout shift from hover/dynamic content.
- Forms/calls still work.
- Relevant tests/build/browser QA pass.

Reusable output:

- Component brief update.
- Design token or pattern update.
- Screenshot before/after note.
- QA gate update.
- Starter/template improvement.

## Required Output From The Agent

Use this shape at the end of each build session:

```markdown
## Loop Stage
<research/categorize/investigate/audit/fix/re-audit/implement/measure>

## Build Improvement
<what changed and why>

## Artifact
<file, route, customer request row, skill, template, MCP resource, QA gate, or dashboard>

## Auto-Enhance Design
<not needed | completed | blocked>

## World-Class Ranking
<not needed | completed | blocked; include candidate registry, bias/diversity result, semantic recall result, and feedback plan when completed>

## Validation
<commands/checks/screenshots/browser QA>

## Customer Blockers
<missing input, owner approval, photos, access, proof, or none>

## Reuse
<what should be promoted to future builds>
```
