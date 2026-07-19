#!/usr/bin/env python3
"""blog-enhancer.py (Utah) — turn traction into the bar every new post must clear.

Reads the tracker snapshot (data/blog-traction.json) and derives two things:

  1. floor  — the HARD structural minimums a new draft must meet or it never
     publishes (blog-publish.py enforces this, flipping the post to
     needs-review instead of shipping). Derived conservatively from the corpus
     (a low percentile, clamped) so it catches genuinely thin/broken drafts
     without stalling a normal run.

  2. target — the current CHAMPION's structure (never below our best-written
     post): the "match or beat" aspiration injected into the drafter. As better
     posts land the target ratchets up, so each new post is briefed to beat the
     best one so far, not just clear the floor.

Also writes a human-readable data/blog-playbook.md so the standard is legible.

The floor is deliberately narrow — only LLM-controlled, reliably-measured axes
(word count, content H2s, FAQ count, required schema). Sources and internal
links are noisy, so they live in the ASPIRATIONAL target, never the hard floor.

Usage:
  python3 scripts/blog-enhancer.py            # write benchmark + playbook
  python3 scripts/blog-enhancer.py --stdout   # print benchmark JSON only
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRACTION = ROOT / "data" / "blog-traction.json"
BENCHMARK = ROOT / "data" / "blog-quality-benchmark.json"
PLAYBOOK = ROOT / "data" / "blog-playbook.md"

REQUIRED_SCHEMA = ["BlogPosting", "FAQPage"]

# Ceilings clamp the floor just below the live drafter's typical output so a
# percentile off the blended corpus can't set the bar high enough to stall
# autonomous posting. (min, max)
CLAMP = {
    "min_words": (900, 1150),
    "min_h2": (5, 6),
    "min_faqs": (4, 5),
}


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    if len(s) == 1:
        return float(s[0])
    k = (len(s) - 1) * (pct / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def clamp(name: str, value: float) -> int:
    lo, hi = CLAMP[name]
    return int(max(lo, min(hi, round(value))))


def build(snap: dict) -> dict:
    posts = snap.get("posts", [])
    if not posts:
        raise SystemExit("blog-enhancer: traction snapshot has no posts")

    words = [p["words"] for p in posts]
    h2 = [p["h2"] for p in posts]
    faqs = [p["faqs"] for p in posts]

    floor = {
        "min_words": clamp("min_words", percentile(words, 25)),
        "min_h2": clamp("min_h2", percentile(h2, 25)),
        "min_faqs": clamp("min_faqs", percentile(faqs, 25)),
        "required_schema": REQUIRED_SCHEMA,
    }

    # Aspirational target = the traffic champion, but never below our best-WRITTEN
    # post on any axis (per-axis max), so a thin-but-clicked post can't drag the
    # drafting bar down — the target only ratchets up.
    champ = snap.get("champion")
    champ_post = next((p for p in posts if champ and p["slug"] == champ["slug"]), posts[0])
    best_quality = max(posts, key=lambda p: p["quality_score"])
    # Monotonic ratchet: carry forward the previous benchmark's per-axis maxima
    # so a new best-quality post that wins on one axis can never LOWER the target
    # on another (the advertised "only ratchets up" guarantee).
    prev = {}
    try:
        prev = json.loads(BENCHMARK.read_text()).get("target", {})
    except Exception:
        prev = {}
    axis = lambda k: max(champ_post[k], best_quality[k], int(prev.get(k) or 0))
    target = {
        "words": axis("words"),
        "h2": axis("h2"),
        "faqs": max(axis("faqs"), floor["min_faqs"]),
        "sources": max(axis("sources"), 3),
        "internal_links": max(axis("internal_links"), 4),
    }

    def top_group(field: str, n: int = 4) -> list[dict]:
        agg: dict[str, dict] = {}
        for p in posts:
            k = p.get(field)
            if not k:
                continue
            a = agg.setdefault(k, {"key": k, "posts": 0, "traction_sum": 0.0, "views_90d": 0})
            a["posts"] += 1
            a["traction_sum"] += p["traction_score"]
            a["views_90d"] += (p.get("views_90d") or 0)
        rows = [{"key": a["key"], "posts": a["posts"],
                 "avg_traction": round(a["traction_sum"] / a["posts"], 1),
                 "views_90d": a["views_90d"]} for a in agg.values()]
        rows.sort(key=lambda r: (-r["views_90d"], -r["avg_traction"]))
        return rows[:n]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "market": snap.get("market", "utah"),
        "based_on_posts": len(posts),
        "traffic_source": snap.get("traffic_source"),
        "champion": {
            "slug": champ_post["slug"],
            "title": champ_post["title"],
            "quality_score": champ_post["quality_score"],
            "traction_score": champ_post["traction_score"],
            "words": champ_post["words"], "h2": champ_post["h2"],
            "faqs": champ_post["faqs"], "sources": champ_post["sources"],
            "internal_links": champ_post["internal_links"],
        },
        "floor": floor,
        "target": target,
        "winning": {
            "cities": top_group("city_slug"),
            "services": top_group("service_slug"),
        },
    }


def write_playbook(bm: dict) -> None:
    market = (bm.get("market") or "utah").title()
    c = bm["champion"]
    f = bm["floor"]
    t = bm["target"]
    lines = [
        f"# Frame Restoration {market} — Blog Quality Playbook",
        "",
        f"_Auto-generated by `scripts/blog-enhancer.py` from `data/blog-traction.json` "
        f"({bm['based_on_posts']} posts, traffic source: {bm['traffic_source']}). "
        f"Generated {bm['generated_at']}._",
        "",
        "This is the standard every new auto-drafted post is briefed to beat, and the "
        "hard floor below which a post is sent to needs-review instead of publishing.",
        "",
        "## Current champion (the post to beat)",
        f"**{c['title']}**  \n`{c['slug']}` — quality {c['quality_score']}, traction {c['traction_score']}",
        "",
        f"- Words: **{c['words']}**",
        f"- Content H2 sections: **{c['h2']}**",
        f"- FAQs: **{c['faqs']}**",
        f"- Cited sources: **{c['sources']}**",
        f"- Internal links: **{c['internal_links']}**",
        "",
        "## Target for the next post (match or beat)",
        f"- Words ≥ **{t['words']}**",
        f"- Content H2 sections ≥ **{t['h2']}**",
        f"- FAQs ≥ **{t['faqs']}**",
        f"- Cited sources ≥ **{t['sources']}**",
        f"- Internal links ≥ **{t['internal_links']}**",
        "",
        "## Hard floor (publish blocks below this)",
        f"- Words ≥ **{f['min_words']}**",
        f"- Content H2 sections ≥ **{f['min_h2']}**",
        f"- FAQs ≥ **{f['min_faqs']}**",
        f"- Schema present: **{', '.join(f['required_schema'])}**",
        "",
        "## Where traction is concentrating (double down)",
        "**Cities:** " + (", ".join(
            f"{r['key']} (avg traction {r['avg_traction']}, {r['views_90d']} views/90d)"
            for r in bm["winning"]["cities"]) or "— not enough signal yet —"),
        "",
        "**Services:** " + (", ".join(
            f"{r['key']} (avg traction {r['avg_traction']})"
            for r in bm["winning"]["services"]) or "— not enough signal yet —"),
        "",
    ]
    PLAYBOOK.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stdout", action="store_true")
    args = ap.parse_args()

    if not TRACTION.is_file():
        raise SystemExit(f"blog-enhancer: {TRACTION.relative_to(ROOT)} not found — run blog-traction.py first")
    snap = json.loads(TRACTION.read_text())
    bm = build(snap)

    if args.stdout:
        print(json.dumps(bm, indent=2, ensure_ascii=False))
        return

    BENCHMARK.parent.mkdir(parents=True, exist_ok=True)
    BENCHMARK.write_text(json.dumps(bm, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_playbook(bm)
    print(f"blog-enhancer: champion={bm['champion']['slug']} "
          f"(w{bm['champion']['words']}/h{bm['champion']['h2']}/faq{bm['champion']['faqs']})")
    print(f"  floor: words≥{bm['floor']['min_words']} h2≥{bm['floor']['min_h2']} faqs≥{bm['floor']['min_faqs']}")
    print(f"  wrote {BENCHMARK.relative_to(ROOT)} + {PLAYBOOK.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
