// Signed synthetic requests through the real handler; every network request
// is replaced by an in-memory provider. No calls, SMS, or live CRM writes.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const accountSid = "AC" + "1".repeat(32);
const token = "local-caller-id-test-token";
const callSid = "CA" + "2".repeat(32);
const customer = "+12025550123";
const business = "+14352928802";
const base = "https://supabase.test/functions/v1/handle-call";
Deno.env.set("SUPABASE_URL", "https://supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "local-test-service-key");
Deno.env.set("TWILIO_ACCOUNT_SID", accountSid);
Deno.env.set("TWILIO_AUTH_TOKEN", token);
Deno.env.set("TWILIO_PHONE_NUMBER", business);
Deno.env.set("LANDON_PHONE", "+14355550199");

let row: Record<string, unknown> | null = null;
let trusted = false;
let lookupCount = 0;
function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
}
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  const table = url.pathname.split("/").pop();
  if (url.hostname === "us.i.posthog.com") return response({ status: 1 });
  if (url.hostname === "lookups.twilio.com") {
    lookupCount++;
    return response({
      phone_number: customer,
      valid: true,
      caller_name: { caller_name: "JANE DOE", error_code: null },
    });
  }
  if (url.hostname !== "supabase.test") {
    throw new Error("Unmocked network destination");
  }
  if (table === "app_config") {
    return response([
      { key: "TWILIO_ACCOUNT_SID", value: accountSid },
      { key: "TWILIO_AUTH_TOKEN", value: token },
      { key: "TWILIO_PHONE_NUMBER", value: business },
    ]);
  }
  if (table === "blocked_callers") return response([]);
  if (table === "processed_webhooks") return response([]);
  if (table === "leads") {
    return response(
      trusted
        ? [{
          id: 99,
          phone: customer,
          status: "estimated",
          source_page: "inbound-call",
        }]
        : [],
    );
  }
  if (table === "call_logs") {
    if (req.method === "GET") return response(row ? [row] : []);
    const body = await req.json();
    if (req.method === "POST") {
      if (!row) row = body;
      return response([]);
    }
    const filter = url.searchParams.get("caller_name_lookup_status");
    const matches = row && (!filter ||
      (filter === "is.null" && row.caller_name_lookup_status == null) ||
      filter === `eq.${row.caller_name_lookup_status}`);
    if (matches) Object.assign(row!, body);
    return response(matches ? [row] : []);
  }
  throw new Error("Unexpected mocked table: " + table);
};

const originalServe = Deno.serve;
let handle: (req: Request) => Promise<Response>;
Deno.serve = ((callback: typeof handle) => {
  handle = callback;
  return {} as Deno.HttpServer;
}) as typeof Deno.serve;
await import("./index.ts");
Deno.serve = originalServe;

async function call(
  event: string,
  fields: Record<string, string> = {},
): Promise<string> {
  const url = `${base}${event ? "/" + event : ""}`;
  const params = {
    AccountSid: accountSid,
    CallSid: callSid,
    From: customer,
    To: business,
    ...fields,
  };
  const payload = Object.keys(params).sort().reduce(
    (text, key) => text + key + params[key as keyof typeof params],
    url,
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  const res = await handle(
    new Request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": btoa(String.fromCharCode(...bytes)),
      },
      body: new URLSearchParams(params),
    }),
  );
  assertEquals(res.status, 200);
  return await res.text();
}

Deno.test("Utah trusted inbound caller retains the original phone number", async () => {
  row = null;
  trusted = true;
  lookupCount = 0;
  const body = await call("");
  assertStringIncludes(body, `callerId="${customer}"`);
  assertEquals(
    (row as Record<string, unknown> | null)?.caller_name,
    "JANE DOE",
  );
  assertEquals(lookupCount, 1);
});

Deno.test("Utah screened caller ID survives the interview and withheld numbers fall back", async () => {
  for (const from of [customer, "anonymous"]) {
    row = null;
    trusted = false;
    lookupCount = 0;
    assertStringIncludes(await call("", { From: from }), "<Gather");
    const body = await call("screen", {
      From: from,
      SpeechResult:
        "Jane Homeowner, call me back at 202-555-0123, my roof is leaking",
    });
    assertStringIncludes(
      body,
      `callerId="${from === customer ? customer : business}"`,
    );
    assertEquals(lookupCount, from === customer ? 1 : 0);
  }
});
