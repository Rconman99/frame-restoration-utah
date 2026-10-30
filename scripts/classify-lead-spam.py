#!/usr/bin/env python3
"""
Separate real roofing leads from spam, using the local Ollama model ($0/run).

WHY THIS EXISTS
---------------
`leads.status` is owner-maintained and is not kept current. Measured 2026-08-07
in the first Frame market to run this classifier (72 days of production data;
Utah is unmeasured until its first classified month — re-run these numbers
then), the weekly marked-spam rate ran
0%, 0%, 0%, 23%, 54%, 52%, 44%, 0%, 2.7%, 54%, 0% — that is a manual sweep
cadence, not a spam signal; the zero weeks are simply unprocessed. A throwaway
regex over that market's 57 message-bearing leads flagged 18 spam rows the
sweep missed, and only 2 of those 57 showed real roofing intent.

The `leads` table is also not a lead table — it is an inbound communication log.
In that market's 238 rows: 166 were raw inbound calls (no content at all), 48
inbound SMS, and only 24 website form fills. Spam separation therefore needs a
different tactic per channel, which is what CHANNEL HANDLING below implements.

WHY A BATCH JOB AND NOT AN INSERT-TIME HOOK
-------------------------------------------
Supabase edge functions run in Supabase's cloud and cannot reach a local Ollama
on this machine. Classifying on insert would mean a paid hosted model. This runs
locally on a schedule instead, at zero marginal cost. The tradeoff is latency:
a lead is classified on the next run, not the instant it lands. That is fine —
nothing routes off spam_label in real time.

HONESTY RULES (same discipline as the SEO loop)
-----------------------------------------------
- NULL spam_label means NOT CLASSIFIED. It never means "real".
- 'uncertain' is a first-class answer and is used liberally. A lead with no
  content and no call duration is genuinely unknowable; saying so beats guessing.
- Writes go ONLY to the machine-owned spam_* columns. `status` is never touched,
  so this can never fight the CRM UI or an owner's edit.
- A model call that fails or returns unparseable output leaves the row
  unclassified for the next run. It is never defaulted to a label.

USAGE (Utah project only; any other SUPABASE_URL is refused)
    export SUPABASE_URL=https://hdcflshhomzildwqlmwh.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
    python3 scripts/classify-lead-spam.py --dry-run        # classify, print, write nothing
    python3 scripts/classify-lead-spam.py                  # classify unclassified rows
    python3 scripts/classify-lead-spam.py --limit 25
    python3 scripts/classify-lead-spam.py --reclassify     # redo every row (prompt/model change)
    python3 scripts/classify-lead-spam.py --stats          # report only, no model calls
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:8b")

# v2 (2026-08-07): teach the lead-broker case. v1 labelled "we have a few people
# in the area looking to get their roof done" as REAL in two markets — it read
# "roof" plus a casual tone as a customer. Bump the version so a reclassify sweep
# can target rows still carrying @v1.
PROMPT_VERSION = "v2"
CLASSIFIER_ID = f"ollama/{OLLAMA_MODEL}@{PROMPT_VERSION}"

# Answered-call talk time, in seconds. Recording starts on answer
# (record-from-answer-dual), so this is conversation length: a homeowner
# describing a roof runs minutes. Talk time alone never yields 'spam' here.
# Utah's handle-call creates a call lead only after the caller presses one at
# the screening prompt (/connect); robo-dialers and abandons go to voicemail
# with no lead. A short call-only lead is therefore a person who passed the
# gate, not a robocall, so anything under CALL_REAL_MIN_SEC stays 'uncertain'
# (older unscreened rows too: the conservative direction).
CALL_REAL_MIN_SEC = int(os.environ.get("FRAME_SPAM_CALL_REAL_SEC", "45"))

# The prompt and the talk-time rule are Utah's. Every Supabase request is
# refused unless SUPABASE_URL is this project over https, so a stray
# environment can never read another market's leads or label them with Utah
# wording, and the service-role key never goes out in cleartext.
UTAH_PROJECT_REF = "hdcflshhomzildwqlmwh"

# Market identity is parameterised. A 4-market survey (2026-08-07) found the
# first market's hardcoded city wording would mislabel leads in the other three
# — a homeowner in Provo is not out-of-market, but the prompt implied they were.
# Set FRAME_MARKET_DESC per market before running.
MARKET_DESC = os.environ.get(
    "FRAME_MARKET_DESC", "a Utah residential ROOFING contractor "
    "(Frame Roofing Utah, Salt Lake Valley)"
)

# NOT an f-string: the JSON example below contains literal braces. The market is
# substituted with an explicit placeholder so brace-escaping can never silently
# corrupt the output contract.
SYSTEM_PROMPT = """\
You classify inbound messages to __MARKET__.

