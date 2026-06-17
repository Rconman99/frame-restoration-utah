#!/usr/bin/env python3
"""
Normalize the mobile conversion CTAs site-wide (idempotent).

Two changes per customer-facing page:
  1. Replace the legacy single-link `.sticky-call` bar with the canonical
     dual Call + Text bar (microcopy + two equal-width buttons). Styling lives
     in global.css; this only swaps the markup.
  2. Insert a visible header tap-to-call button (`.nav-call-mobile`) right
     before the hamburger `.mobile-btn`, so mobile users can call without
     opening the menu.

Selection: any page that already carries a `.sticky-call` bar (that set IS the
customer-facing template — internal/app pages have none), plus four bar-less
customer pages that link global.css. Internal/non-deployed paths are excluded.

Idempotent: re-running is a no-op. Phone stays the public NAP 435-292-8802
(tel:/sms:+14352928802). No SMS-consent copy is touched.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PHONE_SVG = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" '
             'stroke="currentColor" stroke-width="2.5" aria-hidden="true">'
             '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 '
             '19.5 0 013.07 10.8 19.79 19.79 0 01.03 2.18 2 2 0 012 0h3a2 2 0 012 '
             '1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 '
             '6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>')
SMS_SVG = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" '
           'stroke="currentColor" stroke-width="2.5" aria-hidden="true">'
           '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 '
           '01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 '
           '0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>')

STICKY_BAR = f'''<div class="sticky-call" role="region" aria-label="Contact Frame Restoration Utah">
  <span class="sticky-call-microcopy">Free roof inspection</span>
  <div class="sticky-call-actions">
    <a class="sticky-call-btn sticky-call-phone" href="tel:+14352928802" data-cta="mobile-call" aria-label="Call Frame Restoration Utah at 435-292-8802">{PHONE_SVG} Call Now</a>
    <a class="sticky-call-btn sticky-call-text" href="sms:+14352928802" data-cta="mobile-sms" aria-label="Text Frame Restoration Utah at 435-292-8802">{SMS_SVG} Text Us</a>
  </div>
</div>'''

HEADER_BTN = (f'<a href="tel:+14352928802" class="nav-call-mobile" data-cta="header-call" '
              f'aria-label="Call Frame Restoration Utah at 435-292-8802">{PHONE_SVG}</a>\n   ')

STICKY_RE = re.compile(r'<div class="sticky-call".*?</div>', re.DOTALL)
# Match the opening <button of the hamburger regardless of attribute order or
# whether its class is "mobile-btn" or the older "menu-btn". Zero-width so the
# substitution inserts the header button *before* it without altering the tag.
MOBILE_BTN_RE = re.compile(r'<button(?=[^>]*class="(?:mobile|menu)-btn")')

# Bar-less customer pages to also receive the sticky bar (before </body>).
EXPLICIT_ADD = {"thank-you.html", "privacy.html", "terms.html", "review.html"}

# Path fragments that mark internal / non-deployed pages — never touch.
EXCLUDE_FRAGMENTS = ("/archive/", "/dashboard/", "/build-intelligence/", "/data/",
                     "/scripts/", "/vendor/", "/node_modules/")
EXCLUDE_NAMES = {"index-redesign.html", "leads.html", "hero.html"}


def is_excluded(path: Path) -> bool:
    p = "/" + str(path.relative_to(ROOT))
    if any(frag in p for frag in EXCLUDE_FRAGMENTS):
        return True
    return path.name in EXCLUDE_NAMES


def process(path: Path) -> str:
    html = path.read_text(encoding="utf-8")
    orig = html
    has_sticky = 'class="sticky-call"' in html
    rel = str(path.relative_to(ROOT))

    # 1) Sticky bar
    if has_sticky:
        if 'data-cta="mobile-sms"' not in html:        # not yet normalized
            html, n = STICKY_RE.subn(STICKY_BAR, html, count=1)
            if n == 0:
                return "skip(sticky-regex-miss)"
    elif rel in EXPLICIT_ADD:
        if 'global.css' not in html:
            return "skip(no-global-css)"
        if '</body>' not in html:
            return "skip(no-body)"
        head, tail = html.rsplit('</body>', 1)
        html = head + STICKY_BAR + "\n</body>" + tail
    else:
        return "skip(not-customer-page)"

    # 2) Header tap-to-call button (only where a hamburger exists)
    if 'class="nav-call-mobile"' not in html and MOBILE_BTN_RE.search(html):
        html = MOBILE_BTN_RE.sub(HEADER_BTN + '<button', html, count=1)

    if html == orig:
        return "nochange"
    path.write_text(html, encoding="utf-8")
    return "UPDATED"


def main():
    apply = "--apply" in sys.argv
    targets = []
    for path in ROOT.rglob("*.html"):
        if is_excluded(path):
            continue
        rel = str(path.relative_to(ROOT))
        if 'class="sticky-call"' in path.read_text(encoding="utf-8") or rel in EXPLICIT_ADD:
            targets.append(path)

    results = {}
    updated = []
    for path in sorted(targets):
        if apply:
            r = process(path)
        else:
            # dry run: compute outcome without writing
            html = path.read_text(encoding="utf-8")
            rel = str(path.relative_to(ROOT))
            if 'data-cta="mobile-sms"' in html:
                r = "already-normalized"
            elif 'class="sticky-call"' in html or rel in EXPLICIT_ADD:
                r = "would-update"
            else:
                r = "skip"
        results[r] = results.get(r, 0) + 1
        if r in ("UPDATED", "would-update"):
            updated.append(str(path.relative_to(ROOT)))

    print(f"{'APPLY' if apply else 'DRY-RUN'} — {len(targets)} candidate files")
    for k, v in sorted(results.items()):
        print(f"  {k}: {v}")
    print("\nfiles:")
    for f in updated:
        print(f"  {f}")


if __name__ == "__main__":
    main()
