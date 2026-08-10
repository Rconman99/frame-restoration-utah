// lead-crm — Frame Roofing Utah
// ─────────────────────────────────────────────────────────────────────────────
// Session-gated CRM backend for /leads.html and dashboard access administration.
// Login accepts the routing key + PIN in a POST body exactly once, upgrades a
// matching legacy plaintext credential to HMAC form, and returns a short-lived
// signed token. Every later action requires Authorization: Bearer.
//
// Endpoints (single function, dispatched by ?action=...):
//   POST ?action=login  body: { routing_key, pin }
//        → { token, expires_in, user }
//   GET  ?action=list   Authorization: Bearer <token>
//        → { user, leads: [...] }   (all leads, all columns, newest first)
//   POST ?action=update   Authorization: Bearer <token>
//        body: { id, status?, notes?, job_value?, commission? }
//        → { user, lead }           (returns updated row)
//   Admin-only access_list/access_create/access_toggle/access_reset actions
//        → never select or return an existing PIN.
//
// Role contract: viewer = weekly report only (rejected here), sales = CRM,
// admin = CRM + access management. Unknown roles fail closed.
//
// Side effect: when status flips from non-won → won, won_at is set to NOW().
//
// Protected deploys run only through .github/workflows/deploy-edge-function.yml
// after exact-main CI and the signed client-IP/dashboard receipt gates. Never
// deploy lead-crm directly.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AUTH_THROTTLE_RPC,
  dashboardThrottleKey,
  parseThrottleReservation,
} from "../_shared/auth-throttle.ts";
import {
  actionAllowed,
  normalizeAccessRole,
  publicAccessUser,
  validNewPin,
} from "../_shared/crm-access.ts";
import {
  dashboardCredentialPepperReady,
  hashDashboardPin,
  legacyPinCandidate,
  parseDashboardAuthRpcResult,
} from "../_shared/dashboard-credential.ts";
import {
  bearerToken,
  DASHBOARD_SESSION_TTL_SECONDS,
  dashboardSessionMatchesVersion,
  dashboardSessionSecretReady,
  dashboardSessionVersion,
  issueDashboardSession,
  verifyDashboardSession,
} from "../_shared/dashboard-session.ts";
import { readBoundedJsonObject } from "../_shared/bounded-json.ts";

const SUPABASE_URL = "https://hdcflshhomzildwqlmwh.supabase.co";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// The key ships in public leads.html, so it is a routing token, not a secret —
// the PIN (+ per-IP throttle below) is the real auth. Env-driven so it can be
// rotated without a redeploy; unset = function disabled (fail closed).
const API_KEY = Deno.env.get("LEAD_CRM_API_KEY") ?? "";
const SESSION_SECRET = Deno.env.get("DASHBOARD_SESSION_SECRET") ?? "";
const CREDENTIAL_PEPPER = Deno.env.get("DASHBOARD_CREDENTIAL_PEPPER") ?? "";
const LOGIN_JSON_BODY_LIMIT_BYTES = 1024;
const AUTHENTICATED_JSON_BODY_LIMIT_BYTES = 64 * 1024;

const ALLOWED_STATUS = new Set([
  "new",
  "contacted",
  "estimated",
  "won",
  "lost",
  "third_party",
  "ul_request",
  "spam",
]);
const ALLOWED_GROWTH_STATES = new Set(["open", "done", "snoozed"]);
const KNOWN_ACTIONS = new Set([
  "login",
  "session",
  "list",
  "create",
  "update",
  "clicks",
  "growth_state",
  "growth_update",
  "access_list",
  "access_create",
  "access_toggle",
  "access_reset",
]);

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
  notified, notified_at, notification_attempts, notification_error,
  lead_notifications (
    recipient_role, status, attempts, retryable, accepted_at, delivered_at,
    last_event_at, last_error_code, last_error
  )
