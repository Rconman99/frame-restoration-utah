#!/usr/bin/env python3
"""
content-density-audit.py — Frame Roofing Utah

Scores every indexable HTML page against the industry-consensus GEO benchmark
(1 hyperlinked statistic per ~200 words). Sourced from Averi.ai / Similarweb /
ConvertMate 2026 syntheses of the Princeton GEO paper, where "combined
optimization techniques (statistics + citations + expert quotations) lift AI
citation probability up to 40%." Statistic density is the strongest single
lever within that bundle.

What it counts per page (text content only — strips nav/footer/script/style):
- word_count    — body word count
- stat_count    — <strong> tags containing at least one digit (proxy for stat)
- citation_count — outbound <a href> to authoritative domains (.gov, .edu,
                   manufacturer specs, BBB, NRCA, NOAA, Utah DOPL, etc.)
- blockquote_count — <blockquote> elements (expert-quotation proxy)

Tiering (combined per 200w = stats_per_200w + cites_per_200w * 1.5):
- 🟢 good   ≥ 1.5
- 🟡 medium 0.75 – 1.5
- 🔴 low    < 0.75

Priority score = (1.0 − combined) × page-type weight × visibility(log of wc).
Higher priority → higher refresh leverage.

Output:
- data/content-density-audit-YYYY-MM-DD.md   (human-readable report)
- data/content-density-audit-YYYY-MM-DD.json (machine-readable, dashboard-feedable)

Usage: python3 scripts/content-density-audit.py
"""

from __future__ import annotations

import json
import math
import re
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

# Authoritative domain patterns — outbound links to these count as citations.
# Mix of regulatory, standards bodies, manufacturer specs, and trusted refs.
AUTH_DOMAIN_PATTERNS = [
    r"\.gov(/|$)",
    r"\.edu(/|$)",
    r"bbb\.org",
    r"nrca\.net",
    r"gaf\.com",
    r"owenscorning\.com",
    r"certainteed\.com",
    r"malarkeyroofing\.com",
    r"iccsafe\.org",
    r"iccsafe\.com",
    r"noaa\.gov",
    r"weather\.gov",
    r"nws\.noaa\.gov",
    r"wikipedia\.org",
    r"dopl\.utah\.gov",
    r"le\.utah\.gov",
    r"utah\.gov",
    r"energy\.gov",
    r"osha\.gov",
    r"epa\.gov",
    r"fema\.gov",
    r"hud\.gov",
    r"asphaltroofing\.org",
    r"nahb\.org",
    r"angi\.com",
    r"buildzoom\.com",
    r"yelp\.com",
]

# Page-path patterns to skip — internal tools, archives, fragments, legal.
EXCLUDE_PATTERNS = [
    "archive/", "tmp-", "node_modules/", "_backup", "_backup-",
    "directory-tracker.html", "directory-blitz-tool.html",
    "backlink-playbook.html", "Frame-Roofing-", "Landon-Action-Items",
    "seo-report.html", "seo-audit-march-2026.html", "google-maps-pins.html",
    "dashboard/", "review.html", "thank-you.html",
    "privacy.html", "terms.html", "404.html",
    "hero.html", "index-redesign.html",
    "data/", "images/projects/",  # html fixtures inside data/
    "google054d522a8c2d926c.html",  # google verification file
]

# Per-page-type weights — primary AEO surfaces get higher priority.
PAGE_TYPE_WEIGHTS = {
    "blog":      1.2,
    "location":  1.0,
    "service":   1.0,
    "homepage":  1.1,
    "about":     0.6,
    "other":     0.5,
}


def classify_page(rel: str) -> str:
    if rel == "index.html":
        return "homepage"
    if rel.startswith("locations/"):
        return "location"
    if rel.startswith("blog/"):
        return "blog"
    if rel.startswith("pages/"):
        if "about" in rel:
            return "about"
        return "service"
    if rel == "about.html":
        return "about"
    return "other"


def is_excluded(rel: str) -> bool:
    return any(p in rel for p in EXCLUDE_PATTERNS)


# Strip head/script/style/nav/footer/header so we're scoring body content only.
# Use non-greedy + DOTALL.
_STRIP_TAGS = ("script", "style", "nav", "footer", "header", "head")
_strip_patterns = [
    re.compile(rf"<{tag}\b[^>]*>.*?</{tag}>", re.DOTALL | re.IGNORECASE)
    for tag in _STRIP_TAGS
]
_tag_pattern = re.compile(r"<[^>]+>")
_whitespace = re.compile(r"\s+")
_strong_with_digit = re.compile(
    r"<strong\b[^>]*>([^<]*?)</strong>", re.DOTALL | re.IGNORECASE
)
_href_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
_blockquote_pattern = re.compile(r"<blockquote\b", re.IGNORECASE)


