// handle-sms v5 — Frame Roofing Utah
// ─────────────────────────────────────────────────────────────────────────────
// v5 (2026-05-16): Auto-create a leads row on first inbound SMS from a
//   previously-unseen customer phone number. Doesn't create leads for
//   messages from Landon (those are operator commands, not customer intent).
//
// Inbound SMS flow (customer side):
//   1. Twilio webhooks the tracking number → this fn
//   2. Insert sms_logs row (existing behavior)
//   3. If no leads row with same phone in last 90d → create one
//      (status=new, source_page=inbound-sms, message=body)
//   4. Set sms_logs.lead_id pointer
//   5. Forward message to Landon (existing behavior)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyTwilioRequest } from "../_shared/twilio-verify.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LANDON_PHONE = "+14353024422";
const POSTHOG_KEY = "phc_BnECzlZ2OeDujli2dbqcgGODXlv2tYERbp40dTF7UBV";
const OUTBOUND_CALL_URL = `${SUPABASE_URL}/functions/v1/outbound-call`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function normalizePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length > 10) return "+" + digits;
  return phone || "";
}

function lastFour(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.slice(-4) || "????";
}

async function findRecentLead(phone: string): Promise<number | null> {
  if (!phone) return null;
  // Build .or() candidates ONLY from strictly digit-validated forms so a forged
  // From value can't inject PostgREST operator syntax into the filter (CODEX MED).
  const ten = (phone || "").replace(/\D/g, "").slice(-10);
  if (!/^\d{10}$/.test(ten)) return null;
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data } = await supabase
    .from("leads")
    .select("id")
    .or(`phone.eq.+1${ten},phone.eq.${ten},phone.ilike.%${ten}`)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);
  return data && data.length ? data[0].id : null;
}

async function createInboundSmsLead(fromNumber: string, body: string): Promise<number | null> {
  if (!fromNumber) return null;
  const preview = (body || "").slice(0, 500);
  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: `Inbound SMS — ${lastFour(fromNumber)}`,
      phone: normalizePhone(fromNumber),
      message: preview,
      source_page: "inbound-sms",
      status: "new",
      tier: "general",
      tier_classifier: "auto-inbound-sms",
      tier_reason: "Auto-created by handle-sms on first SMS from this number",
      notes: "Auto-created from inbound SMS. Reply via /leads or text 'TO:" + lastFour(fromNumber) + " message' from Landon's phone.",
    })
    .select("id")
    .single();
  if (error) {
    console.error("[handle-sms] lead insert failed:", error);
    return null;
  }
  return data?.id ?? null;
}

