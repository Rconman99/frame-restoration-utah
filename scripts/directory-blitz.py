#!/usr/bin/env python3
"""Retired directory submission helper.

This one-off script is intentionally blocked because it can open third-party
directory forms and copy public NAP into live listings.
"""

import sys

NOTICE = (
    "RETIRED: scripts/directory-blitz.py is blocked for live citation use. "
    "Use data/NAP-DIRECTORY-CHECKLIST-2026-06-01.md and an owner-approved "
    "vendor data room instead. Public phone is 435-292-8802; do not publish "
    "internal forwarding or legacy numbers."
)


def main() -> int:
    print(NOTICE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
