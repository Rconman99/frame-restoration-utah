#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const strict = process.argv.includes("--strict");
const details = process.argv.includes("--details");
const contractPath = path.join(
  repoRoot,
  "data/authority/SLV-CITY-PUBLIC-REMEDIATION-CONTRACT-2026-08-12.json",
);
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const failures = [];
const warnings = [];

function occurrences(text, pattern) {
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags))].length;
}

function fail(file, id, count, guidance) {
  failures.push({ file, id, count, guidance });
  const annotation = strict ? "error" : "warning";
  const message = `::${annotation} file=${file}::${id}: ${count} occurrence(s). ${guidance}`;
  if (strict) console.error(message);
  else console.warn(message);
}

function warn(file, id, count, guidance) {
  warnings.push({ file, id, count, guidance });
  console.warn(`::warning file=${file}::${id}: ${count} occurrence(s). ${guidance}`);
}

const patterns = [
  {
    id: "pricing-ranges",
    pattern: /\$[0-9][0-9,]*(?:\s*[–-]\s*\$?[0-9][0-9,]*)?/gu,
    guidance: "Replace unsupported dollar figures with scope-dependent factors and a written-estimate invitation.",
  },
  {
    id: "exact-response-or-availability",
    pattern: /\b(?:24\/7|within\s+24\s*[-–]\s*48\s+hours|within\s+24\s+hours|15\s+minutes?)\b/giu,
    guidance: "Remove exact availability, response-window, or travel-time promises until an operating policy is registered.",
  },
  {
    id: "universal-permit-handling",
    pattern: /\b(?:handles?|manage[sd]?|coordinates?)\b[^.<]{0,100}\bpermit(?:s|ting| applications?| filings?)\b|\bpermit(?:s|ting| applications?| filings?)\b[^.<]{0,100}\b(?:handles?|manage[sd]?|coordinates?)\b/giu,
    guidance: "Use municipality guidance and confirm responsibility in the written scope; do not promise universal handling.",
  },
  {
    id: "unverified-insurance-credentials",
    pattern: /\b(?:fully\s+)?licensed\s*(?:&|and)\s*insured\b|\bgeneral liability insurance\b|\bworkers['’]? compensation\b/giu,
    guidance: "Keep the verified license only until current insurance evidence is registered.",
  },
  {
    id: "universal-project-duration",
    pattern: /\b(?:take|takes|average|averages|run|runs|typically)[^.<]{0,120}\b(?:1\s*[-–]\s*3|1\s*[-–]\s*2|2\s*[-–]\s*4|3\s*[-–]\s*5)\s+(?:days?|weeks?)\b/giu,
    guidance: "Replace a universal duration with the scoped timing factors in the remediation contract.",
  },
  {
    id: "unsourced-roof-life-loss",
    pattern: /\bshorten(?:s|ed|ing)?\b[^.<]{0,120}\b5\s*[-–]\s*10\s+years?\b/giu,
    guidance: "Describe observable damage without an unregistered years-of-life-loss number.",
  },
];

const cityProjectPattern = /(?:alt|content)="[^"]*\b(?:completed|project|reroof)\b[^"]*\b(?:Millcreek|Sandy|Holladay|Cottonwood Heights|Draper)\b[^"]*"|(?:alt|content)="[^"]*\b(?:Millcreek|Sandy|Holladay|Cottonwood Heights|Draper)\b[^"]*\b(?:completed|project|reroof)\b[^"]*"/giu;
const cityReviewPattern = /"review"\s*:\s*\{|reviewBody|\bGoogle reviewer?\b/giu;
const warrantyPattern = /\b10-year workmanship warranty\b/giu;

for (const file of contract.targetPages) {
  const fullPath = path.join(repoRoot, file);
  if (!fs.existsSync(fullPath)) {
    fail(file, "missing-target-page", 1, "Restore the declared page or update the reviewed contract.");
    continue;
  }

  const text = fs.readFileSync(fullPath, "utf8");
  for (const rule of patterns) {
    const count = occurrences(text, rule.pattern);
    if (count) fail(file, rule.id, count, rule.guidance);
  }

  const projectCount = occurrences(text, cityProjectPattern);
  const citySlug = path.basename(file, ".html");
  const cityAssetCount = occurrences(
    text,
    new RegExp(`/images/projects/cities/${citySlug}(?:[-/.])`, "giu"),
  );
  const totalProjectCount = projectCount + cityAssetCount;
  if (totalProjectCount) {
    fail(
      file,
      "unverified-city-project-attribution",
      totalProjectCount,
      "Use neutral asset text until a city-specific project record establishes the location.",
    );
  }

  const reviewCount = occurrences(text, cityReviewPattern);
  if (reviewCount) {
    fail(
      file,
      "unverified-city-review-attribution",
      reviewCount,
      "Remove the review from this city page until the public review or private project record establishes the city.",
    );
  }

  const warrantyCount = occurrences(text, warrantyPattern);
  if (warrantyCount) {
    warn(
      file,
      "provisional-10-year-workmanship-warranty",
      warrantyCount,
      "Preserve but do not expand; obtain the current warranty instrument and register the exact scope.",
    );
  }
}

const slvCid = contract.identity.verifiedSaltLakeValleyCid;
const heberCid = contract.identity.heberCid;
const business = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "data/route-factory/business.json"), "utf8"),
);
const overrides = business.entity_links?.location_overrides ?? {};
for (const file of contract.identity.requiredSaltLakeValleyPages) {
  const text = fs.readFileSync(path.join(repoRoot, file), "utf8");
  if (!text.includes(`https://www.google.com/maps?cid=${slvCid}`)) {
    fail(file, "missing-verified-slv-cid", 1, `Use exact CID ${slvCid} for the verified Salt Lake Valley profile.`);
  }
  if (text.includes(heberCid)) {
    fail(file, "heber-cid-on-verified-slv-page", 1, `Remove Heber CID ${heberCid} from the verified Salt Lake Valley page.`);
  }
  const fileName = path.basename(file);
  const override = overrides[fileName];
  if (override?.hasMap !== `https://www.google.com/maps?cid=${slvCid}`) {
    fail(
      "data/route-factory/business.json",
      `missing-slv-override-for-${fileName}`,
      1,
      `Add the verified Salt Lake Valley hasMap and sameAs override for ${fileName}.`,
    );
  } else {
    const have = new Set(Array.isArray(override.sameAs) ? override.sameAs : []);
    const expected = new Set(contract.identity.saltLakeValleySameAs);
    const missing = [...expected].filter((item) => !have.has(item));
    const extra = [...have].filter((item) => !expected.has(item));
    if (missing.length || extra.length) {
      fail(
        "data/route-factory/business.json",
        `slv-sameas-drift-for-${fileName}`,
        missing.length + extra.length,
        `Use the exact reviewed Salt Lake Valley sameAs set for ${fileName}.`,
      );
    }
  }
}

const summary = {
  checkedPages: contract.targetPages.length,
  failures: failures.length,
  warnings: warnings.length,
  publicMutationStatus: contract.publicMutationStatus,
  mode: strict ? "strict" : "report",
};
if (details) {
  summary.failureDetails = failures;
  summary.warningDetails = warnings;
}
console.log(JSON.stringify(summary, null, 2));

if (strict && failures.length) process.exit(1);
