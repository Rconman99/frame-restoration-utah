// handle-lead v10 — Frame Restoration Utah
// ─────────────────────────────────────────────────────────────────────────────
// v9 (2026-06-10): TCPA consent gate + A2P opt-out line + frozen SMS contract.
//   The form has ALWAYS sent sms_consent; v8 dropped it on the floor and
//   auto-texted every valid phone. v9 stores it (leads.sms_consent, migration
//   20260610) and refuses the customer auto-text without it. The SMS message
//   builders moved to _shared/lead-sms.ts (every auto-reply now ends with the
//   A2P "Reply STOP to opt out." line) and are frozen by lead-sms.test.ts —
//   the blocking lead-sms-contract CI job. All Utah SMS paths are additionally
//   fail-closed behind UTAH_LEAD_SMS_ENABLED="true"; it remains absent while
//   Utah SMS is paused.
// v8 (2026-05-10): Replace Formspree with Resend for outbound email.
//   Formspree's free tier (50/mo) was being burned at 2x per lead — once for
//   Landon's notification email, once for the Verizon SMS gateway. Resend's
//   free tier is 100/day / 3000/mo and lets us send from leads@frameroofingutah.com.
// v7 adds urgency-tier classification (heuristic-first, OpenRouter LLM fallback).
// Tier drives notification routing: emergency leads page Landon louder; spam is
// silently dropped to DB without notifying anyone.
//
// Source-of-truth for this function lives in this canonical repository:
//   ~/.frame-automation/repos/frame-restoration-utah/supabase/functions/handle-lead/index.ts
//
// Protected deploys run only through .github/workflows/deploy-edge-function.yml
// after exact-main CI and signed client-IP/owner-notification receipt gates.
// Never deploy handle-lead directly; see DEPLOY.md.
//
// Required Deno secrets (set via `supabase secrets set KEY=val --project-ref hdcflshhomzildwqlmwh`):
//   UTAH_LEAD_RESEND_API_KEY (Utah-scoped; no generic-key fallback).
//   LEAD_INTAKE_RATE_LIMIT_SECRET (distinct random value, at least 32 bytes).
//   UTAH_LEAD_SMS_ENABLED (optional; only exact "true" enables any SMS path).
//   OPENROUTER_API_KEY  ← from v7. Without it, classifier silently falls back to 'scheduled'.
//   OPENROUTER_MODEL    ← optional. Defaults to google/gemini-2.0-flash-001 if unset.
//
// Required app_config rows (insert via SQL):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID (or TWILIO_PHONE_NUMBER)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ipHashSecretReady } from "../_shared/client-ip.ts";
import { applySender } from "../_shared/twilio-sender.ts";
import {
  LEAD_INTAKE_RATE_LIMIT_RPC,
  leadIntakeThrottleKey,
  nativeLeadSubmissionKey,
  parseLeadIntakeRateReservation,
} from "../_shared/lead-intake-rate-limit.ts";
import {
  customerAutoReply,
  shouldSendCustomerAutoText,
  smsDeliveryEnabled,
  smsForLandon,
} from "../_shared/lead-sms.ts";
import {
  type Classification,
  coerceLlmClassification,
  fallbackClassification,
  heuristicClassify,
  type Tier,
} from "../_shared/lead-tier.ts";
import {
  deferredNotificationOutcome,
  isUuid,
  LEAD_NOTIFICATION_CLAIM_RPC,
  LEAD_NOTIFICATION_COMPLETE_RPC,
  MAX_NOTIFICATION_ATTEMPTS,
  notificationAttemptDue,
  type NotificationClaim,
  notificationClaimArgs,
  notificationCompletionArgs,
  notificationConfigurationOutage,
  notificationFromPersistedLead,
  notificationRetryAllowed,
  type NotificationRole,
  notificationRoleRouteOutage,
  notificationSettings,
  parseNotificationClaim,
  PERSISTED_LEAD_NOTIFICATION_SELECT,
  resendCredentialOutage,
  type ResendOutcome,
  sendOwnerNotificationEmail,
  sendResendEmail,
} from "../_shared/lead-notification.ts";
import {
  leadFailureResponse,
  leadHoneypotFilled,
  LeadRequestError,
  leadSuccessResponse,
  parseLeadRequest,
  validateLeadContact,
} from "../_shared/lead-request.ts";

