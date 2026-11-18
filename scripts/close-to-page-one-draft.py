#!/usr/bin/env python3
"""Add Claude-plan prose to a close-to-page-one queue. Never publishes.

Reuses the blog lane's plan authentication (CLAUDE_CODE_OAUTH_TOKEN, metered
keys removed). There is no OpenRouter call and no fallback to one.

Missing token with --skip-if-unconfigured: leave the queue unchanged and exit 0.
A set token whose CLI fails exits 1. Measured clicks, impressions, and
positions are not replaced by model text.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUEUE = ROOT / "data" / "seo" / "topic-queue" / "close-to-page-one.json"
MODEL = os.getenv("FRAME_BLOG_CLAUDE_MODEL", "claude-sonnet-5-5")

SYSTEM = """You propose on-page edits for Frame Restoration Utah. Output ONLY a JSON object, no markdown.

Rules:
- Use only the queries, clicks, impressions, and positions in the user message. Do not estimate search volume, traffic, rankings, or clicks.
- Every task is a page refresh. Do not propose a new URL or a new blog post when a page is listed.
- For each page, return changes whose heading is one of that page's exact queries.
- Do not invent licenses, review counts, prices, or phone numbers. The public phone, if mentioned, is 435-292-8802.
- Do not use these phrases: "public adjuster", "negotiate", "settlement", "maximize payout", "claim navigation".

Shape: {"pages":[{"page":"...","changes":[{"heading":"exact query","instruction":"one or two sentences naming the section to add or revise"}]}]}
"""


def load_plan_env():
    path = ROOT / "scripts" / "blog-draft-openrouter.py"
    spec = importlib.util.spec_from_file_location("blog_draft_openrouter", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.claude_plan_env()


def build_prompt(queue: dict) -> str:
    pages = []
    for task in queue.get("tasks") or []:
        pages.append({
            "page": task.get("page"),
            "file": task.get("repoPath"),
            "queries": [
                {
                    "query": row.get("query"),
                    "clicks": row.get("clicks"),
                    "impressions": row.get("impressions"),
                    "position": row.get("position"),
                }
                for row in task.get("queries") or []
            ],
        })
    return (
        "Write specific on-page additions so each page answers its measured queries. "
        "Do not invent a metric.\n\n"
        + json.dumps({"pages": pages}, indent=2)
    )


def call_claude(system: str, user: str, env: dict, model: str = MODEL, timeout: int = 180) -> str:
    cmd = [
        "claude", "-p", "--model", model, "--output-format", "text",
        "--safe-mode", "--strict-mcp-config", "--tools", "",
        "--system-prompt", system,
    ]
    proc = subprocess.run(cmd, input=user, capture_output=True, text=True, env=env, timeout=timeout)
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()[:300]
        raise RuntimeError(f"claude CLI exit {proc.returncode}: {detail}")
    return proc.stdout.strip()


def extract_json(text: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip()).rstrip("` \n")
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(cleaned[start:end])
        raise


def apply_narrative(queue: dict, narrative: dict) -> dict:
    """Attach model instructions without changing measured metrics."""
    by_page = {}
    for page in narrative.get("pages") or []:
        if isinstance(page, dict) and page.get("page"):
            by_page[page["page"]] = page
    updated = json.loads(json.dumps(queue))
    for task in updated.get("tasks") or []:
        allowed = {row.get("query") for row in task.get("queries") or []}
        page = by_page.get(task.get("page")) or {}
        extra = []
        for change in page.get("changes") or []:
            heading = change.get("heading")
            instruction = change.get("instruction")
            if heading in allowed and isinstance(instruction, str) and instruction.strip():
                extra.append({"heading": heading, "instruction": instruction.strip(), "source": "claude-plan"})
        task["claudePlanChanges"] = extra
        task["status"] = "needs-review"
        task["draftable"] = False
        task["autoPublish"] = False
        task["publicMutationAuthorized"] = False
    updated["proposalSource"] = "claude-plan"
    updated["approval"] = "needs-review"
    updated["autoPublish"] = False
    updated["publicMutationAuthorized"] = False
    return updated


def metrics_unchanged(before: dict, after: dict) -> bool:
    def rows(report):
        found = []
        for task in report.get("tasks") or []:
            for row in task.get("queries") or []:
                found.append((row.get("query"), row.get("clicks"), row.get("impressions"), row.get("position"), task.get("page")))
        return found
    return rows(before) == rows(after)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", type=pathlib.Path, default=QUEUE)
    parser.add_argument("--skip-if-unconfigured", action="store_true")
    args = parser.parse_args()

    token = os.getenv("CLAUDE_CODE_OAUTH_TOKEN")
    if not token:
        message = (
            "SKIP Claude-plan proposals: CLAUDE_CODE_OAUTH_TOKEN is not set. "
            "Measured-query instructions stay as written. There is no OpenRouter fallback. "
            "This is the same secret the blog draft lane uses."
        )
        print(message)
        if os.getenv("GITHUB_ACTIONS"):
            print(f"::notice title=Claude plan token not set::{message}")
        if args.skip_if_unconfigured:
            return
        sys.exit("CLAUDE_CODE_OAUTH_TOKEN not set; refusing to draft.")

    if not args.queue.exists():
        sys.exit(f"queue not found: {args.queue}")
    queue = json.loads(args.queue.read_text(encoding="utf-8"))
    env = load_plan_env()
    raw = call_claude(SYSTEM, build_prompt(queue), env)
    narrative = extract_json(raw)
    updated = apply_narrative(queue, narrative)
    if not metrics_unchanged(queue, updated):
        sys.exit("refusing to write: model merge changed measured clicks, impressions, or positions")
    args.queue.write_text(json.dumps(updated, indent=2) + "\n", encoding="utf-8")
    markdown = args.queue.with_suffix(".md")
    if markdown.exists():
        note = "\n\nClaude-plan notes were attached to the JSON queue. Measured clicks, impressions, and positions were not changed. Still needs review. Not published.\n"
        markdown.write_text(markdown.read_text(encoding="utf-8") + note, encoding="utf-8")
    print(f"Attached Claude-plan notes to {args.queue.name}. Status remains needs-review.")


if __name__ == "__main__":
    main()
