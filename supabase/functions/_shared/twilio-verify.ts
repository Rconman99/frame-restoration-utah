// Twilio request signature validation for Frame Roofing Utah webhooks.
// ─────────────────────────────────────────────────────────────────────────────
// Every public edge function that Twilio POSTs to (handle-sms, handle-call,
// and the deploy-only outbound-call) MUST verify the `X-Twilio-Signature`
// header BEFORE any DB write or Twilio REST call. Without this, anyone who can
// reach the function can spoof Landon (From=+14353024422) and make the business
// line text/call arbitrary numbers, billed to the account (CRITICAL).
//
// Algorithm (https://www.twilio.com/docs/usage/webhooks/webhooks-security):
//   signature = Base64( HMAC-SHA1( authToken, signedString ) )
//   • POST: signedString = fullUrl + concat( name + value ) for ALL POST params
//     sorted alphabetically by name.
//   • GET:  signedString = fullUrl (query string already included), no params.
// We compare in constant time.
//
// URL reconstruction is the fragile part: Twilio signs the EXACT URL it called,
// which may differ from `req.url` behind a proxy. We build candidate URLs and
// accept if ANY produces a matching signature (so legitimate Twilio traffic is
// never falsely rejected and the live relay can't break on a host/proto mismatch).
//
// UTAH ADAPTATION: Utah stores TWILIO_AUTH_TOKEN in the `app_config` table, not
// in `Deno.env`. So this verify accepts the authToken as a PARAMETER — the
// handler loads it from app_config and passes it in. SUPABASE_URL is still read
// from env (Supabase auto-sets it) for the candidate-URL logic.

const encoder = new TextEncoder();

// Build the Twilio-signed string for a given full URL + POST params.
function buildSignedString(fullUrl: string, params: Record<string, string>): string {
  // For POST: append params sorted alphabetically by name (name + value, no separators).
  const keys = Object.keys(params).sort();
  let signed = fullUrl;
  for (const k of keys) signed += k + params[k];
  return signed;
}

async function hmacSha1Base64(authToken: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  // Base64-encode the raw signature bytes.
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Constant-time string comparison (no early return on first mismatch).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Candidate full URLs Twilio may have signed.
function candidateUrls(req: Request): string[] {
  const reqUrl = new URL(req.url);
  const supaBase = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const path = reqUrl.pathname;
  const search = reqUrl.search;
  const out = new Set<string>();
  // Candidate: req.url verbatim.
  out.add(req.url);
  if (supaBase) {
    // Candidate: public SUPABASE_URL origin + path + query.
    out.add(supaBase + path + search);
    // CRITICAL: Supabase Edge strips the `/functions/v1` mount prefix from
    // req.url (pathname arrives as `/handle-call`, not `/functions/v1/handle-call`),
    // but Twilio signs the PUBLIC webhook URL which INCLUDES `/functions/v1`.
    // Without this candidate, every genuine Twilio request is rejected (403).
    // Verified empirically against the deployed TX function 2026-06-08.
    if (!path.startsWith("/functions/v1")) {
      out.add(supaBase + "/functions/v1" + path + search);
    }
  }
  return [...out];
}

/**
 * Validate an incoming Twilio request.
 *
 * @param req       the incoming Request (used for URL + signature header only;
 *                  the body must already be consumed by the caller)
 * @param params    the already-parsed POST form params (the caller reads the body
 *                  ONCE via req.formData() and passes the resulting object here —
 *                  a Request body can only be read a single time)
 * @param authToken the Twilio auth token, loaded by the caller from the
 *                  `app_config` table (Utah does NOT keep it in Deno.env)
 */
export async function verifyTwilioRequest(
  req: Request,
  params: Record<string, string>,
  authToken: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!authToken) return { ok: false, reason: "auth-token-unset" }; // fail closed

  const provided = req.headers.get("X-Twilio-Signature") || "";
  if (!provided) return { ok: false, reason: "missing-signature" };

  const isGet = req.method.toUpperCase() === "GET";
  for (const fullUrl of candidateUrls(req)) {
    // GET: signedString is just the full URL (query already in it), no params.
    const signedString = isGet ? fullUrl : buildSignedString(fullUrl, params);
    const expected = await hmacSha1Base64(authToken, signedString);
    if (timingSafeEqual(expected, provided)) return { ok: true };
  }
  return { ok: false, reason: "signature-mismatch" };
}
