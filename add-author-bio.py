#!/usr/bin/env python3
"""
Add author bio card + digitalSourceType to all blog posts.
- Visible author bio card inserted before the blog-cta section
- digitalSourceType added to existing BlogPosting JSON-LD schemas
"""
import json, re, os, glob

BLOG_DIR = "/Users/agenticmac/projects/frame-restoration-utah/blog"

AUTHOR_BIO_HTML = '''<section class="author-bio" style="max-width:780px;margin:0 auto;padding:0 5% 40px;">
  <div style="display:flex;gap:20px;align-items:flex-start;background:#f8f9fa;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
    <img src="/images/landon-yokers-headshot.jpg" alt="Landon Yokers, Owner of Frame Roofing Utah" width="80" height="80" loading="lazy" style="border-radius:50%;flex-shrink:0;object-fit:cover;" />
    <div>
      <p style="margin:0 0 4px;font-family:'Archivo Black',sans-serif;font-size:16px;color:#0B4060;">Landon Yokers</p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600;">Owner &amp; Licensed Contractor — Frame Roofing Utah</p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">Landon Yokers is the owner of Frame Roofing Utah, a BBB A+ accredited roofing contractor serving the Wasatch Front and mountain communities. Licensed by the Utah Division of Professional Licensing (DOPL #14256097-5501), Landon has hands-on experience with every roofing challenge Utah's climate delivers — from Heber Valley snow loads to south valley hailstorms. He personally oversees every project and stands behind Frame Restoration's 10-year workmanship warranty.</p>
    </div>
  </div>
</section>'''

def add_digital_source_type(content):
    """Add digitalSourceType to BlogPosting schemas that don't have it."""
    if 'digitalSourceType' in content:
        return content, False
    
    # Find BlogPosting in the JSON-LD and add digitalSourceType
    # Look for the closing of the BlogPosting object within @graph
    patterns = [
        # Pattern: "about": {...} as last property before closing BlogPosting
        (r'("about"\s*:\s*\{[^}]*\})\s*\n(\s*\})', r'\1,\n\2        "digitalSourceType": "https://cv.iptc.org/newscodes/digitalsourcetype/humanWritten"\n\2'),
    ]
    
    # Simpler approach: find BlogPosting script block, parse JSON, add field, replace
    blocks = list(re.finditer(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', content, re.DOTALL))
    
    for match in blocks:
        try:
            data = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        
        modified = False
        if isinstance(data, dict) and '@graph' in data:
            for item in data['@graph']:
                if item.get('@type') == 'BlogPosting' and 'digitalSourceType' not in item:
                    item['digitalSourceType'] = 'https://cv.iptc.org/newscodes/digitalsourcetype/humanWritten'
                    modified = True
        elif isinstance(data, dict) and data.get('@type') == 'BlogPosting' and 'digitalSourceType' not in data:
            data['digitalSourceType'] = 'https://cv.iptc.org/newscodes/digitalsourcetype/humanWritten'
            modified = True
        
        if modified:
            new_json = json.dumps(data, indent=2, ensure_ascii=False)
            new_block = f'<script type="application/ld+json">\n  {new_json}\n  </script>'
            content = content[:match.start()] + new_block + content[match.end():]
            return content, True
    
    return content, False

def process_blog(filepath):
    """Add author bio and digitalSourceType to a blog post."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    changes = []
    
    # 1. Add author bio if not present
    if 'class="author-bio"' not in content:
        # Insert before blog-cta section
        cta_idx = content.find('<section class="blog-cta"')
        if cta_idx == -1:
            # Try alternate: insert before footer
            cta_idx = content.find('<footer>')
        
        if cta_idx != -1:
            content = content[:cta_idx] + AUTHOR_BIO_HTML + '\n\n' + content[cta_idx:]
            changes.append("author bio")
        else:
            print(f"  ⚠ No insertion point for author bio")
    
    # 2. Add digitalSourceType
    content, added = add_digital_source_type(content)
    if added:
        changes.append("digitalSourceType")
    
    if changes:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  ✓ Added: {', '.join(changes)}")
        return True
    else:
        print(f"  SKIP: Already has both")
        return True

# Find all blog posts
blog_files = sorted(glob.glob(os.path.join(BLOG_DIR, "**/*.html"), recursive=True))
blog_files = [f for f in blog_files if not f.endswith('index.html')]

print("=" * 60)
print(f"ADDING AUTHOR BIO + digitalSourceType — {len(blog_files)} BLOG POSTS")
print("=" * 60)

success = 0
for f in blog_files:
    relpath = os.path.relpath(f, BLOG_DIR)
    print(f"\n→ {relpath}...")
    if process_blog(f):
        success += 1

print(f"\n{'=' * 60}")
print(f"COMPLETE: {success}/{len(blog_files)} blog posts processed")
print(f"{'=' * 60}")
