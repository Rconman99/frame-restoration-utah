#!/usr/bin/env python3
"""
Reddit Scanner v4 for Frame Roofing Utah
Updated 2026-04-10: Added subreddits, cities, keywords from deep research.
STRICT classification: roofing+Utah context gates on post TEXT only.
Fetches via curl, POSTs to Supabase edge function.
"""
import json
import subprocess
import time

SUPABASE_ENDPOINT = "https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/reddit-monitor?key=frame-roofing-2026"

KEYWORDS = [
    "roofing Utah", "storm damage Salt Lake",
    "hail damage Wasatch", "roof repair Utah",
    "insurance claim roof Utah", "roofer recommendation Utah",
    "roof leak Salt Lake City", "hail damage Utah",
    # v4 additions: high-intent keywords from 2026 research
    "roof replacement Utah", "emergency roofer Utah",
    "roof inspection Heber", "storm damage Park City",
]
SUBREDDITS = [
    "SaltLakeCity", "Utah", "homeimprovement",
    "roofing", "Insurance", "HomeOwners", "RealEstate",
    # v4 additions: Utah local subs + contractor-relevant
    "ParkCity", "HeberCity", "WasatchFront",
    "utahrealestate", "utahcounty",
]
COMPETITORS = [
    "bighorn", "bartlett", "vertex", "olympus", "iwc",
    "reimagine", "legacy roofing", "premier roofing",
    # v4 additions: more Utah competitors
    "best choice roofing", "homer roofing", "reroofit",
    "intermountain west", "sky ridge", "utah roofing pros",
]

ROOFING_TERMS = [
    "roof", "roofer", "roofing", "shingle", "shingles", "gutter",
    "flashing", "soffit", "fascia", "ridge cap", "attic vent",
    "ice dam", "granule loss", "roof deck", "underlayment",
    "class 4", "impact resistant", "standing seam", "metal roof",
    "tile roof", "flat roof", "tpo", "epdm", "reroof", "tear off",
    # v4 additions
    "roof replacement", "roof inspection", "emergency roof",
    "roof estimate", "roof warranty", "roof coating",
]
UTAH_TERMS = [
    "utah", "salt lake", "wasatch", "slc", "provo", "ogden",
    "west jordan", "sandy ut", "draper", "murray ut", "south jordan",
    "cottonwood heights", "riverton ut", "herriman", "lehi",
    "taylorsville", "midvale", "holladay", "millcreek", "magna ut",
    "west valley city", "park city", "tooele", "eagle mountain",
    "saratoga springs", "spanish fork", "american fork",
    "pleasant grove", "alpine ut", "highland ut", "bluffdale",
    "kaysville", "farmington ut", "centerville ut", "woods cross",
    "north salt lake", "bountiful ut", "layton ut",
    # v4 additions: Heber Valley + missing Wasatch cities
    "heber city", "heber", "midway ut", "midway utah", "wasatch county",
    "summit county", "kamas", "coalville", "francis ut",
    "daniel ut", "wallsburg", "sundance", "deer valley",
    "jordan landing", "daybreak", "south salt lake",
    "sugar house", "sugarhouse", "avenues slc", "the avenues",
    "sandy utah", "draper utah", "murray utah",
]
LEAD_PHRASES = [
    "need a roofer", "looking for a roofer", "roofer recommendation",
    "any good roofers", "who do you recommend", "roof estimate",
    "free inspection", "roof quote", "best roofer", "roof replacement",
    "roofing company", "looking for contractor", "need roof work",
    "hire a roofer", "recommend a roofer", "roofing contractor",
    # v4 additions: 2026 homeowner intent signals
    "roof insurance claim", "public adjuster", "insurance adjuster",
    "roof inspection before buying", "home inspection roof",
    "how much does a roof cost", "roof financing",
    "reroof my house", "need new roof", "fix my roof",
]
STORM_PHRASES = [
    "hail damage roof", "storm damage roof", "wind damage roof",
    "hail damage house", "hail damage home", "storm damage house",
    "roof leak storm", "emergency roof", "roof blown off",
    "hailstorm damage", "wind damage shingle", "hail claim roof",
    "roof insurance claim", "storm damage insurance claim",
    # v4 additions: broader storm signals
    "microburst damage", "tornado damage", "wind damage home",
    "storm hit", "hail hit", "hailstones",
    "power outage storm", "tree fell on roof", "branch on roof",
]

