#!/usr/bin/env python3
"""Inject /track-clicks.js into every live HTML page that has a tel: or sms: link.

Rules:
  - If page already includes track-attribution.js → add track-clicks.js right after it.
  - If page has tel:/sms: but no track-attribution.js → add BOTH before </head>.
  - Skip if track-clicks.js already present.
  - Skip archive/, node_modules/, tmp-*, data/blog-published/, leads.html (dashboard).
"""

import os, re, sys

ROOT = '/Users/agenticmac/projects/frame-restoration-utah'
SKIP_DIRS = ('archive', 'node_modules', 'tmp-landon-apr20', 'data/blog-published', 'screenshots', 'images-stock-backup', 'vendor', '.git')
SKIP_FILES = {'leads.html'}  # dashboard — clicks here aren't real customer intent

ATTR_INCLUDE = '<script src="/track-attribution.js" defer></script>'
CLICKS_INCLUDE = '<script src="/track-clicks.js" defer></script>'

def should_skip(path_rel):
    if any(path_rel.startswith(d + os.sep) or '/' + d + '/' in path_rel for d in SKIP_DIRS):
        return True
    if os.path.basename(path_rel) in SKIP_FILES:
        return True
    return False

def process_file(full_path):
    with open(full_path, 'r', encoding='utf-8') as f:
        html = f.read()

    if 'track-clicks.js' in html:
        return 'already_has_clicks'
    if 'href="tel:' not in html and 'href="sms:' not in html and 'href="sms:' not in html:
        return 'no_tel_link'

    new_html = html
    if ATTR_INCLUDE in html:
        new_html = html.replace(
            ATTR_INCLUDE,
            ATTR_INCLUDE + '\n  ' + CLICKS_INCLUDE
        )
    elif '</head>' in html:
        injection = '  ' + ATTR_INCLUDE + '\n  ' + CLICKS_INCLUDE + '\n</head>'
        new_html = html.replace('</head>', injection, 1)
    else:
        return 'no_head_tag'

    if new_html == html:
        return 'no_change'

    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(new_html)
    return 'updated'

def main():
    counts = {}
    updated_files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        rel_dir = os.path.relpath(dirpath, ROOT)
        for fn in filenames:
            if not fn.endswith('.html'):
                continue
            rel = os.path.normpath(os.path.join(rel_dir, fn)) if rel_dir != '.' else fn
            if should_skip(rel):
                continue
            full = os.path.join(dirpath, fn)
            result = process_file(full)
            counts[result] = counts.get(result, 0) + 1
            if result == 'updated':
                updated_files.append(rel)
    for k, v in sorted(counts.items()):
        print(f'{k}: {v}')
    print(f'\nUpdated files ({len(updated_files)}):')
    for f in updated_files[:60]:
        print(' ', f)
    if len(updated_files) > 60:
        print(f'  ...and {len(updated_files) - 60} more')

if __name__ == '__main__':
    main()
