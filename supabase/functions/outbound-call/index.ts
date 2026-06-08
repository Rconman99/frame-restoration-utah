// outbound-call — Frame Roofing Utah
// ─────────────────────────────────────────────────────────────────────────────
// Click-to-call bridge for the operator "CALL <number>" SMS command. Ported to
// the repo from TX (Utah's was deployed-only) and hardened to match.
//
// Flow: handle-sms receives "CALL 8015551234" from Landon → places a Twilio call
// From=<business #> To=<Landon>, with this function as the answer URL:
//   <project>.supabase.co/functions/v1/outbound-call?customer=<E164>&twilio_number=<E164>
// When Landon answers, Twilio fetches this URL (POST) and we return TwiML that
// dials the customer with the BUSINESS number as caller ID — so the customer sees
// the business line, not Landon's personal phone.
//
// Hardening (CODEX audit, parity with TX):
//   • validate the Twilio X-Twilio-Signature (POST; query string is part of the
//     signed URL) and reject 403 — without this, any active Twilio call or a
//     leaked/replayed URL could bridge attacker-supplied numbers, billed to us;
//   • require `customer` to be strict E.164 US (+1XXXXXXXXXX), else <Say>+hangup;
//   • REJECT unless `twilio_number` === the owned business number (never dial a
//     signed-but-mismatched request).
// Utah note: TWILIO_AUTH_TOKEN + business number live in the `app_config` table,
// not Deno.env, so we load them and pass the auth token to verifyTwilioRequest.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyTwilioRequest } from "../_shared/twilio-verify.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function escapeXml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Strict US E.164: +1 followed by exactly 10 digits. Returns null otherwise.
function strictE164US(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

const xmlResponse = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });

const forbidden = () =>
  new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/plain" } });

async function getTwilioCreds() {
  const { data } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"]);
  const cfg: Record<string, string> = {};
  data?.forEach((r: { key: string; value: string }) => { cfg[r.key] = r.value; });
  return { auth: cfg.TWILIO_AUTH_TOKEN, phone: cfg.TWILIO_PHONE_NUMBER };
}

Deno.serve(async (req: Request) => {
  // Read POST params (Twilio answer-URL POST carries the call params) so we can
  // verify the signature against the SAME body. Unsigned direct browser GETs fail.
  const params: Record<string, string> = {};
  if (req.method.toUpperCase() === "POST") {
    try {
      const formData = await req.formData();
      formData.forEach((value, key) => { params[key] = value.toString(); });
    } catch {
      // No/!form body — leave params empty; verification uses just the URL.
    }
  }

  const creds = await getTwilioCreds();

  // ─── Twilio signature gate (CODEX) ─────────────────────────────────────────
  const verify = await verifyTwilioRequest(req, params, creds.auth);
  if (!verify.ok) {
    console.warn("[outbound-call] rejected request:", verify.reason);
    return forbidden();
  }

  const url = new URL(req.url);
  const customer = strictE164US(url.searchParams.get("customer") || "");
  const twilioNumber = (url.searchParams.get("twilio_number") || "").trim();

  if (!customer) {
    return xmlResponse(`<Say>No valid customer number was provided. Goodbye.</Say>`);
  }

  // callerId must be the owned business number. If twilio_number doesn't match,
  // REJECT rather than dial — a signed-but-mismatched request should never bridge
  // a call (CODEX MED).
  if (!creds.phone || twilioNumber !== creds.phone) {
    return xmlResponse(`<Say>This call could not be completed. Goodbye.</Say>`);
  }

  return xmlResponse(
    `<Dial callerId="${escapeXml(twilioNumber)}" timeout="30" record="record-from-answer-dual"><Number>${escapeXml(customer)}</Number></Dial>`,
  );
});
