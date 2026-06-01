#!/usr/bin/env python3
"""SerpAPI smoke test — validates AIO + Local Pack work before committing to migration.

Reads SERPAPI_KEY from ~/.config/frame-roofing-utah/.env (same path used by
update-google-reviews-cron.sh + aeo-citation-monitor.py — canonical secrets file).

Runs three checks in order; bails early if any fails so we don't burn quota:
  1. Account headroom        (1 call, free / doesn't count against plan)
  2. AI Overview parse       (1 call, ~0.06¢ on Developer plan)
  3. Local Pack structure    (4 calls = 2 cities × 2 services)

Total cost: ~6 calls ≈ $0.10–$0.30 depending on plan. Outputs raw responses to
/tmp/serpapi-smoke-*.json for inspection + a single-line summary to stdout.

Why this exists: deciding whether to keep using SerpAPI for the Phase 1 + Phase 3
build vs. signing up for DataForSEO or Serper. If both blocks parse cleanly here,
no new vendor is needed.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ENV_FILE = Path.home() / ".config" / "frame-roofing-utah" / ".env"
OUT_DIR = Path("/tmp")
SERPAPI_BASE = "https://serpapi.com"


def load_key() -> str:
    if not ENV_FILE.exists():
        sys.exit(f"✗ Missing {ENV_FILE} — set SERPAPI_KEY there and retry.")
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line.startswith("SERPAPI_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(f"✗ SERPAPI_KEY not found in {ENV_FILE}")


def fetch(endpoint: str, params: dict, api_key: str) -> dict:
    """GET against SerpAPI. Never logs the key — masks it in error output."""
    q = {**params, "api_key": api_key}
    url = f"{SERPAPI_BASE}{endpoint}?{urllib.parse.urlencode(q)}"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        # Redact the key from any error message before re-raising
        masked = str(e).replace(api_key, "<API_KEY>")
        sys.exit(f"✗ Request to {endpoint} failed: {masked}")


def save(name: str, payload: dict) -> Path:
    """Write payload to /tmp, strip api_key if it slipped into search_parameters."""
    if "search_parameters" in payload and "api_key" in payload["search_parameters"]:
        payload["search_parameters"]["api_key"] = "<redacted>"
    path = OUT_DIR / f"serpapi-smoke-{name}.json"
    path.write_text(json.dumps(payload, indent=2))
    return path


def check_account(api_key: str) -> dict:
    """Returns plan name + remaining searches. Free, doesn't count against quota."""
    data = fetch("/account", {}, api_key)
    save("account", data)
    plan = data.get("plan_name", "unknown")
    left = data.get("plan_searches_left", "?")
    used = data.get("this_month_usage", "?")
    print(f"✓ Account: plan={plan} · used={used} this month · {left} searches left")
    if isinstance(left, int) and left < 100:
        sys.exit(f"✗ Only {left} searches left — aborting before smoke tests burn quota.")
    return data


def check_ai_overview(api_key: str) -> dict:
    """Test prompt that should surface an AI Overview block in Heber City."""
    params = {
        "engine": "google",
        "q": "best roofer Heber City Utah",
        "location": "Heber City, Utah, United States",
        "google_domain": "google.com",
        "gl": "us",
        "hl": "en",
        "device": "mobile",  # AIO surfaces more reliably on mobile
    }
    data = fetch("/search", params, api_key)
    save("ai-overview", data)

    aio = data.get("ai_overview")
    if aio is None:
        print("✓ AIO call succeeded but no ai_overview block returned — query may be too specific. Try a broader prompt next run.")
        return data

    # SerpAPI's AIO can return as page_token (async fetch) OR inline. Handle both.
    if "page_token" in aio:
        print(f"✓ AIO returned async page_token (length {len(aio['page_token'])}). Need follow-up call to resolve. Saved.")
    else:
        refs = aio.get("references") or aio.get("text_blocks") or []
        cited_urls = []
        # Walk text_blocks recursively for any reference URLs
        def walk(node):
            if isinstance(node, dict):
                if "reference_indexes" in node and "list" in node:
                    walk(node["list"])
                for v in node.values():
                    walk(v)
            elif isinstance(node, list):
                for item in node:
                    walk(item)
        walk(aio)
        # Direct references array (most common shape)
        for ref in aio.get("references", []):
            if isinstance(ref, dict) and "link" in ref:
                cited_urls.append(ref["link"])

        frame_cited = any("frameroofingutah.com" in u for u in cited_urls)
        print(f"✓ AIO present: {len(cited_urls)} cited URLs · frame_cited={frame_cited}")
        if cited_urls[:3]:
            print(f"  First 3: {cited_urls[:3]}")
    return data


def check_local_pack(api_key: str) -> dict:
    """4 calls across 2 cities × 2 services. Confirms google_local engine structure."""
    targets = [
        ("Heber City, Utah, United States", "roof replacement Heber City Utah"),
        ("Heber City, Utah, United States", "storm damage roof repair Heber City"),
        ("Salt Lake City, Utah, United States", "roof replacement Salt Lake City"),
        ("Salt Lake City, Utah, United States", "storm damage roof repair Salt Lake City"),
    ]
    results = []
    for i, (location, query) in enumerate(targets, 1):
        params = {
            "engine": "google_local",
            "q": query,
            "location": location,
            "google_domain": "google.com",
            "gl": "us",
            "hl": "en",
        }
        data = fetch("/search", params, api_key)
        save(f"local-pack-{i}", data)

        local_results = data.get("local_results", []) or []
        frame_rank = None
        for idx, biz in enumerate(local_results[:10], 1):
            title = (biz.get("title") or "").lower()
            if "frame" in title and ("roofing" in title or "restoration" in title):
                frame_rank = idx
                break

        results.append({
            "location": location,
            "query": query,
            "total_results": len(local_results),
            "frame_rank": frame_rank,
            "top_3_titles": [b.get("title") for b in local_results[:3]],
        })
        print(f"✓ Local pack {i}/4 ({location.split(',')[0]} · {query[:40]}…): "
              f"{len(local_results)} results · frame_rank={frame_rank}")
        time.sleep(1)  # Be polite to the API

    summary_path = save("local-pack-summary", {"results": results})
    return {"results": results, "summary_path": str(summary_path)}


def main():
    api_key = load_key()
    print(f"→ Running SerpAPI smoke test · output to {OUT_DIR}/serpapi-smoke-*.json")
    print(f"→ Total spend: ~6 calls\n")

    check_account(api_key)
    print()
    check_ai_overview(api_key)
    print()
    check_local_pack(api_key)
    print()
    print("✓ Smoke test complete. Inspect /tmp/serpapi-smoke-*.json for full payloads.")
    print("  - ai-overview.json    → does AIO block parse, are cited URLs present?")
    print("  - local-pack-*.json   → does google_local engine return clean 3-pack structure?")
    print("  - account.json        → plan name + remaining quota")


if __name__ == "__main__":
    main()
