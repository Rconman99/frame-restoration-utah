// handle-call v3 — Frame Restoration Utah
// ─────────────────────────────────────────────────────────────────────────────
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LANDON_PHONE = "+14353024422";
const POSTHOG_API_KEY = "phc_BnECzlZ2OeDujli2dbqcgGODXlv2tYERbp40dTF7UBV";

// ── Call-source attribution (commission tracking) ────────────────────────────
// Each public tracking number maps to a lead source + whether that lead counts
// toward Ryan's commission. Google (GBP) + the website both publish the canonical
// NAP below → commission. EVERY OTHER tracking number is a directory line
// (HomeAdvisor / Yelp / Angi / etc.) → NOT commission. Provision a directory
// number in Twilio, point its voice webhook at this same function, then add a row
// here. Unknown dialed numbers default to NON-commission so the ledger never
// over-counts (a misroute or not-yet-mapped number is treated as not-Ryan's).
const NUMBER_SOURCES: Record<string, { source: string; commission: boolean }> = {
  "+14352928802": { source: "google_website", commission: true }, // GBP + website NAP
  "+14356108978": { source: "slc_backlink", commission: true }, // Contractor ReIndependence SLC tracking DID
  "+18014620526": { source: "slc_gbp", commission: true }, // SLC office GBP tracking DID (SLC rate center; replaced released Springville-locality 801 on 2026-08-10)
  // "+1XXXXXXXXXX": { source: "directory", commission: false },   // ← directory tracking line (add once provisioned)
};
function classifyDialedNumber(toNumber: string): { source: string; commission: boolean } {
  return NUMBER_SOURCES[normalizePhone(toNumber)] ?? { source: "unknown", commission: false };
}
// True if `toNumber` is any phone number we own (configured business line OR a
// mapped tracking number). Gates the inbound webhook so a second tracking number
// isn't rejected by the single-number `creds.phone` check.
function isOurBusinessNumber(toNumber: string, configuredPhone?: string): boolean {
  const norm = normalizePhone(toNumber);
  if (configuredPhone && norm === normalizePhone(configuredPhone)) return true;
  return norm in NUMBER_SOURCES;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

// Local-trust rule: Utah-area-code callers (801 / 385 / 435 cover the whole
// state) ring straight through — that's virtually all real customers. Every
// out-of-state / unknown-caller-ID number gets the press-1 screen (spam skews
// out-of-state). Add area codes here if Frame ever serves another state.
const UTAH_AREA_CODES = new Set(["801", "385", "435"]);
function isUtahNumber(phone: string): boolean {
  const digits = (phone || "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return false; // unknown / malformed / short-code → screen
  return UTAH_AREA_CODES.has(ten.slice(0, 3));
}

function xml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: { "Content-Type": "text/xml" },
  });
}

// Connect the caller to Landon (the existing dial+record+voicemail-fallback block).
function dialLandonTwiml(callerId: string): string {
  const statusCallbackUrl = `${SUPABASE_URL}/functions/v1/handle-call/status`;
  return `<Response>
  <Dial callerId="${callerId}" timeout="30"
        action="${SUPABASE_URL}/functions/v1/handle-call/completed"
        record="record-from-answer-dual">
    <Number statusCallbackEvent="initiated ringing answered completed"
            statusCallback="${statusCallbackUrl}">
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
const RECORD = `<Record maxLength="120" transcribe="true" action="${SUPABASE_URL}/functions/v1/handle-call/voicemail" />`;

// Human-gate: bots can't press a key. No input falls through to voicemail.
function screenTwiml(): string {
  return `<Response>
  <Gather numDigits="1" timeout="8" method="POST"
          action="${SUPABASE_URL}/functions/v1/handle-call/connect">
    <Say>Thank you for calling Frame Restoration Utah. To reach our team, press 1.</Say>
  </Gather>
  <Say>We didn't get a response. Please leave a message after the beep and we'll call you back.</Say>
  ${RECORD}
</Response>`;
}

function voicemailTwiml(): string {
  return `<Response>
  <Say>Please leave a message after the beep and we'll call you back.</Say>
  ${RECORD}
</Response>`;
}

function blockedTwiml(): string {
  return `<Response>
  <Say>This number does not accept solicitation calls. Goodbye.</Say>
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
    .select("id")
    .or(`phone.eq.+1${ten},phone.eq.${ten},phone.ilike.%${ten}`)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  return data && data.length ? data[0].id : null;
}