async function getTwilioCreds() {
  const { data } = await supabase.from("app_config").select("key, value").in("key", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MESSAGING_SERVICE_SID", "TWILIO_PHONE_NUMBER"]);
  const config: Record<string, string> = {};
  data?.forEach((r: any) => { config[r.key] = r.value; });
  return { sid: config.TWILIO_ACCOUNT_SID, auth: config.TWILIO_AUTH_TOKEN, msgServiceSid: config.TWILIO_MESSAGING_SERVICE_SID, phone: config.TWILIO_PHONE_NUMBER };
}

function escapeXml(str: string): string {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

Deno.serve(async (req: Request) => {
  try {
    const formData = await req.formData();
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const body = (formData.get("Body") as string || "").trim();
    const messageSid = formData.get("MessageSid") as string;

    // ─── SECURITY GATE: verify Twilio signature BEFORE any DB write / REST call.
    // Build params from the already-consumed body (a Request body reads once).
    const params: Record<string, string> = {};
    formData.forEach((v, k) => { params[k] = v.toString(); });

    // Load Twilio creds from app_config (auth token + business number) up front;
    // the operator path below reuses these instead of re-loading.
    const creds = await getTwilioCreds();

    const v = await verifyTwilioRequest(req, params, creds.auth);
    if (!v.ok) {
      console.warn("[handle-sms] rejected Twilio request:", v.reason);
      return new Response("Forbidden", { status: 403 });
    }
    // AccountSid must match our account when both are present.
    if (params.AccountSid && creds.sid && params.AccountSid !== creds.sid) {
      return new Response("Forbidden", { status: 403 });
    }
    // Only enforce the To-check when a business number is configured in app_config
    // (skip if the TWILIO_PHONE_NUMBER key is absent, to avoid breaking the line).
    if (creds.phone && params.To !== creds.phone) {
      return new Response("Forbidden", { status: 403 });
    }

    const isFromLandon = from === LANDON_PHONE;

    // ─── OPERATOR PATH (Landon) — unchanged from v4 ────────────────────────
    if (isFromLandon) {
      const { sid: twilioSid, auth: twilioAuth, msgServiceSid } = creds;
      const twilioNumber = to;

      const callMatch = body.match(/^CALL\s*(\+?\d{10,15})$/i);
      if (callMatch) {
        const customerNumber = callMatch[1].startsWith("+") ? callMatch[1] : "+1" + callMatch[1];

        if (twilioSid && twilioAuth) {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`;
          const callBody = new URLSearchParams({
            From: twilioNumber,
            To: LANDON_PHONE,
            Url: `${OUTBOUND_CALL_URL}?customer=${encodeURIComponent(customerNumber)}&twilio_number=${encodeURIComponent(twilioNumber)}`,
            StatusCallback: `${SUPABASE_URL}/functions/v1/handle-call/status`,
          });

          const callRes = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Authorization": "Basic " + btoa(`${twilioSid}:${twilioAuth}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: callBody.toString(),
          });
          const callData = await callRes.json();

          await supabase.from("call_logs").insert({
            call_sid: callData.sid || `outbound-${Date.now()}`,
            from_number: twilioNumber,
            to_number: customerNumber,
            forwarded_to: LANDON_PHONE,
            status: "initiated",
            notes: "Outbound call via SMS command",
          });

          return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Calling ${customerNumber} now. Your phone will ring shortly.</Message></Response>`, { headers: { "Content-Type": "text/xml" } });
        }
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Error: Twilio creds not found.</Message></Response>`, { headers: { "Content-Type": "text/xml" } });
      }

      let customerNumber: string | null = null;
      let messageBody = body;

      const toMatch = body.match(/^TO:\s*(\+?\d{10,15})\s+(.+)$/is);
      if (toMatch) {
        customerNumber = toMatch[1].startsWith("+") ? toMatch[1] : "+1" + toMatch[1];
        messageBody = toMatch[2];
      } else {
        // Guarded sticky reply (CODEX HIGH): only auto-route a plain reply when
        // exactly ONE customer conversation is active in the last 30 min. 2+
        // active → require TO:; none active → require TO: (don't text a stale
        // customer from an old all-time conversation).
        const windowStart = new Date(Date.now() - 30 * 60000).toISOString();
        const { data: recent } = await supabase
          .from("sms_conversation_map")
          .select("customer_number")
          .gte("last_message_at", windowStart)
          .order("last_message_at", { ascending: false });
        const distinct = Array.from(
          new Set((recent || []).map((r: any) => r.customer_number)),
        );
        if (distinct.length >= 2) {
          return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>2+ recent conversations — reply with TO:&lt;10-digit number&gt; so it goes to the right customer.</Message></Response>`, { headers: { "Content-Type": "text/xml" } });
        }
        if (distinct.length === 1) {
          customerNumber = distinct[0];
        } else {
          return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>No active conversation in the last 30 min. Reply with TO:&lt;10-digit number&gt; message.</Message></Response>`, { headers: { "Content-Type": "text/xml" } });
        }
      }

      if (!customerNumber) {
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>No recipient. Use TO:8015551234 message or CALL 8015551234</Message></Response>`, { headers: { "Content-Type": "text/xml" } });
      }

      if (twilioSid && twilioAuth) {
        const smsParams: Record<string, string> = { To: customerNumber, Body: messageBody };
        if (msgServiceSid) smsParams.MessagingServiceSid = msgServiceSid;
        else smsParams.From = twilioNumber;
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: "POST",
          headers: {
            "Authorization": "Basic " + btoa(`${twilioSid}:${twilioAuth}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(smsParams).toString(),
        });
      }

      await supabase.from("sms_logs").insert({
        message_sid: messageSid,
        direction: "outbound",
        from_number: twilioNumber,
        to_number: customerNumber,
        body: messageBody,
      });

      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, { headers: { "Content-Type": "text/xml" } });

    }

    // ─── CUSTOMER PATH (inbound) — v5 adds auto-lead creation ──────────────
    // A2P opt-out (CODEX MED): when Advanced Opt-Out is on the Messaging Service,
    // Twilio sends OptOutType (STOP | START | HELP) and auto-replies to the
    // customer itself. Log it + a non-sticky heads-up to Landon, but do NOT make
    // it a sticky conversation or forward it as a normal message — that would
    // prompt a reply to someone who just unsubscribed.
    const optOutType = (params.OptOutType || "").trim().toUpperCase();
    if (optOutType) {
      await supabase.from("sms_logs").insert({
        message_sid: messageSid,
        direction: "inbound",
        from_number: from,
        to_number: to,
        body: `[${optOutType}] ${body}`,
      });
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${LANDON_PHONE}">[opt-out: ${escapeXml(optOutType)}] ${escapeXml(from)} — do not reply</Message></Response>`, { headers: { "Content-Type": "text/xml" } });
    }

    await supabase.from("sms_conversation_map").upsert(
      { customer_number: from, last_message_at: new Date().toISOString() },
      { onConflict: "customer_number" }
    );

    // Find or create a lead for this customer phone (new in v5)
    let leadId: number | null = await findRecentLead(from);
    if (!leadId) {
      leadId = await createInboundSmsLead(from, body);
    }

    await supabase.from("sms_logs").insert({
      message_sid: messageSid,
      direction: "inbound",
      from_number: from,
      to_number: to,
      body: body,
      lead_id: leadId,
    });

    try {
      await fetch("https://us.i.posthog.com/capture/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: POSTHOG_KEY,
          event: "inbound_sms",
          distinct_id: from,
          properties: { from_number: from, to_number: to, message_preview: body?.substring(0, 50), source: "twilio_sms", lead_id: leadId },
        }),
      });
    } catch (_) {}

    const forwardMsg = `[From: ${from}]\n${body}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${LANDON_PHONE}">${escapeXml(forwardMsg)}</Message></Response>`;
    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });

  } catch (err) {
    // Fail closed: a malformed/unparseable request never passes the signature
    // gate, so return 403 rather than a 200 empty-TwiML that masks the rejection.
    console.error("SMS handler error:", err);
    return new Response("Forbidden", { status: 403 });
  }
});
