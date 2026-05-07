#!/usr/bin/env python3
"""File GitHub issues from the AEO monitor's open action queue.

Reads data/aeo-citations/_actions.json. For each action above the priority
threshold that ISN'T already filed (tracked in _filed_issues.json), creates
a GitHub issue via `gh` CLI.

Idempotent: same action ID never produces a second issue. New runs only file
brand-new findings.

Usage:
    aeo-file-issues.py                  # default: medium+ threshold, file
    aeo-file-issues.py --threshold high # only file HIGH priority
    aeo-file-issues.py --dry-run        # show what would be filed, don't file
    aeo-file-issues.py --list           # list current state of filed issues

Exit codes:
    0 = success (issues filed or nothing to do)
    1 = error (gh missing, _actions.json missing, etc.)
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ACTIONS = ROOT / "data" / "aeo-citations" / "_actions.json"
FILED = ROOT / "data" / "aeo-citations" / "_filed_issues.json"
TREND = ROOT / "data" / "aeo-citations" / "_trend.json"

PRIORITY_RANK = {"high": 3, "medium": 2, "low": 1}

LABELS_DEFAULT = ["aeo", "auto-filed"]


def _load_filed() -> dict:
    if not FILED.exists():
        return {"filed": {}}
    try:
        return json.loads(FILED.read_text())
    except json.JSONDecodeError:
        return {"filed": {}}


def _save_filed(data: dict) -> None:
    FILED.write_text(json.dumps(data, indent=2))


def _load_actions() -> list[dict]:
    if not ACTIONS.exists():
        print(f"✗ {ACTIONS} not found. Run aeo-citation-monitor.py first.", file=sys.stderr)
        sys.exit(1)
    try:
        return json.loads(ACTIONS.read_text()).get("open_actions", [])
    except json.JSONDecodeError as e:
        print(f"✗ {ACTIONS} malformed: {e}", file=sys.stderr)
        sys.exit(1)


def _ensure_label_exists(label: str) -> None:
    """Create the label if it's not in the repo. Silent if already there."""
    result = subprocess.run(
        ["gh", "label", "list", "--limit", "200", "--json", "name", "-q", ".[].name"],
        capture_output=True, text=True, timeout=10,
    )
    if result.returncode != 0:
        return
    existing = set(result.stdout.split())
    if label not in existing:
        # Pick a stable color per label so reruns don't fight
        color = {"aeo": "1d76db", "auto-filed": "ededed"}.get(label, "5319e7")
        subprocess.run(
            ["gh", "label", "create", label, "--color", color, "--description",
             f"AEO monitor — {label}"],
            capture_output=True, text=True, timeout=10,
        )


def _build_issue_body(action: dict, today: str) -> str:
    """Markdown body for the GitHub issue. Self-contained — readable without
    cross-referencing the AEO report."""
    files_block = "\n".join(f"- `{f}`" for f in action.get("files", [])) or "_(no specific file mapped)_"
    files_meta = action.get("files_meta", [])
    meta_block = ""
    if files_meta:
        meta_lines = ["", "**File metadata:**", "| Path | Last modified | Words | Title |", "|---|---|---:|---|"]
        for fm in files_meta:
            title = (fm.get("title") or "")[:60]
            meta_lines.append(
                f"| `{fm.get('path', '?')}` "
                f"| {fm.get('git_last_modified') or fm.get('date_modified_schema') or '?'} "
                f"| {fm.get('word_count') or '?'} "
                f"| {title} |"
            )
        meta_block = "\n".join(meta_lines)

    return f"""**AEO query:** `{action.get('query')}`

**Why this matters:** {action.get('rationale')}

**Files affected:**
{files_block}
{meta_block}

**Scoring:**
- Priority: **{action.get('priority', '?').upper()}**
- Leverage: **{action.get('leverage', 0)}** _(severity {action.get('severity', 0)} × lead-value {action.get('lead_value', 0)})_
- Effort: **{action.get('effort_hours', '?')}h**
- Tags: `{'`, `'.join(action.get('tags', []))}`

**Tracking:**
- Action ID: `{action.get('id')}`
- First seen in monitor: `{action.get('first_seen')}`
- Filed automatically: `{today}`

---

_This issue was auto-filed by `scripts/aeo-file-issues.py`. Close it when the work
is done — the next monitor run will detect persistence and increment `weeks_open`
if the underlying gap is still present in SerpAPI results._
"""


