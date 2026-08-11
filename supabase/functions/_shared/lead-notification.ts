export type NotificationRole = "primary" | "backup";
export type NotificationStatus = "accepted" | "failed";
export type ProviderEventStatus =
  | "accepted"
  | "delivered"
  | "delayed"
  | "bounced"
  | "complained"
  | "failed";
export const MAX_NOTIFICATION_ATTEMPTS = 8;
export const STALE_DELIVERY_DELAY_MS = 24 * 60 * 60 * 1000;
export const UNCONFIRMED_ACCEPTANCE_MS = 60 * 60 * 1000;
export const LEAD_NOTIFICATION_CLAIM_RPC = "claim_lead_notification";
export const LEAD_NOTIFICATION_COMPLETE_RPC =
  "complete_lead_notification_claim";
export const LEAD_NOTIFICATION_EXHAUST_RPC = "exhaust_lead_notification_claims";
export const RESEND_OWNER_TAG_NAME = "frame_notification";
export const RESEND_OWNER_TAG_VALUE = "utah_owner_lead_v1";
export const RESEND_OWNER_NOTIFICATION_TAGS = [{
  name: RESEND_OWNER_TAG_NAME,
  value: RESEND_OWNER_TAG_VALUE,
}] as const;

export interface NotificationSettings {
  apiKey: string;
  from: string;
  smsFrom: string;
  primaryEmail: string;
  backupEmail: string;
}

export interface ResendOutcome {
  status: NotificationStatus;
  providerMessageId: string | null;
  retryable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  httpStatus: number | null;
}

export interface ResendEmail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  idempotencyKey: string;
  tags?: ReadonlyArray<{ name: string; value: string }>;
}

export interface LeadNotificationInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  service?: string | null;
  message?: string | null;
  tier: string;
  tierReason?: string | null;
  tierClassifier?: string | null;
  tierConfidence?: number | null;
  sourcePage?: string | null;
  submissionKey: string;
}

// Keep the inline sender and recovery worker on one exact persisted-row
// contract. A duplicate browser submission may be classified differently on a
// retry; its email must still be byte-for-byte derived from the row that won
// the original INSERT because Resend reuses the original idempotency key.
export const PERSISTED_LEAD_NOTIFICATION_SELECT =
  "id,submission_key,name,phone,email,address,service,message,tier,tier_reason,tier_classifier,tier_confidence,source_page";

export interface PersistedLeadNotification {
  leadId: number;
  submissionKey: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  service: string | null;
  message: string | null;
  tier: string;
  tierReason: string | null;
  tierClassifier: string | null;
  tierConfidence: number | null;
  sourcePage: string;
  replyTo: string | undefined;
  notification: { subject: string; text: string };
}

export type NotificationClaim = {
  id: string;
  lead_id: number;
  recipient_role: NotificationRole;
  idempotency_key: string;
  attempts: number;
  status: "sending";
  retryable: true;
  claim_version: number;
  lease_expires_at: string;
  delivery_from: string;
  delivery_to: string;
  delivery_reply_to: string | null;
  delivery_subject: string;
  delivery_text: string;
  delivery_tag_name: typeof RESEND_OWNER_TAG_NAME;
  delivery_tag_value: typeof RESEND_OWNER_TAG_VALUE;
};

export type NotificationWorkerHealthCounts = {
  exhausted: number;
  terminalFailed: number;
  credentialOutages: number;
  retryableFailed: number;
  durableTerminal: number;
  durableCredentialOutages: number;
  durableRetryable: number;
  staleDelayed: number;
  staleAccepted: number;
  persistenceErrors: number;
};

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function notificationSettings(
  get: (key: string) => string | undefined,
): NotificationSettings {
  return {
    // Utah uses a domain-scoped sending key so rotating this lane cannot break
    // other Frame markets. Sender identities have no literal or generic-env
    // fallback: the operator must bind them to a verified Utah Resend domain.
    apiKey: get("UTAH_LEAD_RESEND_API_KEY")?.trim() || "",
    from: get("UTAH_LEAD_RESEND_FROM")?.trim() || "",
    smsFrom: get("UTAH_LEAD_RESEND_SMS_FROM")?.trim() || "",
    primaryEmail: (get("LEAD_NOTIFICATION_PRIMARY_EMAIL") ||
      "landon@framerestorations.com").trim(),
    backupEmail: (get("LEAD_NOTIFICATION_BACKUP_EMAIL") ||
      "ryanconwell99@gmail.com").trim(),
  };
}

