#!/usr/bin/env python3
"""
Frame Restoration Utah — Blog Target Prioritizer

The gate before `npm run blog:draft`. Ranks (city, service) blog targets by
data-driven score so we publish where the marginal lift is largest.

Score = whitespace_bias × tier × storm_override × aeo_leverage × freshness × revenue_proxy

Inputs (all optional — script works on whatever exists):
  data/market-intel-allocation.json   → tier + storm override + LSA $/mo per city
  data/aeo-citations/_actions.json    → AEO query leverage + lead-value
  data/aeo-citations/_trend.json      → local-pack + organic position per query
  sitemap.xml                         → content freshness (lastmod per URL)
  blog/{city}/*.html                  → existing spoke count per city
  data/google-reviews.json            → review velocity (used as Frame credibility multiplier)
  --gsc-csv <path>                    → optional: GSC pages export (clicks/impressions/CTR/position)
                                        export from search.google.com/search-console > Performance > Pages > Export

Usage:
  python3 scripts/blog-target-prioritizer.py                       # ranked table to stdout
  python3 scripts/blog-target-prioritizer.py --top 10              # top N rows
  python3 scripts/blog-target-prioritizer.py --feed-blog-draft     # print the blog:draft command for #1
  python3 scripts/blog-target-prioritizer.py --gsc-csv ~/Downloads/gsc-pages.csv
  python3 scripts/blog-target-prioritizer.py --json                # machine-readable output
"""

from __future__ import annotations
import argparse
import csv
import json
import os
import re
import shlex
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
WEATHER_SIGNAL_PATH = ROOT / "data" / "weather-event-signals.json"
NWS_USER_AGENT = os.environ.get(
    "FRAME_NWS_USER_AGENT",
    "FrameRestorationUtahBlogBot/1.0 (https://www.framerestorationutah.com)",
)

# ── Service catalog (must match the Frame service-page slugs) ───────
SERVICES = [
    {"slug": "storm-damage", "name": "Storm Damage", "lead_value": 9, "intent": "emergency"},
    {"slug": "roof-replacement", "name": "Roof Replacement", "lead_value": 10, "intent": "high-ticket"},
    {"slug": "insurance-claims", "name": "Insurance Claims", "lead_value": 9, "intent": "claim-process"},
    {"slug": "roof-repair", "name": "Roof Repair", "lead_value": 6, "intent": "transactional"},
    {"slug": "residential-roofing", "name": "Residential Roofing", "lead_value": 7, "intent": "informational"},
    {"slug": "gutters", "name": "Gutters", "lead_value": 4, "intent": "transactional"},
]

LEAD_INTENT_MULTIPLIER = {
    "emergency": 1.3,
    "high-ticket": 1.25,
    "claim-process": 1.2,
    "transactional": 1.1,
    "informational": 0.95,
}

WEATHER_SERVICE_BOOSTS = {
    "hail": {
        "storm-damage": 1.9,
        "insurance-claims": 1.7,
        "roof-repair": 1.45,
        "roof-replacement": 1.12,
    },
    "thunderstorm": {
        "storm-damage": 1.75,
        "insurance-claims": 1.55,
        "roof-repair": 1.4,
        "roof-replacement": 1.08,
    },
    "wind": {
        "roof-repair": 1.65,
        "storm-damage": 1.6,
        "insurance-claims": 1.35,
        "roof-replacement": 1.06,
    },
    "heavy-rain": {
        "roof-repair": 1.55,
        "storm-damage": 1.35,
        "insurance-claims": 1.2,
        "gutters": 1.12,
    },
    "snow": {
        "roof-repair": 1.45,
        "storm-damage": 1.35,
        "insurance-claims": 1.15,
        "roof-replacement": 1.08,
        "gutters": 1.08,
    },
    "freeze": {
        "roof-repair": 1.35,
        "storm-damage": 1.2,
        "roof-replacement": 1.08,
        "gutters": 1.08,
    },
    "heat": {
        "roof-replacement": 1.12,
        "residential-roofing": 1.08,
        "roof-repair": 1.05,
    },
}

WEATHER_KEYWORD_TEMPLATES = {
    "hail": {
        "storm-damage": "hail damage roof inspection {city}",
        "insurance-claims": "{city} hail damage roof insurance claim",
        "roof-repair": "hail damage roof repair {city}",
    },
    "thunderstorm": {
        "storm-damage": "storm damage roof repair {city}",
        "insurance-claims": "{city} storm damage roof insurance claim",
        "roof-repair": "storm roof leak repair {city}",
    },
    "wind": {
        "storm-damage": "wind damage roof repair {city}",
        "insurance-claims": "{city} wind damage roof insurance claim",
        "roof-repair": "wind lifted shingle repair {city}",
    },
    "heavy-rain": {
        "roof-repair": "roof leak repair after rain {city}",
        "storm-damage": "storm leak roof repair {city}",
        "gutters": "gutter repair after heavy rain {city}",
    },
    "snow": {
        "roof-repair": "ice dam roof repair {city}",
        "storm-damage": "snow damage roof repair {city}",
        "gutters": "ice dam gutter repair {city}",
    },
    "freeze": {
        "roof-repair": "freeze thaw roof leak repair {city}",
        "roof-replacement": "winter roof replacement planning {city}",
    },
}

# ── Keyword templates per (service, city_kind) ──────────────────────
# city_kind = mountain (Park City, Heber, Midway) | valley | metro
KEYWORD_TEMPLATES = {
    "storm-damage": {
        "mountain": "storm damage roof repair {city}",
        "valley":   "wind damage roof repair {city}",
        "metro":    "storm damage roofing {city}",
    },
    "roof-replacement": {
        "mountain": "mountain home roof replacement {city}",
        "valley":   "roof replacement {city} utah",
        "metro":    "roof replacement {city} utah",
    },
    "insurance-claims": {
        "mountain": "{city} roof insurance claim help",
        "valley":   "{city} roof insurance claim",
        "metro":    "{city} utah roof insurance claim",
    },
    "roof-repair": {
        "mountain": "emergency roof repair {city}",
        "valley":   "roof leak repair {city}",
        "metro":    "roof repair {city} utah",
    },
    "residential-roofing": {
        "mountain": "luxury residential roofing {city}",
        "valley":   "residential roofing {city} utah",
        "metro":    "residential roofing {city}",
    },
    "gutters": {
        "mountain": "gutter installation {city} utah",
        "valley":   "gutter replacement {city}",
        "metro":    "gutter installation {city}",
    },
}

MOUNTAIN_CITIES = {"park-city", "heber-city", "midway", "alpine"}
METRO_CITIES = {"salt-lake-city", "west-valley-city", "ogden", "provo", "orem", "south-salt-lake"}
# everything else = valley
HEBER_VALLEY_CLUSTER = {"heber-city", "midway", "wallsburg", "charleston", "daniel"}

# Per-city blog-spoke saturation cap (2026-05-09 research).
# 2026 local-SEO sentiment converged on "fewer/deeper, not more/thinner":
#   - Caleb Ulku (200+ businesses, 2016-present): https://www.youtube.com/watch?v=EIFXxiunKoE
#   - r/localseo "delete weak city pages instead of adding more": https://www.reddit.com/r/localseo/comments/1t6ogwk/
#   - r/localseo internal-link gap killing map pack: https://www.reddit.com/r/localseo/comments/1t0hh12/
# Beyond ~2 spokes per city, the marginal lift on add-another-blog drops below
# the marginal lift on internal-link cleanup + location-page deepening.
# Override via --include-saturated for cases where a 3rd spoke covers a genuinely
# distinct service-intent (rare; manual judgment).
MAX_SPOKES_PER_CITY = 2

