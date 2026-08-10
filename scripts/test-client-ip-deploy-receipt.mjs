#!/usr/bin/env node

// The blocking dashboard-security job invokes this file. Import the sibling
// owner-notification contract so both production receipt systems remain under
// one mandatory deploy-evidence entrypoint.
await import("./test-owner-notification-deploy-receipt.mjs");

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  auditClientIpProbeContract,
  clientIpProbeTemplateViolations,
  probeToolViolation,
} from "./audit-client-ip-probe-contract.mjs";
import {
  CLIENT_IP_EXTRACTOR_PATH,
  CLIENT_IP_PROBE_TEMPLATE_PATH,
  expectedClientIpProbeArtifacts,
} from "./render-client-ip-probe.mjs";
import {
  issueClientIpDeployReceipt,
  signClientIpDeployReceipt,
  verifyClientIpDeployReceipt,
} from "./verify-client-ip-deploy-receipt.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function trackedTextFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const sources = new Map();
  for (const relative of result.stdout.split("\0").filter(Boolean)) {
    const contents = fs.readFileSync(path.join(root, relative));
    if (!contents.includes(0)) sources.set(relative, contents.toString("utf8"));
  }
  return sources;
}

const trackedTextSources = trackedTextFiles();
const trackedTextPaths = [...trackedTextSources.keys()];
const extractorSource = read(CLIENT_IP_EXTRACTOR_PATH);
const probeTemplateSource = read(CLIENT_IP_PROBE_TEMPLATE_PATH);
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SHA = "f".repeat(40);
const PROJECT_REF = "hdcflshhomzildwqlmwh";
const PROBE_ID = "11111111-2222-4333-8aaa-555555555555";
const PROBE_VERSION = 7;
const DEPLOYMENT_ID = `${PROJECT_REF}_${PROBE_ID}_${PROBE_VERSION}`;
const HMAC_KEY = "test-client-ip-receipt-hmac-key-at-least-32-bytes";
const NOW = new Date("2026-08-09T18:30:00.000Z");
const LEAK_MARKER = "raw-ip-or-secret-must-not-enter-token";
const artifacts = expectedClientIpProbeArtifacts({
  deploySha: SHA,
  templateSource: probeTemplateSource,
  extractorSource,
});

function matrixPath() {
  return {
    path: "passed",
    baseline: {
      outcome: "passed",
      canonical_source: "cf-connecting-ip",
      derived_key: "64-lowercase-hex-raw-free",
    },
    forged_cf_connecting_ip: { outcome: "rejected-or-overwritten" },
    forged_x_real_ip: { outcome: "selected-fingerprint-unchanged" },
    forged_x_forwarded_for: {
      outcome: "selected-fingerprint-unchanged",
    },
  };
}

