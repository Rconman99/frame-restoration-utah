// Single source of truth for choosing the outbound SMS sender.
//
// The Frame Messaging Service (MG8079…) holds MORE THAN ONE number: the main
// Heber line and the SLC GBP tracking DID. Twilio's Messaging Service sender
// selection assigns a number per NEW recipient from that pool, and Sticky
// Sender only pins threads that already exist. A send that supplies only
// MessagingServiceSid can therefore go out from a tracking DID — breaking NAP
// consistency and splitting the customer's thread across two numbers.
//
// Twilio honours an explicit From when that number belongs to the service, so
// pinning costs nothing: A2P campaign registration still applies.
//
// This helper exists because the same two lines were previously duplicated in
// handle-lead, send-message and review-request, and drifted apart. Route every
// outbound Messages.json send through it.

/** Canonical A2P sender of record — the public NAP line. */
export const MAIN_LINE = "+14352928802";

export type SenderOptions = {
  /** TWILIO_PHONE_NUMBER from app_config. May be empty/missing. */
  from?: string | null;
  /** TWILIO_MESSAGING_SERVICE_SID from app_config. May be empty/missing. */
  msgService?: string | null;
  /** Override the pinned fallback. Defaults to MAIN_LINE. */
  mainLine?: string;
};

/**
 * Set the sender fields on an outbound Messages.json parameter set.
 *
 * INVARIANT: `From` is ALWAYS set — never conditionally, never in an `else`.
 * `MessagingServiceSid` is set additionally when configured, so campaign
 * registration and service features still apply.
 */
export function applySender(
  params: URLSearchParams,
  opts: SenderOptions = {},
): void {
  const mainLine = (opts.mainLine || "").trim() || MAIN_LINE;
  const from = (opts.from || "").trim();
  params.set("From", from || mainLine);

  const svc = (opts.msgService || "").trim();
  if (svc) params.set("MessagingServiceSid", svc);
}
