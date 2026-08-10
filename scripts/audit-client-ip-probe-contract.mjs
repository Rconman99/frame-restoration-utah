#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CLIENT_IP_PROBE_TEMPLATE_PATH } from "./render-client-ip-probe.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRUSTED_MANIFEST_PATH = "scripts/client-ip-probe-audit-trusted.json";
const TRUSTED_SOURCE_PATHS = [
  "scripts/audit-client-ip-probe-contract.mjs",
  "scripts/test-client-ip-deploy-receipt.mjs",
  "supabase/functions/handle-lead/DEPLOY.md",
];
const EXPECTED_TEMPLATE_SHA256 =
  "1a45cf1b9d7dcc7ca514ff334b81e93b5024ff45301489c1f4e9ed20535e0c53";
const EXPECTED_DEPLOY_WORKFLOW_SHA256 =
  "31c21349e26413415d9359787821fd0ff56cca9c2f52e00d0f4941a55ee6c824";
const EXPECTED_COMPLIANCE_WORKFLOW_SHA256 =
  "72f10130ffc1fc8faf3b1a0c1eb927ec85a743c61ea8df582020a57d058db08f";
const APPROVED_DEPLOY_FUNCTIONS = [
  "track-click",
  "handle-lead",
  "lead-crm",
  "review-request",
  "handle-call",
  "handle-sms",
  "outbound-call",
  "send-message",
  "resend-webhook",
  "lead-notification-worker",
  "weekly-report",
];
const UTAH_PROJECT_REF = "hdcflshhomzildwqlmwh";
const REQUIRED_ENV_READS = [
  "DENO_DEPLOYMENT_ID",
  "LEAD_NOTIFICATION_WORKER_TOKEN",
];
const EXECUTABLE_OR_CONFIG = /(?:^|\/)\.github\/workflows\/|\.(?:mjs|cjs|js|jsx|ts|tsx|sh|bash|zsh|py|rb|yml|yaml|toml)$/i;
const SENSITIVE_BINARY_PATH = /^(?:scripts|bin|\.github\/actions)(?:\/|$)/;

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requirePlainObject(value, label) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  return value;
}

