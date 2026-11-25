#!/usr/bin/env python3
"""Frame Restoration Utah — OpenRouter blog drafter (2026-07-09).

The scalable, reliable draft engine that replaces the retired local-Ollama
auto-draft (PR #146). Given a target brief (city + service + weather hook +
city-true facts), it drafts a compliant blog manifest via OpenRouter, retrying
on empty/unparseable output — the exact failure mode nemotron kept hitting.

The OpenRouter key is read IN-MEMORY from process env or ~/.env.frame-roofing
(the canonical Frame secrets file) and is never printed. Output is a manifest
written to data/blog-pending/<slug>.json with status=needs-review, so it flows
through blog-publish.py --manual-review -> gates -> PR (a human still owns the
compliance sign-off; the fence + gates are the backstop).

Usage:
  python3 scripts/blog-draft-openrouter.py --brief path/to/brief.json
  # brief.json: {city_slug, city_name, service_slug, service_name, style,
  #              keyword, weather_hook, facts:[...], internal_links:[...]}
  # optional: --model <openrouter-slug>  --out data/blog-pending/<slug>.json
"""
import argparse
import copy
import importlib.util
import json
import os
import pathlib
import re
import shutil
import signal
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_MODEL = os.getenv("FRAME_BLOG_OPENROUTER_MODEL", "google/gemini-2.5-flash")
# 2026-10-30: default drafter is Claude sonnet-5-5 on the flat-rate Claude plan
# (Claude Code CLI, plan OAuth). Shadow PASS:
# model-monitor/evals/onboard-shadow/SHADOW-utah-blog-sonnet55-2026-10-30.md.
# OpenRouter stays available only as an explicit opt-in (--provider openrouter);
# there is NO automatic fallback, so a plan failure never silently spends.
DEFAULT_PROVIDER = os.getenv("FRAME_BLOG_PROVIDER", "claude-plan")
CLAUDE_MODEL = os.getenv("FRAME_BLOG_CLAUDE_MODEL", "claude-sonnet-5-5")
# Env vars that would route the Claude CLI to metered API billing. Stripped
# from the child env so the CLI can only authenticate via the plan.
METERED_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
               "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "OPENROUTER_API_KEY")
PENDING = ROOT / "data" / "blog-pending"
# Last ~4KB of each CLI stream, logged on non-zero exit (bytes, not chars).
CLI_LOG_TAIL_BYTES = 4096
_MIN_SECRET_LEN = 8
_SK_ANT_RE = re.compile(r"sk-ant-[A-Za-z0-9_-]+")
_BEARER_RE = re.compile(r"(?i)Bearer\s+[A-Za-z0-9._\-]+")
_JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
# Long base64-looking strings: 40+ chars with + / or padding, or 64+ alnum.
_B64_RE = re.compile(
    r"(?<![A-Za-z0-9+/=])(?:"
    r"[A-Za-z0-9+/]{40,}={1,2}"
    r"|[A-Za-z0-9+/]*[+\/][A-Za-z0-9+/=]{39,}={0,2}"
    r"|[A-Za-z0-9+/]{64,}={0,2}"
    r")(?![A-Za-z0-9+/=])"
)

