#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  clientIpProbeTemplateViolations,
} from "./audit-client-ip-probe-contract.mjs";
import {
  assertDisjointArtifactRoots,
  capturedClientIpProbeManifest,
  CLIENT_IP_EXTRACTOR_PATH,
  CLIENT_IP_PROBE_TEMPLATE_PATH,
  expectedClientIpProbeArtifacts,
  renderedClientIpProbeManifest,
  sha256,
} from "./render-client-ip-probe.mjs";

const PROTECTED_FUNCTIONS = new Set(["handle-lead", "lead-crm"]);
const PROBE_SLUG = "client-ip-probe";
const MAX_RECEIPT_LIFETIME_MS = 15 * 60 * 1000;
const MAX_CANARY_AGE_MS = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
// Stay strictly inside the probe's 60-second authentication freshness window so
// a generic 401 proves the tested signature condition, not an expired request.
const MAX_REQUEST_OBSERVATION_GAP_MS = 30 * 1000;
const MAX_DELETE_RECHECK_GAP_MS = 60 * 1000;
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024;
const MAX_EZBR_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const DISPATCH_NONCE = /^[A-Za-z0-9_-]{32,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const POSITIVE_CASES = [
  "ipv4-baseline",
  "ipv4-forged-cf",
  "ipv4-forged-x-real-ip",
  "ipv4-forged-x-forwarded-for",
  "ipv6-baseline",
  "ipv6-forged-cf",
  "ipv6-forged-x-real-ip",
  "ipv6-forged-x-forwarded-for",
];
const NEGATIVE_CASES = ["missing-signature", "invalid-signature"];
const REQUEST_CASES = [...POSITIVE_CASES, ...NEGATIVE_CASES];

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
  return value;
}

function requireDigest(value, label) {
  if (!SHA256.test(value ?? "")) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
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

function assertExactKeys(value, expected, label) {
  const object = requirePlainObject(value, label);
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(
      `${label} schema differs (expected ${wanted.join(",")}; got ${actual.join(",")})`,
    );
  }
  return object;
}

function parseIsoTimestamp(value, label) {
  const text = requireString(value, label);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== text) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return timestamp;
}

function canonicalValue(value, label = "artifact") {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalValue(entry, `${label}[${index}]`));
  }
  const object = requirePlainObject(value, label);
  return Object.fromEntries(
    Object.keys(object).sort().map((key) => [
      key,
      canonicalValue(object[key], `${label}.${key}`),
    ]),
  );
}

function canonicalJson(value, label) {
  return `${JSON.stringify(canonicalValue(value, label))}\n`;
}

function canonicalUnorderedRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} must be an array`);
  const serialized = rows.map((row, index) =>
    JSON.stringify(canonicalValue(requirePlainObject(row, `${label}[${index}]`)))
  ).sort();
  return `${JSON.stringify(serialized.map((row) => JSON.parse(row)))}\n`;
}

export function parseJsonWithoutDuplicateKeys(text, label = "JSON artifact") {
  if (typeof text !== "string") throw new Error(`${label} must be UTF-8 text`);
  let index = 0;
  const fail = () => {
    throw new Error(`${label} is invalid or contains duplicate object keys`);
  };
  const whitespace = () => {
    while (/[\t\n\r ]/.test(text[index] ?? "")) index += 1;
  };
  const stringValue = () => {
    if (text[index] !== '"') fail();
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          fail();
        }
      }
      if (character === "\\") {
        index += 1;
        const escape = text[index];
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) fail();
          index += 5;
          continue;
        }
        if (!/["\\/bfnrt]/.test(escape ?? "")) fail();
        index += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) fail();
      index += 1;
    }
    fail();
  };
  const value = () => {
    whitespace();
    const character = text[index];
    if (character === "{") {
      index += 1;
      whitespace();
      const keys = new Set();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (true) {
        whitespace();
        const key = stringValue();
        if (keys.has(key)) fail();
        keys.add(key);
        whitespace();
        if (text[index] !== ":") fail();
        index += 1;
        value();
        whitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail();
        index += 1;
      }
    }
    if (character === "[") {
      index += 1;
      whitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (true) {
        value();
        whitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail();
        index += 1;
      }
    }
    if (character === '"') {
      stringValue();
      return;
    }
    const remainder = text.slice(index);
    const literal = remainder.match(/^(?:true|false|null)/)?.[0];
    if (literal) {
      index += literal.length;
      return;
    }
    const number = remainder.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
    if (!number) fail();
    index += number.length;
  };
  value();
  whitespace();
  if (index !== text.length) fail();
  try {
    return JSON.parse(text);
  } catch {
    fail();
  }
}

function readSecureBuffer(filePath, label, maxBytes = MAX_ARTIFACT_BYTES) {
  const absolute = path.resolve(requireString(filePath, `${label} path`));
  const before = fs.lstatSync(absolute);
  if (
    !before.isFile() || before.isSymbolicLink() ||
    (before.mode & 0o777) !== 0o600 || before.nlink !== 1
  ) {
    throw new Error(`${label} must be a unique mode-0600 regular file`);
  }
  if (before.size > maxBytes) {
    throw new Error(`${label} exceeds the bounded artifact size`);
  }
  const descriptor = fs.openSync(
    absolute,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const metadata = fs.fstatSync(descriptor);
    if (
      metadata.dev !== before.dev || metadata.ino !== before.ino ||
      !metadata.isFile() || (metadata.mode & 0o777) !== 0o600 ||
      metadata.nlink !== 1 || metadata.size > maxBytes
    ) {
      throw new Error(`${label} changed during secure open`);
    }
    return {
      absolute,
      metadata,
      buffer: fs.readFileSync(descriptor),
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

function readSecureText(filePath, label, maxBytes = MAX_ARTIFACT_BYTES) {
  const artifact = readSecureBuffer(filePath, label, maxBytes);
  return { ...artifact, text: artifact.buffer.toString("utf8") };
}

function readSecureJson(filePath, label, maxBytes = MAX_ARTIFACT_BYTES) {
  const artifact = readSecureText(filePath, label, maxBytes);
  try {
    return {
      ...artifact,
      value: parseJsonWithoutDuplicateKeys(artifact.text, label),
    };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertUniqueInputInodes(inputs) {
  const seen = new Map();
  for (const { absolute, metadata, label } of inputs) {
    const key = `${metadata.dev}:${metadata.ino}`;
    if (seen.has(key)) {
      throw new Error(`${label} aliases ${seen.get(key)} by inode`);
    }
    seen.set(key, absolute);
  }
}

function functionCapture(filePath, label, projectRef) {
  const artifact = readSecureJson(filePath, label);
  const value = assertExactKeys(
    artifact.value,
    [
      "capture_version",
      "captured_at",
      "project_ref",
      "capture_method",
      "functions",
      "probe_ezbr_sha256",
    ],
    label,
  );
  if (
    value.capture_version !== 1 || value.project_ref !== projectRef ||
    value.capture_method !==
      "operator-captured-supabase-functions-list-and-management-api-bundle"
  ) {
    throw new Error(`${label} has an invalid capture contract`);
  }
  const capturedAt = parseIsoTimestamp(value.captured_at, `${label} captured_at`);
  const canonicalFunctions = canonicalUnorderedRows(
    value.functions,
    `${label} functions`,
  );
  const seenSlugs = new Set();
  const seenIds = new Set();
  for (const [index, row] of value.functions.entries()) {
    requirePlainObject(row, `${label} functions[${index}]`);
    for (const [field, seen] of [["slug", seenSlugs], ["id", seenIds]]) {
      const candidate = requireString(
        row[field],
        `${label} functions[${index}].${field}`,
      );
      if (seen.has(candidate)) {
        throw new Error(`${label} contains duplicate function ${field} ${candidate}`);
      }
      seen.add(candidate);
    }
  }
  const probeRows = value.functions.filter((row) => row?.slug === PROBE_SLUG);
  if (probeRows.length > 1) {
    throw new Error(`${label} contains duplicate client-IP probe functions`);
  }
  return {
    artifact,
    capturedAt,
    capturedAtText: value.captured_at,
    functions: value.functions,
    canonicalFunctions,
    functionsSha256: sha256(canonicalFunctions),
    probe: probeRows[0] ?? null,
    probeEzbrSha256: value.probe_ezbr_sha256,
  };
}

function secretCapture(filePath, label, projectRef) {
  const artifact = readSecureJson(filePath, label);
  const value = assertExactKeys(
    artifact.value,
    [
      "capture_version",
      "captured_at",
      "project_ref",
      "capture_method",
      "secrets",
    ],
    label,
  );
  if (
    value.capture_version !== 1 || value.project_ref !== projectRef ||
    value.capture_method !== "operator-captured-supabase-secrets-list"
  ) {
    throw new Error(`${label} has an invalid capture contract`);
  }
  const capturedAt = parseIsoTimestamp(value.captured_at, `${label} captured_at`);
  const canonicalSecrets = canonicalUnorderedRows(value.secrets, `${label} secrets`);
  const seenNames = new Set();
  for (const [index, row] of value.secrets.entries()) {
    const secretLabel = `${label} secrets[${index}]`;
    const secret = assertExactKeys(
      row,
      ["name", "value", "updated_at"],
      secretLabel,
    );
    const name = requireString(secret.name, `${secretLabel}.name`);
    if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(name)) {
      throw new Error(`${secretLabel}.name is invalid`);
    }
    requireDigest(secret.value, `${secretLabel}.value provider digest`);
    parseIsoTimestamp(secret.updated_at, `${secretLabel}.updated_at`);
    if (seenNames.has(name)) {
      throw new Error(`${label} contains duplicate secret name ${name}`);
    }
    seenNames.add(name);
  }
  return {
    artifact,
    capturedAt,
    capturedAtText: value.captured_at,
    canonicalSecrets,
    secretsSha256: sha256(canonicalSecrets),
  };
}

function finalFunctionState(filePath) {
  const artifact = readSecureJson(
    filePath,
    "final live Supabase function metadata",
  );
  if (!Array.isArray(artifact.value)) {
    throw new Error("final live Supabase function metadata must be an array");
  }
  const seenSlugs = new Set();
  const seenIds = new Set();
  for (const [index, row] of artifact.value.entries()) {
    const entry = requirePlainObject(
      row,
      `final live Supabase function metadata[${index}]`,
    );
    const slug = requireString(
      entry.slug ?? entry.name,
      `final live Supabase function metadata[${index}].slug`,
    );
    const id = requireString(
      entry.id,
      `final live Supabase function metadata[${index}].id`,
    );
    if (seenSlugs.has(slug) || seenIds.has(id)) {
      throw new Error("final live Supabase function metadata has duplicate slug or ID");
    }
    seenSlugs.add(slug);
    seenIds.add(id);
  }
  if (seenSlugs.has(PROBE_SLUG)) {
    throw new Error("client-IP probe remains present in final live function metadata");
  }
  const canonical = canonicalUnorderedRows(
    artifact.value,
    "final live Supabase functions",
  );
  return { sha256: sha256(canonical), artifact };
}

function finalSecretState(filePath) {
  const artifact = readSecureJson(
    filePath,
    "final live Supabase secret metadata",
  );
  if (!Array.isArray(artifact.value)) {
    throw new Error("final live Supabase secret metadata must be an array");
  }
  const seenNames = new Set();
  for (const [index, row] of artifact.value.entries()) {
    const label = `final live Supabase secret metadata[${index}]`;
    const secret = assertExactKeys(row, ["name", "value", "updated_at"], label);
    const name = requireString(secret.name, `${label}.name`);
    if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(name) || seenNames.has(name)) {
      throw new Error("final live Supabase secret metadata has invalid/duplicate name");
    }
    seenNames.add(name);
    requireDigest(secret.value, `${label}.value provider digest`);
    parseIsoTimestamp(secret.updated_at, `${label}.updated_at`);
  }
  const canonical = canonicalUnorderedRows(
    artifact.value,
    "final live Supabase secrets",
  );
  return { sha256: sha256(canonical), artifact };
}

function exactProbeTuple(capture, projectRef, label) {
  const probe = requirePlainObject(capture.probe, `${label} probe function`);
  for (const field of ["slug", "id", "version", "status"]) {
    if (!(field in probe)) throw new Error(`${label} probe lacks ${field}`);
  }
  if (
    probe.slug !== PROBE_SLUG || !UUID.test(probe.id ?? "") ||
    !Number.isSafeInteger(probe.version) || probe.version < 1 ||
    probe.status !== "ACTIVE"
  ) {
    throw new Error(`${label} lacks the actual ACTIVE probe tuple`);
  }
  const providerEzbrSha256 = requireDigest(
    probe.ezbr_sha256,
    `${label} provider ezbr SHA-256`,
  );
  const managementApiBodySha256 = requireDigest(
    capture.probeEzbrSha256,
    `${label} operator-captured Management API body SHA-256`,
  );
  const tuple = {
    project_ref: projectRef,
    slug: probe.slug,
    id: probe.id,
    version: probe.version,
    status: probe.status,
    ezbr_sha256: providerEzbrSha256,
  };
  return {
    ...tuple,
    managementApiBodySha256,
    tupleSha256: sha256(canonicalJson(tuple, `${label} management API tuple`)),
  };
}

function catalogWithoutProbe(capture, label) {
  return canonicalUnorderedRows(
    capture.functions.filter((row) => row?.slug !== PROBE_SLUG),
    `${label} non-probe functions`,
  );
}

function readOperatorAttestation(filePath) {
  const artifact = readSecureJson(filePath, "client-IP operator attestation");
  const value = assertExactKeys(
    artifact.value,
    [
      "attestation_version",
      "exclusive_mutation_window",
      "exclusive_window_started_at",
      "probe_deleted_at",
      "exclusive_window_ended_at",
      "delete_scope",
      "deletion_target",
      "probe_secret_mutation_performed",
    ],
    "client-IP operator attestation",
  );
  if (
    value.attestation_version !== 1 ||
    value.exclusive_mutation_window !== true ||
    value.delete_scope !== "literal-slug-only" ||
    value.deletion_target !== PROBE_SLUG ||
    value.probe_secret_mutation_performed !== false
  ) {
    throw new Error("client-IP operator attestation is incomplete or unsafe");
  }
  return {
    artifact,
    value,
    windowStartedAt: parseIsoTimestamp(
      value.exclusive_window_started_at,
      "client-IP exclusive window start",
    ),
    probeDeletedAt: parseIsoTimestamp(
      value.probe_deleted_at,
      "client-IP probe deletion",
    ),
    windowEndedAt: parseIsoTimestamp(
      value.exclusive_window_ended_at,
      "client-IP exclusive window end",
    ),
  };
}

function computeCapture(filePath, label) {
  const artifact = readSecureJson(filePath, label);
  const value = assertExactKeys(
    artifact.value,
    [
      "capture_version",
      "captured_at",
      "capture_method",
      "droplets",
      "created_droplet_id",
    ],
    label,
  );
  if (
    value.capture_version !== 1 ||
    value.capture_method !== "operator-captured-digitalocean-droplets"
  ) {
    throw new Error(`${label} has an invalid capture contract`);
  }
  const capturedAt = parseIsoTimestamp(value.captured_at, `${label} captured_at`);
  const canonicalDroplets = canonicalUnorderedRows(value.droplets, `${label} droplets`);
  const ids = new Set();
  for (const [index, row] of value.droplets.entries()) {
    const droplet = requirePlainObject(row, `${label} droplets[${index}]`);
    const id = String(droplet.id ?? "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || ids.has(id)) {
      throw new Error(`${label} has a missing or duplicate droplet ID`);
    }
    ids.add(id);
  }
  if (
    value.created_droplet_id !== null &&
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.created_droplet_id ?? "")
  ) {
    throw new Error(`${label} created droplet ID is invalid`);
  }
  return {
    artifact,
    capturedAt,
    droplets: value.droplets,
    canonicalDroplets,
    dropletsSha256: sha256(canonicalDroplets),
    createdDropletId: value.created_droplet_id,
  };
}

function requestManifest(filePath) {
  const artifact = readSecureJson(filePath, "client-IP request artifact manifest");
  const value = assertExactKeys(
    artifact.value,
    ["artifact_version", "requests"],
    "client-IP request artifact manifest",
  );
  if (value.artifact_version !== 1) {
    throw new Error("client-IP request artifact manifest version is invalid");
  }
  const requests = assertExactKeys(
    value.requests,
    REQUEST_CASES,
    "client-IP request artifact manifest requests",
  );
  for (const caseId of REQUEST_CASES) {
    assertExactKeys(
      requests[caseId],
      ["request_path", "status_path", "response_path"],
      `client-IP ${caseId} artifact paths`,
    );
    for (const pathName of ["request_path", "status_path", "response_path"]) {
      const artifactPath = requireString(
        requests[caseId][pathName],
        `client-IP ${caseId} ${pathName}`,
      );
      if (!path.isAbsolute(artifactPath)) {
        throw new Error(`client-IP ${caseId} ${pathName} must be absolute`);
      }
    }
  }
  return { artifact, requests };
}

function requestArtifactContract(value, caseId) {
  const request = assertExactKeys(
    value,
    [
      "artifact_version",
      "method",
      "url_function_slug",
      "transport_family",
      "body_utf8",
      "body_sha256",
      "headers",
    ],
    `client-IP ${caseId} request artifact`,
  );
  const positive = POSITIVE_CASES.includes(caseId);
  const family = positive && caseId.startsWith("ipv6-") ? "ipv6" : "ipv4";
  const bodyCaseId = positive ? caseId : "ipv4-baseline";
  const expectedBody = JSON.stringify({ case_id: bodyCaseId });
  if (
    request.artifact_version !== 1 || request.method !== "POST" ||
    request.url_function_slug !== PROBE_SLUG ||
    request.transport_family !== family || request.body_utf8 !== expectedBody ||
    request.body_sha256 !== sha256(expectedBody)
  ) {
    throw new Error(`client-IP ${caseId} request method/body/family contract differs`);
  }
  requireDigest(request.body_sha256, `client-IP ${caseId} request body SHA-256`);
  const headers = assertExactKeys(
    request.headers,
    [
      "content-type",
      "x-frame-probe-timestamp",
      "x-frame-probe-nonce",
      "x-frame-probe-signature",
      "cf-connecting-ip",
      "x-real-ip",
      "x-forwarded-for",
    ],
    `client-IP ${caseId} request headers`,
  );
  if (
    headers["content-type"] !== "application/json" ||
    !/^\d{13}$/.test(headers["x-frame-probe-timestamp"] ?? "") ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(headers["x-frame-probe-nonce"] ?? "")
  ) {
    throw new Error(`client-IP ${caseId} request auth headers are malformed`);
  }
  const rawHeaderNames = [
    "cf-connecting-ip",
    "x-real-ip",
    "x-forwarded-for",
  ];
  const expectedForgedHeader = positive
    ? ({
      "forged-cf": "cf-connecting-ip",
      "forged-x-real-ip": "x-real-ip",
      "forged-x-forwarded-for": "x-forwarded-for",
    })[caseId.replace(`${family}-`, "")] ?? null
    : null;
  const expectedForgedValue = expectedForgedHeader
    ? ({
      "cf-connecting-ip": family === "ipv4" ? "198.51.100.77" : "2001:db8::77",
      "x-real-ip": family === "ipv4" ? "198.51.100.78" : "2001:db8::78",
      "x-forwarded-for": family === "ipv4" ? "198.51.100.79" : "2001:db8::79",
    })[expectedForgedHeader]
    : null;
  for (const headerName of rawHeaderNames) {
    const headerValue = headers[headerName];
    if (headerName === expectedForgedHeader) {
      if (headerValue !== expectedForgedValue) {
        throw new Error(`client-IP ${caseId} lacks its exact forged header`);
      }
    } else if (headerValue !== null) {
      throw new Error(`client-IP ${caseId} includes an unexpected forged header`);
    }
  }
  const signature = headers["x-frame-probe-signature"];
  if (positive) {
    if (!SHA256.test(signature ?? "") || /^0{64}$/.test(signature)) {
      throw new Error(`client-IP ${caseId} lacks an authenticated signature shape`);
    }
  } else if (caseId === "missing-signature") {
    if (signature !== null) {
      throw new Error("client-IP missing-signature request included a signature");
    }
  } else if (signature !== "0".repeat(64)) {
    throw new Error("client-IP invalid-signature request is not the fixed invalid shape");
  }
  return {
    family,
    requestAt: Number(headers["x-frame-probe-timestamp"]),
    nonce: headers["x-frame-probe-nonce"],
  };
}

function readRequestArtifacts(manifest, deploySha, deploymentId) {
  const inputFiles = [];
  const parsed = new Map();
  const seenNonces = new Set();
  for (const caseId of REQUEST_CASES) {
    const paths = manifest.requests[caseId];
    const requestArtifact = readSecureJson(
      paths.request_path,
      `client-IP ${caseId} request artifact`,
      MAX_RESPONSE_BYTES,
    );
    const requestContract = requestArtifactContract(requestArtifact.value, caseId);
    if (seenNonces.has(requestContract.nonce)) {
      throw new Error(`client-IP ${caseId} reuses a request nonce`);
    }
    seenNonces.add(requestContract.nonce);
    const statusArtifact = readSecureJson(
      paths.status_path,
      `client-IP ${caseId} status artifact`,
      MAX_RESPONSE_BYTES,
    );
    const status = assertExactKeys(
      statusArtifact.value,
      ["status", "observed_at"],
      `client-IP ${caseId} status artifact`,
    );
    if (!Number.isSafeInteger(status.status)) {
      throw new Error(`client-IP ${caseId} status is invalid`);
    }
    const responseArtifact = readSecureText(
      paths.response_path,
      `client-IP ${caseId} response artifact`,
      MAX_RESPONSE_BYTES,
    );
    inputFiles.push(
      { ...requestArtifact, label: `${caseId} request artifact` },
      { ...statusArtifact, label: `${caseId} status artifact` },
      { ...responseArtifact, label: `${caseId} response artifact` },
    );
    const observedAt = parseIsoTimestamp(
      status.observed_at,
      `client-IP ${caseId} observed_at`,
    );
    if (
      requestContract.requestAt > observedAt ||
      observedAt - requestContract.requestAt > MAX_REQUEST_OBSERVATION_GAP_MS
    ) {
      throw new Error(`client-IP ${caseId} request/status timing is invalid`);
    }
    let body;
    try {
      body = parseJsonWithoutDuplicateKeys(
        responseArtifact.text,
        `client-IP ${caseId} response`,
      );
    } catch (error) {
      throw new Error(`client-IP ${caseId} response is not JSON: ${error.message}`);
    }
    if (POSITIVE_CASES.includes(caseId)) {
      if (status.status !== 200) {
        throw new Error(`client-IP ${caseId} did not return HTTP 200`);
      }
      const response = assertExactKeys(
        body,
        [
          "ok",
          "case_id",
          "target_source_sha",
          "deployment_id",
          "source",
          "observed_family",
          "fingerprint",
        ],
        `client-IP ${caseId} HTTP 200 response`,
      );
      const family = caseId.startsWith("ipv4-") ? "ipv4" : "ipv6";
      if (
        response.ok !== true || response.case_id !== caseId ||
        response.target_source_sha !== deploySha ||
        response.deployment_id !== deploymentId ||
        response.source !== "cf-connecting-ip" ||
        response.observed_family !== family ||
        !SHA256.test(response.fingerprint ?? "")
      ) {
        throw new Error(
          `client-IP ${caseId} response lacks exact target/runtime/family binding`,
        );
      }
      parsed.set(caseId, {
        status: status.status,
        observedAt,
        observedAtText: status.observed_at,
        family,
        requestAt: requestContract.requestAt,
        fingerprint: response.fingerprint,
      });
    } else {
      if (
        status.status !== 401 ||
        responseArtifact.text !== '{"error":"unauthorized"}'
      ) {
        throw new Error(
          `client-IP ${caseId} must be the exact generic HTTP 401 body`,
        );
      }
      assertExactKeys(body, ["error"], `client-IP ${caseId} HTTP 401 response`);
      if (body.error !== "unauthorized") {
        throw new Error(`client-IP ${caseId} HTTP 401 response is not generic`);
      }
      parsed.set(caseId, {
        status: status.status,
        observedAt,
        observedAtText: status.observed_at,
        requestAt: requestContract.requestAt,
      });
    }
  }
  assertUniqueInputInodes(inputFiles);
  return { parsed, inputFiles };
}

function signedPositiveCase(parsed, caseId, deploySha, deploymentId, outcome) {
  const observed = parsed.get(caseId);
  return {
    status: observed.status,
    outcome,
    request_shape: "exact-captured-request",
    observed_family: observed.family,
    target_source_sha: deploySha,
    deno_deployment_id: deploymentId,
  };
}

function buildRequestReceipt(parsed, deploySha, deploymentId) {
  const matrix = {};
  if (
    parsed.get("ipv4-baseline").fingerprint ===
      parsed.get("ipv6-baseline").fingerprint
  ) {
    throw new Error("IPv4 and IPv6 baseline fingerprints must be distinct");
  }
  for (const family of ["ipv4", "ipv6"]) {
    const baselineId = `${family}-baseline`;
    const baseline = parsed.get(baselineId);
    for (const suffix of [
      "forged-cf",
      "forged-x-real-ip",
      "forged-x-forwarded-for",
    ]) {
      if (parsed.get(`${family}-${suffix}`).fingerprint !== baseline.fingerprint) {
        throw new Error(
          `client-IP ${family} ${suffix} changed the selected client fingerprint`,
        );
      }
    }
    matrix[family] = {
      path: "passed",
      baseline: {
        ...signedPositiveCase(
          parsed,
          baselineId,
          deploySha,
          deploymentId,
          "passed",
        ),
        canonical_source: "cf-connecting-ip",
        derived_key: "64-lowercase-hex-raw-free",
      },
      forged_cf_connecting_ip: signedPositiveCase(
        parsed,
        `${family}-forged-cf`,
        deploySha,
        deploymentId,
        "gateway-overwritten-selected-fingerprint-unchanged",
      ),
      forged_x_real_ip: signedPositiveCase(
        parsed,
        `${family}-forged-x-real-ip`,
        deploySha,
        deploymentId,
        "selected-fingerprint-unchanged",
      ),
      forged_x_forwarded_for: signedPositiveCase(
        parsed,
        `${family}-forged-x-forwarded-for`,
        deploySha,
        deploymentId,
        "selected-fingerprint-unchanged",
      ),
    };
  }
  return {
    authenticated_request_count: 8,
    negative_auth_request_count: 2,
    total_request_count: 10,
    matrix,
    negative_auth: {
      missing_signature: {
        status: parsed.get("missing-signature").status,
        outcome: "generic-unauthorized",
        request_shape: "exact-missing-signature-request",
        exact_body: true,
        metadata_exposed: false,
      },
      invalid_signature: {
        status: parsed.get("invalid-signature").status,
        outcome: "generic-unauthorized",
        request_shape: "exact-fixed-invalid-signature-request",
        exact_body: true,
        metadata_exposed: false,
      },
    },
  };
}

function decodeBase64Url(value, label) {
  requireString(value, label);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} is not canonical base64url`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error(`${label} is not canonical base64url`);
  }
  return decoded;
}

