#!/usr/bin/env python3
"""
Frame Roofing Utah — Blog Target Prioritizer

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
import re
import sys
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent

# ── Service catalog (must match the Frame service-page slugs) ───────
SERVICES = [
    {"slug": "storm-damage", "name": "Storm Damage", "lead_value": 9, "intent": "emergency"},
    {"slug": "roof-replacement", "name": "Roof Replacement", "lead_value": 10, "intent": "high-ticket"},
    {"slug": "insurance-claims", "name": "Insurance Claims", "lead_value": 9, "intent": "claim-process"},
    {"slug": "roof-repair", "name": "Roof Repair", "lead_value": 6, "intent": "transactional"},
    {"slug": "residential-roofing", "name": "Residential Roofing", "lead_value": 7, "intent": "informational"},
    {"slug": "gutters", "name": "Gutters", "lead_value": 4, "intent": "transactional"},
]

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
        "valley":   "roof replacement cost {city}",
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


def load_traffic_snapshot() -> dict:
    """Load the weekly-report snapshot. {city_slug: posthog_views}."""
    p = ROOT / "data" / "traffic-snapshot.json"
    if not p.exists():
        return {"available": False, "by_city": {}, "summary": {}}
    try:
        snap = json.loads(p.read_text())
        by_city = {}
        for entry in snap.get("location_performance", []):
            by_city[entry["location"]] = entry["views"]
        for slug in snap.get("location_gaps", []):
            by_city[slug] = 0
        return {
            "available": True,
            "by_city": by_city,
            "summary": snap.get("summary", {}),
            "top_pages": snap.get("top_pages", []),
            "generated_at": snap.get("generated_at", ""),
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
) -> dict:
    """Return scoring breakdown for a (city, service) target.

    v1 scoring: whitespace × tier × storm × aeo × freshness × revenue × demand-supply gap.
    Demand-supply is the killer multiplier — high Reddit demand + low PostHog supply = top priority.
    """
    if spoke_already_exists:
        return {"score": 0.0, "skip_reason": "spoke already exists"}

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

    # 7. GSC traffic gap (only when CSV provided)
    gsc_mult = 1.0
    gsc_data = gsc.get(loc_path) or gsc.get(loc_path + "/") or {}
    if gsc_data:
        position = gsc_data.get("position", 100)
        impressions = gsc_data.get("impressions", 0)
        if 11 <= position <= 30 and impressions >= 50:
            gsc_mult = 1.5
        elif 31 <= position <= 50 and impressions >= 30:
            gsc_mult = 1.2

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

    score = (
        coverage_gap * 100
        * tier_mult
        * storm_mult
        * aeo_mult
        * fresh_mult
        * (1 + revenue_proxy)
        * gsc_mult
        * demand_supply_gap
        * depth_play_mult
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
            "gsc_mult": gsc_mult,
            "demand_supply_gap": round(demand_supply_gap, 3),
            "depth_play_mult": depth_play_mult,
        },
        "loc_lastmod_days": days_since(loc_lastmod),
        "posthog_views": posthog_views,
        "reddit_demand": round(reddit_demand, 2),
        "gsc": gsc_data or None,
    }


def keyword_for(service_slug: str, city_slug: str, city_name: str) -> str:
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
    args = parser.parse_args()

    market = load_market_intel()
    if not market:
        sys.exit("ERROR: data/market-intel-allocation.json not found — run `npm run market-intel` first.")

    spokes = count_blog_spokes()
    sitemap = load_sitemap_freshness()
    gsc = load_gsc_csv(args.gsc_csv) if args.gsc_csv else {}
    traffic = load_traffic_snapshot()
    reddit = load_reddit_signals()

    if args.gsc_csv:
        print(f"# GSC: {len(gsc)} URL rows from {args.gsc_csv}", file=sys.stderr)
    if traffic.get("available"):
        s = traffic["summary"]
        print(f"# PostHog (live, last 90d): {s.get('total_pageviews', 0)} pageviews · "
              f"{s.get('total_leads', 0)} leads · {s.get('total_calls', 0)} calls · "
              f"{s.get('conversion_rate_pct', 0)}% conv", file=sys.stderr)
    else:
        print(f"# PostHog snapshot missing — run scripts/refresh-traffic-snapshot.sh", file=sys.stderr)
    if reddit:
        print(f"# Reddit signals: {len(reddit)} cities with chatter (last 180d)", file=sys.stderr)
    print(f"# Cities: {len(market)} | Existing spokes: {sum(spokes.values())} blog posts across {len(spokes)} cities", file=sys.stderr)
    print(f"# AEO actions open: {len(load_aeo_actions())}", file=sys.stderr)

    targets = []
    for city_slug, city_data in market.items():
        blog_count = spokes.get(city_slug, 0)
        posthog_views = traffic.get("by_city", {}).get(city_slug, 0)
        reddit_data = reddit.get(city_slug, {})
        for service in SERVICES:
            existing = existing_post_for_target(city_slug, service["slug"])
            spoke_exists = existing is not None
            if spoke_exists and not args.include_existing:
                continue
            scoring = score_target(
                city_slug, city_data, service, blog_count, spoke_exists,
                sitemap, gsc, posthog_views, reddit_data,
            )
            if scoring["score"] == 0 and not args.include_existing:
                continue
            targets.append({
                "city_slug": city_slug,
                "city_name": city_data["name"],
                "service_slug": service["slug"],
                "service_name": service["name"],
                "keyword": keyword_for(service["slug"], city_slug, city_data["name"]),
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
                "gsc": scoring.get("gsc"),
            })

    targets.sort(key=lambda t: t["score"], reverse=True)
    top = targets[: args.top]

    if args.json:
        print(json.dumps({"generated_at": date.today().isoformat(), "top": top, "total_targets": len(targets)}, indent=2))
        return

    if args.feed_blog_draft:
        if not top:
            sys.exit("No targets — all (city, service) combinations already have spokes.")
        t = top[0]
        cmd = (
            f'cd ~/projects/frame-restoration-utah && '
            f'npm run blog:draft -- '
            f'--keyword "{t["keyword"]}" '
            f'--city {t["city_slug"]} '
            f'--style {"storm" if t["service_slug"] in {"storm-damage","roof-repair","insurance-claims"} else "atmospheric"}'
        )
        print(f"# Top target: {t['city_name']} × {t['service_name']} (score {t['score']})")
        print(f"# Why: tier {t['tier']}, {t['blog_spokes_in_city']} existing spokes, storm-override={t['storm_override']}, ${t['lsa_allocation']}/mo allocation")
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
    print(f"{'#':<3} {'CITY':<22} {'SERVICE':<22} {'SCORE':>7} {'SPOK':>4} {'T':>2} {'ST':>3} {'PV':>4} {'RD':>5}")
    print("─" * 78)
    for i, t in enumerate(top, 1):
        storm = "✓" if t["storm_override"] else " "
        pv = t.get("posthog_views_90d", 0) or 0
        rd = t.get("reddit_demand", 0) or 0
        print(
            f"{i:<3} "
            f"{t['city_name']:<22} "
            f"{t['service_name']:<22} "
            f"{t['score']:>7.1f} "
            f"{t['blog_spokes_in_city']:>4} "
            f"{t['tier']:>2} "
            f"{storm:>3} "
            f"{pv:>4} "
            f"{rd:>5.1f}"
        )
    print()
    print("  Legend: SCORE=composite · SPOK=existing blog spokes in city · T=tier · ST=storm-override")
    print("          PV=PostHog /locations/{city} pageviews (90d) · RD=Reddit demand (engagement/50)")
    print()
    if top:
        t1 = top[0]
        print(f"Top pick keyword: \033[1m{t1['keyword']}\033[0m  (city: {t1['city_slug']}, score {t1['score']})")
        bd = t1.get("breakdown", {})
        if bd.get("demand_supply_gap", 1.0) > 1.2:
            print(f"  ⚡ demand-supply gap: {bd['demand_supply_gap']}x  (Reddit chatter > current traffic)")
        if bd.get("depth_play_mult", 1.0) > 1.0:
            print(f"  ⚡ depth-play boost: {bd['depth_play_mult']}x  (existing traffic + Reddit demand, untapped service)")
    print(f"\nRun: python3 scripts/blog-target-prioritizer.py --feed-blog-draft   ← prints the npm command")
    print()
    if not traffic.get("available"):
        print("💡 Refresh live traffic: bash scripts/refresh-traffic-snapshot.sh")
    if not gsc:
        print("💡 For GSC clicks/position layer: export Pages CSV from search-console → --gsc-csv <path>")


if __name__ == "__main__":
    main()
