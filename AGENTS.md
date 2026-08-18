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