# Floor for the measured-CTR class multiplier. A losing class is demoted, never
# erased: the target still appears so a human can see it and its reason.
CLASS_CTR_FLOOR = 0.15
# Below this, a class has too few impressions for its CTR to mean anything.
MIN_CLASS_IMPRESSIONS = 500
# Cap on the statewide advantage multiplier. The measured ratio rests on a
# 1-click denominator in the city class, so the raw number is unstable; bound it.
STATEWIDE_MAX_ADVANTAGE = 5.0

# ── Statewide topic gaps (/blog/utah/) ─────────────────────────────
#
# Demoting the city class is not enough on its own: if every candidate is a
# city+service post, the ranking just orders one losing format. This is the
# alternative axis, so the better move is actually on the menu.
#
# `utah_volume` is Utah-scoped monthly search volume measured via DataForSEO on
# 2026-08-07 — NOT national, and NOT estimated. Topics already covered in
# blog/utah/ are filtered out at runtime, so this list only ever surfaces gaps.
#
# Caveat worth keeping in mind: the two posts that actually convert
# (utah-roof-ventilation-guide 2.8%, best-roofing-materials-utah 1.4%) report
# ZERO exact-match volume yet earned 982 impressions between them. These pages
# win on aggregate long-tail, so head-term volume ranks the list but does not
# define the ceiling — a 10/mo head term is not a 10/mo topic.
STATEWIDE_TOPICS = [
    {"slug": "asphalt-shingles-vs-metal-roof-utah", "keyword": "asphalt shingles vs metal roof", "utah_volume": 70, "kind": "comparison"},
    {"slug": "attic-insulation-utah", "keyword": "attic insulation utah", "utah_volume": 30, "kind": "guide"},
    {"slug": "roof-leak-repair-cost-utah", "keyword": "roof leak repair cost", "utah_volume": 20, "kind": "cost"},
    {"slug": "ice-dam-prevention-utah", "keyword": "ice dam prevention", "utah_volume": 10, "kind": "guide"},
    {"slug": "architectural-vs-3-tab-shingles-utah", "keyword": "architectural vs 3 tab shingles", "utah_volume": 10, "kind": "comparison"},
    {"slug": "synthetic-underlayment-vs-felt-utah", "keyword": "synthetic underlayment vs felt", "utah_volume": 10, "kind": "comparison"},
    {"slug": "gutter-guards-worth-it-utah", "keyword": "gutter guards worth it", "utah_volume": 10, "kind": "comparison"},
    {"slug": "how-to-find-a-roof-leak-utah", "keyword": "how to find roof leak", "utah_volume": 10, "kind": "guide"},
    {"slug": "utah-roofing-license-guide", "keyword": "utah roofing license", "utah_volume": 10, "kind": "guide"},
    {"slug": "roof-snow-load-utah", "keyword": "roof snow load utah", "utah_volume": 0, "kind": "guide"},
]


def statewide_gaps() -> list[dict]:
    """Statewide topics with no post yet, highest measured Utah volume first."""
    existing = {p.stem for p in (ROOT / "blog" / "utah").glob("*.html")} if (ROOT / "blog" / "utah").exists() else set()
    gaps = [t for t in STATEWIDE_TOPICS if t["slug"] not in existing]
    return sorted(gaps, key=lambda t: -t["utah_volume"])


def statewide_targets(measured_ctr: dict, best_city_score: float) -> list[dict]:
    """Statewide gaps as ranked targets, in the same shape the city rows use.

    Scored in the one currency that is directly measured and directly comparable
    across both classes: **clicks per post**. Over the 28-day window, 17
    /blog/utah/ posts earned 20 clicks (1.18 each) while 37 /blog/<city>/ posts
    earned 1 (0.027 each). A statewide target is therefore worth that ratio times
    the best city target, and the ranking says so in as many words.

    Deliberately NOT modelled on search volume. The two posts that actually
    convert report zero exact-match volume and still earned 982 impressions, so a
    volume-based expected-clicks model would be measurably wrong here. Volume
    only orders topics within the statewide list.

    city_slug is "utah" because blog posts are written to blog/{city_slug}/ —
    which is exactly where statewide posts already live. Nothing downstream needs
    to change to consume these.
    """
    gaps = statewide_gaps()
    if not gaps or not measured_ctr.get("available"):
        return []

    city, state = measured_ctr["blog_city"], measured_ctr["blog_statewide"]
    city_per_post = (city["clicks"] / city["pages"]) if city["pages"] else 0.0
    state_per_post = (state["clicks"] / state["pages"]) if state["pages"] else 0.0
    if state_per_post <= city_per_post:
        return []  # no measured advantage — do not manufacture one
    # Bounded: a 1-click denominator makes the raw ratio unstable, and no single
    # scoring factor should be allowed to dominate by two orders of magnitude.
    advantage = min(state_per_post / max(city_per_post, 0.01), STATEWIDE_MAX_ADVANTAGE)

    out = []
    for i, t in enumerate(gaps):
        out.append({
            "city_slug": "utah",
            "city_name": "Utah",
            "service_slug": t["slug"],
            "service_name": t["kind"].title(),
            "keyword": t["keyword"],
            "axis": "statewide",
            "utah_volume": t["utah_volume"],
            "score": round(best_city_score * advantage * (1.0 - i * 0.03), 2),
            "measured_basis": (
                f"/blog/utah/ earned {state_per_post:.2f} clicks/post vs /blog/<city>/ "
                f"{city_per_post:.3f} over {measured_ctr['window'].get('startDate','?')}"
                f"→{measured_ctr['window'].get('endDate','?')} ({advantage:.0f}x, capped)"
            ),
        })
    return out


def city_kind(slug: str) -> str:
    if slug in MOUNTAIN_CITIES: return "mountain"
    if slug in METRO_CITIES: return "metro"
    return "valley"


# ── Data loaders ────────────────────────────────────────────────────
def load_market_intel() -> dict[str, dict]:
    """{city_slug: {tier, allocation, storm_override, factors}}"""
    p = ROOT / "data" / "market-intel-allocation.json"
    if not p.exists():
        return {}
    data = json.loads(p.read_text())
    out = {}
    for entry in data.get("allocation", {}).get("byCity", []):
        c = entry["city"]
        out[c["id"]] = {
            "name": c["name"],
            "tier": c.get("tier", 3),
            "allocation": entry.get("monthlyAllocation", 0),
            "storm_override": entry.get("stormOverrideApplied", False),
            "factors": c.get("factors", {}),
        }
    return out


def load_aeo_actions() -> list[dict]:
    p = ROOT / "data" / "aeo-citations" / "_actions.json"
    if not p.exists():
        return []
    return json.loads(p.read_text()).get("open_actions", [])


def load_aeo_trend() -> dict:
    p = ROOT / "data" / "aeo-citations" / "_trend.json"
    if not p.exists():
        return {"history": []}
    return json.loads(p.read_text())


def count_blog_spokes() -> dict[str, int]:
    """{city_slug: number of existing blog posts in /blog/{city_slug}/}"""
    blog_dir = ROOT / "blog"
    if not blog_dir.exists():
        return {}
    counts = {}
    for child in blog_dir.iterdir():
        if child.is_dir():
            counts[child.name] = sum(1 for f in child.iterdir() if f.suffix == ".html")
    return counts


