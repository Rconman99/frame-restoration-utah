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
REVIEWS_JSON = ROOT / "reviews.json"  # consumed by homepage carousel (/reviews.json)

# Frame Roofing Utah's stable Google Maps data_id — more reliable than text search.
DEFAULT_DATA_ID = "0x874df59069be3e09:0x756332595f702acc"

# How many individual reviews to include in /reviews.json for the homepage carousel.
REVIEWS_FEED_LIMIT = 8

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


def fetch_reviews(limit: int = REVIEWS_FEED_LIMIT) -> list[dict]:
    """Call SerpAPI's google_maps_reviews engine for actual review text.

    Returns a list of {author, rating, text, date, city} dicts. Returns an
    empty list on any failure — the caller is responsible for preserving
    the existing reviews.json if the feed comes back empty.
    """
    api_key = os.environ.get("SERPAPI_KEY")
    data_id = os.environ.get("SERPAPI_DATA_ID", DEFAULT_DATA_ID)
    if not api_key:
        return []

    params = urllib.parse.urlencode({
        "engine": "google_maps_reviews",
        "data_id": data_id,
        "hl": "en",
        "sort_by": "newestFirst",
        "api_key": api_key,
    })
    url = f"https://serpapi.com/search.json?{params}"
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            data = json.loads(resp.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"WARN: could not fetch reviews feed: {exc}")
        return []

    if "error" in data:
        print(f"WARN: SerpAPI reviews error: {data['error']}")
        return []

    raw = data.get("reviews") or []
    out: list[dict] = []
    for r in raw[:limit]:
        # SerpAPI returns `snippet` (or sometimes `extracted_snippet.original`) for the
        # review text. ISO date lives under `iso_date` or `date`.
        text = r.get("snippet") or (r.get("extracted_snippet") or {}).get("original") or ""
        if not text or not text.strip():
            continue  # skip reviews with no text (star-only reviews)
        user = r.get("user") or {}
        author = user.get("name") or r.get("user_name") or r.get("author") or "Google Reviewer"
        date = r.get("iso_date") or r.get("date") or ""
        # Try to detect city from the review text if present. SerpAPI doesn't expose
        # reviewer location. Leave blank otherwise — carousel renders "Google Review".
        out.append({
            "author": author,
            "city": "",
            "rating": int(r.get("rating") or 5),
            "date": str(date)[:10] if date else "",
            "text": text.strip(),
        })
    return out


def write_reviews_json(place: dict, reviews: list[dict]) -> bool:
    """Write /reviews.json consumed by the homepage carousel.

    If `reviews` is empty (SerpAPI returned nothing), preserves the existing
    file's `reviews` array but refreshes the aggregate + timestamp. Returns
    True if the file was actually rewritten.
    """
    existing: dict = {}
    if REVIEWS_JSON.exists():
        try:
            existing = json.loads(REVIEWS_JSON.read_text())
        except json.JSONDecodeError:
            existing = {}

    final_reviews = reviews if reviews else existing.get("reviews", [])

    payload = {
        "source": "google",
        "place_name": place.get("name") or existing.get("place_name") or "Frame Restoration Utah",
        "data_id": os.environ.get("SERPAPI_DATA_ID", DEFAULT_DATA_ID),
        "aggregate": {
            "rating": place["rating"],
            "review_count": place["count"],
        },
        "updated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "updater": "scripts/update-google-reviews.py",
        "reviews": final_reviews,
    }

    new_text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    if REVIEWS_JSON.exists() and REVIEWS_JSON.read_text(encoding="utf-8") == new_text:
        return False
    REVIEWS_JSON.write_text(new_text, encoding="utf-8")
    return True


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
    print(f"Current in index.html (schema): reviewCount={file_count}")

    # Always run the replacements on every target. update_file() compares before/after
    # and returns True only if something actually changed. This self-heals partial-drift
    # states where one reference (e.g. hero subtitle) lagged a previous manual edit of
    # the schema — exactly the race condition that occurred on 2026-04-17.
    changed_files = []
    for path in TARGETS:
        if update_file(path, place["count"], place["rating"], dry_run):
            changed_files.append(str(path.relative_to(ROOT)))

    # Refresh /reviews.json for the homepage carousel. Pulls fresh review text from
    # SerpAPI's google_maps_reviews engine. If that call fails (quota, network, etc.),
    # write_reviews_json() falls back to preserving the existing reviews array while
    # still refreshing the aggregate counts — never leaves the site without data.
    reviews_feed = fetch_reviews()
    print(f"SerpAPI reviews feed: {len(reviews_feed)} reviews pulled")
    if not dry_run and write_reviews_json(place, reviews_feed):
        changed_files.append(str(REVIEWS_JSON.relative_to(ROOT)))

    if not changed_files:
        print("No change needed — all references already in sync.")
        if not dry_run:
            write_audit({"count": place["count"], "rating": place["rating"], "changed": False})
        return 2

    verb = "Would update" if dry_run else "Updated"
    print(f"{verb}: {', '.join(changed_files)}")

    if not dry_run:
        write_audit({
            "count": place["count"],
            "rating": place["rating"],
            "previous_count": file_count,
            "files": changed_files,
            "changed": True,
        })
    return 0


if __name__ == "__main__":
    sys.exit(main())
