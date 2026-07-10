#!/usr/bin/env python3
"""blog-traction.py (Utah) — the blog traction tracker.

Builds a single committed snapshot of every published blog post joined to its
real-world traction, so the /seo dashboard (and the enhancer) can answer one
question: which posts are actually working, and is each new post better than
the last?

Utah twin of the Texas tracker. Utah renders posts FLAT-BY-CITY as
blog/<city>/<slug>.html (one html file per post, city = parent dir), so the
walk + city attribution are simpler than Texas's slug-token inference.

Zero-secret / CI-safe: everything is on disk.
  - Post corpus: blog/<city>/*.html (skipping city-hub index.html files).
  - Per-post STRUCTURE (words, H2s, FAQs, sources, schema, freshness) is parsed
    from the rendered HTML + its BlogPosting/FAQPage JSON-LD. Always available;
    the axis the enhancer ratchets on.
  - Per-post TRAFFIC (PostHog pageviews) is merged from the OPTIONAL committed
    snapshot data/posthog-blog-views.json (path -> {views_30d,90d,all}, summed
    across both Utah production hosts). Absent -> null views, traction falls
    back to the quality score. A PostHog read key is only needed to refresh
    that snapshot, never to build the tracker.

Outputs (committed, fetched by the /seo dashboard):
  - data/blog-traction.json          — ranked posts + per-city rollup + champion
  - data/blog-traction-history.jsonl — one dated line per run (trend / proof)

Usage:
  python3 scripts/blog-traction.py            # build + write the snapshot
  python3 scripts/blog-traction.py --stdout   # print JSON, write nothing
  python3 scripts/blog-traction.py --no-history
"""

from __future__ import annotations

import argparse
import json
import re
from html.parser import HTMLParser
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
BLOG_DIR = ROOT / "blog"
VIEWS_SNAPSHOT = ROOT / "data" / "posthog-blog-views.json"
OUT_JSON = ROOT / "data" / "blog-traction.json"
HISTORY = ROOT / "data" / "blog-traction-history.jsonl"
MARKET = "utah"

# Structural quality targets (the "100%" reference for the quality score),
# mirroring the drafter's own spec (~1500 words, 7-8 H2s, 5 FAQs, 5 sources).
TARGET_WORDS = 1500
TARGET_H2 = 7
TARGET_FAQS = 5
TARGET_SOURCES = 5
TARGET_INTERNAL_LINKS = 5
REQUIRED_SCHEMA = ("BlogPosting", "FAQPage")
FRESH_DAYS = 120
TRAFFIC_BONUS = 40.0  # max points a top-traffic post gains over its quality score

SERVICE_TERMS = {
    "storm-damage": ("storm", "hail", "wind"),
    "roof-replacement": ("replacement", "reroof", "reroofing"),
    "roof-repair": ("repair", "leak"),
    "insurance-claims": ("claim", "insurance"),
    "gutters": ("gutter", "drainage"),
    "ventilation": ("ventilation", "ridge-vent", "vent"),
    "snow-ice": ("snow", "ice-dam", "ice"),
    "emergency-tarping": ("tarping", "tarp", "emergency"),
    "commercial-roofing": ("commercial", "flat-roof", "tpo"),
}


def infer_service(slug: str) -> str | None:
    for svc, terms in SERVICE_TERMS.items():
        if any(t in slug for t in terms):
            return svc
    return None


def visible_text(fragment: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", fragment, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


_VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
              "link", "meta", "param", "source", "track", "wbr"}


