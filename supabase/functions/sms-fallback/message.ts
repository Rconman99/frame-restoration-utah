// Pure message-shaping for the inbound SMS fallback. Kept separate from
// index.ts so it can be unit-tested without booting Deno.serve or reading env.

/** Landon's line — the destination for every fallback relay. */
export const LANDON_PHONE = "+14353024422";

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Length-independent comparison so the shared secret cannot be probed
 * byte by byte.
 */
export function tokenMatches(expected: string, supplied: string): boolean {
  if (!expected || !supplied) return false;
  if (supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }
  return diff === 0;
}

export type FallbackFields = {
  from?: string;
  body?: string;
  numMedia?: string;
  errorCode?: string;
};

/** Build the relay message Landon receives when the primary handler fails. */
export function buildFallbackMessage(params: FallbackFields): string {
  const errorCode = (params.errorCode || "").trim();
  const mediaCount = Number.parseInt(params.numMedia || "0", 10);
  const header = "[FALLBACK - primary SMS handler failed" +
    (errorCode ? " (Twilio " + errorCode + ")" : "") + "]";
  const attachments = Number.isFinite(mediaCount) && mediaCount > 0
    ? "\n[" + mediaCount + " attachment" + (mediaCount === 1 ? "" : "s") +
      " could not be relayed - ask the sender to resend]"
    : "";
  return header + "\n[From: " + ((params.from || "").trim() || "unknown") +
    "]\n" + (params.body || "") + attachments;
}

/** Full TwiML body for the relay. */
export function buildFallbackTwiml(params: FallbackFields): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Message to="' +
    LANDON_PHONE + '">' + escapeXml(buildFallbackMessage(params)) +
    "</Message></Response>";
}
