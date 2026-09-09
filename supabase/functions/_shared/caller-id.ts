// Inbound PSTN caller ID: preserve the presented number, with a business-line
// fallback for withheld/invalid/SIP callers. A name is metadata, never trust.
// https://www.twilio.com/docs/voice/twiml/dial#callerid
// https://www.twilio.com/docs/lookup/v2-api/caller-name

export function forwardedCallerId(
  from: unknown,
  businessPhone: string,
): string {
  const phone = typeof from === "string" ? from.trim() : "";
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : businessPhone;
}

export function normalizeCallerIdName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 80);
  if (
    !name ||
    /^(unknown|unavailable|anonymous|private|restricted|wireless caller|cell phone|not available|out of area)$/i
      .test(name)
  ) {
    return null;
  }
  return name;
}

// The caller's self-reported name/purpose stays separate from the CNAM listing.
export function callerIdIntroduction(name: unknown): string {
  const normalized = normalizeCallerIdName(name);
  return normalized ? `Caller ID lists ${normalized}. ` : "";
}

type IdentityConfig = {
  supabaseUrl: string;
  serviceKey: string;
  accountSid: string;
  authToken: string;
};

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Enrich an existing inbound call row. A conditional DB update atomically
 * claims the lookup, so concurrent/retried webhooks cannot charge twice.
 * Missing names, database failures, and provider failures never change routing.
 * No credentials or personal data are logged. At most ~2 seconds of network
 * wait (500ms claim + 1000ms lookup + 500ms persistence).
 */
export async function enrichCallerId(
  callSid: string,
  from: string,
  suppliedName: unknown,
  config: IdentityConfig,
  fetcher: Fetcher = fetch,
): Promise<void> {
  if (
    !/^CA[0-9a-f]{32}$/i.test(callSid) ||
    !config.supabaseUrl || !config.serviceKey
  ) return;
  const headers = {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const filter = new URLSearchParams({
    call_sid: `eq.${callSid}`,
    caller_name_lookup_status: "is.null",
    select: "call_sid",
  });
  const base = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/call_logs`;
  try {
    const claim = await fetcher(`${base}?${filter}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ caller_name_lookup_status: "pending" }),
      signal: AbortSignal.timeout(500),
    });
    if (!claim.ok) return;
    const rows = await claim.json();
    if (
      !Array.isArray(rows) || rows.length !== 1 || rows[0].call_sid !== callSid
    ) return;
  } catch {
    return;
  }

  let name = normalizeCallerIdName(suppliedName);
  // An empty/generic CallerName can be the result of a paid native lookup.
  // Its presence still suppresses a second lookup, even without a usable name.
  const nativeSupplied = typeof suppliedName === "string";
  let lookupStatus = nativeSupplied ? "native" : "not-eligible";
  if (!nativeSupplied && /^\+1\d{10}$/.test(from)) {
    lookupStatus = "unavailable";
    if (/^AC[0-9a-f]{32}$/i.test(config.accountSid) && config.authToken) {
      try {
        const response = await fetcher(
          `https://lookups.twilio.com/v2/PhoneNumbers/${
            encodeURIComponent(from)
          }?Fields=caller_name`,
          {
            headers: {
              Authorization: `Basic ${
                btoa(`${config.accountSid}:${config.authToken}`)
              }`,
            },
            signal: AbortSignal.timeout(1000),
          },
        );
        if (response.ok) {
          const result = await response.json();
          // Do not associate a provider result for a different phone number.
          if (
            result.phone_number === from && result.valid === true &&
            !result.caller_name?.error_code
          ) {
            name = normalizeCallerIdName(result.caller_name?.caller_name);
            lookupStatus = name ? "matched" : "empty";
          }
        }
      } catch {
        // Keep screening/ringing even if CNAM is slow or unavailable.
      }
    }
  }

  const saveFilter = new URLSearchParams({
    call_sid: `eq.${callSid}`,
    caller_name_lookup_status: "eq.pending",
  });
  try {
    await fetcher(`${base}?${saveFilter}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        caller_name: name,
        caller_name_lookup_status: lookupStatus,
      }),
      signal: AbortSignal.timeout(500),
    });
  } catch {
    // A pending row still suppresses duplicate paid lookups on a retry.
  }
}
