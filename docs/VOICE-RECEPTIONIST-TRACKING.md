# Lead-first receptionist and screening readout

Approved scope (2026-09-10): Landon/Utah and Connor/Texas. Tyler/Idaho is excluded.
This document describes source behavior, not proof of production deployment.

## Caller script

“Hi, thanks for calling Frame Restoration. I'm the team's virtual assistant. How can we help you today?”

A volunteered name and service need go straight to the private owner screen.
Otherwise a clear service request gets one optional “Got it. Who am I speaking with?”
Then: “Thanks, [name]. Let me try [Landon/Connor] for you.”
Urgent property requests and an explicit request for a human skip the name question.
A missing name never prevents transfer.

An unclear request gets one “Sure—what's the call about?” then routes to private
owner screening after any response. Silence gets one “You can press one to leave
a message. Otherwise, what can we help you with?” then voicemail. Keypad one
requests voicemail at any caller screening step.

Only explicit solicitation patterns trigger “We're not taking sales calls on
this line. Thanks for understanding. Goodbye.” A roofing keyword does not exempt
an explicit pitch for roofing leads. This is a conservative rules-based screen,
not a claim that every solicitor will be caught.

Private owner message: “Frame call. [Name], calling about [reason]. Press one to
connect, or two to send to voicemail.” Two never writes the permanent blocklist.
No answer: “[Owner] couldn't pick up. Please leave your name, the best number to
reach you, and a message after the beep.”

The existing Chirp Aoede caller voice and Joanna Neural private whisper remain.
Known trusted customers retain direct ringing. Caller ID, destinations, owned
numbers, source attribution, SMS and fallback webhooks are not reconfigured.

## What gets tracked

`call_screenings` stores the script version, bounded assistant/caller turns,
timestamp and available speech-recognition confidence, decision reason, owner
decision, explicit provider bridge proof, voicemail receipt and optional human
review. It joins the existing `call_logs` row by CallSid and therefore its linked
CRM lead and dialed-number source.

These are **assistant screening transcripts only**, not a transcription of the
owner's conversation. Caller turns are speech-recognition output, not verified
identity or job facts. Assistant turns are prompts the server emitted, not proof
the caller heard every word. No new recording or full-call transcription is
enabled, no historical recordings are processed, and existing recording/voicemail
settings are unchanged.

The aggregate `call_screening_daily` view distinguishes unfinished/unknown,
system decline, transfer request, owner acceptance, confirmed bridge/non-bridge,
voicemail and human-reviewed mistakes. A missing callback is unknown, never
silently counted as a successful connection or spam. Counts cover screened calls,
not trusted direct-ring customers, blocked-list calls, every inbound attempt,
booked jobs or revenue.

## CRM refinement

A newly created owner-accepted lead receives the caller-reported name when
available and a labelled screening reason in notes; it starts as `new`.
Existing human-maintained name/notes are not overwritten. Call linkage preserves
additional screening context without duplicate note append on every retry.
Landon's handler promotes a linked new lead to contacted only on explicit bridge
proof. Caller-ID locality is not a service address; confirm location with the
customer. No classifier changes a lead to spam, estimates job value, promises
availability or changes commission attribution.

Texas's retired shared-key CRM endpoint stays retired. This increment does not
add a transcript browser or expose private data through that endpoint.

## Private operator readout

Use the existing authenticated Supabase CLI, without copying keys into a command:

```sh
node scripts/voice-screening-report.mjs utah --days 7
node scripts/voice-screening-report.mjs texas --days 7
```

An exact private call can be inspected with `--call CA...` in place of `--days`.
That command deliberately reveals caller text in the local operator terminal.
Never paste it into GitHub, public analytics, shared context, tickets or this repo.
The default aggregate report contains no transcript or caller phone number.
The script is read-only and fails if access/schema/output is unavailable.

Human review is optional, private database-operator work: set `review_label` to
`customer`, `existing_relationship`, `solicitation` or `unknown`, together with
`reviewed_by`, `reviewed_at` and optional bounded `review_notes`.
Do not label a reviewed outcome from the classifier's own decision alone.
“Customer declined” and “sales call bridged” counts require this independent label.

Both new relations revoke PUBLIC/anon/authenticated access; service role only.
No browser service key, new public endpoint or scheduled export is introduced.
Parent call deletion cascades to the trace. No new automatic retention period
is claimed: apply the business's approved private call-log retention policy.
Full-call transcription or wider CRM access needs separate privacy/access design.

## Measurement and refinement

Start by reviewing all system declines and a balanced sample of transfers,
no-input and voicemail screenings. Keep customer false declines highest priority.
Compare by script version and market/source, watch unfinished screenings and
confirmed bridges, and use actual CRM outcomes for qualified/booked jobs.
Do not optimize merely for fewer calls reaching the owner, count an owner keypress
as a conversion, or publish a conversion-lift claim from a small/unlabelled sample.
Record the date/sample size and caller feedback before changing a rule.

## Release and rollback

Run the new Voice screening contracts CI plus existing blocking market checks.
Obtain a different-lane review of the exact release SHA. The new migration must
be admitted/applied **before** the handler through the market's approved release
process, with an exclusive migration-writer window and migration-history receipt.
Never run the full historical migration tree or bypass production deploy gates.
For Utah, the existing `handle-call/DEPLOY.md` workflow-only, exact-main and
green-compliance requirements continue to apply; do not substitute direct CLI
deployment. The client-IP receipt verifier protects `handle-lead` and
`lead-crm`, not `handle-call`. No signed client-IP receipt is required for
this phone release. The workflow still requires its nonce input syntactically;
use a descriptive run identifier for this non-protected function, not a
fabricated receipt. Keep the protected-function verifier unchanged.

Release only `handle-call` and its imported shared modules. Download/diff deployed
source before and after. Preserve pre-release source for an authorized rollback;
keep the additive private table and evidence if rolling the handler back.
Legacy Gather callbacks remain for in-flight calls.

The exact-prefix migration runner is `scripts/voice-screening-migration.mjs`.
After review, merge, and green exact-main checks, use a clean checkout of that
main SHA and claim the market's exclusive migration-writer window. Set
`RELEASE_SHA` and `VOICE_MIGRATION_EXCLUSIVE_WRITER_ACK` to that full SHA,
and `SUPABASE_BIN` to the verified official macOS arm64 CLI 2.113.0 binary
(SHA-256 `ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a`).
It uses the existing macOS Supabase Keychain profile, never newly issued keys.
Run `node scripts/voice-screening-migration.mjs utah preflight`, then
the same command with `apply` in a fresh process after a successful preflight.
Retain both private receipt directories. The runner accepts only the reviewed
history, installs throwing guards in place of historical SQL, and admits only
`20260910200000_call_screenings.sql`. It verifies history and private grants
afterward. On any failure stop; do not repair history, substitute a raw mutation
query, or replay the baseline. This runner never deploys an edge function.

A merge/check/deployed-source match is not an audible end-to-end call test.
A natural or separately approved human call must confirm greeting, real voice,
owner acceptance, voicemail, caller-ID forwarding and final private trace/CRM link.
