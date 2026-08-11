import { assertEquals } from "jsr:@std/assert";
import {
  buildLeadNotification,
  deferredNotificationOutcome,
  isOwnerNotificationWebhookTags,
  isUuid,
  MAX_NOTIFICATION_ATTEMPTS,
  notificationAttemptDue,
  notificationClaimArgs,
  notificationCompletionArgs,
  notificationFromPersistedLead,
  notificationIdempotencyKey,
  notificationRecipientsDistinct,
  notificationRetryAllowed,
  notificationRoleRouteOutage,
  notificationSettings,
  notificationSettingsReady,
  notificationWorkerHttpStatus,
  parseNotificationClaim,
  probeResendSendingAccess,
  RESEND_OWNER_NOTIFICATION_TAGS,
  resendCredentialOutage,
  resendStatusForEvent,
  retryableResendStatus,
  sendOwnerNotificationEmail,
  sendResendEmail,
} from "./lead-notification.ts";

const TEST_SUBMISSION_KEY = [
  "6ba7b810",
  "9dad",
  "41d1",
  "80b4",
  "00c04fd430c8",
].join("-");

Deno.test("Resend no-send auth probe accepts only a restricted Sending-access key", async () => {
  let observed: RequestInit | undefined;
  const restricted = await probeResendSendingAccess(
    async (_url, init) => {
      observed = init;
      return Response.json(
        { name: "restricted_api_key" },
        { status: 401 },
      );
    },
    "re_sending_only",
  );
  assertEquals(restricted, {
    healthy: true,
    permission: "sending_access",
    httpStatus: 401,
  });
  assertEquals(observed?.method, "GET");
  assertEquals(observed?.body, undefined);
  assertEquals(
    new Headers(observed?.headers).get("authorization"),
    "Bearer re_sending_only",
  );

  assertEquals(
    await probeResendSendingAccess(
      async () => Response.json({ data: [] }),
      "re_full_access",
    ),
    { healthy: false, permission: "full_access", httpStatus: 200 },
  );
  assertEquals(
    await probeResendSendingAccess(
      async () => Response.json({ name: "invalid_api_key" }, { status: 403 }),
      "re_invalid",
    ),
    { healthy: false, permission: "invalid", httpStatus: 403 },
  );
  assertEquals(
    await probeResendSendingAccess(
      async () => {
        throw new Error("offline");
      },
      "re_network_error",
    ),
    { healthy: false, permission: "unavailable", httpStatus: null },
  );
});

Deno.test("notification senders are Utah-scoped and fail closed without verified configuration", () => {
  const values: Record<string, string> = {
    UTAH_LEAD_RESEND_FROM: "Utah <lead@example.com>",
    UTAH_LEAD_RESEND_SMS_FROM: "Utah SMS <sms@example.com>",
    RESEND_FROM: "Wrong Market <wrong@example.net>",
    UTAH_LEAD_RESEND_API_KEY: "utah-scoped-key",
    RESEND_API_KEY: "legacy-shared-key",
  };
  const settings = notificationSettings((key) => values[key]);
  assertEquals(settings.apiKey, "utah-scoped-key");
  assertEquals(settings.from, "Utah <lead@example.com>");
  assertEquals(notificationSettingsReady(settings), true);
  assertEquals(
    notificationSettings((key) =>
      key === "RESEND_FROM" ? "Wrong Market <wrong@example.net>" : undefined
    ).from,
    "",
  );
  assertEquals(
    notificationSettings((key) =>
      key === "RESEND_API_KEY" ? "legacy-shared-key" : undefined
    ).apiKey,
    "",
  );
  assertEquals(
    notificationSettingsReady(notificationSettings(() => undefined)),
    false,
  );
  const defaults = notificationSettings(() => undefined);
  assertEquals(defaults.primaryEmail, "landon@framerestorations.com");
  assertEquals(defaults.backupEmail, "ryanconwell99@gmail.com");
});

