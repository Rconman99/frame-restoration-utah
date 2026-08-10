#!/usr/bin/env python3
"""
Frame Restoration Utah — Blog Post Generator (Higgsfield-aware)

Tier-based routing per ~/.claude/projects/-Users-agenticmac/memory/cost_optimized_tool_routing.md:
  Tier 1 (Ollama qwen3:8b)  $0  drafts post body + FAQs + HowTo + image prompt
  Tier 4 (Higgsfield)       $$  generates 1 stylized hero illustration (decorative)
  Tier 3 (this script)      —   renders final HTML matching Frame's existing template

Usage:
  # Draft only (writes manifest, no credits spent):
  python3 scripts/generate-blog-post.py --keyword "spring roof inspection utah" --city utah

  # Just print the Ollama prompt (no run, useful for inspection):
  python3 scripts/generate-blog-post.py --keyword "ice dam prevention park city" --prompt-only

  # Render final HTML from a manifest + Higgsfield image URL
  # (the frame-blog-publish skill calls Higgsfield MCP and then runs this):
  python3 scripts/generate-blog-post.py --render \
      --manifest data/blog-pending/spring-roof-inspection-utah.json \
      --image-url https://cdn.higgsfield.ai/.../illustration.webp

  # Skip image entirely — text-only post (uses placeholder image from existing assets):
  python3 scripts/generate-blog-post.py --keyword "..." --no-hero

Hard rules (encoded — do not change without reading CLAUDE.md):
  - Higgsfield assets get ImageObject schema with disambiguatingDescription, NEVER Photograph schema.
  - Alt text labels them as "stylized illustration," not photography.
  - File paths use -illustration.webp suffix to keep naming honest.
  - Phone CTAs use the Twilio line: 435-292-8802.
  - No invented certifications. BBB A+ is allowed; NRCA / GAF Master Elite are NOT.
  - Brand string is "Frame Restoration Utah" — never "Frame Restoration TX" leak.
"""

from __future__ import annotations
import argparse
import html
import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import date
from pathlib import Path
from typing import Optional

# ── Paths ────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
BLOG_DIR = ROOT / "blog"
PENDING_DIR = ROOT / "data" / "blog-pending"
IMAGE_DIR = ROOT / "images" / "blog"
PENDING_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

# ── Frame Restoration Utah constants (mirrors data/route-factory/business.json) ──
SITE = "https://www.framerestorationutah.com"


def _load_business_identity() -> dict:
    """Load the canonical public entity record used by generated blog pages."""
    p = ROOT / "data" / "route-factory" / "business.json"
    try:
        data = json.loads(p.read_text())
        if isinstance(data, dict):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return {}


BUSINESS_IDENTITY = _load_business_identity()
BUSINESS_NAME = BUSINESS_IDENTITY.get("brand") or "Frame Restoration Utah"
LEGAL_NAME = BUSINESS_IDENTITY.get("legal_entity") or "Frame Restoration Utah LLC"
PHONE_CALL = BUSINESS_IDENTITY.get("public_phone_display") or "435-292-8802"
PHONE_TEL = BUSINESS_IDENTITY.get("public_phone_e164") or "+14352928802"
PUBLIC_ADDRESS = BUSINESS_IDENTITY.get("public_address") or {
    "street": "142 S Main St",
    "locality": "Heber City",
    "region": "UT",
    "postal_code": "84032",
    "country": "US",
}
ENTITY_LINKS = BUSINESS_IDENTITY.get("entity_links") or {}
ORGANIZATION_ID = f"{SITE}/#organization"
AUTHOR_ID = f"{SITE}/pages/about#landon-yokers"
SCHEDULE_URL = "https://calendar.app.google/cR4bBSWfb9TQ28UF8"
AUTHOR_NAME = "Landon Yokers"
AUTHOR_TITLE = "Owner"
POSTHOG_KEY = "phc_BnECzlZ2OeDujli2dbqcgGODXlv2tYERbp40dTF7UBV"


def _load_shared_asset_versions() -> dict[str, str]:
    """Immutable shared assets must use the current corpus-wide cache key."""
    path = ROOT / "scripts" / "shared-asset-versions.json"
    try:
        versions = json.loads(path.read_text())
        required = ("global.css", "global-modal.js")
        if all(isinstance(versions.get(asset), str) and versions[asset] for asset in required):
            return versions
    except (OSError, json.JSONDecodeError):
        pass
    raise RuntimeError("scripts/shared-asset-versions.json is missing or invalid")


SHARED_ASSET_VERSIONS = _load_shared_asset_versions()


def _load_city_slugs() -> set[str]:
    """Load city whitelist from market-intel-allocation.json (single source of truth).
    Falls back to a small static list if the file is missing."""
    p = ROOT / "data" / "market-intel-allocation.json"
    slugs = {"utah"}  # always allow statewide posts
    if p.exists():
        try:
            data = json.loads(p.read_text())
            for entry in data.get("allocation", {}).get("byCity", []):
                cid = entry.get("city", {}).get("id")
                if cid:
                    slugs.add(cid)
        except (json.JSONDecodeError, KeyError):
            pass
    if len(slugs) < 5:
        # Fallback if market-intel hasn't been generated
        slugs.update({
            "heber-city", "park-city", "salt-lake-city", "sandy", "draper",
            "herriman", "lehi", "ogden", "provo", "riverton", "bountiful",
            "layton", "murray", "orem", "west-jordan", "west-valley-city",
        })
    return slugs


VALID_CITY_SLUGS = _load_city_slugs()

VALID_INTERNAL_PATHS = [
    "/", "/pages/storm-damage", "/pages/roof-replacement", "/pages/insurance-claims",
    "/pages/residential-roofing", "/pages/commercial-roofing", "/pages/roof-repair",
    "/pages/gutters", "/pages/emergency-tarping", "/pages/about", "/pages/gallery",
    "/blog", "/review",
]

DEFAULT_AUTHORITATIVE_SOURCES = [
    {"label": "National Weather Service Salt Lake City", "url": "https://www.weather.gov/slc/"},
    {"label": "Utah Division of Professional Licensing", "url": "https://dopl.utah.gov/"},
    {"label": "Utah Insurance Department", "url": "https://insurance.utah.gov/"},
    {"label": "International Code Council", "url": "https://codes.iccsafe.org/"},
]

