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
import { failedAttemptRow, throttleAllows } from "../_shared/auth-throttle.ts";

const SUPABASE_URL = "https://hdcflshhomzildwqlmwh.supabase.co";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// The key ships in public leads.html, so it is a routing token, not a secret —
// the PIN (+ per-IP throttle below) is the real auth. Env-driven so it can be
// rotated without a redeploy; unset = function disabled (fail closed).
const API_KEY = Deno.env.get("LEAD_CRM_API_KEY") ?? "";
// A2P sender of record (canonical NAP line). The Messaging Service pool holds
// more than one number, so every send pins From explicitly — same rule as
// handle-lead. Without this a reset code could go out from a tracking DID.
const MAIN_LINE = "+14352928802";
// Per-account cooldown between self-serve PIN resets. Stops a known name from
// being used to spam someone's phone; per-IP throttling is separate.
const RESET_COOLDOWN_MS = 10 * 60 * 1000;

const ALLOWED_STATUS = new Set([
  "new",
  "contacted",
  "estimated",
  "won",
  "lost",
  "third_party",
]);
const ALLOWED_GROWTH_STATES = new Set(["open", "done", "snoozed"]);

const LEAD_SELECT_BASE = `
  id, created_at, name, email, phone, address, service, message,
  source_page, status, job_value, margin, city, commission, notes,
  deposit_received_at, deposit_amount, install_scheduled_for, job_started_at,
  job_completed_at, balance_due, contract_url, warranty_doc_url, product,
  review_requested_at, review_link_clicked,
  won_at,
  tier, tier_reason, tier_confidence, tier_classifier
`;

const LEAD_SELECT_PARITY = `
  ${LEAD_SELECT_BASE},
  estimated_completion_date, final_payment_received_at,
  notified, notified_at, notification_attempts, notification_error
`;

const OPTIONAL_LEAD_DEFAULTS = {
  estimated_completion_date: null,
  final_payment_received_at: null,
  notified: null,
  notified_at: null,
  notification_attempts: 0,
  notification_error: null,
};

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

function isMissingSchemaError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const msg = String(e?.message || "").toLowerCase();
  return e?.code === "42703" ||
    e?.code === "42P01" ||
    e?.code === "PGRST204" ||
    msg.includes("does not exist") ||
    msg.includes("could not find") ||
    msg.includes("schema cache");
}

