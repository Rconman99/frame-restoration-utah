#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");

const contractPath = "data/authority/SLV-CITY-PUBLIC-REMEDIATION-CONTRACT-2026-08-12.json";
const outputPath = "data/authority/SLV-CITY-PUBLIC-REMEDIATION-PACKET-2026-08-12.json";
const contract = JSON.parse(fs.readFileSync(path.join(repoRoot, contractPath), "utf8"));
const hash = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, file))).digest("hex");

const auditRun = spawnSync(
  process.execPath,
  ["scripts/audit-slv-city-integrity.mjs", "--details"],
  { cwd: repoRoot, encoding: "utf8" },
);
assert.equal(auditRun.status, 0, auditRun.stderr);
const audit = JSON.parse(auditRun.stdout);

const sourceFiles = [...contract.targetPages, "data/route-factory/business.json"].map((file) => ({
  file,
  sha256: hash(file),
}));
const findingsByPage = Object.fromEntries(
  contract.targetPages.map((file) => [
    file,
    audit.failureDetails
      .filter((finding) => finding.file === file)
      .map(({ id, count, guidance }) => ({ id, count, guidance })),
  ]),
);

const packet = {
  schemaVersion: 1,
  packetId: "frame-utah-slv-five-page-public-integrity-cleanup-v1",
  market: "utah-salt-lake-valley",
  preparedAt: "2026-08-12T16:07:00.000Z",
  preparedFromCommit: "5b4ccc11b0cc0a41c0d598f01c8f7d9410a6da28",
  status: "draft-only-awaiting-explicit-owner-approval",
  publicMutationPerformed: false,
  contract: contractPath,
  sourceFiles,
  scope: {
    pages: contract.targetPages,
    dataFiles: ["data/route-factory/business.json"],
    allowed: [
      "Remove or narrow only the disputed claim classes enumerated in this packet.",
      "Preserve the provisional 10-year workmanship warranty without expanding it.",
      "Correct Millcreek from the Heber identity to the verified Salt Lake Valley CID and exact reviewed sameAs set.",
      "Keep titles and H1s unchanged during the integrity cleanup so ranking intent remains a separate measured variable.",
      "Update visible FAQ copy and matching FAQPage JSON-LD together.",
    ],
    excluded: [
      "Salt Lake City page changes before its current observation window is evaluated.",
      "GBP, directory, review, indexing, outreach, DNS, advertising, or owner-message mutations.",
      "New city-specific project, review, insurance, pricing, response-time, permit, duration, or weather claims.",
      "Title or H1 ranking experiments before a fresh post-cleanup baseline.",
    ],
  },
  currentAudit: {
    checkedPages: audit.checkedPages,
    blockingFindings: audit.failures,
    provisionalWarnings: audit.warnings,
    findingsByPage,
    warningDetails: audit.warningDetails,
  },
  replacementRecipes: Object.fromEntries(
    contract.blockedClaimClasses.map(({ id, replacement }) => [id, replacement]),
  ),
  provisionalClaims: contract.provisionalClaims,
  millcreekIdentityCorrection: {
    page: "locations/millcreek.html",
    removeCid: contract.identity.heberCid,
    useCid: contract.identity.verifiedSaltLakeValleyCid,
    hasMap: `https://www.google.com/maps?cid=${contract.identity.verifiedSaltLakeValleyCid}`,
    sameAs: contract.identity.saltLakeValleySameAs,
    businessOverrideFile: "data/route-factory/business.json",
  },
  releaseGate: {
    approvalRequiredBeforeEditingPublicPages: true,
    checks: contract.releaseGate.requiredChecks,
    sequence: [
      "Verify every source-file SHA-256 still matches this packet; regenerate and re-review if any differs.",
      "Apply only the approved scope in a clean exact-main worktree.",
      "Require zero strict integrity failures while retaining only the five provisional warranty warnings.",
      "Run claim, public-SEO, corpus, page-level AEO, NAP, pairing, and source gates.",
      "Deploy an immutable preview and pass the five-viewport preview receipt with a freshness marker.",
      "After authorized merge/release, pass a new production receipt against the canonical customer URL.",
      "Capture a fresh six-city Google and consumer-AI baseline and open the 28-day keep/revert window.",
    ],
    measurementWindowDays: contract.releaseGate.measurementWindowDays,
    decisionRule: contract.releaseGate.decisionRule,
  },
  rollback: {
    unit: "the future isolated five-page integrity-cleanup commit",
    rule: "Revert the isolated cleanup if integrity, qualified traffic, leads, or a fixed city/query panel materially regresses after the declared window; never revert unrelated work.",
  },
};

assert.equal(packet.currentAudit.checkedPages, 5);
assert.equal(packet.currentAudit.blockingFindings, 40);
assert.equal(packet.currentAudit.provisionalWarnings, 5);
assert.equal(packet.sourceFiles.length, 6);
assert.equal(Object.keys(packet.currentAudit.findingsByPage).length, 5);
assert.equal(
  Object.values(packet.currentAudit.findingsByPage).reduce((sum, findings) => sum + findings.length, 0) +
    audit.failureDetails.filter((finding) => finding.file === "data/route-factory/business.json").length,
  packet.currentAudit.blockingFindings,
);

const nextText = `${JSON.stringify(packet, null, 2)}\n`;
const fullOutputPath = path.join(repoRoot, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(
    `SYNC SLV public remediation packet: ${packet.currentAudit.blockingFindings} findings across ${packet.currentAudit.checkedPages} pages`,
  );
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(
    fs.readFileSync(fullOutputPath, "utf8"),
    nextText,
    "SLV public remediation packet is stale; run npm run sync:slv-public-remediation-packet",
  );
  console.log(
    `PASS SLV public remediation packet: ${packet.currentAudit.blockingFindings} findings across ${packet.currentAudit.checkedPages} pages`,
  );
}
