#!/usr/bin/env python3
"""Update Google review count + rating across the site.

Pulls Frame Restoration Utah's current review count, rating, and review text,
then updates every visible live reference in index.html and pages/about.html.
Review/rating structured data remains deliberately absent because first-party
LocalBusiness review markup is self-serving under Google's review-snippet rules.

PROVIDER: DataForSEO by default, SerpAPI as fallback.
  The SerpAPI Free Plan is 250 searches/month and has been fully exhausted
  since ~2026-07-20, which killed this sync (no fresh review data reached
  main since >=6/15) plus CTA Liveness in both UT and TX. DataForSEO bills
  per-call from a prepaid balance with no monthly ceiling, and a single
  reviews task returns BOTH the aggregate (rating + votes_count) AND the
  individual review items -- so one ~$0.0015 call replaces the two separate
  SerpAPI calls this script used to make.

Environment:
  DATAFORSEO_LOGIN     — DataForSEO API login    (preferred provider)
  DATAFORSEO_PASSWORD  — DataForSEO API password (preferred provider)
  GOOGLE_CID           (optional) — decimal Google CID override; defaults to
                                    Frame's 8458659884566588108
  REVIEWS_PROVIDER     (optional) — force 'dataforseo' or 'serpapi'
  SERPAPI_KEY          (fallback) — SerpAPI private key
  SERPAPI_DATA_ID      (optional) — exact Google Maps data_id for SerpAPI.
                                    Required when GOOGLE_CID overrides Heber;
                                    its hex CID suffix must match GOOGLE_CID.

Exit codes:
  0 = files updated (changed count or rating)
  2 = no change (live count matches file count — don't commit)
  1 = error (API, parsing, env)

Measurement-only mode (no site files, audit log, or GBP are changed):
  python3 scripts/update-google-reviews.py --measurement-only \
    --measurement-output data/rank-tracker/reviews/salt-lake-city/DATE.json
"""

import base64
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIT_LOG = ROOT / "data" / "google-reviews.json"
REVIEWS_JSON = ROOT / "reviews.json"  # consumed by homepage carousel (/reviews.json)
REVIEWS_FULL_JSON = ROOT / "data" / "reviews-full.json"  # audit-only, all reviews

# Frame Roofing Utah's stable Google Maps data_id — more reliable than text search.
DEFAULT_DATA_ID = "0x874df59069be3e09:0x756332595f702acc"

# DataForSEO addresses the same listing by decimal CID, which is just the second
# half of the data_id in base 10. Derived (not hardcoded) so overriding
# SERPAPI_DATA_ID keeps both providers pointed at the same listing.
DEFAULT_CID = str(int(DEFAULT_DATA_ID.split(":")[1], 16))  # -> 8458659884566588108

DATAFORSEO_BASE = "https://api.dataforseo.com/v3/business_data/google/reviews"
# US location_code. A GBP is addressed by CID, so this only sets result locale.
DATAFORSEO_LOCATION_CODE = 2840
DATAFORSEO_POLL_ATTEMPTS = 24
DATAFORSEO_POLL_SECONDS = 5

# How many individual reviews to include in /reviews.json for the homepage carousel.
REVIEWS_FEED_LIMIT = 8

# Soft cap for the audit-only full feed. SerpAPI returns 10/page by default;
# we paginate via next_page_token up to this many total reviews. 60 leaves
# headroom for the next year of growth without ballooning API cost.
REVIEWS_FULL_LIMIT = 60

# Files that contain live-user-facing review references.
TARGETS = [
    ROOT / "index.html",
    ROOT / "pages" / "about.html",
]


# --------------------------------------------------------------------------
# DataForSEO provider
#
# One task_post -> poll -> task_get returns the aggregate AND the review items,
# so the whole script needs a single provider round-trip per run. The result is
# memoized in _DFS_CACHE because fetch_place(), fetch_reviews() and
# fetch_all_reviews() are each called once per run and all want the same payload.
# --------------------------------------------------------------------------

_DFS_CACHE: dict | None = None
_QUOTA_CACHE: int | None = None
_QUOTA_CHECKED = False