# Compliance contract baked into the system prompt. Mirrors the hard-fence in
# blog-publish.py (FORBIDDEN_PHRASES) + the Utah §31A-26-201 rules.
SYSTEM = """You are a senior content writer for Frame Restoration Utah, a licensed Utah roofing contractor. You write E-E-A-T-strong, locally-specific roofing blog posts. Output ONLY a single JSON object, no prose, no markdown fences.

HARD COMPLIANCE RULES (a legal fence rejects the post if you break these):
- Brand name in prose is exactly "Frame Restoration Utah". Never "Frame Roofing Utah", never bare "Frame".
- Public phone is exactly 435-292-8802. Never any other number.
- Utah §31A-26-201 forbids a roofer from acting as an insurance adjuster. You are describing DOCUMENTATION, never adjusting/advocacy. NEVER use any of these exact phrases (case-insensitive): "public adjuster", "negotiate", "settlement", "maximize payout", "maximize your payout", "claim navigation", "advocate on your behalf", "advocates on your behalf", "handle the claim", "handle your claim", "handles the claim", "work directly with your adjuster", "we file your claim", "file the claim for you".
- When you mention insurance, use this exact framing: "Frame Restoration Utah documents the observed roof conditions and prepares a written scope your carrier can review. The carrier determines coverage. We document, we don't adjust — regulated adjusting work stays with properly authorized professionals." Put filing on the homeowner ("you file with your insurer").
- Use the exact bigram "insurance claim" at MOST 3 times across the whole post, and NEVER in the title: the title is shown three times on the page (browser tab, breadcrumb, H1) and the legal fence counts every one. Prefer "your claim", "your carrier", "coverage".
- Only claim credentials that are true: Licensed & Insured in Utah, BBB Accredited, 24/7 storm response, 10-year workmanship warranty, Utah DOPL contractor license. Do NOT invent certifications, review counts, years in business, awards, or specific prices/cost ranges you were not given.
- Internal links use the token form {{link:/path|anchor text}} and ONLY the paths provided in internal_links.

STRUCTURE (return these JSON keys exactly):
- title: string, includes the city and the year 2026, compelling, no brand suffix.
- slug: kebab-case, e.g. "roof-replacement-holladay-utah".
- excerpt: <=155 chars, includes the city and "435-292-8802".
- category: "Storm Response" for storm topics, else "Roofing Tips".
- tldr: 2-4 sentence direct answer, includes phone 435-292-8802.
- sections: array of {type:"h2"|"p", text}. 7-8 h2 headings, each followed by 2-3 p paragraphs. ~1500+ words total. Deeply city-true using the provided facts (neighborhoods, geography, ZIP, housing stock, the weather hook). Weave at least two {{link:...}} tokens into paragraph text.
- faqs: array of 5 {q, a}. City-specific. a is 2-4 sentences.
- howto: {name, total_time:"PT48H" or "PT30D", steps:[5-7 {name, text}]}.
- sources: array of 5 {label, url} — real authoritative URLs (NWS, Utah DOPL, IRC/ICC, the city .gov, Utah Insurance Department).
- image_prompt, image_alt, image_caption: for a STYLIZED editorial illustration (not a photo). image_caption must be "Illustration — not a photograph of a Frame Restoration Utah project".
"""


def load_key() -> str:
    k = os.getenv("OPENROUTER_API_KEY")
    if k:
        return k
    envf = pathlib.Path.home() / ".env.frame-roofing"
    if envf.exists():
        for line in envf.read_text().splitlines():
            line = line.strip()
            if line.startswith("OPENROUTER_API_KEY=") and "=" in line:
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("OPENROUTER_API_KEY not found in env or ~/.env.frame-roofing")


def call_openrouter(key: str, model: str, user: str,
                    max_tokens: int = 9000, temperature: float = 0.4) -> str:
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://www.framerestorationutah.com",
            "X-Title": "Frame Restoration Utah Blog Drafter",
        },
    )
    with urllib.request.urlopen(req, timeout=240) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return (data["choices"][0]["message"]["content"] or "").strip()


def _is_secret_env_name(name: str) -> bool:
    return name == "CLAUDE_CODE_OAUTH_TOKEN" or name.startswith("ANTHROPIC_")


def _secret_env_values(*envs: dict) -> list[str]:
    """Exact secret values to redact, longest first. Never returns the names alone."""
    seen: set[str] = set()
    values: list[str] = []
    for mapping in envs:
        if not mapping:
            continue
        for key, val in mapping.items():
            if not _is_secret_env_name(key) or not isinstance(val, str):
                continue
            if len(val) < _MIN_SECRET_LEN or val in seen:
                continue
            seen.add(val)
            values.append(val)
    values.sort(key=len, reverse=True)
    return values


def mask_secrets(text: str | None, env: dict | None = None) -> str:
    """Redact plan/API secrets and token-like strings. Never returns raw secrets."""
    if not text:
        return ""
    out = text
    for value in _secret_env_values(env or {}, os.environ):
        out = out.replace(value, "[REDACTED]")
    out = _SK_ANT_RE.sub("sk-ant-[REDACTED]", out)
    out = _BEARER_RE.sub("Bearer [REDACTED]", out)
    out = _JWT_RE.sub("[JWT-REDACTED]", out)
    out = _B64_RE.sub("[B64-REDACTED]", out)
    return out


def tail_text(text: str | None, limit: int = CLI_LOG_TAIL_BYTES) -> str:
    """Return the last `limit` bytes of text (UTF-8), or empty string."""
    if not text:
        return ""
    raw = text.encode("utf-8", errors="replace")
    if len(raw) <= limit:
        return text
    return raw[-limit:].decode("utf-8", errors="replace")


def token_sanity_report(env: dict | None = None) -> str:
    """Presence / non-empty only. Never the value, never a network auth call."""
    src = env if env is not None else os.environ
    present = "CLAUDE_CODE_OAUTH_TOKEN" in src
    length_gt0 = bool(src.get("CLAUDE_CODE_OAUTH_TOKEN"))
    return (f"token sanity: CLAUDE_CODE_OAUTH_TOKEN present: "
            f"{'yes' if present else 'no'}; length>0: "
            f"{'yes' if length_gt0 else 'no'}")


