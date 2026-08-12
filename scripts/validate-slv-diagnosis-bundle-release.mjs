#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const receiptPath = "data/rank-tracker/evidence/SLV-DIAGNOSIS-BUNDLE-RELEASE-2026-08-12.json";
const receipt = JSON.parse(fs.readFileSync(path.join(root, receiptPath), "utf8"));

const exactKeys = (value, expected, label) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} contains an unexpected or missing field`);
};
const utcTimestamp = (value, label) => {
  assert.equal(typeof value, "string", `${label} must be a UTC timestamp`);
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u, `${label} must be UTC ISO-8601`);
  assert.ok(Number.isFinite(Date.parse(value)), `${label} must parse as a date`);
};

exactKeys(receipt, [
  "schemaVersion", "evidenceId", "market", "status", "observedAt", "repository",
  "pullRequest", "defaultBranch", "source", "decision", "publicMutationPerformed", "gbpMutationPerformed",
], "diagnosis-bundle release receipt");
exactKeys(receipt.pullRequest, ["number", "url", "headSha", "mergeSha", "mergedAt", "checks"], "pullRequest");
exactKeys(receipt.pullRequest.checks, ["total", "successful", "skippedMeasurement", "blocking", "blockingSuccessful"], "pullRequest checks");
exactKeys(receipt.defaultBranch, ["branch", "commit", "workflows", "deployments"], "defaultBranch");
exactKeys(receipt.source, ["method", "credentialValuesStored", "publicMutationPerformed"], "source");

assert.equal(receipt.schemaVersion, 1);
assert.equal(receipt.evidenceId, "frame-utah-slv-diagnosis-bundle-release-v1");
assert.equal(receipt.market, "utah-salt-lake-valley");
assert.equal(receipt.status, "LANDED_MAIN_CI_AND_PRODUCTION_DEPLOYMENTS_VERIFIED");
assert.equal(receipt.repository, "Rconman99/frame-restoration-utah");
utcTimestamp(receipt.observedAt, "observedAt");
assert.equal(receipt.pullRequest.number, 247);
assert.equal(receipt.pullRequest.url, "https://github.com/Rconman99/frame-restoration-utah/pull/247");
assert.match(receipt.pullRequest.headSha, /^[0-9a-f]{40}$/u);
assert.match(receipt.pullRequest.mergeSha, /^[0-9a-f]{40}$/u);
utcTimestamp(receipt.pullRequest.mergedAt, "pullRequest.mergedAt");
assert.ok(Date.parse(receipt.observedAt) >= Date.parse(receipt.pullRequest.mergedAt));
assert.deepEqual(receipt.pullRequest.checks, {
  total: 28,
  successful: 27,
  skippedMeasurement: 1,
  blocking: 21,
  blockingSuccessful: 21,
});
assert.equal(
  receipt.pullRequest.checks.successful + receipt.pullRequest.checks.skippedMeasurement,
  receipt.pullRequest.checks.total,
);
assert.equal(receipt.pullRequest.checks.blockingSuccessful, receipt.pullRequest.checks.blocking);

assert.equal(receipt.defaultBranch.branch, "main");
assert.equal(receipt.defaultBranch.commit, receipt.pullRequest.mergeSha);
assert.equal(receipt.defaultBranch.workflows.length, 4);
assert.equal(new Set(receipt.defaultBranch.workflows.map(({ name }) => name)).size, 4);
for (const [index, workflow] of receipt.defaultBranch.workflows.entries()) {
  exactKeys(workflow, ["name", "runId", "url", "conclusion"], `workflow ${index + 1}`);
  assert.ok(Number.isSafeInteger(workflow.runId) && workflow.runId > 0);
  assert.equal(workflow.url, `https://github.com/Rconman99/frame-restoration-utah/actions/runs/${workflow.runId}`);
  assert.equal(workflow.conclusion, "success");
}
assert.deepEqual(
  new Set(receipt.defaultBranch.workflows.map(({ name }) => name)),
  new Set([
    "SLV city goal program",
    "Compliance Gate",
    "Salt Lake Valley city integrity debt",
    "Salt Lake Valley exact-CID review baseline",
  ]),
);

assert.equal(receipt.defaultBranch.deployments.length, 2);
assert.deepEqual(
  new Set(receipt.defaultBranch.deployments.map(({ context }) => context)),
  new Set(["Vercel – frame-restoration-utah", "Vercel – frameroofingutah"]),
);
for (const [index, deployment] of receipt.defaultBranch.deployments.entries()) {
  exactKeys(deployment, ["context", "state", "targetUrl", "updatedAt"], `deployment ${index + 1}`);
  assert.equal(deployment.state, "success");
  assert.match(deployment.targetUrl, /^https:\/\/vercel\.com\//u);
  utcTimestamp(deployment.updatedAt, `deployment ${index + 1}.updatedAt`);
  assert.ok(Date.parse(deployment.updatedAt) >= Date.parse(receipt.pullRequest.mergedAt));
}

assert.equal(receipt.source.method, "read-only-github-api-and-cli");
assert.equal(receipt.source.credentialValuesStored, false);
assert.equal(receipt.source.publicMutationPerformed, false);
assert.match(receipt.decision, /diagnosis bundle is landed and release-verified/u);
assert.match(receipt.decision, /continue the evidence, owner-approval, and measurement gates/u);
assert.equal(receipt.publicMutationPerformed, false);
assert.equal(receipt.gbpMutationPerformed, false);

console.log(`PASS SLV diagnosis-bundle release: PR #${receipt.pullRequest.number}, ${receipt.defaultBranch.workflows.length} main workflows, ${receipt.defaultBranch.deployments.length} production deployments verified`);
