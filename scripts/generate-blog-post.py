#!/usr/bin/env python3
"""
Frame Roofing Utah — Blog Post Generator (Higgsfield-aware)

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
  - Phone CTAs use 435-302-4422 (call); never 435-292-8802 (text-only).
  - No invented certifications. BBB A+ is allowed; NRCA / GAF Master Elite are NOT.
  - Brand string is "Frame Roofing Utah" — never "Frame Restoration TX" leak.
"""

from __future__ import annotations
import argparse
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

# ── Frame Roofing Utah constants (mirrors CLAUDE.md) ─────────────────
SITE = "https://www.frameroofingutah.com"
BUSINESS_NAME = "Frame Roofing Utah"
LEGAL_NAME = "Frame Restoration Utah LLC"
PHONE_CALL = "435-302-4422"
PHONE_TEL = "+14353024422"
SCHEDULE_URL = "https://calendar.app.google/cR4bBSWfb9TQ28UF8"
AUTHOR_NAME = "Landon Yokers"
AUTHOR_TITLE = "Owner"
POSTHOG_KEY = "phc_BnECzlZ2OeDujli2dbqcgGODXlv2tYERbp40dTF7UBV"

VALID_CITY_SLUGS = {
    "utah", "heber-city", "park-city", "salt-lake-city", "sandy", "draper",
    "herriman", "lehi", "ogden", "provo", "riverton", "bountiful", "layton",
    "murray", "orem", "west-jordan", "west-valley-city",
}

VALID_INTERNAL_PATHS = [
    "/", "/pages/storm-damage", "/pages/roof-replacement", "/pages/insurance-claims",
    "/pages/residential-roofing", "/pages/commercial-roofing", "/pages/roof-repair",
    "/pages/gutters", "/pages/emergency-tarping", "/pages/about", "/pages/gallery",
    "/blog", "/review",
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


def call_ollama(prompt: str, model: str = DEFAULT_MODEL, num_predict: int = 6000) -> str:
    """Call local Ollama. qwen3 needs ~400 tokens for thinking; budget generously."""
    payload = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": num_predict, "temperature": 0.4},
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return (data.get("response") or "").strip()
    except urllib.error.URLError as e:
        sys.exit(f"ERROR: Ollama unreachable at {OLLAMA_URL} — is `ollama serve` running? ({e})")


def extract_json(text: str) -> dict:
    """Best-effort JSON extraction (handles markdown fences + leading prose)."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        cleaned = re.sub(r"^```(?:json)?\s*\n?", "", text).rstrip("` \n")
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            start, end = text.find("{"), text.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
            sys.exit(f"ERROR: Could not parse JSON from Ollama output:\n{text[:500]}")


# ── Prompt builder ──────────────────────────────────────────────────
def build_prompt(keyword: str, city_slug: str, style: str) -> str:
    city_label = "Utah" if city_slug == "utah" else city_slug.replace("-", " ").title()
    today_iso = date.today().isoformat()
    paths = "\n".join(f"  {p}" for p in VALID_INTERNAL_PATHS)
    return f"""You are an SEO + AEO content writer for {BUSINESS_NAME}, a licensed family-owned roofing contractor based in Heber City, Utah. The owner is {AUTHOR_NAME}.

Write a blog post targeting the keyword: "{keyword}"
Target city/region: {city_label}
Today's date: {today_iso}

HARD RULES (do not violate):
1. Frame Roofing Utah is licensed + insured + BBB Accredited (A+) since 2026-04-07. NEVER claim NRCA member, GAF Master Elite, OC Preferred, or any cert not in this list.
2. Confirmed claims you MAY use: Licensed & Insured in Utah, Free Roof Inspections, 24/7 Storm Response, Financing Available, 10-Year Workmanship Warranty, BBB Accredited (A+).
3. NEVER invent company age, years in business, founding date, number of jobs completed, or "over X years of experience". Frame Roofing Utah's age is NOT public — do not estimate or fabricate it.
4. Frame Roofing Utah is the Utah brand only. NEVER mention Texas, Frisco, Dallas, Frame Restoration (the Texas DBA), or framerestorations.com.
5. Phone CTA = {PHONE_CALL}. Never the SMS-only 435-292-8802.
6. The hero image will be a stylized AI illustration — NOT a real Frame customer's roof. Write copy that does not imply the hero photo depicts an actual job.
7. No "as an AI" preambles. No filler ("In today's world...", "Let's dive in!"). Lead with substance.

SEO + AEO RULES:
- Title: include the keyword, under 60 characters. Do NOT append "| Frame Roofing Utah" — the renderer adds that.
- Excerpt: 150-200 chars meta description with the keyword in the first half.
- Word count: 1,200-1,800 words across all paragraph sections combined. Each H2 section MUST be 200-300 words. This is non-negotiable — short sections fail AEO citation depth checks.
- Structure: 5-7 H2 sections. Never H1.
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

    # Image: AI illustration (decorative) gets ImageObject schema, NEVER Photograph.
    if image_url:
        # Production deploy uses local path; OG/Twitter use absolute URL.
        og_image = f"{SITE}{image_local_path}" if image_local_path else image_url
        img_src = image_local_path or image_url
        is_ai = True
    else:
        # Fallback: existing real-Landon photo from /images/projects/cities/
        og_image = f"{SITE}/images/projects/cities/heber-valley-drone-poster.webp"
        img_src = "/images/projects/cities/heber-valley-drone-poster.webp"
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
        image_alt = "Frame Roofing Utah — Heber Valley aerial"
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
        "name": "{AUTHOR_NAME}",
        "jobTitle": "{AUTHOR_TITLE}",
        "worksFor": {{"@type": "Organization", "name": "{BUSINESS_NAME}", "url": "{SITE}"}}
      }},
      "publisher": {{"@type": "Organization", "name": "{BUSINESS_NAME}", "url": "{SITE}"}},
      "mainEntityOfPage": "{canonical}",
      "digitalSourceType": "https://cv.iptc.org/newscodes/digitalsourcetype/{'compositeSynthetic' if is_ai else 'humanWritten'}"{image_schema_block}
    }},
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
  <link rel="stylesheet" href="/global.css?v={today.replace('-', '')}">
  <script src="/global-modal.js" defer></script>
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
  <p>Call: <a href="tel:{PHONE_TEL}" style="color:var(--gold)">{PHONE_CALL}</a> &bull; Text: <a href="sms:+14352928802" style="color:var(--gold)">435-292-8802</a></p>
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

    prompt = build_prompt(args.keyword, args.city, args.style)

    if args.prompt_only:
        print(prompt)
        return

    print(f"⏳ Drafting via Ollama ({args.ollama_model})…", file=sys.stderr)
    raw = call_ollama(prompt, model=args.ollama_model)
    manifest = extract_json(raw)

    # Annotate manifest with run metadata
    manifest["city_slug"] = args.city
    manifest["style"] = args.style
    manifest["keyword"] = args.keyword
    manifest["draft_date"] = date.today().isoformat()
    manifest["status"] = "drafted"

    # Validate slug + ensure unique on disk
    slug = manifest.get("slug") or slugify(manifest["title"])
    manifest["slug"] = slug

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
    print(f"  python3 {Path(__file__).name} --render --manifest {out_manifest} --image-local /images/projects/cities/heber-valley-drone-poster.webp")


if __name__ == "__main__":
    main()
