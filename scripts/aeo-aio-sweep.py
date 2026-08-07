#!/usr/bin/env python3
"""AEO AI Overview citation sweep for Frame Restoration Utah — v1.2 (Codex-audited).

Production-grade Phase 1 measurement script. Per Codex audit 2026-05-20:
  - Quota preflight, hard-stop unless the run can preserve a 50-search reserve
  - Durable run_id + raw artifact path (no /tmp/)
  - Hash-suffixed filenames (no slug-truncation collisions)
  - no_cache=true on all SerpAPI calls (measurement integrity)
  - First-class resolve_status enum (success/empty/error/expired_token)
  - Dual output: markdown report + machine-readable JSON
  - .last_run.json for cron observability
  - Account quota delta tracking (before/after)

Reads SERPAPI_KEY from ~/.config/frame-roofing-utah/.env.
NO DB writes — disk-only. Per Codex ordering: two stable monthly cycles before
adding DB writes + migrations + LaunchAgent cron.

Locked query panel (QUERY_PANEL_V1): 26 queries across 5 production + 5
already-tested + 16 new across cost/insurance/storm/materials/process. Same
location/device/day across runs for apples-to-apples comparison.

Run: python3 scripts/aeo-aio-sweep.py
Cost: ~42 SerpAPI calls per run (26 base + ~16 async resolutions) = ~17% of Free Plan budget.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

# ─── Config ─────────────────────────────────────────────────────────────────────
ENV_FILE = Path.home() / ".config" / "frame-roofing-utah" / ".env"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
TARGET_DOMAIN = "framerestorationutah.com"
LOCATION = "Heber City, Utah, United States"
QUOTA_FLOOR = 50  # Preserve this many searches after worst-case run cost.
PANEL_VERSION = "v1"

# ─── Locked query panel — DO NOT modify without bumping PANEL_VERSION ──────────
# 5 production queries (carried from aeo-citation-monitor.py for continuity)
PRODUCTION_QUERIES = [
    ("best roofer Heber City Utah",            "local_commercial"),
    ("roof replacement cost Utah 2026",        "informational"),
    ("storm damage roofing Park City",         "local_commercial"),
    ("Utah roof insurance claim help",         "informational"),
    ("licensed roofer Wasatch Front",          "local_commercial"),
]

# 5 already-tested informational queries (carried for trend continuity)
INFORMATIONAL_TESTED = [
    ("how much does a new roof cost in Utah",                       "informational"),
    ("signs you need a new roof Utah",                              "informational"),
    ("is hail damage covered by homeowners insurance Utah",         "informational"),
    ("how long does a roof last in Utah climate",                   "informational"),
    ("what to do after a storm damages your roof",                  "informational"),
]

# 16 new queries — cost / insurance / storm / materials / process
INFORMATIONAL_EXPANDED = [
    # Cost & financing (4)
    ("roof replacement financing Utah",                "informational"),
    ("average cost to reroof a house Utah",            "informational"),
    ("asphalt vs metal roof cost Utah",                "informational"),
    ("how much does roof inspection cost Utah",        "informational"),
    # Insurance & claims (3)
    ("how to file a roof insurance claim Utah",        "informational"),
    ("roof insurance claim denied what to do",         "informational"),
    ("does insurance cover roof leak Utah",            "informational"),
    # Storm & weather damage (4)
    ("how to spot hail damage on a roof",              "informational"),
    ("wind damage roof repair Utah",                   "informational"),
    ("ice dam prevention Utah roof",                   "informational"),
    ("spring storm roof damage Utah",                  "informational"),
    # Material & decision (3)
    ("best roofing material for Utah weather",         "informational"),
    ("metal roof vs asphalt shingles Utah",            "informational"),
    ("class 4 impact resistant shingles Utah",         "informational"),
    # Process & timing (2)
    ("how long does a roof replacement take Utah",     "informational"),
    ("when is the best time to replace a roof Utah",   "informational"),
]

QUERY_PANEL_V1 = PRODUCTION_QUERIES + INFORMATIONAL_TESTED + INFORMATIONAL_EXPANDED

# Known competitors from aeo-citation-monitor.py — flagged when cited
KNOWN_COMPETITORS = {
    "roofingutah.com", "utahroofingcompany.com", "rcrroofing.com",
    "redrockroofing.com", "kerchaert.com", "clearskyroofing.com",
}


# ─── Run identity + paths ──────────────────────────────────────────────────────
def make_run_id() -> str:
    """Format: YYYYMMDD-HHMM-{4 hex chars}. Sortable + collision-proof."""
    return f"{datetime.now().strftime('%Y%m%d-%H%M')}-{secrets.token_hex(2)}"


RUN_ID = make_run_id()
RAW_DIR = PROJECT_ROOT / "data" / "raw" / "aio-runs" / RUN_ID
REPORT_DATE = datetime.now().strftime("%Y-%m-%d")
REPORT_MD_BASE = PROJECT_ROOT / "data" / f"AEO-AIO-SWEEP-{REPORT_DATE}.md"
REPORT_MD = (
    REPORT_MD_BASE
    if not REPORT_MD_BASE.exists()
    else PROJECT_ROOT / "data" / f"AEO-AIO-SWEEP-{REPORT_DATE}-{RUN_ID}.md"
)
RUN_JSON = RAW_DIR / "run.json"
LAST_RUN_FILE = PROJECT_ROOT / "data" / ".last_run.json"


# ─── Helpers ───────────────────────────────────────────────────────────────────
def load_key() -> str:
    # Cloud runners (GitHub Actions) supply the key via env; the Mac uses the file
    env_key = os.environ.get("SERPAPI_KEY", "").strip()
    if env_key:
        return env_key
    if not ENV_FILE.exists():
        sys.exit(f"✗ Missing {ENV_FILE}")
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("SERPAPI_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("✗ SERPAPI_KEY not in env")


def fetch(params: dict, api_key: str, timeout: int = 30) -> dict:
    """GET against SerpAPI. Masks key in any error output."""
    q = {**params, "api_key": api_key}
    url = f"https://serpapi.com/search?{urllib.parse.urlencode(q)}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:
        masked = str(e).replace(api_key, "<API_KEY>")
        return {"_error": masked}


def get_account(api_key: str) -> dict:
    """Hit /account endpoint. Doesn't count against quota."""
    url = f"https://serpapi.com/account?api_key={api_key}"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        masked = str(e).replace(api_key, "<API_KEY>")
        return {"_error": masked}


