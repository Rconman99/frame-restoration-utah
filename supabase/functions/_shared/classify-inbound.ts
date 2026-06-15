// classify-inbound — pure routing/classification for the SMS relay (handle-sms)
// ─────────────────────────────────────────────────────────────────────────────
// Side-effect-free. The production handler keeps DB writes, Twilio sends, and
// signature auth; this module only owns the repeatable routing decisions.

// Landon's personal phone — the operator. A message From this number is an
// operator command (CALL / TO), never an inbound customer lead. Preserved from
// origin/main so handle-sms + the frozen test share one operator definition.
export const OPERATOR_PHONE = "+14353024422";

// Is this inbound From the operator (Landon)? Operator messages take the command
// path; everyone else is a customer. Phone is parameterized for testability but
// defaults to the live operator line.
export function isOperator(from: string, operatorPhone: string = OPERATOR_PHONE): boolean {
  return from === operatorPhone;
}

/** Normalize a phone string to E.164-ish (+1XXXXXXXXXX for US 10/11-digit). */
export function normalizePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length > 10) return "+" + digits;
  return phone || "";
}

// Body-keyword fallback for internal automation that rotates sender numbers.
// Kept narrow on purpose: a literal "jobnimbus" mention.
export const INTERNAL_BODY_RE = /jobnimbus/i;

/** True if this inbound is internal automation, not a customer. */
export function isInternalRelay(
  from: string,
  body: string,
  internalSenders: Iterable<string>,
): boolean {
  const set = internalSenders instanceof Set
    ? internalSenders
    : new Set(internalSenders);
  return set.has(from) || INTERNAL_BODY_RE.test(body || "");
}

export interface ToCommand {
  customerNumber: string;
  messageBody: string;
}

// Tolerant operator "TO:<number> message" parse. Accepts "TO:" or "TO ",
// optional <>/()/[] brackets the operator may copy from a prompt, and a US phone
// with common separators:
//   TO:<8015551234> hi · TO 801-555-1234 hi · TO:+1 801 555 1234 hi
const TO_RE =
  /^TO[:\s]*[<(\[]?\s*(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\s*[>)\]]?[\s:,\-]+([\s\S]+)$/i;

/** Parse an operator "TO:<number> message" command, or null if it is not one. */
export function parseToCommand(body: string): ToCommand | null {
  const m = (body || "").match(TO_RE);
  if (!m) return null;
  return { customerNumber: normalizePhone(m[1]), messageBody: m[2].trim() };
}

const CALL_RE = /^CALL\s*(\+?\d{10,15})$/i;

/** Parse an operator "CALL <number>" command, or null if it is not one. */
export function parseCallCommand(body: string): string | null {
  const m = (body || "").match(CALL_RE);
  return m ? normalizePhone(m[1]) : null;
}

export type CustomerRoute = "optout" | "internal" | "normal";

// Order matters and mirrors the handler: A2P opt-out wins, internal automation
// is next, otherwise this is a real customer conversation.
export function classifyCustomerInbound(input: {
  from: string;
  body: string;
  optOutType?: string;
  internalSenders: Iterable<string>;
}): CustomerRoute {
  if ((input.optOutType || "").trim()) return "optout";
  if (isInternalRelay(input.from, input.body, input.internalSenders)) {
    return "internal";
  }
  return "normal";
}
