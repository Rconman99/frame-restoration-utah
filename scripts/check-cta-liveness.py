#!/usr/bin/env python3
"""
CTA liveness monitor for Frame Restoration Utah — Layer 3 of the review-link defense.

The static gate (scripts/audit-cta-integrity.mjs) blocks bad links at MERGE time,
but it can't tell that a syntactically-valid Google listing is actually DEAD, or
that the live review page broke after deploy. This checks the real world:

  A. LIVE REVIEW PAGE  (no API key needed) — fetches the deployed review landing
     page and asserts it returns 200, contains the canonical GBP cid, and does
     NOT contain any known-dead cid. Catches: page 404s, CDN/deploy regressions,
     or the review CTA drifting back to a wrong listing in production.

  B. GBP LIVENESS via SerpAPI  (needs SERPAPI_KEY; skipped gracefully if unset) —
     resolves the canonical data_id and asserts a real business with > 0 reviews
     comes back. Catches: the listing being suspended, merged, or going dead
     (exactly what cid=16833… was — a valid-looking id pointing at nothing).

Exit code:
  0  all hard checks passed (or SerpAPI skipped for lack of key)
  1  a hard check failed — the workflow goes red and notifies.

Source of truth: data/route-factory/business.json.

Usage:
  python3 scripts/check-cta-liveness.py
  SERPAPI_KEY=... python3 scripts/check-cta-liveness.py
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

CFG_PATH = Path(__file__).resolve().parent.parent / "data" / "route-factory" / "business.json"
UA = "FrameRestorationUtah-CTALiveness/1.0 (+https://www.framerestorationutah.com)"


def load_cfg() -> dict:
    if not CFG_PATH.exists():
        print(f"::error::missing {CFG_PATH}")
        sys.exit(1)
    return json.loads(CFG_PATH.read_text())


def http_get(url: str, timeout: int = 20) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.getcode(), resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:  # noqa: BLE001
        print(f"::error::fetch failed for {url}: {e}")
        return 0, ""


def check_live_review_page(cfg: dict) -> list[str]:
    """Return a list of failure strings (empty = pass)."""
    fails: list[str] = []
    host = cfg.get("canonical_host", "")
    path = cfg.get("review_landing_path", "/review.html")
    gbp = cfg.get("gbp", {})
    cid = gbp.get("cid", "")
    place_id = gbp.get("place_id", "")
    dead = set(cfg.get("known_wrong_listing_cids", []))
    url = f"https://{host}{path}"

    code, body = http_get(url)
    print(f"[A] GET {url} -> {code}")
    if code != 200:
        fails.append(f"review page {url} returned {code} (expected 200)")
        return fails  # nothing else to assert if it didn't load

    # The CTA may target the listing by cid (maps?cid=) OR by place_id
    # (writereview?placeid=). Accept either canonical identifier.
    identifiers = [v for v in (cid, place_id) if v]
    if identifiers and not any(v in body for v in identifiers):
        fails.append(f"neither canonical cid {cid} nor place_id {place_id} found on live review page — CTA may point at the wrong listing")
    for d in dead:
        if d in body:
            fails.append(f"known-dead listing cid {d} is LIVE on the review page — review CTA regressed")
    if not fails:
        print(f"    ✓ live review page targets the canonical listing (cid/place_id), no dead cid present")
    return fails


def check_gbp_alive(cfg: dict) -> list[str]:
    """SerpAPI GBP liveness. Skipped (returns []) if no SERPAPI_KEY."""
    api_key = os.environ.get("SERPAPI_KEY")
    if not api_key:
        print("[B] SERPAPI_KEY not set — skipping GBP liveness check (not a failure).")
        return []

    data_id = os.environ.get("SERPAPI_DATA_ID") or cfg.get("gbp", {}).get("data_id", "")
    params = urllib.parse.urlencode({
        "engine": "google_maps",
        "q": cfg.get("brand", "Frame Restoration Utah"),
        "data_id": data_id,
        "api_key": api_key,
    })
    url = f"https://serpapi.com/search.json?{params}"
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            data = json.loads(resp.read())
    except Exception as e:  # noqa: BLE001
        return [f"SerpAPI request failed: {e}"]

    if "error" in data:
        return [f"SerpAPI error: {data['error']}"]
    place = data.get("place_results") or {}
    if not place:
        locals_ = data.get("local_results") or []
        place = locals_[0] if locals_ else {}

    title = place.get("title", "")
    reviews = place.get("reviews")
    print(f"[B] SerpAPI data_id={data_id} -> title={title!r} reviews={reviews}")
    fails: list[str] = []
    if not title:
        fails.append(f"GBP data_id {data_id} returned NO business (listing dead/suspended?)")
    if not reviews or int(reviews) <= 0:
        fails.append(f"GBP {title or data_id} returned {reviews} reviews (expected > 0)")
    if not fails:
        print(f"    ✓ GBP '{title}' is live with {reviews} reviews")
    return fails


def main() -> int:
    cfg = load_cfg()
    print(f"=== CTA liveness · {cfg.get('brand')} ===")
    fails = check_live_review_page(cfg) + check_gbp_alive(cfg)
    if fails:
        print(f"\n🚨 {len(fails)} liveness failure(s):")
        for f in fails:
            print(f"  - {f}")
            print(f"::error::CTA liveness: {f}")
        return 1
    print("\n✓ all CTA liveness checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