def extract_metrics(html: str) -> dict:
    cleaned = html
    for pat in _strip_patterns:
        cleaned = pat.sub("", cleaned)

    # text-only body for word count
    text = _tag_pattern.sub(" ", cleaned)
    text = _whitespace.sub(" ", text).strip()
    word_count = len(text.split())

    # stats: <strong> tags whose inner content contains at least one digit
    stat_count = 0
    for m in _strong_with_digit.finditer(cleaned):
        inner = m.group(1)
        if re.search(r"\d", inner):
            stat_count += 1

    # citations: outbound <a href> to authoritative domains
    citation_count = 0
    for m in _href_pattern.finditer(cleaned):
        href = m.group(1)
        if any(re.search(pat, href) for pat in AUTH_DOMAIN_PATTERNS):
            citation_count += 1

    blockquote_count = len(_blockquote_pattern.findall(cleaned))

    return {
        "word_count": word_count,
        "stat_count": stat_count,
        "citation_count": citation_count,
        "blockquote_count": blockquote_count,
    }


def score_page(metrics: dict, page_type: str) -> dict:
    wc = metrics["word_count"]
    if wc < 150:
        return {"tier": "skip", "reason": "word count < 150"}

    stats_per_200w = (metrics["stat_count"] / wc) * 200
    cites_per_200w = (metrics["citation_count"] / wc) * 200
    combined_per_200w = stats_per_200w + cites_per_200w * 1.5

    if combined_per_200w >= 1.5:
        tier = "good"
    elif combined_per_200w >= 0.75:
        tier = "medium"
    else:
        tier = "low"

    target = 1.0
    gap = max(0.0, target - combined_per_200w)
    weight = PAGE_TYPE_WEIGHTS.get(page_type, 0.5)
    visibility = math.log(wc + 1) / math.log(3000)  # ~1 at 3000w
    priority = gap * weight * (1 + visibility)

    return {
        "tier": tier,
        "stats_per_200w": round(stats_per_200w, 2),
        "cites_per_200w": round(cites_per_200w, 2),
        "combined_per_200w": round(combined_per_200w, 2),
        "priority": round(priority, 3),
    }