def slug_for(query: str) -> str:
    """Slug + 8-char hash. Prevents collisions on truncated similar queries."""
    base = "".join(c if c.isalnum() else "-" for c in query)[:40].strip("-")
    h = hashlib.sha1(query.encode("utf-8")).hexdigest()[:8]
    return f"{base}-{h}"


def save_raw(name: str, payload: dict) -> Path:
    """Save raw payload to durable run directory. Strips api_key from response."""
    if isinstance(payload, dict) and "search_parameters" in payload:
        if isinstance(payload["search_parameters"], dict):
            payload["search_parameters"].pop("api_key", None)
    path = RAW_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2))
    return path


def resolve_aio_async(page_token: str, api_key: str) -> dict:
    """Follow-up call to engine=google_ai_overview. Per Codex: model as 1× billable."""
    return fetch({
        "engine": "google_ai_overview",
        "page_token": page_token,
        "no_cache": "true",
    }, api_key)


# ─── AIO extraction ────────────────────────────────────────────────────────────
def extract_aio(aio_block: dict) -> dict:
    """Normalize references + text snippets from an AIO block."""
    refs = []
    for r in aio_block.get("references", []) or []:
        link = r.get("link") or ""
        refs.append({
            "index": r.get("index"),
            "source": r.get("source") or urllib.parse.urlparse(link).hostname or "",
            "link": link,
        })
    text_snippets = [
        tb["snippet"] for tb in (aio_block.get("text_blocks") or [])
        if isinstance(tb, dict) and tb.get("snippet")
    ]
    return {"references": refs, "text_snippets": text_snippets}


def classify_resolve(aio_present: bool, refs: list, snippets: list, error: str | None) -> str:
    """First-class enum per Codex audit. Distinguishes Frame-missed from Google-empty."""
    if error:
        if "expired" in error.lower() or "token" in error.lower():
            return "expired_token"
        return "error"
    if not aio_present:
        return "no_aio"  # AIO didn't surface at all (separate from resolution outcomes)
    if not refs and not snippets:
        return "empty"  # AIO present but Google returned no answer content
    return "success"