def load_sitemap_freshness() -> dict[str, str]:
    """{url_path: lastmod_iso} — use to identify stale pages needing refresh."""
    p = ROOT / "sitemap.xml"
    if not p.exists():
        return {}
    out = {}
    try:
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        root = ET.parse(p).getroot()
        for url_elem in root.findall("sm:url", ns):
            loc = url_elem.findtext("sm:loc", "", ns) or ""
            lastmod = url_elem.findtext("sm:lastmod", "", ns) or ""
            path = re.sub(r"^https?://[^/]+", "", loc)
            if path:
                out[path] = lastmod
    except ET.ParseError:
        pass
    return out


def load_gsc_csv(path: Path) -> dict[str, dict]:
    """{url_path: {clicks, impressions, ctr, position}} from GSC Pages export."""
    out = {}
    if not path.exists():
        return out
    with path.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            url = (row.get("Top pages") or row.get("Page") or row.get("Top URL") or "").strip()
            if not url:
                continue
            path_only = re.sub(r"^https?://[^/]+", "", url)
            try:
                out[path_only] = {
                    "clicks": int(float(row.get("Clicks", 0) or 0)),
                    "impressions": int(float(row.get("Impressions", 0) or 0)),
                    "ctr": float(str(row.get("CTR", "0%")).rstrip("%")) / 100,
                    "position": float(row.get("Position", 0) or 0),
                }
            except (ValueError, TypeError):
                continue
    return out


def classify_page(url: str) -> str:
    """Bucket a URL by the namespace it already lives in.

    The site's own structure encodes the distinction that matters: /blog/utah/
    holds statewide informational posts, /blog/<city>/ holds city+service posts.
    That split is not cosmetic — measured 2026-08-07, statewide converts 26x
    better than city on the same domain.
    """
    path = re.sub(r"^https?://[^/]+", "", url).split("?")[0].split("#")[0]
    if path.startswith("/blog/utah/"):
        return "blog_statewide"
    if path.startswith("/blog/"):
        return "blog_city"
    if path.startswith("/locations/"):
        return "locations"
    if path.startswith("/pages/"):
        return "services"
    return "other"


def load_measured_ctr() -> dict:
    """Measured CTR per page class, from the SEO loop's committed snapshot.

    Reads data/seo/snapshots/<latest>.json, written daily by
    scripts/seo-snapshot.mjs. That replaces the manual --gsc-csv export for this
    purpose: the data is already in the repo, dated, and refreshed by CI.

    Uses the PAGE dimension deliberately. The query dimension is anonymised by
    Google for rare queries — it accounted for only 16% of this site's clicks —
    whereas the page dimension captured 100% of them.

    Returns available:false when there is no snapshot, or when the snapshot has
    no page dimension (written before that existed), or when a class has too
    little volume to judge. available:false means NOT MEASURED, never zero.
    """
    snap_dir = ROOT / "data" / "seo" / "snapshots"
    try:
        snaps = sorted(snap_dir.glob("*.json"))
    except OSError:
        return {"available": False, "reason": "no snapshot directory"}
    if not snaps:
        return {"available": False, "reason": "no snapshots yet"}

    latest = snaps[-1]
    try:
        gsc = json.loads(latest.read_text()).get("gsc", {})
    except (json.JSONDecodeError, OSError) as err:
        return {"available": False, "reason": f"unreadable snapshot: {err}"}

    if not gsc.get("available"):
        return {"available": False, "reason": f"GSC not measured in {latest.name}"}
    pages = gsc.get("top_pages")
    if not isinstance(pages, list):
        return {"available": False, "reason": f"{latest.name} predates the page dimension"}

    buckets: dict[str, dict] = {}
    for p in pages:
        cls = classify_page(p.get("page", ""))
        b = buckets.setdefault(cls, {"pages": 0, "impressions": 0, "clicks": 0})
        b["pages"] += 1
        b["impressions"] += p.get("impressions", 0)
        b["clicks"] += p.get("clicks", 0)
    for b in buckets.values():
        b["ctr"] = (b["clicks"] / b["impressions"]) if b["impressions"] else 0.0

    city, state = buckets.get("blog_city"), buckets.get("blog_statewide")
    # Both classes need enough impressions for the ratio to mean anything.
    if not city or not state or city["impressions"] < MIN_CLASS_IMPRESSIONS or state["impressions"] < MIN_CLASS_IMPRESSIONS:
        return {
            "available": False,
            "reason": "not enough volume in one of the blog classes to compare",
            "by_class": buckets,
            "source_path": str(latest.relative_to(ROOT)),
        }

    ratio = (city["ctr"] / state["ctr"]) if state["ctr"] else 1.0
    return {
        "available": True,
        "by_class": buckets,
        "blog_city": city,
        "blog_statewide": state,
        "city_vs_statewide_ratio": ratio,
        "statewide_multiple": (1.0 / ratio) if ratio else float("inf"),
        "window": gsc.get("window", {}),
        "source_path": str(latest.relative_to(ROOT)),
    }


def load_traffic_snapshot() -> dict:
    """Load the weekly-report snapshot. {city_slug: posthog_views}.

    Prefer data/traffic-snapshot.json when present; otherwise fall back to the
    latest committed weekly report so local ranking still has real conversion
    context when the private PostHog snapshot is absent.
    """
    p = ROOT / "data" / "traffic-snapshot.json"
    if not p.exists():
        reports = sorted((ROOT / "data" / "weekly-reports").glob("*.json"))
        if not reports:
            return {"available": False, "by_city": {}, "summary": {}}
        p = reports[-1]
    try:
        raw = json.loads(p.read_text())
        snap = raw.get("data", raw)
        by_city = {}
        for entry in snap.get("location_performance", []):
            by_city[entry["location"]] = entry["views"]
        for slug in snap.get("location_gaps", []):
            by_city.setdefault(slug, 0)
        return {
            "available": True,
            "by_city": by_city,
            "summary": snap.get("summary", {}),
            "top_pages": snap.get("top_pages", []),
            "generated_at": snap.get("generated_at", ""),
            "source_path": str(p.relative_to(ROOT)),
        }
    except (json.JSONDecodeError, KeyError):
        return {"available": False, "by_city": {}, "summary": {}}


def load_reddit_signals() -> dict[str, dict]:
    """{city_slug: {signal_count, avg_engagement, total_engagement, last_signal_date}}.
    Sub-neighborhoods (sugar-house, daybreak) roll up to their parent city."""
    p = ROOT / "data" / "reddit-signals-by-city.json"
    if not p.exists():
        return {}
    out = {}
    try:
        data = json.loads(p.read_text())
        # Sub-neighborhood → parent city rollup
        rollups = {"sugar-house": "salt-lake-city", "daybreak": "south-jordan"}
        for entry in data.get("by_city", []):
            slug = entry.get("city_slug", "")
            slug = rollups.get(slug, slug)
            if not slug:
                continue
            agg = out.setdefault(slug, {
                "signal_count": 0, "total_engagement": 0,
                "last_signal_date": "", "raw_labels": [],
            })
            agg["signal_count"] += entry.get("signal_count", 0)
            agg["total_engagement"] += entry.get("total_engagement", 0)
            agg["raw_labels"].append(entry.get("raw_label", ""))
            d = entry.get("last_signal_date", "")
            if d > agg["last_signal_date"]:
                agg["last_signal_date"] = d
        for slug, agg in out.items():
            agg["avg_engagement"] = round(agg["total_engagement"] / max(agg["signal_count"], 1), 1)
    except (json.JSONDecodeError, KeyError):
        pass
    return out


