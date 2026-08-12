#!/usr/bin/env python3
"""Deterministic listing-target tests for update-google-reviews.py.

These tests make sure a Salt Lake Valley CID can never fall through to the
default Heber SerpAPI data_id. No provider calls or file writes occur.
"""

from __future__ import annotations

import importlib.util
import os
from contextlib import contextmanager
from pathlib import Path


SCRIPT = Path(__file__).with_name("update-google-reviews.py")
SPEC = importlib.util.spec_from_file_location("update_google_reviews", SCRIPT)
assert SPEC and SPEC.loader
reviews = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reviews)


@contextmanager
def target_env(**values: str | None):
    keys = {"GOOGLE_CID", "SERPAPI_DATA_ID"}
    before = {key: os.environ.get(key) for key in keys}
    try:
        for key in keys:
            value = values.get(key)
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        yield
    finally:
        for key, value in before.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def require_system_exit(fn, message: str) -> None:
    try:
        fn()
    except SystemExit as exc:
        assert message in str(exc), str(exc)
    else:
        raise AssertionError("expected fail-closed SystemExit")


with target_env(GOOGLE_CID=None, SERPAPI_DATA_ID=None):
    assert reviews._target_cid() == reviews.DEFAULT_CID
    assert reviews._serpapi_data_id() == reviews.DEFAULT_DATA_ID
    assert reviews._source_identity() == {
        "google_cid": reviews.DEFAULT_CID,
        "data_id": reviews.DEFAULT_DATA_ID,
    }

slv_cid = "5689850818145735734"
with target_env(GOOGLE_CID=slv_cid, SERPAPI_DATA_ID=None):
    require_system_exit(reviews._serpapi_data_id, "cannot fall back to SerpAPI")
    assert reviews._source_identity() == {"google_cid": slv_cid, "data_id": None}

with target_env(GOOGLE_CID=slv_cid, SERPAPI_DATA_ID=reviews.DEFAULT_DATA_ID):
    require_system_exit(reviews._serpapi_data_id, "not requested GOOGLE_CID")

with target_env(GOOGLE_CID=slv_cid, SERPAPI_DATA_ID="not-a-data-id"):
    require_system_exit(reviews._serpapi_data_id, "malformed")

matching_data_id = f"0x1234:{hex(int(slv_cid))}"
with target_env(GOOGLE_CID=slv_cid, SERPAPI_DATA_ID=matching_data_id):
    assert reviews._serpapi_data_id() == matching_data_id
    assert reviews._cid_from_data_id(matching_data_id) == slv_cid
    assert reviews._source_identity() == {
        "google_cid": slv_cid,
        "data_id": matching_data_id,
    }

    measurement = reviews._build_measurement_payload(
        {"name": "Frame Restoration Utah", "count": 3, "rating": 4.7, "place_id": "test-place"},
        [
            {"author": "not stored", "rating": 5, "date": "2026-08-10", "text": "not stored"},
            {"author": "not stored", "rating": 4, "date": "2026-08-11", "text": ""},
            {"author": "not stored", "rating": 5, "date": "2026-08-12", "text": "not stored"},
        ],
        observed_at="2026-08-12T19:30:00Z",
    )
    assert measurement["target"]["googleCid"] == slv_cid
    assert measurement["aggregate"] == {"rating": 4.7, "reviewCount": 3}
    assert measurement["reviewSample"] == {
        "rowsReturned": 3,
        "rowsWithText": 2,
        "latestReviewDate": "2026-08-12",
        "ratingDistribution": {"5": 2, "4": 1},
        "reviewTextStored": False,
        "reviewerIdentityStored": False,
    }

print("update-google-reviews targeting: all assertions passed")
