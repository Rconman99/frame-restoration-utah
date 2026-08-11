import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  LEAD_NOTIFICATION_CLAIM_RPC,
  LEAD_NOTIFICATION_COMPLETE_RPC,
  LEAD_NOTIFICATION_EXHAUST_RPC,
  MAX_NOTIFICATION_ATTEMPTS,
  type NotificationClaim,
  notificationClaimArgs,
  notificationCompletionArgs,
  notificationConfigurationOutage,
  notificationFromPersistedLead,
  notificationRoleRouteOutage,
  notificationSettings,
  notificationSettingsReady,
  notificationWorkerHttpStatus,
  parseNotificationClaim,
  PERSISTED_LEAD_NOTIFICATION_SELECT,
  probeResendSendingAccess,
  resendCredentialOutage,
  type ResendOutcome,
  sendOwnerNotificationEmail,
  STALE_DELIVERY_DELAY_MS,
  UNCONFIRMED_ACCEPTANCE_MS,
} from "../_shared/lead-notification.ts";

const SUPABASE_URL = "https://hdcflshhomzildwqlmwh.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WORKER_TOKEN = Deno.env.get("LEAD_NOTIFICATION_WORKER_TOKEN") || "";
const DEPLOYMENT_ID = Deno.env.get("DENO_DEPLOYMENT_ID") || "";
const SETTINGS = notificationSettings((key) => Deno.env.get(key));

type Job = {
  id: string;
  lead_id: number;
  recipient_role: "primary" | "backup";
  idempotency_key: string;
  attempts: number;
  status: string;
  retryable: boolean;
  claim_version: number;
  lease_expires_at: string | null;
  updated_at: string;
  delivery_from: string | null;
  delivery_to: string | null;
  delivery_reply_to: string | null;
  delivery_subject: string | null;
  delivery_text: string | null;
  delivery_tag_name: string | null;
  delivery_tag_value: string | null;
};

type HealthSummary = {
  reconciled: number;
  scanned: number;
  accepted: number;
  failed: number;
  retryableFailed: number;
  terminalFailed: number;
  credentialOutages: number;
  durableTerminal: number;
  durableCredentialOutages: number;
  durableRetryable: number;
  staleDelayed: number;
  staleAccepted: number;
  exhausted: number;
  persistenceErrors: number;
  skipped: number;
  healthy: boolean;
};

function healthSummary(
  reconciled = 0,
  scanned = 0,
  exhausted = 0,
): HealthSummary {
  return {
    reconciled,
    scanned,
    accepted: 0,
    failed: 0,
    retryableFailed: 0,
    terminalFailed: 0,
    // Missing provider configuration must stay red even when the queue is
    // empty. The health-only canary therefore proves provider configuration
    // without claiming, mutating, or sending any queued notification.
    credentialOutages: notificationSettingsReady(SETTINGS) ? 0 : 1,
    durableTerminal: 0,
    durableCredentialOutages: 0,
    durableRetryable: 0,
    staleDelayed: 0,
    staleAccepted: 0,
    exhausted,
    persistenceErrors: 0,
    skipped: 0,
    healthy: true,
  };
}

function validHealthCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

