#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const DASHBOARD_DEPLOY_RECEIPTS = Object.freeze({
  additive: "pending",
  final: "complete",
});

export const REQUIRED_DASHBOARD_MIGRATIONS = Object.freeze([
  "20260807000140",
  "20260807000150",
]);

const DASHBOARD_FUNCTIONS = new Set(["lead-crm", "weekly-report"]);
const MAX_RECEIPT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const BASE_REQUIRED_SECRETS = [
  "DASHBOARD_SESSION_SECRET",
  "DASHBOARD_CREDENTIAL_PEPPER",
  "SUPABASE_SERVICE_ROLE_KEY",
];

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

function liveCutoverComplete(value) {
  const rows = [];
  const visit = (entry) => {
    if (Array.isArray(entry)) {
      for (const nested of entry) visit(nested);
    } else if (entry && typeof entry === "object") {
      if ("report_access_pins_all_null" in entry ||
        "plaintext_pin_constraint_present" in entry) {
        if (typeof entry.report_access_pins_all_null !== "boolean" ||
          typeof entry.plaintext_pin_constraint_present !== "boolean") {
          throw new Error("live cutover-state query returned non-boolean evidence");
        }
        rows.push({
          pinsNull: entry.report_access_pins_all_null,
          constraintPresent: entry.plaintext_pin_constraint_present,
        });
      }
      for (const nested of Object.values(entry)) visit(nested);
    }
  };
  visit(value);
  if (rows.length === 0) {
    throw new Error("live cutover-state evidence is missing");
  }
  const first = rows[0];
  if (rows.some((row) => row.pinsNull !== first.pinsNull ||
    row.constraintPresent !== first.constraintPresent)) {
    throw new Error("live cutover-state evidence is inconsistent");
  }
  return first.pinsNull && first.constraintPresent;
}

function parseSecretMetadata(value) {
  if (!Array.isArray(value)) {
    throw new Error("live Supabase secret metadata is not an array");
  }
  const result = new Map();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || typeof entry.name !== "string") {
      throw new Error("live Supabase secret metadata contains an invalid entry");
    }
    if (result.has(entry.name)) {
      throw new Error(`live Supabase secret metadata repeats ${entry.name}`);
    }
    result.set(entry.name, {
      digest: requireString(entry.value, `${entry.name} digest`),
      updatedAt: requireString(entry.updated_at, `${entry.name} updated_at`),
    });
  }
  return result;
}

function parseSignedReceipt(token, hmacKey) {
  const key = Buffer.from(requireString(hmacKey, "receipt HMAC key"), "utf8");
  if (key.length < 32) {
    throw new Error("receipt HMAC key must be at least 32 bytes");
  }
  const parts = requireString(token, "signed dashboard deployment receipt").split(".");
  if (parts.length !== 2) {
    throw new Error("signed dashboard deployment receipt has an invalid format");
  }
  const [encodedPayload, encodedSignature] = parts;
  const supplied = decodeBase64Url(encodedSignature, "receipt signature");
  const expected = crypto.createHmac("sha256", key).update(encodedPayload).digest();
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new Error("dashboard deployment receipt signature is invalid");
  }
  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload, "receipt payload").toString("utf8"));
  } catch (error) {
    throw new Error(`dashboard deployment receipt payload is invalid: ${error.message}`);
  }
  return payload;
}

