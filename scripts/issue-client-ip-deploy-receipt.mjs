#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  issueClientIpDeployReceipt,
  verifyClientIpDeployReceipt,
} from "./verify-client-ip-deploy-receipt.mjs";

const PROTECTED_FUNCTIONS = new Set(["handle-lead", "lead-crm"]);
const PROJECT_REF = "hdcflshhomzildwqlmwh";
const PROBE_NAME = "client-ip-probe";
const REQUEST_TIMEOUT_SECONDS = 30;

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeout ?? 120_000,
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    const output = String(result.stderr || result.stdout || `${command} failed`)
      .slice(-1600);
    throw new Error(output);
  }
  return result.stdout || "";
}

function runSoft(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeout ?? 120_000,
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
    ...options,
  });
}

function probeSource({ deploySha, probeBundleSha256 }) {
  return `import { clientIpIdentity, keyedClientIpHash } from "../_shared/client-ip.ts";

const PROBE_SOURCE_SHA = "${deploySha}";
const PROBE_BUNDLE_SHA256 = "${probeBundleSha256}";
const SECRET = Deno.env.get("LEAD_INTAKE_RATE_LIMIT_SECRET") ?? "";

function headerShape(value: string | null): string {
  if (value === null) return "absent";
  const trimmed = value.trim();
  if (!trimmed) return "absent";
  if (trimmed.includes(",")) return "chain";
  if (trimmed.length > 64) return "malformed";
  if (/^(?:0|[1-9]\\d{0,2})(?:\\.(?:0|[1-9]\\d{0,2})){3}$/.test(trimmed)) {
    return "canonical-single";
  }
  if (/^[0-9a-f:.]+$/i.test(trimmed) && trimmed.includes(":") && !trimmed.includes("%")) {
    return "canonical-single";
  }
  return "malformed";
}

Deno.serve(async (request: Request) => {
  const identity = clientIpIdentity(request.headers);
  let fingerprint = null;
  let keyShape = "invalid";
  try {
    fingerprint = await keyedClientIpHash(SECRET, "lead-intake-v1", identity);
    if (/^[0-9a-f]{64}$/.test(fingerprint)) {
      keyShape = "64-lowercase-hex-raw-free";
    }
  } catch {
    fingerprint = null;
  }

  return new Response(JSON.stringify({
    ok: identity?.source === "cf-connecting-ip" && keyShape === "64-lowercase-hex-raw-free",
    probe_source_sha: PROBE_SOURCE_SHA,
    probe_bundle_sha256: PROBE_BUNDLE_SHA256,
    selected_source: identity?.source ?? null,
    selected_fingerprint: fingerprint,
    derived_key: keyShape,
    raw_values_retained: false,
    header_shapes: {
      cf_connecting_ip: headerShape(request.headers.get("cf-connecting-ip")),
      x_real_ip: headerShape(request.headers.get("x-real-ip")),
      x_forwarded_for: headerShape(request.headers.get("x-forwarded-for")),
    },
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
});
`;
}

