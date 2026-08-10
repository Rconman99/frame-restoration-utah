#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  buildClientIpDeployReceiptPayload,
} from "./verify-client-ip-deploy-receipt.mjs";
import {
  CLIENT_IP_EXTRACTOR_PATH,
  CLIENT_IP_PROBE_TEMPLATE_PATH,
} from "./render-client-ip-probe.mjs";

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
  return value;
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

export function signClientIpDeployReceipt(payload, privateKeyPkcs8DerBase64) {
  let privateKey;
  try {
    const privateKeyDer = decodeBase64Der(
      privateKeyPkcs8DerBase64,
      "client-IP receipt Ed25519 private key",
    );
    privateKey = crypto.createPrivateKey({
      key: privateKeyDer,
      format: "der",
      type: "pkcs8",
    });
    if (
      !Buffer.from(
        privateKey.export({ format: "der", type: "pkcs8" }),
      ).equals(privateKeyDer)
    ) {
      throw new Error("client-IP receipt private key is not canonical private-key DER");
    }
  } catch (error) {
    throw new Error(`client-IP receipt private key is invalid: ${error.message}`);
  }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("client-IP receipt private key must be Ed25519 PKCS8 DER");
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64url");
  const signature = crypto.sign(
    null,
    Buffer.from(encodedPayload, "utf8"),
    privateKey,
  ).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  try {
    const outputPath = requireString(
      process.argv[2],
      "receipt token output path",
    );
    if (process.argv.length !== 3) {
      throw new Error("issuer accepts exactly one receipt output path");
    }
    const extractorSource = fs.readFileSync(CLIENT_IP_EXTRACTOR_PATH, "utf8");
    const probeTemplateSource = fs.readFileSync(
      CLIENT_IP_PROBE_TEMPLATE_PATH,
      "utf8",
    );
    const built = buildClientIpDeployReceiptPayload({
      targetFunction: process.env.FUNCTION_NAME ?? "",
      dispatchNonce: process.env.CLIENT_IP_DEPLOY_DISPATCH_NONCE ?? "",
      deploySha: process.env.DEPLOY_SHA ?? "",
      projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
      extractorSource,
      probeTemplateSource,
      artifactPaths: {
        functions_pre_path: process.env.CLIENT_IP_FUNCTIONS_PRE_PATH ?? "",
        functions_canary_path: process.env.CLIENT_IP_FUNCTIONS_CANARY_PATH ?? "",
        functions_delete_recheck_path:
          process.env.CLIENT_IP_FUNCTIONS_DELETE_RECHECK_PATH ?? "",
        functions_post_path: process.env.CLIENT_IP_FUNCTIONS_POST_PATH ?? "",
        probe_ezbr_canary_path:
          process.env.CLIENT_IP_PROBE_EZBR_CANARY_PATH ?? "",
        probe_ezbr_delete_recheck_path:
          process.env.CLIENT_IP_PROBE_EZBR_DELETE_RECHECK_PATH ?? "",
        secrets_pre_path: process.env.CLIENT_IP_SECRETS_PRE_PATH ?? "",
        secrets_canary_path:
          process.env.CLIENT_IP_SECRETS_CANARY_PATH ?? "",
        secrets_delete_recheck_path:
          process.env.CLIENT_IP_SECRETS_DELETE_RECHECK_PATH ?? "",
        secrets_post_path: process.env.CLIENT_IP_SECRETS_POST_PATH ?? "",
        compute_pre_path: process.env.CLIENT_IP_COMPUTE_PRE_PATH ?? "",
        compute_created_path:
          process.env.CLIENT_IP_COMPUTE_CREATED_PATH ?? "",
        compute_post_path: process.env.CLIENT_IP_COMPUTE_POST_PATH ?? "",
        render_root: process.env.CLIENT_IP_RENDER_ROOT ?? "",
        captured_source_root:
          process.env.CLIENT_IP_CAPTURED_SOURCE_ROOT ?? "",
        request_artifact_manifest_path:
          process.env.CLIENT_IP_REQUEST_ARTIFACT_MANIFEST_PATH ?? "",
        operator_attestation_path:
          process.env.CLIENT_IP_OPERATOR_ATTESTATION_PATH ?? "",
      },
    });
    const token = signClientIpDeployReceipt(
      built.payload,
      process.env.CLIENT_IP_DEPLOY_RECEIPT_PRIVATE_KEY_PKCS8_DER_BASE64 ?? "",
    );
    fs.writeFileSync(outputPath, `${token}\n`, { mode: 0o600, flag: "wx" });
    fs.chmodSync(outputPath, 0o600);
    console.log(
      "Offline signer-attested Ed25519 client-IP receipt written to a new mode-0600 file.",
    );
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