# ── Style presets for Higgsfield image prompts ──────────────────────
STYLE_PRESETS = {
    "atmospheric": (
        "Stylized cinematic atmospheric illustration, no people, no real roofs, "
        "abstract Wasatch Mountain backdrop, dramatic Utah sky, muted navy + gold "
        "tones matching brand palette (#0B4060 navy, #E1B969 gold). "
        "Editorial-grade illustration that clearly reads as artwork, not a photograph. "
        "Wide aspect ratio, suitable for blog hero. NO text overlays, NO logos."
    ),
    "materials": (
        "Stylized macro illustration of generic roofing materials (asphalt shingle "
        "texture, ridge cap detail, or flashing cross-section). Editorial product-context "
        "framing, NOT a photograph of an actual installation. Clean studio backdrop, "
        "shallow depth of field. Navy + gold accent. NO branding."
    ),
    "drone": (
        "Stylized aerial illustration of generic Utah residential neighborhood from "
        "drone perspective. Mountain backdrop, no specific recognizable address or property. "
        "Editorial illustration style — clearly NOT photographic. Soft golden-hour light. "
        "Wide aspect ratio. NO street names, NO house numbers, NO logos."
    ),
    "storm": (
        "Stylized atmospheric illustration of an approaching mountain storm system "
        "over the Wasatch Front. Dramatic clouds, no specific buildings or roofs in focus. "
        "Editorial illustration — clearly artwork, not a photograph. Navy + slate palette. "
        "NO text, NO logos."
    ),
}

# ── Ollama ──────────────────────────────────────────────────────────
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:8b")
MIN_DRAFT_WORDS = int(os.environ.get("FRAME_BLOG_MIN_WORDS", "1150"))
OLLAMA_FORMAT = os.environ.get("FRAME_BLOG_OLLAMA_FORMAT", "json")
BRAND_SUFFIX_RE = re.compile(r"\s*(?:\||-|–|—)\s*Frame (?:Roofing|Restoration) Utah\s*$", re.I)
FORBIDDEN_DRAFT_PATTERNS = [
    ("old call number", re.compile(r"435[-\s]?302[-\s]?4422|\+?1?4353024422")),
    ("Texas brand leak", re.compile(r"\b(?:Texas|Frisco|Dallas|Frame Restoration TX|framerestorations\.com)\b", re.I)),
    ("unverified certification", re.compile(r"\b(?:NRCA|GAF Master Elite|Owens Corning Preferred|OC Preferred|certified inspectors?|certified inspection|certified assessment)\b", re.I)),
    ("invented license number", re.compile(r"\b(?:license|lic\.?|DOPL)\s*(?:#|no\.?|number)\s*(?!14256097-5501\b)[A-Z0-9-]+", re.I)),
    ("invented customer count", re.compile(r"\b(?:helped|served|completed|installed|repaired)\s+(?:over\s+)?\d[\d,]*\s+(?:Utah\s+)?(?:families|homeowners|customers|jobs|projects|roofs)\b", re.I)),
    ("unverified recommendation claim", re.compile(r"\b(?:insurance agents?\s+routinely\s+recommend|preferred choice|go-to provider|longest in the region)\b", re.I)),
    ("invented age claim", re.compile(r"\b(?:over|more than)?\s*\d+\+?\s+years(?:\s+of)?\s+experience\b|\bdecades of experience\b", re.I)),
]
REVIEW_WARNING_PATTERNS = [
    ("unverified financing terms", re.compile(r"\b(?:0%\s*APR|zero percent|\d+(?:\.\d+)?%\s*APR|rates?\s+as\s+low\s+as|low[-\s]?interest|low\s+rates?|\$0[-\s]?down|terms?\s+up\s+to\s+\d+\s+(?:months?|years?)|monthly payments?\s+from)\b", re.I)),
    ("unverified cost range", re.compile(r"\$\d{1,3}(?:,\d{3})+(?:\s*(?:to|-|–)\s*\$\d{1,3}(?:,\d{3})+)?", re.I)),
    ("invented response time", re.compile(r"\b(?:within|in)\s+\d+\s*(?:minutes?|mins?)\b|\b\d+\s*[- ]?minute\s+response\b", re.I)),
    ("unsupported exact local metric", re.compile(r"\b\d[\d,]*\s*(?:mph|pounds per square foot|psf|inches annually|feet elevation|foot elevation|ft elevation)\b|\b\d[\d,]*[-\s]?(?:foot|ft)\s+elevation\b", re.I)),
]


class DraftParseError(ValueError):
    """Raised when the local model returns malformed or truncated JSON."""


def call_ollama(prompt: str, model: str = DEFAULT_MODEL, num_predict: int = 6000,
                timeout: int = 900) -> str:
    """Call local Ollama. qwen3 needs ~400 tokens for thinking; budget generously.

    Default timeout 900s (15 min) — when running concurrent drafts on the same
    model, Ollama queues by default (OLLAMA_NUM_PARALLEL=1) so the 2nd request
    waits for the 1st to finish PLUS its own inference. The earlier 300s default
    was tripping concurrent calls (CH + Murray drafts on 2026-05-09 — Murray
    timed out after CH consumed ~2 min). Set OLLAMA_NUM_PARALLEL=2+ in the
    Ollama daemon env to allow same-model concurrent inference.
    """
    payload_dict = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": num_predict, "temperature": 0.25},
    }
    if OLLAMA_FORMAT and OLLAMA_FORMAT.lower() not in {"0", "false", "none", "off"}:
        payload_dict["format"] = OLLAMA_FORMAT
    payload = json.dumps(payload_dict).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return (data.get("response") or "").strip()
    except urllib.error.URLError as e:
        sys.exit(f"ERROR: Ollama unreachable at {OLLAMA_URL} — is `ollama serve` running? ({e})")


