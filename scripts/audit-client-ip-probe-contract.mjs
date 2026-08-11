#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_IP_PROBE_TEMPLATE_PATH =
  "supabase/probe-templates/client-ip-probe/index.ts.tmpl";
const TRUSTED_MANIFEST_PATH = "scripts/client-ip-probe-audit-trusted.json";
const TRUSTED_SOURCE_PATHS = [
  ".github/workflows/compliance-gate.yml",
  ".github/workflows/deploy-edge-function.yml",
  "scripts/audit-client-ip-probe-contract.mjs",
  "scripts/issue-client-ip-deploy-receipt.mjs",
  "scripts/render-client-ip-probe.mjs",
  "scripts/test-client-ip-deploy-receipt.mjs",
  "scripts/test-owner-notification-deploy-receipt.mjs",
  "scripts/verify-client-ip-deploy-receipt.mjs",
  "supabase/functions/_shared/client-ip.ts",
  "supabase/functions/handle-lead/DEPLOY.md",
  "supabase/probe-templates/client-ip-probe/index.ts.tmpl",
];
const EXPECTED_TEMPLATE_SHA256 =
  "1a45cf1b9d7dcc7ca514ff334b81e93b5024ff45301489c1f4e9ed20535e0c53";
const ACTION_SHAS = Object.freeze({
  checkout: "11d5960a326750d5838078e36cf38b85af677262",
  setupNode: "49933ea5288caeca8642d1e84afbd3f7d6820020",
  setupDeno: "22d081ff2d3a40755e97629de92e3bcbfa7cf2ed",
  setupPython: "a26af69be951a213d495a4c3e4e4022e16d87065",
  setupSupabase: "ab058987d8d6c725971f6cf9d0b5c98467e30bd1",
});
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
const OPAQUE_EXECUTABLE_EXTENSION =
  /\.(?:apk|bin|class|com|deb|dll|dylib|elf|exe|jar|node|pkg|pyc|pyo|rpm|so(?:\.\d+)*|wasm|7z|gz|rar|tar|tgz|zip)$/i;
const SAFE_OPAQUE_ASSET_EXTENSION =
  /\.(?:afdesign|ai|avif|docx|eps|gif|ico|jpe?g|m4a|mov|mp3|mp4|otf|pdf|png|pptx|ttf|wav|webm|webp|woff2?|xlsx)$/i;
