#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const OWNER_NOTIFICATION_PHASES = Object.freeze({
  infrastructure: "infrastructure-ready",
  handler: "handler-ready",
});

export const REQUIRED_NOTIFICATION_MIGRATIONS = Object.freeze([
  "20260807000100",
  "20260807000160",
  "20260807000165",
]);

export const NOTIFICATION_FUNCTIONS = Object.freeze([
  "lead-notification-worker",
  "resend-webhook",
]);

const PROTECTED_FUNCTIONS = new Set([
  "handle-lead",
  ...NOTIFICATION_FUNCTIONS,
]);
const MAX_RECEIPT_LIFETIME_MS = 60 * 60 * 1000;
const MAX_CANARY_AGE_MS = 10 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const BASE_REQUIRED_SECRETS = Object.freeze([
  "SUPABASE_SERVICE_ROLE_KEY",
  "UTAH_LEAD_RESEND_API_KEY",
  "UTAH_LEAD_RESEND_FROM",
  "LEAD_NOTIFICATION_PRIMARY_EMAIL",
  "LEAD_NOTIFICATION_BACKUP_EMAIL",
  "LEAD_NOTIFICATION_WORKER_TOKEN",
  "RESEND_WEBHOOK_SECRET",
]);
export const HANDLER_SMS_PAUSE_SECRETS = Object.freeze([
  "UTAH_LEAD_SMS_ENABLED",
  "UTAH_LEAD_RESEND_SMS_FROM",
]);

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
  return value;
}

