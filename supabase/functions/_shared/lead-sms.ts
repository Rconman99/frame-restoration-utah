// Pure SMS message builders + the consent decision for handle-lead — extracted
// from handle-lead v8 so lead-sms.test.ts can freeze the customer-facing copy
// (same eval-as-gate pattern as the TX repo's _shared/lead-sms.ts).
//
// Changes vs the v8 inline copy:
//   • every customer auto-reply now ends with the A2P "Reply STOP to opt out."
//     line — this number runs on an approved 10DLC campaign and the first
//     business-initiated text must carry opt-out language.
//   • smsDeliveryEnabled() is the market-wide operational kill switch. It is
//     fail-closed: only the exact string "true" enables any Utah SMS path.
//   • shouldSendCustomerAutoText() is the TCPA consent gate: the form's
//     sms_consent checkbox was previously collected and IGNORED. No consent →
//     no auto-text, full stop. Both gates must pass for a customer auto-text.

export type Tier = "emergency" | "urgent" | "scheduled" | "general" | "spam";

export const SMS_BUSINESS_PHONE = "(435) 292-8802";
const STOP_LINE = "Reply STOP to opt out.";

/** Operational gate for every Utah SMS path, including internal owner alerts.
 * Absence, whitespace, case variants, booleans, and all other values stay off. */
export function smsDeliveryEnabled(value: unknown): boolean {
  return value === "true";
}

/** TCPA gate: business-initiated text to a customer requires their explicit
 * opt-in AND a usable phone. Anything else → no send (caller logs why). */
export function shouldSendCustomerAutoText(
  smsConsent: unknown,
  normalizedPhone: string | null,
): { send: boolean; reason: string } {
  const consent = smsConsent === true || smsConsent === "true" ||
    smsConsent === "yes" ||
    smsConsent === "on" || smsConsent === "1" || smsConsent === 1;
  if (!consent) return { send: false, reason: "no_consent" };
  if (!normalizedPhone) return { send: false, reason: "no_valid_phone" };
  return { send: true, reason: "consented" };
}

export function smsForLandon(
  tier: Tier,
  leadName: string,
  phone: string,
  service: string,
  reason: string,
): string {
  const phoneStr = phone || "no phone";
  switch (tier) {
    case "emergency":
      return `🚨 EMERGENCY LEAD: ${leadName} | ${phoneStr} | ${service}\nReason: ${reason}\nCall NOW.`;
    case "urgent":
      return `🔥 URGENT LEAD: ${leadName} | ${phoneStr} | ${service}\nReason: ${reason}\nCall today.`;
    case "general":
      return `INFO REQUEST: ${leadName} | ${phoneStr} | ${service}`;
    case "scheduled":
    default:
      return `NEW LEAD: ${leadName} | ${phoneStr} | ${service}`;
  }
}

export function customerAutoReply(tier: Tier, firstName: string): string {
  const greeting = firstName ? `Hi ${firstName}! ` : "Hi! ";
  let body: string;
  switch (tier) {
    case "emergency":
      body = greeting +
        "Thanks for reaching out to Frame Roofing Utah. We saw you're dealing with an emergency — " +
        `we're calling you within 15 minutes. If you can't wait, call us right now at ${SMS_BUSINESS_PHONE}. - Landon, Owner`;
      break;
    case "urgent":
      body = greeting +
        "Thanks for reaching out to Frame Roofing Utah! Storm damage is time-sensitive — " +
        `we'll call you within the hour. Need us sooner? ${SMS_BUSINESS_PHONE}. - Landon, Owner`;
      break;
    case "general":
      body = greeting +
        "Thanks for reaching out to Frame Roofing Utah! We'll get back to you within one business day. " +
        `If it's urgent, call us at ${SMS_BUSINESS_PHONE}. - Landon, Owner`;
      break;
    case "scheduled":
    default:
      body = greeting +
        "Thanks for reaching out to Frame Roofing Utah! A roofing specialist will call you shortly — usually within minutes. " +
        `If you need us right away, call ${SMS_BUSINESS_PHONE}. - Landon, Owner`;
      break;
  }
  return `${body}\n${STOP_LINE}`;
}