Return SPAM when the message is anyone selling TO the business, including:
- health/medical insurance offers (PPO, deductible, open enrollment)
- lead-generation vendors offering "qualified homeowners" or "exclusive leads"
- ANYONE offering to SEND, PASS ALONG, or SELL you customers, jobs, appointments
  or work — however casually phrased. "I have a few people in the area looking to
  get their roof done", "got homeowners wanting quotes", "you got space for
  that?", "want me to send them over?" are SPAM, not customers. The tell is that
  the sender is offering OTHER people's work rather than describing their own
  property. A real customer talks about THEIR roof, never about "a few people".
- marketing/SEO/website/AI-automation agencies
- virtual assistant, appointment setter, or offshore staffing offers
- business brokers, investors, acquisition, funding, merchant cash advance
- trademark or domain "someone is registering your name" scams
- solicitations for a DIFFERENT trade (HVAC, plumbing, solar, decks, flooring,
  fencing, landscaping, concrete)
- bulk/blast marketing of any kind

Return REAL only when the sender is a prospective or existing CUSTOMER talking \
about THEIR OWN property: a roof leak, storm or hail damage, shingle or roof \
replacement, an inspection, an estimate, insurance claim help, or scheduling \
and follow-up on their job.

Return UNCERTAIN when there is genuinely not enough signal — a bare greeting, \
an internal message from staff, a wrong number, or an ambiguous fragment. \
Prefer UNCERTAIN over guessing. Do not treat a short message as spam merely \
because it is short.

Respond with ONLY a JSON object, no other text:
{"label": "spam" | "real" | "uncertain", "confidence": <0-1 how sure you are of \
that label>, "reason": "<12 words or fewer>"}