`;

const OPTIONAL_LEAD_DEFAULTS = {
  estimated_completion_date: null,
  final_payment_received_at: null,
  notified: null,
  notified_at: null,
  notification_attempts: 0,
  notification_error: null,
  lead_notifications: [],
};

const ALLOWED_ORIGINS = new Set([
  "https://www.framerestorationutah.com",
  "https://framerestorationutah.com",
]);

// Production origins are fixed. A bounded list of exact Vercel preview origins
// may be enabled for QA; malformed values and wildcard hosts are ignored.
for (
  const candidate of (Deno.env.get("DASHBOARD_PREVIEW_ORIGINS") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
) {
  try {
    const preview = new URL(candidate);
    if (
      preview.protocol === "https:" && preview.origin === candidate &&
      preview.hostname.endsWith(".vercel.app")
    ) {
      ALLOWED_ORIGINS.add(preview.origin);
    }
  } catch {
    // Invalid entries must not broaden the protected dashboard CORS surface.
  }
}

function responseHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResp(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(req),
  });
}

function isMissingSchemaError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const msg = String(e?.message || "").toLowerCase();
  return e?.code === "42703" ||
    e?.code === "42P01" ||
    e?.code === "PGRST202" ||
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

function cleanUuid(value: unknown): string | null {
  const id = cleanText(value, 36);
  return id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(id)
    ? id
    : null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResp(req, { error: "origin_forbidden" }, 403);
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: responseHeaders(req) });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "list";
  if (!KNOWN_ACTIONS.has(action)) {
    return jsonResp(req, { error: "unknown_action" }, 400);
  }
  if (url.searchParams.has("key") || url.searchParams.has("pin")) {
    return jsonResp(req, {
      error: "credentials_in_url",
      message: "Credentials must never be sent in a URL.",
    }, 400);
  }
  if (
    !API_KEY || !dashboardSessionSecretReady(SESSION_SECRET) ||
    !dashboardCredentialPepperReady(CREDENTIAL_PEPPER) ||
    SESSION_SECRET === CREDENTIAL_PEPPER
  ) {
    console.error(
      "[lead-crm] routing key or distinct session/credential secrets not configured — disabled",
    );
    return jsonResp(req, { error: "not_configured" }, 503);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  let accessRow: {
    id: string;
    name: string;
    role: unknown;
    active: boolean;
    session_version: number;
  };

  // ─── LOGIN ─────────────────────────────────────────────────────────────────
  // Routing key + PIN are accepted only in a POST body. Every login POST first
  // consumes one atomic per-IP throttle reservation, including successful and
  // malformed attempts. A successful legacy plaintext match is upgraded to
  // pin_hash before a token is issued.
  if (action === "login") {
    if (req.method !== "POST") {
      return jsonResp(req, { error: "method_not_allowed" }, 405);
    }

    // reserve_dashboard_login_attempt is SECURITY DEFINER and callable only by
    // service_role. Its INSERT .. ON CONFLICT update is the sole counter writer,
    // so simultaneous attempts cannot lose increments. Any RPC/schema/response
    // problem disables login instead of silently bypassing the throttle.
    let throttleIdentity: { key: string; source: string };
    try {
      throttleIdentity = await dashboardThrottleKey(
        SESSION_SECRET,
        req.headers,
      );
    } catch (error) {
      console.error("[lead-crm] login throttle identity failed:", error);
      return jsonResp(req, { error: "auth_unavailable" }, 503);
    }
    console.log(
      "[lead-crm] login throttle identity source:",
      throttleIdentity.source,
    );
    const { data: throttleData, error: throttleError } = await supabase.rpc(
      AUTH_THROTTLE_RPC,
      { p_ip: throttleIdentity.key },
    );
    if (throttleError) {
      console.error(
        "[lead-crm] atomic login throttle reservation failed:",
        throttleError,
      );
      return jsonResp(req, { error: "auth_unavailable" }, 503);
    }
    const reservation = parseThrottleReservation(throttleData);
    if (!reservation) {
      console.error("[lead-crm] atomic login throttle returned invalid data");
      return jsonResp(req, { error: "auth_unavailable" }, 503);
    }
    if (!reservation.allowed) {
      return jsonResp(req, {
        error: "too_many_attempts",
        message: "Too many login attempts. Try again later.",
        retry_after_seconds: reservation.retry_after_seconds,
      }, 429);
    }
    const bodyResult = await readBoundedJsonObject(
      req,
      LOGIN_JSON_BODY_LIMIT_BYTES,
    );
    if (!bodyResult.ok) {
      return jsonResp(req, { error: bodyResult.error }, bodyResult.status);
    }
    const body = bodyResult.value;
    const routingKey = cleanText(body.routing_key, 240);
    const pin = cleanText(body.pin, 32);
    if (routingKey !== API_KEY || !legacyPinCandidate(pin)) {
      return jsonResp(req, { error: "invalid_credentials" }, 403);
    }

    const pinHash = await hashDashboardPin(CREDENTIAL_PEPPER, pin);
    // Both the plaintext transition candidate and its HMAC stay in this RPC's
    // POST body. PostgREST filters would put either value into a request URL.
    const { data: authData, error: authError } = await supabase.rpc(
      "authenticate_dashboard_access",
      { p_pin: pin, p_pin_hash: pinHash },
    );
    if (authError) {
      if (isMissingSchemaError(authError)) {
        console.error("[lead-crm] dashboard credential RPC is not deployed");
        return jsonResp(req, { error: "credential_schema_not_ready" }, 503);
      }
      console.error("[lead-crm] dashboard credential RPC failed:", authError);
      return jsonResp(req, { error: "auth_unavailable" }, 503);
    }
    const authResult = parseDashboardAuthRpcResult(authData);
    if (!authResult) {
      console.error(
        "[lead-crm] dashboard credential RPC returned invalid data",
      );
      return jsonResp(req, { error: "auth_unavailable" }, 503);
    }
    if (authResult.kind === "none") {
      return jsonResp(req, { error: "invalid_credentials" }, 403);
    }
    const authenticated = authResult.identity;

    if (!dashboardSessionVersion(authenticated.session_version)) {
      console.error("[lead-crm] invalid report_access session_version");
      return jsonResp(req, { error: "credential_schema_not_ready" }, 503);
    }
    const loginRole = normalizeAccessRole(authenticated.role);
    if (!loginRole) {
      console.error(
        `[lead-crm] rejecting unsupported report_access role for id ${authenticated.id}`,
      );
      return jsonResp(req, { error: "role_not_configured" }, 403);
    }
    const token = await issueDashboardSession(
      SESSION_SECRET,
      authenticated.id,
      authenticated.session_version,
    );
    return jsonResp(req, {
      token,
      token_type: "Bearer",
      expires_in: DASHBOARD_SESSION_TTL_SECONDS,
      user: { name: authenticated.name, role: loginRole },
    });
  }

  // ─── SESSION AUTHORIZATION ─────────────────────────────────────────────────
  const token = bearerToken(req.headers.get("authorization"));
  const claims = token
    ? await verifyDashboardSession(SESSION_SECRET, token)
    : null;
  if (!claims) {
    return jsonResp(req, { error: "invalid_session" }, 401);
  }
  const sessionLookup = await supabase
    .from("report_access")
    .select("id, name, role, active, session_version")
    .eq("id", claims.sub)
    .maybeSingle();
  if (sessionLookup.error) {
    console.error(
      "[lead-crm] session identity lookup failed:",
      sessionLookup.error,
    );
    return jsonResp(req, { error: "auth_unavailable" }, 503);
  }
  if (
    !sessionLookup.data?.active ||
    !dashboardSessionMatchesVersion(
      claims,
      sessionLookup.data.session_version,
    )
  ) {
    return jsonResp(req, { error: "invalid_session" }, 401);
  }
  accessRow = sessionLookup.data;

  const role = normalizeAccessRole(accessRow.role);
  if (!role) {
    console.error(
      `[lead-crm] rejecting unsupported report_access role for id ${accessRow.id}`,
    );
    return jsonResp(req, {
      error: "role_not_configured",
      message: "This account role is not configured for CRM access.",
    }, 403);
  }
  const user = { name: accessRow.name, role };
  if (action === "session") return jsonResp(req, { user });
  if (!actionAllowed(role, action)) {
    return jsonResp(req, {
      error: "role_forbidden",
      message: role === "viewer"
        ? "This PIN has report-only access. A sales or admin role is required for the CRM."
        : "Administrator access is required for access management.",
    }, 403);
  }

  // ─── ACCESS MANAGEMENT (admin only; authorization enforced above) ─────────
  // All responses intentionally omit `pin`. Existing credentials must never be
  // retrievable by a browser, including by an authenticated administrator.
  if (action === "access_list") {
    if (req.method !== "GET") {
      return jsonResp(req, { error: "method_not_allowed" }, 405);
    }
    const { data: rows, error } = await supabase
      .from("report_access")
      .select("id, name, role, active, last_accessed, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      return jsonResp(req, { error: "db_error" }, 500);
    }
    return jsonResp(req, {
      user,
      access: (rows || []).map((row: Record<string, unknown>) =>
        publicAccessUser(row)
      ),
    });
  }

  if (action === "access_create") {
    if (req.method !== "POST") {
      return jsonResp(req, { error: "method_not_allowed" }, 405);
    }
    const bodyResult = await readBoundedJsonObject(
      req,
      AUTHENTICATED_JSON_BODY_LIMIT_BYTES,
    );
    if (!bodyResult.ok) {
      return jsonResp(req, { error: bodyResult.error }, bodyResult.status);
    }
    const body = bodyResult.value;
    const name = cleanText(body.name, 120);
    const newRole = normalizeAccessRole(body.role);
    if (!name) {
      return jsonResp(
        req,
        { error: "bad_name", message: "Name is required." },
        400,
      );
    }
    if (!newRole) {
      return jsonResp(req, {
        error: "bad_role",
        message: "Role must be viewer, sales, or admin.",
      }, 400);
    }
    if (!validNewPin(body.pin)) {
      return jsonResp(req, {
        error: "bad_pin",
        message: "PIN must contain 6-12 digits.",
      }, 400);
    }
    const pinHash = await hashDashboardPin(CREDENTIAL_PEPPER, body.pin);
    const { data: createdId, error: createError } = await supabase.rpc(
      "create_dashboard_access",
      {
        p_name: name,
        p_role: newRole,
        p_pin: body.pin,
        p_pin_hash: pinHash,
      },
    );
    if (createError) {
      console.error("[lead-crm] access_create failed:", createError.code);
      return jsonResp(req, {
        error: createError.code === "23505" ? "pin_unavailable" : "db_error",
        message: createError.code === "23505"
          ? "Choose a different PIN."
          : "Could not create access.",
      }, createError.code === "23505" ? 409 : 500);
    }
    const id = cleanUuid(createdId);
    if (!id) {
      console.error("[lead-crm] access_create returned an invalid id");
      return jsonResp(req, { error: "db_error" }, 500);
    }
    const { data: created, error } = await supabase
      .from("report_access")
      .select("id, name, role, active, last_accessed, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[lead-crm] access_create failed:", error.code);
      return jsonResp(req, { error: "db_error" }, 500);
    }
    if (!created) {
      return jsonResp(req, { error: "db_error" }, 500);
    }
    return jsonResp(req, { user, access: publicAccessUser(created) }, 201);
  }

  if (action === "access_toggle") {
    if (req.method !== "POST") {
      return jsonResp(req, { error: "method_not_allowed" }, 405);
    }
    const bodyResult = await readBoundedJsonObject(
      req,
      AUTHENTICATED_JSON_BODY_LIMIT_BYTES,
    );
    if (!bodyResult.ok) {
      return jsonResp(req, { error: bodyResult.error }, bodyResult.status);
    }
    const body = bodyResult.value;
    const id = cleanUuid(body.id);
    if (!id || typeof body.active !== "boolean") {
      return jsonResp(req, { error: "bad_access_update" }, 400);
    }
    if (id === String(accessRow.id) && body.active === false) {
      return jsonResp(req, {
        error: "self_disable_blocked",
        message: "You cannot disable your current administrator PIN.",
      }, 409);
    }
    const { data: activeVersion, error: activeError } = await supabase.rpc(
      "set_dashboard_access_active",
      { p_id: id, p_active: body.active },
    );
    if (activeError) {
      console.error("[lead-crm] access_toggle failed:", activeError.code);
      return jsonResp(req, { error: "db_error" }, 500);
    }
    if (!dashboardSessionVersion(activeVersion)) {
      return jsonResp(req, { error: "not_found" }, 404);
    }
    const { data: updated, error } = await supabase
      .from("report_access")
      .select("id, name, role, active, last_accessed, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return jsonResp(req, { error: "db_error" }, 500);
    if (!updated) return jsonResp(req, { error: "not_found" }, 404);
    return jsonResp(req, { user, access: publicAccessUser(updated) });
  }

  if (action === "access_reset") {
    if (req.method !== "POST") {
      return jsonResp(req, { error: "method_not_allowed" }, 405);
    }
    const bodyResult = await readBoundedJsonObject(
      req,
      AUTHENTICATED_JSON_BODY_LIMIT_BYTES,
    );
    if (!bodyResult.ok) {
      return jsonResp(req, { error: bodyResult.error }, bodyResult.status);
    }
    const body = bodyResult.value;
    const id = cleanUuid(body.id);
    if (!id || !validNewPin(body.pin)) {
      return jsonResp(req, {
        error: "bad_pin_reset",
        message: "A valid user and a 6-12 digit PIN are required.",
      }, 400);
    }
    const pinHash = await hashDashboardPin(CREDENTIAL_PEPPER, body.pin);
    const { data: resetVersion, error: resetError } = await supabase.rpc(
      "reset_dashboard_access_credential",
      { p_id: id, p_pin: body.pin, p_pin_hash: pinHash },
    );
    if (resetError) {
      console.error("[lead-crm] access_reset failed:", resetError.code);
      return jsonResp(req, {
        error: resetError.code === "23505" ? "pin_unavailable" : "db_error",
        message: resetError.code === "23505"
          ? "Choose a different PIN."
          : "Could not reset the PIN.",
      }, resetError.code === "23505" ? 409 : 500);
    }
    if (!dashboardSessionVersion(resetVersion)) {
      return jsonResp(req, { error: "not_found" }, 404);
    }
    const { data: updated, error } = await supabase
      .from("report_access")
      .select("id, name, role, active, last_accessed, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[lead-crm] access_reset reload failed:", error.code);
      return jsonResp(req, { error: "db_error" }, 500);
    }
    if (!updated) return jsonResp(req, { error: "not_found" }, 404);
    return jsonResp(req, {
      user,
      access: publicAccessUser(updated),
      session_revoked: id === accessRow.id,
    });
  }

  // ─── LIST ──────────────────────────────────────────────────────────────────
  if (action === "list") {
    const result = await selectLeads(supabase);
    if (result.error) {
      return jsonResp(
        req,
        { error: "db_error", message: result.error.message },
        500,
      );
    }
    return jsonResp(req, {
      user,
      leads: result.leads,
      schema: {
        crm_parity_ready: result.parityReady,
        notification_outbox_ready: result.parityReady,
      },
    });
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────
  if (action === "update") {
    if (req.method !== "POST") {
      return jsonResp(req, {
        error: "method_not_allowed",
        message: "Use POST for action=update",
      }, 405);
    }

    const bodyResult = await readBoundedJsonObject(
      req,
      AUTHENTICATED_JSON_BODY_LIMIT_BYTES,
    );
    if (!bodyResult.ok) {
      return jsonResp(req, { error: bodyResult.error }, bodyResult.status);
    }
    const body = bodyResult.value;

    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return jsonResp(req, {
        error: "bad_id",
        message: "id must be a positive integer",
      }, 400);
    }

    // Whitelist of editable columns. Anything else is silently ignored.
    const patch: Record<string, unknown> = {};
    if ("status" in body) {
      const s = String(body.status || "").toLowerCase();
      if (!ALLOWED_STATUS.has(s)) {
        return jsonResp(req, {
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
      return jsonResp(req, { error: "nothing_to_update" }, 400);
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
      return jsonResp(req, { error: "db_error", message: updErr.message }, 500);
    }

    return jsonResp(req, { user, lead: updated });
  }

  // ─── CREATE (manual lead entry) ────────────────────────────────────────────
  if (action === "create") {
    if (req.method !== "POST") {
      return jsonResp(req, {
        error: "method_not_allowed",
        message: "Use POST for action=create",
      }, 405);
    }

    const bodyResult = await readBoundedJsonObject(
      req,
      AUTHENTICATED_JSON_BODY_LIMIT_BYTES,
    );
    if (!bodyResult.ok) {
      return jsonResp(req, { error: bodyResult.error }, bodyResult.status);
    }
    const body = bodyResult.value;

    const name = String(body.name || "").trim();
    if (!name) {
      return jsonResp(req, {
        error: "missing_name",
        message: "Name is required",
      }, 400);
    }

    const status = String(body.status || "new").toLowerCase();
    if (!ALLOWED_STATUS.has(status)) {
      return jsonResp(req, {
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
    if (!allowedTiers.has(tier)) {
      return jsonResp(req, { error: "bad_tier" }, 400);
    }

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
      return jsonResp(req, { error: "bad_job_value" }, 400);
    }
    if (margin !== null && !Number.isFinite(margin)) {
      return jsonResp(req, { error: "bad_margin" }, 400);
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
        ? new Date(String(body.won_at)).toISOString()
        : new Date().toISOString();
    }

    const { data: created, error: insErr } = await supabase
      .from("leads")
      .insert(insertRow)
      .select()
      .single();
    if (insErr) {
      return jsonResp(req, { error: "db_error", message: insErr.message }, 500);
    }

    return jsonResp(req, { user, lead: created });
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
      return jsonResp(
        req,
        { error: "db_error", message: clicksErr.message },
        500,
      );
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

    return jsonResp(req, {
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
        return jsonResp(req, { user, storage_ready: false, actions: [] });
      }
      return jsonResp(req, { error: "db_error", message: error.message }, 500);
    }
    return jsonResp(req, { user, storage_ready: true, actions: actions || [] });
  }

  if (action === "growth_update") {
    if (req.method !== "POST") {
      return jsonResp(req, {
        error: "method_not_allowed",
        message: "Use POST for action=growth_update",
      }, 405);
    }

    const bodyResult = await readBoundedJsonObject(
      req,
      AUTHENTICATED_JSON_BODY_LIMIT_BYTES,
    );
    if (!bodyResult.ok) {
      return jsonResp(req, { error: bodyResult.error }, bodyResult.status);
    }
    const body = bodyResult.value;

    const actionKey = cleanActionKey(body.action_key);
    if (!actionKey) {
      return jsonResp(req, {
        error: "bad_action_key",
        message: "action_key must be 2-240 URL-safe characters.",
      }, 400);
    }

    const state = String(body.state || "open").toLowerCase();
    if (!ALLOWED_GROWTH_STATES.has(state)) {
      return jsonResp(req, {
        error: "bad_growth_state",
        message: "state must be open, done, or snoozed",
      }, 400);
    }

    const snoozedUntil = state === "snoozed"
      ? dateOrNull(body.snoozed_until)
      : null;
    if (state === "snoozed" && !snoozedUntil) {
      return jsonResp(req, {
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
        return jsonResp(req, {
          error: "storage_not_ready",
          message:
            "Apply the prepared growth_queue_actions migration before saving Growth Queue state.",
        }, 409);
      }
      return jsonResp(req, { error: "db_error", message: error.message }, 500);
    }

    return jsonResp(req, { user, action: saved });
  }

  return jsonResp(req, { error: "unknown_action" }, 400);
});
