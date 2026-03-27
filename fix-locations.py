#!/usr/bin/env python3
"""Batch fix location pages: branding, phone numbers, nav consistency."""
import os, re, glob

LOC_DIR = "/Users/agenticmac/projects/frame-restoration-utah/locations"

NEW_NAV = '<nav>\n  <a href="/" class="nav-logo" aria-label="Frame Roofing Utah - Home">\n    <img loading="eager" src="/images/logo-rc-darkblue.webp" alt="Frame Roofing Utah Roofing &amp; Construction - Utah" width="180" height="50" />\n  </a>\n  <ul class="nav-links" id="navLinks">\n    <li><a href="/#services">Services</a></li>\n    <li><a href="/blog">Blog</a></li>\n    <li><a href="/pages/gallery">Projects</a></li>\n    <li><a href="/#areas">Service Areas</a></li>\n    <li><a href="/#faq">FAQ</a></li>\n    <li><a href="/#contact">Contact</a></li>\n    <li><a href="tel:+14352928802" class="nav-phone">435-292-8802</a></li>\n    <li><a href="https://calendar.app.google/cR4bBSWfb9TQ28UF8" target="_blank" rel="noopener" class="nav-cta">Free Inspection</a></li>\n  </ul>\n  <button class="mobile-btn" id="menuBtn" aria-label="Toggle navigation"><span></span><span></span><span></span></button>\n</nav>'

files_fixed = 0
changes_log = []

for fpath in sorted(glob.glob(os.path.join(LOC_DIR, "*.html"))):
    fname = os.path.basename(fpath)
    with open(fpath, 'r') as f:
        content = f.read()
    original = content
    fixes = []

    # 1. Fix nav block
    nav_pattern = r'<nav>.*?</nav>'
    content = re.sub(nav_pattern, NEW_NAV, content, count=1, flags=re.DOTALL)
    if content != original:
        fixes.append("nav")

    # 2. Fix phone numbers in CTA/links (keep in FAQ schema answers)
    content = content.replace('tel:+14353024422', 'tel:+14352928802')
    content = content.replace('>435-302-4422<', '>435-292-8802<')
    content = content.replace('Call 435-302-4422', 'Call 435-292-8802')
    content = content.replace('call us at 435-302-4422', 'call us at 435-292-8802')
    if content != original and "phone" not in fixes:
        fixes.append("phone")

    # 3. Fix branding: "Frame Restoration" -> "Frame Roofing Utah" in body
    # Preserve alt text references to logo
    before_brand = content
    content = re.sub(
        r'(?<!["\'])Frame Restoration(?! Roofing &amp;)(?! Utah LLC)(?!\s*")',
        'Frame Roofing Utah',
        content
    )
    if content != before_brand:
        fixes.append("branding")

    if content != original:
        with open(fpath, 'w') as f:
            f.write(content)
        files_fixed += 1
        changes_log.append(f"  {fname}: {', '.join(fixes)}")

print(f"Fixed {files_fixed} files:")
for line in changes_log:
    print(line)
