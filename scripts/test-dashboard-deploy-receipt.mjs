#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DASHBOARD_DEPLOY_RECEIPTS,
  REQUIRED_DASHBOARD_MIGRATIONS,
  signDashboardDeployReceipt,
  verifyDashboardDeployReceipt,
} from "./verify-dashboard-deploy-receipt.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const PROJECT_REF = "hdcflshhomzildwqlmwh";
const HMAC_KEY = "test-only-dashboard-receipt-key-at-least-32-bytes";
const NOW = new Date("2026-08-07T18:30:00.000Z");

const migrationRows = (cutoverComplete = false) =>
  REQUIRED_DASHBOARD_MIGRATIONS.map((version) => ({
    version,
    report_access_pins_all_null: cutoverComplete,
    plaintext_pin_constraint_present: cutoverComplete,
  }));
const migrations = migrationRows();
const secrets = [
  ["DASHBOARD_SESSION_SECRET", "session-digest", "2026-08-07T17:00:00.000Z"],
  ["DASHBOARD_CREDENTIAL_PEPPER", "pepper-digest", "2026-08-07T17:00:00.000Z"],
  ["SUPABASE_SERVICE_ROLE_KEY", "service-digest", "2026-08-07T17:00:00.000Z"],
  ["SUPABASE_URL", "url-digest", "2026-08-07T17:00:00.000Z"],
  ["LEAD_CRM_API_KEY", "routing-digest", "2026-08-07T17:00:00.000Z"],
  ["POSTHOG_PERSONAL_API_KEY", "posthog-digest", "2026-08-07T17:00:00.000Z"],
].map(([name, value, updated_at]) => ({ name, value, updated_at }));

function receiptPayload(overrides = {}) {
  return {
    receipt_version: 1,
    project_ref: PROJECT_REF,
    source_sha: SHA,
    issued_at: "2026-08-07T18:00:00.000Z",
    expires_at: "2026-08-08T18:00:00.000Z",
    cutover_state: DASHBOARD_DEPLOY_RECEIPTS.additive,
    live_cutover_complete: false,
    live_migration_versions: [...REQUIRED_DASHBOARD_MIGRATIONS],
    live_secret_metadata: {
      DASHBOARD_SESSION_SECRET: {
        digest: "session-digest",
        updated_at: "2026-08-07T17:00:00.000Z",
      },
      DASHBOARD_CREDENTIAL_PEPPER: {
        digest: "pepper-digest",
        updated_at: "2026-08-07T17:00:00.000Z",
      },
    },
    secret_minimum_bytes: 32,
    secret_values_distinct: true,
    auth_role_smoke_scope: "exact-source-offline",
    auth_role_smoke: {
      admin: "passed",
      sales: "passed",
      viewer: "passed",
      session_revocation: "passed",
    },
    ...overrides,
  };
}

function verify(overrides = {}) {
  const payload = receiptPayload(overrides.payload);
  return verifyDashboardDeployReceipt({
    functionName: "lead-crm",
    deploySha: SHA,
    projectRef: PROJECT_REF,
    migrationHistory: migrations,
    secretsMetadata: secrets,
    receiptToken: signDashboardDeployReceipt(payload, HMAC_KEY),
    receiptHmacKey: HMAC_KEY,
    now: NOW,
    ...overrides.arguments,
  });
}

assert.deepEqual(verify(), { required: true, cutover: "pending" });
assert.deepEqual(
  verify({
    payload: {
      cutover_state: DASHBOARD_DEPLOY_RECEIPTS.final,
      live_cutover_complete: true,
      auth_role_smoke_scope: "live-production",
    },
    arguments: {
      functionName: "weekly-report",
      migrationHistory: migrationRows(true),
    },
  }),
  { required: true, cutover: "complete" },
);
assert.deepEqual(
  verifyDashboardDeployReceipt({ functionName: "track-click" }),
  { required: false, cutover: "not-applicable" },
);