def _cid_from_data_id(data_id: str) -> str | None:
    """Return the decimal CID encoded in a Google Maps data_id."""
    try:
        parts = str(data_id or "").split(":")
        if len(parts) != 2 or not parts[1].lower().startswith("0x"):
            return None
        return str(int(parts[1], 16))
    except (TypeError, ValueError):
        return None


def _target_cid() -> str:
    """The exact Google listing this run is allowed to read."""
    return str(os.environ.get("GOOGLE_CID") or DEFAULT_CID).strip()


def _serpapi_data_id() -> str:
    """Resolve a SerpAPI target that is provably the same listing as GOOGLE_CID.

    DataForSEO accepts a decimal CID; SerpAPI requires its longer Maps data_id.
    An alternate-CID run must never fall back to DEFAULT_DATA_ID (Heber).
    """
    cid = _target_cid()
    explicit = str(os.environ.get("SERPAPI_DATA_ID") or "").strip()
    if not explicit:
        if cid != DEFAULT_CID:
            raise SystemExit(
                "ERROR: GOOGLE_CID override cannot fall back to SerpAPI without "
                "a matching SERPAPI_DATA_ID; refusing to read the default Heber listing"
            )
        return DEFAULT_DATA_ID

    encoded_cid = _cid_from_data_id(explicit)
    if encoded_cid is None:
        raise SystemExit("ERROR: SERPAPI_DATA_ID is malformed; refusing an unpinned review lookup")
    if encoded_cid != cid:
        raise SystemExit(
            f"ERROR: SERPAPI_DATA_ID encodes CID {encoded_cid}, not requested GOOGLE_CID {cid}; "
            "refusing cross-profile review data"
        )
    return explicit


def _source_identity() -> dict:
    """Secretless listing identity persisted with review exports."""
    cid = _target_cid()
    explicit = str(os.environ.get("SERPAPI_DATA_ID") or "").strip()
    data_id = explicit or (DEFAULT_DATA_ID if cid == DEFAULT_CID else None)
    return {"google_cid": cid, "data_id": data_id}


def _build_measurement_payload(place: dict, reviews: list[dict], observed_at: str | None = None) -> dict:
    """Build a text-free exact-listing review receipt for rank/entity tracking."""
    dates = sorted(str(review.get("date") or "")[:10] for review in reviews if review.get("date"))
    rating_distribution: dict[str, int] = {}
    for review in reviews:
        rating = int(review.get("rating") or 0)
        if 1 <= rating <= 5:
            key = str(rating)
            rating_distribution[key] = rating_distribution.get(key, 0) + 1
    return {
        "schemaVersion": 1,
        "measurementId": "frame-utah-salt-lake-valley-google-review-baseline-v1",
        "market": "utah-salt-lake-valley",
        "observedAt": observed_at or datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "publicMutationPerformed": False,
        "provider": (os.environ.get("REVIEWS_PROVIDER") or "auto").strip().lower(),
        "target": {
            "googleCid": _target_cid(),
            "exactCidPinned": True,
            "placeName": place.get("name") or "",
            "placeId": place.get("place_id") or "",
        },
        "aggregate": {
            "rating": float(place["rating"]),
            "reviewCount": int(place["count"]),
        },
        "reviewSample": {
            "rowsReturned": len(reviews),
            "rowsWithText": sum(1 for review in reviews if review.get("text")),
            "latestReviewDate": dates[-1] if dates else None,
            "ratingDistribution": rating_distribution,
            "reviewTextStored": False,
            "reviewerIdentityStored": False,
        },
    }


def _measurement_output_path() -> Path:
    """Resolve a required, repository-contained measurement output path."""
    try:
        index = sys.argv.index("--measurement-output")
        raw = sys.argv[index + 1]
    except (ValueError, IndexError):
        raise SystemExit("ERROR: --measurement-only requires --measurement-output PATH")
    candidate = (ROOT / raw).resolve() if not Path(raw).is_absolute() else Path(raw).resolve()
    allowed = (ROOT / "data" / "rank-tracker" / "reviews").resolve()
    if candidate != allowed and allowed not in candidate.parents:
        raise SystemExit(f"ERROR: measurement output must be under {allowed}")
    return candidate