function notificationMailbox(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254 || /[\r\n]/.test(trimmed)) return null;
  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?\.[A-Za-z]{2,63}$/
      .test(trimmed)
    ? trimmed
    : null;
}

export function validResendSender(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320 || /[\r\n]/.test(trimmed)) return false;
  const bracketed = trimmed.match(/^([^<>]{1,120})\s*<([^<>]+)>$/);
  return notificationMailbox(bracketed ? bracketed[2] : trimmed) !== null;
}

function normalizedNotificationMailbox(value: string): string | null {
  return notificationMailbox(value)?.toLowerCase() ?? null;
}

export function notificationRecipientsDistinct(
  settings: NotificationSettings,
): boolean {
  const primaryMailbox = normalizedNotificationMailbox(settings.primaryEmail);
  const backupMailbox = normalizedNotificationMailbox(settings.backupEmail);
  return primaryMailbox !== null && backupMailbox !== null &&
    primaryMailbox !== backupMailbox;
}

function recipientRouteOutage(
  errorCode:
    | "invalid_recipient_config"
    | "duplicate_recipient_config"
    | "recipient_route_mismatch",
): ResendOutcome {
  return {
    status: "failed",
    providerMessageId: null,
    retryable: true,
    errorCode,
    errorMessage: {
      invalid_recipient_config: "The owner notification recipient is invalid",
      duplicate_recipient_config:
        "Primary and backup owner notification recipients must be distinct",
      recipient_route_mismatch:
        "The frozen owner notification recipient does not match its current role",
    }[errorCode],
    httpStatus: null,
  };
}

export function notificationRoleRouteOutage(
  settings: NotificationSettings,
  role: NotificationRole,
  deliveryTo: string,
): ResendOutcome | null {
  const primaryMailbox = normalizedNotificationMailbox(settings.primaryEmail);
  const backupMailbox = normalizedNotificationMailbox(settings.backupEmail);
  const expectedMailbox = role === "primary" ? primaryMailbox : backupMailbox;
  if (expectedMailbox === null) {
    return recipientRouteOutage("invalid_recipient_config");
  }
  if (
    primaryMailbox !== null && backupMailbox !== null &&
    primaryMailbox === backupMailbox
  ) {
    return recipientRouteOutage("duplicate_recipient_config");
  }
  const actualMailbox = normalizedNotificationMailbox(deliveryTo);
  if (actualMailbox === null) {
    return recipientRouteOutage("invalid_recipient_config");
  }
  if (actualMailbox !== expectedMailbox) {
    return recipientRouteOutage("recipient_route_mismatch");
  }
  return null;
}

export function notificationSettingsReady(
  settings: NotificationSettings,
): boolean {
  // The auxiliary Verizon gateway sender remains independent, but the two
  // owner-email lanes are one routing contract: both mailboxes must be valid
  // and distinct. Compare their normalized values case-insensitively so a
  // casing or surrounding-whitespace difference cannot route both jobs to the
  // same inbox.
  return settings.apiKey.trim().length > 0 &&
    validResendSender(settings.from) &&
    notificationRecipientsDistinct(settings);
}

export type ResendAuthProbe = {
  healthy: boolean;
  permission: "sending_access" | "full_access" | "invalid" | "unavailable";
  httpStatus: number | null;
};

export async function probeResendSendingAccess(
  fetcher: FetchLike,
  apiKey: string,
): Promise<ResendAuthProbe> {
  if (!apiKey) {
    return { healthy: false, permission: "invalid", httpStatus: null };
  }
  try {
    // Resend's own CLI probes this read-only endpoint. A valid least-privilege
    // Sending-access key receives restricted_api_key; a full-access key can
    // list domains and is intentionally rejected here as overprivileged.
    const response = await fetcher("https://api.resend.com/domains", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "User-Agent": "Frame-Restoration-Utah/owner-notification-health",
      },
    });
    const payload = await response.json().catch(() => ({})) as {
      name?: unknown;
    };
    if (response.status === 401 && payload.name === "restricted_api_key") {
      return {
        healthy: true,
        permission: "sending_access",
        httpStatus: response.status,
      };
    }
    return {
      healthy: false,
      permission: response.ok ? "full_access" : "invalid",
      httpStatus: response.status,
    };
  } catch {
    return { healthy: false, permission: "unavailable", httpStatus: null };
  }
}

export function isOwnerNotificationWebhookTags(tags: unknown): boolean {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return false;
  const record = tags as Record<string, unknown>;
  return record[RESEND_OWNER_TAG_NAME] === RESEND_OWNER_TAG_VALUE;
}