def extract_json(text: str) -> dict:
    """Best-effort JSON extraction (handles markdown fences + leading prose)."""
    try:
        return json.loads(text)
    except json.JSONDecodeError as first_error:
        cleaned = re.sub(r"^```(?:json)?\s*\n?", "", text).rstrip("` \n")
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as cleaned_error:
            start, end = text.find("{"), text.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    return json.loads(text[start:end])
                except json.JSONDecodeError as sliced_error:
                    msg = str(sliced_error)
            else:
                msg = str(cleaned_error or first_error)
            snippet = text[:500].replace("\n", "\\n")
            raise DraftParseError(f"{msg}; output starts: {snippet}")


def normalize_manifest(manifest: dict, fallback_title: str) -> dict:
    """Normalize model output before validation/rendering."""
    title = str(manifest.get("title") or fallback_title).strip()
    manifest["title"] = BRAND_SUFFIX_RE.sub("", title).strip() or fallback_title
    manifest["slug"] = slugify(str(manifest.get("slug") or manifest["title"]))
    manifest["sections"] = normalize_sections(manifest.get("sections", []))
    manifest["sources"] = normalize_sources(manifest.get("sources", []))
    return manifest


def normalize_sources(sources: object) -> list[dict]:
    """Keep model-provided sources when valid, then top up from safe defaults."""
    normalized: list[dict] = []
    seen: set[str] = set()

    if isinstance(sources, list):
        for source in sources:
            if not isinstance(source, dict):
                continue
            label = str(source.get("label") or "").strip()
            url = str(source.get("url") or "").strip()
            if not label or not url.startswith("https://"):
                continue
            key = url.rstrip("/").lower()
            if key in seen:
                continue
            normalized.append({"label": label, "url": url})
            seen.add(key)

    for source in DEFAULT_AUTHORITATIVE_SOURCES:
        if len(normalized) >= 3:
            break
        key = source["url"].rstrip("/").lower()
        if key not in seen:
            normalized.append(source)
            seen.add(key)

    return normalized[:5]


def normalize_sections(sections: object) -> list[dict]:
    """Flatten common model deviations into the renderer's h2/p section stream."""
    flat: list[dict] = []
    if not isinstance(sections, list):
        return flat

    for section in sections:
        if not isinstance(section, dict):
            continue

        raw_type = str(section.get("type") or "").strip().lower()
        text = str(section.get("text") or section.get("heading") or "").strip()
        if raw_type in {"h2", "heading"} and text:
            flat.append({"type": "h2", "text": text})
            for paragraph in section.get("paragraphs") or []:
                paragraph_text = str(paragraph).strip()
                if paragraph_text:
                    flat.append({"type": "p", "text": paragraph_text})
            continue

        if raw_type in {"p", "paragraph"} and text:
            flat.append({"type": "p", "text": text})

    return flat


def manifest_text(manifest: dict) -> str:
    parts = [
        str(manifest.get("title", "")),
        str(manifest.get("excerpt", "")),
        str(manifest.get("tldr", "")),
    ]
    for sec in normalize_sections(manifest.get("sections", [])):
        if isinstance(sec, dict):
            parts.append(str(sec.get("text", "")))
    for faq in manifest.get("faqs", []):
        if isinstance(faq, dict):
            parts.append(str(faq.get("q", "")))
            parts.append(str(faq.get("a", "")))
    howto = manifest.get("howto") or {}
    parts.append(str(howto.get("name", "")))
    for step in howto.get("steps", []):
        if isinstance(step, dict):
            parts.append(str(step.get("name", "")))
            parts.append(str(step.get("text", "")))
    return "\n".join(parts)


def word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text))


def validate_manifest(manifest: dict, min_words: int = MIN_DRAFT_WORDS) -> list[str]:
    """Reject thin or unsafe drafts before they enter the publishing queue."""
    errors: list[str] = []
    text = manifest_text(manifest)
    words = word_count(text)
    sections = normalize_sections(manifest.get("sections", []))
    h2_count = sum(1 for sec in sections if sec.get("type") == "h2")
    paragraph_count = sum(1 for sec in sections if sec.get("type") == "p")
    faq_count = len(manifest.get("faqs", []))
    howto_steps = len((manifest.get("howto") or {}).get("steps", []))
    source_count = len(manifest.get("sources", []))

    if words < min_words:
        errors.append(f"word count {words} below minimum {min_words}")
    if h2_count < 5:
        errors.append(f"H2 section count {h2_count} below minimum 5")
    if paragraph_count < 6:
        errors.append(f"paragraph count {paragraph_count} below minimum 6")
    if faq_count < 4:
        errors.append(f"FAQ count {faq_count} below minimum 4")
    if howto_steps < 5:
        errors.append(f"HowTo step count {howto_steps} below minimum 5")
    if source_count < 3:
        errors.append(f"source count {source_count} below minimum 3")
    if BRAND_SUFFIX_RE.search(str(manifest.get("title", ""))):
        errors.append("title still contains brand suffix")
    for label, pattern in FORBIDDEN_DRAFT_PATTERNS:
        if pattern.search(text):
            errors.append(f"forbidden content: {label}")
    return errors


def review_warnings(manifest: dict) -> list[str]:
    """Warnings that should keep generated copy in human-review status."""
    text = manifest_text(manifest)
    warnings: list[str] = []
    for label, pattern in REVIEW_WARNING_PATTERNS:
        if pattern.search(text):
            warnings.append(f"review content: {label}")
    return warnings


