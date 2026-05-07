#!/usr/bin/env python3
"""AEO citation monitor for Frame Roofing Utah — replaces the claude.ai/code
trigger that ran 5 WebSearches + 5 WebFetches + wrote a report each month.

Approach:
  - SerpAPI for Google SERP + AI Overview check per query
  - OpenRouter Perplexity Sonar (optional) for AI-search citation check
  - mistral-nemo:12b drafts the "Action items" section locally — no Claude
  - Diffs against the previous month's report (if any) for trend signal

Token cost: zero Claude. SerpAPI ~5 calls (free tier covers ~250/mo).
Optional Perplexity call ~5 × $0.01 = ~$0.05 if OPENROUTER_API_KEY set.

Output: data/aeo-citations/YYYY-MM-DD.md
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import os
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

# local-llm-toolkit primitives (retry, telemetry, validate). Sibling import
# pattern — toolkit is in ~/projects/local-llm-toolkit/scripts/
TOOLKIT = pathlib.Path.home() / "projects" / "local-llm-toolkit" / "scripts"
if TOOLKIT.exists() and str(TOOLKIT) not in sys.path:
    sys.path.insert(0, str(TOOLKIT))
try:
    from llm_retry import with_retry  # type: ignore
    from llm_telemetry import log_run, estimate_savings  # type: ignore
    from llm_validate import validate_dict  # type: ignore
    _toolkit_loaded = True
except ImportError:
    _toolkit_loaded = False
    def with_retry(fn=None, **_):  # no-op fallback
        return fn if fn else (lambda f: f)
    def log_run(*a, **k): pass
    def estimate_savings(**k): return 0.0
    def validate_dict(d, s): return (True, [])

# Repo-aware action generation — same dir as this script
_HERE = pathlib.Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))
try:
    from aeo_actions import (  # type: ignore
        generate_actions, update_trend, merge_with_prior_actions,
        write_actions, render_trend_sparkline, render_action_table,
    )
    _actions_module = True
except ImportError:
    _actions_module = False

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "aeo-citations"
TARGET_DOMAIN = "frameroofingutah.com"

QUERIES = [
    "best roofer Heber City Utah",
    "roof replacement cost Utah 2026",
    "storm damage roofing Park City",
    "Utah roof insurance claim help",
    "licensed roofer Wasatch Front",
]

# Domains we already track as competitors / context — extracted into the report
KNOWN_COMPETITORS = {
    "roofingutah.com",
    "utahroofingcompany.com",
    "rcrroofing.com",
    "redrockroofing.com",
    "kerchaert.com",
    "clearskyroofing.com",
}

# Authority sources worth flagging as link-building targets when they cite competitors
AUTHORITY_SOURCES = {
    "angi.com",
    "homeadvisor.com",
    "bbb.org",
    "yelp.com",
    "thumbtack.com",
    "porch.com",
    "buildzoom.com",
    "expertise.com",
}

# Optional local-LLM client for the action-items section
TOOLKIT_LLM = pathlib.Path.home() / "projects" / "local-llm-toolkit" / "scripts" / "ollama-client.py"


def _load_llm():
    if not TOOLKIT_LLM.exists():
        return None
    spec = importlib.util.spec_from_file_location("llm", TOOLKIT_LLM)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _domain_of(url: str) -> str:
    """Extract bare domain (no www, no path) from a URL."""
    try:
        netloc = urllib.parse.urlparse(url).netloc.lower()
        return netloc.removeprefix("www.")
    except Exception:
        return ""


@with_retry(attempts=3, base_delay=1.0, max_delay=8.0)
def _serpapi_search_raw(query: str, api_key: str) -> dict:
    """Hit SerpAPI Google engine. Raises on transient failure (caller catches)."""
    params = {
        "engine": "google",
        "q": query,
        "google_domain": "google.com",
        "gl": "us",
        "hl": "en",
        "num": "10",
        "api_key": api_key,
    }
    url = "https://serpapi.com/search?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=20) as resp:
        return json.loads(resp.read())


def _serpapi_search(query: str, api_key: str) -> dict:
    """Wrap retry-capable SerpAPI call; return {} on permanent failure so the
    rest of the report still renders rather than blowing up the whole run."""
    try:
        return _serpapi_search_raw(query, api_key)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
        print(f"  SerpAPI error for '{query}' (after retries): {e}", file=sys.stderr)
        return {}


def _perplexity_check(query: str, api_key: str) -> dict | None:
    """Optional Perplexity-style citation check via OpenRouter Sonar. Returns
    {'cited': bool, 'citations': [domain, ...], 'snippet': str} or None.

    Skipped silently when no OPENROUTER_API_KEY — the regular Google check
    still produces a useful report.
    """
    if not api_key:
        return None
    body = json.dumps({
        "model": "perplexity/sonar",
        "messages": [{"role": "user", "content": query}],
        "max_tokens": 400,
        "temperature": 0.0,
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
        print(f"  Perplexity error for '{query}': {e}", file=sys.stderr)
        return None

    msg = data.get("choices", [{}])[0].get("message", {})
    text = msg.get("content", "")
    citations = []
    # OpenRouter Sonar returns citations both in the metadata and as URLs in the text
    if "annotations" in msg:
        for ann in msg["annotations"]:
            url = ann.get("url_citation", {}).get("url") or ann.get("url", "")
            if url:
                citations.append(_domain_of(url))
    citations += [_domain_of(u) for u in re.findall(r"https?://[^\s\)\"]+", text)]
    citations = [c for c in {c for c in citations if c} if c]
    cited = TARGET_DOMAIN in citations
    snippet = ""
    if cited:
        for line in text.split("\n"):
            if TARGET_DOMAIN in line.lower() or "frame roofing" in line.lower():
                snippet = line.strip()[:200]
                break
    return {"cited": cited, "citations": citations, "snippet": snippet}


def _analyze_serp(query: str, serp: dict) -> dict:
    """Pull citation status for our domain + competitors out of SerpAPI JSON.

    Three surfaces matter for AEO/local SEO:
      1. Local Pack (top-of-SERP business listings — biggest local SEO signal)
      2. Organic results (traditional 10 blue links)
      3. AI Overview sources (Google AI summaries — explicit AEO surface)
    The monitor checks all three; missing any one was the pre-fix blind spot.
    """
    organic = serp.get("organic_results", []) or []
    local_results = serp.get("local_results", {}) or {}
    ai_overview = serp.get("ai_overview", {}) or {}

    target_position_organic = None
    target_position_local = None
    target_snippet = ""
    competitors_seen = set()
    authority_seen = set()

    # Local pack — Frame matches by business name OR by website domain.
    # Many local-pack results have the website field populated.
    local_places = local_results.get("places", []) if isinstance(local_results, dict) else []
    for i, p in enumerate(local_places, start=1):
        title = (p.get("title") or "").lower()
        web = _domain_of(p.get("website", ""))
        if "frame" in title and ("restoration" in title or "roofing" in title):
            target_position_local = target_position_local or i
        elif TARGET_DOMAIN in web:
            target_position_local = target_position_local or i

    # Organic — domain-based check
    for i, r in enumerate(organic, start=1):
        d = _domain_of(r.get("link", ""))
        if not d:
            continue
        if TARGET_DOMAIN in d:
            target_position_organic = target_position_organic or i
            target_snippet = (r.get("snippet") or "")[:200]
        if d in KNOWN_COMPETITORS:
            competitors_seen.add(d)
        if d in AUTHORITY_SOURCES:
            authority_seen.add(d)

    # AI Overview source check (Google's AI summaries when present).
    # AI Overview is "present" only if it actually has sources returned —
    # an empty {} or one with empty sources list shouldn't be flagged.
    ai_sources = []
    target_in_ai = False
    ai_real = False
    if ai_overview:
        for src in ai_overview.get("sources", []) or []:
            d = _domain_of(src.get("link", ""))
            if d:
                ai_sources.append(d)
                ai_real = True
                if TARGET_DOMAIN in d:
                    target_in_ai = True

    target_cited = target_position_local is not None or target_position_organic is not None or target_in_ai

    return {
        "query": query,
        "target_cited": target_cited,
        "target_position_local": target_position_local,
        "target_position_organic": target_position_organic,
        "target_snippet": target_snippet,
        "competitors": sorted(competitors_seen),
        "authority_sites": sorted(authority_seen),
        "ai_overview_present": ai_real,
        "ai_overview_sources": ai_sources,
        "ai_overview_cites_target": target_in_ai,
        "local_pack_size": len(local_places),
    }


def _previous_report(today: str) -> dict | None:
    """Find the most recent prior report and parse competitor lists out of it.
    Used for trend / threat-watch in this run."""
    if not OUT_DIR.exists():
        return None
    prior = sorted([p for p in OUT_DIR.glob("*.md") if p.stem < today])
    if not prior:
        return None
    text = prior[-1].read_text()
    competitors = set(re.findall(r"\b([a-z0-9-]+\.(?:com|net|org))\b", text.lower()))
    competitors.discard(TARGET_DOMAIN)
    return {"path": prior[-1].name, "competitors_last_run": competitors}


def _draft_action_items(rows: list[dict], llm) -> str:
    """Use mistral-nemo:12b to draft 3-5 prioritized action items from the data.
    Returns markdown bullets; falls back to a rule-based default if LLM fails.
    """
    summary_for_llm = json.dumps(rows, indent=2, default=str)
    if llm is not None:
        prompt = f"""You're an SEO/AEO strategist for Frame Roofing Utah (frameroofingutah.com).
