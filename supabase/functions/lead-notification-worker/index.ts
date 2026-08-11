import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isUuid,
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
  type NotificationRouteCandidate,
  notificationRouteCandidateState,
  type NotificationRouteCursor,
  type NotificationRouteScan,
  notificationSettings,
  notificationSettingsReady,
  notificationWorkerHttpStatus,
  parseNotificationClaim,
  PERSISTED_LEAD_NOTIFICATION_SELECT,
  probeResendSendingAccess,
  resendCredentialOutage,
  type ResendOutcome,
  scanNotificationRouteHealth,
  scanRoutableNotificationJobs,
  sendOwnerNotificationEmail,
  STALE_DELIVERY_DELAY_MS,
  UNCONFIRMED_ACCEPTANCE_MS,
} from "../_shared/lead-notification.ts";

const SUPABASE_URL = "https://hdcflshhomzildwqlmwh.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WORKER_TOKEN = Deno.env.get("LEAD_NOTIFICATION_WORKER_TOKEN") || "";
const DEPLOYMENT_ID = Deno.env.get("DENO_DEPLOYMENT_ID") || "";
const SETTINGS = notificationSettings((key) => Deno.env.get(key));
const READY_JOB_LIMIT = 25;
const EXPIRED_JOB_LIMIT = 10;
const RECOVERY_PAGE_SIZE = 100;
const FROZEN_ROUTE_HEALTH_PAGE_SIZE = 100;
const RECOVERY_JOB_SELECT =
  "id,lead_id,recipient_role,idempotency_key,attempts,status,retryable,claim_version,lease_expires_at,created_at,updated_at,delivery_from,delivery_to,delivery_reply_to,delivery_subject,delivery_text,delivery_tag_name,delivery_tag_value";

