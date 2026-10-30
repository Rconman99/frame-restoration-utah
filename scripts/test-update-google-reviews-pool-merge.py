#!/usr/bin/env python3
"""Pool-merge tests for update-google-reviews.py: the audit pool in
data/reviews-full.json must never shrink when a fetch returns fewer or
overlapping reviews. Uses a temp file; no provider calls."""

from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).with_name("update-google-reviews.py")
SPEC = importlib.util.spec_from_file_location("update_google_reviews", SCRIPT)
assert SPEC and SPEC.loader
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


def rv(author: str, date: str, text: str, rid: str | None = None) -> dict:
    r = {"author": author, "rating": 5, "date": date, "text": text, "has_text": bool(text)}
    if rid:
        r["review_id"] = rid
    return r


def main() -> None:
    existing = [rv(f"Old Reviewer {i}", f"2026-0{1 + i % 9}-01", f"old text {i}") for i in range(36)]
    existing.append(rv("Timothy Kaspar", "2026-05-02", "millcreek job"))
    existing.append(rv("Coach Sis", "2026-05-03", "sandy job"))
    # Fetch returns 5: 3 brand new, 1 overlap without id, 1 overlap now with id.
    fresh = [
        rv("New A", "2026-10-29", "new a", "rid-a"),
        rv("New B", "2026-10-28", "new b", "rid-b"),
        rv("New C", "2026-10-27", "", "rid-c"),
        rv("Timothy Kaspar", "2026-05-02", "millcreek job"),
        rv("Coach Sis", "2026-05-03", "sandy job", "rid-sis"),
    ]
    merged = m.merge_review_pool(fresh, existing)
    authors = [r["author"] for r in merged]
    assert len(merged) == len(existing) + 3, len(merged)
    assert authors.count("Timothy Kaspar") == 1 and authors.count("Coach Sis") == 1
    assert {"New A", "New B", "New C"} <= set(authors)
    for r in existing:
        assert r["author"] in authors, r["author"]

    # Same id, edited text -> dedupes by id, no growth.
    again = m.merge_review_pool([rv("New A", "2026-10-29", "edited", "rid-a")], merged)
    assert len(again) == len(merged)
    # Empty fetch keeps everything.
    assert m.merge_review_pool([], merged) == merged

    # End to end through write_reviews_full_json on a temp file.
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "reviews-full.json"
        path.write_text(json.dumps({"reviews": existing}), encoding="utf-8")
        m.REVIEWS_FULL_JSON = path
        assert m.write_reviews_full_json(fresh, {"rating": 5.0, "count": 42})
        out = json.loads(path.read_text(encoding="utf-8"))
        assert out["reviews_fetched"] == len(existing) + 3
        names = {r["author"] for r in out["reviews"]}
        assert {"Timothy Kaspar", "Coach Sis", "New A"} <= names
    print("pool-merge tests passed")


if __name__ == "__main__":
    main()