Below is this month's citation-monitor data for 5 queries. Write 3-5 prioritized action items
in markdown bullet format. Each item: one line, starts with priority (HIGH/MED/LOW), then the
specific action. Focus on what would improve next month's score.

Rules:
- If a competitor appears repeatedly that we don't, suggest a content gap to close.
- If an authority site (Angi, BBB, etc.) is cited but we aren't on it, suggest getting listed.
- If AI Overview is present but doesn't cite us, suggest a direct-answer / FAQ block.
- Don't suggest editing HTML — that's out of scope.
- Output ONLY the bullets, no preamble.

Data:
{summary_for_llm}

Action items:"""
        text = llm.generate_text(prompt, max_tokens=400, model="mistral-nemo:12b")
        if text and "-" in text:
            # Trim anything before the first bullet
            idx = text.find("-")
            return text[idx:].strip()

    # Rule-based fallback
    bullets = []
    missing_count = sum(1 for r in rows if not r["target_cited"])
    if missing_count >= 3:
        bullets.append(
            f"- HIGH: Frame missing from {missing_count}/5 queries — review llms.txt + service-page direct-answer copy."
        )
    repeat_competitors = {}
    for r in rows:
        for c in r["competitors"]:
            repeat_competitors[c] = repeat_competitors.get(c, 0) + 1
    threats = sorted([(n, c) for c, n in repeat_competitors.items() if n >= 3], reverse=True)
    if threats:
        c = threats[0][1]
        bullets.append(f"- HIGH: {c} ranks in {threats[0][0]}/5 queries — competitive content gap to investigate.")
    authority_misses = set()
    for r in rows:
        for a in r["authority_sites"]:
            authority_misses.add(a)
    if authority_misses:
        bullets.append(f"- MED: Get listed/optimized on: {', '.join(sorted(authority_misses)[:3])}.")
    if not bullets:
        bullets.append("- LOW: Citations stable. Keep publishing fresh location/blog content.")
    return "\n".join(bullets)


def _render_report(today: str, rows: list[dict], action_items: str, prior: dict | None,
                   trend: dict | None = None, structured_actions: list[dict] | None = None) -> str:
    cited_n = sum(1 for r in rows if r["target_cited"])
    out = []
    out.append(f"# AEO Citation Report — {today}\n")

    if cited_n == 0:
        out.append("## ⚠️ ALERT: Frame Roofing not cited in any of the 5 queries this month.\n")
    out.append(f"## Score: cited in {cited_n} of {len(rows)} queries\n")

    # Trend sparkline (if we have history)
    if trend and trend.get("history"):
        out.append("## Trend (last 12 runs)\n")
        out.append(f"```\n{render_trend_sparkline(trend)}\n```\n")

    # Open action queue — top 5 by leverage (severity × lead value)
    if structured_actions is not None:
        out.append("## Open action queue (prioritized)\n")
        out.append(render_action_table(structured_actions, top_n=5))
        out.append("")

    # Threat watch — new competitor that wasn't in prior run
    if prior:
        all_current = {c for r in rows for c in r["competitors"]}
        new_threats = all_current - prior["competitors_last_run"]
        if new_threats:
            out.append("## ⚠️ NEW competitors vs prior report (potential threats)\n")
            for c in sorted(new_threats):
                out.append(f"- {c}\n")
            out.append("")

    out.append("## Query results\n")
    for i, r in enumerate(rows, start=1):
        out.append(f"### {i}. {r['query']}\n")
        cited = "yes" if r["target_cited"] else "no"
        out.append(f"- Frame Roofing cited: **{cited}**")
        if r.get("target_position_local"):
            out.append(f"- Local Pack: position {r['target_position_local']} (out of {r.get('local_pack_size', '?')})")
        if r.get("target_position_organic"):
            out.append(f"- Organic: position {r['target_position_organic']}")
        if not r.get("target_position_local") and not r.get("target_position_organic"):
            out.append("- Neither local pack nor organic top-10")
        if r["competitors"]:
            out.append(f"- Competitors cited: {', '.join(r['competitors'])}")
        else:
            out.append("- Competitors cited: (none of tracked set)")
        if r["authority_sites"]:
            out.append(f"- Authority sites: {', '.join(r['authority_sites'])}")
        if r["ai_overview_present"]:
            ai_status = "cites Frame ✓" if r["ai_overview_cites_target"] else "does NOT cite Frame"
            out.append(f"- AI Overview: present, {ai_status}")
        if r.get("perplexity"):
            p = r["perplexity"]
            ppl = "cited ✓" if p["cited"] else "not cited"
            out.append(f"- Perplexity (Sonar): {ppl}")
        if r["target_snippet"]:
            out.append(f'- Snippet: "{r["target_snippet"]}"')
        out.append("")

    if prior:
        out.append(f"## Trend vs prior\nPrior report: `{prior['path']}`. See _NEW competitors_ section above for delta.\n")

    out.append("## Action items\n")
    out.append(action_items)
    out.append("")
    return "\n".join(out)


def main() -> int:
    started_at = time.time()
    today = dt.date.today().isoformat()

    # Load secrets (optional flexibility — env first, then config file)
    serp_key = os.environ.get("SERPAPI_KEY")
    if not serp_key:
        env_file = pathlib.Path.home() / ".config" / "frame-roofing-utah" / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("SERPAPI_KEY="):
                    serp_key = line.split("=", 1)[1].strip()
                    break
    if not serp_key:
        print("ERROR: SERPAPI_KEY not set (env or ~/.config/frame-roofing-utah/.env)", file=sys.stderr)
        return 1

    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = []
    for q in QUERIES:
        print(f"→ {q}", file=sys.stderr)
        serp = _serpapi_search(q, serp_key)
        analyzed = _analyze_serp(q, serp)
        if openrouter_key:
            ppl = _perplexity_check(q, openrouter_key)
            if ppl:
                analyzed["perplexity"] = ppl
        rows.append(analyzed)

    print("→ Drafting action items locally", file=sys.stderr)
    llm = _load_llm()
    action_items = _draft_action_items(rows, llm)

    prior = _previous_report(today)

    # Structured action generation + trend tracking (RULE-aware, repo-aware)
    trend = None
    actions: list[dict] = []
    if _actions_module:
        repo_root = ROOT
        actions = generate_actions(repo_root, rows)
        actions = merge_with_prior_actions(actions, OUT_DIR)
        write_actions(OUT_DIR, actions)

        # Build trend snapshot (compact — full data lives in the daily JSON sidecar)
        snapshot = {
            "date": today,
            "score_total": sum(1 for r in rows if r["target_cited"]),
            "score_max": len(rows),
            "queries": {
                r["query"]: {
                    "cited": r["target_cited"],
                    "local_pos": r.get("target_position_local"),
                    "organic_pos": r.get("target_position_organic"),
                    "ai_overview_present": r.get("ai_overview_present"),
                    "ai_overview_cites_target": r.get("ai_overview_cites_target"),
                }
                for r in rows
            },
            "competitors_seen": sorted({c for r in rows for c in r.get("competitors", [])}),
        }
        trend = update_trend(OUT_DIR, snapshot)

        # Sidecar JSON snapshot for this run (full raw findings + actions)
        snapshot_path = OUT_DIR / f"{today}.json"
        snapshot_path.write_text(json.dumps({
            "date": today,
            "rows": rows,
            "actions": actions,
        }, indent=2, default=str))
        print(f"✓ Snapshot written to {snapshot_path} ({len(actions)} action(s))", file=sys.stderr)

    report = _render_report(today, rows, action_items, prior, trend=trend, structured_actions=actions)

    out_path = OUT_DIR / f"{today}.md"
    out_path.write_text(report)
    print(f"✓ Report written to {out_path} ({len(report.splitlines())} lines)", file=sys.stderr)

    # Telemetry: estimate Claude session savings (would have been ~50K input + 5K output
    # to read SERPs, classify citations, draft action items).
    runtime = time.time() - started_at
    log_run(
        "frame-roofing-aeo-monitor",
        status="ok",
        tokens_saved=55_000,
        est_usd_saved=estimate_savings(input_tokens=50_000, output_tokens=5_000, model="sonnet"),
        runtime_sec=runtime,
        extra={
            "queries_run": len(QUERIES),
            "score": f"{sum(1 for r in rows if r['target_cited'])}/{len(rows)}",
            "perplexity_used": bool(openrouter_key),
        },
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
