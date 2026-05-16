import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// review-request v2 (2026-05-16) — bugfix: filter on status='won' + job_completed_at,
// not status='completed' (which never gets set anywhere). The dashboard sets status='won'
// when a contract signs, and job_completed_at when the install is done — those are the
// two independent facts. The trigger to send a review request is: 3+ days post-install.

const SUPABASE_URL = "https://hdcflshhomzildwqlmwh.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REVIEW_URL = "https://www.frameroofingutah.com/review.html";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function getTwilioConfig(supabase: any) {
  const { data, error } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]);
  if (error || !data) return null;
  const config: Record<string, string> = {};
  for (const row of data) config[row.key] = row.value;
  return config;
}

async function sendTwilioSMS(config: Record<string, string>, to: string, body: string): Promise<boolean> {
  const accountSid = config.TWILIO_ACCOUNT_SID;
  const authToken = config.TWILIO_AUTH_TOKEN;
  const msgServiceSid = config.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = config.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || (!msgServiceSid && !fromNumber)) return false;
  const params = new URLSearchParams();
  params.set("To", to);
  params.set("Body", body);
  if (msgServiceSid) params.set("MessagingServiceSid", msgServiceSid);
  else params.set("From", fromNumber);
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic " + btoa(accountSid + ":" + authToken) }, body: params.toString() }
  );
  const result = await resp.json();
  if (result.sid) { console.log("Review SMS sent:", result.sid); return true; }
  console.error("Twilio rejected:", JSON.stringify(result));
  return false;
}

async function sendReviewEmail(to: string, name: string): Promise<boolean> {
  const firstName = (name || "there").split(" ")[0];
  try {
    const resp = await fetch("https://formspree.io/f/meeroaqa", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        email: to,
        _replyto: "landon@framerestorations.com",
        _subject: "How did we do? — Frame Roofing Utah",
        name: "Frame Roofing Utah",
        message: `Hi ${firstName},\n\nThank you for choosing Frame Roofing Utah! We hope you're happy with the work.\n\nWould you mind taking 30 seconds to leave us a quick review? It really helps other homeowners find us.\n\n${REVIEW_URL}\n\nThank you!\nLandon Yokers\nFrame Restoration Utah LLC\n(435) 302-4422`,
      }),
    });
    return resp.ok;
  } catch (e) { console.error("Review email error:", e); return false; }
}

function normalizePhone(p: string): string {
  let phone = (p || "").replace(/\D/g, "");
  if (phone.length === 10) phone = "+1" + phone;
  else if (phone.length === 11 && phone.startsWith("1")) phone = "+" + phone;
  else phone = "+" + phone;
  return phone;
}

async function sendOne(lead: any, twilioConfig: any) {
  const firstName = (lead.name || "there").split(" ")[0];
  let smsSent = false, emailSent = false;
  if (lead.phone && twilioConfig) {
    const phone = normalizePhone(lead.phone);
    const smsBody = `Hi ${firstName}! Thanks for choosing Frame Roofing Utah ⭐ Would you take 30 sec to leave us a review? It means a lot! ${REVIEW_URL} - Landon`;
    smsSent = await sendTwilioSMS(twilioConfig, phone, smsBody);
  }
  if (lead.email) emailSent = await sendReviewEmail(lead.email, lead.name || "there");
  return { smsSent, emailSent };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== "frame-roofing-2026") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const leadId = body.lead_id;
      if (!leadId) return new Response(JSON.stringify({ error: "lead_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const sendNow = body.send_now === true;
      const { data: lead, error: fetchErr } = await supabase.from("leads")
        .select("id, name, email, phone, review_requested_at, job_completed_at, status")
        .eq("id", leadId).single();
      if (fetchErr || !lead) return new Response(JSON.stringify({ error: fetchErr?.message || "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!lead.job_completed_at) {
        await supabase.from("leads").update({ job_completed_at: new Date().toISOString() }).eq("id", leadId);
      }
      if (sendNow && !lead.review_requested_at) {
        const twilioConfig = await getTwilioConfig(supabase);
        const { smsSent, emailSent } = await sendOne(lead, twilioConfig);
        if (smsSent || emailSent) {
          await supabase.from("leads").update({ review_requested_at: new Date().toISOString() }).eq("id", leadId);
        }
        return new Response(JSON.stringify({ success: true, message: `Review request sent now.`, sms: smsSent, email: emailSent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true, message: `Lead ${leadId} marked completed. Review auto-sends in 3 days.` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, email, phone")
      .eq("status", "won")
      .not("job_completed_at", "is", null)
      .is("review_requested_at", null)
      .lte("job_completed_at", threeDaysAgo);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No review requests due.", sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const twilioConfig = await getTwilioConfig(supabase);
    const results: any[] = [];
    for (const lead of leads) {
      const { smsSent, emailSent } = await sendOne(lead, twilioConfig);
      if (smsSent || emailSent) {
        await supabase.from("leads").update({ review_requested_at: new Date().toISOString() }).eq("id", lead.id);
      }
      results.push({ id: lead.id, name: lead.name, sms: smsSent, email: emailSent });
    }
    return new Response(JSON.stringify({ success: true, message: `Sent ${results.length} review request(s).`, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Review request error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