# ─── Per-query analysis ────────────────────────────────────────────────────────
def analyze_query(query: str, intent: str, api_key: str, calls_log: list) -> dict:
    """Run one query, return structured result with resolve_status."""
    result = {
        "query": query,
        "query_intent": intent,
        "location": LOCATION,
        "target_domain": TARGET_DOMAIN,
        "run_id": RUN_ID,
        "measured_at": datetime.utcnow().isoformat() + "Z",
        "source_provider": "serpapi",
        "aio_present": False,
        "aio_mode": None,
        "resolve_status": None,
        "references": [],
        "references_count": 0,
        "text_snippets": [],
        "frame_cited": False,
        "competitors_cited": [],
        "organic_top_5": [],
        "raw_artifact_path": None,
        "error": None,
    }

    base = fetch({
        "engine": "google",
        "q": query,
        "location": LOCATION,
        "google_domain": "google.com",
        "gl": "us",
        "hl": "en",
        "device": "mobile",
        "no_cache": "true",  # Codex: measurement integrity
    }, api_key)
    calls_log.append({"kind": "google", "query": query})

    if "_error" in base:
        result["error"] = base["_error"]
        result["resolve_status"] = "error"
        return result

    slug = slug_for(query)
    base_raw_path = save_raw(f"base-{slug}", base)
    result["raw_artifact_path"] = str(base_raw_path.relative_to(PROJECT_ROOT))

    # Organic top 5 for context
    for org in (base.get("organic_results") or [])[:5]:
        result["organic_top_5"].append({
            "position": org.get("position"),
            "title": (org.get("title") or "")[:80],
            "link": org.get("link") or "",
            "is_frame": TARGET_DOMAIN in (org.get("link") or ""),
        })

    aio = base.get("ai_overview")
    if aio is None:
        result["resolve_status"] = "no_aio"
        return result

    result["aio_present"] = True

    # Determine mode: inline (refs present) vs async (page_token only)
    has_refs = bool(aio.get("references"))
    has_token = bool(aio.get("page_token"))

    if has_token and not has_refs:
        result["aio_mode"] = "async"
        resolved = resolve_aio_async(aio["page_token"], api_key)
        calls_log.append({"kind": "google_ai_overview", "query": query})
        save_raw(f"async-{slug}", resolved)

        if "_error" in resolved:
            err_msg = resolved["_error"]
            result["error"] = f"async resolve failed: {err_msg}"
            result["resolve_status"] = classify_resolve(True, [], [], err_msg)
            return result

        resolved_aio = resolved.get("ai_overview") or resolved
        extracted = extract_aio(resolved_aio)
    else:
        result["aio_mode"] = "inline"
        extracted = extract_aio(aio)

    result["references"] = extracted["references"]
    result["references_count"] = len(extracted["references"])
    result["text_snippets"] = extracted["text_snippets"]
    result["resolve_status"] = classify_resolve(
        True, extracted["references"], extracted["text_snippets"], None
    )
    result["frame_cited"] = any(TARGET_DOMAIN in r["link"] for r in extracted["references"])
    result["competitors_cited"] = sorted({
        comp for r in extracted["references"]
        for comp in KNOWN_COMPETITORS if comp in r["link"]
    })
    return result


