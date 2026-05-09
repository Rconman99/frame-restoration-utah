// handle-lead v7 — Frame Roofing Utah
// ─────────────────────────────────────────────────────────────────────────────
// v7 adds urgency-tier classification (heuristic-first, OpenRouter LLM fallback).
// Tier drives notification routing: emergency leads page Landon louder; spam is
// silently dropped to DB without notifying anyone.
//
// Source-of-truth for this function lives at:
//   ~/projects/frame-restoration-utah/supabase/functions/handle-lead/index.ts
//
// Deploy:
//   supabase functions deploy handle-lead --project-ref hdcflshhomzildwqlmwh --no-verify-jwt
//
// Required app_config rows (insert via SQL):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID (or TWILIO_PHONE_NUMBER)
//   OPENROUTER_API_KEY  ← new in v7. Without it, classifier silently falls back to 'scheduled'.
//   OPENROUTER_MODEL    ← optional. Defaults to google/gemini-2.0-flash-001 if unset.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://hdcflshhomzildwqlmwh.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const LANDON_PHONE = "+14353024422";
const DEFAULT_CLASSIFIER_MODEL = "google/gemini-2.0-flash-001";
const CLASSIFIER_TIMEOUT_MS = 3000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Tier = "emergency" | "urgent" | "scheduled" | "general" | "spam";
type Classification = {
  tier: Tier;
  reason: string;
  confidence: number | null;  // null when set by heuristic
  classifier: string;  // 'heuristic' | model slug (e.g. 'google/gemini-2.0-flash-001') | 'fallback'
};

// ─── Config helpers ──────────────────────────────────────────────────────────

async function getConfig(supabase: any, keys: string[]): Promise<Record<string, string>> {
  const { data } = await supabase.from("app_config").select("key, value").in("key", keys);
  const out: Record<string, string> = {};
  for (const row of data || []) out[row.key] = row.value;
  return out;
}

// ─── Phone normalization ─────────────────────────────────────────────────────

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length > 10) return "+" + digits;
  return null;
}

// ─── Tier classification ─────────────────────────────────────────────────────

// Heuristic short-circuit. Fires when the form's `issue` dropdown alone
// gives us a confident answer AND the free-text message is short enough to
// not contradict it. Returns null if the case is ambiguous → caller falls
// through to the LLM.
function heuristicClassify(issue: string, message: string): Classification | null {
  const msg = (message || "").trim();
  const longMessage = msg.length > 50;  // longer messages might add nuance

  // Always classify free-text messages with the LLM if substantial — the
  // dropdown is just one signal, the message body trumps it.
  if (longMessage) return null;

  switch ((issue || "").toLowerCase()) {
    case "leak":
      return { tier: "emergency", reason: "Form: active roof leak", confidence: null, classifier: "heuristic" };
    case "hail":
      return { tier: "urgent", reason: "Form: hail/storm damage", confidence: null, classifier: "heuristic" };
    case "insurance":
      return { tier: "scheduled", reason: "Form: insurance claim help", confidence: null, classifier: "heuristic" };
    case "old_roof":
      return { tier: "scheduled", reason: "Form: roof replacement quote", confidence: null, classifier: "heuristic" };
    case "":
      // No dropdown selected, no substantial message → minimal contact, low intent
      if (!msg) return { tier: "general", reason: "Minimal info: contact only, no issue stated", confidence: null, classifier: "heuristic" };
      return null;
    default:
      // "other" or unknown — let the LLM look at the message
      return null;
  }
}

const CLASSIFIER_PROMPT = `You triage roofing leads for Frame Roofing Utah, a contractor in Utah serving Heber City, Park City, Salt Lake metro and surrounding areas.

Read the lead and return a JSON object with this exact shape:
  { "tier": "...", "reason": "...", "confidence": 0.0-1.0 }

Tiers (pick exactly one):
  - "emergency"  → active leak, water inside the home, structural risk, "right now"/"today" language. Needs same-hour callback.
  - "urgent"     → recent storm/hail damage (within days), insurance claim with timeline pressure, "ASAP" / "soon" language. Needs same-day callback.
  - "scheduled"  → quote request, planning a project, comparing contractors, no time pressure. Standard business-hour callback.
  - "general"    → vague info question, callback request without specifics, browsing.
  - "spam"       → bot-like, off-topic, promo links, gibberish, obviously fake.

Output ONLY the JSON object. No prose, no markdown fence.`;

