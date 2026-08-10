import {
  clientIpIdentity,
  ipHashSecretReady,
  keyedClientIpHash,
  validIpHash,
} from "./client-ip.ts";

export const LEAD_INTAKE_RATE_LIMIT_RPC = "reserve_lead_intake_attempt";
export const LEAD_INTAKE_RATE_LIMIT_CONTEXT = "lead-intake-v1";
export const LEAD_INTAKE_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
export const LEAD_INTAKE_MAX_ATTEMPTS = 5;
export const NATIVE_LEAD_IDEMPOTENCY_DAY_MS = 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

export type LeadIntakeRateReservation = {
  allowed: boolean;
  attempt_count: number;
  retry_after_seconds: number;
};

export async function leadIntakeThrottleKey(
  secret: string,
  headers: Headers,
): Promise<{ key: string; source: string }> {
  const identity = clientIpIdentity(headers);
  if (!identity) throw new Error("trusted_client_ip_unavailable");
  return {
    key: await keyedClientIpHash(
      secret,
      LEAD_INTAKE_RATE_LIMIT_CONTEXT,
      identity,
    ),
    source: identity.source,
  };
}

export function parseLeadIntakeRateReservation(
  value: unknown,
): LeadIntakeRateReservation | null {
  const row = Array.isArray(value)
    ? (value.length === 1 ? value[0] : null)
    : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  const allowed = candidate.allowed;
  const attemptCount = candidate.attempt_count;
  const retryAfter = candidate.retry_after_seconds;
  if (
    typeof allowed !== "boolean" || !Number.isInteger(attemptCount) ||
    (attemptCount as number) < 1 || !Number.isInteger(retryAfter) ||
    (retryAfter as number) < 0 ||
    (retryAfter as number) > LEAD_INTAKE_RATE_LIMIT_WINDOW_SECONDS ||
    allowed !== ((attemptCount as number) <= LEAD_INTAKE_MAX_ATTEMPTS) ||
    (allowed ? retryAfter !== 0 : retryAfter === 0)
  ) return null;

  return {
    allowed,
    attempt_count: attemptCount as number,
    retry_after_seconds: retryAfter as number,
  };
}

export async function nativeLeadSubmissionKey(
  secret: string,
  clientHash: string,
  fields: Record<string, string | boolean>,
  nowMilliseconds = Date.now(),
): Promise<string> {
  if (!ipHashSecretReady(secret) || !validIpHash(clientHash)) {
    throw new Error("native_lead_idempotency_config_invalid");
  }
  const entries = Object.entries(fields).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (
    entries.length < 1 || entries.length > 32 ||
    entries.some(([key, value]) =>
      !/^[a-z][a-z0-9_]{0,63}$/.test(key) ||
      (typeof value !== "string" && typeof value !== "boolean")
    )
  ) throw new Error("native_lead_idempotency_fields_invalid");
  const canonical = JSON.stringify(Object.fromEntries(entries));
  if (encoder.encode(canonical).byteLength > 28 * 1024) {
    throw new Error("native_lead_idempotency_fields_invalid");
  }
  const dayBucket = Math.floor(
    nowMilliseconds / NATIVE_LEAD_IDEMPOTENCY_DAY_MS,
  );
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        `native-lead-idempotency-v1\0${dayBucket}\0${clientHash}\0${canonical}`,
      ),
    ),
  ).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(
    digest,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${
    hex.slice(16, 20)
  }-${hex.slice(20)}`;
}
