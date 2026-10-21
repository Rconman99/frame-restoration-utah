# Build Instructions

<!-- BUILD_INTELLIGENCE_ADAPTER_START -->

## Build Intelligence Adapter

This build uses `build-intelligence/` to consume the shared Codex/AI-builder intelligence layer.

Before strategy, page, component, QA, launch, or growth work:

- Read `build-intelligence/README.md`.
- Check `build-intelligence/implementation-queue.md`.
- Use `build-intelligence/build-intelligence-loop.md` to decide whether work belongs in research, categorize, investigate, audit, fix, re-audit, implement, or measure.
- Use `build-intelligence/innovate-build-handoff.md` when another agent or build session needs the upgraded `$innovate-research` loop.
- Use Recommendation Pipeline Mode and World-Class Ranking Mode before broad or competitive build decisions.
- Use the digest as build-system input, not as copyable creator content.
- Keep client truth, approval gates, and launch safety above trend research.

Build: Frame Roofing Utah

Mode: legacy

<!-- BUILD_INTELLIGENCE_ADAPTER_END -->

## Cross-lane coordination — read before you start

Multiple AI lanes work this business: **Claude Code, Codex, Cowork, agy**. They cannot see each
other. Every lane pushes to GitHub as the same user, so **git authorship cannot tell lanes apart** —
the branch prefix is the only lane signal that survives into a PR.

**Shared protocol lives in the hub, not here:**

- [`agentic-context-hub/ACTIVE-LANES.md`](https://github.com/Rconman99/agentic-context-hub/blob/main/ACTIVE-LANES.md) — claim table + protocol. **Read it and claim your scope before starting.**
- [`agentic-context-hub/AGENTS.md`](https://github.com/Rconman99/agentic-context-hub/blob/main/AGENTS.md) — how to write context other lanes can act on.

### The four rules that matter here

1. **Claim before you work.** Add a row to `ACTIVE-LANES.md`. If your scope overlaps a live claim,
   don't start — pick different work, or use an isolated git worktree and say so.
2. **Prefix your branch with your lane:** `codex/`, `claude/`, `cowork/`, `agy/`. An unprefixed
   branch is unattributable, which means every lane has to treat it as possibly its own and nobody
   reviews it.
3. **Never touch another lane's open PR.** Not a rebase, not a quick fix, not a merge. Say so in the
   hub and let a human decide. Rewriting a reviewed PR destroys the review history the human
   approved against.
4. **Sync the hub before your session ends.** Update `projects/frame-{market}/CONTEXT.json`
   (`updated_at`, `summary`, `facts`/`next_actions`/`blockers`), add a dated snapshot to the relevant
   `.md`, run `bash ~/scripts/frame-context-sync.sh`, commit as `context(project): …` with
   **explicitly staged paths**, and release your claim.

**Why rule 4 is not optional.** The Command Center dashboard is file-based — files on disk *are* live
state. A lane that works for hours without syncing has done invisible work, and every other lane then
plans against a world that no longer exists. A launchd job keeps *staleness* visible but cannot write
content; only sessions can.

### Author ≠ verifier

The lane that wrote a change is never the sole judge that it is correct. A different lane reviews
before a human approves. To see what is waiting on you:

```bash
~/scripts/lane-review-queue.sh <your-lane>
```

<!-- CODEX_ENV_CONTEXT_START (added 2026-10-11) -->

## Codex cloud environment: full-system context (read first)

Every new Codex or agent session on this repo starts here. You are one lane in a multi-agent system that Ryan Conwell runs.

**1. Read the hub before touching code.** It lives at private repo `Rconman99/agentic-context-hub` on `main`. Read these, in this order:
- `projects/_shared-systems/SHARED-DECISIONS.md`: cross-agent decisions log and open questions. It is current truth and outranks chat memory. Receipts (merged PRs, live checks) outrank both.
- `ACTIVE-LANES.md`: claim your scope there before you start.
- `projects/frame-utah/` (`PROJECT.md`, `CONTEXT.json`, `DECISIONS.md`, `HANDOFF.md`, `RISKS.md`).
- `projects/_shared-systems/BOT-ROSTER-FRAME-RC-2026-09-15.md` and `AGENTS.md`.
If you can't reach the hub, say so in your PR and keep to read-only work.

**2. Bots and their roles.** Ryan is the human at the core. Bots propose, Ryan approves, then they act.
- **Chief of Staff:** Ryan's orchestrator. It reviews bot PRs and merges only once Ryan has approved.
- **Grok Bot:** the agent platform the bots run on. It hosts Chief of Staff and runs the scheduled routines and loops.
- **AEO Growth:** SEO/AEO, map-pack presence, and owner message drafts. It never sends.
- **Command Engineer:** Frame OS, Command Center hygiene, CI and launchd job fixes, enhance loops.
- **Owner Support:** docs, email drafts, phone/NAP, franchisee packets.
- **Model Monitor:** model and CLI freshness and evals. Discovery-only, $0 by default.
- **ChatGPT "dot":** Ryan's ChatGPT agent. It shares `SHARED-DECISIONS.md` with Chief of Staff and must log every send and decision there.
- **Lanes:** Claude Code (`claude/`), Codex (`codex/`), Cowork (`cowork/`), agy (`agy/`), a human by hand (`human/`).

**3. Loops and routines.** The scheduled routines are the morning owner list, context ingest, DataForSEO watch, watchdog, and CI-failure alerts. They are joined by GitHub Actions in this repo (SEO loop, rank tracker, AEO citation monitor, blog autopost, compliance and lane guards) and Mac launchd jobs. The rule for all of them is research, then audit, then fix in a draft PR, then human review, then re-audit and measure (see `build-intelligence/`).

**4. Hard market isolation.** Frame Utah, Texas, Idaho, and Colorado never share secrets, accounts, NAP, copy, or production resources (Supabase, Twilio, GBP, Vercel). The same goes for TCE, Katie CRM, and RC Digital. Only lessons and patterns cross between Frame and RC Digital, and only sanitized.

**5. What you may and may not do.**
- You may open **draft PRs only**, from a branch prefixed **`codex/`**. The Lane guard CI fails any branch without a `claude/`, `codex/`, `cowork/`, `agy/`, or `human/` prefix.
- **Never merge, deploy, or touch secrets.** `main` auto-deploys production (framerestorationutah.com). Never read, print, commit, or invent secret values, and refer to env vars by name only.
- Never send texts or emails to owners or customers, never change GBP or Twilio, and never spend money. Ryan approves the exact body or change first.
- Never touch another lane's open PR.
- Use only facts already in the repo or hub. Never invent NAP details, licenses, reviews, or claims.

**6. Utah owner:** Landon Yokers (owner/operator). Ryan is the manager. Ryan never appears on customer surfaces.

**7. Log every decision.** When Ryan decides something or you ship a PR, add an entry to the top of the "Decisions log" in hub `projects/_shared-systems/SHARED-DECISIONS.md`, as a draft PR to the hub, using the format `date (PT) | lane | decision | decided by | status | link`. Leave out secrets and customer PII. Then sync `projects/frame-utah/CONTEXT.json` and release your `ACTIVE-LANES.md` claim.

<!-- CODEX_ENV_CONTEXT_END -->
