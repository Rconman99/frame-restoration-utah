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
  const normalized = normalizePhone(phone);
  const digits = phone.replace(/\D/g, "");
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data } = await supabase
    .from("leads")
    .select("id")
    .or(`phone.eq.${normalized},phone.eq.${digits},phone.ilike.%${digits.slice(-10)}`)
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
  const { data } = await supabase.from("app_config").select("key, value").in("key", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MESSAGING_SERVICE_SID"]);
  const config: Record<string, string> = {};
  data?.forEach((r: any) => { config[r.key] = r.value; });
  return { sid: config.TWILIO_ACCOUNT_SID, auth: config.TWILIO_AUTH_TOKEN, msgServiceSid: config.TWILIO_MESSAGING_SERVICE_SID };
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

    const isFromLandon = from === LANDON_PHONE;

    // ─── OPERATOR PATH (Landon) — unchanged from v4 ────────────────────────
    if (isFromLandon) {
      const { sid: twilioSid, auth: twilioAuth, msgServiceSid } = await getTwilioCreds();
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
            StatusCallback: `${SUPABASE_URL}/functions/v1/handle-call`,
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
        const { data: lastConvo } = await supabase
          .from("sms_conversation_map")
          .select("customer_number")
          .order("last_message_at", { ascending: false })
          .limit(1)
          .single();
        if (lastConvo) customerNumber = lastConvo.customer_number;
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
    console.error("SMS handler error:", err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, { headers: { "Content-Type": "text/xml" } });
  }
});