def load_city_coords() -> dict[str, tuple[float, float]]:
    """Extract city lat/lon from the location pages' LocalBusiness JSON-LD."""
    coords: dict[str, tuple[float, float]] = {}
    for path in (ROOT / "locations").glob("*.html"):
        text = path.read_text(errors="ignore")
        lat = re.search(r'"latitude"\s*:\s*([0-9.-]+)', text)
        lon = re.search(r'"longitude"\s*:\s*([0-9.-]+)', text)
        if lat and lon:
            coords[path.stem] = (float(lat.group(1)), float(lon.group(1)))
    return coords


def fetch_json(url: str, timeout: int = 12) -> Optional[dict]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": NWS_USER_AGENT,
            "Accept": "application/geo+json, application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def classify_weather_text(text: str, temperature: Optional[int] = None) -> Optional[str]:
    """Map NWS alert/forecast language to roofing-relevant hazard categories."""
    lower = text.lower()
    if "hail" in lower:
        return "hail"
    if "severe thunderstorm" in lower or "thunderstorm" in lower or "lightning" in lower:
        return "thunderstorm"
    if any(token in lower for token in ("high wind", "wind advisory", "wind warning", "windy", "strong wind")):
        return "wind"
    gusts = [int(n) for n in re.findall(r"gusts?\s+(?:as high as|to|near|up to)?\s*(\d+)\s*mph", lower)]
    if gusts and max(gusts) >= 30:
        return "wind"
    wind_ranges = [max(int(a), int(b)) for a, b in re.findall(r"wind\s+\d*\s*(\d+)\s*(?:to|-)\s*(\d+)\s*mph", lower)]
    if wind_ranges and max(wind_ranges) >= 25:
        return "wind"
    if any(token in lower for token in ("heavy rain", "excessive rainfall", "flood", "downpour")):
        return "heavy-rain"
    if any(token in lower for token in ("snow", "winter storm", "blizzard", "ice accumulation")):
        return "snow"
    if any(token in lower for token in ("freeze", "freezing", "frost", "ice storm")):
        return "freeze"
    if "heat advisory" in lower or "excessive heat" in lower or (temperature is not None and temperature >= 95):
        return "heat"
    return None


def weather_context_for(city_name: str, hazard: str, event: str, source: str, is_alert: bool) -> str:
    """Short model-safe hook. Avoid exact measurements so generated copy stays review-light."""
    if is_alert:
        return (
            f"Current NWS context for {city_name}: active {event}. "
            "Use this as a timely roof-readiness and inspection hook, but do not claim any specific home was damaged."
        )
    if hazard == "wind":
        return (
            f"Current NWS context for {city_name}: forecast includes gusty winds in the next few days. "
            "Use a wind-readiness angle around lifted shingles, ridge caps, flashing, and safe post-wind inspection."
        )
    if hazard == "hail":
        return (
            f"Current NWS context for {city_name}: forecast language includes hail/storm potential. "
            "Use a hail-readiness and damage-documentation angle without claiming hail has already hit the city."
        )
    if hazard == "thunderstorm":
        return (
            f"Current NWS context for {city_name}: forecast includes thunderstorm potential. "
            "Use a storm-readiness, leak-prevention, and post-storm inspection angle."
        )
    if hazard == "heavy-rain":
        return (
            f"Current NWS context for {city_name}: forecast includes rain that can expose roof leaks. "
            "Use a leak-prevention and gutter/drainage inspection angle."
        )
    if hazard == "snow":
        return (
            f"Current NWS context for {city_name}: forecast includes winter weather. "
            "Use an ice-dam, snow-load, ventilation, and eave-protection angle."
        )
    if hazard == "freeze":
        return (
            f"Current NWS context for {city_name}: forecast includes freeze-thaw conditions. "
            "Use a flashing, sealant, eave, and attic-ventilation inspection angle."
        )
    if hazard == "heat":
        return (
            f"Current NWS context for {city_name}: forecast includes hot weather. "
            "Use a UV aging, attic ventilation, shingle wear, and replacement-planning angle."
        )
    return ""


def empty_weather_signal(city_name: str) -> dict:
    return {
        "hazard": None,
        "event": "",
        "event_context": "",
        "source_url": "",
        "service_boosts": {},
        "score": 0.0,
        "city_name": city_name,
    }


def fetch_city_weather_signal(city_slug: str, city_name: str, coords: tuple[float, float]) -> dict:
    lat, lon = coords
    point = f"{lat:.4f},{lon:.4f}"

    alerts_url = f"https://api.weather.gov/alerts/active?point={point}"
    alerts = fetch_json(alerts_url)
    if alerts:
        severity_weight = {"Extreme": 1.0, "Severe": 0.85, "Moderate": 0.65, "Minor": 0.45, "Unknown": 0.35}
        best: Optional[dict] = None
        for feature in alerts.get("features", []):
            props = feature.get("properties", {})
            event = props.get("event") or "weather alert"
            text = " ".join(str(props.get(k) or "") for k in ("event", "headline", "description", "areaDesc"))
            hazard = classify_weather_text(text)
            if not hazard:
                continue
            score = severity_weight.get(props.get("severity", "Unknown"), 0.35)
            candidate = {
                "hazard": hazard,
                "event": event,
                "event_context": weather_context_for(city_name, hazard, event, alerts_url, is_alert=True),
                "source_url": props.get("@id") or feature.get("id") or alerts_url,
                "service_boosts": WEATHER_SERVICE_BOOSTS.get(hazard, {}),
                "score": score,
                "city_name": city_name,
            }
            if not best or candidate["score"] > best["score"]:
                best = candidate
        if best:
            return best

    point_meta = fetch_json(f"https://api.weather.gov/points/{point}")
    forecast_url = ((point_meta or {}).get("properties") or {}).get("forecast")
    if not forecast_url:
        return empty_weather_signal(city_name)

    forecast = fetch_json(forecast_url)
    periods = (((forecast or {}).get("properties") or {}).get("periods") or [])[:6]
    best = empty_weather_signal(city_name)
    hazard_score = {
        "hail": 0.65,
        "thunderstorm": 0.55,
        "wind": 0.5,
        "heavy-rain": 0.45,
        "snow": 0.45,
        "freeze": 0.35,
        "heat": 0.25,
    }
    for period in periods:
        text = " ".join(str(period.get(k) or "") for k in ("name", "shortForecast", "detailedForecast", "windSpeed"))
        hazard = classify_weather_text(text, period.get("temperature"))
        if not hazard:
            continue
        score = hazard_score.get(hazard, 0.2)
        if score > best["score"]:
            event = f"{period.get('name', 'upcoming')} {period.get('shortForecast', 'weather')}".strip()
            if hazard == "wind":
                event = "Gusty wind forecast"
            elif hazard == "hail":
                event = "Hail/storm forecast"
            elif hazard == "thunderstorm":
                event = "Thunderstorm forecast"
            elif hazard == "heavy-rain":
                event = "Heavy rain forecast"
            elif hazard == "snow":
                event = "Winter weather forecast"
            elif hazard == "freeze":
                event = "Freeze-thaw forecast"
            elif hazard == "heat":
                event = "Hot weather forecast"
            best = {
                "hazard": hazard,
                "event": event,
                "event_context": weather_context_for(city_name, hazard, event, forecast_url, is_alert=False),
                "source_url": forecast_url,
                "service_boosts": WEATHER_SERVICE_BOOSTS.get(hazard, {}),
                "score": score,
                "city_name": city_name,
            }
    return best


