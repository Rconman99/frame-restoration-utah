#!/usr/bin/env python3
"""Retired one-off FAQ generator.

This script is intentionally blocked until NAP and insurance/compliance copy
constants are re-approved in the maintained generation pipeline.
"""

import sys

NOTICE = (
    "RETIRED: expand-faqs-remaining.py is blocked for page generation. "
    "Use the maintained templates and current compliance dictionary instead. "
    "Public phone is 435-292-8802; do not regenerate pages with internal "
    "forwarding or legacy numbers."
)


def main() -> int:
    print(NOTICE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
