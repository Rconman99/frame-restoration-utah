#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  HANDLER_SMS_PAUSE_SECRETS,
  issueOwnerNotificationDeployReceipt,
  NOTIFICATION_FUNCTIONS,
  OWNER_NOTIFICATION_PHASES,
  REQUIRED_NOTIFICATION_MIGRATIONS,
  signOwnerNotificationDeployReceipt,
  verifyOwnerNotificationDeployReceipt,
} from "./verify-owner-notification-deploy-receipt.mjs";
import {
  runOwnerNotificationCanaries,
  signedWebhookCanary,
} from "./run-owner-notification-deploy-canaries.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const PROJECT_REF = "hdcflshhomzildwqlmwh";
const HMAC_KEY = [
  "test",
  "owner",
  "notification",
  "receipt",
  "key",
  "at-least-32-bytes",
].join("-");
const NOW = new Date("2026-08-09T17:30:00.000Z");

const migrations = REQUIRED_NOTIFICATION_MIGRATIONS.map((version) => ({
  version,
}));
const secretNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "UTAH_LEAD_RESEND_API_KEY",
  "UTAH_LEAD_RESEND_FROM",
  "LEAD_NOTIFICATION_PRIMARY_EMAIL",
  "LEAD_NOTIFICATION_BACKUP_EMAIL",
  "LEAD_NOTIFICATION_WORKER_TOKEN",
  "RESEND_WEBHOOK_SECRET",
  "LEAD_INTAKE_RATE_LIMIT_SECRET",
];
const secrets = secretNames.map((name, index) => ({
  name,
  value: `digest-${index}`,
  updated_at: `2026-08-09T16:${String(index).padStart(2, "0")}:00.000Z`,
}));
const functions = NOTIFICATION_FUNCTIONS.map((slug, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`,
  slug,
  name: slug,
  status: "ACTIVE",
  version: index + 10,
  updated_at: `2026-08-09T16:0${index}:00.000Z`,
}));

function deploymentId(slug) {
  const metadata = functions.find((entry) => entry.slug === slug);
  return `${PROJECT_REF}_${metadata.id}_${metadata.version}`;
}

function functionSnapshot(overrides = {}) {
  return Object.fromEntries(functions.map((entry) => [entry.slug, {
    id: entry.id,
    slug: entry.slug,
    status: entry.status,
    version: entry.version,
    updated_at: entry.updated_at,
    ...overrides[entry.slug],
  }]));
}

function secretSnapshot() {
  return Object.fromEntries(secrets.map((entry) => [entry.name, {
    digest: entry.value,
    updated_at: entry.updated_at,
  }]));
}

function payload(targetFunction = "lead-notification-worker", overrides = {}) {
  return {
    receipt_version: 1,
    project_ref: PROJECT_REF,
    source_sha: SHA,
    target_function: targetFunction,
    issued_at: "2026-08-09T17:00:00.000Z",
    expires_at: "2026-08-09T18:00:00.000Z",
    phase: targetFunction === "handle-lead"
      ? OWNER_NOTIFICATION_PHASES.handler
      : OWNER_NOTIFICATION_PHASES.infrastructure,
    live_migration_versions: [...REQUIRED_NOTIFICATION_MIGRATIONS],
    live_secret_metadata: secretSnapshot(),
    live_function_metadata: functionSnapshot(),
    verified_canary_deployments: targetFunction === "handle-lead"
      ? {
        "lead-notification-worker": deploymentId(
          "lead-notification-worker",
        ),
        "resend-webhook": deploymentId("resend-webhook"),
      }
      : null,
    sms_pause_required_absent: targetFunction === "handle-lead"
      ? [...HANDLER_SMS_PAUSE_SECRETS]
      : null,
    canary_contract_version: 1,
    ...overrides,
  };
}

function canaries(overrides = {}) {
  return {
    receipt_version: 1,
    project_ref: PROJECT_REF,
    checked_at: "2026-08-09T17:25:00.000Z",
    required: true,
    worker_health: {
      passed: true,
      http_status: 200,
      mode: "health-only",
      no_send: true,
      healthy: true,
      provider_auth: {
        healthy: true,
        permission: "sending_access",
        http_status: 401,
      },
      function_version: 10,
      deployment_id: deploymentId("lead-notification-worker"),
    },
    webhook_signature: {
      passed: true,
      http_status: 200,
      state: "ignored",
      no_send: true,
      function_version: 11,
      deployment_id: deploymentId("resend-webhook"),
    },
    ...overrides,
  };
}

function verify(targetFunction = "lead-notification-worker", overrides = {}) {
  const signedPayload = payload(targetFunction, overrides.payload);
  return verifyOwnerNotificationDeployReceipt({
    functionName: targetFunction,
    deploySha: SHA,
    projectRef: PROJECT_REF,
    migrationHistory: migrations,
    secretsMetadata: secrets,
    functionsMetadata: functions,
    canaryEvidence: targetFunction === "handle-lead" ? canaries() : {},
    receiptToken: signOwnerNotificationDeployReceipt(signedPayload, HMAC_KEY),
    receiptHmacKey: HMAC_KEY,
    now: NOW,
    ...overrides.arguments,
  });
}

assert.deepEqual(verify(), {
  required: true,
  phase: OWNER_NOTIFICATION_PHASES.infrastructure,
});
assert.deepEqual(verify("resend-webhook"), {
  required: true,
  phase: OWNER_NOTIFICATION_PHASES.infrastructure,
});
assert.deepEqual(verify("handle-lead"), {
  required: true,
  phase: OWNER_NOTIFICATION_PHASES.handler,
});
const issued = issueOwnerNotificationDeployReceipt({
  functionName: "handle-lead",
  deploySha: SHA,
  projectRef: PROJECT_REF,
  migrationHistory: migrations,
  secretsMetadata: secrets,
  functionsMetadata: functions,
  canaryEvidence: canaries(),
  receiptHmacKey: HMAC_KEY,
  now: NOW,
});
assert.equal(issued.payload.target_function, "handle-lead");
assert.equal(issued.payload.phase, OWNER_NOTIFICATION_PHASES.handler);
assert.deepEqual(
  issued.payload.sms_pause_required_absent,
  [...HANDLER_SMS_PAUSE_SECRETS],
);
assert.equal(typeof issued.token, "string");

const ownerCliTemp = fs.mkdtempSync(
  path.join(os.tmpdir(), "ut-owner-receipt-"),
);
try {
  const migrationPath = path.join(ownerCliTemp, "migrations.json");
  const secretsPath = path.join(ownerCliTemp, "secrets.json");
  const functionsPath = path.join(ownerCliTemp, "functions.json");
  const canaryPath = path.join(ownerCliTemp, "canaries.json");
  const tokenPath = path.join(ownerCliTemp, "receipt.token");
  fs.writeFileSync(migrationPath, JSON.stringify(migrations));
  fs.writeFileSync(secretsPath, JSON.stringify(secrets));
  fs.writeFileSync(functionsPath, JSON.stringify(functions));
  fs.writeFileSync(canaryPath, "{}\n");
  const cliEnv = {
    PATH: process.env.PATH,
    FUNCTION_NAME: "lead-notification-worker",
    DEPLOY_SHA: SHA,
    SUPABASE_PROJECT_REF: PROJECT_REF,
    NOTIFICATION_MIGRATION_HISTORY_PATH: migrationPath,
    NOTIFICATION_SECRETS_METADATA_PATH: secretsPath,
    NOTIFICATION_FUNCTIONS_METADATA_PATH: functionsPath,
    NOTIFICATION_CANARY_PATH: canaryPath,
    LEAD_NOTIFICATION_DEPLOY_RECEIPT_HMAC_KEY: HMAC_KEY,
  };
  const issueResult = spawnSync(
    process.execPath,
    [
      "scripts/verify-owner-notification-deploy-receipt.mjs",
      "--issue",
      tokenPath,
    ],
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
    ["scripts/verify-owner-notification-deploy-receipt.mjs"],
    {
      cwd: root,
      env: {
        ...cliEnv,
        LEAD_NOTIFICATION_DEPLOY_RECEIPT_TOKEN: cliToken,
      },
      encoding: "utf8",
    },
  );
  assert.equal(verifyResult.status, 0, verifyResult.stderr);
  const existingOutputResult = spawnSync(
    process.execPath,
    [
      "scripts/verify-owner-notification-deploy-receipt.mjs",
      "--issue",
      tokenPath,
    ],
    { cwd: root, env: cliEnv, encoding: "utf8" },
  );
  assert.notEqual(existingOutputResult.status, 0);
  assert.equal(fs.readFileSync(tokenPath, "utf8").trim(), cliToken);
} finally {
  fs.rmSync(ownerCliTemp, { recursive: true, force: true });
}

const reorderedFunctionSnapshot = Object.fromEntries(
  Object.entries(functionSnapshot()).reverse().map(([slug, metadata]) => [
    slug,
    Object.fromEntries(Object.entries(metadata).reverse()),
  ]),
);
assert.deepEqual(
  verify("lead-notification-worker", {
    payload: { live_function_metadata: reorderedFunctionSnapshot },
  }),
  { required: true, phase: OWNER_NOTIFICATION_PHASES.infrastructure },
);
assert.deepEqual(
  verifyOwnerNotificationDeployReceipt({ functionName: "track-click" }),
  { required: false, phase: "not-applicable" },
);
for (const forbiddenSmsSecret of HANDLER_SMS_PAUSE_SECRETS) {
  assert.throws(
    () =>
      verify("handle-lead", {
        arguments: {
          secretsMetadata: [
            ...secrets,
            {
              name: forbiddenSmsSecret,
              value: "present-digest",
              updated_at: NOW.toISOString(),
            },
          ],
        },
      }),
    new RegExp(`${forbiddenSmsSecret} must remain absent`),
  );
}

const rejectionCases = [
  ["missing migration", {
    arguments: { migrationHistory: migrations.slice(0, 2) },
  }, /missing 20260807000165/],
  ["missing secret", {
    arguments: {
      secretsMetadata: secrets.filter((entry) =>
        entry.name !== "UTAH_LEAD_RESEND_FROM"
      ),
    },
  }, /UTAH_LEAD_RESEND_FROM is missing/],
  [
    "wrong project",
    { payload: { project_ref: "wrong" } },
    /project does not match/,
  ],
  [
    "wrong SHA",
    { payload: { source_sha: "f".repeat(40) } },
    /source SHA does not match/,
  ],
  [
    "wrong target",
    { payload: { target_function: "resend-webhook" } },
    /target does not match/,
  ],
  ["expired", {
    payload: {
      issued_at: "2026-08-09T15:00:00.000Z",
      expires_at: "2026-08-09T16:00:00.000Z",
    },
  }, /not currently valid/],
  ["overlong", {
    payload: {
      issued_at: "2026-08-09T16:00:00.000Z",
      expires_at: "2026-08-09T18:00:01.000Z",
    },
  }, /no more than one hour/],
  ["secret drift", {
    payload: {
      live_secret_metadata: {
        ...secretSnapshot(),
        RESEND_WEBHOOK_SECRET: {
          digest: "old",
          updated_at: secrets[6].updated_at,
        },
      },
    },
  }, /RESEND_WEBHOOK_SECRET metadata/],
  ["function drift", {
    payload: {
      live_function_metadata: functionSnapshot({
        "resend-webhook": { version: 99 },
      }),
    },
  }, /function metadata/],
  [
    "wrong phase",
    { payload: { phase: OWNER_NOTIFICATION_PHASES.handler } },
    /requires the infrastructure-ready/,
  ],
  [
    "wrong SMS pause contract",
    { payload: { sms_pause_required_absent: [] } },
    /wrong Utah SMS pause contract/,
  ],
];
for (const [label, options, pattern] of rejectionCases) {
  assert.throws(
    () => verify("lead-notification-worker", options),
    pattern,
    label,
  );
}

for (
  const [label, options, pattern] of [
    ["inactive worker", {
      payload: {
        live_function_metadata: functionSnapshot({
          "lead-notification-worker": { status: "INACTIVE" },
        }),
      },
      arguments: {
        functionsMetadata: functions.map((entry) =>
          entry.slug === "lead-notification-worker"
            ? { ...entry, status: "INACTIVE" }
            : entry
        ),
      },
    }, /ACTIVE worker and webhook/],
    ["stale canary", {
      arguments: {
        canaryEvidence: canaries({ checked_at: "2026-08-09T17:00:00.000Z" }),
      },
    }, /stale or future-dated/],
    ["worker could send", {
      arguments: {
        canaryEvidence: canaries({
          worker_health: { ...canaries().worker_health, no_send: false },
        }),
      },
    }, /no-send worker health/],
    ["worker version drift", {
      arguments: {
        canaryEvidence: canaries({
          worker_health: { ...canaries().worker_health, function_version: 9 },
        }),
      },
    }, /live version/],
    ["provider auth unavailable", {
      arguments: {
        canaryEvidence: canaries({
          worker_health: {
            ...canaries().worker_health,
            provider_auth: { healthy: false, permission: "unavailable" },
          },
        }),
      },
    }, /no-send worker health/],
    ["webhook persisted", {
      arguments: {
        canaryEvidence: canaries({
          webhook_signature: {
            ...canaries().webhook_signature,
            state: "applied",
          },
        }),
      },
    }, /signed no-send webhook/],
    ["worker deployment drift", {
      arguments: {
        canaryEvidence: canaries({
          worker_health: {
            ...canaries().worker_health,
            deployment_id: "wrong-runtime-deployment",
          },
        }),
      },
    }, /live version/],
    ["receipt canary binding drift", {
      payload: {
        verified_canary_deployments: {
          "lead-notification-worker": "wrong-runtime-deployment",
          "resend-webhook": deploymentId("resend-webhook"),
        },
      },
    }, /live canary deployments/],
  ]
) {
  assert.throws(() => verify("handle-lead", options), pattern, label);
}

const signed = signOwnerNotificationDeployReceipt(payload(), HMAC_KEY);
const tampered = `${signed.slice(0, -1)}${signed.endsWith("A") ? "B" : "A"}`;
assert.throws(
  () =>
    verify("lead-notification-worker", {
      arguments: { receiptToken: tampered },
    }),
  /signature is invalid/,
);

const webhookSecret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const calls = [];
const canaryResult = await runOwnerNotificationCanaries({
  functionName: "handle-lead",
  projectRef: PROJECT_REF,
  workerToken: "worker-test-token",
  webhookSecret,
  functionsMetadata: functions,
  now: NOW,
  eventId: "msg_frame_canary_test",
  fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/lead-notification-worker")) {
      return Response.json({
        mode: "health-only",
        no_send: true,
        healthy: true,
        provider_auth: {
          healthy: true,
          permission: "sending_access",
          httpStatus: 401,
        },
        deployment_id: deploymentId("lead-notification-worker"),
      });
    }
    return Response.json({
      ok: true,
      state: "ignored",
      deployment_id: deploymentId("resend-webhook"),
    });
  },
});
assert.equal(calls.length, 2);
assert.equal(calls[0].init.headers["x-frame-worker-mode"], "health-only");
assert.equal(calls[0].init.body, undefined);
const webhookPayload = JSON.parse(calls[1].init.body);
assert.deepEqual(webhookPayload.data.tags, {
  frame_canary: "signature_only_v1",
});
assert.equal("frame_notification" in webhookPayload.data.tags, false);
assert.deepEqual(
  calls[1].init.headers,
  signedWebhookCanary(
    webhookSecret,
    calls[1].init.body,
    NOW,
    "msg_frame_canary_test",
  ),
);
assert.equal(canaryResult.worker_health.no_send, true);
assert.equal(canaryResult.webhook_signature.state, "ignored");
await assert.rejects(
  () =>
    runOwnerNotificationCanaries({
      functionName: "handle-lead",
      projectRef: PROJECT_REF,
      workerToken: "worker-test-token",
      webhookSecret,
      functionsMetadata: functions,
      now: NOW,
      eventId: "msg_frame_canary_wrong_deployment",
      fetchImpl: async () =>
        Response.json({
          mode: "health-only",
          no_send: true,
          healthy: true,
          provider_auth: {
            healthy: true,
            permission: "sending_access",
            httpStatus: 401,
          },
          deployment_id: "wrong-runtime-deployment",
        }),
    }),
  /no-send worker health canary failed/,
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
  assert.equal(result.status, 0, `YAML parser failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function checkedShell(step) {
  assert.equal(typeof step?.run, "string", `${step?.name ?? "step"} lacks run`);
  const syntax = spawnSync("bash", ["-n"], {
    input: step.run,
    encoding: "utf8",
  });
  assert.equal(
    syntax.status,
    0,
    `${step.name} has invalid bash: ${syntax.stderr}`,
  );
  return step.run;
}

const workflow = parseWorkflow(".github/workflows/deploy-edge-function.yml");
assert.equal(
  workflow.concurrency.group,
  "utah-production-edge-function-deploy",
);
assert.equal(workflow.concurrency["cancel-in-progress"], false);
assert.equal(
  workflow.on.workflow_dispatch.inputs.lead_notification_cutover,
  undefined,
);
const steps = workflow.jobs.deploy.steps;
for (const step of steps) {
  assert.equal(
    step.if,
    undefined,
    `${step.name ?? step.uses} must not be bypassable`,
  );
  assert.equal(
    step["continue-on-error"],
    undefined,
    `${step.name ?? step.uses} must fail closed`,
  );
}
const index = (name) => steps.findIndex((step) => step.name === name);
const liveAt = index(
  "Read live owner-notification migration, secret, and function state",
);
const canaryAt = index("Run no-send owner-notification deployment canaries");
const refreshAt = index(
  "Refresh live owner-notification metadata after canaries",
);
const mintAt = index(
  "Mint signed live owner-notification deployment evidence",
);
const receiptAt = index(
  "Verify signed live owner-notification deployment evidence",
);
const deployAt = steps.findIndex((step) => step.name?.startsWith("Deploy "));
assert(
  liveAt > 0 && canaryAt > liveAt && refreshAt > canaryAt &&
    mintAt > refreshAt && receiptAt > mintAt &&
    deployAt > receiptAt,
);
const liveState = checkedShell(steps[liveAt]);
assert.match(liveState, /database\/query\/read-only/);
assert.match(liveState, /"read_only":true/);
assert.match(liveState, /supabase secrets list/);
assert.match(liveState, /supabase functions list/);
for (const version of REQUIRED_NOTIFICATION_MIGRATIONS) {
  assert.match(liveState, new RegExp(`'${version}'`));
}
assert.equal(
  checkedShell(steps[canaryAt]).trim(),
  "node scripts/run-owner-notification-deploy-canaries.mjs",
);
assert.equal(
  steps[canaryAt].env.LEAD_NOTIFICATION_WORKER_TOKEN,
  "${{ secrets.LEAD_NOTIFICATION_WORKER_TOKEN }}",
);
assert.equal(
  steps[canaryAt].env.RESEND_WEBHOOK_SECRET,
  "${{ secrets.RESEND_WEBHOOK_SECRET }}",
);
const refreshedState = checkedShell(steps[refreshAt]);
assert.match(refreshedState, /database\/query\/read-only/);
assert.match(refreshedState, /supabase secrets list/);
assert.match(refreshedState, /supabase functions list/);
assert.match(refreshedState, /mv .*NOTIFICATION_FUNCTIONS_METADATA_PATH/);
const mintState = checkedShell(steps[mintAt]);
assert.match(
  mintState,
  /verify-owner-notification-deploy-receipt\.mjs --issue/,
);
assert.match(mintState, /::add-mask::/);
assert.match(mintState, /GITHUB_ENV/);
assert.equal(steps[mintAt].env.FUNCTION_NAME, "${{ inputs.function }}");
assert.equal(steps[mintAt].env.DEPLOY_SHA, "${{ github.sha }}");
assert.equal(steps[mintAt].env.SUPABASE_PROJECT_REF, PROJECT_REF);
assert.equal(
  steps[mintAt].env.LEAD_NOTIFICATION_DEPLOY_RECEIPT_HMAC_KEY,
  "${{ secrets.LEAD_NOTIFICATION_DEPLOY_RECEIPT_HMAC_KEY }}",
);
assert.equal(
  checkedShell(steps[receiptAt]).trim(),
  "node scripts/verify-owner-notification-deploy-receipt.mjs",
);
assert.equal(
  steps[receiptAt].env.LEAD_NOTIFICATION_DEPLOY_RECEIPT_TOKEN,
  "${{ env.LEAD_NOTIFICATION_DEPLOY_RECEIPT_TOKEN }}",
);

const recoveryWorkflow = parseWorkflow(
  ".github/workflows/lead-notification-worker.yml",
);
const recoveryRun = checkedShell(recoveryWorkflow.jobs.recover.steps[0]);
assert.match(recoveryRun, /x-frame-worker-mode: recover/);

const compliance = parseWorkflow(".github/workflows/compliance-gate.yml");
for (
  const requiredPath of [
    "scripts/verify-owner-notification-deploy-receipt.mjs",
    "scripts/run-owner-notification-deploy-canaries.mjs",
    "scripts/test-owner-notification-deploy-receipt.mjs",
  ]
) {
  assert(
    compliance.on.pull_request.paths.includes(requiredPath),
    `compliance pull-request filter omits ${requiredPath}`,
  );
}

const deployRunbook = read("supabase/functions/handle-lead/DEPLOY.md");
for (
  const requiredText of [
    "verify-owner-notification-deploy-receipt.mjs --issue",
    "LEAD_NOTIFICATION_DEPLOY_RECEIPT_TOKEN",
    "LEAD_NOTIFICATION_DEPLOY_RECEIPT_HMAC_KEY",
    "Production – frame-restoration-utah",
    "routine key rotation",
  ]
) {
  assert(
    deployRunbook.includes(requiredText),
    `owner-notification runbook omits ${requiredText}`,
  );
}

const workerSource = read(
  "supabase/functions/lead-notification-worker/index.ts",
);
const healthStart = workerSource.indexOf(
  'if (requestedMode === "health-only")',
);
const recoveryStart = workerSource.indexOf(
  "const { data: reconciledCount",
  healthStart,
);
assert(healthStart > 0 && recoveryStart > healthStart);
const healthBranch = workerSource.slice(healthStart, recoveryStart);
for (
  const forbidden of [
    "sendResendEmail",
    "LEAD_NOTIFICATION_CLAIM_RPC",
    "LEAD_NOTIFICATION_COMPLETE_RPC",
    "LEAD_NOTIFICATION_EXHAUST_RPC",
    "reconcile_resend_notification_events",
  ]
) {
  assert.equal(
    healthBranch.includes(forbidden),
    false,
    `health-only mode contains ${forbidden}`,
  );
}
for (
  const required of [
    'request.headers.get("authorization")',
    '"x-frame-worker-mode"',
    'mode: "health-only"',
    "no_send: true",
    "await readDurableHealth",
  ]
) {
  assert(
    workerSource.includes(required),
    `worker health-only contract lacks ${required}`,
  );
}

console.log(
  "Owner-notification deploy gate passed: signed/live phase evidence, no-send canaries, parsed workflow, and worker isolation.",
);
