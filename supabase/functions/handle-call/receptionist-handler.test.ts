// Signed request-boundary contracts for handle-call. Supabase REST is mocked;
// no Twilio, Supabase, SMS, or phone-network request leaves this process.

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { crmEvidence } from "../_shared/receptionist.ts";

const DIAL_RESULT_PATH = "completed";

Deno.test("new signed purpose-first path connects once without repeating a volunteered name", async () => {
  fakeDb = new FakeSupabaseRest();
  const first = await handleCallRequest(
    await signedRequest("handle-call", receptionParams()),
  );
  assertStringIncludes(await first.text(), "How can we help you today?");
  const params = receptionParams({
    SpeechResult: "My name is Jamie and I need a roof inspection",
  });
  const response = await handleCallRequest(
    await signedRequest("receptionist?step=purpose", params),
  );
  const body = await response.text();
  assertStringIncludes(body, "Thanks, Jamie");
  assertStringIncludes(body, "<Dial");
  assertEquals(body.includes("Who am I"), false);
  assertEquals(fakeDb.screenings.get(CALL_SID)?.state.turns.length, 3);
  assertStringIncludes(
    String(fakeDb.callLogs.get(CALL_SID)?.notes),
    "caller-reported",
  );
  await handleCallRequest(
    await signedRequest("receptionist?step=purpose", params),
  );
  assertEquals(fakeDb.screenings.get(CALL_SID)?.state.turns.length, 3);
});
Deno.test("new signed flow takes one optional name, and owner two does not create a block or lead", async () => {
  fakeDb = new FakeSupabaseRest();
  await handleCallRequest(
    await signedRequest("handle-call", receptionParams()),
  );
  const purpose = await handleCallRequest(
    await signedRequest(
      "receptionist?step=purpose",
      receptionParams({ SpeechResult: "Roof inspection" }),
    ),
  );
  assertStringIncludes(await purpose.text(), "Who am I speaking with?");
  await handleCallRequest(
    await signedRequest(
      "receptionist?step=name",
      receptionParams({ SpeechResult: "Jamie" }),
    ),
  );
  const whisper = await handleCallRequest(
    await signedRequest(`whisper?screenCallSid=${CALL_SID}`, receptionParams()),
  );
  assertStringIncludes(
    await whisper.text(),
    "Press one to connect, or two to send to voicemail",
  );
  const decision = await handleCallRequest(
    await signedRequest(
      `whisper-decision?screenCallSid=${CALL_SID}`,
      receptionParams({ Digits: "2" }),
    ),
  );
  assertStringIncludes(await decision.text(), "<Hangup/>");
  assertEquals(fakeDb.screenings.get(CALL_SID)?.owner_decision, "voicemail");
  assertEquals(fakeDb.leadRows.length, 0);
  const retry = await handleCallRequest(
    await signedRequest(
      "receptionist?step=name",
      receptionParams({ SpeechResult: "Jamie" }),
    ),
  );
  assertEquals((await retry.text()).includes("<Dial"), false);
  // Fake provider rejects every blocked_callers write; this test would throw.
});
Deno.test("new CRM lead uses caller-reported context without equating acceptance with a bridge", async () => {
  fakeDb = new FakeSupabaseRest();
  await handleCallRequest(
    await signedRequest("handle-call", receptionParams()),
  );
  await handleCallRequest(
    await signedRequest(
      "receptionist?step=purpose",
      receptionParams({
        SpeechResult: "My name is Jamie and I need a roof inspection",
      }),
    ),
  );
  const decision = await handleCallRequest(
    await signedRequest(
      `whisper-decision?screenCallSid=${CALL_SID}`,
      receptionParams({ Digits: "1" }),
    ),
  );
  assertStringIncludes(await decision.text(), "Connecting.");
  assertEquals(fakeDb.screenings.get(CALL_SID)?.owner_decision, "accepted");
  assertEquals(fakeDb.screenings.get(CALL_SID)?.bridged, null);
  assertEquals(fakeDb.leadRows.length, 1);
  assertEquals(fakeDb.leadRows[0].name, "Jamie");
  assertEquals(fakeDb.leadRows[0].status, "new");
  assertStringIncludes(String(fakeDb.leadRows[0].notes), "caller-reported");
  await handleCallRequest(
    await signedRequest(
      `whisper-decision?screenCallSid=${CALL_SID}`,
      receptionParams({ Digits: "1" }),
    ),
  );
  assertEquals(fakeDb.leadRows.length, 1);
});
Deno.test("new callback rejects invalid signature, wrong account and other market without storing caller text", async () => {
  fakeDb = new FakeSupabaseRest();
  const unsigned = new Request(FUNCTION_BASE + "/receptionist?step=purpose", {
    method: "POST",
    body: new URLSearchParams(receptionParams()),
  });
  assertEquals((await handleCallRequest(unsigned)).status, 403);
  for (
    const params of [
      receptionParams({ AccountSid: "AC" + "9".repeat(32) }),
      receptionParams({ To: "+12085977712" }),
    ]
  ) {
    assertEquals(
      (await handleCallRequest(
        await signedRequest("receptionist?step=purpose", params),
      )).status,
      403,
    );
  }
  assertEquals(fakeDb.screenings.size, 0);
});
Deno.test("new screening blocks an explicit roofing-leads pitch, but silence reaches voicemail after one repair", async () => {
  fakeDb = new FakeSupabaseRest();
  await handleCallRequest(
    await signedRequest("handle-call", receptionParams()),
  );
  const pitch = await handleCallRequest(
    await signedRequest(
      "receptionist?step=purpose",
      receptionParams({ SpeechResult: "I sell roofing leads" }),
    ),
  );
  assertStringIncludes(await pitch.text(), "<Hangup/>");
  assertEquals(
    fakeDb.screenings.get(CALL_SID)?.state.reason,
    "clear_solicitation",
  );
  assertEquals(fakeDb.leadRows.length, 0);
  fakeDb = new FakeSupabaseRest();
  await handleCallRequest(
    await signedRequest("handle-call", receptionParams()),
  );
  const repair = await handleCallRequest(
    await signedRequest("receptionist?step=purpose", receptionParams()),
  );
  assertStringIncludes(await repair.text(), "press one to leave a message");
  const voicemail = await handleCallRequest(
    await signedRequest("receptionist?step=clarify", receptionParams()),
  );
  assertStringIncludes(await voicemail.text(), "<Record");
  assertEquals(
    fakeDb.screenings.get(CALL_SID)?.state.reason,
    "no_input_after_repair",
  );
});
Deno.test("bridge outcome records only explicit provider proof, not missing data", async () => {
  fakeDb = new FakeSupabaseRest();
  await handleCallRequest(
    await signedRequest("handle-call", receptionParams()),
  );
  await handleCallRequest(
    await signedRequest(
      "receptionist?step=purpose",
      receptionParams({ SpeechResult: "Human please" }),
    ),
  );
  fakeDb.callLogs.get(CALL_SID)!.status = "screened-owner-accepted";
  await handleCallRequest(
    await signedRequest(
      DIAL_RESULT_PATH,
      receptionParams({ DialCallStatus: "completed" }),
    ),
  );
  assertEquals(fakeDb.screenings.get(CALL_SID)?.bridged, null);
  const response = await handleCallRequest(
    await signedRequest(
      DIAL_RESULT_PATH,
      receptionParams({ DialCallStatus: "completed", DialBridged: "true" }),
    ),
  );
  assertEquals((await response.text()).includes("<Record"), false);
  assertEquals(fakeDb.screenings.get(CALL_SID)?.bridged, true);
});

