#!/usr/bin/env python3
"""Review Language Audit — find which AI-Overview-friendly attributes are
missing from Frame Roofing Utah's Google review corpus, and generate a
post-job CTA template Landon can text to satisfied customers to fill the gap.

Why this exists (the "Bodhi insight", 2026-05-10):
  Google's AI Overviews synthesize review *language* into their answer. The
  AI summary for "best roofer Heber City" will reference whatever attributes
  customers actually wrote about — fast response, financing, warranty, drone
  inspection, etc. If our reviews don't mention an attribute, AIO won't cite
  us for it. This script surfaces those gaps.

How it works:
  1. Load /reviews.json (already populated by update-google-reviews.py)
  2. Score each AI-friendly attribute by % of reviews mentioning it
  3. Flag attributes below COVERAGE_THRESHOLD as gaps
  4. Auto-generate a Landon CTA template targeting the top 3 gaps
  5. Write data/review-language-audit.{md,json}

Outputs are write-only; the script never modifies reviews.json or pulls from
SerpAPI. Safe to run anytime.

Usage:
  python3 scripts/review-language-audit.py              # write reports
  python3 scripts/review-language-audit.py --dry-run    # print, don't write
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REVIEWS_JSON = ROOT / "reviews.json"
OUT_MD = ROOT / "data" / "review-language-audit.md"
OUT_JSON = ROOT / "data" / "review-language-audit.json"

# Below this share of reviews mentioning an attribute, flag it as a gap.
COVERAGE_THRESHOLD = 0.30

# AI-Overview-friendly attribute taxonomy. Each entry is (label, patterns).
# Patterns are matched case-insensitively against review text. Order = display
# order in the report. Patterns are intentionally broad — we're checking
# "is this concept *represented at all*" not exact phrasing.
ATTRIBUTES: list[tuple[str, tuple[str, ...]]] = [
    ("Response Speed",        ("fast", "quick", "same.?day", "next.?day", "right away",
                               "showed up", "on time", "prompt", "responsive")),
    ("Communication",         ("updat", "kept me", "explain", "walk(ed)? me", "communicat",
                               "answered", "checked in", "kept in touch")),
    ("Honest Pricing",        ("fair (price|quote)", "honest", "transparent", "no hidden",
                               "reasonable", "no surprise", "no upsell")),
    ("Financing / Insurance", ("financ", "payment plan", "insurance", "claim", "deductible",
                               "covered by")),
    ("Quality of Work",       ("quality", "excellent", "outstanding", "professional",
                               "well done", "great work", "phenomenal")),
    ("Cleanup",               ("clean(ed|up)", "magnet sweep", "left it cleaner", "no nails",
                               "no debris", "tidy", "picked up")),
    ("Warranty / Trust",      ("warranty", "stand behind", "came back", "no leaks since",
                               "guarantee", "fixed it again")),
    ("Drone / Inspection",    ("drone", "inspect", "free estimate", "free inspection",
                               "free quote", "no.?cost estimate")),
    ("Storm / Hail / Leak",   ("storm", "hail", "wind damage", "leak", "emergency", "tarp")),
    ("Crew / Team",           ("crew", "team", "technician", "courteous", "respectful",
                               "friendly", "kind")),
    ("Recommend Again",       ("recommend", "go back", "use (him|them) again", "refer",
                               "tell my friends")),
]


def load_reviews() -> list[dict]:
    if not REVIEWS_JSON.exists():
        raise SystemExit(f"ERROR: {REVIEWS_JSON} not found — run update-google-reviews.py first")
    data = json.loads(REVIEWS_JSON.read_text(encoding="utf-8"))
    reviews = data.get("reviews", [])
    if not reviews:
        raise SystemExit("ERROR: reviews.json has no review text — SerpAPI may have failed")
    return reviews


def score(reviews: list[dict]) -> list[dict]:
    """Return per-attribute coverage stats."""
    n = len(reviews)
    out = []
    for label, patterns in ATTRIBUTES:
        # Build a single regex from the patterns — OR'd, case-insensitive.
        rx = re.compile("|".join(patterns), re.IGNORECASE)
        hits = [r for r in reviews if rx.search(r.get("text", ""))]
        pct = len(hits) / n if n else 0
        out.append({
            "attribute": label,
            "mentions": len(hits),
            "total": n,
            "coverage": round(pct, 3),
            "is_gap": pct < COVERAGE_THRESHOLD,
            "example_authors": [h.get("author") for h in hits[:2]],
        })
    return out


def gap_list(stats: list[dict]) -> list[dict]:
    """Top gaps sorted by lowest coverage first. Excludes any at 0 customers."""
    return sorted([s for s in stats if s["is_gap"]], key=lambda s: s["coverage"])


def cta_template(gaps: list[dict]) -> str:
    """Generate the iMessage-style CTA Landon sends post-job. Targets the top
    3 lowest-coverage attributes that customers are likely to actually mention
    if asked. Skips abstract ones like "Recommend Again" since those don't
    work as a direct ask."""
    askable_map = {
        "Response Speed":        "how quickly we got out to your place",
        "Communication":         "how we kept you updated through the job",
        "Honest Pricing":        "the transparent pricing and no surprises",
        "Financing / Insurance": "the financing options" if True else "the insurance claim help",
        "Quality of Work":       "the quality of the finished roof",
        "Cleanup":               "how the crew cleaned up afterward",
        "Warranty / Trust":      "the warranty / that we stand behind the work",
        "Drone / Inspection":    "the drone inspection / free estimate",
        "Storm / Hail / Leak":   "fixing the storm damage / leak",
        "Crew / Team":           "the crew",
    }
    asks = []
    for g in gaps:
        ask = askable_map.get(g["attribute"])
        if ask:
            asks.append(ask)
        if len(asks) >= 3:
            break
    if not asks:
        return "(no gaps — every AI-friendly attribute is already covered)"
    asks_text = ", or ".join(asks)
    return (
        "hey [name], thanks again for going with us on the roof. "
        "if you have 30 seconds for a google review it would mean the world. "
        f"if you can mention {asks_text} that helps a ton with how we show up online. "
        "no pressure — link here: [google review link]"
    )


def render_markdown(stats: list[dict], gaps: list[dict], cta: str, n_reviews: int) -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = "\n".join(
        f"| {s['attribute']} | {s['mentions']}/{s['total']} | {int(s['coverage']*100)}% | {'GAP' if s['is_gap'] else 'OK'} |"
        for s in stats
    )
    gap_lines = "\n".join(
        f"- **{g['attribute']}** — {g['mentions']}/{g['total']} reviews ({int(g['coverage']*100)}%)"
        for g in gaps
    ) or "_No gaps — every tracked attribute is above 30% coverage._"
    return f"""# Review Language Audit — Frame Roofing Utah

