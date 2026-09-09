export type ScreeningAction = "connect" | "voicemail" | "reject";

export type ScreeningDecision = {
  action: ScreeningAction;
  reason:
    | "caller_response"
    | "no_input"
    | "explicit_solicitation"
    | "likely_solicitation";
  transcript: string;
};

const MAX_TRANSCRIPT_LENGTH = 500;

// Keep this deliberately narrow. A false negative gives the owner a private
// accept/reject whisper; a false positive can cost a real roofing lead.
const LIKELY_SOLICITATION = [
  /\b(?:(?:calling (?:from|about)|regarding) (?:your )?google (?:business|maps?) (?:profile|listing)|google (?:business|maps?) (?:profile|listing) (?:support|team|verification|optimization))\b/i,
  /\bsearch engine optimization\b/i,
  /\bseo (?:service|agency|package|proposal)\b/i,
  /\b(?:digital )?marketing (?:service|agency|package|proposal)\b/i,
  /\bwebsite (?:design|development|service|package|proposal)\b/i,
  /\b(?:lead generation|buy(?:ing)? (?:roofing )?leads|sell(?:ing)? (?:you )?(?:roofing )?leads)\b/i,
  /\bmerchant services?\b/i,
  /\bcredit card processing\b/i,
  /\bbusiness (?:loan|funding|line of credit)\b/i,
  /\b(?:payroll|telecom|copier|office suppl(?:y|ies)) services?\b/i,
];

const EXPLICIT_SOLICITATION =
  /^(?:(?:this is|it is) )?(?:a )?(?:sales|solicitation|telemarketing)(?: call)?[.!]?$/i;
const REUSABLE_LEAD_STATUSES_DENYLIST = new Set([
  "spam",
  "lost",
  "third_party",
  "ul_request",
]);
const TRUSTED_LEAD_STATUSES = new Set(["contacted", "estimated", "won"]);

export function normalizeScreeningTranscript(
  value: string | null | undefined,
): string {
  const withoutControls = [...(value ?? "")].map((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");
  return withoutControls
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TRANSCRIPT_LENGTH);
}

export function classifyScreeningResponse(
  value: string | null | undefined,
): ScreeningDecision {
  const transcript = normalizeScreeningTranscript(value);
  if (!transcript) {
    return { action: "voicemail", reason: "no_input", transcript };
  }
  if (EXPLICIT_SOLICITATION.test(transcript)) {
    return { action: "reject", reason: "explicit_solicitation", transcript };
  }
  if (LIKELY_SOLICITATION.some((pattern) => pattern.test(transcript))) {
    return { action: "reject", reason: "likely_solicitation", transcript };
  }
  return { action: "connect", reason: "caller_response", transcript };
}

export function isReusableCallerLead(status: unknown): boolean {
  return !REUSABLE_LEAD_STATUSES_DENYLIST.has(
    String(status || "").toLowerCase(),
  );
}

export function isTrustedCallerLead(
  status: unknown,
  sourcePage: unknown,
): boolean {
  const normalizedStatus = String(status || "").toLowerCase();
  if (TRUSTED_LEAD_STATUSES.has(normalizedStatus)) {
    return true;
  }
  return normalizedStatus === "new" &&
    String(sourcePage || "").toLowerCase() !== "inbound-call";
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function screeningNote(transcript: string): string {
  const safe = normalizeScreeningTranscript(transcript);
  return safe
    ? `Virtual assistant response: ${safe}`
    : "Virtual assistant received no speech.";
}

export function transcriptFromScreeningNote(
  note: string | null | undefined,
): string {
  const prefix = "Virtual assistant response: ";
  const normalized = normalizeScreeningTranscript(note);
  return normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized;
}
