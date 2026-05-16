#!/usr/bin/env python3
"""Swap every tel: href from Landon's direct line (+14353024422) to the Twilio
tracking number (+14352928802). The display TEXT stays as branded
'(435) 302-4422' — only the href changes. Twilio forwards to Landon via
handle-call, so customer experience is identical, but now every call is
logged and surfaces as a lead in /leads.

Touches: only the href attribute of <a tel:...> links and any sms: hrefs that
point at the same Landon number. Leaves all visible 435-302-4422 text alone.
Skips: archive/, node_modules/, leads.html, dashboard/, data/, build-intelligence/
"""
import os, re

ROOT = '/Users/agenticmac/projects/frame-restoration-utah'
SKIP_DIRS = ('archive', 'node_modules', 'tmp-landon-apr20', 'data', 'screenshots',
             'images-stock-backup', 'vendor', '.git', 'build-intelligence', 'dashboard',
             'images')
# leads.html, seo-report deliberately included — they have tel: links too

OLD_E164 = '+14353024422'
OLD_RAW = '4353024422'
NEW_NUMBER = '+14352928802'  # Twilio tracking number, forwards to Landon

# Match tel:+14353024422 or tel:4353024422 (with or without country code)
# Also handle sms: variants
PATTERNS = [
    (re.compile(r'(href=["\'])tel:\+14353024422'), r'\1tel:+14352928802'),
    (re.compile(r'(href=["\'])tel:14353024422'),  r'\1tel:+14352928802'),
    (re.compile(r'(href=["\'])tel:4353024422'),   r'\1tel:+14352928802'),
    (re.compile(r'(href=["\'])sms:\+14353024422'), r'\1sms:+14352928802'),
    (re.compile(r'(href=["\'])sms:14353024422'),  r'\1sms:+14352928802'),
    (re.compile(r'(href=["\'])sms:4353024422'),   r'\1sms:+14352928802'),
]

def process_file(full_path):
    with open(full_path, 'r', encoding='utf-8') as f:
        html = f.read()
    new_html = html
    total = 0
    for pat, repl in PATTERNS:
        new_html, n = pat.subn(repl, new_html)
        total += n
    if total == 0:
        return 0
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(new_html)
    return total

def should_skip(path_rel):
    return any(path_rel.startswith(d + os.sep) or '/' + d + '/' in path_rel for d in SKIP_DIRS)

def main():
    total_files = 0
    total_subs = 0
    detail = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith('.html'):
                continue
            rel = os.path.relpath(os.path.join(dirpath, fn), ROOT)
            if should_skip(rel):
                continue
            n = process_file(os.path.join(dirpath, fn))
            if n > 0:
                total_files += 1
                total_subs += n
                detail.append((rel, n))
    print(f'Files updated: {total_files}')
    print(f'Total tel/sms href swaps: {total_subs}')
    print('\nTop 15 by swap count:')
    for r, n in sorted(detail, key=lambda x: -x[1])[:15]:
        print(f'  {n:3d} swaps  {r}')

if __name__ == '__main__':
    main()