async function readDurableHealth(
  supabase: any,
  summary: HealthSummary,
  now: Date,
): Promise<void> {
  // These are read-only HEAD/count queries. Keep this helper mutation-free so
  // the authenticated deployment canary cannot claim, retry, reconcile,
  // exhaust, or send a notification.
  const delayedBefore = new Date(
    now.getTime() - STALE_DELIVERY_DELAY_MS,
  ).toISOString();
  const acceptedBefore = new Date(
    now.getTime() - UNCONFIRMED_ACCEPTANCE_MS,
  ).toISOString();
  const { count: durableTerminal, error: durableTerminalError } = await supabase
    .from("lead_notifications")
    .select("id", { count: "exact", head: true })
    .in("status", ["failed", "bounced", "complained"])
    .eq("retryable", false)
    .is("health_acknowledged_at", null);
  const {
    count: durableCredentialOutages,
    error: durableCredentialError,
  } = await supabase
    .from("lead_notifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .eq("retryable", true)
    .in("last_error_code", [
      "missing_api_key",
      "provider_auth_unavailable",
      "missing_sender_config",
      "invalid_sender_config",
      "invalid_recipient_config",
      "duplicate_recipient_config",
      "recipient_route_mismatch",
    ])
    .is("health_acknowledged_at", null);
  const { count: durableRetryable, error: durableRetryableError } =
    await supabase
      .from("lead_notifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .eq("retryable", true)
      .is("health_acknowledged_at", null);
  const { count: staleDelayed, error: staleDelayedError } = await supabase
    .from("lead_notifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "delayed")
    .lt("last_event_at", delayedBefore)
    .is("health_acknowledged_at", null);
  const { count: staleAccepted, error: staleAcceptedError } = await supabase
    .from("lead_notifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "accepted")
    .is("delivered_at", null)
    .lt("accepted_at", acceptedBefore)
    .is("health_acknowledged_at", null);
  const counts = [
    durableTerminal,
    durableCredentialOutages,
    durableRetryable,
    staleDelayed,
    staleAccepted,
  ];
  if (
    durableTerminalError || durableCredentialError || durableRetryableError ||
    staleDelayedError || staleAcceptedError ||
    !counts.every(validHealthCount)
  ) {
    console.error(
      "[lead-notification-worker] durable health query failed:",
      durableTerminalError || durableCredentialError || durableRetryableError ||
        staleDelayedError || staleAcceptedError || "invalid count receipt",
    );
    summary.persistenceErrors += 1;
    return;
  }
  summary.durableTerminal = durableTerminal as number;
  summary.durableCredentialOutages = durableCredentialOutages as number;
  summary.durableRetryable = durableRetryable as number;
  summary.staleDelayed = staleDelayed as number;
  summary.staleAccepted = staleAccepted as number;
}

async function completeClaim(
  supabase: any,
  claim: NotificationClaim,
  outcome: ResendOutcome,
  finishedAt = new Date(),
): Promise<"applied" | "stale" | "error"> {
  const { data, error } = await supabase.rpc(
    LEAD_NOTIFICATION_COMPLETE_RPC,
    notificationCompletionArgs(claim, outcome, finishedAt),
  );
  if (error) {
    console.error("[lead-notification-worker] completion RPC failed:", error);
    return "error";
  }
  if (data === true) return "applied";
  if (data === false) return "stale";
  console.error("[lead-notification-worker] completion RPC shape invalid");
  return "error";
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!WORKER_TOKEN || !SERVICE_KEY) {
    console.error("[lead-notification-worker] required secret is missing");
    return new Response("Unavailable", { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${WORKER_TOKEN}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const now = new Date();
  const requestedMode = request.headers.get("x-frame-worker-mode") || "";
  if (requestedMode !== "recover" && requestedMode !== "health-only") {
    return Response.json({ error: "invalid_worker_mode" }, { status: 400 });
  }
  if (requestedMode === "health-only") {
    const summary = healthSummary();
    const providerAuth = await probeResendSendingAccess(fetch, SETTINGS.apiKey);
    if (!providerAuth.healthy) summary.credentialOutages += 1;
    await readDurableHealth(supabase, summary, now);
    const status = notificationWorkerHttpStatus(summary);
    summary.healthy = status === 200;
    const receipt = {
      ...summary,
      function: "lead-notification-worker",
      deployment_id: DEPLOYMENT_ID,
      provider_auth: providerAuth,
      mode: "health-only",
      no_send: true,
    };
    console.log("[lead-notification-worker] health-only", receipt);
    return Response.json(receipt, { status });
  }

  // The webhook acknowledges an early provider event once it is durably
  // stored. Reconcile every unapplied event on each scheduled run so a crash
  // between provider-id completion and the inline targeted reconciliation
  // cannot strand delivery evidence forever.
  const { data: reconciledCount, error: reconcileError } = await supabase.rpc(
    "reconcile_resend_notification_events",
    { p_provider_message_id: null },
  );
  if (
    reconcileError || !Number.isInteger(reconciledCount) || reconciledCount < 0
  ) {
    console.error(
      "[lead-notification-worker] global event reconciliation failed:",
      reconcileError || "invalid reconciliation RPC response",
    );
    return new Response("Retry", { status: 503 });
  }

  const { data: exhaustedCount, error: exhaustedError } = await supabase.rpc(
    LEAD_NOTIFICATION_EXHAUST_RPC,
  );
  if (
    exhaustedError || !Number.isInteger(exhaustedCount) || exhaustedCount < 0
  ) {
    console.error(
      "[lead-notification-worker] exhausted-job update failed:",
      exhaustedError || "invalid exhausted-job RPC response",
    );
    return new Response("Retry", { status: 503 });
  }

  const { data: ready, error: readyError } = await supabase
    .from("lead_notifications")
    .select(
      "id,lead_id,recipient_role,idempotency_key,attempts,status,retryable,claim_version,lease_expires_at,updated_at,delivery_from,delivery_to,delivery_reply_to,delivery_subject,delivery_text,delivery_tag_name,delivery_tag_value",
    )
    .in("status", ["pending", "failed"])
    .eq("retryable", true)
    .lt("attempts", MAX_NOTIFICATION_ATTEMPTS)
    .lte("next_attempt_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(25);
  const { data: stale, error: staleError } = await supabase
    .from("lead_notifications")
    .select(
      "id,lead_id,recipient_role,idempotency_key,attempts,status,retryable,claim_version,lease_expires_at,updated_at,delivery_from,delivery_to,delivery_reply_to,delivery_subject,delivery_text,delivery_tag_name,delivery_tag_value",
    )
    .eq("status", "sending")
    .eq("retryable", true)
    .lt("attempts", MAX_NOTIFICATION_ATTEMPTS)
    .lte("lease_expires_at", now.toISOString())
    .order("updated_at", { ascending: true })
    .limit(10);
  if (readyError || staleError) {
    console.error(
      "[lead-notification-worker] queue read failed:",
      readyError || staleError,
    );
    return new Response("Retry", { status: 503 });
  }

  const jobs = [
    ...new Map(
      [...(ready || []), ...(stale || [])].map((job: Job) => [job.id, job]),
    ).values(),
  ];
  const summary = healthSummary(
    reconciledCount as number,
    jobs.length,
    exhaustedCount as number,
  );

  for (const candidate of jobs) {
    const frozenFields = [
      candidate.delivery_from,
      candidate.delivery_to,
      candidate.delivery_subject,
      candidate.delivery_text,
      candidate.delivery_tag_name,
      candidate.delivery_tag_value,
    ];
    const hasFrozenDelivery = frozenFields.every((value) =>
      typeof value === "string" && value.length > 0
    );
    const hasPartialDelivery = frozenFields.some((value) => value !== null) &&
      !hasFrozenDelivery;
    if (hasPartialDelivery) {
      console.error(
        "[lead-notification-worker] partial frozen delivery payload",
        candidate.id,
      );
      summary.persistenceErrors += 1;
      summary.skipped += 1;
      continue;
    }

    let delivery = hasFrozenDelivery
      ? {
        from: candidate.delivery_from!,
        to: candidate.delivery_to!,
        replyTo: candidate.delivery_reply_to || undefined,
        subject: candidate.delivery_subject!,
        text: candidate.delivery_text!,
      }
      : null;
    if (!delivery) {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select(PERSISTED_LEAD_NOTIFICATION_SELECT)
        .eq("id", candidate.lead_id)
        .maybeSingle();
      if (leadError || !lead) {
        console.error(
          "[lead-notification-worker] notification lead row unavailable",
          leadError,
        );
        summary.persistenceErrors += 1;
        summary.skipped += 1;
        continue;
      }
      try {
        const persistedLead = notificationFromPersistedLead(lead);
        delivery = {
          from: SETTINGS.from,
          to: candidate.recipient_role === "primary"
            ? SETTINGS.primaryEmail
            : SETTINGS.backupEmail,
          replyTo: persistedLead.replyTo,
          subject: persistedLead.notification.subject,
          text: persistedLead.notification.text,
        };
      } catch (error) {
        console.error(
          "[lead-notification-worker] persisted notification lead is invalid",
          error,
        );
        summary.persistenceErrors += 1;
        summary.skipped += 1;
        continue;
      }
    }
    const routeOutage = notificationRoleRouteOutage(
      SETTINGS,
      candidate.recipient_role,
      delivery.to,
    );
    if (routeOutage) {
      summary.credentialOutages += 1;
      summary.skipped += 1;
      continue;
    }
    const configurationOutage = notificationConfigurationOutage(
      SETTINGS.apiKey,
      delivery.from,
      delivery.to,
    );
    if (configurationOutage) {
      summary.credentialOutages += 1;
      summary.skipped += 1;
      continue;
    }

    const { data: claimData, error: claimError } = await supabase.rpc(
      LEAD_NOTIFICATION_CLAIM_RPC,
      notificationClaimArgs(
        candidate.id,
        Number(candidate.claim_version),
        delivery,
      ),
    );
    const claimed = claimError ? null : parseNotificationClaim(claimData);
    if (claimError || !claimed) {
      if (claimError) {
        console.error("[lead-notification-worker] claim failed:", claimError);
        summary.persistenceErrors += 1;
      } else if (
        !Array.isArray(claimData) || claimData.length > 0
      ) {
        console.error(
          "[lead-notification-worker] claim RPC shape invalid",
        );
        summary.persistenceErrors += 1;
      }
      summary.skipped += 1;
      continue;
    }

    const result = await sendOwnerNotificationEmail(
      fetch,
      SETTINGS,
      claimed.recipient_role,
      {
        from: claimed.delivery_from,
        to: claimed.delivery_to,
        replyTo: claimed.delivery_reply_to || undefined,
        subject: claimed.delivery_subject,
        text: claimed.delivery_text,
        idempotencyKey: claimed.idempotency_key,
        tags: [{
          name: claimed.delivery_tag_name,
          value: claimed.delivery_tag_value,
        }],
      },
    );
    const finishedAt = new Date();
    const completion = await completeClaim(
      supabase,
      claimed,
      result,
      finishedAt,
    );
    if (completion === "error") {
      summary.persistenceErrors += 1;
    } else if (completion === "stale") {
      summary.skipped += 1;
    }
    if (
      completion === "applied" && result.status === "accepted" &&
      result.providerMessageId
    ) {
      const { error: reconcileError } = await supabase.rpc(
        "reconcile_resend_notification_events",
        { p_provider_message_id: result.providerMessageId },
      );
      if (reconcileError) {
        console.error(
          "[lead-notification-worker] early webhook reconcile failed:",
          reconcileError,
        );
      }
    }
    summary[result.status === "accepted" ? "accepted" : "failed"] += 1;
    if (result.status === "failed" && completion === "applied") {
      if (resendCredentialOutage(result)) summary.credentialOutages += 1;
      else if (result.retryable) summary.retryableFailed += 1;
      else summary.terminalFailed += 1;
    }
  }

  // Health comes from durable, unacknowledged state, not only failures seen by
  // this invocation. Scheduled recovery stays red until the provider condition
  // clears or an operator explicitly acknowledges the persisted alarm.
  await readDurableHealth(supabase, summary, now);

  const status = notificationWorkerHttpStatus(summary);
  summary.healthy = status === 200;
  console.log("[lead-notification-worker]", summary);
  return Response.json(summary, { status });
});
