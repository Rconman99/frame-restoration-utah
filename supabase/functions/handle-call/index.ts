// handle-call v7 — one short caller prompt, then press one directly rings Landon.
// v6 interview/owner-whisper callbacks remain available for in-flight calls.
// ─────────────────────────────────────────────────────────────────────────────
// v5 (2026-09-04): Humanized voice. Caller-facing prompts use Twilio's Google
//   Chirp 3 HD generative voice; the private owner whisper stays on Amazon
//   Polly's deterministic Joanna Neural engine so names and callback digits are
//   less exposed to generative speech variation.
//
// v4 (2026-09-04): Virtual receptionist (Phase 1). Known customers ring through.
//   Every other caller must say their name, callback number, and reason for the
//   call. Silent bots go to voicemail, narrow high-confidence solicitation
//   phrases are declined, and the remaining callers reach a private owner
//   whisper where Landon presses 1 to accept. Rejected callers go to voicemail.
//
// v3 (2026-06-16): Spam-call mitigation (Phase 0). Inbound calls are now routed:
//   • blocklisted number (blocked_callers table) → polite hangup, no ring, no lead
//   • Utah area code (801/385/435)                → ring straight through (frictionless)
//   • anything else (out-of-state / no caller ID) → "press 1 to connect" screen
//        - press 1  → create lead + ring Landon (proves a human)
//        - no input → voicemail, NO lead (robo-dialers land here)
//   This stops robocalls from ringing Landon AND from polluting /leads, while a
//   real human is never dead-ended (voicemail fallback everywhere). Lead creation
//   for screened calls is DEFERRED to /connect so spam never becomes a "general"
//   lead. Blocklist + attestation logic both FAIL OPEN (a DB blip or absent table
//   degrades to ringing, never to dropping a real call).
//
// v2 (2026-05-16): Auto-create a leads row on first inbound call from a
//   previously-unseen phone number (closed the call_logs-not-in-/leads gap).
//
// Source pulled from prod 2026-05-16 (deployed v5) + lead-create patch + v3 screening.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioRequest } from "../_shared/twilio-verify.ts";
import {
  continueReceptionist,
  readScreening,
  recordScreeningOutcome,
  type ScreeningConfig,
} from "../_shared/receptionist-store.ts";
import {
  callerIdIntroduction,
  enrichCallerId,
  forwardedCallerId,
} from "../_shared/caller-id.ts";
import {
  classifyScreeningResponse,
  isReusableCallerLead,
  isTrustedCallerLead,
  normalizeScreeningTranscript,
  screeningNote,
  transcriptFromScreeningNote,
  xmlEscape,
} from "../_shared/call-screening.ts";
import {
  missedCallAlertText,
  normalizeAlertPhone,
  shouldAlertMissedCall,
} from "../_shared/missed-call-alert.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const LANDON_PHONE = "+14353024422";
const POSTHOG_API_KEY = "phc_BnECzlZ2OeDujli2dbqcgGODXlv2tYERbp40dTF7UBV";
const CALLER_VOICE = "Google.en-US-Chirp3-HD-Aoede";
const CONNECT_VOICE = "Polly.Joanna-Neural";
const OWNER_WHISPER_VOICE = "Polly.Joanna-Neural";
const TWILIO_RESPONSE_BUDGET_MS = 6000;
const TWILIO_DB_OPERATION_CAP_MS = 2500;
const TWILIO_DURABLE_CALLBACK_OVERRIDES =
  "ct=1000&rt=5000&tt=15000&rc=2&rp=5xx,ct,rt&e=umatilla,ashburn";
const receptionistConfig = (): ScreeningConfig => ({
  supabaseUrl: SUPABASE_URL,
  serviceKey: SUPABASE_SERVICE_ROLE_KEY,
  owner: "Landon",
  voice: CALLER_VOICE,
  dial: dialLandonTwiml,
  voicemail: voicemailTwiml,
});

// ── Call-source attribution (commission tracking) ────────────────────────────
// Each public tracking number maps to a lead source + whether that lead counts
// toward Ryan's commission. Google (GBP) + the website both publish the canonical
// NAP below → commission. EVERY OTHER tracking number is a directory line
// (HomeAdvisor / Yelp / Angi / etc.) → NOT commission. Provision a directory
// number in Twilio, point its voice webhook at this same function, then add a row
// here. Unknown dialed numbers default to NON-commission so the ledger never
// over-counts (a misroute or not-yet-mapped number is treated as not-Ryan's).
const NUMBER_SOURCES: Record<string, { source: string; commission: boolean }> =
  {
    "+14352928802": { source: "google_website", commission: true }, // GBP + website NAP
    "+14356108978": { source: "slc_backlink", commission: true }, // Contractor ReIndependence SLC tracking DID
    "+18014620526": { source: "slc_gbp", commission: true }, // SLC office GBP tracking DID (SLC rate center; replaced released Springville-locality 801 on 2026-08-10)
    // "+1XXXXXXXXXX": { source: "directory", commission: false },   // ← directory tracking line (add once provisioned)
  };
