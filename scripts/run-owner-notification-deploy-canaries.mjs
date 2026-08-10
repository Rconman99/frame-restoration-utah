#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
  return value;
}

function webhookKey(secret) {
  const value = requireString(secret, "Resend webhook secret");
  if (
    !value.startsWith("whsec_") || !/^[A-Za-z0-9+/=_-]+$/.test(value.slice(6))
  ) {
    throw new Error("Resend webhook secret has an invalid Svix format");
  }
  const key = Buffer.from(value.slice(6), "base64");
  if (key.length < 16) throw new Error("Resend webhook secret is too short");
  return key;
}

export function signedWebhookCanary(secret, body, now, eventId) {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signature = crypto.createHmac("sha256", webhookKey(secret))
    .update(`${eventId}.${timestamp}.${body}`)
    .digest("base64");
  return {
    "content-type": "application/json",
    "svix-id": eventId,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  };
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

export async function runOwnerNotificationCanaries({
  functionName,
  projectRef,
  workerToken,
  webhookSecret,
  functionsMetadata,
  fetchImpl = fetch,
  now = new Date(),
  eventId = `msg_frame_canary_${crypto.randomUUID().replaceAll("-", "")}`,
}) {
  if (functionName !== "handle-lead") {
    return {
      receipt_version: 1,
      project_ref: projectRef || "not-applicable",
      checked_at: now.toISOString(),
      required: false,
    };
  }
  requireString(projectRef, "Supabase project ref");
  const deployments = functionDeployments(functionsMetadata, projectRef);
  const workerDeployment = deployments.get("lead-notification-worker");
  const webhookDeployment = deployments.get("resend-webhook");
  if (!workerDeployment || !webhookDeployment) {
    throw new Error(
      "handle-lead canaries require live worker and webhook versions",
    );
  }

  const base = `https://${projectRef}.supabase.co/functions/v1`;
  const workerResponse = await fetchImpl(`${base}/lead-notification-worker`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireString(workerToken, "worker token")}`,
      "x-frame-worker-mode": "health-only",
    },
  });
  const workerBody = await workerResponse.json().catch(() => null);
  if (
    !workerResponse.ok || workerBody?.mode !== "health-only" ||
    workerBody?.no_send !== true || workerBody?.healthy !== true ||
    workerBody?.provider_auth?.healthy !== true ||
    workerBody?.provider_auth?.permission !== "sending_access" ||
    workerBody?.provider_auth?.httpStatus !== 401 ||
    workerBody?.deployment_id !== workerDeployment.deploymentId
  ) {
    throw new Error(
      `no-send worker health canary failed (HTTP ${workerResponse.status})`,
    );
  }

  const webhookBody = JSON.stringify({
    type: "email.sent",
    created_at: now.toISOString(),
    data: {
      email_id: `frame_canary_${eventId}`,
      tags: { frame_canary: "signature_only_v1" },
    },
  });
  const webhookResponse = await fetchImpl(`${base}/resend-webhook`, {
    method: "POST",
    headers: signedWebhookCanary(
      requireString(webhookSecret, "Resend webhook secret"),
      webhookBody,
      now,
      eventId,
    ),
    body: webhookBody,
  });
  const webhookResult = await webhookResponse.json().catch(() => null);
  if (
    !webhookResponse.ok || webhookResult?.state !== "ignored" ||
    webhookResult?.deployment_id !== webhookDeployment.deploymentId
  ) {
    throw new Error(
      `signed no-send webhook canary failed (HTTP ${webhookResponse.status})`,
    );
  }

  return {
    receipt_version: 1,
    project_ref: projectRef,
    checked_at: now.toISOString(),
    required: true,
    worker_health: {
      passed: true,
      http_status: workerResponse.status,
      mode: "health-only",
      no_send: true,
      healthy: true,
      provider_auth: {
        healthy: true,
        permission: "sending_access",
        http_status: 401,
      },
      function_version: workerDeployment.version,
      deployment_id: workerDeployment.deploymentId,
    },
    webhook_signature: {
      passed: true,
      http_status: webhookResponse.status,
      state: "ignored",
      no_send: true,
      function_version: webhookDeployment.version,
      deployment_id: webhookDeployment.deploymentId,
    },
  };
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  try {
    const outputPath = requireString(
      process.env.NOTIFICATION_CANARY_PATH,
      "notification canary path",
    );
    const result = await runOwnerNotificationCanaries({
      functionName: process.env.FUNCTION_NAME ?? "",
      projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
      workerToken: process.env.LEAD_NOTIFICATION_WORKER_TOKEN ?? "",
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? "",
      functionsMetadata: JSON.parse(fs.readFileSync(
        requireString(
          process.env.NOTIFICATION_FUNCTIONS_METADATA_PATH,
          "notification function metadata path",
        ),
        "utf8",
      )),
    });
    fs.writeFileSync(outputPath, `${JSON.stringify(result)}\n`, {
      mode: 0o600,
    });
    fs.chmodSync(outputPath, 0o600);
    console.log(
      result.required
        ? "Fresh no-send worker health and signed webhook canaries passed."
        : "Owner-notification canaries are not required for this function.",
    );
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
