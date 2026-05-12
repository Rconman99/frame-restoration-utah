// track-click v1 — Frame Roofing Utah
// ─────────────────────────────────────────────────────────────────────────────
// Persists tel: / sms: link clicks from the website into public.phone_clicks
// with full attribution (referrer, utm_*, gclid, source classification).
//
// Deploy:
//   supabase functions deploy track-click --project-ref hdcflshhomzildwqlmwh --no-verify-jwt
//
// POST JSON shape (from /track-clicks.js):
//   {
//     click_type: "call" | "sms",
//     phone: string,
//     source_page: string,
//     page_title: string,
//     referrer: string,
//     gclid?, gbraid?, wbraid?, fbclid?, msclkid?,
//     utm_source?, utm_medium?, utm_campaign?, utm_term?, utm_content?,
//     city?
//   }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://hdcflshhomzildwqlmwh.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function classifySource(referrer: string, utm: Record<string, string>, gclid?: string): string {
  if (gclid || utm.utm_source === "google" && utm.utm_medium === "cpc") return "google_ads";
  const ref = (referrer || "").toLowerCase();
  if (ref.includes("google.com/maps") || ref.includes("/maps/") || ref.includes("business.google")) return "gbp";
  if (ref.includes("google.")) return "organic_google";
  if (ref.includes("bing.com")) return "bing";
  if (ref.includes("duckduckgo")) return "duckduckgo";
  if (ref.includes("facebook.com") || ref.includes("instagram.com") || ref.includes("t.co") || ref.includes("linkedin.com")) return "social";
  if (utm.utm_source) return `utm:${utm.utm_source}`;
  if (!ref) return "direct";
  return "referral";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const clickType = body.click_type === "sms" ? "sms" : "call";
  const phone = String(body.phone || "").slice(0, 40);
  const sourcePage = String(body.source_page || "").slice(0, 500);
  const pageTitle = String(body.page_title || "").slice(0, 300);
  const referrer = String(body.referrer || "").slice(0, 500);

  const utm = {
    utm_source: body.utm_source || null,
    utm_medium: body.utm_medium || null,
    utm_campaign: body.utm_campaign || null,
    utm_term: body.utm_term || null,
    utm_content: body.utm_content || null,
  };
  const gclid = body.gclid || null;
  const source = classifySource(referrer, utm, gclid);

  const userAgent = req.headers.get("user-agent") || "";
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase.from("phone_clicks").insert({
    click_type: clickType,
    phone,
    source_page: sourcePage,
    page_title: pageTitle,
    referrer,
    source,
    user_agent: userAgent.slice(0, 500),
    ip: ip.split(",")[0].trim().slice(0, 64),
    gclid: gclid,
    gbraid: body.gbraid || null,
    wbraid: body.wbraid || null,
    fbclid: body.fbclid || null,
    msclkid: body.msclkid || null,
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_term: utm.utm_term,
    utm_content: utm.utm_content,
    city: body.city || null,
  }).select("id, source, click_type").single();

  if (error) {
    console.error("track-click insert failed:", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200, // 200 so the beacon doesn't retry-storm
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ ok: true, id: data?.id, source: data?.source }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