function writeProbeFunction(root, deploySha, extractorSource) {
  const firstPassSource = probeSource({
    deploySha,
    probeBundleSha256: "0".repeat(64),
  });
  const probeBundleSha256 = crypto.createHash("sha256")
    .update(firstPassSource)
    .update("\0")
    .update(extractorSource)
    .digest("hex");
  const source = probeSource({ deploySha, probeBundleSha256 });
  const probeDir = path.join(root, "supabase", "functions", PROBE_NAME);
  fs.mkdirSync(probeDir, { recursive: true });
  fs.writeFileSync(path.join(probeDir, "index.ts"), source, { mode: 0o600 });
  return { probeDir, probeBundleSha256 };
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

function curlProbe({ baseUrl, family, headers = [] }) {
  const outputPath = path.join(
    os.tmpdir(),
    `frame-utah-client-ip-probe-${process.pid}-${crypto.randomUUID()}.json`,
  );
  const args = [
    "--silent",
    "--show-error",
    "--max-time",
    String(REQUEST_TIMEOUT_SECONDS),
    family,
    "--output",
    outputPath,
    "--write-out",
    "%{http_code}",
    "--request",
    "GET",
  ];
  for (const header of headers) args.push("--header", header);
  args.push(baseUrl);
  const result = runSoft("curl", args, { timeout: (REQUEST_TIMEOUT_SECONDS + 5) * 1000 });
  let body = "";
  try {
    body = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
  return {
    status: Number(String(result.stdout || "").trim()) || 0,
    body,
    ok: result.status === 0,
  };
}

function requireProbeBody(response, label, expectedSha, expectedBundle) {
  if (!response.ok || response.status < 200 || response.status >= 300) {
    throw new Error(`${label} probe failed before a 2xx response`);
  }
  const body = parseJson(response.body, `${label} probe`);
  if (
    body?.ok !== true ||
    body?.probe_source_sha !== expectedSha ||
    body?.probe_bundle_sha256 !== expectedBundle ||
    body?.selected_source !== "cf-connecting-ip" ||
    !/^[0-9a-f]{64}$/.test(body?.selected_fingerprint ?? "") ||
    body?.derived_key !== "64-lowercase-hex-raw-free" ||
    body?.raw_values_retained !== false
  ) {
    throw new Error(`${label} probe did not return the required sanitized client-IP contract`);
  }
  return body;
}

function functionDeployments(metadata, projectRef) {
  if (!Array.isArray(metadata)) {
    throw new Error("function metadata is not an array");
  }
  const deployments = new Map();
  for (const entry of metadata) {
    const slug = entry?.slug ?? entry?.name;
    const id = typeof entry?.id === "string" ? entry.id : "";
    const version = Number(entry?.version);
    if (
      typeof slug === "string" && id.length > 0 &&
      Number.isSafeInteger(version) && version > 0
    ) {
      deployments.set(slug, {
        version,
        deploymentId: `${projectRef}_${id}_${version}`,
      });
    }
  }
  return deployments;
}

function writeGitHubEnv(name, value) {
  const envPath = process.env.GITHUB_ENV;
  if (!envPath) return;
  fs.appendFileSync(envPath, `${name}=${value}\n`, { mode: 0o600 });
}

async function main() {
  const functionName = process.env.FUNCTION_NAME ?? "";
  if (!PROTECTED_FUNCTIONS.has(functionName)) {
    console.log("Client-IP deployment evidence is not required for this function.");
    return;
  }
  const root = process.cwd();
  const deploySha = requireString(process.env.DEPLOY_SHA, "DEPLOY_SHA");
  const projectRef = requireString(process.env.SUPABASE_PROJECT_REF, "SUPABASE_PROJECT_REF");
  if (projectRef !== PROJECT_REF) throw new Error("unsupported Supabase project ref");
  requireString(process.env.SUPABASE_ACCESS_TOKEN, "SUPABASE_ACCESS_TOKEN");
  const receiptHmacKey = requireString(
    process.env.CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY,
    "CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY",
  );
  const extractorSource = fs.readFileSync(
    path.join(root, "supabase", "functions", "_shared", "client-ip.ts"),
    "utf8",
  );
  const { probeDir, probeBundleSha256 } = writeProbeFunction(root, deploySha, extractorSource);
  const endpoint = `https://${projectRef}.supabase.co/functions/v1/${PROBE_NAME}`;
  let probeDeleted = false;
  try {
    runSoft("supabase", ["functions", "delete", PROBE_NAME, "--project-ref", projectRef, "--yes"], {
      cwd: root,
    });
    run("supabase", [
      "functions",
      "deploy",
      PROBE_NAME,
      "--project-ref",
      projectRef,
      "--no-verify-jwt",
      "--use-api",
    ], { cwd: root });

    const functionsBefore = parseJson(
      run("supabase", ["functions", "list", "--project-ref", projectRef, "--output", "json"], {
        cwd: root,
      }),
      "functions list",
    );
    const probeDeployment = functionDeployments(functionsBefore, projectRef).get(PROBE_NAME);
    if (!probeDeployment) {
      throw new Error("deployed client-IP probe metadata is missing");
    }

    const ipv4 = requireProbeBody(
      curlProbe({ baseUrl: endpoint, family: "-4" }),
      "IPv4",
      deploySha,
      probeBundleSha256,
    );
    const ipv6 = requireProbeBody(
      curlProbe({ baseUrl: endpoint, family: "-6" }),
      "IPv6",
      deploySha,
      probeBundleSha256,
    );
    const forgedCf = curlProbe({
      baseUrl: endpoint,
      family: "-4",
      headers: ["cf-connecting-ip: 203.0.113.88"],
    });
    const xReal = requireProbeBody(
      curlProbe({
        baseUrl: endpoint,
        family: "-4",
        headers: ["x-real-ip: 203.0.113.89"],
      }),
      "x-real-ip forgery",
      deploySha,
      probeBundleSha256,
    );
    const xff = requireProbeBody(
      curlProbe({
        baseUrl: endpoint,
        family: "-4",
        headers: ["x-forwarded-for: 203.0.113.90, 198.51.100.90"],
      }),
      "x-forwarded-for forgery",
      deploySha,
      probeBundleSha256,
    );

    let forgedCfOk = forgedCf.status === 403;
    if (!forgedCfOk && forgedCf.status >= 200 && forgedCf.status < 300) {
      const forgedBody = requireProbeBody(
        forgedCf,
        "cf-connecting-ip forgery",
        deploySha,
        probeBundleSha256,
      );
      forgedCfOk = forgedBody.selected_fingerprint === ipv4.selected_fingerprint;
    }
    if (!forgedCfOk) {
      throw new Error("forged cf-connecting-ip request was neither rejected nor overwritten");
    }
    if (
      xReal.selected_fingerprint !== ipv4.selected_fingerprint ||
      xff.selected_fingerprint !== ipv4.selected_fingerprint
    ) {
      throw new Error("diagnostic IP headers changed the selected client fingerprint");
    }

    run("supabase", ["functions", "delete", PROBE_NAME, "--project-ref", projectRef, "--yes"], {
      cwd: root,
    });
    probeDeleted = true;
    const functionsAfter = parseJson(
      run("supabase", ["functions", "list", "--project-ref", projectRef, "--output", "json"], {
        cwd: root,
      }),
      "post-cleanup functions list",
    );
    if (functionDeployments(functionsAfter, projectRef).has(PROBE_NAME)) {
      throw new Error("client-IP probe function still exists after cleanup");
    }
    const secretsAfter = parseJson(
      run("supabase", ["secrets", "list", "--project-ref", projectRef, "--output", "json"], {
        cwd: root,
      }),
      "post-cleanup secrets list",
    );
    if (
      !Array.isArray(secretsAfter) ||
      secretsAfter.some((entry) => String(entry?.name || "").startsWith("CLIENT_IP_PROBE_"))
    ) {
      throw new Error("client-IP probe secret cleanup proof failed");
    }

    const canaryEvidence = {
      probe_source_sha: deploySha,
      probe_bundle_sha256: probeBundleSha256,
      probe_function: {
        slug: PROBE_NAME,
        version: probeDeployment.version,
        status: "ACTIVE_AT_CANARY",
      },
      canary_checked_at: new Date().toISOString(),
      canary_results: {
        ipv4_path: "passed",
        ipv6_path: "passed",
        canonical_source: "cf-connecting-ip",
        forged_cf_connecting_ip: "rejected-or-overwritten",
        forged_x_real_ip: "selected-fingerprint-unchanged",
        forged_x_forwarded_for: "selected-fingerprint-unchanged",
        derived_key: ipv4.derived_key,
        raw_values_retained: false,
      },
      cleanup: {
        probe_function_deleted: true,
        probe_secrets_deleted: true,
      },
    };
    const issued = issueClientIpDeployReceipt({
      deploySha,
      projectRef,
      extractorSource,
      canaryEvidence,
      receiptHmacKey,
    });
    verifyClientIpDeployReceipt({
      functionName,
      deploySha,
      projectRef,
      extractorSource,
      receiptToken: issued.token,
      receiptHmacKey,
    });
    console.log(`::add-mask::${issued.token}`);
    writeGitHubEnv("CLIENT_IP_DEPLOY_RECEIPT_TOKEN", issued.token);
    console.log(
      `Client-IP deployment evidence minted from live probe v${probeDeployment.version}; raw IP values retained=false.`,
    );
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
    if (!probeDeleted) {
      runSoft("supabase", ["functions", "delete", PROBE_NAME, "--project-ref", projectRef, "--yes"], {
        cwd: root,
      });
    }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`::error::${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
