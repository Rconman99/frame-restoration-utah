#!/usr/bin/env node

// The existing blocking dashboard-security CI step invokes this file. Import
// the sibling owner-notification gate so both production receipt systems stay
// under one mandatory deploy-evidence test entrypoint.
await import("./test-owner-notification-deploy-receipt.mjs");

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
    if (contents.includes(0)) continue;
    sources.set(relative, contents.toString("utf8"));
  }
  return sources;
}
const trackedTextSources = trackedTextFiles();
const trackedTextPaths = [...trackedTextSources.keys()];
const extractorSource = read("supabase/functions/_shared/client-ip.ts");
const extractorDigest = crypto.createHash("sha256")
  .update(extractorSource)
  .digest("hex");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const PROJECT_REF = "hdcflshhomzildwqlmwh";
const HMAC_KEY = "test-client-ip-receipt-hmac-key-at-least-32-bytes";
const NOW = new Date("2026-08-09T18:30:00.000Z");
const LEAK_MARKER = "raw-ip-or-secret-must-not-enter-token";

function payload(overrides = {}) {
  return {
    receipt_version: 1,
    project_ref: PROJECT_REF,
    source_sha: SHA,
    probe_source_sha: SHA,
    extractor_sha256: extractorDigest,
    probe_bundle_sha256: "a".repeat(64),
    probe_function: {
      slug: "client-ip-probe",
      version: 7,
      status: "ACTIVE_AT_CANARY",
    },
    canary_checked_at: "2026-08-09T18:15:00.000Z",
    issued_at: "2026-08-09T18:20:00.000Z",
    expires_at: "2026-08-09T19:20:00.000Z",
    canary_results: {
      ipv4_path: "passed",
      ipv6_path: "passed",
      canonical_source: "cf-connecting-ip",
      forged_cf_connecting_ip: "rejected-or-overwritten",
      forged_x_real_ip: "selected-fingerprint-unchanged",
      forged_x_forwarded_for: "selected-fingerprint-unchanged",
      derived_key: "64-lowercase-hex-raw-free",
      raw_values_retained: false,
    },
    cleanup: {
      probe_function_deleted: true,
      probe_secrets_deleted: true,
    },
    ...overrides,
  };
}

function verify(overrides = {}) {
  const signedPayload = payload(overrides.payload);
  return verifyClientIpDeployReceipt({
    functionName: "handle-lead",
    deploySha: SHA,
    projectRef: PROJECT_REF,
    extractorSource,
    receiptToken: signClientIpDeployReceipt(signedPayload, HMAC_KEY),
    receiptHmacKey: HMAC_KEY,
    now: NOW,
    ...overrides.arguments,
  });
}

assert.deepEqual(verify(), {
  required: true,
  extractorSha256: extractorDigest,
  probeVersion: 7,
});
const issued = issueClientIpDeployReceipt({
  deploySha: SHA,
  projectRef: PROJECT_REF,
  extractorSource,
  canaryEvidence: {
    probe_source_sha: SHA,
    probe_bundle_sha256: "a".repeat(64),
    probe_function: { ...payload().probe_function, debug_ip: LEAK_MARKER },
    canary_checked_at: payload().canary_checked_at,
    canary_results: { ...payload().canary_results, raw_ipv4: LEAK_MARKER },
    cleanup: { ...payload().cleanup, probe_secret: LEAK_MARKER },
    raw_address: LEAK_MARKER,
  },
  receiptHmacKey: HMAC_KEY,
  now: NOW,
});
assert.equal(issued.payload.extractor_sha256, extractorDigest);
assert.equal(typeof issued.token, "string");
assert.equal(JSON.stringify(issued.payload).includes(LEAK_MARKER), false);
assert.equal(
  Buffer.from(issued.token.split(".")[0], "base64url").toString("utf8")
    .includes(LEAK_MARKER),
  false,
);

const clientIpCliTemp = fs.mkdtempSync(
  path.join(os.tmpdir(), "ut-client-ip-receipt-"),
);
try {
  const canaryPath = path.join(clientIpCliTemp, "canary.json");
  const tokenPath = path.join(clientIpCliTemp, "receipt.token");
  fs.writeFileSync(
    canaryPath,
    JSON.stringify({
      probe_source_sha: SHA,
      probe_bundle_sha256: "a".repeat(64),
      probe_function: payload().probe_function,
      canary_checked_at: new Date(Date.now() - 1_000).toISOString(),
      canary_results: payload().canary_results,
      cleanup: payload().cleanup,
    }),
  );
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
  assert.equal(issueResult.stderr.includes(cliToken), false);
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
    receiptToken: signClientIpDeployReceipt(payload(), HMAC_KEY),
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
  [
    "wrong project",
    { payload: { project_ref: "wrong" } },
    /project does not match/,
  ],
  [
    "wrong deploy SHA",
    { payload: { source_sha: "f".repeat(40) } },
    /deploy\/probe source SHA/,
  ],
  [
    "wrong probe SHA",
    { payload: { probe_source_sha: "f".repeat(40) } },
    /deploy\/probe source SHA/,
  ],
  [
    "extractor drift",
    { payload: { extractor_sha256: "b".repeat(64) } },
    /current shared extractor/,
  ],
  [
    "bundle missing",
    { payload: { probe_bundle_sha256: "not-a-digest" } },
    /probe bundle SHA-256/,
  ],
  ["probe version missing", {
    payload: {
      probe_function: {
        slug: "client-ip-probe",
        version: 0,
        status: "ACTIVE_AT_CANARY",
      },
    },
  }, /function\/version/],
  ["stale", {
    payload: {
      canary_checked_at: "2026-08-09T16:00:00.000Z",
      issued_at: "2026-08-09T16:10:00.000Z",
      expires_at: "2026-08-09T17:10:00.000Z",
    },
  }, /stale or future-dated/],
  ["overlong", {
    payload: {
      issued_at: "2026-08-09T18:00:00.000Z",
      expires_at: "2026-08-09T19:00:01.000Z",
    },
  }, /no more than one hour/],
  ["canary after receipt", {
    payload: {
      canary_checked_at: "2026-08-09T18:28:00.000Z",
      issued_at: "2026-08-09T18:20:00.000Z",
    },
  }, /issued before its canary/],
  ["IPv6 not tested", {
    payload: {
      canary_results: { ...payload().canary_results, ipv6_path: "not-run" },
    },
  }, /ipv6_path/],
  ["IPv6 runner unavailable", {
    payload: {
      canary_results: {
        ...payload().canary_results,
        ipv6_path: "runner-ipv6-unavailable",
      },
    },
  }, /ipv6_path/],
  ["forged XFF changed identity", {
    payload: {
      canary_results: {
        ...payload().canary_results,
        forged_x_forwarded_for: "changed",
      },
    },
  }, /forged_x_forwarded_for/],
  ["raw values retained", {
    payload: {
      canary_results: {
        ...payload().canary_results,
        raw_values_retained: true,
      },
    },
  }, /raw_values_retained/],
  ["cleanup missing", {
    payload: {
      cleanup: { probe_function_deleted: false, probe_secrets_deleted: true },
    },
  }, /cleanup evidence/],
];
for (const [label, options, pattern] of rejectionCases) {
  assert.throws(() => verify(options), pattern, label);
}

