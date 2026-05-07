#!/usr/bin/env python3
"""Auto-fix `internal-link-boost` AEO actions by opening a PR.

Reads an open AEO action (by ID or GitHub issue number), finds 3 high-relevance
blog posts, drafts contextual link insertions via mistral-nemo:12b, opens a PR.

NEVER auto-merges. NEVER edits service pages, location pages, or legal pages.
Race-condition guard skips files modified within the last 24 hours (per the
Cowork-coordination rule in feedback_frame_roofing_reviews.md).

Usage:
    aeo-fix-internal-links.py --action aeo-76a17e0e
    aeo-fix-internal-links.py --issue 15
    aeo-fix-internal-links.py --action aeo-76a17e0e --dry-run

Exit codes:
    0 = PR opened (or dry-run successful)
    1 = error (action not found, no eligible source pages, all LLM drafts failed)
    2 = invocation error (missing args, missing toolkit)
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import pathlib
import re
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
ACTIONS_FILE = ROOT / "data" / "aeo-citations" / "_actions.json"
FILED_FILE = ROOT / "data" / "aeo-citations" / "_filed_issues.json"
TOOLKIT = pathlib.Path.home() / "projects" / "local-llm-toolkit" / "scripts"

# Safety knobs — tune carefully
MAX_SOURCE_EDITS = 3                    # Cap PRs at 3 source-page edits
ANCHOR_MIN_WORDS = 3                    # No "click here"
ANCHOR_MAX_WORDS = 12                   # No "this comprehensive guide..." stuffing
RACE_GUARD_HOURS = 24                   # Skip files Cowork may be editing
MIN_LLM_CONFIDENCE = 0.6                # Below this = skip the draft
PARAGRAPH_MIN_CHARS = 100               # Skip tiny <p>
PARAGRAPH_MAX_CHARS = 800               # Skip giant <p> (LLM context blows up)
MAX_PARAGRAPH_SAMPLES = 5               # Show LLM 5 paragraphs at a time

# Directories we NEVER edit
EXCLUDED_DIR_PREFIXES = (
    "pages/",        # service pages — careful editing area
    "locations/",    # 45 templated location pages — leave alone
    "archive/",
    "tmp-",
    "data/",
    "scripts/",
    "assets/",
    "images/",
    "public/",
    "node_modules/",
    "_archive/",
)

# Files we NEVER edit (legal, schema, infra)
EXCLUDED_FILES = {
    "index.html",        # Homepage — too high-stakes for auto-edit
    "privacy.html",
    "terms.html",
    "thank-you.html",
    "404.html",
    "review.html",
    "seo-report.html",
    "directory-tracker.html",
    "directory-blitz-tool.html",
    "backlink-playbook.html",
}


def _load_toolkit():
    """Load ollama-client + telemetry from local-llm-toolkit. Required."""
    if not TOOLKIT.exists():
        sys.exit("✗ local-llm-toolkit not found at ~/projects/local-llm-toolkit/")
    if str(TOOLKIT) not in sys.path:
        sys.path.insert(0, str(TOOLKIT))
    spec = importlib.util.spec_from_file_location("oc", TOOLKIT / "ollama-client.py")
    oc = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(oc)
    from llm_telemetry import log_run, estimate_savings  # type: ignore
    return oc, log_run, estimate_savings


# ── Action lookup ─────────────────────────────────────────────────────────

def load_action(action_id: str | None, issue_number: int | None) -> dict:
    if not ACTIONS_FILE.exists():
        sys.exit(f"✗ {ACTIONS_FILE} not found — run aeo-citation-monitor.py first.")
    actions = json.loads(ACTIONS_FILE.read_text()).get("open_actions", [])

    if issue_number is not None:
        if not FILED_FILE.exists():
            sys.exit("✗ _filed_issues.json missing — file the issue first.")
        filed = json.loads(FILED_FILE.read_text()).get("filed", {})
        for aid, info in filed.items():
            url = info.get("issue_url", "")
            if url.endswith(f"/issues/{issue_number}"):
                action_id = aid
                break
        if action_id is None:
            sys.exit(f"✗ Issue #{issue_number} not in _filed_issues.json")

    if action_id is None:
        sys.exit("✗ Pass --action <id> or --issue <number>")

    for a in actions:
        if a["id"] == action_id:
            return a
    sys.exit(f"✗ Action {action_id} not in current _actions.json")


# ── Candidate source pages ────────────────────────────────────────────────

def _file_recently_modified(path: pathlib.Path, hours: float) -> bool:
    """Check both mtime AND git log; if either says recent, treat as touched."""
    try:
        mtime = dt.datetime.fromtimestamp(path.stat().st_mtime, tz=dt.timezone.utc)
        if (dt.datetime.now(dt.timezone.utc) - mtime).total_seconds() < hours * 3600:
            return True
    except OSError:
        return False

    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", str(path.relative_to(ROOT))],
            cwd=ROOT, capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            commit_time = dt.datetime.fromisoformat(result.stdout.strip())
            return (dt.datetime.now(dt.timezone.utc) - commit_time).total_seconds() < hours * 3600
    except (subprocess.SubprocessError, ValueError):
        pass
    return False


def _is_excluded(path: pathlib.Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if rel in EXCLUDED_FILES:
        return True
    return any(rel.startswith(p) for p in EXCLUDED_DIR_PREFIXES)


def derive_target_url(target_file: str) -> str:
    """Vercel cleanUrls=true strips .html. Build the public URL the link will use."""
    rel = target_file.removesuffix(".html")
    if rel.endswith("/index"):
        rel = rel[:-6]
    return "/" + rel


def find_candidate_sources(target_file: str, target_query: str) -> list[tuple[int, pathlib.Path]]:
    """Score blog posts by relevance to target_query. Return (score, path) pairs sorted desc."""
    target_path = ROOT / target_file
    target_url = derive_target_url(target_file)

    # Only blog posts are eligible source pages — service/location pages are off-limits.
    blog_dir = ROOT / "blog"
    if not blog_dir.exists():
        return []

    keywords = {w for w in re.findall(r"\w+", target_query.lower()) if len(w) >= 3}
    keywords -= {"the", "and", "for", "you", "your", "with", "from", "this", "that", "into",
                 "utah", "best", "help", "cost"}  # too generic

    scored: list[tuple[int, pathlib.Path]] = []
    for c in blog_dir.rglob("*.html"):
        if c == target_path:
            continue
        if _is_excluded(c):
            continue
        try:
            text = c.read_text(errors="ignore")
        except OSError:
            continue
        # Already linking to the target → skip
        if target_url in text:
            continue
        if _file_recently_modified(c, RACE_GUARD_HOURS):
            continue

        text_lower = text.lower()
        title_match = re.search(r"<title>([^<]+)</title>", text, re.IGNORECASE)
        title_text = (title_match.group(1) if title_match else "").lower()
        body_score = sum(text_lower.count(kw) for kw in keywords)
        title_score = sum(title_text.count(kw) for kw in keywords) * 3
        total = body_score + title_score
        if total > 0:
            scored.append((total, c))

    scored.sort(key=lambda x: -x[0])
    return scored


# ── LLM-drafted insertion ─────────────────────────────────────────────────

LINK_DRAFT_PROMPT = """\
You are an SEO editor finding natural places to add an internal link.

