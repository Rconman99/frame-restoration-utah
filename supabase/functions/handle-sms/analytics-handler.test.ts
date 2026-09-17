// Real signed handler, fully mocked network. Never sends a message or writes CRM.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { OPERATOR_PHONE } from "../_shared/classify-inbound.ts";
import { verifyMediaProxyToken } from "../_shared/inbound-media.ts";

const account = "AC" + "1".repeat(32);
const sid = "SM" + "2".repeat(32);
const token = "local-sms-signature-fixture";
const serviceKey = "local-sms-service-fixture";
const business = "+14352928802";
const customer = "+12025550123";
const base = "https://supabase.test/functions/v1/handle-sms";
Deno.env.set("SUPABASE_URL", "https://supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", serviceKey);
Deno.env.set("INTERNAL_RELAY_NUMBERS", "");

let tasks: Promise<unknown>[] = [];
let writes: { table: string; body: Record<string, unknown> }[] = [];
let claims = new Set<string>();
let mode: "stall" | "ok" | "error" | "http" = "stall";
let analyticsCalls = 0;
let signal: AbortSignal | undefined;
let release: (() => void) | undefined;
let existingLead = false;
const runtime = globalThis as unknown as {
  EdgeRuntime: { waitUntil: (task: Promise<unknown>) => void };
};
const installRuntime = () => {
  runtime.EdgeRuntime = {
    waitUntil: (task) => {
      tasks.push(task);
    },
  };
};
installRuntime();
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.hostname === "us.i.posthog.com") {
    analyticsCalls++;
    signal = init?.signal ?? undefined;
    if (mode === "error") throw new Error("synthetic network failure");
    if (mode === "http") return json({}, 503);
    if (mode === "ok") return json({ status: 1 });
    return await new Promise<Response>((resolve, reject) => {
      const onAbort = () =>
        reject(new DOMException("fixture aborted", "AbortError"));
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      release = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve(json({ status: 1 }));
      };
    });
  }
  if (url.hostname !== "supabase.test") {
    throw new Error("Unmocked network forbidden");
  }
  const table = url.pathname.split("/").pop()!;
  if (table === "app_config") {
    return json([
      { key: "TWILIO_ACCOUNT_SID", value: account },
      { key: "TWILIO_AUTH_TOKEN", value: token },
      { key: "TWILIO_PHONE_NUMBER", value: business },
    ]);
  }
  if (req.method === "GET" && table === "leads") {
    return json(existingLead ? [{ id: 99 }] : []);
  }
  if (req.method === "GET" && table === "sms_conversation_map") return json([]);
  if (req.method !== "POST") throw new Error("Unexpected mocked operation");
  const body = await req.json();
  if (table === "processed_webhooks") {
    if (claims.has(body.event_key)) return json({ code: "23505" }, 409);
    claims.add(body.event_key);
  }
  if (
    !["processed_webhooks", "sms_conversation_map", "leads", "sms_logs"]
      .includes(table)
  ) {
    throw new Error("Unexpected mocked table");
  }
  writes.push({ table, body });
  return json(table === "leads" ? { id: 42 } : []);
};

let handler: (request: Request) => Promise<Response>;
const originalServe = Deno.serve;
Deno.serve = ((callback: typeof handler) => {
  handler = callback;
  return {} as Deno.HttpServer;
}) as typeof Deno.serve;
await import("./index.ts");
Deno.serve = originalServe;

