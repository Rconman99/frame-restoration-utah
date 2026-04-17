#!/usr/bin/env python3
"""Update Google review count + rating across the site.

Hits the Google Places API for the current review total and average rating,
then regex-updates every live reference in index.html and pages/about.html.
Safe to run locally or in GitHub Actions.

Environment:
  GOOGLE_PLACES_API_KEY  (required) — from Google Cloud Console, Places API enabled
  GOOGLE_PLACE_ID        (required) — Frame Roofing Utah's Place ID

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

# Files that contain live-user-facing review references.
TARGETS = [
    ROOT / "index.html",
    ROOT / "pages" / "about.html",
]


def fetch_place() -> dict:
    """Call Google Places API (Place Details) for review count + rating."""
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    place_id = os.environ.get("GOOGLE_PLACE_ID")
    if not api_key or not place_id:
        raise SystemExit("ERROR: set GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID")

    params = urllib.parse.urlencode({
        "place_id": place_id,
        "fields": "user_ratings_total,rating,name",
        "key": api_key,
    })
    url = f"https://maps.googleapis.com/maps/api/place/details/json?{params}"
    with urllib.request.urlopen(url, timeout=15) as resp:
        data = json.loads(resp.read())

    if data.get("status") != "OK":
        raise SystemExit(f"ERROR: Places API status={data.get('status')} msg={data.get('error_message')}")

    r = data["result"]
    return {
        "name": r.get("name", ""),
        "count": int(r["user_ratings_total"]),
        "rating": float(r["rating"]),
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

    print(f"Google Places: {place['name']} — {place['count']} reviews, {place['rating']} stars")
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
