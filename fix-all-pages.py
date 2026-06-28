#!/usr/bin/env python3
"""Retired bulk HTML rewrite script.

This script is intentionally blocked until NAP and compliance rules are
re-approved in the maintained generation pipeline.
"""

import sys

NOTICE = (
    "RETIRED: fix-all-pages.py is blocked for bulk page rewrites. "
    "Use maintained templates and audited replacement scripts instead. "
    "Public phone is 435-292-8802; do not rewrite public pages with internal "
    "forwarding or legacy numbers."
)


def main() -> int:
    print(NOTICE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