# ─── Output rendering ──────────────────────────────────────────────────────────
def render_markdown(results: list, calls_log: list, account_before: dict, account_after: dict) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    n = len(results)
    n_aio = sum(1 for r in results if r["aio_present"])
    n_frame = sum(1 for r in results if r["frame_cited"])
    n_empty = sum(1 for r in results if r["resolve_status"] == "empty")
    n_error = sum(1 for r in results if r["resolve_status"] in ("error", "expired_token"))

    quota_before = account_before.get("plan_searches_left", "?")
    quota_after = account_after.get("plan_searches_left", "?")
    if isinstance(quota_before, int) and isinstance(quota_after, int):
        quota_delta = quota_before - quota_after
    else:
        quota_delta = "?"

    lines = [
        f"# AEO AI Overview Sweep — Frame Roofing Utah",
        f"",
        f"**Date:** {today} · **Run ID:** `{RUN_ID}` · **Panel:** {PANEL_VERSION} ({n} queries)",
        f"**Substrate:** SerpAPI `engine=google` + `engine=google_ai_overview` (no_cache)",
        f"**Target:** `{TARGET_DOMAIN}` · **Location:** {LOCATION} · **Device:** mobile",
        f"**Quota delta:** {quota_delta} searches (before: {quota_before}, after: {quota_after})",
        f"**Script calls:** {len(calls_log)} (1 base + 1 async per AIO-surfaced query)",
        f"",
        f"## Headline",
        f"",
        f"- **{n_aio}/{n} ({100*n_aio//n}%)** queries surfaced AIO",
        f"- **{n_frame}/{n_aio} ({100*n_frame//max(n_aio,1)}%)** of AIO blocks cited Frame",
        f"- **{n_empty}** AIO blocks resolved empty (Google had no answer — NOT a Frame miss)",
        f"- **{n_error}** errors / expired tokens (re-run candidates)",
        f"",
        f"## Per-query results",
        f"",
    ]

    for r in results:
        q = r["query"]
        status = r["resolve_status"]
        intent = r["query_intent"]
        lines.append(f"### `{q}`  *[{intent}]*")
        lines.append("")
        lines.append(f"**Resolve status:** `{status}` · **AIO mode:** {r['aio_mode'] or 'n/a'}")

        if r["error"]:
            lines.append(f"⚠️ Error: `{r['error']}`")
        elif status == "no_aio":
            lines.append(f"**AIO:** ❌ Google did not surface an AI Overview for this query.")
        elif status == "empty":
            lines.append(f"**AIO:** ⚠️ Block present but resolved with no references — Google had no answer content. **Not counted as a Frame miss.**")
        elif status == "success":
            cited = "✅ FRAME CITED" if r["frame_cited"] else "❌ Frame NOT cited"
            lines.append(f"**AIO:** ✅ surfaced ({r['aio_mode']}) · {cited}")
            if r["competitors_cited"]:
                lines.append(f"**Known competitors cited:** {', '.join(r['competitors_cited'])}")
            if r["references"]:
                lines.append("")
                lines.append("**Cited URLs in AIO:**")
                lines.append("")
                lines.append("| # | Source | URL |")
                lines.append("|---|---|---|")
                for ref in r["references"][:15]:
                    src = (ref.get("source") or "?")[:40]
                    link = ref.get("link") or ""
                    is_frame = " 🎯" if TARGET_DOMAIN in link else ""
                    lines.append(f"| {ref.get('index')} | {src}{is_frame} | {link[:100]} |")
            if r["text_snippets"]:
                lines.append("")
                lines.append("**AIO text snippets (first 2):**")
                for s in r["text_snippets"][:2]:
                    lines.append(f"> {s.replace(chr(10), ' ').strip()[:280]}")
        lines.append("")
        lines.append("**Organic top 5:**")
        lines.append("")
        for o in r.get("organic_top_5", []):
            marker = " 🎯" if o["is_frame"] else ""
            lines.append(f"  {o['position']}. {o['title']}{marker}  \n     {o['link'][:100]}")
        lines.append("")
        lines.append("---")
        lines.append("")

    # Aggregate domain analysis
    domain_counts = {}
    for r in results:
        if r["resolve_status"] == "success":
            for ref in r["references"]:
                src = ref.get("source") or "?"
                domain_counts[src] = domain_counts.get(src, 0) + 1
    top_domains = sorted(domain_counts.items(), key=lambda x: -x[1])[:15]

    lines += [
        f"## Most-cited domains across all successful AIO blocks",
        f"",
        f"| Rank | Domain | Citation count | Flag |",
        f"|---|---|---|---|",
    ]
    for i, (d, c) in enumerate(top_domains, 1):
        flag = ""
        if TARGET_DOMAIN in d:
            flag = "🎯 Frame"
        elif d in KNOWN_COMPETITORS:
            flag = "⚠️ competitor"
        lines.append(f"| {i} | {d} | {c} | {flag} |")

    lines += [
        f"",
        f"## Run metadata",
        f"",
        f"- **Run ID:** `{RUN_ID}`",
        f"- **Raw artifacts:** `data/raw/aio-runs/{RUN_ID}/` ({len(list(RAW_DIR.glob('*.json')))} files)",
        f"- **JSON output:** `data/raw/aio-runs/{RUN_ID}/run.json`",
        f"- **Quota before:** {quota_before} · **after:** {quota_after} · **delta:** {quota_delta}",
        f"",
    ]
    return "\n".join(lines)


