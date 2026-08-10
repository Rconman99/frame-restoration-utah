import { assertEquals } from "jsr:@std/assert@1";
import {
  MAX_RESEND_WEBHOOK_BYTES,
  readBoundedWebhookBody,
  WebhookRequestError,
} from "./webhook-request.ts";

async function expectRequestError(
  request: Request,
  code: string,
  status: number,
) {
  try {
    await readBoundedWebhookBody(request);
    throw new Error(`expected ${code}`);
  } catch (error) {
    if (!(error instanceof WebhookRequestError)) throw error;
    assertEquals(error.code, code);
    assertEquals(error.status, status);
  }
}

Deno.test("reads the exact bounded UTF-8 webhook body", async () => {
  const payload = JSON.stringify({ type: "email.delivered", data: {} });
  const request = new Request("https://example.test", {
    method: "POST",
    body: payload,
  });
  assertEquals(await readBoundedWebhookBody(request), payload);
});

Deno.test("rejects an oversized declared webhook body before reading", async () => {
  await expectRequestError(
    new Request("https://example.test", {
      method: "POST",
      headers: {
        "Content-Length": String(MAX_RESEND_WEBHOOK_BYTES + 1),
      },
      body: "{}",
    }),
    "webhook_body_too_large",
    413,
  );
});

Deno.test("rejects chunked bodies that cross the webhook cap", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_RESEND_WEBHOOK_BYTES));
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    }),
  });
  await expectRequestError(request, "webhook_body_too_large", 413);
});

Deno.test("rejects malformed length and invalid UTF-8", async () => {
  await expectRequestError(
    new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Length": "1,2" },
      body: "{}",
    }),
    "invalid_content_length",
    400,
  );
  await expectRequestError(
    new Request("https://example.test", {
      method: "POST",
      body: new Uint8Array([0xc3, 0x28]),
    }),
    "invalid_utf8",
    400,
  );
});