def _file_issue(action: dict, dry_run: bool, today: str) -> str | None:
    """Create the issue. Returns issue URL on success, None on failure."""
    title = f"[AEO] {action.get('title', 'Untitled action')}"
    body = _build_issue_body(action, today)
    labels = list(LABELS_DEFAULT) + [f"priority:{action.get('priority', 'medium')}"]

    if dry_run:
        print(f"  [DRY RUN] would create: {title}")
        return None

    for label in labels:
        _ensure_label_exists(label)

    try:
        result = subprocess.run(
            ["gh", "issue", "create",
             "--title", title,
             "--body", body,
             "--label", ",".join(labels)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            print(f"  ✗ gh issue create failed: {result.stderr.strip()[:200]}", file=sys.stderr)
            return None
        url = result.stdout.strip()
        return url if url.startswith("http") else None
    except (subprocess.SubprocessError, OSError) as e:
        print(f"  ✗ gh failed: {e}", file=sys.stderr)
        return None


def _list_state() -> int:
    """Show current state: which actions are filed, which would be next."""
    actions = _load_actions()
    filed = _load_filed().get("filed", {})

    print(f"Open actions: {len(actions)}\n")
    for a in actions:
        marker = "📌" if a["id"] in filed else "🆕"
        url = filed.get(a["id"], {}).get("issue_url", "")
        print(f"{marker} [{a['priority']:6}] lev={a['leverage']:>3}  {a['title']}")
        print(f"   id={a['id']}  {url}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="File GitHub issues from AEO action queue")
    parser.add_argument("--threshold", choices=["high", "medium", "low"], default="medium",
                        help="Minimum priority to file (default: medium)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be filed without creating issues")
    parser.add_argument("--list", action="store_true",
                        help="List current actions and their filed status")
    parser.add_argument("--max", type=int, default=10,
                        help="Cap how many issues to file in one run (default: 10)")
    args = parser.parse_args()

    if args.list:
        return _list_state()

    if not shutil.which("gh"):
        print("✗ `gh` CLI not found. Install from https://cli.github.com/", file=sys.stderr)
        return 1

    actions = _load_actions()
    filed_state = _load_filed()
    filed_by_id = filed_state.setdefault("filed", {})
    today = dt.date.today().isoformat()

    threshold_rank = PRIORITY_RANK[args.threshold]
    eligible = [
        a for a in actions
        if PRIORITY_RANK.get(a.get("priority", "low"), 0) >= threshold_rank
        and a["id"] not in filed_by_id
    ]

    print(f"Open actions: {len(actions)} | Already filed: {len(filed_by_id)} | "
          f"Eligible to file (>= {args.threshold}): {len(eligible)}")

    if not eligible:
        print("✓ Nothing new to file.")
        return 0

    eligible.sort(key=lambda a: -a.get("leverage", 0))
    to_file = eligible[: args.max]
    if len(eligible) > args.max:
        print(f"⚠ Capping at {args.max} — {len(eligible) - args.max} eligible deferred.")

    filed_count = 0
    for action in to_file:
        print(f"→ Filing: {action['title']}")
        url = _file_issue(action, args.dry_run, today)
        if url:
            filed_by_id[action["id"]] = {
                "issue_url": url,
                "filed_at": today,
                "title": action["title"],
                "priority": action["priority"],
            }
            filed_count += 1
            print(f"  ✓ {url}")
        elif not args.dry_run:
            print(f"  (skipped — see error above)")

    if not args.dry_run and filed_count > 0:
        _save_filed(filed_state)
        print(f"\n✓ Filed {filed_count} new issue(s). State saved to {FILED}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