export function retryableResendStatus(status: number, code = ""): boolean {
  return status === 401 || status === 403 || status === 408 || status === 429 ||
    status >= 500 ||
    (status === 409 && code === "concurrent_idempotent_requests");
}

export function resendCredentialOutage(
  outcome: ResendOutcome | null,
): boolean {
  return outcome?.status === "failed" &&
    (outcome.errorCode === "missing_api_key" ||
      outcome.errorCode === "provider_auth_unavailable" ||
      outcome.errorCode === "missing_sender_config" ||
      outcome.errorCode === "invalid_sender_config" ||
      outcome.errorCode === "invalid_recipient_config" ||
      outcome.errorCode === "duplicate_recipient_config" ||
      outcome.errorCode === "recipient_route_mismatch" ||
      outcome.httpStatus === 401 || outcome.httpStatus === 403);
}

export function notificationAttemptDue(
  nextAttemptAt: unknown,
  nowMilliseconds = Date.now(),
): boolean {
  if (typeof nextAttemptAt !== "string") return false;
  const dueMilliseconds = Date.parse(nextAttemptAt);
  return Number.isFinite(dueMilliseconds) && dueMilliseconds <= nowMilliseconds;
}

export function deferredNotificationOutcome(
  errorCode: unknown,
): ResendOutcome {
  return {
    status: "failed",
    providerMessageId: null,
    retryable: true,
    errorCode: typeof errorCode === "string" && errorCode.length > 0
      ? errorCode.slice(0, 240)
      : "notification_retry_deferred",
    errorMessage:
      "Owner notification remains queued until its durable retry time",
    httpStatus: null,
  };
}

export function notificationRetryAllowed(
  status: string,
  retryable: boolean,
  attempts: number,
  includeStaleSending = false,
): boolean {
  const retryableStatuses = includeStaleSending
    ? ["pending", "failed", "sending"]
    : ["pending", "failed"];
  return retryable && retryableStatuses.includes(status) &&
    Number.isInteger(attempts) && attempts >= 0 &&
    attempts < MAX_NOTIFICATION_ATTEMPTS;
}

export function parseNotificationClaim(
  value: unknown,
): NotificationClaim | null {
  const row = Array.isArray(value)
    ? (value.length === 1 ? value[0] : null)
    : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  const lease = typeof candidate.lease_expires_at === "string"
    ? Date.parse(candidate.lease_expires_at)
    : Number.NaN;
  if (
    !isUuid(candidate.id) || !Number.isSafeInteger(candidate.lead_id) ||
    (candidate.lead_id as number) <= 0 ||
    !["primary", "backup"].includes(String(candidate.recipient_role)) ||
    typeof candidate.idempotency_key !== "string" ||
    candidate.idempotency_key.length < 1 ||
    candidate.idempotency_key.length > 240 ||
    !Number.isInteger(candidate.attempts) ||
    (candidate.attempts as number) < 1 ||
    (candidate.attempts as number) > MAX_NOTIFICATION_ATTEMPTS ||
    candidate.status !== "sending" || candidate.retryable !== true ||
    !Number.isSafeInteger(candidate.claim_version) ||
    (candidate.claim_version as number) < 1 || !Number.isFinite(lease) ||
    typeof candidate.delivery_from !== "string" ||
    !validResendSender(candidate.delivery_from) ||
    typeof candidate.delivery_to !== "string" ||
    notificationMailbox(candidate.delivery_to) === null ||
    (candidate.delivery_reply_to !== null &&
      (typeof candidate.delivery_reply_to !== "string" ||
        notificationMailbox(candidate.delivery_reply_to) === null)) ||
    typeof candidate.delivery_subject !== "string" ||
    candidate.delivery_subject.length < 1 ||
    candidate.delivery_subject.length > 500 ||
    typeof candidate.delivery_text !== "string" ||
    candidate.delivery_text.length < 1 ||
    candidate.delivery_text.length > 20_000 ||
    candidate.delivery_tag_name !== RESEND_OWNER_TAG_NAME ||
    candidate.delivery_tag_value !== RESEND_OWNER_TAG_VALUE
  ) return null;
  return candidate as NotificationClaim;
}

export function notificationClaimArgs(
  jobId: string,
  expectedVersion: number,
  email: Omit<ResendEmail, "idempotencyKey" | "tags">,
): Record<string, unknown> {
  return {
    p_job_id: jobId,
    p_expected_version: expectedVersion,
    p_delivery_from: email.from,
    p_delivery_to: email.to,
    p_delivery_reply_to: email.replyTo || null,
    p_delivery_subject: email.subject,
    p_delivery_text: email.text,
    p_delivery_tag_name: RESEND_OWNER_TAG_NAME,
    p_delivery_tag_value: RESEND_OWNER_TAG_VALUE,
  };
}