Deno.test("owner notification routes must be valid and normalized-distinct", () => {
  const values: Record<string, string> = {
    UTAH_LEAD_RESEND_API_KEY: "utah-scoped-key",
    UTAH_LEAD_RESEND_FROM: "Utah <lead@example.com>",
    UTAH_LEAD_RESEND_SMS_FROM: "",
    LEAD_NOTIFICATION_PRIMARY_EMAIL: "  Landon@example.com ",
    LEAD_NOTIFICATION_BACKUP_EMAIL: " backup@example.com  ",
  };
  const settings = notificationSettings((key) => values[key]);
  assertEquals(settings.primaryEmail, "Landon@example.com");
  assertEquals(settings.backupEmail, "backup@example.com");
  assertEquals(notificationRecipientsDistinct(settings), true);
  assertEquals(notificationSettingsReady(settings), true);
  for (
    const [primaryEmail, backupEmail, ready] of [
      ["not-an-email", settings.backupEmail, false],
      [settings.primaryEmail, "not-an-email", false],
      ["Owner@example.com", "owner@example.com", false],
      ["  Owner@example.com ", "OWNER@EXAMPLE.COM  ", false],
      ["  Landon@example.com ", " BACKUP@example.com  ", true],
    ] as const
  ) {
    assertEquals(
      notificationSettingsReady({ ...settings, primaryEmail, backupEmail }),
      ready,
    );
  }
  const whitespaceValues: Record<string, string> = {
    UTAH_LEAD_RESEND_API_KEY: "utah-scoped-key",
    UTAH_LEAD_RESEND_FROM: "Utah <lead@example.com>",
    LEAD_NOTIFICATION_BACKUP_EMAIL: "   ",
  };
  const whitespaceRoute = notificationSettings((key) => whitespaceValues[key]);
  assertEquals(whitespaceRoute.backupEmail, "");
  assertEquals(notificationSettingsReady(whitespaceRoute), false);
});

Deno.test("duplicate and stale frozen owner routes never reach provider fetch", async () => {
  const settings = {
    apiKey: "utah-scoped-key",
    from: "Utah <lead@example.com>",
    smsFrom: "",
    primaryEmail: "Landon@example.com",
    backupEmail: "backup@example.com",
  };
  const email = {
    from: settings.from,
    to: settings.primaryEmail,
    subject: "Test",
    text: "Body",
    idempotencyKey: "stable-key",
  };
  let providerFetches = 0;
  const fetcher = async () => {
    providerFetches += 1;
    return Response.json({ id: "provider-id" });
  };

  for (
    const fixture of [
      {
        settings: {
          ...settings,
          primaryEmail: " Owner@example.com ",
          backupEmail: "OWNER@EXAMPLE.COM",
        },
        role: "primary" as const,
        to: "owner@example.com",
        code: "duplicate_recipient_config",
      },
      {
        settings,
        role: "backup" as const,
        to: settings.primaryEmail,
        code: "recipient_route_mismatch",
      },
    ]
  ) {
    const outcome = await sendOwnerNotificationEmail(
      fetcher,
      fixture.settings,
      fixture.role,
      { ...email, to: fixture.to },
    );
    assertEquals(outcome.errorCode, fixture.code);
    assertEquals(outcome.retryable, true);
    assertEquals(resendCredentialOutage(outcome), true);
  }
  assertEquals(providerFetches, 0);

  const invalidPeer = { ...settings, backupEmail: "not-an-email" };
  assertEquals(
    notificationRoleRouteOutage(
      invalidPeer,
      "primary",
      settings.primaryEmail,
    ),
    null,
  );
  assertEquals(
    notificationRoleRouteOutage(invalidPeer, "backup", "not-an-email")
      ?.errorCode,
    "invalid_recipient_config",
  );
  assertEquals(
    notificationRoleRouteOutage(settings, "backup", " BACKUP@EXAMPLE.COM "),
    null,
  );
});

Deno.test("invalid sender or owner recipient fails recoverably before network", async () => {
  let called = false;
  for (
    const fixture of [
      { from: "", to: "owner@example.com", code: "missing_sender_config" },
      {
        from: "Utah <bad>",
        to: "owner@example.com",
        code: "invalid_sender_config",
      },
      {
        from: "Utah <lead@example.com>",
        to: "not-an-email",
        code: "invalid_recipient_config",
      },
    ]
  ) {
    const outcome = await sendResendEmail(
      async () => {
        called = true;
        return Response.json({ id: "never" });
      },
      "re_test",
      {
        from: fixture.from,
        to: fixture.to,
        subject: "Test",
        text: "Body",
        idempotencyKey: "stable-key",
      },
    );
    assertEquals(outcome.errorCode, fixture.code);
    assertEquals(outcome.retryable, true);
    assertEquals(resendCredentialOutage(outcome), true);
  }
  assertEquals(called, false);
});

