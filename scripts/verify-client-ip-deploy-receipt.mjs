#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const PROTECTED_FUNCTIONS = new Set(["handle-lead", "lead-crm"]);
const MAX_RECEIPT_LIFETIME_MS = 60 * 60 * 1000;
const MAX_CANARY_AGE_MS = 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

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

function parseSignedReceipt(token, hmacKey) {
  const key = Buffer.from(
    requireString(hmacKey, "client-IP receipt HMAC key"),
    "utf8",
  );
  if (key.length < 32) {
    throw new Error("client-IP receipt HMAC key must be at least 32 bytes");
  }
  const parts = requireString(token, "signed client-IP deployment receipt")
    .split(".");
  if (parts.length !== 2) {
    throw new Error(
      "signed client-IP deployment receipt has an invalid format",
    );
  }
  const [encodedPayload, encodedSignature] = parts;
  const supplied = decodeBase64Url(
    encodedSignature,
    "client-IP receipt signature",
  );
  const expected = crypto.createHmac("sha256", key).update(encodedPayload)
    .digest();
  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    throw new Error("client-IP deployment receipt signature is invalid");
  }
  try {
    return JSON.parse(
      decodeBase64Url(encodedPayload, "client-IP receipt payload").toString(
        "utf8",
      ),
    );
  } catch (error) {
    throw new Error(
      `client-IP deployment receipt payload is invalid: ${error.message}`,
    );
  }
}