function decodeBase64Der(value, label) {
  requireString(value, label);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`${label} is not canonical DER base64`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.toString("base64") !== value) {
    throw new Error(`${label} is not canonical DER base64`);
  }
  return decoded;
}

function parseSignedReceipt(token, publicKeySpkiDerBase64) {
  const parts = requireString(token, "signed client-IP deployment receipt").split(".");
  if (parts.length !== 2) {
    throw new Error("signed client-IP deployment receipt has an invalid format");
  }
  const [encodedPayload, encodedSignature] = parts;
  const supplied = decodeBase64Url(encodedSignature, "client-IP receipt signature");
  if (supplied.length !== 64) {
    throw new Error("client-IP deployment receipt signature is invalid");
  }
  let publicKey;
  try {
    const publicKeyDer = decodeBase64Der(
      publicKeySpkiDerBase64,
      "client-IP receipt Ed25519 public key",
    );
    publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: "der",
      type: "spki",
    });
    if (
      !Buffer.from(
        publicKey.export({ format: "der", type: "spki" }),
      ).equals(publicKeyDer)
    ) {
      throw new Error("client-IP receipt public key is not canonical public-key DER");
    }
  } catch (error) {
    throw new Error(`client-IP receipt public key is invalid: ${error.message}`);
  }
  if (
    publicKey.asymmetricKeyType !== "ed25519" ||
    !crypto.verify(null, Buffer.from(encodedPayload, "utf8"), publicKey, supplied)
  ) {
    throw new Error("client-IP deployment receipt signature is invalid");
  }
  try {
    return requirePlainObject(
      parseJsonWithoutDuplicateKeys(
        decodeBase64Url(encodedPayload, "client-IP receipt payload").toString("utf8"),
        "client-IP receipt payload",
      ),
      "client-IP receipt payload",
    );
  } catch (error) {
    throw new Error(`client-IP deployment receipt payload is invalid: ${error.message}`);
  }
}

