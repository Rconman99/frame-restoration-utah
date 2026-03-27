#!/usr/bin/env python3
"""
SEO Batch: Internal Cross-Linking + Image Lazy-Loading
1. Adds "Related Articles" to location pages that have matching blog posts
2. Adds loading="lazy" to all below-fold images across the site
"""
import os, re, glob

BASE = "/Users/agenticmac/projects/frame-restoration-utah"

# ═══ MAP: city -> blog posts ═══
BLOG_MAP = {}
for bp in glob.glob(os.path.join(BASE, "blog", "*", "*.html")):
    parts = bp.split("/")
    city = parts[-2]  # e.g. "heber-city"
    filename = parts[-1].replace(".html", "")
    if city == "utah":
        continue  # statewide posts handled separately
    if city not in BLOG_MAP:
        BLOG_MAP[city] = []
    # Extract title from file
    with open(bp, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    title_match = re.search(r"<title>(.*?)</title>", content)
    title = title_match.group(1).split("|")[0].strip() if title_match else filename.replace("-", " ").title()
    BLOG_MAP[city].append({"path": f"/blog/{city}/{filename}", "title": title})

# ═══ CROSS-LINK: Add related blog posts to location pages ═══
stats = {"crosslinked": 0, "lazyload_fixed": 0, "files_modified": 0}

def add_crosslinks_to_location(filepath):
    city = os.path.basename(filepath).replace(".html", "")
    if city not in BLOG_MAP or len(BLOG_MAP[city]) == 0:
        return False
    
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    
    # Skip if already has related articles section
    if "From Our Blog" in content or "Related Articles" in content or "related-articles" in content:
        return False
    
    blogs = BLOG_MAP[city]
    city_display = city.replace("-", " ").title()
    
    # Build the related articles HTML
    blog_links = ""
    for b in blogs[:4]:  # max 4
        blog_links += f'      <a href="{b["path"]}" style="display:block;padding:14px 18px;background:white;border-radius:6px;text-decoration:none;color:var(--navy);font-weight:600;font-size:15px;border:1px solid var(--light-gray);transition:all 0.2s;">{b["title"]}</a>\n'
    
    related_html = f'''
    <div class="related-articles" style="background:var(--off-white);border-radius:8px;padding:28px;margin:36px 0;">
      <h3 style="font-family:'Archivo Black',sans-serif;font-size:17px;color:var(--navy);margin:0 0 16px;text-transform:uppercase;">Roofing Tips for {city_display}</h3>
      <div style="display:grid;gap:10px;">
{blog_links}      </div>
    </div>
'''
    
    # Insert before the CTA section or before </article> or before page-cta
    if '<section class="page-cta">' in content:
        content = content.replace('<section class="page-cta">', related_html + '\n<section class="page-cta">', 1)
    elif '</article>' in content:
        content = content.replace('</article>', related_html + '</article>', 1)
    elif '<!-- CTA -->' in content:
        content = content.replace('<!-- CTA -->', related_html + '\n<!-- CTA -->', 1)
    else:
        # Insert before closing </section> of the main content
        # Find the "Schedule Your" CTA h2
        cta_match = re.search(r'<h2>Schedule Your', content)
        if cta_match:
            content = content[:cta_match.start()] + related_html + '\n' + content[cta_match.start():]
        else:
            return False
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    stats["crosslinked"] += 1
    return True

# ═══ LAZY-LOAD: Add loading="lazy" to below-fold images ═══
def add_lazyload(filepath):
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    
    original = content
    
    # Find all <img tags that don't have loading= attribute
    # But skip the first image (hero/above-fold) and logo images
    img_pattern = re.compile(r'<img\s(?![^>]*loading=)[^>]*>', re.IGNORECASE)
    matches = list(img_pattern.finditer(content))
    
    # Process in reverse to maintain positions
    count = 0
    for match in reversed(matches):
        img_tag = match.group()
        # Skip logo images (above fold)
        if 'logo' in img_tag.lower() or 'nav-logo' in img_tag.lower():
            continue
        # Add loading="lazy"
        new_tag = img_tag.replace('<img ', '<img loading="lazy" ', 1)
        content = content[:match.start()] + new_tag + content[match.end():]
        count += 1
    
    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        stats["lazyload_fixed"] += count
        return True
    return False

# ═══ PROCESS ALL FILES ═══
all_html = glob.glob(os.path.join(BASE, "*.html"))
all_html += glob.glob(os.path.join(BASE, "pages", "*.html"))
all_html += glob.glob(os.path.join(BASE, "locations", "*.html"))
all_html += glob.glob(os.path.join(BASE, "blog", "*.html"))
all_html += glob.glob(os.path.join(BASE, "blog", "**", "*.html"), recursive=True)
all_html = sorted(set(all_html))

print(f"Processing {len(all_html)} files...")
print(f"Blog posts mapped to {len(BLOG_MAP)} cities: {', '.join(sorted(BLOG_MAP.keys()))}\n")

for fp in all_html:
    rel = os.path.relpath(fp, BASE)
    modified = False
    
    # Cross-link only location pages
    if "/locations/" in fp:
        if add_crosslinks_to_location(fp):
            modified = True
            print(f"CROSSLINKED: {rel}")
    
    # Lazy-load all pages
    if add_lazyload(fp):
        if not modified:
            print(f"LAZYLOAD: {rel}")
        else:
            print(f"  + lazyload added")
        modified = True
    
    if modified:
        stats["files_modified"] += 1

print(f"\n{'='*50}")
print(f"COMPLETE")
print(f"{'='*50}")
print(f"Files modified:    {stats['files_modified']}")
print(f"Location pages cross-linked: {stats['crosslinked']}")
print(f"Images lazy-loaded: {stats['lazyload_fixed']}")
