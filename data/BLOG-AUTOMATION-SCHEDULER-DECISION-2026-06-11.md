# Blog Automation Scheduler Decision - 2026-06-11

## Decision

Use the local macOS LaunchAgent for Frame Utah blog draft generation, but run it
from a dedicated clean worktree:

- Active job: `~/Library/LaunchAgents/com.ryan.frame-roofing-blog.plist`
- Worktree: `~/projects/frame-restoration-utah-blogbot`
- Source branch: `automation/frame-utah-blogbot`, tracking `origin/main`
- Script: `scripts/blog-cron.sh`
- Cadence: Monday and Thursday at 9:31am local time
- Output: draft JSON manifest in `data/blog-pending/`; no commit, push, deploy,
  GBP publish, or live blog publish

This preserves the existing low-cost Ollama path and keeps unattended edits away
from the active foreground checkout.

## Why Not GitHub Actions First

GitHub Actions is reliable enough for scheduled CI, but it is not the best first
runner for the current blog generator because:

- The generator depends on local Ollama models (`nemotron-3-nano:30b`), which are
  already installed on this Mac and not present on GitHub-hosted runners.
- GitHub scheduled workflows run on the default branch, can be delayed during
  high-load periods, and can be dropped under sufficient load. Official docs:
  https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- The repo's workflow default permission is currently read-only. A cloud PR
  workflow would need explicit `contents: write` and `pull-requests: write`
  permissions plus secrets and review controls.
- Drafted roofing copy still needs human review for compliance, claims, media,
  and local proof. The automation should queue drafts, not publish.

## Where Codex/Claude Fit

Codex Automations are a good future option for review loops or source monitoring,
especially because official Codex docs recommend worktrees for background
automations that can modify files:

- https://developers.openai.com/codex/app/automations
- https://developers.openai.com/codex/github-action

Claude Code GitHub Actions are also viable for issue/PR-driven implementation
or review after setup:

- https://code.claude.com/docs/en/github-actions

Use cloud agents later for:

- reviewing generated manifests against `CLAUDE.md`
- opening a draft PR from an already-created manifest
- checking compliance gates and suggesting edits

Do not use cloud agents to auto-publish GBP posts or live blog pages without
owner review.

## Local Validation

Validated on 2026-06-11:

- `plutil -lint ~/Library/LaunchAgents/com.ryan.frame-roofing-blog.plist`
- `bash -n scripts/blog-cron.sh`
- `npm run blog:target -- --json --top 1 --no-weather`
- `curl http://127.0.0.1:11434/api/tags` showed `nemotron-3-nano:30b`
- `launchctl print gui/$(id -u)/com.ryan.frame-roofing-blog` now points at
  `~/projects/frame-restoration-utah-blogbot`

The next scheduled run should create exactly one draft manifest if the blogbot
worktree is clean and Ollama is running.