function receiptPayload(overrides = {}) {
  return {
    receipt_version: 2,
    project_ref: PROJECT_REF,
    target_source_sha: SHA,
    source_binding: {
      extractor_sha256: artifacts.extractorSha256,
      probe_template_sha256: artifacts.templateSha256,
      rendered_wrapper_sha256: artifacts.renderedWrapperSha256,
      expected_source_manifest_sha256: artifacts.sourceManifestSha256,
      downloaded_live_source_manifest_sha256: artifacts.sourceManifestSha256,
    },
    live_ezbr_bundle_sha256: "a".repeat(64),
    probe_function: {
      slug: "client-ip-probe",
      id: PROBE_ID,
      version: PROBE_VERSION,
      status: "ACTIVE_AT_CANARY",
      deno_deployment_id: DEPLOYMENT_ID,
      ezbr_sha256: "a".repeat(64),
    },
    auth: {
      scheme: "hmac-sha256",
      key_secret_name: "LEAD_NOTIFICATION_WORKER_TOKEN",
      context: "client-ip-probe-v1",
      source_env_reads: [
        "DENO_DEPLOYMENT_ID",
        "LEAD_NOTIFICATION_WORKER_TOKEN",
      ],
      intake_secret_read_by_probe_source: false,
      service_role_read_by_probe_source: false,
      env_to_object_used_by_probe_source: false,
    },
    canary_checked_at: "2026-08-09T18:15:00.000Z",
    issued_at: "2026-08-09T18:20:00.000Z",
    expires_at: "2026-08-09T19:20:00.000Z",
    requests: {
      authenticated_request_count: 8,
      negative_auth_request_count: 2,
      total_request_count: 10,
      matrix: { ipv4: matrixPath(), ipv6: matrixPath() },
      negative_auth: {
        missing_signature: {
          status: 401,
          outcome: "generic-unauthorized",
          metadata_exposed: false,
        },
        invalid_signature: {
          status: 401,
          outcome: "generic-unauthorized",
          metadata_exposed: false,
        },
      },
    },
    metadata_integrity: {
      functions_pre_sha256: "b".repeat(64),
      functions_post_sha256: "b".repeat(64),
      functions_metadata_equal: true,
      secrets_pre_sha256: "c".repeat(64),
      secrets_post_sha256: "c".repeat(64),
      secrets_metadata_equal: true,
    },
    mutation_control: {
      exclusive_mutation_window: true,
      exclusive_window_started_at: "2026-08-09T18:10:00.000Z",
      delete_rechecked_at: "2026-08-09T18:17:00.000Z",
      probe_deleted_at: "2026-08-09T18:17:30.000Z",
      exclusive_window_ended_at: "2026-08-09T18:18:00.000Z",
      delete_scope: "slug-only",
      probe_secret_mutation_count: 0,
      delete_recheck: {
        slug: "client-ip-probe",
        id: PROBE_ID,
        version: PROBE_VERSION,
        status: "ACTIVE_AT_CANARY",
        deno_deployment_id: DEPLOYMENT_ID,
        live_ezbr_bundle_sha256: "a".repeat(64),
      },
    },
    evidence_policy: {
      sanitized: true,
      raw_probe_operator_artifacts_retained: false,
      raw_values_in_receipt: false,
      secret_values_in_receipt: false,
    },
    cleanup: {
      probe_function_deleted: true,
      ephemeral_compute_destroyed: true,
    },
    ...overrides,
  };
}

function canaryEvidence(timestamps = {}) {
  const payload = receiptPayload();
  return {
    source_binding: {
      downloaded_live_source_manifest_sha256:
        payload.source_binding.downloaded_live_source_manifest_sha256,
    },
    live_ezbr_bundle_sha256: payload.live_ezbr_bundle_sha256,
    probe_function: payload.probe_function,
    auth: payload.auth,
    canary_checked_at: timestamps.canary_checked_at ??
      payload.canary_checked_at,
    requests: payload.requests,
    metadata_integrity: payload.metadata_integrity,
    mutation_control: {
      ...payload.mutation_control,
      exclusive_window_started_at:
        timestamps.exclusive_window_started_at ??
        payload.mutation_control.exclusive_window_started_at,
      delete_rechecked_at: timestamps.delete_rechecked_at ??
        payload.mutation_control.delete_rechecked_at,
      probe_deleted_at: timestamps.probe_deleted_at ??
        payload.mutation_control.probe_deleted_at,
      exclusive_window_ended_at: timestamps.exclusive_window_ended_at ??
        payload.mutation_control.exclusive_window_ended_at,
    },
    evidence_policy: payload.evidence_policy,
    cleanup: payload.cleanup,
  };
}

function verifyPayload(payload) {
  return verifyClientIpDeployReceipt({
    functionName: "handle-lead",
    deploySha: SHA,
    projectRef: PROJECT_REF,
    extractorSource,
    probeTemplateSource,
    receiptToken: signClientIpDeployReceipt(payload, HMAC_KEY),
    receiptHmacKey: HMAC_KEY,
    now: NOW,
  });
}

function rejectMutation(label, mutate, pattern) {
  const candidate = structuredClone(receiptPayload());
  mutate(candidate);
  assert.throws(() => verifyPayload(candidate), pattern, label);
}

assert.deepEqual(verifyPayload(receiptPayload()), {
  required: true,
  extractorSha256: artifacts.extractorSha256,
  probeId: PROBE_ID,
  probeVersion: PROBE_VERSION,
  sourceManifestSha256: artifacts.sourceManifestSha256,
  liveEzbrSha256: "a".repeat(64),
});