type Job = NotificationRouteCandidate & {
  lead_id: number;
  idempotency_key: string;
  attempts: number;
  status: string;
  retryable: boolean;
  claim_version: number;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
  delivery_reply_to: string | null;
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

type RecoverySet = "ready" | "expired";

function recoveryOrderColumn(set: RecoverySet): "created_at" | "updated_at" {
  return set === "ready" ? "created_at" : "updated_at";
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function validRecoveryJob(value: unknown, set: RecoverySet): value is Job {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const job = value as Record<string, unknown>;
  const expectedStatus = set === "ready"
    ? ["pending", "failed"].includes(String(job.status))
    : job.status === "sending";
  const timestampFields = [job.created_at, job.updated_at];
  const deliveryFields = [
    job.delivery_from,
    job.delivery_to,
    job.delivery_reply_to,
    job.delivery_subject,
    job.delivery_text,
    job.delivery_tag_name,
    job.delivery_tag_value,
  ];
  return isUuid(job.id) && Number.isSafeInteger(job.lead_id) &&
    (job.lead_id as number) > 0 &&
    ["primary", "backup"].includes(String(job.recipient_role)) &&
    typeof job.idempotency_key === "string" &&
    job.idempotency_key.length > 0 && job.idempotency_key.length <= 240 &&
    Number.isInteger(job.attempts) && (job.attempts as number) >= 0 &&
    (job.attempts as number) < MAX_NOTIFICATION_ATTEMPTS &&
    expectedStatus && job.retryable === true &&
    Number.isSafeInteger(job.claim_version) &&
    (job.claim_version as number) >= 0 &&
    (job.lease_expires_at === null ||
      (typeof job.lease_expires_at === "string" &&
        Number.isFinite(Date.parse(job.lease_expires_at)))) &&
    (set !== "expired" ||
      (typeof job.lease_expires_at === "string" &&
        Number.isFinite(Date.parse(job.lease_expires_at)))) &&
    timestampFields.every((field) =>
      typeof field === "string" && Number.isFinite(Date.parse(field))
    ) && deliveryFields.every(nullableString);
}

async function readRecoveryJobPage(
  supabase: any,
  set: RecoverySet,
  runStartedAt: string,
  cursor: NotificationRouteCursor | null,
  pageSize: number,
): Promise<Job[]> {
  const orderColumn = recoveryOrderColumn(set);
  let query = supabase.from("lead_notifications").select(RECOVERY_JOB_SELECT);
  query = set === "ready"
    ? query.in("status", ["pending", "failed"])
      .eq("retryable", true)
      .lt("attempts", MAX_NOTIFICATION_ATTEMPTS)
      .lte("next_attempt_at", runStartedAt)
    : query.eq("status", "sending")
      .eq("retryable", true)
      .lt("attempts", MAX_NOTIFICATION_ATTEMPTS)
      .lte("lease_expires_at", runStartedAt);
  if (cursor) {
    query = query.or(
      `${orderColumn}.gt.${cursor.orderedAt},and(${orderColumn}.eq.${cursor.orderedAt},id.gt.${cursor.id})`,
    );
  }
  const { data, error } = await query
    .order(orderColumn, { ascending: true })
    .order("id", { ascending: true })
    .limit(pageSize);
  if (
    error || !Array.isArray(data) || data.length > pageSize ||
    !data.every((row) => validRecoveryJob(row, set))
  ) {
    throw new Error(`notification_${set}_page_read_failed`);
  }
  return data as Job[];
}

function recoveryCursorFor(
  set: RecoverySet,
  job: Job,
): NotificationRouteCursor {
  return {
    orderedAt: set === "ready" ? job.created_at : job.updated_at,
    id: job.id,
  };
}

async function scanRecoverySet(
  supabase: any,
  set: RecoverySet,
  runStartedAt: string,
  maxJobs: number,
): Promise<NotificationRouteScan<Job>> {
  return await scanRoutableNotificationJobs(
    SETTINGS,
    maxJobs,
    RECOVERY_PAGE_SIZE,
    (cursor, pageSize) =>
      readRecoveryJobPage(
        supabase,
        set,
        runStartedAt,
        cursor,
        pageSize,
      ),
    (job) => recoveryCursorFor(set, job),
  );
}

async function scanActiveRouteHealth(
  supabase: any,
  runStartedAt: string,
): Promise<{ routeOutages: number; partialDeliveries: number }> {
  const scans = await Promise.all(
    (["ready", "expired"] as const).map((set) =>
      scanNotificationRouteHealth(
        SETTINGS,
        FROZEN_ROUTE_HEALTH_PAGE_SIZE,
        (cursor, pageSize) =>
          readRecoveryJobPage(
            supabase,
            set,
            runStartedAt,
            cursor,
            pageSize,
          ),
        (job) => recoveryCursorFor(set, job),
      )
    ),
  );
  return {
    routeOutages: scans.reduce(
      (total, scan) => total + scan.routeOutages,
      0,
    ),
    partialDeliveries: scans.reduce(
      (total, scan) => total + scan.partialDeliveries,
      0,
    ),
  };
}

async function readActiveRouteHealth(
  supabase: any,
  summary: HealthSummary,
  runStartedAt: string,
): Promise<void> {
  try {
    const scan = await scanActiveRouteHealth(supabase, runStartedAt);
    summary.credentialOutages += scan.routeOutages;
    summary.persistenceErrors += scan.partialDeliveries;
  } catch (error) {
    console.error(
      "[lead-notification-worker] active route health scan failed:",
      error,
    );
    summary.persistenceErrors += 1;
  }
}

async function readDurableHealth(
  supabase: any,
  summary: HealthSummary,
  now: Date,
  includeActiveRouteHealth = true,
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
  if (includeActiveRouteHealth) {
    await readActiveRouteHealth(supabase, summary, now.toISOString());
  }
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

  let readyScan: NotificationRouteScan<Job>;
  let expiredScan: NotificationRouteScan<Job>;
  let activeRouteHealth: {
    routeOutages: number;
    partialDeliveries: number;
  };
  try {
    [readyScan, expiredScan, activeRouteHealth] = await Promise.all([
      scanRecoverySet(
        supabase,
        "ready",
        now.toISOString(),
        READY_JOB_LIMIT,
      ),
      scanRecoverySet(
        supabase,
        "expired",
        now.toISOString(),
        EXPIRED_JOB_LIMIT,
      ),
      scanActiveRouteHealth(supabase, now.toISOString()),
    ]);
  } catch (error) {
    console.error("[lead-notification-worker] queue scan failed:", error);
    return new Response("Retry", { status: 503 });
  }

  const jobs = [
    ...new Map(
      [...readyScan.jobs, ...expiredScan.jobs].map((job) => [job.id, job]),
    ).values(),
  ];
  const scanned = readyScan.scanned + expiredScan.scanned;
  const summary = healthSummary(
    reconciledCount as number,
    scanned,
    exhaustedCount as number,
  );
  summary.credentialOutages += activeRouteHealth.routeOutages;
  summary.persistenceErrors += activeRouteHealth.partialDeliveries;
  summary.skipped += readyScan.skipped + expiredScan.skipped;

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
  await readDurableHealth(supabase, summary, now, false);

  const status = notificationWorkerHttpStatus(summary);
  summary.healthy = status === 200;
  console.log("[lead-notification-worker]", summary);
  return Response.json(summary, { status });
});
