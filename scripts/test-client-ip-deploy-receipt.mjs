#!/usr/bin/env node

// Keep both receipt systems behind the blocking dashboard-security entrypoint.
await import("./test-owner-notification-deploy-receipt.mjs");

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  auditClientIpProbeContract,
  clientIpProbeTemplateViolations,
  probeToolViolations,
  protectedDeployViolations,
} from "./audit-client-ip-probe-contract.mjs";
import {
  assertDisjointArtifactRoots,
  capturedClientIpProbeManifest,
  CLIENT_IP_EXTRACTOR_PATH,
  CLIENT_IP_PROBE_TEMPLATE_PATH,
  expectedClientIpProbeArtifacts,
} from "./render-client-ip-probe.mjs";
import {
  issueClientIpDeployReceipt,
  signClientIpDeployReceipt,
  verifyClientIpDeployReceipt,
} from "./verify-client-ip-deploy-receipt.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const extractorSource = read(CLIENT_IP_EXTRACTOR_PATH);
const probeTemplateSource = read(CLIENT_IP_PROBE_TEMPLATE_PATH);
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SHA = "f".repeat(40);
const PROJECT_REF = "hdcflshhomzildwqlmwh";
const PROBE_ID = "11111111-2222-4333-8aaa-555555555555";
const PROBE_VERSION = 7;
const DEPLOYMENT_ID = `${PROJECT_REF}_${PROBE_ID}_${PROBE_VERSION}`;
const HMAC_KEY = "test-client-ip-receipt-hmac-key-at-least-32-bytes";
const NOW = new Date();
const EZBR_BYTES = Buffer.from("fixture-ezbr-bundle-bytes\0binary\xff", "latin1");
const EZBR_SHA256 = crypto.createHash("sha256").update(EZBR_BYTES).digest("hex");
const IPV4_FINGERPRINT = "1".repeat(64);
const IPV6_FINGERPRINT = "2".repeat(64);
const artifacts = expectedClientIpProbeArtifacts({
  deploySha: SHA,
  templateSource: probeTemplateSource,
  extractorSource,
});

function write0600(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, value, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return filePath;
}

function writeJson0600(filePath, value) {
  return write0600(filePath, JSON.stringify(value));
}

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