const issuedEvidence = canaryEvidence();
issuedEvidence.probe_function.debug_ip = LEAK_MARKER;
issuedEvidence.requests.matrix.ipv4.baseline.raw_ip = LEAK_MARKER;
issuedEvidence.metadata_integrity.secret_value = LEAK_MARKER;
issuedEvidence.cleanup.raw_address = LEAK_MARKER;
const issued = issueClientIpDeployReceipt({
  deploySha: SHA,
  projectRef: PROJECT_REF,
  extractorSource,
  probeTemplateSource,
  canaryEvidence: issuedEvidence,
  receiptHmacKey: HMAC_KEY,
  now: NOW,
});
assert.equal(issued.payload.receipt_version, 2);
assert.equal(issued.payload.target_source_sha, SHA);
assert.equal(issued.payload.source_binding.probe_template_sha256, artifacts.templateSha256);
assert.equal(
  issued.payload.source_binding.rendered_wrapper_sha256,
  artifacts.renderedWrapperSha256,
);
assert.equal(JSON.stringify(issued.payload).includes(LEAK_MARKER), false);
assert.equal(
  Buffer.from(issued.token.split(".")[0], "base64url").toString("utf8")
    .includes(LEAK_MARKER),
  false,
);

assert.equal(clientIpProbeTemplateViolations(probeTemplateSource).length, 0);
for (
  const [label, unsafe] of [
    ["intake secret", `${probeTemplateSource}\nLEAD_INTAKE_RATE_LIMIT_SECRET`],
    ["service role", `${probeTemplateSource}\nSUPABASE_SERVICE_ROLE_KEY`],
    ["environment dump", `${probeTemplateSource}\nDeno.env.toObject()`],
    ["extra env read", `${probeTemplateSource}\nDeno.env.get("EXTRA_SECRET")`],
    ["dynamic env read", `${probeTemplateSource}\nDeno.env.get(variableName)`],
    ["outbound fetch", `${probeTemplateSource}\nfetch("https://example.com")`],
    ["runtime log", `${probeTemplateSource}\nconsole.log("probe")`],
  ]
) {
  assert.notEqual(
    clientIpProbeTemplateViolations(unsafe).length,
    0,
    `${label} evaded the template scanner`,
  );
}
assert.deepEqual(
  auditClientIpProbeContract({
    trackedSources: new Map([
      [CLIENT_IP_PROBE_TEMPLATE_PATH, probeTemplateSource],
      ["scripts/render-client-ip-probe.mjs", read("scripts/render-client-ip-probe.mjs")],
      ["scripts/verify-client-ip-deploy-receipt.mjs", read("scripts/verify-client-ip-deploy-receipt.mjs")],
    ]),
    templateSource: probeTemplateSource,
  }),
  [],
);
for (
  const fixture of [
    ["scripts/unsafe.mjs", "client-ip-probe\nSUPABASE_ACCESS_TOKEN"],
    ["scripts/unsafe.mjs", "client-ip-probe\nLEAD_INTAKE_RATE_LIMIT_SECRET"],
    ["scripts/unsafe.mjs", "client-ip-probe\nSUPABASE_SERVICE_ROLE_KEY"],
    ["scripts/unsafe.mjs", "client-ip-probe\nDeno.env.toObject()"],
    ["scripts/unsafe.mjs", "client-ip-probe\nsupabase functions deploy"],
    ["scripts/unsafe.mjs", "client-ip-probe\nsupabase functions delete"],
    ["scripts/unsafe.bash", 'client_ip_probe\n["supabase","functions","deploy"]'],
    ["scripts/unsafe.mjs", "client-ip-probe\nnode:child_process"],
  ]
) {
  assert.notEqual(
    probeToolViolation(...fixture),
    null,
    `unsafe probe fixture evaded scanner: ${fixture[1]}`,
  );
}

const alternateArtifacts = expectedClientIpProbeArtifacts({
  deploySha: OTHER_SHA,
  templateSource: probeTemplateSource,
  extractorSource,
});
assert.notEqual(artifacts.renderedWrapperSha256, alternateArtifacts.renderedWrapperSha256);
assert.notEqual(artifacts.sourceManifestSha256, alternateArtifacts.sourceManifestSha256);
assert.equal(artifacts.renderedWrapper.includes(SHA), true);
assert.equal(artifacts.renderedWrapper.includes("__TARGET_SOURCE_SHA__"), false);

