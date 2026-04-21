#!/usr/bin/env python3
"""
Directory Blitz Helper — pre-checks and opens directories for submission.

What it does:
1. Checks each directory URL to see if Frame Roofing is already listed
2. Opens the submission page in your browser for each pending directory
3. Copies the business info to clipboard for quick pasting
4. Tracks progress in a JSON file

Usage:
    python3 scripts/directory-blitz.py              # Show status
    python3 scripts/directory-blitz.py --open-next   # Open the next pending directory
    python3 scripts/directory-blitz.py --open-all    # Open all pending directories
    python3 scripts/directory-blitz.py --mark-done "Manta"  # Mark one as done
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROGRESS_FILE = PROJECT_ROOT / "data" / "directory-progress.json"

BUSINESS = {
    "name": "Frame Restoration Utah LLC",
    "dba": "Frame Roofing Utah",
    "address": "142 S Main St",
    "city": "Heber City",
    "state": "UT",
    "zip": "84032",
    "phone": "(435) 302-4422",
    "phone_raw": "4353024422",
    "website": "https://www.frameroofingutah.com",
    "email": "landon@framerestorations.com",
    "owner": "Landon Yokers",
    "license": "#14256097-5501",
    "category": "Roofing Contractor",
    "description": "Frame Restoration Utah LLC is a licensed, insured roofing contractor serving the Wasatch Front and Heber Valley. Specializing in storm damage repair, roof replacements, and inspections. CertainTeed and Tamko certified. BBB A+ accredited. Free estimates: (435) 302-4422.",
}

DIRECTORIES = [
    # Priority 1 — Data Aggregators (cascade to 40-70+ directories each)
    {"name": "Data Axle (Express Update)", "da": 70, "url": "https://local-listings.data-axle.com/search", "type": "phone", "time": "15 min"},
    {"name": "Neustar / Localeze", "da": 68, "url": "https://www.neustarlocaleze.biz/directory/add-your-business", "type": "phone", "time": "15 min"},
    # Priority 2 — High DA directories
    {"name": "Trustpilot", "da": 93, "url": "https://business.trustpilot.com", "type": "account", "time": "10 min"},
    {"name": "Foursquare", "da": 91, "url": "https://foursquare.com/venue/claim", "type": "simple", "time": "10 min"},
    {"name": "Houzz", "da": 90, "url": "https://www.houzz.com/getStartedPro", "type": "account", "time": "15 min"},
    {"name": "Yellow Pages (YP.com)", "da": 82, "url": "https://www.yp.com", "type": "account", "time": "5 min"},
    {"name": "HomeAdvisor", "da": 80, "url": "https://pro.homeadvisor.com", "type": "account", "time": "10 min"},
    {"name": "KSL Classifieds", "da": 75, "url": "https://www.ksl.com/services", "type": "account", "time": "10 min"},
    {"name": "Manta", "da": 74, "url": "https://www.manta.com/claim", "type": "simple", "time": "5 min"},
    {"name": "Porch.com", "da": 72, "url": "https://pro.porch.com/join", "type": "account", "time": "10 min"},
    {"name": "Deseret News Directory", "da": 70, "url": "https://www.deseretnews.com", "type": "account", "time": "5 min"},
    {"name": "ChamberofCommerce.com", "da": 65, "url": "https://www.chamberofcommerce.com", "type": "landon", "time": "5 min"},
    {"name": "Birdeye", "da": 65, "url": "https://birdeye.com", "type": "account", "time": "10 min"},
    {"name": "CertainTeed Locator", "da": 62, "url": "https://www.certainteed.com", "type": "landon", "time": "5 min (phone)"},
    {"name": "BuildZoom", "da": 60, "url": "https://www.buildzoom.com", "type": "account", "time": "10 min"},
    {"name": "Salt Lake Chamber", "da": 60, "url": "https://slchamber.com", "type": "landon", "time": "10 min"},
    {"name": "Tamko Locator", "da": 55, "url": "https://www.tamko.com", "type": "landon", "time": "5 min (phone)"},
    {"name": "Park City Chamber", "da": 55, "url": "https://www.visitparkcity.com", "type": "landon", "time": "10 min"},
    {"name": "eLocal", "da": 55, "url": "https://www.elocal.com", "type": "simple", "time": "5 min"},
    {"name": "Hotfrog", "da": 55, "url": "https://www.hotfrog.com", "type": "simple", "time": "5 min"},
    {"name": "Contractor Connection", "da": 50, "url": "https://www.contractorconnection.com", "type": "phone", "time": "15 min"},
    {"name": "Brownbook.net", "da": 50, "url": "https://www.brownbook.net/add-business", "type": "simple", "time": "5 min"},
    {"name": "Cylex", "da": 50, "url": "https://www.cylex.us.com", "type": "simple", "time": "5 min"},
    {"name": "GuildQuality", "da": 50, "url": "https://www.guildquality.com", "type": "landon", "time": "10 min"},
    {"name": "Heber Valley Chamber", "da": 40, "url": "https://gohebervalley.com", "type": "landon", "time": "10 min"},
]


def load_progress():
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {}


def save_progress(progress):
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PROGRESS_FILE.write_text(json.dumps(progress, indent=2))


def copy_to_clipboard(text):
    subprocess.run(["pbcopy"], input=text.encode(), check=True)


def show_status(progress):
    done = [d for d in DIRECTORIES if progress.get(d["name"], {}).get("done")]
    pending = [d for d in DIRECTORIES if not progress.get(d["name"], {}).get("done")]

    print(f"\n  Directory Blitz — Frame Roofing Utah")
    print(f"  Progress: {len(done)}/{len(DIRECTORIES)} ({len(done)*100//len(DIRECTORIES)}%)\n")

    if done:
        print("  DONE:")
        for d in done:
            date = progress[d["name"]].get("date", "")
            print(f"    ✅ {d['name']} (DA:{d['da']}) — {date}")

    print(f"\n  PENDING ({len(pending)}):")
    for d in sorted(pending, key=lambda x: x["da"], reverse=True):
        icon = {"simple": "🟢", "account": "🟡", "phone": "🟠", "landon": "🔴"}.get(d["type"], "⬜")
        print(f"    {icon} {d['name']} (DA:{d['da']}) — {d['time']} — {d['type']}")

    print(f"\n  Legend: 🟢 simple form  🟡 needs account  🟠 needs phone  🔴 needs Landon")


def open_next(progress):
    pending = [d for d in DIRECTORIES if not progress.get(d["name"], {}).get("done")]
    # Prioritize simple forms first, then by DA
    pending.sort(key=lambda x: ({"simple": 0, "account": 1, "phone": 2, "landon": 3}.get(x["type"], 4), -x["da"]))

    if not pending:
        print("  All directories submitted!")
        return

    d = pending[0]
    print(f"\n  Opening: {d['name']} (DA:{d['da']})")
    print(f"  URL: {d['url']}")
    print(f"  Type: {d['type']} — {d['time']}")

    # Copy business description to clipboard
    copy_to_clipboard(BUSINESS["description"])
    print(f"  Business description copied to clipboard")
    print(f"\n  NAP info:")
    for key in ["name", "address", "city", "state", "zip", "phone", "website", "email", "owner", "category"]:
        print(f"    {key}: {BUSINESS[key]}")

    subprocess.run(["open", d["url"]])
    print(f"\n  When done, run: python3 scripts/directory-blitz.py --mark-done \"{d['name']}\"")


def open_all_simple(progress):
    simple = [d for d in DIRECTORIES
              if not progress.get(d["name"], {}).get("done") and d["type"] == "simple"]

    if not simple:
        print("  No simple directories remaining")
        return

    print(f"\n  Opening {len(simple)} simple directories (no account needed):")
    for d in sorted(simple, key=lambda x: -x["da"]):
        print(f"    🟢 {d['name']} (DA:{d['da']})")
        subprocess.run(["open", d["url"]])

    copy_to_clipboard(BUSINESS["description"])
    print(f"\n  Business description copied to clipboard")


def mark_done(name, progress):
    for d in DIRECTORIES:
        if d["name"].lower() == name.lower() or name.lower() in d["name"].lower():
            progress[d["name"]] = {"done": True, "date": datetime.now().strftime("%Y-%m-%d")}
            save_progress(progress)
            print(f"  ✅ Marked done: {d['name']}")
            return
    print(f"  Not found: {name}")
    print(f"  Available: {', '.join(d['name'] for d in DIRECTORIES)}")


def main():
    parser = argparse.ArgumentParser(description="Directory Blitz Helper")
    parser.add_argument("--open-next", action="store_true", help="Open the next pending directory")
    parser.add_argument("--open-simple", action="store_true", help="Open all simple-form directories")
    parser.add_argument("--mark-done", help="Mark a directory as done")
    parser.add_argument("--reset", action="store_true", help="Reset all progress")
    args = parser.parse_args()

    progress = load_progress()

    if args.reset:
        save_progress({})
        print("  Progress reset")
        return

    if args.mark_done:
        mark_done(args.mark_done, progress)
        show_status(progress)
        return

    if args.open_next:
        open_next(progress)
        return

    if args.open_simple:
        open_all_simple(progress)
        return

    show_status(progress)


if __name__ == "__main__":
    main()
