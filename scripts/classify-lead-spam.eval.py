#!/usr/bin/env python3
"""
Eval for the lead spam classifier prompt, against REAL production messages.

Run locally (needs Ollama): python3 scripts/classify-lead-spam.eval.py

Deliberately NOT wired into .github/workflows/compliance-gate.yml — CI has no
Ollama and no local model. Run it whenever SYSTEM_PROMPT or OLLAMA_MODEL changes;
a prompt edit that regresses this set is a prompt edit that should not ship.

Cases are drawn verbatim (lightly truncated, names kept as sent) from the TX
`leads` table, 2026-05-27..2026-08-06. Every one of the SPAM cases below was
sitting UNMARKED in production — the manual sweep had not caught them.
"""

import importlib.util
import pathlib
import sys

_spec = importlib.util.spec_from_file_location(
    "classifier", pathlib.Path(__file__).with_name("classify-lead-spam.py")
)
classifier = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(classifier)

# (expected_label, channel, message). "uncertain" cases accept real|uncertain
# but never spam — mislabelling a possible customer as spam is the costly error.
CASES = [
    ("spam", "sms", "Hi, this is Mya. Want a private PPO quote from BCBS or UHC? Low deductible, tax-deferred plans for the self-employed"),
    ("spam", "sms", "Thanks for using BuildZoom! Click to verify this phone # to begin receiving leads: https://www.buildzoom.com/s"),
    ("spam", "sms", "Hi Framerestoration, This is Bill. Are you interested in hiring an Appointment Setter/VA for your Roofing business"),
    ("spam", "sms", "Hey, it's Bella with Policy Pros! New private health plans are available for self-employed individuals. Reply for a quote"),
    ("spam", "sms", "What's 1 lost job cost you? $1,500+. 15-pg site + AI text-back so you never miss a call. 1 extra job pays for it"),
    ("spam", "sms", "Hey, Zoe here, Got a few homeowners in your area requesting quotes for deck projects this week. Wanted to see if you want them"),
    ("spam", "sms", "Hello, this is Alex Wilson. A third party has expressed interest in trademarking Frame Restoration. If you've got rights"),
    ("spam", "sms", "Hey Frame Restoration! I'm a business broker and I have serious investors looking to business doing over 150k/yr"),
    ("spam", "sms", "Hello, I saw your details online as a good hardwood floor installer, I need some work done. Send your email for details"),
    ("spam", "sms", "Frame Restoration any room for more hvac jobs in Sandy? I have qualified homeowners needing quotes. No setup fee"),
    ("spam", "sms", "Hi! :) There are new health insurance options for Architects w/ $0 deductibles. Would you like a quote?"),
    ("spam", "sms", "Hi Mike, Liamgo launches next month and we're onboarding local handyman and home-service providers now."),
    # Lead-broker pitches. Both of these shipped as "real" on 2026-08-07 — the
    # model read "roof" + casual tone as a customer. The tell is that the sender
    # offers OTHER people's work; a real customer describes their own property.
    # These are the exact production messages that exposed the blind spot.
    ("spam", "sms", "Hey it's Princeten, we may have a few people looking to have their roof done & possibly some guttering. You guys got space for that?"),
    ("spam", "sms", "Hey it's Kingsley, we have a few people in the area looking to get their roofs done, do you have capacity this month?"),
    ("spam", "sms", "Logan here. I'm looking for one roofer to send exclusive estimate requests to in your area. $85 per qualified lead, nothing upfront."),
    ("real", "sms", "Hello. This is Robert Swigart. I would like to know if I have reached the right contact for a roof replacement"),
    ("real", "sms", "Hi Landon.. Just keeping you updated.. Roof inspector is going to contact me in 1-2 days and I will then coordinate"),
    ("real", "form", "We had hail last week and I think our roof is leaking in the garage. Can someone come look at it?"),
    ("uncertain", "sms", "Hello! Trying to get ahold of Mike or Matt"),
    ("uncertain", "sms", "Is this David?"),
    ("uncertain", "sms", "fyi, just received this today"),
]


def main():
    print(f"eval: {classifier.CLASSIFIER_ID}  ({len(CASES)} cases)\n")
    passed = failed = 0
    costly = []  # real/uncertain wrongly called spam — the expensive direction

    for expected, channel, msg in CASES:
        got = classifier.ask_model(msg, channel)
        if got is None:
            print(f"  ERROR  model unavailable — is Ollama running?")
            sys.exit(2)
        label, score, reason = got

        if expected == "uncertain":
            ok = label in ("real", "uncertain")
        else:
            ok = label == expected

        # spam_score must always mean P(spam), regardless of what the model
        # reports. An earlier prompt asked the model for it directly and it
        # returned 0.95 on messages it had labelled "real" — a downstream
        # `spam_score > 0.8` filter would have dropped real customers.
        if ok:
            if label == "spam" and score < 0.5:
                ok = False
                print(f"        └─ SCORE INVERTED: spam with score {score}")
            elif label == "real" and score > 0.5:
                ok = False
                print(f"        └─ SCORE INVERTED: real with score {score}")

        if ok:
            passed += 1
            mark = "PASS"
        else:
            failed += 1
            mark = "FAIL"
            if expected in ("real", "uncertain") and label == "spam":
                costly.append(msg[:60])

        print(f"  {mark}  want={expected:<9} got={label:<9} {score:.2f}  "
              f"{' '.join(msg.split())[:52]}")
        if not ok:
            print(f"        └─ model said: {reason}")

    total = passed + failed
    print(f"\n{passed}/{total} passed ({100 * passed / total:.0f}%)")

    if costly:
        print(f"\n{len(costly)} COSTLY failure(s) — a real/ambiguous customer "
              f"labelled spam:")
        for c in costly:
            print(f"  - {c}")
        print("Fix the prompt before shipping; losing a customer beats "
              "leaving spam unfiltered.")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
