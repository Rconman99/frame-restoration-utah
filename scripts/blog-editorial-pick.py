#!/usr/bin/env python3
"""blog-editorial-pick.py — choose this run's Utah blog brief.

The old lane drafted whatever city the prioritizer ranked first and told the
model to lean on "well-established knowledge", which produced thin posts. This
picker feeds the drafter real, sourced material instead:

1. Storm trigger first: a prioritizer row with an ACTIVE National Weather
   Service alert (weather_event.source_url under api.weather.gov/alerts) for a
   city that has no approval PR already open. That row keeps the existing
   autobrief storm brief, anchored on the NWS alert text.
2. Otherwise the first pending item in data/blog-editorial-queue.json whose
   post is not published yet and not waiting in an open approval PR. Its brief
   carries the reader question, the distinct angle and the verbatim sourced
   quotes, and forbids any local claim that is not in those quotes.
3. Otherwise nothing: no brief is written and the run skips drafting.

Usage:
  python3 scripts/blog-target-prioritizer.py --json --top 10 > /tmp/target.json
  gh pr list --state open --json title,body,headRefName > /tmp/open-prs.json
  python3 scripts/blog-editorial-pick.py --prioritizer /tmp/target.json \
      --open-prs /tmp/open-prs.json --out /tmp/brief.json
"""
import argparse
import importlib.util
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUEUE_PATH = ROOT / "data" / "blog-editorial-queue.json"
SLUG_RE = re.compile(r"^[a-z0-9-]+$")


def _autobrief():
    spec = importlib.util.spec_from_file_location("blog_autobrief", ROOT / "scripts" / "blog-autobrief.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_queue(path: pathlib.Path) -> list:
    if not path.is_file():
        return []
    items = json.loads(path.read_text(encoding="utf-8")).get("items", [])
    if not isinstance(items, list):
        raise SystemExit("blog-editorial-pick: queue items must be a list")
    return [i for i in items if isinstance(i, dict) and i.get("status", "pending") == "pending"]


def open_pr_text(path) -> str:
    if not path or not pathlib.Path(path).is_file():
        return ""
    try:
        prs = json.loads(pathlib.Path(path).read_text(encoding="utf-8")) or []
    except json.JSONDecodeError:
        return ""
    return "\n".join(f"{p.get('title','')}\n{p.get('body','')}\n{p.get('headRefName','')}" for p in prs)


def is_published(city_slug: str, slug: str, root: pathlib.Path = ROOT) -> bool:
    return ((root / "blog" / city_slug / f"{slug}.html").is_file()
            or (root / "data" / "blog-published" / f"{slug}.json").is_file())


def item_issues(item: dict) -> list:
    issues = []
    for key in ("slug", "city_slug", "city_name", "service_slug", "service_name", "keyword"):
        if not isinstance(item.get(key), str) or not item[key].strip():
            issues.append(f"{key} is required")
    if item.get("slug") and not SLUG_RE.match(item["slug"]):
        issues.append("slug must be lowercase letters, digits and hyphens")
    ed = item.get("editorial") or {}
    for key in ("reader_question", "distinct_angle"):
        if not isinstance(ed.get(key), str) or len(ed[key].strip()) < 12:
            issues.append(f"editorial.{key} is required")
    ev = ed.get("local_evidence")
    if not isinstance(ev, list) or not ev:
        issues.append("editorial.local_evidence must hold sourced quotes")
    else:
        for e in ev:
            if not isinstance(e, dict) or len(str(e.get("claim", "")).strip()) < 12 \
                    or not str(e.get("source_url", "")).startswith("https://"):
                issues.append("each local_evidence item needs a claim and an https source_url")
                break
    return issues


def alert_row(rows: list, pr_text: str):
    for row in rows:
        wx = row.get("weather_event") or {}
        src = str(wx.get("source_url") or "")
        if not wx.get("event_context") or "api.weather.gov/alerts" not in src:
            continue
        city = row.get("city_slug") or ""
        if not city or f"/blog/{city}/" in pr_text:
            continue
        return row
    return None


def brief_from_item(item: dict, ab) -> dict:
    ed = item["editorial"]
    storm = item["service_slug"] in getattr(ab, "STORM_SERVICES", set())
    statewide = item["city_slug"] == "utah"
    facts = []
    if statewide:
        facts.append("This is a STATEWIDE Utah guide, not a city page. Do not write about one town as "
                     "the subject and do not imply a service-area boundary.")
    facts += [
        f"Reader question this post must answer directly, in the first section: {ed['reader_question']}",
        f"Angle that makes this post different from every other post on the site: {ed['distinct_angle']}",
        ("Every local, regulatory or weather statement must come from the sourced quotes below. Quote "
         "or closely paraphrase them, name the source in the sentence, and include every source URL "
         "in the sources list. Do not add any other local rule, threshold, date, statistic, price, "
         "dollar range, award, review count or years-in-business claim."),
    ]
    for e in ed["local_evidence"]:
        label = e.get("source_label") or "source"
        facts.append(f"Sourced quote ({label}, {e['source_url']}): \"{e['claim']}\"")
    facts.append(ab.CREDENTIAL_FACT)
    brief = {
        "city_slug": item["city_slug"],
        "city_name": item["city_name"],
        "zip": "",
        "service_slug": item["service_slug"],
        "service_name": item["service_name"],
        "style": "storm" if storm else "atmospheric",
        "keyword": item["keyword"],
        "weather_hook": ed.get("weather_hook", ""),
        "facts": facts,
        "internal_links": ab.STORM_LINKS if storm else ab.GENERAL_LINKS,
        "slug": item["slug"],
        "pick": "editorial-queue",
        "sources": [{"label": e.get("source_label") or "Source", "url": e["source_url"]}
                    for e in ed["local_evidence"]],
    }
    if statewide:
        brief["scope"] = "statewide"
    return brief


def pick(rows: list, queue: list, pr_text: str, ab, root: pathlib.Path = ROOT):
    notes = []
    row = alert_row(rows, pr_text)
    if row:
        brief = ab.brief_from_target(row)
        brief["pick"] = "nws-alert"
        return brief, notes
    for item in queue:
        issues = item_issues(item)
        slug = item.get("slug", "?")
        if issues:
            notes.append(f"skip {slug}: " + "; ".join(issues))
            continue
        if is_published(item["city_slug"], slug, root):
            notes.append(f"skip {slug}: already published")
            continue
        if slug in pr_text:
            notes.append(f"skip {slug}: waiting on an open approval PR")
            continue
        return brief_from_item(item, ab), notes
    return None, notes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prioritizer", required=True)
    ap.add_argument("--open-prs")
    ap.add_argument("--queue", default=str(QUEUE_PATH))
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    try:
        rows = json.loads(pathlib.Path(args.prioritizer).read_text()).get("top", [])
    except (OSError, json.JSONDecodeError):
        rows = []
    ab = _autobrief()
    brief, notes = pick(rows, load_queue(pathlib.Path(args.queue)), open_pr_text(args.open_prs), ab)
    for n in notes:
        print(n)
    if not brief:
        print("blog-editorial-pick: no NWS alert target and no free sourced topic; nothing to draft")
        return
    qt = ab.load_quality_target()
    if qt:
        brief["quality_target"] = qt
    pathlib.Path(args.out).write_text(json.dumps(brief, indent=2, ensure_ascii=False) + "\n")
    print(f"picked ({brief['pick']}): {brief['city_name']} x {brief['service_name']} "
          f"keyword={brief['keyword']} slug={brief.get('slug', '(model)')}")


if __name__ == "__main__":
    main()