const rejectionCases = [
  ["missing live migration", { arguments: { migrationHistory: [migrations[0]] } }, /missing 20260807000150/],
  ["missing live secret", { arguments: { secretsMetadata: secrets.filter((entry) => entry.name !== "LEAD_CRM_API_KEY") } }, /LEAD_CRM_API_KEY is missing/],
  ["identical live secret digests", { arguments: { secretsMetadata: secrets.map((entry) => entry.name === "DASHBOARD_CREDENTIAL_PEPPER" ? { ...entry, value: "session-digest" } : entry) } }, /digests are identical/],
  ["wrong source SHA", { payload: { source_sha: "f".repeat(40) } }, /source SHA does not match/],
  ["expired receipt", { payload: { issued_at: "2026-08-06T17:00:00.000Z", expires_at: "2026-08-07T17:00:00.000Z" } }, /not currently valid/],
  ["secret metadata drift", { payload: { live_secret_metadata: { ...receiptPayload().live_secret_metadata, DASHBOARD_SESSION_SECRET: { digest: "old-digest", updated_at: "2026-08-07T17:00:00.000Z" } } } }, /not bound to current live DASHBOARD_SESSION_SECRET/],
  ["missing role smoke", { payload: { auth_role_smoke: { ...receiptPayload().auth_role_smoke, viewer: "failed" } } }, /viewer auth\/role smoke/],
  ["pending receipt overclaims live smoke", { payload: { auth_role_smoke_scope: "live-production" } }, /pending dashboard receipt requires exact-source-offline/],
  ["complete claim without live cutover", { payload: { cutover_state: "complete", live_cutover_complete: true, auth_role_smoke_scope: "live-production" } }, /lacks live PIN-null\/constraint/],
  ["pending claim after live cutover", { payload: { live_cutover_complete: true }, arguments: { migrationHistory: migrationRows(true) } }, /pending dashboard receipt is invalid/],
  ["receipt cutover-state drift", { payload: { live_cutover_complete: true } }, /not bound to the current live cutover state/],
];
for (const [label, options, pattern] of rejectionCases) {
  assert.throws(() => verify(options), pattern, label);
}
const signed = signDashboardDeployReceipt(receiptPayload(), HMAC_KEY);
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
  assert.equal(result.status, 0, `YAML parser failed for ${relative}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function checkedShell(step) {
  assert.equal(typeof step?.run, "string", `${step?.name ?? "step"} lacks a run command`);
  const syntax = spawnSync("bash", ["-n"], { input: step.run, encoding: "utf8" });
  assert.equal(syntax.status, 0, `${step.name} has invalid bash: ${syntax.stderr}`);
  return step.run;
}

const workflow = parseWorkflow(".github/workflows/deploy-edge-function.yml");
const deploy = workflow.jobs.deploy;
const admission = workflow.jobs.admission;
assert.equal(deploy.environment.name, "Production – frame-restoration-utah");
assert.equal(admission.environment.name, "Production – frame-restoration-utah");
assert.equal(deploy.needs, "admission");
assert.equal(workflow.permissions.actions, "read");
assert.equal(deploy.if, undefined, "deploy job must not have a conditional bypass");
assert.equal(deploy["continue-on-error"], undefined);
assert.equal(workflow.on.workflow_dispatch.inputs.dashboard_deploy_receipt, undefined);
for (const step of [...admission.steps, ...deploy.steps]) {
  assert.equal(step.if, undefined, `${step.name ?? step.uses} must not be conditionally bypassed`);
  assert.equal(step["continue-on-error"], undefined, `${step.name ?? step.uses} must fail closed`);
}
const setupCli = deploy.steps.find((step) =>
  step.uses ===
    "supabase/setup-cli@ab058987d8d6c725971f6cf9d0b5c98467e30bd1"
);
assert.equal(setupCli.with.version, "2.113.0");

const stepIndex = (name) => admission.steps.findIndex((step) => step.name === name);
const admissionAt = stepIndex("Require the exact current main tip and green compliance");
const liveStateAt = stepIndex("Read live dashboard migration and secret state");
const receiptAt = stepIndex("Verify signed dashboard deployment evidence");
const deployAt = deploy.steps.findIndex((step) => step.name?.startsWith("Deploy "));
assert(admissionAt > 0 && liveStateAt > admissionAt && receiptAt > liveStateAt && deployAt > 0);

const admissionShell = checkedShell(admission.steps[admissionAt]);
assert.match(admissionShell, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
assert.match(admissionShell, /git fetch --no-tags origin refs\/heads\/main:refs\/remotes\/origin\/main/);
assert.match(admissionShell, /actions\/workflows\/compliance-gate\.yml\/runs/);
assert.match(admissionShell, /\.head_sha == \$sha[\s\S]*\.event == "push"[\s\S]*\.conclusion == "success"/);
assert.match(admissionShell, /Dashboard session revocation \+ credential security \(blocking\)/);

const liveState = checkedShell(admission.steps[liveStateAt]);
assert.match(liveState, /database\/query\/read-only/);
assert.match(liveState, /"read_only":true/);
assert.match(liveState, /User-Agent: SupabaseCLI\/2\.113\.0/);
assert.match(liveState, /report_access_pins_all_null/);
assert.match(liveState, /report_access_plaintext_pin_forbidden_check/);
assert.match(liveState, /plaintext_pin_constraint_present/);
assert.match(liveState, /supabase secrets list --project-ref "\$SUPABASE_PROJECT_REF" --output json/);
for (const version of REQUIRED_DASHBOARD_MIGRATIONS) assert.match(liveState, new RegExp(`'${version}'`));

const receiptStep = admission.steps[receiptAt];
assert.equal(receiptStep.env.DASHBOARD_DEPLOY_RECEIPT_TOKEN, "${{ secrets.DASHBOARD_DEPLOY_RECEIPT_TOKEN }}");
assert.equal(receiptStep.env.DASHBOARD_DEPLOY_RECEIPT_HMAC_KEY, "${{ secrets.DASHBOARD_DEPLOY_RECEIPT_HMAC_KEY }}");
assert.equal(checkedShell(receiptStep).trim(), "node scripts/verify-dashboard-deploy-receipt.mjs");

const finalDeploy = checkedShell(deploy.steps[deployAt]);
assert.match(finalDeploy, /git\/ref\/heads\/main/);
assert.match(finalDeploy, /\[\[ "\$LIVE_MAIN_SHA" == "\$DEPLOY_SHA" \]\]/);
assert.match(finalDeploy, /supabase functions deploy/);

const compliance = parseWorkflow(".github/workflows/compliance-gate.yml");
assert(compliance.on.pull_request.paths.includes(".github/workflows/deploy-edge-function.yml"));
const dashboardJob = compliance.jobs["dashboard-security"];
assert.equal(dashboardJob.if, undefined);
assert.equal(dashboardJob["continue-on-error"], undefined);
const receiptTestStep = dashboardJob.steps.find((step) =>
  step.name === "Reject dashboard deploys without a complete rollout receipt"
);
assert.equal(checkedShell(receiptTestStep).trim(), "node scripts/test-dashboard-deploy-receipt.mjs");

console.log("Dashboard production deploy gate passed: signed/live evidence cases plus parsed YAML and bash contracts.");
