// Authenticated Twilio-media proxy for inbound Utah MMS attachments.
// The URL is bearer-like and expires; no Twilio credential is exposed.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyMediaProxyToken } from "../_shared/inbound-media.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function twilioCreds(): Promise<{ sid: string; auth: string } | null> {
  const { data, error } = await supabase.from("app_config").select("key, value").in(
    "key",
    ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  );
  if (error) return null;
  const config: Record<string, string> = {};
  for (const row of data || []) config[row.key] = row.value;
  return config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN
    ? { sid: config.TWILIO_ACCOUNT_SID, auth: config.TWILIO_AUTH_TOKEN }
    : null;
}

function safeContentType(value: string): string {
  const normalized = value.toLowerCase().split(";")[0].trim();
  return /^(image\/(?:jpeg|jpg|png|gif|webp)|video\/mp4|application\/pdf)$/.test(normalized)
    ? normalized
    : "application/octet-stream";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
  const token = new URL(req.url).searchParams.get("token") || "";
  const signed = await verifyMediaProxyToken(token, SERVICE_ROLE_KEY);
  if (!signed) return new Response("Not Found", { status: 404 });
  const creds = await twilioCreds();
  if (!creds) return new Response("Media unavailable", { status: 503 });

  const upstream = await fetch(signed.url, {
    headers: { Authorization: "Basic " + btoa(creds.sid + ":" + creds.auth) },
  });
  if (!upstream.ok || !upstream.body) return new Response("Media unavailable", { status: 404 });
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": safeContentType(upstream.headers.get("content-type") || signed.contentType),
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
});

