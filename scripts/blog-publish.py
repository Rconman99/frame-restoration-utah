#!/usr/bin/env python3
"""
Frame Roofing Utah — Blog Auto-Publish Stage

Sits downstream of blog-cron.sh (the draft stage). Takes the oldest `drafted`
manifest from data/blog-pending/, polishes the title for CTR, renders it via
generate-blog-post.py, hard-fences the rendered HTML for YMYL/§31A-26-201
advocacy vocabulary, integrates the post into sitemap.xml + blog/index.html,
runs the blocking audit gates, and (only with --push) commits + pushes +
verifies the remote actually advanced.

Usage:
  # Dry-publish (DEFAULT — renders, integrates, gates, then restores the
  # working tree so the shared checkout stays clean):
  python3 scripts/blog-publish.py [--manifest data/blog-pending/<slug>.json]

  # Real publish (blogbot worktree only — commits, pushes, verifies remote):
  python3 scripts/blog-publish.py --push

Hard rules (encoded — do not change without reading CLAUDE.md):
  - Brand is Frame Roofing Utah ONLY. Never Texas / framerestoration.
  - This script never edits generate-blog-post.py behavior — phone-number
    rules (public 435-292-8802 in hrefs) live in the renderer.
  - Fail closed: any fence/gate failure deletes the rendered HTML, restores
    sitemap + blog index, flags the manifest needs-review, exits 1.
  - This is unreviewed auto-publish of YMYL-adjacent content, so the fence
    here is intentionally STRICTER than the site-wide compliance gates.
"""

from __future__ import annotations
import argparse
import json
import html as html_mod
import re
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
PENDING_DIR = ROOT / "data" / "blog-pending"
PUBLISHED_DIR = ROOT / "data" / "blog-published"
BLOG_INDEX = ROOT / "blog" / "index.html"
SITEMAP = ROOT / "sitemap.xml"
CITY_IMAGE_DIR = ROOT / "images" / "projects" / "cities"
RUN_LOG = Path.home() / ".cache" / "frame-roofing-blog-publish.jsonl"

SITE = "https://www.frameroofingutah.com"
FALLBACK_IMAGE = "/images/projects/cities/heber-valley-drone-poster.webp"
COMMIT_AUTHOR = "Blog Bot <blog-bot@frameroofingutah.com>"

# ── Compliance hard-fence (beyond the CI gates — unreviewed auto-publish) ──
# Utah §31A-26-201 unlicensed-adjusting vocabulary + advocacy phrasing the
# site-wide compliance-words gate historically missed (see memory:
# feedback_frame_compliance_gate_blindspot). Case-insensitive substring match
# against the rendered page's VISIBLE text.
FORBIDDEN_PHRASES = [
    "public adjuster",
    "negotiate",
    "maximize payout",
    "maximize your payout",
    "claim navigation",
    "advocates on your behalf",
    "advocate on your behalf",
    "handle your claim",
    "handles the claim",
    "handle the claim",
    "work directly with your adjuster",
    "we file your claim",
    "file the claim for you",
    "settlement",
]
# Concentration rule (memory: feedback_aeo_concentration_over_repetition) —
# insurance-claim copy belongs on the cornerstone page, not stuffed into
# auto-published spokes. Counted case-insensitively in VISIBLE text only
# (FAQ/HowTo copy is mirrored into JSON-LD, so a raw-file count double-counts
# every mention). Storm posts get one extra mention of headroom — the topic
# can't be covered honestly with zero insurance references.
INSURANCE_BIGRAM = "insurance claim"
INSURANCE_MAX = 3
INSURANCE_MAX_STORM = 4

# Blocking gates for this stage. compliance-words runs WITHOUT --strict —
# site-wide saturation is a known advisory, not a per-post blocker.
GATES = [
    "audit-jsonld.mjs",
    "audit-links.mjs",
    "audit-compliance-words.mjs",
    "audit-doc-isolation.mjs",
]


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def log_run(manifest: str, slug: str, action: str, reason: str) -> None:
    RUN_LOG.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "manifest": manifest,
        "slug": slug,
        "action": action,  # published | skipped | failed
        "reason": reason,
    }
    with RUN_LOG.open("a") as fh:
        fh.write(json.dumps(record) + "\n")