async function llmClassify(
  apiKey: string,
  model: string,
  payload: { name: string; issue: string; message: string; city: string; zip: string },
): Promise<Classification | null> {
  if (!apiKey) return null;

  const userMessage = [
    `Name: ${payload.name || "(blank)"}`,
    `City/ZIP: ${payload.city || "(blank)"} ${payload.zip || ""}`.trim(),
    `Form issue dropdown: ${payload.issue || "(none selected)"}`,
    `Message: ${payload.message || "(blank)"}`,
  ].join("\n");

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Content-Type", "application/json");

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 150,
        temperature: 0.1,  // we want deterministic classification, not creativity
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CLASSIFIER_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(CLASSIFIER_TIMEOUT_MS),
    });

    if (!resp.ok) {
      console.error("Classifier API non-200:", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    // Models occasionally wrap JSON in ```json fences despite response_format
    const jsonText = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(jsonText);

    const allowed: Tier[] = ["emergency", "urgent", "scheduled", "general", "spam"];
    if (!allowed.includes(parsed.tier)) {
      console.error("Classifier returned invalid tier:", parsed.tier);
      return null;
    }
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
    const reason = String(parsed.reason || "no reason given").slice(0, 200);
    return { tier: parsed.tier, reason, confidence, classifier: model };
  } catch (e) {
    console.error("Classifier error:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function classifyLead(
  apiKey: string,
  model: string,
  payload: { name: string; issue: string; message: string; city: string; zip: string },
): Promise<Classification> {
  const heuristic = heuristicClassify(payload.issue, payload.message);
  if (heuristic) return heuristic;

  const llm = await llmClassify(apiKey, model, payload);
  if (llm) return llm;

  // Fail-open: never lose a lead because the classifier broke.
  return {
    tier: "scheduled",
    reason: "Classifier unavailable — defaulted to scheduled",
    confidence: null,
    classifier: "fallback",
  };
}

// ─── Notification helpers ────────────────────────────────────────────────────

async function sendTwilioSMS(config: Record<string, string>, to: string, body: string): Promise<boolean> {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token,
          TWILIO_MESSAGING_SERVICE_SID: msgService, TWILIO_PHONE_NUMBER: from } = config;
  if (!sid || !token || (!msgService && !from)) return false;

  const params = new URLSearchParams();
  params.set("To", to);
  params.set("Body", body);
  if (msgService) params.set("MessagingServiceSid", msgService);
  else params.set("From", from);

  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + btoa(sid + ":" + token),
      },
      body: params.toString(),
    },
  );
  const result = await resp.json();
  if (result.sid) {
    console.log("Twilio SMS queued:", result.sid, "Status:", result.status);
    return true;
  }
  console.error("Twilio SMS API rejected:", JSON.stringify(result));
  return false;
}

async function sendVerizonGatewaySMS(to: string, body: string): Promise<boolean> {
  const digits = to.replace(/\D/g, "").replace(/^1/, "");
  const verizonEmail = `${digits}@vtext.com`;
  try {
    const resp = await fetch("https://formspree.io/f/meeroaqa", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        email: verizonEmail,
        _replyto: "noreply@frameroofingutah.com",
        _subject: "New Lead",
        message: body,
        name: "Frame Roofing Utah",
      }),
    });
    console.log("Verizon gateway SMS sent to", verizonEmail, "status:", resp.status);
    return resp.ok;
  } catch (e) {
    console.error("Verizon SMS gateway error:", e);
    return false;
  }
}

// ─── Tier-aware message builders ─────────────────────────────────────────────

function smsForLandon(tier: Tier, leadName: string, phone: string, service: string, reason: string): string {
  const phoneStr = phone || "no phone";
  switch (tier) {
    case "emergency":
      return `🚨 EMERGENCY LEAD: ${leadName} | ${phoneStr} | ${service}\nReason: ${reason}\nCall NOW.`;
    case "urgent":
      return `🔥 URGENT LEAD: ${leadName} | ${phoneStr} | ${service}\nReason: ${reason}\nCall today.`;
    case "general":
      return `INFO REQUEST: ${leadName} | ${phoneStr} | ${service}`;
    case "scheduled":
    default:
      return `NEW LEAD: ${leadName} | ${phoneStr} | ${service}`;
  }
}

function emailSubjectFor(tier: Tier, leadName: string, service: string): string {
  const prefix = {
    emergency: "[EMERGENCY] ",
    urgent: "[URGENT] ",
    scheduled: "",
    general: "[INFO] ",
    spam: "[SPAM] ",
  }[tier];
  return `${prefix}NEW LEAD - ${leadName} - ${service}`;
}