export function signDashboardDeployReceipt(payload, hmacKey) {
  const key = Buffer.from(requireString(hmacKey, "receipt HMAC key"), "utf8");
  if (key.length < 32) throw new Error("receipt HMAC key must be at least 32 bytes");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", key).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyDashboardDeployReceipt({
  functionName,
  deploySha,
  projectRef,
  migrationHistory,
  secretsMetadata,
  receiptToken,
  receiptHmacKey,
  now = new Date(),
}) {
  if (!DASHBOARD_FUNCTIONS.has(functionName)) {
    return { required: false, cutover: "not-applicable" };
  }
  if (!/^[0-9a-f]{40}$/.test(deploySha ?? "")) {
    throw new Error("deployment SHA must be the exact 40-character commit SHA");
  }
  requireString(projectRef, "Supabase project ref");

  const liveMigrations = collectMigrationVersions(migrationHistory);
  for (const version of REQUIRED_DASHBOARD_MIGRATIONS) {
    if (!liveMigrations.has(version)) {
      throw new Error(`live migration history is missing ${version}`);
    }
  }

  const liveSecrets = parseSecretMetadata(secretsMetadata);
  const requiredSecrets = [...BASE_REQUIRED_SECRETS];
  if (functionName === "lead-crm") requiredSecrets.push("LEAD_CRM_API_KEY");
  if (functionName === "weekly-report") {
    requiredSecrets.push("SUPABASE_URL", "POSTHOG_PERSONAL_API_KEY");
  }
  for (const name of requiredSecrets) {
    if (!liveSecrets.has(name)) throw new Error(`live Edge secret ${name} is missing`);
  }
  const session = liveSecrets.get("DASHBOARD_SESSION_SECRET");
  const pepper = liveSecrets.get("DASHBOARD_CREDENTIAL_PEPPER");
  if (session.digest === pepper.digest) {
    throw new Error("live dashboard session secret and credential pepper digests are identical");
  }

  const receipt = parseSignedReceipt(receiptToken, receiptHmacKey);
  if (receipt.receipt_version !== 1) throw new Error("unsupported dashboard receipt version");
  if (receipt.project_ref !== projectRef) throw new Error("dashboard receipt project does not match live project");
  if (receipt.source_sha !== deploySha) throw new Error("dashboard receipt source SHA does not match deployment SHA");
  if (!Object.values(DASHBOARD_DEPLOY_RECEIPTS).includes(receipt.cutover_state)) {
    throw new Error("dashboard receipt cutover_state must be pending or complete");
  }
  const cutoverComplete = liveCutoverComplete(migrationHistory);
  const claimedComplete = receipt.cutover_state === DASHBOARD_DEPLOY_RECEIPTS.final;
  if (claimedComplete !== cutoverComplete) {
    throw new Error(
      claimedComplete
        ? "complete dashboard receipt lacks live PIN-null/constraint cutover evidence"
        : "pending dashboard receipt is invalid because live cutover is already complete",
    );
  }
  if (receipt.live_cutover_complete !== cutoverComplete) {
    throw new Error("dashboard receipt is not bound to the current live cutover state");
  }

  const issuedAt = Date.parse(requireString(receipt.issued_at, "receipt issued_at"));
  const expiresAt = Date.parse(requireString(receipt.expires_at, "receipt expires_at"));
  const nowMs = now.getTime();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new Error("dashboard receipt timestamps must be valid ISO dates");
  }
  if (issuedAt > nowMs + MAX_CLOCK_SKEW_MS || expiresAt <= nowMs) {
    throw new Error("dashboard receipt is not currently valid");
  }
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_RECEIPT_LIFETIME_MS) {
    throw new Error("dashboard receipt lifetime must be positive and no more than 24 hours");
  }

  if (receipt.secret_minimum_bytes !== 32 || receipt.secret_values_distinct !== true) {
    throw new Error("dashboard receipt does not attest 32-byte distinct secret values");
  }
  for (const name of ["DASHBOARD_SESSION_SECRET", "DASHBOARD_CREDENTIAL_PEPPER"]) {
    const evidence = receipt.live_secret_metadata?.[name];
    const live = liveSecrets.get(name);
    if (evidence?.digest !== live.digest || evidence?.updated_at !== live.updatedAt) {
      throw new Error(`dashboard receipt is not bound to current live ${name} metadata`);
    }
  }
  const receiptMigrations = receipt.live_migration_versions;
  if (!Array.isArray(receiptMigrations) ||
    REQUIRED_DASHBOARD_MIGRATIONS.some((version) => !receiptMigrations.includes(version))) {
    throw new Error("dashboard receipt is not bound to the required live migration versions");
  }
  for (const check of ["admin", "sales", "viewer", "session_revocation"]) {
    if (receipt.auth_role_smoke?.[check] !== "passed") {
      throw new Error(`dashboard receipt lacks passed ${check} auth/role smoke evidence`);
    }
  }
  const requiredSmokeScope = receipt.cutover_state === DASHBOARD_DEPLOY_RECEIPTS.final
    ? "live-production"
    : "exact-source-offline";
  if (receipt.auth_role_smoke_scope !== requiredSmokeScope) {
    throw new Error(
      `${receipt.cutover_state} dashboard receipt requires ${requiredSmokeScope} auth/role smoke scope`,
    );
  }

  return { required: true, cutover: receipt.cutover_state };
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  try {
    const migrationHistory = JSON.parse(fs.readFileSync(
      requireString(process.env.MIGRATION_HISTORY_PATH, "migration history path"),
      "utf8",
    ));
    const secretsMetadata = JSON.parse(fs.readFileSync(
      requireString(process.env.SECRETS_METADATA_PATH, "secret metadata path"),
      "utf8",
    ));
    const result = verifyDashboardDeployReceipt({
      functionName: process.env.FUNCTION_NAME ?? "",
      deploySha: process.env.DEPLOY_SHA ?? "",
      projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
      migrationHistory,
      secretsMetadata,
      receiptToken: process.env.DASHBOARD_DEPLOY_RECEIPT_TOKEN ?? "",
      receiptHmacKey: process.env.DASHBOARD_DEPLOY_RECEIPT_HMAC_KEY ?? "",
    });
    console.log(result.required
      ? `Signed dashboard deployment evidence passed (cutover ${result.cutover}).`
      : "Dashboard deployment evidence is not required for this function.");
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
