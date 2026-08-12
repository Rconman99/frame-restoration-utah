// missed-call-alert — pure decision + copy for the missed-call SMS to Landon.
// ─────────────────────────────────────────────────────────────────────────────
// Side-effect-free so missed-call-alert.test.ts can freeze the behaviour; the
// production handler (handle-call /completed) keeps the DB reads and the send.
//
// Why this exists: inbound-call leads were not producing missed-call
// notifications. handle-call inserts a lead and stops — the lead_notifications
// outbox is wired only to handle-lead (web forms). The operator's phone shows
// the forwarding number rather than the caller, so the alert must carry caller
// identity.
//
// Filtering policy (owner decision, 2026-08-11): alert on EVERY missed call
// except numbers Landon has explicitly suppressed. Area code is deliberately
// NOT a spam signal — Frame's best markets (Park City, Midway, Heber, Alpine)
// are second-home owners who call from out-of-state cells. The 480/Phoenix call
// on 2026-08-10 ran 186s, the longest of that week. Suppression is curated by
// Landon replying with a caller-specific BLOCK command, so nothing real is
// pre-emptively filtered and a later call cannot change the suppression target.

/** Dial results that mean Landon did not pick up. */
const MISSED_DIAL_STATUSES = new Set([
  "no-answer",
  "busy",
  "failed",
  "canceled",
]);

export interface AlertDecision {
  alert: boolean;
  reason:
    | "missed"
    | "answered"
    | "not_a_dial_result"
    | "suppressed"
    | "internal_line"
    | "no_caller_id";
}

/**
 * Should this /completed callback produce a missed-call text?
 *
 * `suppressed` is the set of numbers Landon has BLOCKed. Callers pass an empty
 * set when the lookup fails — failing OPEN is deliberate: a missed alert costs
 * a job, a spurious alert costs one text.
 */
export function shouldAlertMissedCall(
  dialStatus: string,
  fromNumber: string,
  suppressed: Set<string>,
  internalLines: Set<string> = new Set(),
): AlertDecision {
  const dial = String(dialStatus || "").trim().toLowerCase();
  if (!dial) return { alert: false, reason: "not_a_dial_result" };
  if (!MISSED_DIAL_STATUSES.has(dial)) {
    return {
      alert: false,
      reason: dial === "completed" || dial === "answered"
        ? "answered"
        : "not_a_dial_result",
    };
  }
  const from = normalizeAlertPhone(fromNumber);
  if (!from || from === "unknown") {
    return { alert: false, reason: "no_caller_id" };
  }
  if (internalLines.has(from)) {
    return { alert: false, reason: "internal_line" };
  }
  if (suppressed.has(from)) return { alert: false, reason: "suppressed" };
  return { alert: true, reason: "missed" };
}

/** Canonical E.164 form for comparisons and suppression keys. */
export function normalizeAlertPhone(phone: string): string {
  const raw = String(phone || "").trim();
  if (!raw || raw.toLowerCase() === "unknown") return raw.toLowerCase();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return "";
}

/** (435) 292-8802 from +14352928802 — Landon reads these on a phone screen. */
export function formatUsPhone(e164: string): string {
  const m = String(e164 || "").match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(e164 || "unknown");
}

export interface MissedCallAlertInput {
  fromNumber: string;
  city?: string | null;
  /** Total prior calls from this number, this one included. */
  callCount?: number;
  /** Local (Mountain) time string, e.g. "5:37 PM". */
  localTime?: string | null;
}

/**
 * The text Landon receives. Leads with the number because "I can't see their
 * number, it just says frame website" was the original complaint. No STOP line:
 * this is a business-internal alert to the operator, not an A2P marketing
 * message to a consumer.
 */
export function missedCallAlertText(input: MissedCallAlertInput): string {
  const normalized = normalizeAlertPhone(input.fromNumber);
  const pretty = formatUsPhone(normalized);
  const when = input.localTime ? ` ${input.localTime}` : "";
  const city = input.city && input.city.toLowerCase() !== "unknown"
    ? ` - ${input.city}`
    : "";
  const repeat = input.callCount && input.callCount > 1
    ? `\nCall #${input.callCount} from this number.`
    : "";
  const suffix = normalized.replace(/\D/g, "").slice(-4);
  return `Missed call${when}: ${pretty}${city}${repeat}\nCall back: ${normalized}\nReply BLOCK ${suffix} to stop alerts from this number.`;
}

export interface BlockCommand {
  lastFour: string;
}

export function isBlockCommandAttempt(body: string): boolean {
  return /^\s*block(?:\s|$)/i.test(String(body || ""));
}

/** Caller-specific command; bare BLOCK is rejected because calls can race. */
export function parseBlockCommand(body: string): BlockCommand | null {
  const match = String(body || "").match(/^\s*block\s+(\d{4})\s*$/i);
  return match ? { lastFour: match[1] } : null;
}