class _BlogBodyExtractor(HTMLParser):
    """Depth-aware extraction of the <article|div class="blog-body"> element's
    inner HTML. Regex can't do this: current posts use <article>, ~7 legacy
    posts use <div> with nested divs (non-greedy truncates, greedy over-grabs),
    and the .blog-body CSS rule would false-match. HTMLParser treats <style>
    content as data, tracks nesting, and skips void tags."""

    def __init__(self, line_starts):
        super().__init__(convert_charrefs=False)
        self._ls = line_starts
        self.in_body = False
        self.depth = 0
        self.start_off = None
        self.end_off = None

    def _off(self):
        line, col = self.getpos()
        return self._ls[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if self.end_off is not None:
            return
        if not self.in_body:
            cls = (dict(attrs).get("class") or "").split()
            if "blog-body" in cls:
                self.in_body = True
                self.depth = 1
                self.start_off = self._off() + len(self.get_starttag_text() or "")
        elif tag not in _VOID_TAGS:
            self.depth += 1

    def handle_endtag(self, tag):
        if self.in_body and self.end_off is None and tag not in _VOID_TAGS:
            self.depth -= 1
            if self.depth == 0:
                self.end_off = self._off()
                self.in_body = False


def extract_blog_body(htmltext: str) -> str:
    line_starts = [0]
    for i, ch in enumerate(htmltext):
        if ch == "\n":
            line_starts.append(i + 1)
    try:
        p = _BlogBodyExtractor(line_starts)
        p.feed(htmltext)
        if p.start_off is not None and p.end_off is not None and p.end_off > p.start_off:
            return htmltext[p.start_off:p.end_off]
    except Exception:
        pass
    # fallback: simple article match, else whole doc
    m = re.search(r'<article[^>]*class="blog-body"[^>]*>([\s\S]*?)</article>', htmltext, re.I)
    return m.group(1) if m else htmltext


def count_sources(body: str) -> int:
    """Distinct citation URLs in the Sources citation LIST only. Bounding to the
    <ul>/<ol> right after the Sources heading (not "to the next H2/end") keeps
    the trailing CTA/booking link out of the count when Sources is the final
    section — counting every external anchor would inflate sources + the
    ratcheted benchmark."""
    m = re.search(
        r'<h2\b[^>]*>\s*(?:sources|references)[^<]*</h2>\s*<(ul|ol)\b[^>]*>([\s\S]*?)</\1>',
        body, re.I)
    region = m.group(2) if m else ""
    urls = re.findall(r'<a[^>]+href="(https?://[^"]+)"', region)
    return len(set(urls))


def count_content_h2(body: str) -> int:
    """Article-depth H2 count: exclude the FAQ heading (id="faq" lives in the
    OPENING tag, not the inner text) and the Sources heading. Prefix match so
    "Sources & References" / "Frequently Asked Questions" are both caught."""
    n = 0
    for m in re.finditer(r"<h2\b([^>]*)>([\s\S]*?)</h2>", body):
        attrs = m.group(1).lower()
        txt = re.sub(r"<[^>]+>", "", m.group(2)).strip().lower()
        if "faq" in attrs or txt.startswith("frequently asked") or txt.startswith("source"):
            continue
        n += 1
    return n


def parse_jsonld(htmltext: str) -> list[dict]:
    blocks = []
    for m in re.finditer(r'<script type="application/ld\+json">([\s\S]*?)</script>', htmltext):
        try:
            blocks.append(json.loads(m.group(1)))
        except Exception:
            continue
    return blocks


def days_between(iso_a: str, iso_b: str) -> int | None:
    try:
        return (date.fromisoformat(iso_a[:10]) - date.fromisoformat(iso_b[:10])).days
    except Exception:
        return None


def analyze_post(html_file: Path, city: str, today: str, views_map: dict[str, dict]) -> dict[str, Any] | None:
    htmltext = html_file.read_text(encoding="utf-8", errors="ignore")
    blocks = parse_jsonld(htmltext)
    schema_types: list[str] = []
    blogposting = faqpage = None
    for b in blocks:
        # some posts wrap several nodes in a @graph
        nodes = b.get("@graph") if isinstance(b, dict) and "@graph" in b else [b]
        for node in nodes if isinstance(nodes, list) else [nodes]:
            if not isinstance(node, dict):
                continue
            t = node.get("@type")
            if isinstance(t, list):
                schema_types.extend(t)
            elif t:
                schema_types.append(t)
            if t == "BlogPosting" or (isinstance(t, list) and "BlogPosting" in t):
                blogposting = node
            elif t == "FAQPage" or (isinstance(t, list) and "FAQPage" in t):
                faqpage = node

    slug = html_file.stem
    # Every non-index file in a city dir IS a post. Prefer BlogPosting JSON-LD;
    # fall back to HTML head/body for the ~handful of legacy posts that predate
    # the schema (they surface here as low-quality laggards to fix, not vanish).
    bp = blogposting or {}
    # Filesystem layout is authoritative: posts live at blog/<city>/<slug>.html
    # and deploy to /blog/<city>/<slug> (cleanUrls). Some legacy BlogPosting
    # canonicals omit the city, which broke the PostHog traffic join and
    # produced 404 dashboard links — so derive path + URL from disk, not the
    # (occasionally wrong) canonical.
    path = f"/blog/{city}/{slug}"
    url = f"https://www.framerestorationutah.com{path}"

    def _head(*pats):
        for pat in pats:
            m = re.search(pat, htmltext)
            if m:
                return m.group(1).strip()
        return ""

    body = extract_blog_body(htmltext)
    words = len(visible_text(body).split())
    h2 = count_content_h2(body)
    if faqpage is not None:
        faqs = len(faqpage.get("mainEntity", []))
    else:
        faqs = len(re.findall(r'"@type":\s*"Question"', htmltext))
    sources = count_sources(body)
    # Count only links the ARTICLE earned — not nav/footer/location-list chrome
    # (page-wide chrome is identical on every post and would inflate the score).
    internal_links = len(re.findall(r'<a[^>]+href="/(?:blog|pages|services|locations)/', body))

    date_pub = str(bp.get("datePublished") or _head(
        r'<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"',
        r'<time[^>]+datetime="([^"]+)"'))[:10]
    date_mod = str(bp.get("dateModified") or _head(
        r'<meta[^>]+property="article:modified_time"[^>]+content="([^"]+)"') or date_pub)[:10] or date_pub
    title = (bp.get("headline") or _head(
        r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"',
        r"<h1[^>]*>([\s\S]*?)</h1>") or slug)
    title = re.sub(r"<[^>]+>", "", title).strip()

    views = views_map.get(path) or views_map.get(path.rstrip("/")) or {}

    post = {
        "slug": slug,
        "url": url,
        "path": path,
        "title": title,
        "city_slug": city,
        "service_slug": infer_service(slug),
        "layout": "city-file",
        "date_published": date_pub or None,
        "date_modified": date_mod or None,
        "age_days": days_between(today, date_pub),
        "freshness_days": days_between(today, date_mod),
        "words": words,
        "h2": h2,
        "faqs": faqs,
        "sources": sources,
        "internal_links": internal_links,
        "schema": sorted(set(schema_types)),
        "views_30d": views.get("views_30d"),
        "views_90d": views.get("views_90d"),
        "views_all": views.get("views_all"),
    }
    post["quality_score"] = quality_score(post)
    return post


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def quality_score(p: dict) -> float:
    """0-100 structural completeness. Zero-traffic-dependent; the axis the
    enhancer's hard floor and the drafter target ride on."""
    words = _clamp01(p["words"] / TARGET_WORDS) * 30
    h2 = _clamp01(p["h2"] / TARGET_H2) * 15
    faqs = _clamp01(p["faqs"] / TARGET_FAQS) * 15
    sources = _clamp01(p["sources"] / TARGET_SOURCES) * 10
    links = _clamp01(p["internal_links"] / TARGET_INTERNAL_LINKS) * 10
    have = sum(1 for s in REQUIRED_SCHEMA if s in p["schema"])
    schema = (have / len(REQUIRED_SCHEMA)) * 10
    fd = p.get("freshness_days")
    if fd is None:
        fresh = 5.0
    elif fd <= FRESH_DAYS:
        fresh = 10.0
    else:
        fresh = max(0.0, 10.0 - (fd - FRESH_DAYS) / 30.0)
    return round(words + h2 + faqs + sources + links + schema + fresh, 1)


def add_traction_scores(posts: list[dict]) -> bool:
    """A post's traction is a traffic-weighted blend ONLY when we actually have
    a pageview reading for it; a post with no PostHog row (views_90d is None)
    falls back to its quality score rather than being treated as 0 views. That
    keeps unmeasured posts — and every freshly-published one, until the traffic
    snapshot is refreshed — from being buried at 40% of quality."""
    if not posts:
        return False
    measured = [p.get("views_90d") for p in posts if p.get("views_90d") is not None]
    has_traffic = any(v for v in measured)
    max_views = (max(measured) if measured else 0) or 1
    # Traffic is a BONUS on top of quality, never a penalty: a measured post is
    # lifted above its quality peers in proportion to its pageviews, while an
    # unmeasured post (no PostHog row, incl. every freshly-published one) sits at
    # its quality score — not buried. This keeps the real traffic leader as the
    # champion instead of letting a pristine-but-unmeasured post outrank it.
    for p in posts:
        v90 = p.get("views_90d")
        bonus = _clamp01(v90 / max_views) * TRAFFIC_BONUS if (has_traffic and v90 is not None) else 0.0
        p["traction_score"] = round(p["quality_score"] + bonus, 1)
    return has_traffic


def rollup_by_city(posts: list[dict]) -> list[dict]:
    buckets: dict[str, dict] = {}
    for p in posts:
        key = p["city_slug"] or "_statewide"
        b = buckets.setdefault(key, {"city_slug": p["city_slug"], "posts": 0,
                                     "views_90d": 0, "quality_sum": 0.0, "top": None})
        b["posts"] += 1
        b["views_90d"] += (p.get("views_90d") or 0)
        b["quality_sum"] += p["quality_score"]
        if b["top"] is None or p["traction_score"] > b["top"]["traction_score"]:
            b["top"] = {"slug": p["slug"], "path": p["path"], "traction_score": p["traction_score"]}
    out = []
    for b in buckets.values():
        out.append({
            "city_slug": b["city_slug"],
            "posts": b["posts"],
            "views_90d": b["views_90d"],
            "avg_quality": round(b["quality_sum"] / b["posts"], 1),
            "top_slug": b["top"]["slug"] if b["top"] else None,
            "top_path": b["top"]["path"] if b["top"] else None,
        })
    out.sort(key=lambda x: (-x["views_90d"], -x["avg_quality"]))
    return out


def build(today: str) -> dict:
    views_map: dict[str, dict] = {}
    if VIEWS_SNAPSHOT.is_file():
        try:
            raw = json.loads(VIEWS_SNAPSHOT.read_text())
            views_map = raw.get("by_path", raw) if isinstance(raw, dict) else {}
        except Exception:
            views_map = {}

    posts: list[dict] = []
    if BLOG_DIR.is_dir():
        for city_dir in sorted(BLOG_DIR.iterdir()):
            if not city_dir.is_dir():
                continue
            for f in sorted(city_dir.glob("*.html")):
                if f.name == "index.html":
                    continue  # city hub, not a post
                p = analyze_post(f, city=city_dir.name, today=today, views_map=views_map)
                if p:
                    posts.append(p)

    has_traffic = add_traction_scores(posts)
    posts.sort(key=lambda p: -p["traction_score"])
    champion = posts[0] if posts else None
    laggards = sorted(posts, key=lambda p: p["quality_score"])[:5]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "market": MARKET,
        "traffic_source": "posthog" if has_traffic else "structural-only",
        "post_count": len(posts),
        "targets": {"words": TARGET_WORDS, "h2": TARGET_H2, "faqs": TARGET_FAQS,
                    "sources": TARGET_SOURCES, "internal_links": TARGET_INTERNAL_LINKS},
        "champion": ({"slug": champion["slug"], "title": champion["title"],
                      "traction_score": champion["traction_score"],
                      "quality_score": champion["quality_score"],
                      "by": "traction" if has_traffic else "quality"} if champion else None),
        "by_city": rollup_by_city(posts),
        "laggards": [{"slug": p["slug"], "quality_score": p["quality_score"],
                      "words": p["words"], "freshness_days": p["freshness_days"]} for p in laggards],
        "posts": posts,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stdout", action="store_true", help="print JSON, write nothing")
    ap.add_argument("--no-history", action="store_true", help="don't append the history line")
    ap.add_argument("--date", default=date.today().isoformat())
    args = ap.parse_args()

    snap = build(args.date)

    if args.stdout:
        print(json.dumps(snap, indent=2, ensure_ascii=False))
        return

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(snap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if not args.no_history:
        agg = {
            "date": args.date,
            "generated_at": snap["generated_at"],
            "post_count": snap["post_count"],
            "traffic_source": snap["traffic_source"],
            "avg_quality": round(sum(p["quality_score"] for p in snap["posts"]) / snap["post_count"], 1)
                           if snap["post_count"] else 0,
            "total_views_90d": sum((p.get("views_90d") or 0) for p in snap["posts"]),
            "champion": snap["champion"]["slug"] if snap["champion"] else None,
        }
        with HISTORY.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(agg, ensure_ascii=False) + "\n")

    c = snap["champion"]
    print(f"blog-traction: {snap['post_count']} posts, source={snap['traffic_source']}, "
          f"champion={c['slug'] if c else 'none'} "
          f"(traction {c['traction_score'] if c else '-'})")
    print(f"  wrote {OUT_JSON.relative_to(ROOT)}"
          + ("" if args.no_history else f" + appended {HISTORY.relative_to(ROOT)}"))


if __name__ == "__main__":
    main()