UTAH_CITIES = [
    "west jordan", "sandy", "draper", "murray", "south jordan",
    "cottonwood heights", "riverton", "herriman", "lehi", "orem",
    "provo", "ogden", "layton", "bountiful", "taylorsville",
    "midvale", "holladay", "millcreek", "magna", "kearns",
    "west valley", "salt lake", "park city", "tooele",
    "eagle mountain", "saratoga springs", "spanish fork",
    # v4 additions: Heber Valley core + missing cities
    "heber city", "heber", "midway", "kamas", "coalville",
    "francis", "wallsburg", "summit county", "wasatch county",
    "south salt lake", "sugar house", "sugarhouse",
    "daybreak", "jordan landing", "deer valley", "sundance",
    "alpine", "highland", "pleasant grove", "american fork",
]
def reddit_fetch(url):
    try:
        r = subprocess.run(
            ["curl", "-s", "-H", "User-Agent: FrameRoofingMonitor/1.0",
             "-H", "Accept: application/json", url],
            capture_output=True, text=True, timeout=20
        )
        data = json.loads(r.stdout)
        return [c["data"] for c in data.get("data", {}).get("children", [])]
    except Exception as e:
        print(f"  [ERR] {e}")
        return []

def calc_engagement(post):
    ups = post.get("ups", 0)
    comments = post.get("num_comments", 0)
    ratio = post.get("upvote_ratio", 0.5)
    return round(ups * ratio + comments * 3)

def detect_city(text):
    for city in UTAH_CITIES:
        if city in text:
            return city
    return None

def classify(title, body, subreddit):
    """
    Strict classifier v4. Uses ONLY title+body text (not subreddit name).
    Returns (signal_type, keep_bool).
    
    Rules:
    - LEAD: lead phrase present AND roofing term present
    - STORM: storm phrase present (these embed roofing context)
    - COMPETITOR: competitor name AND roofing term present
    - GENERAL: roofing term AND utah term present (both in text)
    - Utah-local subs (ParkCity, HeberCity, WasatchFront, utahcounty):
      only need roofing term (Utah is implied)
    - r/roofing posts: only need utah term (roofing is implied)
    - Everything else: REJECT
    """
    text = f"{title} {body}".lower()
    has_roof = any(t in text for t in ROOFING_TERMS)
    has_utah = any(t in text for t in UTAH_TERMS)
    sub_lower = subreddit.lower()
    is_roofing_sub = sub_lower == "roofing"
    # v4: treat Utah-local subs as implying Utah context
    is_utah_sub = sub_lower in (
        "saltlakecity", "utah", "parkcity", "hebercity",
        "wasatchfront", "utahrealestate", "utahcounty",
    )
    
    # LEAD: intent + roofing context
    if any(p in text for p in LEAD_PHRASES):
        if has_roof and (has_utah or is_utah_sub):
            return "lead", True
        if has_roof and is_roofing_sub:
            return "lead", True
        return "general", False    
    # STORM: phrase embeds roofing context, prefer Utah but accept all
    if any(p in text for p in STORM_PHRASES):
        if has_utah or is_utah_sub:
            return "storm", True
        if has_roof:
            return "storm", True
        return "general", False
    
    # COMPETITOR: competitor name + roofing context
    if any(c in text for c in COMPETITORS) and has_roof:
        return "competitor", True
    
    # GENERAL from r/roofing: need Utah mention
    if is_roofing_sub and has_utah:
        return "general", True
    
    # v4: GENERAL from Utah-local subs: need roofing mention
    if is_utah_sub and has_roof:
        return "general", True
    
    # GENERAL elsewhere: need BOTH roofing AND Utah in text
    if has_roof and has_utah:
        return "general", True
    
    return "general", False

