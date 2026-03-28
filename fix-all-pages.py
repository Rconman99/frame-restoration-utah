#!/usr/bin/env python3
"""Fix branding and phone numbers across ALL HTML files in the project."""
import os, re, glob

ROOT = "/Users/agenticmac/projects/frame-restoration-utah"
files_fixed = 0
changes_log = []

# Find all HTML files recursively
for fpath in sorted(glob.glob(os.path.join(ROOT, "**/*.html"), recursive=True)):
    # Skip locations (already fixed) and node_modules/.git
    rel = os.path.relpath(fpath, ROOT)
    if rel.startswith("locations/") or rel.startswith(".git/") or rel.startswith("node_modules/"):
        continue
    
    with open(fpath, 'r') as f:
        content = f.read()
    original = content
    fixes = []

    # 1. Fix phone numbers in tel: links and display text
    content = content.replace('tel:+14353024422', 'tel:+14352928802')
    content = content.replace('>435-302-4422<', '>435-292-8802<')
    content = content.replace('Call 435-302-4422', 'Call 435-292-8802')
    content = content.replace('call us at 435-302-4422', 'call us at 435-292-8802')
    content = content.replace('Call us at 435-302-4422', 'Call us at 435-292-8802')
    # Keep 435-302-4422 in plain text references to business number (FAQ answers etc)
    if content != original:
        fixes.append("phone")

    # 2. Fix branding in body/visible text
    before_brand = content
    # Replace "Frame Restoration" but NOT:
    # - "Frame Restoration Utah LLC" (legal name)
    # - Inside image alt attributes for logo
    # - Inside og:site_name or similar meta (should already be correct)
    content = re.sub(
        r'Frame Restoration(?! Utah LLC)(?! Roofing &amp;)(?! Roofing &)',
        'Frame Roofing Utah',
        content
    )
    if content != before_brand:
        fixes.append("branding")

    # 3. Fix nav phone number if present
    content = content.replace(
        '<a href="tel:+14353024422" class="nav-phone">435-302-4422</a>',
        '<a href="tel:+14352928802" class="nav-phone">435-292-8802</a>'
    )

    if content != original:
        with open(fpath, 'w') as f:
            f.write(content)
        files_fixed += 1
        changes_log.append(f"  {rel}: {', '.join(fixes)}")

print(f"Fixed {files_fixed} non-location files:")
for line in changes_log:
    print(line)