Deno.test("notification body is deterministic from persisted lead fields", () => {
  const input = {
    name: "Test Lead",
    phone: "4355550100",
    email: "test@example.com",
    address: "Heber City 84032",
    service: "Roof repair",
    message: "Leak",
    tier: "urgent",
    tierReason: "active leak",
    tierClassifier: "heuristic",
    tierConfidence: 0.95,
    sourcePage: "/",
    submissionKey: TEST_SUBMISSION_KEY,
  };
  assertEquals(
    buildLeadNotification(input),
    buildLeadNotification({ ...input }),
  );
  assertEquals(
    buildLeadNotification(input).subject.startsWith("[URGENT] NEW LEAD"),
    true,
  );
});

Deno.test("duplicate retries ignore nondeterministic current classifications and reuse persisted payload", () => {
  const persistedRow = {
    id: 42,
    submission_key: TEST_SUBMISSION_KEY,
    name: "Original Homeowner",
    phone: "+14355550100",
    email: "original@example.com",
    address: "123 Original Way",
    service: "Roof repair",
    message: "Original leak details",
    tier: "urgent",
    tier_reason: "Persisted first classification",
    tier_classifier: "first-model",
    tier_confidence: 0.91,
    source_page: "/original",
  };
  let classifierAttempt = 0;
  const nondeterministicClassifier = () => ({
    tier: classifierAttempt++ === 0 ? "general" : "emergency",
    reason: crypto.randomUUID(),
    classifier: `retry-model-${classifierAttempt}`,
  });

  const retryClassificationA = nondeterministicClassifier();
  const duplicateAttemptA = notificationFromPersistedLead(persistedRow);
  const retryClassificationB = nondeterministicClassifier();
  const duplicateAttemptB = notificationFromPersistedLead(persistedRow);

  assertEquals(retryClassificationA.tier === retryClassificationB.tier, false);
  assertEquals(duplicateAttemptA.notification, duplicateAttemptB.notification);
  assertEquals(duplicateAttemptA.submissionKey, persistedRow.submission_key);
  assertEquals(
    duplicateAttemptA.notification.text.includes(
      "Persisted first classification",
    ),
    true,
  );
  assertEquals(
    duplicateAttemptA.notification.text.includes(retryClassificationA.reason),
    false,
  );
  assertEquals(
    duplicateAttemptB.notification.text.includes(retryClassificationB.reason),
    false,
  );
});

Deno.test("provider webhook events map to precise delivery states", () => {
  assertEquals(resendStatusForEvent("email.sent"), "accepted");
  assertEquals(resendStatusForEvent("email.delivered"), "delivered");
  assertEquals(resendStatusForEvent("email.bounced"), "bounced");
  assertEquals(resendStatusForEvent("email.opened"), null);
});

Deno.test("Resend 2xx is accepted, never mislabeled delivered, and preserves provider id", async () => {
  let headers: Headers | undefined;
  let body: Record<string, unknown> | undefined;
  const outcome = await sendResendEmail(
    async (_input, init) => {
      headers = new Headers(init?.headers);
      body = JSON.parse(String(init?.body));
      return Response.json({ id: "email_123" }, { status: 200 });
    },
    "re_test",
    {
      from: "Utah <lead@example.com>",
      to: "owner@example.com",
      subject: "Test",
      text: "Test body",
      idempotencyKey: "utah-lead/abc/primary",
      tags: RESEND_OWNER_NOTIFICATION_TAGS,
    },
  );
  assertEquals(outcome.status, "accepted");
  assertEquals(outcome.providerMessageId, "email_123");
  assertEquals(headers?.get("Idempotency-Key"), "utah-lead/abc/primary");
  assertEquals(body?.tags, RESEND_OWNER_NOTIFICATION_TAGS);
});

Deno.test("owner webhook tags isolate Utah owner mail from shared-account mail", () => {
  assertEquals(
    isOwnerNotificationWebhookTags({
      frame_notification: "utah_owner_lead_v1",
    }),
    true,
  );
  assertEquals(isOwnerNotificationWebhookTags({}), false);
  assertEquals(
    isOwnerNotificationWebhookTags({ frame_notification: "gateway_sms" }),
    false,
  );
  assertEquals(
    isOwnerNotificationWebhookTags(RESEND_OWNER_NOTIFICATION_TAGS),
    false,
  );
  assertEquals(isOwnerNotificationWebhookTags(null), false);
});