function classifyDialedNumber(
  toNumber: string,
): { source: string; commission: boolean } {
  return NUMBER_SOURCES[normalizePhone(toNumber)] ??
    { source: "unknown", commission: false };
}
// True if `toNumber` is any phone number we own (configured business line OR a
// mapped tracking number). Gates the inbound webhook so a second tracking number
// isn't rejected by the single-number `creds.phone` check.
function isOurBusinessNumber(
  toNumber: string,
  configuredPhone?: string,
): boolean {
  const norm = normalizePhone(toNumber);
  if (configuredPhone && norm === normalizePhone(configuredPhone)) return true;
  return norm in NUMBER_SOURCES;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function twilioDeadlineSignal(deadlineMs: number): AbortSignal {
  return AbortSignal.timeout(
    Math.max(
      1,
      Math.min(TWILIO_DB_OPERATION_CAP_MS, deadlineMs - Date.now()),
    ),
  );
}

function normalizePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length > 10) return "+" + digits;
  return phone || "";
}

function lastFour(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.slice(-4) || "????";
}

// ── Spam screening (Phase 0, v3) ─────────────────────────────────────────────
// Known repeat spam callers (blocked_callers table) get a polite hangup. Fails
// OPEN: if the query errors or the table is absent, returns false (call proceeds).
async function isBlockedCaller(phone: string): Promise<boolean> {
  const norm = normalizePhone(phone);
  if (!norm) return false;
  const { data, error } = await supabase
    .from("blocked_callers").select("phone").eq("phone", norm).limit(1);
  if (error) return false; // fail open — never drop a call over a blocklist error
  return !!(data && data.length);
}

function xml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: { "Content-Type": "text/xml" },
  });
}

function durableTwilioCallbackUrl(pathAndQuery: string): string {
  return xmlEscape(
    `${SUPABASE_URL}/functions/v1/handle-call/${pathAndQuery}#${TWILIO_DURABLE_CALLBACK_OVERRIDES}`,
  );
}

// Connect the caller to Landon. Screened callers get a private whisper before
// the bridge opens; known customers retain the existing direct-ring behavior.
function dialLandonTwiml(callerId: string, screenCallSid = ""): string {
  const statusCallbackUrl = `${SUPABASE_URL}/functions/v1/handle-call/status`;
  const screened = /^CA[0-9a-f]{32}$/i.test(screenCallSid);
  const completedCallbackUrl = durableTwilioCallbackUrl(
    screened ? "completed?screened=1" : "completed",
  );
  const whisperUrl = screened
    ? `${SUPABASE_URL}/functions/v1/handle-call/whisper?screenCallSid=${screenCallSid}`
    : "";
  return `<Response>
  <Dial callerId="${xmlEscape(callerId)}" timeout="30"${
    screened ? ' answerOnBridge="true"' : ""
  }
        action="${completedCallbackUrl}"
        record="record-from-answer-dual">
    <Number statusCallbackEvent="initiated ringing answered completed"
            statusCallback="${statusCallbackUrl}"${
    screened ? ` url="${whisperUrl}" method="POST"` : ""
  }>
      ${LANDON_PHONE}
    </Number>
  </Dial>
</Response>`;
  // No-answer voicemail is handled by the /completed Dial-action callback — a
  // trailing <Record> here would be dead code (<Dial action> overrides fall-through).
}

// Every <Record> below sets an explicit action → /voicemail (a no-op route that
// just saves the recording). Without it, <Record> defaults its action to the
// current document URL, looping back into /handle-call or /connect (and a "1"
// finish-key could be misread as "press 1 to connect" → ghost lead).
const RECORD =
  `<Record maxLength="120" transcribe="true" action="${SUPABASE_URL}/functions/v1/handle-call/voicemail" />`;

// One caller-side keypress replaces the multi-turn interview and owner whisper.
// numDigits=1 submits immediately on the first key (no pound key or speech wait).
// Silence/other keys retain the existing voicemail fallback without creating a lead.
function screenTwiml(): string {
  return `<Response>
  <Gather input="dtmf" numDigits="1" timeout="6"
          actionOnEmptyResult="true" method="POST"
          action="${SUPABASE_URL}/functions/v1/handle-call/connect">
    <Say voice="${CONNECT_VOICE}">Hey, this is Frame Restoration's virtual assistant. Press one to connect.</Say>
  </Gather>
</Response>`;
}

function voicemailTwiml(intro?: string): string {
  return `<Response>
  <Say voice="${CALLER_VOICE}">${
    xmlEscape(
      intro ||
        "Landon couldn't pick up. Please leave your name, the best number to reach you, and a message after the beep.",
    )
  }</Say>
  ${RECORD}
</Response>`;
}