def load_weather_signals(
    market: dict[str, dict],
    cache_hours: int = 6,
    refresh: bool = False,
    enabled: bool = True,
) -> dict[str, dict]:
    """Live weather/current-event signals from the National Weather Service.

    The file is intentionally ignored by git. It gives Monday/Thursday cron runs
    a current hook without adding volatile API output to the repo.
    """
    if not enabled:
        return {}

    if WEATHER_SIGNAL_PATH.exists() and not refresh:
        try:
            cached = json.loads(WEATHER_SIGNAL_PATH.read_text())
            generated = datetime.fromisoformat(cached.get("generated_at", "").replace("Z", "+00:00"))
            if generated.tzinfo is None:
                generated = generated.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - generated <= timedelta(hours=cache_hours):
                return cached.get("by_city", {})
        except (json.JSONDecodeError, ValueError):
            pass

    coords = load_city_coords()
    by_city: dict[str, dict] = {}
    for city_slug, city_data in market.items():
        if city_slug not in coords:
            continue
        by_city[city_slug] = fetch_city_weather_signal(city_slug, city_data["name"], coords[city_slug])

    WEATHER_SIGNAL_PATH.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "https://api.weather.gov/",
        "by_city": by_city,
    }, indent=2))
    return by_city


def parse_iso_date(value: str) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value[:10]).date()
    except ValueError:
        return None


def load_recent_city_slugs(days: int) -> set[str]:
    """Cities drafted/published recently, used to keep Mon/Thu posts rotating."""
    if days <= 0:
        return set()
    cutoff = date.today() - timedelta(days=days)
    recent: set[str] = set()

    for path in (ROOT / "data" / "blog-pending").glob("*.json"):
        try:
            manifest = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        draft_date = parse_iso_date(str(manifest.get("draft_date") or ""))
        city = manifest.get("city_slug")
        if city and draft_date and draft_date >= cutoff:
            recent.add(city)

    for path in (ROOT / "blog").glob("*/*.html"):
        text = path.read_text(errors="ignore")
        match = re.search(r'"datePublished"\s*:\s*"([^"]+)"', text) or re.search(r'datetime="(\d{4}-\d{2}-\d{2})"', text)
        published = parse_iso_date(match.group(1) if match else "")
        if published and published >= cutoff:
            recent.add(path.parent.name)

    return recent


# ── Scoring ─────────────────────────────────────────────────────────
def days_since(iso_str: str) -> Optional[int]:
    if not iso_str:
        return None
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).days
    except ValueError:
        return None


def freshness_boost(days_old: Optional[int]) -> float:
    if days_old is None: return 1.0
    if days_old > 90: return 1.3
    if days_old > 60: return 1.2
    if days_old > 30: return 1.05
    return 1.0


def tier_multiplier(tier: int) -> float:
    return {1: 2.0, 2: 1.5, 3: 1.0, 4: 0.7}.get(tier, 1.0)


def aeo_leverage_match(query: str, city_name: str, service_name: str) -> float:
    """Match an AEO action query to a (city, service) pair → leverage boost 0.0-50.0+."""
    actions = load_aeo_actions()
    q_lower = query.lower() if query else ""
    boost = 0.0
    for a in actions:
        a_query = (a.get("query") or "").lower()
        if city_name.lower() in a_query and any(w.lower() in a_query for w in service_name.split()):
            boost = max(boost, a.get("leverage", 0) / 50.0)  # normalize 0-1
    return 1.0 + boost  # 1.0-2.0+ multiplier


def existing_post_for_target(city_slug: str, service_slug: str) -> Optional[str]:
    """Returns blog file path if a spoke already exists for this (city, service) pair."""
    blog_dir = ROOT / "blog" / city_slug
    if not blog_dir.exists():
        return None
    # Service keyword fragments that suggest a spoke exists
    service_keywords = {
        "storm-damage": ["storm-damage", "wind-damage", "hail"],
        "roof-replacement": ["replacement", "reroof", "rerooof"],
        "insurance-claims": ["insurance"],
        "roof-repair": ["repair", "leak"],
        "residential-roofing": ["residential", "designer", "shake"],
        "gutters": ["gutter"],
    }
    keys = service_keywords.get(service_slug, [service_slug])
    for f in blog_dir.glob("*.html"):
        name = f.stem.lower()
        if any(k in name for k in keys):
            return str(f.relative_to(ROOT))
    return None


