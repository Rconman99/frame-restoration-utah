// lead-crm — Frame Roofing Utah
// ─────────────────────────────────────────────────────────────────────────────
// PIN-gated CRM backend for /leads.html. Mirrors the weekly-report auth pattern
// (same `key` + `pin` against `report_access` table). Uses service role
// internally so the leads table never gets exposed to the anon key.
//
// Endpoints (single function, dispatched by ?action=...):
//   GET  ?action=list&key=...&pin=...
//        → { user, leads: [...] }   (all leads, all columns, newest first)
//   POST ?action=update&key=...&pin=...   body: { id, status?, notes?, job_value?, commission? }
//        → { user, lead }           (returns updated row)
//
// Side effect: when status flips from non-won → won, won_at is set to NOW().
//
// Deploy:
//   supabase functions deploy lead-crm --project-ref hdcflshhomzildwqlmwh --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://hdcflshhomzildwqlmwh.supabase.co";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const API_KEY = "frame-roofing-2026";

const ALLOWED_STATUS = new Set(["new", "contacted", "estimated", "won", "lost"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key !== API_KEY) return jsonResp({ error: "unauthorized" }, 401);

  const pin = url.searchParams.get("pin");
  if (!pin) return jsonResp({ error: "invalid_pin", message: "PIN required." }, 403);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // PIN check — same shape as weekly-report
  const { data: accessRow, error: accessErr } = await supabase
    .from("report_access")
    .select("id, name, role, active")
    .eq("pin", pin)
    .single();
  if (accessErr || !accessRow || !accessRow.active) {
    return jsonResp({ error: "invalid_pin", message: "Invalid PIN. Access denied." }, 403);
  }
  // Don't block on this — failure to bump last_accessed is non-critical.
  supabase.from("report_access").update({ last_accessed: new Date().toISOString() }).eq("id", accessRow.id);

  const user = { name: accessRow.name, role: accessRow.role };
  const action = url.searchParams.get("action") || "list";

  // ─── LIST ──────────────────────────────────────────────────────────────────
  if (action === "list") {
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select(`
        id, created_at, name, email, phone, address, service, message,
        source_page, status, job_value, margin, city, commission, notes,
        job_completed_at, review_requested_at, review_link_clicked,
        won_at,
        tier, tier_reason, tier_confidence, tier_classifier
      `)
      .order("created_at", { ascending: false });
    if (leadsErr) return jsonResp({ error: "db_error", message: leadsErr.message }, 500);
    return jsonResp({ user, leads: leads || [] });
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────
  if (action === "update") {
    if (req.method !== "POST") return jsonResp({ error: "method_not_allowed", message: "Use POST for action=update" }, 405);

    let body: any;
    try { body = await req.json(); } catch { return jsonResp({ error: "bad_json" }, 400); }

    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) return jsonResp({ error: "bad_id", message: "id must be a positive integer" }, 400);

    // Whitelist of editable columns. Anything else is silently ignored.
    const patch: Record<string, unknown> = {};
    if ("status" in body) {
      const s = String(body.status || "").toLowerCase();
      if (!ALLOWED_STATUS.has(s)) return jsonResp({ error: "bad_status", message: `status must be one of ${[...ALLOWED_STATUS].join(", ")}` }, 400);
      patch.status = s;
    }
    if ("notes"      in body) patch.notes      = body.notes ? String(body.notes) : null;
    if ("job_value"  in body) patch.job_value  = body.job_value  === null || body.job_value  === "" ? null : Number(body.job_value);
    if ("margin"     in body) patch.margin     = body.margin     === null || body.margin     === "" ? null : Number(body.margin);
    if ("city"       in body) patch.city       = body.city ? String(body.city).trim() : null;
    // NOTE: commission is a GENERATED column in public.leads with city-aware CASE expression:
    //   margin*0.05 for Heber/Midway, margin*0.10 elsewhere.
    // Writing to it returns Postgres error 428C9. Update margin and/or city — commission
    // recalculates automatically. Rule set by Ryan 2026-05-11; migration shipped same night.

    if (Object.keys(patch).length === 0) return jsonResp({ error: "nothing_to_update" }, 400);

    // Stamp won_at when transitioning to "won"
    if (patch.status === "won") {
      const { data: existing } = await supabase
        .from("leads").select("status, won_at").eq("id", id).single();
      if (existing && existing.status !== "won" && !existing.won_at) {
        patch.won_at = new Date().toISOString();
      }
    }

    const { data: updated, error: updErr } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (updErr) return jsonResp({ error: "db_error", message: updErr.message }, 500);

    return jsonResp({ user, lead: updated });
  }

  // ─── CLICKS ────────────────────────────────────────────────────────────────
  // Returns phone_clicks aggregated for the leads dashboard. Counts by source +
  // type, plus most recent N rows for the live feed.
  if (action === "clicks") {
    const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") || 30)));
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: rows, error: clicksErr } = await supabase
      .from("phone_clicks")
      .select("id, created_at, click_type, phone, source, source_page, referrer, city, gclid, utm_source, utm_medium, utm_campaign")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);
    if (clicksErr) return jsonResp({ error: "db_error", message: clicksErr.message }, 500);

    const list = rows || [];
    const totals = { call: 0, sms: 0 };
    const bySource: Record<string, { call: number; sms: number }> = {};
    for (const r of list) {
      const t = r.click_type === "sms" ? "sms" : "call";
      totals[t]++;
      const s = r.source || "unknown";
      if (!bySource[s]) bySource[s] = { call: 0, sms: 0 };
      bySource[s][t]++;
    }

    return jsonResp({
      user,
      window_days: days,
      totals,
      by_source: bySource,
      recent: list.slice(0, 50)
    });
  }

  return jsonResp({ error: "unknown_action", message: `action must be 'list', 'update', or 'clicks' (got '${action}')` }, 400);
});
