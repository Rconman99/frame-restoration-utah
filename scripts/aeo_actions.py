"""AEO action generation — turn raw SerpAPI findings into prioritized,
repo-aware, lead-value-weighted action items.

Three things this module owns:
  1. Lead-value weights per query (judgment calls, edit by hand)
  2. Expected file globs per query (where we'd look in the repo)
  3. Trend tracking + persistent action IDs across monthly runs

Outputs:
  data/aeo-citations/{date}.json        # this run's structured snapshot
  data/aeo-citations/_trend.json        # rolling time series (last 24 entries)
  data/aeo-citations/_actions.json      # current open action queue

The markdown report still gets written by the monitor — this module just adds
the JSON sidecar that's machine-readable for downstream agents.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import pathlib
import re
import subprocess
from typing import Any


# ── Per-query metadata: lead value (1-10) + file globs to check ───────────
# Lead value reflects expected $ per ranked impression. 10 = top commercial
# query Frame must own. 5 = broad discovery, lower urgency. Edit when business
# priorities shift.

QUERY_META: dict[str, dict] = {
    "best roofer Heber City Utah": {
        "lead_value": 10,
        "intent": "commercial-local-primary",
        "files": ["locations/heber-city.html", "index.html"],
        "freshness_keyword": None,
    },
    "roof replacement cost Utah 2026": {
        "lead_value": 8,
        "intent": "research-state-cost",
        "files": [
            "blog/utah/roof-replacement-cost-utah-2026.html",
            "blog/utah/roof-replacement-cost-*.html",
        ],
        "freshness_keyword": "2026",  # title should anchor to current year
    },
    "storm damage roofing Park City": {
        "lead_value": 9,
        "intent": "commercial-storm-secondary-city",
        "files": [
            "pages/storm-damage.html",
            "locations/park-city.html",
            "blog/park-city/*.html",
        ],
        "freshness_keyword": None,
    },
    "Utah roof insurance claim help": {
        "lead_value": 7,
        "intent": "commercial-insurance",
        "files": [
            "pages/insurance-claims.html",
            "blog/utah/utah-roof-insurance-claims-guide.html",
        ],
        "freshness_keyword": None,
    },
    "licensed roofer Wasatch Front": {
        "lead_value": 5,
        "intent": "broad-discovery",
        "files": [],  # no specific page; this is a reviews-acquisition long-game
        "freshness_keyword": None,
    },
}

TREND_HISTORY_LIMIT = 24  # ~2 years of monthly snapshots


# ── File metadata extraction ──────────────────────────────────────────────

def _git_last_modified(repo_root: pathlib.Path, file: pathlib.Path) -> str | None:
    """ISO date of the last commit touching this file, or None on git failure."""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", str(file.relative_to(repo_root))],
            cwd=repo_root, capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()[:10]  # YYYY-MM-DD
    except (subprocess.SubprocessError, ValueError):
        pass
    return None


def _extract_html_meta(path: pathlib.Path) -> dict:
    """Pull title, dateModified, datePublished, word count from an HTML file."""
    if not path.exists():
        return {"exists": False}
    try:
        text = path.read_text(errors="ignore")
    except OSError:
        return {"exists": False}

    title_match = re.search(r"<title>([^<]+)</title>", text, re.IGNORECASE)
    title = title_match.group(1).strip() if title_match else ""
    pub = re.search(r'"datePublished"\s*:\s*"([^"]+)"', text)
    mod = re.search(r'"dateModified"\s*:\s*"([^"]+)"', text)
    # rough body word count (strip tags, count tokens)
    body = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
    body = re.sub(r"<style[^>]*>.*?</style>", "", body, flags=re.DOTALL | re.IGNORECASE)
    body = re.sub(r"<[^>]+>", " ", body)
    word_count = len([w for w in re.split(r"\s+", body) if w])

    return {
        "exists": True,
        "title": title,
        "date_published": (pub.group(1)[:10] if pub else None),
        "date_modified_schema": (mod.group(1)[:10] if mod else None),
        "word_count": word_count,
    }


def _resolve_files(repo_root: pathlib.Path, patterns: list[str]) -> list[dict]:
    """Resolve file globs to actual file metadata records."""
    out: list[dict] = []
    seen: set[str] = set()
    for pat in patterns:
        if "*" in pat:
            for f in repo_root.glob(pat):
                rel = str(f.relative_to(repo_root))
                if rel in seen:
                    continue
                seen.add(rel)
                meta = _extract_html_meta(f)
                meta["path"] = rel
                meta["git_last_modified"] = _git_last_modified(repo_root, f)
                out.append(meta)
        else:
            f = repo_root / pat
            rel = pat
            if rel in seen:
                continue
            seen.add(rel)
            meta = _extract_html_meta(f)
            meta["path"] = rel
            meta["git_last_modified"] = _git_last_modified(repo_root, f) if f.exists() else None
            out.append(meta)
    return out


# ── Action generation ─────────────────────────────────────────────────────

def _stable_id(query: str, action_type: str) -> str:
    """Deterministic ID — same gap on the same query produces the same id
    across runs, so we can detect persistent open actions vs. one-offs.
    """
    h = hashlib.sha1(f"{query}|{action_type}".encode()).hexdigest()[:8]
    return f"aeo-{h}"


def _classify_action(query: str, finding: dict, files: list[dict]) -> tuple[str, str, list[str]]:
    """Decide action_type, severity_modifier_reason, and tags for a query.

    Returns (action_type, rationale, tags). action_type is the slug used in IDs.
    """
    cited = finding.get("target_cited", False)
    meta = QUERY_META[query]

    if cited:
        return "monitor", "Already cited — no action needed; monitor next month.", ["maintenance"]

    existing = [f for f in files if f.get("exists")]
    freshness_kw = meta.get("freshness_keyword")

    # Case 1: matching content exists, freshness keyword required, missing from title
    if existing and freshness_kw:
        for f in existing:
            title = (f.get("title") or "").lower()
            if freshness_kw.lower() not in title:
                return "freshness-anchor", (
                    f"Existing post `{f['path']}` is missing '{freshness_kw}' in its title; "
                    f"competitors are anchoring their titles to that keyword."
                ), ["title-tweak", "freshness"]
        # Has the keyword in title but still not ranking → authority/age issue
        return "authority-boost", (
            f"Post exists with correct keyword in title but isn't ranking. "
            f"Most likely a domain-authority gap (last modified "
            f"{existing[0].get('git_last_modified', 'unknown')}, "
            f"{existing[0].get('word_count', 0)} words). "
            f"Add internal links from high-authority pages + monitor 4-6 weeks."
        ), ["authority", "internal-links"]

    # Case 2: matching content exists, no freshness anchor needed
    if existing:
        f = existing[0]
        # Stale = last git mod > 90 days ago
        last_mod = f.get("git_last_modified")
        if last_mod:
            try:
                last_mod_date = dt.date.fromisoformat(last_mod)
                age_days = (dt.date.today() - last_mod_date).days
                if age_days > 90:
                    return "refresh-stale", (
                        f"`{f['path']}` exists but is {age_days} days stale. "
                        f"Refresh content + bump dateModified."
                    ), ["refresh", "freshness"]
            except ValueError:
                pass
        return "internal-link-boost", (
            f"Post `{f['path']}` exists ({f.get('word_count', 0)} words) but isn't ranking. "
            f"Likely needs internal-link authority — add links from index, locations, related blog posts."
        ), ["authority", "internal-links"]

    # Case 3: no matching content — but Wasatch Front intent is broad-discovery
    # (handled via reviews acquisition, not content)
    if meta["intent"] == "broad-discovery":
        return "reviews-acquisition", (
            "Broad-discovery query won by reviews-rich competitors. Continue "
            "$1,700/mo reviews acquisition allocation; not a content gap."
        ), ["long-game", "reviews"]

    # Case 4: no matching content, content-driven query → create new
    return "create-content", (
        f"No matching repo file for this query. Create dedicated content."
    ), ["new-content"]


def _priority_from_score(severity: int, lead_value: int) -> str:
    """Map leverage = severity × lead_value to {high, medium, low}."""
    leverage = severity * lead_value
    if leverage >= 50:
        return "high"
    if leverage >= 25:
        return "medium"
    return "low"


def _severity(action_type: str) -> int:
    """Severity 1-10 — how urgently this action would move the needle."""
    return {
        "freshness-anchor": 8,       # quick title fix, real impact
        "authority-boost": 6,        # internal link work, slower
        "refresh-stale": 7,          # content refresh, multi-week impact
        "internal-link-boost": 5,    # incremental, compounds slowly
        "create-content": 9,         # net new content, biggest lift
        "reviews-acquisition": 4,    # already in motion, no new urgency
        "monitor": 0,                # no action — already winning
    }.get(action_type, 5)


def _effort_hours(action_type: str) -> float:
    """Rough effort estimate for prioritization — adjust based on what works."""
    return {
        "freshness-anchor": 0.5,
        "authority-boost": 2.0,
        "refresh-stale": 2.5,
        "internal-link-boost": 1.5,
        "create-content": 6.0,
        "reviews-acquisition": 0.0,  # already budgeted/in-flight
        "monitor": 0.0,
    }.get(action_type, 2.0)


def generate_actions(repo_root: pathlib.Path, findings: list[dict]) -> list[dict]:
    """Convert analyzed query findings into structured action records."""
    actions: list[dict] = []
    today = dt.date.today().isoformat()

    for finding in findings:
        query = finding.get("query", "")
        meta = QUERY_META.get(query)
        if not meta:
            continue
        files = _resolve_files(repo_root, meta["files"]) if meta["files"] else []

        action_type, rationale, tags = _classify_action(query, finding, files)
        if action_type == "monitor":
            continue  # don't surface "no action needed" as an action

        severity = _severity(action_type)
        priority = _priority_from_score(severity, meta["lead_value"])
        leverage = severity * meta["lead_value"]

        actions.append({
            "id": _stable_id(query, action_type),
            "query": query,
            "action_type": action_type,
            "priority": priority,
            "title": _action_title(action_type, query, files),
            "rationale": rationale,
            "files": [f["path"] for f in files if f.get("exists")],
            "files_meta": [
                {k: v for k, v in f.items() if k in
                 ("path", "title", "date_modified_schema", "git_last_modified", "word_count")}
                for f in files if f.get("exists")
            ],
            "lead_value": meta["lead_value"],
            "severity": severity,
            "leverage": leverage,
            "effort_hours": _effort_hours(action_type),
            "tags": tags,
            "first_seen": today,
            "last_seen": today,
            "weeks_open": 0,
        })

    actions.sort(key=lambda a: (-a["leverage"], a["effort_hours"]))
    return actions


def _action_title(action_type: str, query: str, files: list[dict]) -> str:
    """Human-readable one-liner for the action."""
    primary_file = next((f["path"] for f in files if f.get("exists")), None)
    if action_type == "freshness-anchor" and primary_file:
        return f"Add freshness keyword to title: `{primary_file}`"
    if action_type == "authority-boost" and primary_file:
        return f"Boost internal-link authority for `{primary_file}` (target: {query!r})"
    if action_type == "refresh-stale" and primary_file:
        return f"Refresh stale post: `{primary_file}` (target: {query!r})"
    if action_type == "internal-link-boost" and primary_file:
        return f"Add internal links pointing to `{primary_file}` (target: {query!r})"
    if action_type == "create-content":
        return f"Create new content for {query!r}"
    if action_type == "reviews-acquisition":
        return f"Continue reviews acquisition (long-game for {query!r})"
    return f"Action for {query!r}"


# ── Trend + persistence ───────────────────────────────────────────────────

def update_trend(out_dir: pathlib.Path, snapshot: dict) -> dict:
    """Append today's snapshot to the rolling trend file. Returns the trend dict."""
    trend_path = out_dir / "_trend.json"
    if trend_path.exists():
        try:
            trend = json.loads(trend_path.read_text())
        except json.JSONDecodeError:
            trend = {"history": []}
    else:
        trend = {"history": []}

    # Replace today's entry if it already exists (idempotent re-run)
    today = snapshot["date"]
    trend["history"] = [h for h in trend["history"] if h.get("date") != today]
    trend["history"].append(snapshot)
    trend["history"].sort(key=lambda h: h["date"])
    trend["history"] = trend["history"][-TREND_HISTORY_LIMIT:]

    trend_path.write_text(json.dumps(trend, indent=2))
    return trend