def score_target(
    city_slug: str,
    city_data: dict,
    service: dict,
    blog_count: int,
    spoke_already_exists: bool,
    sitemap: dict,
    gsc: dict,
    posthog_views: int,
    reddit: dict,
    weather_signal: Optional[dict],
    measured_ctr: dict,
    include_saturated: bool = False,
) -> dict:
    """Return scoring breakdown for a (city, service) target.

    v1 scoring: whitespace × tier × storm × aeo × freshness × revenue × demand-supply gap.
    Demand-supply is the killer multiplier — high Reddit demand + low PostHog supply = top priority.

    v2 (2026-05-09): hard cap at MAX_SPOKES_PER_CITY. Beyond the cap, add-another-blog
    has lower marginal lift than internal-link cleanup + location-page deepening.
    """
    if spoke_already_exists:
        return {"score": 0.0, "skip_reason": "spoke already exists"}

    if blog_count >= MAX_SPOKES_PER_CITY and not include_saturated:
        return {
            "score": 0.0,
            "skip_reason": f"city saturated ({blog_count} spokes ≥ cap {MAX_SPOKES_PER_CITY}). "
                           "Improve existing spokes or deepen location page instead. "
                           "Override with --include-saturated for distinct-intent exceptions.",
        }

    # 1. Whitespace bias — fewer existing spokes = higher priority
    coverage_gap = 1.0 / (1.0 + blog_count)

    # 2. Tier multiplier from market-intel
    tier_mult = tier_multiplier(city_data.get("tier", 3))

    # 3. Storm-override boost (active May-Sept hail + Dec-Feb ice-dam)
    storm_mult = 1.3 if city_data.get("storm_override") else 1.0
    if city_data.get("storm_override") and service["slug"] in {"storm-damage", "roof-repair", "insurance-claims"}:
        storm_mult = 1.5

    # 4. AEO leverage boost
    aeo_mult = aeo_leverage_match("", city_data["name"], service["name"])

    # 5. Freshness boost — stale location page = blog refresh has more SEO lift
    loc_path = f"/locations/{city_slug}"
    loc_lastmod = sitemap.get(loc_path) or sitemap.get(loc_path + "/") or ""
    fresh_mult = freshness_boost(days_since(loc_lastmod))

    # 6. Revenue proxy — LSA $/mo allocation × service lead_value
    revenue_proxy = (city_data.get("allocation", 0) / 350.0) * (service["lead_value"] / 10.0)

    # 6b. Lead-conversion intent — emergency/high-ticket/claim-process content is
    # more likely to turn traffic into calls than broad informational roofing copy.
    lead_intent_mult = LEAD_INTENT_MULTIPLIER.get(service.get("intent"), 1.0)

    # 7. GSC traffic gap (only when CSV provided)
    #
    # NOTE (2026-08-07): this heuristic rewards exactly the band that is now
    # measured to produce nothing. Location pages at position 11-30 with 50+
    # impressions are pack-blocked: 7 of 8 city-service SERPs put a local pack
    # above every organic result, and Frame sits in the pack only near Heber
    # City. That whole band converted 13 clicks from 58,714 impressions (0.02%).
    # The measured-CTR multiplier below is the corrective; this one is kept
    # because a stale location page is still a real signal, but its boost is
    # capped well under the class penalty so it cannot outvote measurement.
    gsc_mult = 1.0
    gsc_data = gsc.get(loc_path) or gsc.get(loc_path + "/") or {}
    if gsc_data:
        position = gsc_data.get("position", 100)
        impressions = gsc_data.get("impressions", 0)
        if 11 <= position <= 30 and impressions >= 50:
            gsc_mult = 1.5
        elif 31 <= position <= 50 and impressions >= 30:
            gsc_mult = 1.2

    # 7b. ★ Measured CTR by page class — the correction for the above.
    #
    # Every target this script emits is a /blog/<city>/ post. That class is
    # measured at 0.050% CTR (37 pages -> 1 click) while /blog/utah/ statewide
    # posts run 1.294% (17 pages -> 20 clicks): a 26x gap, same site, same
    # authority, same pipeline. Ranking city targets against each other without
    # that context optimises the order of a losing move.
    #
    # available:false means NOT MEASURED and the multiplier stays 1.0 — the
    # script must not invent a penalty from a missing snapshot.
    class_ctr_mult = 1.0
    class_note = None
    if measured_ctr.get("available"):
        ratio = measured_ctr.get("city_vs_statewide_ratio")
        if ratio is not None and ratio < 1.0:
            # Scale by how the city-blog class actually converts relative to the
            # best-performing class, floored so a target never scores zero on
            # this alone — the human still sees it, ranked honestly.
            class_ctr_mult = max(CLASS_CTR_FLOOR, ratio)
            class_note = (
                f"/blog/<city>/ measured {measured_ctr['blog_city']['ctr'] * 100:.3f}% CTR vs "
                f"/blog/utah/ {measured_ctr['blog_statewide']['ctr'] * 100:.3f}% "
                f"({measured_ctr['statewide_multiple']:.0f}x better) — see docs/seo/UTAH-GROWTH-PLAN.md P4"
            )

    # 8. ★ Demand-supply gap (the v1 killer factor — uses live PostHog + Reddit)
    # Demand pulse from Reddit signals (with engagement weight)
    reddit_demand = 0.0
    if reddit:
        # Engagement-weighted: total_engagement / 50 = baseline demand units
        # 5 signals × 58 engagement = 292 → demand 5.84 (Salt Lake)
        # 9 signals × 12 engagement = 110 → demand 2.20 (Murray)
        reddit_demand = reddit.get("total_engagement", 0) / 50.0

    # Supply = current PostHog traffic (capped at 10 to prevent over-penalizing winners)
    supply = min(posthog_views, 10)

    # Gap factor: high demand / low supply = high opportunity
    # Bounded to [0.8, 3.0] so this multiplier is meaningful but not dominant
    demand_supply_gap = 1.0
    if reddit_demand > 0:
        # Cities with Reddit chatter but no/low PostHog traffic = priority
        ratio = reddit_demand / max(supply, 0.5)
        demand_supply_gap = max(0.8, min(3.0, 0.8 + (ratio * 0.4)))
    elif posthog_views == 0 and city_data.get("tier", 3) <= 2:
        # Tier 1/2 city with zero traffic and no Reddit signal = still whitespace, mild boost
        demand_supply_gap = 1.15

    # 9. Salt Lake depth penalty — SLC has 4+ existing spokes but is highly competitive.
    # Single-axis whitespace bias under-weights it. Carve out a "depth play" boost when
    # PostHog views > 5 AND Reddit demand > 3 AND existing spokes < 8 (not over-saturated).
    depth_play_mult = 1.0
    if posthog_views >= 5 and reddit_demand >= 3.0 and 3 <= blog_count <= 7:
        depth_play_mult = 1.6  # SLC, Heber, Bountiful currently fit this

    # 10. Weather/current-event alignment — live NWS alert/forecast context.
    # A storm signal should not crown a low-value city by itself; it should move
    # the *right service* up when the SEO/AEO and conversion fundamentals already fit.
    weather_event_mult = 1.0
    weather_hazard = None
    if weather_signal:
        weather_hazard = weather_signal.get("hazard")
        weather_event_mult = float((weather_signal.get("service_boosts") or {}).get(service["slug"], 1.0))

    score = (
        coverage_gap * 100
        * tier_mult
        * storm_mult
        * aeo_mult
        * fresh_mult
        * (1 + revenue_proxy)
        * lead_intent_mult
        * gsc_mult
        * class_ctr_mult
        * demand_supply_gap
        * depth_play_mult
        * weather_event_mult
    )

    return {
        "score": round(score, 2),
        "breakdown": {
            "coverage_gap": round(coverage_gap, 3),
            "tier_mult": tier_mult,
            "storm_mult": storm_mult,
            "aeo_mult": round(aeo_mult, 3),
            "fresh_mult": fresh_mult,
            "revenue_proxy": round(revenue_proxy, 3),
            "lead_intent_mult": lead_intent_mult,
            "gsc_mult": gsc_mult,
            "class_ctr_mult": class_ctr_mult,
            "class_note": class_note,
            "demand_supply_gap": round(demand_supply_gap, 3),
            "depth_play_mult": depth_play_mult,
            "weather_event_mult": round(weather_event_mult, 3),
        },
        "loc_lastmod_days": days_since(loc_lastmod),
        "posthog_views": posthog_views,
        "reddit_demand": round(reddit_demand, 2),
        "weather_hazard": weather_hazard,
        "gsc": gsc_data or None,
    }


def keyword_for(service_slug: str, city_slug: str, city_name: str, weather_signal: Optional[dict] = None) -> str:
    hazard = (weather_signal or {}).get("hazard")
    weather_template = WEATHER_KEYWORD_TEMPLATES.get(hazard or "", {}).get(service_slug)
    if weather_template:
        return weather_template.format(city=city_name, service=service_slug.replace("-", " "))
    template = KEYWORD_TEMPLATES.get(service_slug, {}).get(city_kind(city_slug), "{service} {city}")
    return template.format(city=city_name, service=service_slug.replace("-", " "))


