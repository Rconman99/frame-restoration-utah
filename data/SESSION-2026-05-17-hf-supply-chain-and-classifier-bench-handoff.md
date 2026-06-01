# Session handoff — HF supply-chain defense + reddit-classifier bench
**Date:** 2026-05-17
**Scope:** Frame Roofing Utah — `reddit-classifier.py` + the local-llm-toolkit it depends on
**Trigger:** `/innovate Hugging Face` 2026-05-16 surfaced (a) a real HF malware case affecting any project that pulls models, and (b) Qwen 3.6 27B as a possible classifier upgrade. Both required investigation.

---

## TL;DR

1. **Keep `reddit-classifier.py` on Gemini 2.0 Flash via OpenRouter.** A 50-row three-way bench (Gemini vs Qwen 3.6 27B vs Claude Haiku) showed 91-98% inter-candidate agreement, with Qwen costing 3× and running 14× slower for ~zero quality gain on short-prompt classification. No code change needed.
2. **All seven historical `aeo-v1`-tagged "leads" in `reddit_signals` are false positives** (patio attachments, greenhouse builds, solar complaints, ALLATRA climate spam). The current Gemini Flash prompt + Utah-gate is correctly downgrading them. **Optional cleanup:** re-tag those 7 rows from `utah_lead`/`storm_signal` → `noise` so they stop polluting Coworker pickup queries.
3. **New supply-chain trust gate is installed** for any future `ollama pull` from Hugging Face. Use `hfp <ref>` instead of bare `ollama pull`. Allowlist at `~/.config/hf-trust/allowlist.txt`.
4. **One open /innovate item:** check what classifier `~/projects/frame-restoration-utah/scripts/aeo-fix-internal-links.py` is currently using. If still on `nemotron-mini:4b`, swap to Gemini Flash (matches what reddit-classifier does and the bench validates the choice). If already on Gemini Flash, this closes as no-op.

---

## What shipped (all live, all logged)

- `~/projects/local-llm-toolkit/scripts/verify-hf-model.sh` — wraps `ollama pull`, blocks new repos with low likes by unknown owners. Tested live against the real `Open-OSS/privacy-filter` typosquat — caught all three signals (HF-disabled, 9d/9 likes shape, owner not in allowlist).
- `~/.config/hf-trust/allowlist.txt` — 29 trusted owners (qwen, meta-llama, mistralai, deepseek-ai, anthropic, sentence-transformers, etc.)
- `alias hfp=...` in `~/.zshrc` — `source ~/.zshrc` to pick up.
- `~/projects/local-llm-toolkit/scripts/bench-reddit-classifier.py` — OpenRouter-only 3-way classifier bench (~$0.05/run, 10 min). Reusable for future model-class changes.
- `~/projects/local-llm-toolkit/scripts/reddit-classifier.py:222` — one-line null-content fix (Qwen via OpenRouter sometimes returns `"content": null`; previous code crashed instead of falling back). Touches the production classifier — no behavior change, just a defensive guard.
- `~/projects/local-llm-toolkit/README.md` — new "Before Pulling New Models" section.
- `~/Documents/bench-reddit-classifier-2026-05-16.{md,csv}` — bench results + per-row CSV for spot-check.

## What the bench actually proved

Production verdicts in `reddit_signals` were written by an older classifier (`aeo-v1`) using a different taxonomy (`utah_lead`, `aeo_opportunity`, `spam`, `storm_signal`, `competitor_intel`) — not the new `{lead_hot, lead_warm, content_gap, noise}` set the current Gemini Flash prompt produces. The bench normalizes between taxonomies before scoring agreement, and the "56% agreement with production" headline is misleading because of that taxonomy mismatch.

The signals that ARE durable:
- **Inter-candidate agreement** (the three new-prompt classifiers vs each other): 91-98%. Classifier choice is low-leverage; prompt is high-leverage.
- **Cost**: Gemini Flash $0.075/M in + $0.30/M out vs Qwen $0.32/M + $3.20/M = ~10× per token, ~3× per typical classification.
- **Latency**: Gemini 0.74s p50 vs Qwen 10.77s p50 = 14× slower. For a cron classifier this is fine; for any synchronous use it's not.
- **Lead detection on the 7 historical leads**: all three new-prompt models correctly identified them as noise/content_gap. The new Utah-gate is doing its job. Don't relax the prompt.

## Open items (your call to action)

| When | Item | Detail |
|---|---|---|
| Now (5 min) | Check `aeo-fix-internal-links.py` classifier | `grep -n "MODEL\|model=\|nemotron\|gemini\|haiku" scripts/aeo-fix-internal-links.py`. If `nemotron-mini`, swap to Gemini Flash via OpenRouter (mirror reddit-classifier.py:49-50). If already Gemini, no-op. |
| Optional (5 min) | Clean up 7 `aeo-v1` false-positive leads | Supabase `reddit_signals` where `verdict in ('utah_lead','storm_signal') AND verdict_reason LIKE 'aeo-v1%'` → set `verdict='noise', verdict_classifier='aeo-v1-rollup-2026-05-17'`. Removes pollution from Coworker pickup queries. |
| Standing rule | Use `hfp` for any new Ollama model pulls | Bare `ollama pull hf.co/<x>/<y>:tag` is a supply-chain risk vector. `hfp` is the verified version. |

## Cross-references

- Memory: [classifier-bench-2026-05-16](../../../.claude/projects/-Users-agenticmac/memory/feedback_classifier_bench_2026_05_16.md) — verdict + when to re-bench
- Memory: [hf-supply-chain-defense-2026-05-16](../../../.claude/projects/-Users-agenticmac/memory/project_hf_supply_chain_defense_2026_05_16.md) — gate design + audit results
- Prior session: `data/SESSION-2026-05-07-to-10-handoff.md` — the 4-day arc that shipped Gemini Flash + Utah-gate
- Prior session: `data/SESSION-2026-05-09-email-fix-and-site-audit.md`
- Bench artifacts: `~/Documents/bench-reddit-classifier-2026-05-16.{md,csv}`
- Bench harness (reusable): `~/projects/local-llm-toolkit/scripts/bench-reddit-classifier.py`

## What this does NOT touch

- `track-attribution.js` 404 in `index.html` line 786 → BP score stuck at 96 (Cowork regression — still open, separate workstream)
- Hail cluster canonicalization, reviews.json GBP verification, 13-week refresh trigger (all carried over from prior handoff)
- No live site changes, no AEO-monitor changes, no deploy.

## Why this matters for Frame TX (sister project)

Frame Restoration TX (`~/projects/frame-restoration-texas/`) will eventually clone the reddit-classifier pattern from Utah (it cloned `handle-lead` from Utah v14 on 2026-05-10). When that happens:
- **Skip the classifier-choice debate.** Use Gemini 2.0 Flash via OpenRouter from day one. Bench already done; don't re-spend $0.05 + 10 min.
- **Replace the Utah-gate with a TX-gate.** Allowed subreddits become r/Dallas, r/Texas, r/FortWorth, etc. — see `reddit-classifier.py:162-171` for the pattern.
- **Standing rule on `hfp` applies to TX too.** Same trust gate, same allowlist.

A separate short handoff lives in `~/projects/frame-restoration-texas/data/SESSION-2026-05-17-handoff-from-utah-hf-bench.md` summarizing the TX-specific implications.