def run(cmd: list[str], cwd: Path = ROOT, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, env=env)


def git(*args: str) -> subprocess.CompletedProcess:
    return run(["git", *args])


def is_tracked(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    return git("ls-files", "--error-unmatch", str(rel)).returncode == 0


# ── Working-tree snapshot/restore ───────────────────────────────────
# The main checkout is SHARED with other lanes. We restore files from
# in-memory snapshots taken before WE touched them (not `git show HEAD:`)
# so any pre-existing uncommitted edits from another lane survive a revert.
class TreeState:
    def __init__(self) -> None:
        self.snapshots: dict[Path, bytes | None] = {}  # None = did not exist

    def remember(self, path: Path) -> None:
        if path in self.snapshots:
            return
        self.snapshots[path] = path.read_bytes() if path.exists() else None

    def restore_all(self) -> list[str]:
        restored = []
        for path, content in self.snapshots.items():
            try:
                rel = str(path.relative_to(ROOT))
            except ValueError:
                rel = str(path)  # manifest may live outside the repo
            if content is None:
                if path.exists():
                    path.unlink()
                    restored.append(f"deleted {rel}")
            else:
                if not path.exists() or path.read_bytes() != content:
                    path.write_bytes(content)
                    restored.append(f"restored {rel}")
        return restored


# ── Manifest selection ──────────────────────────────────────────────
def manifest_sort_key(path: Path, manifest: dict):
    return (manifest.get("draft_date") or "9999-99-99", path.stat().st_mtime)


def rendered_path_for(manifest: dict) -> Path:
    return ROOT / "blog" / manifest["city_slug"] / f"{manifest['slug']}.html"


def pick_default_manifest() -> Path | None:
    candidates = []
    for path in sorted(PENDING_DIR.glob("*.json")):
        try:
            manifest = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            log(f"! Skipping unreadable manifest {path.name}")
            continue
        if manifest.get("status") != "drafted":
            continue
        rendered = rendered_path_for(manifest)
        if rendered.exists() and is_tracked(rendered):
            # Already live on the site — re-publishing would overwrite a
            # shipped post (the 2026-05-09 batch never had its manifests
            # moved out of blog-pending). Never auto-pick these.
            log(f"! Skipping {path.name}: rendered post already tracked at "
                f"{rendered.relative_to(ROOT)} (stale pending manifest)")
            continue
        candidates.append((path, manifest))
    if not candidates:
        return None
    candidates.sort(key=lambda pm: manifest_sort_key(*pm))
    return candidates[0][0]


# ── Title CTR polish (deterministic, no LLM, no invented facts) ─────
def city_label(city_slug: str) -> str:
    return "Utah" if city_slug == "utah" else city_slug.replace("-", " ").title()


def title_is_bare_keyword(title: str) -> bool:
    return ":" not in title and not any(ch.isdigit() for ch in title)


def derive_service(manifest: dict) -> str:
    """Service phrase = keyword minus city tokens minus trailing 'utah'."""
    keyword = (manifest.get("keyword") or manifest.get("title") or "").strip()
    city_words = set(city_label(manifest.get("city_slug", "utah")).lower().split())
    tokens = [t for t in keyword.split() if t.lower() not in city_words | {"utah"}]
    service = " ".join(tokens).strip() or keyword
    return service.title()


def polish_title(manifest: dict) -> str | None:
    """Return the new title if the current one is a bare keyword, else None."""
    title = str(manifest.get("title") or "").strip()
    if not title or not title_is_bare_keyword(title):
        return None
    city = city_label(manifest.get("city_slug", "utah"))
    style = (manifest.get("style") or "").lower()
    keyword = (manifest.get("keyword") or title).strip()
    is_storm_or_repair = style == "storm" or "repair" in keyword.lower()
    if is_storm_or_repair:
        service = derive_service(manifest)
        where = "Utah" if city == "Utah" else f"{city}, Utah"
        return f"{service} in {where}: What to Do + What It Costs (2026)"
    return f"{keyword.title()}: 2026 Guide for {city} Homeowners"


# ── Hero image ──────────────────────────────────────────────────────
def find_hero_image(city_slug: str) -> str:
    matches = sorted(
        CITY_IMAGE_DIR.glob(f"*{city_slug}*.webp"),
        key=lambda p: p.stat().st_size,
        reverse=True,
    )
    if matches:
        return "/" + str(matches[0].relative_to(ROOT))
    return FALLBACK_IMAGE


# ── Compliance fence ────────────────────────────────────────────────
def visible_text(html: str) -> str:
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_mod.unescape(text)
    return re.sub(r"\s+", " ", text)


def compliance_fence(rendered_html: str, style: str = "") -> list[str]:
    reasons = []
    body = visible_text(rendered_html).lower()
    for phrase in FORBIDDEN_PHRASES:
        count = body.count(phrase)
        if count:
            reasons.append(f"forbidden advocacy phrase in visible text: \"{phrase}\" x{count}")
    cap = INSURANCE_MAX_STORM if style == "storm" else INSURANCE_MAX
    bigram_count = body.count(INSURANCE_BIGRAM)
    if bigram_count > cap:
        reasons.append(
            f"\"{INSURANCE_BIGRAM}\" appears {bigram_count}x in visible text (max {cap})"
        )
    return reasons


# ── Sitemap + blog index integration ────────────────────────────────
def insert_sitemap_url(url: str) -> bool:
    """Idempotent insert before </urlset>. Returns True if inserted."""
    content = SITEMAP.read_text()
    if f"<loc>{url}</loc>" in content:
        return False
    entry = (
        "  <url>\n"
        f"    <loc>{url}</loc>\n"
        f"    <lastmod>{date.today().isoformat()}</lastmod>\n"
        "    <changefreq>monthly</changefreq>\n"
        "    <priority>0.6</priority>\n"
        "  </url>\n"
    )
    if "</urlset>" not in content:
        raise RuntimeError("sitemap.xml has no </urlset> close tag")
    SITEMAP.write_text(content.replace("</urlset>", entry + "</urlset>"))
    return True


def build_index_card(manifest: dict, post_path: str, image: str) -> str:
    """Card markup copied from the existing blog/index.html .blog-card pattern."""
    city_slug = manifest.get("city_slug", "utah")
    label = "Statewide Utah" if city_slug == "utah" else f"{city_label(city_slug)}, UT"
    pretty_date = date.today().strftime("%B %-d, %Y")
    title = html_mod.escape(str(manifest.get("title", "")), quote=False)
    excerpt = html_mod.escape(str(manifest.get("excerpt", "")), quote=False)
    return (
        f'  <a href="{post_path}" class="blog-card">\n'
        f"    <div class=\"blog-card-thumb\" style=\"background-image:url('{image}')\"></div>\n"
        f'    <div class="blog-card-body">\n'
        f'      <div class="blog-meta">{label} &middot; {pretty_date}</div>\n'
        f"      <h2>{title}</h2>\n"
        f"      <p>{excerpt}</p>\n"
        f'      <span class="read-more">Read guide &rarr;</span>\n'
        f"    </div>\n"
        f"  </a>\n"
    )


def insert_index_card(manifest: dict, post_path: str, image: str) -> bool:
    """Idempotent insert at the TOP of the blog index grid."""
    content = BLOG_INDEX.read_text()
    if f'href="{post_path}"' in content:
        return False
    marker = '<div class="blog-list">'
    if marker not in content:
        raise RuntimeError("blog/index.html: could not find the .blog-list grid")
    card = build_index_card(manifest, post_path, image)
    BLOG_INDEX.write_text(content.replace(marker, marker + "\n\n" + card, 1))
    return True


# ── Gates ───────────────────────────────────────────────────────────
def run_gates(manual_review: bool = False) -> tuple[bool, str]:
    # compliance-words is a compliance JUDGMENT; on the human-reviewed path it
    # is advisory (reported, not blocking). The rest are structural and stay hard.
    advisory = {"audit-compliance-words.mjs"} if manual_review else set()
    for gate in GATES:
        log(f"-> Gate: {gate}" + ("  (advisory)" if gate in advisory else ""))
        proc = run(["node", str(ROOT / "scripts" / gate)])
        if proc.returncode != 0:
            if gate in advisory:
                log(f"   ⚠ {gate} reported issues (ADVISORY — not blocking)")
                continue
            tail = "\n".join((proc.stdout + proc.stderr).strip().splitlines()[-12:])
            return False, f"{gate} exit {proc.returncode}\n{tail}"
        log(f"   PASS {gate}")
    return True, ""


# ── Failure path ────────────────────────────────────────────────────
def fail_closed(state: TreeState, manifest_path: Path, manifest: dict,
                reason: str, push: bool) -> None:
    """Revert every file this run touched; flag the manifest needs-review."""
    log(f"x FAIL-CLOSED: {reason.splitlines()[0]}")
    restored = state.restore_all()
    for line in restored:
        log(f"   {line}")
    short_reason = reason.splitlines()[0]
    if push:
        # Persist the needs-review flag so the queue drains instead of
        # retrying the same manifest forever after the worktree resets.
        manifest["status"] = "needs-review"
        manifest.setdefault("edit_log", []).append(
            f"{date.today().isoformat()} blog-publish auto-publish blocked: {short_reason}"
        )
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
        rel = str(manifest_path.relative_to(ROOT))
        git("add", rel)
        commit = git("-c", f"user.name={COMMIT_AUTHOR.split(' <')[0]}",
                     "-c", f"user.email={COMMIT_AUTHOR.split('<')[1].rstrip('>')}",
                     "commit", "--author", COMMIT_AUTHOR,
                     "-m", f"chore(blog): flag {manifest['slug']} needs-review (auto-publish fence)",
                     "--", rel)
        if commit.returncode == 0:
            pushed = git("push", "origin", "HEAD:main")
            if pushed.returncode != 0:
                log("! Could not push needs-review flag (left as local commit): "
                    + pushed.stderr.strip()[:300])
        else:
            log("! Could not commit needs-review flag: " + commit.stderr.strip()[:300])
    else:
        log(f"   (no --push: manifest restored; WOULD set status=needs-review: {short_reason})")
    log_run(str(manifest_path.relative_to(ROOT)), manifest.get("slug", "?"), "failed", short_reason)
    sys.exit(1)


# ── Publish (git) ───────────────────────────────────────────────────
def git_publish(manifest_path: Path, manifest: dict, rendered: Path,
                published_url: str, manual_review: bool = False) -> None:
    slug = manifest["slug"]
    city = city_label(manifest.get("city_slug", "utah"))
    manifest_was_tracked = is_tracked(manifest_path)

    PUBLISHED_DIR.mkdir(parents=True, exist_ok=True)
    published_manifest = PUBLISHED_DIR / f"{slug}.json"
    manifest["status"] = "published"
    manifest["published_at"] = datetime.now(timezone.utc).isoformat()
    manifest["published_url"] = published_url
    published_manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    manifest_path.unlink()

    rels = [
        str(rendered.relative_to(ROOT)),
        str(SITEMAP.relative_to(ROOT)),
        str(BLOG_INDEX.relative_to(ROOT)),
        str(published_manifest.relative_to(ROOT)),
    ]
    if manifest_was_tracked:
        rels.append(str(manifest_path.relative_to(ROOT)))  # records the deletion
    added = git("add", "-A", "--", *rels)
    if added.returncode != 0:
        log("x git add failed:\n" + added.stderr)
        sys.exit(1)

    name = COMMIT_AUTHOR.split(" <")[0]
    email = COMMIT_AUTHOR.split("<")[1].rstrip(">")
    marker = "[manual-review human-approved]" if manual_review else "[skip-review scheduled post]"
    verb = "publish" if manual_review else "auto-publish"
    message = f"content(blog): {verb} {slug} ({city}) {marker}"
    commit = git("-c", f"user.name={name}", "-c", f"user.email={email}",
                 "commit", "--author", COMMIT_AUTHOR, "-m", message, "--", *rels)
    if commit.returncode != 0:
        log("x git commit failed:\n" + commit.stderr)
        log_run(str(manifest_path.relative_to(ROOT)), slug, "failed", "git commit failed")
        sys.exit(1)
    log(f"✓ Committed: {message}")

    pushed = git("push", "origin", "HEAD:main")
    if pushed.returncode != 0:
        log("\n" + "!" * 70)
        log("!! GIT PUSH FAILED — commit is LOCAL ONLY, post is NOT live !!")
        log(pushed.stderr.strip())
        log("!" * 70)
        log_run(str(manifest_path.relative_to(ROOT)), slug, "failed", "git push failed")
        sys.exit(1)

    # This repo's push has lied before — verify the remote actually moved.
    local_sha = git("rev-parse", "HEAD").stdout.strip()
    remote = git("ls-remote", "origin", "main").stdout.split()
    remote_sha = remote[0] if remote else ""
    if remote_sha != local_sha:
        log("\n" + "!" * 70)
        log("!! PUSH VERIFY MISMATCH — remote main != local HEAD !!")
        log(f"!! local  {local_sha}")
        log(f"!! remote {remote_sha or '(unreadable)'}")
        log("!! Commit left local. Investigate before re-running. !!")
        log("!" * 70)
        log_run(str(manifest_path.relative_to(ROOT)), slug, "failed", "push verify mismatch")
        sys.exit(1)
    log(f"✓ Push verified: origin/main == {local_sha[:10]}")


# ── Main ────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", help="Path to a pending manifest JSON "
                        "(default: oldest status=drafted in data/blog-pending/)")
    parser.add_argument("--push", action="store_true",
                        help="Actually commit + push. Without this flag the run is a "
                        "dry-publish: render + integrate + gates, then restore the tree.")
    parser.add_argument("--manual-review", action="store_true",
                        help="Human-reviewed publish. A person has read + fixed the draft, "
                        "so the COMPLIANCE judgment (advocacy-phrase fence, insurance-claim "
                        "cap, compliance-words gate) becomes ADVISORY — it reports but does "
                        "not block. Structural gates (jsonld/links/doc-isolation) stay hard. "
                        "Also accepts status=needs-review, not just status=drafted.")
    args = parser.parse_args()

    # 1. Pick manifest
    if args.manifest:
        manifest_path = Path(args.manifest)
        if not manifest_path.is_absolute():
            manifest_path = (ROOT / args.manifest).resolve()
    else:
        picked = pick_default_manifest()
        if picked is None:
            log("Nothing to publish: no drafted manifests in data/blog-pending/.")
            log_run("", "", "skipped", "nothing to publish")
            sys.exit(0)
        manifest_path = picked

    if not manifest_path.exists():
        log(f"x Manifest not found: {manifest_path}")
        sys.exit(1)
    manifest = json.loads(manifest_path.read_text())
    status = manifest.get("status")
    allowed = {"drafted", "needs-review"} if args.manual_review else {"drafted"}
    if status not in allowed:
        log(f"x Refusing manifest with status={status!r} (allowed: {sorted(allowed)}).")
        log_run(str(manifest_path), manifest.get("slug", "?"), "skipped", f"status={status}")
        sys.exit(1)
    if args.manual_review:
        log(f"-> MANUAL-REVIEW mode: compliance checks ADVISORY (human-reviewed); "
            f"structural gates still hard. Accepting status={status!r}.")

    slug = manifest["slug"]
    city_slug = manifest.get("city_slug", "utah")
    rel_manifest = (str(manifest_path.relative_to(ROOT))
                    if str(manifest_path).startswith(str(ROOT)) else str(manifest_path))
    log(f"-> Manifest: {rel_manifest}")
    log(f"-> Post: /blog/{city_slug}/{slug}")

    state = TreeState()
    state.remember(manifest_path)

    # 2. Title CTR polish (deterministic, no LLM)
    new_title = polish_title(manifest)
    if new_title:
        old_title = manifest["title"]
        manifest["title"] = new_title
        manifest.setdefault("edit_log", []).append(
            f"{date.today().isoformat()} blog-publish title CTR polish: "
            f"{old_title!r} -> {new_title!r}"
        )
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
        log(f"-> Title polished: {old_title!r}")
        log(f"               -> {new_title!r}")
    else:
        log(f"-> Title kept as-is: {manifest['title']!r}")

    # 3. Hero image
    image = find_hero_image(city_slug)
    log(f"-> Hero image: {image}" + ("  (fallback)" if image == FALLBACK_IMAGE else ""))

    # 4. Render (fail closed on nonzero exit)
    rendered = rendered_path_for(manifest)
    state.remember(rendered)
    proc = run([sys.executable, str(ROOT / "scripts" / "generate-blog-post.py"),
                "--render", "--manifest", str(manifest_path), "--image-local", image])
    if proc.returncode != 0:
        fail_closed(state, manifest_path, manifest,
                    f"render failed (exit {proc.returncode}): "
                    f"{(proc.stderr or proc.stdout).strip()[:400]}", args.push)
    if not rendered.exists():
        fail_closed(state, manifest_path, manifest,
                    f"render reported success but {rendered} is missing", args.push)
    log(f"✓ Rendered {rendered.relative_to(ROOT)}")

    # 5. Compliance fence on the rendered HTML
    rendered_html = rendered.read_text()
    reasons = compliance_fence(rendered_html, style=manifest.get("style", ""))
    if reasons:
        if args.manual_review:
            log("⚠ Compliance fence (ADVISORY — human-reviewed, not blocking):")
            for r in reasons:
                log(f"    - {r}")
        else:
            fail_closed(state, manifest_path, manifest,
                        "compliance fence: " + "; ".join(reasons), args.push)
    else:
        log("✓ Compliance fence clean")

    # 6. Integrate: sitemap + blog index
    post_path = f"/blog/{city_slug}/{slug}"
    post_url = f"{SITE}{post_path}"
    state.remember(SITEMAP)
    state.remember(BLOG_INDEX)
    try:
        sitemap_added = insert_sitemap_url(post_url)
        card_added = insert_index_card(manifest, post_path, image)
    except RuntimeError as exc:
        fail_closed(state, manifest_path, manifest, f"integration failed: {exc}", args.push)
    log(f"✓ Sitemap: {'inserted' if sitemap_added else 'already present (skipped)'}")
    log(f"✓ Blog index card: {'inserted' if card_added else 'already present (skipped)'}")

    # 7. Gates (fail closed; compliance-words advisory in manual-review)
    ok, gate_reason = run_gates(manual_review=args.manual_review)
    if not ok:
        fail_closed(state, manifest_path, manifest, f"gate failed: {gate_reason}", args.push)

    changed = [str(p.relative_to(ROOT)) for p in (rendered, SITEMAP, BLOG_INDEX)]

    # 8. Publish or restore
    if args.push:
        git_publish(manifest_path, manifest, rendered, post_url,
                    manual_review=args.manual_review)
        log(f"\n✓ PUBLISHED {post_url}")
        log_run(rel_manifest, slug, "published", post_url)
    else:
        log("\n── DRY-PUBLISH SUMMARY (no --push) " + "─" * 30)
        log(f"  Would publish: {post_url}")
        log(f"  Title:         {manifest['title']}")
        log(f"  Hero image:    {image}")
        log("  Files that would be committed:")
        for rel in changed:
            log(f"    {rel}")
        log(f"    {rel_manifest} -> data/blog-published/{slug}.json (status=published)")
        log("  All gates passed. Restoring working tree…")
        for line in state.restore_all():
            log(f"    {line}")
        log("✓ Working tree restored — shared checkout left clean.")
        log_run(rel_manifest, slug, "skipped", "dry-publish (no --push); gates passed")


if __name__ == "__main__":
    main()