export function notificationCompletionArgs(
  claim: NotificationClaim,
  outcome: ResendOutcome,
  finishedAt = new Date(),
): Record<string, unknown> {
  const credentialOutage = resendCredentialOutage(outcome);
  const retryMinutes = Math.min(
    60,
    2 ** Math.min(Number(claim.attempts || 1), 5),
  );
  const failed = outcome.status === "failed";
  return {
    p_job_id: claim.id,
    p_claim_version: claim.claim_version,
    p_status: outcome.status,
    p_retryable: failed && (credentialOutage ||
      (outcome.retryable && claim.attempts < MAX_NOTIFICATION_ATTEMPTS)),
    p_attempts: credentialOutage
      ? Math.max(claim.attempts - 1, 0)
      : claim.attempts,
    p_provider_message_id: outcome.providerMessageId,
    p_accepted_at: failed ? null : finishedAt.toISOString(),
    p_next_attempt_at: failed
      ? new Date(finishedAt.getTime() + retryMinutes * 60_000).toISOString()
      : null,
    p_last_error_code: outcome.errorCode,
    p_last_error: outcome.errorMessage,
  };
}

export function notificationWorkerHttpStatus(
  counts: NotificationWorkerHealthCounts,
): 200 | 503 {
  return counts.exhausted === 0 && counts.terminalFailed === 0 &&
      counts.credentialOutages === 0 && counts.retryableFailed === 0 &&
      counts.durableTerminal === 0 &&
      counts.durableCredentialOutages === 0 && counts.staleDelayed === 0 &&
      counts.durableRetryable === 0 && counts.staleAccepted === 0 &&
      counts.persistenceErrors === 0
    ? 200
    : 503;
}

export async function sendResendEmail(
  fetcher: FetchLike,
  apiKey: string,
  email: ResendEmail,
): Promise<ResendOutcome> {
  const configurationOutage = notificationConfigurationOutage(
    apiKey,
    email.from,
    email.to,
  );
  if (configurationOutage) return configurationOutage;

  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        reply_to: email.replyTo,
        subject: email.subject,
        text: email.text,
        ...(email.tags ? { tags: email.tags } : {}),
      }),
    });

    let payload: Record<string, unknown> = {};
    try {
      payload = await response.json();
    } catch { /* retain HTTP evidence below */ }
    const providerMessageId = typeof payload.id === "string" &&
        payload.id.trim().length > 0 && payload.id.trim().length <= 240
      ? payload.id.trim()
      : null;
    if (response.ok && providerMessageId) {
      return {
        status: "accepted",
        providerMessageId,
        retryable: false,
        errorCode: null,
        errorMessage: null,
        httpStatus: response.status,
      };
    }

    if (response.ok) {
      return {
        status: "failed",
        providerMessageId: null,
        retryable: true,
        errorCode: "provider_incomplete_response",
        errorMessage: "Resend returned success without a provider message id",
        httpStatus: response.status,
      };
    }

    const credentialOutage = response.status === 401 || response.status === 403;
    const rawErrorCode = credentialOutage
      ? "provider_auth_unavailable"
      : typeof payload.name === "string"
      ? payload.name
      : typeof payload.code === "string"
      ? payload.code
      : `http_${response.status}`;
    const errorCode = rawErrorCode.slice(0, 240) ||
      `http_${response.status}`;
    const errorMessage = typeof payload.message === "string"
      ? payload.message.slice(0, 500)
      : `Resend returned HTTP ${response.status}`;
    return {
      status: "failed",
      providerMessageId: null,
      retryable: credentialOutage ||
        retryableResendStatus(response.status, errorCode),
      errorCode,
      errorMessage,
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      status: "failed",
      providerMessageId: null,
      retryable: true,
      errorCode: "network_error",
      errorMessage: error instanceof Error
        ? error.message.slice(0, 500)
        : String(error).slice(0, 500),
      httpStatus: null,
    };
  }
}

export async function sendOwnerNotificationEmail(
  fetcher: FetchLike,
  settings: NotificationSettings,
  role: NotificationRole,
  email: ResendEmail,
): Promise<ResendOutcome> {
  const routingOutage = notificationRoleRouteOutage(
    settings,
    role,
    email.to,
  );
  if (routingOutage) return routingOutage;
  return await sendResendEmail(fetcher, settings.apiKey, email);
}