TARGET PAGE URL: {target_url}
TARGET PAGE TITLE: {target_title}
TARGET QUERY: "{target_query}"

Below are paragraphs from a related blog post. Pick ONE paragraph where adding
a link to the target page would feel natural and helpful to the reader.

Output ONLY a JSON object with these fields:
  "paragraph_index": int (1-{n_paragraphs}, which paragraph to edit)
  "anchor_text": string (3-12 EXISTING words from the chosen paragraph that
                  you'll wrap in an <a> tag — must be EXACT verbatim text from
                  the paragraph, not paraphrased)
  "confidence": float (0.0-1.0; below 0.6 = no good fit, skip)

Rules:
- anchor_text MUST appear verbatim in the chosen paragraph
- anchor_text should describe the target topic, not be generic ("click here", "this article")
- If no paragraph is a good fit, return paragraph_index: 0, anchor_text: "", confidence: 0.0

PARAGRAPHS:
{paragraphs}

JSON:"""


def _extract_paragraphs(html: str) -> list[str]:
    body_match = re.search(r"<body[^>]*>(.*?)</body>", html, re.DOTALL | re.IGNORECASE)
    if not body_match:
        return []
    body = body_match.group(1)
    body = re.sub(r"<script[^>]*>.*?</script>", "", body, flags=re.DOTALL | re.IGNORECASE)
    body = re.sub(r"<style[^>]*>.*?</style>", "", body, flags=re.DOTALL | re.IGNORECASE)
    raw = re.findall(r"<p[^>]*>(.*?)</p>", body, re.DOTALL | re.IGNORECASE)
    out = []
    for p in raw:
        clean = p.strip()
        # Skip paragraphs already containing a link (don't double-link)
        if "<a " in clean.lower():
            continue
        if PARAGRAPH_MIN_CHARS <= len(clean) <= PARAGRAPH_MAX_CHARS:
            out.append(clean)
    return out


def draft_insertion(oc, source: pathlib.Path, target_url: str, target_title: str,
                    target_query: str) -> dict | None:
    """Call mistral-nemo:12b to draft an insertion. Returns edit dict or None."""
    text = source.read_text(errors="ignore")
    paragraphs = _extract_paragraphs(text)
    if not paragraphs:
        return None
    sample = paragraphs[:MAX_PARAGRAPH_SAMPLES]
    sample_block = "\n\n".join(f"[{i+1}] {p}" for i, p in enumerate(sample))

    prompt = LINK_DRAFT_PROMPT.format(
        target_url=target_url, target_title=target_title, target_query=target_query,
        n_paragraphs=len(sample), paragraphs=sample_block,
    )
    result = oc.generate_json(prompt, max_tokens=300, model="mistral-nemo:12b")
    if not result:
        return None
    idx = result.get("paragraph_index", 0)
    try:
        idx = int(idx) - 1
    except (TypeError, ValueError):
        return None
    if idx < 0 or idx >= len(sample):
        return None
    confidence = float(result.get("confidence", 0))
    if confidence < MIN_LLM_CONFIDENCE:
        return None
    anchor = (result.get("anchor_text") or "").strip()
    n_words = len(anchor.split())
    if n_words < ANCHOR_MIN_WORDS or n_words > ANCHOR_MAX_WORDS:
        return None
    chosen = sample[idx]
    if anchor not in chosen:
        # LLM hallucinated — anchor isn't actually in the paragraph
        return None

    new_paragraph = chosen.replace(anchor, f'<a href="{target_url}">{anchor}</a>', 1)
    return {
        "source_file": str(source.relative_to(ROOT)),
        "original_paragraph": chosen,
        "new_paragraph": new_paragraph,
        "anchor_text": anchor,
        "confidence": confidence,
    }


# ── Apply, branch, push, PR ───────────────────────────────────────────────

def apply_edits(edits: list[dict], dry_run: bool) -> list[dict]:
    """Validation pass — checks each edit can be applied without writing.
    The actual filesystem write happens inside open_pr() on the feature branch
    (so we don't pollute main's working tree).
    """
    applied: list[dict] = []
    for edit in edits:
        path = ROOT / edit["source_file"]
        text = path.read_text()
        if edit["original_paragraph"] not in text:
            print(f"  ✗ {edit['source_file']}: paragraph not found verbatim, skipping",
                  file=sys.stderr)
            continue
        if dry_run:
            print(f"  [DRY] {edit['source_file']}: anchor={edit['anchor_text']!r} "
                  f"(confidence {edit['confidence']:.2f})")
        else:
            print(f"  ✓ {edit['source_file']}: anchor={edit['anchor_text']!r} "
                  f"(confidence {edit['confidence']:.2f})")
        applied.append(edit)
    return applied


def _git(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git"] + args, cwd=ROOT, capture_output=True, text=True, check=check)


def _ensure_label_exists(label: str) -> None:
    """Idempotent — create the label if it doesn't exist yet."""
    result = subprocess.run(
        ["gh", "label", "list", "--limit", "200", "--json", "name", "-q", ".[].name"],
        cwd=ROOT, capture_output=True, text=True, timeout=10,
    )
    if result.returncode != 0:
        return
    if label in set(result.stdout.split()):
        return
    color = {"aeo": "1d76db", "aeo-auto-fix": "0075ca"}.get(label, "5319e7")
    subprocess.run(
        ["gh", "label", "create", label, "--color", color, "--description",
         f"AEO monitor — {label}"],
        cwd=ROOT, capture_output=True, text=True, timeout=10,
    )