def retry_prompt(base_prompt: str, errors: list[str]) -> str:
    guidance = []
    for error in errors:
        if "Texas brand leak" in error:
            guidance.append("- Keep the copy entirely Utah-scoped; do not mention out-of-state locations, brands, domains, or sister operations.")
        elif "unverified certification" in error:
            guidance.append("- Use only these trust claims: licensed, insured, BBB Accredited (A+), 10-year workmanship warranty. Do not use certified/certification language.")
        elif "old call number" in error:
            guidance.append("- Use only 435-292-8802 as the phone number.")
        elif "invented license number" in error:
            guidance.append("- Do not include any license number or DOPL number in generated body copy.")
        elif "invented customer count" in error:
            guidance.append("- Do not include job counts, customer counts, project counts, or 'served X homeowners' claims.")
        elif "unverified recommendation claim" in error:
            guidance.append("- Avoid ranking, recommendation, preferred-provider, or 'go-to' claims.")
        elif "invented age claim" in error:
            guidance.append("- Do not state years in business, company age, founding date, or experience duration.")
        else:
            guidance.append(f"- Fix quality issue: {error}")
    bullets = "\n".join(dict.fromkeys(guidance))
    return f"""{base_prompt}

The previous JSON failed {BUSINESS_NAME}'s quality gate:
{bullets}

Rewrite the complete JSON from scratch. Hard minimums:
- 1,200-1,800 words across tldr, paragraphs, FAQs, and HowTo text.
- 5-7 H2 sections.
- At least 6 paragraph sections, each specific to the target city.
- 4 FAQs, each 50-90 words.
- 5-7 HowTo steps.
- Do not put "| {BUSINESS_NAME}" or any brand suffix in the title.
- Use only 435-292-8802 as the phone number.
- Do not include license numbers, customer/job counts, exact cost ranges, financing APR/rate/down-payment/term claims, exact minute response-time claims, or unsupported certification language.
- If financing must be mentioned, use only this neutral phrasing: "Financing may be available; ask during your free inspection for current options." Do not add rates, terms, lender names, down-payment copy, or "low-interest" language.

Respond with ONLY valid JSON using the exact structure requested above.
"""


def json_retry_prompt(base_prompt: str, parse_error: str) -> str:
    """Retry prompt for malformed/truncated JSON from local models."""
    return f"""{base_prompt}

The previous response was rejected because it was malformed or truncated JSON:
{parse_error}

Rewrite from scratch with a SMALLER, STRICT JSON response:
- Exactly 5 H2 sections.
- Exactly 6 paragraph objects total.
- 4 FAQs, each 50-75 words.
- 5 HowTo steps.
- 1,150-1,350 total words across tldr, paragraph, FAQ, and HowTo text.
- Keep every string on-topic and avoid unusually long sentences.
- Escape quotation marks inside strings.
- Do not include markdown fences, commentary, analysis, or trailing text.
- Do not stop before the closing JSON brace.

Respond with ONLY one valid JSON object using the exact structure requested above.
"""


# ── Prompt builder ──────────────────────────────────────────────────
def build_prompt(keyword: str, city_slug: str, style: str, event_context: str = "", event_source_url: str = "") -> str:
    city_label = "Utah" if city_slug == "utah" else city_slug.replace("-", " ").title()
    today_iso = date.today().isoformat()
    paths = "\n".join(f"  {p}" for p in VALID_INTERNAL_PATHS)
    current_context = ""
    if event_context.strip():
        current_context = f"""
CURRENT WEATHER / CITY CONTEXT:
{event_context.strip()}
Source: {event_source_url.strip() or "National Weather Service"}

Use this only as a timely homeowner-education hook. Do not state that damage occurred, do not imply Frame inspected a specific property, and do not add exact weather measurements unless they are directly attributed to the source.
"""
    return f"""You are an SEO + AEO content writer for {BUSINESS_NAME}, a Utah roofing contractor based in Heber City. The owner is {AUTHOR_NAME}.

Write a blog post targeting the keyword: "{keyword}"
Target city/region: {city_label}
Today's date: {today_iso}
{current_context}

HARD RULES (do not violate):
1. {BUSINESS_NAME} is licensed + insured + BBB Accredited (A+) since 2026-04-07. Do not add trade-association, manufacturer, installer, inspector, or other certification claims.
2. Confirmed claims you MAY use: Licensed & Insured in Utah, Free Roof Inspections, 24/7 Storm Response, Financing Available, 10-Year Workmanship Warranty, BBB Accredited (A+).
3. NEVER invent company age, years in business, founding date, number of jobs completed, or "over X years of experience". {BUSINESS_NAME}'s age is NOT public — do not estimate or fabricate it.
4. {BUSINESS_NAME} is the Utah public brand only. Do not mention parent brands, sister companies, out-of-state locations, out-of-state operations, or external company domains.
5. Phone CTA = {PHONE_CALL}. This is the only public phone number for {BUSINESS_NAME}.
6. Do not include license numbers, customer/job counts, exact cost ranges, exact weather/elevation measurements, financing APR/rate/down-payment/term claims, exact minute response-time claims, or words like "certified" and "certification." Use only the confirmed claims above.
7. If financing must be mentioned, use only this neutral phrasing: "Financing may be available; ask during your free inspection for current options." Do not add rates, terms, lender names, down-payment copy, or "low-interest" language.
8. The hero image will be a stylized AI illustration — NOT a real Frame customer's roof. Write copy that does not imply the hero photo depicts an actual job.
9. No "as an AI" preambles. No filler ("In today's world...", "Let's dive in!"). Lead with substance.

SEO + AEO RULES:
- Title: include the keyword, under 60 characters. Do NOT append "| {BUSINESS_NAME}" — the renderer adds that.
- Excerpt: 150-200 chars meta description with the keyword in the first half.
- Word count: 1,200-1,800 words across all paragraph sections combined. Each H2 section MUST be 200-300 words. This is non-negotiable — short sections fail AEO citation depth checks.
- Structure: 5-7 H2 sections. Never H1.
- Sections JSON: use a flat array only. Every heading object is {{"type":"h2","text":"..."}} and every paragraph object is {{"type":"p","text":"..."}}. Do not use nested "paragraphs" arrays.
- TL;DR / Quick Answer: a 60-90 word direct answer at the very top — count the words. This is the highest-value AEO citation surface; if it's under 60 words you have failed the brief. Lead with the SPECIFIC ANSWER (numbers, timeframes, neighborhoods), not a restatement of the excerpt.
- Internal links: 3+ links using {{{{link:/path|anchor}}}} syntax. Valid paths:
{paths}
- FAQs: write 4 schema-ready FAQ pairs that AI engines can extract. Questions should be the actual phrasing a homeowner would type or ask aloud.
- HowTo: 5-7 steps, each with a short name + 1-2 sentence text.
- Local signals: mention {city_label} weather (snow load, freeze-thaw, wind corridor as appropriate), elevation if relevant, and at least one specific neighborhood or landmark when {city_slug} != utah.
- Sources: cite 3-5 authoritative external sources at the end (NWS, IRC R905, Utah DOPL, Utah Insurance Department, manufacturer specs). Never fabricate URLs — use root domains.

VOICE: knowledgeable Utah roofer. Calm, specific, no hype. Numbers + specifics over adjectives.

IMAGE PROMPT: also draft a Higgsfield prompt for the hero illustration. Style preset: "{style}". Reference: {STYLE_PRESETS[style]}
The image is decorative atmosphere, NOT evidence. Do not describe a specific roof, house, or address.

Respond with ONLY valid JSON (no markdown fences, no commentary). EXACT structure:
{{
  "title": "...",
  "slug": "url-friendly-slug",
  "excerpt": "150-200 char meta description...",
  "category": "PICK EXACTLY ONE: Storm Response | Roofing Materials | Insurance Claims | Maintenance | Local Spotlight",
  "tldr": "60-90 word direct answer paragraph...",
  "sections": [
    {{"type": "h2", "text": "Section heading"}},
    {{"type": "p", "text": "Paragraph with {{{{link:/path|anchor text}}}} embedded..."}}
  ],
  "faqs": [
    {{"q": "Question phrasing a homeowner uses?", "a": "Answer (50-90 words)..."}}
  ],
  "howto": {{
    "name": "How to ...",
    "total_time": "PT20M",
    "steps": [
      {{"name": "Short step name", "text": "1-2 sentence description"}}
    ]
  }},
  "sources": [
    {{"label": "Display name", "url": "https://example.com/"}}
  ],
  "image_prompt": "Higgsfield prompt — stylized illustration, no real roofs, ...",
  "image_alt": "Stylized illustration of [brief] for editorial use",
  "image_caption": "Illustration — not a photograph of a Frame Roofing project"
}}
"""