export function signClientIpDeployReceipt(payload, hmacKey) {
  const key = Buffer.from(
    requireString(hmacKey, "client-IP receipt HMAC key"),
    "utf8",
  );
  if (key.length < 32) {
    throw new Error("client-IP receipt HMAC key must be at least 32 bytes");
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = crypto.createHmac("sha256", key).update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function issueClientIpDeployReceipt({
  deploySha,
  projectRef,
  extractorSource,
  canaryEvidence,
  receiptHmacKey,
  now = new Date(),
}) {
  if (!canaryEvidence || typeof canaryEvidence !== "object") {
    throw new Error("client-IP canary evidence file is invalid");
  }
  const probe = canaryEvidence.probe_function;
  const results = canaryEvidence.canary_results;
  const cleanup = canaryEvidence.cleanup;
  const payload = {
    receipt_version: 1,
    project_ref: projectRef,
    source_sha: deploySha,
    probe_source_sha: canaryEvidence.probe_source_sha,
    extractor_sha256: crypto.createHash("sha256")
      .update(requireString(extractorSource, "client-IP extractor source"))
      .digest("hex"),
    probe_bundle_sha256: canaryEvidence.probe_bundle_sha256,
    probe_function: {
      slug: probe?.slug,
      version: probe?.version,
      status: probe?.status,
    },
    canary_checked_at: canaryEvidence.canary_checked_at,
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + MAX_RECEIPT_LIFETIME_MS).toISOString(),
    canary_results: {
      ipv4_path: results?.ipv4_path,
      ipv6_path: results?.ipv6_path,
      canonical_source: results?.canonical_source,
      forged_cf_connecting_ip: results?.forged_cf_connecting_ip,
      forged_x_real_ip: results?.forged_x_real_ip,
      forged_x_forwarded_for: results?.forged_x_forwarded_for,
      derived_key: results?.derived_key,
      raw_values_retained: results?.raw_values_retained,
    },
    cleanup: {
      probe_function_deleted: cleanup?.probe_function_deleted,
      probe_secrets_deleted: cleanup?.probe_secrets_deleted,
    },
  };
  const token = signClientIpDeployReceipt(payload, receiptHmacKey);
  verifyClientIpDeployReceipt({
    functionName: "handle-lead",
    deploySha,
    projectRef,
    extractorSource,
    receiptToken: token,
    receiptHmacKey,
    now,
  });
  return { payload, token };
}

export function verifyClientIpDeployReceipt({
  functionName,
  deploySha,
  projectRef,
  extractorSource,
  receiptToken,
  receiptHmacKey,
  now = new Date(),
}) {
  if (!PROTECTED_FUNCTIONS.has(functionName)) {
    return { required: false };
  }
  if (!/^[0-9a-f]{40}$/.test(deploySha ?? "")) {
    throw new Error(
      "client-IP receipt requires the exact 40-character deploy SHA",
    );
  }
  requireString(projectRef, "Supabase project ref");
  if (typeof extractorSource !== "string" || extractorSource.length === 0) {
    throw new Error("client-IP extractor source is unavailable");
  }

  const liveExtractorDigest = crypto.createHash("sha256")
    .update(extractorSource)
    .digest("hex");
  const receipt = parseSignedReceipt(receiptToken, receiptHmacKey);
  if (receipt.receipt_version !== 1) {
    throw new Error("unsupported client-IP receipt version");
  }
  if (receipt.project_ref !== projectRef) {
    throw new Error("client-IP receipt project does not match deploy project");
  }
  if (
    receipt.source_sha !== deploySha || receipt.probe_source_sha !== deploySha
  ) {
    throw new Error(
      "client-IP receipt is not bound to the exact deploy/probe source SHA",
    );
  }
  if (receipt.extractor_sha256 !== liveExtractorDigest) {
    throw new Error(
      "client-IP receipt is not bound to the current shared extractor",
    );
  }
  if (!/^[0-9a-f]{64}$/.test(receipt.probe_bundle_sha256 ?? "")) {
    throw new Error(
      "client-IP receipt lacks the exact deployed probe bundle SHA-256",
    );
  }
  if (
    receipt.probe_function?.slug !== "client-ip-probe" ||
    !Number.isSafeInteger(receipt.probe_function?.version) ||
    receipt.probe_function.version < 1 ||
    receipt.probe_function.status !== "ACTIVE_AT_CANARY"
  ) {
    throw new Error(
      "client-IP receipt lacks the deployed probe function/version state",
    );
  }

  const issuedAt = Date.parse(
    requireString(receipt.issued_at, "client-IP receipt issued_at"),
  );
  const expiresAt = Date.parse(
    requireString(receipt.expires_at, "client-IP receipt expires_at"),
  );
  const checkedAt = Date.parse(
    requireString(receipt.canary_checked_at, "client-IP canary_checked_at"),
  );
  const nowMs = now.getTime();
  if (![issuedAt, expiresAt, checkedAt].every(Number.isFinite)) {
    throw new Error("client-IP receipt timestamps must be valid ISO dates");
  }
  if (
    issuedAt > nowMs + MAX_CLOCK_SKEW_MS || expiresAt <= nowMs ||
    checkedAt > nowMs + MAX_CLOCK_SKEW_MS ||
    nowMs - checkedAt > MAX_CANARY_AGE_MS
  ) {
    throw new Error("client-IP receipt or canary is stale or future-dated");
  }
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_RECEIPT_LIFETIME_MS) {
    throw new Error(
      "client-IP receipt lifetime must be positive and no more than one hour",
    );
  }
  if (checkedAt > issuedAt + MAX_CLOCK_SKEW_MS) {
    throw new Error("client-IP receipt was issued before its canary completed");
  }

  const results = receipt.canary_results;
  const expectedResults = {
    ipv4_path: "passed",
    canonical_source: "cf-connecting-ip",
    forged_cf_connecting_ip: "rejected-or-overwritten",
    forged_x_real_ip: "selected-fingerprint-unchanged",
    forged_x_forwarded_for: "selected-fingerprint-unchanged",
    derived_key: "64-lowercase-hex-raw-free",
    raw_values_retained: false,
  };
  for (const [name, expected] of Object.entries(expectedResults)) {
    if (results?.[name] !== expected) {
      throw new Error(`client-IP receipt lacks passed ${name} canary evidence`);
    }
  }
  if (
    results?.ipv6_path !== "passed" &&
    results?.ipv6_path !== "runner-ipv6-unavailable"
  ) {
    throw new Error("client-IP receipt lacks valid ipv6_path canary evidence");
  }
  if (
    receipt.cleanup?.probe_function_deleted !== true ||
    receipt.cleanup?.probe_secrets_deleted !== true
  ) {
    throw new Error(
      "client-IP receipt lacks probe function/secret cleanup evidence",
    );
  }

  return {
    required: true,
    extractorSha256: liveExtractorDigest,
    probeVersion: receipt.probe_function.version,
  };
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
      const extractorSource = fs.readFileSync(
        "supabase/functions/_shared/client-ip.ts",
        "utf8",
      );
      const canaryEvidence = JSON.parse(fs.readFileSync(
        requireString(
          process.env.CLIENT_IP_CANARY_EVIDENCE_PATH,
          "client-IP canary evidence path",
        ),
        "utf8",
      ));
      const issued = issueClientIpDeployReceipt({
        deploySha: process.env.DEPLOY_SHA ?? "",
        projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
        extractorSource,
        canaryEvidence,
        receiptHmacKey: process.env.CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY ?? "",
      });
      fs.writeFileSync(outputPath, `${issued.token}\n`, {
        mode: 0o600,
        flag: "wx",
      });
      fs.chmodSync(outputPath, 0o600);
      console.log(
        "Validated client-IP receipt written to a new mode-0600 file.",
      );
      process.exit(0);
    }
    const result = verifyClientIpDeployReceipt({
      functionName: process.env.FUNCTION_NAME ?? "",
      deploySha: process.env.DEPLOY_SHA ?? "",
      projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
      extractorSource: fs.readFileSync(
        "supabase/functions/_shared/client-ip.ts",
        "utf8",
      ),
      receiptToken: process.env.CLIENT_IP_DEPLOY_RECEIPT_TOKEN ?? "",
      receiptHmacKey: process.env.CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY ?? "",
    });
    console.log(
      result.required
        ? `Signed client-IP deployment evidence passed (extractor ${result.extractorSha256}, probe v${result.probeVersion}).`
        : "Client-IP deployment evidence is not required for this function.",
    );
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