export function buildClientIpDeployReceiptPayload({
  targetFunction,
  dispatchNonce,
  deploySha,
  projectRef,
  extractorSource,
  probeTemplateSource,
  artifactPaths,
  now = new Date(),
}) {
  if (!PROTECTED_FUNCTIONS.has(targetFunction)) {
    throw new Error("client-IP receipt issuer requires one exact protected function");
  }
  if (!DISPATCH_NONCE.test(dispatchNonce ?? "")) {
    throw new Error("client-IP receipt issuer requires a 32-128 character dispatch nonce");
  }
  if (!FULL_SHA.test(deploySha ?? "")) {
    throw new Error("client-IP receipt issuer requires the exact target SHA");
  }
  requireString(projectRef, "Supabase project ref");
  const paths = assertExactKeys(
    artifactPaths,
    [
      "functions_pre_path",
      "functions_canary_path",
      "functions_delete_recheck_path",
      "functions_post_path",
      "probe_ezbr_canary_path",
      "probe_ezbr_delete_recheck_path",
      "secrets_pre_path",
      "secrets_canary_path",
      "secrets_delete_recheck_path",
      "secrets_post_path",
      "compute_pre_path",
      "compute_created_path",
      "compute_post_path",
      "render_root",
      "captured_source_root",
      "request_artifact_manifest_path",
      "operator_attestation_path",
    ],
    "client-IP issuer artifact paths",
  );
  const expectedArtifacts = expectedClientIpProbeArtifacts({
    deploySha,
    templateSource: probeTemplateSource,
    extractorSource,
  });
  const rootBinding = assertDisjointArtifactRoots(
    paths.render_root,
    paths.captured_source_root,
  );
  const renderedSource = renderedClientIpProbeManifest(paths.render_root);
  const capturedSource = capturedClientIpProbeManifest(paths.captured_source_root);
  if (
    renderedSource.sha256 !== expectedArtifacts.sourceManifestSha256 ||
    capturedSource.sha256 !== expectedArtifacts.sourceManifestSha256
  ) {
    throw new Error(
      "rendered or operator-captured source differs from the exact derived source manifest",
    );
  }

  const functionsPre = functionCapture(
    paths.functions_pre_path,
    "client-IP preflight function metadata",
    projectRef,
  );
  const functionsCanary = functionCapture(
    paths.functions_canary_path,
    "client-IP canary function metadata",
    projectRef,
  );
  const functionsRecheck = functionCapture(
    paths.functions_delete_recheck_path,
    "client-IP delete-recheck function metadata",
    projectRef,
  );
  const functionsPost = functionCapture(
    paths.functions_post_path,
    "client-IP postflight function metadata",
    projectRef,
  );
  const ezbrCanary = readSecureBuffer(
    paths.probe_ezbr_canary_path,
    "client-IP canary ezbr bundle artifact",
    MAX_EZBR_BYTES,
  );
  const ezbrRecheck = readSecureBuffer(
    paths.probe_ezbr_delete_recheck_path,
    "client-IP delete-recheck ezbr bundle artifact",
    MAX_EZBR_BYTES,
  );
  const ezbrCanarySha256 = sha256(ezbrCanary.buffer);
  const ezbrRecheckSha256 = sha256(ezbrRecheck.buffer);
  if (
    ezbrCanary.metadata.size === 0 || ezbrRecheck.metadata.size === 0 ||
    ezbrCanarySha256 !== functionsCanary.probeEzbrSha256 ||
    ezbrRecheckSha256 !== functionsRecheck.probeEzbrSha256 ||
    ezbrCanarySha256 !== ezbrRecheckSha256
  ) {
    throw new Error(
      "captured Management API body bytes differ from capture metadata/recheck",
    );
  }
  const secretsPre = secretCapture(
    paths.secrets_pre_path,
    "client-IP preflight secret metadata",
    projectRef,
  );
  const secretsCanary = secretCapture(
    paths.secrets_canary_path,
    "client-IP canary secret metadata",
    projectRef,
  );
  const secretsRecheck = secretCapture(
    paths.secrets_delete_recheck_path,
    "client-IP delete-recheck secret metadata",
    projectRef,
  );
  const secretsPost = secretCapture(
    paths.secrets_post_path,
    "client-IP postflight secret metadata",
    projectRef,
  );
  const computePre = computeCapture(
    paths.compute_pre_path,
    "client-IP preflight compute metadata",
  );
  const computeCreated = computeCapture(
    paths.compute_created_path,
    "client-IP created compute metadata",
  );
  const computePost = computeCapture(
    paths.compute_post_path,
    "client-IP postflight compute metadata",
  );
  const attestation = readOperatorAttestation(paths.operator_attestation_path);
  const manifest = requestManifest(paths.request_artifact_manifest_path);
  assertUniqueInputInodes([
    { ...functionsPre.artifact, label: "preflight function metadata" },
    { ...functionsCanary.artifact, label: "canary function metadata" },
    { ...functionsRecheck.artifact, label: "delete-recheck function metadata" },
    { ...functionsPost.artifact, label: "postflight function metadata" },
    { ...ezbrCanary, label: "canary ezbr bundle artifact" },
    { ...ezbrRecheck, label: "delete-recheck ezbr bundle artifact" },
    { ...secretsPre.artifact, label: "preflight secret metadata" },
    { ...secretsCanary.artifact, label: "canary secret metadata" },
    { ...secretsRecheck.artifact, label: "delete-recheck secret metadata" },
    { ...secretsPost.artifact, label: "postflight secret metadata" },
    { ...computePre.artifact, label: "preflight compute metadata" },
    { ...computeCreated.artifact, label: "created compute metadata" },
    { ...computePost.artifact, label: "postflight compute metadata" },
    { ...attestation.artifact, label: "operator attestation" },
    { ...manifest.artifact, label: "request artifact manifest" },
  ]);

  if (functionsPre.probe || functionsPost.probe) {
    throw new Error("client-IP probe must be absent from preflight and postflight catalogs");
  }
  if (
    functionsPre.probeEzbrSha256 !== null ||
    functionsPost.probeEzbrSha256 !== null
  ) {
    throw new Error("probe bundle digest must be null when the probe is absent");
  }
  if (functionsPre.canonicalFunctions !== functionsPost.canonicalFunctions) {
    throw new Error("full pre/post function metadata differs");
  }
  if (
    secretsPre.canonicalSecrets !== secretsCanary.canonicalSecrets ||
    secretsPre.canonicalSecrets !== secretsRecheck.canonicalSecrets ||
    secretsPre.canonicalSecrets !== secretsPost.canonicalSecrets
  ) {
    throw new Error("full secret metadata differs across the mutation window");
  }
  if (
    computePre.createdDropletId !== null || computePost.createdDropletId !== null ||
    computeCreated.createdDropletId === null ||
    computePre.canonicalDroplets !== computePost.canonicalDroplets
  ) {
    throw new Error("ephemeral compute pre/created/post metadata is inconsistent");
  }
  const createdId = computeCreated.createdDropletId;
  const createdRows = computeCreated.droplets.filter((row) =>
    String(row.id) === createdId
  );
  if (
    createdRows.length !== 1 ||
    computePre.droplets.some((row) => String(row.id) === createdId) ||
    computePost.droplets.some((row) => String(row.id) === createdId) ||
    canonicalUnorderedRows(
      computeCreated.droplets.filter((row) => String(row.id) !== createdId),
      "created compute baseline",
    ) !== computePre.canonicalDroplets
  ) {
    throw new Error("created ephemeral compute ID is not uniquely added then absent");
  }
  const canaryTuple = exactProbeTuple(
    functionsCanary,
    projectRef,
    "client-IP canary metadata",
  );
  const recheckTuple = exactProbeTuple(
    functionsRecheck,
    projectRef,
    "client-IP delete-recheck metadata",
  );
  const comparableCanaryTuple = { ...canaryTuple };
  const comparableRecheckTuple = { ...recheckTuple };
  delete comparableCanaryTuple.tupleSha256;
  delete comparableRecheckTuple.tupleSha256;
  if (
    canonicalJson(comparableCanaryTuple, "canary tuple") !==
      canonicalJson(comparableRecheckTuple, "delete-recheck tuple") ||
    functionsCanary.canonicalFunctions !== functionsRecheck.canonicalFunctions
  ) {
    throw new Error("delete recheck does not match the exact ACTIVE canaried tuple/catalog");
  }
  const baseCatalog = functionsPre.canonicalFunctions;
  if (
    catalogWithoutProbe(functionsCanary, "canary") !== baseCatalog ||
    catalogWithoutProbe(functionsRecheck, "delete recheck") !== baseCatalog
  ) {
    throw new Error("non-probe function metadata changed during the mutation window");
  }

  const deploymentId = `${projectRef}_${canaryTuple.id}_${canaryTuple.version}`;
  const requestArtifacts = readRequestArtifacts(manifest, deploySha, deploymentId);
  const requestReceipt = buildRequestReceipt(
    requestArtifacts.parsed,
    deploySha,
    deploymentId,
  );
  const observationTimes = [...requestArtifacts.parsed.values()].map((item) =>
    item.observedAt
  );
  const requestTimes = [...requestArtifacts.parsed.values()].map((item) =>
    item.requestAt
  );
  const firstRequestAt = Math.min(...requestTimes);
  const canaryCheckedAt = Math.max(...observationTimes);

  if (
    attestation.windowStartedAt > functionsPre.capturedAt ||
    attestation.windowStartedAt > secretsPre.capturedAt ||
    attestation.windowStartedAt > computePre.capturedAt ||
    computePre.capturedAt > computeCreated.capturedAt ||
    computeCreated.capturedAt > functionsPre.capturedAt ||
    functionsPre.capturedAt > functionsCanary.capturedAt ||
    secretsPre.capturedAt > functionsCanary.capturedAt ||
    secretsCanary.capturedAt > firstRequestAt ||
    functionsCanary.capturedAt > firstRequestAt ||
    canaryCheckedAt > functionsRecheck.capturedAt ||
    canaryCheckedAt > secretsRecheck.capturedAt ||
    functionsRecheck.capturedAt > attestation.probeDeletedAt ||
    secretsRecheck.capturedAt > attestation.probeDeletedAt ||
    attestation.probeDeletedAt > functionsPost.capturedAt ||
    attestation.probeDeletedAt > secretsPost.capturedAt ||
    functionsPost.capturedAt > computePost.capturedAt ||
    secretsPost.capturedAt > computePost.capturedAt ||
    computePost.capturedAt > attestation.windowEndedAt ||
    functionsPost.capturedAt > attestation.windowEndedAt ||
    secretsPost.capturedAt > attestation.windowEndedAt ||
    attestation.windowEndedAt > now.getTime() ||
    attestation.windowEndedAt - attestation.windowStartedAt >
      MAX_RECEIPT_LIFETIME_MS ||
    attestation.probeDeletedAt - functionsRecheck.capturedAt >
      MAX_DELETE_RECHECK_GAP_MS
  ) {
    throw new Error("client-IP raw-artifact capture/delete ordering is invalid");
  }

  const payload = {
    receipt_version: 3,
    receipt_signature_scheme: "ed25519",
    project_ref: projectRef,
    target_function: targetFunction,
    target_source_sha: deploySha,
    dispatch_nonce: dispatchNonce,
    ci_trust_boundary: {
      integrity_basis: "authorized-human-review-and-exact-sha-verification",
      authorized_human_review_and_merge_required: true,
      authorized_maintainer_ci_mutation_self_protected: false,
      external_branch_protection_independently_verified: false,
    },
    source_binding: {
      extractor_sha256: expectedArtifacts.extractorSha256,
      probe_template_sha256: expectedArtifacts.templateSha256,
      rendered_wrapper_sha256: expectedArtifacts.renderedWrapperSha256,
      expected_source_manifest_sha256: expectedArtifacts.sourceManifestSha256,
      rendered_source_manifest_sha256: renderedSource.sha256,
      operator_captured_source_manifest_sha256: capturedSource.sha256,
      artifact_provenance_scope: "signer-attested-operator-capture",
      platform_origin_independently_verified: false,
      render_and_capture_roots_disjoint: rootBinding.rootsDisjoint,
      artifact_files_inode_disjoint: rootBinding.artifactFilesInodeDisjoint,
    },
    operator_captured_ezbr_bundle_sha256:
      canaryTuple.managementApiBodySha256,
    probe_function: {
      slug: canaryTuple.slug,
      id: canaryTuple.id,
      version: canaryTuple.version,
      status: canaryTuple.status,
      deno_deployment_id: deploymentId,
      ezbr_sha256: canaryTuple.ezbr_sha256,
      management_api_body_sha256: canaryTuple.managementApiBodySha256,
      management_api_body_bytes_hashed_by_issuer: true,
      management_api_tuple_sha256: canaryTuple.tupleSha256,
    },
    auth: {
      scheme: "hmac-sha256",
      key_secret_name: "LEAD_NOTIFICATION_WORKER_TOKEN",
      context: "client-ip-probe-v1",
      source_env_reads: [
        "DENO_DEPLOYMENT_ID",
        "LEAD_NOTIFICATION_WORKER_TOKEN",
      ],
      intake_secret_read_by_probe_source: false,
      service_role_read_by_probe_source: false,
      env_to_object_used_by_probe_source: false,
    },
    canary_checked_at: new Date(canaryCheckedAt).toISOString(),
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + MAX_RECEIPT_LIFETIME_MS).toISOString(),
    requests: requestReceipt,
    metadata_integrity: {
      functions_pre_sha256: functionsPre.functionsSha256,
      functions_canary_sha256: functionsCanary.functionsSha256,
      functions_delete_recheck_sha256: functionsRecheck.functionsSha256,
      functions_post_sha256: functionsPost.functionsSha256,
      functions_pre_post_equal: true,
      functions_canary_delete_recheck_equal: true,
      non_probe_catalog_unchanged: true,
      probe_absent_preflight: true,
      probe_absent_postflight: true,
      secrets_pre_sha256: secretsPre.secretsSha256,
      secrets_canary_sha256: secretsCanary.secretsSha256,
      secrets_delete_recheck_sha256: secretsRecheck.secretsSha256,
      secrets_post_sha256: secretsPost.secretsSha256,
      secrets_all_stages_equal: true,
      compute_pre_sha256: computePre.dropletsSha256,
      compute_created_sha256: computeCreated.dropletsSha256,
      compute_post_sha256: computePost.dropletsSha256,
      compute_pre_post_equal: true,
      ephemeral_compute_created_id_sha256: sha256(createdId),
      ephemeral_compute_created_then_absent: true,
    },
    mutation_control: {
      exclusive_mutation_window: true,
      exclusive_window_started_at: attestation.value.exclusive_window_started_at,
      delete_rechecked_at: functionsRecheck.capturedAtText,
      probe_deleted_at: attestation.value.probe_deleted_at,
      exclusive_window_ended_at: attestation.value.exclusive_window_ended_at,
      delete_scope: "literal-slug-only",
      deletion_target: PROBE_SLUG,
      deletion_atomicity: "non-atomic-slug-delete-after-exact-tuple-recheck",
      probe_secret_mutation_count: 0,
      delete_recheck: {
        slug: recheckTuple.slug,
        id: recheckTuple.id,
        version: recheckTuple.version,
        status: recheckTuple.status,
        deno_deployment_id: deploymentId,
        operator_captured_ezbr_bundle_sha256:
          recheckTuple.managementApiBodySha256,
        management_api_body_bytes_hashed_by_issuer: true,
        management_api_tuple_sha256: recheckTuple.tupleSha256,
      },
    },
    evidence_policy: {
      sanitized: true,
      raw_operator_artifacts_embedded_in_receipt: false,
      artifact_origin_scope: "signer-attested-not-independently-verified",
      raw_client_identity_values_in_receipt: false,
      secret_values_in_receipt: false,
    },
    cleanup: {
      probe_function_deleted: true,
      ephemeral_compute_destroyed: true,
    },
  };
  return { payload };
}