# ── CLI ─────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--top", type=int, default=15, help="Show top N targets (default 15)")
    parser.add_argument("--gsc-csv", type=Path, default=None, help="Path to GSC Pages CSV export")
    parser.add_argument("--feed-blog-draft", action="store_true", help="Print the blog:draft command for #1")
    parser.add_argument("--json", action="store_true", help="Emit JSON to stdout")
    parser.add_argument("--include-existing", action="store_true", help="Include rows where a spoke already exists (for audit)")
    parser.add_argument("--include-saturated", action="store_true",
                        help=f"Include cities at the {MAX_SPOKES_PER_CITY}-spoke saturation cap (use only for distinct-intent exceptions)")
    parser.add_argument("--include-heber-valley-cluster", action="store_true",
                        help="Include Heber City/Midway/Wallsburg/Charleston/Daniel. Default excludes them so unattended blog drafts follow the Heber Valley umbrella rule in CLAUDE.md.")
    parser.add_argument("--exclude-recent-city-days", type=int, default=21,
                        help="Skip cities drafted/published in the last N days so Mon/Thu posts rotate markets (default 21; use 0 to disable)")
    parser.add_argument("--no-weather", action="store_true",
                        help="Disable live NWS weather/current-event scoring")
    parser.add_argument("--refresh-weather", action="store_true",
                        help="Ignore cached data/weather-event-signals.json and fetch fresh NWS signals")
    parser.add_argument("--weather-cache-hours", type=int, default=6,
                        help="Reuse cached weather signals for this many hours (default 6)")
    args = parser.parse_args()

    market = load_market_intel()
    if not market:
        sys.exit("ERROR: data/market-intel-allocation.json not found — run `npm run market-intel` first.")

    spokes = count_blog_spokes()
    sitemap = load_sitemap_freshness()
    gsc = load_gsc_csv(args.gsc_csv) if args.gsc_csv else {}
    traffic = load_traffic_snapshot()
    reddit = load_reddit_signals()
    weather = load_weather_signals(
        market,
        cache_hours=args.weather_cache_hours,
        refresh=args.refresh_weather,
        enabled=not args.no_weather,
    )
    recent_cities = load_recent_city_slugs(args.exclude_recent_city_days)

    if args.gsc_csv:
        print(f"# GSC: {len(gsc)} URL rows from {args.gsc_csv}", file=sys.stderr)
    if traffic.get("available"):
        s = traffic["summary"]
        source = traffic.get("source_path", "data/traffic-snapshot.json")
        print(f"# PostHog ({source}): {s.get('total_pageviews', 0)} pageviews · "
              f"{s.get('total_leads', 0)} lead records · "
              f"{s.get('total_calls', 0)} completed call events", file=sys.stderr)
    else:
        print(f"# PostHog snapshot missing — run scripts/refresh-traffic-snapshot.sh", file=sys.stderr)
    if reddit:
        print(f"# Reddit signals: {len(reddit)} cities with chatter (last 180d)", file=sys.stderr)
    if weather:
        active_weather = sum(1 for s in weather.values() if s.get("hazard"))
        print(f"# NWS weather/current-event signals: {active_weather}/{len(weather)} cities with roofing-relevant forecast/alert hooks", file=sys.stderr)
    if recent_cities:
        print(f"# Recent city rotation: skipping {len(recent_cities)} cities drafted/published in last {args.exclude_recent_city_days} days", file=sys.stderr)
    print(f"# Cities: {len(market)} | Existing spokes: {sum(spokes.values())} blog posts across {len(spokes)} cities", file=sys.stderr)
    print(f"# AEO actions open: {len(load_aeo_actions())}", file=sys.stderr)

    # Measured CTR by page class. Printed before the table, loudly, because it
    # is the single fact most likely to make the whole ranking the wrong thing
    # to act on: every target below is a /blog/<city>/ post.
    measured_ctr = load_measured_ctr()
    if measured_ctr.get("available"):
        c, s = measured_ctr["blog_city"], measured_ctr["blog_statewide"]
        win = measured_ctr["window"]
        print(
            f"# MEASURED CTR ({measured_ctr['source_path']}"
            + (f", {win.get('startDate')} → {win.get('endDate')}" if win else "")
            + "):",
            file=sys.stderr,
        )
        print(
            f"#   /blog/<city>/  {c['pages']:>3} pages  {c['impressions']:>6} impr  {c['clicks']:>3} clicks  {c['ctr'] * 100:.3f}%",
            file=sys.stderr,
        )
        print(
            f"#   /blog/utah/    {s['pages']:>3} pages  {s['impressions']:>6} impr  {s['clicks']:>3} clicks  {s['ctr'] * 100:.3f}%"
            f"   <== {measured_ctr['statewide_multiple']:.0f}x better",
            file=sys.stderr,
        )
        print(
            f"#   Every target below is a /blog/<city>/ post and is scaled by x{max(CLASS_CTR_FLOOR, measured_ctr['city_vs_statewide_ratio']):.2f}.",
            file=sys.stderr,
        )
        print(
            "#   City+service queries are local-pack blocked — see docs/seo/UTAH-GROWTH-PLAN.md P4.",
            file=sys.stderr,
        )
        print(
            "#   If the top score here is low, the right move is a STATEWIDE /blog/utah/ topic, not the #1 city row.",
            file=sys.stderr,
        )
        # Print the alternative axis, not just a warning about this one. A
        # demoted class with nothing to switch to still leaves the operator
        # picking the best of a losing format.
        gaps = statewide_gaps()
        if gaps:
            print("#", file=sys.stderr)
            print(
                f"#   ══ STATEWIDE GAPS — {len(gaps)} uncovered /blog/utah/ topics, "
                f"Utah volume measured 2026-08-07 ══",
                file=sys.stderr,
            )
            for t in gaps[:6]:
                vol = f"{t['utah_volume']}/mo" if t["utah_volume"] else "long-tail"
                print(f"#     {vol:>10}  {t['kind']:<10}  {t['keyword']}", file=sys.stderr)
            print(
                f"#   Prefer these over the city table below while the class gap holds "
                f"({measured_ctr['statewide_multiple']:.0f}x).",
                file=sys.stderr,
            )
            print(
                "#   Head-term volume ranks this list but does not cap it — the two posts that "
                "convert report ZERO exact-match volume and still earned 982 impressions.",
                file=sys.stderr,
            )
    else:
        # Not measured stays not measured, in those words.
        print(f"# Measured CTR by page class: NOT MEASURED ({measured_ctr.get('reason', 'unavailable')})", file=sys.stderr)
        print("#   Scoring falls back to the pre-2026-08-07 heuristics.", file=sys.stderr)

    targets = []
    for city_slug, city_data in market.items():
        if city_slug in HEBER_VALLEY_CLUSTER and not args.include_heber_valley_cluster:
            continue
        if city_slug in recent_cities:
            continue
        blog_count = spokes.get(city_slug, 0)
        posthog_views = traffic.get("by_city", {}).get(city_slug, 0)
        reddit_data = reddit.get(city_slug, {})
        weather_signal = weather.get(city_slug, {})
        for service in SERVICES:
            existing = existing_post_for_target(city_slug, service["slug"])
            spoke_exists = existing is not None
            if spoke_exists and not args.include_existing:
                continue
            scoring = score_target(
                city_slug, city_data, service, blog_count, spoke_exists,
                sitemap, gsc, posthog_views, reddit_data,
                weather_signal, measured_ctr,
                include_saturated=args.include_saturated,
            )
            # Skip zero-score rows unless --include-existing or --include-saturated requested an audit
            if scoring["score"] == 0 and not (args.include_existing or args.include_saturated):
                continue
            targets.append({
                "city_slug": city_slug,
                "city_name": city_data["name"],
                "service_slug": service["slug"],
                "service_name": service["name"],
                "keyword": keyword_for(service["slug"], city_slug, city_data["name"], weather_signal),
                "tier": city_data["tier"],
                "blog_spokes_in_city": blog_count,
                "storm_override": city_data["storm_override"],
                "lsa_allocation": city_data["allocation"],
                "score": scoring["score"],
                "breakdown": scoring.get("breakdown", {}),
                "existing_post": existing,
                "loc_page_age_days": scoring.get("loc_lastmod_days"),
                "posthog_views_90d": scoring.get("posthog_views"),
                "reddit_demand": scoring.get("reddit_demand"),
                "weather_event": {
                    "hazard": (weather_signal or {}).get("hazard"),
                    "event": (weather_signal or {}).get("event"),
                    "event_context": (weather_signal or {}).get("event_context"),
                    "source_url": (weather_signal or {}).get("source_url"),
                } if weather_signal and weather_signal.get("hazard") else None,
                "gsc": scoring.get("gsc"),
            })

    targets.sort(key=lambda t: t["score"], reverse=True)

    # Put the statewide axis into the SAME ranking, not just a stderr note.
    # The automation consumes `--json --top 1`; an advisory printed alongside a
    # city-only list would have left the twice-weekly job producing exactly the
    # format measured at 0.050% CTR.
    best_city_score = targets[0]["score"] if targets else 0.0
    sw = statewide_targets(measured_ctr, best_city_score)
    if sw:
        print(
            f"# Statewide axis: {len(sw)} uncovered topics injected into the ranking, "
            f"led by \"{sw[0]['keyword']}\" (score {sw[0]['score']} vs best city {best_city_score}).",
            file=sys.stderr,
        )
        print(f"#   basis: {sw[0]['measured_basis']}", file=sys.stderr)
        targets.extend(sw)
        targets.sort(key=lambda t: t["score"], reverse=True)

    top = targets[: args.top]

    if args.json:
        print(json.dumps({"generated_at": date.today().isoformat(), "top": top, "total_targets": len(targets)}, indent=2))
        return

    if args.feed_blog_draft:
        if not top:
            sys.exit("No targets — all (city, service) combinations already have spokes.")
        t = top[0]
        event = t.get("weather_event") or {}
        event_args = ""
        if event.get("event_context"):
            event_args = " " + shlex.join([
                "--event-context", event["event_context"],
                "--event-source-url", event.get("source_url", ""),
            ])
        cmd = (
            f'cd {shlex.quote(str(ROOT))} && '
            f'npm run blog:draft -- '
            f'--keyword "{t["keyword"]}" '
            f'--city {t["city_slug"]} '
            f'--style {"storm" if t["service_slug"] in {"storm-damage","roof-repair","insurance-claims"} else "atmospheric"}'
            f'{event_args}'
        )
        print(f"# Top target: {t['city_name']} × {t['service_name']} (score {t['score']})")
        print(f"# Why: tier {t['tier']}, {t['blog_spokes_in_city']} existing spokes, storm-override={t['storm_override']}, ${t['lsa_allocation']}/mo allocation")
        if event.get("hazard"):
            print(f"# Weather/current hook: {event.get('hazard')} · {event.get('event')}")
        print()
        print(cmd)
        return

    # ── Strategic-axis highlights (best pick per axis) ─────────────
    def best_by(filter_fn) -> Optional[dict]:
        eligible = [t for t in targets if filter_fn(t)]
        return eligible[0] if eligible else None

    # Whitespace play: Tier 1/2 city with 0 spokes + 0 PostHog traffic
    whitespace_pick = best_by(lambda t: t["blog_spokes_in_city"] == 0
                              and t["tier"] <= 2
                              and (t.get("posthog_views_90d", 0) or 0) <= 1)
    # Demand-led play: city with Reddit signal but low/zero PostHog traffic
    demand_pick = best_by(lambda t: (t.get("reddit_demand", 0) or 0) >= 1.5
                          and (t.get("posthog_views_90d", 0) or 0) <= 1
                          and t["blog_spokes_in_city"] <= 2)
    # Depth play: city with existing traffic + Reddit demand, untapped service
    depth_pick = best_by(lambda t: (t.get("posthog_views_90d", 0) or 0) >= 5
                         and (t.get("reddit_demand", 0) or 0) >= 3.0
                         and 3 <= t["blog_spokes_in_city"] <= 7)

    print()
    print("═══ STRATEGIC AXIS PICKS ═══")
    print()
    if whitespace_pick:
        w = whitespace_pick
        print(f"  📍 WHITESPACE  →  {w['city_name']} × {w['service_name']}  (score {w['score']})")
        print(f"      Tier {w['tier']}, {w['blog_spokes_in_city']} existing spokes, {w.get('posthog_views_90d', 0)} pageviews/90d, ${w['lsa_allocation']}/mo allocation")
        print(f"      Why: pure coverage gap in a paid-priority market. Easiest ranking win.")
    if demand_pick:
        d = demand_pick
        print()
        print(f"  🔥 DEMAND-LED  →  {d['city_name']} × {d['service_name']}  (score {d['score']})")
        print(f"      Reddit demand: {d.get('reddit_demand', 0)}  ·  PostHog views: {d.get('posthog_views_90d', 0)}  ·  spokes: {d['blog_spokes_in_city']}")
        print(f"      Why: people are talking on Reddit but Frame isn't capturing it. Demand > supply.")
    if depth_pick:
        dp = depth_pick
        print()
        print(f"  🎯 DEPTH PLAY  →  {dp['city_name']} × {dp['service_name']}  (score {dp['score']})")
        print(f"      Existing traffic: {dp.get('posthog_views_90d', 0)} views/90d  ·  Reddit demand: {dp.get('reddit_demand', 0)}  ·  {dp['blog_spokes_in_city']} spokes")
        print(f"      Why: city is already converting; this service angle is the missing spoke.")

    # ── Full ranked table ───────────────────────────────────────────
    print()
    print("═══ FULL RANKING (all axes blended) ═══")
    print()
    print(f"{'#':<3} {'CITY':<22} {'SERVICE':<22} {'SCORE':>7} {'SPOK':>4} {'T':>2} {'ST':>3} {'PV':>4} {'RD':>5} {'WX':>6}")
    print("─" * 86)
    for i, t in enumerate(top, 1):
        storm = "✓" if t["storm_override"] else " "
        pv = t.get("posthog_views_90d", 0) or 0
        rd = t.get("reddit_demand", 0) or 0
        wx = ((t.get("weather_event") or {}).get("hazard") or "—")[:6]
        print(
            f"{i:<3} "
            f"{t['city_name']:<22} "
            f"{t['service_name']:<22} "
            f"{t['score']:>7.1f} "
            f"{t['blog_spokes_in_city']:>4} "
            f"{t['tier']:>2} "
            f"{storm:>3} "
            f"{pv:>4} "
            f"{rd:>5.1f} "
            f"{wx:>6}"
        )
    print()
    print("  Legend: SCORE=composite · SPOK=existing blog spokes in city · T=tier · ST=storm-override")
    print("          PV=PostHog /locations/{city} pageviews · RD=Reddit demand (engagement/50) · WX=NWS hook")
    print()
    if top:
        t1 = top[0]
        print(f"Top pick keyword: \033[1m{t1['keyword']}\033[0m  (city: {t1['city_slug']}, score {t1['score']})")
        bd = t1.get("breakdown", {})
        if bd.get("demand_supply_gap", 1.0) > 1.2:
            print(f"  ⚡ demand-supply gap: {bd['demand_supply_gap']}x  (Reddit chatter > current traffic)")
        if bd.get("depth_play_mult", 1.0) > 1.0:
            print(f"  ⚡ depth-play boost: {bd['depth_play_mult']}x  (existing traffic + Reddit demand, untapped service)")
        if bd.get("weather_event_mult", 1.0) > 1.0:
            event = t1.get("weather_event") or {}
            print(f"  ⚡ weather/current-event boost: {bd['weather_event_mult']}x  ({event.get('hazard')} · {event.get('event')})")
    print(f"\nRun: python3 scripts/blog-target-prioritizer.py --feed-blog-draft   ← prints the npm command")
    print()
    if not traffic.get("available"):
        print("💡 Refresh live traffic: bash scripts/refresh-traffic-snapshot.sh")
    if not gsc:
        print("💡 For GSC clicks/position layer: export Pages CSV from search-console → --gsc-csv <path>")


if __name__ == "__main__":
    main()
