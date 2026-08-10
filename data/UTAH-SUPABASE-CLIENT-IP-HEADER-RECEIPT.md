# Utah Supabase Client-IP Header-Shape Receipt

Status: **INVALID — historical observation only; rollout remains blocked.**

This Markdown file is never read by the production deployment verifier and no
edit to it can authorize rollout. Current authorization requires the short-lived
HMAC token issued and installed through the exact procedure in
`supabase/functions/handle-lead/DEPLOY.md`.

The prior canary receipt is retained below for audit, but it does not authorize
deployment. Its recorded canary digest was not the SHA-256 of the frozen shared
extractor now used by both dashboard login and lead intake. A replacement must
exercise the exact deployed probe bundle containing
`supabase/functions/_shared/client-ip.ts` SHA-256
`3e69a5e29a473c2697b3271e68ffead3cd427bc012383eae8cc97c3998458636`,
record the Supabase function version/bundle digest, and repeat the baseline plus
forged-header checks before either protected function is deployed.

This is a mandatory pre-rollout receipt for the dashboard-login and public
lead-intake throttles. It records header *shape only*. Never record an IP value,
HMAC secret, credential, request body, or homeowner data here.

## Acceptance contract

The shared extractor accepts only `cf-connecting-ip` with one canonical IPv4
or IPv6 value. Live tests proved that this header is gateway-owned on the Utah
Supabase path. `x-real-ip` and `x-forwarded-for` are diagnostic-only and must
never be used as throttle identity fallbacks.

If the gateway does not supply a canonical single `cf-connecting-ip`, the
request has unresolved identity and the protected endpoint fails closed. It
must not put unrelated visitors into a shared throttle bucket.

## Capture procedure

1. Deploy the candidate function to a non-public canary/immutable version behind
   the same Supabase gateway. Do not switch the production form or dashboard.
2. Send one operator-controlled request over IPv4 and, when available, one over
   IPv6. Use no homeowner data.
3. From Supabase function logs, record only the extractor's selected source and
   whether each candidate header was absent, canonical-single, chain, or
   malformed. Redact all values before pasting evidence.
4. Confirm the stored throttle key is exactly 64 lowercase hex characters and
   contains no raw address. Delete the canary rows after recording counts.
5. Have a second operator review and sign this receipt before rollout.

## Live observation

- Project ref: `hdcflshhomzildwqlmwh`
- Candidate base commit: `ef612a0f8af68512621b2e11b33395f622e5e636`
- Canary source SHA-256: `152397bb5d30a5632b77ee857ce511808d2f4bdfcfa8781fc4bd9c639b349a3e`
- Function/version: ephemeral `client-ip-probe` version 1; deleted after capture
- Observed at (UTC): `2026-08-07T18:00:00Z`–`2026-08-07T18:05:00Z`
- Network path: IPv4 [x] IPv6 [x]
- `cf-connecting-ip`: absent [ ] canonical-single [x] malformed [ ]
- `x-real-ip`: absent [x] canonical-single [ ] malformed [ ]
- `x-forwarded-for`: absent [ ] canonical-single [ ] chain [x] malformed [ ]
- Selected source: `cf-connecting-ip` [x] unresolved [ ]
- Stored key shape verified as 64 lowercase hex, with no raw IP: [x]
- Raw values excluded from this receipt and logs/transcript: [x]
- Operator: Codex `/root`
- Independent reviewer: rejected because the receipt was not bound to the final
  shared extractor digest
- Rollout decision: PASS [ ] BLOCK [x]

## Forgery checks

The same canary was invoked with documentation-range test values. No IP values
were emitted or retained.

- A caller-supplied `cf-connecting-ip` request was rejected by the gateway with
  HTTP 403 before the function ran.
- A caller-supplied `x-real-ip` was absent inside the function; the selected CF
  identity fingerprint was unchanged from baseline.
- A caller-supplied `x-forwarded-for` arrived only as a chain; the selected CF
  identity fingerprint was unchanged from baseline.
- Both IPv4 and IPv6 transport paths produced the same safe header shapes and
  selected `cf-connecting-ip`.

## Cleanup proof

After capture, `supabase functions list` contained no `client-ip-probe`, and
`supabase secrets list` contained neither `CLIENT_IP_PROBE_TOKEN` nor
`CLIENT_IP_PROBE_HMAC`. The local canary source is removed before commit.