async function createInboundCallLead(
  fromNumber: string,
  city: string,
  classifier = "auto-inbound-call",
  attribution: { source: string; commission: boolean } = { source: "unknown", commission: false },
): Promise<number | null> {
  if (!fromNumber || fromNumber === "unknown") return null;
  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: `Inbound caller — ${lastFour(fromNumber)}`,
      phone: normalizePhone(fromNumber),
      address: city || null,
      city: city ? city.split(",")[0].trim() : null,
      source_page: "inbound-call",
      call_source: attribution.source,
      commission_eligible: attribution.commission,
      status: "new",
      tier: "general",
      tier_classifier: classifier,
      tier_reason: "Auto-created by handle-call on first call from this number",
      notes: "Auto-created from inbound call. Update name/details when you have them.",
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
async function getTwilioCreds() {
  const { data } = await supabase.from("app_config").select("key, value").in("key", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"]);
  const config: Record<string, string> = {};
  data?.forEach((r: any) => { config[r.key] = r.value; });
  return { sid: config.TWILIO_ACCOUNT_SID, auth: config.TWILIO_AUTH_TOKEN, phone: config.TWILIO_PHONE_NUMBER };
}

// Process-once claim for Twilio retries (CODEX). Inserts the event key into
// processed_webhooks; the PK makes it atomic. Returns false if already claimed
// (a retry) so the caller can skip the one-time side effects. fail-open default —
// a DB blip shouldn't drop call handling. (call_logs has no unique call_sid, so
// this claim, not an upsert, is what makes the insert retry-safe.)
async function claimWebhook(eventKey: string): Promise<boolean> {
  if (!eventKey) return true;
  const { error } = await supabase.from("processed_webhooks").insert({ event_key: eventKey });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false; // already processed
  console.error("[handle-call] claimWebhook error:", error);
  return true;
}

async function sendPostHogEvent(event: string, properties: Record<string, unknown>) {
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

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  // Normalize trailing slashes so `/handle-call/status/` routes the same as
  // `/handle-call/status` (otherwise `.pop()` yields "" and misroutes to inbound).
  const path = url.pathname.replace(/\/+$/, "").split("/").pop();

  const formData = await req.formData();
  const data: Record<string, string> = {};
  formData.forEach((value, key) => { data[key] = value.toString(); });

  console.log(`[handle-call] path=${path}`, JSON.stringify(data));

  // ─── SECURITY GATE: verify Twilio signature BEFORE any DB write / TwiML.
  // Covers all paths (inbound + /status + /completed). The body has already been
  // consumed into `data`, which we pass as the signed POST params.
  const creds = await getTwilioCreds();
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

    // v3 routing: decide how this call is handled. Both checks FAIL OPEN — a DB
    // error degrades to the ring path, never to dropping a real call.
    const stirVerstat = data.StirVerstat || "";
    const blocked = await isBlockedCaller(fromNumber);
    const route = blocked ? "blocked" : (isUtahNumber(fromNumber) ? "ring" : "screen");
    // Which tracking number was dialed → lead source + commission eligibility.
    const attribution = classifyDialedNumber(toNumber);

    // Idempotency: run side effects (lead lookup/create + call_logs + analytics)
    // ONCE per call, deduped via the processed_webhooks claim. We ALWAYS return the
    // routed TwiML below, so a retry is still handled: the claim guards side effects,
    // not call handling. For the "screen" route, lead creation is DEFERRED to
    // /connect (only humans who press 1 become leads → spam stays out of /leads).
    if (await claimWebhook(`call:${callSid}`)) {
      let leadId: number | null = null;
      let logStatus = "ringing";
      if (route === "blocked") {
        logStatus = "blocked-spam";
      } else if (route === "ring") {
        if (fromNumber && fromNumber !== "unknown") {
          leadId = await findRecentLead(fromNumber);
          if (!leadId) leadId = await createInboundCallLead(fromNumber, cityLabel, "auto-inbound-call", attribution);
        }
      } else {
        logStatus = "screening"; // lead deferred to /connect
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

      await sendPostHogEvent(
        route === "blocked" ? "blocked_spam_call" : route === "screen" ? "screening_call" : "inbound_call",
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
    if (route === "screen") return xml(screenTwiml());
    return xml(dialLandonTwiml(toNumber));
  }

  // === SCREEN RESULT ("press 1 to connect") ===
  // Gather action callback. A human who pressed 1 gets connected to Landon and
  // becomes a lead NOW (deferred from the inbound hit so robo-dialers — which
  // never press a key — never create a lead). Anything else → voicemail.
  if (path === "connect") {
    const digits = (data.Digits || "").trim();
    const callSid = (data.CallSid || "").trim();
    const fromNumber = data.From || "unknown";
    const callerId = data.To || creds.phone || "";
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
            const cityLabel = data.FromCity ? `${data.FromCity}, ${data.FromState || ""}` : "unknown";
            leadId = await createInboundCallLead(fromNumber, cityLabel, "auto-inbound-call-screened", attribution);
          }
        }
        await supabase.from("call_logs").update({ status: "ringing", lead_id: leadId }).eq("call_sid", callSid);
        await sendPostHogEvent("inbound_call", {
          from_number: fromNumber, route: "screen-passed",
          source: attribution.source, commission: attribution.commission, lead_id: leadId,
        });
      }
      return xml(dialLandonTwiml(callerId));
    }
    // No valid keypress (robo-dialers, abandons) → voicemail, no lead.
    return xml(voicemailTwiml());
  }

  // === CALL COMPLETED ===
  if (path === "completed" || path === "status") {
    // <Number statusCallback> child-leg events carry the child id in CallSid and
    // the original inbound call in ParentCallSid. The call_logs row is keyed by
    // the inbound (parent) CallSid, so prefer ParentCallSid to update that row.
    const callSid = data.ParentCallSid || data.CallSid || "";
    const duration = parseInt(data.DialCallDuration || data.CallDuration || data.Duration || "0");
    const callStatus = data.DialCallStatus || data.CallStatus || "unknown";
    const recordingUrl = data.RecordingUrl || null;

    if (callSid) {
      const updateData: Record<string, unknown> = { status: callStatus };
      if (duration > 0) updateData.duration_seconds = duration;
      if (recordingUrl) updateData.recording_url = recordingUrl;

      const { error } = await supabase.from("call_logs").update(updateData).eq("call_sid", callSid);
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
      const dial = (data.DialCallStatus || "").toLowerCase();
      if (dial && dial !== "completed" && dial !== "answered") {
        return xml(`<Response>
  <Say>Sorry, no one is available right now. Please leave a message after the beep.</Say>
  ${RECORD}
</Response>`);
      }
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
      const { error } = await supabase.from("call_logs")
        .update({ recording_url: recordingUrl, status: "voicemail" }).eq("call_sid", callSid);
      if (error) console.error("[handle-call] voicemail update error:", error);
    }
    return xml(`<Response></Response>`);
  }

  return new Response("OK", { status: 200 });
});