const SUPABASE_URL = "https://hdcflshhomzildwqlmwh.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const LEAD_INTAKE_RATE_LIMIT_SECRET = Deno.env.get(
  "LEAD_INTAKE_RATE_LIMIT_SECRET",
) || "";
const LANDON_PHONE = "+14353024422";
const DEFAULT_CLASSIFIER_MODEL = "google/gemini-2.0-flash-001";
const CLASSIFIER_TIMEOUT_MS = 3000;
const NOTIFICATION_SETTINGS = notificationSettings((key) => Deno.env.get(key));
const UTAH_LEAD_SMS_ENABLED = smsDeliveryEnabled(
  Deno.env.get("UTAH_LEAD_SMS_ENABLED"),
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tier / Classification + heuristicClassify / coerceLlmClassification /
// fallbackClassification now live in _shared/lead-tier.ts (frozen by
// lead-tier.test.ts). Imported above.

// ─── Config helpers ──────────────────────────────────────────────────────────

async function getConfig(
  supabase: any,
  keys: string[],
): Promise<Record<string, string>> {
  const { data } = await supabase.from("app_config").select("key, value").in(
    "key",
    keys,
  );
  const out: Record<string, string> = {};
  for (const row of data || []) out[row.key] = row.value;
  return out;
}

// ─── Phone normalization ─────────────────────────────────────────────────────

// ─── Tier classification ─────────────────────────────────────────────────────

const CLASSIFIER_PROMPT =
  `You triage roofing leads for Frame Restoration Utah, a contractor in Utah serving Heber City, Park City, Salt Lake metro and surrounding areas.

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
  payload: {
    name: string;
    issue: string;
    message: string;
    city: string;
    zip: string;
  },
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
        temperature: 0.1, // we want deterministic classification, not creativity
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

    const coerced = coerceLlmClassification(parsed, model);
    if (!coerced) {
      console.error("Classifier returned invalid tier:", parsed.tier);
      return null;
    }
    return coerced;
  } catch (e) {
    console.error("Classifier error:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function classifyLead(
  apiKey: string,
  model: string,
  payload: {
    name: string;
    issue: string;
    message: string;
    city: string;
    zip: string;
  },
): Promise<Classification> {
  const heuristic = heuristicClassify(payload.issue, payload.message);
  if (heuristic) return heuristic;

  const llm = await llmClassify(apiKey, model, payload);
  if (llm) return llm;

  // Fail-open: never lose a lead because the classifier broke.
  return fallbackClassification();
}

// ─── Notification helpers ────────────────────────────────────────────────────

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
  if (!sid || !token || (!msgService && !from)) return false;

  const params = new URLSearchParams();
  params.set("To", to);
  params.set("Body", body);
  // Sender is pinned centrally — see _shared/twilio-sender.ts. Never set From
  // in an else branch: the Messaging Service pool would pick the sender.
  applySender(params, { from, msgService });

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

// ─── Resend email helper ─────────────────────────────────────────────────────
// Resend replaces Formspree as our outbound email service (2026-05-10).
// Formspree free tier (50/mo) was being burned at 2x per lead: 1 for Landon's
// notification email + 1 for the Verizon SMS gateway path. Resend free tier is
// 100/day / 3000/mo — covers Frame Roofing volume for years.
//
// Setup:
//   UTAH_LEAD_RESEND_API_KEY, UTAH_LEAD_RESEND_FROM,
//   UTAH_LEAD_RESEND_SMS_FROM, LEAD_NOTIFICATION_PRIMARY_EMAIL,
//   LEAD_NOTIFICATION_BACKUP_EMAIL.
// Each recipient is sent independently with a deterministic Resend idempotency
// key, so provider status and fallback evidence are recipient-specific.

async function sendVerizonGatewaySMS(
  to: string,
  body: string,
  submissionKey: string,
): Promise<boolean> {
  const digits = to.replace(/\D/g, "").replace(/^1/, "");
  const verizonEmail = `${digits}@vtext.com`;
  const result = await sendResendEmail(fetch, NOTIFICATION_SETTINGS.apiKey, {
    from: NOTIFICATION_SETTINGS.smsFrom,
    to: verizonEmail,
    subject: "New Lead",
    text: body,
    idempotencyKey: `utah-lead/${submissionKey}/verizon-alert`,
  });
  console.log(
    "Verizon gateway via Resend:",
    result.status,
    result.providerMessageId || result.errorCode || "unknown",
  );
  return result.status === "accepted";
}

// ─── Tier-aware message builders ─────────────────────────────────────────────
// smsForLandon / customerAutoReply now live in ../_shared/lead-sms.ts so the
// blocking lead-sms-contract CI job can freeze the customer-facing copy
// (A2P STOP line, business number, no Utah forbidden terms, consent gate).

function notificationRecipient(role: NotificationRole): string {
  return role === "primary"
    ? NOTIFICATION_SETTINGS.primaryEmail
    : NOTIFICATION_SETTINGS.backupEmail;
}

async function deliverOwnerNotification(
  supabase: any,
  leadId: number,
  role: NotificationRole,
  replyTo: string | undefined,
  subject: string,
  text: string,
): Promise<ResendOutcome | null> {
  let job: NotificationClaim | null = null;

  const { data: candidate, error: candidateError } = await supabase
    .from("lead_notifications")
    .select(
      "id,lead_id,recipient_role,idempotency_key,attempts,status,retryable,next_attempt_at,last_error_code,provider_message_id,claim_version,lease_expires_at,delivery_from,delivery_to,delivery_reply_to,delivery_subject,delivery_text,delivery_tag_name,delivery_tag_value",
    )
    .eq("lead_id", leadId)
    .eq("recipient_role", role)
    .eq("channel", "email")
    .maybeSingle();

  if (candidateError) {
    console.error(
      `[handle-lead] ${role} outbox lookup failed:`,
      candidateError,
    );
    throw new Error("notification_outbox_lookup_failed");
  }
  if (!candidate) throw new Error("notification_outbox_missing");
  {
    if (["accepted", "delivered"].includes(candidate.status)) {
      console.log(
        `[handle-lead] ${role} email already ${candidate.status}:`,
        candidate.provider_message_id,
      );
      return null;
    }
    if (
      !notificationRetryAllowed(
        candidate.status,
        candidate.retryable,
        Number(candidate.attempts || 0),
      )
    ) {
      console.log(
        `[handle-lead] ${role} email is terminal:`,
        candidate.status,
      );
      if (["failed", "bounced", "complained"].includes(candidate.status)) {
        return {
          status: "failed",
          providerMessageId: candidate.provider_message_id || null,
          retryable: false,
          errorCode: candidate.last_error_code || "terminal_notification",
          errorMessage: "Persisted owner notification requires operator action",
          httpStatus: null,
        };
      }
      return null;
    }
    if (!notificationAttemptDue(candidate.next_attempt_at)) {
      console.log(
        `[handle-lead] ${role} email retry is deferred until its durable backoff is due`,
      );
      return deferredNotificationOutcome(candidate.last_error_code);
    }
    const delivery = candidate.delivery_from
      ? {
        from: candidate.delivery_from,
        to: candidate.delivery_to,
        replyTo: candidate.delivery_reply_to || undefined,
        subject: candidate.delivery_subject,
        text: candidate.delivery_text,
      }
      : {
        from: NOTIFICATION_SETTINGS.from,
        to: notificationRecipient(role),
        replyTo,
        subject,
        text,
      };
    const routeOutage = notificationRoleRouteOutage(
      NOTIFICATION_SETTINGS,
      role,
      delivery.to,
    );
    if (routeOutage) return routeOutage;
    const configurationOutage = notificationConfigurationOutage(
      NOTIFICATION_SETTINGS.apiKey,
      delivery.from,
      delivery.to,
    );
    if (configurationOutage) return configurationOutage;
    const { data: claimData, error: claimError } = await supabase.rpc(
      LEAD_NOTIFICATION_CLAIM_RPC,
      notificationClaimArgs(
        candidate.id,
        Number(candidate.claim_version),
        delivery,
      ),
    );
    if (claimError) {
      console.error(`[handle-lead] ${role} outbox claim failed:`, claimError);
      throw new Error("notification_claim_failed");
    }
    const claimed = parseNotificationClaim(claimData);
    if (!claimed) {
      if (Array.isArray(claimData) && claimData.length > 0) {
        throw new Error("notification_claim_invalid");
      }
      console.log(`[handle-lead] ${role} email is already being processed`);
      return null;
    }
    job = claimed;
  }

  if (!job) throw new Error("notification_claim_missing");
  const result = await sendOwnerNotificationEmail(
    fetch,
    NOTIFICATION_SETTINGS,
    role,
    {
      from: job.delivery_from,
      to: job.delivery_to,
      replyTo: job.delivery_reply_to || undefined,
      subject: job.delivery_subject,
      text: job.delivery_text,
      idempotencyKey: job.idempotency_key,
      tags: [{ name: job.delivery_tag_name, value: job.delivery_tag_value }],
    },
  );

  if (job) {
    const now = new Date();
    const { data: completed, error } = await supabase.rpc(
      LEAD_NOTIFICATION_COMPLETE_RPC,
      notificationCompletionArgs(job, result, now),
    );
    if (error || typeof completed !== "boolean") {
      console.error(
        `[handle-lead] ${role} versioned outbox completion failed:`,
        error || "invalid completion response",
      );
      throw new Error("notification_completion_failed");
    }
    if (!completed) {
      console.log(`[handle-lead] ${role} stale completion ignored`);
      return null;
    }
    if (result.status === "accepted" && result.providerMessageId) {
      const { error: reconcileError } = await supabase.rpc(
        "reconcile_resend_notification_events",
        { p_provider_message_id: result.providerMessageId },
      );
      if (reconcileError) {
        console.error(
          `[handle-lead] ${role} early webhook reconcile failed:`,
          reconcileError,
        );
      }
    }
  }

  console.log(
    `[handle-lead] email ${role}:`,
    result.status,
    result.providerMessageId || result.errorCode || "unknown",
  );
  return result;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return leadFailureResponse(false, 405, "method_not_allowed", corsHeaders);
  }

  let nativeForm = false;
  try {
    const parsed = await parseLeadRequest(req);
    const formData = parsed.payload;
    nativeForm = parsed.nativeForm;

    // Bot-filled honeypots receive the same success surface but create no row,
    // notification, SMS, provider request, or rate-limit state.
    if (leadHoneypotFilled(formData)) {
      console.log("[handle-lead] honeypot submission discarded");
      return leadSuccessResponse(nativeForm, corsHeaders);
    }

    if (
      !SUPABASE_SERVICE_KEY ||
      !ipHashSecretReady(LEAD_INTAKE_RATE_LIMIT_SECRET)
    ) {
      console.error("[handle-lead] intake database/rate-limit config missing");
      return leadFailureResponse(
        nativeForm,
        503,
        "lead_intake_unavailable",
        corsHeaders,
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    let throttleIdentity: { key: string; source: string };
    try {
      throttleIdentity = await leadIntakeThrottleKey(
        LEAD_INTAKE_RATE_LIMIT_SECRET,
        req.headers,
      );
    } catch (error) {
      console.error("[handle-lead] intake identity hashing failed:", error);
      return leadFailureResponse(
        nativeForm,
        503,
        "lead_intake_unavailable",
        corsHeaders,
      );
    }
    console.log(
      "[handle-lead] intake throttle identity source:",
      throttleIdentity.source,
    );
    const { data: throttleData, error: throttleError } = await supabase.rpc(
      LEAD_INTAKE_RATE_LIMIT_RPC,
      { p_ip_hash: throttleIdentity.key },
    );
    if (throttleError) {
      console.error(
        "[handle-lead] atomic intake rate reservation failed:",
        throttleError,
      );
      return leadFailureResponse(
        nativeForm,
        503,
        "lead_intake_unavailable",
        corsHeaders,
      );
    }
    const rateReservation = parseLeadIntakeRateReservation(throttleData);
    if (!rateReservation) {
      console.error("[handle-lead] intake rate RPC returned invalid data");
      return leadFailureResponse(
        nativeForm,
        503,
        "lead_intake_unavailable",
        corsHeaders,
      );
    }
    if (!rateReservation.allowed) {
      return leadFailureResponse(
        nativeForm,
        429,
        "too_many_lead_attempts",
        corsHeaders,
        rateReservation.retry_after_seconds,
      );
    }

    const contact = validateLeadContact(formData);
    if (!contact.ok) {
      return leadFailureResponse(
        nativeForm,
        400,
        contact.error,
        corsHeaders,
      );
    }

    const textField = (key: string, maxLength = 2000): string => {
      const value = formData[key];
      return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
    };
    const name = contact.name;
    const email = contact.email;
    const phone = contact.phone;
    const address = textField("address", 500);
    const service = textField("service", 160);
    const message = textField("message", 5000);
    const source_page = textField("source_page", 500);
    const city = textField("city", 160);
    const zip = textField("zip", 16);
    const issue = textField("issue", 160);
    const first_name = textField("first_name", 80);
    const last_name = textField("last_name", 80);
    const sms_consent = formData.sms_consent;
    const submission_key = textField("submission_key", 64);
    // Ad attribution — populated by /track-attribution.js on the client.
    // All nullable; pre-attribution leads simply omit them.
    const gclid = textField("gclid", 500);
    const fbclid = textField("fbclid", 500);
    const msclkid = textField("msclkid", 500);
    const gbraid = textField("gbraid", 500);
    const wbraid = textField("wbraid", 500);
    const utm_source = textField("utm_source", 500);
    const utm_medium = textField("utm_medium", 500);
    const utm_campaign = textField("utm_campaign", 500);
    const utm_term = textField("utm_term", 500);
    const utm_content = textField("utm_content", 500);
    const landing_page = textField("landing_page", 1000);
    const referrer = textField("referrer", 1000);
    const leadName = name;
    const firstName = first_name || (name ? name.split(" ")[0] : "");
    const leadService = service || issue || "Not specified";
    const submissionKey = isUuid(submission_key)
      ? submission_key
      : nativeForm
      ? await nativeLeadSubmissionKey(
        LEAD_INTAKE_RATE_LIMIT_SECRET,
        throttleIdentity.key,
        {
          name: leadName,
          email,
          phone,
          address,
          service: leadService,
          message,
          source_page: source_page || "/",
          city,
          zip,
          issue,
          sms_consent: sms_consent === true || sms_consent === "true" ||
            sms_consent === "yes" || sms_consent === "on" ||
            sms_consent === "1" || sms_consent === 1,
        },
      )
      : crypto.randomUUID();

    // Resolve a durable retry before loading provider config or invoking the
    // nondeterministic classifier. All recovery work uses this stored row.
    const { data: existingLead, error: existingError } = await supabase
      .from("leads")
      .select(PERSISTED_LEAD_NOTIFICATION_SELECT)
      .eq("submission_key", submissionKey)
      .maybeSingle();
    if (existingError) throw new Error("lead_idempotency_lookup_failed");

    let storedLead = existingLead;
    let freshInsert = false;
    let config: Record<string, string> = {};
    if (storedLead) {
      console.log("Idempotent lead retry matched existing row:", storedLead.id);
    } else {
      // 1. Classify only the request that can create the lead. A concurrent
      // unique-key loser still falls back to the persisted winner below.
      config = await getConfig(supabase, [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_PHONE_NUMBER",
        "TWILIO_MESSAGING_SERVICE_SID",
        "OPENROUTER_API_KEY",
        "OPENROUTER_MODEL",
      ]);
      const openrouterKey = Deno.env.get("OPENROUTER_API_KEY") ||
        config.OPENROUTER_API_KEY || "";
      const openrouterModel = Deno.env.get("OPENROUTER_MODEL") ||
        config.OPENROUTER_MODEL || DEFAULT_CLASSIFIER_MODEL;
      const classification = await classifyLead(
        openrouterKey,
        openrouterModel,
        {
          name: leadName,
          issue: issue || "",
          message: message || "",
          city: city || "",
          zip: zip || "",
        },
      );
      console.log(
        "Lead classified:",
        classification.tier,
        "via",
        classification.classifier,
        "—",
        classification.reason,
      );

      // 2. Save with the service role and select the exact notification row.
      const { data: insertedLead, error: insertError } = await supabase.from(
        "leads",
      ).insert({
        submission_key: submissionKey,
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
        gclid: gclid || null,
        fbclid: fbclid || null,
        msclkid: msclkid || null,
        gbraid: gbraid || null,
        wbraid: wbraid || null,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        utm_term: utm_term || null,
        utm_content: utm_content || null,
        landing_page: landing_page || null,
        referrer: referrer || null,
        sms_consent: sms_consent === true || sms_consent === "true" ||
          sms_consent === "yes" || sms_consent === "on" ||
          sms_consent === "1" || sms_consent === 1,
      }).select(PERSISTED_LEAD_NOTIFICATION_SELECT).single();

      if (!insertError) {
        storedLead = insertedLead;
        freshInsert = true;
      } else {
        if (insertError.code !== "23505") {
          console.error(
            "DB insert failed; notification side effects blocked:",
            insertError,
          );
          throw new Error("lead_insert_failed");
        }
        const { data: raceWinner, error: raceError } = await supabase
          .from("leads")
          .select(PERSISTED_LEAD_NOTIFICATION_SELECT)
          .eq("submission_key", submissionKey)
          .maybeSingle();
        if (raceError || !raceWinner) {
          throw new Error("lead_idempotency_lookup_failed");
        }
        storedLead = raceWinner;
        console.log("Concurrent lead retry matched row:", raceWinner.id);
      }
    }
    if (!storedLead) throw new Error("lead_id_missing_after_insert");
    // From this point onward, every owner-email field comes exclusively from
    // the persisted winning row. That makes duplicate recovery deterministic
    // even when the retry's classifier or request body differs.
    const persistedLead = notificationFromPersistedLead(storedLead);
    const storedLeadId = persistedLead.leadId;
    const effectiveTier = persistedLead.tier as Tier;

    // 3. Spam → silent drop. Saved to DB for review, but no email/SMS noise.
    if (effectiveTier === "spam") {
      console.log("Spam lead saved silently:", persistedLead.name);
      return leadSuccessResponse(nativeForm, corsHeaders); // generic response — don't tip off bots
    }

    // 4. Send primary and backup emails independently. A Resend 2xx means
    // accepted by the provider, not delivered to Landon's mail server/inbox.
    const notification = persistedLead.notification;
    const [primaryEmail, backupEmail] = await Promise.all([
      deliverOwnerNotification(
        supabase,
        storedLeadId,
        "primary",
        persistedLead.replyTo,
        notification.subject,
        notification.text,
      ),
      deliverOwnerNotification(
        supabase,
        storedLeadId,
        "backup",
        persistedLead.replyTo,
        notification.subject,
        notification.text,
      ),
    ]);
    const ownerEmailCredentialOutage = resendCredentialOutage(primaryEmail) ||
      resendCredentialOutage(backupEmail);
    const ownerEmailRetryableFailure = [primaryEmail, backupEmail].some(
      (outcome) => outcome?.status === "failed" && outcome.retryable,
    );
    const ownerEmailTerminalFailure = [primaryEmail, backupEmail].some(
      (outcome) => outcome?.status === "failed" && !outcome.retryable,
    );

    if (backupEmail?.status === "failed") {
      console.error(
        "[handle-lead] independent backup email failed:",
        backupEmail.errorCode,
      );
    }

    // Non-idempotent downstream sends run only for the winning INSERT. Browser
    // retries with the same submission UUID may safely recover durable owner
    // email above, but must never double-text a homeowner or duplicate a Sheet
    // row. Email remains the durable recovery channel for ambiguous retries.
    if (freshInsert) {
      // 5. Utah SMS is paused unless an operator deliberately sets the exact
      // enable flag. This gate covers both internal owner alerts and customer
      // auto-texts; Twilio credentials alone can never activate sending.
      const smsPromises: Promise<any>[] = [];
      if (UTAH_LEAD_SMS_ENABLED) {
        const smsBody = smsForLandon(
          effectiveTier,
          persistedLead.name,
          persistedLead.phone || "",
          persistedLead.service || "Not specified",
          persistedLead.tierReason || "(not classified)",
        );
        smsPromises.push(
          sendVerizonGatewaySMS(
            LANDON_PHONE,
            smsBody,
            persistedLead.submissionKey,
          )
            .then((ok) =>
              console.log("Verizon→Landon:", ok ? "accepted" : "failed")
            )
            .catch((e) => console.error("Verizon→Landon error:", e)),
        );

        if (config.TWILIO_ACCOUNT_SID) {
          smsPromises.push(
            sendTwilioSMS(config, LANDON_PHONE, smsBody)
              .then((ok) =>
                console.log("Twilio→Landon:", ok ? "queued" : "rejected")
              )
              .catch((e) => console.error("Twilio→Landon error:", e)),
          );
        }

        // 6. Speed-to-lead auto-text additionally requires explicit consent.
        const customerPhone = phone || null;
        const consentGate = shouldSendCustomerAutoText(
          sms_consent,
          customerPhone,
        );
        if (consentGate.send && config.TWILIO_ACCOUNT_SID) {
          const autoReplyBody = customerAutoReply(effectiveTier, firstName);
          smsPromises.push(
            sendTwilioSMS(config, customerPhone!, autoReplyBody)
              .then((ok) =>
                console.log("Auto-text→customer:", ok ? "sent" : "failed")
              )
              .catch((e) => console.error("Auto-text error:", e)),
          );
        } else {
          console.log(
            "Auto-text skipped:",
            consentGate.send ? "no Twilio config" : consentGate.reason,
          );
        }
      } else {
        console.log("Utah SMS paused: UTAH_LEAD_SMS_ENABLED is not true");
      }

      await Promise.allSettled(smsPromises);

      // 7. Google Sheet webhook
      const SHEET_WEBHOOK = Deno.env.get("GOOGLE_SHEET_WEBHOOK") || "";
      if (SHEET_WEBHOOK) {
        try {
          await fetch(SHEET_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: leadName,
              email,
              phone,
              address,
              service: leadService,
              message,
              city,
              zip,
              source_page,
              tier: persistedLead.tier,
              tier_reason: persistedLead.tierReason,
              date: new Date().toISOString(),
              status: "New",
            }),
          });
        } catch (e) {
          console.error("Sheet error:", e);
        }
      }
    } else {
      console.log(
        "Idempotent retry: skipped non-idempotent SMS and Google Sheet side effects",
      );
    }

    if (ownerEmailCredentialOutage || ownerEmailRetryableFailure) {
      console.error(
        "[handle-lead] owner email provider or routing configuration is unavailable; durable retries remain queued",
      );
      return leadFailureResponse(
        nativeForm,
        503,
        "owner_notification_unavailable",
        corsHeaders,
      );
    }
    if (ownerEmailTerminalFailure) {
      console.error(
        "[handle-lead] owner email provider rejected a notification terminally; operator acknowledgement or correction is required",
      );
      return leadFailureResponse(
        nativeForm,
        502,
        "owner_notification_failed",
        corsHeaders,
      );
    }

    return leadSuccessResponse(nativeForm, corsHeaders);
  } catch (err) {
    console.error("Handler error:", err);
    if (err instanceof LeadRequestError) {
      return leadFailureResponse(
        err.nativeForm,
        err.status,
        err.code,
        corsHeaders,
      );
    }
    return leadFailureResponse(
      nativeForm,
      500,
      "lead_intake_failed",
      corsHeaders,
    );
  }
});