def _signal_label(returncode: int | None) -> str:
    if returncode is None or returncode >= 0:
        return "none"
    sig = -returncode
    try:
        name = signal.Signals(sig).name
    except ValueError:
        name = f"SIG{sig}"
    return f"{name} ({sig})"


def format_claude_cli_failure(proc, env: dict | None = None) -> str:
    """Exit code, signal, and last ~4KB of stdout/stderr, with secrets masked."""
    code = proc.returncode
    sig = _signal_label(code)
    stdout = mask_secrets(tail_text(proc.stdout), env)
    stderr = mask_secrets(tail_text(proc.stderr), env)
    return "\n".join([
        f"claude CLI failed: exit_code={code} signal={sig}",
        "--- stdout (last 4096 bytes, secrets masked) ---",
        stdout if stdout else "(empty)",
        "--- stderr (last 4096 bytes, secrets masked) ---",
        stderr if stderr else "(empty)",
    ])


def claude_cli_error_summary(proc, env: dict | None = None) -> str:
    """Short masked line for the existing retry logger (includes stdout)."""
    code = proc.returncode
    sig = _signal_label(code)
    err = mask_secrets((proc.stderr or "").strip(), env)[:300]
    out = mask_secrets((proc.stdout or "").strip(), env)[:300]
    err = err or "(empty)"
    out = out or "(empty)"
    return f"claude CLI exit {code}, signal {sig}: stderr={err}; stdout={out}"


def claude_plan_env() -> dict:
    """Child env for the Claude CLI: metered-billing vars removed (fail-safe $0).

    In CI the plan token must come from CLAUDE_CODE_OAUTH_TOKEN; if it is
    missing we exit instead of falling back to any metered provider. On the
    Mac the CLI's existing plan login is used.
    """
    env = {k: v for k, v in os.environ.items() if k not in METERED_ENV}
    # Presence/non-empty only — never the value, never a refresh/auth call.
    print(token_sanity_report(env), file=sys.stderr)
    if os.getenv("CI") and not env.get("CLAUDE_CODE_OAUTH_TOKEN"):
        sys.exit("CLAUDE_CODE_OAUTH_TOKEN not set in CI; refusing to draft "
                 "(no metered fallback). Ryan-only: add the plan token secret.")
    if not shutil.which("claude"):
        sys.exit("claude CLI not found; install @anthropic-ai/claude-code")
    return env


def call_claude_plan(model: str, user: str, env: dict, timeout: int = 600) -> str:
    cmd = ["claude", "-p", "--model", model, "--output-format", "text",
           "--safe-mode", "--strict-mcp-config", "--tools", "",
           "--system-prompt", SYSTEM]
    proc = subprocess.run(cmd, input=user, capture_output=True, text=True,
                          env=env, timeout=timeout)
    if proc.returncode != 0:
        print(format_claude_cli_failure(proc, env), file=sys.stderr)
        raise RuntimeError(claude_cli_error_summary(proc, env))
    return proc.stdout.strip()


