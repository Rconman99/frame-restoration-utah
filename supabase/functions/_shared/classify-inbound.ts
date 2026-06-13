// classify-inbound — pure inbound-SMS routing decisions for Frame Roofing Utah's
// handle-sms relay.
// ─────────────────────────────────────────────────────────────────────────────
// Side-effect-free. handle-sms imports these so the frozen contract
// (classify-inbound.test.ts) exercises the SAME routing the live relay runs —
// the parity port of the TX repo's _shared/classify-inbound.ts (which froze the
// relay after it misclassified inbound webhooks three times: opt-out leak,
// TO-parser too strict, internal automation treated as a customer).
//
// This is a BEHAVIOR-PRESERVING extraction of handle-sms v5's inline logic: the
// regexes and checks below are byte-for-byte what the handler used inline. No
// routing change ships with this commit — the gate just makes the current
// behavior un-droppable. (Notably, parseToCommand keeps UT's current STRICT form;
// hardening it to TX's bracket/space-tolerant #212 parser would be a deliberate
// follow-up with its own fixture, not a silent change here.)

// Landon's personal phone — the operator. A message From this number is an
// operator command (CALL / TO), never an inbound customer lead.
export const OPERATOR_PHONE = "+14353024422";

// Normalize a phone to E.164-ish form. Mirrors handle-sms's inline normalizePhone
// exactly: bare 10-digit → +1XXXXXXXXXX, 11-digit w/ leading 1 → +…, longer →
// +digits, anything else → returned unchanged (never throws on junk input).
export function normalizePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length > 10) return "+" + digits;
  return phone || "";
}

// Is this inbound From the operator (Landon)? Operator messages take the command
// path; everyone else is a customer. Phone is parameterized for testability but
// defaults to the live operator line.
export function isOperator(from: string, operatorPhone: string = OPERATOR_PHONE): boolean {
  return from === operatorPhone;
}

// `CALL <number>` → place an outbound call to the customer. Returns the E.164
// customer number, or null if the body isn't a CALL command. (Regex identical to
// handle-sms's inline `/^CALL\s*(\+?\d{10,15})$/i`.)
export function parseCallCommand(body: string): string | null {
  const m = (body || "").match(/^CALL\s*(\+?\d{10,15})$/i);
  if (!m) return null;
  return m[1].startsWith("+") ? m[1] : "+1" + m[1];
}

// `TO:<number> <message>` → relay a message to the customer. Returns
// {customerNumber, message} or null if it isn't a TO command. (Regex identical to
// handle-sms's inline `/^TO:\s*(\+?\d{10,15})\s+(.+)$/is` — the `s` flag lets the
// message span newlines.)
export function parseToCommand(
  body: string,
): { customerNumber: string; message: string } | null {
  const m = (body || "").match(/^TO:\s*(\+?\d{10,15})\s+(.+)$/is);
  if (!m) return null;
  const customerNumber = m[1].startsWith("+") ? m[1] : "+1" + m[1];
  return { customerNumber, message: m[2] };
}

// Customer-side classification. A Twilio Advanced Opt-Out event (OptOutType =
// STOP | START | HELP) must be logged + flagged but NEVER turned into a sticky
// conversation or force-forwarded as a normal message — replying to someone who
// just unsubscribed is exactly the A2P violation the relay must avoid.
export type CustomerInbound = "optout" | "normal";
export function classifyCustomerInbound(
  optOutType: string | null | undefined,
): CustomerInbound {
  return (optOutType || "").trim() ? "optout" : "normal";
}
