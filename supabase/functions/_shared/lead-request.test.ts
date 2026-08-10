import { assertEquals } from "jsr:@std/assert@1";
import {
  leadFailureResponse,
  leadHoneypotFilled,
  LeadRequestError,
  leadSuccessResponse,
  MAX_LEAD_REQUEST_BYTES,
  normalizeLeadEmail,
  normalizeUsPhone,
  parseLeadRequest,
  validateLeadContact,
} from "./lead-request.ts";

async function expectRequestError(req: Request, code: string, status: number) {
  try {
    await parseLeadRequest(req);
    throw new Error(`expected ${code}`);
  } catch (error) {
    if (!(error instanceof LeadRequestError)) throw error;
    assertEquals(error.code, code);
    assertEquals(error.status, status);
  }
}

Deno.test("parses the bounded JavaScript JSON submission contract", async () => {
  const parsed = await parseLeadRequest(
    new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Homeowner",
        phone: "435-555-0100",
        sms_consent: false,
        company_website: "",
      }),
    }),
  );
  assertEquals(parsed, {
    payload: {
      name: "Test Homeowner",
      phone: "435-555-0100",
      sms_consent: false,
      company_website: "",
    },
    nativeForm: false,
  });
});

Deno.test("parses a no-JavaScript form without putting PII in the URL", async () => {
  const parsed = await parseLeadRequest(
    new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        name: "Fallback Test",
        phone: "4355550100",
        sms_consent: "yes",
        company_website: "",
      }),
    }),
  );
  assertEquals(parsed.nativeForm, true);
  assertEquals(parsed.payload.phone, "4355550100");
  assertEquals(parsed.payload.sms_consent, "yes");
  assertEquals(parsed.payload.company_website, "");
});

Deno.test("requires a real name and at least one valid contact path", () => {
  assertEquals(validateLeadContact({ name: "   ", phone: "4355550100" }), {
    ok: false,
    error: "name_required",
  });
  assertEquals(validateLeadContact({ name: "123", phone: "4355550100" }), {
    ok: false,
    error: "name_required",
  });
  assertEquals(
    validateLeadContact({
      name: "Valid Homeowner",
      phone: "12345",
      email: "not-an-email",
    }),
    { ok: false, error: "valid_contact_required" },
  );
  assertEquals(
    validateLeadContact({
      first_name: "Landon",
      last_name: "Yokers",
      phone: "(435) 555-0100",
    }),
    {
      ok: true,
      name: "Landon Yokers",
      email: "",
      phone: "+14355550100",
    },
  );
  assertEquals(
    validateLeadContact({
      name: "Email Homeowner",
      email: "owner+roof@example.com",
      phone: "bad",
    }),
    {
      ok: true,
      name: "Email Homeowner",
      email: "owner+roof@example.com",
      phone: "",
    },
  );
});

Deno.test("US phone and email validators reject malformed contacts", () => {
  for (
    const invalid of [
      "1234567890",
      "4351550100",
      "+24355550100",
      "435-555-0100 ext 2",
      "43555501000",
    ]
  ) {
    assertEquals(normalizeUsPhone(invalid), null, `accepted ${invalid}`);
  }
  assertEquals(normalizeUsPhone("+1 (435) 555-0100"), "+14355550100");

  for (
    const invalid of [
      "missing-at.example.com",
      "a@localhost",
      ".local@example.com",
      "local..part@example.com",
      "local@-example.com",
    ]
  ) {
    assertEquals(normalizeLeadEmail(invalid), null, `accepted ${invalid}`);
  }
  assertEquals(
    normalizeLeadEmail("roof.owner@example.com"),
    "roof.owner@example.com",
  );
});

Deno.test("honeypot detects bot-filled values but ignores the blank field", () => {
  assertEquals(leadHoneypotFilled({ company_website: "" }), false);
  assertEquals(leadHoneypotFilled({ company_website: "   " }), false);
  assertEquals(
    leadHoneypotFilled({ company_website: "https://spam.example" }),
    true,
  );
});

Deno.test("rejects oversized bodies, oversized fields, duplicate and unknown fields", async () => {
  await expectRequestError(
    new Request("https://example.test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(MAX_LEAD_REQUEST_BYTES + 1),
      },
      body: "{}",
    }),
    "lead_request_too_large",
    413,
  );
  await expectRequestError(
    new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(20_001) }),
    }),
    "lead_field_too_large",
    413,
  );
  await expectRequestError(
    new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=First&name=Second&phone=4355550100",
    }),
    "duplicate_lead_field",
    400,
  );
  await expectRequestError(
    new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", unexpected: "field" }),
    }),
    "unknown_lead_field",
    400,
  );
});

Deno.test("native success and validation failure remain useful without JavaScript", () => {
  const success = leadSuccessResponse(true);
  assertEquals(success.status, 303);
  assertEquals(
    success.headers.get("location"),
    "https://www.framerestorationutah.com/thank-you?lead=success&form=fallback",
  );

  const failure = leadFailureResponse(true, 400, "valid_contact_required");
  assertEquals(failure.status, 400);
  assertEquals(failure.headers.get("content-type"), "text/html; charset=utf-8");
});

Deno.test("rejects unsupported and non-object request payloads", async () => {
  await expectRequestError(
    new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "name=leak",
    }),
    "unsupported_lead_content_type",
    415,
  );
  await expectRequestError(
    new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    }),
    "invalid_lead_payload",
    400,
  );
});