`confidence` is certainty in the label you chose — NOT a spam probability. \
A message you are sure is a real customer is confidence 0.95 with label "real"."""

SYSTEM_PROMPT = SYSTEM_PROMPT.replace("__MARKET__", MARKET_DESC)


def _req(url, method="GET", body=None, headers=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode()
    return json.loads(raw) if raw.strip() else None


def require_utah_project(url):
    parts = urllib.parse.urlsplit(url)
    host = parts.hostname or ""
    if parts.scheme != "https" or host != f"{UTAH_PROJECT_REF}.supabase.co":
        sys.exit(f"ERROR: SUPABASE_URL must be https://{UTAH_PROJECT_REF}"
                 f".supabase.co (the Utah project); refusing host "
                 f"{host or '(none)'!r}")


def sb(path, method="GET", body=None, prefer=None):
    if not SUPABASE_URL or not SERVICE_KEY:
        sys.exit("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    require_utah_project(SUPABASE_URL)
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return _req(f"{SUPABASE_URL}/rest/v1/{path}", method, body, headers)


def fetch_leads(limit, reclassify):
    cols = ("id,created_at,name,email,phone,message,service,city,status,"
            "tier_classifier,source_page,spam_label")
    q = [f"select={cols}", "order=created_at.desc", f"limit={limit}"]
    if not reclassify:
        q.append("spam_label=is.null")
    return sb(f"leads?{'&'.join(q)}") or []


def call_durations(lead_ids):
    """Max answered talk time per lead, from Twilio-written call_logs.

    Returns {} when the market has no call_logs table. Idaho has no handle-call
    function and therefore no call_logs at all; the 4-market survey (2026-08-07)
    found this call would hard-crash there on an unconditional PostgREST 404
    before a single lead got classified. A market without call telemetry should
    degrade to text-only classification, not die.
    """
    if not lead_ids:
        return {}
    ids = ",".join(str(i) for i in lead_ids)
    try:
        rows = sb(
            "call_logs?select=lead_id,duration_seconds,status"
            f"&lead_id=in.({ids})&duration_seconds=not.is.null"
        ) or []
    except urllib.error.HTTPError as e:
        if e.code in (404, 400):  # relation absent -> PGRST205 / PGRST106
            print("  note: no call_logs table in this project — text-only "
                  "classification; call-origin leads stay 'uncertain'",
                  file=sys.stderr)
            return {}
        raise
    out = {}
    for r in rows:
        lid, dur = r.get("lead_id"), r.get("duration_seconds")
        if lid is None or dur is None:
            continue
        out[lid] = max(out.get(lid, 0), int(dur))
    return out


def ask_model(text, meta):
    """Return (label, score, reason) or None when the model is unusable."""
    user = f"Channel: {meta}\nMessage:\n{text.strip()[:1500]}"
    try:
        resp = _req(
            f"{OLLAMA_URL}/api/chat",
            "POST",
            {
                "model": OLLAMA_MODEL,
                "format": "json",
                "stream": False,
                "options": {"temperature": 0},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user},
                ],
            },
            timeout=120,
        )
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"  ! ollama unreachable: {e}", file=sys.stderr)
        return None

    content = ((resp or {}).get("message") or {}).get("content", "")
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        print(f"  ! unparseable model output: {content[:80]!r}", file=sys.stderr)
        return None

    label = str(parsed.get("label", "")).strip().lower()
    if label not in ("spam", "real", "uncertain"):
        return None
    try:
        confidence = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))
    except (TypeError, ValueError):
        confidence = 0.5

    # Derive spam_score (P(spam)) in code rather than asking the model for an
    # inverted scale. The eval caught qwen3:8b returning 0.95 on a message it
    # had just labelled "real" — it was reporting confidence in its own label.
    # Left as-is, a downstream `spam_score > 0.8` filter would have discarded
    # real customers. Deriving it here makes the column mean one thing, always.
    if label == "spam":
        score = confidence
    elif label == "real":
        score = 1.0 - confidence
    else:
        score = 0.5
    return label, round(score, 3), str(parsed.get("reason", ""))[:200]


def classify(lead, duration):
    """(label, score, reason). Content first; fall back to call talk time."""
    msg = (lead.get("message") or "").strip()
    if msg:
        channel = lead.get("tier_classifier") or "form"
        extra = " ".join(
            filter(None, [lead.get("service"), lead.get("email")])
        )
        got = ask_model(msg, f"{channel}{(' | ' + extra) if extra else ''}")
        if got:
            return got
        return None  # model failed -> leave unclassified, retry next run

    # No text at all: a raw inbound call. Talk time is the only signal, and it
    # can only argue for 'real' (see CALL_REAL_MIN_SEC).
    if duration is not None:
        if duration >= CALL_REAL_MIN_SEC:
            return ("real", 0.15,
                    f"answered call, {duration}s talk time")
        return ("uncertain", 0.50,
                f"{duration}s talk time; caller passed press-one screening")

    return ("uncertain", 0.50, "inbound call, no talk time recorded yet")


def write_label(lead_id, label, score, reason):
    sb(
        f"leads?id=eq.{lead_id}",
        "PATCH",
        {
            "spam_label": label,
            "spam_score": round(score, 3),
            "spam_reason": reason,
            "spam_classifier": CLASSIFIER_ID,
            "spam_classified_at": "now()",
        },
        prefer="return=minimal",
    )


def print_stats():
    rows = sb("leads?select=spam_label,status,tier_classifier&limit=10000") or []
    total = len(rows)
    by = {}
    for r in rows:
        by[r.get("spam_label")] = by.get(r.get("spam_label"), 0) + 1
    print(f"\nleads: {total}")
    for k in ("real", "spam", "uncertain", None):
        n = by.get(k, 0)
        pct = f"{100 * n / total:.1f}%" if total else "-"
        print(f"  {str(k or 'UNCLASSIFIED'):<14} {n:>5}  {pct:>7}")

    real = by.get("real", 0)
    if real:
        print(f"\nqualified leads (spam_label='real'): {real}")
        print("Use this, not the raw row count, for any per-market revenue model.")
    unclassified = by.get(None, 0)
    if unclassified:
        print(f"\n{unclassified} rows still unclassified — NOT the same as real.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--dry-run", action="store_true",
                    help="classify and print, write nothing")
    ap.add_argument("--reclassify", action="store_true",
                    help="redo every row, not just unclassified")
    ap.add_argument("--stats", action="store_true",
                    help="report current labels and exit")
    args = ap.parse_args()

    if args.stats:
        print_stats()
        return

    leads = fetch_leads(args.limit, args.reclassify)
    if not leads:
        print("nothing to classify")
        print_stats()
        return

    durations = call_durations([l["id"] for l in leads])
    print(f"classifying {len(leads)} lead(s) with {CLASSIFIER_ID}"
          f"{' [dry-run]' if args.dry_run else ''}\n")

    counts = {"spam": 0, "real": 0, "uncertain": 0, "skipped": 0}
    for lead in leads:
        result = classify(lead, durations.get(lead["id"]))
        if result is None:
            counts["skipped"] += 1
            print(f"  #{lead['id']:<5} SKIPPED (model unavailable) — will retry")
            continue
        label, score, reason = result
        counts[label] += 1
        preview = (lead.get("message") or "(no text — inbound call)")
        preview = " ".join(preview.split())[:58]
        print(f"  #{lead['id']:<5} {label:<9} {score:.2f}  {preview}")
        if reason:
            print(f"         └─ {reason}")
        if not args.dry_run:
            write_label(lead["id"], label, score, reason)

    print(f"\nspam={counts['spam']}  real={counts['real']}  "
          f"uncertain={counts['uncertain']}  skipped={counts['skipped']}")
    if args.dry_run:
        print("dry-run: nothing written")
    else:
        print_stats()


if __name__ == "__main__":
    main()
