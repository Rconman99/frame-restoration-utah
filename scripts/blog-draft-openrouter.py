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
import json
import os
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_MODEL = os.getenv("FRAME_BLOG_OPENROUTER_MODEL", "google/gemini-2.5-flash")
PENDING = ROOT / "data" / "blog-pending"

# Compliance contract baked into the system prompt. Mirrors the hard-fence in
# blog-publish.py (FORBIDDEN_PHRASES) + the Utah §31A-26-201 rules.
SYSTEM = """You are a senior content writer for Frame Restoration Utah, a licensed Utah roofing contractor. You write E-E-A-T-strong, locally-specific roofing blog posts. Output ONLY a single JSON object, no prose, no markdown fences.

HARD COMPLIANCE RULES (a legal fence rejects the post if you break these):
- Brand name in prose is exactly "Frame Restoration Utah". Never "Frame Roofing Utah", never bare "Frame".
- Public phone is exactly 435-292-8802. Never any other number.
- Utah §31A-26-201 forbids a roofer from acting as an insurance adjuster. You are describing DOCUMENTATION, never adjusting/advocacy. NEVER use any of these exact phrases (case-insensitive): "public adjuster", "negotiate", "settlement", "maximize payout", "maximize your payout", "claim navigation", "advocate on your behalf", "advocates on your behalf", "handle the claim", "handle your claim", "handles the claim", "work directly with your adjuster", "we file your claim", "file the claim for you".
- When you mention insurance, use this exact framing: "Frame Restoration Utah documents the observed roof conditions and prepares a written scope your carrier can review. The carrier determines coverage. We document, we don't adjust — regulated adjusting work stays with properly authorized professionals." Put filing on the homeowner ("you file with your insurer").
- Use the exact bigram "insurance claim" at MOST 3 times across the whole post. Prefer "your claim", "your carrier", "coverage".
- Only claim credentials that are true: Licensed & Insured in Utah, BBB Accredited (A+), 24/7 storm response, 10-year workmanship warranty, Utah DOPL contractor license. Do NOT invent certifications, review counts, years in business, awards, or specific prices/cost ranges you were not given.
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


def extract_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?\s*", "", text.strip()).rstrip("` \n")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        s, e = text.find("{"), text.rfind("}") + 1
        if s >= 0 and e > s:
            return json.loads(text[s:e])
        raise


def build_user_prompt(brief: dict) -> str:
    facts = "\n".join(f"- {f}" for f in brief.get("facts", []))
    links = "\n".join(f"- {l}" for l in brief.get("internal_links", []))
    return f"""Write the blog post for this target.

City: {brief['city_name']} ({brief.get('zip','')}), Utah — city_slug "{brief['city_slug']}"
Service angle: {brief['service_name']}  (style: {brief.get('style','atmospheric')})
Primary keyword: {brief['keyword']}
Current weather / seasonal hook to anchor the post in current events: {brief.get('weather_hook','')}

City-true facts you MUST use (do not contradict, do not invent beyond these):
{facts}

Internal links available (use the {{{{link:/path|anchor}}}} token form; only these paths):
{links}

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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief", required=True)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--out")
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--status", default="needs-review",
                    choices=["needs-review", "drafted"],
                    help="Manifest status. 'needs-review' (default) = human-review path "
                         "(blog-publish.py --manual-review). 'drafted' = the autonomous "
                         "auto-publish path (blog-publish.py --push, HARD compliance fence).")
    args = ap.parse_args()

    brief = json.loads(pathlib.Path(args.brief).read_text())
    key = load_key()
    user = build_user_prompt(brief)

    manifest = None
    for attempt in range(1, args.retries + 1):
        try:
            raw = call_openrouter(key, args.model, user)
            if not raw:
                print(f"[attempt {attempt}] empty response; retrying", file=sys.stderr)
                continue
            manifest = extract_json(raw)
            if manifest.get("sections") and manifest.get("faqs"):
                break
            print(f"[attempt {attempt}] thin/incomplete manifest; retrying", file=sys.stderr)
            manifest = None
        except (json.JSONDecodeError, KeyError, urllib.error.URLError) as e:
            print(f"[attempt {attempt}] {type(e).__name__}: {e}; retrying", file=sys.stderr)
    if manifest is None:
        sys.exit(f"OpenRouter drafting failed after {args.retries} attempts")

    # Force the non-negotiable fields regardless of model output.
    manifest["city_slug"] = brief["city_slug"]
    manifest["style"] = brief.get("style", "atmospheric")
    manifest["keyword"] = brief["keyword"]
    manifest["status"] = args.status
    manifest.setdefault("draft_date", "")
    review_note = ("auto-publish path — HARD compliance fence + gates are the backstop"
                   if args.status == "drafted" else "Human compliance review required")
    manifest.setdefault("edit_log", []).append(
        f"OpenRouter draft ({args.model}); target {brief['keyword']}; "
        f"weather hook: {brief.get('weather_hook','')}. {review_note}."
    )

    # Compliance pre-scan (reported; human still gates via blog-publish.py).
    blob = visible_blob(manifest).lower()
    hits = [p for p in FORBIDDEN if p in blob]
    ins = blob.count("insurance claim")
    print("── OpenRouter draft compliance pre-scan ──", file=sys.stderr)
    print(f"  forbidden-phrase hits: {hits or 'NONE'}", file=sys.stderr)
    print(f"  'insurance claim' bigrams: {ins} (cap 3)", file=sys.stderr)
    print(f"  brand 'Frame Restoration Utah': {blob.count('frame restoration utah')}", file=sys.stderr)
    print(f"  phone 435-292-8802 present: {'435-292-8802' in blob}", file=sys.stderr)

    slug = manifest.get("slug") or brief["keyword"].lower().replace(" ", "-")
    out = pathlib.Path(args.out) if args.out else (PENDING / f"{slug}.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