def merge_with_prior_actions(new: list[dict], out_dir: pathlib.Path) -> list[dict]:
    """Persist actions across runs — increment weeks_open, preserve first_seen."""
    prior_path = out_dir / "_actions.json"
    if not prior_path.exists():
        return new
    try:
        prior = json.loads(prior_path.read_text()).get("open_actions", [])
    except json.JSONDecodeError:
        return new

    prior_by_id = {a["id"]: a for a in prior}
    today = dt.date.today()
    for action in new:
        if action["id"] in prior_by_id:
            old = prior_by_id[action["id"]]
            action["first_seen"] = old.get("first_seen", action["first_seen"])
            try:
                first = dt.date.fromisoformat(action["first_seen"])
                action["weeks_open"] = (today - first).days // 7
            except ValueError:
                pass
    return new


def write_actions(out_dir: pathlib.Path, actions: list[dict]) -> pathlib.Path:
    actions_path = out_dir / "_actions.json"
    actions_path.write_text(json.dumps({
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "open_actions": actions,
    }, indent=2))
    return actions_path


def render_trend_sparkline(trend: dict) -> str:
    """ASCII sparkline of last N scores. Each `▁▂▃▄▅▆▇█` block = score 0..5."""
    blocks = "▁▂▃▄▅▆▇█"
    history = trend.get("history", [])[-12:]
    if not history:
        return "(no history yet)"
    line = ""
    for h in history:
        score = h.get("score_total", 0)
        idx = min(len(blocks) - 1, max(0, int(score)))
        line += blocks[idx]
    first = history[0]["date"]
    last = history[-1]["date"]
    scores = " → ".join(f"{h['score_total']}/{h.get('score_max', 5)}" for h in history)
    return f"{line}  ({first} → {last}: {scores})"


def render_action_table(actions: list[dict], top_n: int = 5) -> str:
    """Render top-N actions as a markdown table for the report."""
    if not actions:
        return "_No open actions — Frame is cited on every monitored query._"
    lines = [
        "| Pri | Lev | Action | File | Effort |",
        "|---|---:|---|---|---:|",
    ]
    for a in actions[:top_n]:
        pri_emoji = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(a["priority"], "⚪")
        file_str = a["files"][0] if a["files"] else "—"
        lines.append(
            f"| {pri_emoji} {a['priority']} | {a['leverage']} | {a['title']} "
            f"| `{file_str}` | {a['effort_hours']}h |"
        )
    if len(actions) > top_n:
        lines.append(f"\n_…+{len(actions) - top_n} more in `_actions.json`_")
    return "\n".join(lines)