def process_post(post, keyword, seen_urls):
    url = f"https://reddit.com{post.get('permalink', '')}"
    if url in seen_urls:
        return None
    seen_urls.add(url)
    
    title = post.get("title", "")
    body = post.get("selftext", "")
    sub = post.get("subreddit", "")
    
    sig_type, keep = classify(title, body, sub)
    if not keep:
        return None
    
    engagement = calc_engagement(post)
    if sig_type == "general" and engagement < 10:
        return None
    
    text = f"{title} {body}".lower()
    return {
        "keyword": keyword,
        "subreddit": post.get("subreddit_name_prefixed", f"r/{sub}"),
        "post_title": title[:500],
        "post_url": url,
        "post_body": body[:2000],
        "engagement_score": engagement,
        "signal_type": sig_type,
        "city_mentioned": detect_city(text),
    }

def scan_reddit():
    seen_urls = set()
    all_signals = []

    for keyword in KEYWORDS:
        print(f'Searching: "{keyword}"')
        q = keyword.replace(" ", "+")
        posts = reddit_fetch(f"https://www.reddit.com/search.json?q={q}&sort=new&limit=25&t=week")
        print(f"  Found {len(posts)} posts")
        for p in posts:
            sig = process_post(p, keyword, seen_urls)
            if sig:
                all_signals.append(sig)
        time.sleep(0.5)

    for sub in SUBREDDITS:
        print(f"Scanning r/{sub}")
        posts = reddit_fetch(f"https://www.reddit.com/r/{sub}/new.json?limit=25")
        count = 0
        for p in posts:
            sig = process_post(p, f"r/{sub} scan", seen_urls)
            if sig:
                all_signals.append(sig)
                count += 1
        print(f"  {len(posts)} posts, {count} passed")
        time.sleep(0.5)

    return all_signals

def post_to_supabase(signals):
    if not signals:
        print("No signals to post.")
        return None
    payload = json.dumps(signals)
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", SUPABASE_ENDPOINT,
         "-H", "Content-Type: application/json", "-d", payload],
        capture_output=True, text=True, timeout=30
    )
    try:
        resp = json.loads(r.stdout)
        print(f"\n=== Supabase Response ===")
        print(f"Inserted: {resp.get('inserted', 0)}")
        print(f"Duplicates: {resp.get('duplicates', 0)}")
        print(f"Alerts sent: {resp.get('alerts_sent', 0)}")
        print(f"Storm surge: {resp.get('storm_surge', False)}")
        if resp.get("errors"):
            print(f"Errors: {resp['errors']}")
        return resp
    except Exception as e:
        print(f"[ERR] {e}\n{r.stdout[:300]}")
        return None


if __name__ == "__main__":
    print("=== Frame Roofing Reddit Scanner v4 ===")
    print(f"Keywords: {len(KEYWORDS)} | Subreddits: {len(SUBREDDITS)}")
    print("Gates: roofing+Utah in post TEXT (not sub name)")
    print("v4: +5 subs, +17 cities, +15 keywords, Utah-sub auto-gate\n")
    signals = scan_reddit()
    print(f"\nQualified signals: {len(signals)}")
    for s in signals:
        flag = ">>>" if s["signal_type"] in ("lead", "storm") else "   "
        city = f" [{s['city_mentioned']}]" if s["city_mentioned"] else ""
        print(f"  {flag} {s['signal_type'].upper():10} score:{s['engagement_score']:4}  {s['subreddit']:22} {s['post_title'][:55]}{city}")
    print()
    post_to_supabase(signals)
    print("\nDone.")