function blockedTwiml(): string {
  return `<Response>
  <Say voice="${CALLER_VOICE}">This number does not accept solicitation calls. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

// Returns existing lead id if one matches the phone in the last 90 days, else null.
async function findRecentLead(phone: string): Promise<number | null> {
  if (!phone) return null;
  // Build .or() candidates ONLY from a strict 10-digit validated value so a forged
  // From can't inject PostgREST operator syntax into the filter (CODEX MED). Match
  // either the +1XXXXXXXXXX form or the raw 10-digit form (older rows are mixed).
  const ten = (phone || "").replace(/\D/g, "").slice(-10);
  if (!/^\d{10}$/.test(ten)) return null;
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data } = await supabase
    .from("leads")
    .select("id,status")
    .or(`phone.eq.+1${ten},phone.eq.${ten},phone.ilike.%${ten}`)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);

  const reusable = (data ?? []).find((lead: { status?: unknown }) =>
    isReusableCallerLead(lead.status)
  );
  return reusable?.id ?? null;
}

// Phase 0 created "new" inbound-call leads before anyone answered, so the mere
// existence of a lead row does not prove this is a known customer. Only an
// engaged pipeline status or a non-call intake source earns direct-ring trust.
async function findTrustedRecentLead(phone: string): Promise<number | null> {
  if (!phone) return null;
  const ten = (phone || "").replace(/\D/g, "").slice(-10);
  if (!/^\d{10}$/.test(ten)) return null;
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data } = await supabase
    .from("leads")
    .select("id,status,source_page")
    .or(`phone.eq.+1${ten},phone.eq.${ten},phone.ilike.%${ten}`)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);

  const trusted = (data ?? []).find((lead: {
    status?: unknown;
    source_page?: unknown;
  }) => isTrustedCallerLead(lead.status, lead.source_page));
  return trusted?.id ?? null;
}

async function createInboundCallLead(
  fromNumber: string,
  city: string,
  classifier = "auto-inbound-call",
  attribution: { source: string; commission: boolean } = {
    source: "unknown",
    commission: false,
  },
  assistantTranscript = "",
  initialStatus = "new",
  callerReportedName = "",
): Promise<number | null> {
  if (!fromNumber || fromNumber === "unknown") return null;
  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: callerReportedName || `Inbound caller — ${lastFour(fromNumber)}`,
      phone: normalizePhone(fromNumber),
      address: null, // Caller-ID locality is not the customer's service address.
      city: city ? city.split(",")[0].trim() : null,
      source_page: "inbound-call",
      call_source: attribution.source,
      commission_eligible: attribution.commission,
      status: initialStatus,
      tier: "general",
      tier_classifier: classifier,
      tier_reason: "Auto-created by handle-call on first call from this number",
      notes: assistantTranscript
        ? `${
          assistantTranscript.startsWith("Assistant screening (")
            ? assistantTranscript
            : screeningNote(assistantTranscript)
        } Caller-ID locality is not the service address. Confirm name and job details with the caller.`
        : "Auto-created from inbound call. Update name/details when you have them.",
    })
    .select("id")
    .single();
  if (error) {
    console.error("[handle-call] lead insert failed:", error);
    return null;
  }
  return data?.id ?? null;
}

// Load Twilio creds (auth token + account SID + business number) from app_config.
// handle-call did not previously read these; needed for signature validation.
async function getTwilioCreds(
  deadlineMs = Date.now() + TWILIO_DB_OPERATION_CAP_MS,
) {
  const { data } = await supabase.from("app_config").select("key, value").in(
    "key",
    ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
  ).abortSignal(twilioDeadlineSignal(deadlineMs));
  const config: Record<string, string> = {};
  data?.forEach((r: any) => {
    config[r.key] = r.value;
  });
  return {
    sid: config.TWILIO_ACCOUNT_SID,
    auth: config.TWILIO_AUTH_TOKEN,
    phone: config.TWILIO_PHONE_NUMBER,
  };
}

// ── Missed-call alert to the owner ───────────────────────────────────────────
// Closes the gap that made every missed call invisible: Landon's handset shows
// the forwarding number ("Frame Website"), not the caller, and nothing texted
// him. The lead_notifications outbox is email-only and wired to handle-lead.
// This is a direct SMS on the /completed callback instead of a retrofit of that
// outbox: different channel, different recipient, and the webhook claim below
// already gives us once-only semantics.

/** Numbers Landon has BLOCKed. Fails OPEN — see shouldAlertMissedCall. */
async function loadSuppressedCallers(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("alert_suppressed_callers")
    .select("phone");
  if (error) {
    console.error(
      "[handle-call] suppression lookup failed, alerting anyway:",
      error.message,
    );
    return new Set();
  }
  return new Set((data ?? []).map((r: any) => normalizeAlertPhone(r.phone)));
}

function internalAlertLines(): Set<string> {
  const configured = (Deno.env.get("INTERNAL_RELAY_NUMBERS") || "")
    .split(",")
    .map(normalizeAlertPhone)
    .filter(Boolean);
  return new Set(
    [LANDON_PHONE, ...Object.keys(NUMBER_SOURCES), ...configured]
      .map(normalizeAlertPhone)
      .filter(Boolean),
  );
}

async function sendOwnerSMS(body: string): Promise<string | null> {
  const creds = await getTwilioCreds();
  if (!creds.sid || !creds.auth) {
    console.error(
      "[handle-call] Twilio creds missing — missed-call alert not sent",
    );
    return null;
  }
  const params = new URLSearchParams();
  params.set("To", LANDON_PHONE);
  params.set("Body", body);
  // Pin From to the A2P sender of record. The Messaging Service pool holds more
  // than one number and assigns a sender per NEW recipient, so without this an
  // alert could arrive from a tracking DID.
  params.set("From", creds.phone || "+14352928802");
  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + btoa(creds.sid + ":" + creds.auth),
        },
        body: params.toString(),
      },
    );
    const result = await resp.json();
    if (result.sid) return String(result.sid);
    console.error(
      "[handle-call] missed-call SMS failed:",
      result.message || result,
    );
    return null;
  } catch (err) {
    console.error("[handle-call] missed-call SMS threw:", err);
    return null;
  }
}

/** How many times this number has called, for the "Call #3" line. */
async function callCountFor(fromNumber: string): Promise<number> {
  const { count, error } = await supabase
    .from("call_logs")
    .select("id", { count: "exact", head: true })
    .eq("from_number", fromNumber);
  return error || typeof count !== "number" ? 0 : count;
}

// Process-once claim for Twilio retries (CODEX). Inserts the event key into
// processed_webhooks; the PK makes it atomic. Returns false if already claimed
// (a retry) so the caller can skip the one-time side effects. fail-open default —
// a DB blip shouldn't drop call handling. (call_logs has no unique call_sid, so
// this claim, not an upsert, is what makes the insert retry-safe.)
async function claimWebhook(
  eventKey: string,
  failOpen = true,
): Promise<boolean> {
  if (!eventKey) return true;
  const { error } = await supabase.from("processed_webhooks").insert({
    event_key: eventKey,
  });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false; // already processed
  console.error(
    "[handle-call] claimWebhook error:",
    error,
    "failOpen=",
    failOpen,
  );
  return failOpen;
}

async function sendPostHogEvent(
  event: string,
  properties: Record<string, unknown>,
) {
  try {
    await fetch("https://us.i.posthog.com/capture/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        event,
        properties: {
          distinct_id: properties.from_number || "anonymous",
          ...properties,
        },
      }),
    });
  } catch (e) {
    console.error("PostHog error:", e);
  }
}

// Keep the owner whisper callback off the CRM/storage critical path. Twilio
// allows only 15 seconds for the <Number url> response; lead reconciliation is
// important, but it must never delay the TwiML that actually bridges the call.
type OwnerDecision = "accepted" | "voicemail" | "timeout";

type OwnerDecisionResult = {
  decision: OwnerDecision | null;
  ambiguousTransportFailure: boolean;
};

function isAmbiguousTransportFailure(
  error: unknown,
  status = 0,
): boolean {
  if (status !== 0) return false;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error
    ? error.message
    : String((error as { message?: unknown } | null)?.message || "");
  return name === "AbortError" || name === "TimeoutError" ||
    /(?:AbortError|TimeoutError)/.test(message);
}

async function persistOwnerScreenDecision(
  screenCallSid: string,
  requestedDecision: OwnerDecision,
  deadlineMs?: number,
): Promise<OwnerDecisionResult> {
  try {
    let request = supabase.rpc(
      "finalize_owner_screen_decision",
      {
        p_call_sid: screenCallSid,
        p_requested_decision: requestedDecision,
      },
    );
    if (deadlineMs !== undefined) {
      request = request.abortSignal(twilioDeadlineSignal(deadlineMs));
    }
    const { data, error, status } = await request;
    const decision = data === "accepted" || data === "voicemail" ||
        data === "timeout"
      ? data
      : null;
    return {
      decision: error ? null : decision,
      ambiguousTransportFailure: error
        ? isAmbiguousTransportFailure(error, status)
        : false,
    };
  } catch (error) {
    return {
      decision: null,
      ambiguousTransportFailure: isAmbiguousTransportFailure(error),
    };
  }
}

async function finalizeOwnerScreenDecision(
  screenCallSid: string,
  requestedDecision: OwnerDecision,
): Promise<void> {
  const result = await persistOwnerScreenDecision(
    screenCallSid,
    requestedDecision,
  );
  if (!result.decision) {
    // Keep provider/database details and caller identifiers out of logs.
    console.error("[handle-call] owner-screen finalization failed");
  }
}

async function repairOwnerScreenDecision(
  screenCallSid: string,
  decisionHint: "accepted" | "voicemail" | "timeout" | null,
): Promise<void> {
  let decision = decisionHint;
  if (!decision) {
    try {
      const screening = await readScreening(
        receptionistConfig(),
        screenCallSid,
      );
      decision = screening?.owner_decision ??
        (screening?.bridged === true ? "accepted" : null);
    } catch {
      return;
    }
  }
  if (decision) {
    await finalizeOwnerScreenDecision(screenCallSid, decision);
  }
}

export async function handleCallRequest(req: Request): Promise<Response> {
  // Reserve nine seconds of Twilio's 15-second webhook window for cold start,
  // network delivery, and the returned TwiML. Credential loading and the
  // decision/recovery transaction share one absolute six-second deadline.
  const twilioResponseDeadline = Date.now() + TWILIO_RESPONSE_BUDGET_MS;
  const url = new URL(req.url);
  // Normalize trailing slashes so `/handle-call/status/` routes the same as
  // `/handle-call/status` (otherwise `.pop()` yields "" and misroutes to inbound).
  const path = url.pathname.replace(/\/+$/, "").split("/").pop();

  const formData = await req.formData();
  const data: Record<string, string> = {};
  formData.forEach((value, key) => {
    data[key] = value.toString();
  });

  // Keep caller text, phone numbers, recordings and signatures out of runtime logs.
  console.log(`[handle-call] path=${path}`);

  // ─── SECURITY GATE: verify Twilio signature BEFORE any DB write / TwiML.
  // Covers all paths (inbound + /status + /completed). The body has already been
  // consumed into `data`, which we pass as the signed POST params.
  const creds = await getTwilioCreds(twilioResponseDeadline);
  const verified = await verifyTwilioRequest(req, data, creds.auth);
  if (!verified.ok) {
    console.warn("[handle-call] rejected Twilio request:", verified.reason);
    return new Response("Forbidden", { status: 403 });
  }
  // AccountSid must match our account when both are present.
  if (data.AccountSid && creds.sid && data.AccountSid !== creds.sid) {
    return new Response("Forbidden", { status: 403 });
  }

  const isInbound = path === "handle-call" || path === "" || !path;
  // On the INBOUND path, the call must be to a number we own — the configured
  // business line OR any mapped tracking number (so a directory tracking line
  // routed at this same function isn't rejected). Skip on /status + /completed
  // callbacks (their `To` is the dialed party, i.e. Landon's cell).
  if (isInbound && creds.phone && !isOurBusinessNumber(data.To, creds.phone)) {
    return new Response("Forbidden", { status: 403 });
  }

  // === INCOMING CALL ===
  if (path === "handle-call" || path === "" || !path) {
    const callSid = (data.CallSid || "").trim();
    // Reject a missing/blank CallSid instead of writing an "unknown" row that can
    // collide across bad requests (CODEX). A real Twilio inbound call always has one.
    if (!callSid) return new Response("Forbidden", { status: 403 });
    const fromNumber = data.From || "unknown";
    const toNumber = data.To || "unknown";
    const callerCity = data.FromCity || "";
    const callerState = data.FromState || "";
    const cityLabel = callerCity ? `${callerCity}, ${callerState}` : "unknown";

    // Blocked callers are declined, known customers ring directly, and unknown
    // callers get the single press-one gate. A lookup failure safely screens.
    const stirVerstat = data.StirVerstat || "";
    const blocked = await isBlockedCaller(fromNumber);
    const recentLeadId = blocked
      ? null
      : await findTrustedRecentLead(fromNumber);
    const route = blocked ? "blocked" : (recentLeadId ? "ring" : "screen");
    // Which tracking number was dialed → lead source + commission eligibility.
    const attribution = classifyDialedNumber(toNumber);

    // Idempotency: run side effects (lead lookup + call_logs + analytics)
    // ONCE per call, deduped via the processed_webhooks claim. We ALWAYS return the
    // routed TwiML below, so a retry is still handled: the claim guards side effects,
    // not call handling. For the "screen" route, lead creation is deferred until
    // the caller presses one; silent robocalls stay out of /leads.
    if (await claimWebhook(`call:${callSid}`)) {
      let leadId: number | null = null;
      let logStatus = "ringing";
      if (route === "blocked") {
        logStatus = "blocked-spam";
      } else if (route === "ring") {
        leadId = recentLeadId;
      } else {
        logStatus = "screening"; // lead deferred until the caller presses one
      }

      const { error } = await supabase.from("call_logs").insert({
        call_sid: callSid,
        from_number: fromNumber,
        to_number: toNumber,
        forwarded_to: LANDON_PHONE,
        status: logStatus,
        city: cityLabel,
        source_page: attribution.source,
        lead_id: leadId,
      });
      if (error) console.error("[handle-call] call_logs insert error:", error);
      if (!error && route !== "blocked") {
        await enrichCallerId(callSid, fromNumber, data.CallerName, {
          supabaseUrl: SUPABASE_URL,
          serviceKey: SUPABASE_SERVICE_ROLE_KEY,
          accountSid: creds.sid || "",
          authToken: creds.auth || "",
        });
      }

      await sendPostHogEvent(
        route === "blocked"
          ? "blocked_spam_call"
          : route === "screen"
          ? "screening_call"
          : "inbound_call",
        {
          from_number: fromNumber,
          caller_city: callerCity,
          caller_state: callerState,
          stir_verstat: stirVerstat,
          route,
          source: attribution.source,
          commission: attribution.commission,
          lead_id: leadId,
        },
      );
    }

    if (route === "blocked") return xml(blockedTwiml());
    if (route === "screen") {
      return xml(screenTwiml());
    }
    return xml(dialLandonTwiml(forwardedCallerId(fromNumber, toNumber)));
  }

  if (path === "receptionist") {
    if (!isOurBusinessNumber(data.To, creds.phone)) {
      return new Response("Forbidden", { status: 403 });
    }
    return xml(
      await continueReceptionist(
        receptionistConfig(),
        data,
        url.searchParams.get("step") || "",
        forwardedCallerId(data.From, data.To),
      ),
    );
  }

  // === CALLER PRESS-ONE RESULT ===
  // No interview, connecting announcement, or private owner acceptance prompt.
  if (path === "connect") {
    const digits = (data.Digits || "").trim();
    const callSid = (data.CallSid || "").trim();
    if (
      !/^CA[0-9a-f]{32}$/i.test(callSid) ||
      !isOurBusinessNumber(data.To, creds.phone)
    ) {
      return new Response("Forbidden", { status: 403 });
    }
    const fromNumber = data.From || "unknown";
    const callerId = forwardedCallerId(data.From, data.To || creds.phone || "");
    // Classify off the ORIGINAL dialed number ONLY (data.To). Never fall back to
    // creds.phone here — that's the commissionable website line, so a /connect
    // callback missing `To` would silently become google_website/commission=true.
    // Missing `To` → "unknown" → non-commission (safe direction; never over-counts).
    const attribution = classifyDialedNumber(data.To || "unknown");
    if (digits === "1") {
      if (callSid && (await claimWebhook(`connect:${callSid}`))) {
        let leadId: number | null = null;
        if (fromNumber && fromNumber !== "unknown") {
          leadId = await findRecentLead(fromNumber);
          if (!leadId) {
            const cityLabel = data.FromCity
              ? `${data.FromCity}, ${data.FromState || ""}`
              : "unknown";
            leadId = await createInboundCallLead(
              fromNumber,
              cityLabel,
              "auto-inbound-call-screened",
              attribution,
            );
          }
        }
        await supabase.from("call_logs").update({
          status: "ringing",
          lead_id: leadId,
        }).eq("call_sid", callSid);
        await sendPostHogEvent("inbound_call", {
          from_number: fromNumber,
          route: "screen-passed",
          source: attribution.source,
          commission: attribution.commission,
          lead_id: leadId,
        });
      }
      return xml(dialLandonTwiml(callerId));
    }
    // No valid keypress (robo-dialers, abandons) → voicemail, no lead.
    return xml(voicemailTwiml());
  }

  // === VIRTUAL RECEPTIONIST RESULT ===
  if (path === "screen") {
    const callSid = (data.CallSid || "").trim();
    const fromNumber = data.From || "unknown";
    const callerId = forwardedCallerId(data.From, data.To || creds.phone || "");
    const decision = classifyScreeningResponse(data.SpeechResult);
    const note = screeningNote(decision.transcript);

    const persistResult = /^CA[0-9a-f]{32}$/i.test(callSid) &&
      await claimWebhook(`screen:${callSid}`, false);
    if (persistResult) {
      await supabase.from("call_logs").update({
        status: decision.action === "reject"
          ? "screened-solicitation"
          : decision.action === "voicemail"
          ? "screening-no-input"
          : "screened-awaiting-owner",
        notes: note,
      }).eq("call_sid", callSid);
    }

    if (persistResult) {
      await sendPostHogEvent("assistant_screening_result", {
        from_number: fromNumber,
        action: decision.action,
        reason: decision.reason,
        speech_confidence: data.Confidence || null,
      });
    }

    if (decision.action === "reject") {
      return xml(`<Response>
  <Say voice="${CALLER_VOICE}">We don't accept sales or solicitation calls by phone. Goodbye.</Say>
  <Hangup/>
</Response>`);
    }
    if (decision.action === "voicemail" || !/^CA[0-9a-f]{32}$/i.test(callSid)) {
      return xml(`<Response>
  <Say voice="${CALLER_VOICE}">I didn't hear enough information to connect your call. Please leave your name, callback number, and message after the beep.</Say>
  ${RECORD}
</Response>`);
    }

    return xml(dialLandonTwiml(callerId, callSid));
  }

  // === PRIVATE OWNER WHISPER ===
  // Twilio runs this only on Landon's called leg. The caller continues hearing
  // ringing until Landon accepts, so the screening summary stays private.
  if (path === "whisper") {
    const screenCallSid = url.searchParams.get("screenCallSid") || "";
    let transcript = "a caller provided a response";
    let callerIdentity = "";
    let approvedSummary = "";
    if (/^CA[0-9a-f]{32}$/i.test(screenCallSid)) {
      try {
        const trace = await readScreening(receptionistConfig(), screenCallSid);
        if (trace?.stage === "done") {
          approvedSummary = `${
            trace.state.name || "Name not provided"
          }. Calling about: ${
            trace.state.purpose.slice(0, 200) || "reason unclear"
          }`;
        }
      } catch {
        /* Legacy/private fallback remains available during a store outage. */
      }
      const { data: callLog } = await supabase.from("call_logs")
        .select("notes,caller_name")
        .eq("call_sid", screenCallSid)
        .maybeSingle();
      const stored = transcriptFromScreeningNote(callLog?.notes);
      callerIdentity = callerIdIntroduction(callLog?.caller_name);
      if (stored) {
        transcript = normalizeScreeningTranscript(stored).slice(0, 280);
      }
    }
    const decisionUrl = durableTwilioCallbackUrl(
      `whisper-decision?screenCallSid=${screenCallSid}`,
    );
    return xml(`<Response>
  <Gather input="dtmf" numDigits="1" timeout="10" actionOnEmptyResult="true"
          method="POST" action="${decisionUrl}">
    <Say voice="${OWNER_WHISPER_VOICE}">Frame call. ${
      xmlEscape(
        approvedSummary || `${callerIdentity}The caller said: ${transcript}`,
      )
    }. Press one to connect, or two to send to voicemail.</Say>
  </Gather>
</Response>`);
  }

  // === OWNER ACCEPT / REJECT ===
  if (path === "whisper-decision") {
    const screenCallSid = url.searchParams.get("screenCallSid") || "";
    const digits = (data.Digits || "").trim();
    const requestedAcceptance = digits === "1";
    const requestedDecision = requestedAcceptance
      ? "accepted"
      : (digits === "2" ? "voicemail" : "timeout");
    const validScreenCallSid = /^CA[0-9a-f]{32}$/i.test(screenCallSid);
    let accepted = false;
    if (validScreenCallSid) {
      const result = await persistOwnerScreenDecision(
        screenCallSid,
        requestedDecision,
        twilioResponseDeadline,
      );
      if (result.decision) {
        accepted = result.decision === "accepted";
      } else if (result.ambiguousTransportFailure) {
        // A transport timeout is ambiguous: the transaction may have committed
        // after the client stopped waiting. Honor the signed digit for this live
        // response, then rerun the same immutable decision in the background.
        accepted = requestedAcceptance;
      }
      if (!result.decision && result.ambiguousTransportFailure) {
        EdgeRuntime.waitUntil(
          finalizeOwnerScreenDecision(screenCallSid, requestedDecision),
        );
      }
    }
    return accepted
      ? xml(
        `<Response><Say voice="${OWNER_WHISPER_VOICE}">Connecting.</Say></Response>`,
      )
      : xml(
        `<Response><Say voice="${OWNER_WHISPER_VOICE}">Sending the caller to voicemail.</Say><Hangup/></Response>`,
      );
  }

  // === CALL COMPLETED ===
  if (path === "completed" || path === "status") {
    // <Number statusCallback> child-leg events carry the child id in CallSid and
    // the original inbound call in ParentCallSid. The call_logs row is keyed by
    // the inbound (parent) CallSid, so prefer ParentCallSid to update that row.
    const callSid = data.ParentCallSid || data.CallSid || "";
    const duration = parseInt(
      data.DialCallDuration || data.CallDuration || data.Duration || "0",
    );
    const callStatus = data.DialCallStatus || data.CallStatus || "unknown";
    const recordingUrl = data.RecordingUrl || null;
    const dial = (data.DialCallStatus || "").toLowerCase();
    const bridged = String(data.DialBridged).toLowerCase() === "true";
    const screenedCompletion = url.searchParams.get("screened") === "1";
    // Run accepted-call recovery before the non-critical completion bookkeeping.
    // A non-2xx response activates the explicit Twilio 5xx retry override.
    if (path === "completed" && callSid && bridged && screenedCompletion) {
      const repair = await persistOwnerScreenDecision(
        callSid,
        "accepted",
        twilioResponseDeadline,
      );
      if (repair.decision !== "accepted") {
        return new Response("Temporary reconciliation failure", {
          status: 503,
        });
      }
    }
    if (
      path === "completed" && callSid &&
      ["true", "false"].includes(String(data.DialBridged).toLowerCase())
    ) {
      await recordScreeningOutcome(
        receptionistConfig(),
        callSid,
        bridged ? "bridged" : "unbridged",
      );
    }
    let screeningStatus = "";

    if (callSid && path === "completed") {
      const { data: callLog } = await supabase.from("call_logs")
        .select("status")
        .eq("call_sid", callSid)
        .maybeSingle();
      screeningStatus = callLog?.status || "";
    }
    const ownerDeclined = !bridged &&
      (screeningStatus === "screened-owner-rejected" ||
        (screeningStatus === "screened-awaiting-owner" &&
          (dial === "completed" || dial === "answered")));
    // Non-bridge terminal outcomes have no lead side effect, but preserve a
    // background retry for private screening metrics.
    if (path === "completed" && callSid && !bridged) {
      EdgeRuntime.waitUntil(
        repairOwnerScreenDecision(
          callSid,
          screeningStatus === "screened-owner-accepted"
            ? "accepted"
            : (ownerDeclined ? "timeout" : null),
        ),
      );
    }

    if (callSid) {
      const updateData: Record<string, unknown> = { status: callStatus };
      if (duration > 0) updateData.duration_seconds = duration;
      if (recordingUrl) updateData.recording_url = recordingUrl;

      let update = supabase.from("call_logs").update(updateData).eq(
        "call_sid",
        callSid,
      );
      // Child-leg status callbacks must not race over the private owner decision.
      if (path === "status") {
        update = update.not(
          "status",
          "in",
          '("screened-awaiting-owner","screened-owner-accepted","screened-owner-rejected")',
        );
      }
      const { error } = ownerDeclined ? { error: null } : await update;
      if (error) console.error("Update error:", error);

      if (duration > 0) {
        await sendPostHogEvent("call_completed", {
          from_number: data.From || "unknown",
          duration_seconds: duration,
          status: callStatus,
          source: "inbound",
        });
      }
    }

    // No-answer voicemail (Dial action callback only). If Landon didn't pick up,
    // offer voicemail instead of returning silence. The per-leg /status callbacks
    // also land here — guard on path === "completed" so they don't emit voicemail.
    if (path === "completed") {
      if (bridged) {
        const { data: linked } = await supabase.from("call_logs").select(
          "lead_id",
        ).eq("call_sid", callSid).maybeSingle();
        if (linked?.lead_id) {
          await supabase.from("leads").update({ status: "contacted" }).eq(
            "id",
            linked.lead_id,
          ).eq("status", "new");
        }
        return xml(`<Response></Response>`);
      }
      if (ownerDeclined) {
        return xml(voicemailTwiml());
      }
      if (dial && dial !== "completed" && dial !== "answered") {
        // Return voicemail immediately; the runtime keeps the alert task alive.
        // The fail-closed claim prevents a Twilio retry from double-texting.
        const caller = normalizeAlertPhone(data.From || "");
        const alertEventKey = callSid ? `missedalert:${callSid}` : "";
        EdgeRuntime.waitUntil((async () => {
          const decision = shouldAlertMissedCall(
            dial,
            caller,
            await loadSuppressedCallers(),
            internalAlertLines(),
          );
          if (!decision.alert || !alertEventKey) {
            console.log(
              `[handle-call] no missed-call alert: ${
                decision.alert ? "missing_call_sid" : decision.reason
              }`,
            );
            return;
          }
          if (!(await claimWebhook(alertEventKey, false))) {
            console.log("[handle-call] no missed-call alert: claim_failed");
            return;
          }
          const localTime = new Date().toLocaleTimeString("en-US", {
            timeZone: "America/Denver",
            hour: "numeric",
            minute: "2-digit",
          });
          const messageSid = await sendOwnerSMS(missedCallAlertText({
            fromNumber: caller,
            city: data.FromCity
              ? `${data.FromCity}${data.FromState ? ", " + data.FromState : ""}`
              : null,
            callCount: await callCountFor(caller),
            localTime,
          }));
          if (messageSid) {
            const { error: receiptError } = await supabase.from("call_logs")
              .update({
                missed_alert_sent_at: new Date().toISOString(),
                missed_alert_message_sid: messageSid,
              })
              .eq("call_sid", callSid);
            if (receiptError) {
              console.error(
                "[handle-call] missed-call receipt update failed:",
                receiptError.message,
              );
            }
          }
          console.log(
            `[handle-call] missed-call alert ${
              messageSid ? "accepted" : "FAILED"
            } for ${caller}`,
          );
        })());
        return xml(voicemailTwiml());
      }
      return xml(voicemailTwiml());
    }
    return xml(`<Response></Response>`);
  }

  // === VOICEMAIL recording finished ===
  // Dedicated no-op target for every <Record action> so a finished recording never
  // loops back into /handle-call or /connect. Saves the recording, ends cleanly.
  if (path === "voicemail") {
    const callSid = (data.CallSid || data.ParentCallSid || "").trim();
    const recordingUrl = data.RecordingUrl || null;
    if (callSid && recordingUrl) {
      await recordScreeningOutcome(
        receptionistConfig(),
        callSid,
        "voicemail_received",
      );
      const { error } = await supabase.from("call_logs")
        .update({ recording_url: recordingUrl, status: "voicemail" }).eq(
          "call_sid",
          callSid,
        );
      if (error) console.error("[handle-call] voicemail update error:", error);
    }
    return xml(`<Response></Response>`);
  }

  return new Response("OK", { status: 200 });
}
Deno.serve(handleCallRequest);