const clientIpCliTemp = fs.mkdtempSync(
  path.join(os.tmpdir(), "ut-client-ip-receipt-v2-"),
);
try {
  const renderRoot = path.join(clientIpCliTemp, "rendered");
  fs.mkdirSync(renderRoot, { mode: 0o700 });
  const renderResult = spawnSync(
    process.execPath,
    [
      "scripts/render-client-ip-probe.mjs",
      "--deploy-sha",
      SHA,
      "--render-root",
      renderRoot,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(renderResult.status, 0, renderResult.stderr);
  const renderedWrapperPath = path.join(
    renderRoot,
    "supabase/functions/client-ip-probe/index.ts",
  );
  const renderedExtractorPath = path.join(
    renderRoot,
    "supabase/functions/_shared/client-ip.ts",
  );
  assert.equal(fs.readFileSync(renderedWrapperPath, "utf8"), artifacts.renderedWrapper);
  assert.equal(fs.readFileSync(renderedExtractorPath, "utf8"), extractorSource);
  assert.equal(fs.statSync(renderedWrapperPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(renderedExtractorPath).mode & 0o777, 0o600);
  const renderedTypecheck = spawnSync("deno", ["check", renderedWrapperPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(renderedTypecheck.status, 0, renderedTypecheck.stderr);
  const overwriteAttempt = spawnSync(
    process.execPath,
    [
      "scripts/render-client-ip-probe.mjs",
      "--deploy-sha",
      SHA,
      "--render-root",
      renderRoot,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(overwriteAttempt.status, 0);
  const verifyDownload = spawnSync(
    process.execPath,
    [
      "scripts/render-client-ip-probe.mjs",
      "--deploy-sha",
      SHA,
      "--verify-download-root",
      renderRoot,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(verifyDownload.status, 0, verifyDownload.stderr);
  assert.equal(
    JSON.parse(verifyDownload.stdout).downloaded_live_source_manifest_sha256,
    artifacts.sourceManifestSha256,
  );
  fs.appendFileSync(renderedWrapperPath, "// drift\n");
  const driftedDownload = spawnSync(
    process.execPath,
    [
      "scripts/render-client-ip-probe.mjs",
      "--deploy-sha",
      SHA,
      "--verify-download-root",
      renderRoot,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(driftedDownload.status, 0);

  const dynamicNow = Date.now();
  const evidence = canaryEvidence({
    exclusive_window_started_at: new Date(dynamicNow - 5_000).toISOString(),
    canary_checked_at: new Date(dynamicNow - 4_000).toISOString(),
    delete_rechecked_at: new Date(dynamicNow - 3_000).toISOString(),
    probe_deleted_at: new Date(dynamicNow - 2_500).toISOString(),
    exclusive_window_ended_at: new Date(dynamicNow - 2_000).toISOString(),
  });
  const canaryPath = path.join(clientIpCliTemp, "canary.json");
  const tokenPath = path.join(clientIpCliTemp, "receipt.token");
  fs.writeFileSync(canaryPath, JSON.stringify(evidence), { mode: 0o600 });
  const cliEnv = {
    PATH: process.env.PATH,
    FUNCTION_NAME: "handle-lead",
    DEPLOY_SHA: SHA,
    SUPABASE_PROJECT_REF: PROJECT_REF,
    CLIENT_IP_CANARY_EVIDENCE_PATH: canaryPath,
    CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY: HMAC_KEY,
  };
  const issueResult = spawnSync(
    process.execPath,
    ["scripts/verify-client-ip-deploy-receipt.mjs", "--issue", tokenPath],
    { cwd: root, env: cliEnv, encoding: "utf8" },
  );
  assert.equal(issueResult.status, 0, issueResult.stderr);
  const cliToken = fs.readFileSync(tokenPath, "utf8").trim();
  assert.match(cliToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(fs.statSync(tokenPath).mode & 0o777, 0o600);
  assert.equal(issueResult.stdout.includes(cliToken), false);
  assert.equal(issueResult.stdout.includes(HMAC_KEY), false);
  const verifyResult = spawnSync(
    process.execPath,
    ["scripts/verify-client-ip-deploy-receipt.mjs"],
    {
      cwd: root,
      env: { ...cliEnv, CLIENT_IP_DEPLOY_RECEIPT_TOKEN: cliToken },
      encoding: "utf8",
    },
  );
  assert.equal(verifyResult.status, 0, verifyResult.stderr);
  const existingOutputResult = spawnSync(
    process.execPath,
    ["scripts/verify-client-ip-deploy-receipt.mjs", "--issue", tokenPath],
    { cwd: root, env: cliEnv, encoding: "utf8" },
  );
  assert.notEqual(existingOutputResult.status, 0);
  assert.equal(fs.readFileSync(tokenPath, "utf8").trim(), cliToken);
} finally {
  fs.rmSync(clientIpCliTemp, { recursive: true, force: true });
}

assert.equal(
  verifyClientIpDeployReceipt({
    functionName: "lead-crm",
    deploySha: SHA,
    projectRef: PROJECT_REF,
    extractorSource,
    probeTemplateSource,
    receiptToken: signClientIpDeployReceipt(receiptPayload(), HMAC_KEY),
    receiptHmacKey: HMAC_KEY,
    now: NOW,
  }).required,
  true,
);
assert.deepEqual(
  verifyClientIpDeployReceipt({ functionName: "weekly-report" }),
  { required: false },
);

const rejectionCases = [
  ["receipt v1", (p) => p.receipt_version = 1, /unsupported.*version/],
  ["extra top-level raw field", (p) => p.raw_ip = LEAK_MARKER, /receipt schema/],
  ["missing target SHA", (p) => delete p.target_source_sha, /receipt schema/],
  ["missing live bundle", (p) => delete p.live_ezbr_bundle_sha256, /receipt schema/],
  ["wrong target SHA", (p) => p.target_source_sha = OTHER_SHA, /target source SHA/],
  ["missing downloaded manifest", (p) => delete p.source_binding.downloaded_live_source_manifest_sha256, /source binding schema/],
  ["extractor drift", (p) => p.source_binding.extractor_sha256 = "d".repeat(64), /extractor_sha256/],
  ["template drift", (p) => p.source_binding.probe_template_sha256 = "d".repeat(64), /probe_template_sha256/],
  ["wrapper drift", (p) => p.source_binding.rendered_wrapper_sha256 = "d".repeat(64), /rendered_wrapper_sha256/],
  ["expected manifest drift", (p) => p.source_binding.expected_source_manifest_sha256 = "d".repeat(64), /expected_source_manifest/],
  ["downloaded manifest drift", (p) => p.source_binding.downloaded_live_source_manifest_sha256 = "d".repeat(64), /downloaded_live_source/],
  ["invalid live ezbr", (p) => p.live_ezbr_bundle_sha256 = "not-a-digest", /ezbr bundle/],
  ["ezbr metadata mismatch", (p) => p.probe_function.ezbr_sha256 = "d".repeat(64), /differs from probe metadata/],
  ["missing probe ID", (p) => p.probe_function.id = "", /function ID/],
  ["omitted probe ID", (p) => delete p.probe_function.id, /probe function schema/],
  ["bad probe version", (p) => p.probe_function.version = 0, /function ID/],
  ["DENO deployment mismatch", (p) => p.probe_function.deno_deployment_id = "wrong", /DENO_DEPLOYMENT_ID/],
  ["wrong auth scheme", (p) => p.auth.scheme = "bearer", /worker-token HMAC/],
  ["missing auth context", (p) => delete p.auth.context, /probe auth schema/],
  ["wrong auth context", (p) => p.auth.context = "lead-intake-v1", /worker-token HMAC/],
  ["wrong auth secret", (p) => p.auth.key_secret_name = "OTHER", /worker-token HMAC/],
  ["extra source env read", (p) => p.auth.source_env_reads.push("EXTRA"), /worker-token HMAC/],
  ["intake secret read", (p) => p.auth.intake_secret_read_by_probe_source = true, /no-intake-secret/],
  ["service role read", (p) => p.auth.service_role_read_by_probe_source = true, /no-intake-secret/],
  ["env dump used", (p) => p.auth.env_to_object_used_by_probe_source = true, /no-intake-secret/],
  ["authenticated count wrong", (p) => p.requests.authenticated_request_count = 7, /exactly 8/],
  ["negative count hidden", (p) => p.requests.negative_auth_request_count = 0, /2 negative-auth/],
  ["total count overloaded", (p) => p.requests.total_request_count = 8, /10 total/],
  ["missing total count", (p) => delete p.requests.total_request_count, /request evidence schema/],
  ["missing IPv6 matrix", (p) => delete p.requests.matrix.ipv6, /request matrix schema/],
  ["IPv4 skipped", (p) => p.requests.matrix.ipv4.path = "not-run", /ipv4 path/],
  ["IPv6 skipped", (p) => p.requests.matrix.ipv6.path = "runner-ipv6-unavailable", /ipv6 path/],
  ["baseline source wrong", (p) => p.requests.matrix.ipv4.baseline.canonical_source = "x-real-ip", /ipv4 baseline/],
  ["forged CF weak", (p) => p.requests.matrix.ipv6.forged_cf_connecting_ip.outcome = "accepted", /ipv6 forged_cf/],
  ["forged XFF changed", (p) => p.requests.matrix.ipv4.forged_x_forwarded_for.outcome = "changed", /ipv4 forged_x/],
  ["missing signature accepted", (p) => p.requests.negative_auth.missing_signature.status = 200, /generic 401/],
  ["bad signature leaked metadata", (p) => p.requests.negative_auth.invalid_signature.metadata_exposed = true, /generic 401/],
  ["missing invalid signature case", (p) => delete p.requests.negative_auth.invalid_signature, /negative auth evidence schema/],
  ["extra raw matrix field", (p) => p.requests.matrix.ipv4.raw_ip = LEAK_MARKER, /ipv4 schema/],
  ["function metadata changed", (p) => p.metadata_integrity.functions_post_sha256 = "d".repeat(64), /function metadata equality/],
  ["function equality flag false", (p) => p.metadata_integrity.functions_metadata_equal = false, /function metadata equality/],
  ["secret metadata changed", (p) => p.metadata_integrity.secrets_post_sha256 = "d".repeat(64), /secret metadata equality/],
  ["secret equality flag false", (p) => p.metadata_integrity.secrets_metadata_equal = false, /secret metadata equality/],
  ["missing secret post digest", (p) => delete p.metadata_integrity.secrets_post_sha256, /metadata integrity schema/],
  ["nonexclusive window", (p) => p.mutation_control.exclusive_mutation_window = false, /exclusive slug-only/],
  ["broad delete", (p) => p.mutation_control.delete_scope = "id-and-slug", /exclusive slug-only/],
  ["probe secret changed", (p) => p.mutation_control.probe_secret_mutation_count = 1, /zero probe-secret/],
  ["delete before canary", (p) => p.mutation_control.delete_rechecked_at = "2026-08-09T18:14:00.000Z", /ordering/],
  ["delete before tuple recheck", (p) => p.mutation_control.probe_deleted_at = "2026-08-09T18:16:59.000Z", /ordering/],
  ["overlong exclusive window", (p) => p.mutation_control.exclusive_window_started_at = "2026-08-09T17:00:00.000Z", /ordering/],
  ["stale tuple at deletion", (p) => {
    p.mutation_control.probe_deleted_at = "2026-08-09T18:18:01.000Z";
    p.mutation_control.exclusive_window_ended_at = "2026-08-09T18:18:02.000Z";
  }, /ordering/],
  ["tuple ID changed", (p) => p.mutation_control.delete_recheck.id = "22222222-2222-4222-8222-222222222222", /delete tuple/],
  ["tuple version changed", (p) => p.mutation_control.delete_recheck.version = 8, /delete tuple/],
  ["tuple status changed", (p) => p.mutation_control.delete_recheck.status = "INACTIVE", /delete tuple/],
  ["tuple bundle changed", (p) => p.mutation_control.delete_recheck.live_ezbr_bundle_sha256 = "d".repeat(64), /delete tuple/],
  ["missing delete tuple", (p) => delete p.mutation_control.delete_recheck, /mutation control schema/],
  ["unsanitized evidence", (p) => p.evidence_policy.sanitized = false, /raw-free sanitized/],
  ["operator raw artifact retained", (p) => p.evidence_policy.raw_probe_operator_artifacts_retained = true, /raw-free sanitized/],
  ["raw receipt value", (p) => p.evidence_policy.raw_values_in_receipt = true, /raw-free sanitized/],
  ["secret receipt value", (p) => p.evidence_policy.secret_values_in_receipt = true, /raw-free sanitized/],
  ["missing sanitation flag", (p) => delete p.evidence_policy.sanitized, /evidence policy schema/],
  ["probe not deleted", (p) => p.cleanup.probe_function_deleted = false, /probe deletion/],
  ["ephemeral compute retained", (p) => p.cleanup.ephemeral_compute_destroyed = false, /compute destruction/],
  ["missing compute cleanup", (p) => delete p.cleanup.ephemeral_compute_destroyed, /cleanup schema/],
  ["stale canary", (p) => {
    p.canary_checked_at = "2026-08-09T16:00:00.000Z";
    p.mutation_control.exclusive_window_started_at = "2026-08-09T15:59:00.000Z";
  }, /stale or future-dated/],
  ["overlong receipt", (p) => p.expires_at = "2026-08-09T19:20:01.000Z", /no more than one hour/],
  ["canary after receipt", (p) => p.canary_checked_at = "2026-08-09T18:28:00.000Z", /issued before its canary|ordering/],
];
for (const [label, mutate, pattern] of rejectionCases) {
  rejectMutation(label, mutate, pattern);
}

const signed = signClientIpDeployReceipt(receiptPayload(), HMAC_KEY);
const [signedPayload, signedSignature] = signed.split(".");
const tampered = `${signedPayload}.${
  signedSignature.startsWith("A") ? "B" : "A"
}${signedSignature.slice(1)}`;
assert.throws(
  () => verifyClientIpDeployReceipt({
    functionName: "handle-lead",
    deploySha: SHA,
    projectRef: PROJECT_REF,
    extractorSource,
    probeTemplateSource,
    receiptToken: tampered,
    receiptHmacKey: HMAC_KEY,
    now: NOW,
  }),
  /signature is invalid/,
);

function parseWorkflow(relative) {
  const parser = [
    "require 'yaml'",
    "require 'json'",
    "doc = YAML.safe_load(File.read(ARGV.fetch(0)), aliases: true)",
    "doc['on'] = doc.delete(true) if doc.key?(true)",
    "STDOUT.write(JSON.generate(doc))",
  ].join("; ");
  const result = spawnSync("ruby", ["-e", parser, path.join(root, relative)], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const workflow = parseWorkflow(".github/workflows/deploy-edge-function.yml");
const steps = workflow.jobs.deploy.steps;
const mintAt = steps.findIndex((step) =>
  step.name === "Mint live client-IP deployment evidence"
);
const receiptAt = steps.findIndex((step) =>
  step.name === "Enforce fresh signed final-extractor client-IP canary receipt"
);
const deployAt = steps.findIndex((step) => step.name?.startsWith("Deploy "));
assert(
  mintAt === -1 && receiptAt > 0 && deployAt > receiptAt,
  "only the pre-issued client-IP receipt gate may precede deploy",
);
for (const step of steps.slice(0, deployAt)) {
  const source = JSON.stringify(step);
  for (
    const prohibited of [
      /client-ip-probe/i,
      /issueClientIpDeployReceipt/,
      /LEAD_INTAKE_RATE_LIMIT_SECRET/,
      /lead-intake-v1/,
      /supabase\s+functions\s+(?:deploy|delete)/,
    ]
  ) {
    assert.doesNotMatch(
      source,
      prohibited,
      `pre-deploy step ${step.name ?? "unnamed"} contains probe behavior`,
    );
  }
}
const receiptStep = steps[receiptAt];
assert.equal(receiptStep.if, undefined);
assert.equal(receiptStep["continue-on-error"], undefined);
assert.equal(receiptStep.env.FUNCTION_NAME, "${{ inputs.function }}");
assert.equal(receiptStep.env.DEPLOY_SHA, "${{ github.sha }}");
assert.equal(receiptStep.env.SUPABASE_PROJECT_REF, PROJECT_REF);
assert.equal(
  receiptStep.env.CLIENT_IP_DEPLOY_RECEIPT_TOKEN,
  "${{ secrets.CLIENT_IP_DEPLOY_RECEIPT_TOKEN }}",
);
assert.equal(
  receiptStep.env.CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY,
  "${{ secrets.CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY }}",
);
assert.equal(
  receiptStep.run.trim(),
  "node scripts/verify-client-ip-deploy-receipt.mjs",
);

const verifier = read("scripts/verify-client-ip-deploy-receipt.mjs");
assert.equal(verifier.includes("probe_source_sha"), false);
assert.match(verifier, /receipt_version:\s*2/);
assert.match(verifier, /downloaded_live_source_manifest_sha256/);
assert.match(verifier, /live_ezbr_bundle_sha256/);
assert.match(verifier, /authenticated_request_count !== 8/);
assert.match(verifier, /negative_auth_request_count !== 2/);
assert.match(verifier, /total_request_count !== 10/);
assert.match(verifier, /probe_secret_mutation_count !== 0/);
assert.equal(
  fs.existsSync(path.join(root, "scripts/issue-client-ip-deploy-receipt.mjs")),
  false,
  "protected deploys must not include automatic public probe tooling",
);
const deployWorkflowSource = read(".github/workflows/deploy-edge-function.yml");
for (
  const prohibitedText of [
    "issue-client-ip-deploy-receipt.mjs",
    "Mint live client-IP deployment evidence",
    "runner-ipv6-unavailable",
  ]
) {
  assert.equal(
    deployWorkflowSource.includes(prohibitedText),
    false,
    `protected workflow contains prohibited client-IP path: ${prohibitedText}`,
  );
}

const directProtectedDeploy =
  /supabase(?:\s|\\\s*)+functions(?:\s|\\\s*)+deploy(?:\s|\\\s*)+["']?(?:handle-lead|lead-crm)["']?(?=\s|\\|$)/;
for (
  const fixture of [
    "supabase functions deploy handle-lead",
    'supabase functions deploy "handle-lead"',
    "supabase functions deploy 'lead-crm'",
    ["supabase", "functions deploy handle-lead"].join("\\\n  "),
  ]
) {
  assert.match(fixture, directProtectedDeploy);
}
for (const relative of trackedTextPaths) {
  assert.doesNotMatch(
    trackedTextSources.get(relative),
    directProtectedDeploy,
    `${relative} documents a direct protected-function deploy bypass`,
  );
}
assert.equal(
  verifier.includes("data/UTAH-SUPABASE-CLIENT-IP-HEADER-RECEIPT.md"),
  false,
  "editable Markdown still authorizes client-IP rollout",
);
const historical = read("data/UTAH-SUPABASE-CLIENT-IP-HEADER-RECEIPT.md");
assert.match(historical, /Status: \*\*INVALID — historical observation only/);
assert.match(historical, /does not authorize\s+deployment/);

const deployRunbook = read("supabase/functions/handle-lead/DEPLOY.md");
for (
  const requiredText of [
    "receipt v2",
    "render-client-ip-probe.mjs",
    "target_source_sha",
    "downloaded_live_source_manifest_sha256",
    "live_ezbr_bundle_sha256",
    "DENO_DEPLOYMENT_ID",
    "client-ip-probe-v1",
    "8 authenticated",
    "2 negative-auth",
    "10 total",
    "exclusive mutation window",
    "slug-only",
    "ephemeral compute",
    "verify-client-ip-deploy-receipt.mjs --issue",
    "CLIENT_IP_DEPLOY_RECEIPT_TOKEN",
    "CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY",
    "Issue a new token for each protected SHA",
    "rotate the HMAC key",
  ]
) {
  assert(
    deployRunbook.includes(requiredText),
    `client-IP runbook omits ${requiredText}`,
  );
}
assert.equal(deployRunbook.includes("probe_source_sha"), false);

const compliance = parseWorkflow(".github/workflows/compliance-gate.yml");
for (
  const requiredPath of [
    "scripts/verify-client-ip-deploy-receipt.mjs",
    "scripts/render-client-ip-probe.mjs",
    "scripts/audit-client-ip-probe-contract.mjs",
    "supabase/probe-templates/**",
  ]
) {
  assert(
    compliance.on.pull_request.paths.includes(requiredPath),
    `compliance pull-request filter omits ${requiredPath}`,
  );
}
const dashboardSteps = compliance.jobs["dashboard-security"].steps;
assert(
  dashboardSteps.some((step) =>
    step.run?.trim() === "npm run audit:client-ip-probe"
  ),
  "compliance gate does not run the probe source/mutation scanner",
);
assert(
  dashboardSteps.some((step) =>
    step.run?.trim() === "node scripts/test-client-ip-deploy-receipt.mjs"
  ),
  "compliance gate does not run the deployment receipt contract",
);

console.log(
  "Client-IP receipt v2 passed: deterministic target/template/live-source binding, live ezbr/runtime identity, 8+2 request matrix, metadata restoration, exact slug-only cleanup, and raw-free evidence.",
);