function verifySignedPositiveCase(item, label, family, deploySha, deploymentId, outcome) {
  const expectedKeys = [
    "status",
    "outcome",
    "request_shape",
    "observed_family",
    "target_source_sha",
    "deno_deployment_id",
  ];
  if (label.endsWith("baseline")) {
    expectedKeys.push("canonical_source", "derived_key");
  }
  assertExactKeys(item, expectedKeys, label);
  if (
    item.status !== 200 || item.outcome !== outcome ||
    item.request_shape !== "exact-captured-request" ||
    item.observed_family !== family || item.target_source_sha !== deploySha ||
    item.deno_deployment_id !== deploymentId
  ) {
    throw new Error(`${label} lacks exact HTTP/family/runtime binding`);
  }
  if (
    label.endsWith("baseline") &&
    (item.canonical_source !== "cf-connecting-ip" ||
      item.derived_key !== "64-lowercase-hex-raw-free")
  ) {
    throw new Error(`${label} lacks canonical raw-free baseline evidence`);
  }
}

function verifyMatrixPath(pathEvidence, label, deploySha, deploymentId) {
  assertExactKeys(
    pathEvidence,
    [
      "path",
      "baseline",
      "forged_cf_connecting_ip",
      "forged_x_real_ip",
      "forged_x_forwarded_for",
    ],
    label,
  );
  if (pathEvidence.path !== "passed") {
    throw new Error(`client-IP receipt lacks passed ${label} path evidence`);
  }
  verifySignedPositiveCase(
    pathEvidence.baseline,
    `${label} baseline`,
    label,
    deploySha,
    deploymentId,
    "passed",
  );
  for (const [name, outcome] of [
    [
      "forged_cf_connecting_ip",
      "gateway-overwritten-selected-fingerprint-unchanged",
    ],
    ["forged_x_real_ip", "selected-fingerprint-unchanged"],
    ["forged_x_forwarded_for", "selected-fingerprint-unchanged"],
  ]) {
    verifySignedPositiveCase(
      pathEvidence[name],
      `${label} ${name}`,
      label,
      deploySha,
      deploymentId,
      outcome,
    );
  }
}