# ── HTML renderer ───────────────────────────────────────────────────
def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9-]+", "-", text.lower()).strip("-")
    return re.sub(r"-{2,}", "-", s)


def linkify(text: str) -> str:
    """Convert {{link:/path|anchor}} → <a href="/path">anchor</a>."""
    pattern = re.compile(r"\{\{link:(/[^|]+)\|([^}]+)\}\}")

    def repl(m):
        path, anchor = m.group(1), m.group(2)
        if path not in VALID_INTERNAL_PATHS:
            return anchor  # silently drop invalid links rather than ship 404 anchors
        return f'<a href="{path}">{anchor}</a>'

    return pattern.sub(repl, text)


def render_html(manifest: dict, image_url: Optional[str], image_local_path: Optional[str]) -> str:
    """Render final HTML matching Frame's existing blog template."""
    today = date.today().isoformat()
    today_pretty = date.today().strftime("%B %-d, %Y")
    slug = manifest["slug"]
    city_slug = manifest.get("city_slug", "utah")
    city_label = "Utah" if city_slug == "utah" else city_slug.replace("-", " ").title()
    canonical = f"{SITE}/blog/{city_slug}/{slug}"
    organization_schema = {
        "@type": ["LocalBusiness", "RoofingContractor"],
        "@id": ORGANIZATION_ID,
        "name": BUSINESS_NAME,
        "legalName": LEGAL_NAME,
        "url": SITE,
        "telephone": PHONE_TEL,
        "address": {
            "@type": "PostalAddress",
            "streetAddress": PUBLIC_ADDRESS["street"],
            "addressLocality": PUBLIC_ADDRESS["locality"],
            "addressRegion": PUBLIC_ADDRESS["region"],
            "postalCode": PUBLIC_ADDRESS["postal_code"],
            "addressCountry": PUBLIC_ADDRESS["country"],
        },
        "hasMap": ENTITY_LINKS.get("hasMap"),
        "sameAs": ENTITY_LINKS.get("sameAs", []),
    }
    organization_schema = {key: value for key, value in organization_schema.items() if value}
    organization_schema_json = json.dumps(organization_schema, ensure_ascii=False)

    # Image source resolution:
    #   --image-url + --image-local → AI illustration (Higgsfield); ImageObject schema
    #   --image-local only          → real photo override; Photograph-style schema
    #   neither                     → fallback to Heber drone poster (least specific, last resort)
    if image_url and image_local_path:
        og_image = f"{SITE}{image_local_path}"
        img_src = image_local_path
        is_ai = True
    elif image_local_path:
        og_image = f"{SITE}{image_local_path}"
        img_src = image_local_path
        is_ai = False
    elif image_url:
        og_image = image_url
        img_src = image_url
        is_ai = True
    else:
        og_image = f"{SITE}/images/projects/heber-valley-drone-poster.webp"
        img_src = "/images/projects/heber-valley-drone-poster.webp"
        is_ai = False

    # Image schema block — divergent based on AI vs real photo.
    if is_ai:
        image_schema_block = f""",
      "image": {{
        "@type": "ImageObject",
        "contentUrl": "{og_image}",
        "creator": {{"@type": "Organization", "name": "{BUSINESS_NAME}"}},
        "creditText": "Illustration by {BUSINESS_NAME}",
        "disambiguatingDescription": "Stylized digital illustration generated for editorial use. Not a photograph of an actual Frame Roofing project.",
        "license": "{SITE}/terms"
      }}"""
        image_alt = manifest.get("image_alt", "Stylized illustration for editorial use")
        image_caption = manifest.get("image_caption", "Illustration — not a photograph of a Frame Roofing project")
    else:
        image_schema_block = f""",
      "image": "{og_image}" """
        # Derive alt text from image filename + post context for real photos
        if image_local_path:
            stem = Path(image_local_path).stem
            stem = re.sub(r"-\d{4}$", "", stem)  # strip -YYYY suffix
            descriptor = stem.replace("-", " ").title()
            image_alt = f"{descriptor} — {BUSINESS_NAME}"
        else:
            image_alt = f"{BUSINESS_NAME} — Wasatch Front roofing project"
        image_caption = ""

    # FAQ JSON-LD
    faq_entities = ",\n          ".join(
        json.dumps({
            "@type": "Question",
            "name": f["q"],
            "acceptedAnswer": {"@type": "Answer", "text": f["a"]}
        }, ensure_ascii=False)
        for f in manifest.get("faqs", [])
    )

    # HowTo JSON-LD
    howto = manifest.get("howto") or {}
    howto_steps = ",\n          ".join(
        json.dumps({"@type": "HowToStep", "name": s["name"], "text": s["text"]}, ensure_ascii=False)
        for s in howto.get("steps", [])
    )

    # Body HTML
    body_parts = []
    if manifest.get("tldr"):
        body_parts.append(
            f'<div class="tldr-box"><p><strong>QUICK ANSWER:</strong> {linkify(manifest["tldr"])}</p></div>'
        )
    for sec in manifest.get("sections", []):
        if sec["type"] == "h2":
            body_parts.append(f'<h2>{sec["text"]}</h2>')
        elif sec["type"] == "h3":
            body_parts.append(f'<h3>{sec["text"]}</h3>')
        elif sec["type"] == "p":
            body_parts.append(f'<p>{linkify(sec["text"])}</p>')
        elif sec["type"] == "blockquote":
            quote = html.escape(sec.get("text", ""))
            source_url = html.escape(sec.get("source_url", ""), quote=True)
            source_label = html.escape(sec.get("source_label", "Source"))
            body_parts.append(
                f'<blockquote><p>“{quote}”</p>'
                f'<cite>— <a href="{source_url}" target="_blank" rel="noopener">{source_label}</a></cite></blockquote>'
            )
        elif sec["type"] == "checklist":
            num = sec.get("num", "01")
            body_parts.append(
                f'<div class="checklist-card"><h3><span class="checklist-num">{num}</span>{sec.get("title","")}</h3>'
                f'<p>{linkify(sec.get("text",""))}</p></div>'
            )

    # Visible FAQ block (matches schema for AEO citation surface)
    if manifest.get("faqs"):
        faq_html = '<h2>Frequently Asked Questions</h2>\n<div class="faq-block">\n'
        for f in manifest["faqs"]:
            faq_html += f'  <details><summary>{f["q"]}</summary><p>{linkify(f["a"])}</p></details>\n'
        faq_html += '</div>'
        body_parts.append(faq_html)

    # Sources
    if manifest.get("sources"):
        body_parts.append('<h2>Sources &amp; References</h2>\n<ul>')
        for s in manifest["sources"]:
            body_parts.append(f'  <li><a href="{s["url"]}" target="_blank" rel="noopener">{s["label"]}</a></li>')
        body_parts.append('</ul>')

    body_html = "\n  ".join(body_parts)

    # Final CTA paragraph — phone uses CALL number, never SMS-only.
    cta_para = (
        f'<p>{BUSINESS_NAME} serves homeowners across the Wasatch Front and Heber Valley with '
        f'free post-storm and pre-purchase inspections. Call <a href="tel:{PHONE_TEL}">{PHONE_CALL}</a> '
        f'or <a href="{SCHEDULE_URL}" target="_blank" rel="noopener">schedule online</a>. '
        f'Every repair is backed by our 10-year workmanship warranty.</p>'
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{manifest["title"]} | {BUSINESS_NAME}</title>
  <meta name="description" content="{manifest["excerpt"]}" />
  <meta name="geo.region" content="US-UT" />
  <meta name="geo.placename" content="{city_label}, Utah" />
  <link rel="canonical" href="{canonical}" />
  <meta property="og:title" content="{manifest["title"]}" />
  <meta property="og:description" content="{manifest["excerpt"]}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:image" content="{og_image}" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:site_name" content="{BUSINESS_NAME}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="{og_image}" />
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
  <meta name="theme-color" content="#0B4060" />
  <link rel="icon" href="/favicon.ico" sizes="32x32" />
  <script type="application/ld+json">
  {{
  "@context": "https://schema.org",
  "@graph": [
    {{
      "@type": "BlogPosting",
      "headline": {json.dumps(manifest["title"])},
      "description": {json.dumps(manifest["excerpt"])},
      "url": "{canonical}",
      "datePublished": "{today}",
      "dateModified": "{today}",
      "author": {{
        "@type": "Person",
        "@id": "{AUTHOR_ID}",
        "name": "{AUTHOR_NAME}",
        "jobTitle": "{AUTHOR_TITLE}",
        "url": "{SITE}/pages/about",
        "worksFor": {{"@id": "{ORGANIZATION_ID}"}}
      }},
      "publisher": {{"@id": "{ORGANIZATION_ID}"}},
      "mainEntityOfPage": "{canonical}",
      "digitalSourceType": "https://cv.iptc.org/newscodes/digitalsourcetype/{'compositeSynthetic' if is_ai else 'humanWritten'}"{image_schema_block}
    }},
    {organization_schema_json},
    {{
      "@type": "FAQPage",
      "mainEntity": [
          {faq_entities}
      ]
    }}{',' if howto_steps else ''}
    {(
      '{"@type":"HowTo","name":' + json.dumps(howto.get("name", "")) +
      ',"totalTime":' + json.dumps(howto.get("total_time", "PT20M")) +
      ',"step":[' + howto_steps + ']}'
    ) if howto_steps else ''}
  ]
  }}
  </script>
  <link rel="stylesheet" href="/global.css?v={SHARED_ASSET_VERSIONS['global.css']}">
  <script src="/global-modal.js?v={SHARED_ASSET_VERSIONS['global-modal.js']}" defer></script>
  <style>
    .blog-hero {{ min-height: 40vh; position: relative; display: flex; align-items: center; background: var(--navy); padding-top: 70px; }}
    .blog-hero-overlay {{ position: absolute; inset: 0; background: linear-gradient(135deg, rgba(11,64,96,0.96) 40%, rgba(11,64,96,0.8)); }}
    .blog-hero-content {{ position: relative; z-index: 2; padding: 80px 5% 60px; max-width: 800px; }}
    .blog-hero h1 {{ font-family: 'Archivo Black', sans-serif; font-size: clamp(30px, 4.5vw, 52px); color: var(--white); line-height: 1.1; text-transform: uppercase; margin-bottom: 16px; }}
    .blog-hero h1 span {{ color: var(--gold); }}
    .blog-hero .blog-meta {{ font-size: 14px; color: rgba(255,255,255,0.55); margin-bottom: 12px; }}
    .blog-body {{ max-width: 780px; margin: 0 auto; padding: 60px 5% 40px; }}
    .blog-body h2 {{ font-family: 'Archivo Black', sans-serif; font-size: 24px; color: var(--navy); text-transform: uppercase; margin: 48px 0 16px; line-height: 1.2; }}
    .blog-body h3 {{ font-family: 'Archivo Black', sans-serif; font-size: 19px; color: var(--navy); margin: 32px 0 12px; }}
    .blog-body p {{ font-size: 16px; color: var(--gray); line-height: 1.85; margin-bottom: 18px; }}
    .blog-body ul, .blog-body ol {{ margin: 16px 0 24px 28px; }}
    .blog-body li {{ font-size: 16px; color: var(--gray); line-height: 1.85; margin-bottom: 8px; }}
    .blog-body strong {{ color: var(--dark); }}
    .blog-body blockquote {{ background:#f4f8fb; border-left:4px solid var(--gold); margin:24px 0; padding:18px 22px; }}
    .blog-body blockquote p {{ color:var(--dark); font-size:17px; margin:0 0 8px; }}
    .blog-body blockquote cite {{ color:#4a5464; font-size:14px; }}
    .blog-body blockquote cite a {{ color:var(--navy); font-weight:700; }}
    .article-byline {{ background:#fff; border:1px solid #d7e0e7; border-left:4px solid var(--gold); border-radius:4px; color:#4a5464; font-size:14px; line-height:1.6; margin:0 0 24px; padding:12px 16px; }}
    .article-byline a {{ color:var(--navy); font-weight:700; }}
    .tldr-box {{ background: #f4f8fb; border-left: 5px solid var(--gold); padding: 20px 24px; margin: 24px 0 40px; border-radius: 4px; }}
    .tldr-box p {{ margin: 0; font-size: 15px; color: var(--dark); line-height: 1.7; }}
    .tldr-box strong {{ color: var(--navy); letter-spacing: 0.5px; }}
    .checklist-card {{ background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid var(--gold); border-radius: 6px; padding: 20px 24px; margin: 24px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }}
    .checklist-card h3 {{ margin-top: 0 !important; }}
    .checklist-num {{ display: inline-block; background: var(--navy); color: var(--gold); font-family: 'Archivo Black', sans-serif; font-size: 13px; padding: 4px 10px; border-radius: 3px; margin-right: 10px; vertical-align: middle; }}
    .faq-block details {{ background: #f4f8fb; border-left: 4px solid var(--gold); padding: 14px 20px; margin: 12px 0; border-radius: 4px; }}
    .faq-block summary {{ font-family: 'Archivo Black', sans-serif; color: var(--navy); cursor: pointer; }}
    .blog-cta {{ background: var(--gold); padding: 60px 5%; text-align: center; }}
    .blog-cta h2 {{ font-family: 'Archivo Black', sans-serif; font-size: clamp(26px, 3.5vw, 42px); color: var(--navy); text-transform: uppercase; margin-bottom: 14px; }}
    .blog-cta p {{ font-size: 18px; color: rgba(11,64,96,0.7); margin-bottom: 28px; }}
    .image-credit {{ font-size: 12px; color: rgba(0,0,0,0.5); text-align: right; margin-top: 4px; font-style: italic; }}
    @media (max-width:900px) {{
      nav {{ height:76px; }}
      .nav-logo img {{ height:64px; max-width:210px; }}
    }}
  </style>
  <script>
    !function(t,e){{var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){{function g(t,e){{var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){{t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){{var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}},u.people.toString=function(){{return u.toString(1)+".people (stub)"}},o="init capture register".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])}},e.__SV=1)}}(document,window.posthog||[]);
    posthog.init('{POSTHOG_KEY}',{{api_host:'https://us.i.posthog.com', person_profiles: 'identified_only', disable_surveys: true}})
  </script>
</head>
<body>
<nav>
  <a href="/" class="nav-logo" aria-label="{BUSINESS_NAME} - Home">
    <img loading="eager" src="/images/logo-rc-darkblue.webp" alt="{BUSINESS_NAME}" width="180" height="50" />
  </a>
  <ul class="nav-links" id="navLinks">
    <li><a href="/#services">Services</a></li>
    <li><a href="/blog">Blog</a></li>
    <li><a href="/pages/gallery">Projects</a></li>
    <li><a href="/pages/about">About</a></li>
    <li><a href="/#areas">Service Areas</a></li>
    <li><a href="/#faq">FAQ</a></li>
    <li><a href="/#contact">Contact</a></li>
    <li><a href="tel:{PHONE_TEL}" class="nav-phone">{PHONE_CALL}</a></li>
    <li><a href="{SCHEDULE_URL}" target="_blank" rel="noopener" class="nav-cta">Free Inspection</a></li>
  </ul>
  <a href="tel:{PHONE_TEL}" class="nav-call-mobile" data-cta="header-call" aria-label="Call {BUSINESS_NAME} at {PHONE_CALL}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.03 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg></a>
  <button class="mobile-btn" id="menuBtn" aria-label="Toggle navigation"><span></span><span></span><span></span></button>
</nav>

<main>
<header class="blog-hero">
  <div class="blog-hero-overlay"></div>
  <div class="blog-hero-content">
    <div class="breadcrumb"><a href="/">Home</a> &rsaquo; <a href="/blog">Blog</a> &rsaquo; {manifest["title"]}</div>
    <div class="blog-meta">{today_pretty} &bull; {manifest.get("category", "Roofing Tips")}</div>
    <h1>{manifest["title"]}</h1>
    <p class="last-updated" style="color:rgba(255,255,255,0.82);font-size:0.875rem;margin:-0.5rem 0 1.25rem 0;"><time datetime="{today}">Last updated: {today_pretty}</time></p>
  </div>
</header>

<article class="blog-body">
  <p class="article-byline" aria-label="Article author and publisher">Written and reviewed by <a href="/pages/about">{AUTHOR_NAME}</a>, {AUTHOR_TITLE} of <a href="/">{BUSINESS_NAME}</a>. Published under {LEGAL_NAME}; Utah DOPL contractor #14256097-5501.</p>
  <figure class="blog-featured-image" style="margin:0 0 32px;border-radius:4px;overflow:hidden">
    <img src="{img_src}" alt="{image_alt}" width="780" height="440" style="width:100%;height:auto;display:block;object-fit:cover;max-height:400px" loading="eager" fetchpriority="high" />
    {f'<figcaption class="image-credit">{image_caption}</figcaption>' if image_caption else ''}
  </figure>

  {body_html}

  {cta_para}
</article>

<section class="blog-cta">
  <h2>Free Inspection. No Pressure.</h2>
  <p>Licensed Utah roofers. BBB Accredited (A+). 10-year workmanship warranty.</p>
  <a href="tel:{PHONE_TEL}" class="btn btn-primary">Call {PHONE_CALL}</a>
  <a href="{SCHEDULE_URL}" target="_blank" rel="noopener" class="btn btn-secondary" style="margin-left:12px">Book Online</a>
</section>
</main>

<footer style="background:var(--navy);color:#fff;padding:32px 5%;text-align:center;font-size:14px;">
  <p>&copy; {date.today().year} {LEGAL_NAME} (DBA {BUSINESS_NAME}). 142 S Main St, Heber City, UT 84032.</p>
  <p>Call or text: <a href="tel:{PHONE_TEL}" style="color:var(--gold)">{PHONE_CALL}</a></p>
  <p style="margin-top:8px"><a href="/" style="color:rgba(255,255,255,0.7)">Home</a> &bull; <a href="/blog" style="color:rgba(255,255,255,0.7)">Blog</a> &bull; <a href="/privacy" style="color:rgba(255,255,255,0.7)">Privacy</a> &bull; <a href="/terms" style="color:rgba(255,255,255,0.7)">Terms</a> &bull; <a href="/review" style="color:var(--gold)">★ Leave a Review</a></p>
</footer>
</body>
</html>
"""


# ── CLI ─────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--keyword", help="Target SEO keyword")
    parser.add_argument("--city", default="utah", choices=sorted(VALID_CITY_SLUGS),
                        help="City subdir under /blog/ (default: utah)")
    parser.add_argument("--style", default="atmospheric", choices=sorted(STYLE_PRESETS.keys()),
                        help="Higgsfield image style preset")
    parser.add_argument("--ollama-model", default=DEFAULT_MODEL, help="Ollama model")
    parser.add_argument("--event-context", default="", help="Optional current weather/event hook to include in the prompt")
    parser.add_argument("--event-source-url", default="", help="Source URL for --event-context")
    parser.add_argument("--prompt-only", action="store_true", help="Print prompt, don't run Ollama")
    parser.add_argument("--dry-run", action="store_true", help="Don't write files")
    parser.add_argument("--no-hero", action="store_true", help="Use existing fallback image, no Higgsfield needed")
    parser.add_argument("--render", action="store_true", help="Render HTML from existing manifest")
    parser.add_argument("--manifest", help="Path to manifest JSON (for --render)")
    parser.add_argument("--image-url", help="Higgsfield image URL (for --render)")
    parser.add_argument("--image-local", help="Local path under /images/blog/ for og:image (for --render)")
    args = parser.parse_args()

    # ── Render mode: take manifest + image, write final HTML ────────
    if args.render:
        if not args.manifest:
            sys.exit("--render requires --manifest <path>")
        manifest = json.loads(Path(args.manifest).read_text())
        html = render_html(manifest, args.image_url, args.image_local)
        out_path = BLOG_DIR / manifest["city_slug"] / f"{manifest['slug']}.html"
        if args.dry_run:
            print(html)
            print(f"\n[dry-run] would write to {out_path}", file=sys.stderr)
        else:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(html)
            print(f"✓ Wrote {out_path}")
        return

    # ── Draft mode: Ollama → manifest ───────────────────────────────
    if not args.keyword:
        sys.exit("--keyword required (unless --render)")

    prompt = build_prompt(args.keyword, args.city, args.style, args.event_context, args.event_source_url)

    if args.prompt_only:
        print(prompt)
        return

    manifest = None
    errors: list[str] = []
    warnings: list[str] = []
    active_prompt = prompt
    for attempt in range(1, 4):
        suffix = "" if attempt == 1 else " (retry)"
        print(f"⏳ Drafting via Ollama ({args.ollama_model}){suffix}…", file=sys.stderr)
        raw = call_ollama(active_prompt, model=args.ollama_model)
        try:
            candidate = normalize_manifest(extract_json(raw), args.keyword)
        except DraftParseError as exc:
            errors = [f"invalid JSON from Ollama: {exc}"]
            print("⚠ Draft failed JSON parse:", file=sys.stderr)
            print(f"  - {errors[0]}", file=sys.stderr)
            active_prompt = json_retry_prompt(prompt, errors[0])
            continue
        errors = validate_manifest(candidate)
        if not errors:
            manifest = candidate
            warnings = review_warnings(candidate)
            if warnings:
                print("⚠ Draft saved for human review:", file=sys.stderr)
                for warning in warnings:
                    print(f"  - {warning}", file=sys.stderr)
            break
        print("⚠ Draft failed quality gate:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        active_prompt = retry_prompt(prompt, errors)

    if manifest is None:
        sys.exit("ERROR: Ollama draft failed after retries:\n- " + "\n- ".join(errors))

    # Annotate manifest with run metadata
    manifest["city_slug"] = args.city
    manifest["style"] = args.style
    manifest["keyword"] = args.keyword
    manifest["draft_date"] = date.today().isoformat()
    manifest["status"] = "needs-review" if warnings else "drafted"
    if warnings:
        manifest["quality_warnings"] = warnings

    slug = manifest["slug"]

    out_manifest = PENDING_DIR / f"{slug}.json"
    if args.dry_run:
        print(json.dumps(manifest, indent=2, ensure_ascii=False))
        print(f"\n[dry-run] would write manifest to {out_manifest}", file=sys.stderr)
        return

    out_manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"✓ Manifest: {out_manifest}")
    print(f"  Title: {manifest['title']}")
    print(f"  Slug:  {slug}  →  /blog/{args.city}/{slug}")
    print(f"  Image prompt:\n    {manifest.get('image_prompt', '(missing)')}")
    print()
    print("Next: invoke the `frame-blog-publish` Claude skill to call Higgsfield + render HTML,")
    print("or run with --no-hero (uses fallback photo) and:")
    print(f"  python3 {Path(__file__).name} --render --manifest {out_manifest} --image-local /images/projects/heber-valley-drone-poster.webp")


if __name__ == "__main__":
    main()