export function notificationConfigurationOutage(
  apiKey: string,
  from: string,
  to: string,
): ResendOutcome | null {
  if (!apiKey) {
    return {
      status: "failed",
      providerMessageId: null,
      retryable: true,
      errorCode: "missing_api_key",
      errorMessage: "UTAH_LEAD_RESEND_API_KEY is not configured",
      httpStatus: null,
    };
  }
  if (!from.trim()) {
    return {
      status: "failed",
      providerMessageId: null,
      retryable: true,
      errorCode: "missing_sender_config",
      errorMessage: "The Utah Resend sender is not configured",
      httpStatus: null,
    };
  }
  if (!validResendSender(from)) {
    return {
      status: "failed",
      providerMessageId: null,
      retryable: true,
      errorCode: "invalid_sender_config",
      errorMessage: "The Utah Resend sender configuration is invalid",
      httpStatus: null,
    };
  }
  if (!notificationMailbox(to)) {
    return {
      status: "failed",
      providerMessageId: null,
      retryable: true,
      errorCode: "invalid_recipient_config",
      errorMessage: "The owner notification recipient is invalid",
      httpStatus: null,
    };
  }
  return null;
}

export function notificationIdempotencyKey(
  submissionKey: string,
  role: NotificationRole,
): string {
  return `utah-lead/${submissionKey}/${role}`;
}

export function buildLeadNotification(
  input: LeadNotificationInput,
): { subject: string; text: string } {
  const prefix: Record<string, string> = {
    emergency: "[EMERGENCY] ",
    urgent: "[URGENT] ",
    scheduled: "",
    general: "[INFO] ",
    spam: "[SPAM] ",
    unclassified: "[NEW] ",
  };
  const service = input.service || "Not specified";
  const subject = `${
    prefix[input.tier] ?? "[NEW] "
  }NEW LEAD - ${input.name} - ${service}`;
  const text = [
    "New lead from framerestorationutah.com",
    "",
    `Name:       ${input.name}`,
    `Phone:      ${input.phone || "(not provided)"}`,
    `Email:      ${input.email || "(not provided)"}`,
    `Address:    ${input.address || "(not provided)"}`,
    `Service:    ${service}`,
    "",
    "Message:",
    input.message || "(no message)",
    "",
    "── Triage ──",
    `Tier:        ${input.tier.toUpperCase()}`,
    `Reason:      ${input.tierReason || "(not classified)"}`,
    `Classifier:  ${input.tierClassifier || "(not classified)"}`,
    input.tierConfidence != null ? `Confidence:  ${input.tierConfidence}` : "",
    "",
    `Source page: ${input.sourcePage || "/"}`,
    `Submission:  ${input.submissionKey}`,
  ].filter(Boolean).join("\n");
  return { subject, text };
}

function persistedText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function notificationFromPersistedLead(
  row: Record<string, unknown>,
): PersistedLeadNotification {
  const leadId = Number(row.id);
  if (!Number.isSafeInteger(leadId) || leadId <= 0) {
    throw new Error("persisted_lead_id_invalid");
  }

  const submissionKey = isUuid(row.submission_key)
    ? row.submission_key
    : String(leadId);
  const name = persistedText(row.name) || "(unknown)";
  const phone = persistedText(row.phone);
  const email = persistedText(row.email);
  const address = persistedText(row.address);
  const service = persistedText(row.service);
  const message = persistedText(row.message);
  const tier = persistedText(row.tier) || "unclassified";
  const tierReason = persistedText(row.tier_reason);
  const tierClassifier = persistedText(row.tier_classifier);
  const tierConfidence = typeof row.tier_confidence === "number" &&
      Number.isFinite(row.tier_confidence)
    ? row.tier_confidence
    : null;
  const sourcePage = persistedText(row.source_page) || "/";
  const notification = buildLeadNotification({
    name,
    phone,
    email,
    address,
    service,
    message,
    tier,
    tierReason,
    tierClassifier,
    tierConfidence,
    sourcePage,
    submissionKey,
  });

  return {
    leadId,
    submissionKey,
    name,
    phone,
    email,
    address,
    service,
    message,
    tier,
    tierReason,
    tierClassifier,
    tierConfidence,
    sourcePage,
    replyTo: email || undefined,
    notification,
  };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(value);
}

export function resendStatusForEvent(type: string): ProviderEventStatus | null {
  return ({
    "email.sent": "accepted",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delayed",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.failed": "failed",
    "email.suppressed": "failed",
  } as Record<string, ProviderEventStatus>)[type] || null;
}
