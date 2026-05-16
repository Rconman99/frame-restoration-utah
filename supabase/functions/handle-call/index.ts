// handle-call v2 — Frame Roofing Utah
// ─────────────────────────────────────────────────────────────────────────────
// v2 (2026-05-16): Auto-create a leads row on first inbound call from a
//   previously-unseen phone number. This closes the gap where 8 calls had
//   landed in call_logs but never surfaced in /leads.
//
// Inbound call flow:
//   1. Twilio webhooks the tracking number → this fn
//   2. Insert call_logs row (existing behavior)
//   3. If no leads row with same phone in last 90d → create one
//      (status=new, source_page=inbound-call, tier=general)
//   4. Set call_logs.lead_id pointer
//   5. Return TwiML to forward call to Landon (existing behavior)
//
// Source pulled from prod 2026-05-16 (deployed version 5) + lead-create patch.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LANDON_PHONE = "+14353024422";
const POSTHOG_API_KEY = "phc_BnECzlZ2OeDujli2dbqcgGODXlv2tYERbp40dTF7UBV";

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

// Returns existing lead id if one matches the phone in the last 90 days, else null.
async function findRecentLead(phone: string): Promise<number | null> {
  if (!phone) return null;
  const normalized = normalizePhone(phone);
  const digits = phone.replace(/\D/g, "");
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();

  // Match either the +1XXXXXXXXXX form or the raw 10-digit form (form submits
  // typically store raw digits; handle-lead normalizes; older rows are mixed).
  const { data } = await supabase
    .from("leads")
    .select("id")
    .or(`phone.eq.${normalized},phone.eq.${digits},phone.ilike.%${digits.slice(-10)}`)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  return data && data.length ? data[0].id : null;
}

async function createInboundCallLead(fromNumber: string, city: string): Promise<number | null> {
  if (!fromNumber || fromNumber === "unknown") return null;
  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: `Inbound caller — ${lastFour(fromNumber)}`,
      phone: normalizePhone(fromNumber),
      address: city || null,
      city: city ? city.split(",")[0].trim() : null,
      source_page: "inbound-call",
      status: "new",
      tier: "general",
      tier_classifier: "auto-inbound-call",
      tier_reason: "Auto-created by handle-call on first call from this number",
      notes: "Auto-created from inbound call. Update name/details when you have them.",
    })
    .select("id")
    .single();
  if (error) {
    console.error("[handle-call] lead insert failed:", error);
    return null;
  }
  return data?.id ?? null;
}

async function sendPostHogEvent(event: string, properties: Record<string, unknown>) {
  try {
    await fetch("https://us.i.posthog.com/capture/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        event,
        properties: {
          distinct_id: properties.from_number || "anonymous",
          ...properties,
        },
      }),
    });
  } catch (e) {
    console.error("PostHog error:", e);
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  const formData = await req.formData();
  const data: Record<string, string> = {};
  formData.forEach((value, key) => { data[key] = value.toString(); });

  console.log(`[handle-call] path=${path}`, JSON.stringify(data));

  // === INCOMING CALL ===
  if (path === "handle-call" || path === "" || !path) {
    const callSid = data.CallSid || "unknown";
    const fromNumber = data.From || "unknown";
    const toNumber = data.To || "unknown";
    const callerCity = data.FromCity || "";
    const callerState = data.FromState || "";
    const cityLabel = callerCity ? `${callerCity}, ${callerState}` : "unknown";

    // Look up or create a lead for this caller (new in v2)
    let leadId: number | null = null;
    if (fromNumber && fromNumber !== "unknown") {
      leadId = await findRecentLead(fromNumber);
      if (!leadId) {
        leadId = await createInboundCallLead(fromNumber, cityLabel);
      }
    }

    const { error } = await supabase.from("call_logs").insert({
      call_sid: callSid,
      from_number: fromNumber,
      to_number: toNumber,
      forwarded_to: LANDON_PHONE,
      status: "ringing",
      city: cityLabel,
      source_page: "website-tracking-number",
      lead_id: leadId,
    });
    if (error) console.error("[handle-call] call_logs insert error:", error);

    await sendPostHogEvent("inbound_call", {
      from_number: fromNumber,
      caller_city: callerCity,
      caller_state: callerState,
      source: "website",
      lead_id: leadId,
    });

    const statusCallbackUrl = `${SUPABASE_URL}/functions/v1/handle-call/status`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${toNumber}" timeout="30"
        action="${SUPABASE_URL}/functions/v1/handle-call/completed"
        record="record-from-answer-dual">
    <Number statusCallbackEvent="initiated ringing answered completed"
            statusCallback="${statusCallbackUrl}">
      ${LANDON_PHONE}
    </Number>
  </Dial>
  <Say>Sorry, no one is available right now. Please leave a message after the beep.</Say>
  <Record maxLength="120" transcribe="true" />
</Response>`;

    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  }

  // === CALL COMPLETED ===
  if (path === "completed" || path === "status") {
    const callSid = data.CallSid || data.ParentCallSid || "";
    const duration = parseInt(data.DialCallDuration || data.CallDuration || data.Duration || "0");
    const callStatus = data.DialCallStatus || data.CallStatus || "unknown";
    const recordingUrl = data.RecordingUrl || null;

    if (callSid) {
      const updateData: Record<string, unknown> = { status: callStatus };
      if (duration > 0) updateData.duration_seconds = duration;
      if (recordingUrl) updateData.recording_url = recordingUrl;

      const { error } = await supabase.from("call_logs").update(updateData).eq("call_sid", callSid);
      if (error) console.error("Update error:", error);

      if (duration > 0) {
        await sendPostHogEvent("call_completed", {
          from_number: data.From || "unknown",
          duration_seconds: duration,
          status: callStatus,
          source: "website",
        });
      }
    }

    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      headers: { "Content-Type": "text/xml" }
    });
  }

  return new Response("OK", { status: 200 });
});