function skeleton(value) {
  return decodeEscapes(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function decodeEscapes(value) {
  return value
    .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\(?=[A-Za-z])/g, "");
}

function semanticTokens(value) {
  return new Set(
    decodeEscapes(value).toLowerCase().match(/[a-z0-9]+/g) ?? [],
  );
}

function hasTokens(tokens, required) {
  return required.every((token) => tokens.has(token));
}

function hasAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

function hasProbeMarker(value) {
  const compact = skeleton(value);
  const tokens = semanticTokens(value);
  return hasAny(compact, ["clientipprobe", "leadintakev1"]) ||
    hasTokens(tokens, ["client", "ip", "probe"]);
}

function indirectEnvAccessIn(value) {
  const decoded = decodeEscapes(value);
  const tokens = semanticTokens(decoded);
  const bracketGlobal = /\bglobalThis\s*\[/i.test(decoded) &&
    hasTokens(tokens, ["globalthis", "deno", "env", "get"]);
  const reflectGlobal = /\bReflect\s*\.\s*get\s*\(/i.test(decoded) &&
    hasTokens(tokens, ["reflect", "deno", "env", "get"]);
  const alias = decoded.match(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*Deno\s*;/,
  )?.[1];
  const aliasAccess = Boolean(
    alias && new RegExp(
      `\\b${alias.replace(/[$]/g, "\\$")}\\s*\\[\\s*[\"']env[\"']\\s*\\]\\s*\\[\\s*[\"']get[\"']`,
      "i",
    ).test(decoded),
  );
  const destructured =
    /\{\s*env\s*\}\s*=\s*Deno\b[\s\S]{0,256}\benv\s*\.\s*get\s*\(/i
      .test(decoded);
  const bracketDeno =
    /\bDeno\s*\[\s*["']env["']\s*\]\s*\[\s*["']get["']\s*\]/i
      .test(decoded);
  return bracketGlobal || reflectGlobal || aliasAccess || destructured ||
    bracketDeno;
}

export function clientIpProbeTemplateViolations(source) {
  const violations = [];
  if (digest(source) !== EXPECTED_TEMPLATE_SHA256) {
    violations.push("template-sha256-not-reviewed");
  }
  const requiredFragments = [
    'from "../_shared/client-ip.ts"',
    'const AUTH_CONTEXT = "client-ip-probe-v1"',
    'Deno.env.get("LEAD_NOTIFICATION_WORKER_TOKEN")',
    'Deno.env.get("DENO_DEPLOYMENT_ID")',
    "crypto.subtle.verify",
    "keyedClientIpHash(",
    "request.body.getReader()",
    "if (totalBytes > MAX_BODY_BYTES)",
    'return json(401, { error: "unauthorized" });',
    'observed_family: identity.ip.includes(":") ? "ipv6" : "ipv4"',
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) violations.push(`missing:${fragment}`);
  }
  const envReads = [...source.matchAll(/Deno\.env\.get\(\s*["']([^"']+)["']\s*\)/g)]
    .map((match) => match[1]).sort();
  if (JSON.stringify([...new Set(envReads)]) !== JSON.stringify(REQUIRED_ENV_READS)) {
    violations.push(`environment-reads:${[...new Set(envReads)].join(",")}`);
  }
  const sourceSkeleton = skeleton(source);
  for (const [label, needles] of [
    ["intake-secret", ["leadintakeratelimitsecret"]],
    ["service-role", ["supabaseservicerolekey"]],
    ["env-to-object", ["denoenvtoobject", "envtoobject"]],
    ["probe-specific-secret", ["clientipprobetoken", "clientipprobehmac", "clientipprobesecret"]],
    ["outbound-network", [
      "fetch", "denoconnect", "denoconnecttls", "denolisten", "denolistentls",
      "websocket", "eventsource", "nodehttp", "nodehttps", "nodehttp2",
      "nodenet", "nodetls", "nodedgram", "createhttpclient",
    ]],
    ["process-execution", [
      "denocommand", "nodechildprocess", "spawnsync", "execsync", "execfile",
      "subprocess", "ossystem",
    ]],
    ["raw-identity-log", ["consolelog", "consoleinfo", "consolewarn", "consoleerror"]],
    ["unbounded-body-read", ["requesttext", "requestjson"]],
  ]) {
    if (hasAny(sourceSkeleton, needles)) violations.push(label);
  }
  const bodyLimitAt = source.indexOf("if (totalBytes > MAX_BODY_BYTES)");
  const bodyParseAt = source.indexOf("JSON.parse(body)");
  if (bodyLimitAt < 0 || bodyParseAt < 0 || bodyLimitAt > bodyParseAt) {
    violations.push("bounded-body-limit-must-precede-json-parse");
  }
  return [...new Set(violations)];
}

function shellDeployCommands(source) {
  const normalized = source.replace(/\\\r?\n/g, " ");
  const cli = String.raw`(?:(?:npx(?:\s+(?:--yes|-y))?|pnpm\s+(?:dlx|exec)|yarn\s+dlx|bunx)\s+)?(?:[^\s"';&|]*/)?supabase(?:@[^\s"';&|]+)?`;
  return [...normalized.matchAll(
    new RegExp(`${cli}\\s+functions\\s+deploy\\b([^\\n;&|]*)`, "gi"),
  )]
    .map((match) => match[1].trim());
}

function commandTarget(argumentsText) {
  const tokens = argumentsText.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const optionsWithValues = new Set([
    "--project-ref",
    "--workdir",
    "--import-map",
    "--config",
    "--env-file",
    "--dns-resolver",
    "--profile",
    "--jobs",
    "-j",
  ]);
  const booleanOptions = new Set([
    "--debug",
    "--experimental",
    "--no-verify-jwt",
    "--use-api",
  ]);
  const normalizedTokens = tokens.map((token) =>
    token.replace(/^(["'])|(["'])$/g, "")
  );
  for (const protectedTarget of ["handle-lead", "lead-crm"]) {
    if (normalizedTokens.includes(protectedTarget)) {
      return { kind: "protected", target: protectedTarget };
    }
  }
  if (normalizedTokens.includes("client-ip-probe")) {
    return { kind: "probe", target: "client-ip-probe" };
  }
  const positionals = [];
  for (let index = 0; index < normalizedTokens.length; index += 1) {
    const token = normalizedTokens[index];
    if (token.startsWith("--") && token.includes("=")) continue;
    if (optionsWithValues.has(token)) {
      index += 1;
      continue;
    }
    if (booleanOptions.has(token)) continue;
    if (token.startsWith("-")) return { kind: "dynamic", target: token };
    positionals.push(token);
  }
  if (positionals.length === 0) return { kind: "all" };
  const dynamic = positionals.find((target) => /\$|\{\{|inputs\./.test(target));
  if (dynamic) return { kind: "dynamic", target: dynamic };
  return { kind: "other", target: positionals.join(",") };
}

function workflowExecutionControlViolations(label, source) {
  const violations = [];
  if (/\b(?:NODE_OPTIONS|NODE_PATH|BASH_ENV|SHELLOPTS|LD_PRELOAD|DYLD_INSERT_LIBRARIES)\b/i.test(source)) {
    violations.push(`${label} sets or references execution-control environment variables`);
  }
  if (/^\s*(?:defaults|shell|working-directory)\s*:/mi.test(source)) {
    violations.push(`${label} changes shell or working-directory defaults`);
  }
  return violations;
}

function workflowDispatchChoices(source) {
  const functionInputAt = source.indexOf("\n      function:\n");
  const permissionsAt = source.indexOf("\npermissions:\n", functionInputAt);
  if (functionInputAt < 0 || permissionsAt < 0) return [];
  const functionInput = source.slice(functionInputAt, permissionsAt);
  const optionsAt = functionInput.indexOf("\n        options:\n");
  if (optionsAt < 0) return [];
  return [...functionInput.slice(optionsAt).matchAll(/^\s{10}- ([a-z0-9-]+)\s*$/gm)]
    .map((match) => match[1]);
}

export function protectedDeployViolations(relative, source) {
  const violations = [];
  for (const command of shellDeployCommands(source)) {
    const target = commandTarget(command);
    if (target.kind === "all") {
      violations.push(`${relative}:deploy-all bypass`);
    } else if (target.kind === "protected") {
      violations.push(`${relative}:direct protected deploy ${target.target}`);
    } else if (target.kind === "probe") {
      violations.push(`${relative}:direct live probe deploy`);
    } else if (
      target.kind === "dynamic" &&
      relative !== ".github/workflows/deploy-edge-function.yml"
    ) {
      violations.push(`${relative}:dynamic protected-capable deploy`);
    }
  }
  return violations;
}

function approvedDeployWorkflowViolations(source) {
  const violations = [];
  const compact = skeleton(source);
  if (digest(source) !== EXPECTED_DEPLOY_WORKFLOW_SHA256) {
    violations.push("approved deploy workflow exact reviewed source differs");
  }
  violations.push(...workflowExecutionControlViolations("approved deploy workflow", source));
  if (/^\s*-?\s*(?:if|continue-on-error)\s*:/m.test(source)) {
    violations.push("approved deploy workflow has conditional/error bypass");
  }
  if (/npm\s+(?:run|exec).*client[-_:]?ip/i.test(source)) {
    violations.push("approved deploy workflow uses npm indirection for client-IP gate");
  }
  const gate = "run: node scripts/verify-client-ip-deploy-receipt.mjs";
  const gateAt = source.indexOf(gate);
  const deployAt = source.indexOf("supabase functions deploy");
  if (gateAt < 0 || deployAt < 0 || gateAt > deployAt) {
    violations.push("approved deploy workflow lacks direct pre-deploy client-IP gate");
  }
  const targets = shellDeployCommands(source).map(commandTarget);
  if (
    targets.length !== 1 || targets[0].kind !== "dynamic" ||
    !source.includes("type: choice") ||
    JSON.stringify(workflowDispatchChoices(source)) !==
      JSON.stringify(APPROVED_DEPLOY_FUNCTIONS)
  ) {
    violations.push("approved deploy workflow target allowlist/deploy shape differs");
  }
  const allowedShellTargets = APPROVED_DEPLOY_FUNCTIONS.join("|");
  if (
    !source.includes('case "$FUNCTION_NAME" in') ||
    !source.includes(`${allowedShellTargets})`) ||
    !source.includes("Function is not in the reviewed production deploy allowlist")
  ) {
    violations.push("approved deploy workflow lacks the exact runtime target allowlist");
  }
  const expectedCheckout = [
    "      - uses: actions/checkout@v4",
    "        with:",
    "          ref: ${{ github.sha }}",
    "          fetch-depth: 0",
    "          persist-credentials: false",
  ].join("\n");
  if (
    (source.match(/uses:\s*actions\/checkout@/g)?.length ?? 0) !== 1 ||
    !source.includes(expectedCheckout)
  ) {
    violations.push("approved deploy workflow checkout semantics differ");
  }
  const exactDeploy = [
    'supabase functions deploy "${{ inputs.function }}" \\',
    `            --project-ref ${UTAH_PROJECT_REF} \\`,
    "            --no-verify-jwt --use-api",
  ].join("\n");
  if (!source.includes(exactDeploy)) {
    violations.push("approved deploy workflow command/project differs");
  }
  if (
    (compact.match(/supabasefunctionsdeploy/g)?.length ?? 0) !== 1 ||
    hasAny(compact, [
      "supabasefunctionsdelete",
      "supabasesecretsset",
      "supabasesecretsunset",
      "supabaseprojectsdelete",
      "denoconnect",
      "denoconnecttls",
      "denocommand",
      "nodechildprocess",
      "fromcharcode",
      "base64decode",
    ]) ||
    /(?:^|\n)\s*(?:run:\s*)?eval(?:\s|$)|\batob\s*\(|\bFunction\s*\(/.test(source)
  ) {
    violations.push("approved deploy workflow contains extra assembled mutation/runtime tooling");
  }
  return violations;
}

function complianceWorkflowViolations(source) {
  const violations = [];
  const compact = skeleton(source);
  if (digest(source) !== EXPECTED_COMPLIANCE_WORKFLOW_SHA256) {
    violations.push("compliance workflow exact reviewed source differs");
  }
  violations.push(...workflowExecutionControlViolations("compliance workflow", source));
  if (!/paths:\s*\n\s*- ['"]\*\*['"]/.test(source)) {
    violations.push("compliance pull-request trigger is not all-files");
  }
  if (/^\s*-?\s*(?:if|continue-on-error)\s*:/m.test(source)) {
    violations.push("compliance workflow has conditional/error bypass");
  }
  if (!source.includes("run: node scripts/audit-client-ip-probe-contract.mjs")) {
    violations.push("compliance workflow lacks direct scanner invocation");
  }
  if (!source.includes("run: node scripts/test-client-ip-deploy-receipt.mjs")) {
    violations.push("compliance workflow lacks direct receipt-test invocation");
  }
  if (
    (source.match(/uses:\s*actions\/checkout@v4/g)?.length ?? 0) !== 21 ||
    (source.match(/uses:\s*actions\/checkout@/g)?.length ?? 0) !== 21 ||
    /uses:\s*actions\/checkout@v4\s*\n\s+with\s*:/.test(source)
  ) {
    violations.push("compliance workflow checkout semantics differ");
  }
  const dashboardStart = source.indexOf("\n  dashboard-security:\n");
  const dashboardEnd = source.indexOf("\n  relay-classification:\n", dashboardStart);
  const dashboardJob = dashboardStart >= 0 && dashboardEnd > dashboardStart
    ? source.slice(dashboardStart, dashboardEnd)
    : "";
  const scannerAt = dashboardJob.indexOf(
    "run: node scripts/audit-client-ip-probe-contract.mjs",
  );
  const receiptTestAt = dashboardJob.indexOf(
    "run: node scripts/test-client-ip-deploy-receipt.mjs",
  );
  const earlierRepoCommand = dashboardJob.search(
    /run:\s*(?:npm|npx|node|deno|python|ruby|bash|sh)\b/,
  );
  if (
    scannerAt < 0 || receiptTestAt < scannerAt ||
    earlierRepoCommand !== scannerAt
  ) {
    violations.push("compliance client-IP gates are not the first direct repository commands");
  }
  if (/npm\s+(?:run|exec).*client[-_:]?ip/i.test(source)) {
    violations.push("compliance workflow uses npm indirection for client-IP gate");
  }
  if (
    hasAny(compact, [
      "supabasefunctionsdeploy",
      "supabasefunctionsdelete",
      "supabasesecretsset",
      "supabasesecretsunset",
      "denoconnect",
      "denoconnecttls",
      "denocommand",
      "nodechildprocess",
    ]) ||
    /(?:^|\n)\s*(?:run:\s*)?eval(?:\s|$)|\batob\s*\(|\bFunction\s*\(/.test(source)
  ) {
    violations.push("compliance workflow contains mutation/runtime tooling");
  }
  return violations;
}

function trustedSource(trustedDigests, relative, source) {
  return TRUSTED_SOURCE_PATHS.includes(relative) &&
    trustedDigests?.[relative] === digest(source);
}

function scannerSourceViolations(relative, source, trustedDigests) {
  const violations = [];
  if (!trustedSource(trustedDigests, relative, source)) {
    violations.push(`${relative}:scanner source digest is not reviewed`);
  }
  const runtimeStart = source.lastIndexOf("\nfunction trackedSources() {");
  const runtimeEnd = source.indexOf("\nfunction readTrustedManifest() {", runtimeStart);
  const runtime = runtimeStart >= 0 && runtimeEnd > runtimeStart
    ? source.slice(runtimeStart, runtimeEnd)
    : "";
  if (
    (runtime.match(/\bspawnSync\s*\(/g)?.length ?? 0) !== 1 ||
    !runtime.includes('spawnSync("git", ["ls-files", "-s", "-z"]') ||
    /\b(?:execSync|execFile|fork)\s*\(/.test(runtime) ||
    /(?:^|[^\w.])fetch\s*\(/.test(runtime) ||
    /\bDeno\.(?:connect|connectTls|Command)\s*\(/.test(runtime) ||
    /process\.env\b/.test(runtime)
  ) {
    violations.push(`${relative}:scanner runtime capability differs from read-only git inventory`);
  }
  for (const required of [
    "for (const [relative, trackedEntry] of trackedSources)",
    "clientIpProbeTemplateViolations(templateSource)",
    "protectedDeployViolations(relative, source)",
    "TRUSTED_SOURCE_PATHS.includes(relative)",
  ]) {
    if (!source.includes(required)) {
      violations.push(`${relative}:scanner invariant missing ${required}`);
    }
  }
  return violations;
}

function testSourceViolations(relative, source, trustedDigests) {
  const violations = [];
  if (!trustedSource(trustedDigests, relative, source)) {
    violations.push(`${relative}:test source digest is not reviewed`);
  }
  const spawnCount = source.match(/\bspawnSync\s*\(/g)?.length ?? 0;
  const nodeSpawnCount = source.match(/spawnSync\(\s*process\.execPath/g)?.length ?? 0;
  const envReads = [...source.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)]
    .map((match) => match[1]);
  if (
    spawnCount !== 8 || nodeSpawnCount !== 6 ||
    !source.includes('spawnSync("ruby", ["-e", parser') ||
    !source.includes('spawnSync("git", ["ls-files", "-z"]') ||
    envReads.some((name) => name !== "PATH") ||
    /\b(?:execSync|execFile|fork)\s*\(/.test(source) ||
    /(?:^|[^\w.])fetch\s*\(/.test(source)
  ) {
    violations.push(`${relative}:test runtime capability exceeds offline fixture commands`);
  }
  return violations;
}

function runbookSourceViolations(relative, source, trustedDigests) {
  const violations = [];
  if (!trustedSource(trustedDigests, relative, source)) {
    violations.push(`${relative}:runbook source digest is not reviewed`);
  }
  for (const required of [
    "signer-attested-operator-capture",
    "not independently verify",
    "CLIENT_IP_REQUEST_ARTIFACT_MANIFEST_PATH",
    "CLIENT_IP_PROBE_EZBR_CANARY_PATH",
    "non-atomic",
    "authorized maintainer",
    "not self-protecting",
  ]) {
    if (!source.includes(required)) {
      violations.push(`${relative}:runbook invariant missing ${required}`);
    }
  }
  violations.push(...protectedDeployViolations(relative, source));
  return violations;
}

export function probeToolViolations(
  relative,
  source,
  { trustedDigests = {}, fileMode = null } = {},
) {
  if (source === null) {
    const unscannableExecutable =
      (fileMode !== null && !["100644", "100755"].includes(fileMode)) ||
      fileMode === "100755" || EXECUTABLE_OR_CONFIG.test(relative) ||
      SENSITIVE_BINARY_PATH.test(relative);
    return unscannableExecutable
      ? [`${relative}:unscannable binary executable/config`]
      : [];
  }
  if (relative === "scripts/audit-client-ip-probe-contract.mjs") {
    return scannerSourceViolations(relative, source, trustedDigests);
  }
  if (relative === "scripts/test-client-ip-deploy-receipt.mjs") {
    return testSourceViolations(relative, source, trustedDigests);
  }
  if (relative === "supabase/functions/handle-lead/DEPLOY.md") {
    return runbookSourceViolations(relative, source, trustedDigests);
  }
  if (relative === ".github/workflows/deploy-edge-function.yml") {
    return approvedDeployWorkflowViolations(source).map((violation) =>
      `${relative}:${violation}`
    );
  }
  if (relative === ".github/workflows/compliance-gate.yml") {
    return complianceWorkflowViolations(source).map((violation) =>
      `${relative}:${violation}`
    );
  }
  const protectedViolations = protectedDeployViolations(relative, source);
  const combined = skeleton(`${relative}\n${source}`);
  const tokens = semanticTokens(`${relative}\n${source}`);
  if (
    relative.startsWith(".github/workflows/") &&
    hasTokens(tokens, ["functions", "deploy"]) &&
    (hasAny(combined, ["handlelead", "leadcrm"]) ||
      (hasTokens(tokens, ["handle", "lead"]) ||
        hasTokens(tokens, ["lead", "crm"]))) &&
    protectedViolations.length === 0
  ) {
    protectedViolations.push(`${relative}:escaped or assembled protected deploy`);
  }
  const decodedSource = decodeEscapes(source);
  const sourceLines = decodedSource.replace(/\\\r?\n/g, " ").split(/\r?\n/);
  const pathProbeAdjacent = hasProbeMarker(relative);
  const probeRiskSegments = pathProbeAdjacent
    ? sourceLines
    : sourceLines.filter(hasProbeMarker);
  const probeRiskCompacts = probeRiskSegments.map(skeleton);
  const semanticProtectedDeploy = [
    ...decodedSource.matchAll(
      /.{0,160}\bfunctions\b[\s\S]{0,100}\bdeploy\b[\s\S]{0,220}\b(?:handle-lead|lead-crm)\b/gi,
    ),
  ].some((match) =>
    /(?:["']?\$(?:\{)?[A-Za-z_]|\bdocker\s+run\b|\b(?:npx|pnpm|yarn|bunx)\b|\b(?:spawn|exec|subprocess|system)\b|\[[^\]]*["'][^"']+["'][^\]]*\])/i
      .test(match[0])
  );
  const dangerous = [];
  for (const [label, needles] of [
    ["environment enumeration/alias", [
      "denoenvtoobject", "denoenvget", "runtimeenvget", "envget",
      "globalthisdenoenvget", "reflectgetdeno",
    ]],
    ["live function mutation", [
      "supabasefunctionsdeploy", "supabasefunctionsdelete",
    ]],
    ["provider secret mutation", [
      "supabasesecretsset", "supabasesecretsunset",
    ]],
    ["outbound network", [
      "denoconnect", "denoconnecttls", "denolisten", "denolistentls",
      "websocket", "eventsource", "nodehttp", "nodehttps", "nodehttp2",
      "nodenet", "nodetls", "nodedgram", "createhttpclient", "fetch",
    ]],
    ["process execution", [
      "denocommand", "nodechildprocess", "spawnsync", "execsync", "execfile",
      "childprocessexec", "childprocessspawn", "childprocessfork", "subprocess",
      "ossystem", "shelleval",
    ]],
    ["runtime obfuscation", ["fromcharcode", "base64decode", "newfunction"]],
  ]) {
    if (probeRiskCompacts.some((segment) => hasAny(segment, needles))) {
      dangerous.push(label);
    }
  }
  if (probeRiskSegments.some((segment) =>
    /\b(?:eval|atob|Function)\s*\(|\.fromCharCode\s*\(/.test(segment)
  )) {
    dangerous.push("runtime obfuscation");
  }
  const violations = [...protectedViolations];
  if (semanticProtectedDeploy) {
    violations.push(`${relative}:assembled protected deploy command`);
  }
  const providerMutation = probeRiskCompacts.some((segment) => hasAny(segment, [
    "supabasefunctionsdeploy",
    "supabasefunctionsdelete",
    "supabasesecretsset",
    "supabasesecretsunset",
  ]));
  const assembledProviderMutation = sourceLines.some((line) => {
      const lineTokens = semanticTokens(line);
      const providerTokens =
        hasTokens(lineTokens, ["supabase", "functions", "deploy"]) ||
        hasTokens(lineTokens, ["supabase", "functions", "delete"]) ||
        hasTokens(lineTokens, ["supabase", "secrets", "set"]) ||
        hasTokens(lineTokens, ["supabase", "secrets", "unset"]);
      return (pathProbeAdjacent || hasProbeMarker(line)) && providerTokens &&
        /\b(?:join|reverse|concat)\s*\(|\[[^\]]*["'][^"']+["'][^\]]*\]/i
          .test(line);
    });
  const indirectEnvAccess = indirectEnvAccessIn(decodedSource);
  const probeIndirectEnvAccess = pathProbeAdjacent
    ? indirectEnvAccess
    : probeRiskSegments.some(indirectEnvAccessIn);
  const constructedRestrictedEnv = indirectEnvAccess &&
    (hasTokens(tokens, ["lead", "intake", "rate", "limit", "secret"]) ||
      hasTokens(tokens, ["supabase", "service", "role", "key"]));
  if (
    providerMutation || assembledProviderMutation
  ) {
    violations.push(`${relative}:assembled protected/probe mutation capability`);
  }
  if (constructedRestrictedEnv) {
    violations.push(`${relative}:constructed restricted environment access`);
  }
  if (probeIndirectEnvAccess) {
    violations.push(`${relative}:indirect probe environment access`);
  }
  if (
    probeRiskSegments.some((segment) => {
      const segmentCompact = skeleton(segment);
      return hasAny(segmentCompact, ["denoconnect", "denoconnecttls"]);
    })
  ) {
    violations.push(`${relative}:indirect probe network access`);
  }
  if (dangerous.length > 0) {
    violations.push(`${relative}:probe-adjacent ${dangerous.join(",")}`);
  }
  if (
    relative === "package.json" &&
    hasAny(combined, ["preauditclientipprobe", "postauditclientipprobe"])
  ) {
    violations.push(`${relative}:npm lifecycle hook can bypass client-IP audit`);
  }
  return [...new Set(violations)];
}

export function probeToolViolation(relative, source, options) {
  return probeToolViolations(relative, source, options)[0] ?? null;
}

export function auditClientIpProbeContract({
  trackedSources,
  templateSource,
  trustedDigests = {},
}) {
  const violations = clientIpProbeTemplateViolations(templateSource)
    .map((violation) => `${CLIENT_IP_PROBE_TEMPLATE_PATH}:${violation}`);
  for (const [relative, trackedEntry] of trackedSources) {
    const source = trackedEntry && typeof trackedEntry === "object"
      ? trackedEntry.source
      : trackedEntry;
    const fileMode = trackedEntry && typeof trackedEntry === "object"
      ? trackedEntry.fileMode
      : null;
    if (relative === CLIENT_IP_PROBE_TEMPLATE_PATH) continue;
    violations.push(...probeToolViolations(relative, source, {
      trustedDigests,
      fileMode,
    }));
  }
  return [...new Set(violations)];
}

function trackedSources() {
  const result = spawnSync("git", ["ls-files", "-s", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const sources = new Map();
  for (const record of result.stdout.split("\0").filter(Boolean)) {
    const match = record.match(/^(\d{6}) [0-9a-f]+ \d\t([\s\S]+)$/);
    assert(match, `invalid git index record: ${record}`);
    const [, fileMode, relative] = match;
    let source = null;
    if (fileMode === "100644" || fileMode === "100755") {
      const contents = fs.readFileSync(path.join(root, relative));
      source = contents.includes(0) ? null : contents.toString("utf8");
    }
    sources.set(relative, { source, fileMode });
  }
  return sources;
}

function readTrustedManifest() {
  const value = JSON.parse(fs.readFileSync(path.join(root, TRUSTED_MANIFEST_PATH), "utf8"));
  assert.deepEqual(Object.keys(value).sort(), ["files", "manifest_version"]);
  assert.equal(value.manifest_version, 1);
  const files = requirePlainObject(value.files, "client-IP trusted-source manifest");
  assert.deepEqual(Object.keys(files).sort(), [...TRUSTED_SOURCE_PATHS].sort());
  for (const [relative, expectedDigest] of Object.entries(files)) {
    assert.match(expectedDigest, /^[0-9a-f]{64}$/);
    assert.equal(typeof relative, "string");
  }
  return files;
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  const templateSource = fs.readFileSync(
    path.join(root, CLIENT_IP_PROBE_TEMPLATE_PATH),
    "utf8",
  );
  const violations = auditClientIpProbeContract({
    trackedSources: trackedSources(),
    templateSource,
    trustedDigests: readTrustedManifest(),
  });
  if (violations.length > 0) {
    for (const violation of violations) console.error(`::error::${violation}`);
    process.exit(1);
  }
  console.log(
    "Client-IP probe contract passed: exact template, repo-wide scanner, protected-deploy parser, and direct all-PR compliance gate.",
  );
}