async function request(fields: Record<string, string> = {}, signed = true) {
  const params = {
    AccountSid: account,
    MessageSid: sid,
    From: customer,
    To: business,
    Body: "Roof flashing & shingles",
    ...fields,
  };
  const payload = Object.keys(params).sort().reduce(
    (text, key) => text + key + params[key as keyof typeof params],
    base,
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
  return new Request(base, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(signed
        ? { "X-Twilio-Signature": btoa(String.fromCharCode(...bytes)) }
        : {}),
    },
    body: new URLSearchParams(params),
  });
}
function reset() {
  tasks = [];
  writes = [];
  claims = new Set();
  mode = "stall";
  analyticsCalls = 0;
  signal = undefined;
  release = undefined;
  existingLead = false;
  installRuntime();
}
async function fastResponse(req: Request): Promise<Response> {
  const result = handler(req);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      result,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("relay waited for stalled analytics")),
          500,
        );
      }),
    ]);
  } catch (error) {
    release?.();
    await result;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function cleanup() {
  release?.();
  await Promise.all(tasks);
}

Deno.test("SMS returns forwarding TwiML while analytics is unresolved; retry stays deduped", async () => {
  reset();
  try {
    const response = await fastResponse(await request());
    assertEquals(response.status, 200);
    const xml = await response.text();
    assertStringIncludes(xml, `<Message to="${OPERATOR_PHONE}">`);
    assertStringIncludes(xml, "Roof flashing &amp; shingles");
    assertEquals(tasks.length, 1);
    assertEquals(signal?.aborted, false);
    assertEquals(writes.map((x) => x.table), [
      "processed_webhooks",
      "sms_conversation_map",
      "leads",
      "sms_logs",
    ]);
    assertEquals(writes.at(-1)?.body.lead_id, 42);
    const retry = await fastResponse(await request());
    assert(!(await retry.text()).includes("<Message"));
    assertEquals(analyticsCalls, 1);
    assertEquals(writes.length, 4);
  } finally {
    await cleanup();
  }
});

Deno.test("MMS preserves signed attachment, CRM link and XML escaping during analytics stall", async () => {
  reset();
  existingLead = true;
  const media =
    `https://api.twilio.com/2010-04-01/Accounts/${account}/Messages/MM${
      "3".repeat(32)
    }/Media/ME${"4".repeat(32)}`;
  try {
    const response = await fastResponse(
      await request({
        NumMedia: "1",
        MediaUrl0: media,
        MediaContentType0: "image/jpeg",
      }),
    );
    const xml = await response.text();
    assertStringIncludes(xml, "[1 photo attachment included]");
    assertStringIncludes(xml, "Roof flashing &amp; shingles");
    const proxy = xml.match(/<Media>([^<]+)<\/Media>/)?.[1];
    assert(proxy);
    const decoded = await verifyMediaProxyToken(
      new URL(proxy).searchParams.get("token")!,
      serviceKey,
    );
    assertEquals(decoded, { url: media, contentType: "image/jpeg" });
    assertEquals(writes.filter((x) => x.table === "leads").length, 0);
    assertEquals(writes.at(-1)?.body.lead_id, 99);
    assertStringIncludes(String(writes.at(-1)?.body.notes), proxy);
    assertEquals(tasks.length, 1);
  } finally {
    await cleanup();
  }
});

Deno.test("analytics success, HTTP failure and rejection never change forwarding", async () => {
  for (const value of ["ok", "http", "error"] as const) {
    reset();
    mode = value;
    const response = await fastResponse(await request());
    assertEquals(response.status, 200);
    assertStringIncludes(
      await response.text(),
      `<Message to="${OPERATOR_PHONE}">`,
    );
    await cleanup();
    assertEquals(tasks.length, 1);
  }
});

Deno.test("stalled background analytics aborts at its bounded deadline after SMS returns", async () => {
  reset();
  try {
    const response = await fastResponse(await request());
    await response.text();
    assertEquals(tasks.length, 1);
    assertEquals(signal?.aborted, false);
    await Promise.all(tasks);
    assertEquals(signal?.aborted, true);
  } finally {
    await cleanup();
  }
});

Deno.test("unsigned or wrong account/To requests cannot write or start analytics", async () => {
  for (
    const [fields, signed] of [[{}, false], [{
      AccountSid: "AC" + "9".repeat(32),
    }, true], [{ To: "+12025550199" }, true]] as const
  ) {
    reset();
    const response = await handler(await request(fields, signed));
    assertEquals(response.status, 403);
    await response.text();
    assertEquals(writes.length, 0);
    assertEquals(analyticsCalls, 0);
  }
});

Deno.test("operator and opt-out branches do not queue customer analytics", async () => {
  reset();
  const operator = await handler(
    await request({ From: OPERATOR_PHONE, Body: "hello" }),
  );
  assertStringIncludes(await operator.text(), "No active conversation");
  assertEquals(writes.length, 0);
  const optout = await handler(
    await request({ OptOutType: "STOP", Body: "STOP" }),
  );
  assertStringIncludes(await optout.text(), "do not reply");
  assertEquals(writes.filter((x) => x.table === "leads").length, 0);
  assertEquals(analyticsCalls, 0);
});

Deno.test("background registration failure cannot fail the customer relay", async () => {
  reset();
  runtime.EdgeRuntime.waitUntil = (task) => {
    tasks.push(task);
    throw new Error("fixture runtime failure");
  };
  try {
    const response = await fastResponse(await request());
    assertEquals(response.status, 200);
    assertStringIncludes(
      await response.text(),
      `<Message to="${OPERATOR_PHONE}">`,
    );
    await Promise.all(tasks);
    assertEquals(signal?.aborted, true);
  } finally {
    await cleanup();
  }
});
