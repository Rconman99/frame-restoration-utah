// send-message v1.1 — Cyborg Ryan SMS sender (2026-05-27)
// ─────────────────────────────────────────────────────────────────────────────
// General-purpose Twilio SMS endpoint for ad-hoc outbound texts. Mirrors the
// Twilio config + send pattern from handle-lead (creds live in app_config),
// so no new Twilio secrets are required.
//
// Auth: caller MUST present Authorization: Bearer <CYBORG_SEND_TOKEN>.
// CYBORG_SEND_TOKEN is a dedicated Supabase function secret — rotatable
// without touching the service-role key. Anything else is rejected.
//
// POST body:
//   { to: "+14353024422", body: "message text", prefix?: true }
//
// If prefix === true, we send "I am Cyborg Ryan." first as its own bubble,
// pause 1.5s, then send the body. Per Ryan's cyborg-ryan-prefix rule.
//
// Response:
//   200 { ok: true,  to, sends: [{ label, ok, sid }, ...] }
//   401 { error: "unauthorized" }
//   400 { error: "invalid-json" | "invalid-to" | "empty-body" }
//   502 { ok: false, to, sends: [...] }   (Twilio rejected at least one send)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CYBORG_SEND_TOKEN = Deno.env.get("CYBORG_SEND_TOKEN") || "";
const CYBORG_PREFIX = "I am Cyborg Ryan.";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getConfig(keys: string[]): Promise<Record<string, string>> {
  const { data } = await supabase.from("app_config").select("key, value").in("key", keys);
  const out: Record<string, string> = {};
  for (const row of data || []) out[row.key] = row.value;
  return out;
}

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length > 10) return "+" + digits;
  return null;
}

type SendResult = { label: string; ok: boolean; sid?: string; error?: string };

async function sendTwilio(
  config: Record<string, string>,
  to: string,
  body: string,
  label: string,
): Promise<SendResult> {
  const {
    TWILIO_ACCOUNT_SID: sid,
    TWILIO_AUTH_TOKEN: token,
    TWILIO_MESSAGING_SERVICE_SID: msgService,
    TWILIO_PHONE_NUMBER: from,
  } = config;
  if (!sid || !token || (!msgService && !from)) {
    return { label, ok: false, error: "missing-twilio-config" };
  }

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
        Authorization: "Basic " + btoa(sid + ":" + token),
      },
      body: params.toString(),
    },
  );
  const result = await resp.json();
  if (result.sid) {
    console.log(`Twilio ${label} queued:`, result.sid, "status:", result.status);
    return { label, ok: true, sid: result.sid };
  }
  console.error(`Twilio ${label} rejected:`, JSON.stringify(result));
  return { label, ok: false, error: result.message || JSON.stringify(result) };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, x-cyborg-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Auth gate — require the dedicated cyborg-send token
  const headerToken = req.headers.get("x-cyborg-token") || "";
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const presented = headerToken || bearer;
  if (!CYBORG_SEND_TOKEN || presented !== CYBORG_SEND_TOKEN) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method-not-allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  let payload: { to?: string; body?: string; prefix?: boolean };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid-json" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  const to = normalizePhone(payload.to || "");
  const body = (payload.body || "").trim();
  const prefix = !!payload.prefix;

  if (!to) {
    return new Response(JSON.stringify({ error: "invalid-to" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
  if (!body) {
    return new Response(JSON.stringify({ error: "empty-body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  const config = await getConfig([
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_PHONE_NUMBER",
    "TWILIO_MESSAGING_SERVICE_SID",
  ]);

  const sends: SendResult[] = [];
  if (prefix) {
    sends.push(await sendTwilio(config, to, CYBORG_PREFIX, "prefix"));
    await new Promise((r) => setTimeout(r, 1500));
  }
  sends.push(await sendTwilio(config, to, body, "body"));

  const allOk = sends.every((s) => s.ok);
  return new Response(JSON.stringify({ ok: allOk, to, sends }), {
    status: allOk ? 200 : 502,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
});
