#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  clientIpProbeTemplateViolations,
} from "./audit-client-ip-probe-contract.mjs";
import {
  CLIENT_IP_EXTRACTOR_PATH,
  CLIENT_IP_PROBE_TEMPLATE_PATH,
  expectedClientIpProbeArtifacts,
} from "./render-client-ip-probe.mjs";

const PROTECTED_FUNCTIONS = new Set(["handle-lead", "lead-crm"]);
const MAX_RECEIPT_LIFETIME_MS = 60 * 60 * 1000;
const MAX_CANARY_AGE_MS = 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_DELETE_RECHECK_GAP_MS = 60 * 1000;
const SHA256 = /^[0-9a-f]{64}$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
  return value;
}

function requireDigest(value, label) {
  if (!SHA256.test(value ?? "")) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function requirePlainObject(value, label) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  return value;
}

function assertExactKeys(value, expected, label) {
  const object = requirePlainObject(value, label);
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(
      `${label} schema differs (expected ${wanted.join(",")}; got ${actual.join(",")})`,
    );
  }
  return object;
}

function parseIsoTimestamp(value, label) {
  const text = requireString(value, label);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== text) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return timestamp;
}

function decodeBase64Url(value, label) {
  requireString(value, label);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} is not canonical base64url`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error(`${label} is not canonical base64url`);
  }
  return decoded;
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
    return requirePlainObject(
      JSON.parse(
        decodeBase64Url(encodedPayload, "client-IP receipt payload").toString(
          "utf8",
        ),
      ),
      "client-IP receipt payload",
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

function allowlistedMatrixPath(pathEvidence) {
  return {
    path: pathEvidence?.path,
    baseline: {
      outcome: pathEvidence?.baseline?.outcome,
      canonical_source: pathEvidence?.baseline?.canonical_source,
      derived_key: pathEvidence?.baseline?.derived_key,
    },
    forged_cf_connecting_ip: {
      outcome: pathEvidence?.forged_cf_connecting_ip?.outcome,
    },
    forged_x_real_ip: {
      outcome: pathEvidence?.forged_x_real_ip?.outcome,
    },
    forged_x_forwarded_for: {
      outcome: pathEvidence?.forged_x_forwarded_for?.outcome,
    },
  };
}

export function issueClientIpDeployReceipt({
  deploySha,
  projectRef,
  extractorSource,
  probeTemplateSource,
  canaryEvidence,
  receiptHmacKey,
  now = new Date(),
}) {
  requirePlainObject(canaryEvidence, "client-IP canary evidence file");
  const expectedArtifacts = expectedClientIpProbeArtifacts({
    deploySha,
    templateSource: probeTemplateSource,
    extractorSource,
  });
  const probe = canaryEvidence.probe_function;
  const sourceBinding = canaryEvidence.source_binding;
  const auth = canaryEvidence.auth;
  const requests = canaryEvidence.requests;
  const metadata = canaryEvidence.metadata_integrity;
  const mutation = canaryEvidence.mutation_control;
  const policy = canaryEvidence.evidence_policy;
  const cleanup = canaryEvidence.cleanup;
  const payload = {
    receipt_version: 2,
    project_ref: projectRef,
    target_source_sha: deploySha,
    source_binding: {
      extractor_sha256: expectedArtifacts.extractorSha256,
      probe_template_sha256: expectedArtifacts.templateSha256,
      rendered_wrapper_sha256: expectedArtifacts.renderedWrapperSha256,
      expected_source_manifest_sha256:
        expectedArtifacts.sourceManifestSha256,
      downloaded_live_source_manifest_sha256:
        sourceBinding?.downloaded_live_source_manifest_sha256,
    },
    live_ezbr_bundle_sha256: canaryEvidence.live_ezbr_bundle_sha256,
    probe_function: {
      slug: probe?.slug,
      id: probe?.id,
      version: probe?.version,
      status: probe?.status,
      deno_deployment_id: probe?.deno_deployment_id,
      ezbr_sha256: probe?.ezbr_sha256,
    },
    auth: {
      scheme: auth?.scheme,
      key_secret_name: auth?.key_secret_name,
      context: auth?.context,
      source_env_reads: Array.isArray(auth?.source_env_reads)
        ? [...auth.source_env_reads]
        : auth?.source_env_reads,
      intake_secret_read_by_probe_source:
        auth?.intake_secret_read_by_probe_source,
      service_role_read_by_probe_source:
        auth?.service_role_read_by_probe_source,
      env_to_object_used_by_probe_source:
        auth?.env_to_object_used_by_probe_source,
    },
    canary_checked_at: canaryEvidence.canary_checked_at,
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + MAX_RECEIPT_LIFETIME_MS).toISOString(),
    requests: {
      authenticated_request_count: requests?.authenticated_request_count,
      negative_auth_request_count: requests?.negative_auth_request_count,
      total_request_count: requests?.total_request_count,
      matrix: {
        ipv4: allowlistedMatrixPath(requests?.matrix?.ipv4),
        ipv6: allowlistedMatrixPath(requests?.matrix?.ipv6),
      },
      negative_auth: {
        missing_signature: {
          status: requests?.negative_auth?.missing_signature?.status,
          outcome: requests?.negative_auth?.missing_signature?.outcome,
          metadata_exposed:
            requests?.negative_auth?.missing_signature?.metadata_exposed,
        },
        invalid_signature: {
          status: requests?.negative_auth?.invalid_signature?.status,
          outcome: requests?.negative_auth?.invalid_signature?.outcome,
          metadata_exposed:
            requests?.negative_auth?.invalid_signature?.metadata_exposed,
        },
      },
    },
    metadata_integrity: {
      functions_pre_sha256: metadata?.functions_pre_sha256,
      functions_post_sha256: metadata?.functions_post_sha256,
      functions_metadata_equal: metadata?.functions_metadata_equal,
      secrets_pre_sha256: metadata?.secrets_pre_sha256,
      secrets_post_sha256: metadata?.secrets_post_sha256,
      secrets_metadata_equal: metadata?.secrets_metadata_equal,
    },
    mutation_control: {
      exclusive_mutation_window: mutation?.exclusive_mutation_window,
      exclusive_window_started_at: mutation?.exclusive_window_started_at,
      delete_rechecked_at: mutation?.delete_rechecked_at,
      probe_deleted_at: mutation?.probe_deleted_at,
      exclusive_window_ended_at: mutation?.exclusive_window_ended_at,
      delete_scope: mutation?.delete_scope,
      probe_secret_mutation_count: mutation?.probe_secret_mutation_count,
      delete_recheck: {
        slug: mutation?.delete_recheck?.slug,
        id: mutation?.delete_recheck?.id,
        version: mutation?.delete_recheck?.version,
        status: mutation?.delete_recheck?.status,
        deno_deployment_id: mutation?.delete_recheck?.deno_deployment_id,
        live_ezbr_bundle_sha256:
          mutation?.delete_recheck?.live_ezbr_bundle_sha256,
      },
    },
    evidence_policy: {
      sanitized: policy?.sanitized,
      raw_probe_operator_artifacts_retained:
        policy?.raw_probe_operator_artifacts_retained,
      raw_values_in_receipt: policy?.raw_values_in_receipt,
      secret_values_in_receipt: policy?.secret_values_in_receipt,
    },
    cleanup: {
      probe_function_deleted: cleanup?.probe_function_deleted,
      ephemeral_compute_destroyed: cleanup?.ephemeral_compute_destroyed,
    },
  };
  const token = signClientIpDeployReceipt(payload, receiptHmacKey);
  verifyClientIpDeployReceipt({
    functionName: "handle-lead",
    deploySha,
    projectRef,
    extractorSource,
    probeTemplateSource,
    receiptToken: token,
    receiptHmacKey,
    now,
  });
  return { payload, token };
}

function verifyMatrixPath(pathEvidence, label) {
  assertExactKeys(
    pathEvidence,
    [
      "path",
      "baseline",
      "forged_cf_connecting_ip",
      "forged_x_real_ip",
      "forged_x_forwarded_for",
    ],
    label,
  );
  if (pathEvidence.path !== "passed") {
    throw new Error(`client-IP receipt lacks passed ${label} path evidence`);
  }
  assertExactKeys(
    pathEvidence.baseline,
    ["outcome", "canonical_source", "derived_key"],
    `${label} baseline`,
  );
  if (
    pathEvidence.baseline.outcome !== "passed" ||
    pathEvidence.baseline.canonical_source !== "cf-connecting-ip" ||
    pathEvidence.baseline.derived_key !== "64-lowercase-hex-raw-free"
  ) {
    throw new Error(`client-IP receipt lacks passed ${label} baseline evidence`);
  }
  for (
    const [caseName, expected] of [
      ["forged_cf_connecting_ip", "rejected-or-overwritten"],
      ["forged_x_real_ip", "selected-fingerprint-unchanged"],
      ["forged_x_forwarded_for", "selected-fingerprint-unchanged"],
    ]
  ) {
    assertExactKeys(pathEvidence[caseName], ["outcome"], `${label} ${caseName}`);
    if (pathEvidence[caseName].outcome !== expected) {
      throw new Error(
        `client-IP receipt lacks passed ${label} ${caseName} evidence`,
      );
    }
  }
}

function verifyNegativeAuth(result, label) {
  assertExactKeys(
    result,
    ["status", "outcome", "metadata_exposed"],
    `negative auth ${label}`,
  );
  if (
    result.status !== 401 || result.outcome !== "generic-unauthorized" ||
    result.metadata_exposed !== false
  ) {
    throw new Error(
      `client-IP receipt lacks generic 401/no-metadata ${label} evidence`,
    );
  }
}

export function verifyClientIpDeployReceipt({
  functionName,
  deploySha,
  projectRef,
  extractorSource,
  probeTemplateSource,
  receiptToken,
  receiptHmacKey,
  now = new Date(),
}) {
  if (!PROTECTED_FUNCTIONS.has(functionName)) {
    return { required: false };
  }
  if (!FULL_SHA.test(deploySha ?? "")) {
    throw new Error(
      "client-IP receipt requires the exact 40-character deploy SHA",
    );
  }
  requireString(projectRef, "Supabase project ref");
  const templateViolations = clientIpProbeTemplateViolations(
    requireString(probeTemplateSource, "client-IP probe template source"),
  );
  if (templateViolations.length > 0) {
    throw new Error(
      `client-IP probe template violates the source contract: ${templateViolations.join(",")}`,
    );
  }
  const expectedArtifacts = expectedClientIpProbeArtifacts({
    deploySha,
    templateSource: probeTemplateSource,
    extractorSource: requireString(
      extractorSource,
      "client-IP extractor source",
    ),
  });
  const receipt = parseSignedReceipt(receiptToken, receiptHmacKey);
  assertExactKeys(
    receipt,
    [
      "receipt_version",
      "project_ref",
      "target_source_sha",
      "source_binding",
      "live_ezbr_bundle_sha256",
      "probe_function",
      "auth",
      "canary_checked_at",
      "issued_at",
      "expires_at",
      "requests",
      "metadata_integrity",
      "mutation_control",
      "evidence_policy",
      "cleanup",
    ],
    "client-IP receipt",
  );
  if (receipt.receipt_version !== 2) {
    throw new Error("unsupported client-IP receipt version");
  }
  if (receipt.project_ref !== projectRef) {
    throw new Error("client-IP receipt project does not match deploy project");
  }
  if (receipt.target_source_sha !== deploySha) {
    throw new Error(
      "client-IP receipt is not bound to the exact target source SHA",
    );
  }

  const sourceBinding = assertExactKeys(
    receipt.source_binding,
    [
      "extractor_sha256",
      "probe_template_sha256",
      "rendered_wrapper_sha256",
      "expected_source_manifest_sha256",
      "downloaded_live_source_manifest_sha256",
    ],
    "client-IP source binding",
  );
  const expectedSourceDigests = {
    extractor_sha256: expectedArtifacts.extractorSha256,
    probe_template_sha256: expectedArtifacts.templateSha256,
    rendered_wrapper_sha256: expectedArtifacts.renderedWrapperSha256,
    expected_source_manifest_sha256: expectedArtifacts.sourceManifestSha256,
    downloaded_live_source_manifest_sha256:
      expectedArtifacts.sourceManifestSha256,
  };
  for (const [name, expected] of Object.entries(expectedSourceDigests)) {
    requireDigest(sourceBinding[name], `client-IP ${name}`);
    if (sourceBinding[name] !== expected) {
      throw new Error(`client-IP receipt ${name} differs from exact source`);
    }
  }
  requireDigest(
    receipt.live_ezbr_bundle_sha256,
    "client-IP live ezbr bundle SHA-256",
  );

  const probe = assertExactKeys(
    receipt.probe_function,
    [
      "slug",
      "id",
      "version",
      "status",
      "deno_deployment_id",
      "ezbr_sha256",
    ],
    "client-IP probe function",
  );
  if (
    probe.slug !== "client-ip-probe" || !UUID.test(probe.id ?? "") ||
    !Number.isSafeInteger(probe.version) || probe.version < 1 ||
    probe.status !== "ACTIVE_AT_CANARY"
  ) {
    throw new Error(
      "client-IP receipt lacks the exact probe function ID/version/state",
    );
  }
  const expectedDeploymentId = `${projectRef}_${probe.id}_${probe.version}`;
  if (probe.deno_deployment_id !== expectedDeploymentId) {
    throw new Error(
      "client-IP receipt DENO_DEPLOYMENT_ID does not match project/function/version",
    );
  }
  requireDigest(probe.ezbr_sha256, "client-IP probe ezbr SHA-256");
  if (probe.ezbr_sha256 !== receipt.live_ezbr_bundle_sha256) {
    throw new Error(
      "client-IP receipt live ezbr SHA-256 differs from probe metadata",
    );
  }

  const auth = assertExactKeys(
    receipt.auth,
    [
      "scheme",
      "key_secret_name",
      "context",
      "source_env_reads",
      "intake_secret_read_by_probe_source",
      "service_role_read_by_probe_source",
      "env_to_object_used_by_probe_source",
    ],
    "client-IP probe auth",
  );
  if (
    auth.scheme !== "hmac-sha256" ||
    auth.key_secret_name !== "LEAD_NOTIFICATION_WORKER_TOKEN" ||
    auth.context !== "client-ip-probe-v1" ||
    JSON.stringify(auth.source_env_reads) !== JSON.stringify([
      "DENO_DEPLOYMENT_ID",
      "LEAD_NOTIFICATION_WORKER_TOKEN",
    ]) ||
    auth.intake_secret_read_by_probe_source !== false ||
    auth.service_role_read_by_probe_source !== false ||
    auth.env_to_object_used_by_probe_source !== false
  ) {
    throw new Error(
      "client-IP receipt lacks the worker-token HMAC/no-intake-secret source contract",
    );
  }

  const issuedAt = parseIsoTimestamp(
    receipt.issued_at,
    "client-IP receipt issued_at",
  );
  const expiresAt = parseIsoTimestamp(
    receipt.expires_at,
    "client-IP receipt expires_at",
  );
  const checkedAt = parseIsoTimestamp(
    receipt.canary_checked_at,
    "client-IP canary_checked_at",
  );
  const nowMs = now.getTime();
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

  const requests = assertExactKeys(
    receipt.requests,
    [
      "authenticated_request_count",
      "negative_auth_request_count",
      "total_request_count",
      "matrix",
      "negative_auth",
    ],
    "client-IP request evidence",
  );
  if (
    requests.authenticated_request_count !== 8 ||
    requests.negative_auth_request_count !== 2 ||
    requests.total_request_count !== 10
  ) {
    throw new Error(
      "client-IP receipt requires exactly 8 authenticated plus 2 negative-auth requests (10 total)",
    );
  }
  const matrix = assertExactKeys(
    requests.matrix,
    ["ipv4", "ipv6"],
    "client-IP request matrix",
  );
  verifyMatrixPath(matrix.ipv4, "ipv4");
  verifyMatrixPath(matrix.ipv6, "ipv6");
  const negativeAuth = assertExactKeys(
    requests.negative_auth,
    ["missing_signature", "invalid_signature"],
    "client-IP negative auth evidence",
  );
  verifyNegativeAuth(negativeAuth.missing_signature, "missing signature");
  verifyNegativeAuth(negativeAuth.invalid_signature, "invalid signature");

  const metadata = assertExactKeys(
    receipt.metadata_integrity,
    [
      "functions_pre_sha256",
      "functions_post_sha256",
      "functions_metadata_equal",
      "secrets_pre_sha256",
      "secrets_post_sha256",
      "secrets_metadata_equal",
    ],
    "client-IP metadata integrity",
  );
  for (
    const [preName, postName, equalName, label] of [
      [
        "functions_pre_sha256",
        "functions_post_sha256",
        "functions_metadata_equal",
        "function metadata",
      ],
      [
        "secrets_pre_sha256",
        "secrets_post_sha256",
        "secrets_metadata_equal",
        "secret metadata",
      ],
    ]
  ) {
    requireDigest(metadata[preName], `client-IP ${label} pre SHA-256`);
    requireDigest(metadata[postName], `client-IP ${label} post SHA-256`);
    if (
      metadata[preName] !== metadata[postName] || metadata[equalName] !== true
    ) {
      throw new Error(`client-IP receipt lacks full pre/post ${label} equality`);
    }
  }

  const mutation = assertExactKeys(
    receipt.mutation_control,
    [
      "exclusive_mutation_window",
      "exclusive_window_started_at",
      "delete_rechecked_at",
      "probe_deleted_at",
      "exclusive_window_ended_at",
      "delete_scope",
      "probe_secret_mutation_count",
      "delete_recheck",
    ],
    "client-IP mutation control",
  );
  if (
    mutation.exclusive_mutation_window !== true ||
    mutation.delete_scope !== "slug-only" ||
    mutation.probe_secret_mutation_count !== 0
  ) {
    throw new Error(
      "client-IP receipt lacks exclusive slug-only deletion and zero probe-secret mutation",
    );
  }
  const windowStartedAt = parseIsoTimestamp(
    mutation.exclusive_window_started_at,
    "client-IP exclusive window start",
  );
  const deleteRecheckedAt = parseIsoTimestamp(
    mutation.delete_rechecked_at,
    "client-IP delete tuple recheck",
  );
  const probeDeletedAt = parseIsoTimestamp(
    mutation.probe_deleted_at,
    "client-IP probe deletion",
  );
  const windowEndedAt = parseIsoTimestamp(
    mutation.exclusive_window_ended_at,
    "client-IP exclusive window end",
  );
  if (
    windowStartedAt > checkedAt || checkedAt > deleteRecheckedAt ||
    deleteRecheckedAt > probeDeletedAt || probeDeletedAt > windowEndedAt ||
    windowEndedAt > issuedAt ||
    windowEndedAt - windowStartedAt > MAX_RECEIPT_LIFETIME_MS ||
    probeDeletedAt - deleteRecheckedAt > MAX_DELETE_RECHECK_GAP_MS
  ) {
    throw new Error(
      "client-IP exclusive mutation window/canary/delete ordering is invalid",
    );
  }
  const deleteRecheck = assertExactKeys(
    mutation.delete_recheck,
    [
      "slug",
      "id",
      "version",
      "status",
      "deno_deployment_id",
      "live_ezbr_bundle_sha256",
    ],
    "client-IP delete tuple recheck",
  );
  if (
    deleteRecheck.slug !== probe.slug || deleteRecheck.id !== probe.id ||
    deleteRecheck.version !== probe.version ||
    deleteRecheck.status !== probe.status ||
    deleteRecheck.deno_deployment_id !== probe.deno_deployment_id ||
    deleteRecheck.live_ezbr_bundle_sha256 !==
      receipt.live_ezbr_bundle_sha256
  ) {
    throw new Error(
      "client-IP receipt delete tuple does not match the exact canaried probe",
    );
  }

  const policy = assertExactKeys(
    receipt.evidence_policy,
    [
      "sanitized",
      "raw_probe_operator_artifacts_retained",
      "raw_values_in_receipt",
      "secret_values_in_receipt",
    ],
    "client-IP evidence policy",
  );
  if (
    policy.sanitized !== true ||
    policy.raw_probe_operator_artifacts_retained !== false ||
    policy.raw_values_in_receipt !== false ||
    policy.secret_values_in_receipt !== false
  ) {
    throw new Error(
      "client-IP receipt lacks raw-free sanitized probe/operator evidence",
    );
  }
  const cleanup = assertExactKeys(
    receipt.cleanup,
    ["probe_function_deleted", "ephemeral_compute_destroyed"],
    "client-IP cleanup",
  );
  if (
    cleanup.probe_function_deleted !== true ||
    cleanup.ephemeral_compute_destroyed !== true
  ) {
    throw new Error(
      "client-IP receipt lacks probe deletion and ephemeral compute destruction",
    );
  }

  return {
    required: true,
    extractorSha256: expectedArtifacts.extractorSha256,
    probeId: probe.id,
    probeVersion: probe.version,
    sourceManifestSha256: expectedArtifacts.sourceManifestSha256,
    liveEzbrSha256: receipt.live_ezbr_bundle_sha256,
  };
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  try {
    const extractorSource = fs.readFileSync(CLIENT_IP_EXTRACTOR_PATH, "utf8");
    const probeTemplateSource = fs.readFileSync(
      CLIENT_IP_PROBE_TEMPLATE_PATH,
      "utf8",
    );
    if (process.argv[2] === "--issue") {
      const outputPath = requireString(
        process.argv[3],
        "receipt token output path",
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
        probeTemplateSource,
        canaryEvidence,
        receiptHmacKey: process.env.CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY ?? "",
      });
      fs.writeFileSync(outputPath, `${issued.token}\n`, {
        mode: 0o600,
        flag: "wx",
      });
      fs.chmodSync(outputPath, 0o600);
      console.log(
        "Validated client-IP receipt v2 written to a new mode-0600 file.",
      );
      process.exit(0);
    }
    const result = verifyClientIpDeployReceipt({
      functionName: process.env.FUNCTION_NAME ?? "",
      deploySha: process.env.DEPLOY_SHA ?? "",
      projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
      extractorSource,
      probeTemplateSource,
      receiptToken: process.env.CLIENT_IP_DEPLOY_RECEIPT_TOKEN ?? "",
      receiptHmacKey: process.env.CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY ?? "",
    });
    console.log(
      result.required
        ? `Signed client-IP deployment evidence v2 passed (extractor ${result.extractorSha256}, probe ${result.probeId} v${result.probeVersion}, live ezbr ${result.liveEzbrSha256}).`
        : "Client-IP deployment evidence is not required for this function.",
    );
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
