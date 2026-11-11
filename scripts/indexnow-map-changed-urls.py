#!/usr/bin/env python3
"""Map changed repo paths to public sitemap URLs.

Writes one URL per line, capped at 200. If none of the changed pages are in
the sitemap, writes nothing — not a bare newline. A bare newline made
urls.txt look non-empty to `[ -s urls.txt ]` and broke the IndexNow job
(run 43074212567 on ffcd6f51).
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

DEFAULT_LIMIT = 200


def map_changed(changed_text: str, sitemap_text: str, limit: int = DEFAULT_LIMIT) -> list[str]:
    """Return sitemap URLs for changed .html paths, in first-seen order."""
    locs = re.findall(r"<loc>(.*?)</loc>", sitemap_text)
    by_path: dict[str, str] = {}
    for url in locs:
        path = re.sub(r"^https?://[^/]+", "", url).rstrip("/") or "/"
        by_path[path] = url
    out: list[str] = []
    for filename in changed_text.split():
        if not filename.endswith(".html"):
            continue
        path = "/" + filename
        path = re.sub(r"/index\.html$", "", path)
        path = re.sub(r"\.html$", "", path)
        path = path.rstrip("/") or "/"
        if path in by_path and by_path[path] not in out:
            out.append(by_path[path])
    return out[:limit]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Map changed files to sitemap URLs (empty output when none match)."
    )
    parser.add_argument("--changed-file", default="changed.txt")
    parser.add_argument("--sitemap", default="sitemap.xml")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    args = parser.parse_args()

    urls = map_changed(
        pathlib.Path(args.changed_file).read_text(),
        pathlib.Path(args.sitemap).read_text(),
        limit=args.limit,
    )
    if urls:
        sys.stdout.write("\n".join(urls) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