function copyArtifactTree(renderRoot, capturedRoot) {
  for (const relative of [
    "supabase/functions/_shared/client-ip.ts",
    "supabase/functions/client-ip-probe/index.ts",
  ]) {
    const target = path.join(capturedRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.copyFileSync(path.join(renderRoot, relative), target);
    fs.chmodSync(target, 0o600);
  }
}

function functionCapture(capturedAt, functions, probeEzbrSha256) {
  return {
    capture_version: 1,
    captured_at: capturedAt,
    project_ref: PROJECT_REF,
    capture_method:
      "operator-captured-supabase-functions-list-and-management-api-bundle",
    functions,
    probe_ezbr_sha256: probeEzbrSha256,
  };
}

function secretCapture(capturedAt, secrets) {
  return {
    capture_version: 1,
    captured_at: capturedAt,
    project_ref: PROJECT_REF,
    capture_method: "operator-captured-supabase-secrets-list",
    secrets,
  };
}

function computeCapture(capturedAt, droplets, createdDropletId) {
  return {
    capture_version: 1,
    captured_at: capturedAt,
    capture_method: "operator-captured-digitalocean-droplets",
    droplets,
    created_droplet_id: createdDropletId,
  };
}

function buildRawArtifacts(tempRoot, now = NOW) {
  const at = (seconds) => new Date(now.getTime() + seconds * 1000).toISOString();
  const renderRoot = path.join(tempRoot, "render-root");
  const capturedSourceRoot = path.join(tempRoot, "captured-source-root");
  fs.mkdirSync(renderRoot, { mode: 0o700 });
  fs.mkdirSync(capturedSourceRoot, { mode: 0o700 });
  const render = spawnSync(
    process.execPath,
    [
      "scripts/render-client-ip-probe.mjs",
      "--deploy-sha",
      SHA,
      "--render-root",
      renderRoot,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(render.status, 0, render.stderr);
  copyArtifactTree(renderRoot, capturedSourceRoot);

  const baseFunctions = [
    {
      slug: "handle-lead",
      id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
      version: 10,
      status: "ACTIVE",
      verify_jwt: false,
    },
    {
      slug: "lead-crm",
      id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
      version: 8,
      status: "ACTIVE",
      verify_jwt: false,
    },
  ];
  const probe = {
    slug: "client-ip-probe",
    id: PROBE_ID,
    version: PROBE_VERSION,
    status: "ACTIVE",
    verify_jwt: false,
    ezbr_sha256: EZBR_SHA256,
  };
  const canaryFunctions = [...baseFunctions, probe];
  const secrets = [
    {
      name: "LEAD_NOTIFICATION_WORKER_TOKEN",
      value: "3".repeat(64),
      updated_at: at(-1300),
    },
    {
      name: "LEAD_INTAKE_RATE_LIMIT_SECRET",
      value: "4".repeat(64),
      updated_at: at(-1290),
    },
  ];
  const baseDroplets = [{ id: "4001", name: "unrelated-existing-runner" }];
  const createdDroplet = { id: "9001", name: "utah-client-ip-ephemeral" };
  const files = {
    functionsPre: writeJson0600(
      path.join(tempRoot, "functions-pre.json"),
      functionCapture(at(-1170), baseFunctions, null),
    ),
    functionsCanary: writeJson0600(
      path.join(tempRoot, "functions-canary.json"),
      functionCapture(at(-1100), canaryFunctions, EZBR_SHA256),
    ),
    functionsRecheck: writeJson0600(
      path.join(tempRoot, "functions-recheck.json"),
      functionCapture(at(-900), canaryFunctions, EZBR_SHA256),
    ),
    functionsPost: writeJson0600(
      path.join(tempRoot, "functions-post.json"),
      functionCapture(at(-840), baseFunctions, null),
    ),
    ezbrCanary: write0600(
      path.join(tempRoot, "probe-canary.ezbr"),
      EZBR_BYTES,
    ),
    ezbrRecheck: write0600(
      path.join(tempRoot, "probe-delete-recheck.ezbr"),
      EZBR_BYTES,
    ),
    secretsPre: writeJson0600(
      path.join(tempRoot, "secrets-pre.json"),
      secretCapture(at(-1160), secrets),
    ),
    secretsCanary: writeJson0600(
      path.join(tempRoot, "secrets-canary.json"),
      secretCapture(at(-1090), secrets),
    ),
    secretsRecheck: writeJson0600(
      path.join(tempRoot, "secrets-recheck.json"),
      secretCapture(at(-895), secrets),
    ),
    secretsPost: writeJson0600(
      path.join(tempRoot, "secrets-post.json"),
      secretCapture(at(-830), secrets),
    ),
    computePre: writeJson0600(
      path.join(tempRoot, "compute-pre.json"),
      computeCapture(at(-1190), baseDroplets, null),
    ),
    computeCreated: writeJson0600(
      path.join(tempRoot, "compute-created.json"),
      computeCapture(at(-1180), [...baseDroplets, createdDroplet], "9001"),
    ),
    computePost: writeJson0600(
      path.join(tempRoot, "compute-post.json"),
      computeCapture(at(-820), baseDroplets, null),
    ),
  };

  const requestPaths = {};
  let requestOffset = -1000;
  for (const caseId of [
    "ipv4-baseline",
    "ipv4-forged-cf",
    "ipv4-forged-x-real-ip",
    "ipv4-forged-x-forwarded-for",
    "ipv6-baseline",
    "ipv6-forged-cf",
    "ipv6-forged-x-real-ip",
    "ipv6-forged-x-forwarded-for",
  ]) {
    const family = caseId.startsWith("ipv4-") ? "ipv4" : "ipv6";
    const caseRoot = path.join(tempRoot, "requests", caseId);
    const requestAt = now.getTime() + requestOffset * 1000;
    const forgedHeaders = {
      "cf-connecting-ip": null,
      "x-real-ip": null,
      "x-forwarded-for": null,
    };
    if (caseId.endsWith("forged-cf")) {
      forgedHeaders["cf-connecting-ip"] = family === "ipv4"
        ? "198.51.100.77"
        : "2001:db8::77";
    } else if (caseId.endsWith("forged-x-real-ip")) {
      forgedHeaders["x-real-ip"] = family === "ipv4"
        ? "198.51.100.78"
        : "2001:db8::78";
    } else if (caseId.endsWith("forged-x-forwarded-for")) {
      forgedHeaders["x-forwarded-for"] = family === "ipv4"
        ? "198.51.100.79"
        : "2001:db8::79";
    }
    const body = JSON.stringify({ case_id: caseId });
    requestPaths[caseId] = {
      request_path: writeJson0600(path.join(caseRoot, "request.json"), {
        artifact_version: 1,
        method: "POST",
        url_function_slug: "client-ip-probe",
        transport_family: family,
        body_utf8: body,
        body_sha256: crypto.createHash("sha256")
          .update(body).digest("hex"),
        headers: {
          "content-type": "application/json",
          "x-frame-probe-timestamp": String(requestAt),
          "x-frame-probe-nonce": `nonce-${caseId}-fixture`,
          "x-frame-probe-signature": "a".repeat(64),
          ...forgedHeaders,
        },
      }),
      status_path: writeJson0600(path.join(caseRoot, "status.json"), {
        status: 200,
        observed_at: new Date(requestAt + 100).toISOString(),
      }),
      response_path: writeJson0600(path.join(caseRoot, "response.json"), {
        ok: true,
        case_id: caseId,
        target_source_sha: SHA,
        deployment_id: DEPLOYMENT_ID,
        source: "cf-connecting-ip",
        observed_family: family,
        fingerprint: family === "ipv4"
          ? IPV4_FINGERPRINT
          : IPV6_FINGERPRINT,
      }),
    };
    requestOffset += 1;
  }
  for (const caseId of ["missing-signature", "invalid-signature"]) {
    const caseRoot = path.join(tempRoot, "requests", caseId);
    const requestAt = now.getTime() + requestOffset * 1000;
    const body = JSON.stringify({ case_id: "ipv4-baseline" });
    requestPaths[caseId] = {
      request_path: writeJson0600(path.join(caseRoot, "request.json"), {
        artifact_version: 1,
        method: "POST",
        url_function_slug: "client-ip-probe",
        transport_family: "ipv4",
        body_utf8: body,
        body_sha256: crypto.createHash("sha256")
          .update(body).digest("hex"),
        headers: {
          "content-type": "application/json",
          "x-frame-probe-timestamp": String(requestAt),
          "x-frame-probe-nonce": `nonce-${caseId}-fixture`,
          "x-frame-probe-signature": caseId === "missing-signature"
            ? null
            : "0".repeat(64),
          "cf-connecting-ip": null,
          "x-real-ip": null,
          "x-forwarded-for": null,
        },
      }),
      status_path: writeJson0600(path.join(caseRoot, "status.json"), {
        status: 401,
        observed_at: new Date(requestAt + 100).toISOString(),
      }),
      response_path: write0600(
        path.join(caseRoot, "response.json"),
        '{"error":"unauthorized"}',
      ),
    };
    requestOffset += 1;
  }
  files.requestManifest = writeJson0600(
    path.join(tempRoot, "request-artifacts.json"),
    { artifact_version: 1, requests: requestPaths },
  );
  files.operatorAttestation = writeJson0600(
    path.join(tempRoot, "operator-attestation.json"),
    {
      attestation_version: 1,
      exclusive_mutation_window: true,
      exclusive_window_started_at: at(-1200),
      probe_deleted_at: at(-850),
      exclusive_window_ended_at: at(-810),
      delete_scope: "literal-slug-only",
      deletion_target: "client-ip-probe",
      probe_secret_mutation_performed: false,
    },
  );
  return {
    files,
    requestPaths,
    renderRoot,
    capturedSourceRoot,
    artifactPaths: {
      functions_pre_path: files.functionsPre,
      functions_canary_path: files.functionsCanary,
      functions_delete_recheck_path: files.functionsRecheck,
      functions_post_path: files.functionsPost,
      probe_ezbr_canary_path: files.ezbrCanary,
      probe_ezbr_delete_recheck_path: files.ezbrRecheck,
      secrets_pre_path: files.secretsPre,
      secrets_canary_path: files.secretsCanary,
      secrets_delete_recheck_path: files.secretsRecheck,
      secrets_post_path: files.secretsPost,
      compute_pre_path: files.computePre,
      compute_created_path: files.computeCreated,
      compute_post_path: files.computePost,
      render_root: renderRoot,
      captured_source_root: capturedSourceRoot,
      request_artifact_manifest_path: files.requestManifest,
      operator_attestation_path: files.operatorAttestation,
    },
  };
}

function issue(raw) {
  return issueClientIpDeployReceipt({
    deploySha: SHA,
    projectRef: PROJECT_REF,
    extractorSource,
    probeTemplateSource,
    artifactPaths: raw.artifactPaths,
    receiptHmacKey: HMAC_KEY,
    now: NOW,
  });
}

function verifyPayload(payload, now = NOW) {
  return verifyClientIpDeployReceipt({
    functionName: "handle-lead",
    deploySha: SHA,
    projectRef: PROJECT_REF,
    extractorSource,
    probeTemplateSource,
    receiptToken: signClientIpDeployReceipt(payload, HMAC_KEY),
    receiptHmacKey: HMAC_KEY,
    now,
  });
}

function withJsonMutation(filePath, mutate, assertion) {
  const original = fs.readFileSync(filePath);
  const value = JSON.parse(original.toString("utf8"));
  mutate(value);
  writeJson0600(filePath, value);
  try {
    assertion();
  } finally {
    write0600(filePath, original);
  }
}

assert.equal(clientIpProbeTemplateViolations(probeTemplateSource).length, 0);
assert.equal(probeTemplateSource.includes("request.text()"), false);
assert(
  probeTemplateSource.indexOf("if (totalBytes > MAX_BODY_BYTES)") <
    probeTemplateSource.indexOf("JSON.parse(body)"),
  "streaming byte limit must execute before JSON parsing",
);
for (const unsafe of [
  'globalThis["Deno"]["env"]["get"](["LEAD","INTAKE","RATE","LIMIT","SECRET"].join("_"))',
  'const runtime = Deno; runtime["env"]["get"]("EXTRA_SECRET")',
  'const { env } = Deno; env.get("EXTRA_SECRET")',
  'Reflect.get(globalThis, "Deno")["connect"]({ hostname: "x", port: 443 })',
  'Deno["connectTls"]({ hostname: "x", port: 443 })',
  'import("node:" + "net")',
  'new WebSocket("wss://example.com")',
  'request.text()',
]) {
  assert.notEqual(
    clientIpProbeTemplateViolations(`${probeTemplateSource}\n${unsafe}`).length,
    0,
    `template bypass evaded exact source pin: ${unsafe}`,
  );
}

for (const [relative, source] of [
  ["ops/runner.mjs", '["client","ip","probe"].join("-"); ["supabase","functions","deploy"].join(" ")'],
  ["probe-runner.mjs", '["client","ip","probe"].join("-"); Deno.connect({hostname:"x",port:1})'],
  ["ops/client-ip-probe-env.mjs", 'const runtime = Deno; runtime["env"]["get"]("EXTRA_SECRET")'],
  ["ops/client-ip-probe-global.mjs", 'globalThis["Deno"]["env"]["get"](["LEAD","INTAKE","RATE","LIMIT","SECRET"].join("_"))'],
  ["ops/reordered.mjs", 'const c="probe",i="ip",l="client"; const slug=[l,i,c].join("-"); const cp=await import("node:"+"child_"+"process"); cp.execFileSync("supabase",["functions","deploy",slug])'],
  ["ops/unicode.mjs", 'const slug="client\\u002dip\\u002dprobe"; Deno["con"+"nect"]({hostname:"x",port:1})'],
  ["ops/reordered-env.mjs", 'const parts=["get","env","Deno","globalThis"]; const name=["LEAD","INTAKE","RATE","LIMIT","SECRET"].join("_"); globalThis[parts[2]][parts[1]][parts[0]](name)'],
  ["data/unsafe.py", 'marker="client"+"ip"+"probe"; subprocess.run(["supabase","functions","delete"])'],
  ["ops/runner", 'marker="client"+"ip"+"probe"; subprocess.run(["supabase","functions","delete"])'],
  ["ops/runner.txt", 'marker="client"+"ip"+"probe"; subprocess.run(["supabase","functions","delete"])'],
  [".github/workflows/unsafe.yml", "run: supabase functions deploy --project-ref project handle-lead"],
  [".github/other/unsafe.yaml", "run: supabase functions deploy --use-api lead-crm"],
  [".github/workflows/deploy-all.yml", "run: supabase functions deploy --project-ref project --use-api"],
  [".github/workflows/escaped.yml", "run: supabase functions deplo\\y handle-lead"],
  [".github/workflows/npx-versioned.yml", "run: npx --yes supabase@2.113.0 functions deploy handle-lead --project-ref hdcflshhomzildwqlmwh"],
  [".github/workflows/cli-variable.yml", 'run: CLI=supabase; "$CLI" functions deploy handle-lead --project-ref hdcflshhomzildwqlmwh'],
  [".github/workflows/cli-split.yml", 'run: A=supa; B=base; "$A$B" functions deploy handle-lead --project-ref hdcflshhomzildwqlmwh'],
  [".github/workflows/docker-cli.yml", "run: docker run supabase/cli:2.113.0 functions deploy handle-lead --project-ref hdcflshhomzildwqlmwh"],
  ["ops/reversed-command.txt", 'const command=["deploy","functions","supabase"].reverse().join(" "); const slug=["probe","ip","client"].reverse().join("-")'],
]) {
  const violations = auditClientIpProbeContract({
    trackedSources: new Map([[relative, source]]),
    templateSource: probeTemplateSource,
  });
  assert.notEqual(violations.length, 0, `${relative} evaded repo-wide scanner`);
}
for (const source of [
  'CLI=supabase; "$CLI" functions deploy handle-lead --project-ref hdcflshhomzildwqlmwh',
  'A=supa; B=base; "$A$B" functions deploy handle-lead --project-ref hdcflshhomzildwqlmwh',
  "docker run supabase/cli:2.113.0 functions deploy lead-crm --project-ref hdcflshhomzildwqlmwh",
]) {
  const violations = auditClientIpProbeContract({
    trackedSources: new Map([
      ["scripts/unsafe.sh", source],
      [".github/workflows/invoke-unsafe.yml", "run: bash scripts/unsafe.sh"],
    ]),
    templateSource: probeTemplateSource,
  });
  assert.notEqual(
    violations.length,
    0,
    `script-indirected protected deploy evaded scanner: ${source}`,
  );
}
assert.notEqual(
  auditClientIpProbeContract({
    trackedSources: new Map([["ops/unsafe.mjs", null]]),
    templateSource: probeTemplateSource,
  }).length,
  0,
  "binary executable/config evaded scanner",
);
for (const relative of [
  "scripts/deployer",
  "bin/client-ip-probe",
  ".github/actions/deploy/tool",
]) {
  assert.notEqual(
    probeToolViolations(relative, null).length,
    0,
    `${relative} binary path evaded scanner`,
  );
}
assert.notEqual(
  probeToolViolations("ops/deployer", null, { fileMode: "100755" }).length,
  0,
  "tracked executable binary mode evaded scanner",
);
const untrustedPath = "ops/client-ip-probe-trusted-smuggle.mjs";
const untrustedSource = "Deno.connect({hostname:'x',port:1})";
const untrustedDigest = crypto.createHash("sha256")
  .update(untrustedSource).digest("hex");
assert.notEqual(
  auditClientIpProbeContract({
    trackedSources: new Map([[untrustedPath, untrustedSource]]),
    templateSource: probeTemplateSource,
    trustedDigests: { [untrustedPath]: untrustedDigest },
  }).length,
  0,
  "arbitrary path entered the trusted-source allowlist",
);
for (const fixture of [
  "supabase functions deploy --project-ref p handle-lead",
  "supabase functions deploy --use-api lead-crm",
  "supabase functions deploy --project-ref p --use-api",
  "supabase functions deploy --dns-resolver native handle-lead --project-ref p",
  "supabase functions deploy --profile production lead-crm --project-ref p",
  "supabase functions deploy --jobs 1 handle-lead --project-ref p",
  "supabase functions deploy -j 1 handle-lead --project-ref p",
  "supabase functions deploy track-click handle-lead --project-ref p",
  "supabase functions deploy review-request lead-crm --project-ref p",
  "supabase functions deploy --profile production --project-ref p",
  "npx --yes supabase@2.113.0 functions deploy handle-lead --project-ref p",
]) {
  assert.notEqual(
    protectedDeployViolations(".github/workflows/unsafe.yml", fixture).length,
    0,
    `protected deploy parser missed ${fixture}`,
  );
}

const deployWorkflowSource = read(".github/workflows/deploy-edge-function.yml");
assert.deepEqual(
  probeToolViolations(".github/workflows/deploy-edge-function.yml", deployWorkflowSource),
  [],
);
for (const [label, source] of [
  ["job if", deployWorkflowSource.replace("    runs-on: ubuntu-latest", "    if: true\n    runs-on: ubuntu-latest")],
  ["continue on error", deployWorkflowSource.replace("    runs-on: ubuntu-latest", "    continue-on-error: true\n    runs-on: ubuntu-latest")],
  ["npm indirection", deployWorkflowSource.replace("run: node scripts/verify-client-ip-deploy-receipt.mjs", "run: npm run test:client-ip-receipt")],
  ["flags before protected", deployWorkflowSource.replace('supabase functions deploy "${{ inputs.function }}"', "supabase functions deploy --project-ref hdcflshhomzildwqlmwh handle-lead")],
  ["deploy all", deployWorkflowSource.replace('supabase functions deploy "${{ inputs.function }}"', "supabase functions deploy --project-ref hdcflshhomzildwqlmwh")],
  ["assembled extra deploy", `${deployWorkflowSource}\n# ["supabase","functions","deploy"].join(" ")`],
  ["assembled network", `${deployWorkflowSource}\n# ["Deno","connect"].join(".")`],
  ["probe choice", deployWorkflowSource.replace("          - handle-lead", "          - client-ip-probe\n          - handle-lead")],
  ["project swap", deployWorkflowSource.replace("--project-ref hdcflshhomzildwqlmwh", "--project-ref attackerprojectref")],
  ["checkout ref swap", deployWorkflowSource.replace("ref: ${{ github.sha }}", "ref: refs/heads/attacker")],
  ["node options", `${deployWorkflowSource}\nenv:\n  NODE_OPTIONS: --require ./scripts/exit-zero.cjs`],
  ["node path", `${deployWorkflowSource}\nenv:\n  NODE_PATH: ./scripts`],
  ["workflow defaults", `${deployWorkflowSource}\ndefaults:\n  run:\n    shell: bash {0} || true`],
  ["custom shell", deployWorkflowSource.replace("    runs-on: ubuntu-latest", "    runs-on: ubuntu-latest\n    defaults:\n      run:\n        shell: bash {0} || true")],
  ["working directory", deployWorkflowSource.replace("    runs-on: ubuntu-latest", "    runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: scripts")],
  ["secret set", `${deployWorkflowSource}\n# supabase secrets set CLIENT_IP_PROBE_SECRET=x`],
]) {
  assert.notEqual(
    probeToolViolations(".github/workflows/deploy-edge-function.yml", source).length,
    0,
    `${label} workflow bypass passed scanner`,
  );
}
assert.notEqual(
  probeToolViolations("package.json", '{"scripts":{"preaudit:client-ip-probe":"true"}}').length,
  0,
  "npm lifecycle bypass passed scanner",
);

const complianceSource = read(".github/workflows/compliance-gate.yml");
assert.deepEqual(
  probeToolViolations(".github/workflows/compliance-gate.yml", complianceSource),
  [],
);
for (const source of [
  complianceSource.replace("      - name: Reject unsafe client-IP", "      - if: false\n      - name: Reject unsafe client-IP"),
  complianceSource.replace("run: node scripts/audit-client-ip-probe-contract.mjs", "continue-on-error: true\n        run: node scripts/audit-client-ip-probe-contract.mjs"),
  complianceSource.replace("run: node scripts/audit-client-ip-probe-contract.mjs", "run: npm run audit:client-ip-probe"),
  complianceSource.replace("      - '**'\n", ""),
  `${complianceSource}\n# ["supabase","functions","deploy"].join(" ")`,
  complianceSource.replace("      - uses: actions/checkout@v4", "      - uses: actions/checkout@v4\n        with:\n          ref: refs/heads/attacker"),
  `${complianceSource}\nenv:\n  NODE_OPTIONS: --require ./scripts/exit-zero.cjs`,
  `${complianceSource}\nenv:\n  NODE_PATH: ./scripts`,
  `${complianceSource}\ndefaults:\n  run:\n    shell: bash {0} || true`,
  complianceSource.replace("    runs-on: ubuntu-latest", "    runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: scripts"),
]) {
  assert.notEqual(
    probeToolViolations(".github/workflows/compliance-gate.yml", source).length,
    0,
    "compliance workflow bypass passed scanner",
  );
}

let validPayload;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ut-client-ip-v2-hardening-"));
try {
  const raw = buildRawArtifacts(tempRoot);
  const verifyCaptured = spawnSync(
    process.execPath,
    [
      "scripts/render-client-ip-probe.mjs",
      "--deploy-sha",
      SHA,
      "--render-root",
      raw.renderRoot,
      "--verify-captured-source-root",
      raw.capturedSourceRoot,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(verifyCaptured.status, 0, verifyCaptured.stderr);
  const sourceReceipt = JSON.parse(verifyCaptured.stdout);
  assert.equal(
    sourceReceipt.operator_captured_source_manifest_sha256,
    artifacts.sourceManifestSha256,
  );
  assert.equal(sourceReceipt.render_and_capture_roots_disjoint, true);
  assert.equal(sourceReceipt.artifact_files_inode_disjoint, true);
  assert.throws(
    () => assertDisjointArtifactRoots(raw.renderRoot, raw.renderRoot),
    /disjoint/,
  );
  const rootAlias = path.join(tempRoot, "captured-alias");
  fs.symlinkSync(raw.capturedSourceRoot, rootAlias);
  assert.throws(() => assertDisjointArtifactRoots(raw.renderRoot, rootAlias), /real existing/);
  fs.unlinkSync(rootAlias);
  const nestedRoot = path.join(raw.renderRoot, "nested");
  fs.mkdirSync(nestedRoot);
  assert.throws(
    () => assertDisjointArtifactRoots(raw.renderRoot, nestedRoot),
    /ENOENT|ancestry|disjoint/,
  );
  const parentSymlinkRoot = path.join(tempRoot, "parent-symlink-root");
  fs.mkdirSync(parentSymlinkRoot);
  fs.symlinkSync(path.join(raw.capturedSourceRoot, "supabase"), path.join(parentSymlinkRoot, "supabase"));
  assert.throws(
    () => capturedClientIpProbeManifest(parentSymlinkRoot),
    /ancestry.*real directories/,
  );
  const hardlinkRoot = path.join(tempRoot, "hardlink-root");
  fs.mkdirSync(path.join(hardlinkRoot, "supabase/functions/client-ip-probe"), { recursive: true });
  fs.mkdirSync(path.join(hardlinkRoot, "supabase/functions/_shared"), { recursive: true });
  const renderedWrapper = path.join(raw.renderRoot, "supabase/functions/client-ip-probe/index.ts");
  const hardlinkedWrapper = path.join(hardlinkRoot, "supabase/functions/client-ip-probe/index.ts");
  fs.linkSync(renderedWrapper, hardlinkedWrapper);
  fs.copyFileSync(
    path.join(raw.renderRoot, "supabase/functions/_shared/client-ip.ts"),
    path.join(hardlinkRoot, "supabase/functions/_shared/client-ip.ts"),
  );
  fs.chmodSync(path.join(hardlinkRoot, "supabase/functions/_shared/client-ip.ts"), 0o600);
  assert.throws(
    () => assertDisjointArtifactRoots(raw.renderRoot, hardlinkRoot),
    /hard-link/,
  );
  fs.unlinkSync(hardlinkedWrapper);

  const capturedWrapper = path.join(
    raw.capturedSourceRoot,
    "supabase/functions/client-ip-probe/index.ts",
  );
  const renderedWrapperOriginal = fs.readFileSync(renderedWrapper);
  fs.appendFileSync(renderedWrapper, "// render drift\n");
  assert.throws(() => issue(raw), /rendered or operator-captured source differs/);
  write0600(renderedWrapper, renderedWrapperOriginal);
  const originalWrapper = fs.readFileSync(capturedWrapper);
  fs.appendFileSync(capturedWrapper, "// drift\n");
  assert.throws(() => issue(raw), /captured source differs/);
  write0600(capturedWrapper, originalWrapper);

  const issued = issue(raw);
  validPayload = structuredClone(issued.payload);
  assert.equal(issued.payload.receipt_version, 2);
  assert.equal(issued.payload.probe_function.status, "ACTIVE");
  assert.equal(
    issued.payload.source_binding.artifact_provenance_scope,
    "signer-attested-operator-capture",
  );
  assert.equal(
    issued.payload.source_binding.platform_origin_independently_verified,
    false,
  );
  assert.deepEqual(issued.payload.ci_trust_boundary, {
    integrity_basis: "authorized-human-review-and-exact-sha-verification",
    authorized_human_review_and_merge_required: true,
    authorized_maintainer_ci_mutation_self_protected: false,
    external_branch_protection_independently_verified: false,
  });
  assert.equal(
    issued.payload.metadata_integrity.ephemeral_compute_created_then_absent,
    true,
  );
  assert.equal(
    issued.payload.mutation_control.deletion_atomicity,
    "non-atomic-slug-delete-after-exact-tuple-recheck",
  );
  assert.equal(JSON.stringify(issued.payload).includes(IPV4_FINGERPRINT), false);
  assert.equal(JSON.stringify(issued.payload).includes(IPV6_FINGERPRINT), false);
  assert.deepEqual(verifyPayload(issued.payload), {
    required: true,
    extractorSha256: artifacts.extractorSha256,
    probeId: PROBE_ID,
    probeVersion: PROBE_VERSION,
    sourceManifestSha256: artifacts.sourceManifestSha256,
    operatorCapturedEzbrSha256: EZBR_SHA256,
  });

  const receiptMutations = [
    ["CI self-protection overclaim", (p) => p.ci_trust_boundary.authorized_maintainer_ci_mutation_self_protected = true, /trust boundary/],
    ["source origin overclaim", (p) => p.source_binding.platform_origin_independently_verified = true, /provenance scope/],
    ["captured source drift", (p) => p.source_binding.operator_captured_source_manifest_sha256 = "d".repeat(64), /differs from exact source/],
    ["synthetic status", (p) => p.probe_function.status = "ACTIVE_AT_CANARY", /actual ACTIVE/],
    ["tuple digest", (p) => p.probe_function.management_api_tuple_sha256 = "d".repeat(64), /management tuple differs/],
    ["case family", (p) => p.requests.matrix.ipv4.baseline.observed_family = "ipv6", /family\/runtime binding/],
    ["case status", (p) => p.requests.matrix.ipv6.forged_x_real_ip.status = 204, /family\/runtime binding/],
    ["case target", (p) => p.requests.matrix.ipv4.forged_x_forwarded_for.target_source_sha = OTHER_SHA, /family\/runtime binding/],
    ["fingerprint smuggling", (p) => p.requests.matrix.ipv4.baseline.fingerprint = IPV4_FINGERPRINT, /schema differs/],
    ["metadata restoration", (p) => p.metadata_integrity.secrets_canary_sha256 = "d".repeat(64), /metadata restoration/],
    ["compute not restored", (p) => p.metadata_integrity.compute_post_sha256 = "d".repeat(64), /metadata restoration/],
    ["atomic delete overclaim", (p) => p.mutation_control.deletion_atomicity = "atomic", /non-atomic/],
    ["negative body weak", (p) => p.requests.negative_auth.missing_signature.exact_body = false, /exact generic 401/],
  ];
  for (const [label, mutate, pattern] of receiptMutations) {
    const payload = structuredClone(issued.payload);
    mutate(payload);
    assert.throws(() => verifyPayload(payload), pattern, label);
  }

  withJsonMutation(raw.files.functionsCanary, (value) => {
    value.functions.find((row) => row.slug === "client-ip-probe").status =
      "ACTIVE_AT_CANARY";
  }, () => assert.throws(() => issue(raw), /actual ACTIVE/));
  withJsonMutation(raw.files.functionsCanary, (value) => {
    value.functions.find((row) => row.slug === "client-ip-probe").ezbr_sha256 =
      "d".repeat(64);
  }, () => assert.throws(() => issue(raw), /row ezbr digest differs/));
  const originalEzbr = fs.readFileSync(raw.files.ezbrRecheck);
  write0600(raw.files.ezbrRecheck, Buffer.concat([originalEzbr, Buffer.from([0])]));
  assert.throws(() => issue(raw), /ezbr bundle bytes differ/);
  write0600(raw.files.ezbrRecheck, originalEzbr);
  withJsonMutation(raw.files.functionsCanary, (value) => {
    value.functions.push({ ...value.functions[0] });
  }, () => assert.throws(() => issue(raw), /duplicate function/));
  withJsonMutation(raw.files.functionsPost, (value) => {
    value.functions[0].version += 1;
  }, () => assert.throws(() => issue(raw), /pre\/post function metadata differs/));
  withJsonMutation(raw.files.functionsPost, (value) => {
    value.functions.push({
      slug: "client-ip-probe",
      id: PROBE_ID,
      version: PROBE_VERSION,
      status: "ACTIVE",
      ezbr_sha256: EZBR_SHA256,
    });
    value.probe_ezbr_sha256 = EZBR_SHA256;
  }, () => assert.throws(() => issue(raw), /absent from preflight and postflight/));
  withJsonMutation(raw.files.secretsCanary, (value) => {
    value.secrets[0].value = "5".repeat(64);
  }, () => assert.throws(() => issue(raw), /secret metadata differs/));
  withJsonMutation(raw.files.secretsCanary, (value) => {
    value.secrets[0].plaintext_secret = "must-never-be-captured";
  }, () => assert.throws(() => issue(raw), /schema differs/));
  withJsonMutation(raw.files.secretsCanary, (value) => {
    value.secrets[0].value = "plaintext-secret";
  }, () => assert.throws(() => issue(raw), /provider digest/));
  withJsonMutation(raw.files.secretsCanary, (value) => {
    value.secrets.push({ ...value.secrets[0] });
  }, () => assert.throws(() => issue(raw), /duplicate secret name/));
  withJsonMutation(raw.files.functionsRecheck, (value) => {
    value.functions.find((row) => row.slug === "client-ip-probe").version += 1;
  }, () => assert.throws(() => issue(raw), /delete recheck does not match/));
  withJsonMutation(raw.files.computePost, (value) => {
    value.droplets.push({ id: "9001", name: "still-live" });
  }, () => assert.throws(() => issue(raw), /compute pre\/created\/post|created ephemeral/));
  withJsonMutation(raw.files.operatorAttestation, (value) => {
    value.delete_scope = "id-and-slug";
  }, () => assert.throws(() => issue(raw), /attestation is incomplete/));
  withJsonMutation(raw.requestPaths["ipv4-forged-cf"].request_path, (value) => {
    value.headers["cf-connecting-ip"] = null;
  }, () => assert.throws(() => issue(raw), /lacks its exact forged header/));
  withJsonMutation(raw.requestPaths["ipv6-forged-cf"].request_path, (value) => {
    value.headers["cf-connecting-ip"] = "xxx";
  }, () => assert.throws(() => issue(raw), /lacks its exact forged header/));
  withJsonMutation(raw.requestPaths["ipv4-baseline"].request_path, (value) => {
    value.headers["x-real-ip"] = "198.51.100.88";
  }, () => assert.throws(() => issue(raw), /unexpected forged header/));
  withJsonMutation(raw.requestPaths["ipv6-baseline"].request_path, (value) => {
    value.transport_family = "ipv4";
  }, () => assert.throws(() => issue(raw), /method\/body\/family contract/));
  withJsonMutation(raw.requestPaths["ipv4-baseline"].request_path, (value) => {
    value.body_utf8 = '{"case_id":"ipv4-forged-cf"}';
  }, () => assert.throws(() => issue(raw), /method\/body\/family contract/));
  withJsonMutation(raw.requestPaths["ipv4-baseline"].request_path, (value) => {
    value.headers["x-frame-probe-signature"] = null;
  }, () => assert.throws(() => issue(raw), /authenticated signature shape/));
  withJsonMutation(raw.requestPaths["missing-signature"].request_path, (value) => {
    value.headers["x-frame-probe-signature"] = "a".repeat(64);
  }, () => assert.throws(() => issue(raw), /included a signature/));
  withJsonMutation(raw.requestPaths["invalid-signature"].request_path, (value) => {
    value.headers["x-frame-probe-signature"] = "b".repeat(64);
  }, () => assert.throws(() => issue(raw), /fixed invalid shape/));
  for (const staleSeconds of [61, 120]) {
    const requestPath = raw.requestPaths["missing-signature"].request_path;
    const status = JSON.parse(fs.readFileSync(
      raw.requestPaths["missing-signature"].status_path,
      "utf8",
    ));
    withJsonMutation(requestPath, (value) => {
      value.headers["x-frame-probe-timestamp"] = String(
        Date.parse(status.observed_at) - staleSeconds * 1000,
      );
    }, () => assert.throws(() => issue(raw), /request\/status timing is invalid/));
  }
  withJsonMutation(raw.requestPaths["ipv4-forged-cf"].request_path, (value) => {
    value.headers["x-frame-probe-nonce"] = "nonce-ipv4-baseline-fixture";
  }, () => assert.throws(() => issue(raw), /reuses a request nonce/));
  withJsonMutation(raw.requestPaths["ipv4-baseline"].response_path, (value) => {
    value.extra = "raw-debug";
  }, () => assert.throws(() => issue(raw), /HTTP 200 response schema differs/));
  withJsonMutation(raw.requestPaths["ipv6-baseline"].response_path, (value) => {
    value.observed_family = "ipv4";
  }, () => assert.throws(() => issue(raw), /target\/runtime\/family binding/));
  withJsonMutation(raw.requestPaths["ipv4-baseline"].response_path, (value) => {
    value.target_source_sha = OTHER_SHA;
  }, () => assert.throws(() => issue(raw), /target\/runtime\/family binding/));
  withJsonMutation(raw.requestPaths["ipv4-baseline"].response_path, (value) => {
    value.deployment_id = "wrong-runtime";
  }, () => assert.throws(() => issue(raw), /target\/runtime\/family binding/));
  withJsonMutation(raw.requestPaths["ipv4-forged-x-real-ip"].response_path, (value) => {
    value.fingerprint = "3".repeat(64);
  }, () => assert.throws(() => issue(raw), /changed the selected client fingerprint/));
  withJsonMutation(raw.requestPaths["ipv6-baseline"].response_path, (value) => {
    value.fingerprint = IPV4_FINGERPRINT;
  }, () => assert.throws(() => issue(raw), /baseline fingerprints must be distinct/));
  const negativePath = raw.requestPaths["missing-signature"].response_path;
  const negativeBody = fs.readFileSync(negativePath);
  write0600(negativePath, '{"error":"unauthorized"}\n');
  assert.throws(() => issue(raw), /exact generic HTTP 401 body/);
  write0600(negativePath, negativeBody);
  const statusPath = raw.requestPaths["ipv4-baseline"].status_path;
  withJsonMutation(statusPath, (value) => {
    value.status = 201;
  }, () => assert.throws(() => issue(raw), /did not return HTTP 200/));
  fs.chmodSync(statusPath, 0o644);
  assert.throws(() => issue(raw), /mode-0600/);
  fs.chmodSync(statusPath, 0o600);
  const statusSymlink = path.join(tempRoot, "status-symlink.json");
  fs.symlinkSync(statusPath, statusSymlink);
  withJsonMutation(raw.files.requestManifest, (value) => {
    value.requests["ipv4-baseline"].status_path = statusSymlink;
  }, () => assert.throws(() => issue(raw), /mode-0600/));
  fs.unlinkSync(statusSymlink);
  const statusHardlink = path.join(tempRoot, "status-hardlink.json");
  fs.linkSync(statusPath, statusHardlink);
  withJsonMutation(raw.files.requestManifest, (value) => {
    value.requests["ipv4-baseline"].status_path = statusHardlink;
  }, () => assert.throws(() => issue(raw), /mode-0600/));
  fs.unlinkSync(statusHardlink);

  const cliEnv = {
    PATH: process.env.PATH,
    FUNCTION_NAME: "handle-lead",
    DEPLOY_SHA: SHA,
    SUPABASE_PROJECT_REF: PROJECT_REF,
    CLIENT_IP_FUNCTIONS_PRE_PATH: raw.files.functionsPre,
    CLIENT_IP_FUNCTIONS_CANARY_PATH: raw.files.functionsCanary,
    CLIENT_IP_FUNCTIONS_DELETE_RECHECK_PATH: raw.files.functionsRecheck,
    CLIENT_IP_FUNCTIONS_POST_PATH: raw.files.functionsPost,
    CLIENT_IP_PROBE_EZBR_CANARY_PATH: raw.files.ezbrCanary,
    CLIENT_IP_PROBE_EZBR_DELETE_RECHECK_PATH: raw.files.ezbrRecheck,
    CLIENT_IP_SECRETS_PRE_PATH: raw.files.secretsPre,
    CLIENT_IP_SECRETS_CANARY_PATH: raw.files.secretsCanary,
    CLIENT_IP_SECRETS_DELETE_RECHECK_PATH: raw.files.secretsRecheck,
    CLIENT_IP_SECRETS_POST_PATH: raw.files.secretsPost,
    CLIENT_IP_COMPUTE_PRE_PATH: raw.files.computePre,
    CLIENT_IP_COMPUTE_CREATED_PATH: raw.files.computeCreated,
    CLIENT_IP_COMPUTE_POST_PATH: raw.files.computePost,
    CLIENT_IP_RENDER_ROOT: raw.renderRoot,
    CLIENT_IP_CAPTURED_SOURCE_ROOT: raw.capturedSourceRoot,
    CLIENT_IP_REQUEST_ARTIFACT_MANIFEST_PATH: raw.files.requestManifest,
    CLIENT_IP_OPERATOR_ATTESTATION_PATH: raw.files.operatorAttestation,
    CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY: HMAC_KEY,
  };
  const tokenPath = path.join(tempRoot, "receipt.token");
  const issueCli = spawnSync(
    process.execPath,
    ["scripts/verify-client-ip-deploy-receipt.mjs", "--issue", tokenPath],
    { cwd: root, env: cliEnv, encoding: "utf8" },
  );
  assert.equal(issueCli.status, 0, issueCli.stderr);
  const cliToken = fs.readFileSync(tokenPath, "utf8").trim();
  assert.match(cliToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(fs.statSync(tokenPath).mode & 0o777, 0o600);
  assert.equal(issueCli.stdout.includes(cliToken), false);
  const verifyCli = spawnSync(
    process.execPath,
    ["scripts/verify-client-ip-deploy-receipt.mjs"],
    {
      cwd: root,
      env: { ...cliEnv, CLIENT_IP_DEPLOY_RECEIPT_TOKEN: cliToken },
      encoding: "utf8",
    },
  );
  assert.equal(verifyCli.status, 0, verifyCli.stderr);
  const overwriteCli = spawnSync(
    process.execPath,
    ["scripts/verify-client-ip-deploy-receipt.mjs", "--issue", tokenPath],
    { cwd: root, env: cliEnv, encoding: "utf8" },
  );
  assert.notEqual(overwriteCli.status, 0);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

assert.equal(
  verifyClientIpDeployReceipt({
    functionName: "lead-crm",
    deploySha: SHA,
    projectRef: PROJECT_REF,
    extractorSource,
    probeTemplateSource,
    receiptToken: signClientIpDeployReceipt(validPayload, HMAC_KEY),
    receiptHmacKey: HMAC_KEY,
    now: NOW,
  }).required,
  true,
);
assert.deepEqual(
  verifyClientIpDeployReceipt({ functionName: "weekly-report" }),
  { required: false },
);

const signed = signClientIpDeployReceipt({ test: true }, HMAC_KEY);
const [encoded, signature] = signed.split(".");
const tampered = `${encoded}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
assert.throws(
  () => verifyClientIpDeployReceipt({
    functionName: "handle-lead",
    deploySha: SHA,
    projectRef: PROJECT_REF,
    extractorSource,
    probeTemplateSource,
    receiptToken: tampered,
    receiptHmacKey: HMAC_KEY,
    now: NOW,
  }),
  /signature is invalid/,
);

const workflow = parseWorkflow(".github/workflows/deploy-edge-function.yml");
const deployJob = workflow.jobs.deploy;
assert.equal(deployJob.if, undefined);
assert.equal(deployJob["continue-on-error"], undefined);
const deploySteps = deployJob.steps;
for (const step of deploySteps) {
  assert.equal(step.if, undefined, `${step.name ?? step.uses} must not be conditional`);
  assert.equal(step["continue-on-error"], undefined, `${step.name ?? step.uses} must fail closed`);
}
const receiptAt = deploySteps.findIndex((step) =>
  step.name === "Enforce fresh signed final-extractor client-IP canary receipt"
);
const deployAt = deploySteps.findIndex((step) => step.name?.startsWith("Deploy "));
assert(receiptAt > 0 && deployAt > receiptAt);
assert.equal(
  deploySteps[receiptAt].run.trim(),
  "node scripts/verify-client-ip-deploy-receipt.mjs",
);

const compliance = parseWorkflow(".github/workflows/compliance-gate.yml");
assert(compliance.on.pull_request.paths.includes("**"));
const dashboardJob = compliance.jobs["dashboard-security"];
assert.equal(dashboardJob.if, undefined);
assert.equal(dashboardJob["continue-on-error"], undefined);
for (const step of dashboardJob.steps) {
  assert.equal(step.if, undefined, `${step.name ?? step.uses} must not be conditional`);
  assert.equal(step["continue-on-error"], undefined, `${step.name ?? step.uses} must fail closed`);
}
assert(
  dashboardJob.steps.some((step) =>
    step.run?.trim() === "node scripts/audit-client-ip-probe-contract.mjs"
  ),
);
assert(
  dashboardJob.steps.some((step) =>
    step.run?.trim() === "node scripts/test-client-ip-deploy-receipt.mjs"
  ),
);

const trustedManifest = JSON.parse(
  read("scripts/client-ip-probe-audit-trusted.json"),
).files;
const tracked = new Map();
const listed = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
assert.equal(listed.status, 0, listed.stderr);
for (const relative of listed.stdout.split("\0").filter(Boolean)) {
  const contents = fs.readFileSync(path.join(root, relative));
  tracked.set(relative, contents.includes(0) ? null : contents.toString("utf8"));
}
assert.deepEqual(
  auditClientIpProbeContract({
    trackedSources: tracked,
    templateSource: probeTemplateSource,
    trustedDigests: trustedManifest,
  }),
  [],
);
for (const [relative, expectedDigest] of Object.entries(trustedManifest)) {
  const source = tracked.get(relative);
  assert.equal(typeof source, "string");
  assert.equal(
    crypto.createHash("sha256").update(source).digest("hex"),
    expectedDigest,
  );
  const tamperedSources = new Map([[
    relative,
    `${source}\n["client","ip","probe"].join("-"); Deno.connect({hostname:"x",port:1}); supabase functions deploy handle-lead`,
  ]]);
  assert.notEqual(
    auditClientIpProbeContract({
      trackedSources: tamperedSources,
      templateSource: probeTemplateSource,
      trustedDigests: trustedManifest,
    }).length,
    0,
    `${relative} trusted digest did not fail closed after mutation`,
  );
}

const runbook = read("supabase/functions/handle-lead/DEPLOY.md");
for (const text of [
  "operator-captured",
  "signer-attested",
  "not independently verify",
  "CLIENT_IP_FUNCTIONS_PRE_PATH",
  "CLIENT_IP_PROBE_EZBR_CANARY_PATH",
  "CLIENT_IP_PROBE_EZBR_DELETE_RECHECK_PATH",
  "CLIENT_IP_SECRETS_CANARY_PATH",
  "CLIENT_IP_COMPUTE_CREATED_PATH",
  "CLIENT_IP_REQUEST_ARTIFACT_MANIFEST_PATH",
  "observed_family",
  "non-atomic",
  "8 authenticated",
  "2 negative-auth",
  "literal-slug-only",
]) {
  assert(runbook.includes(text), `client-IP runbook omits ${text}`);
}
for (const overclaim of [
  "downloaded_live_source_manifest_sha256",
  "live_ezbr_bundle_sha256",
  "ACTIVE_AT_CANARY",
]) {
  assert.equal(runbook.includes(overclaim), false, `runbook retains overclaim ${overclaim}`);
}

console.log(
  "Client-IP receipt v2 passed: artifact-derived ACTIVE tuple/source/request/metadata/compute evidence, exact dual-stack runtime binding, repo-wide anti-bypass scanner, and explicit signer-scoped provenance.",
);
