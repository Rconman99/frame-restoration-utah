// sms-suppression — application-level SMS opt-out state (TCPA / FCC 26-67).
// ─────────────────────────────────────────────────────────────────────────────
// Ported from the Colorado repo's _shared/sms-suppression.ts (pattern
// only, no shared data). FCC 26-67 (effective 2026-11-25) requires a reply of
// stop, quit, end, revoke, opt out, cancel or unsubscribe to be honored as a
// revocation. Twilio's default STOP filter covers single words only (no
// "OPT OUT"), and it blocks only the sender that received the reply, so every
// customer-facing send path also checks this table and fails closed.

export type SmsComplianceAction = "stop" | "start" | "help" | "none";

const STOP_WORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "REVOKE",
  "OPTOUT",
  "OPT OUT",
  "OPT-OUT",
]);
const START_WORDS = new Set(["START", "UNSTOP"]);
const HELP_WORDS = new Set(["HELP", "INFO"]);
const STRICT_US_E164 = /^\+1[0-9]{10}$/;

/** Case-insensitive; ignores surrounding punctuation; collapses whitespace. */
export function canonicalKeyword(value: string | null | undefined): string {
  return (value || "")
    .trim()
    .toUpperCase()
    .replace(/^[\s.,!?;:'"()]+|[\s.,!?;:'"()]+$/g, "")
    .replace(/\s+/g, " ");
}

/** True when the whole message is one of the opt-out words (not "stop by"). */
export function isOptOutKeyword(body: string | null | undefined): boolean {
  return STOP_WORDS.has(canonicalKeyword(body));
}

/**
 * Map Twilio's signed OptOutType (preferred) or a standalone body opt-out word
 * to the state transition to persist. Body START/HELP words are NOT inferred
 * (a customer "yes" is a conversation); only Twilio's OptOutType can START.
 * An unknown nonempty OptOutType fails safe as STOP.
 */
export function classifySmsComplianceAction(input: {
  optOutType?: string | null;
  body?: string | null;
}): SmsComplianceAction {
  const optOutType = canonicalKeyword(input.optOutType);
  if (optOutType) {
    if (START_WORDS.has(optOutType) || optOutType === "YES") return "start";
    if (HELP_WORDS.has(optOutType)) return "help";
    return "stop";
  }
  return isOptOutKeyword(input.body) ? "stop" : "none";
}

export type SmsSuppressionLookup =
  | { ok: true; suppressed: boolean }
  | {
    ok: false;
    error: "invalid_customer_number" | "preference_lookup_failed";
  };

export type SmsPreferenceMutation =
  | { ok: true; suppressed: boolean }
  | {
    ok: false;
    error:
      | "invalid_customer_number"
      | "invalid_compliance_action"
      | "preference_update_failed";
  };

export interface SmsPreferenceClient {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export const PREFERENCE_RPC = "apply_utah_sms_contact_preference";

export async function readSmsSuppression(
  client: SmsPreferenceClient,
  customerNumber: string,
): Promise<SmsSuppressionLookup> {
  if (!STRICT_US_E164.test(customerNumber)) {
    return { ok: false, error: "invalid_customer_number" };
  }
  const { data, error } = await client
    .from("sms_contact_preferences")
    .select("suppressed")
    .eq("customer_number", customerNumber)
    .maybeSingle();
  if (error) return { ok: false, error: "preference_lookup_failed" };
  return {
    ok: true,
    suppressed: Boolean(
      data && typeof data === "object" &&
        (data as { suppressed?: unknown }).suppressed === true,
    ),
  };
}

export async function applySmsComplianceAction(
  client: SmsPreferenceClient,
  input: {
    customerNumber: string;
    action: SmsComplianceAction;
    messageSid: string;
  },
): Promise<SmsPreferenceMutation> {
  if (!STRICT_US_E164.test(input.customerNumber)) {
    return { ok: false, error: "invalid_customer_number" };
  }
  if (input.action === "none") {
    return { ok: false, error: "invalid_compliance_action" };
  }
  const { data, error } = await client.rpc(PREFERENCE_RPC, {
    p_customer_number: input.customerNumber,
    p_action: input.action,
    p_message_sid: input.messageSid,
  });
  if (error) return { ok: false, error: "preference_update_failed" };
  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row || typeof row !== "object" ||
    typeof (row as { suppressed?: unknown }).suppressed !== "boolean"
  ) {
    return { ok: false, error: "preference_update_failed" };
  }
  return { ok: true, suppressed: (row as { suppressed: boolean }).suppressed };
}

/** Database errors block outbound customer SMS rather than guessing it is safe. */
export function smsSendAllowed(lookup: SmsSuppressionLookup): boolean {
  return lookup.ok && !lookup.suppressed;
}
