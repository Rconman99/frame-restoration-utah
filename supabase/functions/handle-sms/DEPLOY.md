# Utah SMS analytics latency hardening — September 17, 2026

Ryan approved removing the analytics wait from SMS forwarding. This changes
handle-sms only: best-effort PostHog runs through EdgeRuntime.waitUntil with a
two-second abort deadline, outside the response-critical path. Failure cannot
prevent returning forwarding TwiML. No database operation is moved into the
background. Photos, auth, CRM, dedupe, opt-out and operator routing are preserved.

Release only reviewed exact main after every blocking check passes, including
signed stalled-analytics SMS/MMS fixtures. Use deploy-edge-function.yml for
handle-sms only after exact-main Compliance succeeds; its phone-function nonce
is a descriptive run identifier, not a protected form/CRM client-IP receipt.
No migration, number configuration, SMS test send, voice deploy or other-market
change is part of this release. Read back deployed source and dependencies.

The measured September17 text took8 seconds from Twilio inbound creation to
its final delivered-status update. That receipt does not prove handset display
time. This patch removes a confirmed latency risk; it does not establish the
cause of the reported two-minute delay or guarantee end-to-end carrier latency.
Handset SMS/MMS timing remains a separate human verification step.