Deno.test("Resend quota and network failures are retryable", async () => {
  const quota = await sendResendEmail(
    async () =>
      Response.json({ name: "rate_limit_exceeded", message: "slow down" }, {
        status: 429,
      }),
    "re_test",
    {
      from: "Utah <lead@example.com>",
      to: "owner@example.com",
      subject: "Test",
      text: "Body",
      idempotencyKey: "key",
    },
  );
  assertEquals(quota.status, "failed");
  assertEquals(quota.retryable, true);
  assertEquals(retryableResendStatus(400, "validation_error"), false);
});

Deno.test("ambiguous provider 2xx without a message id remains retryable", async () => {
  for (
    const payload of [{ ok: true }, { id: "   " }, { id: "x".repeat(241) }]
  ) {
    const outcome = await sendResendEmail(
      async () => Response.json(payload, { status: 200 }),
      "re_test",
      {
        from: "Utah <lead@example.com>",
        to: "owner@example.com",
        subject: "Test",
        text: "Body",
        idempotencyKey: "stable-key",
      },
    );
    assertEquals(outcome.status, "failed");
    assertEquals(outcome.retryable, true);
    assertEquals(outcome.errorCode, "provider_incomplete_response");
  }
});

Deno.test("provider error codes are bounded for durable completion", async () => {
  const outcome = await sendResendEmail(
    async () =>
      Response.json({ name: "x".repeat(500), message: "invalid request" }, {
        status: 422,
      }),
    "re_test",
    {
      from: "Utah <lead@example.com>",
      to: "owner@example.com",
      subject: "Test",
      text: "Body",
      idempotencyKey: "stable-key",
    },
  );
  assertEquals(outcome.errorCode?.length, 240);
  assertEquals(outcome.retryable, false);
});

Deno.test("claim parser and versioned completion freeze the ABA contract", () => {
  const fixture = {
    id: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
    lead_id: 42,
    recipient_role: "primary",
    idempotency_key: "utah-lead/key/primary",
    attempts: 3,
    status: "sending",
    retryable: true,
    claim_version: 7,
    lease_expires_at: "2026-08-07T20:00:00.000Z",
    delivery_from: "Frame Utah <leads@frameroofingutah.com>",
    delivery_to: "landon@framerestorations.com",
    delivery_reply_to: "homeowner@example.com",
    delivery_subject: "Frozen subject",
    delivery_text: "Frozen body",
    delivery_tag_name: "frame_notification",
    delivery_tag_value: "utah_owner_lead_v1",
  };
  const claim = parseNotificationClaim([fixture]);
  assertEquals(claim?.claim_version, 7);
  if (!claim) throw new Error("claim fixture rejected");
  const args = notificationCompletionArgs(claim, {
    status: "accepted",
    providerMessageId: "email_123",
    retryable: false,
    errorCode: null,
    errorMessage: null,
    httpStatus: 200,
  }, new Date("2026-08-07T19:00:00.000Z"));
  assertEquals(args.p_job_id, claim.id);
  assertEquals(args.p_claim_version, 7);
  assertEquals(args.p_status, "accepted");
  assertEquals(claim.delivery_subject, "Frozen subject");
  assertEquals(
    notificationClaimArgs(claim.id, 6, {
      from: fixture.delivery_from,
      to: fixture.delivery_to,
      replyTo: fixture.delivery_reply_to,
      subject: fixture.delivery_subject,
      text: fixture.delivery_text,
    }),
    {
      p_job_id: claim.id,
      p_expected_version: 6,
      p_delivery_from: fixture.delivery_from,
      p_delivery_to: fixture.delivery_to,
      p_delivery_reply_to: fixture.delivery_reply_to,
      p_delivery_subject: fixture.delivery_subject,
      p_delivery_text: fixture.delivery_text,
      p_delivery_tag_name: fixture.delivery_tag_name,
      p_delivery_tag_value: fixture.delivery_tag_value,
    },
  );
  assertEquals(parseNotificationClaim([]), null);
  assertEquals(
    parseNotificationClaim([{ ...claim, claim_version: 0 }]),
    null,
  );
  for (
    const missing of [
      "delivery_from",
      "delivery_to",
      "delivery_subject",
      "delivery_text",
      "delivery_tag_name",
      "delivery_tag_value",
    ]
  ) {
    assertEquals(
      parseNotificationClaim([{ ...fixture, [missing]: null }]),
      null,
      missing,
    );
  }
});

