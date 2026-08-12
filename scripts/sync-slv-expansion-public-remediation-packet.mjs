#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");

const contractPath = "data/authority/SLV-EXPANSION-PUBLIC-REMEDIATION-CONTRACT-2026-08-12.json";
const outputPath = "data/authority/SLV-EXPANSION-PUBLIC-REMEDIATION-PACKET-2026-08-12.json";
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");

const contract = read(contractPath);
const audit = read(contract.integrityAudit);
const priority = read(contract.priorityLedger);
const auditPages = new Map(audit.pages.map((page) => [page.file, page]));
const priorityCities = new Map(priority.cities.map((city) => [city.city, city]));

assert.equal(contract.publicMutationPerformed, false);
assert.equal(contract.targetPages.length, 12);
assert.deepEqual(contract.targetPages, audit.scope.pages);
assert.equal(audit.summary.checkedPages, 12);
assert.equal(priority.cities.length, 12);

const pages = contract.targetPages.map((file) => {
  const audited = auditPages.get(file);
  assert.ok(audited, `missing integrity audit row: ${file}`);
  const ranked = priorityCities.get(audited.city);
  assert.ok(ranked, `missing priority row: ${audited.city}`);
  assert.equal(audited.sha256, sha256(file), `stale integrity hash: ${file}`);
  assert.equal(ranked.integrity.pageSha256, audited.sha256, `priority hash mismatch: ${file}`);
  return {
    city: audited.city,
    priority: ranked.priority,
    lane: ranked.lane,
    file,
    sha256: audited.sha256,
    title: audited.title,
    h1: audited.h1,
    canonical: audited.canonical,
    identityState: audited.identity.state,
    serviceAreaStatus: audited.serviceAreaStatus,
    organicRanks: ranked.organicRanks,
    organicNumberOneQueries: ranked.organicNumberOneQueries,
    googleAiOverview: ranked.googleAiOverview,
    protectedRelatedRoutes: ranked.protectedRelatedRoutes,
    findings: audited.findings,
    warnings: audited.warnings,
  };
});

const packet = {
  schemaVersion: 1,
  packetId: contract.contractId,
  market: contract.market,
  preparedAt: "2026-08-12T18:05:00.000Z",
  preparedFromCommit: audit.preparedFromCommit,
  status: contract.publicMutationStatus,
  publicMutationPerformed: false,
  contract: contractPath,
  evidence: {
    integrityAudit: {
      file: contract.integrityAudit,
      sha256: sha256(contract.integrityAudit),
    },
    priorityLedger: {
      file: contract.priorityLedger,
      sha256: sha256(contract.priorityLedger),
    },
  },
  scope: {
    pages: contract.targetPages,
    allowed: contract.allowed,
    excluded: contract.excluded,
  },
  currentAudit: audit.summary,
  pages,
  identity: contract.identity,
  provisionalClaims: contract.provisionalClaims,
  approval: contract.approval,
  releaseGate: {
    approvalRequiredBeforeEditingPublicPages: true,
    checks: contract.releaseGate.requiredChecks,
    sequence: [
      "Verify every source-page and evidence SHA-256 still matches this packet; regenerate and re-review if any differs.",
      "Capture a fresh pre-edit fixed panel if the pinned baseline is no longer current enough for the declared experiment.",
      "Apply only the explicitly approved claim cleanup in a clean exact-main worktree, with identity and ranking-intent surfaces unchanged.",
      "Require zero strict expansion integrity failures while preserving only the twelve provisional warranty warning classes.",
      "Run claim, public-SEO, corpus, page-level AEO, NAP, pairing, and source gates.",
      "Deploy one immutable preview and pass all five viewports with an intended freshness marker.",
      "After authorized merge/release, pass a new production receipt against the canonical customer URL.",
      "Run weekly fixed panels and record a 28-day keep/revert decision for every affected city.",
    ],
    baselineRequiredBeforeEdit: contract.releaseGate.baselineRequiredBeforeEdit,
    measurementWindowDays: contract.releaseGate.measurementWindowDays,
    decisionRule: contract.releaseGate.decisionRule,
  },
  rollback: {
    unit: "the future isolated twelve-page expansion integrity-cleanup commit",
    rule: "Revert only that isolated cleanup if integrity, qualified traffic, leads, or a fixed city/query panel materially regresses after the declared window; preserve unrelated work and protected related routes.",
  },
};

assert.equal(packet.currentAudit.blockingFindingClasses, 73);
assert.equal(packet.currentAudit.blockingOccurrences, 320);
assert.equal(packet.currentAudit.provisionalWarningClasses, 12);
assert.equal(packet.pages.length, 12);
assert.equal(packet.pages.reduce((sum, page) => sum + page.findings.length, 0), 73);
assert.equal(packet.pages.reduce((sum, page) => sum + page.warnings.length, 0), 12);
assert.deepEqual(
  packet.pages.filter((page) => page.organicNumberOneQueries.length).map((page) => page.city),
  ["Kearns", "Magna"],
);
assert.ok(packet.pages.every((page) => page.identityState === contract.identity.currentState));
assert.ok(packet.approval.requiredPhrase.includes(packet.packetId));

const nextText = `${JSON.stringify(packet, null, 2)}\n`;
const fullOutputPath = path.join(root, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(
    `SYNC SLV expansion public remediation packet: ${packet.currentAudit.blockingFindingClasses} finding classes across ${packet.pages.length} pages`,
  );
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(
    fs.readFileSync(fullOutputPath, "utf8"),
    nextText,
    "SLV expansion public remediation packet is stale; run npm run sync:slv-expansion-public-remediation-packet",
  );
  console.log(
    `PASS SLV expansion public remediation packet: ${packet.currentAudit.blockingFindingClasses} finding classes across ${packet.pages.length} pages; no public authorization`,
  );
}