def write_measurement_snapshot(place: dict, reviews: list[dict]) -> Path:
    """Write only a text-free measurement artifact under the rank tracker."""
    if int(place.get("count") or 0) > 0 and not reviews:
        raise SystemExit("ERROR: provider returned a positive review count but no review rows")
    output = _measurement_output_path()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(_build_measurement_payload(place, reviews), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return output

# Below this many SerpAPI searches remaining, route to DataForSEO instead.
# Rationale: the SerpAPI plan is PREPAID and use-it-or-lose-it, so spending it
# first is free at the margin -- but running it to zero is exactly what took
# four automations down for four weeks. The floor keeps a buffer for the
# higher-value jobs (aeo-aio-sweep's own preflight reserves 50) while letting
# DataForSEO absorb anything past it, so exhaustion becomes a routing decision
# rather than an outage.
SERPAPI_RESERVE_FLOOR = int(os.environ.get("SERPAPI_RESERVE_FLOOR", "50") or 50)


def _dataforseo_available() -> bool:
    """True when DataForSEO credentials are present."""
    return bool(os.environ.get("DATAFORSEO_LOGIN") and os.environ.get("DATAFORSEO_PASSWORD"))


def serpapi_quota_left() -> int | None:
    """Remaining SerpAPI searches this cycle, or None if it can't be determined.

    Probing /account does NOT consume a search. None means "unknown" and is
    treated as "assume healthy" -- a monitoring outage must not silently
    reroute production traffic.
    """
    global _QUOTA_CACHE, _QUOTA_CHECKED
    if _QUOTA_CHECKED:
        return _QUOTA_CACHE
    _QUOTA_CHECKED = True

    api_key = os.environ.get("SERPAPI_KEY")
    if not api_key:
        return None
    try:
        url = f"https://serpapi.com/account?api_key={urllib.parse.quote(api_key)}"
        with urllib.request.urlopen(url, timeout=20) as resp:
            acct = json.loads(resp.read())
    except Exception as exc:  # noqa: BLE001 — probe failure must not break the run
        print(f"WARN: could not read SerpAPI quota: {exc}")
        return None

    left = acct.get("plan_searches_left")
    total = acct.get("searches_per_month")
    if not isinstance(left, int):
        return None

    _QUOTA_CACHE = left
    pct = (left / total * 100) if isinstance(total, int) and total else 0.0
    # Emit the numbers unconditionally so CI logs carry a consumption trail --
    # the absence of exactly this is why exhaustion went unnoticed for weeks.
    print(f"QUOTA: SerpAPI {left}/{total} searches left ({pct:.0f}%) "
          f"on {acct.get('plan_name', 'unknown plan')}")
    if pct <= 10:
        print(f"::warning::SerpAPI quota CRITICAL — {left} searches left ({pct:.0f}%)")
    elif pct <= 25:
        print(f"::warning::SerpAPI quota low — {left} searches left ({pct:.0f}%)")
    return left


def choose_provider() -> str:
    """Route this run to 'serpapi' or 'dataforseo'.

    SerpAPI is preferred while quota is healthy because the plan is prepaid --
    unused capacity is money already spent. DataForSEO takes over near the floor
    and whenever SerpAPI is unusable, so a depleted plan degrades instead of failing.
    """
    forced = (os.environ.get("REVIEWS_PROVIDER") or "").strip().lower()
    if forced in ("serpapi", "dataforseo"):
        print(f"PROVIDER: {forced} (forced via REVIEWS_PROVIDER)")
        return forced

    has_serp = bool(os.environ.get("SERPAPI_KEY"))
    has_dfs = _dataforseo_available()

    if not has_serp:
        print("PROVIDER: dataforseo (no SERPAPI_KEY)" if has_dfs
              else "PROVIDER: serpapi (no credentials at all — will fail loudly)")
        return "dataforseo" if has_dfs else "serpapi"

    left = serpapi_quota_left()
    if has_dfs and left is not None and left < SERPAPI_RESERVE_FLOOR:
        print(f"PROVIDER: dataforseo (SerpAPI at {left}, below floor {SERPAPI_RESERVE_FLOOR})")
        return "dataforseo"

    print("PROVIDER: serpapi (prepaid quota healthy)")
    return "serpapi"


def _dataforseo_request(url: str, payload: list | None = None) -> dict:
    """POST (with payload) or GET against DataForSEO using HTTP Basic auth."""
    login = os.environ.get("DATAFORSEO_LOGIN", "")
    password = os.environ.get("DATAFORSEO_PASSWORD", "")
    token = base64.b64encode(f"{login}:{password}".encode()).decode()
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def _fetch_dataforseo(depth: int = REVIEWS_FULL_LIMIT) -> dict | None:
    """Fetch aggregate + review items in one task. Returns None on any failure
    so the caller can fall back to SerpAPI rather than publishing a false zero.

    Shape: {"name","count","rating","place_id","items":[{author,rating,text,date}]}
    """
    global _DFS_CACHE
    if _DFS_CACHE is not None:
        return _DFS_CACHE

    cid = _target_cid()
    payload = [{
        "keyword": f"cid:{cid}",
        "language_code": "en",
        "location_code": DATAFORSEO_LOCATION_CODE,
        "depth": depth,
        "sort_by": "newest",
    }]

    try:
        posted = _dataforseo_request(f"{DATAFORSEO_BASE}/task_post", payload)
    except Exception as exc:  # noqa: BLE001 — any failure must fall back, not crash
        print(f"WARN: DataForSEO task_post failed: {exc}")
        return None

    task = (posted.get("tasks") or [{}])[0]
    task_id = task.get("id")
    if not task_id:
        print(f"WARN: DataForSEO task_post returned no id: "
              f"{task.get('status_code')} {task.get('status_message')}")
        return None

    for _ in range(DATAFORSEO_POLL_ATTEMPTS):
        time.sleep(DATAFORSEO_POLL_SECONDS)
        try:
            got = _dataforseo_request(f"{DATAFORSEO_BASE}/task_get/{task_id}")
        except Exception as exc:  # noqa: BLE001
            print(f"WARN: DataForSEO task_get failed: {exc}")
            return None
        t = (got.get("tasks") or [{}])[0]
        if t.get("status_code") != 20000:
            continue
        results = t.get("result") or []
        if not results:
            continue

        res = results[0]
        rating = res.get("rating") or {}
        votes = rating.get("votes_count")
        value = rating.get("value")
        if votes is None or value is None:
            print("WARN: DataForSEO result missing rating/votes — not trusting it")
            return None

        items = []
        for it in (res.get("items") or []):
            text = (it.get("review_text") or "").strip()
            items.append({
                "author": it.get("profile_name") or "Google Reviewer",
                "city": "",  # neither provider exposes reviewer location
                "rating": int((it.get("rating") or {}).get("value") or 5),
                "date": str(it.get("timestamp") or "")[:10],
                "text": text,
            })

        _DFS_CACHE = {
            # `or ""` not `.get(k, "")`: DataForSEO returns these keys present
            # but null, so a plain default never fires and downstream string
            # handling would receive None.
            "name": res.get("title") or "",
            "count": int(votes),
            "rating": float(value),
            "place_id": res.get("place_id") or "",
            "items": items,
        }
        return _DFS_CACHE

    print("WARN: DataForSEO task did not complete within the polling window")
    return None


def fetch_place() -> dict:
    """Review count + rating, routed by quota with fail-over in both directions."""
    provider = choose_provider()

    if provider == "serpapi":
        try:
            return _fetch_place_serpapi()
        except (Exception, SystemExit) as exc:  # noqa: BLE001
            # A 429 here is the exact failure that took this job down for weeks.
            # Fail OVER, not closed — but say so loudly so it can't pass as healthy.
            if not _dataforseo_available():
                raise
            print(f"::warning::SerpAPI failed ({exc}) — failing over to DataForSEO")

    dfs = _fetch_dataforseo()
    if dfs:
        print(f"OK: DataForSEO — {dfs['name']}: {dfs['count']} reviews, {dfs['rating']}")
        return {k: dfs[k] for k in ("name", "count", "rating", "place_id")}

    if provider == "dataforseo":
        print("WARN: DataForSEO unavailable — falling back to SerpAPI")
        return _fetch_place_serpapi()
    raise SystemExit("ERROR: both SerpAPI and DataForSEO failed — refusing to publish a zero")


def _fetch_place_serpapi() -> dict:
    """Call SerpAPI's Google Maps engine for review count + rating."""
    api_key = os.environ.get("SERPAPI_KEY")
    data_id = _serpapi_data_id()
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
    """Reviews with text for the homepage carousel. DataForSEO first, SerpAPI fallback.

    Same contract as before: list of {author, city, rating, date, text}, empty
    list on failure so the caller preserves the existing reviews.json.
    """
    # choose_provider() is memoized via the quota cache, so this costs nothing extra.
    if choose_provider() == "serpapi":
        feed = _fetch_reviews_serpapi(limit)
        if feed or not _dataforseo_available():
            return feed
        print("WARN: SerpAPI returned no reviews — trying DataForSEO")

    dfs = _fetch_dataforseo()
    if dfs:
        # Star-only reviews carry no carousel value — same rule as the SerpAPI path.
        with_text = [r for r in dfs["items"] if r["text"]]
        return with_text[:limit]
    print("WARN: DataForSEO unavailable for reviews feed — falling back to SerpAPI")
    return _fetch_reviews_serpapi(limit)


def _fetch_reviews_serpapi(limit: int = REVIEWS_FEED_LIMIT) -> list[dict]:
    """Call SerpAPI's google_maps_reviews engine for actual review text.

    Returns a list of {author, rating, text, date, city} dicts. Returns an
    empty list on any failure — the caller is responsible for preserving
    the existing reviews.json if the feed comes back empty.
    """
    api_key = os.environ.get("SERPAPI_KEY")
    data_id = _serpapi_data_id()
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


def fetch_all_reviews(limit: int = REVIEWS_FULL_LIMIT) -> list[dict]:
    """Full audit feed (text AND star-only). DataForSEO first, SerpAPI fallback.

    Contract unchanged: {author, rating, date, text, has_text}, [] on failure.
    """
    if choose_provider() == "serpapi":
        full = _fetch_all_reviews_serpapi(limit)
        if full or not _dataforseo_available():
            return full
        print("WARN: SerpAPI returned no audit rows — trying DataForSEO")

    dfs = _fetch_dataforseo(depth=limit)
    if dfs:
        return [{
            "author": r["author"],
            "rating": r["rating"],
            "date": r["date"],
            "text": r["text"],
            "has_text": bool(r["text"]),
        } for r in dfs["items"]][:limit]
    print("WARN: DataForSEO unavailable for audit feed — falling back to SerpAPI")
    return _fetch_all_reviews_serpapi(limit)


def _fetch_all_reviews_serpapi(limit: int = REVIEWS_FULL_LIMIT) -> list[dict]:
    """Pull EVERY review (text or no text), paginating SerpAPI, for the audit
    feed. Unlike fetch_reviews() this:
      - Does not slice the result down to the carousel limit
      - Does not filter empty-text (star-only) reviews — kept for audit count
      - Does not apply the brand-leak filter — audit should see raw truth
      - Paginates via next_page_token if SerpAPI returns one

    Output is written to data/reviews-full.json. Failure is non-fatal — returns
    [] and the caller preserves the existing file (or skips writing).
    """
    api_key = os.environ.get("SERPAPI_KEY")
    data_id = _serpapi_data_id()
    if not api_key:
        return []

    out: list[dict] = []
    next_page_token: str | None = None
    pages_fetched = 0
    while len(out) < limit and pages_fetched < 10:  # hard ceiling on pages
        params = {
            "engine": "google_maps_reviews",
            "data_id": data_id,
            "hl": "en",
            "sort_by": "newestFirst",
            "api_key": api_key,
        }
        if next_page_token:
            params["next_page_token"] = next_page_token
        url = f"https://serpapi.com/search.json?{urllib.parse.urlencode(params)}"
        try:
            with urllib.request.urlopen(url, timeout=20) as resp:
                data = json.loads(resp.read())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            print(f"WARN: full-reviews fetch failed on page {pages_fetched + 1}: {exc}")
            break
        if "error" in data:
            print(f"WARN: SerpAPI error on page {pages_fetched + 1}: {data['error']}")
            break
        raw = data.get("reviews") or []
        for r in raw:
            text = r.get("snippet") or (r.get("extracted_snippet") or {}).get("original") or ""
            user = r.get("user") or {}
            out.append({
                "author": user.get("name") or r.get("user_name") or r.get("author") or "Google Reviewer",
                "rating": int(r.get("rating") or 0),
                "date": str(r.get("iso_date") or r.get("date") or "")[:10],
                "text": (text or "").strip(),
                "has_text": bool(text and text.strip()),
            })
        pages_fetched += 1
        next_page_token = (data.get("serpapi_pagination") or {}).get("next_page_token")
        if not next_page_token:
            break
    return out[:limit]


def write_reviews_full_json(reviews: list[dict], place: dict) -> bool:
    """Write data/reviews-full.json for the audit script. Preserves the prior
    file if `reviews` is empty (the SerpAPI call failed)."""
    REVIEWS_FULL_JSON.parent.mkdir(parents=True, exist_ok=True)
    if not reviews and REVIEWS_FULL_JSON.exists():
        return False
    payload = {
        "source": "google_maps_reviews",
        **_source_identity(),
        "aggregate": {
            "rating": place.get("rating"),
            "review_count": place.get("count"),
        },
        "fetched_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reviews_fetched": len(reviews),
        "reviews_with_text": sum(1 for r in reviews if r.get("has_text")),
        "reviews": reviews,
    }
    new_text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    if REVIEWS_FULL_JSON.exists() and REVIEWS_FULL_JSON.read_text(encoding="utf-8") == new_text:
        return False
    REVIEWS_FULL_JSON.write_text(new_text, encoding="utf-8")
    return True


# Substrings that trigger a brand-leak filter on review text. The audit on
# 2026-04-22 purged the old Frisco-TX "Frame Restoration" brand from every
# page on the site; we must NOT let a customer review re-introduce it on the
# homepage carousel. Reviews mentioning the old brand are dropped from the
# feed (aggregate count/rating from GBP is still the truth).
BRAND_LEAK_PHRASES = ("Frame Restoration ", "Frame Restoration.", "Frame Restoration,")


def _has_brand_leak(text: str) -> bool:
    """True if the review text references the old 'Frame Restoration' brand."""
    if not text:
        return False
    # Allow the legal LLC name 'Frame Restoration Utah' — only filter the bare
    # 'Frame Restoration' form that confuses Google with the Frisco TX entity.
    return any(p in text and "Frame Restoration Utah" not in text for p in BRAND_LEAK_PHRASES)


def _merge_reviews(fresh: list[dict], existing_reviews: list[dict]) -> list[dict]:
    """Filter brand-leak and fill `city` from the prior hand-curated file.

    Google / SerpAPI does not return reviewer location, so city is populated by
    lookup against the existing reviews.json (which was curated with cities the
    first time). Unknown authors get an empty city, which the carousel renders
    as just 'Google Review'.
    """
    city_map = {
        r.get("author", ""): r.get("city", "")
        for r in existing_reviews
        if r.get("author")
    }
    out: list[dict] = []
    for r in fresh:
        if _has_brand_leak(r.get("text", "")):
            print(f"  filtered (brand-leak): {r.get('author', 'unknown')}")
            continue
        city = r.get("city") or city_map.get(r.get("author", ""), "")
        out.append({**r, "city": city})
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

    existing_reviews = existing.get("reviews", [])
    if reviews:
        final_reviews = _merge_reviews(reviews, existing_reviews)
        # Guardrail: if the filter nuked everything (shouldn't happen), fall
        # back to the existing curated feed rather than shipping an empty
        # carousel. Aggregate from GBP still updates.
        if not final_reviews:
            print("WARN: all fresh reviews filtered — keeping existing feed")
            final_reviews = existing_reviews
    else:
        final_reviews = existing_reviews

    payload = {
        "source": "google",
        "place_name": place.get("name") or existing.get("place_name") or "Frame Restoration Utah",
        **_source_identity(),
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

    # Hero subtitle and review freshness marker.
    text = re.sub(r'\d+ (?:five-star|Google) reviews and counting',
                  f'{count} Google reviews and counting', text)
    text = re.sub(r'data-surface-marker="google-reviews-\d+"',
                  f'data-surface-marker="google-reviews-{count}"', text)

    # Link text: "See All 19 Google Reviews"
    text = re.sub(r'See All \d+ Google Reviews',
                  f'See All {count} Google Reviews', text)

    # About-page trust labels: "34 Google Reviews" (without "See All").
    # The digit lookbehind prevents a suffix match inside a multi-digit
    # "See All 34" count after the full prefix match is excluded.
    text = re.sub(r'(?<!See All )(?<!\d)\d+ Google Reviews',
                  f'{count} Google Reviews', text)

    rating_str = f"{rating:.1f}"
    text = re.sub(r'\d(?:\.\d)? from \d+ Google reviews',
                  f'{rating_str} from {count} Google reviews', text)
    text = re.sub(r'(★★★★★ )\d(?:\.\d)?(?= &nbsp;See All)',
                  rf'\g<1>{rating_str}', text)
    text = re.sub(r'(<div class="(?:num|big)">)\d(?:\.\d)?(?=&#9733;)',
                  rf'\g<1>{rating_str}', text)
    text = re.sub(r'(data-target=")\d(?:\.\d)?("[^>]*>)\d(?:\.\d)?(?=<span class="stat-suffix">★)',
                  rf'\g<1>{rating:g}\g<2>{rating_str}', text)
    text = re.sub(r'\d(?:\.\d)? stars across homeowner reviews',
                  f'{rating_str} stars across homeowner reviews', text)
    text = re.sub(r'\d(?:\.\d)?-star rated',
                  f'{rating_str}-star rated', text)

    if text == original:
        return False
    if not dry_run:
        path.write_text(text, encoding="utf-8")
    return True


def current_file_count() -> int | None:
    """Read the aggregate from reviews.json so no schema field is required."""
    try:
        data = json.loads(REVIEWS_JSON.read_text(encoding="utf-8"))
        count = data.get("aggregate", {}).get("review_count")
        return int(count) if count is not None else None
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
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

    if "--measurement-only" in sys.argv:
        reviews = fetch_all_reviews()
        output = write_measurement_snapshot(place, reviews)
        print(f"Measured exact CID {_target_cid()} to {output.relative_to(ROOT)}; no site files changed.")
        return 0

    file_count = current_file_count()

    print(f"SerpAPI: {place['name']} — {place['count']} reviews, {place['rating']} stars")
    print(f"Current in reviews.json: review_count={file_count}")

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
    print(f"SerpAPI reviews feed (carousel): {len(reviews_feed)} reviews pulled")
    if not dry_run and write_reviews_json(place, reviews_feed):
        changed_files.append(str(REVIEWS_JSON.relative_to(ROOT)))

    # Refresh data/reviews-full.json for the language audit. Paginated, ALL reviews
    # (text + star-only), no brand-leak filter — audit reads raw truth. Soft-cap at
    # REVIEWS_FULL_LIMIT (60). Failure here is non-fatal: existing file preserved.
    full_reviews = fetch_all_reviews()
    print(f"SerpAPI full reviews (audit): {len(full_reviews)} pulled, "
          f"{sum(1 for r in full_reviews if r.get('has_text'))} with text")
    if not dry_run and write_reviews_full_json(full_reviews, place):
        changed_files.append(str(REVIEWS_FULL_JSON.relative_to(ROOT)))

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
