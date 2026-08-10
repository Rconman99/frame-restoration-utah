import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "npm:svix@1.99.1";
import {
  isOwnerNotificationWebhookTags,
  resendStatusForEvent,
} from "../_shared/lead-notification.ts";
import {
  readBoundedWebhookBody,
  WebhookRequestError,
} from "../_shared/webhook-request.ts";

const SUPABASE_URL = "https://hdcflshhomzildwqlmwh.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";
const DEPLOYMENT_ID = Deno.env.get("DENO_DEPLOYMENT_ID") || "";

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; tags?: Record<string, unknown> };
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!WEBHOOK_SECRET || !SERVICE_KEY) {
    console.error("[resend-webhook] required secret is missing");
    return new Response("Unavailable", { status: 503 });
  }

  let raw: string;
  try {
    raw = await readBoundedWebhookBody(request);
  } catch (error) {
    if (error instanceof WebhookRequestError) {
      console.warn("[resend-webhook] rejected request body:", error.code);
      return new Response(
        error.status === 413 ? "Payload too large" : "Invalid request",
        { status: error.status },
      );
    }
    console.error("[resend-webhook] request body read failed");
    return new Response("Invalid request", { status: 400 });
  }
  let event: ResendEvent;
  try {
    event = new Webhook(WEBHOOK_SECRET).verify(raw, {
      "svix-id": request.headers.get("svix-id") || "",
      "svix-timestamp": request.headers.get("svix-timestamp") || "",
      "svix-signature": request.headers.get("svix-signature") || "",
    }) as ResendEvent;
  } catch (error) {
    console.error(
      "[resend-webhook] invalid signature:",
      error instanceof Error ? error.message : error,
    );
    return new Response("Invalid signature", { status: 400 });
  }

  const eventId = request.headers.get("svix-id") || "";
  const providerMessageId = event.data?.email_id || "";
  const eventType = event.type || "";
  const eventStatus = resendStatusForEvent(eventType);
  const occurredAt = event.created_at || new Date().toISOString();
  // The Utah Resend account also sends Verizon gateway and unrelated mail.
  // Only owner-outbox sends carry this stable, non-PII tag. A valid signed
  // event without it is intentionally acknowledged and never persisted.
  if (!isOwnerNotificationWebhookTags(event.data?.tags)) {
    return Response.json({
      ok: true,
      state: "ignored",
      deployment_id: DEPLOYMENT_ID,
    });
  }
  if (!eventId || !providerMessageId || !eventStatus) {
    return Response.json({
      ok: true,
      state: "ignored",
      deployment_id: DEPLOYMENT_ID,
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await supabase.rpc(
    "apply_resend_notification_event",
    {
      p_event_id: eventId,
      p_provider_message_id: providerMessageId,
      p_event_type: eventType,
      p_event_status: eventStatus,
      p_occurred_at: occurredAt,
    },
  );
  if (error) {
    console.error("[resend-webhook] atomic event update failed:", error);
    return new Response("Retry", { status: 503 });
  }
  if (data === "unmatched") {
    console.warn(
      "[resend-webhook] provider id not persisted yet; event retained for reconciliation",
      eventType,
      providerMessageId,
    );
    return Response.json({ ok: true, state: "queued" });
  }
  if (data !== "applied" && data !== "duplicate") {
    console.error("[resend-webhook] unexpected event result:", data);
    return new Response("Retry", { status: 503 });
  }
  console.log("[resend-webhook] event", data, eventType, providerMessageId);
  return Response.json({ ok: true, state: data });
});