function verifyNegativeAuth(result, label) {
  assertExactKeys(
    result,
    ["status", "outcome", "request_shape", "exact_body", "metadata_exposed"],
    `negative auth ${label}`,
  );
  if (
    result.status !== 401 || result.outcome !== "generic-unauthorized" ||
    result.request_shape !== (label === "missing signature"
      ? "exact-missing-signature-request"
      : "exact-fixed-invalid-signature-request") ||
    result.exact_body !== true || result.metadata_exposed !== false
  ) {
    throw new Error(`client-IP receipt lacks exact generic 401 ${label} evidence`);
  }
}

export function verifyClientIpDeployReceipt({
  functionName,
  dispatchNonce,
  deploySha,
  projectRef,
  extractorSource,
  probeTemplateSource,
  receiptToken,
  publicKeySpkiDerBase64,
  finalFunctionsPath,
  finalSecretsPath,
  now = new Date(),
}) {
  if (!PROTECTED_FUNCTIONS.has(functionName)) return { required: false };
  if (!FULL_SHA.test(deploySha ?? "")) {
    throw new Error("client-IP receipt requires the exact 40-character deploy SHA");
  }
  if (!DISPATCH_NONCE.test(dispatchNonce ?? "")) {
    throw new Error("client-IP receipt requires the exact dispatch nonce");
  }
  requireString(projectRef, "Supabase project ref");
  const templateViolations = clientIpProbeTemplateViolations(
    requireString(probeTemplateSource, "client-IP probe template source"),
  );
  if (templateViolations.length > 0) {
    throw new Error(
      `client-IP probe template violates the source contract: ${templateViolations.join(",")}`,
    );
  }
  const expectedArtifacts = expectedClientIpProbeArtifacts({
    deploySha,
    templateSource: probeTemplateSource,
    extractorSource: requireString(extractorSource, "client-IP extractor source"),
  });
  const receipt = parseSignedReceipt(receiptToken, publicKeySpkiDerBase64);
  assertExactKeys(
    receipt,
    [
      "receipt_version",
      "receipt_signature_scheme",
      "project_ref",
      "target_function",
      "target_source_sha",
      "dispatch_nonce",
      "ci_trust_boundary",
      "source_binding",
      "operator_captured_ezbr_bundle_sha256",
      "probe_function",
      "auth",
      "canary_checked_at",
      "issued_at",
      "expires_at",
      "requests",
      "metadata_integrity",
      "mutation_control",
      "evidence_policy",
      "cleanup",
    ],
    "client-IP receipt",
  );
  if (
    receipt.receipt_version !== 3 ||
    receipt.receipt_signature_scheme !== "ed25519"
  ) {
    throw new Error("unsupported client-IP receipt version/signature scheme");
  }
  if (receipt.project_ref !== projectRef) {
    throw new Error("client-IP receipt project does not match deploy project");
  }
  if (receipt.target_function !== functionName) {
    throw new Error("client-IP receipt is not bound to this protected function");
  }
  if (receipt.target_source_sha !== deploySha) {
    throw new Error("client-IP receipt is not bound to the exact target source SHA");
  }
  if (receipt.dispatch_nonce !== dispatchNonce) {
    throw new Error("client-IP receipt dispatch nonce does not match this run");
  }

  const trustBoundary = assertExactKeys(
    receipt.ci_trust_boundary,
    [
      "integrity_basis",
      "authorized_human_review_and_merge_required",
      "authorized_maintainer_ci_mutation_self_protected",
      "external_branch_protection_independently_verified",
    ],
    "client-IP CI trust boundary",
  );
  if (
    trustBoundary.integrity_basis !==
      "authorized-human-review-and-exact-sha-verification" ||
    trustBoundary.authorized_human_review_and_merge_required !== true ||
    trustBoundary.authorized_maintainer_ci_mutation_self_protected !== false ||
    trustBoundary.external_branch_protection_independently_verified !== false
  ) {
    throw new Error("client-IP CI trust boundary is overstated or incomplete");
  }

  const sourceBinding = assertExactKeys(
    receipt.source_binding,
    [
      "extractor_sha256",
      "probe_template_sha256",
      "rendered_wrapper_sha256",
      "expected_source_manifest_sha256",
      "rendered_source_manifest_sha256",
      "operator_captured_source_manifest_sha256",
      "artifact_provenance_scope",
      "platform_origin_independently_verified",
      "render_and_capture_roots_disjoint",
      "artifact_files_inode_disjoint",
    ],
    "client-IP source binding",
  );
  const sourceDigests = {
    extractor_sha256: expectedArtifacts.extractorSha256,
    probe_template_sha256: expectedArtifacts.templateSha256,
    rendered_wrapper_sha256: expectedArtifacts.renderedWrapperSha256,
    expected_source_manifest_sha256: expectedArtifacts.sourceManifestSha256,
    rendered_source_manifest_sha256: expectedArtifacts.sourceManifestSha256,
    operator_captured_source_manifest_sha256: expectedArtifacts.sourceManifestSha256,
  };
  for (const [name, expected] of Object.entries(sourceDigests)) {
    requireDigest(sourceBinding[name], `client-IP ${name}`);
    if (sourceBinding[name] !== expected) {
      throw new Error(`client-IP receipt ${name} differs from exact source`);
    }
  }
  if (
    sourceBinding.artifact_provenance_scope !==
      "signer-attested-operator-capture" ||
    sourceBinding.platform_origin_independently_verified !== false ||
    sourceBinding.render_and_capture_roots_disjoint !== true ||
    sourceBinding.artifact_files_inode_disjoint !== true
  ) {
    throw new Error("client-IP source provenance scope or root separation is invalid");
  }
  requireDigest(
    receipt.operator_captured_ezbr_bundle_sha256,
    "client-IP operator-captured ezbr bundle SHA-256",
  );

  const probe = assertExactKeys(
    receipt.probe_function,
    [
      "slug",
      "id",
      "version",
      "status",
      "deno_deployment_id",
      "ezbr_sha256",
      "management_api_body_sha256",
      "management_api_body_bytes_hashed_by_issuer",
      "management_api_tuple_sha256",
    ],
    "client-IP probe function",
  );
  if (
    probe.slug !== PROBE_SLUG || !UUID.test(probe.id ?? "") ||
    !Number.isSafeInteger(probe.version) || probe.version < 1 ||
    probe.status !== "ACTIVE"
  ) {
    throw new Error("client-IP receipt lacks the actual ACTIVE probe tuple");
  }
  const deploymentId = `${projectRef}_${probe.id}_${probe.version}`;
  if (probe.deno_deployment_id !== deploymentId) {
    throw new Error("client-IP receipt DENO_DEPLOYMENT_ID does not match the probe tuple");
  }
  requireDigest(probe.ezbr_sha256, "client-IP probe ezbr SHA-256");
  requireDigest(
    probe.management_api_body_sha256,
    "client-IP Management API body SHA-256",
  );
  requireDigest(
    probe.management_api_tuple_sha256,
    "client-IP management API tuple SHA-256",
  );
  const tuple = {
    project_ref: projectRef,
    slug: probe.slug,
    id: probe.id,
    version: probe.version,
    status: probe.status,
    ezbr_sha256: probe.ezbr_sha256,
  };
  if (
    probe.management_api_body_sha256 !==
      receipt.operator_captured_ezbr_bundle_sha256 ||
    probe.management_api_body_bytes_hashed_by_issuer !== true ||
    probe.management_api_tuple_sha256 !==
      sha256(canonicalJson(tuple, "receipt management API tuple"))
  ) {
    throw new Error(
      "client-IP receipt probe body/provider-management tuple differs",
    );
  }

  const auth = assertExactKeys(
    receipt.auth,
    [
      "scheme",
      "key_secret_name",
      "context",
      "source_env_reads",
      "intake_secret_read_by_probe_source",
      "service_role_read_by_probe_source",
      "env_to_object_used_by_probe_source",
    ],
    "client-IP probe auth",
  );
  if (
    auth.scheme !== "hmac-sha256" ||
    auth.key_secret_name !== "LEAD_NOTIFICATION_WORKER_TOKEN" ||
    auth.context !== "client-ip-probe-v1" ||
    JSON.stringify(auth.source_env_reads) !== JSON.stringify([
      "DENO_DEPLOYMENT_ID",
      "LEAD_NOTIFICATION_WORKER_TOKEN",
    ]) ||
    auth.intake_secret_read_by_probe_source !== false ||
    auth.service_role_read_by_probe_source !== false ||
    auth.env_to_object_used_by_probe_source !== false
  ) {
    throw new Error("client-IP receipt lacks the exact worker-token source contract");
  }

  const issuedAt = parseIsoTimestamp(receipt.issued_at, "client-IP receipt issued_at");
  const expiresAt = parseIsoTimestamp(receipt.expires_at, "client-IP receipt expires_at");
  const checkedAt = parseIsoTimestamp(
    receipt.canary_checked_at,
    "client-IP canary_checked_at",
  );
  const nowMs = now.getTime();
  if (
    issuedAt > nowMs + MAX_CLOCK_SKEW_MS || expiresAt <= nowMs ||
    expiresAt > nowMs + MAX_RECEIPT_LIFETIME_MS ||
    checkedAt > nowMs + MAX_CLOCK_SKEW_MS || nowMs - checkedAt > MAX_CANARY_AGE_MS
  ) {
    throw new Error("client-IP receipt or canary is stale or future-dated");
  }
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_RECEIPT_LIFETIME_MS) {
    throw new Error("client-IP receipt lifetime must be positive and no more than 15 minutes");
  }
  if (checkedAt > issuedAt + MAX_CLOCK_SKEW_MS) {
    throw new Error("client-IP receipt was issued before its canary completed");
  }

  const requests = assertExactKeys(
    receipt.requests,
    [
      "authenticated_request_count",
      "negative_auth_request_count",
      "total_request_count",
      "matrix",
      "negative_auth",
    ],
    "client-IP request evidence",
  );
  if (
    requests.authenticated_request_count !== 8 ||
    requests.negative_auth_request_count !== 2 ||
    requests.total_request_count !== 10
  ) {
    throw new Error("client-IP receipt requires exactly 8 authenticated plus 2 negative requests");
  }
  const matrix = assertExactKeys(
    requests.matrix,
    ["ipv4", "ipv6"],
    "client-IP request matrix",
  );
  verifyMatrixPath(matrix.ipv4, "ipv4", deploySha, deploymentId);
  verifyMatrixPath(matrix.ipv6, "ipv6", deploySha, deploymentId);
  const negative = assertExactKeys(
    requests.negative_auth,
    ["missing_signature", "invalid_signature"],
    "client-IP negative auth evidence",
  );
  verifyNegativeAuth(negative.missing_signature, "missing signature");
  verifyNegativeAuth(negative.invalid_signature, "invalid signature");

  const metadata = assertExactKeys(
    receipt.metadata_integrity,
    [
      "functions_pre_sha256",
      "functions_canary_sha256",
      "functions_delete_recheck_sha256",
      "functions_post_sha256",
      "functions_pre_post_equal",
      "functions_canary_delete_recheck_equal",
      "non_probe_catalog_unchanged",
      "probe_absent_preflight",
      "probe_absent_postflight",
      "secrets_pre_sha256",
      "secrets_canary_sha256",
      "secrets_delete_recheck_sha256",
      "secrets_post_sha256",
      "secrets_all_stages_equal",
      "compute_pre_sha256",
      "compute_created_sha256",
      "compute_post_sha256",
      "compute_pre_post_equal",
      "ephemeral_compute_created_id_sha256",
      "ephemeral_compute_created_then_absent",
    ],
    "client-IP metadata integrity",
  );
  for (const digestName of [
    "functions_pre_sha256",
    "functions_canary_sha256",
    "functions_delete_recheck_sha256",
    "functions_post_sha256",
    "secrets_pre_sha256",
    "secrets_canary_sha256",
    "secrets_delete_recheck_sha256",
    "secrets_post_sha256",
    "compute_pre_sha256",
    "compute_created_sha256",
    "compute_post_sha256",
    "ephemeral_compute_created_id_sha256",
  ]) requireDigest(metadata[digestName], `client-IP ${digestName}`);
  if (
    metadata.functions_pre_sha256 !== metadata.functions_post_sha256 ||
    metadata.functions_canary_sha256 !==
      metadata.functions_delete_recheck_sha256 ||
    metadata.secrets_pre_sha256 !== metadata.secrets_canary_sha256 ||
    metadata.secrets_pre_sha256 !== metadata.secrets_delete_recheck_sha256 ||
    metadata.secrets_pre_sha256 !== metadata.secrets_post_sha256 ||
    metadata.compute_pre_sha256 !== metadata.compute_post_sha256 ||
    metadata.compute_created_sha256 === metadata.compute_pre_sha256 ||
    metadata.functions_pre_post_equal !== true ||
    metadata.functions_canary_delete_recheck_equal !== true ||
    metadata.non_probe_catalog_unchanged !== true ||
    metadata.probe_absent_preflight !== true ||
    metadata.probe_absent_postflight !== true ||
    metadata.secrets_all_stages_equal !== true ||
    metadata.compute_pre_post_equal !== true ||
    metadata.ephemeral_compute_created_then_absent !== true
  ) {
    throw new Error("client-IP receipt lacks artifact-derived metadata restoration");
  }
  const finalFunctions = finalFunctionState(finalFunctionsPath);
  const finalSecrets = finalSecretState(finalSecretsPath);
  assertUniqueInputInodes([
    { ...finalFunctions.artifact, label: "final live function metadata" },
    { ...finalSecrets.artifact, label: "final live secret metadata" },
  ]);
  if (
    finalFunctions.sha256 !== metadata.functions_post_sha256 ||
    finalSecrets.sha256 !== metadata.secrets_post_sha256
  ) {
    throw new Error(
      "final live Supabase function/secret metadata differs from signed postflight",
    );
  }

  const mutation = assertExactKeys(
    receipt.mutation_control,
    [
      "exclusive_mutation_window",
      "exclusive_window_started_at",
      "delete_rechecked_at",
      "probe_deleted_at",
      "exclusive_window_ended_at",
      "delete_scope",
      "deletion_target",
      "deletion_atomicity",
      "probe_secret_mutation_count",
      "delete_recheck",
    ],
    "client-IP mutation control",
  );
  if (
    mutation.exclusive_mutation_window !== true ||
    mutation.delete_scope !== "literal-slug-only" ||
    mutation.deletion_target !== PROBE_SLUG ||
    mutation.deletion_atomicity !==
      "non-atomic-slug-delete-after-exact-tuple-recheck" ||
    mutation.probe_secret_mutation_count !== 0
  ) {
    throw new Error("client-IP receipt lacks explicit non-atomic slug-only deletion controls");
  }
  const windowStartedAt = parseIsoTimestamp(
    mutation.exclusive_window_started_at,
    "client-IP exclusive window start",
  );
  const deleteRecheckedAt = parseIsoTimestamp(
    mutation.delete_rechecked_at,
    "client-IP delete tuple recheck",
  );
  const probeDeletedAt = parseIsoTimestamp(
    mutation.probe_deleted_at,
    "client-IP probe deletion",
  );
  const windowEndedAt = parseIsoTimestamp(
    mutation.exclusive_window_ended_at,
    "client-IP exclusive window end",
  );
  if (
    windowStartedAt > checkedAt || checkedAt > deleteRecheckedAt ||
    deleteRecheckedAt > probeDeletedAt || probeDeletedAt > windowEndedAt ||
    windowEndedAt > issuedAt ||
    windowEndedAt - windowStartedAt > MAX_RECEIPT_LIFETIME_MS ||
    probeDeletedAt - deleteRecheckedAt > MAX_DELETE_RECHECK_GAP_MS
  ) {
    throw new Error("client-IP mutation-window/canary/delete ordering is invalid");
  }
  const deleteRecheck = assertExactKeys(
    mutation.delete_recheck,
    [
      "slug",
      "id",
      "version",
      "status",
      "deno_deployment_id",
      "operator_captured_ezbr_bundle_sha256",
      "management_api_body_bytes_hashed_by_issuer",
      "management_api_tuple_sha256",
    ],
    "client-IP delete tuple recheck",
  );
  if (
    deleteRecheck.slug !== probe.slug || deleteRecheck.id !== probe.id ||
    deleteRecheck.version !== probe.version || deleteRecheck.status !== probe.status ||
    deleteRecheck.deno_deployment_id !== probe.deno_deployment_id ||
    deleteRecheck.operator_captured_ezbr_bundle_sha256 !==
      probe.management_api_body_sha256 ||
    deleteRecheck.management_api_body_bytes_hashed_by_issuer !== true ||
    deleteRecheck.management_api_tuple_sha256 !== probe.management_api_tuple_sha256
  ) {
    throw new Error("client-IP delete tuple does not match the exact ACTIVE canaried probe");
  }

  const policy = assertExactKeys(
    receipt.evidence_policy,
    [
      "sanitized",
      "raw_operator_artifacts_embedded_in_receipt",
      "artifact_origin_scope",
      "raw_client_identity_values_in_receipt",
      "secret_values_in_receipt",
    ],
    "client-IP evidence policy",
  );
  if (
    policy.sanitized !== true ||
    policy.raw_operator_artifacts_embedded_in_receipt !== false ||
    policy.artifact_origin_scope !==
      "signer-attested-not-independently-verified" ||
    policy.raw_client_identity_values_in_receipt !== false ||
    policy.secret_values_in_receipt !== false
  ) {
    throw new Error("client-IP receipt overclaims artifact provenance or embeds raw evidence");
  }
  const cleanup = assertExactKeys(
    receipt.cleanup,
    ["probe_function_deleted", "ephemeral_compute_destroyed"],
    "client-IP cleanup",
  );
  if (
    cleanup.probe_function_deleted !== true ||
    cleanup.ephemeral_compute_destroyed !== true
  ) {
    throw new Error("client-IP receipt lacks probe and ephemeral-compute cleanup");
  }

  return {
    required: true,
    targetFunction: functionName,
    dispatchNonce,
    extractorSha256: expectedArtifacts.extractorSha256,
    probeId: probe.id,
    probeVersion: probe.version,
    sourceManifestSha256: expectedArtifacts.sourceManifestSha256,
    operatorCapturedEzbrSha256: receipt.operator_captured_ezbr_bundle_sha256,
  };
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  try {
    if (process.argv.length !== 2) {
      throw new Error("client-IP verifier accepts no command-line arguments");
    }
    const extractorSource = fs.readFileSync(CLIENT_IP_EXTRACTOR_PATH, "utf8");
    const probeTemplateSource = fs.readFileSync(CLIENT_IP_PROBE_TEMPLATE_PATH, "utf8");
    const result = verifyClientIpDeployReceipt({
      functionName: process.env.FUNCTION_NAME ?? "",
      dispatchNonce: process.env.CLIENT_IP_DEPLOY_DISPATCH_NONCE ?? "",
      deploySha: process.env.DEPLOY_SHA ?? "",
      projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
      extractorSource,
      probeTemplateSource,
      receiptToken: process.env.CLIENT_IP_DEPLOY_RECEIPT_TOKEN ?? "",
      publicKeySpkiDerBase64:
        process.env.CLIENT_IP_DEPLOY_RECEIPT_PUBLIC_KEY_SPKI_DER_BASE64 ?? "",
      finalFunctionsPath: process.env.CLIENT_IP_FINAL_FUNCTIONS_PATH ?? "",
      finalSecretsPath: process.env.CLIENT_IP_FINAL_SECRETS_PATH ?? "",
    });
    console.log(
      result.required
        ? `Ed25519 client-IP deployment receipt passed for ${result.targetFunction} (extractor ${result.extractorSha256}, probe ${result.probeId} v${result.probeVersion}).`
        : "Client-IP deployment evidence is not required for this function.",
    );
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