def main() -> int:
    results = []
    skipped = 0

    for html_file in sorted(REPO_ROOT.glob("**/*.html")):
        rel = str(html_file.relative_to(REPO_ROOT))
        if is_excluded(rel):
            continue
        try:
            html = html_file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        metrics = extract_metrics(html)
        page_type = classify_page(rel)
        score = score_page(metrics, page_type)

        if score.get("tier") == "skip":
            skipped += 1
            continue

        results.append({
            "path": rel,
            "type": page_type,
            **metrics,
            **score,
        })

    # Sort by priority descending
    results.sort(key=lambda r: r.get("priority", 0), reverse=True)

    tier_counts = {"good": 0, "medium": 0, "low": 0}
    type_counts: dict[str, dict[str, int]] = {}
    for r in results:
        tier_counts[r["tier"]] += 1
        t = r["type"]
        type_counts.setdefault(t, {"good": 0, "medium": 0, "low": 0})
        type_counts[t][r["tier"]] += 1

    today = str(date.today())
    out_dir = REPO_ROOT / "data"
    out_dir.mkdir(exist_ok=True)

    json_path = out_dir / f"content-density-audit-{today}.json"
    json_path.write_text(json.dumps({
        "audit_date": today,
        "target_per_200w": 1.0,
        "good_threshold": 1.5,
        "total_pages_scored": len(results),
        "skipped_short_pages": skipped,
        "tier_counts": tier_counts,
        "type_breakdown": type_counts,
        "pages": results,
    }, indent=2))

    # Markdown report
    md = [
        f"# Content Density Audit — {today}",
        "",
        f"**Pages scored:** {len(results)} (skipped {skipped} pages < 150 words)",
        "**Target:** ≥1.0 combined fact-density per 200 words "
        "(`stats_per_200w + cites_per_200w * 1.5`). Industry-consensus GEO "
        "benchmark per Averi.ai / Similarweb / ConvertMate 2026 syntheses of "
        "the [Princeton GEO paper](https://arxiv.org/abs/2311.09735).",
        "",
        "## Tier distribution",
        f"- 🟢 **Good** (≥1.5/200w): **{tier_counts['good']}**",
        f"- 🟡 **Medium** (0.75-1.5): **{tier_counts['medium']}**",
        f"- 🔴 **Low** (<0.75): **{tier_counts['low']}**",
        "",
        "## Breakdown by page type",
        "",
        "| Type | Good | Medium | Low | Total |",
        "|---|---:|---:|---:|---:|",
    ]
    for t in ["blog", "location", "service", "homepage", "about", "other"]:
        if t in type_counts:
            tc = type_counts[t]
            total = tc["good"] + tc["medium"] + tc["low"]
            md.append(f"| {t} | {tc['good']} | {tc['medium']} | {tc['low']} | {total} |")

    md.extend([
        "",
        "## Top 30 refresh-priority pages",
        "",
        "Sorted by priority score = `(1.0 − combined/200w) × type-weight × visibility(log wc)`. Higher priority = higher refresh leverage.",
        "",
        "| Priority | Path | Type | Words | Stats | Cites | Combined/200w | Tier |",
        "|---:|---|:---:|---:|---:|---:|---:|:---:|",
    ])
    tier_emoji = {"good": "🟢", "medium": "🟡", "low": "🔴"}
    for r in results[:30]:
        md.append(
            f"| {r['priority']} | `{r['path']}` | {r['type']} | "
            f"{r['word_count']} | {r['stat_count']} | {r['citation_count']} | "
            f"{r['combined_per_200w']} | {tier_emoji[r['tier']]} {r['tier']} |"
        )

    md.extend([
        "",
        "## Top 10 highest-density pages (the model — replicate this pattern)",
        "",
        "| Path | Type | Words | Stats | Cites | Combined/200w |",
        "|---|:---:|---:|---:|---:|---:|",
    ])
    # Highest density (sorted by combined desc, with min wc 500 to filter trivial)
    high_density = sorted(
        [r for r in results if r["word_count"] >= 500],
        key=lambda r: r["combined_per_200w"],
        reverse=True,
    )[:10]
    for r in high_density:
        md.append(
            f"| `{r['path']}` | {r['type']} | {r['word_count']} | "
            f"{r['stat_count']} | {r['citation_count']} | {r['combined_per_200w']} |"
        )

    md.extend([
        "",
        "## How to interpret",
        "",
        "- **`stat_count`** = `<strong>` tags whose inner text contains a digit (proxy for embedded statistic)",
        "- **`citation_count`** = outbound `<a href>` to authoritative domains (.gov, .edu, BBB, NRCA, NOAA, Utah DOPL, manufacturer specs, etc.)",
        "- **`combined_per_200w = stats_per_200w + cites_per_200w × 1.5`** — citations weighted 1.5× because outbound authority signals are stronger than naked stats",
        "- Pages scoring 🔴 LOW should add statistics WITH authoritative source citations — not naked numbers (per the inversion: unsourced stats break trust on second-source verification)",
        "",
        "## Refresh workflow",
        "",
        "1. Pick the top page from the priority list",
        "2. Read it; identify 3-5 paragraphs lacking a stat or citation",
        "3. For each, add ONE `<strong>{number}</strong>` (real stat from a real source) PLUS a `<a href=\"{authoritative URL}\">` outbound link to that source",
        "4. Bump `dateModified` in JSON-LD + visible 'Last updated' stamp",
        "5. Re-run this audit; the page should drop off the top-30 list",
        "",
        "Aim for **2-3 high-priority pages per week** rather than batch-rewriting. Compounds across the catalog over a quarter.",
    ])

    md_path = out_dir / f"content-density-audit-{today}.md"
    md_path.write_text("\n".join(md) + "\n")

    # Console summary
    print(f"✓ Scored {len(results)} pages (skipped {skipped} short pages)")
    print(f"  🟢 good:   {tier_counts['good']}")
    print(f"  🟡 medium: {tier_counts['medium']}")
    print(f"  🔴 low:    {tier_counts['low']}")
    print()
    print(f"✓ Report:  {md_path}")
    print(f"✓ JSON:    {json_path}")
    print()
    print("Top 10 refresh targets:")
    for r in results[:10]:
        emoji = tier_emoji[r["tier"]]
        print(
            f"  {emoji} {r['priority']:>5.2f}  {r['path']:<60} "
            f"({r['combined_per_200w']}/200w, {r['word_count']}w)"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