# ─── Main ──────────────────────────────────────────────────────────────────────
def main():
    api_key = load_key()
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    print(f"→ AEO AIO sweep · run_id={RUN_ID}")
    print(f"→ Panel: {PANEL_VERSION} · {len(QUERY_PANEL_V1)} queries · location={LOCATION}")
    print(f"→ Output: {REPORT_MD.name} + raws in data/raw/aio-runs/{RUN_ID}/")
    print()

    # ── Codex preflight: abort if quota dangerous ──────────────────────────────
    account_before = get_account(api_key)
    if "_error" in account_before:
        sys.exit(f"✗ Preflight /account failed: {account_before['_error']}")
    quota = account_before.get("plan_searches_left", 0)
    print(f"→ Quota preflight: {quota} searches remaining (floor: {QUOTA_FLOOR})")
    estimated = len(QUERY_PANEL_V1) * 2  # worst case all-async
    required = estimated + QUOTA_FLOOR
    if not isinstance(quota, int):
        sys.exit(f"✗ STOP: quota unavailable from /account response: {quota!r}.")
    if quota < required:
        sys.exit(
            f"✗ STOP: {quota} remaining < {required} required "
            f"({estimated} worst-case calls + {QUOTA_FLOOR} reserve)."
        )
    print(f"✓ Quota OK ({quota} ≥ {required} required: {estimated} worst-case + {QUOTA_FLOOR} reserve)\n")

    # ── Run sweep ──────────────────────────────────────────────────────────────
    calls_log = []
    results = []
    for i, (q, intent) in enumerate(QUERY_PANEL_V1, 1):
        print(f"  [{i:2}/{len(QUERY_PANEL_V1)}] {q[:60]}...", end=" ", flush=True)
        r = analyze_query(q, intent, api_key, calls_log)
        results.append(r)
        status = r["resolve_status"]
        if status == "no_aio":
            print("no AIO")
        elif status == "empty":
            print("AIO empty")
        elif status in ("error", "expired_token"):
            print(f"⚠️ {status}")
        else:
            mark = "🎯 FRAME" if r["frame_cited"] else "❌"
            print(f"AIO {r['aio_mode']} ({r['references_count']} refs) {mark}")
        time.sleep(1)

    # ── Account delta ──────────────────────────────────────────────────────────
    account_after = get_account(api_key)

    # ── Persist artifacts ──────────────────────────────────────────────────────
    md = render_markdown(results, calls_log, account_before, account_after)
    REPORT_MD.parent.mkdir(parents=True, exist_ok=True)
    REPORT_MD.write_text(md)

    run_summary = {
        "run_id": RUN_ID,
        "panel_version": PANEL_VERSION,
        "panel_size": len(QUERY_PANEL_V1),
        "target_domain": TARGET_DOMAIN,
        "location": LOCATION,
        "device": "mobile",
        "source_provider": "serpapi",
        "started_at": account_before.get("processed_at") or datetime.utcnow().isoformat() + "Z",
        "finished_at": datetime.utcnow().isoformat() + "Z",
        "quota_before": account_before.get("plan_searches_left"),
        "quota_after": account_after.get("plan_searches_left"),
        "calls_logged": len(calls_log),
        "results": results,
        "calls_log": calls_log,
    }
    RUN_JSON.write_text(json.dumps(run_summary, indent=2))

    # ── .last_run.json for cron observability ──────────────────────────────────
    n_aio = sum(1 for r in results if r["aio_present"])
    n_frame = sum(1 for r in results if r["frame_cited"])
    n_empty = sum(1 for r in results if r["resolve_status"] == "empty")
    n_error = sum(1 for r in results if r["resolve_status"] in ("error", "expired_token"))
    last_run = {
        "run_id": RUN_ID,
        "finished_at": run_summary["finished_at"],
        "panel_version": PANEL_VERSION,
        "panel_size": len(QUERY_PANEL_V1),
        "exit_status": "ok" if n_error == 0 else "ok_with_errors",
        "calls_used": len(calls_log),
        "quota_before": run_summary["quota_before"],
        "quota_after": run_summary["quota_after"],
        "headline": {
            "aio_surfacing_rate": f"{n_aio}/{len(QUERY_PANEL_V1)}",
            "frame_citation_rate": f"{n_frame}/{n_aio}" if n_aio else "0/0",
            "empty_count": n_empty,
            "error_count": n_error,
        },
        "report_path": str(REPORT_MD.relative_to(PROJECT_ROOT)),
        "run_json_path": str(RUN_JSON.relative_to(PROJECT_ROOT)),
        "raw_dir": str(RAW_DIR.relative_to(PROJECT_ROOT)),
    }
    LAST_RUN_FILE.write_text(json.dumps(last_run, indent=2))

    print()
    print(f"✓ Sweep complete: {n_aio}/{len(QUERY_PANEL_V1)} AIO · {n_frame} cited Frame · {n_empty} empty · {n_error} errors")
    print(f"✓ Quota used: {len(calls_log)} calls (before {run_summary['quota_before']} → after {run_summary['quota_after']})")
    print(f"✓ Markdown report: {REPORT_MD}")
    print(f"✓ JSON run:        {RUN_JSON}")
    print(f"✓ Last-run status: {LAST_RUN_FILE}")
    print(f"✓ Raw artifacts:   data/raw/aio-runs/{RUN_ID}/")


if __name__ == "__main__":
    main()