function receptionParams(
  extra: Record<string, string> = {},
): Record<string, string> {
  return baseParams({ From: "+12145550123", To: "+14352928802", ...extra });
}

import type { ScreeningRecord } from "../_shared/receptionist-store.ts";

const AUTH_TOKEN = "local-handle-call-test-token";
// Caller-ID integration tests below exercise this handler with fake providers.
const ACCOUNT_SID = `AC${"1".repeat(32)}`;
const CALL_SID = `CA${"2".repeat(32)}`;
const FUNCTION_BASE = "https://supabase.test/functions/v1/handle-call";

Deno.env.set("SUPABASE_URL", "https://supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "local-service-role-test-key");
Deno.env.set("TWILIO_AUTH_TOKEN", AUTH_TOKEN);
Deno.env.set("TWILIO_ACCOUNT_SID", ACCOUNT_SID);
Deno.env.set("TWILIO_PHONE_NUMBER", "+14352928802");
Deno.env.set("OWNER_SMS_RECIPIENT", "+12145550199");

type CallLog = Record<string, unknown> & { call_sid: string; status: string };

class FakeSupabaseRest {
  screenings = new Map<string, ScreeningRecord>();
  callLogs = new Map<string, CallLog>();
  webhookClaims = new Set<string>();
  failNextCallLogPatch = false;
  failNextCallLogPost = false;
  failNextCallLogGet = false;
  failWebhookGets = false;
  staleNextCallLogStatus: string | null = null;
  callLogPatchCount = 0;
  failCallLogPatchAt: number | null = null;
  twilioCallIdentity = {
    sid: CALL_SID,
    account_sid: ACCOUNT_SID,
    from: "+12145550123",
    to: "+14352928802",
  };
  failNextTwilioCallGet = false;
  lookupCount = 0;
  leadRows: Record<string, unknown>[] = [];

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(input, init);
    const url = new URL(request.url);
    const table = url.pathname.split("/").pop();

    if (
      url.origin === "https://us.i.posthog.com" ||
      url.hostname.includes("posthog.com")
    ) return new Response(null, { status: 204 });
    if (table === "app_config") {
      return jsonResponse([
        { key: "TWILIO_ACCOUNT_SID", value: ACCOUNT_SID },
        { key: "TWILIO_AUTH_TOKEN", value: AUTH_TOKEN },
        { key: "TWILIO_PHONE_NUMBER", value: "+14352928802" },
      ]);
    }
    if (url.origin === "https://lookups.twilio.com") {
      this.lookupCount++;
      return jsonResponse({
        phone_number: decodeURIComponent(table || ""),
        valid: true,
        caller_name: { caller_name: "JANE DOE", error_code: null },
      });
    }

    if (url.origin === "https://api.twilio.com") {
      if (request.method !== "GET") {
        throw new Error(
          `Unexpected Twilio mutation in test: ${request.method}`,
        );
      }
      const expectedAuth = "Basic " + btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`);
      if (request.headers.get("Authorization") !== expectedAuth) {
        return jsonResponse({ message: "unauthorized" }, 401);
      }
      if (this.failNextTwilioCallGet) {
        this.failNextTwilioCallGet = false;
        return jsonResponse({ message: "synthetic Twilio outage" }, 503);
      }
      return jsonResponse(this.twilioCallIdentity);
    }

    if (table === "processed_webhooks") {
      if (request.method === "POST") {
        const body = JSON.parse(await request.text());
        if (this.webhookClaims.has(body.event_key)) {
          return jsonResponse({ code: "23505", message: "duplicate" }, 409);
        }
        this.webhookClaims.add(body.event_key);
        return jsonResponse(null, 201);
      }
      if (request.method === "GET") {
        if (this.failWebhookGets) {
          return jsonResponse(
            { code: "XX000", message: "synthetic database failure" },
            503,
          );
        }
        const eventKey = eqValue(url.searchParams.get("event_key"));
        return jsonResponse(
          eventKey && this.webhookClaims.has(eventKey)
            ? [{ event_key: eventKey }]
            : [],
        );
      }
    }

    if (table === "call_screenings") {
      const sid = eqValue(url.searchParams.get("call_sid"));
      const row = this.screenings.get(sid);
      if (request.method === "GET") {
        return jsonResponse(
          row ? [{ ...row, call_logs: this.callLogs.get(sid) }] : [],
        );
      }
      if (request.method === "POST") {
        const body = JSON.parse(await request.text());
        if (!this.callLogs.has(body.call_sid)) {
          return jsonResponse({ code: "23503" }, 409);
        }
        if (!this.screenings.has(body.call_sid)) {
          this.screenings.set(body.call_sid, {
            ...body,
            owner_decision: null,
            bridged: null,
          });
        }
        return new Response(null, { status: 201 });
      }
      if (request.method === "PATCH") {
        const matches = row &&
          (!url.searchParams.has("stage") ||
            url.searchParams.get("stage") === "eq." + row.stage) &&
          (!url.searchParams.has("owner_decision") ||
            row.owner_decision === null) &&
          (!url.searchParams.has("bridged") || row.bridged === null);
        if (matches) {
          const patch = JSON.parse(await request.text());
          Object.assign(row, patch);
          const log = this.callLogs.get(sid);
          if (
            patch.state && log &&
            [
              "screening",
              "screening-purpose",
              "screening-insufficient",
              "screening-no-input",
            ].includes(log.status)
          ) {
            log.status = row.state.action === "connect"
              ? "screened-awaiting-owner"
              : row.state.action === "reject"
              ? "screened-solicitation"
              : row.state.action === "voicemail"
              ? "screening-insufficient"
              : "screening";
            log.notes = crmEvidence(row.state);
          }
        }
        return new Response(null, { status: 204 });
      }
    }

    if (table === "call_logs") {
      const callSid = eqValue(url.searchParams.get("call_sid"));
      const row = callSid ? this.callLogs.get(callSid) : undefined;
      if (request.method === "GET") {
        if (this.failNextCallLogGet) {
          this.failNextCallLogGet = false;
          return jsonResponse(
            { code: "XX000", message: "synthetic database failure" },
            503,
          );
        }
        if (row && this.staleNextCallLogStatus !== null) {
          const staleRow = { ...row, status: this.staleNextCallLogStatus };
          this.staleNextCallLogStatus = null;
          return jsonResponse([staleRow]);
        }
        return jsonResponse(row ? [row] : []);
      }
      if (request.method === "PATCH") {
        this.callLogPatchCount += 1;
        if (
          this.failNextCallLogPatch ||
          this.callLogPatchCount === this.failCallLogPatchAt
        ) {
          this.failNextCallLogPatch = false;
          return jsonResponse(
            { code: "XX000", message: "synthetic database failure" },
            503,
          );
        }
        const identityFilter = url.searchParams.get(
          "caller_name_lookup_status",
        );
        const identityMatches = !identityFilter ||
          (identityFilter === "is.null" &&
            row?.caller_name_lookup_status == null) ||
          identityFilter === `eq.${row?.caller_name_lookup_status}`;
        const matches = row && identityMatches &&
          statusFiltersMatch(row.status, url.searchParams);
        if (matches) Object.assign(row, JSON.parse(await request.text()));
        const wantsRows = request.headers.get("Prefer")?.includes(
          "return=representation",
        );
        return wantsRows
          ? jsonResponse(matches ? [row] : [])
          : new Response(null, { status: 204 });
      }
      if (request.method === "POST") {
        if (this.failNextCallLogPost) {
          this.failNextCallLogPost = false;
          return jsonResponse(
            { code: "XX000", message: "synthetic database failure" },
            503,
          );
        }
        const body = JSON.parse(await request.text()) as CallLog;
        if (!this.callLogs.has(body.call_sid)) {
          this.callLogs.set(body.call_sid, body);
        } else if (
          !request.headers.get("Prefer")?.includes(
            "resolution=ignore-duplicates",
          )
        ) {
          Object.assign(this.callLogs.get(body.call_sid)!, body);
        }
        return jsonResponse(null, 201);
      }
    }

    if (table === "leads" && request.method === "POST") {
      const body = {
        ...JSON.parse(await request.text()),
        id: this.leadRows.length + 100,
      };
      this.leadRows.push(body);
      return jsonResponse(body, 201);
    }
    if (table === "leads" && request.method === "PATCH") {
      const body = JSON.parse(await request.text());
      for (const row of this.leadRows) {
        if (
          String(row.id) === eqValue(url.searchParams.get("id")) &&
          statusFiltersMatch(String(row.status), url.searchParams)
        ) Object.assign(row, body);
      }
      return new Response(null, { status: 204 });
    }

    if (
      request.method === "GET" &&
      (table === "blocked_callers" || table === "leads")
    ) {
      return jsonResponse(table === "leads" ? this.leadRows : []);
    }

    throw new Error(
      `Unexpected fake Supabase request: ${request.method} ${url}`,
    );
  }
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(value === null ? null : JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function eqValue(filter: string | null): string {
  return filter?.startsWith("eq.") ? filter.slice(3) : "";
}

function statusFiltersMatch(
  current: string,
  params: URLSearchParams,
): boolean {
  return params.getAll("status").every((filter) => {
    if (filter.startsWith("eq.")) return current === filter.slice(3);
    if (filter.startsWith("in.(") && filter.endsWith(")")) {
      return filter.slice(4, -1).split(",").includes(current);
    }
    return true;
  });
}

let fakeDb = new FakeSupabaseRest();
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
  fakeDb.fetch(input, init);

const originalServe = Deno.serve;
let registeredHandler: unknown;
Deno.serve = ((handler: unknown) => {
  registeredHandler = handler;
  return {} as Deno.HttpServer;
}) as typeof Deno.serve;
const { handleCallRequest } = await import("./index.ts");
Deno.serve = originalServe;
assertEquals(registeredHandler, handleCallRequest);

async function signedRequest(
  path: string,
  params: Record<string, string>,
): Promise<Request> {
  const url = `${FUNCTION_BASE}/${path}`;
  let signed = url;
  for (const key of Object.keys(params).sort()) signed += key + params[key];
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(AUTH_TOKEN),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed)),
  );
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": btoa(binary),
    },
    body: new URLSearchParams(params),
  });
}

function baseParams(
  extra: Record<string, string> = {},
): Record<string, string> {
  return { AccountSid: ACCOUNT_SID, CallSid: CALL_SID, ...extra };
}