def open_pr(action: dict, edits: list[dict], target_url: str, issue_url: str) -> str | None:
    """Create branch, write edits on it, commit, push, open PR. Returns PR URL or None.

    The filesystem write happens HERE, on the feature branch — apply_edits()
    only validates, so main's working tree never gets polluted.
    """
    branch = f"aeo-auto/{action['id']}"

    try:
        _git(["checkout", "main"])
        _git(["pull", "--rebase", "origin", "main"], check=False)
        _git(["checkout", "-B", branch])

        # Apply edits on the fresh branch (validation already passed in apply_edits)
        for edit in edits:
            path = ROOT / edit["source_file"]
            text = path.read_text()
            if edit["original_paragraph"] in text:
                path.write_text(text.replace(edit["original_paragraph"],
                                             edit["new_paragraph"], 1))

        files_to_add = [e["source_file"] for e in edits]
        _git(["add"] + files_to_add)
        if _git(["diff", "--cached", "--quiet"], check=False).returncode == 0:
            print("  ✗ No staged changes — aborting PR", file=sys.stderr)
            return None

        body_lines = [
            f"feat(aeo): auto-fix {action['id']} — internal links → {action['files'][0]}",
            "",
            f"Action: {action['title']}",
            f"Issue: {issue_url}",
            "",
        ]
        for e in edits:
            body_lines.append(f"- {e['source_file']}: anchor={e['anchor_text']!r} "
                              f"(confidence {e['confidence']:.2f})")
        body_lines.append("")
        body_lines.append("Generated by scripts/aeo-fix-internal-links.py — review before merge.")
        commit_msg = "\n".join(body_lines)

        _git(["commit", "-m", commit_msg])
        _git(["push", "-u", "origin", branch])

        pr_body = (
            f"**Auto-fix for AEO action `{action['id']}`** — closes part of {issue_url}\n\n"
            f"**Target page:** `{action['files'][0]}` → `{target_url}`\n"
            f"**Target query:** `{action['query']}`\n"
            f"**Action type:** `{action['action_type']}` "
            f"(leverage {action['leverage']}, lead-value {action['lead_value']})\n\n"
            "## Edits in this PR\n\n"
        )
        for e in edits:
            pr_body += f"### `{e['source_file']}`\n"
            pr_body += f"**Anchor text:** `{e['anchor_text']}` "
            pr_body += f"(confidence {e['confidence']:.2f})\n\n"
            pr_body += "<details><summary>Diff</summary>\n\n"
            pr_body += f"**Before:**\n\n> {e['original_paragraph'][:300]}…\n\n"
            pr_body += f"**After:**\n\n> {e['new_paragraph'][:320]}…\n\n"
            pr_body += "</details>\n\n"
        pr_body += (
            "---\n\n"
            "_Auto-generated by `scripts/aeo-fix-internal-links.py`. "
            "Review the diff carefully before merging — this script edits production HTML._"
        )

        title = f"[AEO auto-fix] Internal links → {action['files'][0]}"
        # Auto-create labels on first use (avoid the "label not found" failure)
        for label in ("aeo", "aeo-auto-fix"):
            _ensure_label_exists(label)
        result = subprocess.run(
            ["gh", "pr", "create",
             "--title", title,
             "--body", pr_body,
             "--label", "aeo",
             "--label", "aeo-auto-fix"],
            cwd=ROOT, capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            print(f"  ✗ gh pr create failed: {result.stderr[:300]}", file=sys.stderr)
            return None
        url = result.stdout.strip()
        return url if url.startswith("http") else None

    finally:
        # Always return to main — feature branch's edits are saved in the commit
        _git(["checkout", "main"], check=False)


def comment_on_issue(issue_url: str, pr_url: str) -> None:
    issue_num = issue_url.rstrip("/").rsplit("/", 1)[-1]
    body = (
        f"🤖 Auto-fix PR opened: {pr_url}\n\n"
        "Review the diff and merge if it looks good. The next AEO monitor run "
        "will detect persistence and increment `weeks_open` if Frame still isn't "
        "cited for this query."
    )
    subprocess.run(
        ["gh", "issue", "comment", issue_num, "--body", body],
        cwd=ROOT, capture_output=True, text=True, timeout=15,
    )


# ── Main ──────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-fix internal-link-boost AEO actions")
    parser.add_argument("--action", help="Action ID from _actions.json")
    parser.add_argument("--issue", type=int, help="GitHub issue number")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would change without committing or opening a PR")
    parser.add_argument("--max-edits", type=int, default=MAX_SOURCE_EDITS,
                        help=f"Max source files to edit per run (default: {MAX_SOURCE_EDITS})")
    args = parser.parse_args()

    started = time.time()
    oc, log_run, estimate_savings = _load_toolkit()

    action = load_action(args.action, args.issue)
    # Both action types are "add inbound internal links to a target page" — the
    # only difference is the diagnostic (authority gap vs missing freshness anchor).
    # Same fix.
    SUPPORTED = {"internal-link-boost", "authority-boost"}
    if action.get("action_type") not in SUPPORTED:
        sys.exit(f"✗ Action {action['id']} is type '{action.get('action_type')}'. "
                 f"This script handles {sorted(SUPPORTED)}.")

    target_file = action["files"][0] if action.get("files") else None
    if not target_file:
        sys.exit(f"✗ Action {action['id']} has no target file")
    target_path = ROOT / target_file
    if not target_path.exists():
        sys.exit(f"✗ Target file {target_file} not in repo")

    target_url = derive_target_url(target_file)
    target_title = (action.get("files_meta", [{}])[0] or {}).get("title", "")
    target_query = action.get("query", "")

    print(f"→ Target: {target_file}")
    print(f"  URL: {target_url}")
    print(f"  Query: {target_query!r}")

    # Branch already exists? (Idempotency: don't re-fix if a PR is already open)
    branch = f"aeo-auto/{action['id']}"
    try:
        remote_branches = subprocess.run(
            ["git", "ls-remote", "--heads", "origin", branch],
            cwd=ROOT, capture_output=True, text=True, timeout=30,
        )
        if remote_branches.returncode == 0 and remote_branches.stdout.strip():
            print(f"✗ Branch {branch} already exists on origin — PR likely open. Skipping.",
                  file=sys.stderr)
            return 1
    except subprocess.TimeoutExpired:
        print("⚠ ls-remote timed out (GitHub flakiness) — assuming branch is new and continuing.",
              file=sys.stderr)

    print(f"→ Finding candidate source pages…")
    candidates = find_candidate_sources(target_file, target_query)
    if not candidates:
        sys.exit("✗ No eligible blog posts found (or all already link to target / "
                 "all recently modified)")
    print(f"  {len(candidates)} candidates ranked by relevance")

    print(f"→ Drafting insertions via mistral-nemo:12b (cap: {args.max_edits} files)…")
    edits: list[dict] = []
    for score, source in candidates:
        if len(edits) >= args.max_edits:
            break
        print(f"  Trying {source.relative_to(ROOT)} (score {score})…")
        edit = draft_insertion(oc, source, target_url, target_title, target_query)
        if edit:
            print(f"    ✓ confidence {edit['confidence']:.2f}, anchor={edit['anchor_text']!r}")
            edits.append(edit)
        else:
            print(f"    — skipped (no good paragraph or low confidence)")

    if not edits:
        log_run("aeo-fix-internal-links", status="no-edits",
                runtime_sec=time.time() - started,
                extra={"action_id": action["id"]})
        sys.exit("✗ No high-confidence edits drafted. Try a different action or run later.")

    print(f"\n→ Applying {len(edits)} edit(s){' (DRY RUN)' if args.dry_run else ''}…")
    applied = apply_edits(edits, args.dry_run)

    if args.dry_run:
        print(f"\n✓ Dry run complete. Would edit {len(applied)} file(s). No PR created.")
        log_run("aeo-fix-internal-links", status="dry-run",
                runtime_sec=time.time() - started,
                extra={"action_id": action["id"], "edits_drafted": len(applied)})
        return 0

    if not applied:
        sys.exit("✗ No edits applied — all replacements failed verbatim match")

    issue_url = ""
    if FILED_FILE.exists():
        filed = json.loads(FILED_FILE.read_text()).get("filed", {})
        issue_url = filed.get(action["id"], {}).get("issue_url", "")

    print(f"→ Opening PR…")
    pr_url = open_pr(action, applied, target_url, issue_url)
    if not pr_url:
        sys.exit("✗ PR creation failed — see errors above")
    print(f"✓ PR: {pr_url}")

    if issue_url:
        comment_on_issue(issue_url, pr_url)
        print(f"✓ Commented on {issue_url}")

    log_run("aeo-fix-internal-links", status="ok",
            tokens_saved=20_000,  # Claude would have read+written across N files
            est_usd_saved=estimate_savings(input_tokens=15_000, output_tokens=5_000, model="sonnet"),
            runtime_sec=time.time() - started,
            extra={"action_id": action["id"], "edits": len(applied), "pr_url": pr_url})
    return 0


if __name__ == "__main__":
    sys.exit(main())
