#!/usr/bin/env python3
"""blog-autobrief.py — turn the prioritizer's top target into a draft brief.

The autonomous-cloud piece: the interactive flow has a human supply city-true
facts in a brief; this generates a safe brief automatically from the weather+
tracking target so the GitHub Actions runner can draft with no human in the loop.
Facts are deliberately conservative (a verifiability instruction + only the
credentials that are always true) — the OpenRouter model fills locally-accurate
prose, and the HARD compliance fence in blog-publish.py is the backstop.

Usage:
  python3 scripts/blog-target-prioritizer.py --json --top 1 --exclude-recent-city-days 21 > target.json
  python3 scripts/blog-autobrief.py --from-prioritizer target.json --out brief.json
"""
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BENCHMARK_FILE = ROOT / "data" / "blog-quality-benchmark.json"


def load_quality_target() -> dict:
    """The traction-derived bar the new post must match or beat (written by
    scripts/blog-enhancer.py from the current champion). Absent -> {} and the
    drafter just uses its static spec."""
    try:
        bm = json.loads(BENCHMARK_FILE.read_text())
    except Exception:
        return {}
    t = bm.get("target", {})
    if not t:
        return {}
    champ = bm.get("champion", {})
    winning = bm.get("winning", {})
    return {
        "champion_slug": champ.get("slug"),
        "champion_title": champ.get("title"),
        # Clamp to what the SYSTEM prompt + available link tokens can actually
        # deliver, so the injected "beat the champion" ask never contradicts the
        # drafter's own spec (SYSTEM caps ~7-8 H2s, provides ~3 link tokens) or
        # asks for an absurd number when a legacy long-form post is the champion.
        "min_words": min(int(t.get("words") or 0), 2600),
        "min_h2": min(int(t.get("h2") or 0), 8),
        "min_faqs": min(int(t.get("faqs") or 0), 5),
        "min_sources": min(int(t.get("sources") or 0), 5),
        "min_internal_links": min(int(t.get("internal_links") or 0), 3),
        "hard_floor": bm.get("floor", {}),
        "winning_cities": [c.get("key") for c in winning.get("cities", [])][:3],
    }

STORM_SERVICES = {"storm-damage", "roof-repair", "insurance-claims"}

STORM_LINKS = [
    "/pages/storm-damage|storm damage repair",
    "/pages/emergency-tarping|emergency tarping services",
    "/pages/insurance-claims|insurance claim documentation",
    "/pages/about|Utah Division of Professional Licensing",
]
GENERAL_LINKS = [
    "/pages/roof-replacement|full roof replacement services",
    "/pages/residential-roofing|residential roofing",
    "/pages/storm-damage|storm damage repair",
    "/pages/about|Utah Division of Professional Licensing",
]

# Always-true credentials (safe to assert on every post).
CREDENTIAL_FACT = ("Frame Restoration Utah is Licensed & Insured in Utah, BBB Accredited (A+), "
                   "offers a 10-year workmanship warranty, provides free no-obligation inspections, "
                   "dispatches 24/7 storm response, and works to IRC R905 standards under a Utah "
                   "DOPL contractor license.")


def brief_from_target(t: dict) -> dict:
    service_slug = t.get("service_slug") or "roof-replacement"
    style = "storm" if service_slug in STORM_SERVICES else "atmospheric"
    city = t.get("city_name") or t.get("city_slug", "").replace("-", " ").title()
    wx = t.get("weather_event") or {}
    weather_hook = (wx.get("event_context")
                    or f"Current Wasatch Front seasonal conditions relevant to {t.get('service_name','roofing')}.")

    # Statewide targets (axis=statewide, city_slug="utah") are NOT a city. The
    # city-shaped fact list would assert "Utah is a city in Utah" and instruct
    # the writer to describe its housing stock and geography as a town's — a
    # fabrication in the brief itself, before a word is drafted.
    if t.get("axis") == "statewide" or t.get("city_slug") == "utah":
        topic = t.get("keyword", "roofing")
        return {
            "city_slug": "utah",
            "city_name": "Utah",
            "zip": "",
            "service_slug": service_slug,
            "service_name": t.get("service_name", "Guide"),
            "style": "atmospheric",
            "keyword": topic,
            "weather_hook": "",
            "scope": "statewide",
            "facts": [
                "This is a STATEWIDE Utah guide, not a city page. Do not write about one town, do "
                "not name a single city as the subject, and do not imply a service-area boundary.",
                (f"Answer the question '{topic}' directly and early — this topic is chosen because "
                 "statewide informational posts are the only format on this site with a measured "
                 "click-through rate. Lead with the answer, then the reasoning."),
                ("Ground it in conditions that genuinely apply across Utah: high-desert UV and "
                 "temperature swing, snow load at elevation, ice damming, spring hail along the "
                 "Wasatch Front. Do NOT fabricate statistics, prices, dollar ranges, award or "
                 "certification claims, review counts, years-in-business, or any numeric claim you "
                 "cannot support."),
                CREDENTIAL_FACT,
            ],
            "internal_links": GENERAL_LINKS,
        }

    return {
        "city_slug": t["city_slug"],
        "city_name": city,
        "zip": "",
        "service_slug": service_slug,
        "service_name": t.get("service_name", "Roofing"),
        "style": style,
        "keyword": t["keyword"],
        "weather_hook": weather_hook,
        "facts": [
            f"{city} is a city in Utah along the Wasatch Front / Salt Lake or Utah Valley area.",
            (f"Write locally-specific, accurate content for {city}: use widely-known, verifiable "
             "facts about its location, notable geography, climate, and typical housing stock, "
             "drawing on well-established knowledge. Do NOT fabricate statistics, prices, dollar "
             "ranges, award/certification claims, review counts, years-in-business, or any specific "
             "numeric claim you cannot support."),
            weather_hook,
            f"Frame the post around the '{t.get('service_name','roofing')}' service for {city}.",
            CREDENTIAL_FACT,
        ],
        "internal_links": STORM_LINKS if style == "storm" else GENERAL_LINKS,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-prioritizer", required=True,
                    help="JSON file from blog-target-prioritizer.py --json (uses top[0]).")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    data = json.loads(pathlib.Path(args.from_prioritizer).read_text())
    top = data.get("top", [])
    if not top:
        sys.exit("blog-autobrief: prioritizer returned no targets (nothing to draft this run)")
    brief = brief_from_target(top[0])
    quality_target = load_quality_target()
    if quality_target:
        brief["quality_target"] = quality_target
    pathlib.Path(args.out).write_text(json.dumps(brief, indent=2) + "\n")
    print(f"autobrief -> {args.out}: {brief['city_name']} × {brief['service_name']} "
          f"(keyword: {brief['keyword']})")


if __name__ == "__main__":
    main()