const signed = signClientIpDeployReceipt(payload(), HMAC_KEY);
const tampered = `${signed.slice(0, -1)}${signed.endsWith("A") ? "B" : "A"}`;
assert.throws(
  () => verify({ arguments: { receiptToken: tampered } }),
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
      `pre-deploy step ${
        step.name ?? "unnamed"
      } contains client-IP probe behavior`,
    );
  }
  assert.equal(
    source.includes("CLIENT_IP_DEPLOY_RECEIPT_TOKEN") &&
      source.includes("GITHUB_ENV"),
    false,
    `pre-deploy step ${step.name ?? "unnamed"} mints the client-IP token in CI`,
  );
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
    `protected deploy workflow contains prohibited client-IP path: ${prohibitedText}`,
  );
}
assert.equal(
  verifier.includes('results?.ipv6_path !== "passed"'),
  true,
  "client-IP verifier must require successful IPv6 evidence",
);
assert.equal(
  verifier.includes("runner-ipv6-unavailable"),
  false,
  "client-IP verifier must not authorize unavailable IPv6 evidence",
);
function probeToolViolation(source) {
  const hasProbeMarker = source.includes("client-ip-probe") ||
    source.includes("lead-intake-v1");
  if (!hasProbeMarker) return null;
  for (
    const prohibitedText of [
      "SUPABASE_ACCESS_TOKEN",
      "LEAD_INTAKE_RATE_LIMIT_SECRET",
      "GITHUB_ENV",
      "--no-verify-jwt",
    ]
  ) {
    if (source.includes(prohibitedText)) return prohibitedText;
  }
  if (/supabase\s+functions\s+(?:deploy|delete)/.test(source)) {
    return "live function mutation";
  }
  return null;
}

const scriptToolPaths = trackedTextPaths
  .filter((relative) => relative.startsWith("scripts/"))
  .filter((relative) =>
    relative !== "scripts/test-client-ip-deploy-receipt.mjs"
  );
for (const toolPath of scriptToolPaths) {
  assert.equal(
    probeToolViolation(trackedTextSources.get(toolPath)),
    null,
    `${toolPath} combines client-IP probe logic with live capability`,
  );
}
const unsafeProbeFixtures = [
  ["client-ip-probe", "LEAD_INTAKE_RATE_LIMIT_SECRET"].join("\n"),
  ["lead-intake-v1", "SUPABASE_ACCESS_TOKEN"].join("\n"),
  ["client-ip-probe", "supabase", "functions", "deploy"].join(" "),
];
for (const fixture of unsafeProbeFixtures) {
  assert.notEqual(
    probeToolViolation(fixture),
    null,
    "renamed or nested probe tooling evades the live-capability scanner",
  );
}
const directProtectedDeploy =
  /supabase\s+functions\s+deploy\s+["']?(?:handle-lead|lead-crm)["']?(?=\s|\\|$)/;
for (
  const fixture of [
    ["supabase", "functions", "deploy", "handle-lead"].join(" "),
    ["supabase", "functions", "deploy", '"handle-lead"'].join(" "),
    ["supabase", "functions", "deploy", "'lead-crm'"].join(" "),
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

const compliance = parseWorkflow(".github/workflows/compliance-gate.yml");
assert(
  compliance.on.pull_request.paths.includes(
    "scripts/verify-client-ip-deploy-receipt.mjs",
  ),
);
assert(
  compliance.on.pull_request.paths.includes("scripts/**"),
  "client-IP tooling additions do not trigger the blocking compliance gate",
);
const dashboardSteps = compliance.jobs["dashboard-security"].steps;
assert(
  dashboardSteps.some((step) =>
    step.run?.trim() === "node scripts/test-client-ip-deploy-receipt.mjs"
  ),
  "compliance gate does not run the combined deployment receipt contract",
);

console.log(
  "Client-IP production receipt gate passed: short-lived signature, exact source/probe binding, canary results, cleanup, and parsed workflow.",
);
