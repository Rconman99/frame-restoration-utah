# Utah Twilio Signature Verification Audit

Scope: current working tree on `fix/twilio-sig-validation-backport` (`c5cde52`), limited to:

- `supabase/functions/_shared/twilio-verify.ts`
- `supabase/functions/handle-sms/index.ts`
- `supabase/functions/handle-call/index.ts`

Reference: Twilio's current security docs specify full URL through query string, sorted POST params concatenated as name+value with no delimiters, HMAC-SHA1 using the primary Auth Token, base64 output, and `X-Twilio-Signature` comparison. GET signatures use the final URL with request params in the query string, not POST params. Source checked: https://www.twilio.com/docs/usage/security

## Per-File Status

| File | Status | Assessment |
| --- | --- | --- |
| `supabase/functions/_shared/twilio-verify.ts` | RESOLVED | Implements Twilio's HMAC-SHA1/base64 algorithm correctly for form POSTs, uses sorted parameter names, handles GET by signing URL only, fails closed for missing auth token and missing signature, and includes the critical `SUPABASE_URL + "/functions/v1" + pathname + search` candidate at lines 73-80. |
| `supabase/functions/handle-sms/index.ts` | PARTIAL | Normal form-urlencoded POSTs are gated before operator/customer writes and Twilio REST calls. `app_config` auth token load is used, missing token fails closed, and unsigned/wrongly signed normal POSTs do not reach CALL/TO/sticky/customer-forward behavior. Remaining issues are GET/malformed request handling and one legitimate outbound-call status callback URL that is now likely rejected. |
| `supabase/functions/handle-call/index.ts` | PARTIAL | Normal form-urlencoded POSTs for inbound, `/status`, and `/completed` are gated before DB writes/TwiML, and missing/empty `TWILIO_AUTH_TOKEN` fails closed. The Supabase `/functions/v1` reconstruction covers live public URLs for inbound and generated child-leg callbacks. Remaining issues are GET handling, trailing-slash routing, and status callback edge cases. |

## Findings

### MED - GET webhooks are not actually supported by the handlers

Files/lines:

- `supabase/functions/handle-sms/index.ts:93`
- `supabase/functions/handle-call/index.ts:118`
- `supabase/functions/_shared/twilio-verify.ts:106-110`

The shared verifier has correct GET-signature logic, but both handlers call `req.formData()` before verification and never parse `url.searchParams` as the business payload. A bodyless GET throws before the verifier can run. In `handle-sms`, the catch block returns `200` empty TwiML at lines 252-254; in `handle-call`, the request errors before any controlled 403. If Twilio Console is ever configured to GET, legitimate signed Twilio traffic can be rejected or mishandled.

Concrete fix: add a single request parsing branch in both handlers:

- For `POST`, parse `req.formData()` and pass those POST params to `verifyTwilioRequest`.
- For `GET`, parse `new URL(req.url).searchParams` for handler data, pass `{}` or the parsed object to `verifyTwilioRequest` knowing the verifier ignores params for GET, and return `403` on verification failure.
- For unsupported content types/methods, return `403` or `405` before the generic SMS catch can return TwiML.

### MED - Operator `CALL` command StatusCallback is now likely rejected

Files/lines:

- `supabase/functions/handle-sms/index.ts:140`
- `supabase/functions/handle-call/index.ts:138-142`

The SMS operator `CALL` path still creates Twilio calls with `StatusCallback: ${SUPABASE_URL}/functions/v1/handle-call` instead of `/handle-call/status`. The new handle-call gate classifies the base path as inbound and enforces `data.To === creds.phone`. For that outbound operator call, Twilio's callback `To` is Landon's phone, not the business Twilio number, so the callback is rejected when `TWILIO_PHONE_NUMBER` is configured. The call itself should still place, but Twilio will see callback 403s and the local `call_logs` row can remain stuck at `initiated`.

Concrete fix: change the operator CALL `StatusCallback` to `${SUPABASE_URL}/functions/v1/handle-call/status` and, ideally, set explicit `StatusCallbackEvent` values. Keep the inbound `To` check only for true inbound TwiML requests.

### LOW - `/status/` and `/completed/` trailing slashes misroute after valid signature

Files/lines:

- `supabase/functions/handle-call/index.ts:115-116`
- `supabase/functions/handle-call/index.ts:138-146`
- `supabase/functions/handle-call/index.ts:202`

Routing uses `url.pathname.split("/").pop()`. A valid Twilio request to `/handle-call/status/` or `/handle-call/completed/` produces an empty final segment, so the handler treats it as inbound. For child-leg callbacks, that can trigger the inbound `To` check and reject a legitimate signed request. Current generated TwiML uses no trailing slash, so this is not expected to break the live line today, but it is fragile.

Concrete fix: normalize before routing, for example:

```ts
const normalizedPath = url.pathname.replace(/\/+$/, "");
const path = normalizedPath.split("/").pop();
```

Then match `handle-call`, `status`, and `completed` after normalization.

### LOW - `<Number statusCallback>` updates likely miss the parent call log row

Files/lines:

- `supabase/functions/handle-call/index.ts:189-190`
- `supabase/functions/handle-call/index.ts:202-214`

The generated child-leg `<Number statusCallback>` URL is correctly signed and should pass the new gate because `/status` skips the inbound `To` check. However, the update path chooses `data.CallSid || data.ParentCallSid`, while `<Number>` status callbacks commonly identify the child leg in `CallSid` and the original inbound call in `ParentCallSid`. The inserted `call_logs` row uses the original inbound `CallSid`, so child-leg `/status` callbacks may verify successfully but update zero rows.

Concrete fix: for `path === "status"`, prefer `ParentCallSid || CallSid`; for `path === "completed"`, keep the parent/original call SID behavior or explicitly use the SID that matches the row inserted on inbound.

## Security Checks

- Signature algorithm: resolved in `_shared/twilio-verify.ts`. The computed sample matches Twilio's published example (`L/OH5YylLD5NRKLltdqwSvS0BnU=`).
- Critical Supabase URL reconstruction: resolved. `candidateUrls()` includes `SUPABASE_URL + "/functions/v1" + pathname + search` at `twilio-verify.ts:73-80`, covering stripped Edge paths like `/handle-call/status`.
- Fail-closed auth/signature behavior: resolved for normal form-urlencoded POSTs. Missing `TWILIO_AUTH_TOKEN`, missing `X-Twilio-Signature`, and signature mismatch return 403 before writes/REST/TwiML in the normal paths.
- `app_config` token load: resolved for normal paths. `handle-call` now loads `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` from `app_config`; a missing/empty token fails closed through `verifyTwilioRequest`.
- Forged normal POSTs: no path found where unsigned or wrongly signed form-urlencoded POSTs can trigger operator SMS, outbound calls, customer forwarding, call log writes, lead creation, or call-forwarding TwiML.
- Live false-reject risk: normal POST inbound SMS/calls and generated `/status` + `/completed` URLs look covered. Risks remain for GET configuration, trailing slash callback URLs, and the operator CALL status callback that still targets the base handle-call URL.