def extract_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?\s*", "", text.strip()).rstrip("` \n")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        s, e = text.find("{"), text.rfind("}") + 1
        if s >= 0 and e > s:
            return json.loads(text[s:e])
        raise


def build_quality_block(qt: dict, avail_links: int) -> str:
    """Inject the traction-derived 'beat the champion' bar so each new post is
    briefed to be better than the best one so far — not merely acceptable."""
    if not qt:
        return ""
    floor = qt.get("hard_floor") or {}
    cities = ", ".join(qt.get("winning_cities") or []) or "—"
    return f"""

QUALITY BAR — beat the current best-performing post ("{qt.get('champion_title') or qt.get('champion_slug')}").
Meet or exceed EVERY number below (this is how each new post outperforms the last):
- Body length ≥ {qt.get('min_words')} words (aim higher — depth wins).
- ≥ {qt.get('min_h2')} h2 content sections (excluding the FAQ/Sources headings).
- ≥ {qt.get('min_faqs')} FAQs, each a genuine, specific question a homeowner would ask.
- ≥ {qt.get('min_sources')} authoritative sources.
- Weave ALL {avail_links} of the provided internal-link tokens into paragraph text naturally.
HARD FLOOR (a post below this is rejected, not published): ≥ {floor.get('min_words','?')} words, ≥ {floor.get('min_h2','?')} h2 sections, ≥ {floor.get('min_faqs','?')} FAQs.
Cities currently pulling the most traction (mirror their depth + local specificity): {cities}."""


def build_user_prompt(brief: dict) -> str:
    facts = "\n".join(f"- {f}" for f in brief.get("facts", []))
    links = "\n".join(f"- {l}" for l in brief.get("internal_links", []))
    quality = build_quality_block(brief.get("quality_target") or {}, len(brief.get("internal_links", [])))
    return f"""Write the blog post for this target.

City: {brief['city_name']} ({brief.get('zip','')}), Utah — city_slug "{brief['city_slug']}"
Service angle: {brief['service_name']}  (style: {brief.get('style','atmospheric')})
Primary keyword: {brief['keyword']}
Current weather / seasonal hook to anchor the post in current events: {brief.get('weather_hook','')}

City-true facts you MUST use (do not contradict, do not invent beyond these):
{facts}

Internal links available (use the {{{{link:/path|anchor}}}} token form; only these paths):
{links}
{quality}

Return the JSON manifest now."""


FORBIDDEN = ["public adjuster", "negotiate", "settlement", "maximize payout",
             "maximize your payout", "claim navigation", "advocate on your behalf",
             "advocates on your behalf", "handle the claim", "handle your claim",
             "handles the claim", "work directly with your adjuster",
             "we file your claim", "file the claim for you"]


def visible_blob(m: dict) -> str:
    parts = [m.get("title", ""), m.get("excerpt", ""), m.get("tldr", "")]
    for s in m.get("sections", []):
        parts.append(s.get("text", ""))
    for f in m.get("faqs", []):
        parts += [f.get("q", ""), f.get("a", "")]
    for st in (m.get("howto") or {}).get("steps", []):
        parts += [st.get("name", ""), st.get("text", "")]
    return " ".join(parts)


def _load_sibling(module_name: str, filename: str):
    spec = importlib.util.spec_from_file_location(module_name, ROOT / "scripts" / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not import scripts/{filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fence_prescan(manifest: dict) -> dict:
    """Count "insurance claim" exactly the way blog-publish.py's HARD fence does.

    2026-11-17 Highland keyword-counter fix: the old pre-scan counted the
    manifest fields once (title x1, cap always 3), but the fence counts the
    RENDERED page's visible text, where the title appears three times (<title>,
    breadcrumb, H1) and storm posts get cap 4. Highland insurance drafts passed
    the pre-scan at 3 and then failed the fence at 5 (11-04 sonnet, 11-12
    fable). This renders the manifest with the real renderer (in memory, no
    file written), applies the same deterministic title polish the publisher
    applies, and runs the publisher's own compliance_fence, so the two counts
    cannot drift apart again. The fence itself is unchanged.
    """
    publisher = _load_sibling("utah_blog_publish_for_prescan", "blog-publish.py")
    renderer = _load_sibling("utah_blog_renderer_for_prescan", "generate-blog-post.py")
    m = copy.deepcopy(manifest)
    new_title = publisher.polish_title(m)
    if new_title:
        m["title"] = new_title
    image = publisher.find_hero_image(m.get("city_slug", "utah"))
    rendered = renderer.render_html(m, None, image)
    style = m.get("style", "")
    count = publisher.visible_text(rendered).lower().count(publisher.INSURANCE_BIGRAM)
    cap = publisher.INSURANCE_MAX_STORM if style == "storm" else publisher.INSURANCE_MAX
    return {"count": count, "cap": cap,
            "reasons": publisher.compliance_fence(rendered, style=style)}


def fence_retry_prompt(user: str, reasons: list[str]) -> str:
    joined = "; ".join(reasons)
    return (f"{user}\n\nYOUR PREVIOUS DRAFT WAS REJECTED by the legal compliance fence: "
            f"{joined}. Rewrite the whole post so it passes. Remove every forbidden phrase. "
            "Keep the exact bigram \"insurance claim\" out of the title entirely and use it "
            "at most 3 times in the rest of the post (prefer \"your claim\", \"your carrier\", "
            "\"coverage\"). Return the JSON manifest now.")


def apply_forced_fields(manifest: dict, brief: dict) -> None:
    manifest["city_slug"] = brief["city_slug"]
    manifest["style"] = brief.get("style", "atmospheric")
    manifest["keyword"] = brief["keyword"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief", required=True)
    ap.add_argument("--provider", default=DEFAULT_PROVIDER,
                    choices=["claude-plan", "openrouter"],
                    help="claude-plan (default, $0 flat-rate plan) or openrouter (explicit opt-in).")
    ap.add_argument("--model", default=None,
                    help="Model id; defaults to claude-sonnet-5-5 (claude-plan) or the OpenRouter default.")
    ap.add_argument("--out")
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--status", default="needs-review",
                    choices=["needs-review", "drafted"],
                    help="Manifest status. 'needs-review' (default) = human-review path "
                         "(blog-publish.py --manual-review). 'drafted' = the autonomous "
                         "auto-publish path (blog-publish.py --push, HARD compliance fence).")
    args = ap.parse_args()

    brief = json.loads(pathlib.Path(args.brief).read_text())
    use_claude = args.provider == "claude-plan"
    if args.model is None:
        args.model = CLAUDE_MODEL if use_claude else DEFAULT_MODEL
    if use_claude:
        env = claude_plan_env()
    else:
        key = load_key()
    label = "Claude plan" if use_claude else "OpenRouter"
    user = build_user_prompt(brief)

    manifest = None
    fence_failed = None  # last complete draft the fence would reject (kept as a fallback)
    prompt = user
    for attempt in range(1, args.retries + 1):
        try:
            raw = (call_claude_plan(args.model, prompt, env) if use_claude
                   else call_openrouter(key, args.model, prompt))
            if not raw:
                print(f"[attempt {attempt}] empty response; retrying", file=sys.stderr)
                continue
            manifest = extract_json(raw)
            if not (manifest.get("sections") and manifest.get("faqs")):
                print(f"[attempt {attempt}] thin/incomplete manifest; retrying", file=sys.stderr)
                manifest = None
                continue
            apply_forced_fields(manifest, brief)
            try:
                scan = fence_prescan(manifest)
            except Exception as e:  # pre-scan is advisory; blog-publish.py's fence is the backstop
                print(f"[attempt {attempt}] fence pre-scan unavailable ({type(e).__name__}: {e}); "
                      "blog-publish.py fence still applies", file=sys.stderr)
                break
            if not scan["reasons"]:
                break
            print(f"[attempt {attempt}] fence pre-scan would FAIL-CLOSED: "
                  f"{'; '.join(scan['reasons'])}; retrying", file=sys.stderr)
            fence_failed, manifest = manifest, None
            prompt = fence_retry_prompt(user, scan["reasons"])
        except (json.JSONDecodeError, KeyError, urllib.error.URLError,
                RuntimeError, subprocess.TimeoutExpired) as e:
            print(f"[attempt {attempt}] {type(e).__name__}: {e}; retrying", file=sys.stderr)
    if manifest is None and fence_failed is not None:
        # Keep the old behaviour of handing a complete draft to blog-publish.py,
        # whose HARD fence fails it closed (status needs-review) — never published.
        print("fence pre-scan still failing after retries; writing draft for the "
              "blog-publish.py fence to quarantine", file=sys.stderr)
        manifest = fence_failed
    if manifest is None:
        sys.exit(f"{label} drafting failed after {args.retries} attempts")

    # Force the non-negotiable fields regardless of model output.
    apply_forced_fields(manifest, brief)
    manifest["status"] = args.status
    manifest.setdefault("draft_date", "")
    review_note = ("auto-publish path — HARD compliance fence + gates are the backstop"
                   if args.status == "drafted" else "Human compliance review required")
    manifest.setdefault("edit_log", []).append(
        f"{label} draft ({args.model}); target {brief['keyword']}; "
        f"weather hook: {brief.get('weather_hook','')}. {review_note}."
    )

    # Compliance pre-scan (reported; human still gates via blog-publish.py).
    blob = visible_blob(manifest).lower()
    hits = [p for p in FORBIDDEN if p in blob]
    ins = blob.count("insurance claim")
    try:
        scan = fence_prescan(manifest)
        fence_line = (f"  'insurance claim' in rendered visible text (fence counter): "
                      f"{scan['count']} (cap {scan['cap']}) -> "
                      f"{'WOULD FAIL-CLOSED: ' + '; '.join(scan['reasons']) if scan['reasons'] else 'fence clean'}")
    except Exception as e:
        fence_line = f"  fence counter unavailable ({type(e).__name__}); blog-publish.py fence still applies"
    print(f"── {label} draft compliance pre-scan ──", file=sys.stderr)
    print(f"  forbidden-phrase hits: {hits or 'NONE'}", file=sys.stderr)
    print(f"  'insurance claim' bigrams in manifest fields: {ins}", file=sys.stderr)
    print(fence_line, file=sys.stderr)
    print(f"  brand 'Frame Restoration Utah': {blob.count('frame restoration utah')}", file=sys.stderr)
    print(f"  phone 435-292-8802 present: {'435-292-8802' in blob}", file=sys.stderr)

    slug = manifest.get("slug") or brief["keyword"].lower().replace(" ", "-")
    out = pathlib.Path(args.out) if args.out else (PENDING / f"{slug}.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
