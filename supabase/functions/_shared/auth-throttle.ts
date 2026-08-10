// Dashboard login-attempt throttle contracts shared with lead-crm. Counter
// mutation lives exclusively in the atomic reserve_dashboard_login_attempt SQL
// RPC; doing a browser-style read + upsert here would reintroduce lost-update
// races. Every login attempt counts, including successful attempts.

import { clientIpIdentity, keyedClientIpHash } from "./client-ip.ts";

export const AUTH_THROTTLE_RPC = "reserve_dashboard_login_attempt";
export const AUTH_THROTTLE_WINDOW_SECONDS = 15 * 60;
export const MAX_ATTEMPTS_PER_WINDOW = 10;
export const AUTH_THROTTLE_KEY_CONTEXT = "dashboard-auth-v1";
export const AUTH_THROTTLE_KEY_HEX_LENGTH = 64;

export interface ThrottleReservation {
  allowed: boolean;
  attempt_count: number;
  retry_after_seconds: number;
}

export async function dashboardThrottleKey(
  secret: string,
  headers: Headers,
): Promise<{ key: string; source: string }> {
  const identity = clientIpIdentity(headers);
  if (!identity) throw new Error("trusted_client_ip_unavailable");
  return {
    key: await keyedClientIpHash(
      secret,
      AUTH_THROTTLE_KEY_CONTEXT,
      identity,
    ),
    source: identity.source,
  };
}

/**
 * Supabase returns SETOF/table RPC results as a one-row array. Reject any
 * malformed or self-contradictory result so authentication fails closed.
 */
export function parseThrottleReservation(
  value: unknown,
): ThrottleReservation | null {
  const row = Array.isArray(value)
    ? (value.length === 1 ? value[0] : null)
    : value;
  if (!row || typeof row !== "object") return null;

  const candidate = row as Record<string, unknown>;
  const allowed = candidate.allowed;
  const attemptCount = candidate.attempt_count;
  const retryAfter = candidate.retry_after_seconds;
  if (
    typeof allowed !== "boolean" ||
    !Number.isInteger(attemptCount) ||
    (attemptCount as number) < 1 ||
    !Number.isInteger(retryAfter) ||
    (retryAfter as number) < 0 ||
    (retryAfter as number) > AUTH_THROTTLE_WINDOW_SECONDS ||
    allowed !== ((attemptCount as number) <= MAX_ATTEMPTS_PER_WINDOW) ||
    (allowed ? retryAfter !== 0 : retryAfter === 0)
  ) {
    return null;
  }

  return {
    allowed,
    attempt_count: attemptCount as number,
    retry_after_seconds: retryAfter as number,
  };
}