function decodeBase64Url(value, label) {
  requireString(value, label);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} is not canonical base64url`);
  }
  return Buffer.from(value, "base64url");
}

function collectMigrationVersions(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectMigrationVersions(entry, found);
  } else if (value && typeof value === "object") {
    if (typeof value.version === "string") found.add(value.version);
    for (const nested of Object.values(value)) {
      collectMigrationVersions(nested, found);
    }
  }
  return found;
}

function parseSecretMetadata(value) {
  if (!Array.isArray(value)) {
    throw new Error("live Supabase secret metadata is not an array");
  }
  const result = new Map();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || typeof entry.name !== "string") {
      throw new Error(
        "live Supabase secret metadata contains an invalid entry",
      );
    }
    if (result.has(entry.name)) {
      throw new Error(`live Supabase secret metadata repeats ${entry.name}`);
    }
    result.set(entry.name, {
      digest: requireString(entry.value, `${entry.name} digest`),
      updated_at: requireString(
        String(entry.updated_at ?? ""),
        `${entry.name} updated_at`,
      ),
    });
  }
  return result;
}

function normalizeFunction(entry) {
  if (!entry || typeof entry !== "object") return null;
  const slug = typeof entry.slug === "string"
    ? entry.slug
    : typeof entry.name === "string"
    ? entry.name
    : "";
  if (!slug) return null;
  const version = Number(entry.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(`live function ${slug} has an invalid version`);
  }
  return {
    id: requireString(String(entry.id ?? ""), `${slug} id`),
    slug,
    status: requireString(String(entry.status ?? ""), `${slug} status`),
    version,
    updated_at: requireString(
      String(entry.updated_at ?? ""),
      `${slug} updated_at`,
    ),
  };
}

function parseFunctionMetadata(value) {
  if (!Array.isArray(value)) {
    throw new Error("live Supabase function metadata is not an array");
  }
  const result = new Map();
  for (const entry of value) {
    const normalized = normalizeFunction(entry);
    if (!normalized) {
      throw new Error(
        "live Supabase function metadata contains an invalid entry",
      );
    }
    if (result.has(normalized.slug)) {
      throw new Error(
        `live Supabase function metadata repeats ${normalized.slug}`,
      );
    }
    result.set(normalized.slug, normalized);
  }
  return result;
}

function receiptFunctionSnapshot(liveFunctions) {
  return Object.fromEntries(NOTIFICATION_FUNCTIONS.map((slug) => [
    slug,
    liveFunctions.get(slug) ?? null,
  ]));
}

function runtimeDeploymentId(projectRef, metadata) {
  return `${projectRef}_${metadata.id}_${metadata.version}`;
}

function canaryDeploymentSnapshot(canaryEvidence) {
  return {
    "lead-notification-worker": canaryEvidence?.worker_health?.deployment_id,
    "resend-webhook": canaryEvidence?.webhook_signature?.deployment_id,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${
      Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonicalJson(value[key])}`
      ).join(",")
    }}`;
  }
  return JSON.stringify(value);
}

function requiredSecretsFor(functionName) {
  const required = [...BASE_REQUIRED_SECRETS];
  if (functionName === "handle-lead") {
    required.push("LEAD_INTAKE_RATE_LIMIT_SECRET");
  }
  return required;
}

function enforceHandlerSmsPause(functionName, liveSecrets) {
  if (functionName !== "handle-lead") return;
  for (const name of HANDLER_SMS_PAUSE_SECRETS) {
    if (liveSecrets.has(name)) {
      throw new Error(
        `live Edge secret ${name} must remain absent while Utah SMS is paused`,
      );
    }
  }
}

function parseSignedReceipt(token, hmacKey) {
  const key = Buffer.from(
    requireString(hmacKey, "owner-notification receipt HMAC key"),
    "utf8",
  );
  if (key.length < 32) {
    throw new Error(
      "owner-notification receipt HMAC key must be at least 32 bytes",
    );
  }
  const parts = requireString(
    token,
    "signed owner-notification deployment receipt",
  ).split(".");
  if (parts.length !== 2) {
    throw new Error(
      "signed owner-notification deployment receipt has an invalid format",
    );
  }
  const [encodedPayload, encodedSignature] = parts;
  const supplied = decodeBase64Url(
    encodedSignature,
    "owner-notification receipt signature",
  );
  const expected = crypto.createHmac("sha256", key).update(encodedPayload)
    .digest();
  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    throw new Error(
      "owner-notification deployment receipt signature is invalid",
    );
  }
  try {
    return JSON.parse(
      decodeBase64Url(encodedPayload, "owner-notification receipt payload")
        .toString("utf8"),
    );
  } catch (error) {
    throw new Error(
      `owner-notification deployment receipt payload is invalid: ${error.message}`,
    );
  }
}

export function signOwnerNotificationDeployReceipt(payload, hmacKey) {
  const key = Buffer.from(
    requireString(hmacKey, "owner-notification receipt HMAC key"),
    "utf8",
  );
  if (key.length < 32) {
    throw new Error(
      "owner-notification receipt HMAC key must be at least 32 bytes",
    );
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = crypto.createHmac("sha256", key).update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function issueOwnerNotificationDeployReceipt({
  functionName,
  deploySha,
  projectRef,
  migrationHistory,
  secretsMetadata,
  functionsMetadata,
  canaryEvidence,
  receiptHmacKey,
  now = new Date(),
}) {
  if (!PROTECTED_FUNCTIONS.has(functionName)) {
    throw new Error(
      "owner-notification receipts can be issued only for protected functions",
    );
  }
  const liveMigrations = collectMigrationVersions(migrationHistory);
  for (const version of REQUIRED_NOTIFICATION_MIGRATIONS) {
    if (!liveMigrations.has(version)) {
      throw new Error(
        `cannot issue receipt: live migration history is missing ${version}`,
      );
    }
  }
  const liveSecrets = parseSecretMetadata(secretsMetadata);
  enforceHandlerSmsPause(functionName, liveSecrets);
  const requiredSecrets = requiredSecretsFor(functionName);
  for (const name of requiredSecrets) {
    if (!liveSecrets.has(name)) {
      throw new Error(
        `cannot issue receipt: live Edge secret ${name} is missing`,
      );
    }
  }
  const liveFunctions = parseFunctionMetadata(functionsMetadata);
  if (functionName === "handle-lead") {
    verifyCanaries(canaryEvidence, projectRef, liveFunctions, now);
  }
  const payload = {
    receipt_version: 1,
    project_ref: projectRef,
    source_sha: deploySha,
    target_function: functionName,
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + MAX_RECEIPT_LIFETIME_MS).toISOString(),
    phase: functionName === "handle-lead"
      ? OWNER_NOTIFICATION_PHASES.handler
      : OWNER_NOTIFICATION_PHASES.infrastructure,
    live_migration_versions: [...REQUIRED_NOTIFICATION_MIGRATIONS],
    live_secret_metadata: Object.fromEntries(requiredSecrets.map((name) => [
      name,
      liveSecrets.get(name),
    ])),
    live_function_metadata: receiptFunctionSnapshot(liveFunctions),
    verified_canary_deployments: functionName === "handle-lead"
      ? canaryDeploymentSnapshot(canaryEvidence)
      : null,
    sms_pause_required_absent: functionName === "handle-lead"
      ? [...HANDLER_SMS_PAUSE_SECRETS]
      : null,
    canary_contract_version: 1,
  };
  const token = signOwnerNotificationDeployReceipt(payload, receiptHmacKey);
  verifyOwnerNotificationDeployReceipt({
    functionName,
    deploySha,
    projectRef,
    migrationHistory,
    secretsMetadata,
    functionsMetadata,
    canaryEvidence,
    receiptToken: token,
    receiptHmacKey,
    now,
  });
  return { payload, token };
}

function requireFreshWindow(receipt, now) {
  const issuedAt = Date.parse(
    requireString(receipt.issued_at, "receipt issued_at"),
  );
  const expiresAt = Date.parse(
    requireString(receipt.expires_at, "receipt expires_at"),
  );
  const nowMs = now.getTime();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new Error(
      "owner-notification receipt timestamps must be valid ISO dates",
    );
  }
  if (issuedAt > nowMs + MAX_CLOCK_SKEW_MS || expiresAt <= nowMs) {
    throw new Error("owner-notification receipt is not currently valid");
  }
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_RECEIPT_LIFETIME_MS) {
    throw new Error(
      "owner-notification receipt lifetime must be positive and no more than one hour",
    );
  }
}

function verifyCanaries(canaryEvidence, projectRef, liveFunctions, now) {
  if (!canaryEvidence || typeof canaryEvidence !== "object") {
    throw new Error("fresh owner-notification canary evidence is missing");
  }
  if (
    canaryEvidence.receipt_version !== 1 ||
    canaryEvidence.project_ref !== projectRef
  ) {
    throw new Error(
      "owner-notification canary evidence has the wrong version or project",
    );
  }
  const checkedAt = Date.parse(
    requireString(canaryEvidence.checked_at, "canary checked_at"),
  );
  const nowMs = now.getTime();
  if (
    !Number.isFinite(checkedAt) || checkedAt > nowMs + MAX_CLOCK_SKEW_MS ||
    nowMs - checkedAt > MAX_CANARY_AGE_MS
  ) {
    throw new Error(
      "owner-notification canary evidence is stale or future-dated",
    );
  }
  const worker = liveFunctions.get("lead-notification-worker");
  const webhook = liveFunctions.get("resend-webhook");
  if (
    !worker || worker.status !== "ACTIVE" || !webhook ||
    webhook.status !== "ACTIVE"
  ) {
    throw new Error("handle-lead requires ACTIVE worker and webhook functions");
  }
  const workerEvidence = canaryEvidence.worker_health;
  if (
    workerEvidence?.passed !== true || workerEvidence?.http_status !== 200 ||
    workerEvidence?.mode !== "health-only" ||
    workerEvidence?.no_send !== true ||
    workerEvidence?.healthy !== true ||
    workerEvidence?.provider_auth?.healthy !== true ||
    workerEvidence?.provider_auth?.permission !== "sending_access" ||
    workerEvidence?.provider_auth?.http_status !== 401 ||
    workerEvidence?.function_version !== worker.version ||
    workerEvidence?.deployment_id !== runtimeDeploymentId(projectRef, worker)
  ) {
    throw new Error(
      "handle-lead lacks a passed no-send worker health canary for the live version",
    );
  }
  const webhookEvidence = canaryEvidence.webhook_signature;
  if (
    webhookEvidence?.passed !== true || webhookEvidence?.http_status !== 200 ||
    webhookEvidence?.state !== "ignored" || webhookEvidence?.no_send !== true ||
    webhookEvidence?.function_version !== webhook.version ||
    webhookEvidence?.deployment_id !== runtimeDeploymentId(projectRef, webhook)
  ) {
    throw new Error(
      "handle-lead lacks a passed signed no-send webhook canary for the live version",
    );
  }
}

export function verifyOwnerNotificationDeployReceipt({
  functionName,
  deploySha,
  projectRef,
  migrationHistory,
  secretsMetadata,
  functionsMetadata,
  canaryEvidence,
  receiptToken,
  receiptHmacKey,
  now = new Date(),
}) {
  if (!PROTECTED_FUNCTIONS.has(functionName)) {
    return { required: false, phase: "not-applicable" };
  }
  if (!/^[0-9a-f]{40}$/.test(deploySha ?? "")) {
    throw new Error("deployment SHA must be the exact 40-character commit SHA");
  }
  requireString(projectRef, "Supabase project ref");

  const liveMigrations = collectMigrationVersions(migrationHistory);
  for (const version of REQUIRED_NOTIFICATION_MIGRATIONS) {
    if (!liveMigrations.has(version)) {
      throw new Error(`live migration history is missing ${version}`);
    }
  }

  const liveSecrets = parseSecretMetadata(secretsMetadata);
  enforceHandlerSmsPause(functionName, liveSecrets);
  const requiredSecrets = requiredSecretsFor(functionName);
  for (const name of requiredSecrets) {
    if (!liveSecrets.has(name)) {
      throw new Error(`live Edge secret ${name} is missing`);
    }
  }
  const liveFunctions = parseFunctionMetadata(functionsMetadata);

  const receipt = parseSignedReceipt(receiptToken, receiptHmacKey);
  if (receipt.receipt_version !== 1) {
    throw new Error("unsupported owner-notification receipt version");
  }
  if (receipt.project_ref !== projectRef) {
    throw new Error(
      "owner-notification receipt project does not match live project",
    );
  }
  if (receipt.source_sha !== deploySha) {
    throw new Error(
      "owner-notification receipt source SHA does not match deployment SHA",
    );
  }
  if (receipt.target_function !== functionName) {
    throw new Error(
      "owner-notification receipt target does not match selected function",
    );
  }
  if (!Object.values(OWNER_NOTIFICATION_PHASES).includes(receipt.phase)) {
    throw new Error("owner-notification receipt phase is invalid");
  }
  requireFreshWindow(receipt, now);

  const expectedPhase = functionName === "handle-lead"
    ? OWNER_NOTIFICATION_PHASES.handler
    : OWNER_NOTIFICATION_PHASES.infrastructure;
  if (receipt.phase !== expectedPhase) {
    throw new Error(
      `${functionName} requires the ${expectedPhase} owner-notification phase`,
    );
  }
  const receiptMigrations = receipt.live_migration_versions;
  if (
    !Array.isArray(receiptMigrations) ||
    REQUIRED_NOTIFICATION_MIGRATIONS.some((version) =>
      !receiptMigrations.includes(version)
    )
  ) {
    throw new Error(
      "owner-notification receipt is not bound to required live migrations",
    );
  }
  for (const name of requiredSecrets) {
    const expected = liveSecrets.get(name);
    const recorded = receipt.live_secret_metadata?.[name];
    if (
      recorded?.digest !== expected.digest ||
      recorded?.updated_at !== expected.updated_at
    ) {
      throw new Error(
        `owner-notification receipt is not bound to current live ${name} metadata`,
      );
    }
  }
  if (
    canonicalJson(receipt.live_function_metadata) !==
      canonicalJson(receiptFunctionSnapshot(liveFunctions))
  ) {
    throw new Error(
      "owner-notification receipt is not bound to current live function metadata",
    );
  }
  if (receipt.canary_contract_version !== 1) {
    throw new Error(
      "owner-notification receipt has the wrong canary contract version",
    );
  }

  const expectedSmsPause = functionName === "handle-lead"
    ? [...HANDLER_SMS_PAUSE_SECRETS]
    : null;
  if (
    canonicalJson(receipt.sms_pause_required_absent) !==
      canonicalJson(expectedSmsPause)
  ) {
    throw new Error(
      "owner-notification receipt has the wrong Utah SMS pause contract",
    );
  }

  if (functionName === "handle-lead") {
    verifyCanaries(canaryEvidence, projectRef, liveFunctions, now);
    if (
      canonicalJson(receipt.verified_canary_deployments) !==
        canonicalJson(canaryDeploymentSnapshot(canaryEvidence))
    ) {
      throw new Error(
        "handler-ready receipt is not bound to the live canary deployments",
      );
    }
  } else if (receipt.verified_canary_deployments !== null) {
    throw new Error(
      "infrastructure-ready receipt must not claim handler canary deployments",
    );
  }

  return { required: true, phase: receipt.phase };
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  try {
    if (process.argv[2] === "--issue") {
      const outputPath = requireString(
        process.argv[3],
        "receipt token output path",
      );
      const readJson = (envName, label) =>
        JSON.parse(fs.readFileSync(
          requireString(process.env[envName], label),
          "utf8",
        ));
      const issued = issueOwnerNotificationDeployReceipt({
        functionName: process.env.FUNCTION_NAME ?? "",
        deploySha: process.env.DEPLOY_SHA ?? "",
        projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
        migrationHistory: readJson(
          "NOTIFICATION_MIGRATION_HISTORY_PATH",
          "notification migration history path",
        ),
        secretsMetadata: readJson(
          "NOTIFICATION_SECRETS_METADATA_PATH",
          "notification secret metadata path",
        ),
        functionsMetadata: readJson(
          "NOTIFICATION_FUNCTIONS_METADATA_PATH",
          "notification function metadata path",
        ),
        canaryEvidence: readJson(
          "NOTIFICATION_CANARY_PATH",
          "notification canary path",
        ),
        receiptHmacKey: process.env.LEAD_NOTIFICATION_DEPLOY_RECEIPT_HMAC_KEY ??
          "",
      });
      fs.writeFileSync(outputPath, `${issued.token}\n`, {
        mode: 0o600,
        flag: "wx",
      });
      fs.chmodSync(outputPath, 0o600);
      console.log(
        "Validated owner-notification receipt written to a new mode-0600 file.",
      );
      process.exit(0);
    }
    const result = verifyOwnerNotificationDeployReceipt({
      functionName: process.env.FUNCTION_NAME ?? "",
      deploySha: process.env.DEPLOY_SHA ?? "",
      projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
      migrationHistory: JSON.parse(fs.readFileSync(
        requireString(
          process.env.NOTIFICATION_MIGRATION_HISTORY_PATH,
          "notification migration history path",
        ),
        "utf8",
      )),
      secretsMetadata: JSON.parse(fs.readFileSync(
        requireString(
          process.env.NOTIFICATION_SECRETS_METADATA_PATH,
          "notification secret metadata path",
        ),
        "utf8",
      )),
      functionsMetadata: JSON.parse(fs.readFileSync(
        requireString(
          process.env.NOTIFICATION_FUNCTIONS_METADATA_PATH,
          "notification function metadata path",
        ),
        "utf8",
      )),
      canaryEvidence: JSON.parse(fs.readFileSync(
        requireString(
          process.env.NOTIFICATION_CANARY_PATH,
          "notification canary path",
        ),
        "utf8",
      )),
      receiptToken: process.env.LEAD_NOTIFICATION_DEPLOY_RECEIPT_TOKEN ?? "",
      receiptHmacKey: process.env.LEAD_NOTIFICATION_DEPLOY_RECEIPT_HMAC_KEY ??
        "",
    });
    console.log(
      result.required
        ? `Signed/live owner-notification deployment evidence passed (phase ${result.phase}).`
        : "Owner-notification deployment evidence is not required for this function.",
    );
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