Deno.test("durably deferred notification remains a retryable request failure", () => {
  const deferred = deferredNotificationOutcome("provider_auth_unavailable");
  assertEquals(deferred.status, "failed");
  assertEquals(deferred.retryable, true);
  assertEquals(deferred.errorCode, "provider_auth_unavailable");
});

Deno.test("missing or rejected Resend credentials remain recoverable and visible", async () => {
  let requested = false;
  const missing = await sendResendEmail(
    async () => {
      requested = true;
      return Response.json({ id: "never" });
    },
    "",
    {
      from: "Utah <lead@example.com>",
      to: "owner@example.com",
      subject: "Test",
      text: "Body",
      idempotencyKey: "key",
    },
  );
  assertEquals(requested, false);
  assertEquals(missing.retryable, true);
  assertEquals(resendCredentialOutage(missing), true);

  const unauthorized = await sendResendEmail(
    async () =>
      Response.json({ name: "validation_error", message: "bad API key" }, {
        status: 401,
      }),
    "re_bad",
    {
      from: "Utah <lead@example.com>",
      to: "owner@example.com",
      subject: "Test",
      text: "Body",
      idempotencyKey: "key",
    },
  );
  assertEquals(unauthorized.errorCode, "provider_auth_unavailable");
  assertEquals(unauthorized.retryable, true);
  assertEquals(resendCredentialOutage(unauthorized), true);
});

Deno.test("notification backoff is due only at or after its persisted time", () => {
  const now = Date.parse("2026-08-07T18:00:00.000Z");
  assertEquals(notificationAttemptDue("2026-08-07T17:59:59.999Z", now), true);
  assertEquals(notificationAttemptDue("2026-08-07T18:00:00.000Z", now), true);
  assertEquals(notificationAttemptDue("2026-08-07T18:00:00.001Z", now), false);
  assertEquals(notificationAttemptDue("not-a-date", now), false);
  assertEquals(notificationAttemptDue(null, now), false);
});

Deno.test("notification retries are pre-acceptance, retryable, and capped", () => {
  assertEquals(notificationRetryAllowed("pending", true, 0), true);
  assertEquals(
    notificationRetryAllowed("failed", true, MAX_NOTIFICATION_ATTEMPTS - 1),
    true,
  );
  assertEquals(notificationRetryAllowed("failed", false, 1), false);
  assertEquals(
    notificationRetryAllowed("failed", true, MAX_NOTIFICATION_ATTEMPTS),
    false,
  );
  for (
    const terminal of [
      "accepted",
      "delivered",
      "delayed",
      "bounced",
      "complained",
    ]
  ) {
    assertEquals(notificationRetryAllowed(terminal, true, 1), false, terminal);
  }
  assertEquals(notificationRetryAllowed("sending", true, 1), false);
  assertEquals(notificationRetryAllowed("sending", true, 1, true), true);
});

Deno.test("worker health turns non-2xx for current or durable unresolved state", () => {
  const healthy = {
    exhausted: 0,
    terminalFailed: 0,
    credentialOutages: 0,
    retryableFailed: 0,
    durableTerminal: 0,
    durableCredentialOutages: 0,
    durableRetryable: 0,
    staleDelayed: 0,
    staleAccepted: 0,
    persistenceErrors: 0,
  };
  assertEquals(notificationWorkerHttpStatus(healthy), 200);
  for (
    const counter of [
      "exhausted",
      "terminalFailed",
      "credentialOutages",
      "retryableFailed",
      "durableTerminal",
      "durableCredentialOutages",
      "durableRetryable",
      "staleDelayed",
      "staleAccepted",
      "persistenceErrors",
    ] as const
  ) {
    assertEquals(
      notificationWorkerHttpStatus({ ...healthy, [counter]: 1 }),
      503,
      counter,
    );
  }
});

Deno.test("missing key fails visibly without a network request", async () => {
  let called = false;
  const outcome = await sendResendEmail(
    async () => {
      called = true;
      return Response.json({ id: "never" });
    },
    "",
    { from: "x", to: "y", subject: "z", text: "body", idempotencyKey: "key" },
  );
  assertEquals(called, false);
  assertEquals(outcome.errorCode, "missing_api_key");
});

Deno.test("submission and recipient idempotency helpers are deterministic", () => {
  const uuid = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
  assertEquals(isUuid(uuid), true);
  assertEquals(isUuid("not-a-key"), false);
  assertEquals(
    notificationIdempotencyKey(uuid, "primary"),
    `utah-lead/${uuid}/primary`,
  );
});