const OPAQUE_FILE_REFERENCE =
  /(?:\.(?:7z|afdesign|ai|apk|avif|bin|class|com|deb|dll|docx|dylib|elf|eps|exe|gif|gz|ico|jar|jpe?g|m4a|mov|mp3|mp4|node|otf|pdf|pkg|png|pptx|pyc|pyo|rar|rpm|so(?:\.\d+)*|tar|tgz|ttf|wasm|wav|webm|webp|woff2?|xlsx|zip)|\.DS_Store|~lock~)(?=$|[\s"';&|)])/i;
const APPROVED_OPAQUE_ARCHIVES = Object.freeze({
  "archive/frame-restoration-utah-deploy.zip":
    "65be0c8baf9085e0e60674745b3cee09092faa2470a9315fdaf9a0d29a12ad80",
  "archive/old-seo-sprint-files/frame-restoration-seo-sprint.zip":
    "33efacd10b26778c287c564894570004aed398e6408312404798db0b7a924fdf",
  "drive-photos.zip":
    "dbc56477638d3495c0e472539f3c07c86e664a679dcd4265b55fc9934d66dd41",
});
const APPROVED_OPAQUE_ASSETS = Object.freeze({
  ".DS_Store":
    "7c3a16c05a687864aa205e4b959ed7b33df334cf8293cccc786217f39ee8655d",
  "images/brand-source/01 New Primary Logo/02 Frame Restoration/ai svg/new FR logo - white words-.afdesign~lock~":
    "9cce5868882b9633ccdeb6b0e13cf8282ec44681d1d4fbd9cd51ca1f8c355226",
});
// Independent reviewed surfaces keep a locally refreshed file digest from
// silently expanding a critical tool's sinks, control flow, or subprocesses.
// These are intentionally updated only after the semantic regression suite.
const VERIFIER_SECURITY_SURFACE_SHA256 =
  "305e83850b82397e7d6d329d2c2330c0d744084b83d44dde633a9456f0939f42";
const ISSUER_SECURITY_SURFACE_SHA256 =
  "14d6554f8adab745eb06ad947c54501ad287eb40813715c1039e36a1cf672747";
const RENDERER_OUTPUT_SURFACE_SHA256 =
  "9a96422d770af9e6bddcd1a91313db157648faa9cc516b17eca992af04fbf414";
const CLIENT_TEST_SPAWN_SURFACE_SHA256 =
  "73260c1f5f1ba8aa3a0353d4a863be33271024cbd05f31c61326d0fc05508d03";
const OWNER_TEST_SPAWN_SURFACE_SHA256 =
  "506d45a03413389a4ab1d07aeedfc9b4b1908420a156e0714b614d5dc233080a";
const SCANNER_NORMALIZED_SOURCE_SHA256 =
  "5d2ff5c43e853e76b93e3566bdaa7111d239cbf31634aabd969dc8990c6f0eb2";
const SIGNED_RECEIPT_PARSER_SHA256 =
  "1e854738f0555804f52266a1833cd279ef83482b4946a63c226781be045114df";
const ISSUER_SIGNER_SHA256 =
  "9e6f5f8f33e3b57d839e2e52d77787dcbfc28ef36bf44f4c11375c8a23bd610f";
const FINAL_DEPLOY_STEP_SHA256 =
  "51684632cec58637dac60f1d85dbeb442e31bd4f7a9ee6551c2c370015acdcf0";
const REVIEWED_CRITICAL_SOURCE_SHA256 = Object.freeze({
  ".github/workflows/compliance-gate.yml":
    "14e906cdec60af7cc3000d0266e4d2f905e22afb1eb79ea1101fab28b38904be",
  ".github/workflows/deploy-edge-function.yml":
    "f03a7b4713ba291b1b0a490183bffad68edd71cfa4f922ce560355eadea542a7",
  "scripts/issue-client-ip-deploy-receipt.mjs":
    "73d295e7d088347fceef4f8fb0aea5d50e596ef276e2766789598ff257a31894",
  "scripts/render-client-ip-probe.mjs":
    "b78a424c672f9df9309748b85608b653038fc7eddd806d1d2526dbd692b9fee0",
  "scripts/test-client-ip-deploy-receipt.mjs":
    "5c54c468125446a9fb5569338d79157597771f81334857dc349c2257a531031a",
  "scripts/test-owner-notification-deploy-receipt.mjs":
    "37b1d7a82ad3f0feedb461fcd3301f92e91323eb3c3710a8d6bbbf1c48a0d8e3",
  "scripts/verify-client-ip-deploy-receipt.mjs":
    "ad9369d94e7eb177216f57bfe84f580f335d9069278148c7357403eb8c2bb2df",
  "supabase/functions/_shared/client-ip.ts":
    "3e69a5e29a473c2697b3271e68ffead3cd427bc012383eae8cc97c3998458636",
  "supabase/functions/handle-lead/DEPLOY.md":
    "7fadf17288bb180d133abda8e01c5bd11599d2c725229c9f6b18da02a01d5808",
  "supabase/probe-templates/client-ip-probe/index.ts.tmpl":
    "1a45cf1b9d7dcc7ca514ff334b81e93b5024ff45301489c1f4e9ed20535e0c53",
});
const APPROVED_DEPLOY_WORKFLOW = ".github/workflows/deploy-edge-function.yml";
const VERIFIER_ENV_READS = [
  "CLIENT_IP_DEPLOY_DISPATCH_NONCE",
  "CLIENT_IP_DEPLOY_RECEIPT_PUBLIC_KEY_SPKI_DER_BASE64",
  "CLIENT_IP_DEPLOY_RECEIPT_TOKEN",
  "CLIENT_IP_FINAL_FUNCTIONS_PATH",
  "CLIENT_IP_FINAL_SECRETS_PATH",
  "DEPLOY_SHA",
  "FUNCTION_NAME",
  "SUPABASE_PROJECT_REF",
];
const ISSUER_ENV_READS = [
  "CLIENT_IP_CAPTURED_SOURCE_ROOT",
  "CLIENT_IP_COMPUTE_CREATED_PATH",
  "CLIENT_IP_COMPUTE_POST_PATH",
  "CLIENT_IP_COMPUTE_PRE_PATH",
  "CLIENT_IP_DEPLOY_DISPATCH_NONCE",
  "CLIENT_IP_DEPLOY_RECEIPT_PRIVATE_KEY_PKCS8_DER_BASE64",
  "CLIENT_IP_FUNCTIONS_CANARY_PATH",
  "CLIENT_IP_FUNCTIONS_DELETE_RECHECK_PATH",
  "CLIENT_IP_FUNCTIONS_POST_PATH",
  "CLIENT_IP_FUNCTIONS_PRE_PATH",
  "CLIENT_IP_OPERATOR_ATTESTATION_PATH",
  "CLIENT_IP_PROBE_EZBR_CANARY_PATH",
  "CLIENT_IP_PROBE_EZBR_DELETE_RECHECK_PATH",
  "CLIENT_IP_RENDER_ROOT",
  "CLIENT_IP_REQUEST_ARTIFACT_MANIFEST_PATH",
  "CLIENT_IP_SECRETS_CANARY_PATH",
  "CLIENT_IP_SECRETS_DELETE_RECHECK_PATH",
  "CLIENT_IP_SECRETS_POST_PATH",
  "CLIENT_IP_SECRETS_PRE_PATH",
  "DEPLOY_SHA",
  "FUNCTION_NAME",
  "SUPABASE_PROJECT_REF",
];

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizedScannerDigest(source) {
  const marker = /(const SCANNER_NORMALIZED_SOURCE_SHA256 =\n  ")[0-9a-f]{64}(";)/g;
  if ((source.match(marker)?.length ?? 0) !== 1) return null;
  return digest(source.replace(
    marker,
    `$1${"0".repeat(64)}$2`,
  ));
}

function sourceSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

function hasExactImportPrelude(source, importBlock) {
  const prelude = `#!/usr/bin/env node\n\n${importBlock}\n\n`;
  if (!source.startsWith(prelude)) return false;
  const remainder = source.slice(prelude.length);
  return !/\bimport\s*(?!\.)/.test(remainder) &&
    !/^\s*export\s+[\s\S]*?\s+from\s+["']/m.test(remainder);
}

function balancedCallExpressions(source, callee) {
  const calls = [];
  const escaped = callee.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`\\b${escaped}\\s*\\(`, "g");
  for (const match of source.matchAll(matcher)) {
    const start = match.index;
    const open = source.indexOf("(", start + callee.length);
    let depth = 0;
    let quote = null;
    let escapedCharacter = false;
    let lineComment = false;
    let blockComment = false;
    let end = -1;
    for (let index = open; index < source.length; index += 1) {
      const character = source[index];
      const next = source[index + 1];
      if (lineComment) {
        if (character === "\n") lineComment = false;
        continue;
      }
      if (blockComment) {
        if (character === "*" && next === "/") {
          blockComment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (escapedCharacter) {
          escapedCharacter = false;
        } else if (character === "\\") {
          escapedCharacter = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === "/" && next === "/") {
        lineComment = true;
        index += 1;
        continue;
      }
      if (character === "/" && next === "*") {
        blockComment = true;
        index += 1;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }
    calls.push(end > start ? source.slice(start, end) : source.slice(start));
  }
  return calls;
}

function callSurfaceDigest(source, callee) {
  return digest(JSON.stringify({
    calls: balancedCallExpressions(source, callee),
    mentions: source.split(/\r?\n/).filter((line) => line.includes(callee)),
  }));
}

function securitySurfaceDigest(source, identifiers) {
  const escapedIdentifiers = identifiers
    .map((identifier) => identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const surface = new RegExp(
    `\\b(?:throw|return)\\b|console\\.(?:log|info|warn|error)|process\\.(?:stdout|stderr)|fs\\.(?:writeFile|writeFileSync|appendFile|appendFileSync|truncate|truncateSync|rename|renameSync|unlink|unlinkSync|rm|rmSync|chmod|chmodSync|chown|chownSync|copyFile|copyFileSync|link|linkSync|symlink|symlinkSync)|\\b(?:${escapedIdentifiers.join("|")})\\b`,
  );
  return digest(
    source.split(/\r?\n/).filter((line) => surface.test(line))
      .map((line) => line.trim()).join("\n"),
  );
}

function executableMagic(fileHeaderHex) {
  if (typeof fileHeaderHex !== "string" || !/^[0-9a-f]{2,128}$/.test(fileHeaderHex)) {
    return false;
  }
  return /^(?:7f454c46|4d5a|feedface|feedfacf|cefaedfe|cffaedfe|cafebabe|bebafeca|0061736d|6465780a|213c617263683e0a|2321)/i
    .test(fileHeaderHex);
}

function opaqueBinaryExecutableMagic(fileHeaderHex) {
  if (typeof fileHeaderHex !== "string" || !/^[0-9a-f]{2,128}$/.test(fileHeaderHex)) {
    return false;
  }
  return /^(?:7f454c46|4d5a|feedface|feedfacf|cefaedfe|cffaedfe|cafebabe|bebafeca|0061736d|6465780a|213c617263683e0a)/i
    .test(fileHeaderHex);
}

function safeOpaqueAssetMagic(relative, fileHeaderHex) {
  if (typeof fileHeaderHex !== "string" || !/^[0-9a-f]{2,128}$/.test(fileHeaderHex)) {
    return false;
  }
  const extension = path.extname(relative).toLowerCase();
  const signatures = {
    ".afdesign": /^00ff4b41/,
    ".ai": /^(?:25504446|25215053)/,
    ".avif": /^[0-9a-f]{8}66747970(?:61766966|61766973)/,
    ".docx": /^504b0[357][048]/,
    ".eps": /^(?:c5d0d3c6|25215053)/,
    ".gif": /^47494638(?:3761|3961)/,
    ".ico": /^00000100/,
    ".jpeg": /^ffd8ff/,
    ".jpg": /^ffd8ff/,
    ".m4a": /^[0-9a-f]{8}66747970/,
    ".mov": /^[0-9a-f]{8}66747970/,
    ".mp3": /^(?:494433|fff[23b])/,
    ".mp4": /^[0-9a-f]{8}66747970/,
    ".otf": /^4f54544f/,
    ".pdf": /^25504446/,
    ".png": /^89504e470d0a1a0a/,
    ".pptx": /^504b0[357][048]/,
    ".ttf": /^(?:00010000|74727565|74797031)/,
    ".wav": /^52494646[0-9a-f]{8}57415645/,
    ".webm": /^1a45dfa3/,
    ".webp": /^52494646[0-9a-f]{8}57454250/,
    ".woff": /^774f4646/,
    ".woff2": /^774f4632/,
    ".xlsx": /^504b0[357][048]/,
  };
  return signatures[extension]?.test(fileHeaderHex) ?? false;
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

export function parseTrustedJsonWithoutDuplicateKeys(
  source,
  label = "trusted JSON",
) {
  if (typeof source !== "string") throw new Error(`${label} must be UTF-8 text`);
  let index = 0;
  const fail = () => {
    throw new Error(`${label} is invalid or contains duplicate object keys`);
  };
  const whitespace = () => {
    while (/[\t\n\r ]/.test(source[index] ?? "")) index += 1;
  };
  const stringValue = () => {
    if (source[index] !== '"') fail();
    const start = index;
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(source.slice(start, index));
        } catch {
          fail();
        }
      }
      if (character === "\\") {
        index += 1;
        const escape = source[index];
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(index + 1, index + 5))) fail();
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
    const character = source[index];
    if (character === "{") {
      index += 1;
      whitespace();
      const keys = new Set();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      while (true) {
        whitespace();
        const key = stringValue();
        if (keys.has(key)) fail();
        keys.add(key);
        whitespace();
        if (source[index] !== ":") fail();
        index += 1;
        value();
        whitespace();
        if (source[index] === "}") {
          index += 1;
          return;
        }
        if (source[index] !== ",") fail();
        index += 1;
      }
    }
    if (character === "[") {
      index += 1;
      whitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      while (true) {
        value();
        whitespace();
        if (source[index] === "]") {
          index += 1;
          return;
        }
        if (source[index] !== ",") fail();
        index += 1;
      }
    }
    if (character === '"') {
      stringValue();
      return;
    }
    const remainder = source.slice(index);
    const literal = remainder.match(/^(?:true|false|null)/)?.[0];
    if (literal) {
      index += literal.length;
      return;
    }
    const number = remainder.match(
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/,
    )?.[0];
    if (!number) fail();
    index += number.length;
  };
  value();
  whitespace();
  if (index !== source.length) fail();
  try {
    return JSON.parse(source);
  } catch {
    fail();
  }
}

function skeleton(value) {
  return decodeEscapes(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function decodeEscapes(value) {
  return value
    .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\U([0-9a-f]{8})/g, (escape, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : escape;
    })
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

function directProcessEnvReads(source) {
  return [...source.matchAll(
    /\bprocess\s*\.\s*env\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)/g,
  )].map((match) => match[1]).sort();
}

function hasIndirectProcessEnvAccess(source) {
  const withoutDirectReads = source.replace(
    /\bprocess\s*\.\s*env\s*\.\s*[A-Za-z_][A-Za-z0-9_]*/g,
    "",
  );
  return /\bprocess\s*(?:\.\s*env|\[\s*["']env["']\s*\])/i
      .test(withoutDirectReads) ||
    /\{\s*env\s*\}\s*=\s*process\b/i.test(source) ||
    /\bReflect\s*\.\s*get\s*\(\s*process\s*,\s*["']env["']/i
      .test(source);
}

function runtimeCapabilityViolations(label, source) {
  const violations = [];
  const decoded = decodeEscapes(source);
  const compact = skeleton(decoded);
  if (
    /(?:^|[^\w.])fetch\s*\(|\b(?:WebSocket|EventSource)\s*\(/.test(decoded) ||
    /\bDeno\.(?:connect|connectTls|listen|listenTls|Command)\s*\(/.test(decoded) ||
    /["']node:(?:http|https|http2|net|tls|dgram)["']/.test(decoded) ||
    hasAny(compact, ["createhttpclient", "xmlhttprequest"])
  ) {
    violations.push(`${label} has outbound network capability`);
  }
  if (
    /["']node:child_process["']/.test(decoded) ||
    /\b(?:spawn|spawnSync|exec|execSync|execFile|fork)\s*\(/.test(decoded) ||
    /\bDeno\.Command\s*\(/.test(decoded)
  ) {
    violations.push(`${label} has process-execution capability`);
  }
  return violations;
}

function outputCallBodies(source) {
  return [...source.matchAll(
    /\bconsole\.(?:log|info|warn|error)\s*\(([\s\S]{0,1200}?)\);/g,
  )].map((match) => match[1]);
}

function noOpControlFlowViolations(label, source) {
  const violations = [];
  if (
    /\bif\s*\(\s*(?:true|false)\s*\)/.test(source) ||
    /\|\|\s*true\b|&&\s*false\b/.test(source) ||
    /\bprocess\.exit\s*\(\s*0\s*\)/.test(source) ||
    /\b(?:verify|verified|valid)\s*=\s*true\b/i.test(source)
  ) {
    violations.push(`${label} contains a static no-op/control-flow bypass`);
  }
  return violations;
}

function sensitiveSinkViolations(label, source, identifiers) {
  const violations = [];
  const sinks = [
    ...source.matchAll(/\bthrow\b[^;\n]*/g),
    ...source.matchAll(/\bconsole\.(?:log|info|warn|error)\s*\([^;\n]*/g),
    ...source.matchAll(/\bprocess\.(?:stdout|stderr)\b[^;\n]*/g),
  ].map((match) => match[0]);
  for (const identifier of identifiers) {
    const pattern = new RegExp(`\\b${identifier}\\b`);
    if (sinks.some((sink) => pattern.test(sink))) {
      violations.push(`${label} can route ${identifier} to an error/output sink`);
    }
  }
  return violations;
}

function immutableActionViolations(label, source) {
  const violations = [];
  for (const match of source.matchAll(
    /^\s*-?\s*(?:uses|["']uses["'])\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*(?:#.*)?$/gm,
  )) {
    const reference = match[1] ?? match[2] ?? match[3];
    if (!/@[0-9a-f]{40}$/.test(reference)) {
      violations.push(`${label} action is not pinned to a full commit SHA: ${reference}`);
    }
  }
  return violations;
}

function workflowCommandLines(source) {
  const commands = [];
  const lines = decodeEscapes(source).split(/\r?\n/);
  let blockIndent = null;
  for (const rawLine of lines) {
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = rawLine.trim();
    if (blockIndent !== null) {
      if (trimmed === "") continue;
      if (indent > blockIndent) {
        commands.push(trimmed);
        continue;
      }
      blockIndent = null;
    }
    const run = rawLine.match(
      /^\s*-?\s*(?:run|["']run["'])\s*:\s*(.*)$/i,
    );
    if (run) {
      if (/^[|>][-+]?\s*$/.test(run[1])) blockIndent = indent;
      else commands.push(run[1]);
      continue;
    }
    const uses = rawLine.match(
      /^\s*-?\s*(?:uses|["']uses["'])\s*:\s*(.*)$/i,
    );
    if (uses) commands.push(uses[1]);
  }
  return commands;
}

function workflowStepBlocks(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].match(
      /^(\s*)-\s+(?:name|uses|run|id|if|env|continue-on-error|timeout-minutes|shell|working-directory)\s*:/i,
    );
    if (!start) continue;
    const indent = start[1].length;
    const block = [lines[index]];
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();
      const lineIndent = line.match(/^\s*/)?.[0].length ?? 0;
      if (trimmed !== "" && lineIndent <= indent) {
        index -= 1;
        break;
      }
      block.push(line);
    }
    blocks.push(block.join("\n"));
  }
  return blocks;
}

function hasOpaqueFileReference(value) {
  const pattern = new RegExp(OPAQUE_FILE_REFERENCE.source, "gi");
  for (const match of value.matchAll(pattern)) {
    let start = match.index;
    let end = match.index + match[0].length;
    while (start > 0 && !/[\s"';&|()]/.test(value[start - 1])) start -= 1;
    while (end < value.length && !/[\s"';&|()]/.test(value[end])) end += 1;
    const token = value.slice(start, end);
    if (!token.includes("@") && !/^[a-z][a-z0-9+.-]*:\/\//i.test(token)) {
      return true;
    }
  }
  return false;
}

function workflowStructureViolations(relative, source) {
  const structuralLines = [];
  let blockIndent = null;
  for (const rawLine of source.split(/\r?\n/)) {
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = rawLine.trim();
    if (blockIndent !== null) {
      if (trimmed === "") continue;
      if (indent > blockIndent) continue;
      blockIndent = null;
    }
    structuralLines.push(rawLine);
    if (/^\s*(?:-\s*)?(?:[^#\n]+?):\s*[|>][-+]?\s*(?:#.*)?$/.test(rawLine)) {
      blockIndent = indent;
    }
  }
  const structural = structuralLines.join("\n");
  const violations = [];
  if (/^\s*(?:-\s*)?\?\s+/m.test(structural)) {
    violations.push(`${relative}:explicit/noncanonical YAML mapping keys are forbidden`);
  }
  if (
    /^\s*(?:-\s*)?(?:["']?<<["']?)\s*:/m.test(structural) ||
    /(?:^|[\s[{,:])(?:&|\*)[A-Za-z_][A-Za-z0-9_-]*/m.test(structural)
  ) {
    violations.push(`${relative}:YAML anchors, aliases, and merge keys are forbidden`);
  }
  if (structuralLines.some((line) => /\\\s*(?:#.*)?$/.test(line))) {
    violations.push(`${relative}:multiline escaped YAML scalars are forbidden`);
  }
  return violations;
}

function opaqueWorkflowInvocation(source) {
  const decodedSource = decodeEscapes(source);
  const lines = workflowCommandLines(decodedSource);
  const extraction = /\bunzip\b|\bexpand-archive\b|\b7z\s+x\b|\b(?:bsdtar|tar)\b[^\n]*(?:\s-[A-Za-z]*x|\s--extract\b)|\bjar\s+(?:-[A-Za-z]*x|x[A-Za-z]*)\b/i;
  const opaqueExecution = /\bchmod\b|\bjava\s+-jar\b|\bdeno\s+(?:run|eval)\b|\bgo\s+run\b|\b(?:wasmtime|wasmer|dotnet|powershell|pwsh|osascript)\b|(?:^|[\s:])(?:\.\/|exec\s+|node\s+|bun\s+|python\d*\s+|ruby\s+|perl\s+|php\s+|lua\s+|raku\s+|swift\s+|bash\s+|sh\s+)/im;
  const stepBlocks = workflowStepBlocks(decodedSource);
  if (
    stepBlocks.some((block) => extraction.test(block)) ||
    stepBlocks.some((block) =>
      hasOpaqueFileReference(block) &&
      (opaqueExecution.test(block) ||
        /^\s*(?:-\s*)?(?:shell|working-directory)\s*:/mi.test(block))
    )
  ) return true;
  if (lines.some((line) =>
    /\bunzip\b|\bexpand-archive\b|\b7z\s+x\b|\b(?:bsdtar|tar)\b[^\n]*(?:\s-[A-Za-z]*x|\s--extract\b)|\bjar\s+(?:-[A-Za-z]*x|x[A-Za-z]*)\b/i
      .test(line)
  )) return true;
  return lines.some((line) => {
    if (
      OPAQUE_FILE_REFERENCE.test(line) &&
      /(?:^|\s)(?:run|uses|["'](?:run|uses)["'])\s*:|\b(?:7z|bsdtar|expand-archive|java\s+-jar|jar\s+-[a-z]*[xf]|tar|unzip|wasmtime|wasmer|chmod|exec|node|python\d*|ruby|bash|sh)\b|(?:^|\s)\.\//i
        .test(line)
    ) return true;
    if (/\bchmod\b[^\n]*(?:\+x|[0-7]*[1357][0-7]{2})\b/i.test(line)) {
      return true;
    }
    for (const match of line.matchAll(
      /(?:^|[\s;&|])(?:\.\/|(?:bash|sh|node|python\d*|ruby)\s+)([^\s;&|]+)/gi,
    )) {
      const invokedPath = match[1].replace(/^['"]|['"]$/g, "");
      if (invokedPath.startsWith("-")) continue;
      const basename = invokedPath.split("/").pop() ?? "";
      if (
        basename &&
        (!basename.includes(".") || OPAQUE_EXECUTABLE_EXTENSION.test(basename) ||
          SAFE_OPAQUE_ASSET_EXTENSION.test(basename) ||
          basename === ".DS_Store" || basename.endsWith("~lock~"))
      ) {
        return true;
      }
    }
    return false;
  });
}

export function workflowPrivilegeViolations(relative, source) {
  if (!relative.startsWith(".github/workflows/")) {
    return [];
  }
  const violations = workflowStructureViolations(relative, source);
  if (relative === APPROVED_DEPLOY_WORKFLOW) {
    if (opaqueWorkflowInvocation(source)) {
      violations.push(`${relative}:workflow invokes an opaque executable artifact`);
    }
    return violations;
  }
  const decoded = decodeEscapes(source);
  const compact = skeleton(decoded);
  const sourceLines = decoded.replace(/\\\r?\n/g, " ").split(/\r?\n/);
  const shellAssignments = [...decoded.matchAll(
    /\b[A-Za-z_][A-Za-z0-9_]*\s*=\s*("[^"]*"|'[^']*'|[^;\s]+)/g,
  )].map((match) => match[1]).join("\n");
  const assignmentTokens = semanticTokens(shellAssignments);
  const assignmentCompact = skeleton(shellAssignments);
  if (/(?:^|[\s{,])(?:environment|["']environment["'])\s*:/mi.test(decoded)) {
    violations.push(`${relative}:production environment binding is restricted to ${APPROVED_DEPLOY_WORKFLOW}`);
  }
  if (
    compact.includes("supabaseaccesstoken") ||
    sourceLines.some((line) => hasTokens(semanticTokens(line), [
      "supabase", "access", "token",
    ])) ||
    ((hasTokens(assignmentTokens, ["supabase", "access", "token"]) ||
      assignmentCompact.includes("supabaseaccesstoken")) &&
      /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/.test(decoded))
  ) {
    violations.push(`${relative}:Supabase management credential is restricted to ${APPROVED_DEPLOY_WORKFLOW}`);
  }
  if (
    compact.includes("supabasesetupcli") ||
    sourceLines.some((line) => hasTokens(semanticTokens(line), [
      "supabase", "setup", "cli",
    ])) ||
    ((hasTokens(assignmentTokens, ["supabase", "setup", "cli"]) ||
      assignmentCompact.includes("supabasesetupcli")) &&
      /\b(?:curl|npm|npx|pnpm|yarn|bun|docker)\b/i.test(decoded))
  ) {
    violations.push(`${relative}:Supabase CLI setup is restricted to ${APPROVED_DEPLOY_WORKFLOW}`);
  }
  if (
    compact.includes("apisupabasecom") ||
    sourceLines.some((line) => hasTokens(semanticTokens(line), [
      "api", "supabase", "com",
    ])) ||
    ((hasTokens(assignmentTokens, ["api", "supabase", "com"]) ||
      assignmentCompact.includes("apisupabasecom")) &&
      /\b(?:curl|fetch|wget|httpie)\b/i.test(decoded))
  ) {
    violations.push(`${relative}:Supabase management endpoint is restricted to ${APPROVED_DEPLOY_WORKFLOW}`);
  }
  const directDeploy = shellDeployCommands(decoded).length > 0;
  const assembledDeploy = compact.includes("supabasefunctionsdeploy") ||
    /\bsupabase[\s\S]{0,80}\bfunctions[\s\S]{0,80}\bdeploy\b/.test(decoded) ||
    ((hasTokens(assignmentTokens, ["supabase", "functions", "deploy"]) ||
      assignmentCompact.includes("supabase")) &&
      /\bfunctions\s+deploy\b/.test(decoded) &&
      /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/.test(decoded));
  const deployScriptInvocation = sourceLines.some((line) =>
    /\b(?:bash|sh|node|python\d*|ruby)\s+[^\n]*(?:deploy|release)[^\n]*(?:supabase|edge[-_ ]?function|prod(?:uction)?)/i
      .test(line) ||
    /\b(?:bash|sh|node|python\d*|ruby)\s+[^\n]*(?:supabase|edge[-_ ]?function|prod(?:uction)?)[^\n]*(?:deploy|release)/i
      .test(line)
  );
  if (directDeploy || assembledDeploy || deployScriptInvocation) {
    violations.push(`${relative}:production function deploy capability is restricted to ${APPROVED_DEPLOY_WORKFLOW}`);
  }
  if (opaqueWorkflowInvocation(decoded)) {
    violations.push(`${relative}:workflow invokes an opaque executable artifact`);
  }
  return [...new Set(violations)];
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
  if (/^\s*(?:defaults|shell|working-directory|["'](?:defaults|shell|working-directory)["'])\s*:/mi.test(source)) {
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

function approvedDeployWorkflowViolations(source, trustedDigests) {
  const violations = [];
  const compact = skeleton(source);
  if (!trustedSource(trustedDigests, APPROVED_DEPLOY_WORKFLOW, source)) {
    violations.push("approved deploy workflow exact reviewed source differs");
  }
  violations.push(...immutableActionViolations("approved deploy workflow", source));
  violations.push(...workflowExecutionControlViolations("approved deploy workflow", source));
  if (/^\s*-?\s*(?:if|continue-on-error|["'](?:if|continue-on-error)["'])\s*:/m.test(source)) {
    violations.push("approved deploy workflow has conditional/error bypass");
  }
  if (/npm\s+(?:run|exec).*client[-_:]?ip/i.test(source)) {
    violations.push("approved deploy workflow uses npm indirection for client-IP gate");
  }
  const finalStepMarker = "      - name: Deploy ${{ inputs.function }} to UT project";
  const finalStepAt = source.indexOf(finalStepMarker);
  const finalStep = finalStepAt >= 0 ? source.slice(finalStepAt) : "";
  const admissionJobAt = source.indexOf("\n  admission:\n");
  const deployJobAt = source.indexOf("\n  deploy:\n", admissionJobAt + 1);
  const freshDeployPrefix = deployJobAt >= 0 && finalStepAt > deployJobAt
    ? source.slice(deployJobAt, finalStepAt)
    : "";
  const expectedFreshDeployPrefix = [
    "\n  deploy:",
    "    needs: admission",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 15",
    "    environment:",
    "      name: Production – frame-restoration-utah",
    "    steps:",
    `      - uses: actions/checkout@${ACTION_SHAS.checkout}`,
    "        with:",
    "          ref: ${{ github.sha }}",
    "          fetch-depth: 0",
    "          persist-credentials: false",
    `      - uses: supabase/setup-cli@${ACTION_SHAS.setupSupabase}`,
    "        with:",
    "          version: 2.113.0",
    "      - name: Verify function source exists in fresh deploy job",
    "        run: |",
    '          test -f "supabase/functions/${{ inputs.function }}/index.ts" \\',
    '            || { echo "::error::supabase/functions/${{ inputs.function }}/index.ts not found"; exit 1; }',
    "",
  ].join("\n");
  const freshActionReferences = [...freshDeployPrefix.matchAll(
    /^\s*-\s+uses:\s+([^\s#]+)\s*$/gm,
  )].map((match) => match[1]);
  const freshStepHeaders = [...freshDeployPrefix.matchAll(
    /^\s{6}-\s+(uses|name):\s+([^\n]+)$/gm,
  )].map((match) => `${match[1]}:${match[2]}`);
  const deployJob = deployJobAt >= 0 ? source.slice(deployJobAt) : "";
  const deployStepHeaders = [...deployJob.matchAll(
    /^\s{6}-\s+(uses|name):\s+([^\n]+)$/gm,
  )].map((match) => `${match[1]}:${match[2]}`);
  if (
    admissionJobAt < 0 || deployJobAt <= admissionJobAt ||
    !freshDeployPrefix.includes("    needs: admission\n") ||
    freshDeployPrefix !== expectedFreshDeployPrefix ||
    JSON.stringify(freshActionReferences) !== JSON.stringify([
      `actions/checkout@${ACTION_SHAS.checkout}`,
      `supabase/setup-cli@${ACTION_SHAS.setupSupabase}`,
    ]) ||
    JSON.stringify(freshStepHeaders) !== JSON.stringify([
      `uses:actions/checkout@${ACTION_SHAS.checkout}`,
      `uses:supabase/setup-cli@${ACTION_SHAS.setupSupabase}`,
      "name:Verify function source exists in fresh deploy job",
    ]) ||
    /(?:node|deno|python\d*|ruby|bash|sh)\s+(?:\.\/)?scripts\//i
      .test(freshDeployPrefix) ||
    /\b(?:GITHUB_ENV|GITHUB_PATH|BASH_ENV|NODE_OPTIONS|NODE_PATH|LD_PRELOAD|DYLD_INSERT_LIBRARIES)\b/
      .test(freshDeployPrefix)
  ) {
    violations.push("approved deploy workflow lacks an isolated fresh deployment job");
  }
  if (
    JSON.stringify(deployStepHeaders) !== JSON.stringify([
      `uses:actions/checkout@${ACTION_SHAS.checkout}`,
      `uses:supabase/setup-cli@${ACTION_SHAS.setupSupabase}`,
      "name:Verify function source exists in fresh deploy job",
      "name:Deploy ${{ inputs.function }} to UT project",
    ]) ||
    digest(finalStep) !== FINAL_DEPLOY_STEP_SHA256 ||
    /\n  [A-Za-z0-9_-]+:\n/.test(deployJob.slice("\n  deploy:\n".length))
  ) {
    violations.push("approved deploy workflow fresh-job step/final-shell allowlist differs");
  }
  const finalOrder = [
    "git status --porcelain=v1 --untracked-files=all",
    "git diff --exit-code -- .",
    "git diff --cached --exit-code -- .",
    "node scripts/audit-client-ip-probe-contract.mjs",
    "origin/main moved after final source integrity checks",
    "supabase functions list",
    "supabase secrets list",
    "node scripts/verify-client-ip-deploy-receipt.mjs",
    "supabase functions deploy",
  ].map((fragment) => finalStep.indexOf(fragment));
  if (
    finalStepAt < 0 || finalOrder.some((position) => position < 0) ||
    finalOrder.some((position, index) => index > 0 && position <= finalOrder[index - 1])
  ) {
    violations.push("approved deploy workflow lacks same-step final source/live-state verification before deploy");
  }
  const verifierAt = finalStep.indexOf(
    "node scripts/verify-client-ip-deploy-receipt.mjs",
  );
  const deployAt = finalStep.indexOf("supabase functions deploy");
  const liveFunctionsAt = finalStep.indexOf("supabase functions list");
  const verifierDeployGap = verifierAt >= 0 && deployAt > verifierAt
    ? finalStep.slice(
      verifierAt + "node scripts/verify-client-ip-deploy-receipt.mjs".length,
      deployAt,
    ).trim()
    : "";
  const finalIntegrityOrder = [
    "node scripts/audit-client-ip-probe-contract.mjs",
    '[[ "$(git rev-parse HEAD)" == "$DEPLOY_SHA" ]]',
    "git status --porcelain=v1 --untracked-files=all",
    "git diff --exit-code -- .",
    "git diff --cached --exit-code -- .",
  ].map((fragment) => finalStep.lastIndexOf(fragment));
  if (
    verifierAt < 0 || deployAt < 0 || liveFunctionsAt < 0 ||
    finalIntegrityOrder.some((position) => position < 0 || position >= liveFunctionsAt) ||
    finalIntegrityOrder.some((position, index) =>
      index > 0 && position <= finalIntegrityOrder[index - 1]
    ) ||
    (finalStep.match(/node scripts\/audit-client-ip-probe-contract\.mjs/g)?.length ?? 0) !== 1 ||
    (finalStep.match(/git status --porcelain=v1 --untracked-files=all/g)?.length ?? 0) !== 2 ||
    (finalStep.match(/git diff --exit-code -- \./g)?.length ?? 0) !== 2 ||
    (finalStep.match(/git diff --cached --exit-code -- \./g)?.length ?? 0) !== 2 ||
    verifierDeployGap !== 'SUPABASE_ACCESS_TOKEN="$SUPABASE_TOKEN_VALUE" \\'
  ) {
    violations.push("approved deploy workflow lacks adjacent final integrity/live-state/receipt/deploy ordering");
  }
  for (const required of [
    "CLIENT_IP_DEPLOY_DISPATCH_NONCE: ${{ inputs.receipt_nonce }}",
    "CLIENT_IP_DEPLOY_RECEIPT_PUBLIC_KEY_SPKI_DER_BASE64: ${{ vars.CLIENT_IP_DEPLOY_RECEIPT_PUBLIC_KEY_SPKI_DER_BASE64 }}",
    "CLIENT_IP_FINAL_FUNCTIONS_PATH=",
    "CLIENT_IP_FINAL_SECRETS_PATH=",
    "export CLIENT_IP_FINAL_FUNCTIONS_PATH CLIENT_IP_FINAL_SECRETS_PATH",
    "chmod 600 \"$CLIENT_IP_FINAL_FUNCTIONS_PATH\" \"$CLIENT_IP_FINAL_SECRETS_PATH\"",
    'env -i PATH="$PATH" HOME="$HOME" \\\n            node scripts/audit-client-ip-probe-contract.mjs',
    "unset \\\n            SUPABASE_ACCESS_TOKEN \\\n            GH_TOKEN \\\n            CLIENT_IP_DEPLOY_RECEIPT_TOKEN \\\n            CLIENT_IP_DEPLOY_RECEIPT_PUBLIC_KEY_SPKI_DER_BASE64",
    'GH_TOKEN="$GH_TOKEN_VALUE" gh api',
    'SUPABASE_ACCESS_TOKEN="$SUPABASE_TOKEN_VALUE" \\\n            supabase functions deploy',
  ]) {
    if (!finalStep.includes(required)) {
      violations.push(`approved deploy workflow final gate is missing ${required}`);
    }
  }
  if (
    !source.includes("receipt_nonce:") ||
    !source.includes('type: string') ||
    source.includes("CLIENT_IP_DEPLOY_RECEIPT_PRIVATE_KEY")
  ) {
    violations.push("approved deploy workflow nonce/public-only verifier boundary differs");
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
    `      - uses: actions/checkout@${ACTION_SHAS.checkout}`,
    "        with:",
    "          ref: ${{ github.sha }}",
    "          fetch-depth: 0",
    "          persist-credentials: false",
  ].join("\n");
  if (
    (source.match(/uses:\s*actions\/checkout@/g)?.length ?? 0) !== 2 ||
    (source.split(expectedCheckout).length - 1) !== 2
  ) {
    violations.push("approved deploy workflow checkout semantics differ");
  }
  const setupCli = `uses: supabase/setup-cli@${ACTION_SHAS.setupSupabase}`;
  if (
    (source.match(/uses:\s*supabase\/setup-cli@/g)?.length ?? 0) !== 2 ||
    (source.match(new RegExp(setupCli, "g"))?.length ?? 0) !== 2 ||
    (source.match(/          version: 2\.113\.0/g)?.length ?? 0) !== 2
  ) {
    violations.push("approved deploy workflow Supabase CLI pin differs");
  }
  const exactDeploy = [
    'supabase functions deploy "${{ inputs.function }}" \\',
    '            --project-ref "$SUPABASE_PROJECT_REF" \\',
    "            --no-verify-jwt --use-api",
  ].join("\n");
  if (
    !source.includes(exactDeploy) ||
    !finalStep.includes(`SUPABASE_PROJECT_REF: ${UTAH_PROJECT_REF}`) ||
    (source.match(/environment:\n      name: Production – frame-restoration-utah/g)?.length ?? 0) !== 2
  ) {
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

function complianceWorkflowViolations(source, trustedDigests) {
  const violations = [];
  const compact = skeleton(source);
  const relative = ".github/workflows/compliance-gate.yml";
  if (!trustedSource(trustedDigests, relative, source)) {
    violations.push("compliance workflow exact reviewed source differs");
  }
  violations.push(...immutableActionViolations("compliance workflow", source));
  violations.push(...workflowExecutionControlViolations("compliance workflow", source));
  if (!/paths:\s*\n\s*- ['"]\*\*['"]/.test(source)) {
    violations.push("compliance pull-request trigger is not all-files");
  }
  if (/^\s*-?\s*(?:if|continue-on-error|["'](?:if|continue-on-error)["'])\s*:/m.test(source)) {
    violations.push("compliance workflow has conditional/error bypass");
  }
  if (!source.includes("run: node scripts/audit-client-ip-probe-contract.mjs")) {
    violations.push("compliance workflow lacks direct scanner invocation");
  }
  if (!source.includes("run: node scripts/test-client-ip-deploy-receipt.mjs")) {
    violations.push("compliance workflow lacks direct receipt-test invocation");
  }
  if (
    (source.match(new RegExp(
      `uses:\\s*actions/checkout@${ACTION_SHAS.checkout}`,
      "g",
    ))?.length ?? 0) !== 21 ||
    (source.match(/uses:\s*actions\/checkout@/g)?.length ?? 0) !== 21 ||
    /uses:\s*actions\/checkout@[0-9a-f]{40}\s*\n\s+with\s*:/.test(source)
  ) {
    violations.push("compliance workflow checkout semantics differ");
  }
  for (const [action, expectedSha, expectedCount] of [
    ["actions/setup-node", ACTION_SHAS.setupNode, 16],
    ["denoland/setup-deno", ACTION_SHAS.setupDeno, 5],
    ["actions/setup-python", ACTION_SHAS.setupPython, 1],
  ]) {
    const escapedAction = action.replace("/", "\\/");
    const allCount = source.match(new RegExp(`uses:\\s*${escapedAction}@`, "g"))
      ?.length ?? 0;
    const pinnedCount = source.match(
      new RegExp(`uses:\\s*${escapedAction}@${expectedSha}`, "g"),
    )?.length ?? 0;
    if (allCount !== expectedCount || pinnedCount !== expectedCount) {
      violations.push(`compliance workflow ${action} pin/count differs`);
    }
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
  const independentlyReviewed = REVIEWED_CRITICAL_SOURCE_SHA256[relative];
  return TRUSTED_SOURCE_PATHS.includes(relative) &&
    trustedDigests?.[relative] === digest(source) &&
    (independentlyReviewed === undefined || independentlyReviewed === digest(source));
}

function verifierSourceViolations(relative, source, trustedDigests) {
  const violations = [];
  if (!trustedSource(trustedDigests, relative, source)) {
    violations.push(`${relative}:verifier source digest is not reviewed`);
  }
  const verifierImportBlock = [
    'import crypto from "node:crypto";',
    'import fs from "node:fs";',
    'import path from "node:path";',
    'import { pathToFileURL } from "node:url";',
    "import {",
    "  clientIpProbeTemplateViolations,",
    '} from "./audit-client-ip-probe-contract.mjs";',
    "import {",
    "  assertDisjointArtifactRoots,",
    "  capturedClientIpProbeManifest,",
    "  CLIENT_IP_EXTRACTOR_PATH,",
    "  CLIENT_IP_PROBE_TEMPLATE_PATH,",
    "  expectedClientIpProbeArtifacts,",
    "  renderedClientIpProbeManifest,",
    "  sha256,",
    '} from "./render-client-ip-probe.mjs";',
  ].join("\n");
  if (!hasExactImportPrelude(source, verifierImportBlock)) {
    violations.push(`${relative}:verifier static import allowlist differs`);
  }
  const envReads = directProcessEnvReads(source);
  if (
    JSON.stringify(envReads) !== JSON.stringify(VERIFIER_ENV_READS) ||
    hasIndirectProcessEnvAccess(source) || /\bDeno\.env\b/.test(source)
  ) {
    violations.push(`${relative}:verifier environment allowlist differs`);
  }
  violations.push(...runtimeCapabilityViolations(relative, source));
  violations.push(...noOpControlFlowViolations(relative, source));
  violations.push(...sensitiveSinkViolations(relative, source, [
    "encodedPayload",
    "encodedSignature",
    "publicKey",
    "publicKeySpkiDerBase64",
    "receiptToken",
    "supplied",
  ]));
  if (
    securitySurfaceDigest(source, [
      "encodedPayload",
      "encodedSignature",
      "publicKey",
      "publicKeyDer",
      "publicKeySpkiDerBase64",
      "receiptToken",
      "supplied",
    ]) !== VERIFIER_SECURITY_SURFACE_SHA256
  ) {
    violations.push(`${relative}:verifier security sink/control-flow surface differs`);
  }
  if (
    /\bfs\.(?:writeFile|writeFileSync|appendFile|appendFileSync|truncate|truncateSync|rename|renameSync|unlink|unlinkSync|rm|rmSync|chmod|chmodSync|chown|chownSync|copyFile|copyFileSync|link|linkSync|symlink|symlinkSync)\s*\(/.test(source)
  ) {
    violations.push(`${relative}:verifier has filesystem mutation capability`);
  }
  for (const required of [
    'const PROTECTED_FUNCTIONS = new Set(["handle-lead", "lead-crm"])',
    "const MAX_RECEIPT_LIFETIME_MS = 15 * 60 * 1000",
    "crypto.createPublicKey({",
    'type: "spki"',
    'publicKey.asymmetricKeyType !== "ed25519"',
    "crypto.verify(null",
    'publicKey.export({ format: "der", type: "spki" })',
    "canonical public-key DER",
    "receipt.receipt_version !== 3",
    'receipt.receipt_signature_scheme !== "ed25519"',
    "receipt.target_function !== functionName",
    "receipt.dispatch_nonce !== dispatchNonce",
    "finalFunctionState(finalFunctionsPath)",
    "finalSecretState(finalSecretsPath)",
    "process.argv.length !== 2",
  ]) {
    if (!source.includes(required)) {
      violations.push(`${relative}:verifier invariant missing ${required}`);
    }
  }
  if (
    source.includes("--issue") ||
    source.includes("CLIENT_IP_DEPLOY_RECEIPT_PRIVATE_KEY") ||
    source.includes("CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY") ||
    /\bcrypto\.(?:sign|createPrivateKey)\s*\(/.test(source) ||
    /\bcreateHmac\s*\(/.test(source)
  ) {
    violations.push(`${relative}:verifier has issuer/private-key capability`);
  }
  const outputs = outputCallBodies(source);
  const consoleMethods = [...source.matchAll(
    /\bconsole\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g,
  )].map((match) => match[1]);
  const fsMembers = [...source.matchAll(
    /\bfs\s*\.\s*([A-Za-z_$][\w$]*)/g,
  )].map((match) => match[1]);
  const processMembers = [...source.matchAll(
    /\bprocess\s*\.\s*([A-Za-z_$][\w$]*)/g,
  )].map((match) => match[1]);
  if (
    (source.match(/\bconsole\.log\s*\(/g)?.length ?? 0) !== 1 ||
    (source.match(/\bconsole\.error\s*\(/g)?.length ?? 0) !== 1 ||
    JSON.stringify(consoleMethods) !== JSON.stringify(["log", "error"]) ||
    (source.match(/\bconsole\b/g)?.length ?? 0) !== consoleMethods.length ||
    /\bprocess\.(?:stdout|stderr)\b/.test(source) ||
    outputs.some((body) => hasAny(skeleton(body), [
      "receipttoken",
      "publickeyspkiderbase64",
      "privatekeypkcs8derbase64",
      "clientipdeployreceipttoken",
    ]))
  ) {
    violations.push(`${relative}:verifier output allowlist/key-exfil boundary differs`);
  }
  if (
    JSON.stringify(fsMembers) !== JSON.stringify([
      "lstatSync",
      "openSync",
      "constants",
      "constants",
      "fstatSync",
      "readFileSync",
      "closeSync",
      "readFileSync",
      "readFileSync",
    ]) ||
    (source.match(/\bfs\b/g)?.length ?? 0) !== fsMembers.length + 2 ||
    /\bfs\s*\[|\bReflect\s*\.\s*get\s*\(\s*fs\b/.test(source) ||
    /\bfs\.constants\.(?:O_WRONLY|O_RDWR|O_CREAT|O_TRUNC|O_APPEND)\b/.test(source) ||
    !source.includes("fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW")
  ) {
    violations.push(`${relative}:verifier filesystem capability allowlist differs`);
  }
  if (
    JSON.stringify(processMembers) !== JSON.stringify([
      "argv",
      "argv",
      "argv",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "exit",
    ]) ||
    (source.match(/\bprocess\b/g)?.length ?? 0) !== processMembers.length ||
    (source.match(/\barguments\b/g)?.length ?? 0) !== 1 ||
    !source.includes("accepts no command-line arguments") ||
    /\b(?:globalThis|Reflect)\b|\b(?:eval|Function|require)\s*\(|\bimport\s*\(/.test(source)
  ) {
    violations.push(`${relative}:verifier dynamic capability/argument boundary differs`);
  }
  if (
    (source.match(/\bprocess\.exit\s*\(/g)?.length ?? 0) !== 1 ||
    !source.includes("process.exit(1)")
  ) {
    violations.push(`${relative}:verifier fail-closed CLI exit differs`);
  }
  const verifierStart = source.indexOf(
    "export function verifyClientIpDeployReceipt({",
  );
  const verifierEnd = source.indexOf("\nconst invokedAsScript =", verifierStart);
  const verifierBody = verifierStart >= 0 && verifierEnd > verifierStart
    ? source.slice(verifierStart, verifierEnd)
    : "";
  const parseAt = verifierBody.indexOf(
    "const receipt = parseSignedReceipt(receiptToken, publicKeySpkiDerBase64)",
  );
  const finalStateAt = verifierBody.indexOf(
    "const finalFunctions = finalFunctionState(finalFunctionsPath)",
  );
  const cleanupAt = verifierBody.indexOf("const cleanup = assertExactKeys(");
  const successReturnAt = verifierBody.search(
    /return\s*\{\s*required\s*:\s*true\b/,
  );
  if (
    !verifierBody.includes(
      "if (!PROTECTED_FUNCTIONS.has(functionName)) return { required: false };",
    ) ||
    (verifierBody.match(/\breturn\b/g)?.length ?? 0) !== 2 ||
    (verifierBody.match(/return\s*\{\s*required\s*:\s*true\b/g)?.length ?? 0) !== 1 ||
    parseAt < 0 || finalStateAt <= parseAt || cleanupAt <= finalStateAt ||
    successReturnAt <= cleanupAt
  ) {
    violations.push(`${relative}:verifier success control-flow ordering differs`);
  }
  const signedParser = sourceSection(
    source,
    "function parseSignedReceipt(token, publicKeySpkiDerBase64) {",
    "\nexport function buildClientIpDeployReceiptPayload(",
  );
  const signatureAt = signedParser.indexOf("crypto.verify(null");
  const duplicateSafeParseAt = signedParser.indexOf(
    "parseJsonWithoutDuplicateKeys(",
  );
  const payloadReturnAt = signedParser.indexOf("return requirePlainObject(");
  if (
    !signedParser || digest(signedParser) !== SIGNED_RECEIPT_PARSER_SHA256 ||
    (signedParser.match(/\breturn\b/g)?.length ?? 0) !== 1 ||
    signatureAt < 0 || duplicateSafeParseAt <= signatureAt ||
    payloadReturnAt <= signatureAt ||
    !signedParser.includes(
      "return requirePlainObject(\n      parseJsonWithoutDuplicateKeys(",
    )
  ) {
    violations.push(`${relative}:signed-receipt parser verification/parse flow differs`);
  }
  const finalFunctions = sourceSection(
    source,
    "function finalFunctionState(filePath) {",
    "\nfunction finalSecretState(filePath) {",
  );
  const finalSecrets = sourceSection(
    source,
    "function finalSecretState(filePath) {",
    "\nfunction exactProbeTuple(",
  );
  const functionProbeAbsenceAt = finalFunctions.indexOf(
    "if (seenSlugs.has(PROBE_SLUG))",
  );
  const functionCanonicalAt = finalFunctions.indexOf(
    "const canonical = canonicalUnorderedRows(",
  );
  const functionReturnAt = finalFunctions.indexOf(
    "return { sha256: sha256(canonical), artifact };",
  );
  const secretCanonicalAt = finalSecrets.indexOf(
    "const canonical = canonicalUnorderedRows(",
  );
  const secretReturnAt = finalSecrets.indexOf(
    "return { sha256: sha256(canonical), artifact };",
  );
  if (
    (finalFunctions.match(/\breturn\b/g)?.length ?? 0) !== 1 ||
    functionProbeAbsenceAt < 0 || functionCanonicalAt <= functionProbeAbsenceAt ||
    functionReturnAt <= functionCanonicalAt ||
    (finalSecrets.match(/\breturn\b/g)?.length ?? 0) !== 1 ||
    secretCanonicalAt < 0 || secretReturnAt <= secretCanonicalAt
  ) {
    violations.push(`${relative}:final live-state canonicalization/probe-absence flow differs`);
  }
  return [...new Set(violations)];
}

function issuerSourceViolations(relative, source, trustedDigests) {
  const violations = [];
  if (!trustedSource(trustedDigests, relative, source)) {
    violations.push(`${relative}:issuer source digest is not reviewed`);
  }
  const issuerImportBlock = [
    'import crypto from "node:crypto";',
    'import fs from "node:fs";',
    'import { pathToFileURL } from "node:url";',
    "import {",
    "  buildClientIpDeployReceiptPayload,",
    '} from "./verify-client-ip-deploy-receipt.mjs";',
    "import {",
    "  CLIENT_IP_EXTRACTOR_PATH,",
    "  CLIENT_IP_PROBE_TEMPLATE_PATH,",
    '} from "./render-client-ip-probe.mjs";',
  ].join("\n");
  if (!hasExactImportPrelude(source, issuerImportBlock)) {
    violations.push(`${relative}:issuer static import allowlist differs`);
  }
  const envReads = directProcessEnvReads(source);
  if (
    JSON.stringify(envReads) !== JSON.stringify(ISSUER_ENV_READS) ||
    hasIndirectProcessEnvAccess(source) || /\bDeno\.env\b/.test(source)
  ) {
    violations.push(`${relative}:issuer environment allowlist differs`);
  }
  violations.push(...runtimeCapabilityViolations(relative, source));
  violations.push(...noOpControlFlowViolations(relative, source));
  violations.push(...sensitiveSinkViolations(relative, source, [
    "encodedPayload",
    "privateKey",
    "privateKeyPkcs8DerBase64",
    "token",
  ]));
  if (
    securitySurfaceDigest(source, [
      "encodedPayload",
      "privateKey",
      "privateKeyDer",
      "privateKeyPkcs8DerBase64",
      "token",
    ]) !== ISSUER_SECURITY_SURFACE_SHA256
  ) {
    violations.push(`${relative}:issuer security sink/control-flow surface differs`);
  }
  for (const required of [
    "crypto.createPrivateKey({",
    'type: "pkcs8"',
    'privateKey.asymmetricKeyType !== "ed25519"',
    "crypto.sign(",
    'privateKey.export({ format: "der", type: "pkcs8" })',
    "canonical private-key DER",
    "process.argv.length !== 3",
    '{ mode: 0o600, flag: "wx" }',
    "fs.chmodSync(outputPath, 0o600)",
  ]) {
    if (!source.includes(required)) {
      violations.push(`${relative}:issuer invariant missing ${required}`);
    }
  }
  if (
    source.includes("--issue") ||
    source.includes("CLIENT_IP_DEPLOY_RECEIPT_PUBLIC_KEY") ||
    source.includes("CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY") ||
    /\bcrypto\.(?:verify|createPublicKey)\s*\(/.test(source)
  ) {
    violations.push(`${relative}:issuer has verifier/public-key compatibility path`);
  }
  const outputs = outputCallBodies(source);
  const issuerConsoleMethods = [...source.matchAll(
    /\bconsole\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g,
  )].map((match) => match[1]);
  const issuerFsMembers = [...source.matchAll(
    /\bfs\s*\.\s*([A-Za-z_$][\w$]*)/g,
  )].map((match) => match[1]);
  const issuerProcessMembers = [...source.matchAll(
    /\bprocess\s*\.\s*([A-Za-z_$][\w$]*)/g,
  )].map((match) => match[1]);
  if (
    (source.match(/\bconsole\.log\s*\(/g)?.length ?? 0) !== 1 ||
    (source.match(/\bconsole\.error\s*\(/g)?.length ?? 0) !== 1 ||
    JSON.stringify(issuerConsoleMethods) !== JSON.stringify(["log", "error"]) ||
    (source.match(/\bconsole\b/g)?.length ?? 0) !== issuerConsoleMethods.length ||
    /\bprocess\.(?:stdout|stderr)\b/.test(source) ||
    outputs.some((body) => hasAny(skeleton(body), [
      "token",
      "privatekey",
      "pkcs8derbase64",
      "clientipdeployreceiptprivatekey",
    ]))
  ) {
    violations.push(`${relative}:issuer output allowlist/key-exfil boundary differs`);
  }
  if (
    JSON.stringify(issuerFsMembers) !== JSON.stringify([
      "readFileSync",
      "readFileSync",
      "writeFileSync",
      "chmodSync",
    ]) ||
    (source.match(/\bfs\b/g)?.length ?? 0) !== issuerFsMembers.length + 2 ||
    /\bfs\s*\[|\bReflect\s*\.\s*get\s*\(\s*fs\b/.test(source)
  ) {
    violations.push(`${relative}:issuer filesystem capability allowlist differs`);
  }
  if (
    JSON.stringify(issuerProcessMembers) !== JSON.stringify([
      "argv",
      "argv",
      "argv",
      "argv",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "env",
      "exit",
    ]) ||
    (source.match(/\bprocess\b/g)?.length ?? 0) !== issuerProcessMembers.length ||
    /\barguments\b/.test(source) ||
    /\b(?:globalThis|Reflect)\b|\b(?:eval|Function|require)\s*\(|\bimport\s*\(/.test(source)
  ) {
    violations.push(`${relative}:issuer dynamic capability/argument boundary differs`);
  }
  if (
    (source.match(/\bprocess\.exit\s*\(/g)?.length ?? 0) !== 1 ||
    !source.includes("process.exit(1)")
  ) {
    violations.push(`${relative}:issuer fail-closed CLI exit differs`);
  }
  const signerStart = source.indexOf(
    "export function signClientIpDeployReceipt(",
  );
  const signerEnd = source.indexOf("\nconst invokedAsScript =", signerStart);
  const signerBody = signerStart >= 0 && signerEnd > signerStart
    ? source.slice(signerStart, signerEnd)
    : "";
  const signAt = signerBody.indexOf("const signature = crypto.sign(");
  const returnAt = signerBody.indexOf("return `${encodedPayload}.${signature}`;");
  if (
    digest(signerBody) !== ISSUER_SIGNER_SHA256 ||
    (signerBody.match(/\breturn\b/g)?.length ?? 0) !== 1 ||
    signAt < 0 || returnAt <= signAt
  ) {
    violations.push(`${relative}:issuer signing control-flow ordering differs`);
  }
  const mutationCalls = source.match(
    /\bfs\.(?:writeFile|writeFileSync|appendFile|appendFileSync|truncate|truncateSync|rename|renameSync|unlink|unlinkSync|rm|rmSync|chmod|chmodSync|chown|chownSync|copyFile|copyFileSync|link|linkSync|symlink|symlinkSync)\s*\(/g,
  ) ?? [];
  if (
    mutationCalls.length !== 2 ||
    (source.match(/\bfs\.writeFileSync\s*\(/g)?.length ?? 0) !== 1 ||
    (source.match(/\bfs\.chmodSync\s*\(/g)?.length ?? 0) !== 1 ||
    !source.includes(
      'fs.writeFileSync(outputPath, `${token}\\n`, { mode: 0o600, flag: "wx" });',
    ) ||
    !source.includes("fs.chmodSync(outputPath, 0o600);")
  ) {
    violations.push(`${relative}:issuer filesystem sink allowlist differs`);
  }
  return [...new Set(violations)];
}

function rendererSourceViolations(relative, source, trustedDigests) {
  const violations = [];
  if (!trustedSource(trustedDigests, relative, source)) {
    violations.push(`${relative}:renderer source digest is not reviewed`);
  }
  if (
    directProcessEnvReads(source).length > 0 || hasIndirectProcessEnvAccess(source) ||
    /\bDeno\.env\b/.test(source)
  ) {
    violations.push(`${relative}:renderer reads ambient environment`);
  }
  violations.push(...runtimeCapabilityViolations(relative, source));
  violations.push(...noOpControlFlowViolations(relative, source));
  if (
    !source.includes(
      'export const CLIENT_IP_PROBE_TEMPLATE_PATH =\n  "supabase/probe-templates/client-ip-probe/index.ts.tmpl";',
    )
  ) {
    violations.push(`${relative}:renderer template path differs from scanner trust root`);
  }
  if (callSurfaceDigest(source, "console.log") !== RENDERER_OUTPUT_SURFACE_SHA256) {
    violations.push(`${relative}:renderer digest-only output surface differs`);
  }
  if (
    (source.match(/\bconsole\.log\s*\(/g)?.length ?? 0) !== 2 ||
    (source.match(/\bconsole\.error\s*\(/g)?.length ?? 0) !== 1 ||
    /\bprocess\.(?:stdout|stderr)\b/.test(source) ||
    !source.includes("expected_source_manifest_sha256") ||
    !source.includes("operator_captured_source_manifest_sha256")
  ) {
    violations.push(`${relative}:renderer output contract differs from digest-only manifests`);
  }
  return [...new Set(violations)];
}

function extractorSourceViolations(relative, source, trustedDigests) {
  const violations = [];
  if (!trustedSource(trustedDigests, relative, source)) {
    violations.push(`${relative}:extractor source digest is not reviewed`);
  }
  if (
    /\b(?:Deno|process)\s*(?:\.\s*env|\[\s*["']env["']\s*\])/.test(source) ||
    indirectEnvAccessIn(source)
  ) {
    violations.push(`${relative}:probe extractor reads ambient environment`);
  }
  violations.push(...runtimeCapabilityViolations(relative, source));
  if (/\bconsole\.(?:log|info|warn|error|debug)\s*\(/.test(source)) {
    violations.push(`${relative}:probe extractor has logging capability`);
  }
  for (const required of [
    'export type ClientIpSource = "cf-connecting-ip"',
    'headers.get("cf-connecting-ip")',
    "export function canonicalIp(",
    "export async function keyedClientIpHash(",
    'crypto.subtle.sign(\n      "HMAC"',
  ]) {
    if (!source.includes(required)) {
      violations.push(`${relative}:probe extractor invariant missing ${required}`);
    }
  }
  return [...new Set(violations)];
}

function scannerSourceViolations(relative, source, trustedDigests) {
  const violations = [];
  if (!trustedSource(trustedDigests, relative, source)) {
    violations.push(`${relative}:scanner source digest is not reviewed`);
  }
  if (normalizedScannerDigest(source) !== SCANNER_NORMALIZED_SOURCE_SHA256) {
    violations.push(`${relative}:scanner normalized whole-source pin differs`);
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
  const scannerMutationCalls = source.match(
    /\bfs\.(?:writeFile|writeFileSync|appendFile|appendFileSync|truncate|truncateSync|rename|renameSync|unlink|unlinkSync|rm|rmSync|chmod|chmodSync|chown|chownSync|copyFile|copyFileSync|link|linkSync|symlink|symlinkSync)\s*\(/g,
  ) ?? [];
  const allowedChildProcessModule = `"node:${["child", "process"].join("_")}"`;
  if (
    scannerMutationCalls.length !== 3 ||
    (source.match(/\bfs\.writeFileSync\s*\(/g)?.length ?? 0) !== 1 ||
    (source.match(/\bfs\.chmodSync\s*\(/g)?.length ?? 0) !== 2 ||
    (source.match(/\bspawnSync\s*\(/g)?.length ?? 0) !== 5 ||
    /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*spawnSync\b(?!\s*\()/.test(source) ||
    /(?:^|[^.\w])(?:globalThis\s*\.\s*)?fetch\s*\(/.test(source) ||
    JSON.stringify(source.match(/["']node:(?:http|https|http2|net|tls|dgram|child_process)["']/g)) !==
      JSON.stringify([allowedChildProcessModule]) ||
    /\b(?:spawn|exec|execSync|execFile|fork)\s*\(/.test(source) ||
    (source.match(/process\.env/g)?.length ?? 0) !== 0 ||
    (source.match(/Deno\.env\.get\s*\(/g)?.length ?? 0) !== 2
  ) {
    violations.push(`${relative}:scanner whole-source capability allowlist differs`);
  }
  for (const required of [
    "for (const [relative, trackedEntry] of trackedEntries)",
    "trusted source is absent from the git index",
    "clientIpProbeTemplateViolations(templateSource)",
    "protectedDeployViolations(relative, source)",
    "workflowPrivilegeViolations(relative, source)",
    "OPAQUE_EXECUTABLE_EXTENSION.test(relative)",
    "executableMagic(fileHeaderHex)",
    "safeOpaqueAssetMagic(relative, fileHeaderHex)",
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
  const spawnCommands = [...source.matchAll(/\bspawnSync\s*\(\s*([^,\n]+)/g)]
    .map((match) => match[1].trim());
  const envReads = [...source.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)]
    .map((match) => match[1]);
  const expectedHarness = relative === "scripts/test-client-ip-deploy-receipt.mjs"
    ? source.includes('spawnSync("git", ["ls-files", "-s", "-z"]')
    : source.includes('spawnSync("bash", ["-n"]');
  const expectedSpawnSurface = relative ===
      "scripts/test-client-ip-deploy-receipt.mjs"
    ? CLIENT_TEST_SPAWN_SURFACE_SHA256
    : OWNER_TEST_SPAWN_SURFACE_SHA256;
  if (
    spawnCommands.length === 0 ||
    spawnCommands.some((command) =>
      !["process.execPath", '"bash"', '"ruby"', '"git"'].includes(command)
    ) ||
    !source.includes('spawnSync("ruby", ["-e", parser') ||
    !expectedHarness ||
    envReads.some((name) => name !== "PATH") ||
    /\b(?:execSync|execFile|fork)\s*\(/.test(source) ||
    /(?:^|[^\w.])fetch\s*\(/.test(source) ||
    /\beval\s*\(|\bFunction\s*\(|\bWebAssembly\b/.test(source) ||
    (relative === "scripts/test-client-ip-deploy-receipt.mjs"
      ? (source.match(/\bimport\s*\(/g)?.length ?? 0) !== 3 ||
        !source.includes('await import("./test-owner-notification-deploy-receipt.mjs")')
      : /\bimport\s*\(/.test(source))
  ) {
    violations.push(`${relative}:test runtime capability exceeds offline fixture commands`);
  }
  if (callSurfaceDigest(source, "spawnSync") !== expectedSpawnSurface) {
    violations.push(`${relative}:test subprocess command/argument surface differs`);
  }
  if (/\bprocess\.exit\s*\(\s*0\s*\)/.test(source)) {
    violations.push(`${relative}:test has an early-success process exit`);
  }
  if (
    !/offline fixtures/i.test(source) ||
    !/not live deployment proof/i.test(source)
  ) {
    violations.push(`${relative}:test output/fixtures do not state the offline-only trust boundary`);
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
    "Ed25519",
    "PKCS8 DER-base64",
    "CLIENT_IP_DEPLOY_DISPATCH_NONCE",
    "CLIENT_IP_DEPLOY_RECEIPT_PRIVATE_KEY_PKCS8_DER_BASE64",
    "CLIENT_IP_DEPLOY_RECEIPT_PUBLIC_KEY_SPKI_DER_BASE64",
    "15 minutes",
    "single-use",
  ]) {
    if (!source.includes(required)) {
      violations.push(`${relative}:runbook invariant missing ${required}`);
    }
  }
  if (!source.replace(/\s+/g, " ").includes("SPKI DER-base64")) {
    violations.push(`${relative}:runbook invariant missing SPKI DER-base64`);
  }
  if (
    source.includes("CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY") ||
    /verify-client-ip-deploy-receipt\.mjs\s+--issue/.test(source)
  ) {
    violations.push(`${relative}:runbook retains symmetric/self-issuing client-IP receipt instructions`);
  }
  violations.push(...protectedDeployViolations(relative, source));
  return violations;
}

export function probeToolViolations(
  relative,
  source,
  {
    trustedDigests = {},
    fileMode = null,
    fileDigest = null,
    fileHeaderHex = null,
  } = {},
) {
  const approvedArchive = APPROVED_OPAQUE_ARCHIVES[relative];
  if (
    approvedArchive && source === null && fileMode === "100644" &&
    fileDigest === approvedArchive && /^504b0[357][048]/.test(fileHeaderHex ?? "")
  ) {
    return [];
  }
  if (opaqueBinaryExecutableMagic(fileHeaderHex)) {
    return [`${relative}:executable binary magic is forbidden repo-wide regardless of name or mode`];
  }
  if (
    SAFE_OPAQUE_ASSET_EXTENSION.test(relative) &&
    !safeOpaqueAssetMagic(relative, fileHeaderHex)
  ) {
    return [`${relative}:safe media/document extension has invalid or missing file magic`];
  }
  const approvedAsset = APPROVED_OPAQUE_ASSETS[relative];
  if (approvedAsset) {
    if (
      fileMode === "100644" && fileDigest === approvedAsset &&
      typeof fileHeaderHex === "string" && fileHeaderHex.length >= 8
    ) {
      return [];
    }
    return [`${relative}:exact approved opaque-asset mode/digest/header differs`];
  }
  if (source === null && executableMagic(fileHeaderHex)) {
    return [`${relative}:executable magic is forbidden repo-wide regardless of name or mode`];
  }
  if (OPAQUE_EXECUTABLE_EXTENSION.test(relative)) {
    return [`${relative}:opaque executable artifact is forbidden repo-wide`];
  }
  if (source === null) {
    if (
      fileMode === "100644" &&
      SAFE_OPAQUE_ASSET_EXTENSION.test(relative) &&
      safeOpaqueAssetMagic(relative, fileHeaderHex)
    ) {
      return [];
    }
    const unscannableExecutable =
      (fileMode !== null && !["100644", "100755"].includes(fileMode)) ||
      fileMode === "100755" || EXECUTABLE_OR_CONFIG.test(relative) ||
      SENSITIVE_BINARY_PATH.test(relative);
    return [
      `${relative}:${unscannableExecutable ? "unscannable binary executable/config" : "opaque non-media artifact is forbidden repo-wide"}`,
    ];
  }
  if (relative === "scripts/audit-client-ip-probe-contract.mjs") {
    return scannerSourceViolations(relative, source, trustedDigests);
  }
  if (relative === "scripts/verify-client-ip-deploy-receipt.mjs") {
    return verifierSourceViolations(relative, source, trustedDigests);
  }
  if (relative === "scripts/issue-client-ip-deploy-receipt.mjs") {
    return issuerSourceViolations(relative, source, trustedDigests);
  }
  if (relative === "scripts/render-client-ip-probe.mjs") {
    return rendererSourceViolations(relative, source, trustedDigests);
  }
  if (
    relative === "scripts/test-client-ip-deploy-receipt.mjs" ||
    relative === "scripts/test-owner-notification-deploy-receipt.mjs"
  ) {
    return testSourceViolations(relative, source, trustedDigests);
  }
  if (relative === "supabase/functions/_shared/client-ip.ts") {
    return extractorSourceViolations(relative, source, trustedDigests);
  }
  if (relative === "supabase/functions/handle-lead/DEPLOY.md") {
    return runbookSourceViolations(relative, source, trustedDigests);
  }
  if (relative === ".github/workflows/deploy-edge-function.yml") {
    return [
      ...workflowPrivilegeViolations(relative, source),
      ...approvedDeployWorkflowViolations(source, trustedDigests).map(
        (violation) => `${relative}:${violation}`,
      ),
    ];
  }
  if (relative === ".github/workflows/compliance-gate.yml") {
    return [
      ...workflowPrivilegeViolations(relative, source),
      ...complianceWorkflowViolations(source, trustedDigests).map(
        (violation) => `${relative}:${violation}`,
      ),
    ];
  }
  const protectedViolations = [
    ...workflowPrivilegeViolations(relative, source),
    ...protectedDeployViolations(relative, source),
  ];
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
  const trackedEntries = [...trackedSources];
  const trackedPaths = new Set(trackedEntries.map(([relative]) => relative));
  const violations = clientIpProbeTemplateViolations(templateSource)
    .map((violation) => `${CLIENT_IP_PROBE_TEMPLATE_PATH}:${violation}`);
  if (!trustedSource(
    trustedDigests,
    CLIENT_IP_PROBE_TEMPLATE_PATH,
    templateSource,
  )) {
    violations.push(
      `${CLIENT_IP_PROBE_TEMPLATE_PATH}:template source digest is not reviewed`,
    );
  }
  for (const relative of TRUSTED_SOURCE_PATHS) {
    if (!trackedPaths.has(relative)) {
      violations.push(`${relative}:trusted source is absent from the git index`);
    }
  }
  for (const [relative, trackedEntry] of trackedEntries) {
    const source = trackedEntry && typeof trackedEntry === "object"
      ? trackedEntry.source
      : trackedEntry;
    const fileMode = trackedEntry && typeof trackedEntry === "object"
      ? trackedEntry.fileMode
      : null;
    const fileDigest = trackedEntry && typeof trackedEntry === "object"
      ? trackedEntry.fileDigest
      : null;
    const fileHeaderHex = trackedEntry && typeof trackedEntry === "object"
      ? trackedEntry.fileHeaderHex
      : null;
    if (relative === CLIENT_IP_PROBE_TEMPLATE_PATH) continue;
    violations.push(...probeToolViolations(relative, source, {
      trustedDigests,
      fileMode,
      fileDigest,
      fileHeaderHex,
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
      const fileDigest = digest(contents);
      const fileHeaderHex = contents.subarray(0, 64).toString("hex");
      if (!contents.includes(0)) {
        try {
          const decoded = new TextDecoder("utf-8", {
            fatal: true,
            ignoreBOM: true,
          }).decode(contents);
          if (Buffer.from(decoded, "utf8").equals(contents)) source = decoded;
        } catch {
          source = null;
        }
      }
      sources.set(relative, { source, fileMode, fileDigest, fileHeaderHex });
      continue;
    }
    sources.set(relative, {
      source,
      fileMode,
      fileDigest: null,
      fileHeaderHex: null,
    });
  }
  return sources;
}

function readTrustedManifest() {
  const value = parseTrustedJsonWithoutDuplicateKeys(
    fs.readFileSync(path.join(root, TRUSTED_MANIFEST_PATH), "utf8"),
    "client-IP trusted-source manifest",
  );
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
