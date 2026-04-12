#!/usr/bin/env python3
"""
IndexNow Bulk Submission for Frame Roofing Utah

Reads sitemap.xml and submits all URLs to Bing/Yandex/Naver/Yep
via the IndexNow protocol. Google has been accepting IndexNow
submissions since 2025.

Usage:
    python3 scripts/indexnow-submit.py              # Submit all URLs from sitemap
    python3 scripts/indexnow-submit.py --dry-run     # Show what would be submitted
    python3 scripts/indexnow-submit.py --url https://www.frameroofingutah.com/pages/roof-repair

IndexNow supports up to 10,000 URLs per batch request.
No rate limits. No structured data requirements. Free.
"""

import argparse
import json
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

HOST = "www.frameroofingutah.com"
KEY = "50319c55a63045fca82b1ecb978980b5"
KEY_LOCATION = f"https://{HOST}/{KEY}.txt"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
SITEMAP_PATH = PROJECT_ROOT / "sitemap.xml"


def parse_sitemap(path: Path) -> list[str]:
    """Extract all <loc> URLs from sitemap.xml."""
    text = path.read_text()
    return re.findall(r"<loc>(.*?)</loc>", text)


def submit_batch(urls: list[str], dry_run: bool = False) -> dict:
    """Submit URLs to IndexNow API in a single batch request."""
    payload = {
        "host": HOST,
        "key": KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": urls,
    }

    if dry_run:
        print(f"\n[DRY RUN] Would submit {len(urls)} URLs to IndexNow:")
        for url in urls[:10]:
            print(f"  {url}")
        if len(urls) > 10:
            print(f"  ... and {len(urls) - 10} more")
        return {"status": "dry_run", "count": len(urls)}

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        INDEXNOW_ENDPOINT,
        data=data,
        headers={
            "Content-Type": "application/json; charset=utf-8",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
            print(f"\nIndexNow response: HTTP {status}")
            if status == 200:
                print(f"  Submitted {len(urls)} URLs successfully")
                return {"status": "ok", "count": len(urls), "http": status}
            elif status == 202:
                print(f"  Accepted {len(urls)} URLs (processing)")
                return {"status": "accepted", "count": len(urls), "http": status}
    except urllib.error.HTTPError as e:
        print(f"\nIndexNow error: HTTP {e.code}")
        if e.code == 422:
            print("  Invalid URL(s) in batch")
        elif e.code == 429:
            print("  Rate limited — try again later")
        else:
            body = e.read().decode() if e.fp else ""
            print(f"  {body[:200]}")
        return {"status": "error", "http": e.code}
    except Exception as e:
        print(f"\nError: {e}")
        return {"status": "error", "message": str(e)}


def submit_single(url: str, dry_run: bool = False) -> dict:
    """Submit a single URL via GET request."""
    if dry_run:
        print(f"[DRY RUN] Would submit: {url}")
        return {"status": "dry_run"}

    params = f"url={urllib.request.quote(url, safe='/:')}&key={KEY}"
    req_url = f"{INDEXNOW_ENDPOINT}?{params}"

    try:
        req = urllib.request.Request(req_url)
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"  {url} → HTTP {resp.status}")
            return {"status": "ok", "http": resp.status}
    except urllib.error.HTTPError as e:
        print(f"  {url} → HTTP {e.code}")
        return {"status": "error", "http": e.code}


def main():
    parser = argparse.ArgumentParser(description="Submit URLs to IndexNow")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be submitted")
    parser.add_argument("--url", help="Submit a single URL instead of full sitemap")
    parser.add_argument("--google-ping", action="store_true", help="Also ping Google sitemap")
    args = parser.parse_args()

    print(f"IndexNow Submission — {HOST}")
    print(f"Key: {KEY[:8]}...")
    print(f"Key file: {KEY_LOCATION}")

    if args.url:
        print(f"\nSubmitting single URL:")
        submit_single(args.url, dry_run=args.dry_run)
    else:
        if not SITEMAP_PATH.exists():
            print(f"\nError: sitemap.xml not found at {SITEMAP_PATH}")
            sys.exit(1)

        urls = parse_sitemap(SITEMAP_PATH)
        print(f"\nFound {len(urls)} URLs in sitemap.xml")

        # IndexNow accepts up to 10,000 per batch — we're well under
        result = submit_batch(urls, dry_run=args.dry_run)

        if result.get("status") in ("ok", "accepted"):
            print(f"\nAll {len(urls)} URLs submitted to IndexNow.")
            print("Bing, Yandex, Naver, and Yep will process these within 24-48 hours.")
            print("Google may also pick these up (they've been accepting IndexNow since 2025).")

    # Optionally ping Google's sitemap endpoint
    if args.google_ping and not args.dry_run:
        print(f"\nPinging Google sitemap...")
        ping_url = f"https://www.google.com/ping?sitemap=https://{HOST}/sitemap.xml"
        try:
            req = urllib.request.Request(ping_url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                print(f"  Google ping: HTTP {resp.status}")
        except Exception as e:
            print(f"  Google ping failed: {e}")

    print("\nDone.")


if __name__ == "__main__":
    main()
