#!/usr/bin/env python3
"""
SEO Batch Fix Script for frameroofingutah.com
- Adds canonical tags to all pages
- Fixes phone number in schema (435-302-4422 -> 435-292-8802)
- Adds Open Graph tags to all pages
- Fixes duplicate H1 on homepage
- Fixes "Contact Frame Restoration Utah" -> "Contact Frame Roofing Utah"
- Adds missing meta descriptions to service pages
"""

import os
import re
import glob

BASE_DIR = "/Users/agenticmac/projects/frame-restoration-utah"
DOMAIN = "https://frameroofingutah.com"

# Pages to skip for canonical/OG (utility pages)
SKIP_FILES = {"hero.html", "google-maps-pins.html", "Frame-Roofing-Directory-Cheat-Sheet.html", "Frame-Roofing-SEO-Audit-March2026.html"}

# Meta descriptions for service pages that are missing them
SERVICE_META = {
    "pages/residential-roofing.html": "Premium residential roof replacement across Utah. Free inspections, designer shingles, lifetime warranties. Serving 40+ communities on the Wasatch Front.",
    "pages/commercial-roofing.html": "Commercial roofing for Utah businesses, HOAs, and property managers. Flat roofs, metal roofing, TPO, and EPDM. Licensed, insured, and Utah-focused.",
    "pages/storm-damage-restoration.html": "Utah storm damage roof repair and insurance claim assistance. Hail, wind, and ice damage restoration. Free inspections. We work directly with your adjuster.",
    "pages/water-fire-flood-restoration.html": "Emergency water, fire, and flood restoration in Utah. Rapid response tarping, leak mitigation, and permanent repairs. Available when you need us most.",
    "pages/solar-installation.html": "Solar-ready roofing and solar panel installation in Utah. Maximize energy savings with a roof built for solar from the start.",
    "pages/general-contracting.html": "Licensed general contracting in Utah. Siding, gutters, exterior renovations, and full-service home restoration. Quality craftsmanship, every project.",
}

stats = {
    "canonical_added": 0,
    "og_added": 0,
    "schema_phone_fixed": 0,
    "meta_desc_added": 0,
    "h1_fixed": 0,
    "branding_fixed": 0,
    "files_modified": 0,
}

def get_canonical_path(filepath):
    """Convert file path to canonical URL path."""
    rel = os.path.relpath(filepath, BASE_DIR)
    # index.html -> /
    if rel == "index.html":
        return "/"
    # blog/index.html -> /blog
    if rel == "blog/index.html":
        return "/blog"
    # Remove .html extension
    path = "/" + rel.replace(".html", "")
    return path

def get_og_image(filepath):
    """Return appropriate OG image URL based on page type."""
    return f"{DOMAIN}/images/logo.png"

def process_file(filepath):
    rel = os.path.relpath(filepath, BASE_DIR)
    basename = os.path.basename(filepath)
    
    if basename in SKIP_FILES:
        return
    if basename.endswith(".py"):
        return
    
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    
    original = content
    canonical_path = get_canonical_path(filepath)
    canonical_url = DOMAIN + canonical_path
    
    # === 1. ADD CANONICAL TAG ===
    if '<link rel="canonical"' not in content and "</head>" in content:
        canonical_tag = f'  <link rel="canonical" href="{canonical_url}">\n'
        content = content.replace("</head>", canonical_tag + "</head>", 1)
        stats["canonical_added"] += 1
    
    # === 2. ADD OPEN GRAPH TAGS ===
    if 'property="og:' not in content and "</head>" in content:
        # Extract existing title
        title_match = re.search(r"<title>(.*?)</title>", content)
        og_title = title_match.group(1) if title_match else "Frame Roofing Utah"
        
        # Extract existing meta description
        desc_match = re.search(r'<meta name="description" content="(.*?)"', content)
        og_desc = desc_match.group(1) if desc_match else "Premium roofing and restoration across Utah. Free inspections. Licensed and insured."
        
        og_tags = f'''  <meta property="og:type" content="website">
  <meta property="og:url" content="{canonical_url}">
  <meta property="og:title" content="{og_title}">
  <meta property="og:description" content="{og_desc}">
  <meta property="og:image" content="{DOMAIN}/images/logo.png">
  <meta property="og:site_name" content="Frame Roofing Utah">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{og_title}">
  <meta name="twitter:description" content="{og_desc}">
'''
        content = content.replace("</head>", og_tags + "</head>", 1)
        stats["og_added"] += 1
    
    # === 3. FIX PHONE IN SCHEMA MARKUP ===
    # Only fix inside <script type="application/ld+json"> blocks
    schema_pattern = r'("telephone"\s*:\s*")(\+?1?[-.\s]?435[-.\s]?302[-.\s]?4422")'
    if re.search(schema_pattern, content):
        content = re.sub(schema_pattern, r'\g<1>+14352928802"', content)
        stats["schema_phone_fixed"] += 1
    
    # Also fix contactPoint telephone
    cp_pattern = r'("telephone"\s*:\s*")\+?1?435[-.]?302[-.]?4422"'
    content = re.sub(cp_pattern, r'\g<1>+14352928802"', content)
    
    # === 4. ADD MISSING META DESCRIPTIONS ===
    if rel in SERVICE_META:
        if '<meta name="description"' not in content and "</head>" in content:
            meta_tag = f'  <meta name="description" content="{SERVICE_META[rel]}">\n'
            content = content.replace("</head>", meta_tag + "</head>", 1)
            stats["meta_desc_added"] += 1
    
    # === 5. FIX DUPLICATE H1 ON HOMEPAGE ===
    if rel == "index.html":
        # Change the second H1 to H2
        h1_matches = list(re.finditer(r"<h1(.*?)>(.*?)</h1>", content, re.DOTALL))
        if len(h1_matches) > 1:
            # Replace second H1 with H2
            second = h1_matches[1]
            old = content[second.start():second.end()]
            new = old.replace("<h1", "<h2").replace("</h1>", "</h2>")
            content = content[:second.start()] + new + content[second.end():]
            stats["h1_fixed"] += 1
    
    # === 6. FIX FOOTER BRANDING ===
    if "Contact Frame Restoration Utah" in content:
        content = content.replace("Contact Frame Restoration Utah", "Contact Frame Roofing Utah")
        stats["branding_fixed"] += 1
    
    # Write back if changed
    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        stats["files_modified"] += 1
        print(f"UPDATED: {rel}")

# Find all HTML files
html_files = glob.glob(os.path.join(BASE_DIR, "*.html"))
html_files += glob.glob(os.path.join(BASE_DIR, "pages", "*.html"))
html_files += glob.glob(os.path.join(BASE_DIR, "locations", "*.html"))
html_files += glob.glob(os.path.join(BASE_DIR, "blog", "*.html"))
html_files += glob.glob(os.path.join(BASE_DIR, "blog", "**", "*.html"), recursive=True)

# Deduplicate
html_files = sorted(set(html_files))

print(f"Processing {len(html_files)} HTML files...\n")

for f in html_files:
    process_file(f)

print(f"\n{'='*50}")
print(f"SEO FIXES COMPLETE")
print(f"{'='*50}")
print(f"Files modified:       {stats['files_modified']}")
print(f"Canonical tags added: {stats['canonical_added']}")
print(f"OG tags added:        {stats['og_added']}")
print(f"Schema phone fixed:   {stats['schema_phone_fixed']}")
print(f"Meta desc added:      {stats['meta_desc_added']}")
print(f"H1 fixed:             {stats['h1_fixed']}")
print(f"Branding fixed:       {stats['branding_fixed']}")
