// Inbound SMS/MMS fallback handler.
//
// Twilio calls this ONLY when the primary webhook (handle-sms) fails to return
// valid TwiML — a 5xx, a timeout, or a connection failure. Twilio does NOT
// retry the primary webhook: this single call is the only second chance the
// message gets. Without a fallback configured, an inbound lead (and any photo
// attached to it) is silently dropped.
//
// DESIGN RULE: this function is deliberately dependency-free. No Supabase
// client, no app_config read, no DB write, no shared imports. Every dependency
// is something that can take this function down at exactly the moment the
// primary handler is already down. It does one thing: get the customer's words
// in front of Landon.
//
// Auth: deployed with --no-verify-jwt so Twilio can reach it, so the configured
// URL carries a shared secret (?k=). Without it this endpoint would let anyone
// send SMS to Landon on demand. Signature validation would be stronger, but it
// requires reading the Twilio auth token from app_config — reintroducing the
// database dependency this function exists to avoid.

import {
  buildFallbackTwiml,
  tokenMatches,
} from "./message.ts";

const FALLBACK_TOKEN = Deno.env.get("SMS_FALLBACK_TOKEN") || "";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!tokenMatches(FALLBACK_TOKEN, new URL(req.url).searchParams.get("k") || "")) {
    return new Response("Not Found", { status: 404 });
  }

  const fields: Record<string, string> = {};
  try {
    const form = await req.formData();
    form.forEach((value, key) => {
      fields[key] = value.toString();
    });
  } catch (_) {
    // A malformed body must not stop the relay — send what we can.
  }

  // Surfaces in Supabase logs; ErrorCode/ErrorUrl say why the primary failed.
  console.error("[sms-fallback] primary handler failed", {
    errorCode: fields.ErrorCode || null,
    errorUrl: fields.ErrorUrl || null,
    from: fields.From || null,
    numMedia: fields.NumMedia || "0",
  });

  const twiml = buildFallbackTwiml({
    from: fields.From,
    body: fields.Body,
    numMedia: fields.NumMedia,
    errorCode: fields.ErrorCode,
  });

  return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
});