**Date:** {today}
**Reviews analyzed:** {n_reviews} (from /reviews.json)
**Why this report exists:** Google AI Overviews pull from review language. Attributes our customers don't mention won't show up when AIO answers "best roofer Heber City" or "roof replacement Park City." This audit finds the gaps.

## Attribute Coverage

| Attribute | Mentions | Coverage | Status |
|---|---|---|---|
{rows}

## Gaps to close

{gap_lines}

## Landon CTA template — post-job text to send happy customers

> {cta}

Send this to the next 5-10 customers after a successful job, swapping `[name]` and pasting the Google review link. The goal is to seed the missing attributes into the review corpus so AI Overviews see them.

## How this updates

- Run `python3 scripts/review-language-audit.py` after each `update-google-reviews.py` cycle (1st/15th)
- The audit re-scores against the freshest review feed automatically
- Coverage threshold: 30% — drop below and an attribute is flagged as a gap

_Generated by `scripts/review-language-audit.py`. Bodhi insight: 2026-05-10 thread._
"""


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    reviews = load_reviews()
    stats = score(reviews)
    gaps = gap_list(stats)
    cta = cta_template(gaps)
    md = render_markdown(stats, gaps, cta, len(reviews))

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reviews_analyzed": len(reviews),
        "coverage_threshold": COVERAGE_THRESHOLD,
        "stats": stats,
        "gaps": [g["attribute"] for g in gaps],
        "cta_template": cta,
    }

    if dry_run:
        print(md)
        print("\n--- JSON summary ---")
        print(json.dumps(summary, indent=2))
        return 0

    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text(md, encoding="utf-8")
    OUT_JSON.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_MD.relative_to(ROOT)} and {OUT_JSON.relative_to(ROOT)}")
    print(f"Gaps found: {len(gaps)} — {', '.join(g['attribute'] for g in gaps) or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
