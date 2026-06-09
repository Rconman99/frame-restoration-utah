# Innovation Audit — What's New in Claude & Codex (week of 2026-06-08)

**Source:** `/innovate` skill (delegated retrieval via `/last30days`, 10-day window) + official changelogs and release announcements.
**Scope:** Applies to **both Frame Restoration Texas and Frame Restoration Utah** — same Claude Code build environment (Opus 4.8 + dynamic workflows), same ported compliance-gate / schema systems.
**Method note:** The social-research engine surfaced mostly narrative (it flagged "entity-miss demotion" on nearly every cluster), so the **NEW** tier below is anchored to primary sources: the [Claude Code changelog](https://code.claude.com/docs/en/changelog) and [Codex changelog](https://developers.openai.com/codex/changelog). Opus 4.8 + dynamic workflows was already logged 2026-05-29, so per the skill's 14-day rule it is a *repeat* (context, not new-this-week); the genuinely-new-this-week items are the **June 1–8 changelog waves**.

---

## TL;DR

This week, **Claude's** real news was in **Claude Code, not the model** — Skills became a hot-reloadable agent runtime (2.1.0+), plus a `fallbackModel` setting and a cross-session privilege-escalation fix, all shipped into a rough four-outages-in-five-days reliability window. **Codex's** real news was a deliberate **pivot away from pure coding**: OpenAI-hosted **Sites**, **six business-role plugins** (62 apps), and **distribution on AWS Bedrock**, aimed at the ~20% of its 5M weekly users who don't code. Opus 4.8 + dynamic workflows is last week's story. **For Frame: the Claude-side updates upgrade our build loop today; the Codex-side updates are a deliberate skip.**

---

## PART 1 — CLAUDE

### Genuinely new this week (June 1–8)

**1. Claude Code 2.1.0 → 2.1.166 — the Skills + Hooks platform wave** (High confidence)
The biggest substance landed in the CLI, not the model. Per [Boris Cherny on Threads](https://www.threads.com/@boris_cherny/post/DTOyRyBD018) ("2.1.0 … 1096 commits") + the changelog:
- **Skills became real infrastructure:** forked context, hot reload, custom-agent support, invoke-with-`/`, and auto-load from `.claude/skills` (no marketplace needed); `claude plugin init <name>` scaffolds one.
- **Hooks in agents/skills frontmatter** directly; `Stop`/`SubagentStop` hooks can return `additionalContext` to keep a turn going.
- **Shift+Enter for newlines with zero setup**, wildcard tool permissions (`Bash(*-h*)`), respond-in-your-language, `/teleport` your session to claude.ai/code, agents no longer halt when you deny a tool.
- *Why new:* turns Skills from "prompt files" into a hot-reloadable, forkable agent runtime. Confidence: **High** · 2026-06-06.

**2. `fallbackModel` — up to 3 fallback models, now in interactive sessions** (High)
New in **2.1.166** (June 6): configure up to three fallbacks tried in order when the primary is overloaded; `--fallback-model` now applies to interactive sessions, plus a one-shot retry on the fallback for non-retryable API errors. It shipped into [a week with four Claude outages in five days](https://www.tiktok.com/@risenworks/video/7649001290487319821) (June 1–5) — the feature is the direct mitigation. Confidence: **High** · 2026-06-06.

**3. Cross-session messaging security hardening** (High)
Also 2.1.166: messages relayed via `SendMessage` from other Claude sessions **no longer carry user authority** — receivers refuse relayed permission requests and auto-mode blocks them. A genuine privilege-escalation fix as multi-agent fan-out goes mainstream. Confidence: **High** · 2026-06-06.

**4. Managed-version + safety guardrails** (Medium)
`requiredMinimumVersion`/`requiredMaximumVersion` managed settings (refuse to start outside an org-allowed range, 2.1.163), and `acceptEdits` now prompts before writing to shell startup files / build-tool configs (`.npmrc`, `.bazelrc`, `.devcontainer/`, 2.1.160). Enterprise-governance maturation. Confidence: **Medium** · 2026-06-03/04.

### Meaningful iterations / context (already seen, still moving)
- **Opus 4.8** ([Anthropic, May 28](https://www.anthropic.com/news/claude-opus-4-8)) — ~4× less likely to let code flaws pass unremarked, user **effort controls**, **fast mode at 2.5× speed and now 3× cheaper**, and **dynamic workflows** in Claude Code for very-large-scale problems ([TechCrunch](https://techcrunch.com/2026/05/28/anthropic-releases-opus-4-8-with-new-dynamic-workflow-tool/)). *Repeat-from: week of 2026-05-29.* This is the model and tool the Frame build loop already runs on.
- **"Claude writes >80% of code merged at Anthropic"** — the recursive-self-improvement essay (June 5) was the week's loudest social story ([667 pts on r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1txisil/)). An essay restating a known trajectory, not a product — ITERATE, not NEW.

### Hype filter (skip / discount)
- **"Mythos is dropping next week"** — Polymarket prices a Mythos *release* at 86% and it [briefly flashed on the API](https://www.youtube.com/watch?v=lkR6mvqQQlk), but the *timing* is speculation; Anthropic's own line is "coming weeks." **Monitor**, don't act.
- **"Anthropic just WARNED everyone Claude is self-improving"** — engagement-farm framing on a sober research essay. Read the essay, skip the framing.

### Munger inversion (Claude)
The week's reliability record is the counter-signal: **four outages in five days** across Sonnet/Opus/Claude Code. Dynamic workflows multiply concurrent API calls — during an overload window they fail *faster* and *cost more*, not less. The honest read: `fallbackModel` shipped *because* the platform needed it. **What makes the new Skills runtime not pay off:** heavy multi-agent fan-out without a fallback configured turns an outage into a stalled, half-billed run.

---

## PART 2 — CODEX

### Genuinely new this week (June 1–4)

**1. Codex Sites — prompt → hosted, deployed web app** (High confidence)
Preview, June 2: the **Sites plugin** creates, saves, deploys and inspects websites, dashboards, internal tools, web apps and games **hosted by OpenAI** — no GitHub, no Vercel. ChatGPT Business gets it by default; Enterprise gates it via RBAC. Cited: [OpenAI Codex/Sites](https://developers.openai.com/codex/sites), [VentureBeat](https://venturebeat.com/orchestration/openais-codex-update-lets-agents-build-interactive-enterprise-workspaces-via-sites-and-role-specific-plugins), [Greg Isenberg/YouTube](https://www.youtube.com/watch?v=tUeSxXHmE9w). Confidence: **High** · 2026-06-02.

**2. Six role-specific business plugins** (High)
Sales, Data Analysis, Creative, Product Design, Stock Research, Investment Banking — aggregating **62 popular business apps** (Snowflake, Figma, Salesforce) and **110 automated skills** out of the box. The clearest signal of Codex's pivot from dev tool → general knowledge-worker agent. Confidence: **High** · 2026-06-03.

**3. Codex + GPT-5.5 / GPT-5.4 on AWS Bedrock** (High)
June 1: OpenAI frontier models and Codex are now usable through **Amazon Bedrock** with AWS-managed auth and billing — the first major OpenAI-on-AWS distribution. [HN: 370 pts](https://openai.com/index/openai-frontier-models-and-codex-are-now-available-on-aws/) + [aboutamazon](https://www.aboutamazon.com/news/aws/bedrock-openai-models). Confidence: **High** · 2026-06-01.

**4. Codex CLI 0.134 → 0.137 + multi-agent v2** (Medium)
Rapid CLI releases (May 26–June 4): **multi-agent v2** keeps runtime choice per thread with cleaner spawned-agent defaults; **code-mode** hosted web/image tools now run **in parallel**; `/archive` session archiving; remote-control pairing/grants + `CODEX_API_KEY` remote execution; `codex plugin list --json`; MCP OAuth for HTTP servers and read-only-MCP concurrency. Confidence: **Medium** · 2026-06-04.

**5. Codex as a ChatGPT app + mobile control** (Medium)
iOS 1.2026.146: Face ID/passcode lock, steer-vs-queue follow-up defaults, Windows-machine SSH; Codex runs on your Mac while you steer from iOS/Android. Context: **5M weekly users, ~20% non-developers** ([vaibhavsisinty/Instagram](https://www.instagram.com/reel/DZIOjbsgRky/)). Confidence: **Medium** · 2026-06-02.

### Hype filter (Codex)
- **"Codex Sites is a Replit/Lovable/Vercel killer," "Codex got 10× better"** — it's a *preview* hosted-app feature, genuinely useful but the "no Vercel needed ever" framing oversells a v1. Discount the multiplier language.

### Munger inversion (Codex)
**Why Codex Sites does not fit a business like Frame:** the apps live on **OpenAI's host** — no control over canonical URLs, crawler access, schema injection, or domain ownership, the exact things a local-SEO/AEO site lives or dies on. "Hosted by OpenAI" is convenience bought with lock-in and zero SEO surface.

---

## Project applicability — Frame Restoration (TX + UT)

The Frame build environment *is* Claude Code + the dynamic-workflows tool on Opus 4.8 — so the Claude updates land directly, and the Codex updates mostly don't.

**Claude Code 2.1.16x Skills/Hooks wave → directly upgrades the skill suite**
- `frame-business-loop` / `innovate` / location-page factory benefit from **forked context + hot reload + custom-agent support** — iterate a skill without restarting a session. Action: `claude update`. Effort: minutes.
- **`fallbackModel`** → set a 3-tier fallback before the next bulk location-page or schema-audit run, given the outage week. Maps to the CI compliance-gate agent runs that currently hard-fail on overload. Effort: one settings block.
- **Hooks in skills frontmatter** → the blocking gates (`audit-cta-integrity.mjs`, `audit-review-integrity.mjs`, `audit-entity-consistency`) could move from external CI into skill/agent frontmatter hooks for tighter local enforcement. Effort: hours; Backlog.

**Opus 4.8 fast-mode now 3× cheaper → revisit the local-LLM offload calculus**
The global directive offloads bulk text/classification to Ollama at $0. With Opus fast-mode at 2.5× speed and 3× cheaper, the quality-vs-cost line for *borderline* bulk work (location-prose de-doorwaying, FAQ generation) has moved — worth a re-test on one batch.

**Codex Sites / role plugins → no fit, and that's the useful finding**
Frame needs owned-domain, SEO-indexable, schema-controlled pages — OpenAI-hosted preview sites are structurally wrong for it. The 62-app business plugins skew Salesforce/Snowflake; Frame's stack is Supabase + custom CRM, so the Sales plugin doesn't map. **Decision: Skip.**

---

## Action plan (anchored to 2026-06-08)

**This week (by 2026-06-15, <1 day each)**
- [ ] Build env: `claude update` to ≥2.1.166 to get Skills hot-reload + `fallbackModel` + cross-session security fix.
- [ ] CI agents: add a 3-tier `fallbackModel` to settings so bulk runs survive an outage window.

**This month (by 2026-07-08)**
- [ ] Re-benchmark one bulk content batch on Opus 4.8 fast-mode vs Ollama offload now that fast-mode is 3× cheaper.
- [ ] Monitor Mythos (Anthropic "coming weeks"; Polymarket 86%) at next `/innovate` — don't act on the "next week" rumor.

**Backlog**
- [ ] Move one Frame compliance gate into a skill-frontmatter hook (now supported) as a tighter-loop experiment.

**Skip:** Codex Sites and the role plugins for Frame — wrong hosting model and wrong app ecosystem.
