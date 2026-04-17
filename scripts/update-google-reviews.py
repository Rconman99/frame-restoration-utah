#!/usr/bin/env python3
"""Update Google review count + rating across the site.

Hits SerpAPI's Google Maps engine to pull Frame Roofing Utah's current
review count and rating, then regex-updates every live reference in
index.html and pages/about.html.

Environment:
  SERPAPI_KEY       (required) — SerpAPI private key
  SERPAPI_DATA_ID   (optional) — Google Maps data_id override; defaults to
                                 Frame's: 0x874df59069be3e09:0x756332595f702acc

Exit codes:
  0 = files updated (changed count or rating)
  2 = no change (live count matches file count — don't commit)
  1 = error (API, parsing, env)
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIT_LOG = ROOT / "data" / "google-reviews.json"

# Frame Roofing Utah's stable Google Maps data_id — more reliable than text search.
DEFAULT_DATA_ID = "0x874df59069be3e09:0x756332595f702acc"

# Files that contain live-user-facing review references.
TARGETS = [
    ROOT / "index.html",
    ROOT / "pages" / "about.html",
]


def fetch_place() -> dict:
    """Call SerpAPI's Google Maps engine for review count + rating."""
    api_key = os.environ.get("SERPAPI_KEY")
    data_id = os.environ.get("SERPAPI_DATA_ID", DEFAULT_DATA_ID)
    if not api_key:
        raise SystemExit("ERROR: set SERPAPI_KEY")

    # SerpAPI requires `q` even when data_id is provided; data_id pins the result
    # to Frame specifically, so the query string is just a search hint.
    params = urllib.parse.urlencode({
        "engine": "google_maps",
        "q": "Frame Roofing Utah Heber City",
        "data_id": data_id,
        "api_key": api_key,
    })
    url = f"https://serpapi.com/search.json?{params}"
    with urllib.request.urlopen(url, timeout=15) as resp:
        data = json.loads(resp.read())

    if "error" in data:
        raise SystemExit(f"ERROR: SerpAPI: {data['error']}")

    place = data.get("place_results") or {}
    if not place:
        locals_ = data.get("local_results") or []
        place = locals_[0] if locals_ else {}
    if not place or "reviews" not in place:
        raise SystemExit(f"ERROR: no place data returned for data_id={data_id}")

    return {
        "name": place.get("title", ""),
        "count": int(place["reviews"]),
        "rating": float(place["rating"]),
        "place_id": place.get("place_id", ""),
    }


def update_file(path: Path, count: int, rating: float, dry_run: bool) -> bool:
    """Rewrite review references in one HTML file. Returns True if changed."""
    text = path.read_text(encoding="utf-8")
    original = text

    # Schema reviewCount (unique to AggregateRating; Reviews don't have this field)
    text = re.sub(r'("reviewCount":\s*")\d+(")', rf'\g<1>{count}\g<2>', text)

    # Hero subtitle: "19 five-star reviews and counting"
    text = re.sub(r'\d+ five-star reviews and counting',
                  f'{count} five-star reviews and counting', text)

    # Link text: "See All 19 Google Reviews"
    text = re.sub(r'See All \d+ Google Reviews',
                  f'See All {count} Google Reviews', text)

    # AggregateRating ratingValue — contextual match so we don't touch individual
    # Review blocks (which also have ratingValue but shouldn't change).
    rating_str = f"{rating:.1f}"
    text = re.sub(
        r'("@type":\s*"AggregateRating"[\s\S]{0,200}?"ratingValue":\s*")[^"]+(")',
        rf'\g<1>{rating_str}\g<2>',
        text,
    )

    if text == original:
        return False
    if not dry_run:
        path.write_text(text, encoding="utf-8")
    return True


def current_file_count() -> int | None:
    """Read current reviewCount from index.html so GitHub Action can skip commit if unchanged."""
    try:
        text = (ROOT / "index.html").read_text(encoding="utf-8")
        m = re.search(r'"reviewCount":\s*"(\d+)"', text)
        return int(m.group(1)) if m else None
    except OSError:
        return None


def write_audit(data: dict) -> None:
    AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
    log = []
    if AUDIT_LOG.exists():
        try:
            log = json.loads(AUDIT_LOG.read_text())
            if not isinstance(log, list):
                log = []
        except json.JSONDecodeError:
            log = []
    log.append({"at": datetime.utcnow().isoformat() + "Z", **data})
    AUDIT_LOG.write_text(json.dumps(log[-100:], indent=2))


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    place = fetch_place()
    file_count = current_file_count()

    print(f"SerpAPI: {place['name']} — {place['count']} reviews, {place['rating']} stars")
    print(f"Current in index.html: reviewCount={file_count}")

    if file_count == place["count"]:
        # Also check rating; if rating drifted (e.g. 5.0 → 4.9) we still want to update
        current_text = (ROOT / "index.html").read_text(encoding="utf-8")
        rating_match = re.search(
            r'"@type":\s*"AggregateRating"[\s\S]{0,200}?"ratingValue":\s*"([^"]+)"',
            current_text,
        )
        current_rating = float(rating_match.group(1)) if rating_match else None
        if current_rating == place["rating"]:
            print("No change needed.")
            write_audit({"count": place["count"], "rating": place["rating"], "changed": False})
            return 2

    changed_files = []
    for path in TARGETS:
        if update_file(path, place["count"], place["rating"], dry_run):
            changed_files.append(str(path.relative_to(ROOT)))

    verb = "Would update" if dry_run else "Updated"
    print(f"{verb}: {', '.join(changed_files) if changed_files else '(no files)'}")

    if not dry_run:
        write_audit({
            "count": place["count"],
            "rating": place["rating"],
            "previous_count": file_count,
            "files": changed_files,
            "changed": True,
        })
    return 0 if changed_files else 2


if __name__ == "__main__":
    sys.exit(main())
