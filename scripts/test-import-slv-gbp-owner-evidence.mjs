import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const cities = [
  "Salt Lake City", "Millcreek", "Sandy", "Holladay", "Cottonwood Heights", "Draper",
  "Bluffdale", "Herriman", "Kearns", "Magna", "Midvale", "Murray", "Riverton",
  "South Jordan", "South Salt Lake", "Taylorsville", "West Jordan", "West Valley City",
];

const privateInput = () => ({
  schemaVersion: 1,
  observedAt: new Date(Date.now() - 60_000).toISOString(),
  observerAccount: "ryan@framerestorations.com",
  profile: {
    business: "Frame Restoration Utah LLC",
    cid: "5689850818145735734",
    exactCidVisible: true,
    verificationState: "verified",
    businessType: "service-area",
    addressVisibility: "hidden",
    primaryCategory: "Roofing contractor",
    secondaryCategories: [],
    configuredRoofingServices: [],
    regularHoursState: "configured",
    specialHoursState: "current",
    mostRecentOwnerPhotoDate: new Date().toISOString().slice(0, 10),
    googleRating: 5,
    googleReviewCount: 4,
    reviewResponseCoverageState: "all-responded",
  },
  serviceAreas: cities.map((city) => ({ city, savedState: city === "Salt Lake City" ? "saved" : "unknown" })),
  attestation: {
    currentOwnerView: true,
    readOnly: true,
    privateAddressOmitted: true,
    credentialsOmitted: true,
    reviewerIdentitiesOmitted: true,
    profileEditsPerformed: false,
  },
});

test("CLI validates a private outside-repository input without writing by default", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slv-gbp-owner-evidence-"));
  const source = path.join(temp, "owner-evidence.json");
  try {
    fs.writeFileSync(source, JSON.stringify(privateInput()));
    const result = spawnSync(process.execPath, ["scripts/import-slv-gbp-owner-evidence.mjs", "--input", source], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS private SLV owner-view evidence: 1\/18 city states measured/u);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI rejects completed owner evidence stored inside the repository", () => {
  const unsafePath = path.join(root, "data", "private-owner-evidence", "must-not-import.json");
  try {
    fs.mkdirSync(path.dirname(unsafePath), { recursive: true });
    fs.writeFileSync(unsafePath, JSON.stringify(privateInput()));
    const result = spawnSync(process.execPath, ["scripts/import-slv-gbp-owner-evidence.mjs", "--input", unsafePath], {
      cwd: root,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must remain outside the repository/u);
  } finally {
    fs.rmSync(unsafePath, { force: true });
  }
});
