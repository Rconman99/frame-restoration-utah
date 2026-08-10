#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CLIENT_IP_PROBE_TEMPLATE_PATH,
} from "./render-client-ip-probe.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_ENV_READS = [
  "DENO_DEPLOYMENT_ID",
  "LEAD_NOTIFICATION_WORKER_TOKEN",
];

export function clientIpProbeTemplateViolations(source) {
  const violations = [];
  const requiredFragments = [
    'from "../_shared/client-ip.ts"',
    'const AUTH_CONTEXT = "client-ip-probe-v1"',
    'Deno.env.get("LEAD_NOTIFICATION_WORKER_TOKEN")',
    'Deno.env.get("DENO_DEPLOYMENT_ID")',
    "crypto.subtle.verify",
    "keyedClientIpHash(",
    "`${AUTH_CONTEXT}\\0auth\\0${timestamp}\\0${nonce}\\0${bodySha256}`",
    'return json(401, { error: "unauthorized" });',
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) violations.push(`missing:${fragment}`);
  }
  const envReads = [...source.matchAll(/Deno\.env\.get\(\s*["']([^"']+)["']\s*\)/g)]
    .map((match) => match[1])
    .sort();
  if (JSON.stringify([...new Set(envReads)]) !== JSON.stringify(REQUIRED_ENV_READS)) {
    violations.push(`environment-reads:${[...new Set(envReads)].join(",")}`);
  }
  const allEnvGetCalls = source.match(/Deno\.env\.get\s*\(/g)?.length ?? 0;
  const allDenoEnvReferences = source.match(/Deno\.env/g)?.length ?? 0;
  if (allEnvGetCalls !== envReads.length || allDenoEnvReferences !== 2) {
    violations.push("dynamic-or-nonallowlisted-environment-access");
  }
  for (
    const [label, pattern] of [
      ["intake-secret", /LEAD_INTAKE_RATE_LIMIT_SECRET/],
      ["service-role", /SUPABASE_SERVICE_ROLE_KEY/],
      ["env-to-object", /Deno\.env\.toObject|envToObject/],
      ["probe-specific-secret", /CLIENT_IP_PROBE_(?:TOKEN|HMAC|SECRET)/],
      ["outbound-fetch", /\bfetch\s*\(/],
      ["supabase-client", /createClient|supabase-js/],
      ["raw-identity-read", /identity\.ip/],
      ["runtime-logging", /console\.(?:log|info|warn|error)/],
    ]
  ) {
    if (pattern.test(source)) violations.push(label);
  }
  return violations;
}

export function probeToolViolation(relative, source) {
  if (!/client[-_ ]ip[-_ ]probe|lead[-_ ]intake[-_ ]v1/i.test(source)) {
    return null;
  }
  if (
    relative === "scripts/test-client-ip-deploy-receipt.mjs" ||
    relative === "scripts/audit-client-ip-probe-contract.mjs"
  ) {
    return null;
  }
  const normalized = source
    .replace(/\\\s*/g, " ")
    .replace(/[\/"'`,[\](){}]/g, " ")
    .replace(/\s+/g, " ");
  for (
    const [label, pattern] of [
      ["Supabase access token", /SUPABASE_ACCESS_TOKEN/],
      ["intake secret", /LEAD_INTAKE_RATE_LIMIT_SECRET/],
      ["service-role secret", /SUPABASE_SERVICE_ROLE_KEY/],
      ["environment dump", /Deno\.env\.toObject|envToObject/],
      ["GitHub environment mutation", /GITHUB_ENV/],
      ["JWT bypass", /--no-verify-jwt/],
      [
        "live function mutation",
        /\bsupabase\s+functions\s+(?:deploy|delete)\b/,
      ],
      ["process execution", /node:child_process|\bspawnSync\b|\bexecSync\b/],
    ]
  ) {
    if (pattern.test(label === "live function mutation" ? normalized : source)) {
      return `${relative}:${label}`;
    }
  }
  return null;
}

export function auditClientIpProbeContract({ trackedSources, templateSource }) {
  const violations = clientIpProbeTemplateViolations(templateSource)
    .map((violation) => `${CLIENT_IP_PROBE_TEMPLATE_PATH}:${violation}`);
  for (const [relative, source] of trackedSources) {
    if (
      !relative.startsWith("scripts/") &&
      !relative.startsWith("supabase/probe-templates/")
    ) continue;
    const violation = probeToolViolation(relative, source);
    if (violation) violations.push(violation);
  }
  return violations;
}

function trackedTextSources() {
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

const invokedAsScript = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  const templateSource = fs.readFileSync(
    path.join(root, CLIENT_IP_PROBE_TEMPLATE_PATH),
    "utf8",
  );
  const violations = auditClientIpProbeContract({
    trackedSources: trackedTextSources(),
    templateSource,
  });
  if (violations.length > 0) {
    for (const violation of violations) console.error(`::error::${violation}`);
    process.exit(1);
  }
  console.log(
    "Client-IP probe contract passed: deterministic template, two-name env allowlist, no intake/service-role/env dump, and no live mutation tooling.",
  );
}
