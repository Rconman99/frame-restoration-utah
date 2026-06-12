// Pure per-IP PIN-attempt throttle decisions for lead-crm (and any future
// PIN-gated endpoint). The PIN travels in a query string and report_access
// stores it in plaintext — brute-force was previously unthrottled. State lives
// in the auth_attempts table; these functions only decide. Frozen by
// auth-throttle.test.ts.

export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILS_PER_WINDOW = 10;

export interface AttemptRow {
  ip: string;
  fail_count: number;
  window_start: string; // ISO timestamp
}

function inWindow(row: AttemptRow, nowMs: number): boolean {
  const start = Date.parse(row.window_start);
  return Number.isFinite(start) && nowMs - start < WINDOW_MS;
}

/** Should this request even be allowed to try a PIN? */
export function throttleAllows(row: AttemptRow | null, nowMs: number): boolean {
  if (!row) return true;
  if (!inWindow(row, nowMs)) return true; // window expired → fresh start
  return row.fail_count < MAX_FAILS_PER_WINDOW;
}

/** Row to upsert after a FAILED pin attempt. */
export function failedAttemptRow(
  ip: string,
  prior: AttemptRow | null,
  nowMs: number,
): AttemptRow {
  if (prior && inWindow(prior, nowMs)) {
    return { ip, fail_count: prior.fail_count + 1, window_start: prior.window_start };
  }
  return { ip, fail_count: 1, window_start: new Date(nowMs).toISOString() };
}