function cleanText(value: unknown, max = 1000): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function dateOrNull(v: unknown): string | null {
  if (v === null || v === "" || v === undefined) return null;
  const text = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function tsOrNull(v: unknown): string | null {
  if (v === null || v === "" || v === undefined) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function withOptionalLeadDefaults(rows: any[] | null | undefined): any[] {
  return (rows || []).map((row) => ({ ...OPTIONAL_LEAD_DEFAULTS, ...row }));
}

async function selectLeads(
  supabase: any,
): Promise<{ leads: any[]; parityReady: boolean; error?: any }> {
  const extended = await supabase
    .from("leads")
    .select(LEAD_SELECT_PARITY)
    .order("created_at", { ascending: false });
  if (!extended.error) {
    return {
      leads: withOptionalLeadDefaults(extended.data),
      parityReady: true,
    };
  }
  if (!isMissingSchemaError(extended.error)) {
    return { leads: [], parityReady: false, error: extended.error };
  }
  console.warn(
    "[lead-crm] CRM parity columns not present; falling back to base lead select:",
    extended.error.message,
  );
  const base = await supabase
    .from("leads")
    .select(LEAD_SELECT_BASE)
    .order("created_at", { ascending: false });
  if (base.error) return { leads: [], parityReady: false, error: base.error };
  return { leads: withOptionalLeadDefaults(base.data), parityReady: false };
}

function cleanActionKey(value: unknown): string | null {
  const key = cleanText(value, 240);
  if (!key) return null;
  return /^[a-z0-9][a-z0-9._:/-]{1,239}$/i.test(key) ? key : null;
}

// ─── PIN helpers ─────────────────────────────────────────────────────────────

// PINs are always compared and stored lowercase. On 2026-08-11 the owner was
// locked out of his own admin PIN by typing a capital first letter, because the
// lookup was a case-sensitive .eq() against a plaintext column. Normalizing on
// both write and read removes the footgun permanently.
function normalizePin(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

// Ambiguous glyphs removed (no 0/o, 1/l/i) — these get read aloud, typed from a
// text message, and squinted at on a phone screen.
const PIN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function generatePin(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let out = "frame-";
  for (const b of bytes) out += PIN_ALPHABET[b % PIN_ALPHABET.length];
  return out;
}

/** E.164-ish normalizer for the admin-set reset destination. */
function normalizePhoneE164(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

async function loadTwilioConfig(
  supabase: any,
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
      "TWILIO_MESSAGING_SERVICE_SID",
    ]);
  const cfg: Record<string, string> = {};
  for (const row of data || []) {
    if (row?.key && row?.value) cfg[row.key] = row.value;
  }
  // Env wins over app_config so secrets can be rotated without a DB write.
  for (
    const k of [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
      "TWILIO_MESSAGING_SERVICE_SID",
    ]
  ) {
    const v = Deno.env.get(k);
    if (v) cfg[k] = v;
  }
  return cfg;
}

async function sendTwilioSMS(
  config: Record<string, string>,
  to: string,
  body: string,
): Promise<boolean> {
  const {
    TWILIO_ACCOUNT_SID: sid,
    TWILIO_AUTH_TOKEN: token,
    TWILIO_MESSAGING_SERVICE_SID: msgService,
    TWILIO_PHONE_NUMBER: from,
  } = config;
  if (!sid || !token || (!msgService && !from)) {
    console.error("[lead-crm] Twilio not configured — reset SMS not sent");
    return false;
  }
  const params = new URLSearchParams();
  params.set("To", to);
  params.set("Body", body);
  params.set("From", from || MAIN_LINE);
  if (msgService) params.set("MessagingServiceSid", msgService);

  try {
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
      console.log("[lead-crm] reset SMS queued:", result.sid);
      return true;
    }
    console.error("[lead-crm] Twilio error:", result.message || result);
    return false;
  } catch (err) {
    console.error("[lead-crm] Twilio send threw:", err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  if (!API_KEY) {
    console.error(
      "[lead-crm] LEAD_CRM_API_KEY not set — function disabled (fail closed)",
    );
    return jsonResp({ error: "not_configured" }, 503);
  }
  const key = url.searchParams.get("key");
  if (key !== API_KEY) return jsonResp({ error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown";
  const now = Date.now();

  // ─── PIN RESET (pre-auth) ──────────────────────────────────────────────────
  // Necessarily reachable without a PIN — the whole point is that the caller
  // doesn't have one. Guardrails, in order:
  //   1. The new code is sent ONLY to the phone already on the row. The
  //      requester supplies a name and nothing else, so this can never be used
  //      to mail someone else's PIN to an attacker's handset.
  //   2. Per-IP throttle on a separate "reset:<ip>" key so reset spam can't
  //      exhaust (or be masked by) the login throttle.
  //   3. Per-account cooldown so a known name can't be used to bomb a phone.
  //   4. The response is byte-identical whether or not the account exists, is
  //      active, or has a phone on file — no account enumeration.
  if (url.searchParams.get("action") === "pin_reset") {
    const genericOk = jsonResp({
      ok: true,
      message:
        "If that name matches an active account with a phone on file, a new PIN has been texted to it.",
    });
    if (req.method !== "POST") {
      return jsonResp({
        error: "method_not_allowed",
        message: "Use POST for action=pin_reset",
      }, 405);
    }

    const resetIpKey = `reset:${ip}`;
    const { data: resetAttempt } = await supabase
      .from("auth_attempts")
      .select("ip, fail_count, window_start")
      .eq("ip", resetIpKey)
      .maybeSingle();
    if (!throttleAllows(resetAttempt, now)) {
      return jsonResp({
        error: "too_many_attempts",
        message: "Too many reset requests. Try again later.",
      }, 429);
    }
    // Count every attempt, not just misses — a reset costs an SMS either way.
    await supabase
      .from("auth_attempts")
      .upsert(failedAttemptRow(resetIpKey, resetAttempt, now), {
        onConflict: "ip",
      });

    let resetBody: any;
    try {
      resetBody = await req.json();
    } catch {
      return jsonResp({ error: "bad_json" }, 400);
    }
    const wanted = cleanText(resetBody?.name, 120);
    if (!wanted) return genericOk;

    const { data: candidates } = await supabase
      .from("report_access")
      .select("id, name, phone, active, last_reset_at")
      .ilike("name", wanted.replace(/[%_]/g, "\\$&"));
    const target = (candidates || []).find((r: any) =>
      r.active && r.phone && String(r.name).toLowerCase() === wanted.toLowerCase()
    );
    if (!target) {
      console.log("[lead-crm] pin_reset: no eligible account for a request");
      return genericOk;
    }

    const lastReset = target.last_reset_at
      ? Date.parse(target.last_reset_at)
      : 0;
    if (Number.isFinite(lastReset) && now - lastReset < RESET_COOLDOWN_MS) {
      console.log("[lead-crm] pin_reset: account in cooldown");
      return genericOk;
    }

    const newPin = generatePin();
    const { error: rotateErr } = await supabase
      .from("report_access")
      .update({ pin: newPin, last_reset_at: new Date(now).toISOString() })
      .eq("id", target.id);
    if (rotateErr) {
      console.error("[lead-crm] pin_reset rotate failed:", rotateErr.message);
      return jsonResp({ error: "db_error" }, 500);
    }

    const sent = await sendTwilioSMS(
      await loadTwilioConfig(supabase),
      target.phone,
      `Frame Restoration Utah — your dashboard PIN was reset.\n\nNew PIN: ${newPin}\n\nEnter it at framerestorationutah.com/leads. All lowercase. If you didn't request this, tell Ryan.`,
    );
    if (!sent) {
      console.error(
        "[lead-crm] pin_reset: PIN rotated but SMS failed — account id",
        target.id,
      );
    }
    return genericOk;
  }

  const pin = normalizePin(url.searchParams.get("pin"));
  if (!pin) {
    return jsonResp({ error: "invalid_pin", message: "PIN required." }, 403);
  }

  // Per-IP PIN throttle (≤10 fails / 15 min — _shared/auth-throttle.ts, frozen
  // by auth-throttle.test.ts). PINs are plaintext in a query string; before
  // this, brute force was unthrottled.
  const { data: attemptRow } = await supabase
    .from("auth_attempts")
    .select("ip, fail_count, window_start")
    .eq("ip", ip)
    .maybeSingle();
  if (!throttleAllows(attemptRow, now)) {
    return jsonResp({
      error: "too_many_attempts",
      message: "Too many PIN attempts. Try again later.",
    }, 429);
  }

  // PIN check — same shape as weekly-report
  const { data: accessRow, error: accessErr } = await supabase
    .from("report_access")
    .select("id, name, role, active")
    .eq("pin", pin)
    .single();
  if (accessErr || !accessRow || !accessRow.active) {
    const { error: throttleErr } = await supabase
      .from("auth_attempts")
      .upsert(failedAttemptRow(ip, attemptRow, now), { onConflict: "ip" });
    if (throttleErr) {
      console.error("[lead-crm] auth_attempts upsert failed:", throttleErr);
    }
    return jsonResp({
      error: "invalid_pin",
      message: "Invalid PIN. Access denied.",
    }, 403);
  }
  // Successful auth clears the counter (best-effort).
  if (attemptRow) {
    supabase.from("auth_attempts").delete().eq("ip", ip).then(
      ({ error }: { error: unknown }) => {
        if (error) {
          console.error("[lead-crm] auth_attempts clear failed:", error);
        }
      },
    );
  }
  // Don't block on this — failure to bump last_accessed is non-critical.
  supabase.from("report_access").update({
    last_accessed: new Date().toISOString(),
  }).eq("id", accessRow.id);

  const user = { name: accessRow.name, role: accessRow.role };
  const action = url.searchParams.get("action") || "list";

  // ─── USER MANAGEMENT (admin only) ──────────────────────────────────────────
  // Previously the seo-report + /dashboard admin panels hit /rest/v1/report_access
  // straight from the browser with the anon key. That broke twice over: the key
  // was rotated out from under them, and the baseline RLS hardening revoked anon
  // SELECT on the table anyway. Worse, it meant a table holding every PIN in
  // plaintext was one permissive policy away from being world-readable. Routing
  // through here puts it behind the service role and an explicit admin check.
  if (action.startsWith("users_")) {
    if (user.role !== "admin") {
      return jsonResp({
        error: "forbidden",
        message: "Admin role required.",
      }, 403);
    }

    if (action === "users_list") {
      const { data, error } = await supabase
        .from("report_access")
        .select("id, name, pin, role, active, phone, last_accessed, last_reset_at")
        .order("name");
      if (error) {
        return jsonResp({ error: "db_error", message: error.message }, 500);
      }
      return jsonResp({ user, users: data || [] });
    }

    if (req.method !== "POST") {
      return jsonResp({
        error: "method_not_allowed",
        message: `Use POST for action=${action}`,
      }, 405);
    }
    let uBody: any;
    try {
      uBody = await req.json();
    } catch {
      return jsonResp({ error: "bad_json" }, 400);
    }

    if (action === "users_create") {
      const name = cleanText(uBody.name, 120);
      if (!name) {
        return jsonResp({ error: "bad_name", message: "name is required" }, 400);
      }
      const role = String(uBody.role || "viewer").toLowerCase() === "admin"
        ? "admin"
        : "viewer";
      // A blank PIN means "generate one" — that is the path we want admins on,
      // because hand-picked PINs are how 'landon' ended up guarding every
      // customer's name, phone, and address.
      const pinIn = normalizePin(uBody.pin);
      const newPin = pinIn || generatePin();
      const phone = uBody.phone ? normalizePhoneE164(uBody.phone) : null;
      if (uBody.phone && !phone) {
        return jsonResp({
          error: "bad_phone",
          message: "phone must be a valid number",
        }, 400);
      }

      const { data: clash } = await supabase
        .from("report_access")
        .select("id")
        .eq("pin", newPin)
        .maybeSingle();
      if (clash) {
        return jsonResp({
          error: "pin_taken",
          message: "That PIN is already in use. Pick another or leave it blank.",
        }, 409);
      }

      const { data, error } = await supabase
        .from("report_access")
        .insert({ name, pin: newPin, role, active: true, phone })
        .select("id, name, pin, role, active, phone")
        .single();
      if (error) {
        return jsonResp({ error: "db_error", message: error.message }, 500);
      }
      return jsonResp({ user, created: data });
    }

    if (action === "users_update") {
      const id = cleanText(uBody.id, 64);
      if (!id) {
        return jsonResp({ error: "bad_id", message: "id is required" }, 400);
      }
      const patch: Record<string, unknown> = {};
      if ("active" in uBody) patch.active = !!uBody.active;
      if ("role" in uBody) {
        patch.role = String(uBody.role).toLowerCase() === "admin"
          ? "admin"
          : "viewer";
      }
      if ("phone" in uBody) {
        const p = uBody.phone ? normalizePhoneE164(uBody.phone) : null;
        if (uBody.phone && !p) {
          return jsonResp({
            error: "bad_phone",
            message: "phone must be a valid number",
          }, 400);
        }
        patch.phone = p;
      }
      // rotate_pin is deliberately separate from an admin typing a PIN in.
      if (uBody.rotate_pin) patch.pin = generatePin();
      else if ("pin" in uBody && uBody.pin) patch.pin = normalizePin(uBody.pin);

      if (!Object.keys(patch).length) {
        return jsonResp({ error: "no_fields" }, 400);
      }
      const { data, error } = await supabase
        .from("report_access")
        .update(patch)
        .eq("id", id)
        .select("id, name, pin, role, active, phone, last_accessed")
        .single();
      if (error) {
        return jsonResp({ error: "db_error", message: error.message }, 500);
      }
      return jsonResp({ user, updated: data });
    }

    return jsonResp({ error: "unknown_action", action }, 400);
  }

  // ─── LIST ──────────────────────────────────────────────────────────────────
  if (action === "list") {
    const result = await selectLeads(supabase);
    if (result.error) {
      return jsonResp(
        { error: "db_error", message: result.error.message },
        500,
      );
    }
    return jsonResp({
      user,
      leads: result.leads,
      schema: { crm_parity_ready: result.parityReady },
    });
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────
  if (action === "update") {
    if (req.method !== "POST") {
      return jsonResp({
        error: "method_not_allowed",
        message: "Use POST for action=update",
      }, 405);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResp({ error: "bad_json" }, 400);
    }

    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return jsonResp({
        error: "bad_id",
        message: "id must be a positive integer",
      }, 400);
    }

    // Whitelist of editable columns. Anything else is silently ignored.
    const patch: Record<string, unknown> = {};
    if ("status" in body) {
      const s = String(body.status || "").toLowerCase();
      if (!ALLOWED_STATUS.has(s)) {
        return jsonResp({
          error: "bad_status",
          message: `status must be one of ${[...ALLOWED_STATUS].join(", ")}`,
        }, 400);
      }
      patch.status = s;
    }
    if ("notes" in body) patch.notes = body.notes ? String(body.notes) : null;
    if ("job_value" in body) {
      patch.job_value = body.job_value === null || body.job_value === ""
        ? null
        : Number(body.job_value);
    }
    if ("margin" in body) {
      patch.margin = body.margin === null || body.margin === ""
        ? null
        : Number(body.margin);
    }
    if ("city" in body) {
      patch.city = body.city ? String(body.city).trim() : null;
    }

    // Post-won workflow columns
    if ("deposit_received_at" in body) {
      patch.deposit_received_at = tsOrNull(body.deposit_received_at);
    }
    if ("deposit_amount" in body) {
      patch.deposit_amount = numOrNull(body.deposit_amount);
    }
    if ("install_scheduled_for" in body) {
      patch.install_scheduled_for = dateOrNull(body.install_scheduled_for);
    }
    if ("job_started_at" in body) {
      patch.job_started_at = tsOrNull(body.job_started_at);
    }
    if ("job_completed_at" in body) {
      patch.job_completed_at = tsOrNull(body.job_completed_at);
    }
    if ("balance_due" in body) patch.balance_due = numOrNull(body.balance_due);
    if ("contract_url" in body) {
      patch.contract_url = body.contract_url
        ? String(body.contract_url).trim()
        : null;
    }
    if ("warranty_doc_url" in body) {
      patch.warranty_doc_url = body.warranty_doc_url
        ? String(body.warranty_doc_url).trim()
        : null;
    }
    if ("product" in body) {
      patch.product = body.product ? String(body.product).trim() : null;
    }
    if ("estimated_completion_date" in body) {
      patch.estimated_completion_date = dateOrNull(
        body.estimated_completion_date,
      );
    }
    if ("final_payment_received_at" in body) {
      patch.final_payment_received_at = tsOrNull(
        body.final_payment_received_at,
      );
    }
    // NOTE: commission is a GENERATED column in public.leads with city-aware CASE expression:
    //   margin*0.05 for Heber/Midway, margin*0.10 elsewhere.
    // Writing to it returns Postgres error 428C9. Update margin and/or city — commission
    // recalculates automatically. Rule set by Ryan 2026-05-11; migration shipped same night.

    if (Object.keys(patch).length === 0) {
      return jsonResp({ error: "nothing_to_update" }, 400);
    }

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
    if (updErr) {
      return jsonResp({ error: "db_error", message: updErr.message }, 500);
    }

    return jsonResp({ user, lead: updated });
  }

  // ─── CREATE (manual lead entry) ────────────────────────────────────────────
  if (action === "create") {
    if (req.method !== "POST") {
      return jsonResp({
        error: "method_not_allowed",
        message: "Use POST for action=create",
      }, 405);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResp({ error: "bad_json" }, 400);
    }

    const name = String(body.name || "").trim();
    if (!name) {
      return jsonResp(
        { error: "missing_name", message: "Name is required" },
        400,
      );
    }

    const status = String(body.status || "new").toLowerCase();
    if (!ALLOWED_STATUS.has(status)) {
      return jsonResp({
        error: "bad_status",
        message: `status must be one of ${[...ALLOWED_STATUS].join(", ")}`,
      }, 400);
    }

    const tier = String(body.tier || "general").toLowerCase();
    const allowedTiers = new Set([
      "emergency",
      "urgent",
      "scheduled",
      "general",
      "spam",
      "unclassified",
    ]);
    if (!allowedTiers.has(tier)) return jsonResp({ error: "bad_tier" }, 400);

    const phone = body.phone ? String(body.phone).trim() : null;
    const email = body.email ? String(body.email).trim() : null;
    const address = body.address ? String(body.address).trim() : null;
    const city = body.city ? String(body.city).trim() : null;
    const service = body.service ? String(body.service).trim() : null;
    const message = body.message ? String(body.message) : null;
    const notes = body.notes ? String(body.notes) : null;
    const jobValue = body.job_value === null || body.job_value === "" ||
        body.job_value === undefined
      ? null
      : Number(body.job_value);
    const margin =
      body.margin === null || body.margin === "" || body.margin === undefined
        ? null
        : Number(body.margin);

    if (jobValue !== null && !Number.isFinite(jobValue)) {
      return jsonResp({ error: "bad_job_value" }, 400);
    }
    if (margin !== null && !Number.isFinite(margin)) {
      return jsonResp({ error: "bad_margin" }, 400);
    }

    const insertRow: Record<string, unknown> = {
      name,
      phone,
      email,
      address,
      city,
      service,
      message,
      notes,
      status,
      tier,
      job_value: jobValue,
      margin,
      source_page: body.source_page || "manual-entry",
      tier_classifier: "manual",
      tier_reason: "Created via /leads Add Lead form",
    };
    if (status === "won") {
      insertRow.won_at = body.won_at
        ? new Date(body.won_at).toISOString()
        : new Date().toISOString();
    }

    const { data: created, error: insErr } = await supabase
      .from("leads")
      .insert(insertRow)
      .select()
      .single();
    if (insErr) {
      return jsonResp({ error: "db_error", message: insErr.message }, 500);
    }

    return jsonResp({ user, lead: created });
  }

  // ─── CLICKS ────────────────────────────────────────────────────────────────
  // Returns phone_clicks aggregated for the leads dashboard. Counts by source +
  // type, plus most recent N rows for the live feed.
  if (action === "clicks") {
    const days = Math.max(
      1,
      Math.min(365, Number(url.searchParams.get("days") || 30)),
    );
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: rows, error: clicksErr } = await supabase
      .from("phone_clicks")
      .select(
        "id, created_at, click_type, phone, source, source_page, referrer, city, gclid, utm_source, utm_medium, utm_campaign",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);
    if (clicksErr) {
      return jsonResp({ error: "db_error", message: clicksErr.message }, 500);
    }

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
      recent: list.slice(0, 50),
    });
  }

  // ─── GROWTH QUEUE STATE ────────────────────────────────────────────────────
  if (action === "growth_state") {
    const { data: actions, error } = await supabase
      .from("growth_queue_actions")
      .select(
        "action_key, state, assigned_to, snoozed_until, note, completed_at, updated_at, updated_by_name, updated_by_role, action_title, category, priority",
      )
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (error) {
      if (isMissingSchemaError(error)) {
        return jsonResp({ user, storage_ready: false, actions: [] });
      }
      return jsonResp({ error: "db_error", message: error.message }, 500);
    }
    return jsonResp({ user, storage_ready: true, actions: actions || [] });
  }

  if (action === "growth_update") {
    if (req.method !== "POST") {
      return jsonResp({
        error: "method_not_allowed",
        message: "Use POST for action=growth_update",
      }, 405);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResp({ error: "bad_json" }, 400);
    }

    const actionKey = cleanActionKey(body.action_key);
    if (!actionKey) {
      return jsonResp({
        error: "bad_action_key",
        message: "action_key must be 2-240 URL-safe characters.",
      }, 400);
    }

    const state = String(body.state || "open").toLowerCase();
    if (!ALLOWED_GROWTH_STATES.has(state)) {
      return jsonResp({
        error: "bad_growth_state",
        message: "state must be open, done, or snoozed",
      }, 400);
    }

    const snoozedUntil = state === "snoozed"
      ? dateOrNull(body.snoozed_until)
      : null;
    if (state === "snoozed" && !snoozedUntil) {
      return jsonResp({
        error: "bad_snooze_date",
        message: "snoozed_until must be YYYY-MM-DD when state=snoozed.",
      }, 400);
    }

    const now = new Date().toISOString();
    const row = {
      action_key: actionKey,
      state,
      assigned_to: cleanText(body.assigned_to, 120),
      snoozed_until: snoozedUntil,
      note: cleanText(body.note, 1000),
      completed_at: state === "done" ? now : null,
      last_seen_at: now,
      action_title: cleanText(body.action_title, 240),
      category: cleanText(body.category, 80),
      priority: cleanText(body.priority, 20),
      updated_by_name: user.name,
      updated_by_role: user.role,
    };

    const { data: saved, error } = await supabase
      .from("growth_queue_actions")
      .upsert(row, { onConflict: "action_key" })
      .select(
        "action_key, state, assigned_to, snoozed_until, note, completed_at, updated_at, updated_by_name, updated_by_role, action_title, category, priority",
      )
      .single();
    if (error) {
      if (isMissingSchemaError(error)) {
        return jsonResp({
          error: "storage_not_ready",
          message:
            "Apply the prepared growth_queue_actions migration before saving Growth Queue state.",
        }, 409);
      }
      return jsonResp({ error: "db_error", message: error.message }, 500);
    }

    return jsonResp({ user, action: saved });
  }

  return jsonResp({
    error: "unknown_action",
    message:
      `action must be 'list', 'create', 'update', 'clicks', 'growth_state', or 'growth_update' (got '${action}')`,
  }, 400);
});
