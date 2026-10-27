// Explicit answered/missed for call_logs.answered (Utah).
const MISSED = new Set(["no-answer", "busy", "failed", "canceled"]);

/**
 * Decide answered/missed from a Dial action callback.
 * DialBridged is authoritative when present (a declined screen whisper can
 * report DialCallStatus=completed without the caller ever speaking to Landon).
 */
export function answeredFromDial(
  dialBridged: unknown,
  dialCallStatus: unknown,
  durationSeconds: number,
): boolean | null {
  const b = String(dialBridged ?? "").trim().toLowerCase();
  if (b === "true") return true;
  if (b === "false") return false;
  const s = String(dialCallStatus ?? "").trim().toLowerCase();
  if (MISSED.has(s)) return false;
  if (s === "completed" || s === "answered") return durationSeconds > 0;
  return null;
}
