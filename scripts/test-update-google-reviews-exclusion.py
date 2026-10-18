#!/usr/bin/env python3
"""Owner-exclusion tests for update-google-reviews.py. No provider calls or file writes."""

from __future__ import annotations

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).with_name("update-google-reviews.py")
SPEC = importlib.util.spec_from_file_location("update_google_reviews", SCRIPT)
assert SPEC and SPEC.loader
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)

ENTRY = m.EXCLUDED_REVIEWS[0]
OTHER = {"author": "Riley Marsh", "city": "", "rating": 5, "date": "2026-06-29", "text": "Great to work with."}


def fake_text_for_hash() -> str:
    # The real excluded text is not stored in the repo; patch the hash for the test.
    return "Example excluded review   TEXT."


def main() -> None:
    original = dict(ENTRY)
    try:
        ENTRY["text_sha256"] = m._review_text_sha256(fake_text_for_hash())
        excluded_text = fake_text_for_hash()

        # 1. Name fallback (no ids anywhere).
        assert m._exclusion_reason({"author": "Katie Conwell", "text": "different"}) == "name"
        # 2. Text signature survives an author change / provider fallback name.
        assert m._exclusion_reason({"author": "Google Reviewer", "text": "example excluded review text."}) == "text"
        # 3. Unrelated review kept.
        assert m._exclusion_reason(OTHER) is None

        # 4. Stable ids decide when both sides have them.
        ENTRY["contributor_ids"] = frozenset({"111"})
        same_name_other_person = {"author": "Katie Conwell", "text": "other", "_contributor_id": "222"}
        assert m._exclusion_reason(same_name_other_person) is None
        by_url = {"author": "K C", "text": "x", "_profile_url": "https://www.google.com/maps/contrib/111?hl=en"}
        assert m._exclusion_reason(by_url) == "id"
        no_id_row = {"author": "Katie Conwell", "text": "x"}
        assert m._exclusion_reason(no_id_row) == "name"  # fallback when the row has no id
        ENTRY["contributor_ids"] = frozenset()

        # 5. Cached fallback path filters and private fields never reach output.
        cached = [OTHER, {"author": "Katie Conwell", "text": excluded_text}]
        assert m._drop_excluded(cached) == [OTHER]
        merged = m._merge_reviews(
            [{**OTHER, "_contributor_id": "9", "_profile_url": "u", "_review_id": "r"},
             {"author": "Someone", "text": excluded_text, "_review_id": "r2"}],
            [],
        )
        assert merged == [OTHER], merged
    finally:
        ENTRY.clear()
        ENTRY.update(original)
    print("update-google-reviews exclusion tests: PASS")


if __name__ == "__main__":
    main()
