#!/usr/bin/env python3
"""Inject or verify click tracking on every live HTML page with a phone CTA.

Rules:
  - If page already includes track-attribution.js → add track-clicks.js right after it.
  - If page has tel:/sms: but no track-attribution.js → add BOTH before </head>.
  - Skip if track-clicks.js already present.
  - Skip non-public artifacts and dashboard/redirect-only HTML files.
  - With --check, fail without writing if any live phone CTA is uninstrumented.
"""

import argparse
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {
    '.git',
    'archive',
    'data',
    'images-stock-backup',
    'node_modules',
    'previews',
    'qa',
    'screenshots',
    'tmp-landon-apr20',
    'vendor',
}
SKIP_FILES = {
    'hero.html',       # /hero redirects to the instrumented homepage
    'leads.html',      # authenticated dashboard, not customer intent
}

ATTR_INCLUDE = '<script src="/track-attribution.js" defer></script>'
CLICKS_INCLUDE = '<script src="/track-clicks.js?v=2" defer></script>'
PHONE_LINK_RE = re.compile(r'href\s*=\s*["\'](?:tel|sms):', re.IGNORECASE)
ATTR_SCRIPT_RE = re.compile(r'<script\b[^>]*\bsrc=["\']/track-attribution\.js(?:\?[^"\']*)?["\'][^>]*>\s*</script>', re.IGNORECASE)
CLICKS_SCRIPT_RE = re.compile(r'<script\b[^>]*\bsrc=["\']/track-clicks\.js(?:\?[^"\']*)?["\'][^>]*>\s*</script>', re.IGNORECASE)

def should_skip(path_rel: Path) -> bool:
    return bool(SKIP_DIRS.intersection(path_rel.parts)) or path_rel.name in SKIP_FILES

def process_file(full_path: Path, *, apply: bool) -> str:
    html = full_path.read_text(encoding='utf-8')

    if CLICKS_SCRIPT_RE.search(html):
        return 'already_has_clicks'
    if not PHONE_LINK_RE.search(html):
        return 'no_tel_link'

    attr_match = ATTR_SCRIPT_RE.search(html)
    if attr_match:
        new_html = html[:attr_match.end()] + '\n  ' + CLICKS_INCLUDE + html[attr_match.end():]
    elif '</head>' in html:
        injection = '  ' + ATTR_INCLUDE + '\n  ' + CLICKS_INCLUDE + '\n</head>'
        new_html = html.replace('</head>', injection, 1)
    else:
        return 'no_head_tag'

    if new_html == html:
        return 'no_change'

    if apply:
        full_path.write_text(new_html, encoding='utf-8')
        return 'updated'
    return 'missing_clicks'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='fail on gaps without writing')
    args = parser.parse_args()
    counts = {}
    changed_files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith('.html'):
                continue
            full = Path(dirpath) / fn
            rel = full.relative_to(ROOT)
            if should_skip(rel):
                continue
            result = process_file(full, apply=not args.check)
            counts[result] = counts.get(result, 0) + 1
            if result in {'updated', 'missing_clicks'}:
                changed_files.append(str(rel))
    for k, v in sorted(counts.items()):
        print(f'{k}: {v}')
    action = 'Missing instrumentation' if args.check else 'Updated files'
    print(f'\n{action} ({len(changed_files)}):')
    for f in changed_files[:60]:
        print(' ', f)
    if len(changed_files) > 60:
        print(f'  ...and {len(changed_files) - 60} more')
    if args.check and changed_files:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