function customerAutoReply(tier: Tier, firstName: string): string {
  const greeting = firstName ? `Hi ${firstName}! ` : "Hi! ";
  switch (tier) {
    case "emergency":
      return greeting +
        "Thanks for reaching out to Frame Roofing Utah. We saw you're dealing with an emergency — " +
        "we're calling you within 15 minutes. If you can't wait, call us right now at (435) 302-4422. - Landon, Owner";
    case "urgent":
      return greeting +
        "Thanks for reaching out to Frame Roofing Utah! Storm damage is time-sensitive — " +
        "we'll call you within the hour. Need us sooner? (435) 302-4422. - Landon, Owner";
    case "general":
      return greeting +
        "Thanks for reaching out to Frame Roofing Utah! We'll get back to you within one business day. " +
        "If it's urgent, call us at (435) 302-4422. - Landon, Owner";
    case "scheduled":
    default:
      return greeting +
        "Thanks for reaching out to Frame Roofing Utah! A roofing specialist will call you shortly — usually within minutes. " +
        "If you need us right away, call (435) 302-4422. - Landon, Owner";
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const formData = await req.json();
    const {
      name, email, phone, address, service, message, source_page,
      city, zip, issue, first_name, last_name,
    } = formData;
    const leadName = name || ((first_name || "") + " " + (last_name || "")).trim() || "Unknown";
    const firstName = first_name || (name ? name.split(" ")[0] : "");
    const leadService = service || issue || "Not specified";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Classify (heuristic first; LLM for free-text; fail-open to 'scheduled')
    const config = await getConfig(supabase, [
      "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER",
      "TWILIO_MESSAGING_SERVICE_SID", "OPENROUTER_API_KEY", "OPENROUTER_MODEL",
    ]);
    // Prefer Deno secrets for OpenRouter (set via `supabase secrets set OPENROUTER_API_KEY=...`).
    // Falls back to app_config for backward compat. Function secrets > DB rows here because the
    // Supabase Edge Runtime appears to be eating outbound Authorization headers when the key
    // arrives via a DB read but not when it arrives via env. Suspected runtime-side scrubbing.
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY") || config.OPENROUTER_API_KEY || "";
    const openrouterModel = Deno.env.get("OPENROUTER_MODEL") || config.OPENROUTER_MODEL || DEFAULT_CLASSIFIER_MODEL;
    const classification = await classifyLead(
      openrouterKey,
      openrouterModel,
      {
        name: leadName, issue: issue || "", message: message || "",
        city: city || "", zip: zip || "",
      },
    );
    console.log("Lead classified:", classification.tier, "via", classification.classifier, "—", classification.reason);

    // 2. Save to DB with tier.
    // No .select() back — leads RLS allows anon INSERT but only authenticated SELECT,
    // and the function runs with the anon key (anti-spam: form submits don't need a JWT).
    const { error: insertError } = await supabase.from("leads").insert({
      name: leadName,
      email,
      phone,
      address: address || ((city || "") + " " + (zip || "")).trim(),
      service: leadService,
      message,
      source_page: source_page || "/",
      tier: classification.tier,
      tier_reason: classification.reason,
      tier_confidence: classification.confidence,
      tier_classifier: classification.classifier,
    });
    if (insertError) console.error("DB Error:", insertError);

    // 3. Spam → silent drop. Saved to DB for review, but no email/SMS noise.
    if (classification.tier === "spam") {
      console.log("Spam lead saved silently:", leadName);
      return new Response(
        JSON.stringify({ success: true, message: "Lead received!" }),  // generic response — don't tip off bots
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // 4. Email Landon via Formspree (subject prefixed by tier)
    try {
      await fetch("https://formspree.io/f/meeroaqa", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          name: leadName, email, phone, address, service: leadService, message,
          city, zip, issue,
          tier: classification.tier,
          tier_reason: classification.reason,
          _replyto: email,
          _subject: emailSubjectFor(classification.tier, leadName, leadService),
        }),
      });
    } catch (e) { console.error("Email error:", e); }

    // 5. SMS Landon — Verizon gateway (reliable) + Twilio (post-10DLC bonus)
    const smsBody = smsForLandon(classification.tier, leadName, phone || "", leadService, classification.reason);
    const smsPromises: Promise<any>[] = [];

    smsPromises.push(
      sendVerizonGatewaySMS(LANDON_PHONE, smsBody)
        .then(ok => console.log("Verizon→Landon:", ok ? "delivered" : "failed"))
        .catch(e => console.error("Verizon→Landon error:", e)),
    );

    if (config.TWILIO_ACCOUNT_SID) {
      smsPromises.push(
        sendTwilioSMS(config, LANDON_PHONE, smsBody)
          .then(ok => console.log("Twilio→Landon:", ok ? "queued" : "rejected"))
          .catch(e => console.error("Twilio→Landon error:", e)),
      );
    }

    // 6. Speed-to-lead auto-text to customer (tier-personalized)
    const customerPhone = normalizePhone(phone || "");
    if (customerPhone && config.TWILIO_ACCOUNT_SID) {
      const autoReplyBody = customerAutoReply(classification.tier, firstName);
      smsPromises.push(
        sendTwilioSMS(config, customerPhone, autoReplyBody)
          .then(ok => console.log("Auto-text→customer:", customerPhone, ok ? "sent" : "failed"))
          .catch(e => console.error("Auto-text error:", e)),
      );
    } else {
      console.log("Auto-text skipped:", !customerPhone ? "no valid phone" : "no Twilio config");
    }

    await Promise.allSettled(smsPromises);

    // 7. Google Sheet webhook (unchanged from v6)
    const SHEET_WEBHOOK = Deno.env.get("GOOGLE_SHEET_WEBHOOK") || "";
    if (SHEET_WEBHOOK) {
      try {
        await fetch(SHEET_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: leadName, email, phone, address, service: leadService, message,
            city, zip, source_page,
            tier: classification.tier,
            tier_reason: classification.reason,
            date: new Date().toISOString(), status: "New",
          }),
        });
      } catch (e) { console.error("Sheet error:", e); }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Lead received!" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    console.error("Handler error:", err);
    return new Response(
      JSON.stringify({ success: false, message: "Something went wrong. Please call us at 435-302-4422." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
